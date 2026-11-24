// Local test server: serves the repo and fakes the form proxy.
// Run from the repo root: node test/server.mjs  →  http://localhost:8765/test/
//   POST /f/ok        → {"ok":true,"message":"Accepted"}
//   POST /f/redirect  → {"ok":true,"redirect":"/test/thanks.html"}
//   POST /f/flaky     → 500 on the 1st call, ok on the 2nd (tests the retry)
//   POST /f/down      → always 500
//   POST /f/slow      → ok after 1.5 s (to see the loader)
//   GET  /__last      → last received body + call counts · GET /__reset → clears them
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT || 8765);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
let state = { last: null, calls: {} };

function send(res, status, body, type) {
  res.writeHead(status, { 'Content-Type': type || 'application/json', 'Cache-Control': 'no-store' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/__last') return send(res, 200, state);
  if (url.pathname === '/__reset') { state = { last: null, calls: {} }; return send(res, 200, { ok: true }); }

  const m = url.pathname.match(/^\/f\/([a-z]+)$/);
  if (m && req.method === 'POST') {
    let raw = '';
    req.on('data', (c) => { raw += c; });
    req.on('end', () => {
      const id = m[1];
      state.calls[id] = (state.calls[id] || 0) + 1;
      try { state.last = JSON.parse(raw); } catch { state.last = raw; }
      if (id === 'ok') return send(res, 200, { ok: true, message: 'Accepted' });
      if (id === 'redirect') return send(res, 200, { ok: true, redirect: '/test/thanks.html' });
      if (id === 'flaky') return state.calls[id] === 1 ? send(res, 500, { ok: false, error: 'upstream_500' }) : send(res, 200, { ok: true });
      if (id === 'down') return send(res, 502, { ok: false, error: 'upstream_500' });
      if (id === 'slow') return setTimeout(() => send(res, 200, { ok: true }), 1500);
      return send(res, 404, { ok: false, error: 'not_found' });
    });
    return;
  }

  let file = path.join(ROOT, decodeURIComponent(url.pathname));
  if (!file.startsWith(ROOT)) return send(res, 403, 'forbidden', 'text/plain');
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html');
  if (!fs.existsSync(file)) return send(res, 404, 'not found', 'text/plain');
  send(res, 200, fs.readFileSync(file), TYPES[path.extname(file)] || 'application/octet-stream');
}).listen(PORT, () => console.log('Test server on http://localhost:' + PORT + '/test/'));
