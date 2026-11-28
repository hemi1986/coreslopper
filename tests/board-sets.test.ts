// The Sets list (ST-061, UX guidelines G4/G5): packages/cli/src/board/sets.js with the shared list state of
// packages/cli/src/board/list-state.js. No DOM library is installed, so a small fake document stands in for the page,
// as in board-characters.test.ts; the data is what /api/sets answers for a fixture workspace.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { addLibrarySet, addLibrarySetFile, importSets, updateLibrarySet, useSet } from '../packages/cli/src/set-library.ts';
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
interface SetList { items: Item[]; errors: Item[] }
interface Sets {
  setItems(data: unknown): SetList;
  parseSetState(query: string, list: SetList): ListState;
  setHash(state: ListState): string;
  setRows(list: SetList, state: ListState): Item[];
  showSets(id?: string): Promise<void>;
  SETS_ROUTE: RegExp;
}
interface SetEntry { id: string; name: string; cover: string | null; usedIn: unknown[] }

let view: Sets;
let main: FakeElement;
let hash = '';
let sets: unknown;
const empty = { sets: [], errors: [], targets: [] };
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

async function image(name: string, content: string): Promise<string> {
  const path = join(ws, name);
  await writeFile(path, content);
  return path;
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
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => (path === '/api/sets' ? sets : {}) }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  view = (await import('../packages/cli/src/board/sets.js')) as Sets;

  // The fixture workspace: three manual sets, one imported from a production, one entry that does not load; the
  // Neon Bar is used in a music video.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-sets-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  await addLibrarySet(ws, { name: 'Neon Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar', tags: 'nacht, bar' });
  await addLibrarySetFile(ws, 'neon-bar', await image('start.png', 'start'), { role: 'ref' });
  await addLibrarySetFile(ws, 'neon-bar', await image('counter.png', 'counter'), { role: 'plate', angle: 'counter, frontal', plate: 'counter' });
  await addLibrarySetFile(ws, 'neon-bar', await image('door.png', 'door'), { role: 'plate', angle: 'door, from inside', plate: 'door' });
  await addLibrarySet(ws, { name: 'Forest Hut', description: 'Eine Hütte tief im Wald.', prompt: 'wooden hut', tags: 'day' });
  await addLibrarySetFile(ws, 'forest-hut', await image('hut.png', 'hut'), { role: 'ref' });
  await addLibrarySet(ws, { name: 'Attic', description: 'A dusty attic.', prompt: 'attic', tags: 'nacht' });
  const source = join(ws, 'projects', 'old-clip');
  await mkdir(join(source, 'sets', 'rooftop', 'plates'), { recursive: true });
  await writeFile(join(source, 'sets', 'rooftop', 'start.png'), 'roof');
  await writeFile(join(source, 'sets', 'rooftop', 'plates', 'edge.png'), 'edge');
  await writeFile(join(source, 'sets.yaml'), [
    'version: 1', 'sets:', '  - id: rooftop', '    name: Rooftop', '    description: A flat roof at dusk.', '    prompt: flat roof',
    '    refs: [sets/rooftop/start.png]', '    plates:', '      - id: edge', '        angle: edge, low', '        ref: sets/rooftop/plates/edge.png', '',
  ].join('\n'));
  await importSets(ws, source);
  await updateLibrarySet(ws, 'rooftop', { tags: 'nacht' });
  await rm(source, { recursive: true, force: true });
  const clip = await createVideoProject(ws, {
    slug: 'clip', title: 'Clip', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock',
    language: 'en', rights: 'own song', license: 'all rights reserved',
  });
  await useSet(ws, clip, 'neon-bar');
  await mkdir(join(ws, 'library', 'sets', 'broken'), { recursive: true });
  await writeFile(join(ws, 'library', 'sets', 'broken', 'set.yaml'), 'version: 1\nname: [\n');
  sets = await get('/api/sets');
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); });

const list = () => view.setItems(sets);
const names = (query = '') => view.setRows(list(), view.parseSetState(query, list())).map((item) => item.name);
async function open(address: string, data: unknown = sets) {
  sets = data;
  hash = address;
  await view.showSets();
}
const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const bodyRows = () => find((e) => e.tagName === 'TBODY')[0]?.children ?? [];
const rowNames = () => bodyRows().map((r) => r.getAttribute('data-id'));
const header = (text: string) => find((e) => e.tagName === 'TH' && e.text().startsWith(text))[0]!;
const entry = (id: string) => (sets as { sets: SetEntry[] }).sets.find((s) => s.id === id)!;

describe('the Sets list', () => {
  it('shows every library set of a fixture workspace by name, with cover, tags, reference/plate counts, used-in count and origin', async () => {
    await open('#/sets');
    expect(rowNames()).toEqual(['attic', 'forest-hut', 'neon-bar', 'rooftop', 'broken']);
    expect(find((e) => e.tagName === 'TH').map((e) => e.text())).toEqual(['', '', 'Name ▲', 'Tags', 'References', 'Plates', 'Used in', 'Origin']);
    // The first cell of a row is the selection's checkbox (ST-063).
    const cells = (id: string) => bodyRows().find((r) => r.getAttribute('data-id') === id)!.children.slice(1);
    // The cover is the first plate, else the first reference, else a placeholder.
    const bar = cells('neon-bar');
    expect(entry('neon-bar').cover).toBe('counter.png');
    expect(bar[0]!.children[0]!.tagName).toBe('IMG');
    expect(bar[0]!.children[0]!.getAttribute('src')).toBe('/set-files/neon-bar/counter.png');
    expect(bar.slice(1).map((c) => c.text())).toEqual(['Neon Barneon-bar', '#nacht #bar', '1', '2', '1', 'manual']);
    expect(cells('forest-hut')[0]!.children[0]!.getAttribute('src')).toBe('/set-files/forest-hut/' + entry('forest-hut').cover);
    const attic = cells('attic');
    expect(attic[0]!.children[0]!.has('placeholder')).toBe(true);
    expect(attic[0]!.children[0]!.text()).toBe('A');
    expect(cells('rooftop').slice(2).map((c) => c.text())).toEqual(['#nacht', '1', '1', '0', 'from old-clip']);
    // An unreadable entry is a row with its error.
    expect(cells('broken')[2]!.has('error')).toBe(true);
    expect(cells('broken')[2]!.text()).not.toBe('');
  });

  it('opens a row as the set\'s page, and its back link returns to the list with its filters', async () => {
    await open('#/sets?unused=1');
    bodyRows().find((r) => r.getAttribute('data-id') === 'attic')!.fire('click');
    expect(hash).toBe('#/sets/attic');
    main = new FakeElement('main');
    await view.showSets('attic');
    expect(find((e) => e.has('back-link'))[0]!.getAttribute('href')).toBe('#/sets?unused=1');
  });

  it('searching "wald" finds a set whose description mentions "Wald", while typing', async () => {
    expect(names('q=wald')).toEqual(['Forest Hut']);
    expect(names('q=BAR')).toEqual(['Neon Bar']);
    await open('#/sets');
    const search = find((e) => e.has('pl-search'))[0]!;
    search.value = 'wald';
    search.fire('input');
    expect(rowNames()).toEqual(['forest-hut']);
    expect(hash).toBe('#/sets?q=wald');
  });

  it('filters unused: exactly the sets no production names in library', () => {
    const unused = (sets as { sets: SetEntry[] }).sets.filter((s) => !s.usedIn.length).map((s) => s.name).sort();
    expect(unused).not.toContain('Neon Bar');
    expect(names('unused=1')).toEqual(unused);
  });

  it('filters origin <slug>: only the sets imported from that production', async () => {
    expect(names('origin=projects/old-clip')).toEqual(['Rooftop']);
    expect(names('origin=elsewhere')).toEqual(['Attic', 'Forest Hut', 'Neon Bar', 'Rooftop', 'broken']);
    expect(names('tag=nacht&origin=manual')).toEqual(['Attic', 'Neon Bar']);
    expect(names('tag=day,bar')).toEqual(['Forest Hut', 'Neon Bar']);
    await open('#/sets');
    const origin = find((e) => e.has('sl-origin'))[0]!;
    origin.value = 'projects/old-clip';
    origin.fire('change');
    expect(rowNames()).toEqual(['rooftop']);
    expect(hash).toBe('#/sets?origin=projects%2Fold-clip');
  });

  it('sorts by a column header and reverses on the second click', async () => {
    await open('#/sets');
    header('Plates').fire('click');
    expect(rowNames().slice(0, 1)).toEqual(['neon-bar']);
    expect(hash).toBe('#/sets?sort=plates');
    header('Plates').fire('click');
    expect(rowNames().slice(0, 2)).toEqual(['attic', 'forest-hut']);
    expect(hash).toBe('#/sets?sort=plates&dir=asc');
    header('References').fire('click');
    expect(rowNames().slice(0, 3)).toEqual(['forest-hut', 'neon-bar', 'rooftop']);
    header('Used in').fire('click');
    expect(rowNames()[0]).toBe('neon-bar');
    header('Origin').fire('click');
    expect(rowNames()[0]).toBe('rooftop');
    header('Name').fire('click');
    expect(rowNames().slice(0, 4)).toEqual(['attic', 'forest-hut', 'neon-bar', 'rooftop']);
    expect(hash).toBe('#/sets');
  });

  it('restores #/sets?tag=nacht&sort=plates&dir=desc after a reload, and ignores unknown values', async () => {
    await open('#/sets?tag=nacht&sort=plates&dir=desc');
    expect(rowNames()).toEqual(['neon-bar', 'rooftop', 'attic']);
    expect(find((e) => e.getAttribute('data-tag') === 'nacht')[0]!.has('on')).toBe(true);
    expect(header('Plates').text()).toBe('Plates ▼');
    expect(view.setHash(view.parseSetState('tag=nacht&sort=plates&dir=desc', list()))).toBe('#/sets?tag=nacht&sort=plates');
    expect(view.parseSetState('tag=nope&origin=elsewhere&sort=bogus&dir=up&unused=yes', list()))
      .toEqual({ q: '', tag: [], unused: false, origin: '', sort: 'name', dir: 'asc' });
    expect(view.SETS_ROUTE.test('#/sets?q=a&unused=1')).toBe(true);
    expect(view.SETS_ROUTE.test('#/sets/neon-bar')).toBe(false);
  });

  it('shows the no-match text, and Reset filters clears search and filters', async () => {
    await open('#/sets?q=nowhere&tag=nacht&unused=1');
    expect(bodyRows()).toEqual([]);
    expect(find((e) => e.has('sl-nomatch'))[0]!.text()).toContain('No set matches these filters');
    const reset = find((e) => e.tagName === 'BUTTON' && e.has('primary') && e.text() === 'Reset filters')[0]!;
    reset.fire('click');
    expect(hash).toBe('#/sets');
    expect(rowNames()).toEqual(['attic', 'forest-hut', 'neon-bar', 'rooftop', 'broken']);
    expect(find((e) => e.has('pl-search'))[0]!.value).toBe('');
  });

  it('shows "No sets yet" for an empty library, with + New to the set wizard', async () => {
    await open('#/sets', empty);
    expect(find((e) => e.has('sl-empty'))[0]!.text()).toBe('No sets yet+ New');
    expect(find((e) => e.has('sl-empty-new'))[0]!.getAttribute('href')).toBe('#/new/set');
    expect(find((e) => e.tagName === 'TABLE')).toEqual([]);
  });
});
