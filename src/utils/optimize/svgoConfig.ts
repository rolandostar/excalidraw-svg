import { optimize, Config } from 'svgo/browser';

/**
 * Owns the SVGO invocation and, more importantly, the four plugin overrides
 * and the one deliberate omission that make it safe to run before our own
 * passes.
 *
 * Separate so those choices sit next to the config literal rather than
 * scrolling past inside a 120-line procedure. Every one of them is load-
 * bearing: turn any of them back on and a later pass loses information it
 * cannot recover.
 */

/**
 * Runs SVGO on raw SVG string to optimize path commands, remove metadata, doctypes, comments, etc.
 */
export function optimizeSvgWithSvgo(rawSvg: string, customConfig?: Config): string {
  if (!rawSvg || !rawSvg.trim()) return rawSvg;

  try {
    const config: Config = customConfig || {
      multipass: true,
      plugins: [
        {
          name: 'preset-default',
          params: {
            overrides: {
              cleanupIds: false,
              convertPathData: false,
              removeUselessStrokeAndFill: false,
              removeUnknownsAndDefaults: false,
            },
          },
        },
        // NOTE: `convertStyleToAttrs` is deliberately NOT enabled. It collapses
        // `style="fill:red"` into `fill="red"`, which erases the difference
        // between an inline style (highest priority in the CSS cascade) and a
        // presentation attribute (lowest). `flattenStyleCascade` below needs
        // that distinction to resolve stylesheet rules correctly.
        'removeDimensions',
      ],
    };

    const result = optimize(rawSvg, config);
    return result.data || rawSvg;
  } catch (err) {
    console.warn('SVGO optimization error:', err);
    return rawSvg;
  }
}
