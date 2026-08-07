/**
 * Deterministic UI screenshots for review.
 *
 * Uses `playwright-core` against an already-installed Chrome rather than a
 * bundled browser, so this adds no multi-hundred-megabyte download. Point
 * CHROME_PATH at any Chromium build if the default is missing.
 *
 *   pnpm shoot                      # default set, against the dev server
 *   pnpm shoot --url=http://... --only=convert-light
 *
 * Every shot is written to .screenshots/ (gitignored). Existing files are
 * overwritten, and the console prints a byte count per file - identical sizes
 * across runs are a signal that a page did not actually change.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.screenshots');

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

function findChrome(): string {
  for (const candidate of CHROME_CANDIDATES) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    `No Chrome found. Set CHROME_PATH.\nTried:\n  ${CHROME_CANDIDATES.join('\n  ')}`
  );
}

const arg = (name: string, fallback: string) =>
  process.argv.find(a => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=') ?? fallback;

const BASE = arg('url', 'http://localhost:5182');
const ONLY = arg('only', '');

type Theme = 'light' | 'dark';

interface Shot {
  name: string;
  route: string;
  theme: Theme;
  width: number;
  height: number;
  fullPage?: boolean;
  /** Run after load, before the shot. */
  prepare?: (page: Page) => Promise<void>;
}

const TORTURE = path.join(ROOT, 'tests/torture-svg/20-unsupported-features.svg');

/** The set the shots are taken against. Any other set would do. */
const SET_ROUTE = '/icons/legacy-gcp';

const waitForGrid = async (page: Page) => {
  await page.waitForSelector('.icon-card', { timeout: 30_000 });
  await page.waitForSelector('.icon-card .excalidraw-preview-host svg', { timeout: 30_000 });
  await page.waitForTimeout(600);
};

const uploadSvg = (file: string) => async (page: Page) => {
  await page.setInputFiles('input[type=file]', file);
  // The Excalidraw exporter is dynamically imported on first use.
  await page.waitForSelector('.excalidraw-preview-host svg', { timeout: 15_000 });
  await page.waitForTimeout(400);
};

const SHOTS: Shot[] = [
  { name: 'home-dark', route: '/', theme: 'dark', width: 1440, height: 950 },
  { name: 'home-light', route: '/', theme: 'light', width: 1440, height: 950 },
  { name: 'home-mobile-light', route: '/', theme: 'light', width: 390, height: 844 },
  {
    name: 'convert-dark',
    route: '/',
    theme: 'dark',
    width: 1440,
    height: 1100,
    prepare: uploadSvg(TORTURE),
  },
  {
    name: 'convert-light',
    route: '/',
    theme: 'light',
    width: 1440,
    height: 1100,
    prepare: uploadSvg(TORTURE),
  },
  { name: 'sets-dark', route: '/icons', theme: 'dark', width: 1440, height: 950 },
  { name: 'sets-light', route: '/icons', theme: 'light', width: 1440, height: 950 },
  { name: 'sets-mobile-light', route: '/icons', theme: 'light', width: 390, height: 844 },

  // A set materialises after first paint - SVGO runs over the whole folder -
  // so `networkidle` is not enough to know the grid exists.
  { name: 'icons-dark', route: SET_ROUTE, theme: 'dark', width: 1440, height: 950, prepare: waitForGrid },
  { name: 'icons-light', route: SET_ROUTE, theme: 'light', width: 1440, height: 950, prepare: waitForGrid },
  { name: 'icons-mobile-light', route: SET_ROUTE, theme: 'light', width: 390, height: 844, prepare: waitForGrid },
  {
    name: 'icons-sketch',
    route: SET_ROUTE,
    theme: 'dark',
    width: 1440,
    height: 700,
    prepare: async page => {
      await waitForGrid(page);
      // Scoped to the preset row: "Sketch" is also a card style and a
      // roughness level once the frame section expands.
      await page.locator('.preset-btn', { hasText: 'Sketch' }).click();
      await page.waitForTimeout(1200);
    },
  },
  { name: 'methodology-dark', route: '/methodology', theme: 'dark', width: 1440, height: 950 },
  {
    name: 'methodology-full',
    route: '/methodology',
    theme: 'dark',
    width: 1440,
    height: 950,
    fullPage: true,
    prepare: async page => {
      await page.waitForSelector('.case-card', { timeout: 15_000 });
      await page.waitForTimeout(600);
    },
  },
  { name: 'methodology-light', route: '/methodology', theme: 'light', width: 1440, height: 950 },
];

async function shoot(browser: Browser, shot: Shot) {
  const context = await browser.newContext({
    viewport: { width: shot.width, height: shot.height },
    deviceScaleFactor: 1,
    colorScheme: shot.theme,
  });

  // Seed the preference before any script runs, so the inline no-flash
  // resolver in index.html is exercised exactly as a real visitor would.
  await context.addInitScript(theme => {
    try {
      window.localStorage.setItem('excalidraw-svg:theme', theme as string);
    } catch {
      /* ignore */
    }
  }, shot.theme);

  const page = await context.newPage();
  const errors: string[] = [];
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));

  await page.goto(`${BASE}${shot.route}`, { waitUntil: 'networkidle' });
  await shot.prepare?.(page);
  await page.waitForTimeout(250);

  const file = path.join(OUT, `${shot.name}.png`);
  await page.screenshot({ path: file, fullPage: shot.fullPage ?? false });

  const size = fs.statSync(file).size;
  const resolved = await page.evaluate(() => document.documentElement.dataset.theme);
  console.log(
    `  ${shot.name.padEnd(22)} ${String(size).padStart(7)} B  theme=${resolved}` +
      (errors.length ? `  ${errors.length} console error(s)` : '')
  );
  errors.slice(0, 3).forEach(e => console.log(`      ! ${e.slice(0, 160)}`));

  await context.close();
}

async function run() {
  fs.mkdirSync(OUT, { recursive: true });

  const executablePath = findChrome();
  console.log(`Chrome:  ${executablePath}`);
  console.log(`Target:  ${BASE}\n`);

  const browser = await chromium.launch({ executablePath, headless: true });

  try {
    for (const shot of SHOTS) {
      if (ONLY && !shot.name.includes(ONLY)) continue;
      await shoot(browser, shot);
    }
  } finally {
    await browser.close();
  }

  console.log(`\nWrote to ${path.relative(ROOT, OUT)}/`);
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
