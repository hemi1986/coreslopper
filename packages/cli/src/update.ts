import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { chmod, copyFile, mkdir, readFile, readdir, rm, rmdir, stat } from 'node:fs/promises';
import { dirname, join, posix, relative, resolve, sep } from 'node:path';
import { ValidationError } from '@coreslopper/core';
import { runSetup } from './tools.js';
import {
  WORKSPACE_MARKER,
  isWorkspace,
  ownVersion,
  runtimeDir as defaultRuntimeDir,
  type WorkspaceMarker,
} from './workspace.js';

/** Directories that never belong to the shipped workflow. */
export const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.tools',
  '.vitest',
  '.venv',
  '__pycache__',
  '.pytest_cache',
  'node_modules',
  'dist',
  'runtime',
  'tmp',
]);

/** Suffix for the upstream version of a file that was changed on both sides. */
export const CONFLICT_SUFFIX = '.coreslopper-new';

/** Files the workspace owns after init; update never touches them. */
const USER_OWNED_FILES = new Set(['.mcp.json', WORKSPACE_MARKER, 'GETTING_STARTED.md']);

/** Files that are regenerated locally and always follow upstream. */
const ALWAYS_UPSTREAM_FILES = new Set(['package-lock.json']);

/** Upstream files below these prefixes are added when missing but never overwritten or removed. */
const USER_OWNED_PREFIXES = ['projects/'];

export function isRuntimePath(path: string): boolean {
  if (!path) return true;
  const segments = path.split('/');
  if (segments.some((segment) => SKIPPED_DIRECTORIES.has(segment))) return false;
  if (segments.at(-1)?.endsWith(CONFLICT_SUFFIX)) return false;
  if (path === '.env' || (path.startsWith('.env.') && path !== '.env.example')) return false;
  return true;
}

function toPosix(path: string): string {
  return sep === '/' ? path : path.split(sep).join(posix.sep);
}

/** List runtime files as POSIX paths relative to the runtime root. */
export async function listRuntimeFiles(runtime: string): Promise<string[]> {
  const files: string[] = [];
  async function walk(directory: string): Promise<void> {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = join(directory, entry.name);
      const path = toPosix(relative(runtime, absolute));
      if (!isRuntimePath(path)) continue;
      if (entry.isDirectory()) await walk(absolute);
      else if (entry.isFile()) files.push(path);
    }
  }
  await walk(runtime);
  return files.sort();
}

export async function hashFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

/** Hash every runtime file; the result is the baseline for the next update. */
export async function hashRuntime(runtime: string): Promise<Record<string, string>> {
  const hashes: Record<string, string> = {};
  for (const file of await listRuntimeFiles(runtime)) hashes[file] = await hashFile(join(runtime, file));
  return hashes;
}

export function readMarker(target: string): WorkspaceMarker | undefined {
  const path = join(target, WORKSPACE_MARKER);
  if (!existsSync(path)) return undefined;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as WorkspaceMarker;
  } catch {
    return undefined;
  }
}

export function writeMarkerFile(target: string, marker: WorkspaceMarker): void {
  writeFileSync(join(target, WORKSPACE_MARKER), `${JSON.stringify(marker, null, 2)}\n`, 'utf8');
}

/** Compare two `x.y.z[-pre]` versions; prerelease tags are ignored. */
export function compareVersions(a: string, b: string): number {
  const parse = (value: string) => value.split('-')[0]!.split('.').map((part) => Number(part) || 0);
  const left = parse(a);
  const right = parse(b);
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const difference = (left[index] ?? 0) - (right[index] ?? 0);
    if (difference !== 0) return Math.sign(difference);
  }
  return 0;
}

export type UpdateAction =
  | 'added'
  | 'updated'
  | 'removed'
  | 'conflict'
  | 'overwritten'
  | 'kept-removed-upstream'
  | 'skipped-deleted-locally';

export interface UpdateChange {
  path: string;
  action: UpdateAction;
}

export interface UpdateOptions {
  targetDir: string;
  runtimeDir?: string;
  /** Overwrite locally changed files and allow a downgrade. */
  force?: boolean;
  dryRun?: boolean;
  install?: boolean;
  onProgress?: (message: string) => void;
}

export interface UpdateResult {
  targetDir: string;
  fromVersion?: string;
  toVersion: string;
  /** False when the workspace had no recorded baseline (created before `update` existed). */
  hadBaseline: boolean;
  changes: UpdateChange[];
  /** Locally changed files that upstream did not touch. */
  keptLocal: number;
  dryRun: boolean;
  installed: boolean;
  uvSynced: boolean;
  dirtyGit: boolean;
  warnings: string[];
}

function resolveRuntime(runtimeDir?: string): string {
  const runtime = runtimeDir ? resolve(runtimeDir) : defaultRuntimeDir();
  if (!runtime || !existsSync(join(runtime, 'templates', 'project'))) {
    throw new ValidationError('Runtime assets not found. Run "npx coreslopper@latest update" from the workspace.');
  }
  return runtime;
}

function runtimeVersion(runtime: string): string {
  try {
    const packageJson = JSON.parse(readFileSync(join(runtime, 'package.json'), 'utf8')) as { version?: string };
    return packageJson.version ?? ownVersion();
  } catch {
    return ownVersion();
  }
}

function gitIsDirty(target: string): boolean {
  if (!existsSync(join(target, '.git'))) return false;
  const result = spawnSync('git', ['status', '--porcelain'], { cwd: target, encoding: 'utf8' });
  return result.status === 0 && result.stdout.trim().length > 0;
}

async function install(source: string, destination: string): Promise<void> {
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(source, destination);
  await chmod(destination, (await stat(source)).mode).catch(() => undefined);
}

/** Remove now-empty parent directories of a deleted file, up to the workspace root. */
async function pruneEmptyDirectories(target: string, file: string): Promise<void> {
  let directory = dirname(join(target, file));
  while (directory !== target && directory.startsWith(target)) {
    if ((await readdir(directory)).length > 0) return;
    await rmdir(directory);
    directory = dirname(directory);
  }
}

export async function updateWorkspace(options: UpdateOptions): Promise<UpdateResult> {
  const target = resolve(options.targetDir);
  const runtime = resolveRuntime(options.runtimeDir);

  if (!isWorkspace(target)) {
    throw new ValidationError(`No coreslopper workspace found at ${target}. Create one with "npx coreslopper init".`);
  }
  if (existsSync(join(target, 'scripts', 'build-runtime.mjs')) || existsSync(join(target, 'tsup.config.ts'))) {
    throw new ValidationError('This is the coreslopper source repository. Update it with git, not "coreslopper update".');
  }

  const dirtyGit = gitIsDirty(target);
  const marker = readMarker(target);
  const fromVersion = marker?.runtimeVersion;
  const toVersion = runtimeVersion(runtime);
  if (fromVersion && compareVersions(toVersion, fromVersion) < 0 && !options.force) {
    throw new ValidationError(
      `The workspace runs coreslopper ${fromVersion}, newer than ${toVersion}. Use "npx coreslopper@latest update", or pass --force to downgrade.`,
    );
  }

  const baseline = marker?.files;
  const hadBaseline = baseline !== undefined;
  const base = baseline ?? {};
  const dryRun = Boolean(options.dryRun);
  const changes: UpdateChange[] = [];
  const nextFiles: Record<string, string> = {};
  let keptLocal = 0;

  options.onProgress?.(`Comparing the workspace with coreslopper ${toVersion}...`);
  const upstream = await hashRuntime(runtime);

  const record = (path: string, action: UpdateAction) => changes.push({ path, action });
  const apply = async (path: string) => {
    if (!dryRun) await install(join(runtime, path), join(target, path));
  };

  for (const [path, upstreamHash] of Object.entries(upstream)) {
    nextFiles[path] = upstreamHash;
    if (USER_OWNED_FILES.has(path)) continue;

    const local = join(target, path);
    const localExists = existsSync(local);
    const baseHash = base[path];

    if (!localExists) {
      if (baseHash !== undefined && !ALWAYS_UPSTREAM_FILES.has(path)) {
        // Deleted on purpose; mention it only when upstream changed the file.
        if (upstreamHash !== baseHash) record(path, 'skipped-deleted-locally');
        continue;
      }
      await apply(path);
      record(path, 'added');
      continue;
    }

    const localHash = await hashFile(local);
    if (localHash === upstreamHash) continue;
    if (USER_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;

    if (ALWAYS_UPSTREAM_FILES.has(path) || localHash === baseHash) {
      await apply(path);
      record(path, 'updated');
      continue;
    }

    if (baseHash !== undefined && upstreamHash === baseHash) {
      // Changed locally, unchanged upstream: the local version wins.
      keptLocal += 1;
      continue;
    }

    // Changed on both sides, or no baseline to tell.
    if (options.force) {
      await apply(path);
      record(path, 'overwritten');
    } else {
      if (!dryRun) await install(join(runtime, path), `${local}${CONFLICT_SUFFIX}`);
      record(path, 'conflict');
    }
  }

  for (const [path, baseHash] of Object.entries(base)) {
    if (path in upstream || USER_OWNED_FILES.has(path)) continue;
    if (USER_OWNED_PREFIXES.some((prefix) => path.startsWith(prefix))) continue;
    const local = join(target, path);
    if (!existsSync(local)) continue;
    if ((await hashFile(local)) === baseHash) {
      if (!dryRun) {
        await rm(local);
        await pruneEmptyDirectories(target, path);
      }
      record(path, 'removed');
    } else {
      record(path, 'kept-removed-upstream');
    }
  }

  const warnings: string[] = [];
  if (dirtyGit && !dryRun) {
    warnings.push('The workspace had uncommitted changes before the update; "git diff" now mixes them with the update.');
  }
  if (!hadBaseline) {
    warnings.push(
      'This workspace has no recorded baseline, so every file that differs from upstream counts as a local change. Review the conflicts, or commit and rerun with --force.',
    );
  }

  let installed = false;
  let uvSynced = false;
  if (!dryRun) {
    writeMarkerFile(target, {
      version: 1,
      runtimeVersion: toVersion,
      created: marker?.created ?? new Date().toISOString(),
      ...(marker?.project ? { project: marker.project } : {}),
      updated: new Date().toISOString(),
      files: nextFiles,
    });

    if (options.install !== false && changes.length > 0) {
      options.onProgress?.('Installing Node and Python dependencies...');
      try {
        const setup = runSetup(target);
        installed = setup.npm;
        uvSynced = setup.uv;
        if (setup.warning) warnings.push(setup.warning);
      } catch (error) {
        warnings.push(`Dependency installation failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  return {
    targetDir: target,
    fromVersion,
    toVersion,
    hadBaseline,
    changes,
    keptLocal,
    dryRun,
    installed,
    uvSynced,
    dirtyGit,
    warnings,
  };
}

const LABELS: Record<UpdateAction, string> = {
  added: '+ added',
  updated: '~ updated',
  removed: '- removed',
  overwritten: '! overwritten',
  conflict: '! conflict',
  'kept-removed-upstream': '= kept (removed upstream, changed locally)',
  'skipped-deleted-locally': '= skipped (deleted locally)',
};

export function printUpdateSummary(result: UpdateResult): void {
  const from = result.fromVersion ?? 'unknown';
  const verb = result.dryRun ? 'Would update' : 'Updated';
  console.log(`✔ ${verb} ${result.targetDir}: coreslopper ${from} → ${result.toVersion}`);
  if (result.changes.length === 0) console.log('  Workflow files are already up to date.');
  for (const change of result.changes) {
    const suffix = change.action === 'conflict' ? `  → ${change.path}${CONFLICT_SUFFIX}` : '';
    console.log(`  ${LABELS[change.action]}: ${change.path}${suffix}`);
  }
  if (result.keptLocal > 0) console.log(`  ${result.keptLocal} locally changed file(s) kept; upstream did not change them.`);
  for (const warning of result.warnings) console.warn(`  ! ${warning}`);

  const conflicts = result.changes.filter((change) => change.action === 'conflict').length;
  if (conflicts > 0) {
    console.log('');
    console.log(
      `${conflicts} file(s) changed both locally and upstream. Merge each "${CONFLICT_SUFFIX}" file into the original, then delete it.`,
    );
  }
  if (result.dryRun) {
    console.log('');
    console.log('Dry run: nothing was written.');
  } else if (result.changes.length > 0 && !result.installed) {
    console.log('');
    console.log('Next: npm install && npm run python:sync');
  }
}
