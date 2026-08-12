import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import importPlugin from 'eslint-plugin-import';

/**
 * Lint rules chosen for one job: stopping the things a cleanup pass had to
 * remove by hand from coming back.
 *
 * `tsc` already covers unused locals and parameters (`noUnusedLocals`,
 * `noUnusedParameters` in tsconfig.json), so this adds only what it cannot
 * see. Dead *exports* are `pnpm lint:dead`, which is knip - a linter cannot
 * find those because it never looks at more than one file at a time.
 */
export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      '.verify/**', // built bundles, written by verify:fonts
      'tests/**',
      'src/scene/fontMetrics.generated.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    files: ['**/*.{ts,tsx}'],
    plugins: { import: importPlugin },
    settings: {
      // The built-in node resolver, told about the extensions this project
      // omits at the import site. Avoids a native postinstall for the sake of
      // a lint rule; verified below that no-cycle still resolves.
      'import/resolver': { node: { extensions: ['.ts', '.tsx', '.js'] } },
    },
    rules: {
      /*
       * No `import/no-cycle` here: it does not fire under ESLint 10 flat
       * config, verified by planting a two-module cycle and getting a clean
       * run. Cycles are checked in `scripts/lib/imports.test.ts` instead,
       * which is proven to fail on one.
       */
      /*
       * Two imports from one module is how a file ends up with a type import
       * and a value import of the same thing, which is what de-barrelling
       * produced before it was tidied.
       */
      'import/no-duplicates': 'error',

      // `_`-prefixed is the escape hatch, so a deliberately unused catch
      // binding or destructure rest does not need a disable comment.
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],

      /*
       * `any` is load-bearing at the Excalidraw boundary - its exported types
       * do not match what `exportToSvg` actually accepts - so this warns
       * rather than failing the build.
       */
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },

  {
    files: ['**/*.test.ts', 'scripts/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  }
);
