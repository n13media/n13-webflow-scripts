# Form Handler

Validation, phone formatting, spam protection and sending for Webflow forms. Instead of Webflow's own
form submit, the data goes as JSON to an endpoint, normally the [form proxy](../form-proxy/) which forwards it
to Make. Without an endpoint it only validates and Webflow submits as usual.

Used on its own for simple forms, and as the base of the [multi-step form](../multistep-form/).

## Embed

```html
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2/form-handler/form-handler.min.css">
<script defer src="https://cdn.jsdelivr.net/gh/n13media/n13-webflow-scripts@2/form-handler/form-handler.min.js"></script>
```

Only forms that opt in are touched (see below); other forms on the page (search, filters) stay as they are.
Loading it twice is safe.

## Attributes

### Form

| Attribute | On | Effect |
| --- | --- | --- |
| `data-fh="form"` | `<form>` | Activates validation (multi-step forms are picked up automatically) |
| `data-fh-endpoint="https://…/f/form-id"` | form | Send the data here instead of to Webflow |
| `<input type="hidden" data-fh="endpoint" value="…">` | inside the form | Same as `data-fh-endpoint`, as a hidden input (e.g. via an Embed) |
| `data-fh-redirect="/danke"` | form | Go to this page after sending (instead of Webflow's success box) |
| `data-fh-honeypot` | form | Spam protection: hidden trap field + submits faster than 3 s are dropped. `="5"` = 5 s |
| `data-fh="loader"` | any element in the `.w-form` block | Hidden; shown while sending (keeps its own display, e.g. flex) |
| `data-fh="error-text"` | element inside `.w-form-fail` | Receives the send error message |
| `data-fh-loader="spinner glow"` | submit button or its wrapper | Button loader while sending: `spinner`, `glow` or both (see below) |

A form with an endpoint never uses Webflow's form submission, so the submission doesn't show up in Webflow's
Forms tab and Webflow sends no notification emails.

### Fields

Native validation (required, type, min/max, pattern) is respected. Every attribute also works with the
`data-msf-` prefix, so existing multi-step markup keeps working.

| Attribute | Effect |
| --- | --- |
| `data-fh="field"` | Wrapper that receives the error message and `is-invalid` class |
| `data-fh="error"` | Element inside the wrapper where the message goes (otherwise one is created) |
| `data-fh-message="…"` | Custom error message for this field |
| `data-fh-match="otherName"` | Must equal another field, message via `data-fh-match-message` |
| `data-fh="group"` + `data-fh-min` / `data-fh-max` | Min/max number of checked checkboxes |
| `data-fh-ignore` | Field (or container) is skipped by validation |
| `data-fh-exclude` | Field (or container) is not sent |
| `data-fh-phone="false"` / `data-fh-phone` / `data-fh-phone-country="43"` | Phone check off / on for other inputs / country for numbers starting with 0 (default 49) |

Phone numbers (`type="tel"`): `0151 23456789` → `+49 151 23456789`, too short or long numbers are rejected.
Phone fields get `inputmode="tel"` and `autocomplete="tel"` if missing. Details: [multistep README](../multistep-form/README.md#phone-numbers).

## Button loader

Put `data-fh-loader` on the submit button (for Lumos *Button Main*: on the `button_main_wrap`, the element with
`data-msf="submit"`). Values can be combined: `spinner`, `glow`, `spinner glow`.

- `spinner`: the button text turns invisible and a spinner in the text color takes its place. It sits inside the
  text's own box (`.button_main_text`, an element with `data-fh-loader-text`, or a plain `<button>`), so the button
  keeps its size and the spinner can't leave it.
- `glow`: Lumos buttons pulse their own `.button_main_glow` (the brand glow normally shown on hover). Other buttons
  get a pulsing shadow in `--fh-glow-color` (default: the text color), e.g. `style="--fh-glow-color: #5dcaa5"`.
- With "reduce motion" turned on, both run slower but stay visible.

Test page: `node test/server.mjs` → `http://localhost:8765/test/loader.html` (`?hold` keeps the sending state on).

## After sending

1. If the endpoint answers with `{"redirect": "/some-page"}` (e.g. a Make *Webhook response*), go there.
2. Otherwise, if the form has `data-fh-redirect`, go there.
3. Otherwise hide the form and show Webflow's success box (`.w-form-done`).

Only relative paths and `http(s)` URLs are followed.

On a network error, timeout (15 s) or server error (5xx) the script retries once after 2 seconds. If that fails
too, it shows Webflow's error box (`.w-form-fail`) and keeps everything the person entered, so they can send again.
While sending, the submit button is disabled and shows Webflow's *waiting text* (`data-wait`); a second click
does nothing.

## What is sent

```json
{
  "fields": { "Vorname": "Max", "Handynummer": "+49 170 1234567", "Distanz": ["Olympisch"], "Newsletter": true },
  "meta": {
    "form": "Membership Form", "formId": "wf-form-Membership-Form",
    "page": "https://…", "path": "/…", "title": "…", "submittedAt": "2026-11-24T14:00:00.000Z",
    "language": "de-DE", "device": "mobile", "viewport": "390x844",
    "referrer": "https://www.instagram.com/", "landingPage": "https://…?utm_source=instagram",
    "utm": { "utm_source": "instagram", "utm_campaign": "…" }
  }
}
```

- Field keys are the inputs' `name`. Checkbox groups (same name) → array; single checkbox → `true`/`false`.
- UTM parameters (`utm_*`, `gclid`, `fbclid`, `msclkid`), landing page and referrer are kept for the browser
  session (sessionStorage), so a form on a later page still knows where the visit came from.
- A Cloudflare Turnstile token is sent as `turnstile` (the proxy checks it and removes it).
- The honeypot and captcha fields are never part of `fields`.

## JavaScript

- Events on the form: `fh:send` (`detail.payload`), `fh:success` (`detail.response`), `fh:error`
  (`detail.status`, `detail.response`), `fh:spam`.
- `window.FormHandler.init()` re-scans the page.
- Messages: override with `window.FH_MESSAGES = { required: '…', sendError: '…' }` before the script
  (`window.MSF_MESSAGES` is read too). Keys: `required`, `email`, `phone`, `match`, `minChecked`, `maxChecked`, `sendError`.
- API used by the multi-step script: `FormHandler.validate(container, form, mode)`, `FormHandler.formatPhones(el)`,
  `FormHandler.onBeforeSubmit(form, fn)` (return `false` to stop the submit).

## Tests

From the repo root: `node test/server.mjs`, then open
`http://localhost:8765/test/single.html?endpoint=/f/ok` (also `/f/redirect`, `/f/flaky`, `/f/down`, `/f/slow`).
Phone unit tests: `node test/phone.test.js`.
