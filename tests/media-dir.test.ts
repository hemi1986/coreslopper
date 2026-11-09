import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { linkProjectMedia, mediaDirFor } from '../packages/cli/src/media-dir.js';

function project(): { base: string; dir: string } {
  const base = mkdtempSync(join(tmpdir(), 'cs-media-'));
  const dir = join(base, 'repo', 'projects', 'my-song');
  for (const sub of ['assets', 'renders']) {
    mkdirSync(join(dir, sub), { recursive: true });
    writeFileSync(join(dir, sub, '.gitkeep'), '');
  }
  return { base, dir };
}

describe('mediaDirFor', () => {
  it('is undefined when unset', () => {
    expect(mediaDirFor('x', '')).toBeUndefined();
    expect(mediaDirFor('x', undefined)).toBeUndefined();
  });
  it('replaces {slug} or appends the slug', () => {
    expect(mediaDirFor('my-song', '/mnt/d/{slug}')).toBe('/mnt/d/my-song');
    expect(mediaDirFor('my-song', '/mnt/d/media')).toBe('/mnt/d/media/my-song');
  });
});

describe('linkProjectMedia', () => {
  it('links empty folders and is idempotent', async () => {
    const { base, dir } = project();
    const media = join(base, 'D', '{slug}');
    const first = await linkProjectMedia(dir, { mediaDir: media });
    expect(first.map((r) => r.action)).toEqual(['linked', 'linked']);
    expect(lstatSync(join(dir, 'assets')).isSymbolicLink()).toBe(true);
    expect(realpathSync(join(dir, 'renders'))).toBe(join(base, 'D', 'my-song', 'renders'));
    const second = await linkProjectMedia(dir, { mediaDir: media });
    expect(second.map((r) => r.action)).toEqual(['already-linked', 'already-linked']);
    expect(readFileSync(join(dir, '.gitignore'), 'utf8')).toBe('/assets\n/renders\n');
  });

  it('refuses to move content without --move, then moves it', async () => {
    const { base, dir } = project();
    mkdirSync(join(dir, 'assets', 'clips'));
    writeFileSync(join(dir, 'assets', 'clips', 'a.mp4'), 'clip');
    const media = join(base, 'D');
    await expect(linkProjectMedia(dir, { mediaDir: media })).rejects.toThrow(/--move/);
    expect(existsSync(join(dir, 'assets', 'clips', 'a.mp4'))).toBe(true);
    const results = await linkProjectMedia(dir, { mediaDir: media, move: true });
    expect(results[0]!.action).toBe('moved');
    expect(readFileSync(join(base, 'D', 'my-song', 'assets', 'clips', 'a.mp4'), 'utf8')).toBe('clip');
    // Project-relative paths keep working through the symlink.
    expect(readFileSync(join(dir, 'assets', 'clips', 'a.mp4'), 'utf8')).toBe('clip');
  });
});
