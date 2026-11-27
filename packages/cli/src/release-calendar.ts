import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { stringify } from 'yaml';
import {
  ProjectConfigSchema,
  ReleaseCalendarSchema,
  ValidationError,
  buildCalendar,
  loadReleaseSchedule,
  mainVideoReel,
  releasedPublicly,
  zonedToday,
  readYamlFile,
  writeTextAtomic,
  type CalendarInput,
  type ReleaseCalendar,
  type ReleaseSchedule,
  type UploadData,
} from '@coreslopper/core';
import { loadStatus, updateStatus } from './release-records.js';

// The project side of the release calendar: where it lives and the other
// projects it must not collide with. Its done marks are release records.

export const calendarPath = (projectRoot: string) => join(projectRoot, 'review', 'calendar.yaml');

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

/**
 * The calendars of every other publicly released project in the workspace, read for the plan of one project. A
 * project with distribution internal is no other release: its calendar books no release day and no slot for another
 * project's plan, even when it stays on disk (CMD-PlanReleaseCalendar). An unreadable calendar is skipped; a project
 * whose `project.yaml` cannot be read counts as public, so a broken file keeps its booking rather than silently
 * freeing a day or a slot.
 */
export async function otherCalendars(projectRoot: string): Promise<ReleaseCalendar[]> {
  const calendars: ReleaseCalendar[] = [];
  for (const dir of await siblingProjects(projectRoot)) {
    if (dir === projectRoot) continue;
    const config = await readYamlFile(join(dir, 'project.yaml'), ProjectConfigSchema).catch(() => undefined);
    if (config && !releasedPublicly(config)) continue;
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
  /** The main video's length: over 180 s it gets no Reel. */
  durationSeconds?: number;
}): CalendarInput {
  const { data } = options;
  // A meme is posted, not announced, and has no feed post, X, LinkedIn, or microsite: it has three platform texts.
  const meme = options.kind === 'meme';
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
    announcement: !meme && Boolean(data?.announcement),
    communityPost: !meme && Boolean(data?.main.community_post),
    instagramPost: !meme && Boolean(data?.instagram_post) && mainVideoReel(options.durationSeconds),
    x: !meme && Boolean(data?.x),
    linkedin: !meme && data?.linkedin?.decision === 'post',
    microsite: !meme && Boolean(data?.microsite),
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
  const { loadProject, releaseIdentity, releasedPublicly } = await import('@coreslopper/core');
  const { listShorts, shortName } = await import('./release-files.js');
  const { loadUploadData, uploadPaths } = await import('./upload-text.js');
  const { songJson } = await import('./release.js');
  const project = await loadProject(options.projectDir);
  if (!releasedPublicly(project.config)) {
    throw new ValidationError(`${project.config.slug} is not released publicly (distribution: internal): it gets no release calendar.`);
  }
  const data = existsSync(uploadPaths(project.paths.root).data) ? await loadUploadData(project.paths.root) : undefined;
  const identity = releaseIdentity(project.config, await songJson(project));
  const shorts = (await listShorts(project.paths.renders)).map((file) => shortName(file)!).filter(Boolean);
  const calendar = await planCalendar(
    project.paths.root,
    calendarInput({
      slug: project.config.slug,
      title: identity.title,
      kind: project.config.kind,
      releaseDate: project.config.release?.release_date,
      data,
      shorts,
      durationSeconds: (project.effectiveTiming ?? project.timing)?.audio.duration,
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
