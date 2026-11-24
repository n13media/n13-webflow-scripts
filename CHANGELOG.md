# Changelog

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
