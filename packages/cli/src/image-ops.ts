import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { ValidationError, ensureDir } from '@coreslopper/core';
import { imageSize } from './clip-options.js';
import { resolveBinary } from './media.js';

/**
 * Mechanical image and clip steps of the review loop (crop, paste back, sheet,
 * frames, probe), all through the workspace ffmpeg, so a stage runner never
 * builds an ffmpeg or Python one-liner for them.
 */

export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Parse `x,y,w,h`. Four values of at most 1 are fractions of the image; anything
 * else is pixels. The result is in whole pixels inside the image, with even sizes.
 */
export function parseBox(value: string, image: { width: number; height: number }): Box {
  const parts = value.split(',').map((part) => Number(part.trim()));
  if (parts.length !== 4 || parts.some((part) => !Number.isFinite(part) || part < 0)) {
    throw new ValidationError(`Box "${value}" must be x,y,w,h: fractions of the image (0-1) or pixels.`);
  }
  const fractions = parts.every((part) => part <= 1);
  const [x, y, w, h] = fractions
    ? [parts[0]! * image.width, parts[1]! * image.height, parts[2]! * image.width, parts[3]! * image.height]
    : (parts as [number, number, number, number]);
  const left = Math.min(Math.round(x), image.width - 2);
  const top = Math.min(Math.round(y), image.height - 2);
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  const width = even(Math.min(Math.round(w), image.width - left));
  const height = even(Math.min(Math.round(h), image.height - top));
  if (w <= 0 || h <= 0) throw new ValidationError(`Box "${value}" has no area.`);
  return { x: left, y: top, width, height };
}

function ffmpeg(args: string[]): void {
  execFileSync(resolveBinary('ffmpeg'), ['-y', '-v', 'error', '-threads', '6', ...args], { stdio: ['ignore', 'ignore', 'inherit'] });
}

/** Aspect ratios edit models accept (Nano Banana, Qwen, Seedream); a crop is snapped to one of them. */
export const EDIT_ASPECTS: ReadonlyArray<readonly [number, number]> = [
  [1, 1], [4, 5], [5, 4], [3, 4], [4, 3], [2, 3], [3, 2], [9, 16], [16, 9], [21, 9],
];

/**
 * Grow a box to the nearest standard aspect ratio, centred on the old box and
 * kept inside the image, so a cloud edit model returns the crop's shape and the
 * patch pastes back without distortion. Returns the box and its ratio (`w:h`).
 */
export function snapBoxAspect(box: Box, image: { width: number; height: number }): { box: Box; ratio: string } {
  const current = box.width / box.height;
  const fits = EDIT_ASPECTS.filter(([w, h]) => {
    const r = w / h;
    return r >= current ? Math.round(box.height * r) <= image.width : Math.round(box.width / r) <= image.height;
  });
  const [w, h] = (fits.length > 0 ? fits : EDIT_ASPECTS).reduce((best, next) =>
    Math.abs(Math.log(next[0] / next[1] / current)) < Math.abs(Math.log(best[0] / best[1] / current)) ? next : best,
  );
  const ratio = w / h;
  const even = (n: number) => Math.max(2, Math.floor(n / 2) * 2);
  let width = box.width;
  let height = box.height;
  if (ratio >= current) width = Math.min(image.width, even(box.height * ratio));
  else height = Math.min(image.height, even(box.width / ratio));
  const place = (start: number, size: number, grown: number, limit: number) =>
    Math.max(0, Math.min(limit - grown, Math.round(start - (grown - size) / 2)));
  return {
    box: { x: place(box.x, box.width, width, image.width), y: place(box.y, box.height, height, image.height), width, height },
    ratio: `${w}:${h}`,
  };
}

/** The size an edit model should see for a crop: the long side scaled to `target`, in multiples of 16. */
export function editSize(box: Pick<Box, 'width' | 'height'>, target = 1024): { width: number; height: number } {
  const factor = target / Math.max(box.width, box.height);
  const snap = (n: number) => Math.max(16, Math.round((n * factor) / 16) * 16);
  return { width: snap(box.width), height: snap(box.height) };
}

/** Crop a box out of an image, optionally scaled (Lanczos). */
export async function cropImage(
  source: string,
  box: Box,
  output: string,
  scale?: { width: number; height: number },
): Promise<string> {
  await ensureDir(dirname(output));
  const filters = [`crop=${box.width}:${box.height}:${box.x}:${box.y}`];
  if (scale) filters.push(`scale=${scale.width}:${scale.height}:flags=lanczos`);
  ffmpeg(['-i', source, '-vf', filters.join(','), '-frames:v', '1', '-update', '1', output]);
  return output;
}

/**
 * The filtergraph that scales a patch to cover its box (centre-cropped, never
 * stretched) and overlays it on the base with a feathered edge. A side of the box that lies on the image border is not
 * feathered: there is nothing to blend into.
 */
export function pasteFilter(box: Box, image: { width: number; height: number }, feather: number): string {
  const f = Math.max(0, Math.min(feather, Math.floor(Math.min(box.width, box.height) / 2)));
  const sides: string[] = [];
  if (f > 0) {
    if (box.x > 0) sides.push(`(X+1)/${f}`);
    if (box.y > 0) sides.push(`(Y+1)/${f}`);
    if (box.x + box.width < image.width) sides.push(`(W-X)/${f}`);
    if (box.y + box.height < image.height) sides.push(`(H-Y)/${f}`);
  }
  const ramp = sides.reduce((acc, side) => (acc ? `min(${acc},${side})` : side), '');
  const alpha = ramp ? `255*clip(${ramp},0,1)` : '255';
  return (
    `[1:v]scale=${box.width}:${box.height}:force_original_aspect_ratio=increase:flags=lanczos,crop=${box.width}:${box.height},format=rgba,` +
    `geq=r='r(X,Y)':g='g(X,Y)':b='b(X,Y)':a='${alpha}'[patch];` +
    `[0:v][patch]overlay=${box.x}:${box.y}:format=rgb`
  );
}

/** Paste an edited crop back into its box of the base image with a soft edge. */
export async function pasteBack(base: string, patch: string, box: Box, output: string, feather = 24): Promise<string> {
  await ensureDir(dirname(output));
  ffmpeg([
    '-i', base,
    '-i', patch,
    '-filter_complex', pasteFilter(box, imageSize(base), feather),
    '-frames:v', '1', '-update', '1',
    output,
  ]);
  return output;
}

export interface SheetOptions {
  /** Height of every tile in pixels; default 640. */
  height?: number;
  /** Tiles per row; default all in one row, at most 4. */
  columns?: number;
  /** Zoom: crop every image to this box (`x,y,w,h`, fractions or pixels) first. */
  box?: string;
}

/** Layout of a sheet: every image fits a cell of the first image's aspect. */
export function sheetLayout(
  count: number,
  first: { width: number; height: number },
  options: SheetOptions = {},
): { cell: { width: number; height: number }; columns: number; rows: number; positions: string[] } {
  const height = Math.max(64, Math.floor((options.height ?? 640) / 2) * 2);
  const width = Math.max(2, Math.round((height * first.width) / first.height / 2) * 2);
  const columns = Math.max(1, Math.min(count, options.columns ?? Math.min(count, 4)));
  const rows = Math.ceil(count / columns);
  const positions = Array.from({ length: count }, (_, index) => `${(index % columns) * width}_${Math.floor(index / columns) * height}`);
  return { cell: { width, height }, columns, rows, positions };
}

/**
 * Put images side by side on one sheet (left to right, then the next row), so a
 * runner can look at several at once. With `box`, every image is cropped to the
 * same region first: a zoom on one detail.
 */
export async function makeSheet(images: string[], output: string, options: SheetOptions = {}): Promise<string> {
  if (images.length === 0) throw new ValidationError('Pass at least one image.');
  if (images.length > 12) throw new ValidationError('A sheet takes at most 12 images; make two.');
  for (const image of images) if (!existsSync(image)) throw new ValidationError(`Missing image: ${image}`);
  const boxes = images.map((image) => (options.box ? parseBox(options.box, imageSize(image)) : undefined));
  const first = boxes[0] ?? imageSize(images[0]!);
  const layout = sheetLayout(images.length, first, options);
  const { width, height } = layout.cell;
  const tiles = images.map((_, index) => {
    const box = boxes[index];
    const crop = box ? `crop=${box.width}:${box.height}:${box.x}:${box.y},` : '';
    return (
      `[${index}:v]${crop}scale=${width}:${height}:force_original_aspect_ratio=decrease:flags=lanczos,` +
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:white,setsar=1[t${index}]`
    );
  });
  const graph =
    images.length === 1
      ? tiles[0]!.replace(/\[t0\]$/, '')
      : `${tiles.join(';')};${images.map((_, index) => `[t${index}]`).join('')}` +
        `xstack=inputs=${images.length}:layout=${layout.positions.join('|')}:fill=white`;
  await ensureDir(dirname(output));
  ffmpeg([...images.flatMap((image) => ['-i', image]), '-filter_complex', graph, '-frames:v', '1', '-update', '1', output]);
  return output;
}

export interface MediaInfo {
  file: string;
  kind: 'image' | 'video' | 'audio';
  width?: number;
  height?: number;
  seconds?: number;
  fps?: number;
  frames?: number;
  videoCodec?: string;
  audioCodec?: string;
  sampleRate?: number;
  channels?: number;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.tif', '.tiff']);

/** Size, length, frame rate, and codecs of an image, clip, or audio file. */
export function mediaInfo(file: string): MediaInfo {
  const path = resolve(file);
  if (!existsSync(path)) throw new ValidationError(`Missing file: ${path}`);
  const raw = execFileSync(
    resolveBinary('ffprobe'),
    [
      '-v', 'error',
      '-show_entries',
      'stream=codec_type,codec_name,width,height,avg_frame_rate,nb_frames,sample_rate,channels:format=duration',
      '-of', 'json',
      path,
    ],
    { encoding: 'utf8' },
  );
  const data = JSON.parse(raw) as {
    streams?: Record<string, string | number | undefined>[];
    format?: { duration?: string };
  };
  const video = data.streams?.find((stream) => stream.codec_type === 'video');
  const audio = data.streams?.find((stream) => stream.codec_type === 'audio');
  const isImage = IMAGE_EXTENSIONS.has(extname(path).toLowerCase());
  const seconds = Number(data.format?.duration);
  const [num, den] = String(video?.avg_frame_rate ?? '').split('/').map(Number);
  const fps = num && den ? Number((num / den).toFixed(3)) : undefined;
  const frames = Number(video?.nb_frames);
  return {
    file,
    kind: isImage ? 'image' : video ? 'video' : 'audio',
    ...(video ? { width: Number(video.width), height: Number(video.height) } : {}),
    ...(!isImage && Number.isFinite(seconds) ? { seconds: Number(seconds.toFixed(3)) } : {}),
    ...(!isImage && fps ? { fps } : {}),
    ...(!isImage && Number.isFinite(frames) && frames > 0 ? { frames } : {}),
    ...(video && !isImage ? { videoCodec: String(video.codec_name) } : {}),
    ...(audio ? { audioCodec: String(audio.codec_name), sampleRate: Number(audio.sample_rate), channels: Number(audio.channels) } : {}),
  };
}

export function formatMediaInfo(info: MediaInfo): string {
  const parts: string[] = [info.kind];
  if (info.width) parts.push(`${info.width}x${info.height}`);
  if (info.seconds !== undefined) parts.push(`${info.seconds.toFixed(2)} s`);
  if (info.fps) parts.push(`${info.fps} fps`);
  if (info.frames) parts.push(`${info.frames} frames`);
  if (info.videoCodec) parts.push(info.videoCodec);
  if (info.kind !== 'image') parts.push(info.audioCodec ? `audio ${info.audioCodec} ${info.sampleRate} Hz ${info.channels} ch` : 'no audio');
  return `${info.file}: ${parts.join(' · ')}`;
}

export type FramePosition = 'first' | 'middle' | 'last';

/** Write one frame of a clip as PNG. `first` is the very first frame, `last` the final one. */
export async function clipFrame(clip: string, position: FramePosition, output: string): Promise<string> {
  if (!existsSync(clip)) throw new ValidationError(`Missing clip: ${clip}`);
  await ensureDir(dirname(output));
  if (position === 'last') {
    // Seek close to the end, then keep overwriting: the file ends up as the final frame.
    ffmpeg(['-sseof', '-0.5', '-i', clip, '-update', '1', output]);
  } else {
    const seconds = position === 'first' ? 0 : (mediaInfo(clip).seconds ?? 0) / 2;
    ffmpeg(['-ss', seconds.toFixed(3), '-i', clip, '-frames:v', '1', '-update', '1', output]);
  }
  if (!existsSync(output)) throw new ValidationError(`Could not read the ${position} frame of ${clip}.`);
  return output;
}

/** First, middle, and last frame of a clip, as `<stem>-first.png` … in `directory`. */
export async function clipFrames(clip: string, directory: string): Promise<string[]> {
  const stem = basename(clip, extname(clip));
  const frames: string[] = [];
  for (const position of ['first', 'middle', 'last'] as const) {
    frames.push(await clipFrame(clip, position, join(directory, `${stem}-${position}.png`)));
  }
  return frames;
}

/**
 * PSNR in dB between an image and a reference (the reference is scaled to the
 * image). Identical images give Infinity; a clip that starts on its keyframe is
 * well above 25 dB, a different framing below 15.
 */
export function imagePsnr(image: string, reference: string): number {
  const size = imageSize(image);
  const result = spawnSync(
    resolveBinary('ffmpeg'),
    [
      '-v', 'info', '-threads', '6',
      '-i', image,
      '-i', reference,
      '-lavfi', `[1:v]scale=${size.width}:${size.height}:flags=lanczos[ref];[0:v][ref]psnr`,
      '-f', 'null', '-',
    ],
    { encoding: 'utf8' },
  );
  const match = /average:(inf|[\d.]+)/.exec(result.stderr ?? '');
  if (!match) throw new ValidationError(`Could not compare ${image} with ${reference}.`);
  return match[1] === 'inf' ? Infinity : Number(match[1]);
}
