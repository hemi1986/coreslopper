import type { FetchLike } from '../http.js';
import type { PublishLogger } from './types.js';

// Social post adapters: the platforms the release autopilot posts to at the
// calendar time (ADR 0029). Unlike `PublishAdapter`, which uploads a private
// video or a draft, a social adapter publishes the post. It runs only for a
// release the user approved on the release board.

export type SocialPlatform = 'x' | 'linkedin' | 'instagram';

export interface SocialMedia {
  /** Absolute path of the file. */
  path: string;
  kind: 'video' | 'image';
}

export interface SocialPostRequest {
  /** The calendar event id (`x`, `short:Z1-intro:instagram`, ...), for logs and error messages. */
  event: string;
  /** The post text as the platform shows it, hashtags and links included. */
  text: string;
  media?: SocialMedia;
  /** X: a reply posted right after the post, e.g. the one with the YouTube link. */
  reply?: string;
  /** Instagram: a Reel, a feed post (an image, or a video that also shows in the grid), or a story. */
  placement?: 'reel' | 'feed' | 'story';
  /** Instagram Reel: the cover frame, in milliseconds into the video. */
  coverOffsetMs?: number;
}

export interface SocialPostResult {
  /** The platform's ID of the post. */
  remoteId: string;
  /** The live post. */
  url?: string;
  /** X: the ID of the reply. */
  replyId?: string;
  /** Non-fatal problems. */
  warnings: string[];
  /** What the user still does by hand on the platform. */
  manualSteps: string[];
  /** What the calls cost, where the platform bills per call (X). */
  costUsd?: number;
}

/** Publishes one post. An adapter is only ever called by the autopilot for an approved release. */
export interface SocialAdapter {
  readonly platform: SocialPlatform;
  /** True for the mock adapter; no network. */
  readonly mock: boolean;
  post(request: SocialPostRequest): Promise<SocialPostResult>;
}

/** Store a rotated or refreshed secret (e.g. in `.env`); the value is never printed. */
export type SaveSecret = (key: string, value: string) => Promise<void> | void;

/** Options every social adapter takes. */
export interface SocialAdapterOptions {
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  fetchImpl?: FetchLike;
  sleep?: (ms: number) => Promise<void>;
  log?: PublishLogger;
  /** Called with each token the platform rotates or refreshes, so the next run uses it. */
  saveSecret?: SaveSecret;
  now?: () => Date;
}

/** A social adapter that makes no network calls: it checks the media exists and returns stable fake IDs. */
export class MockSocialAdapter implements SocialAdapter {
  readonly mock = true;
  readonly calls: SocialPostRequest[] = [];

  constructor(readonly platform: SocialPlatform) {}

  async post(request: SocialPostRequest): Promise<SocialPostResult> {
    const { stat } = await import('node:fs/promises');
    const { createHash } = await import('node:crypto');
    if (request.media) await stat(request.media.path);
    this.calls.push(request);
    const id = createHash('sha256').update(`${this.platform}:${request.event}:${request.text}`).digest('hex').slice(0, 12);
    const url = {
      x: `https://x.com/i/status/mock-${id}`,
      linkedin: `https://www.linkedin.com/feed/update/urn:li:share:mock-${id}`,
      instagram: `https://www.instagram.com/p/mock-${id}/`,
    }[this.platform];
    return { remoteId: `mock-${id}`, url, ...(request.reply ? { replyId: `mock-${id}-reply` } : {}), warnings: [], manualSteps: [] };
  }
}
