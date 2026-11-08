import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { cli: 'packages/cli/src/npx.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  splitting: false,
  sourcemap: true,
  minify: false,
  banner: { js: '#!/usr/bin/env node' },
  // The core package is a workspace package, so bundle it instead of publishing
  // an internal scope. Runtime dependencies are installed by npx.
  noExternal: ['@coreslopper/core'],
});
