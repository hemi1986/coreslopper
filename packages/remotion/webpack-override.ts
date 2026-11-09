import type { WebpackOverrideFn } from '@remotion/bundler';

/**
 * The core package uses NodeNext-style `./x.js` imports for `.ts` sources.
 * Let webpack resolve them so the composition can import browser-safe runtime
 * helpers from `@coreslopper/core/browser`.
 */
export const webpackOverride: WebpackOverrideFn = (config) => ({
  ...config,
  resolve: {
    ...config.resolve,
    extensionAlias: {
      ...(config.resolve?.extensionAlias ?? {}),
      '.js': ['.ts', '.tsx', '.js'],
    },
  },
});
