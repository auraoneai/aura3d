### ab.pts-100K-10hz-60fps.fix63.profile.cpuprofile.gz

wall 8127 ms, sampled 8002 ms, idle 7224 ms, busy 778 ms (10% of wall), 31354 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 7224 | 928.7% | 7224 | native |
| 2 | `applyAttributeUpdateToGeometry` | 86 | 11.1% | 86 | experiments/primitives.ts:1564 |
| 3 | `sanitizeDiagnosticText` | 78 | 10.0% | 78 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 4 | `(program)` | 63 | 8.2% | 63 | native |
| 5 | `updateAttribute` | 43 | 5.5% | 43 | experiments/runtimeNodes.ts:2095 |
| 6 | `copyStaticUnlitUpload` | 20 | 2.6% | 20 | packages/rendering/src/WebGL2Device.ts:398 |
| 7 | `applyTick` | 17 | 2.1% | 60 | src/aura/main.ts:95 |
| 8 | `(garbage collector)` | 14 | 1.7% | 14 | native |
| 9 | `syncRuntimePrimitiveGeometry` | 13 | 1.7% | 99 | experiments/primitives.ts:1389 |
| 10 | `onFrame` | 12 | 1.5% | 699 | src/common/harness.ts:156 |
| 11 | `renderFrameWithPrd07View` | 10 | 1.3% | 245 | packages/rendering/src/Renderer.ts:3619 |
| 12 | `bufferSubData` | 8 | 1.0% | 8 | native |
| 13 | `visit` | 8 | 1.0% | 56 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 14 | `sameStructure` | 7 | 0.8% | 7 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 15 | `createProductionRuntimeRendererInputOwned` | 6 | 0.8% | 159 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 16 | `updateBuffer` | 6 | 0.8% | 37 | packages/rendering/src/WebGL2Device.ts:2513 |
| 17 | `drawItem` | 5 | 0.7% | 99 | packages/rendering/src/ForwardPass.ts:1666 |
| 18 | `frameBody` | 5 | 0.7% | 688 | src/common/harness.ts:159 |
| 19 | `getParameter` | 5 | 0.6% | 5 | packages/rendering/src/Material.ts:196 |
| 20 | `sanitizeDiagnosticValue` | 5 | 0.6% | 91 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:31 |
| 21 | `readRootDiagnosticSnapshot` | 4 | 0.6% | 9 | packages/engine/src/agent-api/RootRuntimeSupport.ts:126 |
| 22 | `registerStockFrameFeed` | 4 | 0.5% | 4 | packages/rendering/src/contracts/frameGraph.ts:204 |
| 23 | `issue` | 3 | 0.4% | 10 | packages/rendering/src/WebGL2StateCache.ts:377 |
| 24 | `modelMatrix` | 3 | 0.4% | 8 | packages/engine/src/agent-api/sceneGraph.ts:536 |
| 25 | `collectWarmupInput` | 3 | 0.4% | 13 | packages/rendering/src/Renderer.ts:5330 |
| 26 | `(anonymous)` | 3 | 0.4% | 13 | packages/rendering/src/webgl2/MultiDraw.ts:1002 |
| 27 | `runtimeGeometryBounds` | 3 | 0.4% | 5 | experiments/runtimeNodes.ts:1463 |
| 28 | `writeShaderData` | 3 | 0.4% | 4 | packages/rendering/src/webgpu/ShaderDataLayout.ts:219 |
| 29 | `toMat4$1` | 3 | 0.4% | 3 | packages/rendering/src/renderer/RenderShared.ts:17 |
| 30 | `readLightingModelFromUrl` | 3 | 0.3% | 4 | packages/engine/src/agent-api/compiler/lights.ts:385 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 699 | 89.9% | 12 | src/common/harness.ts:156 |
| 2 | `frameBody` | 688 | 88.4% | 5 | src/common/harness.ts:159 |
| 3 | `render` | 506 | 65.1% | 0 | src/aura/main.ts:117 |
| 4 | `step` | 506 | 65.1% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 5 | `render` | 299 | 38.4% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:607 |
| 6 | `renderFrame` | 299 | 38.4% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:510 |
| 7 | `renderFrameBody` | 297 | 38.2% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:398 |
| 8 | `render` | 294 | 37.8% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1427 |
| 9 | `withSyncProductionFrame` | 293 | 37.7% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:108 |
| 10 | `(anonymous)` | 290 | 37.3% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:1431 |
| 11 | `renderProductionSourceWithProbesInFrame` | 283 | 36.4% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:122 |
| 12 | `(anonymous)` | 277 | 35.6% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:131 |
| 13 | `render` | 277 | 35.6% | 0 | packages/rendering/src/Renderer.ts:1937 |
| 14 | `withBorrowedPrd07RendererOperation` | 277 | 35.6% | 0 | packages/rendering/src/vfx/Prd07RendererBridge.ts:251 |
| 15 | `withRendererFrameCleanup` | 277 | 35.6% | 1 | packages/rendering/src/Renderer.ts:173 |
| 16 | `(anonymous)` | 276 | 35.5% | 0 | packages/rendering/src/Renderer.ts:1942 |
| 17 | `(anonymous)` | 275 | 35.4% | 0 | packages/rendering/src/Renderer.ts:1947 |
| 18 | `withRendererFrameCleanup.activePrd07Operation` | 274 | 35.2% | 0 | packages/rendering/src/Renderer.ts:1949 |
| 19 | `(anonymous)` | 259 | 33.3% | 0 | packages/rendering/src/Renderer.ts:1951 |
| 20 | `renderWithInspection` | 259 | 33.3% | 2 | packages/rendering/src/Renderer.ts:1974 |
| 21 | `withRendererQrFlags` | 255 | 32.8% | 0 | packages/rendering/src/renderer/FrameGraph.ts:281 |
| 22 | `(anonymous)` | 255 | 32.8% | 1 | packages/rendering/src/Renderer.ts:1996 |
| 23 | `(anonymous)` | 254 | 32.7% | 0 | packages/rendering/src/Renderer.ts:1997 |
| 24 | `adoptExplicitTargetSize` | 254 | 32.7% | 0 | packages/rendering/src/Renderer.ts:1903 |
| 25 | `renderFrame` | 254 | 32.6% | 0 | packages/rendering/src/Renderer.ts:3610 |
| 26 | `(anonymous)` | 251 | 32.3% | 1 | packages/rendering/src/Renderer.ts:3614 |
| 27 | `renderFrameWithPrd07View` | 245 | 31.6% | 10 | packages/rendering/src/Renderer.ts:3619 |
| 28 | `advance` | 207 | 26.6% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 29 | `update` | 186 | 23.9% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:602 |
| 30 | `update` | 185 | 23.8% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1412 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | experiments/primitives.ts:1564 | `applyAttributeUpdateToGeometry` | 86 |
| 2 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 65 |
| 3 | experiments/runtimeNodes.ts:2095 | `updateAttribute` | 43 |
| 4 | packages/rendering/src/WebGL2Device.ts:413 | `copyStaticUnlitUpload` | 20 |
| 5 | src/aura/main.ts:101 | `applyTick` | 16 |
| 6 | experiments/primitives.ts:1389 | `syncRuntimePrimitiveGeometry` | 13 |
| 7 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 13 |
| 8 | src/common/harness.ts:156 | `onFrame` | 8 |
| 9 | packages/rendering/src/contracts/structuralMemo.ts:10 | `sameStructure` | 7 |
| 10 | packages/rendering/src/Material.ts:196 | `getParameter` | 5 |
| 11 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:98 | `sanitizeDiagnosticValue` | 5 |
| 12 | packages/engine/src/agent-api/RootRuntimeSupport.ts:128 | `readRootDiagnosticSnapshot` | 4 |
| 13 | packages/rendering/src/contracts/frameGraph.ts:210 | `registerStockFrameFeed` | 4 |
| 14 | packages/rendering/src/WebGL2Device.ts:2550 | `updateBuffer` | 4 |
| 15 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 4 |
| 16 | packages/rendering/src/WebGL2StateCache.ts:377 | `issue` | 3 |
| 17 | src/common/harness.ts:157 | `onFrame` | 3 |
| 18 | packages/engine/src/agent-api/sceneGraph.ts:563 | `modelMatrix` | 3 |
| 19 | packages/rendering/src/webgpu/ShaderDataLayout.ts:219 | `writeShaderData` | 3 |
| 20 | src/common/harness.ts:161 | `frameBody` | 3 |
| 21 | packages/rendering/src/renderer/RenderShared.ts:17 | `toMat4$1` | 3 |
| 22 | packages/rendering/src/program/ProgramFeatures.ts:119 | `normalizeProgramFeatures` | 2 |
| 23 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 2 |
| 24 | packages/rendering/src/MaterialBinding.ts:151 | `bindGenerated` | 2 |
| 25 | packages/engine/src/agent-api/compiler/renderInput.ts:474 | `` | 2 |
| 26 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 | `snapshotState` | 2 |
| 27 | packages/rendering/src/WebGL2Device.ts:3792 | `getDiagnostics` | 2 |
| 28 | packages/engine/src/agent-api/compiler/lights.ts:386 | `readLightingModelFromUrl` | 2 |
| 29 | packages/rendering/src/renderer/FrameGraph.ts:720 | `collect` | 2 |
| 30 | packages/rendering/src/LightUniforms.ts:352 | `stableLightKey` | 2 |
