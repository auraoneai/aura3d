# create-aura3d Templates

Version: `1.0.0`

The scaffolding API is implemented in `packages/create-aura3d/src/index.ts`.

## Public Template Union

`CreateA3DTemplate` currently allows:

- `external-parity-product-viewer`
- `external-parity-material-studio`
- `external-parity-asset-gallery`
- `external-parity-interactive-scene`
- `production-product-viewer`
- `production-product-configurator`
- `production-asset-inspector`
- `production-material-studio`
- `production-architecture-viewer`
- `production-webgpu-starter`
- `three-compat-architecture-interior`
- `three-compat-asset-inspector`
- `three-compat-character-viewer`
- `three-compat-custom-threejs-migration`
- `three-compat-large-scene`
- `three-compat-material-authoring`
- `three-compat-postprocess-scene`
- `three-compat-premium-product-viewer`

Template directories exist under both `templates/` and `packages/create-aura3d/templates/` for package/scaffold workflows.

## Current Behavior

`createA3DProject` copies the selected template into a target directory and writes `@aura3d/engine` into the generated `package.json`. In current code, the default `packageVersion` fallback is `0.1.0-alpha.0`; callers should pass `packageVersion` when scaffolding a project for a specific release.

## Verification

Useful focused checks:

```sh
pnpm test:templates
pnpm verify:templates
```

## Boundary

Templates are starter projects. They do not prove production readiness unless the generated project is built, run, and verified by the relevant smoke tests.
