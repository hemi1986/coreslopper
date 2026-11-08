import { MockProvider } from './mock.js';
import { FalProvider } from './fal.js';
import type { Provider } from './types.js';

export * from './types.js';
export * from './mock.js';
export * from './fal.js';
export * from './runner.js';

export function createProvider(kind: 'mock' | 'fal'): Provider {
  if (kind === 'fal') return new FalProvider();
  return new MockProvider();
}
