# Mermaid Viewer

Private source for an Obsidian plugin that adds native-scale navigation, semantic interaction, source editing and image export to existing Mermaid SVGs.

Plugin ID: `mermaid-viewer`. Repository name: `obsidian-mermaid-viewer`.

## Implementation

- Inline diagrams grow to their natural width-fitted height, capped near 88% of the visible pane including controls. A bottom-right handle changes height; arrow keys resize and Home restores automatic sizing.
- Fit, native `100%`, minus/plus, editable percentage and presets are grouped. Ordinary wheel/trackpad gestures pan overflowing diagrams, returning note scrolling at an edge. Ctrl/Command-wheel zooms around the pointer; Shift-wheel pans horizontally. Left/middle dragging, keyboard panning and the direction pad remain available.
- Hover emphasizes semantic elements and related endpoints where the native SVG exposes unambiguous IDs or metadata. Incoming/outgoing/bidirectional/undirected relations use distinct emphasis; native arrowheads, cardinalities and dashed/thick lines remain intact. Nongraph families use slices, tasks, cards, fields, series or local groups. Opaque renderer IDs get conservative local highlighting, never guessed relationships.
- Double-click an element to edit the actual Mermaid block, or use Source & export. Identifiable flowchart/block node labels have an escaped label editor; other elements open the full source with an unambiguous matching text selection when available. Native Mermaid validates before saving. Reading view uses atomic vault updates; Live Preview edits its owning CodeMirror document, including undo. Concurrent note changes, ambiguous source positions and Markdown fences are rejected.
- Copy source or image; save SVG, PNG, JPG and WebP. Clipboard denial is reported and exposes a Save fallback. Raster export is bounded to 8192 pixels per side and 16 megapixels, with any reduction reported. Unsupported HTML-label rendering/encoders offer SVG rather than claiming success.
- Every lightbox starts independently fitted. The same native SVG moves temporarily; IDs and direct listeners survive. Export creates a separate, sanitized styled snapshot; it never replaces the rendered diagram.
- Obsidian still owns Mermaid rendering, theme presentation and the note lifecycle. No extra Mermaid engine, external resource fetching, polling, persistent settings or automatic note edits are added. Source changes happen only after Save.

## Build

Node 22+ and npm:

```sh
npm ci --ignore-scripts
npm run build
```

Only `dist/main.js`, `dist/manifest.json` and `dist/styles.css` are runtime artifacts. Obsidian and CodeMirror are supplied by the host, not bundled. The demo's Mermaid dependency is development-only.

Source checkout belongs outside a vault. The later plugin destination is `<vault>/.obsidian/plugins/mermaid-viewer/`; preserve any `data.json`. A build does not install or enable anything. See [placement](docs/PLACEMENT.md).

## Current status

The upgrade is implemented against the exact published `119b659a5097336d0cb4305faeb7d3250c53ebed` source tree and the verified Library v2 checkpoint. Local validation passed 94 Node checks, TypeScript, plugin/demo builds and the development parser taxonomy. All 36 browser cases have passing evidence across the full run and the affected semantic rerun. The exact results and runtime are recorded in [upgrade verification](docs/UPGRADE-VERIFICATION.md).

Chromium verified gestures, source editing in the demo, semantic hover, decoded SVG/PNG/JPG/WebP label pixels, and allowed clipboard readback. Native Obsidian scratch qualification remains pending, including actual note writes, Live Preview undo, renderer compatibility and host lifecycle behavior. Mica compatibility, real mobile, native relative links/popouts, embeds and performance remain unqualified. No real vault has been updated.

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

The viewport design was privately adapted from the owner's `mermaid-renderer.js` v1.0.4. Its original SHA-256 is `ec916b6fffa2c07762f074b888c477288d47e490e536f9952a58f8d122d54767`.

The original private userscript snapshot, vault snippets, vault conventions, personal paths, raw acceptance archives and transfer metadata are not included in this repository. Test diagrams and the minimal hostile-CSS fixture are synthetic. No open-source license is granted or inferred.
