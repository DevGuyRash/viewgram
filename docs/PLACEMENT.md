# Source and runtime placement

Viewgram uses plugin ID `viewgram`, display name Viewgram and author DevGuyRash. This change updates source and metadata. Existing `dist/`, release staging, generated previews and installed copies remain earlier artifacts; they have not been rebuilt, installed or qualified as Viewgram. Build and installation remain paused under the storage-capacity hold. Do not retag or copy old artifacts as a Viewgram release.

- Keep source in a standalone checkout, such as `~/repos/viewgram`.
- Build into that checkout's `dist/` directory.
- After the hold is cleared and later validation is authorized, installation copies only fresh verified `main.js`, `manifest.json` and `styles.css` into `<vault>/.obsidian/plugins/viewgram/`. Use the actual Obsidian configuration directory if it has a custom name. Historical native validation covers earlier artifact identities. Preserve a backup of any incumbent runtime files; copying files does not establish that the running app loaded or enabled them.
- Installation preserves `data.json` and unrelated vault settings. The plugin settings tab saves only explicitly changed preferences in its own namespace, preserving unknown keys; failed reads or malformed data prevent a save. Note source changes only after an explicit Save in the Mermaid source editor.
- Do not build into a live vault or use a live development symlink for validation.

Mica remains a separate plugin. Do not modify or rebuild its live source as part of this viewer's setup.

## Explicit settings migration

Only a proven DevGuyRash installation with ID `devguyrash-mermaid-viewer` is eligible for migration to `viewgram`. During later installation, disable that legacy plugin and close Obsidian, then run this command from the source checkout with the actual absolute configuration-directory path:

```sh
node scripts/migrate-settings.mjs "/absolute/vault/.obsidian"
```

The helper's only legacy source is `plugins/devguyrash-mermaid-viewer`. It verifies the legacy manifest's ID and `DevGuyRash` author and requires object-shaped settings JSON. Before copying settings, it writes a unique owner-only backup in the legacy folder. It then exclusively copies the original settings bytes to `plugins/viewgram/data.json`, preserving unknown keys and leaving originals intact. Existing target data, symlinks and a mismatched publisher cause refusal. If no legacy `data.json` exists, no settings migration is needed.

The helper does not change enabled-plugin lists. Keep the old folder and backups for rollback; disable the confirmed old plugin before enabling Viewgram. No migration runs automatically.

The ID or display name alone does not establish a folder's publisher. A third-party `mermaid-viewer` installation is separate: leave its folder, `data.json` and enabled state untouched. The helper never inspects or copies it. Preserve any proven private legacy data in its original folder or backup.

Reading-view instances belong to MarkdownRenderChild. Live Preview instances belong to a CodeMirror ViewPlugin, gated by the public Live Preview state field. The editor adapter observes only its own rendered content and never moves native widget roots.

Component CSS remains scoped. High-specificity overflow rules preserve viewer viewport clipping and internal menu/status scrolling; they do not impose workspace-level overflow or layout behavior. Synthetic regression CSS reproduces the relevant host collision without including a user's vault stylesheet.
