import { createHash, randomUUID } from 'node:crypto';
import { CONTRACT_VERSION, type EntryType, type GovernedResponse, type Receipt,
  type ReceiptContent, type ReceiptRef, type Verification } from '../contracts/governed-inference.js';

export const sha256 = (value: string | Buffer): string => createHash('sha256').update(value).digest('hex');
/** Sorted object keys define the content bytes for this version of the rehearsal contract. */
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value)
    .filter(([, v]) => v !== undefined).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
/** Port of ARE crypto/mod.rs canonical_entry_hash, version 2, length-prefixed UTF-8 fields.
 * Not a live ledger verifier: no gateway, durable storage or signature is claimed here. */
export function entryHash(entry: Omit<Receipt, 'entry_hash'>): string {
  const fields: [string, string][] = [
    ['entry_id', entry.entry_id], ['entry_type', entry.entry_type], ['agent_id', entry.agent_id],
    ['content', canonical(entry.content)], ['content_type', entry.content_type], ['source_id', entry.source_id],
    ['correlation_id', entry.correlation_id], ['idempotency_key', entry.idempotency_key], ['input_hash', entry.input_hash],
    ['chain_position', String(entry.chain_position)], ['written_ts_ms', String(Date.parse(entry.written_ts))],
    ['previous_hash', entry.previous_hash],
  ];
  return sha256('ARE_LEDGER_ENTRY_HASH_V2\n' + fields.map(([name, value]) => `${name}:${Buffer.byteLength(value)}:${value}\n`).join(''));
}
export function receiptRef(receipt: Receipt): ReceiptRef {
  const { entry_id, entry_type, entry_hash, previous_hash, chain_position, written_ts } = receipt;
  return { entry_id, entry_type, entry_hash, previous_hash, chain_position, written_ts };
}
export function appendReceipt(entries: Receipt[], entry_type: EntryType, content: ReceiptContent): Receipt {
  const chain = entries.filter(entry => entry.entry_type === entry_type);
  const entry: Receipt = {
    entry_id: randomUUID(), entry_type, entry_hash: '', previous_hash: chain.at(-1)?.entry_hash ?? '',
    chain_position: chain.length + 1, written_ts: new Date().toISOString(), hash_version: 'ARE_LEDGER_ENTRY_HASH_V2',
    agent_id: 'sovereign-ai-101-rehearsal', content: structuredClone(content), content_type: 'application/json',
    source_id: content.session_id, correlation_id: content.correlation_id,
    idempotency_key: `${content.session_id}:${content.request_id}:${entry_type}`,
    input_hash: sha256(canonical(content)),
  };
  entry.entry_hash = entryHash(entry); entries.push(entry);
  return structuredClone(entry);
}
export function validAcknowledgment(entry: Receipt, expected: ReceiptContent, type: EntryType): boolean {
  return entry.hash_version === 'ARE_LEDGER_ENTRY_HASH_V2' && entry.entry_type === type
    && canonical(entry.content) === canonical(expected) && entry.source_id === expected.session_id
    && entry.correlation_id === expected.correlation_id && entry.input_hash === sha256(canonical(expected))
    && entry.entry_hash === entryHash(entry) && entry.chain_position > 0
    && Number.isFinite(Date.parse(entry.written_ts));
}
export function verifyEvidence(result: GovernedResponse, entries: Receipt[], sessionStart: string): Verification {
  const verification: Verification = { contract_version: CONTRACT_VERSION, session_id: result.session_id,
    request_id: result.request_id, correlation_id: result.correlation_id, source: result.source, all_valid: false,
    verified_at: new Date().toISOString(), matched_entry_ids: [], chains: [], failure_reason: null, live_qualified: false };
  const fail = (reason: string): Verification => ({ ...verification, failure_reason: reason });
  if (result.source !== 'REHEARSAL' || result.evidence_status !== 'committed') return fail('evidence_unavailable');
  if (!result.receipts.length || !entries.length) return fail('empty_chain_or_missing_receipt');
  if (new Set(result.receipts.map(r => r.entry_id)).size !== result.receipts.length) return fail('duplicate_receipt');
  const relevantTypes = [...new Set(result.receipts.map(ref => ref.entry_type))];
  for (const type of relevantTypes) {
    const chain = entries.filter(e => e.entry_type === type).sort((a, b) => a.chain_position - b.chain_position);
    let previous = '';
    const chainValid = chain.length > 0 && chain.every((entry, index) => {
      const valid = entry.chain_position === index + 1 && entry.previous_hash === previous
        && entry.entry_hash === entryHash(entry) && entry.input_hash === sha256(canonical(entry.content))
        && entry.hash_version === 'ARE_LEDGER_ENTRY_HASH_V2' && entry.content.contract_version === CONTRACT_VERSION
        && entry.source_id === result.session_id && entry.content.session_id === result.session_id
        && entry.content.source === result.source && entry.correlation_id === entry.content.correlation_id
        && Date.parse(entry.written_ts) >= Date.parse(sessionStart)
        && Date.parse(entry.written_ts) <= Date.now();
      previous = entry.entry_hash; return valid;
    });
    verification.chains.push({ entry_type: type, chain_valid: chainValid, entries_checked: chain.length,
      through_position: chain.at(-1)?.chain_position ?? 0 });
    if (!chainValid) return fail('invalid_or_truncated_chain');
  }
  for (const ref of result.receipts) {
    const entry = entries.find(e => e.entry_id === ref.entry_id);
    if (!entry || canonical(receiptRef(entry)) !== canonical(ref)) return fail('receipt_mismatch');
    const c = entry.content;
    if (c.session_id !== result.session_id || c.request_id !== result.request_id || c.correlation_id !== result.correlation_id
      || c.request_digest !== result.request_digest || c.classification !== result.classification
      || c.rules_digest !== result.rules_digest || c.policy_digest !== result.policy_digest
      || Date.parse(entry.written_ts) > Date.parse(result.collected_at)) return fail('stale_or_mismatched_receipt');
    verification.matched_entry_ids.push(ref.entry_id);
  }
  const matched = entries.filter(e => verification.matched_entry_ids.includes(e.entry_id));
  const { authority: _authority, collected_at: _collected, evidence_status: _evidence,
    receipts: _refs, response: _response, live_qualified: _qualified, ...terminalContent } = result;
  const terminal = matched.find(e => e.entry_id === result.receipts.at(-1)?.entry_id);
  if (!terminal || canonical(terminal.content) !== canonical(terminalContent)) return fail('terminal_result_mismatch');
  if (result.decision === 'allow' && (result.execution_status !== 'completed' || matched.length !== 2
    || !matched.some(e => e.entry_type === `router.${result.classification}.routed_local` && e.content.model_dispatch_count === 0)
    || !matched.some(e => e.entry_type === 'router.inference.completed' && e.content.model_dispatch_count === 1))) return fail('missing_completion_phases');
  if (result.decision === 'deny' && !matched.some(e => e.content.decision === 'deny' && e.content.model_dispatch_count === 0)) return fail('missing_denial');
  if (result.decision === 'abstain' && !matched.some(e => e.content.decision === 'abstain')) return fail('missing_abstention');
  return { ...verification, all_valid: true };
}
