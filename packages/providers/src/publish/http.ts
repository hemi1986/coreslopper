import { HTTP_RETRY, delay, fetchResponseWithRetry, isRetryableStatus, type FetchLike } from '../http.js';
import { markFailure } from './failure.js';

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
  try {
    return await fetchResponseWithRetry(fetchImpl, url, init, {
      attempts: options.attempts ?? HTTP_RETRY.attempts,
      backoffMs: options.backoffMs ?? HTTP_RETRY.backoffMs,
      sleep: options.sleep ?? delay,
      timeoutMs: options.timeoutMs,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new PublishError(redactSecrets(`${new URL(url).host}: ${message}`, options.secrets));
  }
}

/** Mark an error of a call that may have gone through anyway; the release autopilot then asks the user instead of retrying. */
export function markUncertain(error: unknown): unknown {
  return markFailure(error, { phase: 'publication' });
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

export interface PollOptions<T> {
  /** Wait between checks, in ms; a number or a function of the last value. */
  intervalMs: number | ((value: T) => number);
  /** Stop after this long, measured with `now`. */
  timeoutMs?: number;
  /** Stop after this many checks (including the first, or the `initial` value). */
  attempts?: number;
  now: () => number;
  sleep: (ms: number) => Promise<void>;
  /** True once the platform reached a terminal state. */
  done: (value: T) => boolean;
  /** Return an error for a terminal failure; it is thrown before `done` is read. */
  failed?: (value: T) => Error | undefined;
  /** A value already read, e.g. a finalize answer; the loop waits before its first check. */
  initial?: T;
  /** Called when the timeout or the attempt budget runs out; throw or return the last value. */
  onTimeout: (last: T) => T;
}

/** One poll loop for every adapter: check a status until it is terminal, fails, or runs out of time. */
export async function pollUntil<T>(check: () => Promise<T>, options: PollOptions<T>): Promise<T> {
  const started = options.now();
  let checks = 0;
  let current: T;
  if ('initial' in options) {
    current = options.initial as T;
  } else {
    current = await check();
    checks = 1;
  }
  while (true) {
    const failure = options.failed?.(current);
    if (failure) throw failure;
    if (options.done(current)) return current;
    if (options.timeoutMs !== undefined && options.now() - started >= options.timeoutMs) return options.onTimeout(current);
    if (options.attempts !== undefined && checks >= options.attempts) return options.onTimeout(current);
    await options.sleep(typeof options.intervalMs === 'function' ? options.intervalMs(current) : options.intervalMs);
    current = await check();
    checks += 1;
  }
}
