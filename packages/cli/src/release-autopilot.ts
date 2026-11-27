import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { copyFile, mkdir, open, readFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { parseDocument } from 'yaml';
import {
  ProjectConfigSchema,
  ValidationError,
  approvalHolds,
  autopilotAttention,
  mainVideoId,
  notReleasedPublicly,
  planAutopilot,
  plainLyrics,
  readYamlFile,
  releasedPublicly,
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
  failureClass,
  redactSecrets,
  withFailureClass,
  YouTubePublisher,
  type SocialAdapter,
  type SocialPlatform,
  type SocialPostRequest,
} from '@coreslopper/providers';
import { autopilotReadiness, lastRunPath } from './autopilot-state.js';
import { publishProject, type PublishOptions, type PublishSummary } from './publish.js';
import { saveEnvValue } from './publish-auth.js';
import { loadReleaseFacts, releasePlan, releaseProjectDirs, type ReleaseFacts } from './release-facts.js';
import { acquireHolderLock } from './file-lock.js';
import { runCalendar } from './release-calendar.js';
import {
  appendAutopilotEntry,
  appendAutopilotEntryUnlocked,
  clearApproval,
  loadAutopilotLog,
  loadStatus,
  setApproval,
  setEventManual as setEventManualRecord,
  updateStatus,
  withReleaseLock,
} from './release-records.js';
import { micrositeSong } from './release-microsite.js';
import { probeVideo } from './short.js';

export { appendAutopilotEntry, autopilotLogPath, loadAutopilotLog } from './release-records.js';
export { autopilotReadiness } from './autopilot-state.js';

// The release autopilot's runner (ADR 0029): for every release the user
// approved on the board, post what is due by API, at its calendar time. Run
// by a timer every few minutes (`release-timer install`); each run is short
// and idempotent. Writes review/autopilot.json (its log) and
// review/release-status.json (what is live, with URLs).

/**
 * The user's one click: approve the release. A proposed release day becomes
 * the user's date in project.yaml first, so the calendar no longer moves.
 */
export async function approveRelease(projectRoot: string, options: { root: string; now: Date; releaseDate?: string }): Promise<ReleaseStatus> {
  // An internal project is never approved, also with a calendar from before it became internal: the refusal comes
  // before anything is written (CMD-ApproveRelease, ST-042). The distribution is read from project.yaml alone, like
  // the other readers of a project's distribution, so the check adds no other precondition to the approval.
  const config = await readYamlFile(join(projectRoot, 'project.yaml'), ProjectConfigSchema);
  if (!releasedPublicly(config)) {
    throw new ValidationError(`${notReleasedPublicly(config.slug)}: it is never approved.`);
  }
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
  return setApproval(projectRoot, { at: options.now.toISOString(), release_date: date });
}

/** Withdraw the approval: the autopilot stops; what is posted stays posted. */
export async function revokeApproval(projectRoot: string): Promise<ReleaseStatus> {
  return clearApproval(projectRoot);
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
  return setEventManualRecord(projectRoot, id, manual);
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
  /** One project's release facts; a round reads them once per project. Tests count calls through this seam. */
  loadFacts: (projectDir: string, root: string) => Promise<ReleaseFacts>;
}

function defaultDeps(): AutopilotDeps {
  const saveSecret = (key: string, value: string) => saveEnvValue(key, value);
  return {
    // Like the publish command: probe the videos, and keep the refresh token TikTok rotates.
    publish: (publishOptions) =>
      publishProject({ probe: probeVideo, onTikTokRefreshToken: (token) => saveEnvValue('TIKTOK_REFRESH_TOKEN', token), ...publishOptions }),
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
    loadFacts: loadReleaseFacts,
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
  projects: {
    slug: string;
    /** The user's approval holds for the calendar; only a publicly released project is acted on. */
    approved: boolean;
    acted: { id: string; status: AutopilotEntry['status']; url?: string; error?: string }[];
    attention: AutopilotEventPlan[];
  }[];
  /** Another run held the lock. */
  locked?: boolean;
}

const LOCK_STALE_MS = 2 * 3_600_000;

/** One run at a time: a timer round that starts while a long upload runs leaves it alone. */
function acquireLock(root: string): Promise<(() => Promise<void>) | undefined> {
  return acquireHolderLock(join(root, '.cache', 'release-run.lock'), { staleMs: LOCK_STALE_MS, alive: processAlive });
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
    for (const dir of await releaseProjectDirs(options.root)) {
      const slug = dir.split(sep).at(-1)!;
      if (options.project && options.project !== slug) continue;
      try {
        result.projects.push(await runProject(dir, slug, options, deps));
      } catch (error) {
        // One broken project must not stop the others.
        deps.log(`${slug}: skipped (${redactSecrets((error as Error).message)})`);
      }
    }
    if (!options.dryRun) {
      const every = Number(deps.env.CORESLOPPER_TIMER_EVERY);
      await writeTextAtomic(lastRunPath(options.root), `${JSON.stringify({ at: deps.now().toISOString(), ...(every > 0 ? { every } : {}) })}\n`);
    }
    return result;
  } finally {
    await release();
  }
}

async function runProject(dir: string, slug: string, options: AutopilotOptions, deps: AutopilotDeps): Promise<AutopilotRunResult['projects'][number]> {
  const acted: AutopilotRunResult['projects'][number]['acted'] = [];
  const facts = await deps.loadFacts(dir, options.root);
  // A project that is no longer released publicly is left alone, also with an approval from before (ST-041).
  if (!releasedPublicly(facts.project.config)) {
    deps.log(`${notReleasedPublicly(slug)}; nothing to post`);
    return { slug, approved: Boolean(facts.calendar && approvalHolds(facts.status, facts.calendar)), acted, attention: [] };
  }
  const settings = facts.schedule.autopilot;
  const { ready } = autopilotReadiness(settings, deps.env, deps.now());
  // One facts load for the round: only the records (status and log) are read again between steps.
  const plan = async () => {
    if (!facts.calendar) return [];
    return planAutopilot({
      calendar: facts.calendar,
      status: await loadStatus(dir),
      log: await loadAutopilotLog(dir),
      settings,
      now: deps.now(),
      ready,
      premiere: facts.input.premiere,
      plan: facts.plan,
    });
  };
  if (!facts.calendar || !approvalHolds(facts.status, facts.calendar)) {
    if (facts.status.approval && facts.calendar) deps.log(`${slug}: approved for ${facts.status.approval.release_date}, but the release is now on ${facts.calendar.release_date}: approve it again on the board`);
    return { slug, approved: false, acted, attention: [] };
  }

  // First the uploads that wait to go public: the posts that link to them follow in the same run.
  for (const item of (await plan()).filter((entry) => entry.state === 'pending' && entry.action?.kind === 'youtube')) {
    if (options.dryRun) continue;
    const outcome = await pollYouTube(dir, item, facts, deps).catch((error: Error) => {
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
    // Claim it under the project's lock: plan it again from the records as they are now (an earlier action
    // in this run, or a click on the board, may have changed things) and log it as running in the same breath.
    const claimed = await withReleaseLock(dir, async () => {
      const fresh = (await plan()).find((entry) => entry.id === item.id);
      if (fresh?.state !== 'due') return undefined;
      await appendAutopilotEntryUnlocked(dir, { event: item.id, status: 'running', at: deps.now().toISOString() });
      return fresh;
    });
    if (!claimed) continue;
    acted.push(await execute(dir, claimed, facts, await loadStatus(dir), deps));
  }
  if (!options.dryRun) {
    const comment = await ensurePinnedComment(dir, facts, deps, ready).catch((error: Error) => {
      deps.log(`${slug} ${COMMENT_EVENT}: could not check the main video (${redactSecrets(error.message)})`);
      return undefined;
    });
    if (comment) acted.push(comment);
  }
  const attention = autopilotAttention(await plan());
  for (const item of attention) deps.log(`${slug} ${item.id}: needs you (${item.state}${item.block ? `: ${item.block}` : ''})`);
  return { slug, approved: true, acted, attention };
}

/** A YouTube upload that went public (switched in Studio, or its scheduled time came): the event is live. */
async function pollYouTube(dir: string, item: AutopilotEventPlan, facts: ReleaseFacts, deps: AutopilotDeps) {
  const id = item.last?.remote_id;
  if (!id) return undefined;
  const video = await deps.youtube().videoStatus(id);
  if (video.privacyStatus !== 'public') return undefined;
  const url = item.last?.url ?? (item.action?.kind === 'youtube' && item.action.item !== 'main' ? `https://youtube.com/shorts/${id}` : `https://youtu.be/${id}`);
  await appendAutopilotEntry(dir, { event: item.id, status: 'posted', at: deps.now().toISOString(), remote_id: id, url });
  await markLive(dir, item.id, url, deps.now());
  deps.log(`${facts.input.slug} ${item.id}: live at ${url}`);
  return { id: item.id, status: 'posted' as const, url };
}

async function markLive(dir: string, id: string, url: string | undefined, now: Date) {
  await updateStatus(dir, id, { done: true, by: 'autopilot', ...(url ? { url } : {}) }, now);
}

/** The log event of the pinned comment under the main video: not a calendar event, one attempt per release. */
export const COMMENT_EVENT = 'youtube:comment';

/**
 * Once the main video is live (seen public by the runner, or ticked off on the
 * board), post the pinned comment once; pinning stays a click in Studio. The
 * attempt is logged as running first, and any entry stops further attempts but
 * a plain failure, which is retried up to `retries` times.
 */
async function ensurePinnedComment(dir: string, facts: ReleaseFacts, deps: AutopilotDeps, ready: Record<string, boolean>) {
  // A meme is posted as a Short: its one text is the caption, not a pinned comment under a main video.
  const status = await loadStatus(dir);
  const pinned = facts.input.kind === 'meme' ? undefined : releasePlan(facts, status).posts.find((post) => post.id === 'youtube')?.texts.pinned?.value ?? facts.data?.main.pinned_comment;
  const settings = facts.schedule.autopilot;
  const item = status.items.youtube;
  if (!pinned || !item?.done || item.manual || !settings.platforms.includes('youtube') || !ready.youtube) return undefined;
  const log = await loadAutopilotLog(dir);
  const id = mainVideoId(status, log);
  const entries = log.entries.filter((entry) => entry.event === COMMENT_EVENT);
  const failures = entries.filter((entry) => entry.status === 'failed' && !entry.uncertain && !entry.fatal).length;
  if (!id || entries.some((entry) => entry.status !== 'failed' || entry.uncertain || entry.fatal) || failures >= settings.retries) return undefined;
  if ((await deps.youtube().videoStatus(id)).privacyStatus !== 'public') return undefined;
  await appendAutopilotEntry(dir, { event: COMMENT_EVENT, status: 'running', at: deps.now().toISOString() });
  try {
    const { commentId } = await deps.youtube().postComment(id, pinned);
    await appendAutopilotEntry(dir, { event: COMMENT_EVENT, status: 'posted', at: deps.now().toISOString(), remote_id: commentId, manual_steps: ['Pin the comment under the video in YouTube Studio.'] });
    deps.log(`${facts.input.slug} ${COMMENT_EVENT}: posted; pin it in YouTube Studio`);
    return { id: COMMENT_EVENT, status: 'posted' as const };
  } catch (error) {
    const message = redactSecrets((error as Error).message);
    const outcome = failureClass(error);
    await appendAutopilotEntry(dir, {
      event: COMMENT_EVENT,
      status: 'failed',
      at: deps.now().toISOString(),
      error: message,
      ...(outcome === 'uncertain' ? { uncertain: true } : {}),
      ...(outcome === 'fatal' ? { fatal: true } : {}),
    });
    deps.log(`${facts.input.slug} ${COMMENT_EVENT}: failed: ${message}`);
    return { id: COMMENT_EVENT, status: 'failed' as const, error: message };
  }
}

/** One claimed event: act, log the outcome. */
async function execute(dir: string, item: AutopilotEventPlan, facts: ReleaseFacts, status: ReleaseStatus, deps: AutopilotDeps) {
  const slug = facts.input.slug;
  deps.log(`${slug} ${item.id}: ${item.action!.kind}...`);
  try {
    const outcome = await act(dir, item, facts, status, deps);
    await appendAutopilotEntry(dir, { event: item.id, at: deps.now().toISOString(), ...outcome });
    if (outcome.status === 'posted') await markLive(dir, item.id, outcome.url, deps.now());
    deps.log(`${slug} ${item.id}: ${outcome.status}${outcome.url ? ` ${outcome.url}` : ''}`);
    for (const step of outcome.manual_steps ?? []) deps.log(`  you: ${step}`);
    return { id: item.id, status: outcome.status, url: outcome.url };
  } catch (error) {
    const message = redactSecrets((error as Error).message ?? String(error));
    const outcome = failureClass(error);
    await appendAutopilotEntry(dir, {
      event: item.id,
      status: 'failed',
      at: deps.now().toISOString(),
      error: message,
      ...(outcome === 'uncertain' ? { uncertain: true } : {}),
      ...(outcome === 'fatal' ? { fatal: true } : {}),
    });
    deps.log(`${slug} ${item.id}: failed: ${message}`);
    return { id: item.id, status: 'failed' as const, error: message };
  }
}

type Outcome = Pick<AutopilotEntry, 'status'> & Partial<Pick<AutopilotEntry, 'remote_id' | 'url' | 'publish_at' | 'warnings' | 'manual_steps' | 'cost_usd'>>;

async function act(dir: string, item: AutopilotEventPlan, facts: ReleaseFacts, status: ReleaseStatus, deps: AutopilotDeps): Promise<Outcome> {
  const action = item.action!;
  const file = (rel: string | undefined) => (rel ? join(facts.dir, rel) : undefined);
  const youtubeUrl = status.items.youtube?.url;
  const settings = facts.schedule.autopilot;
  const post = releasePlan(facts, status).posts.find((entry) => entry.id === item.id);
  const text = (key: string): string => {
    if (!post) throw new ValidationError(`no release plan post for ${item.id}`);
    const value = post.texts[key]?.value;
    if (value === undefined) throw new ValidationError(`${item.id} has no ${key} in the release plan`);
    return value.replaceAll('{youtube}', youtubeUrl ?? '').replaceAll('{spotify}', status.items.song?.url ?? '');
  };
  const media = (): { path: string; kind: 'video' | 'image' } => {
    if (!post?.media) throw new ValidationError(`${item.id} has no media in the release plan`);
    return { path: file(post.media)!, kind: /\.(mp4|mov|webm)$/i.test(post.media) ? 'video' : 'image' };
  };

  if (action.kind === 'youtube' || action.kind === 'tiktok') {
    const platform = action.kind;
    // Scheduling needs an audited API project and at least 15 minutes of lead.
    const schedule = platform === 'youtube' && settings.youtube_audited && Date.parse(item.event.at) - deps.now().getTime() > 20 * 60_000 ? item.event.at : undefined;
    const summary = await deps.publish({
      projectDir: dir,
      root: facts.root,
      platform,
      only: action.item,
      ...(schedule ? { schedule } : {}),
      ...(platform === 'tiktok' ? { tiktokMode: settings.tiktok_direct || deps.env.TIKTOK_DIRECT_POST === '1' ? 'direct' : 'inbox' } : {}),
      now: deps.now,
      log: () => undefined,
    });
    const entry = summary.entries.find((candidate) => candidate.platform === platform) ?? summary.plan.steps.find((step) => step.platform === platform)?.previous;
    if (!entry) throw new ValidationError(`publish planned no ${platform} upload for ${action.item}`);
    if (entry.status === 'failed') {
      const failure = new Error(entry.error ?? `the ${platform} upload failed`);
      throw entry.uncertain ? withFailureClass(failure, 'uncertain') : failure;
    }
    if (platform === 'tiktok') {
      const directMode = settings.tiktok_direct || deps.env.TIKTOK_DIRECT_POST === '1';
      // A direct post goes live by itself, also one TikTok is still processing: never an inbox step for it.
      if (directMode && (entry.status === 'uploaded' || entry.status === 'processing')) {
        return { status: 'posted', remote_id: entry.remote_id, url: entry.url, warnings: entry.warnings, manual_steps: [] };
      }
      return {
        status: 'draft',
        remote_id: entry.remote_id,
        warnings: entry.warnings,
        manual_steps: summary.manualSteps.length ? summary.manualSteps : ['Post the draft from the TikTok inbox.'],
      };
    }
    const studio = entry.remote_id ? `https://studio.youtube.com/video/${entry.remote_id}/edit` : 'YouTube Studio';
    const steps: string[] = [];
    if (action.item === 'main' && facts.input.kind !== 'meme' && facts.schedule.release.premiere) steps.push(`Schedule it as a Premiere at ${item.event.at} in ${studio} (the API cannot).`);
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
    const target = isAbsolute(site.dir) ? site.dir : resolve(facts.root, site.dir);
    const slug = facts.input.slug;
    const lyrics = facts.music && existsSync(facts.project.paths.lyrics) ? plainLyrics(await readFile(facts.project.paths.lyrics, 'utf8')) : undefined;
    const song = micrositeSong(facts.input, { status, calendar: facts.calendar, lyrics });
    await mkdir(target, { recursive: true });
    await writeTextAtomic(join(target, `${slug}.json`), `${JSON.stringify(song, null, 2)}\n`);
    for (const rel of [song.images.cover, song.images.thumbnail, ...song.images.shorts].filter((path): path is string => Boolean(path))) {
      const destination = join(target, slug, rel);
      await mkdir(dirname(destination), { recursive: true });
      await copyFile(join(facts.dir, rel), destination);
    }
    if (site.command) await deps.runCommand(site.command, target);
    return { status: 'posted', manual_steps: [] };
  }

  const social = (request: SocialPostRequest, platform: SocialPlatform) => deps.social(platform).post(request);
  let request: SocialPostRequest;
  if (action.kind === 'instagram') {
    if (action.placement === 'reel') {
      if (post?.coverFrame !== undefined) {
        request = { event: item.id, text: text('caption'), media: media(), placement: 'reel', coverOffsetMs: Math.round(post.coverFrame * 1000) };
      } else {
        request = { event: item.id, text: text('caption'), media: media(), placement: 'reel' };
      }
    } else if (action.placement === 'feed') {
      request = { event: item.id, text: text('caption'), media: media(), placement: 'feed' };
    } else {
      request = { event: item.id, text: '', media: media(), placement: 'story' };
    }
  } else if (action.kind === 'x') {
    const reply = post?.texts.reply?.value;
    if (reply === undefined) request = { event: item.id, text: text('post'), ...(post?.media ? { media: media() } : {}) };
    else request = { event: item.id, text: text('post'), reply: text('reply'), ...(post?.media ? { media: media() } : {}) };
  } else {
    request = { event: item.id, text: text('post'), ...(post?.media ? { media: media() } : {}) };
  }
  const platform = action.kind as SocialPlatform;
  const result = await social(request, platform);
  return { status: 'posted', remote_id: result.remoteId, url: result.url, warnings: result.warnings, manual_steps: result.manualSteps, ...(result.costUsd !== undefined ? { cost_usd: result.costUsd } : {}) };
}

/** Print the plan of every release with a calendar, approved or not: what is due, waiting, and what needs the user. */
export async function autopilotOverview(root: string, options: { now?: Date; env?: NodeJS.ProcessEnv; log?: (line: string) => void } = {}): Promise<void> {
  const log = options.log ?? ((line: string) => console.log(line));
  const now = options.now ?? new Date();
  for (const dir of await releaseProjectDirs(root)) {
    const facts = await loadReleaseFacts(dir, root);
    if (!facts.calendar) continue;
    // A project that is no longer released publicly has no plan, even with an earlier calendar on disk (ST-041).
    if (!releasedPublicly(facts.project.config)) {
      log(`${notReleasedPublicly(facts.input.slug)}; nothing to plan`);
      continue;
    }
    const settings = facts.schedule.autopilot;
    const { ready, notes } = autopilotReadiness(settings, options.env, now);
    const plans = planAutopilot({ calendar: facts.calendar, status: facts.status, log: await loadAutopilotLog(dir), settings, now, ready, premiere: facts.input.premiere, plan: facts.plan });
    log(`${facts.input.slug}: ${facts.status.approval ? `approved ${facts.status.approval.at.slice(0, 10)}` : 'not approved'} (release ${facts.calendar.release_date})`);
    for (const plan of plans) {
      const when = plan.event.at.slice(0, 16).replace('T', ' ');
      log(`  ${when}  ${plan.id.padEnd(28)} ${plan.state}${plan.block ? ` (${plan.block})` : ''}${plan.needsUser ? '  ← you' : ''}`);
    }
    for (const note of notes) log(`  ! ${note}`);
  }
}
