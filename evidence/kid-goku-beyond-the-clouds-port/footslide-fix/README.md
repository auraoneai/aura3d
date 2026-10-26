# Cumulus Dash (Cloud Runner): planted-foot gait

Lane `p1-cloud-runner`. The hero's feet slid at running speed: the Meshy run clip plants a foot at about 3.3 m/s but the sim runs the kid at 14.5 m/s (10.2 braking, 17.1 boosted, 19.6 boosted at full combo). The 4.2.0 stride widening (clip rate capped at 1.8x, swing widened 1.8x) left 23% of ground speed sliding by its own analytic estimate; measured on the bones it was worse.

## What changed

`examples/kid-goku-beyond-the-clouds-port/gait.ts` drives hips and both legs by two-bone IK from 2.2 m/s up (blend 2.2 to 4.2, clip only below): stance feet are pinned to a ground point while the hips pass over, cadence rises 3.0 to 4.5 steps per second with speed, the swing foot goes straight up, travels with zero world speed at both ends and drops straight down, the hips dip, arc and lean (up to 13.5 degrees), the swing foot never closes the knee past 38 degrees, and each side uses its own bone lengths (the Meshy skeleton is asymmetric by about 1 cm). The clip stays locked to the gait phase so arms and spine agree with the stride. The finale "walk" (the hero actually moves 8 m/s there, the walk clip planted 1 m/s) now runs the same gait. Sim values, replays and the QA step API are untouched (`reference-replay.test.ts` passes unchanged).

## Measured (the library meter on independent forward kinematics)

Harness: `tests/unit/kid-goku-beyond-the-clouds-port/footslide-fk.ts` reads the GLB's rest translations itself (it shares no solver code with `gait.ts`), builds hips, knee and ankle positions from the overlay bones, and feeds both ankles to `createFootSlideMeter` (plantedHeight 0.06 m, threshold 0.15 m/s) while the hero travels at the sim speed. `slide.json` has the full table (8 s per speed, 60 Hz).

| ground speed | 4.2.0 gait: p95 planted-foot speed | planted-foot gait: p95 | planted samples per foot (8 s) |
|---|---|---|---|
| 3.3 | 5.10 | 0.00 | 170 |
| 6 | 5.54 | 0.01 | 103 |
| 10.2 | 3.56 | 0.00 | 61 |
| 14.5 | 3.44 | 0.00 | 42 |
| 17.1 | 5.99 | 0.00 | 33 |
| 19.6 | 8.48 | 0.00 | 28 |

The 4.2.0 column was measured with the same harness on the pre-change code (clip at the library rate with the widened leg overlay). `gait.test.ts` holds the planted gait to the library threshold at every sim speed at 30, 60 and 120 Hz, and also requires real touchdowns (a foot that never lands would pass trivially), forward knees, feet on the floor, a knee that bends at least 20 degrees (38 by design), legs within reach and plausible hip height.

## Frames

`gait-strip-<speed>ms.png`: offline software-rasterised side silhouettes of the real hero GLB (`tools/kid-goku/raster-gait.ts`, using `tools/aura-fc/raster.mjs`) with the run clip plus the gait overlay, eight frames across one stride at 6, 10.2, 14.5 and 19.6 m/s. Read: one foot lands under the body, the other tucks, then a flight phase with the legs opened front and back, and the body leans forward more as speed rises. The stride is stylised (long reaches, a visible tuck at the slow end): a 1.5 m kid at 14.5 m/s cannot be planted by any believable stride, so the gait lands briefly and flies between steps.

## Not verified

- **In-game frames from the remote runner.** The game never reaches `ready` on the runner from any checkout I could stage, so no in-engine frame exists. Same result on the unchanged `origin/main` tree (so it is the staging, not the gait). Tried over 23 runs (`p1cloud-*`): the custom example dev server on `/examples/...` and `/apps/...` routes; a real Vite dev server; a production-style Vite build of the app route served by `vite preview` (`tests/browser/kid-goku-vite.cloud.config.ts`, with the retarget-worker plugin and es2022 target mirrored from `marketing/vite.config.ts`); viewports 240x180 to 960x540; 4 to 25 minute boot allowances; `quality=low`, `post=0&shadow=0&aa=0` and plain `?manual=1`; request routing for hash-named assets and without it. Every variant ends the same way: the page stays on "loading", `window.__AURA_CUMULUS_DASH__` is never installed, there are no console errors or failed requests, and the two road textures (`path-color`, `path-normal`) are re-requested about once a minute (each answered in 30 to 60 ms) while nothing else loads, which looks like a retry loop in the asset pipeline during `boot()`. Production boots the same code in under 9 s (`evidence/live-420`, 0.30 fps on software GL), so the difference is in how the page is built or served here, not in the game. Not resolved; whoever picks this up should compare against the marketing build (`pnpm --dir marketing build`, which the Dockerfile does not stage) before touching the game.
- Whether `setAnimationPose` honours a `Hips` position in the production actor (the code path writes node translations from the pose, `GLTFAnimationRuntime.applyPose`, but no frame confirmed it in-engine).
- Real-GPU appearance; the look of the stride at 120 Hz.
