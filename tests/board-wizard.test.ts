import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { loadProject, lyricsSections, proposeTags } from '@coreslopper/core';
import {
  addReferenceFromPath,
  addReferenceLink,
  audioTarget,
  createEpisode,
  createSeriesCanon,
  createVideoProject,
  finishSetup,
  loadReferences,
  receiveUpload,
  removeReference,
  safeFileName,
  updateReference,
  videoWizardState,
  writeLyrics,
} from '../packages/cli/src/board-wizard.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-wizard-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  await writeFile(join(dir, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  return dir;
}

const VIDEO = { slug: 'glass-harbor', title: 'Glass Harbor', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock', language: 'en', rights: 'own song', license: 'all rights reserved' };

describe('lyrics tags', () => {
  it('proposes [Chorus] for repeated blocks and numbered verses for the rest, the same every time', () => {
    const text = 'Waves on the glass\nlights in the bay\n\nHold the harbor!\nhold the night\n\nWalls of water\n\nhold the harbor\nHold the night\n';
    const tagged = proposeTags(text);
    expect(lyricsSections(tagged).sections.map((section) => section.tag)).toEqual(['Verse 1', 'Chorus', 'Verse 2', 'Chorus']);
    expect(proposeTags(text)).toBe(tagged);
    // Tags the user wrote stay; lines before the first tag get an [Intro].
    expect(proposeTags('ooh\n[Verse 1]\nline')).toBe('[Intro]\nooh\n[Verse 1]\nline\n');
    expect(lyricsSections('one\n[Chorus]\ntwo').untagged).toEqual(['one']);
  });
});

describe('music-video wizard', () => {
  it('creates the project, keeps the lyrics as written, and finishes setup only with lyrics and song', async () => {
    const ws = await workspace();
    const dir = await createVideoProject(ws, VIDEO);
    expect(JSON.parse(await readFile(join(dir, 'song.json'), 'utf8'))).toEqual({ title: 'Glass Harbor', artist: 'Test Artist', language: 'en', license: 'all rights reserved', rights: 'own song' });
    await expect(createVideoProject(ws, { ...VIDEO, slug: 'Bad Slug' })).rejects.toThrow(/lowercase/);
    expect((await loadProject(dir)).config).not.toHaveProperty('distribution');
    const internal = await createVideoProject(ws, { ...VIDEO, slug: 'glass-harbor-teaser', internal: true });
    expect((await loadProject(internal)).config.distribution).toBe('internal');
    await expect(createVideoProject(ws, { ...VIDEO, slug: 'other', internal: 'yes' })).rejects.toThrow(/internal is true or false/);
    await expect(createVideoProject(ws, { ...VIDEO, slug: 'other', language: 'English' })).rejects.toThrow(/ISO code/);
    expect((await videoWizardState(dir)).missing).toEqual(['lyrics', 'song']);
    await expect(finishSetup(dir)).rejects.toThrow(/still missing: lyrics, song/);

    await expect(writeLyrics(dir, 'no tag here\n[Chorus]\nla')).rejects.toThrow(/before the first section tag/);
    await writeLyrics(dir, '[Verse 1]\r\nWaves on the glass\r\n\r\n[Chorus]\r\nHold the harbor (hold it)');
    expect(await readFile(join(dir, 'lyrics.txt'), 'utf8')).toBe('[Verse 1]\nWaves on the glass\n\n[Chorus]\nHold the harbor (hold it)\n');
    expect((await videoWizardState(dir)).missing).toEqual(['song']);

    // The song as import-song leaves it (the upload route runs import-song with ffmpeg).
    const song = JSON.parse(await readFile(join(dir, 'song.json'), 'utf8'));
    await writeFile(join(dir, 'song.json'), JSON.stringify({ ...song, path: 'audio/song.wav', duration: 8 }));
    await finishSetup(dir);
    const state = await videoWizardState(dir);
    expect(state.setupDone).toBe(true);
    expect((await loadProject(dir)).state.stage).toBe('brief');
  });

  it('streams an upload into place, refuses oversize bodies, and replaces an earlier song of another format', async () => {
    const ws = await workspace();
    const dir = await createVideoProject(ws, VIDEO);
    await writeFile(join(dir, 'audio', 'song.wav'), 'old');
    const target = await audioTarget(dir, 'song', 'Final Mix.MP3');
    expect(target).toBe(join(dir, 'audio', 'song.mp3'));
    expect(existsSync(join(dir, 'audio', 'song.wav'))).toBe(false);
    const request = (chunks: string[], headers: Record<string, string> = {}) => Object.assign(Readable.from(chunks.map((chunk) => Buffer.from(chunk))), { headers }) as never;
    expect(await receiveUpload(request(['ab', 'cd']), target, 10)).toBe(4);
    expect(await readFile(target, 'utf8')).toBe('abcd');
    await expect(receiveUpload(request(['0123456789', 'x']), join(dir, 'audio', 'big.mp3'), 10)).rejects.toThrow(/larger than/);
    expect(existsSync(join(dir, 'audio', 'big.mp3')) || existsSync(join(dir, 'audio', 'big.mp3.part'))).toBe(false);
    await expect(receiveUpload(request(['x'], { 'content-length': '99' }), join(dir, 'audio', 'big.mp3'), 10)).rejects.toThrow(/larger than/);
    await expect(audioTarget(dir, 'song', 'song.exe')).rejects.toThrow(/audio takes/);
  });

  it('keeps references in references.yaml with their files under assets/references/', async () => {
    const ws = await workspace();
    const dir = await createVideoProject(ws, VIDEO);
    const source = join(ws, 'Mood Board (1).PNG');
    await writeFile(source, 'png');
    const first = await addReferenceFromPath(dir, source, { kind: 'look', note: 'cold blue light' });
    const second = await addReferenceFromPath(dir, source, { kind: 'storyboard', subject: 'chorus' });
    expect([first.file, second.file]).toEqual(['assets/references/mood-board-1.png', 'assets/references/mood-board-1-2.png']);
    const link = await addReferenceLink(dir, { url: 'https://example.com/concept', kind: 'concept', title: 'Concept' });
    await expect(addReferenceLink(dir, { url: 'javascript:alert(1)', kind: 'concept' })).rejects.toThrow(/http/);
    await expect(addReferenceFromPath(dir, source, { kind: 'nope' })).rejects.toThrow(/kind must be/);
    await updateReference(dir, link.id, { note: 'the treatment draft', kind: 'concept' });
    await removeReference(dir, first.id);
    expect(existsSync(join(dir, first.file!))).toBe(false);
    const references = await loadReferences(dir);
    expect(references.references.map((reference) => [reference.kind, reference.file ?? reference.url, reference.note])).toEqual([
      ['storyboard', 'assets/references/mood-board-1-2.png', undefined],
      ['concept', 'https://example.com/concept', 'the treatment draft'],
    ]);
    await validateChangedFile(join(dir, 'references.yaml'));
    await rm(join(dir, second.file!));
    await expect(validateChangedFile(join(dir, 'references.yaml'))).rejects.toThrow(/is missing/);
    expect(safeFileName('../../Évil Name?.txt')).toBe('evil-name.txt');
  });
});

describe('series and episode wizard', () => {
  it('creates a canon and an episode whose setup is done, so /new-episode starts with the script', async () => {
    const ws = await workspace();
    const seriesDir = await createSeriesCanon(ws, { slug: 'night-ferry', title: 'Night Ferry', budget: 80, format: '9x16', imageProvider: 'mock', videoProvider: 'mock', audioProvider: 'mock' });
    await addReferenceLink(seriesDir, { url: 'https://example.com/captain', kind: 'character', subject: 'Captain' });
    await validateChangedFile(join(seriesDir, 'references.yaml'));
    await expect(createSeriesCanon(ws, { slug: 'x', title: 'X', budget: 10, format: '7x3', imageProvider: 'mock', videoProvider: 'mock', audioProvider: 'mock' })).rejects.toThrow(/format must be/);
    const episodeDir = await createEpisode(ws, { series: 'night-ferry', episode: 1, slug: 'night-ferry-01', budget: 10 });
    const project = await loadProject(episodeDir);
    expect(project.config).toMatchObject({ kind: 'episode', series: 'night-ferry', episode: 1 });
    expect(project.config).not.toHaveProperty('distribution');
    const internal = await createEpisode(ws, { series: 'night-ferry', episode: 2, slug: 'night-ferry-02', budget: 10, internal: true });
    expect((await loadProject(internal)).config.distribution).toBe('internal');
    expect(project.state.stages.setup?.status).toBe('done');
    expect(project.state.stage).toBe('script');
  });

  it('serves options and takes uploads only from the board page with a raw body', async () => {
    const ws = await workspace();
    await createVideoProject(ws, VIDEO);
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const call = (method: string, url: string, headers: Record<string, string>, body = '') =>
      new Promise<{ status: number; body: string }>((resolveDone) => {
        const chunks: Buffer[] = [];
        const req = Object.assign(Readable.from(body ? [Buffer.from(body)] : []), { method, url, headers: { host: '127.0.0.1:4848', ...headers } });
        const res = { statusCode: 200, setHeader() {}, writeHead(status: number) { this.statusCode = status; return this; }, write(chunk: Buffer) { chunks.push(Buffer.from(chunk)); return true; }, end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); resolveDone({ status: this.statusCode, body: Buffer.concat(chunks).toString('utf8') }); } };
        void handler(req as never, res as never);
      });
    const options = JSON.parse((await call('GET', '/api/new/options', {})).body);
    expect(options).toMatchObject({ minimumBudgetUsd: expect.any(Number), formats: ['16x9', '9x16', '1x1', '4x5'], slugs: ['glass-harbor'] });
    const url = '/api/upload/project/glass-harbor/reference?name=board.png&kind=storyboard';
    expect((await call('POST', url, { 'content-type': 'application/octet-stream' }, 'png')).status).toBe(403);
    expect((await call('POST', url, { 'content-type': 'text/plain', origin: 'http://127.0.0.1:4848' }, 'png')).status).toBe(403);
    expect((await call('POST', url, { 'content-type': 'application/octet-stream', origin: 'http://evil.example' }, 'png')).status).toBe(403);
    const ok = await call('POST', url, { 'content-type': 'application/octet-stream', origin: 'http://127.0.0.1:4848' }, 'png');
    expect(JSON.parse(ok.body)).toMatchObject({ kind: 'storyboard', file: 'assets/references/board.png' });
    expect((await call('POST', '/api/upload/series/glass-harbor/song?name=a.wav', { 'content-type': 'application/octet-stream', origin: 'http://127.0.0.1:4848' }, 'x')).status).toBe(400);
  });
});
