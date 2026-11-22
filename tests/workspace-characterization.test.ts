// Characterization tests from the adoption of the workspace slice (2026-11-22).
// They pin what init, update and the workspace check do today; they do not assert what they should do.
// The runtime classification's pin is in tests/runtime-files.test.ts, which does not ship.
import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { initWorkspace } from '../packages/cli/src/init.ts';
import { updateWorkspace } from '../packages/cli/src/update.ts';
import { WORKSPACE_MARKER, isWorkspace, ownVersion } from '../packages/cli/src/workspace.ts';

const temporary: string[] = [];

async function temporaryDir(prefix: string): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), prefix));
  temporary.push(directory);
  return directory;
}

async function put(root: string, path: string, content: string): Promise<void> {
  await mkdir(dirname(join(root, path)), { recursive: true });
  await writeFile(join(root, path), content);
}

async function runtimeFixture(version: string, files: Record<string, string>): Promise<string> {
  const runtime = await temporaryDir('coreslopper-runtime-');
  await mkdir(join(runtime, 'config'), { recursive: true });
  await cp(join(process.cwd(), 'config', 'defaults.yaml'), join(runtime, 'config', 'defaults.yaml'));
  await cp(join(process.cwd(), 'templates', 'project'), join(runtime, 'templates', 'project'), { recursive: true });
  await put(runtime, 'package.json', `${JSON.stringify({ name: 'coreslopper', version, private: true })}\n`);
  for (const [path, content] of Object.entries(files)) await put(runtime, path, content);
  return runtime;
}

async function workspaceFrom(runtime: string): Promise<string> {
  const target = await temporaryDir('coreslopper-workspace-');
  await initWorkspace({ targetDir: target, runtimeDir: runtime, install: false, git: false });
  return target;
}

const read = (root: string, path: string) => readFile(join(root, path), 'utf8');
const marker = async (root: string) =>
  JSON.parse(await read(root, WORKSPACE_MARKER)) as { runtimeVersion: string; files: Record<string, string> };

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('workspace characterization', () => {
  it('keeps an unmerged conflict silently at the next update and leaves its conflict copy', async () => {
    const target = await workspaceFrom(await runtimeFixture('9.9.0', { 'skills/a.md': 'v1\n', 'skills/b.md': 'v1\n' }));
    await writeFile(join(target, 'skills/a.md'), 'mine\n');

    const v2 = await runtimeFixture('9.10.0', { 'skills/a.md': 'v2\n', 'skills/b.md': 'v1\n' });
    const first = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false });
    expect(first.changes).toContainEqual({ path: 'skills/a.md', action: 'conflict' });

    // The baseline now holds upstream's v2, so the unmerged local file counts as a local change.
    const v3 = await runtimeFixture('9.11.0', { 'skills/a.md': 'v2\n', 'skills/b.md': 'v3\n' });
    const second = await updateWorkspace({ targetDir: target, runtimeDir: v3, install: false });
    expect(second.changes.map((change) => change.path)).not.toContain('skills/a.md');
    expect(second.keptLocal).toEqual(['skills/a.md']);
    expect(await read(target, 'skills/a.md')).toBe('mine\n');
    expect(await read(target, 'skills/a.md.coreslopper-new')).toBe('v2\n');
  });

  it('takes a local edit silently when upstream ships the same bytes', async () => {
    const target = await workspaceFrom(await runtimeFixture('9.9.0', { 'skills/a.md': 'v1\n' }));
    await writeFile(join(target, 'skills/a.md'), 'ported upstream\n');

    const v2 = await runtimeFixture('9.10.0', { 'skills/a.md': 'ported upstream\n' });
    const result = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false });
    expect(result.changes.map((change) => change.path)).not.toContain('skills/a.md');
    expect(result.keptLocal).toEqual([]);
    expect(existsSync(join(target, 'skills/a.md.coreslopper-new'))).toBe(false);
  });

  it('records the CLI’s own version at init and the runtime’s version at update', async () => {
    const runtime = await runtimeFixture('9.9.0', { 'skills/a.md': 'v1\n' });
    const target = await workspaceFrom(runtime);
    expect((await marker(target)).runtimeVersion).toBe(ownVersion());

    await updateWorkspace({ targetDir: target, runtimeDir: runtime, install: false, force: true });
    expect((await marker(target)).runtimeVersion).toBe('9.9.0');
  });

  it('counts a package named coreslopper with a project template as a workspace without a marker', async () => {
    const directory = await temporaryDir('coreslopper-markerless-');
    await put(directory, 'package.json', `${JSON.stringify({ name: 'coreslopper' })}\n`);
    expect(isWorkspace(directory)).toBe(false);
    await mkdir(join(directory, 'templates', 'project'), { recursive: true });
    expect(isWorkspace(directory)).toBe(true);
  });
});
