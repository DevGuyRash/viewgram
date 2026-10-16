# Later Viewgram validation and safe installation

Implementation/source setup comes first. Do not run these checks as a side effect of publication or cloning.

The Viewgram rename changes source and metadata only. Existing build output, release staging, generated previews and installed copies retain their earlier identity. Builds and installation are paused under the storage-capacity hold; do not retag or copy old artifacts as Viewgram. Historical receipts in [upgrade verification](UPGRADE-VERIFICATION.md) do not establish a rebuilt or installed Viewgram version.

When the validation phase is authorized, use a new isolated scratch vault and synthetic fixtures. `scripts/prepare-scratch.mjs` verifies that the built manifest matches the source ID, name, author and version before creating a target; rebuild first if old-ID artifacts are present. It derives the plugin folder from the built manifest's validated ID, accepts only a new absolute directory, refuses an existing target or a target inside an existing vault through either lexical or resolved symlink ancestry, and does not enable plugins.

1. After the storage-capacity hold is cleared, build the source, then stage the three artifacts in the new scratch vault under `.obsidian/plugins/viewgram/`.
2. Compare original rendering with the viewer disabled against the same sources with it enabled.
3. Check every required type variant, primary whole-chart fit, separate width-fit, true native 100%, pan/recenter, modal fit, close/focus and unchanged source bytes during navigation. Separately verify explicit source saves and Live Preview undo using [upgrade acceptance](UPGRADE-VERIFICATION.md).
4. Check Live Preview/Reading/Source transitions, async widgets, virtualized removal, source edits, file changes and plugin unload/re-enable.
5. Check native dark/light presentation, live theme changes, explicit filters and alternate Mermaid host markup.
6. Rerun the prepared browser cases, including narrow layout and first-paint geometry. Emulated DOM tests do not prove native integration or visual correctness.
7. Record Mica, mobile, links/popouts, embeds and performance separately. Unsupported renderer syntax is not a viewer defect.

The `info` diagnostic may render without a usable viewBox or explicit native dimensions and is deliberately left unwrapped. Do not replace the host's Mermaid engine to alter compatibility results.

A later live installation must pass the native scratch gates. Use `<vault>/.obsidian/plugins/viewgram/`, substituting the actual Obsidian configuration directory when it has a custom name. Back up any prior artifacts in that namespace, copy only fresh verified `main.js`, `manifest.json` and `styles.css`, preserve `data.json`, and leave note source, other plugins and vault-wide CSS unchanged.

For settings from a confirmed DevGuyRash `devguyrash-mermaid-viewer` installation, disable that plugin, close Obsidian and explicitly run `node scripts/migrate-settings.mjs "/absolute/vault/.obsidian"` from the source checkout. The helper verifies the legacy ID and author, preserves original settings and unknown keys, creates a unique owner-only backup in the old folder, and refuses existing target data or symlinks. It does not change enabled-plugin lists; no legacy data means no settings migration is needed. See [placement](PLACEMENT.md) for the migration boundary.

Keep the old folder and backups. Ensure the old plugin is disabled before enabling Viewgram. For rollback across namespaces, disable Viewgram and restore the confirmed old plugin's previous enabled state and runtime files from its backup if needed. For an update within `viewgram`, restore its previous three artifacts and previous enabled state. A third-party `mermaid-viewer` folder is outside this migration: do not inspect, rename or copy it, or change its data or enabled state. No migration runs automatically.
