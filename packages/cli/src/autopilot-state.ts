import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  AutopilotLogSchema,
  readJsonFile,
  writeJsonAtomic,
  type AutopilotEntry,
  type AutopilotLog,
  type AutopilotPlatform,
  type AutopilotSettings,
} from '@coreslopper/core';
import {
  instagramTokenDaysLeft,
  linkedinTokenDaysLeft,
  resolveInstagramCredentials,
  resolveLinkedInCredentials,
  resolveTikTokCredentials,
  resolveXCredentials,
  resolveYouTubeCredentials,
} from '@coreslopper/providers';

// The release autopilot's state on disk, shared by the runner and the board:
// the log of each project, the credentials it can use, and when it last ran.

/** When `release-run` last finished a round: the board warns when the timer seems to be off. */
export const lastRunPath = (root: string) => join(root, '.cache', 'release-run.last');

export async function lastRun(root: string): Promise<string | undefined> {
  const path = lastRunPath(root);
  return existsSync(path) ? (await readFile(path, 'utf8')).trim() || undefined : undefined;
}

export const autopilotLogPath = (projectRoot: string) => join(projectRoot, 'review', 'autopilot.json');

export async function loadAutopilotLog(projectRoot: string): Promise<AutopilotLog> {
  const path = autopilotLogPath(projectRoot);
  return existsSync(path) ? readJsonFile(path, AutopilotLogSchema) : { version: 1, entries: [] };
}

/** Append one entry to the log (read fresh, then write atomically). */
export async function appendAutopilotEntry(projectRoot: string, entry: Omit<AutopilotEntry, 'warnings' | 'manual_steps' | 'mock'> & Partial<AutopilotEntry>): Promise<AutopilotLog> {
  const log = await loadAutopilotLog(projectRoot);
  log.entries.push({ warnings: [], manual_steps: [], mock: false, ...entry });
  const parsed = AutopilotLogSchema.parse(log);
  await writeJsonAtomic(autopilotLogPath(projectRoot), parsed);
  return parsed;
}

/** Which platforms have their credentials, and notes on tokens that expire soon. */
export function autopilotReadiness(settings: AutopilotSettings, env: NodeJS.ProcessEnv = process.env, now = new Date()): { ready: Record<AutopilotPlatform, boolean>; notes: string[] } {
  const youtube = resolveYouTubeCredentials(env);
  const tiktok = resolveTikTokCredentials(env);
  const x = resolveXCredentials(env);
  const linkedin = resolveLinkedInCredentials(env);
  const instagram = resolveInstagramCredentials(env);
  const notes: string[] = [];
  const linkedinDays = linkedinTokenDaysLeft(linkedin, now);
  const instagramDays = instagramTokenDaysLeft(instagram, now);
  if (linkedin.accessToken && linkedinDays !== undefined && linkedinDays < 10) {
    notes.push(linkedinDays < 0 ? 'LinkedIn: the token expired; run publish-auth linkedin' : `LinkedIn: the token expires in ${Math.floor(linkedinDays)} days; run publish-auth linkedin`);
  }
  if (instagram.accessToken && instagramDays !== undefined && instagramDays < 0) notes.push('Instagram: the token expired; generate a new one and run publish-auth instagram');
  if (instagram.accessToken && !env.FAL_KEY) notes.push('Instagram: FAL_KEY is needed to give Instagram a public URL of each file');
  const ready: Record<AutopilotPlatform, boolean> = {
    youtube: Boolean(youtube.clientId && youtube.clientSecret && youtube.refreshToken),
    tiktok: Boolean(tiktok.clientKey && tiktok.clientSecret && tiktok.refreshToken),
    x: Boolean(x.clientId && x.refreshToken),
    linkedin: Boolean(linkedin.accessToken && (linkedinDays === undefined || linkedinDays >= 0)),
    instagram: Boolean(instagram.accessToken && env.FAL_KEY && (instagramDays === undefined || instagramDays >= 0)),
    microsite: Boolean(settings.microsite),
  };
  return { ready, notes };
}

