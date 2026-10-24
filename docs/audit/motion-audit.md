# Motion audit (2026-10-24)

Lane `rework-audit` of `docs/workflows/game-rework-prompt.md` (section 3.11), widened by the refresh-rate finding from `rework-serpentine`: the owner's M4 Max display runs at 120 Hz, and a 60 Hz fixed-step simulation that draws only its latest step stands still on every second display frame.

Everything here is software WebGL2 or pure-simulation measurement, not real-GPU evidence. "Measured" means a number from the real simulation and the real `createFixedStepLoop`; "inferred" means read from code and not measured.

## 1. Headline

- **Refresh rate is the biggest finding.** Every game that steps a fixed 60 Hz simulation through `createFixedStepLoop` and draws the latest step (all of them except Serpentine Sky Run and, since this audit, Drift & Deliver) stalls on 50% to 58% of display frames at 120 and 144 Hz. Measured on five games (table in section 2); inferred for the rest.
- **Fixed:** Drift & Deliver (`8d7cc8843`): car, traffic and beams are drawn between the last two steps, and its chase camera follows that smoothed car. Serpentine Sky Run was fixed by `rework-serpentine`.
- **Not fixed here (estimates in section 5):** Silt & Signal, Kid Goku, Where the Wind Wanders, and Ninja Runner above 120 Hz (measured), plus Strange Orbit, Splat Rush, Last Train, Roadster Hours, HEATSINK port, Apex Overdrive, Aura Slam (inferred).
- **Motion, contact and objective findings** (section 3): Teleoperator has no player-versus-traffic collision at all, so a manual driver passes through cars; every other game in this lane has an on-screen objective and some impact feedback.

## 2. Refresh-rate measurements (real simulation, real loop)

Harness: `tools/motion-audit/refresh-audit.mts` (run `node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/motion-audit/refresh-audit.mts out.json`). It drives each game's own sim step at its fixed step through `createFixedStepLoop`, presents the main entity at 60, 60 with 1.5 ms jitter, 120 and 144 Hz displays for 8 s after a 2 s warm-up, and compares `latest` (draw the last step) against `interp` (blend the last two steps by the loop accumulator through `createRenderInterpolator`). "Still frames" are display frames where the entity did not move. "Speed CV" is the standard deviation of per-frame travel divided by its mean (0 is perfectly steady). Flips are moving/still transitions per 10 s, a proxy for run-cycle clip flips.

| Game | Display | Still frames, latest / interp | Speed CV, latest / interp | Flips per 10 s, latest / interp |
|---|---|---|---|---|
| Drift & Deliver | 60 Hz | 2 / 0 | 0.088 / 0.038 | 5 / 0 |
| | 60 Hz, 1.5 ms jitter | 13 / 0 | 0.240 / 0.066 | 33 / 0 |
| | 120 Hz | 479 of 960 / 0 | 0.999 / 0.038 | 1195 / 0 |
| | 144 Hz | 671 of 1152 / 0 | 1.183 / 0.038 | 1200 / 0 |
| Silt & Signal | 120 Hz | 479 / 0 | 0.999 / 0.030 | 1195 / 0 |
| | 144 Hz | 671 / 0 | 1.182 / 0.030 | 1200 / 0 |
| Kid Goku | 60 Hz, jitter | 13 / 0 | 0.350 / 0.185 | 33 / 0 |
| | 120 Hz | 479 / 0 | 1.066 / 0.265 | 1195 / 0 |
| | 144 Hz | 671 / 0 | 1.250 / 0.245 | 1200 / 0 |
| Where the Wind Wanders | 120 Hz | 481 / 0 | 1.427 / 0.716 | 1196 / 0 |
| | 144 Hz | 673 / 0 | 1.625 / 0.717 | 1196 / 0 |
| Ninja Runner | 120 Hz | 1 / 0 | 0.092 / 0.072 | 3 / 0 |
| | 144 Hz | 191 / 0 | 0.453 / 0.072 | 478 / 0 |

Reading it: at 120 Hz the old presentation draws an unchanged entity on about half of all frames (a 60 Hz sim shown at 120 Hz), so the entity advances in alternating 0 and 2x jumps (CV about 1) and any clip chosen from "is it moving" flips about 1,200 times in 10 s. At 144 Hz it is worse (58% still). Ninja Runner steps at 120 Hz (`SIM_STEP = 1/120`), so it is steady on a 60 or 120 Hz display and stalls only above its step rate (144 Hz: 191 of 1152 frames); a 165 or 240 Hz display would be worse. Interpolating removes every still frame at every rate and brings the CV to the simulation's own value (Wind and Goku keep a CV around 0.7 and 0.25 because their scripted input meets walls and a speed ramp; the still-frame count is the clean signal). A 60 Hz display with 1.5 ms of jitter also produces stalls (13 of 481 frames) that interpolation hides.

The camera is not the problem in these ports: they smooth the camera with the frame time, so its CV is steady (about 0.05). The visible error is the character or vehicle stepping against a smooth camera, which reads as shake.

## 3. Per-game audit

Severity: high = the player will notice in the first minute; medium = noticeable; low = polish; ok = nothing found. "RR" = refresh-rate status (measured, inferred). Games owned by other rework lanes are listed for the refresh-rate column only.

| Game (slug) | Loop | RR | Locomotion / foot slide | Held items | Impacts, shake | Double frames | Objective on screen | Severity | Action |
|---|---|---|---|---|---|---|---|---|---|
| Apex Overdrive (`roadster-rush`) | own accumulator, `FIXED_DT`, draws latest | inferred affected | vehicle, no legs | n/a | crash and near-miss events, shake pulse (frame strip shows score, multiplier, air meter) | none seen | yes (score, bolts) | medium (RR) | RR fix, 0.5 day |
| Iron Crown (`iron-crown`) | engine loop `fixedDt 1/60` | unmeasured (engine alpha exists, renderer does not interpolate) | fighters play state clips (walk, jab, uppercut); no sliding seen in strip | hands only | hit-stop 0.05 to 0.07 s and knockback authored per move; "2 HITS" counter appears | none seen | yes (round timer, health, combo) | low | confirm RR with a runtime test |
| Pips Big Leap (`pips-big-leap`) | variable dt (inferred from the clamp helpers in its sim) | inferred not affected | `createLocomotionKit` with idle/walk/run speed thresholds | n/a | hearts, boss hit reaction | none seen | yes ("Gather sun-seeds for the Sun-Gate") | ok | none |
| Bunker Zero (`bunker-zero`) | demo accumulator at 1/60, otherwise variable | inferred partly affected (demo path) | first person, no body | n/a | `shake` state, damage and pain on enemies | n/a | yes (key, exit, floor) | low | none |
| Slingshot Siege (`slingshot-siege`) | engine loop `fixedDt 1/60`, 2 substeps | unmeasured | no characters | catapult pouch holds the loaded gull | physics impacts, shake | none | yes (targets) | low | confirm RR with a runtime test |
| Dot Dash (`dot-dash-3d`) | tile sim stepped by time | inferred affected only if step is fixed 60 | maze entities slide by design | n/a | caught-by-ghost life loss | none | yes (dots, score) | low | none |
| Cross Hop (`cross-hop`) | `app.onFrame` with a clamped variable dt (`1/240` to `0.05`) | not affected | critter hops (rigid model, no legs); no clip driven | n/a | squash, splat, splash, burn, hawk deaths with cues and debris | none seen | yes (score, best) | ok | none |
| Teleoperator (`teleoperator`) | variable dt with `clamp(dt, 0.001, 0.05)` | not affected | car, no legs | n/a | **no collision between the player and traffic**: only an autopilot brake cue and lane avoidance; manual driving passes through cars and buildings | none | yes (fare, comfort score) | **high** | add vehicle-vs-traffic collision with the impact response kit, 1 day |
| Aura Slam (`aura-slam`) | `createFixedStepLoop` in the shell | inferred affected (draws latest) | procedural athlete rig, no clips; pose differential-tested against the original | racket placed by the rig hand transform | ball and swing events, camera, rumble | none | yes (scoreboard) | medium (RR) | RR fix, 1 day |
| Splat Rush (`splat-rush`) | `createFixedStepLoop`, draws latest | inferred affected | runner, camera shake 14 uses | n/a | gate and power-up splats, shake | none | yes (score, lives) | medium (RR) | RR fix, 0.5 day |
| Silt & Signal (`silt-and-signal`) | `createFixedStepLoop`, draws latest | **measured affected** | courier rides a hoverboard (cruise clip, no legs moving by design) | board under the rider | collision and ring pickups | none | yes (objective copy per chapter) | medium (RR) | RR fix, 1 day |
| Last Train (`last-train`) | `createFixedStepLoop`, draws latest | inferred affected | train on rails | n/a | no collision model (fare and schedule game) | none | yes (stops, fares) | low | RR fix, 0.5 day |
| Drift & Deliver (`drift-and-deliver`) | `createFixedStepLoop` + presenter | **measured, fixed** | car | n/a | thud cue, shake 23 uses | none | yes (pickups) | ok after fix | remote browser check (section 6) |

Refresh-rate only (games whose motion, contact and objective are owned by the other rework lanes in section 3.1 to 3.10):

| Game | Loop | RR |
|---|---|---|
| Serpentine Sky Run (`saiyan-snake-way`) | fixed step + `createRenderInterpolator` | fixed by `rework-serpentine` |
| Strange Orbit (`strange-orbit`) | `createFixedStepLoop`, draws latest | inferred affected |
| Where the Wind Wanders (`where-the-wind-wanders`) | `createFixedStepLoop`, draws latest | **measured affected** |
| Kid Goku (`kid-goku-beyond-the-clouds`) | `createFixedStepLoop`, draws latest | **measured affected** |
| Ninja Runner (`ninja-runner`) | `createFixedStepLoop`, draws latest | **measured affected at 144 Hz** |
| Roadster Hours (`roadster-hours`) | `createFixedStepLoop`, draws latest | inferred affected |
| HEATSINK port (`heatsink`) and index HEATSINK | `createFixedStepLoop` / `auraApp.step(1/60)` | inferred affected |
| Aura Diamond, Aura Hoops, Aura FC, Red Zone, Aura Links | engine or custom loops | unmeasured; inspect when their rework lanes land |

## 4. Library proposals (not applied)

1. **`createFixedStepLoop` should expose `alpha`** (`accumulator / stepSeconds`, 0 to 1) and an optional `onPresent(alpha)` callback. Every presenter in the repo recomputes `loop.accumulator / STEP` by hand; two did it wrongly while this audit ran. Additive, no behaviour change.
2. **Interpolation should be opt-out in the game kit, not opt-in.** A `createFixedStepPresenter({ snapshot, blend })` that owns the `createRenderInterpolator`, pushes after each step, resets on teleport/restart, and snaps above a distance threshold would turn the 25-line change used in Drift into 6 lines, and make "stands still on 120 Hz" impossible to ship by omission. Proposal only; changing a default needs the owner's decision because it adds one frame of visual latency (the displayed state is one step behind the simulation by up to 16.7 ms).
3. **`check:motion` gate.** A unit helper (the harness in `tools/motion-audit/`) that fails if a game's presenter draws an unchanged entity on more than 5% of frames at 120 or 144 Hz. This is what would have caught it.
4. **Engine runtime games** (`createAuraApp({ loop: { fixedDt } })`, used by Iron Crown and Slingshot Siege): the runtime computes `runtimeAlpha` but the renderer does not interpolate node transforms. Either interpolate runtime-node transforms by that alpha for nodes flagged `interpolate: true`, or document that game code must do it. Needs a runtime-level measurement first (a remote spec on a node moved per fixed step, sampled at 120 Hz).

## 5. Fix recipe and estimates

Recipe (the Drift change, `examples/drift-and-deliver-port/presentation.ts` and `main.ts`):
1. Define `Presented` (the entity poses the renderer needs: position, heading, lean, speed for the player; x, z, yaw for movers).
2. `presenter = createRenderInterpolator(blendPresented)`, `blendPresented` uses `lerpAngle` and snaps above a distance threshold.
3. Push `presentedNow()` at the end of each step; render with `presenter.sample(loop.accumulator / STEP)` while playing; draw the latest state in manual/QA mode and in menus so `stepFrames` and replays are untouched.
4. Feed the camera from the displayed pose, with frame-time smoothing.
5. Test: a unit test with the real sim at 60/120/144 Hz that asserts zero still frames and CV under 0.1, plus the blend and snap cases.

| Port | Entities to blend | Estimate |
|---|---|---|
| Silt & Signal | board and rider pose, camera rig | 1 day |
| Kid Goku | lane, jump, forward distance, camera | 1 day |
| Ninja Runner | position, lane, lean, projectiles, camera | 1 day |
| Where the Wind Wanders | walker pose and the sim's camera (it is stepped inside the simulation: needs the camera blended too) | 1 day |
| Strange Orbit, Splat Rush, Last Train, Roadster Hours, HEATSINK, Apex Overdrive, Aura Slam | to be measured first | 0.5 to 1 day each |

Total for the remaining ports: about 8 to 10 days of one agent, or a day with parallel lanes. If proposal 2 lands first, each port is about 2 hours.

## 6. Verification status

- **Drift & Deliver:** 120 unit tests pass in `tests/unit/drift-and-deliver-port` (5 new: blend, angle wrap, snap, and the real sim at 60, 120 and 144 Hz showing zero still frames and a steady per-frame travel). Typecheck is clean. Remote browser run `rwaud-2` (`tests/browser/drift-and-deliver-port.spec.ts`, software GL): 2 of 2 passed in 9.4 minutes, 0 errors, 45 draw calls, health ready. That spec does not run a 120 Hz display; the 120 and 144 Hz result is the unit-level measurement above.
- **Frame strips of the live index games** (`tests/browser/rwaud.spec.ts`, run `rwaud-1`, 8 of 8 passed in 42.5 minutes, software GL, 640x360, six frames 0.5 s apart; frames 3 and 6 per game are in `evidence/motion-audit/strips/`): Iron Crown, Pips Big Leap, Cross Hop, Teleoperator, Apex Overdrive, Slingshot Siege, Bunker Zero and Dot Dash all loaded and played with 0 console errors, and every frame shows an on-screen objective or score (Iron Crown round and hit counter, Pips "Gather sun-seeds", Cross Hop score, Teleoperator fare, Apex Overdrive score and air, Slingshot instructions and stars, Bunker Zero "Find the brass key, reach the elevator", Dot Dash "Caught! 2 lives left").
- **Layout finding (low):** at 640x360 the mode-switcher overlays cover about a third of the frame in Iron Crown, Pips, Teleoperator, Apex Overdrive and Dot Dash, and Bunker Zero's floor banner overlaps its HUD. Real windows are larger, but small laptop windows and landscape phones will see it.
- **Naming finding for the names lane:** the Apex Overdrive menu chip reads "AURA3D 4.0 · APEX OVERDRIVE" and Iron Crown's reads "Iron Crown · Aura3D Showcase".
- **Not run:** Last Train and HEATSINK (never finish under software GL), a real-GPU run, a per-game foot-slide measurement (the foot-slide tool belongs to `rework-library`; the only legged games in this lane, Iron Crown and Pips, play authored clips and show no sliding in the strips), and a runtime-level measurement for the engine-loop games (Iron Crown, Slingshot Siege).
- **Raw numbers:** `evidence/motion-audit/refresh-audit.json`.
