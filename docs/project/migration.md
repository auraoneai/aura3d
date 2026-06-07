# Migration From low-level renderer code

Version: 1.1.0

## Current Migration Surface

Migration support is optional and lives outside the default `@aura3d/engine`
runtime install path. Use the separate compatibility package when a migration
workflow needs Three.js-shaped APIs:

```sh
npm install @aura3d/three-compat three
```

Migration support lives primarily in:

- `tests/unit/three-compat/`
- `tests/browser/three-compat-*.spec.ts`

## Supported Migration Shape

A3D can help migrate selected workflows:

- scene/object/material compatibility helpers;
- controls and loader-facing adapters;
- material/geometry compatibility tests;
- migration lab routes;
- current low-level renderer code parity inventory/report generators.

## Not A Full Drop-In Replacement

The compatibility package does not make A3D a full runtime drop-in for every low-level renderer code API, example, addon, shader chunk, loader, or renderer path. Migration docs should name the specific API or workflow that is supported and point to code/tests.

`@aura3d/engine@1.1.0` keeps Three.js out of the root engine runtime and npm
dependency graph. Three.js parity, migration, and compatibility tooling remain
available outside the default engine install path. Public Aura3D agent APIs,
typed assets, templates, diagnostics, screenshots, runtime helpers, and catalog
workflows continue to use Aura3D-owned runtime code.

## Useful Commands

```sh
pnpm three-compat:migration
```

Migration wording and public-release notes are governed by `docs/project/product-studio-claim-registry.md`.
