import { ConfigError, ValidationError } from '@coreslopper/core';
import { isRetryableStatus } from '../http.js';

/**
 * One failure class for every publish and post adapter:
 * - `fatal` no retry fixes it (credentials, billing, a rejected text);
 * - `retryable` the call did not reach the platform or was refused, so a retry is safe;
 * - `uncertain` the public action may have gone out, so nobody retries it by itself.
 */
export type FailureClass = 'fatal' | 'retryable' | 'uncertain';

/**
 * Where the adapter was when the call failed.
 * - `prepare`: nothing public was sent; a retry is safe.
 * - `upload`: an idempotent or resumable transfer; a retry is safe until its last byte.
 * - `publication`: the public post or upload action started; a lost answer may have gone out.
 */
export type FailurePhase = 'prepare' | 'upload' | 'publication';

export interface FailureContext {
  phase: FailurePhase;
  /** The adapter sent the last byte of the public action (a post body or the last upload chunk). */
  lastByteSent?: boolean;
}

const classes = new WeakMap<Error, FailureClass>();

function statusOf(error: unknown): number | undefined {
  const status = (error as { status?: unknown } | undefined)?.status;
  return typeof status === 'number' ? status : undefined;
}

/** The one fatal/retryable/uncertain rule for publishing. */
export function classifyFailure(error: unknown, context: FailureContext): FailureClass {
  if (error instanceof ConfigError || error instanceof ValidationError) return 'fatal';
  // Once the last byte left, a lost answer may hide a public post: never retry it by itself.
  if (context.lastByteSent) return 'uncertain';
  const status = statusOf(error);
  if (status !== undefined) {
    if (!isRetryableStatus(status)) return 'fatal';
    // A rate limit, a request timeout or a conflict is a definite refusal. A 5xx may have accepted the post.
    if (context.phase === 'publication') return status === 408 || status === 409 || status === 429 ? 'retryable' : 'uncertain';
    return 'retryable';
  }
  return context.phase === 'publication' ? 'uncertain' : 'retryable';
}

/** Attach a class to an error; `.uncertain` stays for the persisted logs and the board. */
export function withFailureClass(error: unknown, failureClass: FailureClass): Error {
  const target = error instanceof Error ? error : new Error(String(error));
  classes.set(target, failureClass);
  (target as Error & { uncertain?: boolean }).uncertain = failureClass === 'uncertain';
  return target;
}

/** Throw this from an adapter: the class follows from the phase and the last byte. */
export function markFailure(error: unknown, context: FailureContext): Error {
  return withFailureClass(error, classifyFailure(error, context));
}

/** Read the class; never re-judges a status code at the call site. */
export function failureClass(error: unknown): FailureClass {
  if (error instanceof Error) {
    const known = classes.get(error);
    if (known) return known;
  }
  if (error instanceof ConfigError || error instanceof ValidationError) return 'fatal';
  if ((error as { uncertain?: boolean } | undefined)?.uncertain) return 'uncertain';
  const status = statusOf(error);
  if (status !== undefined && !isRetryableStatus(status)) return 'fatal';
  return 'retryable';
}
