import { MockProvider } from './mock.js';
import { FalProvider } from './fal.js';
import { HiggsfieldProvider } from './higgsfield.js';
import { ComfyUIProvider } from './comfyui.js';
import { TopviewProvider } from './topview.js';
import type { Provider } from './types.js';

export * from './types.js';
export * from './http.js';
export * from './mock.js';
export * from './fal.js';
export * from './higgsfield.js';
export * from './comfyui.js';
export * from './topview.js';
export * from './runner.js';
export * from './duration.js';
export * from './publish/index.js';

export type ProviderKind = 'mock' | 'fal' | 'higgsfield' | 'topview' | 'comfyui';

export function createProvider(kind: ProviderKind): Provider {
  if (kind === 'fal') return new FalProvider();
  if (kind === 'higgsfield') return new HiggsfieldProvider();
  if (kind === 'topview') return new TopviewProvider();
  if (kind === 'comfyui') return new ComfyUIProvider();
  return new MockProvider();
}
