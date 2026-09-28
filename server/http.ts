import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { CONTRACT_VERSION, LIMITS } from '../contracts/governed-inference.js';
import { BoundaryError, Runtime } from './runtime.js';

async function readJson(req: IncomingMessage): Promise<unknown> {
  if (req.headers['content-type']?.split(';')[0]?.trim() !== 'application/json') throw new BoundaryError(415, 'json_required');
  const declared = Number(req.headers['content-length']);
  if (declared > LIMITS.bodyBytes) throw new BoundaryError(413, 'body_too_large');
  return new Promise((resolve, reject) => {
    let bytes = 0; let settled = false; const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer) => {
      if (settled) return;
      bytes += chunk.length;
      if (bytes > LIMITS.bodyBytes) {
        settled = true; chunks.length = 0; reject(new BoundaryError(413, 'body_too_large')); return;
      }
      chunks.push(Buffer.from(chunk));
    });
    req.once('error', () => { settled = true; reject(new BoundaryError(422, 'interrupted_body')); });
    req.once('end', () => {
      if (settled) return;
      settled = true;
      try { resolve(JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(chunks)))); }
      catch { reject(new BoundaryError(422, 'invalid_json')); }
    });
  });
}
function send(res: ServerResponse, status: number, body: unknown) {
  if (res.destroyed) return;
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store',
    'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer' });
  res.end(JSON.stringify(body));
}
function token(req: IncomingMessage): string {
  const match = /^Bearer ([A-Za-z0-9_-]{43})$/.exec(req.headers.authorization ?? '');
  if (!match?.[1]) throw new BoundaryError(401, 'invalid_session'); return match[1];
}
function selectors(url: URL): [string, string] {
  const id = url.searchParams.get('request_id'); const correlation = url.searchParams.get('correlation_id');
  if (!id || !correlation || url.searchParams.getAll('request_id').length !== 1 || url.searchParams.getAll('correlation_id').length !== 1) {
    throw new BoundaryError(422, 'correlation_required');
  }
  return [id, correlation];
}
export function createApp(runtime = new Runtime(), { headerDeadlineMs = 5_000 }: { headerDeadlineMs?: number } = {}) {
  const headerDeadlines = new WeakMap<IncomingMessage['socket'], NodeJS.Timeout>();
  const server = createServer({ maxHeaderSize: 8_192 }, (req, res) => {
    const headerDeadline = headerDeadlines.get(req.socket);
    if (headerDeadline) {
      clearTimeout(headerDeadline);
      headerDeadlines.delete(req.socket);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => { controller.abort();
      send(res, 408, { contract_version: CONTRACT_VERSION, error: 'http_request_timeout', source: runtime.source });
      req.destroy();
    }, LIMITS.requestTimeoutMs + 1_000);
    timer.unref();
    res.once('close', () => { clearTimeout(timer); if (!res.writableFinished) controller.abort(); });
    res.once('finish', () => clearTimeout(timer));
    void (async () => {
      // Host is never trusted to construct an upstream URL. No outbound calls exist.
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const path = url.pathname; const method = req.method;
      if (method === 'GET' && path === '/healthz') return send(res, 200, { contract_version: CONTRACT_VERSION, healthy: true, source: runtime.source });
      if (method === 'GET' && path === '/readyz') { const r = runtime.ready(); return send(res, r.ready ? 200 : 503, r); }
      if (method === 'POST' && path === '/api/sessions') {
        // A browser cross-origin request cannot mint or mutate a session. No CORS is enabled.
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) throw new BoundaryError(403, 'origin_rejected');
        if (req.headers['transfer-encoding'] || Number(req.headers['content-length'] ?? 0) !== 0) throw new BoundaryError(422, 'empty_body_required');
        return send(res, 201, runtime.createSession());
      }
      const known = ['/api/route', '/api/session', '/api/session/fault', '/api/ledger', '/api/ledger/verify', '/api/receipts', '/api/receipts/verify'];
      if (!known.includes(path)) throw new BoundaryError(404, 'not_found');
      const auth = token(req); runtime.authenticate(auth);
      if (method === 'POST' && path === '/api/route') {
        const result = await runtime.route(auth, await readJson(req), controller.signal);
        return send(res, result.decision === 'allow' ? 200 : result.decision === 'deny' ? 403 : 503, result);
      }
      if (method === 'PUT' && path === '/api/session/fault') {
        const body = await readJson(req);
        if (!body || typeof body !== 'object' || Object.keys(body).length !== 1 || !('fault' in body)) throw new BoundaryError(422, 'invalid_fault');
        runtime.setFault(auth, body.fault);
        return send(res, 200, { contract_version: CONTRACT_VERSION, source: runtime.source, fault: body.fault });
      }
      if (method === 'DELETE' && path === '/api/session') {
        runtime.deleteSession(auth);
        return send(res, 200, { contract_version: CONTRACT_VERSION, source: runtime.source,
          session_removed: true, scope: 'in-memory-session-only', platform_cleanup_verified: false });
      }
      if (method === 'GET' && path === '/api/ledger') {
        const [id, correlation] = selectors(url);
        return send(res, 200, { contract_version: CONTRACT_VERSION, source: runtime.source,
          receipts: runtime.receipts(auth, id, correlation) });
      }
      if (method === 'GET' && path === '/api/ledger/verify') return send(res, 200, runtime.verify(auth, ...selectors(url)));
      if (method === 'GET' && (path === '/api/receipts' || path === '/api/receipts/verify')) {
        const [id, correlation] = selectors(url); const hash = url.searchParams.get('hash'); const type = url.searchParams.get('type');
        if (!hash || !/^[a-f0-9]{64}$/.test(hash) || !type) throw new BoundaryError(422, 'receipt_reference_required');
        const receipt = runtime.receipt(auth, id, correlation, hash, type);
        return send(res, 200, path === '/api/receipts' ? receipt : { ...runtime.verify(auth, id, correlation), receipt_hash: receipt.entry_hash });
      }
      throw new BoundaryError(405, 'method_not_allowed');
    })().catch((error: unknown) => {
      const safe = error instanceof BoundaryError ? error : new BoundaryError(500, 'internal_error');
      if (safe.status === 413) { res.setHeader('connection', 'close'); res.once('finish', () => req.destroy()); }
      send(res, safe.status, { contract_version: CONTRACT_VERSION, error: safe.code, source: runtime.source });
    });
  });
  server.requestTimeout = 5_000; server.headersTimeout = 5_000; server.keepAliveTimeout = 1_000;
  server.maxRequestsPerSocket = 100;
  server.on('connection', socket => {
    const deadline = setTimeout(() => socket.destroy(), headerDeadlineMs);
    deadline.unref();
    headerDeadlines.set(socket, deadline);
    socket.once('close', () => clearTimeout(deadline));
  });
  return server;
}
