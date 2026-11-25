# Changelog

Versions are repo-wide tags (jsDelivr `@1`, `@2`, …). Each section lists what changed per script.

## 2.2.0

### form-handler
- `data-fh-loader` can go on the form: applies to its submit buttons only (Lumos buttons have just one attribute slot).

## 2.1.0

### form-handler
- Button loader (opt-in): `data-fh-loader="spinner"`, `"glow"` or `"spinner glow"` on the submit button or its wrapper.
  Spinner replaces the text inside the text's own box; glow pulses Lumos' `.button_main_glow` or a shadow in `--fh-glow-color`.
- Test page `test/loader.html`.

## 2.0.0

### form-handler (new)
- Shared validation (required, email, phone, match, checkbox min/max), phone formatting, honeypot + minimum fill time.
- Sends forms as JSON to an endpoint (`data-fh-endpoint` or hidden `data-fh="endpoint"` input) instead of Webflow,
  e.g. the form proxy → Make. Without an endpoint: validation only, Webflow submits as usual.
- Loader (`data-fh="loader"`), Webflow waiting text, double-submit guard, one retry, Webflow success/error boxes,
  redirect from the endpoint's answer or `data-fh-redirect`.
- Meta data: form, page, title, time, language, device, viewport, referrer, landing page, UTM (kept per session).
- Events `fh:send`, `fh:success`, `fh:error`, `fh:spam`. Reads `data-fh-*` and `data-msf-*` attributes.

### multistep-form 2.0.0 (breaking)
- Needs `form-handler.js` on the page (validation, spam protection and submit moved there).
- Event `msf:spam` → `fh:spam`. Error element class `.msf_error` → `.fh_error` (styles in `form-handler.css`).
- Messages: `window.FH_MESSAGES` (`window.MSF_MESSAGES` still read).
- Drafts are also cleared when the form handler redirects after sending.
- All `data-msf-*` attributes stay the same.

### tests
- `node test/server.mjs`: local server with a fake proxy (`/f/ok`, `/f/redirect`, `/f/flaky`, `/f/down`, `/f/slow`).
- `test/single.html` for single-step forms.

## form-proxy
- Cloudflare Worker, deployed separately with Wrangler (not served via jsDelivr). See `form-proxy/README.md`.

## multistep-form

### 1.1.0
- Saved drafts (`data-msf-save`) now expire 1 day after the last edit; `data-msf-save="n"` sets n days.
  Drafts saved by 1.0.0 (no timestamp) are discarded.
- Phone validation for `type="tel"` fields: numbers like `0151 …` are rewritten to `+49 151 …`,
  too short/long numbers (e.g. `+49 34242`) are rejected. New attributes `data-msf-phone`,
  `data-msf-phone-country`; new message key `phone`.
- Browser back/forward moves between steps (history entries without URL change); opt out with `data-msf-history="false"`.
- Phone fields get `inputmode="tel"` / `autocomplete="tel"` when missing.
- `data-msf-nosave` excludes fields from draft saving.
- `data-msf-honeypot`: hidden trap field + minimum fill time (default 3 s); spam gets a fake success, event `msf:spam`.
- Test page (`test/index.html`) and phone unit tests (`node test/phone.test.js`).

### 1.0.0
- First release: per-step validation, conditional steps (`data-msf-if`), progress/indicators, summary fields,
  localStorage draft saving, script-controlled prev/next/submit buttons, double-load guard,
  overridable messages via `window.MSF_MESSAGES`.
