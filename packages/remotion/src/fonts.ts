import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';
import type { BrandFont } from './types';

/** Example-brand fonts, used when a render passes no brand fonts (fixture, Studio). */
export const EXAMPLE_BRAND_FONTS: BrandFont[] = [
  { family: 'Space Grotesk', url: 'brand/example/fonts/SpaceGrotesk.ttf', weight: '100 900', style: 'normal' },
  { family: 'Orbitron', url: 'brand/example/fonts/Orbitron.ttf', weight: '100 900', style: 'normal' },
  { family: 'JetBrains Mono', url: 'brand/example/fonts/JetBrainsMono.ttf', weight: '100 900', style: 'normal' },
];

const loaded = new Set<string>();

function formatOf(url: string): 'truetype' | 'opentype' | 'woff' | 'woff2' {
  const lower = url.toLowerCase();
  if (lower.endsWith('.woff2')) return 'woff2';
  if (lower.endsWith('.woff')) return 'woff';
  if (lower.endsWith('.otf')) return 'opentype';
  return 'truetype';
}

/**
 * Loads the project's brand fonts (see `brand.yaml` `fonts:`; the CLI resolves
 * them to public paths). Falls back to the example brand. Each file is loaded
 * once per render; @remotion/fonts uses delayRender() internally so Remotion
 * waits for the font files before capturing frames.
 */
export function ensureFonts(fonts?: BrandFont[]): void {
  const list = fonts && fonts.length > 0 ? fonts : EXAMPLE_BRAND_FONTS;
  for (const font of list) {
    const key = `${font.family}|${font.url}|${font.weight}|${font.style}`;
    if (loaded.has(key)) continue;
    loaded.add(key);
    void loadFont({
      family: font.family,
      url: staticFile(font.url),
      weight: font.weight,
      style: font.style,
      format: formatOf(font.url),
    });
  }
}
