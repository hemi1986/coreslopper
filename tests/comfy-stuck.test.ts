import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { comfyRestartIfStuck, comfyStuckCheck } from '../packages/cli/src/comfy.ts';
import { loadEvents, watchRound } from '../packages/cli/src/production-watch.ts';

type Answer = { running?: unknown[]; pending?: unknown[] } | 'timeout' | 'refused';

/** A fetch that answers `/queue` from a script, one answer per call; the last one repeats. */
function fakeFetch(answers: Answer[]) {
  const calls: string[] = [];
  const impl = (async (input: string | URL | Request) => {
    calls.push(String(input));
    const answer = answers[Math.min(calls.length - 1, answers.length - 1)]!;
    if (answer === 'timeout') throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
    if (answer === 'refused') throw new TypeError('fetch failed');
    return new Response(JSON.stringify({ queue_running: answer.running ?? [], queue_pending: answer.pending ?? [] }));
  }) as typeof fetch;
  return { impl, calls };
}

/** A clock that only records the waits. */
function fakeClock() {
  const waits: number[] = [];
  return { waits, sleep: async (ms: number) => void waits.push(ms) };
}

const prompt = (number: number, id: string) => [number, id, {}, {}, []];
const base = { baseUrl: 'http://comfy.test:8188' };

describe('comfy restart --if-stuck', () => {
  it('restarts when /queue does not answer for the whole window', async () => {
    const fetch = fakeFetch(['refused']);
    const clock = fakeClock();
    const restart = vi.fn(async () => {});
    const lines: string[] = [];
    const result = await comfyRestartIfStuck({ ...base, fetchImpl: fetch.impl, sleep: clock.sleep, restart, log: (line) => lines.push(line) });
    expect(result).toMatchObject({ stuck: true, restarted: true, rules: ['no-answer'] });
    expect(result.checks).toHaveLength(7);
    expect(clock.waits).toEqual([30_000, 30_000, 30_000, 30_000, 30_000, 30_000]);
    expect(fetch.calls.every((url) => url === 'http://comfy.test:8188/queue')).toBe(true);
    expect(restart).toHaveBeenCalledOnce();
    expect(lines.join('\n')).toContain('/queue did not answer within the timeout');
  });

  it('restarts when the same pending prompt never starts', async () => {
    const fetch = fakeFetch([{ pending: [prompt(8, 'bbbbbbbb-later'), prompt(7, 'aaaaaaaa-first')] }]);
    const restart = vi.fn(async () => {});
    const result = await comfyRestartIfStuck({ ...base, fetchImpl: fetch.impl, sleep: fakeClock().sleep, restart, log: () => {} });
    expect(result).toMatchObject({ stuck: true, restarted: true, rules: ['pending-not-started'] });
    expect(result.checks.map((check) => check.firstPending)).toEqual(Array(7).fill('aaaaaaaa-first'));
    expect(result.message).toContain('the same prompt stayed first in the queue with none running');
    expect(restart).toHaveBeenCalledOnce();
  });

  it('does not restart when a slow answer is followed by a healthy one', async () => {
    const fetch = fakeFetch(['timeout', { running: [prompt(7, 'aaaaaaaa')], pending: [] }]);
    const restart = vi.fn(async () => {});
    const lines: string[] = [];
    const result = await comfyRestartIfStuck({ ...base, fetchImpl: fetch.impl, sleep: fakeClock().sleep, restart, log: (line) => lines.push(line) });
    expect(result).toMatchObject({ stuck: false, restarted: false });
    expect(result.checks.map((check) => check.stuck)).toEqual([true, false]);
    expect(lines.at(-1)).toMatch(/^ComfyUI not stuck/);
    expect(restart).not.toHaveBeenCalled();
  });

  it('never calls a running prompt stuck', async () => {
    const fetch = fakeFetch([{ running: [prompt(7, 'aaaaaaaa')], pending: [prompt(8, 'bbbbbbbb')] }]);
    const clock = fakeClock();
    const verdict = await comfyStuckCheck({ ...base, fetchImpl: fetch.impl, sleep: clock.sleep });
    expect(verdict.stuck).toBe(false);
    expect(fetch.calls).toHaveLength(1);
    expect(clock.waits).toEqual([]);
  });

  it('counts a queue that moved on as healthy', async () => {
    const fetch = fakeFetch([{ pending: [prompt(7, 'aaaaaaaa')] }, 'timeout', { pending: [prompt(8, 'bbbbbbbb')] }]);
    const verdict = await comfyStuckCheck({ ...base, fetchImpl: fetch.impl, sleep: fakeClock().sleep });
    expect(verdict.stuck).toBe(false);
    expect(verdict.checks).toHaveLength(3);
    expect(verdict.message).toContain('the queue moved');
  });
});

describe('the watch round and ComfyUI', () => {
  const saved = process.env.COMFYUI_RESTART_COMMAND;
  const temporary: string[] = [];
  afterEach(async () => {
    if (saved === undefined) delete process.env.COMFYUI_RESTART_COMMAND;
    else process.env.COMFYUI_RESTART_COMMAND = saved;
    await Promise.all(temporary.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
  });
  const workspace = async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-comfy-watch-'));
    temporary.push(dir);
    return dir;
  };

  it('skips the check without COMFYUI_RESTART_COMMAND', async () => {
    delete process.env.COMFYUI_RESTART_COMMAND;
    const comfyCheck = vi.fn(async () => ({ restarted: true, message: 'stuck' }));
    const round = await watchRound({ root: await workspace(), autopilot: false, log: () => {}, comfyCheck });
    expect(comfyCheck).not.toHaveBeenCalled();
    expect(round.events).toEqual([]);
  });

  it('records a restart as a production event', async () => {
    process.env.COMFYUI_RESTART_COMMAND = 'true';
    const root = await workspace();
    const comfyCheck = vi.fn(async () => ({ restarted: true, message: 'stuck for 180 s (7 checks): /queue did not answer within the timeout' }));
    const round = await watchRound({ root, autopilot: false, log: () => {}, comfyCheck });
    expect(round.errors).toEqual([]);
    expect(comfyCheck).toHaveBeenCalledOnce();
    expect(await loadEvents(root)).toEqual([expect.objectContaining({ project: '', kind: 'comfyui-restarted', detail: expect.stringContaining('stuck for 180 s') })]);
  });

  it('records nothing when ComfyUI is not stuck', async () => {
    process.env.COMFYUI_RESTART_COMMAND = 'true';
    const root = await workspace();
    await watchRound({ root, autopilot: false, log: () => {}, comfyCheck: async () => ({ restarted: false, message: 'not stuck: queue empty' }) });
    expect(await loadEvents(root)).toEqual([]);
  });
});
