#!/usr/bin/env node
import { cp, mkdtemp, rm } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const showroom = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.dirname(showroom)
const temporary = await mkdtemp(path.join(os.tmpdir(), 'sovereign-ai-101-showroom-'))
function run(command, args) {
  const r = spawnSync(command, args, { cwd: temporary, stdio: 'inherit' })
  if (r.error) throw r.error
  if (r.status !== 0) throw new Error(`${path.basename(command)} failed (${r.status})`)
}
try {
  await cp(path.join(root, 'site.yml'), path.join(temporary, 'site.yml'))
  await cp(showroom, path.join(temporary, 'showroom'), { recursive: true, filter: p => !p.split(path.sep).some(s => ['node_modules', 'build', '.cache'].includes(s)) })
  run('git', ['init', '--quiet'])
  run('git', ['add', 'site.yml', 'showroom'])
  run('git', ['-c', 'user.name=Showroom Build', '-c', 'user.email=showroom-build@invalid', '-c', 'commit.gpgsign=false', 'commit', '--quiet', '-m', 'Temporary learner-content snapshot'])
  run(path.join(showroom, 'node_modules/.bin/antora'), ['--stacktrace', '--log-failure-level=warn', 'site.yml'])
  const destination = path.join(showroom, 'build/site')
  await rm(destination, { recursive: true, force: true })
  await cp(path.join(temporary, 'showroom/build/site'), destination, { recursive: true })
  console.log(`Built ${destination}`)
} finally {
  await rm(temporary, { recursive: true, force: true })
}
