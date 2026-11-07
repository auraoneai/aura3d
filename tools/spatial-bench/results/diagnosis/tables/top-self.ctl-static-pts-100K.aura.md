### ctl-static-pts-100K.aura.cpuprofile.gz

wall 8133 ms, sampled 8002 ms, idle 7314 ms, busy 687 ms (8% of wall), 30422 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 7314 | 1064.1% | 7314 | native |
| 2 | `getParameter` | 106 | 15.4% | 106 | native |
| 3 | `sanitizeDiagnosticText` | 81 | 11.8% | 81 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 4 | `(program)` | 52 | 7.6% | 52 | native |
| 5 | `getError` | 44 | 6.5% | 44 | native |
| 6 | `registerPrd07ManagedFrameContext` | 12 | 1.8% | 12 | packages/rendering/src/vfx/Prd07FrameState.ts:256 |
| 7 | `onFrame` | 12 | 1.8% | 627 | src/common/harness.ts:156 |
| 8 | `visit` | 10 | 1.5% | 92 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 9 | `(garbage collector)` | 8 | 1.2% | 8 | native |
| 10 | `renderFrameWithPrd07View` | 8 | 1.1% | 376 | packages/rendering/src/Renderer.ts:3619 |
| 11 | `getParameter` | 7 | 1.0% | 7 | packages/rendering/src/Material.ts:196 |
| 12 | `createProductionRuntimeRendererInputOwned` | 5 | 0.7% | 39 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 13 | `sameStructure` | 5 | 0.7% | 5 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 14 | `runV2HdrStages` | 4 | 0.6% | 11 | packages/rendering/src/post/v2Stages.ts:1214 |
| 15 | `(anonymous)` | 4 | 0.6% | 385 | packages/rendering/src/Renderer.ts:3614 |
| 16 | `getUniformLocation` | 4 | 0.6% | 4 | native |
| 17 | `drawItem` | 4 | 0.6% | 41 | packages/rendering/src/ForwardPass.ts:1666 |
| 18 | `readRootDiagnosticSnapshot` | 3 | 0.5% | 8 | packages/engine/src/agent-api/RootRuntimeSupport.ts:126 |
| 19 | `getDiagnostics` | 3 | 0.4% | 8 | packages/rendering/src/WebGL2Device.ts:3792 |
| 20 | `snapshotState` | 3 | 0.4% | 3 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 |
| 21 | `toMat4$3` | 3 | 0.4% | 3 | packages/rendering/src/renderer/RenderShared.ts:17 |
| 22 | `isCurrentMount` | 3 | 0.4% | 3 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1702 |
| 23 | `canvasDpr` | 3 | 0.4% | 3 | packages/engine/src/agent-api/compiler/lines.ts:233 |
| 24 | `bufferSubData` | 3 | 0.4% | 3 | native |
| 25 | `present` | 3 | 0.4% | 172 | packages/rendering/src/webgl2/LegacyPost.ts:3204 |
| 26 | `createProductionRuntimePostprocess` | 3 | 0.4% | 9 | packages/engine/src/agent-api/compiler/postprocess.ts:78 |
| 27 | `toMat4Uniform$1` | 3 | 0.4% | 3 | packages/rendering/src/ForwardPass.ts:5183 |
| 28 | `collectWarmupInput` | 3 | 0.4% | 14 | packages/rendering/src/Renderer.ts:5330 |
| 29 | `createRootPostPipeline` | 2 | 0.4% | 3 | packages/engine/src/agent-api/postBridge.ts:1327 |
| 30 | `programFeaturesFor` | 2 | 0.3% | 9 | packages/rendering/src/ForwardPass.ts:2771 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 627 | 91.2% | 12 | src/common/harness.ts:156 |
| 2 | `frameBody` | 614 | 89.3% | 1 | src/common/harness.ts:159 |
| 3 | `render` | 494 | 71.9% | 1 | src/aura/main.ts:117 |
| 4 | `step` | 494 | 71.8% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 5 | `renderFrame` | 421 | 61.3% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:510 |
| 6 | `render` | 421 | 61.3% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:607 |
| 7 | `renderFrameBody` | 421 | 61.2% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:398 |
| 8 | `render` | 417 | 60.7% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:1427 |
| 9 | `withSyncProductionFrame` | 416 | 60.6% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:108 |
| 10 | `(anonymous)` | 413 | 60.1% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:1431 |
| 11 | `renderProductionSourceWithProbesInFrame` | 409 | 59.5% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:122 |
| 12 | `render` | 402 | 58.5% | 0 | packages/rendering/src/Renderer.ts:1937 |
| 13 | `(anonymous)` | 402 | 58.5% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:131 |
| 14 | `withBorrowedPrd07RendererOperation` | 402 | 58.5% | 0 | packages/rendering/src/vfx/Prd07RendererBridge.ts:251 |
| 15 | `withRendererFrameCleanup` | 402 | 58.4% | 0 | packages/rendering/src/Renderer.ts:173 |
| 16 | `(anonymous)` | 402 | 58.4% | 0 | packages/rendering/src/Renderer.ts:1942 |
| 17 | `withRendererFrameCleanup.activePrd07Operation` | 401 | 58.4% | 1 | packages/rendering/src/Renderer.ts:1949 |
| 18 | `(anonymous)` | 401 | 58.4% | 0 | packages/rendering/src/Renderer.ts:1947 |
| 19 | `(anonymous)` | 390 | 56.7% | 1 | packages/rendering/src/Renderer.ts:1951 |
| 20 | `renderWithInspection` | 389 | 56.6% | 1 | packages/rendering/src/Renderer.ts:1974 |
| 21 | `(anonymous)` | 385 | 56.1% | 0 | packages/rendering/src/Renderer.ts:1996 |
| 22 | `withRendererQrFlags` | 385 | 56.1% | 0 | packages/rendering/src/renderer/FrameGraph.ts:281 |
| 23 | `adoptExplicitTargetSize` | 385 | 56.0% | 0 | packages/rendering/src/Renderer.ts:1903 |
| 24 | `renderFrame` | 385 | 56.0% | 0 | packages/rendering/src/Renderer.ts:3610 |
| 25 | `(anonymous)` | 385 | 56.0% | 0 | packages/rendering/src/Renderer.ts:1997 |
| 26 | `(anonymous)` | 385 | 56.0% | 4 | packages/rendering/src/Renderer.ts:3614 |
| 27 | `renderFrameWithPrd07View` | 376 | 54.7% | 8 | packages/rendering/src/Renderer.ts:3619 |
| 28 | `measure` | 252 | 36.6% | 0 | packages/rendering/src/renderer/PostStageTrace.ts:96 |
| 29 | `scopePost` | 195 | 28.3% | 0 | packages/rendering/src/Renderer.ts:1389 |
| 30 | `(anonymous)` | 195 | 28.3% | 0 | packages/rendering/src/Renderer.ts:4339 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 70 |
| 2 | packages/rendering/src/vfx/Prd07FrameState.ts:256 | `registerPrd07ManagedFrameContext` | 12 |
| 3 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 11 |
| 4 | src/common/harness.ts:156 | `onFrame` | 8 |
| 5 | packages/rendering/src/Material.ts:196 | `getParameter` | 7 |
| 6 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 | `visit` | 5 |
| 7 | src/common/harness.ts:157 | `onFrame` | 4 |
| 8 | packages/rendering/src/Renderer.ts:3614 | `` | 4 |
| 9 | packages/engine/src/agent-api/RootRuntimeSupport.ts:128 | `readRootDiagnosticSnapshot` | 3 |
| 10 | packages/rendering/src/WebGL2Device.ts:3792 | `getDiagnostics` | 3 |
| 11 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 | `snapshotState` | 3 |
| 12 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 3 |
| 13 | packages/rendering/src/renderer/RenderShared.ts:17 | `toMat4$3` | 3 |
| 14 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1702 | `isCurrentMount` | 3 |
| 15 | packages/rendering/src/ForwardPass.ts:5183 | `toMat4Uniform$1` | 3 |
| 16 | packages/engine/src/agent-api/compiler/lines.ts:236 | `canvasDpr` | 2 |
| 17 | packages/rendering/src/contracts/frameGraph.ts:210 | `registerStockFrameFeed` | 2 |
| 18 | packages/rendering/src/webgpu/ShaderDataLayout.ts:219 | `writeShaderData` | 2 |
| 19 | packages/rendering/src/program/ProgramFeatures.ts:119 | `normalizeProgramFeatures` | 2 |
| 20 | packages/rendering/src/Renderer.ts:7649 | `withWholeFrameGpu` | 2 |
| 21 | packages/rendering/src/ForwardPass.ts:1405 | `execute` | 2 |
| 22 | packages/rendering/src/renderer/FrameGraph.ts:840 | `runPhaseScoped` | 2 |
| 23 | packages/rendering/src/WebGL2Device.ts:3478 | `setRenderTarget` | 2 |
| 24 | packages/rendering/src/materials/PhysicalFeatures.ts:263 | `computeLivePhysicalMapFeatures` | 2 |
| 25 | packages/rendering/src/RenderGraph.ts:170 | `createResourceLifetimes` | 2 |
| 26 | packages/rendering/src/renderer/FrameGraph.ts:651 | `context` | 2 |
| 27 | packages/rendering/src/contracts/structuralMemo.ts:20 | `sameStructure` | 2 |
| 28 | packages/rendering/src/vfx/Prd07FrameAdapter.ts:196 | `acquirePrd07DeviceLease` | 2 |
| 29 | packages/rendering/src/contracts/structuralMemo.ts:57 | `resolve` | 1 |
| 30 | packages/rendering/src/MaterialBinding.ts:151 | `bindGenerated` | 1 |
