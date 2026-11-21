#!/usr/bin/env node
/**
 * Create or update a sandbox workspace from this checkout, to try the media
 * workflow (skills, agents, commands, hooks) the way a user gets it.
 *
 *   npm run dev:workspace                        # ../coreslopper-sandbox
 *   npm run dev:workspace -- <dir> [flags...]    # flags go to init or update
 *
 * The sandbox must live outside this repository: Claude Code also loads the
 * CLAUDE.md files of parent directories, so a sandbox inside it would run
 * with the engineering layer's instructions on top of the workspace's.
 */
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [dirArgument, ...flags] = process.argv.slice(2);
const target = resolve(dirArgument && !dirArgument.startsWith('-') ? dirArgument : join(root, '..', 'coreslopper-sandbox'));
const passThrough = dirArgument?.startsWith('-') ? [dirArgument, ...flags] : flags;

const inside = relative(root, target);
if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
  console.error(`The sandbox must be outside this repository (got ${target}).`);
  process.exit(1);
}

const run = (command, args) => execFileSync(command, args, { cwd: root, stdio: 'inherit' });
const npx = join(root, 'packages', 'cli', 'src', 'npx.ts');
const tsx = join(root, 'node_modules', '.bin', 'tsx');

const runtime = join(root, 'runtime');

run(process.execPath, [join(root, 'scripts', 'build-runtime.mjs')]);
if (existsSync(join(target, 'coreslopper.workspace.json'))) {
  run(tsx, [npx, 'update', target, '--runtime', runtime, ...passThrough]);
} else {
  run(tsx, [npx, 'init', target, '--yes', '--skip-project', '--runtime', runtime, ...passThrough]);
}
console.log(`\nSandbox workspace: ${target}\nOpen Claude Code there to try /new-video and /video-next.`);
