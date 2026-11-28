// The board's contact sheet (ST-058, RM-ContactSheet): the read model over a project in a temp workspace, its route,
// and the tab's module with a small fake document, as in board-projects.test.ts.
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { Readable } from 'node:stream';
import { parse, stringify } from 'yaml';
import { contactSheet, type ContactSheet } from '../packages/cli/src/board-contact-sheet.ts';
import { productionDetail } from '../packages/cli/src/board-production.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A workspace with a copy of projects/demo – its tracked files only, never a local render or asset – whose storyboard has 3 shots. */
async function workspace(): Promise<{ ws: string; dir: string }> {
  const ws = await mkdtemp(join(tmpdir(), 'coreslopper-sheet-'));
  temporary.push(ws);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(ws, folder), { recursive: true });
  const demo = join(root, 'projects', 'demo');
  const dir = join(ws, 'projects', 'demo');
  await cp(demo, dir, {
    recursive: true,
    filter: (source) => {
      const rel = relative(demo, source).split(sep);
      return !['renders', 'assets', 'audio', '.cache'].includes(rel[0]!) && rel[0] !== 'timing.effective.json';
    },
  });
  for (const folder of ['renders', 'assets', 'audio']) await mkdir(join(dir, folder), { recursive: true });
  const storyboard = parse(await readFile(join(dir, 'storyboard.yaml'), 'utf8')) as { shots: Array<Record<string, unknown>> };
  const shots = storyboard.shots.slice(0, 3);
  shots[2]!.end = { type: 'section', id: 'outro', edge: 'end' };
  await writeFile(join(dir, 'storyboard.yaml'), stringify({ ...storyboard, shots }));
  return { ws, dir };
}

async function fileKeyframe(dir: string, shot: string): Promise<void> {
  await mkdir(join(dir, 'assets', 'keyframes'), { recursive: true });
  await writeFile(join(dir, 'assets', 'keyframes', `${shot}.png`), 'png');
}

type Handler = ReturnType<typeof boardHandler>;
async function request(handler: Handler, url: string): Promise<{ status: number; body: string }> {
  const req = Object.assign(Readable.from([]), { method: 'GET', url, headers: { host: '127.0.0.1:4000' } });
  let status = 200;
  let body = '';
  const res = {
    writeHead(code: number) { status = code; return res; },
    setHeader() { return res; },
    getHeader() { return undefined; },
    write(chunk: string | Buffer) { body += chunk.toString(); return true; },
    end(chunk?: string | Buffer) { if (chunk) body += chunk.toString(); },
    on() { return res; }, once() { return res; }, emit() { return true; },
  };
  await handler(req as never, res as never);
  return { status, body };
}

const ok = (sheet: ContactSheet) => {
  if (sheet.status !== 'ok') throw new Error(`expected a grid, got ${JSON.stringify(sheet)}`);
  return sheet;
};

describe('the contact sheet read model', () => {
  it('lists every shot in playing order and shows the keyframe only where one is filed', async () => {
    const { dir } = await workspace();
    await fileKeyframe(dir, 'shot-002');
    const sheet = ok(await contactSheet(dir));
    expect(sheet.cards.map((card) => card.id)).toEqual(['shot-001', 'shot-002', 'shot-003']);
    expect(sheet.cards.map((card) => card.keyframe?.path)).toEqual([undefined, 'assets/keyframes/shot-002.png', undefined]);
    expect(sheet.cards[0]).toMatchObject({ source: 'motion', section: 'intro', startSeconds: 0, description: expect.any(String), text: 'NEON RAIN' });
    expect(sheet.cards[0]!.endSeconds).toBe(sheet.cards[1]!.startSeconds);
  });

  it('shows a keyframe filed later on the next read, without a contact-sheet run', async () => {
    const { dir } = await workspace();
    expect(ok(await contactSheet(dir)).cards.some((card) => card.keyframe)).toBe(false);
    await fileKeyframe(dir, 'shot-003');
    expect(ok(await contactSheet(dir)).cards.map((card) => Boolean(card.keyframe))).toEqual([false, false, true]);
  });

  it('has no grid and no error for a project without storyboard.yaml', async () => {
    const { dir } = await workspace();
    await rm(join(dir, 'storyboard.yaml'));
    expect(await contactSheet(dir)).toEqual({ status: 'none' });
  });

  it('shows the validation error of an invalid storyboard instead of a grid', async () => {
    const { dir } = await workspace();
    const storyboard = parse(await readFile(join(dir, 'storyboard.yaml'), 'utf8')) as { shots: Array<Record<string, unknown>> };
    storyboard.shots[1]!.section = 'bridge_9';
    await writeFile(join(dir, 'storyboard.yaml'), stringify(storyboard));
    const sheet = await contactSheet(dir);
    expect(sheet.status).toBe('invalid');
    expect(JSON.stringify(sheet)).toContain('bridge_9');
  });

  it('is served at the project route, and the production view no longer embeds the SVG', async () => {
    const { ws, dir } = await workspace();
    await fileKeyframe(dir, 'shot-002');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const answer = await request(handler, '/api/production/projects/demo/contact-sheet');
    expect(answer.status).toBe(200);
    const sheet = ok(JSON.parse(answer.body) as ContactSheet);
    expect(sheet.cards).toHaveLength(3);
    expect((await request(handler, `/files/demo/${sheet.cards[1]!.keyframe!.path}`)).status).toBe(200);
    expect((await request(handler, '/api/production/projects/nope/contact-sheet')).status).toBe(400);
    expect(await productionDetail(dir)).not.toHaveProperty('contactSheet');
    expect(await readFile(join(root, 'packages/cli/src/board/production.js'), 'utf8')).not.toContain('contact-sheet.svg');
  });
});

// ---- the tab's module ----

class FakeElement {
  tagName: string;
  children: FakeElement[] = [];
  attributes = new Map<string, string>();
  className = '';
  textContent = '';
  constructor(tag: string) { this.tagName = tag.toUpperCase(); }
  set innerHTML(_value: string) { this.children = []; this.textContent = ''; }
  setAttribute(name: string, value: string) { this.attributes.set(name, String(value)); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  appendChild(child: FakeElement | { data: string }) {
    if (child instanceof FakeElement) this.children.push(child);
    else this.textContent += child.data;
    return child;
  }
  all(): FakeElement[] { return this.children.flatMap((c) => [c, ...c.all()]); }
  text(): string { return this.textContent + this.children.map((c) => c.text()).join(''); }
}

interface SheetModule {
  sheetBody(slug: string, sheet: unknown): FakeElement[];
  showContactSheet(slug: string): Promise<void>;
}
let view: SheetModule;
let main: FakeElement;
let responses: Record<string, unknown> = {};

beforeAll(async () => {
  vi.stubGlobal('navigator', { language: 'en-US' });
  vi.stubGlobal('document', {
    createElement: (tag: string) => new FakeElement(tag),
    createTextNode: (data: string) => ({ data }),
    getElementById: (id: string) => (id === 'main' ? main : null),
    documentElement: new FakeElement('html'),
  });
  vi.stubGlobal('location', { hash: '' });
  vi.stubGlobal('fetch', async (path: string) => ({ ok: true, statusText: 'OK', json: async () => responses[path] }));
  // @ts-expect-error the board's page modules are plain JS without type declarations
  view = (await import('../packages/cli/src/board/contact-sheet.js')) as SheetModule;
});

const card = (id: string, keyframe?: string) => ({
  id, source: 'ai-clip', section: 'verse_1', startSeconds: 4, endSeconds: 8.5, description: `the ${id}`,
  ...(keyframe ? { keyframe: { path: keyframe, modified: '2026-11-28T10:00:00.000Z' } } : {}),
});
const nodes = (body: FakeElement[]) => body.flatMap((node) => [node, ...node.all()]);

describe('the contact sheet tab', () => {
  it('draws one card per shot, the keyframe opening full size, a placeholder with the source otherwise', () => {
    const body = view.sheetBody('demo', { status: 'ok', durationSeconds: 12, cards: [card('shot-001'), card('shot-002', 'assets/keyframes/shot-002.png'), card('shot-003')] });
    const cards = nodes(body).filter((node) => node.className === 'sheet-card');
    expect(cards.map((node) => node.getAttribute('data-shot'))).toEqual(['shot-001', 'shot-002', 'shot-003']);
    const images = nodes(body).filter((node) => node.tagName === 'IMG');
    expect(images).toHaveLength(1);
    expect(images[0]!.getAttribute('src')).toMatch(/^\/files\/demo\/assets\/keyframes\/shot-002\.png\?v=/);
    const link = nodes(body).find((node) => node.tagName === 'A')!;
    expect(link.getAttribute('href')).toBe(images[0]!.getAttribute('src'));
    expect(link.getAttribute('target')).toBe('_blank');
    expect(cards[0]!.text()).toContain('AI clip');
    expect(cards[0]!.text()).toContain('0:04.0–0:08.5');
  });

  it('says there is no storyboard yet, or shows the validation error', () => {
    expect(nodes(view.sheetBody('demo', { status: 'none' })).map((node) => node.text()).join('')).toContain('No storyboard yet');
    const invalid = nodes(view.sheetBody('demo', { status: 'invalid', error: 'storyboard is invalid', details: ['Unknown section "bridge_9"'] }));
    expect(invalid.some((node) => node.className === 'sheet')).toBe(false);
    expect(invalid[0]!.text()).toContain('Unknown section "bridge_9"');
  });

  it('opens as a tab of the project page', async () => {
    main = new FakeElement('main');
    responses = {
      '/api/production/projects/demo': { slug: 'demo', title: 'Neon Rain', hasRelease: false },
      '/api/production/projects/demo/contact-sheet': { status: 'ok', durationSeconds: 12, cards: [card('shot-001')] },
    };
    await view.showContactSheet('demo');
    const active = main.all().find((node) => node.className === 'tab active')!;
    expect(active.text()).toBe('Contact sheet');
    expect(main.all().filter((node) => node.className === 'sheet-card')).toHaveLength(1);
  });
});
