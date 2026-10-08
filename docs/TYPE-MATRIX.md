# Diagram-type matrix

The historical native baseline is Obsidian 1.14.4 with patched Mermaid 11.13.0. The development-only fixture renderer is pinned to Mermaid 11.17.2. These are different environments and their results are not interchangeable.

`fixtures/taxonomy.json` records:

- 36 complete cases spanning 24 native-recognized families, including aliases and all five C4 variants
- 2 separate diagnostic/layout cases: `info` and `flowchart-elk`
- 12 starter-only probes for 9 unsupported native families

For each case, distinguish recognition, parsing, original SVG output, viewer behavior and visual comparison. Parser success does not establish typography, semantics or native viewer behavior.

The matrix is bounded to the documented Mermaid taxonomy captured at revision `69778e6e995cd72c6cb524449d8e08ee3d231628`, not all future diagram types. `error` and `---` are internal sentinels, not diagram families.

The checked-in `tests/fixtures` data is a reduced historical registry/parser baseline without private acceptance logs. It supports fixture-coverage assertions; it is not a fresh acceptance result. Current matrix native/viewer fields remain conservative pending the later validation phase.

The demo offers original rendering, viewer attachment and separate per-stage results. The scratch helper creates synthetic notes for the same complete cases.
