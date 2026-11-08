import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { ConfigError } from '@coreslopper/core';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';

export interface FalProviderOptions {
  apiKey?: string;
  baseUrl?: string;
  queueUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
}

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.avif']);
const VIDEO_EXTENSIONS = new Set(['.mp4', '.webm', '.mov', '.mkv']);

function mimeForPath(path: string): string {
  const extension = extname(path).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.avif') return 'image/avif';
  if (extension === '.gif') return 'image/gif';
  if (extension === '.mp4') return 'video/mp4';
  if (extension === '.webm') return 'video/webm';
  if (extension === '.mp3') return 'audio/mpeg';
  if (extension === '.wav') return 'audio/wav';
  if (extension === '.m4a') return 'audio/mp4';
  if (extension === '.ogg') return 'audio/ogg';
  return 'application/octet-stream';
}

async function toDataUri(path: string): Promise<string> {
  const data = await readFile(path);
  return `data:${mimeForPath(path)};base64,${data.toString('base64')}`;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

class NonRetryableError extends Error {}

async function fetchJson(
  url: string,
  init: RequestInit,
  timeoutMs: number,
  attempts = 4,
): Promise<Record<string, unknown>> {
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url, { ...init, signal: AbortSignal.timeout(timeoutMs) });
      const text = await response.text();
      let body: unknown;
      try {
        body = text ? JSON.parse(text) : {};
      } catch {
        body = { raw: text };
      }
      if (!response.ok) {
        const message = `fal.ai ${response.status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`;
        if (!isRetryableStatus(response.status)) throw new NonRetryableError(message);
        if (attempt < attempts - 1) {
          await delay(500 * 2 ** attempt);
          continue;
        }
        throw new Error(message);
      }
      return body as Record<string, unknown>;
    } catch (error) {
      if (error instanceof NonRetryableError) throw error;
      lastError = error;
      if (attempt >= attempts - 1) break;
      await delay(500 * 2 ** attempt);
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function collectUrls(value: unknown, keyHint = ''): string[] {
  const found: string[] = [];
  if (typeof value === 'string') {
    if (/^https?:\/\//.test(value)) {
      const extension = extname(new URL(value).pathname).toLowerCase();
      if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension) || keyHint === 'url' || keyHint.endsWith('_url')) {
        found.push(value);
      }
    }
    return found;
  }
  if (Array.isArray(value)) {
    for (const item of value) found.push(...collectUrls(item, keyHint));
    return found;
  }
  if (value && typeof value === 'object') {
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      found.push(...collectUrls(item, key));
    }
  }
  return found;
}

function extensionFor(contentType: string | null, url: string): string {
  const type = (contentType ?? '').split(';')[0]?.trim().toLowerCase();
  if (type === 'image/png') return '.png';
  if (type === 'image/jpeg') return '.jpg';
  if (type === 'image/webp') return '.webp';
  if (type === 'image/svg+xml') return '.svg';
  if (type === 'video/mp4') return '.mp4';
  if (type === 'video/webm') return '.webm';
  const extension = extname(new URL(url).pathname).toLowerCase();
  if (IMAGE_EXTENSIONS.has(extension) || VIDEO_EXTENSIONS.has(extension)) return extension;
  return '.bin';
}

export class FalProvider implements Provider {
  readonly name = 'fal';
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly queueUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;

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
      image_urls: await Promise.all(references.map(toDataUri)),
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...input.params,
    });
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) {
      throw new Error('imageToVideo requires a start-frame reference image.');
    }
    return this.runModel(input, {
      prompt: input.prompt,
      seed: input.seed,
      image_url: await toDataUri(reference),
      duration: input.durationSeconds ?? 5,
      generate_audio: false,
      ...input.params,
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
      image_url: await toDataUri(reference),
      audio_url: await toDataUri(input.audio),
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
      const accepted = await fetchJson(
        `${this.queueUrl}/${model}`,
        { method: 'POST', headers, body: JSON.stringify(body) },
        this.requestTimeoutMs,
      );
      const statusUrl = String(accepted.status_url ?? `${this.queueUrl}/${model}/requests/${accepted.request_id}/status`);
      const responseUrl = String(accepted.response_url ?? `${this.queueUrl}/${model}/requests/${accepted.request_id}`);
      result = await this.poll(statusUrl, responseUrl, headers);
    } catch (error) {
      // Some models are synchronous-only. Fall back to the direct endpoint.
      if (error instanceof Error && /\b(404|405)\b/.test(error.message)) {
        result = await fetchJson(
          `${this.baseUrl}/${model}`,
          { method: 'POST', headers, body: JSON.stringify(body) },
          this.requestTimeoutMs,
        );
      } else {
        throw error;
      }
    }

    const urls = [...new Set(collectUrls(result))];
    if (urls.length === 0) {
      throw new Error(`fal.ai returned no output URLs for ${model}: ${JSON.stringify(result).slice(0, 500)}`);
    }
    return { files: await this.download(urls, input.outputDir), raw: result };
  }

  private async poll(
    statusUrl: string,
    responseUrl: string,
    headers: Record<string, string>,
  ): Promise<Record<string, unknown>> {
    const started = Date.now();
    while (Date.now() - started < this.requestTimeoutMs) {
      const status = await fetchJson(statusUrl, { method: 'GET', headers }, this.requestTimeoutMs);
      const value = String(status.status ?? '').toUpperCase();
      if (value === 'COMPLETED') {
        return fetchJson(responseUrl, { method: 'GET', headers }, this.requestTimeoutMs);
      }
      if (value === 'FAILED' || value === 'CANCELLED') {
        throw new Error(`fal.ai request ${value}: ${JSON.stringify(status).slice(0, 500)}`);
      }
      await delay(this.pollIntervalMs);
    }
    throw new Error(`fal.ai request timed out after ${this.requestTimeoutMs}ms.`);
  }

  private async download(urls: string[], outputDir: string): Promise<string[]> {
    await mkdir(outputDir, { recursive: true });
    const files: string[] = [];
    for (const [index, url] of urls.entries()) {
      const response = await fetch(url, { signal: AbortSignal.timeout(this.requestTimeoutMs) });
      if (!response.ok) throw new Error(`Failed to download fal.ai output ${url}: ${response.status}`);
      const extension = extensionFor(response.headers.get('content-type'), url);
      const name = createHash('sha256').update(url).digest('hex').slice(0, 16);
      const path = join(outputDir, `fal-${name}-${index}${extension}`);
      await writeFile(path, Buffer.from(await response.arrayBuffer()));
      files.push(path);
    }
    return files;
  }
}
