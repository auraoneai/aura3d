# PRD-06 T2.8 — shader warm-up on actor load (§9.7)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## What changed

The `prd06.animation` `TypedGLBActorExtension` now precompiles the programs for every
skinned/morph render item at actor load and withholds them until the compile resolves:

- `packages/engine/src/production-runtime/actor/TypedGLBActorAnimation.ts` — new warm-up block:
  `Prd06ShaderWarmupCompiler` seam type (`(items) => Promise<void> | void`),
  `setPrd06ShaderWarmupCompiler`/`prd06ShaderWarmupCompiler`, a per-actor
  `WeakMap` state (`beginPrd06ShaderWarmup`, `filterPrd06ShaderWarmupItems`,
  `disposePrd06ShaderWarmup`). The warm set = items with `skinning` or `morphWeights`;
  static items always pass through. A synchronously-throwing compiler degrades to "no warm-up"
  rather than withholding forever.
- `packages/engine/src/lanes/prd06.ts` — `prd06.animation` extension's `onLoad` calls
  `beginPrd06ShaderWarmup(actor, collectTypedGLBActorRenderItems(actor))` (the raw item set —
  extension transforms would recurse); `collectRenderItems` routes through the withhold filter;
  `dispose` clears the state. `installPrd06ShaderWarmup(options)` is the one-call installer for
  whoever owns the device (lane-15's createAuraApp is the real call site — flagged for Q-15).
- `packages/rendering/src/renderer/Prd06ShaderWarmup.ts` — `createPrd06ProgramCacheWarmup`:
  builds each warm item's material-derived feature record (with the item-driven `instancing`
  merge `ForwardPass` applies), expands via PRD-01 §6.4 `collectWarmupFeatures` (forward +
  depth/distance for casters, tier + next-lower-tier variants, `programKey`-deduped), appends
  `pass:"velocity"` rows when `options.velocity` (TAA), and awaits
  `rendererProgramCache(device, flags).precompile(list)`. Exported from the package barrel.
- `RenderDevice.ts`/`WebGL2Device.ts`/`WebGPUDevice.ts` untouched — the C-28 member is
  pre-declared; the stub's synchronous-compile promise is the current semantic.

## Why the seam

`createTypedGLBActor` receives no device (actors are renderer-agnostic — a WebGL2, WebGPU, or
test device renders them). The PRD's "through C-02 `ProgramCacheLike.precompile` or C-28
`device.compileAsync?.(shader)`" resolves to a compiler the device owner installs once —
identical in spirit to `setTypedGLBActorQrFlags`/`setTypedGLBActorQrTransmissionMode`.

## Verification (`tests/unit/prd06/shader-warmup.test.ts`, 5 tests green)

- `prd06.animation` extension exposes `onLoad` + `collectRenderItems` under `A3D_QR_ANIMATION`
  (absent flag-off).
- C-28-stub compiler (`(items) => Promise.resolve()`): the warm set (skinned + morph items) is
  handed to the compiler synchronously at begin; the first `collectRenderItems` withholds them
  (static passes); after one microtask the filter returns the full list — **at most one frame
  withheld**.
- Deferred-promise compiler: items stay withheld until resolve, then release.
- No compiler installed → nothing withheld (inert without device wiring).
- No skinned/morph items → compiler never invoked, nothing withheld.

## Deferred / cross-lane

- The ≤100 ms link-frame trace check (`tests/qr/prd06/browser/animation-resource-lifecycle.spec.ts`)
  is meaningful only once C-28 real parallel compile lands (GPU/tiers lane); the PRD itself says
  "reported before that" — unit coverage stands in now.
- `installPrd06ShaderWarmup(device, flags, {tier, velocity})` needs a createAuraApp/bootstrap call
  site — lane-15 surface, noted for Q-15.
- Velocity-pass rows are gated on `options.velocity` until the post lane's TAA flag resolves
  (Q-03-1 admission pending).
