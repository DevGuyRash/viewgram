# Source and runtime placement

- Keep source in a standalone checkout, such as `~/repos/obsidian-mermaid-viewer`.
- Build into that checkout's `dist/` directory.
- A separately approved installation copies only the three runtime artifacts into `<vault>/.obsidian/plugins/mermaid-viewer/`.
- Preserve `data.json` and unrelated vault settings. This implementation does not write persistent settings. Note source changes only after an explicit Save in the Mermaid source editor.
- Do not build into a live vault or use a live development symlink for validation.

Mica remains a separate plugin. Do not modify or rebuild its live source as part of this viewer's setup.

Reading-view instances belong to MarkdownRenderChild. Live Preview instances belong to a CodeMirror ViewPlugin, gated by the public Live Preview state field. The editor adapter observes only its own rendered content and never moves native widget roots.

Component CSS remains scoped. The high-specificity overflow override changes only viewport clipping; it does not impose workspace-level overflow or layout behavior. Synthetic regression CSS reproduces the relevant host collision without including a user's vault stylesheet.
