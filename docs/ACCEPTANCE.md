# Later validation and safe installation

Implementation/source setup comes first. Do not run these checks as a side effect of publication or cloning.

When the validation phase is authorized, use a new isolated scratch vault and synthetic fixtures. `scripts/prepare-scratch.mjs` accepts only a new absolute directory, refuses an existing target or a target inside an existing vault, and does not enable plugins.

1. Build the source, then copy the three artifacts into the scratch vault.
2. Compare original rendering with the viewer disabled against the same sources with it enabled.
3. Check every required type variant, width-fit, true native 100%, pan/recenter, modal fit, close/focus and unchanged source bytes during navigation. Separately verify explicit source saves and Live Preview undo using [upgrade acceptance](UPGRADE-VERIFICATION.md).
4. Check Live Preview/Reading/Source transitions, async widgets, virtualized removal, source edits, file changes and plugin unload/re-enable.
5. Check native dark/light presentation, live theme changes, explicit filters and alternate Mermaid host markup.
6. Rerun the prepared browser cases, including narrow layout and first-paint geometry. Emulated DOM tests do not prove native integration or visual correctness.
7. Record Mica, mobile, links/popouts, embeds and performance separately. Unsupported renderer syntax is not a viewer defect.

The `info` diagnostic may render without a usable viewBox or explicit native dimensions and is deliberately left unwrapped. Do not replace the host's Mermaid engine to alter compatibility results.

A later live installation requires its own decision after applicable gates pass. Back up prior artifacts, copy only `main.js`, `manifest.json` and `styles.css`, preserve `data.json`, and leave note source, other plugins and vault-wide CSS unchanged. Roll back by restoring the previous three artifacts and previous enabled state.
