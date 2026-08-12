# excalidraw-svg wiki

Long-form documentation. The
[README](../../blob/main/README.md) is the short version, and the "how this was
built" note lives there rather than being repeated here.

- **[Architecture](Architecture)** — the pipeline, an index of the invariants
  and where each is stated, and the results of experiments that were rejected.
- **[Testing](Testing)** — how the fidelity harness measures, how to read a
  failure, and how to extend it.
- **[Submit an icon set](Submit-an-icon-set)** — the `set.json` schema and how
  to get a new set gated by the test suite.
- **[Submit an edge case](Submit-an-edge-case)** — how to report an SVG that
  converts badly, and how those reports become permanent fixtures.

---

*These pages are authored in `wiki/` in the main repository and published by
`.github/workflows/wiki.yml`. Edits made in the GitHub wiki UI will be
overwritten — send a PR against `wiki/` instead.*
