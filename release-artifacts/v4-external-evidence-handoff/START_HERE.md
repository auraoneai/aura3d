# V4 External Evidence Handoff Package

This directory is a portable local input package for the remaining Unity, Unreal, and public HTTPS deployment evidence work. It is not parity evidence by itself.

## Current Status

- Current parity completion is `2 / 13`: `full-gltf-parity` and `full-webgpu-parity` are achieved by local readiness reports.
- Remaining criteria are blocked by real external Unity/Unreal same-scene captures, durable public HTTPS deployment smoke evidence, full PBR external/reference parity, production HDR/shadow/postprocess parity, production readiness, and broad Three.js/Babylon superiority gates.
- First missing host capability: `unity-editor-executable`.
- First blocked artifact: `unity:editor-cli-smoke`.
- This package can be transferred when `pnpm verify:v4-external-evidence-handoff` passes, but parity remains blocked until `tests/reports/v4-external-evidence-readiness.json.externalEvidenceReady === true` and `pnpm status:v4-parity` reports `ok: true`.

## First Blocked Artifact

- Artifact: `unity-external-baselines/unity:editor-cli-smoke`
- Kind: `editor-cli-smoke`
- Target path: `tests/reports/v4-unity-editor-cli-smoke.json`
- Prepared command: `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json`

Local evidence already present:
- unity CLI smoke command and target report path are prepared locally.

External evidence still required:
- Run the unity editor CLI smoke against a real Unity editor executable and write tests/reports/v4-unity-editor-cli-smoke.json with ok=true.

Current blockers:
- tests/reports/v4-unity-editor-cli-smoke.json is missing or does not contain ok=true for engine="unity"



## Validate Package Integrity

- `pnpm verify:v4-external-evidence-handoff`
- `node VERIFY_PACKAGE_INTEGRITY.mjs` from inside this package after extracting or transferring it.

## Transfer Manifest Verification

- The archive cannot contain its own post-archive verification record without changing its checksum.
- After `pnpm verify:v4-external-evidence-handoff` passes, inspect `release-artifacts/v4-external-evidence-handoff.transfer.json.packageVerification` for `ok: true`, `checkedFiles`, and `violations: []`.
- If only the archive is transferred without the sidecar transfer manifest, rerun `node VERIFY_PACKAGE_INTEGRITY.mjs` from inside the extracted package before restoring it into a checkout.
- `node VERIFY_PACKAGE_INTEGRITY.mjs` checks package-internal files only. It does not check the outer archive checksum, the sidecar transfer manifest, or any Unity/Unreal/public deployment parity evidence.

## Restore Into A Repo Checkout

This package is an overlay for a full Galileo3D checkout, not a standalone repository. On the Unity/Unreal/deployment machine, clone or update the repo first, then restore this package into that checkout:

- `node VERIFY_PACKAGE_INTEGRITY.mjs`
- `node RESTORE_INTO_CHECKOUT.mjs --dry-run /absolute/path/to/G3D`
- `node RESTORE_INTO_CHECKOUT.mjs /absolute/path/to/G3D`
- `node RUN_EXTERNAL_HOST_PREFLIGHT.mjs /absolute/path/to/G3D`
- `pnpm doctor:v4-external-host`
- `pnpm doctor:v4-external-host:strict`
- `pnpm run:v4-external-host-evidence`
- `pnpm run:v4-external-host-evidence:execute`

Patch-only transfers must copy the patch files into `release-artifacts/` before applying them. The supplement patch is a transfer artifact carried by this package; applying it from an arbitrary temporary path updates the checkout content but does not self-materialize `release-artifacts/v4-current-handoff-supplement.patch` inside that checkout. Use `RESTORE_INTO_CHECKOUT.mjs` when you need the checkout to contain the patch artifacts exactly as packaged.

## Main Reports

- Handoff report: `tests/reports/v4-external-evidence-handoff.json`
- Handoff runbook: `tests/reports/v4-external-evidence-handoff.md`
- Missing-artifacts runbook: `tests/reports/v4-external-evidence-missing-artifacts.md`
- Completion runbook: `tests/reports/v4-completion-audit-runbook.md`
- External host doctor: `tests/reports/v4-external-host-doctor.json`
- Package manifest: `release-artifacts/v4-external-evidence-handoff/manifest.json`
- Transfer archive: `release-artifacts/v4-external-evidence-handoff.tar.gz`
- Transfer archive checksum: `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`
- Transfer manifest: `release-artifacts/v4-external-evidence-handoff.transfer.json`

## Readiness Signals

- `pnpm doctor:v4-external-host` prints host readiness, handoff package integrity, external evidence readiness, the first missing host capability, first blocked artifact details, and the missing-artifacts runbook path.
- `pnpm run:v4-external-host-evidence` writes `tests/reports/v4-external-host-runner.json`; inspect each command's `expectedEvidencePaths` and `validationCommands` before running execute mode.
- `tests/reports/v4-external-evidence-missing-artifacts.md` separates local evidence already present from external evidence still required for each blocked area.
- The package is ready to transfer when `pnpm verify:v4-external-evidence-handoff` passes, but parity remains blocked until `tests/reports/v4-external-evidence-readiness.json.externalEvidenceReady === true`.

## External Hosts

- Unity: set `G3D_UNITY_EDITOR`, run the Unity CLI smoke, then run `node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project`.
- Unreal: set `G3D_UNREAL_EDITOR`, run the Unreal CLI smoke, then run `node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject`.
- Public deployment: deploy `release-artifacts/external-demos/0.1.0-alpha.0` to durable HTTPS, then run `G3D_PUBLIC_DEMO_URL=https://... pnpm verify:public-demo-deployment`.

## GitHub Workflow Route

If using GitHub Actions instead of running the external hosts manually:

- Land `.github/workflows/v4-public-demo-deploy.yml` and `.github/workflows/v4-external-engine-baselines.yml` on the repository default branch.
- Enable GitHub Pages.
- Provision self-hosted runners labeled `unity` and `unreal`.
- Configure `G3D_UNITY_EDITOR` and `G3D_UNREAL_EDITOR`; the workflow sets `G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true` internally.
- Trigger `gh workflow run v4-public-demo-deploy.yml --repo gchahal1982/G3D2025 --ref main`.
- Trigger `gh workflow run v4-external-engine-baselines.yml --repo gchahal1982/G3D2025 --ref main -f engine=all`.
- Download and ingest the workflow artifacts with `pnpm ingest:public-demo-deployment-reports` and `pnpm ingest:v4-external-baseline-artifacts`.

After collecting and ingesting external artifacts, rerun `pnpm preflight:v4-parity:after-external-evidence` and `pnpm status:v4-parity`. Do not claim parity unless `pnpm status:v4-parity` reports `ok: true` and `13 / 13` criteria achieved.
