import { describe, expect, it } from 'vitest';
import {
  ChannelConfigSchema,
  ReleaseMetadataSchema,
  UploadDataSchema,
  buildReleasePlan,
  platformLimits,
  withUrls,
  type ReleasePlanInput,
} from '../packages/core/src/index.ts';
import { RELEASE, uploadYaml } from './helpers/release-fixture.ts';

// The release plan is the one place that states a post's exact text, its limit,
// and what is still missing. These cases are pure: no project, no ffmpeg.

const channel = ChannelConfigSchema.parse({
  version: 1,
  name: 'Neon Static',
  language: 'de',
  links: { youtube: { handle: '@neonstatic' }, spotify: { url: 'https://open.spotify.com/artist/neon' } },
  footer: { song_credit: '{artist} – {title} ({ai_tool})', tool_credit: 'Gemacht mit coreslopper', links: ['spotify'] },
});

const input = (overrides: Partial<ReleasePlanInput> = {}): ReleasePlanInput => ({
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
  files: {
    master: 'video/neon-16x9.mp4',
    thumbnails: ['thumbnails/thumb-1.jpg', 'thumbnails/thumb-2.jpg'],
    shorts: [
      { name: 'Z1-intro', video: 'shorts/Z1-intro-9x16.mp4', thumbnail: 'shorts/Z1-intro-thumb.jpg', tiktokCover: 'shorts/Z1-intro-tiktok.jpg' },
      { name: 'Z2-chorus', video: 'shorts/Z2-chorus-9x16.mp4' },
    ],
  },
  tiktokPointer: 'Ganzes Video auf YouTube: @neonstatic',
  durationSeconds: 12,
  ...overrides,
  shape: overrides.shape ?? overrides.kind ?? 'music-video',
});

const text = (plan: ReturnType<typeof buildReleasePlan>, id: string, key: string) => plan.posts.find((post) => post.id === id)?.texts[key];

describe('the release plan', () => {
  it("states a TikTok Short's caption with its pointer and hashtags, and the fallback when it is missing", () => {
    const plan = buildReleasePlan(input());
    expect(text(plan, 'short:Z1-intro:tiktok', 'caption')?.value).toBe('Teil 1 im Regen\n\nGanzes Video auf YouTube: @neonstatic\n\n#synthwave');
    expect(plan.problems).toEqual({ errors: [], missing: [] });

    const data = uploadYaml();
    delete (data.shorts[0] as { tiktok?: unknown }).tiktok;
    const fallback = buildReleasePlan(input({ data: UploadDataSchema.parse(data) }));
    expect(text(fallback, 'short:Z1-intro:tiktok', 'caption')?.value).toBe('Regen 1 🌧️ #synthwave');
    expect(fallback.problems.missing).toContain('shorts.Z1-intro.tiktok');
  });

  it('lays the YouTube description out once: body, chapters, footer, hashtags', () => {
    const plan = buildReleasePlan(input());
    expect(text(plan, 'youtube', 'description')?.value).toBe(
      'Zwölf Sekunden Neonregen.\n\n0:00 Intro\n0:40 Refrain\n1:10 Bridge\n\nNeon Static – Neon Rain (Suno)\nGemacht mit coreslopper\nspotify: https://open.spotify.com/artist/neon\n\n#synthwave #neon',
    );
  });

  it('lists the YouTube hashtags comma-separated without "#", and keeps "#" in the descriptions', () => {
    const plan = buildReleasePlan(input());
    expect(text(plan, 'youtube', 'hashtags')?.value).toBe('synthwave, neon');
    expect(text(plan, 'youtube', 'description')?.value.endsWith('\n\n#synthwave #neon')).toBe(true);
    for (const name of ['Z1-intro', 'Z2-chorus']) {
      expect(text(plan, `short:${name}:youtube`, 'hashtags')?.value).toBe('synthwave, shorts');
      expect(text(plan, `short:${name}:youtube`, 'description')?.value.endsWith('\n\n#synthwave #shorts')).toBe(true);
    }
  });

  it('takes every text limit from platformLimits, including a channel override', () => {
    const lenient = ChannelConfigSchema.parse({ ...channel, limits: { tiktok: { caption: 10 } } });
    const plan = buildReleasePlan(input({ channel: lenient, limits: platformLimits(lenient) }));
    const caption = text(plan, 'short:Z1-intro:tiktok', 'caption')!.value;
    expect(plan.problems.errors).toContain(`tiktok Z1-intro: caption has ${[...caption].length} characters, limit 10`);
  });

  it('counts hashtags in the list and in the text, once', () => {
    const data = uploadYaml();
    data.shorts[1]!.instagram.hashtags = ['#synthwave', '#neon', '#regen', '#nacht', '#ki'];
    data.shorts[1]!.instagram.caption = 'Refrain #neon.';
    const plan = buildReleasePlan(input({ data: UploadDataSchema.parse(data) }));
    expect(text(plan, 'short:Z2-chorus:instagram', 'caption')?.hashtags).toMatchObject({ count: 6, max: 5 });
    expect(plan.problems.errors).toContain('instagram Z2-chorus: 6 hashtags, limit 5');
  });

  it('keeps the live URLs in slots and fills them without rebuilding the text', () => {
    const plan = buildReleasePlan(input());
    expect(text(plan, 'x', 'reply')?.value).toBe('Ganzes Video: {youtube}');
    const live = withUrls(plan, { youtube: 'https://youtu.be/abc' });
    expect(text(live, 'x', 'reply')?.value).toBe('Ganzes Video: https://youtu.be/abc');
    expect(text(live, 'x', 'post')?.value).toBe(text(plan, 'x', 'post')?.value);
  });

  it("lays out a meme's one caption on all three posts", () => {
    const data = UploadDataSchema.parse({ version: 1, language: 'en', main: { file: 'renders/9x16.mp4', title: 'Office prank', description: 'He printed the report anyway.', hashtags: ['#officeprank'], tags: ['office prank'] } });
    const plan = buildReleasePlan(input({ kind: 'meme', language: 'en', data, chapters: [], credits: ['Boom by Jane Doe (CC BY 4.0)'] }));
    const caption = 'He printed the report anyway.\n\nBoom by Jane Doe (CC BY 4.0)\n\n#officeprank';
    expect(text(plan, 'youtube', 'description')?.value).toBe(caption);
    expect(text(plan, 'tiktok', 'caption')?.value).toBe(caption);
    expect(text(plan, 'instagram', 'caption')?.value).toBe(caption);
  });
});
