# Viewer interaction upgrade

## Source provenance

The cloud filesystem was replaced during work. The initial recovery used the complete Oct 8 candidate-v2 Library archive (SHA-256 `b9e5d5dc6dcec79be87615bacb568ee6e46290de690131b3aa6850a6bb728264`); all 122 manifest entries matched.

The later source-only transfer contains exactly published commit `119b659a5097336d0cb4305faeb7d3250c53ebed`, tree `3a1dc688add20cbc5c83b311c1c2ce01498f0415`. Its archive SHA-256 is `1f231f8b2fb68988d0765208a019162d9c89c9922b1f5ae39e96d6f162e56b4c`. Recreating its Git tree reproduced that tree hash. All runtime source files matched the earlier candidate; untouched test fixtures, documentation and build metadata were reconciled to the exact published baseline.

Local recovery commit IDs are checkpoints, not the original remote commit history. The delivered patch targets the verified published tree. Remote branch reconciliation and normal review are still required before merging.

## Focused checks

Final local Node run: 87 tests passed; TypeScript and plugin/demo builds passed. The three new focused browser flows are checked in under `tests/browser/upgrade.spec.ts` but have not run.

- TypeScript typecheck and both plugin/demo builds
- Existing viewport ownership, independent modal state, cleanup, theme preservation and Live Preview lifecycle emulation
- New natural-height/resize, wheel/modifier navigation and preset/middle-drag behavior checks
- Source fence selection, CRLF preservation, ambiguous/stale-edit refusal and special-character label escaping
- Source dialog validation failure, repeat opening, cancellation and disposal during an awaited save
- Semantic direction/grouping and exact native SVG/listener preservation
- Portable SVG snapshot, unsafe-resource rejection, raster size/format contracts and honest clipboard fallback behavior

These use the existing Node test runner and Happy DOM. Canvas/clipboard doubles verify contracts, not real pixels or OS clipboard behavior. No new test framework was added.

## Native/browser acceptance still required

Cloud Chromium failed at socket creation with `Operation not permitted`; no passing UI result is claimed. Verify the built revision in an isolated Obsidian scratch vault before installing into a real vault:

1. Reading and Live Preview: double-click a flowchart label containing quotes, brackets, Unicode and markup-like text; save, inspect actual note bytes, verify native rerender and Live Preview undo. Repeat with sequence, class, state, ER and chart elements using full-source editing. Invalid source must leave the note unchanged. A simultaneous edit must refuse stale writes.
2. Verify pane-relative natural height, bottom-right dragging, keyboard resize, zoom presets and ordinary/modifier wheel behavior; include narrow panes and parent-only vertical resizing.
3. Hover nodes and edges in both views. Check direction and native line/cardinality treatment. Where SVG metadata is absent or ambiguous, expect local/group emphasis rather than invented connections.
4. Save SVG/PNG/JPG/WebP with HTML labels and native light/dark filters. Check full native dimensions, clipping, colors and readable labels. Test clipboard allowed, unavailable and denied; a failed copy must never show success.
5. Close/cancel repeatedly, rerender or switch files during an edit, disable the plugin with dialogs open, and verify no orphan dialogs or restored obsolete SVGs.

Native types unsupported by Obsidian remain unsupported. This plugin augments whatever the host renders; it does not introduce another Mermaid engine.
