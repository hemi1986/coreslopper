import { basename, join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { writeTextAtomic, type RenderProgress } from '@coreslopper/core';

// The progress file of a running render, `review/progress/<output>.json`, so
// the board and the watchdog see a render that runs in another process. It
// stays in the project even when renders/ is linked to a media drive.

export const progressPath = (reviewDir: string, output: string) => join(reviewDir, 'progress', `${basename(output)}.json`);

export interface ProgressWriter {
  /** Frames finished so far; written at most every `intervalMs`. */
  update(framesDone: number): Promise<void>;
  /** The render finished: the file goes away. */
  done(): Promise<void>;
  /** The render failed: the file keeps the error until the next render of this output. */
  fail(error: string): Promise<void>;
}

export async function startProgress(reviewDir: string, output: string, framesTotal: number, options: { now?: () => Date; intervalMs?: number } = {}): Promise<ProgressWriter> {
  const now = options.now ?? (() => new Date());
  const interval = options.intervalMs ?? 2_000;
  const path = progressPath(reviewDir, output);
  await mkdir(join(reviewDir, 'progress'), { recursive: true });
  const state: RenderProgress = { output: basename(output), framesDone: 0, framesTotal, startedAt: now().toISOString(), updatedAt: now().toISOString() };
  let written = 0;
  const write = () => writeTextAtomic(path, `${JSON.stringify(state)}\n`);
  await write();
  return {
    async update(framesDone) {
      state.framesDone = Math.min(framesTotal, Math.max(state.framesDone, Math.round(framesDone)));
      const at = now();
      if (at.getTime() - written < interval) return;
      written = at.getTime();
      state.updatedAt = at.toISOString();
      await write().catch(() => undefined);
    },
    async done() {
      await rm(path, { force: true });
    },
    async fail(error) {
      state.error = error;
      state.updatedAt = now().toISOString();
      await write().catch(() => undefined);
    },
  };
}
