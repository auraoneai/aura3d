# Renderer Environment Lighting

Version: 1.0.5

Environment lighting is implemented through renderer environment resources, environment presets, and fixture manifests.

## Current Code

- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/EnvironmentLighting.ts`
- `packages/rendering/src/EnvironmentPlatform.ts`
- `packages/rendering/src/EnvironmentPreset.ts`
- `packages/environments/src/index.ts`
- `fixtures/environment-corpus/manifest.json`

## Current Behavior

- HDR/RGBE-facing decode and encode helpers.
- Diffuse irradiance and specular prefilter helper paths.
- BRDF LUT helper generation.
- Environment preset and fog/stage helpers.
- Named HDRI fixtures for local production routes.

## Boundaries

Environment lighting docs should not imply physically exact PMREM equivalence or broad HDRI ecosystem coverage unless backed by a current route, report, and same-scene comparison.
