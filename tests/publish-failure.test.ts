import { describe, expect, it } from 'vitest';
import { ConfigError, ValidationError } from '../packages/core/src/index.ts';
import { markUncertain, PublishError } from '../packages/providers/src/publish/http.ts';
import {
  classifyFailure,
  failureClass,
  markFailure,
  withFailureClass,
  type FailureClass,
  type FailureContext,
} from '../packages/providers/src/publish/failure.ts';

const statusError = (status: number) => new PublishError(`HTTP ${status}`, status);
const networkError = () => new TypeError('fetch failed');

describe('classifyFailure', () => {
  const cases: { name: string; error: unknown; context: FailureContext; expected: FailureClass }[] = [
    { name: 'a config error is always fatal', error: new ConfigError('no token'), context: { phase: 'prepare' }, expected: 'fatal' },
    { name: 'a validation error is always fatal', error: new ValidationError('bad text'), context: { phase: 'publication' }, expected: 'fatal' },
    { name: 'a 400 before a send is fatal', error: statusError(400), context: { phase: 'prepare' }, expected: 'fatal' },
    { name: 'a 403 on the post is fatal', error: statusError(403), context: { phase: 'publication' }, expected: 'fatal' },
    { name: 'a 408 is retryable while preparing', error: statusError(408), context: { phase: 'upload' }, expected: 'retryable' },
    { name: 'a 409 is retryable while uploading', error: statusError(409), context: { phase: 'upload' }, expected: 'retryable' },
    { name: 'a 429 on the post is a definite refusal', error: statusError(429), context: { phase: 'publication' }, expected: 'retryable' },
    { name: 'a 503 before a send is retryable', error: statusError(503), context: { phase: 'upload' }, expected: 'retryable' },
    { name: 'a 503 on the post may have gone out', error: statusError(503), context: { phase: 'publication' }, expected: 'uncertain' },
    { name: 'a network error before a send is retryable', error: networkError(), context: { phase: 'upload' }, expected: 'retryable' },
    { name: 'a network error on the post may have gone out', error: networkError(), context: { phase: 'publication' }, expected: 'uncertain' },
    { name: 'an answer after the last byte is uncertain', error: statusError(400), context: { phase: 'upload', lastByteSent: true }, expected: 'uncertain' },
  ];

  for (const entry of cases) {
    it(entry.name, () => {
      expect(classifyFailure(entry.error, entry.context)).toBe(entry.expected);
    });
  }
});

describe('markFailure and failureClass', () => {
  it('carries the class and keeps .uncertain for the logs', () => {
    const lost = markFailure(statusError(503), { phase: 'publication' });
    expect(failureClass(lost)).toBe('uncertain');
    expect((lost as Error & { uncertain?: boolean }).uncertain).toBe(true);

    const busy = markFailure(statusError(503), { phase: 'upload' });
    expect(failureClass(busy)).toBe('retryable');
    expect((busy as Error & { uncertain?: boolean }).uncertain).toBe(false);
  });

  it('wraps a non-error and keeps a class that was set explicitly', () => {
    expect(failureClass(withFailureClass('not an error', 'fatal'))).toBe('fatal');
    expect(failureClass(withFailureClass(new Error('retry me'), 'retryable'))).toBe('retryable');
  });

  it('reads unmarked errors without judging a status code at the call site', () => {
    expect(failureClass(new ConfigError('no token'))).toBe('fatal');
    expect(failureClass(Object.assign(new Error('lost'), { uncertain: true }))).toBe('uncertain');
    expect(failureClass(statusError(404))).toBe('fatal');
    expect(failureClass(statusError(503))).toBe('retryable');
    expect(failureClass(new Error('unknown'))).toBe('retryable');
  });

  it('keeps markUncertain as the publication-phase alias', () => {
    const lost = markUncertain(statusError(503)) as Error;
    expect(failureClass(lost)).toBe('uncertain');
  });
});
