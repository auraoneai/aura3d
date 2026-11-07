### pts-250K-10hz-60fps.aura.cpuprofile.gz

wall 14349 ms, sampled 14118 ms, idle 1 ms, busy 14117 ms (98% of wall), 46055 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `computeBounds` | 3477 | 24.6% | 3691 | packages/rendering/src/Geometry.ts:1289 |
| 2 | `normalizeGeometryAttributes` | 2516 | 17.8% | 4037 | packages/engine/src/agent-api/RootGeometry.ts:341 |
| 3 | `updateAttribute` | 2265 | 16.0% | 4021 | packages/engine/src/agent-api/app/runtimeNodes.ts:2067 |
| 4 | `setAttribute` | 1971 | 14.0% | 2203 | packages/rendering/src/VertexBuffer.ts:84 |
| 5 | `readVec3Attribute` | 1521 | 10.8% | 1521 | packages/engine/src/agent-api/RootGeometry.ts:287 |
| 6 | `applyAttributeUpdateToGeometry` | 608 | 4.3% | 2833 | packages/engine/src/agent-api/compiler/primitives.ts:1545 |
| 7 | `runtimeGeometryBounds` | 394 | 2.8% | 2811 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 |
| 8 | `(program)` | 328 | 2.3% | 328 | native |
| 9 | `validateComponent` | 309 | 2.2% | 309 | packages/rendering/src/VertexBuffer.ts:333 |
| 10 | `(anonymous)` | 207 | 1.5% | 234 | packages/rendering/src/VertexBuffer.ts:110 |
| 11 | `(garbage collector)` | 168 | 1.2% | 168 | native |
| 12 | `updatedQueryGeometry` | 135 | 1.0% | 1756 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 |
| 13 | `applyTick` | 49 | 0.4% | 4070 | src/aura/main.ts:95 |
| 14 | `readComponent$1` | 27 | 0.2% | 27 | packages/rendering/src/VertexBuffer.ts:370 |
| 15 | `sanitizeDiagnosticText` | 14 | 0.1% | 14 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 16 | `bufferSubData` | 13 | 0.1% | 13 | native |
| 17 | `getError` | 8 | 0.1% | 8 | native |
| 18 | `refreshBounds` | 5 | 0.0% | 3696 | packages/rendering/src/Geometry.ts:393 |
| 19 | `createProductionRuntimeRendererInputOwned` | 4 | 0.0% | 9370 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 20 | `visit` | 4 | 0.0% | 18 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 21 | `renderFrameWithPrd07View` | 3 | 0.0% | 72 | packages/rendering/src/Renderer.ts:3619 |
| 22 | `modelMatrix` | 2 | 0.0% | 5 | packages/engine/src/agent-api/sceneGraph.ts:536 |
| 23 | `readLightingModelFromUrl` | 2 | 0.0% | 2 | packages/engine/src/agent-api/compiler/lights.ts:385 |
| 24 | `snapshot` | 2 | 0.0% | 2813 | packages/engine/src/agent-api/app/runtimeNodes.ts:2294 |
| 25 | `drawItem` | 2 | 0.0% | 32 | packages/rendering/src/ForwardPass.ts:1666 |
| 26 | `sameStructure` | 1 | 0.0% | 1 | packages/rendering/src/contracts/structuralMemo.ts:10 |
| 27 | `(idle)` | 1 | 0.0% | 1 | native |
| 28 | `get` | 1 | 0.0% | 2 | packages/engine/src/agent-api/app/runtimeNodes.ts:369 |
| 29 | `runRuntimeFrame` | 1 | 0.0% | 4 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1391 |
| 30 | `updateRouteDiagnostics` | 1 | 0.0% | 1 | packages/engine/src/agent-api/app/routeState.ts:24 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 13555 | 96.0% | 0 | src/common/harness.ts:156 |
| 2 | `frameBody` | 13555 | 96.0% | 0 | src/common/harness.ts:159 |
| 3 | `step` | 9461 | 67.0% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 4 | `render` | 9461 | 67.0% | 0 | src/aura/main.ts:117 |
| 5 | `advance` | 9377 | 66.4% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 6 | `update` | 9373 | 66.4% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:602 |
| 7 | `updateCompiledScene` | 9373 | 66.4% | 0 | packages/engine/src/contracts/compiler.ts:162 |
| 8 | `buildFrame` | 9373 | 66.4% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1237 |
| 9 | `update` | 9373 | 66.4% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1412 |
| 10 | `updateCompiledSceneReal` | 9372 | 66.4% | 0 | packages/engine/src/agent-api/compiler/compileScene.ts:1948 |
| 11 | `(anonymous)` | 9371 | 66.4% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:474 |
| 12 | `withPrd01ColorParsing` | 9371 | 66.4% | 0 | packages/engine/src/agent-api/compiler/color.ts:88 |
| 13 | `createProductionRuntimeRendererInput` | 9371 | 66.4% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:454 |
| 14 | `createProductionRuntimeRendererInputOwned` | 9370 | 66.4% | 4 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 15 | `selectProductionPrimitiveResource` | 6538 | 46.3% | 1 | packages/engine/src/agent-api/compiler/primitives.ts:417 |
| 16 | `syncRuntimePrimitiveGeometry` | 6537 | 46.3% | 0 | packages/engine/src/agent-api/compiler/primitives.ts:1385 |
| 17 | `applyTick` | 4070 | 28.8% | 49 | src/aura/main.ts:95 |
| 18 | `normalizeGeometryAttributes` | 4037 | 28.6% | 2516 | packages/engine/src/agent-api/RootGeometry.ts:341 |
| 19 | `updateAttribute` | 4021 | 28.5% | 2265 | packages/engine/src/agent-api/app/runtimeNodes.ts:2067 |
| 20 | `refreshBounds` | 3696 | 26.2% | 5 | packages/rendering/src/Geometry.ts:393 |
| 21 | `computeBounds` | 3691 | 26.1% | 3477 | packages/rendering/src/Geometry.ts:1289 |
| 22 | `applyAttributeUpdateToGeometry` | 2833 | 20.1% | 608 | packages/engine/src/agent-api/compiler/primitives.ts:1545 |
| 23 | `snapshot` | 2813 | 19.9% | 2 | packages/engine/src/agent-api/app/runtimeNodes.ts:2294 |
| 24 | `runtimeGeometryBounds` | 2811 | 19.9% | 394 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 |
| 25 | `getBounds` | 2811 | 19.9% | 0 | packages/engine/src/agent-api/app/runtimeNodes.ts:1678 |
| 26 | `setAttribute` | 2203 | 15.6% | 1971 | packages/rendering/src/VertexBuffer.ts:84 |
| 27 | `assertFramePivotSupported` | 1875 | 13.3% | 1 | packages/engine/src/agent-api/compiler/renderInput.ts:319 |
| 28 | `updatedQueryGeometry` | 1756 | 12.4% | 135 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 |
| 29 | `readVec3Attribute` | 1521 | 10.8% | 1521 | packages/engine/src/agent-api/RootGeometry.ts:287 |
| 30 | `resolveProductionPrimitiveRuntimeState` | 940 | 6.7% | 0 | packages/engine/src/agent-api/compiler/primitives.ts:499 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/rendering/src/Geometry.ts:1289 | `computeBounds` | 3477 |
| 2 | packages/engine/src/agent-api/RootGeometry.ts:341 | `normalizeGeometryAttributes` | 2516 |
| 3 | packages/engine/src/agent-api/app/runtimeNodes.ts:2078 | `updateAttribute` | 2227 |
| 4 | packages/rendering/src/VertexBuffer.ts:84 | `setAttribute` | 1971 |
| 5 | packages/engine/src/agent-api/RootGeometry.ts:287 | `readVec3Attribute` | 1521 |
| 6 | packages/engine/src/agent-api/compiler/primitives.ts:1545 | `applyAttributeUpdateToGeometry` | 608 |
| 7 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 | `runtimeGeometryBounds` | 394 |
| 8 | packages/rendering/src/VertexBuffer.ts:333 | `validateComponent` | 309 |
| 9 | packages/rendering/src/VertexBuffer.ts:110 | `` | 207 |
| 10 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 | `updatedQueryGeometry` | 135 |
| 11 | src/aura/main.ts:101 | `applyTick` | 47 |
| 12 | packages/engine/src/agent-api/app/runtimeNodes.ts:2082 | `updateAttribute` | 37 |
| 13 | packages/rendering/src/VertexBuffer.ts:372 | `readComponent$1` | 16 |
| 14 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 14 |
| 15 | packages/rendering/src/VertexBuffer.ts:371 | `readComponent$1` | 10 |
| 16 | packages/rendering/src/Geometry.ts:397 | `refreshBounds` | 5 |
| 17 | packages/engine/src/agent-api/sceneGraph.ts:563 | `modelMatrix` | 2 |
| 18 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 2 |
| 19 | packages/rendering/src/contracts/structuralMemo.ts:10 | `sameStructure` | 1 |
| 20 | packages/engine/src/agent-api/app/runtimeNodes.ts:371 | `get` | 1 |
| 21 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1407 | `runRuntimeFrame` | 1 |
| 22 | packages/rendering/src/WebGL2Device.ts:2545 | `updateBuffer` | 1 |
| 23 | packages/engine/src/agent-api/compiler/lights.ts:390 | `readLightingModelFromUrl` | 1 |
| 24 | packages/engine/src/agent-api/app/routeState.ts:25 | `updateRouteDiagnostics` | 1 |
| 25 | src/aura/main.ts:111 | `applyTick` | 1 |
| 26 | packages/engine/src/agent-api/app/runtimeNodes.ts:2316 | `snapshot` | 1 |
| 27 | packages/rendering/src/Material.ts:196 | `getParameter` | 1 |
| 28 | packages/rendering/src/shaders/deform/forwardFeature.ts:111 | `selectPrd06DeformValue` | 1 |
| 29 | packages/math/src/Matrix4.ts:169 | `multiply` | 1 |
| 30 | packages/rendering/src/Renderer.ts:3932 | `renderFrameWithPrd07View` | 1 |
