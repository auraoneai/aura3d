### pts-100K-10hz-60fps.aura.cpuprofile.gz

wall 8197 ms, sampled 8002 ms, idle 5 ms, busy 7997 ms (98% of wall), 26276 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `normalizeGeometryAttributes` | 1948 | 24.4% | 3105 | packages/engine/src/agent-api/RootGeometry.ts:341 |
| 2 | `computeBounds` | 1570 | 19.6% | 1638 | packages/rendering/src/Geometry.ts:1289 |
| 3 | `readVec3Attribute` | 1157 | 14.5% | 1157 | packages/engine/src/agent-api/RootGeometry.ts:287 |
| 4 | `updateAttribute` | 961 | 12.0% | 1747 | packages/engine/src/agent-api/app/runtimeNodes.ts:2067 |
| 5 | `setAttribute` | 863 | 10.8% | 963 | packages/rendering/src/VertexBuffer.ts:84 |
| 6 | `runtimeGeometryBounds` | 375 | 4.7% | 2754 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 |
| 7 | `applyAttributeUpdateToGeometry` | 279 | 3.5% | 1252 | packages/engine/src/agent-api/compiler/primitives.ts:1545 |
| 8 | `(program)` | 164 | 2.1% | 164 | native |
| 9 | `validateComponent` | 132 | 1.7% | 132 | packages/rendering/src/VertexBuffer.ts:333 |
| 10 | `(garbage collector)` | 101 | 1.3% | 101 | native |
| 11 | `(anonymous)` | 60 | 0.8% | 74 | packages/rendering/src/VertexBuffer.ts:110 |
| 12 | `updatedQueryGeometry` | 58 | 0.7% | 786 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 |
| 13 | `sanitizeDiagnosticText` | 37 | 0.5% | 37 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 14 | `copyStaticUnlitUpload` | 25 | 0.3% | 25 | packages/rendering/src/WebGL2Device.ts:398 |
| 15 | `applyTick` | 21 | 0.3% | 1769 | src/aura/main.ts:95 |
| 16 | `readComponent$1` | 14 | 0.2% | 14 | packages/rendering/src/VertexBuffer.ts:370 |
| 17 | `bufferSubData` | 8 | 0.1% | 8 | native |
| 18 | `createProductionRuntimeRendererInputOwned` | 8 | 0.1% | 5692 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 19 | `visit` | 6 | 0.1% | 34 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 20 | `updateBuffer` | 6 | 0.1% | 41 | packages/rendering/src/WebGL2Device.ts:2513 |
| 21 | `(idle)` | 5 | 0.1% | 5 | native |
| 22 | `drawItem` | 4 | 0.1% | 70 | packages/rendering/src/ForwardPass.ts:1666 |
| 23 | `modelMatrix` | 4 | 0.0% | 5 | packages/engine/src/agent-api/sceneGraph.ts:536 |
| 24 | `snapshot` | 3 | 0.0% | 2757 | packages/engine/src/agent-api/app/runtimeNodes.ts:2294 |
| 25 | `renderFrameWithPrd07View` | 3 | 0.0% | 140 | packages/rendering/src/Renderer.ts:3619 |
| 26 | `onFrame` | 2 | 0.0% | 7707 | src/common/harness.ts:156 |
| 27 | `readLightingModelFromUrl` | 2 | 0.0% | 3 | packages/engine/src/agent-api/compiler/lights.ts:385 |
| 28 | `mediaMatches` | 2 | 0.0% | 2 | packages/engine/src/agent-api/platform.ts:15 |
| 29 | `requestAnimationFrame` | 2 | 0.0% | 2 | native |
| 30 | `get` | 2 | 0.0% | 3 | packages/engine/src/agent-api/app/runtimeNodes.ts:369 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 7707 | 96.4% | 2 | src/common/harness.ts:156 |
| 2 | `frameBody` | 7705 | 96.3% | 1 | src/common/harness.ts:159 |
| 3 | `step` | 5876 | 73.5% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 4 | `render` | 5876 | 73.5% | 0 | src/aura/main.ts:117 |
| 5 | `advance` | 5711 | 71.4% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 6 | `update` | 5704 | 71.3% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1412 |
| 7 | `update` | 5704 | 71.3% | 0 | packages/engine/src/agent-api/app/frameLoop.ts:602 |
| 8 | `updateCompiledScene` | 5704 | 71.3% | 1 | packages/engine/src/contracts/compiler.ts:162 |
| 9 | `buildFrame` | 5704 | 71.3% | 0 | packages/engine/src/agent-api/compiler/renderer.ts:1237 |
| 10 | `updateCompiledSceneReal` | 5703 | 71.3% | 2 | packages/engine/src/agent-api/compiler/compileScene.ts:1948 |
| 11 | `createProductionRuntimeRendererInput` | 5696 | 71.2% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:454 |
| 12 | `(anonymous)` | 5695 | 71.2% | 2 | packages/engine/src/agent-api/compiler/renderInput.ts:474 |
| 13 | `withPrd01ColorParsing` | 5695 | 71.2% | 0 | packages/engine/src/agent-api/compiler/color.ts:88 |
| 14 | `createProductionRuntimeRendererInputOwned` | 5692 | 71.2% | 8 | packages/engine/src/agent-api/compiler/renderInput.ts:479 |
| 15 | `normalizeGeometryAttributes` | 3105 | 38.8% | 1948 | packages/engine/src/agent-api/RootGeometry.ts:341 |
| 16 | `selectProductionPrimitiveResource` | 2900 | 36.3% | 1 | packages/engine/src/agent-api/compiler/primitives.ts:417 |
| 17 | `syncRuntimePrimitiveGeometry` | 2899 | 36.2% | 0 | packages/engine/src/agent-api/compiler/primitives.ts:1385 |
| 18 | `snapshot` | 2757 | 34.5% | 3 | packages/engine/src/agent-api/app/runtimeNodes.ts:2294 |
| 19 | `getBounds` | 2754 | 34.4% | 0 | packages/engine/src/agent-api/app/runtimeNodes.ts:1678 |
| 20 | `runtimeGeometryBounds` | 2754 | 34.4% | 375 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 |
| 21 | `assertFramePivotSupported` | 1844 | 23.1% | 0 | packages/engine/src/agent-api/compiler/renderInput.ts:319 |
| 22 | `applyTick` | 1769 | 22.1% | 21 | src/aura/main.ts:95 |
| 23 | `updateAttribute` | 1747 | 21.8% | 961 | packages/engine/src/agent-api/app/runtimeNodes.ts:2067 |
| 24 | `refreshBounds` | 1641 | 20.5% | 2 | packages/rendering/src/Geometry.ts:393 |
| 25 | `computeBounds` | 1638 | 20.5% | 1570 | packages/rendering/src/Geometry.ts:1289 |
| 26 | `applyAttributeUpdateToGeometry` | 1252 | 15.7% | 279 | packages/engine/src/agent-api/compiler/primitives.ts:1545 |
| 27 | `readVec3Attribute` | 1157 | 14.5% | 1157 | packages/engine/src/agent-api/RootGeometry.ts:287 |
| 28 | `setAttribute` | 963 | 12.0% | 863 | packages/rendering/src/VertexBuffer.ts:84 |
| 29 | `resolveProductionPrimitiveRuntimeState` | 916 | 11.5% | 1 | packages/engine/src/agent-api/compiler/primitives.ts:499 |
| 30 | `updatedQueryGeometry` | 786 | 9.8% | 58 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/engine/src/agent-api/RootGeometry.ts:341 | `normalizeGeometryAttributes` | 1948 |
| 2 | packages/rendering/src/Geometry.ts:1289 | `computeBounds` | 1570 |
| 3 | packages/engine/src/agent-api/RootGeometry.ts:287 | `readVec3Attribute` | 1157 |
| 4 | packages/engine/src/agent-api/app/runtimeNodes.ts:2078 | `updateAttribute` | 944 |
| 5 | packages/rendering/src/VertexBuffer.ts:84 | `setAttribute` | 863 |
| 6 | packages/engine/src/agent-api/app/runtimeNodes.ts:1458 | `runtimeGeometryBounds` | 375 |
| 7 | packages/engine/src/agent-api/compiler/primitives.ts:1545 | `applyAttributeUpdateToGeometry` | 279 |
| 8 | packages/rendering/src/VertexBuffer.ts:333 | `validateComponent` | 132 |
| 9 | packages/rendering/src/VertexBuffer.ts:110 | `` | 60 |
| 10 | packages/engine/src/agent-api/app/runtimeNodes.ts:1416 | `updatedQueryGeometry` | 58 |
| 11 | packages/rendering/src/WebGL2Device.ts:413 | `copyStaticUnlitUpload` | 25 |
| 12 | src/aura/main.ts:101 | `applyTick` | 20 |
| 13 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 19 |
| 14 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 18 |
| 15 | packages/engine/src/agent-api/app/runtimeNodes.ts:2082 | `updateAttribute` | 16 |
| 16 | packages/rendering/src/VertexBuffer.ts:371 | `readComponent$1` | 7 |
| 17 | packages/rendering/src/VertexBuffer.ts:372 | `readComponent$1` | 7 |
| 18 | packages/rendering/src/WebGL2Device.ts:2550 | `updateBuffer` | 6 |
| 19 | packages/engine/src/agent-api/sceneGraph.ts:563 | `modelMatrix` | 3 |
| 20 | src/common/harness.ts:157 | `onFrame` | 2 |
| 21 | packages/engine/src/agent-api/compiler/renderInput.ts:474 | `` | 2 |
| 22 | packages/engine/src/agent-api/platform.ts:22 | `mediaMatches` | 2 |
| 23 | packages/rendering/src/contracts/structuralMemo.ts:10 | `sameStructure` | 2 |
| 24 | packages/rendering/src/Geometry.ts:397 | `refreshBounds` | 2 |
| 25 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 2 |
| 26 | packages/engine/src/agent-api/compiler/renderInput.ts:700 | `createProductionRuntimeRendererInputOwned` | 2 |
| 27 | packages/engine/src/agent-api/compiler/lights.ts:386 | `readLightingModelFromUrl` | 2 |
| 28 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 2 |
| 29 | packages/engine/src/agent-api/app/runtimeNodes.ts:355 | `applyHandleExtensions` | 2 |
| 30 | packages/rendering/src/Renderer.ts:7650 | `withWholeFrameGpu` | 1 |
