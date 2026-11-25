# n13-webflow-scripts

Shared, attribute-driven scripts for Webflow projects (Lumos-based sites), served via jsDelivr from this public repo.

## Parts
- `form-handler/`: validation, phone formatting, honeypot, sending forms as JSON to an endpoint (the form proxy). Base for the multi-step script.
- `multistep-form/`: steps, conditions, back button, drafts. Since 2.0 it needs `form-handler.js` on the page.
- `form-proxy/`: Cloudflare Worker (`n13-form-proxy`) that forwards submissions to Make. Deployed with Wrangler, not via jsDelivr. One secret per form (`FORM_<ID>`); never put webhook URLs in the repo.

## How scripts are used
- Webflow loads them through an embed component ("Script Multistep Form", group Utility) nested in the form component:
  `https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@<version>/<folder>/<file>.min.(js|css)`
  For 2.x: form-handler CSS+JS first, then multistep-form CSS+JS.
- jsDelivr minifies on request (`.min.js` / `.min.css`); keep only readable source in the repo, no build step.
- Versions are repo-wide tags. Sites pin the exact tag (`@2.2.0`): browsers cache alias URLs (`@2`) for 7 days and a purge can't clear that. A release goes live on a site only when its embed's version is updated and the site is published.

## Rules
- Browser scripts: vanilla JS, no dependencies, ES5-compatible syntax (IIFE, `var`), works with Webflow forms and `Webflow.push`. The Worker may use modern JS.
- Never break existing `data-msf*` / `data-fh*` attributes in a minor/patch release; renames = major version.
- Keep the double-load guards (`window.FormHandler`, `window.MultiStepForm`) and per-form init guards.
- Form handler only touches forms that opt in (`data-fh="form"`, an endpoint, or `data-msf="form"`).
- User-facing messages are German by default; overridable via `window.FH_MESSAGES` (`window.MSF_MESSAGES` still read).
- Document every attribute change in the script's README and `CHANGELOG.md`.

## Release
1. Edit, test locally (`node test/server.mjs` → `/test/index.html`, `/test/single.html`; `node test/phone.test.js`; `node form-proxy/test/worker.test.mjs`), commit.
2. Update `CHANGELOG.md`.
3. Tag with semver: `git tag vX.Y.Z && git push origin main --tags`, then purge the jsDelivr alias.
4. Update the version in each site's embed (LWT 2026: component "Script Multistep Form", all four URLs), publish, check the live HTML.
