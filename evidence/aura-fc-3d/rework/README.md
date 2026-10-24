# Aura FC 3D rework: kicks, doubled legs, run cycles

Lane `rework-fc` (docs/workflows/game-rework-prompt.md section 3.3). All browser frames are software WebGL2 (SwiftShader) on
the remote runner (`tests/browser/rework-fc.spec.ts`, run ids `rwfc-before*`, `rwfc-after*`), not a real GPU. The frames come
from the real game in CPU-vs-CPU demo mode; a QA hook freezes the sim at an exact swing fraction and steps it three fixed steps
at a time, so every frame is a known swing fraction. A real tackle cancelled the first attempt of one run; the spec retried
(`RWFC_AFTER_ATTEMPT` lines in the run log), and the final run's first attempt completed.

> **Mesh note.** The filmstrips below were captured on the original Meshy athlete meshes. While this lane ran, the texture lane
> (`47b51e3f7`) replaced them with repainted, remeshed models (striker 5,221 triangles, keeper 3,584) on the same rig and clips.
> The shipped GLBs are the kick clips and soft weights rebuilt from those repainted files (`fcSoccerStrikerMeshyAthlete.1b318c94.glb`,
> `fcGoalkeeperMeshyAthlete.057b1a70.glb`); the numbers in the unit tests are for the shipped files, the frames are not re-captured
> on them (a remote re-capture is the next step: `tests/browser/rework-fc.spec.ts`, label file `after full`).

## What was wrong (root causes, measured)

1. **The doubled legs.** The GLBs' `Shoot` clip is not a kick: the right foot travels 0.28 m at a peak 1 m/s (test
   `the original Shoot clip has no kick in it`). The game drove 22 procedural kit boxes (shorts, socks) and limb capsules through
   a real swing next to legs that barely moved: two poses at once. `kick-before.jpg` shows the black and white blocks around
   the legs and the body in the same pose in every frame while the ball launches.
2. **No kick.** Nothing connected the sim's launch frame (74% of the swing) to the visible boot.
3. **Sliding.** The default animation path ignores `AuraAnimationSpec.speed`, so every clip speed the game set was a no-op:
   a planted foot slid 0.26 to 1.16 m/s on average (`PLANTED_FOOT_SLIDE_OLD_FIXED_RATE` in the test output).
4. **Sim.** The kicker kept running and facing its movement direction during the swing; a swing interrupted by a tackle, steal or
   stun fired later as a phantom pass in a stale direction (7 to 68 s later, seen in 12 of 12 simulated matches); the AI started
   swings during the kickoff countdown, where the ball launched 1.0 s after the animation ended.

## What changed

- Athlete = one skinned body + shadow + ring (was 23 nodes). Kit boxes and procedural limbs deleted.
- `KickTap` / `KickPass` / `KickShot` baked into both GLBs (`tools/aura-fc/bake-kick.mjs`, analytic two-bone leg IK; no Meshy
  credits). Clip phase = swing progress (`kickT / kickDur`); run phase = distance travelled / stance speed.
- Sim: kicker turns to the kick line during the swing and is planted; interrupted or stunned swings are cancelled; no swings
  before live play.
- Skin weights softened around the Meshy auto-rig's bridging triangles (`tools/aura-fc/skin.mjs`).

## Measured (acceptance, section 3.3)

| Check | Result | Where |
|---|---|---|
| Boot meets the ball at the sim launch fraction | boot tip 0.092 model units from the ball centre (ball radius 0.179) at 0.74 of the swing; ball launches between swing fraction 0.70 and 0.84 in the filmstrip | `kick-clips.test.ts`, `frames-after.json` |
| Swing direction vs ball impulse direction (limit 15 deg) | sim: kicker yaw to launch direction 0.01 deg max over 95 kicks in a 300 s match; clip: boot velocity 6.1 to 6.3 deg off model forward; elevation 12.8 to 13.4 deg vs launch 12 to 26 deg | `sim-kick.test.ts`, `kick-clips.test.ts` |
| Launch timing | max error 16 ms (under one sim frame) over 14 to 125 kicks per match, 12 matches | `sim-kick.test.ts` |
| Plant | kicker speed 2.8 to 3.8 m/s at swing start, 0.23 at 0.14, 0 from 0.28 to the strike (frames-after.json); plant-foot drift in the clip 7 mm | `frames-after.json`, `kick-clips.test.ts` |
| Double-frame detector (library `detectSharedSkeleton`) | clean: one skinned body per athlete across all 10 athletes, rig source has no kit/limb nodes | `athlete-rig.test.ts` |
| Foot slide, planted-foot RMS | run 0.055 to 0.10 m/s, sprint 0.106 to 0.112, walk 0.14 to 0.345 (up to 2.5 m/s); old fixed rates averaged 0.26 to 1.16 m/s | `locomotion-sync.test.ts` |
| Skin stretch (worst triangle over walk, run, sprint, kick, jump, tackle) | shipped repainted meshes: striker 2 triangles past 2x (max 2.0x), keeper 0 (max 1.6x); the unsmoothed repainted meshes have 155 and 222 triangles past 4x; the earlier meshes reached 120x | `skin-repair.test.ts` |
| Console errors in the real game | 0 | `RWFC_AFTER_DONE` |

Filmstrips: `kick-before.jpg` / `kick-after.jpg` (swing fractions in `frames-*.json`), `run-before.jpg` / `run-after.jpg`
(the fastest athlete at 6.6 m/s: before, a time-based clip with kit boxes under the feet; after, legs alternate and the phase
advances 0.048 clip seconds per three steps, exactly 0.33 m / (5.84 x 1.174 m/s)).

## Still open

- **Hip slab in the bind pose.** A pale shorts panel and a skin-coloured plank at the hips are visible in `kick-after.jpg` and
  `run-after.jpg` even in the first (near-rest) frame, so they are mesh and texture (the shorts region keeps a different tone
  from the recoloured shirt), not skinning stretch. They belong to the texture lane (`retexture-athletes`); both tools only
  touch animations, joints and weights, so re-run `bake-kick.mjs` then `skin.mjs` on a repainted GLB.
- Shirt colour is a whole-mesh tint; the shorts/socks kit blocks are gone until runtime nodes expose bone sockets
  (`attachToBone` needs an actor with `socket()`).
- Crosses use the pass swing (elevation 13 deg vs a 45 to 53 deg launch); a scoop clip is a follow-up.
- Library `createLocomotion` is not used: its midpoint switching and 0.6 rate floor slide 3 to 7 times more on this rig
  (`LIBRARY_LOCOMOTION_VS_GAME_SLIDE_RMS`). A `switchSpeeds` option would let the game use it.
- The last 5% of the follow-through (kickT under 0.02 s) hands over to the run clip, so the very end of the swing is cut.
- The remote filmstrip numbers are software GL; a real-GPU look is for the owner's Mac.
