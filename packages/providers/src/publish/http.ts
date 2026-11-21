import { delay, isRetryableStatus, type FetchLike } from '../http.js';

/** Replace every known secret and every token-shaped value in a message with `***`. */
export function redactSecrets(message: string, secrets: (string | undefined)[] = []): string {
  let text = message;
  for (const secret of secrets) {
    if (secret && secret.length >= 6) text = text.split(secret).join('***');
  }
  return text
    .replace(/(Bearer\s+)[^\s"',]+/gi, '$1***')
    .replace(/((?:access|refresh|id)_token|client_secret|code_verifier)(["']?\s*[:=]\s*["']?)[^\s"'&,}]+/gi, '$1$2***')
    .replace(/([?&]code=)[^&\s"']+/gi, '$1***');
}

/** An error whose message has been cleaned of secrets. */
export class PublishError extends Error {
  /** The call may have gone through (a lost answer, a 5xx on the post itself): the post may be live, so it is never retried by itself. */
  uncertain = false;

  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
    this.name = 'PublishError';
  }
}

export interface RetryOptions {
  attempts?: number;
  /** Base backoff in ms; doubles per attempt. */
  backoffMs?: number;
  sleep?: (ms: number) => Promise<void>;
  /** Values masked in error messages. */
  secrets?: (string | undefined)[];
  timeoutMs?: number;
}

/**
 * fetch with retries: network errors and 408/409/429/5xx are retried with
 * exponential backoff; other statuses are returned to the caller. The last
 * network error is rethrown with secrets masked.
 */
export async function fetchWithRetry(
  fetchImpl: FetchLike,
  url: string,
  init: RequestInit,
  options: RetryOptions = {},
): Promise<Response> {
  const attempts = options.attempts ?? 5;
  const backoff = options.backoffMs ?? 1_000;
  const sleep = options.sleep ?? delay;
  let lastError: unknown;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        ...init,
        ...(options.timeoutMs ? { signal: AbortSignal.timeout(options.timeoutMs) } : {}),
      });
      if (!isRetryableStatus(response.status) || attempt === attempts - 1) return response;
      lastError = new PublishError(`HTTP ${response.status}`, response.status);
      await response.body?.cancel().catch(() => undefined);
    } catch (error) {
      lastError = error;
      if (attempt === attempts - 1) break;
    }
    await sleep(backoff * 2 ** attempt);
  }
  const message = lastError instanceof Error ? lastError.message : String(lastError);
  throw new PublishError(redactSecrets(`${new URL(url).host}: ${message}`, options.secrets));
}

/** Mark an error of a call that may have gone through anyway; the release autopilot then asks the user instead of retrying. */
export function markUncertain(error: unknown): unknown {
  if (error instanceof PublishError) error.uncertain = true;
  else if (error instanceof Error && !(error.name === 'ConfigError')) return Object.assign(new PublishError(error.message), { uncertain: true });
  return error;
}

/** Parse a JSON body; a non-JSON body becomes `{ raw }`. */
export async function readJson(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  if (!text) return {};
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === 'object' ? (value as Record<string, unknown>) : { value };
  } catch {
    return { raw: text.slice(0, 500) };
  }
}

/** A PublishError for a failed response, with the body summarised and secrets masked. */
export function httpError(label: string, status: number, body: unknown, secrets: (string | undefined)[] = []): PublishError {
  return new PublishError(redactSecrets(`${label} failed with HTTP ${status}: ${JSON.stringify(body).slice(0, 600)}`, secrets), status, body);
}

/** Read `length` bytes of a file from `offset`. */
export async function readChunk(path: string, offset: number, length: number): Promise<Buffer<ArrayBuffer>> {
  const { open } = await import('node:fs/promises');
  const handle = await open(path, 'r');
  try {
    const buffer = Buffer.alloc(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    return bytesRead === length ? buffer : buffer.subarray(0, bytesRead);
  } finally {
    await handle.close();
  }
}
