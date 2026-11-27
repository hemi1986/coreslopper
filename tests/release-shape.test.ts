import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { manifestShape, ReleaseManifestSchema, releaseShape } from '../packages/core/src/index.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { cleanupFixtures, episodeFixture, fakeDeps, fixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

const MASTERS = {
  '9:16': { width: 1080, height: 1920 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
} as const;

/** An episode with this master format and an episode track of `seconds`. */
async function episode(aspect: keyof typeof MASTERS, seconds: number): Promise<{ dir: string; root: string }> {
  const { dir, root } = await episodeFixture();
  const projectPath = join(dir, 'project.yaml');
  const config = parse(await readFile(projectPath, 'utf8')) as { formats: { master: Record<string, unknown> } };
  config.formats.master = { ...config.formats.master, aspect, ...MASTERS[aspect] };
  await writeFile(projectPath, stringify(config));
  const timingPath = join(dir, 'timing.json');
  const timing = JSON.parse(await readFile(timingPath, 'utf8')) as { audio: { duration: number }; sections: { end: number }[] };
  timing.audio.duration = seconds;
  timing.sections.at(-1)!.end = seconds;
  await writeFile(timingPath, JSON.stringify(timing));
  return { dir, root };
}

/** The shape `release` wrote into renders/release/manifest.json. */
async function manifestOnDisk(dir: string): Promise<string | undefined> {
  const raw = JSON.parse(await readFile(join(dir, 'renders', 'release', 'manifest.json'), 'utf8')) as { shape?: string };
  return raw.shape;
}

describe('the release shape of an episode', () => {
  it('ST-047: A vertical episode of 170 seconds is a short episode', async () => {
    const { dir, root } = await episode('9:16', 170);

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(result.manifest.shape).toBe('short-episode');
    expect(await manifestOnDisk(dir)).toBe('short-episode');
  });

  it('ST-047: A 4:5 episode of exactly 180 seconds is a short episode', async () => {
    const { dir, root } = await episode('4:5', 180);

    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(await manifestOnDisk(dir)).toBe('short-episode');
    expect(result.manifest.shape).toBe('short-episode');
  });

  it('ST-047: A vertical episode of 181 seconds is an episode', async () => {
    const { dir, root } = await episode('9:16', 181);

    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(await manifestOnDisk(dir)).toBe('episode');
  });

  it('ST-047: A horizontal episode of 120 seconds is an episode', async () => {
    const { dir, root } = await episode('16:9', 120);

    await buildRelease({ projectDir: dir, root, deps: fakeDeps(), render: false });

    expect(await manifestOnDisk(dir)).toBe('episode');
  });
});

describe('the release shape rule', () => {
  it('a square episode of up to 180 s is a short episode; an episode without a length is an episode', () => {
    expect(releaseShape({ kind: 'episode', master: { width: 1080, height: 1080 }, durationSeconds: 60 })).toBe('short-episode');
    expect(releaseShape({ kind: 'episode', master: { width: 1080, height: 1920 }, durationSeconds: undefined })).toBe('episode');
  });

  it('a music video and a meme take their kind as their shape', () => {
    expect(releaseShape({ kind: 'music-video', master: { width: 1080, height: 1920 }, durationSeconds: 60 })).toBe('music-video');
    expect(releaseShape({ kind: 'meme', master: { width: 1080, height: 1920 }, durationSeconds: 20 })).toBe('meme');
  });

  it('a manifest without a shape reads as its project kind', () => {
    const old = ReleaseManifestSchema.parse({ version: 1, project: 'demo-episode', generated_at: '2026-11-01T00:00:00.000Z' });
    expect(old.shape).toBeUndefined();
    expect(manifestShape(old, 'episode')).toBe('episode');
    expect(manifestShape({ ...old, shape: 'short-episode' }, 'episode')).toBe('short-episode');
  });

  it('a music video records its kind as its shape', async () => {
    const dir = await fixture();

    const result = await buildRelease({ projectDir: dir, deps: fakeDeps(), render: false });

    expect(result.manifest.shape).toBe('music-video');
  });
});
