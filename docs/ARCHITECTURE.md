# Architecture

How an SVG becomes Excalidraw elements, and why the non-obvious parts are the
way they are.

If you are an agent picking this up: read the **Invariants** section before
changing anything in `src/utils/`. Most of them look like they could be
simplified. They cannot — each one has a measured failure behind it.

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
   │      clip each result, emit as Excalidraw `line` / `ellipse`
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

Two properties of that module are load-bearing:

- **Discovery is cheap, materialisation is not.** `listIconSets()` reads only
  manifests and the raw markup of the first eight files per set, and is what
  the `/icons` gallery renders. `loadIconSet()` is where SVGO runs, so it is
  per-set, on demand, and memoised. A tenth set costs the gallery one card, not
  another second of optimisation.
- **Category rules live in the manifest, not in code.** `categorizer.ts` keeps
  only the matching engine and `formatTitle`. The GCP keyword lists moved
  verbatim into `svg/legacy-gcp/set.json`, order preserved — the matcher is
  first-wins, so reordering or merging the lists silently reclassifies icons.
  There is a check for this: the six-bucket distribution is 51/40/35/34/29/27.

Search aliases are declared as bidirectional `synonyms` groups and expanded
into each icon's tag list at load time, which is why `vpc` and
`virtual private cloud` find the same icon without either being canonical.

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

### 5. Holes are bridged with zero-width corridors, under `evenodd`

An Excalidraw `line` has a single point list, so a hole can only be expressed by
walking into it and back out along a coincident pair of edges. This works
because Rough.js fills `polygon` shapes with `fill-rule: evenodd` — verified in
both its canvas and SVG renderers.

`bridgeHoles()` anchors every corridor on a vertex of the **original** outer
ring. Stitching into an accumulating ring lets the second hole attach to the
first hole's boundary and drive its corridor through the first hole's interior.

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

Do not reintroduce these. Each shipped at some point and was caught by
measurement.

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

- `roundness: null` on every emitted `line` — otherwise Excalidraw curves the
  point list.
- `roughness: 0` makes Rough.js deterministic, so `seed` and `versionNonce`
  do not affect rendering (they still change per run; the harness stabilises
  them for on-disk snapshots only — `scripts/lib/snapshot.ts`).
- Element `index` values (`a0`/`a1`/`a2`) are placeholders. Excalidraw
  regenerates fractional indices from array order on restore, so paint order
  follows array order — preserve it.
- `.excalidrawlib` carries `files` both per-item and top-level; the v2 schema
  is not explicit about where they belong.

## Known gaps

Beyond the reported-unsupported list in the README:

- **Rotated ellipses lose their angle.** `angle` is always 0; radii come from
  `hypot` of the matrix columns. No icon in the corpus is affected.
- **Group opacity is applied per shape.** Compositing a group as a unit differs
  where its members overlap each other; per-shape is the closest Excalidraw can
  express.
- **Grid pitch ignores label width.** `buildExcalidrawClipboardData` uses 160 px
  and `buildExcalidrawLibraryPackage` 180 px, while `cardWidth` grows with the
  title, so long-named icons overlap in multi-icon exports.
- **Text metrics are estimated** (`length * fontSize * 0.55`); Excalidraw does
  not re-measure pasted text, so labels are slightly mis-centred.
