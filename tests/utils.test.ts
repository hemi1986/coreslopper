import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { projectDirFromArg } from '../packages/cli/src/utils.ts';

const cwd = process.cwd();
let root: string | undefined;

afterEach(async () => {
  process.chdir(cwd);
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('projectDirFromArg', () => {
  it('accepts a path or a bare slug', async () => {
    root = await mkdtemp(join(tmpdir(), 'coreslopper-utils-'));
    await mkdir(join(root, 'projects', 'neon-rain'), { recursive: true });
    await writeFile(join(root, 'projects', 'neon-rain', 'project.yaml'), 'slug: neon-rain\n');
    process.chdir(root);

    const expected = join(root, 'projects', 'neon-rain');
    expect(projectDirFromArg('projects/neon-rain')).toBe(expected);
    expect(projectDirFromArg('neon-rain')).toBe(expected);
    expect(projectDirFromArg(undefined)).toBe(join(root, 'projects', 'demo'));
    expect(projectDirFromArg('missing')).toBe(join(root, 'missing'));
  });
});
