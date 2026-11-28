// Several library entries selected and deleted at once (ST-063): packages/cli/src/board/library-selection.js in the
// Characters, Sets and Sounds lists. No DOM library is installed, so a small fake document stands in for the page;
// fetch goes to the real board handler over a fixture workspace, so every delete is the entry's own single delete.
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { addLibraryCharacter, listLibrary } from '../packages/cli/src/character-library.ts';
import { addLibrarySet, addLibrarySetFile, listLibrarySets, useSet } from '../packages/cli/src/set-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  value = '';
  checked = false;
  indeterminate = false;
  disabled = false;
  style = {};
  listeners = new Map<string, ((event: unknown) => unknown)[]>();
  classList = {
    add: (name: string) => { if (!this.has(name)) this.className = (this.className + ' ' + name).trim(); },
    remove: (name: string) => { this.className = this.className.split(' ').filter((c) => c !== name).join(' '); },
    contains: (name: string) => this.has(name),
  };
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  set innerHTML(_value: string) { this.children = []; this.textContent = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  addEventListener(type: string, fn: (event: unknown) => unknown) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  /** Fire an event; resolves once the handlers' requests are answered. */
  async fire(type: string) {
    const event = { target: this, currentTarget: this, preventDefault() {}, stopPropagation() {} };
    await Promise.all((this.listeners.get(type) ?? []).map((fn) => fn(event)));
  }
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) { this.children.push(child); child.parent = this; }
    else this.textContent += child.data;
    return child;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(''); }
  has(name: string) { return this.className.split(' ').includes(name); }
}

interface Characters { showCharacters(id?: string): Promise<void> }
interface Sets { showSets(id?: string): Promise<void> }

let characters: Characters;
let sets: Sets;
let main: FakeElement;
let hash = '';
let ws = '';
/** The ids whose single delete answers with a refusal, as a stub of the library's route. */
const refuse = new Map<string, string>();
/** Every delete the page sent, in order. */
let deletes: string[] = [];
const confirm = vi.fn<(message: string) => boolean>();

/** One request to the board handler of the fixture workspace, as the board page sends it. */
function call(method: string, url: string, body?: string) {
  const handler = boardHandler({ root: ws, refresh: async () => undefined });
  return new Promise<{ status: number; body: string }>((done) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4848' };
    if (method !== 'GET') Object.assign(headers, { origin: 'http://127.0.0.1:4848', 'content-type': 'application/json' });
    const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(body)]), { method, url, headers });
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      setHeader() {}, writeHead(status: number) { this.statusCode = status; return this; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
      end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done({ status: this.statusCode, body: Buffer.concat(chunks).toString('utf8') }); },
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
  vi.stubGlobal('window', { confirm });
  vi.stubGlobal('location', { get hash() { return hash; }, set hash(value: string) { hash = value; } });
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => { hash = url; } });
  vi.stubGlobal('fetch', async (path: string, options: { method?: string; body?: string } = {}) => {
    const method = options.method ?? 'GET';
    const id = /^\/api\/(?:library|sets)\/([^/]+)$/.exec(path)?.[1];
    if (method === 'POST' && id && JSON.parse(options.body ?? '{}').action === 'delete') {
      deletes.push(id);
      const reason = refuse.get(id);
      if (reason) return { ok: false, statusText: '400', json: async () => ({ error: reason }) };
    }
    const r = await call(method, path, options.body);
    return { ok: r.status < 400, statusText: String(r.status), json: async () => JSON.parse(r.body) };
  });
  // @ts-expect-error the board's page modules are plain JS without type declarations
  characters = (await import('../packages/cli/src/board/characters.js')) as Characters;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  sets = (await import('../packages/cli/src/board/sets.js')) as Sets;

  // The fixture workspace: a music video "Harbor Lights" that uses the set neon-bar.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-library-selection-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  const harbor = await createVideoProject(ws, {
    slug: 'harbor', title: 'Harbor Lights', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock',
    language: 'en', rights: 'own song', license: 'all rights reserved',
  });
  await addLibrarySet(ws, { name: 'Neon Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow bar' });
  await writeFile(join(ws, 'counter.png'), 'counter');
  await addLibrarySetFile(ws, 'neon-bar', join(ws, 'counter.png'), { role: 'ref' });
  await useSet(ws, harbor, 'neon-bar');
  await addLibrarySet(ws, { name: 'Attic', description: 'A dusty attic.', prompt: 'attic' });
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(async () => {
  // Every test starts with no library characters; the sets stay.
  await rm(join(ws, 'library', 'characters'), { recursive: true, force: true });
  main = new FakeElement('main');
  refuse.clear();
  deletes = [];
  confirm.mockReset();
});

const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const rowIds = () => (find((e) => e.tagName === 'TBODY')[0]?.children ?? []).map((r) => r.getAttribute('data-id'));
const box = (id: string) => find((e) => e.has('ls-row') && e.getAttribute('data-id') === id)[0]!;
const bar = () => find((e) => e.has('ls-bar'))[0];
const button = (name: string) => find((e) => e.has(name))[0]!;
async function select(...ids: string[]) { for (const id of ids) await box(id).fire('change'); }
async function addCharacters(...names: string[]) { for (const name of names) await addLibraryCharacter(ws, { name, description: name + ', a test character.' }); }
const libraryIds = async () => (await listLibrary(ws)).characters.map((c) => c.id).sort();
async function openCharacters(address = '#/characters') { hash = address; await characters.showCharacters(); }

describe('deleting several library entries at once', () => {
  it('deletes two selected characters after the confirmation, and the list no longer shows them', async () => {
    await addCharacters('Ada', 'Bo', 'Cy');
    await openCharacters();
    expect(bar()).toBeUndefined();
    await select('ada', 'bo');
    expect(bar()!.text()).toContain('2 selected');
    confirm.mockReturnValue(true);
    await button('ls-delete').fire('click');
    expect(confirm).toHaveBeenCalledTimes(1);
    expect(confirm.mock.calls[0]![0]).toContain('Delete 2 entries from the library?');
    expect(deletes).toEqual(['ada', 'bo']);
    expect(rowIds()).toEqual(['cy']);
    expect(bar()).toBeUndefined();
    expect(await libraryIds()).toEqual(['cy']);
  });

  it('names the productions that use a selected set in the confirmation, and that they keep their copies', async () => {
    expect((await listLibrarySets(ws)).sets.find((s) => s.id === 'neon-bar')!.usedIn).toHaveLength(1);
    hash = '#/sets';
    await sets.showSets();
    await select('neon-bar', 'attic');
    confirm.mockReturnValue(false);
    await button('ls-delete').fire('click');
    const message = confirm.mock.calls[0]![0];
    expect(message).toContain('Delete 2 entries from the library?');
    expect(message).toContain('Neon Bar: Harbor Lights');
    expect(message).not.toContain('Attic:');
    expect(message).toContain('The productions keep their copies.');
  });

  it('deletes nothing when the confirmation is cancelled', async () => {
    await addCharacters('Dee', 'Eli');
    await openCharacters();
    await select('dee', 'eli');
    confirm.mockReturnValue(false);
    await button('ls-delete').fire('click');
    expect(deletes).toEqual([]);
    expect(await libraryIds()).toEqual(['dee', 'eli']);
    expect(rowIds()).toEqual(['dee', 'eli']);
    expect(bar()!.text()).toContain('2 selected');
  });

  it('deletes the other two when one of three deletes is refused, names the refused one with its reason, and keeps it selected', async () => {
    await addCharacters('Fay', 'Gus', 'Hal');
    refuse.set('gus', 'the library entry is locked');
    await openCharacters();
    await select('fay', 'gus', 'hal');
    confirm.mockReturnValue(true);
    await button('ls-delete').fire('click');
    expect(deletes).toEqual(['fay', 'gus', 'hal']);
    expect(await libraryIds()).toEqual(['gus']);
    expect(rowIds()).toEqual(['gus']);
    expect(bar()!.text()).toContain('1 selected');
    expect(find((e) => e.tagName === 'LI' && e.getAttribute('data-id') === 'gus')[0]!.text()).toBe('Gus: the library entry is locked');
    expect(box('gus').checked).toBe(true);
  });

  it('selects with the header checkbox only the rows the current filters show, and a filter change keeps only the shown ones', async () => {
    await addCharacters('Ida', 'Ivo', 'Jan');
    await openCharacters('#/characters?q=i');
    expect(rowIds()).toEqual(['ida', 'ivo']);
    await button('ls-all').fire('change');
    expect(bar()!.text()).toContain('2 selected');
    expect(box('ida').checked && box('ivo').checked).toBe(true);
    expect(button('ls-all').checked).toBe(true);
    // The selection is not in the address.
    expect(hash).toBe('#/characters?q=i');
    const search = button('pl-search');
    search.value = 'ida';
    await search.fire('input');
    expect(bar()!.text()).toContain('1 selected');
    search.value = '';
    await search.fire('input');
    expect(rowIds()).toEqual(['ida', 'ivo', 'jan']);
    expect(box('ida').checked).toBe(true);
    expect(box('ivo').checked || box('jan').checked).toBe(false);
    expect(button('ls-all').indeterminate).toBe(true);
    await button('ls-clear').fire('click');
    expect(bar()).toBeUndefined();
  });
});
