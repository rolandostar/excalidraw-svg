import confetti from 'canvas-confetti';

/**
 * The one confetti burst, in the one set of brand colours.
 *
 * `IconCard` inlined its own `confetti({...})` call with a two-colour literal
 * array while `IconsToolbar` kept a four-colour `GCP_COLORS` constant and a
 * local `celebrate` helper, so the same gesture threw different colours
 * depending on whether one icon or a selection was copied.
 *
 * Also the one place that honours `prefers-reduced-motion`. Confetti is pure
 * motion with no informational content, so a user who has asked for less of it
 * gets none: the toast still fires, which is what actually reports the result.
 */
const GCP_COLORS = ['#4285F4', '#34A853', '#FBBC05', '#EA4335'];

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function celebrate(particleCount = 60): void {
  if (prefersReducedMotion()) return;
  confetti({ particleCount, spread: 65, origin: { y: 0.15 }, colors: GCP_COLORS });
}
