import { extname } from 'node:path';
import { ConfigError } from '@coreslopper/core';
import { delay, IMAGE_EXTENSIONS, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readJson, redactSecrets, markUncertain } from './http.js';
import type { PublishLogger } from './types.js';
import type { SaveSecret, SocialAdapter, SocialAdapterOptions, SocialPostRequest, SocialPostResult } from './social.js';

// Instagram API with Instagram Login (graph.instagram.com), content publishing
// for the user's own professional account (Standard Access, app in
// development mode, the account added as Instagram tester). A post is a
// container created from a public media URL, polled until FINISHED, then
// published with media_publish. Sources, checked 2026-11:
//   https://developers.facebook.com/documentation/instagram-platform/content-publishing.md
//   https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/media.md
//   https://developers.facebook.com/documentation/instagram-platform/instagram-graph-api/reference/ig-user/content_publishing_limit.md
//   https://developers.facebook.com/documentation/instagram-platform/reference/refresh_access_token.md
//   https://developers.facebook.com/documentation/instagram-platform/changelog.md (is_ai_generated, June 2026)

const HOST = 'https://graph.instagram.com';
/**
 * The Graph API version. The reference pages show v25.0 and v26.0 (Sep 2026);
 * v25.0 is used until confirmed otherwise. `INSTAGRAM_API_VERSION` overrides it.
 */
export const INSTAGRAM_API_VERSION = 'v25.0';

/** Content publishing limits of the Instagram API. */
export const INSTAGRAM_LIMITS = {
  /**
   * API-published posts per rolling 24 hours. The docs say 100 in one place and
   * 50 in another; the live `content_publishing_limit` answer is what counts.
   */
  postsPer24h: 50,
  captionChars: 2200,
  hashtags: 30,
  /** A long-lived token lasts 60 days from its last refresh and must be at least 24 hours old to refresh. */
  tokenDays: 60,
  refreshWithinDays: 10,
} as const;

export interface InstagramCredentials {
  accessToken?: string;
  /** The Instagram professional account ID (`user_id` of `/me`). */
  userId?: string;
  /** When the long-lived token expires, ISO 8601. */
  expiresAt?: string;
}

export function resolveInstagramCredentials(env: NodeJS.ProcessEnv = process.env): InstagramCredentials {
  const read = (key: string) => env[key]?.trim() || undefined;
  return {
    accessToken: read('INSTAGRAM_ACCESS_TOKEN'),
    userId: read('INSTAGRAM_USER_ID'),
    expiresAt: read('INSTAGRAM_TOKEN_EXPIRES_AT'),
  };
}

/** Whole days until the token expires; undefined without a known expiry. Negative once expired. */
export function instagramTokenDaysLeft(credentials: Pick<InstagramCredentials, 'expiresAt'>, now: Date = new Date()): number | undefined {
  if (!credentials.expiresAt) return undefined;
  const expires = Date.parse(credentials.expiresAt);
  if (Number.isNaN(expires)) return undefined;
  return Math.floor((expires - now.getTime()) / 86_400_000);
}

function apiBase(env: NodeJS.ProcessEnv = process.env): string {
  return `${HOST}/${env.INSTAGRAM_API_VERSION?.trim() || INSTAGRAM_API_VERSION}`;
}

/** A Graph error as a readable message; an expired or revoked token becomes a ConfigError. */
function graphError(label: string, status: number, body: Record<string, unknown>, secrets: (string | undefined)[]): Error {
  const error = (body.error ?? {}) as { message?: string; code?: number; type?: string; error_subcode?: number };
  if (error.code === 190 || (error.type === 'OAuthException' && status === 401)) {
    return new ConfigError(
      'Instagram rejected the access token (expired after 60 days without a refresh, or revoked). ' +
        'Generate a new token in the Meta app dashboard and run "npm run cli -- publish-auth instagram" again.',
    );
  }
  if (error.message) {
    return new PublishError(redactSecrets(`${label} failed with HTTP ${status}: ${error.message}${error.code ? ` (code ${error.code})` : ''}`, secrets), status, body);
  }
  return httpError(label, status, body, secrets);
}

async function graphGet(
  fetchImpl: FetchLike,
  url: string,
  params: Record<string, string>,
  label: string,
  secrets: (string | undefined)[],
  sleep?: (ms: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const target = new URL(url);
  target.search = new URLSearchParams(params).toString();
  const response = await fetchWithRetry(fetchImpl, target.toString(), { method: 'GET' }, { secrets, sleep, timeoutMs: 30_000 });
  const body = await readJson(response);
  if (!response.ok || body.error) throw graphError(label, response.status, body, secrets);
  return body;
}

/** The account behind a token: its professional account ID and username. Used to validate a pasted token. */
export async function instagramAccount(accessToken: string, fetchImpl: FetchLike = fetch, env: NodeJS.ProcessEnv = process.env): Promise<{ userId: string; username?: string }> {
  const body = await graphGet(fetchImpl, `${apiBase(env)}/me`, { fields: 'user_id,username', access_token: accessToken }, 'Instagram /me', [accessToken]);
  const userId = typeof body.user_id === 'string' || typeof body.user_id === 'number' ? String(body.user_id) : typeof body.id === 'string' ? body.id : undefined;
  if (!userId) throw new PublishError('Instagram returned no account ID for the token.');
  return { userId, ...(typeof body.username === 'string' ? { username: body.username } : {}) };
}

/** Refresh a long-lived token (at least 24 hours old, not expired); the new one lasts 60 days. */
export async function refreshInstagramToken(
  accessToken: string,
  fetchImpl: FetchLike = fetch,
  now: Date = new Date(),
): Promise<{ accessToken: string; expiresAt: string }> {
  const body = await graphGet(
    fetchImpl,
    `${HOST}/refresh_access_token`,
    { grant_type: 'ig_refresh_token', access_token: accessToken },
    'Instagram token refresh',
    [accessToken],
  );
  if (typeof body.access_token !== 'string') throw new PublishError('Instagram returned no access token on refresh.');
  const seconds = Number(body.expires_in ?? INSTAGRAM_LIMITS.tokenDays * 86_400);
  return { accessToken: body.access_token, expiresAt: new Date(now.getTime() + seconds * 1000).toISOString() };
}

export interface InstagramPublisherOptions extends SocialAdapterOptions {
  /** A public URL for a local file; Instagram fetches the media from it. */
  hostMedia?: (path: string) => Promise<string>;
  /** Set the "AI info" label (`is_ai_generated`); default true, since the pipeline's videos are AI-made. */
  aiGenerated?: boolean;
  pollIntervalMs?: number;
  /** How many status checks before the container counts as stuck. */
  pollAttempts?: number;
}

const isImage = (path: string) => IMAGE_EXTENSIONS.has(extname(path).toLowerCase());

/**
 * Publishes Reels, feed posts, and stories to the user's Instagram
 * professional account. Only the autopilot calls it, for an approved release.
 */
export class InstagramPublisher implements SocialAdapter {
  readonly platform = 'instagram' as const;
  readonly mock = false;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: PublishLogger;
  private readonly saveSecret?: SaveSecret;
  private readonly now: () => Date;
  private readonly hostMedia?: (path: string) => Promise<string>;
  private readonly aiGenerated: boolean;
  private readonly pollIntervalMs: number;
  private readonly pollAttempts: number;
  private readonly base: string;
  private readonly secrets: (string | undefined)[];
  private credentials: InstagramCredentials;

  constructor(options: InstagramPublisherOptions = {}) {
    const env = options.env ?? process.env;
    this.credentials = resolveInstagramCredentials(env);
    if (!this.credentials.accessToken) {
      throw new ConfigError('INSTAGRAM_ACCESS_TOKEN is not set. Generate a token in the Meta app dashboard and run "npm run cli -- publish-auth instagram" (docs/publishing.md).');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.log = options.log ?? (() => undefined);
    this.saveSecret = options.saveSecret;
    this.now = options.now ?? (() => new Date());
    this.hostMedia = options.hostMedia;
    this.aiGenerated = options.aiGenerated ?? true;
    this.pollIntervalMs = options.pollIntervalMs ?? 5_000;
    this.pollAttempts = options.pollAttempts ?? 120;
    this.base = apiBase(env);
    this.secrets = [this.credentials.accessToken];
  }

  private get token(): string {
    return this.credentials.accessToken!;
  }

  /** Refresh the token when it expires within ten days (it is then weeks old) or its expiry is unknown. */
  private async ensureFreshToken(warnings: string[]): Promise<void> {
    const daysLeft = instagramTokenDaysLeft(this.credentials, this.now());
    if (daysLeft !== undefined && daysLeft < 0) {
      throw new ConfigError('The Instagram access token has expired. Generate a new one in the Meta app dashboard and run "npm run cli -- publish-auth instagram".');
    }
    if (daysLeft !== undefined && daysLeft > INSTAGRAM_LIMITS.refreshWithinDays) return;
    try {
      const fresh = await refreshInstagramToken(this.token, this.fetchImpl, this.now());
      this.secrets.push(fresh.accessToken);
      this.credentials = { ...this.credentials, ...fresh };
      await this.saveSecret?.('INSTAGRAM_ACCESS_TOKEN', fresh.accessToken);
      await this.saveSecret?.('INSTAGRAM_TOKEN_EXPIRES_AT', fresh.expiresAt);
      this.log('instagram: access token refreshed');
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      // A token younger than 24 hours cannot be refreshed yet; it still works.
      warnings.push(redactSecrets(`Instagram token refresh failed (${(error as Error).message}); the current token is used.`, this.secrets));
    }
  }

  private async userId(): Promise<string> {
    if (!this.credentials.userId) this.credentials.userId = (await instagramAccount(this.token, this.fetchImpl)).userId;
    return this.credentials.userId;
  }

  private get(path: string, params: Record<string, string>, label: string): Promise<Record<string, unknown>> {
    return graphGet(this.fetchImpl, `${this.base}/${path}`, { ...params, access_token: this.token }, label, this.secrets, this.sleep);
  }

  private async postForm(path: string, params: Record<string, string>, label: string, attempts?: number): Promise<Record<string, unknown>> {
    const response = await fetchWithRetry(
      this.fetchImpl,
      `${this.base}/${path}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ ...params, access_token: this.token }).toString(),
      },
      { secrets: this.secrets, sleep: this.sleep, timeoutMs: 60_000, ...(attempts ? { attempts } : {}) },
    );
    const body = await readJson(response);
    if (!response.ok || body.error) throw graphError(label, response.status, body, this.secrets);
    return body;
  }

  /** Fail before creating anything when the rolling 24-hour publishing quota is used up. */
  private async checkQuota(user: string): Promise<void> {
    const body = await this.get(`${user}/content_publishing_limit`, { fields: 'quota_usage,config' }, 'Instagram content_publishing_limit');
    const entry = (Array.isArray(body.data) ? body.data[0] : body) as { quota_usage?: number; config?: { quota_total?: number } } | undefined;
    const used = Number(entry?.quota_usage ?? 0);
    const total = Number(entry?.config?.quota_total ?? INSTAGRAM_LIMITS.postsPer24h);
    if (Number.isFinite(used) && Number.isFinite(total) && used >= total) {
      throw new PublishError(`Instagram's publishing quota is used up: ${used} of ${total} API posts in the last 24 hours. The post waits until the window frees up.`);
    }
  }

  /** Wait until the container is FINISHED; ERROR and EXPIRED fail. */
  private async waitForContainer(id: string, event: string): Promise<void> {
    for (let attempt = 0; attempt < this.pollAttempts; attempt += 1) {
      const body = await this.get(id, { fields: 'status_code,status' }, 'Instagram container status');
      const code = String(body.status_code ?? '');
      if (code === 'FINISHED' || code === 'PUBLISHED') return;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new PublishError(`Instagram could not process the media of ${event}: ${code}${body.status ? ` (${String(body.status)})` : ''}.`);
      }
      await this.sleep(this.pollIntervalMs);
    }
    throw new PublishError(`Instagram was still processing the media of ${event} after ${Math.round((this.pollAttempts * this.pollIntervalMs) / 1000)} s; nothing was published.`);
  }

  async post(request: SocialPostRequest): Promise<SocialPostResult> {
    const warnings: string[] = [];
    const manualSteps: string[] = [];
    const placement = request.placement ?? (request.media?.kind === 'video' ? 'reel' : 'feed');
    if (!request.media) throw new PublishError(`Instagram needs an image or a video for ${request.event}; text-only posts do not exist.`);
    if (!this.hostMedia) {
      throw new ConfigError('Instagram fetches media from a public URL, and no media host is configured (FAL_KEY for fal storage, docs/publishing.md).');
    }
    const media = request.media;
    const image = media.kind === 'image' || isImage(media.path);
    if (placement === 'reel' && image) throw new PublishError(`${request.event}: a Reel needs a video, got ${media.path}.`);
    if (request.text.length > INSTAGRAM_LIMITS.captionChars) {
      throw new PublishError(`${request.event}: the caption has ${request.text.length} characters; Instagram allows ${INSTAGRAM_LIMITS.captionChars}.`);
    }

    await this.ensureFreshToken(warnings);
    const user = await this.userId();
    await this.checkQuota(user);

    const url = await this.hostMedia(media.path);
    const params: Record<string, string> = {};
    if (placement === 'story') {
      params.media_type = 'STORIES';
      params[image ? 'image_url' : 'video_url'] = url;
      if (request.text.trim()) warnings.push('Instagram stories carry no caption; the text was not posted.');
      // Stories posted through the API carry no stickers (no link sticker), and stickers cannot be added later.
    } else if (image) {
      params.image_url = url;
      params.caption = request.text;
    } else {
      params.media_type = 'REELS';
      params.video_url = url;
      params.caption = request.text;
      params.share_to_feed = 'true';
      if (request.coverOffsetMs !== undefined) params.thumb_offset = String(Math.max(0, Math.round(request.coverOffsetMs)));
    }
    if (this.aiGenerated) params.is_ai_generated = 'true';

    this.log(`instagram: creating the ${placement} container for ${request.event}`);
    const container = await this.postForm(`${user}/media`, params, 'Instagram media container');
    const containerId = typeof container.id === 'string' ? container.id : undefined;
    if (!containerId) throw new PublishError('Instagram created no media container.');
    await this.waitForContainer(containerId, request.event);

    // Publishing is not retried: a lost answer must not post twice. The container's status tells whether it went out.
    let mediaId: string | undefined;
    try {
      const published = await this.postForm(`${user}/media_publish`, { creation_id: containerId }, 'Instagram media_publish', 1);
      mediaId = typeof published.id === 'string' ? published.id : undefined;
    } catch (error) {
      if (error instanceof ConfigError) throw error;
      const status = await this.get(containerId, { fields: 'status_code' }, 'Instagram container status').catch(() => undefined);
      // Without a readable container status nobody knows whether it went out.
      if (status === undefined) throw markUncertain(error);
      if (status.status_code !== 'PUBLISHED') throw error;
      warnings.push('Instagram published the post but its answer was lost; the newest post of the account is reported.');
      const latest = await this.get(`${user}/media`, { fields: 'id,permalink', limit: '1' }, 'Instagram media list');
      const first = Array.isArray(latest.data) ? (latest.data[0] as { id?: string; permalink?: string } | undefined) : undefined;
      if (!first?.id) throw markUncertain(new PublishError(`Instagram published ${request.event}, but the post could not be found; check the profile.`));
      return { remoteId: first.id, url: first.permalink, warnings, manualSteps };
    }
    if (!mediaId) throw markUncertain(new PublishError(`Instagram published ${request.event} but returned no media ID; check the profile.`));

    const details = await this.get(mediaId, { fields: 'permalink' }, 'Instagram media').catch((error: Error) => {
      warnings.push(redactSecrets(`Could not read the post's permalink: ${error.message}`, this.secrets));
      return {} as Record<string, unknown>;
    });
    const permalink = typeof details.permalink === 'string' ? details.permalink : undefined;
    if (!this.aiGenerated) manualSteps.push('The post carries no "AI info" label; add it in the app if the content is AI-made.');
    return { remoteId: mediaId, ...(permalink ? { url: permalink } : {}), warnings, manualSteps };
  }
}
