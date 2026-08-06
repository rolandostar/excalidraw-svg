import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/** Matches the inlined font payloads in the prebuilt @excalidraw/utils bundle. */
const FONT_DATA_URL = /data:font\/[a-z0-9+.-]+;base64,[A-Za-z0-9+/=]{1000,}/gi;

/**
 * Strips Excalidraw's inlined web fonts.
 *
 * `@excalidraw/utils` ships as a single 18.7 MB prebuilt file, 16.6 MB of
 * which is 227 base64 font payloads. There is no separate font entry point to
 * alias, so the only way to drop them is to rewrite the module source.
 *
 * This is safe *for this application specifically*: every `exportToSvg` call
 * here passes `skipInliningFonts: true`, and the scenes being exported contain
 * only `line` and `ellipse` elements - the converter never emits `text` for an
 * uploaded SVG, because text is a reported-unsupported feature. Nothing reads
 * the payloads.
 *
 * `scripts/verify-font-strip.ts` renders the same SVG through a stripped and
 * an unstripped build and asserts the exported markup is byte-identical. Run
 * it after any @excalidraw/utils upgrade; if that assertion ever fails, this
 * plugin has to go rather than the assertion.
 */
function stripExcalidrawFonts(): Plugin {
  let removedBytes = 0;

  return {
    name: 'strip-excalidraw-fonts',
    apply: 'build',
    enforce: 'pre',

    transform(code, id) {
      // scripts/verify-font-strip.ts builds once with this set, to compare
      // stripped output against the untouched bundle.
      if (process.env.SKIP_FONT_STRIP) return null;
      if (!id.includes('@excalidraw')) return null;
      if (!FONT_DATA_URL.test(code)) return null;
      FONT_DATA_URL.lastIndex = 0;

      const before = code.length;
      // An empty payload of the same shape, so anything that merely inspects
      // the prefix still sees a well-formed data URL.
      const out = code.replace(FONT_DATA_URL, 'data:font/woff2;base64,');
      removedBytes += before - out.length;

      return { code: out, map: null };
    },

    buildEnd() {
      if (removedBytes > 0) {
        console.log(
          `\n  strip-excalidraw-fonts: removed ${(removedBytes / 1048576).toFixed(1)} MB of unused font payloads`
        );
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), stripExcalidrawFonts()],
  server: {
    port: 3000,
    open: true,
  },
  build: {
    // The Excalidraw exporter is a deliberate lazy chunk: the landing page
    // must not download a renderer before anyone has converted anything.
    chunkSizeWarningLimit: 1200,
  },
});
