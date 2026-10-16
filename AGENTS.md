# Viewgram agent instructions

When preparing a plugin update, follow [RELEASING.md](RELEASING.md). Keep the
plugin ID stable and synchronize the package, lockfile, manifest and
`versions.json` metadata. Delivery requires a GitHub Release with the exact
unprefixed version tag and the matching `main.js`, `manifest.json` and
`styles.css` attachments, followed by download/hash verification.

Use the existing build and verification commands within the user's authorized
scope. Preserve settings, unrelated work and published release assets. Report
build, publication, installation, activation and directory review as separate
outcomes. The release guide explains which steps require the owner's account.
