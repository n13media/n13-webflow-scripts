# Webflow Scripts

Shared, versioned scripts for Webflow projects. They are served through
[jsDelivr](https://www.jsdelivr.com/) straight from this repo, so the repo must be **public**.

| Script | Folder |
| --- | --- |
| Form Handler (validation + sending) | [`form-handler/`](form-handler/) |
| Multi-Step Form (needs the form handler since 2.0) | [`multistep-form/`](multistep-form/) |
| Form Proxy (Cloudflare Worker, not served via jsDelivr) | [`form-proxy/`](form-proxy/) |

## Release workflow

1. Change the files in a branch and test them (e.g. with a `@commit-hash` URL on a dev page).
2. Merge to `main`, add an entry to `CHANGELOG.md`, and create a tag following semver:
   - `v1.0.1` → bug fix
   - `v1.1.0` → new feature, no breaking changes
   - `v2.0.0` → breaking change (attributes renamed, behaviour changed)
3. Update the version in the Webflow embed of each site that should get the change.

## URL patterns

```
https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@1.0.0/multistep-form/multistep-form.min.js   ← exact version (recommended)
https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@1/multistep-form/multistep-form.min.js       ← latest 1.x (auto-updates)
```

jsDelivr minifies automatically when you request `.min.js` / `.min.css`, so the repo only holds the readable source.
Avoid `@main` and `@latest`: they are cached for up to 7 days and update unpredictably.
After releasing, an alias like `@1` can be refreshed immediately at
`https://purge.jsdelivr.net/gh/n13media/n13-webflow-scripts@1/multistep-form/multistep-form.min.js`.
