import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Whether an element has ever come near the viewport.
 *
 * Deliberately sticky. The expensive work behind this flag - converting an SVG
 * and running Excalidraw's exporter - is cached once done, so unmounting a
 * preview that scrolled away would only buy a repaint later at the cost of
 * redoing the work. What matters is never doing it for the ~200 cards the user
 * has not looked at.
 *
 * Falls back to visible when `IntersectionObserver` is missing, so a headless
 * or ancient environment renders everything rather than nothing.
 */
export function useHasBeenVisible(ref: RefObject<Element | null>, rootMargin = '600px'): boolean {
  const [seen, setSeen] = useState(() => typeof IntersectionObserver === 'undefined');

  /*
   * The guard is a ref, not the state value.
   *
   * `seen` used to be listed as a dependency of the effect that sets it, so
   * becoming visible tore down the observer and immediately re-ran the whole
   * effect - constructing a second `IntersectionObserver` purely to hit the
   * early return. Once-only is a fact about this effect, not a value it should
   * be re-subscribed on.
   */
  const done = useRef(seen);

  useEffect(() => {
    if (done.current) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
          done.current = true;
          setSeen(true);
          observer.disconnect();
        }
      },
      // Generous margin so a card is converted before it is scrolled into
      // view; landing on a placeholder is worse than doing the work early.
      { rootMargin }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [ref, rootMargin]);

  return seen;
}
