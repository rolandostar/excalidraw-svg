/**
 * The two-column term/consequence table used three times on the methodology
 * page: the list of mistakes the harness caught, and the two halves of the
 * generated support matrix.
 *
 * The only real difference between the three was that the support tables set
 * their term in `<code>` and the traps table did not - which is a typographic
 * choice about whether the term is a literal SVG feature name, so it is a
 * prop rather than three copies of the row markup.
 */
export interface TrapRow {
  key: string;
  term: string;
  detail: string;
}

export function TrapTable({ rows, mono = false }: { rows: TrapRow[]; mono?: boolean }) {
  const Term = mono ? 'code' : 'span';

  return (
    <div className="trap-table">
      {rows.map(row => (
        <div className="trap-row" key={row.key}>
          <Term className="trap-mistake">{row.term}</Term>
          <span className="trap-consequence">{row.detail}</span>
        </div>
      ))}
    </div>
  );
}
