import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stringify } from 'yaml';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { hashFileStream } from '../packages/core/src/index.ts';
import { addLibrarySound, checkSoundLibrary, listLibrarySounds, loadLibrarySound, soundCheckLines, soundDir, soundListLines, SoundRefused, updateLibrarySound } from '../packages/cli/src/sound-library.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

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

    const { sound: updated } = await updateLibrarySound(root, 'vine-boom', { useWhen: 'a shocking twist', tags: 'reveal,shock' });

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
    const { sound: filled } = await updateLibrarySound(root, 'vine-boom', { cue: 0.3, source: 'https://example.com', licence: 'CC-BY', credit: 'someone' });
    expect(filled).toMatchObject({ cue: 0.3, source: 'https://example.com', licence: 'CC-BY', credit: 'someone' });

    await updateLibrarySound(root, 'vine-boom', { trim: '', cue: '', source: '', licence: '', credit: '' });

    const stored = await loadLibrarySound(root, 'vine-boom');
    expect(stored).toMatchObject({ title: 'Vine Boom', use_when: 'a dramatic reveal', licence: 'unknown' });
    for (const field of ['trim', 'cue', 'source', 'credit']) expect(stored).not.toHaveProperty(field);
  });

  it('keeps the moment the cue lands when only the trim changes', async () => {
    const root = await vineBoom('0.5-1.4');
    await updateLibrarySound(root, 'vine-boom', { cue: 0.2 });

    expect((await updateLibrarySound(root, 'vine-boom', { trim: '' })).sound.cue).toBeCloseTo(0.7, 3);
    expect((await updateLibrarySound(root, 'vine-boom', { trim: '0.3-1.2' })).sound.cue).toBeCloseTo(0.4, 3);
    expect((await updateLibrarySound(root, 'vine-boom', { trim: '0.1-1.2', cue: 0.1 })).sound.cue).toBe(0.1);
    await expect(updateLibrarySound(root, 'vine-boom', { trim: '0.5-1.4' })).rejects.toMatchObject({ reason: 'outside' });
    expect(await loadLibrarySound(root, 'vine-boom')).toMatchObject({ trim: { start: 0.1, end: 1.2 }, cue: 0.1 });
  });

  it('writes nothing for an edit that changes nothing', async () => {
    const root = await vineBoom();
    const entry = join(soundDir(root, 'vine-boom'), 'sound.yaml');
    const before = await readFile(entry, 'utf8');

    const result = await updateLibrarySound(root, 'vine-boom', { useWhen: 'a dramatic reveal' });

    expect(result.changed).toBe(false);
    expect(await readFile(entry, 'utf8')).toBe(before);
  });

  it('refuses a typed length and an empty use when at the command line', async () => {
    const root = await vineBoom();
    const cli = (...args: string[]) =>
      spawnSync(join(process.cwd(), 'node_modules', '.bin', 'tsx'), [join(process.cwd(), 'packages', 'cli', 'src', 'index.ts'), 'sound', 'edit', 'vine-boom', ...args], { cwd: root, encoding: 'utf8' });
    await writeFile(join(root, 'package.json'), JSON.stringify({ name: 'coreslopper' }));

    const length = cli('--length', '3');
    const empty = cli('--use-when', '');
    const changed = cli('--use-when', 'a shocking twist');

    expect(length.status).not.toBe(0);
    expect(length.stderr + length.stdout).toMatch(/length is measured from the file/);
    expect(empty.status).not.toBe(0);
    expect(empty.stderr + empty.stdout).toMatch(/needs a use when/);
    expect(changed.status).toBe(0);
    expect((await loadLibrarySound(root, 'vine-boom')).use_when).toBe('a shocking twist');
  });

  it('refuses the loudness, an empty title and an unknown sound', async () => {
    const root = await vineBoom();

    await expect(updateLibrarySound(root, 'vine-boom', { loudness: '-10' })).rejects.toThrow(/loudness is measured from the file/);
    await expect(updateLibrarySound(root, 'vine-boom', { title: '' })).rejects.toThrow(/needs a title/);
    await expect(updateLibrarySound(root, 'no-such-sound', { title: 'x' })).rejects.toThrow(/no library sound "no-such-sound"/);
    await expect(updateLibrarySound(root, 'vine-boom', { trim: '0.5-0.4' })).rejects.toThrow(/must start before it ends/);
  });
});

describe('a hand edit of sound.yaml', () => {
  /** "vine-boom" as sound add writes it; validation only reads the entry and checks that its WAV is there. */
  async function heldVineBoom(): Promise<{ root: string; entry: string }> {
    const { root } = await workspace();
    const dir = join(root, 'library', 'sounds', 'vine-boom');
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, 'sound.wav'), 'RIFF');
    const entry = join(dir, 'sound.yaml');
    await save(entry, {});
    return { root, entry };
  }

  /** The user's own save: the held entry with their changes. */
  async function save(entry: string, changes: Record<string, unknown>): Promise<void> {
    const sound = {
      version: 1,
      id: 'vine-boom',
      title: 'Vine Boom',
      use_when: 'a dramatic reveal',
      tags: [],
      length: 1.4,
      loudness: -14.2,
      cue: 0.12,
      licence: 'unknown',
      hash: 'a'.repeat(64),
      added: '2026-11-22T10:00:00.000Z',
      ...changes,
    };
    await writeFile(entry, stringify(sound));
  }

  /** What the hook shows the user: the refusal and its reasons, as the CLI prints them. */
  async function refusal(entry: string): Promise<string> {
    try {
      await validateChangedFile(entry);
    } catch (error) {
      const { message, details = [] } = error as { message: string; details?: string[] };
      return [message, ...details].join('\n');
    }
    throw new Error(`${entry} passed`);
  }

  it('ST-005: A valid hand edit passes', async () => {
    const { entry } = await heldVineBoom();

    await save(entry, { tags: ['reveal', 'shock'] });

    expect(await validateChangedFile(entry)).toBe('library sound');
  });

  it('ST-005: An id that is not the folder name is refused', async () => {
    const { entry } = await heldVineBoom();

    await save(entry, { id: 'boom' });

    expect(await refusal(entry)).toMatch(/the id must be the folder name "vine-boom"/);
  });

  it('ST-005: An empty title is refused', async () => {
    const { entry } = await heldVineBoom();

    await save(entry, { title: '' });

    expect(await refusal(entry)).toMatch(/a library sound needs a title/);
  });

  it('ST-005: A missing file is refused', async () => {
    const { entry } = await heldVineBoom();
    await rm(join(entry, '..', 'sound.wav'));

    await save(entry, {});

    expect(await refusal(entry)).toMatch(/"?sound\.wav"? does not exist/);
  });

  it('refuses a cue outside the sound and an empty use when', async () => {
    const { entry } = await heldVineBoom();

    await save(entry, { cue: 2 });
    expect(await refusal(entry)).toMatch(/the cue 2 lies outside the sound's length/);
    await save(entry, { use_when: '  ' });
    expect(await refusal(entry)).toMatch(/a library sound needs a use when/);
  });
});

describe('sound list', () => {
  const entry = (id: string, fields: Record<string, unknown>) => ({
    version: 1,
    id,
    length: 1.4,
    loudness: -18.5,
    licence: 'unknown',
    hash: (id === 'vine-boom' ? 'a' : 'b').repeat(64),
    added: '2026-11-22T10:00:00.000Z',
    ...fields,
  });

  /** Two library sounds and the meme "office-prank", whose take "reveal-boom" came from "vine-boom". */
  async function fixture(): Promise<string> {
    const { root } = await workspace();
    const sounds = {
      'vine-boom': entry('vine-boom', { title: 'Vine Boom', use_when: 'a dramatic reveal', tags: ['reveal', 'impact'], cue: 0.12, trim: { start: 0, end: 1.2 } }),
      'record-scratch': entry('record-scratch', { title: 'Record Scratch', use_when: 'everything stops', tags: ['stop'], length: 0.9, licence: 'CC-BY 4.0', credit: 'by someone' }),
    };
    for (const [id, sound] of Object.entries(sounds)) {
      await mkdir(soundDir(root, id), { recursive: true });
      await writeFile(join(soundDir(root, id), 'sound.yaml'), stringify(sound));
    }
    const meme = join(root, 'projects', 'office-prank');
    await mkdir(meme, { recursive: true });
    await writeFile(join(meme, 'project.yaml'), 'version: 1\nslug: office-prank\n');
    const takes = {
      version: 1,
      takes: {
        'reveal-boom': { source: 'library:vine-boom', duration: 1.2, text_hash: 'x' },
        'boss-line': { source: 'generated', duration: 2, text_hash: 'y' },
      },
      ambience: {},
    };
    await writeFile(join(meme, 'takes.json'), JSON.stringify(takes));
    return root;
  }

  it('prints one row per library sound, sorted by id', async () => {
    const root = await fixture();
    const lines = soundListLines(await listLibrarySounds(root));
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^record-scratch\s+Record Scratch – everything stops · 0\.9 s · -18\.5 LUFS · licence CC-BY 4\.0 · tags: stop$/);
    expect(lines[1]).toMatch(/^vine-boom\s+Vine Boom – a dramatic reveal · 1\.4 s · -18\.5 LUFS · cue 0\.12 · trim 0-1\.2 · licence unknown · tags: reveal, impact · used in office-prank$/);
  });

  it('prints a hint to sound add for an empty library', async () => {
    const { root } = await workspace();
    expect(soundListLines(await listLibrarySounds(root))).toEqual(['The library has no sounds yet. `sound add <file> --title <title> --use-when <text>` adds one.']);
  });

  it('lists only the sounds with the tag', async () => {
    const root = await fixture();
    const { sounds } = await listLibrarySounds(root, { tag: 'reveal' });
    expect(sounds.map((sound) => sound.id)).toEqual(['vine-boom']);
    expect(soundListLines(await listLibrarySounds(root, { tag: 'nothing' }), 'nothing')).toEqual(['No library sound has the tag "nothing".']);
  });

  it('gives every field of the read model, with the memes that took a sound', async () => {
    const root = await fixture();
    const { sounds, errors } = await listLibrarySounds(root);
    expect(errors).toEqual([]);
    expect(sounds[1]).toMatchObject({ id: 'vine-boom', title: 'Vine Boom', use_when: 'a dramatic reveal', tags: ['reveal', 'impact'], length: 1.4, loudness: -18.5, cue: 0.12, trim: { start: 0, end: 1.2 }, licence: 'unknown', used_in: ['office-prank'] });
    expect(sounds[0]).toMatchObject({ id: 'record-scratch', licence: 'CC-BY 4.0', credit: 'by someone', used_in: [] });
  });

  it('names an entry that does not load and still lists the others', async () => {
    const root = await fixture();
    await mkdir(soundDir(root, 'broken'), { recursive: true });
    await writeFile(join(soundDir(root, 'broken'), 'sound.yaml'), 'version: 1\nid: broken\n');
    const listing = await listLibrarySounds(root);
    expect(listing.sounds.map((sound) => sound.id)).toEqual(['record-scratch', 'vine-boom']);
    expect(listing.errors.map((error) => error.id)).toEqual(['broken']);
    expect(soundListLines(listing).at(-1)).toMatch(/^✖ broken: /);
  });
});

describe.skipIf(!hasFfmpeg())('sound check', () => {
  const soundWav = (root: string, id: string) => join(soundDir(root, id), 'sound.wav');

  it('ST-004: A swapped file is measured again', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal', cue: 0.12 });
    await rm(soundWav(root, 'vine-boom'));
    tone(soundWav(root, 'vine-boom'), 2.0, 550);

    const check = await checkSoundLibrary(root);

    const stored = await loadLibrarySound(root, 'vine-boom');
    expect(stored.length).toBeCloseTo(2.0, 1);
    expect(stored.hash).toBe(await hashFileStream(soundWav(root, 'vine-boom')));
    expect(stored.loudness).toBeLessThan(0);
    expect(check.remeasured).toEqual([expect.objectContaining({ id: 'vine-boom', hash: stored.hash })]);
    expect(check.issues).toEqual([]);
    expect(soundCheckLines(check)[0]).toMatch(/^✔ vine-boom measured again: 2(\.0+)? s, -?\d/);
  });

  it('ST-004: A folder without an entry is reported, not added', async () => {
    const { root, files } = await workspace();
    await mkdir(join(root, 'library', 'sounds', 'bruh'), { recursive: true });
    await copyFile(tone(join(files, 'bruh.wav'), 0.8), join(root, 'library', 'sounds', 'bruh', 'sound.wav'));

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'missing-entry', id: 'bruh' })]);
    expect(check.issues[0]?.message).toMatch(/without an entry/);
    expect((await listLibrarySounds(root)).sounds.map((sound) => sound.id)).toEqual([]);
  });

  it('ST-004: A cue that no longer fits is reported', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal', cue: 1.2 });
    await rm(soundWav(root, 'vine-boom'));
    tone(soundWav(root, 'vine-boom'), 1.0, 550);

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'cue-outside', id: 'vine-boom' })]);
    expect(check.issues[0]?.message).toMatch(/cue 1\.2 .*outside/);
    // A cue outside the new length would break the entry, so the check reports it instead of writing it.
    expect((await loadLibrarySound(root, 'vine-boom')).cue).toBe(1.2);
  });

  it('ST-004: An entry without its file is reported', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    await rm(soundWav(root, 'vine-boom'));

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'missing-file', id: 'vine-boom' })]);
    expect(check.issues[0]?.message).toMatch(/without a file/);
  });

  it('reports a loose file and an entry that does not load, and passes a sound library that is fine', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    expect(soundCheckLines(await checkSoundLibrary(root))).toEqual(['✔ The sound library is fine: 1 entry, every entry has its file, every file an entry, and every cue and trim lies inside its sound.']);

    await copyFile(join(files, 'boom.mp3'), join(root, 'library', 'sounds', 'loose.wav'));
    await mkdir(soundDir(root, 'broken'), { recursive: true });
    await copyFile(join(files, 'boom.mp3'), join(soundDir(root, 'broken'), 'sound.wav'));
    await writeFile(join(soundDir(root, 'broken'), 'sound.yaml'), 'version: 1\nid: broken\n');

    const check = await checkSoundLibrary(root);

    expect(check.issues.map((issue) => [issue.kind, issue.id])).toEqual([
      ['invalid', 'broken'],
      ['missing-entry', 'loose.wav'],
    ]);
  });

  it('reports a swapped file that is silent instead of failing', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    const wav = soundWav(root, 'vine-boom');
    await rm(wav);
    execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'anullsrc=sample_rate=48000:duration=1', wav]);

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'invalid', id: 'vine-boom' })]);
    expect(check.remeasured).toEqual([]);
    const stored = await loadLibrarySound(root, 'vine-boom');
    expect(stored.length).toBeCloseTo(1.4, 1);
    expect(stored.hash).not.toBe(await hashFileStream(wav));
  });

  it('reports a file it cannot measure and still checks the others', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    await addLibrarySound(root, { file: tone(join(files, 'scratch.mp3'), 0.9, 660), title: 'Record Scratch', useWhen: 'everything stops' });
    await writeFile(soundWav(root, 'vine-boom'), 'not a wav at all');

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'invalid', id: 'vine-boom' })]);
    expect(check.issues[0]?.message).toMatch(/cannot be measured/);
    // The entry after the broken one is still checked.
    expect(check.remeasured).toEqual([]);
  });

  it('reports the same file under two ids, and measures neither', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal' });
    // A copy of the entry with a hand-edited id and a hash that no longer matches its file.
    await mkdir(soundDir(root, 'vine-boom-2'), { recursive: true });
    await copyFile(soundWav(root, 'vine-boom'), soundWav(root, 'vine-boom-2'));
    const copied = { ...(await loadLibrarySound(root, 'vine-boom')), id: 'vine-boom-2', hash: '0'.repeat(64) };
    await writeFile(join(soundDir(root, 'vine-boom-2'), 'sound.yaml'), stringify(copied));

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'duplicate', id: 'vine-boom-2' })]);
    expect(check.issues[0]?.message).toMatch(/"vine-boom"/);
    expect(check.remeasured).toEqual([]);
    expect((await loadLibrarySound(root, 'vine-boom-2')).hash).toBe('0'.repeat(64));
  });

  it('reports a trim that no longer fits', async () => {
    const { root, files } = await workspace();
    await addLibrarySound(root, { file: tone(join(files, 'boom.mp3'), 1.4), title: 'Vine Boom', useWhen: 'a dramatic reveal', trim: '0-1.3' });
    await rm(soundWav(root, 'vine-boom'));
    tone(soundWav(root, 'vine-boom'), 1.0, 550);

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'trim-outside', id: 'vine-boom' })]);
    expect(check.issues[0]?.message).toMatch(/trim/);
  });

  it('reports an id that is not the folder name, and skips the incoming folder of a running add', async () => {
    const { root, files } = await workspace();
    await mkdir(join(root, 'library', 'sounds', '.incoming-star'), { recursive: true });
    await copyFile(tone(join(files, 'boom.mp3'), 1.4), join(root, 'library', 'sounds', '.incoming-star', 'sound.wav'));
    await mkdir(soundDir(root, 'wrong-folder'), { recursive: true });
    await copyFile(tone(join(files, 'boom.mp3'), 1.4), soundWav(root, 'wrong-folder'));
    await writeFile(join(soundDir(root, 'wrong-folder'), 'sound.yaml'), stringify({ version: 1, id: 'other-name', title: 'Other', use_when: 'a reveal', length: 1.4, loudness: -18.5, licence: 'unknown', hash: 'a'.repeat(64), added: '2026-11-22T10:00:00.000Z' }));

    const check = await checkSoundLibrary(root);

    expect(check.issues).toEqual([expect.objectContaining({ kind: 'invalid', id: 'wrong-folder' })]);
    expect(check.issues[0]?.message).toMatch(/id must be the folder name/);
  });
});
