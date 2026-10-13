# Viewer interaction upgrade

## Source provenance

The recovered source snapshot was verified before import; all 122 manifest entries matched.

The imported source tree was reconstructed and verified against its recorded baseline. All runtime source files matched the earlier candidate; untouched test fixtures, documentation and build metadata were reconciled to that baseline.

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
