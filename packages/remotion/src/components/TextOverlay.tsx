import type { StyleBible, Timing } from '@coreslopper/core';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { lineForText } from '../lib/timing';

interface TextOverlayProps {
  text: string;
  highlights: string[];
  section: string;
  timing: Timing;
  shotStartSeconds: number;
  shotEndSeconds: number;
  style: StyleBible;
  width: number;
  height: number;
  variant: 'title' | 'lyric';
}

interface TimedWord {
  text: string;
  start: number;
  end: number;
  highlight: boolean;
}

function splitWords(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

function isHighlight(word: string, highlights: string[]): boolean {
  const clean = word.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
  return highlights.some((highlight) => {
    const normalized = highlight.toLowerCase().replace(/[^a-z0-9äöüß]/g, '');
    return clean === normalized || (normalized.length > 2 && clean.includes(normalized));
  });
}

function timedWords(
  text: string,
  highlights: string[],
  section: string,
  timing: Timing,
  shotStart: number,
  shotEnd: number,
): TimedWord[] {
  const words = splitWords(text);
  const line = lineForText(timing, section, text);
  if (line && line.words.length === words.length) {
    return words.map((word, index) => ({
      text: word,
      start: line.words[index]!.start,
      end: line.words[index]!.end,
      highlight: isHighlight(word, highlights),
    }));
  }
  const span = Math.max(0.2, shotEnd - shotStart);
  const step = span / Math.max(1, words.length);
  return words.map((word, index) => ({
    text: word,
    start: shotStart + index * step,
    end: shotStart + (index + 1) * step,
    highlight: isHighlight(word, highlights),
  }));
}

function Word({
  word,
  localFrame,
  fps,
  style,
  variant,
  fontSize,
}: {
  word: TimedWord;
  localFrame: number;
  fps: number;
  style: StyleBible;
  variant: 'title' | 'lyric';
  fontSize: number;
}) {
  const visible = localFrame >= 0;
  const progress = visible ? spring({ frame: localFrame, fps, config: { damping: 14, mass: 0.6, stiffness: 150 } }) : 0;
  const opacity = visible ? interpolate(localFrame, [0, 5], [0, 1], { extrapolateRight: 'clamp' }) : 0;
  const scale = interpolate(progress, [0, 1], [0.74, 1]);
  const translateY = interpolate(progress, [0, 1], [26, 0]);
  const family =
    variant === 'title'
      ? style.typography.display?.family ?? 'Space Grotesk'
      : style.typography.body?.family ?? 'Space Grotesk';
  return (
    <span
      style={{
        display: 'inline-block',
        fontFamily: family,
        fontWeight: word.highlight ? 800 : variant === 'title' ? 700 : 500,
        fontSize,
        lineHeight: 1.04,
        letterSpacing: variant === 'title' ? '0.02em' : '0',
        color: word.highlight ? style.palette.accent : style.palette.text,
        textShadow: word.highlight
          ? `0 0 ${fontSize * 0.32}px ${style.palette.accent}, 0 0 ${fontSize * 0.7}px ${style.palette.primary}88`
          : `0 0 ${fontSize * 0.16}px ${style.palette.primary}33`,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale})`,
        marginRight: '0.26em',
        paddingBottom: '0.08em',
        whiteSpace: 'pre',
      }}
    >
      {word.text}
    </span>
  );
}

export function TextOverlay({
  text,
  highlights,
  section,
  timing,
  shotStartSeconds,
  shotEndSeconds,
  style,
  width,
  height,
  variant,
}: TextOverlayProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const words = timedWords(text, highlights, section, timing, shotStartSeconds, shotEndSeconds);
  const wordCount = Math.max(1, words.length);
  const vertical = height > width * 1.2;
  const square = Math.abs(height - width) < width * 0.2;
  const base =
    variant === 'title'
      ? vertical
        ? width * 0.15
        : square
          ? width * 0.12
          : Math.min(width * 0.115, height * 0.17)
      : vertical
        ? width * 0.105
        : square
          ? width * 0.085
          : Math.min(width * 0.068, height * 0.105);
  const fit = (width * 0.82) / (Math.max(6, wordCount) * 0.56);
  const fontSize = Math.max(width * 0.032, Math.min(base, fit));
  const padding = Math.round(Math.min(width, height) * 0.08);

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding,
        textAlign: 'center',
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          maxWidth: width * 0.86,
          padding: `${Math.round(fontSize * 0.26)}px ${Math.round(fontSize * 0.42)}px`,
          borderRadius: Math.round(fontSize * 0.18),
          background: `linear-gradient(120deg, ${style.palette.background}55, ${style.palette.surface}33)`,
          backdropFilter: 'blur(2px)',
          boxShadow: `0 0 ${Math.round(fontSize * 0.9)}px ${style.palette.background}aa`,
        }}
      >
        {words.map((word, index) => {
          const localFrame = frame - Math.round((word.start - shotStartSeconds) * fps);
          return (
            <Word
              key={`${word.text}-${index}`}
              word={word}
              localFrame={localFrame}
              fps={fps}
              style={style}
              variant={variant}
              fontSize={fontSize}
            />
          );
        })}
      </div>
    </div>
  );
}
