import fs from 'fs';
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>');
global.DOMParser = dom.window.DOMParser;
global.XMLSerializer = dom.window.XMLSerializer;
global.Element = dom.window.Element;

import * as pointsOnPathModule from 'points-on-path';

function getPointsOnPath(path: string, tolerance?: number, distance?: number): [number, number][][] {
  const mod: any = pointsOnPathModule;
  const fn = mod.pointsOnPath || mod.default?.pointsOnPath || mod.default || mod;
  if (typeof fn === 'function') {
    return fn(path, tolerance, distance);
  }
  return [];
}

const rawSvg = fs.readFileSync('./svg/VMware-Engine.svg', 'utf-8');
const doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
const pathD = doc.querySelector('path')?.getAttribute('d') || '';

const subpaths = getPointsOnPath(pathD);
console.log(`VMware-Engine subpaths count: ${subpaths.length}`);
subpaths.forEach((sp, idx) => {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let area = 0;
  for (let i = 0; i < sp.length; i++) {
    const j = (i + 1) % sp.length;
    area += sp[i][0] * sp[j][1] - sp[j][0] * sp[i][1];
  }
  sp.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });
  console.log(`Subpath ${idx}: pts=${sp.length}, bounds=[x:${minX.toFixed(2)}..${maxX.toFixed(2)}, y:${minY.toFixed(2)}..${maxY.toFixed(2)}], absPolyArea=${Math.abs(area/2).toFixed(2)}`);
});
