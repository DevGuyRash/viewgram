# Viewer interaction upgrade

## Source provenance

The recovered source snapshot was verified before import; all 122 manifest entries matched.

The imported source tree was reconstructed and verified against its recorded baseline. All runtime source files matched the earlier candidate; untouched test fixtures, documentation and build metadata were reconciled to that baseline.

The later upgrade patch applied cleanly to the verified baseline.

The reconciled branch retains the imported upgrade and original remote history, followed by focused source-target, gesture and semantic corrections through runtime commit `0652cc556e0f24264dd7c40f8b68ff96dd54bb1e`. Later editor/control corrections are described below; the historical commits and artifact hashes do not identify that newer runtime.

## Current semantic, source and viewer changes

This revision starts from published main `c56fbe9faf09e6dc2be83a2de0fc616d56549d70`. Primary Fit chart now contains the full SVG; width fit remains an explicit preset/shortcut. The bottom-right grip sizes the outer chart container and its viewport/footer together. A short-pane browser failure demonstrated that a minimum equal to the remaining viewport budget locked the grip; the corrected minimum leaves shrink room while keeping the outer 88% cap.

The source editor offers explicit whole-chart editing, blank-space double-click, host CodeMirror syntax highlighting and a wrap toggle. A node pane contains its text and attached source-indexed relationships, with exact checked spans for writable labels and explicit read-only fallback for ambiguity. Literal entities, punctuation, comments, CRLF and trailing blank lines are preserved. Native 11.13 accepts participant IDs such as `A|B` and `A&B`; unsupported composite IDs stay conservative rather than being split into false `A`/`B` relationships or writable aliases.

Semantic hover uses indexed adjacency, delegated events and local emphasis differences. Invisible line targets retain a configurable screen-pixel width. Real pointer tests exposed that SVG `non-scaling-stroke` did not counteract the viewer's HTML ancestor CSS transform: at 35% zoom a nominal 12-pixel target shrank to roughly one pixel beyond the native line. A shared SVG style property compensates for that scale in constant JavaScript work; active inline/modal paint supplies the scale. Native markers, geometry, filters and element/listener identities remain intact, and all owned hit-target geometry/properties are removed from exports.

Unique sequence source associations connect lifelines to messages and notes. A deliberately shifted `Note right of A` crossing actor B still associates with A, and `Note over A,C` does not invent actor B. Repeated/unsupported source or SVG identities remain unassociated. Source & export is an owned button/menu rather than details/summary, avoiding generic host decoration. Short accessible region labels use separate keyboard descriptions; initial action feedback is empty. Settings use public Obsidian APIs, update current/future viewers, preserve unknown keys and refuse to overwrite unread or malformed saved data.

Focused browser checks passed all eleven cases using an isolated copy of the installed Obsidian Mermaid 11.13.0 bundle, SHA-256 `6ef73c979e4636b0724eb3b4ee505e53e3a117e4cae31914ec5b2d64f27ff603`. It was read from the installed app archive without controlling or modifying Obsidian. Native fixture tests require `.local/native-renderer/mermaid-obsidian-11.13.min.js`; they explicitly skip when that ignored fixture is absent and verify its exact hash when present. The runtime plugin does not bundle this library. Development-renderer matrix checks remain a separate compatibility surface.

The final complete browser run passed 64/64 cases with no failures or skips. The final Node run passed 145/145 checks, including public settings read/save/coalescing/unload behavior, checked source mapping and native-style restoration. TypeScript and the whole plugin/demo build passed; the development taxonomy passed 38 parser cases. Existing browser coverage still decodes all four exported image formats, reads allowed clipboard copies back and checks denied/unavailable fallbacks. Keyword and string colors each met a 4.5:1 contrast check against the actual editor background in light and dark themes. The default light-editor palette exposed a visual defect on the dark background; highlighting now uses host code-color variables with readable viewer fallbacks. The installed host module registry explicitly supplies both `@codemirror/language` and `@lezer/highlight`, which remain external runtime dependencies.

The final browser report is `evidence/browser-results.json`. Earlier bundled-renderer receipts are under `evidence/semantic-native/`; directly inspected earlier node editor, highlighted source, full menu and short-pane captures are under `evidence/ui-v2/`. Current real-app qualification receipts and captures are under `evidence/native-obsidian/`. Generated evidence and host-library copies remain outside tracked source. No hosted CI run was started.

| Current built artifact | SHA-256 |
| --- | --- |
| `dist/main.js` | `4ee729dbb88e0e9229cf506c516eeb784e4c4665f3af0c0b15ffd337cae51c46` |
| `dist/styles.css` | `4de065aa03c914e7797ef27d8942706b57d55d9959e76984532f75863d3f9e08` |
| `dist/manifest.json` | `cc0005f2b3d7a1cc4310f7e06ae2410c52e0a4198383cd6435e91a7ca977aa8c` |
| `demo/standalone.html` | `d02253057f1f905d2e0ae73d442a1824af0ad332095cbf172e9d9dd27ecf9cf9` |

### Native desktop qualification, October 14

The actual plugin passed in Obsidian 1.14.4, Electron 43.7.9 and Chromium 150.0.7871.250, using the host's Mermaid and CodeMirror modules. The isolated launch pattern was informed by Mica's existing native E2E tooling. Each run used an owned Xvfb display, a fresh separate profile and a synthetic vault; it did not connect to the user's desktop or live vault. No sandbox-disabling launch option was added. The app and owned vault/profile were closed and removed afterward, while synthetic evidence was retained.

Native runs revealed three host-specific defects that standalone Chromium did not expose. Obsidian's settings API can resolve after failed reads/writes, so preferences now reject unread or non-object data and verify the saved file before admitting success; explicit retry rereads current data and preserves unknown keys. Its stream parser exposes legacy token names, so a public CodeMirror view plugin maps those names to the existing host theme colors over visible ranges. Live Preview's outer editable document previously blocked viewer input; interactive ancestor checks now stop at the owned SVG/viewer boundary while retaining native controls and links.

The Reading-view taxonomy run passed all 36 required fixtures through actual native parsing, SVG rendering, measurable geometry, native 100%/whole-chart fit and original SVG/note preservation. The unmeasurable `info` diagnostic correctly stayed unwrapped. The focused run passed 13 behavior cases, and the extended run passed 12. Both Reading and Live Preview saved the intended second fence, refused invalid and stale drafts without changing source, edited escaped node and relationship labels, and retained native rendering. Live Preview preserved an unsaved prefix and supported actual note undo. Real pointer/wheel/keyboard input verified wide/tall chart sizing within the 88% outer-pane cap, presets, scrolling, middle-button panning, resizing and blank-space source editing. Native family hover and source-grounded sequence notes passed; the same SVG survived lightbox movement.

The runs also verified default/Cyber Glow syntax colors, actual SVG/PNG/JPG/WebP downloads with decoded raster pixels, source and PNG readback from Electron's OS clipboard, the native settings window, unknown-key preservation across reload, refusal of malformed/non-object saved data, silent write failure and explicit retry, and unload cleanup. All three receipts report the current `dist/main.js` hash above and zero page errors. The focused receipt intentionally records the expected console errors from malformed-data and denied-write cases; these are evidence of tested refusal paths. Current screenshots were directly inspected. Mobile/touch, Mica coexistence, relative links/popouts, embeds, prolonged virtualization and full-app performance remain outside this desktop qualification.

Exact unmodified receipts are `evidence/native-obsidian/focused/receipt.json`, `evidence/native-obsidian/extended/receipt.json` and `evidence/native-obsidian/taxonomy/receipt.json`. A snapshot of the isolated runner is retained alongside them as local evidence, rather than added as a new repository test framework. The final whole build, TypeScript check, 145 Node checks, 38 development parser cases and 64 browser cases also passed after the native fixes. Hosted workflows remain manual-only and were not run.

### Large-chart handler probe

The checked-in probe compares `c56fbe9` with the current implementation on directed sparse chains of 100, 1,000 and 5,000 nodes, degree two, using three interleaved repetitions. It records construction, post-construction style/layout, first hover, clear, warmed handler samples, native identity and exact disposal restoration separately. Both implementations settle initial style/layout before first-hover timing; browser paint remains excluded. Native filter reads are batched before new highlight writes to avoid repeated synchronous style flushes inside the handler.

| Nodes | Previous/current handler p50, ms | Previous/current mutations per transition |
| --- | --- | --- |
| 100 | 0.6 / 0.1 | 436 / 71 |
| 1,000 | 6.2 / 0.1 | 4,036 / 71 |
| 5,000 | 38.2 / 0.2 | 20,036 / 71 |

These are medians across the three repetitions. At 5,000 nodes, previous/current construction measured 1,292.2/187.3 ms, initial style/layout 60.7/94.4 ms, first hover 26.6/20.8 ms and clear 19.0/19.0 ms. Wider proxies add SVG/style work even while indexing reduces construction and local transitions. The current unrelated final node received zero mutations during all warmed transitions; correctness, native identity and byte-exact disposal guards passed in every probe run.

Pointer transitions operate on indexed adjacency and affected containment context, so work follows the highlighted neighborhood rather than the whole chart. Group contexts can include many items. Initial dimming and clearing remain proportional to chart size; indexes, saved attributes and hit targets also grow with the SVG. This microprobe does not qualify Mermaid rendering time, memory limits, browser paint or native app latency. Its raw environment, samples and guards are in `evidence/semantic-native/performance-receipt.json`.

To repeat, serve the existing demo, prepare an ignored baseline bundle from `c56fbe9:src/viewer/semantics.ts` with esbuild using IIFE global name `SemanticBaseline`, output `.local/semantic-baseline.js`, then run `CHROMIUM_PATH=<installed-chromium> node scripts/probe-semantic-performance.mjs`. The probe uses that existing loopback server; it does not launch Obsidian. Remove the owned baseline entry and bundle afterward.

At the earlier browser-only checkpoint, native computer APIs were disabled and Agent Workspace tools were unavailable, so the branch remained a draft and the previous installation was preserved. The subsequent isolated native run above resolves the desktop scratch gate. Earlier browser source bridges remain synthetic and establish only their own scope; the native receipts separately establish actual host writes and Live Preview undo.

## Previous editor and control corrections

Save now belongs to an open source session independently of the SVG that originally opened it. Native render replacement retires that viewer without destroying its existing draft. Validation failure and asynchronous write failure retain the exact draft, show which stage failed, and restore editing for correction or retry. Checking and saving messages use neutral status styling; only an error receives error styling. A successful write closes the session, while plugin unload closes all sessions and prevents a save that is still awaiting validation from proceeding.

Reading view obtains native section metadata immediately before locating the block. Its issued snapshot retains the captured file identity and full document text; the atomic vault callback rechecks the active plugin, file identity/path and unchanged note before replacing only that block. Live Preview uses its owning CodeMirror document and file identity, preserving unsaved text and the note's undo history. Neither bridge depends on a replaced SVG when completing an already-open draft. Stale notes, changed files, unavailable or ambiguous positions, unissued snapshots and fence-breaking edits fail without selecting another block.

The source input uses the host CodeMirror packages, left-aligned monospace text, line wrapping and standard history commands. Enter preserves existing indentation and adds two spaces after supported block openers; Tab and Shift-Tab indent or outdent the selected lines. The dialog has one theme-owned surface and a scrolling body, with Cancel and Save outside that scrolling area. Its width, height and position follow visual-viewport resize/scroll events, and it requests measurement and visibility of the focused selection after resizing.

Viewer controls follow their parent width through a container query, so a narrow split pane can compact its controls even on a wide desktop. The five pan actions remain available in a single wrapping row. The resize minimum follows the actual pane budget, allowing useful dragging below 150 pixels in a short pane; a manually preferred height is restored after a temporary shrink. Touch targets, dynamic viewport units and bounded scrolling menus support smaller visible areas. Component-specific overflow rules preserve viewport clipping and menu/status scrolling under broad host styles, without changing native SVG presentation.

Source/export actions have small theme-colored icons. Confirmed success briefly replaces the action/summary icon with a check while an accessible live status announces the result. Each instance restores its original icon; latest-action tokens prevent older completions from replacing newer feedback. Warning, error and fallback messages stay visible, and a notice alone cannot trigger success styling.

At `c56fbe9`, the whole build and TypeScript check passed. The complete Node run passed 115 checks without failures or skips; the development taxonomy passed 38 parser cases, with recognition-only cases reported separately. The focused source-save browser cases passed 6/6 and the focused resize/control cases passed 5/5, followed by the complete browser run passing all 47 cases in 1.5 minutes without failures or skips. All four separate visual capture cases passed. These counts and hashes are historical.

| Previous `c56fbe9` local artifact | SHA-256 |
| --- | --- |
| `dist/main.js` | `15ce1b08e1ee21102cb015801dbb8a29072f7f39e8240223255f9ac3f358b38c` |
| `dist/styles.css` | `8f1527810e2816d2307db786c6f5ba86b3fe149a6f68da69228d2a7c24db7353` |
| `dist/manifest.json` | `cc0005f2b3d7a1cc4310f7e06ae2410c52e0a4198383cd6435e91a7ca977aa8c` |
| `demo/standalone.html` | `f4d7c3398b13f1a63c0859dfb7a2cea27643a5c0250f6b35237e74580e6b4d41` |

At that checkpoint, native Obsidian qualification remained unrun. A prior namespaced build had been installed at the owner's explicit request; that installation did not establish native QA or qualify the newer revision.

## Historical artifact identity before the namespace change

This historical local build used plugin ID `mermaid-viewer` and runtime commit `0652cc556e0f24264dd7c40f8b68ff96dd54bb1e`. Its SHA-256 values preserve the pre-namespace provenance; the current manifest identity is recorded below. Recording artifacts does not install or release them.

| Local artifact | SHA-256 |
| --- | --- |
| `dist/main.js` | `5b86f1d797164d4d00c5511800201cc5fab4b22a1cdb0de6c48693fc403403f1` |
| `dist/styles.css` | `f09be4f8c7488d4a351547a6f08a8122e2e5108a2de2d17e77746932e8752651` |
| `dist/manifest.json` | `e56c023dc84f7a422f8ff1124987348634e7f7940219ce4fa28fdba156fc023e` |
| `demo/standalone.html` | `ee66478dc827f65e4cae804bbe7dd9f74ea848904b34fa83bdd80a4f239f63e3` |

## Historical namespaced identity and staging checks

The namespace-only checkpoint changed the plugin ID from `mermaid-viewer` to `devguyrash-mermaid-viewer` while retaining display name Mermaid Viewer, author DevGuyRash and version 0.1.0. Its `dist/manifest.json` SHA-256 was `cc0005f2b3d7a1cc4310f7e06ae2410c52e0a4198383cd6435e91a7ca977aa8c`. At that checkpoint only, runtime JavaScript, CSS and the standalone demo were byte-identical to the historical hashes above. The later editor/control correction changes those runtime artifacts.

After the identity and scratch guard changes, `npm run build`, `npm run typecheck` and `npm test` passed (99 tests). Five focused CLI groups used owned synthetic temporary fixtures: stage only the new-ID artifacts without enablement or migration; refuse stale built ID/name/author/version; refuse unsafe IDs; preserve sentinel data when existing or nested vault targets are refused; and reject symlink aliases into a vault, including paths with missing intermediate parents. Every refusal occurred before target creation.

A separate smoke staged that repository build and synthetic acceptance fixtures into a new owned temporary directory. The three staged artifact hashes matched that build, only `devguyrash-mermaid-viewer` existed under the plugin directory, and no old-ID folder, `data.json` or enabled-plugin list was created. All owned test and smoke directories were removed. Those historical staging checks did not modify a real or prior scratch vault; the later explicitly requested installation is recorded separately above.

## Historical focused checks

Before the namespace and later editor/control corrections, local validation on 2026-10-13 passed `npm run build`, `npm run typecheck`, `npm test` (94 tests), and `npm run test:taxonomy` (38 development parser cases, with recognition-only cases reported separately).

- TypeScript typecheck and both plugin/demo builds
- Existing viewport ownership, independent modal state, cleanup, theme preservation and Live Preview lifecycle emulation
- New natural-height/resize, wheel/modifier navigation and preset/middle-drag behavior checks
- Source fence selection, CRLF preservation, ambiguous/stale-edit refusal and special-character label escaping
- Source dialog validation failure, repeat opening, cancellation and disposal during an awaited save
- Semantic direction/grouping and exact native SVG/listener preservation
- Portable SVG snapshot, unsafe-resource rejection, raster size/format contracts and honest clipboard fallback behavior
- Complete node declaration boundaries, current source ranges, sequence open/cross direction, undirected self-loops, duplicate edge-label IDs, explicit native line thickness and repeated pie-color ambiguity

These use the existing Node test runner and Happy DOM. Canvas/clipboard doubles verify contracts, not real pixels or OS clipboard behavior. A separate temporary public-API probe passed four Reading-view bridge cases: a retained SVG moving from line 4 to 8 during an awaited read, a concurrent document change, a detached SVG and a section spanning multiple blocks. The probe used explicit Obsidian context/vault doubles; it does not prove native atomic processing. No new test framework was added.

## Historical local browser evidence

The earlier browser harness used Playwright 1.56.1, Chromium 153.0.8010.12 and development Mermaid 11.17.2. The full suite exercised 36 cases: 35 passed and one exposed the native pie hex/RGB color mismatch. After that scoped correction, both affected semantic cases passed with no failures, skips or flaky results. The other 35 passing cases were retained; a second complete 36-case run at that checkpoint is not claimed. These results precede the current editor/control correction.

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

## Previous browser and visual check scope

Current browser validation used Playwright 1.56.1 and Chromium 153.0.8010.12. The complete current report is `evidence/browser-results-editor-controls-47.json`; generated evidence remains outside tracked source. The focused source-save browser cases exercise actual CodeMirror input and real SVG DOM replacement with explicit synthetic note/validation/write operations. They cover parser rejection after replacement, asynchronous write failure and retry, repeated open/cancel cleanup, unload while validation is pending, smart indentation and standard undo/redo, and a narrow editor whose available height contracts while the last caret remains visible. These operations do not prove native vault processing.

The focused control cases exercise real mouse and Chromium touch input in a short narrow parent, keyboard reset, restoration of manual height after parent shrink/expansion, keyboard access through a bounded scrolling presets menu, transient confirmed feedback, and persistent denied-copy fallback. Separate light/dark captures verify 16-pixel icons, left-aligned editor text and matching input/dialog backgrounds. In a 300 × 260 synthetic pane, a real drag changed chart height from 72 to 52 pixels, with the complete viewer remaining below the 88% pane cap. The opened menu stayed within the parent and visible viewport and retained scrolling.

A separate simulated visual-viewport-only keyboard contraction kept the layout viewport at 390 × 844 while reducing the visible band to 300 pixels with a 300-pixel vertical offset. The editor occupied vertical coordinates 316–584 and its action buttons 535–571, inside that visible band. This verifies the viewport-event layout path; it is not evidence for a real mobile keyboard or an Obsidian mobile host.

## Earlier native acceptance gap and checklist

The earlier cloud Chromium attempt failed at socket creation with `Operation not permitted`. Local Chromium validation resolved that browser limitation; the October 14 isolated native desktop run above subsequently resolved the desktop app gap. A prior namespaced build had been installed by explicit user request before native QA. Development Mermaid 11.17.2 does not establish compatibility with Obsidian's installed renderer; the current native receipts establish their own host scope. The original checklist below also names mobile and larger workspace scenarios that remain unqualified:

1. Reading and Live Preview: double-click a flowchart label containing quotes, brackets, Unicode and markup-like text; save, inspect actual note bytes, verify native rerender and Live Preview undo. Repeat with sequence, class, state, ER and chart elements using full-source editing. Replace a render while validation or writing is pending; rejection must keep the exact draft editable, and a corrected retry must update only its intended block. Invalid source must leave the note unchanged. A simultaneous note edit or changed file identity must refuse stale writes.
2. Verify pane-relative natural height, primary whole-chart fit, separate width fit, bottom-right outer-container dragging, keyboard resize, zoom presets and ordinary/modifier wheel behavior; include short narrow panes, parent-only vertical resizing and restoration of a preferred manual height. Check the actual theme/snippet environment for overflow, menu decoration and tooltips. Check touch input and real mobile keyboard contraction, including the focused caret, action buttons and keyboard access to scrolling menus.
3. Hover nodes and edges in both views at several zoom levels, including the same original SVG moving into/out of a lightbox. Check widened line areas, direction, native filters and line/cardinality treatment. Sequence notes must follow source identities rather than nearby actors. Where SVG metadata is absent or ambiguous, expect local/group emphasis rather than invented connections.
4. Save SVG/PNG/JPG/WebP with HTML labels and native light/dark filters. Check full native dimensions, clipping, colors and readable labels. Test clipboard allowed, unavailable and denied; a failed copy must never show success.
5. Close/cancel repeatedly, rerender or switch files during an edit, disable the plugin with dialogs open, and verify no orphan dialogs or restored obsolete SVGs.
6. Verify settings on current/future diagrams and across plugin reload: background/spacing, initial fit, zoom steps, hover enablement/width and hints. Preserve unknown saved keys, refuse failed/malformed reads, drain only admitted writes during unload and keep manual zoom when changing backgrounds.

Native types unsupported by Obsidian remain unsupported. This plugin augments whatever the host renders; it does not introduce another Mermaid engine.
