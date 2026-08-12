/**
 * Proves that stripping Excalidraw's inlined fonts changes nothing we render.
 *
 * `vite.config.ts` deletes 16.6 MB of base64 font payloads from the prebuilt
 * `@excalidraw/utils` bundle. That is only defensible if the output is
 * provably unchanged, so this builds the app twice - once with the plugin
 * disabled - serves both, converts the same SVGs in a real browser, and
 * compares the rendered pixels.
 *
 * Run after any @excalidraw/utils upgrade:
 *   pnpm verify:fonts
 *
 * If it fails, remove the plugin. Do not relax the check.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { chromium } from 'playwright-core';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import { DEPLOY_BASE, findChrome } from './lib/env';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const SAMPLES = [
  'tests/torture-svg/20-unsupported-features.svg',
  'tests/torture-svg/07-stroke-caps-joins.svg',
  'svg/legacy-gcp/Cloud-Run.svg',
];

function build(outDir: string, strip: boolean) {
  console.log(`  building ${strip ? 'stripped' : 'unstripped'} -> ${path.relative(ROOT, outDir)}`);
  // `shell: true` because npx is a .cmd shim on Windows.
  execFileSync('npx', ['vite', 'build', '--outDir', outDir, '--emptyOutDir'], {
    cwd: ROOT,
    stdio: 'pipe',
    shell: true,
    env: { ...process.env, ...(strip ? {} : { SKIP_FONT_STRIP: '1' }) },
  });
}

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
};

function serve(dir: string, port: number): Server {
  const server = createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];
    const rooted = url.startsWith(DEPLOY_BASE) ? url.slice(DEPLOY_BASE.length) || '/' : url;
    let file = path.join(dir, rooted);
    if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      file = path.join(dir, 'index.html'); // SPA fallback
    }
    res.setHeader('content-type', MIME[path.extname(file)] ?? 'application/octet-stream');
    res.end(fs.readFileSync(file));
  });
  server.listen(port);
  return server;
}

/**
 * Renders every sample and returns the output pane as a PNG.
 *
 * Two cheaper methods were tried and both are unusable here:
 *
 *  - Hashing the markup. Rough.js randomises the position of control points
 *    *along* each segment even at `roughness: 0`, so two renders of the same
 *    scene emit different `d` attributes describing the identical line.
 *
 *  - Hashing the pixels. For some inputs that jitter lands on the other side
 *    of a pixel boundary and changes antialiasing, so one build rendered
 *    `07-stroke-caps-joins` three different ways across four runs. An
 *    exact-match check reported that as a regression; it is not one.
 *
 * Hence the noise floor in `run()`.
 */
async function renderAll(port: number): Promise<Record<string, Buffer>> {
  const browser = await chromium.launch({ executablePath: findChrome(), headless: true });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  });

  const out: Record<string, Buffer> = {};

  for (const sample of SAMPLES) {
    await page.goto(`http://localhost:${port}${DEPLOY_BASE}/`, { waitUntil: 'networkidle' });
    await page.setInputFiles('input[type=file]', path.join(ROOT, sample));
    await page.waitForSelector('.excalidraw-preview-host svg', { timeout: 30_000 });
    await page.waitForTimeout(300);

    out[sample] = await page
      .locator('.compare-pane')
      .nth(1)
      .locator('.compare-canvas')
      .screenshot({ type: 'png' });
  }

  await browser.close();
  return out;
}

function diffPixels(a: Buffer, b: Buffer): number {
  const pa = PNG.sync.read(a);
  const pb = PNG.sync.read(b);
  if (pa.width !== pb.width || pa.height !== pb.height) return Number.POSITIVE_INFINITY;
  return pixelmatch(pa.data, pb.data, undefined, pa.width, pa.height, {
    threshold: 0.1,
    includeAA: false,
  });
}

async function run() {
  const strippedDir = path.join(ROOT, '.verify/stripped');
  const plainDir = path.join(ROOT, '.verify/plain');

  build(strippedDir, true);
  build(plainDir, false);

  const size = (dir: string) =>
    fs
      .readdirSync(path.join(dir, 'assets'))
      .reduce((n, f) => n + fs.statSync(path.join(dir, 'assets', f)).size, 0);

  console.log(`\n  stripped assets   ${(size(strippedDir) / 1048576).toFixed(1)} MB`);
  console.log(`  unstripped assets ${(size(plainDir) / 1048576).toFixed(1)} MB\n`);

  const a = serve(strippedDir, 4319);
  const b = serve(plainDir, 4320);

  try {
    const stripped = await renderAll(4319);
    // Same build, second pass: whatever differs here is rasterisation jitter,
    // and is the bar the real comparison has to beat.
    const control = await renderAll(4319);
    const plain = await renderAll(4320);

    let failed = false;

    for (const sample of SAMPLES) {
      const noise = diffPixels(stripped[sample], control[sample]);
      const real = diffPixels(stripped[sample], plain[sample]);
      const ok = real <= noise;
      if (!ok) failed = true;

      console.log(
        `  ${(ok ? 'ok' : 'FAIL').padEnd(5)} ${sample.padEnd(46)} ` +
          `diff ${String(real).padStart(6)} px, jitter floor ${String(noise).padStart(6)} px`
      );
    }

    if (failed) {
      console.error(
        '\nStripping changed the render beyond rasterisation jitter.\n' +
          'Remove the plugin from vite.config.ts. Do not relax this check.'
      );
      process.exitCode = 1;
    } else {
      console.log('\nNo change beyond jitter. Stripping is safe.');
    }
  } finally {
    a.close();
    b.close();
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
