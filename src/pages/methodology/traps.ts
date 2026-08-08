import type { TrapRow } from '../../components/TrapTable';

/**
 * Owns the "Mistakes this caught" data.
 *
 * Separate because it is a table of prose, not page logic. Each row is a bug
 * that reached review looking correct, so this list only ever grows and it
 * should be editable without opening a React component.
 */

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

export const TRAP_ROWS: TrapRow[] = TRAPS.map(t => ({
  key: t.mistake,
  term: t.mistake,
  detail: t.consequence,
}));
