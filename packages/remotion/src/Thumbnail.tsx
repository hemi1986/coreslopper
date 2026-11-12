import { useEffect, useState } from 'react';
import { AbsoluteFill, Img, cancelRender, continueRender, delayRender, staticFile } from 'remotion';
import { EXAMPLE_BRAND_FONTS } from './fonts';
import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  coverPlacement,
  faceAnchor,
  layoutThumbnail,
  type LineMetrics,
  type ThumbnailLayoutResult,
} from './lib/thumbnail';
import type { ThumbnailProps } from './types';

interface Measured {
  layout: ThumbnailLayoutResult;
  image?: { left: number; top: number; width: number; height: number };
}

function fontFormat(url: string): string {
  const lower = url.toLowerCase();
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.otf')) return 'opentype';
  return 'truetype';
}

/** Load every brand font into document.fonts and wait for it, so measuring sees the real glyphs. */
async function loadFonts(fonts: ThumbnailProps['fonts']): Promise<void> {
  const list = fonts.length > 0 ? fonts : EXAMPLE_BRAND_FONTS;
  await Promise.all(
    list.map(async (font) => {
      const face = new FontFace(font.family, `url(${staticFile(font.url)}) format('${fontFormat(font.url)}')`, {
        weight: font.weight,
        style: font.style,
      });
      document.fonts.add(await face.load());
    }),
  );
}

function loadImage(src: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error(`Could not load the still ${src}`));
    image.src = src;
  });
}

function measure(text: string, font: { family: string; weight: number }): LineMetrics {
  const context = document.createElement('canvas').getContext('2d')!;
  context.font = `${font.weight} 100px "${font.family}"`;
  const metrics = context.measureText(text);
  return {
    left: metrics.actualBoundingBoxLeft,
    width: metrics.actualBoundingBoxLeft + metrics.actualBoundingBoxRight,
    ascent: metrics.actualBoundingBoxAscent,
    descent: metrics.actualBoundingBoxDescent,
  };
}

function fontStack(font: { family: string }, fallback: string): string {
  return `"${font.family}", ${fallback}`;
}

/**
 * A 1280x720 video thumbnail: the still covers the frame with its focus point
 * on the face side, a scrim darkens the text side, and the hook lines sit on
 * solid, slightly tilted slabs (first line on the slab colour, the rest on the
 * accent). An optional mono tag sits in a top corner. Everything is measured
 * once before the frame is captured, so the same props give the same pixels.
 */
export function Thumbnail(props: ThumbnailProps) {
  const [measured, setMeasured] = useState<Measured | null>(null);
  const [handle] = useState(() => delayRender('Thumbnail fonts, still, and layout'));

  useEffect(() => {
    let active = true;
    (async () => {
      await loadFonts(props.fonts);
      const source = props.still ? await loadImage(staticFile(props.still)) : undefined;
      const layout = layoutThumbnail(
        props.lines.map((line) => measure(line, props.hookFont)),
        props.layout,
        props.tag ? measure(props.tag, props.tagFont) : undefined,
      );
      const image = source ? coverPlacement(source, props.focus, props.zoom, faceAnchor(props.layout)) : undefined;
      if (active) setMeasured({ layout, image });
      continueRender(handle);
    })().catch((error: unknown) => cancelRender(error));
    return () => {
      active = false;
    };
    // Measure once per render: the props of a still never change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { colors } = props;
  const scrim =
    props.layout === 'bottom'
      ? `linear-gradient(to top, ${colors.background}e6 0%, ${colors.background}b3 18%, ${colors.background}00 46%)`
      : `linear-gradient(to ${props.layout === 'left' ? 'right' : 'left'}, ${colors.background}e0 11%, ${colors.background}00 50%)`;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background }}>
      {measured?.image ? (
        <Img
          src={staticFile(props.still)}
          style={{
            position: 'absolute',
            left: measured.image.left,
            top: measured.image.top,
            width: measured.image.width,
            height: measured.image.height,
          }}
        />
      ) : null}
      <AbsoluteFill style={{ background: scrim }} />
      {props.layout === 'bottom' ? null : (
        <AbsoluteFill
          style={{ background: `linear-gradient(to bottom, ${colors.background}00 72%, ${colors.background}8c 100%)` }}
        />
      )}
      {measured ? (
        <svg
          width={THUMBNAIL_WIDTH}
          height={THUMBNAIL_HEIGHT}
          viewBox={`0 0 ${THUMBNAIL_WIDTH} ${THUMBNAIL_HEIGHT}`}
          style={{ position: 'absolute', inset: 0 }}
        >
          <defs>
            <filter id="slab-shadow" x="-20%" y="-30%" width="140%" height="170%">
              <feDropShadow dx={8} dy={10} stdDeviation={7} floodColor="#000000" floodOpacity={0.75} />
            </filter>
            <filter id="tag-shadow" x="-20%" y="-40%" width="140%" height="190%">
              <feDropShadow dx={3} dy={4} stdDeviation={3} floodColor="#000000" floodOpacity={0.6} />
            </filter>
          </defs>
          {measured.layout.slabs.map((slab, index) => {
            const first = index === 0;
            const cx = slab.x + slab.width / 2;
            const cy = slab.y + slab.height / 2;
            return (
              <g key={index} filter="url(#slab-shadow)">
                <g transform={`rotate(${slab.rotate} ${cx} ${cy})`}>
                  <rect x={slab.x} y={slab.y} width={slab.width} height={slab.height} fill={first ? colors.slab : colors.accent} />
                  <text
                    x={slab.textX}
                    y={slab.textY}
                    fill={first ? colors.slabText : colors.accentText}
                    fontFamily={fontStack(props.hookFont, 'sans-serif')}
                    fontWeight={props.hookFont.weight}
                    fontSize={slab.fontSize}
                  >
                    {props.lines[index]}
                  </text>
                </g>
              </g>
            );
          })}
          {measured.layout.tag && props.tag ? (
            <g filter="url(#tag-shadow)">
              <rect
                x={measured.layout.tag.x}
                y={measured.layout.tag.y}
                width={measured.layout.tag.width}
                height={measured.layout.tag.height}
                fill={colors.accent}
              />
              <text
                x={measured.layout.tag.textX}
                y={measured.layout.tag.textY}
                fill={colors.accentText}
                fontFamily={fontStack(props.tagFont, 'monospace')}
                fontWeight={props.tagFont.weight}
                fontSize={measured.layout.tag.fontSize}
              >
                {props.tag}
              </text>
            </g>
          ) : null}
        </svg>
      ) : null}
    </AbsoluteFill>
  );
}
