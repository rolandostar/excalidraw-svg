import fs from 'fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

import { optimizeSvgString } from '../src/utils/svgOptimizer';
import { parseSvgToExcalidrawElements } from '../src/utils/excalidrawGenerator';

function resolveClipPathsBetter(rawSvg: string): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(rawSvg, 'image/svg+xml');

  // Resolve CSS stylesheet rules first
  const styleMap: Record<string, { fill?: string; stroke?: string; opacity?: string; clipPath?: string }> = {};
  doc.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent || '';
    const ruleBlocks = text.match(/([^{]+)\{([^}]+)\}/g) || [];
    ruleBlocks.forEach(block => {
      const parts = block.split('{');
      if (parts.length < 2) return;
      const selectors = parts[0].split(',').map(s => s.trim().replace(/^\./, ''));
      const declsStr = parts[1];

      const fillMatch = declsStr.match(/fill\s*:\s*([^;\}]+)/i);
      const strokeMatch = declsStr.match(/stroke\s*:\s*([^;\}]+)/i);
      const opacityMatch = declsStr.match(/opacity\s*:\s*([^;\}]+)/i);
      const clipMatch = declsStr.match(/clip-path\s*:\s*([^;\}]+)/i);

      selectors.forEach(sel => {
        if (!styleMap[sel]) styleMap[sel] = {};
        if (fillMatch) styleMap[sel].fill = fillMatch[1].trim();
        if (strokeMatch) styleMap[sel].stroke = strokeMatch[1].trim();
        if (opacityMatch) styleMap[sel].opacity = opacityMatch[1].trim();
        if (clipMatch) styleMap[sel].clipPath = clipMatch[1].trim();
      });
    });
    styleEl.parentNode?.removeChild(styleEl);
  });

  doc.querySelectorAll('*').forEach(el => {
    const className = el.getAttribute('class');
    if (className) {
      className.split(/\s+/).forEach(c => {
        if (styleMap[c]) {
          if (!el.hasAttribute('fill') && styleMap[c].fill) el.setAttribute('fill', styleMap[c].fill!);
          if (!el.hasAttribute('stroke') && styleMap[c].stroke) el.setAttribute('stroke', styleMap[c].stroke!);
          if (!el.hasAttribute('opacity') && styleMap[c].opacity) el.setAttribute('opacity', styleMap[c].opacity!);
          if (!el.hasAttribute('clip-path') && styleMap[c].clipPath) el.setAttribute('clip-path', styleMap[c].clipPath!);
        }
      });
      el.removeAttribute('class');
    }
  });

  // Resolve clip-paths
  doc.querySelectorAll('[clip-path]').forEach(el => {
    const clipAttr = el.getAttribute('clip-path') || '';
    const match = clipAttr.match(/#([^'")]+)/);
    if (!match) return;
    const clipEl = doc.querySelector(`[id="${match[1]}"]`);
    if (!clipEl) return;

    // Check if clipEl contains custom shapes (not just 24x24 rects)
    const clipShapes = clipEl.querySelectorAll('path, polygon, polyline, circle, ellipse, rect');
    const customClipShapes = Array.from(clipShapes).filter(s => {
      const w = parseFloat(s.getAttribute('width') || '0');
      const h = parseFloat(s.getAttribute('height') || '0');
      const d = s.getAttribute('d') || '';
      return !(w >= 20 && h >= 20) && !d.includes('H24V24') && !d.includes('24 24') && !d.includes('M0 0H24V24H0z');
    });

    if (customClipShapes.length > 0) {
      // Find fill from element or child elements
      const fillEl = el.querySelector('[fill]') || el;
      let fill = fillEl.getAttribute('fill') || el.getAttribute('fill');
      if (!fill || fill === 'none' || fill === 'transparent') fill = '#4285F4';

      const strokeEl = el.querySelector('[stroke]') || el;
      const stroke = strokeEl.getAttribute('stroke') || el.getAttribute('stroke');

      const container = doc.createElementNS('http://www.w3.org/2000/svg', 'g');
      const transform = el.getAttribute('transform');
      if (transform) container.setAttribute('transform', transform);

      customClipShapes.forEach(shape => {
        const clone = shape.cloneNode(true) as Element;
        if (fill && fill !== 'none') clone.setAttribute('fill', fill);
        if (stroke && stroke !== 'none') clone.setAttribute('stroke', stroke);
        container.appendChild(clone);
      });

      el.parentNode?.replaceChild(container, el);
      clipEl.parentNode?.removeChild(clipEl);
    } else {
      el.removeAttribute('clip-path');
    }
  });

  return new XMLSerializer().serializeToString(doc);
}

const rawIot = fs.readFileSync('./svg/Iot-Edge.svg', 'utf-8');
const processed = resolveClipPathsBetter(rawIot);
console.log('--- PROCESSED IOT-EDGE SVG ---');
console.log(processed);

const opt = optimizeSvgString(processed);
console.log('--- OPTIMIZED IOT-EDGE SVG ---');
console.log(opt);

const els = parseSvgToExcalidrawElements(opt, 0, 0, 48, 48, 'group-1', 0);
console.log('--- GENERATED EXCALIDRAW ELEMENTS ---');
console.log(JSON.stringify(els, null, 2));
