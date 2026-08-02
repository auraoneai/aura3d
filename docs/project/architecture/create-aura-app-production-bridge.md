# `createAuraApp` Production-Renderer Bridge Architecture

Status: production bridge implemented for eligible typed-GLB root scenes; renderer parity proof still pending  
Priority: P0  
Owner areas: `packages/engine/src/index.ts`, `packages/engine/src/agent-api/`,
`packages/engine/src/production-runtime/`, `rendering/src/`,
`tests/browser/`

## Decision

Do not switch `createAuraApp` to the production renderer by default yet.

The public root API keeps the current safe WebGL2 path as the default. It now
accepts explicit renderer/profile selection metadata so diagnostics can expose
the requested path, route eligible typed-GLB scenes through the production
bridge, and report explicit safe-basic fallback for ineligible scenes:

```ts
createAuraApp("#app", {
  renderer: {
    mode: "production",
    fallback: "safe-basic",
    qualityProfile: "production"
  },
  scene: scene().add(model(assets.hero))
});
```

Defaulting to production before pixel-backed parity would make failures harder
to debug and would let examples overclaim renderer behavior. `mode:
"production"` and `qualityProfile: "production"` are supported for eligible
typed-GLB scenes, but they are not blanket proof of full PBR, HDR, shadows,
postprocess, WebGPU, skinning, or morph behavior. The current root material
contract proves base color, limited metallic/roughness contrast, and emissive
color/intensity; texture inventory, alpha/glass, physical clearcoat, normal
maps, HDR/IBL, shadows, and postprocess still require feature-specific browser
diagnostics and screenshots through root imports only.

## Public Modes and Profiles

| Public value | Kind | Purpose | Claim rule |
| --- | --- | --- | --- |
| `safe-basic` | Mode/profile | Current root WebGL2 safe API renderer. | Default supported root path. |
| `production` | Mode/profile | Public bridge request into production-runtime/rendering internals for eligible typed-GLB scenes. | Supported bridge path, but specific renderer features require feature-specific browser proof. |
| `cinematic` | Profile | Production request plus stricter screenshot/postprocess/shadow expectations. | Fallback-only until production mode and pixel evidence exist. |
| `experimental-webgpu` | Profile | Future native WebGPU path. | Must prove adapter, backend, dispatch, render, telemetry, and fallback behavior. |

## Bridge Shape

1. `createAuraApp` receives a renderer mode and quality profile.
2. The root scene builder still emits an `AuraSceneSnapshot`.
3. A new bridge module converts the snapshot into production-runtime render
   sources without exposing renderer internals to public examples.
4. Typed asset refs stay as typed `AuraAssetRef` objects. Raw string ids,
   `unsafeModelUrl`, and raw GLB/glTF URLs remain invalid in public examples.
5. The production runtime returns capability evidence:
   renderer backend, fallback mode, loaded typed assets, material support,
   animation/skinning support, postprocess support, frame timing, and failures.
6. `createAuraApp` publishes route-health evidence so screenshot tests can
   reject mismatched claims.
7. If production mode fails to initialize, fallback is explicit and reported;
   the route cannot still claim production renderer capability.

## Implementation Targets

| Target | Required file area |
| --- | --- |
| Public renderer option types | Implemented in `packages/engine/src/agent-api/index.ts` |
| Snapshot-to-production adapter | `packages/engine/src/production-runtime/` or a new bridge module under `packages/engine/src/` |
| Typed GLB actor binding | `packages/engine/src/production-runtime/TypedGLBActor.ts` |
| Material capability report | Root diagnostics implemented in `packages/engine/src/agent-api/index.ts`; production runtime integration still pending |
| Route-health publication | `packages/engine/src/agent-api/index.ts` |
| Browser acceptance tests | `tests/browser/createAuraApp-production-bridge-contract.spec.ts` |

## Acceptance Tests Before Claim

The bridge is not public-proof until browser tests show:

- a route imports only from `@aura3d/engine` plus generated `./src/aura-assets`;
- `createAuraApp({ renderer: { mode: "production" } })` renders a typed GLB;
- screenshots prove the typed GLB is visible and not a primitive substitute;
- route-health says `renderer.mode === "production"` only when the production
  backend actually initialized;
- fallback route-health says `fallback: "safe-basic"` and does not overclaim;
- quality profiles change measurable pixels or diagnostics;
- no public route imports `@aura3d/engine/advanced-runtime`, `rendering/src`,
  `GLTFLoader`, `three`, raw GLB/glTF URLs, or string asset ids.

## Open Implementation Work

This architecture decision and the current bridge do not complete renderer
parity. The PRD remains open for controlled root texture proof, normal maps,
glass/transmission, physical clearcoat, skinned animation, full production
material parity, HDR/IBL, shadows, postprocess, WebGPU, and route-specific
public browser proofs.
