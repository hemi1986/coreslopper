import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { ConfigError } from '@coreslopper/core';
import {
  collectUrls,
  delay,
  downloadOutputs,
  fetchJsonWithRetry,
  fileToDataUri,
  mimeForPath,
  type FetchLike,
} from './http.js';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';

export interface FalProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  queueUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
  /** fal storage REST base used to upload input files for video and lip-sync models. */
  storageUrl?: string;
}

function fieldName(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

/**
 * Split adapter-only params from the model body. `reference_field` names the
 * start-frame field; the legacy `image_param` is accepted as an alias.
 */
function adapterParams(params: Record<string, unknown> | undefined): {
  field: unknown;
  endField: unknown;
  body: Record<string, unknown>;
} {
  const { reference_field, end_reference_field, image_param, ...body } = params ?? {};
  return { field: reference_field ?? image_param, endField: end_reference_field, body };
}

export class FalProvider implements Provider {
  readonly name = 'fal';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly queueUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly storageUrl: string;
  private readonly uploads = new Map<string, string>();

  constructor(options: FalProviderOptions = {}) {
    const key = options.apiKey ?? process.env.FAL_KEY;
    if (!key) {
      throw new ConfigError('FAL_KEY is not set. Add it to .env or use the mock provider.');
    }
    this.apiKey = key;
    this.baseUrl = options.baseUrl ?? 'https://fal.run';
    this.queueUrl = options.queueUrl ?? 'https://queue.fal.run';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.storageUrl = options.storageUrl ?? 'https://rest.alpha.fal.ai';
  }

  /**
   * Upload a local file to fal storage and return its URL. Video and lip-sync
   * models download their inputs and reject data URIs, so they get real URLs.
   */
  async uploadFile(path: string): Promise<string> {
    const cached = this.uploads.get(path);
    if (cached) return cached;
    const contentType = mimeForPath(path);
    const initiated = await fetchJsonWithRetry(
      'fal.ai storage',
      `${this.storageUrl}/storage/upload/initiate?storage_type=fal-cdn-v3`,
      {
        method: 'POST',
        headers: { Authorization: `Key ${this.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ content_type: contentType, file_name: basename(path) }),
      },
      this.requestTimeoutMs,
      this.fetchImpl,
    );
    const uploadUrl = String(initiated.upload_url ?? '');
    const fileUrl = String(initiated.file_url ?? '');
    if (!uploadUrl || !fileUrl) {
      throw new Error(`fal.ai storage did not return an upload URL: ${JSON.stringify(initiated).slice(0, 300)}`);
    }
    const response = await this.fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: { 'Content-Type': contentType },
      body: await readFile(path),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    if (!response.ok) {
      throw new Error(`fal.ai storage upload failed for ${basename(path)}: ${response.status}`);
    }
    this.uploads.set(path, fileUrl);
    return fileUrl;
  }

  async generateImage(input: ProviderInput): Promise<ProviderOutput> {
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(input.width && input.height ? { image_size: { width: input.width, height: input.height } } : {}),
      ...input.params,
    });
  }

  async editImage(input: ProviderInput): Promise<ProviderOutput> {
    const references = input.references ?? [];
    if (references.length === 0) {
      throw new Error('editImage requires at least one reference image.');
    }
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      image_urls: await Promise.all(references.map(fileToDataUri)),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...input.params,
    });
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const { body: params } = adapterParams(input.params);
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      duration: input.durationSeconds ?? 5,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) {
      throw new Error('imageToVideo requires a start-frame reference image.');
    }
    // Models disagree on the start-frame field (Kling v4 uses start_image_url),
    // so a model can name it with the adapter-only reference_field param.
    const { field, body: params } = adapterParams(input.params);
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      [fieldName(field, 'image_url')]: await this.uploadFile(reference),
      duration: input.durationSeconds ?? 5,
      ...params,
    });
  }

  async firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const [start, end] = input.references ?? [];
    if (!start || !end) {
      throw new Error('firstLastFrameToVideo requires a start frame and an end frame.');
    }
    const { field, endField, body: params } = adapterParams(input.params);
    if (typeof endField !== 'string' || endField.length === 0) {
      throw new Error(
        `Model ${input.model} has no end_reference_field param. Set it in config/models.yaml to the field that takes the end frame.`,
      );
    }
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      [fieldName(field, 'image_url')]: await this.uploadFile(start),
      [endField]: await this.uploadFile(end),
      duration: input.durationSeconds ?? 5,
      ...params,
    });
  }

  async lipSync(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) {
      throw new Error('lipSync requires a face reference image.');
    }
    if (!input.audio) {
      throw new Error('lipSync requires an audio file.');
    }
    const { field, body: params } = adapterParams(input.params);
    return this.runModel(input, {
      [fieldName(field, 'image_url')]: await this.uploadFile(reference),
      audio_url: await this.uploadFile(input.audio),
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...params,
    });
  }

  private async runModel(input: ProviderInput, body: Record<string, unknown>): Promise<ProviderOutput> {
    const model = input.model.replace(/^\/+/, '');
    const headers = {
      Authorization: `Key ${this.apiKey}`,
      'Content-Type': 'application/json',
    };

    let result: Record<string, unknown>;
    try {
      const accepted = await fetchJsonWithRetry(
        'fal.ai',
        `${this.queueUrl}/${model}`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        this.requestTimeoutMs,
        this.fetchImpl,
      );
      const statusUrl = String(accepted.status_url ?? `${this.queueUrl}/${model}/requests/${accepted.request_id}/status`);
      const responseUrl = String(accepted.response_url ?? `${this.queueUrl}/${model}/requests/${accepted.request_id}`);
      result = await this.poll(statusUrl, responseUrl, headers);
    } catch (error) {
      // Some models are synchronous-only. Fall back to the direct endpoint.
      if (error instanceof Error && /\b(404|405)\b/.test(error.message)) {
        result = await fetchJsonWithRetry(
          'fal.ai',
          `${this.baseUrl}/${model}`,
          { method: 'POST', headers, body: JSON.stringify(body) },
          this.requestTimeoutMs,
          this.fetchImpl,
        );
      } else {
        throw error;
      }
    }

    const urls = [...new Set(collectUrls(result))];
    if (urls.length === 0) {
      throw new Error(`fal.ai returned no output URLs for ${model}: ${JSON.stringify(result).slice(0, 500)}`);
    }
    return {
      files: await downloadOutputs('fal', urls, input.outputDir, this.requestTimeoutMs, this.fetchImpl),
      raw: result,
    };
  }

  private async poll(
    statusUrl: string,
    responseUrl: string,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const started = Date.now();
    while (Date.now() - started < this.requestTimeoutMs) {
      const status = await fetchJsonWithRetry(
        'fal.ai',
        statusUrl,
        { method: 'GET', headers },
        this.requestTimeoutMs,
        this.fetchImpl,
      );
      const value = String(status.status ?? '').toUpperCase();
      if (value === 'COMPLETED') {
        return fetchJsonWithRetry(
          'fal.ai',
          responseUrl,
          { method: 'GET', headers },
          this.requestTimeoutMs,
          this.fetchImpl,
        );
      }
      if (value === 'FAILED' || value === 'CANCELLED') {
        throw new Error(`fal.ai request ${value}: ${JSON.stringify(status).slice(0, 500)}`);
      }
      await delay(this.pollIntervalMs);
    }
    throw new Error(`fal.ai request timed out after ${this.requestTimeoutMs}ms.`);
  }
}
