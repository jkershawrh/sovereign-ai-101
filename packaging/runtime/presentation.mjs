import { createServer, request as httpRequest } from 'node:http';
import { request as httpsRequest } from 'node:https';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';
import { rehearsalOnly, port, upstream, shutdown } from './config.mjs';
rehearsalOnly();
const target = upstream();
const root = fileURLToPath(new URL('../../dist/', import.meta.url));
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.woff2': 'font/woff2', '.ico': 'image/x-icon' };
const hop = new Set(['host', 'connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailer', 'transfer-encoding', 'upgrade']);
function cleanHeaders(headers) {
  const blocked = new Set([...hop, ...String(headers.connection ?? '').toLowerCase().split(',').map(s => s.trim())]);
  return Object.fromEntries(Object.entries(headers).filter(([key]) => !blocked.has(key) && !key.startsWith('x-forwarded-')));
}
function json(res, status, body) {
  if (res.headersSent || res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(body));
}
const server = createServer({ maxHeaderSize: 8192, requestTimeout: 5000, headersTimeout: 5000 }, (req, res) => {
  void (async () => {
    const url = new URL(req.url, 'http://presentation');
    if (url.pathname === '/healthz') return json(res, 200, { healthy: true, source: 'REHEARSAL', live_qualified: false });
    if (url.pathname === '/readyz') {
      try {
        const response = await fetch(new URL('/readyz', target), { signal: AbortSignal.timeout(2000), redirect: 'error' });
        const body = await response.json();
        const ready = response.ok && body.ready === true && body.source === 'REHEARSAL' && body.live_qualified === false;
        return json(res, ready ? 200 : 503, { ready, source: 'REHEARSAL', live_qualified: false });
      } catch { return json(res, 503, { ready: false, source: 'REHEARSAL', live_qualified: false }); }
    }
    if (url.pathname.startsWith('/api/')) {
      // Reject foreign browser origins at the edge. Do not trust forwarded headers
      // supplied by a client; TLS can terminate at the OpenShift Route.
      if (req.headers.origin && ![`http://${req.headers.host}`, `https://${req.headers.host}`].includes(req.headers.origin)) {
        return json(res, 403, { error: 'origin_rejected', source: 'REHEARSAL' });
      }
      const headers = cleanHeaders(req.headers);
      if (req.headers.origin) headers.origin = target.origin;
      const outgoing = (target.protocol === 'https:' ? httpsRequest : httpRequest)(new URL(url.pathname + url.search, target), {
        method: req.method, headers, timeout: 4000,
      }, response => {
        res.writeHead(response.statusCode, { ...cleanHeaders(response.headers), 'cache-control': 'no-store' });
        response.pipe(res);
        response.on('error', () => res.destroy());
      });
      const deadline = setTimeout(() => outgoing.destroy(), 5000);
      outgoing.on('close', () => clearTimeout(deadline));
      outgoing.on('timeout', () => outgoing.destroy());
      outgoing.on('error', () => { if (res.headersSent) res.destroy(); else json(res, 503, { error: 'rehearsal_unavailable', source: 'OFFLINE' }); });
      req.on('aborted', () => outgoing.destroy());
      res.on('close', () => { if (!res.writableFinished) outgoing.destroy(); });
      req.pipe(outgoing);
      return;
    }
    if (!['GET', 'HEAD'].includes(req.method)) return json(res, 405, { error: 'method_not_allowed' });
    const path = decodeURIComponent(url.pathname);
    if (path.includes('\0') || path.split('/').some(part => part.startsWith('.') && part !== '')) return json(res, 404, { error: 'not_found' });
    let file = resolve(root, '.' + path);
    if (file !== resolve(root) && !file.startsWith(root.endsWith(sep) ? root : root + sep)) return json(res, 404, { error: 'not_found' });
    let info = await stat(file).catch(() => null);
    if (info?.isDirectory()) { file = resolve(file, 'index.html'); info = await stat(file).catch(() => null); }
    if (!info?.isFile() && !extname(path)) { file = resolve(root, 'index.html'); info = await stat(file).catch(() => null); }
    if (!info?.isFile()) return json(res, 404, { error: 'not_found' });
    res.writeHead(200, { 'content-type': mime[extname(file)] ?? 'application/octet-stream', 'content-length': info.size,
      'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
    if (req.method === 'HEAD') res.end(); else createReadStream(file).on('error', () => res.destroy()).pipe(res);
  })().catch(() => json(res, 400, { error: 'invalid_request' }));
});
server.keepAliveTimeout = 1000;
server.maxRequestsPerSocket = 100;
server.listen(port(), '0.0.0.0', () => console.log('development / REHEARSAL presentation; live_qualified=false'));
shutdown(server);
