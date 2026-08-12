/**
 * Generates `src/scene/fontMetrics.generated.ts` from Excalidraw's own TTFs.
 *
 *   pnpm gen:font-metrics
 *
 * ## Why a generated table rather than measuring at runtime
 *
 * `createExcalidrawItem` has to write a `width` and `height` onto the label
 * text element, and Excalidraw's `restoreElement` does **not** re-measure
 * pasted text - `refreshDimensions` is opt-in and the paste path does not pass
 * it. Whatever we write is what the card is sized around forever.
 *
 * Measuring properly means canvas `measureText` with the real font loaded, and
 * none of the three fonts that matter are available to us: Excalifont and
 * Comic Shanns are not on any web font CDN, `Excalifont.ttf` alone is 23 MB,
 * and `vite.config.ts` deliberately strips the 16.6 MB of woff2 that ships
 * inlined in `@excalidraw/utils`. The fidelity harness also runs under Node,
 * where there is no canvas at all.
 *
 * So the widths are extracted here, once, from the TTFs that are already in
 * `node_modules`, and committed as a ~4 KB table that browser and harness both
 * read. Re-run this after upgrading `@excalidraw/utils`.
 *
 * ## What it deliberately does not do
 *
 * Kerning and ligatures are ignored: this sums raw `hmtx` advance widths.
 * On ASCII product names that is worth well under 1%, and the error is
 * harmless in the one place it lands - the label is emitted with
 * `textAlign: 'center'`, so Excalidraw centres the glyph run inside whatever
 * width we declare. A slightly wrong width mis-sizes the *card*, never the
 * text's position on it.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ASSETS = path.join(
  ROOT,
  'node_modules/@excalidraw/utils/dist/prod/assets'
);
const OUT_FILE = path.join(ROOT, 'src/scene/fontMetrics.generated.ts');

/**
 * The five fonts the sidebar offers, keyed by Excalidraw's real numeric font
 * id (`FONT_FAMILY` in `@excalidraw/common`). Ids 1/2/3 are Virgil, Helvetica
 * and Cascadia - all flagged `deprecated` in `FONT_METADATA` - and 4 is
 * permanently unused. Getting this wrong is exactly the bug that made
 * "Lilita One" paste as the Windows emoji fallback.
 */
const FONTS: { id: number; family: string; file: string; lineHeight: number }[] = [
  { id: 5, family: 'Excalifont', file: 'Excalifont.ttf', lineHeight: 1.25 },
  { id: 6, family: 'Nunito', file: 'Nunito ExtraLight Medium.ttf', lineHeight: 1.35 },
  { id: 7, family: 'Lilita One', file: 'Lilita One.ttf', lineHeight: 1.15 },
  { id: 8, family: 'Comic Shanns', file: 'Comic Shanns Regular.ttf', lineHeight: 1.25 },
  { id: 9, family: 'Liberation Sans', file: 'Liberation Sans.ttf', lineHeight: 1.15 },
];

/** Printable ASCII. Icon titles are product names; nothing else appears. */
const FIRST_CHAR = 32;
const LAST_CHAR = 126;

/** Advance widths are emitted against this em size, matching Excalidraw's own metrics. */
const NORMALISED_UPEM = 1000;

// --- minimal sfnt reader ---------------------------------------------------
//
// Only the four tables needed for advance widths. A full font parser would be
// a dependency and several hundred lines to read tables this file ignores.

interface Table {
  offset: number;
  length: number;
}

function readTables(buf: Buffer): Map<string, Table> {
  const tag = buf.readUInt32BE(0);
  // 'ttcf' - a collection. None of Excalidraw's assets are one, but failing
  // loudly beats silently reading the collection header as a table directory.
  if (tag === 0x74746366) {
    throw new Error('TrueType Collections are not supported');
  }

  const numTables = buf.readUInt16BE(4);
  const tables = new Map<string, Table>();

  for (let i = 0; i < numTables; i++) {
    const rec = 12 + i * 16;
    tables.set(buf.toString('ascii', rec, rec + 4), {
      offset: buf.readUInt32BE(rec + 8),
      length: buf.readUInt32BE(rec + 12),
    });
  }

  return tables;
}

function required(tables: Map<string, Table>, name: string): Table {
  const table = tables.get(name);
  if (!table) throw new Error(`missing required table "${name}"`);
  return table;
}

/**
 * Character code -> glyph id.
 *
 * Prefers a format 12 subtable (full Unicode) over format 4 (BMP only). Both
 * appear across these five files; Liberation Sans ships only format 4.
 */
function readCmap(buf: Buffer, table: Table): Map<number, number> {
  const base = table.offset;
  const numSubtables = buf.readUInt16BE(base + 2);

  let best: { offset: number; score: number } | null = null;

  for (let i = 0; i < numSubtables; i++) {
    const rec = base + 4 + i * 8;
    const platformId = buf.readUInt16BE(rec);
    const encodingId = buf.readUInt16BE(rec + 2);
    const offset = base + buf.readUInt32BE(rec + 4);
    const format = buf.readUInt16BE(offset);

    if (format !== 4 && format !== 12) continue;

    // Windows full-Unicode, then Windows BMP, then anything Unicode.
    const score =
      platformId === 3 && encodingId === 10
        ? 3
        : platformId === 3 && encodingId === 1
        ? 2
        : platformId === 0
        ? 1
        : 0;

    if (score > 0 && (!best || score > best.score)) best = { offset, score };
  }

  if (!best) throw new Error('no usable cmap subtable (need format 4 or 12)');

  const format = buf.readUInt16BE(best.offset);
  return format === 12
    ? readCmapFormat12(buf, best.offset)
    : readCmapFormat4(buf, best.offset);
}

function readCmapFormat4(buf: Buffer, offset: number): Map<number, number> {
  const segCount = buf.readUInt16BE(offset + 6) / 2;
  const endCodes = offset + 14;
  const startCodes = endCodes + segCount * 2 + 2; // +2 for reservedPad
  const idDeltas = startCodes + segCount * 2;
  const idRangeOffsets = idDeltas + segCount * 2;

  const map = new Map<number, number>();

  for (let seg = 0; seg < segCount; seg++) {
    const end = buf.readUInt16BE(endCodes + seg * 2);
    const start = buf.readUInt16BE(startCodes + seg * 2);
    if (start > end) continue;

    const delta = buf.readInt16BE(idDeltas + seg * 2);
    const rangeOffsetAt = idRangeOffsets + seg * 2;
    const rangeOffset = buf.readUInt16BE(rangeOffsetAt);

    for (let code = start; code <= end && code !== 0xffff; code++) {
      let glyph: number;

      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff;
      } else {
        // The spec's pointer arithmetic: the offset is relative to the
        // position of the idRangeOffset entry itself.
        const at = rangeOffsetAt + rangeOffset + (code - start) * 2;
        if (at + 1 >= buf.length) continue;
        const raw = buf.readUInt16BE(at);
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff;
      }

      if (glyph !== 0) map.set(code, glyph);
    }
  }

  return map;
}

function readCmapFormat12(buf: Buffer, offset: number): Map<number, number> {
  const numGroups = buf.readUInt32BE(offset + 12);
  const map = new Map<number, number>();

  for (let g = 0; g < numGroups; g++) {
    const rec = offset + 16 + g * 12;
    const start = buf.readUInt32BE(rec);
    const end = buf.readUInt32BE(rec + 4);
    const startGlyph = buf.readUInt32BE(rec + 8);

    // Bounded: these fonts cover the full Unicode plane and we only ever ask
    // about printable ASCII. Walking every group in full would build a
    // million-entry map to answer 95 questions.
    const from = Math.max(start, FIRST_CHAR);
    const to = Math.min(end, LAST_CHAR);

    for (let code = from; code <= to; code++) {
      map.set(code, startGlyph + (code - start));
    }
  }

  return map;
}

/** Advance width in font units for a glyph id. */
function makeAdvanceReader(
  buf: Buffer,
  hhea: Table,
  hmtx: Table
): (glyph: number) => number {
  const numberOfHMetrics = buf.readUInt16BE(hhea.offset + 34);
  if (numberOfHMetrics === 0) throw new Error('hhea declares no horizontal metrics');

  return glyph => {
    // Monospaced tails are stored once: any glyph past the last full metric
    // reuses it, and only its left side bearing is listed individually.
    const index = Math.min(glyph, numberOfHMetrics - 1);
    return buf.readUInt16BE(hmtx.offset + index * 4);
  };
}

// --- extraction ------------------------------------------------------------

interface FontResult {
  id: number;
  family: string;
  lineHeight: number;
  /** Advance width per printable-ASCII char, at `NORMALISED_UPEM`. */
  advances: number[];
  /** Used for any character outside printable ASCII. */
  fallback: number;
}

function extract(font: (typeof FONTS)[number]): FontResult {
  const buf = fs.readFileSync(path.join(ASSETS, font.file));
  const tables = readTables(buf);

  const head = required(tables, 'head');
  const unitsPerEm = buf.readUInt16BE(head.offset + 18);
  if (!unitsPerEm) throw new Error('head declares unitsPerEm 0');

  const advanceOf = makeAdvanceReader(
    buf,
    required(tables, 'hhea'),
    required(tables, 'hmtx')
  );
  const cmap = readCmap(buf, required(tables, 'cmap'));

  const scale = NORMALISED_UPEM / unitsPerEm;
  const advances: number[] = [];
  let missing = 0;

  for (let code = FIRST_CHAR; code <= LAST_CHAR; code++) {
    const glyph = cmap.get(code);
    if (glyph === undefined) missing++;
    // A character the font does not have is rendered from a fallback font, so
    // a lowercase-x-ish width is a better guess than zero.
    advances.push(glyph === undefined ? 0 : Math.round(advanceOf(glyph) * scale));
  }

  // 'n' is the conventional stand-in for average advance and is present in
  // every one of these fonts.
  const nAdvance = advances['n'.charCodeAt(0) - FIRST_CHAR];
  const nonZero = advances.filter(a => a > 0);
  const fallback =
    nAdvance > 0
      ? nAdvance
      : Math.round(nonZero.reduce((sum, a) => sum + a, 0) / (nonZero.length || 1));

  for (let i = 0; i < advances.length; i++) {
    if (advances[i] === 0) advances[i] = fallback;
  }

  if (missing > 0) {
    console.warn(
      `  ! ${font.family}: ${missing} printable-ASCII characters absent, substituted ${fallback}`
    );
  }

  return {
    id: font.id,
    family: font.family,
    lineHeight: font.lineHeight,
    advances,
    fallback,
  };
}

function render(results: FontResult[]): string {
  const rows = results
    .map(
      r =>
        `  // ${r.family}\n` +
        `  ${r.id}: {\n` +
        `    family: ${JSON.stringify(r.family)},\n` +
        `    lineHeight: ${r.lineHeight},\n` +
        `    fallbackAdvance: ${r.fallback},\n` +
        `    advances: [\n` +
        chunk(r.advances, 16)
          .map(line => `      ${line.join(', ')},`)
          .join('\n') +
        `\n    ],\n` +
        `  },`
    )
    .join('\n');

  return `/**
 * GENERATED FILE - do not edit by hand.
 *
 * Written by \`pnpm gen:font-metrics\` (\`scripts/gen-font-metrics.ts\`) from the
 * TrueType files that ship inside \`@excalidraw/utils\`. Regenerate after any
 * upgrade of that package.
 *
 * Advance widths are per printable-ASCII character (${FIRST_CHAR}..${LAST_CHAR}),
 * normalised to an em of ${NORMALISED_UPEM} units. \`lineHeight\` values are copied
 * from Excalidraw's own \`FONT_METADATA\`, not measured - they are what
 * Excalidraw uses to lay the text out, so they have to match exactly.
 *
 * Kerning is not represented; see the header of the generator for why that is
 * safe here.
 */

export const FIRST_CHAR = ${FIRST_CHAR};
export const LAST_CHAR = ${LAST_CHAR};
export const NORMALISED_UPEM = ${NORMALISED_UPEM};

export interface GeneratedFontMetrics {
  family: string;
  lineHeight: number;
  fallbackAdvance: number;
  advances: readonly number[];
}

export const FONT_METRICS: Record<number, GeneratedFontMetrics> = {
${rows}
};
`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function main(): void {
  if (!fs.existsSync(ASSETS)) {
    console.error(`Font assets not found at ${ASSETS}`);
    console.error('Install dependencies first: pnpm install');
    process.exit(1);
  }

  console.log('Reading Excalidraw font assets\n');

  const results = FONTS.map(font => {
    const result = extract(font);
    const sample = 'BigQuery';
    const width = [...sample].reduce(
      (sum, ch) => sum + (result.advances[ch.charCodeAt(0) - FIRST_CHAR] ?? result.fallback),
      0
    );
    console.log(
      `  ${font.id}  ${font.family.padEnd(16)} ` +
        `lineHeight ${result.lineHeight}  "${sample}" = ${(width / NORMALISED_UPEM).toFixed(3)} em`
    );
    return result;
  });

  fs.writeFileSync(OUT_FILE, render(results), 'utf-8');
  const bytes = fs.statSync(OUT_FILE).size;
  console.log(`\nWrote ${path.relative(ROOT, OUT_FILE)} (${(bytes / 1024).toFixed(1)} KB)`);
}

main();
