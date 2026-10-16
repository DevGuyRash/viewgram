# Releasing Viewgram

## How updates reach users

A plugin update is delivered through a published GitHub Release in
[DevGuyRash/viewgram](https://github.com/DevGuyRash/viewgram). Ordinary source
pushes, local builds and GitHub workflow artifacts do not publish a plugin
update. This repository uses a manual release process; there is no automatic
release-on-push command.

Obsidian needs the initial Community directory submission only. Subsequent
versions use new GitHub Releases. Installed community plugins do not update
automatically: users choose **Settings → Community plugins → Check for
updates**, then **Update** or **Update all**.

## Review branch and promotion gate

1. Commit and push all new work to the permanent lowercase `review` branch
   first. Isolated work branches may integrate there. Preserve existing work
   and history; branch setup is not permission to reset or discard them.
2. Run `npm run lint:obsidian` as the separate official local source preflight
   within the authorized scope and record its actual result. Errors must be
   zero. Keep warnings visible; fix each or document its reviewed necessity
   without suppressing review rules. Use the component reasons below. Local
   lint does not establish CSS coverage or an official preview pass.
3. On the Obsidian Community entry, select **Review branch**, enter the full
   current `review` HEAD commit SHA, then select **Run preview scan**. The
   official control accepts any branch, tag, or SHA; `review` is this
   repository's permanent branch convention. Use the SHA so the evidence is
   fixed to one candidate.
4. Obtain an actual passing preview with zero errors before opening the
   `review` → `main` PR. Fix every warning or document its intentional necessity
   with a reviewed reason; unreviewed warnings block promotion. Record the SHA,
   report evidence, warning dispositions, and remaining recommendations or
   unverified optional capabilities/attestations in the PR template. Official
   warnings are advisory; this repository requires their reviewed disposition
   before merge. Recommendations remain separately reported outcomes.
5. Any change to `review` HEAD invalidates its earlier pass. Stop and rerun the
   preview on the new full SHA before opening or merging the PR, tagging, or
   publishing. GitHub PR checks are separate evidence; they do not automatically
   represent the Obsidian preview, and no named GitHub status is assumed.
6. After the clean preview, merge the PR into `main` and record the resulting
   main commit. The release source and root manifest must match the scanned
   candidate. Resolve any merge content changes through `review` and a fresh
   preview. Create the version tag and public release only after merge and the
   release gates below.

The owner handles Community access and account authorization as described
below. An unavailable scan or missing report leaves this gate pending; do not
infer a pass from local checks, a source push, or an earlier candidate.

## Local preflight boundaries

`npm run lint:obsidian` is a separate local source preflight. Its errors must
be zero; warnings remain visible and need a fix or reviewed necessity. It does
not lint CSS or establish reproducible builds, optional attestations, or an
official preview pass.

Keep these intentional boundaries visible when reviewing warnings:

- [viewer/dom.ts](src/viewer/dom.ts) uses the owning document's Obsidian
  `createEl`/`createSvg` helpers when available. Native HTML/SVG creation remains
  necessary for the shared standalone demo and detached documents that lack
  those helpers. The CSS-property fallback carries runtime measurements;
  static presentation belongs in the stylesheet.
- [styles.css](src/styles.css) confines priority to viewer viewport clipping,
  resizable frame dimensions, menu/status overflow, and reduced-motion rules.
  These protect the viewer's interaction boundaries from host styles while
  retaining theme variables for presentation.
- [viewer/semantics.css](src/viewer/semantics.css) composes temporary semantic
  emphasis with the native SVG filter. Its narrow priority must outrank
  Mermaid's ID selectors and inline filter while preserving native diagram
  presentation outside that emphasis.

These reasons are scoped warning dispositions, not blanket acceptance of DOM
fallbacks or priority rules. Review each actual warning against its component
and record its outcome in the PR; a warning count is not an accepted baseline.

## Prepare one candidate

1. Prepare source and metadata on `review` for one exact-SHA candidate. Choose
   a new semantic version in `x.y.z` form. Keep the plugin ID `viewgram`.
2. Set the same version in `manifest.json`, `package.json`, and both root
   package entries in `package-lock.json`. Keep `minAppVersion` accurate.
3. Add `"new-plugin-version": "minimum-obsidian-version"` to `versions.json`,
   preserving mappings for previous releases. This lets older Obsidian apps
   find a compatible plugin version.
4. Use the existing `npm run build` from the candidate source. Run the
   project checks and native qualification appropriate to the change and
   the user's scope; the commands and historical limits are in the README
   and [acceptance guide](docs/ACCEPTANCE.md). Record any checks that could
   not run instead of claiming broader qualification.
5. Review the candidate diff, license notices, dependency changes and generated
   runtime files for unintended private data. Commit only the intended source
   and release metadata through the normal repository Git route. The public
   `main` branch must contain the matching root manifest and source after the
   clean-preview PR is merged. A changed candidate needs fresh preview evidence;
   record unrun gates as pending.

`npm version` alone is not this release procedure: this package has no version
lifecycle hook synchronizing the Obsidian metadata, and that command can create
a tag before the candidate is ready.

## Publish and verify

After merging the clean-preview candidate into `main`, verify the merged
source and root manifest match the scanned candidate. Build the release from
that merged commit, then publish a GitHub Release with a tag exactly equal to
`manifest.json`'s `x.y.z` version, without a `v` prefix.
Attach only these three non-empty files, using these exact attachment names:

- `dist/main.js` → `main.js`
- `dist/manifest.json` → `manifest.json`
- `dist/styles.css` → `styles.css`

The built manifest must equal the root manifest. Demo bundles, fixtures,
settings, private evidence and development dependencies are not release assets.
Record the candidate commit and SHA-256 of each asset. After publication,
download all three attachments again and compare their bytes/hashes with the
candidate; verify the tag target and public release access. Preserve published
releases. A correction gets a new version and release rather than replacing
assets under an existing tag.

Publishing does not install or enable the plugin in a vault. Install the
verified release files using the README procedure, preserve `data.json`, and
confirm that Obsidian actually loads the new version. Preserve the confirmed
legacy namespace and unrelated plugins as described in
[placement](docs/PLACEMENT.md).

## Directory review and owner steps

For the initial listing, use [Obsidian Community](https://community.obsidian.md/)
and **Plugins → New plugin** with the verified repository URL and intended
owner. The owner personally handles sign-in, any new GitHub authorization, and
acceptance of Developer policies and the support/remove-or-transfer commitment.
Submission, a published listing and successful automated review are separate
states. Address review errors with a new source version and GitHub Release;
use the directory's review controls to inspect the resulting report.

Official references:

- [Preview scans and entry management](https://docs.obsidian.md/community-directory/manage-entry)
- [Community review FAQ](https://docs.obsidian.md/community-directory/faq)
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Manifest](https://docs.obsidian.md/Reference/Manifest)
- [Official sample: release metadata and versions.json](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases)
- [Community plugin update instructions](https://obsidian.md/help/Extending%2BObsidian/Community%2Bplugins)
