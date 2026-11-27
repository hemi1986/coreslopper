import type {
  AutopilotEntry,
  AutopilotLog,
  AutopilotPlatform,
  AutopilotSettings,
  CalendarEvent,
  ReleaseCalendar,
  ReleasePlan,
  ReleaseStatus,
} from './schema.js';

// The release autopilot (ADR 0029): which calendar events a platform API can
// post, and where each one stands. Pure: the runner (`release-run`) and the
// release board both read the same plan; only the runner acts on it, and only
// for a release the user approved.

/** What the autopilot does for an event. */
export type AutopilotAction =
  /** Upload the main video (`main`) or a Short to YouTube ahead of its time. */
  | { kind: 'youtube'; item: string }
  /** A Short to TikTok: an inbox draft, or a direct post for an audited app. */
  | { kind: 'tiktok'; item: string }
  /** A Reel (Short), the feed post (`main`), or the announcement story. */
  | { kind: 'instagram'; placement: 'reel' | 'feed' | 'story'; item: string }
  /** The announcement (`announcement`), the release post (`main`), or a Short. */
  | { kind: 'x'; item: string }
  | { kind: 'linkedin' }
  /** The day after: the Spotify link into the main video's description, and the pinned comment. */
  | { kind: 'links' }
  /** Copy the song page into the microsite and run its deploy command. */
  | { kind: 'microsite' };

export type AutopilotState =
  /** No API for it, its platform is off, or the user took it over. */
  | 'manual'
  | 'done'
  /** The release is not approved yet, or its day moved since the approval. */
  | 'unapproved'
  /** Before its time. */
  | 'waiting'
  /** The runner acts on its next round. */
  | 'due'
  /** Its time has come, but something it needs is missing (`reason`). */
  | 'blocked'
  | 'running'
  /** Uploaded or sent, not public yet: a private or scheduled YouTube video, a TikTok draft. */
  | 'pending'
  /** The attempts are used up. */
  | 'failed'
  /** An attempt never finished: check the platform, then retry or mark it done. */
  | 'stuck'
  /** Its time passed by more than `late_hours` before the runner got to it. */
  | 'missed';

/** Why an event is blocked. */
export type AutopilotBlock =
  /** The platform has no credentials. */
  | 'credentials'
  /** The post links to the main video, which is not public yet. */
  | 'youtube'
  /** The links step needs the song's Spotify URL on the board. */
  | 'spotify';

export interface AutopilotEventPlan {
  id: string;
  event: CalendarEvent;
  action?: AutopilotAction;
  platform?: AutopilotPlatform;
  state: AutopilotState;
  /** When the runner acts: the calendar time, or earlier for a YouTube upload. */
  dueAt?: string;
  /** Not before this time after a failed attempt. */
  retryAt?: string;
  block?: AutopilotBlock;
  /** Failed attempts since the last retry. */
  attempts: number;
  /** The newest log entry of the event. */
  last?: AutopilotEntry;
  /** The user has to do something: retry, check, post a draft, switch a video public. */
  needsUser: boolean;
}

export interface AutopilotContext {
  calendar: ReleaseCalendar;
  status: ReleaseStatus;
  log: AutopilotLog;
  settings: AutopilotSettings;
  now: Date;
  /** Platforms whose credentials are set; a missing platform blocks its events. Omit to assume all. */
  ready?: Partial<Record<AutopilotPlatform, boolean>>;
  /** The main video goes out as a Premiere, which only YouTube Studio can set. */
  premiere?: boolean;
  /** The release plan: a post whose plan says it needs no YouTube link (an X post without a reply) waits for nothing. Omit to wait as before. */
  plan?: Pick<ReleasePlan, 'posts'>;
  /** Minutes after which a running attempt counts as stuck. */
  stuckMinutes?: number;
}

const HOUR = 3_600_000;

/** The API action of a calendar event under the settings, or undefined when it stays manual. */
export function autopilotAction(event: CalendarEvent, settings: Pick<AutopilotSettings, 'microsite'>): AutopilotAction | undefined {
  const { platform, step, item } = event;
  if (platform === 'youtube' && step === 'youtube') return { kind: 'youtube', item: 'main' };
  if (platform === 'youtube' && step === 'links') return { kind: 'links' };
  if (platform === 'shorts' && step === 'short') return { kind: 'youtube', item };
  if (platform === 'tiktok' && step === 'short') return { kind: 'tiktok', item };
  if (platform === 'tiktok' && step === 'post') return { kind: 'tiktok', item: 'main' };
  if (platform === 'instagram' && step === 'short') return { kind: 'instagram', placement: 'reel', item };
  if (platform === 'instagram' && step === 'reel') return { kind: 'instagram', placement: 'reel', item };
  if (platform === 'instagram' && step === 'post') return { kind: 'instagram', placement: 'feed', item: 'main' };
  // The announcement story needs no link; the release-day story does, and the API cannot add a link sticker.
  if (platform === 'instagram' && step === 'announce') return { kind: 'instagram', placement: 'story', item: 'announcement' };
  if (platform === 'x' && step === 'announce') return { kind: 'x', item: 'announcement' };
  if (platform === 'x' && step === 'post') return { kind: 'x', item: 'main' };
  if (platform === 'x' && step === 'short') return { kind: 'x', item };
  if (platform === 'linkedin' && step === 'post') return { kind: 'linkedin' };
  if (platform === 'microsite' && step === 'page' && settings.microsite) return { kind: 'microsite' };
  return undefined;
}

/** The platform whose credentials and switch an action needs. */
export function actionPlatform(action: AutopilotAction): AutopilotPlatform {
  return action.kind === 'links' ? 'youtube' : action.kind;
}

/**
 * Actions that link to the live main video: LinkedIn and the X release post,
 * unless the plan says the event's post carries no link (an X post without a
 * reply, ST-046). Without a plan, or without the event's post in it, they wait.
 */
function needsYouTube(action: AutopilotAction, event: CalendarEvent, plan: AutopilotContext['plan']): boolean {
  if (!(action.kind === 'linkedin' || (action.kind === 'x' && action.item === 'main'))) return false;
  const post = plan?.posts.find((entry) => entry.id === event.id);
  return post ? post.needsYoutube === true : true;
}

/** The YouTube video ID of the main video, from the log or the URL on the board. */
export function mainVideoId(status: ReleaseStatus, log: AutopilotLog): string | undefined {
  const fromLog = [...log.entries].reverse().find((entry) => entry.event === 'youtube' && entry.remote_id && !entry.mock)?.remote_id;
  if (fromLog) return fromLog;
  const url = status.items.youtube?.url;
  const match = url ? /(?:youtu\.be\/|[?&]v=|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/.exec(url) : undefined;
  return match?.[1];
}

/** The entries of an event since the user's last retry. */
function currentEntries(log: AutopilotLog, id: string): AutopilotEntry[] {
  const entries = log.entries.filter((entry) => entry.event === id);
  const lastRetry = entries.map((entry) => entry.status).lastIndexOf('retry');
  return lastRetry >= 0 ? entries.slice(lastRetry + 1) : entries;
}

/** The approval covers the calendar's release day. */
export function approvalHolds(status: Pick<ReleaseStatus, 'approval'>, calendar: Pick<ReleaseCalendar, 'release_date'>): boolean {
  return Boolean(status.approval && status.approval.release_date === calendar.release_date);
}

/** Plan every event of a calendar. */
export function planAutopilot(context: AutopilotContext): AutopilotEventPlan[] {
  return context.calendar.events.map((event) => planEvent(event, context));
}

function planEvent(event: CalendarEvent, context: AutopilotContext): AutopilotEventPlan {
  const { status, log, settings, now } = context;
  const item = status.items[event.id];
  const entries = currentEntries(log, event.id);
  const last = entries.at(-1) ?? log.entries.filter((entry) => entry.event === event.id).at(-1);
  const attempts = entries.filter((entry) => entry.status === 'failed').length;
  const base = { id: event.id, event, attempts, last, needsUser: false };
  const action = autopilotAction(event, settings);
  const platform = action ? actionPlatform(action) : undefined;
  if (item?.done) return { ...base, ...(action ? { action, platform } : {}), state: 'done' };
  if (!action || !platform) return { ...base, state: 'manual' };
  const plan = { ...base, action, platform };
  if (item?.manual || !settings.platforms.includes(platform)) return { ...plan, state: 'manual' };

  const at = Date.parse(event.at);
  const due = action.kind === 'youtube' ? at - settings.youtube_ahead_hours * HOUR : at;
  const dueAt = new Date(due).toISOString();
  const withDue = { ...plan, dueAt };
  const approved = approvalHolds(status, context.calendar);

  // What was sent, or may have been, shows also without an approval: withdrawing stops only what has not gone out.
  const latest = entries.at(-1);
  if (latest?.status === 'running') {
    const stuck = now.getTime() - Date.parse(latest.at) > (context.stuckMinutes ?? 60) * 60_000;
    return { ...withDue, state: stuck ? 'stuck' : 'running', needsUser: stuck };
  }
  if (latest && ['uploaded', 'scheduled', 'draft'].includes(latest.status)) {
    // A private YouTube upload waits for Studio unless the audited project scheduled it; a Premiere always waits for Studio; a draft waits for the app.
    // A scheduled upload still goes public without the approval, unless the user changes it in Studio.
    const main = action.kind === 'youtube' && action.item === 'main';
    const waitsForUser = latest.status === 'draft' || latest.status === 'uploaded' || (main && Boolean(context.premiere)) || (!approved && latest.status === 'scheduled');
    return { ...withDue, state: 'pending', needsUser: waitsForUser };
  }
  if (latest?.status === 'posted') return { ...withDue, state: 'done' };
  if (latest?.status === 'failed' && latest.uncertain) return { ...withDue, state: 'stuck', needsUser: true };

  // An approval holds for the day the user approved: a moved release asks again.
  if (!approved) return { ...withDue, state: 'unapproved' };
  // Missing credentials show from the approval on; they need the user once the post is due.
  if (context.ready && context.ready[platform] === false) return { ...withDue, state: 'blocked', block: 'credentials', needsUser: now.getTime() >= due };
  if (latest?.status === 'failed' && latest.fatal) return { ...withDue, state: 'failed', needsUser: true };
  if (attempts >= settings.retries) return { ...withDue, state: 'failed', needsUser: true };

  if (now.getTime() < due) return { ...withDue, state: 'waiting' };
  // "Post now", or "Try again" before the next attempt: the user asked for it, however late.
  const forced = latest?.status === 'force' || (latest === undefined && log.entries.some((entry) => entry.event === event.id && entry.status === 'retry'));
  // A task (the links step) has no deadline; a post that comes too late waits for the user.
  // Lateness counts from the calendar time, also for a YouTube upload that was due a day earlier.
  const late = action.kind !== 'links' && !forced && attempts === 0 && now.getTime() - at > settings.late_hours * HOUR;
  if (late) return { ...withDue, state: 'missed', needsUser: true };

  if (needsYouTube(action, event, context.plan) && !(status.items.youtube?.done && status.items.youtube.url)) {
    return { ...withDue, state: 'blocked', block: 'youtube' };
  }
  if (action.kind === 'links') {
    if (!status.items.song?.url) return { ...withDue, state: 'blocked', block: 'spotify', needsUser: true };
    if (!mainVideoId(status, log)) return { ...withDue, state: 'blocked', block: 'youtube' };
  }
  if (latest?.status === 'failed') {
    // Back off: 10 minutes after the first failure, 20 after the second, ...
    const retryAt = Date.parse(latest.at) + attempts * 10 * 60_000;
    if (now.getTime() < retryAt) return { ...withDue, state: 'waiting', retryAt: new Date(retryAt).toISOString() };
  }
  return { ...withDue, state: 'due' };
}

/** What the plan needs from the user right now, for the board and the runner's summary. */
export function autopilotAttention(plans: AutopilotEventPlan[]): AutopilotEventPlan[] {
  return plans.filter((plan) => plan.needsUser);
}
