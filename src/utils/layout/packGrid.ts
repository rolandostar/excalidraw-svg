/**
 * Laying many items out on a grid, and the two package formats that carry the
 * result out of the app.
 *
 * Separate from `buildItem.ts` because packing is about the *relationship*
 * between items - a pitch is only meaningful across a set - and because the
 * two exporters differ solely in their gutter, column count and envelope.
 */
import type { IconAsset } from '../../types/icons';
import type { ExcalidrawOptions } from '../../types/options';
import type {
  ExcalidrawElement,
  ExcalidrawFile,
  ExcalidrawLibraryPackage,
} from '../../types/excalidraw';
import { generateRandomId } from '../convert/emit';
import { createExcalidrawItem } from './buildItem';
import { elementsBounds, translateElements } from './itemLayout';

export interface PackedItem {
  icon: IconAsset;
  elements: ExcalidrawElement[];
  files: Record<string, ExcalidrawFile>;
}

/**
 * Builds every item and lays them out on a grid sized to what they measure.
 *
 * Two passes over one conversion each: build at the origin, take each item's
 * real extent, then translate into a cell. The pitch has to come from the
 * built items: `fitFrame` sizes the frame from ink, and source artwork is not
 * clipped to its own `viewBox`, so a file that draws outside it
 * (`Iot-Edge.svg` does, by 12 units) is larger than any measurement taken
 * before conversion can predict.
 *
 * Cells are aligned on each item's measured bounds rather than on its
 * nominal origin, so the escaping case is centred in its cell instead of
 * hanging out of one corner. For the 259 icons that stay inside their viewBox
 * the two are the same point and nothing moves.
 */
function packGrid(
  icons: IconAsset[],
  options: ExcalidrawOptions,
  gutter: number,
  columns: number
): PackedItem[] {
  const built = icons.map(icon => ({ icon, ...createExcalidrawItem(icon, options, 0, 0) }));
  const boxes = built.map(item => elementsBounds(item.elements));

  let widest = 0;
  let tallest = 0;
  for (const box of boxes) {
    if (!box) continue;
    if (box.width > widest) widest = box.width;
    if (box.height > tallest) tallest = box.height;
  }

  const pitchX = Math.ceil(widest) + gutter;
  const pitchY = Math.ceil(tallest) + gutter;

  built.forEach((item, idx) => {
    const box = boxes[idx];
    if (!box) return;
    const col = idx % columns;
    const row = Math.floor(idx / columns);
    translateElements(item.elements, col * pitchX - box.x, row * pitchY - box.y);
  });

  return built;
}

export function buildExcalidrawLibraryPackage(
  icons: IconAsset[],
  options: ExcalidrawOptions
): ExcalidrawLibraryPackage {
  const allFiles: Record<string, ExcalidrawFile> = {};

  const libraryItems = packGrid(icons, options, 32, 10).map(({ icon, elements, files }) => {
    // `files` used to be discarded here. When vector conversion yields nothing,
    // `createExcalidrawItem` falls back to an `image` element whose bitmap
    // lives in `files` - dropping the map left a library item pointing at a
    // `fileId` that does not exist, which Excalidraw renders as an empty box.
    Object.assign(allFiles, files);

    return {
      id: generateRandomId(),
      status: 'published' as const,
      created: Date.now(),
      name: icon.title,
      elements,
      ...(Object.keys(files).length > 0 ? { files } : {}),
    };
  });

  // Carried both per-item and at the top level: the `.excalidrawlib` v2 schema
  // is not explicit about where files belong, and different Excalidraw builds
  // have looked in either place.
  return {
    type: 'excalidrawlib',
    version: 2,
    libraryItems,
    ...(Object.keys(allFiles).length > 0 ? { files: allFiles } : {}),
  };
}

export function buildExcalidrawClipboardData(
  icons: IconAsset[],
  options: ExcalidrawOptions
): { jsonText: string; excalidrawClipboardJson: string } {
  let allElements: ExcalidrawElement[] = [];
  const allFiles: Record<string, ExcalidrawFile> = {};

  for (const { elements, files } of packGrid(icons, options, 24, 8)) {
    allElements = allElements.concat(elements);
    Object.assign(allFiles, files);
  }

  const payload = {
    type: 'excalidraw/clipboard',
    elements: allElements,
    files: allFiles,
  };

  return {
    jsonText: JSON.stringify(payload, null, 2),
    excalidrawClipboardJson: JSON.stringify(payload),
  };
}
