import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parse, stringify } from 'yaml';
import { runRelease } from '../packages/cli/src/release.ts';
import { cleanupFixtures, fakeDeps, fixture } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

async function setDistribution(projectDir: string, distribution: string | undefined): Promise<void> {
  const path = join(projectDir, 'project.yaml');
  const config = parse(await readFile(path, 'utf8')) as Record<string, unknown>;
  if (distribution === undefined) delete config.distribution;
  else config.distribution = distribution;
  await writeFile(path, stringify(config));
}

describe('release of an internal project', () => {
  it('ST-036: An internal project builds no release folder', async () => {
    const dir = await fixture();
    await setDistribution(dir, 'internal');
    const lines: string[] = [];

    await runRelease({ projectDir: dir, deps: fakeDeps({ log: (line) => lines.push(line) }) });

    expect(existsSync(join(dir, 'renders', 'release'))).toBe(false);
    expect(lines.join('\n')).toContain('not released publicly');
  });

  it('ST-036: An internal project plans no release calendar', async () => {
    const dir = await fixture();
    await setDistribution(dir, 'internal');
    const other = join(dirname(dir), 'other', 'review', 'calendar.yaml');
    await mkdir(dirname(other), { recursive: true });
    const calendar = stringify({ version: 1, project: 'other', release_date: '2026-12-04', proposed: false, timezone: 'Europe/Berlin', events: [] });
    await writeFile(other, calendar);

    await runRelease({ projectDir: dir, deps: fakeDeps() });

    expect(existsSync(join(dir, 'review', 'calendar.yaml'))).toBe(false);
    expect(await readFile(other, 'utf8')).toBe(calendar);
  });

  it('ST-036: A project without distribution is released publicly', async () => {
    const dir = await fixture();
    await setDistribution(dir, undefined);

    await runRelease({ projectDir: dir, deps: fakeDeps() });

    expect(existsSync(join(dir, 'renders', 'release', 'manifest.json'))).toBe(true);
  });
});
