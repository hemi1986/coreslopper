import { describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadProject } from '@coreslopper/core';
import {
  SHORT_UI_TOP,
  VERTICAL_TEXT_TOP,
  centralSquare,
  coverPlacement,
  faceAnchor,
  layoutThumbnail,
  thumbnailSize,
  type LineMetrics,
} from '../packages/remotion/src/lib/thumbnail.ts';
import { buildThumbnailProps } from '../packages/cli/src/thumbnail.ts';
import { thumbnailProblems } from '../packages/cli/src/thumbnail-files.ts';
import {
  listShorts,
  parseUploadText,
  shortName,
  shortPaths,
  shortProblems,
  uploadTextProblems,
} from '../packages/cli/src/release-files.ts';
import { parseTimePoint, shortFadeFilter, shortFfmpegArgs, shortWindow } from '../packages/cli/src/short.ts';
import { checkShorts, checkUploadText } from '../packages/cli/src/qa.ts';

const demoDir = join(process.cwd(), 'projects/demo');
const metrics = (text: string): LineMetrics => ({ left: 0, width: text.length * 50, ascent: 72, descent: 0 });

/** A minimal JPEG header (SOI, APP0, SOF0) with the given size. */
function jpegHeader(width: number, height: number): Buffer {
  const app0 = [0xff, 0xe0, 0x00, 0x04, 0x00, 0x00];
  const sof0 = [0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 255, width >> 8, width & 255, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0];
  return Buffer.from([0xff, 0xd8, ...app0, ...sof0]);
}

describe('Short time points', () => {
  it('parses seconds and every anchor kind', () => {
    expect(parseTimePoint('42.5')).toEqual({ type: 'time', seconds: 42.5 });
    expect(parseTimePoint('section:chorus_1')).toEqual({ type: 'section', id: 'chorus_1', edge: 'start', offset: 0 });
    expect(parseTimePoint('section:chorus_1:end-0.5')).toEqual({ type: 'section', id: 'chorus_1', edge: 'end', offset: -0.5 });
    expect(parseTimePoint('line:l2:end')).toEqual({ type: 'line', id: 'l2', edge: 'end', offset: 0 });
    expect(parseTimePoint('word:l3:2:start+0.1')).toEqual({ type: 'word', line: 'l3', index: 2, edge: 'start', offset: 0.1 });
    expect(parseTimePoint('beat:64+0.25')).toEqual({ type: 'beat', index: 64, offset: 0.25 });
    expect(parseTimePoint('downbeat:3')).toEqual({ type: 'downbeat', index: 3, offset: 0 });
  });

  it('keeps ids with dashes whole', () => {
    expect(parseTimePoint('line:l-12')).toEqual({ type: 'line', id: 'l-12', edge: 'start', offset: 0 });
    expect(parseTimePoint('section:drop-2:end+1')).toEqual({ type: 'section', id: 'drop-2', edge: 'end', offset: 1 });
  });

  it('rejects malformed points', () => {
    for (const value of ['', 'chorus', 'section:', 'section:a:middle', 'beat:x', 'word:l1', 'bar:4', '-3']) {
      expect(() => parseTimePoint(value), value).toThrow(/Invalid time/);
    }
  });
});

describe('Short window', () => {
  it('resolves anchors against the demo timing and snaps to frames', async () => {
    const { effectiveTiming } = await loadProject(demoDir);
    const window = shortWindow('section:verse_1', 'section:chorus_1:end+0.51', effectiveTiming, 30);
    const verse = effectiveTiming!.sections.find((section) => section.id === 'verse_1')!;
    const chorus = effectiveTiming!.sections.find((section) => section.id === 'chorus_1')!;
    expect(window.start).toBeCloseTo(verse.start);
    expect(window.end).toBeCloseTo(Math.round((chorus.end + 0.51) * 30) / 30);
    expect(Math.round(window.duration * 30)).toBeCloseTo(window.duration * 30, 6);
    expect(window.warnings[0]).toMatch(/outside the 30–50 s target/);
  });

  it('accepts a 30–50 s window without warnings and guards 60 s', () => {
    expect(shortWindow('10', '50', undefined, 30)).toMatchObject({ start: 10, end: 50, duration: 40, warnings: [] });
    expect(shortWindow('0', '60', undefined, 30).duration).toBe(60);
    expect(() => shortWindow('0', '60.1', undefined, 30)).toThrow(/limit is 60 s/);
    expect(() => shortWindow('20', '20', undefined, 30)).toThrow(/ends before it starts/);
    expect(() => shortWindow('section:intro', '30', undefined, 30)).toThrow(/no timing\.json/);
  });

  it('builds a frame-accurate re-encode with volume fades and six threads', () => {
    const args = shortFfmpegArgs('in.mp4', 'out.mp4', { start: 12.3456, duration: 36 }, 30);
    expect(args.slice(args.indexOf('-ss'), args.indexOf('-ss') + 4)).toEqual(['-ss', '12.346', '-i', 'in.mp4']);
    expect(args[args.indexOf('-frames:v') + 1]).toBe('1080');
    expect(args[args.indexOf('-threads') + 1]).toBe('6');
    expect(args[args.indexOf('-crf') + 1]).toBe('18');
    expect(args[args.indexOf('-b:a') + 1]).toBe('192k');
    expect(args.at(-1)).toBe('out.mp4');
    const filter = shortFadeFilter(36);
    expect(filter).toContain("volume='min(1,t/0.15)*min(1,max(0,(36.000-t)/0.4))':eval=frame");
    expect(filter).not.toContain('afade');
  });
});

describe('Short files', () => {
  it('names videos and thumbnails in renders/shorts/', () => {
    expect(shortName('Z1-intro-9x16.mp4')).toBe('Z1-intro');
    expect(shortName('9x16.mp4')).toBeUndefined();
    expect(shortPaths('/r', 'Z1-intro')).toEqual({ video: '/r/shorts/Z1-intro-9x16.mp4', thumbnail: '/r/shorts/Z1-intro-thumb.jpg' });
  });

  it('flags a wrong aspect or a Short over 60 s', () => {
    expect(shortProblems({ name: 'a', width: 1080, height: 1920, duration: 45 })).toEqual([]);
    expect(shortProblems({ name: 'a', width: 1920, height: 1080, duration: 45 })[0]).toMatch(/expected 9:16/);
    expect(shortProblems({ name: 'a', width: 720, height: 1280, duration: 61 })[0]).toMatch(/limit 60 s/);
  });

  it('checks Shorts and their thumbnails in qa', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coreslopper-shorts-'));
    const renders = join(root, 'renders');
    await mkdir(join(renders, 'shorts'), { recursive: true });
    for (const name of ['A1-hook', 'A2-chorus']) await writeFile(shortPaths(renders, name).video, '');
    await writeFile(shortPaths(renders, 'A1-hook').thumbnail, jpegHeader(1080, 1920));
    const probe = () => ({ width: 1080, height: 1920, duration: 40 });

    let result = await checkShorts(renders, root, probe);
    expect(await listShorts(renders)).toHaveLength(2);
    expect(result.names).toEqual(['A1-hook', 'A2-chorus']);
    expect(result.checks.map((check) => check.result)).toEqual(['WARN', 'WARN']);
    expect(result.checks[1]!.evidence).toMatch(/A2-chorus/);

    await writeFile(shortPaths(renders, 'A3-drop').video, '');
    await writeFile(shortPaths(renders, 'A2-chorus').thumbnail, jpegHeader(1080, 1920));
    await writeFile(shortPaths(renders, 'A3-drop').thumbnail, jpegHeader(1280, 720));
    result = await checkShorts(renders, root, probe);
    expect(result.checks.map((check) => check.result)).toEqual(['PASS', 'FAIL']);

    result = await checkShorts(renders, root, () => ({ width: 1920, height: 1080, duration: 70 }));
    expect(result.checks[0]!.result).toBe('FAIL');
  });
});

describe('9:16 thumbnail layout', () => {
  const frame = thumbnailSize('9x16');
  const square = centralSquare(frame);

  it('keeps the hook in the lower part, above the Shorts UI, with the first line in the central square', () => {
    for (const words of [['NEON'], ['ZUKUNFT', 'AUF KREDIT'], ['EIN KLICK', 'UND', 'AUS!'], ['AUSSERORDENTLICH', 'SCHULDENBREMSE']]) {
      const layout = layoutThumbnail(words.map(metrics), 'bottom', metrics('SATIRE'), '9x16');
      expect(new Set(layout.slabs.map((slab) => slab.fontSize)).size).toBe(1);
      for (const slab of layout.slabs) {
        expect(slab.x).toBeGreaterThanOrEqual(0);
        expect(slab.x + slab.width).toBeLessThanOrEqual(frame.width);
        expect(slab.y).toBeGreaterThanOrEqual(frame.height * VERTICAL_TEXT_TOP - 1e-9);
        expect(slab.y + slab.height).toBeLessThanOrEqual(frame.height * SHORT_UI_TOP);
      }
      const first = layout.slabs[0]!;
      expect(first.y).toBeGreaterThanOrEqual(square.top);
      expect(first.y + first.height).toBeLessThanOrEqual(square.bottom + 1e-9);
      expect(layout.tag!.y).toBeGreaterThan(frame.height * 0.05);
      expect(layout.tag!.x + layout.tag!.width).toBeLessThanOrEqual(frame.width);
    }
  });

  it('centres the stack and keeps the font large for short hooks', () => {
    const layout = layoutThumbnail(['NEON', 'RAIN'].map(metrics), 'bottom', undefined, '9x16');
    for (const slab of layout.slabs) expect(Math.abs(slab.x + slab.width / 2 - frame.width / 2)).toBeLessThanOrEqual(8);
    expect(layout.fontSize).toBeGreaterThanOrEqual(150);
    expect(layoutThumbnail(['NEON'].map(metrics), 'bottom', undefined, '9x16')).toEqual(
      layoutThumbnail(['NEON'].map(metrics), 'bottom', undefined, '9x16'),
    );
  });

  it('puts the face in the upper middle and covers the vertical frame', () => {
    const anchor = faceAnchor('bottom', '9x16');
    expect(anchor.x).toBe(frame.width / 2);
    expect(anchor.y).toBeGreaterThan(square.top);
    expect(anchor.y).toBeLessThan(frame.height / 2);
    const box = coverPlacement({ width: 1920, height: 1080 }, { x: 0.7, y: 0.4 }, 1, anchor, frame);
    expect(box.height).toBeGreaterThanOrEqual(frame.height - 1e-9);
    expect(box.left + box.width).toBeGreaterThanOrEqual(frame.width - 1e-9);
    expect(box.left + 0.7 * box.width).toBeCloseTo(anchor.x);
  });

  it('builds 9x16 props and refuses a side layout', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-thumb9-'));
    const still = join(dir, 'still.svg');
    await writeFile(still, '<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1920"><rect width="1080" height="1920" fill="#0d0d24"/></svg>');
    const { props } = await buildThumbnailProps({ projectDir: demoDir, still, text: 'Neon|Rain', format: '9x16', out: 'x.jpg' });
    expect(props.format).toBe('9x16');
    expect(props.layout).toBe('bottom');
    await expect(buildThumbnailProps({ projectDir: demoDir, still, text: 'A', format: '9x16', layout: 'left', out: 'x.jpg' })).rejects.toThrow(
      /fixed vertical layout/,
    );
    await expect(buildThumbnailProps({ projectDir: demoDir, still, text: 'A', format: '4x5', out: 'x.jpg' })).rejects.toThrow(/format/);
  });

  it('checks the JPEG size per format', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'coreslopper-thumb9-'));
    const path = join(dir, 'a.jpg');
    await writeFile(path, jpegHeader(1080, 1920));
    expect(await thumbnailProblems(path, '9x16')).toEqual([]);
    expect((await thumbnailProblems(path))[0]).toMatch(/expected 1280x720/);
  });
});

const UPLOAD = `# Upload-Paket — Neon Rain

## Hauptvideo

**Datei:** \`renders/16x9.mp4\`
**Titel:** Neon Rain (Musikvideo)

**Beschreibung:**

Regen auf Neon, eine Stadt, die nicht schläft.

🎬 Produziert mit coreslopper.

#NeonRain #Synthwave

**Tags:** Neon Rain, Synthwave, Musikvideo

## Shorts

### D1 — Refrain (36,0 s)

**Datei:** \`renders/shorts/D1-chorus-9x16.mp4\`
**Thumbnail:** \`renders/shorts/D1-chorus-thumb.jpg\`
**Titel:** Regen auf Neon. 🌧️ #synthwave #shorts

**Beschreibung:**
Die Stadt glüht, der Bass setzt ein. 🌧️
Ganzes Video: Link oben ☝️

#NeonRain #Synthwave #shorts

- [ ] Verwandtes Video = Hauptvideo
- [ ] „Veränderte oder synthetische Inhalte“: Ja
- [ ] Nicht speziell für Kinder
`;

describe('upload text', () => {
  it('parses the main video and each Short, in the project language', () => {
    const text = parseUploadText(UPLOAD);
    expect(text.main).toMatchObject({ heading: 'Hauptvideo', title: 'Neon Rain (Musikvideo)', tags: 'Neon Rain, Synthwave, Musikvideo' });
    expect(text.main!.description).toContain('Regen auf Neon');
    expect(text.main!.description).not.toContain('#NeonRain');
    expect(text.main!.hashtags).toEqual(['#NeonRain', '#Synthwave']);
    expect(text.shorts).toHaveLength(1);
    expect(text.shorts[0]).toMatchObject({ heading: 'D1 — Refrain (36,0 s)', checklist: 3 });
    expect(text.shorts[0]!.description).toContain('Link oben');
  });

  it('warns about missing Shorts and unmentioned files, and fails on missing fields', () => {
    let problems = uploadTextProblems(parseUploadText(UPLOAD), UPLOAD, ['D1-chorus', 'D2-drop']);
    expect(problems.errors).toEqual([]);
    expect(problems.warnings).toEqual(['1 of 3 Shorts described', 'D2-drop-9x16.mp4 is not mentioned']);

    const broken = UPLOAD.replace('**Titel:** Regen auf Neon. 🌧️ #synthwave #shorts', '').replace('**Tags:** Neon Rain, Synthwave, Musikvideo', '');
    problems = uploadTextProblems(parseUploadText(broken), broken, ['D1-chorus']);
    expect(problems.errors).toEqual(['main video "Hauptvideo" lacks tags', 'Short "D1 — Refrain (36,0 s)" lacks title']);

    const english = UPLOAD.replace('**Titel:** Regen auf Neon. 🌧️ #synthwave #shorts', '**Title:** Neon rain.')
      .replaceAll('Titel', 'Title')
      .replaceAll('Beschreibung', 'Description');
    problems = uploadTextProblems(parseUploadText(english), english, ['D1-chorus']);
    expect(problems.errors).toEqual([]);
    expect(problems.warnings).toContain('Short "D1 — Refrain (36,0 s)": title without #shorts');
  });

  it('reports the upload text in qa: WARN when missing, FAIL when broken', async () => {
    const root = await mkdtemp(join(tmpdir(), 'coreslopper-upload-'));
    const review = join(root, 'review');
    await mkdir(review);
    expect((await checkUploadText(review, root, [])).result).toBe('WARN');
    await writeFile(join(review, 'upload.md'), '# Upload\n\n## Main\n\n**Title:** x\n');
    expect((await checkUploadText(review, root, [])).result).toBe('FAIL');
    await writeFile(join(review, 'upload.md'), UPLOAD);
    expect((await checkUploadText(review, root, ['D1-chorus'])).result).toBe('WARN');
  });
});
