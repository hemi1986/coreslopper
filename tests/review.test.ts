import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { reviewNotesPath, reviewVideoPath } from '../packages/cli/src/review.js';

function renders(files: Record<string, number>): string {
  const dir = join(mkdtempSync(join(tmpdir(), 'cs-review-')), 'renders');
  mkdirSync(dir);
  for (const [name, mtime] of Object.entries(files)) {
    writeFileSync(join(dir, name), '');
    utimesSync(join(dir, name), mtime, mtime);
  }
  return dir;
}

describe('reviewVideoPath', () => {
  it('picks the newer of preview and master', () => {
    const dir = renders({ 'preview-16x9.mp4': 2000, '16x9.mp4': 1000 });
    expect(reviewVideoPath(dir, '16x9')).toBe(join(dir, 'preview-16x9.mp4'));
    utimesSync(join(dir, '16x9.mp4'), 3000, 3000);
    expect(reviewVideoPath(dir, '16x9')).toBe(join(dir, '16x9.mp4'));
  });

  it('uses the format', () => {
    const dir = renders({ 'preview-16x9.mp4': 2000, '9x16.mp4': 1000 });
    expect(reviewVideoPath(dir, '9x16')).toBe(join(dir, '9x16.mp4'));
  });

  it('fails without a render', () => {
    expect(() => reviewVideoPath(renders({}), '16x9')).toThrow(/No render of 16x9/);
  });

  it('takes an explicit video and checks it exists', () => {
    const dir = renders({ 'Z1-intro-9x16.mp4': 1000 });
    expect(reviewVideoPath(dir, '16x9', join(dir, 'Z1-intro-9x16.mp4'))).toBe(join(dir, 'Z1-intro-9x16.mp4'));
    expect(() => reviewVideoPath(dir, '16x9', join(dir, 'missing.mp4'))).toThrow(/does not exist/);
  });
});

describe('reviewNotesPath', () => {
  it('stores notes per video stem under review/notes', () => {
    expect(reviewNotesPath('/p/review', '/media/p/renders/preview-16x9.mp4')).toBe('/p/review/notes/preview-16x9.json');
  });
});
