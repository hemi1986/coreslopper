import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../packages/core/src/index.ts';
import {
  InstagramPublisher,
  instagramAccount,
  instagramTokenDaysLeft,
  refreshInstagramToken,
  resolveInstagramCredentials,
} from '../packages/providers/src/publish/instagram.ts';
import type { FetchLike } from '../packages/providers/src/http.ts';
import { failureClass } from '../packages/providers/src/publish/failure.ts';

const temporary: string[] = [];
const noSleep = async () => undefined;
const TOKEN = 'IGAAtoken-secret-123456';
const NOW = new Date('2026-11-21T12:00:00Z');

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function files(): Promise<{ video: string; image: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'ig-'));
  temporary.push(dir);
  const video = join(dir, 'Z1-intro-9x16.mp4');
  const image = join(dir, 'feed-4x5.jpg');
  await writeFile(video, 'video');
  await writeFile(image, 'image');
  return { video, image };
}

interface Call {
  method: string;
  url: URL;
  form: URLSearchParams;
}

/** A fake Graph API: records calls, answers by path. */
function graph(options: { statuses?: string[]; quota?: number; publish?: () => Response; refresh?: () => Response } = {}) {
  const calls: Call[] = [];
  const statuses = [...(options.statuses ?? ['IN_PROGRESS', 'FINISHED'])];
  const fetchImpl: FetchLike = async (input, init) => {
    const url = new URL(input);
    const form = new URLSearchParams(typeof init?.body === 'string' ? init.body : '');
    calls.push({ method: init?.method ?? 'GET', url, form });
    const path = url.pathname;
    if (path === '/refresh_access_token') return options.refresh?.() ?? json({ access_token: 'IGAAfresh-token-654321', token_type: 'bearer', expires_in: 5_184_000 });
    if (path.endsWith('/me')) return json({ user_id: '1784', username: 'neonband' });
    if (path.endsWith('/content_publishing_limit')) return json({ data: [{ quota_usage: options.quota ?? 2, config: { quota_total: 50, quota_duration: 86400 } }] });
    if (path.endsWith('/1784/media') && init?.method === 'POST') return json({ id: 'c-1' });
    if (path.endsWith('/media_publish')) return options.publish?.() ?? json({ id: 'm-9' });
    if (path.endsWith('/c-1')) return json({ status_code: statuses.shift() ?? 'FINISHED' });
    if (path.endsWith('/m-9')) return json({ permalink: 'https://www.instagram.com/reel/abc/' });
    if (path.endsWith('/1784/media')) return json({ data: [{ id: 'm-10', permalink: 'https://www.instagram.com/p/latest/' }] });
    return json({ error: { message: `unexpected ${path}` } }, 404);
  };
  return { calls, fetchImpl };
}

const env = (extra: Record<string, string> = {}) => ({
  INSTAGRAM_ACCESS_TOKEN: TOKEN,
  INSTAGRAM_USER_ID: '1784',
  INSTAGRAM_TOKEN_EXPIRES_AT: '2027-01-10T00:00:00Z',
  ...extra,
});

const publisher = (fetchImpl: FetchLike, extra: Partial<ConstructorParameters<typeof InstagramPublisher>[0]> = {}) =>
  new InstagramPublisher({
    env: env(),
    fetchImpl,
    sleep: noSleep,
    now: () => NOW,
    hostMedia: async (path) => `https://cdn.example/${path.split('/').at(-1)}`,
    pollIntervalMs: 1,
    ...extra,
  });

const containerCall = (calls: Call[]) => calls.find((call) => call.method === 'POST' && call.url.pathname.endsWith('/1784/media'))!;

describe('Instagram credentials', () => {
  it('reads the env and counts the days left', () => {
    const credentials = resolveInstagramCredentials(env());
    expect(credentials).toEqual({ accessToken: TOKEN, userId: '1784', expiresAt: '2027-01-10T00:00:00Z' });
    expect(instagramTokenDaysLeft(credentials, NOW)).toBe(49);
    expect(instagramTokenDaysLeft({}, NOW)).toBeUndefined();
  });

  it('validates a pasted token with /me and refreshes it', async () => {
    const { fetchImpl, calls } = graph();
    expect(await instagramAccount(TOKEN, fetchImpl)).toEqual({ userId: '1784', username: 'neonband' });
    const fresh = await refreshInstagramToken(TOKEN, fetchImpl, NOW);
    expect(fresh.accessToken).toBe('IGAAfresh-token-654321');
    expect(fresh.expiresAt).toBe(new Date(NOW.getTime() + 5_184_000_000).toISOString());
    expect(calls[1]!.url.searchParams.get('grant_type')).toBe('ig_refresh_token');
  });

  it('turns an expired token into a ConfigError', async () => {
    const fetchImpl: FetchLike = async () => json({ error: { message: 'Error validating access token', type: 'OAuthException', code: 190 } }, 400);
    await expect(instagramAccount(TOKEN, fetchImpl)).rejects.toBeInstanceOf(ConfigError);
  });

  it('needs a token', () => {
    expect(() => new InstagramPublisher({ env: {} })).toThrow(ConfigError);
  });
});

describe('InstagramPublisher', () => {
  it('posts a Reel: container, polling, publish, permalink', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph();
    const result = await publisher(fetchImpl).post({
      event: 'short:Z1-intro:instagram',
      text: 'Neon rain 🌧️ #synthwave',
      media: { path: video, kind: 'video' },
      placement: 'reel',
      coverOffsetMs: 1500,
    });
    expect(result).toMatchObject({ remoteId: 'm-9', url: 'https://www.instagram.com/reel/abc/', warnings: [] });
    const form = containerCall(calls).form;
    expect(Object.fromEntries(form)).toMatchObject({
      media_type: 'REELS',
      video_url: 'https://cdn.example/Z1-intro-9x16.mp4',
      caption: 'Neon rain 🌧️ #synthwave',
      share_to_feed: 'true',
      thumb_offset: '1500',
      is_ai_generated: 'true',
    });
    expect(calls.filter((call) => call.url.pathname.endsWith('/c-1'))).toHaveLength(2);
    expect(calls.some((call) => call.url.pathname.endsWith('/media_publish') && call.form.get('creation_id') === 'c-1')).toBe(true);
    // The token goes in the query or the form, never in a header that might be logged.
    expect(calls.every((call) => call.url.searchParams.get('access_token') === TOKEN || call.form.get('access_token') === TOKEN)).toBe(true);
  });

  it('posts a feed image without media_type', async () => {
    const { image } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED'] });
    await publisher(fetchImpl).post({ event: 'instagram-post', text: 'Out now', media: { path: image, kind: 'image' }, placement: 'feed' });
    const form = containerCall(calls).form;
    expect(form.get('image_url')).toBe('https://cdn.example/feed-4x5.jpg');
    expect(form.get('caption')).toBe('Out now');
    expect(form.has('media_type')).toBe(false);
  });

  it('posts a feed video as a Reel shared to the grid', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED'] });
    await publisher(fetchImpl).post({ event: 'instagram-post', text: 'Out now', media: { path: video, kind: 'video' }, placement: 'feed' });
    const form = containerCall(calls).form;
    expect(form.get('media_type')).toBe('REELS');
    expect(form.get('share_to_feed')).toBe('true');
  });

  it('posts a story without a caption and warns about the dropped text', async () => {
    const { image } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED'] });
    const result = await publisher(fetchImpl).post({ event: 'announce:instagram', text: 'Friday 18:00', media: { path: image, kind: 'image' }, placement: 'story' });
    const form = containerCall(calls).form;
    expect(form.get('media_type')).toBe('STORIES');
    expect(form.get('image_url')).toBe('https://cdn.example/feed-4x5.jpg');
    expect(form.has('caption')).toBe(false);
    expect(result.warnings.join(' ')).toMatch(/no caption/);
  });

  it('fails when the container ends in ERROR and publishes nothing', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['IN_PROGRESS', 'ERROR'] });
    const error = (await publisher(fetchImpl)
      .post({ event: 'short:Z1-intro:instagram', text: 'x', media: { path: video, kind: 'video' }, placement: 'reel' })
      .catch((caught: unknown) => caught as Error)) as Error;
    expect(error.message).toMatch(/could not process the media of short:Z1-intro:instagram: ERROR/);
    expect(failureClass(error)).toBe('retryable');
    expect(calls.some((call) => call.url.pathname.endsWith('/media_publish'))).toBe(false);
  });

  it('refreshes a token close to expiry and saves it', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED'] });
    const saved: Record<string, string> = {};
    await publisher(fetchImpl, {
      env: env({ INSTAGRAM_TOKEN_EXPIRES_AT: '2026-11-25T00:00:00Z' }),
      saveSecret: (key, value) => {
        saved[key] = value;
      },
    }).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' }, placement: 'reel' });
    expect(saved.INSTAGRAM_ACCESS_TOKEN).toBe('IGAAfresh-token-654321');
    expect(saved.INSTAGRAM_TOKEN_EXPIRES_AT).toBe(new Date(NOW.getTime() + 5_184_000_000).toISOString());
    // The calls after the refresh use the new token.
    expect(containerCall(calls).form.get('access_token')).toBe('IGAAfresh-token-654321');
  });

  it('does not refresh a token with weeks left', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED'] });
    await publisher(fetchImpl).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' }, placement: 'reel' });
    expect(calls.some((call) => call.url.pathname === '/refresh_access_token')).toBe(false);
  });

  it('refuses an expired token', async () => {
    const { video } = await files();
    const { fetchImpl } = graph();
    await expect(
      publisher(fetchImpl, { env: env({ INSTAGRAM_TOKEN_EXPIRES_AT: '2026-11-01T00:00:00Z' }) }).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('needs a media host', async () => {
    const { video } = await files();
    const { fetchImpl } = graph();
    await expect(
      publisher(fetchImpl, { hostMedia: undefined }).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } }),
    ).rejects.toBeInstanceOf(ConfigError);
  });

  it('stops before creating a container when the quota is used up', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ quota: 50 });
    await expect(publisher(fetchImpl).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } })).rejects.toThrow(/quota is used up: 50 of 50/);
    expect(calls.some((call) => call.method === 'POST')).toBe(false);
  });

  it('reports the newest post when media_publish lost its answer but the container is PUBLISHED', async () => {
    const { video } = await files();
    const { fetchImpl, calls } = graph({ statuses: ['FINISHED', 'PUBLISHED'], publish: () => json({ error: { message: 'Service temporarily unavailable' } }, 500) });
    const result = await publisher(fetchImpl).post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } });
    expect(result).toMatchObject({ remoteId: 'm-10', url: 'https://www.instagram.com/p/latest/' });
    expect(result.warnings.join(' ')).toMatch(/answer was lost/);
    // media_publish is never retried.
    expect(calls.filter((call) => call.url.pathname.endsWith('/media_publish'))).toHaveLength(1);
  });

  it('marks media_publish as uncertain when the container status cannot be read', async () => {
    const { video } = await files();
    let containerChecks = 0;
    const fetchImpl: FetchLike = async (input, init) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/me')) return json({ user_id: '1784', username: 'neonband' });
      if (path.endsWith('/content_publishing_limit')) return json({ data: [{ quota_usage: 0 }] });
      if (path.endsWith('/1784/media') && init?.method === 'POST') return json({ id: 'c-1' });
      if (path.endsWith('/media_publish')) return json({ error: { message: 'Service unavailable' } }, 503);
      if (path.endsWith('/c-1')) {
        containerChecks += 1;
        return containerChecks === 1 ? json({ status_code: 'FINISHED' }) : json({ error: { message: 'down' } }, 500);
      }
      return json({ error: { message: `unexpected ${path}` } }, 404);
    };
    const error = await publisher(fetchImpl)
      .post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } })
      .catch((caught: Error) => caught);
    expect(failureClass(error)).toBe('uncertain');
    expect((error as Error & { uncertain?: boolean }).uncertain).toBe(true);
  });

  it('masks the token in error messages', async () => {
    const { video } = await files();
    const fetchImpl: FetchLike = async (input) => {
      const path = new URL(input).pathname;
      if (path.endsWith('/content_publishing_limit')) return json({ data: [{ quota_usage: 0 }] });
      return json({ error: { message: `bad request for token ${TOKEN}` } }, 400);
    };
    const error = await publisher(fetchImpl)
      .post({ event: 'x', text: 'x', media: { path: video, kind: 'video' } })
      .catch((caught: Error) => caught);
    expect((error as Error).message).toContain('***');
    expect((error as Error).message).not.toContain(TOKEN);
  });

  it('rejects an image as a Reel and text without media', async () => {
    const { image } = await files();
    const { fetchImpl } = graph();
    await expect(publisher(fetchImpl).post({ event: 'x', text: 'x', media: { path: image, kind: 'image' }, placement: 'reel' })).rejects.toThrow(/Reel needs a video/);
    await expect(publisher(fetchImpl).post({ event: 'x', text: 'x' })).rejects.toThrow(/needs an image or a video/);
  });
});
