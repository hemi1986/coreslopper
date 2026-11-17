import { openSync, readSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ValidationError } from '@coreslopper/core';
import { resolveBinary } from './media.js';

/**
 * Per-shot options for local clips, set in a batch item's `params`:
 *
 * - `video_model`: "ltx" (default) or "wan". Wan 2.2 is image-to-video only and
 *   never lip-syncs.
 * - `quality`: "draft" (default) or "final". Final renders at full size and runs
 *   the SeedVR2 restore afterwards.
 * - `seedvr2`: "restore" (default on final, scale 1), "upscale" (render at half
 *   size, scale up to the master), or "off" for a shot that looks oversharpened.
 * - `color_correction`: SeedVR2 color transfer, "lab" (default) or "wavelet".
 * - `turbo`: Wan only; the 4-step Lightning LoRAs, default true.
 *
 * They apply only when the item runs on ComfyUI; cloud providers ignore them.
 */
export const CLIP_OPTION_KEYS = ['video_model', 'quality', 'seedvr2', 'color_correction', 'turbo'] as const;

export type VideoModel = 'ltx' | 'wan';
export type ClipQuality = 'draft' | 'final';
export type SeedVR2Mode = 'restore' | 'upscale' | 'off';

export interface ClipOptions {
  videoModel: VideoModel;
  quality: ClipQuality;
  seedvr2: SeedVR2Mode;
  colorCorrection: string;
  turbo: boolean;
}

const COLOR_CORRECTIONS = ['lab', 'wavelet', 'adain', 'none'];

function oneOf<T extends string>(value: unknown, name: string, allowed: readonly T[], fallback: T): T {
  if (value === undefined) return fallback;
  if (typeof value !== 'string' || !allowed.includes(value as T)) {
    throw new ValidationError(`params.${name} must be one of ${allowed.map((v) => `"${v}"`).join(', ')}.`);
  }
  return value as T;
}

/** Split the clip options off an item's params; the rest goes to the provider. */
export function takeClipOptions(params: Record<string, unknown>): {
  options: ClipOptions;
  rest: Record<string, unknown>;
} {
  const rest = { ...params };
  for (const key of CLIP_OPTION_KEYS) delete rest[key];
  const quality = oneOf(params.quality, 'quality', ['draft', 'final'] as const, 'draft');
  const seedvr2 = oneOf(
    params.seedvr2,
    'seedvr2',
    ['restore', 'upscale', 'off'] as const,
    quality === 'final' ? 'restore' : 'off',
  );
  if (params.turbo !== undefined && typeof params.turbo !== 'boolean') {
    throw new ValidationError('params.turbo must be true or false.');
  }
  return {
    options: {
      videoModel: oneOf(params.video_model, 'video_model', ['ltx', 'wan'] as const, 'ltx'),
      quality,
      // SeedVR2 runs only after a final render.
      seedvr2: quality === 'final' ? seedvr2 : 'off',
      colorCorrection: oneOf(params.color_correction, 'color_correction', COLOR_CORRECTIONS, 'lab'),
      turbo: params.turbo === undefined ? true : Boolean(params.turbo),
    },
    rest,
  };
}

/** Round up to a multiple, never below one multiple. */
export function ceilTo(value: number, multiple: number): number {
  return Math.max(multiple, Math.ceil(value / multiple) * multiple);
}

export function roundTo(value: number, multiple: number): number {
  return Math.max(multiple, Math.round(value / multiple) * multiple);
}

/** Half the master size, rounded up to multiples of 64 (LTX), for the SeedVR2 upscale mode. */
export function halfSize(master: { width: number; height: number }): { width: number; height: number } {
  return { width: ceilTo(master.width / 2, 64), height: ceilTo(master.height / 2, 64) };
}

/**
 * Wan render size from the start frame's aspect: 832x480 (draft) or 1280x720
 * (final) for 16:9, swapped for 9:16, the same pixel area in multiples of 16
 * for any other aspect.
 */
export function wanSize(aspect: number, quality: ClipQuality): { width: number; height: number } {
  const [long, short] = quality === 'final' ? [1280, 720] : [832, 480];
  if (Math.abs(aspect - 16 / 9) / (16 / 9) < 0.02) return { width: long, height: short };
  if (Math.abs(aspect - 9 / 16) / (9 / 16) < 0.02) return { width: short, height: long };
  const area = long * short;
  const width = roundTo(Math.sqrt(area * aspect), 16);
  return { width, height: roundTo(width / aspect, 16) };
}

/** SeedVR2 scale factor: 1 to restore, master / render size to upscale. */
export function seedvr2Scale(
  mode: SeedVR2Mode,
  render: { width: number; height: number },
  master: { width: number; height: number },
): number {
  if (mode !== 'upscale') return 1;
  const factor = Math.max(master.width, master.height) / Math.max(render.width, render.height);
  return Number(Math.max(1, factor).toFixed(3));
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Replace character names and ids in a prompt with their descriptions. Wan does
 * not know the names, so "Alexis turns" becomes "<description> turns".
 */
export function replaceCharacterNames(
  prompt: string,
  characters: { id: string; name: string; description: string }[],
): string {
  const lookup = new Map<string, string>();
  for (const character of characters) {
    for (const key of [character.name, character.id]) {
      if (key.trim()) lookup.set(key.toLowerCase(), character.description.trim().replace(/\.$/, ''));
    }
  }
  if (lookup.size === 0) return prompt;
  const keys = [...lookup.keys()].sort((a, b) => b.length - a.length).map(escapeRegExp);
  const pattern = new RegExp(`(?<![\\p{L}\\p{N}_-])(${keys.join('|')})(?![\\p{L}\\p{N}_-])`, 'giu');
  return prompt.replace(pattern, (match) => lookup.get(match.toLowerCase()) ?? match);
}

/** Pixel size of a PNG or JPEG from its header; other formats through ffprobe. */
export function imageSize(path: string): { width: number; height: number } {
  const fd = openSync(path, 'r');
  try {
    const head = Buffer.alloc(64 * 1024);
    const length = readSync(fd, head, 0, head.length, 0);
    const data = head.subarray(0, length);
    if (data.length >= 24 && data.readUInt32BE(0) === 0x89504e47) {
      return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
    }
    if (data.length >= 4 && data[0] === 0xff && data[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < data.length) {
        if (data[offset] !== 0xff) break;
        const marker = data[offset + 1]!;
        const size = data.readUInt16BE(offset + 2);
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { width: data.readUInt16BE(offset + 7), height: data.readUInt16BE(offset + 5) };
        }
        offset += 2 + size;
      }
    }
  } finally {
    closeSync(fd);
  }
  try {
    const output = execFileSync(
      resolveBinary('ffprobe'),
      ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', path],
      { encoding: 'utf8' },
    ).trim();
    const [width, height] = output.split(',').map(Number);
    if (width && height) return { width, height };
  } catch {
    // fall through
  }
  throw new ValidationError(`Could not read the size of the start frame ${path}.`);
}
