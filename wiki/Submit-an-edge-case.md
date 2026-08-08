# Submit an edge case

Found an SVG that converts badly? Open an issue with the file attached. If it
turns out to be a real defect, the file becomes a permanent fixture in
`tests/torture-svg/` and every future release is scored against it.

---

## What makes a good report

**Attach the SVG.** This is the whole report. A screenshot tells us it looks
wrong; the file lets us reproduce it, measure it, and keep it from coming back.
Paste the markup inline if it is short, attach it if it is not — GitHub will
not accept a bare `.svg` upload, so zip it or rename it to `.txt`.

Then, briefly:

- **What you expected** — "the middle should be a hole", "the corners should be
  square".
- **What you got** — "filled solid", "rounded".
- **Where it came from**, if you know: Illustrator, Figma, Inkscape, a design
  system export. Each tool has its own idioms and knowing the source often
  identifies the construct immediately.

Trim the file first if you can. A 4 KB file with one path that reproduces the
problem is worth far more than a 200 KB logo, because it can go straight into
the corpus.

### Things that are not bugs

Check the [known limitations](../../blob/main/README.md#known-limitations)
first. `<text>`, `<image>`, `<pattern>`, filters, markers, `stroke-dasharray`
and skew transforms are all detected and reported rather than converted, and
gradients are deliberately flattened to a single averaged colour. Those are
documented trade-offs, not defects.

If the converter told you it could not handle something, that part is working
as intended. If it silently produced the wrong geometry, that is a bug.

## What happens to an accepted report

The file lands in `tests/torture-svg/` and is scored on every run of
`pnpm test:torture`. These fixtures are **self-verifying**: resvg renders the
source, Excalidraw renders the conversion, and the two are diffed. Nobody
writes an expected output by hand, so nobody has to know in advance what the
correct answer looks like.

They are also published. The methodology page on the site shows every torture
case with its source/output/diff triptych and its score, so the fixture becomes
part of the public record of what the converter does and does not handle.

## Naming convention

```
tests/torture-svg/NN-short-description.svg
```

Two-digit ordering prefix, then a hyphenated description of the *feature*, not
the symptom — `07-stroke-caps-joins.svg`, `21-clip-objectboundingbox.svg`. The
prefix is stripped for display, so `27-implicit-default-fill` shows up as
"implicit default fill".

Take the next free number. The id is the baseline key, so renaming a fixture
later drops its history.

### The leading comment is required

Every fixture opens with an HTML comment saying what the trap is.
`scripts/build-evidence.ts` reads that comment and publishes it as the case's
caption on the website, so it is the only documentation the fixture needs —
and `pnpm evidence` prints a warning naming any case that lacks one.

```svg
<!-- Two rings wound the SAME direction. Under evenodd the inner one is a hole.
     A converter that infers holes from opposite winding fills this solid. -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
  <path fill="#4285f4" fill-rule="evenodd"
        d="M2 2 H22 V22 H2 Z M7 7 H17 V17 H7 Z"/>
</svg>
```

Say what a naive converter does wrong and what the correct result looks like.
Future readers need the intent, not the geometry — they can read the geometry.

## Writing one yourself

If you want to send the fixture rather than the bug report, the guidelines that
made the existing 29 useful:

- **One feature per file.** A file that exercises three things tells you
  nothing when it fails.
- **Make the wrong answer obvious.** Prefer geometry where an error is a large
  filled area, not a hairline. Use offset, non-square boxes so a wrong origin
  or aspect ratio shows up in the diff.
- **Pair contrasting cases.** `01-evenodd-same-winding` and
  `02-nonzero-same-winding` are identical geometry under the two fill rules and
  must render *differently*. Any single heuristic fails one of them.
- **Keep it small.** 24×24 with a handful of shapes.

Then:

```bash
pnpm test:torture              # see the score
pnpm test:torture:update       # accept it into the baseline
```

Open `tests/results/torture/comparison.html` to check the triptych actually
shows the defect you meant to capture.

If the case is meant to fail — it pins a documented limit rather than a bug —
add it to `tests/baselines/torture.expected-failures.json` with a one-sentence
reason. The gate reads that file, and so does the website. See
[Testing](Testing#expected-failures).
