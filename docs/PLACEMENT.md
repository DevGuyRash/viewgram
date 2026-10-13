# Source and runtime placement

- Keep source in a standalone checkout, such as `~/repos/obsidian-mermaid-viewer`.
- Build into that checkout's `dist/` directory.
- Installation copies only the three runtime artifacts into `<vault>/.obsidian/plugins/devguyrash-mermaid-viewer/`. Native validation in an isolated scratch vault is recommended; a prior namespaced build was installed at the owner's explicit request while native QA remained unrun.
- Installation preserves `data.json` and unrelated vault settings. The plugin settings tab saves only explicitly changed preferences in its own namespace, preserving unknown keys; failed reads or malformed data prevent a save. Note source changes only after an explicit Save in the Mermaid source editor.
- Do not build into a live vault or use a live development symlink for validation.

Mica remains a separate plugin. Do not modify or rebuild its live source as part of this viewer's setup.

The plugin ID changed from `mermaid-viewer` to `devguyrash-mermaid-viewer`; the display name Mermaid Viewer, author DevGuyRash and version 0.1.0 are unchanged. The old ID/name alone does not establish the publisher of a folder. If a third-party `mermaid-viewer` installation is present, leave its folder, `data.json` and enabled state untouched. Do not rename or copy it into the new namespace. Preserve any proven legacy private data in its original folder or backup. No settings migration between these namespaces runs automatically.

Reading-view instances belong to MarkdownRenderChild. Live Preview instances belong to a CodeMirror ViewPlugin, gated by the public Live Preview state field. The editor adapter observes only its own rendered content and never moves native widget roots.

Component CSS remains scoped. High-specificity overflow rules preserve viewer viewport clipping and internal menu/status scrolling; they do not impose workspace-level overflow or layout behavior. Synthetic regression CSS reproduces the relevant host collision without including a user's vault stylesheet.
