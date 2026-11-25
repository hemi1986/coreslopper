import { stat } from 'node:fs/promises';
import { ConfigError } from '@coreslopper/core';
import { delay, mimeForPath, type FetchLike } from '../http.js';
import { fetchWithRetry, httpError, PublishError, readChunk, readJson, redactSecrets } from './http.js';
import { markFailure } from './failure.js';
import { RefreshingToken } from './oauth.js';
import type { PublishAdapter, PublishLogger, PublishRequest, PublishResult } from './types.js';

export const YOUTUBE_SCOPE = 'https://www.googleapis.com/auth/youtube.upload';
/** `youtube.force-ssl` lets the autopilot read a video's status, edit its description, and post a comment. */
export const YOUTUBE_FORCE_SSL_SCOPE = 'https://www.googleapis.com/auth/youtube.force-ssl';
export const YOUTUBE_SCOPES = [YOUTUBE_SCOPE, YOUTUBE_FORCE_SSL_SCOPE] as const;
const AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const UPLOAD_URL = 'https://www.googleapis.com/upload/youtube/v3/videos';
const THUMBNAIL_URL = 'https://www.googleapis.com/upload/youtube/v3/thumbnails/set';
const API_URL = 'https://www.googleapis.com/youtube/v3';

/**
 * YouTube Data API quota: the default daily allowance and the cost of the calls
 * `publish` and the autopilot make (developers.google.com/youtube/v3/determine_quota_cost:
 * videos.list 1, videos.update 50, commentThreads.insert 50).
 */
export const YOUTUBE_QUOTA = { dailyUnits: 10_000, insert: 1_600, thumbnail: 50, list: 1, update: 50, comment: 50 } as const;

/** YouTube's description limit in bytes. */
export const YOUTUBE_DESCRIPTION_BYTES = 5000;

export interface YouTubeVideoStatus {
  privacyStatus: 'private' | 'unlisted' | 'public' | string;
  /** ISO time of a scheduled publication. */
  publishAt?: string;
  uploadStatus: 'uploaded' | 'processed' | 'failed' | 'rejected' | 'deleted' | string;
}

/** The daily quota, raised by `YOUTUBE_DAILY_QUOTA` after Google granted an extension. */
export function youtubeDailyQuota(env: NodeJS.ProcessEnv = process.env): number {
  const value = Number(env.YOUTUBE_DAILY_QUOTA);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : YOUTUBE_QUOTA.dailyUnits;
}

export interface YouTubeCredentials {
  clientId?: string;
  clientSecret?: string;
  refreshToken?: string;
}

export function resolveYouTubeCredentials(env: NodeJS.ProcessEnv = process.env): YouTubeCredentials {
  const read = (key: string) => env[key]?.trim() || undefined;
  return {
    clientId: read('YOUTUBE_CLIENT_ID'),
    clientSecret: read('YOUTUBE_CLIENT_SECRET'),
    refreshToken: read('YOUTUBE_REFRESH_TOKEN'),
  };
}

/** The consent URL of the installed-app flow with PKCE; `prompt=consent` makes Google return a refresh token. */
export function youtubeAuthUrl(options: { clientId: string; redirectUri: string; state: string; challenge: string }): string {
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_id: options.clientId,
    redirect_uri: options.redirectUri,
    response_type: 'code',
    scope: YOUTUBE_SCOPES.join(' '),
    access_type: 'offline',
    prompt: 'consent',
    state: options.state,
    code_challenge: options.challenge,
    code_challenge_method: 'S256',
  }).toString();
  return url.toString();
}

async function tokenRequest(
  params: Record<string, string>,
  fetchImpl: FetchLike,
  secrets: (string | undefined)[],
  sleep?: (ms: number) => Promise<void>,
): Promise<Record<string, unknown>> {
  const response = await fetchWithRetry(
    fetchImpl,
    TOKEN_URL,
    { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(params).toString() },
    { secrets, sleep, timeoutMs: 30_000 },
  );
  const body = await readJson(response);
  if (response.ok) return body;
  if (body.error === 'invalid_grant') {
    throw new ConfigError(
      'YouTube rejected the refresh token (revoked, or expired after 7 days while the OAuth app is in Testing). ' +
        'Run "npm run cli -- publish-auth youtube" again.',
    );
  }
  if (body.error === 'invalid_client') {
    throw new ConfigError('YouTube rejected YOUTUBE_CLIENT_ID or YOUTUBE_CLIENT_SECRET. Check them in .env (see docs/publishing.md).');
  }
  throw httpError('YouTube token request', response.status, body, secrets);
}

/** Exchange the authorization code for tokens. */
export async function exchangeYouTubeCode(options: {
  clientId: string;
  clientSecret: string;
  code: string;
  verifier: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}): Promise<{ refreshToken: string }> {
  const secrets = [options.clientSecret, options.code, options.verifier];
  const body = await tokenRequest(
    {
      client_id: options.clientId,
      client_secret: options.clientSecret,
      code: options.code,
      code_verifier: options.verifier,
      redirect_uri: options.redirectUri,
      grant_type: 'authorization_code',
    },
    options.fetchImpl ?? fetch,
    secrets,
  );
  if (typeof body.refresh_token !== 'string') {
    throw new PublishError('Google returned no refresh token. Remove coreslopper under myaccount.google.com/permissions and authorize again.');
  }
  return { refreshToken: body.refresh_token };
}

/**
 * Check an OAuth client without a user: a refresh with a dummy token fails
 * with `invalid_grant` for a valid client and `invalid_client` otherwise.
 */
export async function validateYouTubeClient(
  clientId: string,
  clientSecret: string,
  fetchImpl: FetchLike = fetch,
): Promise<{ status: 'valid' | 'invalid' | 'unknown'; message: string }> {
  try {
    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: 'coreslopper-client-check',
        grant_type: 'refresh_token',
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    const body = await readJson(response);
    if (body.error === 'invalid_grant') return { status: 'valid', message: 'client accepted' };
    if (body.error === 'invalid_client' || body.error === 'unauthorized_client') {
      return { status: 'invalid', message: `${String(body.error)} (client ID or secret rejected)` };
    }
    return { status: 'unknown', message: `HTTP ${response.status}` };
  } catch (error) {
    return { status: 'unknown', message: redactSecrets(error instanceof Error ? error.message : String(error), [clientSecret]) };
  }
}

export interface YouTubePublisherOptions extends YouTubeCredentials {
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  /** Upload chunk size; a multiple of 256 KiB. */
  chunkBytes?: number;
  log?: PublishLogger;
}

const CHUNK_UNIT = 256 * 1024;

/**
 * YouTube Data API v3: a resumable `videos.insert` as a private (or
 * scheduled) video, then `thumbnails.set`. Shorts are vertical videos of at
 * most 3 minutes with the same metadata.
 */
export class YouTubePublisher implements PublishAdapter {
  readonly platform = 'youtube' as const;
  readonly mock = false;
  private readonly fetchImpl: FetchLike;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly chunkBytes: number;
  private readonly token: RefreshingToken;
  private readonly secrets: (string | undefined)[];
  private readonly log: PublishLogger;

  constructor(options: YouTubePublisherOptions = {}) {
    const credentials = { ...resolveYouTubeCredentials(), ...stripUndefined(options) };
    const { clientId, clientSecret, refreshToken } = credentials;
    if (!clientId || !clientSecret) {
      throw new ConfigError('YouTube credentials are not set. Add YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET to .env (see docs/publishing.md).');
    }
    if (!refreshToken) {
      throw new ConfigError('YOUTUBE_REFRESH_TOKEN is not set. Run "npm run cli -- publish-auth youtube" once.');
    }
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? delay;
    this.chunkBytes = Math.max(CHUNK_UNIT, Math.round((options.chunkBytes ?? 8 * 1024 * 1024) / CHUNK_UNIT) * CHUNK_UNIT);
    this.log = options.log ?? (() => undefined);
    this.secrets = [clientSecret, refreshToken];
    this.token = new RefreshingToken(async () => {
      const body = await tokenRequest(
        { client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken, grant_type: 'refresh_token' },
        this.fetchImpl,
        this.secrets,
        this.sleep,
      );
      if (typeof body.access_token !== 'string') throw new PublishError('Google returned no access token.');
      this.secrets.push(body.access_token);
      return { accessToken: body.access_token, expiresInSeconds: Number(body.expires_in ?? 3600) };
    });
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { item, schedule } = request;
    const size = (await stat(item.file)).size;
    const hashtags = item.hashtags.join(' ');
    const metadata = {
      snippet: {
        title: item.title,
        description: hashtags ? `${item.description.trimEnd()}\n\n${hashtags}` : item.description,
        tags: item.tags,
        categoryId: item.categoryId,
        defaultLanguage: item.language,
        defaultAudioLanguage: item.language,
      },
      status: {
        privacyStatus: 'private',
        ...(schedule ? { publishAt: new Date(schedule).toISOString() } : {}),
        selfDeclaredMadeForKids: item.madeForKids,
        containsSyntheticMedia: item.syntheticMedia,
      },
    };

    this.log(`youtube: uploading ${item.name} (${(size / 1e6).toFixed(1)} MB)`);
    const session = await this.startSession(metadata, size, mimeForPath(item.file));
    const video = await this.uploadChunks(session, item.file, size);
    const id = typeof video.id === 'string' ? video.id : undefined;
    if (!id) throw markFailure(new PublishError(`YouTube accepted the upload of ${item.name} but returned no video ID; check YouTube Studio.`), { phase: 'publication' });

    const warnings: string[] = [];
    let quotaUnits: number = YOUTUBE_QUOTA.insert;
    let thumbnail: PublishResult['thumbnail'] = 'none';
    if (item.thumbnail) {
      quotaUnits += YOUTUBE_QUOTA.thumbnail;
      thumbnail = await this.setThumbnail(id, item.thumbnail, warnings);
    }
    const url = item.kind === 'short' ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`;
    return {
      remoteId: id,
      url,
      status: schedule ? 'scheduled' : 'uploaded',
      ...(schedule ? { publishAt: metadata.status.publishAt } : {}),
      thumbnail,
      warnings,
      manualSteps: [
        schedule
          ? `Check the schedule in YouTube Studio: https://studio.youtube.com/video/${id}/edit`
          : `Set the visibility in YouTube Studio when you are ready: https://studio.youtube.com/video/${id}/edit`,
      ],
      quotaUnits,
    };
  }

  /** The privacy and upload status of a video (videos.list part=status, 1 unit). */
  async videoStatus(videoId: string): Promise<YouTubeVideoStatus> {
    const video = await this.getVideo(videoId, 'status');
    const status = (video.status ?? {}) as Record<string, unknown>;
    return {
      privacyStatus: String(status.privacyStatus ?? 'private'),
      ...(typeof status.publishAt === 'string' ? { publishAt: status.publishAt } : {}),
      uploadStatus: String(status.uploadStatus ?? 'uploaded'),
    };
  }

  /**
   * Append a block to a video's description (videos.list + videos.update
   * part=snippet, 51 units). The snippet is sent back whole, so title, tags,
   * and category stay. Idempotent: a description that already holds the text
   * is not touched.
   */
  async appendToDescription(videoId: string, text: string): Promise<{ changed: boolean }> {
    const block = text.trim();
    if (!block) return { changed: false };
    const video = await this.getVideo(videoId, 'snippet');
    const snippet = { ...((video.snippet ?? {}) as Record<string, unknown>) };
    const current = typeof snippet.description === 'string' ? snippet.description : '';
    if (current.includes(block)) return { changed: false };
    const description = current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
    const bytes = Buffer.byteLength(description, 'utf8');
    if (bytes > YOUTUBE_DESCRIPTION_BYTES) {
      throw new PublishError(`The description of ${videoId} would have ${bytes} bytes, limit ${YOUTUBE_DESCRIPTION_BYTES}; shorten it in YouTube Studio.`);
    }
    // videos.update rejects read-only snippet fields; send what it accepts.
    const writable = ['title', 'description', 'tags', 'categoryId', 'defaultLanguage'];
    const body = {
      id: videoId,
      snippet: Object.fromEntries(Object.entries({ ...snippet, description }).filter(([key, value]) => writable.includes(key) && value !== undefined)),
    };
    await this.apiJson('PUT', `${API_URL}/videos?part=snippet`, body, 'YouTube videos.update');
    return { changed: true };
  }

  /** Post a top-level comment under a video (commentThreads.insert, 50 units). The API cannot pin it. */
  async postComment(videoId: string, text: string): Promise<{ commentId: string }> {
    try {
      const body = { snippet: { videoId, topLevelComment: { snippet: { textOriginal: text } } } };
      const thread = await this.apiJson('POST', `${API_URL}/commentThreads?part=snippet`, body, 'YouTube commentThreads.insert');
      const id = typeof thread.id === 'string' ? thread.id : undefined;
      if (!id) throw new PublishError('YouTube accepted the comment but returned no ID.');
      return { commentId: id };
    } catch (error) {
      // A lost answer to the POST may have posted the comment.
      throw markFailure(error, { phase: 'publication' });
    }
  }

  private async getVideo(videoId: string, part: 'status' | 'snippet'): Promise<Record<string, unknown>> {
    const body = await this.apiJson('GET', `${API_URL}/videos?part=${part}&id=${encodeURIComponent(videoId)}`, undefined, 'YouTube videos.list');
    const video = Array.isArray(body.items) ? (body.items[0] as Record<string, unknown> | undefined) : undefined;
    if (!video) throw new PublishError(`YouTube has no video ${videoId} on this channel (deleted, or uploaded by another account).`, 404);
    return video;
  }

  /** A Data API call with the access token; 403 insufficientPermissions means the token predates the force-ssl scope. */
  private async apiJson(method: 'GET' | 'POST' | 'PUT', url: string, body: unknown, label: string): Promise<Record<string, unknown>> {
    const response = await this.authorized((token) =>
      fetchWithRetry(
        this.fetchImpl,
        url,
        {
          method,
          headers: { authorization: `Bearer ${token}`, ...(body === undefined ? {} : { 'content-type': 'application/json; charset=UTF-8' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        },
        // A POST is not retried: a comment that reached YouTube before a timeout would appear twice.
        { secrets: this.secrets, sleep: this.sleep, timeoutMs: 60_000, ...(method === 'POST' ? { attempts: 1 } : {}) },
      ),
    );
    const json = await readJson(response);
    if (response.ok) return json;
    const text = JSON.stringify(json);
    if (response.status === 403 && /insufficientPermissions|ACCESS_TOKEN_SCOPE_INSUFFICIENT|insufficient authentication scopes/i.test(text)) {
      throw new ConfigError(
        'The YouTube token lacks the youtube.force-ssl scope the autopilot needs (status, description, comments). ' +
          'Run "npm run cli -- publish-auth youtube" again to grant the new scope.',
      );
    }
    if (response.status === 403 && text.includes('quotaExceeded')) {
      throw new PublishError('YouTube API quota exceeded for today. It resets at midnight Pacific Time.', 403, json);
    }
    throw httpError(label, response.status, json, this.secrets);
  }

  private async authorized(send: (token: string) => Promise<Response>): Promise<Response> {
    let response = await send(await this.token.get());
    if (response.status === 401) {
      this.token.invalidate();
      response = await send(await this.token.get());
    }
    return response;
  }

  private async startSession(metadata: unknown, size: number, type: string): Promise<string> {
    const url = `${UPLOAD_URL}?uploadType=resumable&part=snippet,status`;
    const response = await this.authorized((token) =>
      fetchWithRetry(
        this.fetchImpl,
        url,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-length': String(size),
            'x-upload-content-type': type,
          },
          body: JSON.stringify(metadata),
        },
        { secrets: this.secrets, sleep: this.sleep, timeoutMs: 60_000 },
      ),
    );
    if (!response.ok) {
      const body = await readJson(response);
      if (response.status === 403 && JSON.stringify(body).includes('quotaExceeded')) {
        throw new PublishError('YouTube API quota exceeded for today. It resets at midnight Pacific Time.', 403, body);
      }
      throw httpError('YouTube videos.insert', response.status, body, this.secrets);
    }
    const location = response.headers.get('location');
    if (!location) throw new PublishError('YouTube returned no upload session URL.');
    return location;
  }

  /**
   * Upload in chunks; after a network error or 5xx, ask the session how far it got and resume there. Once the last
   * byte was sent, the video may exist even when no answer arrives, so a later error is uncertain (never twice).
   */
  private async uploadChunks(session: string, file: string, size: number): Promise<Record<string, unknown>> {
    const sent = { last: false };
    try {
      return await this.sendChunks(session, file, size, sent);
    } catch (error) {
      throw markFailure(error, sent.last ? { phase: 'upload', lastByteSent: true } : { phase: 'upload' });
    }
  }

  private async sendChunks(session: string, file: string, size: number, sent: { last: boolean }): Promise<Record<string, unknown>> {
    let offset = 0;
    let failures = 0;
    while (true) {
      let response: Response;
      try {
        if (offset >= size) {
          sent.last = true;
          response = await this.put(session, { 'content-range': `bytes */${size}` });
        } else {
          const chunk = await readChunk(file, offset, Math.min(this.chunkBytes, size - offset));
          if (offset + chunk.length >= size) sent.last = true;
          response = await this.put(
            session,
            { 'content-length': String(chunk.length), 'content-range': `bytes ${offset}-${offset + chunk.length - 1}/${size}` },
            chunk,
          );
        }
      } catch (error) {
        failures += 1;
        if (failures > 6) throw new PublishError(redactSecrets(`YouTube upload failed: ${(error as Error).message}`, this.secrets));
        await this.sleep(1_000 * 2 ** (failures - 1));
        offset = await this.queryOffset(session, size);
        continue;
      }
      if (response.status === 200 || response.status === 201) return readJson(response);
      if (response.status === 308) {
        offset = nextOffset(response.headers.get('range'));
        failures = 0;
        continue;
      }
      if (response.status >= 500 || response.status === 429 || response.status === 408) {
        failures += 1;
        await response.body?.cancel().catch(() => undefined);
        if (failures > 6) throw httpError('YouTube upload', response.status, {}, this.secrets);
        await this.sleep(1_000 * 2 ** (failures - 1));
        offset = await this.queryOffset(session, size);
        continue;
      }
      if (response.status === 404 || response.status === 410) {
        throw new PublishError('The YouTube upload session expired. Run publish again to start a new upload.', response.status);
      }
      throw httpError('YouTube upload', response.status, await readJson(response), this.secrets);
    }
  }

  private put(session: string, headers: Record<string, string>, body?: Buffer<ArrayBuffer>): Promise<Response> {
    return this.authorized(async (token) =>
      this.fetchImpl(session, {
        method: 'PUT',
        headers: { authorization: `Bearer ${token}`, ...headers },
        ...(body ? { body } : {}),
        redirect: 'manual',
        signal: AbortSignal.timeout(600_000),
      }),
    );
  }

  private async queryOffset(session: string, size: number): Promise<number> {
    try {
      const response = await this.put(session, { 'content-length': '0', 'content-range': `bytes */${size}` });
      if (response.status === 308) return nextOffset(response.headers.get('range'));
      // 200/201: the upload is complete; the next round reads the result.
      if (response.ok) return size;
    } catch {
      // Keep the loop's retry budget in charge.
    }
    return 0;
  }

  private async setThumbnail(id: string, path: string, warnings: string[]): Promise<PublishResult['thumbnail']> {
    const data = await readChunk(path, 0, (await stat(path)).size);
    const response = await this.authorized((token) =>
      fetchWithRetry(
        this.fetchImpl,
        `${THUMBNAIL_URL}?videoId=${encodeURIComponent(id)}&uploadType=media`,
        { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': mimeForPath(path) }, body: data },
        { secrets: this.secrets, sleep: this.sleep, timeoutMs: 120_000 },
      ),
    );
    if (response.ok) return 'set';
    const body = await readJson(response);
    if (response.status === 403) {
      warnings.push(
        'YouTube refused the custom thumbnail (403): the channel is probably not verified for custom thumbnails. ' +
          `Verify it at https://www.youtube.com/verify and set the thumbnail in YouTube Studio: https://studio.youtube.com/video/${id}/edit`,
      );
      return 'skipped';
    }
    warnings.push(redactSecrets(`Thumbnail upload failed with HTTP ${response.status}; set it in YouTube Studio.`, this.secrets));
    return 'failed';
  }
}

/** The next byte to send after a 308: one past the end of `Range: bytes=0-N`, or 0 without a range. */
function nextOffset(range: string | null): number {
  const match = /bytes=\d+-(\d+)/.exec(range ?? '');
  return match ? Number(match[1]) + 1 : 0;
}

function stripUndefined<T extends object>(value: T): Partial<T> {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>;
}
