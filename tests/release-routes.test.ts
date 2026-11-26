import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { buildRelease } from '../packages/cli/src/release.ts';
import { releaseRoutes } from '../packages/cli/src/release-board-routes.ts';
import { cleanupFixtures, fakeDeps, fixture } from './helpers/release-fixture.ts';

// The release view's own routes over the stub request the shell tests use: a
// status click must not list the workspace, while the list routes do.

afterEach(cleanupFixtures);

interface Answer {
  status: number;
  headers: Record<string, unknown>;
  body: string;
}

function call(routes: ReturnType<typeof releaseRoutes>, method: string, url: string, payload?: unknown): Promise<Answer> {
  const raw = payload === undefined ? undefined : JSON.stringify(payload);
  const req = Object.assign(Readable.from(raw === undefined ? [] : [Buffer.from(raw)]), {
    method,
    url,
    headers: { host: '127.0.0.1:4848', ...(raw === undefined ? {} : { 'content-type': 'application/json' }) },
  });
  return new Promise((done, fail) => {
    const chunks: Buffer[] = [];
    const res = {
      statusCode: 200,
      headers: {} as Record<string, unknown>,
      setHeader(name: string, value: unknown) {
        this.headers[name.toLowerCase()] = value;
      },
      writeHead(status: number, head: Record<string, unknown> = {}) {
        this.statusCode = status;
        Object.assign(this.headers, head);
        return this;
      },
      write(chunk: Buffer | string) {
        chunks.push(Buffer.from(chunk));
        return true;
      },
      end(chunk?: Buffer | string) {
        if (chunk) chunks.push(Buffer.from(chunk));
        done({ status: this.statusCode, headers: this.headers, body: Buffer.concat(chunks).toString('utf8') });
      },
      on() {
        return this;
      },
      once() {
        return this;
      },
      emit() {
        return true;
      },
      removeListener() {
        return this;
      },
    };
    const parsed = new URL(url, 'http://localhost');
    void routes.handle(req as never, res as never, decodeURIComponent(parsed.pathname), parsed.searchParams).catch(fail);
  });
}

describe('the release view’s routes', () => {
  it('owns the release URL family and leaves the production and shell paths alone', () => {
    const routes = releaseRoutes({ root: '/none', listProjects: async () => [] });
    for (const path of ['/api/projects', '/api/projects/neon', '/api/projects/neon/status', '/api/calendar', '/calendar.ics', '/media/neon/video']) {
      expect(routes.matches(path), path).toBe(true);
    }
    for (const path of ['/api/production', '/api/review/neon', '/api/new/video', '/api/channel', '/files/neon/brief.md', '/']) {
      expect(routes.matches(path), path).toBe(false);
    }
  });

  it('reads and writes one project without listing the workspace', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const refreshed: string[] = [];
    let listings = 0;
    const routes = releaseRoutes({
      root,
      now: () => new Date('2026-12-11T17:05:00Z'),
      refresh: async (projectDir) => void refreshed.push(projectDir),
      listProjects: async () => {
        listings += 1;
        throw new Error('listed the workspace');
      },
    });

    const board = await call(routes, 'GET', '/api/projects/neon');
    expect(board.status).toBe(200);
    expect(JSON.parse(board.body)).toMatchObject({ slug: 'neon', title: 'Neon Rain' });
    expect(listings).toBe(0);

    const posted = await call(routes, 'POST', '/api/projects/neon/status', { id: 'youtube', done: true, url: 'https://youtu.be/abc' });
    expect(posted.status).toBe(200);
    expect(JSON.parse(posted.body).items.youtube).toMatchObject({ done: true, url: 'https://youtu.be/abc' });
    expect(listings).toBe(0);
    await new Promise((done) => setTimeout(done, 10));
    expect(refreshed).toEqual([dir]);

    // The list routes are the only ones that ask for the workspace's projects.
    await expect(call(routes, 'GET', '/api/projects')).rejects.toThrow('listed the workspace');
    expect(listings).toBe(1);
  });

  it('serves the calendar and its .ics from the listed projects', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const routes = releaseRoutes({ root, now: () => new Date('2026-12-11T17:05:00Z'), listProjects: async () => [dir] });

    const events = await call(routes, 'GET', '/api/calendar');
    expect(events.status).toBe(200);
    expect(JSON.parse(events.body).find((event: { id: string }) => event.id === 'youtube')).toMatchObject({ project: 'neon' });

    const ics = await call(routes, 'GET', '/calendar.ics');
    expect(ics.status).toBe(200);
    expect(ics.headers['content-disposition']).toBe('attachment; filename="release-calendar.ics"');
    expect(ics.body).toContain('SUMMARY:Neon Rain:');
  });

  it('serves release-folder media and refuses a path outside it', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const routes = releaseRoutes({ root, listProjects: async () => [dir] });

    const video = await call(routes, 'GET', '/media/neon/video/neon-16x9.mp4');
    expect(video.status).toBe(200);
    expect((await call(routes, 'GET', '/media/neon/..%2F..%2Fproject.yaml')).status).toBe(403);
  });
});
