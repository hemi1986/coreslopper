import type { ResolvedShot, StyleBible } from '@coreslopper/core';
import { writeTextAtomic } from '@coreslopper/core';
import { formatSeconds } from './utils.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    } else {
      current = next;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length === maxLines) {
    const last = lines[maxLines - 1]!;
    if (!last.endsWith('…') && (words.join(' ').length > lines.join(' ').length)) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(0, maxChars - 1))}…`;
    }
  }
  return lines;
}

function sourceColor(source: ResolvedShot['source'], style: StyleBible): string {
  if (source === 'ai-clip') return style.palette.secondary ?? '#05d9e8';
  if (source === 'footage') return style.palette.accent ?? '#f9f002';
  if (source === 'mixed') return style.palette.primary ?? '#ff2a6d';
  return style.palette.text ?? '#f8f8ff';
}

export function renderContactSheetSvg(
  projectTitle: string,
  durationSeconds: number,
  bpm: number | undefined,
  shots: ResolvedShot[],
  style: StyleBible,
): string {
  const palette = {
    background: style.palette.background ?? '#050510',
    surface: style.palette.surface ?? '#0d0d24',
    primary: style.palette.primary ?? '#ff2a6d',
    secondary: style.palette.secondary ?? '#05d9e8',
    accent: style.palette.accent ?? '#f9f002',
    text: style.palette.text ?? '#f8f8ff',
    muted: style.palette.muted ?? '#8b8ba7',
  };

  const width = 1600;
  const margin = 48;
  const gap = 20;
  const columns = 4;
  const cardWidth = Math.floor((width - margin * 2 - gap * (columns - 1)) / columns);
  const cardHeight = 226;
  const rows = Math.max(1, Math.ceil(shots.length / columns));
  const headerHeight = 154;
  const height = headerHeight + rows * (cardHeight + gap) + 72;

  const cards = shots
    .map((shot, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = margin + column * (cardWidth + gap);
      const y = headerHeight + row * (cardHeight + gap);
      const accent = sourceColor(shot.source, style);
      const description = wrap(shot.description, 42, 4);
      const textLine = shot.text ? wrap(shot.text, 38, 1)[0] ?? '' : '';
      return `<g transform="translate(${x} ${y})">
  <rect width="${cardWidth}" height="${cardHeight}" rx="14" fill="${palette.surface}" stroke="${accent}" stroke-opacity="0.55"/>
  <rect width="${cardWidth}" height="5" rx="2.5" fill="${accent}"/>
  <text x="18" y="34" fill="${palette.text}" font-family="JetBrains Mono, monospace" font-size="15" font-weight="700">${escapeXml(shot.id)}</text>
  <text x="${cardWidth - 18}" y="34" text-anchor="end" fill="${accent}" font-family="JetBrains Mono, monospace" font-size="12">${escapeXml(shot.source.toUpperCase())}</text>
  <text x="18" y="58" fill="${palette.muted}" font-family="JetBrains Mono, monospace" font-size="12">${escapeXml(shot.section)} · ${formatSeconds(shot.startSeconds)}–${formatSeconds(shot.endSeconds)}</text>
  ${description
    .map(
      (line, lineIndex) =>
        `<text x="18" y="${86 + lineIndex * 20}" fill="${palette.text}" font-family="Space Grotesk, sans-serif" font-size="15" opacity="0.9">${escapeXml(line)}</text>`,
    )
    .join('\n  ')}
  ${
    textLine
      ? `<text x="18" y="${cardHeight - 22}" fill="${palette.accent}" font-family="Space Grotesk, sans-serif" font-size="14" font-weight="700">“${escapeXml(textLine)}”</text>`
      : ''
  }
</g>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="${width}" height="${height}" fill="${palette.background}"/>
  <rect x="0" y="0" width="${width}" height="${headerHeight}" fill="${palette.surface}"/>
  <text x="${margin}" y="62" fill="${palette.primary}" font-family="JetBrains Mono, monospace" font-size="14" letter-spacing="4">CORESLOPPER / CONTACT SHEET</text>
  <text x="${margin}" y="108" fill="${palette.text}" font-family="Orbitron, Space Grotesk, sans-serif" font-size="38" font-weight="800">${escapeXml(projectTitle)}</text>
  <text x="${margin}" y="136" fill="${palette.muted}" font-family="JetBrains Mono, monospace" font-size="13">${shots.length} shots · ${formatSeconds(durationSeconds)}${bpm === undefined ? '' : ` · ${bpm.toFixed(1)} BPM`} · ${width}×${height}</text>
  ${cards}
  <text x="${margin}" y="${height - 28}" fill="${palette.muted}" font-family="JetBrains Mono, monospace" font-size="12">Generated by coreslopper</text>
</svg>
`;
}

export async function writeContactSheet(
  path: string,
  projectTitle: string,
  durationSeconds: number,
  bpm: number | undefined,
  shots: ResolvedShot[],
  style: StyleBible,
): Promise<void> {
  await writeTextAtomic(path, renderContactSheetSvg(projectTitle, durationSeconds, bpm, shots, style));
}
