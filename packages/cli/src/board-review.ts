import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ReviewNotesSchema,
  ReviewRepliesSchema,
  ReviewRoundSchema,
  ValidationError,
  draftNotes,
  formatId,
  formatReviewTime,
  frameAt,
  loadProject,
  nextRoundNumber,
  openRounds,
  readJsonFile,
  repliesFileName,
  roundFileName,
  sectionAt,
  spansAt,
  writeTextAtomic,
  type ProjectConfig,
  type ReviewNote,
  type ReviewNotes,
  type ReviewReplies,
  type ReviewRound,
  type TimedSpan,
} from '@coreslopper/core';
import { withFileLock } from './file-lock.js';

// The board's review view: renders with their frame rate, the song's sections
// and the storyboard's shots for the timeline, the user's notes per render,
// and the review rounds sent to the agent with its replies.

export const notesDir = (projectDir: string) => join(projectDir, 'review', 'notes');
export const roundsDir = (projectDir: string) => join(projectDir, 'review', 'rounds');
const lockPath = (projectDir: string) => join(projectDir, 'review', '.notes.lock');

const RENDER = /^[A-Za-z0-9][A-Za-z0-9._-]*\.(mp4|mov|webm)$/;
const MAX_TEXT = 4000;

/** The frame rate of a render, from its format in the file name (`preview-9x16.mp4`, `16x9.mp4`, `9x16.en.mp4`). */
export function renderFps(config: Pick<ProjectConfig, 'formats'>, name: string): number {
  const id = name.replace(/\.[^.]+$/, '').replace(/^preview-/, '').replace(/\.[a-z]{2}$/, '');
  const formats = [config.formats.master, ...config.formats.derivatives];
  return formats.find((format) => formatId(format.aspect) === id)?.fps ?? config.formats.master.fps;
}

export const notesPath = (projectDir: string, video: string) => join(notesDir(projectDir), `${video.replace(/\.[^.]+$/, '')}.json`);

export async function loadNotes(projectDir: string, video: string, fps: number): Promise<ReviewNotes> {
  const path = notesPath(projectDir, video);
  return existsSync(path) ? readJsonFile(path, ReviewNotesSchema) : { video, fps, notes: [] };
}

export interface RoundView extends ReviewRound {
  replies?: ReviewReplies;
  open: boolean;
}

export async function loadRounds(projectDir: string): Promise<RoundView[]> {
  const dir = roundsDir(projectDir);
  const names = await readdir(dir).catch(() => [] as string[]);
  const rounds: ReviewRound[] = [];
  const replies: ReviewReplies[] = [];
  for (const name of names.sort()) {
    if (/^\d{3,}\.json$/.test(name)) rounds.push(await readJsonFile(join(dir, name), ReviewRoundSchema));
    else if (/^\d{3,}\.replies\.json$/.test(name)) replies.push(await readJsonFile(join(dir, name), ReviewRepliesSchema));
  }
  const open = new Set(openRounds(rounds, replies).map((round) => round.round));
  return rounds
    .map((round) => {
      const reply = replies.find((entry) => entry.round === round.round);
      return { ...round, ...(reply ? { replies: reply } : {}), open: open.has(round.round) };
    })
    .sort((a, b) => a.round - b.round);
}

/** Counts for the production view: open rounds and unsent notes. */
export async function reviewCounts(projectDir: string): Promise<{ open: number; drafts: number }> {
  let open = 0;
  let drafts = 0;
  try {
    open = (await loadRounds(projectDir)).filter((round) => round.open).length;
  } catch {
    // An unreadable round file is reported by validate-file and the review view.
  }
  for (const name of await readdir(notesDir(projectDir)).catch(() => [] as string[])) {
    if (!name.endsWith('.json')) continue;
    try {
      drafts += draftNotes((await readJsonFile(join(notesDir(projectDir), name), ReviewNotesSchema)).notes).length;
    } catch {
      // a broken notes file shows in the review view
    }
  }
  return { open, drafts };
}

export interface ReviewRender {
  name: string;
  path: string;
  fps: number;
  modified: string;
}

export interface ReviewData {
  slug: string;
  title: string;
  renders: ReviewRender[];
  durationSeconds?: number;
  sections: Array<TimedSpan & { label: string }>;
  shots: TimedSpan[];
  /** Why the shots are missing, when they are. */
  shotsError?: string;
  beats: number[];
  downbeats: number[];
  notes: Record<string, ReviewNotes>;
  rounds: RoundView[];
}

async function shotSpans(projectDir: string): Promise<{ shots: TimedSpan[]; error?: string }> {
  try {
    const { validateProject } = await import('./validate.js');
    const { resolved } = await validateProject(projectDir, { write: false });
    return { shots: resolved.shots.map((shot) => ({ id: shot.id, start: shot.startSeconds, end: shot.endSeconds })) };
  } catch (error) {
    return { shots: [], error: (error as Error).message.split('\n')[0] };
  }
}

export async function reviewData(projectDir: string): Promise<ReviewData> {
  const project = await loadProject(projectDir);
  const { config, effectiveTiming } = project;
  const entries = await readdir(project.paths.renders, { withFileTypes: true }).catch(() => []);
  const renders: ReviewRender[] = [];
  for (const entry of entries) {
    if (!RENDER.test(entry.name)) continue;
    const info = await stat(join(project.paths.renders, entry.name)).catch(() => undefined);
    if (!info?.isFile()) continue;
    renders.push({ name: entry.name, path: `renders/${entry.name}`, fps: renderFps(config, entry.name), modified: info.mtime.toISOString() });
  }
  renders.sort((a, b) => b.modified.localeCompare(a.modified));
  const notes: Record<string, ReviewNotes> = {};
  for (const render of renders) notes[render.name] = await loadNotes(projectDir, render.name, render.fps);
  const { shots, error } = effectiveTiming ? await shotSpans(projectDir) : { shots: [], error: 'no timing.json yet' };
  return {
    slug: config.slug,
    title: config.title,
    renders,
    ...(effectiveTiming ? { durationSeconds: effectiveTiming.audio.duration } : {}),
    sections: (effectiveTiming?.sections ?? []).map((section) => ({ id: section.id, label: section.label, start: section.start, end: section.end })),
    shots,
    ...(error ? { shotsError: error } : {}),
    beats: effectiveTiming?.beats ?? [],
    downbeats: effectiveTiming?.downbeats ?? [],
    notes,
    rounds: await loadRounds(projectDir),
  };
}

export interface NoteChange {
  action: 'add' | 'update' | 'delete';
  id?: string;
  seconds?: number;
  end_seconds?: number | null;
  text?: string;
}

function checkSeconds(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 24 * 3600) throw new ValidationError(`${name} must be seconds from 0`);
  return value;
}

function checkText(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new ValidationError('a note needs text');
  if (value.length > MAX_TEXT) throw new ValidationError(`a note takes at most ${MAX_TEXT} characters`);
  return value.trim();
}

async function knownRender(projectDir: string, video: unknown): Promise<{ name: string; fps: number }> {
  if (typeof video !== 'string' || !RENDER.test(video)) throw new ValidationError('unknown render');
  const project = await loadProject(projectDir);
  if (!existsSync(join(project.paths.renders, video))) throw new ValidationError(`unknown render ${video}`);
  return { name: video, fps: renderFps(project.config, video) };
}

/** Place a note (or a range) on frames: the frame shown at the time, and the times of those frames. */
function placed(seconds: number, endSeconds: number | undefined, fps: number): Pick<ReviewNote, 'frame' | 'seconds' | 'time' | 'end_frame' | 'end_seconds' | 'end_time'> {
  const frame = frameAt(seconds, fps);
  const at = Number((frame / fps).toFixed(3));
  if (endSeconds === undefined) return { frame, seconds: at, time: formatReviewTime(at) };
  const endFrame = Math.max(frame, frameAt(endSeconds, fps));
  const end = Number((endFrame / fps).toFixed(3));
  if (endFrame === frame) return { frame, seconds: at, time: formatReviewTime(at) };
  return { frame, seconds: at, time: formatReviewTime(at), end_frame: endFrame, end_seconds: end, end_time: formatReviewTime(end) };
}

/** Add, change, or delete a draft note of one render. Sent notes belong to their round and stay as they are. */
export async function editNote(projectDir: string, video: unknown, change: NoteChange, now = new Date()): Promise<ReviewNotes> {
  const render = await knownRender(projectDir, video);
  return withFileLock(lockPath(projectDir), async () => {
    const file = await loadNotes(projectDir, render.name, render.fps);
    file.fps = render.fps;
    if (change.action === 'add') {
      const seconds = checkSeconds(change.seconds, 'seconds');
      const end = change.end_seconds === undefined || change.end_seconds === null ? undefined : checkSeconds(change.end_seconds, 'end_seconds');
      file.notes.push({ id: `n${randomBytes(4).toString('hex')}`, ...placed(seconds, end, render.fps), text: checkText(change.text), created: now.toISOString() });
    } else {
      const index = file.notes.findIndex((note) => note.id === change.id);
      if (index < 0) throw new ValidationError('unknown note');
      const note = file.notes[index]!;
      if (note.round !== undefined) throw new ValidationError(`this note was sent in round ${note.round} and cannot change`);
      if (change.action === 'delete') file.notes.splice(index, 1);
      else {
        const { frame: _f, seconds: _s, time: _t, end_frame: _ef, end_seconds: _es, end_time: _et, ...rest } = note;
        const seconds = change.seconds === undefined ? note.seconds : checkSeconds(change.seconds, 'seconds');
        const end = change.end_seconds === null ? undefined : change.end_seconds === undefined ? note.end_seconds : checkSeconds(change.end_seconds, 'end_seconds');
        file.notes[index] = { ...rest, ...placed(seconds, end, render.fps), text: change.text === undefined ? note.text : checkText(change.text) };
      }
    }
    // Notes of the desktop player have no id; give each one so the board can address it.
    for (const note of file.notes) note.id ??= `n${randomBytes(4).toString('hex')}`;
    file.notes.sort((a, b) => a.frame - b.frame);
    await writeTextAtomic(notesPath(projectDir, render.name), `${JSON.stringify(ReviewNotesSchema.parse(file), null, 2)}\n`);
    return file;
  });
}

/**
 * Send the draft notes of one render to the agent: a new round file with each
 * note's shots and section, frozen; the notes are marked with the round.
 */
export async function submitRound(projectDir: string, video: unknown, now = new Date()): Promise<ReviewRound> {
  const render = await knownRender(projectDir, video);
  const { shots } = await shotSpans(projectDir);
  const project = await loadProject(projectDir);
  return withFileLock(lockPath(projectDir), async () => {
    const file = await loadNotes(projectDir, render.name, render.fps);
    const drafts = draftNotes(file.notes);
    if (!drafts.length) throw new ValidationError(`no unsent notes on ${render.name}`);
    const number = nextRoundNumber(await loadRounds(projectDir));
    for (const note of file.notes) note.id ??= `n${randomBytes(4).toString('hex')}`;
    const round: ReviewRound = ReviewRoundSchema.parse({
      version: 1,
      round: number,
      video: render.name,
      fps: render.fps,
      submitted_at: now.toISOString(),
      notes: drafts.map((note) => {
        const section = project.effectiveTiming ? sectionAt(project.effectiveTiming, note.seconds) : undefined;
        return {
          id: note.id!,
          frame: note.frame,
          seconds: note.seconds,
          time: note.time,
          ...(note.end_frame !== undefined ? { end_frame: note.end_frame, end_seconds: note.end_seconds, end_time: note.end_time } : {}),
          shots: spansAt(shots, note.seconds, note.end_seconds ?? note.seconds, render.fps),
          ...(section ? { section: section.id } : {}),
          text: note.text,
        };
      }),
    });
    await writeTextAtomic(join(roundsDir(projectDir), roundFileName(number)), `${JSON.stringify(round, null, 2)}\n`);
    for (const note of drafts) note.round = number;
    await writeTextAtomic(notesPath(projectDir, render.name), `${JSON.stringify(file, null, 2)}\n`);
    return round;
  });
}

/** The open rounds, for `status` and /video-next. */
export async function openRoundSummaries(projectDir: string): Promise<string[]> {
  const rounds = (await loadRounds(projectDir)).filter((round) => round.open);
  return rounds.map((round) => `round ${round.round} open: ${round.notes.length} note(s) on ${round.video} → review/rounds/${roundFileName(round.round)}, reply in review/rounds/${repliesFileName(round.round)}`);
}
