/**
 * Barrel over three unrelated domains, kept only so the ~30 existing
 * `from '../types'` imports keep working.
 *
 *   icons.ts       what an icon and an icon set are
 *   options.ts     the styling options, and the allow-lists behind them
 *   excalidraw.ts  Excalidraw's own wire format
 *
 * Prefer importing the specific module in new code. Nothing in `excalidraw.ts`
 * should ever need `icons.ts`, and pulling all three through here is what hid
 * that for as long as it did.
 */

export type {
  IconAsset,
  IconCategory,
  IconCategoryRule,
  IconSet,
  IconSetManifest,
  IconSetPreset,
  IconSetSummary,
  ResolvedPreset,
} from './icons';

export {
  CARD_CORNERS,
  CARD_FILL_STYLES,
  CARD_STROKE_WIDTHS,
  FONT_FAMILIES,
  GCP_BLUE,
  LABEL_POSITIONS,
  ROUGHNESS,
  type CardCorners,
  type CardFillStyle,
  type CardStrokeWidth,
  type ExcalidrawOptions,
  type LabelFontFamily,
  type LabelPosition,
  type Roughness,
} from './options';

export type {
  ExcalidrawElement,
  ExcalidrawFile,
  ExcalidrawLibraryItem,
  ExcalidrawLibraryPackage,
} from './excalidraw';
