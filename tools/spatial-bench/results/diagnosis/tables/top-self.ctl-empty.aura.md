### ctl-empty.aura.cpuprofile.gz

wall 8090 ms, sampled 8002 ms, idle 7800 ms, busy 202 ms (2% of wall), 30227 samples

Top self time (functions)

| # | function | self ms | self % busy | incl ms | source |
|---|---|---|---|---|---|
| 1 | `(idle)` | 7800 | 3857.5% | 7800 | native |
| 2 | `sanitizeDiagnosticText` | 70 | 34.7% | 70 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 3 | `(program)` | 53 | 26.1% | 53 | native |
| 4 | `visit` | 14 | 6.9% | 85 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 5 | `createRendererDiagnosticReport` | 6 | 3.2% | 11 | packages/engine/src/agent-api/rendererDiagnostics.ts:28 |
| 6 | `frameBody` | 4 | 2.0% | 143 | src/common/harness.ts:159 |
| 7 | `onFrame` | 4 | 2.0% | 147 | src/common/harness.ts:156 |
| 8 | `runRuntimeFrame` | 4 | 1.8% | 13 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1391 |
| 9 | `(garbage collector)` | 2 | 1.1% | 2 | native |
| 10 | `readRootDiagnosticSnapshot` | 2 | 1.0% | 2 | packages/engine/src/agent-api/RootRuntimeSupport.ts:126 |
| 11 | `update` | 2 | 0.9% | 8 | packages/engine/src/agent-api/camera/CameraController.ts:389 |
| 12 | `collectGameRuntimeEvidence` | 2 | 0.8% | 3 | packages/engine/src/agent-api/GameEvidence.ts:268 |
| 13 | `collectAuraSceneEvidence` | 2 | 0.8% | 18 | packages/engine/src/agent-api/sceneEvidence.ts:11 |
| 14 | `drawGrid` | 1 | 0.6% | 3 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:58 |
| 15 | `queueMicrotask` | 1 | 0.6% | 1 | native |
| 16 | `renderDiagnosticPreviewToCanvas` | 1 | 0.6% | 8 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:27 |
| 17 | `fillRect` | 1 | 0.6% | 1 | native |
| 18 | `orbitPose` | 1 | 0.6% | 1 | src/common/data.ts:169 |
| 19 | `mediaMatches` | 1 | 0.5% | 1 | packages/engine/src/agent-api/platform.ts:15 |
| 20 | `applyPose` | 1 | 0.5% | 1 | packages/engine/src/agent-api/camera/extension.ts:316 |
| 21 | `diagnostics` | 1 | 0.5% | 92 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2349 |
| 22 | `qrParentLaneFlag` | 1 | 0.4% | 1 | packages/engine/src/contracts/flags.ts:76 |
| 23 | `setCamera` | 1 | 0.4% | 1 | src/aura/main.ts:114 |
| 24 | `hasName` | 1 | 0.4% | 1 | packages/engine/src/agent-api/rendererDiagnostics.ts:331 |
| 25 | `colorToClearColor` | 1 | 0.4% | 1 | packages/engine/src/agent-api/colorUtils.ts:21 |
| 26 | `stroke` | 1 | 0.3% | 1 | native |
| 27 | `collectHelperPerformanceBudgets` | 1 | 0.3% | 1 | packages/engine/src/agent-api/performanceEvidence.ts:50 |
| 28 | `perspectiveMat4` | 1 | 0.3% | 1 | packages/scene/src/MathTypes.ts:151 |
| 29 | `createPerformanceEvidence` | 1 | 0.3% | 2 | packages/engine/src/agent-api/performanceEvidence.ts:32 |
| 30 | `update` | 1 | 0.3% | 1 | packages/engine/src/agent-api/camera/rigs/fromSpec.ts:211 |

Top inclusive time

| # | function | incl ms | incl % busy | self ms | source |
|---|---|---|---|---|---|
| 1 | `onFrame` | 147 | 72.7% | 4 | src/common/harness.ts:156 |
| 2 | `frameBody` | 143 | 70.5% | 4 | src/common/harness.ts:159 |
| 3 | `gpuSample` | 92 | 45.7% | 0 | src/aura/main.ts:120 |
| 4 | `diagnostics` | 92 | 45.6% | 1 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2349 |
| 5 | `visit` | 85 | 41.8% | 14 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 |
| 6 | `sanitizeDiagnosticValue` | 85 | 41.8% | 0 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:31 |
| 7 | `copyText` | 71 | 34.9% | 0 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:35 |
| 8 | `sanitizeDiagnosticText` | 70 | 34.7% | 70 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 |
| 9 | `snapshotDiagnostics` | 68 | 33.6% | 1 | packages/engine/src/agent-api/diagnostics.ts:288 |
| 10 | `(anonymous)` | 67 | 33.3% | 0 | packages/engine/src/agent-api/diagnostics.ts:310 |
| 11 | `collectAppliedLook` | 44 | 21.8% | 0 | packages/engine/src/lanes/prd12.ts:27 |
| 12 | `step` | 43 | 21.5% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2210 |
| 13 | `render` | 43 | 21.5% | 0 | src/aura/main.ts:117 |
| 14 | `render` | 29 | 14.5% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1448 |
| 15 | `collectAuraSceneEvidence` | 18 | 9.0% | 2 | packages/engine/src/agent-api/sceneEvidence.ts:11 |
| 16 | `advance` | 14 | 6.8% | 0 | packages/engine/src/agent-api/app/createAuraAppCore.ts:2198 |
| 17 | `runRuntimeFrame` | 13 | 6.7% | 4 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1391 |
| 18 | `createRendererDiagnosticReport` | 11 | 5.5% | 6 | packages/engine/src/agent-api/rendererDiagnostics.ts:28 |
| 19 | `(anonymous)` | 10 | 4.7% | 0 | packages/engine/src/agent-api/camera/extension.ts:477 |
| 20 | `renderDiagnosticPreviewToCanvas` | 8 | 4.1% | 1 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:27 |
| 21 | `update` | 8 | 4.0% | 2 | packages/engine/src/agent-api/camera/CameraController.ts:389 |
| 22 | `drawGrid` | 3 | 1.5% | 1 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:58 |
| 23 | `collectGameRuntimeEvidence` | 3 | 1.3% | 2 | packages/engine/src/agent-api/GameEvidence.ts:268 |
| 24 | `viewProjection` | 3 | 1.3% | 0 | packages/engine/src/agent-api/camera/CameraController.ts:263 |
| 25 | `resolveRendererSceneCategory` | 2 | 1.0% | 0 | packages/engine/src/agent-api/rendererDiagnostics.ts:330 |
| 26 | `readRootDiagnosticSnapshot` | 2 | 1.0% | 2 | packages/engine/src/agent-api/RootRuntimeSupport.ts:126 |
| 27 | `createPerformanceEvidence` | 2 | 0.9% | 1 | packages/engine/src/agent-api/performanceEvidence.ts:32 |
| 28 | `sample` | 2 | 0.9% | 1 | packages/engine/src/agent-api/app/frameLoop.ts:841 |
| 29 | `resolveQrFlags` | 2 | 0.8% | 0 | packages/engine/src/contracts/flags.ts:216 |
| 30 | `collectHelperPerformanceBudgets` | 1 | 0.7% | 1 | packages/engine/src/agent-api/performanceEvidence.ts:50 |

Top self-time lines (positionTicks)

| # | line (source map) | in function | self ms |
|---|---|---|---|
| 1 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:16 | `sanitizeDiagnosticText` | 58 |
| 2 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:13 | `sanitizeDiagnosticText` | 12 |
| 3 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:42 | `visit` | 7 |
| 4 | packages/engine/src/agent-api/app/createAuraAppCore.ts:1407 | `runRuntimeFrame` | 3 |
| 5 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:85 | `visit` | 3 |
| 6 | src/common/harness.ts:156 | `onFrame` | 2 |
| 7 | src/common/harness.ts:161 | `frameBody` | 2 |
| 8 | packages/engine/src/agent-api/RootRuntimeSupport.ts:127 | `readRootDiagnosticSnapshot` | 2 |
| 9 | src/common/harness.ts:157 | `onFrame` | 2 |
| 10 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:79 | `visit` | 1 |
| 11 | packages/engine/src/agent-api/camera/extension.ts:332 | `applyPose` | 1 |
| 12 | src/common/data.ts:172 | `orbitPose` | 1 |
| 13 | packages/engine/src/agent-api/platform.ts:22 | `mediaMatches` | 1 |
| 14 | src/common/harness.ts:208 | `frameBody` | 1 |
| 15 | src/aura/main.ts:115 | `setCamera` | 1 |
| 16 | packages/engine/src/agent-api/rendererDiagnostics.ts:331 | `hasName` | 1 |
| 17 | packages/engine/src/agent-api/sceneEvidence.ts:97 | `collectAuraSceneEvidence` | 1 |
| 18 | packages/engine/src/agent-api/sanitizeDiagnostics.ts:76 | `visit` | 1 |
| 19 | packages/engine/src/agent-api/rendererDiagnostics.ts:43 | `createRendererDiagnosticReport` | 1 |
| 20 | packages/engine/src/agent-api/rendererDiagnostics.ts:280 | `createRendererDiagnosticReport` | 1 |
| 21 | packages/engine/src/contracts/flags.ts:78 | `qrParentLaneFlag` | 1 |
| 22 | packages/scene/src/MathTypes.ts:152 | `perspectiveMat4` | 1 |
| 23 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:60 | `drawGrid` | 1 |
| 24 | packages/engine/src/agent-api/devtools/diagnosticPreview.ts:63 | `drawGrid` | 1 |
| 25 | packages/engine/src/agent-api/GameEvidence.ts:456 | `normalizeBodies` | 1 |
| 26 | src/common/harness.ts:184 | `frameBody` | 1 |
| 27 | packages/engine/src/agent-api/app/rendererOptions.ts:204 | `normalizeTextureBudgetBytes` | 1 |
| 28 | packages/engine/src/agent-api/camera/CameraController.ts:421 | `update` | 1 |
| 29 | packages/engine/src/agent-api/sceneMath.ts:489 | `flattenSceneNodes$1` | 1 |
| 30 | packages/engine/src/agent-api/colorUtils.ts:25 | `colorToClearColor` | 1 |
