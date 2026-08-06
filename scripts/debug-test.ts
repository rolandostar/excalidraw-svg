import fs from 'fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

import { optimizeSvgString } from '../src/utils/svgOptimizer';
import { parseSvgToExcalidrawElements } from '../src/utils/excalidrawGenerator';

console.log('=== TESTING ADMINISTRATION ===');
const adminRaw = fs.readFileSync('./svg/Administration.svg', 'utf-8');
const adminOpt = optimizeSvgString(adminRaw);
console.log('Optimized Administration SVG:');
console.log(adminOpt);
const adminEls = parseSvgToExcalidrawElements(adminOpt, 0, 0, 48, 48, 'group-1', 0);
console.log('Administration Excalidraw Elements count:', adminEls.length);
console.log(JSON.stringify(adminEls, null, 2));

console.log('\n=== TESTING CATALOG ===');
const catalogRaw = fs.readFileSync('./svg/Catalog.svg', 'utf-8');
const catalogOpt = optimizeSvgString(catalogRaw);
console.log('Optimized Catalog SVG:');
console.log(catalogOpt);
const catalogEls = parseSvgToExcalidrawElements(catalogOpt, 0, 0, 48, 48, 'group-1', 0);
console.log('Catalog Excalidraw Elements count:', catalogEls.length);
console.log(JSON.stringify(catalogEls, null, 2));
