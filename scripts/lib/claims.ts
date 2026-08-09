/**
 * The README's fidelity numbers, rendered from the generated evidence.
 *
 * Two callers, and that is the point. `build-evidence.ts` writes this into the
 * README between its markers; `claims.test.ts` renders it again and asserts
 * the committed README still matches. So the numbers cannot be edited by hand,
 * and forgetting to re-run `pnpm evidence` fails the unit suite rather than
 * surviving review.
 *
 * Only *live* claims belong here - figures that must track the current state
 * of the corpus. Recorded measurements (the simplification sweep, the point
 * distribution) stay hand-written in the wiki: they document why a decision
 * was made, and regenerating them would erase the evidence for it.
 */
import type { EvidenceHeadline } from '../build-evidence';

export const CLAIMS_START = '<!-- claims:start -->';
export const CLAIMS_END = '<!-- claims:end -->';

const pct = (v: number, digits: number) => `${(v * 100).toFixed(digits)} %`;

export function renderClaimsBlock(headline: EvidenceHeadline): string {
  const { icons, torture } = headline;

  const sets = icons.sets.map(s => `${s.count} ${s.id}`).join(', ');

  return [
    CLAIMS_START,
    '',
    '| suite | files | mean shape error | worst | worst placement | failing |',
    '|---|---|---|---|---|---|',
    `| icons | ${icons.total} | **${pct(icons.meanShapeScore, 3)}** | ${pct(icons.worstShapeScore, 2)} | ` +
      `${icons.worstPlacementErrorPx.toFixed(3)} px | **${icons.failing}** |`,
    `| torture | ${torture.total} | ${pct(torture.meanShapeScore, 2)} | ${pct(torture.worstShapeScore, 0)} | ` +
      `— | ${torture.failing} (expected) |`,
    '',
    `That is every set: ${sets}. ${icons.perfect} of the ${icons.total} icons are a`,
    'pixel-exact match; the rest differ by a few pixels along a curved edge, and all',
    `${icons.imperfect} are published in full on the`,
    '[methodology page](https://rolandostar.github.io/excalidraw-svg/methodology).',
    '',
    CLAIMS_END,
  ].join('\n');
}

/** Replaces the marked region in `markdown`. Throws if the markers are gone. */
export function writeClaimsBlock(markdown: string, block: string): string {
  const start = markdown.indexOf(CLAIMS_START);
  const end = markdown.indexOf(CLAIMS_END);

  if (start === -1 || end === -1 || end < start) {
    throw new Error(
      `README is missing the ${CLAIMS_START} / ${CLAIMS_END} markers, so the fidelity ` +
        `numbers cannot be kept current. Put them back around the table.`
    );
  }

  return markdown.slice(0, start) + block + markdown.slice(end + CLAIMS_END.length);
}
