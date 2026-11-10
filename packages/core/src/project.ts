import { existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ValidationError, formatZodError } from './errors.js';
import { mergeTiming } from './timing.js';
import {
  BrandKitSchema,
  CharacterBibleSchema,
  ModelsConfigSchema,
  ProjectConfigSchema,
  ScriptSchema,
  SeriesSchema,
  SetBibleSchema,
  StateSchema,
  StoryboardSchema,
  StyleBibleSchema,
  TakesSchema,
  TimingOverridesSchema,
  TimingSchema,
  type BrandKit,
  type CharacterBible,
  type ModelsConfig,
  type Format,
  type ProjectConfig,
  type Script,
  type Series,
  type SetBible,
  type State,
  type Storyboard,
  type StyleBible,
  type Takes,
  type Timing,
  type TimingOverrides,
} from './schema.js';
import { createInitialState, migrateState } from './state.js';

export interface ProjectPaths {
  root: string;
  config: string;
  state: string;
  brief: string;
  treatment: string;
  lyrics: string;
  song: string;
  /** Episode script. */
  script: string;
  /** Episode takes registry (`takes.json`). */
  takes: string;
  timing: string;
  overrides: string;
  effectiveTiming: string;
  storyboard: string;
  storyboardMd: string;
  /** For an episode, the canon's style bible in the series folder. */
  style: string;
  /** For an episode, the canon's character bible in the series folder. */
  characters: string;
  /** Episode only: the series folder that holds the canon. */
  series?: string;
  /** Episode only: `series.yaml` of the series. */
  seriesConfig?: string;
  /** Episode only: the canon's set bible. */
  sets?: string;
  review: string;
  contactSheet: string;
  renders: string;
  assets: string;
  manifest: string;
}

/**
 * The folder of a series canon. Series live in `series/<slug>/` next to the
 * `projects/` folder that holds the episode.
 */
export function seriesDir(projectDir: string, series: string): string {
  return join(dirname(dirname(resolve(projectDir))), 'series', series);
}

/**
 * Paths of a project's artifacts. With an episode config, style, characters,
 * and sets point into the series canon instead of the project.
 */
export function projectPaths(projectDir: string, config?: Pick<ProjectConfig, 'kind' | 'series'>): ProjectPaths {
  const root = resolve(projectDir);
  const canon = config?.kind === 'episode' && config.series ? seriesDir(root, config.series) : undefined;
  return {
    root,
    config: join(root, 'project.yaml'),
    state: join(root, 'state.json'),
    brief: join(root, 'brief.md'),
    treatment: join(root, 'treatment.md'),
    lyrics: join(root, 'lyrics.txt'),
    song: join(root, 'song.json'),
    script: join(root, 'script.yaml'),
    takes: join(root, 'takes.json'),
    timing: join(root, 'timing.json'),
    overrides: join(root, 'timing.overrides.json'),
    effectiveTiming: join(root, 'timing.effective.json'),
    storyboard: join(root, 'storyboard.yaml'),
    storyboardMd: join(root, 'storyboard.md'),
    style: join(canon ?? root, 'style.yaml'),
    characters: join(canon ?? root, 'characters.yaml'),
    ...(canon
      ? { series: canon, seriesConfig: join(canon, 'series.yaml'), sets: join(canon, 'sets.yaml') }
      : {}),
    review: join(root, 'review'),
    contactSheet: join(root, 'review', 'contact-sheet.svg'),
    renders: join(root, 'renders'),
    assets: join(root, 'assets'),
    manifest: join(root, 'assets', 'manifest.jsonl'),
  };
}

/** The project's audio relative to the project: the song or the episode track. */
export function projectAudioPath(config: Pick<ProjectConfig, 'kind'>): string {
  return config.kind === 'episode' ? 'audio/episode.wav' : 'audio/song.wav';
}

/** Format ID for an aspect ratio, as used in render file names: "9:16" -> "9x16". */
export function formatId(aspect: Format['aspect']): string {
  return aspect.replace(':', 'x');
}

export async function readYamlFile<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new ValidationError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = parseYaml(raw);
  } catch (error) {
    throw new ValidationError(`Invalid YAML in ${path}: ${(error as Error).message}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(`Invalid ${path}`, formatZodError(result.error));
  }
  return result.data;
}

export async function readJsonFile<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(path, 'utf8');
  } catch (error) {
    throw new ValidationError(`Cannot read ${path}: ${(error as Error).message}`);
  }
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (error) {
    throw new ValidationError(`Invalid JSON in ${path}: ${(error as Error).message}`);
  }
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new ValidationError(`Invalid ${path}`, formatZodError(result.error));
  }
  return result.data;
}

export async function ensureDir(path: string): Promise<void> {
  await mkdir(path, { recursive: true });
}

export async function writeTextAtomic(path: string, content: string): Promise<void> {
  await ensureDir(dirname(path));
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, 'utf8');
  await rename(temporary, path);
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeTextAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export function pathExists(path: string): boolean {
  return existsSync(path);
}

export function repoRoot(start = process.cwd()): string {
  let current = resolve(start);
  while (true) {
    const packagePath = join(current, 'package.json');
    if (existsSync(packagePath)) {
      try {
        const parsed = JSON.parse(readFileSync(packagePath, 'utf8')) as { name?: string };
        if (parsed.name === 'coreslopper') return current;
      } catch {
        // Keep walking.
      }
    }
    const parent = dirname(current);
    if (parent === current) {
      throw new ValidationError(`Could not find the coreslopper repository root from ${start}.`);
    }
    current = parent;
  }
}

export interface LoadedProject {
  config: ProjectConfig;
  state: State;
  timing?: Timing;
  overrides: TimingOverrides;
  effectiveTiming?: Timing;
  storyboard?: Storyboard;
  style?: StyleBible;
  characters?: CharacterBible;
  /** Episode only: the series config of the canon. */
  series?: Series;
  /** Episode only: the canon's sets. */
  sets?: SetBible;
  /** Episode only. */
  script?: Script;
  /** Episode only. */
  takes?: Takes;
  paths: ProjectPaths;
}

/**
 * Load a project. An episode's style, characters, and sets come from its
 * series canon; the storyboard's `style` and `characters` path fields are not
 * used, so an episode cannot redirect its canon.
 */
export async function loadProject(projectDir: string): Promise<LoadedProject> {
  const config = await readYamlFile(projectPaths(projectDir).config, ProjectConfigSchema);
  const paths = projectPaths(projectDir, config);
  const state = pathExists(paths.state)
    ? migrateState(await readJsonFile(paths.state, StateSchema), config)
    : createInitialState(config, config.workflow.version);
  const timing = pathExists(paths.timing) ? await readJsonFile(paths.timing, TimingSchema) : undefined;
  const overrides = pathExists(paths.overrides)
    ? await readJsonFile(paths.overrides, TimingOverridesSchema)
    : TimingOverridesSchema.parse({});
  const effectiveTiming = timing ? mergeTiming(timing, overrides) : undefined;
  const storyboard = pathExists(paths.storyboard)
    ? await readYamlFile(paths.storyboard, StoryboardSchema)
    : undefined;
  const style = pathExists(paths.style) ? await readYamlFile(paths.style, StyleBibleSchema) : undefined;
  const characters = pathExists(paths.characters)
    ? await readYamlFile(paths.characters, CharacterBibleSchema)
    : undefined;

  if (config.kind !== 'episode') {
    return { config, state, timing, overrides, effectiveTiming, storyboard, style, characters, paths };
  }

  if (!paths.seriesConfig || !pathExists(paths.seriesConfig)) {
    throw new ValidationError(
      `Episode "${config.slug}" belongs to series "${config.series}", but ${paths.seriesConfig ?? 'its series.yaml'} does not exist.`,
    );
  }
  const series = await readYamlFile(paths.seriesConfig, SeriesSchema);
  const sets = paths.sets && pathExists(paths.sets) ? await readYamlFile(paths.sets, SetBibleSchema) : undefined;
  const script = pathExists(paths.script) ? await readYamlFile(paths.script, ScriptSchema) : undefined;
  const takes = pathExists(paths.takes) ? await readJsonFile(paths.takes, TakesSchema) : undefined;

  return {
    config,
    state,
    timing,
    overrides,
    effectiveTiming,
    storyboard,
    style,
    characters,
    series,
    sets,
    script,
    takes,
    paths,
  };
}

export async function saveState(path: string, state: State): Promise<void> {
  await writeJsonAtomic(path, state);
}

export async function writeEffectiveTiming(project: LoadedProject): Promise<void> {
  if (!project.effectiveTiming) return;
  await writeJsonAtomic(project.paths.effectiveTiming, project.effectiveTiming);
}

export async function loadModelsConfig(root = repoRoot()): Promise<ModelsConfig> {
  return readYamlFile(join(root, 'config', 'models.yaml'), ModelsConfigSchema);
}

export const DefaultsSchema = z.object({
  version: z.literal(1).default(1),
  formats: z.object({
    master: z.object({
      aspect: z.string().default('16:9'),
      width: z.number().int().positive().default(1920),
      height: z.number().int().positive().default(1080),
      fps: z.number().int().positive().default(30),
    }),
    derivatives: z
      .array(
        z.object({
          aspect: z.string(),
          width: z.number().int().positive(),
          height: z.number().int().positive(),
        }),
      )
      .default([
        { aspect: '9:16', width: 1080, height: 1920 },
        { aspect: '1:1', width: 1080, height: 1080 },
      ]),
  }),
  budget: z.object({
    minimum_usd: z.number().positive().default(5),
    suggested_usd: z.number().positive().default(50),
  }),
  render: z.object({
    loudness_lufs: z.number().default(-14),
    true_peak_dbtp: z.number().default(-1),
    video_bitrate: z.string().default('12M'),
  }),
  asset_batch_size: z.number().int().positive().default(5),
  retries: z.object({
    max_attempts: z.number().int().positive().default(4),
    base_delay_ms: z.number().int().positive().default(1000),
    request_timeout_ms: z.number().int().positive().default(180_000),
  }),
});

export type Defaults = z.infer<typeof DefaultsSchema>;

export async function loadDefaults(root = repoRoot()): Promise<Defaults> {
  return readYamlFile(join(root, 'config', 'defaults.yaml'), DefaultsSchema);
}

export interface ResolvedBrand {
  kit: BrandKit;
  /** Absolute directory that holds brand.yaml; font and logo paths are relative to it. */
  dir: string;
  /** `project` for `<project>/brand/brand.yaml`, `repo` for `brand/<id>/brand.yaml`. */
  origin: 'project' | 'repo';
}

/**
 * Brand kit for a project: a project-local `brand/brand.yaml` overrides the
 * shared `brand/<project.brand>/brand.yaml` from the workspace. Returns
 * undefined when neither exists.
 */
export async function loadBrand(projectDir: string, brandId?: string, root = repoRoot()): Promise<ResolvedBrand | undefined> {
  const local = join(resolve(projectDir), 'brand');
  if (existsSync(join(local, 'brand.yaml'))) {
    return { kit: await readYamlFile(join(local, 'brand.yaml'), BrandKitSchema), dir: local, origin: 'project' };
  }
  if (brandId) {
    const shared = join(root, 'brand', brandId);
    if (existsSync(join(shared, 'brand.yaml'))) {
      return { kit: await readYamlFile(join(shared, 'brand.yaml'), BrandKitSchema), dir: shared, origin: 'repo' };
    }
  }
  return undefined;
}
