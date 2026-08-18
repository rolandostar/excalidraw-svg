# Changelog

All notable changes to this project are documented here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

Versions track [Semantic Versioning](https://semver.org/spec/v2.0.0.html) loosely.
This is a deployed site, not a package — nothing installs it as a dependency, so
the major number is reserved for a reworked product rather than for a moved URL.

That means a patch release can still change something a visitor notices. Two
kinds are worth checking for in any entry below, because both are silent:

- **Renamed or removed icon sets.** A set folder name is simultaneously its URL
  (`svg/<id>/` is served at `/icons/<id>`) and the localStorage namespace for
  that set's saved styling. Renaming one retires a URL and resets saved work.
- **Changed storage schemas.** localStorage outlives deploys, so a key that
  changes shape without a migration drops whatever was already there.

Icon additions and removals inside an existing set affect neither. A set is a
single page, so its icons have no URLs of their own.

## [1.0.1] — 2026-08-18

Naming and documentation only. No product changes: no new features, no
converter or rendering changes, and every fidelity measurement is unchanged.

Two caveats for anyone already using the site — both covered under Migration:
two set URLs are retired, and saved styling for those two sets resets.

### Changed

- Renamed two icon set folders to carry the `-gcp` marker already used by
  `legacy-gcp`, so every Google Cloud set is named consistently and a future
  non-GCP set cannot be mistaken for one:

  | before | after | icons |
  |---|---|---|
  | `svg/category-icons/` | `svg/category-icons-gcp/` | 26 |
  | `svg/unique-icons/` | `svg/unique-icons-gcp/` | 19 |

  The SVGs themselves are byte-identical; git records all 47 moves as pure
  renames. Set display names, accents, presets and `order` are declared in
  `set.json` and were not touched, so the gallery looks the same.

  Follow-on updates, all mechanical: 45 keys in `tests/baselines/icons.json`
  (renamed in place rather than re-scored, so the committed reference values
  are unchanged), the generated evidence, the README claims block, and
  `public/sitemap.xml`.

### Removed

- `/icons/category-icons` and `/icons/unique-icons` are no longer served.
  `vite/spa-fallback.ts` only pre-renders the set folders that exist, so
  GitHub Pages now answers both with `404.html` — the app still boots and
  shows the "No set called …" page with a link back to `/icons`, but the HTTP
  status is a real 404 and search engines will drop the two URLs.

  No redirect layer was added. The router has no alias mechanism, and adding
  one would mean teaching three separate places about historical ids.

### Migration

- **Saved styling for these two sets resets to their defaults.** Every piece
  of per-set state is namespaced by the folder id — the styling options, the
  search box, the active category chip, and the current selection. The app
  now looks under the new id, finds nothing, and falls back to the values
  `set.json` declares. Nothing is lost from any *other* set.

  The old entries are orphaned rather than deleted. To clear them:

  ```js
  Object.keys(localStorage)
    .filter(k => /^excalidraw-svg:icons\.(category-icons|unique-icons)\./.test(k))
    .forEach(k => localStorage.removeItem(k));
  ```

  To carry the old *styling* across instead — the part that is expensive to
  redo — copy just the options key:

  ```js
  ['category-icons', 'unique-icons'].forEach(id => {
    const from = `excalidraw-svg:icons.${id}.options.v2`;
    const value = localStorage.getItem(from);
    if (value !== null) localStorage.setItem(`excalidraw-svg:icons.${id}-gcp.options.v2`, value);
  });
  ```

  Deliberately only `.options.v2`. The saved *selection* cannot be moved by
  renaming its key: it stores icon ids of the form `<set-id>/<name>`, so the
  restored list would reference ids that no longer exist — the toolbar would
  claim "26 selected" while Copy and Export quietly did nothing. Search text
  and the active category chip are a keystroke to redo and are not worth the
  risk. Both reset.

- Anyone who forked at `v1.0.0` and added icons to either folder will see
  their files left behind in the old directory. Move them into the renamed
  folder and run `pnpm test:fidelity:update` to baseline them.

- Downloaded `.excalidrawlib` files are **not** affected. The filename comes
  from the set's display name, not its folder id, and the library payload
  carries no set id at all.

## [1.0.0] — 2026-08-18

Initial public release.

- SVG → Excalidraw converter, running entirely in the browser.
- 261 Google Cloud icons across three sets, each restylable and exportable as
  an `.excalidrawlib` library or straight to the clipboard.
- A fidelity harness that scores every icon against its source and gates the
  build on regressions, plus the methodology page that publishes the results.

[1.0.1]: https://github.com/rolandostar/excalidraw-svg/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/rolandostar/excalidraw-svg/releases/tag/v1.0.0
