# excalidraw-svg

Converts SVG artwork into **native Excalidraw elements** — real polygons and
ellipses, not an embedded bitmap — so pasted icons stay editable, restyleable
and resolution-independent.

Ships with 216 Google Cloud Platform icons, but the conversion pipeline is
general: any SVG folder can be run through it.

```
SVG  →  normalise  →  resolve regions  →  Excalidraw elements
                                          (.excalidrawlib / clipboard JSON)
```

## Quick start

```bash
pnpm install
pnpm dev                 # web UI on :3000
pnpm build               # typecheck + production bundle

pnpm test                # score all 216 icons against a real renderer
pnpm test:torture        # score the 25 edge-case SVGs
```

`pnpm test` is not a smoke test. It rasterises every icon, pixel-diffs it
against the source SVG, and **fails on any regression** versus the committed
baseline. Run it before and after every change to conversion code.

## Current fidelity

| suite | files | mean shape error | worst | worst placement | failing |
|---|---|---|---|---|---|
| icons | 216 | **0.000 %** | 0.10 % | 0.200 px | **0** |
| torture | 25 | 3.44 % | 58 % | — | 3 |

213 of 216 icons are at *exactly* 0.00 %. The three non-zero torture files are
lossy by design (flattened gradients, deliberately unsupported features) and
each reports itself rather than failing silently.

## Repository layout

```
src/
  utils/
    excalidrawGenerator.ts   SVG DOM -> Excalidraw elements (the core)
    pathRegions.ts           fill rules, hole resolution, polygon booleans
    strokeOutline.ts         strokes -> filled areas
    svgOptimizer.ts          SVGO + style cascade + <use> expansion
    svgSupport.ts            reports features that cannot be converted
    svgLoader.ts             bundles svg/ into the web UI
    categorizer.ts           icon naming/categorisation (cosmetic)
    defaultOptions.ts        single source of truth for export options
  components/                React UI
scripts/
  run-fidelity.ts            the single test entry point
  excalidrawRenderer.ts      renders via Excalidraw's own exportToSvg
  lib/                       rasterisation, metrics, reporting
tests/
  torture-svg/               25 edge-case SVGs
  baselines/                 committed regression references (icons, torture)
  results/                   generated output — gitignored
svg/                         216 GCP icon sources
docs/
  ARCHITECTURE.md            how conversion works and why
  TESTING.md                 how the harness works and how to extend it
```

## Read this before changing conversion code

Two documents, both short:

- **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** — the pipeline, the
  invariants that must not be broken, and the reasoning behind the
  non-obvious decisions. Several of these look wrong until you know why.
- **[docs/TESTING.md](docs/TESTING.md)** — how the harness measures fidelity,
  how to read a failure, and how to add a suite or a regression test.

The single most important rule: **the harness is the oracle, not your eyes.**
Every defect fixed in this codebase was found by measurement, and several
"obvious" visual improvements turned out to be measurable regressions.

## Known limitations

Detected and reported by `collectUnsupportedFeatures`, never silently dropped:

| feature | behaviour |
|---|---|
| `<text>`, `<tspan>` | not converted — outline type before importing |
| `<image>` | dropped; vector geometry only |
| `<pattern>` | dropped; Excalidraw has no paint server |
| nested `<svg>` | not modelled (own viewport) |
| `<filter>` effects | not applied (the luminosity-mask idiom *is* handled) |
| gradients | flattened to a single averaged colour |
| `stroke-dasharray` | outlined as continuous |
| markers | not drawn |
| `skewX` / `skewY` | ignored in the transform matrix |

Plus one platform constraint worth knowing: Excalidraw renders `line` elements
with **round caps and joins**, and its `strokeWidth` does **not** scale when an
element is resized. Both are why this converter emits strokes as filled areas —
see ARCHITECTURE.
