import { existsSync } from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { join, sep } from 'node:path';
import {
  ValidationError,
  calendarIcs,
  loadProject,
  getsReleasePackage,
  type ReleaseCalendar,
} from '@coreslopper/core';
import { body, json, send, serveMedia } from './board-http.js';
import { boardProject, type BoardProject } from './release-board-data.js';
import { loadCalendar } from './release-calendar.js';
import { releaseProjectDirs } from './release-facts.js';
import { updateStatus } from './release-records.js';
import { releaseDir } from './release.js';

// The release view's routes: the project list and one project's board body,
// the calendar and its .ics, and the writes to the release records (status,
// approval, autopilot). The shell only guards, serves and dispatches.

const SLUG = /^[a-z0-9][a-z0-9-]*$/;

export interface ReleaseRoutesOptions {
  /** The workspace (or repository) root; projects live in its projects/. */
  root: string;
  now?: () => Date;
  /** Lay out the texts and the microsite data again after a status change (default: release without rendering). */
  refresh?: (projectDir: string) => Promise<void>;
  /** The release project directories; the routes that list or resolve a project by name use it. */
  listProjects?: (root: string) => Promise<string[]>;
}

export interface ReleaseRoutes {
  /** Whether this factory's URL family owns the path. */
  matches(path: string): boolean;
  /** Answer the request; false when the path belongs to another route family. */
  handle(req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean>;
}

/** The quick refresh after a live URL arrives: texts and microsite data, no renders, no new stills; an internal project has none. */
async function quickRelease(projectDir: string, root: string): Promise<void> {
  if (!getsReleasePackage((await loadProject(projectDir)).config)) return;
  const { buildRelease } = await import('./release.js');
  await buildRelease({ projectDir, root, render: false, stills: false, deps: { log: () => undefined } });
}

/** One release view's routes over a workspace. */
export function releaseRoutes(options: ReleaseRoutesOptions): ReleaseRoutes {
  const root = options.root;
  const now = options.now ?? (() => new Date());
  const listProjects = options.listProjects ?? releaseProjectDirs;
  const refresh = options.refresh ?? ((projectDir: string) => quickRelease(projectDir, root));
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
  /** One project without listing the workspace: the same filter as its listing, by direct path. */
  const projectDir = (slug: string): string => {
    if (!SLUG.test(slug)) throw new ValidationError(`unknown project ${slug}`);
    const dir = join(root, 'projects', slug);
    if (!existsSync(join(dir, 'project.yaml')) || !(existsSync(join(releaseDir(dir), 'manifest.json')) || existsSync(join(dir, 'review', 'calendar.yaml')))) {
      throw new ValidationError(`unknown project ${slug}`);
    }
    return dir;
  };
  const allProjects = async (): Promise<(BoardProject | { slug: string; error: string })[]> => {
    const projects = [];
    for (const dir of await listProjects(root)) {
      try {
        projects.push(await boardProject(dir, root, { now: now() }));
      } catch (error) {
        projects.push({ slug: dir.split(sep).at(-1)!, error: (error as Error).message });
      }
    }
    return projects;
  };
  const answer = (res: ServerResponse, value: unknown) => {
    json(res, value);
    return true;
  };

  return {
    matches: (path) =>
      path === '/api/projects' || path.startsWith('/api/projects/') || path === '/api/calendar' || path === '/calendar.ics' || path.startsWith('/media/'),
    handle: async (req, res, path, query) => {
      if (req.method === 'GET' && path === '/api/projects') {
        const projects = await allProjects();
        return answer(
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
      if (req.method === 'GET' && projectMatch) return answer(res, await boardProject(projectDir(projectMatch[1]!), root, { now: now() }));
      const statusMatch = /^\/api\/projects\/([^/]+)\/status$/.exec(path);
      if (req.method === 'POST' && statusMatch) {
        const dir = projectDir(statusMatch[1]!);
        const change = (await body(req)) as { id?: unknown; done?: unknown; url?: unknown };
        if (typeof change.id !== 'string' || !change.id || change.id.length > 200) throw new ValidationError('status needs an id');
        if (change.done !== undefined && typeof change.done !== 'boolean') throw new ValidationError('done must be true or false');
        if (change.url !== undefined && change.url !== null && (typeof change.url !== 'string' || (change.url && !/^https?:\/\//.test(change.url)))) {
          throw new ValidationError('url must start with http:// or https://');
        }
        const status = await updateStatus(dir, change.id, { done: change.done as boolean | undefined, url: change.url as string | null | undefined, by: 'user' }, now());
        // A live URL changes the X and LinkedIn texts and the microsite data: lay them out again in the background.
        if (change.url !== undefined) void scheduleRefresh(dir);
        return answer(res, status);
      }
      const approveMatch = /^\/api\/projects\/([^/]+)\/(approve|revoke)$/.exec(path);
      if (req.method === 'POST' && approveMatch) {
        const dir = projectDir(approveMatch[1]!);
        const { approveRelease, revokeApproval } = await import('./release-autopilot.js');
        if (approveMatch[2] === 'revoke') return answer(res, await revokeApproval(dir));
        const change = (await body(req)) as { release_date?: unknown };
        if (change.release_date !== undefined && (typeof change.release_date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(change.release_date))) {
          throw new ValidationError('release_date must be YYYY-MM-DD');
        }
        const status = await approveRelease(dir, { root, now: now(), releaseDate: change.release_date as string | undefined });
        void scheduleRefresh(dir);
        return answer(res, status);
      }
      const autopilotMatch = /^\/api\/projects\/([^/]+)\/autopilot$/.exec(path);
      if (req.method === 'POST' && autopilotMatch) {
        const dir = projectDir(autopilotMatch[1]!);
        const change = (await body(req)) as { id?: unknown; action?: unknown };
        if (typeof change.id !== 'string' || !change.id || change.id.length > 200) throw new ValidationError('autopilot needs an id');
        const action = change.action;
        if (action !== 'manual' && action !== 'auto' && action !== 'retry' && action !== 'force') throw new ValidationError('action must be manual, auto, retry, or force');
        const { retryEvent, setEventManual } = await import('./release-autopilot.js');
        if (action === 'manual' || action === 'auto') await setEventManual(dir, change.id, action === 'manual');
        else await retryEvent(dir, change.id, now(), action === 'force');
        return answer(res, await boardProject(dir, root, { now: now() }));
      }
      if (req.method === 'GET' && path === '/api/calendar') {
        const projects = (await allProjects()).filter((project): project is BoardProject => !('error' in project));
        return answer(
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
        send(res, 200, ics, 'text/calendar; charset=utf-8');
        return true;
      }
      const mediaMatch = /^\/media\/([^/]+)\/(.+)$/.exec(path);
      if (req.method === 'GET' && mediaMatch) {
        await serveMedia(req, res, releaseDir(projectDir(mediaMatch[1]!)), mediaMatch[2]!);
        return true;
      }
      return false;
    },
  };
}
