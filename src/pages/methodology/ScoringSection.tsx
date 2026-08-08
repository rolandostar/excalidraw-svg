import { STATS, formatPct, formatPx } from '../../site';

/**
 * Owns the two prose sections that explain the measurement itself: how a
 * single conversion is scored, and what turns a worse score into a failed
 * build.
 *
 * Separate because it is static copy with only one live number in it. Keeping
 * it out of the page leaves the page as state and composition, and makes a
 * copy edit a one-file change.
 */

export function ScoringSection() {
  return (
    <section className="doc-section">
      <h2>How a conversion is scored</h2>
      <p className="doc-body">
        Each SVG is rendered by <strong>resvg</strong> from the source, and again by{' '}
        <strong>Excalidraw's own exporter</strong> from the converted elements. The two
        images go through pixelmatch, and the score is mismatched pixels divided by{' '}
        <em>inked</em> pixels — not canvas area, so a small glyph does not get flattered by
        the empty space around it.
      </p>
      <p className="doc-body">
        Both sides are framed on the same window. Cropping each one to its own ink box
        sounds reasonable and was the worst mistake in this project: it hides translation
        error completely, and it made every real number look ten times better than it was.
        A transparent marker spanning the artboard forces the shared frame, and the run
        stops if any content escapes it.
      </p>
      <p className="doc-body">
        A second pass catches what pixels cannot: shapes Excalidraw will refuse to draw as
        intended — an unclosed path carrying a fill, a zero-sized ellipse, an image pointing
        at a missing file. It runs on every export path, and it is the same code that warns
        you on the convert page.
      </p>
    </section>
  );
}

/** `regressionSlack` comes from the evidence manifest, so it cannot drift from the gate. */
export function ShippingGateSection({ regressionSlack }: { regressionSlack: number }) {
  return (
    <section className="doc-section">
      <h2>What stops a bad change from shipping</h2>
      <p className="doc-body">
        Every score is committed to a baseline file. An icon that gets worse than its
        baseline by more than{' '}
        {formatPct(regressionSlack, 1)} fails the build, as
        does any shape error above {formatPct(STATS.shapeThreshold, 0)} or placement error
        above {formatPx(STATS.placementThresholdPx)}.
      </p>
      <p className="doc-body">
        The check is verified to actually fail. Editing one baseline entry by hand produces{' '}
        <code>Kuberun: 0.00% -&gt; 91.89%</code> and a non-zero exit code. A check that
        cannot fail is worse than none, so that test is repeated whenever the harness
        changes.
      </p>
    </section>
  );
}
