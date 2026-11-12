import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { THUMBNAIL_MAX_BYTES, thumbnailSize, type ThumbnailFormat } from '../../remotion/src/lib/thumbnail.js';

// Thumbnail file checks without the renderer, so status (also in the npx bundle) can list them.

/** The thumbnails folder of a project. */
export function thumbnailsDir(renders: string): string {
  return join(renders, 'thumbnails');
}

/** Width and height of a baseline or progressive JPEG, from its SOF marker. */
export function jpegSize(buffer: Buffer): { width: number; height: number } | undefined {
  if (buffer[0] !== 0xff || buffer[1] !== 0xd8) return undefined;
  let offset = 2;
  while (offset + 9 < buffer.length) {
    if (buffer[offset] !== 0xff) return undefined;
    const marker = buffer[offset + 1]!;
    const length = buffer.readUInt16BE(offset + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isSof) return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
    offset += 2 + length;
  }
  return undefined;
}

/** Problems of a finished thumbnail file: wrong size, wrong type, over 2 MB. Empty when it is fine. */
export async function thumbnailProblems(path: string, format: ThumbnailFormat = '16x9'): Promise<string[]> {
  const problems: string[] = [];
  const buffer = await readFile(path);
  const size = jpegSize(buffer);
  const expected = thumbnailSize(format);
  if (!size) problems.push('not a JPEG');
  else if (size.width !== expected.width || size.height !== expected.height) {
    problems.push(`${size.width}x${size.height}, expected ${expected.width}x${expected.height}`);
  }
  if (buffer.length >= THUMBNAIL_MAX_BYTES) problems.push(`${(buffer.length / 1024 / 1024).toFixed(2)} MB, limit 2 MB`);
  return problems;
}

/** The JPEG files in `renders/thumbnails/`, sorted by name. */
export async function listThumbnails(renders: string): Promise<string[]> {
  const dir = thumbnailsDir(renders);
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .filter((name) => /\.jpe?g$/i.test(name))
    .sort()
    .map((name) => join(dir, name));
}
