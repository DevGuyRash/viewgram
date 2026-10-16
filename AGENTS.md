# Viewgram agent instructions

Commit and push all new work to the permanent lowercase `review` branch first.
Isolated work branches may integrate there; preserve existing work and history.

Before opening a `review` → `main` PR, use the entry's Obsidian Community
**Review branch** → **Run preview scan** with the full current `review` HEAD SHA.
Record that SHA and the actual passing report in the PR template. Require zero
errors; fix every warning or document its intentional necessity with a reviewed
reason. Unreviewed warnings block promotion. Any change to `review` HEAD
invalidates its earlier pass; stop before PR creation, main merge, tagging or
publication until the new SHA passes and its warnings are resolved. Keep
recommendations and unverified optional capabilities/attestations explicit.
GitHub PR checks and local lint are separate evidence; neither is an Obsidian
preview result, and no Obsidian GitHub status name is assumed.

Run `npm run lint:obsidian` as a separate official local preflight within the
user's authorized scope. Keep warnings visible; fix each or record its reviewed
necessity without suppressing review rules. Use the component reasons in
`RELEASING.md`; local lint does not establish CSS coverage, reproducible builds,
attestations, or an official preview pass.

When preparing a plugin update, follow [RELEASING.md](RELEASING.md). Keep the
plugin ID stable and synchronize the package, lockfile, manifest and
`versions.json` metadata in the scanned candidate. Merge the reviewed candidate
into `main` before tagging or publishing; its release source and root manifest
must match the scanned candidate. Content changes return through `review` and
a fresh preview. Delivery requires a GitHub Release with the exact unprefixed
`x.y.z` version tag and matching `main.js`, `manifest.json` and `styles.css`
attachments, followed by download/hash verification.

Use the existing build and verification commands within the user's authorized
scope. Preserve settings, unrelated work and published release assets. Report
build, publication, installation, activation and directory review as separate
outcomes; leave unrun gates pending. The release guide explains owner account
steps and users' manual Community plugin update process.
