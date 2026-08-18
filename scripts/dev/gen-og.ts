import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Resvg } from '@resvg/resvg-js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_FILE = path.join(ROOT, 'public', 'og.png');

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#090d16" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#111827" />
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.2" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="textGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#ffffff" />
      <stop offset="100%" stop-color="#e2e8f0" />
    </linearGradient>
    <linearGradient id="accentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#60a5fa" />
      <stop offset="100%" stop-color="#3b82f6" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- Subtle Outer Frame -->
  <rect x="30" y="30" width="1140" height="570" rx="24" fill="none" stroke="#334155" stroke-width="2" stroke-opacity="0.5" />

  <g transform="translate(600, 315)">
    <!-- Centered Large Logo Badge -->
    <g transform="translate(0, -110)">
      <rect x="-64" y="-64" width="128" height="128" rx="32" fill="#1e293b" stroke="url(#accentGrad)" stroke-width="3.5" />
      <!-- Big Diagram Node Logo -->
      <g transform="translate(-40, -40)">
        <svg viewBox="0 0 24 24" width="80" height="80" fill="none" stroke="#60a5fa" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M7 6.4C9.6 6 14.4 6.4 17.2 6.1" />
          <path d="M16.9 7.6c.4 2.4 0 6.4.2 8.8" />
          <path d="M15.4 16.2c-2.6.3-7.4-.1-9.8.1" />
          <path d="M5.9 15.2c-.4-2.6.1-6.6-.2-9" />
          <path d="M1.8 11.2h3.8M17.4 11.2h3.8" />
        </svg>
      </g>
    </g>

    <!-- Giant Main Title -->
    <text x="0" y="85" fill="url(#textGrad)" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="88" font-weight="900" text-anchor="middle" letter-spacing="-2.5">
      svg <tspan fill="#60a5fa">→</tspan> excalidraw
    </text>

    <!-- Clear, bold subtitle -->
    <text x="0" y="155" fill="#94a3b8" font-family="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" font-size="30" font-weight="500" text-anchor="middle" letter-spacing="-0.5">
      Convert SVG artwork into native, editable Excalidraw shapes
    </text>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

fs.writeFileSync(OUT_FILE, pngBuffer);
console.log(`Generated og.png (${pngBuffer.length} bytes) at ${OUT_FILE}`);
