# Viewgram

An Obsidian plugin that adds native-scale navigation, semantic interaction, source editing and image export to existing Mermaid SVGs.

Plugin ID: `viewgram`. Display name: Viewgram. Author: DevGuyRash. Repository: [DevGuyRash/viewgram](https://github.com/DevGuyRash/viewgram). npm package name: `viewgram`.

## Use

Open a note containing a Mermaid code block in Reading view or Live Preview. Viewgram adds controls to diagrams that Obsidian can render with measurable dimensions; it uses the host's existing renderer.

- Use Fit chart to see the complete diagram, or choose a zoom percentage and pan with the mouse, trackpad or keyboard. Fit width is also available in the presets.
- Open a lightbox for an independently fitted view. Closing it returns the original SVG to the note.
- Choose Edit chart or double-click blank chart space to edit the complete source. Double-click an element to inspect its text and relationships; supported, unambiguous labels can be edited directly. Source changes are written only when you choose Save.
- Use Source & export to copy source or an image, or save SVG, PNG, JPG or WebP. Failed clipboard operations offer a Save fallback.
- Adjust backgrounds, initial fit, zoom steps, semantic highlighting and line hit width in the plugin's settings.

Desktop behavior has been qualified as described below. Real mobile keyboards/touch and coexistence with Mica remain unqualified.

## Manual installation

Download `main.js`, `manifest.json` and `styles.css` from the [Viewgram releases](https://github.com/DevGuyRash/viewgram/releases). These are the only runtime files. Manual installation is available independently of the Community directory listing and its review status.

Close Obsidian before placing those three files in `<vault>/.obsidian/plugins/viewgram/`, preserve any `data.json`, then enable Viewgram in Community plugins. Use the actual Obsidian configuration directory if it has a custom name.

For an existing, confirmed DevGuyRash installation with ID `devguyrash-mermaid-viewer`, disable that plugin and close Obsidian before migrating its settings. From the Viewgram source checkout, pass the actual absolute configuration-directory path:

```sh
node scripts/migrate-settings.mjs "/absolute/vault/.obsidian"
```

The helper verifies the legacy manifest's ID and author and requires object-shaped settings JSON. It creates a unique owner-only backup in the legacy folder, then copies the original settings bytes to `plugins/viewgram/data.json` without replacing existing target data. It refuses symlinks and a mismatched publisher, preserves unknown settings keys, and does not change enabled-plugin lists. If there is no legacy `data.json`, no settings migration is needed. Keep the old folder and backups for rollback, and ensure the old plugin is disabled before enabling Viewgram.

The third-party `mermaid-viewer` namespace is separate. The helper does not inspect or copy it; do not infer ownership from that ID or display name. See [placement](docs/PLACEMENT.md).

## Implementation

- Inline diagrams grow to their natural height, capped near 88% of the visible pane including controls. A bottom-right handle changes the whole chart container, including its viewport and footer; arrow keys resize and Home or double-click restores automatic sizing. Short, narrow panes can shrink below the usual minimum, and a preferred manual height returns when the pane expands.
- Fit chart contains the complete diagram. Native `100%`, minus/plus, editable percentage and presets are grouped; Fit width is a separate preset or `W` shortcut. Ordinary wheel/trackpad gestures pan overflowing diagrams, returning note scrolling at an edge. Ctrl/Command-wheel zooms around the pointer; Shift-wheel pans horizontally. Left/middle dragging, keyboard panning and the direction pad remain available. `R` resets zoom, pan and automatic height.
- Hover emphasizes semantic elements and related endpoints where the native SVG exposes unambiguous IDs or metadata. Incoming/outgoing/bidirectional/undirected relations use distinct emphasis; native arrowheads, cardinalities and dashed/thick lines remain intact. Nongraph families use slices, tasks, cards, fields, series or local groups. Opaque renderer IDs get conservative local highlighting, never guessed relationships.
- Edit chart or double-click blank chart space to open the complete Mermaid source. Double-click a node to inspect only its text and attached relationships; uniquely mapped labels can be edited through checked source spans. Ambiguous or unsupported mappings remain read-only and offer explicit whole-chart editing. The source CodeMirror input highlights Mermaid syntax, has a wrap toggle, preserves indentation, and supports Tab, Shift-Tab and standard undo/redo. The editor uses Obsidian theme variables; its source body scrolls while its buttons remain outside that area, with sizing that follows the visual viewport.
- Save validates with native Mermaid before writing. The open draft survives replacement of its rendered SVG. Validation and write failures keep the draft editable for correction or retry, while plugin unload closes pending sessions. Reading view uses an atomic vault update against the captured file and exact note snapshot; Live Preview edits its owning CodeMirror document, including unsaved text and undo. Changed file identities, concurrent note changes, ambiguous source positions and edits that break the Markdown fence are refused.
- Copy source or image; save SVG, PNG, JPG and WebP. Menu actions use small icons and a temporary check only after confirmed success; errors, warnings and Save fallbacks remain visible. Clipboard denial is reported and exposes a Save fallback. Raster export is bounded to 8192 pixels per side and 16 megapixels, with any reduction reported. Unsupported HTML-label rendering/encoders offer SVG rather than claiming success.
- Every lightbox starts independently fitted. The same native SVG moves temporarily; IDs and direct listeners survive. Export creates a separate, sanitized styled snapshot; it never replaces the rendered diagram.
- Thin native lines have removable invisible hover targets, with a configurable width independent of zoom. Sequence lifelines include uniquely source-associated messages and notes; proximity alone never associates a note. Indexed adjacency and local highlight differences avoid scanning the entire chart on each pointer transition. Initial dimming and clearing still touch all indexed items.
- Settings offer none/grid/dots backgrounds, spacing, initial whole-chart/width fit, zoom increments, hover highlighting, line hit width and optional hints. Changes update existing viewers and future renders; manual zoom is preserved when changing backgrounds. Saved settings preserve unknown keys and refuse to overwrite unread or malformed data.
- Obsidian still owns Mermaid rendering, theme presentation and the note lifecycle. No extra Mermaid engine, external resource fetching, polling or automatic note edits are added. Source changes happen only after Save.

## Build

Node 22+ and npm:

```sh
npm ci --ignore-scripts
npm run build
```

Only `dist/main.js`, `dist/manifest.json` and `dist/styles.css` are runtime artifacts. Obsidian and CodeMirror are supplied by the host, not bundled. The demo's Mermaid dependency is development-only.

Source checkout belongs outside a vault, for example `~/repos/viewgram`. Installation uses `<vault>/.obsidian/plugins/viewgram/`. Settings are loaded and saved only in this namespace; the explicit helper above is the only supported migration from the confirmed `devguyrash-mermaid-viewer` installation. No settings migration runs automatically, and a build does not install or enable anything. Leave third-party `mermaid-viewer` folders, data and enabled state untouched. See [placement](docs/PLACEMENT.md).

## Releases and updates

Maintainers follow [RELEASING.md](RELEASING.md) to synchronize versions, build,
publish the matching GitHub Release and verify its downloaded runtime files.
Source pushes do not publish updates automatically. Obsidian users choose
**Community plugins → Check for updates → Update** or **Update all**; later
releases do not require another initial directory submission.

## Current status

Viewgram 0.1.0 has been built from the renamed source with the existing Node/esbuild script. The runtime manifest and MIT notices are verified during release preparation. No new test suite or native/mobile qualification was run for this rename; historical qualification below retains its original scope. Building or publishing a release does not install or enable it in a vault.

The pre-rename upgrade builds on main `c56fbe9`. Its completed qualification passed the plugin/demo build, TypeScript check, 145 Node checks, 38 development parser cases and all 64 browser cases. Eleven browser cases use the exact installed Mermaid 11.13 bundle as an isolated fixture; it is not shipped with the plugin. A subsequent scoped caret-color repair addresses an invisible black caret on dark source-editor backgrounds. Historical artifacts, focused repair evidence and qualification limits are recorded in [upgrade verification](docs/UPGRADE-VERIFICATION.md); those receipts do not qualify renamed artifacts.

Desktop qualification also passed inside Obsidian 1.14.4 in isolated synthetic vaults: all 36 required native diagram fixtures, 13 focused behavior cases and 12 extended cases. Reading and Live Preview exercised actual note writes, unsaved text and undo, invalid/stale-source refusal, gestures and pane sizing, default/Cyber Glow syntax colors, semantic hover, native downloads, OS clipboard readback, settings failure recovery and unload. The native runs exposed and resolved host settings error handling, legacy syntax-token highlighting and outer editor interference with Live Preview gestures. Native acceptance qualifies the built files; installation and enablement are separate operations. A sparse-chain SVG microprobe confirmed bounded local highlight mutations; it excludes paint and app latency. Mica, real mobile keyboards/touch, native relative links/popouts, embeds and full-app performance remain unqualified.

## Tests and demo

The test sources are included for continuity, but are not an automatic install/build hook.

```sh
npm run typecheck
npm test
npm run test:taxonomy
npm run test:browser
```

`npm run demo` serves the review harness at `http://127.0.0.1:4173`. The build also creates `demo/standalone.html`. Browser tests default to `/usr/bin/chromium`; set `CHROMIUM_PATH` when necessary.

The fixture matrix covers 24 recognized diagram families through 36 full-source variants, plus two diagnostic/layout cases and nine unsupported native families. Recognition, parsing, SVG output and viewer behavior are distinct. See [type matrix](docs/TYPE-MATRIX.md).

## Provenance and privacy

The viewport design was adapted from earlier code owned by the author.

Test diagrams and the minimal hostile-CSS fixture are synthetic.

## License

Copyright (c) 2026 DevGuyRash. Released under the [MIT License](LICENSE).
