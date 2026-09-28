# Sovereign AI 101 presentation rehearsal

Six scenes, 390 seconds (6½ minutes): opening 40s; reframe 30s; causal architecture 80s; paired proof 100s; policy tradeoff/mechanism 75s; payoff/handoff 65s. The implementation uses the existing starter's React/Vite shell, local partner assets and fonts. The story and blueprint remain unchanged.

## Start and inspect

For recorded-fixture rehearsal, use the normal app development or production server. On scene 4, explicitly choose **Use reviewed fixture**. A network failure stays OFFLINE and unproven; it never automatically loads a fixture.

For the existing rehearsal service, start its already-built entry point (`node server/dist/server/index.js`, port 8787), then start the presentation's optional local proxy with `node src/sovereign/serve-rehearsal.mjs`. This launcher keeps the service and browser on one origin without changing the server, contract or Vite configuration. It only translates a matching local Origin header; foreign origins remain rejected. If the server build is absent or outdated, its owner must build it using the existing server workflow. The UI never connects directly across origins and has no LIVE mode.

Open the locally printed address. Select **Connect rehearsal service**. The returned source must read REHEARSAL. Run general, advance through each evidence boundary, then run injection. Both outcomes remain visible. In the policy scene run the session-local policy-unavailable condition; the adapter restores the fault afterward and explicitly sets/acknowledges the condition before every new request. No shared OPA service is disrupted.

The service is deterministic template generation and in-memory ledger simulation; it does not run Granite, OPA, OVMS, OpenShift or hardware discovery. The diagram is the reviewed source architecture, not a network trace. Source behavior (fail-open/best-effort) is explicitly separated from the new rehearsal contract (abstention and mandatory acknowledgments). The source-only local/foreign policy comparison remains unrun because the rehearsal contract has no policy-evaluation endpoint.

## Acceptance matrix

| Check | Presentation behavior |
| --- | --- |
| Cadence | Three sparse opening reveals, one reframe, four question/answer pairs |
| Architecture | Real Demo API, GCL RuleEngine, OPA, model PVC/Granite/OVMS and gateway/ARE/PostgreSQL; HTTP, gRPC and boundaries named |
| Continuity | Same architecture carried into proof; returned request, decision, dispatch and receipt evidence highlighted one boundary at a time |
| Proof | General then injection; policy unavailable is a separate controlled condition; outcomes accumulate |
| Provenance | REHEARSAL service and recorded fixture explicitly distinguished, with collection time and inspection time retained |
| Evidence | Exact current session/request/correlation selectors; exact receipt IDs/hashes; nonempty relevant chain verification; incomplete evidence cannot earn a verified payoff |
| Payoff | Current browser-session results only; direct/reloaded payoff says Proof not run |
| Authority | Deterministic rules decide; model text has no action authority; ledger integrity has limits; human accepts |
| Handoff | One contextual download for the bundled Showroom lab; 36 minutes + 4 recovery; G01–G10 pending and instructor-led only until qualified |
| Desktop | Every internal reveal checked at 1920×1080 and 1440×900, including proof results and policy outage; no scrolling or clipped controls |
| Narrow | 390×844 allows vertical scrolling; no horizontal overflow |
| Accessibility | Keyboard, touch, browser history, deep links, reduced motion, presenter notes, fullscreen control and local branding preserved |

## Presenter checks

- Use arrows, PageUp/PageDown or Space for story/reveal navigation. Buttons retain their normal keyboard behavior. P opens notes; F toggles fullscreen; Home returns to the opening without discarding collected evidence.
- Deep links use `?scene=0..5&step=...`; architecture has eight reveal positions. Legacy act links are mapped. Deep links never manufacture or rerun proof. Reloading discards in-memory credentials and results; server sessions expire separately.
- Service requests use memory-only bearer credentials; downloads omit them. Save evidence before closing. **Close presentation** requests session deletion and reports whether cleanup was confirmed; this is not platform teardown or forensic erasure.
- The export carries source revision and dirty-state limitation, safe session metadata, selected conditions, original request/response bodies, receipt IDs/hashes, verification results and unresolved gaps. Recorded fixture collection timestamps are preserved, not relabeled as fresh.
- Continue through `showroom/build/site/sovereign-ai-101/index.html` when the separately maintained guide is built/served. The handoff is deliberately a context download, not a claim that a learner seat exists. Allocate fresh learner IDs and baselines.
- Local OVMS, actual model artifacts, Intel CPU, OpenShift identity, egress/residency and live ledger qualification remain unproven. Research GCL/ARE components carry no partner product-support claim.

## Validation

`npm run check:app` runs unit tests, production build and local font/logo verification. `npm run test:visual` runs screenshots plus real rehearsal HTTP integration for all three viewports. Visual integration imports the existing service read-only and bridges requests through the test runner; no remote infrastructure is called. Snapshot masks apply only to returned timestamps, IDs and hash prefixes, not outcome labels or source state. The committed fixture is generated from the existing Runtime and separately reviewed by contract invariants; its provenance/hash are recorded in `public/fixtures/README.md`.
