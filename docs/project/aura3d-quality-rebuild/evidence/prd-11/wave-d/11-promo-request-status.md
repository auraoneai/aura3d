# PRD-11 11-PROMO: request / CCR status table (draft for the IC-1 checkpoint report)

Lane 11 Wave D row `11-PROMO record` (FINISH-LANE-11 brief). Drafted by lane 11 for lane 12 to paste into the
IC-1 checkpoint report. No flag state changes: `A3D_QR_PERF` / `A3D_QR_WEBGPU` stay as recorded in
`flags.state.ts`; only lane 15 flips flags at a checkpoint.

Snapshot: GitHub issue states queried 2026-10-10 against `origin/main` 322d78b13 (`gh issue view` plus a GraphQL
timeline query for cross-referenced PRs). Re-query before IC-1; states below are a point-in-time record.

Status key:

- `merged (closed …)`: the issue is closed by a merged PR.
- `open / fallback`: still open; lane 11 runs on the named fallback (the issue's "Meanwhile" text). Any criterion
  that needs the change is evaluated at the next checkpoint after it lands (CONTRACTS §6.5).
- `open / no fallback`: still open and no fallback is named; any lane-11 criterion depending on it stays blocked.
- `deferred to G-WGPU (IC-4)`: WebGPU Phase 6-8 work; only proceeds if G-WGPU is a go at IC-4 (2026-11-05).

"Merged PRs referencing" lists merged PRs that cross-reference the issue. A reference is not a fix: the issue
stays open until its own acceptance is met, a merged PR closes it, and the closing comment cites a green main run.

Summary: 47 rows; 1 merged (closed), 31 open with fallback, 14 open with no fallback, 1 deferred to G-WGPU.

| Issue | Kind | To | Title | Status | Merged PRs referencing | Fallback in effect |
|---|---|---|---|---|---|---|
| #89 | request | prd15 | [QR-11 Q-15-1] Measured fps + throttled root diagnostics + overlay (C-28/C-31) | open / fallback | #150 | `diagnostics().frame` is measured and used by every lane-11 gate |
| #90 | request | prd01 | [QR-11 Q-01-2] FrameStats scopes on shadow/forward passes (C-28) | open / fallback | #600 | whole-frame GPU time from the `prd11.frameStats` contributor; `scopes` empty |
| #91 | request | prd03 | [QR-11 Q-03-1] Postprocess guard + target pool + scope wiring (C-28/C-13) | open / fallback | #168, #928 | guard proven as a pure function; lane spec records Deep Recovery readbacks > 0 as a failing control |
| #92 | request | prd12 | [QR-11 Q-12-1] Harness records engine frame timing + fps agreement (C-30/C-33) | open / fallback | — | lane spec `tests/qr/prd11/browser/fps-agreement.spec.ts` measures agreement on lane scenes |
| #93 | request | prd15 | [QR-11 Q-15-7] Test-suite renames: fps===60 assertions + WebGPU removed-behaviour specs | open / fallback | #162 | lane-11 equivalents live in `tests/qr/prd11/` |
| #94 | request | prd01 | [QR-11 Q-01-1] WebGL2Device invalidateGpuObjects + liveVertexArrays (C-28/C-29) | open / fallback | — | registry rebuilds registered resources eagerly; `liveVertexArrays` reported `0` (contract-typed `number`) |
| #95 | request | prd03 | [QR-11 Q-03-2] compiler/postprocess.ts: stop emitting CPU-only passes (C-13/C-21) | open / fallback | #168, #928 | guard drops them once Q-03-1 lands |
| #96 | request | prd02 | [QR-11 Q-02-1] ShadowOrchestration: GPU or disabled point-shadow face path (C-11/C-28) | open / fallback | #168 | counter reports the readbacks; games without point shadows unaffected |
| #97 | request | prd12 | [QR-11 Q-12-2] Harness quality.lock() before shots + per-tier checkpoint captures (C-33/C-27) | open / fallback | — | lane workflow does this for lane scenes |
| #98 | request | prd12 | [QR-11 Q-12-3] quality-rebuild-capture.yml perf_gate input + windows smoke (C-33) | open / fallback | — | `qr-prd11-perf.yml` runs both on lane scenes |
| #99 | request | prd15 | [QR-11 Q-15-3] Root bridge: device-lost pause + C-29 renderer construction | open / fallback | — | lifecycle events still emitted; WebGPU never selected by default |
| #100 | request | prd15 | [QR-11 Q-15-2] compiler/primitives.ts: cache, batch/static copy, instance-transform size (C-07) | open / fallback | — | content keys in the renderer; static inferred |
| #101 | request | prd07 | [QR-11 Q-07-1] particles.ts: honest update-cost fields + measured scope (C-28/C-20) | open / fallback | #519 | fabricated field reported as such in the `frame` section notes |
| #102 | request | prd07 | [QR-11 Q-07-2] Particle scope + resident renderer move (C-20/C-29) | open / fallback | #519 | `particles` scope absent |
| #103 | request | prd14 | [QR-11 Q-14-10] games.json: tiers flag variants + forced-Medium scenario (C-33) | open / fallback | #637 | lane workflow appends the params itself |
| #104 | request | prd04 | [QR-11 Q-04-1] wow-webgpu-product-viewer material clamps + u_productColorSmoothing (C-29) | open / fallback | #162 | lane 11 removes the uniform from `WebGPUDevice.ts`; the route's unknown uniform is ignored |
| #105 | request | prd13 | [QR-11 Q-13-1] Archive templates/production-webgpu-starter (C-40) | open / fallback | #162 | lane-11 readiness tools stop listing it |
| #106 | request | prd13 | [QR-11 Q-13-2] Skill text rewrites from facts F-11-01..05 (C-40) | open / fallback | — | facts published `proposed` -> `verified` |
| #107 | request | prd14 | [QR-11 Q-14-1] Blockfall Reactor: remove A/B render probe + text3D scoreboard (C-24) | open / fallback | — | measured as-is at checkpoints |
| #108 | request | prd14 | [QR-11 Q-14-2] Siege Golf: handle updates instead of setScene rebuilds (C-37) | open / fallback | — | hitch reported by `frame` p95/p99 |
| #109 | request | prd14 | [QR-11 Q-14-3] Skyline Runner: drop pixelRatio clamp + safe-basic + unused assets (C-27) | open / no fallback | — | — |
| #110 | request | prd14 | [QR-11 Q-14-4] Remove qualityProfile + DPR clamps from 4 games (C-27) | open / fallback | — | deprecated profile maps to `"auto"` with a warning |
| #111 | request | prd09 | [QR-11 Q-09-1] GameAppRuntime: pass app.quality to createPerformanceGovernor (C-27) | merged (closed 2026-10-10) | #618 | two governors may both act on `performanceBudget` apps (none shipped) |
| #112 | request | prd01 | [QR-11 Q-01-3] ProgramGenerator WGSL target delegates to WgslAssembler (conditional Phase 6) | deferred to G-WGPU (IC-4) | — | lane 11 calls `assembleWgsl` directly |
| #113 | request | prd01 | [QR-11 Q-01-4] ForwardPass: stop 64-instance chunking under C-07 real (C-07/C-02) | open / fallback | — | planner chunks at 64; emissive-varying items not merged |
| #114 | request | prd02 | [QR-11 Q-02-2] Optional: BVH.queryFrustum for light-frustum caster query (C-11) | open / fallback | — | none needed |
| #115 | request | prd02 | [QR-11 Q-02-3] DepthPass: compose registered depth-variant features incl. prd11.drawId (C-11) | open / fallback | — | multi-draw casters excluded from layer 3 (`reasonsNotBatched["caster-variant-pending"]`) |
| #116 | request | prd14 | [QR-11 Q-14-5] Neon Swarm: use Q-05-1 lamp asset (C-17) | open / no fallback | — | — |
| #117 | request | prd14 | [QR-11 Q-14-6] Bank Shot: replace text3D digits with DOM (C-24) | open / no fallback | — | — |
| #118 | request | prd14 | [QR-11 Q-14-7] Courier Rush: static hints + device-loss overlay + review fork (C-29/C-07) | open / fallback | — | planner infers static; restore tested on the lane fixture |
| #119 | request | prd14 | [QR-11 Q-14-8] Turbo Drift: replace capture-only pixelRatio with quality.lock() (C-27) | open / fallback | — | alias path keeps it working |
| #120 | request | prd14 | [QR-11 Q-14-9] Gravity Post: stop per-frame dock-gate texture replacement (C-15) | open / no fallback | — | — |
| #121 | request | prd14 | [QR-11 Q-14-11] Review prd11-batch-optout codemod report (C-39) | open / fallback | — | items stay batched; S3 pixel identity guards correctness |
| #122 | request | prd14 | [QR-11 Q-14-12] Rename apps/showcase-webgpu-particle-lab | open / no fallback | — | — |
| #123 | request | prd15 | [QR-11 Q-15-4] RootRuntimeSupport: re-export AuraPerformanceQuality + alias (C-27) | open / fallback | — | alias lives beside the old type |
| #124 | request | prd15 | [QR-11 Q-15-5] Rendering/materials barrels: drop deleted facades (deprecation path) | open / fallback | #162 | facades kept as one-line deprecated re-exports |
| #125 | request | prd15 | [QR-11 Q-15-6] Docs/bundle/route-health updates for the WebGPU freeze (C-40) | open / fallback | #162 | lane runs `tools/bundle-size` via its own package script |
| #126 | request | prd05 | [QR-11 Q-05-1] Admit street-lamp asset <= 5k tris (C-17) | open / fallback | — | none; Neon Swarm triangle target is integrated |
| #127 | CCR | prd15 | [CCR-11-1] C-27: `renderScaleSourceSlot: ContractSlot<(o) => RenderScaleSource>` so lane 01'... | open / no fallback | — | — |
| #128 | CCR | prd15 | [CCR-11-2] C-27: optional `confidence?`, `reasons?`, `renderer?`, `tableVersion?` on `AuraTi... | open / no fallback | — | — |
| #129 | CCR | prd15 | [CCR-11-3] C-07 / contracts/renderItem.ts: optional `RenderItem.batch?: boolean`, `RenderIte... | open / no fallback | — | — |
| #130 | CCR | prd15 | [CCR-11-4] C-28: optional `instances?`, `triangles?`, `programsBound?` on `DeviceCounters` | open / no fallback | — | — |
| #131 | CCR | prd15 | [CCR-11-5] C-02: optional `ShaderChunk.requiresExtensions?: readonly string[]` (hoisted afte... | open / no fallback | #150 | — |
| #179 | request | lane:prd11 | qr-request: export packages/rendering/src/batching/index.ts from rendering barrel | open / no fallback | — | — |
| #180 | request | lane:prd11 | qr-request: webgl2/MultiDraw.ts — real WEBGL_multi_draw_elements_instanced binding | open / no fallback | — | — |
| #181 | request | lane:prd11 | qr-request: forward/DrawSubmit.ts + performance/BVH.ts consumption of prd11 BatchPlan | open / no fallback | — | — |
| #198 | request | lane:prd11 | [QR-11 Q-01-4] contracts/program.ts: export allShaderChunks() for manifest parity | open / no fallback | — | — |

## Promotion blockers in this table

Per the brief's blocking list (PRD-16 §5.3), lane 11 cannot request `dev → standalone-accepted` while any of #90,
#94, #113, #179, #180, #181 (01), #91 (03), #92, #97, #98 (12), #100, #129, #198 (15), #103 (14), #111 (09) or
#115 (02) is open; #156 (lane 12) blocks every lane. Of those, only #111 is closed (2026-10-10, PR #618).

## Wave D notes

- #121 (Q-14-11): the `prd11-batch-optout` report is in `batch-optout-report.{json,md}` beside this file
  (30 sites, 11 files, 7 apps). Its `batch: false` target needs CCR-11-3 (#129, `RenderItem.batch?`), which is
  still open; until it lands, the fallback stands (items stay batched, S3 pixel identity guards correctness).
- #112 / #198: `WgslAssembler` and Phases 7-8 are deferred to G-WGPU (IC-4); #198 `allShaderChunks()` is its
  prerequisite.
