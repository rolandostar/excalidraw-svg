# Testing

There are two suites, and they do different jobs.

**`pnpm test`** is unit tests over the pure functions — matrix maths, fill
rules, the option validator, the scene audit. It takes about three seconds, so
run it constantly.

**`pnpm test:fidelity`** is the picture check. Every icon is rendered twice —
once from the source SVG, once through Excalidraw's own exporter — and the two
are diffed pixel by pixel. It takes about 20 seconds warm and fails if any icon
gets worse than the committed baseline. Run it before you commit anything that
touches conversion code.

The rest of this page is about the second one: how to run it, how to read a
failure, and how to add a case.

---

## Running

```bash
pnpm test                    # unit tests, ~3s
pnpm test:watch              # the same, re-running as you edit

pnpm test:fidelity           # every icon in svg/, all sets
pnpm test:torture            # the edge-case SVGs

pnpm test:fidelity:update    # accept current numbers as the new baseline
pnpm test:torture:update
```

### Unit tests

Vitest, configured in `vitest.config.ts`. Tests sit next to the code they
cover as `*.test.ts`, and the default environment is `node` — the two files
that need a DOM opt in with `// @vitest-environment jsdom` on the first line.

Keep them small. The point is that a broken helper fails in three seconds
instead of showing up 40 seconds later as a shifted pixel that takes an hour to
trace back.

The run fans out across `min(8, cores - 1)` child processes. Each file is
scored independently and owns a unique output filename, so the only ordering
guarantee needed is on the merge, which re-sorts by id.

### Flags

`tsx scripts/run-fidelity.ts --help` prints this list; it is the complete set.

| flag | default | what it does |
|---|---|---|
| `--input=<dir>` | `svg` | directory of SVGs to score |
| `--name=<suite>` | input folder name, `-svg` stripped | selects `tests/results/<name>/` and `tests/baselines/<name>.json` |
| `--only=<substring>` | — | score matching ids only; the baseline is neither read nor written |
| `--comparisons=<mode>` | `scored` | `scored` writes a triptych only when the diff is non-empty; `all` writes one per file |
| `--jobs=<n>` | cores − 1, capped at 8 | worker processes |
| `--no-cache` | off | re-render the cached source panels |
| `--update-baseline` | off | accept the current scores as the new reference |
| `-h`, `--help` | — | the usage text |

Results are identical whatever `--jobs` and `--no-cache` are set to. If they
are not, that is a bug worth reporting, not a flake to retry.

Any folder of SVGs can be scored:

```bash
tsx scripts/run-fidelity.ts --input=path/to/svgs --name=mysuite
tsx scripts/run-fidelity.ts --input=svg --only=bigquery   # substring filter
```

### Why a warm run is twice as fast

Profiling the 261-icon corpus:

```
  rasterise + pixel diff   61.7%   736 ms/icon
  inkBox (resvg 512+scan)  31.1%   370 ms/icon
  everything else           7.2%   optimise, exportToSvg, the conversions
```

Rasterisation is 93 % of the cost, and most of it is spent on the **source**
side of each comparison. That side is a function of the input file and the
framing constants only — `inkBox(rawSvg)`, the source viewBox, and the source
panel — so it is identical on every run and is cached in `tests/.cache/`
(gitignored, ~2.5 MB). The scene side depends on the converter and is always
recomputed.

    cold  44s      warm  22s

The cache key hashes the file's bytes **and** the source of `raster.ts` and
`fidelity.ts` **and** the geometry constants. Change how anything is measured
and every entry is invalidated, because a panel measured under different rules
is not a speed-up, it is a wrong answer that reproduces. Stale-version entries
are pruned at the start of each run. `--no-cache` skips the cache entirely.

### Baseline keys and icon sets

The input directory is walked recursively, and the first level below it names
the *set*:

| layout | baseline key |
|---|---|
| `tests/torture-svg/17-gradients.svg` (flat) | `17-gradients` |
| `svg/legacy-gcp/BigQuery.svg` (nested) | `legacy-gcp__BigQuery` |

Nested files are prefixed **unconditionally**, not only when something
collides. Two Google Cloud icon sets will share most of their filenames, and
deriving the prefix from whether a collision exists today would silently rename
a baselined icon the moment a second set landed — dropping it from the gate
without failing anything.

A new set therefore starts with no baseline entries, and the harness will
**not** invent them — a baseline written by the same run that produced it gates
nothing. Instead the run scores those files, lists them under `NOT GATED`, and
carries on:

```
NOT GATED - 45 file(s) have no baseline entry:
  category-icons  26 file(s)
  unique-icons  19 file(s)
  Review the scores above, then run with --update-baseline to accept them.
  Until then these files can regress without failing anything.
```

Read those numbers before accepting them with `pnpm test:fidelity:update`. The
gate can only hold a limit somebody agreed to.

A `--only` run reads and writes **no** baseline — it sees a subset, so letting
it touch the reference would corrupt it.

## What gets measured

Each file is converted through the **shipped** export path
(`createExcalidrawItem` → `buildExcalidrawLibraryPackage` /
`buildExcalidrawClipboardData` with `DEFAULT_EXCALIDRAW_OPTIONS`), rendered by
**Excalidraw's own** `exportToSvg`, and scored on two deliberately orthogonal
axes:

**Shape error** — `mismatchedPixels / unionInkPixels`, from a `pixelmatch` diff
of the source SVG against the Excalidraw render. Normalised by inked pixels
rather than canvas area, because icons are mostly empty space and dividing by
area makes everything look excellent.

**Placement error** — largest edge or size error in output pixels, comparing
where the source ink *should* land against the bounds of the emitted geometry.
Purely numeric, no rendering.

Both are needed. A shape-only metric hides a systematic offset; a bbox-only
metric hides a missing hole.

**Audit** — `auditSceneFidelity` additionally catches structural faults
Excalidraw swallows silently: open paths carrying a fill it will refuse to
fill, degenerate shapes, image elements whose file was dropped.

### Framing

Both sides are rendered inside one **common** user-space window. This matters:
framing each side on its own ink box sounds neutral but is not, because
Excalidraw's forced round caps make a stroked icon's ink box larger than the
source's. Fitting that larger box to the same canvas shrinks the whole drawing
and lights up every edge in the diff — it inflated real errors by roughly 10×
and buried the local differences that mattered.

`exportToSvg` always crops to content bounds and bakes the offset into every
element transform, so the output cannot be reframed afterwards.
`renderExcalidrawSceneInWindow()` works around this by prepending an invisible
sentinel element spanning the desired window, which makes that window *become*
the bounding box: `viewBox` is exactly `0 0 w h` with a zero translate. It
throws if content escapes the window, because a silently shifted frame makes
every subsequent measurement wrong.

The window itself is `scripts/fidelity/config.ts`: a 48×48 target box plus a
6-unit margin, rasterised into 320px square panels.

## Gate

Thresholds live in `scripts/lib/thresholds.ts`, which is the only module
allowed to decide whether an icon passes — the HTML report, the published
evidence and the gate all import `isFailing` from it, so they cannot drift:

| metric | threshold |
|---|---|
| shape error | 2 % (`shapeScore: 0.02`) |
| placement error | 0.5 px |
| audit issues | any |
| regression slack vs baseline | 0.001 shape score |

`scripts/fidelity/gate.ts` turns scored files into a verdict. Three things
exit 1, and they are reported separately because they mean different things:

1. **A file errored** during scoring — a broken harness or a broken input.
2. **A file is over threshold** and is not listed as an expected failure — a
   conversion that is wrong today.
3. **A file regressed** by more than `regressionSlack` against
   `tests/baselines/<suite>.json` — a conversion that got worse.

A run that only checked (3) — which this one used to — passes green while every
icon is visibly broken, as long as it was equally broken last time.

Two more things are reported but are **not** fatal: files with no baseline
entry (`NOT GATED`, above) and expected failures that have started passing
(`NOW PASSING` — good news, but the entry should come out of the file).

Doctoring a baseline entry produces `Kuberun: 0.00% -> 91.89%` and exit code 1.
If you change the harness, re-check that; a gate that cannot fail is worse than
no gate.

## Expected failures

Cases that are meant to fail live in
`tests/baselines/<suite>.expected-failures.json`, an id → reason map:

```json
{
  "17-gradients": "Excalidraw has no gradient paint. A gradient flattens to one averaged colour, and this number is how much colour the format cannot carry."
}
```

The gate reads it, so a listed case being over threshold does not fail the run.
The regression check still applies, so a listed case getting *worse* does. And
`scripts/build-evidence.ts` reads the same file, so the reason shown on the
website is literally the reason the gate used — there is no second copy to
drift.

The torture suite currently lists four:

| id | error | reason (from the file) |
|---|---|---|
| `20-unsupported-features` | ~58 % | One of everything the converter refuses to guess at. The requirement is that each feature is reported, not that it renders. A low score here would mean something was quietly approximated. |
| `17-gradients` | ~28 % | Excalidraw has no gradient paint. A gradient flattens to one averaged colour, and this number is how much colour the format cannot carry. |
| `15-viewbox-offset` | 0.00 % shape, 0.57 px placement | The shape is exact. The placement number comes from measuring a 0.5-unit hairline against a pixel grid. It sits just over the gate, and the gate stays where it is for everything else. |
| `27-implicit-default-fill` | ~5.8 % | The fill decision is correct. The ink is a few very small shapes, so the one-pixel antialiasing ring around the circle is a large share of the total area. |

These are why the suite reports "4 failing" rather than "0 failing". Getting to
zero would mean deleting the cases or weakening the thresholds.

**If one of these reaches 0.00 %, that is a signal, not a win.** The run will
tell you (`NOW PASSING`). Check whether the converter genuinely gained a
capability — in which case delete the entry and update the baseline — or
whether the fixture stopped exercising the feature.

## Reading a failure

```
tests/results/<suite>/
  comparison.html          sorted worst-first, with per-icon deltas vs baseline
  comparisons/<id>.png     triptych: source | Excalidraw | pixel diff
  summary.json             every metric, machine-readable
```

Open `comparison.html` first. The triptych is usually enough to classify the
defect immediately — a uniform edge band means a scale or offset problem, red
only at corners means joins, radial hairlines mean bridged sliver holes.

`tests/results/` is gitignored in full. Only `tests/baselines/` is committed.
`pnpm evidence` freezes the parts the website quotes into `public/evidence/`,
which is committed, so the numbers on the site come out of the same artifact
the gate reads.

A comparison triptych is only written when the diff is non-empty. On the icon
corpus 258 of 261 files are pixel-identical, so writing all of them meant
encoding 261 PNGs to publish six. Suites whose every case is published — the
torture gallery shows passing cases too — pass `--comparisons=all`, which the
`test:torture` scripts already do. The run prints how many were written.

## How the harness is laid out

`scripts/run-fidelity.ts` is a thin entry point (~100 lines): parse config,
walk the corpus, fan out, write the report, apply the gate. Its one hard
constraint is that `import './setupDom'` stays the first line — everything
below it eventually reaches `@excalidraw/utils`, which reads `document` at
module-evaluation time.

The work lives in `scripts/fidelity/`:

| module | responsibility |
|---|---|
| `config.ts` | every flag, parsed once; the target box, panel size and scene window; `childArgs` for forwarding to workers |
| `corpus.ts` | walking a directory into `Candidate`s, reading `set.json`, building the same `IconAsset` shape the app builds |
| `score.ts` | scoring one file — pure with respect to every other file, which is what makes the fan-out safe |
| `pool.ts` | the only module that knows `fork()` exists; round-robin sharding and result merge |
| `gate.ts` | baselines, expected failures, the verdict |
| `console.ts` | every line printed. No decisions, so behaviour can be read without wading through formatting |

Shared helpers stay in `scripts/lib/`: `raster.ts`, `fidelity.ts`,
`sourceCache.ts`, `triptych.ts`, `html.ts`, `thresholds.ts`.

Forking rather than threading is deliberate: the scoring stack is a jsdom
document plus Excalidraw's renderer reading bare globals, and a private realm
per worker is what makes it safe to parallelise. Below two files per worker the
fork overhead dominates and the run stays single-process.

### Where the package-level audit runs

Each worker audits its own icons through all three shipped export paths —
vector elements, the clipboard payload after a JSON round-trip, and the library
item serialised without its `files` map. The audit runs at the origin rather
than at the icon's real grid offset, which is equivalent because every rule in
`auditSceneFidelity` is translation-invariant, and the packaged payloads are a
concatenation of these elements plus a merge of these `files` maps — a merge can
only ever add a file an element might reference, never remove one.

The one thing a single icon cannot see is two icons minting the same `fileId`,
so the ids come back to the master and are checked across the whole corpus.

## Adding a torture test

Drop an SVG into `tests/torture-svg/` and run `pnpm test:torture:update`. See
[Submit an edge case](Submit-an-edge-case) if you are reporting one rather than
writing one.

They are **self-verifying**: resvg decides what correct looks like, so no expected output is
written by hand. That is the point: you do not need to know what the correct
answer looks like, only to construct a file that exercises the feature.

Guidelines that made the existing set useful:

- **One feature per file**, named so the failure is self-describing.
- **Comment the trap at the top** — what a naive converter does wrong and what
  the correct result looks like. `build-evidence.ts` reads that comment and
  publishes it as the case's caption, so a new fixture documents itself.
- **Make the wrong answer obvious.** Prefer geometry where an error is a large
  area, not a hairline. Use offset, non-square boxes so a wrong origin or
  aspect shows up.
- **Pair contrasting cases.** `01`/`02` are identical geometry under `evenodd`
  and `nonzero` and must render *differently*; any single heuristic fails one.

Writing the first 20 immediately surfaced five real bugs: `<use>` x/y ignored,
group opacity ignored, anisotropic stroke widths, self-intersecting offsets at
sharp joins, and stroked rings dropped entirely when wound clockwise. The
`objectBoundingBox` batch then caught two bugs in the fix that was written for
it.

## Workflow for changing conversion code

1. `pnpm test`, `pnpm test:fidelity` and `pnpm test:torture` — confirm green
   before you start.
2. Make the change, with `pnpm test:watch` running.
3. Re-run both. Read the **regression list**, not just the mean; a change can
   improve the average while destroying one icon.
4. If a regression is real, fix it. If the *baseline* was wrong, say so
   explicitly and update it in its own commit.
5. `pnpm test:fidelity:update` / `pnpm test:torture:update`, and commit the
   baselines alongside the change with the numbers in the message.

Scores are stable across runs and across `--jobs` and `--no-cache` settings. If
you see churn, something reintroduced `Date.now()` or `Math.random()` into a
path that feeds a measurement.

---

See also: [Architecture](Architecture) for what is being tested and why.
