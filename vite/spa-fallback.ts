import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Copies `dist/index.html` to `dist/404.html` after a production build.
 *
 * The app is a single-page app with a history-API router (`src/router.tsx`),
 * so `/methodology` and `/icons/<set>` are real URLs that must all serve
 * `index.html`. Every normal host has a rewrite rule for that; GitHub Pages
 * has none. Following a link works, because the router never leaves the page,
 * but a hard refresh or a pasted link asks Pages for a file that does not
 * exist and gets the 404.
 *
 * Pages does serve `404.html` for any unmatched path, and it serves it with
 * the requested URL still in the address bar. So a byte-identical copy of the
 * entry document at that filename *is* the rewrite rule: the app boots, the
 * router reads `window.location.pathname`, and the deep link resolves.
 *
 * The only cost is that a genuinely wrong URL also boots the app, which is
 * fine here - `normalizePath` collapses anything unknown onto `/`.
 *
 * Build-only. The dev server already falls back to `index.html` itself.
 */
export function spaFallback(): Plugin {
  let outDir = 'dist';

  return {
    name: 'spa-fallback',
    apply: 'build',

    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      const entry = path.join(outDir, 'index.html');
      if (!fs.existsSync(entry)) return;

      fs.copyFileSync(entry, path.join(outDir, '404.html'));
    },
  };
}
