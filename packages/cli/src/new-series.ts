import { cp, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { stringify } from 'yaml';
import {
  ConfigError,
  SeriesSchema,
  ValidationError,
  createSeriesState,
  loadBrand,
  loadDefaults,
  repoRoot,
  writeJsonAtomic,
  writeTextAtomic,
  type Format,
  type Series,
  type StyleBible,
} from '@coreslopper/core';
import type { FormatId } from '../../remotion/src/types.js';

/** Sizes of the render formats. */
export const FORMAT_SIZES: Record<FormatId, { aspect: string; width: number; height: number }> = {
  '16x9': { aspect: '16:9', width: 1920, height: 1080 },
  '9x16': { aspect: '9:16', width: 1080, height: 1920 },
  '1x1': { aspect: '1:1', width: 1080, height: 1080 },
  '4x5': { aspect: '4:5', width: 1080, height: 1350 },
};

export interface NewSeriesOptions {
  slug: string;
  title?: string;
  budget?: number;
  /** Master format ID; defaults to the master in config/defaults.yaml. */
  format?: FormatId;
  brand?: string;
  providers?: Partial<Series['providers']>;
  /** Workspace root. Defaults to the repository root discovered from cwd. */
  root?: string;
}

function titleFromSlug(slug: string): string {
  return slug
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/** A starting style bible from the brand kit, so the canon validates before the skill refines it. */
async function starterStyle(title: string, brandId: string, root: string): Promise<StyleBible> {
  const brand = await loadBrand(join(root, 'series'), brandId, root);
  if (!brand) throw new ConfigError(`Brand kit "${brandId}" not found in brand/${brandId}/brand.yaml.`);
  return {
    version: 1,
    name: title,
    palette: brand.kit.palette,
    typography: brand.kit.typography,
    look: { keywords: [], negative: [], references: [] },
    motion: brand.kit.motion,
  };
}

/**
 * Create `series/<slug>/` from templates/series: series.yaml with formats,
 * providers, brand, and budget, a starting style bible from the brand kit,
 * empty character and set bibles, a bible skeleton, and the series state.
 */
export async function createSeries(options: NewSeriesOptions): Promise<string> {
  const slug = options.slug.trim();
  if (!/^[a-z0-9][a-z0-9-]*$/.test(slug)) {
    throw new ValidationError('Series slug must be lowercase letters, digits, and dashes.');
  }
  if (options.budget === undefined || !Number.isFinite(options.budget) || options.budget <= 0) {
    throw new ConfigError('A series budget is required. Pass --budget <USD>.');
  }
  const root = options.root ?? repoRoot();
  const dir = join(root, 'series', slug);
  if (existsSync(dir)) throw new ValidationError(`Series directory already exists: ${dir}`);

  const defaults = await loadDefaults(root);
  const title = options.title?.trim() || titleFromSlug(slug);
  const brand = options.brand ?? 'example';
  const master: Format = options.format
    ? { ...FORMAT_SIZES[options.format], fps: defaults.formats.master.fps }
    : defaults.formats.master;
  const series = SeriesSchema.parse({
    version: 1,
    slug,
    title,
    formats: { master, derivatives: [] },
    providers: { image: 'mock', video: 'mock', audio: 'mock', ...options.providers },
    brand,
    budget_usd: options.budget,
    episodes: [],
    limits: {},
  });

  const style = await starterStyle(title, brand, root);
  await cp(join(root, 'templates', 'series'), dir, { recursive: true, errorOnExist: true });
  await writeTextAtomic(join(dir, 'series.yaml'), stringify(series));
  await writeTextAtomic(join(dir, 'style.yaml'), stringify(style));
  const biblePath = join(dir, 'bible.md');
  const bible = await readFile(biblePath, 'utf8');
  await writeFile(biblePath, bible.replaceAll('{{TITLE}}', title).replaceAll('{{SLUG}}', slug), 'utf8');
  await writeJsonAtomic(join(dir, 'state.json'), createSeriesState(series));

  console.log(`Created series ${title} (${slug}) at ${dir}`);
  console.log(
    `Budget: $${options.budget.toFixed(2)} · master ${master.aspect} ${master.width}x${master.height} · providers: image=${series.providers.image}, video=${series.providers.video}, audio=${series.providers.audio}`,
  );
  console.log('Next: write the bible, characters, sets, and episode plan (new-series skill), then generate the references.');
  return dir;
}
