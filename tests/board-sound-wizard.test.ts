// The sound wizard (ST-066, UX guideline G10): packages/cli/src/board/sound-wizard.js, its card in the + New chooser
// (wizard.js) and the Sounds view's + New (sounds.js). No DOM library is installed, so a small fake document stands in
// for the page; fetch and XMLHttpRequest go to the real board handler over a fixture workspace, so every write is the
// sound library's own route. Step 1 converts a real audio file and needs ffmpeg, as `sound add` does.
import { execFileSync } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { stringify } from 'yaml';
import { resolveBinary } from '../packages/cli/src/media.ts';
import { loadLibrarySound, soundDir } from '../packages/cli/src/sound-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

function hasFfmpeg(): boolean {
  try {
    resolveBinary('ffmpeg');
    resolveBinary('ffprobe');
    return true;
  } catch {
    return false;
  }
}

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  parent: FakeElement | null = null;
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  value = '';
  currentTime = 0;
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
interface SoundWizard { showSoundWizard(id?: string): Promise<void> }
interface Sounds { showSounds(id?: string): Promise<void> }

let wizard: Wizard;
let soundWizard: SoundWizard;
let sounds: Sounds;
let main: FakeElement;
let hash = '';
let ws = '';
let audio: Buffer = Buffer.alloc(0);

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

/** A library entry written by hand, as `sound add` stores it: steps 2 and 3 only read and edit sound.yaml. */
async function hold(id: string, fields: Record<string, unknown> = {}): Promise<void> {
  await mkdir(soundDir(ws, id), { recursive: true });
  await writeFile(join(soundDir(ws, id), 'sound.wav'), 'RIFF');
  await writeFile(join(soundDir(ws, id), 'sound.yaml'), stringify({
    version: 1, id, title: 'Held ' + id, use_when: 'a test', tags: [], length: 2, loudness: -18.5, licence: 'unknown',
    hash: Buffer.from(id).toString('hex').padEnd(64, '0').slice(0, 64), added: '2026-11-28T10:00:00.000Z', ...fields,
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
  vi.stubGlobal('fetch', async (path: string, options: { method?: string; body?: string } = {}) => {
    const r = await call(options.method ?? 'GET', path, options.body);
    return { ok: r.status < 400, statusText: String(r.status), json: async () => JSON.parse(r.body) };
  });
  vi.stubGlobal('XMLHttpRequest', FakeXhr);
  // @ts-expect-error the board's page modules are plain JS without type declarations
  wizard = (await import('../packages/cli/src/board/wizard.js')) as Wizard;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  soundWizard = (await import('../packages/cli/src/board/sound-wizard.js')) as SoundWizard;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  sounds = (await import('../packages/cli/src/board/sounds.js')) as Sounds;

  // The fixture workspace: the config the + New chooser reads, and the library sounds each test adds.
  ws = await mkdtemp(join(tmpdir(), 'coreslopper-sound-wizard-'));
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  if (hasFfmpeg()) {
    const file = join(ws, 'boom.wav');
    execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1.4', file]);
    audio = await readFile(file);
  }
});

afterAll(async () => { if (ws) await rm(ws, { recursive: true, force: true }); });
beforeEach(() => { main = new FakeElement('main'); hash = ''; FakeXhr.sent = []; });

const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const one = (predicate: (e: FakeElement) => boolean) => find(predicate)[0]!;
const byField = (name: string) => one((e) => e.getAttribute('data-field') === name);
const byAttr = (name: string, value: string) => one((e) => e.getAttribute(name) === value);
const player = () => byAttr('data-player', 'sound');

describe('the + New chooser', () => {
  it('has a Sound card in the Library group that opens #/new/sound', async () => {
    await wizard.showWizard();
    const library = find((e) => e.has('new-group')).find((g) => g.getAttribute('data-group') === 'groupLibrary')!;
    const card = library.all().find((e) => e.getAttribute('data-kind') === 'sound')!;
    expect(card.text()).toContain('Sound');
    await card.fire('click');
    expect(hash).toBe('#/new/sound');
  });
});

describe('the sound wizard', () => {
  it.skipIf(!hasFfmpeg())('step 1 with a file, title and use-when creates the library sound and the address becomes #/new/sound/<id>', async () => {
    await soundWizard.showSoundWizard();
    expect(['file', 'title', 'use-when'].map((f) => byField(f).getAttribute('aria-required'))).toEqual(['true', 'true', 'true']);
    // The fake upload sends the bytes as they are; a Buffer passes through `Buffer.from` unchanged.
    byField('file').files = [{ name: 'boom.wav', data: audio as unknown as string }];
    byField('title').value = 'Vine Boom';
    byField('use-when').value = 'a dramatic reveal';
    byField('tags').value = 'reveal';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('uw-error')).text()).toBe('');
    expect(hash).toBe('#/new/sound/vine-boom');
    const stored = await loadLibrarySound(ws, 'vine-boom');
    expect(stored).toMatchObject({ title: 'Vine Boom', use_when: 'a dramatic reveal', tags: ['reveal'], licence: 'unknown' });
    expect(stored.length).toBeGreaterThan(1.3);
  });

  it('refuses a step 1 without a file with its reason, sends nothing and keeps the typed fields', async () => {
    await soundWizard.showSoundWizard();
    byField('title').value = 'No File';
    byField('use-when').value = 'never';
    byField('tags').value = 'none';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('uw-error')).text()).toBe('Choose an audio file to upload.');
    expect(FakeXhr.sent).toEqual([]);
    expect([byField('title').value, byField('use-when').value, byField('tags').value]).toEqual(['No File', 'never', 'none']);
    expect(hash).toBe('');
  });

  it('names an unreadable audio file in step 1 and keeps the typed fields', async () => {
    await soundWizard.showSoundWizard();
    byField('file').files = [{ name: 'notes.mp3', data: 'not audio at all' }];
    byField('title').value = 'Notes';
    byField('use-when').value = 'nothing';
    await one((e) => e.tagName === 'FORM').fire('submit');
    expect(one((e) => e.has('uw-error')).text()).toMatch(/notes\.mp3 is not an audio file ffmpeg can read/);
    expect([byField('title').value, byField('use-when').value]).toEqual(['Notes', 'nothing']);
    expect(hash).toBe('');
  });

  it('stores a cue and trim set in step 2 from the playback position on the sound', async () => {
    await hold('sting');
    await soundWizard.showSoundWizard('sting');
    expect(find((e) => e.has('done-step')).length).toBe(1);
    player().currentTime = 0.2;
    await byAttr('data-set', 'trim-start').fire('click');
    player().currentTime = 1.6;
    await byAttr('data-set', 'trim-end').fire('click');
    player().currentTime = 0.5;
    await byAttr('data-set', 'cue').fire('click');
    expect([byField('trim-start').value, byField('trim-end').value, byField('cue').value]).toEqual(['0.2', '1.6', '0.3']);
    await byAttr('data-next', 'cue').fire('click');
    expect(byAttr('data-error', 'cue').text()).toBe('');
    expect(await loadLibrarySound(ws, 'sting')).toMatchObject({ cue: 0.3, trim: { start: 0.2, end: 1.6 } });
    expect(find((e) => e.has('done-step')).length).toBe(2);

    // A reload of #/new/sound/sting resumes with what is set.
    main = new FakeElement('main');
    await soundWizard.showSoundWizard('sting');
    expect([byField('trim-start').value, byField('trim-end').value, byField('cue').value]).toEqual(['0.2', '1.6', '0.3']);
    expect(find((e) => e.has('done-step')).length).toBe(2);
  });

  it('moves a stored cue with Trim start here, so it keeps its moment in the file', async () => {
    // Stored cue 0.5 without a trim: the hit is 0.5 s into the file. A trim from 0.3 puts it 0.2 s after the start.
    await hold('shift', { cue: 0.5 });
    await soundWizard.showSoundWizard('shift');
    player().currentTime = 0.3;
    await byAttr('data-set', 'trim-start').fire('click');
    player().currentTime = 1.8;
    await byAttr('data-set', 'trim-end').fire('click');
    expect(byField('cue').value).toBe('0.2');
    await byAttr('data-next', 'cue').fire('click');
    expect(byAttr('data-error', 'cue').text()).toBe('');
    expect(await loadLibrarySound(ws, 'shift')).toMatchObject({ cue: 0.2, trim: { start: 0.3, end: 1.8 } });
  });

  it('leaves an untouched stored cue as it is when only the trim end moves', async () => {
    await hold('untouched', { cue: 0.5, trim: { start: 0.1, end: 1.5 } });
    await soundWizard.showSoundWizard('untouched');
    player().currentTime = 1.2;
    await byAttr('data-set', 'trim-end').fire('click');
    await byAttr('data-next', 'cue').fire('click');
    expect(await loadLibrarySound(ws, 'untouched')).toMatchObject({ cue: 0.5, trim: { start: 0.1, end: 1.2 } });
  });

  it('stores a cue set after Trim start here, even when its number equals the stored one', async () => {
    // Stored cue 0.5, no trim. The trim starts at 0.3, then the cue is set at 0.8 of the file: 0.5 after the trim's
    // start, the same number as before but another moment, so it must be sent and not shifted by the library.
    await hold('again', { cue: 0.5 });
    await soundWizard.showSoundWizard('again');
    player().currentTime = 0.3;
    await byAttr('data-set', 'trim-start').fire('click');
    player().currentTime = 1.8;
    await byAttr('data-set', 'trim-end').fire('click');
    player().currentTime = 0.8;
    await byAttr('data-set', 'cue').fire('click');
    expect(byField('cue').value).toBe('0.5');
    await byAttr('data-next', 'cue').fire('click');
    expect(await loadLibrarySound(ws, 'again')).toMatchObject({ cue: 0.5, trim: { start: 0.3, end: 1.8 } });
  });

  it('keeps a staged cue at 0 when Trim start here passes it', async () => {
    await hold('passed', { cue: 0.2 });
    await soundWizard.showSoundWizard('passed');
    player().currentTime = 0.5;
    await byAttr('data-set', 'trim-start').fire('click');
    expect(byField('cue').value).toBe('0');
  });

  it('refuses an entry that is not a number in step 2 with its reason, sends nothing and keeps the fields', async () => {
    await hold('garbled', { cue: 0.4, trim: { start: 0.1, end: 1.5 } });
    await soundWizard.showSoundWizard('garbled');
    // A browser reads "0.1-1.2" in a number field as an empty value and flags it as bad input.
    Object.assign(byField('trim-start'), { value: '', validity: { badInput: true } });
    await byField('trim-start').fire('input');
    await byAttr('data-next', 'cue').fire('click');
    expect(byAttr('data-error', 'cue').text()).toBe('Not a number of seconds: Trim start in seconds. Enter it like 0.25.');
    expect([byField('cue').value, byField('trim-end').value]).toEqual(['0.4', '1.5']);
    expect(await loadLibrarySound(ws, 'garbled')).toMatchObject({ cue: 0.4, trim: { start: 0.1, end: 1.5 } });
  });

  it('names an invalid cue in step 2 and keeps what was set', async () => {
    await hold('scratch');
    await soundWizard.showSoundWizard('scratch');
    byField('cue').value = '5';
    await byField('cue').fire('input');
    await byAttr('data-next', 'cue').fire('click');
    expect(byAttr('data-error', 'cue').text()).toMatch(/cue/);
    expect(byField('cue').value).toBe('5');
    expect((await loadLibrarySound(ws, 'scratch')).cue).toBeUndefined();
  });

  it('leaves the licence unknown when step 3 has none, says the release check flags it, and links to the sound', async () => {
    await hold('airhorn');
    await soundWizard.showSoundWizard('airhorn');
    expect(one((e) => e.has('uw-licence-note')).text()).toMatch(/release check/);
    expect(byField('licence').value).toBe('');
    byField('source').value = 'recorded at home';
    await byAttr('data-save', 'licence').fire('click');
    expect(await loadLibrarySound(ws, 'airhorn')).toMatchObject({ licence: 'unknown', source: 'recorded at home' });
    expect(one((e) => e.has('uw-licence')).text()).toBe('unknown');
    expect(one((e) => e.has('uw-licence-note')).text()).toMatch(/release check/);
    expect(one((e) => e.has('uw-done')).getAttribute('href')).toBe('#/sounds/airhorn');
  });

  it('names an unknown sound and links back to the wizard', async () => {
    await soundWizard.showSoundWizard('nothing-here');
    expect(main.text()).toContain('No sound "nothing-here" in the library.');
  });
});

describe('the Sounds view', () => {
  it('has no inline upload form, and its + New opens #/new/sound', async () => {
    hash = '#/sounds';
    await sounds.showSounds();
    expect(find((e) => e.tagName === 'FORM')).toEqual([]);
    expect(find((e) => e.tagName === 'INPUT' && e.getAttribute('type') === 'file')).toEqual([]);
    expect(main.text()).not.toMatch(/Upload a sound/);
    await one((e) => e.has('sd-new')).fire('click');
    expect(hash).toBe('#/new/sound');
  });
});
