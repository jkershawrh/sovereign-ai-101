#!/usr/bin/env node
import assert from 'node:assert/strict'
import { readFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const showroom = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const root = path.dirname(showroom)
const moduleRoot = path.join(showroom, 'modules/ROOT')
const read = file => readFile(file, 'utf8')
const journey = JSON.parse(await read(path.join(root, 'content-101/journey.json')))
const ids = ['00-mission', '01-connect', '02-allow', '03-protect', '04-fail-closed', '05-prove', '06-decide', '07-cleanup']

assert.equal(journey.schema_version, 'sovereign-ai-101-journey/v2')
assert.equal(journey.mode, 'interactive-rehearsal')
assert.equal(journey.live_completion, false)
assert.equal(journey.duration_minutes, 30)
assert.equal(journey.recovery_allowance_minutes, 5)
assert.deepEqual(journey.stages.map(stage => stage.id), ids)

let minute = 0
for (const stage of journey.stages) {
  assert.equal(stage.start_minute, minute)
  assert.ok(stage.end_minute > minute)
  minute = stage.end_minute
}
assert.equal(minute, journey.duration_minutes)

const nav = await read(path.join(moduleRoot, 'nav.adoc'))
assert.deepEqual([...nav.matchAll(/xref:([^[]+)\[/g)].map(match => match[1]), ['index', ...ids].map(id => `${id}.adoc`))
const names = (await readdir(path.join(moduleRoot, 'pages'))).sort()
assert.deepEqual(names, ['index', ...ids].map(id => `${id}.adoc`).sort())

const status = await read(path.join(moduleRoot, 'partials/status.adoc'))
for (const phrase of ['interactive, deterministic governance service', 'does not call a production model', 'REHEARSAL']) assert.ok(status.includes(phrase), phrase)

let executeBlocks = 0
let links = 0
for (const name of names) {
  const page = await read(path.join(moduleRoot, 'pages', name))
  assert.ok(page.startsWith('= '), `${name}: title`)
  assert.ok(page.includes('include::partial$status.adoc[]'), `${name}: source boundary`)
  assert.ok(!page.includes('Blocked live procedure'), `${name}: obsolete passive procedure`)
  if (name !== 'index.adoc') {
    const stage = journey.stages.find(stage => name === `${stage.id}.adoc`)
    assert.ok(stage)
    assert.ok(page.includes(`:page-duration-minutes: ${stage.end_minute - stage.start_minute}\n`), `${name}: duration`)
    for (const heading of ['== Objective', '== Why it matters', '== Do it', '== What happened', '== Learner checkpoint']) {
      assert.ok(page.includes(heading), `${name}: ${heading}`)
    }
    const count = [...page.matchAll(/\[source,bash,role="execute"\]/g)].length
    assert.ok(count >= 1, `${name}: executable learner action`)
    executeBlocks += count
  }
  for (const match of page.matchAll(/xref:([^[]+)\[/g)) {
    const target = match[1].startsWith('attachment$')
      ? path.join(moduleRoot, 'attachments', match[1].slice(11))
      : path.join(moduleRoot, 'pages', match[1])
    await readFile(target)
    links++
  }
}

assert.ok(executeBlocks >= 11, `expected at least 11 execute blocks, got ${executeBlocks}`)
const allPages = await Promise.all(names.map(name => read(path.join(moduleRoot, 'pages', name))))
const combined = allPages.join('\n')
for (const contract of [
  'POST "$SOVEREIGN_API_URL/api/sessions"',
  'POST "$SOVEREIGN_API_URL/api/route"',
  'PUT "$SOVEREIGN_API_URL/api/session/fault"',
  '/api/ledger/verify?',
  'DELETE "$SOVEREIGN_API_URL/api/session"',
  'model_dispatch_count',
  'decision-brief.md',
]) assert.ok(combined.includes(contract), `missing learner contract: ${contract}`)

const descriptor = await read(path.join(showroom, 'antora.yml'))
assert.ok(descriptor.includes('page-pagination: true'))
assert.ok(descriptor.includes('modules/ROOT/nav.adoc'))
const playbook = await read(path.join(root, 'site.yml'))
assert.ok(playbook.includes('rhdp_showroom_theme'))
assert.ok(playbook.includes('start_path: showroom'))
assert.ok(playbook.includes('dir: ./showroom/build/site'))

console.log(`Content valid: 8 interactive stages / 30 minutes, ${executeBlocks} execute blocks, ${links} source links; production claims remain blocked.`)
