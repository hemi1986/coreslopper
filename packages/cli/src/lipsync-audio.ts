import { ValidationError, type Timing } from '@coreslopper/core';

/** A time range in seconds. */
export interface Span {
  start: number;
  end: number;
}

/** Fade length at the edges of a muted span, in seconds. */
export const MUTE_FADE_SECONDS = 0.04;

/**
 * Backing vocals in the timing: words written in parentheses inside a lyric
 * line, as Suno marks echoes and backing lines ("Trainiert auf euch (auf euch)").
 * A lyric line that is only a parenthesis is a cue without timing and cannot
 * be found here; mute it with an explicit span.
 */
export function backingSpans(timing: Pick<Timing, 'lines'>): Span[] {
  const spans: Span[] = [];
  for (const line of timing.lines) {
    let open = false;
    let current: Span | undefined;
    for (const word of line.words) {
      const text = word.text.trim();
      const opens = text.startsWith('(');
      if (opens) open = true;
      if (open) {
        if (current && word.start - current.end < 0.25) current.end = Math.max(current.end, word.end);
        else {
          current = { start: word.start, end: word.end };
          spans.push(current);
        }
      }
      if (text.includes(')')) {
        open = false;
        current = undefined;
      }
    }
  }
  return spans;
}

/** Parse `--mute 48.2-48.9,50.1-50.6` (song seconds). */
export function parseMuteSpans(value: string | undefined): Span[] {
  if (!value?.trim()) return [];
  return value.split(',').map((part) => {
    const match = /^\s*(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*$/.exec(part);
    if (!match) throw new ValidationError(`Invalid mute span "${part.trim()}". Use <start>-<end> in song seconds, e.g. 48.2-48.9.`);
    const span = { start: Number(match[1]), end: Number(match[2]) };
    if (span.end <= span.start) throw new ValidationError(`Mute span ${part.trim()} ends before it starts.`);
    return span;
  });
}

/**
 * The mutes inside a segment, relative to its start: clipped to the segment,
 * sorted, and merged where they overlap or touch within two fade lengths.
 */
export function segmentMutes(spans: Span[], start: number, end: number, fade = MUTE_FADE_SECONDS): Span[] {
  const inside = spans
    .filter((span) => span.end > start && span.start < end)
    .map((span) => ({ start: Math.max(0, span.start - start), end: Math.min(end, span.end) - start }))
    .sort((a, b) => a.start - b.start);
  const merged: Span[] = [];
  for (const span of inside) {
    const last = merged[merged.length - 1];
    if (last && span.start - last.end <= 2 * fade) last.end = Math.max(last.end, span.end);
    else merged.push({ ...span });
  }
  return merged.map((span) => ({ start: round(span.start), end: round(span.end) }));
}

/**
 * An ffmpeg `volume` filter that silences each span with a short linear fade
 * just outside it, so the span itself is fully silent and nothing clicks.
 * Undefined when there is nothing to mute.
 */
export function muteFilter(spans: Span[], fade = MUTE_FADE_SECONDS): string | undefined {
  if (spans.length === 0) return undefined;
  const gains = spans.map(
    (span) => `max(0,min(1,max((${span.start}-t)/${fade},(t-${span.end})/${fade})))`,
  );
  return `volume='${gains.join('*')}':eval=frame`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
