import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { ConfigError } from '@coreslopper/core';
import {
  collectUrls,
  delay,
  downloadOutputs,
  fetchJsonWithRetry,
  type FetchLike,
} from './http.js';
import type { Provider, ProviderInput, ProviderOutput } from './types.js';

export interface HiggsfieldProviderOptions {
  /** Complete credential, usually `key_id:key_secret`. */
  credentials?: string;
  baseUrl?: string;
  requestTimeoutMs?: number;
  pollIntervalMs?: number;
  fetchImpl?: FetchLike;
}

/** Content types accepted by the Higgsfield upload endpoint. */
const UPLOAD_CONTENT_TYPES = new Map<string, string>([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.wav', 'audio/wav'],
  ['.mp4', 'video/mp4'],
]);

const TERMINAL_FAILURES = new Set(['failed', 'nsfw', 'canceled', 'cancelled']);
const COMPLETED = 'completed';
const OUTPUT_KEYS = ['images', 'image', 'video', 'videos', 'audio', 'audios', 'output', 'outputs', 'files'];

/**
 * Resolve Higgsfield credentials from the environment.
 *
 * Accepts the complete credential (`HIGGSFIELD_API_KEY`, `HF_API_KEY`, `HF_KEY`,
 * or `HF_CREDENTIALS`) or the split key ID and secret (`HF_API_KEY_ID` and
 * `HF_API_KEY_SECRET`).
 */
export function resolveHiggsfieldCredentials(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const combined = env.HIGGSFIELD_API_KEY ?? env.HF_API_KEY ?? env.HF_KEY ?? env.HF_CREDENTIALS;
  if (combined?.trim()) return combined.trim().replace(/^Key\s+/i, '');
  const id = env.HF_API_KEY_ID?.trim();
  const secret = env.HF_API_KEY_SECRET?.trim();
  if (id && secret) return `${id}:${secret}`;
  return undefined;
}

function normalizeCredentials(value: string): string {
  return value.trim().replace(/^Key\s+/i, '');
}

function normalizeSeed(seed: number): number {
  const value = Math.abs(Math.trunc(seed)) % 1_000_000;
  return value || 1;
}

/**
 * Pull a boolean adapter option out of the model params. These options steer
 * the adapter and are not sent to the provider.
 */
function takeSwitch(params: Record<string, unknown>, key: string): [boolean, Record<string, unknown>] {
  const { [key]: value, ...rest } = params;
  return [value === true, rest];
}

function takeReferenceField(
  params: Record<string, unknown>,
  fallback = 'image_urls',
): [string, Record<string, unknown>] {
  const { reference_field: value, ...rest } = params;
  return [typeof value === 'string' && value.length > 0 ? value : fallback, rest];
}

function takeEndField(params: Record<string, unknown>): [string | undefined, Record<string, unknown>] {
  const { end_reference_field: value, ...rest } = params;
  return [typeof value === 'string' && value.length > 0 ? value : undefined, rest];
}

function collectOutputUrls(result: Record<string, unknown>): string[] {
  const urls: string[] = [];
  for (const key of OUTPUT_KEYS) {
    if (result[key] === undefined) continue;
    urls.push(...collectUrls(result[key], 'url'));
  }
  return [...new Set(urls)];
}

export class HiggsfieldProvider implements Provider {
  readonly name = 'higgsfield';
  private readonly credentials: string;
  private readonly baseUrl: string;
  private readonly requestTimeoutMs: number;
  private readonly pollIntervalMs: number;
  private readonly fetchImpl: FetchLike;
  private readonly uploadCache = new Map<string, string>();

  constructor(options: HiggsfieldProviderOptions = {}) {
    const credentials = options.credentials ?? resolveHiggsfieldCredentials();
    if (!credentials) {
      throw new ConfigError(
        'Higgsfield credentials are not set. Add HIGGSFIELD_API_KEY (key_id:key_secret) to .env, ' +
          'or set HF_API_KEY_ID and HF_API_KEY_SECRET, or use the mock provider.',
      );
    }
    this.credentials = normalizeCredentials(credentials);
    this.baseUrl = options.baseUrl ?? 'https://api.higgsfield.ai';
    this.requestTimeoutMs = options.requestTimeoutMs ?? 600_000;
    this.pollIntervalMs = options.pollIntervalMs ?? 1_000;
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async generateImage(input: ProviderInput): Promise<ProviderOutput> {
    const [, afterReference] = takeReferenceField(input.params ?? {}, 'image_url');
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendNegative, params] = takeSwitch(afterSeedSwitch, 'send_negative_prompt');
    return this.runModel(input, {
      prompt: input.prompt,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async editImage(input: ProviderInput): Promise<ProviderOutput> {
    const references = input.references ?? [];
    if (references.length === 0) {
      throw new Error('editImage requires at least one reference image.');
    }
    const [field, afterReference] = takeReferenceField(input.params ?? {});
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendNegative, params] = takeSwitch(afterSeedSwitch, 'send_negative_prompt');
    const urls = await Promise.all(references.map((reference) => this.uploadReference(reference)));
    if (!field.endsWith('s') && urls.length > 1) {
      throw new Error(
        `Higgsfield reference field "${field}" accepts one image, but ${urls.length} references were supplied.`,
      );
    }
    const referenceBody = field.endsWith('s') ? { [field]: urls } : { [field]: urls[0] };
    return this.runModel(input, {
      prompt: input.prompt,
      ...referenceBody,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async textToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const [, afterReference] = takeReferenceField(takeEndField(input.params ?? {})[1], 'image_url');
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendNegative, params] = takeSwitch(afterSeedSwitch, 'send_negative_prompt');
    return this.runModel(input, {
      prompt: input.prompt,
      duration: input.durationSeconds ?? 5,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async firstLastFrameToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const [start, end] = input.references ?? [];
    if (!start || !end) {
      throw new Error('firstLastFrameToVideo requires a start frame and an end frame.');
    }
    const [endField, afterEnd] = takeEndField(input.params ?? {});
    if (!endField) {
      throw new Error(
        `Model ${input.model} has no end_reference_field param. Set it in config/models.yaml to the field that takes the end frame.`,
      );
    }
    const [field, afterReference] = takeReferenceField(afterEnd, 'image_url');
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendNegative, params] = takeSwitch(afterSeedSwitch, 'send_negative_prompt');
    return this.runModel(input, {
      prompt: input.prompt,
      [field]: await this.uploadReference(start),
      [endField]: await this.uploadReference(end),
      duration: input.durationSeconds ?? 5,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async imageToVideo(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) {
      throw new Error('imageToVideo requires a start-frame reference image.');
    }
    const [field, afterReference] = takeReferenceField(takeEndField(input.params ?? {})[1], 'image_url');
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendNegative, params] = takeSwitch(afterSeedSwitch, 'send_negative_prompt');
    const imageUrl = await this.uploadReference(reference);
    return this.runModel(input, {
      prompt: input.prompt,
      [field]: imageUrl,
      duration: input.durationSeconds ?? 5,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...params,
    });
  }

  async lipSync(_input: ProviderInput): Promise<ProviderOutput> {
    throw new ConfigError(
      'The Higgsfield adapter does not support lip-sync yet. Set providers.lipsync to "fal" ' +
        'and provide FAL_KEY, or keep providers.video on fal for lip-sync shots.',
    );
  }

  private async runModel(input: ProviderInput, body: Record<string, unknown>): Promise<ProviderOutput> {
    const model = input.model.replace(/^\/+/, '');
    const headers: Record<string, string> = {
      Authorization: `Key ${this.credentials}`,
      'Content-Type': 'application/json',
    };
    if (input.idempotencyKey) headers['Idempotency-Key'] = input.idempotencyKey;

    const accepted = await fetchJsonWithRetry(
      'Higgsfield',
      `${this.baseUrl}/${model}`,
      { method: 'POST', headers, body: JSON.stringify(body) },
      this.requestTimeoutMs,
      this.fetchImpl,
    );

    const initialStatus = String(accepted.status ?? '').toLowerCase();
    if (TERMINAL_FAILURES.has(initialStatus)) {
      throw new Error(`Higgsfield request ${initialStatus}: ${JSON.stringify(accepted).slice(0, 500)}`);
    }

    let result = accepted;
    if (initialStatus !== COMPLETED && collectOutputUrls(accepted).length === 0) {
      const statusUrl = String(
        accepted.status_url ??
          (accepted.request_id ? `${this.baseUrl}/requests/${accepted.request_id}/status` : ''),
      );
      if (!statusUrl) {
        throw new Error(`Higgsfield returned no request handle for ${model}: ${JSON.stringify(accepted).slice(0, 500)}`);
      }
      result = await this.poll(statusUrl);
    }

    const urls = collectOutputUrls(result);
    if (urls.length === 0) {
      throw new Error(`Higgsfield returned no output URLs for ${model}: ${JSON.stringify(result).slice(0, 500)}`);
    }
    return {
      files: await downloadOutputs('higgsfield', urls, input.outputDir, this.requestTimeoutMs, this.fetchImpl),
      raw: result,
    };
  }

  private async poll(statusUrl: string): Promise<Record<string, unknown>> {
    const started = Date.now();
    let interval = this.pollIntervalMs;
    while (Date.now() - started < this.requestTimeoutMs) {
      const status = await fetchJsonWithRetry(
        'Higgsfield',
        statusUrl,
        {
          method: 'GET',
          headers: { Authorization: `Key ${this.credentials}` },
        },
        this.requestTimeoutMs,
        this.fetchImpl,
      );
      const value = String(status.status ?? '').toLowerCase();
      if (value === COMPLETED) return status;
      if (TERMINAL_FAILURES.has(value)) {
        throw new Error(`Higgsfield request ${value}: ${JSON.stringify(status).slice(0, 500)}`);
      }
      await delay(interval);
      interval = Math.min(Math.round(interval * 1.5), 10_000);
    }
    throw new Error(`Higgsfield request timed out after ${this.requestTimeoutMs}ms.`);
  }

  private async uploadReference(path: string): Promise<string> {
    const cached = this.uploadCache.get(path);
    if (cached) return cached;

    const contentType = UPLOAD_CONTENT_TYPES.get(extname(path).toLowerCase());
    if (!contentType) {
      throw new ConfigError(
        `Higgsfield cannot upload ${path}: unsupported content type. Use JPEG, PNG, WebP, GIF, WAV, or MP4.`,
      );
    }

    const created = await fetchJsonWithRetry(
      'Higgsfield',
      `${this.baseUrl}/files/generate-upload-url`,
      {
        method: 'POST',
        headers: {
          Authorization: `Key ${this.credentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ content_type: contentType }),
      },
      this.requestTimeoutMs,
      this.fetchImpl,
    );

    const uploadUrl = typeof created.upload_url === 'string' ? created.upload_url : undefined;
    const publicUrl = typeof created.public_url === 'string' ? created.public_url : undefined;
    if (!uploadUrl || !publicUrl) {
      throw new Error(`Higgsfield did not return an upload URL: ${JSON.stringify(created).slice(0, 500)}`);
    }

    const uploadHeaders =
      created.upload_headers && typeof created.upload_headers === 'object'
        ? (created.upload_headers as Record<string, string>)
        : { 'Content-Type': contentType };
    const data = await readFile(path);
    const upload = await this.fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: uploadHeaders,
      body: new Uint8Array(data),
      signal: AbortSignal.timeout(this.requestTimeoutMs),
    });
    if (!upload.ok) {
      throw new Error(`Higgsfield upload failed for ${path}: ${upload.status}`);
    }

    this.uploadCache.set(path, publicUrl);
    return publicUrl;
  }
}
