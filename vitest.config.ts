import { defineConfig } from 'vitest/config';

/**
 * Unit tests. Separate from `vite.config.ts` on purpose: the app config
 * carries a React plugin, an icon-set loader and a font-stripping transform,
 * none of which a test of `plural()` should have to load.
 *
 * These cover the pure functions only. The pixel-level checks live in
 * `pnpm test:fidelity`, which needs a real rasteriser and takes ~20 seconds;
 * this suite runs in about a second so it can be run constantly.
 *
 * Default environment is `node`. The handful of tests that need a DOM opt in
 * per file with `// @vitest-environment jsdom`.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
  },
});
