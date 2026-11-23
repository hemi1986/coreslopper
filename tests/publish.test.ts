import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { ConfigError, ProjectConfigSchema, PublishLogSchema, UploadDataSchema, type PublishLog } from '../packages/core/src/index.ts';
import {
  MockPublisher,
  RefreshingToken,
  TikTokPublisher,
  YouTubePublisher,
  fetchWithRetry,
  redactSecrets,
  tiktokCaption,
  tiktokChunks,
  validateTikTokClient,
  validateYouTubeClient,
  type FetchLike,
  type PublishAdapter,
  type PublishItem,
} from '../packages/providers/src/index.ts';
import {
  appendPublishEntry,
  buildPublishPlan,
  platformProblems,
  publishProject,
  quotaDay,
  youtubeDescription,
  youtubeTagChars,
  type VideoProbe,
} from '../packages/cli/src/publish.ts';
import { memeFixture } from './helpers/release-fixture.ts';
import { renderUploadText, writeUploadText } from '../packages/cli/src/upload-text.ts';
import { parseUploadText, uploadTextProblems } from '../packages/cli/src/release-files.ts';
import { checkUploadData } from '../packages/cli/src/qa.ts';
import { publishAuth, saveEnvValue } from '../packages/cli/src/publish-auth.ts';
import { publishChecks } from '../packages/cli/src/doctor.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const temporary: string[] = [];
const noSleep = async () => undefined;

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

const VERTICAL: VideoProbe = { width: 1080, height: 1920, duration: 40 };
const HORIZONTAL: VideoProbe = { width: 1920, height: 1080, duration: 200 };

function uploadData(overrides: Record<string, unknown> = {}) {
  return {
    version: 1,
    language: 'de',
    main: {
      file: 'renders/16x9.mp4',
      title: 'Neon Rain',
      description: 'Eine Nacht im Regen.',
      hashtags: ['#synthwave', '#neon'],
      tags: ['synthwave', 'neon rain'],
      thumbnail: 'renders/thumbnails/thumb-1.jpg',
      alternate_thumbnails: ['renders/thumbnails/thumb-2.jpg'],
    },
    shorts: [
      {
        name: 'N1-intro',
        moment: 'Intro',
        file: 'renders/shorts/N1-intro-9x16.mp4',
        title: 'Regen #shorts',
        description: 'Der Anfang.\nGanzes Video: Link oben ☝️',
        hashtags: ['#neon', '#shorts'],
        thumbnail: 'renders/shorts/N1-intro-thumb.jpg',
      },
      {
        name: 'N2-chorus',
        file: 'renders/shorts/N2-chorus-9x16.mp4',
        title: 'Refrain #shorts',
        description: 'Der Refrain.',
        hashtags: ['#synthwave', '#shorts'],
        platforms: ['youtube'],
      },
    ],
    ...overrides,
  };
}

/** A project folder with an upload.yaml and small placeholder files. */
async function fixture(data: unknown = uploadData()): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-publish-'));
  temporary.push(dir);
  await mkdir(join(dir, 'review'), { recursive: true });
  await mkdir(join(dir, 'renders', 'shorts'), { recursive: true });
  await mkdir(join(dir, 'renders', 'thumbnails'), { recursive: true });
  await writeFile(
    join(dir, 'project.yaml'),
    stringify(
      ProjectConfigSchema.parse({
        version: 1,
        slug: 'neon-rain',
        kind: 'music-video',
        title: 'Neon Rain',
        created: '2026-11-16T00:00:00Z',
        workflow: { version: '0.1.0' },
        budget_usd: 40,
        formats: { master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 } },
      }),
    ),
  );
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify(data));
  for (const [file, content] of Object.entries({
    'renders/16x9.mp4': 'main-video',
    'renders/shorts/N1-intro-9x16.mp4': 'short-1',
    'renders/shorts/N2-chorus-9x16.mp4': 'short-2',
    'renders/thumbnails/thumb-1.jpg': 'jpeg',
    'renders/thumbnails/thumb-2.jpg': 'jpeg',
    'renders/shorts/N1-intro-thumb.jpg': 'jpeg',
  })) {
    await writeFile(join(dir, file), content);
  }
  return dir;
}

const probe = (path: string): VideoProbe => (path.includes('shorts') ? VERTICAL : HORIZONTAL);

async function readLog(dir: string): Promise<PublishLog> {
  return PublishLogSchema.parse(JSON.parse(await readFile(join(dir, 'review', 'publish.json'), 'utf8')));
}

/** Adapters that must not be called. */
const forbidden: Record<'youtube' | 'tiktok', PublishAdapter> = {
  youtube: { platform: 'youtube', mock: false, publish: () => Promise.reject(new Error('network call in a dry run')) },
  tiktok: { platform: 'tiktok', mock: false, publish: () => Promise.reject(new Error('network call in a dry run')) },
};

const quiet = () => undefined;

describe('upload data schema', () => {
  it('fills the defaults', () => {
    const data = UploadDataSchema.parse(uploadData());
    expect(data.main.made_for_kids).toBe(false);
    expect(data.main.synthetic_media).toBe(true);
    expect(data.main.category_id).toBe('10');
    expect(data.main.platforms).toEqual(['youtube']);
    expect(data.shorts[0]!.platforms).toEqual(['youtube', 'tiktok']);
    expect(data.shorts[0]!.related).toBe('main');
  });

  it('rejects bad hashtags, duplicate names, and an unknown platform', () => {
    const data = uploadData();
    data.main.hashtags = ['synthwave'];
    expect(UploadDataSchema.safeParse(data).success).toBe(false);
    const duplicate = uploadData();
    (duplicate.shorts[1] as { name: string }).name = 'N1-intro';
    expect(UploadDataSchema.safeParse(duplicate).success).toBe(false);
    const instagram = uploadData();
    (instagram.shorts[1] as { platforms: string[] }).platforms = ['instagram'];
    expect(UploadDataSchema.safeParse(instagram).success).toBe(false);
  });

  it('validates the publish log', () => {
    const entry = { platform: 'youtube', item: 'main', file: 'a.mp4', file_hash: 'x', status: 'uploaded', at: 'now' };
    expect(PublishLogSchema.safeParse({ version: 1, entries: [entry] }).success).toBe(false);
    expect(PublishLogSchema.safeParse({ version: 1, entries: [{ ...entry, file_hash: 'a'.repeat(64) }] }).success).toBe(true);
  });

  it('is checked by validate-file', async () => {
    const dir = await fixture();
    expect(await validateChangedFile(join(dir, 'review', 'upload.yaml'))).toBe('upload data');
    await writeFile(join(dir, 'review', 'upload.yaml'), 'version: 1\nlanguage: de\n');
    await expect(validateChangedFile(join(dir, 'review', 'upload.yaml'))).rejects.toThrow(/Invalid/);
  });
});

describe('upload text from upload data', () => {
  it('renders a file the upload-text checker accepts, with the project language', async () => {
    const dir = await fixture();
    const markdown = renderUploadText(dir, UploadDataSchema.parse(uploadData()), () => 41.6);
    expect(markdown).toContain('## Hauptvideo');
    expect(markdown).toContain('### N1-intro — Intro (42 s)');
    expect(markdown).toContain('`renders/thumbnails/thumb-1.jpg`, `renders/thumbnails/thumb-2.jpg`');
    expect(markdown).toContain('- [ ] Verwandtes Video = Hauptvideo');
    const parsed = parseUploadText(markdown);
    expect(parsed.main?.title).toBe('Neon Rain');
    expect(parsed.shorts).toHaveLength(2);
    expect(parsed.shorts[0]!.hashtags).toEqual(['#neon', '#shorts']);
    const { errors } = uploadTextProblems(parsed, markdown, ['N1-intro', 'N2-chorus']);
    expect(errors).toEqual([]);
  });

  it('feeds the qa check, which warns when upload.md is stale', async () => {
    const dir = await fixture();
    expect((await checkUploadData(dir, ['N1-intro', 'N2-chorus'])).result).toBe('WARN');
    await writeUploadText(dir);
    expect((await checkUploadData(dir, ['N1-intro', 'N2-chorus'])).result).toBe('PASS');
    await rm(join(dir, 'renders', 'shorts', 'N1-intro-thumb.jpg'));
    const check = await checkUploadData(dir, ['N1-intro', 'N2-chorus']);
    expect(check.result).toBe('FAIL');
    expect(check.evidence).toContain('N1-intro-thumb.jpg');
  });
});

describe('publish plan and dry run', () => {
  it('plans every item on its platforms and makes no calls', async () => {
    const dir = await fixture();
    const summary = await publishProject({ projectDir: dir, dryRun: true, probe, adapters: forbidden, log: quiet });
    expect(summary.plan.steps.map((step) => `${step.platform}:${step.item.name}`)).toEqual([
      'youtube:main',
      'youtube:N1-intro',
      'tiktok:N1-intro',
      'youtube:N2-chorus',
    ]);
    expect(summary.plan.quota.youtube.planned).toBe(1650 + 1650 + 1600);
    expect(summary.plan.quota.tiktok.planned).toBe(1);
    expect(existsSync(join(dir, 'review', 'publish.json'))).toBe(false);
  });

  it('selects with --only and --platform', async () => {
    const dir = await fixture();
    const data = UploadDataSchema.parse(uploadData());
    const empty = { version: 1 as const, entries: [] };
    const shorts = await buildPublishPlan(dir, data, empty, { only: 'shorts', platform: 'youtube', probe });
    expect(shorts.steps.map((step) => step.item.name)).toEqual(['N1-intro', 'N2-chorus']);
    const one = await buildPublishPlan(dir, data, empty, { only: 'N1-intro', platform: 'tiktok', probe });
    expect(one.steps.map((step) => `${step.platform}:${step.item.name}`)).toEqual(['tiktok:N1-intro']);
    await expect(buildPublishPlan(dir, data, empty, { only: 'Z9-nope' })).rejects.toThrow(/no such item/);
  });

  it('reports missing files and broken platform limits', async () => {
    const data = uploadData();
    data.main.title = 'x'.repeat(101);
    data.main.tags = Array.from({ length: 60 }, (_, index) => `tag number ${index}`);
    const dir = await fixture(data);
    await rm(join(dir, 'renders', 'shorts', 'N2-chorus-9x16.mp4'));
    const plan = await buildPublishPlan(dir, UploadDataSchema.parse(data), { version: 1, entries: [] }, {
      probe: (path) => (path.includes('N1') ? { width: 1920, height: 1080, duration: 200 } : HORIZONTAL),
    });
    const errors = plan.errors.join('\n');
    expect(errors).toContain('title has 101 characters');
    expect(errors).toMatch(/tags take \d+ characters, limit 500/);
    expect(errors).toContain('N2-chorus: renders/shorts/N2-chorus-9x16.mp4 does not exist');
    expect(errors).toContain('a Short is at most 180 s');
    expect(errors).toContain('a Short must be vertical');
    expect(plan.warnings.join('\n')).toContain('TikTok shows 9:16');
    await expect(publishProject({ projectDir: dir, dryRun: true, probe, adapters: forbidden, log: quiet })).rejects.toThrow(/nothing was uploaded/);
  });

  it('rejects a past or malformed schedule and warns without ffprobe', async () => {
    const dir = await fixture();
    const data = UploadDataSchema.parse(uploadData());
    const plan = await buildPublishPlan(dir, data, { version: 1, entries: [] }, {
      schedule: '2020-01-01T10:00:00Z',
      probe: () => {
        throw new Error('ffprobe missing');
      },
    });
    expect(plan.errors.join()).toContain('must be at least 15 minutes in the future');
    expect(plan.warnings.join()).toContain('not probed');
    const bad = await buildPublishPlan(dir, data, { version: 1, entries: [] }, { schedule: 'tomorrow', probe });
    expect(bad.errors.join()).toContain('use an ISO date');
  });

  it('counts YouTube tags like YouTube does', () => {
    expect(youtubeTagChars(['a', 'b c'])).toBe(1 + 1 + 5);
  });

  it('blocks a TikTok caption over the limit, like the release check', () => {
    const long = { ...item('/tmp/video.mp4'), caption: 'x'.repeat(2201) };
    expect(platformProblems('tiktok', long, VERTICAL, { video: 1000 }).errors.join()).toContain('caption has 2201 characters, limit 2200');
  });
});

describe('publish run and idempotency', () => {
  it('writes the publish log and skips unchanged files on the next run', async () => {
    const dir = await fixture();
    const youtube = new MockPublisher('youtube');
    const tiktok = new MockPublisher('tiktok');
    const now = () => new Date('2026-11-16T12:00:00Z');
    const first = await publishProject({ projectDir: dir, mock: true, probe, adapters: { youtube, tiktok }, now, log: quiet });
    expect(first.entries).toHaveLength(4);
    const log = await readLog(dir);
    expect(log.entries.map((entry) => [entry.platform, entry.item, entry.status, entry.mock])).toEqual([
      ['youtube', 'main', 'uploaded', true],
      ['youtube', 'N1-intro', 'uploaded', true],
      ['tiktok', 'N1-intro', 'draft', true],
      ['youtube', 'N2-chorus', 'uploaded', true],
    ]);
    expect(log.entries[0]).toMatchObject({ file: 'renders/16x9.mp4', thumbnail: 'set', quota_units: 1650, at: '2026-11-16T12:00:00.000Z' });
    expect(log.entries[0]!.file_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(log.entries[0]!.url).toMatch(/^https:\/\/youtu\.be\/mock-/);
    expect(first.manualSteps.join('\n')).toContain(`set "Related video" to ${log.entries[0]!.url}`);
    expect(first.manualSteps.join('\n')).toContain('Regen\n\n#neon');
    // YouTube gets the item's metadata; nothing is public.
    expect(youtube.calls[0]!.item).toMatchObject({ madeForKids: false, syntheticMedia: true, language: 'de' });

    const second = await publishProject({ projectDir: dir, mock: true, probe, adapters: { youtube, tiktok }, now, log: quiet });
    expect(second.entries).toHaveLength(0);
    expect(second.plan.steps.every((step) => step.action === 'skip')).toBe(true);
    expect(youtube.calls).toHaveLength(3);

    await writeFile(join(dir, 'renders', 'shorts', 'N2-chorus-9x16.mp4'), 'short-2-recut');
    const third = await publishProject({ projectDir: dir, mock: true, probe, adapters: { youtube, tiktok }, now, log: quiet });
    expect(third.entries.map((entry) => entry.item)).toEqual(['N2-chorus']);

    const forced = await publishProject({ projectDir: dir, mock: true, force: true, only: 'main', probe, adapters: { youtube, tiktok }, now, log: quiet });
    expect(forced.entries.map((entry) => entry.item)).toEqual(['main']);
  });

  it('never lets a mock upload satisfy a real run', async () => {
    const dir = await fixture();
    const now = () => new Date('2026-11-16T12:00:00Z');
    await publishProject({ projectDir: dir, mock: true, only: 'main', probe, now, log: quiet });
    const plan = await publishProject({ projectDir: dir, dryRun: true, only: 'main', probe, adapters: forbidden, now, log: quiet });
    expect(plan.plan.steps[0]!.action).toBe('upload');
  });

  it('records a failure, keeps earlier uploads, and masks secrets', async () => {
    const dir = await fixture();
    const tiktok: PublishAdapter = {
      platform: 'tiktok',
      mock: false,
      publish: () => Promise.reject(new Error('upstream said access_token=act.secret123456 is bad')),
    };
    const youtube = new MockPublisher('youtube');
    Object.defineProperty(youtube, 'mock', { value: false });
    await expect(
      publishProject({ projectDir: dir, only: 'N1-intro', probe, adapters: { youtube, tiktok }, log: quiet }),
    ).rejects.toThrow(/tiktok N1-intro/);
    const log = await readLog(dir);
    expect(log.entries.map((entry) => `${entry.platform}:${entry.status}`)).toEqual(['youtube:uploaded', 'tiktok:failed']);
    expect(log.entries[1]!.error).not.toContain('secret123456');
    // A failed attempt is retried on the next run; the YouTube upload is not.
    const next = await publishProject({ projectDir: dir, dryRun: true, only: 'N1-intro', probe, adapters: forbidden, log: quiet });
    expect(next.plan.steps.map((step) => `${step.platform}:${step.action}`)).toEqual(['youtube:skip', 'tiktok:upload']);
  });
});

describe('a meme upload', () => {
  it('posts the release caption with the credit of every sound it took', async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const { dir, root } = await memeFixture({ licence: 'cc-by', credit });
    const youtube = new MockPublisher('youtube');
    const tiktok = new MockPublisher('tiktok');
    await publishProject({ projectDir: dir, root, mock: true, only: 'main', probe: () => VERTICAL, adapters: { youtube, tiktok }, log: quiet });
    const yt = youtube.calls.find((call) => call.item.name === 'main')!.item;
    const tt = tiktok.calls.find((call) => call.item.name === 'main')!.item;
    expect(youtubeDescription(yt)).toContain(credit);
    expect(tiktokCaption(tt)).toContain(credit);
    expect(tiktokCaption(tt)).toContain('He printed the report anyway.');
  });

  it('posts the release caption also when no sound needs a credit', async () => {
    const { dir, root } = await memeFixture({ licence: 'own' });
    const youtube = new MockPublisher('youtube');
    const tiktok = new MockPublisher('tiktok');
    await publishProject({ projectDir: dir, root, mock: true, only: 'main', probe: () => VERTICAL, adapters: { youtube, tiktok }, log: quiet });
    const tt = tiktok.calls.find((call) => call.item.name === 'main')!.item;
    expect(tiktokCaption(tt)).toBe('He printed the report anyway.\n\n#officeprank');
    expect(youtubeDescription(youtube.calls[0]!.item)).toBe('He printed the report anyway.\n\n#officeprank');
  });

  it('warns about a sound whose library entry is gone instead of dropping the credit silently', async () => {
    const { dir, root } = await memeFixture({ credit: 'Boom by Jane Doe' });
    await rm(join(root, 'library', 'sounds', 'vine-boom', 'sound.yaml'));
    const summary = await publishProject({ projectDir: dir, root, dryRun: true, probe: () => VERTICAL, adapters: forbidden, log: quiet });
    expect(summary.plan.warnings.join('\n')).toMatch(/vine-boom.*its entry is missing/);
  });
});

describe('an upload that may have gone out', () => {
  it('keeps the uncertain mark, never uploads it again by itself, and uploads again with --force', async () => {
    const dir = await fixture();
    const now = () => new Date('2026-11-16T12:00:00Z');
    const lost = Object.assign(new Error('YouTube upload failed: fetch failed'), { uncertain: true });
    const youtube: PublishAdapter = { platform: 'youtube', mock: false, publish: () => Promise.reject(lost) };
    const error = await publishProject({ projectDir: dir, only: 'main', platform: 'youtube', probe, adapters: { youtube, tiktok: forbidden.tiktok }, now, log: quiet })
      .then((): Error & { uncertain?: boolean } => new Error('no error'), (caught: unknown) => caught as Error & { uncertain?: boolean });
    expect(error.uncertain).toBe(true);
    expect(error.message).toMatch(/may have gone out: check youtube/);
    expect((await readLog(dir)).entries[0]).toMatchObject({ platform: 'youtube', item: 'main', status: 'failed', uncertain: true });

    const lines: string[] = [];
    const next = await publishProject({ projectDir: dir, only: 'main', platform: 'youtube', probe, adapters: forbidden, now, log: (line) => void lines.push(line) });
    expect(next.plan.steps.map((step) => step.action)).toEqual(['skip']);
    expect(lines.join('\n')).toMatch(/may have gone out .*--force/);

    const mock = new MockPublisher('youtube');
    Object.defineProperty(mock, 'mock', { value: false });
    const forced = await publishProject({ projectDir: dir, only: 'main', platform: 'youtube', force: true, probe, adapters: { youtube: mock, tiktok: forbidden.tiktok }, now, log: quiet });
    expect(forced.entries.map((entry) => entry.status)).toEqual(['uploaded']);
  });
});

describe('writers at the same time', () => {
  it('keeps every entry when publish and the autopilot append to the publish log at once', async () => {
    const dir = await fixture();
    const logPath = join(dir, 'review', 'publish.json');
    const entry = (item: string) => ({ platform: 'youtube' as const, item, file: 'renders/16x9.mp4', file_hash: 'a'.repeat(64), status: 'uploaded' as const, mock: false, warnings: [], at: '2026-11-16T12:00:00Z' });
    await Promise.all(['main', 'N1-intro', 'N2-chorus', 'N3'].map((item) => appendPublishEntry(logPath, entry(item))));
    expect((await readLog(dir)).entries.map((e) => e.item).sort()).toEqual(['N1-intro', 'N2-chorus', 'N3', 'main']);
  });

  it('keeps every value when two writers save into .env at once', async () => {
    const dir = await fixture();
    const envPath = join(dir, '.env');
    await writeFile(envPath, 'FAL_KEY=kept\n');
    await Promise.all([saveEnvValue('X_REFRESH_TOKEN', 'rotated', envPath), saveEnvValue('TIKTOK_REFRESH_TOKEN', 'new', envPath)]);
    const content = await readFile(envPath, 'utf8');
    expect(content).toContain('FAL_KEY=kept');
    expect(content).toContain('X_REFRESH_TOKEN=rotated');
    expect(content).toContain('TIKTOK_REFRESH_TOKEN=new');
    expect(existsSync(`${envPath}.lock`)).toBe(false);
  });
});

describe('quota', () => {
  const entry = (at: string, units = 1650) => ({
    platform: 'youtube' as const,
    item: 'x',
    file: 'x.mp4',
    file_hash: 'b'.repeat(64),
    status: 'uploaded' as const,
    mock: false,
    warnings: [],
    quota_units: units,
    at,
  });

  it('stops before the first upload when the batch would exceed the daily YouTube quota', async () => {
    const dir = await fixture();
    const now = () => new Date('2026-11-16T20:00:00Z');
    const log = { version: 1, entries: [1, 2, 3, 4].map(() => entry('2026-11-16T18:00:00Z')) };
    await writeFile(join(dir, 'review', 'publish.json'), JSON.stringify(log));
    await expect(publishProject({ projectDir: dir, probe, adapters: forbidden, now, log: quiet })).rejects.toThrow(/nothing was uploaded/);
    const plan = await buildPublishPlan(dir, UploadDataSchema.parse(uploadData()), PublishLogSchema.parse(log), { probe, now });
    expect(plan.quota.youtube.used).toBe(6600);
    expect(plan.errors.join()).toContain('quota units');
  });

  it('counts only the current Pacific day, and honours YOUTUBE_DAILY_QUOTA', async () => {
    expect(quotaDay(new Date('2026-11-17T07:30:00Z'))).toBe('2026-11-16');
    const dir = await fixture();
    const now = () => new Date('2026-11-17T09:00:00Z');
    const log = PublishLogSchema.parse({ version: 1, entries: [1, 2, 3, 4, 5].map(() => entry('2026-11-17T07:00:00Z')) });
    const data = UploadDataSchema.parse(uploadData());
    expect((await buildPublishPlan(dir, data, log, { probe, now })).errors).toEqual([]);
    process.env.YOUTUBE_DAILY_QUOTA = '3000';
    try {
      expect((await buildPublishPlan(dir, data, { version: 1, entries: [] }, { probe, now })).errors.join()).toContain('of 3000');
    } finally {
      delete process.env.YOUTUBE_DAILY_QUOTA;
    }
  });

  it('warns when TikTok would hold more than five pending drafts', async () => {
    const dir = await fixture();
    const now = () => new Date('2026-11-16T20:00:00Z');
    const drafts = [1, 2, 3, 4, 5].map(() => ({ ...entry('2026-11-16T10:00:00Z'), platform: 'tiktok' as const, status: 'draft' as const }));
    const plan = await buildPublishPlan(dir, UploadDataSchema.parse(uploadData()), PublishLogSchema.parse({ version: 1, entries: drafts }), { probe, now });
    expect(plan.quota.tiktok.pending).toBe(5);
    expect(plan.warnings.join()).toContain('pending drafts');
  });
});

const item = (file: string, overrides: Partial<PublishItem> = {}): PublishItem => ({
  name: 'main',
  kind: 'main',
  file,
  title: 'Neon Rain',
  description: 'Eine Nacht im Regen.',
  tags: ['synthwave'],
  hashtags: ['#synthwave'],
  language: 'de',
  madeForKids: false,
  syntheticMedia: true,
  categoryId: '10',
  ...overrides,
});

async function bytesFile(size: number, name = 'video.mp4'): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-publish-bytes-'));
  temporary.push(dir);
  const path = join(dir, name);
  await writeFile(path, Buffer.alloc(size, 7));
  return path;
}

describe('YouTube adapter', () => {
  const credentials = { clientId: 'client.apps.googleusercontent.com', clientSecret: 'GOCSPX-secretvalue', refreshToken: '1//refresh-token-value' };

  it('refreshes the token, uploads resumably as private, resumes after a 503, and keeps a 403 thumbnail as a warning', async () => {
    const video = await bytesFile(600 * 1024);
    const thumbnail = await bytesFile(100, 'thumb.jpg');
    const calls: { url: string; init?: RequestInit }[] = [];
    let puts = 0;
    let received = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'ya29.access-token', expires_in: 3599 });
      if (url.includes('uploadType=resumable')) return new Response(null, { status: 200, headers: { location: 'https://upload.example/session/1' } });
      if (url === 'https://upload.example/session/1') {
        puts += 1;
        const range = new Headers(init?.headers).get('content-range')!;
        if (puts === 2) return new Response('busy', { status: 503 });
        if (range.startsWith('bytes */')) return new Response(null, { status: 308, headers: { range: `bytes=0-${received - 1}` } });
        const [, , end, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(range)!;
        received = Number(end) + 1;
        if (received === Number(total)) return json({ id: 'vid123' });
        return new Response(null, { status: 308, headers: { range: `bytes=0-${end}` } });
      }
      if (url.includes('thumbnails/set')) return json({ error: { code: 403, message: 'forbidden' } }, 403);
      throw new Error(`unexpected ${url}`);
    };
    const adapter = new YouTubePublisher({ ...credentials, fetchImpl, sleep: noSleep, chunkBytes: 256 * 1024 });
    const result = await adapter.publish({ item: item(video, { thumbnail }), schedule: '2026-12-01T18:00:00+01:00' });

    expect(result).toMatchObject({ remoteId: 'vid123', url: 'https://youtu.be/vid123', status: 'scheduled', thumbnail: 'skipped', quotaUnits: 1650 });
    expect(result.publishAt).toBe('2026-12-01T17:00:00.000Z');
    expect(result.warnings.join()).toContain('403');
    const init = calls.find((call) => call.url.includes('uploadType=resumable'))!;
    const metadata = JSON.parse(String(init.init!.body));
    expect(metadata.status).toEqual({
      privacyStatus: 'private',
      publishAt: '2026-12-01T17:00:00.000Z',
      selfDeclaredMadeForKids: false,
      containsSyntheticMedia: true,
    });
    expect(metadata.snippet.description).toBe('Eine Nacht im Regen.\n\n#synthwave');
    expect(new Headers(init.init!.headers).get('authorization')).toBe('Bearer ya29.access-token');
    expect(calls.filter((call) => call.url.startsWith('https://oauth2')).length).toBe(1);
    expect(received).toBe(600 * 1024);
  });

  it('refreshes again after a 401 and reports a revoked token as a configuration error', async () => {
    const video = await bytesFile(10);
    let tokens = 0;
    let inits = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.startsWith('https://oauth2')) {
        tokens += 1;
        return json({ access_token: `token-${tokens}`, expires_in: 3600 });
      }
      if (url.includes('uploadType=resumable')) {
        inits += 1;
        return inits === 1 ? json({}, 401) : new Response(null, { status: 200, headers: { location: 'https://upload.example/s' } });
      }
      return json({ id: 'v2' });
    };
    const result = await new YouTubePublisher({ ...credentials, fetchImpl, sleep: noSleep }).publish({ item: item(video) });
    expect(result.status).toBe('uploaded');
    expect(tokens).toBe(2);

    const revoked: FetchLike = async () => json({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }, 400);
    await expect(new YouTubePublisher({ ...credentials, fetchImpl: revoked, sleep: noSleep }).publish({ item: item(video) })).rejects.toBeInstanceOf(ConfigError);
  });

  it('masks tokens in errors and needs credentials', async () => {
    const video = await bytesFile(10);
    const fetchImpl: FetchLike = async (url) =>
      url.startsWith('https://oauth2')
        ? json({ access_token: 'ya29.leaky-token', expires_in: 3600 })
        : json({ error: { message: 'bad request for Bearer ya29.leaky-token', refresh_token: '1//refresh-token-value' } }, 400);
    const error = (await new YouTubePublisher({ ...credentials, fetchImpl, sleep: noSleep })
      .publish({ item: item(video) })
      .then(() => new Error("no error"), (caught: unknown) => caught as Error));
    expect(error.message).toContain('HTTP 400');
    expect(error.message).not.toContain('ya29.leaky-token');
    expect(error.message).not.toContain('refresh-token-value');
    expect(() => new YouTubePublisher({ clientId: 'a', clientSecret: 'b', refreshToken: undefined })).toThrow(/publish-auth youtube/);
  });

  it('marks an error after the last byte as uncertain, and an error before it as certain', async () => {
    const video = await bytesFile(10);
    const token = (url: string) => (url.startsWith('https://oauth2') ? json({ access_token: 'ya29.t', expires_in: 3600 }) : undefined);
    // Every byte was sent, then the answers are lost: the video may exist.
    const lost: FetchLike = async (url) =>
      token(url) ?? (url.includes('uploadType=resumable') ? new Response(null, { status: 200, headers: { location: 'https://upload.example/s' } }) : new Response('busy', { status: 503 }));
    const after = await new YouTubePublisher({ ...credentials, fetchImpl: lost, sleep: noSleep })
      .publish({ item: item(video) })
      .then((): Error & { uncertain?: boolean } => new Error('no error'), (caught: unknown) => caught as Error & { uncertain?: boolean });
    expect(after.uncertain).toBe(true);

    // The session never opened: nothing was uploaded.
    const refused: FetchLike = async (url) => token(url) ?? json({ error: { message: 'bad request' } }, 400);
    const before = await new YouTubePublisher({ ...credentials, fetchImpl: refused, sleep: noSleep })
      .publish({ item: item(video) })
      .then((): Error & { uncertain?: boolean } => new Error('no error'), (caught: unknown) => caught as Error & { uncertain?: boolean });
    expect(before.message).toContain('HTTP 400');
    expect(before.uncertain).toBeFalsy();
  });

  it('validates an OAuth client without a user', async () => {
    expect((await validateYouTubeClient('id', 'secret', async () => json({ error: 'invalid_grant' }, 400))).status).toBe('valid');
    expect((await validateYouTubeClient('id', 'secret', async () => json({ error: 'invalid_client' }, 401))).status).toBe('invalid');
  });
});

describe('TikTok adapter', () => {
  const credentials = { clientKey: 'awkey', clientSecret: 'tiktok-secret-value', refreshToken: 'rft.old-refresh-token' };

  it('uploads to the inbox in chunks, polls until it arrives, and stores a rotated refresh token', async () => {
    const video = await bytesFile(4000);
    const rotated: string[] = [];
    const calls: { url: string; init?: RequestInit }[] = [];
    let statusPolls = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/oauth/token/')) return json({ access_token: 'act.access', expires_in: 86400, refresh_token: 'rft.new-refresh-token' });
      if (url.endsWith('/inbox/video/init/')) return json({ data: { publish_id: 'v_inbox_1', upload_url: 'https://upload.tiktok.example/u' }, error: { code: 'ok' } });
      if (url === 'https://upload.tiktok.example/u') return new Response(null, { status: 201 });
      if (url.endsWith('/status/fetch/')) {
        statusPolls += 1;
        return json({ data: { status: statusPolls < 2 ? 'PROCESSING_UPLOAD' : 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } });
      }
      throw new Error(`unexpected ${url}`);
    };
    const adapter = new TikTokPublisher({ ...credentials, fetchImpl, sleep: noSleep, onRefreshToken: (token) => void rotated.push(token) });
    const result = await adapter.publish({ item: item(video, { kind: 'short', name: 'N1', title: 'Regen #shorts', hashtags: ['#neon', '#shorts'] }) });

    expect(result).toMatchObject({ remoteId: 'v_inbox_1', status: 'draft' });
    expect(result.manualSteps.join('\n')).toContain('Regen\n\n#neon');
    expect(rotated).toEqual(['rft.new-refresh-token']);
    const init = JSON.parse(String(calls.find((call) => call.url.endsWith('/init/'))!.init!.body));
    expect(init).toEqual({ source_info: { source: 'FILE_UPLOAD', video_size: 4000, chunk_size: 4000, total_chunk_count: 1 } });
    const put = calls.find((call) => call.url.startsWith('https://upload.tiktok'))!;
    expect(new Headers(put.init!.headers).get('content-range')).toBe('bytes 0-3999/4000');
    expect(statusPolls).toBe(2);
  });

  it('sends a meme caption as it is, not the title and hashtags', async () => {
    const video = await bytesFile(100);
    const caption = 'He printed the report anyway.\n\nBoom by Jane Doe (CC BY 4.0)\n\n#officeprank';
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith('/oauth/token/')) return json({ access_token: 'act.access', expires_in: 86400 });
      if (url.endsWith('/inbox/video/init/')) return json({ data: { publish_id: 'v_meme', upload_url: 'https://upload.tiktok.example/u' }, error: { code: 'ok' } });
      if (url === 'https://upload.tiktok.example/u') return new Response(null, { status: 201 });
      if (url.endsWith('/status/fetch/')) return json({ data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } });
      throw new Error(`unexpected ${url}`);
    };
    const adapter = new TikTokPublisher({ ...credentials, fetchImpl, sleep: noSleep });
    const result = await adapter.publish({ item: item(video, { title: 'Office prank', hashtags: ['#officeprank'], caption }) });
    expect(result.manualSteps.join('\n')).toContain(caption);
  });

  it('refreshes after access_token_invalid and explains the pending-draft limit', async () => {
    const video = await bytesFile(100);
    let tokens = 0;
    let inits = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith('/oauth/token/')) {
        tokens += 1;
        return json({ access_token: `act.${tokens}`, expires_in: 86400 });
      }
      if (url.endsWith('/init/')) {
        inits += 1;
        if (inits === 1) return json({ error: { code: 'access_token_invalid', message: 'expired' } }, 401);
        return json({ error: { code: 'spam_risk_too_many_pending_share', message: 'too many' } }, 403);
      }
      throw new Error(`unexpected ${url}`);
    };
    await expect(new TikTokPublisher({ ...credentials, fetchImpl, sleep: noSleep }).publish({ item: item(video) })).rejects.toThrow(/5 pending inbox uploads/);
    expect(tokens).toBe(2);
  });

  it('splits large files and builds the caption without #shorts', async () => {
    expect(tiktokChunks(3 * 1024 ** 2)).toEqual({ chunkSize: 3 * 1024 ** 2, count: 1 });
    expect(tiktokChunks(25 * 1024 ** 2)).toEqual({ chunkSize: 10 * 1024 ** 2, count: 2 });
    expect(tiktokCaption({ title: 'Ein Klick 🖱️ #satire #shorts', hashtags: ['#satire', '#ki', '#shorts'] })).toBe('Ein Klick 🖱️ #satire\n\n#ki');
    expect((await validateTikTokClient('k', 's', async () => json({ access_token: 'clt.x', expires_in: 7200 }))).status).toBe('valid');
    expect((await validateTikTokClient('k', 's', async () => json({ error: 'invalid_client' }))).status).toBe('invalid');
  });
});

describe('tokens, retries, and secrets', () => {
  it('reuses an access token until shortly before it expires', async () => {
    let clock = 0;
    let refreshes = 0;
    const token = new RefreshingToken(async () => ({ accessToken: `t${++refreshes}`, expiresInSeconds: 86_400 }), () => clock);
    expect(await token.get()).toBe('t1');
    clock = 23 * 3600 * 1000;
    expect(await token.get()).toBe('t1');
    clock = 24 * 3600 * 1000;
    expect(await token.get()).toBe('t2');
    token.invalidate();
    expect(await token.get()).toBe('t3');
  });

  it('retries network errors and 5xx with backoff, then gives up with a masked message', async () => {
    const waits: number[] = [];
    let attempts = 0;
    const flaky: FetchLike = async () => {
      attempts += 1;
      if (attempts === 1) throw new Error('ECONNRESET');
      if (attempts === 2) return new Response('', { status: 502 });
      return json({ ok: true });
    };
    const response = await fetchWithRetry(flaky, 'https://api.example/x', {}, { sleep: async (ms) => void waits.push(ms), backoffMs: 100 });
    expect(response.status).toBe(200);
    expect(waits).toEqual([100, 200]);

    const down: FetchLike = async () => {
      throw new Error('connect failed with key super-secret-key');
    };
    await expect(fetchWithRetry(down, 'https://api.example/x', {}, { sleep: noSleep, attempts: 2, secrets: ['super-secret-key'] })).rejects.toThrow(
      /api\.example: connect failed with key \*\*\*/,
    );
  });

  it('masks bearer tokens, token fields, and codes', () => {
    const text = redactSecrets('Bearer abc.def {"access_token":"tok123","refresh_token": "r456"} ?code=4/xyz&state=1 client_secret=shh');
    expect(text).not.toMatch(/abc\.def|tok123|r456|4\/xyz|shh/);
    expect(text).toContain('state=1');
  });
});

describe('publish-auth', () => {
  it('catches the redirect on localhost, exchanges the code with PKCE, and stores the refresh token in .env', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-publish-auth-'));
    temporary.push(dir);
    const envPath = join(dir, '.env');
    await writeFile(envPath, 'FAL_KEY=\n');
    const saved = { ...process.env };
    process.env.YOUTUBE_CLIENT_ID = 'client.apps.googleusercontent.com';
    process.env.YOUTUBE_CLIENT_SECRET = 'GOCSPX-secret';
    const lines: string[] = [];
    let tokenBody = '';
    try {
      await publishAuth('youtube', {
        envPath,
        log: (line) => void lines.push(line),
        timeoutMs: 5_000,
        open: (url) => {
          const consent = new URL(url);
          expect(consent.searchParams.get('scope')).toBe('https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.force-ssl');
          expect(consent.searchParams.get('code_challenge_method')).toBe('S256');
          const redirect = new URL(consent.searchParams.get('redirect_uri')!);
          redirect.searchParams.set('state', 'forged');
          redirect.searchParams.set('code', 'evil');
          const real = new URL(consent.searchParams.get('redirect_uri')!);
          real.searchParams.set('state', consent.searchParams.get('state')!);
          real.searchParams.set('code', '4/good-code');
          void fetch(redirect).then(() => fetch(real));
        },
        fetchImpl: async (_url, init) => {
          tokenBody = String(init?.body);
          return json({ access_token: 'ya29.x', refresh_token: '1//stored-refresh', expires_in: 3600 });
        },
      });
      const env = await readFile(envPath, 'utf8');
      expect(env).toContain('YOUTUBE_REFRESH_TOKEN=1//stored-refresh');
      expect(env).toContain('FAL_KEY=');
      expect(tokenBody).toContain('code=4%2Fgood-code');
      expect(tokenBody).toContain('code_verifier=');
      expect(lines.join('\n')).not.toContain('stored-refresh');
    } finally {
      process.env = saved;
    }
  });
});

describe('doctor', () => {
  it('reports publish credentials without making calls', () => {
    const checks = publishChecks({ YOUTUBE_CLIENT_ID: 'id', YOUTUBE_CLIENT_SECRET: 's', TIKTOK_CLIENT_KEY: 'k', TIKTOK_CLIENT_SECRET: 's', TIKTOK_REFRESH_TOKEN: 'r' });
    expect(checks.map((check) => [check.id, check.ok, check.required])).toEqual([
      ['youtube-publish', false, false],
      ['tiktok-publish', true, false],
      ['x-autopilot', false, false],
      ['linkedin-autopilot', false, false],
      ['instagram-autopilot', false, false],
    ]);
    expect(checks[0]!.detail).toContain('publish-auth youtube');
    expect(JSON.stringify(checks)).not.toMatch(/"r"|"s"/);
  });

  it('warns before the LinkedIn token runs out and asks for FAL_KEY beside Instagram', async () => {
    const { autopilotChecks } = await import('../packages/cli/src/doctor.ts');
    const checks = autopilotChecks(
      { LINKEDIN_ACCESS_TOKEN: 't', LINKEDIN_TOKEN_EXPIRES_AT: '2026-12-01T00:00:00Z', INSTAGRAM_ACCESS_TOKEN: 'i' },
      new Date('2026-11-25T00:00:00Z'),
    );
    const byId = Object.fromEntries(checks.map((check) => [check.id, check]));
    expect(byId['linkedin-autopilot']).toMatchObject({ ok: false, detail: expect.stringContaining('expires in 6 days') });
    expect(byId['instagram-autopilot']).toMatchObject({ ok: false, detail: expect.stringContaining('FAL_KEY') });
  });
});
