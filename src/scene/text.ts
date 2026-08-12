/**
 * Label text measurement, matching what Excalidraw will actually draw.
 *
 * Excalidraw's `restoreElement` does **not** recompute width and height for
 * pasted text - `refreshDimensions` is opt-in and the paste path never asks
 * for it - so whatever is written here sizes the card permanently. A
 * character-count estimate is wrong in both directions: "Illustrated" and
 * "WWW Gateway" have the same length and nothing like the same width.
 *
 * Widths are per-character advances from the same TrueType files Excalidraw
 * renders with, so they are exact. Kerning is not modelled; the residual is
 * under 1% on ASCII product names and lands harmlessly, because the label is
 * emitted `textAlign: 'center'` - being slightly off mis-sizes the *card*,
 * never the text's position on it.
 *
 * `lineHeight` is copied, not chosen - see `lineHeightFor`.
 */
import type { LabelFontFamily } from '../types/options';
import { FIRST_CHAR, FONT_METRICS, LAST_CHAR, NORMALISED_UPEM } from './fontMetrics.generated';

/**
 * Fallback for a font id with no generated entry.
 *
 * Unreachable through the UI - `optionsSchema` rejects anything outside the
 * five supported ids - but `measureLabel` is also reached from `set.json`
 * defaults and from restored localStorage, so it must never throw or return
 * NaN. Excalifont is the app default.
 */
const FALLBACK_FONT: LabelFontFamily = 5;

function metricsFor(fontFamily: number) {
  return FONT_METRICS[fontFamily] ?? FONT_METRICS[FALLBACK_FONT];
}

/**
 * Line height Excalidraw will apply to this font.
 *
 * Must be written onto the emitted text element: `restoreElement` falls back
 * to `detectLineHeight(element)` when the field is absent, which back-solves
 * it from the height we supplied and quietly disagrees with the real font.
 */
export function lineHeightFor(fontFamily: LabelFontFamily): number {
  return metricsFor(fontFamily).lineHeight;
}

/** CSS `font-family` stack for previewing this font in the DOM. */
export function fontFamilyCss(fontFamily: LabelFontFamily): string {
  return FONT_STACKS[fontFamily] ?? FONT_STACKS[FALLBACK_FONT];
}

/**
 * Browser-side approximations of the Excalidraw fonts.
 *
 * Only Lilita One and Nunito are the real thing (both are on Google Fonts and
 * loaded in `index.html`). Liberation Sans is metric-compatible with Arial, so
 * that substitution is exact in width even where the shapes differ slightly.
 * Excalifont and Comic Shanns have no web equivalent and no CDN we are willing
 * to depend on, so they preview in a similar-feeling face and only look
 * correct once pasted. The measured widths above are right regardless - they
 * come from the real font files, not from whatever the browser renders.
 */
const FONT_STACKS: Record<number, string> = {
  5: "'Excalifont', 'Kalam', cursive",
  6: "'Nunito', sans-serif",
  7: "'Lilita One', cursive",
  8: "'Comic Shanns', 'JetBrains Mono', monospace",
  9: "'Liberation Sans', Arial, Helvetica, sans-serif",
};

/** Advance width of one line, in em. */
function lineWidthEm(text: string, fontFamily: number): number {
  const { advances, fallbackAdvance } = metricsFor(fontFamily);
  let total = 0;

  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    total +=
      code >= FIRST_CHAR && code <= LAST_CHAR
        ? advances[code - FIRST_CHAR]
        : fallbackAdvance;
  }

  return total / NORMALISED_UPEM;
}

export interface LabelMetrics {
  width: number;
  height: number;
}

/**
 * Size of the box Excalidraw will need for this label.
 *
 * Newlines are honoured because `icon.title` comes from a filename or a
 * `set.json` override and neither is validated against containing one; a
 * multi-line title that measured as one line would overflow its card.
 */
export function measureLabel(
  text: string,
  fontFamily: LabelFontFamily,
  fontSize: number
): LabelMetrics {
  const lines = text.split('\n');
  const widestEm = lines.reduce((widest, line) => Math.max(widest, lineWidthEm(line, fontFamily)), 0);

  return {
    // Rounded up, not to nearest: a card one pixel narrower than its label
    // clips the last glyph, and a card one pixel wider than necessary is
    // invisible.
    width: Math.ceil(widestEm * fontSize),
    height: Math.ceil(lines.length * fontSize * lineHeightFor(fontFamily)),
  };
}
