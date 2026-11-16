import { stat } from 'node:fs/promises';
import { ConfigError } from '@coreslopper/core';
import { delay, mimeForPath, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readChunk, readJson, redactSecrets } from './http.js';
import { RefreshingToken } from './oauth.js';
import type { PublishAdapter, PublishItem, PublishLogger, PublishRequest, PublishResult } from './types.js';

export const TIKTOK_SCOPE = 'video.upload';
export const TIKTOK_DEFAULT_REDIRECT_URI = 'http://localhost:8765/callback/';
const AUTH_URL = 'https://www.tiktok.com/v2/auth/authorize/';
const API = 'https://open.tiktokapis.com/v2';
const TOKEN_URL = `${API}/oauth/token/`;

/** Content Posting API limits for an inbox upload. */
export const TIKTOK_LIMITS = {
  /** Uploads that may wait in the user's inbox within 24 hours. */
  pendingPer24h: 5,
  maxBytes: 4 * 1024 ** 3,
  maxSeconds: 600,
  minSeconds: 3,
  captionChars: 2200,
  minChunk: 5 * 1024 ** 2,
  chunk: 10 * 1024 ** 2,
  maxChunks: 1000,
} as const;

export interface TikTokCredentials {
  clientKey?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function resolveTikTokCredentials(env: NodeJS.ProcessEnv = process.env): TikTokCredentials {
  const read = (key: string) => env[key]?.trim() || undefined;
  return {
    clientKey: read('TIKTOK_CLIENT_KEY'),
    clientSecret: read('TIKTOK_CLIENT_SECRET'),
    refreshToken: read('TIKTOK_REFRESH_TOKEN'),
  };
}

/** The redirect URI registered in the TikTok developer portal; `TIKTOK_REDIRECT_URI` overrides the default. */
export function tiktokRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return env.TIKTOK_REDIRECT_URI?.trim() || TIKTOK_DEFAULT_REDIRECT_URI;
}

/** The caption the user pastes in TikTok: the title and the hashtags, without YouTube's `#shorts`. */
export function tiktokCaption(item: Pick<PublishItem, 'title' | 'hashtags'>): string {
  const isShorts = (tag: string) => /^#shorts$/i.test(tag);
  const title = item.title
    .split(/\s+/)
    .filter((word) => !isShorts(word))
    .join(' ')
    .trim();
  const hashtags = item.hashtags.filter((tag) => !isShorts(tag) && !title.includes(tag));
  return [title, hashtags.join(' ')].filter(Boolean).join('\n\n');
}

/** Chunk size and count: up to 10 MB in one piece, else 10 MB chunks with the remainder joined to the last. */
export function tiktokChunks(size: number): { chunkSize: number; count: number } {
  if (size <= TIKTOK_LIMITS.chunk) return { chunkSize: size, count: 1 };
  const count = Math.floor(size / TIKTOK_LIMITS.chunk);
  return { chunkSize: TIKTOK_LIMITS.chunk, count };
}

/** The consent URL of the desktop flow; TikTok expects the PKCE challenge as a hex SHA-256. */
export function tiktokAuthUrl(options: { clientKey: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_key: options.clientKey,
    scope: TIKTOK_SCOPE,
    response_type: 'code',
    redirect_uri: options.redirectUri,
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

interface TokenResponse {
  accessToken: string;
  expiresInSeconds: number;
  refreshToken?: string;
}

async function tokenRequest(
  params: Record<string, string>,
  fetchImpl: FetchLike,
  secrets: (string | undefined)[],
  sleep?: (ms: number) => Promise<void>,
): Promise<TokenResponse> {
  const response = await fetchWithRetry(
    fetchImpl,
    TOKEN_URL,
    {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded', 'cache-control': 'no-cache' },
      body: new URLSearchParams(params).toString(),
    },
    { secrets, sleep, timeoutMs: 30_000 },
  );
  const body = await readJson(response);
  // TikTok reports token errors in the body, sometimes with HTTP 200.
  const error = typeof body.error === 'string' ? body.error : undefined;
  if (error === 'invalid_grant') {
    throw new ConfigError('TikTok rejected the refresh token (revoked or older than 365 days). Run "npm run cli -- publish-auth tiktok" again.');
  }
  if (error === 'invalid_client') {
    throw new ConfigError('TikTok rejected TIKTOK_CLIENT_KEY or TIKTOK_CLIENT_SECRET. Check them in .env (see docs/publishing.md).');
  }
  if (!response.ok || error || typeof body.access_token !== 'string') {
    throw httpError('TikTok token request', response.status, body, secrets);
  }
  return {
    accessToken: body.access_token,
    expiresInSeconds: Number(body.expires_in ?? 86_400),
    refreshToken: typeof body.refresh_token === 'string' ? body.refresh_token : undefined,
  };
}

export async function exchangeTikTokCode(options: {
  clientKey: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<{ refreshToken: string }> {
  const result = await tokenRequest(
    {
      client_key: options.clientKey,
      client_secret: options.clientSecret,
      code: options.code,
      grant_type: 'authorization_code',
      redirect_uri: options.redirectUri,
      code_verifier: options.verifier,
    },
    options.fetchImpl ?? fetch,
    [options.clientSecret, options.code, options.verifier],
  );
  if (!result.refreshToken) throw new PublishError('TikTok returned no refresh token.');
  return { refreshToken: result.refreshToken };
}

/** Check a client key and secret with the client-credentials grant, which needs no user. */
export async function validateTikTokClient(
  clientKey: string,
  clientSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: 'valid' | 'invalid' | 'unknown'; message: string }> {
  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_key: clientKey, client_secret: clientSecret, grant_type: 'client_credentials' }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(response);
    if (typeof body.access_token === 'string') return { status: 'valid', message: 'client accepted' };
    if (body.error === 'invalid_client') return { status: 'invalid', message: 'invalid_client (client key or secret rejected)' };
    return { status: 'unknown', message: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'unknown', message: redactSecrets(error instanceof Error ? error.message : String(error), [clientSecret]) };
  }
}

export interface TikTokPublisherOptions extends TikTokCredentials {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Called when TikTok rotates the refresh token, so the caller can store the new one. */
  onRefreshToken?: (token: string) => Promise<void> | void;
  pollIntervalMs?: number;
  /** How long to wait for TikTok to deliver the draft before recording it as processing. */
  pollTimeoutMs?: number;
  log?: PublishLogger;
  now?: () => number;
}

/**
 * Content Posting API, inbox path (`video.upload`): init a FILE_UPLOAD, send
 * the chunks, poll the status. The video lands in the user's TikTok inbox as
 * a draft; the user adds sound and text there and posts it.
 */
export class TikTokPublisher implements PublishAdapter {
  readonly platform = 'tiktok' as const;
  readonly mock = false;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly token: RefreshingToken;
  private readonly secrets: (string | undefined)[];
  private readonly log: PublishLogger;
  private readonly pollIntervalMs: number;
  private readonly pollTimeoutMs: number;
  private readonly now: () => number;

  constructor(options: TikTokPublisherOptions = {}) {
    const env = resolveTikTokCredentials();
    const clientKey = options.clientKey ?? env.clientKey;
    const clientSecret = options.clientSecret ?? env.clientSecret;
    let refreshToken = options.refreshToken ?? env.refreshToken;
    if (!clientKey || !clientSecret) {
      throw new ConfigError('TikTok credentials are not set. Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env (see docs/publishing.md).');
    }
    if (!refreshToken) throw new ConfigError('TIKTOK_REFRESH_TOKEN is not set. Run "npm run cli -- publish-auth tiktok" once.');
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.log = options.log ?? (() => undefined);
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.pollTimeoutMs = options.pollTimeoutMs ?? 600_000;
    this.now = options.now ?? Date.now;
    this.secrets = [clientSecret, refreshToken];
    this.token = new RefreshingToken(async () => {
      const result = await tokenRequest(
        { client_key: clientKey, client_secret: clientSecret, grant_type: 'refresh_token', refresh_token: refreshToken! },
        this.fetchImpl,
        this.secrets,
        this.sleep,
      );
      this.secrets.push(result.accessToken);
      if (result.refreshToken && result.refreshToken !== refreshToken) {
        refreshToken = result.refreshToken;
        this.secrets.push(refreshToken);
        await options.onRefreshToken?.(refreshToken);
      }
      return result;
    }, this.now);
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { item } = request;
    const size = (await stat(item.file)).size;
    const { chunkSize, count } = tiktokChunks(size);
    this.log(`tiktok: uploading ${item.name} (${(size / 1e6).toFixed(1)} MB, ${count} chunk${count === 1 ? '' : 's'})`);

    const init = await this.api('post/publish/inbox/video/init/', {
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    });
    const publishId = typeof init.publish_id === 'string' ? init.publish_id : undefined;
    const uploadUrl = typeof init.upload_url === 'string' ? init.upload_url : undefined;
    if (!publishId || !uploadUrl) throw new PublishError('TikTok returned no publish_id or upload_url.');

    for (let index = 0; index < count; index += 1) {
      const start = index * chunkSize;
      const end = index === count - 1 ? size : start + chunkSize;
      const chunk = await readChunk(item.file, start, end - start);
      const response = await fetchWithRetry(
        this.fetchImpl,
        uploadUrl,
        {
          method: 'PUT',
          headers: {
            'content-type': mimeForPath(item.file),
            'content-length': String(chunk.length),
            'content-range': `bytes ${start}-${end - 1}/${size}`,
          },
          body: chunk,
        },
        { secrets: [...this.secrets, uploadUrl], sleep: this.sleep, timeoutMs: 600_000 },
      );
      if (!response.ok) throw httpError(`TikTok chunk ${index + 1}/${count}`, response.status, await readJson(response), [...this.secrets, uploadUrl]);
      await response.body?.cancel().catch(() => undefined);
    }

    const status = await this.waitForInbox(publishId);
    const caption = tiktokCaption(item);
    return {
      remoteId: publishId,
      status,
      thumbnail: 'none',
      warnings: status === 'processing' ? ['TikTok was still processing the upload; it appears in the inbox once done.'] : [],
      manualSteps: [
        'Open the TikTok app: the inbox notification holds the draft. Add sound and text, set the cover, and post it.',
        `Paste this caption (the inbox path cannot set it):\n${caption}`,
      ],
    };
  }

  /** POST to the Content Posting API; refresh the token once on access_token_invalid. */
  private async api(path: string, body: unknown, retried = false): Promise<Record<string, unknown>> {
    const token = await this.token.get();
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${API}/${path}`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json; charset=UTF-8' },
        body: JSON.stringify(body),
      },
      { secrets: this.secrets, sleep: this.sleep, timeoutMs: 60_000 },
    );
    const json = await readJson(response);
    const error = (json.error ?? {}) as { code?: string; message?: string };
    if (response.ok && (!error.code || error.code === 'ok')) return (json.data ?? {}) as Record<string, unknown>;
    if (!retried && (response.status === 401 || error.code === 'access_token_invalid')) {
      this.token.invalidate();
      return this.api(path, body, true);
    }
    if (error.code === 'spam_risk_too_many_pending_share') {
      throw new PublishError(
        `TikTok allows ${TIKTOK_LIMITS.pendingPer24h} pending inbox uploads per 24 hours. Post or delete the drafts in the app, then publish again.`,
        response.status,
      );
    }
    if (error.code === 'scope_not_authorized') {
      throw new ConfigError('The TikTok token lacks the video.upload scope. Run "npm run cli -- publish-auth tiktok" again.');
    }
    throw httpError(`TikTok ${path}`, response.status, json, this.secrets);
  }

  private async waitForInbox(publishId: string): Promise<'draft' | 'processing'> {
    const deadline = this.now() + this.pollTimeoutMs;
    while (true) {
      const data = await this.api('post/publish/status/fetch/', { publish_id: publishId });
      const status = String(data.status ?? '');
      if (status === 'SEND_TO_USER_INBOX' || status === 'PUBLISH_COMPLETE') return 'draft';
      if (status === 'FAILED') throw new PublishError(`TikTok could not process the upload: ${String(data.fail_reason ?? 'unknown reason')}.`);
      if (this.now() >= deadline) return 'processing';
      await this.sleep(this.pollIntervalMs);
    }
  }
}
