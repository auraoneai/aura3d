# Aura Hoops 3D rework (lane `rework-hoops`, 2026-10-24)

All runs: remote runner, software WebGL2 (SwiftShader), roughly 0.2 to 0.4 frames per second. None of this is real-GPU evidence. Probe spec: `tests/browser/rework-hoops.spec.ts` (long autoplay, per-frame beacon recording, error capture), `rework-hoops-feet.spec.ts` (low-resolution run with heavy effects off). Raw recordings: `rec-*.json`.

## 1. Crash: not reproduced, hardened

- 10 minutes of autoplay (`?autostart=1&autoplay=1&diag=1`) on the unmodified game: 0 page crashes, 0 `pageerror`, 0 console errors apart from missing local font/HDRI files in the probe's static server. A fresh Prism session on the live route also showed no errors.
- The crash the owner saw on an M4 Max could not be reproduced here, so there is no root-cause claim. What was found: an exception thrown inside the per-frame callback would stop the loop with no report.
- Fix: `createFrameErrorBoundary` in `@aura3d/debug` (new, 4 unit tests) wraps the frame callback. A throw is reported once per message with its stack (`FRAME_ERROR`), the next frame still runs, and 30 failures in a row show the render-error overlay. `frameErrors` is published on the beacon. Final run: `{"total":0,"fatal":false}`.
- To find the real cause, play on the Mac with `?diag=1` and send the console output and `window.__AURA3D_GAME__.frameErrors`.

## 2. Jersey "shards" and stretched look: asset fault, replaced

- Cause: `hoopsAthlete*.glb` use a base-colour atlas whose UVs tear single triangles across the whole texture (a fragment collage), plus a normal map that outlines every fragment seam. The atlas also contains a photographic face, jersey lettering and a brand swoosh. Image-to-3D from reference photos is outside `docs/workflows/crayon-game-reverse-engineering.md` section 4; flagged for the owner.
- Fix: `tools/hoops-athlete-retexture/retexture.mjs` repaints the mesh by body region from its own skin weights as four material primitives (kit, shorts, skin, dark), drops all textures, keeps skeleton and the 23 clips. New files `hoopsAthleteGuardClean.*.glb`, `hoopsAthleteBigClean.*.glb` (2.5 MB each, was 1.5 MB, no texture memory); only this game's route definitions point at them. The shared originals are untouched: `showcase-aura-fc-3d` and `showcase-red-zone-3d` still use them (their lanes decide).
- glTF `COLOR_0` renders white on this skinned path, so vertex colours were tried and rejected.
- Frames: `before-*` versus `after-*`. Known remaining: the kit/shorts hem is slightly jagged (per-triangle region votes on long triangles); faces are flat (no features).

## 3. Dribble contact: measured and fixed

- Cause: the ball was carried `velocity * 0.04` (about 15 cm at 3.7 m/s) ahead of the palm even at the contact moment, so a running handler's hand never met the ball.
- Fix: `src/dribble.ts` (math moved out of `main.ts`, 3 unit tests): the stride lead and outward nudge are scaled by how far the ball is free in the air; at contact the ball sits at the designed palm-to-ball-centre gap of 0.11 m (palm centroid 2 cm inside the 13 cm ball).
- Measured palm-to-ball distance in the contact windows of the live game (palm solve from the real bone sockets): before median 0.209 m (max 0.244, 10 samples); after median 0.110 m (7 to 10 samples per run, two runs). One outlier of 0.97 m in the final run is a possession change.

## 4. Feet sliding: rate fixed analytically, measurement not valid here

- Cause: the clip rate was fixed (Run at 1.2x, Sprint at 1.35x) whatever the speed. Ground speed of each clip at rate 1, measured from the keyframes (`tools/hoops-athlete-retexture/clip-stride.mjs`): Walk 2.51, Run 4.49, Sprint 5.89 m/s. A 3.7 m/s runner played Run at 1.2x = 5.4 m/s of foot travel.
- Fix: `src/locomotionRates.ts` plays each gait at `ground speed / clip speed` (clamped 0.3 to 1.35) with hysteresis; 3 unit tests check foot travel is within 8% of body speed across 1.3 to 5.9 m/s.
- The in-game foot meter (library `createFootSlideMeter`, `?diag=1`, published as `footSlide` on the beacon) reported legs stepping for all 10 athletes (`notStepping` false, lift 0.10 to 0.39 m) but planted-foot speeds of 0.6 to 42 m/s. Those numbers are invalid: software GL takes seconds per frame, the animation clock jumps between samples. No pass or fail is claimed. Run the same page on a real GPU and read `__AURA3D_GAME__.footSlide`.

## 5. Not done

- Shot arc and rim colliders: not changed. The autoplay run scored (SWISH banner, `score/flight` states in `rec-*.json`), but rim and backboard contacts were not measured separately.
- Arm skinning: the stretched-arm look in the owner's screenshot could not be separated from the shard texture and seam normal map; the arms look normal in the new frames, but no rig change was made.
- Other findings outside this lane: at 960 px wide the top toolbar wraps and overlaps the scoreboard; `POSTPROCESS_V2_UNMIGRATED` warning still logged.
