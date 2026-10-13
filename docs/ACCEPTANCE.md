# Later validation and safe installation

Implementation/source setup comes first. Do not run these checks as a side effect of publication or cloning.

When the validation phase is authorized, use a new isolated scratch vault and synthetic fixtures. `scripts/prepare-scratch.mjs` verifies that the built manifest matches the source ID, name, author and version before creating a target; rebuild first if old-ID artifacts are present. It derives the plugin folder from the built manifest's validated ID, accepts only a new absolute directory, refuses an existing target or a target inside an existing vault through either lexical or resolved symlink ancestry, and does not enable plugins.

1. Build the source, then stage the three artifacts in the new scratch vault under `.obsidian/plugins/devguyrash-mermaid-viewer/`.
2. Compare original rendering with the viewer disabled against the same sources with it enabled.
3. Check every required type variant, primary whole-chart fit, separate width-fit, true native 100%, pan/recenter, modal fit, close/focus and unchanged source bytes during navigation. Separately verify explicit source saves and Live Preview undo using [upgrade acceptance](UPGRADE-VERIFICATION.md).
4. Check Live Preview/Reading/Source transitions, async widgets, virtualized removal, source edits, file changes and plugin unload/re-enable.
5. Check native dark/light presentation, live theme changes, explicit filters and alternate Mermaid host markup.
6. Rerun the prepared browser cases, including narrow layout and first-paint geometry. Emulated DOM tests do not prove native integration or visual correctness.
7. Record Mica, mobile, links/popouts, embeds and performance separately. Unsupported renderer syntax is not a viewer defect.

The `info` diagnostic may render without a usable viewBox or explicit native dimensions and is deliberately left unwrapped. Do not replace the host's Mermaid engine to alter compatibility results.

A later live installation must pass the native scratch gates. Use `<vault>/.obsidian/plugins/devguyrash-mermaid-viewer/`. Back up prior artifacts in that namespace, copy only `main.js`, `manifest.json` and `styles.css`, preserve `data.json`, and leave note source, other plugins and vault-wide CSS unchanged. Roll back by restoring the previous three artifacts and previous enabled state in that namespace. If an old `mermaid-viewer` folder is present, do not rename or copy it or change its data or enabled state. Keep proven legacy private data in its original folder or backup; settings save only in the new namespace and no automatic migration runs.
