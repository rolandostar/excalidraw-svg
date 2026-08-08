# excalidraw-svg

Converts SVG artwork into **native Excalidraw elements** — real polygons and
ellipses, not an embedded bitmap — so pasted icons stay editable, restyleable
and resolution-independent.

Ships with 261 Google Cloud icons across three sets, but the conversion
pipeline is general: any SVG folder can be run through it. Icon sets are just folders —
drop one into `svg/` and it appears on the site at `/icons/<folder-name>`,
no registration step. See [Adding an icon set](#adding-an-icon-set).

```
SVG  →  normalise  →  resolve regions  →  Excalidraw elements
                                          (.excalidrawlib / clipboard JSON)
```

## Quick start

```bash
pnpm install
pnpm dev                 # web UI on :3000
pnpm build               # typecheck + production bundle

pnpm test                # score every icon in svg/ against a real renderer
pnpm test:torture        # score the edge-case SVGs
```

`pnpm test` is not a smoke test. It rasterises every icon, pixel-diffs it
against the source SVG, and **fails on any regression** versus the committed
baseline. Run it before and after every change to conversion code.

It fans out across `min(8, cores - 1)` processes and caches the half of each
comparison that cannot change — 261 icons in ~22 s warm, ~44 s cold. Pass
`--jobs=1` for a serial run or `--no-cache` to re-render everything; the
results are identical either way.

## Current fidelity

| suite | files | mean shape error | worst | worst placement | failing |
|---|---|---|---|---|---|
| icons | 261 | **0.000 %** | 0.10 % | 0.200 px | **0** |
| torture | 29 | 3.16 % | 58 % | — | 4 (deliberate) |

258 of 261 icons are at *exactly* 0.00 %.

The four failing torture files fail **by construction** and are meant to stay
that way — they pin documented limits in place so those limits cannot drift
unnoticed. One is a file made entirely of features the converter refuses to
guess at, one measures how much colour a flattened gradient loses, one sits a
fraction over the placement gate on a hairline border, and one is so small that
antialiasing dominates the diff. None is an outstanding bug; see
[Deliberate failures](docs/TESTING.md#deliberate-failures).

A suite reporting 0 failing here would mean the thresholds had been loosened or
the cases deleted.

## Repository layout

```
src/
  utils/
    excalidrawGenerator.ts   SVG DOM -> Excalidraw elements (the core)
    pathRegions.ts           fill rules, hole resolution, polygon booleans
    strokeOutline.ts         strokes -> filled areas
    svgOptimizer.ts          SVGO + style cascade + <use> expansion
    svgSupport.ts            reports features that cannot be converted
    iconSets.ts              discovers svg/<set>/ folders and their set.json
    categorizer.ts           title casing + the category/synonym match engine
    defaultOptions.ts        single source of truth for export options
  components/                React UI
scripts/
  run-fidelity.ts            the single test entry point
  excalidrawRenderer.ts      renders via Excalidraw's own exportToSvg
  lib/                       rasterisation, metrics, reporting
tests/
  torture-svg/               edge-case SVGs
  baselines/                 committed regression references (icons, torture)
  results/                   generated output — gitignored
svg/
  legacy-gcp/                216 pre-2026 GCP product marks
    set.json                 name, categories, match rules, search synonyms
  category-icons/            26 category marks (2026 refresh)
  unique-icons/              19 product marks (2026 refresh)
  <your-set>/                any folder here becomes /icons/<your-set>
docs/
  ARCHITECTURE.md            how conversion works and why
  TESTING.md                 how the harness works and how to extend it
```

## Adding an icon set

Drop a folder of `.svg` files into `svg/`. That is the whole requirement — the
folder name becomes the URL, each filename becomes an icon title, and the set
shows up in the gallery at `/icons` on the next dev-server tick.

To name and categorise it, add `svg/<folder>/set.json`. Every field is
optional:

```jsonc
{
  "name": "Google Cloud 2026",
  "description": "The refreshed product marks.",
  "accent": "#4285F4",
  "order": 20,                       // lower sorts first in the gallery
  "tags": ["gcp", "google cloud"],   // added to every icon's search tags

  "categories": [                    // filter chips, in display order
    { "id": "compute", "name": "Compute", "color": "#81C995" },
    { "id": "general", "name": "General" }
  ],

  // Ordered and FIRST-WINS, substring-matched against the filename.
  // Anything unmatched falls through to the last category, so list the
  // catch-all bucket last.
  "rules": [
    { "category": "compute", "match": ["run", "gke", "engine"] }
  ],

  // Bidirectional search aliases: any term in a group finds any other.
  "synonyms": [
    ["vpc", "virtual private cloud"]
  ],

  // Per-file corrections, keyed by filename without the extension.
  "overrides": {
    "weird-file-name": { "title": "Cloud Run", "category": "compute" }
  },

  // How the set opens. A patch over the app defaults - state only what
  // differs. Every field of the styling sidebar is available.
  "defaults": {
    // Excalidraw's own font ids: 5 Excalifont, 6 Nunito, 7 Lilita One,
    // 8 Comic Shanns, 9 Liberation Sans. These are not 1-5; ids 1/2/3 are
    // the deprecated Virgil/Helvetica/Cascadia and 4 is permanently unused.
    "labelFontFamily": 5,
    "labelFontSize": 18,
    "labelColor": "#4285f4",
    "iconScale": 1
  },

  // The preset buttons. Each `options` is a patch over `defaults`, so a
  // preset states the two or three things that make it interesting. A
  // "Default" button equal to `defaults` is always added.
  "presets": [
    { "id": "sketch", "label": "Sketch", "hint": "Hand-drawn frame",
      "options": {
        "showCard": true,
        "cardCorners": "square",      // rounded | square
        "cardStrokeWidth": 1,         // 1 thin | 2 bold | 4 extra
        "cardFillStyle": "hachure",   // solid | hachure | cross-hatch
        "cardBgColor": "#4285f4",     // hatching is drawn in this colour,
        "cardRoughness": 2,           //   so it must not be transparent
        "iconRoughness": 1            // separate from the frame's
      } },
    { "id": "bare", "label": "Bare", "hint": "Just the mark",
      "options": { "showLabel": false, "showCard": false } }
  ]
}
```

The frame is described by the properties Excalidraw actually has rather than
by named styles. A previous schema had a single `cardStyle`
(`soft-card`/`sketch-box`/`outline`) that bundled corner radius, stroke weight
and fill together; it made combinations like a rounded hatched card
unreachable, and `outline` silently ignored `cardBgColor` entirely. `cardStyle`
and `roughness` are both rejected with a message naming what replaced them.

Unrecognised keys and out-of-range values in `defaults` and `presets` are
dropped with a console warning rather than merged — a value none of the
sidebar controls can represent would leave the UI unable to show or undo it.
Styling is remembered per set, so each one keeps the look you last gave it.

`svg/legacy-gcp/set.json` is a complete worked example.

Two things to know:

- **Fidelity baselines are keyed `<set>__<filename>`.** A new set has no
  baseline entries, and `pnpm test` will **not** invent them — it scores the
  files, reports them under `NOT GATED`, and leaves them ungated. Review those
  scores, then run `pnpm test:update` to accept them. The gate can only hold a
  limit somebody agreed to.
- **Icons must live in a set folder.** Loose `.svg` files directly under `svg/`
  are ignored, and the dev build logs a warning saying so.

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
