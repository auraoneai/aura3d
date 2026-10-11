# PRD-06 PR E — animationState + diagnostics + resolvePrd06Options (T0.17–T0.19)

> **06-REC note (finish phase, G3):** this file cites no passing remote run id; every completion claim below is recorded as **unbacked** until a green lane-workflow/GitLab run id is added next to it.


## Scope

| Task | What landed |
| ---- | ----------- |
| T0.18 | `app/actorAnimationHandle.ts` api overrides: `animationState()` (C-19 snapshot) and `socket(bone)` interim bone read. `RuntimeNodeHandleAnimationSnapshot` carries `clipSamples`. Source registration seams: `registerActorAnimationApplySource` / `registerActorBoneMatrixSource` / `resetActorAnimationStateSources` + `collectPrd06AnimationDiagnostics()` (zero timing fields — per-bone samples wait on CCR-06-4). Lane `prd06.animation` actor extension publishes `snapshot().lastApply` + a scene-traverse bone-matrix lookup; C-31 `prd06.animation-diagnostics` diagnostics section (flag-gated `a3d-qr=animation`). |
| T0.19 | `compiler/animation.ts` `resolvePrd06Options(ctx, appOptions?)` — strict ← options/ctx.strict; defaults ← options/flag (`a3d-qr=animation` → 3.1 else 3.0); mixer ← options/`A3D_QR_ANIMATION_POSE_MIXER`; tier ← options/ctx.quality.tier. `compiler/diagnosticOnly.prd06.ts`: unwired C-19 fields (crossFade/transition/warp/syncGroup + 5 diagnostics timing fields) + C-36 option-coverage rows (clip, loop, captureTime, duration, startTime, speed); merged into the lane barrel's DIAGNOSTIC_ONLY_FIELDS + registerOptionCoverage. Type test `tests/unit/agent-api/animation-spec-types.test-d.ts` (compile-time assertions on C-19/C-38 shapes). |
| T0.17 | `tests/qr/prd06/browser/gallery-shift-thief-gait.spec.ts` — flag-on: 10 pumped frames assert `animationState().tracksApplied > 0` on thief + guard-2 via `__AURA3D_LIVE_APPS__`; sprint-vs-sneak hip-Y separation ≥ 0.05 (KeyX sprint-hold vs Shift sneak-toggle, 24 samples each). Flag-off control: the `animation` handle api is absent. No route edits — registry + `__GS_PUMP__` are sufficient. Artifacts under `artifacts/prd06/gallery-shift-thief-gait/`. |

## Surface map

- `animationState()` data flow: `play()`/runtime apply → `snapshot().lastApply` → registered apply source → `activeClip` (lastApply → binding.activeClipId → spec.clip), `tracksApplied`, `clipSamples` → `activeActions`, `speed` → `timeScale`. Returns `undefined` for non-model nodes / empty clip sets.
- `socket(bone)`: live bone lookup; `worldMatrix(out?)` writes into `out` when given; `valid` reflects the last lookup.
- Diagnostics row per actor: id, activeClip, tracksApplied, activeActions count; mixerMs/constraintsMs/springsMs/paletteBytes/cpuMs are declared C-19 fields still diagnosticOnly until a later lane wires timing.

## Verification

- `pnpm exec vitest run tests/qr/prd06/unit/` — 30/30 (animation-state 10, prd06-options 7, +3 pre-existing files).
- Full affected battery (`tests/unit/agent-api/...`, `tests/unit/contracts/impl/prd06-*`, `tests/unit/aura3d-cli/asset-inspection-animation`) — 65/65.
- `pnpm typecheck:raw` — no new errors (55 pre-existing `tools/threejs-parity-*` baseline errors identical to `origin/main`).
- `pnpm exec eslint` on all touched files — clean.
- Browser spec: runs under the `qr-prd06-animation-browser` matrix job (`testMatch` covers `tests/qr/prd06/browser/*.spec.ts`); flag-off is the failing-by-design control.

## Flag-off parity

All new code paths are behind `A3D_QR_ANIMATION` (`a3d-qr=animation`): diagnostics section is flag-gated at registration, actor extension only installs sources when the flag is on, `animationState`/`socket` return `undefined`/inert without the flag. No changes to flag-off render paths.

## Follow-ups (tracked, non-blocking)

- CCR-06-4: per-bone `bones?` samples in `AuraAnimationDiagnostics` — interim reads go through `socket(bone)`.
- Timing fields (mixerMs/constraintsMs/springsMs/paletteBytes/cpuMs) land with the phase-2 mixer/deform timing work.
