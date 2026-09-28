import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { validateRehearsal, checkShippedFixture, fixturePath } from './rehearsal-check.mjs'

const fixture = JSON.parse(await readFile(fixturePath, 'utf8'))
test('valid teaching bundle never grants live completion or runtime verification', async () => {
  const result = await checkShippedFixture()
  assert.equal(result.status, 'REHEARSAL_VALID')
  assert.equal(result.live_completion, false)
  assert.equal(result.ledger_cryptography_verified, false)
  assert.equal(result.cleanup_verified, false)
})
const negatives = {
  'live relabel': f => { f.source = 'live' },
  'mixed source': f => { f.cases[1].result.source = 'live' },
  'invented live collection': f => { f.collected_at = new Date().toISOString() },
  'attempted completion': f => { f.live_completion = true },
  'invented CPU evidence': f => { f.runtime_evidence.cpu_identity = 'Intel' },
  'released gate': f => { f.qualification.gates.G04 = 'passed' },
  'empty cases': f => { f.cases = [] },
  'case order changed': f => { f.cases.reverse() },
  'missing receipt': f => { f.entries.pop() },
  'old entry reused': f => { f.baseline.known_entry_ids.push(f.entries[0].entry_id) },
  'stale write': f => { f.entries[0].written_ts = '1999-12-31T23:59:00Z'; f.cases[0].result.receipts[0].written_ts = f.entries[0].written_ts },
  'wrong session': f => { f.entries[0].session_id = 'other-session' },
  'wrong correlation': f => { f.entries[0].correlation_id = 'other-correlation' },
  'wrong hash': f => { f.cases[0].result.receipts[0].entry_hash = 'a'.repeat(64) },
  'modified content': f => { f.entries[0].content.decision = 'deny' },
  'empty ledger green aggregate': f => { f.entries = []; f.verification.chains = []; f.verification.all_valid = true },
  'empty relevant chain': f => { f.verification.chains[0].entries_checked = 0 },
  'missing relevant type': f => { f.verification.chains.pop() },
  'truncated coverage': f => { f.verification.chains[4].covered_through_position = 2 },
  'broken predecessor': f => { f.entries[3].previous_hash = 'a'.repeat(64) },
  'false receipt proof': f => { f.verification.receipt_proofs[0].valid = false },
  'truthy proof string': f => { f.verification.receipt_proofs[0].valid = 'true' },
  'corrupt chain result': f => { f.verification.chains[0].chain_valid = false },
  'deny dispatched': f => { f.cases[2].dispatch_evidence.ovms_calls = 1 },
  'abstain generated text': f => { f.cases[3].result.response = 'not allowed' },
  'missing fault restore': f => { f.cases[3].fault.restored = false },
  'wrong fault scope': f => { f.cases[3].fault.scope_session_id = 'shared' },
  'claimed cleanup': f => { f.cleanup.status = 'completed'; f.cleanup.observed_residue = 0 },
}
for (const [name, mutate] of Object.entries(negatives)) test(`reject ${name}`, () => {
  const broken = structuredClone(fixture)
  mutate(broken)
  assert.throws(() => validateRehearsal(broken))
})
test('CLI refuses live completion mode with nonzero status', () => {
  const r = spawnSync(process.execPath, [fileURLToPath(new URL('./rehearsal-check.mjs', import.meta.url)), '--live'], { encoding: 'utf8' })
  assert.equal(r.status, 1)
  assert.equal(JSON.parse(r.stderr).live_completion, false)
})
