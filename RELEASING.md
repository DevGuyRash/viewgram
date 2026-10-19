# Releasing Viewgram

## Automatic updates on push

Pushes to `review` and `main` run the shared validation workflow. A new version
on main automatically publishes after product validation and exact-asset build
provenance verification. Repeated pushes of an already-published version with
identical asset hashes skip publication; changed assets require a version bump.
The optional manual dispatch defaults to a dry run. See the
[shared release contract](docs/RELEASE-CONTRACT.md) for permissions and recovery.

Obsidian requires the initial directory submission once and periodically checks
subsequent GitHub releases. Its completed full release review establishes
acceptance. A source preview remains useful optional feedback, not a required
manual step on every push. Never present local or hosted validation as an
actual Community review. Users choose **Settings → Community plugins → Check
for updates**, then **Update** or **Update all** to install updates.

## Review and promotion

1. Commit and push new work to permanent lowercase `review`, preserving history.
2. Require the product validation workflow and resolve actionable warnings.
   Document necessary advisories, including essential clipboard capability.
3. Inspect the latest applicable Community report when available; record its
   exact version/SHA and distinguish preview from published-release results.
4. Merge the reviewed candidate into main. Its synchronized manifest version
   determines publication. No automatic version-writeback commits are created.
5. Inspect the resulting GitHub run, release hashes/provenance, and completed
   Community full release review. Unrun or unavailable gates remain pending.

## Local preflight boundaries

`npm run lint:obsidian` runs the official recommended TypeScript rules over
`src` and `demo`, with native DOM creation and development imports promoted to
errors in plugin source, then `npm run lint:review-css` and the pinned official scanner CSS rules via
`npm run lint:scanner-css`. The CSS scanner configuration is copied unchanged
from official obsidianmd/obsidian-workflows commit
`8167caed39664214d82c86fdfa32e06d8d55f61d`; it is checked with locked dev dependencies.
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
attestations or an official preview pass. If using an optional preview as
evidence, any later source change makes that earlier report stale.

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
   reviewed PR is merged. A changed candidate needs fresh automated validation;
   record unrun gates as pending.

`npm version` alone is not this release procedure: this package has no version
lifecycle hook synchronizing the Obsidian metadata, and that command can create
a tag before the candidate is ready.

## Publish and verify

`npm run release:validate` runs existing product check/build/browser tests,
Obsidian source/CSS preflight and release-contract tests. `release:qualify` is an
alias for Viewgram. `npm run release:parity` checks the canonical bundle hashes.
The shared contract defines the automatic main workflow and isolated exact-asset
attestation/publication jobs. Verify immutable release settings before the first
publication; no new credential is needed.

The three release attachments come from the one qualified build:

- `dist/main.js` → `main.js`
- `dist/manifest.json` → `manifest.json`
- `dist/styles.css` → `styles.css`

The built manifest must equal the root manifest. Demo files, private evidence,
settings and dependencies are not release assets. The immutable tag equals the
unprefixed manifest version. Already-published `0.1.2` is never changed; the new
workflow candidate uses `0.1.3`. Historical review results do not describe a
new candidate or its future release.

The workflow verifies genuine SLSA build provenance for all three exact files,
then creates a draft, checks its hashes and publishes. It verifies immutable
release provenance and re-downloads/hashes every attachment. These are separate
from Obsidian's completed full release review. A missing or conflicting report
is pending diagnosis, never a fabricated pass.

Before installation or activation, require a completed full Community release
review with no errors and dispositions for warnings, plus the verified release
assets. Preserve `data.json`, the legacy namespace and unrelated plugins as
specified in [placement](docs/PLACEMENT.md). Confirm the loaded version;
publication alone does not install or enable the plugin in a vault.

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

Future releases also require the shared [build-provenance gate](docs/RELEASE-CONTRACT.md):
attest the three exact qualified assets and verify repository, source commit,
signing workflow and hashes before publication. Preserve immutable-release
verification afterward as a separate gate. Workflow preparation does not prove
provenance exists; keep actual verification and directory acceptance explicit.
