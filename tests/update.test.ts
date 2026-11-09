import { afterEach, describe, expect, it } from 'vitest';
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { initWorkspace } from '../packages/cli/src/init.ts';
import { compareVersions, updateWorkspace, type UpdateAction } from '../packages/cli/src/update.ts';

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
  await cp(join(process.cwd(), 'templates', 'project'), join(runtime, 'templates', 'project'), {
    recursive: true,
  });
  await put(runtime, 'package.json', `${JSON.stringify({ name: 'coreslopper', version, private: true })}\n`);
  await put(runtime, '.mcp.json', '{"mcpServers":{}}\n');
  for (const [path, content] of Object.entries(files)) await put(runtime, path, content);
  return runtime;
}

async function workspaceFrom(runtime: string): Promise<string> {
  const target = await temporaryDir('coreslopper-workspace-');
  await initWorkspace({ targetDir: target, runtimeDir: runtime, install: false, git: false });
  return target;
}

function actions(changes: { path: string; action: UpdateAction }[]): Record<string, UpdateAction> {
  // package.json carries the version, so it changes with every release.
  return Object.fromEntries(
    changes.filter((change) => change.path !== 'package.json').map((change) => [change.path, change.action]),
  );
}

const read = (root: string, path: string) => readFile(join(root, path), 'utf8');

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('workspace update', () => {
  it('merges upstream changes with local edits using the recorded baseline', async () => {
    const v1 = await runtimeFixture('9.9.0', {
      'skills/untouched.md': 'v1\n',
      'skills/local-only.md': 'v1\n',
      'skills/both.md': 'v1\n',
      'skills/obsolete.md': 'v1\n',
      'skills/obsolete-edited.md': 'v1\n',
      'skills/deleted-locally.md': 'v1\n',
      'projects/demo/state.json': 'v1\n',
      'package-lock.json': 'lock v1\n',
    });
    const target = await workspaceFrom(v1);

    await writeFile(join(target, 'skills/local-only.md'), 'mine\n');
    await writeFile(join(target, 'skills/both.md'), 'mine\n');
    await writeFile(join(target, 'skills/obsolete-edited.md'), 'mine\n');
    await rm(join(target, 'skills/deleted-locally.md'));
    await writeFile(join(target, 'projects/demo/state.json'), 'rendered locally\n');
    await writeFile(join(target, 'package-lock.json'), 'lock rewritten by npm\n');
    await writeFile(join(target, '.env'), 'FAL_KEY=secret\n');
    const mcpBefore = await read(target, '.mcp.json');

    const v2 = await runtimeFixture('9.10.0', {
      'skills/untouched.md': 'v2\n',
      'skills/local-only.md': 'v1\n',
      'skills/both.md': 'v2\n',
      'skills/deleted-locally.md': 'v2\n',
      'skills/new.md': 'v2\n',
      'projects/demo/state.json': 'v2\n',
      'projects/demo/new-file.md': 'v2\n',
      'package-lock.json': 'lock v2\n',
    });
    const result = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false });

    expect(result.hadBaseline).toBe(true);
    expect(result.toVersion).toBe('9.10.0');
    expect(actions(result.changes)).toEqual({
      'skills/untouched.md': 'updated',
      'skills/both.md': 'conflict',
      'skills/deleted-locally.md': 'skipped-deleted-locally',
      'skills/new.md': 'added',
      'projects/demo/new-file.md': 'added',
      'package-lock.json': 'updated',
      'skills/obsolete.md': 'removed',
      'skills/obsolete-edited.md': 'kept-removed-upstream',
    });
    expect(result.keptLocal).toBe(1);

    expect(await read(target, 'skills/untouched.md')).toBe('v2\n');
    expect(await read(target, 'skills/local-only.md')).toBe('mine\n');
    expect(await read(target, 'skills/both.md')).toBe('mine\n');
    expect(await read(target, 'skills/both.md.coreslopper-new')).toBe('v2\n');
    expect(existsSync(join(target, 'skills/obsolete.md'))).toBe(false);
    expect(await read(target, 'skills/obsolete-edited.md')).toBe('mine\n');
    expect(existsSync(join(target, 'skills/deleted-locally.md'))).toBe(false);
    expect(await read(target, 'projects/demo/state.json')).toBe('rendered locally\n');
    expect(await read(target, 'package-lock.json')).toBe('lock v2\n');
    expect(await read(target, '.env')).toBe('FAL_KEY=secret\n');
    expect(await read(target, '.mcp.json')).toBe(mcpBefore);

    const marker = JSON.parse(await read(target, 'coreslopper.workspace.json')) as {
      runtimeVersion: string;
      files: Record<string, string>;
      updated?: string;
    };
    expect(marker.runtimeVersion).toBe('9.10.0');
    expect(marker.updated).toBeTruthy();
    expect(marker.files['skills/obsolete.md']).toBeUndefined();

    // A second update with the same runtime is a no-op: the conflict was recorded as seen.
    const again = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false });
    expect(again.changes).toEqual([]);
  });

  it('writes nothing in a dry run', async () => {
    const v1 = await runtimeFixture('9.9.0', { 'skills/a.md': 'v1\n' });
    const target = await workspaceFrom(v1);
    const markerBefore = await read(target, 'coreslopper.workspace.json');
    const v2 = await runtimeFixture('9.10.0', { 'skills/a.md': 'v2\n' });

    const result = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false, dryRun: true });

    expect(actions(result.changes)).toEqual({ 'skills/a.md': 'updated' });
    expect(await read(target, 'skills/a.md')).toBe('v1\n');
    expect(await read(target, 'coreslopper.workspace.json')).toBe(markerBefore);
  });

  it('treats differences as conflicts without a baseline and overwrites them with --force', async () => {
    const v1 = await runtimeFixture('9.9.0', { 'skills/a.md': 'v1\n' });
    const target = await workspaceFrom(v1);
    const marker = JSON.parse(await read(target, 'coreslopper.workspace.json')) as Record<string, unknown>;
    delete marker.files;
    await writeFile(join(target, 'coreslopper.workspace.json'), JSON.stringify(marker));
    const v2 = await runtimeFixture('9.10.0', { 'skills/a.md': 'v2\n' });

    const cautious = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false, dryRun: true });
    expect(cautious.hadBaseline).toBe(false);
    expect(actions(cautious.changes)['skills/a.md']).toBe('conflict');

    const forced = await updateWorkspace({ targetDir: target, runtimeDir: v2, install: false, force: true });
    expect(actions(forced.changes)['skills/a.md']).toBe('overwritten');
    expect(await read(target, 'skills/a.md')).toBe('v2\n');
  });

  it('refuses a downgrade without --force', async () => {
    const v2 = await runtimeFixture('9.10.0', {});
    const target = await workspaceFrom(v2);
    const marker = JSON.parse(await read(target, 'coreslopper.workspace.json')) as Record<string, unknown>;
    marker.runtimeVersion = '9.10.0';
    await writeFile(join(target, 'coreslopper.workspace.json'), JSON.stringify(marker));
    const v1 = await runtimeFixture('9.9.0', {});

    await expect(updateWorkspace({ targetDir: target, runtimeDir: v1, install: false })).rejects.toThrow(
      /newer than 9\.9\.0/,
    );
  });

  it('refuses a directory that is not a workspace', async () => {
    const runtime = await runtimeFixture('9.9.0', {});
    const target = await temporaryDir('coreslopper-plain-');
    await expect(updateWorkspace({ targetDir: target, runtimeDir: runtime, install: false })).rejects.toThrow(
      /No coreslopper workspace/,
    );
  });

  it('compares versions numerically', () => {
    expect(compareVersions('0.10.0', '0.9.1')).toBe(1);
    expect(compareVersions('0.1.0', '0.1.0')).toBe(0);
    expect(compareVersions('0.0.0-stage', '0.1.0')).toBe(-1);
  });
});
