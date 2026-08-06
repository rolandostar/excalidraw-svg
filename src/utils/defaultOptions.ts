import { ExcalidrawOptions } from '../types';

/**
 * Single source of truth for the default export settings.
 *
 * The UI (App.tsx) and the icon test suite (scripts/generate-all-outputs.ts)
 * BOTH read from here. If they drift apart, the visual comparison dashboard
 * stops describing what actually lands on the clipboard, which is exactly the
 * class of bug this module exists to prevent.
 */
export const DEFAULT_EXCALIDRAW_OPTIONS: ExcalidrawOptions = {
  exportMode: 'vector',
  showCard: false,
  cardStyle: 'none',
  roughness: 0,
  cardBgColor: 'transparent',
  cardStrokeColor: 'transparent',
  showLabel: true,
  labelPosition: 'bottom',
  labelFontFamily: 2, // Sans-serif (Helvetica)
  labelFontSize: 12,
  labelColor: '#94a3b8',
  iconScale: 1.0,
  padding: 0,
};

/**
 * Excalidraw's `LINE_CONFIRM_THRESHOLD` (packages/common/src/constants.ts).
 *
 * A `line` element is only ever filled with its `backgroundColor` when
 * `isPathALoop(points)` is true, i.e. when the distance between the first and
 * the last point is <= this threshold. Any generated polygon that is meant to
 * be a filled region MUST therefore be emitted as a closed ring.
 */
export const LINE_CONFIRM_THRESHOLD = 8;
