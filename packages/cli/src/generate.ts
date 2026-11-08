import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import {
  ConfigError,
  ValidationError,
  assertAffordable,
  effectiveBatchCap,
  ensureDir,
  estimateCost,
  formatUsd,
  loadModelsConfig,
  loadProject,
  providerForRole,
  recordSpend,
  remainingBudget,
  repoRoot,
  resolveModelRole,
  saveState,
  type ModelPricing,
  type ProjectConfig,
  type ProviderKind,
} from '@coreslopper/core';
import {
  GenerationRunner,
  createProvider,
  type GenerationRequest,
  type Operation,
} from '@coreslopper/providers';
import { probeDuration } from './media.js';

export const BatchItemSchema = z
  .object({
    operation: z.enum(['generateImage', 'editImage', 'imageToVideo', 'lipSync']),
    role: z.string().min(1),
    prompt: z.string().min(1),
    references: z.array(z.string()).default([]),
    /** Vocal segment for lipSync, relative to the project (see `audio-segment`). */
    audio: z.string().optional(),
    seed: z.number().int().optional(),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    durationSeconds: z.number().positive().optional(),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .refine((item) => item.operation !== 'lipSync' || (item.audio && item.references.length > 0), {
    message: 'lipSync needs "audio" (a vocal segment) and a face image as the first reference.',
  });

export const BatchSchema = z.array(BatchItemSchema).min(1);

export interface GenerateOptions {
  projectDir: string;
  batchPath: string;
  dryRun?: boolean;
}

interface ResolvedItem {
  item: z.infer<typeof BatchItemSchema>;
  provider: ProviderKind;
  model: string;
  params: Record<string, unknown>;
  pricing: ModelPricing;
  cost: number;
  references: string[];
  audio?: string;
}

function roleOverride(config: ProjectConfig, role: string): Record<string, unknown> {
  const value = config.models[role];
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function resolveItem(
  item: z.infer<typeof BatchItemSchema>,
  config: ProjectConfig,
  models: Awaited<ReturnType<typeof loadModelsConfig>>,
  projectRoot: string,
): ResolvedItem {
  const role = models.roles[item.role];
  if (!role) throw new ValidationError(`Unknown model role "${item.role}". Add it to config/models.yaml.`);
  const override = roleOverride(config, item.role);
  const provider = providerForRole(config, item.role);
  if (item.operation === 'lipSync' && provider === 'higgsfield') {
    throw new ConfigError(
      'The Higgsfield adapter does not support lip-sync. Set providers.lipsync to "fal" and provide FAL_KEY, or keep providers.video on fal.',
    );
  }
  const resolved = resolveModelRole(role, provider, override, item.role);
  const params = { ...resolved.params, ...item.params };
  const pricing =
    resolved.pricing ?? (provider === 'mock' ? ({ unit: 'request', usd: 0 } satisfies ModelPricing) : undefined);
  if (!pricing) {
    throw new ConfigError(
      `Role "${item.role}" has no pricing entry for provider "${provider}". ` +
        'Add pricing to config/models.yaml or override models.<role>.pricing in project.yaml.',
    );
  }

  const audio = item.audio
    ? resolve(item.audio.startsWith('/') ? item.audio : join(projectRoot, item.audio))
    : undefined;
  if (audio && !existsSync(audio)) {
    throw new ValidationError(`Missing audio input: ${audio}`);
  }
  // A lip-sync clip is billed by the length of its driving audio.
  const audioSeconds = audio ? Math.ceil(probeDuration(audio)) : undefined;
  if (audioSeconds !== undefined && resolved.maxDuration && audioSeconds > resolved.maxDuration) {
    throw new ValidationError(
      `Audio ${item.audio} is ${audioSeconds}s; role "${item.role}" allows at most ${resolved.maxDuration}s.`,
    );
  }

  const units =
    pricing.unit === 'second'
      ? audioSeconds ?? item.durationSeconds ?? Number(params.duration ?? resolved.maxDuration ?? 5)
      : pricing.unit === 'image'
        ? Number(params.num_images ?? params.batch_size ?? 1)
        : 1;
  const cost = estimateCost(units, pricing);

  const references = item.references.map((reference) =>
    resolve(reference.startsWith('/') ? reference : join(projectRoot, reference)),
  );
  for (const reference of references) {
    if (!existsSync(reference)) {
      throw new ValidationError(`Missing reference image: ${reference}`);
    }
  }

  return {
    item,
    provider,
    model: resolved.model,
    params,
    pricing,
    cost,
    references,
    audio,
  };
}

export async function generateBatch(options: GenerateOptions): Promise<void> {
  const project = await loadProject(options.projectDir);
  const batchRaw = await readFile(resolve(options.batchPath), 'utf8');
  let batchData: unknown;
  try {
    batchData = JSON.parse(batchRaw);
  } catch {
    batchData = parseYaml(batchRaw);
  }
  const batch = BatchSchema.parse(batchData);
  const models = await loadModelsConfig();
  const resolved = batch.map((item) => {
    const value = resolveItem(item, project.config, models, project.paths.root);
    return value.provider === 'mock' ? { ...value, cost: 0 } : value;
  });
  const totalEstimate = resolved.reduce((sum, item) => sum + item.cost, 0);

  console.log(`Batch: ${resolved.length} generation(s), worst-case estimate ${formatUsd(totalEstimate)}`);
  console.log(
    `Budget: ${formatUsd(remainingBudget(project.state))} remaining · batch cap ${formatUsd(
      effectiveBatchCap(project.config, project.state),
    )}`,
  );
  assertAffordable(project.config, project.state, totalEstimate, 'generation batch');
  if (options.dryRun) {
    for (const item of resolved) {
      console.log(
        `  ${item.item.operation} ${item.item.role} -> ${item.provider}/${item.model} (${formatUsd(item.cost)})`,
      );
    }
    return;
  }

  const cacheDir = join(repoRoot(), '.cache', 'generations');
  const runners = new Map<ProviderKind, GenerationRunner>();
  for (const provider of new Set(resolved.map((item) => item.provider))) {
    runners.set(
      provider,
      new GenerationRunner({
        provider: createProvider(provider),
        cacheDir,
        manifestPath: project.paths.manifest,
      }),
    );
  }

  let actualSpend = 0;
  let cacheHits = 0;
  for (const [index, item] of resolved.entries()) {
    const runner = runners.get(item.provider);
    if (!runner) throw new ConfigError(`No generation runner for provider "${item.provider}".`);
    const outputDir = join(project.paths.assets, item.item.role.replaceAll('.', '/'));
    await ensureDir(outputDir);
    const request: GenerationRequest = {
      operation: item.item.operation as Operation,
      role: item.item.role,
      model: item.model,
      prompt: item.item.prompt,
      seed: item.item.seed,
      references: item.references,
      audio: item.audio,
      width: item.item.width ?? project.config.formats.master.width,
      height: item.item.height ?? project.config.formats.master.height,
      durationSeconds: item.item.durationSeconds,
      params: item.params,
      outputDir,
      projectDir: project.paths.root,
      estimatedCostUsd: item.cost,
    };
    const result = await runner.run(request);
    if (result.cached) {
      cacheHits += 1;
      console.log(`[${index + 1}/${resolved.length}] ${item.item.role}: cache hit ${result.hash.slice(0, 12)}`);
    } else {
      actualSpend += result.costUsd;
      recordSpend(project.state, result.costUsd);
      await saveState(project.paths.state, project.state);
      console.log(
        `[${index + 1}/${resolved.length}] ${item.item.role}: ${result.files.length} file(s), ${formatUsd(result.costUsd)}`,
      );
    }
  }

  console.log(
    `Done. Actual spend ${formatUsd(actualSpend)} · cache hits ${cacheHits}/${resolved.length} · remaining ${formatUsd(
      remainingBudget(project.state),
    )}`,
  );
}
