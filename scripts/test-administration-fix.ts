import fs from 'fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

import { optimizeSvgString } from '../src/utils/svgOptimizer';
import { parseSvgToExcalidrawElements } from '../src/utils/excalidrawGenerator';

console.log('=== ADMIN & CATALOG TEST ===');

const adminRaw = fs.readFileSync('./svg/Administration.svg', 'utf-8');
const adminOpt = optimizeSvgString(adminAdminSvg(adminRaw));
const adminEls = parseSvgToExcalidrawElements(adminOpt, 0, 0, 48, 48, 'group-1', 0);

function adminAdminSvg(s: string) { return s; }

console.log('Admin Elements:');
adminEls.forEach((el, idx) => {
  console.log(`Element ${idx}: type=${el.type}, strokeColor=${el.strokeColor}, backgroundColor=${el.backgroundColor}, pointsCount=${el.points?.length}`);
});

const catalogRaw = fs.readFileSync('./svg/Catalog.svg', 'utf-8');
const catalogOpt = optimizeSvgString(catalogRaw);
const catalogEls = parseSvgToExcalidrawElements(catalogOpt, 0, 0, 48, 48, 'group-1', 0);

console.log('Catalog Elements:');
catalogEls.forEach((el, idx) => {
  console.log(`Element ${idx}: type=${el.type}, strokeColor=${el.strokeColor}, backgroundColor=${el.backgroundColor}, pointsCount=${el.points?.length}`);
});
