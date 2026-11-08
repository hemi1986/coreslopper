#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook.
 *
 * Reads the hook payload from stdin, finds the edited file, and validates
 * project artifacts with the same CLI the user runs. Exit code 2 blocks the
 * tool call and shows stderr to the agent.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';

const TRACKED = new Set([
  'storyboard.yaml',
  'timing.json',
  'timing.overrides.json',
  'project.yaml',
  'state.json',
  'style.yaml',
  'characters.yaml',
]);

function readStdin() {
  return new Promise((resolvePromise) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => {
      data += chunk;
    });
    process.stdin.on('end', () => resolvePromise(data));
  });
}

function findRepoRoot(start) {
  let current = resolve(start);
  while (true) {
    const packagePath = join(current, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
        if (pkg.name === 'coreslopper') return current;
      } catch {
        // Keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

function findProjectRoot(file) {
  let current = dirname(resolve(file));
  while (true) {
    if (existsSync(join(current, 'project.yaml'))) return current;
    const parent = dirname(current);
    if (parent === current) return undefined;
    current = parent;
  }
}

const raw = await readStdin();
let payload;
try {
  payload = JSON.parse(raw);
} catch {
  process.exit(0);
}

const file = payload?.tool_input?.file_path ?? payload?.tool_input?.path;
if (!file) process.exit(0);
if (!TRACKED.has(basename(file))) process.exit(0);

const projectRoot = findProjectRoot(file);
if (!projectRoot || !projectRoot.split(sep).includes('projects')) process.exit(0);

const repoRoot = findRepoRoot(file) ?? process.cwd();
try {
  execFileSync('npm', ['run', '--silent', 'cli', '--', 'validate-file', file], {
    cwd: repoRoot,
    stdio: 'pipe',
    encoding: 'utf8',
  });
} catch (error) {
  const output = `${error.stdout ?? ''}${error.stderr ?? ''}`.trim();
  console.error(output || `Validation failed for ${file}`);
  process.exit(2);
}
