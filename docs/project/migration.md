# Migration From low-level renderer code

Version: 2.0.1

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

`@aura3d/engine@2.0.0` keeps Three.js out of the root engine runtime and npm
dependency graph. Three.js parity, migration, and compatibility tooling remain
available outside the default engine install path. Public Aura3D agent APIs,
typed assets, templates, diagnostics, screenshots, runtime helpers, and catalog
workflows continue to use Aura3D-owned runtime code.

## Camera Projection Behaviour (Unreleased)

Renderer auto-framing gained an explicit projection choice. Existing behaviour is
unchanged by default, but consumers who relied on side effects should be aware:

- `RenderSource.cameraProjection` defaults to `"perspective"`. Every scene that
  did not set it renders exactly as before, so this is not a breaking change.
- Scenes that *wanted* a parallel projection previously received a perspective one
  silently, because `createAutoFrameCamera` could only build a perspective
  frustum. Such a scene should now set `cameraProjection: "orthographic"` and will
  render differently — correctly — than it did in 1.5.1.
- `cameraFrameOptions` is now typed as `RendererCameraFrameOptions`, which is
  `PerspectiveCameraFrameOptions & OrthographicCameraFrameOptions`. It is a
  widening, so existing option objects still typecheck.

Routes that hardcoded a scale multiplier to size an asset inside a region can move
to `fitSizeToRegion(region, { occupancy })`, which returns a `targetMaxDimension`
for `model(asset, { targetMaxDimension })`. A hardcoded multiplier keeps working;
it just does not follow the asset or scene when either changes size.

Claim boundary: these are `createAuraApp` root safe-API and `rendering` internal
surfaces. They add camera and sizing capability. Named same-asset comparison
routes now pass their bounded protocols, but that evidence is not a blanket
rendering-quality or ecosystem-parity claim.

## Useful Commands

```sh
pnpm three-compat:migration
```

Migration wording and public-release notes are governed by `docs/project/product-studio-claim-registry.md`.
