/**
 * Owns the wire format: the shape of the JSON that goes onto the clipboard or
 * into an `.excalidrawlib` file.
 */

/**
 * TODO: `ExcalidrawElement` should be a discriminated union on `type`.
 * `points` only exists on lines, `fileId`/`scale`/`status` only on images, and
 * the seven text fields only on text - all of them are optional here, so the
 * compiler cannot stop the emitter reading `element.points` off an image, and
 * `sceneAudit` has to re-check at runtime what a union would have made
 * unrepresentable.
 *
 * Not a type-only change: the emitters spread a shared base object, which a
 * union rejects, so it wants its own commit with the harness green either
 * side.
 */
export interface ExcalidrawElement {
  id: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  angle: number;
  strokeColor: string;
  backgroundColor: string;
  fillStyle: string;
  strokeWidth: number;
  strokeStyle: string;
  roughness: number;
  opacity: number;
  groupIds: string[];
  /** Id of the containing frame element. Always `null` here - we emit no frames. */
  frameId: string | null;
  index: string;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  /** Arrows and labels bound to this element. Always `null` here - we bind nothing. */
  boundElements: Array<{ id: string; type: 'arrow' | 'text' }> | null;
  updated: number;
  /** Hyperlink attached to the element. Always `null` here. */
  link: string | null;
  locked: boolean;
  // Specific for line
  points?: [number, number][];
  /**
   * Marks a `line` as a closed polygon.
   *
   * Not a rendering flag - Excalidraw fills a line based on
   * `isPathALoop(points)` and never reads this when drawing. It drives editor
   * behaviour: the line editor's polygon toggle, and whether the bucket-fill
   * tool treats existing paint as restylable.
   *
   * Excalidraw's `restore` resets it to false unless `isValidPolygon(points)`
   * holds, which needs more than three points and a first that equals the last.
   */
  polygon?: boolean;
  // Specific for image
  fileId?: string;
  scale?: [number, number];
  status?: string;
  // Specific for text
  text?: string;
  fontSize?: number;
  fontFamily?: number;
  textAlign?: string;
  verticalAlign?: string;
  containerId?: string | null;
  originalText?: string;
  lineHeight?: number;
}

export interface ExcalidrawFile {
  mimeType: string;
  id: string;
  dataURL: string;
  created: number;
}

interface ExcalidrawLibraryItem {
  id: string;
  status: 'published' | 'unpublished';
  created: number;
  name?: string;
  elements: ExcalidrawElement[];
  files?: Record<string, ExcalidrawFile>;
}

export interface ExcalidrawLibraryPackage {
  type: 'excalidrawlib';
  version: 2;
  libraryItems: ExcalidrawLibraryItem[];
  files?: Record<string, ExcalidrawFile>;
}
