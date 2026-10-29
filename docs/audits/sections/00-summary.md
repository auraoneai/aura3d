# Aura3D live games and 4.5.0 audit (2026-10-29)

This audit covers the 25 live games listed in `docs/workflows/game-inventory.json` and the engine changes shipped in 4.5.0 (`git diff v4.3.7 v4.5.0`, 753 files). It was done read-only at origin/main 31f8945ad, which contains tag v4.5.0 (6813d5d24) plus post-release docs and evidence commits. Each game was read at source level (game code, its 4.5.0 upgrade guide, its evidence folder) and probed on production (https://aura3d.auraone.ai, serving 4.5.0) in the Prism cloud browser, which renders with software GL. The release was audited in five areas: render path, lighting, shadows and instancing, animation/physics/API, and release hygiene. Targeted unit tests were run with vitest; findings carry file:line, a command output or a measured number. Not done: no real-GPU run, no 4.3.7-vs-4.5.0 steady-state capture for the games that lack one, no remote Playwright suite, no fixes. `node tools/game-checks/run.mjs <slug>` reports 0 errors and 0 warnings for every game, so it is not repeated here. Severity: P0 broken or unplayable on the live site, P1 wrong behaviour a player sees or a 4.5.0 regression, P2 quality, feel, perf or robustness, P3 polish.

Totals across the 25 games: 8 P0, 98 P1, 215 P2, 190 P3. The release audit adds 1 P1 (LIGHT-01), 22 P2 and 29 P3; it found no P0. No game is black or crashes on load: all 25 pages answer 200 and render. Two games are rated broken because their core loop cannot be completed (Aura Diamond 3D, Aura Links 3D).

## Outcome

Status after the audit-fix program (lanes E1 to E5 and G01 to G25, merged on `audit-fix/integration`). Every row of the release tables and of each game's Fix and Enhance tables has a Status cell: `done <commit> [release]`, `not done: <reason>`, `not a defect: <reason>` or `withdrawn: <reason>`. Commits come from the lane reports in `docs/audits/lanes/` and, for G12 (no report file), from its commit messages. Engine rows that appear inside a game section carry the engine lane's outcome. The release in brackets is checked per commit against tag `v4.6.0`: 4.6.0 shipped E1 to E5, G01 to G09, G12 and G15 to G17; 4.6.1 carries the other twelve games (G10, G11, G13, G14, G18 to G25) and the wave-3 changes. A row whose commits are not all in `v4.6.0` is marked 4.6.1.

Counts are per table row: 562 rows, 52 in the release tables and 510 in the game tables. 21 game-table rows repeat an engine row (for example RP-04 appears in seven games) and are counted in each place.

| Status | P0 | P1 | P2 | P3 | No severity | Total |
|---|---|---|---|---|---|---|
| done | 8 | 99 | 232 | 212 | 0 | 551 |
| not done | 0 | 0 | 3 | 4 | 0 | 7 |
| not a defect | 0 | 0 | 0 | 2 | 0 | 2 |
| withdrawn | 0 | 0 | 1 | 0 | 1 | 2 |
| total | 8 | 99 | 236 | 218 | 1 | 562 |

RH-01 is listed with no severity because the owner withdrew it. Of the 551 done rows, 327 shipped in 4.6.0 and 224 ship in 4.6.1.

### Not done

- **RH-13 (release audit)**, P3: owner action: deleting other people's remote branches and worktrees and moving local `main`; read-only counts and steps in 8f7f440e2 (`evidence/audit-fix/e5/rh13-branches.md`)
- **IC-07 (Iron Crown)**, P2: needs a real-GPU check (`?vfx=on&vfxdebug=1`); the remote runner is software GL, so the override stays; owner runs `tools/real-gpu/run.sh`
- **IC-12 (Iron Crown)**, P3: needs new Meshy `animate` clips; no Meshy credentials in the lane environment and agents may not log in (owner action)
- **LIVE-1 (Aura Diamond 3D)**, P2: needs a 15-minute real-GPU session; the software-GL runner cannot reproduce a renderer crash (park-switch heap measured at 468 MB, no page errors)
- **SO-6 (Craterline GP)**, P2: the sentence is in the E5-owned `evidence/exposure-parity/README.md:42`, which still does not name Craterline GP or Ion Circuit; the handoff from G15 has not been applied
- **P-3 (Serpentine Sky Run)**, P3: the fix asks for a real-GPU re-judge first and the lane has only software GL; on software GL the runner crop is back at the 4.3.7 contrast (193.4 against 206.0)
- **WW-16 (The Bellkeeper's Walk)**, P3: the public `effects.bloom` options have no `scatter` field, so the replacement for `radius` cannot be authored; engine handoff to E2

### Withdrawn and not a defect

- **RH-01 (release audit)**, withdrawn: the owner wants the three.js comparison claims; fix 93f374ffd was reverted in 4c2f6b2a1
- **RH-02 (release audit)**, withdrawn: its fix 93f374ffd went out with the RH-01 revert (4c2f6b2a1); RESULTS.md stays the named comparison source by owner decision
- **IC-09 (Iron Crown)**, not a defect: `model(asset, { material })` lowers to `baseColorMultiply`, which keeps the base-colour textures; `setTint` is a legacy seam this path does not use (remote swatches keep belt, skin and face detail)
- **S-07 (Shadowstep Gauntlet)**, not a defect: the HDRI texture is a plain object, so the scene lights through the neutral room, which already counts the hemisphere; removing the light would remove fill (comment added in 4678c26df)

### Done in part

These rows count as done; the part named in the Status cell is still open (mostly owner-only real-GPU checks and handoffs to files lane E5 owns).

- **LIGHT-02 (release audit)**: no real-GPU capture, owner runs `tools/real-gpu/run.sh`
- **anim-phys-11 (release audit)**: the upper-body layer plays only with `?iclayer=1`; default playback is unchanged
- **RH-07 (release audit)**: the `kid-goku-beyond-the-clouds-port` folder rename is an open handoff to E5
- **RH-09 (release audit)**: the CHANGELOG states the gate result; editing the published GitHub release body is an owner action
- **RR-E5 (Apex Overdrive)**: speed gauge and distance bar added; light still does not follow time of day, the game does not yet call `app.lighting.setEnvironmentIntensity`, which E2 made live in 7e3b36b5d
- **DD-7 (Glint Courier)**: the CHANGELOG correction is an open handoff to E5
- **DD-10 (Glint Courier)**: the A/B proves the shadow map renders; `diagnostics().renderer.shadows` still reports `mapRendered:false`, open handoff to E3
- **C8 (Serpentine Sky Run)**: orbs, sparks and streaks are not instanced (custom GLSL has no per-instance matrix) and no KTX2 (no Basis encoder)
- **C12 (Gridlock Courier)**: the route-health `qualityGate` needs a human reviewer
- **HP-04 (Ion Circuit)**: the `evidence/exposure-parity/README.md:42` line is an open handoff to E5
- **S-01 (Shadowstep Gauntlet)**: the sky dome no longer casts; the shadow-fit opt-in stays (measured) and no real-GPU frame was taken
- **S-04 (Shadowstep Gauntlet)**: cache headers (`vercel.json`) are an open handoff to E5
- **E-03 (Shadowstep Gauntlet)**: a low-quality link, not an automatic switch; no real low-end GPU measured
- **C6 (Saltwind Highway)**: no person has listened to the new cues
- **C9 (Saltwind Highway)**: `tools/site/games.catalog.json` and `names.json` copy is an open handoff to E5
- **C11 (Saltwind Highway)**: `bloom.radius` stays because `effects.bloom` has no public `scatter` field (same as WW-16)
- **C12 (Duneglide)**: no real-GPU or phone profile
- **C14 (Duneglide)**: key remapping not added
- **CR-8 (Cumulus Dash)**: the example and evidence folder rename is an open handoff to E5

## Scoreboard

| # | Game | Slug | Health | P0 | P1 | P2 | P3 | Top issue |
|---|------|------|--------|----|----|----|----|-----------|
| 1 | Aura Slam 3D | top-tennis | degraded | 0 | 2 | 8 | 11 | All 24 spectators render white: `setInstances` without colours (spectators.ts:47-53) |
| 2 | Apex Overdrive | roadster-rush | degraded | 0 | 5 | 10 | 3 | Traffic and sky-car pools far smaller than the sim; lethal sky cars can be undrawn (main.ts:66-74) |
| 3 | Thermal Drift | heatsink | degraded | 0 | 8 | 10 | 6 | Race never finishes: lap counter wraps 3/3 to 1/3 (main.ts:1568) |
| 4 | Grid Dispatch | teleoperator | degraded | 0 | 6 | 14 | 4 | Pickup/dropoff fire in any lane at any speed (main.ts:2462) |
| 5 | Iron Crown | iron-crown | degraded | 0 | 2 | 7 | 9 | Touch Left/Right bound to non-existent actions (main.ts:313-314) |
| 6 | Pip's Big Leap | pips-big-leap | degraded | 1 | 1 | 11 | 11 | Hazard or boss hit locks Pip in `hurt` for good (player.ts:391) |
| 7 | Aura Hoops 3D | aura-hoops-3d | degraded | 1 | 7 | 9 | 6 | Touch controls mounted in a `display:none` container (index.html:761-763) |
| 8 | Aura Diamond 3D | aura-diamond-3d | broken | 1 | 4 | 11 | 7 | Every manual swing is a PERFECT home run, so innings never end (main.ts:2666-2675) |
| 9 | Aura FC 3D | aura-fc-3d | degraded | 1 | 9 | 12 | 5 | Touch Lab throws a TypeError every frame once the ball goes out (sim.ts:1246) |
| 10 | Aura Links 3D | aura-links-3d | broken | 1 | 6 | 6 | 9 | Swing auto-plays in every mode and putts never drop; holes cannot be finished (main.ts:1997-2017) |
| 11 | Bunker Zero | bunker-zero | degraded | 1 | 6 | 12 | 10 | Boss-summoned guards have no node; floor 6 logic freezes (sim.ts:586-595) |
| 12 | Slingshot Siege | slingshot-siege | degraded | 0 | 7 | 10 | 7 | R/P/M/Tab/Esc/Q never fire: input updated twice per frame (main.ts:1145) |
| 13 | Glint Courier | dot-dash-3d | degraded | 1 | 3 | 8 | 4 | Game-over card is never hidden; next run plays under it (hud.ts:255) |
| 14 | Cross Hop | cross-hop | degraded | 0 | 6 | 12 | 9 | Run coins never reset, so each death re-banks the session's coins (core.ts:206-220) |
| 15 | Craterline GP | strange-orbit-port | degraded | 0 | 1 | 5 | 11 | No touch or pointer controls (main.ts:123-136) |
| 16 | Chroma Roll | splat-rush-port | degraded | 0 | 3 | 8 | 7 | 4.5.0 regression: Meshy GLBs 39-50% darker after IBL loss (backdrop.ts:49-52) |
| 17 | Serpentine Sky Run | serpentine-sky-run-port | degraded | 0 | 2 | 7 | 8 | One GL error (0x502) latches renderFailed and freezes the session (main.ts:247-249) |
| 18 | Gridlock Courier | drift-and-deliver-port | degraded | 0 | 3 | 4 | 7 | No touch controls (main.ts:324-337) |
| 19 | Ion Circuit | heatsink-port | degraded | 0 | 3 | 8 | 8 | GO banner never clears and hides the objective line (race.ts:97-103) |
| 20 | Shadowstep Gauntlet | ninja-runner-port | good | 0 | 0 | 5 | 12 | 4.3.0 shadow-fit opt-in only to drop the sky dome (world.ts:218-219) |
| 21 | Lamplight Line | last-train-port | degraded | 0 | 4 | 10 | 5 | No touch controls (main.ts:229-245) |
| 22 | Saltwind Highway | roadster-hours-port | degraded | 0 | 2 | 7 | 5 | One tap of R recovers about 12 times (main.ts:85, sim.ts:303) |
| 23 | The Bellkeeper's Walk | where-the-wind-wanders-port | degraded | 0 | 2 | 6 | 10 | Live wrapper lacks the mobile HUD CSS; hint overlaps the HUD on phones |
| 24 | Duneglide | silt-and-signal-port | degraded | 1 | 4 | 7 | 6 | Touch has no `interact`, so chapter 0 cannot be completed on phones (main.ts:168-178) |
| 25 | Cumulus Dash | cloud-runner-port | degraded | 0 | 2 | 8 | 10 | Death on a rock or log soft-locks the run (game.ts:176-183) |

## Fix first

Ordered: P0 first (game cannot be played or finished), then the release P1, then game P1s grouped by how many players they reach (touch/mobile and run-ending bugs before scoring and cosmetic ones).

### P0

1. Aura Diamond 3D, C1: `triggerSwing` forces `timingErr 0` (main.ts:2666-2675). Grade the swing from the real timing error so manual at-bats can make outs.
2. Aura Links 3D, C1: gate the auto-swing at main.ts:1997-2017 on `autopilot`, size putts against the real green friction, and add a stroke cap.
3. Aura FC 3D, FC-01: Touch Lab sets `state.players = [me]` (sim.ts:1246). Guard team-1 lookups in `outOfBounds`/restarts or add a dummy keeper.
4. Bunker Zero, C1: give boss-summoned guards a scene node (or skip `app.nodes.require` for nodeless enemies) so floor 6 can be won.
5. Pip's Big Leap, C1: read `hurtTimer` and return Pip from `hurt` to `idle` when it expires (player.ts:115-117, 277-280).
6. Aura Hoops 3D, C1: show `#touch` on coarse-pointer devices (index.html:761-763 media query).
7. Duneglide, C1: add touch `interact` and brake buttons (main.ts:168-178).
8. Glint Courier, DD-1: hide `dd-gameover` in `closeOverlays` (hud.ts:118-123).

### Release P1

9. Engine, LIGHT-01: four lights-only ports lost the neutral-room IBL in 4.5.0 (renderer.ts:152 `implicitFill:false`). Measured on Chroma Roll (C1): towers 220 to 134 luma, islands 189 to 95. Add `environments.neutral({ intensity })` to heatsink-port, splat-rush-port, serpentine-sky-run-port (source in `examples/saiyan-snake-way-port`) and strange-orbit-port, calibrated to 4.3.7 captures.

### Game P1, controls and mobile

10. Iron Crown, IC-01: bind touch to `moveLeft`/`moveRight` (main.ts:313-314).
11. Aura FC 3D, FC-06: fix the `stick`/`leftStick` rect name (TouchControls.ts:177-183, TouchLayouts.ts:117).
12. No touch controls at all: Thermal Drift heatsink-C6, Grid Dispatch C3, Craterline GP SO-1, Gridlock Courier C1, Ion Circuit HP-03, Lamplight Line D-01, Saltwind Highway C2. Mount the engine touch preset for each.
13. Portrait framing: Aura Slam C2, Aura FC FC-09, Glint Courier DD-3, Slingshot Siege SS-7. Widen FOV or pull back the camera when aspect < 1.
14. Credit link over controls: Chroma Roll C3, Bellkeeper's Walk WW-2. Move the credit or the control and add `no-steer`.
15. Bellkeeper's Walk WW-1 and Duneglide C4: copy the example page's mobile/results CSS into the live `apps/*/index.html`.
16. Gridlock Courier C2: mount with `resize: true` (main.ts:456).
17. Slingshot Siege SS-1: remove the second `input.update(dt)` (main.ts:1145).
18. Saltwind Highway C1: make recover edge-triggered (main.ts:85).
19. Thermal Drift heatsink-C5: blur buttons after click and `preventDefault` Space.
20. Aura Hoops C2: consume `buffered()` presses (main.ts:1297).
21. Duneglide C2: stop treating `start=1` as QA mode on chapter reloads (main.ts:40).

### Game P1, runs that cannot end or freeze

22. Thermal Drift heatsink-C1/C2: finish after lap 3 with a results screen; let the player take damage.
23. Cumulus Dash CR-1: check `s.dead` after `worldPass` (game.ts:176-183). CR-2: reset pearls on "Run it again".
24. Gridlock Courier C3: add an end condition and results screen.
25. Glint Courier DD-2: add a win screen in `tickUI`.
26. Serpentine Sky Run C1: do not latch `renderFailed` on one GL error (main.ts:247-249); retry a frame first. C2: rename the hook and fix the specs.
27. Ion Circuit HP-01: clamp countdown to 0 and clear the GO banner (race.ts:97-103). HP-02: aim bolts at barrel height.
28. Lamplight Line D-02: let "keep riding" reset the attempt; D-03/D-04: per-service score and real rider counts.
29. Bunker Zero C2 (drain events by consumed index), C3/C4 (end screen, Kill House fail banner), C5 (per-weapon magazines), C6 (rockets damage only on hit or splash), C7 (doors block enemy sight).
30. Aura Diamond C2: match the stored "advanced" result (main.ts:1677). C3/C4/C5: crowd behind the fence, live wall collision, bind cap/belt handles.
31. Aura Links C2-C7: meter not auto-committed, putt reversal (sim.ts:491-501), reset `cam.mode` in `startHole`, persist the tour, pond radius from diameter, drop the 0.65 power floor.
32. Aura FC FC-02/03/04: per-side keeper dive, sudden-death reply, no steals from a holding keeper. FC-05: drop the double scale on the net. FC-07/08/10: kits, Player Studio, Favela walls.
33. Aura Hoops C3-C9: check-ball press, meter wrap, stale `flightT`, take-back rule, distinct team bodies, Player Studio.
34. Pip's Big Leap C2: strafe without the camera chasing yaw (player.ts:151-154).
35. Iron Crown IC-02: charge the player's special 100 meter (main.ts:853).
36. Apex Overdrive RR-1..RR-5: size pools to the sim, draw all gantries, remove `+ Math.PI` (main.ts:1393), draw nearest bolts first, unlock audio on first gesture.
37. Grid Dispatch C1, C2, C4, C5, C6: lane/speed gate on fares, shift road strips by `rx`, per-car camera offsets, peer/traffic lanes, remove the mindblown.ai toast and brand names.
38. Thermal Drift heatsink-C3/C4/C7/C8: real race position, scenery culling, projected lock bracket, mine/emitter in world space.
39. Slingshot Siege SS-2..SS-6: real mute, ammo dock index, reset materials on pooled blocks, pool of 83+ blocks, result-card listeners.
40. Cross Hop CH-1..CH-6: reset run coins, score only new best rows, drill spacing, tie warnings to trains, hitboxes to model size, `swapLook` on restart.
41. Chroma Roll C2: drain popups by id, not index (sim.ts:199, main.ts:91).
42. Duneglide C3/C5: chapter terrain height in the sim floor; journey-wide results.
43. Aura Slam C1: pass colours in `updateSpectators` (spectators.ts:47-53).
44. Glint Courier DD-4: retake card, poster and final screens from the current build.

## Cross-cutting issues

- **No or broken touch input.** No touch at all: heatsink, teleoperator, strange-orbit-port, drift-and-deliver-port, heatsink-port, last-train-port, roadster-hours-port. Touch present but broken: aura-hoops-3d (hidden), aura-fc-3d (stick never mounts), iron-crown (wrong action names), silt-and-signal-port (no interact). Missing touch pause: ninja-runner-port, pips-big-leap. A game-check that fails a game with keyboard-only gameplay input would catch all of these.
- **Portrait phones.** Fixed vertical FOV with no aspect compensation: top-tennis, aura-fc-3d, dot-dash-3d, slingshot-siege. Live wrappers missing mobile CSS that exists in the example page: where-the-wind-wanders-port, silt-and-signal-port.
- **"Built with Aura3D" credit link** (z-index 2147483000) sits over game controls: splat-rush-port (mute button), where-the-wind-wanders-port (joystick).
- **Missing end states.** heatsink (laps wrap), drift-and-deliver-port (no end), dot-dash-3d (no win screen), cloud-runner-port (death soft-lock), bunker-zero (floor 6 loop), last-train-port (keep riding stuck), aura-links-3d and aura-diamond-3d (holes and innings never finish).
- **Capped lists drained by index.** bunker-zero events (cap 40, drained by index) and splat-rush-port popups (cap 64) stop working once the cap is hit.
- **Node pools smaller than the simulation.** roadster-rush (traffic, sky cars, gantries, bolts), slingshot-siege (72 nodes for 83 pieces, stale pooled materials).
- **Fixed-per-frame input or dt.** Held-key reads where an edge is needed: roadster-hours-port (R), aura-hoops-3d (`buffered()`), slingshot-siege (double update). Fixed 1/60 per rendered frame: top-tennis.
- **Engine: 4.5.0 lighting changes unmeasured per game.** Only Diamond, Hoops (3 of 6 courts), Pip's, Glint Courier and Iron Crown Neo-Tokyo have steady-state 4.3.7-vs-4.5.0 luma. Lights-only IBL loss (LIGHT-01): four ports. Hemisphere now counted next to ambient (LIGHT-03): top-tennis, bunker-zero, aura-links-3d, dot-dash-3d (+18% measured). Runtime look swap keeps the fill (LIGHT-04): cross-hop.
- **Engine: authored hemisphere lights still dropped next to an environment (LIGHT-05)** in roadster-rush, heatsink, teleoperator, slingshot-siege, cloud-runner-port, drift-and-deliver-port, ninja-runner-port, silt-and-signal-port, aura-links-3d. Same as 4.3.7; the upgrade README says otherwise.
- **Engine: SSAO pass dropped for missing `ssao:normals`** on bunker-zero, dot-dash-3d, last-train-port, cloud-runner-port, so the 4.5.0 real-depth AO fix does nothing there while AO still costs the HDR chain.
- **Engine: fused bloom (`separable`, default on quality auto) never compared per game (RP-05).** Applies to the 20 bloom games.
- **Engine: instanced nodes pick one shadow cascade from the node centre (SI-1)**, so spread-out instances get no sun shadow. Measured on aura-links-3d conifers; also silt-and-signal-port, ninja-runner-port, cloud-runner-port, roadster-hours-port, cross-hop, last-train-port. Predates 4.5.0.
- **Stale evidence and posters (RH-05).** Every game's screens and index posters predate the 4.5.0 render changes; dot-dash-3d and aura-hoops-3d posters also predate gameplay or grounding fixes. 234 upgrade-guide checks are still open (RH-04).
- **Shared 2.6 MB asset catalog with 522 dead URLs (RH-06)** loaded by aura-links-3d, bunker-zero, heatsink, iron-crown, pips-big-leap, roadster-rush, slingshot-siege, teleoperator.
- **Third-party names in shipped bundles.** serpentine-sky-run-port (`saiyan-snake-way`), cloud-runner-port (`kid-goku`), teleoperator (mindblown.ai toast; Waymo/Tesla/SpaceX in package.json).
- **Audio not suspended on pause or hidden tab:** drift-and-deliver-port, ninja-runner-port, roadster-hours-port; roadster-rush first run silent; slingshot-siege mute does nothing.
- **Load size with no progress UI:** ninja-runner-port (26.75 MB, GLBs served max-age=0), where-the-wind-wanders-port (15.7 MB uncompressed GLBs).
- **Debug URL typos stop every game mounting (RP-04):** an invalid `?aura3d-render=` or `?aura3d-bloom-fusion=` throws inside mount on all 25 pages.
