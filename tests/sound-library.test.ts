import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { hashFileStream } from '../packages/core/src/index.ts';
import { addLibrarySound, loadLibrarySound, soundDir, SoundRefused, updateLibrarySound } from '../packages/cli/src/sound-library.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

async function workspace(): Promise<{ root: string; files: string }> {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-sounds-'));
  temporary.push(root);
  const files = join(root, 'incoming');
  await mkdir(files);
  return { root, files };
}

/** A tone of the given length and pitch, encoded by ffmpeg into the file's format. */
function tone(path: string, seconds: number, frequency = 440): string {
  execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', `sine=frequency=${frequency}:sample_rate=48000:duration=${seconds}`, path]);
  return path;
}

async function sounds(root: string): Promise<string[]> {
  const dir = join(root, 'library', 'sounds');
  return existsSync(dir) ? (await readdir(dir)).sort() : [];
}

describe.skipIf(!hasFfmpeg())('sound add', () => {
  it('ST-001: An mp3 becomes a measured library sound', async () => {
    const { root, files } = await workspace();
    const boom = tone(join(files, 'boom.mp3'), 1.4);

    const sound = await addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a dramatic reveal', cue: 0.12 });

    expect(sound.id).toBe('vine-boom');
    expect(await sounds(root)).toEqual(['vine-boom']);
    expect(await readdir(soundDir(root, 'vine-boom'))).toEqual(['sound.wav', 'sound.yaml']);
    const stored = await loadLibrarySound(root, 'vine-boom');
    expect(stored).toMatchObject({ id: 'vine-boom', title: 'Vine Boom', use_when: 'a dramatic reveal', cue: 0.12, licence: 'unknown' });
    expect(stored.length).toBeCloseTo(1.4, 1);
    expect(stored.loudness).toBeLessThan(0);
    expect(stored.loudness).toBeGreaterThan(-40);
    const codec = execFileSync(resolveBinary('ffprobe'), ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', join(soundDir(root, 'vine-boom'), 'sound.wav')], { encoding: 'utf8' });
    expect(codec.trim()).toMatch(/^pcm_/);
  });

  it('ST-001: The same file under another id is refused', async () => {
    const { root, files } = await workspace();
    const boom = tone(join(files, 'boom.mp3'), 1.4);
    await addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a dramatic reveal' });

    const refused = await addLibrarySound(root, { file: boom, title: 'Boom 2', useWhen: 'a dramatic reveal' }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect(refused).toMatchObject({ reason: 'duplicate', existing: 'vine-boom' });
    expect((refused as Error).message).toMatch(/already stored as "vine-boom"/);
    expect(await sounds(root)).toEqual(['vine-boom']);
  });

  it('ST-001: A taken id is refused', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    const other = tone(join(files, 'other.wav'), 0.8, 660);

    const refused = await addLibrarySound(root, { file: other, title: 'Vine Boom', useWhen: 'something else' }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect(refused).toMatchObject({ reason: 'id-taken', existing: 'vine-boom' });
    expect((refused as Error).message).toMatch(/id "vine-boom" is taken/);
    expect(await sounds(root)).toEqual(['vine-boom']);
  });

  it('ST-001: A cue outside the sound is refused', async () => {
    const { root, files } = await workspace();
    const boom = tone(join(files, 'boom.mp3'), 1.4);

    const refused = await addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a dramatic reveal', cue: 2.0 }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect(refused).toMatchObject({ reason: 'outside' });
    expect((refused as Error).message).toMatch(/cue .* outside/);
    expect(existsSync(join(root, 'library', 'sounds', 'vine-boom'))).toBe(false);
    expect(await sounds(root)).toEqual([]);
  });

  it('measures the loudness of a sound shorter than 400 ms', async () => {
    const { root, files } = await workspace();
    const click = await addLibrarySound(root, { file: tone(join(files, 'click.wav'), 0.2), title: 'Click', useWhen: 'a quick cut' });

    expect(click.length).toBeCloseTo(0.2, 2);
    expect(Number.isFinite(click.loudness)).toBe(true);
    expect(click.loudness).toBeLessThan(0);
  });

  it('refuses a silent file, a file that is not audio, and a URL', async () => {
    const { root, files } = await workspace();
    const silence = join(files, 'silence.wav');
    execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=sample_rate=48000:duration=1', silence]);
    const text = join(files, 'notes.mp3');
    await writeFile(text, 'not audio at all');

    await expect(addLibrarySound(root, { file: silence, title: 'Quiet', useWhen: 'nothing' })).rejects.toMatchObject({ reason: 'silent' });
    await expect(addLibrarySound(root, { file: text, title: 'Notes', useWhen: 'nothing' })).rejects.toMatchObject({ reason: 'not-audio' });
    await expect(addLibrarySound(root, { file: 'https://example.com/boom.mp3', title: 'Remote', useWhen: 'nothing' })).rejects.toMatchObject({ reason: 'invalid' });
    expect(await sounds(root)).toEqual([]);
  });

  it('refuses a trim outside the sound and a cue outside the trim', async () => {
    const { root, files } = await workspace();
    const boom = tone(join(files, 'boom.mp3'), 1.4);

    await expect(addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a reveal', trim: '0.2-2.0' })).rejects.toMatchObject({ reason: 'outside' });
    await expect(addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a reveal', trim: '0.2-0.6', cue: 0.5 })).rejects.toMatchObject({ reason: 'outside' });
    await expect(addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a reveal', trim: { start: 0.2 } })).rejects.toMatchObject({ reason: 'invalid' });
    const kept = await addLibrarySound(root, { file: boom, title: 'Vine Boom', useWhen: 'a reveal', trim: '0.2-0.6', cue: 0.3 });
    expect(kept).toMatchObject({ trim: { start: 0.2, end: 0.6 }, cue: 0.3 });
    expect(await sounds(root)).toEqual(['vine-boom']);
  });
});

describe.skipIf(!hasFfmpeg())('sound edit', () => {
  async function vineBoom(trim?: string) {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal', ...(trim ? { trim } : {}) });
    return root;
  }

  it('ST-002: The use when and the tags are changed', async () => {
    const root = await vineBoom();
    const wav = join(soundDir(root, 'vine-boom'), 'sound.wav');
    const before = await hashFileStream(wav);

    const updated = await updateLibrarySound(root, 'vine-boom', { useWhen: 'a shocking twist', tags: 'reveal,shock' });

    expect(updated).toMatchObject({ use_when: 'a shocking twist', tags: ['reveal', 'shock'] });
    expect(await loadLibrarySound(root, 'vine-boom')).toMatchObject({ title: 'Vine Boom', use_when: 'a shocking twist', tags: ['reveal', 'shock'], hash: before });
    expect(await hashFileStream(wav)).toBe(before);
  });

  it('ST-002: An empty use when is refused', async () => {
    const root = await vineBoom();

    const refused = await updateLibrarySound(root, 'vine-boom', { useWhen: '  ' }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect((refused as Error).message).toMatch(/needs a use when/);
    expect((await loadLibrarySound(root, 'vine-boom')).use_when).toBe('a dramatic reveal');
  });

  it('ST-002: A cue outside the trim is refused', async () => {
    const root = await vineBoom('0.0-1.0');

    const refused = await updateLibrarySound(root, 'vine-boom', { cue: '1.2' }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect(refused).toMatchObject({ reason: 'outside' });
    expect((refused as Error).message).toMatch(/cue 1.2 lies outside the trim/);
    expect((await loadLibrarySound(root, 'vine-boom')).cue).toBeUndefined();
  });

  it('ST-002: The length cannot be typed', async () => {
    const root = await vineBoom();

    const refused = await updateLibrarySound(root, 'vine-boom', { length: '3' }).catch((error: unknown) => error);

    expect(refused).toBeInstanceOf(SoundRefused);
    expect((refused as Error).message).toMatch(/length is measured from the file/);
    expect((await loadLibrarySound(root, 'vine-boom')).length).toBeCloseTo(1.4, 1);
  });

  it('clears optional fields with an empty value and keeps the rest', async () => {
    const root = await vineBoom('0.1-1.0');
    await updateLibrarySound(root, 'vine-boom', { cue: 0.3, source: 'https://example.com', licence: 'CC-BY', credit: 'someone' });

    const cleared = await updateLibrarySound(root, 'vine-boom', { trim: '', cue: '', source: '', licence: '', credit: '' });

    expect(cleared).toMatchObject({ title: 'Vine Boom', use_when: 'a dramatic reveal', licence: 'unknown' });
    expect(cleared).not.toHaveProperty('trim');
    expect(cleared).not.toHaveProperty('cue');
    expect(cleared).not.toHaveProperty('source');
    expect(cleared).not.toHaveProperty('credit');
  });

  it('refuses the loudness, an empty title and an unknown sound', async () => {
    const root = await vineBoom();

    await expect(updateLibrarySound(root, 'vine-boom', { loudness: '-10' })).rejects.toThrow(/loudness is measured from the file/);
    await expect(updateLibrarySound(root, 'vine-boom', { title: '' })).rejects.toThrow(/needs a title/);
    await expect(updateLibrarySound(root, 'no-such-sound', { title: 'x' })).rejects.toThrow(/no library sound "no-such-sound"/);
  });
});
