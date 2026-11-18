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
import { clipDurationSeconds, withoutDurationOptions } from './duration.js';

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
  ['.mp3', 'audio/mpeg'],
  ['.mp4', 'video/mp4'],
]);

const TERMINAL_FAILURES = new Set(['failed', 'nsfw', 'canceled', 'cancelled']);
const COMPLETED = 'completed';
/** Statuses of a legacy job set (`/v1/job-sets/<id>`). */
const JOB_PENDING = new Set(['queued', 'in_progress', 'pending', 'running']);
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

function takeSwitchDefault(
  params: Record<string, unknown>,
  key: string,
  fallback: boolean,
): [boolean, Record<string, unknown>] {
  const { [key]: value, ...rest } = params;
  return [typeof value === 'boolean' ? value : fallback, rest];
}

function takeString(params: Record<string, unknown>, key: string): [string | undefined, Record<string, unknown>] {
  const { [key]: value, ...rest } = params;
  return [typeof value === 'string' && value.length > 0 ? value : undefined, rest];
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
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...withoutDurationOptions(params),
      duration: clipDurationSeconds(input.durationSeconds, input.params),
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
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...withoutDurationOptions(params),
      duration: clipDurationSeconds(input.durationSeconds, input.params),
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
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...withoutDurationOptions(params),
      duration: clipDurationSeconds(input.durationSeconds, input.params),
    });
  }

  /**
   * Animate a face (`references[0]`) with a vocal segment (`input.audio`).
   *
   * Two request shapes, chosen with the adapter-only `request_format` param:
   * - `flat` (default): the current model routes, e.g. `higgsfield-ai/speak`
   *   (Speak v2) or a Wan image-to-video model with `audio_url`. The face goes to
   *   `reference_field` (default `image_url`), the audio to `audio_field`
   *   (default `audio_url`), plus `prompt` and `duration`.
   * - `job_set`: the legacy `v1/speak/<model>` routes (e.g. `v1/speak/kling`,
   *   Kling Avatar), which take `{ params: { input_image, input_audio, prompt } }`
   *   and are polled at `/v1/job-sets/<id>`.
   *
   * `duration` is the driving audio rounded up to the model's allowed lengths
   * (`durations`); Speak cuts audio that is longer than the selected duration.
   * `send_duration: false` omits it. `model_quality` is sent as `quality`.
   */
  async lipSync(input: ProviderInput): Promise<ProviderOutput> {
    const reference = input.references?.[0];
    if (!reference) throw new Error('lipSync requires a face reference image.');
    if (!input.audio) throw new Error('lipSync requires an audio file.');
    const [format, afterFormat] = takeString(input.params ?? {}, 'request_format');
    if (format !== undefined && format !== 'flat' && format !== 'job_set') {
      throw new ConfigError(`Higgsfield request_format must be "flat" or "job_set", got ${JSON.stringify(format)}.`);
    }
    const [audioField, afterAudio] = takeString(afterFormat, 'audio_field');
    const [field, afterReference] = takeReferenceField(takeEndField(afterAudio)[1], 'image_url');
    const [sendSeed, afterSeedSwitch] = takeSwitch(afterReference, 'send_seed');
    const [sendDuration, afterDurationSwitch] = takeSwitchDefault(afterSeedSwitch, 'send_duration', true);
    const [sendNegative, afterNegative] = takeSwitch(afterDurationSwitch, 'send_negative_prompt');
    // `quality` is the local clip option (draft/final) in a batch item, so the
    // model's own quality field is set as `model_quality`.
    const { model_quality: modelQuality, ...params } = afterNegative;
    const [imageUrl, audioUrl] = await Promise.all([this.uploadReference(reference), this.uploadReference(input.audio)]);
    const shared = {
      prompt: input.prompt,
      ...(sendSeed ? { seed: normalizeSeed(input.seed) } : {}),
      ...(sendNegative && input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(modelQuality !== undefined ? { quality: modelQuality } : {}),
      ...withoutDurationOptions(params),
      ...(sendDuration ? { duration: clipDurationSeconds(input.durationSeconds, params) } : {}),
    };

    if (format === 'job_set') {
      return this.runJobSet(input, {
        params: {
          input_image: { type: 'image_url', image_url: imageUrl },
          input_audio: { type: 'audio_url', audio_url: audioUrl },
          ...shared,
        },
      });
    }
    return this.runModel(input, { [field]: imageUrl, [audioField ?? 'audio_url']: audioUrl, ...shared });
  }

  /** Legacy job-set routes: submit, poll `/v1/job-sets/<id>`, download each job's `raw` result. */
  private async runJobSet(input: ProviderInput, body: Record<string, unknown>): Promise<ProviderOutput> {
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
    const id = typeof accepted.id === 'string' ? accepted.id : undefined;
    if (!id || !/^[A-Za-z0-9-]+$/.test(id)) {
      throw new Error(`Higgsfield returned no job set for ${model}: ${JSON.stringify(accepted).slice(0, 500)}`);
    }

    const started = Date.now();
    let interval = this.pollIntervalMs;
    let jobSet = accepted;
    for (;;) {
      const jobs = Array.isArray(jobSet.jobs) ? (jobSet.jobs as Record<string, unknown>[]) : [];
      const statuses = jobs.map((job) => String(job.status ?? '').toLowerCase());
      const failed = statuses.find((status) => TERMINAL_FAILURES.has(status));
      if (failed) throw new Error(`Higgsfield job ${failed}: ${JSON.stringify(jobSet).slice(0, 500)}`);
      if (jobs.length > 0 && statuses.every((status) => status === COMPLETED)) {
        const urls = jobs.flatMap((job) => {
          const results = (job.results ?? {}) as Record<string, { url?: unknown } | undefined>;
          const best = results.raw?.url ?? results.min?.url;
          return typeof best === 'string' ? [best] : [];
        });
        if (urls.length === 0) {
          throw new Error(`Higgsfield returned no output URLs for ${model}: ${JSON.stringify(jobSet).slice(0, 500)}`);
        }
        return {
          files: await downloadOutputs('higgsfield', urls, input.outputDir, this.requestTimeoutMs, this.fetchImpl),
          raw: jobSet,
        };
      }
      const unknown = statuses.find((status) => status !== COMPLETED && !JOB_PENDING.has(status));
      if (unknown) throw new Error(`Higgsfield job set ${id} has unexpected status ${unknown}.`);
      if (Date.now() - started >= this.requestTimeoutMs) {
        throw new Error(`Higgsfield job set ${id} timed out after ${this.requestTimeoutMs}ms.`);
      }
      await delay(interval);
      interval = Math.min(Math.round(interval * 1.5), 10_000);
      jobSet = await fetchJsonWithRetry(
        'Higgsfield',
        `${this.baseUrl}/v1/job-sets/${id}`,
        { method: 'GET', headers: { Authorization: `Key ${this.credentials}` } },
        this.requestTimeoutMs,
        this.fetchImpl,
      );
    }
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
        `Higgsfield cannot upload ${path}: unsupported content type. Use JPEG, PNG, WebP, GIF, WAV, MP3, or MP4.`,
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
