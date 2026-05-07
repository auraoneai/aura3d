# Build Packaging And Distribution PRD

## Purpose
Build and packaging provide reliable TypeScript compilation, package exports, browser bundles, type declarations, shader/static asset handling, and release validation. This subsystem must prevent the prior import, shader substitution, and distribution drift problems.

## Lessons From Failed Attempts
- Current package exports were subsystem-oriented, which is useful.
- `G3D2025` had dependency verification and package claims but still found a core-to-ECS violation.
- Old-G3D autopsies implicated build or import resolution in shader substitution and wrong shader source reaching runtime.
- Old-G3D migration docs showed deep import and deprecated wrapper sprawl.

Reuse conceptually:

- ESM-first package exports.
- Subpath exports by stable subsystem.
- Boundary verification.
- Build-time shader validation.

Discard:

- Deep public imports into private files.
- Build pipelines that transform shader source without markers/tests.
- Deprecated wrappers in the first rebuild.

## Target Architecture
The build system is ESM-first, strict-TypeScript-first, and package-export-driven. Each package has a source barrel, declaration output, and explicit public export path. Build tooling must preserve shader source markers, generate sourcemaps, and make private deep imports fail validation.

Build data flow:

1. TypeScript source compiles with strict settings.
2. Package barrels define the public surface.
3. Bundler emits ESM output and declarations.
4. Export verifier checks package metadata against barrels.
5. Boundary verifier checks dependency direction.
6. Shader verifier confirms transformed output still maps to intended source.
7. Sample app imports every public subpath.

## Target Package Exports
Root package:

```json
{
  "name": "@galileo3d/engine",
  "type": "module",
  "exports": {
    ".": "./dist/index.js",
    "./core": "./dist/core/index.js",
    "./math": "./dist/math/index.js",
    "./scene": "./dist/scene/index.js",
    "./ecs": "./dist/ecs/index.js",
    "./rendering": "./dist/rendering/index.js",
    "./physics": "./dist/physics/index.js",
    "./animation": "./dist/animation/index.js",
    "./assets": "./dist/assets/index.js",
    "./input": "./dist/input/index.js",
    "./audio": "./dist/audio/index.js"
  }
}
```

## File-By-File Implementation Plan

### `package.json`
- Purpose: workspace scripts and public package metadata.
- Scripts: `typecheck`, `test`, `test:browser`, `test:visual`, `build`, `verify`.
- Tests: package export validation.

### `pnpm-workspace.yaml`
- Purpose: workspace package inclusion.
- Tests: install and recursive scripts.

### `tsconfig.base.json`
- Purpose: shared strict TypeScript config.
- Requirements: strict true, no implicit any, declaration output.
- Tests: `pnpm typecheck`.

### `tsconfig.build.json`
- Purpose: build declarations and package output.
- Tests: declaration generation.

### `vitest.config.ts`
- Purpose: unit/integration test config.
- Tests: sample test discovery.

### `playwright.config.ts`
- Purpose: browser/visual validation.
- Tests: browser smoke.

### `eslint.config.js`
- Purpose: import boundaries and code hygiene.
- Tests: forbidden import fixture.

### `tools/verify-boundaries/index.ts`
- Purpose: enforce package dependency direction.
- Tests: fixture with valid and invalid imports.

### `tools/verify-exports/index.ts`
- Purpose: compare exports map and source barrels.
- Tests: missing export fixture.

### `tools/verify-shaders/index.ts`
- Purpose: ensure shader sources include markers and compile through test device.
- Tests: wrong shader marker failure.

### `tools/visual-baseline/index.ts`
- Purpose: run examples and validate screenshots.
- Tests: blank canvas fixture.

### `tools/package-size/index.ts`
- Purpose: size tracking.
- Tests: report generation.

## Acceptance Criteria
- `pnpm verify` runs typecheck, unit, integration, boundaries, exports, shader validation, browser smoke, and visual smoke.
- Package exports are explicit and tested.
- Shader build output preserves source markers.
- No private deep import is used by examples or tests unless explicitly whitelisted.
- Dist output contains JS, d.ts, sourcemaps, and package export metadata.

## Testing Checklist
- Build: clean build from fresh checkout.
- Type: strict typecheck.
- Package: import each public subpath from a sample app.
- Browser: bundle example and run in Playwright.
- Shader: compile expected shader source markers.
- Boundary: invalid import fixture fails.

## Implementation Order
1. Strict TypeScript configs.
2. Package exports.
3. Build script.
4. Boundary/export verifiers.
5. Shader verifier.
6. Browser/visual tooling.
7. Release verification script.
