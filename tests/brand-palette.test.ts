import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parse } from 'yaml';
import { BrandKitSchema, StyleBibleSchema, loadBrand, resolveColorToken, resolvePalette } from '../packages/core/src/index.js';

const base = {
  name: 'test',
  typography: { body: { family: 'Inter', weight: 400 } },
};

describe('palette roles', () => {
  it('maps roles to palette keys or hex colours and keeps custom roles', () => {
    const style = StyleBibleSchema.parse({
      ...base,
      palette: { ink: '#111111', paper: '#eeeeee', blood: '#aa0000' },
      roles: { background: 'paper', text: 'ink', primary: 'blood', stamp: '#ff0000' },
    });
    const palette = resolvePalette(style);
    expect(palette).toMatchObject({ background: '#eeeeee', text: '#111111', primary: '#aa0000', stamp: '#ff0000' });
    expect(palette.ink).toBe('#111111');
  });

  it('falls back to name hints, then defaults', () => {
    const palette = resolvePalette({ palette: { night_black: '#000001', neon_cyan: '#00ffff' } });
    expect(palette.background).toBe('#000001');
    expect(palette.secondary).toBe('#00ffff');
    expect(palette.surface).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('rejects a role that maps to an unknown key', () => {
    const result = StyleBibleSchema.safeParse({ ...base, palette: { ink: '#111111' }, roles: { text: 'missing' } });
    expect(result.success).toBe(false);
  });

  it('resolves colour tokens in motion props', () => {
    const style = { palette: { acid_green: '#00ff00', ink: '#111111' }, roles: { text: 'ink' } };
    expect(resolveColorToken(style, 'acid-green', '#000000')).toBe('#00ff00');
    expect(resolveColorToken(style, 'white', '#000000')).toBe('#111111');
    expect(resolveColorToken(style, 'nope', '#123456')).toBe('#123456');
  });
});

const exampleYaml = readFileSync(join(process.cwd(), 'brand', 'example', 'brand.yaml'), 'utf8');
const example = parse(exampleYaml) as Record<string, unknown>;

describe('brand kit', () => {
  it('accepts font weight and style', () => {
    const kit = BrandKitSchema.parse({
      ...example,
      fonts: [{ family: 'Oswald', file: 'fonts/Oswald.ttf', license: 'OFL', weight: '200 700', style: 'normal' }],
    });
    expect(kit.fonts[0]!.weight).toBe('200 700');
  });

  it('prefers a project-local brand over the shared one', async () => {
    const root = mkdtempSync(join(tmpdir(), 'cs-brand-'));
    const project = join(root, 'projects', 'p');
    mkdirSync(join(project, 'brand'), { recursive: true });
    mkdirSync(join(root, 'brand', 'shared'), { recursive: true });
    writeFileSync(join(root, 'brand', 'shared', 'brand.yaml'), exampleYaml);
    expect((await loadBrand(project, 'shared', root))?.origin).toBe('repo');
    writeFileSync(join(project, 'brand', 'brand.yaml'), exampleYaml);
    const local = await loadBrand(project, 'shared', root);
    expect(local?.origin).toBe('project');
    expect(local?.dir).toBe(join(project, 'brand'));
    expect(await loadBrand(join(root, 'projects', 'none'), 'missing', root)).toBeUndefined();
  });
});
