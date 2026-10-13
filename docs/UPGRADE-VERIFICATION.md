# Viewer interaction upgrade

## Source provenance

The cloud filesystem was replaced during work. The initial recovery used the complete Oct 8 candidate-v2 Library archive (SHA-256 `b9e5d5dc6dcec79be87615bacb568ee6e46290de690131b3aa6850a6bb728264`); all 122 manifest entries matched.

The later source-only transfer contains exactly published commit `119b659a5097336d0cb4305faeb7d3250c53ebed`, tree `3a1dc688add20cbc5c83b311c1c2ce01498f0415`. Its archive SHA-256 is `1f231f8b2fb68988d0765208a019162d9c89c9922b1f5ae39e96d6f162e56b4c`. Recreating its Git tree reproduced that tree hash. All runtime source files matched the earlier candidate; untouched test fixtures, documentation and build metadata were reconciled to the exact published baseline.

The locally imported upgrade is Library file `libfile_df27ed60a8e08191b1b411e3b3d69480`, version 2, archive `mermaid-viewer-upgrade-checkpoint-20261013.zip`, SHA-256 `0cb22a02b61fce17c31441b8c6a62929368ec50405d64c9bbf06e8b7e53025c9`. Its recorded cloud checkpoint is `b98f520edb8e635741f3ed3c1b9527d4f36d3193`; the patch applied cleanly to the exact published baseline.

The reconciled branch uses the original remote history. Signed import checkpoint `07449d34f8471c3a3434e4b704b84fe6457a1000` preserves v2, followed by focused source-target, gesture and semantic corrections through runtime commit `0652cc556e0f24264dd7c40f8b68ff96dd54bb1e`. Historical cloud recovery commits identify checkpoints rather than the original remote history. Source merge can retain the disclosed unrun native verification limits; native scratch qualification remains mandatory before real-vault installation.

## Historical artifact identity before the namespace change

This historical local build used plugin ID `mermaid-viewer` and runtime commit `0652cc556e0f24264dd7c40f8b68ff96dd54bb1e`. Its SHA-256 values preserve the pre-namespace provenance; the current manifest identity is recorded below. Recording artifacts does not install or release them.

| Local artifact | SHA-256 |
| --- | --- |
| `dist/main.js` | `5b86f1d797164d4d00c5511800201cc5fab4b22a1cdb0de6c48693fc403403f1` |
| `dist/styles.css` | `f09be4f8c7488d4a351547a6f08a8122e2e5108a2de2d17e77746932e8752651` |
| `dist/manifest.json` | `e56c023dc84f7a422f8ff1124987348634e7f7940219ce4fa28fdba156fc023e` |
| `demo/standalone.html` | `ee66478dc827f65e4cae804bbe7dd9f74ea848904b34fa83bdd80a4f239f63e3` |

## Namespaced identity and staging checks

The plugin ID changed from `mermaid-viewer` to `devguyrash-mermaid-viewer` while retaining display name Mermaid Viewer, author DevGuyRash and version 0.1.0. The current `dist/manifest.json` SHA-256 is `cc0005f2b3d7a1cc4310f7e06ae2410c52e0a4198383cd6435e91a7ca977aa8c`. Runtime JavaScript, CSS and the standalone demo remain byte-identical to the historical hashes above, retaining the prior browser evidence.

After the identity and scratch guard changes, `npm run build`, `npm run typecheck` and `npm test` passed (99 tests). Five focused CLI groups use owned synthetic `/tmp` fixtures: stage only the new-ID artifacts without enablement or migration; refuse stale built ID/name/author/version; refuse unsafe IDs; preserve sentinel data when existing or nested vault targets are refused; and reject symlink aliases into a vault, including paths with missing intermediate parents. Every refusal occurs before target creation.

A separate smoke staged the actual repository build and synthetic acceptance fixtures into a new owned `/tmp` directory. The three staged artifact hashes matched the current build, only `devguyrash-mermaid-viewer` existed under the plugin directory, and no old-ID folder, `data.json` or enabled-plugin list was created. All owned test and smoke directories were removed. No real or prior scratch vault was modified; native scratch qualification remains unrun.

## Focused checks

Local validation on 2026-10-13 passed `npm run build`, `npm run typecheck`, `npm test` (94 tests), and `npm run test:taxonomy` (38 development parser cases, with recognition-only cases reported separately).

- TypeScript typecheck and both plugin/demo builds
- Existing viewport ownership, independent modal state, cleanup, theme preservation and Live Preview lifecycle emulation
- New natural-height/resize, wheel/modifier navigation and preset/middle-drag behavior checks
- Source fence selection, CRLF preservation, ambiguous/stale-edit refusal and special-character label escaping
- Source dialog validation failure, repeat opening, cancellation and disposal during an awaited save
- Semantic direction/grouping and exact native SVG/listener preservation
- Portable SVG snapshot, unsafe-resource rejection, raster size/format contracts and honest clipboard fallback behavior
- Complete node declaration boundaries, current source ranges, sequence open/cross direction, undirected self-loops, duplicate edge-label IDs, explicit native line thickness and repeated pie-color ambiguity

These use the existing Node test runner and Happy DOM. Canvas/clipboard doubles verify contracts, not real pixels or OS clipboard behavior. A separate temporary public-API probe passed four Reading-view bridge cases: a retained SVG moving from line 4 to 8 during an awaited read, a concurrent document change, a detached SVG and a section spanning multiple blocks. The probe used explicit Obsidian context/vault doubles; it does not prove native atomic processing. No new test framework was added.

## Local browser evidence

The browser harness used Playwright 1.56.1, Chromium 153.0.8010.12 and development Mermaid 11.17.2. The full suite exercised 36 cases: 35 passed and one exposed the native pie hex/RGB color mismatch. After that scoped correction, both affected semantic cases passed with no failures, skips or flaky results. The other 35 passing cases were retained; a second complete 36-case run is not claimed.

The checked-in cases under `tests/browser/` cover natural height, keyboard and actual pointer resizing, parent-only pane height changes, presets, real wheel/modifier input, middle dragging from a native SVG link, semantic hover, escaped label editing and invalid-source refusal. Actual dragging grew a viewport from 185 to 385 pixels; shrinking only its pane from 1000 to 550 pixels kept the viewer within the 88% cap plus a three-pixel measurement allowance.

Flowchart, class, ER, state, sequence and pie hover were exercised against actual development-renderer SVGs. State edges with opaque IDs retain local emphasis rather than invented adjacency. Sequence open/cross endings retain direction, and uniquely resolved pie colors connect the native slice and legend.

All four exported formats decoded with visible HTML-label pixels in light and simulated native dark-filter contexts; the native SVG identity and bytes remained intact. The eight light/dark files decoded at 2446 × 732 pixels from a native viewBox of 2446 × 732.4375; JPG output was opaque. Allowed PNG and source copies were read back from the real Chromium clipboard. Deterministic unavailable/denied clipboard cases exposed explicit download fallbacks and reported no copy.

With `CHROMIUM_PATH` set to the installed Chromium, the browser commands were:

```sh
npm run test:browser -- --max-failures=0
npm run test:browser -- --grep 'clicking the resize handle|rendered flowchart' --max-failures=0
npm run test:browser -- tests/browser/semantic-hover.spec.ts --max-failures=0
npm run typecheck
```

Generated local evidence is kept outside tracked source: `evidence/browser-results-full-36.json`, `evidence/browser-results-focused-2.json` and `evidence/browser-results-semantic-final.json` preserve the full, targeted and final affected reports. Screenshots, `evidence/semantic-hover-receipt.json`, `evidence/sequence-open-cross-receipt.json`, and `evidence/exports/` contain hover and decoded image receipts. Browser tests can be repeated using an installed Chromium as described in the README.

## Native Obsidian acceptance still required

The earlier cloud Chromium attempt failed at socket creation with `Operation not permitted`. Local Chromium validation above resolves that browser limitation. Native Obsidian UI control was unavailable in the local session, so its scratch vault and the real vault remain unchanged. Development Mermaid 11.17.2 is not evidence for Obsidian’s installed Mermaid 11.13 renderer. Verify the built revision in an isolated Obsidian scratch vault before installing into a real vault:

1. Reading and Live Preview: double-click a flowchart label containing quotes, brackets, Unicode and markup-like text; save, inspect actual note bytes, verify native rerender and Live Preview undo. Repeat with sequence, class, state, ER and chart elements using full-source editing. Invalid source must leave the note unchanged. A simultaneous edit must refuse stale writes.
2. Verify pane-relative natural height, bottom-right dragging, keyboard resize, zoom presets and ordinary/modifier wheel behavior; include narrow panes and parent-only vertical resizing.
3. Hover nodes and edges in both views. Check direction and native line/cardinality treatment. Where SVG metadata is absent or ambiguous, expect local/group emphasis rather than invented connections.
4. Save SVG/PNG/JPG/WebP with HTML labels and native light/dark filters. Check full native dimensions, clipping, colors and readable labels. Test clipboard allowed, unavailable and denied; a failed copy must never show success.
5. Close/cancel repeatedly, rerender or switch files during an edit, disable the plugin with dialogs open, and verify no orphan dialogs or restored obsolete SVGs.

Native types unsupported by Obsidian remain unsupported. This plugin augments whatever the host renders; it does not introduce another Mermaid engine.
