# F6 development packaging — REHEARSAL only

This package separates the static presentation (port 8080) from the governed Node
rehearsal service (8787). Both images target **linux/amd64**, run as non-root, and
support an entirely read-only filesystem, including an arbitrary OpenShift UID.
Neither runtime requires a writable volume or embedded secret. This is F6
pre-release development packaging, not F7 immutable release evidence or
Launchpad certification: **certified=false, orderable=false,
promotion_eligible=false, live_qualified=false**.

Read the [runtime contract](../contracts/README.md),
[presentation guide](../docs/presentation-rehearsal.md), and
[qualification gates](../docs/journey-acceptance-matrix.md). The roadmap remains
`demo-story-starter/docs/lab-factory-roadmap.md`. Application, contract, source-lab,
Showroom, blueprint/story and AgnosticV files are outside this packaging change.

## Validate and build locally

Requirements: Node 22, the existing npm lockfile dependencies (`npm ci`), kubectl
with Kustomize, and Podman or Docker with Linux AMD64 support (emulation is allowed
for development). Commands run from the repository root.

```sh
npm run check:packaging
npm run build:images
npm run dev:packaging
```

`CONTAINER_ENGINE=docker` selects Docker; the default is Podman. The build helper
never pushes images. It uses a digest-pinned Node 22 Alpine base and a restrictive
build-context allow-list. A temporary source snapshot gives Docker the same
ignore rules through a staged `.dockerignore`; source symlinks are rejected. The
snapshot is removed even when a build fails. npm install scripts are disabled. Only built assets,
compiled service modules and small packaging launchers enter the final images;
the final service has no npm dependency tree. The base pin is a reviewed input,
not an assertion of support, license review or vulnerability clearance. Refresh
it deliberately and scan before any release.

The build helper passes full Git HEAD into `org.opencontainers.image.revision`
and records whether the worktree is dirty in `io.sovereign.source-dirty`. Local
names include `development-<revision>`; the helper prints the exact **local image
IDs**. Dirty builds are allowed for development and are not source-bound release
artifacts. A local image ID is not a registry manifest digest. No produced digest
is committed into the source that built it.

`dev:packaging` resolves local images to their IDs, creates a randomly named
internal network, runs both images with dropped capabilities, no privilege
escalation, no service port published, a random loopback-only presentation port,
read-only roots, limits and an arbitrary non-root UID (100123, within common
rootless UID mappings). It checks actual runtime identity/read-only access,
health/readiness, static HTML, the full API journey, default-off live behavior,
restart session invalidation and readiness failure when the service stops.
It deletes only its own labeled containers and network in a `finally` block,
repeats teardown and verifies that no owned containers/networks/volumes remain.
SIGINT/SIGTERM trigger that same path. Cleanup failure fails the run; SIGKILL or
host failure cannot run cleanup, so inspect the printed `sovereign-dev-*`
resources before retrying. It intentionally retains image/build caches and never
claims platform-wide zero residue or forensic erasure.

Optional local inputs are `PRESENTATION_IMAGE` and `REHEARSAL_IMAGE`. These must
already exist locally with the package's development labels; the helper checks
Linux/AMD64 and non-root metadata and uses the resolved IDs. The default names
match `build:images`. No registry fetch occurs in the journey.

## Persistent local Compose session

`compose.json` is JSON syntax, a valid YAML subset accepted by Compose. It uses
local image IDs, not registry deployment references. Copy the two IDs printed by
the build helper into your environment:

```sh
export PRESENTATION_IMAGE=<local-presentation-image-id>
export REHEARSAL_IMAGE=<local-rehearsal-image-id>
# Requires a Compose provider; the dev:packaging helper does not.
podman compose -p sovereign-101-dev -f packaging/compose.json up -d
node packaging/scripts/journey.mjs http://127.0.0.1:8080
podman compose -p sovereign-101-dev -f packaging/compose.json down --volumes --remove-orphans
```

Use `docker compose` when appropriate. The Compose project above is a dedicated
local development project; do not reuse it for unrelated containers. `PRESENTATION_PORT`
can select another local port. Compose's resource limits are development proposals,
not measured seat sizes. The automated `dev:packaging` command is the preferred
one-shot journey because it verifies cleanup even after a failed assertion.

Open the presentation, select **Connect rehearsal service**, and run the general,
injection and policy-unavailable conditions. Browser requests stay same-origin:
`/api/*` is proxied to the service. `SERVICE_URL` is a **server-side runtime origin**
(default `http://rehearsal:8787`), never compiled into JavaScript. The proxy allows
only HTTP(S) origins without username/password/path/query/fragment. It preserves
the bearer token only in the request header; it neither logs nor persists it.
The edge rejects foreign Origin headers, translates only a matching HTTP/HTTPS
presentation origin, and strips untrusted forwarding/hop headers. No CORS or
credentials are embedded in the static assets. `/healthz` checks presentation
process health; `/readyz` also requires a REHEARSAL-ready upstream. Missing upstream
returns 503, with no recorded-fixture substitution.

`SOVEREIGN_SOURCE` defaults to `REHEARSAL`; `DELIVERY_STATUS` defaults to
`development`. **Any other value**, including LIVE, OFFLINE, production, certified
or GREEN-live, causes the packaging launchers and helpers to refuse startup.
The service launcher imports the existing runtime and binds it to `0.0.0.0` inside
the container; it does not change the application's localhost development entry.

## Development OpenShift rendering

The [base](../deploy/openshift/base) contains two Deployments, two ClusterIP
Services, one TLS edge Route for the presentation, and three NetworkPolicies.
Resource files use JSON (valid YAML) so validation needs no new parser dependency.
The base intentionally contains `registry.invalid/...@sha256:000...` placeholders.
**Do not apply the base directly.** It is renderable but not deployable; its
placeholder images cannot be pulled. Use reviewed real image manifest digests:

```sh
export PRESENTATION_IMAGE=registry.example/owner/presentation@sha256:<64-hex-digest>
export REHEARSAL_IMAGE=registry.example/owner/rehearsal@sha256:<64-hex-digest>
export SOURCE_REVISION=<full-40-character-reviewed-source-commit>
node packaging/scripts/render.mjs > /tmp/sovereign-development.yaml
# Inspect the rendered development proposal before applying to an existing,
# explicitly selected disposable namespace. No deploy occurs in these helpers.
: "${DISPOSABLE_NAMESPACE:?Select an existing disposable namespace}"
oc -n "$DISPOSABLE_NAMESPACE" apply --dry-run=server -f /tmp/sovereign-development.yaml
oc -n "$DISPOSABLE_NAMESPACE" apply -f /tmp/sovereign-development.yaml
# After testing, remove this exact set; inspect the namespace for owned residue.
oc -n "$DISPOSABLE_NAMESPACE" delete -f /tmp/sovereign-development.yaml --wait=true
```

The render helper refuses tags (including tag+digest), malformed or zero digests,
placeholder registries, missing source revision and non-development labels. It
validates before producing YAML. Supplying strings is only structural validation;
image existence, digest pull, source label match, signatures and provenance still
need independent verification. Do not fabricate a registry digest from a local ID.
This task does not push, deploy, create namespaces or alter any cluster.

The pods use `runAsNonRoot`, `RuntimeDefault` seccomp, no privilege escalation,
all capabilities dropped, read-only roots, no service-account token mounts and
Linux/AMD64 placement. OpenShift assigns its namespace UID; no fixed UID/SCC bypass
is requested. One replica and `Recreate` prevent load-balancing ephemeral sessions
across separate ledgers; restart/rollout loses sessions. No persistence, resume
across restart, high availability or production identity is claimed.

Network policies deny all package ingress/egress, then permit only router-to-
presentation, presentation-to-service and presentation DNS to OpenShift DNS.
The service has **no allowed egress**. Router namespace labels, DNS namespace/pod
labels/ports (53 and 5353), CNI enforcement, router host-network behavior, TLS trust,
SCC admission and actual target OpenShift version remain development-cluster
qualification requirements. The policies are based on documented
[Kubernetes restricted pod controls](https://kubernetes.io/docs/concepts/security/pod-security-standards/)
and [NetworkPolicy isolation](https://kubernetes.io/docs/concepts/services-networking/network-policies/).
Private registry pull credentials, if needed later, belong in namespace-managed
imagePullSecrets provided by the operator; none are needed or included here.

The Route exposes the unauthenticated **rehearsal session issuer**. Use an isolated
facilitator-controlled development namespace and reviewed ingress policy; this
is not a production multi-tenant identity boundary. Resource requests (50m CPU,
64Mi per pod) and limits (500m CPU, 256Mi per pod) are explicitly **unmeasured
development proposals**. No seat concurrency or capacity claim follows from them.

## Evidence and remaining gates

The journey creates a fresh session; exercises general allow (one dispatch),
injection deny (zero), and policy-unavailable abstain (zero); checks exact
session/request/correlation IDs, matched receipt IDs, hashes, nonempty valid
chains, per-receipt verification and identical retry results; resets the fault;
deletes the session and proves token invalidation. Reports contain no bearer
credentials. Both ordinary failure and successful completion must perform cleanup.
`check:packaging` includes mutation tests for malformed digests, weakened contexts,
wrong modes/probes, credentials and open egress, plus real local proxy/runtime
integration. Static secret checks are bounded lint and are not a full secret scan.

This does not complete all F6 gates: measured steady/peak resources, learner timing,
cluster admission/network enforcement, interrupted provisioning/reclaim, shared
resource isolation and cluster residue proof remain. F7 additionally needs a
clean immutable source, scans, SBOMs, signatures, provenance and exact-digest pull
receipts. No certification, live model execution/placement, policy-engine
availability, signed ledger, residency or production readiness is established.

## Source-bound immutable release workflow

After a reviewed commit is pushed to the canonical repository, dispatch
`.github/workflows/release-images.yml` with its full 40-character revision and
`publish=true`. The workflow refuses revision drift, reruns the complete project
check, rebuilds both images without cache for Linux AMD64, blocks fixable high or
critical vulnerabilities, generates SPDX SBOMs, publishes commit-specific GHCR
images, signs each digest with GitHub OIDC, and emits GitHub provenance
attestations. Evidence is retained as workflow artifacts for 90 days.

This workflow produces candidate release evidence; it does not assert license
approval, long-term retention, three rollback releases, destination pullability,
Launchpad trust, certification, orderability, or promotion eligibility.
