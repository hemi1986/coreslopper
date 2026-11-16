import type { PublishPlatform, PublishStatus } from '@coreslopper/core';

/** One video as a publish adapter uploads it: the main video or a Short, with resolved paths. */
export interface PublishItem {
  /** `main` or the Short name. */
  name: string;
  kind: 'main' | 'short';
  /** Absolute path of the video. */
  file: string;
  /** Absolute path of the thumbnail, if any. */
  thumbnail?: string;
  title: string;
  /** The description body without hashtags. */
  description: string;
  tags: string[];
  hashtags: string[];
  language: string;
  madeForKids: boolean;
  syntheticMedia: boolean;
  categoryId: string;
  /** The item a Short points to (`main`). */
  related?: string;
}

export interface PublishRequest {
  item: PublishItem;
  /** ISO date to schedule the publication at, where the platform supports it. */
  schedule?: string;
}

export interface PublishResult {
  /** YouTube video ID or TikTok publish ID. */
  remoteId: string;
  url?: string;
  status: Exclude<PublishStatus, 'failed'>;
  publishAt?: string;
  thumbnail?: 'set' | 'skipped' | 'failed' | 'none';
  /** Non-fatal problems, such as a thumbnail the channel may not set. */
  warnings: string[];
  /** What the user still does by hand on the platform. */
  manualSteps: string[];
  /** YouTube API quota units spent. */
  quotaUnits?: number;
}

/**
 * Uploads one item to one platform as a private video or a draft. An adapter
 * never makes a video public; the user does that on the platform.
 */
export interface PublishAdapter {
  readonly platform: PublishPlatform;
  /** True for the mock adapter; its log entries never satisfy a real run. */
  readonly mock: boolean;
  publish(request: PublishRequest): Promise<PublishResult>;
}

/** Optional progress output; adapters never pass tokens to it. */
export type PublishLogger = (message: string) => void;
