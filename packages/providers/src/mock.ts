import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function colorFromSeed(seed: number, index: number): string {
  const hue = (seed * 37 + index * 61) % 360;
  return `hsl(${hue} 80% 55%)`;
}

function placeholderSvg(input: ProviderInput, label: string): string {
  const width = input.width ?? 1024;
  const height = input.height ?? 576;
  const colors = [0, 1, 2].map((index) => colorFromSeed(input.seed, index));
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${colors[0]}"/>
      <stop offset="55%" stop-color="${colors[1]}"/>
      <stop offset="100%" stop-color="${colors[2]}"/>
    </linearGradient>
    <pattern id="grid" width="48" height="48" patternUnits="userSpaceOnUse">
      <path d="M 48 0 L 0 0 0 48" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="${width}" height="${height}" fill="url(#g)"/>
  <rect width="${width}" height="${height}" fill="url(#grid)"/>
  <text x="${width / 2}" y="${height / 2 - 18}" font-family="monospace" font-size="${Math.round(width / 26)}" fill="white" text-anchor="middle" opacity="0.92">${escapeXml(label)}</text>
  <text x="${width / 2}" y="${height / 2 + 34}" font-family="monospace" font-size="${Math.round(width / 52)}" fill="white" text-anchor="middle" opacity="0.7">${escapeXml(input.model)}</text>
  <text x="${width / 2}" y="${height / 2 + 78}" font-family="monospace" font-size="${Math.round(width / 64)}" fill="white" text-anchor="middle" opacity="0.55">seed ${input.seed}</text>
</svg>
`;
}

async function writePlaceholder(input: ProviderInput, label: string, suffix: string): Promise<ProviderOutput> {
  await mkdir(input.outputDir, { recursive: true });
  const path = join(input.outputDir, `mock-${input.seed}-${suffix}.svg`);
  await writeFile(path, placeholderSvg(input, label), 'utf8');
  return { files: [path], raw: { mock: true, label, model: input.model } };
}

export class MockProvider implements Provider {
  readonly name = 'mock';

  async generateImage(input: ProviderInput): Promise<ProviderOutput> {
    return writePlaceholder(input, 'MOCK IMAGE', 'image');
  }

  async editImage(input: ProviderInput): Promise<ProviderOutput> {
    return writePlaceholder(input, 'MOCK EDIT', 'edit');
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    return writePlaceholder(input, `MOCK T2V ${input.durationSeconds ?? 5}s`, 'clip');
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    return writePlaceholder(input, `MOCK CLIP ${input.durationSeconds ?? 5}s`, 'clip');
  }

  async firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput> {
    if ((input.references ?? []).length < 2) {
      throw new Error('firstLastFrameToVideo requires a start frame and an end frame.');
    }
    return writePlaceholder(input, `MOCK FLF ${input.durationSeconds ?? 5}s`, 'clip');
  }

  async lipSync(input: ProviderInput): Promise<ProviderOutput> {
    if (!input.references?.[0]) throw new Error('lipSync requires a face reference image.');
    if (!input.audio) throw new Error('lipSync requires an audio file.');
    return writePlaceholder(input, `MOCK LIPSYNC ${input.durationSeconds ?? '?'}s`, 'lipsync');
  }
}
