// The project list (ST-057, ADR 0058): packages/cli/src/board/projects.js. No DOM library is installed, so a small
// fake document stands in for the page, as in board-nav.test.ts.
import { mkdtemp, cp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '../packages/cli/src/new-project.ts';
import { createSeries } from '../packages/cli/src/new-series.ts';
import { productionOverview } from '../packages/cli/src/board-production.ts';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  value = '';
  checked = false;
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

interface Production { projects: Record<string, unknown>[]; series: Record<string, unknown>[] }
interface ListState { q: string; kind: string[]; status: string[]; series: string; group: boolean; sort: string; dir: string }
interface Row { item?: { slug: string; title: string; kind: string | null; planned?: boolean; error?: string }; indent?: boolean; head?: boolean; divider?: boolean }
interface List {
  parseListState(query: string, seriesSlugs?: string[]): ListState;
  listHash(state: ListState): string;
  listItems(production: Production, releases: unknown[], today: string): { items: unknown[]; planned: unknown };
  listRows(list: unknown, state: ListState): Row[];
  showProjects(): Promise<void>;
}

let list: List;
let main: FakeElement;
let hash = '';
const replaced: string[] = [];
let responses: Record<string, unknown> = {};

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (data: string) => ({ data }),
    getElementById: (id: string) => (id === 'main' ? main : null),
    documentElement: new FakeElement('html'),
  });
  vi.stubGlobal('location', { get hash() { return hash; }, set hash(value: string) { hash = value; } });
  vi.stubGlobal('history', { replaceState: (_s: unknown, _t: string, url: string) => { hash = url; replaced.push(url); } });
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => responses[path] }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  list = (await import('../packages/cli/src/board/projects.js')) as List;
});

beforeEach(() => { main = new FakeElement('main'); replaced.length = 0; });

const temporary: string[] = [];
afterEach(async () => { await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))); });

// ---- fixtures in the shape of /api/production and /api/projects ----

const stages = [{ id: 'setup', label: 'Setup', status: 'done' }, { id: 'assets', label: 'Assets', status: 'pending' }];
function project(slug: string, extra: Record<string, unknown> = {}) {
  return {
    slug, kind: 'music-video', title: slug, phase: 'ready', stages, current: 'assets',
    next: { where: 'claude', command: `/video-next ${slug}`, reason: 'pipeline', stage: 'assets' }, lastActivity: '2026-11-01T10:00:00Z', ...extra,
  };
}
function episode(slug: string, series: string, n: number, extra: Record<string, unknown> = {}) {
  return project(slug, { kind: 'episode', series, episode: n, ...extra });
}
function series(slug: string, title: string, episodes: { episode: number; title: string; slug?: string }[], extra: Record<string, unknown> = {}) {
  return { slug, title, format: '9:16', episodes, next: { where: 'claude', command: '/new-episode', reason: 'episode' }, ...extra };
}

const done = { phase: 'done', current: undefined, stages: stages.map((s) => ({ ...s, status: 'done' })) };
const fixture: Production = {
  projects: [
    project('neon-rain', { title: 'Neon Rain', lastActivity: '2026-11-20T10:00:00Z' }),
    project('nachtschicht', { title: 'Nachtschicht', lastActivity: '2026-11-25T10:00:00Z' }),
    project('cat-meme', { kind: 'meme', title: 'Cat Meme', lastActivity: '2026-11-27T10:00:00Z', next: { where: 'none', reason: 'running', stage: 'assets' } }),
    project('old-song', { title: 'Old Song', lastActivity: '2026-10-01T10:00:00Z', ...done, next: { where: 'board', reason: 'release' } }),
    episode('nachtschicht-e01', 'drift', 1, { title: 'Pilot', lastActivity: '2026-11-26T10:00:00Z' }),
    episode('drift-e02', 'drift', 2, { title: 'Second', lastActivity: '2026-11-10T10:00:00Z' }),
    episode('drift-e03', 'drift', 3, { title: 'Third', lastActivity: '2026-11-12T10:00:00Z' }),
    episode('fog-e01', 'fog', 1, { title: 'Fog One', lastActivity: '2026-11-05T10:00:00Z' }),
    { slug: 'broken', error: 'project.yaml: budget_usd must be a number' },
  ],
  series: [
    series('drift', 'Drift', [
      { episode: 1, title: 'Pilot', slug: 'nachtschicht-e01' }, { episode: 2, title: 'Second', slug: 'drift-e02' },
      { episode: 3, title: 'Third', slug: 'drift-e03' }, { episode: 4, title: 'Fourth' }, { episode: 5, title: 'Finale' },
    ]),
    series('fog', 'Fog', [{ episode: 1, title: 'Fog One', slug: 'fog-e01' }, { episode: 2, title: 'Fog Two' }]),
  ],
};
// old-song is done and every release event is ticked off: released.
const releases = [{ slug: 'old-song', title: 'Old Song', releaseDate: '2026-12-24', total: 3, done: 3 }];

const state = (query = '') => list.parseListState(query, ['drift', 'fog']);
const rows = (query = '', data = fixture) => list.listRows(list.listItems(data, releases, '2026-11-28'), state(query));
const slugs = (query = '', data = fixture) => rows(query, data).map((r) => (r.divider ? '--' : r.item!.planned ? `planned:${r.item!.title}` : r.item!.slug));

function respond(data: Production) { responses = { '/api/production': data, '/api/projects': releases }; }
async function open(address: string, data: Production = fixture) {
  respond(data);
  hash = address;
  await list.showProjects();
}
const find = (predicate: (e: FakeElement) => boolean) => main.all().filter(predicate);
const button = (text: string) => find((e) => e.tagName === 'BUTTON' && e.text() === text)[0]!;
const bodyRows = () => find((e) => e.tagName === 'TBODY')[0]?.children ?? [];

describe('the project list', () => {
  it('shows every project and series of a fixture workspace, newest activity first', async () => {
    const ws = await mkdtemp(join(tmpdir(), 'coreslopper-list-'));
    temporary.push(ws);
    for (const folder of ['config', 'templates', 'brand']) await cp(join(process.cwd(), folder), join(ws, folder), { recursive: true });
    const at = { 'neon': '2026-11-20T10:00:00Z', 'cat': '2026-11-27T10:00:00Z', 'old': '2026-10-01T10:00:00Z' } as const;
    for (const [slug, when] of Object.entries(at)) {
      const dir = await createProject({ root: ws, slug, budget: 10, ...(slug === 'cat' ? { kind: 'meme' as const } : {}) });
      for (const sub of ['', 'review', 'review/progress', 'assets', 'assets/review', 'renders']) {
        for (const entry of await readdir(join(dir, sub), { withFileTypes: true }).catch(() => [])) {
          if (entry.isFile()) await utimes(join(dir, sub, entry.name), new Date(when), new Date(when));
        }
      }
    }
    await createSeries({ root: ws, slug: 'drift', budget: 60 });
    const production = (await productionOverview(ws)) as unknown as Production;
    expect(slugs('', production)).toEqual(['cat', 'neon', 'old', 'drift']);
    expect(rows('', production).map((r) => r.item!.kind)).toEqual(['meme', 'video', 'video', 'series']);

    await open('#/projects', production);
    const cells = bodyRows().map((r) => r.children.map((c) => c.text()));
    expect(cells[0]!.slice(0, 2)).toEqual(['Catcat', 'Meme']);
    expect(find((e) => e.tagName === 'TH').map((e) => e.text())).toEqual(['Title', 'Kind', 'Status', 'Phase', 'Next step', 'Release day', 'Last activity ▼']);
  });

  it('shows per row the kind, state, phase, next step, release day with its done marks, and opens the row', async () => {
    await open('#/projects');
    const text = (slug: string) => bodyRows().find((r) => r.getAttribute('data-slug') === slug)!.children.map((c) => c.text());
    expect(text('nachtschicht-e01').slice(1, 5)).toEqual(['Episode 1 · Drift', 'Your turn', 'Assets', '/video-next nachtschicht-e01']);
    expect(text('old-song').slice(2, 6)).toEqual(['Released', 'Done', 'Approve the release', '2026-12-24 · 3/3']);
    expect(text('cat-meme')[2]).toBe('Running');
    expect(text('drift').slice(1, 4)).toEqual(['Series', 'Your turn', '3/5 episodes created']);
    bodyRows().find((r) => r.getAttribute('data-slug') === 'drift')!.fire('click');
    expect(hash).toBe('#/s/drift');
    bodyRows().find((r) => r.getAttribute('data-slug') === 'neon-rain')!.fire('click');
    expect(hash).toBe('#/p/neon-rain');
  });

  it('sorts by a column header and reverses on the second click', async () => {
    await open('#/projects');
    const header = (label: string) => find((e) => e.tagName === 'TH' && e.text().startsWith(label))[0]!;
    header('Title').fire('click');
    expect(hash).toBe('#/projects?sort=title');
    expect(bodyRows().map((r) => r.getAttribute('data-slug') ?? r.children[0]!.text()).slice(0, 3)).toEqual(['broken', 'cat-meme', 'drift']);
    header('Title').fire('click');
    expect(hash).toBe('#/projects?sort=title&dir=desc');
    header('Release day').fire('click');
    expect(hash).toBe('#/projects?sort=release');
    expect(bodyRows()[0]!.getAttribute('data-slug')).toBe('old-song');
  });

  it('searches title and slug case-insensitively while typing', async () => {
    expect(slugs('q=NACHT')).toEqual(['nachtschicht-e01', 'nachtschicht']);
    await open('#/projects');
    const search = find((e) => e.tagName === 'INPUT' && e.getAttribute('type') === 'search')[0]!;
    search.value = 'NACHT';
    search.fire('input');
    expect(hash).toBe('#/projects?q=NACHT');
    expect(bodyRows().map((r) => r.getAttribute('data-slug'))).toEqual(['nachtschicht-e01', 'nachtschicht']);
    // The field stays in place, so it keeps its focus.
    expect(find((e) => e.tagName === 'INPUT' && e.getAttribute('type') === 'search')[0]).toBe(search);
  });

  it('filters by kind and state with "or" inside a filter and "and" between them, released projects included', () => {
    expect(slugs('kind=meme,series')).toEqual(['cat-meme', 'drift', 'fog']);
    expect(slugs('status=released')).toEqual(['old-song']);
    expect(slugs('status=running,released')).toEqual(['cat-meme', 'old-song']);
    expect(slugs('kind=video&status=yours')).toEqual(['nachtschicht', 'neon-rain']);
    expect(slugs()).toContain('old-song');
  });

  it('shows exactly the 3 episodes of a series with the series filter', () => {
    expect(slugs('series=drift')).toEqual(['nachtschicht-e01', 'drift-e03', 'drift-e02']);
  });

  it('groups each episode under its series with its planned episodes, and hides the planned ones while searching', () => {
    expect(slugs('group=series')).toEqual([
      'drift', 'nachtschicht-e01', 'drift-e03', 'drift-e02', 'planned:Fourth', 'planned:Finale',
      'fog', 'fog-e01', 'planned:Fog Two',
      '--', 'cat-meme', 'nachtschicht', 'neon-rain', 'old-song', 'broken',
    ]);
    expect(rows('group=series').filter((r) => r.indent).every((r) => r.item!.kind === 'episode')).toBe(true);
    expect(slugs('group=series&q=e0')).toEqual(['drift', 'nachtschicht-e01', 'drift-e03', 'drift-e02', 'fog', 'fog-e01']);
    expect(slugs('group=series&status=yours').some((s) => s.startsWith('planned:'))).toBe(false);
  });

  it('restores the series filter and the grouping from the address after a reload, and ignores unknown values', async () => {
    await open('#/projects?series=drift&group=series');
    expect(bodyRows().map((r) => r.getAttribute('data-slug') ?? r.text())).toEqual(['drift', 'nachtschicht-e01', 'drift-e03', 'drift-e02', 'FourthEpisode 4 · Driftplanned', 'FinaleEpisode 5 · Driftplanned']);
    const select = find((e) => e.tagName === 'SELECT')[0]!;
    expect(select.value).toBe('drift');
    expect(find((e) => e.has('pl-group'))[0]!.checked).toBe(true);
    expect(state('kind=film,meme&status=late&series=nope&group=yes&sort=size&dir=up')).toEqual({ q: '', kind: ['meme'], status: [], series: '', group: false, sort: 'activity', dir: 'desc' });
    const all = { q: 'a&b c', kind: ['video', 'meme'], status: ['done'], series: 'drift', group: true, sort: 'title', dir: 'desc' };
    expect(state(list.listHash(all).split('?')[1])).toEqual(all);
  });

  it('says when no project matches, and Reset filters clears search, filters and grouping', async () => {
    await open('#/projects?q=zzz&kind=meme&group=series');
    expect(main.text()).toContain('No project matches these filters');
    expect(bodyRows()).toEqual([]);
    find((e) => e.has('pl-nomatch'))[0]!.all().find((e) => e.tagName === 'BUTTON')!.fire('click');
    expect(hash).toBe('#/projects');
    expect(bodyRows()).toHaveLength(fixture.projects.length + fixture.series.length);
    expect(find((e) => e.has('pl-group'))[0]!.checked).toBe(false);
    expect(button('Music video').getAttribute('aria-pressed')).toBe('false');
  });

  it('toggles a kind filter and the grouping from the filter bar', async () => {
    await open('#/projects');
    button('Meme').fire('click');
    expect(hash).toBe('#/projects?kind=meme');
    expect(bodyRows().map((r) => r.getAttribute('data-slug'))).toEqual(['cat-meme']);
    button('Meme').fire('click');
    const group = find((e) => e.has('pl-group'))[0]!;
    group.checked = true;
    group.fire('change');
    expect(hash).toBe('#/projects?group=series');
  });

  it('says "No projects yet" with a link to the wizard in a workspace without projects', async () => {
    await open('#/projects', { projects: [], series: [] });
    expect(main.text()).toContain('No projects yet');
    expect(find((e) => e.tagName === 'A').map((a) => a.getAttribute('href'))).toEqual(['#/new']);
    expect(find((e) => e.tagName === 'TABLE')).toEqual([]);
  });

  it('shows an unreadable project as a row with its error', async () => {
    await open('#/projects');
    const broken = bodyRows().find((r) => r.has('pl-error'))!;
    expect(broken.text()).toContain('broken');
    expect(broken.text()).toContain('project.yaml: budget_usd must be a number');
    expect(slugs('q=brok')).toEqual(['broken']);
    expect(slugs('kind=video')).not.toContain('broken');
  });
});
