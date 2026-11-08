import { MockProvider } from './mock.js';
import { FalProvider } from './fal.js';
import { HiggsfieldProvider } from './higgsfield.js';
import type { Provider } from './types.js';

export * from './types.js';
export * from './http.js';
export * from './mock.js';
export * from './fal.js';
export * from './higgsfield.js';
export * from './runner.js';

export type ProviderKind = 'mock' | 'fal' | 'higgsfield';

export function createProvider(kind: ProviderKind): Provider {
  if (kind === 'fal') return new FalProvider();
  if (kind === 'higgsfield') return new HiggsfieldProvider();
  return new MockProvider();
}
