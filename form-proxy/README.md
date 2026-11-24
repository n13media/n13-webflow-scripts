# Form Proxy (Cloudflare Worker)

Sits between Webflow forms and Make. The website only knows the proxy URL; the Make webhook URLs live
in a Worker secret.

```
Browser ──POST JSON──▶ https://n13-form-proxy.<account>.workers.dev/f/<formId> ──▶ Make webhook
        ◀── Make's answer (e.g. {"redirect": "/danke"}) ──────────────────────────┘
```

Per request the Worker checks:

- the form id exists and the page's `Origin` is on that form's list (CORS)
- `POST`, `Content-Type: application/json`, body ≤ 64 KB
- honeypot field `msf_website` empty (if not: answers "ok" and sends nothing)
- optional Cloudflare Turnstile token (`cf-turnstile-response`)

Make gets the body plus `proxy: { form, origin, receivedAt }`. Protection fields are removed.
Make has 10 seconds to answer. Its answer is passed back: JSON as-is (with `ok: true` added),
plain text as `{ ok: true, message: "…" }`, errors as `{ ok: false, error: "…" }`.

Nothing is stored or logged by the Worker (`observability` is off in `wrangler.toml`).

## Request format

```json
POST /f/lwt-tri-team
{
  "fields": { "Vorname": "Max", "Handynummer": "+49 170 1234567", "msf_website": "" },
  "meta": { "page": "https://…", "utm_source": "…" },
  "turnstile": "<token, only if the form uses Turnstile>"
}
```

Error codes: `not_found` (404), `origin` (403), `method` (405), `content_type` (415), `too_large` (413),
`bad_json` (400), `captcha` (403), `upstream_timeout` / `upstream_unreachable` (504), `upstream_<status>` (502),
`config` (500).

## Setup (once)

Needs a free Cloudflare account. Run in this folder:

```bash
npx wrangler login
```

```bash
npx wrangler deploy
```

One secret per form. The name is `FORM_` + the form id in capitals, with `-` → `_`
(form id `lwt-tri-team` → secret `FORM_LWT_TRI_TEAM`, URL `/f/lwt-tri-team`):

```bash
npx wrangler secret put FORM_LWT_TRI_TEAM
```

Paste the config for that form as one line of JSON:

```json
{"webhook":"https://hook.eu1.make.com/xxxx","origins":["https://lwt-2026.webflow.io","https://lwt-running.de","https://www.lwt-running.de"],"turnstile":false}
```

- `origins`: every domain the form runs on, exactly as in the address bar (`https://`, no trailing slash).
  Add both the apex and the `www` domain.
- Changes take effect immediately, no redeploy needed.

Only if a form uses Turnstile (create a widget in the Cloudflare dashboard → Turnstile, put the site key on the page):

```bash
npx wrangler secret put TURNSTILE_SECRET
```

## Adding or changing a form

Run `npx wrangler secret put FORM_<ID>` for just that form; other forms are not touched.
Remove a form with `npx wrangler secret delete FORM_<ID>`. Keep the JSON in your password manager, not in this repo.

The older shared secret `FORMS` (`{"<id>": {…}, …}`) still works. If both exist for a form, `FORM_<ID>` wins.

## Tests

```bash
node form-proxy/test/worker.test.mjs
```

## Privacy (DSGVO) notes

- Data passes through Cloudflare (processor) on its way to Make (processor). List both in the privacy policy
  and in the client's DPA (AVV) as subprocessors.
- Cloudflare: DPA is part of the self-serve terms; certified under the EU-US Data Privacy Framework.
- Location: `wrangler.toml` sets a placement hint for Frankfurt (`aws:eu-central-1`). This is best effort, not a
  guarantee: requests are received at the visitor's nearest Cloudflare location, then the Worker runs near Frankfurt.
  Guaranteed EU-only processing needs Cloudflare's Data Localization Suite (Enterprise) and a custom domain.
- Make: use an EU zone (`hook.eu1.make.com` / `hook.eu2.make.com`).
- Turnstile loads a script from Cloudflare in the visitor's browser. Mention it in the privacy policy; it is
  usually based on legitimate interest (spam protection). Not legal advice.
