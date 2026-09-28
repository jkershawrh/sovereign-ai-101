import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
const root = fileURLToPath(new URL('../../', import.meta.url));
export const placeholder = /^registry\.invalid\/sovereign-ai-101\/(presentation|rehearsal)@sha256:0{64}$/;
export function digest(image, allowPlaceholder = false) {
  assert.equal(typeof image, 'string');
  if (allowPlaceholder && placeholder.test(image)) return;
  assert.match(image, /^[a-z0-9.-]+(?::[0-9]+)?\/[a-z0-9._/-]+@sha256:[a-f0-9]{64}$/, 'Immutable registry/repository@sha256 required; tags forbidden');
  assert.ok(!image.includes('registry.invalid/') && !/@sha256:0{64}$/.test(image), 'Unresolved image placeholder');
}
export function validateResources(items, { allowPlaceholders = false } = {}) {
  assert.equal(items.length, 8, 'Expected two Deployments, two Services, one Route, three NetworkPolicies');
  const ofKind = kind => items.filter(x => x.kind === kind);
  assert.equal(ofKind('Deployment').length, 2); assert.equal(ofKind('Service').length, 2);
  assert.equal(ofKind('Route').length, 1); assert.equal(ofKind('NetworkPolicy').length, 3);
  assert.equal(new Set(items.map(x => x.kind + '/' + x.metadata.name)).size, items.length);
  for (const item of items) {
    assert.equal(item.metadata.labels['sovereign.ai/source'], 'REHEARSAL');
    assert.equal(item.metadata.labels['sovereign.ai/delivery'], 'development');
    assert.ok(!item.metadata.namespace, 'Namespace must be selected explicitly at deployment');
  }
  for (const deployment of ofKind('Deployment')) {
    const spec = deployment.spec;
    assert.equal(spec.replicas, 1, 'Ephemeral sessions require exactly one replica');
    assert.equal(spec.strategy.type, 'Recreate', 'Prevent split in-memory sessions during rollout');
    assert.match(deployment.metadata.annotations['sovereign.ai/resources'], /Development proposal.*unmeasured/);
    const pod = spec.template.spec;
    assert.equal(pod.automountServiceAccountToken, false); assert.equal(pod.enableServiceLinks, false);
    assert.deepEqual(pod.nodeSelector, { 'kubernetes.io/os': 'linux', 'kubernetes.io/arch': 'amd64' });
    assert.equal(pod.securityContext.runAsNonRoot, true); assert.equal(pod.securityContext.seccompProfile.type, 'RuntimeDefault');
    assert.equal(pod.securityContext.runAsUser, undefined, 'Let OpenShift assign its namespace UID');
    for (const field of ['hostNetwork', 'hostPID', 'hostIPC', 'volumes', 'initContainers', 'ephemeralContainers', 'serviceAccountName']) assert.ok(!pod[field]);
    assert.equal(pod.containers.length, 1);
    const c = pod.containers[0]; digest(c.image, allowPlaceholders);
    assert.equal(c.imagePullPolicy, 'Always'); assert.equal(c.securityContext.runAsNonRoot, true);
    assert.equal(c.securityContext.allowPrivilegeEscalation, false); assert.equal(c.securityContext.readOnlyRootFilesystem, true);
    assert.deepEqual(c.securityContext.capabilities, { drop: ['ALL'] }); assert.ok(!c.securityContext.privileged);
    for (const field of ['envFrom', 'volumeMounts', 'command', 'args', 'lifecycle']) assert.ok(!c[field]);
    const env = Object.fromEntries(c.env.map(e => { assert.equal(e.valueFrom, undefined); return [e.name, e.value]; }));
    const presentation = c.name === 'presentation';
    assert.ok(presentation || c.name === 'rehearsal');
    assert.deepEqual(env, { SOVEREIGN_SOURCE: 'REHEARSAL', DELIVERY_STATUS: 'development', PORT: presentation ? '8080' : '8787',
      ...(presentation ? { SERVICE_URL: 'http://sovereign-rehearsal:8787' } : {}) });
    assert.equal(c.env.length, Object.keys(env).length);
    assert.equal(deployment.metadata.name, 'sovereign-' + c.name);
    assert.deepEqual(spec.selector.matchLabels, { 'app.kubernetes.io/name': deployment.metadata.name });
    assert.equal(spec.template.metadata.labels['app.kubernetes.io/name'], deployment.metadata.name);
    assert.equal(spec.template.metadata.labels['app.kubernetes.io/part-of'], 'sovereign-ai-101');
    assert.equal(spec.template.metadata.labels['sovereign.ai/source'], 'REHEARSAL');
    assert.equal(spec.template.metadata.labels['sovereign.ai/delivery'], 'development');
    assert.deepEqual(c.ports, [{ name: 'http', containerPort: Number(env.PORT) }]);
    for (const [probe, path] of [['readinessProbe', '/readyz'], ['livenessProbe', '/healthz'], ['startupProbe', '/healthz']]) {
      assert.deepEqual(c[probe].httpGet, { path, port: 'http' });
      assert.ok(c[probe].periodSeconds > 0);
    }
    for (const key of ['requests', 'limits']) {
      assert.match(c.resources[key].cpu, /^[1-9][0-9]*m$/); assert.match(c.resources[key].memory, /^[1-9][0-9]*Mi$/);
    }
    assert.ok(parseInt(c.resources.requests.cpu) <= parseInt(c.resources.limits.cpu));
    assert.ok(parseInt(c.resources.requests.memory) <= parseInt(c.resources.limits.memory));
  }
  for (const service of ofKind('Service')) {
    assert.equal(service.spec.type, 'ClusterIP'); assert.ok(!service.spec.externalIPs);
    assert.deepEqual(service.spec.selector, { 'app.kubernetes.io/name': service.metadata.name });
    assert.ok(['sovereign-presentation', 'sovereign-rehearsal'].includes(service.metadata.name));
    assert.deepEqual(service.spec.ports, [{ name: 'http', port: service.metadata.name.endsWith('presentation') ? 8080 : 8787, targetPort: 'http' }]);
  }
  const route = ofKind('Route')[0];
  assert.deepEqual(route.spec.to, { kind: 'Service', name: 'sovereign-presentation' });
  assert.deepEqual(route.spec.tls, { termination: 'edge', insecureEdgeTerminationPolicy: 'Redirect' });
  assert.deepEqual(route.spec.port, { targetPort: 'http' });
  assert.equal(route.spec.wildcardPolicy, 'None');
  const policies = ofKind('NetworkPolicy');
  const deny = policies.find(p => p.metadata.name === 'sovereign-deny-all').spec;
  assert.deepEqual(deny, { podSelector: { matchLabels: { 'app.kubernetes.io/part-of': 'sovereign-ai-101' } }, policyTypes: ['Ingress', 'Egress'], ingress: [], egress: [] });
  const service = policies.find(p => p.metadata.name === 'sovereign-rehearsal-network').spec;
  assert.deepEqual(service, { podSelector: { matchLabels: { 'app.kubernetes.io/name': 'sovereign-rehearsal' } }, policyTypes: ['Ingress', 'Egress'],
    ingress: [{ from: [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'sovereign-presentation' } } }], ports: [{ protocol: 'TCP', port: 8787 }] }], egress: [] });
  const presentation = policies.find(p => p.metadata.name === 'sovereign-presentation-network').spec;
  assert.deepEqual(presentation, { podSelector: { matchLabels: { 'app.kubernetes.io/name': 'sovereign-presentation' } }, policyTypes: ['Ingress', 'Egress'],
    ingress: [{ from: [{ namespaceSelector: { matchLabels: { 'network.openshift.io/policy-group': 'ingress' } } }], ports: [{ protocol: 'TCP', port: 8080 }] }],
    egress: [{ to: [{ podSelector: { matchLabels: { 'app.kubernetes.io/name': 'sovereign-rehearsal' } } }], ports: [{ protocol: 'TCP', port: 8787 }] },
      { to: [{ namespaceSelector: { matchLabels: { 'kubernetes.io/metadata.name': 'openshift-dns' } }, podSelector: { matchLabels: { 'dns.operator.openshift.io/daemonset-dns': 'default' } } }],
        ports: ['UDP', 'TCP'].flatMap(protocol => [53, 5353].map(port => ({ protocol, port }))) }] });
}
export async function resources() {
  const base = root + 'deploy/openshift/base/';
  return Promise.all((await readdir(base)).filter(x => x.endsWith('.json')).map(async name => JSON.parse(await readFile(base + name, 'utf8'))));
}
export async function validatePackaging() {
  validateResources(await resources(), { allowPlaceholders: true });
  const buildScript = await readFile(root + 'packaging/scripts/build.mjs', 'utf8');
  assert.match(buildScript, /\['build', '--no-cache'/);
  for (const file of ['Containerfile', 'Containerfile.service']) {
    const text = await readFile(root + file, 'utf8');
    assert.match(text, /ARG NODE_IMAGE=\S+@sha256:[a-f0-9]{64}/);
    assert.match(text, /ARG RUNTIME_IMAGE=gcr\.io\/distroless\/nodejs24-debian13@sha256:[a-f0-9]{64}/);
    assert.match(text, /FROM \$\{RUNTIME_IMAGE\}/);
    assert.match(text, /USER 65532:65532/); assert.match(text, /org.opencontainers.image.revision="\$\{SOURCE_REVISION\}"/);
    assert.match(text, /SOVEREIGN_SOURCE=REHEARSAL DELIVERY_STATUS=development/);
    assert.match(text, /HEALTHCHECK/); assert.ok(!/COPY\s+\.\s+\./.test(text));
    assert.ok(!/ARG.*(?:TOKEN|PASSWORD|SECRET)|ENV.*(?:TOKEN|PASSWORD|SECRET)/.test(text));
  }
  const ignore = await readFile(root + '.containerignore', 'utf8');
  for (const required of ['**\n', '**/.env*', '**/*.pem', '**/*.key', '**/credentials*', '**/node_modules/**', '**/dist/**']) assert.ok(ignore.includes(required));
  const compose = JSON.parse(await readFile(root + 'packaging/compose.json', 'utf8'));
  assert.deepEqual(Object.keys(compose.services).sort(), ['presentation', 'rehearsal']);
  assert.equal(compose.networks.rehearsal.internal, true); assert.ok(!compose.volumes && !compose.secrets);
  for (const [name, service] of Object.entries(compose.services)) {
    assert.equal(service.read_only, true); assert.equal(service.user, '1001:0'); assert.equal(service.platform, 'linux/amd64');
    assert.deepEqual(service.cap_drop, ['ALL']); assert.deepEqual(service.security_opt, ['no-new-privileges:true']);
    assert.equal(service.pull_policy, 'never'); assert.ok(!service.volumes && !service.privileged && !service.env_file);
    assert.equal(service.environment.SOVEREIGN_SOURCE, 'REHEARSAL'); assert.equal(service.environment.DELIVERY_STATUS, 'development');
    assert.ok(service.mem_limit && service.cpus && service.pids_limit && service.healthcheck);
    if (name === 'rehearsal') assert.equal(service.ports, undefined);
    else assert.deepEqual(service.ports, ['127.0.0.1:${PRESENTATION_PORT:-8080}:8080']);
  }
  // Secrets are not needed in this package. Catch common literal credential forms
  // in manifests/configuration; this is bounded lint, not a full secret scanner.
  const manifestText = JSON.stringify(await resources()) + JSON.stringify(compose);
  assert.ok(!/"(?:stringData|data|secretKeyRef|envFrom)"|Bearer\s+[A-Za-z0-9_-]{20,}|BEGIN.*PRIVATE KEY/i.test(manifestText));
  const rendered = spawnSync(process.env.KUBECTL ?? 'kubectl', ['kustomize', root + 'deploy/openshift/base'], { encoding: 'utf8' });
  assert.equal(rendered.status, 0, rendered.stderr || 'kubectl kustomize is required');
  assert.equal((rendered.stdout.match(/^kind: Deployment$/gm) ?? []).length, 2);
  assert.equal((rendered.stdout.match(/^kind: NetworkPolicy$/gm) ?? []).length, 3);
  console.log('PASS: development packaging structure, kustomize render, security, digest placeholders, probes, network isolation and no embedded credentials. Deployment remains blocked until real digests replace placeholders.');
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.length !== 2) throw new Error('Usage: node packaging/scripts/validate.mjs');
  await validatePackaging();
}
