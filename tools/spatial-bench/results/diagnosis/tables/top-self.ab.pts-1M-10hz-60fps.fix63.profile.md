### ab.pts-1M-10hz-60fps.fix63.profile.cpuprofile.gz

wall 8126 ms, sampled 8002 ms, idle 5534 ms, busy 2468 ms (30% of wall), 26348 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 5534 | 224.2% | 5534 | native |
| 2 | `applyAttributeUpdateToGeometry` | 917 | 37.2% | 919 | experiments/primitives.ts:1564 |
| 3 | `updateAttribute` | 413 | 16.7% | 413 | experiments/runtimeNodes.ts:2095 |
| 4 | `applyTick` | 187 | 7.6% | 600 | src/aura/main.ts:95 |
| 5 | `syncRuntimePrimitiveGeometry` | 154 | 6.2% | 1073 | experiments/primitives.ts:1389 |
| 6 | `bufferSubData` | 122 | 5.0% | 122 | native |
| 7 | `sanitizeDiagnosticText` | 87 | 3.5% | 87 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 8 | `(garbage collector)` | 60 | 2.4% | 60 | native |
| 9 | `(program)` | 56 | 2.3% | 56 | native |
| 10 | `visit` | 17 | 0.7% | 105 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 11 | `onFrame` | 13 | 0.5% | 2350 | src/common/harness.ts:156 |
| 12 | `renderFrameWithPrd07View` | 10 | 0.4% | 361 | packages/rendering/src/Renderer.ts:3619 |
| 13 | `createProductionRuntimeRendererInputOwned` | 9 | 0.4% | 1137 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 14 | `toMat4$1` | 5 | 0.2% | 5 | packages/rendering/src/renderer/RenderShared.ts:17 |
| 15 | `getDiagnostics` | 5 | 0.2% | 6 | packages/rendering/src/WebGL2Device.ts:3792 |
| 16 | `collectWarmupInput` | 5 | 0.2% | 17 | packages/rendering/src/Renderer.ts:5330 |
| 17 | `sameStructure` | 5 | 0.2% | 5 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 18 | `drawItem` | 5 | 0.2% | 199 | packages/rendering/src/ForwardPass.ts:1666 |
| 19 | `selectShaderFeatureBits` | 4 | 0.2% | 11 | packages/rendering/src/program/FeatureSelect.ts:169 |
| 20 | `getParameter` | 4 | 0.2% | 4 | packages/rendering/src/Material.ts:196 |
| 21 | `snapshotState` | 4 | 0.2% | 5 | packages/rendering/src/quality/FrameInspectionTiming.ts:250 |
| 22 | `readLightingModelFromUrl` | 4 | 0.2% | 4 | packages/engine/src/agent-api/compiler/lights.ts:385 |
| 23 | `modelMatrix` | 4 | 0.2% | 9 | packages/engine/src/agent-api/sceneGraph.ts:536 |
| 24 | `withWholeFrameGpu` | 4 | 0.1% | 4 | packages/rendering/src/Renderer.ts:7649 |
| 25 | `updateBuffer` | 3 | 0.1% | 128 | packages/rendering/src/WebGL2Device.ts:2513 |
| 26 | `drawElements` | 3 | 0.1% | 3 | native |
| 27 | `resolveProductionPrimitiveRuntimeState` | 3 | 0.1% | 5 | experiments/primitives.ts:503 |
| 28 | `update` | 3 | 0.1% | 15 | packages/engine/src/agent-api/camera/CameraController.ts:389 |
| 29 | `frameBody` | 3 | 0.1% | 2337 | src/common/harness.ts:159 |
| 30 | `runtimeGeometryBounds` | 3 | 0.1% | 5 | experiments/runtimeNodes.ts:1463 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 2350 | 95.2% | 13 | src/common/harness.ts:156 |
| 2 | `frameBody` | 2337 | 94.7% | 3 | src/common/harness.ts:159 |
| 3 | `render` | 1597 | 64.7% | 0 | src/aura/main.ts:117 |
| 4 | `step` | 1597 | 64.7% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 5 | `advance` | 1182 | 47.9% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 6 | `update` | 1162 | 47.1% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1412 |
| 7 | `update` | 1162 | 47.1% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:602 |
| 8 | `buildFrame` | 1160 | 47.0% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1237 |
| 9 | `updateCompiledScene` | 1159 | 47.0% | 2 | packages/engine/src/contracts/compiler.ts:162 |
| 10 | `updateCompiledSceneReal` | 1155 | 46.8% | 1 | packages/engine/src/agent-api/compiler/compileScene.ts:1948 |
| 11 | `withPrd01ColorParsing` | 1141 | 46.2% | 1 | packages/engine/src/agent-api/compiler/color.ts:88 |
| 12 | `createProductionRuntimeRendererInput` | 1141 | 46.2% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:454 |
| 13 | `(anonymous)` | 1141 | 46.2% | 2 | packages/engine/src/agent-api/compiler/renderInput.ts:474 |
| 14 | `createProductionRuntimeRendererInputOwned` | 1137 | 46.1% | 9 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 15 | `syncRuntimePrimitiveGeometry` | 1073 | 43.5% | 154 | experiments/primitives.ts:1389 |
| 16 | `selectProductionPrimitiveResource` | 1073 | 43.5% | 0 | experiments/primitives.ts:421 |
| 17 | `applyAttributeUpdateToGeometry` | 919 | 37.2% | 917 | experiments/primitives.ts:1564 |
| 18 | `applyTick` | 600 | 24.3% | 187 | src/aura/main.ts:95 |
| 19 | `updateAttribute` | 413 | 16.7% | 413 | experiments/runtimeNodes.ts:2095 |
| 20 | `renderFrameBody` | 413 | 16.7% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:398 |
| 21 | `renderFrame` | 413 | 16.7% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:510 |
| 22 | `render` | 413 | 16.7% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:607 |
| 23 | `withSyncProductionFrame` | 407 | 16.5% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:108 |
| 24 | `render` | 407 | 16.5% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1427 |
| 25 | `(anonymous)` | 403 | 16.3% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1431 |
| 26 | `renderProductionSourceWithProbesInFrame` | 399 | 16.2% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:122 |
| 27 | `render` | 395 | 16.0% | 0 | packages/rendering/src/Renderer.ts:1937 |
| 28 | `withBorrowedPrd07RendererOperation` | 395 | 16.0% | 0 | packages/rendering/src/vfx/Prd07RendererBridge.ts:251 |
| 29 | `withRendererFrameCleanup` | 395 | 16.0% | 1 | packages/rendering/src/Renderer.ts:173 |
| 30 | `(anonymous)` | 395 | 16.0% | 0 | packages/rendering/src/Renderer.ts:1942 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | experiments/primitives.ts:1564 | `applyAttributeUpdateToGeometry` | 917 |
| 2 | experiments/runtimeNodes.ts:2095 | `updateAttribute` | 413 |
| 3 | src/aura/main.ts:101 | `applyTick` | 185 |
| 4 | experiments/primitives.ts:1389 | `syncRuntimePrimitiveGeometry` | 154 |
| 5 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 87 |
| 6 | src/common/harness.ts:156 | `onFrame` | 8 |
| 7 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 5 |
| 8 | packages/rendering/src/WebGL2Device.ts:3792 | `getDiagnostics` | 5 |
| 9 | src/common/harness.ts:157 | `onFrame` | 5 |
| 10 | packages/rendering/src/renderer/RenderShared.ts:17 | `toMat4$1` | 5 |
| 11 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 5 |
| 12 | packages/rendering/src/program/FeatureSelect.ts:169 | `selectShaderFeatureBits` | 4 |
| 13 | packages/rendering/src/Material.ts:198 | `getParameter` | 4 |
| 14 | packages/engine/src/agent-api/compiler/lights.ts:386 | `readLightingModelFromUrl` | 4 |
| 15 | packages/engine/src/agent-api/sceneGraph.ts:563 | `modelMatrix` | 3 |
| 16 | packages/engine/src/agent-api/app/routeState.ts:25 | `updateRouteDiagnostics` | 2 |
| 17 | packages/rendering/src/quality/FrameInspectionTiming.ts:260 | `snapshotState` | 2 |
| 18 | packages/rendering/src/contracts/frameGraph.ts:210 | `registerStockFrameFeed` | 2 |
| 19 | packages/rendering/src/webgpu/ShaderDataLayout.ts:219 | `writeShaderData` | 2 |
| 20 | experiments/runtimeNodes.ts:1468 | `runtimeGeometryBounds` | 2 |
| 21 | packages/rendering/src/Renderer.ts:7653 | `withWholeFrameGpu` | 2 |
| 22 | packages/rendering/src/MaterialBinding.ts:186 | `` | 2 |
| 23 | packages/rendering/src/WebGL2Device.ts:2545 | `updateBuffer` | 2 |
| 24 | packages/rendering/src/Renderer.ts:3614 | `` | 2 |
| 25 | packages/rendering/src/vfx/Prd07RendererBridge.ts:353 | `registerPrd07RendererContext` | 2 |
| 26 | packages/rendering/src/webgl2/MultiDraw.ts:58 | `integerArraySetter` | 2 |
| 27 | packages/engine/src/agent-api/compiler/renderInput.ts:474 | `` | 2 |
| 28 | packages/engine/src/agent-api/RootRuntimeSupport.ts:128 | `readRootDiagnosticSnapshot` | 2 |
| 29 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1407 | `runRuntimeFrame` | 2 |
| 30 | packages/rendering/src/webgl2/MultiDraw.ts:1002 | `uploadUniforms` | 2 |
