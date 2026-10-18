# Releasing Viewgram

## How updates reach users

A plugin update is delivered through a published GitHub Release in
[DevGuyRash/viewgram](https://github.com/DevGuyRash/viewgram). Ordinary source
pushes, local builds and GitHub workflow artifacts do not publish a plugin
update. The shared [release contract](docs/RELEASE-CONTRACT.md) automates
qualification, draft publication and verification after a manual release
dispatch. It defaults to a dry run. Main pushes, PRs, tags and schedules do not
start hosted jobs. Source changes alone do not enable Actions or publish.

Obsidian needs the initial Community directory submission only. Subsequent
versions use new GitHub Releases. Installed community plugins do not update
automatically: users choose **Settings → Community plugins → Check for
updates**, then **Update** or **Update all**.

## Review branch and promotion gate

1. Commit and push all new work to the permanent lowercase `review` branch
   first. Isolated work branches may integrate there. Preserve existing work
   and history; branch setup is not permission to reset or discard them.
2. Run `npm run lint:obsidian` within the authorized scope and record its actual
   source-rule and local CSS-tripwire results. Errors must be zero. Keep other
   warnings visible; fix each or document its reviewed necessity without
   suppressing rules. This preflight does not establish full CSS compatibility
   or an official preview pass.
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

`npm run lint:obsidian` runs the official recommended TypeScript rules over
`src` and `demo`, with native DOM creation and development imports promoted to
errors in plugin source, then `npm run lint:review-css`.
The dependency-free CSS tripwires report source locations for priority
overrides, `:has()` and the previously rejected decoration longhands, ignoring
comments and quoted values. They cover the two shipping source stylesheets;
they are not a full CSS parser or browser compatibility database.

Use Obsidian's owning-window DOM helpers in the plugin. The standalone browser
and happy-dom fixtures use `demo/browser-dom.mts`: a development ESM adapter
whose native `createElement` and `createElementNS` calls intentionally preserve
the supplied Document and SVG namespace. Ordinary browsers have no Obsidian DOM
helpers. Keep these two local advisories visible; they are reviewed necessity
for that adapter only. The official [scanner FAQ](https://docs.obsidian.md/community-directory/faq)
documents exact development-file exclusions, including `*.mts`; `demo` itself
is not excluded. This classification does not make native DOM creation suitable
for shipping plugin code. Static plugin imports are checked by ESLint, and the
production build requires repository inputs under `src` and permits package
dependencies. It validates the resolved graph, including reexports and literal
dynamic imports, before writing `main.js`. These checks do not resolve runtime-computed
module paths. Verify any new source directory against the official scan scope.

Viewer geometry, clipping and menu scrolling use owned selectors and CSS
variables. Explicit user style
overrides retain ordinary cascade priority. Semantic emphasis composes the
measured native filter with a theme-owned glow and restores the original
filter when emphasis ends; do not replace it with static priority rules.
Reduced motion also covers native SVG ID/inline animations through one
viewer-owned lifecycle; native transitions reveal their target immediately,
and held animation rates and listeners are released on teardown.

Keep other warnings visible and review each actual component. No warning count
is an accepted baseline. The preflight does not establish reproducible builds,
optional attestations or an official preview pass. Rerun the exact-SHA preview
after every source change, including changes made to remove advisory warnings.

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

The matching workflow and publisher are maintained canonically here and copied
to Mica at a pinned commit. `npm run test:release` tests the protocol with a fake
host; `npm run release:parity` checks the bundle hashes. `npm run release:qualify`
runs the existing product check/build/browser suite, Obsidian preflight and
release tests. These commands do not assert a Community preview or release pass.
Follow the shared contract's first-run settings checks and exact-SHA dispatch
instructions. Publication requires the existing gates below. The already
published immutable `0.1.2` is never republished or modified; its previously
observed GitHub/Obsidian attestation disagreement remains a separate diagnosis
until a fresh authenticated full review establishes otherwise.

After merging the clean-preview candidate into `main`, verify the merged
source tree and root manifest match the scanned, qualified candidate and confirm
its recorded attachment hashes. Those exact qualified attachments may supply the
release; a merge commit with the same tree does not require another build.
Changed release inputs return through `review`, fresh preview and qualification.
Publish a GitHub Release with a tag exactly equal to `manifest.json`'s `x.y.z`
version, without a `v` prefix.
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

An exact branch preview does not verify the future release's attachments or
attestations. Verify the published release and each downloaded asset with the
supported `gh release verify` and `gh release verify-asset` commands and retain
the actual reports. GitHub's immutable `release/v0.2` attestations bind the tag,
commit and asset digests; they do not establish SLSA workflow build provenance.
Keep any unverified build-provenance claim explicit.

Before installation or activation, require the published version's completed
Obsidian full release review with zero errors and every warning fixed or given a
reviewed necessity. A branch preview or GitHub verification alone does not clear
this gate. If GitHub and Obsidian disagree, preserve both reports, protections
and published assets; stop affected delivery pending diagnosis. Never fabricate
provenance or weaken checks to force agreement.

Publishing does not install or enable the plugin in a vault. After those release
checks pass, install the verified files using the README procedure, preserve
`data.json`, and confirm that Obsidian actually loads the new version. Preserve
the confirmed legacy namespace and unrelated plugins as described in
[placement](docs/PLACEMENT.md).

## Directory review and owner steps

For the initial listing, use [Obsidian Community](https://community.obsidian.md/)
and **Plugins → New plugin** with the verified repository URL and intended
owner. The owner personally handles sign-in, any new GitHub authorization, and
acceptance of Developer policies and the support/remove-or-transfer commitment.
Submission, a published listing and successful automated review are separate
states. When a review error requires source or asset changes, use a new source
version and GitHub Release; use the directory's review controls to inspect the
resulting report. Verification disagreements follow the diagnosis gate above.

Official references:

- [Preview scans and entry management](https://docs.obsidian.md/community-directory/manage-entry)
- [Community review FAQ](https://docs.obsidian.md/community-directory/faq)
- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Manifest](https://docs.obsidian.md/Reference/Manifest)
- [Official sample: release metadata and versions.json](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases)
- [Community plugin update instructions](https://obsidian.md/help/Extending%2BObsidian/Community%2Bplugins)
