import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { parse, stringify } from 'yaml';
import { runQa } from '../packages/cli/src/qa.ts';
import { printStatus } from '../packages/cli/src/status.ts';

// QA of a project with `distribution: internal`: no thumbnail, Shorts,
// upload-text, upload-data, or release-package checks, and READY rests on
// the render checks alone.

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A copy of the demo project with empty stand-ins for the song and the renders, but no release files. */
async function demo(distribution?: 'internal'): Promise<string> {
  const dir = join(await mkdtemp(join(tmpdir(), 'coreslopper-internal-qa-')), 'demo');
  temporary.push(dir);
  const source = join(process.cwd(), 'projects/demo');
  await cp(source, dir, {
    recursive: true,
    filter: (path) => !path.startsWith(join(source, 'renders') + sep) && !path.startsWith(join(source, 'audio') + sep) && !path.includes(`${sep}review${sep}upload.`),
  });
  await mkdir(join(dir, 'renders'), { recursive: true });
  await mkdir(join(dir, 'audio'), { recursive: true });
  await writeFile(join(dir, 'audio/song.wav'), '');
  for (const format of ['16x9', '9x16', '1x1']) await writeFile(join(dir, 'renders', `${format}.mp4`), '');
  if (distribution) {
    const config = parse(await readFile(join(dir, 'project.yaml'), 'utf8'));
    await writeFile(join(dir, 'project.yaml'), stringify({ ...config, distribution }));
  }
  return dir;
}

const RELEASE_ROWS = /^\| (Thumbnails|Shorts|Short thumbnails|Upload text|Upload data|Release (?!package \| N\/A)[^|]*) \|/m;

describe('qa of an internal project', () => {
  it('runs no release-package checks and is READY on the render checks alone', async () => {
    const dir = await demo('internal');
    const log = console.log;
    console.log = () => {};
    try {
      await runQa({ projectDir: dir });
    } finally {
      console.log = log;
    }
    const report = await readFile(join(dir, 'review/report.md'), 'utf8');
    expect(report).not.toMatch(RELEASE_ROWS);
    expect(report).not.toMatch(/\| (WARN|TODO) \|/);
    expect(report).toContain('| Release package | N/A | distribution: internal; not released publicly |');
    expect(report).toMatch(/^READY: yes$/m);
  });

  it('still fails an internal project without its master render', async () => {
    const dir = await demo('internal');
    await rm(join(dir, 'renders/16x9.mp4'));
    const log = console.log;
    console.log = () => {};
    try {
      await expect(runQa({ projectDir: dir })).rejects.toThrow(/QA failed/);
    } finally {
      console.log = log;
    }
  });

  it('keeps the release-package checks of a public project', async () => {
    const dir = await demo();
    const log = console.log;
    console.log = () => {};
    try {
      await runQa({ projectDir: dir }).catch(() => undefined);
    } finally {
      console.log = log;
    }
    const report = await readFile(join(dir, 'review/report.md'), 'utf8');
    expect(report).toMatch(/^\| Thumbnails \| WARN \|/m);
    expect(report).toMatch(/^\| Upload data \| WARN \|/m);
    expect(report).not.toContain('Release package | N/A');
  });

  it('tells /video-next through status that an internal project needs no release folder', async () => {
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: unknown) => void lines.push(String(line));
    try {
      await printStatus(await demo('internal'));
      await printStatus(await demo());
    } finally {
      console.log = log;
    }
    expect(lines.filter((line) => line.startsWith('Release:'))).toEqual(['Release: none · distribution: internal, not released publicly']);
  });
});
