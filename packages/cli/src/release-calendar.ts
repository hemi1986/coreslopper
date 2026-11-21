import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { withFileLock } from './file-lock.js';
import { stringify } from 'yaml';
import {
  ReleaseCalendarSchema,
  ReleaseStatusSchema,
  ValidationError,
  buildCalendar,
  loadReleaseSchedule,
  zonedToday,
  readJsonFile,
  readYamlFile,
  writeJsonAtomic,
  writeTextAtomic,
  type CalendarInput,
  type ReleaseCalendar,
  type ReleaseSchedule,
  type ReleaseStatus,
  type UploadData,
} from '@coreslopper/core';

// The project side of the release calendar: where it lives, the other
// projects it must not collide with, and the user's posting status.

export const calendarPath = (projectRoot: string) => join(projectRoot, 'review', 'calendar.yaml');
export const statusPath = (projectRoot: string) => join(projectRoot, 'review', 'release-status.json');
/** One lock per project around every write of the release status and the autopilot log: the board and `release-run` both write them. */
export const releaseLockPath = (projectRoot: string) => join(projectRoot, 'review', '.release.lock');
export const withReleaseLock = <T>(projectRoot: string, fn: () => Promise<T>) => withFileLock(releaseLockPath(projectRoot), fn);

export async function loadCalendar(projectRoot: string): Promise<ReleaseCalendar | undefined> {
  const path = calendarPath(projectRoot);
  return existsSync(path) ? readYamlFile(path, ReleaseCalendarSchema) : undefined;
}

/** The project directories beside this one (every project of the workspace). */
export async function siblingProjects(projectRoot: string): Promise<string[]> {
  const parent = dirname(projectRoot);
  const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isDirectory() && existsSync(join(parent, entry.name, 'project.yaml')))
    .map((entry) => join(parent, entry.name))
    .sort();
}

/** The calendars of every other project in the workspace; an unreadable one is skipped. */
export async function otherCalendars(projectRoot: string): Promise<ReleaseCalendar[]> {
  const calendars: ReleaseCalendar[] = [];
  for (const dir of await siblingProjects(projectRoot)) {
    if (dir === projectRoot) continue;
    const calendar = await loadCalendar(dir).catch(() => undefined);
    if (calendar) calendars.push(calendar);
  }
  return calendars;
}

/** What goes into the calendar, from the upload data and the Shorts on disk. */
export function calendarInput(options: {
  slug: string;
  title: string;
  kind: CalendarInput['kind'];
  releaseDate?: string;
  data?: UploadData;
  shorts: string[];
}): CalendarInput {
  const { data } = options;
  const shorts = options.shorts.map((name) => {
    const short = data?.shorts.find((entry) => entry.name === name);
    if (!short) return { name, platforms: ['youtube', 'tiktok', 'instagram'] as CalendarInput['shorts'][number]['platforms'] };
    const platforms: CalendarInput['shorts'][number]['platforms'] = ['youtube'];
    if (short.tiktok || short.platforms.includes('tiktok')) platforms.push('tiktok');
    if (short.instagram) platforms.push('instagram');
    if (short.x) platforms.push('x');
    return { name, platforms };
  });
  return {
    slug: options.slug,
    title: options.title,
    kind: options.kind,
    releaseDate: options.releaseDate,
    shorts,
    announcement: Boolean(data?.announcement),
    communityPost: Boolean(data?.main.community_post),
    instagramPost: Boolean(data?.instagram_post),
    x: Boolean(data?.x),
    linkedin: data?.linkedin?.decision === 'post',
    microsite: Boolean(data?.microsite),
  };
}

/** Plan (or update) the project's calendar under the workspace schedule and write review/calendar.yaml. */
export async function planCalendar(
  projectRoot: string,
  input: CalendarInput,
  options: { root: string; now: Date; replan?: boolean; schedule?: ReleaseSchedule },
): Promise<ReleaseCalendar> {
  const schedule = options.schedule ?? (await loadReleaseSchedule(options.root));
  const calendar = buildCalendar(input, {
    schedule,
    now: options.now,
    existing: await loadCalendar(projectRoot).catch(() => undefined),
    others: await otherCalendars(projectRoot),
    replan: options.replan,
  });
  const header = '# Release calendar, written by `release`. Times you move here are kept; `calendar --replan` plans again.\n';
  await writeTextAtomic(calendarPath(projectRoot), header + stringify(ReleaseCalendarSchema.parse(calendar)));
  return calendar;
}

export async function loadStatus(projectRoot: string): Promise<ReleaseStatus> {
  const path = statusPath(projectRoot);
  return existsSync(path) ? readJsonFile(path, ReleaseStatusSchema) : { version: 1, items: {} };
}

/** Mark one calendar event (or any board item) done or open, by the user or the autopilot, and record its live URL. */
export async function updateStatus(
  projectRoot: string,
  id: string,
  change: { done?: boolean; url?: string | null; by?: 'user' | 'autopilot' },
  now: Date,
): Promise<ReleaseStatus> {
  return withReleaseLock(projectRoot, () => updateStatusUnlocked(projectRoot, id, change, now));
}

async function updateStatusUnlocked(projectRoot: string, id: string, change: { done?: boolean; url?: string | null; by?: 'user' | 'autopilot' }, now: Date): Promise<ReleaseStatus> {
  const status = await loadStatus(projectRoot);
  const item = { ...(status.items[id] ?? { done: false }) };
  if (change.done !== undefined) {
    item.done = change.done;
    item.at = change.done ? now.toISOString() : undefined;
    if (change.done && change.by) item.by = change.by;
    else if (!change.done) delete item.by;
  }
  if (change.url === null || change.url === '') delete item.url;
  else if (change.url !== undefined) item.url = change.url;
  status.items[id] = item;
  const parsed = ReleaseStatusSchema.parse(status);
  await writeJsonAtomic(statusPath(projectRoot), parsed);
  return parsed;
}

/** `calendar <project>`: plan the calendar alone, from the upload data and the Shorts in renders/shorts/. */
export async function runCalendar(options: {
  projectDir: string;
  root: string;
  replan?: boolean;
  /** Mark every event up to the end of this day (`YYYY-MM-DD` or `today`) as done: for a song that is already out. */
  doneUntil?: string;
  now?: Date;
  log?: (line: string) => void;
}): Promise<ReleaseCalendar> {
  const { loadProject, releaseIdentity } = await import('@coreslopper/core');
  const { listShorts, shortName } = await import('./release-files.js');
  const { loadUploadData, uploadPaths } = await import('./upload-text.js');
  const { songJson } = await import('./release.js');
  const project = await loadProject(options.projectDir);
  const data = existsSync(uploadPaths(project.paths.root).data) ? await loadUploadData(project.paths.root) : undefined;
  const identity = releaseIdentity(project.config, await songJson(project));
  const shorts = (await listShorts(project.paths.renders)).map((file) => shortName(file)!).filter(Boolean);
  const calendar = await planCalendar(
    project.paths.root,
    calendarInput({
      slug: project.config.slug,
      title: identity.title,
      kind: project.config.kind === 'episode' ? 'episode' : 'music-video',
      releaseDate: project.config.release?.release_date,
      data,
      shorts,
    }),
    { root: options.root, now: options.now ?? new Date(), replan: options.replan },
  );
  const log = options.log ?? ((line: string) => console.log(line));
  if (options.doneUntil) {
    const now = options.now ?? new Date();
    const until = options.doneUntil === 'today' ? zonedToday(now, calendar.timezone) : options.doneUntil;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) throw new ValidationError('--done-until takes YYYY-MM-DD or today');
    const status = await loadStatus(project.paths.root);
    const past = calendar.events.filter((event) => event.at.slice(0, 10) <= until && !status.items[event.id]?.done);
    for (const event of past) await updateStatus(project.paths.root, event.id, { done: true }, now);
    log(`Marked ${past.length} event(s) up to ${until} as done.`);
  }
  log(`Release calendar: ${calendarPath(project.paths.root)}`);
  log(`  Release day ${calendar.release_date}${calendar.proposed ? ' (proposed: set release.release_date in project.yaml to fix it)' : ''}, ${calendar.events.length} events`);
  for (const event of calendar.events) log(`  ${event.at.slice(0, 16).replace('T', ' ')}  ${event.platform.padEnd(11)} ${event.step}${event.item !== 'main' ? ` ${event.item}` : ''}`);
  return calendar;
}
