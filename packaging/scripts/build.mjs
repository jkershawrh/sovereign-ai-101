import { rm } from 'node:fs/promises';
import { stageContext } from './context.mjs';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { rehearsalOnly } from '../runtime/config.mjs';
rehearsalOnly();
if (process.argv.length > 2) throw new Error('No release or certification arguments are supported');
process.chdir(fileURLToPath(new URL('../../', import.meta.url)));
const engine = process.env.CONTAINER_ENGINE ?? 'podman';
if (!['podman', 'docker'].includes(engine)) throw new Error('CONTAINER_ENGINE must be podman or docker');
function run(command, args, capture = false) {
  const result = spawnSync(command, args, { stdio: capture ? 'pipe' : 'inherit', encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`${command} failed`);
  return result.stdout?.trim();
}
const revision = run('git', ['rev-parse', 'HEAD'], true);
if (!/^[a-f0-9]{40}$/.test(revision)) throw new Error('Full source revision required');
const dirty = run('git', ['status', '--porcelain'], true) !== '';
const context = await stageContext(process.cwd());
try {
for (const [role, file] of [['presentation', 'Containerfile'], ['rehearsal', 'Containerfile.service']]) {
  const image = `localhost/sovereign-ai-101-${role}:development-${revision.slice(0, 12)}`;
  // Release identity is carried in image labels. Disable the layer cache so a
  // previously built LABEL layer can never survive a source revision change.
  run(engine, ['build', '--no-cache', '--platform', 'linux/amd64', '--format', 'docker', '--build-arg', `SOURCE_REVISION=${revision}`,
    '--build-arg', `SOURCE_DIRTY=${dirty}`, '-f', context + '/' + file, '-t', image, context].filter((x, i, a) => engine === 'podman' || (x !== '--format' && a[i - 1] !== '--format')));
  const inspected = JSON.parse(run(engine, ['image', 'inspect', image], true))[0];
  if (inspected.Os !== 'linux' || inspected.Architecture !== 'amd64' || inspected.Config.User !== '1001:0' ||
      inspected.Config.Labels['org.opencontainers.image.revision'] !== revision) throw new Error('Image identity check failed');
  console.log(`${role.toUpperCase()}_IMAGE=${inspected.Id}`);
}
} finally { await rm(context, { recursive: true, force: true }); }
console.log(`development / REHEARSAL only; source_dirty=${dirty}; certified=false; orderable=false; promotion_eligible=false; no registry push`);
