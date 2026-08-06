import fs from 'fs';
import { optimizeSvgString } from '../src/utils/svgOptimizer';

import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

const rawSvg = fs.readFileSync('./svg/Iot-Edge.svg', 'utf-8');
const optimizedSvg = optimizeSvgString(rawSvg);
console.log('--- OPTIMIZED SVG FOR IOT-EDGE ---');
console.log(optimizedSvg);
