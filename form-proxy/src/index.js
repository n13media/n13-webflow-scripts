/**
 * N13 Form Proxy · Cloudflare Worker
 *
 * Receives form submissions from Webflow sites and forwards them to a Make webhook.
 * The real webhook URLs never appear on the website: the page only knows
 *   https://<worker>/f/<formId>
 *
 * Per request it checks: method, allowed origin (CORS), size, JSON body, honeypot
 * and (optionally) a Cloudflare Turnstile token. Nothing is logged or stored here;
 * the body is passed through to Make and Make's answer is passed back to the browser.
 *
 * Config (Worker secrets, never in the repo):
 *   FORM_<ID>        one secret per form (recommended), id upper-cased with "-" → "_", e.g.
 *                    FORM_LWT_TRI_TEAM = {"webhook":"https://hook.eu1.make.com/…",
 *                                         "origins":["https://www.example.de","https://example.webflow.io"],
 *                                         "turnstile":false}
 *   FORMS            optional shared map {"<id>": {…}} (older setup); FORM_<ID> wins if both exist
 *   TURNSTILE_SECRET Turnstile secret key (only needed if a form has "turnstile": true)
 */

var MAX_BODY_BYTES = 64 * 1024;       // plain form data only, no uploads
var UPSTREAM_TIMEOUT_MS = 10000;      // give Make 10 s, the browser script retries once
var MAX_RESPONSE_BYTES = 16 * 1024;   // what we pass back from Make (e.g. {"redirect": "…"})
var HONEYPOT_FIELD = 'msf_website';
var TURNSTILE_FIELD = 'cf-turnstile-response';

export default {
  async fetch(request, env) {
    var url = new URL(request.url);
    var origin = request.headers.get('Origin') || '';

    if (url.pathname === '/' || url.pathname === '/health') {
      return text('ok', 200);
    }

    var match = url.pathname.match(/^\/f\/([a-z0-9][a-z0-9-]{0,63})$/);
    if (!match) return json({ ok: false, error: 'not_found' }, 404);

    var form;
    try { form = loadForm(env, match[1]); }
    catch (e) { return json({ ok: false, error: 'config' }, 500); }
    if (!form || !form.webhook) return json({ ok: false, error: 'not_found' }, 404);
    if (!isValidWebhook(form.webhook)) return json({ ok: false, error: 'config_webhook' }, 500);

    var allowed = (form.origins || []).indexOf(origin) > -1;
    var cors = allowed ? corsHeaders(origin) : {};

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: allowed ? 204 : 403, headers: cors });
    }
    if (request.method !== 'POST') return json({ ok: false, error: 'method' }, 405, cors);
    if (!allowed) return json({ ok: false, error: 'origin' }, 403);

    // Size check before reading everything into memory
    var declared = parseInt(request.headers.get('Content-Length') || '0', 10);
    if (declared > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413, cors);
    if (!/^application\/json\b/i.test(request.headers.get('Content-Type') || '')) {
      return json({ ok: false, error: 'content_type' }, 415, cors);
    }

    var raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) return json({ ok: false, error: 'too_large' }, 413, cors);

    var body;
    try { body = JSON.parse(raw); } catch (e) { body = null; }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return json({ ok: false, error: 'bad_json' }, 400, cors);
    }

    var fields = body.fields && typeof body.fields === 'object' ? body.fields : body;

    // Honeypot filled → pretend success, send nothing
    if (fields[HONEYPOT_FIELD]) return json({ ok: true }, 200, cors);

    if (form.turnstile) {
      var token = body.turnstile || fields[TURNSTILE_FIELD];
      var ip = request.headers.get('CF-Connecting-IP') || '';
      var passed = await verifyTurnstile(token, ip, env.TURNSTILE_SECRET);
      if (!passed) return json({ ok: false, error: 'captcha' }, 403, cors);
    }

    // Never forward protection fields to Make
    delete fields[HONEYPOT_FIELD];
    delete fields[TURNSTILE_FIELD];
    delete body.turnstile;

    body.proxy = { form: match[1], origin: origin, receivedAt: new Date().toISOString() };

    var upstream;
    try {
      upstream = await fetchWithTimeout(form.webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }, UPSTREAM_TIMEOUT_MS);
    } catch (e) {
      return json({ ok: false, error: e.name === 'AbortError' ? 'upstream_timeout' : 'upstream_unreachable' }, 504, cors);
    }

    // Pass Make's answer through (e.g. a custom webhook response with {"redirect": "/danke"})
    var answer = (await upstream.text()).slice(0, MAX_RESPONSE_BYTES);
    if (!upstream.ok) return json({ ok: false, error: 'upstream_' + upstream.status }, 502, cors);

    var parsed = null;
    try { parsed = JSON.parse(answer); } catch (e) {}
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.ok === undefined) parsed.ok = true;
      return json(parsed, 200, cors);
    }
    return json({ ok: true, message: answer }, 200, cors);
  }
};

/**
 * Form config lookup, per form first:
 *   FORM_<ID>  one form, e.g. FORM_LWT_TRI_TEAM = {"webhook":"…","origins":[…],"turnstile":false}
 *   FORMS      legacy/shared map {"<id>": {…}, …}
 * Throws on invalid JSON (→ 500 "config").
 */
function loadForm(env, id) {
  var own = env['FORM_' + id.toUpperCase().replace(/-/g, '_')];
  if (own) return JSON.parse(own);
  var forms = JSON.parse(env.FORMS || '{}');
  return Object.prototype.hasOwnProperty.call(forms, id) ? forms[id] : null;
}

// The webhook must be a plain https URL (catches "<https://…>", missing https://, spaces, line breaks)
function isValidWebhook(value) {
  if (typeof value !== 'string' || value !== value.trim() || /\s/.test(value)) return false;
  try { return new URL(value).protocol === 'https:'; } catch (e) { return false; }
}

async function verifyTurnstile(token, ip, secret) {
  if (!token || !secret) return false;
  var form = new FormData();
  form.append('secret', secret);
  form.append('response', String(token));
  if (ip) form.append('remoteip', ip);
  try {
    var res = await fetchWithTimeout('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST', body: form
    }, 5000);
    var data = await res.json();
    return data && data.success === true;
  } catch (e) {
    return false;
  }
}

async function fetchWithTimeout(resource, init, ms) {
  var ctrl = new AbortController();
  var timer = setTimeout(function () { ctrl.abort(); }, ms);
  try {
    init.signal = ctrl.signal;
    return await fetch(resource, init);
  } finally {
    clearTimeout(timer);
  }
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function json(data, status, headers) {
  var h = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
  for (var k in headers || {}) h[k] = headers[k];
  return new Response(JSON.stringify(data), { status: status, headers: h });
}

function text(body, status) {
  return new Response(body, { status: status, headers: { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' } });
}
