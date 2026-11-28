import { describe, expect, it } from 'vitest';
import { mainVideoReel, postsVerticalVersion, releaseShape, upToThreeMinutes } from '../packages/core/src/index.ts';

const vertical = { width: 1080, height: 1920 };
const horizontal = { width: 1920, height: 1080 };

// One rule for "up to 3 minutes", 0.05 s of tolerance included: a track that
// reads "3:00" (180.02 s) is short-form for the release shape, the main video's
// Reel and the vertical version alike (ST-049).
describe('up to 3 minutes', () => {
  it('holds 180.02 s and not 180.06 s', () => {
    expect(upToThreeMinutes(180.02)).toBe(true);
    expect(upToThreeMinutes(180.06)).toBe(false);
  });

  it('is the same for the release shape, the Reel and the vertical version', () => {
    expect(releaseShape({ kind: 'episode', master: vertical, durationSeconds: 180.02 })).toBe('short-episode');
    expect(mainVideoReel(180.02)).toBe(true);
    expect(postsVerticalVersion({ kind: 'episode', master: horizontal, durationSeconds: 180.02 })).toBe(true);
    expect(releaseShape({ kind: 'episode', master: vertical, durationSeconds: 180.06 })).toBe('episode');
    expect(mainVideoReel(180.06)).toBe(false);
    expect(postsVerticalVersion({ kind: 'episode', master: horizontal, durationSeconds: 180.06 })).toBe(false);
  });

  it('gives the vertical version only to a horizontal episode with a track', () => {
    expect(postsVerticalVersion({ kind: 'episode', master: vertical, durationSeconds: 150 })).toBe(false);
    expect(postsVerticalVersion({ kind: 'episode', master: horizontal, durationSeconds: undefined })).toBe(false);
    expect(postsVerticalVersion({ kind: 'music-video', master: horizontal, durationSeconds: 150 })).toBe(false);
  });
});
