import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError } from '@coreslopper/core';

export const WORKSPACE_MARKER = 'coreslopper.workspace.json';

export interface WorkspaceMarker {
  version: 1;
  runtimeVersion: string;
  created: string;
  project?: string;
  /** Last `coreslopper update`. */
  updated?: string;
  /** SHA-256 of every workflow file as installed; the baseline for `coreslopper update`. */
  files?: Record<string, string>;
}

function readPackage(path: string): { name?: string; version?: string } | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as { name?: string; version?: string };
  } catch {
    return undefined;
  }
}

export function isWorkspace(directory: string): boolean {
  const root = resolve(directory);
  if (existsSync(join(root, WORKSPACE_MARKER))) return true;
  const packageJson = readPackage(join(root, 'package.json'));
  return packageJson?.name === 'coreslopper' && existsSync(join(root, 'templates', 'project'));
}

export function findWorkspaceRoot(start = process.cwd()): string | undefined {
  let current = resolve(start);
  while (true) {
    if (isWorkspace(current)) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

export function requireWorkspaceRoot(start = process.cwd()): string {
  const root = findWorkspaceRoot(start);
  if (!root) {
    throw new ValidationError(
      `No coreslopper workspace found from ${start}. Run "npx coreslopper init" to create one.`,
    );
  }
  return root;
}

/**
 * The package that contains this file. In development it is the repository
 * root; in an npx install it is the package root that contains dist/.
 */
export function ownPackageRoot(): string {
  let current = dirname(fileURLToPath(import.meta.url));
  while (true) {
    const packageJson = readPackage(join(current, 'package.json'));
    if (packageJson?.name === 'coreslopper') return current;
    const parent = dirname(current);
    if (parent === current) return process.cwd();
    current = parent;
  }
}

export function ownVersion(): string {
  return readPackage(join(ownPackageRoot(), 'package.json'))?.version ?? '0.1.0';
}

export function runtimeDir(): string | undefined {
  const candidate = join(ownPackageRoot(), 'runtime');
  return existsSync(join(candidate, 'templates', 'project')) ? candidate : undefined;
}

/** Load .env without overriding variables that are already set. */
export function loadWorkspaceEnv(root: string): void {
  const envPath = join(root, '.env');
  if (!existsSync(envPath) || typeof process.loadEnvFile !== 'function') return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    // A malformed .env should not prevent read-only commands from running.
    // `coreslopper doctor` reports the problem separately.
  }
}

export function listProjects(root: string): string[] {
  const projectsDir = join(root, 'projects');
  if (!existsSync(projectsDir)) return [];
  return readdirSync(projectsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && existsSync(join(projectsDir, entry.name, 'project.yaml')))
    .map((entry) => entry.name)
    .sort();
}

/**
 * Resolve an optional project argument. With no argument, prefer the only
 * non-demo project; otherwise ask for an explicit project.
 */
export function resolveProjectArg(root: string, arg?: string): string {
  if (arg) {
    const direct = resolve(process.cwd(), arg);
    if (existsSync(join(direct, 'project.yaml'))) return direct;
    const named = join(root, 'projects', arg);
    if (existsSync(join(named, 'project.yaml'))) return named;
    throw new ValidationError(`Project not found: ${arg}`);
  }

  const projects = listProjects(root);
  const candidates = projects.filter((project) => project !== 'demo');
  if (candidates.length === 1) return join(root, 'projects', candidates[0]!);
  if (projects.length === 1) return join(root, 'projects', projects[0]!);
  if (projects.length === 0) {
    throw new ValidationError('No projects found. Create one with "coreslopper new <slug> --budget <usd>".');
  }
  throw new ValidationError(
    `Multiple projects found: ${projects.join(', ')}. Pass one explicitly, for example "coreslopper status ${candidates[0] ?? projects[0]}".`,
  );
}
