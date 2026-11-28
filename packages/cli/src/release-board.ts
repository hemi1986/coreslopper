import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { tmpdir } from 'node:os';
import { extname, join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ValidationError, loadChannel, repoRoot, LIBRARY_SOUND_FILE } from '@coreslopper/core';
import { MIME, body, json, send, serveMedia } from './board-http.js';
import { releaseRoutes } from './release-board-routes.js';
import { loadEvents, loadSnapshot } from './production-watch.js';
import { editNote, reviewData, submitRound } from './board-review.js';
import { SLUG, productionDetail, productionOverview, productionSeries, projectDirs, seriesDirs } from './board-production.js';
import {
  LIBRARY_FILE_LIMITS,
  libraryTarget,
  libraryTargets,
  safeName,
  type LibraryImportOptions,
  type LibraryImportOutcome,
  type LibraryUseOptions,
  type LibraryUseOutcome,
} from './library-entry.js';

// The board: a local web page over the workspace. Its production view shows
// every project and series as the pipeline leaves them (stages, budget,
// queue, reviews, renders, the next command for Claude Code). Its release
// view shows, per platform, which file goes where, the texts to paste with
// their limits, the settings to check, and the calendar; the user ticks off
// what is posted and enters the live URL, which lands in
// review/release-status.json. The guide view reads the workspace's docs/
// (DOC_FILE). Writes come only from its own page (see
// trustedWrite): the status files, the approval, and the autopilot's retry and
// takeover marks (and, on approval of a proposed date,
// release.release_date in project.yaml), the wizard's new projects and
// references, the character library (library/characters/, ADR 0034), the
// set library (library/sets/, ADR 0052) and the sound library
// (library/sounds/, ADR 0051).

export interface BoardOptions {
  /** The workspace (or repository) root; projects live in its projects/. */
  root?: string;
  port?: number;
  host?: string;
  now?: () => Date;
  /** Lay out the texts and the microsite data again after a status change (default: release without rendering). */
  refresh?: (projectDir: string) => Promise<void>;
}

/** What the board serves from a project, relative to the project: its media folders and its documents. */
const PROJECT_FILES = /^(renders|review|assets|characters|sets|props)\/|^(brief\.md|treatment\.md|storyboard\.md|timing\.report\.md|lyrics\.txt|script\.yaml)$/;
/** What the board serves from a series canon. */
const SERIES_FILES = /^(characters|sets|props|assets|review)\/|^(bible\.md)$/;
/** The page's own files in ./board/. */
const PAGE_FILE = /^[a-z][a-z0-9-]*\.(js|css)$/;
/** The workspace's docs the board shows: a top-level page, or an image under docs/assets/. */
const DOC_FILE = /^([a-z][a-z0-9-]*(?:\.de)?\.md|assets\/(?:[a-z0-9_-]+\/)*[a-z0-9_-]+\.(?:webp|png|jpe?g|svg))$/;
const pageDir = fileURLToPath(new URL('./board/', import.meta.url));

const LOOPBACK_HOST = /^(127\.0\.0\.1|localhost|\[::1\])(:\d+)?$/i;

/**
 * Whether a write request comes from the board's own page. Any page in the
 * user's browser can send a simple POST to 127.0.0.1, and one approval posts
 * a release in public: a write needs a loopback Host (no DNS rebinding), an
 * Origin of that same host when the browser sends one, and a JSON body
 * (which a cross-site page cannot send without a preflight the board never answers).
 */
export function trustedWrite(req: Pick<IncomingMessage, 'headers'>, upload = false): string | undefined {
  const host = req.headers.host ?? '';
  if (!LOOPBACK_HOST.test(host)) return 'writes are accepted from the board on 127.0.0.1 only';
  const origin = req.headers.origin;
  if (origin !== undefined && origin !== `http://${host}`) return 'writes are accepted from the board page only';
  const site = req.headers['sec-fetch-site'];
  if (site !== undefined && site !== 'same-origin' && site !== 'none') return 'writes are accepted from the board page only';
  // An upload is a raw file body, which a cross-site page cannot send without a preflight either; it must name its origin.
  if (upload) {
    if (origin === undefined) return 'uploads are accepted from the board page only';
    if (!/^application\/octet-stream\b/i.test(req.headers['content-type'] ?? '')) return 'uploads need content-type application/octet-stream';
    return undefined;
  }
  if (!/^application\/json\b/i.test(req.headers['content-type'] ?? '')) return 'writes need content-type application/json';
  return undefined;
}

/** What the board's library routes need from a kind's lifecycle descriptor. */
interface LibraryRouteKind {
  /** `characters` / `sets`: the listing key and the `library/<kind>/` folder. */
  kind: 'characters' | 'sets';
  /** The entry file a file route never serves. */
  entryName: string;
  /** The roles an upload may name. */
  roles: readonly string[];
  /** The row key of a use: `character` / `set`; also the import body's field. */
  useName: string;
  entryDir: (root: string, id: string) => string;
  load: (root: string, id: string) => Promise<unknown>;
  list: (root: string) => Promise<{ entries: readonly unknown[]; errors: { id: string; error: string }[] }>;
  add: (root: string, input: never, now?: Date) => Promise<{ id: string }>;
  update: (root: string, id: string, change: never) => Promise<unknown>;
  removeFile: (root: string, id: string, name: unknown) => Promise<unknown>;
  remove: (root: string, id: string) => Promise<unknown>;
  importFrom: (root: string, sourceDir: string, options: LibraryImportOptions) => Promise<LibraryImportOutcome[]>;
  useIn: (root: string, targetDir: string, id: string, options: LibraryUseOptions) => Promise<LibraryUseOutcome>;
}

/**
 * One library's routes: the URL family, the words its refusals and results
 * use, and the two hooks where the kinds genuinely differ. The flow, the
 * status codes, the write guard and the response shapes are the same for both.
 */
interface LibraryRouteSpec {
  /** The kind module; its lifecycle descriptor drives the routes. */
  module: () => Promise<{ libraryKind: LibraryRouteKind }>;
  /** `/api/library` or `/api/sets`. */
  api: string;
  /** `/library-files/` or `/set-files/`. */
  files: string;
  /** `/api/upload/library/` or `/api/upload/sets/`. */
  upload: string;
  /** The refusal for a role the kind does not take. */
  roleMessage: string;
  /** Whether `use` takes and checks `states` (characters). */
  states?: boolean;
  /** Load the entry before the role check (sets); nothing for characters. */
  beforeUpload?: (library: LibraryRouteKind, root: string, id: string) => Promise<void>;
  /** The result words of an import (`character` vs `set`, skipped sets). */
  importResult: (outcome: LibraryImportOutcome) => object;
  /** The result words of a use (`character`/`states` vs `set`/`plates`). */
  useResult: (outcome: LibraryUseOutcome) => object;
  /** Store an uploaded file: directly into the entry, or through a temp folder and `addFile`. */
  uploadFile: (root: string, id: string, req: IncomingMessage, query: URLSearchParams, role: string, now: Date) => Promise<void>;
}

/** Escape a URL prefix for a route's pattern. */
const routePattern = (prefix: string) => prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const CHARACTER_LIBRARY_ROUTES: LibraryRouteSpec = {
  module: () => import('./character-library.js'),
  api: '/api/library',
  files: '/library-files/',
  upload: '/api/upload/library/',
  roleMessage: 'role must be ref, sheet, or voice',
  states: true,
  importResult: (outcome) => ({
    character: outcome.sourceId,
    id: outcome.id!,
    created: outcome.created,
    added: outcome.added,
    missing: outcome.missing,
  }),
  useResult: (outcome) => ({ character: outcome.id, updated: outcome.updated, files: outcome.files, states: outcome.labels }),
  uploadFile: async (root, id, req, query, role, now) => {
    const character = await import('./character-library.js');
    const file = await character.libraryFileTarget(root, id, query.get('name') ?? '', role as 'ref' | 'sheet' | 'voice');
    const { receiveUpload } = await import('./board-wizard.js');
    await receiveUpload(req, file, LIBRARY_FILE_LIMITS.bytes);
    try {
      await character.recordLibraryFile(root, id, file, role as 'ref' | 'sheet' | 'voice', query.get('transcript') ?? undefined, now);
    } catch (error) {
      await rm(file, { force: true });
      throw error;
    }
  },
};

const SET_LIBRARY_ROUTES: LibraryRouteSpec = {
  module: () => import('./set-library.js'),
  api: '/api/sets',
  files: '/set-files/',
  upload: '/api/upload/sets/',
  roleMessage: 'role must be ref or plate',
  // A set's upload loads the entry first, exactly as `set add-file` does.
  beforeUpload: async (library, root, id) => {
    await library.load(root, id);
  },
  importResult: (outcome) => ({
    set: outcome.sourceId,
    ...(outcome.id ? { id: outcome.id } : {}),
    created: outcome.created,
    ...(outcome.skipped ? { skipped: true } : {}),
    added: outcome.added,
    missing: outcome.missing,
  }),
  useResult: (outcome) => ({ set: outcome.id, updated: outcome.updated, files: outcome.files, plates: outcome.labels }),
  // The image lands in a temporary folder first; `addLibrarySetFile` copies it into the entry by content,
  // applies the plate rules and names it in set.yaml, so the board adds a file exactly as the command does.
  uploadFile: async (root, id, req, query, role, now) => {
    const sets = await import('./set-library.js');
    const folder = await mkdtemp(join(tmpdir(), 'coreslopper-set-upload-'));
    try {
      const file = join(folder, safeName(query.get('name') ?? ''));
      const { receiveUpload } = await import('./board-wizard.js');
      await receiveUpload(req, file, LIBRARY_FILE_LIMITS.bytes);
      await sets.addLibrarySetFile(root, id, file, { role: role as 'ref' | 'plate', angle: query.get('angle') ?? undefined, plate: query.get('plate') ?? undefined }, now);
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  },
};

/** The request handler, separate from the server so tests call it directly. */
export function boardHandler(options: BoardOptions = {}) {
  const root = options.root ?? repoRoot();
  const now = options.now ?? (() => new Date());
  const release = releaseRoutes({ root, now, ...(options.refresh ? { refresh: options.refresh } : {}) });
  const workspaceDir = async (list: (root: string) => Promise<string[]>, slug: string, what: string) => {
    const dir = SLUG.test(slug) ? (await list(root)).find((entry) => entry.split(sep).at(-1) === slug) : undefined;
    if (!dir) throw new ValidationError(`unknown ${what} ${slug}`);
    return dir;
  };
  const scopeDir = (scope: string, slug: string) =>
    scope === 'series' ? workspaceDir(seriesDirs, slug, 'series') : workspaceDir(projectDirs, slug, 'project');
  /** One library's routes, driven by its lifecycle descriptor; true when it answered the request. */
  const libraryRoutes = (spec: LibraryRouteSpec) => {
    const filePattern = new RegExp(`^${routePattern(spec.files)}([^/]+)/([^/]+)$`);
    const entryPattern = new RegExp(`^${routePattern(spec.api)}/([^/]+)$`);
    const uploadPattern = new RegExp(`^${routePattern(spec.upload)}([^/]+)$`);
    const handle = async (req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean> => {
      const { libraryKind: library } = await spec.module();
      const answer = (value: unknown) => {
        json(res, value);
        return true;
      };
      const listing = async () => {
        const { entries, errors } = await library.list(root);
        return { [library.kind]: entries, errors, targets: await libraryTargets(root) };
      };
      const fileMatch = filePattern.exec(path);
      if (req.method === 'GET' && fileMatch) {
        const [, id, name] = fileMatch as unknown as [string, string, string];
        if (name.startsWith('.') || name === library.entryName) {
          send(res, 403, 'forbidden', 'text/plain');
          return true;
        }
        await serveMedia(req, res, library.entryDir(root, id), name);
        return true;
      }
      if (req.method === 'GET' && path === spec.api) return answer(await listing());
      if (req.method === 'POST' && path === `${spec.api}/new`) {
        const entry = await library.add(root, (await body(req)) as never, now());
        return answer({ id: entry.id });
      }
      if (req.method === 'POST' && path === `${spec.api}/import`) {
        const change = (await body(req)) as Record<string, unknown>;
        const dir = await libraryTarget(root, change.scope, change.slug);
        const source = change[library.useName];
        const outcomes = await library.importFrom(root, dir, {
          sourceId: typeof source === 'string' && source ? source : undefined,
          into: typeof change.into === 'string' && change.into ? change.into : undefined,
          now: now(),
        });
        return answer({ results: outcomes.map(spec.importResult), ...(await listing()) });
      }
      if (req.method === 'POST' && path === `${spec.api}/use`) {
        const change = (await body(req)) as Record<string, unknown>;
        const dir = await libraryTarget(root, change.scope, change.slug);
        if (
          spec.states &&
          change.states !== undefined &&
          change.states !== 'all' &&
          !(Array.isArray(change.states) && change.states.every((state) => typeof state === 'string'))
        ) {
          throw new ValidationError('states must be a list of state ids or "all"');
        }
        const result = await library.useIn(root, dir, String(change.id ?? ''), spec.states ? { states: change.states as string[] | 'all' | undefined } : {});
        return answer({ result: spec.useResult(result), ...(await listing()) });
      }
      const entryMatch = entryPattern.exec(path);
      if (req.method === 'POST' && entryMatch) {
        const id = entryMatch[1]!;
        const change = (await body(req)) as Record<string, unknown>;
        if (change.action === 'update') await library.update(root, id, change as never);
        else if (change.action === 'remove-file') await library.removeFile(root, id, change.name);
        else if (change.action === 'delete') await library.remove(root, id);
        else throw new ValidationError('action must be update, remove-file, or delete');
        return answer(await listing());
      }
      const uploadMatch = uploadPattern.exec(path);
      if (req.method === 'POST' && uploadMatch) {
        const id = uploadMatch[1]!;
        await spec.beforeUpload?.(library, root, id);
        const role = query.get('role') ?? 'ref';
        if (!library.roles.includes(role)) throw new ValidationError(spec.roleMessage);
        await spec.uploadFile(root, id, req, query, role, now());
        return answer(await listing());
      }
      return false;
    };
    return {
      matches: (path: string) => path.startsWith(spec.api) || path.startsWith(spec.files) || path.startsWith(spec.upload),
      handle,
    };
  };
  /** The wizard for new projects, series, and episodes; true when it answered the request. */
  const wizardRoute = async (req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean> => {
    const wizard = await import('./board-wizard.js');
    const answer = (value: unknown) => {
      json(res, value);
      return true;
    };
    if (req.method === 'GET' && path === '/api/new/options') return answer(await wizard.wizardOptions(root));
    if (req.method === 'POST' && path === '/api/new/video') {
      const dir = await wizard.createVideoProject(root, (await body(req)) as never);
      return answer({ slug: dir.split(sep).at(-1) });
    }
    if (req.method === 'POST' && path === '/api/new/series') {
      const dir = await wizard.createSeriesCanon(root, (await body(req)) as never);
      return answer({ slug: dir.split(sep).at(-1) });
    }
    if (req.method === 'POST' && path === '/api/new/meme') {
      const slug = (await wizard.createMeme(root, (await body(req)) as never)).split(sep).at(-1)!;
      return answer({ slug, next: `/new-meme ${slug}` });
    }
    if (req.method === 'POST' && path === '/api/new/episode') {
      const dir = await wizard.createEpisode(root, (await body(req)) as never);
      return answer({ slug: dir.split(sep).at(-1) });
    }
    const videoMatch = /^\/api\/new\/video\/([^/]+)(?:\/(lyrics|finish))?$/.exec(path);
    if (videoMatch) {
      const dir = await scopeDir('project', videoMatch[1]!);
      if (req.method === 'GET' && !videoMatch[2]) return answer(await wizard.videoWizardState(dir));
      if (req.method === 'POST' && videoMatch[2] === 'lyrics') {
        const change = (await body(req)) as { text?: unknown; preview?: unknown };
        if (change.preview) {
          const { lyricsSections, proposeTags } = await import('@coreslopper/core');
          const text = proposeTags(typeof change.text === 'string' ? change.text : '');
          return answer({ text, ...lyricsSections(text) });
        }
        await wizard.writeLyrics(dir, change.text);
        return answer(await wizard.videoWizardState(dir));
      }
      if (req.method === 'POST' && videoMatch[2] === 'finish') {
        await wizard.finishSetup(dir);
        return answer(await wizard.videoWizardState(dir));
      }
    }
    const referencesMatch = /^\/api\/new\/(project|series)\/([^/]+)\/references$/.exec(path);
    if (referencesMatch) {
      const dir = await scopeDir(referencesMatch[1]!, referencesMatch[2]!);
      if (req.method === 'GET') return answer(await wizard.loadReferences(dir));
      if (req.method === 'POST') {
        const change = (await body(req)) as Record<string, unknown>;
        if (change.action === 'link') await wizard.addReferenceLink(dir, change as never, now());
        else if (change.action === 'update') await wizard.updateReference(dir, change.id, change as never);
        else if (change.action === 'delete') await wizard.removeReference(dir, change.id);
        else throw new ValidationError('action must be link, update, or delete');
        return answer(await wizard.loadReferences(dir));
      }
    }
    const uploadMatch = /^\/api\/upload\/(project|series)\/([^/]+)\/(song|vocals|reference)$/.exec(path);
    if (req.method === 'POST' && uploadMatch) {
      const [, scope, slug, target] = uploadMatch as unknown as [string, 'project' | 'series', string, 'song' | 'vocals' | 'reference'];
      const dir = await scopeDir(scope, slug);
      const name = query.get('name') ?? '';
      if (target === 'reference') {
        const file = await wizard.referenceTarget(dir, name);
        await wizard.receiveUpload(req, file, wizard.UPLOAD_LIMITS.reference.bytes);
        try {
          const reference = await wizard.recordReferenceFile(dir, file, name.slice(0, 300), { kind: query.get('kind'), subject: query.get('subject'), note: query.get('note') }, now());
          return answer(reference);
        } catch (error) {
          await rm(file, { force: true });
          throw error;
        }
      }
      if (scope !== 'project') throw new ValidationError('a series has no song');
      const file = await wizard.audioTarget(dir, target, name);
      await wizard.receiveUpload(req, file, wizard.UPLOAD_LIMITS.audio.bytes);
      const { warnings } = await wizard.importUploadedSong(dir);
      return answer({ ...(await wizard.videoWizardState(dir)), warnings });
    }
    return false;
  };
  /**
   * The sound library: list, upload through `sound add`, edit and remove, and
   * the one WAV of an entry; true when it answered the request.
   */
  const soundsRoute = async (req: IncomingMessage, res: ServerResponse, path: string, query: URLSearchParams): Promise<boolean> => {
    const sounds = await import('./sound-library.js');
    const answer = (value: unknown) => {
      json(res, value);
      return true;
    };
    const listing = () => sounds.listLibrarySounds(root);
    // Only the WAV is served; an entry file or a dot file never is.
    const fileMatch = /^\/sound-files\/([^/]+)\/([^/]+)$/.exec(path);
    if (req.method === 'GET' && fileMatch) {
      const [, id, name] = fileMatch as unknown as [string, string, string];
      if (name !== LIBRARY_SOUND_FILE) {
        send(res, 403, 'forbidden', 'text/plain');
        return true;
      }
      await serveMedia(req, res, sounds.soundDir(root, id), name);
      return true;
    }
    if (req.method === 'GET' && path === '/api/sounds') return answer(await listing());
    // The upload lands in a temporary folder and `addLibrarySound` converts and stores it exactly as `sound add` does.
    if (req.method === 'POST' && path === '/api/upload/sounds') {
      const { receiveUpload, UPLOAD_LIMITS } = await import('./board-wizard.js');
      const folder = await mkdtemp(join(tmpdir(), 'coreslopper-sound-upload-'));
      try {
        const file = join(folder, safeName(query.get('name') ?? 'sound'));
        await receiveUpload(req, file, UPLOAD_LIMITS.audio.bytes);
        const sound = await sounds.addLibrarySound(root, {
          file,
          title: query.get('title'),
          useWhen: query.get('use-when'),
          tags: query.get('tags'),
          cue: query.get('cue'),
          trim: query.get('trim'),
          licence: query.get('licence'),
          source: query.get('source'),
          credit: query.get('credit'),
        }, now());
        return answer({ sound, ...(await listing()) });
      } finally {
        await rm(folder, { recursive: true, force: true });
      }
    }
    const entryMatch = /^\/api\/sounds\/([^/]+)$/.exec(path);
    if (req.method === 'POST' && entryMatch) {
      const id = entryMatch[1]!;
      const change = (await body(req)) as Record<string, unknown>;
      if (change.action === 'update') {
        await sounds.updateLibrarySound(root, id, {
          title: change.title,
          useWhen: change.useWhen,
          tags: change.tags,
          cue: change.cue,
          trim: change.trim,
          licence: change.licence,
          source: change.source,
          credit: change.credit,
        });
      } else if (change.action === 'delete') {
        await sounds.removeLibrarySound(root, id);
      } else throw new ValidationError('action must be update or delete');
      return answer(await listing());
    }
    return false;
  };
  /** Both bible libraries, in dispatch order; one factory, two kind descriptors. */
  const libraryKindRoutes = [libraryRoutes(CHARACTER_LIBRARY_ROUTES), libraryRoutes(SET_LIBRARY_ROUTES)];

  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      const path = decodeURIComponent(url.pathname);
      if (req.method !== 'GET') {
        const refused = trustedWrite(req, path.startsWith('/api/upload/'));
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
      const docMatch = /^\/docs\/(.+)$/.exec(path);
      if (req.method === 'GET' && docMatch) {
        if (!DOC_FILE.test(docMatch[1]!)) return send(res, 404, 'not found', 'text/plain');
        return serveMedia(req, res, join(root, 'docs'), docMatch[1]!);
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
      const sheetMatch = /^\/api\/production\/projects\/([^/]+)\/contact-sheet$/.exec(path);
      if (req.method === 'GET' && sheetMatch) {
        const { contactSheet } = await import('./board-contact-sheet.js');
        return json(res, await contactSheet(await workspaceDir(projectDirs, sheetMatch[1]!, 'project')));
      }
      const productionMatch = /^\/api\/production\/(projects|series)\/([^/]+)$/.exec(path);
      if (req.method === 'GET' && productionMatch) {
        if (productionMatch[1] === 'series') {
          const detail = await productionSeries(await workspaceDir(seriesDirs, productionMatch[2]!, 'series'));
          return 'error' in detail ? json(res, detail, 500) : json(res, detail);
        }
        return json(res, await productionDetail(await workspaceDir(projectDirs, productionMatch[2]!, 'project')));
      }
      const reviewMatch = /^\/api\/review\/([^/]+)(?:\/(notes|submit))?$/.exec(path);
      if (reviewMatch) {
        const dir = await workspaceDir(projectDirs, reviewMatch[1]!, 'project');
        if (req.method === 'GET' && !reviewMatch[2]) return json(res, await reviewData(dir));
        if (req.method === 'POST' && reviewMatch[2] === 'notes') {
          const change = (await body(req)) as Record<string, unknown>;
          const action = change.action;
          if (action !== 'add' && action !== 'update' && action !== 'delete') throw new ValidationError('action must be add, update, or delete');
          return json(res, await editNote(dir, change.video, {
            action,
            id: typeof change.id === 'string' ? change.id : undefined,
            seconds: change.seconds as number | undefined,
            end_seconds: change.end_seconds as number | null | undefined,
            text: change.text as string | undefined,
          }, now()));
        }
        if (req.method === 'POST' && reviewMatch[2] === 'submit') {
          const change = (await body(req)) as { video?: unknown };
          return json(res, await submitRound(dir, change.video, now()));
        }
      }
      for (const route of libraryKindRoutes) {
        if (!route.matches(path)) continue;
        if (await route.handle(req, res, path, url.searchParams)) return;
      }
      if (path.startsWith('/api/sounds') || path.startsWith('/sound-files/') || path.startsWith('/api/upload/sounds')) {
        const handled = await soundsRoute(req, res, path, url.searchParams);
        if (handled) return;
      }
      if (path.startsWith('/api/new') || path.startsWith('/api/upload/')) {
        const handled = await wizardRoute(req, res, path, url.searchParams);
        if (handled) return;
      }
      if (release.matches(path)) {
        const handled = await release.handle(req, res, path, url.searchParams);
        if (handled) return;
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
