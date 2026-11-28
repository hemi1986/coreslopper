// The Sounds list (ST-062, UX guidelines G4/G5): packages/cli/src/board/sounds.js with the shared list state of
// packages/cli/src/board/list-state.js. No DOM library is installed, so a small fake document stands in for the page,
// as in board-sets.test.ts; the data is what /api/sounds answers for a fixture workspace.
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { stringify } from 'yaml';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { soundDir } from '../packages/cli/src/sound-library.ts';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  value = '';
  checked = false;
  style = {};
  // The audio element's side: what it plays and whether it plays.
  src = '';
  currentTime = 0;
  paused = true;
  listeners = new Map<string, ((event: unknown) => unknown)[]>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  set innerHTML(_value: string) { this.children = []; this.textContent = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(type: string, fn: (event: unknown) => unknown) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  fire(type: string, event: Record<string, unknown> = {}) { for (const fn of this.listeners.get(type) ?? []) fn({ target: this, stopPropagation() {}, ...event }); }
  play() { this.paused = false; return Promise.resolve(); }
  pause() { this.paused = true; }
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) this.children.push(child);
    else this.textContent += child.data;
    return child;
  }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(''); }
  has(name: string) { return this.className.split(' ').includes(name); }
}

interface ListState { q: string; tag: string[]; unused: boolean; origin: string; sort: string; dir: string }
interface Item { id: string; name: string; error?: string }
interface SoundList { items: Item[]; errors: Item[] }
interface Sounds {
  soundItems(data: unknown): SoundList;
  parseSoundState(query: string, list: SoundList): ListState;
  soundHash(state: ListState): string;
  soundRows(list: SoundList, state: ListState): Item[];
  showSounds(id?: string): Promise<void>;
  SOUNDS_ROUTE: RegExp;
}
interface SoundEntry { id: string; title: string; licence: string; used_in: string[] }

let view: Sounds;
let main: FakeElement;
let hash = '';
let sounds: unknown;
const empty = { sounds: [], errors: [] };
let ws = '';

/** GET a board route of the fixture workspace through the real handler. */
function get(url: string): Promise<unknown> {
  const handler = boardHandler({ root: ws, refresh: async () => undefined });
  return new Promise((done) => {
    const req = Object.assign(Readable.from([]), { method: 'GET', url, headers: { host: '127.0.0.1:4848' } });
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader() {}, writeHead(status: number) { this.statusCode = status; return this; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
      end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done(JSON.parse(Buffer.concat(chunks).toString('utf8'))); },
      on() { return this; }, once() { return this; }, emit() { return true; }, removeListener() { return this; },
    };
    void handler(req as never, res as never);
  });
}

/** A library entry written by hand: the list only reads the files, no ffmpeg needed. */
async function hold(id: string, fields: Record<string, unknown>, hashChar: string): Promise<void> {
  await mkdir(soundDir(ws, id), { recursive: true });
  await writeFile(join(soundDir(ws, id), 'sound.wav'), 'RIFF');
  await writeFile(join(soundDir(ws, id), 'sound.yaml'), stringify({
    version: 1, id, tags: [], loudness: -18, licence: 'unknown', hash: hashChar.repeat(64), added: '2026-11-22T10:00:00.000Z', ...fields,
  }));
}

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (data: string) => ({ data }),
    getElementById: (id: string) => (id === 'main' ? main : null),
    documentElement: new FakeElement('html'),
  });
  vi.stubGlobal('location', { get hash() { return hash; }, set hash(value: string) { hash = value; } });
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => { hash = url; } });
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => (path === '/api/sounds' ? sounds : {}) }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  view = (await import('../packages/cli/src/board/sounds.js')) as Sounds;

  // The fixture workspace: four sounds, two of unknown licence, one trimmed; a meme took the Vine Boom and the Sting;
  // one entry does not load.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-sound-list-'));
  await hold('vine-boom', { title: 'Vine Boom', use_when: 'a dramatic reveal', tags: ['reveal', 'impact'], length: 1.4 }, 'a');
  await hold('record-scratch', { title: 'Record Scratch', use_when: 'everything stops', tags: ['stop'], length: 0.9 }, 'b');
  await hold('clap-track', { title: 'Clap Track', use_when: 'Wenn das Publikum in Applaus ausbricht', tags: ['crowd'], length: 3, trim: { start: 0.5, end: 2.5 }, licence: 'CC0' }, 'c');
  await hold('sting', { title: 'Sting', use_when: 'a sudden twist', tags: ['reveal'], length: 2.2, licence: 'CC-BY-4.0' }, 'd');
  await mkdir(join(ws, 'library', 'sounds', 'broken'), { recursive: true });
  await writeFile(join(ws, 'library', 'sounds', 'broken', 'sound.wav'), 'RIFF');
  await writeFile(join(ws, 'library', 'sounds', 'broken', 'sound.yaml'), 'version: 1\ntitle: [\n');
  const meme = join(ws, 'projects', 'office-prank');
  await mkdir(meme, { recursive: true });
  await writeFile(join(meme, 'project.yaml'), 'version: 1\nslug: office-prank\n');
  await writeFile(join(meme, 'takes.json'), JSON.stringify({ version: 1, takes: {
    'reveal-boom': { source: 'library:vine-boom', duration: 1.2, text_hash: 'x' },
    twist: { source: 'library:sting', duration: 2.2, text_hash: 'y' },
  }, ambience: {} }));
  sounds = await get('/api/sounds');
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); });

const list = () => view.soundItems(sounds);
const titles = (query = '') => view.soundRows(list(), view.parseSoundState(query, list())).map((item) => item.name);
async function open(address: string, data: unknown = sounds) {
  sounds = data;
  hash = address;
  await view.showSounds();
}
const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const bodyRows = () => find((e) => e.tagName === 'TBODY')[0]?.children ?? [];
const rowIds = () => bodyRows().map((r) => r.getAttribute('data-id'));
const header = (text: string) => find((e) => e.tagName === 'TH' && e.text().startsWith(text))[0]!;
const rowOf = (id: string) => bodyRows().find((r) => r.getAttribute('data-id') === id)!;
const playButton = (id: string) => rowOf(id).children[0]!.children[0]!;
const audio = () => find((e) => e.tagName === 'AUDIO')[0]!;

describe('the Sounds list', () => {
  it('shows every library sound of a fixture workspace by title, with length, licence, tags and used-in count', async () => {
    await open('#/sounds');
    expect(rowIds()).toEqual(['clap-track', 'record-scratch', 'sting', 'vine-boom', 'broken']);
    expect(find((e) => e.tagName === 'TH').map((e) => e.text())).toEqual(['', 'Title ▲', 'Use when', 'Length', 'Licence', 'Tags', 'Used in']);
    const cells = (id: string) => rowOf(id).children;
    expect(cells('vine-boom').slice(1).map((c) => c.text())).toEqual(['Vine Boomvine-boom', 'a dramatic reveal', '1.4 s', 'unknown', '#reveal #impact', '1']);
    // The length is the trimmed one.
    expect(cells('clap-track').slice(3).map((c) => c.text())).toEqual(['2 s', 'CC0', '#crowd', '0']);
    expect(cells('vine-boom')[2]!.has('sd-use')).toBe(true);
    // An unreadable entry is a row with its error.
    expect(cells('broken')[2]!.has('error')).toBe(true);
    expect(cells('broken')[2]!.text()).not.toBe('');
  });

  it('opens a row as the sound\'s page, and its back link returns to the list with its filters', async () => {
    await open('#/sounds?unused=1');
    rowOf('clap-track').fire('click');
    expect(hash).toBe('#/sounds/clap-track');
    main = new FakeElement('main');
    await view.showSounds('clap-track');
    expect(find((e) => e.has('back-link'))[0]!.getAttribute('href')).toBe('#/sounds?unused=1');
  });

  it('searching "applaus" finds a sound whose use-when mentions "Applaus", while typing', async () => {
    expect(titles('q=applaus')).toEqual(['Clap Track']);
    expect(titles('q=REVEAL')).toEqual(['Sting', 'Vine Boom']);
    expect(titles('q=scratch')).toEqual(['Record Scratch']);
    await open('#/sounds');
    const search = find((e) => e.has('pl-search'))[0]!;
    search.value = 'applaus';
    search.fire('input');
    expect(rowIds()).toEqual(['clap-track']);
    expect(hash).toBe('#/sounds?q=applaus');
  });

  it('filters licence unknown: exactly the sounds of unknown licence', async () => {
    const unknown = (sounds as { sounds: SoundEntry[] }).sounds.filter((s) => s.licence === 'unknown').map((s) => s.title).sort();
    expect(unknown).toEqual(['Record Scratch', 'Vine Boom']);
    expect(titles('licence=unknown')).toEqual(unknown);
    expect(titles('licence=CC0')).toEqual(['Clap Track']);
    await open('#/sounds');
    const licence = find((e) => e.has('sd-licence'))[0]!;
    expect(licence.children.map((o) => o.getAttribute('value'))).toEqual(['', 'CC-BY-4.0', 'CC0', 'unknown']);
    licence.value = 'unknown';
    licence.fire('change');
    expect(rowIds()).toEqual(['record-scratch', 'vine-boom']);
    expect(hash).toBe('#/sounds?licence=unknown');
  });

  it('filters unused: exactly the sounds no meme took, and combines filters with "and", tags with "or"', async () => {
    const unused = (sounds as { sounds: SoundEntry[] }).sounds.filter((s) => !s.used_in.length).map((s) => s.title).sort();
    expect(unused).toEqual(['Clap Track', 'Record Scratch']);
    expect(titles('unused=1')).toEqual(unused);
    expect(titles('unused=1&licence=unknown')).toEqual(['Record Scratch']);
    expect(titles('tag=stop,crowd')).toEqual(['Clap Track', 'Record Scratch']);
    expect(titles('tag=reveal&licence=unknown')).toEqual(['Vine Boom']);
    await open('#/sounds');
    find((e) => e.has('sd-unused'))[0]!.fire('click');
    expect(rowIds()).toEqual(['clap-track', 'record-scratch']);
    expect(hash).toBe('#/sounds?unused=1');
  });

  it('sorts by a column header and reverses on the second click', async () => {
    await open('#/sounds');
    header('Length').fire('click');
    expect(rowIds().slice(0, 4)).toEqual(['sting', 'clap-track', 'vine-boom', 'record-scratch']);
    expect(hash).toBe('#/sounds?sort=length');
    header('Length').fire('click');
    expect(rowIds().slice(0, 4)).toEqual(['record-scratch', 'vine-boom', 'clap-track', 'sting']);
    expect(hash).toBe('#/sounds?sort=length&dir=asc');
    header('Licence').fire('click');
    expect(rowIds().slice(0, 4)).toEqual(['sting', 'clap-track', 'record-scratch', 'vine-boom']);
    header('Used in').fire('click');
    expect(rowIds().slice(0, 2)).toEqual(['sting', 'vine-boom']);
    header('Title').fire('click');
    expect(rowIds().slice(0, 4)).toEqual(['clap-track', 'record-scratch', 'sting', 'vine-boom']);
    header('Title').fire('click');
    expect(rowIds().slice(0, 4)).toEqual(['vine-boom', 'sting', 'record-scratch', 'clap-track']);
    expect(hash).toBe('#/sounds?dir=desc');
  });

  it('restores #/sounds?licence=unknown&sort=length&dir=desc after a reload, and ignores unknown values', async () => {
    await open('#/sounds?licence=unknown&sort=length&dir=desc');
    expect(rowIds()).toEqual(['vine-boom', 'record-scratch']);
    expect(find((e) => e.has('sd-licence'))[0]!.value).toBe('unknown');
    expect(header('Length').text()).toBe('Length ▼');
    expect(view.soundHash(view.parseSoundState('licence=unknown&sort=length&dir=desc', list()))).toBe('#/sounds?licence=unknown&sort=length');
    expect(view.parseSoundState('tag=nope&licence=GPL&origin=unknown&sort=bogus&dir=up&unused=yes', list()))
      .toEqual({ q: '', tag: [], unused: false, origin: '', sort: 'title', dir: 'asc' });
    expect(view.SOUNDS_ROUTE.test('#/sounds?q=a&unused=1')).toBe(true);
    expect(view.SOUNDS_ROUTE.test('#/sounds/vine-boom')).toBe(false);
  });

  it('plays the trimmed sound in the row, stops it on a second click, and another row stops the first', async () => {
    await open('#/sounds');
    const player = audio();
    expect(playButton('clap-track').getAttribute('aria-label')).toBe('Play');
    playButton('clap-track').fire('click');
    expect(hash).toBe('#/sounds');
    expect(player.paused).toBe(false);
    expect(player.src).toBe('/sound-files/clap-track/sound.wav#t=0.5,2.5');
    expect(player.currentTime).toBe(0.5);
    expect(playButton('clap-track').has('on')).toBe(true);
    expect(playButton('clap-track').getAttribute('aria-label')).toBe('Stop');
    // A pause queued by the first sound does not reset the second one.
    playButton('vine-boom').fire('click');
    player.fire('pause');
    expect(player.paused).toBe(false);
    expect(player.src).toBe('/sound-files/vine-boom/sound.wav');
    expect(playButton('clap-track').has('on')).toBe(false);
    expect(playButton('vine-boom').has('on')).toBe(true);
    // A redraw of the rows keeps the playing row.
    const search = find((e) => e.has('pl-search'))[0]!;
    search.value = 'boom';
    search.fire('input');
    expect(playButton('vine-boom').has('on')).toBe(true);
    playButton('vine-boom').fire('click');
    expect(player.paused).toBe(true);
    expect(playButton('vine-boom').has('on')).toBe(false);
    // The trim's end stops a trimmed sound.
    search.value = '';
    search.fire('input');
    playButton('clap-track').fire('click');
    player.currentTime = 2.5;
    player.fire('timeupdate');
    expect(player.paused).toBe(true);
    expect(playButton('clap-track').has('on')).toBe(false);
  });

  it('shows the no-match text, and Reset filters clears search and filters', async () => {
    await open('#/sounds?q=nowhere&licence=unknown&unused=1');
    expect(bodyRows()).toEqual([]);
    expect(find((e) => e.has('sd-nomatch'))[0]!.text()).toContain('No sound matches these filters');
    const reset = find((e) => e.tagName === 'BUTTON' && e.has('primary') && e.text() === 'Reset filters')[0]!;
    reset.fire('click');
    expect(hash).toBe('#/sounds');
    expect(rowIds()).toEqual(['clap-track', 'record-scratch', 'sting', 'vine-boom', 'broken']);
    expect(find((e) => e.has('pl-search'))[0]!.value).toBe('');
  });

  it('shows "No sounds yet" for an empty library', async () => {
    await open('#/sounds', empty);
    expect(find((e) => e.has('sd-empty'))[0]!.text()).toBe('No sounds yet');
    expect(find((e) => e.tagName === 'TABLE')).toEqual([]);
  });
});
