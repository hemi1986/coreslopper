import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const fromRoot = (path: string) => fileURLToPath(new URL(path, import.meta.url));

export default defineConfig({
  resolve: {
    alias: {
      '@coreslopper/core': fromRoot('./packages/core/src/index.ts'),
      '@coreslopper/providers': fromRoot('./packages/providers/src/index.ts'),
    },
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 30_000,
    // The release calendar defaults to the computer's time zone; tests pin one.
    env: { TZ: 'Europe/Berlin' },
  },
});
