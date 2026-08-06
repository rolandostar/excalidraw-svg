import { ExcalidrawOptions } from '../types';

/**
 * Edge length in Excalidraw canvas units of an icon at `iconScale: 1`.
 *
 * 48 was too small in practice: pasted next to default 20px Excalidraw text an
 * icon read as a bullet point rather than a diagram node, and every user's
 * first action was to scale it up. 96 is the size people were choosing anyway,
 * so it is now what 1x means.
 *
 * Everything downstream is derived from this - card sizing, grid pitch and the
 * sidebar readout - so changing it here changes them together.
 */
export const ICON_BASE_SIZE = 96;

/**
 * Single source of truth for the default export settings.
 *
 * The icon library UI and the fidelity harness BOTH read from here. If they
 * drift apart, the comparison dashboard stops describing what actually lands
 * on the clipboard, which is exactly the class of bug this module prevents.
 */
export const DEFAULT_EXCALIDRAW_OPTIONS: ExcalidrawOptions = {
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
