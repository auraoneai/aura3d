# Lane 03 Phase 1 — qr-request / ccr tracking

Requests lane 03 cannot satisfy inside its own ownership boundary
(CONTRACTS.md §4). Phase 0 rows live in `../phase0/qr-requests.md`.

## CCRs exercised (sanctioned in PRD-03 §contracts table)

| # | Touch | What | Status |
|---|---|---|---|
| CCR-03-1 | `packages/rendering/src/Renderer.ts` (owner 01) | Additive `RendererPostProcessOptions.depthRange?: {near, far, projection?}`; forwarded by `PostprocessExecution.executeFusedLdrPostprocess*` into `presentLdrPostprocess` as `{near, far}` (device option is near/far only — `projection` is retained for the v2/C-08 path). Flag-off never sets it. | LANDED (this PR) |
| CCR-03-3 | `packages/engine/src/agent-api/index.ts` (owner 15) | Additive `AuraEffectNode.postAuthored?: readonly string[]` = `Object.keys(options)` at factory call time in the six carved factories; inert on the legacy bridge. The compiler reads it so `antiAlias()` without an authored `mode` resolves as `auto` (the factory's `mode ?? "fxaa"` fill is a default, not authored intent). | LANDED (this PR) |
| CCR-03-6 | — (not raised) | PRD said: if PR 0b-1 does not pass create options into `SceneCompileContext`, raise CCR-03-6. Not needed — the lane's own `prd03.post` app-extension factory already receives `{flags, options}`; `recordAuthoredPostContext` (postBridge.ts, lane-owned) stores `options.output` for the compiler. `SceneCompileContext` untouched. | RESOLVED-BY-WORKAROUND |

## Open

| # | To | Ask | Blocked on | Status |
|---|---|---|---|---|
| QR-03-6 | prd12 (capture/adapter custodian) | `post-fxaa.spec.ts`/`post-banding.spec.ts` slot names from the PRD land on owner 15; specs shipped as `qr-prd03-fxaa.spec.ts` / `qr-prd03-post-banding.spec.ts` so they resolve to lane 03. If PRD filenames are contractual, add the `prd03-` test slots to QR_OWNERSHIP.json. | Nothing — tests exist and are lane-owned | OPEN |
| QR-03-7 | prd12 | `qr-prd03-post-harness.ts` mounts `createAuraApp` with `qualityRebuild.flags:["A3D_QR_POST"]` directly; `runAuraScene` (benchmarks/…/aura3d/common.ts) does not accept flags, so `prd03-night-fog-banding` is replicated in-harness rather than run through the adapter. If lane 12 wants the canonical adapter path, `runAuraScene(spec, host, {flags})` needs a third parameter. | Banding metric runs on the replicated scene, not the registered spec | OPEN |

## Flag-off guarantee notes

- `postAuthored` is additive and read only by the flag-on tier-AA resolver.
- `depthRange` is forwarded only when present (flag-on compiler emits it; flag-off never does), so `presentLdrPostprocess` keeps its legacy default 0.1/1000 normalization with the flag off.
- `FXAAOptions.variant` defaults to `"legacy"` in `normalizeFXAAOptions`; only the flag-on compiler emits `"r185"`.
- The FXAA present split engages only when a `variant:"r185"` fxaa pass is submitted — flag-off chains take the single-pass `u_hasFxaa` path unchanged.
