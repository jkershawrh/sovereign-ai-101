import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { digest, resources, validateResources } from './validate.mjs';
import { rehearsalOnly } from '../runtime/config.mjs';
rehearsalOnly();
if (process.argv.length !== 2) throw new Error('No release or certification arguments supported');
const images = { presentation: process.env.PRESENTATION_IMAGE, rehearsal: process.env.REHEARSAL_IMAGE };
Object.values(images).forEach(image => digest(image));
if (!/^[a-f0-9]{40}$/.test(process.env.SOURCE_REVISION ?? '')) throw new Error('SOURCE_REVISION must be a full reviewed commit');
const items = await resources();
for (const item of items) {
  item.metadata.annotations = { ...item.metadata.annotations, 'org.opencontainers.image.revision': process.env.SOURCE_REVISION };
  if (item.kind === 'Deployment') {
    const container = item.spec.template.spec.containers[0]; container.image = images[container.name];
    item.spec.template.metadata.annotations = { 'org.opencontainers.image.revision': process.env.SOURCE_REVISION };
  }
}
validateResources(items);
const directory = await mkdtemp(join(tmpdir(), 'sovereign-render-'));
try {
  const files = items.map((_, i) => `${i}.json`);
  await Promise.all(items.map((item, i) => writeFile(join(directory, files[i]), JSON.stringify(item))));
  await writeFile(join(directory, 'kustomization.yaml'), JSON.stringify({ apiVersion: 'kustomize.config.k8s.io/v1beta1', kind: 'Kustomization', resources: files }));
  const result = spawnSync(process.env.KUBECTL ?? 'kubectl', ['kustomize', directory], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error(result.stderr || 'kustomize failed');
  process.stdout.write('# DEVELOPMENT / REHEARSAL ONLY: certified=false, orderable=false, promotion_eligible=false\n' + result.stdout);
} finally { await rm(directory, { recursive: true, force: true }); }
