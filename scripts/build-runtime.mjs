#!/usr/bin/env node
/**
 * Build the `runtime/` directory that ships inside the npm package.
 *
 * The runtime is a self-contained copy of this repository (only tracked files).
 * `npx coreslopper init` copies it into a new workspace. Keeping it as a copy
 * means the generated workspace behaves exactly like a git clone, without
 * requiring the user to have git or network access to GitHub.
 */
import { execFileSync } from 'node:child_process';
import { chmod, cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destination = join(root, 'runtime');

const SKIPPED_FILES = new Set([
  'scripts/build-runtime.mjs',
  'tsup.config.ts',
  '.env',
  // Upstream release automation: in a workspace it would open release PRs and
  // try to publish the coreslopper package from the user's repository.
  '.github/workflows/release.yml',
  'release-please-config.json',
  '.release-please-manifest.json',
]);

const SKIPPED_DIRECTORIES = new Set([
  '.git',
  '.cache',
  '.tools',
  '.vitest',
  'node_modules',
  'dist',
  'runtime',
  'tmp',
]);

function isSkipped(path) {
  if (SKIPPED_FILES.has(path)) return true;
  if (path === '.env' || path.startsWith('.env.')) return path !== '.env.example';
  return [...SKIPPED_DIRECTORIES].some((directory) => path === directory || path.startsWith(`${directory}/`));
}

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

  const packageJson = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  let copied = 0;
  for (const file of tracked) {
    if (isSkipped(file)) continue;
    const source = join(root, file);
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
  for (const script of ['build:runtime', 'build:cli', 'build', 'pack:check', 'prepack', 'prepublishOnly']) {
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
