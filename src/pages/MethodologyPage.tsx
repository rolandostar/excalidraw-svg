import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { NEW_ISSUE_URL, REPO_URL, STATS, formatPct, formatPx } from '../site';
import { listSupportRules } from '../utils/svgSupport';
import { evidenceImageUrl, loadEvidence, type EvidenceCase, type EvidenceManifest } from '../utils/evidence';

/**
 * Failures that exist on purpose.
 *
 * Kept in sync with the table in docs/TESTING.md. These pin documented limits
 * in place; a suite reporting zero failures would mean the thresholds had been
 * loosened or the cases deleted.
 */
const DELIBERATE: Record<string, string> = {
  '20-unsupported-features':
    'Contains one of everything the converter refuses to guess at. The requirement is that each is reported, not that it renders — a low error here would mean something was silently approximated.',
  '17-gradients':
    'Excalidraw has no gradient paint server, so a gradient flattens to one averaged colour. The number measures how much colour the format cannot carry.',
  '15-viewbox-offset':
    'Shape is exact. The placement number is an artefact of measuring a 0.5-unit hairline against a pixel grid, and sits just over the gate rather than loosening the threshold for everything else.',
};

/** From the "traps that were already fallen into" table in docs/ARCHITECTURE.md. */
const TRAPS: { mistake: string; consequence: string }[] = [
  {
    mistake: 'Inferring holes from winding direction',
    consequence: '13 subpaths misclassified across Administration and Agent-Assist',
  },
  {
    mistake: 'Testing containment with bounding boxes',
    consequence: 'Network-Connectivity-Center lost 64.8% of a path',
  },
  {
    mistake: 'Replacing a clipped group with its clip shape',
    consequence: 'Kuberun rendered as a solid blue rectangle — 91.9% error',
  },
  {
    mistake: 'Applying only the nearest ancestor clip',
    consequence: 'Iot-Edge rendered as a large blue rectangle — 82.7% error',
  },
  {
    mistake: 'Dropping the last vertex of every subpath',
    consequence: 'Deleted a real vertex from 19 subpaths',
  },
  {
    mistake: 'Framing each side of the comparison on its own ink box',
    consequence: 'Inflated every real error tenfold',
  },
  {
    mistake: 'Guessing "large radius means ellipse"',
    consequence: 'Turned every pill shape into a full ellipse',
  },
];

function CaseCard({ item }: { item: EvidenceCase }) {
  const deliberate = DELIBERATE[item.id];

  return (
    <figure className={`case-card${item.failing ? ' is-failing' : ''}`}>
      <figcaption className="case-head">
        <span className="case-name">{item.label}</span>
        <span className={`case-score${item.failing ? ' is-failing' : ''}`}>
          {item.shapeScore === null ? 'n/a' : formatPct(item.shapeScore, 2)}
        </span>
      </figcaption>

      {item.image && (
        <img className="case-image" src={evidenceImageUrl(item.image)} alt={`${item.label} comparison`} loading="eager" />
      )}

      {item.trap && <p className="case-trap">{item.trap}</p>}

      <p className="case-meta">
        placement {item.placementErrorPx === null ? 'n/a' : formatPx(item.placementErrorPx)} ·{' '}
        {item.elementCount} element{item.elementCount === 1 ? '' : 's'}
      </p>

      {deliberate && (
        <p className="case-deliberate">
          <AlertTriangle size={13} aria-hidden="true" /> Fails on purpose. {deliberate}
        </p>
      )}
    </figure>
  );
}

export function MethodologyPage() {
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    loadEvidence().then(setManifest, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  }, []);

  const rules = useMemo(() => listSupportRules(), []);
  const unsupported = rules.filter(r => r.severity === 'unsupported');
  const approximated = rules.filter(r => r.severity === 'approximated');

  const torture = manifest?.torture.cases ?? [];
  const sorted = useMemo(
    () => [...torture].sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0)),
    [torture]
  );
  const visible = showAll ? sorted : sorted.slice(0, 6);

  const worstIcons = manifest?.icons.cases.filter(c => c.image) ?? [];

  return (
    <main className="page page-doc">
      <header className="doc-header">
        <p className="doc-eyebrow">Methodology</p>
        <h1 className="doc-title">The harness is the oracle, not your eyes</h1>
        <p className="doc-lede">
          Every conversion is rasterised and pixel-diffed against a real SVG renderer. Nothing
          on this site is a claim we have not measured — including the parts that fail.
        </p>
      </header>

      <div className="doc-stats">
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconMeanError)}</span>
          <span className="stat-label">mean shape error, {STATS.iconCount} GCP icons</span>
        </div>
        <div className="stat">
          <span className="stat-value">{formatPct(STATS.iconWorstError, 2)}</span>
          <span className="stat-label">worst single icon</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureCount}</span>
          <span className="stat-label">adversarial cases</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureFailures}</span>
          <span className="stat-label">deliberate failures</span>
        </div>
      </div>

      <section className="doc-section">
        <h2>How a conversion is scored</h2>
        <p className="doc-body">
          Each SVG is rendered twice: once by <strong>resvg</strong> from the source, and once
          by <strong>Excalidraw's own exporter</strong> from the converted elements. The two
          rasters are diffed with pixelmatch, and the score is mismatched pixels over{' '}
          <em>inked</em> pixels — not canvas area, so a small glyph is not flattered by the
          empty space around it.
        </p>
        <p className="doc-body">
          Both sides are framed on the same window. Cropping each to its own ink box sounds
          reasonable and is the single worst mistake we made: it hides translation error
          completely and inflated every real number tenfold. A transparent sentinel spanning
          the artboard forces the shared frame, and the harness throws if any content escapes
          it rather than silently shifting.
        </p>
        <p className="doc-body">
          A second, purely structural pass catches what pixels cannot: shapes Excalidraw will
          refuse to draw as intended — an unclosed path carrying a fill, a zero-sized ellipse,
          an image referencing a missing file. That runs across every export path, and it is
          the same code that warns you on the convert page.
        </p>
      </section>

      <section className="doc-section">
        <h2>The gate</h2>
        <p className="doc-body">
          Scores are committed as baselines. Any icon exceeding its baseline by more than{' '}
          {formatPct(manifest?.thresholds.regressionSlack ?? 0.001, 1)} fails the build, as does
          any shape error above {formatPct(STATS.shapeThreshold, 0)} or placement error above{' '}
          {formatPx(STATS.placementThresholdPx)}.
        </p>
        <p className="doc-body">
          The gate is verified to actually fail: doctoring one baseline entry produces{' '}
          <code>Kuberun: 0.00% -&gt; 91.89%</code> and a non-zero exit. A gate that cannot fail
          is worse than no gate, so that check is re-run whenever the harness changes.
        </p>
      </section>

      <section className="doc-section">
        <h2>Mistakes this caught</h2>
        <p className="doc-body">
          Every one of these looked correct in review and was found by measurement, not by
          looking at the output.
        </p>
        <div className="trap-table">
          {TRAPS.map(trap => (
            <div className="trap-row" key={trap.mistake}>
              <span className="trap-mistake">{trap.mistake}</span>
              <span className="trap-consequence">{trap.consequence}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="doc-section">
        <h2>The torture suite</h2>
        <p className="doc-body">
          {STATS.tortureCount} SVGs built to break the converter, each isolating one feature.
          They are self-verifying — resvg is the oracle, so no expected output is written by
          hand. Every strip below is <strong>source · Excalidraw · pixel diff</strong>, sorted
          worst first.
        </p>

        {error && (
          <p className="doc-body">
            Could not load the evidence manifest ({error}). Run <code>pnpm evidence</code>.
          </p>
        )}
        {!manifest && !error && <p className="doc-body">Loading measured results…</p>}

        <div className="case-grid">
          {visible.map(item => (
            <CaseCard key={item.id} item={item} />
          ))}
        </div>

        {sorted.length > 6 && (
          <button className="btn btn-secondary" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show worst 6 only' : `Show all ${sorted.length} cases`}
          </button>
        )}
      </section>

      {worstIcons.length > 0 && (
        <section className="doc-section">
          <h2>Every icon that is not perfect</h2>
          <p className="doc-body">
            {STATS.iconCount - worstIcons.length} of {STATS.iconCount} production icons score{' '}
            <em>exactly</em> zero. This is the complete list of the ones that do not — so the
            headline {formatPct(STATS.iconMeanError)} is backed by the actual worst cases
            rather than a sample.
          </p>
          <div className="case-grid">
            {worstIcons.map(item => (
              <CaseCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <section className="doc-section">
        <h2>What is and isn't supported</h2>
        <p className="doc-body">
          Generated from the converter's own detection rules, so this table and the code
          cannot disagree. Anything here is <strong>reported</strong> when you convert a file —
          nothing is dropped silently.
        </p>

        <h3 className="doc-subhead">Not converted</h3>
        <div className="trap-table">
          {unsupported.map(rule => (
            <div className="trap-row" key={rule.feature}>
              <code className="trap-mistake">{rule.feature}</code>
              <span className="trap-consequence">{rule.detail}</span>
            </div>
          ))}
        </div>

        <h3 className="doc-subhead">Approximated</h3>
        <div className="trap-table">
          {approximated.map(rule => (
            <div className="trap-row" key={rule.feature}>
              <code className="trap-mistake">{rule.feature}</code>
              <span className="trap-consequence">{rule.detail}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="doc-cta glass-panel">
        <h2>Got a weird SVG?</h2>
        <p className="doc-body">
          Edge cases are the whole point. Writing the first twenty of these immediately
          surfaced five real bugs. If something converts badly, send it in — accepted reports
          become permanent fixtures, so the same failure cannot come back unnoticed.
        </p>
        <div className="doc-cta-actions">
          <a className="btn btn-primary" href={NEW_ISSUE_URL} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={16} />
            Submit an edge case
          </a>
          <a
            className="btn btn-secondary"
            href={`${REPO_URL}/blob/main/docs/TESTING.md`}
            target="_blank"
            rel="noreferrer noopener"
          >
            Read TESTING.md
          </a>
        </div>
      </section>
    </main>
  );
}
