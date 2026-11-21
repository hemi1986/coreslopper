import { stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { ConfigError } from '@coreslopper/core';
import { delay, mimeForPath, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readChunk, readJson, redactSecrets, markUncertain } from './http.js';
import { RefreshingToken } from './oauth.js';
import type { PublishLogger } from './types.js';
import type { SaveSecret, SocialAdapter, SocialAdapterOptions, SocialPostRequest, SocialPostResult } from './social.js';

// X (formerly Twitter) through API v2 with an OAuth 2.0 user token
// (authorization code with PKCE, confidential client). The release autopilot
// posts a native video or image and, optionally, a reply with the YouTube link.
//
// Verified against docs.x.com (2026-11):
// - authorize https://x.com/i/oauth2/authorize, token https://api.x.com/2/oauth2/token
//   (confidential clients authenticate with HTTP Basic), refresh tokens need
//   `offline.access` and are single-use: every refresh returns a new one.
// - media: POST /2/media/upload/initialize (JSON: media_type, total_bytes,
//   media_category), POST /2/media/upload/{id}/append (multipart: media,
//   segment_index 0..), POST /2/media/upload/{id}/finalize, then
//   GET /2/media/upload?command=STATUS&media_id=<id> while processing_info
//   says pending or in_progress.
// - posts: POST /2/tweets with { text, media: { media_ids }, reply: { in_reply_to_tweet_id } };
//   the new post's ID is data.id.
// Not confirmed by the docs: a maximum chunk size (the quickstart uses small
// chunks; 4 MiB stays under the 5 MB limit of the v1.1 endpoint).

export const X_SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'media.write', 'offline.access'] as const;
export const X_DEFAULT_REDIRECT_URI = 'http://127.0.0.1:8767/callback';
const AUTH_URL = 'https://x.com/i/oauth2/authorize';
const API = 'https://api.x.com/2';
const TOKEN_URL = `${API}/oauth2/token`;

/**
 * Pay-per-use prices in USD per request (docs.x.com/x-api/getting-started/pricing,
 * as of 2026-04-20). A post whose text holds a URL is billed at the URL rate.
 * Media upload has no listed price; it is counted as 0 here.
 */
export const X_PRICES = { post: 0.015, postWithUrl: 0.2, mediaUpload: 0 } as const;

/** Upload chunk size. */
export const X_CHUNK_BYTES = 4 * 1024 * 1024;

export interface XCredentials {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function resolveXCredentials(env: NodeJS.ProcessEnv = process.env): XCredentials {
  const read = (key: string) => env[key]?.trim() || undefined;
  return { clientId: read('X_CLIENT_ID'), clientSecret: read('X_CLIENT_SECRET'), refreshToken: read('X_REFRESH_TOKEN') };
}

/** The callback URL registered in the X developer console; `X_REDIRECT_URI` overrides the default. */
export function xRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return env.X_REDIRECT_URI?.trim() || X_DEFAULT_REDIRECT_URI;
}

/** The consent URL of the authorization-code flow with PKCE (S256). */
export function xAuthUrl(options: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    scope: X_SCOPES.join(' '),
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

/** The price of one post: the URL rate when the text holds a link. */
export function xPostPrice(text: string): number {
  return /https?:\/\/\S/i.test(text) ? X_PRICES.postWithUrl : X_PRICES.post;
}

const basicAuth = (clientId: string, clientSecret: string) => `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;

interface XTokens {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken?: string;
}

async function tokenRequest(
  credentials: { clientId: string; clientSecret: string },
  params: Record<string, string>,
  fetchImpl: FetchLike,
  secrets: (string | undefined)[],
  sleep?: (ms: number) => Promise<void>,
): Promise<XTokens> {
  const response = await fetchWithRetry(
    fetchImpl,
    TOKEN_URL,
    {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded',
        authorization: basicAuth(credentials.clientId, credentials.clientSecret),
      },
      body: new URLSearchParams({ ...params, client_id: credentials.clientId }).toString(),
    },
    { secrets: [...secrets, credentials.clientSecret], sleep, timeoutMs: 30_000 },
  );
  const body = await readJson(response);
  const error = typeof body.error === 'string' ? body.error : undefined;
  if (error === 'unauthorized_client' || error === 'invalid_client' || response.status === 401) {
    throw new ConfigError('X rejected X_CLIENT_ID or X_CLIENT_SECRET. Check them in .env (see docs/publishing.md, "X").');
  }
  if (error === 'invalid_request' || error === 'invalid_grant') {
    throw new ConfigError(
      'X rejected the refresh token (revoked, expired, or already used: X issues a new one on every refresh). ' +
        'Run "npm run cli -- publish-auth x" again.',
    );
  }
  if (!response.ok || typeof body.access_token !== 'string') throw httpError('X token request', response.status, body, secrets);
  return {
    accessToken: body.access_token,
    expiresInSeconds: Number(body.expires_in ?? 7200),
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
  };
}

/** Exchange the authorization code for tokens; X returns a refresh token because `offline.access` was asked for. */
export async function exchangeXCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<{ refreshToken: string }> {
  const tokens = await tokenRequest(
    options,
    { grant_type: 'authorization_code', code: options.code, redirect_uri: options.redirectUri, code_verifier: options.verifier },
    options.fetchImpl ?? fetch,
    [options.code, options.verifier],
  );
  if (!tokens.refreshToken) throw new PublishError('X returned no refresh token; the app must request the offline.access scope.');
  return { refreshToken: tokens.refreshToken };
}

/**
 * Check a client without a user: a refresh with a dummy token fails with
 * `invalid_request` for a valid client and `unauthorized_client` (HTTP 401)
 * otherwise. Best effort.
 */
export async function validateXClient(
  clientId: string,
  clientSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: 'valid' | 'invalid' | 'unknown'; message: string }> {
  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', authorization: basicAuth(clientId, clientSecret) },
      body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: 'coreslopper-client-check', client_id: clientId }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(response);
    if (response.status === 401 || body.error === 'unauthorized_client' || body.error === 'invalid_client') {
      return { status: 'invalid', message: `${String(body.error ?? 'HTTP 401')} (client ID or secret rejected)` };
    }
    if (body.error === 'invalid_request' || body.error === 'invalid_grant') return { status: 'valid', message: 'client accepted' };
    return { status: 'unknown', message: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'unknown', message: redactSecrets(error instanceof Error ? error.message : String(error), [clientSecret]) };
  }
}

export interface XPublisherOptions extends SocialAdapterOptions, XCredentials {
  /** Upload chunk size in bytes. */
  chunkBytes?: number;
  /** How long to wait for X to process a video. */
  processingTimeoutMs?: number;
  /** Longest wait for a rate-limit reset before giving up (the next autopilot run tries again). */
  maxRateLimitWaitMs?: number;
}

/** X API v2: chunked media upload, the post, and its reply. */
export class XPublisher implements SocialAdapter {
  readonly platform = 'x' as const;
  readonly mock = false;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: PublishLogger;
  private readonly saveSecret?: SaveSecret;
  private readonly now: () => Date;
  private readonly token: RefreshingToken;
  private readonly secrets: (string | undefined)[];
  private readonly chunkBytes: number;
  private readonly processingTimeoutMs: number;
  private readonly maxRateLimitWaitMs: number;
  private refreshToken: string;
  /** Warnings that arise outside a post, e.g. a rotated token nobody stored. */
  private readonly pendingWarnings: string[] = [];

  constructor(options: XPublisherOptions = {}) {
    const credentials = { ...resolveXCredentials(options.env), ...defined({ clientId: options.clientId, clientSecret: options.clientSecret, refreshToken: options.refreshToken }) };
    const { clientId, clientSecret, refreshToken } = credentials;
    if (!clientId || !clientSecret) {
      throw new ConfigError('X credentials are not set. Add X_CLIENT_ID and X_CLIENT_SECRET to .env (see docs/publishing.md, "X").');
    }
    if (!refreshToken) throw new ConfigError('X_REFRESH_TOKEN is not set. Run "npm run cli -- publish-auth x" once.');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.log = options.log ?? (() => undefined);
    this.saveSecret = options.saveSecret;
    this.now = options.now ?? (() => new Date());
    this.chunkBytes = Math.max(1024, Math.floor(options.chunkBytes ?? X_CHUNK_BYTES));
    this.processingTimeoutMs = options.processingTimeoutMs ?? 10 * 60_000;
    this.maxRateLimitWaitMs = options.maxRateLimitWaitMs ?? 90_000;
    this.refreshToken = refreshToken;
    this.secrets = [clientSecret, refreshToken];
    this.token = new RefreshingToken(async () => {
      const tokens = await tokenRequest(
        { clientId, clientSecret },
        { grant_type: 'refresh_token', refresh_token: this.refreshToken },
        this.fetchImpl,
        this.secrets,
        this.sleep,
      );
      this.secrets.push(tokens.accessToken);
      if (tokens.refreshToken && tokens.refreshToken !== this.refreshToken) {
        // Single-use refresh tokens: the old one is dead now, so store the new one before anything else.
        this.refreshToken = tokens.refreshToken;
        this.secrets.push(tokens.refreshToken);
        if (this.saveSecret) await this.saveSecret('X_REFRESH_TOKEN', tokens.refreshToken);
        else this.pendingWarnings.push('X rotated the refresh token but nothing stored it; run "npm run cli -- publish-auth x" before the next post.');
      }
      return { accessToken: tokens.accessToken, expiresInSeconds: tokens.expiresInSeconds };
    }, () => this.now().getTime());
  }

  async post(request: SocialPostRequest): Promise<SocialPostResult> {
    const warnings: string[] = [];
    let costUsd = 0;
    let mediaId: string | undefined;
    if (request.media) {
      mediaId = await this.uploadMedia(request.media.path, request.media.kind);
      costUsd += X_PRICES.mediaUpload;
    }
    if (!request.text.trim() && !mediaId) throw new PublishError(`${request.event}: an X post needs text or media.`);
    this.log(`x: posting ${request.event}`);
    const post = await this.createPost({
      ...(request.text.trim() ? { text: request.text } : {}),
      ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
    });
    costUsd += xPostPrice(request.text);
    let replyId: string | undefined;
    const manualSteps: string[] = [];
    if (request.reply?.trim()) {
      try {
        replyId = await this.createPost({ text: request.reply, reply: { in_reply_to_tweet_id: post } });
        costUsd += xPostPrice(request.reply);
      } catch (error) {
        // The post is live; a failed reply must not make the autopilot post it again.
        warnings.push(redactSecrets(`The post is live but the reply failed: ${(error as Error).message}`, this.secrets));
        manualSteps.push(`Reply to https://x.com/i/status/${post} with:\n${request.reply}`);
      }
    }
    warnings.push(...this.pendingWarnings.splice(0));
    return {
      remoteId: post,
      url: `https://x.com/i/status/${post}`,
      ...(replyId ? { replyId } : {}),
      warnings,
      manualSteps,
      costUsd: Math.round(costUsd * 1000) / 1000,
    };
  }

  private async authorized(send: (token: string) => Promise<Response>): Promise<Response> {
    let response = await send(await this.token.get());
    if (response.status === 401) {
      await response.body?.cancel().catch(() => undefined);
      this.token.invalidate();
      response = await send(await this.token.get());
    }
    return response;
  }

  /** A JSON or multipart call with retries for network errors and 5xx; safe for idempotent media steps only. */
  private call(url: string, init: RequestInit): Promise<Response> {
    return this.authorized((token) =>
      fetchWithRetry(
        this.fetchImpl,
        url,
        { ...init, headers: { ...(init.headers as Record<string, string>), authorization: `Bearer ${token}` } },
        { secrets: this.secrets, sleep: this.sleep, timeoutMs: 300_000 },
      ),
    );
  }

  /** Chunked upload: initialize, append each segment, finalize, then wait for processing. Returns the media ID. */
  async uploadMedia(path: string, kind: 'video' | 'image'): Promise<string> {
    const size = (await stat(path)).size;
    const mediaType = mimeForPath(path);
    this.log(`x: uploading ${basename(path)} (${(size / 1e6).toFixed(1)} MB)`);
    const init = await this.call(`${API}/media/upload/initialize`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ media_type: mediaType, total_bytes: size, media_category: kind === 'video' ? 'tweet_video' : 'tweet_image' }),
    });
    const initBody = await readJson(init);
    if (!init.ok) throw httpError('X media upload initialize', init.status, initBody, this.secrets);
    const id = stringAt(initBody, 'data', 'id');
    if (!id) throw new PublishError(`X returned no media ID for ${basename(path)}.`);

    for (let offset = 0, segment = 0; offset < size; offset += this.chunkBytes, segment += 1) {
      const chunk = await readChunk(path, offset, Math.min(this.chunkBytes, size - offset));
      const form = new FormData();
      form.append('segment_index', String(segment));
      form.append('media', new Blob([chunk], { type: mediaType }), basename(path));
      const append = await this.call(`${API}/media/upload/${encodeURIComponent(id)}/append`, { method: 'POST', body: form });
      if (!append.ok) throw httpError(`X media upload append (segment ${segment})`, append.status, await readJson(append), this.secrets);
      await append.body?.cancel().catch(() => undefined);
    }

    const finalize = await this.call(`${API}/media/upload/${encodeURIComponent(id)}/finalize`, { method: 'POST' });
    const finalBody = await readJson(finalize);
    if (!finalize.ok) throw httpError('X media upload finalize', finalize.status, finalBody, this.secrets);
    await this.waitForProcessing(id, processingInfo(finalBody), basename(path));
    return id;
  }

  private async waitForProcessing(id: string, info: ProcessingInfo | undefined, name: string): Promise<void> {
    const started = this.now().getTime();
    let current = info;
    while (current && (current.state === 'pending' || current.state === 'in_progress')) {
      if (this.now().getTime() - started > this.processingTimeoutMs) {
        throw new PublishError(`X was still processing ${name} after ${Math.round(this.processingTimeoutMs / 1000)} s; the next run tries again.`);
      }
      await this.sleep(Math.min(30, Math.max(1, current.checkAfterSecs ?? 2)) * 1000);
      const status = await this.call(`${API}/media/upload?command=STATUS&media_id=${encodeURIComponent(id)}`, { method: 'GET' });
      const body = await readJson(status);
      if (!status.ok) throw httpError('X media upload status', status.status, body, this.secrets);
      current = processingInfo(body);
    }
    if (current?.state === 'failed') {
      throw new PublishError(`X could not process ${name}: ${current.error ?? 'processing failed'} (check length, size, and codec).`);
    }
  }

  /**
   * Create one post. Sent once, without automatic retries: a lost answer or a
   * 5xx may still have created it, and a second post would be a duplicate. A
   * 429 waits for the reset when it is near, else fails for the next run.
   */
  private async createPost(body: Record<string, unknown>): Promise<string> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const response = await this.authorized((token) =>
        fetchWithRetry(
          this.fetchImpl,
          `${API}/tweets`,
          { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) },
          { attempts: 1, secrets: this.secrets, sleep: this.sleep, timeoutMs: 60_000 },
        ),
      ).catch((error: unknown) => {
        // A network error after sending: the post may exist.
        throw markUncertain(error);
      });
      const json = await readJson(response);
      if (response.ok) {
        const id = stringAt(json, 'data', 'id');
        if (!id) throw markUncertain(new PublishError('X accepted the post but returned no ID; check the profile before posting again.'));
        return id;
      }
      if (response.status === 429) {
        const reset = Number(response.headers.get('x-rate-limit-reset'));
        const waitMs = Number.isFinite(reset) && reset > 0 ? reset * 1000 - this.now().getTime() : Number.POSITIVE_INFINITY;
        if (attempt === 0 && waitMs <= this.maxRateLimitWaitMs) {
          this.log(`x: rate limited, waiting ${Math.max(1, Math.ceil(waitMs / 1000))} s`);
          await this.sleep(Math.max(1000, waitMs + 1000));
          continue;
        }
        const when = Number.isFinite(waitMs) ? ` until ${new Date(reset * 1000).toISOString()}` : '';
        throw new PublishError(`X rate limit reached${when}; the next run tries again.`, 429, json);
      }
      if (response.status === 402 || /credit|payment/i.test(JSON.stringify(json))) {
        throw new ConfigError('X refused the post for billing: add credits to the app in the X developer console (pay-per-use).');
      }
      if (response.status === 403 && /duplicate/i.test(JSON.stringify(json))) {
        throw markUncertain(new PublishError('X refused the post as a duplicate: it is probably live already; check the profile.', 403, json));
      }
      if (response.status >= 500) {
        throw markUncertain(new PublishError(`X answered HTTP ${response.status}; the post may exist anyway. Check the profile before trying again.`, response.status, json));
      }
      throw httpError('X create post', response.status, json, this.secrets);
    }
    throw new PublishError('X rate limit reached; the next run tries again.', 429);
  }
}

interface ProcessingInfo {
  state: string;
  checkAfterSecs?: number;
  error?: string;
}

function processingInfo(body: Record<string, unknown>): ProcessingInfo | undefined {
  const data = (body.data ?? body) as Record<string, unknown>;
  const info = data.processing_info as Record<string, unknown> | undefined;
  if (!info || typeof info.state !== 'string') return undefined;
  const error = info.error as Record<string, unknown> | undefined;
  return {
    state: info.state,
    checkAfterSecs: typeof info.check_after_secs === 'number' ? info.check_after_secs : undefined,
    error: error ? String(error.message ?? error.name ?? JSON.stringify(error)) : undefined,
  };
}

function stringAt(body: Record<string, unknown>, ...keys: string[]): string | undefined {
  let value: unknown = body;
  for (const key of keys) value = value && typeof value === 'object' ? (value as Record<string, unknown>)[key] : undefined;
  return typeof value === 'string' && value ? value : undefined;
}

function defined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
