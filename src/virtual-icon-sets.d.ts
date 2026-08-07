/**
 * Supplied by `vite/icon-sets.ts`, which runs the SVG optimiser in Node at
 * build time so neither SVGO nor the work it does reaches the browser.
 *
 * `svg` is already-optimised markup, byte-identical to what the fidelity
 * harness scores - both call the same `optimizeSvgString`.
 */
declare module 'virtual:icon-sets' {
  export interface BuiltIcon {
    /** Filename without the extension. */
    name: string;
    svg: string;
  }

  export interface BuiltSet {
    /** Folder name under `svg/`. */
    id: string;
    /** Parsed `set.json`, or `{}` when the set has no manifest. */
    manifest: unknown;
    icons: BuiltIcon[];
  }

  export const ICON_SETS: BuiltSet[];
}
