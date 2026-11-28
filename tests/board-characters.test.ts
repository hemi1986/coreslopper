// The Characters list (ST-060, UX guidelines G4/G5): packages/cli/src/board/characters.js with the shared list state
// of packages/cli/src/board/list-state.js. No DOM library is installed, so a small fake document stands in for the
// page, as in board-projects.test.ts; the data is what /api/library answers for a fixture workspace.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { addLibraryCharacter, addLibraryFile, importCharacters, updateLibraryCharacter, useCharacter } from '../packages/cli/src/character-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  value = '';
  checked = false;
  style = {};
  listeners = new Map<string, ((event: unknown) => unknown)[]>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  set innerHTML(_value: string) { this.children = []; this.textContent = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(type: string, fn: (event: unknown) => unknown) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  fire(type: string, event: Record<string, unknown> = {}) { for (const fn of this.listeners.get(type) ?? []) fn({ target: this, stopPropagation() {}, ...event }); }
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
interface CharacterList { items: Item[]; errors: Item[] }
interface Characters {
  characterItems(data: unknown): CharacterList;
  parseCharacterState(query: string, list: CharacterList): ListState;
  characterHash(state: ListState): string;
  characterRows(list: CharacterList, state: ListState): Item[];
  showCharacters(id?: string): Promise<void>;
  CHARACTERS_ROUTE: RegExp;
}

let view: Characters;
let main: FakeElement;
let hash = '';
let library: unknown;
const empty = { characters: [], errors: [], targets: [] };
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
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => (path === '/api/library' ? library : {}) }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  view = (await import('../packages/cli/src/board/characters.js')) as Characters;

  // The fixture workspace: three manual characters, one imported from a production, one entry that does not load;
  // Mira is used in a music video.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-characters-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  await addLibraryCharacter(ws, { name: 'Mira', description: 'A singer with red hair.', tags: 'held, lead' });
  await writeFile(join(ws, 'mira.png'), 'mira');
  await addLibraryFile(ws, 'mira', join(ws, 'mira.png'), 'sheet');
  await writeFile(join(ws, 'mira-2.png'), 'mira two');
  await addLibraryFile(ws, 'mira', join(ws, 'mira-2.png'), 'ref');
  await addLibraryCharacter(ws, { name: 'Zed', description: 'A drummer, Mira\'s brother.', tags: 'mira' });
  await addLibraryCharacter(ws, { name: 'Anna', description: 'A quiet neighbour.' });
  const source = join(ws, 'projects', 'old-clip');
  await mkdir(join(source, 'characters', 'bolt'), { recursive: true });
  await writeFile(join(source, 'characters', 'bolt', 'sheet.png'), 'bolt');
  await writeFile(join(source, 'characters.yaml'), [
    'version: 1', 'characters:', '  - id: bolt', '    name: Bolt', '    description: A robot.',
    '    sheet: characters/bolt/sheet.png', '    refs: [characters/bolt/sheet.png]', '',
  ].join('\n'));
  await importCharacters(ws, source);
  await updateLibraryCharacter(ws, 'bolt', { tags: 'held' });
  await rm(source, { recursive: true, force: true });
  const clip = await createVideoProject(ws, {
    slug: 'clip', title: 'Clip', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock',
    language: 'en', rights: 'own song', license: 'all rights reserved',
  });
  await useCharacter(ws, clip, 'mira');
  await mkdir(join(ws, 'library', 'characters', 'broken'), { recursive: true });
  await writeFile(join(ws, 'library', 'characters', 'broken', 'character.yaml'), 'version: 1\nname: [\n');
  library = await get('/api/library');
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); });

const list = () => view.characterItems(library);
const names = (query = '') => view.characterRows(list(), view.parseCharacterState(query, list())).map((item) => item.name);
async function open(address: string, data: unknown = library) {
  library = data;
  hash = address;
  await view.showCharacters();
}
const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const bodyRows = () => find((e) => e.tagName === 'TBODY')[0]?.children ?? [];
const rowNames = () => bodyRows().map((r) => r.getAttribute('data-id'));
const header = (text: string) => find((e) => e.tagName === 'TH' && e.text().startsWith(text))[0]!;

describe('the Characters list', () => {
  it('shows every library character of a fixture workspace by name, with cover, tags, image/state count, used-in count and origin', async () => {
    await open('#/characters');
    expect(rowNames()).toEqual(['anna', 'bolt', 'mira', 'zed', 'broken']);
    expect(find((e) => e.tagName === 'TH').map((e) => e.text())).toEqual(['', 'Name ▲', 'Display', 'Tags', 'Images', 'Voice', 'Used in', 'Origin']);
    const cells = (id: string) => bodyRows().find((r) => r.getAttribute('data-id') === id)!.children;
    const mira = cells('mira');
    expect(mira[0]!.children[0]!.tagName).toBe('IMG');
    expect(mira[0]!.children[0]!.getAttribute('src')).toBe('/library-files/mira/' + (library as { characters: { id: string; cover: string }[] }).characters.find((c) => c.id === 'mira')!.cover);
    expect(mira.slice(1).map((c) => c.text())).toEqual(['Miramira', 'fully visible', '#held #lead', '2 images · 0 states', 'no', '1', 'manual']);
    const anna = cells('anna');
    expect(anna[0]!.children[0]!.has('placeholder')).toBe(true);
    expect(anna[0]!.children[0]!.text()).toBe('A');
    expect(cells('bolt').slice(3).map((c) => c.text())).toEqual(['#held', '1 images · 0 states', 'no', '0', 'from old-clip']);
    // An unreadable entry is a row with its error.
    expect(cells('broken')[2]!.has('error')).toBe(true);
    expect(cells('broken')[2]!.text()).not.toBe('');
  });

  it('opens a row as the character\'s page, and its back link returns to the list with its filters', async () => {
    await open('#/characters?unused=1');
    bodyRows().find((r) => r.getAttribute('data-id') === 'zed')!.fire('click');
    expect(hash).toBe('#/characters/zed');
    main = new FakeElement('main');
    await view.showCharacters('zed');
    expect(find((e) => e.has('back-link'))[0]!.getAttribute('href')).toBe('#/characters?unused=1');
  });

  it('searches name, description and tags, case-insensitive, while typing', async () => {
    expect(names('q=MIRA')).toEqual(['Mira', 'Zed']);
    expect(names('q=robot')).toEqual(['Bolt']);
    await open('#/characters');
    const search = find((e) => e.has('pl-search'))[0]!;
    search.value = 'MIRA';
    search.fire('input');
    expect(rowNames()).toEqual(['mira', 'zed']);
    expect(hash).toBe('#/characters?q=MIRA');
  });

  it('filters unused: exactly the characters no production names in library', () => {
    const unused = (library as { characters: { name: string; usedIn: unknown[] }[] }).characters.filter((c) => !c.usedIn.length).map((c) => c.name).sort();
    expect(unused).not.toContain('Mira');
    expect(names('unused=1')).toEqual(unused);
  });

  it('combines tag held and origin manual: only manual characters tagged held', async () => {
    expect(names('tag=held')).toEqual(['Bolt', 'Mira']);
    expect(names('tag=held,mira')).toEqual(['Bolt', 'Mira', 'Zed']);
    expect(names('origin=projects/old-clip')).toEqual(['Bolt']);
    expect(names('origin=old-clip')).toEqual(['Anna', 'Bolt', 'Mira', 'Zed', 'broken']);
    expect(names('tag=held&origin=manual')).toEqual(['Mira']);
    await open('#/characters');
    find((e) => e.getAttribute('data-tag') === 'held')[0]!.fire('click');
    const origin = find((e) => e.has('cl-origin'))[0]!;
    origin.value = 'manual';
    origin.fire('change');
    expect(rowNames()).toEqual(['mira']);
    expect(hash).toBe('#/characters?tag=held&origin=manual');
  });

  it('sorts by a column header and reverses on the second click', async () => {
    await open('#/characters');
    header('Used in').fire('click');
    expect(rowNames().slice(0, 1)).toEqual(['mira']);
    expect(hash).toBe('#/characters?sort=used');
    header('Used in').fire('click');
    expect(rowNames().slice(3, 4)).toEqual(['mira']);
    expect(hash).toBe('#/characters?sort=used&dir=asc');
    header('Images').fire('click');
    expect(rowNames()[0]).toBe('mira');
    header('Origin').fire('click');
    expect(rowNames()[0]).toBe('bolt');
    header('Name').fire('click');
    expect(rowNames().slice(0, 4)).toEqual(['anna', 'bolt', 'mira', 'zed']);
    expect(hash).toBe('#/characters');
  });

  it('restores #/characters?unused=1&sort=name&dir=desc after a reload, and ignores unknown values', async () => {
    await open('#/characters?unused=1&sort=name&dir=desc');
    expect(rowNames()).toEqual(['zed', 'bolt', 'anna']);
    expect(find((e) => e.has('cl-unused'))[0]!.has('on')).toBe(true);
    expect(header('Name').text()).toBe('Name ▼');
    const state = view.parseCharacterState('unused=1&sort=name&dir=desc', list());
    expect(view.characterHash(state)).toBe('#/characters?unused=1&dir=desc');
    expect(view.parseCharacterState('tag=nope&origin=elsewhere&sort=bogus&dir=up&unused=yes', list()))
      .toEqual({ q: '', tag: [], unused: false, origin: '', sort: 'name', dir: 'asc' });
    expect(view.CHARACTERS_ROUTE.test('#/characters?q=a&unused=1')).toBe(true);
    expect(view.CHARACTERS_ROUTE.test('#/characters/mira')).toBe(false);
  });

  it('shows the no-match text, and Reset filters clears search and filters', async () => {
    await open('#/characters?q=nobody&tag=held&unused=1');
    expect(bodyRows()).toEqual([]);
    expect(find((e) => e.has('cl-nomatch'))[0]!.text()).toContain('No character matches these filters');
    const reset = find((e) => e.tagName === 'BUTTON' && e.has('primary') && e.text() === 'Reset filters')[0]!;
    reset.fire('click');
    expect(hash).toBe('#/characters');
    expect(rowNames()).toEqual(['anna', 'bolt', 'mira', 'zed', 'broken']);
    expect(find((e) => e.has('pl-search'))[0]!.value).toBe('');
  });

  it('shows "No characters yet" for an empty library, with + New to the character wizard', async () => {
    await open('#/characters', empty);
    expect(find((e) => e.has('cl-empty'))[0]!.text()).toBe('No characters yet+ New');
    expect(find((e) => e.has('cl-empty-new'))[0]!.getAttribute('href')).toBe('#/new/character');
    expect(find((e) => e.tagName === 'TABLE')).toEqual([]);
  });
});
