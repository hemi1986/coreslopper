import { existsSync } from 'node:fs';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import {
  approvalHolds,
  isScriptedKind,
  loadProject,
  productionPhase,
  projectNextAction,
  projectTemplate,
  queueCounts,
  releasedPublicly,
  seriesNextAction,
  stageViews,
  type NextAction,
  type ProductionPhase,
  type ProjectKind,
  type RenderProgress,
  type StageView,
} from '@coreslopper/core';
import { reviewCounts } from './board-review.js';
import { loadCalendar } from './release-calendar.js';
import { loadStatus } from './release-records.js';
import { collectSeriesStatus, type SeriesStatus } from './series.js';
import { SLUG, projectDirs, seriesDirs } from './workspace-dirs.js';

// The board's production view: every project and series of the workspace,
// read from the files the pipeline writes (state.json, renders/, the
// generation queue, the art director's verdicts). Read-only.

export { SLUG, projectDirs, seriesDirs };

export interface ProductionRender {
  /** Relative to the project. */
  path: string;
  name: string;
  bytes: number;
  modified: string;
}

export interface ProductionProject {
  slug: string;
  kind: ProjectKind;
  title: string;
  artist?: string;
  series?: string;
  episode?: number;
  phase: ProductionPhase;
  stages: StageView[];
  /** The running stage, else the first open one. */
  current?: string;
  budget: { totalUsd: number; spentUsd: number; reservedUsd: number };
  next: NextAction;
  renders: ProductionRender[];
  /** Item counts of `assets/queue.json` by status, when the project has a queue. */
  queue?: Record<string, number>;
  /** Subjects whose last art-director verdict failed. */
  failedReviews: number;
  /** A release folder exists and the project is released publicly; an internal project never has a release tab. */
  hasRelease: boolean;
  /** `distribution: internal`: not released publicly. */
  internal: boolean;
  approved: boolean;
  releaseDate?: string;
  /** When state.json last changed. */
  updatedAt?: string;
  /** Renders in progress (`review/progress/`). */
  progress: RenderProgress[];
  /** The newest change among the files the pipeline writes. */
  lastActivity?: string;
  /** Review rounds waiting for the agent, and notes not sent yet. */
  review: { open: number; drafts: number };
}

export interface ProductionVerdict {
  subject: string;
  verdict: 'pass' | 'fail';
  score?: number;
  attempt?: number;
  image?: string;
  issues: string[];
  reviewedAt?: string;
}

export interface ProductionDocument {
  label: string;
  path: string;
}

export interface ProductionQueueItem {
  id: string;
  kind?: string;
  status: string;
  attempt?: number;
  out?: string;
  note?: string;
  error?: string;
}

export interface ProductionDetail extends ProductionProject {
  documents: ProductionDocument[];
  queueItems: ProductionQueueItem[];
  verdicts: ProductionVerdict[];
  durationSeconds?: number;
  errors: string[];
}

export interface ProductionError {
  slug: string;
  error: string;
}

export interface ProductionSeries {
  slug: string;
  title: string;
  format: string;
  budget: SeriesStatus['budget'];
  characters: number;
  sets: number;
  /** Characters and sets without a reference, and speaking characters without their reference voice. */
  canonGaps: string[];
  episodes: { episode: number; title: string; slug?: string; next?: string; status?: string }[];
  next: NextAction;
}

async function readJsonLoose<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await readFile(path, 'utf8')) as T;
  } catch {
    return undefined;
  }
}

/** The finished videos in `renders/` (not the release folder or the Shorts), newest first. */
async function listRenders(projectDir: string): Promise<ProductionRender[]> {
  const dir = join(projectDir, 'renders');
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
  const renders: ProductionRender[] = [];
  for (const entry of entries) {
    if (!/\.(mp4|mov|webm)$/i.test(entry.name) || entry.name.startsWith('.')) continue;
    const info = await stat(join(dir, entry.name)).catch(() => undefined);
    if (!info?.isFile()) continue;
    renders.push({ path: `renders/${entry.name}`, name: entry.name, bytes: info.size, modified: info.mtime.toISOString() });
  }
  return renders.sort((a, b) => b.modified.localeCompare(a.modified) || a.name.localeCompare(b.name));
}

type QueueFile = { items?: Array<{ id?: unknown; kind?: unknown; status?: unknown; attempt?: unknown; out?: unknown; note?: unknown; error?: unknown }> };

async function loadQueue(assetsDir: string): Promise<ProductionQueueItem[] | undefined> {
  const queue = await readJsonLoose<QueueFile>(join(assetsDir, 'queue.json'));
  if (!queue || !Array.isArray(queue.items)) return undefined;
  const text = (value: unknown) => (typeof value === 'string' ? value : undefined);
  return queue.items.map((item) => ({
    id: text(item.id) ?? '?',
    kind: text(item.kind),
    status: text(item.status) ?? 'pending',
    attempt: typeof item.attempt === 'number' ? item.attempt : undefined,
    out: text(item.out),
    note: text(item.note),
    error: text(item.error),
  }));
}

/** The last verdict per subject of `verdicts.jsonl`; a clip and its keyframe are kept apart. */
export async function latestVerdicts(path: string): Promise<ProductionVerdict[]> {
  const text = await readFile(path, 'utf8').catch(() => '');
  const latest = new Map<string, ProductionVerdict>();
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const raw = JSON.parse(line) as Record<string, unknown>;
      if (typeof raw.subject !== 'string' || (raw.verdict !== 'pass' && raw.verdict !== 'fail')) continue;
      const subject = raw.clip ? `${raw.subject} (clip)` : raw.subject;
      latest.set(subject, {
        subject,
        verdict: raw.verdict,
        score: typeof raw.score === 'number' ? raw.score : undefined,
        attempt: typeof raw.attempt === 'number' ? raw.attempt : undefined,
        image: typeof raw.image === 'string' ? raw.image : undefined,
        issues: Array.isArray(raw.issues) ? raw.issues.filter((issue): issue is string => typeof issue === 'string') : [],
        reviewedAt: typeof raw.reviewedAt === 'string' ? raw.reviewedAt : undefined,
      });
    } catch {
      // a torn line from a killed review
    }
  }
  return [...latest.values()];
}

/** The progress files `render` writes while it runs: `review/progress/<output>.json`. */
export async function loadRenderProgress(projectDir: string): Promise<RenderProgress[]> {
  const dir = join(projectDir, 'review', 'progress');
  const entries = await readdir(dir).catch(() => [] as string[]);
  const progress: RenderProgress[] = [];
  for (const name of entries.filter((entry) => entry.endsWith('.json')).sort()) {
    const raw = await readJsonLoose<Partial<RenderProgress>>(join(dir, name));
    if (!raw || typeof raw.output !== 'string' || typeof raw.framesTotal !== 'number') continue;
    progress.push({
      output: raw.output,
      framesDone: typeof raw.framesDone === 'number' ? raw.framesDone : 0,
      framesTotal: raw.framesTotal,
      startedAt: typeof raw.startedAt === 'string' ? raw.startedAt : '',
      updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : '',
      ...(typeof raw.error === 'string' ? { error: raw.error } : {}),
    });
  }
  return progress;
}

/**
 * The newest modification among the files a working pipeline touches: the
 * project's own files, review/, review/progress/, assets/ and its queue,
 * manifest, and verdicts, and renders/. One level deep, so a scan stays cheap.
 */
export async function lastActivity(projectDir: string): Promise<string | undefined> {
  let newest = 0;
  for (const dir of ['', 'review', 'review/progress', 'assets', 'assets/review', 'renders']) {
    const path = join(projectDir, dir);
    const entries = await readdir(path, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const info = await stat(join(path, entry.name)).catch(() => undefined);
      if (info && info.mtimeMs > newest) newest = info.mtimeMs;
    }
  }
  return newest ? new Date(newest).toISOString() : undefined;
}

const DOCUMENTS: Array<[string, string]> = [
  ['Brief', 'brief.md'],
  ['Treatment', 'treatment.md'],
  ['Script', 'script.yaml'],
  ['Lyrics', 'lyrics.txt'],
  ['Timing report', 'timing.report.md'],
  ['Storyboard', 'storyboard.md'],
  ['QA report', 'review/report.md'],
];

/** A document counts once it differs from the template it was created from. */
async function written(projectDir: string, file: string, config: { kind?: ProjectKind; title: string; slug: string; series?: string; episode?: number }): Promise<boolean> {
  const text = await readFile(join(projectDir, file), 'utf8').catch(() => undefined);
  if (text === undefined || !text.trim()) return false;
  const templateDir = join(projectDir, '..', '..', 'templates', projectTemplate(config.kind));
  const template = await readFile(join(templateDir, file), 'utf8').catch(() => undefined);
  if (template === undefined) return true;
  const fresh = template
    .replaceAll('{{TITLE}}', config.title)
    .replaceAll('{{SLUG}}', config.slug)
    .replaceAll('{{SERIES}}', config.series ?? '')
    .replaceAll('{{EPISODE}}', String(config.episode ?? ''));
  return text.trim() !== fresh.trim();
}

async function collect(projectDir: string, detail: boolean): Promise<ProductionDetail> {
  const project = await loadProject(projectDir);
  const { config, state, paths } = project;
  const stages = stageViews(state);
  const internal = !releasedPublicly(config);
  const hasRelease = !internal && existsSync(join(paths.renders, 'release', 'manifest.json'));
  const status = await loadStatus(projectDir).catch(() => undefined);
  const calendar = await loadCalendar(projectDir).catch(() => undefined);
  const approved = Boolean(status && calendar && approvalHolds(status, calendar));
  const song = isScriptedKind(config.kind) ? undefined : await readJsonLoose<{ artist?: unknown }>(paths.song);
  const queueItems = (await loadQueue(paths.assets)) ?? [];
  const hasQueue = existsSync(join(paths.assets, 'queue.json'));
  const verdicts = await latestVerdicts(join(paths.assets, 'review', 'verdicts.jsonl'));
  const running = stages.find((stage) => stage.status === 'running');
  const open = stages.find((stage) => stage.status === 'pending' || stage.status === 'failed');
  const stateInfo = await stat(paths.state).catch(() => undefined);
  const review = await reviewCounts(projectDir);
  const summary: ProductionDetail = {
    slug: config.slug,
    kind: config.kind,
    title: config.title,
    ...(typeof song?.artist === 'string' ? { artist: song.artist } : {}),
    ...(config.series ? { series: config.series } : {}),
    ...(config.episode !== undefined ? { episode: config.episode } : {}),
    phase: productionPhase(stages),
    stages,
    ...((running ?? open) ? { current: (running ?? open)!.id } : {}),
    budget: { ...state.budget },
    next: projectNextAction({ slug: config.slug, kind: config.kind, stages, hasRelease, approved, openRounds: review.open, internal }),
    renders: await listRenders(projectDir),
    ...(hasQueue ? { queue: queueCounts(queueItems) } : {}),
    failedReviews: verdicts.filter((verdict) => verdict.verdict === 'fail').length,
    hasRelease,
    internal,
    approved,
    ...(config.release?.release_date ? { releaseDate: config.release.release_date } : {}),
    ...(stateInfo ? { updatedAt: stateInfo.mtime.toISOString() } : {}),
    progress: await loadRenderProgress(projectDir),
    review,
    ...(await lastActivity(projectDir).then((at) => (at ? { lastActivity: at } : {}))),
    documents: [],
    queueItems: [],
    verdicts: [],
    errors: state.errors,
  };
  if (!detail) return summary;
  for (const [label, file] of DOCUMENTS) {
    if (await written(projectDir, file, config)) summary.documents.push({ label, path: file });
  }
  summary.queueItems = queueItems;
  // Failed first, then the newest.
  summary.verdicts = verdicts.sort((a, b) => (a.verdict === b.verdict ? (b.reviewedAt ?? '').localeCompare(a.reviewedAt ?? '') : a.verdict === 'fail' ? -1 : 1));
  summary.durationSeconds = project.timing?.audio.duration;
  return summary;
}

/** A project's summary for the overview, or the reason it cannot be read. */
export async function productionProject(projectDir: string): Promise<ProductionProject | ProductionError> {
  try {
    const { documents: _d, queueItems: _q, verdicts: _v, errors: _e, durationSeconds: _s, ...summary } = await collect(projectDir, false);
    return summary;
  } catch (error) {
    return { slug: projectDir.split(sep).at(-1)!, error: (error as Error).message };
  }
}

export async function productionDetail(projectDir: string): Promise<ProductionDetail> {
  return collect(projectDir, true);
}

/** On-screen characters and sets without a reference, and speaking characters without a reference voice. */
function canonGaps(status: SeriesStatus): string[] {
  const gaps: string[] = [];
  if (!status.characters.length) gaps.push('no characters');
  if (!status.sets.length) gaps.push('no sets');
  for (const character of status.characters) {
    if (character.face !== 'voice-only' && character.refs === 0) gaps.push(`character ${character.id}: no reference`);
    if (character.voice === 'missing') gaps.push(`character ${character.id}: reference voice missing`);
  }
  for (const set of status.sets) if (set.refs === 0) gaps.push(`set ${set.id}: no reference`);
  return gaps;
}

export async function productionSeries(seriesDir: string): Promise<ProductionSeries | ProductionError> {
  try {
    const status = await collectSeriesStatus(seriesDir);
    const gaps = canonGaps(status);
    const master = status.series.formats.master;
    return {
      slug: status.series.slug,
      title: status.series.title,
      format: master.aspect,
      budget: status.budget,
      characters: status.characters.length,
      sets: status.sets.length,
      canonGaps: gaps,
      episodes: status.episodes.map((episode) => ({
        episode: episode.episode,
        title: episode.title,
        ...(episode.slug ? { slug: episode.slug } : {}),
        ...(episode.next ? { next: episode.next } : {}),
        ...(episode.status ? { status: episode.status } : {}),
      })),
      next: seriesNextAction({
        slug: status.series.slug,
        canonReady: gaps.length === 0,
        unplanned: status.episodes.filter((episode) => !episode.slug).map((episode) => episode.episode),
      }),
    };
  } catch (error) {
    return { slug: seriesDir.split(sep).at(-1)!, error: (error as Error).message };
  }
}

/** Everything the production overview shows. */
export async function productionOverview(root: string): Promise<{ projects: (ProductionProject | ProductionError)[]; series: (ProductionSeries | ProductionError)[] }> {
  const projects = await Promise.all((await projectDirs(root)).map((dir) => productionProject(dir)));
  const series = await Promise.all((await seriesDirs(root)).map((dir) => productionSeries(dir)));
  return { projects, series };
}
