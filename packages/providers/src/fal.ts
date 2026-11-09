import { ConfigError } from '@coreslopper/core';
import { collectUrls, delay, downloadOutputs, fetchJsonWithRetry, fileToDataUri, type FetchLike } from './http.js';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';

export interface FalProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  queueUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
}

export class FalProvider implements Provider {
  readonly name = 'fal';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly queueUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;

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

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) {
      throw new Error('imageToVideo requires a start-frame reference image.');
    }
    // Models disagree on the start-frame field (Kling v4 uses start_image_url),
    // so a model can name it with the adapter-only reference_field param.
    const { reference_field: field, ...params } = input.params ?? {};
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      [typeof field === 'string' && field.length > 0 ? field : 'image_url']: await fileToDataUri(reference),
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
    return this.runModel(input, {
      image_url: await fileToDataUri(reference),
      audio_url: await fileToDataUri(input.audio),
      ...(input.prompt ? { prompt: input.prompt } : {}),
      ...input.params,
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
