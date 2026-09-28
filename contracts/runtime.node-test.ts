// Deliberately outside Vitest's *.test.ts glob: run with Node's native test runner.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import { Runtime, BoundaryError } from '../server/runtime.js';
import { verifyEvidence } from '../server/ledger.js';
import { createApp } from '../server/http.js';
import { request, prompts } from './fixtures/cases.js';
import type { GovernedResponse } from './governed-inference.js';

test('01 general and sensitive allow only with decision then completion receipts', async () => {
  const runtime = new Runtime(); const session = runtime.createSession();
  for (const [id, prompt, classification] of [['general', prompts.general, 'general'], ['sensitive', prompts.sensitive, 'sensitive-data']]) {
    const result = await runtime.route(session.session_token, request(id, prompt));
    assert.equal(result.classification, classification); assert.equal(result.decision, 'allow');
    assert.equal(result.execution_status, 'completed'); assert.equal(result.model_dispatch_count, 1);
    assert.equal(result.receipts.length, 2); assert.equal(result.receipts[1]?.entry_type, 'router.inference.completed');
    assert.ok(result.response); assert.equal(result.source, 'REHEARSAL'); assert.equal(result.live_qualified, false);
    const entries = runtime.receipts(session.session_token, result.request_id, result.correlation_id);
    assert.equal(entries[0]?.content.model_dispatch_count, 0);
    assert.equal(entries[1]?.content.model_dispatch_count, 1);
    assert.equal(runtime.verify(session.session_token, result.request_id, result.correlation_id).all_valid, true);
  }
});

test('dispatch spy observes an acknowledged decision before every actual model invocation', async () => {
  for (const options of [{}, { policyMode: 'deny' as const }, { policyMode: 'missing' as const },
    { ledgerMode: 'lost-ack' as const }, { ledgerMode: 'invalid-receipt' as const }]) {
    const runtime = new Runtime(options); const s = runtime.createSession();
    let actualCalls = 0;
    const original = Reflect.get(runtime, 'model') as (...args: unknown[]) => Promise<string>;
    Reflect.set(runtime, 'model', function (...args: unknown[]) {
      actualCalls++;
      const sessions = Reflect.get(runtime, 'sessions') as Map<string, { entries: { entry_type: string }[] }>;
      const entries = [...sessions.values()][0]!.entries;
      assert.equal(entries.length, 1); assert.equal(entries[0]!.entry_type, 'router.general.routed_local');
      return original.apply(runtime, args);
    });
    const r = await runtime.route(s.session_token, request());
    assert.equal(actualCalls, r.model_dispatch_count); assert.equal(actualCalls, Object.keys(options).length ? 0 : 1);
  }
});

test('in-flight cancellation, whole-request timeout and session expiry never release text', async () => {
  for (const phase of ['policy', 'model'] as const) {
    const runtime = new Runtime({ ...(phase === 'policy' ? { policyMode: 'timeout' as const } : { modelMode: 'timeout' as const }), dependencyTimeoutMs: 100 });
    const s = runtime.createSession(); const controller = new AbortController();
    const pending = runtime.route(s.session_token, request(), controller.signal);
    await delay(2); controller.abort(); const r = await pending;
    assert.equal(r.reason_code, 'request_cancelled'); assert.equal(r.model_dispatch_count, phase === 'model' ? 1 : 0);
    assert.equal(r.response, undefined); assert.deepEqual(await runtime.route(s.session_token, request()), r);
    assert.equal(runtime.verify(s.session_token, r.request_id, r.correlation_id).all_valid, false);
  }
  const timeout = new Runtime({ policyMode: 'timeout', dependencyTimeoutMs: 100, requestTimeoutMs: 2 });
  const ts = timeout.createSession();
  assert.equal((await timeout.route(ts.session_token, request())).reason_code, 'request_timeout');
  const expires = new Runtime({ sessionTtlMs: 2 }); const es = expires.createSession();
  await delay(5); await assert.rejects(expires.route(es.session_token, request()), BoundaryError);
  const rt = new Runtime({ modelMode: 'timeout', dependencyTimeoutMs: 100 }); const s = rt.createSession();
  const pending = rt.route(s.session_token, request()); await delay(2); rt.deleteSession(s.session_token);
  assert.equal((await pending).response, undefined);
  assert.throws(() => rt.authenticate(s.session_token), BoundaryError);
});

test('multi-entry chains reject a missing predecessor, altered content and incomplete phase references', async () => {
  const runtime = new Runtime(); const s = runtime.createSession();
  const first = await runtime.route(s.session_token, request('first'));
  const last = await runtime.route(s.session_token, request('last'));
  const entries = [...runtime.receipts(s.session_token, first.request_id, first.correlation_id),
    ...runtime.receipts(s.session_token, last.request_id, last.correlation_id)];
  assert.equal(verifyEvidence(last, entries, s.started_at).all_valid, true);
  assert.ok(runtime.verify(s.session_token, last.request_id, last.correlation_id).chains.every(c => c.entries_checked === 2));
  assert.equal(verifyEvidence(last, entries.slice(2), s.started_at).all_valid, false);
  const corrupt = structuredClone(entries); corrupt[0]!.content.decision = 'deny';
  assert.equal(verifyEvidence(last, corrupt, s.started_at).all_valid, false);
  const missing = structuredClone(last); missing.receipts.pop();
  assert.equal(verifyEvidence(missing, entries, s.started_at).all_valid, false);
  const wrongStatus = structuredClone(last); wrongStatus.model_dispatch_count = 0;
  assert.equal(verifyEvidence(wrongStatus, entries, s.started_at).all_valid, false);
});
test('02 injection and explicit policy false deny with zero dispatch', async () => {
  for (const policyMode of ['allow', 'deny'] as const) {
    const runtime = new Runtime({ policyMode }); const s = runtime.createSession();
    const result = await runtime.route(s.session_token, request('deny', policyMode === 'allow' ? prompts.injection : prompts.general));
    assert.equal(result.decision, 'deny'); assert.equal(result.model_dispatch_count, 0); assert.equal(result.response, undefined);
    assert.equal(result.receipts.length, 1);
  }
});
test('03 unknown or malformed policy always abstains before dispatch', async () => {
  for (const policyMode of ['timeout', 'connection', 'http-error', 'invalid-json', 'missing', 'null', 'string-false', 'rules-unavailable'] as const) {
    const runtime = new Runtime({ policyMode, dependencyTimeoutMs: 5 }); const s = runtime.createSession();
    const r = await runtime.route(s.session_token, request());
    assert.equal(r.decision, 'abstain', policyMode); assert.equal(r.model_dispatch_count, 0);
    assert.equal(r.receipts[0]?.entry_type, 'router.request.abstained'); assert.equal(r.response, undefined);
  }
});
test('04 required decision acknowledgment failures never dispatch or invent a receipt', async () => {
  for (const ledgerMode of ['timeout', 'connection', 'http-error', 'invalid-receipt', 'lost-ack'] as const) {
    const runtime = new Runtime({ ledgerMode, dependencyTimeoutMs: 5 }); const s = runtime.createSession();
    const r = await runtime.route(s.session_token, request());
    assert.equal(r.decision, 'abstain'); assert.equal(r.model_dispatch_count, 0); assert.deepEqual(r.receipts, []);
    assert.equal(r.response, undefined); assert.notEqual(r.evidence_status, 'committed');
    assert.equal(runtime.verify(s.session_token, r.request_id, r.correlation_id).all_valid, false);
    assert.deepEqual(await runtime.route(s.session_token, request()), r);
  }
});
test('05 completion acknowledgment loss and model failure withhold text after dispatch', async () => {
  for (const options of [{ ledgerMode: 'completion-failure' as const }, { modelMode: 'failure' as const }, { modelMode: 'timeout' as const }]) {
    const runtime = new Runtime({ ...options, dependencyTimeoutMs: 5 }); const s = runtime.createSession();
    const r = await runtime.route(s.session_token, request());
    assert.equal(r.decision, 'abstain'); assert.equal(r.model_dispatch_count, 1); assert.equal(r.response, undefined);
    assert.ok(['unknown', 'failed'].includes(r.execution_status));
    assert.ok(r.receipts.length >= 1); assert.deepEqual(await runtime.route(s.session_token, request()), r);
  }
});
test('06 known deny survives ledger loss, faults are session scoped and restored explicitly', async () => {
  const broken = new Runtime({ ledgerMode: 'connection' }); const bs = broken.createSession();
  const denied = await broken.route(bs.session_token, request('deny', prompts.injection));
  assert.equal(denied.decision, 'deny'); assert.equal(denied.evidence_status, 'unavailable'); assert.equal(denied.model_dispatch_count, 0);
  const runtime = new Runtime(); const a = runtime.createSession(); const b = runtime.createSession();
  runtime.setFault(a.session_token, 'policy_unavailable');
  assert.equal((await runtime.route(a.session_token, request())).reason_code, 'policy_unavailable');
  assert.equal((await runtime.route(b.session_token, request())).decision, 'allow');
  runtime.setFault(a.session_token, 'none');
  assert.equal((await runtime.route(a.session_token, request('restored'))).decision, 'allow');
});
test('07 concurrent identical retry is stable and changed ID reuse conflicts', async () => {
  const runtime = new Runtime(); const s = runtime.createSession();
  const results = await Promise.all(Array.from({ length: 10 }, () => runtime.route(s.session_token, request())));
  for (const result of results) assert.deepEqual(result, results[0]);
  assert.equal(runtime.receipts(s.session_token, results[0]!.request_id, results[0]!.correlation_id).length, 2);
  await assert.rejects(runtime.route(s.session_token, request('case-1', prompts.sensitive)), (e: unknown) => e instanceof BoundaryError && e.status === 409);
});
test('08 stale, wrong-source, wrong-hash, missing and cross-session receipts cannot verify', async () => {
  const runtime = new Runtime(); const a = runtime.createSession(); const b = runtime.createSession();
  const r = await runtime.route(a.session_token, request());
  assert.throws(() => runtime.receipts(b.session_token, r.request_id, r.correlation_id), BoundaryError);
  const entries = runtime.receipts(a.session_token, r.request_id, r.correlation_id);
  for (const corrupt of [[], entries.slice(0, 1), entries.map(e => ({ ...e, previous_hash: 'bad' })),
    entries.map(e => ({ ...e, content: { ...e.content, source: 'LIVE' as const } })),
    entries.map(e => ({ ...e, written_ts: '2000-01-01T00:00:00.000Z' })),
    entries.map(e => ({ ...e, entry_hash: '0'.repeat(64) }))]) {
    assert.equal(verifyEvidence(r, corrupt, a.started_at).all_valid, false);
  }
  const wrong = structuredClone(r); wrong.receipts[0]!.entry_hash = 'f'.repeat(64);
  assert.equal(verifyEvidence(wrong, entries, a.started_at).all_valid, false);
  assert.equal(verifyEvidence(r, entries, a.started_at).all_valid, true);
});
test('09 bounded malformed input, cancellation, expiry and privacy', async () => {
  const runtime = new Runtime(); const s = runtime.createSession();
  for (const body of [null, {}, { ...request(), prompt: '' }, { ...request(), prompt: 'x'.repeat(2001) },
    { ...request(), max_tokens: 101 }, { ...request(), max_tokens: 1.5 }, { ...request(), messages: [] },
    { ...request(), session_id: s.session_id }, { ...request(), contract_version: '2.0' }]) {
    await assert.rejects(runtime.route(s.session_token, body), BoundaryError);
  }
  const controller = new AbortController(); controller.abort();
  const cancelled = await runtime.route(s.session_token, request('cancelled'), controller.signal);
  assert.equal(cancelled.reason_code, 'request_cancelled'); assert.equal(cancelled.model_dispatch_count, 0);
  const canary = 'synthetic_patient_CANARY_abcdef_123456';
  const r = await runtime.route(s.session_token, request('private', canary));
  assert.ok(!JSON.stringify(runtime.receipts(s.session_token, r.request_id, r.correlation_id)).includes(canary));
  runtime.deleteSession(s.session_token);
  assert.throws(() => runtime.receipts(s.session_token, r.request_id, r.correlation_id), BoundaryError);
});
test('10 native HTTP endpoints authenticate, reject malformed bodies and remain honest offline', async t => {
  const server = createApp(new Runtime()); server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const addr = server.address(); assert.ok(addr && typeof addr === 'object');
  const base = `http://127.0.0.1:${addr.port}`;
  assert.equal((await fetch(`${base}/healthz`)).status, 200);
  assert.equal((await fetch(`${base}/readyz`)).status, 200);
  assert.equal((await fetch(`${base}/api/unknown`)).status, 404);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', body: '{}' })).status, 401);
  const session = await (await fetch(`${base}/api/sessions`, { method: 'POST' })).json() as { session_token: string };
  const headers = { authorization: `Bearer ${session.session_token}`, 'content-type': 'application/json' };
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers, body: '{' })).status, 422);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers, body: JSON.stringify(request('large', 'x'.repeat(15000))) })).status, 413);
  const chunkedStatus = await new Promise<number>(resolve => {
    const chunked = httpRequest(`${base}/api/route`, { method: 'POST', headers }, response => {
      response.resume(); resolve(response.statusCode!);
    });
    chunked.write('x'.repeat(13000)); chunked.end();
  });
  assert.equal(chunkedStatus, 413);
  const response = await fetch(`${base}/api/route`, { method: 'POST', headers, body: JSON.stringify(request()) });
  assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
  const r = await response.json() as GovernedResponse;
  const query = `request_id=${r.request_id}&correlation_id=${r.correlation_id}`;
  assert.equal((await fetch(`${base}/api/ledger?${query}`, { headers })).status, 200);
  const verification = await (await fetch(`${base}/api/ledger/verify?${query}`, { headers })).json() as { all_valid: boolean };
  assert.equal(verification.all_valid, true);
  const ref = r.receipts[0]!;
  assert.equal((await fetch(`${base}/api/receipts?${query}&hash=${ref.entry_hash}&type=${ref.entry_type}`, { headers })).status, 200);
  assert.equal((await fetch(`${base}/api/receipts?${query}&hash=${'0'.repeat(64)}&type=${ref.entry_type}`, { headers })).status, 404);
  assert.equal((await fetch(`${base}/api/ledger`, { headers })).status, 422);
  assert.equal((await fetch(`${base}/api/ledger?${query}`, { method: 'POST', headers })).status, 405);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers, body: JSON.stringify(request('denied', prompts.injection)) })).status, 403);
  assert.equal((await fetch(`${base}/api/session/fault`, { method: 'PUT', headers, body: JSON.stringify({ fault: 'policy_unavailable' }) })).status, 200);
  assert.equal((await fetch(`${base}/api/route`, { method: 'POST', headers, body: JSON.stringify(request('unavailable')) })).status, 503);
  for (const source of ['LIVE', 'OFFLINE'] as const) {
    const rt = new Runtime({ source }); const s = rt.createSession();
    const unavailable = await rt.route(s.session_token, request());
    assert.equal(rt.ready().ready, false); assert.equal(unavailable.source, 'OFFLINE');
    assert.equal(unavailable.decision, 'abstain'); assert.equal(unavailable.model_dispatch_count, 0);
  }
});

test('incomplete headers are closed by an absolute connection-age deadline', async t => {
  const server = createApp(new Runtime(), { headerDeadlineMs: 30 });
  server.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  t.after(() => { server.closeAllConnections(); server.close(); });
  const addr = server.address(); assert.ok(addr && typeof addr === 'object');
  const socket = connect(addr.port, '127.0.0.1');
  t.after(() => socket.destroy());
  await new Promise<void>((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  socket.write('GET /healthz HTTP/1.1\r\nHost: localhost\r\n');
  await Promise.race([
    new Promise<void>(resolve => socket.once('close', () => resolve())),
    delay(250).then(() => { throw new Error('slow header connection remained open'); }),
  ]);
  assert.equal(socket.destroyed, true);
});
