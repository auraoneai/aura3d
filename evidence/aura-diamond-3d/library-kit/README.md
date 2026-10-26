# Aura Diamond 3D on `createTwoHandGrip` (library kit promotion, 4.3.1)

Software WebGL2 (SwiftShader) through `tools/remote-acr/run.sh` with `tests/browser/diamond-bat-fix.spec.ts`, run `libgrip-5` (the batter solver now lives in `packages/game/src/motion/twoHandGrip.ts`; `apps/showcase-aura-diamond-3d/src/batter-pose.ts` is a thin wrapper) against the pre-refactor run `diamondbat-final1` (same spec, same GLBs). Not real-GPU evidence.

- **Unit proof:** `tests/unit/rework-kit/two-hand-grip.test.ts` replays 112 recorded solves (stance sway, four contact configs across the swing and the recovery) through the kit-backed `solveBatterPose` and requires every output number within 1e-12 of the outputs captured before the refactor (`tests/unit/rework-kit/golden/diamond-grip-golden.json`). It passes.
- **Remote probe:** 20 probes (owner, side, front and hands cameras; swing clock frozen at exact t). Every held-swing probe (t = 0.12, 0.26, 0.4, 0.476, 0.55, 0.7, 0.87, 1.0) has positional difference 0.0 cm (right palm, left palm, knob, bat tip) and identical drawn-hand-to-axis numbers (right 0.03 to 0.11 cm, left 0.02 to 0.09 cm). The only differences are the unheld probes whose pose follows the wall-clock stance sway (stance 0.8 to 1.4 cm, one unheld follow-through 1.0 cm): the sway reads `now`, which differs between runs.
- **Spec:** passes (`playwright_exit=0`).

Files: `after-kit-probe.txt` (the 20 probe lines), `summary.json`.
