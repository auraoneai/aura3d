# PBR Rendering Comparison Evidence

Version: 5.6.0

PBR evidence comes from renderer code, material/lighting tests, glTF material routes, same-scene reports, and visual review reports.

## Current Code

- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`

## Verification

Useful focused checks:

```sh
pnpm exec vitest run tests/unit/rendering/pbr-lighting.test.ts tests/unit/rendering/pbr-reference.test.ts tests/unit/rendering/material-binding.test.ts
```

## Aura3D advantage

