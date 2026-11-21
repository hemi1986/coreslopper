import { stat } from 'node:fs/promises';
import { ConfigError } from '@coreslopper/core';
import { delay, mimeForPath, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readChunk, readJson, redactSecrets, markUncertain } from './http.js';
import type { PublishLogger } from './types.js';
import type { SaveSecret, SocialAdapter, SocialAdapterOptions, SocialPostRequest, SocialPostResult } from './social.js';

// LinkedIn: a post on the member's own profile through the Posts API, with a
// video (Videos API) or an image (Images API). The app needs the self-serve
// products "Sign In with LinkedIn using OpenID Connect" (openid, profile) and
// "Share on LinkedIn" (w_member_social). Docs:
//   https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
//   https://learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api
//   https://learn.microsoft.com/linkedin/marketing/community-management/shares/images-api
//   https://learn.microsoft.com/linkedin/marketing/community-management/shares/little-text-format
//   https://learn.microsoft.com/linkedin/consumer/integrations/self-serve/sign-in-with-linkedin-v2
//   https://learn.microsoft.com/linkedin/shared/authentication/programmatic-refresh-tokens

export const LINKEDIN_SCOPES = ['openid', 'profile', 'w_member_social'] as const;
export const LINKEDIN_DEFAULT_REDIRECT_URI = 'http://localhost:8766/callback';
/**
 * The `LinkedIn-Version` header (YYYYMM). LinkedIn supports a version for
 * about a year; `LINKEDIN_API_VERSION` overrides it when this one is sunset.
 */
export const LINKEDIN_API_VERSION = '202610';

const AUTH_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const USERINFO_URL = 'https://api.linkedin.com/v2/userinfo';
const REST = 'https://api.linkedin.com/rest';

/** Video limits of the Videos API for a member post. */
export const LINKEDIN_LIMITS = { maxVideoBytes: 5 * 1024 ** 3, minVideoSeconds: 3, maxVideoSeconds: 30 * 60, commentaryChars: 3000 } as const;

export interface LinkedInCredentials {
  clientId?: string;
  clientSecret?: string;
  accessToken?: string;
  /** ISO date-time when the access token expires. */
  expiresAt?: string;
  /** `urn:li:person:<sub>`, the author of the posts. */
  memberUrn?: string;
  /** Only partners approved for programmatic refresh tokens get one. */
  refreshToken?: string;
}

export function resolveLinkedInCredentials(env: NodeJS.ProcessEnv = process.env): LinkedInCredentials {
  const read = (key: string) => env[key]?.trim() || undefined;
  return {
    clientId: read('LINKEDIN_CLIENT_ID'),
    clientSecret: read('LINKEDIN_CLIENT_SECRET'),
    accessToken: read('LINKEDIN_ACCESS_TOKEN'),
    expiresAt: read('LINKEDIN_TOKEN_EXPIRES_AT'),
    memberUrn: read('LINKEDIN_MEMBER_URN'),
    refreshToken: read('LINKEDIN_REFRESH_TOKEN'),
  };
}

/** The redirect URL registered in the app's Auth tab; `LINKEDIN_REDIRECT_URI` overrides the default. */
export function linkedinRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return env.LINKEDIN_REDIRECT_URI?.trim() || LINKEDIN_DEFAULT_REDIRECT_URI;
}

/** The consent URL of the authorization code flow (LinkedIn's member flow takes no PKCE). */
export function linkedinAuthUrl(options: { clientId: string; redirectUri: string; state: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    response_type: 'code',
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    state: options.state,
    scope: LINKEDIN_SCOPES.join(' '),
  }).toString();
  return url.toString();
}

/** Whole days until the access token expires (negative once expired); undefined without a recorded expiry. */
export function linkedinTokenDaysLeft(credentials: Pick<LinkedInCredentials, 'expiresAt'>, now: Date = new Date()): number | undefined {
  if (!credentials.expiresAt) return undefined;
  const expires = Date.parse(credentials.expiresAt);
  if (Number.isNaN(expires)) return undefined;
  return Math.floor((expires - now.getTime()) / 86_400_000);
}

interface TokenResult {
  accessToken: string;
  expiresAt: string;
  refreshToken?: string;
}

async function tokenRequest(params: Record<string, string>, fetchImpl: FetchLike, secrets: (string | undefined)[], now: Date, sleep?: (ms: number) => Promise<void>): Promise<TokenResult> {
  const response = await fetchWithRetry(
    fetchImpl,
    TOKEN_URL,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() },
    { secrets, sleep, timeoutMs: 30_000 },
  );
  const body = await readJson(response);
  if (!response.ok) {
    if (body.error === 'invalid_client') {
      throw new ConfigError('LinkedIn rejected LINKEDIN_CLIENT_ID or LINKEDIN_CLIENT_SECRET. Check them in .env (docs/publishing.md, "LinkedIn").');
    }
    if (body.error === 'invalid_grant' || body.error === 'invalid_request') {
      throw new ConfigError(`LinkedIn rejected the authorization (${String(body.error)}). Run "npm run cli -- publish-auth linkedin" again.`);
    }
    throw httpError('LinkedIn token request', response.status, body, secrets);
  }
  if (typeof body.access_token !== 'string') throw new PublishError('LinkedIn returned no access token.');
  // Member tokens last 60 days (expires_in 5184000); programmatic refresh tokens are for approved partners only.
  const seconds = Number(body.expires_in ?? 60 * 86_400);
  return {
    accessToken: body.access_token,
    expiresAt: new Date(now.getTime() + seconds * 1000).toISOString(),
    ...(typeof body.refresh_token === 'string' ? { refreshToken: body.refresh_token } : {}),
  };
}

/** Exchange the authorization code for an access token (and a refresh token, where LinkedIn grants one). */
export async function exchangeLinkedInCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
  now?: Date;
}): Promise<TokenResult> {
  return tokenRequest(
    {
      grant_type: 'authorization_code',
      code: options.code,
      redirect_uri: options.redirectUri,
      client_id: options.clientId,
      client_secret: options.clientSecret,
    },
    options.fetchImpl ?? fetch,
    [options.clientSecret, options.code],
    options.now ?? new Date(),
  );
}

/** The member behind a token, from the OpenID Connect userinfo endpoint: `sub` is the person ID. */
export async function linkedinMember(accessToken: string, fetchImpl: FetchLike = fetch): Promise<{ memberUrn: string; name?: string }> {
  const response = await fetchWithRetry(fetchImpl, USERINFO_URL, { headers: { authorization: `Bearer ${accessToken}` } }, { secrets: [accessToken], timeoutMs: 30_000 });
  const body = await readJson(response);
  if (!response.ok) throw httpError('LinkedIn userinfo', response.status, body, [accessToken]);
  if (typeof body.sub !== 'string' || !body.sub) throw new PublishError('LinkedIn userinfo returned no member ID (sub). Is the OpenID Connect product added to the app?');
  return { memberUrn: `urn:li:person:${body.sub}`, ...(typeof body.name === 'string' ? { name: body.name } : {}) };
}

/** Characters the little text format reserves; each one is escaped with a backslash. */
const LITTLE_RESERVED = /[|{}@[\]()<>#\\*_~]/g;

/**
 * Commentary in LinkedIn's little text format: every reserved character is
 * escaped (an unescaped one silently cuts the post off), and each `#tag`
 * becomes the hashtag template `{hashtag|\#|tag}` so it stays a hashtag.
 */
export function linkedinCommentary(text: string): string {
  const parts: string[] = [];
  const hashtag = /(^|[^\p{L}\p{N}_])#([\p{L}\p{N}_]+)/gu;
  let last = 0;
  for (const match of text.matchAll(hashtag)) {
    const start = match.index + match[1]!.length;
    parts.push(text.slice(last, start).replace(LITTLE_RESERVED, (char) => `\\${char}`));
    parts.push(`{hashtag|\\#|${match[2]!.replace(LITTLE_RESERVED, (char) => `\\${char}`)}}`);
    last = start + 1 + match[2]!.length;
  }
  parts.push(text.slice(last).replace(LITTLE_RESERVED, (char) => `\\${char}`));
  return parts.join('');
}

export interface LinkedInPublisherOptions extends SocialAdapterOptions {
  /** How long to wait for LinkedIn to process a video, in ms (default 10 minutes). */
  processingTimeoutMs?: number;
  /** Poll interval while a video processes, in ms. */
  pollMs?: number;
}

/**
 * Posts on the member's profile: the commentary, optionally with a video or
 * an image uploaded first. Visibility PUBLIC, main feed.
 */
export class LinkedInPublisher implements SocialAdapter {
  readonly platform = 'linkedin' as const;
  readonly mock = false;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly log: PublishLogger;
  private readonly saveSecret?: SaveSecret;
  private readonly now: () => Date;
  private readonly version: string;
  private readonly processingTimeoutMs: number;
  private readonly pollMs: number;
  private credentials: LinkedInCredentials;
  private readonly secrets: (string | undefined)[];

  constructor(options: LinkedInPublisherOptions = {}) {
    const env = options.env ?? process.env;
    this.credentials = resolveLinkedInCredentials(env);
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.log = options.log ?? (() => undefined);
    this.saveSecret = options.saveSecret;
    this.now = options.now ?? (() => new Date());
    this.version = env.LINKEDIN_API_VERSION?.trim() || LINKEDIN_API_VERSION;
    this.processingTimeoutMs = options.processingTimeoutMs ?? 600_000;
    this.pollMs = options.pollMs ?? 5_000;
    this.secrets = [this.credentials.clientSecret, this.credentials.accessToken, this.credentials.refreshToken];
    if (!this.credentials.accessToken) {
      throw new ConfigError('LINKEDIN_ACCESS_TOKEN is not set. Add LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET to .env and run "npm run cli -- publish-auth linkedin".');
    }
  }

  async post(request: SocialPostRequest): Promise<SocialPostResult> {
    const token = await this.token();
    const author = await this.author(token);
    const warnings: string[] = [];
    if ([...request.text].length > LINKEDIN_LIMITS.commentaryChars) {
      throw new PublishError(`${request.event}: the LinkedIn post has ${[...request.text].length} characters, limit ${LINKEDIN_LIMITS.commentaryChars}.`);
    }
    let media: string | undefined;
    if (request.media?.kind === 'video') media = await this.uploadVideo(token, author, request.media.path);
    else if (request.media?.kind === 'image') media = await this.uploadImage(token, author, request.media.path);

    const body = {
      author,
      commentary: linkedinCommentary(request.text),
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      ...(media ? { content: { media: { id: media } } } : {}),
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    };
    this.log(`linkedin: posting ${request.event}`);
    const response = await this.rest(token, 'posts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }, 60_000, 1).catch((error: unknown) => {
      throw markUncertain(error);
    });
    if (response.status !== 201 && !response.ok) {
      const error = httpError('LinkedIn posts', response.status, await readJson(response), this.secrets);
      throw response.status >= 500 ? markUncertain(error) : error;
    }
    const urn = response.headers.get('x-restli-id') ?? response.headers.get('x-linkedin-id');
    await response.body?.cancel().catch(() => undefined);
    if (!urn) throw new PublishError(`LinkedIn accepted ${request.event} but returned no post ID.`);
    return { remoteId: urn, url: `https://www.linkedin.com/feed/update/${urn}/`, warnings, manualSteps: [] };
  }

  /** The access token, refreshed when it has expired and a refresh token exists. */
  private async token(): Promise<string> {
    const { accessToken, refreshToken, clientId, clientSecret } = this.credentials;
    const days = linkedinTokenDaysLeft(this.credentials, this.now());
    const expired = days !== undefined && Date.parse(this.credentials.expiresAt!) <= this.now().getTime();
    if (!expired) return accessToken!;
    if (!refreshToken || !clientId || !clientSecret) {
      throw new ConfigError(
        `The LinkedIn access token expired on ${this.credentials.expiresAt!.slice(0, 10)} (member tokens last 60 days and self-serve apps get no refresh token). Run "npm run cli -- publish-auth linkedin" again.`,
      );
    }
    const fresh = await tokenRequest(
      { grant_type: 'refresh_token', refresh_token: refreshToken, client_id: clientId, client_secret: clientSecret },
      this.fetchImpl,
      this.secrets,
      this.now(),
      this.sleep,
    );
    this.secrets.push(fresh.accessToken, fresh.refreshToken);
    this.credentials = { ...this.credentials, accessToken: fresh.accessToken, expiresAt: fresh.expiresAt, refreshToken: fresh.refreshToken ?? refreshToken };
    await this.saveSecret?.('LINKEDIN_ACCESS_TOKEN', fresh.accessToken);
    await this.saveSecret?.('LINKEDIN_TOKEN_EXPIRES_AT', fresh.expiresAt);
    if (fresh.refreshToken) await this.saveSecret?.('LINKEDIN_REFRESH_TOKEN', fresh.refreshToken);
    return fresh.accessToken;
  }

  /** The member URN: from `.env`, else looked up once and stored. */
  private async author(token: string): Promise<string> {
    if (this.credentials.memberUrn) return this.credentials.memberUrn;
    const { memberUrn } = await linkedinMember(token, this.fetchImpl);
    this.credentials.memberUrn = memberUrn;
    await this.saveSecret?.('LINKEDIN_MEMBER_URN', memberUrn);
    return memberUrn;
  }

  /** A REST call; `attempts: 1` for the post itself, so a server error never posts twice. */
  private rest(token: string, path: string, init: RequestInit, timeoutMs = 60_000, attempts?: number): Promise<Response> {
    return fetchWithRetry(
      this.fetchImpl,
      `${REST}/${path}`,
      {
        ...init,
        headers: {
          ...(init.headers as Record<string, string>),
          authorization: `Bearer ${token}`,
          'LinkedIn-Version': this.version,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      },
      { secrets: this.secrets, sleep: this.sleep, timeoutMs, ...(attempts ? { attempts } : {}) },
    );
  }

  /** Send bytes to a signed upload URL; the bearer token only goes to LinkedIn's own hosts. */
  private upload(url: string, token: string, body: Buffer<ArrayBuffer>, type: string): Promise<Response> {
    const host = new URL(url).hostname;
    const own = host === 'linkedin.com' || host.endsWith('.linkedin.com');
    return fetchWithRetry(
      this.fetchImpl,
      url,
      { method: 'PUT', headers: { 'content-type': type, ...(own ? { authorization: `Bearer ${token}` } : {}) }, body },
      { secrets: this.secrets, sleep: this.sleep, timeoutMs: 600_000 },
    );
  }

  /** Videos API: initializeUpload, PUT each part in order collecting its ETag, finalizeUpload, wait for AVAILABLE. */
  private async uploadVideo(token: string, owner: string, path: string): Promise<string> {
    const size = (await stat(path)).size;
    if (size > LINKEDIN_LIMITS.maxVideoBytes) throw new PublishError(`The LinkedIn video ${path} has ${size} bytes, limit 5 GB.`);
    this.log(`linkedin: uploading video (${(size / 1e6).toFixed(1)} MB)`);
    const init = await this.rest(token, 'videos?action=initializeUpload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initializeUploadRequest: { owner, fileSizeBytes: size, uploadCaptions: false, uploadThumbnail: false } }),
    });
    const initBody = await readJson(init);
    if (!init.ok) throw httpError('LinkedIn videos.initializeUpload', init.status, initBody, this.secrets);
    const value = (initBody.value ?? {}) as Record<string, unknown>;
    const video = typeof value.video === 'string' ? value.video : undefined;
    const instructions = Array.isArray(value.uploadInstructions) ? (value.uploadInstructions as Record<string, unknown>[]) : [];
    if (!video || instructions.length === 0) throw new PublishError('LinkedIn returned no video URN or upload instructions.');
    const parts = instructions
      .map((part) => ({ url: String(part.uploadUrl ?? ''), first: Number(part.firstByte), last: Number(part.lastByte) }))
      .sort((a, b) => a.first - b.first);
    const etags: string[] = [];
    // Parts go up in order: LinkedIn assembles them in the order of the ETags in finalizeUpload.
    for (const part of parts) {
      if (!part.url || !Number.isFinite(part.first) || !Number.isFinite(part.last)) throw new PublishError('LinkedIn returned an invalid upload instruction.');
      const chunk = await readChunk(path, part.first, part.last - part.first + 1);
      const response = await this.upload(part.url, token, chunk, 'application/octet-stream');
      if (!response.ok) throw httpError('LinkedIn video part upload', response.status, await readJson(response), this.secrets);
      const etag = response.headers.get('etag');
      await response.body?.cancel().catch(() => undefined);
      if (!etag) throw new PublishError('LinkedIn returned no ETag for an uploaded video part.');
      etags.push(etag);
    }
    const finalize = await this.rest(token, 'videos?action=finalizeUpload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ finalizeUploadRequest: { video, uploadToken: typeof value.uploadToken === 'string' ? value.uploadToken : '', uploadedPartIds: etags } }),
    });
    if (!finalize.ok) throw httpError('LinkedIn videos.finalizeUpload', finalize.status, await readJson(finalize), this.secrets);
    await finalize.body?.cancel().catch(() => undefined);
    await this.waitForVideo(token, video);
    return video;
  }

  private async waitForVideo(token: string, video: string): Promise<void> {
    const deadline = this.now().getTime() + this.processingTimeoutMs;
    while (true) {
      const response = await this.rest(token, `videos/${encodeURIComponent(video)}`, { method: 'GET' });
      const body = await readJson(response);
      if (!response.ok) throw httpError('LinkedIn videos.get', response.status, body, this.secrets);
      const status = String(body.status ?? '');
      if (status === 'AVAILABLE') return;
      if (status === 'PROCESSING_FAILED') {
        throw new PublishError(`LinkedIn could not process the video: ${String(body.processingFailureReason ?? 'no reason given')}.`);
      }
      if (this.now().getTime() >= deadline) throw new PublishError(`LinkedIn was still processing the video (${status || 'unknown'}) after ${Math.round(this.processingTimeoutMs / 60_000)} minutes.`);
      await this.sleep(this.pollMs);
    }
  }

  /** Images API: initializeUpload, then PUT the file to the returned URL. */
  private async uploadImage(token: string, owner: string, path: string): Promise<string> {
    const init = await this.rest(token, 'images?action=initializeUpload', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ initializeUploadRequest: { owner } }),
    });
    const body = await readJson(init);
    if (!init.ok) throw httpError('LinkedIn images.initializeUpload', init.status, body, this.secrets);
    const value = (body.value ?? {}) as Record<string, unknown>;
    const image = typeof value.image === 'string' ? value.image : undefined;
    const uploadUrl = typeof value.uploadUrl === 'string' ? value.uploadUrl : undefined;
    if (!image || !uploadUrl) throw new PublishError('LinkedIn returned no image URN or upload URL.');
    const data = await readChunk(path, 0, (await stat(path)).size);
    const response = await this.upload(uploadUrl, token, data, mimeForPath(path));
    if (!response.ok) throw httpError('LinkedIn image upload', response.status, await readJson(response), this.secrets);
    await response.body?.cancel().catch(() => undefined);
    return image;
  }
}

/** A message with every LinkedIn secret of the environment masked. */
export function redactLinkedIn(message: string, env: NodeJS.ProcessEnv = process.env): string {
  const credentials = resolveLinkedInCredentials(env);
  return redactSecrets(message, [credentials.clientSecret, credentials.accessToken, credentials.refreshToken]);
}
