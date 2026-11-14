/**
 * Pure layout math for the Thumbnail composition. No DOM access: the
 * composition measures glyphs in the browser and hands the metrics in, so the
 * same metrics always give the same boxes. The CLI and the tests import the
 * parsing and colour helpers from here too.
 */

export const THUMBNAIL_WIDTH = 1280;
export const THUMBNAIL_HEIGHT = 720;

/** Thumbnail sizes: 16:9 for the main video, 9:16 for a Short. */
export const THUMBNAIL_FORMATS = {
  '16x9': { width: THUMBNAIL_WIDTH, height: THUMBNAIL_HEIGHT },
  '9x16': { width: 1080, height: 1920 },
} as const;
export type ThumbnailFormat = keyof typeof THUMBNAIL_FORMATS;
export const THUMBNAIL_FORMAT_IDS = Object.keys(THUMBNAIL_FORMATS) as ThumbnailFormat[];

export interface FrameSize {
  width: number;
  height: number;
}

/** Width and height of a thumbnail format. */
export function thumbnailSize(format: ThumbnailFormat = '16x9'): FrameSize {
  return THUMBNAIL_FORMATS[format];
}

/**
 * Vertical (Short) zones as fractions of the height. The bottom 15 % is
 * covered by the Shorts UI (title, channel, buttons); grid views crop the
 * frame to its central square.
 */
export const SHORT_UI_TOP = 0.85;
export const VERTICAL_TEXT_TOP = 0.5;

/** The central square of a vertical frame, which grid views show. */
export function centralSquare(frame: FrameSize): { top: number; bottom: number } {
  const side = Math.min(frame.width, frame.height);
  const top = (frame.height - side) / 2;
  return { top, bottom: top + side };
}
/** YouTube's upload limit for a custom thumbnail. */
export const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
export const THUMBNAIL_MAX_LINES = 3;
export const THUMBNAIL_MAX_WORDS = 4;

export const THUMBNAIL_LAYOUTS = ['left', 'right', 'bottom'] as const;
/** Where the text sits; the face goes on the opposite side (or above, for `bottom`). */
export type ThumbnailLayout = (typeof THUMBNAIL_LAYOUTS)[number];

/** Slab padding as a fraction of the font size. */
const PAD_X = 0.18;
const PAD_Y = 0.1;
/** Stacked slabs overlap by this many pixels. */
const ROW_OVERLAP = 4;
/** Side-by-side slabs (bottom layout) overlap by this many pixels. */
const COLUMN_OVERLAP = 10;
const MARGIN = 44;
const STACK_MAX_WIDTH = 600;
const STACK_MAX_SIZE = 220;
const BOTTOM_MAX_SIZE = 150;
const TILT_DEGREES = 2;
const TAG_SIZE = 26;
const TAG_PAD_X = 14;
const TAG_PAD_Y = 9;
const TAG_MARGIN = 22;
const VERTICAL_MARGIN = 48;
const VERTICAL_MAX_SIZE = 180;
/** Gap between the bottom slab and the Shorts UI zone. */
const VERTICAL_UI_GAP = 24;
/** Alternate rows of the vertical stack step this far left and right. */
const VERTICAL_STEP = 16;
/** Below this font size a hook is no longer readable at 320x180 (a quarter of 1280x720). */
export const MIN_READABLE_SIZE = 88;

/** Glyph metrics of one line at a font size of 100 px (canvas `measureText` bounding box). */
export interface LineMetrics {
  /** Distance from the text origin to the left edge of the ink (actualBoundingBoxLeft). */
  left: number;
  /** Ink width (actualBoundingBoxLeft + actualBoundingBoxRight). */
  width: number;
  ascent: number;
  descent: number;
}

/** One slab: a solid box with one line of text, rotated about its centre. */
export interface SlabBox {
  x: number;
  y: number;
  width: number;
  height: number;
  /** Text origin (start of the baseline). */
  textX: number;
  textY: number;
  fontSize: number;
  /** Degrees, clockwise. */
  rotate: number;
}

export interface TagBox {
  x: number;
  y: number;
  width: number;
  height: number;
  textX: number;
  textY: number;
  fontSize: number;
}

export interface ThumbnailLayoutResult {
  fontSize: number;
  slabs: SlabBox[];
  tag?: TagBox;
}

/**
 * Split `--text` into lines: `|` separates lines, each line is trimmed and set
 * in capitals. At most three lines of at most four words each.
 */
export function parseThumbnailText(text: string): string[] {
  const lines = text
    .split('|')
    .map((line) => line.trim().replace(/\s+/g, ' '))
    .filter((line) => line.length > 0)
    .map((line) => line.toUpperCase());
  if (lines.length === 0) throw new Error('The thumbnail text is empty.');
  if (lines.length > THUMBNAIL_MAX_LINES) {
    throw new Error(`The thumbnail text has ${lines.length} lines; use at most ${THUMBNAIL_MAX_LINES} (separate lines with "|").`);
  }
  for (const line of lines) {
    const words = line.split(' ').filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
    if (words > THUMBNAIL_MAX_WORDS) {
      throw new Error(`"${line}" has ${words} words; use at most ${THUMBNAIL_MAX_WORDS} per line.`);
    }
  }
  return lines;
}

/** Parse `--focus x,y` (fractions of the still, 0–1). */
export function parseFocus(value: string | undefined): { x: number; y: number } {
  if (value === undefined) return { x: 0.5, y: 0.4 };
  const parts = value.split(',').map((part) => Number(part.trim()));
  const [x, y] = parts;
  if (parts.length !== 2 || x === undefined || y === undefined || ![x, y].every((n) => Number.isFinite(n) && n >= 0 && n <= 1)) {
    throw new Error(`Invalid focus "${value}". Use two fractions of the still, e.g. 0.6,0.35.`);
  }
  return { x, y };
}

/** Where the focus point of the still lands: the middle of the side opposite the text (upper middle for 9:16). */
export function faceAnchor(layout: ThumbnailLayout, format: ThumbnailFormat = '16x9'): { x: number; y: number } {
  if (format === '9x16') {
    const frame = thumbnailSize(format);
    return { x: frame.width * 0.5, y: frame.height * 0.32 };
  }
  if (layout === 'left') return { x: THUMBNAIL_WIDTH * 0.72, y: THUMBNAIL_HEIGHT * 0.42 };
  if (layout === 'right') return { x: THUMBNAIL_WIDTH * 0.28, y: THUMBNAIL_HEIGHT * 0.42 };
  return { x: THUMBNAIL_WIDTH * 0.5, y: THUMBNAIL_HEIGHT * 0.36 };
}

/**
 * Scale the still to cover the frame (times `zoom`) and move its focus point
 * as close to `anchor` as the frame allows, without uncovering an edge.
 */
export function coverPlacement(
  source: { width: number; height: number },
  focus: { x: number; y: number },
  zoom: number,
  anchor: { x: number; y: number },
  frame: FrameSize = thumbnailSize('16x9'),
): { left: number; top: number; width: number; height: number } {
  const scale = Math.max(frame.width / source.width, frame.height / source.height) * Math.max(1, zoom);
  const width = source.width * scale;
  const height = source.height * scale;
  const clamp = (value: number, min: number) => Math.min(0, Math.max(min, value));
  return {
    left: clamp(anchor.x - focus.x * width, frame.width - width),
    top: clamp(anchor.y - focus.y * height, frame.height - height),
    width,
    height,
  };
}

function slabSize(metrics: LineMetrics, size: number): { width: number; height: number } {
  const k = size / 100;
  return {
    width: metrics.width * k + 2 * PAD_X * size,
    height: (metrics.ascent + metrics.descent) * k + 2 * PAD_Y * size,
  };
}

function slabAt(metrics: LineMetrics, size: number, x: number, y: number, rotate: number): SlabBox {
  const k = size / 100;
  const { width, height } = slabSize(metrics, size);
  return {
    x,
    y,
    width,
    height,
    textX: x + PAD_X * size + metrics.left * k,
    textY: y + PAD_Y * size + metrics.ascent * k,
    fontSize: size,
    rotate,
  };
}

/** The largest font size (whole pixels) at which `fits` holds, from `max` down to 1. */
function largestSize(max: number, fits: (size: number) => boolean): number {
  let size = Math.floor(max);
  while (size > 1 && !fits(size)) size -= 1;
  return size;
}

function tagBox(metrics: LineMetrics | undefined, layout: ThumbnailLayout, format: ThumbnailFormat = '16x9'): TagBox | undefined {
  if (!metrics) return undefined;
  const k = TAG_SIZE / 100;
  const width = metrics.width * k + 2 * TAG_PAD_X;
  const height = (metrics.ascent + metrics.descent) * k + 2 * TAG_PAD_Y;
  const frame = thumbnailSize(format);
  // The tag sits in a top corner on the face side, away from the hook; on 9:16 below the top UI.
  const x = format === '16x9' && layout === 'right' ? TAG_MARGIN : frame.width - (format === '9x16' ? VERTICAL_MARGIN : TAG_MARGIN) - width;
  const y = format === '9x16' ? Math.round(frame.height * 0.09) : TAG_MARGIN;
  return { x, y, width, height, textX: x + TAG_PAD_X + metrics.left * k, textY: y + TAG_PAD_Y + metrics.ascent * k, fontSize: TAG_SIZE };
}

/**
 * Lay out the hook slabs and the tag.
 *
 * - `left` / `right`: the lines stack on that side, one shared font size that
 *   fits the widest line into 600 px and the stack into the frame height;
 *   slabs tilt 2° and step in a little on every other row.
 * - `bottom`: the lines sit side by side along the bottom edge, untilted,
 *   centred, with a slight vertical stagger.
 * - 9:16 (any layout): see `layoutVertical`.
 */
export function layoutThumbnail(
  lines: LineMetrics[],
  layout: ThumbnailLayout,
  tag?: LineMetrics,
  format: ThumbnailFormat = '16x9',
): ThumbnailLayoutResult {
  if (lines.length === 0) return { fontSize: 0, slabs: [], tag: tagBox(tag, layout, format) };
  if (format === '9x16') return layoutVertical(lines, layout, tag);

  if (layout === 'bottom') {
    const maxWidth = THUMBNAIL_WIDTH - 2 * MARGIN;
    const rowWidth = (size: number) =>
      lines.reduce((sum, metrics) => sum + slabSize(metrics, size).width, 0) - COLUMN_OVERLAP * (lines.length - 1);
    const size = largestSize(BOTTOM_MAX_SIZE, (candidate) => rowWidth(candidate) <= maxWidth);
    const height = Math.max(...lines.map((metrics) => slabSize(metrics, size).height));
    let x = (THUMBNAIL_WIDTH - rowWidth(size)) / 2;
    const baseY = THUMBNAIL_HEIGHT - height - 14;
    const slabs = lines.map((metrics, index) => {
      const slab = slabAt(metrics, size, x, baseY + (index % 2 === 0 ? 6 : -4), 0);
      x += slab.width - COLUMN_OVERLAP;
      return slab;
    });
    return { fontSize: size, slabs, tag: tagBox(tag, layout) };
  }

  const maxHeight = THUMBNAIL_HEIGHT - 2 * 64;
  const stackHeight = (size: number) =>
    lines.reduce((sum, metrics) => sum + slabSize(metrics, size).height, 0) - ROW_OVERLAP * (lines.length - 1);
  const size = largestSize(
    STACK_MAX_SIZE,
    (candidate) =>
      lines.every((metrics) => slabSize(metrics, candidate).width <= STACK_MAX_WIDTH) &&
      stackHeight(candidate) <= maxHeight,
  );
  // Optically centred: a little above the middle.
  let y = Math.max(64, ((THUMBNAIL_HEIGHT - stackHeight(size)) / 2) * 0.8);
  const rotate = layout === 'left' ? -TILT_DEGREES : TILT_DEGREES;
  const slabs = lines.map((metrics, index) => {
    const { width } = slabSize(metrics, size);
    const inset = MARGIN + (index % 2) * 14;
    const x = layout === 'left' ? inset : THUMBNAIL_WIDTH - inset - width;
    const slab = slabAt(metrics, size, x, y, rotate);
    y += slab.height - ROW_OVERLAP;
    return slab;
  });
  return { fontSize: size, slabs, tag: tagBox(tag, layout) };
}

/**
 * The 9:16 layout of a Short thumbnail: the lines stack centred in the lower
 * part of the frame, above the bottom 15 % that the Shorts UI covers and
 * below the middle, at one shared font size that fits the widest line. The
 * first line always lies inside the central square, so the hook survives a
 * square crop; the face sits above it.
 */
export function layoutVertical(lines: LineMetrics[], layout: ThumbnailLayout, tag?: LineMetrics): ThumbnailLayoutResult {
  const frame = thumbnailSize('9x16');
  const zoneTop = frame.height * VERTICAL_TEXT_TOP;
  const zoneBottom = frame.height * SHORT_UI_TOP - VERTICAL_UI_GAP;
  const maxWidth = frame.width - 2 * VERTICAL_MARGIN - VERTICAL_STEP;
  const stackHeight = (size: number) =>
    lines.reduce((sum, metrics) => sum + slabSize(metrics, size).height, 0) - ROW_OVERLAP * (lines.length - 1);
  const size = largestSize(
    VERTICAL_MAX_SIZE,
    (candidate) =>
      lines.every((metrics) => slabSize(metrics, candidate).width <= maxWidth) && stackHeight(candidate) <= zoneBottom - zoneTop,
  );
  // Bottom-aligned above the UI zone, then lifted until the first slab is inside the central square.
  const square = centralSquare(frame);
  const firstHeight = slabSize(lines[0]!, size).height;
  let y = zoneBottom - stackHeight(size);
  if (y + firstHeight > square.bottom) y = Math.max(zoneTop, square.bottom - firstHeight);
  const slabs = lines.map((metrics, index) => {
    const { width } = slabSize(metrics, size);
    const step = index % 2 === 0 ? -VERTICAL_STEP / 2 : VERTICAL_STEP / 2;
    const slab = slabAt(metrics, size, (frame.width - width) / 2 + step, y, -TILT_DEGREES);
    y += slab.height - ROW_OVERLAP;
    return slab;
  });
  return { fontSize: size, slabs, tag: tagBox(tag, layout, '9x16') };
}

function channel(value: number): number {
  const c = value / 255;
  return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** WCAG relative luminance of a #rrggbb colour. */
export function relativeLuminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  return 0.2126 * channel((value >> 16) & 255) + 0.7152 * channel((value >> 8) & 255) + 0.0722 * channel(value & 255);
}

/** WCAG contrast ratio of two #rrggbb colours (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * The first candidate with at least 4.5:1 contrast on `background`; if none
 * reaches it, the candidate with the highest contrast (white and black are
 * always tried last).
 */
export function readableOn(background: string, candidates: string[]): string {
  const all = [...candidates, '#ffffff', '#000000'];
  return all.find((color) => contrastRatio(color, background) >= 4.5) ??
    all.reduce((best, color) => (contrastRatio(color, background) > contrastRatio(best, background) ? color : best));
}
