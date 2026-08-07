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
  /*
   * Inert while `showCard` is false - `createExcalidrawItem` emits no
   * rectangle at all - but they are what you get the instant you switch the
   * frame on, so they have to be values that draw something.
   *
   * They used to be `'none'` and two `transparent` colours, which meant
   * enabling the frame produced a rectangle with no stroke and no fill, and
   * `cardStyle: 'none'` suppressed it entirely. The control appeared to do
   * nothing, and so did every style button behind it.
   */
  cardStyle: 'soft-card',
  roughness: 0,
  cardBgColor: 'transparent',
  cardStrokeColor: '#4285f4',
  showLabel: true,
  labelPosition: 'bottom',
  // Excalifont, at the size Excalidraw itself calls Medium. A pasted icon
  // lands next to hand-drawn text far more often than next to Helvetica, and
  // 12px read as a footnote beside a 96px icon.
  labelFontFamily: 1,
  labelFontSize: 18,
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

/**
 * Repairs option objects restored from localStorage.
 *
 * `asPartialOf` validates by `typeof`, so any string survives as a
 * `cardStyle` - including values this build no longer knows about. Two are
 * corrected here rather than left to render nothing:
 *
 *   `badge`  removed; it emitted a rectangle identical to `soft-card`
 *   `none`   with the frame switched on, suppressed the rectangle entirely,
 *            so the toggle looked broken
 */
const KNOWN_CARD_STYLES = new Set(['none', 'soft-card', 'sketch-box', 'outline']);

export function normaliseOptions(options: ExcalidrawOptions): ExcalidrawOptions {
  let next = options;

  if (!KNOWN_CARD_STYLES.has(next.cardStyle)) {
    next = { ...next, cardStyle: 'soft-card' };
  }

  if (next.showCard && next.cardStyle === 'none') {
    next = { ...next, cardStyle: 'soft-card' };
  }

  if (next.showCard && next.cardStrokeColor === 'transparent' && next.cardBgColor === 'transparent') {
    next = { ...next, cardStrokeColor: '#4285f4' };
  }

  return next;
}
