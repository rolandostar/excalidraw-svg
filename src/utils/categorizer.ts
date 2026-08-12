import type { IconCategory, IconCategoryRule } from '../types/icons';

/**
 * Category and search-alias resolution.
 *
 * The matching *engine* only. Rules are declared per set in
 * `svg/<set-id>/set.json`, because a keyword list tuned for Google Cloud
 * filenames produces confident nonsense for any other icon pack.
 *
 * The matcher is first-wins, so the order rules appear in a `set.json` is
 * part of their meaning.
 */

/** The bucket a set gets when it declares no categories of its own. */
export const IMPLICIT_CATEGORY: IconCategory = {
  id: 'general',
  name: 'General',
  description: 'Everything in this set',
};

/**
 * First-wins keyword match against the filename.
 *
 * Order is the set author's to control and is load-bearing: `access` would
 * swallow half of a networking pack if it ran before the networking rule.
 * Anything unmatched falls through to the last declared category, which is why
 * a set should list its catch-all bucket last.
 */
export function categorizeByRules(
  name: string,
  rules: IconCategoryRule[],
  categories: IconCategory[]
): string {
  const lower = name.toLowerCase();

  for (const rule of rules) {
    if (rule.match.some(keyword => lower.includes(keyword.toLowerCase()))) {
      return rule.category;
    }
  }

  return categories[categories.length - 1]?.id ?? IMPLICIT_CATEGORY.id;
}

/** Lowercases and collapses `-`, `_` and `/` to spaces so terms compare alike. */
function normaliseTerm(value: string): string {
  return value.toLowerCase().replace(/[-_/]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Expands a set's synonym groups into extra search tags.
 *
 * Groups are bidirectional on purpose: declaring
 * `["vpc", "virtual private cloud"]` once makes the icon findable by either
 * spelling, without the author having to decide which one is canonical.
 *
 * Matching is whole-word against the normalised filename and title, so `ids`
 * does not fire on `identity` and `api` does not fire on `rapid`.
 */
export function expandSynonyms(haystacks: string[], synonyms: string[][] | undefined): string[] {
  if (!synonyms?.length) return [];

  const padded = ` ${normaliseTerm(haystacks.join(' '))} `;
  const found: string[] = [];

  for (const group of synonyms) {
    const terms = group.map(normaliseTerm).filter(Boolean);
    if (terms.some(term => padded.includes(` ${term} `))) found.push(...terms);
  }

  return found;
}

/**
 * Casings that title-casing gets wrong.
 *
 * Deliberately shared across sets rather than per-manifest: these are industry
 * spellings, not Google's. A set that needs something bespoke uses
 * `overrides.<file>.title` in its `set.json`.
 */
const ACRONYMS: Record<string, string> = {
  ai: 'AI',
  api: 'API',
  apis: 'APIs',
  gcp: 'GCP',
  gke: 'GKE',
  vpc: 'VPC',
  cdn: 'CDN',
  dns: 'DNS',
  nat: 'NAT',
  vpn: 'VPN',
  iam: 'IAM',
  kms: 'KMS',
  ekm: 'EKM',
  hsm: 'HSM',
  ids: 'IDS',
  os: 'OS',
  ip: 'IP',
  tpu: 'TPU',
  gpu: 'GPU',
  nlp: 'NLP',
  'nlp-api': 'NLP API',
  ssd: 'SSD',
  iot: 'IoT',
  automl: 'AutoML',
  bigquery: 'BigQuery',
  dataproc: 'Dataproc',
  dataflow: 'Dataflow',
  firestore: 'Firestore',
  datastore: 'Datastore',
  bigtable: 'Bigtable',
  spanner: 'Spanner',
  pubsub: 'Pub/Sub',
  eventarc: 'Eventarc',
  beyondcorp: 'BeyondCorp',
  dialogflow: 'Dialogflow',
};

/**
 * A run of two or more dashes means a literal dash in the title.
 *
 * Held aside while single dashes become spaces: done in sequence, the second
 * pass turns the ` - ` the first pass produced straight back into a space,
 * which drops the dash from "Cloud Optimization AI - Fleet Routing API".
 */
const DASH_MARK = '\u0000';

export function formatTitle(filename: string): string {
  const cleanStr = filename
    .replace(/-{2,}/g, DASH_MARK)
    .replace(/_/g, ' ')
    .replace(/-/g, ' ')
    .replace(new RegExp(DASH_MARK, 'g'), ' - ');

  return cleanStr
    .split(' ')
    .filter(Boolean)
    .map(word => {
      const lower = word.toLowerCase();
      if (ACRONYMS[lower]) return ACRONYMS[lower];
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ')
    .trim();
}
