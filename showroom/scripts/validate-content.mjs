#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const show = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.dirname(show)
const moduleRoot = path.join(show, 'modules/ROOT')
const read = p => readFile(p, 'utf8')
const journey = JSON.parse(await read(path.join(root, 'content-101/journey.json')))
const ids = ['00-preflight', '01-local-evidence', '02-baseline', '03-general-allow', '04-sensitive-allow', '05-injection-deny', '06-policy-abstain', '07-correlate-verify', '08-authority', '09-cleanup-close']
assert.deepEqual(journey.stages.map(s => s.id), ids)
assert.equal(journey.duration_minutes, 36); assert.equal(journey.recovery_allowance_minutes, 4)
assert.equal(journey.mode, 'rehearsal-only'); assert.equal(journey.live_completion, false)
let minute = 0
for (const s of journey.stages) { assert.equal(s.start_minute, minute); assert.ok(s.end_minute > minute); minute = s.end_minute }
assert.equal(minute, 36)
const nav = await read(path.join(moduleRoot, 'nav.adoc'))
assert.deepEqual([...nav.matchAll(/xref:([^[]+)\[/g)].map(m => m[1]), ['index', ...ids].map(id => `${id}.adoc`))
const names = (await readdir(path.join(moduleRoot, 'pages'))).sort()
assert.deepEqual(names, ['index', ...ids].map(id => `${id}.adoc`).sort())
const status = await read(path.join(moduleRoot, 'partials/status.adoc'))
for (const phrase of ['Implemented contract in this package', 'REHEARSAL evidence', 'Blocked live steps', 'cannot grant live completion', 'G01–G10']) assert.ok(status.includes(phrase), phrase)
let links = 0
for (const name of names) {
  const page = await read(path.join(moduleRoot, 'pages', name))
  assert.ok(page.startsWith('= ')); assert.ok(page.includes('include::partial$status.adoc[]'), `${name} status boundary`)
  if (name !== 'index.adoc') {
    const s = journey.stages.find(s => name === `${s.id}.adoc`)
    assert.ok(page.includes(`:page-duration-minutes: ${s.end_minute - s.start_minute}\n`))
    for (const term of ['== Objective', '== Learner checkpoint', '*Pass when:*', 'REHEARSAL']) assert.ok(page.includes(term), `${name}: ${term}`)
  }
  for (const m of page.matchAll(/xref:([^[]+)\[/g)) {
    const target = m[1].startsWith('attachment$') ? path.join(moduleRoot, 'attachments', m[1].slice(11)) : path.join(moduleRoot, 'pages', m[1])
    await readFile(target); links++
  }
}
let attachments = 0
for (const family of ['fixtures', 'templates', 'reference']) for (const name of await readdir(path.join(root, 'content-101', family))) {
  const source = await readFile(path.join(root, 'content-101', family, name))
  const copy = await readFile(path.join(moduleRoot, 'attachments', family, name))
  assert.ok(source.equals(copy), `${family}/${name} attachment drift`); attachments++
}
const descriptor = await read(path.join(show, 'antora.yml'))
assert.ok(descriptor.includes('page-pagination: true')); assert.ok(descriptor.includes('modules/ROOT/nav.adoc'))
const playbook = await read(path.join(root, 'site.yml'))
assert.ok(playbook.includes('rhdp_showroom_theme')); assert.ok(playbook.includes('start_path: showroom'))
assert.ok(playbook.includes('dir: ./showroom/build/site'))
console.log(`Content valid: 10 ordered stages / 36 minutes, ${attachments} byte-identical attachments, ${links} source links; live completion blocked.`)
