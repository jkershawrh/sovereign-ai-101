import { evidenceComplete, type Evidence } from './adapter'
import { cases, type CaseId } from './story'
export function EvidenceCard({ id, evidence, selected, onSelect }: { id: CaseId; evidence?: Evidence; selected?: boolean; onSelect?: () => void }) {
  return <button className={`so-evidence ${selected ? 'selected' : ''}`} onClick={onSelect} disabled={!evidence || !onSelect} aria-label={`Inspect ${cases[id].title} evidence`}>
    <span className="so-label">{cases[id].title}</span>
    <strong className={evidence?.response.decision ?? ''}>{evidence?.response.decision ?? 'Proof not run'}</strong>
    {evidence ? <><span>{evidence.response.execution_status.replaceAll('_', ' ')} · dispatches {evidence.response.model_dispatch_count}</span><small>{evidenceComplete(evidence) ? `${evidence.receipts.length} matching receipts · chains valid` : 'Evidence incomplete'}</small><span className="so-tag">{evidence.response.source} · {evidence.origin === 'fixture' ? 'recorded fixture' : 'service'}</span></> : <small>Awaiting this session’s evidence</small>}
  </button>
}
export function EvidenceDetail({ evidence, phase }: { evidence: Evidence; phase: number }) {
  const r = evidence.response
  return <div className="so-detail" aria-live="polite">
    <div className="so-label">{['01 / Submitted request', '02 / Deterministic decision', '03 / Generation boundary', '04 / Evidence and human review'][phase]}</div>
    {phase === 0 && <><h3>One synthetic input.</h3><p>“{evidence.request.prompt}”</p><small>POST /api/route · HTTP {evidence.httpStatus} · request <code data-variable>{r.request_id}</code></small></>}
    {phase === 1 && <><h3>{r.decision.toUpperCase()} · {r.reason_code.replaceAll('_', ' ')}</h3><p>{r.classification} · Policy owner sets the rules. The model does not decide permission.</p><small>Policy <code data-variable>{r.policy_digest.slice(0, 16)}…</code> · rules <code data-variable>{r.rules_digest.slice(0, 16)}…</code></small></>}
    {phase === 2 && <><h3>{r.execution_status === 'completed' ? 'A template response, not Granite.' : 'Generation was withheld.'}</h3><p>{r.response ?? `Execution: ${r.execution_status.replaceAll('_', ' ')}. No generated text returned.`}</p><small>Returned dispatch count: {r.model_dispatch_count} · model: {r.model ?? 'not invoked'} · text-only-no-actions</small></>}
    {phase === 3 && <><h3>{evidenceComplete(evidence) ? 'Exact receipts. Nonempty chains.' : 'The evidence is incomplete.'}</h3><p>{evidence.evidenceError ?? 'The service reports chain integrity for these records. A human still decides what they establish.'}</p><div className="so-receipt-lines">{r.receipts.map(ref => <code key={ref.entry_id}>{ref.entry_type} · <span data-variable>{ref.entry_hash.slice(0, 18)}…</span></code>)}</div></>}
    <div className="so-detail-meta"><span>{r.source} · {evidence.origin === 'fixture' ? 'recorded fixture; inspected this session' : 'fresh service response'}</span><span data-variable>{r.collected_at}</span></div>
  </div>
}
