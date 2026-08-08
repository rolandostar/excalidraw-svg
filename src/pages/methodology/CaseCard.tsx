import { AlertTriangle } from 'lucide-react';
import { formatPct, formatPx } from '../../site';
import { plural } from '../../utils/plural';
import { evidenceImageUrl, type EvidenceCase } from '../../utils/evidence';

/**
 * Owns one evidence strip: name, score, the source/converted/difference
 * triptych, and the reason if it fails on purpose.
 *
 * Separate because the page renders it from two different lists - the torture
 * suite and the imperfect icons - and those two lists must not be allowed to
 * drift into showing different things.
 */
export function CaseCard({ item }: { item: EvidenceCase }) {
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
