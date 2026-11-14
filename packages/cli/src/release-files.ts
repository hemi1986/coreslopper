import { existsSync } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { basename, join } from 'node:path';

// Release-package file checks without the renderer or ffmpeg, so status (also
// in the npx bundle) can list them and tests can run them on plain data.

/** Shorts per video in a release package. */
export const SHORTS_PER_VIDEO = 3;
/** Longest Short the `short` command cuts; YouTube treats up to 60 s as a Short everywhere. */
export const SHORT_MAX_SECONDS = 60;
/** The length range the skill aims for. */
export const SHORT_TARGET_SECONDS = { min: 30, max: 50 } as const;
/** Suffixes of a Short's video and thumbnail in `renders/shorts/`. */
export const SHORT_VIDEO_SUFFIX = '-9x16.mp4';
export const SHORT_THUMB_SUFFIX = '-thumb.jpg';

/** The Shorts folder of a project. */
export function shortsDir(renders: string): string {
  return join(renders, 'shorts');
}

/** `renders/shorts/<name>-9x16.mp4` and `<name>-thumb.jpg` for a Short name. */
export function shortPaths(renders: string, name: string): { video: string; thumbnail: string } {
  const dir = shortsDir(renders);
  return { video: join(dir, `${name}${SHORT_VIDEO_SUFFIX}`), thumbnail: join(dir, `${name}${SHORT_THUMB_SUFFIX}`) };
}

/** The Short name of a video file (`Z1-intro-9x16.mp4` → `Z1-intro`), or undefined for any other file. */
export function shortName(file: string): string | undefined {
  const name = basename(file);
  return name.endsWith(SHORT_VIDEO_SUFFIX) ? name.slice(0, -SHORT_VIDEO_SUFFIX.length) : undefined;
}

/** The Short videos in `renders/shorts/`, sorted by name. */
export async function listShorts(renders: string): Promise<string[]> {
  const dir = shortsDir(renders);
  if (!existsSync(dir)) return [];
  return (await readdir(dir))
    .filter((name) => shortName(name) !== undefined)
    .sort()
    .map((name) => join(dir, name));
}

/** Probed properties of a Short video. */
export interface ShortProbe {
  name: string;
  width: number;
  height: number;
  duration: number;
}

/** Problems of a Short video: not 9:16, or longer than 60 s. Empty when it is fine. */
export function shortProblems(probe: ShortProbe): string[] {
  const problems: string[] = [];
  if (probe.width <= 0 || probe.height <= 0 || Math.abs(probe.width / probe.height - 9 / 16) > 0.01) {
    problems.push(`${probe.width}x${probe.height}, expected 9:16`);
  }
  if (probe.duration > SHORT_MAX_SECONDS + 0.05) problems.push(`${probe.duration.toFixed(1)} s, limit ${SHORT_MAX_SECONDS} s`);
  return problems;
}

/** The upload texts of one item (the main video or a Short), as found in `review/upload.md`. */
export interface UploadItem {
  heading: string;
  title?: string;
  description?: string;
  hashtags: string[];
  tags?: string;
  checklist: number;
}

export interface UploadText {
  main?: UploadItem;
  shorts: UploadItem[];
}

// Field labels in the languages a project is likely written in; the skill writes them in the project's language.
const TITLE_LABELS = ['title', 'titel', 'titre', 'título', 'titolo', 'tytuł'];
const DESCRIPTION_LABELS = ['description', 'beschreibung', 'descripción', 'descrizione', 'descrição', 'beschrijving', 'opis'];
const TAG_LABELS = ['tags', 'schlagwörter', 'etiquetas', 'tag'];
const FIELD = /^\*\*([^*]+?):\*\*\s*(.*)$/u;
const HASHTAG_LINE = /^(#[\p{L}\p{N}_]+\s*)+$/u;

function parseItem(heading: string, lines: string[]): UploadItem {
  const item: UploadItem = { heading, hashtags: [], checklist: 0 };
  let inDescription = false;
  const description: string[] = [];
  for (const raw of lines) {
    const line = raw.trim();
    const field = FIELD.exec(line);
    if (field) {
      const label = field[1]!.trim().toLowerCase();
      const value = field[2]!.trim();
      inDescription = DESCRIPTION_LABELS.includes(label);
      if (TITLE_LABELS.includes(label)) item.title = value;
      else if (TAG_LABELS.includes(label)) item.tags = value;
      else if (inDescription && value) description.push(value);
      continue;
    }
    if (/^- \[[ xX]\]/.test(line)) {
      item.checklist += 1;
      inDescription = false;
      continue;
    }
    if (HASHTAG_LINE.test(line)) {
      item.hashtags.push(...line.split(/\s+/).filter(Boolean));
      continue;
    }
    if (inDescription && line) description.push(line);
  }
  if (description.length) item.description = description.join('\n');
  return item;
}

/**
 * Parse `review/upload.md`. The main video is the first `##` section that is
 * not the Shorts section; each `###` inside the `## Shorts` section is one
 * Short. Fields are bold labels (`**Title:**`, `**Description:**`,
 * `**Tags:**`, in the project's language), hashtags a line of `#words`, the
 * checklist `- [ ]` items.
 */
export function parseUploadText(markdown: string): UploadText {
  const result: UploadText = { shorts: [] };
  let section: 'main' | 'shorts' | 'other' = 'other';
  let current: { heading: string; lines: string[]; kind: 'main' | 'short' } | undefined;
  const flush = () => {
    if (!current) return;
    const item = parseItem(current.heading, current.lines);
    if (current.kind === 'main') result.main ??= item;
    else result.shorts.push(item);
    current = undefined;
  };
  for (const line of markdown.split(/\r?\n/)) {
    const h2 = /^##\s+(.+)$/.exec(line);
    const h3 = /^###\s+(.+)$/.exec(line);
    if (h2) {
      flush();
      const heading = h2[1]!.trim();
      if (/\bshorts?\b/i.test(heading)) section = 'shorts';
      else if (!result.main) {
        section = 'main';
        current = { heading, lines: [], kind: 'main' };
      } else section = 'other';
      continue;
    }
    if (h3) {
      if (section === 'shorts') {
        flush();
        current = { heading: h3[1]!.trim(), lines: [], kind: 'short' };
      }
      continue;
    }
    current?.lines.push(line);
  }
  flush();
  return result;
}

/** Problems that make the upload text unusable (FAIL) and gaps worth a warning (WARN). */
export function uploadTextProblems(
  text: UploadText,
  markdown: string,
  shortNames: string[],
): { errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const missing = (item: UploadItem, what: 'main' | 'short') => {
    const gaps: string[] = [];
    if (!item.title) gaps.push('title');
    if (!item.description) gaps.push('description');
    if (item.hashtags.length === 0) gaps.push('hashtags');
    if (what === 'main' && !item.tags) gaps.push('tags');
    return gaps;
  };
  if (!text.main) errors.push('no main video section (## heading with title, description, hashtags, tags)');
  else {
    const gaps = missing(text.main, 'main');
    if (gaps.length) errors.push(`main video "${text.main.heading}" lacks ${gaps.join(', ')}`);
  }
  for (const short of text.shorts) {
    const gaps = missing(short, 'short');
    if (gaps.length) errors.push(`Short "${short.heading}" lacks ${gaps.join(', ')}`);
    if (short.title && !/#shorts\b/i.test(short.title)) warnings.push(`Short "${short.heading}": title without #shorts`);
    if (short.checklist === 0) warnings.push(`Short "${short.heading}": no upload checklist`);
  }
  if (text.shorts.length < SHORTS_PER_VIDEO) warnings.push(`${text.shorts.length} of ${SHORTS_PER_VIDEO} Shorts described`);
  for (const name of shortNames) {
    if (!markdown.includes(name)) warnings.push(`${name}${SHORT_VIDEO_SUFFIX} is not mentioned`);
  }
  return { errors, warnings };
}
