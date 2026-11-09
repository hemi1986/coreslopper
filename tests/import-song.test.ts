import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { findSourceAudio } from '../packages/cli/src/media.ts';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function sourceDir(files: string[]): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'coreslopper-source-'));
  temporary.push(directory);
  for (const file of files) await writeFile(join(directory, file), 'x');
  return directory;
}

describe('song import sources', () => {
  it('finds song and vocals by name in any supported format', async () => {
    const directory = await sourceDir(['Song.MP3', 'vocals.flac', 'notes.txt', 'song-old.wav']);
    expect(findSourceAudio(directory, 'song')).toBe(join(directory, 'Song.MP3'));
    expect(findSourceAudio(directory, 'vocals')).toBe(join(directory, 'vocals.flac'));
  });

  it('returns nothing for a missing file or folder', async () => {
    const directory = await sourceDir(['song.wav']);
    expect(findSourceAudio(directory, 'vocals')).toBeUndefined();
    expect(findSourceAudio(join(directory, 'missing'), 'song')).toBeUndefined();
  });

  it('prefers the WAV when the user also left another format', async () => {
    const directory = await sourceDir(['song.mp3', 'song.wav']);
    expect(findSourceAudio(directory, 'song')).toBe(join(directory, 'song.wav'));
  });

  it('refuses an ambiguous non-WAV source', async () => {
    const directory = await sourceDir(['song.flac', 'song.mp3']);
    expect(() => findSourceAudio(directory, 'song')).toThrow(/More than one song/);
  });
});
