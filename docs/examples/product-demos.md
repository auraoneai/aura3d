# Product Demo Index

Version: `1.0.0`

Current product-oriented examples and apps are split between older examples, production apps, and route-test apps.

## Examples

| Example | Source |
|---|---|
| Product configurator | `examples/product-configurator/` |
| Architecture viewer | `examples/architecture-viewer/` |
| Game slice | `examples/game-slice/` |
| Asset viewer | `examples/asset-viewer/` |
| Material studio | `examples/foundation-material-studio/` |

## Production Apps

| App | Source |
|---|---|
| Product configurator | `apps/product-configurator/` |
| Automotive configurator | `apps/automotive-configurator/` |
| Asset inspector | `apps/asset-inspector/` |
| Material studio | `apps/material-studio/` |
| Architecture viewer | `apps/architecture-viewer/` |
| Character viewer | `apps/character-viewer/` |

## Verification

Useful focused checks:

```sh
pnpm exec playwright test tests/browser/product-demos.spec.ts
pnpm production-runtime:apps
```

The product-demo browser proof writes `tests/reports/product-demo-validation.json` and exposes inspectable runtime state without requiring a reader to reverse-engineer Playwright assertions:

- `examples/product-configurator/` exposes `__AURA3D_PRODUCT_DEMO__`.
- `examples/architecture-viewer/` exposes `__AURA3D_ARCHITECTURE_DEMO__`.
- `examples/game-slice/` exposes `__AURA3D_GAME_DEMO__`.

## Learnability Contract

Each product demo README must point to the relevant source, describe the runtime state object, and explain the focused verification command.

## Boundary

Local examples prove local browser workflows. They are not externally hosted public demos unless a deployment report proves the hosted URL.

These are not externally hosted demos.
