import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import {
  ConfigError,
  ProjectConfigSchema,
  ValidationError,
  autopilotAttention,
  mainVideoId,
  planAutopilot,
  plainLyrics,
  writeJsonAtomic,
  writeTextAtomic,
  type AutopilotEntry,
  type AutopilotEventPlan,
  type AutopilotLog,
  type ReleaseStatus,
} from '@coreslopper/core';
import {
  FalProvider,
  InstagramPublisher,
  LinkedInPublisher,
  XPublisher,
  redactSecrets,
  YouTubePublisher,
  type SocialAdapter,
  type SocialPlatform,
  type SocialPostRequest,
} from '@coreslopper/providers';
import { appendAutopilotEntry, autopilotReadiness, lastRunPath, loadAutopilotLog } from './autopilot-state.js';
import { publishProject, type PublishOptions, type PublishSummary } from './publish.js';
import { saveEnvValue } from './publish-auth.js';
import { boardProjectDirs } from './release-board.js';
import { projectReleaseContext } from './release-board-data.js';
import { loadStatus, runCalendar, statusPath, updateStatus } from './release-calendar.js';
import { micrositeSong } from './release-microsite.js';
import { announcementText, feedVideo, linkedinPostText, mediaFile, xTexts } from './release-texts.js';

export { appendAutopilotEntry, autopilotLogPath, autopilotReadiness, loadAutopilotLog } from './autopilot-state.js';

// The release autopilot's runner (ADR 0029): for every release the user
// approved on the board, post what is due by API, at its calendar time. Run
// by a timer every few minutes (`release-timer install`); each run is short
// and idempotent. Writes review/autopilot.json (its log) and
// review/release-status.json (what is live, with URLs).

async function writeStatus(projectRoot: string, change: (status: ReleaseStatus) => void): Promise<ReleaseStatus> {
  const status = await loadStatus(projectRoot);
  change(status);
  await writeJsonAtomic(statusPath(projectRoot), status);
  return status;
}

/**
 * The user's one click: approve the release. A proposed release day becomes
 * the user's date in project.yaml first, so the calendar no longer moves.
 */
export async function approveRelease(projectRoot: string, options: { root: string; now: Date; releaseDate?: string }): Promise<ReleaseStatus> {
  const { loadCalendar } = await import('./release-calendar.js');
  const calendar = await loadCalendar(projectRoot);
  if (!calendar) throw new ValidationError('The project has no release calendar yet: run release first.');
  const date = options.releaseDate ?? calendar.release_date;
  if (options.releaseDate && options.releaseDate !== calendar.release_date) {
    throw new ValidationError(`The calendar plans ${calendar.release_date}, not ${options.releaseDate}; reload the board.`);
  }
  if (calendar.proposed) {
    await setReleaseDate(projectRoot, date);
    await runCalendar({ projectDir: projectRoot, root: options.root, now: options.now, log: () => undefined });
  }
  return writeStatus(projectRoot, (status) => {
    status.approval = { at: options.now.toISOString(), release_date: date };
  });
}

/** Withdraw the approval: the autopilot stops; what is posted stays posted. */
export async function revokeApproval(projectRoot: string): Promise<ReleaseStatus> {
  return writeStatus(projectRoot, (status) => {
    delete status.approval;
  });
}

/** Write `release.release_date` into project.yaml, keeping its comments and layout. */
export async function setReleaseDate(projectRoot: string, date: string): Promise<void> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError(`not a day: ${date}`);
  const path = join(projectRoot, 'project.yaml');
  const document = parseDocument(await readFile(path, 'utf8'));
  document.setIn(['release', 'release_date'], date);
  ProjectConfigSchema.parse(document.toJS());
  await writeTextAtomic(path, document.toString());
}

/** The user takes a post over by hand (or gives it back to the autopilot). */
export async function setEventManual(projectRoot: string, id: string, manual: boolean): Promise<ReleaseStatus> {
  return writeStatus(projectRoot, (status) => {
    const item = { ...(status.items[id] ?? { done: false }) };
    if (manual) item.manual = true;
    else delete item.manual;
    status.items[id] = item;
  });
}

/** Another attempt after a failure or a stuck run; `force` posts a missed post although its time has passed. */
export async function retryEvent(projectRoot: string, id: string, now: Date, force = false): Promise<AutopilotLog> {
  let log = await appendAutopilotEntry(projectRoot, { event: id, status: 'retry', at: now.toISOString() });
  if (force) log = await appendAutopilotEntry(projectRoot, { event: id, status: 'force', at: now.toISOString() });
  return log;
}

/** What the runner calls; tests replace it. */
export interface AutopilotDeps {
  publish: (options: PublishOptions) => Promise<PublishSummary>;
  youtube: () => Pick<YouTubePublisher, 'videoStatus' | 'appendToDescription' | 'postComment'>;
  social: (platform: SocialPlatform) => SocialAdapter;
  runCommand: (command: string, cwd: string) => Promise<void>;
  env: NodeJS.ProcessEnv;
  now: () => Date;
  log: (line: string) => void;
}

function defaultDeps(): AutopilotDeps {
  const saveSecret = (key: string, value: string) => saveEnvValue(key, value);
  return {
    publish: publishProject,
    youtube: () => new YouTubePublisher(),
    social: (platform) => {
      if (platform === 'x') return new XPublisher({ saveSecret });
      if (platform === 'linkedin') return new LinkedInPublisher({ saveSecret });
      const fal = new FalProvider();
      return new InstagramPublisher({ saveSecret, hostMedia: (path) => fal.uploadFile(path) });
    },
    runCommand: (command, cwd) =>
      new Promise((done, fail) => {
        const child = spawn(command, { cwd, shell: true, stdio: 'inherit' });
        const timer = setTimeout(() => child.kill('SIGTERM'), 10 * 60_000);
        child.on('error', fail);
        child.on('exit', (code) => {
          clearTimeout(timer);
          if (code === 0) done();
          else fail(new Error(`the microsite command exited with ${code}`));
        });
      }),
    env: process.env,
    now: () => new Date(),
    log: (line) => console.log(line),
  };
}

export interface AutopilotOptions {
  root: string;
  /** Only this project (slug). */
  project?: string;
  /** Print what is due; post nothing, write nothing. */
  dryRun?: boolean;
  deps?: Partial<AutopilotDeps>;
}

export interface AutopilotRunResult {
  projects: { slug: string; approved: boolean; acted: { id: string; status: AutopilotEntry['status']; url?: string; error?: string }[]; attention: AutopilotEventPlan[] }[];
  /** Another run held the lock. */
  locked?: boolean;
}

const LOCK_STALE_MS = 2 * 3_600_000;

/** One run at a time: a timer round that starts while a long upload runs leaves it alone. */
async function acquireLock(root: string): Promise<(() => Promise<void>) | undefined> {
  const path = join(root, '.cache', 'release-run.lock');
  await mkdir(dirname(path), { recursive: true });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(path, 'wx');
      await handle.writeFile(JSON.stringify({ pid: process.pid, at: new Date().toISOString() }));
      await handle.close();
      return () => rm(path, { force: true });
    } catch {
      const info = await stat(path).catch(() => undefined);
      const holder = await readFile(path, 'utf8').then((text) => JSON.parse(text) as { pid?: number }).catch(() => ({}) as { pid?: number });
      const alive = typeof holder.pid === 'number' && processAlive(holder.pid);
      if (alive && info && Date.now() - info.mtimeMs < LOCK_STALE_MS) return undefined;
      await rm(path, { force: true });
    }
  }
  return undefined;
}

function processAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Run the autopilot once over every approved release of the workspace. */
export async function runAutopilot(options: AutopilotOptions): Promise<AutopilotRunResult> {
  const deps = { ...defaultDeps(), ...options.deps };
  const release = options.dryRun ? async () => undefined : await acquireLock(options.root);
  if (!release) {
    deps.log('release-run: another run is active; nothing to do.');
    return { projects: [], locked: true };
  }
  try {
    const result: AutopilotRunResult = { projects: [] };
    for (const dir of await boardProjectDirs(options.root)) {
      const slug = dir.split(sep).at(-1)!;
      if (options.project && options.project !== slug) continue;
      try {
        result.projects.push(await runProject(dir, slug, options, deps));
      } catch (error) {
        // One broken project must not stop the others.
        deps.log(`${slug}: skipped (${redactSecrets((error as Error).message)})`);
      }
    }
    if (!options.dryRun) await writeTextAtomic(lastRunPath(options.root), `${deps.now().toISOString()}\n`);
    return result;
  } finally {
    await release();
  }
}

async function runProject(dir: string, slug: string, options: AutopilotOptions, deps: AutopilotDeps): Promise<AutopilotRunResult['projects'][number]> {
  const acted: AutopilotRunResult['projects'][number]['acted'] = [];
  let context = await projectReleaseContext(dir, options.root);
  const settings = context.schedule.autopilot;
  const { ready } = autopilotReadiness(settings, deps.env, deps.now());
  const plan = async () => {
    context = await projectReleaseContext(dir, options.root);
    if (!context.calendar) return [];
    return planAutopilot({
      calendar: context.calendar,
      status: context.status,
      log: await loadAutopilotLog(dir),
      settings,
      now: deps.now(),
      ready,
      premiere: context.schedule.release.premiere,
    });
  };
  if (!context.calendar || !context.status.approval) return { slug, approved: Boolean(context.status.approval), acted, attention: [] };

  // First the uploads that wait to go public: the posts that link to them follow in the same run.
  for (const item of (await plan()).filter((entry) => entry.state === 'pending' && entry.action?.kind === 'youtube')) {
    if (options.dryRun) continue;
    const outcome = await pollYouTube(dir, item, context, deps).catch((error: Error) => {
      deps.log(`${slug} ${item.id}: could not read the video's status (${redactSecrets(error.message)})`);
      return undefined;
    });
    if (outcome) acted.push(outcome);
  }

  for (const item of (await plan()).filter((entry) => entry.state === 'due').sort((a, b) => Date.parse(a.dueAt!) - Date.parse(b.dueAt!))) {
    if (options.dryRun) {
      deps.log(`${slug} ${item.id}: due (${item.action!.kind})`);
      acted.push({ id: item.id, status: 'running' });
      continue;
    }
    // A post that links to the main video is planned again: an earlier action in this run may have changed things.
    const current = (await plan()).find((entry) => entry.id === item.id);
    if (current?.state !== 'due') continue;
    acted.push(await execute(dir, current, context, deps));
  }
  const attention = autopilotAttention(await plan());
  for (const item of attention) deps.log(`${slug} ${item.id}: needs you (${item.state}${item.block ? `: ${item.block}` : ''})`);
  return { slug, approved: true, acted, attention };
}

type Context = Awaited<ReturnType<typeof projectReleaseContext>>;

/** A YouTube upload that went public (switched in Studio, or its scheduled time came): the event is live. */
async function pollYouTube(dir: string, item: AutopilotEventPlan, context: Context, deps: AutopilotDeps) {
  const id = item.last?.remote_id;
  if (!id) return undefined;
  const video = await deps.youtube().videoStatus(id);
  if (video.privacyStatus !== 'public') return undefined;
  const url = item.last?.url ?? (item.action?.kind === 'youtube' && item.action.item !== 'main' ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`);
  const steps: string[] = [];
  // The main video is live: post the pinned comment (pinning stays a click in Studio).
  const pinned = context.data?.main.pinned_comment;
  if (item.id === 'youtube' && pinned) {
    try {
      await deps.youtube().postComment(id, pinned);
      steps.push('Pin the comment under the video in YouTube Studio.');
    } catch (error) {
      steps.push(`Post and pin the comment yourself: ${pinned} (${redactSecrets((error as Error).message)})`);
    }
  }
  await appendAutopilotEntry(dir, { event: item.id, status: 'posted', at: deps.now().toISOString(), remote_id: id, url, manual_steps: steps });
  await markLive(dir, item.id, url, deps.now());
  deps.log(`${context.input.slug} ${item.id}: live at ${url}`);
  return { id: item.id, status: 'posted' as const, url };
}

async function markLive(dir: string, id: string, url: string | undefined, now: Date) {
  await updateStatus(dir, id, { done: true, ...(url ? { url } : {}) }, now);
  await writeStatus(dir, (status) => {
    status.items[id] = { ...status.items[id]!, by: 'autopilot' };
  });
}

/** One due event: log the attempt, act, log the outcome. */
async function execute(dir: string, item: AutopilotEventPlan, context: Context, deps: AutopilotDeps) {
  const slug = context.input.slug;
  const started = deps.now().toISOString();
  await appendAutopilotEntry(dir, { event: item.id, status: 'running', at: started });
  deps.log(`${slug} ${item.id}: ${item.action!.kind}...`);
  try {
    const outcome = await act(dir, item, context, deps);
    await appendAutopilotEntry(dir, { event: item.id, at: deps.now().toISOString(), ...outcome });
    if (outcome.status === 'posted') await markLive(dir, item.id, outcome.url, deps.now());
    deps.log(`${slug} ${item.id}: ${outcome.status}${outcome.url ? ` ${outcome.url}` : ''}`);
    for (const step of outcome.manual_steps ?? []) deps.log(`  you: ${step}`);
    return { id: item.id, status: outcome.status, url: outcome.url };
  } catch (error) {
    const message = redactSecrets((error as Error).message ?? String(error));
    const uncertain = Boolean((error as { uncertain?: boolean }).uncertain);
    const fatal = error instanceof ConfigError || error instanceof ValidationError;
    await appendAutopilotEntry(dir, { event: item.id, status: 'failed', at: deps.now().toISOString(), error: message, ...(uncertain ? { uncertain } : {}), ...(fatal ? { fatal } : {}) });
    deps.log(`${slug} ${item.id}: failed: ${message}`);
    return { id: item.id, status: 'failed' as const, error: message };
  }
}

type Outcome = Pick<AutopilotEntry, 'status'> & Partial<Pick<AutopilotEntry, 'remote_id' | 'url' | 'publish_at' | 'warnings' | 'manual_steps' | 'cost_usd'>>;

async function act(dir: string, item: AutopilotEventPlan, context: Context, deps: AutopilotDeps): Promise<Outcome> {
  const action = item.action!;
  const { data, files, status } = context;
  if (!data) throw new ValidationError('review/upload.yaml is missing');
  const file = (rel: string | undefined) => (rel ? join(context.dir, rel) : undefined);
  const youtubeUrl = status.items.youtube?.url;
  const settings = context.schedule.autopilot;

  if (action.kind === 'youtube' || action.kind === 'tiktok') {
    const platform = action.kind;
    // Scheduling needs an audited API project and at least 15 minutes of lead.
    const schedule = platform === 'youtube' && settings.youtube_audited && Date.parse(item.event.at) - deps.now().getTime() > 20 * 60_000 ? item.event.at : undefined;
    const summary = await deps.publish({
      projectDir: dir,
      platform,
      only: action.item,
      ...(schedule ? { schedule } : {}),
      ...(platform === 'tiktok' ? { tiktokMode: settings.tiktok_direct ? 'direct' : 'inbox' } : {}),
      now: deps.now,
      log: () => undefined,
    });
    const entry = summary.entries.find((candidate) => candidate.platform === platform) ?? summary.plan.steps.find((step) => step.platform === platform)?.previous;
    if (!entry) throw new ValidationError(`publish planned no ${platform} upload for ${action.item}`);
    if (entry.status === 'failed') throw new Error(entry.error ?? `the ${platform} upload failed`);
    if (platform === 'tiktok') {
      const direct = settings.tiktok_direct && entry.status === 'uploaded';
      return {
        status: direct ? 'posted' : 'draft',
        remote_id: entry.remote_id,
        url: direct ? entry.url : undefined,
        warnings: entry.warnings,
        manual_steps: direct ? [] : summary.manualSteps.length ? summary.manualSteps : ['Post the draft from the TikTok inbox.'],
      };
    }
    const studio = entry.remote_id ? `https://studio.youtube.com/video/${entry.remote_id}/edit` : 'YouTube Studio';
    const steps: string[] = [];
    if (action.item === 'main' && context.schedule.release.premiere) steps.push(`Schedule it as a Premiere at ${item.event.at} in ${studio} (the API cannot).`);
    else if (entry.status !== 'scheduled') steps.push(`Switch it to public at ${item.event.at} in ${studio} (an unaudited API project uploads private only).`);
    if (action.item !== 'main') steps.push(`Set the related video to the main video in ${studio}.`);
    return { status: entry.status === 'scheduled' ? 'scheduled' : 'uploaded', remote_id: entry.remote_id, url: entry.url, publish_at: entry.publish_at, warnings: entry.warnings, manual_steps: steps };
  }

  if (action.kind === 'links') {
    const id = mainVideoId(status, await loadAutopilotLog(dir));
    const spotify = status.items.song?.url;
    if (!id || !spotify) throw new ValidationError('the links step needs the main video and the Spotify link');
    const result = await deps.youtube().appendToDescription(id, `🎧 Spotify: ${spotify}`);
    return { status: 'posted', remote_id: id, manual_steps: [`Add the Spotify link to the pinned comment if you want it there: ${spotify}`], warnings: result.changed ? [] : ['the description already held the Spotify link'] };
  }

  if (action.kind === 'microsite') {
    const site = settings.microsite!;
    const target = isAbsolute(site.dir) ? site.dir : resolve(workspaceRootOf(context), site.dir);
    const slug = context.input.slug;
    const lyrics = context.music && existsSync(context.project.paths.lyrics) ? plainLyrics(await readFile(context.project.paths.lyrics, 'utf8')) : undefined;
    const song = micrositeSong(context.input, { status, calendar: context.calendar, lyrics });
    await mkdir(target, { recursive: true });
    await writeTextAtomic(join(target, `${slug}.json`), `${JSON.stringify(song, null, 2)}\n`);
    for (const rel of [song.images.cover, song.images.thumbnail, ...song.images.shorts].filter((path): path is string => Boolean(path))) {
      const destination = join(target, slug, rel);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(context.dir, rel), destination);
    }
    if (site.command) await deps.runCommand(site.command, target);
    return { status: 'posted', manual_steps: [] };
  }

  const social = (request: SocialPostRequest, platform: SocialPlatform) => deps.social(platform).post(request);
  let request: SocialPostRequest;
  if (action.kind === 'instagram') {
    if (action.placement === 'reel') {
      const short = data.shorts.find((entry) => entry.name === action.item);
      const video = files.shorts.find((entry) => entry.name === action.item)?.video;
      if (!short?.instagram || !video) throw new ValidationError(`no Instagram text or video for ${action.item}`);
      request = {
        event: item.id,
        text: [short.instagram.caption.trim(), short.instagram.hashtags.join(' ')].filter(Boolean).join('\n\n'),
        media: { path: file(video)!, kind: 'video' },
        placement: 'reel',
        ...(short.instagram.cover_frame !== undefined ? { coverOffsetMs: Math.round(short.instagram.cover_frame * 1000) } : {}),
      };
    } else if (action.placement === 'feed') {
      if (!data.instagram_post) throw new ValidationError('instagram_post is missing in review/upload.yaml');
      const video = feedVideo(context.input);
      const image = files.feedImage ?? files.cover;
      if (!video && !image) throw new ValidationError('no feed video or image in the release folder');
      request = {
        event: item.id,
        text: [data.instagram_post.caption.trim(), data.instagram_post.hashtags.join(' ')].filter(Boolean).join('\n\n'),
        media: video ? { path: file(video)!, kind: 'video' } : { path: file(image)!, kind: 'image' },
        placement: 'feed',
      };
    } else {
      const image = files.announceStory ?? files.cover;
      if (!image) throw new ValidationError('no announcement story image in the release folder');
      request = { event: item.id, text: '', media: { path: file(image)!, kind: 'image' }, placement: 'story' };
    }
  } else if (action.kind === 'x') {
    if (action.item === 'announcement') {
      const text = announcementText(context.input);
      if (!text) throw new ValidationError('announcement is missing in review/upload.yaml');
      const media = files.teaser ? { path: file(files.teaser)!, kind: 'video' as const } : files.announcePost ?? files.cover ? { path: file(files.announcePost ?? files.cover)!, kind: 'image' as const } : undefined;
      request = { event: item.id, text, ...(media ? { media } : {}) };
    } else if (action.item === 'main') {
      if (!data.x || !youtubeUrl) throw new ValidationError('x or the live main video is missing');
      const texts = xTexts(data.x, youtubeUrl);
      const video = mediaFile(context.input, data.x.media ?? files.shorts[0]?.name);
      request = { event: item.id, text: texts.post, reply: texts.reply, ...(video ? { media: { path: file(video)!, kind: 'video' as const } } : {}) };
    } else {
      const short = data.shorts.find((entry) => entry.name === action.item);
      const video = files.shorts.find((entry) => entry.name === action.item)?.video;
      if (!short?.x || !video) throw new ValidationError(`no X text or video for ${action.item}`);
      const texts = xTexts({ ...short.x, reply: undefined }, youtubeUrl ?? '');
      request = { event: item.id, text: texts.post, ...(texts.reply ? { reply: texts.reply } : {}), media: { path: file(video)!, kind: 'video' } };
    }
  } else {
    const li = data.linkedin;
    if (li?.decision !== 'post' || !youtubeUrl) throw new ValidationError('the LinkedIn post or the live main video is missing');
    const video = mediaFile(context.input, li.media);
    request = { event: item.id, text: linkedinPostText(li, youtubeUrl), ...(video ? { media: { path: file(video)!, kind: 'video' as const } } : {}) };
  }
  const platform = action.kind as SocialPlatform;
  const result = await social(request, platform);
  return { status: 'posted', remote_id: result.remoteId, url: result.url, warnings: result.warnings, manual_steps: result.manualSteps, ...(result.costUsd !== undefined ? { cost_usd: result.costUsd } : {}) };
}

/** The workspace root of a project: two levels above it (`<root>/projects/<slug>`). */
function workspaceRootOf(context: Context): string {
  return resolve(context.project.paths.root, '..', '..');
}

/** Print the plan of every approved release: what is due, waiting, and what needs the user. */
export async function autopilotOverview(root: string, options: { now?: Date; env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {}): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? new Date();
  for (const dir of await boardProjectDirs(root)) {
    const context = await projectReleaseContext(dir, root);
    if (!context.calendar) continue;
    const settings = context.schedule.autopilot;
    const { ready, notes } = autopilotReadiness(settings, options.env, now);
    const plans = planAutopilot({ calendar: context.calendar, status: context.status, log: await loadAutopilotLog(dir), settings, now, ready, premiere: context.schedule.release.premiere });
    log(`${context.input.slug}: ${context.status.approval ? `approved ${context.status.approval.at.slice(0, 10)}` : 'not approved'} (release ${context.calendar.release_date})`);
    for (const plan of plans) {
      const when = plan.event.at.slice(0, 16).replace('T', ' ');
      log(`  ${when}  ${plan.id.padEnd(28)} ${plan.state}${plan.block ? ` (${plan.block})` : ''}${plan.needsUser ? '  ← you' : ''}`);
    }
    for (const note of notes) log(`  ! ${note}`);
  }
}
