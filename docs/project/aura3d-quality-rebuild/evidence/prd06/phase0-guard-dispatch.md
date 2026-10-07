# PRD-06 evidence — Phase 0 guard, dispatch, clip samples (PR A)

Branch: `qr/prd06-empty-pose-guard`. Flag: `A3D_QR_ANIMATION` (plus `A3D_QR_STRICT` for the strict path).

## What landed

| Task | Artifact | Status |
|---|---|---|
| T0.0 | `playwright.animation-matrix.config.ts` + `.github/workflows/qr-prd06-animation-browser.yml` (chromium/webkit/firefox on macos-14, `--use-angle=metal` via `A3D_WEBGPU_BROWSER_EXECUTABLE` wrapper, report/screenshot artefacts) | written; first remote run pending |
| T0.1 | `dispatchActorAnimation` exported from `agent-api/compiler/animation.ts` — today's branch semantics + empty-pose rejection + `ANIMATION_EMPTY_POSE` surfacing | implemented; `renderInput.ts` call-site swap filed as Q-15-1 (one-line) |
| T0.2 | `rejectEmptyAnimationPose` + `setActorRuntimeAnimationPose` in `agent-api/app/actorAnimationHandle.ts`: 0-bone/0-morph pose rejected (stores `undefined`), warn once/node via pending → `runtimeWarnings`, `pose-apply-failed` degradation hook (`onRejected`), strict throw `ANIMATION_EMPTY_POSE`; flag-off stores verbatim | implemented; `runtimeNodes.ts setAnimationPose` wiring via qr-request |
| T0.3 | `clipSamples` on runtime binding metadata (flag-gated) + per-sample `mask` (`AuraBoneMaskSpec`: include/exclude from layer `bones`/`excludedBones`, `humanoid` from `bodyMask` preset) + `applyClips` dispatch in `applyProductionActorAnimation` with `ANIMATION_CLIP_NOT_FOUND` once | implemented |
| T0.15 | `scenes/prd06/skinnedCharacterPosed.ts` (CesiumMan clip 0 @ t=0.75s, 08 camera/lights, masks shadow-receiver+silhouette-edge) + aura3d/three adapters | registered in all three lane indexes; capture runs via lane-12 router (Q-12-1) |

## Runs

- `pnpm exec vitest run tests/unit/agent-api/runtime-node-empty-pose.test.ts tests/unit/agent-api/production-actor-dispatch.test.ts tests/unit/contracts/impl/prd06-playback.test.ts` — 21/21 pass (2026-10-06).
- `pnpm typecheck:raw` — clean.
- `pnpm exec eslint` on all touched files — clean.
- `node tools/qr-ownership/check.mjs` (whole-repo audit) — passes.

## Declared correctness fix (flag-off behaviour change)

`dispatchActorAnimation` drops a stored pose with 0 bones **and** 0 morph targets regardless of flag state. A pose that empty cannot move a rig; flag-off behaviour only changed for inputs that produced a frozen rig today. `setActorRuntimeAnimationPose` is fully flag-gated.

## NOT RUN

- `qr-prd06-animation-browser.yml` browser matrix (chromium/webkit/firefox) — runs on macos-14 on this PR; `tests/qr/prd06/browser/clip-samples-binding.spec.ts` first run pending.
- `tests/browser/animated-character-browser.spec.ts` baseline check on all three projects (T0.0 check) — remote only.
- `quality-rebuild-capture.yml` lane-scene captures — router wiring is Q-12-1.
- C-36 `pose-apply-failed` degrade() — lands when the PRD-15 seam calls `onRejected` with `ctx.degrade`.
- `deform-light-view.spec.ts` — PR B scope (needs `forward/Deform.ts`).

## Ownership notes

- `tools/qr-ownership/check.mjs` prints owner `15` for `tests/qr/prd06/**` and `tests/unit/agent-api/*` — CONTRACTS.md §4.1 assigns `tests/qr/prdNN/` to lane NN and test files elsewhere to the creating lane; the checker's hardcoded regex misses `lanePatterns`. Filed as a non-blocking `qr-request`.
