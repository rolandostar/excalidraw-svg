/**
 * The handful of facts every script needs and none of them owns: where Chrome
 * is, what the site is served under, and how a `--name=value` flag is read.
 *
 * Each of these was written out twice, and two of the three had already
 * drifted - one Chrome list carried a macOS path the other did not, and the
 * deploy prefix appeared in three files, two of them with a comment asking
 * the reader to keep it in step with the third.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * The sub-path the built site is served from.
 *
 * Must equal `base` in `vite.config.ts`. The build writes asset URLs with
 * this prefix, so a script that serves or navigates without it gets the SPA
 * fallback for every request: `verify-font-strip` would compare two blank
 * pages and pass for the wrong reason, and `shoot` would capture 404s.
 */
export const DEPLOY_BASE = '/excalidraw-svg';

const CHROME_CANDIDATES = [
  process.env.CHROME_PATH,
  path.join(
    process.env.USERPROFILE ?? process.env.HOME ?? '',
    '.agent-browser/browsers/chrome-151.0.7922.76/chrome.exe'
  ),
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].filter(Boolean) as string[];

/** First Chrome on disk. Lists what it tried, so `CHROME_PATH` is actionable. */
export function findChrome(): string {
  const found = CHROME_CANDIDATES.find(c => fs.existsSync(c));
  if (found) return found;
  throw new Error(`No Chrome found. Set CHROME_PATH.\nTried:\n  ${CHROME_CANDIDATES.join('\n  ')}`);
}

/** Reads `--name=value` off an argv, keeping any `=` in the value. */
export function flag(name: string, argv = process.argv.slice(2)): string | null {
  const found = argv.find(a => a.startsWith(`--${name}=`));
  return found ? found.slice(name.length + 3) : null;
}
