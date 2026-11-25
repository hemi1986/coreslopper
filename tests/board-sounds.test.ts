// The board's Sounds view (ST-018): the sound library over the commands of ST-001 to ST-003, and the write guard.
import { afterEach, describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { stringify } from 'yaml';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { loadLibrarySound, soundDir } from '../packages/cli/src/sound-library.ts';

const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'coreslopper-board-sounds-'));
  temporary.push(root);
  return root;
}

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

interface Answer { status: number; headers: Record<string, unknown>; body: string }

function board(root: string) {
  const handler = boardHandler({ root, refresh: async () => undefined });
  const call = (method: string, url: string, body?: unknown, headers: Record<string, string> = {}): Promise<Answer> =>
    new Promise((done) => {
      const raw = body === undefined ? undefined : Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body);
      const requestHeaders = {
        host: '127.0.0.1:4848',
        ...(raw === undefined ? {} : { 'content-type': 'application/json', origin: 'http://127.0.0.1:4848' }),
        ...headers,
      };
      const req = Object.assign(Readable.from(raw === undefined ? [] : [Buffer.from(raw)]), { method, url, headers: requestHeaders });
      const chunks: Buffer[] = [];
      const res = {
        statusCode: 200,
        headers: {} as Record<string, unknown>,
        setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; },
        writeHead(status: number, head: Record<string, unknown> = {}) { this.statusCode = status; Object.assign(this.headers, head); return this; },
        write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
        end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') }); },
        on() { return this; }, once() { return this; }, emit() { return true; }, removeListener() { return this; },
      };
      void handler(req as never, res as never);
    });
  return { call };
}

const entry = (id: string, fields: Record<string, unknown> = {}) => ({
  version: 1,
  id,
  title: id === 'vine-boom' ? 'Vine Boom' : 'Record Scratch',
  use_when: id === 'vine-boom' ? 'a dramatic reveal' : 'everything stops',
  tags: id === 'vine-boom' ? ['reveal', 'impact'] : ['stop'],
  length: 1.4,
  loudness: -18.5,
  licence: 'unknown',
  hash: (id === 'vine-boom' ? 'a' : 'b').repeat(64),
  added: '2026-11-22T10:00:00.000Z',
  ...fields,
});

/** A library entry written by hand: the routes only read the files, no ffmpeg needed. */
async function hold(root: string, id: string, fields: Record<string, unknown> = {}): Promise<void> {
  await mkdir(soundDir(root, id), { recursive: true });
  await writeFile(join(soundDir(root, id), 'sound.wav'), 'RIFF');
  await writeFile(join(soundDir(root, id), 'sound.yaml'), stringify(entry(id, fields)));
}

/** The meme "office-prank" took "vine-boom", so the listing and the remove warn name it. */
async function meme(root: string, slug = 'office-prank'): Promise<void> {
  const folder = join(root, 'projects', slug);
  await mkdir(folder, { recursive: true });
  await writeFile(join(folder, 'project.yaml'), `version: 1\nslug: ${slug}\n`);
  await writeFile(join(folder, 'takes.json'), JSON.stringify({ version: 1, takes: { 'reveal-boom': { source: 'library:vine-boom', duration: 1.2, text_hash: 'x' } }, ambience: {} }));
}

describe('the board’s Sounds view', () => {
  it('lists every library sound with its description and where it is used, and serves only its WAV', async () => {
    const root = await workspace();
    await hold(root, 'vine-boom', { cue: 0.12 });
    await hold(root, 'record-scratch');
    await meme(root);
    const { call } = board(root);

    const listing = JSON.parse((await call('GET', '/api/sounds')).body);
    expect(listing.errors).toEqual([]);
    expect(listing.sounds.map((sound: { id: string }) => sound.id)).toEqual(['record-scratch', 'vine-boom']);
    expect(listing.sounds[1]).toMatchObject({ id: 'vine-boom', title: 'Vine Boom', use_when: 'a dramatic reveal', tags: ['reveal', 'impact'], length: 1.4, licence: 'unknown', cue: 0.12, used_in: ['office-prank'] });

    const wav = await call('GET', '/sound-files/vine-boom/sound.wav');
    expect(wav.status).toBe(200);
    expect(wav.headers['content-type']).toBe('audio/wav');
    expect(wav.headers['content-security-policy']).toContain('sandbox');
    expect((await call('GET', '/sound-files/vine-boom/sound.yaml')).status).toBe(403);
    expect((await call('GET', '/sound-files/vine-boom/.hidden.wav')).status).toBe(403);
    expect((await call('GET', '/sound-files/unknown/sound.wav')).status).toBe(404);
  });

  it('edits a sound through the update command and shows its refusals', async () => {
    const root = await workspace();
    await hold(root, 'vine-boom', { cue: 0.12 });
    const { call } = board(root);

    const updated = await call('POST', '/api/sounds/vine-boom', { action: 'update', useWhen: 'a shocking twist', tags: 'reveal, shock', cue: 0.3 });
    expect(updated.status).toBe(200);
    expect(JSON.parse(updated.body).sounds[0]).toMatchObject({ use_when: 'a shocking twist', tags: ['reveal', 'shock'], cue: 0.3 });
    expect(await loadLibrarySound(root, 'vine-boom')).toMatchObject({ title: 'Vine Boom', use_when: 'a shocking twist', cue: 0.3 });

    // A refused edit names the reason and keeps the entry as it was.
    const empty = await call('POST', '/api/sounds/vine-boom', { action: 'update', useWhen: '  ' });
    expect(empty.status).toBe(400);
    expect(JSON.parse(empty.body).error).toMatch(/needs a use when/);
    const outside = await call('POST', '/api/sounds/vine-boom', { action: 'update', cue: 4 });
    expect(outside.status).toBe(400);
    expect(JSON.parse(outside.body).error).toMatch(/cue 4 lies outside/);
    expect(await loadLibrarySound(root, 'vine-boom')).toMatchObject({ use_when: 'a shocking twist', cue: 0.3 });

    // An empty optional value clears it; an unknown action is refused.
    expect((await call('POST', '/api/sounds/vine-boom', { action: 'update', cue: '' })).status).toBe(200);
    expect(await loadLibrarySound(root, 'vine-boom')).not.toHaveProperty('cue', 0.3);
    expect((await call('POST', '/api/sounds/vine-boom', { action: 'rename' })).status).toBe(400);
  });

  it('deletes a sound through the remove command and names the memes that keep their take', async () => {
    const root = await workspace();
    await hold(root, 'vine-boom');
    await hold(root, 'record-scratch');
    await meme(root);
    const { call } = board(root);

    const removed = await call('POST', '/api/sounds/vine-boom', { action: 'delete' });

    expect(removed.status).toBe(200);
    expect(JSON.parse(removed.body).sounds.map((sound: { id: string }) => sound.id)).toEqual(['record-scratch']);
    expect(existsSync(join(root, 'library', 'sounds', 'vine-boom'))).toBe(false);
    expect(existsSync(join(root, 'projects', 'office-prank', 'takes.json'))).toBe(true);
    expect((await call('POST', '/api/sounds/vine-boom', { action: 'delete' })).status).toBe(400);
  });

  it('passes the board’s write guard for an edit and for an upload', async () => {
    const root = await workspace();
    await hold(root, 'vine-boom');
    const { call } = board(root);
    const foreign = { host: 'rebound.example:4848' };

    const edit = await call('POST', '/api/sounds/vine-boom', { action: 'delete' }, foreign);
    expect(edit.status).toBe(403);
    expect(JSON.parse(edit.body).error).toMatch(/127\.0\.0\.1 only/);
    const upload = await call('POST', '/api/upload/sounds?name=boom.mp3&title=Boom&use-when=a%20reveal', 'not audio', { ...foreign, 'content-type': 'application/octet-stream', origin: 'http://rebound.example:4848' });
    expect(upload.status).toBe(403);
    expect(existsSync(soundDir(root, 'vine-boom'))).toBe(true);
    expect(existsSync(soundDir(root, 'boom'))).toBe(false);
  });

  it.skipIf(!hasFfmpeg())('uploads a file through the add command and keeps the typed fields on a refusal', async () => {
    const root = await workspace();
    const incoming = join(root, 'incoming');
    await mkdir(incoming);
    const file = join(incoming, 'boom.mp3');
    execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.4', file]);
    const bytes = await readFile(file);
    const { call } = board(root);
    const upload = (query: string, body: Buffer | string) =>
      call('POST', '/api/upload/sounds' + query, body, { 'content-type': 'application/octet-stream', origin: 'http://127.0.0.1:4848' });

    const added = await upload('?name=boom.mp3&title=Vine%20Boom&use-when=a%20dramatic%20reveal&cue=0.12&tags=reveal', bytes);
    expect(added.status).toBe(200);
    const created = JSON.parse(added.body).sound;
    expect(created).toMatchObject({ id: 'vine-boom', title: 'Vine Boom', use_when: 'a dramatic reveal', cue: 0.12, tags: ['reveal'], licence: 'unknown' });
    expect(created.length).toBeCloseTo(1.4, 1);
    expect(JSON.parse(added.body).sounds[0].id).toBe('vine-boom');

    // A taken id, a missing title and a file that is not audio are refused with their reason and add nothing.
    const taken = await upload('?name=boom.mp3&title=Vine%20Boom&use-when=again', bytes);
    expect(taken.status).toBe(400);
    expect(JSON.parse(taken.body).error).toMatch(/id "vine-boom" is taken/);
    const untitled = await upload('?name=other.mp3&use-when=a%20reveal', bytes);
    expect(untitled.status).toBe(400);
    expect(JSON.parse(untitled.body).error).toMatch(/needs a title/);
    const notAudio = await upload('?name=notes.mp3&title=Notes&use-when=nothing', 'not audio at all');
    expect(notAudio.status).toBe(400);
    expect(JSON.parse(notAudio.body).error).toMatch(/not an audio file/);

    const listing = JSON.parse((await call('GET', '/api/sounds')).body);
    expect(listing.sounds.map((sound: { id: string }) => sound.id)).toEqual(['vine-boom']);
  });
});
