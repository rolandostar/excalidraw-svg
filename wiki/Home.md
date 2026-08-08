# excalidraw-svg wiki

Converts SVG artwork into native Excalidraw elements — real polygons and
ellipses, not an embedded bitmap. This wiki is the long-form documentation; the
[README](../../blob/main/README.md) is the short version.

## Pages

- **[Architecture](Architecture)** — the pipeline, the invariants that must not
  be broken, and the reasoning behind the non-obvious decisions.
- **[Testing](Testing)** — how the fidelity harness measures, how to read a
  failure, and how to extend it.
- **[Submit an icon set](Submit-an-icon-set)** — the `set.json` schema and how
  to get a new set gated by the test suite.
- **[Submit an edge case](Submit-an-edge-case)** — how to report an SVG that
  converts badly, and how those reports become permanent fixtures.

## How this was built

AI coding tools helped write parts of this codebase.

That is worth saying plainly, and it is also why the test suite matters more
than usual here. `pnpm test:fidelity` renders all 261 icons twice — once from
the source SVG, once through Excalidraw's own exporter — and compares them
pixel by pixel. It fails the build if anything gets worse. See
[Testing](Testing).

---

*These pages are authored in `wiki/` in the main repository and published by
`.github/workflows/wiki.yml`. Edits made in the GitHub wiki UI will be
overwritten — send a PR against `wiki/` instead.*
