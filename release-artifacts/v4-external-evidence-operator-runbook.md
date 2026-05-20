# V4 External Evidence Operator Runbook

This runbook starts from the current local state:

- Local commit: `84bc815 Add V4 parity execution and external evidence workflows`
- Working-tree amendment after that commit: `docs/project/v4-parity-execution-prompt.md`, status tools, GitHub external-readiness tooling, external-evidence readiness tooling, and the handoff package now contain the current tangible-outcome plan and blocker reporting.
- Current parity: `2 / 13`
- First blocked area: `github-remote-external-readiness`
- First missing capability: `unity-editor-executable`
- First blocked artifact: `unity:editor-cli-smoke`
- Local preflight/handoff reports are clean, but external Unity/Unreal/public deployment evidence is missing.
- Handoff integrity is now split by scope: `pnpm verify:v4-external-evidence-handoff` checks package contents plus archive/sidecar metadata, while `node VERIFY_PACKAGE_INTEGRITY.mjs` checks package-internal files only. Neither command is Unity/Unreal/public parity evidence.

Do not use this runbook to claim parity until the final status command reports `13 / 13`.

## 0. Validate The Handoff Package Before Restore

If transferring by archive instead of by branch, preserve the `release-artifacts/` path and verify the archive before extracting:

```sh
shasum -a 256 -c release-artifacts/v4-external-evidence-handoff.tar.gz.sha256
tar -xzf release-artifacts/v4-external-evidence-handoff.tar.gz
cd release-artifacts/v4-external-evidence-handoff
node VERIFY_PACKAGE_INTEGRITY.mjs
node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D
node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D
```

`RESTORE_INTO_CHECKOUT.mjs` runs `VERIFY_PACKAGE_INTEGRITY.mjs` before copying anything. Its JSON output must include:

```json
{
  "restorePreflight": {
    "ok": true,
    "command": "VERIFY_PACKAGE_INTEGRITY",
    "verificationScope": {
      "packageInternalEntries": true,
      "archiveAndSidecar": false,
      "externalParityEvidence": false
    }
  }
}
```

If `restorePreflight.ok` is false, stop and regenerate or retransmit the package. Do not run external captures from a corrupted package.

## 1. Publish The Prepared Branch

This is externally visible and should only be run by an operator with approval:

```sh
git push origin preserve/g3d-v2-execution-state
```

Open a PR from `preserve/g3d-v2-execution-state` into `main`.

Use `release-artifacts/v4-parity-external-evidence-pr.md` as the PR body.

Merge only the intended local commit:

```text
84bc815 Add V4 parity execution and external evidence workflows
```

Also include the latest working-tree amendment before or during that PR, so the default branch has the full 13-goal execution prompt, GitHub readiness audit, status summaries, and handoff tooling. If the amendment is committed before external evidence is generated, rerun:

```sh
pnpm refresh:v4-readiness-reports
pnpm verify:v4-report-freshness
pnpm prepare:v4-external-evidence-handoff
pnpm verify:v4-external-evidence-handoff
```

The workflow files must land on `main` before GitHub can normally discover and dispatch them.

If transferring by patch instead of by branch, choose the patch route that matches the target checkout:

```sh
# Copy these files from the handoff package into the checkout first.
mkdir -p release-artifacts
cp /path/to/v4-external-evidence-handoff/release-artifacts/v4-parity-external-evidence-workflows.patch release-artifacts/
cp /path/to/v4-external-evidence-handoff/release-artifacts/v4-current-handoff-supplement.patch release-artifacts/

# Use this only when the target branch does not already contain 84bc815.
git apply release-artifacts/v4-parity-external-evidence-workflows.patch
git apply release-artifacts/v4-current-handoff-supplement.patch

# Use this when the target branch already contains 84bc815 / the workflow files.
git apply release-artifacts/v4-current-handoff-supplement.patch
```

Patch-only transfers must copy the patch files into `release-artifacts/` before applying them. The supplement patch is a transfer artifact; applying it from an arbitrary temporary path updates checkout content but does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout. Use `RESTORE_INTO_CHECKOUT.mjs` when the target checkout must contain the packaged patch artifacts exactly.

The first patch contains the original external workflow commit and creates `.github/workflows/v4-external-engine-baselines.yml`, `.github/workflows/v4-public-demo-deploy.yml`, `docs/project/v4-parity-execution-prompt.md`, and `tests/unit/tools/v4-validation.test.ts`. It will correctly fail on a target checkout that already has those files from `84bc815`. The supplement patch applies on top of current `HEAD` and carries the current 13-goal prompt corrections, GitHub readiness/status reporting, external-evidence readiness updates, visual parity audit hardening, PR-body updates, and handoff-package verifier hardening.

## 2. Configure GitHub Repository Infrastructure

Required repository setup:

```text
Enable GitHub Pages.
Provision a self-hosted runner labeled unity.
Provision a self-hosted runner labeled unreal.
Configure G3D_UNITY_EDITOR as an Actions variable or secret.
Configure G3D_UNREAL_EDITOR as an Actions variable or secret.
Use the checked-in workflow's built-in G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true setting for external baseline runs.
```

Read-only verification commands:

```sh
gh repo view gchahal1982/G3D2025 --json defaultBranchRef
gh workflow list --repo gchahal1982/G3D2025 --all
gh api repos/gchahal1982/G3D2025/pages
gh api repos/gchahal1982/G3D2025/actions/runners
gh api repos/gchahal1982/G3D2025/actions/variables
gh api repos/gchahal1982/G3D2025/actions/secrets
```

Expected readiness:

- default branch is `main`
- `v4-public-demo-deploy.yml` is listed
- `v4-external-engine-baselines.yml` is listed
- Pages returns a configured site instead of `404`
- runners include a `unity` labeled runner and an `unreal` labeled runner
- variables/secrets include the Unity and Unreal editor executable paths or the equivalent secret-backed configuration

## 3. Trigger Public Demo Deployment

After the workflow file is on `main` and Pages is configured:

```sh
gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main
```

Download the workflow artifact named like:

```text
v4-public-demo-deployment-reports
```

Ingest it into the repo checkout:

```sh
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
```

Verify:

```sh
pnpm audit:v4-production-readiness
```

Expected effect:

- `tests/reports/public-demo-deployment-smoke.json` exists and passes
- `tests/reports/v4-production-readiness.json.productionReady` can only become true if all other production gates also pass

## 4. Trigger Unity/Unreal External Baselines

After the workflow file is on `main` and self-hosted runners are available:

```sh
gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all
```

Download artifacts named like:

```text
v4-unity-baseline-evidence
v4-unreal-baseline-evidence
v4-external-baseline-final-audits
```

Ingest them into the repo checkout:

```sh
pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits
```

Verify:

```sh
pnpm audit:v4-external-evidence-readiness
pnpm audit:v4-unity-unreal-parity
pnpm audit:v4-product-visual-parity
pnpm audit:v4-pbr-reference-readiness
pnpm audit:v4-hdr-render-target-readiness
pnpm audit:v4-shadow-map-readiness
pnpm audit:v4-postprocess-suite
```

Expected effect:

- Unity CLI smoke report exists and sets `ok: true`
- Unreal CLI smoke report exists and sets `ok: true`
- Unity and Unreal product/PBR/shadow/HDR/postprocess baseline reports exist
- Unity and Unreal runner evidence sidecars exist
- `tests/reports/v4-external-evidence-readiness.json.externalEvidenceReady` becomes true

## 5. Final Completion Audit

Run:

```sh
pnpm preflight:v4-parity:after-external-evidence
pnpm status:v4-parity
jq '.criteria[] | {id, achieved, blockers}' tests/reports/v4-completion-audit.json
```

Completion is valid only if:

```text
pnpm status:v4-parity -> ok: true
tests/reports/v4-completion-audit.json -> achievedCriteria: 13
tests/reports/v4-completion-audit.json -> totalCriteria: 13
```

If any criterion remains false, do not claim:

- Three.js broad superiority
- Babylon.js broad superiority
- Unity parity
- Unreal parity
- Unity/Unreal replacement
- production readiness
- full PBR parity
- production HDR/render-target parity
- production shadow-map parity
- full postprocess-suite parity
- rendered product visual parity against Unity/Unreal
