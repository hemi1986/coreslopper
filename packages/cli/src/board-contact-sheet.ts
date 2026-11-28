import { existsSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import { join } from 'node:path';
import { ValidationError, type ResolvedShot } from '@coreslopper/core';
import { validateProject } from './validate.js';

// The board's contact sheet (RM-ContactSheet, G-70): one card per shot of the
// resolved storyboard, in playing order, with the shot's keyframe from
// assets/keyframes/<shot>.png once it is filed. Built on every request, so a
// new keyframe shows after the user's refresh without a contact-sheet run.
// Read-only: validation runs without writing timing.effective.json.

export interface ContactSheetCard {
  id: string;
  source: ResolvedShot['source'];
  section: string;
  startSeconds: number;
  endSeconds: number;
  description: string;
  text?: string;
  /** The keyframe, relative to the project, served through the project file route. */
  keyframe?: { path: string; modified: string };
}

export type ContactSheet =
  | { status: 'none' }
  | { status: 'invalid'; error: string; details: string[] }
  | { status: 'ok'; durationSeconds: number; cards: ContactSheetCard[] };

/** The keyframe a shot's card shows: `assets/keyframes/<shot>.png`, when it is a file. */
async function keyframe(projectDir: string, shot: string): Promise<ContactSheetCard['keyframe']> {
  const path = `assets/keyframes/${shot}.png`;
  const info = await stat(join(projectDir, path)).catch(() => undefined);
  return info?.isFile() ? { path, modified: info.mtime.toISOString() } : undefined;
}

export async function contactSheet(projectDir: string): Promise<ContactSheet> {
  if (!existsSync(join(projectDir, 'storyboard.yaml'))) return { status: 'none' };
  let shots: ResolvedShot[];
  let durationSeconds: number;
  try {
    const { resolved } = await validateProject(projectDir, { write: false });
    shots = resolved.shots;
    durationSeconds = resolved.durationSeconds;
  } catch (error) {
    const details = error instanceof ValidationError ? error.details : [];
    return { status: 'invalid', error: (error as Error).message, details };
  }
  const cards = await Promise.all(
    shots.map(async (shot): Promise<ContactSheetCard> => {
      const image = await keyframe(projectDir, shot.id);
      return {
        id: shot.id,
        source: shot.source,
        section: shot.section,
        startSeconds: shot.startSeconds,
        endSeconds: shot.endSeconds,
        description: shot.description,
        ...(shot.text ? { text: shot.text } : {}),
        ...(image ? { keyframe: image } : {}),
      };
    }),
  );
  return { status: 'ok', durationSeconds, cards };
}
