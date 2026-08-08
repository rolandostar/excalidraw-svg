/**
 * Public surface of the SVG -> Excalidraw converter.
 *
 * This file used to be the converter: 2038 lines covering transforms, the CSS
 * cascade, clip paths, masks, stroke outlining, background-plate detection,
 * element emission, item layout and two package formats. It is now a barrel,
 * so every existing importer keeps working while the implementation lives in
 * modules small enough to hold in your head:
 *
 *   svg/      reading an SVG document: matrices, geometry, paint, clipping
 *   convert/  turning that into Excalidraw elements
 *   layout/   arranging elements into items, grids and packages
 */
export {
  parseSvgToExcalidrawElements,
  type ParseSvgOptions,
  type TargetBox,
} from './convert/parseSvg';

export {
  DROP_REASON_LABELS,
  emptyDiagnostics,
  type ConversionDiagnostics,
  type DropReason,
  type ShapeDrop,
} from './convert/diagnostics';

export {
  elementsBounds,
  inkBoxFor,
  measureExcalidrawItem,
  type Bounds,
  type ItemLayout,
} from './layout/itemLayout';

export { createExcalidrawItem } from './layout/buildItem';

export {
  buildExcalidrawClipboardData,
  buildExcalidrawLibraryPackage,
  gridPitch,
  type PackedItem,
} from './layout/packGrid';
