# Testing

The harness is the oracle. Visual inspection is not — several changes that
looked like clear improvements were measurable regressions, and several
alarming-looking numbers turned out to be artefacts of how the measurement was
framed.

---

## Running

```bash
pnpm test                    # every icon in svg/, all sets
pnpm test:torture            # the edge-case SVGs

pnpm test:update             # accept current numbers as the new baseline
pnpm test:torture:update
```

The run fans out across `min(8, cores - 1)` child processes. Each file is
scored independently and owns a unique output filename, so the only ordering
guarantee needed is on the merge, which re-sorts by id. Two knobs:

```bash
--jobs=1                     # serial, for profiling or a clean stack trace
--jobs=4                     # cap the fan-out
```

Results are identical either way. If they are not, that is a bug worth
reporting, not a flake to retry.

Any folder of SVGs can be scored:

```bash
tsx scripts/run-fidelity.ts --input=path/to/svgs --name=mysuite
tsx scripts/run-fidelity.ts --input=svg --only=bigquery   # substring filter
```

`--name` defaults to the input folder's name with a trailing `-svg` stripped.
It selects both `tests/results/<name>/` and `tests/baselines/<name>.json`, so
suites never collide.

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

**Read those numbers before accepting them** with `pnpm test:update`: the gate
can only hold a limit somebody agreed to.

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

## Gate

Results are compared against `tests/baselines/<suite>.json`. Any icon whose
shape error grows by more than `regressionSlack` (0.001) fails the run with a
non-zero exit code and a per-icon before/after list.

Thresholds for the "failing" count (`scripts/lib/report.ts`):

| metric | threshold |
|---|---|
| shape error | 2 % |
| placement error | 0.5 px |
| audit issues | any |

The gate has been verified to actually fail — doctoring a baseline entry
produces `Kuberun: 0.00% -> 91.89%` and exit code 1. If you change the harness,
re-verify this; a gate that cannot fail is worse than no gate.

## Reading a failure

```
tests/results/<suite>/
  comparison.html          sorted worst-first, with per-icon deltas vs baseline
  comparisons/<id>.png     triptych: source | Excalidraw | pixel diff
  elements/<id>.excalidraw importable scene, deterministic on disk
  summary.json             every metric, machine-readable
  library.excalidrawlib    the generated library
```

Open `comparison.html` first. The triptych is usually enough to classify the
defect immediately — a uniform edge band means a scale or offset problem, red
only at corners means joins, radial hairlines mean bridged sliver holes.

`tests/results/` is gitignored in full. Only `tests/baselines/` is committed.

### What the run does and does not write

A comparison triptych is only written when the diff is non-empty. On the icon
corpus 258 of 261 files are pixel-identical, so writing all of them meant
encoding 261 PNGs to publish six. Suites whose every case is published - the
torture gallery shows passing cases too - pass `--comparisons=all`, which the
`test:torture` scripts already do. The run prints how many were written.

Per-file `.excalidraw` dumps are off by default and enabled with `--snapshots`.
Nothing reads them: `tests/results/` is gitignored, so they cannot serve as a
regression reference. They exist to inspect one conversion by hand.

## Adding a torture test

Drop an SVG into `tests/torture-svg/` and run `pnpm test:torture:update`.

They are **self-verifying** — resvg is the oracle, so no expected output is
written by hand. That is the whole point: you do not need to know what the
correct answer looks like, only to construct a file that exercises the feature.

Guidelines that made the existing set useful:

- **One feature per file**, named so the failure is self-describing.
- **Comment the trap at the top** — what a naive converter does wrong and what
  the correct result looks like. Future readers need the intent, not the SVG.
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

## Deliberate failures

Four torture files are over threshold **by construction**. They are not
outstanding bugs and there is no intention to make them pass — each one exists
to pin a documented limit in place so that it cannot quietly change.

| file | error | why it is deliberate |
|---|---|---|
| `20-unsupported-features` | ~58 % | Contains one of everything the converter refuses to guess at: text, pattern, filter, marker, dasharray, skew. The requirement is that each is **reported** by `collectUnsupportedFeatures`, not that it renders. A high pixel error is the correct outcome; a low one would mean something was silently approximated. |
| `17-gradients` | ~28 % | Excalidraw has no gradient paint server, so a gradient is flattened to a single averaged colour. That is the designed behaviour. The error is a measure of how much colour information the format cannot carry, and it should stay roughly constant. |
| `15-viewbox-offset` | 0.00 % shape, 0.57 px placement | Shape is exact. The placement number is an artefact of measuring a 0.5-unit hairline border against a pixel grid, not a conversion defect. It sits just over the 0.5 px gate, which is left in place rather than loosening the threshold for every other case. |
| `27-implicit-default-fill` | ~5.8 % | The fill decision under test — undeclared `fill` means black, not `none` — is correct. The ink is four very small shapes, so the one-pixel antialiasing ring around the circle is a large fraction of the total area. The number measures the measurement. What holds this case is the baseline, not the threshold. |

These are the reason the suite reports "4 failing" rather than "0 failing". A
green board would require either deleting the cases or weakening the
thresholds, and both would make the number meaningless.

**If one of these reaches 0.00 %, that is a signal, not a win.** Check whether
the converter genuinely gained a capability — in which case update the row
above and the baseline — or whether the fixture stopped exercising the feature.

## Workflow for changing conversion code

1. `pnpm test` and `pnpm test:torture` — confirm green before you start.
2. Make the change.
3. Re-run both. Read the **regression list**, not just the mean; a change can
   improve the average while destroying one icon.
4. If a regression is real, fix it. If the *baseline* was wrong, say so
   explicitly and update it in its own commit.
5. `pnpm test:update` / `pnpm test:torture:update`, and commit the baselines
   alongside the change with the numbers in the message.

Determinism has been verified: identical scores across runs, and stable file
hashes for on-disk snapshots. If you see churn, something reintroduced
`Date.now()` or `Math.random()` into a snapshot path — `scripts/lib/snapshot.ts`
exists to project those away.
