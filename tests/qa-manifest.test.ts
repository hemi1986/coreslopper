import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { checkManifest } from '../packages/cli/src/qa.ts';

async function manifest(entries: object[], spentUsd: number, extra = '') {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-manifest-'));
  const path = join(dir, 'manifest.jsonl');
  await writeFile(path, entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n' + extra);
  return checkManifest({ paths: { manifest: path }, state: { budget: { spentUsd } } } as Parameters<typeof checkManifest>[0]);
}

describe('manifest check', () => {
  it('passes a reconciled manifest', async () => {
    const check = await manifest([{ hash: 'a', status: 'ok', costUsd: 1.5 }], 1.5);
    expect(check.result).toBe('PASS');
  });

  it('warns about failed calls instead of failing, and counts the retried ones', async () => {
    const check = await manifest(
      [
        { hash: 'a', status: 'failed', costUsd: 0 },
        { hash: 'a', status: 'ok', costUsd: 0.4 },
        { hash: 'b', status: 'failed', costUsd: 0 },
      ],
      0.4,
    );
    expect(check.result).toBe('WARN');
    expect(check.evidence).toContain('2 failed call(s) (1 retried successfully');
  });

  it('fails on a malformed line or a spend mismatch', async () => {
    expect((await manifest([{ hash: 'a', status: 'ok', costUsd: 1 }], 1, 'not json\n')).result).toBe('FAIL');
    expect((await manifest([{ hash: 'a', status: 'failed', costUsd: 0 }], 2)).result).toBe('FAIL');
  });
});
