// Section tags of lyrics.txt: every sung line sits under a tag like [Verse 1]
// or [Chorus]. The board's wizard proposes tags for untagged lyrics the same
// way every time, and the user confirms the section list.

const TAG = /^\s*\[([^\]]+)\]\s*$/;

export interface LyricsSection {
  tag: string;
  lines: string[];
}

export interface LyricsCheck {
  sections: LyricsSection[];
  /** Lines before the first tag. */
  untagged: string[];
}

/** Split lyrics into tagged sections; text before the first tag is reported, not dropped. */
export function lyricsSections(text: string): LyricsCheck {
  const sections: LyricsSection[] = [];
  const untagged: string[] = [];
  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const tag = TAG.exec(raw);
    if (tag) sections.push({ tag: tag[1]!.trim(), lines: [] });
    else if (raw.trim()) (sections.at(-1)?.lines ?? untagged).push(raw.trimEnd());
  }
  return { sections, untagged };
}

const normalize = (block: string[]) => block.map((line) => line.trim().toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '')).join('\n');

/**
 * Tags for lyrics without any: blocks are split at blank lines; a block that
 * appears more than once is the [Chorus], every other block a numbered
 * [Verse n]. Lyrics that already carry a tag are returned unchanged, with
 * [Intro] added above lines that come before the first tag.
 */
export function proposeTags(text: string): string {
  const clean = text.replace(/\r\n?/g, '\n').trim();
  if (!clean) return '';
  const lines = clean.split('\n');
  if (lines.some((line) => TAG.test(line))) {
    const firstTag = lines.findIndex((line) => TAG.test(line));
    const before = lines.slice(0, firstTag).some((line) => line.trim());
    return `${before ? '[Intro]\n' : ''}${clean}\n`;
  }
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const line of lines) {
    if (line.trim()) current.push(line.trimEnd());
    else if (current.length) {
      blocks.push(current);
      current = [];
    }
  }
  if (current.length) blocks.push(current);
  const counts = new Map<string, number>();
  for (const block of blocks) counts.set(normalize(block), (counts.get(normalize(block)) ?? 0) + 1);
  let verse = 0;
  return `${blocks
    .map((block) => {
      const tag = (counts.get(normalize(block)) ?? 0) > 1 ? 'Chorus' : `Verse ${(verse += 1)}`;
      return `[${tag}]\n${block.join('\n')}`;
    })
    .join('\n\n')}\n`;
}
