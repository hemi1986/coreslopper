#!/usr/bin/env node
/**
 * Claude Code PostToolUse hook.
 *
 * Reads the hook payload from stdin, finds the edited file, and validates
 * project and series canon artifacts (below `projects/`), library characters (`library/characters/<id>/character.yaml`), and `config/channel.yaml` with the same CLI the user runs. Exit code 2 blocks the
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
  'script.yaml',
  'series.yaml',
  'sets.yaml',
  'upload.yaml',
  'channel.yaml',
  'release-schedule.yaml',
  'calendar.yaml',
  'references.yaml',
  'character.yaml',
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

/** The nearest project folder (project.yaml) or series folder (series.yaml) above a file. */
function findArtifactRoot(file) {
  let current = dirname(resolve(file));
  while (true) {
    if (existsSync(join(current, 'project.yaml'))) return { dir: current, folder: 'projects' };
    if (existsSync(join(current, 'series.yaml'))) return { dir: current, folder: 'projects' };
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
// The agent's answer to a review round: review/rounds/<NNN>.replies.json.
const isReplies = /^\d{3,}\.replies\.json$/.test(basename(file)) && basename(dirname(resolve(file))) === 'rounds';
if (!TRACKED.has(basename(file)) && !isReplies) process.exit(0);

// config/channel.yaml and config/release-schedule.yaml belong to the workspace, not to a project or series;
// so does library/characters/<id>/character.yaml of the character library.
const isChannel = ['channel.yaml', 'release-schedule.yaml'].includes(basename(file)) && basename(dirname(resolve(file))) === 'config';
const characterDir = dirname(resolve(file));
const isLibrary = basename(file) === 'character.yaml' && basename(dirname(characterDir)) === 'characters' && basename(dirname(dirname(characterDir))) === 'library';
if (basename(file) === 'character.yaml' && !isLibrary) process.exit(0);
const workspaceFile = isChannel || isLibrary;
const artifactRoot = workspaceFile ? undefined : findArtifactRoot(file);
if (!workspaceFile && (!artifactRoot || !artifactRoot.dir.split(sep).includes(artifactRoot.folder))) process.exit(0);

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
