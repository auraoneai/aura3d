# V4 External Evidence Handoff

This handoff only packages and inventories local inputs for external Unity/Unreal/public-deployment evidence capture. It is not parity evidence and does not clear any external artifact by itself.

## Summary

- Handoff files ready: yes
- Packaged files ready: yes
- Package directory: `release-artifacts/v4-external-evidence-handoff`
- Package archive: `release-artifacts/v4-external-evidence-handoff.tar.gz`
- Package archive checksum: `release-artifacts/v4-external-evidence-handoff.tar.gz.sha256`
- Transfer manifest: `release-artifacts/v4-external-evidence-handoff.transfer.json`
- Package manifest: `release-artifacts/v4-external-evidence-handoff/manifest.json`
- Package readme: `release-artifacts/v4-external-evidence-handoff/START_HERE.md`
- Package standalone integrity script: `release-artifacts/v4-external-evidence-handoff/VERIFY_PACKAGE_INTEGRITY.mjs`
- Package restore script: `release-artifacts/v4-external-evidence-handoff/RESTORE_INTO_CHECKOUT.mjs`
- Package external-host preflight script: `release-artifacts/v4-external-evidence-handoff/RUN_EXTERNAL_HOST_PREFLIGHT.mjs`
- Ready external artifacts: 2
- Blocked external artifacts: 30
- First blocked artifact: `unity:editor-cli-smoke`
- First missing local capability: `unity-editor-executable`

## Missing Handoff Files

No handoff input files are missing.

## Command Plan

### Local Refresh

- `pnpm verify:v4`
- `pnpm verify:v4-external-engine-baselines`
- `pnpm build:external-demos`
- `pnpm verify:static-demo-server-smoke`
- `pnpm audit:v4-external-evidence-readiness`
- `pnpm prepare:v4-external-evidence-handoff`
- `pnpm verify:v4-external-evidence-handoff`
- `pnpm doctor:v4-external-host`
- `pnpm run:v4-external-host-evidence`

### Unity Host

- `export G3D_UNITY_EDITOR=/absolute/path/to/Unity`
- `export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true`
- `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unity tests/reports/v4-unity-editor-cli-smoke.json`
- `node fixtures/external-engine-baselines/v4/unity/run-unity-baseline-captures.mjs --project /absolute/path/to/v4-unity-baseline-project`

### Unreal Host

- `export G3D_UNREAL_EDITOR=/absolute/path/to/UnrealEditor-Cmd`
- `export G3D_RUN_UNITY_UNREAL_CLI_SMOKE=true`
- `node fixtures/external-engine-baselines/v4/run-editor-cli-smoke.mjs unreal tests/reports/v4-unreal-editor-cli-smoke.json`
- `node fixtures/external-engine-baselines/v4/unreal/run-unreal-baseline-captures.mjs --project /absolute/path/to/project.uproject`

### Public Deployment Host

- `pnpm build:external-demos`
- `pnpm verify:static-demo-server-smoke`
- `deploy release-artifacts/external-demos/0.1.0-alpha.0 to a durable HTTPS origin`
- `G3D_PUBLIC_DEMO_URL=https://your-public-demo.example/ pnpm verify:public-demo-deployment`
- `pnpm audit:v4-production-readiness`

### Ingest And Final Audit

- `node fixtures/external-engine-baselines/v4/ingest-external-baseline-artifacts.mjs path/to/v4-unity-baseline-evidence path/to/v4-unreal-baseline-evidence path/to/v4-external-baseline-final-audits`
- `pnpm ingest:public-demo-deployment-reports path/to/v4-public-demo-deployment-reports`
- `pnpm refresh:v4-readiness-reports`
- `pnpm status:v4-local-port`
- `pnpm status:v4-parity`
- `pnpm preflight:v4-parity:after-external-evidence`

## Blocked Artifacts

- `unity-external-baselines/unity:editor-cli-smoke` -> `tests/reports/v4-unity-editor-cli-smoke.json`: tests/reports/v4-unity-editor-cli-smoke.json is missing or does not contain ok=true for engine="unity"
- `unity-external-baselines/unity:product-visual` -> `tests/reports/v4-unity-product-visual-baseline.json`: tests/reports/v4-unity-product-visual-baseline.json is missing, does not contain ok=true for engine="unity", or lacks validated runner evidence sidecar
- `unity-external-baselines/unity:pbr-visual` -> `tests/reports/v4-unity-pbr-visual-baseline.json`: tests/reports/v4-unity-pbr-visual-baseline.json is missing, does not contain ok=true for engine="unity", or lacks validated runner evidence sidecar
- `unity-external-baselines/unity:shadow-visual` -> `tests/reports/v4-unity-shadow-visual-baseline.json`: tests/reports/v4-unity-shadow-visual-baseline.json is missing, does not contain ok=true for engine="unity", or lacks validated runner evidence sidecar
- `unity-external-baselines/unity:hdr-render-target` -> `tests/reports/v4-unity-hdr-render-target-baseline.json`: tests/reports/v4-unity-hdr-render-target-baseline.json is missing, does not contain ok=true for engine="unity", or lacks validated runner evidence sidecar
- `unity-external-baselines/unity:postprocess-suite` -> `tests/reports/v4-unity-postprocess-suite-baseline.json`: tests/reports/v4-unity-postprocess-suite-baseline.json is missing, does not contain ok=true for engine="unity", or lacks validated runner evidence sidecar
- `unity-external-baselines/unity:render-workflow` -> `tests/reports/v4-unity-baseline-render.json`: tests/reports/v4-unity-baseline-render.json is missing or does not contain ok=true for engine="unity"
- `unity-external-baselines/unity:asset-import-workflow` -> `tests/reports/v4-unity-asset-import-workflow.json`: tests/reports/v4-unity-asset-import-workflow.json is missing or does not contain ok=true for engine="unity"
- `unreal-external-baselines/unreal:editor-cli-smoke` -> `tests/reports/v4-unreal-editor-cli-smoke.json`: tests/reports/v4-unreal-editor-cli-smoke.json is missing or does not contain ok=true for engine="unreal"
- `unreal-external-baselines/unreal:product-visual` -> `tests/reports/v4-unreal-product-visual-baseline.json`: tests/reports/v4-unreal-product-visual-baseline.json is missing, does not contain ok=true for engine="unreal", or lacks validated runner evidence sidecar
- `unreal-external-baselines/unreal:pbr-visual` -> `tests/reports/v4-unreal-pbr-visual-baseline.json`: tests/reports/v4-unreal-pbr-visual-baseline.json is missing, does not contain ok=true for engine="unreal", or lacks validated runner evidence sidecar
- `unreal-external-baselines/unreal:shadow-visual` -> `tests/reports/v4-unreal-shadow-visual-baseline.json`: tests/reports/v4-unreal-shadow-visual-baseline.json is missing, does not contain ok=true for engine="unreal", or lacks validated runner evidence sidecar
- `unreal-external-baselines/unreal:hdr-render-target` -> `tests/reports/v4-unreal-hdr-render-target-baseline.json`: tests/reports/v4-unreal-hdr-render-target-baseline.json is missing, does not contain ok=true for engine="unreal", or lacks validated runner evidence sidecar
- `unreal-external-baselines/unreal:postprocess-suite` -> `tests/reports/v4-unreal-postprocess-suite-baseline.json`: tests/reports/v4-unreal-postprocess-suite-baseline.json is missing, does not contain ok=true for engine="unreal", or lacks validated runner evidence sidecar
- `unreal-external-baselines/unreal:render-workflow` -> `tests/reports/v4-unreal-baseline-render.json`: tests/reports/v4-unreal-baseline-render.json is missing or does not contain ok=true for engine="unreal"
- `unreal-external-baselines/unreal:asset-import-workflow` -> `tests/reports/v4-unreal-asset-import-workflow.json`: tests/reports/v4-unreal-asset-import-workflow.json is missing or does not contain ok=true for engine="unreal"
- `durable-public-demo-deployment/public:index` -> `release-artifacts/external-demos/0.1.0-alpha.0/index.html`: index: public deployment check is missing or failing for index.html
- `durable-public-demo-deployment/public:product-configurator:html` -> `release-artifacts/external-demos/0.1.0-alpha.0/product-configurator/index.html`: product-configurator:html: public deployment check is missing or failing for product-configurator/index.html
- `durable-public-demo-deployment/public:product-configurator:script` -> `release-artifacts/external-demos/0.1.0-alpha.0/product-configurator/main.js`: product-configurator:script: public deployment check is missing or failing for product-configurator/main.js
- `durable-public-demo-deployment/public:architecture-viewer:html` -> `release-artifacts/external-demos/0.1.0-alpha.0/architecture-viewer/index.html`: architecture-viewer:html: public deployment check is missing or failing for architecture-viewer/index.html
- `durable-public-demo-deployment/public:architecture-viewer:script` -> `release-artifacts/external-demos/0.1.0-alpha.0/architecture-viewer/main.js`: architecture-viewer:script: public deployment check is missing or failing for architecture-viewer/main.js
- `durable-public-demo-deployment/public:game-slice:html` -> `release-artifacts/external-demos/0.1.0-alpha.0/game-slice/index.html`: game-slice:html: public deployment check is missing or failing for game-slice/index.html
- `durable-public-demo-deployment/public:game-slice:script` -> `release-artifacts/external-demos/0.1.0-alpha.0/game-slice/main.js`: game-slice:script: public deployment check is missing or failing for game-slice/main.js
- `durable-public-demo-deployment/public:racing-showcase:html` -> `release-artifacts/external-demos/0.1.0-alpha.0/racing-showcase/index.html`: racing-showcase:html: public deployment check is missing or failing for racing-showcase/index.html
- `durable-public-demo-deployment/public:racing-showcase:script` -> `release-artifacts/external-demos/0.1.0-alpha.0/racing-showcase/main.js`: racing-showcase:script: public deployment check is missing or failing for racing-showcase/main.js
- `durable-public-demo-deployment/public:large-world-streaming:html` -> `release-artifacts/external-demos/0.1.0-alpha.0/large-world-streaming/index.html`: large-world-streaming:html: public deployment check is missing or failing for large-world-streaming/index.html
- `durable-public-demo-deployment/public:large-world-streaming:script` -> `release-artifacts/external-demos/0.1.0-alpha.0/large-world-streaming/main.js`: large-world-streaming:script: public deployment check is missing or failing for large-world-streaming/main.js
- `final-external-parity-audits/unity-unreal-parity` -> `tests/reports/v4-unity-unreal-parity.json`: tests/reports/v4-unity-unreal-parity.json is not ready for final external parity completion
- `final-external-parity-audits/production-readiness` -> `tests/reports/v4-production-readiness.json`: tests/reports/v4-production-readiness.json is not ready for final external parity completion
- `final-external-parity-audits/pbr-gltf-readiness` -> `tests/reports/v4-pbr-gltf-readiness.json`: tests/reports/v4-pbr-gltf-readiness.json is not ready for final external parity completion

