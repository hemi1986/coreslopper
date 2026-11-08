import { loadFont } from '@remotion/fonts';
import { staticFile } from 'remotion';

let started = false;

/**
 * Loads the local OFL fonts. Called once per render; @remotion/fonts uses
 * delayRender() internally so Remotion waits for the font files.
 */
export function ensureFonts(): void {
  if (started) return;
  started = true;
  const fonts = [
    { family: 'Space Grotesk', file: 'SpaceGrotesk.ttf' },
    { family: 'Orbitron', file: 'Orbitron.ttf' },
    { family: 'JetBrains Mono', file: 'JetBrainsMono.ttf' },
  ];
  for (const font of fonts) {
    void loadFont({
      family: font.family,
      url: staticFile(`brand/example/fonts/${font.file}`),
      weight: '100 900',
      format: 'truetype',
    });
  }
}
