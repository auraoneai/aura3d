# Aura Hoops 3D rework (lane `rework-hoops`, 2026-10-24)

All runs: remote runner, software WebGL2 (SwiftShader), roughly 0.2 to 0.4 frames per second. None of this is real-GPU evidence. Probe spec: `tests/browser/rework-hoops.spec.ts` (long autoplay, per-frame beacon recording, error capture), `rework-hoops-feet.spec.ts` (low-resolution run with heavy effects off). Raw recordings: `rec-*.json`.

## 1. Crash: root cause found (hit-stop froze the game), plus a frame error boundary

- **Root cause (found in follow-up):** the juice hit-stop was `hitStopUntil = game_.time + seconds`, but while frozen `dt` is 0, so `game_.time` never advanced and the hit-stop never ended. The first made basket or dunk (swish 60 ms, dunk 90 ms) froze the whole simulation for good: no input, no AI, no clock. Evidence: in the 10-minute remote run before the fix, 183 of 186 rendered frames sat in `live/dunk` with 0 shots released and the score at 0-0; earlier runs sat in `score/flight` for the rest of the run. Fixed by the library `createHitStop(0)` counting down on the frame clock (`tests/unit/aura-hoops/hit-stop.test.ts`). After the fix the same run plays a whole match to game over.
- The original probe (before the root cause was found): 10 minutes of autoplay (`?autostart=1&autoplay=1&diag=1`) on the unmodified game showed 0 page crashes, 0 `pageerror`, 0 console errors apart from missing local font/HDRI files in the probe's static server. A fresh Prism session on the live route also showed no errors.
- The crash the owner saw on an M4 Max could not be reproduced here, so there is no root-cause claim. What was found: an exception thrown inside the per-frame callback would stop the loop with no report.
- Fix: `createFrameErrorBoundary` in `@aura3d/debug` (new, 4 unit tests) wraps the frame callback. A throw is reported once per message with its stack (`FRAME_ERROR`), the next frame still runs, and 30 failures in a row show the render-error overlay. `frameErrors` is published on the beacon. Final run: `{"total":0,"fatal":false}`.
- To find the real cause, play on the Mac with `?diag=1` and send the console output and `window.__AURA3D_GAME__.frameErrors`.

## 2. Jersey "shards", torn hems and stretched look: asset fault, replaced

- Cause: `hoopsAthlete*.glb` use a base-colour atlas whose UVs tear single triangles across the whole texture (a fragment collage), plus a normal map that outlines every fragment seam. The atlas also contains a photographic face, jersey lettering and a brand swoosh. Image-to-3D from reference photos is outside `docs/workflows/crayon-game-reverse-engineering.md` section 4; flagged for the owner.
- Fix: `tools/hoops-athlete-retexture/retexture-palette.mjs` (Hoops only; the shared four-material `retexture.mjs` with its config options is what the Diamond, FC, Links and Red Zone models use) classifies each vertex by body region from the mesh's own skin weights, splits only the edges that straddle two regions (three conforming passes down to 1.5 cm, +15% vertices) and points each vertex's UV at one cell of a 70x2 flat palette strip sampled NEAREST (cells ordered so only classes that meet on the body are adjacent). Shard atlas, seam normal map and metal/rough map are dropped; skeleton and the 23 clips are untouched. One primitive and one tiny texture per athlete, 1.5 MB each (was 1.5 MB with three 1024 px maps). Tried and rejected: repainting the atlas (UVs tear), `COLOR_0` (the engine ignores it on this skinned path, renders white), four material primitives (jagged hem from per-triangle votes).
- Only this game's route definitions point at the new files; the shared originals are untouched for FC and Red Zone.
- Frames: `before-*`, `after-*` (960x540) and `arms-before-1920x1080.jpg` versus `arms-after-1920x1080.jpg` (and `-crop` files).

## 3. Dribble contact: measured and fixed

- Cause: the ball was carried `velocity * 0.04` (about 15 cm at 3.7 m/s) ahead of the palm even at the contact moment, so a running handler's hand never met the ball.
- Fix: `src/dribble.ts` (math moved out of `main.ts`, 3 unit tests): the stride lead and outward nudge are scaled by how far the ball is free in the air; at contact the ball sits at the designed palm-to-ball-centre gap of 0.11 m (palm centroid 2 cm inside the 13 cm ball).
- Measured palm-to-ball distance in the contact windows of the live game (palm solve from the real bone sockets): before median 0.209 m (max 0.244, 10 samples); after median 0.110 m (7 to 10 samples per run, two runs). One outlier of 0.97 m in the final run is a possession change.

## 4. Feet sliding: rate fixed analytically, measurement not valid here

- Cause: the clip rate was fixed (Run at 1.2x, Sprint at 1.35x) whatever the speed. Ground speed of each clip at rate 1, measured from the keyframes (`tools/hoops-athlete-retexture/clip-stride.mjs`): Walk 2.51, Run 4.49, Sprint 5.89 m/s. A 3.7 m/s runner played Run at 1.2x = 5.4 m/s of foot travel.
- Fix: `src/locomotionRates.ts` plays each gait at `ground speed / clip speed` (clamped 0.3 to 1.35) with hysteresis; 3 unit tests check foot travel is within 8% of body speed across 1.3 to 5.9 m/s.
- The in-game foot meter (library `createFootSlideMeter`, `?diag=1`, published as `footSlide` on the beacon) reported legs stepping for all 10 athletes (`notStepping` false, lift 0.10 to 0.39 m) but planted-foot speeds of 0.6 to 42 m/s. Those numbers are invalid: software GL takes seconds per frame, the animation clock jumps between samples. No pass or fail is claimed. Run the same page on a real GPU and read `__AURA3D_GAME__.footSlide`.

## 5. Shot arc and rim colliders: physics decides makes and misses

- Before: `releaseShot` rolled `made` from a probability, aimed at the rim centre or a random miss point, and the rim "contact" was a radial reflection with random jitter. Now the release read gives a horizontal aim error (`aimError`: quality, distance, defender, difficulty), the ball is launched on a ballistic arc at `rim + error`, and the library impact kit (`createImpactWorld`, `@aura3d/engine/game`) resolves a 28-sphere rim ring (tube 2.2 cm, restitution 0.52) and a thick glass box (restitution 0.6); a make is the ball centre crossing the rim plane downward inside the opening. Code: `src/shotPhysics.ts`; 5 unit tests.
- Two integrator bugs found while measuring: stepping gravity per frame lands the ball about 10 cm low at 7 m (exact-aim shots missed), and the result depended on frame rate. The ball now advances in fixed 1/240 s substeps and the launch is compensated (exact aim crosses within millimetres).
- Monte Carlo, 3000 shots per release quality (unit test harness, ranges 2.5 to 7.5 m, random angle): quality 0.995: 100% made, 0% touch the rim; 0.92: 99.3% made, 3.7% touch the rim (91 rim rolls); 0.75: 59.4% made, 68.5% touch the rim (841 made after the rim, 1215 rim misses, 30 glass banks); 0.55: 26.9% made, 353 airballs; 0.40: 18.1% made, 749 airballs. A defender in the face lowers the make rate; the same seed gives identical results; no shot passes through the glass.
- In the game (remote, software GL, `?simsteps=90` so a 10-minute run covers about 238 game seconds): 12 shots released, 9 made (5 swishes, 4 made after touching the rim), 9 rim contacts, 3 glass contacts, 0 frame errors, match played to game over. Counters are published as `shotStats` on the beacon. Autopilot and AI release quality are now varied (0.58 to 0.98) so autoplay produces both makes and rim bounces.

## 6. Arms: stretched, bowed arms were the idle pose, not the rig

- Checked: all 15 bind rotations are identity (so the IK's world-space delta maths is valid), scale 1, symmetric shoulders at x = +/-0.2 m; the skeleton has no hand bones (hands are skinned to the forearm); arm length 0.255 + 0.30 m.
- Cause: the idle stance aimed each hand 0.46 m below the shoulder of a 0.555 m arm, which forces about 15 cm of elbow bend, and then flared the elbow outward (`flare` 0.18): both arms bowed out in a parenthesis shape with the hands turned in (visible in `arms-before-*`). The torn-looking shoulders were the shard texture and seam normal map (section 2).
- Fix: `IDLE_HAND_DROP = 0.53` (about 8 cm of bend), hand 3 cm outside the shoulder line, flare 0.06. The Meshy rig was not at fault, so no re-rig and no Meshy credits were spent. Test: bend under 10 cm is asserted.

## 7. Not done / caveats

- Foot slide: still not measurable on software GL (section 4).
- Dribbling and carrying arms (moving handler overlay) were not re-examined beyond the contact distance.
- Faces are flat (no features) and the hem is a clean cut at about 1.5 cm resolution, not cloth.
- Other findings outside this lane: at 960 px wide the top toolbar wraps and overlaps the scoreboard; `POSTPROCESS_V2_UNMIGRATED` is still logged.
- The palette script needs the original athlete GLBs as input; they were removed from `public/aura-assets` by the likeness audit commit `47b51e3f7` and live in git history (`git show 42ef68001^:public/aura-assets/hoopsAthleteGuard.fbef844e.glb`, Git LFS). The other games still use the four-material look; the palette-plus-subdivision cut is cleaner at hems and sleeves, so it is the better candidate if those models are redone.

