// Demo productions on the board (ST-069, feature demo-projects): the production view, the project list and the
// library hide the demos unless the board's switch Show demos is on (packages/cli/src/board/demos.js, kept in
// localStorage); a workspace with only the demos shows them without the switch; the calendar never lists a demo.
// No DOM library is installed, so a small fake document stands in for the page, as in board-projects.test.ts.
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../packages/cli/src/new-project.ts';
import { productionOverview } from '../packages/cli/src/board-production.ts';
import { addLibraryCharacter, useCharacter } from '../packages/cli/src/character-library.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';
import { buildRelease } from '../packages/cli/src/release.ts';
import { releaseRoutes } from '../packages/cli/src/release-board-routes.ts';
import { cleanupFixtures, fakeDeps, fixture, setDemo } from './helpers/release-fixture.ts';

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

interface Board {
  showProduction(key: string): Promise<unknown>;
}
interface Projects {
  showProjects(): Promise<void>;
}
interface Characters {
  characterItems(data: unknown): { items: { id: string; used: number }[] };
  characterRows(list: unknown, state: unknown): { id: string }[];
  parseCharacterState(query: string, list: unknown): unknown;
  showCharacters(id?: string): Promise<void>;
}

let production: Board;
let projects: Projects;
let characters: Characters;
let main: FakeElement;
let hash = '';
let responses: Record<string, unknown> = {};
const storage = new Map<string, string>();

const temporary: string[] = [];
let mixed = ''; // one real project and the three demos
let demosOnly = ''; // only the three demos

/** A workspace with the shipped demos (`demo`, `demo-episode`, `demo-series`), without their local renders. */
async function workspace(real: boolean): Promise<string> {
  const ws = await mkdtemp(join(tmpdir(), 'coreslopper-board-demos-'));
  temporary.push(ws);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
  for (const slug of ['demo', 'demo-episode', 'demo-series']) {
    const source = join(process.cwd(), 'projects', slug);
    await cp(source, join(ws, 'projects', slug), { recursive: true, filter: (path) => !/[/\\](renders|\.cache)([/\\]|$)/.test(path.slice(source.length)) });
  }
  if (real) await createProject({ root: ws, slug: 'harbor-lights', title: 'Harbor Lights', budget: 20 });
  return ws;
}

/** GET a board route of a workspace through the real handler. */
function get(root: string, url: string): Promise<unknown> {
  const handler = boardHandler({ root, refresh: async () => undefined });
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
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storage.get(key) ?? null,
    setItem: (key: string, value: string) => { storage.set(key, String(value)); },
  });
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => responses[path] ?? { events: [], stalled: [] } }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  production = (await import('../packages/cli/src/board/production.js')) as Board;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  projects = (await import('../packages/cli/src/board/projects.js')) as Projects;
  // @ts-expect-error the board's page modules are plain JS without type declarations
  characters = (await import('../packages/cli/src/board/characters.js')) as Characters;
  mixed = await workspace(true);
  demosOnly = await workspace(false);
});

afterAll(async () => {
  await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  await cleanupFixtures();
});

beforeEach(() => { main = new FakeElement('main'); storage.clear(); hash = ''; });

const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const switches = () => find((e) => e.has('demo-switch'));
const sectionTitles = () => find((e) => e.has('section-title')).map((e) => e.text());
const cardTitles = () => find((e) => e.tagName === 'SECTION' && e.has('card')).map((e) => e.children[0]!.children[0]!.text());
const rowSlugs = () => find((e) => e.tagName === 'TR' && e.getAttribute('data-slug') !== null).map((e) => e.getAttribute('data-slug'));
const dividers = () => find((e) => e.has('pl-divider')).map((e) => e.text());

async function serve(root: string): Promise<void> {
  responses = { '/api/production': await productionOverview(root), '/api/projects': [], '/api/activity': { events: [], stalled: [] } };
}
async function showOverview(): Promise<void> { main = new FakeElement('main'); await production.showProduction('overview'); }
async function showList(): Promise<void> { main = new FakeElement('main'); hash = '#/projects'; await projects.showProjects(); }

describe('demo productions on the board', () => {
  it('shows only the real project in the production view and the project list, with the switch Show demos', async () => {
    await serve(mixed);
    await showOverview();
    expect(cardTitles()).toEqual(['Harbor Lights']);
    expect(sectionTitles()).not.toContain('Demos');
    expect(switches()).toHaveLength(1);
    expect(switches()[0]!.checked).toBe(false);
    expect(main.text()).toContain('Show demos');

    await showList();
    expect(rowSlugs()).toEqual(['harbor-lights']);
    expect(dividers()).toEqual([]);
    expect(switches()).toHaveLength(1);
    expect(find((e) => e.has('pl-count'))[0]!.text()).toBe('1 of 1');
  });

  it('shows the demos in a group Demos after the other groups once the switch is on, and keeps it after a reload', async () => {
    await serve(mixed);
    await showOverview();
    switches()[0]!.checked = true;
    switches()[0]!.fire('change');
    const titles = sectionTitles();
    expect(titles.at(-1)).toBe('Demos');
    expect(cardTitles()[0]).toBe('Harbor Lights');
    expect(cardTitles()).toHaveLength(4);
    expect(cardTitles().slice(1).join(' | ')).toMatch(/Neon Rain/);
    expect(cardTitles().slice(1)).toContain('Night Desk');
    // Each demo card carries the chip Demo.
    expect(find((e) => e.has('demo-chip'))).toHaveLength(3);

    // A reload reads the stored switch: the production view and the project list show the demos.
    await showOverview();
    expect(switches()[0]!.checked).toBe(true);
    expect(sectionTitles().at(-1)).toBe('Demos');
    await showList();
    expect(switches()[0]!.checked).toBe(true);
    expect(rowSlugs()[0]).toBe('harbor-lights');
    expect(rowSlugs().slice(1).sort()).toEqual(['demo', 'demo-episode', 'demo-series']);
    expect(dividers()).toEqual(['Demos']);

    // Off again from the project list: the demos are gone in both views.
    switches()[0]!.checked = false;
    switches()[0]!.fire('change');
    expect(rowSlugs()).toEqual(['harbor-lights']);
    await showOverview();
    expect(cardTitles()).toEqual(['Harbor Lights']);
  });

  it('shows the demos of a workspace with only the demos in the group Demos, without the switch', async () => {
    await serve(demosOnly);
    await showOverview();
    expect(sectionTitles()).toEqual(['Demos']);
    expect(cardTitles()).toHaveLength(3);
    expect(switches()).toEqual([]);

    await showList();
    expect(rowSlugs().sort()).toEqual(['demo', 'demo-episode', 'demo-series']);
    expect(dividers()).toEqual(['Demos']);
    expect(switches()).toEqual([]);
  });

  it('counts a library character used only by demo as unused while demos are hidden, and its page lists "Neon Rain (Demo)"', async () => {
    await addLibraryCharacter(mixed, { name: 'Mira', description: 'A singer with red hair.' });
    await useCharacter(mixed, join(mixed, 'projects', 'demo'), 'mira');
    const library = (await get(mixed, '/api/library')) as { characters: { id: string; usedIn: { slug: string; demo?: true }[] }[]; onlyDemos: boolean };
    expect(library.onlyDemos).toBe(false);
    expect(library.characters.find((c) => c.id === 'mira')!.usedIn).toEqual([{ scope: 'project', slug: 'demo', demo: true, character: 'mira' }]);
    responses = { '/api/library': library };

    const used = () => characters.characterItems(library).items.find((i) => i.id === 'mira')!.used;
    const unused = () => {
      const list = characters.characterItems(library);
      return characters.characterRows(list, characters.parseCharacterState('unused=1', list)).map((i) => i.id);
    };
    expect(used()).toBe(0);
    expect(unused()).toContain('mira');
    storage.set('coreslopper.board.showDemos', '1');
    expect(used()).toBe(1);
    expect(unused()).not.toContain('mira');

    storage.clear();
    hash = '#/characters/mira';
    await characters.showCharacters('mira');
    expect(main.text()).toContain('Used in: Neon Rain (Demo)');
  });

  it('lists no event of a demo with a calendar on the board\'s calendar or in /calendar.ics', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    await setDemo(dir, true);
    const routes = releaseRoutes({ root, now: () => new Date('2026-12-11T17:05:00Z'), listProjects: async () => [dir] });
    const answer = (url: string) => new Promise<string>((done) => {
      const parsed = new URL(url, 'http://localhost');
      const req = Object.assign(Readable.from([]), { method: 'GET', url, headers: { host: '127.0.0.1:4848' } });
      const chunks: Buffer[] = [];
      const res = {
        statusCode: 200, setHeader() {}, writeHead() { return this; },
        write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
        end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done(Buffer.concat(chunks).toString('utf8')); },
      };
      void routes.handle(req as never, res as never, parsed.pathname, parsed.searchParams);
    });
    expect(JSON.parse(await answer('/api/calendar'))).toEqual([]);
    const ics = await answer('/calendar.ics');
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
