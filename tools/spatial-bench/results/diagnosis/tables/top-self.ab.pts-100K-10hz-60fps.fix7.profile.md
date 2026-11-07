### ab.pts-100K-10hz-60fps.fix7.profile.cpuprofile.gz

wall 8155 ms, sampled 8029 ms, idle 2767 ms, busy 5262 ms (65% of wall), 25909 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 2767 | 52.6% | 2767 | native |
| 2 | `computeBounds` | 2045 | 38.9% | 2123 | packages/rendering/src/Geometry.ts:1289 |
| 3 | `setAttribute` | 1109 | 21.1% | 1251 | packages/rendering/src/VertexBuffer.ts:84 |
| 4 | `runtimeGeometryBoundsCompute` | 545 | 10.3% | 545 | experiments/runtimeNodes.ts:1478 |
| 5 | `applyAttributeUpdateToGeometry` | 359 | 6.8% | 1623 | experiments/primitives.ts:1564 |
| 6 | `validateComponent` | 179 | 3.4% | 179 | packages/rendering/src/VertexBuffer.ts:333 |
| 7 | `(program)` | 174 | 3.3% | 174 | native |
| 8 | `(garbage collector)` | 131 | 2.5% | 131 | native |
| 9 | `sanitizeDiagnosticText` | 86 | 1.6% | 86 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 10 | `(anonymous)` | 70 | 1.3% | 85 | packages/rendering/src/VertexBuffer.ts:110 |
| 11 | `updateAttribute` | 66 | 1.3% | 66 | experiments/runtimeNodes.ts:2095 |
| 12 | `copyStaticUnlitUpload` | 34 | 0.6% | 34 | packages/rendering/src/WebGL2Device.ts:398 |
| 13 | `applyTick` | 29 | 0.6% | 95 | src/aura/main.ts:95 |
| 14 | `readComponent` | 15 | 0.3% | 15 | packages/rendering/src/VertexBuffer.ts:370 |
| 15 | `visit` | 13 | 0.2% | 100 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 16 | `bufferSubData` | 10 | 0.2% | 10 | native |
| 17 | `createProductionRuntimeRendererInputOwned` | 9 | 0.2% | 4351 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 18 | `renderFrameWithPrd07View` | 9 | 0.2% | 263 | packages/rendering/src/Renderer.ts:3619 |
| 19 | `updateBuffer` | 8 | 0.2% | 55 | packages/rendering/src/WebGL2Device.ts:2513 |
| 20 | `onFrame` | 7 | 0.1% | 4930 | src/common/harness.ts:156 |
| 21 | `drawItem` | 7 | 0.1% | 124 | packages/rendering/src/ForwardPass.ts:1666 |
| 22 | `sameStructure` | 7 | 0.1% | 7 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 23 | `toMat4$1` | 5 | 0.1% | 5 | packages/rendering/src/renderer/RenderShared.ts:17 |
| 24 | `modelMatrix` | 5 | 0.1% | 7 | packages/engine/src/agent-api/sceneGraph.ts:536 |
| 25 | `getDiagnostics` | 4 | 0.1% | 6 | packages/rendering/src/WebGL2Device.ts:3792 |
| 26 | `withWholeFrameGpu` | 4 | 0.1% | 4 | packages/rendering/src/Renderer.ts:7649 |
| 27 | `getParameter` | 4 | 0.1% | 4 | packages/rendering/src/Material.ts:196 |
| 28 | `registerStockFrameFeed` | 4 | 0.1% | 4 | packages/rendering/src/contracts/frameGraph.ts:204 |
| 29 | `(anonymous)` | 3 | 0.1% | 4356 | packages/engine/src/agent-api/compiler/renderInput.ts:474 |
| 30 | `requestAnimationFrame` | 3 | 0.1% | 3 | native |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 4930 | 93.7% | 7 | src/common/harness.ts:156 |
| 2 | `frameBody` | 4923 | 93.6% | 3 | src/common/harness.ts:159 |
| 3 | `render` | 4695 | 89.2% | 0 | src/aura/main.ts:117 |
| 4 | `step` | 4694 | 89.2% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 5 | `advance` | 4388 | 83.4% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 6 | `update` | 4374 | 83.1% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1412 |
| 7 | `update` | 4374 | 83.1% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:602 |
| 8 | `buildFrame` | 4374 | 83.1% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1237 |
| 9 | `updateCompiledScene` | 4373 | 83.1% | 2 | packages/engine/src/contracts/compiler.ts:162 |
| 10 | `updateCompiledSceneReal` | 4371 | 83.1% | 1 | packages/engine/src/agent-api/compiler/compileScene.ts:1948 |
| 11 | `createProductionRuntimeRendererInput` | 4357 | 82.8% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:454 |
| 12 | `withPrd01ColorParsing` | 4356 | 82.8% | 0 | packages/engine/src/agent-api/compiler/color.ts:88 |
| 13 | `(anonymous)` | 4356 | 82.8% | 3 | packages/engine/src/agent-api/compiler/renderInput.ts:474 |
| 14 | `createProductionRuntimeRendererInputOwned` | 4351 | 82.7% | 9 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 15 | `selectProductionPrimitiveResource` | 3754 | 71.3% | 1 | experiments/primitives.ts:421 |
| 16 | `syncRuntimePrimitiveGeometry` | 3753 | 71.3% | 0 | experiments/primitives.ts:1389 |
| 17 | `refreshBounds` | 2124 | 40.4% | 0 | packages/rendering/src/Geometry.ts:393 |
| 18 | `computeBounds` | 2123 | 40.3% | 2045 | packages/rendering/src/Geometry.ts:1289 |
| 19 | `applyAttributeUpdateToGeometry` | 1623 | 30.8% | 359 | experiments/primitives.ts:1564 |
| 20 | `setAttribute` | 1251 | 23.8% | 1109 | packages/rendering/src/VertexBuffer.ts:84 |
| 21 | `snapshot` | 549 | 10.4% | 3 | experiments/runtimeNodes.ts:2323 |
| 22 | `runtimeGeometryBounds` | 546 | 10.4% | 0 | experiments/runtimeNodes.ts:1463 |
| 23 | `getBounds` | 546 | 10.4% | 0 | experiments/runtimeNodes.ts:1706 |
| 24 | `runtimeGeometryBoundsCompute` | 545 | 10.3% | 545 | experiments/runtimeNodes.ts:1478 |
| 25 | `assertFramePivotSupported` | 370 | 7.0% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:319 |
| 26 | `renderFrame` | 306 | 5.8% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:510 |
| 27 | `render` | 306 | 5.8% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:607 |
| 28 | `renderFrameBody` | 305 | 5.8% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:398 |
| 29 | `render` | 301 | 5.7% | 1 | packages/engine/src/agent-api/compiler/renderer.ts:1427 |
| 30 | `withSyncProductionFrame` | 300 | 5.7% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:108 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/rendering/src/Geometry.ts:1289 | `computeBounds` | 2045 |
| 2 | packages/rendering/src/VertexBuffer.ts:84 | `setAttribute` | 1109 |
| 3 | experiments/runtimeNodes.ts:1478 | `runtimeGeometryBoundsCompute` | 545 |
| 4 | experiments/primitives.ts:1564 | `applyAttributeUpdateToGeometry` | 359 |
| 5 | packages/rendering/src/VertexBuffer.ts:333 | `validateComponent` | 179 |
| 6 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 71 |
| 7 | packages/rendering/src/VertexBuffer.ts:110 | `` | 70 |
| 8 | experiments/runtimeNodes.ts:2095 | `updateAttribute` | 66 |
| 9 | packages/rendering/src/WebGL2Device.ts:413 | `copyStaticUnlitUpload` | 34 |
| 10 | src/aura/main.ts:101 | `applyTick` | 28 |
| 11 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 16 |
| 12 | packages/rendering/src/VertexBuffer.ts:372 | `readComponent` | 9 |
| 13 | packages/rendering/src/WebGL2Device.ts:2550 | `updateBuffer` | 6 |
| 14 | packages/rendering/src/renderer/RenderShared.ts:17 | `toMat4$1` | 5 |
| 15 | src/common/harness.ts:157 | `onFrame` | 5 |
| 16 | packages/rendering/src/VertexBuffer.ts:371 | `readComponent` | 5 |
| 17 | packages/rendering/src/Renderer.ts:7649 | `withWholeFrameGpu` | 4 |
| 18 | packages/engine/src/agent-api/sceneGraph.ts:563 | `modelMatrix` | 4 |
| 19 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 4 |
| 20 | packages/rendering/src/contracts/frameGraph.ts:210 | `registerStockFrameFeed` | 4 |
| 21 | packages/rendering/src/Material.ts:198 | `getParameter` | 3 |
| 22 | packages/engine/src/agent-api/compiler/renderInput.ts:474 | `` | 3 |
| 23 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 | `snapshotState` | 3 |
| 24 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 3 |
| 25 | packages/rendering/src/program/FeatureSelect.ts:169 | `selectShaderFeatureBits` | 3 |
| 26 | packages/rendering/src/WebGL2StateCache.ts:161 | `bindBuffer` | 3 |
| 27 | experiments/runtimeNodes.ts:2323 | `snapshot` | 3 |
| 28 | packages/rendering/src/contracts/structuralMemo.ts:20 | `sameStructure` | 3 |
| 29 | src/common/harness.ts:156 | `onFrame` | 2 |
| 30 | packages/engine/src/agent-api/RootRuntimeSupport.ts:128 | `readRootDiagnosticSnapshot` | 2 |
