export interface GCPIcon {
  id: string;
  name: string; // original filename without extension, e.g. "Cloud-Run"
  title: string; // clean display title, e.g. "Cloud Run"
  category: string; // e.g. "Compute & Containers"
  tags: string[];
  rawSvg: string;
  optimizedSvg: string;
  dataUrl: string;
  width: number;
  height: number;
}

export type CardStyle = 'none' | 'soft-card' | 'sketch-box' | 'outline' | 'badge';
export type LabelPosition = 'bottom' | 'right' | 'top' | 'inside';
export type LabelFontFamily = 1 | 2 | 3 | 4 | 5; // 1: Excalifont, 2: Helvetica, 3: Comic Shanns, 4: Lilita One, 5: Nunito
export type ExportMode = 'vector' | 'svg-image';

export interface ExcalidrawOptions {
  exportMode: ExportMode;
  showCard: boolean;
  cardStyle: CardStyle;
  roughness: number; // 0, 1, 2
  cardBgColor: string; // hex or css color
  cardStrokeColor: string;
  showLabel: boolean;
  labelPosition: LabelPosition;
  labelFontFamily: LabelFontFamily;
  labelFontSize: number;
  labelColor: string;
  iconScale: number; // e.g. 1.0 (48px), 1.5 (72px), 2.0 (96px)
  padding: number; // card inner padding
}

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
  frameId: null;
  index: string;
  roundness: { type: number } | null;
  seed: number;
  version: number;
  versionNonce: number;
  isDeleted: boolean;
  boundElements: any[] | null;
  updated: number;
  link: null;
  locked: boolean;
  // Specific for line/polygon
  points?: [number, number][];
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
  baseline?: number;
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

export interface ExcalidrawLibraryItem {
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
