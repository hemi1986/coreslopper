// Characterization tests of the board's shell (adoption of the board shell, 2026-11-22).
// They pin what the server does today, not what it should do: a read answers any Host (G-209), a malformed
// JSON body is a 500 (G-211) and a reversed range a 416 (G-212). Change them together with those gaps.
import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { createProject } from '../packages/cli/src/new-project.ts';
import { createSeries } from '../packages/cli/src/new-series.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

async function workspace(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-board-shell-'));
  temporary.push(dir);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(dir, folder), { recursive: true });
  return dir;
}

const BOARD = { host: '127.0.0.1:4848', origin: 'http://127.0.0.1:4848', 'content-type': 'application/json' };

interface Answer { status: number; headers: Record<string, unknown>; body: string }

function call(handler: ReturnType<typeof boardHandler>, method: string, url: string, headers: Record<string, string>, body?: string): Promise<Answer> {
  const req = Object.assign(Readable.from(body === undefined ? [] : [Buffer.from(body)]), { method, url, headers });
  return new Promise((done) => {
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(name: string, value: unknown) { this.headers[name.toLowerCase()] = value; },
      writeHead(status: number, head: Record<string, unknown> = {}) { this.statusCode = status; Object.assign(this.headers, head); return this; },
      write(chunk: Buffer | string) { chunks.push(Buffer.from(chunk)); return true; },
      end(chunk?: Buffer | string) { if (chunk) chunks.push(Buffer.from(chunk)); done({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') }); },
      on() { return this; }, once() { return this; }, emit() { return true; }, removeListener() { return this; },
    };
    void handler(req as never, res as never);
  });
}

describe('board shell (characterization)', () => {
  it('answers a read from any Host, while a write from that Host is refused', async () => {
    const ws = await workspace();
    await createProject({ root: ws, slug: 'neon', budget: 25 });
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const foreign = { host: 'rebound.example:4848' };

    const read = await call(handler, 'GET', '/api/production', foreign);
    expect(read.status).toBe(200);
    expect(JSON.parse(read.body).projects[0]).toMatchObject({ slug: 'neon' });

    const write = await call(handler, 'POST', '/api/new/video', { ...foreign, 'content-type': 'application/json' }, '{}');
    expect(write.status).toBe(403);
    expect(JSON.parse(write.body).error).toMatch(/127\.0\.0\.1 only/);
  });

  it('refuses a JSON body over 64 KiB with 400 and answers a malformed one with 500', async () => {
    const ws = await workspace();
    const handler = boardHandler({ root: ws, refresh: async () => undefined });

    const large = await call(handler, 'POST', '/api/new/video', BOARD, JSON.stringify({ title: 'x'.repeat(70 * 1024) }));
    expect(large.status).toBe(400);
    expect(JSON.parse(large.body).error).toBe('request body too large');

    const malformed = await call(handler, 'POST', '/api/new/video', BOARD, '{"title":');
    expect(malformed.status).toBe(500);
  });

  it("serves a series canon's bible and refuses its series.yaml", async () => {
    const ws = await workspace();
    const dir = await createSeries({ root: ws, slug: 'drift', budget: 60 });
    await writeFile(join(dir, 'bible.md'), '# Bible\n\nA coastal town.\n');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const local = { host: '127.0.0.1:4848' };

    const bible = await call(handler, 'GET', '/series-files/drift/bible.md', local);
    expect(bible.status).toBe(200);
    expect(bible.body).toContain('A coastal town.');
    expect(bible.headers['content-security-policy']).toContain('sandbox');
    expect((await call(handler, 'GET', '/series-files/drift/series.yaml', local)).status).toBe(403);
    expect((await call(handler, 'GET', '/series-files/nope/bible.md', local)).status).toBe(400);
  });

  it('answers a suffix range with its last bytes and an unsatisfiable or reversed range with 416', async () => {
    const ws = await workspace();
    const dir = await createProject({ root: ws, slug: 'neon', budget: 25 });
    await writeFile(join(dir, 'renders', 'preview-16x9.mp4'), 'abcdefghij');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const ranged = (range: string) => call(handler, 'GET', '/files/neon/renders/preview-16x9.mp4', { host: '127.0.0.1:4848', range });

    const tail = await ranged('bytes=-4');
    expect(tail).toMatchObject({ status: 206, body: 'ghij' });
    expect(tail.headers['content-range']).toBe('bytes 6-9/10');

    const beyond = await ranged('bytes=20-');
    expect(beyond.status).toBe(416);
    expect(beyond.headers['content-range']).toBe('bytes */10');
    expect((await ranged('bytes=5-2')).status).toBe(416);
  });

  it('reports no round and no events before the watchdog ran', async () => {
    const ws = await workspace();
    const handler = boardHandler({ root: ws, refresh: async () => undefined });

    const activity = await call(handler, 'GET', '/api/activity', { host: '127.0.0.1:4848' });
    expect(activity.status).toBe(200);
    expect(JSON.parse(activity.body)).toEqual({ stalled: [], events: [] });
  });
});

describe('the guide view’s docs', () => {
  it('serves a top-level page and an image of docs/, and nothing else', async () => {
    const ws = await workspace();
    await cp(join(root, 'docs', 'board-guide.md'), join(ws, 'docs', 'board-guide.md'));
    await cp(join(root, 'docs', 'assets', 'board', 'en', 'new.webp'), join(ws, 'docs', 'assets', 'board', 'en', 'new.webp'));
    await writeFile(join(ws, 'docs', '.secret.md'), 'no');
    const handler = boardHandler({ root: ws, refresh: async () => undefined });

    const page = await call(handler, 'GET', '/docs/board-guide.md', BOARD);
    expect(page.status).toBe(200);
    expect(page.body).toContain('# Board guide');
    expect((await call(handler, 'GET', '/docs/assets/board/en/new.webp', BOARD)).status).toBe(200);

    for (const refused of ['/docs/.secret.md', '/docs/../package.json', '/docs/%2e%2e%2fpackage.json', '/docs/adr/0030-board-as-hub.md', '/docs/assets/board/en/missing.webp']) {
      expect((await call(handler, 'GET', refused, BOARD)).status, refused).toBe(404);
    }
  });
});
