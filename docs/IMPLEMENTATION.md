# Implementation status

The current viewer builds on published main `c56fbe9`. It augments Obsidian's existing SVG and source lifecycle. Exact checks, artifact identities and native qualification limits are recorded in [upgrade verification](UPGRADE-VERIFICATION.md).

## Implemented

- Primary whole-chart fit, separate width fit, native 100%, grouped zoom controls and presets, ordinary wheel panning, modifier zoom, middle-button dragging and keyboard navigation.
- Pane-relative natural expansion and an outer-container bottom-right grip. The viewport, footer and grip move together within the 88% pane budget. Short-pane minimums leave room to shrink; a preferred manual height returns after temporary contraction.
- Theme-variable controls, an owned Source & export menu, short accessible region names, optional hints and initially empty action feedback. Component styling avoids generic details/summary decoration while retaining host SVG presentation.
- Explicit whole-chart editing, blank-space double-click, syntax-highlighted host CodeMirror source and a wrap toggle. Node editing shows its text and indexed attached relationships. Checked source spans preserve untouched bytes; unsupported or ambiguous mappings stay read-only.
- Native parser validation before explicit saves, exact issued-source/file checks, atomic Reading-view writes, owning-document Live Preview changes and undo, and drafts retained across render replacement or save failures.
- Indexed semantic relationships, delegated hover and local emphasis differences. Removable invisible line targets maintain their configured screen-pixel width through inline and modal CSS zoom. Initial dimming and clear remain proportional to the chart size.
- Sequence lifeline associations grounded in unique source actors, messages and notes. Nearby actors, opaque IDs, repeated labels and unsupported composite IDs do not supply guessed relationships. Native filters, markers, line styles and original element/listener identities survive emphasis and disposal.
- Sanitized styled SVG snapshots and bounded PNG/JPG/WebP export, truthful clipboard results and visible download fallbacks. Owned hit-target geometry and style properties are removed from exports.
- Public Obsidian settings for background, spacing, initial fit, zoom step, hover highlighting, line hover width and hints. Updates reach current and future viewers; saved data preserves unknown keys, retries failed reads before saving and refuses malformed data.

## Still to establish

- Native Obsidian scratch UI acceptance: actual outer-pane sizing, host theme behavior, Reading-view note writes, Live Preview undo, mode changes, virtualization, unload/re-enable and clipboard/export integration.
- Mica, real mobile keyboards/touch, native relative links, popouts and embeds.
- Full native-app performance. The isolated SVG microprobe establishes handler work and mutation counts only; it excludes paint and host latency.

The standalone browser can use the exact installed Mermaid bundle as a development fixture. That fixture does not load the plugin into Obsidian or qualify a real-vault update. Preserve the existing installation and enabled state until the native scratch gate passes.
