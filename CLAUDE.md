# n13-webflow-scripts

Shared, attribute-driven scripts for Webflow projects (Lumos-based sites), served via jsDelivr from this public repo.

## How scripts are used
- Webflow loads them through an embed component ("Script Multistep Form", group Utility) nested in the form component:
  `https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@<version>/multistep-form/multistep-form.min.(js|css)`
- jsDelivr minifies on request (`.min.js` / `.min.css`); keep only readable source in the repo, no build step.
- Sites pin an exact version tag. A change only goes live when a new tag exists and the embed's version is updated.

## Rules
- Vanilla JS, no dependencies, ES5-compatible syntax (IIFE, `var`), works with Webflow forms and `Webflow.push`.
- Never break existing `data-msf*` attributes in a minor/patch release; renames = major version.
- Keep the double-load guard (`window.MultiStepForm`) and per-form init guard.
- User-facing messages are German by default; overridable via `window.MSF_MESSAGES`.
- Document every attribute change in `multistep-form/README.md` and `CHANGELOG.md`.

## Release
1. Edit, test locally (e.g. a plain HTML test page), commit.
2. Update `CHANGELOG.md`.
3. Tag with semver: `git tag vX.Y.Z && git push origin main --tags`.
4. Tell the user which version to put in the Webflow embed.
