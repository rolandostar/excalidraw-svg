/**
 * Reports SVG features the converter cannot represent.
 *
 * The conversion pipeline is deliberately silent about things it cannot draw -
 * a `<text>` node simply never becomes an element. That is fine for a curated
 * icon set that has been checked against a renderer, but wrong for a
 * drag-and-drop flow where the user supplies the file: "nothing happened" is
 * indistinguishable from "your logo lost its wordmark".
 *
 * This module is a pure, read-only inspection so it can be used by the UI
 * before conversion and by the test harness as an assertion.
 */

export type SupportSeverity = 'unsupported' | 'approximated';

export interface SvgFeatureWarning {
  severity: SupportSeverity;
  feature: string;
  /** How many times it occurs. */
  count: number;
  detail: string;
}

interface Rule {
  severity: SupportSeverity;
  feature: string;
  detail: string;
  /** CSS selector, or a predicate for things a selector cannot express. */
  selector?: string;
  match?: (doc: Document) => Element[];
}

const RULES: Rule[] = [
  {
    severity: 'unsupported',
    feature: '<text>',
    selector: 'text, tspan, textPath',
    detail: 'Text is not converted. Convert type to outlines before importing.',
  },
  {
    severity: 'unsupported',
    feature: '<image>',
    selector: 'image',
    detail: 'Embedded raster images are dropped; only vector geometry is converted.',
  },
  {
    severity: 'unsupported',
    feature: '<pattern>',
    selector: 'pattern',
    detail: 'Pattern fills are dropped. Excalidraw has no equivalent paint server.',
  },
  {
    severity: 'unsupported',
    feature: 'nested <svg>',
    match: doc => Array.from(doc.querySelectorAll('svg')).slice(1),
    detail: 'A nested <svg> establishes its own viewport, which is not modelled.',
  },
  // NOTE: `objectBoundingBox` units on clip paths and masks used to be listed
  // here. They are now resolved properly - see `localBoundingBox` - so
  // reporting them would be a false alarm. Patterns and gradients can also
  // carry the attribute, but those are reported on their own terms below:
  // patterns are unsupported outright and gradients are flattened to a colour,
  // so in neither case do the units change the outcome.
  {
    severity: 'approximated',
    feature: '<filter>',
    // A filter used solely as the flood-white luminosity-mask idiom is fully
    // handled, so only filters applied to drawable content are reported.
    match: doc =>
      Array.from(doc.querySelectorAll('[filter]')).filter(el => !el.closest('mask')),
    detail: 'Filter effects (blur, shadow, colour matrix) are not applied.',
  },
  {
    severity: 'approximated',
    feature: 'gradient fill',
    selector: 'linearGradient, radialGradient',
    detail: 'Gradients are flattened to a single averaged colour.',
  },
  {
    severity: 'approximated',
    feature: 'stroke-dasharray',
    selector: '[stroke-dasharray]',
    detail: 'Dash patterns are ignored; the stroke is outlined as continuous.',
  },
  {
    severity: 'approximated',
    feature: 'marker',
    selector: '[marker-start], [marker-mid], [marker-end], marker',
    detail: 'Markers (arrowheads, vertex symbols) are not drawn.',
  },
  {
    severity: 'approximated',
    feature: 'skew transform',
    match: doc =>
      Array.from(doc.querySelectorAll('[transform]')).filter(el =>
        /skew[XY]?\s*\(/i.test(el.getAttribute('transform') || '')
      ),
    detail: 'skewX/skewY are ignored when building the transform matrix.',
  },
];

export function collectUnsupportedFeatures(rawSvg: string): SvgFeatureWarning[] {
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(rawSvg, 'image/svg+xml');
  } catch {
    return [{ severity: 'unsupported', feature: 'parse', count: 1, detail: 'File is not parseable SVG.' }];
  }

  if (doc.querySelector('parsererror')) {
    return [{ severity: 'unsupported', feature: 'parse', count: 1, detail: 'File is not well-formed XML.' }];
  }

  const warnings: SvgFeatureWarning[] = [];

  for (const rule of RULES) {
    const hits = rule.match ? rule.match(doc) : Array.from(doc.querySelectorAll(rule.selector!));
    if (hits.length === 0) continue;
    warnings.push({
      severity: rule.severity,
      feature: rule.feature,
      count: hits.length,
      detail: rule.detail,
    });
  }

  return warnings;
}

/** One-line summary suitable for a toast or a console line. */
export function describeWarnings(warnings: SvgFeatureWarning[]): string {
  if (warnings.length === 0) return 'No unsupported features detected.';
  return warnings
    .map(w => `${w.severity === 'unsupported' ? 'dropped' : 'approximated'}: ${w.feature} x${w.count}`)
    .join('; ');
}
