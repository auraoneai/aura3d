# Current WebGPU Architecture and Three.js r185 Comparison

Date: 2026-08-08

This is the bounded architecture comparison for WS-3.2. The baseline is the
live npm `latest` result verified by `pnpm current-threejs:baseline`:
`three@0.185.1` (`r185`, npm git head
`2431a09f46f34c560bc8e44b33be0e567723d5b9`). The comparison reads the exact
installed r185 `WebGPURenderer.js`, whose default backend is WebGPU and whose
`getFallback` creates `WebGLBackend` when WebGPU initialization is unavailable.
Three.js also exposes `forceWebGL` for an explicit WebGL2 choice.

Aura3D's stable lower-level paths are `@aura3d/rendering` and
`@aura3d/engine/production-runtime`. WebGPU-labelled evidence routes import
those package entries; they do not import repository `src` paths. Root
`createAuraApp` does not yet expose a native WebGPU renderer selection contract,
so this document does not imply that every root-safe app uses WebGPU.

## Current behavior

| Concern | Three.js r185 | Aura3D current behavior | Evidence boundary |
| --- | --- | --- | --- |
| Automatic backend | Tries WebGPU, uses WebGL2 fallback when initialization is unavailable | `backend: "auto"` tries WebGPU and uses WebGL2 when adapter/device/native-capability initialization fails | Browser test injects `requestAdapter() => null` and proves the mounted backend and fallback reason |
| Explicit backend | `forceWebGL` forces WebGL2 | `backend: "webgpu"` is strict and refuses silent WebGL2 substitution; `backend: "webgl2"` is explicit | Error includes the native cause/code and migration-relevant backend state |
| Adapter and device | WebGPU backend requests both during init | Real Chromium requests an Apple Metal 3 adapter/device | Hardware report; no mock/injected device counts as native proof |
| Render pipeline/pass | WebGPU backend creates native pipelines and passes | WebGPUDevice counts native pipeline cache misses, begun render passes, and submissions | Imported 109-primitive GLB produces nonzero counters and pixels |
| Texture upload | WebGPU texture manager uploads native resources | `queue.writeTexture` uploads are counted per texture/mip; native bindings are counted separately | Imported GLB has 15 textures and nonzero upload/binding counters |
| Render target/readback | Async render-target readback is supported | Native `copyTextureToBuffer` + mapped-buffer readback is required by the production WebGPU renderer and counted after completion | Retained 1024×768 proof has native mapped readback and 140,378 non-black pixels |
| Compute | Renderer exposes compute/computeAsync through the node system | `WebGPUParticleBackend` creates WGSL compute pipelines, dispatches workgroups, copies storage buffers, maps readback, and returns measured results | Real adapter test verifies numeric integration; 2,048-particle route reports native compute dispatches |
| Public evidence routes | Official WebGPU examples use the renderer/backend APIs | Six Aura3D WebGPU evidence routes must report `selectedBackend: "webgpu"`, native submissions, distinct screenshots, and route-specific texture/readback/compute facts | Unsupported, WebGL2, Canvas2D, zero-submission, or duplicate-output routes fail the retained gate |

## Per-feature WebGPU parity rows (PART J)

Source: `WEBGPU_PARITY_PLAN` in
`packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts`.
Every row names its WGSL foundation; every row is `unproven` until
adapter + backend + dispatch + render + pixel evidence lands on real
hardware for that exact feature. Backend selection, native submissions, or
pixels from a *different* feature never flip a row. No row flips without
all five evidence legs.

| Feature id | WGSL foundation | Status | Evidence boundary |
| --- | --- | --- | --- |
| `bloom-pyramid` | `production-runtime/shaders/wgsl/postprocess.wgsl` | unproven | A1 bloom pyramid has no WebGPU dispatch/render/pixel proof yet. |
| `color-grade` | `production-runtime/shaders/wgsl/postprocess.wgsl` | unproven | A3 colorGrade has no WebGPU dispatch/render/pixel proof yet. |
| `fxaa-taa` | `production-runtime/shaders/wgsl/postprocess.wgsl` | unproven | A3 FXAA/TAA has no WebGPU dispatch/render/pixel proof yet. |
| `spot-shadows` | `production-runtime/shaders/wgsl/pbr.wgsl` | unproven | B1 spot shadows have no WebGPU dispatch/render/pixel proof yet. |
| `textured-pbr` | `production-runtime/shaders/wgsl/pbr.wgsl` | proven 2026-09-04 | All 5 legs on Apple Metal 3: adapter, strict-webgpu backend, 110 PBR dispatches, 110 native submissions, 140,378 non-black readback px (car-concept). |
| `render-bundles` | n/a (API-level prototype, no new shader) | prototype-measured 2026-09-04 | 4096 static draws: bundle-execute 0.60ms vs re-encode 0.80ms (ratio 0.75, adopt-candidate). Zero engine call sites — adoption still needs engine implementation. |
| `compute-particles` | `production-runtime/shaders/wgsl/pbr.wgsl` | unproven | Particle compute-dispatch reuse has no WebGPU dispatch proof yet. |

Related native facts that do NOT flip rows above (live attempt 2026-09-04,
`tests/reports/webgpu-parity/feature-probe.json`): this machine exposes a
real Apple Metal 3 adapter/device (`tests/reports/webgpu-hardware-matrix.json`).
`textured-pbr` holds 4 of 5 legs live — both pbr routes settle `ready` on
`selectedBackend: "webgpu"` with nativePbrSubmissions 28/3,
nativeTextureBindings 80/4, and 800×600 screenshots at 463,672/468,396
non-black pixels (`tests/reports/webgpu-parity/apps-wow-webgpu-pbr-asset.png`,
`...-product-viewer.png`). Row flip still needs human review + gate update.
`compute-particles` is blocked: its route settles `ready` on webgpu but
reports 0 dispatches / 0 native submissions (`apps/wow-webgpu-compute-particles/src/main.ts`
is under active edit in this worktree — not a hardware verdict).
The all-routes gate (`webgpu-native-routes.spec.ts`) currently fails on the
triangle route (0 draw calls despite `a3d-webgpu` backend + adapter) — a route
issue, not an adapter verdict; per-row attempts above do not inherit it.
Retained history: `tests/reports/webgpu-current-architecture/native-routes.json`
(2026-08-09, 6/6 pass on its machine).

## Unsupported and partial rows

- Aura3D does not claim general TSL/node-material parity. The selected
  `PortableShaderMaterial` extension contract is proven separately in
  `docs/rendering/portable-custom-materials.md`. Public shader and
  backend-neutral material authoring is WS-3.3.
- This gate does not claim WebGPU versions of every PBR extension, shadow,
  postprocess, skinning, morph, WebXR, or device-loss behavior. Those features
  retain their own rows and cannot inherit support from backend selection.
- `backend: "auto"` is the documented compatibility fallback. Explicit WebGPU
  fails with the original error code instead of relabelling a WebGL2 frame.
- A browser without a real adapter blocks native proof. Merely exposing
  `navigator.gpu`, a capability boolean, a fake device, or a Canvas2D screenshot
  cannot satisfy this comparison.

## Reproduction

```bash
pnpm renderer:webgpu-architecture
```

Primary receipt:
`tests/reports/webgpu-current-architecture/report.json`. Its inputs include the
online current-baseline lock, real hardware matrix, public SDK imported-asset
proof, native-route matrix, compute/fallback/error proof, and exact installed
Three.js renderer source hash.
