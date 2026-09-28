import { randomBytes, randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { CONTRACT_VERSION, LIMITS, type Classification, type EntryType, type GovernedRequest,
  type GovernedResponse, type Receipt, type ReceiptContent, type ReceiptRef, type SessionResponse, type Source } from '../contracts/governed-inference.js';
import { appendReceipt, canonical, receiptRef, sha256, validAcknowledgment, verifyEvidence } from './ledger.js';

export class BoundaryError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}
type PolicyMode = 'allow' | 'deny' | 'timeout' | 'connection' | 'http-error' | 'invalid-json'
  | 'missing' | 'null' | 'string-false' | 'rules-unavailable';
type LedgerMode = 'healthy' | 'timeout' | 'connection' | 'http-error' | 'invalid-receipt' | 'lost-ack' | 'completion-failure';
export interface RuntimeOptions {
  source?: Source; policyMode?: PolicyMode; ledgerMode?: LedgerMode; modelMode?: 'healthy' | 'failure' | 'timeout';
  dependencyTimeoutMs?: number; requestTimeoutMs?: number; sessionTtlMs?: number;
}
interface Run { digest: string; correlation: string; promise: Promise<GovernedResponse>; result?: GovernedResponse }
interface Session {
  id: string; started: string; expires: number; fault: 'none' | 'policy_unavailable';
  entries: Receipt[]; runs: Map<string, Run>; closed: AbortController;
}
const RULES = { version: 'rehearsal-rules-v1', injection: 'ignore.*instructions|system prompt|bypass.*policy',
  sensitive: 'patient|health records|personal data|sensitive|ssn|social security' };
const POLICY = { version: 'rehearsal-policy-v1', destination: 'local', general: true, sensitive: true };
const MODEL_TEXT = {
  general: 'Rehearsal: define a policy owner, inspect permission decisions and receipts, then have a human review the bounded result.',
  'sensitive-data': 'Rehearsal: retention depends on the approved policy and context. Ask the responsible records owner to establish applicable requirements.',
};
const RULES_DIGEST = sha256(canonical(RULES));
const POLICY_DIGEST = sha256(canonical(POLICY));
const MODEL_DIGEST = sha256(canonical(MODEL_TEXT));

export function validateRequest(body: unknown): Required<GovernedRequest> {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new BoundaryError(422, 'invalid_request');
  const b = body as Record<string, unknown>;
  if (Object.keys(b).some(key => !['contract_version', 'request_id', 'prompt', 'max_tokens'].includes(key))
    || b.contract_version !== CONTRACT_VERSION || typeof b.request_id !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(b.request_id)
    || typeof b.prompt !== 'string' || !b.prompt.trim() || [...b.prompt].length > LIMITS.promptCharacters
    || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(b.prompt)
    || (b.max_tokens !== undefined && (typeof b.max_tokens !== 'number' || !Number.isInteger(b.max_tokens) || b.max_tokens < 1 || b.max_tokens > LIMITS.maxTokens))) {
    throw new BoundaryError(422, 'invalid_request');
  }
  return { contract_version: CONTRACT_VERSION, request_id: b.request_id, prompt: b.prompt, max_tokens: (b.max_tokens as number | undefined) ?? LIMITS.maxTokens };
}
function classify(prompt: string): Classification {
  if (new RegExp(RULES.injection, 'is').test(prompt)) return 'prompt-injection';
  return new RegExp(RULES.sensitive, 'i').test(prompt) ? 'sensitive-data' : 'general';
}
class DependencyFailure extends Error {
  constructor(public uncertain = false) { super('dependency_failure'); }
}
/** No network dependencies are implemented. Faults act on real rehearsal phases. */
export class Runtime {
  private sessions = new Map<string, Session>();
  readonly source: 'REHEARSAL' | 'OFFLINE';
  constructor(private readonly options: RuntimeOptions = {}) {
    this.source = !options.source || options.source === 'REHEARSAL' ? 'REHEARSAL' : 'OFFLINE';
  }
  ready() {
    return { contract_version: CONTRACT_VERSION, ready: this.source === 'REHEARSAL', source: this.source,
      requested_source: this.options.source ?? 'REHEARSAL', live_qualified: false,
      dependencies: { policy: 'deterministic-rehearsal', ledger: 'in-memory-rehearsal', model: 'local-template-rehearsal' } };
  }
  createSession(): SessionResponse {
    this.expireSessions();
    if (this.sessions.size >= LIMITS.sessions) throw new BoundaryError(429, 'session_capacity');
    const token = randomBytes(32).toString('base64url');
    const session: Session = { id: randomUUID(), started: new Date().toISOString(),
      expires: Date.now() + (this.options.sessionTtlMs ?? LIMITS.sessionTtlMs), fault: 'none', entries: [], runs: new Map(), closed: new AbortController() };
    this.sessions.set(sha256(token), session);
    return { contract_version: CONTRACT_VERSION, session_id: session.id, session_token: token, started_at: session.started,
      expires_at: new Date(session.expires).toISOString(), source: this.source, baseline: { entry_ids: [], chain_tips: [] } };
  }
  private expireSessions() {
    for (const [key, s] of this.sessions) if (s.expires <= Date.now()) this.destroy(key, s);
  }
  private destroy(key: string, s: Session) {
    s.closed.abort(); s.entries.length = 0; s.runs.clear(); s.fault = 'none'; this.sessions.delete(key);
  }
  private session(token: string): Session {
    this.expireSessions(); const s = this.sessions.get(sha256(token));
    if (!s) throw new BoundaryError(401, 'invalid_session'); return s;
  }
  authenticate(token: string): void { this.session(token); }
  deleteSession(token: string): void { const s = this.session(token); this.destroy(sha256(token), s); }
  setFault(token: string, fault: unknown): void {
    const s = this.session(token);
    if (fault !== 'none' && fault !== 'policy_unavailable') throw new BoundaryError(422, 'invalid_fault');
    s.fault = fault;
  }
  async route(token: string, body: unknown, callerSignal?: AbortSignal): Promise<GovernedResponse> {
    const s = this.session(token); const req = validateRequest(body); const digest = sha256(canonical(req));
    const existing = s.runs.get(req.request_id);
    if (existing) {
      if (existing.digest !== digest) throw new BoundaryError(409, 'request_id_conflict');
      return structuredClone(await existing.promise);
    }
    if (s.runs.size >= LIMITS.requestsPerSession) throw new BoundaryError(429, 'request_capacity');
    const correlation = randomUUID();
    const timeout = AbortSignal.timeout(this.options.requestTimeoutMs ?? LIMITS.requestTimeoutMs);
    const sessionTimeout = AbortSignal.timeout(Math.max(1, s.expires - Date.now()));
    const signal = AbortSignal.any([timeout, sessionTimeout, s.closed.signal, ...(callerSignal ? [callerSignal] : [])]);
    // Scheduling execution in a microtask installs the deduplication slot before any side effects.
    const run: Run = { digest, correlation, promise: Promise.resolve().then(() => this.execute(s, req, digest, correlation, signal, timeout)) };
    s.runs.set(req.request_id, run);
    const result = await run.promise; run.result = result;
    return structuredClone(result);
  }
  private async execute(s: Session, req: Required<GovernedRequest>, digest: string, correlation: string,
    signal: AbortSignal, timeout: AbortSignal): Promise<GovernedResponse> {
    const content: ReceiptContent = { contract_version: CONTRACT_VERSION, session_id: s.id, request_id: req.request_id,
      correlation_id: correlation, source: this.source, request_digest: digest, classification: classify(req.prompt),
      decision: 'abstain', reason_code: 'policy_unavailable', execution_status: 'not_started', model_dispatch_count: 0,
      policy_digest: POLICY_DIGEST, rules_digest: RULES_DIGEST, decision_owner: 'policy-owner', next_responsible_role: 'platform-operator' };
    const refs: ReceiptRef[] = []; let evidence: GovernedResponse['evidence_status'] = 'unavailable';
    const finish = (response?: string): GovernedResponse => ({ ...content, authority: 'text-only-no-actions',
      collected_at: new Date().toISOString(), evidence_status: evidence, receipts: refs, live_qualified: false,
      ...(response === undefined ? {} : { response }) });
    const cancelled = () => {
      if (!signal.aborted) return false;
      content.decision = 'abstain'; content.reason_code = timeout.aborted ? 'request_timeout' : 'request_cancelled';
      if (content.model_dispatch_count) content.execution_status = 'unknown';
      return true;
    };
    const commit = async (type: EntryType): Promise<boolean> => {
      try {
        const entry = await this.writeReceipt(s, type, content, signal);
        if (!validAcknowledgment(entry, content, type)) throw new DependencyFailure(true);
        refs.push(receiptRef(entry)); evidence = 'committed'; return true;
      } catch (error) { evidence = error instanceof DependencyFailure && error.uncertain ? 'unknown' : 'unavailable'; return false; }
    };
    if (this.source === 'OFFLINE') {
      content.reason_code = this.options.source === 'LIVE' ? 'live_dependencies_unimplemented' : 'offline'; return finish();
    }
    if (cancelled()) return finish();
    if (this.options.policyMode === 'rules-unavailable') {
      content.reason_code = 'rules_unavailable';
    } else if (content.classification === 'prompt-injection') {
      content.decision = 'deny'; content.reason_code = 'injection_detected';
    } else {
      try {
        const policy = await this.evaluatePolicy(s, signal);
        if (typeof policy !== 'boolean') content.reason_code = 'policy_invalid';
        else { content.decision = policy ? 'allow' : 'deny'; content.reason_code = policy ? 'local_policy_allowed' : 'policy_denied'; }
      } catch { content.reason_code = 'policy_unavailable'; }
    }
    if (cancelled()) return finish();
    const type: EntryType = content.decision === 'allow' ? `router.${content.classification as 'general' | 'sensitive-data'}.routed_local`
      : content.decision === 'deny' ? (content.classification === 'prompt-injection' ? 'router.injection.blocked' : 'router.falsification.blocked') : 'router.request.abstained';
    if (!await commit(type)) {
      if (content.decision !== 'deny') { content.decision = 'abstain'; content.reason_code = 'receipt_unavailable'; }
      return finish();
    }
    if (content.decision !== 'allow') return finish();
    if (cancelled()) return finish();
    content.model_dispatch_count = 1; content.model = 'deterministic-rehearsal-v1';
    content.backend_scope = 'local'; content.model_artifact_digest = MODEL_DIGEST;
    let output: string;
    try {
      output = await this.model(content.classification, req.max_tokens, signal);
    } catch (error) {
      content.decision = 'abstain'; content.reason_code = 'model_unavailable';
      content.execution_status = error instanceof DependencyFailure && error.uncertain ? 'unknown' : 'failed';
      if (cancelled()) return finish();
      await commit('router.inference.failed'); return finish();
    }
    if (cancelled()) return finish();
    content.execution_status = 'completed'; content.next_responsible_role = 'human-reviewer';
    if (!await commit('router.inference.completed')) {
      content.decision = 'abstain'; content.reason_code = 'completion_receipt_unavailable';
      content.execution_status = 'unknown'; content.next_responsible_role = 'platform-operator'; return finish();
    }
    if (cancelled()) return finish();
    return finish(output);
  }
  private async stall(signal: AbortSignal): Promise<never> {
    try { await delay(this.options.dependencyTimeoutMs ?? LIMITS.dependencyTimeoutMs, undefined, { signal }); }
    catch { throw new DependencyFailure(true); }
    throw new DependencyFailure(true);
  }
  private async evaluatePolicy(s: Session, signal: AbortSignal): Promise<unknown> {
    if (s.fault === 'policy_unavailable') throw new DependencyFailure();
    switch (this.options.policyMode) {
      case 'timeout': return this.stall(signal);
      case 'connection': case 'http-error': case 'invalid-json': throw new DependencyFailure();
      case 'missing': return undefined;
      case 'null': return null;
      case 'string-false': return 'false';
      case 'deny': return false;
      default: return true;
    }
  }
  private async writeReceipt(s: Session, type: EntryType, content: ReceiptContent, signal: AbortSignal): Promise<Receipt> {
    if (signal.aborted || s.closed.signal.aborted) throw new DependencyFailure();
    const mode = this.options.ledgerMode;
    if (mode === 'timeout') return this.stall(signal);
    if (mode === 'connection' || mode === 'http-error') throw new DependencyFailure();
    if (mode === 'completion-failure' && type === 'router.inference.completed') throw new DependencyFailure(true);
    const entry = appendReceipt(s.entries, type, content);
    if (mode === 'lost-ack') throw new DependencyFailure(true);
    if (mode === 'invalid-receipt') entry.entry_hash = '';
    return entry;
  }
  private async model(classification: Classification, maxTokens: number, signal: AbortSignal): Promise<string> {
    if (signal.aborted) throw new DependencyFailure(true);
    if (this.options.modelMode === 'timeout') return this.stall(signal);
    if (this.options.modelMode === 'failure') throw new DependencyFailure();
    // This local template is intentionally not presented as Granite or OVMS inference.
    return MODEL_TEXT[classification === 'sensitive-data' ? 'sensitive-data' : 'general'].split(' ').slice(0, maxTokens).join(' ');
  }
  private completed(token: string, requestId: string, correlation: string): { session: Session; result: GovernedResponse } {
    const session = this.session(token); const run = session.runs.get(requestId);
    if (!run || run.correlation !== correlation) throw new BoundaryError(404, 'request_not_found');
    if (!run.result) throw new BoundaryError(409, 'request_pending');
    return { session, result: run.result };
  }
  receipts(token: string, requestId: string, correlation: string): Receipt[] {
    const { session, result } = this.completed(token, requestId, correlation);
    // Only acknowledged receipts are exposed; an unacknowledged write cannot earn evidence credit.
    return structuredClone(session.entries.filter(e => result.receipts.some(r => r.entry_id === e.entry_id)));
  }
  verify(token: string, requestId: string, correlation: string) {
    const { session, result } = this.completed(token, requestId, correlation);
    return verifyEvidence(result, session.entries, session.started);
  }
  receipt(token: string, requestId: string, correlation: string, hash: string, type: string): Receipt {
    const receipt = this.receipts(token, requestId, correlation).find(e => e.entry_hash === hash && e.entry_type === type);
    if (!receipt) throw new BoundaryError(404, 'receipt_not_found'); return receipt;
  }
}
