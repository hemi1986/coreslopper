import { stat } from 'node:fs/promises';
import { ConfigError } from '@coreslopper/core';
import { delay, mimeForPath, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readChunk, readJson, redactSecrets } from './http.js';
import { RefreshingToken } from './oauth.js';
import type { PublishAdapter, PublishItem, PublishLogger, PublishRequest, PublishResult } from './types.js';

export const TIKTOK_SCOPE = 'video.upload';
/** Direct Post: publishes the video with its caption. Needs an audited app for public posts. */
export const TIKTOK_DIRECT_SCOPE = 'video.publish';
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

/** `TIKTOK_DIRECT_POST=1`: the app passed TikTok's audit, so the autopilot posts directly instead of sending drafts. */
export function tiktokDirectPost(env: NodeJS.ProcessEnv = process.env): boolean {
  return /^(1|true|yes)$/i.test(env.TIKTOK_DIRECT_POST?.trim() ?? '');
}

/** The scopes to request: `video.upload` for drafts, plus `video.publish` with `TIKTOK_DIRECT_POST=1`. */
export function tiktokScopes(env: NodeJS.ProcessEnv = process.env): string[] {
  return tiktokDirectPost(env) ? [TIKTOK_SCOPE, TIKTOK_DIRECT_SCOPE] : [TIKTOK_SCOPE];
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
export function tiktokAuthUrl(options: { clientKey: string; redirectUri: string; state: string; challenge: string; scopes?: string[] }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_key: options.clientKey,
    scope: (options.scopes ?? [TIKTOK_SCOPE]).join(','),
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
  /**
   * `inbox` (default): a draft in the user's TikTok inbox (`video.upload`).
   * `direct`: Direct Post with caption and AI label (`video.publish`); public
   * only for an app that passed TikTok's audit, private otherwise.
   */
  mode?: 'inbox' | 'direct';
}

/** What `creator_info/query` says the account allows. */
interface CreatorInfo {
  username?: string;
  privacyOptions: string[];
  commentDisabled: boolean;
  duetDisabled: boolean;
  stitchDisabled: boolean;
  maxSeconds?: number;
}

/**
 * Content Posting API. Inbox path (`video.upload`, default): init a
 * FILE_UPLOAD, send the chunks, poll the status; the video lands in the
 * user's TikTok inbox as a draft, and the user posts it there. Direct path
 * (`video.publish`, `mode: 'direct'`): the same upload as a post with its
 * caption and AI label, for an app that passed TikTok's audit.
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
  readonly mode: 'inbox' | 'direct';

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
    this.mode = options.mode ?? 'inbox';
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
    return this.mode === 'direct' ? this.directPost(request.item) : this.inboxUpload(request.item);
  }

  private async inboxUpload(item: PublishItem): Promise<PublishResult> {
    const size = (await stat(item.file)).size;
    const { chunkSize, count } = tiktokChunks(size);
    this.log(`tiktok: uploading ${item.name} (${(size / 1e6).toFixed(1)} MB, ${count} chunk${count === 1 ? '' : 's'})`);

    const init = await this.api('post/publish/inbox/video/init/', {
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    });
    const publishId = await this.uploadTo(init, item.file, size);

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

  /**
   * Direct Post (`video.publish`): read what the account allows, init the post
   * with caption, privacy, and the AI-generated label, send the chunks, and
   * wait for PUBLISH_COMPLETE. TikTok's content sharing guidelines want the
   * creator info queried before every post.
   */
  private async directPost(item: PublishItem): Promise<PublishResult> {
    const creator = await this.creatorInfo();
    if (!creator.privacyOptions.includes('PUBLIC_TO_EVERYONE')) {
      throw new PublishError(
        `TikTok does not offer public posting for this account (options: ${creator.privacyOptions.join(', ') || 'none'}). ` +
          'An app that has not passed TikTok\'s audit may post only privately: unset TIKTOK_DIRECT_POST to send drafts instead (docs/publishing.md).',
      );
    }
    const size = (await stat(item.file)).size;
    const { chunkSize, count } = tiktokChunks(size);
    this.log(`tiktok: posting ${item.name} (${(size / 1e6).toFixed(1)} MB, ${count} chunk${count === 1 ? '' : 's'})`);
    const caption = tiktokCaption(item);
    const init = await this.api('post/publish/video/init/', {
      post_info: {
        title: caption,
        privacy_level: 'PUBLIC_TO_EVERYONE',
        disable_comment: creator.commentDisabled,
        disable_duet: creator.duetDisabled,
        disable_stitch: creator.stitchDisabled,
        // The AI-generated content label (Content Posting API, post_info.is_aigc).
        is_aigc: item.syntheticMedia,
        brand_content_toggle: false,
        brand_organic_toggle: false,
      },
      source_info: { source: 'FILE_UPLOAD', video_size: size, chunk_size: chunkSize, total_chunk_count: count },
    });
    const publishId = await this.uploadTo(init, item.file, size);
    const { status, postId } = await this.waitForPost(publishId);
    const profile = creator.username ? `https://www.tiktok.com/@${creator.username}` : undefined;
    const url = postId && creator.username ? `${profile}/video/${postId}` : profile;
    return {
      remoteId: postId ?? publishId,
      ...(url ? { url } : {}),
      status,
      thumbnail: 'none',
      warnings: status === 'processing' ? ['TikTok was still processing the post; it goes live once done.'] : [],
      manualSteps: [],
    };
  }

  private async creatorInfo(): Promise<CreatorInfo> {
    const data = await this.api('post/publish/creator_info/query/', {});
    const options = Array.isArray(data.privacy_level_options) ? data.privacy_level_options.map(String) : [];
    return {
      ...(typeof data.creator_username === 'string' ? { username: data.creator_username } : {}),
      privacyOptions: options,
      commentDisabled: data.comment_disabled === true,
      duetDisabled: data.duet_disabled === true,
      stitchDisabled: data.stitch_disabled === true,
      ...(typeof data.max_video_post_duration_sec === 'number' ? { maxSeconds: data.max_video_post_duration_sec } : {}),
    };
  }

  /** Send the file in the chunks the init announced; returns the publish ID. */
  private async uploadTo(init: Record<string, unknown>, file: string, size: number): Promise<string> {
    const publishId = typeof init.publish_id === 'string' ? init.publish_id : undefined;
    const uploadUrl = typeof init.upload_url === 'string' ? init.upload_url : undefined;
    if (!publishId || !uploadUrl) throw new PublishError('TikTok returned no publish_id or upload_url.');
    const { chunkSize, count } = tiktokChunks(size);
    for (let index = 0; index < count; index += 1) {
      const start = index * chunkSize;
      const end = index === count - 1 ? size : start + chunkSize;
      const chunk = await readChunk(file, start, end - start);
      const response = await fetchWithRetry(
        this.fetchImpl,
        uploadUrl,
        {
          method: 'PUT',
          headers: {
            'content-type': mimeForPath(file),
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
    return publishId;
  }

  /** POST to the Content Posting API; refresh the token once on access_token_invalid. */
  private async api(path: string, body: unknown): Promise<Record<string, unknown>> {
    return (await this.apiRaw(path, body)).data;
  }

  /** `api` with the raw response text, for int64 IDs that JSON.parse would round. */
  private async apiRaw(path: string, body: unknown, retried = false): Promise<{ data: Record<string, unknown>; raw: string }> {
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
    const raw = await response.text();
    let json: Record<string, unknown> = {};
    try {
      const parsed = raw ? (JSON.parse(raw) as unknown) : {};
      if (parsed && typeof parsed === 'object') json = parsed as Record<string, unknown>;
    } catch {
      json = { raw: raw.slice(0, 500) };
    }
    const error = (json.error ?? {}) as { code?: string; message?: string };
    if (response.ok && (!error.code || error.code === 'ok')) return { data: (json.data ?? {}) as Record<string, unknown>, raw };
    if (!retried && (response.status === 401 || error.code === 'access_token_invalid')) {
      this.token.invalidate();
      return this.apiRaw(path, body, true);
    }
    if (error.code === 'spam_risk_too_many_pending_share') {
      throw new PublishError(
        `TikTok allows ${TIKTOK_LIMITS.pendingPer24h} pending inbox uploads per 24 hours. Post or delete the drafts in the app, then publish again.`,
        response.status,
      );
    }
    if (error.code === 'scope_not_authorized') {
      const scope = path.startsWith('post/publish/inbox') ? TIKTOK_SCOPE : TIKTOK_DIRECT_SCOPE;
      throw new ConfigError(
        `The TikTok token lacks the ${scope} scope. ${scope === TIKTOK_DIRECT_SCOPE ? 'Set TIKTOK_DIRECT_POST=1 in .env, then run' : 'Run'} "npm run cli -- publish-auth tiktok" again.`,
      );
    }
    if (error.code === 'unaudited_client_can_only_post_to_private_accounts' || error.code === 'privacy_level_option_mismatch') {
      throw new PublishError(
        `TikTok refused the public post (${error.code}): the app has not passed TikTok's audit. Unset TIKTOK_DIRECT_POST to send drafts instead.`,
        response.status,
      );
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
  /** Poll a Direct Post until it is live; returns the post ID once TikTok publishes one. */
  private async waitForPost(publishId: string): Promise<{ status: 'uploaded' | 'processing'; postId?: string }> {
    const deadline = this.now() + this.pollTimeoutMs;
    while (true) {
      const { data, raw } = await this.apiRaw('post/publish/status/fetch/', { publish_id: publishId });
      const status = String(data.status ?? '');
      if (status === 'PUBLISH_COMPLETE') {
        // TikTok spells the field "publicaly_available_post_id" and sends int64 numbers that
        // JSON.parse rounds, so the ID is read from the raw text; the correct spelling counts too.
        const postId = /"publica?ly_available_post_id"\s*:\s*\[\s*"?(\d+)/.exec(raw)?.[1];
        return { status: 'uploaded', ...(postId ? { postId } : {}) };
      }
      if (status === 'FAILED') throw new PublishError(`TikTok could not publish the post: ${String(data.fail_reason ?? 'unknown reason')}.`);
      if (this.now() >= deadline) return { status: 'processing' };
      await this.sleep(this.pollIntervalMs);
    }
  }
}

