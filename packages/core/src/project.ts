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
  StateSchema,
  StoryboardSchema,
  StyleBibleSchema,
  TimingOverridesSchema,
  TimingSchema,
  type BrandKit,
  type CharacterBible,
  type ModelsConfig,
  type ProjectConfig,
  type State,
  type Storyboard,
  type StyleBible,
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
  timing: string;
  overrides: string;
  effectiveTiming: string;
  storyboard: string;
  storyboardMd: string;
  style: string;
  characters: string;
  review: string;
  contactSheet: string;
  renders: string;
  assets: string;
  manifest: string;
}

export function projectPaths(projectDir: string): ProjectPaths {
  const root = resolve(projectDir);
  return {
    root,
    config: join(root, 'project.yaml'),
    state: join(root, 'state.json'),
    brief: join(root, 'brief.md'),
    treatment: join(root, 'treatment.md'),
    lyrics: join(root, 'lyrics.txt'),
    song: join(root, 'song.json'),
    timing: join(root, 'timing.json'),
    overrides: join(root, 'timing.overrides.json'),
    effectiveTiming: join(root, 'timing.effective.json'),
    storyboard: join(root, 'storyboard.yaml'),
    storyboardMd: join(root, 'storyboard.md'),
    style: join(root, 'style.yaml'),
    characters: join(root, 'characters.yaml'),
    review: join(root, 'review'),
    contactSheet: join(root, 'review', 'contact-sheet.svg'),
    renders: join(root, 'renders'),
    assets: join(root, 'assets'),
    manifest: join(root, 'assets', 'manifest.jsonl'),
  };
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
  paths: ProjectPaths;
}

export async function loadProject(projectDir: string): Promise<LoadedProject> {
  const paths = projectPaths(projectDir);
  const config = await readYamlFile(paths.config, ProjectConfigSchema);
  const state = pathExists(paths.state)
    ? migrateState(await readJsonFile(paths.state, StateSchema))
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

  return { config, state, timing, overrides, effectiveTiming, storyboard, style, characters, paths };
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
