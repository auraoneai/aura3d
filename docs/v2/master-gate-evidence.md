# Master Gate Evidence

Version: 0.0.0-rebuild

This page maps selected master checklist rows to artifacts that can be objectively checked in this repository. It does not assert production readiness, a published package release, independent clean-checkout success, or superiority over another engine.

## Rows With Objective Evidence

| Checklist row | Evidence | Boundary |
|---|---|---|
| Product examples prove Galileo3D can build useful browser apps | `docs/examples/product-demos.md`, `examples/product-configurator/README.md`, `examples/architecture-viewer/README.md`, `examples/game-slice/README.md`, `tests/browser/product-demos.spec.ts`, `tests/visual/product-demos.spec.ts`, `tests/performance/product-demo-baseline.ts`, `tests/reports/product-demo-validation.json` | Local app-scale proof slices only; not production-ready apps and not externally hosted demos. |
| A new developer can learn from example code without reading tests | `docs/examples/product-demos.md`, the three product example README `Learning Path` sections, and `tests/unit/tools/product-docs.test.ts` | Learnability docs point to source and runtime state; they do not replace full tutorials or public docs hosting. |
| Browser/hardware matrix exists | `docs/browser-hardware-matrix.md`, `docs/rendering/webgpu-hardware-matrix.md`, `tests/reports/browser-hardware-matrix.json`, `tests/reports/browser.json`, `tests/reports/final-browser.json`, `tests/reports/webgpu-hardware-matrix.json` | Current local reports only; no broad browser/GPU support claim. |
| Asset corpus report exists | `docs/assets/asset-corpus-report.md`, `tests/reports/gltf-corpus.json`, `tests/reports/gltf-100-classification.json` | Pinned 17-entry loader-compatibility corpus plus 100-entry source-classification corpus with SHA-256 hashes; not a 100-asset loader/render/visual compatibility matrix. |
| Comparative benchmark reports exist | `docs/benchmarks/threejs-comparison.md`, `docs/benchmarks/babylon-comparison.md`, `tests/reports/comparison-threejs.json`, `tests/reports/comparison-babylon.json` | Scaffold equivalence, capped Playwright Chromium WebGL2 microbenchmark timings, measured esbuild benchmark bundles, pinned environment/dependency metadata, audit screenshots, glTF corpus linkage, pinned external loader import evidence, and category coverage only. `claimUsable` remains false for broad competitive claims, but `supportedNicheClaims` allows only the exact checked-in scaffold bundle-size wording. Rendered production-scene parity, release bundles, visual loader-output parity, broader device review, and independent review are still missing. |
| Public docs and API reference exist | `docs/site-map.md`, `docs/api/README.md`, `docs/api/public-api.md`, `tools/api-docs/index.ts`, `tests/unit/tools/api-docs.test.ts` | Generated entrypoint export reference, not full symbol-level API prose. |
| Version alignment for package metadata, docs site, changelog, issue/support process, security policy, and compatibility matrix | `package.json`, `packages/*/package.json`, `docs/site-map.md`, `CHANGELOG.md`, `SUPPORT.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `SECURITY.md`, `docs/compatibility.md`, `docs/release-checklist.md`, `docs/release-process.md`, `tools/docs-version-alignment/index.ts` | `pnpm verify:docs-version` passed locally for version `0.0.0-rebuild`; this proves version-string alignment only and is not evidence of a published package release. |
| New developer basic app path exists | `docs/tutorials/basic-app.md`, `templates/vite-vanilla`, `templates/react`, `templates/vue`, `templates/svelte`, `tools/template-verification/index.ts`, `tests/templates/template-verification.test.ts`, `tests/reports/template-verification.json` | Starter templates are verified from fresh temporary app copies with external npm dependencies and sanitized local Galileo runtime artifacts. This is not a public registry-install or package-release claim. |
| Regression history exists | `tests/reports/release-repeat.json`, `tests/reports/final-release-verification.json` | Records repeated release-gate runs and current final verification. The repeat report now includes `hardGateRows` for rows 81, 686, 689, 692, and 696 so blockers remain explicit instead of being inferred from green-looking local artifacts. This row is evidence history, not a package-release or production-readiness claim. |
| Issue/support process exists | `SUPPORT.md`, `.github/ISSUE_TEMPLATE/bug_report.yml`, `.github/ISSUE_TEMPLATE/feature_request.yml`, `tests/unit/tools/governance-docs.test.ts` | Repository issue process only; no service-level agreement. |
| Known limitations are explicit | `docs/known-limits.md`, `docs/v2/claim-registry.md`, `tests/unit/tools/known-limits-rendering.test.ts` | Limits are visible and intentionally block stronger public claims. |
| All editor UI operations go through public runtime APIs | `packages/editor-runtime/src/EditorRuntime.ts`, `apps/editor/src/EditorShell.ts`, `apps/editor/src/viewport/EditorViewport.ts`, `tests/unit/editor/public-runtime-boundary.test.ts`, `packages/editor-runtime/tests/editor-runtime.test.ts` | The app is blocked from reaching into `runtime.selection`, `runtime.history`, direct diagnostics mutation, or direct gizmo/picking construction. Low-level runtime package tests can still exercise those primitives directly. |
| At least one app was authored through the editor | `examples/editor-authored-project/project.json`, `examples/editor-authored-project/runtime.js`, `tests/integration/editor-authored-project-replay.test.ts`, `apps/editor/src/project/ProjectSerializer.ts` | Provenance is checked by replay tests using a deterministic operation-log hash and required `EditorRuntime.*` plus static-export operations. This is checked-in workflow evidence, not external notarization. |

## Rows Not Proven By This Evidence

The following rows remain unmarked unless a separate worker proves them with stronger evidence:

- release gate passes repeatedly;
- external demos exist;
- versioned package release exists;
- independent clean-checkout reproduction succeeds on another machine or agent from documented commands.

`tests/reports/release-repeat.json` is useful regression history, but this page does not use it to mark the repeated release-gate row because that row has a stricter release claim and the current instruction explicitly keeps it out of scope.

`tests/reports/clean-checkout.json` must have `ok: true`, `git.dirty: false`, and `reproduction.cleanCheckout: true` before it can support rows 81 or 686. Dirty workspace evidence is a blocker, not a passing clean-checkout artifact. Row 696 additionally requires `reproduction.independentMachineOrAgent: true` with recorded evidence from outside this current workspace.

`package.json` currently uses version `0.0.0-rebuild`, so the package-release row remains blocked until there is a deliberate versioned release artifact or publication record. This repository must not treat a local build or package metadata alignment as a published/versioned release.

`docs/examples/external-demos.md` records why local product examples do not mark the external demo row: no public hosted demo URLs or public-URL browser artifacts are checked in.
