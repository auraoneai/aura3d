# Public API Contract

Generated: 2026-05-30T22:29:50.764Z

## Summary

- Checks passing: 7/7
- Engine exports: 64
- React exports: 8
- Docs named imports checked: 14

## Checks

| Check | Result | Detail |
|---|---:|---|
| `public-api-clean-install` | pass | packed @aura3d/engine and @aura3d/react installed in clean project |
| `engine-required-exports` | pass | all required exports present |
| `react-required-exports` | pass | all required exports present |
| `public-valid-examples-compile` | pass | valid public API examples compile from packed packages |
| `public-invalid-examples-fail-as-expected` | pass | invalid model string, missing asset, archived imports, and archived package imports are rejected by TypeScript |
| `docs-named-imports-are-exported` | pass | 14 documented named imports resolve |
| `archived-runtime-not-exported` | pass | archived runtime names are absent from public engine exports |

## Required Engine Exports

- `createAuraApp`
- `defineAuraAssets`
- `definePromptPlan`
- `compilePromptPlan`
- `promptPlanToScene`
- `promptRecipes`
- `model`
- `scene`
- `camera`
- `lights`
- `material`
- `effects`
- `timeline`
- `interactions`

## Required React Exports

- `AuraCanvas`
- `Scene`
- `Model`
- `Camera`
- `Lights`
- `Effect`
- `productViewerScene`
