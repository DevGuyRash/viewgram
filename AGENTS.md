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

Run `npm run lint:obsidian` within the user's authorized scope. It combines the
official source rules over `src` and `demo` with the local CSS tripwires. Keep
shipping plugin code under `src`; native DOM creation and development imports
are errors there, and the build checks its resolved input graph. The standalone
browser adapter is a development ESM module, locally checked with its native
DOM necessity explained in `RELEASING.md`. Check official scan scope when adding
source paths; development directory names alone do not imply exclusion. Keep
other warnings visible and review them without suppressing rules. Do not
introduce stylesheet priority overrides, `:has()`, or
the rejected decoration longhands. Use owned state classes and CSS variables.
The CSS tripwires cover those patterns only; they do not establish complete CSS
compatibility, reproducible builds, attestations, or an official preview pass.

When preparing a plugin update, follow [RELEASING.md](RELEASING.md). Keep the
plugin ID stable and synchronize the package, lockfile, manifest and
`versions.json` metadata in the scanned candidate. Merge the reviewed candidate
into `main` before tagging or publishing; its release source and root manifest
must match the scanned candidate. Content changes return through `review` and
a fresh preview. Delivery requires a GitHub Release with the exact unprefixed
`x.y.z` version tag and matching `main.js`, `manifest.json` and `styles.css`
attachments, followed by download/hash verification.

An exact branch preview does not verify future release assets or attestations.
Before installation or activation, verify the release and each downloaded asset
with supported `gh release` verification, then require a completed Obsidian full
release review with zero errors and reviewed warning dispositions. Immutable
`release/v0.2` attestations bind the tag, commit and assets; SLSA workflow build
provenance remains separate evidence. Preserve protections, published assets and
both reports. If GitHub and Obsidian disagree, stop affected delivery pending
diagnosis; never fabricate provenance or weaken checks.

Use the existing build and verification commands within the user's authorized
scope. Preserve settings, unrelated work and published release assets. Report
build, publication, installation, activation and directory review as separate
outcomes; leave unrun gates pending. The release guide explains owner account
steps and users' manual Community plugin update process.

Shared release automation follows `docs/RELEASE-CONTRACT.md`. Viewgram is its
canonical source; update the identical Mica snapshot and full upstream commit
pin together. Run `npm run test:release` and `npm run release:parity` for release
tooling changes. `npm run release:qualify` composes the existing product gates;
it does not replace authenticated Community reports. Keep the only hosted
trigger manual `workflow_dispatch`, default publication false, and no general
main/PR/tag/scheduled CI. Changing source does not authorize enabling hosted
runs, changing release protections or editing immutable assets.

Future releases also require the shared [build-provenance gate](docs/RELEASE-CONTRACT.md):
attest the three exact qualified assets and verify repository, source commit,
signing workflow and hashes before publication. Preserve immutable-release
verification afterward as a separate gate. Workflow preparation does not prove
provenance exists; keep activation approval and actual verification explicit.
