// The + New chooser and the character wizard (ST-064, UX guideline G10): packages/cli/src/board/wizard.js and
// packages/cli/src/board/character-wizard.js. No DOM library is installed, so a small fake document stands in for the
// page; fetch and XMLHttpRequest go to the real board handler over a fixture workspace, so every write is the
// library's own route.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { loadLibraryCharacter } from '../packages/cli/src/character-library.ts';
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
  disabled = false;
  files: { name: string; data: string }[] = [];
  style = {};
  onsubmit: ((event: unknown) => unknown) | null = null;
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
    const handlers = type === 'submit' && this.onsubmit ? [this.onsubmit] : this.listeners.get(type) ?? [];
    await Promise.all(handlers.map((fn) => fn(event)));
  }
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) { this.children.push(child); child.parent = this; }
    else this.textContent += child.data;
    return child;
  }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter((c) => c !== this); }
  querySelector(_selector: string) { return this.all().find((e) => e.tagName === 'BUTTON') ?? null; }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(''); }
  has(name: string) { return this.className.split(' ').includes(name); }
}

interface Wizard { showWizard(kind?: string, slug?: string): Promise<void> }
interface CharacterWizard { showCharacterWizard(id?: string): Promise<void> }
interface Characters { showCharacters(id?: string): Promise<void> }

let wizard: Wizard;
let characterWizard: CharacterWizard;
let characters: Characters;
let main: FakeElement;
let hash = '';
let ws = '';

/** One request to the board handler of the fixture workspace, as the board page sends it. */
function call(method: string, url: string, body?: string, contentType = 'application/json') {
  const handler = boardHandler({ root: ws, refresh: async () => undefined });
  return new Promise<{ status: number; body: string }>((done) => {
    const headers: Record<string, string> = { host: '127.0.0.1:4848' };
    if (method !== 'GET') Object.assign(headers, { origin: 'http://127.0.0.1:4848', 'content-type': contentType });
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

/**
 * XMLHttpRequest as `upload` in lib.js uses it, answered by the board handler. `sent` logs the file name of every
 * upload; a name in `failOnce` is a lost connection once.
 */
class FakeXhr {
  static sent: string[] = [];
  static failOnce = new Set<string>();
  method = ''; url = ''; status = 0; statusText = ''; responseText = '';
  upload: { onprogress?: (e: unknown) => void } = {};
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  open(method: string, url: string) { this.method = method; this.url = url; }
  setRequestHeader() {}
  send(file: { data: string }) {
    const name = new URL(this.url, 'http://board').searchParams.get('name') ?? '';
    FakeXhr.sent.push(name);
    if (FakeXhr.failOnce.delete(name)) { queueMicrotask(() => this.onerror?.()); return; }
    void call(this.method, this.url, file.data, 'application/octet-stream').then((r) => {
      this.status = r.status; this.responseText = r.body; this.statusText = String(r.status);
      this.onload?.();
    });
  }
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
  vi.stubGlobal('fetch', async (path: string, options: { method?: string; body?: string } = {}) => {
    const r = await call(options.method ?? 'GET', path, options.body);
    return { ok: r.status < 400, statusText: String(r.status), json: async () => JSON.parse(r.body) };
  });
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  // @ts-expect-error the board's page modules are plain JS without type declarations
  wizard = (await import('../packages/cli/src/board/wizard.js')) as Wizard;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  characterWizard = (await import('../packages/cli/src/board/character-wizard.js')) as CharacterWizard;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  characters = (await import('../packages/cli/src/board/characters.js')) as Characters;

  // The fixture workspace: a music video whose character bible has one character with a sheet, and one without any.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-character-wizard-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  const base = { title: 'Harbor', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock', language: 'en', rights: 'own song', license: 'all rights reserved' };
  const harbor = await createVideoProject(ws, { ...base, slug: 'harbor' });
  await mkdir(join(harbor, 'characters', 'bolt'), { recursive: true });
  await writeFile(join(harbor, 'characters', 'bolt', 'sheet.png'), 'bolt');
  await writeFile(join(harbor, 'characters.yaml'), [
    'version: 1', 'characters:', '  - id: bolt', '    name: Bolt', '    description: A robot.',
    '    sheet: characters/bolt/sheet.png', '    refs: [characters/bolt/sheet.png]', '',
  ].join('\n'));
  const empty = await createVideoProject(ws, { ...base, title: 'Empty', slug: 'empty' });
  await writeFile(join(empty, 'characters.yaml'), ['version: 1', 'characters:', '  - id: ghost', '    name: Ghost', '    description: Never drawn.', ''].join('\n'));
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); hash = ''; });

const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const one = (predicate: (e: FakeElement) => boolean) => find(predicate)[0]!;
const byField = (name: string) => one((e) => e.getAttribute('data-field') === name);
const button = (text: string) => one((e) => e.tagName === 'BUTTON' && e.text() === text);
const fileNames = (cls: string) => one((e) => e.has(cls)).children.map((c) => c.getAttribute('data-file'));

async function startCreate() {
  await characterWizard.showCharacterWizard();
  await one((e) => e.getAttribute('data-choice') === 'create').fire('click');
}
async function create(name: string, description: string) {
  await startCreate();
  byField('name').value = name;
  byField('description').value = description;
  await one((e) => e.tagName === 'FORM').fire('submit');
}

describe('the + New chooser', () => {
  it('shows the groups Production and Library, and Library has a Character card that opens #/new/character', async () => {
    await wizard.showWizard();
    const groups = find((e) => e.has('new-group'));
    expect(groups.map((g) => g.children[0]!.text())).toEqual(['Production', 'Library']);
    const cards = (group: FakeElement) => group.all().filter((e) => e.getAttribute('data-kind')).map((e) => e.getAttribute('data-kind'));
    expect(cards(groups[0]!)).toEqual(['video', 'series', 'episode', 'meme']);
    expect(cards(groups[1]!)).toEqual(['character']);
    const card = one((e) => e.getAttribute('data-kind') === 'character');
    expect(card.text()).toContain('Character');
    await card.fire('click');
    expect(hash).toBe('#/new/character');
  });
});

describe('the character wizard', () => {
  it('step 1 with a name creates the library character and the address becomes #/new/character/<id>', async () => {
    await create('Nova Lee', 'A pilot with short grey hair.');
    expect(hash).toBe('#/new/character/nova-lee');
    const entry = await loadLibraryCharacter(ws, 'nova-lee');
    expect(entry).toMatchObject({ name: 'Nova Lee', description: 'A pilot with short grey hair.', origin: 'manual' });
  });

  it('shows a sheet and two images of step 2 as they upload, makes the voice of step 3 the reference voice, and resumes after a reload', async () => {
    await create('Juno', 'A courier.');
    expect(hash).toBe('#/new/character/juno');
    main = new FakeElement('main');
    await characterWizard.showCharacterWizard('juno');
    byField('sheet').files = [{ name: 'juno-sheet.png', data: 'sheet' }];
    byField('images').files = [{ name: 'juno-face.png', data: 'face' }, { name: 'juno-coat.webp', data: 'coat' }];
    await one((e) => e.getAttribute('data-upload') === 'images').fire('click');
    expect(fileNames('cw-images')).toEqual(['juno-sheet.png', 'juno-face.png', 'juno-coat.webp']);
    byField('voice').files = [{ name: 'juno.wav', data: 'RIFF' }];
    byField('transcript').value = 'Package for the harbor.';
    await one((e) => e.getAttribute('data-upload') === 'voice').fire('click');
    expect(fileNames('cw-voice')).toEqual(['juno.wav']);
    const entry = await loadLibraryCharacter(ws, 'juno');
    expect(entry.sheet).toBe('juno-sheet.png');
    expect(entry.refs).toEqual(expect.arrayContaining(['juno-face.png', 'juno-coat.webp']));
    expect(entry.voice).toEqual({ ref: 'juno.wav', transcript: 'Package for the harbor.' });

    // A reload of #/new/character/juno resumes at the entry with its files; the last step links to the character.
    main = new FakeElement('main');
    await characterWizard.showCharacterWizard('juno');
    expect(fileNames('cw-images')).toEqual(['juno-sheet.png', 'juno-face.png', 'juno-coat.webp']);
    expect(fileNames('cw-voice')).toEqual(['juno.wav']);
    expect(find((e) => e.has('done-step')).length).toBe(3);
    expect(one((e) => e.has('cw-done')).getAttribute('href')).toBe('#/characters/juno');
  });

  it('names a refused upload in its step and retries it with the same button', async () => {
    await create('Rook', 'A night guard.');
    main = new FakeElement('main');
    await characterWizard.showCharacterWizard('rook');
    byField('images').files = [{ name: 'rook.txt', data: 'text' }];
    await one((e) => e.getAttribute('data-upload') === 'images').fire('click');
    const status = one((e) => e.has('cw-status'));
    expect(status.has('error')).toBe(true);
    expect(status.text()).toMatch(/png/);
    byField('images').files = [{ name: 'rook.png', data: 'rook' }];
    await one((e) => e.getAttribute('data-upload') === 'images').fire('click');
    expect(fileNames('cw-images')).toEqual(['rook.png']);
    expect(status.has('error')).toBe(false);
  });

  it('retries a multi-file batch with only the files that did not land, and a second click sends nothing', async () => {
    await create('Wren', 'A mechanic.');
    main = new FakeElement('main');
    await characterWizard.showCharacterWizard('wren');
    byField('sheet').files = [{ name: 'wren-sheet.png', data: 'sheet' }];
    byField('images').files = [{ name: 'wren-a.png', data: 'a' }, { name: 'wren-b.png', data: 'b' }, { name: 'wren-c.png', data: 'c' }];
    FakeXhr.sent = [];
    FakeXhr.failOnce.add('wren-b.png');
    const send = one((e) => e.getAttribute('data-upload') === 'images');
    await send.fire('click');
    expect(FakeXhr.sent).toEqual(['wren-sheet.png', 'wren-a.png', 'wren-b.png']);
    expect(one((e) => e.has('cw-status')).has('error')).toBe(true);
    expect(fileNames('cw-images')).toEqual(['wren-sheet.png', 'wren-a.png']);

    FakeXhr.sent = [];
    await send.fire('click');
    expect(FakeXhr.sent).toEqual(['wren-b.png', 'wren-c.png']);
    const entry = await loadLibraryCharacter(ws, 'wren');
    expect(entry.sheet).toBe('wren-sheet.png');
    expect(entry.refs.filter((name) => name !== entry.sheet).sort()).toEqual(['wren-a.png', 'wren-b.png', 'wren-c.png']);
    expect(fileNames('cw-images')).toEqual(['wren-sheet.png', 'wren-a.png', 'wren-b.png', 'wren-c.png']);

    FakeXhr.sent = [];
    await send.fire('click');
    expect(FakeXhr.sent).toEqual([]);
  });

  it('marks name and description as required, refuses an empty or taken name with its reason and keeps the other fields', async () => {
    await create('Taken Name', 'The first one.');
    main = new FakeElement('main');
    hash = '';
    await startCreate();
    expect(byField('name').getAttribute('aria-required')).toBe('true');
    expect(byField('description').getAttribute('aria-required')).toBe('true');
    expect(find((e) => e.has('cw-required')).length).toBe(2);
    byField('name').value = '';
    byField('description').value = 'Somebody.';
    byField('tags').value = 'lead';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('cw-error')).text()).toMatch(/name is required/);
    expect(byField('description').value).toBe('Somebody.');
    expect(byField('tags').value).toBe('lead');
    expect(hash).toBe('');
    byField('name').value = 'Taken Name';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('cw-error')).text()).toMatch(/taken-name/);
    expect(byField('name').value).toBe('Taken Name');
    expect(hash).toBe('');
  });

  it('imports the characters of a fixture project into the library and lists them with links', async () => {
    await characterWizard.showCharacterWizard();
    await one((e) => e.getAttribute('data-choice') === 'import').fire('click');
    const target = one((e) => e.tagName === 'SELECT');
    target.value = 'project/harbor';
    await button('Import').fire('click');
    const links = one((e) => e.has('cw-result')).all().filter((e) => e.tagName === 'A');
    expect(links.map((a) => [a.text(), a.getAttribute('href')])).toEqual([['Bolt', '#/characters/bolt']]);
    expect((await loadLibraryCharacter(ws, 'bolt')).name).toBe('Bolt');

    target.value = 'project/empty';
    await button('Import').fire('click');
    expect(one((e) => e.has('cw-result')).text()).toBe('No character with images found.');
  });
});

describe('the Characters view', () => {
  it('has no inline creation or import form, and its + New opens #/new/character', async () => {
    hash = '#/characters';
    await characters.showCharacters();
    expect(find((e) => e.tagName === 'FORM')).toEqual([]);
    expect(main.text()).not.toMatch(/Take from a project|Import from a project/);
    await one((e) => e.has('cl-new')).fire('click');
    expect(hash).toBe('#/new/character');
  });
});
