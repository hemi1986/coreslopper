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
  addDays,
  plainLyrics,
  platformLimits,
  platformTextProblems,
  readYamlFile,
  releaseTodos,
  soundLicenceTodos,
  unmarkedPlaceholders,
  withReleaseDefaults,
  releaseIdentity,
  type Timing,
} from '../packages/core/src/index.ts';
import { buildRelease, type ReleaseDeps } from '../packages/cli/src/release.ts';
import { releaseChecks } from '../packages/cli/src/release-qa.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { loadCalendar, loadStatus, runCalendar } from '../packages/cli/src/release-calendar.ts';
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
import { footerLines, releaseLabels, releaseTexts, type ReleaseTextInput } from '../packages/cli/src/release-texts.ts';
import { thumbnailProblems, jpegSize } from '../packages/cli/src/thumbnail-files.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { coverTextProblem, layoutSquare, thumbnailSize, type LineMetrics } from '../packages/remotion/src/lib/thumbnail.ts';
import { RELEASE, cleanupFixtures, demo, diskTree, episodeFixture, fakeDeps, fixture, fixtureProbe, jpeg, memeFixture, memeUploadYaml, tree, uploadYaml, videoProbe, wavProbe } from './helpers/release-fixture.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
  await cleanupFixtures();
});

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
    // Unset means manual; only an unset distributor takes the channel's default.
    expect(ReleaseMetadataSchema.parse({ isrc: 'DE-ABC-26-00001' }).distributor).toBeUndefined();
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
    expect(addDays('2026-12-11', -21)).toBe('2026-11-20');
    expect(addDays('2026-12-11', 4)).toBe('2026-12-15');
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

  it('fills release facts from the channel defaults, and the project wins', () => {
    const channel = ChannelConfigSchema.parse({
      version: 1,
      name: 'x',
      language: 'de',
      release_defaults: { distributor: 'distrokid', songwriters: ['Erika Mustermann'], explicit: false, ai_credits: { lyrics: 'none', music: 'full', vocals: 'full', instrumental: 'full' }, ai_tool: 'Suno', license_note: 'Suno Pro plan', primary_genre: 'Electronic' },
    });
    const merged = withReleaseDefaults(ReleaseMetadataSchema.parse({ explicit: true, ai_credits: { lyrics: 'partial' }, release_date: '2026-12-11' }), channel)!;
    expect(merged).toMatchObject({ distributor: 'distrokid', songwriters: ['Erika Mustermann'], explicit: true, ai_tool: 'Suno', ai_credits: { lyrics: 'partial', music: 'full' } });
    expect(releaseTodos(merged, channel, { artist: 'Neon Static', title: 'Neon Rain' })).toEqual(['release.language is not set']);
    // Without defaults nothing changes.
    expect(withReleaseDefaults(undefined, undefined)).toBeUndefined();
    // The default artist reaches the identity; an explicit manual distributor stays manual.
    const artistChannel = ChannelConfigSchema.parse({ version: 1, name: 'x', language: 'de', release_defaults: { artist: 'Neon Static', distributor: 'distrokid' } });
    expect(releaseIdentity({ title: 'Neon Rain', release: withReleaseDefaults(undefined, artistChannel) }).artist).toBe('Neon Static');
    expect(withReleaseDefaults(ReleaseMetadataSchema.parse({ distributor: 'manual' }), artistChannel)!.distributor).toBe('manual');
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

  it('checks a meme caption with its credits against the platform limits', () => {
    const data = UploadDataSchema.parse(memeUploadYaml());
    expect(platformTextProblems(data, platformLimits(), { kind: 'meme' })).toEqual({ errors: [], missing: [] });
    const many = UploadDataSchema.parse({ ...memeUploadYaml(), main: { ...memeUploadYaml().main, hashtags: ['#a', '#b', '#c', '#d', '#e', '#f'] } });
    expect(platformTextProblems(many, platformLimits(), { kind: 'meme' }).errors).toContain('instagram: 6 hashtags, limit 5');
    const errors = platformTextProblems(data, platformLimits(), { kind: 'meme', credits: ['x'.repeat(2200)] }).errors.join('\n');
    expect(errors).toContain('tiktok: caption has');
    expect(errors).toContain('instagram: caption has');
    const long = UploadDataSchema.parse({ ...memeUploadYaml(), main: { ...memeUploadYaml().main, description: 'x'.repeat(5001) } });
    expect(platformTextProblems(long, platformLimits(), { kind: 'meme' }).errors.join('\n')).toContain('youtube short: description has');
    const tagged = UploadDataSchema.parse({ ...memeUploadYaml(), main: { ...memeUploadYaml().main, tags: ['x'.repeat(501)] } });
    expect(platformTextProblems(tagged, platformLimits(), { kind: 'meme' }).errors.join('\n')).toContain('youtube short: tags have');
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
    expect(Object.keys(texts)).toEqual(['youtube.md', 'shorts.md', 'instagram.md', 'tiktok.md', 'spotify.md', 'x.md', 'linkedin.md', 'release-plan.md']);
    expect(texts['youtube.md']).toContain('## Beschreibung');
    expect(texts['youtube.md']).toContain('0:00 Intro\n0:40 Refrain\n1:10 Bridge');
    expect(texts['youtube.md']).toContain('Neon Static – Neon Rain (Suno)');
    expect(texts['youtube.md']).toMatch(/spotify: https:\/\/open\.spotify\.com\/artist\/<ID> TODO/);
    expect(texts['instagram.md']).toContain('2/5 Hashtags');
    expect(texts['instagram.md']).toContain('Link-Sticker');
    expect(texts['tiktok.md']).toContain('KI-generierte Inhalte');
    expect(texts['tiktok.md']).toContain('Cover bearbeiten');
    expect(texts['tiktok.md']).not.toContain('Text-Overlay');
    expect(texts['spotify.md']).toMatch(/1\. \*\*Künstler:\*\* Neon Static/);
    expect(texts['spotify.md']).toContain('Musik: vollständig KI');
    expect(texts['release-plan.md']).toContain('TODO: no release calendar');
    expect(texts['x.md']).toContain('Ganzes Video: [Link zum Hauptvideo]');
    expect(texts['linkedin.md']).toContain('erster Absatz');
    for (const text of Object.values(texts)) expect(unmarkedPlaceholders(text)).toEqual([]);
    expect(texts['instagram.md']).not.toBe(texts['tiktok.md']);
    expect(footerLines({ ...input, kind: 'episode' }, releaseLabels('de'))).not.toContain('Neon Static – Neon Rain (Suno)');
    expect(footerLines({ ...input, kind: 'episode' }, releaseLabels('de'))).toContain('Gemacht mit coreslopper');
  });

  it('turns an unknown licence and an attribution without credit into sound TODOs', () => {
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'unknown' }])).toEqual([
      'sound vine-boom: the licence is unknown; decide whether it may be used (sound edit vine-boom --licence <licence|own>)',
    ]);
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'unknown (to check)' }])[0]).toContain('the licence is unknown');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'CC BY 4.0' }])).toEqual([
      'sound vine-boom: the licence "CC BY 4.0" asks for a credit that is missing (sound edit vine-boom --credit "...")',
    ]);
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'Creative Commons Attribution 4.0' }])[0]).toContain('asks for a credit');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'Creative Commons BY 4.0' }])[0]).toContain('asks for a credit');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'https://creativecommons.org/licenses/by/4.0/' }])[0]).toContain('asks for a credit');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'credit required' }])[0]).toContain('asks for a credit');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'attribute to Jane' }])[0]).toContain('asks for a credit');
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'cc-by-sa', credit: 'by Jane' }])).toEqual([]);
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'own' }])).toEqual([]);
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'public domain, no attribution required' }])).toEqual([]);
    expect(soundLicenceTodos([{ id: 'vine-boom', licence: 'Attribution not required' }])).toEqual([]);
    expect(soundLicenceTodos([{ id: 'gone' }])).toEqual(['sound gone: its entry is missing from the library, so its licence is unknown (sound list)']);
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
      'announce/post-16x9.jpg',
      'announce/story-9x16.jpg',
      'announce/teaser-9x16.mp4',
      'instagram/story-9x16.jpg',
      'audio/Neon Static - Neon Rain.wav',
      'calendar.ics',
      'shorts/Z1-intro-9x16.mp4',
      'shorts/Z1-intro-thumb.jpg',
      'shorts/Z1-intro-tiktok.jpg',
      'shorts/Z2-chorus-9x16.mp4',
      'shorts/Z2-chorus-thumb.jpg',
      'shorts/Z2-chorus-tiktok.jpg',
      'shorts/Z3-outro-9x16.mp4',
      'shorts/Z3-outro-thumb.jpg',
      'shorts/Z3-outro-tiktok.jpg',
      'streaming/canvas-9x16.mp4',
      'streaming/cover-3000x3000.jpg',
      'streaming/lyrics.lrc',
      'streaming/lyrics.txt',
      'texts/instagram.md',
      'texts/linkedin.md',
      'texts/release-plan.md',
      'texts/shorts.md',
      'texts/spotify.md',
      'texts/tiktok.md',
      'texts/x.md',
      'texts/youtube.md',
      'thumbnails/thumb-1.jpg',
      'thumbnails/thumb-2.jpg',
      'thumbnails/thumb-3.jpg',
      'video/neon-16x9.mp4',
      'video/neon-1x1.mp4',
      'video/neon-9x16.mp4',
      'video/neon.de.srt',
      'microsite/neon.json',
    ].sort());
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

  it('composes the announcement with the release date and again only when the date moves', async () => {
    const dir = await fixture();
    const deps = fakeDeps();
    const result = await buildRelease({ projectDir: dir, deps });
    // Release day Friday 11 December 2026, the main video at 18:00; the 1:1 render is the feed post, so no feed image.
    expect(deps.thumbnails.map((call) => [call.out.split('/release/')[1], call.format, call.text])).toEqual([
      ['announce/story-9x16.jpg', '9x16', 'NEON RAIN|FR 11.12. 18 UHR'],
      ['announce/post-16x9.jpg', '16x9', 'NEON RAIN|FR 11.12. 18 UHR'],
      ['instagram/story-9x16.jpg', '9x16', 'NEON RAIN|AUF YOUTUBE'],
    ]);
    // A music video's announcement says "new song".
    const tag = (path: string) => result.manifest.files.find((file) => file.path === path)!.spec.tag;
    expect([tag('announce/story-9x16.jpg'), tag('announce/post-16x9.jpg')]).toEqual(['NEUER SONG', 'NEUER SONG']);
    const board = await boardProject(dir, join(dir, '..', '..'));
    const announce = board.platforms.find((platform) => platform.id === 'instagram')!.posts.find((post) => post.id === 'announce:instagram')!;
    expect(announce.files.map((file) => file.path)).toEqual(['announce/story-9x16.jpg', 'announce/teaser-9x16.mp4']);
    const x = board.platforms.find((platform) => platform.id === 'x')!.posts.find((post) => post.id === 'announce:x')!;
    expect(x.files.map((file) => file.path)).toEqual(['announce/teaser-9x16.mp4']);
    expect(await readFile(join(dir, 'renders', 'release', 'texts', 'instagram.md'), 'utf8')).toContain('Story: `announce/story-9x16.jpg`');

    deps.thumbnails.length = 0;
    await buildRelease({ projectDir: dir, deps });
    expect(deps.thumbnails).toEqual([]);

    // The user moves the release a week: the dated images follow, the story image stays.
    const config = parse(await readFile(join(dir, 'project.yaml'), 'utf8'));
    config.release.release_date = '2026-12-18';
    await writeFile(join(dir, 'project.yaml'), stringify(config));
    // The board's quick refresh composes nothing: the outdated dated images go, the story image stays.
    const moved = await buildRelease({ projectDir: dir, deps, stills: false });
    expect(deps.thumbnails).toEqual([]);
    expect(moved.todos.filter((todo) => todo.includes('not composed'))).toHaveLength(2);
    expect(await tree(moved.dir)).not.toContain('announce/story-9x16.jpg');
    expect(await tree(moved.dir)).toContain('instagram/story-9x16.jpg');
    const fallback = (await boardProject(dir, join(dir, '..', '..'))).platforms.find((platform) => platform.id === 'instagram')!.posts.find((post) => post.id === 'announce:instagram')!;
    expect(fallback.files.map((file) => file.path)).toEqual(['streaming/cover-3000x3000.jpg']);
    await buildRelease({ projectDir: dir, deps });
    expect(deps.thumbnails.map((call) => call.text)).toEqual([
      'NEON RAIN|FR 18.12. 18 UHR',
      'NEON RAIN|FR 18.12. 18 UHR',
    ]);
  });

  it('tags an episode announcement "NEUE FOLGE"', async () => {
    const { dir } = await episodeFixture();
    const deps = fakeDeps();
    const result = await buildRelease({ projectDir: dir, deps, render: false });
    expect(result.todos.filter((todo) => todo.includes('not composed'))).toEqual([]);
    const tag = (path: string) => result.manifest.files.find((file) => file.path === path)!.spec.tag;
    expect([tag('announce/story-9x16.jpg'), tag('announce/post-16x9.jpg')]).toEqual(['NEUE FOLGE', 'NEUE FOLGE']);
    // The story image already fits both kinds.
    expect(tag('instagram/story-9x16.jpg')).toBe('JETZT');
  });

  it('composes a 4:5 feed image without a feed-format render, and asks for a still without a recipe', async () => {
    const dir = await fixture();
    await rm(join(dir, 'renders', '1x1.mp4'));
    const config = parse(await readFile(join(dir, 'project.yaml'), 'utf8'));
    config.formats.derivatives = config.formats.derivatives.filter((format: { aspect: string }) => format.aspect !== '1:1');
    await writeFile(join(dir, 'project.yaml'), stringify(config));
    const deps = fakeDeps();
    await buildRelease({ projectDir: dir, deps });
    expect(deps.thumbnails.find((call) => call.format === '4x5')?.text).toBe('NEON RAIN');
    const board = await boardProject(dir, join(dir, '..', '..'));
    const feed = board.platforms.find((platform) => platform.id === 'instagram')!.posts.find((post) => post.id === 'instagram-post')!;
    expect(feed.files.map((file) => file.path)).toEqual(['instagram/feed-4x5.jpg']);

    await rm(join(dir, 'renders', 'cover-3000x3000.recipe.json'));
    await rm(join(dir, 'renders', 'release'), { recursive: true });
    const result = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    expect(result.todos.some((todo) => todo.includes('set announcement.image'))).toBe(true);
  });

  it("carries the cover's scrim into the composed images, but not its text offset", async () => {
    const dir = await fixture();
    await writeFile(
      join(dir, 'renders', 'cover-3000x3000.recipe.json'),
      JSON.stringify({ version: 1, still: 'assets/image/hero.png', format: '1x1', text: 'NEON STATIC|NEON RAIN', focus: '0.5,0.35', scrim: 0.4, textOffset: -40 }),
    );
    const deps = fakeDeps();
    await buildRelease({ projectDir: dir, deps });
    expect(deps.thumbnails.length).toBeGreaterThan(0);
    for (const call of deps.thumbnails) {
      expect(call).toMatchObject({ scrim: 0.4 });
      expect(call).not.toHaveProperty('textOffset');
    }
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

  it('keeps the earlier copy of a stale format when it may not render', async () => {
    const dir = await fixture();
    const full = await buildRelease({ projectDir: dir, deps: fakeDeps() });
    const video = full.manifest.files.find((file) => file.kind === 'video' && file.path.endsWith('-16x9.mp4'))!;
    const state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
    state.artifacts['render:renders/16x9.mp4:inputs'] = 'old';
    await writeFile(join(dir, 'state.json'), JSON.stringify(state));

    const quick = await buildRelease({ projectDir: dir, render: false, stills: false, deps: fakeDeps({ inputsHash: async () => 'new' }) });
    expect(existsSync(join(full.dir, video.path))).toBe(true);
    expect(quick.manifest.files.map((file) => file.path)).toContain(video.path);
    expect(quick.todos.join()).toContain('renders/16x9.mp4 is stale');
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

  it("ST-015: The folder holds the meme's video, cover and three platform texts", async () => {
    const { dir, root } = await memeFixture();
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    const files = await tree(result.dir);
    expect(await diskTree(result.dir)).toEqual([...files, 'manifest.json'].sort());
    expect(files).toContain('video/office-prank-9x16.mp4');
    expect(files).toContain('cover/office-prank-1080x1920.jpg');
    expect(files).toEqual(expect.arrayContaining(['texts/youtube.md', 'texts/tiktok.md', 'texts/instagram.md']));
    expect(jpegSize(await readFile(join(result.dir, 'cover', 'office-prank-1080x1920.jpg')))).toEqual({ width: 1080, height: 1920 });
    expect(await readFile(join(result.dir, 'texts', 'youtube.md'), 'utf8')).toContain('Office prank');
  });

  it('ST-015: No music-video parts are built', async () => {
    const { dir, root } = await memeFixture({ withMusicVideoParts: true });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const files = await tree(result.dir);
    const disk = await diskTree(result.dir);
    expect(disk).toEqual([...files, 'manifest.json'].sort());
    expect(disk.filter((path) => /^(shorts|audio|streaming|announce|instagram|microsite|thumbnails)\//.test(path))).toEqual([]);
    expect(disk.filter((path) => path.endsWith('.wav'))).toEqual([]);
    expect(files.filter((path) => path.startsWith('texts/')).sort()).toEqual(['texts/instagram.md', 'texts/release-plan.md', 'texts/tiktok.md', 'texts/youtube.md']);
    const calendar = await loadCalendar(dir);
    expect(calendar).toBeDefined();
    expect(calendar?.events.map((event) => event.id)).toEqual(['youtube', 'tiktok', 'instagram']);
    expect(calendar?.events.filter((event) => event.step === 'announce' || event.step === 'story')).toEqual([]);
  });

  it('ST-015: A sound that needs a credit is credited', async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const { dir, root } = await memeFixture({ licence: 'cc-by', credit });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    for (const name of ['youtube.md', 'tiktok.md', 'instagram.md']) {
      expect(await readFile(join(result.dir, 'texts', name), 'utf8')).toContain(credit);
    }
  });

  it('credits a library sound once, also when it was taken twice and as ambience', async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const { dir, root } = await memeFixture({ credit });
    const take = { source: 'library:vine-boom', duration: 1.4, text_hash: 'prank' };
    await writeFile(join(dir, 'takes.json'), JSON.stringify({ version: 1, takes: { one: take, two: take, gone: { ...take, source: 'library:gone' } }, ambience: { room: take } }));
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const youtube = await readFile(join(result.dir, 'texts', 'youtube.md'), 'utf8');
    expect(youtube.match(/Boom by Jane Doe/g)).toHaveLength(1);
  });

  it('checks the meme caption with its credits, and plans it as a Short, not a Premiere', async () => {
    const { dir, root } = await memeFixture({ credit: 'x'.repeat(2200) });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors.join('\n')).toContain('tiktok: caption has');
    expect(result.errors.join('\n')).toContain('instagram: caption has');
    const plan = await readFile(join(result.dir, 'texts', 'release-plan.md'), 'utf8');
    expect(plan).toContain('Post the video as a YouTube Short');
    expect(plan).not.toContain('Premiere');
  });

  it('ST-016: A sound of unknown licence is a TODO', async () => {
    const { dir, root } = await memeFixture({ licence: 'unknown' });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    expect(result.todos.join('\n')).toContain('vine-boom');
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.filter((check) => check.result === 'FAIL')).toEqual([]);
    const sounds = checks.find((check) => check.name === 'Release sounds');
    expect(sounds?.result).toBe('TODO');
    expect(sounds?.evidence).toContain('vine-boom');
    expect((await boardProject(dir, root)).todos.join('\n')).toContain('vine-boom');
  });

  it('ST-016: A cleared sound needs nothing', async () => {
    const { dir, root } = await memeFixture({ licence: 'own' });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    expect(result.todos.join('\n')).not.toContain('vine-boom');
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.filter((check) => check.result === 'TODO').map((check) => check.evidence).join('\n')).not.toContain('vine-boom');
    expect(checks.find((check) => check.name === 'Release sounds')?.result).toBe('PASS');
  });

  it('ST-016: A missing credit is a TODO', async () => {
    const { dir, root } = await memeFixture({ licence: 'cc-by' });
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    expect(result.todos.join('\n')).toContain('vine-boom');
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.filter((check) => check.result === 'FAIL')).toEqual([]);
    const sounds = checks.find((check) => check.name === 'Release sounds');
    expect(sounds?.result).toBe('TODO');
    expect(sounds?.evidence).toMatch(/vine-boom.*credit/);
  });

  it('reports a used sound whose library entry is gone as an unknown licence', async () => {
    const { dir, root } = await memeFixture({ credit: 'Boom by Jane Doe' });
    await rm(join(root, 'library', 'sounds', 'vine-boom', 'sound.yaml'));
    const result = await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    expect(result.errors).toEqual([]);
    expect(result.todos.join('\n')).toMatch(/vine-boom.*its entry is missing/);
    expect((await boardProject(dir, root)).todos.join('\n')).toContain('vine-boom');
  });
});

describe('release QA', () => {
  it('checks a meme without the music-video parts', async () => {
    const { dir, root } = await memeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const checks = await releaseChecks(dir, fixtureProbe(), { root });
    expect(checks.filter((check) => check.result === 'FAIL')).toEqual([]);
    expect(checks.map((check) => check.name)).toContain('Release cover');
    expect(checks.map((check) => check.name)).toContain('Release sounds');
    expect(checks.map((check) => check.name)).not.toContain('Release audio');
    expect(checks.map((check) => check.name)).not.toContain('Release Shorts');
  });

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

/** Call the board's request handler without a socket. */
async function request(handler: ReturnType<typeof boardHandler>, method: string, url: string, body?: unknown, extra: Record<string, string> = {}) {
  const { Readable } = await import('node:stream');
  // What the board page itself sends; a test overrides them to play a foreign page.
  const headers = { host: '127.0.0.1:4848', ...(method === 'GET' ? {} : { 'content-type': 'application/json', origin: 'http://127.0.0.1:4848' }), ...extra };
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]), { method, url, headers });
  return new Promise<{ status: number; headers: Record<string, unknown>; body: string }>((done) => {
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; },
      writeHead(status: number, head: Record<string, unknown> = {}) { this.statusCode = status; Object.assign(this.headers, head); return this; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
      end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') }); },
      on() { return this; }, once() { return this; }, emit() { return true; }, removeListener() { return this; },
    };
    void handler(req as never, res as never);
  });
}

describe('release board', () => {
  it("shows a meme's credit and its Short plan on the board", async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const { dir, root } = await memeFixture({ credit });
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const board = await boardProject(dir, root);
    const youtube = board.platforms.find((platform) => platform.id === 'youtube')!;
    expect(youtube.posts.find((post) => post.id === 'youtube')!.fields.find((field) => field.label === 'Description')?.value).toContain(credit);
    expect(board.calendar.find((event) => event.step === 'youtube')?.label).toBe('Post the video as a YouTube Short (texts/youtube.md)');
  });

  it("does not ask the user to act on a meme's scheduled Short", async () => {
    vi.stubEnv('YOUTUBE_CLIENT_ID', 'id');
    vi.stubEnv('YOUTUBE_CLIENT_SECRET', 'secret');
    vi.stubEnv('YOUTUBE_REFRESH_TOKEN', 'refresh');
    const { dir, root } = await memeFixture();
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const calendar = (await loadCalendar(dir))!;
    await writeFile(
      join(dir, 'review', 'release-status.json'),
      JSON.stringify({ version: 1, approval: { at: '2026-12-01T00:00:00Z', release_date: calendar.release_date }, items: {} }),
    );
    await writeFile(
      join(dir, 'review', 'autopilot.json'),
      JSON.stringify({ version: 1, entries: [{ event: 'youtube', status: 'scheduled', at: '2026-12-10T17:00:00Z', remote_id: 'abcdefghijk', publish_at: '2026-12-11T17:00:00Z' }] }),
    );
    const board = await boardProject(dir, root, { now: new Date('2026-12-11T19:10:00Z') });
    expect(board.autopilot.events.youtube).toMatchObject({ state: 'pending', needsUser: false });
    vi.unstubAllEnvs();
  });

  it("shows a meme's three posts with the credit, and no music-video posts", async () => {
    const credit = 'Boom by Jane Doe (CC BY 4.0)';
    const { dir, root } = await memeFixture({ credit, withMusicVideoParts: true });
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const board = await boardProject(dir, root);
    expect(board.platforms.map((platform) => platform.id)).toEqual(['youtube', 'tiktok', 'instagram']);
    const ids = board.platforms.flatMap((platform) => platform.posts.map((post) => post.id));
    expect(ids.sort()).toEqual(['instagram', 'tiktok', 'youtube']);
    for (const id of ['community', 'announce:instagram', 'announce:youtube', 'announce:x', 'story', 'instagram-post', 'x', 'linkedin', 'microsite']) {
      expect(ids).not.toContain(id);
    }
    const main = board.platforms.find((platform) => platform.id === 'youtube')!.posts.find((post) => post.id === 'youtube')!;
    expect(main.files.map((entry) => entry.path)).toContain('cover/office-prank-1080x1920.jpg');
    expect(main.checklist).toHaveLength(3);
    expect(main.checklist.join(' ')).toContain('Planen oder veröffentlichen zur Kalenderzeit');
    expect(main.checklist.join(' ')).not.toMatch(/Kategorie|Abspann/);
    expect(main.fields.map((field) => field.label)).not.toContain('Angepinnter Kommentar');
    for (const platform of ['tiktok', 'instagram']) {
      const post = board.platforms.find((entry) => entry.id === platform)!.posts[0]!;
      expect(post.fields.map((field) => field.value).join(' ')).toContain(credit);
    }
  });

  it('plans the calendar during release and lays out every platform with files, texts, and limits', async () => {
    const dir = await fixture();
    await buildRelease({ projectDir: dir, deps: fakeDeps() });
    const calendar = await loadCalendar(dir);
    expect(calendar).toMatchObject({ project: 'neon', release_date: '2026-12-11', proposed: false, timezone: 'Europe/Berlin' });
    expect(calendar!.events.find((event) => event.id === 'youtube')?.at).toBe('2026-12-11T18:00:00+01:00');
    expect(calendar!.events.find((event) => event.id === 'linkedin')?.at).toBe('2026-12-15T09:00:00+01:00');
    const release = join(dir, 'renders', 'release');
    expect(await readFile(join(release, 'texts', 'release-plan.md'), 'utf8')).toContain('| 0 | Fr 11.12.2026 | 18:00 | Hauptvideo als YouTube-Premiere (youtube.md) |');
    expect(await readFile(join(release, 'calendar.ics'), 'utf8')).toContain('DTSTART:20261211T170000Z');
    const site = JSON.parse(await readFile(join(release, 'microsite', 'neon.json'), 'utf8'));
    expect(site).toMatchObject({ slug: 'neon', title: 'Neon Rain', teaser: 'Zwölf Sekunden Neonregen.', disclosure: 'Song und Video wurden mit KI erstellt.', links: {} });

    const board = await boardProject(dir, join(dir, '..', '..'));
    expect(board.platforms.map((platform) => platform.id)).toEqual(['youtube', 'shorts', 'tiktok', 'instagram', 'spotify', 'x', 'linkedin', 'microsite']);
    const youtube = board.platforms.find((platform) => platform.id === 'youtube')!;
    const main = youtube.posts.find((post) => post.id === 'youtube')!;
    expect(main.files.map((file) => file.path)).toEqual(['video/neon-16x9.mp4', 'thumbnails/thumb-1.jpg', 'thumbnails/thumb-2.jpg', 'thumbnails/thumb-3.jpg', 'video/neon.de.srt']);
    expect(main.fields.find((field) => field.label === 'Titel')).toMatchObject({ limit: 100, unit: 'chars' });
    const tiktok = board.platforms.find((platform) => platform.id === 'tiktok')!;
    expect(tiktok.posts.map((post) => post.id)).toEqual(['short:Z1-intro:tiktok', 'short:Z2-chorus:tiktok', 'short:Z3-outro:tiktok']);
    expect(tiktok.posts[0]!.files.map((file) => file.path)).toEqual(['shorts/Z1-intro-9x16.mp4', 'shorts/Z1-intro-tiktok.jpg']);
    const x = board.platforms.find((platform) => platform.id === 'x')!.posts.find((post) => post.id === 'x')!;
    expect(x.fields.find((field) => field.label === 'Antwort mit Link')?.value).toBe('Ganzes Video: [Link zum Hauptvideo]');
    expect(board.platforms.find((platform) => platform.id === 'linkedin')!.skipped).toBeUndefined();
    // The square render is the feed version: the Instagram feed post and LinkedIn carry it.
    const feed = board.platforms.find((platform) => platform.id === 'instagram')!.posts.find((post) => post.id === 'instagram-post')!;
    expect(feed.files.map((entry) => entry.path)).toEqual(['video/neon-1x1.mp4', 'streaming/cover-3000x3000.jpg']);
    expect(board.platforms.find((platform) => platform.id === 'linkedin')!.posts[0]!.files.map((entry) => entry.path)).toEqual(['video/neon-1x1.mp4']);
    // Every post with a date is a calendar event, so its done state is the calendar's.
    const ids = new Set(board.calendar.map((event) => event.id));
    for (const post of board.platforms.flatMap((platform) => platform.posts)) if (post.at) expect(ids.has(post.id)).toBe(true);
  });

  it('records posted items and live URLs, and serves only release-folder files', async () => {
    const dir = await fixture();
    await buildRelease({ projectDir: dir, deps: fakeDeps() });
    const root = join(dir, '..', '..');
    const refreshed: string[] = [];
    const handler = boardHandler({ root, now: () => new Date('2026-12-11T17:05:00Z'), refresh: async (projectDir) => void refreshed.push(projectDir) });
    expect(JSON.parse((await request(handler, 'GET', '/api/channel')).body)).toEqual({});
    const list = JSON.parse((await request(handler, 'GET', '/api/projects')).body);
    expect(list).toEqual([expect.objectContaining({ slug: 'neon', releaseDate: '2026-12-11', done: 0, hasRelease: true })]);
    const posted = await request(handler, 'POST', '/api/projects/neon/status', { id: 'youtube', done: true, url: 'https://youtu.be/abc' });
    expect(posted.status).toBe(200);
    const status = JSON.parse(await readFile(join(dir, 'review', 'release-status.json'), 'utf8'));
    expect(status.items.youtube).toEqual({ done: true, at: '2026-12-11T17:05:00.000Z', url: 'https://youtu.be/abc', by: 'user' });
    // The live URL lays out the X and LinkedIn texts and the microsite data again.
    await new Promise((done) => setTimeout(done, 10));
    expect(refreshed).toEqual([dir]);
    // The live URL lands in the texts that point to the video.
    const board = JSON.parse((await request(handler, 'GET', '/api/projects/neon')).body);
    const x = board.platforms.find((platform: { id: string }) => platform.id === 'x').posts.find((post: { id: string }) => post.id === 'x');
    expect(x.fields.find((field: { label: string }) => field.label === 'Antwort mit Link').value).toBe('Ganzes Video: https://youtu.be/abc');
    expect((await request(handler, 'POST', '/api/projects/neon/status', { id: 'x', url: 'javascript:alert(1)' })).status).toBe(400);
    expect((await request(handler, 'GET', '/api/projects/..%2F..%2Fetc')).status).toBe(404);
    expect((await request(handler, 'GET', '/api/projects/Etc')).status).toBe(400);
    expect((await request(handler, 'GET', '/media/neon/..%2F..%2Fproject.yaml')).status).toBe(403);
    const video = await request(handler, 'GET', '/media/neon/video/neon-16x9.mp4', undefined, { range: 'bytes=0-5' });
    expect(video.status).toBe(206);
    expect(video.headers['content-range']).toMatch(/^bytes 0-5\//);
    const events = JSON.parse((await request(handler, 'GET', '/api/calendar')).body);
    expect(events.find((event: { id: string }) => event.id === 'youtube')).toMatchObject({ project: 'neon', done: true, label: 'Hauptvideo als YouTube-Premiere (youtube.md)' });
    const ics = await request(handler, 'GET', '/calendar.ics');
    expect(ics.body).toContain('SUMMARY:Neon Rain: Hauptvideo als YouTube-Premiere (youtube.md)');
  });

  it('marks a published song done up to a day and keeps the rest open', async () => {
    const dir = await fixture();
    await buildRelease({ projectDir: dir, deps: fakeDeps() });
    const lines: string[] = [];
    const calendar = await runCalendar({ projectDir: dir, root: join(dir, '..', '..'), doneUntil: '2026-12-11', now: new Date('2026-12-14T08:00:00Z'), log: (line) => lines.push(line) });
    const status = await loadStatus(dir);
    const done = calendar.events.filter((event) => status.items[event.id]?.done).map((event) => event.id);
    expect(done).toEqual(expect.arrayContaining(['distributor', 'pitch', 'youtube', 'short:Z1-intro:tiktok']));
    expect(done).not.toContain('links');
    expect(done).not.toContain('short:Z2-chorus:youtube');
    expect(lines.join('\n')).toContain(`Marked ${done.length} event(s) up to 2026-12-11 as done.`);
    await expect(runCalendar({ projectDir: dir, root: join(dir, '..', '..'), doneUntil: 'yesterday', log: () => undefined })).rejects.toThrow('--done-until');
  });
});
