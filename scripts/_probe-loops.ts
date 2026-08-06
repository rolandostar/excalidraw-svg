import fs from 'fs';
import path from 'path';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
(global as any).document = dom.window.document;
(global as any).DOMParser = dom.window.DOMParser;
(global as any).XMLSerializer = dom.window.XMLSerializer;
(global as any).Element = dom.window.Element;

const { optimizeSvgString } = await import('../src/utils/svgOptimizer');
const { parseSvgToExcalidrawElements } = await import('../src/utils/excalidrawGenerator');

const LINE_CONFIRM_THRESHOLD = 8;
const SVG_DIR = path.resolve(process.cwd(), 'svg');
const files = fs.readdirSync(SVG_DIR).filter(f => f.endsWith('.svg'));

let badIcons = 0;
let badElements = 0;
let totalFilledLines = 0;
const worst: Array<[string, number]> = [];

for (const f of files) {
  const name = path.basename(f, '.svg');
  const opt = optimizeSvgString(fs.readFileSync(path.join(SVG_DIR, f), 'utf-8'));
  const els = parseSvgToExcalidrawElements(opt, 0, 0, 48, 48, 'g', 0);
  let bad = 0;
  let maxGap = 0;
  for (const el of els as any[]) {
    if (el.type !== 'line') continue;
    if (!el.backgroundColor || el.backgroundColor === 'transparent') continue;
    totalFilledLines++;
    const p = el.points;
    if (!p || p.length < 3) { bad++; continue; }
    const gap = Math.hypot(p[0][0] - p[p.length - 1][0], p[0][1] - p[p.length - 1][1]);
    if (gap > LINE_CONFIRM_THRESHOLD) { bad++; maxGap = Math.max(maxGap, gap); }
  }
  if (bad > 0) { badIcons++; badElements += bad; worst.push([name, maxGap]); }
}

worst.sort((a, b) => b[1] - a[1]);
console.log(`icons: ${files.length}`);
console.log(`filled line elements total: ${totalFilledLines}`);
console.log(`icons with at least one UNFILLABLE (non-loop) filled line: ${badIcons}`);
console.log(`unfillable elements: ${badElements}`);
console.log('worst 25:', worst.slice(0, 25).map(([n, g]) => `${n}(${g.toFixed(1)})`).join(', '));
