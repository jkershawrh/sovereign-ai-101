import { mkdtemp, mkdir, readFile, writeFile, access, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { stageContext } from '../scripts/context.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';
import { rehearsalOnly, upstream, port } from '../runtime/config.mjs';
import { resources, validateResources, digest } from '../scripts/validate.mjs';
import { journey } from '../scripts/journey.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
test('development only; explicit live/offline/certification labels refuse', () => {
  rehearsalOnly({}); rehearsalOnly({ SOVEREIGN_SOURCE: 'REHEARSAL', DELIVERY_STATUS: 'development' });
  for (const mode of ['LIVE', 'OFFLINE', 'live', 'certified', 'GREEN-live', '']) assert.throws(() => rehearsalOnly({ SOVEREIGN_SOURCE: mode }));
  for (const label of ['certified', 'production', 'LIVE', 'GREEN-live', 'orderable', 'promotion_eligible']) assert.throws(() => rehearsalOnly({ DELIVERY_STATUS: label }));
  assert.equal(port({}, 8787), 8787); assert.throws(() => port({ PORT: '80' }));
  for (const url of ['https://user:password@example.com', 'file:///etc/passwd', 'https://example.com/path', 'http://example.com?secret=value']) assert.throws(() => upstream(url));
});
test('deployment rejects mutable images, placeholders, unsafe contexts and credentials', async () => {
  const base = await resources();
  validateResources(base, { allowPlaceholders: true }); assert.throws(() => validateResources(base));
  for (const image of ['repo:latest', 'registry.example/repo:v1', 'registry.example/repo:tag@sha256:' + 'a'.repeat(64), 'registry.example/repo@sha256:short']) assert.throws(() => digest(image));
  digest('registry.example/repo@sha256:' + 'a'.repeat(64));
  const mutations = [
    c => c.securityContext.readOnlyRootFilesystem = false,
    c => c.securityContext.allowPrivilegeEscalation = true,
    c => c.securityContext.runAsNonRoot = false,
    c => c.securityContext.capabilities.drop = [],
    c => c.env.push({ name: 'PASSWORD', value: 'fixture-test-only' }),
    c => c.env.find(e => e.name === 'SOVEREIGN_SOURCE').value = 'LIVE',
    c => c.image = 'registry.example/repo:latest',
    c => c.readinessProbe.httpGet.path = '/healthz',
    c => c.resources = {},
  ];
  for (const mutate of mutations) {
    const changed = structuredClone(base); mutate(changed.find(x => x.kind === 'Deployment').spec.template.spec.containers[0]);
    assert.throws(() => validateResources(changed, { allowPlaceholders: true }));
  }
  for (const mutate of [
    p => p.automountServiceAccountToken = true,
    p => p.hostNetwork = true,
    p => p.securityContext.runAsUser = 0,
    p => p.nodeSelector['kubernetes.io/arch'] = 'arm64',
  ]) {
    const changed = structuredClone(base); mutate(changed.find(x => x.kind === 'Deployment').spec.template.spec);
    assert.throws(() => validateResources(changed, { allowPlaceholders: true }));
  }
  const changed = structuredClone(base);
  changed.find(x => x.metadata.name === 'sovereign-rehearsal-network').spec.egress = [{}];
  assert.throws(() => validateResources(changed, { allowPlaceholders: true }));
});
async function freePort() {
  const server = createServer(); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const value = server.address().port; await new Promise(resolve => server.close(resolve)); return value;
}
async function waitFor(base, child) {
  for (let n = 0; n < 60; n++) {
    if (child.exitCode !== null) throw new Error('Packaging runtime exited early');
    try { if ((await fetch(base + '/readyz', { signal: AbortSignal.timeout(500) })).ok) return; } catch {}
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  throw new Error('Runtime readiness timed out');
}
async function stop(child) {
  if (child.exitCode !== null) return;
  child.kill('SIGTERM');
  await Promise.race([once(child, 'exit'), new Promise((_, reject) => { const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Runtime failed graceful cleanup')); }, 5000); timer.unref(); })]);
}
test('real packaged proxy: same-origin journey, foreign origin rejection, missing upstream and cleanup', { timeout: 30000 }, async () => {
  const backendPort = await freePort(); const frontendPort = await freePort();
  const children = [];
  try {
    const service = spawn(process.execPath, ['packaging/runtime/service.mjs'], { cwd: root, env: { ...process.env, PORT: String(backendPort), SOVEREIGN_SOURCE: 'REHEARSAL', DELIVERY_STATUS: 'development' }, stdio: 'ignore' });
    children.push(service); await waitFor(`http://127.0.0.1:${backendPort}`, service);
    const presentation = spawn(process.execPath, ['packaging/runtime/presentation.mjs'], { cwd: root, env: { ...process.env, PORT: String(frontendPort), SERVICE_URL: `http://127.0.0.1:${backendPort}`, SOVEREIGN_SOURCE: 'REHEARSAL', DELIVERY_STATUS: 'development' }, stdio: 'ignore' });
    children.push(presentation); const origin = `http://127.0.0.1:${frontendPort}`;
    await waitFor(origin, presentation);
    const result = await journey(origin); assert.equal(result.session_cleanup_verified, true); assert.equal(result.results.length, 3);
    // A 200/all_valid response with empty or mismatched proof must fail, and
    // that failure must still delete the newly issued session.
    for (const corrupt of [v => ({ ...v, chains: [] }), v => ({ ...v, correlation_id: 'wrong-correlation' }), v => ({ ...v, matched_entry_ids: [] })]) {
      const nativeFetch = globalThis.fetch;
      let issuedToken; let deleted = false;
      globalThis.fetch = async (url, options) => {
        const response = await nativeFetch(url, options);
        if (String(url).endsWith('/api/sessions')) issuedToken = (await response.clone().json()).session_token;
        if (String(url).endsWith('/api/session') && options?.method === 'DELETE' && response.status === 200) deleted = true;
        if (String(url).includes('/api/ledger/verify?')) return new Response(JSON.stringify(corrupt(await response.json())), { status: 200, headers: { 'Content-Type': 'application/json' } });
        return response;
      };
      try { await assert.rejects(journey(origin)); }
      finally { globalThis.fetch = nativeFetch; }
      assert.equal(deleted, true, 'Failed evidence must still clean its session');
      assert.ok(issuedToken);
      assert.equal((await fetch(origin + '/api/session', { method: 'DELETE', headers: { Authorization: `Bearer ${issuedToken}` } })).status, 401);
    }
    assert.equal((await fetch(origin + '/api/sessions', { method: 'POST', headers: { Origin: 'https://foreign.invalid', 'X-Forwarded-Host': 'foreign.invalid' } })).status, 403);
    const tlsSession = await fetch(origin + '/api/sessions', { method: 'POST', headers: { Origin: `https://127.0.0.1:${frontendPort}` } });
    assert.equal(tlsSession.status, 201);
    const session = await tlsSession.json();
    assert.equal((await fetch(origin + '/api/session', { method: 'DELETE', headers: { Authorization: `Bearer ${session.session_token}` } })).status, 200);
    for (const path of ['/.env', '/package.json', '/server/runtime.ts']) assert.equal((await fetch(origin + path)).status, 404);
    const index = await fetch(origin); assert.equal(index.status, 200); assert.match(await index.text(), /<html/);
    await stop(service);
    assert.equal((await fetch(origin + '/healthz')).status, 200);
    assert.equal((await fetch(origin + '/readyz')).status, 503);
    assert.equal((await fetch(origin + '/api/sessions', { method: 'POST' })).status, 503);
  } finally { for (const child of children.reverse()) await stop(child); }
});
test('container launchers and render command refuse live/certified modes before startup', () => {
  for (const file of ['runtime/service.mjs', 'runtime/presentation.mjs', 'scripts/render.mjs', 'scripts/build.mjs', 'scripts/dev.mjs']) {
    for (const override of [{ SOVEREIGN_SOURCE: 'LIVE' }, { DELIVERY_STATUS: 'certified' }]) {
      const result = spawnSync(process.execPath, ['packaging/' + file], { cwd: root, env: { ...process.env, ...override }, timeout: 3000, encoding: 'utf8' });
      assert.notEqual(result.status, 0); assert.match(result.stderr, /development.*REHEARSAL only/);
    }
  }
  const empty = spawnSync(process.execPath, ['packaging/scripts/render.mjs'], { cwd: root, env: { PATH: process.env.PATH }, timeout: 3000 });
  assert.notEqual(empty.status, 0);
});

test('build snapshot excludes credentials, local builds and repository metadata; symlinks fail closed', async () => {
  const { symlink } = await import('node:fs/promises');
  const fixture = await mkdtemp(join(tmpdir(), 'sovereign-context-test-'));
  let context;
  try {
    for (const file of ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json', 'vite.config.ts', 'Containerfile', 'Containerfile.service', '.containerignore']) await writeFile(join(fixture, file), 'fixture');
    for (const dir of ['src', 'public', 'server/dist', 'contracts', 'packaging/runtime', '.git']) await mkdir(join(fixture, dir), { recursive: true });
    await writeFile(join(fixture, 'public/asset.svg'), '<svg/>');
    for (const file of ['public/.env.local', 'public/test.key', 'public/credentials.json', 'server/dist/stale.js', '.git/config']) await writeFile(join(fixture, file), 'test-fixture-only');
    context = await stageContext(fixture);
    assert.equal(await readFile(join(context, '.dockerignore'), 'utf8'), 'fixture');
    assert.equal(await readFile(join(context, 'public/asset.svg'), 'utf8'), '<svg/>');
    for (const file of ['public/.env.local', 'public/test.key', 'public/credentials.json', 'server/dist', '.git']) await assert.rejects(access(join(context, file)));
    await symlink(join(fixture, 'package.json'), join(fixture, 'public/linked-secret'));
    await assert.rejects(stageContext(fixture), /symlinks require explicit review/);
  } finally {
    if (context) await rm(context, { recursive: true, force: true });
    await rm(fixture, { recursive: true, force: true });
  }
});

test('deployment render resolves only full digest references and records source revision', () => {
  const env = { PATH: process.env.PATH, SOURCE_REVISION: 'b'.repeat(40),
    PRESENTATION_IMAGE: 'registry.example/owner/presentation@sha256:' + 'a'.repeat(64),
    REHEARSAL_IMAGE: 'registry.example/owner/rehearsal@sha256:' + 'c'.repeat(64) };
  const valid = spawnSync(process.execPath, ['packaging/scripts/render.mjs'], { cwd: root, env, timeout: 10000, encoding: 'utf8' });
  assert.equal(valid.status, 0, valid.stderr);
  assert.ok(!valid.stdout.includes('registry.invalid'));
  assert.ok(valid.stdout.includes(env.PRESENTATION_IMAGE) && valid.stdout.includes(env.REHEARSAL_IMAGE));
  assert.ok(valid.stdout.includes(env.SOURCE_REVISION));
  assert.equal((valid.stdout.match(/^kind: Deployment$/gm) ?? []).length, 2);
  for (const invalid of [{ PRESENTATION_IMAGE: 'registry.example/owner/presentation:latest' }, { SOURCE_REVISION: 'short' }, { REHEARSAL_IMAGE: 'registry.example/owner/rehearsal@sha256:' + '0'.repeat(64) }]) {
    const result = spawnSync(process.execPath, ['packaging/scripts/render.mjs'], { cwd: root, env: { ...env, ...invalid }, timeout: 10000, encoding: 'utf8' });
    assert.notEqual(result.status, 0); assert.equal(result.stdout, '');
  }
});
