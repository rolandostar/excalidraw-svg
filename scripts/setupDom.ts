/**
 * Browser environment shim for running the browser-oriented `src/utils/*` code
 * AND the real `@excalidraw/utils` renderer inside Node.
 *
 * IMPORTANT: this module must be imported *first* (before anything that touches
 * `document`, `DOMParser` or `@excalidraw/utils`). ES module dependencies are
 * evaluated in declaration order, so `import './setupDom'` at the top of a
 * script guarantees the globals exist before the rest of the graph loads.
 */
import { JSDOM } from 'jsdom';

export const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  pretendToBeVisual: true,
  url: 'https://excalidraw-gcp.local/',
});

const win = dom.window as unknown as Record<string, any>;

function define(key: string, value: unknown) {
  try {
    Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  } catch {
    (globalThis as Record<string, any>)[key] = value;
  }
}

// Mirror every window own-property onto globalThis (Excalidraw's bundle reads a
// lot of bare globals: `devicePixelRatio`, `top`, `location`, `matchMedia`, ...).
for (const key of Object.getOwnPropertyNames(win)) {
  if (key in globalThis) continue;
  try {
    const value = win[key];
    // Unbound host functions (`getComputedStyle`, `matchMedia`, ...) throw an
    // "Illegal invocation" when called with `globalThis` as receiver.
    define(key, typeof value === 'function' && !/^[A-Z]/.test(key) ? value.bind(win) : value);
  } catch {
    /* non-configurable window props (e.g. `window`) - safe to skip */
  }
}

// These already exist on globalThis in Node (or are non-configurable above),
// so they need to be overwritten explicitly.
define('window', win);
define('self', win);
define('top', win);
define('parent', win);
define('document', win.document);
define('navigator', win.navigator);
define('location', win.location);
define('devicePixelRatio', 1);

