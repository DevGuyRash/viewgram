# Implementation status

The viewer upgrade builds on the exact published main119b659 runtime. Source implementation, focused tests and builds are complete; native/browser acceptance and live installation remain separate. See [upgrade verification](UPGRADE-VERIFICATION.md) for provenance, evidence and limitations.

## Implemented

- Stable native SVG dimensions, horizontal initial fit, independent modal fit and zoom-preserving recenter.
- Pane-aware natural height, keyboard/pointer resize, grouped zoom presets, ordinary wheel panning, modifier zoom and middle-button dragging. Note scrolling resumes when the diagram cannot pan farther.
- Original SVG ownership, ID/listener preservation and per-render cleanup.
- View-owned Live Preview integration using public Obsidian state fields and host CodeMirror.
- Source-path refresh, Source-mode/unload guards and rejection of detached mutation entries.
- Native presentation context carried into inline/modal views only when present on the original immediate SVG parent.
- Narrow demo selector and event-driven first-paint readiness fixes.

- Semantic node/edge highlighting with exact-metadata connections and conservative local/group fallback.
- Native-parser-validated Mermaid source editing, stale/ambiguous-source refusal, and Live Preview undo integration.
- Styled SVG and bounded raster exports with truthful clipboard/error fallbacks.

## Still to establish

- Actual native Live Preview behavior across mode switches, edits, virtualization and unload/re-enable.
- Native dark/light filters and screenshots across inline/modal views and live theme changes.
- Updated browser suite and native geometry rerun.
- Mica, real mobile, native relative links, popouts, embeds and performance qualification.

Opaque renderer topology remains a documented limit. Fix any demonstrated source, lifecycle, geometry or export defect before qualifying installation.
