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
