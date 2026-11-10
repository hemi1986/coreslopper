import type { StyleBible } from '@coreslopper/core';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import type { SubtitleCue } from '../types';

interface SubtitlesProps {
  cues: SubtitleCue[];
  style: StyleBible;
  width: number;
  height: number;
}

/**
 * Safe area for burned-in subtitles, as fractions of the frame. Vertical
 * formats keep clear of the platform UI at the bottom and the sides.
 */
export function subtitleSafeArea(width: number, height: number): { bottom: number; side: number } {
  if (height > width * 1.2) return { bottom: 0.2, side: 0.08 };
  return { bottom: 0.08, side: 0.1 };
}

/** Burned-in subtitles inside the format's safe area; frame-driven, no fades. */
export function Subtitles({ cues, style, width, height }: SubtitlesProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = frame / fps;
  const cue = cues.find((candidate) => time >= candidate.start && time < candidate.end);
  if (!cue) return null;
  const safe = subtitleSafeArea(width, height);
  const fontSize = Math.round(Math.min(width, height) * (height > width * 1.2 ? 0.05 : 0.042));
  return (
    <div
      style={{
        position: 'absolute',
        left: Math.round(width * safe.side),
        right: Math.round(width * safe.side),
        bottom: Math.round(height * safe.bottom),
        display: 'flex',
        justifyContent: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          padding: `${Math.round(fontSize * 0.2)}px ${Math.round(fontSize * 0.45)}px`,
          background: `${style.palette.background}cc`,
          color: style.palette.text,
          fontFamily: style.typography.body?.family ?? 'Space Grotesk',
          fontWeight: 600,
          fontSize,
          lineHeight: 1.25,
          textAlign: 'center',
          whiteSpace: 'pre-line',
          borderRadius: Math.round(fontSize * 0.2),
        }}
      >
        {cue.text}
      </div>
    </div>
  );
}
