# Mermaid Viewer

Private source for an Obsidian plugin that adds native-scale zoom, drag panning and an independently fitted lightbox to existing Mermaid SVGs.

Plugin ID: `mermaid-viewer`. Repository name: `obsidian-mermaid-viewer`.

## Implementation

- Inline diagrams initially fit horizontally; tall diagrams may overflow vertically.
- `100%` means native SVG viewBox size, not the responsive fitted baseline.
- Editable percentage, plus/minus, keyboard controls, grab/drag and a bottom-right four-arrow pad with geometric recenter.
- Every lightbox starts with the whole diagram fitted, independently of the inline viewport.
- The original SVG is moved temporarily, never cloned or rerendered. IDs and direct listeners survive.
- Reading view uses component-owned Markdown postprocessing; Live Preview uses a CodeMirror ViewPlugin with per-editor lifecycle and source-path tracking.
- Native Mermaid parent styling is preserved in inline/modal views without hardcoding filters or overriding explicit SVG filters.
- No extra Mermaid engine, network requests, polling, note-source writes or persistent settings in the plugin.

## Build

Node 22+ and npm:

```sh
npm ci --ignore-scripts
npm run build
```

Only `dist/main.js`, `dist/manifest.json` and `dist/styles.css` are runtime artifacts. Obsidian and CodeMirror are supplied by the host, not bundled. The demo's Mermaid dependency is development-only.

Source checkout belongs outside a vault. The later plugin destination is `<vault>/.obsidian/plugins/mermaid-viewer/`; preserve any `data.json`. A build does not install or enable anything. See [placement](docs/PLACEMENT.md).

## Current status

This repository preserves the implementation from the private v2 candidate. The latest work is source setup and implementation first; unit/integration tests have not been rerun for this publication.

Earlier evidence on the preceding candidate covered 38 native parser/render cases and 37 Reading-view viewport cases. It found two blockers, now addressed in source: Live Preview attachment and native dark-mode presentation. Those fixes still need their affected native/UI rerun. Prior checks are historical evidence, not acceptance of this checkout.

Mica compatibility, real mobile, native relative links/popouts, embeds and performance remain unqualified. No live rollout is implied. See [remaining acceptance](docs/ACCEPTANCE.md) and [implementation status](docs/IMPLEMENTATION.md).

## Tests and demo, for the later validation phase

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
