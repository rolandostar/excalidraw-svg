# Architecture

How an SVG becomes Excalidraw elements.

This page is an **index**, not an explanation. The reasoning for each
invariant lives in the docblock of the module that implements it, because that
is the copy that stays true. When this page held its own copy of that
reasoning, four of the mechanisms it described had been renamed or replaced
while every source docblock it was paraphrasing was still correct.

Read the invariant list before changing anything in `src/utils/`. Most of them
look like they could be simplified. They cannot — each is there because of a
real failure, and most have a fixture pinning them in place.

---

## Pipeline

```
raw SVG string
   │
   ├─ optimizeSvgString()                     src/utils/svgOptimizer.ts
   │    SVGO preset-default (no convertStyleToAttrs)
   │    flattenStyleCascade()   attribute < stylesheet < inline style
   │    <use>/<symbol> expansion
   │    gradient flattening -> averaged solid colour
   │    colour normalisation -> #rrggbb
   │
   ├─ parseSvgToExcalidrawElements()          src/utils/convert/parseSvg.ts
   │    viewBox -> target fit (scale + offset), flattening tolerance
   │    per shape:
   │      resolve style (fill, stroke, fill-rule, caps/joins, opacity)
   │      resolve visibility region (clip-path + mask, intersected)
   │      FILL   -> resolveFilledRegions() -> bridgeHoles() -> ring
   │      STROKE -> strokeToRegion()       -> filled area
   │      clip each result, simplify the ring, emit as `line` / `ellipse`
   │
   └─ createExcalidrawItem()                  src/utils/layout/buildItem.ts
        card + label layout, then
        buildExcalidrawLibraryPackage()  -> .excalidrawlib   layout/packGrid.ts
        buildExcalidrawClipboardData()   -> clipboard JSON   layout/packGrid.ts
```

Only the **upload** path runs `optimizeSvgString` at request time. Shipped icon
sets are optimised once at build time by `vite/icon-sets.ts`, so the markup the
site renders and the markup the harness scores are byte-identical.

`DEFAULT_EXCALIDRAW_OPTIONS` (`src/utils/defaultOptions.ts`) is the single
source of truth for export settings; the UI and the harness both read it.

## Source map

| directory | what is in it |
|---|---|
| `src/utils/svg/` | reading an SVG document: matrices, geometry, paint, clipping, viewBox |
| `src/utils/regions/` | ring classification, polygon booleans, hole bridging |
| `src/utils/convert/` | turning that into Excalidraw elements |
| `src/utils/layout/` | arranging elements into items, grids and packages |
| `src/utils/optimize/` | the two large build-time passes; the rest is in `svgOptimizer.ts` |
| `scripts/fidelity/` | the harness: corpus, scoring, worker pool, gate |
| `scripts/lib/` | rasterisation, pixel comparison, thresholds, claims |

## Icon sets

`svg/<set-id>/` is a set; `svg/<set-id>/set.json` optionally names and
categorises it. Nothing is registered anywhere — `vite/icon-sets.ts` reads the
directory, optimises every file and serves the result as `virtual:icon-sets`.
In dev it watches `svg/` explicitly and answers any change with a full reload.

To add one, see [Submit an icon set](Submit-an-icon-set).

---

## Invariants

Each links to the module that implements it and states its docblock.

| # | invariant | where |
|---|---|---|
| 1 | Holes come from the fill rule, never from winding direction. Containment is point-in-polygon, not bounding box. | `regions/fillRule.ts` |
| 2 | Representative points are sampled where the ring is *isolated*, not at its longest edge. | `regions/fillRule.ts` — `representativePoints` |
| 3 | Strokes are emitted as filled areas. Excalidraw's `strokeWidth` is a style property and does not scale with the element. | `strokeOutline.ts` |
| 4 | Stroke outlines are built by *offsetting*, not by unioning per-segment quads. | `strokeOutline.ts` |
| 5 | Holes are bridged with zero-width corridors, each anchored on the **original** outer ring. | `regions/bridge.ts` |
| 6 | Every tolerance is derived from the output scale, never a constant. | `svg/pathFlatten.ts` — `toleranceFor` |
| 7 | `clip-path` and `mask` are real geometry, intersected across nesting. | `svg/clipping.ts` |
| 8 | `objectBoundingBox` units resolve against the referencing element's own box. | `svg/objectBounds.ts` |
| 9 | Fail visible, never fail invisible — an unresolvable clip drops confidence rather than guessing. | `svg/clipping.ts` — `resolveVisibility` |
| 10 | `polygon-clipping` is numerically fragile; the snapping and balanced-merge mitigations are load-bearing. | `regions/boolean.ts` |
| 11 | Output rings are simplified after every boolean, at a tolerance the sweep below fixed. | `convert/simplify.ts`, applied in `convert/emit.ts` |

Two invariants are enforced by the type system rather than by prose:

- Adding a value to any option allow-list in `types/options.ts` fails the build
  at the label table in `components/options/labels.ts` until it is named.
- Every `exportToSvg` call goes through `sceneFrame.exportSceneArgs`, which is
  what makes the 16.6 MB font strip in `vite.config.ts` sound.

### Things measured and rejected

Kept so nobody re-runs them. All figures are the 261-icon library. This section
has no counterpart in the source.

**Merging same-colour shapes to cut element count.** Consecutive same-colour
runs would collapse 1,611 line elements to 993 — 618 absorbed, 35 %. It buys
**no time at all**, only about 20 % of payload, and it costs sub-shape
selection permanently. There is also an untested hazard: at `roughness: 2` the
jitter separates a bridge corridor's doubled edges, and a corridor spanning a
whole icon would show as a sliver where today's short hole-bridges do not.
Rejected.

**Omitting fields that equal Excalidraw's defaults.** Element envelopes are
812 KB of the 1,412 KB payload — more than the points. Dropping the eight
fields `restore` would fill in anyway (`angle`, `strokeStyle`, `frameId`,
`version`, `isDeleted`, `boundElements`, `link`, `locked`) takes the payload to
1,197 KB, −15 %, and the exporter's output is byte-identical without them.
Rejected anyway: it makes the output depend on upstream defaults, so the day
Excalidraw changes one, every element we ever exported changes appearance with
no error anywhere. That is the failure mode invariant 9 exists to prevent.

**Where the export time actually goes.** Not where it looks. Of the ~780 ms
`exportToSvg` takes, Rough.js generation is 96 ms, jsdom DOM construction 36 ms
and serialisation 23 ms. The remaining ~620 ms is inside the exporter building
path strings and setting attributes — work a canvas renderer never does. Do not
use `exportToSvg` timings as a proxy for canvas performance.

---

## Traps that were already fallen into

Do not reintroduce these. Each shipped at some point, and the number beside it
is what the harness reported when it did.

| trap | what happened |
|---|---|
| Inferring holes from winding | `Administration`, `Agent-Assist`, 13 subpaths misclassified |
| Bounding-box containment | Network-Connectivity-Center lost 64.8 % of a path |
| `subpath.slice(0, -1)` unconditionally | `pointsOnPath` only repeats the first point when there is an explicit `Z`; deleted a real vertex from 19 subpaths |
| `Math.abs()` then comparing `> 0` | made a winding test always true — dead code that looked live |
| Substring tests on path data | `d.includes('24')` matches the coordinate `3.244` |
| Replacing a clipped group with the clip shape | `Kuberun` rendered as a solid blue rectangle (91.9 % error) |
| Nearest-ancestor clip only | `Iot-Edge` rendered as a large blue rectangle (82.7 % error) |
| Framing each side on its own ink box | round caps enlarge Excalidraw's ink box, shrinking the whole drawing and lighting up every edge — inflated real errors 10× |
| Fabricating a stroke from a rect's fill | inflated every filled rect by a stroke width once strokes scaled correctly |
| Guessing "big radius ⇒ ellipse" | turned every pill (`5×2 rx=1`) into a full ellipse |
| Applying CSS only when the attribute is absent | inverted the cascade; an inherited `fill` beat the element's own class |
| Quotes-only character class in `url(#id)` | captured `grad)`; every uploaded gradient reached Excalidraw as an unparseable colour |
| Comparing option colours with `===` across casings | a `set.json` declaring `#4285F4` matched no preset and no swatch |

---

## Excalidraw output notes

Behaviour of Excalidraw's own code that this converter depends on. Each is
stated where it is relied upon; this is the list of *which* modules to read.

| what | where it matters |
|---|---|
| A `line` is only filled when `isPathALoop(points)` — first/last gap ≤ `LINE_CONFIRM_THRESHOLD` (8) | `defaultOptions.ts`, checked in `sceneAudit.ts` |
| `polygon: true` is an editor flag, not a rendering one; `restore` clears it unless `isValidPolygon` | `types/excalidraw.ts` |
| Pasted text is never re-measured, so the declared width is permanent | `textMetrics.ts` |
| `lineHeight` must be byte-identical to `FONT_METADATA`, or text sits off-centre in its own box | `textMetrics.ts` — `lineHeightFor` |
| Font ids are 5–9; 4 is permanently unused and falls back to the emoji font | `types/options.ts` |
| `getCornerRadius` returns `shorterSide * 0.25` below 128 units for both radius modes | `types/options.ts` |
| Rough.js hatches the *fill*, so a hatch over a transparent background draws nothing | `defaultOptions.ts` — `normaliseOptions` |
| `exportToSvg` always crops to the scene bounding box and bakes the offset in | `sceneFrame.ts` — `withFrame` |
| `.excalidrawlib` v2 carries `files` in both places, because builds have looked in either | `layout/packGrid.ts` |

## Known gaps

Beyond the reported-unsupported list in the
[README](../../blob/main/README.md#known-limitations):

- **Rotated ellipses lose their angle.** `angle` is always 0; radii come from
  `hypot` of the matrix columns. No icon in the corpus is affected.
- **Group opacity is applied per shape.** Compositing a group as a unit differs
  where its members overlap each other; per-shape is the closest Excalidraw can
  express.
- **Label kerning is not modelled.** `textMetrics.measureLabel` sums per-glyph
  `hmtx` advances, so a kerned pair measures a fraction of a unit wide. It
  mis-sizes the card, never the text's position on it.
- **`measureExcalidrawItem` measures the nominal artwork box.** Deliberate, and
  an upper bound rather than an approximation: the converter fits a viewBox
  with `Math.min` of the two axis ratios and centres it, so ink can never
  exceed the nominal box. Keeping it conversion-free is what lets a grid layout
  be computed from titles and options alone. Cost is slightly wider gutters
  around icons that do not fill their viewBox.

---

Next: [Testing](Testing) for how any of this gets verified.
