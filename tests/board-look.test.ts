// The board's look "Werkstatt" (ST-059, UX guideline G8): packages/cli/src/board/board.css defines its tokens once for
// light and once for dark; the views use the tokens, and only the platform badges keep colours of their own.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';

const BOARD = join(import.meta.dirname, '..', 'packages', 'cli', 'src', 'board');
const DARK = '@media (prefers-color-scheme: dark)';
const COLOUR = /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|(?<![-\w])(?:white|black|red|green|blue|gray|grey|silver|orange|yellow|purple)(?![-\w])/gi;

let css = '';
beforeAll(async () => { css = await readFile(join(BOARD, 'board.css'), 'utf8'); });

/** The body of the block that opens at `open` (the index of its `{`). */
function block(text: string, open: number): string {
  let depth = 0;
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++;
    if (text[i] === '}' && --depth === 0) return text.slice(open + 1, i);
  }
  throw new Error('unclosed block');
}

function tokens(body: string): Map<string, string> {
  const map = new Map<string, string>();
  for (const m of body.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) map.set(m[1], m[2].trim());
  return map;
}

function light() { return tokens(block(css, css.indexOf(':root {') + ':root '.length)); }
function dark() {
  const media = block(css, css.indexOf(DARK) + DARK.length + 1);
  return tokens(block(media, media.indexOf(':root {') + ':root '.length));
}

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255]
    .map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, c, i) => sum + c * [0.2126, 0.7152, 0.0722][i], 0);
}
function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

describe('the board look', () => {
  it('defines its colour tokens once for light and once for dark', () => {
    expect(css.split(':root {').length - 1).toBe(2);
    expect(css.split(DARK).length - 1).toBe(1);
    const lightColours = [...light()].filter(([, v]) => /^#[0-9a-f]{6}$/i.test(v)).map(([k]) => k);
    expect(lightColours.length).toBeGreaterThan(8);
    expect(lightColours.filter((k) => !dark().has(k))).toEqual([]);
  });

  it('uses no colour of its own outside the tokens and the platform badges', () => {
    let rules = css;
    for (const marker of [':root {', DARK]) {
      const start = rules.indexOf(marker);
      const open = rules.indexOf('{', start);
      rules = rules.slice(0, start) + rules.slice(open + block(rules, open).length + 2);
    }
    rules = rules.replace(/\/\*[\s\S]*?\*\//g, '');
    const offenders = rules.split('}').filter((rule) => !/^\s*\.pf[\s,{-]/.test(rule) && rule.match(COLOUR));
    expect(offenders).toEqual([]);
  });

  it('keeps colours out of the view scripts', async () => {
    const scripts = (await readdir(BOARD)).filter((f) => f.endsWith('.js') || f.endsWith('.html'));
    for (const file of scripts) {
      expect(await readFile(join(BOARD, file), 'utf8'), file).not.toMatch(/['"`(:\s]#[0-9a-f]{3,8}\b|\brgba?\(/i);
    }
  });

  it.each([['light', light], ['dark', dark]] as const)('body and muted text reach 4.5:1 in %s', (_mode, read) => {
    const t = read();
    for (const text of ['--ink', '--muted']) {
      for (const background of ['--bg', '--panel', '--chip']) {
        expect(contrast(t.get(text)!, t.get(background)!), `${text} on ${background}`).toBeGreaterThanOrEqual(4.5);
      }
    }
    expect(contrast(t.get('--on-accent')!, t.get('--accent')!)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(t.get('--on-status')!, t.get('--ok')!)).toBeGreaterThanOrEqual(4.5);
    for (const status of ['--accent', '--ok', '--warn', '--bad']) {
      expect(contrast(t.get(status)!, t.get('--panel')!), `${status} on --panel`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
