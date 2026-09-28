import type { GovernedRequest, GovernedResponse, Receipt, SessionResponse, Verification } from '../../contracts/governed-inference'
import { cases, type CaseId } from './story'
export type SafeSession = Omit<SessionResponse, 'session_token'>
export interface Evidence {
  request: GovernedRequest; response: GovernedResponse; receipts: Receipt[]; verification?: Verification
  httpStatus: number; evidenceError?: string; origin: 'service' | 'fixture'; inspectedAt: string
}
export interface Fixture {
  schema: 'sovereign-presentation-fixture/v1'; source: 'REHEARSAL';
  review: { status: 'reviewed'; date: string; method: string; limits: string }
  session: SafeSession; cases: Record<CaseId, Omit<Evidence, 'origin' | 'inspectedAt'>>
}
const obj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const str = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const date = (v: unknown) => str(v) && Number.isFinite(Date.parse(v))
const hash = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v)
function fail(message = 'Invalid or mismatched evidence from the rehearsal service.'): never { throw new Error(message) }
export function validateSession(value: unknown): asserts value is SessionResponse {
  if (!obj(value) || value.contract_version !== '1.0' || !str(value.session_id) || !str(value.session_token)
    || !['REHEARSAL', 'OFFLINE'].includes(String(value.source)) || !date(value.started_at) || !date(value.expires_at)
    || !obj(value.baseline) || !Array.isArray(value.baseline.entry_ids) || value.baseline.entry_ids.length !== 0
    || !Array.isArray(value.baseline.chain_tips) || value.baseline.chain_tips.length !== 0) fail()
}
export function validateResponse(value: unknown, session: SafeSession, request: GovernedRequest, status: number): asserts value is GovernedResponse {
  if (!obj(value) || value.contract_version !== '1.0' || value.session_id !== session.session_id || value.request_id !== request.request_id
    || value.source !== session.source || value.source === 'LIVE' || value.live_qualified !== false || !str(value.correlation_id)
    || value.authority !== 'text-only-no-actions' || !date(value.collected_at) || Date.parse(String(value.collected_at)) < Date.parse(session.started_at)
    || !['general','sensitive-data','prompt-injection'].includes(String(value.classification))
    || !['allow','deny','abstain'].includes(String(value.decision)) || !['completed','not_started','failed','unknown'].includes(String(value.execution_status))
    || !['committed','unavailable','unknown'].includes(String(value.evidence_status)) || !str(value.reason_code)
    || !Number.isInteger(value.model_dispatch_count) || ![0,1].includes(Number(value.model_dispatch_count))
    || !hash(value.request_digest) || !hash(value.policy_digest) || !hash(value.rules_digest)
    || value.decision_owner !== 'policy-owner' || !['human-reviewer','platform-operator'].includes(String(value.next_responsible_role))
    || !Array.isArray(value.receipts)) fail()
  if (status !== (value.decision === 'allow' ? 200 : value.decision === 'deny' ? 403 : 503)) fail('HTTP status disagrees with the returned decision.')
  if ((value.decision !== 'allow' && (value.model_dispatch_count !== 0 || value.execution_status !== 'not_started' || value.response !== undefined))
    || (value.execution_status === 'completed' && (value.decision !== 'allow' || value.model_dispatch_count !== 1 || !str(value.response) || value.evidence_status !== 'committed'))
    || (value.execution_status !== 'completed' && value.response !== undefined)) fail('Execution and authority fields disagree.')
  for (const r of value.receipts) if (!obj(r) || !str(r.entry_id) || !str(r.entry_type) || !hash(r.entry_hash) || typeof r.previous_hash !== 'string'
    || !Number.isInteger(r.chain_position) || Number(r.chain_position) < 1 || !date(r.written_ts) || Date.parse(String(r.written_ts)) < Date.parse(session.started_at)) fail()
}
export function evidenceComplete(e: Evidence): boolean {
  const { response: r, receipts, verification: v } = e
  if (e.evidenceError || r.evidence_status !== 'committed' || !v || v.contract_version !== '1.0' || v.all_valid !== true || v.live_qualified !== false
    || v.session_id !== r.session_id || v.request_id !== r.request_id || v.correlation_id !== r.correlation_id || v.source !== r.source
    || !date(v.verified_at) || Date.parse(v.verified_at) < Date.parse(r.collected_at) || v.failure_reason !== null
    || !Array.isArray(v.chains) || !Array.isArray(v.matched_entry_ids) || !Array.isArray(receipts) || !receipts.length || !r.receipts.length) return false
  if (!receipts.every(x => obj(x) && obj(x.content)) || !v.chains.every(x => obj(x) && x.chain_valid === true && Number.isInteger(x.entries_checked) && x.entries_checked > 0)) return false
  const decisionType = r.decision === 'deny' ? (r.reason_code === 'injection_detected' ? 'router.injection.blocked' : 'router.falsification.blocked') : r.decision === 'abstain' ? 'router.request.abstained' : `router.${r.classification}.routed_local`
  if (!r.receipts.some(x => x.entry_type === decisionType) || (r.execution_status === 'completed' && !r.receipts.some(x => x.entry_type === 'router.inference.completed'))) return false
  const expectedCount = r.execution_status === 'completed' ? 2 : r.execution_status === 'not_started' ? 1 : r.receipts.length
  if (r.receipts.length !== expectedCount || new Set(r.receipts.map(x => x.entry_id)).size !== r.receipts.length || receipts.length !== r.receipts.length
    || v.matched_entry_ids.length !== receipts.length || new Set(v.matched_entry_ids).size !== receipts.length) return false
  return r.receipts.every(ref => {
    const entry = receipts.find(x => x.entry_id === ref.entry_id)
    const chain = v.chains.find(c => c.entry_type === ref.entry_type)
    if (!entry || !obj(entry.content)) return false
    const c = entry.content
    return entry.entry_hash === ref.entry_hash && entry.entry_type === ref.entry_type && entry.previous_hash === ref.previous_hash
      && entry.chain_position === ref.chain_position && entry.written_ts === ref.written_ts && hash(entry.entry_hash)
      && entry.hash_version === 'ARE_LEDGER_ENTRY_HASH_V2' && entry.agent_id === 'sovereign-ai-101-rehearsal'
      && entry.source_id === r.session_id && entry.correlation_id === r.correlation_id && hash(entry.input_hash)
      && c.session_id === r.session_id && c.request_id === r.request_id && c.correlation_id === r.correlation_id
      && c.contract_version === r.contract_version && c.classification === r.classification && c.reason_code === r.reason_code
      && c.source === r.source && c.request_digest === r.request_digest && c.decision === r.decision
      && c.policy_digest === r.policy_digest && c.rules_digest === r.rules_digest
      && date(ref.written_ts) && v.matched_entry_ids.includes(ref.entry_id) && chain?.chain_valid === true
      && Number.isInteger(chain.entries_checked) && chain.entries_checked >= ref.chain_position && chain.through_position >= ref.chain_position
  })
}
export function parseFixture(value: unknown): Fixture {
  if (!obj(value) || value.schema !== 'sovereign-presentation-fixture/v1' || value.source !== 'REHEARSAL' || !obj(value.review)
    || value.review.status !== 'reviewed' || !obj(value.session) || value.session.source !== 'REHEARSAL' || !obj(value.cases)) fail('Unreviewed rehearsal fixture.')
  validateSession({ ...value.session, session_token: 'fixture-has-no-credential' })
  const fixture = value as unknown as Fixture
  for (const id of Object.keys(cases) as CaseId[]) {
    const e = fixture.cases[id]
    if (!e || !obj(e.request) || e.request.prompt !== cases[id].prompt || !Array.isArray(e.receipts)) fail()
    validateResponse(e.response, fixture.session, e.request, e.httpStatus)
    if (!evidenceComplete({ ...e, origin: 'fixture', inspectedAt: new Date().toISOString() })) fail('Fixture receipts are incomplete.')
  }
  return fixture
}
export class RehearsalAdapter {
  private session?: SessionResponse
  private fixture?: Fixture
  private fetcher: typeof fetch
  constructor(fetcher: typeof fetch = fetch.bind(globalThis)) { this.fetcher = fetcher }
  async json(path: string, method = 'GET', body?: unknown, signal?: AbortSignal, accepted = [200]) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 5000)
    const abort = () => controller.abort()
    if (signal?.aborted) controller.abort()
    signal?.addEventListener('abort', abort, { once: true })
    try {
      const response = await this.fetcher(path, { method, signal: controller.signal, cache: 'no-store', headers: {
        ...(this.session ? { Authorization: `Bearer ${this.session.session_token}` } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      }, body: body !== undefined ? JSON.stringify(body) : undefined })
      if (!accepted.includes(response.status)) throw new Error(`Rehearsal endpoint unavailable (HTTP ${response.status}).`)
      const data: unknown = await response.json()
      return { data, status: response.status }
    } finally { clearTimeout(timeout); signal?.removeEventListener('abort', abort) }
  }
  async connect(signal?: AbortSignal): Promise<SafeSession> {
    const { data } = await this.json('/api/sessions', 'POST', undefined, signal, [201])
    validateSession(data)
    this.fixture = undefined; this.session = data
    const { session_token: _token, ...safe } = data
    return safe
  }
  async loadFixture(signal?: AbortSignal): Promise<SafeSession> {
    const response = await this.fetcher('/fixtures/sovereign-rehearsal.json', { signal, cache: 'no-store' })
    if (!response.ok) fail('Recorded rehearsal fixture is unavailable.')
    this.fixture = parseFixture(await response.json()); this.session = undefined
    return this.fixture.session
  }
  async run(id: CaseId, signal?: AbortSignal): Promise<Evidence> {
    if (this.fixture) return { ...this.fixture.cases[id], origin: 'fixture', inspectedAt: new Date().toISOString() }
    if (!this.session) fail('Connect the rehearsal service first.')
    if (this.session.source !== 'REHEARSAL') fail('OFFLINE — proof not run. Live dependencies are unimplemented.')
    const request: GovernedRequest = { contract_version: '1.0', request_id: `${id}-${crypto.randomUUID()}`, prompt: cases[id].prompt, max_tokens: 100 }
    const fault = id === 'outage' ? 'policy_unavailable' : 'none'
    const acknowledgment = await this.json('/api/session/fault', 'PUT', { fault }, signal)
    if (!obj(acknowledgment.data) || acknowledgment.data.source !== 'REHEARSAL' || acknowledgment.data.fault !== fault) fail('Fault state was not acknowledged.')
    let evidence: Evidence
    try {
      const { data, status } = await this.json('/api/route', 'POST', request, signal, [200,403,503])
      validateResponse(data, this.session, request, status)
      evidence = { request, response: data, httpStatus: status, receipts: [], origin: 'service', inspectedAt: new Date().toISOString() }
      try {
        const selector = new URLSearchParams({ request_id: data.request_id, correlation_id: data.correlation_id })
        const ledger = await this.json(`/api/ledger?${selector}`, 'GET', undefined, signal)
        if (!obj(ledger.data) || ledger.data.source !== data.source || !Array.isArray(ledger.data.receipts)) fail()
        evidence.receipts = ledger.data.receipts as Receipt[]
        const verification = await this.json(`/api/ledger/verify?${selector}`, 'GET', undefined, signal)
        if (!obj(verification.data)) fail()
        evidence.verification = verification.data as unknown as Verification
        if (!evidenceComplete(evidence)) evidence.evidenceError = 'Incomplete or mismatched receipt evidence; no verified claim.'
      } catch { evidence.evidenceError = 'Receipt inspection unavailable; the returned decision is retained but unverified.' }
    } finally {
      if (id === 'outage') {
        try { await this.json('/api/session/fault', 'PUT', { fault: 'none' }) }
        catch { /* Next run always sets and acknowledges its required fault before dispatch. */ }
      }
    }
    return evidence
  }
  async close(): Promise<boolean> {
    this.fixture = undefined
    if (!this.session) return true
    try {
      const { data } = await this.json('/api/session', 'DELETE')
      return obj(data) && data.session_removed === true
    } catch { return false } finally { this.session = undefined }
  }
}
