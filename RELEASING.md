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

## Prepare one candidate

1. Choose a new semantic version in `x.y.z` form. Keep the plugin ID `viewgram`.
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
   default branch must contain the matching root manifest and source.

`npm version` alone is not this release procedure: this package has no version
lifecycle hook synchronizing the Obsidian metadata, and that command can create
a tag before the candidate is ready.

## Publish and verify

From the same candidate commit, publish a new GitHub Release with a tag exactly
equal to `manifest.json`'s version, such as `0.1.1`, without a `v` prefix.
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

- [Submit your plugin](https://docs.obsidian.md/Plugins/Releasing/Submit%20your%20plugin)
- [Manifest](https://docs.obsidian.md/Reference/Manifest)
- [Official sample: release metadata and versions.json](https://github.com/obsidianmd/obsidian-sample-plugin#releasing-new-releases)
- [Community plugin update instructions](https://obsidian.md/help/Extending%2BObsidian/Community%2Bplugins)
