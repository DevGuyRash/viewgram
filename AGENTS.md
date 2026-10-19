# Viewgram agent instructions

Commit and push new work to permanent lowercase `review` first; preserve
existing work and history. Review/main pushes validate automatically. A new,
synchronized version on main publishes automatically only after validation and
exact-asset build provenance pass. The owner's current on-push instruction
supersedes the earlier manual-only workflow and mandatory per-push portal-preview
policy. Do not add recurring manual approval or report-entry steps.

Follow RELEASING.md and docs/RELEASE-CONTRACT.md. Keep plugin ID stable. Preserve
settings, clipboard, source editing, diagram export and other essential features.
Fix actionable warnings/errors; keep intentional advisories explicit. Do not
remove a capability just to silence a scanner recommendation.

Run the direct official source rules, pinned scanner CSS rules and local CSS
tripwires with `npm run lint:obsidian`. Keep shipping plugin code under `src`.
Native DOM creation and development imports are errors there, and the build
checks its resolved graph. The standalone browser adapter's two local native-DOM
advisories are documented necessity. Do not suppress rules, add priority
overrides, `:has()`, or rejected decoration longhands. Use owned state classes
and CSS variables.

`npm run release:validate` covers product checks/build/browser tests, direct
lint and release tests. Record blocked checks accurately; neither local nor
hosted checks guarantee Community directory acceptance. Optional exact-SHA
branch previews and full release reviews are different evidence. Use the latest
applicable report, not a historical release failure to describe current source.

Synchronize package, lockfile, manifest and versions.json for a new release.
Merge reviewed source to main before automated publication. Published assets
are immutable: never overwrite, delete or retag. Repeat pushes with matching
published bytes skip publication; changed bytes need a new version.

Shared automation is canonical here. Copy the identical release bundle and
hash manifest to Mica and update its full upstream commit pin together. Run
`npm run test:release` and `npm run release:parity` for tooling changes. Preserve
isolated build, attestation and publication permissions; new persistent access
still requires the owner's confirmation.

Before installing or activating, require exact downloaded-asset hash checks,
GitHub build/release verification and a completed full Community release review.
Keep publication, installation, activation, native-device and directory review
outcomes separate. Preserve any conflicting reports and diagnose them without
fabricating provenance or weakening checks.
