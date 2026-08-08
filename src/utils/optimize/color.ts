/**
 * Owns colour string arithmetic: parsing to a canonical hex, and averaging.
 *
 * Separate because it is the only part of the optimiser with no `Document` in
 * sight - pure string in, string out - and both the gradient pass and the
 * final normalisation pass need it.
 */

/**
 * Parses hex or RGB string into uppercase 6-digit hex format (#RRGGBB).
 */
export function parseHexColor(colorStr: string | null): string | null {
  if (!colorStr) return null;
  const cleaned = colorStr.trim();
  if (cleaned.startsWith('#')) {
    let hex = cleaned.substring(1);
    if (hex.length === 3) hex = hex.split('').map(c => c + c).join('');
    if (hex.length === 6) return `#${hex.toUpperCase()}`;
  }
  const rgbMatch = cleaned.match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1], 10).toString(16).padStart(2, '0');
    const g = parseInt(rgbMatch[2], 10).toString(16).padStart(2, '0');
    const b = parseInt(rgbMatch[3], 10).toString(16).padStart(2, '0');
    return `#${(r + g + b).toUpperCase()}`;
  }
  return null;
}

/**
 * Computes average solid hex color from a list of color strings.
 */
export function averageHexColors(colors: string[]): string {
  if (!colors || colors.length === 0) return '#4285F4';
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

  if (count === 0) return '#4285F4';
  const avgR = Math.round(totalR / count).toString(16).padStart(2, '0');
  const avgG = Math.round(totalG / count).toString(16).padStart(2, '0');
  const avgB = Math.round(totalB / count).toString(16).padStart(2, '0');
  return `#${(avgR + avgG + avgB).toUpperCase()}`;
}
