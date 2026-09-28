/** Version 1. REHEARSAL receipts never establish live model placement or authority. */
export const CONTRACT_VERSION = '1.0' as const;
export const LIMITS = { promptCharacters: 2_000, maxTokens: 100, bodyBytes: 12_288,
  requestTimeoutMs: 3_000, dependencyTimeoutMs: 500, sessionTtlMs: 1_800_000,
  sessions: 100, requestsPerSession: 100 } as const;
export type Source = 'LIVE' | 'REHEARSAL' | 'OFFLINE';
export type Classification = 'general' | 'sensitive-data' | 'prompt-injection';
export type Decision = 'allow' | 'deny' | 'abstain';
export type ExecutionStatus = 'completed' | 'not_started' | 'failed' | 'unknown';
export type EvidenceStatus = 'committed' | 'unavailable' | 'unknown';
export type ReasonCode = 'local_policy_allowed' | 'injection_detected' | 'policy_denied'
  | 'policy_unavailable' | 'policy_invalid' | 'rules_unavailable' | 'receipt_unavailable'
  | 'completion_receipt_unavailable' | 'model_unavailable' | 'request_cancelled'
  | 'request_timeout' | 'live_dependencies_unimplemented' | 'offline';
export type EntryType = 'router.general.routed_local' | 'router.sensitive-data.routed_local'
  | 'router.injection.blocked' | 'router.falsification.blocked' | 'router.request.abstained'
  | 'router.inference.completed' | 'router.inference.failed';

/** Session is supplied by bearer authentication, never by the request body. */
export interface GovernedRequest {
  contract_version: typeof CONTRACT_VERSION;
  request_id: string;
  prompt: string;
  max_tokens?: number;
}
export interface ReceiptContent {
  contract_version: typeof CONTRACT_VERSION;
  session_id: string;
  request_id: string;
  correlation_id: string;
  source: Source;
  request_digest: string;
  classification: Classification;
  decision: Decision;
  reason_code: ReasonCode;
  execution_status: ExecutionStatus;
  model_dispatch_count: number;
  policy_digest: string;
  rules_digest: string;
  decision_owner: 'policy-owner';
  next_responsible_role: 'platform-operator' | 'human-reviewer';
  model?: string;
  backend_scope?: 'local';
  model_artifact_digest?: string;
}
export interface ReceiptRef {
  entry_id: string;
  entry_type: EntryType;
  entry_hash: string;
  previous_hash: string;
  chain_position: number;
  written_ts: string;
}
/** ARE_LEDGER_ENTRY_HASH_V2 canonical fields; unsigned, in-memory rehearsal only. */
export interface Receipt extends ReceiptRef {
  hash_version: 'ARE_LEDGER_ENTRY_HASH_V2';
  agent_id: 'sovereign-ai-101-rehearsal';
  content: ReceiptContent;
  content_type: 'application/json';
  source_id: string;
  correlation_id: string;
  idempotency_key: string;
  input_hash: string;
}
export interface GovernedResponse extends ReceiptContent {
  authority: 'text-only-no-actions';
  collected_at: string;
  evidence_status: EvidenceStatus;
  receipts: ReceiptRef[];
  response?: string;
  live_qualified: false;
}
export interface SessionResponse {
  contract_version: typeof CONTRACT_VERSION;
  session_id: string;
  session_token: string;
  started_at: string;
  expires_at: string;
  source: Source;
  baseline: { entry_ids: string[]; chain_tips: ReceiptRef[] };
}
export interface Verification {
  contract_version: typeof CONTRACT_VERSION;
  session_id: string;
  request_id: string;
  correlation_id: string;
  source: Source;
  all_valid: boolean;
  verified_at: string;
  matched_entry_ids: string[];
  chains: { entry_type: EntryType; chain_valid: boolean; entries_checked: number;
    through_position: number }[];
  failure_reason: string | null;
  live_qualified: false;
}
