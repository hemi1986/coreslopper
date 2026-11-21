import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ConfigError } from '../packages/core/src/index.ts';
import type { FetchLike } from '../packages/providers/src/http.ts';
import {
  X_PRICES,
  XPublisher,
  exchangeXCode,
  resolveXCredentials,
  validateXClient,
  xAuthUrl,
  xPostPrice,
  xRedirectUri,
} from '../packages/providers/src/publish/x.ts';

const temporary: string[] = [];
const noSleep = async () => undefined;

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

async function mediaFile(name: string, bytes: number): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-x-'));
  temporary.push(dir);
  const path = join(dir, name);
  await writeFile(path, Buffer.alloc(bytes, 7));
  return path;
}

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body?: RequestInit['body'];
}

/** A fake X API: routes by method and path, records every call. */
function fakeX(routes: Record<string, (call: Call, index: number) => Response>): { fetchImpl: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const counts = new Map<string, number>();
  const fetchImpl: FetchLike = async (input, init = {}) => {
    const url = new URL(input);
    const call: Call = { url: input, method: init.method ?? 'GET', headers: (init.headers ?? {}) as Record<string, string>, body: init.body };
    calls.push(call);
    const path = url.pathname.replace(/\/media\/upload\/[^/]+\/(append|finalize)$/, '/media/upload/{id}/$1');
    const key = `${call.method} ${path}`;
    const index = counts.get(key) ?? 0;
    counts.set(key, index + 1);
    const route = routes[key];
    if (!route) throw new Error(`unexpected ${key}`);
    return route(call, index);
  };
  return { fetchImpl, calls };
}

const credentials = { clientId: 'client-id', clientSecret: 'client-secret-xyz', refreshToken: 'refresh-token-1' };
const tokenRoute = (call: Call, index: number) => json({ access_token: `access-${index}`, expires_in: 7200, refresh_token: `refresh-token-${index + 2}` });

describe('X auth', () => {
  it('builds the consent URL with PKCE and the scopes', () => {
    const url = new URL(xAuthUrl({ clientId: 'abc', redirectUri: 'http://127.0.0.1:8767/callback', state: 's1', challenge: 'c1' }));
    expect(url.origin + url.pathname).toBe('https://x.com/i/oauth2/authorize');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('code_challenge')).toBe('c1');
    expect(url.searchParams.get('scope')).toBe('tweet.read tweet.write users.read media.write offline.access');
  });

  it('reads credentials and the redirect override from the environment', () => {
    expect(resolveXCredentials({ X_CLIENT_ID: ' id ', X_CLIENT_SECRET: 's', X_REFRESH_TOKEN: '' })).toEqual({ clientId: 'id', clientSecret: 's', refreshToken: undefined });
    expect(xRedirectUri({})).toBe('http://127.0.0.1:8767/callback');
    expect(xRedirectUri({ X_REDIRECT_URI: 'http://127.0.0.1:9000/cb' })).toBe('http://127.0.0.1:9000/cb');
  });

  it('exchanges the code with Basic auth and the verifier', async () => {
    const { fetchImpl, calls } = fakeX({ 'POST /2/oauth2/token': () => json({ access_token: 'a', refresh_token: 'r-new', expires_in: 7200 }) });
    const result = await exchangeXCode({ ...credentials, code: 'the-code', verifier: 'the-verifier', redirectUri: 'http://127.0.0.1:8767/callback', fetchImpl });
    expect(result).toEqual({ refreshToken: 'r-new' });
    const body = new URLSearchParams(String(calls[0]!.body));
    expect(body.get('grant_type')).toBe('authorization_code');
    expect(body.get('code_verifier')).toBe('the-verifier');
    expect(calls[0]!.headers.authorization).toBe(`Basic ${Buffer.from('client-id:client-secret-xyz').toString('base64')}`);
  });

  it('classifies a client check', async () => {
    const valid = fakeX({ 'POST /2/oauth2/token': () => json({ error: 'invalid_request', error_description: 'Value passed for the token was invalid.' }, 400) });
    expect((await validateXClient('id', 'secret', valid.fetchImpl)).status).toBe('valid');
    const invalid = fakeX({ 'POST /2/oauth2/token': () => json({ error: 'unauthorized_client' }, 401) });
    expect((await validateXClient('id', 'secret', invalid.fetchImpl)).status).toBe('invalid');
  });
});

describe('XPublisher', () => {
  it('needs credentials and a refresh token', () => {
    expect(() => new XPublisher({ env: {} })).toThrow(ConfigError);
    expect(() => new XPublisher({ env: { X_CLIENT_ID: 'a', X_CLIENT_SECRET: 'b' } })).toThrow(/publish-auth x/);
  });

  it('uploads a video in chunks, waits for processing, posts, and replies with the link', async () => {
    const video = await mediaFile('Z1-intro-9x16.mp4', 10 * 1024 + 5);
    const saved: [string, string][] = [];
    const { fetchImpl, calls } = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/media/upload/initialize': () => json({ data: { id: 'm1', media_key: '7_m1' } }),
      'POST /2/media/upload/{id}/append': () => new Response(null, { status: 204 }),
      'POST /2/media/upload/{id}/finalize': () => json({ data: { id: 'm1', processing_info: { state: 'pending', check_after_secs: 1 } } }),
      'GET /2/media/upload': (_call, index) =>
        json({ data: { processing_info: index === 0 ? { state: 'in_progress', check_after_secs: 2 } : { state: 'succeeded' } } }),
      'POST /2/tweets': (call, index) => json({ data: { id: index === 0 ? 'p1' : 'p2', text: JSON.parse(String(call.body)).text } }, 201),
    });
    const publisher = new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep, chunkBytes: 4096, saveSecret: (key, value) => void saved.push([key, value]) });
    const result = await publisher.post({
      event: 'x',
      text: 'Neon Rain ist draußen. #synthwave',
      media: { path: video, kind: 'video' },
      reply: 'Ganzes Video: https://youtu.be/abc',
    });

    expect(result).toMatchObject({ remoteId: 'p1', url: 'https://x.com/i/status/p1', replyId: 'p2', warnings: [], manualSteps: [] });
    expect(result.costUsd).toBeCloseTo(X_PRICES.post + X_PRICES.postWithUrl);
    expect(saved).toEqual([['X_REFRESH_TOKEN', 'refresh-token-2']]);

    const init = JSON.parse(String(calls.find((call) => call.url.endsWith('/initialize'))!.body));
    expect(init).toEqual({ media_type: 'video/mp4', total_bytes: 10 * 1024 + 5, media_category: 'tweet_video' });
    const appends = calls.filter((call) => call.url.endsWith('/append'));
    expect(appends).toHaveLength(3);
    expect(appends.map((call) => (call.body as FormData).get('segment_index'))).toEqual(['0', '1', '2']);
    expect(((appends[2]!.body as FormData).get('media') as Blob).size).toBe(10 * 1024 + 5 - 2 * 4096);
    expect(calls.filter((call) => call.method === 'GET')).toHaveLength(2);

    const posts = calls.filter((call) => call.url.endsWith('/2/tweets')).map((call) => JSON.parse(String(call.body)));
    expect(posts[0]).toEqual({ text: 'Neon Rain ist draußen. #synthwave', media: { media_ids: ['m1'] } });
    expect(posts[1]).toEqual({ text: 'Ganzes Video: https://youtu.be/abc', reply: { in_reply_to_tweet_id: 'p1' } });
    expect(calls.every((call) => call.url.includes('oauth2') || call.headers.authorization === 'Bearer access-0')).toBe(true);
  });

  it('uploads an image as tweet_image without a processing poll', async () => {
    const image = await mediaFile('announce.jpg', 2000);
    const { fetchImpl, calls } = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/media/upload/initialize': () => json({ data: { id: 'm2' } }),
      'POST /2/media/upload/{id}/append': () => new Response(null, { status: 204 }),
      'POST /2/media/upload/{id}/finalize': () => json({ data: { id: 'm2' } }),
      'POST /2/tweets': () => json({ data: { id: 'p3' } }, 201),
    });
    const result = await new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep, saveSecret: () => undefined }).post({
      event: 'announce:x',
      text: 'Freitag 18 Uhr.',
      media: { path: image, kind: 'image' },
    });
    expect(result.remoteId).toBe('p3');
    expect(result.costUsd).toBeCloseTo(X_PRICES.post);
    expect(JSON.parse(String(calls.find((call) => call.url.endsWith('/initialize'))!.body)).media_category).toBe('tweet_image');
    expect(calls.some((call) => call.method === 'GET')).toBe(false);
  });

  it('fails when processing fails', async () => {
    const video = await mediaFile('bad.mp4', 100);
    const { fetchImpl } = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/media/upload/initialize': () => json({ data: { id: 'm3' } }),
      'POST /2/media/upload/{id}/append': () => new Response(null, { status: 204 }),
      'POST /2/media/upload/{id}/finalize': () => json({ data: { id: 'm3', processing_info: { state: 'failed', error: { message: 'InvalidMedia' } } } }),
    });
    await expect(
      new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep, saveSecret: () => undefined }).post({ event: 'x', text: 'a', media: { path: video, kind: 'video' } }),
    ).rejects.toThrow(/InvalidMedia/);
  });

  it('keeps a live post when only the reply fails', async () => {
    const { fetchImpl } = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/tweets': (_call, index) => (index === 0 ? json({ data: { id: 'p1' } }, 201) : json({ title: 'Forbidden', detail: 'nope' }, 403)),
    });
    const result = await new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep, saveSecret: () => undefined }).post({
      event: 'x',
      text: 'Post',
      reply: 'Link: https://youtu.be/abc',
    });
    expect(result.remoteId).toBe('p1');
    expect(result.replyId).toBeUndefined();
    expect(result.warnings[0]).toMatch(/reply failed/);
    expect(result.manualSteps[0]).toMatch(/Reply to https:\/\/x.com\/i\/status\/p1/);
  });

  it('does not retry a post on 5xx, so it cannot post twice', async () => {
    const { fetchImpl, calls } = fakeX({ 'POST /2/oauth2/token': tokenRoute, 'POST /2/tweets': () => json({ title: 'Service Unavailable' }, 503) });
    await expect(new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep, saveSecret: () => undefined }).post({ event: 'x', text: 'Post' })).rejects.toThrow(
      /may exist anyway/,
    );
    expect(calls.filter((call) => call.url.endsWith('/2/tweets'))).toHaveLength(1);
  });

  it('waits for a near rate-limit reset once, and gives up on a far one', async () => {
    const now = new Date('2026-12-11T17:00:00Z');
    const soon = String(Math.floor(now.getTime() / 1000) + 30);
    const near = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/tweets': (_call, index) => (index === 0 ? json({ title: 'Too Many Requests' }, 429, { 'x-rate-limit-reset': soon }) : json({ data: { id: 'p9' } }, 201)),
    });
    const waits: number[] = [];
    const result = await new XPublisher({ ...credentials, env: {}, fetchImpl: near.fetchImpl, sleep: async (ms) => void waits.push(ms), now: () => now, saveSecret: () => undefined }).post({
      event: 'x',
      text: 'Post',
    });
    expect(result.remoteId).toBe('p9');
    expect(waits.some((ms) => ms >= 30_000)).toBe(true);

    const later = String(Math.floor(now.getTime() / 1000) + 900);
    const far = fakeX({ 'POST /2/oauth2/token': tokenRoute, 'POST /2/tweets': () => json({ title: 'Too Many Requests' }, 429, { 'x-rate-limit-reset': later }) });
    await expect(
      new XPublisher({ ...credentials, env: {}, fetchImpl: far.fetchImpl, sleep: noSleep, now: () => now, saveSecret: () => undefined }).post({ event: 'x', text: 'Post' }),
    ).rejects.toThrow(/rate limit reached until/);
  });

  it('turns a rejected refresh token into a re-auth hint without leaking secrets', async () => {
    const { fetchImpl } = fakeX({ 'POST /2/oauth2/token': () => json({ error: 'invalid_request', error_description: 'Value passed for the token was invalid.' }, 400) });
    await expect(new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep }).post({ event: 'x', text: 'Post' })).rejects.toThrow(/publish-auth x/);

    const leaky = fakeX({
      'POST /2/oauth2/token': tokenRoute,
      'POST /2/tweets': () => json({ detail: 'bad request for Bearer access-0 and refresh-token-1' }, 400),
    });
    const error = await new XPublisher({ ...credentials, env: {}, fetchImpl: leaky.fetchImpl, sleep: noSleep, saveSecret: () => undefined })
      .post({ event: 'x', text: 'Post' })
      .catch((caught: Error) => caught);
    expect((error as Error).message).not.toContain('access-0');
    expect((error as Error).message).not.toContain('refresh-token-1');
  });

  it('warns when a rotated refresh token is not stored', async () => {
    const { fetchImpl } = fakeX({ 'POST /2/oauth2/token': tokenRoute, 'POST /2/tweets': () => json({ data: { id: 'p1' } }, 201) });
    const result = await new XPublisher({ ...credentials, env: {}, fetchImpl, sleep: noSleep }).post({ event: 'x', text: 'Post' });
    expect(result.warnings.join(' ')).toMatch(/rotated the refresh token/);
  });

  it('prices posts with a link at the URL rate', () => {
    expect(xPostPrice('Neu: https://youtu.be/x')).toBe(X_PRICES.postWithUrl);
    expect(xPostPrice('Neu am Freitag')).toBe(X_PRICES.post);
  });
});
