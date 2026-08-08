import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { NEW_ISSUE_URL, WIKI_URL, STATS, formatPct, formatPx } from '../site';
import { listSupportRules } from '../utils/svgSupport';
import { plural } from '../utils/plural';
import { TrapTable, type TrapRow } from '../components/TrapTable';
import { evidenceImageUrl, loadEvidence, type EvidenceCase, type EvidenceManifest } from '../utils/evidence';

/**
 * The strip shown next to the introduction.
 *
 * A torture case with visible strokes reads well at half width and shows the
 * three panels the rest of the page is about. It is a committed artifact of a
 * real run, so it cannot fall out of date on its own.
 */
const HERO_CASE = 'torture/07-stroke-caps-joins.png';

/** From the table of the same name in the Architecture wiki page. */
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

const TRAP_ROWS: TrapRow[] = TRAPS.map(t => ({
  key: t.mistake,
  term: t.mistake,
  detail: t.consequence,
}));

/** A support rule is already term-and-detail; only the key has to be named. */
function supportRows(rules: { feature: string; detail: string }[]): TrapRow[] {
  return rules.map(r => ({ key: r.feature, term: r.feature, detail: r.detail }));
}

function CaseCard({ item }: { item: EvidenceCase }) {
  return (
    <figure className={`case-card${item.failing ? ' is-failing' : ''}`}>
      <figcaption className="case-head">
        <span className="case-name">{item.label}</span>
        <span className={`case-score${item.failing ? ' is-failing' : ''}`}>
          {item.shapeScore === null ? 'n/a' : formatPct(item.shapeScore, 2)}
        </span>
      </figcaption>

      {item.image && (
        <img
          className="case-image"
          src={evidenceImageUrl(item.image)}
          alt={`${item.label}: source, converted and pixel difference`}
          loading="lazy"
        />
      )}

      {item.trap && <p className="case-trap">{item.trap}</p>}

      <p className="case-meta">
        placement {item.placementErrorPx === null ? 'n/a' : formatPx(item.placementErrorPx)} ·{' '}
        {plural(item.elementCount, 'element')}
      </p>

      {/*
        The reason comes from tests/baselines/<suite>.expected-failures.json,
        the same file the test gate reads. The page used to keep its own copy
        of these four explanations.
      */}
      {item.expectedFailureReason && (
        <p className="case-deliberate">
          <AlertTriangle size={13} aria-hidden="true" /> Fails on purpose.{' '}
          {item.expectedFailureReason}
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
      <header className="doc-header doc-header-split">
        <div className="doc-header-text">
          <p className="doc-eyebrow">How it is tested</p>
          <h1 className="doc-title">Every conversion is checked against a real renderer</h1>
          <p className="doc-lede">
            The same SVG is drawn twice — once by a standard SVG renderer, once by Excalidraw
            after conversion — and the two pictures are compared pixel by pixel. The results
            are on this page, including the cases that fail.
          </p>
        </div>

        <figure className="doc-header-figure">
          <img
            src={evidenceImageUrl(HERO_CASE)}
            alt="Three panels side by side: the source SVG, the converted Excalidraw shapes, and the difference between them, which is blank."
            width={976}
            height={320}
            loading="eager"
          />
          <figcaption>source · Excalidraw · difference — a blank third panel is a match</figcaption>
        </figure>
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
          <span className="stat-label">edge cases built to break it</span>
        </div>
        <div className="stat">
          <span className="stat-value">{STATS.tortureFailures}</span>
          <span className="stat-label">that fail on purpose</span>
        </div>
      </div>

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

      <section className="doc-section">
        <h2>What stops a bad change from shipping</h2>
        <p className="doc-body">
          Every score is committed to a baseline file. An icon that gets worse than its
          baseline by more than{' '}
          {formatPct(manifest?.thresholds.regressionSlack ?? 0.001, 1)} fails the build, as
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

      <section className="doc-section">
        <h2>Mistakes this caught</h2>
        <p className="doc-body">
          Each of these looked correct in review. None of them were spotted by looking at the
          output.
        </p>
        <TrapTable rows={TRAP_ROWS} />
      </section>

      <section className="doc-section">
        <h2>The edge-case suite</h2>
        <p className="doc-body">
          {STATS.tortureCount} SVGs built to break the converter, each one isolating a single
          feature. There is no expected output written by hand — resvg decides what correct
          looks like. Every strip below is{' '}
          <strong>source · Excalidraw · difference</strong>, worst first.
        </p>

        {error && (
          <p className="doc-body">
            Could not load the results ({error}). Run <code>pnpm evidence</code>.
          </p>
        )}
        {!manifest && !error && <p className="doc-body">Loading results…</p>}

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
            {STATS.iconCount - worstIcons.length} of {STATS.iconCount} icons score{' '}
            <em>exactly</em> zero. Here is the complete list of the ones that do not, so the
            headline {formatPct(STATS.iconMeanError)} comes with its worst cases attached
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
          This table is generated from the converter's own detection rules, so it cannot
          disagree with the code. Anything listed here is <strong>reported</strong> when you
          convert a file — nothing is dropped silently.
        </p>

        <h3 className="doc-subhead">Not converted</h3>
        <TrapTable rows={supportRows(unsupported)} mono />

        <h3 className="doc-subhead">Approximated</h3>
        <TrapTable rows={supportRows(approximated)} mono />
      </section>

      <section className="doc-cta glass-panel">
        <h2>Got a weird SVG?</h2>
        <p className="doc-body">
          Edge cases are the whole point. Writing the first twenty of these turned up five
          real bugs. If something converts badly, send it in — accepted reports become
          permanent fixtures, so the same failure cannot come back unnoticed.
        </p>
        <div className="doc-cta-actions">
          <a className="btn btn-primary" href={NEW_ISSUE_URL} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={16} />
            Submit an edge case
          </a>
          <a
            className="btn btn-secondary"
            href={`${WIKI_URL}/Testing`}
            target="_blank"
            rel="noreferrer noopener"
          >
            How the tests work
          </a>
        </div>
      </section>
    </main>
  );
}
