import { describe, expect, it } from 'vitest';
import { pollUntil } from '../packages/providers/src/publish/http.ts';

function clock(start = 0) {
  let now = start;
  const sleeps: number[] = [];
  return {
    now: () => now,
    sleep: async (ms: number) => {
      sleeps.push(ms);
      now += ms;
    },
    sleeps,
  };
}

describe('pollUntil', () => {
  it('checks until done and uses the interval of the last value', async () => {
    const time = clock();
    let calls = 0;
    const result = await pollUntil(
      async () => ({ state: ++calls < 3 ? 'pending' : 'done', wait: calls }),
      {
        intervalMs: (value) => value.wait * 10,
        now: time.now,
        sleep: time.sleep,
        done: (value) => value.state === 'done',
        onTimeout: () => {
          throw new Error('timeout');
        },
      },
    );
    expect(result.state).toBe('done');
    expect(calls).toBe(3);
    expect(time.sleeps).toEqual([10, 20]);
  });

  it('starts from an initial value and waits before its first check', async () => {
    const time = clock();
    let calls = 0;
    const result = await pollUntil(
      async () => {
        calls += 1;
        return 'done';
      },
      {
        initial: 'pending',
        intervalMs: 5,
        now: time.now,
        sleep: time.sleep,
        done: (value) => value === 'done',
        onTimeout: () => {
          throw new Error('timeout');
        },
      },
    );
    expect(result).toBe('done');
    expect(calls).toBe(1);
    expect(time.sleeps).toEqual([5]);
  });

  it('throws a terminal platform failure before done is read', async () => {
    await expect(
      pollUntil(async () => 'failed', {
        intervalMs: 1,
        now: () => 0,
        sleep: async () => undefined,
        failed: (value) => (value === 'failed' ? new Error('the platform failed') : undefined),
        done: (value) => value === 'failed',
        onTimeout: () => {
          throw new Error('timeout');
        },
      }),
    ).rejects.toThrow('the platform failed');
  });

  it('returns the last value when the time runs out', async () => {
    const time = clock();
    const result = await pollUntil(async () => 'pending', {
      intervalMs: 10,
      timeoutMs: 25,
      now: time.now,
      sleep: time.sleep,
      done: () => false,
      onTimeout: (last) => last,
    });
    expect(result).toBe('pending');
    expect(time.sleeps).toEqual([10, 10, 10]);
  });

  it('stops after the attempt budget', async () => {
    const time = clock();
    let calls = 0;
    const result = await pollUntil(
      async () => {
        calls += 1;
        return 'pending';
      },
      {
        intervalMs: 1,
        attempts: 2,
        now: time.now,
        sleep: time.sleep,
        done: () => false,
        onTimeout: (last) => last,
      },
    );
    expect(result).toBe('pending');
    expect(calls).toBe(2);
  });

  it('lets an adapter throw its own timeout error', async () => {
    const time = clock();
    await expect(
      pollUntil(async () => 'pending', {
        intervalMs: 1,
        attempts: 1,
        now: time.now,
        sleep: time.sleep,
        done: () => false,
        onTimeout: () => {
          throw new Error('still processing');
        },
      }),
    ).rejects.toThrow('still processing');
  });
});
