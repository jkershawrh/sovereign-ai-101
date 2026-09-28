# Qualification boundary

Source: static review and authored REHEARSAL content, 2026-09-28. Live completion is blocked.
Authoritative design inputs remain the repository's demo-blueprint.yaml, story.brief.yaml, docs/sovereign-ai-101-lab-plan.md and docs/journey-acceptance-matrix.md. This summary does not replace their tests or release record.

| Gate | Required qualification | Current package disposition |
| --- | --- | --- |
| G01 | Real install entry point, preflight and rollback | Blocked; no environment installed |
| G02 | Honest false/error/missing-data negative controls | Runtime blocked; only offline content checker tested |
| G03 | Pinned local model, CPU placement, quota/storage, actual chat completion | Blocked; model and hardware observations absent |
| G04 | Deterministic allow/deny/abstain and session-scoped OPA fault | Blocked; reviewed adapter fails open |
| G05 | Mandatory decision/completion acknowledgement and idempotency | Blocked; reviewed writes are best effort |
| G06 | Fresh exact correlation, baseline, isolation and dispatch evidence | Blocked; fixture joins only |
| G07 | Actual canonical receipt and nonempty type-chain verification | Blocked; illustrative hashes only |
| G08 | No secrets, minimized data, scoped access, blocked bypass | Blocked; sanitized templates are not a deployment audit |
| G09 | Idempotent scoped teardown, storage reclamation, no owned residue | Blocked; no live cleanup performed |
| G10 | Honest source state and observed 30–40 minute learner run | Blocked; authored 36-minute schedule is not a timed usability result |

The reviewed source revision is d58e1f57803a90ae4bcb92f2f0f6cb468989eb2c. The reviewed GCL submodule is 95c301d735c05d03b18dec50fdd9e4741def246c; ledger is a1b70fbaca0e81101d2731717386e5c623eea9ff and includes an excluded dirty demo script. Record actual deployed source, nested revisions, dirty state, image identities and run date in any later qualification.

Existing source exposes POST /api/route but not the full learner contract illustrated here. Current rejection/status mapping differs; public request/correlation propagation, mandatory receipts, completion events and abstention are proposed requirements. This package implements their teaching shape only. No automatic promotion and no use of fixture verification to release a live lab.
