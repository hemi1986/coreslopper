import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { ConfigError, ValidationError } from './errors.js';
import { repoRoot } from './project.js';
import { ModelPricingSchema, ProviderKindSchema } from './schema.js';

/**
 * Model bench (ADR 0020): fixed bench cases from past projects, rendered on
 * several bench targets and scored against a rubric. Case and target files are
 * tracked; fixtures, runs, state, and the bench manifest are local.
 */

export const BenchOperationSchema = z.enum([
  'generateImage',
  'editImage',
  'textToVideo',
  'imageToVideo',
  'firstLastFrameToVideo',
  'lipSync',
  'generateAudio',
]);
export type BenchOperation = z.infer<typeof BenchOperationSchema>;

const Slug = z.string().regex(/^[a-z0-9][a-z0-9-]*$/, 'use lowercase letters, digits, and hyphens');

/** A media file a case needs, copied from a workspace project by `bench import`. */
export const BenchFixtureSchema = z.object({
  /** Path relative to the source workspace's `projects/` directory. */
  from: z.string().min(1),
  /** Cut an audio window instead of copying the whole file (seconds). */
  cut: z
    .object({
      start: z.number().min(0),
      duration: z.number().positive(),
    })
    .optional(),
});
export type BenchFixture = z.infer<typeof BenchFixtureSchema>;

export const BenchCriterionSchema = z.object({
  id: Slug,
  /** What the reviewer checks, phrased so it can be scored 0 (fail), 1 (weak), or 2 (pass). */
  check: z.string().min(1),
  weight: z.number().positive().default(1),
});
export type BenchCriterion = z.infer<typeof BenchCriterionSchema>;

export const BenchCaseSchema = z
  .object({
    id: Slug,
    title: z.string().min(1),
    /** Bench sets this case belongs to, e.g. `core`, `smoke`. */
    sets: z.array(Slug).min(1).default(['core']),
    /** The failure mode the case stresses, in one sentence. */
    focus: z.string().min(1),
    source: z
      .object({
        project: z.string().min(1),
        shot: z.string().optional(),
        note: z.string().optional(),
      })
      .optional(),
    operation: BenchOperationSchema,
    /** The model role whose defaults apply before the target's settings. */
    role: z.string().min(1),
    prompt: z.string().min(1),
    seed: z.number().int().min(0),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    /** Portable params only (no node IDs); target params win. */
    params: z.record(z.string(), z.unknown()).default({}),
    fixtures: z.record(z.string().regex(/^[a-z0-9][a-z0-9-]*$/), BenchFixtureSchema).default({}),
    inputs: z
      .object({
        references: z.array(z.string()).default([]),
        audio: z.string().optional(),
      })
      .default({ references: [] }),
    /** Fixture name of the known good result from the source project. */
    golden: z.string().optional(),
    goldenNote: z.string().optional(),
    /** For speech: the exact words the take must contain. */
    expectText: z.string().optional(),
    /** A provider refusal (content checker) is a valid result, not an error. */
    refusalOk: z.boolean().default(false),
    /** Clip positions (0-1) for the review frame strip. */
    frames: z.array(z.number().min(0).max(1)).min(1).default([0.05, 0.35, 0.65, 0.95]),
    rubric: z.array(BenchCriterionSchema).min(1),
  })
  .superRefine((value, ctx) => {
    const names = new Set(Object.keys(value.fixtures));
    for (const name of [...value.inputs.references, ...(value.inputs.audio ? [value.inputs.audio] : [])]) {
      if (!names.has(name)) ctx.addIssue({ code: 'custom', message: `input "${name}" is not a fixture` });
    }
    if (value.golden && !names.has(value.golden)) {
      ctx.addIssue({ code: 'custom', message: `golden "${value.golden}" is not a fixture` });
    }
    const refs = value.inputs.references.length;
    const op = value.operation;
    if ((op === 'imageToVideo' || op === 'editImage' || op === 'lipSync') && refs < 1) {
      ctx.addIssue({ code: 'custom', message: `${op} needs at least one reference input` });
    }
    if (op === 'firstLastFrameToVideo' && refs !== 2) {
      ctx.addIssue({ code: 'custom', message: 'firstLastFrameToVideo needs exactly two reference inputs' });
    }
    if ((op === 'generateImage' || op === 'textToVideo' || op === 'generateAudio') && refs > 0) {
      ctx.addIssue({ code: 'custom', message: `${op} takes no reference inputs` });
    }
    if (op === 'lipSync' && !value.inputs.audio) {
      ctx.addIssue({ code: 'custom', message: 'lipSync needs an audio input' });
    }
    const ids = value.rubric.map((criterion) => criterion.id);
    if (new Set(ids).size !== ids.length) ctx.addIssue({ code: 'custom', message: 'rubric ids must be unique' });
  });
export type BenchCase = z.infer<typeof BenchCaseSchema>;

/** How a target runs one operation: a workflow or model slug, params, and an optional price. */
export const BenchOperationSpecSchema = z.object({
  model: z.string().min(1).optional(),
  params: z.record(z.string(), z.unknown()).default({}),
  pricing: ModelPricingSchema.optional(),
});
export type BenchOperationSpec = z.infer<typeof BenchOperationSpecSchema>;

export const BenchTargetSchema = z
  .object({
    description: z.string().optional(),
    provider: ProviderKindSchema,
    /** ComfyUI server for this target; default COMFYUI_URL. */
    comfyui_url: z.string().url().optional(),
    /** Directory with this target's workflow exports; default COMFYUI_WORKFLOWS_DIR or comfyui/workflows. */
    comfyui_workflows_dir: z.string().optional(),
    /** Only the listed operations run on this target; every other case is skipped. */
    operations: z.partialRecord(BenchOperationSchema, BenchOperationSpecSchema),
  })
  .refine((value) => Object.keys(value.operations).length > 0, { message: 'a target needs at least one operation' })
  .refine((value) => value.provider === 'comfyui' || (!value.comfyui_url && !value.comfyui_workflows_dir), {
    message: 'comfyui_url and comfyui_workflows_dir are only for comfyui targets',
  });
export type BenchTarget = z.infer<typeof BenchTargetSchema>;

export const BenchTargetsFileSchema = z.object({
  version: z.literal(1),
  targets: z.record(Slug, BenchTargetSchema),
});

export const BenchConfigSchema = z.object({
  version: z.literal(1),
  budget_usd: z.number().min(0),
  batch_cap_usd: z.number().positive().optional(),
  /** Output size for cases without their own width/height. */
  master: z
    .object({ width: z.number().int().positive(), height: z.number().int().positive() })
    .default({ width: 1920, height: 1080 }),
  sets: z.record(Slug, z.object({ description: z.string() })).default({}),
});
export type BenchConfig = z.infer<typeof BenchConfigSchema>;

/** Rubric scores for one result, written by the art-director pass. */
export const BenchScoreSchema = z.object({
  criteria: z.record(z.string(), z.union([z.literal(0), z.literal(1), z.literal(2)])),
  verdict: z.enum(['pass', 'weak', 'fail']),
  notes: z.string().default(''),
});
export type BenchScore = z.infer<typeof BenchScoreSchema>;

/** Keyed by result key `<case>/<target>/<seed index>`. */
export const BenchScoresFileSchema = z.record(z.string(), BenchScoreSchema);

export interface BenchPaths {
  root: string;
  config: string;
  targets: string;
  cases: string;
  fixtures: string;
  runs: string;
  state: string;
  manifest: string;
  timings: string;
}

export function benchPaths(root = join(repoRoot(), 'bench')): BenchPaths {
  return {
    root,
    config: join(root, 'bench.yaml'),
    targets: join(root, 'targets.yaml'),
    cases: join(root, 'cases'),
    fixtures: join(root, 'fixtures'),
    runs: join(root, 'runs'),
    state: join(root, 'state.json'),
    manifest: join(root, 'manifest.jsonl'),
    timings: join(root, 'timings.jsonl'),
  };
}

function formatIssues(error: z.ZodError): string {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`).join('; ');
}

async function readYaml(path: string): Promise<unknown> {
  if (!existsSync(path)) throw new ConfigError(`Missing ${path}.`);
  return parseYaml(await readFile(path, 'utf8'));
}

export async function loadBenchConfig(paths = benchPaths()): Promise<BenchConfig> {
  const parsed = BenchConfigSchema.safeParse(await readYaml(paths.config));
  if (!parsed.success) throw new ValidationError(`${paths.config}: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

export async function loadBenchTargets(paths = benchPaths()): Promise<Record<string, BenchTarget>> {
  const parsed = BenchTargetsFileSchema.safeParse(await readYaml(paths.targets));
  if (!parsed.success) throw new ValidationError(`${paths.targets}: ${formatIssues(parsed.error)}`);
  return parsed.data.targets;
}

export function parseBenchCase(data: unknown, label: string): BenchCase {
  const parsed = BenchCaseSchema.safeParse(data);
  if (!parsed.success) throw new ValidationError(`${label}: ${formatIssues(parsed.error)}`);
  return parsed.data;
}

/** Every case in `bench/cases/*.yaml`, sorted by file name; the id must match the file name. */
export async function loadBenchCases(paths = benchPaths()): Promise<BenchCase[]> {
  if (!existsSync(paths.cases)) return [];
  const names = (await readdir(paths.cases)).filter((name) => /\.ya?ml$/.test(name)).sort();
  const cases: BenchCase[] = [];
  for (const name of names) {
    const path = join(paths.cases, name);
    const value = parseBenchCase(parseYaml(await readFile(path, 'utf8')), path);
    if (value.id !== name.replace(/\.ya?ml$/, '')) {
      throw new ValidationError(`${path}: id "${value.id}" does not match the file name.`);
    }
    cases.push(value);
  }
  return cases;
}

/** Where `bench import` puts a fixture, relative to the bench root. */
export function fixturePath(benchCase: BenchCase, name: string): string {
  const fixture = benchCase.fixtures[name];
  if (!fixture) throw new ValidationError(`Case "${benchCase.id}" has no fixture "${name}".`);
  const extension = fixture.cut ? '.wav' : extname(fixture.from) || '.bin';
  return join('fixtures', benchCase.id, `${name}${extension}`);
}

/** Cases selected by set and/or explicit ids; unknown ids are an error. */
export function selectBenchCases(cases: BenchCase[], options: { set?: string; ids?: string[] }): BenchCase[] {
  const ids = options.ids?.filter(Boolean) ?? [];
  for (const id of ids) {
    if (!cases.some((value) => value.id === id)) throw new ValidationError(`Unknown bench case "${id}".`);
  }
  return cases.filter(
    (value) => (ids.length === 0 || ids.includes(value.id)) && (!options.set || value.sets.includes(options.set)),
  );
}

/** Weighted rubric score in 0-1, or undefined when a criterion is unscored. */
export function rubricScore(rubric: BenchCriterion[], score: BenchScore): number | undefined {
  let total = 0;
  let weights = 0;
  for (const criterion of rubric) {
    const value = score.criteria[criterion.id];
    if (value === undefined) return undefined;
    total += value * criterion.weight;
    weights += 2 * criterion.weight;
  }
  return weights === 0 ? undefined : total / weights;
}
