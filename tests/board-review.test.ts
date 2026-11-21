import { afterEach, describe, expect, it } from 'vitest';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { formatReviewTime, frameAt, nextRoundNumber, openRounds, projectNextAction, spansAt, stageViews, createInitialState } from '@coreslopper/core';
import { editNote, loadRounds, renderFps, reviewData, submitRound } from '../packages/cli/src/board-review.ts';
import { productionProject } from '../packages/cli/src/board-production.ts';
import { validateChangedFile } from '../packages/cli/src/validate-file.ts';
import { boardHandler } from '../packages/cli/src/release-board.ts';

const root = process.cwd();
const temporary: string[] = [];
afterEach(async () => {
  await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

/** A workspace with a copy of the demo project (timing, storyboard, style) and one placeholder render. */
async function demo(): Promise<{ ws: string; dir: string }> {
  const ws = await mkdtemp(join(tmpdir(), 'coreslopper-review-'));
  temporary.push(ws);
  for (const folder of ['config', 'templates', 'brand']) await cp(join(root, folder), join(ws, folder), { recursive: true });
  await writeFile(join(ws, 'package.json'), JSON.stringify({ name: 'coreslopper', version: '0.0.0' }));
  const dir = join(ws, 'projects', 'demo');
  await cp(join(root, 'projects', 'demo'), dir, {
    recursive: true,
    filter: (source) => !/[/\\](renders|assets|audio|review)([/\\]|$)/.test(source.slice(join(root, 'projects', 'demo').length)),
  });
  await mkdir(join(dir, 'renders'), { recursive: true });
  await writeFile(join(dir, 'renders', '16x9.mp4'), 'video');
  return { ws, dir };
}

describe('review helpers', () => {
  it('places times on frames and notes on the shots they touch', () => {
    expect(formatReviewTime(83.4567)).toBe('01:23.457');
    expect(frameAt(2.5, 30)).toBe(75);
    // 75 / 30 in floating point is 2.4999999999999996: still frame 75.
    expect(frameAt(75 / 30, 30)).toBe(75);
    expect(frameAt(2.49, 30)).toBe(74);
    const shots = [{ id: 'a', start: 0, end: 2 }, { id: 'b', start: 2, end: 4 }, { id: 'c', start: 4, end: 6 }];
    expect(spansAt(shots, 1)).toEqual(['a']);
    // On the cut: both shots.
    expect(spansAt(shots, 2)).toEqual(['a', 'b']);
    expect(spansAt(shots, 1.5, 4.5)).toEqual(['a', 'b', 'c']);
    expect(nextRoundNumber([{ round: 1 }, { round: 3 }])).toBe(4);
    expect(openRounds([{ round: 1 }, { round: 2 }], [{ round: 1 }])).toEqual([{ round: 2 }]);
  });

  it('sends a project with an open round back to /video-next before anything else', () => {
    const state = createInitialState({ slug: 'x', kind: 'music-video', budget_usd: 20 } as never, '0');
    const all = stageViews(state).map((stage) => ({ ...stage, status: 'done' as const }));
    expect(projectNextAction({ slug: 'neon', stages: all, hasRelease: true, openRounds: 1 })).toEqual({ where: 'claude', command: '/video-next neon', reason: 'review' });
    expect(projectNextAction({ slug: 'neon', stages: stageViews(state), hasRelease: false, openRounds: 1 })).toMatchObject({ reason: 'interactive' });
  });

  it('reads the frame rate from the render name', () => {
    const config = { formats: { master: { aspect: '16:9', width: 1920, height: 1080, fps: 30 }, derivatives: [{ aspect: '9:16', width: 1080, height: 1920, fps: 25 }] } };
    expect(renderFps(config, 'preview-9x16.mp4')).toBe(25);
    expect(renderFps(config, '9x16.en.mp4')).toBe(25);
    expect(renderFps(config, 'other.mp4')).toBe(30);
  });
});

describe('review rounds', () => {
  it('keeps drafts editable, freezes a round with shots and section, and checks the replies', async () => {
    const { dir } = await demo();
    const now = new Date('2026-11-21T12:00:00Z');
    await editNote(dir, '16x9.mp4', { action: 'add', seconds: 2.51, text: 'Title a beat early.' }, now);
    let file = await editNote(dir, '16x9.mp4', { action: 'add', seconds: 5, end_seconds: 7.2, text: 'More glow.' }, now);
    expect(file.notes.map((note) => [note.frame, note.time, note.end_frame])).toEqual([[75, '00:02.500', undefined], [150, '00:05.000', 216]]);
    const first = file.notes[0]!.id!;
    file = await editNote(dir, '16x9.mp4', { action: 'update', id: first, text: 'Title lands a beat early.' }, now);
    expect(file.notes[0]!.text).toBe('Title lands a beat early.');
    await expect(editNote(dir, 'nope.mp4', { action: 'add', seconds: 1, text: 'x' })).rejects.toThrow(/unknown render/);
    await expect(editNote(dir, '../project.yaml', { action: 'add', seconds: 1, text: 'x' })).rejects.toThrow(/unknown render/);

    const round = await submitRound(dir, '16x9.mp4', now);
    expect(round).toMatchObject({ round: 1, video: '16x9.mp4', fps: 30, submitted_at: '2026-11-21T12:00:00.000Z' });
    expect(round.notes.map((note) => [note.shots, note.section])).toEqual([[['shot-002'], 'verse_1'], [['shot-002', 'shot-003'], 'verse_1']]);
    await expect(editNote(dir, '16x9.mp4', { action: 'delete', id: first })).rejects.toThrow(/sent in round 1/);
    await expect(submitRound(dir, '16x9.mp4')).rejects.toThrow(/no unsent notes/);
    expect((await productionProject(dir)) as { review: unknown; next: unknown }).toMatchObject({ review: { open: 1, drafts: 0 }, next: { reason: 'review' } });

    const repliesPath = join(dir, 'review', 'rounds', '001.replies.json');
    const reply = (ids: string[]) => writeFile(repliesPath, JSON.stringify({ version: 1, round: 1, answered_at: now.toISOString(), notes: ids.map((id) => ({ id, status: 'fixed', reply: 'Done.' })) }));
    await reply([first]);
    await expect(validateChangedFile(repliesPath)).rejects.toThrow(/without a reply/);
    await reply([first, round.notes[1]!.id, 'n-unknown']);
    await expect(validateChangedFile(repliesPath)).rejects.toThrow(/does not have: n-unknown/);
    await reply(round.notes.map((note) => note.id));
    await validateChangedFile(repliesPath);
    expect((await loadRounds(dir))[0]).toMatchObject({ open: false, replies: { notes: [{ status: 'fixed' }, { status: 'fixed' }] } });
    expect(((await productionProject(dir)) as { next: { reason: string } }).next.reason).not.toBe('review');
  });

  it('keeps the desktop player\'s notes and gives them ids when the board first writes', async () => {
    const { dir } = await demo();
    await mkdir(join(dir, 'review', 'notes'), { recursive: true });
    await writeFile(join(dir, 'review', 'notes', '16x9.json'), JSON.stringify({ video: '16x9.mp4', fps: 30, notes: [{ frame: 30, seconds: 1, time: '00:01.000', text: 'From the desktop player.' }] }));
    const data = await reviewData(dir);
    expect(data.notes['16x9.mp4']!.notes).toEqual([expect.objectContaining({ text: 'From the desktop player.' })]);
    expect(data.sections.map((section) => section.id)).toEqual(['intro', 'verse_1', 'chorus_1', 'outro']);
    expect(data.shots.length).toBeGreaterThan(0);
    const round = await submitRound(dir, '16x9.mp4');
    expect(round.notes).toEqual([expect.objectContaining({ id: expect.stringMatching(/^n/), frame: 30, text: 'From the desktop player.' })]);
    const saved = JSON.parse(await readFile(join(dir, 'review', 'notes', '16x9.json'), 'utf8'));
    expect(saved.notes[0]).toMatchObject({ round: 1, id: round.notes[0]!.id });
  });

  it('takes note writes only from the board page', async () => {
    const { ws } = await demo();
    const handler = boardHandler({ root: ws, refresh: async () => undefined });
    const call = (headers: Record<string, string>) =>
      new Promise<number>((resolveDone) => {
        const req = Object.assign(Readable.from([Buffer.from(JSON.stringify({ video: '16x9.mp4', action: 'add', seconds: 1, text: 'x' }))]), { method: 'POST', url: '/api/review/demo/notes', headers: { host: '127.0.0.1:4848', 'content-type': 'application/json', ...headers } });
        const res = { statusCode: 200, setHeader() {}, writeHead(status: number) { this.statusCode = status; return this; }, end() { resolveDone(this.statusCode); } };
        void handler(req as never, res as never);
      });
    expect(await call({ origin: 'http://evil.example' })).toBe(403);
    expect(await call({ origin: 'http://127.0.0.1:4848' })).toBe(200);
  });
});
