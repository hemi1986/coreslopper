import { createHash } from 'node:crypto';
import { stat } from 'node:fs/promises';
import type { PublishPlatform } from '@coreslopper/core';
import { tiktokCaption } from './tiktok.js';
import { YOUTUBE_QUOTA } from './youtube.js';
import type { PublishAdapter, PublishRequest, PublishResult } from './types.js';

/**
 * A publish adapter that makes no network calls: it checks that the files
 * exist and returns stable fake IDs. Used by tests, CI, and `publish --mock`.
 */
export class MockPublisher implements PublishAdapter {
  readonly mock = true;
  readonly calls: PublishRequest[] = [];

  constructor(readonly platform: PublishPlatform) {}

  async publish(request: PublishRequest): Promise<PublishResult> {
    const { item, schedule } = request;
    await stat(item.file);
    if (item.thumbnail) await stat(item.thumbnail);
    this.calls.push(request);
    const id = createHash('sha256').update(`${this.platform}:${item.name}:${item.title}`).digest('hex').slice(0, 11);
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
