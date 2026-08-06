import fs from 'fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

import { optimizeSvgString } from '../src/utils/svgOptimizer';
import { parseSvgToExcalidrawElements } from '../src/utils/excalidrawGenerator';

console.log('Testing generate-all-outputs on Administration, Catalog, Iot-Edge...');

['Administration', 'Catalog', 'Iot-Edge'].forEach(name => {
  const filePath = `./svg/${name}.svg`;
  if (!fs.existsSync(filePath)) {
    console.log(`File not found: ${filePath}`);
    return;
  }
  const raw = fs.readFileSync(filePath, 'utf-8');
  const opt = optimizeSvgString(raw);
  const els = parseSvgToExcalidrawElements(opt, 0, 0, 48, 48, 'group-1', 0);
  console.log(`\n--- ${name} ---`);
  console.log(`Elements generated: ${els.length}`);
  els.forEach((el, idx) => {
    console.log(`  El ${idx}: type=${el.type}, stroke=${el.strokeColor}, bg=${el.backgroundColor}, points=${el.points?.length}`);
  });
});
