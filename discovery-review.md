# Sovereign AI 101 discovery review

**Status: reviewed source contract; live release remains blocked.** This review replaces the generated inventory with the bounded inference → deterministic governance → ledger inspection → human decision story. It authorizes no deployment and certifies no sovereignty outcome.

Source: `/Users/jkershaw/Documents/sovereign-ai-lab`  
Revision: `d58e1f57803a90ae4bcb92f2f0f6cb468989eb2c`  
Destination: `/Users/jkershaw/Documents/sovereign-ai-101`  
Reviewed: 2026-09-28

## Source state and method

The checkout HEAD matches the requested revision. Superproject status is ` m ledger/are-immutable-ledger`; that submodule reports ` M demo/joint-cpex/run-joint-demo.sh` (one insertion and one deletion). The existing change was preserved and excluded from evidence. Its working-file SHA-256 is `384150b623145198dd748a53104fb7f7ce1433b7ba205ccf3acc2a6fac80af1d`.

Pinned nested repositories:

- GCL: `95c301d735c05d03b18dec50fdd9e4741def246c`.
- Ledger: `a1b70fbaca0e81101d2731717386e5c623eea9ff`.
- ContextForge: `01278c451da2f2a9db20637e66d5055df3e9de40` (excluded flow).
- Praxis: `8cd10590ed733d824d58be7589c839134aecb4ff` (excluded flow).

Review used read-only implementation, manifest, policy, contract, test-source and guide inspection. No cluster queries, service calls, lab tests, deployments or source edits were performed. `verified-fact` means verified in source. Planned live evidence L00–L04 remains **not collected**.

The generated discovery identified 126 candidate artifacts and six generic object candidates; it did not establish a runtime architecture. Its `agentic` label is rejected for the selected path. The existing `docs/preso-demo-lab-analysis.md` explicitly targets older commit `89c5b0c`; its narrative, test counts and broader sovereignty claims are not current proof. `docs/infra01-deployment-blockers.md` is historical context, rechecked against current implementation rather than copied as current status.

## Reviewed findings

1. **Selected runtime path:** demo API → GCL prompt adapter → OPA → permitted local OVMS call, with best-effort ledger writes and separate human inspection. `experience/demo/main.py`, `gcl/prompt-adapter/adapter.py` and `infrastructure/oberon/{demo-api,semantic-router}.yaml` support E01/E02/E04. The wider deploy script also creates ContextForge, Praxis and MCP, but these are absent from this inference call path.
2. **Deterministic governance:** `rules.yaml` supplies regex patterns and fixed evidence scores to GCL `RuleEngine.evaluate`. This adapter does not call GCL's LLM classifiers, planner or a full autonomous loop. Fixed `confidence` values are neither measured accuracy nor calibrated probability. Only the final user message is classified; direct adapter requests can forward additional messages.
3. **Generative AI role:** Granite produces text after the gate. It receives messages, model alias and token limit; it receives no ledger context and has no policy, tool or infrastructure authority. The demo API constructs a single user message. No semantic output validator exists in this path. Model/backend failure returns HTTP 502.
4. **Model and platform identity:** conversion selects `ibm-granite/granite-3.2-2b-instruct`, INT4 and `/models/ov/sovereign-granite-2b`; the OVMS alias is `granite-3.2-sovereign`. A 3B manifest header and broader model lifecycle claims are not serving evidence. OpenShift operations are represented by `oc` and Routes; Intel CPU placement and actual serving device/model are still unverified. Preserve Red Hat's platform and Intel's OpenVINO/OVMS role, while crediting IBM Granite and treating GCL/ledger as research components.
5. **Separate policy comparison:** Rego allows `local` and denies foreign `sensitive_personal` input. Tests encode those cases, but were not run here. `/api/policies/evaluate` can demonstrate this separately from inference and attempts its own ledger write. Direct OPA calls do not take that logging path. `/api/classify` neither evaluates OPA nor invokes Granite.
6. **Ledger meaning:** the gateway exposes entry IDs, hashes, payloads and correlation IDs; verification recomputes hashes and checks links per `entry_type`. This supports integrity inspection, not completeness, truthful content, signed actor identity or compliance. The adapter's `input_hash` hashes the serialized decision payload, not a complete prompt or inference response.
7. **Human decision:** the presenter/reviewer decides whether a current-session evidence case supports the bounded claim. Missing evidence cannot become a success badge. This is the new presentation's acceptance rule, not a fail-closed runtime guarantee.

## Blockers and claim limits

These IDs match the blueprint and remain open for later runtime or lab work:

- **B01 — fail-open OPA integration:** adapter `falsify_with_opa` defaults a missing result to true and allows on exceptions/non-200 responses. Rego default-deny does not fix this. No fail-closed claim.
- **B02 — incomplete evidence is possible:** adapter ignores ledger HTTP status and swallows exceptions; policy bridge also tolerates ledger write failure. `routed_local` is recorded before generation, with no completion receipt. Require response plus fresh matching ledger evidence.
- **B03 — destination is asserted:** adapter hard-codes `destination_region=local` independently of configured backend; deploy script offers remote MaaS. Local inference requires effective configuration/runtime inspection. A foreign-policy denial is not an observed blocked transfer.
- **B04 — identity/readiness unproven:** no current model, image digest, CPU inventory or OVMS chat response was collected. Mutable image tags and unpinned conversion downloads limit reproducibility. Neither CPU resources nor service DNS prove Intel hardware or residency.
- **B05 — deployment wiring drift:** `infrastructure/helm/Makefile` points at absent `../dev-cluster-1/deploy.sh`; the current script is `infrastructure/oberon/deploy.sh`. Do not call the lab turnkey. This task does not repair it.
- **B06 — unsigned and weakly correlated evidence:** adapter declares an agent ID but sends no writer signature; `/api/entries` does not forward signature fields. Its correlation ID is not returned with the inference response, and policy bridge writes omit explicit correlation. Use fresh synthetic case markers, entry IDs, payloads and timestamps; treat ambiguous matches as unproven.
- **B07 — no qualified live presentation yet:** blueprint collection contracts exist, but current runtime evidence, typed presentation adapters and reviewed fixtures do not. Scene implementation and live qualification are later work.

The ledger gateway can return `all_valid=true` for an empty result; ledger verification also treats an empty chain as valid. Require fresh matching entries and nonzero checks for relevant chains, not a green boolean alone. Readiness probes do not establish dependency health. Prompt previews are persisted; use synthetic prompts in this 101 demonstration.

Excluded from the main story: TDX/confidential computing, training/adaptation, benchmark advantage, ContextForge/Praxis/MCP, remote MaaS, autonomous remediation, and unsupported sovereignty, legal-compliance, guaranteed-residency, signed-commit or production-readiness claims. Broader guide and historical report claims do not override these exclusions.

- **B08 — tenant mode conflicts with local scope:** `agnosticv/ai-qs-sovereign-ai-lab-tenant/common.yaml` advertises `local_cpu` but selects `maas` and a remote endpoint. Require local full-mode qualification and the companion lab admission gates.

## Story and lab handoff

`story.brief.yaml` defines six scenes in four acts, totaling 390 seconds: sparse stakes, reframe, causal architecture, paired general/injection proof, a separate OPA destination comparison with an honest limitation, then current-session evidence payoff and a deliberate close. Architecture reveals use question → answer; live results accumulate on that same path. Internal service hops remain source-derived unless directly observed.

Handoff continues into existing inference exercises 1–4, residency policy exercises 1–2, and router-event/chain inspection. The existing proof guide includes TDX and seven-layer assertions, while policy examples call OPA directly; the instructor must select and qualify the scoped exercises. Lab content is unchanged. Preserve source revision/dirty state, runtime identities, conditions, raw results, entry IDs/hashes and verification outcomes. The companion `docs/sovereign-ai-101-lab-plan.md` and `docs/journey-acceptance-matrix.md`, authored separately in the shared destination, define a 36-minute hands-on contract with four minutes of recovery allowance. The brief now aligns to that handoff. Its general/sensitive allow, injection deny and controlled OPA-outage abstain sequence requires new session/request correlation, mandatory receipts, completion events and scoped cleanup. These are future requirements (E11), not current API behavior; all G01–G10 remain gates for live learner delivery. Current serial marker-based inspection is provisional, not a substitute for the final learner correlation contract.

## Validation

Run the canonical starter's validator from `/Users/jkershaw/Documents/demo-story-starter`:

```sh
npm run validate:blueprint -- /Users/jkershaw/Documents/sovereign-ai-101/demo-blueprint.yaml
```

The scaffold does not define its own `validate:blueprint` command. The starter validator checks required structure with text patterns; it does not establish YAML semantics, source accuracy, endpoint health or runtime readiness. A separate parse/reference audit checks YAML, source paths, evidence/flow references, required flow endpoints and the 5–7 minute scene budget.

The canonical starter validator passed on 2026-09-28. YAML parsing, unique evidence IDs, flow/evidence references, source path existence, source revision, typed flow endpoints, uncollected live states and the six-scene/390-second budget also passed. No runtime tests were executed or implied. Only `demo-blueprint.yaml`, `discovery-review.md` and `story.brief.yaml` are in scope; app scenes and lab content remain untouched.
