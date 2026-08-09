import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';

/**
 * Every route that is known at build time, relative to the deploy base.
 *
 * The three static ones mirror `STATIC_ROUTES` in `src/router.tsx`; the rest
 * are the icon sets, whose route id is just the folder name under `svg/`
 * (see `src/utils/iconSets/discovery.ts`). `/` is the real `index.html` and
 * needs no copy.
 */
function knownRoutes(root: string): string[] {
  const svgDir = path.join(root, 'svg');
  const sets = fs.existsSync(svgDir)
    ? fs
        .readdirSync(svgDir, { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => `icons/${entry.name}`)
    : [];

  return ['methodology', 'icons', ...sets];
}

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
 * That fallback alone is not quite enough, though: Pages serves 404.html with
 * a **404 status**, and a crawler will not index a page that 404s. So every
 * route known at build time also gets a real `<route>/index.html`, which Pages
 * serves with a 200. 404.html is then left doing what its name says - handling
 * URLs that really are wrong.
 *
 * Build-only. The dev server already falls back to `index.html` itself.
 */
export function spaFallback(): Plugin {
  let outDir = 'dist';
  let root = process.cwd();

  return {
    name: 'spa-fallback',
    apply: 'build',

    configResolved(config) {
      root = config.root;
      outDir = path.resolve(config.root, config.build.outDir);
    },

    closeBundle() {
      const entry = path.join(outDir, 'index.html');
      if (!fs.existsSync(entry)) return;

      fs.copyFileSync(entry, path.join(outDir, '404.html'));

      for (const route of knownRoutes(root)) {
        const dir = path.join(outDir, route);
        fs.mkdirSync(dir, { recursive: true });
        fs.copyFileSync(entry, path.join(dir, 'index.html'));
      }
    },
  };
}
