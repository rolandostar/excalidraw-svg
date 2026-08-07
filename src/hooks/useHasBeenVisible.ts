import { useEffect, useState, type RefObject } from 'react';

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

  useEffect(() => {
    if (seen) return;

    const node = ref.current;
    if (!node) return;

    const observer = new IntersectionObserver(
      entries => {
        if (entries.some(e => e.isIntersecting)) {
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
  }, [ref, rootMargin, seen]);

  return seen;
}
