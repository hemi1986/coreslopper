#!/usr/bin/env node
/**
 * Build the `runtime/` directory that ships inside the npm package.
 *
 * The runtime is the workspace payload of this repository (tracked files only,
 * classified by `runtime-files.mjs`): the engineering layer stays behind and
 * `workspace/` becomes the workspace root. `npx coreslopper init` copies it
 * into a new workspace. Keeping it as a copy means the generated workspace
 * needs neither git nor network access to GitHub.
 */
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { planRuntime } from './runtime-files.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'runtime');

async function main() {
  let tracked;
  try {
    tracked = execFileSync('git', ['ls-files', '-z', '--cached'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);

    const untracked = execFileSync('git', ['ls-files', '-z', '--others', '--exclude-standard'], {
      cwd: root,
      encoding: 'utf8',
    })
      .split('\0')
      .filter(Boolean);
    if (untracked.length > 0) {
      console.warn(
        `Warning: ${untracked.length} untracked file(s) are not in the runtime. Stage them and rebuild before publishing.`,
      );
    }
  } catch (error) {
    throw new Error(`Could not list tracked files with git. Run this from a git checkout.\n${error}`);
  }

  const plan = planRuntime(tracked);
  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  let copied = 0;
  for (const [file, from] of plan) {
    const source = join(root, from);
    const target = join(destination, file);
    await mkdir(dirname(target), { recursive: true });
    await cp(source, target);
    const sourceStat = await stat(source);
    await chmod(target, sourceStat.mode);
    copied += 1;
  }

  // The workspace is private. Remove publish-only metadata and build steps that
  // only make sense in the upstream repository.
  const runtimePackage = structuredClone(packageJson);
  runtimePackage.private = true;
  delete runtimePackage.bin;
  delete runtimePackage.files;
  delete runtimePackage.publishConfig;
  for (const script of ['build:runtime', 'build:cli', 'build', 'pack:check', 'prepack', 'prepublishOnly', 'dev:workspace']) {
    delete runtimePackage.scripts[script];
  }

  await writeFile(join(destination, 'package.json'), `${JSON.stringify(runtimePackage, null, 2)}\n`, 'utf8');

  // Keep the shipped lockfile consistent with the private workspace package.
  const lockPath = join(destination, 'package-lock.json');
  const lock = JSON.parse(await readFile(lockPath, 'utf8'));
  if (lock.packages?.['']) delete lock.packages[''].bin;
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`, 'utf8');

  console.log(`Runtime: ${copied} files at ${relative(root, destination) || destination}`);
}

await main();
