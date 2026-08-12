/**
 * The conversion pipeline, end to end.
 *
 * Deliberately thin: read the viewBox, work out the fit, run every drawable
 * element through `convertShapeElement`, dedupe, drop the background plate,
 * emit. Each of those steps is a module of its own, so this file is the place
 * to read the *order* things happen in and nothing else.
 */
import type { ExcalidrawElement } from '../../types/excalidraw';
import { parseCssStylesheet } from '../svg/stylesheet';
import { toleranceFor } from '../svg/pathFlatten';
import { readViewBox } from '../svg/viewBox';
import { DRAWABLE_SHAPES } from '../svg/geometry';
import { ConversionDiagnostics, DiagnosticsSink } from './diagnostics';
import { type ConvertContext, RawShapeSink, convertShapeElement } from './shapeConverters';
import { dedupeRawShapes } from './rawShape';
import { dropBackgroundPlate } from './backgroundPlate';
import { rawShapesToElements } from './emit';

/**
 * A hole smaller than this many square output pixels is dropped rather than
 * bridged. Well below one pixel, so nothing visible is ever discarded.
 */
const MIN_VISIBLE_HOLE_AREA_PX = 0.02;

/**
 * Artboard assumed when a file declares no usable size. 24x24 is what the
 * curated icon corpus is authored against, and treating an unsized file as a
 * 24-unit artboard at least puts it in the right order of magnitude.
 */
const FALLBACK_ARTBOARD = { width: 24, height: 24 };

/** The scene-space box the artwork is fitted into. */
export interface TargetBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParseSvgOptions {
  groupId: string;
  roughness: number;
  /**
   * Optional out-parameter, filled with a per-reason tally of source shapes
   * that produced no output. Only the upload path, which reports to a user,
   * passes one.
   */
  diagnostics?: ConversionDiagnostics;
}

/** Converts SVG paths, curves, polygons, and shapes into Excalidraw vector elements */
export function parseSvgToExcalidrawElements(
  rawSvg: string,
  target: TargetBox,
  opts: ParseSvgOptions
): ExcalidrawElement[] {
  const drops = new DiagnosticsSink(opts.diagnostics);

  try {
    const doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
    const svgEl = doc.querySelector('svg');
    if (!svgEl) return [];

    // --- fit: viewBox -> target box, uniform and centred -------------------
    const viewBox = readViewBox(svgEl, FALLBACK_ARTBOARD);
    const scale = Math.min(target.width / viewBox.width, target.height / viewBox.height);
    const offsetX = target.x + (target.width - viewBox.width * scale) / 2 - viewBox.x * scale;
    const offsetY = target.y + (target.height - viewBox.height * scale) / 2 - viewBox.y * scale;

    const tolerance = toleranceFor(scale);

    const ctx: ConvertContext = {
      doc,
      styleMap: parseCssStylesheet(doc),
      tolerance,
      // Smallest hole worth keeping, in user units squared - the pixel floor
      // converted into the source's own coordinates.
      sink: new RawShapeSink(MIN_VISIBLE_HOLE_AREA_PX / (scale * scale), tolerance),
    };

    // --- convert: one pass over the document, in paint order ---------------
    doc.querySelectorAll(DRAWABLE_SHAPES).forEach(el => {
      try {
        const reason = convertShapeElement(el, ctx);
        if (reason) drops.note(reason, el.tagName.toLowerCase());
      } catch (err) {
        console.warn(`Shape conversion warning (<${el.tagName.toLowerCase()}>):`, err);
        drops.note(
          'parse-error',
          el.tagName.toLowerCase(),
          err instanceof Error ? err.message : String(err)
        );
      }
    });

    const unique = dedupeRawShapes(ctx.sink.shapes);
    if (unique.length === 0) return [];

    // NOTE: there is deliberately no "open path with a fill becomes a stroke"
    // fixup here any more. Every stroke is now emitted as the area it covers
    // (see `RawShapeSink.pushStroke`), so no shape reaching this point is an
    // open path.
    const drawable = dropBackgroundPlate(unique, viewBox);

    return rawShapesToElements(drawable, {
      scale,
      offsetX,
      offsetY,
      groupId: opts.groupId,
      roughness: opts.roughness,
    });
  } catch (err) {
    console.error('Vector parsing error:', err);
    return [];
  }
}
