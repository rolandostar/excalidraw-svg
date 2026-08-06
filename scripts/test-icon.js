import fs from 'fs';
import { optimizeSvgString } from '../src/utils/svgOptimizer';
import { parseSvgToExcalidrawElements } from '../src/utils/excalidrawGenerator';

// Mock DOMParser & XMLSerializer for Node environment if needed, or use JSDOM
import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

const rawSvg = fs.readFileSync('./svg/Private-Connectivity.svg', 'utf-8');
const optimizedSvg = optimizeSvgString(rawSvg);
console.log('--- OPTIMIZED SVG ---');
console.log(optimizedSvg);

const elements = parseSvgToExcalidrawElements(optimizedSvg, 0, 0, 48, 48, 'group-1', 0);
console.log('--- GENERATED EXCALIDRAW ELEMENTS ---');
console.log(JSON.stringify(elements, null, 2));
