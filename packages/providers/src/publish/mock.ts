import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { PublishPlatform } from '@coreslopper/core';
import { tiktokCaption } from './tiktok.js';
import { YOUTUBE_DESCRIPTION_BYTES, YOUTUBE_QUOTA, type YouTubeVideoStatus } from './youtube.js';
import type { PublishAdapter, PublishRequest, PublishResult } from './types.js';

/**
 * A publish adapter that makes no network calls: it checks that the files
 * exist and returns stable fake IDs. Used by tests, CI, and `publish --mock`.
 */
export class MockPublisher implements PublishAdapter {
  readonly mock = true;
  readonly calls: PublishRequest[] = [];
  /** YouTube: what the autopilot did to videos after the upload, in order. */
  readonly videoCalls: { method: 'videoStatus' | 'appendToDescription' | 'postComment'; videoId: string; text?: string }[] = [];
  /** YouTube: per video, the status `videoStatus` reports; set it in a test to simulate a published video. */
  readonly statuses = new Map<string, YouTubeVideoStatus>();
  /** YouTube: per video, the description the mock holds. */
  readonly descriptions = new Map<string, string>();

  constructor(
    readonly platform: PublishPlatform,
    /** TikTok: `direct` returns a posted video instead of a draft. */
    readonly mode: 'inbox' | 'direct' = 'inbox',
  ) {}

  /** The status of a mock video: private (scheduled when it was uploaded with a schedule) until a test sets another. */
  async videoStatus(videoId: string): Promise<YouTubeVideoStatus> {
    this.videoCalls.push({ method: 'videoStatus', videoId });
    const set = this.statuses.get(videoId);
    if (set) return set;
    const scheduled = this.calls.find((call) => call.schedule && this.idFor(call) === videoId);
    return { privacyStatus: 'private', ...(scheduled ? { publishAt: new Date(scheduled.schedule!).toISOString() } : {}), uploadStatus: 'processed' };
  }

  async appendToDescription(videoId: string, text: string): Promise<{ changed: boolean }> {
    this.videoCalls.push({ method: 'appendToDescription', videoId, text });
    const block = text.trim();
    const current = this.descriptions.get(videoId) ?? '';
    if (!block || current.includes(block)) return { changed: false };
    const next = current.trim() ? `${current.trimEnd()}\n\n${block}` : block;
    if (Buffer.byteLength(next, 'utf8') > YOUTUBE_DESCRIPTION_BYTES) throw new Error(`The description of ${videoId} would exceed ${YOUTUBE_DESCRIPTION_BYTES} bytes.`);
    this.descriptions.set(videoId, next);
    return { changed: true };
  }

  async postComment(videoId: string, text: string): Promise<{ commentId: string }> {
    this.videoCalls.push({ method: 'postComment', videoId, text });
    const id = createHash('sha256').update(`comment:${videoId}:${text}`).digest('hex').slice(0, 11);
    return { commentId: `mock-comment-${id}` };
  }

  private idFor(request: PublishRequest): string {
    return `mock-${createHash('sha256').update(`${this.platform}:${request.item.name}:${request.item.title}`).digest('hex').slice(0, 11)}`;
  }

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { item, schedule } = request;
    await stat(item.file);
    if (item.thumbnail) await stat(item.thumbnail);
    this.calls.push(request);
    const id = createHash('sha256').update(`${this.platform}:${item.name}:${item.title}`).digest('hex').slice(0, 11);
    if (this.platform === 'tiktok' && this.mode === 'direct') {
      return { remoteId: `mock-${id}`, url: `https://www.tiktok.com/@mock/video/mock-${id}`, status: 'uploaded', thumbnail: 'none', warnings: [], manualSteps: [] };
    }
    if (this.platform === 'tiktok') {
      return {
        remoteId: `mock-${id}`,
        status: 'draft',
        thumbnail: 'none',
        warnings: [],
        manualSteps: [`Paste this caption in TikTok:\n${tiktokCaption(item)}`],
      };
    }
    return {
      remoteId: `mock-${id}`,
      url: item.kind === 'short' ? `https://youtube.com/shorts/mock-${id}` : `https://youtu.be/mock-${id}`,
      status: schedule ? 'scheduled' : 'uploaded',
      ...(schedule ? { publishAt: new Date(schedule).toISOString() } : {}),
      thumbnail: item.thumbnail ? 'set' : 'none',
      warnings: [],
      manualSteps: [],
      quotaUnits: YOUTUBE_QUOTA.insert + (item.thumbnail ? YOUTUBE_QUOTA.thumbnail : 0),
    };
  }
}
