// Tests for the form proxy Worker, with fetch mocked. Run: node form-proxy/test/worker.test.mjs
import worker from '../src/index.js';

var ORIGIN = 'https://site.webflow.io';
var env = {
  FORMS: JSON.stringify({
    'test-form': { webhook: 'https://hook.eu1.make.com/abc', origins: [ORIGIN] },
    'captcha-form': { webhook: 'https://hook.eu1.make.com/def', origins: [ORIGIN], turnstile: true }
  }),
  TURNSTILE_SECRET: 'secret'
};

// Mock upstream: records calls, answer configurable per test
var calls = [];
var upstream = function () { return new Response('Accepted', { status: 200 }); };
globalThis.fetch = async function (url, init) {
  calls.push({ url: String(url), init: init });
  if (String(url).indexOf('turnstile') > -1) {
    var token = init.body.get('response');
    return new Response(JSON.stringify({ success: token === 'good' }), { status: 200 });
  }
  return upstream(url, init);
};

function req(path, opts) {
  opts = opts || {};
  var headers = { 'Content-Type': 'application/json' };
  if (opts.origin !== null) headers.Origin = opts.origin || ORIGIN;
  for (var k in opts.headers || {}) headers[k] = opts.headers[k];
  return new Request('https://proxy.test' + path, {
    method: opts.method || 'POST', headers: headers,
    body: (opts.method || 'POST') === 'POST' ? (opts.raw !== undefined ? opts.raw : JSON.stringify(opts.body || { fields: { Name: 'Max' } })) : undefined
  });
}

var failed = 0, total = 0;
async function t(name, fn) {
  total++; calls = []; upstream = function () { return new Response('Accepted', { status: 200 }); };
  try { await fn(); console.log('ok   ' + name); }
  catch (e) { failed++; console.log('FAIL ' + name + ': ' + e.message); }
}
function eq(a, b, msg) { if (a !== b) throw new Error((msg || '') + ' expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }

await t('health check', async function () {
  eq((await worker.fetch(new Request('https://proxy.test/health'), env)).status, 200);
});
await t('unknown form → 404', async function () {
  eq((await worker.fetch(req('/f/nope'), env)).status, 404);
});
await t('form id with odd characters → 404', async function () {
  eq((await worker.fetch(req('/f/__proto__'), env)).status, 404);
});
await t('preflight from allowed origin → 204 + CORS', async function () {
  var r = await worker.fetch(req('/f/test-form', { method: 'OPTIONS' }), env);
  eq(r.status, 204); eq(r.headers.get('Access-Control-Allow-Origin'), ORIGIN);
});
await t('preflight from other origin → 403, no CORS', async function () {
  var r = await worker.fetch(req('/f/test-form', { method: 'OPTIONS', origin: 'https://evil.example' }), env);
  eq(r.status, 403); eq(r.headers.get('Access-Control-Allow-Origin'), null);
});
await t('POST from other origin → 403, nothing forwarded', async function () {
  eq((await worker.fetch(req('/f/test-form', { origin: 'https://evil.example' }), env)).status, 403);
  eq(calls.length, 0);
});
await t('POST without Origin (curl/bot) → 403', async function () {
  eq((await worker.fetch(req('/f/test-form', { origin: null }), env)).status, 403);
});
await t('GET → 405', async function () {
  eq((await worker.fetch(req('/f/test-form', { method: 'GET' }), env)).status, 405);
});
await t('wrong content type → 415', async function () {
  eq((await worker.fetch(req('/f/test-form', { headers: { 'Content-Type': 'text/plain' } }), env)).status, 415);
});
await t('invalid JSON → 400', async function () {
  eq((await worker.fetch(req('/f/test-form', { raw: '{nope' }), env)).status, 400);
});
await t('too large → 413', async function () {
  var big = JSON.stringify({ fields: { x: 'a'.repeat(70 * 1024) } });
  eq((await worker.fetch(req('/f/test-form', { raw: big }), env)).status, 413);
  eq(calls.length, 0);
});
await t('valid submit → forwarded to Make with proxy meta, ok', async function () {
  var r = await worker.fetch(req('/f/test-form', { body: { fields: { Name: 'Max', msf_website: '' }, meta: { page: '/x' } } }), env);
  eq(r.status, 200);
  var data = await r.json(); eq(data.ok, true); eq(data.message, 'Accepted');
  eq(calls.length, 1); eq(calls[0].url, 'https://hook.eu1.make.com/abc');
  var sent = JSON.parse(calls[0].init.body);
  eq(sent.fields.Name, 'Max'); eq('msf_website' in sent.fields, false, 'honeypot removed;');
  eq(sent.meta.page, '/x'); eq(sent.proxy.form, 'test-form'); eq(sent.proxy.origin, ORIGIN);
});
await t('honeypot filled → fake ok, nothing forwarded', async function () {
  var r = await worker.fetch(req('/f/test-form', { body: { fields: { Name: 'Bot', msf_website: 'x' } } }), env);
  eq(r.status, 200); eq((await r.json()).ok, true); eq(calls.length, 0);
});
await t('Make JSON answer (redirect) passed through', async function () {
  upstream = function () { return new Response('{"redirect":"/danke"}', { status: 200 }); };
  var data = await (await worker.fetch(req('/f/test-form'), env)).json();
  eq(data.redirect, '/danke'); eq(data.ok, true);
});
await t('Make error → 502', async function () {
  upstream = function () { return new Response('boom', { status: 500 }); };
  var r = await worker.fetch(req('/f/test-form'), env);
  eq(r.status, 502); eq((await r.json()).error, 'upstream_500');
});
await t('Make unreachable → 504', async function () {
  upstream = function () { throw new TypeError('network'); };
  eq((await worker.fetch(req('/f/test-form'), env)).status, 504);
});
await t('Turnstile missing token → 403', async function () {
  eq((await worker.fetch(req('/f/captcha-form'), env)).status, 403);
  eq(calls.length, 0);
});
await t('Turnstile bad token → 403, Make not called', async function () {
  eq((await worker.fetch(req('/f/captcha-form', { body: { fields: { Name: 'Max' }, turnstile: 'bad' } }), env)).status, 403);
  eq(calls.filter(function (c) { return c.url.indexOf('make.com') > -1; }).length, 0);
});
await t('Turnstile good token → forwarded, token not sent to Make', async function () {
  var r = await worker.fetch(req('/f/captcha-form', { body: { fields: { Name: 'Max' }, turnstile: 'good' } }), env);
  eq(r.status, 200);
  var make = calls.filter(function (c) { return c.url.indexOf('make.com') > -1; })[0];
  eq('turnstile' in JSON.parse(make.init.body), false);
});
await t('broken FORMS config → 500', async function () {
  eq((await worker.fetch(req('/f/test-form'), { FORMS: '{bad' })).status, 500);
});
await t('per-form secret FORM_<ID> is used', async function () {
  var e = { FORM_LWT_TRI_TEAM: JSON.stringify({ webhook: 'https://hook.eu1.make.com/own', origins: [ORIGIN] }) };
  eq((await worker.fetch(req('/f/lwt-tri-team'), e)).status, 200);
  eq(calls[0].url, 'https://hook.eu1.make.com/own');
});
await t('per-form secret wins over FORMS', async function () {
  var e = {
    FORMS: env.FORMS,
    FORM_TEST_FORM: JSON.stringify({ webhook: 'https://hook.eu1.make.com/new', origins: [ORIGIN] })
  };
  await worker.fetch(req('/f/test-form'), e);
  eq(calls[0].url, 'https://hook.eu1.make.com/new');
});
await t('FORMS still works next to per-form secrets', async function () {
  var e = { FORMS: env.FORMS, FORM_OTHER: JSON.stringify({ webhook: 'https://x', origins: [ORIGIN] }) };
  eq((await worker.fetch(req('/f/test-form'), e)).status, 200);
  eq(calls[0].url, 'https://hook.eu1.make.com/abc');
});
await t('broken per-form secret → 500, other forms unaffected', async function () {
  var e = { FORMS: env.FORMS, FORM_BROKEN: '{bad' };
  eq((await worker.fetch(req('/f/broken'), e)).status, 500);
  eq((await worker.fetch(req('/f/test-form'), e)).status, 200);
});

console.log('\n' + (total - failed) + '/' + total + ' passed');
process.exit(failed ? 1 : 0);
