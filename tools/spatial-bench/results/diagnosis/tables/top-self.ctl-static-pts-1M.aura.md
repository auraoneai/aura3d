### ctl-static-pts-1M.aura.cpuprofile.gz

wall 8173 ms, sampled 8001 ms, idle 6990 ms, busy 1011 ms (12% of wall), 25638 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 6990 | 691.7% | 6990 | native |
| 2 | `getParameter` | 170 | 16.8% | 170 | native |
| 3 | `sanitizeDiagnosticText` | 118 | 11.6% | 118 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 4 | `(program)` | 76 | 7.5% | 76 | native |
| 5 | `getError` | 63 | 6.3% | 63 | native |
| 6 | `visit` | 20 | 1.9% | 138 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 7 | `onFrame` | 16 | 1.6% | 930 | src/common/harness.ts:156 |
| 8 | `renderFrameWithPrd07View` | 13 | 1.2% | 554 | packages/rendering/src/Renderer.ts:3619 |
| 9 | `getParameter` | 12 | 1.2% | 12 | packages/rendering/src/Material.ts:196 |
| 10 | `createProductionRuntimeRendererInputOwned` | 8 | 0.7% | 48 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 11 | `frameBody` | 6 | 0.6% | 914 | src/common/harness.ts:159 |
| 12 | `collectWarmupInput` | 6 | 0.6% | 24 | packages/rendering/src/Renderer.ts:5330 |
| 13 | `sameStructure` | 6 | 0.6% | 6 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 14 | `updateCompiledSceneReal` | 5 | 0.5% | 77 | packages/engine/src/agent-api/compiler/compileScene.ts:1948 |
| 15 | `drawItem` | 5 | 0.5% | 61 | packages/rendering/src/ForwardPass.ts:1666 |
| 16 | `bindOutput` | 5 | 0.5% | 6 | packages/rendering/src/webgl2/ContextLifecycle.ts:213 |
| 17 | `presentLdrPostprocess` | 5 | 0.5% | 256 | packages/rendering/src/webgl2/LegacyPost.ts:282 |
| 18 | `readLightingModelFromUrl` | 4 | 0.4% | 6 | packages/engine/src/agent-api/compiler/lights.ts:385 |
| 19 | `getUniformLocation` | 4 | 0.4% | 4 | native |
| 20 | `snapshotState` | 4 | 0.4% | 5 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 |
| 21 | `selectShaderFeatureBits` | 4 | 0.4% | 11 | packages/rendering/src/program/FeatureSelect.ts:169 |
| 22 | `applyPrd02EnvironmentUniforms` | 4 | 0.4% | 7 | packages/rendering/src/ForwardPass.ts:4559 |
| 23 | `tryBeginScope` | 4 | 0.4% | 7 | packages/rendering/src/quality/FrameStats.ts:323 |
| 24 | `readRootDiagnosticSnapshot` | 4 | 0.4% | 11 | packages/engine/src/agent-api/RootRuntimeSupport.ts:126 |
| 25 | `(garbage collector)` | 4 | 0.4% | 4 | native |
| 26 | `runV2HdrStages` | 3 | 0.3% | 10 | packages/rendering/src/post/v2Stages.ts:1214 |
| 27 | `bufferSubData` | 3 | 0.3% | 3 | native |
| 28 | `drawArrays` | 3 | 0.3% | 3 | native |
| 29 | `inverse` | 3 | 0.3% | 4 | packages/math/src/Matrix4.ts:241 |
| 30 | `isCurrentMount` | 3 | 0.3% | 3 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1702 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 930 | 92.1% | 16 | src/common/harness.ts:156 |
| 2 | `frameBody` | 914 | 90.4% | 6 | src/common/harness.ts:159 |
| 3 | `render` | 735 | 72.7% | 0 | src/aura/main.ts:117 |
| 4 | `step` | 734 | 72.6% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 5 | `renderFrame` | 628 | 62.1% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:510 |
| 6 | `render` | 628 | 62.1% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:607 |
| 7 | `renderFrameBody` | 627 | 62.1% | 2 | packages/engine/src/agent-api/app/frameLoop.ts:398 |
| 8 | `render` | 620 | 61.3% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1427 |
| 9 | `withSyncProductionFrame` | 620 | 61.3% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:108 |
| 10 | `(anonymous)` | 613 | 60.7% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:1431 |
| 11 | `renderProductionSourceWithProbesInFrame` | 607 | 60.0% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:122 |
| 12 | `withBorrowedPrd07RendererOperation` | 598 | 59.1% | 0 | packages/rendering/src/vfx/Prd07RendererBridge.ts:251 |
| 13 | `(anonymous)` | 597 | 59.1% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:131 |
| 14 | `render` | 597 | 59.0% | 0 | packages/rendering/src/Renderer.ts:1937 |
| 15 | `withRendererFrameCleanup` | 596 | 59.0% | 1 | packages/rendering/src/Renderer.ts:173 |
| 16 | `(anonymous)` | 596 | 58.9% | 0 | packages/rendering/src/Renderer.ts:1942 |
| 17 | `(anonymous)` | 595 | 58.9% | 0 | packages/rendering/src/Renderer.ts:1947 |
| 18 | `withRendererFrameCleanup.activePrd07Operation` | 594 | 58.8% | 0 | packages/rendering/src/Renderer.ts:1949 |
| 19 | `(anonymous)` | 568 | 56.2% | 1 | packages/rendering/src/Renderer.ts:1951 |
| 20 | `renderWithInspection` | 568 | 56.2% | 1 | packages/rendering/src/Renderer.ts:1974 |
| 21 | `withRendererQrFlags` | 564 | 55.8% | 1 | packages/rendering/src/renderer/FrameGraph.ts:281 |
| 22 | `adoptExplicitTargetSize` | 563 | 55.7% | 1 | packages/rendering/src/Renderer.ts:1903 |
| 23 | `(anonymous)` | 563 | 55.7% | 0 | packages/rendering/src/Renderer.ts:1996 |
| 24 | `(anonymous)` | 562 | 55.6% | 0 | packages/rendering/src/Renderer.ts:1997 |
| 25 | `renderFrame` | 561 | 55.5% | 0 | packages/rendering/src/Renderer.ts:3610 |
| 26 | `(anonymous)` | 560 | 55.4% | 2 | packages/rendering/src/Renderer.ts:3614 |
| 27 | `renderFrameWithPrd07View` | 554 | 54.9% | 13 | packages/rendering/src/Renderer.ts:3619 |
| 28 | `measure` | 376 | 37.2% | 0 | packages/rendering/src/renderer/PostStageTrace.ts:96 |
| 29 | `scopePost` | 289 | 28.6% | 0 | packages/rendering/src/Renderer.ts:1389 |
| 30 | `(anonymous)` | 289 | 28.6% | 1 | packages/rendering/src/Renderer.ts:4339 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 118 |
| 2 | packages/rendering/src/Material.ts:196 | `getParameter` | 12 |
| 3 | src/common/harness.ts:156 | `onFrame` | 11 |
| 4 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 9 |
| 5 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 5 |
| 6 | src/common/harness.ts:157 | `onFrame` | 5 |
| 7 | packages/rendering/src/webgl2/ContextLifecycle.ts:213 | `bindOutput` | 4 |
| 8 | packages/rendering/src/program/FeatureSelect.ts:169 | `selectShaderFeatureBits` | 4 |
| 9 | packages/rendering/src/ForwardPass.ts:4559 | `applyPrd02EnvironmentUniforms` | 4 |
| 10 | packages/rendering/src/quality/FrameStats.ts:326 | `tryBeginScope` | 4 |
| 11 | packages/engine/src/agent-api/RootRuntimeSupport.ts:128 | `readRootDiagnosticSnapshot` | 4 |
| 12 | packages/engine/src/agent-api/compiler/lights.ts:386 | `readLightingModelFromUrl` | 3 |
| 13 | packages/math/src/Matrix4.ts:241 | `inverse` | 3 |
| 14 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1702 | `isCurrentMount` | 3 |
| 15 | packages/rendering/src/contracts/frameGraph.ts:210 | `registerStockFrameFeed` | 3 |
| 16 | packages/rendering/src/renderer/RenderShared.ts:17 | `toMat4$3` | 3 |
| 17 | packages/engine/src/agent-api/compiler/lines.ts:236 | `canvasDpr` | 3 |
| 18 | packages/rendering/src/program/ProgramFeatures.ts:119 | `normalizeProgramFeatures` | 3 |
| 19 | packages/rendering/src/quality/FrameInspectionTiming.ts:260 | `snapshotState` | 3 |
| 20 | packages/rendering/src/renderer/FrameGraph.ts:651 | `context` | 3 |
| 21 | packages/rendering/src/renderer/FrameGraph.ts:720 | `collect` | 3 |
| 22 | packages/rendering/src/renderer/PostStageTrace.ts:196 | `defaultNow` | 3 |
| 23 | packages/rendering/src/webgpu/ShaderDataLayout.ts:219 | `writeShaderData` | 3 |
| 24 | src/common/harness.ts:161 | `frameBody` | 2 |
| 25 | packages/engine/src/agent-api/compiler/shadows.ts:160 | `denseShadowBudgetEnabled` | 2 |
| 26 | packages/engine/src/agent-api/app/routeState.ts:25 | `updateRouteDiagnostics` | 2 |
| 27 | packages/rendering/src/webgl2/LegacyPost.ts:558 | `presentLdrPostprocess` | 2 |
| 28 | packages/rendering/src/materials/PhysicalFeatures.ts:263 | `computeLivePhysicalMapFeatures` | 2 |
| 29 | packages/rendering/src/Renderer.ts:5388 | `collectWarmupInput` | 2 |
| 30 | packages/rendering/src/contracts/core.ts:178 | `active` | 2 |
