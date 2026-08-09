# Architecture

How an SVG becomes Excalidraw elements, and why the non-obvious parts are the
way they are.

Read the **Invariants** section before you change anything in `src/utils/`.
Most of them look like they could be simplified. They cannot — each one is
there because of a real failure, and most have a fixture pinning them in place.

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
   │    colour normalisation -> #RRGGBB
   │
   ├─ parseSvgToExcalidrawElements()          src/utils/excalidrawGenerator.ts
   │    viewBox -> target fit (scale + offset), flattening tolerance
   │    per shape:
   │      resolve style (fill, stroke, fill-rule, caps/joins, opacity)
   │      resolve visibility region (clip-path + mask, intersected)
   │      FILL   -> resolveFilledRegions() -> bridgeHoles() -> ring
   │      STROKE -> strokeToRegion()       -> filled area
   │      clip each result, simplify the ring, emit as `line` / `ellipse`
   │
   └─ createExcalidrawItem()                  src/utils/excalidrawGenerator.ts
        card + label layout, then
        buildExcalidrawLibraryPackage()  -> .excalidrawlib
        buildExcalidrawClipboardData()   -> clipboard JSON
```

`DEFAULT_EXCALIDRAW_OPTIONS` (`src/utils/defaultOptions.ts`) is the single
source of truth for export settings; the UI and the harness both read it.

## Icon sets

`svg/<set-id>/` is a set; `svg/<set-id>/set.json` optionally names and
categorises it. `src/utils/iconSets.ts` discovers both with `import.meta.glob`,
so a folder dropped into `svg/` needs no registration anywhere — Vite watches
the glob patterns and invalidates the module when the match list changes.

If you want to add one, see [Submit an icon set](Submit-an-icon-set).

Two properties of that module are load-bearing:

- **The optimiser runs at build time, not in the browser.** `vite/icon-sets.ts`
  globs `svg/`, runs `optimizeSvgString` in Node and exposes the result as
  `virtual:icon-sets`. Opening a set used to run SVGO over every file in it
  before the grid could paint, and shipping SVGO to do that cost 187 KB gzip —
  roughly half the main chunk — to process files that were already in the repo.
  The converter page, which handles files the build has never seen, does not
  use the optimiser at all, so nothing in the client needs it. Both the plugin
  and the fidelity harness call the same `optimizeSvgString`, and the output is
  byte-identical for all 261 icons.
- **Category rules live in the manifest, not in code.** `categorizer.ts` keeps
  only the matching engine and `formatTitle`. The GCP keyword lists moved
  verbatim into `svg/legacy-gcp/set.json`, order preserved — the matcher is
  first-wins, so reordering or merging the lists silently reclassifies icons.
  There is a check for this: the six-bucket distribution is 51/40/35/34/29/27.

Sets also declare how they open (`defaults`) and their preset buttons
(`presets`), both as patches so an author states only what differs. Two
consequences worth knowing:

- **Styling state is per set.** A single shared key would mean whichever set
  you opened first won, and no other set's declared defaults could ever apply.
- **Manifest option patches are validated, not trusted.** `set.json` is
  hand-authored and untypechecked, so `optionsSchema.ts` drops unknown keys and
  out-of-range values with a warning. Silently accepting `labelFontFamily: 9`
  would put the UI in a state none of its controls can represent or undo.

Search aliases are declared as bidirectional `synonyms` groups and expanded
into each icon's tag list at load time, which is why `vpc` and
`virtual private cloud` find the same icon without either being canonical.

## The icon grid converts lazily

A set is up to 216 cards; a viewport holds about twenty. `IconCard` converts
its SVG and runs Excalidraw's exporter only once `useHasBeenVisible` says the
card has come within 600px of the viewport, and the flag is sticky because the
result is cached and unmounting would only mean redoing the work later. The
card's box is sized from `previewPx` rather than from its contents, so
deferring the artwork cannot move the layout or make the observer oscillate.

Opening a set went from 216 exports to 35.

---

## Invariants

### 1. Holes come from the fill rule, never from winding direction

`pathRegions.resolveFilledRegions()` classifies every subpath by evaluating the
element's **declared fill rule** (`nonzero` by default, `evenodd` when set) at a
representative point inside that ring.

It is tempting to infer "nested ring with opposite winding = hole". That is
wrong for both rules — an author may wind every subpath the same way and rely
on `evenodd`, and `nonzero` fills a nested same-wound ring solid.
`tests/torture-svg/01` and `02` are identical geometry under the two rules and
must render differently; any winding heuristic fails one of them.

Containment is **point-in-polygon**, not bounding box. Two disjoint shapes can
easily have nested bounding boxes (`torture/05`); punching one out of the other
deletes real artwork.

### 2. Representative points must be sampled where the ring is *isolated*

`representativePoints()` picks the edge with the best clearance from every
other ring, not simply the longest edge.

`Security.svg` shares a vertical segment between its outer ring and its hole,
and that shared segment is also the outer ring's longest edge. Sampling next to
it lands inside the hole, the winding sums to zero, and the entire shape is
classified as empty. This cost a full debugging cycle; do not "simplify" it back
to a centroid or a longest-edge sample.

### 3. Strokes are emitted as filled areas, not as Excalidraw strokes

`strokeOutline.strokeToRegion()` converts every stroke into the region it
covers. Two independent reasons:

- **Excalidraw's `strokeWidth` does not scale with the element.** It is a style
  property, so resizing a stroked icon on the canvas leaves the stroke at its
  original thickness while the geometry grows. The artwork would only be
  correct at the exact size it was generated for.
- **Excalidraw hardcodes round caps and joins** for `line` elements. SVG
  defaults to butt caps and miter joins, so every flat end and square corner
  came out rounded.

Consequence: emitted elements have `strokeColor: 'transparent'` and carry their
colour in `backgroundColor`. If you see code reading `element.strokeWidth` for
vector output, it is vestigial.

### 4. Stroke outlines are built by *offsetting*, not by unioning per-segment quads

The obvious construction — one quad per segment plus a join wedge, all unioned —
is correct in principle and catastrophic in practice on curves. A flattened arc
has dozens of segments; the quads cross on the inside of every turn, and the
boolean engine faithfully reports each crossing as a hole of ~5e-8 square
units. Those holes are invisible, but *bridging* them (see §5) costs one
zero-width corridor each, and the corridors rasterise as radial hairlines
across the stroke.

`offsetSide()` produces one clean ring per side instead. Each ring is then
self-normalised, because an offset self-intersects on the inside of a sharp
turn and a self-crossing ring renders with the crossed lobe punched out.

For a **closed** stroke the result is an annulus built as
`difference(outerRing, innerRing)`. Which sign offsets outward depends on the
ring's winding, which the source controls — so the two are chosen **by area**.
Assuming a direction silently produced an empty difference and dropped the
whole stroke for clockwise rings.

### 5. Holes are bridged with zero-width corridors

An Excalidraw `line` has a single point list, so a hole can only be expressed by
walking into it and back out along a coincident pair of edges.

The corridor disappears two ways, and the ring is built to satisfy both. Under
`evenodd` the doubled edges cancel regardless of direction. Under `nonzero` they
only cancel when the hole winds *against* its outer ring, so `bridgeHoles()`
reverses any hole that does not. Excalidraw uses `evenodd` everywhere (see
[Excalidraw output notes](#excalidraw-output-notes)), so only the first rule is
ever exercised — the second is there because a `.excalidrawlib` is a public
format and we do not control what opens one.

`bridgeHoles()` anchors every corridor on a vertex of the **original** outer
ring. Stitching into an accumulating ring lets the second hole attach to the
first hole's boundary and drive its corridor through the first hole's interior.

> Excalidraw's own bucket-fill tool, added in August 2026
> ([`792ea3a`](https://github.com/excalidraw/excalidraw/commit/792ea3a06c60079229f36819d8695af7d563832a)),
> arrived at the same technique independently — it calls the corridors
> "keyhole bridges" and reverses hole winding for the same stated reason. If
> you are wondering whether this is still the way to do it: upstream thinks so,
> and they have no compound-path support to offer instead.

`regionToBridgedRings()` drops holes below `MIN_VISIBLE_HOLE_AREA_PX` (0.02
square output pixels) rather than bridging them — see §4 for why.

### 6. Everything geometric is size-aware

`flattenTolerance = CURVE_TOLERANCE_USER_UNITS_AT_1X / scale` so curve error is
constant in **output pixels** regardless of `iconScale`. The same value drives
`arcSegments()` for rounded corners and circles, and round cap/join
tessellation.

The old constant tolerance plus a Ramer–Douglas–Peucker pass at 0.2 user units
(0.8 % of a 24-unit artboard) visibly polygonised every circle and got twice as
bad each time the icon was scaled up.

There *is* an RDP pass again, but at the other end of the pipeline and for a
different reason — see §11.

### 11. Output rings are simplified, after every boolean

`simplifyClosedRing()` runs in `emit.ts`, on finished rings only. This is
deliberately **not** the flattening tolerance of §6: that one feeds
`polygon-clipping` (fragile on near-collinear input, §10) and gates stroke join
wedges, so it changes topology decisions. This one only removes points from a
ring whose shape is already decided, so it cannot.

`OUTPUT_SIMPLIFY_TOLERANCE_PX = 0.05`, divided by the fit scale so the error
stays constant in pixels. Picked by sweeping the corpus through the harness:

| tolerance | points | payload | generation | worst error |
|---|---|---|---|---|
| off | 86,926 | 1922 KB | ~1230 ms | 0.10 % |
| 0.02 | 63,795 | 1630 KB | ~1215 ms | 0.10 % |
| **0.05** | **46,477** | **1412 KB** | **~780 ms** | **0.13 %** |
| 0.10 | 34,150 | 1257 KB | ~637 ms | 0.15 % |
| 0.20 | 27,020 | 1167 KB | ~587 ms | 0.37 % |

Two things that sweep settled, worth not re-deriving:

- **A point cap would do nothing.** No production element exceeds 1,536 points
  (Excalidraw's own bucket-fill budget), and only 30 % of points live in
  elements above 192. The cost is spread, not in a tail.
- **Roughly half the generation cost is per-element, not per-point.** Time
  floors at ~587 ms however far the points are cut, against 1,764 elements.
  Cutting element count would mean merging same-colour shapes within an icon,
  which would destroy editability — users select parts of an icon. Not worth it.

There is no user-facing control for this and there should not be. The
difference between 0.05 and no simplification is 0.03 percentage points of
shape error against a 2 % gate, invisible in the render. `iconScale` already
varies point density, because both tolerances divide by the fit scale.

Three invariants the emitter depends on, all enforced in `simplifyClosedRing`:
never fewer than 4 points (`isValidPolygon`, which our `polygon: true` claims),
first point still exactly equal to last (`isPathALoop`, which is what makes
Excalidraw fill at all), and a zero tolerance is an identity function.

### 7. `clip-path` and `mask` are real geometry, intersected across nesting

`getVisibilityRegion()` walks **all** ancestors, not just the nearest, and
intersects every region it finds. A shape inside
`<g clip-path="A"><g mask="B">` is visible only where A and B overlap.

Masks are modelled as binary: children painted in document order, a light shape
adding to the visible region and a dark shape subtracting. A true mask
multiplies alpha by luminance per pixel, which has no vector equivalent, but
every mask design tools emit is effectively binary.

One idiom needs special handling — Illustrator's **luminosity mask**: a child
carrying a filter whose first primitive is `feFlood flood-color="#fff"`. That
floods the filter region white *behind* the shape, so a plain black circle means
"reveal everything except this circle" rather than "reveal nothing".

### 8. `objectBoundingBox` units, and the defaults that bite

Coordinates in these units are fractions of the referencing element's
**geometry** bbox (`localBoundingBox()` — stroke and markers excluded, per
spec). Watch the defaults, which are not uniform:

| attribute | default |
|---|---|
| `clipPathUnits` | `userSpaceOnUse` |
| `maskContentUnits` | `userSpaceOnUse` |
| `maskUnits` | **`objectBoundingBox`** (−10 % / 120 %) |
| `filterUnits` | **`objectBoundingBox`** (−10 % / 120 %) |

A filter region is relative to the element the **filter** is applied to, in
*that* element's user space — not to the element referencing the mask.

`localBoundingBox()` skips non-rendered containers *inside* the node but not
ones the node itself lives in; a mask child legitimately has a bounding box.

### 9. Fail visible, never fail invisible

An empty clip/mask region means "paints nothing" — but only when every
construct involved was understood. `getVisibilityRegion()` returns a
`confident` flag, and `resolveVisibility()` keeps the shape **unclipped** when
an unconfident chain produces an empty region (dangling id, degenerate box).

Over-drawing is visible and recoverable. Silent deletion is neither.

### 10. `polygon-clipping` is numerically fragile — mitigations are load-bearing

It throws `Unable to find segment #N in SweepLine tree` on almost-coincident or
almost-collinear vertices, which is exactly what flattened curves produce.
Three mitigations, all in `pathRegions.ts`:

- `snapPoint()` quantises to 1e-7 of a user unit, collapsing near-duplicates
  into exact ones.
- `robustUnion()` degrades gracefully: on failure it splits into a balanced
  merge so each sweep is smaller, and a failure at one node costs only that
  subtree's simplification — the geometry is still all there.
- Join wedges narrower than the flattening tolerance are skipped entirely
  (`strokeOutline.ts`), which removes the largest source of degenerate input.

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

---

## Excalidraw output notes

Verified against Excalidraw `master` in August 2026. Worth re-checking after a
major upgrade, but these have all held since 2023.

- **A `line` is filled when `isPathALoop(points)` holds** — first and last point
  within `LINE_CONFIRM_THRESHOLD` (8), and at least 3 points.
  `generateRoughOptions` in `packages/element/src/shape.ts` reads nothing else.
  In particular it does **not** read `element.polygon`; see below.
- **`fill-rule: evenodd` is used at all three layers.** Rough.js canvas and SVG
  renderers both pick `evenodd` for `polygon` and `curve` shapes, and
  Excalidraw's SVG export sets the attribute explicitly in
  `renderer/staticSvgScene.ts` — also gated on `isPathALoop`. Hachure fills go
  through scanline parity, which behaves the same. This is what §5 relies on.
- **`polygon: true` is an editor flag, not a rendering one.** Added May 2025. It
  drives the line editor's polygon toggle and lets the bucket-fill tool
  recognise existing paint as restylable. `restore` resets it to `false` unless
  `isValidPolygon(points)` holds, which is stricter than `isPathALoop`: more
  than 3 points, and first equal to last within `1e-4` per axis. We set it, and
  guard on the stricter rule.
- **There is no point-count limit** in the renderer or in `restore`. Excalidraw's
  own bucket fill caps generated polygons at 1536 points, but that is its own
  budget, not a platform limit. High counts cost render time, not correctness.
- **`restore` deletes any linear element over 75,000 px** on either axis
  (`MAX_LINEAR_PX`), replacing it with a deleted stub. Unreachable here — icons
  fit a 48 px target and uploads are capped at `MAX_DIMENSION` (1200) — but it
  is the kind of silent destruction worth knowing about.
- `roundness: null` on every emitted `line` — otherwise Excalidraw curves the
  point list.
- `roughness: 0` makes Rough.js deterministic, so `seed` and `versionNonce` do
  not affect rendering. They still change per run, which is why nothing in
  `tests/results/` is committed or compared byte-for-byte; the gate compares
  scores, not files.
- Element `index` values (`a0`/`a1`/`a2`) are placeholders. Excalidraw
  regenerates fractional indices from array order on restore, so paint order
  follows array order — preserve it.
- `.excalidrawlib` carries `files` both per-item and top-level; the v2 schema
  is not explicit about where they belong.
- **`fontFamily` is a raw Excalidraw id**, not a local enum: Virgil 1,
  Helvetica 2, Cascadia 3, **4 permanently unused**, Excalifont 5, Nunito 6,
  Lilita One 7, Comic Shanns 8, Liberation Sans 9. `getFontFamilyString`
  returns the Windows emoji fallback for anything it cannot match, which is a
  silent wrong-font rather than an error. An earlier local enum numbered these
  1–5, so "Lilita One" (its 4) rendered as emoji fallback and "Nunito" (its 5)
  rendered as Excalifont.
- **`lineHeight` must be the font's own.** Absent, `restoreElement` back-solves
  one from the supplied height via `detectLineHeight`, which disagrees with the
  real font for everything but Excalifont. Values live in
  `fontMetrics.generated.ts`, copied from Excalidraw's `FONT_METADATA`.
- **A hatched `fillStyle` paints in `backgroundColor`.** `hachure`,
  `cross-hatch` and `zigzag` over a transparent background render nothing at
  all. `normaliseOptions` repairs the pairing and `auditSceneFidelity` reports
  it as `invisible-fill`.
- **Excalidraw does not re-measure pasted text.** `restoreElements` only calls
  `refreshTextDimensions` when `refreshDimensions` is passed, and the paste
  path does not. The `width`/`height` written onto a text element are final,
  which is why `textMetrics.ts` exists.

## Known gaps

Beyond the reported-unsupported list in the
[README](../../blob/main/README.md#known-limitations):

- **Rotated ellipses lose their angle.** `angle` is always 0; radii come from
  `hypot` of the matrix columns. No icon in the corpus is affected.
- **Group opacity is applied per shape.** Compositing a group as a unit differs
  where its members overlap each other; per-shape is the closest Excalidraw can
  express.
- **Label kerning is not modelled.** `textMetrics.measureLabel` sums per-glyph
  `hmtx` advances, so a kerned pair measures a fraction of a unit wide. Harmless
  where it lands: labels are emitted `textAlign: 'center'`, so Excalidraw
  centres the glyph run inside whatever width is declared — the error mis-sizes
  the card, never the text's position on it.
- **`gridPitch` measures the nominal artwork box even under `fitFrame`.**
  Deliberate, and an upper bound rather than an approximation: the converter
  fits a viewBox with `Math.min` of the two axis ratios and centres it, so ink
  can never exceed the nominal box. Keeping it conversion-free is what lets the
  packed grid layout be computed from titles and options alone —
  `measureExcalidrawItem` never touches the SVG. Cost is slightly wider gutters
  around icons that do not fill their viewBox.

---

Next: [Testing](Testing) for how any of this gets verified.
