import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../packages/core/src/index.ts';
import {
  LINKEDIN_API_VERSION,
  LinkedInPublisher,
  exchangeLinkedInCode,
  linkedinAuthUrl,
  linkedinCommentary,
  linkedinMember,
  linkedinRedirectUri,
  linkedinTokenDaysLeft,
  resolveLinkedInCredentials,
} from '../packages/providers/src/publish/linkedin.ts';
import type { FetchLike } from '../packages/providers/src/http.ts';
import { failureClass } from '../packages/providers/src/publish/failure.ts';

const temporary: string[] = [];
const noSleep = async () => undefined;
const NOW = new Date('2026-12-15T09:00:00Z');

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

interface Call {
  url: string;
  init: RequestInit;
}

function recorder(handler: (url: string, init: RequestInit) => Response | Promise<Response>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  return {
    calls,
    fetchImpl: async (url, init = {}) => {
      calls.push({ url, init });
      return handler(url, init);
    },
  };
}

async function file(name: string, bytes: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'linkedin-'));
  temporary.push(dir);
  const path = join(dir, name);
  await writeFile(path, Buffer.alloc(bytes, 7));
  return path;
}

const ENV = {
  LINKEDIN_CLIENT_ID: 'client-id',
  LINKEDIN_CLIENT_SECRET: 'client-secret-value',
  LINKEDIN_ACCESS_TOKEN: 'access-token-value',
  LINKEDIN_TOKEN_EXPIRES_AT: '2027-01-20T00:00:00.000Z',
  LINKEDIN_MEMBER_URN: 'urn:li:person:abc123',
};

describe('LinkedIn auth', () => {
  it('builds the consent URL with the member scopes', () => {
    const url = new URL(linkedinAuthUrl({ clientId: 'cid', redirectUri: 'http://localhost:8766/callback', state: 's1' }));
    expect(url.origin + url.pathname).toBe('https://www.linkedin.com/oauth/v2/authorization');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('scope')).toBe('openid profile w_member_social');
    expect(url.searchParams.get('redirect_uri')).toBe('http://localhost:8766/callback');
    expect(url.searchParams.get('state')).toBe('s1');
  });

  it('reads credentials and the redirect URI from the environment', () => {
    expect(resolveLinkedInCredentials(ENV)).toMatchObject({ clientId: 'client-id', memberUrn: 'urn:li:person:abc123' });
    expect(linkedinRedirectUri({})).toBe('http://localhost:8766/callback');
    expect(linkedinRedirectUri({ LINKEDIN_REDIRECT_URI: 'http://localhost:9000/cb' })).toBe('http://localhost:9000/cb');
  });

  it('exchanges the code for a 60-day token', async () => {
    const { fetchImpl, calls } = recorder(() => json({ access_token: 'new-token', expires_in: 5_184_000, scope: 'openid,profile,w_member_social' }));
    const result = await exchangeLinkedInCode({ clientId: 'cid', clientSecret: 'secret-xyz', code: 'the-code', redirectUri: 'http://localhost:8766/callback', fetchImpl, now: NOW });
    expect(result).toEqual({ accessToken: 'new-token', expiresAt: '2027-02-13T09:00:00.000Z' });
    expect(calls[0]!.url).toBe('https://www.linkedin.com/oauth/v2/accessToken');
    const form = new URLSearchParams(String(calls[0]!.init.body));
    expect(form.get('grant_type')).toBe('authorization_code');
    expect(form.get('code')).toBe('the-code');
    expect(form.get('client_secret')).toBe('secret-xyz');
  });

  it('masks secrets when the exchange fails', async () => {
    const { fetchImpl } = recorder(() => json({ error: 'server_error', error_description: 'bad secret-xyz the-code' }, 400));
    const error = await exchangeLinkedInCode({ clientId: 'cid', clientSecret: 'secret-xyz', code: 'the-code', redirectUri: 'http://x', fetchImpl }).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain('secret-xyz');
    expect((error as Error).message).not.toContain('the-code');
  });

  it('finds the member URN through userinfo', async () => {
    const { fetchImpl, calls } = recorder(() => json({ sub: 'Xy9_k', name: 'Ada' }));
    expect(await linkedinMember('tok', fetchImpl)).toEqual({ memberUrn: 'urn:li:person:Xy9_k', name: 'Ada' });
    expect(calls[0]!.url).toBe('https://api.linkedin.com/v2/userinfo');
    expect((calls[0]!.init.headers as Record<string, string>).authorization).toBe('Bearer tok');
  });

  it('counts the days the token has left', () => {
    expect(linkedinTokenDaysLeft({ expiresAt: '2026-12-25T09:00:00Z' }, NOW)).toBe(10);
    expect(linkedinTokenDaysLeft({ expiresAt: '2026-12-14T09:00:00Z' }, NOW)).toBe(-1);
    expect(linkedinTokenDaysLeft({}, NOW)).toBeUndefined();
  });
});

describe('linkedinCommentary', () => {
  it('escapes the reserved characters of the little text format', () => {
    expect(linkedinCommentary('Hi (you) [x] {y} <z> @me *a* _b_ ~c~ | \\')).toBe(
      'Hi \\(you\\) \\[x\\] \\{y\\} \\<z\\> \\@me \\*a\\* \\_b\\_ \\~c\\~ \\| \\\\',
    );
  });

  it('turns hashtags into the hashtag template', () => {
    expect(linkedinCommentary('Neuer Song #KI und #Daten_Souveränität!')).toBe('Neuer Song {hashtag|\\#|KI} und {hashtag|\\#|Daten\\_Souveränität}!');
    expect(linkedinCommentary('#Start')).toBe('{hashtag|\\#|Start}');
  });

  it('escapes a lone # and one inside a word', () => {
    expect(linkedinCommentary('Platz # 1, C#')).toBe('Platz \\# 1, C\\#');
  });
});

describe('LinkedInPublisher', () => {
  it('refuses to start without a token', () => {
    expect(() => new LinkedInPublisher({ env: { LINKEDIN_CLIENT_ID: 'x' } })).toThrow(ConfigError);
  });

  it('refuses an expired token without a refresh token', async () => {
    const { fetchImpl, calls } = recorder(() => json({}));
    const publisher = new LinkedInPublisher({ env: { ...ENV, LINKEDIN_TOKEN_EXPIRES_AT: '2026-12-01T00:00:00Z' }, fetchImpl, now: () => NOW });
    await expect(publisher.post({ event: 'linkedin', text: 'Hallo' })).rejects.toThrow(/publish-auth linkedin/);
    expect(calls).toHaveLength(0);
  });

  it('refreshes an expired token when a refresh token exists and saves it', async () => {
    const saved: Record<string, string> = {};
    const { fetchImpl, calls } = recorder((url) => {
      if (url.includes('accessToken')) return json({ access_token: 'fresh-token', expires_in: 5_184_000, refresh_token: 'rt-2' });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:1' } });
    });
    const publisher = new LinkedInPublisher({
      env: { ...ENV, LINKEDIN_TOKEN_EXPIRES_AT: '2026-12-01T00:00:00Z', LINKEDIN_REFRESH_TOKEN: 'rt-1' },
      fetchImpl,
      now: () => NOW,
      saveSecret: (key, value) => void (saved[key] = value),
    });
    await publisher.post({ event: 'linkedin', text: 'Hallo' });
    expect(new URLSearchParams(String(calls[0]!.init.body)).get('grant_type')).toBe('refresh_token');
    expect(saved).toEqual({ LINKEDIN_ACCESS_TOKEN: 'fresh-token', LINKEDIN_TOKEN_EXPIRES_AT: '2027-02-13T09:00:00.000Z', LINKEDIN_REFRESH_TOKEN: 'rt-2' });
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe('Bearer fresh-token');
  });

  it('posts a text with the versioned headers, public on the main feed', async () => {
    const { fetchImpl, calls } = recorder(() => new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:7001' } }));
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep });
    const result = await publisher.post({ event: 'linkedin', text: 'Ein Lied (über KI) #KI' });
    expect(result).toEqual({ remoteId: 'urn:li:share:7001', url: 'https://www.linkedin.com/feed/update/urn:li:share:7001/', warnings: [], manualSteps: [] });
    const call = calls[0]!;
    expect(call.url).toBe('https://api.linkedin.com/rest/posts');
    const headers = call.init.headers as Record<string, string>;
    expect(headers['LinkedIn-Version']).toBe(LINKEDIN_API_VERSION);
    expect(headers['X-Restli-Protocol-Version']).toBe('2.0.0');
    expect(JSON.parse(String(call.init.body))).toEqual({
      author: 'urn:li:person:abc123',
      commentary: 'Ein Lied \\(über KI\\) {hashtag|\\#|KI}',
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    });
  });

  it('looks up and stores the member URN when it is missing', async () => {
    const saved: Record<string, string> = {};
    const { fetchImpl } = recorder((url) =>
      url.endsWith('/v2/userinfo') ? json({ sub: 'm42' }) : new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:2' } }),
    );
    const { LINKEDIN_MEMBER_URN: _omit, ...env } = ENV;
    const publisher = new LinkedInPublisher({ env, fetchImpl, now: () => NOW, saveSecret: (key, value) => void (saved[key] = value) });
    await publisher.post({ event: 'linkedin', text: 'x' });
    expect(saved.LINKEDIN_MEMBER_URN).toBe('urn:li:person:m42');
  });

  it('uploads a video in parts, finalizes with the ETags in order, waits, then posts it', async () => {
    const path = await file('main-4x5.mp4', 10);
    let polls = 0;
    const { fetchImpl, calls } = recorder((url, init) => {
      if (url.includes('action=initializeUpload')) {
        return json({
          value: {
            video: 'urn:li:video:V1',
            uploadToken: 'tok-1',
            uploadInstructions: [
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/part2', firstByte: 6, lastByte: 9 },
              { uploadUrl: 'https://www.linkedin.com/dms-uploads/part1', firstByte: 0, lastByte: 5 },
            ],
          },
        });
      }
      if (url.includes('dms-uploads/part1')) return new Response(null, { status: 200, headers: { etag: 'etag-a' } });
      if (url.includes('dms-uploads/part2')) return new Response(null, { status: 200, headers: { etag: 'etag-b' } });
      if (url.includes('action=finalizeUpload')) return new Response(null, { status: 200 });
      if (url.includes('/rest/videos/')) return json({ status: (polls += 1) < 2 ? 'PROCESSING' : 'AVAILABLE' });
      if (url.endsWith('/rest/posts')) {
        expect(JSON.parse(String(init.body)).content).toEqual({ media: { id: 'urn:li:video:V1' } });
        return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:ugcPost:9' } });
      }
      return json({}, 404);
    });
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep });
    const result = await publisher.post({ event: 'linkedin', text: 'Video', media: { path, kind: 'video' } });
    expect(result.remoteId).toBe('urn:li:ugcPost:9');

    const init = JSON.parse(String(calls[0]!.init.body));
    expect(init).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:abc123', fileSizeBytes: 10, uploadCaptions: false, uploadThumbnail: false } });
    expect(calls[1]!.url).toContain('part1');
    expect((calls[1]!.init.body as Buffer).length).toBe(6);
    expect(calls[2]!.url).toContain('part2');
    expect((calls[2]!.init.body as Buffer).length).toBe(4);
    expect(JSON.parse(String(calls[3]!.init.body))).toEqual({
      finalizeUploadRequest: { video: 'urn:li:video:V1', uploadToken: 'tok-1', uploadedPartIds: ['etag-a', 'etag-b'] },
    });
    expect(calls[4]!.url).toBe(`https://api.linkedin.com/rest/videos/${encodeURIComponent('urn:li:video:V1')}`);
    expect(polls).toBe(2);
  });

  it('keeps the token away from upload hosts outside linkedin.com', async () => {
    const path = await file('clip.mp4', 4);
    const { fetchImpl, calls } = recorder((url) => {
      if (url.includes('action=initializeUpload')) {
        return json({ value: { video: 'urn:li:video:V2', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://uploads.example-cdn.net/p', firstByte: 0, lastByte: 3 }] } });
      }
      if (url.includes('example-cdn')) return new Response(null, { status: 200, headers: { etag: 'e' } });
      if (url.includes('finalizeUpload')) return new Response(null, { status: 200 });
      if (url.includes('/rest/videos/')) return json({ status: 'AVAILABLE' });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:3' } });
    });
    await new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep }).post({ event: 'linkedin', text: 'x', media: { path, kind: 'video' } });
    const upload = calls.find((call) => call.url.includes('example-cdn'))!;
    expect((upload.init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it('reports a failed video processing with its reason', async () => {
    const path = await file('clip.mp4', 4);
    const { fetchImpl } = recorder((url) => {
      if (url.includes('action=initializeUpload')) {
        return json({ value: { video: 'urn:li:video:V3', uploadToken: '', uploadInstructions: [{ uploadUrl: 'https://www.linkedin.com/u', firstByte: 0, lastByte: 3 }] } });
      }
      if (url.endsWith('/u')) return new Response(null, { status: 200, headers: { etag: 'e' } });
      if (url.includes('finalizeUpload')) return new Response(null, { status: 200 });
      return json({ status: 'PROCESSING_FAILED', processingFailureReason: 'unsupported codec' });
    });
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep });
    await expect(publisher.post({ event: 'linkedin', text: 'x', media: { path, kind: 'video' } })).rejects.toThrow(/unsupported codec/);
  });

  it('uploads an image and attaches its URN', async () => {
    const path = await file('feed.jpg', 5);
    const { fetchImpl, calls } = recorder((url) => {
      if (url.includes('images?action=initializeUpload')) return json({ value: { image: 'urn:li:image:I1', uploadUrl: 'https://www.linkedin.com/dms-uploads/img' } });
      if (url.includes('dms-uploads/img')) return new Response(null, { status: 201 });
      return new Response(null, { status: 201, headers: { 'x-restli-id': 'urn:li:share:4' } });
    });
    await new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep }).post({ event: 'linkedin', text: 'Bild', media: { path, kind: 'image' } });
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ initializeUploadRequest: { owner: 'urn:li:person:abc123' } });
    expect((calls[1]!.init.headers as Record<string, string>)['content-type']).toBe('image/jpeg');
    expect(JSON.parse(String(calls[2]!.init.body)).content).toEqual({ media: { id: 'urn:li:image:I1' } });
  });

  it('does not retry the post itself after a server error, and masks the token', async () => {
    const { fetchImpl, calls } = recorder(() => json({ message: 'boom Bearer access-token-value' }, 500));
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep });
    const error = await publisher.post({ event: 'linkedin', text: 'x' }).catch((e: Error) => e);
    expect(calls).toHaveLength(1);
    expect((error as Error).message).toMatch(/HTTP 500/);
    expect((error as Error).message).not.toContain('access-token-value');
    expect(failureClass(error)).toBe('uncertain');
  });

  it('classifies a refused post as fatal, not uncertain', async () => {
    const { fetchImpl, calls } = recorder(() => json({ message: 'bad commentary' }, 400));
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW, sleep: noSleep });
    const error = await publisher.post({ event: 'linkedin', text: 'x' }).catch((e: Error) => e);
    expect(calls).toHaveLength(1);
    expect(failureClass(error)).toBe('fatal');
    expect((error as Error & { uncertain?: boolean }).uncertain).toBe(false);
  });

  it('refuses a post over 3000 characters before any call', async () => {
    const { fetchImpl, calls } = recorder(() => json({}));
    const publisher = new LinkedInPublisher({ env: ENV, fetchImpl, now: () => NOW });
    await expect(publisher.post({ event: 'linkedin', text: 'a'.repeat(3001) })).rejects.toThrow(/limit 3000/);
    expect(calls).toHaveLength(0);
  });
});
