import { existsSync } from 'node:fs';
import { join } from 'node:path';
import {
  AutopilotLogSchema,
  PublishLogSchema,
  ReleaseStatusSchema,
  readJsonFile,
  writeJsonAtomic,
  type AutopilotEntry,
  type AutopilotLog,
  type PublishEntry,
  type PublishLog,
  type ReleaseStatus,
} from '@coreslopper/core';
import { withFileLock } from './file-lock.js';
import { uploadPaths } from './upload-text.js';

// One owner for the release records of a project: the release status, the
// autopilot log, the publish log, and the lock around every write of them. The
// calendar stays the release-calendar's; it writes its done marks through here.

export const statusPath = (projectRoot: string) => join(projectRoot, 'review', 'release-status.json');
export const autopilotLogPath = (projectRoot: string) => join(projectRoot, 'review', 'autopilot.json');
export const publishLogPath = (projectRoot: string) => uploadPaths(projectRoot).log;
export const releaseLockPath = (projectRoot: string) => join(projectRoot, 'review', '.release.lock');
/** One lock per project around every write of the release status and the autopilot log: the board and `release-run` both write them. */
export const withReleaseLock = <T>(projectRoot: string, fn: () => Promise<T>) => withFileLock(releaseLockPath(projectRoot), fn);

/**
 * A checklist line's record key: the post and the line's name, never its
 * position, so a line appearing or going leaves the other ticks where they are
 * (G-163).
 */
export const checklistKey = (id: string, line: string): string => `${id}#${line}`;

export async function loadStatus(projectRoot: string): Promise<ReleaseStatus> {
  const path = statusPath(projectRoot);
  return existsSync(path) ? readJsonFile(path, ReleaseStatusSchema) : { version: 1, items: {} };
}

/** The one write path of the release status: read under the lock, mutate, parse, write atomically. */
async function writeStatus(projectRoot: string, change: (status: ReleaseStatus) => void): Promise<ReleaseStatus> {
  return withReleaseLock(projectRoot, async () => {
    const status = await loadStatus(projectRoot);
    change(status);
    const parsed = ReleaseStatusSchema.parse(status);
    await writeJsonAtomic(statusPath(projectRoot), parsed);
    return parsed;
  });
}

/** Mark one calendar event (or any board item) done or open, by the user or the autopilot, and record its live URL. */
export async function updateStatus(
  projectRoot: string,
  id: string,
  change: { done?: boolean; url?: string | null; by?: 'user' | 'autopilot' },
  now: Date,
): Promise<ReleaseStatus> {
  return writeStatus(projectRoot, (status) => {
    const item = { ...(status.items[id] ?? { done: false }) };
    if (change.done !== undefined) {
      item.done = change.done;
      if (change.done) item.at = now.toISOString();
      else delete item.at;
      if (change.done && change.by) item.by = change.by;
      else if (!change.done) delete item.by;
    }
    if (change.url === null || change.url === '') delete item.url;
    else if (change.url !== undefined) item.url = change.url;
    status.items[id] = item;
  });
}

/** The user's approval of one release day; a moved day no longer holds (`approvalHolds`). */
export async function setApproval(projectRoot: string, approval: { at: string; release_date: string }): Promise<ReleaseStatus> {
  return writeStatus(projectRoot, (status) => {
    status.approval = approval;
  });
}

/** Withdraw the approval: the autopilot stops; what is posted stays posted. */
export async function clearApproval(projectRoot: string): Promise<ReleaseStatus> {
  return writeStatus(projectRoot, (status) => {
    delete status.approval;
  });
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

export async function loadAutopilotLog(projectRoot: string): Promise<AutopilotLog> {
  const path = autopilotLogPath(projectRoot);
  return existsSync(path) ? readJsonFile(path, AutopilotLogSchema) : { version: 1, entries: [] };
}

/** Append one entry to the log (read fresh, then write atomically). */
export type NewAutopilotEntry = Omit<AutopilotEntry, 'warnings' | 'manual_steps' | 'mock'> & Partial<AutopilotEntry>;

export async function appendAutopilotEntry(projectRoot: string, entry: NewAutopilotEntry): Promise<AutopilotLog> {
  return withReleaseLock(projectRoot, () => appendAutopilotEntryUnlocked(projectRoot, entry));
}

/** Append inside a section that already holds the project's release lock. */
export async function appendAutopilotEntryUnlocked(projectRoot: string, entry: NewAutopilotEntry): Promise<AutopilotLog> {
  const log = await loadAutopilotLog(projectRoot);
  log.entries.push({ warnings: [], manual_steps: [], mock: false, ...entry });
  const parsed = AutopilotLogSchema.parse(log);
  await writeJsonAtomic(autopilotLogPath(projectRoot), parsed);
  return parsed;
}

export async function readPublishLog(projectRoot: string): Promise<PublishLog> {
  const path = publishLogPath(projectRoot);
  return existsSync(path) ? readJsonFile(path, PublishLogSchema) : { version: 1, entries: [] };
}

/** Append one publish entry (read fresh under the project's release lock, then write atomically). */
export async function appendPublishEntry(projectRoot: string, entry: PublishEntry): Promise<PublishLog> {
  return withReleaseLock(projectRoot, async () => {
    const log = await readPublishLog(projectRoot);
    log.entries.push(entry);
    const parsed = PublishLogSchema.parse(log);
    await writeJsonAtomic(publishLogPath(projectRoot), parsed);
    return parsed;
  });
}
