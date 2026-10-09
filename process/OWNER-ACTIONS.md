# OWNER-ACTIONS — repo settings G5 cannot make (no repo-settings writes allowed)

Prepared for Gurbaksh (repo owner). Each action has the exact command. Nothing
here is optional for the gates to hold: without branch protection the
unmasked checks can be bypassed by direct pushes to `main` (today's state:
`protected: false`, no rulesets — verified via `gh api`).

## 1. Create the main ruleset (blocks direct pushes + requires checks)

`gh api -X POST repos/auraoneai/aura3d/rulesets --input process/ruleset-main.proposal.json`

The proposal in `process/ruleset-main.proposal.json` requires:

- pull requests for `main` (no direct pushes; G5 merge serialization becomes enforceable)
- the status checks listed below (check-run names as they appear on PRs):
  - `Type Check` (workflow `CI`)
  - `Lint` (workflow `CI`)
  - `Build` (workflow `CI`)
  - `Test (Node 22)` (workflow `Test & Coverage`)
  - `unit` (workflow `QR contracts`)
  - `browser` (workflow `QR contracts`)
  - `arch-gates` (workflow `QR-15 architecture gates`)
  - `pack-check` (workflow `QR-15 pack-check`)
  - `bundle size` (workflow `QR-15 bundle size`)
  - `qr-required` (workflow `qr-required`) — includes allflags-smoke,
    ownership check, checklist-lint
- deletion + non-fast-forward protection on `main`

Informational (deliberately NOT required): `webgpu-smoke`,
`public-demo-deploy` audits, `mirror-to-gitlab`, `quality-devices`.

Verify the check names on a real PR before applying — rename a check name in
the JSON if the run's display name differs, e.g.:
`gh api repos/auraoneai/aura3d/commits/HEAD/check-runs --jq '.check_runs[].name'`

## 2. Do NOT grant bypass to the devin-ai-integration app

The ruleset must apply to everyone. If automation pushes break, the fix is a
`qr/**` branch + PR, never a bypass list entry.

## 3. After the ruleset is active

G5 flips nothing itself; the gates go blocking the moment the ruleset lands.
`qr-required.yml` reports `$ALL`/`$ALL,strict` arms as expected-red with the
Track 0 issue link (#375) until the bisection exits — a PR that regresses a
previously green arm fails.

## 4. GitLab side (optional hardening)

The GitLab mirror's pipeline-variable override is already locked
(`ci_pipeline_variables_minimum_override_role = no_one_allowed`). No action.
