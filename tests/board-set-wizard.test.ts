// The set wizard (ST-065, UX guideline G10): packages/cli/src/board/set-wizard.js, its card in the + New chooser
// (wizard.js) and the Sets view's + New (sets.js). No DOM library is installed, so a small fake document stands in for
// the page; fetch and XMLHttpRequest go to the real board handler over a fixture workspace, so every write is the set
// library's own route.
import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVideoProject } from '../packages/cli/src/board-wizard.ts';
import { loadLibrarySet } from '../packages/cli/src/set-library.ts';
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
interface SetWizard { showSetWizard(id?: string): Promise<void> }
interface Sets { showSets(id?: string): Promise<void> }

let wizard: Wizard;
let setWizard: SetWizard;
let sets: Sets;
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
  setWizard = (await import('../packages/cli/src/board/set-wizard.js')) as SetWizard;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  sets = (await import('../packages/cli/src/board/sets.js')) as Sets;

  // The fixture workspace: a music video whose sets.yaml has one set with a reference and a plate, and one without
  // any file; a second video has only the set without files.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-set-wizard-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  const base = { title: 'Harbor', artist: 'Test Artist', budget: 40, imageProvider: 'mock', videoProvider: 'mock', language: 'en', rights: 'own song', license: 'all rights reserved' };
  const harbor = await createVideoProject(ws, { ...base, slug: 'harbor' });
  await mkdir(join(harbor, 'sets', 'pier', 'plates'), { recursive: true });
  await writeFile(join(harbor, 'sets', 'pier', 'start.png'), 'pier');
  await writeFile(join(harbor, 'sets', 'pier', 'plates', 'end.png'), 'end');
  const empty = ['  - id: void', '    name: Void', '    description: Never drawn.', '    prompt: nothing'];
  await writeFile(join(harbor, 'sets.yaml'), [
    'version: 1', 'sets:', '  - id: pier', '    name: Pier', '    description: A wooden pier at night.', '    prompt: wooden pier',
    '    refs: [sets/pier/start.png]', '    plates:', '      - id: end', '        angle: pier end, low', '        ref: sets/pier/plates/end.png',
    ...empty, '',
  ].join('\n'));
  const bare = await createVideoProject(ws, { ...base, title: 'Bare', slug: 'bare' });
  await writeFile(join(bare, 'sets.yaml'), ['version: 1', 'sets:', ...empty, ''].join('\n'));
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); hash = ''; });

const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const one = (predicate: (e: FakeElement) => boolean) => find(predicate)[0]!;
const byField = (name: string) => one((e) => e.getAttribute('data-field') === name);
const button = (text: string) => one((e) => e.tagName === 'BUTTON' && e.text() === text);
const fileNames = () => one((e) => e.has('sw-files')).children.map((c) => c.getAttribute('data-file'));
const status = (which: string) => one((e) => e.getAttribute('data-status') === which);

async function startCreate() {
  await setWizard.showSetWizard();
  await one((e) => e.getAttribute('data-choice') === 'create').fire('click');
}
async function create(name: string, description: string, prompt: string) {
  await startCreate();
  byField('name').value = name;
  byField('description').value = description;
  byField('prompt').value = prompt;
  await one((e) => e.tagName === 'FORM').fire('submit');
}

describe('the + New chooser', () => {
  it('has a Set card in the Library group that opens #/new/set', async () => {
    await wizard.showWizard();
    const library = find((e) => e.has('new-group')).find((g) => g.getAttribute('data-group') === 'groupLibrary')!;
    const card = library.all().find((e) => e.getAttribute('data-kind') === 'set')!;
    expect(card.text()).toContain('Set');
    await card.fire('click');
    expect(hash).toBe('#/new/set');
  });
});

describe('the set wizard', () => {
  it('step 1 with a name creates the library set and the address becomes #/new/set/<id>', async () => {
    await create('Neon Bar', 'A narrow bar in blue neon.', 'narrow neon bar');
    expect(hash).toBe('#/new/set/neon-bar');
    expect(await loadLibrarySet(ws, 'neon-bar')).toMatchObject({ name: 'Neon Bar', description: 'A narrow bar in blue neon.', prompt: 'narrow neon bar', origin: 'manual' });
  });

  it('shows a reference and a plate of step 2 in the set as they upload, and resumes after a reload', async () => {
    await create('Attic', 'A dusty attic.', 'dusty attic');
    main = new FakeElement('main');
    await setWizard.showSetWizard('attic');
    byField('refs').files = [{ name: 'attic-wide.png', data: 'wide' }];
    await one((e) => e.getAttribute('data-upload') === 'refs').fire('click');
    expect(fileNames()).toEqual(['attic-wide.png']);
    byField('plate').files = [{ name: 'attic-window.png', data: 'window' }];
    byField('angle').value = 'window, frontal';
    byField('plate-id').value = 'window';
    await one((e) => e.getAttribute('data-upload') === 'plate').fire('click');
    expect(fileNames()).toEqual(['attic-wide.png', 'attic-window.png']);
    const entry = await loadLibrarySet(ws, 'attic');
    expect(entry.refs).toEqual(['attic-wide.png']);
    expect(entry.plates).toEqual([expect.objectContaining({ id: 'window', angle: 'window, frontal', file: 'attic-window.png' })]);

    // A reload of #/new/set/attic resumes with the set's files; the last step links to the set.
    main = new FakeElement('main');
    await setWizard.showSetWizard('attic');
    expect(fileNames()).toEqual(['attic-wide.png', 'attic-window.png']);
    expect(find((e) => e.has('done-step')).length).toBe(2);
    expect(one((e) => e.has('sw-done')).getAttribute('href')).toBe('#/sets/attic');
  });

  it('names a plate without its angle in its step, and the corrected angle retries it', async () => {
    await create('Cellar', 'A cold cellar.', 'cold cellar');
    main = new FakeElement('main');
    await setWizard.showSetWizard('cellar');
    byField('plate').files = [{ name: 'cellar-stairs.png', data: 'stairs' }];
    await one((e) => e.getAttribute('data-upload') === 'plate').fire('click');
    expect(status('plate').has('error')).toBe(true);
    expect(status('plate').text()).toMatch(/angle/);
    expect(fileNames()).toEqual([]);
    byField('angle').value = 'stairs, from below';
    await one((e) => e.getAttribute('data-upload') === 'plate').fire('click');
    expect(status('plate').has('error')).toBe(false);
    expect(fileNames()).toEqual(['cellar-stairs.png']);
  });

  it('marks name, description and prompt as required, refuses an empty or taken name with its reason and keeps the fields', async () => {
    await create('Taken Place', 'The first one.', 'first');
    main = new FakeElement('main');
    hash = '';
    await startCreate();
    expect(['name', 'description', 'prompt'].map((f) => byField(f).getAttribute('aria-required'))).toEqual(['true', 'true', 'true']);
    expect(find((e) => e.has('sw-required')).length).toBe(3);
    byField('name').value = '';
    byField('description').value = 'Somewhere.';
    byField('prompt').value = 'somewhere';
    byField('tags').value = 'night';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('sw-error')).text()).toMatch(/name is required/);
    expect([byField('description').value, byField('prompt').value, byField('tags').value]).toEqual(['Somewhere.', 'somewhere', 'night']);
    expect(hash).toBe('');
    byField('name').value = 'Taken Place';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('sw-error')).text()).toMatch(/taken-place/);
    expect(byField('name').value).toBe('Taken Place');
    expect(hash).toBe('');
  });

  it('imports the sets of a fixture project into the library and lists them with links', async () => {
    await setWizard.showSetWizard();
    await one((e) => e.getAttribute('data-choice') === 'import').fire('click');
    const target = one((e) => e.tagName === 'SELECT');
    target.value = 'project/harbor';
    await button('Import').fire('click');
    const result = one((e) => e.has('sw-result'));
    const links = result.all().filter((e) => e.tagName === 'A');
    expect(links.map((a) => [a.text(), a.getAttribute('href')])).toEqual([['Pier', '#/sets/pier']]);
    expect(result.text()).toContain('void');
    const pier = await loadLibrarySet(ws, 'pier');
    expect(pier.name).toBe('Pier');
    expect(pier.plates.map((p) => p.angle)).toEqual(['pier end, low']);

    target.value = 'project/bare';
    await button('Import').fire('click');
    expect(one((e) => e.has('sw-result')).text()).toBe('No set with images found.');
  });
});

describe('the Sets view', () => {
  it('has no inline creation or import form, and its + New opens #/new/set', async () => {
    hash = '#/sets';
    await sets.showSets();
    expect(find((e) => e.tagName === 'FORM')).toEqual([]);
    expect(main.text()).not.toMatch(/Take from a project|Import from a project|New set/);
    await one((e) => e.has('sl-new')).fire('click');
    expect(hash).toBe('#/new/set');
  });
});
