/**
 * English pluralisation for counted nouns in UI copy.
 *
 * The literal `${n} item${n === 1 ? '' : 's'}` had been written out eight
 * times across the toolbar, the conversion panel and three pages. Each copy
 * was a fresh chance to get the boundary wrong, and two of them already
 * disagreed about whether the count was included in the string. This owns
 * that one decision: the count is always included, and an irregular plural
 * can be given explicitly rather than forcing a caller back to the ternary.
 */
export function plural(n: number, singular: string, pluralForm?: string): string {
  return `${n} ${n === 1 ? singular : (pluralForm ?? `${singular}s`)}`;
}
