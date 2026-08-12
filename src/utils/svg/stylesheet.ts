/**
 * The `<style>` element, reduced to the three properties this converter can
 * act on.
 *
 * Split from `paint.ts` because it is the only part of the cascade that reads
 * the *document* rather than an element: it runs once per file and produces a
 * lookup table everything else consumes. Keeping it apart also keeps
 * `paint.ts` about precedence rather than about regexes.
 *
 * Deliberately not a real CSS parser. Only class selectors are supported,
 * which is what design tools emit; anything else is ignored rather than
 * mis-applied.
 */

/** One `<style>` rule, reduced to the properties this converter models. */
interface CssPaintRule {
  fill?: string;
  stroke?: string;
  opacity?: number;
}

/** Class name (without the leading dot) -> merged declarations. */
export type StyleMap = Record<string, CssPaintRule>;

/** Extracts CSS stylesheet rules from <style> elements inside SVG DOM */
export function parseCssStylesheet(doc: Document): StyleMap {
  const styleMap: StyleMap = {};
  doc.querySelectorAll('style').forEach(styleEl => {
    const text = styleEl.textContent || '';
    const ruleBlocks = text.match(/([^{]+)\{([^}]+)\}/g) || [];
    ruleBlocks.forEach(block => {
      const parts = block.split('{');
      if (parts.length < 2) return;
      const selectors = parts[0].split(',').map(s => s.trim().replace(/^\./, ''));
      const declsStr = parts[1];

      let fill: string | undefined;
      let stroke: string | undefined;
      let opacity: number | undefined;

      const fillMatch = declsStr.match(/fill\s*:\s*([^;}]+)/i);
      if (fillMatch && fillMatch[1].trim() !== 'none') fill = fillMatch[1].trim();

      const strokeMatch = declsStr.match(/stroke\s*:\s*([^;}]+)/i);
      if (strokeMatch && strokeMatch[1].trim() !== 'none') stroke = strokeMatch[1].trim();

      const opacityMatch = declsStr.match(/opacity\s*:\s*([^;}]+)/i);
      if (opacityMatch) opacity = parseFloat(opacityMatch[1]);

      selectors.forEach(sel => {
        if (!styleMap[sel]) styleMap[sel] = {};
        if (fill) styleMap[sel].fill = fill;
        if (stroke) styleMap[sel].stroke = stroke;
        if (opacity !== undefined) styleMap[sel].opacity = opacity;
      });
    });
  });
  return styleMap;
}
