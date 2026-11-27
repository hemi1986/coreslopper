import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkReleaseAssets } from '../packages/cli/src/qa.ts';
import { printStatus } from '../packages/cli/src/status.ts';
import { cleanupFixtures, episodeFixture, jpeg } from './helpers/release-fixture.ts';

// QA expects the thumbnails and covers of the release shape (ADR 0057, CMD-CheckRelease).

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  await cleanupFixtures();
});

const HORIZONTAL = { width: 1920, height: 1080 };
const VERTICAL = { width: 1080, height: 1920 };
const probe = () => ({ width: 1080, height: 1920, duration: 40 });

/** A project folder with `thumbnails` valid 16:9 thumbnails and the given files under its root. */
async function project(thumbnails: number, files: Record<string, Buffer> = {}): Promise<{ root: string; renders: string }> {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-qa-shape-'));
  temporary.push(root);
  const renders = join(root, 'renders');
  await mkdir(join(renders, 'thumbnails'), { recursive: true });
  for (let n = 0; n < thumbnails; n += 1) await writeFile(join(renders, 'thumbnails', `t${n}.jpg`), jpeg(1280, 720));
  for (const [path, content] of Object.entries(files)) await writeFile(join(root, path), content);
  return { root, renders };
}

const byName = (checks: { name: string; result: string; evidence: string }[], name: string) => checks.find((check) => check.name === name);

describe('QA of the release assets by shape', () => {
  it('still warns a horizontal episode with one thumbnail "1 of 3"', async () => {
    const paths = await project(1);
    const { checks } = await checkReleaseAssets(paths, { shape: 'episode', master: HORIZONTAL }, probe);
    expect(byName(checks, 'Thumbnails')).toMatchObject({ result: 'WARN', evidence: expect.stringContaining('1 of 3') });
    expect(byName(checks, 'Cover')).toBeUndefined();
  });

  it('passes a vertical episode over 180 s with one thumbnail', async () => {
    const paths = await project(1);
    const { checks } = await checkReleaseAssets(paths, { shape: 'episode', master: VERTICAL }, probe);
    expect(byName(checks, 'Thumbnails')).toMatchObject({ result: 'PASS' });
    const none = await checkReleaseAssets(await project(0), { shape: 'episode', master: VERTICAL }, probe);
    expect(byName(none.checks, 'Thumbnails')).toMatchObject({ result: 'WARN', evidence: expect.stringContaining('0 of 1') });
  });

  it('keeps three thumbnails for a vertical music video', async () => {
    const { checks } = await checkReleaseAssets(await project(1), { shape: 'music-video', master: VERTICAL }, probe);
    expect(byName(checks, 'Thumbnails')).toMatchObject({ result: 'WARN', evidence: expect.stringContaining('1 of 3') });
  });

  it('reports a short episode\'s Thumbnails and Shorts as N/A and fails a cover of the wrong size', async () => {
    const paths = await project(0, {
      'renders/cover-1080x1920.jpg': jpeg(1280, 720),
      'renders/cover-1080x1440.jpg': jpeg(1080, 1440),
    });
    const { checks, covers, thumbnails, shorts } = await checkReleaseAssets(paths, { shape: 'short-episode', master: VERTICAL }, probe);
    expect(byName(checks, 'Thumbnails')?.result).toBe('N/A');
    expect(byName(checks, 'Shorts')?.result).toBe('N/A');
    expect(byName(checks, 'Short thumbnails')?.result).toBe('N/A');
    expect(byName(checks, 'Cover')).toMatchObject({ result: 'FAIL', evidence: expect.stringContaining('1280x720, expected 1080x1920') });
    expect({ covers, thumbnails, shorts }).toEqual({ covers: ['renders/cover-1080x1920.jpg', 'renders/cover-1080x1440.jpg'], thumbnails: [], shorts: [] });
  });

  it('passes a short episode\'s two covers, warns a missing one and fails one over 2 MB', async () => {
    const good = await project(0, { 'renders/cover-1080x1920.jpg': jpeg(1080, 1920), 'renders/cover-1080x1440.jpg': jpeg(1080, 1440) });
    expect(byName((await checkReleaseAssets(good, { shape: 'short-episode', master: VERTICAL })).checks, 'Cover')?.result).toBe('PASS');
    const missing = await project(0, { 'renders/cover-1080x1920.jpg': jpeg(1080, 1920) });
    expect(byName((await checkReleaseAssets(missing, { shape: 'short-episode', master: VERTICAL })).checks, 'Cover')).toMatchObject({
      result: 'WARN',
      evidence: expect.stringContaining('renders/cover-1080x1440.jpg is missing; run thumbnail --format 3x4'),
    });
    const heavy = await project(0, {
      'renders/cover-1080x1920.jpg': jpeg(1080, 1920),
      'renders/cover-1080x1440.jpg': Buffer.concat([jpeg(1080, 1440), Buffer.alloc(2 * 1024 * 1024)]),
    });
    expect(byName((await checkReleaseAssets(heavy, { shape: 'short-episode', master: VERTICAL })).checks, 'Cover')?.result).toBe('FAIL');
  });
});

describe('status of a short episode', () => {
  async function statusLines(dir: string): Promise<string[]> {
    const lines: string[] = [];
    const log = console.log;
    console.log = (line: string) => lines.push(...String(line).split('\n'));
    try {
      await printStatus(dir);
    } finally {
      console.log = log;
    }
    return lines;
  }

  it('lists its cover and TikTok cover instead of thumbnails', async () => {
    const { dir } = await episodeFixture();
    await writeFile(join(dir, 'renders', 'cover-1080x1920.jpg'), jpeg(1080, 1920));
    await writeFile(join(dir, 'renders', 'cover-1080x1440.jpg'), jpeg(1080, 1440));
    const lines = await statusLines(dir);
    expect(lines).toContain('Covers: renders/cover-1080x1920.jpg, renders/cover-1080x1440.jpg');
    expect(lines.some((line) => line.startsWith('Thumbnails:'))).toBe(false);
  });

  it('still lists the thumbnails of an episode with a main video', async () => {
    const { dir } = await episodeFixture({ seconds: 240 });
    const lines = await statusLines(dir);
    expect(lines.some((line) => line.startsWith('Thumbnails: renders/thumbnails/a.jpg'))).toBe(true);
    expect(lines.some((line) => line.startsWith('Covers:'))).toBe(false);
  });
});
