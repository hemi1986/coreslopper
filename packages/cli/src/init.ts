import { spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { chmod, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { ValidationError } from '@coreslopper/core';
import { createProject } from './new-project.js';
import { SKIPPED_DIRECTORIES, hashRuntime } from './update.js';
import {
  commandExists,
  detectTools,
  installClaudeCode,
  installFfmpeg,
  installPython,
  installUv,
  missingTools,
  runSetup,
} from './tools.js';
import {
  WORKSPACE_MARKER,
  ownPackageRoot,
  ownVersion,
  runtimeDir as defaultRuntimeDir,
  type WorkspaceMarker,
} from './workspace.js';

export type VisualProvider = 'fal' | 'higgsfield' | 'mock';

export interface FirstProjectOptions {
  slug: string;
  title?: string;
  budget: number;
  image: VisualProvider;
  video: VisualProvider;
}

export interface InitOptions {
  targetDir: string;
  runtimeDir?: string;
  force?: boolean;
  install?: boolean;
  git?: boolean;
  tools?: boolean;
  project?: FirstProjectOptions | null;
  falKey?: string;
  higgsfieldKey?: string;
  onProgress?: (message: string) => void;
}

export interface InitResult {
  targetDir: string;
  runtimeVersion: string;
  projectSlug?: string;
  installed: boolean;
  uvSynced: boolean;
  gitInitialized: boolean;
  warnings: string[];
}

export function sanitizeSlug(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'my-video';
}

export function defaultProjectSlug(targetDir: string): string {
  const name = basename(resolve(targetDir));
  return name && name !== '.' && name !== sep ? sanitizeSlug(name) : 'my-video';
}

export function upsertEnv(content: string, key: string, value: string): string {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(key)) throw new ValidationError(`Invalid environment variable name: ${key}`);
  if (/[\r\n]/.test(value)) throw new ValidationError(`Environment value for ${key} must be a single line.`);

  const line = `${key}=${value}`;
  const pattern = new RegExp(`^${key}=.*$`, 'm');
  if (pattern.test(content)) return content.replace(pattern, () => line);
  return `${content.trimEnd()}\n${line}\n`;
}

export async function isDirectoryEmpty(path: string): Promise<boolean> {
  if (!existsSync(path)) return true;
  if (!(await stat(path)).isDirectory()) return false;
  const entries = await readdir(path);
  return entries.filter((entry) => entry !== '.DS_Store').length === 0;
}

function isInside(parent: string, child: string): boolean {
  if (parent === child) return true;
  const path = relative(parent, child);
  return path !== '' && !path.startsWith('..') && !isAbsolute(path);
}

function resolveRuntime(options: InitOptions): string {
  const runtime = options.runtimeDir ? resolve(options.runtimeDir) : defaultRuntimeDir();
  if (!runtime || !existsSync(join(runtime, 'templates', 'project'))) {
    throw new ValidationError(
      'Runtime assets not found. Use "npx coreslopper init" to create a workspace, or run "npm run build:runtime" in the upstream repository.',
    );
  }
  return runtime;
}

function shouldCopy(source: string, runtime: string): boolean {
  const path = relative(runtime, source);
  if (!path) return true;
  const segments = path.split(sep);
  if (segments.some((segment) => SKIPPED_DIRECTORIES.has(segment))) return false;
  if (path === '.env' || (segments[0] === '.env' && path !== '.env.example')) return false;
  return true;
}

async function copyRuntime(runtime: string, target: string): Promise<void> {
  await mkdir(target, { recursive: true });
  await cp(runtime, target, {
    recursive: true,
    force: true,
    errorOnExist: false,
    filter: (source) => shouldCopy(source, runtime),
  });
}

async function ensureEnvFile(
  target: string,
  falKey?: string,
  higgsfieldKey?: string,
): Promise<void> {
  const envPath = join(target, '.env');
  let content: string;
  if (existsSync(envPath)) {
    content = await readFile(envPath, 'utf8');
  } else {
    const examplePath = join(target, '.env.example');
    content = existsSync(examplePath)
      ? await readFile(examplePath, 'utf8')
      : '# Local secrets. This file is gitignored.\n';
  }
  if (falKey) content = upsertEnv(content, 'FAL_KEY', falKey.trim());
  if (!/^FAL_KEY=/m.test(content)) content = `${content.trimEnd()}\nFAL_KEY=\n`;
  if (higgsfieldKey) content = upsertEnv(content, 'HIGGSFIELD_API_KEY', higgsfieldKey.trim());
  if (!/^HIGGSFIELD_API_KEY=/m.test(content)) {
    content = `${content.trimEnd()}\nHIGGSFIELD_API_KEY=\n`;
  }
  await writeFile(envPath, content, { encoding: 'utf8', mode: 0o600 });
  await chmod(envPath, 0o600).catch(() => undefined);
}

function writeFileSyncJson(path: string, value: unknown): void {
  // Small synchronous write keeps init call sites simple.
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeMarker(target: string, files: Record<string, string>, projectSlug?: string): void {
  const marker: WorkspaceMarker = {
    version: 1,
    runtimeVersion: ownVersion(),
    created: new Date().toISOString(),
    ...(projectSlug ? { project: projectSlug } : {}),
    files,
  };
  writeFileSyncJson(join(target, WORKSPACE_MARKER), marker);
}

function initGit(target: string): boolean {
  if (existsSync(join(target, '.git')) || !commandExists('git')) return false;
  const result = spawnSync('git', ['init', '-b', 'main'], { cwd: target, stdio: 'inherit' });
  if (result.status === 0) return true;
  const fallback = spawnSync('git', ['init'], { cwd: target, stdio: 'inherit' });
  return fallback.status === 0;
}

async function createFirstProject(
  target: string,
  project: FirstProjectOptions,
  warnings: string[],
): Promise<string | undefined> {
  const projectDir = join(target, 'projects', project.slug);
  if (existsSync(projectDir)) {
    warnings.push(`Project "${project.slug}" already exists; the bundled project was kept.`);
    return undefined;
  }
  await createProject({
    slug: project.slug,
    title: project.title,
    budget: project.budget,
    root: target,
    imageProvider: project.image,
    videoProvider: project.video,
  });
  return project.slug;
}

function gettingStarted(target: string, result: InitResult, options: InitOptions): string {
  const project = options.project;
  const lines = [
    '# Your coreslopper workspace',
    '',
    `Created ${new Date().toISOString()} with coreslopper ${result.runtimeVersion}.`,
    '',
    '## Workspace',
    '',
    `- Location: \`${target}\``,
    ...(project
      ? [
          `- First project: \`${project.slug}\` (budget $${project.budget.toFixed(2)}, visuals: ${project.image})`,
        ]
      : ['- No first project yet. Create one with `npm run cli -- new <slug> --budget 50`.']),
    '',
    '## Next steps',
    '',
    '```bash',
    ...(result.installed ? [] : ['npm install']),
    ...(result.uvSynced ? [] : ['npm run python:sync']),
    'npm run cli -- doctor',
    'npm run demo:preview',
    'claude',
    '```',
    '',
    'In Claude Code:',
    '',
    '```text',
    ...(project ? [`/new-video ${project.slug}    # lyrics, song import, brief`] : ['/new-video']),
    '```',
    '',
    '## Credentials',
    '',
    '- fal.ai: `FAL_KEY` in `.env` (gitignored).',
    '- Higgsfield: `HIGGSFIELD_API_KEY` (or `HF_API_KEY_ID` + `HF_API_KEY_SECRET`) in `.env`.',
    '',
    'Bring a finished song: `/new-video` tells you where to put the mix and the vocal stem.',
    '',
    'Generated audio, images, clips, and renders stay in the project folders and are gitignored.',
    '',
  ];
  return lines.join('\n');
}

function ensureTools(target: string, warnings: string[]): void {
  const missing = missingTools(detectTools(target));
  if (missing.length === 0) return;

  if (missing.some((tool) => tool.id === 'node' || tool.id === 'npm')) {
    warnings.push('Node.js 22+ and npm are required. Install them and run "npm install" in the workspace.');
  }
  if (missing.some((tool) => tool.id === 'uv') && !installUv()) {
    warnings.push('uv could not be installed; audio analysis will need it later.');
  }
  if (missing.some((tool) => tool.id === 'python') && commandExists('uv') && !installPython()) {
    warnings.push('Python 3.12 could not be installed; audio analysis will need it later.');
  }
  if (missing.some((tool) => tool.id === 'ffmpeg') && !installFfmpeg(target)) {
    warnings.push('ffmpeg could not be installed; footage and loudness normalization will need it later.');
  }
  if (missing.some((tool) => tool.id === 'claude') && !installClaudeCode()) {
    warnings.push('Claude Code could not be installed; /video-next needs it.');
  }
}

export async function initWorkspace(options: InitOptions): Promise<InitResult> {
  const target = resolve(options.targetDir);
  const runtime = resolveRuntime(options);

  if (existsSync(target) && !(await stat(target)).isDirectory()) {
    throw new ValidationError(`Target exists and is not a directory: ${target}`);
  }
  if (target === parse(target).root || target === homedir()) {
    throw new ValidationError('Choose a dedicated workspace directory, not the filesystem root or your home directory.');
  }
  if (target === ownPackageRoot()) {
    throw new ValidationError('Refusing to initialize a workspace inside the coreslopper package itself.');
  }
  if (isInside(runtime, target)) {
    throw new ValidationError('The workspace cannot be created inside the coreslopper runtime directory.');
  }
  if (
    existsSync(join(target, 'scripts', 'build-runtime.mjs')) ||
    existsSync(join(target, 'tsup.config.ts'))
  ) {
    throw new ValidationError(
      'This directory is the coreslopper source repository. Create the workspace in a different directory.',
    );
  }
  if (!(await isDirectoryEmpty(target)) && !options.force) {
    throw new ValidationError(
      `Target directory is not empty: ${target}. Pass --force to merge the workspace into it.`,
    );
  }

  const warnings: string[] = [];
  options.onProgress?.('Copying the coreslopper runtime...');
  await copyRuntime(runtime, target);

  options.onProgress?.('Writing credentials...');
  await ensureEnvFile(target, options.falKey, options.higgsfieldKey);

  if (options.tools) {
    options.onProgress?.('Installing missing tools...');
    ensureTools(target, warnings);
  }

  const gitInitialized = options.git === false ? false : initGit(target);

  const projectSlug = options.project
    ? await createFirstProject(target, options.project, warnings)
    : undefined;

  writeMarker(target, await hashRuntime(runtime), projectSlug);

  let installed = false;
  let uvSynced = false;
  if (options.install !== false) {
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

  const result: InitResult = {
    targetDir: target,
    runtimeVersion: ownVersion(),
    projectSlug,
    installed,
    uvSynced,
    gitInitialized,
    warnings,
  };

  await writeFile(join(target, 'GETTING_STARTED.md'), gettingStarted(target, result, options), 'utf8');
  return result;
}
