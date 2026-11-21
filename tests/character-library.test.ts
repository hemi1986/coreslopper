import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { parse } from 'yaml';
import { createSeriesCanon, createVideoProject } from '../packages/cli/src/board-wizard.ts';
import {
  addLibraryCharacter,
  addLibraryFile,
  entryDir,
  importCharacters,
  listLibrary,
  loadLibraryCharacter,
  removeLibraryFile,
  useCharacter,
} from '../packages/cli/src/character-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-library-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return dir;
}

async function video(ws: string, slug: string): Promise<string> {
  return createVideoProject(ws, { slug, title: slug, artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock', language: 'en', rights: 'own song', license: 'all rights reserved' });
}

async function put(dir: string, path: string, content: string): Promise<void> {
  await mkdir(join(dir, path, '..'), { recursive: true });
  await writeFile(join(dir, path), content);
}

/** A music video whose character bible has Nova (sheet, refs, two states) and a voice-only narrator without a file. */
async function withNova(ws: string, slug: string, files: Record<string, string> = {}): Promise<string> {
  const dir = await video(ws, slug);
  const contents = { 'seed.png': 'nova-seed', 'sheet-a.png': 'nova-sheet', 'outfit-a.png': 'nova-outfit', 'state-tired.png': 'nova-tired', 'state-soaked.png': 'nova-soaked', ...files };
  for (const [name, content] of Object.entries(contents)) await put(dir, `characters/nova/${name}`, content);
  await writeFile(
    join(dir, 'characters.yaml'),
    [
      'version: 1',
      'characters:',
      '  - id: nova',
      '    name: Nova',
      '    description: Courier in her late twenties, buzz cut, orange raincoat.',
      '    sheet: characters/nova/sheet-a.png',
      '    refs: [characters/nova/seed.png, characters/nova/outfit-a.png, characters/nova/sheet-a.png]',
      '    prompt: woman in her late twenties, buzz cut, orange raincoat',
      '    states:',
      '      - id: tired',
      '        description: Rings under the eyes, coat open.',
      '        ref: characters/nova/state-tired.png',
      '        use: Verse 2',
      '      - id: soaked',
      '        description: Wet through after the storm.',
      '        ref: characters/nova/state-soaked.png',
      '        from: tired',
      '  - id: narrator',
      '    name: Narrator',
      '    description: A calm voice from nowhere.',
      '    face: voice-only',
      '',
    ].join('\n'),
  );
  return dir;
}

describe('character library import', () => {
  it('takes every character with files into the library, keeps state notes, and is idempotent', async () => {
    const ws = await workspace();
    const dir = await withNova(ws, 'night-run');
    const results = await importCharacters(ws, dir, { now: new Date('2026-11-21T10:00:00Z') });
    expect(results).toEqual([{ character: 'nova', id: 'nova', created: true, added: expect.arrayContaining(['seed.png', 'state:tired']), missing: [] }]);
    const entry = await loadLibraryCharacter(ws, 'nova');
    expect(entry).toMatchObject({ sheet: 'sheet-a.png', refs: ['seed.png', 'outfit-a.png'], origin: 'projects/night-run', history: [] });
    expect(entry.states.map((state) => [state.id, state.ref, state.from])).toEqual([['tired', 'state-tired.png', undefined], ['soaked', 'state-soaked.png', 'tired']]);
    expect((entry.states[0] as Record<string, unknown>).use).toBe('Verse 2');
    expect(await validateChangedFile(join(entryDir(ws, 'nova'), 'character.yaml'))).toBe('library character');

    expect(await importCharacters(ws, dir)).toEqual([{ character: 'nova', id: 'nova', created: false, added: [], missing: [] }]);
    expect((await loadLibraryCharacter(ws, 'nova')).history).toEqual([]);
  });

  it('merges a same-id character that shares a file and keeps an unrelated one apart', async () => {
    const ws = await workspace();
    await importCharacters(ws, await withNova(ws, 'night-run'));
    // The same Nova in a second video: same seed, a new outfit, and its own "tired".
    const second = await withNova(ws, 'day-run', { 'outfit-b.png': 'nova-outfit-b', 'state-tired.png': 'nova-tired-2' });
    const yaml = (await readFile(join(second, 'characters.yaml'), 'utf8')).replace('characters/nova/outfit-a.png, ', 'characters/nova/outfit-a.png, characters/nova/outfit-b.png, ');
    await writeFile(join(second, 'characters.yaml'), yaml);
    const [merged] = await importCharacters(ws, second, { now: new Date('2026-11-22T10:00:00Z') });
    expect(merged).toMatchObject({ id: 'nova', created: false, added: ['outfit-b.png', 'state-tired-2.png', 'state:tired-day-run'] });
    const entry = await loadLibraryCharacter(ws, 'nova');
    expect(entry.refs).toEqual(['seed.png', 'outfit-a.png', 'outfit-b.png']);
    expect(entry.history).toEqual([{ at: '2026-11-22T10:00:00.000Z', from: 'projects/day-run', added: ['outfit-b.png', 'state-tired-2.png', 'state:tired-day-run'] }]);

    // Another Nova with nothing in common becomes her own entry.
    const other = await withNova(ws, 'other-nova', { 'seed.png': 'x1', 'sheet-a.png': 'x2', 'outfit-a.png': 'x3', 'state-tired.png': 'x4', 'state-soaked.png': 'x5' });
    expect((await importCharacters(ws, other))[0]).toMatchObject({ id: 'nova-other-nova', created: true });
    // --into puts it into the given entry instead.
    const into = await withNova(ws, 'into-nova', { 'seed.png': 'y1' });
    expect((await importCharacters(ws, into, { character: 'nova', into: 'nova' }))[0]).toMatchObject({ id: 'nova', created: false, added: ['seed-2.png'] });
  });
});

describe('using a library character', () => {
  it('copies identity and the chosen states into a project, adds more on a second use, and refuses clashes and episodes', async () => {
    const ws = await workspace();
    await importCharacters(ws, await withNova(ws, 'night-run'));
    const target = await video(ws, 'new-song');
    const first = await useCharacter(ws, target, 'nova', { states: ['soaked'] });
    expect(first).toEqual({ character: 'nova', updated: false, files: expect.arrayContaining(['characters/nova/sheet-a.png', 'characters/nova/state-soaked.png']), states: ['soaked'] });
    expect(existsSync(join(target, 'characters/nova/state-tired.png'))).toBe(false);
    const bible = parse(await readFile(join(target, 'characters.yaml'), 'utf8'));
    expect(bible.characters[0]).toMatchObject({ id: 'nova', library: 'nova', sheet: 'characters/nova/sheet-a.png', refs: ['characters/nova/seed.png', 'characters/nova/outfit-a.png'] });
    // "soaked" derives from "tired", which did not come along.
    expect(bible.characters[0].states).toEqual([{ id: 'soaked', description: 'Wet through after the storm.', ref: 'characters/nova/state-soaked.png' }]);
    expect(await validateChangedFile(join(target, 'characters.yaml'))).toBe('characters');

    const second = await useCharacter(ws, target, 'nova', { states: 'all' });
    expect(second).toMatchObject({ updated: true, files: ['characters/nova/state-tired.png'], states: ['tired'] });
    // night-run made Nova; only projects that took her from the library use her.
    expect((await listLibrary(ws)).characters[0]!.usedIn).toEqual([{ scope: 'project', slug: 'new-song', character: 'nova' }]);

    await expect(useCharacter(ws, target, 'nova', { states: ['wet'] })).rejects.toThrow(/no state wet/);
    const clash = await withNova(ws, 'clash');
    await expect(useCharacter(ws, clash, 'nova')).rejects.toThrow(/its own character "nova"/);

    await createSeriesCanon(ws, { slug: 'harbor', title: 'Harbor', budget: 50, format: '9x16', imageProvider: 'mock', videoProvider: 'mock', audioProvider: 'mock' } as never);
    expect((await useCharacter(ws, join(ws, 'series', 'harbor'), 'nova')).files.length).toBe(3);
    const episode = await video(ws, 'harbor-01');
    await writeFile(join(episode, 'project.yaml'), `${await readFile(join(episode, 'project.yaml'), 'utf8')}kind: episode\n`);
    await expect(useCharacter(ws, episode, 'nova')).rejects.toThrow(/series canon/);
  });

  it('imports a character taken from the library back into its own entry', async () => {
    const ws = await workspace();
    await importCharacters(ws, await withNova(ws, 'night-run'));
    const target = await video(ws, 'new-song');
    await useCharacter(ws, target, 'nova');
    // The new video's character bible gives her a new state.
    await put(target, 'characters/nova/state-glow.png', 'nova-glow');
    const yaml = (await readFile(join(target, 'characters.yaml'), 'utf8')).replace('library: nova', 'library: nova\n    states:\n      - id: glow\n        description: Neon reflections on the coat.\n        ref: characters/nova/state-glow.png');
    await writeFile(join(target, 'characters.yaml'), yaml);
    const [result] = await importCharacters(ws, target);
    expect(result).toMatchObject({ id: 'nova', created: false, added: ['state-glow.png', 'state:glow'] });
    expect((await readdir(join(ws, 'library', 'characters'))).sort()).toEqual(['nova']);
  });
});

describe('manual library characters', () => {
  it('creates an entry, takes sheet, references, and voice, and drops a file again', async () => {
    const ws = await workspace();
    const files = await mkdtemp(join(tmpdir(), 'coreslopper-library-files-'));
    temporary.push(files);
    for (const name of ['Front View.PNG', 'side.png', 'voice.wav', 'notes.txt']) await writeFile(join(files, name), name);
    const entry = await addLibraryCharacter(ws, { name: 'Captain Öz', description: 'Ferry captain, grey beard.', tags: 'captain, sea' });
    expect(entry).toMatchObject({ id: 'captain-oz', origin: 'manual', tags: ['captain', 'sea'] });
    await expect(addLibraryCharacter(ws, { name: 'Captain Oz', description: 'again' })).rejects.toThrow(/already/);
    await addLibraryFile(ws, 'captain-oz', join(files, 'Front View.PNG'), 'sheet');
    await addLibraryFile(ws, 'captain-oz', join(files, 'side.png'), 'ref');
    await expect(addLibraryFile(ws, 'captain-oz', join(files, 'voice.wav'), 'voice')).rejects.toThrow(/transcript is required/);
    await addLibraryFile(ws, 'captain-oz', join(files, 'voice.wav'), 'voice', 'All aboard.');
    await expect(addLibraryFile(ws, 'captain-oz', join(files, 'notes.txt'), 'ref')).rejects.toThrow(/takes .png/);
    expect(await loadLibraryCharacter(ws, 'captain-oz')).toMatchObject({ sheet: 'front-view.png', refs: ['side.png'], voice: { ref: 'voice.wav', transcript: 'All aboard.' } });
    expect(existsSync(join(entryDir(ws, 'captain-oz'), 'notes.txt'))).toBe(false);
    expect(await validateChangedFile(join(entryDir(ws, 'captain-oz'), 'character.yaml'))).toBe('library character');

    await removeLibraryFile(ws, 'captain-oz', 'side.png');
    expect((await loadLibraryCharacter(ws, 'captain-oz')).refs).toEqual([]);
    expect(existsSync(join(entryDir(ws, 'captain-oz'), 'side.png'))).toBe(false);
    await expect(removeLibraryFile(ws, 'captain-oz', '../character.yaml')).rejects.toThrow(/name a file/);
  });
});

describe('board library routes', () => {
  it('lists the library with targets, uses a character, and never serves character.yaml', async () => {
    const ws = await workspace();
    await importCharacters(ws, await withNova(ws, 'night-run'));
    await video(ws, 'new-song');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const call = (method: string, url: string, body?: unknown) =>
      new Promise<{ status: number; body: string }>((resolveDone) => {
        const chunks: Buffer[] = [];
        const payload = body === undefined ? [] : [Buffer.from(JSON.stringify(body))];
        const headers = { host: '127.0.0.1:4848', ...(body === undefined ? {} : { 'content-type': 'application/json', origin: 'http://127.0.0.1:4848' }) };
        const req = Object.assign(Readable.from(payload), { method, url, headers });
        const res = { statusCode: 200, setHeader() {}, writeHead(status: number) { this.statusCode = status; return this; }, write(chunk: Buffer) { chunks.push(Buffer.from(chunk)); return true; }, end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); resolveDone({ status: this.statusCode, body: Buffer.concat(chunks).toString('utf8') }); } };
        void handler(req as never, res as never);
      });
    const listing = JSON.parse((await call('GET', '/api/library')).body);
    expect(listing.characters.map((entry: { id: string; cover: string }) => [entry.id, entry.cover])).toEqual([['nova', 'sheet-a.png']]);
    expect(listing.targets).toEqual([{ scope: 'project', slug: 'new-song', title: 'new-song' }, { scope: 'project', slug: 'night-run', title: 'night-run' }]);
    const used = JSON.parse((await call('POST', '/api/library/use', { scope: 'project', slug: 'new-song', id: 'nova', states: ['tired'] })).body);
    expect(used.result).toMatchObject({ character: 'nova', states: ['tired'] });
    expect(used.characters[0].usedIn).toEqual([{ scope: 'project', slug: 'new-song', character: 'nova' }]);
    expect((await call('POST', '/api/library/use', { scope: 'project', slug: '../x', id: 'nova' })).status).toBe(400);
    expect((await call('GET', '/library-files/nova/character.yaml')).status).toBe(403);
    expect((await call('POST', '/api/library/nova', { action: 'delete' })).status).toBe(200);
    expect(existsSync(join(ws, 'library', 'characters', 'nova'))).toBe(false);
    expect(existsSync(join(ws, 'projects', 'new-song', 'characters', 'nova', 'sheet-a.png'))).toBe(true);
  });
});
