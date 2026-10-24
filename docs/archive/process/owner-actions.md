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

## 5. OA-1 check-name verification (2026-10-10, against a real run)

The names were checked against the check-runs on PR #863 head `c54ef09a`
(`gh api repos/auraoneai/aura3d/commits/<sha>/check-runs --paginate --jq '.check_runs[].name'`).
**Do not apply `ruleset-main.proposal.json` as written.** Fix these first:

| Proposal context | Finding on the real run | Needed before applying |
|---|---|---|
| `bundle size` | No such check; the job is `bundle-size` | Rename the context (or the job) |
| `unit` | 7 different jobs are named `unit` (QR contracts, prd04, prd10, prd13, QR-09, ...) | Give the QR contracts jobs unique names, e.g. `QR contracts / unit`, and require those |
| `browser` | 4 jobs are named `browser` | Same as `unit` |
| `arch-gates`, `pack-check`, `bundle-size` | Path-filtered `pull_request` triggers. A required check that never starts leaves unrelated PRs stuck at "Expected". `arch-gates` and `pack-check` have no `push: main` trigger | Drop the path filters for required workflows (or add an always-run summary job) and add `push: main` |
| `Test (Node 22)` | Two jobs carry this name (CI and Test & Coverage) | Use one unique name |
| `qr-required` | OK. It runs on every PR; allflags-smoke runs only on main/schedule/dispatch/`qr-allflags` PRs (#866) | — |

Also before applying: in `qr-prd15-bundle-size.yml`, "Commit baseline on main pushes" pushes a bot commit straight
to `main`. The ruleset's `pull_request` rule will reject that push, which turns the job red on every main run.
That step must become an artifact or a PR before the ruleset goes live.

G5 prepares these workflow changes as one Wave 1 PR. The owner then applies the corrected proposal.

After applying, verify:

```bash
gh api repos/auraoneai/aura3d/rulesets --jq '.[] | {id, name, enforcement}'
gh api repos/auraoneai/aura3d/rules/branches/main --jq '.[].type'
```

`bypass_actors` stays `[]`, with no entry for `devin-ai-integration` or anyone else (§2).

## 6. OA-2: `KIRO_PRISM_API_KEY` Actions secret (#137, blocks lane 13 row 13-S7)

The owner sets the secret from the Prism credential store. Never paste the value into an issue or a file.

```bash
gh secret set KIRO_PRISM_API_KEY --repo auraoneai/aura3d   # prompts for the value
```

Done when the owner closes #137.

## 7. OA-4 / P-62: release order (PRD-15 §11; PRD-16 P-62). Decision needed

State on main: #357 merged the 4.0 removals (`packages/lean`, 22 subpaths, 85 `.` names), but 3.1.0 was never
published. The root `package.json` is still 3.0.1 and the last tags are `v3.0.0` and `v3.0.1`. The last commit
before #357 is `374c7ac2a` (first parent of merge `afb475c2f`).

Pick one option:

- **A. Publish 3.1.0 first.** Cut 3.1.0 with deprecations (not removals) from a pre-#357 base (`374c7ac2a`), using
  the release workflow and the production runbook `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md`.
  Publish 4.0.0 no sooner than 4 weeks later. Lane 15 (15-T8.2) prepares the RC branch and reruns the 36 strict
  captures cancelled on #357. Agents never publish.
- **B. Signed waiver.** Add a waiver section to `docs/project/aura3d-quality-rebuild/migration/` (MIGRATION-4.0)
  that states consumers move from 3.0.1 to 4.0.0 directly, signed and dated by the owner.

Decision (owner): `A | B`. Date: `____`. Signature: `____`.

## 8. OA-3 / P-63: lean fixtures (#525, PRD-15 §16.3). Decision needed

T8.1 closed §16.3 "by deletion": `tests/qr/prd15/fixtures/lean-templates` and `tools/lean-fixture-capture` were
removed along with `packages/lean`.

Pick one option:

- **A. Removal-proof run.** Lane 15 restores the fixture capture as a one-off run against the pre-removal commit
  `374c7ac2a`. It builds `prd15-lean-{product,minigame}` from the packed tarball at 1920×1080 and 390×844 and
  judges the PRD-15 §16.3 criteria. The run id is recorded on #525 before the row closes.
- **B. Signed scope cut.** §16.3 is cut from PRD-15. Record the cut here and on #525, signed and dated.

Decision (owner): `A | B`. Date: `____`. Signature: `____`. Record the same decision as a comment on #525.

## 9. T5.6-CI: Device Farm OIDC role (lane 12, optional until device runs exist)

`quality-devices.yml` uses OIDC once G5's T5.6-CI PR lands; no AWS keys are stored in GitHub. The owner creates the role
with the designated AWS setup (`/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`, operator
profile). Agents never create IAM trust. The role must:

- trust `token.actions.githubusercontent.com` with `sub = repo:auraoneai/aura3d:ref:refs/heads/main` and `aud = sts.amazonaws.com`;
- allow `devicefarm:*` only on resources tagged `project=aura3d-quality-gate`.

Then set these as repository **variables** (not secrets):

```bash
gh variable set DEVICE_FARM_ROLE_ARN --repo auraoneai/aura3d --body "<role arn>"
gh variable set DEVICE_FARM_PROJECT_ARN --repo auraoneai/aura3d --body "<project arn>"
gh variable set DEVICE_FARM_POOL_IOS --repo auraoneai/aura3d --body "<pool arn>"
gh variable set DEVICE_FARM_POOL_ANDROID --repo auraoneai/aura3d --body "<pool arn>"
```

Afterwards, delete the stored secrets `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` if they exist; they are not set today.
