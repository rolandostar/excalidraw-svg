import fs from 'node:fs';
import path from 'node:path';
import { JSDOM } from 'jsdom';
import type { Plugin } from 'vite';
import { optimizeSvgString } from '../src/library/svgMarkup';

/**
 * Runs the SVG optimiser at build time instead of in the browser.
 *
 * `optimizeSvgString` is SVGO plus a style-cascade flattener, and it was the
 * single most expensive thing on the icons page: opening a set ran it over
 * every file in that set, synchronously, before the grid could paint. All of
 * those files are sitting in the repo at build time, so none of that work
 * needed to happen on a user's machine.
 *
 * It also meant shipping SVGO itself - `svgo/browser` is 765 KB raw, 187 KB
 * gzipped, roughly half the main chunk - to do work whose input was already
 * known. The converter page, which handles files the build has never seen,
 * does not use the optimiser at all, so nothing in the client needs it.
 *
 * The optimiser stays a single shared function: this plugin and the fidelity
 * harness both call `optimizeSvgString`, so the markup the browser renders is
 * the same markup the harness scores. Nothing is committed, so there is no
 * generated artifact that can drift out of date.
 */
const VIRTUAL_ID = 'virtual:icon-sets';
const RESOLVED_ID = '\0virtual:icon-sets';

interface BuiltIcon {
  name: string;
  svg: string;
}

interface BuiltSet {
  id: string;
  manifest: unknown;
  icons: BuiltIcon[];
}

/**
 * `optimizeSvgString` reaches for two browser globals and nothing else.
 *
 * Only those two are installed, and they are restored afterwards: mirroring a
 * whole jsdom `window` onto the Vite process would make every library that
 * sniffs `typeof window` believe it is running in a browser.
 */
function withDomGlobals<T>(fn: () => T): T {
  const dom = new JSDOM('<!DOCTYPE html>');
  const g = globalThis as Record<string, unknown>;
  const had = {
    DOMParser: 'DOMParser' in g,
    XMLSerializer: 'XMLSerializer' in g,
  };
  const prev = { DOMParser: g.DOMParser, XMLSerializer: g.XMLSerializer };

  g.DOMParser = dom.window.DOMParser;
  g.XMLSerializer = dom.window.XMLSerializer;

  try {
    return fn();
  } finally {
    if (had.DOMParser) g.DOMParser = prev.DOMParser;
    else delete g.DOMParser;
    if (had.XMLSerializer) g.XMLSerializer = prev.XMLSerializer;
    else delete g.XMLSerializer;
    dom.window.close();
  }
}

function readSets(svgDir: string): BuiltSet[] {
  if (!fs.existsSync(svgDir)) return [];

  const sets: BuiltSet[] = [];

  for (const entry of fs.readdirSync(svgDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;

    const dir = path.join(svgDir, entry.name);
    const files = fs
      .readdirSync(dir)
      .filter(f => f.toLowerCase().endsWith('.svg'))
      .sort((a, b) => a.localeCompare(b));

    // A folder holding only a set.json is a half-finished drop, not a set.
    if (files.length === 0) continue;

    let manifest: unknown = {};
    const manifestPath = path.join(dir, 'set.json');
    if (fs.existsSync(manifestPath)) {
      try {
        manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
      } catch (err) {
        // A broken manifest must not take the whole build down - the set is
        // still usable off inferred defaults - but it must be loud.
        console.warn(
          `[icon-sets] ${path.relative(process.cwd(), manifestPath)} is not valid JSON, ignoring it: ${
            (err as Error).message
          }`
        );
      }
    }

    const icons = withDomGlobals(() =>
      files.map(file => ({
        name: file.replace(/\.svg$/i, ''),
        svg: optimizeSvgString(fs.readFileSync(path.join(dir, file), 'utf-8')),
      }))
    );

    sets.push({ id: entry.name, manifest, icons });
  }

  return sets;
}

export function iconSets(): Plugin {
  const svgDir = path.resolve(process.cwd(), 'svg');
  let cache: string | null = null;

  const build = (): string => {
    if (cache) return cache;

    const startedAt = Date.now();
    const sets = readSets(svgDir);
    const total = sets.reduce((n, s) => n + s.icons.length, 0);

    console.log(
      `  icon-sets: optimised ${total} icon(s) across ${sets.length} set(s) in ${
        ((Date.now() - startedAt) / 1000).toFixed(1)
      }s`
    );

    cache = `export const ICON_SETS = ${JSON.stringify(sets)};\n`;
    return cache;
  };

  return {
    name: 'icon-sets',

    resolveId(id) {
      return id === VIRTUAL_ID ? RESOLVED_ID : null;
    },

    load(id) {
      return id === RESOLVED_ID ? build() : null;
    },

    configureServer(server) {
      // Watched explicitly: `svg/` holds no importable modules of its own now
      // that the optimiser runs here, so Vite has no other reason to look at
      // it - and dropping a folder into `svg/` has to keep working without a
      // restart.
      server.watcher.add(svgDir);

      server.watcher.on('all', (_event, file) => {
        if (!file.startsWith(svgDir)) return;
        if (!/\.svg$/i.test(file) && !file.endsWith('set.json')) return;

        cache = null;
        const mod = server.moduleGraph.getModuleById(RESOLVED_ID);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      });
    },
  };
}
