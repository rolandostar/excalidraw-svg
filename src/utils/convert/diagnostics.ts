/**
 * Why source shapes produced no output, tallied per reason.
 *
 * Its own module because it is the one part of the conversion pipeline the UI
 * imports directly - `ConversionResult.tsx` renders `DROP_REASON_LABELS` - and
 * dragging the whole converter into a React component's dependency graph for a
 * lookup table is how a 700 kB chunk happens.
 */

/**
 * Why a shape in the source never became an element.
 *
 * The converter used to drop shapes silently, which made every failure look
 * identical from the outside: an empty canvas, or the flat message "No
 * drawable geometry found in that file." Attributing each drop is the
 * difference between a user filing a useful bug and giving up.
 */
export type DropReason =
  | 'no-fill-no-stroke'
  | 'empty-geometry'
  | 'clipped-away'
  | 'degenerate'
  | 'parse-error'
  | 'in-defs';

export interface ShapeDrop {
  reason: DropReason;
  /** Tag name of the source element, e.g. `path`. */
  tag: string;
  count: number;
  detail: string;
}

export interface ConversionDiagnostics {
  drops: ShapeDrop[];
  /** Total source shapes that produced no output. */
  skippedTotal: number;
}

export const DROP_REASON_LABELS: Record<DropReason, string> = {
  'no-fill-no-stroke': 'resolved to no fill and no stroke',
  'empty-geometry': 'had no geometry to draw',
  'clipped-away': 'was clipped or masked away entirely',
  degenerate: 'collapsed to nothing at the output size',
  'parse-error': 'could not be parsed',
  'in-defs': 'is a definition, only drawn where referenced',
};

export function emptyDiagnostics(): ConversionDiagnostics {
  return { drops: [], skippedTotal: 0 };
}

/**
 * Accumulates drops into an optional `ConversionDiagnostics`.
 *
 * The tally is keyed through a `Map`. The previous closure did a linear
 * `drops.find` per drop, which is quadratic in the number of distinct drops -
 * fine for the three or four an icon produces, not fine for a pathological
 * upload where every one of a thousand paths fails with its own parser
 * message.
 *
 * A missing sink is not an error: three of the four callers do not report to a
 * user and pass nothing.
 */
export class DiagnosticsSink {
  private readonly index = new Map<string, ShapeDrop>();

  constructor(private readonly target?: ConversionDiagnostics) {
    for (const drop of target?.drops ?? []) {
      this.index.set(`${drop.reason}\u0000${drop.tag}\u0000${drop.detail}`, drop);
    }
  }

  note(reason: DropReason, tag: string, detail: string = DROP_REASON_LABELS[reason]): void {
    if (!this.target) return;
    this.target.skippedTotal += 1;

    const key = `${reason}\u0000${tag}\u0000${detail}`;
    const existing = this.index.get(key);
    if (existing) {
      existing.count += 1;
      return;
    }

    const drop: ShapeDrop = { reason, tag, count: 1, detail };
    this.index.set(key, drop);
    this.target.drops.push(drop);
  }
}
