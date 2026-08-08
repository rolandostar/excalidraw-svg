import { useMemo } from 'react';
import { listSupportRules } from '../../utils/svgSupport';
import { TrapTable, type TrapRow } from '../../components/TrapTable';

/**
 * Owns the "What is and isn't supported" tables.
 *
 * Separate because it is the one section that reads from the converter rather
 * than from a manifest: `listSupportRules()` is the same detection code that
 * warns you on the convert page, so the table cannot disagree with the
 * behaviour. Keeping that import here rather than in the page makes the link
 * obvious.
 */

/** A support rule is already term-and-detail; only the key has to be named. */
function supportRows(rules: { feature: string; detail: string }[]): TrapRow[] {
  return rules.map(r => ({ key: r.feature, term: r.feature, detail: r.detail }));
}

export function SupportSection() {
  const rules = useMemo(() => listSupportRules(), []);
  const unsupported = rules.filter(r => r.severity === 'unsupported');
  const approximated = rules.filter(r => r.severity === 'approximated');

  return (
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
  );
}
