# Mermaid Viewer

Private source for an Obsidian plugin that adds native-scale navigation, semantic interaction, source editing and image export to existing Mermaid SVGs.

Plugin ID: `devguyrash-mermaid-viewer` (formerly `mermaid-viewer`). Display name: Mermaid Viewer. Author: DevGuyRash. Repository and npm package name: `obsidian-mermaid-viewer`.

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

Source checkout belongs outside a vault. Installation uses `<vault>/.obsidian/plugins/devguyrash-mermaid-viewer/`. The ID change does not rename or copy an old `mermaid-viewer` folder, its data or its enabled state. Settings are loaded and saved only in this plugin's namespace; no legacy settings migration runs automatically. A build does not install or enable anything. See [placement](docs/PLACEMENT.md).

## Current status

The upgrade builds on main `c56fbe9`. The current plugin/demo build, TypeScript check, 145 Node checks, 38 development parser cases and all 64 browser cases passed. Eleven browser cases use the exact installed Mermaid 11.13 bundle as an isolated fixture; it is not shipped with the plugin. Source highlighting passed dark/light contrast checks. Current artifacts, evidence and qualification limits are recorded in [upgrade verification](docs/UPGRADE-VERIFICATION.md).

Chromium verified gestures, scoped source editing, semantic hover, decoded SVG/PNG/JPG/WebP label pixels and allowed clipboard readback. A sparse-chain SVG microprobe confirmed bounded local highlight mutations; it excludes paint and app latency. This revision remains in a draft PR and is not installed. Native Obsidian qualification remains unrun, including actual note writes, Live Preview undo, pane sizing, theme collisions and host lifecycle behavior. The prior installation and enabled state are preserved. Mica, real mobile keyboards, native relative links/popouts, embeds and full-app performance remain unqualified.

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

Test diagrams and the minimal hostile-CSS fixture are synthetic. No open-source license is granted or inferred.
