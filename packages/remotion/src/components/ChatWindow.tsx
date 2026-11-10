import type { ResolvedShot, StyleBible } from '@coreslopper/core';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { ChatMessage } from '../types';

interface ChatWindowProps {
  shot: ResolvedShot;
  chat?: { cps: number; hold: number; messages: ChatMessage[] };
  style: StyleBible;
  width: number;
  height: number;
}

const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

/** Bevelled box edge of an early-2000s desktop window. */
function bevel(light: string, dark: string, size: number) {
  return {
    borderTop: `${size}px solid ${light}`,
    borderLeft: `${size}px solid ${light}`,
    borderRight: `${size}px solid ${dark}`,
    borderBottom: `${size}px solid ${dark}`,
  };
}

/**
 * A desktop chat window in an early-2000s messenger look. The shot's
 * `motion.props.lines` names the chat lines it shows; each message appears at
 * its line's start and types itself out at the script's typing speed while a
 * typing indicator runs, then holds. Driven only by useCurrentFrame.
 */
export function ChatWindow({ shot, chat, style, width, height }: ChatWindowProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const time = shot.startSeconds + frame / fps;
  const ids = Array.isArray(shot.motion?.props.lines) ? (shot.motion!.props.lines as string[]) : [];
  const messages = (chat?.messages ?? []).filter((message) => ids.includes(message.id));
  const cps = chat?.cps ?? 12;

  const vertical = height > width * 1.2;
  const unit = Math.round(Math.min(width, height) / 60);
  const windowWidth = Math.round(width * (vertical ? 0.88 : 0.56));
  const windowHeight = Math.round(height * (vertical ? 0.5 : 0.66));
  const fontSize = Math.round(unit * (vertical ? 2.6 : 2.1));
  const family = style.typography.body?.family ?? 'Space Grotesk';
  const mono = style.typography.mono?.family ?? family;
  const chrome = style.palette.surface;
  const light = `${style.palette.text}55`;
  const dark = `${style.palette.background}cc`;
  const open = interpolate(frame, [0, Math.round(fps * 0.25)], [0.92, 1], clamp);

  const visible = messages
    .filter((message) => time >= message.start)
    .map((message) => {
      const characters = [...message.text];
      const typed = Math.min(characters.length, Math.floor((time - message.start) * cps + 1e-6));
      return { message, text: characters.slice(0, typed).join(''), typing: typed < characters.length };
    });
  const typing = visible.find((entry) => entry.typing);
  const dots = '.'.repeat(1 + (Math.floor(frame / Math.max(1, Math.round(fps / 4))) % 3));
  const title = messages[0]?.sender ?? 'Chat';

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: `radial-gradient(circle at 50% 40%, ${style.palette.secondary}22, ${style.palette.background} 70%)`,
      }}
    >
      <div
        style={{
          width: windowWidth,
          height: windowHeight,
          display: 'flex',
          flexDirection: 'column',
          background: chrome,
          ...bevel(light, dark, Math.max(2, Math.round(unit / 3))),
          boxShadow: `${unit}px ${unit}px 0 ${style.palette.background}aa`,
          transform: `scale(${open})`,
          fontFamily: family,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: `${Math.round(unit * 0.6)}px ${unit}px`,
            background: `linear-gradient(90deg, ${style.palette.primary}, ${style.palette.secondary})`,
            color: style.palette.background,
            fontWeight: 700,
            fontSize: Math.round(fontSize * 0.8),
          }}
        >
          <span>{title}</span>
          <span style={{ display: 'flex', gap: Math.round(unit * 0.4) }}>
            {['_', '□', '×'].map((glyph) => (
              <span
                key={glyph}
                style={{
                  width: Math.round(fontSize * 0.9),
                  height: Math.round(fontSize * 0.9),
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: chrome,
                  color: style.palette.text,
                  fontSize: Math.round(fontSize * 0.6),
                  ...bevel(light, dark, 2),
                }}
              >
                {glyph}
              </span>
            ))}
          </span>
        </div>
        <div
          style={{
            flex: 1,
            margin: unit,
            padding: unit,
            background: style.palette.text,
            color: style.palette.background,
            ...bevel(dark, light, Math.max(2, Math.round(unit / 3))),
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-end',
            gap: Math.round(unit * 0.8),
            overflow: 'hidden',
          }}
        >
          {visible.map(({ message, text }) => (
            <div key={message.id} style={{ fontSize, lineHeight: 1.25 }}>
              <span style={{ fontWeight: 700, color: style.palette.background }}>{message.sender}:</span>{' '}
              <span style={{ fontFamily: mono }}>{text}</span>
            </div>
          ))}
        </div>
        <div
          style={{
            margin: `0 ${unit}px`,
            minHeight: Math.round(fontSize * 1.3),
            fontSize: Math.round(fontSize * 0.75),
            color: style.palette.muted,
            fontStyle: 'italic',
          }}
        >
          {typing ? `${typing.message.sender} is typing${dots}` : ''}
        </div>
        <div style={{ display: 'flex', gap: unit, margin: unit, marginTop: Math.round(unit / 2) }}>
          <div
            style={{
              flex: 1,
              height: Math.round(fontSize * 1.8),
              background: style.palette.text,
              ...bevel(dark, light, Math.max(2, Math.round(unit / 3))),
            }}
          />
          <div
            style={{
              padding: `0 ${unit * 1.5}px`,
              display: 'flex',
              alignItems: 'center',
              fontSize: Math.round(fontSize * 0.8),
              fontWeight: 700,
              color: style.palette.text,
              ...bevel(light, dark, Math.max(2, Math.round(unit / 3))),
            }}
          >
            Send
          </div>
        </div>
      </div>
    </div>
  );
}
