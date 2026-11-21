import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../packages/core/src/index.ts';
import {
  MockPublisher,
  TikTokPublisher,
  YOUTUBE_QUOTA,
  YOUTUBE_SCOPES,
  YouTubePublisher,
  tiktokAuthUrl,
  tiktokScopes,
  youtubeAuthUrl,
  type FetchLike,
  type PublishItem,
} from '../packages/providers/src/index.ts';

// The publish adapters' calls for the release autopilot: YouTube status,
// description, and comment; TikTok Direct Post for an audited app.

const temporary: string[] = [];
const noSleep = async () => undefined;

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

async function bytesFile(size: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-autopilot-adapters-'));
  temporary.push(dir);
  const path = join(dir, 'video.mp4');
  await writeFile(path, Buffer.alloc(size, 1));
  return path;
}

function item(file: string, overrides: Partial<PublishItem> = {}): PublishItem {
  return {
    name: 'Z1-intro',
    kind: 'short',
    file,
    title: 'Regen #neon #shorts',
    description: 'Eine Nacht im Regen.',
    tags: [],
    hashtags: ['#neon', '#shorts'],
    language: 'de',
    madeForKids: false,
    syntheticMedia: true,
    categoryId: '10',
    ...overrides,
  };
}

type Call = { url: string; init?: RequestInit };

/** A fake Google API: the token endpoint plus one handler per Data API call. */
function youtubeFake(handle: (call: Call) => Response | undefined): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    if (url.startsWith('https://oauth2.googleapis.com/token')) return json({ access_token: 'ya29.token', expires_in: 3600 });
    return handle({ url, init }) ?? json({ error: { message: `unexpected ${url}` } }, 500);
  };
  return { fetchImpl, calls };
}

const youtubeCredentials = { clientId: 'id', clientSecret: 'youtube-secret', refreshToken: '1//refresh' };

describe('YouTube autopilot calls', () => {
  it('asks for the upload and force-ssl scopes', () => {
    const url = new URL(youtubeAuthUrl({ clientId: 'id', redirectUri: 'http://127.0.0.1:1234/', state: 's', challenge: 'c' }));
    expect(url.searchParams.get('scope')!.split(' ')).toEqual([...YOUTUBE_SCOPES]);
    expect(YOUTUBE_SCOPES).toContain('https://www.googleapis.com/auth/youtube.force-ssl');
    expect(YOUTUBE_QUOTA).toMatchObject({ list: 1, update: 50, comment: 50 });
  });

  it('reads the privacy and schedule of a video', async () => {
    const { fetchImpl, calls } = youtubeFake((call) =>
      call.url.includes('/videos?part=status') ? json({ items: [{ id: 'vid1', status: { privacyStatus: 'private', publishAt: '2026-12-11T17:00:00Z', uploadStatus: 'processed' } }] }) : undefined,
    );
    const status = await new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep }).videoStatus('vid1');
    expect(status).toEqual({ privacyStatus: 'private', publishAt: '2026-12-11T17:00:00Z', uploadStatus: 'processed' });
    expect(calls.at(-1)!.url).toContain('id=vid1');
  });

  it('fails clearly for an unknown video', async () => {
    const { fetchImpl } = youtubeFake((call) => (call.url.includes('/videos?') ? json({ items: [] }) : undefined));
    await expect(new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep }).videoStatus('gone')).rejects.toThrow(/no video gone/);
  });

  it('appends to the description and keeps the other snippet fields', async () => {
    const snippet = { title: 'Neon Rain', description: 'Eine Nacht.', tags: ['neon'], categoryId: '10', defaultLanguage: 'de', channelId: 'UC1', thumbnails: {} };
    const { fetchImpl, calls } = youtubeFake((call) => {
      if (call.url.includes('/videos?part=snippet&id=')) return json({ items: [{ id: 'vid1', snippet }] });
      if (call.init?.method === 'PUT' && call.url.endsWith('/videos?part=snippet')) return json({ id: 'vid1' });
      return undefined;
    });
    const adapter = new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep });
    expect(await adapter.appendToDescription('vid1', '🎧 Spotify: https://open.spotify.com/track/1')).toEqual({ changed: true });
    const update = calls.find((call) => call.init?.method === 'PUT')!;
    const body = JSON.parse(String(update.init!.body));
    expect(body).toEqual({
      id: 'vid1',
      snippet: { title: 'Neon Rain', description: 'Eine Nacht.\n\n🎧 Spotify: https://open.spotify.com/track/1', tags: ['neon'], categoryId: '10', defaultLanguage: 'de' },
    });
  });

  it('leaves a description that already holds the text', async () => {
    const { fetchImpl, calls } = youtubeFake((call) =>
      call.url.includes('/videos?part=snippet&id=') ? json({ items: [{ id: 'vid1', snippet: { title: 'T', categoryId: '10', description: 'Text\n\nSpotify: x' } }] }) : undefined,
    );
    const adapter = new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep });
    expect(await adapter.appendToDescription('vid1', 'Spotify: x')).toEqual({ changed: false });
    expect(calls.some((call) => call.init?.method === 'PUT')).toBe(false);
  });

  it('refuses a description over 5000 bytes', async () => {
    const { fetchImpl } = youtubeFake((call) =>
      call.url.includes('/videos?part=snippet&id=') ? json({ items: [{ id: 'vid1', snippet: { title: 'T', categoryId: '10', description: 'ä'.repeat(2499) } }] }) : undefined,
    );
    await expect(new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep }).appendToDescription('vid1', 'Spotify: https://x')).rejects.toThrow(/5000/);
  });

  it('posts a comment once, without retrying the POST', async () => {
    let posts = 0;
    const { fetchImpl, calls } = youtubeFake((call) => {
      if (call.url.endsWith('/commentThreads?part=snippet')) {
        posts += 1;
        return json({ id: 'Ugx-thread' });
      }
      return undefined;
    });
    const result = await new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep }).postComment('vid1', 'Wer hört mit?');
    expect(result).toEqual({ commentId: 'Ugx-thread' });
    expect(posts).toBe(1);
    expect(JSON.parse(String(calls.at(-1)!.init!.body))).toEqual({ snippet: { videoId: 'vid1', topLevelComment: { snippet: { textOriginal: 'Wer hört mit?' } } } });

    const failing = youtubeFake((call) => {
      if (call.url.endsWith('/commentThreads?part=snippet')) {
        posts += 1;
        return json({ error: { message: 'backend' } }, 503);
      }
      return undefined;
    });
    posts = 0;
    await expect(new YouTubePublisher({ ...youtubeCredentials, fetchImpl: failing.fetchImpl, sleep: noSleep }).postComment('vid1', 'x')).rejects.toThrow(/HTTP 503/);
    expect(posts).toBe(1);
  });

  it('asks for a new consent when the token lacks the force-ssl scope', async () => {
    const { fetchImpl } = youtubeFake(() => json({ error: { code: 403, errors: [{ reason: 'insufficientPermissions' }], message: 'Request had insufficient authentication scopes.' } }, 403));
    const adapter = new YouTubePublisher({ ...youtubeCredentials, fetchImpl, sleep: noSleep });
    const error = (await adapter.postComment('vid1', 'x').then(
      () => new Error('no error'),
      (caught: unknown) => caught as Error,
    ));
    expect(error).toBeInstanceOf(ConfigError);
    expect(error.message).toMatch(/publish-auth youtube" again to grant the new scope/);
  });
});

describe('TikTok Direct Post', () => {
  const credentials = { clientKey: 'awkey', clientSecret: 'tiktok-secret', refreshToken: 'rft.refresh' };

  function tiktokFake(options: { privacy?: string[]; commentDisabled?: boolean; finalStatus?: string }) {
    const calls: Call[] = [];
    let polls = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      if (url.endsWith('/oauth/token/')) return json({ access_token: 'act.token', expires_in: 86400, refresh_token: 'rft.refresh' });
      if (url.endsWith('/creator_info/query/')) {
        return json({
          data: {
            creator_username: 'neonband',
            privacy_level_options: options.privacy ?? ['PUBLIC_TO_EVERYONE', 'MUTUAL_FOLLOW_FRIENDS', 'SELF_ONLY'],
            comment_disabled: options.commentDisabled ?? false,
            duet_disabled: false,
            stitch_disabled: true,
            max_video_post_duration_sec: 600,
          },
          error: { code: 'ok' },
        });
      }
      if (url.endsWith('/post/publish/video/init/')) return json({ data: { publish_id: 'v_pub_1', upload_url: 'https://upload.tiktokapis.com/video/?token=x' }, error: { code: 'ok' } });
      if (url.startsWith('https://upload.tiktok')) return new Response(null, { status: 201 });
      if (url.endsWith('/status/fetch/')) {
        polls += 1;
        const status = polls < 2 ? 'PROCESSING_UPLOAD' : (options.finalStatus ?? 'PUBLISH_COMPLETE');
        // The post ID as TikTok sends it: an int64 number, beyond what a JS number holds exactly.
        const ids = status === 'PUBLISH_COMPLETE' ? '[7311111111111111111]' : '[]';
        return new Response(`{"data":{"status":"${status}","publicaly_available_post_id":${ids},"fail_reason":"file_format_check_failed"},"error":{"code":"ok"}}`, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      }
      return json({ error: { code: 'unexpected', message: url } }, 500);
    };
    return { fetchImpl, calls, polls: () => polls };
  }

  it('asks for video.publish only with TIKTOK_DIRECT_POST', () => {
    expect(tiktokScopes({})).toEqual(['video.upload']);
    expect(tiktokScopes({ TIKTOK_DIRECT_POST: '1' })).toEqual(['video.upload', 'video.publish']);
    const url = new URL(tiktokAuthUrl({ clientKey: 'k', redirectUri: 'http://localhost:8765/callback/', state: 's', challenge: 'c', scopes: tiktokScopes({ TIKTOK_DIRECT_POST: 'true' }) }));
    expect(url.searchParams.get('scope')).toBe('video.upload,video.publish');
  });

  it('posts publicly with caption and AI label, and returns the post URL', async () => {
    const video = await bytesFile(4000);
    const fake = tiktokFake({ commentDisabled: true });
    const adapter = new TikTokPublisher({ ...credentials, fetchImpl: fake.fetchImpl, sleep: noSleep, mode: 'direct' });
    const result = await adapter.publish({ item: item(video) });

    expect(result).toMatchObject({
      remoteId: '7311111111111111111',
      url: 'https://www.tiktok.com/@neonband/video/7311111111111111111',
      status: 'uploaded',
      manualSteps: [],
    });
    const init = JSON.parse(String(fake.calls.find((call) => call.url.endsWith('/post/publish/video/init/'))!.init!.body));
    expect(init.post_info).toMatchObject({
      title: 'Regen #neon',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      disable_comment: true,
      disable_duet: false,
      disable_stitch: true,
      is_aigc: true,
    });
    expect(init.source_info).toEqual({ source: 'FILE_UPLOAD', video_size: 4000, chunk_size: 4000, total_chunk_count: 1 });
    expect(fake.calls.findIndex((call) => call.url.endsWith('/creator_info/query/'))).toBeLessThan(fake.calls.findIndex((call) => call.url.endsWith('/video/init/')));
    expect(fake.polls()).toBe(2);
  });

  it('refuses when the account offers no public posting (unaudited app)', async () => {
    const video = await bytesFile(4000);
    const fake = tiktokFake({ privacy: ['SELF_ONLY'] });
    await expect(new TikTokPublisher({ ...credentials, fetchImpl: fake.fetchImpl, sleep: noSleep, mode: 'direct' }).publish({ item: item(video) })).rejects.toThrow(
      /SELF_ONLY.*TIKTOK_DIRECT_POST/,
    );
    expect(fake.calls.some((call) => call.url.endsWith('/video/init/'))).toBe(false);
  });

  it('reports a failed post', async () => {
    const video = await bytesFile(4000);
    const fake = tiktokFake({ finalStatus: 'FAILED' });
    await expect(new TikTokPublisher({ ...credentials, fetchImpl: fake.fetchImpl, sleep: noSleep, mode: 'direct' }).publish({ item: item(video) })).rejects.toThrow(
      /file_format_check_failed/,
    );
  });

  it('keeps the inbox path as the default', async () => {
    const video = await bytesFile(4000);
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      calls.push(url);
      if (url.endsWith('/oauth/token/')) return json({ access_token: 'act.token', expires_in: 86400 });
      if (url.endsWith('/inbox/video/init/')) return json({ data: { publish_id: 'v_inbox', upload_url: 'https://upload.tiktokapis.com/x' }, error: { code: 'ok' } });
      if (url.startsWith('https://upload.tiktok')) return new Response(null, { status: 201 });
      if (url.endsWith('/status/fetch/')) return json({ data: { status: 'SEND_TO_USER_INBOX' }, error: { code: 'ok' } });
      return json({}, 500);
    };
    const result = await new TikTokPublisher({ ...credentials, fetchImpl, sleep: noSleep }).publish({ item: item(video) });
    expect(result.status).toBe('draft');
    expect(calls.some((url) => url.includes('creator_info'))).toBe(false);
  });
});

describe('MockPublisher autopilot methods', () => {
  it('tracks status, description, and comments without network', async () => {
    const video = await bytesFile(10);
    const mock = new MockPublisher('youtube');
    const upload = await mock.publish({ item: item(video, { kind: 'main', name: 'main' }), schedule: '2026-12-11T18:00:00+01:00' });
    expect(await mock.videoStatus(upload.remoteId)).toEqual({ privacyStatus: 'private', publishAt: '2026-12-11T17:00:00.000Z', uploadStatus: 'processed' });
    mock.statuses.set(upload.remoteId, { privacyStatus: 'public', uploadStatus: 'processed' });
    expect((await mock.videoStatus(upload.remoteId)).privacyStatus).toBe('public');

    expect(await mock.appendToDescription(upload.remoteId, 'Spotify: x')).toEqual({ changed: true });
    expect(await mock.appendToDescription(upload.remoteId, 'Spotify: x')).toEqual({ changed: false });
    expect(mock.descriptions.get(upload.remoteId)).toBe('Spotify: x');

    const first = await mock.postComment(upload.remoteId, 'Hallo');
    expect(first.commentId).toMatch(/^mock-comment-/);
    expect(await mock.postComment(upload.remoteId, 'Hallo')).toEqual(first);
    expect(mock.videoCalls.map((call) => call.method)).toEqual(['videoStatus', 'videoStatus', 'appendToDescription', 'appendToDescription', 'postComment', 'postComment']);
  });

  it('returns a posted video for TikTok direct mode', async () => {
    const video = await bytesFile(10);
    const result = await new MockPublisher('tiktok', 'direct').publish({ item: item(video) });
    expect(result).toMatchObject({ status: 'uploaded', manualSteps: [] });
    expect(result.url).toMatch(/^https:\/\/www\.tiktok\.com\/@mock\/video\//);
  });
});
