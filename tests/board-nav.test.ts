// The board navigation (ST-056, ADR 0058): packages/cli/src/board/nav.js. No DOM library is installed, so a small
// fake document stands in for the page.
import { readFile } from 'node:fs/promises';
import { beforeAll, describe, expect, it, vi } from 'vitest';

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  listeners = new Map<string, (() => unknown)[]>();
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  set innerHTML(_value: string) { this.children = []; this.textContent = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener(type: string, fn: () => unknown) { this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]); }
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) this.children.push(child);
    else this.textContent += child.data;
    return child;
  }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(''); }
  has(name: string) { return this.className.split(' ').includes(name); }
}

interface Nav {
  NAV_GROUPS: { label: string; entries: [string, string, string][] }[];
  activeEntry(active: string): string;
  renderNav(container: FakeElement, active: string, kept: boolean, onRefresh: () => void): void;
  viewBusy(main: { querySelectorAll(s: string): unknown[]; querySelector(s: string): unknown }): boolean;
}
let nav: Nav;
const hashes: string[] = [];

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (data: string) => ({ data }),
    getElementById: () => null,
    documentElement: new FakeElement('html'),
  });
  vi.stubGlobal('location', {
    get hash() { return hashes.at(-1) ?? ''; },
    set hash(value: string) { hashes.push(value); },
  });
  // @ts-expect-error the board's page modules are plain JS without type declarations
  nav = (await import('../packages/cli/src/board/nav.js')) as Nav;
});

function draw(active: string, kept = false, onRefresh = () => undefined) {
  const bar = new FakeElement('header');
  nav.renderNav(bar, active, kept, onRefresh);
  return bar;
}
const buttons = (bar: FakeElement) => bar.all().filter((e) => e.tagName === 'BUTTON');

describe('the board navigation', () => {
  it('shows both groups, + New, Guide and Refresh in this order, and no project or series', () => {
    const bar = draw('overview');
    expect(buttons(bar).map((b) => b.text())).toEqual([
      'Production', 'Projects', 'Release calendar', 'Characters', 'Sets', 'Sounds', '+ New', 'Guide', '↻ Refresh',
    ]);
    const groups = bar.all().filter((e) => e.getAttribute('role') === 'group');
    expect(groups.map((g) => g.getAttribute('aria-label'))).toEqual(['Work', 'Library']);
    expect(bar.all().filter((e) => e.has('primary')).map((b) => b.text())).toEqual(['+ New']);
    // The old column's headings and its folded Released group are gone.
    expect(bar.all().some((e) => e.tagName === 'H2' || e.tagName === 'DETAILS')).toBe(false);
  });

  it('opens each entry at its address', () => {
    const bar = draw('overview');
    for (const button of buttons(bar).slice(0, 8)) button.listeners.get('click')?.[0]?.();
    expect(hashes.slice(-8)).toEqual(['#/', '#/projects', '#/calendar', '#/characters', '#/sets', '#/sounds', '#/new', '#/guide']);
  });

  it('marks the active entry for every route, and Projects for a project, its tabs and a series', () => {
    const cases: [string, string][] = [
      ['overview', 'Production'], ['projects', 'Projects'], ['calendar', 'Release calendar'], ['characters', 'Characters'],
      ['sets', 'Sets'], ['sounds', 'Sounds'], ['new', '+ New'], ['guide', 'Guide'],
      ['project:neon', 'Projects'], ['release:neon', 'Projects'], ['review:neon', 'Projects'], ['series:nacht', 'Projects'],
    ];
    for (const [active, label] of cases) {
      const marked = buttons(draw(active)).filter((b) => b.has('active'));
      expect(marked.map((b) => b.text()), active).toEqual([label]);
      expect(marked[0]?.getAttribute('aria-current')).toBe('page');
    }
  });

  it('knows every view key the routes of app.js set', async () => {
    const source = await readFile(new URL('../packages/cli/src/board/app.js', import.meta.url), 'utf8');
    const keys = [...new Set([...source.matchAll(/active = '([a-z]+)(:?)'/g)].map((m) => (m[1] ?? '') + (m[2] ?? '')))];
    expect(keys.length).toBeGreaterThan(8);
    const entries = new Set([...nav.NAV_GROUPS.flatMap((g) => g.entries.map((e) => e[0])), 'new', 'guide']);
    for (const key of keys) expect(entries.has(nav.activeEntry(key.endsWith(':') ? key + 'x' : key)), key).toBe(true);
  });

  it('runs the refresh from its button and says when it kept the view', () => {
    const onRefresh = vi.fn();
    const bar = draw('review:neon', true, onRefresh);
    buttons(bar).at(-1)?.listeners.get('click')?.[0]?.();
    expect(onRefresh).toHaveBeenCalledOnce();
    expect(bar.text()).toContain('View kept');
    expect(draw('review:neon', false).text()).not.toContain('View kept');
  });

  it('keeps a view with a playing render or an edited field on refresh, and reloads one that is idle', () => {
    const view = (media: { paused: boolean; ended: boolean }[], edited: boolean) => ({
      querySelectorAll: (selector: string) => (selector === 'video, audio' ? media : []),
      querySelector: (selector: string) => (selector === '[data-edited]' && edited ? {} : null),
    });
    expect(nav.viewBusy(view([{ paused: false, ended: false }], false))).toBe(true);
    expect(nav.viewBusy(view([{ paused: true, ended: false }], true))).toBe(true);
    expect(nav.viewBusy(view([{ paused: true, ended: false }, { paused: false, ended: true }], false))).toBe(false);
    expect(nav.viewBusy(view([], false))).toBe(false);
  });
});
