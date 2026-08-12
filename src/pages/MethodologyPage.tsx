import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ExternalLink } from 'lucide-react';
import { NEW_ISSUE_URL, WIKI_URL, STATS, formatPct, formatPx } from '../site';
import { TrapTable, type TrapRow } from '../components/TrapTable';
import { plural } from '../utils/plural';
import { listIconSets } from '../utils/iconSets';
import { listSupportRules } from '../utils/svgSupport';
import {
  evidenceImageUrl,
  loadEvidence,
  type EvidenceCase,
  type EvidenceManifest,
} from '../utils/evidence';

/**
 * The strip shown next to the introduction.
 *
 * A torture case with visible strokes reads well at half width and shows the
 * three panels the rest of the page is about. It is a committed artifact of a
 * real run, so it cannot fall out of date on its own.
 */
const HERO_CASE = 'torture/07-stroke-caps-joins.png';

/** How many torture cases are shown before the "show all" button. */
const VISIBLE_CASES = 6;

/**
 * "Mistakes this caught". From the table of the same name in the Architecture
 * wiki page. Each row is a bug that reached review looking correct, so this
 * list only ever grows.
 */
const TRAP_ROWS: TrapRow[] = (
  [
    ['Inferring holes from winding direction', '13 subpaths misclassified across Administration and Agent-Assist'],
    ['Testing containment with bounding boxes', 'Network-Connectivity-Center lost 64.8% of a path'],
    ['Replacing a clipped group with its clip shape', 'Kuberun rendered as a solid blue rectangle — 91.9% error'],
    ['Applying only the nearest ancestor clip', 'Iot-Edge rendered as a large blue rectangle — 82.7% error'],
    ['Dropping the last vertex of every subpath', 'Deleted a real vertex from 19 subpaths'],
    ['Framing each side of the comparison on its own ink box', 'Inflated every real error tenfold'],
    ['Guessing "large radius means ellipse"', 'Turned every pill shape into a full ellipse'],
  ] as const
).map(([mistake, consequence]) => ({ key: mistake, term: mistake, detail: consequence }));

/**
 * One evidence strip: name, score, the source/converted/difference triptych,
 * and the reason if it fails on purpose.
 *
 * Rendered from two different lists - the torture suite and the imperfect
 * icons - which must not be allowed to drift into showing different things.
 */
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

/**
 * "What is and isn't supported".
 *
 * The one section that reads from the converter rather than from a manifest:
 * `listSupportRules()` is the same detection code that warns you on the
 * convert page, so the table cannot disagree with the behaviour.
 */
function SupportSection() {
  const rules = useMemo(() => listSupportRules(), []);
  const rowsFor = (severity: string): TrapRow[] =>
    rules
      .filter(r => r.severity === severity)
      .map(r => ({ key: r.feature, term: r.feature, detail: r.detail }));

  return (
    <section className="doc-section">
      <h2>What is and isn't supported</h2>
      <p className="doc-body">
        This table is generated from the converter's own detection rules, so it cannot
        disagree with the code. Anything listed here is <strong>reported</strong> when you
        convert a file — nothing is dropped silently.
      </p>

      <h3 className="doc-subhead">Not converted</h3>
      <TrapTable rows={rowsFor('unsupported')} mono />

      <h3 className="doc-subhead">Approximated</h3>
      <TrapTable rows={rowsFor('approximated')} mono />
    </section>
  );
}

export function MethodologyPage() {
  const [manifest, setManifest] = useState<EvidenceManifest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  // The suite scores whatever is in svg/, so the headline count and the set
  // count come from the same corpus. `pnpm test` fails if they ever disagree.
  const setCount = useMemo(() => listIconSets().length, []);

  useEffect(() => {
    loadEvidence().then(setManifest, (e: unknown) =>
      setError(e instanceof Error ? e.message : String(e))
    );
  }, []);

  const torture = manifest?.torture.cases ?? [];
  const sorted = useMemo(
    () => [...torture].sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0)),
    [torture]
  );
  const visible = showAll ? sorted : sorted.slice(0, VISIBLE_CASES);

  /*
   * Selected by score, not by whether an image exists. Filtering on `c.image`
   * silently dropped any case the publisher had not produced a strip for, and
   * the heading below calls this list complete.
   */
  const imperfectIcons = useMemo(
    () =>
      [...(manifest?.icons.cases ?? [])]
        .filter(c => (c.shapeScore ?? 0) > 0)
        .sort((a, b) => (b.shapeScore ?? 0) - (a.shapeScore ?? 0)),
    [manifest]
  );

  const regressionSlack = manifest?.thresholds.regressionSlack ?? 0.001;

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
          <span className="stat-label">
            mean shape error, all {STATS.iconCount} icons in {plural(setCount, 'set')}
          </span>
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
          baseline by more than {formatPct(regressionSlack, 1)} fails the build, as does any
          shape error above {formatPct(STATS.shapeThreshold, 0)} or placement error above{' '}
          {formatPx(STATS.placementThresholdPx)}.
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

        {sorted.length > VISIBLE_CASES && (
          <button className="btn btn-secondary" onClick={() => setShowAll(v => !v)}>
            {showAll ? 'Show worst 6 only' : `Show all ${sorted.length} cases`}
          </button>
        )}
      </section>

      {imperfectIcons.length > 0 && (
        <section className="doc-section">
          <h2>Every icon that is not a perfect match</h2>
          <p className="doc-body">
            All {STATS.iconCount} icons across {plural(setCount, 'set')} are checked, and{' '}
            {STATS.iconPerfect} of them come out identical, pixel for pixel. Below is every
            single one that does not — {plural(STATS.iconImperfect, 'icon')}, not a selection.
          </p>
          <p className="doc-body">
            <strong>None of these are broken.</strong> In every case the difference is a few
            pixels along a curved edge, of the kind you would have to zoom right in to find.
            Look at the third panel in each strip: that is the difference, and it is almost
            blank. Five of them differ by a single pixel.
          </p>
          <p className="doc-body">
            The percentage is the share of the icon's ink that differs, which is why the
            numbers look uneven. A thin, sparse icon has less ink to divide by, so the same
            one-pixel difference shows up as a bigger number than it would on a solid one. A
            genuine problem — a missing shape, a wrong fill, a chopped-off corner — lands in
            whole percent. Everything here is a few thousandths of one, against a limit of{' '}
            {formatPct(STATS.shapeThreshold, 0)}.
          </p>
          <div className="case-grid">
            {imperfectIcons.map(item => (
              <CaseCard key={item.id} item={item} />
            ))}
          </div>
        </section>
      )}

      <SupportSection />

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
