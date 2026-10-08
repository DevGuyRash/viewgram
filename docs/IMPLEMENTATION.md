# Implementation status

The complete private v2 runtime source is preserved byte-for-byte in `src/` for this source publication. No feature work, test execution, dependency update, live installation or vault modification is part of this publication step.

## Implemented

- Stable native SVG dimensions, horizontal initial fit, independent modal fit and zoom-preserving recenter.
- Mouse, keyboard and touch behavior with ordinary page scrolling preserved in fit mode.
- Original SVG ownership, ID/listener preservation and per-render cleanup.
- View-owned Live Preview integration using public Obsidian state fields and host CodeMirror.
- Source-path refresh, Source-mode/unload guards and rejection of detached mutation entries.
- Native presentation context carried into inline/modal views only when present on the original immediate SVG parent.
- Narrow demo selector and event-driven first-paint readiness fixes.

## Still to establish after implementation/source setup

- Actual native Live Preview behavior across mode switches, edits, virtualization and unload/re-enable.
- Native dark/light filters and screenshots across inline/modal views and live theme changes.
- Updated browser suite and native geometry rerun.
- Mica, real mobile, native relative links, popouts, embeds and performance qualification.

No additional feature has been identified as required before that validation phase. If validation finds another implementation defect, address it within this existing scope.
