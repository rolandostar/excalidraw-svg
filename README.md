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

pnpm test                # unit tests over the pure functions, ~3s
pnpm test:fidelity       # score every icon in svg/ against a real renderer
pnpm test:torture        # score the edge-case SVGs
```

`pnpm test:fidelity` covers **every** SVG in `svg/`, not one set — it walks the
directory, so all three sets are scored and all three are baselined. It
rasterises each icon, pixel-diffs it against the source, and fails on any
regression versus the committed baseline. Run it before and after every change
to conversion code.

A file with no baseline entry fails the run too. Adding a set has to be a
deliberate act of accepting its numbers, or a whole set could ship with nothing
checking it.

It fans out across `min(8, cores - 1)` processes and caches the half of each
comparison that cannot change — 261 icons in ~22 s warm, ~44 s cold. Pass
`--jobs=1` for a serial run or `--no-cache` to re-render everything; the
results are identical either way. `--help` lists every flag.

## Current fidelity

| suite | files | mean shape error | worst | worst placement | failing |
|---|---|---|---|---|---|
| icons | 261 | **0.000 %** | 0.10 % | 0.200 px | **0** |
| torture | 30 | 3.06 % | 58 % | — | 4 (expected) |

That is all three sets: 216 legacy-gcp, 26 category-icons, 19 unique-icons.
258 of the 261 are at *exactly* 0.00 %.

`pnpm test` keeps these figures honest — it fails if the corpus on disk, the
baseline and the totals quoted on the website ever disagree.

The four failing torture files fail **by construction** and are meant to stay
that way — they pin documented limits in place so those limits cannot drift
unnoticed. One is a file made entirely of features the converter refuses to
guess at, one measures how much colour a flattened gradient loses, one sits a
fraction over the placement gate on a hairline border, and one is so small that
antialiasing dominates the diff. None is an outstanding bug — each is listed in
`tests/baselines/torture.expected-failures.json` with its reason; see
[Expected failures](../../wiki/Testing#expected-failures).

A suite reporting 0 failing here would mean the thresholds had been loosened or
the cases deleted.

## Repository layout

```
src/
  utils/                     the conversion pipeline, icon-set discovery and
                             the shared option/schema definitions
  components/                React UI
  pages/                     one file per route
  styles/                    CSS, split by area (tokens, layout, pages, ui)
scripts/
  run-fidelity.ts            test entry point
  fidelity/                  the harness: config, corpus, score, pool, gate
  lib/                       rasterisation, metrics, thresholds, reporting
  build-evidence.ts          freezes harness output into public/evidence/
  dev/                       local-only tooling (screenshots)
tests/
  torture-svg/               edge-case SVGs
  baselines/                 committed regression references + expected failures
  results/                   generated output — gitignored
svg/
  legacy-gcp/                216 pre-2026 GCP product marks
    set.json                 name, categories, match rules, search synonyms
  category-icons/            26 category marks (2026 refresh)
  unique-icons/              19 product marks (2026 refresh)
  <your-set>/                any folder here becomes /icons/<your-set>
wiki/                        the GitHub wiki, published by CI
```

## Adding an icon set

Drop a folder of `.svg` files into `svg/`. The folder name becomes the URL, so
`svg/my-set/` is served at `/icons/my-set`, and every file in it becomes an
icon titled from its filename. Nothing has to be registered.

`svg/<folder>/set.json` is optional — add it to name the set, group icons into
categories, declare search aliases, or set the styling it opens with.

Full schema, and how to get a new set gated by the test suite:
[Submit an icon set](../../wiki/Submit-an-icon-set).

## Read this before changing conversion code

Two wiki pages, both short:

- **[Architecture](../../wiki/Architecture)** — the pipeline, the invariants
  that must not be broken, and the reasoning behind the non-obvious decisions.
  Several of these look wrong until you know why.
- **[Testing](../../wiki/Testing)** — how the harness measures fidelity, how to
  read a failure, and how to add a suite or a regression test.

Run the suite before and after, and read the regression list rather than the
mean. More than one change here looked like a clear visual improvement and
measured worse.

## How this was built

AI coding tools helped write parts of this codebase.

That is worth saying plainly, and it is also why the test suite matters more
than usual here. `pnpm test:fidelity` renders all 261 icons twice — once from
the source SVG, once through Excalidraw's own exporter — and compares them
pixel by pixel. It fails the build if anything gets worse. See
[Testing](../../wiki/Testing).

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
see [Architecture](../../wiki/Architecture).

## Deployment

Pushes to `main` build the site and publish it to GitHub Pages via
`.github/workflows/deploy.yml`. Wiki- and markdown-only commits are skipped.

Three things need doing once, by hand:

- **Settings → Pages → Source must be set to "GitHub Actions".** The workflow
  cannot set this itself, and the first deploy fails without it.
- **`public/CNAME` holds the custom domain**, one line, no protocol. It ships
  as `REPLACE-ME.example.com`; set the real domain there and in the
  `<link rel="canonical">` tag in `index.html` before the first deploy. Pages
  reads the file out of the published artifact, so a stale value re-points the
  domain on every deploy.
- **The wiki repository must exist** before `.github/workflows/wiki.yml` can
  push to it. Save any page once in the Wiki tab; the workflow overwrites it
  from `wiki/` on the next push.

`vite/spa-fallback.ts` copies `dist/index.html` to `dist/404.html` at build
time. Pages has no rewrite rule, so that copy is what keeps a hard refresh on
`/methodology` from 404ing.
