import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// The release view's pure helpers, loaded with the fake-document pattern of
// tests/board-feedback.test.ts: no DOM library is installed.

interface ReleaseView {
  count(value: string, field: { unit?: 'chars' | 'bytes'; counting?: 'x' }): number;
  tabOf(event: { platform: string }): string;
}

let view: ReleaseView;

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en' });
  vi.stubGlobal('document', {
    createElement: () => ({ setAttribute() {}, addEventListener() {}, appendChild() {} }),
    createTextNode: (data: string) => ({ data }),
    getElementById: () => null,
    documentElement: { lang: 'en' },
  });
  // @ts-expect-error the board's page modules are plain JS without type declarations
  view = (await import('../packages/cli/src/board/release.js')) as ReleaseView;
});

afterAll(() => vi.unstubAllGlobals());

describe('the release view’s helpers', () => {
  it('counts bytes and characters as the platform does, with a link as 23 characters on X', () => {
    expect(view.count('ä', { unit: 'bytes' })).toBe(2);
    expect(view.count('abc', { unit: 'chars' })).toBe(3);
    expect(view.count('a𝐀', {})).toBe(2);
    expect(view.count('Hi https://a.co/x', { counting: 'x' })).toBe(26);
    expect(view.count('https://a.co/x', { counting: 'x' })).toBe(23);
  });

  it('opens a distributor event on the Spotify tab and every other event on its own platform', () => {
    expect(view.tabOf({ platform: 'distributor' })).toBe('spotify');
    expect(view.tabOf({ platform: 'youtube' })).toBe('youtube');
    expect(view.tabOf({ platform: 'shorts' })).toBe('shorts');
  });
});
