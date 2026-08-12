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

`pnpm test:fidelity` covers **every** SVG in `svg/`, rasterises each icon,
pixel-diffs it against the source and fails on any regression versus the
committed baseline — including any file that has no baseline entry yet. Run it
before and after every change to conversion code.

261 icons in ~22 s warm. `--help` lists every flag;
[Testing](../../wiki/Testing) explains the caching, the worker pool and how to
read a failure.

## Current fidelity

<!-- claims:start -->

| suite | files | mean shape error | worst | worst placement | failing |
|---|---|---|---|---|---|
| icons | 261 | **0.001 %** | 0.13 % | 0.200 px | **0** |
| torture | 30 | 3.06 % | 58 % | — | 4 of 4 expected |

That is every set: 216 legacy-gcp, 26 category-icons, 19 unique-icons. 253 of the 261 icons are a
pixel-exact match; the rest differ by a few pixels along a curved edge, and all
8 are published in full on the
[methodology page](https://rolandostar.github.io/excalidraw-svg/methodology).

<!-- claims:end -->

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
  convert/                   SVG in, Excalidraw elements out
  library/                   icon sets: discovery, set.json, the build optimiser
  scene/                     styling options, layout, text metrics, scene audit
  components/                React UI
  pages/                     one file per route
  types/                     icons, options, Excalidraw's wire format
  styles/                    CSS, split by area (tokens, layout, pages, ui)
scripts/
  run-fidelity.ts            test entry point
  fidelity/                  the harness: config, corpus, score, pool, report
  lib/                       rasterisation, pixel comparison, claims, env
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
icon titled from its filename. Nothing has to be registered. `set.json` is
optional and names the set, its categories, its search aliases and the styling
it opens with.

Full schema, and how to get a new set gated by the test suite:
[Submit an icon set](../../wiki/Submit-an-icon-set).

## Read this before changing conversion code

[Architecture](../../wiki/Architecture) indexes the invariants and points at
the module stating each one. Several look wrong until you know why.

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

The site lives at **https://rolandostar.github.io/excalidraw-svg/** — a Pages
*project* page, so it is served from a sub-path, not the domain root.

That sub-path is `base` in `vite.config.ts`, and it is named after the
repository. **Rename the repo and it has to change with it**, in four places:
`base`, the `<link rel="canonical">` in `index.html`, `DEPLOY_BASE` in
`scripts/verify-font-strip.ts`, and the methodology link in
`scripts/lib/claims.ts`. Everything in `src/` reads `import.meta.env.BASE_URL`
instead of hard-coding it, so moving to a custom domain or to a user page at
the root is just `base: '/'`.

### While the repository is private

Pages and wikis both need a **public** repository on GitHub's free plan. Until
then the deploy and wiki workflows skip themselves rather than failing on every
push — there is no switch to flip, they start running when the repo goes
public. CI still runs, since Actions works on private repositories.

Nothing else is blocked: `pnpm dev`, `pnpm preview`, the test suites and
`pnpm shoot` all work locally, and the wiki content is readable in `wiki/`.

### When the repository goes public

- **Settings → Pages → Source must be set to "GitHub Actions".** The workflow
  cannot set this itself, and the first deploy fails without it.
- **The wiki repository must exist** before `.github/workflows/wiki.yml` can
  push to it. Save any page once in the Wiki tab; the workflow overwrites it
  from `wiki/` on the next push.
- Hard-refresh a deep link such as `/excalidraw-svg/icons/legacy-gcp` once it
  is live. `vite preview` does its own SPA rewrite, so local testing cannot
  prove that part.

`vite/spa-fallback.ts` copies `dist/index.html` to `dist/404.html` at build
time. Pages has no rewrite rule, so that copy is what keeps a hard refresh on
`/methodology` from 404ing.
