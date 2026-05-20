# Add V4 Parity Execution And External Evidence Workflows

## Summary

This change prepares the repository-side path for the remaining V4 parity gates without claiming those gates are complete.

It adds:

- `docs/project/v4-parity-execution-prompt.md`: execution prompt and concrete checklist for all 13 parity goals, including achieved-but-must-not-regress guardrails for full glTF parity and full WebGPU parity.
- `.github/workflows/v4-external-engine-baselines.yml`: manual workflow for real Unity/Unreal self-hosted baseline captures.
- `.github/workflows/v4-public-demo-deploy.yml`: manual GitHub Pages static demo deployment and public smoke validation workflow.
- `package.json`: status, readiness, external-evidence, ingest, and handoff scripts used by the V4 parity gates.
- `tools/v4-*`: read-only parity status, GitHub external-readiness, external-evidence readiness, product/PBR/shadow/HDR/postprocess/Unity-Unreal audits, and handoff packaging tools.
- `tests/unit/tools/v4-validation.test.ts`: V4 validation coverage, including external-evidence readiness, workflow validation, public deployment validation, status summaries, and handoff packaging checks.
- `release-artifacts/*`: operator runbook, PR body, completion audit, current supplement patch, and external-evidence handoff package/checksum.

## Current Status

Current parity remains:

```text
2 / 13 achieved
11 / 13 blocked
```

Achieved:

- `full-gltf-parity`
- `full-webgpu-parity`

The prompt now treats these as guardrails that must stay achieved while the remaining renderer, product visual, production, and external evidence work lands.

First blocker area:

```text
github-remote-external-readiness
```

First blocked artifact:

```text
unity:editor-cli-smoke
firstMissingCapability: unity-editor-executable
```

## Why This Is Needed

The remaining criteria require real external artifacts:

- Unity editor CLI smoke and same-scene baselines.
- Unreal editor CLI smoke and same-scene baselines.
- Durable public HTTPS demo deployment smoke.
- Ingestion of uploaded external baseline/public deployment reports.
- Final parity preflight after external evidence is present.

Local reports and validators are prepared, but GitHub currently cannot run the V4 workflows until these workflow files land on `main`.

Latest read-only GitHub state:

- No remote `preserve/g3d-v2-execution-state` branch exists on origin.
- No open or closed PR for this handoff branch was found.
- `main` is the repository default branch.
- GitHub workflow listing does not show the V4 external-baseline or public-demo workflows.
- GitHub Pages is not configured.
- No self-hosted Unity/Unreal runners, Actions variables, or Actions secrets are configured.

## Validation Run Locally

```sh
pnpm preflight:v4-parity
pnpm exec vitest run tests/unit/tools/v4-validation.test.ts
pnpm exec vitest run tests/unit/tools/verify-tools.test.ts
pnpm typecheck
pnpm build
pnpm verify:v4-examples
pnpm verify:package-install-smoke
pnpm verify:package-provenance
pnpm refresh:v4-readiness-reports
pnpm prepare:v4-external-evidence-handoff
pnpm verify:v4-external-evidence-handoff
pnpm verify:v4-report-freshness
pnpm doctor:v4-external-host:strict
pnpm status:v4-parity
git diff --check -- docs/project/v4-parity-execution-prompt.md tests/unit/tools/v4-validation.test.ts .github/workflows/v4-external-engine-baselines.yml .github/workflows/v4-public-demo-deploy.yml
```

Observed local results:

- `pnpm preflight:v4-parity`: passed; rebuilt static demos, reran static-server smoke, verified external baseline dry-runs, refreshed readiness reports, regenerated the handoff package, and verified the handoff archive/sidecar.
- Report freshness: `ok: true`, `issues: 0`
- External evidence handoff package: `ok: true`, `checkedFiles: 154`, `violations: []`
- Repo-side handoff verification scope: `packageInternalEntries=true`, `archiveAndSidecar=true`, `externalParityEvidence=false`
- External evidence handoff archive: `release-artifacts/v4-external-evidence-handoff.tar.gz`
- External evidence handoff archive checksum source of truth: `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`
- External evidence handoff transfer metadata source of truth: `release-artifacts/v4-external-evidence-handoff.transfer.json`
- External evidence handoff package includes `docs/project/v4-parity-execution-prompt.md`, the operator runbook, this PR body, the completion audit, status/readiness/audit tools, workflow files, asset import preflight/OBJ loader files, visual parity reports/screenshots, and `tests/unit/tools/v4-validation.test.ts`.
- Standalone operator package verification also passed after the full preflight: archive checksum OK, `node VERIFY_PACKAGE_INTEGRITY.mjs` reported `checkedFiles=152` and `violations=[]`, and `node RESTORE_INTO_CHECKOUT.mjs --dry-run /Users/gurbakshchahal/G3D` reported `restorePreflight.ok=true`.
- Handoff drift checks are covered by `pnpm exec vitest run tests/unit/tools/v4-validation.test.ts -t "external evidence handoff" --reporter=dot`; the full `tests/unit/tools/v4-validation.test.ts` file also passes with `44` tests after the hardening. The verifier now requires the packaged PR body, completion audit, and supplement patch to contain the current standalone-operator, 19-file supplement, and two-patch-route markers.
- Current completion audit: `achievedCriteria=2`, `totalCriteria=13`.
- Current external evidence readiness: `externalEvidenceReady=false`, `readyAreas=4`, `blockedAreas=7`, `readyArtifacts=2`, `blockedArtifacts=30`, first blocked artifact `unity:editor-cli-smoke`.
- `pnpm build`: passed and finalized dist exports for 15 packages
- `pnpm verify:v4-examples`: passed
- `pnpm verify:package-install-smoke`: passed with 5 imported entrypoints and 8 smoke assertions
- `pnpm verify:package-provenance`: passed with signature verification
- `pnpm doctor:v4-external-host:strict`: exits nonzero as expected until real Unity/Unreal/public deployment capabilities are present; the report still shows `handoffPackageReady: true`
- `node release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs --dry-run <checkout>` runs `VERIFY_PACKAGE_INTEGRITY.mjs` first and reports `restorePreflight.ok=true`; standalone package verification is package-internal only and does not clear external parity evidence.
- Parity status: `ok: false`, `achievedCriteria: 2`, `totalCriteria: 13`

## Required Follow-Up After Merge To `main`

If this PR is created from the local branch, include the current working-tree supplement before merging. It carries the full 13-goal prompt, GitHub readiness/status reporting, external-evidence readiness updates, visual parity audit hardening, and handoff packaging updates. If that supplement is committed before external artifacts are generated, rerun:

```sh
pnpm refresh:v4-readiness-reports
pnpm verify:v4-report-freshness
pnpm prepare:v4-external-evidence-handoff
pnpm verify:v4-external-evidence-handoff
```

If the handoff is transferred by patch instead of by branch, use the correct patch route for the target checkout:

- Copy `release-artifacts/v4-parity-external-evidence-workflows.patch` and `release-artifacts/v4-current-handoff-supplement.patch` from the handoff package into the target checkout's `release-artifacts/` directory before applying them.
- If the target branch does not already contain `84bc815`, apply `release-artifacts/v4-parity-external-evidence-workflows.patch` first, then `release-artifacts/v4-current-handoff-supplement.patch`.
- If the target branch already contains `84bc815` or already has the V4 workflow files, apply only `release-artifacts/v4-current-handoff-supplement.patch`.

Patch-only transfers must copy the patch files into `release-artifacts/` before applying them. The supplement patch is a transfer artifact; applying it from an arbitrary temporary path updates checkout content but does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout.

The original workflow patch creates the first external-evidence workflow files and will fail if those files already exist. The supplement carries the current prompt corrections, PR-body updates, external-readiness updates, visual parity audit hardening, handoff verifier hardening, and explicit drift checks for the current standalone-operator and two-patch transfer evidence.

Configure repository/hosts:

```text
Enable GitHub Pages.
Provision self-hosted runner labeled unity.
Provision self-hosted runner labeled unreal.
Configure G3D_UNITY_EDITOR as an Actions variable or secret.
Configure G3D_UNREAL_EDITOR as an Actions variable or secret.
Use the checked-in workflow's built-in G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true setting for external baseline runs.
```

Then trigger:

```sh
gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main
gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all
```

After artifacts are available:

```sh
pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports
pnpm ingest:v4-external-baseline-artifacts path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits
pnpm preflight:v4-parity:after-external-evidence
```

## Explicit Non-Claims

This change does not claim:

- Three.js broad superiority.
- Babylon.js broad superiority.
- Unity parity.
- Unreal parity.
- Unity/Unreal replacement.
- Production readiness.
- Full PBR parity.
- HDR/render-target parity.
- Shadow-map parity.
- Full postprocess-suite parity.
- Rendered product visual parity against Unity/Unreal.

Those remain blocked until the external artifacts pass the existing validators.
