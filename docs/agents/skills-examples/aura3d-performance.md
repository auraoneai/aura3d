# Worked example: aura3d-performance

Date: 2026-09-25. Run inside the Aura3D monorepo with the local CLI build and
the built engine dist (3.0.1). Lightweight commands only; no bundle-size
regeneration, profiling, or browser runs locally.

## Goal

Establish the health and budget baseline for the `mini-game` template before
any optimization.

## Commands run

1. `doctor` in `packages/create-aura3d/templates/mini-game`, manifest omitted:

   ```json
   {"ok": true, "failures": [],
    "warnings": ["showcaseKenneyOobiPlatformerHero: manifest is missing the scene hierarchy inspection that the asset file provides."],
    "messages": ["Aura3D project doctor passed."]}
   ```

2. `assets validate` in the same directory returned `"ok": true`. The manifest
   lists one model at `sizeBytes: 208028`.

3. Scene-kit budget via a throwaway Node script importing
   `sceneKitPerformanceBudget` from the engine dist:

   ```json
   {"maxDrawCalls": 90, "estimatedDrawCalls": 48, "maxGzipBytes": 16000, "estimatedGzipBytes": 8200, "targetP50Fps": 55,
    "evidence": "course, aim, score, cup, and obstacle cues stay within a bounded mini-game budget"}
   ```

   `sceneKits.miniGolf().diagnostics.performance` reported the same draw-call
   budget with `"pass": true` and the FPS block marked
   `"calibrationRequired": true`.

4. Read `BUNDLE_SIZES.md` (not regenerated): `mini-game starter app before user
   assets` is 213,946 gzip bytes against a 250,000 budget (pass); the
   `@aura3d/engine` compatibility root is 575,343 gzip bytes and informational.
   This is why the skill steers new apps to `@aura3d/lean` entries.

## Not run locally (remote evidence)

- `pnpm check:bundle-size` (esbuild plus size-limit over the workspace).
- `pnpm renderer:geometry-instancing-lod-text` and `pnpm test:performance`
  (build plus Playwright).
- `npm run build` and `check-deploy --dist dist` on a scaffolded app.

Evidence to capture remotely: diagnostics snapshots (backend, fps, draw calls,
render size) before and after each change with device and viewport named,
native instanced submission counts, bundle-size report diff, and a screenshot
rerun when the change affects the rendered scene.
