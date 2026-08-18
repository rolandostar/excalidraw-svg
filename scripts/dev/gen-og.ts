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
    <radialGradient id="glow" cx="65%" cy="30%" r="55%">
      <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.25" />
      <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="cardGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1e293b" stop-opacity="0.9" />
      <stop offset="100%" stop-color="#0f172a" stop-opacity="0.9" />
    </linearGradient>
  </defs>

  <!-- Background -->
  <rect width="1200" height="630" fill="url(#bg)" />
  <rect width="1200" height="630" fill="url(#glow)" />

  <!-- Outer frame border -->
  <rect x="24" y="24" width="1152" height="582" rx="20" fill="none" stroke="#334155" stroke-width="1.5" stroke-opacity="0.6" />

  <!-- Brand badge -->
  <g transform="translate(80, 75)">
    <rect width="216" height="48" rx="24" fill="#1e293b" stroke="#3b82f6" stroke-width="1.5" stroke-opacity="0.6" />
    <!-- Diagram node logo mark -->
    <g transform="translate(14, 11)">
      <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="#60a5fa" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M7 6.4C9.6 6 14.4 6.4 17.2 6.1" />
        <path d="M16.9 7.6c.4 2.4 0 6.4.2 8.8" />
        <path d="M15.4 16.2c-2.6.3-7.4-.1-9.8.1" />
        <path d="M5.9 15.2c-.4-2.6.1-6.6-.2-9" />
        <path d="M1.8 11.2h3.8M17.4 11.2h3.8" />
      </svg>
    </g>
    <text x="52" y="30" fill="#f1f5f9" font-family="sans-serif" font-size="17" font-weight="600" letter-spacing="-0.2">svg → excalidraw</text>
  </g>

  <!-- Headline -->
  <text x="80" y="210" fill="#ffffff" font-family="sans-serif" font-size="64" font-weight="800" letter-spacing="-1.5">
    SVG to Excalidraw
  </text>

  <!-- Tagline -->
  <text x="80" y="270" fill="#94a3b8" font-family="sans-serif" font-size="28" font-weight="400" letter-spacing="-0.3">
    Convert any SVG into real, editable vector shapes — not an embedded bitmap.
  </text>
  <text x="80" y="310" fill="#64748b" font-family="sans-serif" font-size="22" font-weight="400">
    Paste directly into Excalidraw with resolution-independent strokes and custom styles.
  </text>

  <!-- Features Grid -->
  <g transform="translate(80, 370)">
    <!-- Card 1 -->
    <g transform="translate(0, 0)">
      <rect width="240" height="150" rx="14" fill="url(#cardGrad)" stroke="#334155" stroke-width="1.2" />
      <circle cx="36" cy="40" r="16" fill="#1e3a8a" />
      <text x="36" y="46" fill="#60a5fa" font-family="sans-serif" font-size="18" text-anchor="middle" font-weight="bold">◈</text>
      <text x="24" y="85" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">Native Polygons</text>
      <text x="24" y="112" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="400">Real vector elements, zero raster fuzz</text>
    </g>

    <!-- Card 2 -->
    <g transform="translate(265, 0)">
      <rect width="240" height="150" rx="14" fill="url(#cardGrad)" stroke="#334155" stroke-width="1.2" />
      <circle cx="36" cy="40" r="16" fill="#064e3b" />
      <text x="36" y="46" fill="#34d399" font-family="sans-serif" font-size="18" text-anchor="middle" font-weight="bold">☁</text>
      <text x="24" y="85" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">261 GCP Icons</text>
      <text x="24" y="112" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="400">Complete architecture library ready to drop</text>
    </g>

    <!-- Card 3 -->
    <g transform="translate(530, 0)">
      <rect width="240" height="150" rx="14" fill="url(#cardGrad)" stroke="#334155" stroke-width="1.2" />
      <circle cx="36" cy="40" r="16" fill="#4c1d95" />
      <text x="36" y="46" fill="#c084fc" font-family="sans-serif" font-size="18" text-anchor="middle" font-weight="bold">⚡</text>
      <text x="24" y="85" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">In-Browser Only</text>
      <text x="24" y="112" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="400">100% private, instant client-side conversion</text>
    </g>

    <!-- Card 4 -->
    <g transform="translate(795, 0)">
      <rect width="245" height="150" rx="14" fill="url(#cardGrad)" stroke="#334155" stroke-width="1.2" />
      <circle cx="36" cy="40" r="16" fill="#78350f" />
      <text x="36" y="46" fill="#fbbf24" font-family="sans-serif" font-size="18" text-anchor="middle" font-weight="bold">✓</text>
      <text x="24" y="85" fill="#f8fafc" font-family="sans-serif" font-size="18" font-weight="700">0.001% Mean Error</text>
      <text x="24" y="112" fill="#94a3b8" font-family="sans-serif" font-size="14" font-weight="400">Published pixel-diff regression gate</text>
    </g>
  </g>
</svg>`;

const resvg = new Resvg(svg, {
  fitTo: { mode: 'width', value: 1200 },
});
const pngData = resvg.render();
const pngBuffer = pngData.asPng();

fs.writeFileSync(OUT_FILE, pngBuffer);
console.log(`Generated og.png (${pngBuffer.length} bytes) at ${OUT_FILE}`);
