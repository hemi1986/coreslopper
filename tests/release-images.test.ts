import { describe, expect, it } from 'vitest';
import { DERIVED_PATHS, derivedImages } from '../packages/cli/src/release-images.ts';

const announcement = { title: 'After Midnight', releaseAt: '2026-12-11T18:00:00+01:00', announcement: true, story: false };

describe('derived images', () => {
  it('tags an episode announcement "new episode" in German and English', () => {
    for (const [language, tag] of [
      ['de', 'NEUE FOLGE'],
      ['en', 'NEW EPISODE'],
    ] as const) {
      const images = derivedImages({ ...announcement, language, episode: true });
      expect(images.map((image) => [image.path, image.tag])).toEqual([
        [DERIVED_PATHS.announceStory, tag],
        [DERIVED_PATHS.announcePost, tag],
      ]);
    }
  });

  it('keeps "new song" for a music video', () => {
    for (const [language, tag] of [
      ['de', 'NEUER SONG'],
      ['en', 'NEW SONG'],
    ] as const) {
      const images = derivedImages({ ...announcement, language });
      expect(images.map((image) => image.tag)).toEqual([tag, tag]);
    }
  });

  it('leaves the story image as it is for an episode', () => {
    const images = derivedImages({ ...announcement, language: 'de', episode: true, story: true });
    expect(images.map((image) => [image.path, image.tag])).toEqual([
      [DERIVED_PATHS.announceStory, 'NEUE FOLGE'],
      [DERIVED_PATHS.announcePost, 'NEUE FOLGE'],
      [DERIVED_PATHS.story, 'JETZT'],
    ]);
  });
});
