# Showroom package validation

Validated at: 2026-09-28T16:53:03+00:00

Command: `npm --prefix showroom run check` from the repository root. Exit status: 0.

- Content: ten ordered stages, 36 minutes plus four-minute recovery allowance.
- Downloads: five byte-identical attachment copies, including sanitized worksheet and profile template.
- Fixture: four cases, six illustrative receipts, five relevant type chains. `REHEARSAL_VALID`; `live_completion: false`.
- Tests: 30 passed, 0 failed. Includes false/string verification, empty/truncated chains, wrong session/correlation/hash, stale entries, broken predecessor, denied dispatch, missing fault restore, source relabeling and refused `--live` mode.
- Antora: build passed with warning-level failure enabled; RHDP Showroom theme rendered.
- Rendered links: 12 HTML files, 379 local file/anchor references checked; no missing targets.
- Browser inspection: overview renders ordered navigation, download links, and the implemented-contract / REHEARSAL / blocked-live notice clearly. Temporary preview server and tab closed after inspection.
- Authored-text credential-pattern scan: 31 files checked, no matches. This is not a runtime security audit.

Generated site: `showroom/build/site/sovereign-ai-101/index.html`.
Native component: `showroom/antora.yml`. Playbook: `site.yml`.
Learner pages: `showroom/modules/ROOT/pages/`. Teaching assets and validator: `content-101/`.

These results validate this content package only. No cluster was provisioned, no Granite inference was performed, no actual ledger canonical hash was verified, and no lab cleanup was executed. All live G01–G10 qualification gates remain blocked. Scenario timestamps and illustrative hashes are not observed runtime evidence. The 36-minute timing is authored, not a measured usability result.
