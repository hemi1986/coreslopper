import { afterEach, describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { buildRelease } from '../packages/cli/src/release.ts';
import { approveRelease } from '../packages/cli/src/release-autopilot.ts';
import { boardProject } from '../packages/cli/src/release-board-data.ts';
import { productionProject } from '../packages/cli/src/board-production.ts';
import { loadCalendar } from '../packages/cli/src/release-calendar.ts';
import { checklistKey, loadStatus, updateStatus } from '../packages/cli/src/release-records.ts';
import { cleanupFixtures, fakeDeps, fixture, setReleaseDay } from './helpers/release-fixture.ts';

afterEach(cleanupFixtures);

describe('release records', () => {
  it('reads one approval the same way on the release board and the production view, and lets a moved day make it stale', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await setReleaseDay(dir, undefined);
    await buildRelease({ projectDir: dir, root, deps: fakeDeps({ now: () => new Date('2026-11-13T09:00:00Z') }) });
    const proposed = (await loadCalendar(dir))!;
    expect(proposed.proposed).toBe(true);

    await approveRelease(dir, { root, now: new Date('2026-11-13T10:00:00Z') });
    const approved = await loadStatus(dir);
    expect(approved.approval?.release_date).toBe(proposed.release_date);
    expect(await productionProject(dir)).toMatchObject({ approved: true });
    expect((await boardProject(dir, root)).autopilot).toMatchObject({ approvalStale: false });

    // The user moves the release day after the approval: both views must see the same stale approval (G-159).
    await setReleaseDay(dir, '2026-12-18');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps({ now: () => new Date('2026-11-13T09:00:00Z') }) });
    expect((await loadCalendar(dir))?.release_date).toBe('2026-12-18');

    expect(await productionProject(dir)).toMatchObject({ approved: false });
    const board = await boardProject(dir, root);
    expect(board.autopilot.approvalStale).toBe(true);
    expect(board.autopilot.approval?.release_date).toBe(proposed.release_date);
    expect((await loadStatus(dir)).approval?.release_date).toBe(proposed.release_date);
  });

  it('keys checklist ticks by the line, so another line appearing leaves them in place', async () => {
    const dir = await fixture();
    const root = join(dir, '..', '..');
    await buildRelease({ projectDir: dir, root, deps: fakeDeps() });
    const x = (await boardProject(dir, root)).platforms.find((platform) => platform.id === 'x')!.posts.find((post) => post.id === 'x')!;
    expect(x.checklist).toHaveLength(2);
    const [, reply] = x.checklist;

    expect(reply!.key).toBe(checklistKey('x', reply!.label));
    expect(reply!.key).not.toMatch(/#\d+$/);
    expect(checklistKey('x', 'A line that appeared')).not.toBe(reply!.key);

    const now = new Date('2026-11-16T12:00:00Z');
    await updateStatus(dir, reply!.key, { done: true, by: 'user' }, now);
    expect((await loadStatus(dir)).items[reply!.key]).toMatchObject({ done: true, at: now.toISOString(), by: 'user' });

    const reloaded = (await boardProject(dir, root)).platforms.find((platform) => platform.id === 'x')!.posts.find((post) => post.id === 'x')!;
    const reloadedReply = reloaded.checklist.find((item) => item.label === reply!.label)!;
    expect(reloadedReply.key).toBe(reply!.key);
    expect((await loadStatus(dir)).items[reloadedReply.key]?.done).toBe(true);
  });
});
