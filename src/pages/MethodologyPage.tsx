import { useEffect, useMemo, useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { NEW_ISSUE_URL, WIKI_URL, STATS, formatPct } from '../site';
import { TrapTable } from '../components/TrapTable';
import { plural } from '../utils/plural';
import { listIconSets } from '../utils/iconSets';
import { evidenceImageUrl, loadEvidence, type EvidenceManifest } from '../utils/evidence';
import { CaseCard } from './methodology/CaseCard';
import { ScoringSection, ShippingGateSection } from './methodology/ScoringSection';
import { SupportSection } from './methodology/SupportSection';
import { TRAP_ROWS } from './methodology/traps';

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

      <ScoringSection />
      <ShippingGateSection regressionSlack={manifest?.thresholds.regressionSlack ?? 0.001} />

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
