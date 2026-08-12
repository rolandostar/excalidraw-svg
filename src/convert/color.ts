/**
 * Colour string arithmetic: expanding, parsing, averaging and weighing.
 *
 * Pure string and number in, string and number out - no `Document`, no React
 * - which is why all three layers can share it. The build-time optimiser
 * averages gradient stops here, the converter weighs mask luminance here, and
 * the swatch row decides tick contrast here. Each used to carry its own
 * `#rgb` expansion, in three different idioms, and two carried their own copy
 * of the sRGB luminance coefficients.
 */

/**
 * The accent an all-gradient or unparseable icon falls back to. Lowercase, in
 * step with `GCP_BLUE`; this is the artwork half of the same colour.
 */
const FALLBACK = '#4285f4';

/** sRGB relative luminance, 0..1, from three 0..255 channels. */
export const relativeLuminance = (r: number, g: number, b: number): number =>
  (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

/**
 * The six hex digits of `#rgb` or `#rrggbb`, lowercased, or null.
 *
 * Shorthand is expanded by doubling each digit, which is what the CSS spec
 * says and what all three call sites were doing by hand.
 */
export function hexDigits(color: string | null | undefined): string | null {
  const match = color?.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (!match) return null;
  return (match.length === 3 ? match.replace(/./g, c => c + c) : match).toLowerCase();
}

/** The three 0..255 channels of `#rgb` or `#rrggbb`, or null. */
export function hexChannels(color: string | null | undefined): [number, number, number] | null {
  const digits = hexDigits(color);
  if (!digits) return null;
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

const toHex = (channel: number): string => Math.round(channel).toString(16).padStart(2, '0');

/** Parses hex or `rgb()` into canonical lowercase `#rrggbb`, or null. */
export function parseHexColor(colorStr: string | null): string | null {
  const digits = hexDigits(colorStr);
  if (digits) return `#${digits}`;

  const rgb = colorStr?.trim().match(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/i);
  return rgb ? `#${toHex(+rgb[1])}${toHex(+rgb[2])}${toHex(+rgb[3])}` : null;
}

/** Mean of every colour in the list that parses, or the fallback accent. */
export function averageHexColors(colors: string[]): string {
  const channels = colors.map(c => hexChannels(parseHexColor(c))).filter(c => c !== null);
  if (channels.length === 0) return FALLBACK;

  const mean = (index: 0 | 1 | 2) =>
    channels.reduce((sum, c) => sum + c[index], 0) / channels.length;

  return `#${toHex(mean(0))}${toHex(mean(1))}${toHex(mean(2))}`;
}
