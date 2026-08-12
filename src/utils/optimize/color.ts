/**
 * Owns colour string arithmetic: parsing to a canonical hex, and averaging.
 *
 * Separate because it is the only part of the optimiser with no `Document` in
 * sight - pure string in, string out - and both the gradient pass and the
 * final normalisation pass need it.
 */

/**
 * The accent an all-gradient or unparseable icon falls back to. Lowercase, in
 * step with `GCP_BLUE`; this is the artwork half of the same colour.
 */
const FALLBACK = '#4285f4';

/** Parses hex or `rgb()` into canonical lowercase `#rrggbb`, or null. */
export function parseHexColor(colorStr: string | null): string | null {
  if (!colorStr) return null;
  const cleaned = colorStr.trim();
  if (cleaned.startsWith('#')) {
    let hex = cleaned.substring(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) return `#${hex.toLowerCase()}`;
  }
  const rgbMatch = cleaned.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${r + g + b}`;
  }
  return null;
}

/**
 * Computes average solid hex color from a list of color strings.
 */
export function averageHexColors(colors: string[]): string {
  if (!colors || colors.length === 0) return FALLBACK;
  let totalR = 0, totalG = 0, totalB = 0, count = 0;

  colors.forEach(c => {
    const hex = parseHexColor(c);
    if (hex) {
      const raw = hex.substring(1);
      totalR += parseInt(raw.substring(0, 2), 16);
      totalG += parseInt(raw.substring(2, 4), 16);
      totalB += parseInt(raw.substring(4, 6), 16);
      count++;
    }
  });

  if (count === 0) return FALLBACK;
  const avgR = Math.round(totalR / count).toString(16).padStart(2, '0');
  const avgG = Math.round(totalG / count).toString(16).padStart(2, '0');
  const avgB = Math.round(totalB / count).toString(16).padStart(2, '0');
  return `#${(avgR + avgG + avgB).toUpperCase()}`;
}
