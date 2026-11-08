import { copyFile, mkdir, readFile, writeFile, appendFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative } from 'node:path';
import { createHash } from 'node:crypto';
import { hashFile, hashObject } from '@coreslopper/core';
import type {
  GenerationRequest,
  GenerationResult,
  GenerationRunnerOptions,
  ProviderOutput,
} from './types.js';

interface CacheRecord {
  result: Omit<GenerationResult, 'cached'>;
}

function defaultSeed(request: GenerationRequest): number {
  const digest = hashObject({
    model: request.model,
    prompt: request.prompt,
    operation: request.operation,
  });
  return Number.parseInt(digest.slice(0, 8), 16) % 2_147_483_647;
}

function outputName(hash: string, index: number, extension: string): string {
  return `${hash.slice(0, 16)}-${index}${extension}`;
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

async function copyOutputs(files: string[], outputDir: string, hash: string): Promise<string[]> {
  await mkdir(outputDir, { recursive: true });
  const copied: string[] = [];
  for (const [index, file] of files.entries()) {
    const extension = extname(file) || '.bin';
    const destination = join(outputDir, outputName(hash, index, extension));
    await copyFile(file, destination);
    copied.push(destination);
  }
  return copied;
}

export class GenerationRunner {
  constructor(private readonly options: GenerationRunnerOptions) {}

  async run(request: GenerationRequest): Promise<GenerationResult> {
    const references = request.references ?? [];
    const referenceHashes = await Promise.all(
      references.map(async (path) => ({
        path,
        sha256: await hashFile(path),
      })),
    );
    if (request.operation === 'lipSync' && !request.audio) {
      throw new Error('lipSync requires an audio file.');
    }
    const audioHash = request.audio ? await hashFile(request.audio) : undefined;
    const seed = request.seed ?? defaultSeed(request);
    const params = request.params ?? {};
    const hash = hashObject({
      operation: request.operation,
      provider: this.options.provider.name,
      model: request.model,
      prompt: request.prompt,
      negativePrompt: request.negativePrompt,
      seed,
      width: request.width,
      height: request.height,
      durationSeconds: request.durationSeconds,
      params,
      references: referenceHashes,
      ...(audioHash ? { audio: audioHash } : {}),
    });

    const cacheDir = join(this.options.cacheDir, hash);
    const cacheRecordPath = join(cacheDir, 'result.json');
    const cached = await this.readCache(cacheRecordPath);
    if (cached) {
      const copied = await copyOutputs(cached.result.files, request.outputDir, hash);
      const result: GenerationResult = {
        ...cached.result,
        files: copied,
        cached: true,
        costUsd: 0,
      };
      await this.appendManifest(request, result, 'ok');
      return result;
    }

    await this.options.beforeGenerate?.(request.estimatedCostUsd);
    await mkdir(cacheDir, { recursive: true });

    let output: ProviderOutput;
    try {
      const input = {
        model: request.model,
        prompt: request.prompt,
        negativePrompt: request.negativePrompt,
        references,
        audio: request.audio,
        seed,
        width: request.width,
        height: request.height,
        durationSeconds: request.durationSeconds,
        params,
        outputDir: cacheDir,
        idempotencyKey: hash,
      };
      if (request.operation === 'generateImage') output = await this.options.provider.generateImage(input);
      else if (request.operation === 'editImage') output = await this.options.provider.editImage(input);
      else if (request.operation === 'lipSync') output = await this.options.provider.lipSync(input);
      else output = await this.options.provider.imageToVideo(input);
    } catch (error) {
      const failed: GenerationResult = {
        id: `gen_${hash.slice(0, 12)}`,
        hash,
        operation: request.operation,
        role: request.role,
        provider: this.options.provider.name,
        model: request.model,
        prompt: request.prompt,
        seed,
        references,
        params,
        costUsd: 0,
        cached: false,
        files: [],
        createdAt: new Date().toISOString(),
      };
      await this.appendManifest(request, failed, 'failed', error instanceof Error ? error.message : String(error));
      throw error;
    }

    if (output.files.length === 0) throw new Error(`${this.options.provider.name} returned no files.`);
    for (const file of output.files) {
      if (!(await fileExists(file))) throw new Error(`Provider reported a missing file: ${file}`);
    }

    const cachedResult: Omit<GenerationResult, 'cached'> = {
      id: `gen_${hash.slice(0, 12)}`,
      hash,
      operation: request.operation,
      role: request.role,
      provider: this.options.provider.name,
      model: request.model,
      prompt: request.prompt,
      seed,
      references,
      ...(request.audio ? { audio: request.audio } : {}),
      params,
      costUsd: request.estimatedCostUsd,
      files: output.files,
      createdAt: new Date().toISOString(),
    };
    await writeFile(cacheRecordPath, `${JSON.stringify({ result: cachedResult }, null, 2)}\n`, 'utf8');

    const copied = await copyOutputs(output.files, request.outputDir, hash);
    const result: GenerationResult = {
      ...cachedResult,
      files: copied,
      cached: false,
    };
    await this.appendManifest(request, result, 'ok');
    return result;
  }

  private async readCache(path: string): Promise<CacheRecord | undefined> {
    if (!(await fileExists(path))) return undefined;
    try {
      const parsed = JSON.parse(await readFile(path, 'utf8')) as CacheRecord;
      if (!parsed.result?.files?.length) return undefined;
      for (const file of parsed.result.files) {
        if (!(await fileExists(file))) return undefined;
      }
      return parsed;
    } catch {
      return undefined;
    }
  }

  private async appendManifest(
    request: GenerationRequest,
    result: GenerationResult,
    status: 'ok' | 'failed',
    error?: string,
  ): Promise<void> {
    const baseDir = request.projectDir ?? process.cwd();
    const record = {
      ...result,
      status,
      ...(error ? { error } : {}),
      files: result.files.map((file) => relative(baseDir, file)),
      references: result.references.map((file) => relative(baseDir, file)),
      ...(result.audio ? { audio: relative(baseDir, result.audio) } : {}),
    };
    await mkdir(dirname(this.options.manifestPath), { recursive: true });
    await appendFile(this.options.manifestPath, `${JSON.stringify(record)}\n`, 'utf8');
  }
}

export function newGenerationId(): string {
  return `gen_${createHash('sha256').update(String(Date.now())).digest('hex').slice(0, 12)}`;
}
