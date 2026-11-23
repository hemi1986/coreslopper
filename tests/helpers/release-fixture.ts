import { mkdir, mkdtemp, readFile, cp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { ProjectConfigSchema, ReleaseManifestSchema, createInitialState } from '../../packages/core/src/index.ts';
import type { ReleaseDeps } from '../../packages/cli/src/release.ts';
import type { MediaProbe } from '../../packages/cli/src/release-media.ts';

// A release project built from the demo's text files with placeholder renders,
// stills, and Shorts, and fake media tools: shared by the release folder and
// the release autopilot tests. Call `cleanupFixtures` in afterEach.

const temporary: string[] = [];
export async function cleanupFixtures(): Promise<void> {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
}

export const demo = join(process.cwd(), 'projects', 'demo');

/** A minimal JPEG header (SOI, APP0, SOF0) with the given size and colour components. */
export function jpeg(width: number, height: number, components = 3): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, components, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0]);
}

// ffprobe fixtures, keyed by what the file is.
export const videoProbe = (width: number, height: number, duration: number, audio = true): MediaProbe => ({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width, height, avg_frame_rate: '30/1', r_frame_rate: '30/1' },
    ...(audio ? [{ codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 }] : []),
  ],
  format: { duration: String(duration), format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
});
export const wavProbe = (codec = 'pcm_s24le', rate = '48000', channels = 2, duration = 12): MediaProbe => ({
  streams: [{ codec_type: 'audio', codec_name: codec, sample_rate: rate, channels, bits_per_sample: Number(codec.match(/\d+/)?.[0] ?? 0) }],
  format: { duration: String(duration), format_name: 'wav' },
});

/** Probes by file name and folder only: the random temp directory must never decide the result. */
export function fixtureProbe(overrides: Record<string, MediaProbe> = {}) {
  return (path: string): MediaProbe => {
    const [folder = '', name = ''] = path.split('/').slice(-2);
    for (const [key, probe] of Object.entries(overrides)) if (name.includes(key)) return probe;
    if (name.endsWith('.wav')) return wavProbe();
    if (name.startsWith('canvas')) return videoProbe(1080, 1920, 6, false);
    if (folder === 'shorts') return videoProbe(1080, 1920, 40);
    if (name.includes('9x16')) return videoProbe(1080, 1920, 12);
    if (name.includes('1x1')) return videoProbe(1080, 1080, 12);
    return videoProbe(1920, 1080, 12);
  };
}

export const RELEASE = {
  distributor: 'distrokid',
  artist: 'Neon Static',
  title: 'Neon Rain',
  primary_genre: 'Electronic',
  secondary_genre: 'Synthwave',
  language: 'de',
  explicit: false,
  release_date: '2026-12-11',
  songwriters: ['Erika Mustermann'],
  ai_credits: { lyrics: 'none', music: 'full', vocals: 'full', instrumental: 'full' },
  ai_tool: 'Suno',
  license_note: 'Suno Pro plan',
};

export function uploadYaml() {
  const short = (name: string, n: number) => ({
    name,
    moment: `Moment ${n}`,
    file: `renders/shorts/${name}-9x16.mp4`,
    thumbnail: `renders/shorts/${name}-thumb.jpg`,
    title: `Regen ${n} 🌧️ #synthwave #shorts`,
    description: `Moment ${n}.\nGanzes Video: Link oben ☝️`,
    hashtags: ['#synthwave', '#shorts'],
    instagram: { caption: `Reel ${n}: Neonregen.`, hashtags: ['#synthwave', '#neon'], cover_frame: 1.5, story: `Neu: Teil ${n}` },
    tiktok: { caption: `Teil ${n} im Regen`, hashtags: ['#synthwave'], overlay: 'Ganzes Video auf YouTube: @neonstatic' },
  });
  return {
    version: 1,
    language: 'de',
    main: {
      file: 'renders/16x9.mp4',
      title: 'Neon Rain — ein Spaziergang im Regen',
      description: 'Zwölf Sekunden Neonregen.',
      hashtags: ['#synthwave', '#neon'],
      tags: ['synthwave', 'neon rain'],
      thumbnail: 'renders/thumbnails/b.jpg',
      alternate_thumbnails: ['renders/thumbnails/a.jpg', 'renders/thumbnails/c.jpg'],
      pinned_comment: 'Welcher Moment ist eurer?',
      community_post: 'Neues Video ist da!',
    },
    shorts: [short('Z1-intro', 1), short('Z2-chorus', 2), short('Z3-outro', 3)],
    spotify: { artist_pick: 'Neu: Neon Rain', pitch: 'Treibender Synthwave mit Regen und Neon.' },
    instagram_post: { caption: 'Neon Rain, das ganze Video im Feed.', hashtags: ['#synthwave'] },
    announcement: { text: 'Freitag: Neon Rain.', hashtags: ['#synthwave'] },
    x: { post: 'Neon Rain ist da. Zwölf Sekunden Regen.', hashtags: ['#synthwave'], reply: 'Ganzes Video:', media: 'Z1-intro' },
    linkedin: {
      decision: 'post',
      reason: 'The video is about how an AI pipeline makes a music video.',
      post: 'Ein Musikvideo, komplett von einer KI-Pipeline gebaut.\n\nWas ich dabei gelernt habe.',
      hashtags: ['#KI'],
    },
    microsite: { teaser: 'Zwölf Sekunden Neonregen.', text: 'Ein Spaziergang im Regen.', quote: 'Neon im Regen' },
  };
}

/** A project from the demo's text files, with placeholder renders, stills, and Shorts. */
export async function fixture(options: { release?: boolean; upload?: boolean } = {}): Promise<string> {
  const base = await mkdtemp(join(tmpdir(), 'coreslopper-release-'));
  temporary.push(base);
  const dir = join(base, 'projects', 'neon');
  await mkdir(dir, { recursive: true });
  for (const file of ['timing.json', 'timing.overrides.json', 'storyboard.yaml', 'style.yaml', 'characters.yaml', 'lyrics.txt', 'song.json', 'state.json']) {
    await cp(join(demo, file), join(dir, file));
  }
  const config = parse(await readFile(join(demo, 'project.yaml'), 'utf8')) as Record<string, unknown>;
  config.slug = 'neon';
  if (options.release !== false) config.release = RELEASE;
  await writeFile(join(dir, 'project.yaml'), stringify(config));
  const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
  state.project = 'neon';
  await writeFile(join(dir, 'state.json'), JSON.stringify(state));
  await mkdir(join(dir, 'renders', 'thumbnails'), { recursive: true });
  await mkdir(join(dir, 'renders', 'shorts'), { recursive: true });
  await mkdir(join(dir, 'audio'), { recursive: true });
  await mkdir(join(dir, 'review'), { recursive: true });
  for (const format of ['16x9', '9x16', '1x1']) await writeFile(join(dir, 'renders', `${format}.mp4`), `render ${format}`);
  for (const name of ['a', 'b', 'c']) await writeFile(join(dir, 'renders', 'thumbnails', `${name}.jpg`), Buffer.concat([jpeg(1280, 720), Buffer.from(name)]));
  for (const name of ['Z1-intro', 'Z2-chorus', 'Z3-outro']) {
    await writeFile(join(dir, 'renders', 'shorts', `${name}-9x16.mp4`), `short ${name}`);
    await writeFile(join(dir, 'renders', 'shorts', `${name}-thumb.jpg`), Buffer.concat([jpeg(1080, 1920), Buffer.from(name)]));
    await writeFile(join(dir, 'renders', 'shorts', `${name}-tiktok.jpg`), Buffer.concat([jpeg(1080, 1440), Buffer.from(name)]));
  }
  await writeFile(join(dir, 'renders', 'cover-3000x3000.jpg'), jpeg(3000, 3000));
  // The recipe `thumbnail` writes beside the cover: the still the announcement images are composed from.
  await mkdir(join(dir, 'assets', 'image'), { recursive: true });
  await writeFile(join(dir, 'assets', 'image', 'hero.png'), 'still');
  await writeFile(
    join(dir, 'renders', 'cover-3000x3000.recipe.json'),
    JSON.stringify({ version: 1, still: 'assets/image/hero.png', format: '1x1', text: 'NEON STATIC|NEON RAIN', focus: '0.5,0.35' }),
  );
  await writeFile(join(dir, 'audio', 'song.wav'), 'RIFF song');
  if (options.upload !== false) await writeFile(join(dir, 'review', 'upload.yaml'), stringify(uploadYaml()));
  return dir;
}

/** The upload data of a meme: its one 9:16 video, posted on YouTube Shorts, TikTok, and Instagram Reels. */
export function memeUploadYaml() {
  return {
    version: 1,
    language: 'en',
    main: {
      file: 'renders/9x16.mp4',
      title: 'Office prank',
      description: 'He printed the report anyway.',
      hashtags: ['#officeprank'],
      tags: ['office prank'],
    },
  };
}

/**
 * A meme workspace: `projects/office-prank/` with a 9:16 render, its cover, the
 * upload data, one take copied from the library sound `vine-boom`, and the
 * workspace sound library that take came from.
 */
export async function memeFixture(options: { licence?: string; credit?: string } = {}): Promise<{ dir: string; root: string }> {
  const base = await mkdtemp(join(tmpdir(), 'coreslopper-release-meme-'));
  temporary.push(base);
  const root = join(base, 'workspace');
  const dir = join(root, 'projects', 'office-prank');
  await mkdir(join(dir, 'renders'), { recursive: true });
  await mkdir(join(dir, 'review'), { recursive: true });
  const config = ProjectConfigSchema.parse({
    version: 1,
    slug: 'office-prank',
    kind: 'meme',
    title: 'Office prank',
    created: '2026-11-22T00:00:00Z',
    workflow: { version: '0.1.0' },
    budget_usd: 10,
    formats: { master: { aspect: '9:16', width: 1080, height: 1920, fps: 30 } },
  });
  await writeFile(join(dir, 'project.yaml'), stringify(config));
  await writeFile(join(dir, 'state.json'), JSON.stringify(createInitialState(config, '0.1.0')));
  await cp(join(demo, 'timing.json'), join(dir, 'timing.json'));
  await writeFile(
    join(dir, 'takes.json'),
    JSON.stringify({ version: 1, takes: { reveal: { source: 'library:vine-boom', duration: 1.4, text_hash: 'prank' } }, ambience: {} }),
  );
  await writeFile(join(dir, 'renders', '9x16.mp4'), 'render 9x16');
  await writeFile(join(dir, 'renders', 'cover-1080x1920.jpg'), jpeg(1080, 1920));
  await writeFile(join(dir, 'review', 'upload.yaml'), stringify(memeUploadYaml()));
  const sound = join(root, 'library', 'sounds', 'vine-boom');
  await mkdir(sound, { recursive: true });
  await writeFile(
    join(sound, 'sound.yaml'),
    stringify({
      version: 1,
      id: 'vine-boom',
      title: 'Vine boom',
      use_when: 'a reveal falls flat',
      tags: ['boom'],
      length: 1.4,
      loudness: -10,
      licence: options.licence ?? 'cc-by',
      ...(options.credit ? { credit: options.credit } : {}),
      hash: 'a'.repeat(64),
      added: '2026-11-22',
    }),
  );
  await writeFile(join(sound, 'sound.wav'), 'RIFF sound');
  return { dir, root };
}

export interface FakeDeps extends Partial<ReleaseDeps> {
  ffmpegCalls: string[][];
  renders: string[];
  thumbnails: { text: string; format?: string; out: string; scrim?: number; textOffset?: number }[];
}

export function fakeDeps(overrides: Partial<ReleaseDeps> = {}, probes: Record<string, MediaProbe> = {}): FakeDeps {
  const deps: FakeDeps = {
    ffmpegCalls: [],
    renders: [],
    thumbnails: [],
    thumbnail: async (options) => {
      deps.thumbnails.push({
        text: options.text,
        format: options.format,
        out: options.out,
        ...(options.scrim !== undefined ? { scrim: options.scrim } : {}),
        ...(options.textOffset !== undefined ? { textOffset: options.textOffset } : {}),
      });
      const size = { '9x16': [1080, 1920], '16x9': [1280, 720], '4x5': [1080, 1350] }[options.format ?? '16x9'] ?? [1280, 720];
      await writeFile(options.out, Buffer.concat([jpeg(size[0]!, size[1]!), Buffer.from(options.text)]));
      return options.out;
    },
    probe: fixtureProbe(probes),
    ffmpeg: async (args) => {
      deps.ffmpegCalls.push(args);
      if (args.some((arg) => arg.startsWith('silencedetect'))) return '';
      await writeFile(args.at(-1)!, `ffmpeg output ${args.join(' ')}`);
      return '';
    },
    render: async (projectDir, format) => {
      deps.renders.push(format);
      const file = join(projectDir, 'renders', `${format}.mp4`);
      await writeFile(file, `fresh render ${format}`);
      return file;
    },
    inputsHash: async () => undefined,
    now: () => new Date('2026-11-16T12:00:00Z'),
    log: () => undefined,
    ...overrides,
  };
  return deps;
}

export async function tree(dir: string): Promise<string[]> {
  const manifest = ReleaseManifestSchema.parse(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')));
  return manifest.files.map((file) => file.path).sort();
}

