import { cp, copyFile, lstat, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
// Docker does not honor .containerignore. Stage an allow-listed snapshot and
// give both engines the same exclusions without editing the application's tree.
export async function stageContext(root) {
  const directory = await mkdtemp(join(tmpdir(), 'sovereign-build-'));
  try {
    for (const name of ['package.json', 'package-lock.json', 'index.html', 'tsconfig.json', 'tsconfig.app.json', 'tsconfig.node.json',
      'vite.config.ts', 'src', 'public', 'server', 'contracts', 'packaging/runtime', 'Containerfile', 'Containerfile.service', '.containerignore']) {
      await cp(join(root, name), join(directory, name), { recursive: true, filter: async path => {
        const name = basename(path);
        if (/^(?:node_modules|dist|\.git|\.env.*|credentials.*)$|\.(?:pem|key)$/i.test(name)) return false;
        if ((await lstat(path)).isSymbolicLink()) throw new Error('Build context symlinks require explicit review');
        return true;
      } });
    }
    await copyFile(join(directory, '.containerignore'), join(directory, '.dockerignore'));
    return directory;
  } catch (error) { await rm(directory, { recursive: true, force: true }); throw error; }
}
