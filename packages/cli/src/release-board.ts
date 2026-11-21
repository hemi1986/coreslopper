import { createReadStream, existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError, calendarIcs, loadChannel, repoRoot, type ReleaseCalendar } from '@coreslopper/core';
import { boardProject, type BoardProject } from './release-board-data.js';
import { loadEvents, loadSnapshot } from './production-watch.js';
import { SLUG, productionDetail, productionOverview, productionSeries, projectDirs, seriesDirs } from './board-production.js';
import { loadCalendar, updateStatus } from './release-calendar.js';
import { releaseDir } from './release.js';

// The board: a local web page over the workspace. Its production view shows
// every project and series as the pipeline leaves them (stages, budget,
// queue, reviews, renders, the next command for Claude Code). Its release
// view shows, per platform, which file goes where, the texts to paste with
// their limits, the settings to check, and the calendar; the user ticks off
// what is posted and enters the live URL, which lands in
// review/release-status.json. Writes come only from its own page (see
// trustedWrite): the status files, the approval, and the autopilot's retry and
// takeover marks (and, on approval of a proposed date,
// release.release_date in project.yaml).

export interface BoardOptions {
  /** The workspace (or repository) root; projects live in its projects/. */
  root?: string;
  port?: number;
  host?: string;
  now?: () => Date;
  /** Lay out the texts and the microsite data again after a status change (default: release without rendering). */
  refresh?: (projectDir: string) => Promise<void>;
}

/** The quick refresh after a live URL arrives: texts and microsite data, no renders, no new stills. */
async function quickRelease(projectDir: string): Promise<void> {
  const { buildRelease } = await import('./release.js');
  await buildRelease({ projectDir, render: false, stills: false, deps: { log: () => undefined } });
}

const MIME: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.lrc': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8',
  '.md': 'text/plain; charset=utf-8',
  '.ics': 'text/calendar; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.yaml': 'text/plain; charset=utf-8',
  '.yml': 'text/plain; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

/** What the board serves from a project, relative to the project: its media folders and its documents. */
const PROJECT_FILES = /^(renders|review|assets|characters|sets|props)\/|^(brief\.md|treatment\.md|storyboard\.md|timing\.report\.md|lyrics\.txt|script\.yaml)$/;
/** What the board serves from a series canon. */
const SERIES_FILES = /^(characters|sets|props|assets|review)\/|^(bible\.md)$/;
/** The page's own files in ./board/. */
const PAGE_FILE = /^[a-z][a-z0-9-]*\.(js|css)$/;
const pageDir = fileURLToPath(new URL('./board/', import.meta.url));

/** Project directories of the workspace that have a release folder or a calendar. */
export async function boardProjectDirs(root: string): Promise<string[]> {
  const dir = join(root, 'projects');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && SLUG.test(entry.name) && existsSync(join(dir, entry.name, 'project.yaml')))
    .map((entry) => join(dir, entry.name))
    .filter((path) => existsSync(join(releaseDir(path), 'manifest.json')) || existsSync(join(path, 'review', 'calendar.yaml')))
    .sort();
}

function send(res: ServerResponse, status: number, body: string | Buffer, type = 'application/json; charset=utf-8'): void {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}

const json = (res: ServerResponse, value: unknown, status = 200) => send(res, status, JSON.stringify(value));

async function body(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 64 * 1024) throw new ValidationError('request body too large');
    chunks.push(chunk as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * Whether a write request comes from the board's own page. Any page in the
 * user's browser can send a simple POST to 127.0.0.1, and one approval posts
 * a release in public: a write needs a loopback Host (no DNS rebinding), an
 * Origin of that same host when the browser sends one, and a JSON body
 * (which a cross-site page cannot send without a preflight the board never answers).
 */
export function trustedWrite(req: Pick<IncomingMessage, 'headers'>): string | undefined {
  const host = req.headers.host ?? '';
  if (!LOOPBACK_HOST.test(host)) return 'writes are accepted from the board on 127.0.0.1 only';
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return 'writes are accepted from the board page only';
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'writes are accepted from the board page only';
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'writes need content-type application/json';
  return undefined;
}

/** Serve a file of a release folder, with byte ranges so videos seek. */
async function serveMedia(req: IncomingMessage, res: ServerResponse, base: string, rel: string): Promise<void> {
  // Served files are data, never a page that runs: an SVG or HTML file opened from here gets no scripts.
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  const target = resolve(base, rel);
  if (!target.startsWith(resolve(base) + sep)) return send(res, 403, 'forbidden', 'text/plain');
  const info = await stat(target).catch(() => undefined);
  if (!info?.isFile()) return send(res, 404, 'not found', 'text/plain');
  const type = MIME[extname(target).toLowerCase()] ?? 'application/octet-stream';
  const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
  if (range) {
    const start = range[1] ? Number(range[1]) : Math.max(0, info.size - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), info.size - 1) : info.size - 1;
    if (start > end || start >= info.size) {
      res.writeHead(416, { 'content-range': `bytes */${info.size}` });
      return void res.end();
    }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'content-range': `bytes ${start}-${end}/${info.size}`, 'content-length': end - start + 1 });
    return void createReadStream(target, { start, end }).pipe(res);
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': info.size });
  createReadStream(target).pipe(res);
}

/** The request handler, separate from the server so tests call it directly. */
export function boardHandler(options: BoardOptions = {}) {
  const root = options.root ?? repoRoot();
  const now = options.now ?? (() => new Date());
  const refresh = options.refresh ?? quickRelease;
  // One refresh per project at a time; a change during a refresh queues one more.
  const refreshing = new Map<string, Promise<void>>();
  const scheduleRefresh = (dir: string) => {
    const previous = refreshing.get(dir) ?? Promise.resolve();
    const next = previous
      .then(() => refresh(dir))
      .catch((error: Error) => console.error(`release-board: refreshing ${dir} failed: ${error.message}`));
    refreshing.set(dir, next);
    return next;
  };
  const workspaceDir = async (list: (root: string) => Promise<string[]>, slug: string, what: string) => {
    const dir = SLUG.test(slug) ? (await list(root)).find((entry) => entry.split(sep).at(-1) === slug) : undefined;
    if (!dir) throw new ValidationError(`unknown ${what} ${slug}`);
    return dir;
  };
  const projectDir = async (slug: string) => {
    if (!SLUG.test(slug)) throw new ValidationError(`unknown project ${slug}`);
    const dir = join(root, 'projects', slug);
    if (!(await boardProjectDirs(root)).includes(dir)) throw new ValidationError(`unknown project ${slug}`);
    return dir;
  };
  const allProjects = async (): Promise<(BoardProject | { slug: string; error: string })[]> => {
    const projects = [];
    for (const dir of await boardProjectDirs(root)) {
      try {
        projects.push(await boardProject(dir, root, { now: now() }));
      } catch (error) {
        projects.push({ slug: dir.split(sep).at(-1)!, error: (error as Error).message });
      }
    }
    return projects;
  };

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (req.method !== 'GET') {
        const refused = trustedWrite(req);
        if (refused) return json(res, { error: refused }, 403);
      }
      if (req.method === 'GET' && path === '/') {
        return send(res, 200, await readFile(join(pageDir, 'index.html'), 'utf8'), MIME['.html']);
      }
      const pageMatch = /^\/board\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && pageMatch) {
        if (!PAGE_FILE.test(pageMatch[1]!)) return send(res, 404, 'not found', 'text/plain');
        const file = await readFile(join(pageDir, pageMatch[1]!), 'utf8').catch(() => undefined);
        return file === undefined ? send(res, 404, 'not found', 'text/plain') : send(res, 200, file, MIME[extname(pageMatch[1]!)]);
      }
      if (req.method === 'GET' && path === '/api/production') return json(res, await productionOverview(root));
      if (req.method === 'GET' && path === '/api/activity') {
        const snapshot = await loadSnapshot(root);
        return json(res, {
          ...(snapshot ? { lastRound: snapshot.at, every: snapshot.every } : {}),
          stalled: Object.entries(snapshot?.projects ?? {}).filter(([, pulse]) => pulse.stalled).map(([slug]) => slug),
          events: await loadEvents(root, 50),
        });
      }
      const productionMatch = /^\/api\/production\/(projects|series)\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && productionMatch) {
        if (productionMatch[1] === 'series') {
          const detail = await productionSeries(await workspaceDir(seriesDirs, productionMatch[2]!, 'series'));
          return 'error' in detail ? json(res, detail, 500) : json(res, detail);
        }
        return json(res, await productionDetail(await workspaceDir(projectDirs, productionMatch[2]!, 'project')));
      }
      const fileMatch = /^\/(files|series-files)\/([^/]+)\/(.+)$/.exec(path);
      if (req.method === 'GET' && fileMatch) {
        const series = fileMatch[1] === 'series-files';
        const rel = fileMatch[3]!;
        if (!(series ? SERIES_FILES : PROJECT_FILES).test(rel) || rel.split('/').some((part) => part === '..' || part.startsWith('.'))) {
          return send(res, 403, 'forbidden', 'text/plain');
        }
        const base = await workspaceDir(series ? seriesDirs : projectDirs, fileMatch[2]!, series ? 'series' : 'project');
        return serveMedia(req, res, base, rel);
      }
      if (req.method === 'GET' && path === '/api/channel') {
        const channel = await loadChannel(root).catch(() => undefined);
        return json(res, { name: channel?.name, motto: channel?.motto });
      }
      if (req.method === 'GET' && path === '/api/projects') {
        const projects = await allProjects();
        return json(
          res,
          projects.map((project) => {
            if ('error' in project) return project;
            const ids = project.calendar.map((event) => event.id);
            return {
              slug: project.slug,
              title: project.title,
              artist: project.artist,
              releaseDate: project.releaseDate,
              proposed: project.proposed,
              hasRelease: project.hasRelease,
              total: ids.length,
              done: ids.filter((id) => project.status.items[id]?.done).length,
            };
          }),
        );
      }
      const projectMatch = /^\/api\/projects\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && projectMatch) return json(res, await boardProject(await projectDir(projectMatch[1]!), root, { now: now() }));
      const statusMatch = /^\/api\/projects\/([^/]+)\/status$/.exec(path);
      if (req.method === 'POST' && statusMatch) {
        const dir = await projectDir(statusMatch[1]!);
        const change = (await body(req)) as { id?: unknown; done?: unknown; url?: unknown };
        if (typeof change.id !== 'string' || !change.id || change.id.length > 200) throw new ValidationError('status needs an id');
        if (change.done !== undefined && typeof change.done !== 'boolean') throw new ValidationError('done must be true or false');
        if (change.url !== undefined && change.url !== null && (typeof change.url !== 'string' || (change.url && !/^https?:\/\//.test(change.url)))) {
          throw new ValidationError('url must start with http:// or https://');
        }
        const status = await updateStatus(dir, change.id, { done: change.done as boolean | undefined, url: change.url as string | null | undefined, by: 'user' }, now());
        // A live URL changes the X and LinkedIn texts and the microsite data: lay them out again in the background.
        if (change.url !== undefined) void scheduleRefresh(dir);
        return json(res, status);
      }
      const approveMatch = /^\/api\/projects\/([^/]+)\/(approve|revoke)$/.exec(path);
      if (req.method === 'POST' && approveMatch) {
        const dir = await projectDir(approveMatch[1]!);
        const { approveRelease, revokeApproval } = await import('./release-autopilot.js');
        if (approveMatch[2] === 'revoke') return json(res, await revokeApproval(dir));
        const change = (await body(req)) as { release_date?: unknown };
        if (change.release_date !== undefined && (typeof change.release_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(change.release_date))) {
          throw new ValidationError('release_date must be YYYY-MM-DD');
        }
        const status = await approveRelease(dir, { root, now: now(), releaseDate: change.release_date as string | undefined });
        void scheduleRefresh(dir);
        return json(res, status);
      }
      const autopilotMatch = /^\/api\/projects\/([^/]+)\/autopilot$/.exec(path);
      if (req.method === 'POST' && autopilotMatch) {
        const dir = await projectDir(autopilotMatch[1]!);
        const change = (await body(req)) as { id?: unknown; action?: unknown };
        if (typeof change.id !== 'string' || !change.id || change.id.length > 200) throw new ValidationError('autopilot needs an id');
        const action = change.action;
        if (action !== 'manual' && action !== 'auto' && action !== 'retry' && action !== 'force') throw new ValidationError('action must be manual, auto, retry, or force');
        const { retryEvent, setEventManual } = await import('./release-autopilot.js');
        if (action === 'manual' || action === 'auto') await setEventManual(dir, change.id, action === 'manual');
        else await retryEvent(dir, change.id, now(), action === 'force');
        return json(res, await boardProject(dir, root, { now: now() }));
      }
      if (req.method === 'GET' && path === '/api/calendar') {
        const projects = (await allProjects()).filter((project): project is BoardProject => !('error' in project));
        return json(
          res,
          projects
            .flatMap((project) =>
              project.calendar.map((event) => ({ ...event, project: project.slug, title: project.title, done: Boolean(project.status.items[event.id]?.done) })),
            )
            .sort((a, b) => Date.parse(a.at) - Date.parse(b.at)),
        );
      }
      if (req.method === 'GET' && path === '/calendar.ics') {
        const projects = (await allProjects()).filter((project): project is BoardProject => !('error' in project));
        const calendars: { calendar: ReleaseCalendar; labels: Map<string, string> }[] = [];
        for (const project of projects) {
          const calendar = await loadCalendar(join(root, 'projects', project.slug));
          if (calendar) calendars.push({ calendar, labels: new Map(project.calendar.map((event) => [event.id, event.label])) });
        }
        const ics = calendarIcs(
          calendars.map((entry) => entry.calendar),
          (calendar, event) => `${calendar.title}: ${calendars.find((entry) => entry.calendar === calendar)?.labels.get(event.id) ?? event.step}`,
        );
        res.setHeader('content-disposition', 'attachment; filename="release-calendar.ics"');
        return send(res, 200, ics, MIME['.ics']);
      }
      const mediaMatch = /^\/media\/([^/]+)\/(.+)$/.exec(path);
      if (req.method === 'GET' && mediaMatch) return serveMedia(req, res, releaseDir(await projectDir(mediaMatch[1]!)), mediaMatch[2]!);
      return send(res, 404, 'not found', 'text/plain');
    } catch (error) {
      const status = error instanceof ValidationError ? 400 : 500;
      return json(res, { error: (error as Error).message }, status);
    }
  };
}

/** Start the board; resolves once it listens. */
export async function startBoard(options: BoardOptions = {}): Promise<{ server: Server; url: string }> {
  const host = options.host ?? '127.0.0.1';
  const port = options.port ?? 4848;
  const handler = boardHandler(options);
  const server = createServer((req, res) => void handler(req, res));
  await new Promise<void>((done, fail) => {
    server.once('error', fail);
    server.listen(port, host, () => done());
  });
  const address = server.address();
  const actual = typeof address === 'object' && address ? address.port : port;
  return { server, url: `http://${host}:${actual}/` };
}
