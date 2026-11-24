import { afterEach, describe, expect, it, vi } from 'vitest';

// The release reads config/channel.yaml of the repo it runs in; a workspace's
// own channel must not change these results.
vi.mock('@coreslopper/core', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@coreslopper/core')>()),
  loadChannel: async () => undefined,
}));
import { existsSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { buildRelease, runRelease } from '../packages/cli/src/release.ts';
import { calendarInput, planCalendar, runCalendar } from '../packages/cli/src/release-calendar.ts';
import { cleanupFixtures, fakeDeps, fixture, setDistribution, siblingCalendar } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

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
    // The other project is a real public project beside it, with a planned calendar.
    const other = await siblingCalendar(dir, 'other', { release_date: '2026-12-04' });

    await runRelease({ projectDir: dir, deps: fakeDeps() });

    expect(existsSync(join(dir, 'review', 'calendar.yaml'))).toBe(false);
    expect(await readFile(other.path, 'utf8')).toBe(other.text);
  });

  it('ST-036: A project without distribution is released publicly', async () => {
    const dir = await fixture();
    await setDistribution(dir, undefined);

    await runRelease({ projectDir: dir, deps: fakeDeps() });

    expect(existsSync(join(dir, 'renders', 'release', 'manifest.json'))).toBe(true);
  });

  it('refuses to build a release package or plan a calendar for an internal project when called directly', async () => {
    const dir = await fixture();
    await setDistribution(dir, 'internal');

    await expect(buildRelease({ projectDir: dir, deps: fakeDeps() })).rejects.toThrow('not released publicly');
    await expect(runCalendar({ projectDir: dir, root: join(dir, '..', '..'), log: () => undefined })).rejects.toThrow('not released publicly');
    expect(existsSync(join(dir, 'renders', 'release'))).toBe(false);
    expect(existsSync(join(dir, 'review', 'calendar.yaml'))).toBe(false);
  });
});

/** Plan a public project's calendar without a release day of its own: 2026-12-04 is its first free Friday. */
function planNeon(dir: string, input: Partial<Parameters<typeof calendarInput>[0]> = {}) {
  return planCalendar(
    dir,
    calendarInput({ slug: 'neon', title: 'Neon Rain', kind: 'music-video', shorts: [], ...input }),
    { root: join(dir, '..', '..'), now: new Date('2026-11-13T09:00:00Z') },
  );
}

describe('planning around an internal project', () => {
  it("ST-040: An internal project's release day is free for another release", async () => {
    const dir = await fixture();
    await siblingCalendar(dir, 'teaser', { release_date: '2026-12-04', distribution: 'internal' });

    const calendar = await planNeon(dir);

    expect(calendar.release_date).toBe('2026-12-04');
  });

  it("ST-040: An internal project's Short slots are free for another release", async () => {
    const dir = await fixture();
    await siblingCalendar(dir, 'teaser', { release_date: '2026-12-04', distribution: 'internal', shortDay: '2026-12-11' });

    const calendar = await planNeon(dir, { releaseDate: '2026-12-11', shorts: ['Z1-intro'] });

    expect(calendar.events.some((event) => event.step === 'short' && event.at.slice(0, 10) === '2026-12-11')).toBe(true);
  });

  it("ST-040: A public project's calendar still books its slots", async () => {
    const dir = await fixture();
    await siblingCalendar(dir, 'other', { release_date: '2026-12-04' });

    const calendar = await planNeon(dir);

    expect(calendar.release_date).toBe('2026-12-11');
  });

  it('counts a sibling whose project.yaml cannot be read as public', async () => {
    const dir = await fixture();
    await siblingCalendar(dir, 'other', { release_date: '2026-12-04' });
    await writeFile(join(dirname(dir), 'other', 'project.yaml'), 'kind: [unclosed');

    const calendar = await planNeon(dir);

    expect(calendar.release_date).toBe('2026-12-11');
  });
});
