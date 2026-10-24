# Ninja Runner: obstacle impacts (rework lane 3.8)

Remote run `rwnin-3` (software WebGL2, 640x360 low quality; not real-GPU evidence), spec `tests/browser/ninja-runner-rework.spec.ts`, 1 passed in 37 min. Frames: `sheet-<scenario>.jpg`, each sheet is approach, impact, then two later frames (top-left, top-right, bottom-left, bottom-right). Raw numbers: `metrics.json`.

## What changed
- `sim.ts`: reworked contact rules, on by default in the game (`createState(seed, { ram: true })`), off for the original-parity replay (`?rules=original`, and `replay.ts` uses the original rules). An unavoided hit on a crate or beam stops the runner (speed drops to 12% of free speed for a crash, 30% for a bump, recovering over the 1.1 s stumble), knocks it back (bump 0.55 m, crash 0.95 m, crash at 21.5 m/s and above), and emits one `ram` event with tier `bump`, `crash` or `glance` (glance = hit while protected: debris only, no damage, no knock-back).
- `impact.ts` (pure): per-tier settings for the library impact feedback and the debris physics (planks and straps for a crate, beam pieces for a beam; gravity, damped ground bounce, drag, fade; scatter from a hash of the entity id).
- `world.ts`: pooled debris nodes (32 planks, 12 straps, 12 beam pieces), dust particles by tier, camera shake from the library `createCameraShake`.
- `main.ts`: library `createImpactFeedback` per tier (hit-stop through `createHitStop`, trauma shake, a cue per tier), `createCameraShake`; a dash or attack break (the sim's existing `break` event) gets smash debris with the same feedback.
- `audio.ts`: `ramBump`, `ramCrash`, `crateSmash` cues (hand-written synth like the rest of this port; the port's audio is not on the cue bank).

## Measured (metrics.json)
| Scenario | Outcome | Health | Largest backward step | Debris at +0.12 s |
|---|---|---|---|---|
| bump (18.05 m/s) | one `ram` bump, crate breaks | 5 to 4 | 0.40 m | 8 pieces |
| crash (22.4 m/s) | one `ram` crash | 5 to 4 | 0.76 m | 8 |
| smash (dash) | the dash breaks the crate before contact | 5 | 0 | 8 |
| glance (protected) | debris, no damage | 5 | 0 | 8 |
| beam (22.4 m/s, not sliding) | beam breaks into 3 pieces | 5 to 4 | 0.76 m | 3 |

Runner speed right after a hit: 5.7 m/s (bump), 3.1 m/s (crash), against 18 and 22 m/s free speed. Draw calls 38, 0 console errors, 0 page errors. Jumping the crate and sliding under the beam still avoid contact (unit tests).

## Tests
`tests/unit/ninja-runner-port`: 86 pass, including 12 new ram and debris tests and the original-rules reference replay (unchanged: the original-parity tests run with the rules off, so the replay is bit-identical and no reference was regenerated). Determinism: the same setup twice gives identical events and state (unit test).

## Caveats
- The page's render loop keeps running while the spec waits on slow software-GL frame captures, so the "+0.12 s" and "+0.6 s" frames are at least that late in debris time, and debris had expired by the final read (`settled.debris` 0). Debris timing is verified exactly in the unit tests, not in these frames.
- The existing live-play browser spec (`tests/browser/ninja-runner-port.spec.ts`: autopilot win, restart, loss) was not re-run with the reworked rules on; autopilot runs may now stumble differently. Its original-rules replay is unaffected.
- The "ram" feel (stop depth, knock-back distance, hit-stop length) is tuned by numbers and frames, not play-tested; the owner should feel it on the Mac.
