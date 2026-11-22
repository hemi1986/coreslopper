import { spawn } from 'node:child_process';
import { ConfigError } from '@coreslopper/core';
import { checkComfyUI, comfyUIBaseUrl, comfyUIVram } from '@coreslopper/providers';

export interface ComfyStatus {
  ok: boolean;
  url: string;
  message: string;
  running?: number;
  pending?: number;
  vram?: { usedGb: number; totalGb: number };
  /** The last finished prompts, newest first. */
  recent?: { id: string; status: string }[];
}

type FetchLike = typeof fetch;

/** Server, queue length, VRAM, and the outcome of the last prompts of the ComfyUI server. */
export async function comfyStatus(fetchImpl: FetchLike = fetch, baseUrl = comfyUIBaseUrl()): Promise<ComfyStatus> {
  const server = await checkComfyUI(baseUrl, fetchImpl);
  if (!server.ok) return server;
  const get = async <T>(path: string): Promise<T | undefined> => {
    try {
      const response = await fetchImpl(`${server.url}${path}`, { signal: AbortSignal.timeout(5_000) });
      return response.ok ? ((await response.json()) as T) : undefined;
    } catch {
      return undefined;
    }
  };
  const queue = await get<{ queue_running?: unknown[]; queue_pending?: unknown[] }>('/queue');
  const history = await get<Record<string, { status?: { status_str?: string } }>>('/history?max_items=5');
  const vram = await comfyUIVram(baseUrl, fetchImpl);
  return {
    ...server,
    ...(queue ? { running: queue.queue_running?.length ?? 0, pending: queue.queue_pending?.length ?? 0 } : {}),
    ...(vram ? { vram: { usedGb: vram.usedGb, totalGb: vram.totalGb } } : {}),
    ...(history
      ? { recent: Object.entries(history).map(([id, entry]) => ({ id: id.slice(0, 8), status: entry.status?.status_str ?? 'unknown' })).reverse() }
      : {}),
  };
}

export function formatComfyStatus(status: ComfyStatus): string {
  if (!status.ok) return `✖ ComfyUI at ${status.url} does not answer: ${status.message}`;
  const lines = [`✔ ${status.message} at ${status.url}`];
  if (status.running !== undefined) lines.push(`Queue: ${status.running} running, ${status.pending} pending`);
  if (status.vram) lines.push(`VRAM: ${status.vram.usedGb} of ${status.vram.totalGb} GB in use`);
  if (status.recent?.length) lines.push(`Last prompts: ${status.recent.map((entry) => `${entry.id} ${entry.status}`).join(', ')}`);
  return lines.join('\n');
}

/** The workspace's restart command for ComfyUI (`COMFYUI_RESTART_COMMAND` in `.env`), if any. */
export function comfyRestartCommand(): string | undefined {
  return process.env.COMFYUI_RESTART_COMMAND?.trim() || undefined;
}

/**
 * Restart ComfyUI with the workspace's own command. How the server is started
 * differs per machine (a desktop app, a service, WSL), so the command comes from
 * `COMFYUI_RESTART_COMMAND`; it must return once the server answers again.
 */
export async function comfyRestart(log: (line: string) => void = console.log): Promise<void> {
  const command = comfyRestartCommand();
  if (!command) {
    throw new ConfigError(
      'COMFYUI_RESTART_COMMAND is not set. Put the command that restarts your ComfyUI server into .env, ' +
        'e.g. COMFYUI_RESTART_COMMAND=.local/comfyui-restart.sh (see comfyui/README.md).',
    );
  }
  log(`Restarting ComfyUI: ${command}`);
  await new Promise<void>((resolvePromise, reject) => {
    const child = spawn(command, { shell: true, stdio: 'inherit' });
    child.on('error', reject);
    child.on('close', (code) =>
      code === 0 ? resolvePromise() : reject(new ConfigError(`COMFYUI_RESTART_COMMAND exited with code ${code}.`)),
    );
  });
}

/** Why one check found ComfyUI stuck. */
export type StuckRule = 'no-answer' | 'pending-not-started';

export interface StuckCheck {
  /** Milliseconds since the first check. */
  at: number;
  stuck: boolean;
  rule?: StuckRule;
  running?: number;
  pending?: number;
  /** The prompt first in the pending queue. */
  firstPending?: string;
  detail: string;
}

export interface StuckVerdict {
  stuck: boolean;
  /** The rules that held across the window, when stuck. */
  rules: StuckRule[];
  checks: StuckCheck[];
  message: string;
}

export interface StuckCheckOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  /** Waits between two checks; a test passes a fake clock. */
  sleep?: (ms: number) => Promise<void>;
  /** How long ComfyUI must look stuck before a restart. */
  windowMs?: number;
  everyMs?: number;
  /** A `/queue` answer slower than this counts as no answer. */
  timeoutMs?: number;
  log?: (line: string) => void;
}

export const STUCK_WINDOW_MS = 180_000;
export const STUCK_EVERY_MS = 30_000;
export const STUCK_TIMEOUT_MS = 10_000;

const RULE_TEXT: Record<StuckRule, string> = {
  'no-answer': '/queue did not answer within the timeout',
  'pending-not-started': 'the same prompt stayed first in the queue with none running',
};

type QueueEntry = [number, string, ...unknown[]];

/** The prompt ComfyUI runs next: the pending entry with the lowest number. */
function firstPendingPrompt(pending: unknown[]): string | undefined {
  const entries = pending.filter((entry): entry is QueueEntry => Array.isArray(entry) && typeof entry[0] === 'number');
  entries.sort((a, b) => a[0] - b[0]);
  const first = entries[0];
  return first ? String(first[1]) : undefined;
}

async function checkQueue(fetchImpl: FetchLike, url: string, timeoutMs: number, at: number): Promise<StuckCheck> {
  try {
    const response = await fetchImpl(`${url}/queue`, { signal: AbortSignal.timeout(timeoutMs) });
    if (!response.ok) return { at, stuck: true, rule: 'no-answer', detail: `/queue answered HTTP ${response.status}` };
    const queue = (await response.json()) as { queue_running?: unknown[]; queue_pending?: unknown[] };
    const running = queue.queue_running?.length ?? 0;
    const pending = queue.queue_pending?.length ?? 0;
    const firstPending = firstPendingPrompt(queue.queue_pending ?? []);
    const counts = { running, pending, ...(firstPending ? { firstPending } : {}) };
    if (running > 0) return { at, stuck: false, ...counts, detail: `${running} running, ${pending} pending` };
    if (pending === 0) return { at, stuck: false, ...counts, detail: 'queue empty' };
    return { at, stuck: true, rule: 'pending-not-started', ...counts, detail: `${pending} pending, none running, first ${firstPending?.slice(0, 8) ?? '?'}` };
  } catch (error) {
    return { at, stuck: true, rule: 'no-answer', detail: `/queue did not answer: ${error instanceof Error ? error.message : String(error)}` };
  }
}

/**
 * Observe the ComfyUI server before restarting it: a check every `everyMs` for
 * `windowMs`. It is stuck only when every check says so – no answer from
 * `/queue` within `timeoutMs`, or a pending prompt that never starts (the same
 * one first in the queue, none running). One healthy check ends the window.
 * A running prompt is never stuck here; a hung generation is the queue run's timeout.
 */
export async function comfyStuckCheck(options: StuckCheckOptions = {}): Promise<StuckVerdict> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const url = comfyUIBaseUrl(options.baseUrl);
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolvePromise) => setTimeout(resolvePromise, ms)));
  const windowMs = options.windowMs ?? STUCK_WINDOW_MS;
  const everyMs = options.everyMs ?? STUCK_EVERY_MS;
  const timeoutMs = options.timeoutMs ?? STUCK_TIMEOUT_MS;
  const log = options.log ?? (() => {});
  const checks: StuckCheck[] = [];
  let waitingFor: string | undefined;
  for (let at = 0; at <= windowMs; at += everyMs) {
    if (at > 0) await sleep(everyMs);
    const check = await checkQueue(fetchImpl, url, timeoutMs, at);
    // A pending prompt that changed since the last answer means the queue moved.
    if (check.rule === 'pending-not-started') {
      if (waitingFor !== undefined && check.firstPending !== waitingFor) {
        check.stuck = false;
        delete check.rule;
        check.detail += ' (the queue moved)';
      }
      waitingFor = check.firstPending;
    }
    checks.push(check);
    log(`check ${checks.length} at ${at / 1000} s: ${check.stuck ? 'stuck' : 'healthy'} – ${check.detail}`);
    if (!check.stuck) return { stuck: false, rules: [], checks, message: `not stuck: ${check.detail}` };
  }
  const rules = [...new Set(checks.map((check) => check.rule!))];
  return {
    stuck: true,
    rules,
    checks,
    message: `stuck for ${windowMs / 1000} s (${checks.length} checks): ${rules.map((rule) => RULE_TEXT[rule]).join('; ')}`,
  };
}

/** Restart ComfyUI only when `comfyStuckCheck` finds it stuck. */
export async function comfyRestartIfStuck(
  options: StuckCheckOptions & { restart?: (log: (line: string) => void) => Promise<void> } = {},
): Promise<StuckVerdict & { restarted: boolean }> {
  const log = options.log ?? console.log;
  const verdict = await comfyStuckCheck({ ...options, log });
  log(`ComfyUI ${verdict.message}`);
  if (!verdict.stuck) return { ...verdict, restarted: false };
  await (options.restart ?? comfyRestart)(log);
  return { ...verdict, restarted: true };
}
