import { NEW_ISSUE_URL, STATS, formatPct } from '../site';

export function MethodologyPage() {
  return (
    <main className="page page-doc">
      <header className="doc-header">
        <p className="doc-eyebrow">Methodology</p>
        <h1 className="doc-title">The harness is the oracle, not your eyes</h1>
        <p className="doc-lede">
          Every conversion is rasterised and pixel-diffed against a real SVG renderer.
          Nothing on this site is a claim we have not measured — including the parts that
          fail.
        </p>
      </header>

      <div className="doc-stats">
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconMeanError)}</span>
          <span className="stat-label">mean shape error, {STATS.iconCount} GCP icons</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconWorstError)}</span>
          <span className="stat-label">worst single icon</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureCount}</span>
          <span className="stat-label">torture cases</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureFailures}</span>
          <span className="stat-label">known failures</span>
        </div>
      </div>

      <section className="doc-section">
        <h2>How the measurement works</h2>
        <p className="doc-body">
          Content for this section arrives with the evidence pipeline: the scoring model,
          the framing trick that stops each side being measured on its own ink box, and
          the regression gate.
        </p>
      </section>

      <section className="doc-section">
        <h2>The torture suite</h2>
        <p className="doc-body">
          A gallery of all {STATS.tortureCount} adversarial cases — source, converted
          output and pixel diff — each captioned with the trap it catches.
        </p>
      </section>

      <section className="doc-section">
        <h2>What is and isn't supported</h2>
        <p className="doc-body">
          Generated from the converter's own feature-detection rules, so this table and
          the code cannot disagree.
        </p>
      </section>

      <section className="doc-cta glass-panel">
        <h2>Got a weird SVG?</h2>
        <p className="doc-body">
          Edge cases are the whole point. If something converts badly, send it in and it
          becomes a permanent regression test.
        </p>
        <a
          className="btn btn-primary"
          href={NEW_ISSUE_URL}
          target="_blank"
          rel="noreferrer noopener"
        >
          Submit an edge case
        </a>
      </section>
    </main>
  );
}
