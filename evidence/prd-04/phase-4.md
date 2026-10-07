# PRD-04 Phase 4 — Transmission, Volume, Dispersion (P4-1..P4-5)

Scope: `forward/Transmission.ts` contributor + `TransmissionCapturePass`, `prd04.transmissionTarget` material feature, `a3d_prd04_transmission`/`a3d_prd04_volume` chunks (dispersion folded into the volume chunk's `u_prd04Dispersion` term), `usesUnbackedScalarTransmission` E22 gate, `prd04-transmission` scene + browser spec, `evaluateExternalParityTransmission` moved into `tests/qr/prd04/oracles/`. Everything is behind `A3D_QR_MATERIALS` (+ `A3D_QR_MATERIALS_TRANSMISSION` for the capture path); flag-off behaviour is byte-identical.

## Verification table

| Item | How verified | Result |
|---|---|---|
| P4-1 contributor + capture pass | `tests/qr/prd04/unit/transmission-contributor.test.ts` (4 tests) | PASS — 0 passes with no transmission-lobe items; 1 pass + blackboard `prd04.transmissionTarget` + RGBA16F when any item reports one; RGBA8 + `transmission-ldr-capture` issue on RGBA8-only devices; Low tier → `[]`, Medium → 0.5 scale |
| P4-2 `prd04.transmissionTarget` feature + chunks | typecheck + feature registration compile-checked; chunks selected only when transmission/volume/dispersion params > 0.001 | PASS (chunk GLSL itself exercised on macos-14 CI browser job — LLVMPipe eval is the unit-level proxy, see NOT RUN) |
| P4-3 `usesUnbackedScalarTransmission` E22 gate | `tests/qr/prd04/unit/gltf-material-mapping-spec-exact.test.ts` (4 tests) on CompareTransmission.glb | PASS — flag+gate on: factor 1 kept, `renderTransmissionFallbackEnergy` 0.08, baseColor [1,1,1,1], blend stays false; flag off / sub-flag off: legacy rewrite (factor → 0, energy → 0, baseColor ≈ 0.028); texture slot mapping unchanged |
| P4-4 browser spec | `tests/qr/prd04/browser/transmission-capture.spec.ts` | WRITTEN — asserts `materials.transmissionTargetActive === true`, `transmission.mipCount === floor(log2(w))+1`, `transmission.readbacks === 0`; negative scene `prd04-ktx2` → false. Runs macos-14 CI only (per-lane rule: no local Playwright) |
| P4-5 module move | `git mv materials/TransmissionPass.ts → tests/qr/prd04/oracles/external-parity-transmission.ts`; `packages/rendering/src/index.ts` re-exports removed | PASS — `rg "TransmissionPass|materials/TransmissionPass" --type ts` → zero non-test imports; both consumers (`tests/unit/rendering/external-parity-physical-material.test.ts`, `tests/browser/external-parity-material-matrix.spec.ts`) re-pointed |
| Lane unit suite | `pnpm exec vitest run --config tests/qr/prd04/vitest.config.ts` | 19 files / 122 tests, all green |
| Typecheck | `pnpm typecheck:raw` | clean |
| ESLint | `pnpm exec eslint` on every touched path | clean |
| Ownership | `node tools/qr-ownership/check.mjs <paths>` | all lane paths resolve `04`; known exceptions: `tests/qr/**` + `tests/{browser,unit}/**` resolve `15` (check.mjs lane-pattern gap, qr-request already filed); `packages/rendering/src/index.ts` resolves `01` — barrel edit deleting the lane-04 module's own re-export (P4-5), no new API |
| Flag-off identity | all new code paths gated on `A3D_QR_MATERIALS*` resolution; contributor `flag` field = `A3D_QR_MATERIALS_TRANSMISSION`; capture only runs when flags on AND a transmission-lobe item exists | unchanged when flags off |

## Design deviations worth noting

- **`reads: []` on `TransmissionCapturePass`** — PRD §9.1 nominally wants `reads: aura.scene.color`, but `RenderGraph.compilePlan` throws on a read with no writer, and lane-01's C-01 producer pass is not yet real. Declaring the read would take the whole frame down on any flag-on run today. The pass declares `writes: [prd04.transmission.color]` only, with a comment marking the read to restore once C-01 lands (qr-request to:prd01).
- **`renderer.transmission` / `setTypedGLBActorQrFlags` / `setRendererQrFlags` are lane-15 seams that were never wired into `createAuraApp`** — the lane harness (`runPrd04AuraScene`) now sets all three seams directly (`setTypedGLBActorQrFlags`, `setRendererQrFlags`, `setTypedGLBActorQrTransmissionMode`) so the browser spec can exercise the real path. qr-request to:prd15 for the production wiring.
- **`readbacks` on `Prd04TransmissionDiagnostics`** — `AuraMaterialDiagnostics` is lane-15-owned and cannot grow a field, so `readbacks` (the C-28 device-to-device-copy proof, always 0) lives on the lane's own diagnostics payload and in `payload.extra.transmission.readbacks`.
- **Scene count assertions relaxed** — `scenes.test.ts` now expects 11 lane scenes (ten P1 scenes + `prd04-transmission`).

## qr-request additions this phase

- to:prd01 — `aura.scene.color` has no producer pass while C-01 is a stub; `TransmissionCapturePass.reads` defers the declared read until C-01 lands.
- to:prd15 — `renderer.transmission` option, `setTypedGLBActorQrFlags` and `setRendererQrFlags` are declared seams with no production caller; harness currently sets all three directly.

## NOT RUN

- Browser spec `transmission-capture.spec.ts` (macos-14 ANGLE Metal only — lane rule forbids local Playwright).
- Chunk GLSL vs three.js r185 side-by-side capture on the transmission scene — queued behind the same CI job.
