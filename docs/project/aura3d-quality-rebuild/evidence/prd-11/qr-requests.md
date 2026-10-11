# Lane 11 qr-request ledger (P-64)

Outbound requests from PRD-11 §12.3 and its CCRs, plus requests lane 11 filed after Phase 1.
Each row gives the issue, target lane, request id and state on GitHub (checked 2026-10-11 against
main@322d78b1). All 43 PRD-11 request ids (Q-01-1 … Q-15-7, CCR-11-1 … CCR-11-5) have an issue,
so no ledger row is missing one. A request is `closed` only when GitHub shows it closed.

## PRD-11 §12.3 requests and CCRs

| Issue | To | Id | Request | State |
|---|---|---|---|---|
| #89 | 15 | Q-15-1 | Measured fps + throttled root diagnostics + overlay (C-28/C-31) | open |
| #90 | 01 | Q-01-2 | FrameStats scopes on shadow/forward passes (C-28) | open (blocks S-rows) |
| #91 | 03 | Q-03-1 | Postprocess guard + target pool + scope wiring (C-28/C-13) | open (blocks S6) |
| #92 | 12 | Q-12-1 | Harness engine frame timing + fps agreement (C-30/C-33) | open (blocks S1/S2) |
| #93 | 15 | Q-15-7 | Test-suite renames: fps===60 assertions + WebGPU removed-behaviour specs | open |
| #94 | 01 | Q-01-1 | WebGL2Device invalidateGpuObjects + liveVertexArrays (C-28/C-29) | open (blocks S11) |
| #95 | 03 | Q-03-2 | compiler/postprocess.ts: stop emitting CPU-only passes | open |
| #96 | 02 | Q-02-1 | ShadowOrchestration GPU or disabled point-shadow face path | open |
| #97 | 12 | Q-12-2 | Harness quality.lock() + per-tier checkpoint captures | open |
| #98 | 12 | Q-12-3 | quality-rebuild-capture.yml perf_gate input + windows smoke | open (blocks 11-S8 windows) |
| #99 | 15 | Q-15-3 | Root bridge: device-lost pause + C-29 construction | open |
| #100 | 15 | Q-15-2 | compiler/primitives.ts cache, batch/static copy (C-07) | open (blocks S3) |
| #101 | 07 | Q-07-1 | particles.ts honest update-cost fields | open |
| #102 | 07 | Q-07-2 | Particle scope + resident renderer move | open |
| #103 | 14 | Q-14-10 | games.json tiers flag variants + forced-Medium scenario | open |
| #104 | 04 | Q-04-1 | wow-webgpu-product-viewer clamps + u_productColorSmoothing | open |
| #105 | 13 | Q-13-1 | Archive templates/production-webgpu-starter | open |
| #106 | 13 | Q-13-2 | Skill text from facts F-11-01..05 | open |
| #107 | 14 | Q-14-1 | Blockfall Reactor: remove A/B probe + text3D scoreboard | open |
| #108 | 14 | Q-14-2 | Siege Golf: handle updates instead of setScene | open |
| #109 | 14 | Q-14-3 | Skyline Runner: drop pixelRatio clamp + safe-basic | open |
| #110 | 14 | Q-14-4 | Remove qualityProfile + DPR clamps from 4 games | open |
| #111 | 09 | Q-09-1 | GameAppRuntime passes app.quality to createPerformanceGovernor | closed 2026-10-10 |
| #112 | 01 | Q-01-3 | ProgramGenerator WGSL → WgslAssembler (conditional Phase 6) | open |
| #113 | 01 | Q-01-4 | ForwardPass: stop 64-instance chunking under C-07 real | open (blocks S4) |
| #114 | 02 | Q-02-2 | Optional BVH.queryFrustum for light-frustum casters | open |
| #115 | 02 | Q-02-3 | DepthPass composes depth-variant features incl. prd11.drawId | open |
| #116 | 14 | Q-14-5 | Neon Swarm: Q-05-1 lamp asset | open |
| #117 | 14 | Q-14-6 | Bank Shot: text3D digits → DOM | open |
| #118 | 14 | Q-14-7 | Courier Rush: static hints + device-loss overlay | open |
| #119 | 14 | Q-14-8 | Turbo Drift: quality.lock() instead of capture-only pixelRatio | open |
| #120 | 14 | Q-14-9 | Gravity Post: stop per-frame dock-gate texture replacement | open |
| #121 | 14 | Q-14-11 | Review prd11-batch-optout codemod report (C-39) | open |
| #122 | 14 | Q-14-12 | Rename apps/showcase-webgpu-particle-lab | open |
| #123 | 15 | Q-15-4 | RootRuntimeSupport re-export AuraPerformanceQuality | open |
| #124 | 15 | Q-15-5 | Barrels drop deleted facades | open |
| #125 | 15 | Q-15-6 | Docs/bundle/route-health updates for WebGPU freeze | open |
| #126 | 05 | Q-05-1 | Admit street-lamp asset ≤ 5k tris | open |
| #127 | 15 | CCR-11-1 | C-27 renderScaleSourceSlot | open |
| #128 | 15 | CCR-11-2 | C-27 optional decision fields | open |
| #129 | 15 | CCR-11-3 | C-07 RenderItem.batch?/static? | open (blocks S3) |
| #130 | 15 | CCR-11-4 | C-28 DeviceCounters instances?/triangles?/programsBound? | open |
| #131 | 15 | CCR-11-5 | C-02 ShaderChunk.requiresExtensions? | open |

## Later requests (lane 11 outbound)

| Issue | To | Id | Request | State |
|---|---|---|---|---|
| #179 | 01 | batching | Export rendering/src/batching from rendering barrel | open |
| #180 | 01 | batching | webgl2/MultiDraw.ts real WEBGL_multi_draw binding | open |
| #181 | 01 | batching | DrawSubmit.ts + BVH.ts consumption of BatchPlan | open |
| #198 | 15/01 | Q-01-4 | contracts/program.ts allShaderChunks() (WgslAssembler) | open |
| #1050 | 15 | flag-state | A3D_QR_TIERS_{BATCHING,GOVERNOR} entries or parent-implies | open (filed 2026-10-11) |
| #162 (PR comment) | 15 | red flag 7 | Accept or revert the F-11-02 CONTRACTS.md line | asked 2026-10-11 |

## Inbound requests (to lane 11) tracked here

| Issue | From | Request | State |
|---|---|---|---|
| #542 | 15 | P-23: restore §17 caps in tools/bundle-size | draft PR #1034; G5 timing asked 2026-10-11 |
| #194 | 13 | lanes/prd13.ts bundle-size target | redundancy reasoning posted 2026-10-11; G3 to confirm close |
| #405 | Track P | P-09 / P-30 / P-31 / P-22 rows | P-22 helper #915 open; WebGPU spec review posted 2026-10-11 |
