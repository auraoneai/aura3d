# PRD-06 Q-14 queued requests — route changes for the six §17.4 games

`gh` is unauthenticated on lane VMs, so these are committed here as
ready-to-file issue bodies (same convention as `qr-requests-prd06.md`).
Suggested labels: `qr-request`, `to:prd14`. Each request ships with a
failing-control spec at `tests/qr/prd06/games/<name>.spec.ts` (S11): today
the flag-on test is `test.fail()` — remove the marker as each request lands.

## Q-14-1 — aura-clash-showcase: inertialized transitions, delete squash/idleSway, spring on accessory bones

**Filed:** #428 (`qr-request` + `to:prd14`).

Target: `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts`.

- `:3071-3090`: blend attack/hurt/KO in over 0.06 s with `transition:
  "inertialize"` instead of snapping.
- `:3173-3211` `syncFighterRoot`: delete the `squash` non-uniform scale and
  the `sin` `idleSway`. Replace with an additive breathing clip (authored or
  `makeClipAdditive` of `Idle_Loop` vs frame 0) on the upper-body mask.
- Bind the spring chain to spine/head or accessory bones
  (`fighterSecondaryMotion.ts`) instead of a root lean.

Failing control: `tests/qr/prd06/games/aura-clash-showcase.spec.ts` asserts
`tracksApplied > 0` every sampled frame on both fighters, uniform node scale
through a scripted `KeyJ` attack, and ≥ 1 masked/additive action during
idle.

## Q-14-2 — showcase-rooftop-buckets: mount the skinned athletes in normal play

**Filed:** #429 (`qr-request` + `to:prd14`).

Target: `apps/showcase-rooftop-buckets/src/main.ts:502-536`.

- Mount the skinned `rooftopDefender`/`rooftopLayupScorer` (191 joints,
  research/18 C10) as the visible athletes in normal play; today they mount
  only under `animationDebugCapture` with `visible: false` (`:514`, `:530`).
- Delete the static raised-pose statues and the root sways — shooter
  `Math.sin(elapsedPlayTime * 1.8) * 0.028` yaw (`:1118`) and defender
  `warmupSway = Math.sin(elapsedPlayTime * 1.4 + 0.8) * 0.022` (`:1321`).
- Drive Ready/Shoot/Land/Contest through `node.play` with crossfades.

Failing control: `rooftop-buckets.spec.ts` asserts `shooter-player-mesh` /
`contest-defender-mesh` are visible + socket-bound in normal play and the
shooter yaw is flat across pumped frames.

## Q-14-3 — showcase-skyline-runner: replace the 4-triangle card hero

**Filed:** #430 (`qr-request` + `to:prd14`).

Target: `apps/showcase-skyline-runner/src/main.ts:3416-3525`.

- Replace the card hero with a C-17-admitted rigged hero via
  `characterAnimation` bound to the existing `game.platformer` controller.
- Delete the procedural bob/lean/squash and the
  `skinnedClipPlaybackProvenAtRoot` workaround evidence (`:3616-3621`).
- Depends on Q-05-2 (C-17 admission of a hero asset).

Failing control: `skyline-runner.spec.ts` asserts
`skylineArcticRunner.glb` passes `hero-character` (rejected today with
`HERO_NOT_A_CHARACTER`, `HERO_NO_SKIN`, `HERO_TOO_FEW_JOINTS`,
`HERO_MISSING_CLIP`), the player node binds a skeleton, and
`tracksApplied > 0` during locomotion.

## Q-14-4 — showcase-neon-swarm: rigged hero, masked fire layer, delete the bob

**Filed:** #431 (`qr-request` + `to:prd14`).

Target: `apps/showcase-neon-swarm`.

- Replace `neonCourierAvatar` (no skin; `main.ts:688`) with a rigged hero
  playing run/strafe/fire/dash on masked layers (research/20 neon-swarm
  rec 4); depends on Q-05-2.
- Delete the `sin(t*9)*0.04` bob (`main.ts:1506`, research/09).

Failing control: `neon-swarm.spec.ts` asserts `neonCourierAvatar.glb`
passes `hero-character`, `neon-player` binds a skeleton, `activeActions`
span ≥ 2 masked layers while moving + firing, and `neon-courier-core-ring`
y stays flat across rendered frames.

## Q-14-5 — showcase-mech-hangar: rig mechs, footstep-event walk SFX

**Filed:** #432 (`qr-request` + `to:prd14`).

Target: `apps/showcase-mech-hangar`.

- Rig mechs (C-17 admission) or attach rigid parts to a skeleton with
  authored idle, walk, light, heavy, special, guard, hit-react and KO clips
  (research/20 mech-hangar rec 2).
- Sync walk SFX to clip footstep events instead of the `walkCueCooldown =
  0.42` timer (`main.ts:1550-1554`, research/09).

Failing control: `mech-hangar.spec.ts` asserts a socket-capable mech node
exists (bound skeleton) and reports `tracksApplied > 0`.

## Q-14-6 — showcase-gallery-shift: replace the voxel thief + T2.4 material route list

**Filed:** #433 (`qr-request` + `to:prd14`).

Target: `apps/showcase-gallery-shift`.

- Replace the 72-triangle voxel thief with a rigged character matching one
  guard style (research/21 gallery-shift rec 5); depends on Q-05-2.
- Make sprint and sneak distinct clips (or a 1-D blend with a crouch
  additive) — T0.17's gait spec already proves distinct hip heights under
  the lane flag.
- Carries the T2.4 list of routes using `SkinnedLitMaterial` /
  `MorphUnlitMaterial` (route material audit — every game route touching
  these materials opts into `A3D_QR_ANIMATION` or keeps the fork).

Failing control: `gallery-shift.spec.ts` asserts `socket("Hips").valid` and
`tracksApplied > 0` on the `thief` node (voxel thief has no skeleton today);
both guards' `tracksApplied > 0` asserted as the already-true companion leg.

## Q-14-7 — world-war-x-showcase: run the `.animate({clip})` codemod before opt-in

**Filed:** #434 (`qr-request` + `to:prd14`).

From §17.5: `WorldWarXApp.ts:1071` calls `.animate({ clip: "idle-ready",
speed: 0.44 })` on clips that do not match. Under the P1 default the speed
is honoured and a clip-name miss warns + no-ops instead of silently playing
the first clip — run the lane-14 codemod on this app before the route opts
into `A3D_QR_ANIMATION`.

## Q-14-8 — games.json: add T4.8 burst steps to the six §17.4 games

**Filed:** #435 (`qr-request` + `to:prd14`).

T4.8 shipped the C-33 step plugin `tools/quality-rebuild-capture/steps/
burst.mjs` (`{ "burst": { frames, intervalMs, region } }` → JPEG sequence +
per-frame `diagnostics().animation` JSON via `__AURA3D_LIVE_APPS__`, the
same read `capture-games.mjs:371` uses). Add `burst` steps to the six §17.4
games in `games.json` (owner 14) so the capture lane produces the
150-frame character bursts the game reviews need. Lane 06 passes the step
inline for lane runs meanwhile.
