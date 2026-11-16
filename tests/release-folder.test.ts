import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel (with <ID> placeholders) must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { existsSync } from 'node:fs';
import { cp, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import {
  ChannelConfigSchema,
  ProjectConfigSchema,
  ReleaseManifestSchema,
  ReleaseMetadataSchema,
  UploadDataSchema,
  buildLrc,
  buildLyricsSrt,
  canvasWindow,
  chapterProblems,
  chaptersFromSections,
  channelTodos,
  planDate,
  plainLyrics,
  platformLimits,
  platformTextProblems,
  readYamlFile,
  releaseTodos,
  unmarkedPlaceholders,
  type Timing,
} from '../packages/core/src/index.ts';
import { buildRelease, type ReleaseDeps } from '../packages/cli/src/release.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import {
  canvasArgs,
  canvasProblems,
  parseSilence,
  videoProblems,
  wavConvertArgs,
  audioFacts,
  wavProblems,
  type MediaProbe,
} from '../packages/cli/src/release-media.ts';
import { releaseTexts, type ReleaseTextInput } from '../packages/cli/src/release-texts.ts';
import { thumbnailProblems } from '../packages/cli/src/thumbnail-files.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { coverTextProblem, layoutSquare, thumbnailSize, type LineMetrics } from '../packages/remotion/src/lib/thumbnail.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

const demo = join(process.cwd(), 'projects', 'demo');

/** A minimal JPEG header (SOI, APP0, SOF0) with the given size and colour components. */
function jpeg(width: number, height: number, components = 3): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, components, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0]);
}

// ffprobe fixtures, keyed by what the file is.
const videoProbe = (width: number, height: number, duration: number, audio = true): MediaProbe => ({
  streams: [
    { codec_type: 'video', codec_name: 'h264', width, height, avg_frame_rate: '30/1', r_frame_rate: '30/1' },
    ...(audio ? [{ codec_type: 'audio', codec_name: 'aac', sample_rate: '48000', channels: 2 }] : []),
  ],
  format: { duration: String(duration), format_name: 'mov,mp4,m4a,3gp,3g2,mj2' },
});
const wavProbe = (codec = 'pcm_s24le', rate = '48000', channels = 2, duration = 12): MediaProbe => ({
  streams: [{ codec_type: 'audio', codec_name: codec, sample_rate: rate, channels, bits_per_sample: Number(codec.match(/\d+/)?.[0] ?? 0) }],
  format: { duration: String(duration), format_name: 'wav' },
});

/** Probes by file name and folder only: the random temp directory must never decide the result. */
function fixtureProbe(overrides: Record<string, MediaProbe> = {}) {
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

const RELEASE = {
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

function uploadYaml() {
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
  };
}

/** A project from the demo's text files, with placeholder renders, stills, and Shorts. */
async function fixture(options: { release?: boolean; upload?: boolean } = {}): Promise<string> {
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
  }
  await writeFile(join(dir, 'renders', 'cover-3000x3000.jpg'), jpeg(3000, 3000));
  await writeFile(join(dir, 'audio', 'song.wav'), 'RIFF song');
  if (options.upload !== false) await writeFile(join(dir, 'review', 'upload.yaml'), stringify(uploadYaml()));
  return dir;
}

interface FakeDeps extends Partial<ReleaseDeps> {
  ffmpegCalls: string[][];
  renders: string[];
}

function fakeDeps(overrides: Partial<ReleaseDeps> = {}, probes: Record<string, MediaProbe> = {}): FakeDeps {
  const deps: FakeDeps = {
    ffmpegCalls: [],
    renders: [],
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

async function tree(dir: string): Promise<string[]> {
  const manifest = ReleaseManifestSchema.parse(JSON.parse(await readFile(join(dir, 'manifest.json'), 'utf8')));
  return manifest.files.map((file) => file.path).sort();
}

describe('release schemas', () => {
  it('accept the channel template and example, and a project with a release block', async () => {
    for (const file of ['channel.yaml', 'channel.example.yaml']) {
      const channel = await readYamlFile(join(process.cwd(), 'templates', 'channel', file), ChannelConfigSchema);
      expect(channel.disclosure.youtube_synthetic).toBe(true);
    }
    const config = parse(await readFile(join(demo, 'project.yaml'), 'utf8'));
    expect(ProjectConfigSchema.parse({ ...config, release: RELEASE }).release?.ai_credits?.music).toBe('full');
    expect(ChannelConfigSchema.parse({ version: 1, name: 'x', language: 'de' }).footer.links).toEqual([]);
  });

  it('reject invented-looking or malformed facts', () => {
    expect(ReleaseMetadataSchema.safeParse({ isrc: 'ABC' }).success).toBe(false);
    expect(ReleaseMetadataSchema.safeParse({ release_date: '11.12.2026' }).success).toBe(false);
    expect(ReleaseMetadataSchema.safeParse({ ai_credits: { music: 'some' } }).success).toBe(false);
    expect(ReleaseMetadataSchema.parse({ isrc: 'DE-ABC-26-00001' }).distributor).toBe('manual');
    expect(UploadDataSchema.safeParse(uploadYaml()).success).toBe(true);
  });

  it('validate config/channel.yaml through validate-file', async () => {
    const base = await mkdtemp(join(tmpdir(), 'coreslopper-channel-'));
    temporary.push(base);
    await mkdir(join(base, 'config'));
    await cp(join(process.cwd(), 'templates', 'channel', 'channel.example.yaml'), join(base, 'config', 'channel.yaml'));
    expect(await validateChangedFile(join(base, 'config', 'channel.yaml'))).toBe('channel');
    await writeFile(join(base, 'config', 'channel.yaml'), 'version: 1\nname: x\n');
    await expect(validateChangedFile(join(base, 'config', 'channel.yaml'))).rejects.toThrow(/Invalid/);
  });
});

describe('lyrics, chapters, canvas window', () => {
  const timing = (sections: [string, number, number][], lines: [number, number][] = []): Timing => ({
    version: 1,
    audio: { path: 'audio/song.wav', duration: sections.at(-1)![2], sampleRate: 48000 },
    beats: [],
    downbeats: [],
    onsets: [],
    energy: { hop: 512, fps: 10, values: [] },
    sections: sections.map(([id, start, end]) => ({ id, label: id, start, end, confidence: 1, sources: [] })),
    lines: lines.map(([start, end], index) => ({ id: `l${index}`, section: sections[0]![0], start, end, text: `Line ${index}`, words: [] })),
    meta: {},
  });

  it('strips section tags and writes LRC and SRT from the timing', async () => {
    expect(plainLyrics('[Intro]\nNeon rain\n\n\n[Chorus]\nWe are (electric)\n')).toBe('Neon rain\n\nWe are (electric)\n');
    const t = timing([['a', 0, 30]], [[1.5, 3], [10, 12]]);
    expect(buildLrc(t, { artist: 'A', title: 'T', length: 30 })).toBe('[ar:A]\n[ti:T]\n[length:00:30]\n[00:01.50]Line 0\n[00:03.00]\n[00:10.00]Line 1\n[00:12.00]\n');
    expect(buildLyricsSrt(t)).toContain('00:00:01,500 --> 00:00:03,000\nLine 0');
  });

  it('merges short sections and drops chapters YouTube would ignore', () => {
    const chapters = chaptersFromSections(timing([['intro', 0, 8], ['verse', 8, 40], ['chorus', 40, 70], ['bridge', 70, 100], ['outro', 100, 105]]));
    expect(chapters).toEqual([
      { start: 0, title: 'intro' },
      { start: 40, title: 'chorus' },
      { start: 70, title: 'bridge' },
    ]);
    expect(chaptersFromSections(timing([['a', 0, 20], ['b', 20, 40]]))).toEqual([]);
    expect(chapterProblems([{ start: 5, title: 'x' }], 60)).toContain('the first chapter must start at 0:00');
  });

  it('prefers a canvas window without lyrics near the first chorus', () => {
    const t = timing([['verse', 0, 20], ['chorus_1', 20, 40], ['outro', 40, 60]], [[20, 24], [25, 30]]);
    t.beats = Array.from({ length: 120 }, (_, i) => i * 0.5);
    const window = canvasWindow(t);
    expect(window.textFree).toBe(true);
    expect(window.start).toBeGreaterThanOrEqual(30);
    expect(window.length).toBe(6);
    expect(canvasWindow(t, { start: 21, length: 12 })).toMatchObject({ start: 21, length: 8, textFree: false });
  });

  it('dates the release plan from the release day', () => {
    expect(planDate('2026-12-11', -21)).toBe('2026-11-20');
    expect(planDate('2026-12-11', 4)).toBe('2026-12-15');
  });
});

describe('TODO detection and text limits', () => {
  it('reports every missing release fact and never fills one in', () => {
    expect(releaseTodos(undefined)[0]).toContain('release: block');
    const todos = releaseTodos(ReleaseMetadataSchema.parse({ ai_credits: { music: 'full' } }), undefined, { artist: 'From song.json', title: 'T' });
    expect(todos).toEqual(
      expect.arrayContaining([
        'release.primary_genre is not set',
        'release.songwriters (legal names, from the user) is not set',
        'release.ai_credits.lyrics is not set (none | partial | full)',
        'release.ai_tool is not set',
      ]),
    );
    expect(todos.join()).not.toContain('release.artist');
    expect(releaseTodos(ReleaseMetadataSchema.parse(RELEASE))).toEqual([]);
  });

  it('finds <ID> placeholders and unmarked ones', () => {
    const channel = ChannelConfigSchema.parse({ version: 1, name: 'x', language: 'de', links: { spotify: { url: 'https://open.spotify.com/artist/<ID>' }, youtube: { handle: '@x' } } });
    expect(channelTodos(channel)).toEqual(['config/channel.yaml: links.spotify still holds <ID>']);
    expect(unmarkedPlaceholders('ok\nspotify: <ID> TODO: links\nlink <ID>\n')).toEqual(['link <ID>']);
  });

  it('checks the platform limits and asks for one text per platform', () => {
    const data = UploadDataSchema.parse(uploadYaml());
    expect(platformTextProblems(data, platformLimits())).toEqual({ errors: [], missing: [] });
    const broken = uploadYaml();
    broken.shorts[0]!.instagram.hashtags = ['#a', '#b', '#c', '#d', '#e', '#f'];
    broken.shorts[1]!.tiktok.caption = broken.shorts[1]!.instagram.caption;
    (broken as { spotify: { pitch: string } }).spotify.pitch = 'x'.repeat(501);
    const { errors } = platformTextProblems(UploadDataSchema.parse(broken), platformLimits());
    expect(errors.join('\n')).toContain('instagram Z1-intro: 6 hashtags, limit 5');
    expect(errors.join('\n')).toContain('Z2-chorus: the Instagram and TikTok captions are identical');
    expect(errors.join('\n')).toContain('spotify: pitch has 501 characters, limit 500');
    const lenient = ChannelConfigSchema.parse({ version: 1, name: 'x', language: 'de', limits: { instagram: { hashtags: 10 } } });
    expect(platformTextProblems(UploadDataSchema.parse(broken), platformLimits(lenient)).errors.join()).not.toContain('6 hashtags');
  });

  it('lays out per-platform texts in the project language with channel links and TODOs', () => {
    const channel = ChannelConfigSchema.parse({
      version: 1,
      name: 'Neon Static',
      language: 'de',
      links: { youtube: { handle: '@neonstatic' }, spotify: { url: 'https://open.spotify.com/artist/<ID>' } },
      footer: { tool_credit: 'Gemacht mit coreslopper', song_credit: '{artist} – {title} ({ai_tool})', links: ['spotify'] },
    });
    const input: ReleaseTextInput = {
      kind: 'music-video',
      language: 'de',
      slug: 'neon',
      artist: 'Neon Static',
      title: 'Neon Rain',
      data: UploadDataSchema.parse(uploadYaml()),
      release: ReleaseMetadataSchema.parse(RELEASE),
      channel,
      limits: platformLimits(channel),
      chapters: [
        { start: 0, title: 'Intro' },
        { start: 40, title: 'Refrain' },
        { start: 70, title: 'Bridge' },
      ],
      files: { master: 'video/neon-16x9.mp4', thumbnails: ['thumbnails/thumb-1.jpg'], shorts: [{ name: 'Z1-intro', video: 'shorts/Z1-intro-9x16.mp4' }] },
    };
    const texts = releaseTexts(input);
    expect(Object.keys(texts)).toEqual(['youtube.md', 'shorts.md', 'instagram.md', 'tiktok.md', 'spotify.md', 'release-plan.md']);
    expect(texts['youtube.md']).toContain('## Beschreibung');
    expect(texts['youtube.md']).toContain('0:00 Intro\n0:40 Refrain\n1:10 Bridge');
    expect(texts['youtube.md']).toContain('Neon Static – Neon Rain (Suno)');
    expect(texts['youtube.md']).toMatch(/spotify: https:\/\/open\.spotify\.com\/artist\/<ID> TODO/);
    expect(texts['instagram.md']).toContain('2/5 Hashtags');
    expect(texts['instagram.md']).toContain('Link-Sticker');
    expect(texts['tiktok.md']).toContain('KI-generierter Inhalt');
    expect(texts['spotify.md']).toMatch(/1\. \*\*Künstler:\*\* Neon Static/);
    expect(texts['spotify.md']).toContain('Musik: vollständig KI');
    expect(texts['release-plan.md']).toContain('| -21 | 2026-11-20 |');
    for (const text of Object.values(texts)) expect(unmarkedPlaceholders(text)).toEqual([]);
    expect(texts['instagram.md']).not.toBe(texts['tiktok.md']);
  });
});

describe('media specifications (ffprobe fixtures)', () => {
  it('checks formats, WAV, and canvas', () => {
    expect(videoProblems(videoProbe(1920, 1080, 12), { width: 1920, height: 1080, fps: 30, duration: 12 })).toEqual([]);
    expect(videoProblems(videoProbe(1280, 720, 11, false), { width: 1920, height: 1080, fps: 30, duration: 12 })).toEqual([
      '1280x720, expected 1920x1080',
      '11.00 s, expected 12.00 s',
      'no audio track',
    ]);
    expect(wavProblems(wavProbe(), 12)).toEqual([]);
    expect(wavProblems(wavProbe('pcm_f32le', '22050', 1, 13), 12)).toEqual([
      'pcm_f32le, expected PCM 16 or 24 bit',
      '22050 Hz, at least 44100',
      '1 channel(s), expected stereo',
      '13.000 s, song.json says 12.000 s',
    ]);
    expect(canvasProblems(videoProbe(1080, 1920, 6, false))).toEqual([]);
    expect(canvasProblems(videoProbe(360, 640, 9, true))).toEqual(['9.00 s, expected 3–8 s', '640 px high, at least 720', 'has an audio track; a canvas is silent']);
  });

  it('converts to 24-bit PCM without loudness changes and builds a seamless loop', () => {
    const args = wavConvertArgs('in.wav', 'out.wav', audioFacts(wavProbe('pcm_f32le', '44100')));
    expect(args).toEqual(expect.arrayContaining(['-c:a', 'pcm_s24le', '-ar', '44100', '-ac', '2', '-threads', '6']));
    expect(args.join(' ')).not.toMatch(/loudnorm|volume|dynaudnorm/);
    const canvas = canvasArgs('in.mp4', 'out.mp4', { start: 20, length: 6 }, 30);
    expect(canvas.join(' ')).toContain('xfade=transition=fade:duration=0.5:offset=5.500');
    expect(canvas).toEqual(expect.arrayContaining(['-an', '-ss', '20.000', '-t', '6.500', '-threads', '6']));
    expect(parseSilence('silence_start: 0\nsilence_end: 2.6\nsilence_start: 200.5\n', 203)).toEqual({ lead: 2.6, tail: 2.5 });
  });
});

describe('streaming cover', () => {
  it('allows artist and title only, at 3000x3000 RGB', async () => {
    expect(coverTextProblem('NEON STATIC|NEON RAIN')).toBeUndefined();
    expect(coverTextProblem('NOW ON SPOTIFY')).toContain('platform name');
    expect(coverTextProblem('@NEONSTATIC')).toContain('handle');
    expect(coverTextProblem('WWW.NEON.DE')).toContain('URL');
    expect(coverTextProblem('ONLY 0.99 €')).toContain('price');
    const metrics: LineMetrics[] = [{ left: 0, width: 600, ascent: 72, descent: 18 }, { left: 0, width: 400, ascent: 72, descent: 18 }];
    const layout = layoutSquare(metrics);
    const frame = thumbnailSize('1x1');
    for (const slab of layout.slabs) {
      expect(slab.x).toBeGreaterThanOrEqual(0);
      expect(slab.x + slab.width).toBeLessThanOrEqual(frame.width);
      expect(slab.y + slab.height).toBeLessThanOrEqual(frame.height);
      expect(slab.rotate).toBe(0);
    }
    const base = await mkdtemp(join(tmpdir(), 'coreslopper-cover-'));
    temporary.push(base);
    await writeFile(join(base, 'rgb.jpg'), jpeg(3000, 3000));
    await writeFile(join(base, 'cmyk.jpg'), jpeg(3000, 3000, 4));
    expect(await thumbnailProblems(join(base, 'rgb.jpg'), '1x1')).toEqual([]);
    expect(await thumbnailProblems(join(base, 'cmyk.jpg'), '1x1')).toEqual(['4 colour components, expected RGB']);
  });
});

describe('release folder', () => {
  it('builds the documented structure, manifest, and texts', async () => {
    const dir = await fixture();
    const deps = fakeDeps();
    const result = await buildRelease({ projectDir: dir, deps });
    expect(result.errors).toEqual([]);
    expect(await tree(result.dir)).toEqual([
      'README.md',
      'audio/Neon Static - Neon Rain.wav',
      'shorts/Z1-intro-9x16.mp4',
      'shorts/Z1-intro-thumb.jpg',
      'shorts/Z2-chorus-9x16.mp4',
      'shorts/Z2-chorus-thumb.jpg',
      'shorts/Z3-outro-9x16.mp4',
      'shorts/Z3-outro-thumb.jpg',
      'streaming/canvas-9x16.mp4',
      'streaming/cover-3000x3000.jpg',
      'streaming/lyrics.lrc',
      'streaming/lyrics.txt',
      'texts/instagram.md',
      'texts/release-plan.md',
      'texts/shorts.md',
      'texts/spotify.md',
      'texts/tiktok.md',
      'texts/youtube.md',
      'thumbnails/thumb-1.jpg',
      'thumbnails/thumb-2.jpg',
      'thumbnails/thumb-3.jpg',
      'video/neon-16x9.mp4',
      'video/neon-1x1.mp4',
      'video/neon-9x16.mp4',
      'video/neon.de.srt',
    ]);
    // The upload thumbnail comes first; large files are the renders' bytes.
    expect((await readFile(join(result.dir, 'thumbnails', 'thumb-1.jpg'))).toString('latin1').endsWith('b')).toBe(true);
    expect(await readFile(join(result.dir, 'video', 'neon-16x9.mp4'), 'utf8')).toBe('render 16x9');
    expect(await readFile(join(result.dir, 'streaming', 'lyrics.txt'), 'utf8')).not.toContain('[Chorus]');
    expect(result.manifest.files.find((file) => file.path === 'streaming/canvas-9x16.mp4')!.spec).toMatchObject({ seconds: 6, audio: false });
    // The release is complete: only the canvas still shows lyrics in the 12 s demo.
    expect(result.todos.filter((todo) => !todo.includes('canvas window'))).toEqual([]);
    expect(await readFile(join(result.dir, 'README.md'), 'utf8')).toContain('## Offene TODOs');
    expect(deps.renders).toEqual([]);
  });

  it('is idempotent: a second run runs no ffmpeg job and rewrites nothing', async () => {
    const dir = await fixture();
    const deps = fakeDeps();
    const first = await buildRelease({ projectDir: dir, deps });
    const calls = deps.ffmpegCalls.filter((args) => !args.some((arg) => arg.startsWith('silencedetect'))).length;
    const before = await stat(join(first.dir, 'texts', 'youtube.md'));
    const second = await buildRelease({ projectDir: dir, deps });
    expect(deps.ffmpegCalls.filter((args) => !args.some((arg) => arg.startsWith('silencedetect'))).length).toBe(calls);
    expect((await stat(join(second.dir, 'texts', 'youtube.md'))).mtimeMs).toBe(before.mtimeMs);
    expect(second.manifest.files.map((file) => file.sha256)).toEqual(first.manifest.files.map((file) => file.sha256));
  });

  it('removes only its own stale files and keeps the user\'s', async () => {
    const dir = await fixture();
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    await writeFile(join(result.dir, 'notes.txt'), 'mine');
    await rm(join(dir, 'renders', 'shorts', 'Z3-outro-9x16.mp4'));
    await buildRelease({ projectDir: dir, deps: fakeDeps() });
    expect(existsSync(join(result.dir, 'shorts', 'Z3-outro-9x16.mp4'))).toBe(false);
    expect(existsSync(join(result.dir, 'notes.txt'))).toBe(true);
  });

  it('renders a missing or stale format, or lists it as a TODO with --no-render', async () => {
    const dir = await fixture();
    await rm(join(dir, 'renders', '1x1.mp4'));
    const noRender = await buildRelease({ projectDir: dir, render: false, deps: fakeDeps() });
    expect(noRender.todos.join()).toContain('renders/1x1.mp4 is missing');
    const deps = fakeDeps();
    await buildRelease({ projectDir: dir, deps });
    expect(deps.renders).toEqual(['1x1']);

    const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    state.artifacts['render:renders/16x9.mp4:inputs'] = 'old';
    await writeFile(join(dir, 'state.json'), JSON.stringify(state));
    const stale = fakeDeps({ inputsHash: async () => 'new' });
    await buildRelease({ projectDir: dir, deps: stale });
    expect(stale.renders).toEqual(['16x9']);
  });

  it('converts a non-deliverable song once', async () => {
    const dir = await fixture();
    const deps = fakeDeps({}, { 'song.wav': wavProbe('pcm_f32le', '44100') });
    await buildRelease({ projectDir: dir, deps });
    await buildRelease({ projectDir: dir, deps });
    const conversions = deps.ffmpegCalls.filter((args) => args.includes('pcm_s24le'));
    expect(conversions).toHaveLength(1);
  });

  it('turns missing facts and texts into TODOs, not failures', async () => {
    const dir = await fixture({ release: false, upload: false });
    await rm(join(dir, 'renders', 'cover-3000x3000.jpg'));
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    expect(result.todos.join('\n')).toMatch(/release: block in project.yaml is missing/);
    expect(result.todos.join('\n')).toMatch(/upload.yaml is missing/);
    expect(result.todos.join('\n')).toMatch(/cover-3000x3000.jpg is missing/);
    const spotify = await readFile(join(result.dir, 'texts', 'spotify.md'), 'utf8');
    expect(spotify).toContain('TODO: release.songwriters');
  });

  it('reports broken limits as errors', async () => {
    const dir = await fixture();
    const upload = uploadYaml();
    upload.main.title = 'x'.repeat(120);
    await writeFile(join(dir, 'review', 'upload.yaml'), stringify(upload));
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    expect(result.errors.join()).toContain('title has 120 characters, limit 100');
  });
});

describe('release QA', () => {
  it('passes a complete package and marks user gaps as TODO', async () => {
    const dir = await fixture();
    const deps = fakeDeps();
    await buildRelease({ projectDir: dir, deps });
    const checks = await releaseChecks(dir, deps.probe!);
    const result = Object.fromEntries(checks.map((check) => [check.name, check.result]));
    expect(checks.filter((check) => !['PASS', 'TODO'].includes(check.result))).toEqual([]);
    expect(result).toEqual({
      'Release files': 'PASS',
      'Release formats': 'PASS',
      'Release thumbnails': 'PASS',
      'Release Shorts': 'PASS',
      'Release audio': 'PASS',
      'Release cover': 'PASS',
      'Release canvas': 'TODO',
      'Release lyrics': 'PASS',
      'Release texts': 'PASS',
      'Release metadata': 'PASS',
    });
  });

  it('fails changed files, a stale render, and a bad WAV; missing metadata is TODO', async () => {
    const dir = await fixture({ release: false });
    const deps = fakeDeps();
    const result = await buildRelease({ projectDir: dir, deps });
    // A new render replaces the file (render.ts removes it first), which breaks the hardlink.
    await rm(join(dir, 'renders', '9x16.mp4'));
    await writeFile(join(dir, 'renders', '9x16.mp4'), 'newer render');
    await writeFile(join(result.dir, 'texts', 'tiktok.md'), 'edited');
    const checks = await releaseChecks(dir, fixtureProbe({ '.wav': wavProbe('pcm_s16le', '48000', 2, 30) }));
    const byName = Object.fromEntries(checks.map((check) => [check.name, check]));
    expect(byName['Release files']!.result).toBe('FAIL');
    expect(byName['Release formats']!.evidence).toContain('not the current renders/9x16.mp4');
    expect(byName['Release audio']!.evidence).toContain('song.json says 12.000 s');
    expect(byName['Release metadata']!.result).toBe('TODO');
  });

  it('is a single TODO before release ran', async () => {
    const dir = await fixture();
    expect(await releaseChecks(dir, fixtureProbe())).toEqual([{ name: 'Release package', result: 'TODO', evidence: 'renders/release/ is missing; run npm run cli -- release' }]);
  });
});
