import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { rehearsalOnly } from '../runtime/config.mjs';
import { journey } from './journey.mjs';
rehearsalOnly();
if (process.argv.length !== 2) throw new Error('No release or certification arguments are supported');
const execute = promisify(execFile);
const engine = process.env.CONTAINER_ENGINE ?? 'podman';
if (!['podman', 'docker'].includes(engine)) throw new Error('CONTAINER_ENGINE must be podman or docker');
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const id = `sovereign-dev-${randomBytes(6).toString('hex')}`;
const label = `sovereign.ai.journey=${id}`;
console.log(`development / REHEARSAL only; owned run: ${id}`);
const containers = [];
let networkCreated = false;
let interrupted = false;
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { interrupted = true; });
async function run(args) {
  try { return (await execute(engine, args, { timeout: 60000, maxBuffer: 1024 * 1024 })).stdout.trim(); }
  catch (error) { throw new Error(`${engine} ${args[0]} failed: ${String(error.stderr ?? error.message).slice(0, 1000)}`); }
}
async function checkClean() {
  assert.equal(await run(['ps', '-aq', '--filter', `label=${label}`]), '', 'Owned containers remain');
  assert.equal(await run(['network', 'ls', '-q', '--filter', `label=${label}`]), '', 'Owned networks remain');
  assert.equal(await run(['volume', 'ls', '-q', '--filter', `label=${label}`]), '', 'Owned volumes remain');
}
async function cleanup() {
  // Delete only resources belonging to this random run, never a namespace/global prune.
  const errors = [];
  for (const name of [...containers].reverse()) {
    const present = await run(['ps', '-aq', '--filter', `label=${label}`, '--filter', `name=${name}`]);
    if (present) try { await run(['rm', '-f', name]); } catch (error) { errors.push(error); }
  }
  if (networkCreated && await run(['network', 'ls', '-q', '--filter', `label=${label}`])) {
    try { await run(['network', 'rm', id]); } catch (error) { errors.push(error); }
  }
  await checkClean();
  if (errors.length) throw new AggregateError(errors, 'Owned development resource cleanup failed');
}
let report;
try {
  const revision = (await execute('git', ['rev-parse', 'HEAD'])).stdout.trim();
  const images = {};
  for (const role of ['presentation', 'rehearsal']) {
    const input = process.env[role.toUpperCase() + '_IMAGE'] ?? `localhost/sovereign-ai-101-${role}:development-${revision.slice(0, 12)}`;
    const inspected = JSON.parse(await run(['image', 'inspect', input]))[0];
    assert.equal(inspected.Os, 'linux'); assert.equal(inspected.Architecture, 'amd64');
    assert.equal(inspected.Config.User, '65532:65532');
    assert.equal(inspected.Config.Labels['io.sovereign.source'], 'REHEARSAL');
    assert.equal(inspected.Config.Labels['io.sovereign.delivery'], 'development');
    assert.match(inspected.Config.Labels['org.opencontainers.image.revision'], /^[a-f0-9]{40}$/);
    images[role] = inspected.Id;
  }
  // Set ownership before create so cleanup also covers interrupted CLI responses.
  networkCreated = true;
  await run(['network', 'create', '--internal', '--label', label, id]);
  for (const [role, port] of [['rehearsal', 8787], ['presentation', 8080]]) {
    const name = `${id}-${role}`;
    containers.push(name);
    await run(['run', '-d', '--name', name, '--label', label, '--platform', 'linux/amd64', '--pull=never',
      '--network', id, '--network-alias', role, '--read-only', '--user', '100123:0', '--cap-drop=ALL',
      '--security-opt=no-new-privileges:true', '--memory=256m', '--cpus=0.5', '--pids-limit=100',
      '-e', 'SOVEREIGN_SOURCE=REHEARSAL', '-e', 'DELIVERY_STATUS=development', '-e', `PORT=${port}`,
      ...(role === 'presentation' ? ['-e', 'SERVICE_URL=http://rehearsal:8787', '-p', '127.0.0.1::8080'] : []), images[role]]);
    const inspected = JSON.parse(await run(['inspect', name]))[0];
    assert.equal(inspected.HostConfig.ReadonlyRootfs, true); assert.equal(inspected.Config.User, '100123:0');
    assert.equal(await run(['exec', name, '/nodejs/bin/node', '-e', 'process.stdout.write(String(process.getuid()))']), '100123');
    await run(['exec', name, '/nodejs/bin/node', '-e', "try { require('fs').writeFileSync('/app/readonly-probe', 'x'); process.exit(1); } catch (e) { if(e.code !== 'EROFS' && e.code !== 'EACCES') process.exit(2); }"]);
    // The final filesystem carries no application dependency tree or credential files.
    await run(['exec', name, '/nodejs/bin/node', '-e', "const fs=require('fs');const walk=p=>fs.readdirSync(p,{withFileTypes:true}).forEach(e=>{const f=p+'/'+e.name;if(/^\\.env|\\.(pem|key)$|^credentials|^node_modules$/.test(e.name))throw Error('unexpected file');if(e.isDirectory())walk(f)});walk('/app');"]);
    let ready = false;
    for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
      try { await run(['exec', name, '/nodejs/bin/node', 'packaging/runtime/healthcheck.mjs']); ready = true; break; }
      catch { await new Promise(resolve => setTimeout(resolve, 500)); }
    }
    assert.ok(ready, `${role} readiness failed or interrupted`);
  }
  const published = await run(['port', `${id}-presentation`, '8080/tcp']);
  assert.match(published, /^127\.0\.0\.1:[0-9]+$/);
  const origin = `http://${published}`;
  const index = await fetch(origin, { signal: AbortSignal.timeout(5000) });
  assert.equal(index.status, 200); assert.match(await index.text(), /<html/);
  report = await journey(origin);
  assert.ok(!interrupted, 'Journey interrupted');
  // Container entrypoint, not just a helper test: LIVE must fail before listening.
  for (const [role, invalidEnv] of [['rehearsal', 'SOVEREIGN_SOURCE=LIVE'], ['presentation', 'DELIVERY_STATUS=certified']]) {
    const name = `${id}-refuse-${role}`; containers.push(name);
    await run(['create', '--name', name, '--label', label, '--network=none', '--read-only', '--user', '100123:0',
      '--cap-drop=ALL', '--security-opt=no-new-privileges:true', '-e', invalidEnv, images[role]]);
    await run(['start', name]);
    const code = await run(['wait', name]); assert.notEqual(code, '0', 'Live/certification label accepted');
  }
  // Restore/restart behavior: no state survives service replacement/restart.
  const session = await (await fetch(origin + '/api/sessions', { method: 'POST' })).json();
  assert.ok(session.session_token);
  await run(['restart', `${id}-rehearsal`]);
  let restarted = false;
  for (let attempt = 0; attempt < 40 && !interrupted; attempt++) {
    try { await run(['exec', `${id}-rehearsal`, '/nodejs/bin/node', 'packaging/runtime/healthcheck.mjs']); restarted = true; break; }
    catch { await new Promise(resolve => setTimeout(resolve, 500)); }
  }
  assert.ok(restarted);
  const stale = await fetch(origin + '/api/session', { method: 'DELETE', headers: { Authorization: `Bearer ${session.session_token}` }, signal: AbortSignal.timeout(5000) });
  assert.equal(stale.status, 401, 'Restart retained a session');
  report = { ...report, images, arbitrary_nonroot_uid: 100123, read_only_runtime_verified: true, restart_invalidated_session: true };
  // Presentation process stays healthy but readiness must fail with its service down.
  await run(['stop', `${id}-rehearsal`]);
  assert.equal((await fetch(origin + '/healthz', { signal: AbortSignal.timeout(5000) })).status, 200);
  assert.equal((await fetch(origin + '/readyz', { signal: AbortSignal.timeout(5000) })).status, 503);
  report.dependency_failure_readiness_verified = true;
} finally {
  await cleanup();
  await cleanup(); // A second teardown is safe and must still prove empty ownership.
  console.log('Owned development containers/networks/volumes: none. Images/build cache retained intentionally.');
}
console.log(JSON.stringify({ ...report, owned_runtime_cleanup_verified: true, image_cache_cleanup_verified: false }, null, 2));
