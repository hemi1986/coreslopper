import { describe, expect, it } from 'vitest';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '@coreslopper/core';
import {
  THUMBNAIL_HEIGHT,
  THUMBNAIL_WIDTH,
  contrastRatio,
  coverPlacement,
  faceAnchor,
  layoutThumbnail,
  parseFocus,
  parseThumbnailText,
  readableOn,
  type LineMetrics,
} from '../packages/remotion/src/lib/thumbnail.ts';
import { buildThumbnailProps, thumbnailColors } from '../packages/cli/src/thumbnail.ts';
import { jpegSize } from '../packages/cli/src/thumbnail-files.ts';

const demoDir = join(process.cwd(), 'projects/demo');

/** Condensed caps at 100 px: about 50 px per character. */
const metrics = (text: string): LineMetrics => ({ left: 0, width: text.length * 50, ascent: 72, descent: 0 });

async function fixtureStill(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'coreslopper-thumb-'));
  const path = join(dir, 'still.svg');
  await writeFile(
    path,
    '<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080"><rect width="1920" height="1080" fill="#0d0d24"/><circle cx="1300" cy="420" r="220" fill="#ff2a6d"/></svg>',
  );
  return path;
}

describe('thumbnail text', () => {
  it('splits on | and sets capitals', () => {
    expect(parseThumbnailText(' Zukunft | auf  Kredit ')).toEqual(['ZUKUNFT', 'AUF KREDIT']);
  });

  it('rejects more than three lines or four words per line', () => {
    expect(() => parseThumbnailText('a|b|c|d')).toThrow(/at most 3/);
    expect(() => parseThumbnailText('one two three four five')).toThrow(/at most 4/);
    expect(() => parseThumbnailText(' | ')).toThrow(/empty/);
  });

  it('does not count a dash as a word', () => {
    expect(parseThumbnailText('ein klick – und aus')).toEqual(['EIN KLICK – UND AUS']);
  });
});

describe('focus and placement', () => {
  it('parses fractions and rejects anything else', () => {
    expect(parseFocus(undefined)).toEqual({ x: 0.5, y: 0.4 });
    expect(parseFocus('0.6, 0.3')).toEqual({ x: 0.6, y: 0.3 });
    expect(() => parseFocus('1.2,0.3')).toThrow();
    expect(() => parseFocus('0.5')).toThrow();
  });

  it('covers the frame and never uncovers an edge', () => {
    for (const source of [
      { width: 1920, height: 1080 },
      { width: 1080, height: 1920 },
      { width: 1664, height: 928 },
    ]) {
      for (const focus of [{ x: 0, y: 0 }, { x: 1, y: 1 }, { x: 0.5, y: 0.4 }]) {
        const box = coverPlacement(source, focus, 1.3, faceAnchor('left'));
        expect(box.left).toBeLessThanOrEqual(0);
        expect(box.top).toBeLessThanOrEqual(0);
        expect(box.left + box.width).toBeGreaterThanOrEqual(THUMBNAIL_WIDTH - 1e-9);
        expect(box.top + box.height).toBeGreaterThanOrEqual(THUMBNAIL_HEIGHT - 1e-9);
      }
    }
  });

  it('moves the focus point onto the face side when the still allows it', () => {
    const anchor = faceAnchor('left');
    const box = coverPlacement({ width: 1920, height: 1080 }, { x: 0.5, y: 0.5 }, 1.5, anchor);
    expect(box.left + 0.5 * box.width).toBeCloseTo(anchor.x);
    expect(faceAnchor('right').x).toBeLessThan(THUMBNAIL_WIDTH / 2);
  });
});

describe('slab layout', () => {
  const inFrame = (box: { x: number; y: number; width: number; height: number }) =>
    box.x >= 0 && box.y >= 0 && box.x + box.width <= THUMBNAIL_WIDTH && box.y + box.height <= THUMBNAIL_HEIGHT;

  it('stacks lines on the text side with one shared size and a tilt', () => {
    const lines = ['ZUKUNFT', 'AUF', 'KREDIT'].map(metrics);
    const left = layoutThumbnail(lines, 'left', metrics('SATIRE'));
    expect(left.slabs).toHaveLength(3);
    expect(new Set(left.slabs.map((slab) => slab.fontSize)).size).toBe(1);
    for (const slab of left.slabs) {
      expect(inFrame(slab)).toBe(true);
      expect(slab.x + slab.width).toBeLessThanOrEqual(THUMBNAIL_WIDTH / 2 + 50);
      expect(slab.rotate).toBe(-2);
    }
    expect(left.tag!.x).toBeGreaterThan(THUMBNAIL_WIDTH / 2);

    const right = layoutThumbnail(lines, 'right', metrics('SATIRE'));
    for (const slab of right.slabs) {
      expect(slab.x).toBeGreaterThanOrEqual(THUMBNAIL_WIDTH / 2 - 50);
      expect(slab.rotate).toBe(2);
    }
    expect(right.tag!.x).toBeLessThan(THUMBNAIL_WIDTH / 2);
  });

  it('shrinks long lines to fit 600 px and keeps the stack inside the frame', () => {
    const layout = layoutThumbnail(['AUSSERORDENTLICH', 'BUNDESHAUSHALT', 'SCHULDENBREMSE'].map(metrics), 'left');
    for (const slab of layout.slabs) {
      expect(slab.width).toBeLessThanOrEqual(600);
      expect(inFrame(slab)).toBe(true);
    }
  });

  it('sets bottom lines side by side, untilted, centred', () => {
    const layout = layoutThumbnail(['ZUKUNFT', 'AUF KREDIT'].map(metrics), 'bottom');
    const [a, b] = layout.slabs;
    expect(b!.x).toBeGreaterThan(a!.x + a!.width - 20);
    expect(layout.slabs.every((slab) => slab.rotate === 0 && inFrame(slab))).toBe(true);
    const span = b!.x + b!.width - a!.x;
    expect(a!.x).toBeCloseTo((THUMBNAIL_WIDTH - span) / 2);
  });

  it('is a pure function of its metrics', () => {
    const lines = ['EIN KLICK –', 'UND AUS!'].map(metrics);
    expect(layoutThumbnail(lines, 'right')).toEqual(layoutThumbnail(lines, 'right'));
  });
});

describe('thumbnail colours', () => {
  it('computes WCAG contrast', () => {
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21);
    expect(contrastRatio('#0E1A33', '#C9A43A')).toBeGreaterThan(7);
  });

  it('picks the first readable candidate, else the best', () => {
    expect(readableOn('#C9A43A', ['#0E1A33'])).toBe('#0E1A33');
    // Navy on red fails; stage black on red fails; white passes.
    expect(readableOn('#E5192E', ['#0E1A33', '#06080E', '#FFFFFF'])).toBe('#FFFFFF');
  });

  it('maps palette roles and keys, and rejects unknown accents', async () => {
    const style = {
      palette: { stage_black: '#06080E', navy: '#0E1A33', slide_white: '#FFFFFF', pomp_gold: '#C9A43A', error_red: '#E5192E' },
      roles: { background: 'stage_black', primary: 'navy', text: 'slide_white', accent: 'pomp_gold' },
    };
    expect(thumbnailColors(style)).toEqual({
      background: '#06080E',
      slab: '#0E1A33',
      slabText: '#FFFFFF',
      accent: '#C9A43A',
      accentText: '#0E1A33',
    });
    expect(thumbnailColors(style, 'error_red').accentText).toBe('#FFFFFF');
    expect(() => thumbnailColors(style, 'neon_green')).toThrow(/not a palette key/);
  });
});

describe('thumbnail props', () => {
  it('builds props for the demo from the style bible and brand kit', async () => {
    const still = await fixtureStill();
    const { props } = await buildThumbnailProps({
      projectDir: demoDir,
      still,
      text: 'Neon|Rain',
      tag: 'demo',
      layout: 'right',
      out: 'unused.jpg',
    });
    const project = await loadProject(demoDir);
    expect(props.lines).toEqual(['NEON', 'RAIN']);
    expect(props.tag).toBe('DEMO');
    expect(props.hookFont.family).toBe(project.style!.typography.display!.family);
    expect(props.hookFont.weight).toBeGreaterThanOrEqual(700);
    expect(props.still).toMatch(/^\.cache\/thumbnail\/demo\/[0-9a-f]{16}\.svg$/);
    expect(props.fonts.length).toBeGreaterThan(0);
  });

  it('rejects an unknown layout, font, or missing still', async () => {
    const still = await fixtureStill();
    await expect(buildThumbnailProps({ projectDir: demoDir, still, text: 'A', layout: 'top', out: 'x.jpg' })).rejects.toThrow(/layout/);
    await expect(buildThumbnailProps({ projectDir: demoDir, still, text: 'A', font: 'hook', out: 'x.jpg' })).rejects.toThrow(/typography/);
    await expect(buildThumbnailProps({ projectDir: demoDir, still: 'missing.png', text: 'A', out: 'x.jpg' })).rejects.toThrow(/not found/);
  });
});

describe('jpegSize', () => {
  it('reads the size from the SOF marker', () => {
    const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
    const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0xd0, 0x05, 0x00, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    const buffer = Buffer.from([0xff, 0xd8, ...app0, ...sof0]);
    expect(jpegSize(buffer)).toEqual({ width: 1280, height: 720 });
    expect(jpegSize(Buffer.from([0x89, 0x50, 0x4e, 0x47]))).toBeUndefined();
  });
});
