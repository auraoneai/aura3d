# @aura3d/react

`@aura3d/react` owns React components and helpers for mounting Aura3D scenes
with typed assets, cameras, lights, effects, and product-viewer scene builders.

## Public API

- `AuraCanvas`: React canvas component that mounts `createAuraApp`, forwards
  diagnostics/options, and disposes the app on unmount.
- `Scene`: declarative scene wrapper for background, camera, timeline, and
  diagnostics options.
- `Model`: typed model node declaration using an `AuraAssetRef<"model">`.
- `Camera`: orbit, dolly, follow, or perspective camera declaration.
- `Lights`: studio, ambient, directional, and point light declaration.
- `Effect`: fog, bloom, and rain effect declaration.
- `buildSceneFromChildren`: converts supported React children into an
  `AuraSceneBuilder`.
- `productViewerScene`: convenience builder for a typed-asset product viewer
  scene.
- `useAuraApp` / `AuraAppContext`: the mounted `AuraApp` (undefined until
  mount). Detect "outside a canvas" with `useAuraApp() !== undefined`.
- `useAuraFrame(callback, priority?)`: the game loop — priority-ordered
  fan-out over one shared `app.onFrame` subscription, cleaned up on unmount.
- `AuraCanvas` event props (`onPointerDown/Move/Up`, `onHover`): canvas-level
  DOM listeners with unmount cleanup. Pair with `eventInteractionNodes(target)`
  so the F4 picking stack is engaged — a DOM handler alone is not picking.
- `createAuraAssetResource` / `useAuraAsset` / `resourceForDescriptors`:
  Suspense-compatible asset boundary with `preloadAll` semantics
  (per-record ok/failed evidence; failures throw to an error boundary).
  `<Model suspendOnLoad fallback>` suspends on typed-asset preload.
- drei-pattern recipes (tested fragments, not deps, not parity):
  `cameraControlsRecipe`, `environmentPresetRecipe`, `transformGizmoRecipe`.
- `R3F_TO_AURA_MIGRATION_TABLE`: the R3F → AuraCanvas mapping for importers.

## R3F migration note

`R3F_TO_AURA_MIGRATION_TABLE` maps idiomatic R3F to the covered AuraCanvas
surface (Canvas, mesh/model, lights, camera, effects, `useFrame`, `useThree`,
`useLoader`/Suspense, mesh events, drei OrbitControls/Environment/
TransformControls). It is a mapping, not an R3F-parity claim
(`R3F_MIGRATION_NOT_PARITY`). The three-compat migration lab detects
`@react-three/fiber` / `@react-three/drei` source and points here, and
documents the manual CSS2D/CSS3D mapping (`CSS2D_CSS3D_MANUAL_MAP`).

## Package Boundary

This package wraps the root `@aura3d/engine` public API for React apps. It does
not replace the typed asset pipeline: model props should use generated
`assets.name` references, not raw GLB URLs or guessed asset IDs.
