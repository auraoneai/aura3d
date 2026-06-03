# Three.js Runtime Removal PRD

Version: 1.0.3 patch plan

Status: Required before publishing `@aura3d/engine@1.0.3`

Owner: Aura3D core/runtime

## Executive Summary

`@aura3d/engine@1.0.2` publicly declares `three` as a production dependency. That is not a metadata mistake: the published engine currently imports Three.js from the public agent API runtime and from scene-kit subpath runtimes. This undermines Aura3D's positioning as an independent browser 3D engine and makes the npm dependency panel look like Aura3D is a wrapper around a direct competitor.

`@aura3d/engine@1.0.3` must remove Three.js from the root engine runtime and package manifest. Three.js may remain in development tooling, parity benchmarks, migration tests, and an explicitly separate compatibility package, but it must not be installed by consumers of `@aura3d/engine`.

The fix is a package-boundary and runtime-boundary release. It is not acceptable to only delete `"three"` from `dependencies`; the public runtime imports must be removed or moved first.

## Problem Statement

Current npm-visible dependency list for `@aura3d/engine@1.0.2` includes:

- `@loaders.gl/core`
- `@loaders.gl/textures`
- `cannon-es`
- `three`

The direct causes are:

- Root package `dependencies` contains `"three": "^0.165.0"`.
- Root package `exports["."]` points to `dist/engine/agent-api/index.js`.
- `packages/engine/src/agent-api/index.ts` dynamically imports `three` and `three/examples`.
- `packages/engine/src/agent-api/product-viewer-runtime.ts` statically imports `three`, `GLTFLoader`, and `RoomEnvironment`.
- `packages/engine/src/agent-api/particle-fountain-runtime.ts` statically imports `three`.
- `packages/engine/src/agent-api/humanoid-walk-runtime.ts` statically imports `three`.
- Root package `files` and `exports` include `dist/three-compat` and `./three-compat`, keeping compatibility concerns inside the main product package.

There is already a runtime import audit with this claim:

> A3D product/runtime source roots do not import Three.js or `@aura3d/three-compat` implementation paths.

That claim is currently violated by the agent API runtime. The audit must become a hard release gate for `1.0.3`.

## Goals

- Publish `@aura3d/engine@1.0.3` with no direct or transitive Three.js install requirement from the root package.
- Remove all runtime imports of `three`, `three/*`, and `@aura3d/three-compat` from `@aura3d/engine` public runtime paths.
- Preserve the normal public agent API:
  - `import { createAuraApp, scene, model, lights, primitives, sceneKits } from "@aura3d/engine";`
  - typed asset usage from generated `src/aura-assets.ts`
  - starter templates for product viewer, cinematic scene, and mini game
  - screenshots, diagnostics, and route-health checks
- Keep Three.js comparison, migration, and compatibility work available outside the root engine install path.
- Add release gates that fail if this regression returns.
- Make the npm dependency panel for `@aura3d/engine@1.0.3` communicate Aura3D's actual product identity.

## Non-Goals

- Do not delete parity benchmarks, Three.js comparison tests, migration tooling, or docs that honestly compare Aura3D against Three.js.
- Do not claim full drop-in replacement coverage for all Three.js APIs.
- Do not ship a visual-quality regression masked by dependency cleanup.
- Do not force `@aura3d/three-compat` users to migrate in this patch; compatibility can remain in its own package/surface.
- Do not remove Three.js from `devDependencies` if tests and benchmarks still need it.

## Product Requirements

### Root Engine Package

`@aura3d/engine` must be the independent Aura3D runtime package.

Requirements:

- `package.json` root `dependencies` must not include `three`.
- Root package `dependencies` must not include `@aura3d/three-compat`.
- Root package `exports` must not expose `./three-compat`.
- Root package `files` must not include `dist/three-compat`.
- Root package public runtime source and generated dist files must not import:
  - `three`
  - `three/*`
  - `@aura3d/three-compat`
  - implementation paths under `packages/three-compat`
- `@types/three` may remain in root `devDependencies` only while tests/tools require it.
- `three` may remain in root `devDependencies` only for local tests, benchmarks, parity, and migration tooling.

### Compatibility Package

Three.js migration and compatibility code must live outside the root engine install path.

Requirements:

- `packages/three-compat` may depend on or peer-depend on `three`.
- Compatibility package imports must be explicit:
  - `@aura3d/three-compat`
  - not `@aura3d/engine/three-compat`
- Root package must not re-export `@aura3d/three-compat`.
- Docs must clearly describe compatibility as optional migration tooling, not the default Aura3D runtime.

Recommended package shape:

```json
{
  "name": "@aura3d/three-compat",
  "peerDependencies": {
    "three": "^0.165.0"
  },
  "devDependencies": {
    "three": "^0.165.0",
    "@types/three": "^0.165.0"
  }
}
```

If npm install behavior around peer dependencies causes unwanted automatic Three.js installs for compatibility consumers, use `peerDependenciesMeta` intentionally and document the install command. This decision does not affect the root `@aura3d/engine` package as long as root does not depend on the compatibility package.

### Public Agent API Runtime

The public agent API must run on Aura3D-owned runtime code.

Requirements:

- `createAuraApp()` must not import or instantiate Three.js.
- `createProductionSceneRenderer()` must default to the Aura3D WebGL2 or production renderer path.
- Three.js code must not be the default renderer, fallback renderer, or lazy runtime branch in the root package.
- Runtime diagnostics must not report `backend: "three"`, `backend: "three-webgl"`, or `three-lean-*` for root engine usage.
- Any minimal fallback renderer should be named honestly, for example `webgl2-agent-runtime` or `webgl2-minimal`, and should not mention Three.js.
- Error messages and console warnings must not refer to "Three.js renderer fallback" in the root runtime.

Current source to change:

- `packages/engine/src/agent-api/index.ts`
- `packages/engine/src/agent-api/product-viewer-runtime.ts`
- `packages/engine/src/agent-api/particle-fountain-runtime.ts`
- `packages/engine/src/agent-api/humanoid-walk-runtime.ts`
- `package.json`
- package and release audit tools under `tools/**`

### Scene-Kit Subpath Runtimes

The exported scene-kit subpaths must be free of Three.js.

Current root exports:

- `@aura3d/engine/scene-kits/particle-fountain`
- `@aura3d/engine/scene-kits/humanoid-walk`
- `@aura3d/engine/scene-kits/product-viewer`

Requirements:

- Preserve these subpaths for patch-release compatibility unless a semver-major removal is explicitly approved.
- Rewrite these runtime files to use Aura3D-owned rendering or delegate to the safe root agent API.
- Keep typed scene-kit helpers and `createAuraApp()` behavior working.
- Keep screenshot and diagnostics support.
- Remove all `backend: "three"` and `three-lean-*` diagnostics from these subpaths.

Acceptable implementation options:

- Option A: replace the standalone Three.js implementations with wrappers around the root safe `createAuraApp()` scene API.
- Option B: rewrite the standalone scene-kit runtimes with the same custom WebGL2 renderer used by root.
- Option C: remove the specialized subpath runtime files and re-export safe root helpers, preserving type compatibility.

Preferred approach for `1.0.3`: Option A or C. Keep the patch scoped and avoid rebuilding multiple renderers.

### Visual Quality Requirements

Dependency cleanup cannot ship a blank or visibly broken engine.

The `1.0.3` runtime must still render:

- typed GLB/glTF product viewer with model centered, lit, and scaled;
- primitives including box, sphere, cylinder, plane, torus, and capsule approximation;
- common scene-kit visuals for product viewer, particle fountain, humanoid walk, mini golf, material lab, data viz, city block, solar system, neon tunnel, and physics playground;
- background color and basic environment/backdrop cues;
- camera presets and basic animation state;
- screenshot capture with nonblank pixels;
- route readiness and diagnostics.

For `1.0.3`, it is acceptable for the Aura-owned WebGL2 runtime to be less feature-complete than the previous Three.js branch only if:

- starter templates remain visually acceptable;
- benchmark-visible scene kits remain nonblank and recognizable;
- the diagnostics report the missing advanced features honestly;
- release notes clearly state this patch removes the bundled Three.js runtime dependency and continues improving Aura-owned rendering.

## Technical Plan

### Phase 0: Freeze The Broken Boundary

Purpose: make the current issue visible and prevent accidental release.

Tasks:

- Add a package dependency audit that fails if root `dependencies` contains `three`.
- Extend `tools/current-routes-runtime-import-audit` or add a new root package runtime audit to scan:
  - `packages/engine/src`
  - emitted `dist/engine`
  - emitted root package export files
- The audit must exclude only:
  - `packages/three-compat/**`
  - `benchmarks/**`
  - `tools/**threejs**/**`
  - tests whose name or path explicitly scopes them to Three.js parity or compatibility
- Add a report under `tests/reports/package-no-three-runtime.json`.

Acceptance:

```sh
pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-runtime-import-audit/index.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/package-no-three-runtime/index.ts
```

Both commands must fail before the implementation changes and pass after.

### Phase 1: Fix Package Manifest Boundary

Purpose: remove root-package exposure of compatibility code.

Tasks:

- Remove `"three"` from root `dependencies`.
- Keep `"three"` and `"@types/three"` only in root `devDependencies` if still needed for tests/tools.
- Remove `dist/three-compat` from root package `files`.
- Remove `./three-compat` from root package `exports`.
- Ensure `packages/three-compat/package.json` is independently publishable or intentionally private until ready.
- Update package surface tests that currently expect `./three-compat` on root.

Acceptance:

```sh
node -e "const p=require('./package.json'); if (p.dependencies?.three) process.exit(1)"
node -e "const p=require('./package.json'); if (p.exports?.['./three-compat']) process.exit(1)"
```

### Phase 2: Replace Root Renderer Routing

Purpose: make the public engine runtime independent.

Tasks:

- Change `createProductionSceneRenderer()` so it calls Aura3D-owned rendering first.
- Remove or relocate `createThreeSceneRenderer()` and all helper functions used only by the Three.js branch from `packages/engine/src/agent-api/index.ts`.
- Rename the custom renderer diagnostics from `webgl2-fallback` to a production-appropriate backend name.
- Remove root runtime warning text that says "Minimal WebGL fallback does not run the Three.js composer..."
- Replace Three.js postprocess fallback references with Aura3D-owned diagnostics:
  - report unsupported pass as `not-mounted` or `not-yet-implemented`;
  - do not reference Three.js composer as the baseline.
- Confirm TypeScript declarations for public API do not include `typeof import("three")`.

Acceptance:

```sh
rg -n "from [\"']three|import\\([\"']three|typeof import\\([\"']three|three/examples|THREE\\." packages/engine/src
```

This command must return no runtime matches in `packages/engine/src`. Type-only mentions in docs are not allowed inside root runtime source.

### Phase 3: Rewrite Scene-Kit Subpath Runtimes

Purpose: remove static Three.js imports from exported subpaths.

Tasks:

- Rewrite `product-viewer-runtime.ts`.
- Rewrite `particle-fountain-runtime.ts`.
- Rewrite `humanoid-walk-runtime.ts`.
- Ensure each subpath can build in an external Vite app without `three` installed.
- Update diagnostics:
  - no `backend: "three"`;
  - no `three-lean-*`;
  - use `webgl2-agent-runtime`, `webgl2-product-viewer`, or equivalent.
- Preserve public TypeScript types and helper names wherever feasible.

Acceptance:

```sh
rg -n "from [\"']three|three/examples|backend: [\"']three|three-lean" packages/engine/src/agent-api
```

This command must return no matches.

### Phase 4: External Consumer Proof

Purpose: prove npm consumers do not get Three.js and public imports still work.

Tasks:

- Add or update a clean external consumer smoke test.
- Test with a packed tarball, not workspace aliases.
- In the temp app:
  - install packed `@aura3d/engine`;
  - run `npm ls three`;
  - build a Vite app that imports root `@aura3d/engine`;
  - build a Vite app that imports each scene-kit subpath;
  - render at least one screenshot or route-health proof.

Required clean consumer commands:

```sh
npm install /path/to/aura3d-engine-1.0.3.tgz
npm ls three
npm run build
```

Expected result:

- `npm ls three` returns no installed Three.js package for the root engine app.
- Build succeeds.
- Screenshot is nonblank.
- Diagnostics report Aura-owned backend names.

### Phase 5: Release Documentation

Purpose: make the patch transparent and defensible.

Tasks:

- Add `1.0.3` release note.
- Update `docs/project/migration.md` to describe `@aura3d/three-compat` as separate optional migration tooling.
- Update `docs/project/public-api-contract.md` if it lists root `./three-compat`.
- Update README install/dependency copy if needed.
- Update claim guidelines to forbid "Aura3D includes Three.js" style positioning unless explicitly referring to optional compatibility tooling.

Release note language:

```text
@aura3d/engine@1.0.3 removes Three.js from the root engine runtime and npm dependency graph. Three.js parity, migration, and compatibility tooling remain available outside the default engine install path. Public Aura3D agent APIs, typed assets, templates, diagnostics, and screenshots continue to use Aura3D-owned runtime code.
```

## Required Tests And Gates

The `1.0.3` release is blocked until all required gates pass.

### Static Source Gates

```sh
pnpm typecheck
pnpm exec tsx --tsconfig tsconfig.base.json tools/current-routes-runtime-import-audit/index.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/package-no-three-runtime/index.ts
```

Required assertions:

- no root runtime import of `three`;
- no root runtime import of `three/*`;
- no root runtime import of `@aura3d/three-compat`;
- no root package `dependencies.three`;
- no root export `./three-compat`;
- no root package file entry `dist/three-compat`.

### Build Gates

```sh
pnpm build
pnpm test:unit
pnpm test:integration
pnpm test:templates
```

Required assertions:

- TypeScript emits no `typeof import("three")` in root engine declarations.
- Templates still compile.
- Agent API surface tests reflect the new boundary.

### Browser Gates

```sh
pnpm exec playwright test tests/browser/current-routes-route-health.spec.ts --reporter=line
pnpm exec playwright test tests/browser/current-routes-visual-review.spec.ts --reporter=line
```

If exact existing file names differ, use the current route-health and visual-review scripts already wired under `pnpm current-routes`.

Required assertions:

- root registry routes are not blank;
- starter templates are not blank;
- product viewer model appears centered;
- diagnostics use Aura-owned backend names;
- no browser console module-resolution error for `three`.

### Package Gates

```sh
pnpm pack --json
pnpm exec tsx --tsconfig tsconfig.base.json tools/package-tarball-audit/index.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/production-runtime-package-smoke/index.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/foundation-external-consumer/index.ts
```

Additional required tarball checks:

- tarball `package/package.json` has no `dependencies.three`;
- tarball has no `dist/three-compat`;
- tarball root exports do not include `./three-compat`;
- unpacked tarball root runtime files do not contain `from "three"`, `import("three")`, or `three/examples`.

### Post-Publish Gate

After publishing `1.0.3`, verify npm directly:

```sh
npm view @aura3d/engine@1.0.3 dependencies --json
npm view @aura3d/engine@1.0.3 version dist-tags --json
```

Required result:

- no `three` key in `dependencies`;
- `version` is `1.0.3`;
- `latest` points to `1.0.3` only after all smoke tests pass.

## Acceptance Criteria

`@aura3d/engine@1.0.3` is acceptable only when:

- Installing `@aura3d/engine` in a clean app does not install Three.js.
- The npm dependency panel for `@aura3d/engine` does not show `three`.
- Public root imports build without `three`.
- Public scene-kit subpath imports build without `three`.
- Root package runtime source has no Three.js imports.
- Root package emitted dist has no Three.js imports.
- Root package manifest has no `./three-compat` export.
- Root package tarball has no `dist/three-compat`.
- Existing starter templates still render nonblank screenshots.
- Route health passes for current public routes.
- Diagnostics no longer identify the root runtime as Three.js-backed.
- Compatibility/migration docs point users to the separate compatibility package.

## Metrics

Primary release metric:

- `npm view @aura3d/engine@1.0.3 dependencies --json` returns no `three`.

Secondary metrics:

- `npm ls three` in clean root-engine consumer app shows no installed package.
- root package unpacked tarball contains zero runtime imports matching `/(from|import\\() ["']three/`.
- route-health pass rate remains 100% for supported public routes.
- starter template screenshot nonblank rate remains 100%.
- no increase in critical public API test failures.

## Risks And Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Custom WebGL2 renderer is less visually capable than previous Three.js path. | Public examples may look worse. | Use focused visual gates for starter templates and scene kits; only remove Three.js after nonblank and recognizable output is confirmed. |
| Root API types still leak `three` through `typeof import("three")`. | Consumers may need Three.js types. | Add declaration scan after build; remove all root type references. |
| `@aura3d/engine/three-compat` removal breaks consumers. | Patch-release compatibility concern. | Root `./three-compat` should be treated as an accidental leak. Document migration to `@aura3d/three-compat`; consider a temporary deprecation stub only if it does not import or depend on Three.js. |
| Peer dependency behavior auto-installs `three` for compatibility package users. | Confusion for compatibility package only. | Keep compatibility separate; root engine remains clean. Document compatibility install explicitly. |
| Tests pass from workspace aliases but fail from packed package. | Bad public release. | Use tarball external consumer smoke before publish. |
| Hidden dynamic import remains in emitted dist. | npm consumers still need Three.js. | Scan both source and unpacked tarball dist. |

## Implementation Checklist

- [x] Add `tools/package-no-three-runtime/index.ts`.
- [x] Add package-no-three runtime report output.
- [x] Wire package-no-three audit into `pnpm current-routes` and release scripts.
- [x] Remove root `dependencies.three`.
- [x] Remove root `exports["./three-compat"]`.
- [x] Remove root `files` entry for `dist/three-compat`.
- [x] Update package surface tests for root exports.
- [x] Replace `createProductionSceneRenderer()` default route with Aura-owned WebGL2/production renderer.
- [x] Remove `createThreeSceneRenderer()` from root agent API or move it into `packages/three-compat`.
- [x] Remove all root agent API `typeof import("three")` type references.
- [x] Rewrite `product-viewer-runtime.ts` without Three.js.
- [x] Rewrite `particle-fountain-runtime.ts` without Three.js.
- [x] Rewrite `humanoid-walk-runtime.ts` without Three.js.
- [x] Rename runtime diagnostics away from `three`, `three-webgl`, and `three-lean-*`.
- [x] Update docs for optional `@aura3d/three-compat`.
- [x] Add packed-tarball dependency scan.
- [x] Add clean external consumer `npm ls three` smoke.
- [x] Run source, build, browser, and package gates.
- [x] Publish `@aura3d/engine@1.0.3`.
- [x] Verify npm dependency panel and dist tags after publish.

## Execution Results

Status on June 3, 2026:

- `pnpm build`: passed.
- `pnpm current-routes:no-three-runtime`: passed.
- `pnpm check:tarballs`: passed.
- `pnpm current-routes:route-health`: passed.
- `pnpm current-routes:visual-review`: passed.
- `pnpm check:public-api`: passed.
- `pnpm test:templates`: passed.
- `pnpm check:templates`: passed.
- `pnpm foundation:package`: passed; clean consumer `npm ls three --depth=0` reported `installed: false`.
- `pnpm exec tsx --tsconfig tsconfig.base.json tools/production-runtime-package-smoke/index.ts`: passed.
- `npm publish --dry-run --json`: passed for `@aura3d/engine@1.0.3`.
- `npm publish --access public --tag latest --json`: initially blocked by npm 2FA/token policy; passed after publishing with a granular npm publish token.
- `npm access list packages veeronecorp --json`: confirms `@aura3d/engine` is `read-write`.
- `npm access get status @aura3d/engine --json`: confirms the package is `public`.
- `npm view @aura3d/engine@1.0.3 version dependencies dist-tags --json`: passed; registry `latest` points to `1.0.3`, and dependencies are `@loaders.gl/core`, `@loaders.gl/textures`, and `cannon-es`.
- Clean registry install smoke for `@aura3d/engine@1.0.3`: passed; package manifest has no `dependencies.three`, and `npm ls three --all --json` produced `threeInstalled: false`.

The initial publish blocker was not a code/package blocker. The registry error was:

```text
403 Forbidden - Two-factor authentication or granular access token with bypass 2fa enabled is required to publish packages.
```

Post-publish result:

- `version` is `1.0.3`;
- `dist-tags.latest` is `1.0.3`;
- `dependencies` has no `three` key.

## Release Decision

`1.0.3` must not be published while any of the following are true:

- root package `dependencies` contains `three`;
- root package exposes `./three-compat`;
- root package tarball includes `dist/three-compat`;
- root runtime source or dist imports `three`;
- exported scene-kit subpaths import `three`;
- clean consumer install pulls `three`;
- starter templates fail route health or render blank screenshots.

The release can proceed only when the root engine is install-clean, runtime-clean, tarball-clean, and visually smoke-tested.
