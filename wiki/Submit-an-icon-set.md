# Submit an icon set

A **set** is a folder of `.svg` files under `svg/`. The folder name becomes the
URL, each filename becomes an icon title, and the set shows up in the gallery
at `/icons`. Nothing has to be registered anywhere — `src/library/iconSets.ts`
discovers folders with `import.meta.glob`, and the dev server picks up a new
one on the next tick.

This page is the reference for `set.json`, the optional manifest that names,
categorises and styles a set.

---

## The two-minute version

```
svg/
  my-set/
    Cloud-Run.svg
    Big-Query.svg
```

```bash
pnpm dev
```

Open `http://localhost:3000/icons/my-set`. That is a working set. Every icon is
titled from its filename (`Cloud-Run.svg` → "Cloud Run"), everything lands in a
single implicit category, and the set uses the app's default styling.

Two constraints:

- **Icons must live in a set folder.** Loose `.svg` files directly under `svg/`
  are ignored, and the dev build logs a warning saying so.
- **The folder name is the URL**, so keep it lowercase and hyphenated.

Add `svg/my-set/set.json` when you want more than that.

## Full field reference

Every field is optional. `svg/legacy-gcp/set.json` is a complete worked
example.

```jsonc
{
  // --- identity ---------------------------------------------------------
  "name": "Google Cloud 2026",          // defaults to a title-cased folder name
  "description": "The refreshed product marks.",
  "accent": "#4285F4",                  // gallery card + default chip colour
  "order": 20,                          // lower sorts first; unset sorts last
  "tags": ["gcp", "google cloud"],      // added to every icon's search tags

  // --- attribution, shown on the gallery card ---------------------------
  "source": "Google Cloud",
  "sourceUrl": "https://cloud.google.com/icons",
  "license": "Apache-2.0",

  // --- classification ---------------------------------------------------
  "categories": [                       // filter chips, in display order
    { "id": "compute", "name": "Compute", "color": "#81C995" },
    { "id": "general", "name": "General" }
  ],

  // Ordered and FIRST-WINS, substring-matched against the lowercased
  // filename. Anything unmatched falls through to the LAST category, so
  // list the catch-all bucket last.
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

  // --- how the set opens ------------------------------------------------
  // A patch over the app defaults: state only what differs. Every field of
  // the styling sidebar is available.
  "defaults": {
    // Excalidraw's own font ids: 5 Excalifont, 6 Nunito, 7 Lilita One,
    // 8 Comic Shanns, 9 Liberation Sans. These are NOT 1-5; ids 1/2/3 are
    // the deprecated Virgil/Helvetica/Cascadia and 4 is permanently unused.
    "labelFontFamily": 5,
    "labelFontSize": 18,
    "labelColor": "#4285f4",
    "iconScale": 1
  },

  // The preset buttons in the styling sidebar. Each `options` is a patch
  // over `defaults`, so a preset states the two or three things that make
  // it interesting. A "Default" button equal to `defaults` is always added.
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

### Notes on the awkward bits

**`rules` is first-wins and order matters.** Reordering or merging two lists
silently reclassifies icons. If you are editing an existing set's rules, check
the category counts before and after.

**The frame is described by Excalidraw's real properties**, not by named
styles. An earlier schema had a single `cardStyle`
(`soft-card`/`sketch-box`/`outline`) that bundled corner radius, stroke weight
and fill together; it made combinations like a rounded hatched card
unreachable, and `outline` silently ignored `cardBgColor`. `cardStyle` and
`roughness` are both rejected with a message naming what replaced them.

**Unrecognised keys and out-of-range values are dropped, not merged.**
`scene/options.ts` validates `defaults` and `presets` and warns in dev. A value
none of the sidebar controls can represent would leave the UI unable to show or
undo it.

**Styling is remembered per set**, so each one keeps the look you last gave it.

## Getting your set gated by the test suite

Fidelity baselines are keyed `<set>__<filename>`, so a new set starts with no
baseline entries. The harness will **not** invent them, and it fails until you
accept them:

```bash
pnpm test:fidelity
```

```
NOT GATED - 45 file(s) have no baseline entry:
  my-set  45 file(s)
  Nothing is checking these, so the run fails. Read the scores above,
  then re-run with --update-baseline to accept them.
```

The run scores your files and prints the worst by shape error. Read those
numbers. Anything over 2 % shape error or 0.5 px placement error will fail the
gate once baselined, and is worth understanding first — it usually means the
set uses something in the [known gaps](Architecture#known-gaps) list.

When the numbers look right:

```bash
pnpm test:fidelity:update
```

That writes `tests/baselines/icons.json`. Commit it with the icons. From then
on your set cannot silently regress.

See [Testing](Testing) for what the numbers mean.

## Opening the PR

1. Add `svg/<your-set>/` with the SVGs and, if you want one, `set.json`.
2. Confirm the licence permits redistribution, and fill in `source`,
   `sourceUrl` and `license` in the manifest.
3. `pnpm build` — this typechecks and builds; the icon-sets Vite plugin runs
   the optimiser over your files, so a malformed SVG shows up here.
4. `pnpm test:fidelity`, read the `NOT GATED` scores, then
   `pnpm test:fidelity:update`.
5. `pnpm evidence` — the website quotes a total icon count, and `pnpm test`
   fails until it matches what is in `svg/`.
6. Commit `tests/baselines/icons.json` and `src/generated/evidence-headline.json`
   in the same PR, and put the set's mean and worst shape error in the
   description.

If one of your icons converts badly and you think it is a converter bug rather
than an unsupported feature, open it separately as an
[edge case](Submit-an-edge-case).
