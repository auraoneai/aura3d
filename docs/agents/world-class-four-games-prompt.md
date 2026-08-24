# World-Class Four Games Prompt

Copy everything below the horizontal rule into an AI coding agent. The agent must
upgrade the **existing** Neon Corridor Strike, Turbo Drift Circuit, Skyline
Runner, and Aura Clash routes — not scaffold replacements.

This prompt supersedes `docs/agents/world-class-showcase-games-prompt.md` for
the four-title pass. The older file remains as the three-title historical
mission. Use **this** file when Corridor Strike is in scope.

**Capability labels stay honest.**

| Game | Current label | Do not promote to |
| --- | --- | --- |
| Neon Corridor Strike | `prototype` | reusable shooter kit, DOOM parity, flagship FPS |
| Turbo Drift Circuit | `createAuraApp` / `prototype-blocked` until human visual review | Gran Turismo / Forza / Mario Kart parity |
| Skyline Runner | `createAuraApp` / `prototype-blocked` until human visual review | Celeste / Hollow Knight / Super Mario parity |
| Aura Clash | `production-runtime` / `development showcase` | Street Fighter / Tekken kit, commercial fighter |

**Do not claim** “world-class,” “flagship quality,” AAA, photoreal, Unity/Unreal
replacement, or genre-parity in README, route-health, marketing, or public copy.
“World class” in this prompt is the **internal player-experience target**, not a
public claim.

---

# Mission

Take the four playable 3D games that already exist in this repo and make them
feel like the best browser games a player would actually choose to keep playing
— visually and as gameplay — **from where they are right now**.

Do not start over. Do not swap the genre. Do not replace certified geometry
contracts, typed primary assets, evidence objects, or control bindings unless a
named blocker forces a replacement and you re-prove the whole route.

The current games already have real loops. They do not yet have commercial game
feel across **all four**: authored lighting hierarchy, readable hero subjects,
ceremony, juice, audio, player-facing HUD, dramatic AI, and a first-load
screenshot that looks like a game poster instead of an evidence harness.

Work all four. Do not finish one and stop.

| Game | Live route | Source | Current class |
| --- | --- | --- | --- |
| Neon Corridor Strike | `/examples/neon-corridor-strike/` | `examples/neon-corridor-strike/` | `prototype` FPS. No `game.shooter()` kit. Hitscan via `app.physics.queries.raycast`. |
| Turbo Drift Circuit | `/apps/showcase-turbo-drift-circuit/` | `apps/showcase-turbo-drift-circuit/` | `prototype-blocked` arcade racer |
| Skyline Runner | `/apps/showcase-skyline-runner/` | `apps/showcase-skyline-runner/` | `prototype-blocked` five-act platformer |
| Aura Clash Arena | `/showcase/aura-clash/playable/` | `apps/aura-clash-showcase/` | `development showcase` 2.5D fighter |

Canonical production site: `https://aura3d.auraone.ai` (Vercel project
`marketing`). Gallery cards live on `/apps/showcase-index/`.

---

# Phase 0 — Read before writing code

Read in this order. Do not skip tiers 1–3.

## Tier 0 — Non-markdown entry points

| File | Why |
| --- | --- |
| `llms.txt` | Canonical agent API, assets, anti-patterns. Read before any `.md`. |
| `.cursor/rules/aura3d.mdc` | Same hard constraints in IDE context. |
| `AGENTS.md` | Repo map. |
| `apps/AGENTS.md` | Showcase app conventions. |
| `examples/AGENTS.md` | Public example conventions (Corridor Strike lives here). |

Do **not** use frozen copies under `benchmark/context/aura3d/files/`.

## Tier 1 — Mandatory agent docs

| File | Purpose |
| --- | --- |
| `docs/agents/claims-and-boundaries.md` | Claim labels. Do not leak production-runtime into Turbo / Skyline / Corridor root claims. |
| `docs/agents/no-hackjob-rules.md` | No CSS fake 3D, no loader hacks, no workaround slop. |
| `docs/agents/anti-hallucination-rules.md` | No invented assets or APIs. There is no `game.shooter()`. |
| `docs/agents/game-example-standards.md` | Public game bar: input, objective, reset, tests, session length. |
| `docs/agents/cinematic-scene-quality.md` | Lighting, camera, atmosphere ladder. Aim for L3 realtime cinematic. |
| `docs/agents/game-showcase-build.md` | **Required for Aura Clash.** Do not break its proof contract. |
| `docs/agents/asset-workflow.md` | CLI add / resolve / validate / typegen. |
| `docs/agents/asset-selection.md` | Catalog search. Use this before keeping a bad GLB. |
| `docs/agents/rendering-proof-required.md` | When pixel proof is mandatory. |
| `docs/agents/verification.md` | Evidence commands. |

## Tier 2 — Game and visual standards

| File | Purpose |
| --- | --- |
| `docs/guides/build-a-browser-game.md` | End-to-end game walkthrough. |
| `docs/api/game-runtime.md` | `game.input`, kits, `cameraDirector`, `effects`, HUD, accessibility. |
| `docs/api/app-api.md` | `createAuraApp`, frame loop, nodes. |
| `docs/concepts/physics.md` | `app.physics` raycast / bodies. Corridor fire lives here. |
| `docs/project/showcase/visual-quality-standard.md` | **The public visual bar.** Racing + platformer sections are the floor. |
| `docs/project/showcase/quality-gates.md` | What “release-ready candidate” actually requires. |
| `docs/project/showcase/apps-classification.md` | Current labels. Do not silently promote. |
| `docs/project/status/known-limits.md` | What root `createAuraApp` does **not** prove. |
| `docs/examples/aura-clash.md` | Clash claim boundary. |
| `examples/neon-corridor-strike/FPS-BAR.md` | **Binding FPS law.** Treat as constraints, not inspiration. |
| `examples/neon-corridor-strike/KNOWN-LIMITS.md` | Current honest FPS limits. Update if you close one. |

## Tier 3 — Current source (read the real games, not the READMEs only)

### Neon Corridor Strike

| Path | Why |
| --- | --- |
| `examples/neon-corridor-strike/src/main.ts` | Scene, follow camera, fire, walk lock, evidence. |
| `examples/neon-corridor-strike/src/game/level.ts` | Corridor, rifle, pickups, **build-time tracer box scale**. |
| `examples/neon-corridor-strike/src/game/shot-fx.ts` | Barrel spark + traveling bolt + authored tracer. |
| `examples/neon-corridor-strike/src/game/enemies.ts` | Capsule Y vs visual Y. Do not copy capsule Y onto the mesh. |
| `examples/neon-corridor-strike/src/game/player.ts` | Walk height lock. |
| `examples/neon-corridor-strike/src/game/weapons.ts` | Hitscan + mag. |
| `examples/neon-corridor-strike/src/game/hud.ts` | DOM HUD. UI only. |
| `examples/neon-corridor-strike/src/game/state.ts` | Run state. |
| `examples/neon-corridor-strike/README.md` | Current honest claims. |
| `tests/browser/neon-corridor-strike.spec.ts` | Playable evidence. Pickups have historically failed. |
| `tests/browser/neon-corridor-strike-shot-visual.spec.ts` | Fire must be a beam leaving the barrel, not a parked blob. |

### Turbo Drift Circuit

| Path | Why |
| --- | --- |
| `apps/showcase-turbo-drift-circuit/src/main.ts` | Scene, chase camera, Rapier contact, HUD, evidence. |
| `apps/showcase-turbo-drift-circuit/src/feel.ts` | Start lights, gap, position, HUD status. Already exists — raise the bar, do not delete. |
| `apps/showcase-turbo-drift-circuit/src/hud.ts` | Player HUD vs `?debug=1`. |
| `apps/showcase-turbo-drift-circuit/src/opponent-ai.ts` | Route-local rival. `step(dt, playerProgress)` is required. |
| `apps/showcase-turbo-drift-circuit/src/passing-lane.ts` | On-asphalt pass contract. Do not break. |
| `apps/showcase-turbo-drift-circuit/src/race-proof.ts` | Duration proof. Publishes `provesMountedKitPlayback: false`. |
| `apps/showcase-turbo-drift-circuit/src/generated/game-geometry.ts` | Certified topology. Do not hand-edit. |
| `apps/showcase-turbo-drift-circuit/README.md` | Current honest claims. |

### Skyline Runner

| Path | Why |
| --- | --- |
| `apps/showcase-skyline-runner/src/main.ts` | Scene, camera, sentries, HUD, evidence. |
| `apps/showcase-skyline-runner/src/hud.ts` | Player HUD vs debug. Act title already exists. |
| `apps/showcase-skyline-runner/src/level.ts` | Single level owner. Jump/motion lives here. |
| `apps/showcase-skyline-runner/src/level-layout.ts` | Five-act / ten-district story. |
| `apps/showcase-skyline-runner/src/runner-challenge.ts` | Route-local flow/score. |
| `apps/showcase-skyline-runner/src/level-proof.ts` | 70–115s window proof. |
| `apps/showcase-skyline-runner/src/generated/game-geometry.ts` | Mesh-derived surfaces. Do not hand-edit. |
| `apps/showcase-skyline-runner/README.md` | Current honest claims. |

### Aura Clash

| Path | Why |
| --- | --- |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Full fight loop. Hit-stop already exists — raise the picture, do not delete. |
| `apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts` | Frame data. Do not invert startup/active/recovery again. |
| `apps/aura-clash-showcase/src/playable/combat/clashFeel.ts` | Presentation hit-stop window. |
| `apps/aura-clash-showcase/src/playable/combat/AuraClashFighterController.ts` | Controller boundary. |
| `apps/aura-clash-showcase/src/playable/arena/AuraClashArenaStage.ts` | Stage. |
| `apps/aura-clash-showcase/src/playable/animation/auraClashClipMaps.ts` | Clip readiness. |
| `apps/aura-clash-showcase/src/playable/audio/auraClashAudioManifest.ts` | Existing SFX. Extend, do not discard. |
| `apps/aura-clash-showcase/src/playable/playable.css` | Current fight HUD. |
| `apps/aura-clash-showcase/src/fighters/` | Combo / guard-break / knockdown. |
| `docs/agents/game-showcase-build.md` | Required controls + proof object. |

---

# Phase 1 — Honest current baseline

Play each game locally before changing it. The upgrades below are written
against **August 2026 source**. If source has moved, update the baseline in
your summary — do not invent a worse past.

## What is already good (keep it)

**Neon Corridor Strike**

- Typed corridor, pulse rifle, two catalog creatures, ammo crate, medkit
  stand-in. CLI provenance in `aura.assets.json`.
- Hitscan via `app.physics.queries.raycast`. Fire on **J / F / FIRE button /
  `window.__AURA3D_FPS_SHOOT__`**. Mouse is look, not the only fire path.
- Walk Y locked (`WALK_Y = 0.9`). Viewmodel yaw-only. Look-target **must stay
  visible** (tiny scale) with offset `[0, 0.12, LOOK_AHEAD]` and
  `offsetMode: "target-yaw"`.
- Shot FX: `muzzle-0` barrel spark, `muzzle-1` traveling bolt, `muzzle-2`
  authored **box tracer** with **build-time** scale `[0.05, 0.05, 1.7]`,
  `shot-impact` at the far end. This replaced the parked yellow blob.
- Enemies: capsule at `ENEMY_BODY_Y = 0.72`, mesh at `ENEMY_VISUAL_Y = -0.45`
  to bury catalog white pedestals. Do **not** copy capsule Y onto the GLB.
- Pause `P`, reload `R`, reset `T`, clear-four or exit-sensor win, HP fail.
- Label stays `prototype`. There is no shooter kit to invent.

**Turbo Drift Circuit**

- Four-lap arcade race on typed Tsukuba + typed red Formula player + distinct
  typed blue/black rival.
- Chase camera from `resolveChaseFraming` / `game.racingCameraRig`.
- Manual throttle / brake / steer / drift. Ordered gates. Off-track recovery.
  `R` reset. `P` / `Esc` pause.
- Rapier owns solid vehicle contact. SAT clamps only the player's commanded
  target. Opponent `onRoad` is body-on-asphalt, not kerbs.
- Visual asphalt is wide enough to pass the rival on tarmac.
- Player HUD already exists: speed, lap, gate, gap, P1/P2, last/best lap,
  start lights, result card. Debug telemetry is behind `?debug=1`.
- Start-lights ceremony already exists in `feel.ts`. Do not delete it.

**Skyline Runner**

- Original five-act Level 1: Home Grove → Broken Canopy → Sentry Pass →
  Cloudstep Rise → Aurora Crown. Authored 95s, finish window 70–115s.
- Typed Kenney Oobi hero + typed verdant world. Mesh-derived playable surfaces.
- Move, variable jump, coyote, dash, fall, checkpoint respawn, coins, ember
  volleys (`J` / `L`), stompable typed robot sentries, finish beacon.
- Player HUD already exists: score, coins, ember, lives, act title, checkpoint
  pips. Debug `x` / surface / flow is behind `?debug=1`.
- Act title card CSS already exists. Drive it; do not rebuild a second HUD.

**Aura Clash**

- Playable 2.5D arena fighter with two distinct typed Quaternius rigs, neon
  downtown/rooftop stage, AI rival, meter, KO lock, rematch.
- Full control surface: A/D, S, Space, Shift, Q, J/K/L, P, R.
- Real clip maps, hit windows, combo / guard-break / knockdown helpers, SFX
  manifest, accessibility route, `window.__AURA_CLASH_ARENA_PROOF__`.
- Presentation hit-stop already exists in `clashFeel.ts` / `AuraClashArenaApp`.
  Raise the *picture* around it. Do not invent a second combat clock.
- Uses `production-runtime` + `A3DRenderer`. That is allowed **only** on this
  app. Do not copy those imports into Turbo, Skyline, or Corridor Strike.

## What is not world-class yet (this is the work)

Shared:

- First-load composition is technically readable but not poster-grade on all
  four. Lighting is competent, not authored as a mood.
- Audio is thin or missing on Corridor / Turbo / Skyline. Clash has a
  manifest — match that discipline everywhere.
- Juice is thin: little camera punch, little impact freeze, little readable
  VFX that a stranger would call a *game moment*.
- Independent visual review is pending / stale. Screenshots must be regenerated
  from the final source, then left for a human. You cannot self-approve.
- Public copy must stay at the current capability labels.

Corridor-specific gaps (largest visual debt):

- Catalog imps still read as floating horror toys on buried white shards, not
  corridor demons. If the GLB cannot look like a character after sink/scale,
  CLI-resolve a better pair (`assets search` + `--profile` if needed) and
  re-bind. Do not primitive-build enemies.
- Shot FX is a spark + box tracer + traveling sphere. It is **verified** as
  “a beam leaves the barrel,” not as a rifle you would screenshot for a
  trailer. Upgrade with public `particles.*` / `lights` / `game.effects` **in
  addition to** the authored tracer. Do not delete the tracer until the new
  FX is Playwright-proven in `neon-corridor-strike-shot-visual.spec.ts`.
- Corridor lighting is fill, not a neon-horror set. Need key / rim /
  practical rails that read in a first-load still.
- Enemy AI is distance patrol / aggro / chase. No telegraph, no flinch, no
  death weight (hide is not a death).
- HUD is a readable prototype card, not a modern FPS chrome (HP bar, mag
  pips, hit marker that is DOM-UI only, objective pip).
- Pickup walk path vs crate at `(1.8, 3.4)` has historically failed the
  playable spec (`picked?.pickups` stayed 0). Fix the path or the crate, then
  keep the spec green.
- No music, no fire crack, no hit flesh, no reload, no low-ammo tick.
- Jump is **not** a supported mechanic. Do not advertise Space-jump.

Turbo-specific gaps (ceremony exists; race drama does not):

- Rival is deterministic and passable, but does not create late-race drama
  (defend, dive, mistake, recover).
- Drift is a held modifier + ribbon boxes, not a committed slide with risk,
  score, or readable tyre smoke in the **scene**.
- No engine / tyre / wind / crowd / checkpoint audio.
- Night or dusk mood is unused. The circuit can look like a postcard and
  currently looks like a daylight proof.
- Finish camera / hero 3/4 shot is incomplete as a *moment*.

Skyline-specific gaps (HUD exists; places do not):

- Acts exist in data and a title card; they barely exist as *places*.
  Lighting, palette, and fog should change per act in the **scene**.
- Sentries patrol; they do not telegraph, idle, or die with weight.
- Ember volley is a mechanic. Muzzle / travel / impact / deny still need
  to read in pixels.
- Summit beacon is still closer to a totem than a destination.
- No audio. No land-dust, coin chime, checkpoint fanfare, death sting,
  summit theme.
- Secrets / optional height / risk-reward ledges are thin for a 95s Level 1.

Clash-specific gaps (hit-stop exists; the show does not):

- Starter-grade fighters and a single stage. Visual approval is still pending.
- Hits need readable pop that a still frame proves: renderer-owned spark,
  victim flash that is not a CSS overlay pretending to be light, KO that
  ends the round like a show.
- HUD/chrome can still read as a development overlay.
- AI pressures; it does not yet have roles (rushdown, keep-away, punish
  whiffs, respect meaty).
- Training / frame-data debug must stay behind an explicit debug mode.
- Do not add a third fighter or a new stage until the current pair + current
  arena look and play at the target bar.

---

# Phase 2 — What “world class” means in this repo

A player who has never read a README should, within 3 seconds:

1. Know what game this is (FPS / racer / platformer / fighter).
2. See a hero that is the subject of the frame (rifle+corridor, car, runner,
   two fighters).
3. Want to press a key.

After 60 seconds they should have had a complete emotional loop: tension,
a mistake, a recovery, a reward, a finish or a rematch they choose to take.

## Visual bar (all four)

Treat `docs/project/showcase/visual-quality-standard.md` as the **floor**.
The target is a poster you would put on the homepage without apology.

- Hero readable in 3 seconds on desktop and 390px mobile.
- Lighting has intent: key, fill, rim, practical. Not “studio + one point.”
- Materials contrast: steel corridor vs neon rails vs rifle; painted bodywork
  vs asphalt vs grass; foliage vs sky shards vs metal sentries; skin/cloth vs
  neon wet rooftop.
- Atmosphere is in the **scene** (`effects.fog`, `game.effects`, `particles`,
  lights). DOM/CSS is UI only. No fake bloom, trails, explosions, muzzle
  flashes, or scanlines in CSS.
- No debug locators, hitboxes, giant proof disks, or evidence JSON on the
  public play surface.
- HUD is a game HUD: compact, aligned, no overflow, never covering the hero
  evidence region. Evidence/debug folds behind `?debug=1` or a toggle.
- First-load screenshot should look like a key art still, not a unit-test
  staging view.

Use public helpers that already exist:

```ts
game.cameraDirector(...)
game.effects(...)
game.hud.bindings([...])
game.accessibility.reducedMotion(...)
effects.fog(...)
effects.ambientOcclusion(...)
effects.neonBloom(...)   // only at intensities that do not wash the hero
particles.*              // only if the route already imports public particles
environments.studio(...) // Turbo already uses this; do not overclaim IBL
```

Do **not** claim bloom, SSAO, HDR, shadows, or WebGPU in copy unless that
exact route’s screenshots + diagnostics prove it. Turbo, Skyline, and
Corridor may *use* bounded root effects; they may not advertise a production
post stack.

## Gameplay bar (all four)

- Input has weight: acceleration, release, coyote, buffer, recovery. Instant
  on/off digital snapping is the current floor, not the target.
- Every important action has a readable start, contact, and recovery
  (fire, reload, throttle, drift, jump, dash, ember, light, heavy, special, KO).
- Camera is a performer: chase lean, land dip, hit punch, finish push-in,
  fire kick. `game.accessibility.reducedMotion` disables shake.
- Audio is part of feel. Register every loop/SFX through the CLI
  (`assets add ... --type audio`) and typed `assets.*`. Clash already has a
  manifest — match that discipline on the other three.
- Fail states are fair and fast to retry. Reset is instant and complete.
- Pause exists and actually freezes simulation, AI, and combat.
- Touch controls stay bound where the route already has them.
- Session length stays at or above the current authored bars (Corridor a
  full clear, Turbo four laps, Skyline 70–115s, Clash a full round to KO).
  Do not shorten to make polish easier.

## Honesty bar

Allowed internal language: “player-facing quality pass,” “cinematic
presentation,” “arcade feel,” “prototype FPS with stronger juice,”
“development showcase with stronger juice.”

Forbidden public language: world-class, flagship, AAA, photoreal, physical
tyre model, production fighting kit, production shooter kit, DOOM-quality,
Celeste-quality, Street Fighter-quality.

Keep READMEs and route-health at the current capability labels. If you close
every mechanical blocker, you still do **not** flip classification to
`release-ready candidate`. A named human reviewer does that.

---

# Phase 3 — Per-game upgrade spec

Do the work in-place. Preserve evidence globals, geometry hashes, and
control bindings unless you extend them and update tests in the same change.

## A. Neon Corridor Strike — a corridor you fight in, not a raycast harness

**Keep:** typed assets unless a named GLB is visually broken; hitscan; J/F/FIRE
/`__AURA3D_FPS_SHOOT__`; walk-Y lock; visible look-target; `ENEMY_BODY_Y` vs
`ENEMY_VISUAL_Y`; pause / reload / reset; `prototype` label; shot-visual spec
intent (beam leaves the barrel).

**Visual target**

- First frame is a DOOM-adjacent poster: dark corridor receding, neon floor
  rails as practicals, pulse rifle readable in the lower-right third, at
  least one hostile silhouette in depth. Not a white slab. Not a yellow
  cube stack. Not an empty tunnel.
- Rifle is the hero weapon. If the current catalog rifle reads as a toy or
  a brick, CLI-search `sci-fi pulse rifle first person viewmodel` and
  resolve a better CC0/CC-BY match. Re-bind `assets.pulseRifle`. Do not
  primitive-build a gun.
- Hostiles must read as creatures, not shards on a buried pedestal. Prefer
  a catalog swap over more Y-sinking. After any swap, re-tune
  `ENEMY_VISUAL_Y` so feet meet the floor and white bases stay buried.
- Shot must read in a mid-combat still:
  1. spark on the muzzle,
  2. a thin beam **leaving the barrel** along the hitscan,
  3. a traveling bolt,
  4. an impact at the far end.
  Public `particles.*` / a short point light at the barrel are allowed
  **additions**. They do not replace the authored tracer until the
  shot-visual spec is green with the new FX.
- Lighting: warm-cool contrast. Cyan rails, amber hazard, dim key from
  ahead, rim on the rifle. Fog in the **scene**. No CSS glow.
- HUD: HP bar, mag `11/12`, hostiles remaining, objective. Crosshair stays
  DOM. Hit marker is DOM. Muzzle is **never** DOM.
- Win / death banners stay UI. The 3D scene must still show why you won
  or died (empty corridor vs standing hostiles).

**Gameplay target**

- Fire has a start, a contact, and a recovery: muzzle, tracer, impact,
  mag decrement, optional light kick. Empty mag is a deny click, not
  silence. Reload is audible and blocks fire for a short authored window.
- Hostiles telegraph 0.35–0.55s before a touch-damage frame. On hit they
  flinch (scale or recoil on the visual node — not the capsule Y). On
  death they drop or crumple for ≥0.25s, then hide. Instant `visible =
  false` is the current floor, not the target.
- Two behaviors is enough: patrol and rush. Do not add Recast. Do not
  claim navmesh.
- Pickups must be reachable on the walk path the playable spec uses.
  If `picked?.pickups` is 0, the crate is in the wrong place or the
  trigger is wrong — fix it, do not skip the spec.
- Low ammo and low HP change the HUD and a warn sting. They do not
  change the claim label.
- Pause freezes hostiles, fire, and the shot clock. Reset restores HP,
  mag, hostiles, pickups, camera, FX parked under the floor.

**Burned FPS lessons — treat as law**

These already shipped as bugs. Reproducing them is a fail, even if the
new idea “looks cooler” in your head.

1. **Do not hide the look-target.** A hidden / `visible: false` look
   target made the follow camera face the wrong way and produced the
   white-slab screenshot.
2. **Do not copy enemy capsule Y onto the GLB.** Capsule sits at
   `0.72`; mesh sits at `-0.45` to bury catalog pedestals. Copying
   capsule Y floated creatures on white shards.
3. **Do not prove fire with HUD text** (“SHOT”). Screenshots of a
   label are not gunfire.
4. **Do not fire a long tracer through the camera.** That became a
   white plane filling the lens.
5. **Do not stack cubes / spheres along the aim line at the barrel.**
   That became the parked yellow blob / cube stack at the exit.
6. **Do not rely on runtime `setScale([x,y,z])` on a primitive that
   was authored as a tiny scalar.** Vector scale on those nodes did
   not reliably render. The tracer box works because its vector scale
   is set **at build time** in `level.ts`; runtime only moves/rotates
   it. If you add a new tracer primitive, author its scale in the
   scene descriptor.
7. **Do not use CSS / canvas flashes** as muzzle, tracer, impact, or
   lighting.
8. **Do not import `three`, `GLTFLoader`, or `@aura3d/engine/controls`
   `PointerLockControls`.** This route uses `game.input` pointer
   deltas plus document pointer lock on the `createAuraApp` canvas.
9. **Do not invent `game.shooter()`.** Combat is authored on Rapier
   raycast. Document that as route-local.
10. **Do not unlock walk Y or advertise jump.** Jump is not a
    supported mechanic on this route.

**Do not**

- Claim DOOM parity, a reusable FPS kit, bloom/SSAO/WebGPU, skinned
  death clips, or projectile physics.
- Move the example under `apps/` or rebuild it as a showcase app in
  this pass.
- Delete `tests/browser/neon-corridor-strike-shot-visual.spec.ts`.
  Extend it if FX IDs change.

## B. Turbo Drift Circuit — arcade race, not a driving proof

**Keep:** typed cars, Tsukuba topology, four laps, six gates, Rapier
contact, on-asphalt passing, chase framing, drift input, start lights,
player HUD, result card, `R` reset, `window` evidence object,
`passing-lane.ts` contracts.

**Visual target**

- First frame is a grid poster: both cars on the start straight, circuit
  receding, horizon graded, hero car 18–24% of frame height. Compose
  lighting and atmosphere to match the framing you already have.
- Mood pass: keep daylight as the default, but author it like late
  afternoon at a real circuit — warmer key, cooler distant fog, practical
  start-light glow. If shadows are not root-proven on this route, do not
  fake them with dark boxes.
- Drift must read in pixels: ribbons already exist — add `game.effects`
  / `particles` tyre smoke / dust only while drifting and only on
  asphalt. Hide them in reduced motion.
- Finish: camera eases to a 3/4 hero shot, rival still on track, HUD
  already has a result card — make the *camera and lighting* match it.

**Gameplay target**

- Start lights already exist. Protect `countdownBeforeMotion`. Jumping
  the lights stays a small time penalty.
- Race, not ghost-train: rival uses the existing `createTurboOpponentAi`
  + `createVehicleDriverAi`. Add late-race behavior *inside that
  module*: defend the inside when the player is close, leave a passing
  lane when yielded, small speed error after a missed apex so a human
  can create a pass. Keep it deterministic enough for tests (seeded or
  snapshot-driven).
- Drift is a commitment: hold Space/Shift to break traction, lose some
  forward speed, gain yaw, leave marks. Reward a clean drift through a
  hairpin with a short burst (arcade nitro), not a physics tyre model.
- Off-track is a *feeling*: grass slowdown, camera nudge, audio change,
  recovery assist that is visible as “Off track” not “Edge assist.”
- Pause on `P` / `Esc`. Reset on `R` restores lights, laps, rival,
  camera, audio.
- Optional second mode only if the primary race is already better: a
  time-trial ghost of the player’s last finish. Do not add weather,
  damage, pits, or a second circuit in this pass.

**Do not**

- Claim physical tyres, drivetrain, suspension, or motorsport simulation.
- Shrink the cars or widen the road with a one-off scale hack that fights
  `gameGeometryContract`.
- Replace Tsukuba or the Formula pair unless an asset is broken; if you
  must swap, CLI-resolve, re-bind topology, and re-prove passing + contact.

## C. Skyline Runner — a place you run through, not a strip you prove

**Keep:** five acts, ten districts, 95s authored / 70–115s finish window,
typed hero + world, mesh surfaces, coins, ember volleys, sentries, dash,
coyote, checkpoints, player HUD, act title card, `createSkylineLevel()`
as the single level owner.

**Visual target**

- Each act has a readable palette shift in the **scene**: sky ramp, key
  color, fog color/density, practical lights. Home Grove is warm
  gold-green; Sentry Pass is colder steel; Aurora Crown is dusk
  magenta/teal. Use `blendSkyBandColor` / `planSkyBackdrop` already
  imported — drive them from act, not one static look.
- Sentries face the player, play a visible idle, and have a defeat that
  is more than `visible = false`: hide + `game.effects` burst + audio +
  score pop. Collision boxes stay smaller than the visual silhouette
  (already tuned — do not grow them).
- Summit beacon: replace the stacked primitive monument with a typed
  prop if the catalog has a clean CC0/CC-BY beacon/obelisk/lantern that
  fits the verdant world. If not, keep primitives but make one designed
  silhouette (plinth + mast + emissive core) and light it like a goal,
  not a debug totem.
- Collectibles must glitter in the scene (emissive / `game.effects`
  sparkle), not only increment a counter.
- Camera: keep the current readability band. Add a short land dip and a
  dash punch via `game.cameraDirector`. No zoom that turns the hero into
  a mascot.

**Gameplay target**

- Jump feel is already the kit’s variable jump — protect it. Add land
  recovery dust and a tighter coyote/buffer only if tests still finish
  inside 70–115s.
- Ember volley should feel like a tool: muzzle flash in-scene, travel,
  impact on sentry, one-shot defeat, limited stock. Empty stock has a
  deny sound (ember-deny CSS already exists — pair it with audio + a
  scene deny, not CSS-only).
- Sentries telegraph a 0.4–0.6s tell before the intercept frame so a
  jump or volley is a read, not a surprise overlap.
- Checkpoints are story beats: brief act title card (already in CSS),
  checkpoint chime, optional warm light pulse on the relay.
- Optional risk/reward: one high coin path per act that costs a harder
  jump. Do not add a second level.
- Death is fast: sting, respawn at last relay, camera already framed.
  Do not add a long animation that blows the 115s window.
- Pause on `P`. Reset on `R` restores act 1, coins, ember, deaths,
  sentries.

**Do not**

- Break the 70–115s completion window. If polish slows the route, retune
  spacing in `level.ts` / `level-layout.ts` and re-run
  `src/level-proof.ts` + the mounted Playwright finish.
- Author new playable rectangles that fight the mesh-derived surface map.
- Use a primitive as the hero or the world.

## D. Aura Clash — a fight you feel, not a combat harness

**Keep:** both typed rigs, current arena, move table, clip maps, audio
manifest, proof object, KO lock, rematch, existing hit-stop, accessibility
routes, package import boundary (`@aura3d/engine/production-runtime` is
OK **here only**).

**Visual target**

- First frame is a fight poster: two silhouettes, readable faces/hood,
  neon practicals, grounded floor, no debug volumes.
- HUD is a fighter HUD: names, HP bars, meter, timer, combo count, round
  marks. Training numbers and proof JSON stay on `/evidence/` or
  `?debug=1`.
- Hits change the *picture*: existing hit-stop (2–8 frames by move
  strength) plus camera punch, renderer-owned spark/impact
  (`game.effects` or the existing hit-spark path), brief victim flash
  that is not a CSS overlay pretending to be light.
- Special (L) is the showpiece: readable startup, distinct silhouette,
  screen freeze, unique SFX already in the manifest.
- KO: inert hitboxes (already required), camera push-in, loser down clip
  once, winner idle, result card. No looping combat.
- Hide hitboxes in normal play. This is already a rule — verify it still
  holds after VFX work.

**Gameplay target**

- Frame data stays fighting-game shaped: short active, real recovery,
  punish windows. Read `auraClashMoveData.ts` comments before touching
  numbers.
- Combos: light can cancel into heavy on hit if `canCancelCombo` says
  so; heavy does not combo into itself for free. Special spends meter
  and is a mixer, not a safer jab.
- Guard is a game: chip or guard-break via existing
  `defaultGuardBreakRules`. Blocking must look and sound different from
  getting hit.
- AI roles inside the current rival: approach, space, punish whiff,
  respect meaty wakeup. Keep it deterministic for replay tests.
- Input buffer already exists — make it feel like a fighter (6–8f
  buffer), not a platformer (120ms is fine for Skyline, tight for Clash).
- Pause freezes both fighters, AI, timer, and hitboxes. Reset restores
  HP, meter, positions, clips, combo, and audio state.

**Do not**

- Import `three` or write a second renderer.
- Add roster characters or a second stage in this pass.
- Call it a reusable fighting kit or Street Fighter clone in any copy.
- Recreate deleted attempt-number directories.
- Copy Clash `production-runtime` imports into the other three games.

---

# Phase 4 — Hard rules

1. **Public imports only on Turbo, Skyline, and Corridor Strike:**
   `@aura3d/engine` + generated `assets`. No `three`, no `GLTFLoader`,
   no hand-wired render loops. Corridor may also use `@aura3d/lean` /
   `@aura3d/lean/game` if you keep one app owner.
2. **Clash may keep** `@aura3d/engine/advanced-runtime`,
   `production-runtime`, `rendering`, `scene`, `animation` — label every
   Clash visual claim `production-runtime`, never root `createAuraApp`.
3. **Typed assets only.** CLI `assets add` / `resolve` / `validate`. No
   string IDs, raw GLB URLs, or `unsafeModelUrl`.
4. **No primitive heroes.** Primitives stay set dressing, drift marks,
   tracers (Corridor box tracer is set dressing for a typed rifle), HUD
   anchors, or an explicitly designed beacon if no catalog prop fits.
5. **One app per route.** Mutate in `app.onFrame`.
6. **DOM/CSS = UI only.** Bars, titles, pause, results, crosshair, hit
   marker — never fake 3D VFX.
7. **Simulation leads, render follows.** Cars, feet, hitboxes, bullets,
   and VFX attach to runtime/physics state.
8. **Do not hand-edit** `src/generated/game-geometry.ts` or generated
   `src/aura-assets.ts`.
9. **Do not silently promote** classification or rewrite route-health by
   hand. Regenerate evidence from commands.
10. **Do not break existing tests to hide a gap.** Extend tests to cover
    the new feel (shot travel, pause, act lighting, hit spark, audio
    trigger, pickup).
11. **Corridor look-target, enemy Y, and tracer scale rules in Phase 3A
    are non-negotiable.** They are more important than new juice.

---

# Phase 5 — Evidence gates (required)

A prettier screenshot is not done. Each game must still prove its current
mechanical contract **plus** the new feel.

## Shared

- Keyboard still changes visible state.
- Reset restores the full baseline.
- Pause actually stops the sim.
- Reduced motion disables camera shake / hit-stop punch / heavy flashes.
- Desktop + mobile first-load screenshots; hero not covered by HUD.
- No console errors. Non-blank canvas.
- README / classification / claim label unchanged unless a human asks.

## Corridor Strike

- Fire on J/F/button still decrements ammo and can kill.
- Shot-visual spec stays green: spark on muzzle, beam leaving the
  barrel, ammo `n/12`, traveling bolt, parked blob gone after the shot.
- Playable spec: movement, kill, win, death, death-reset, reset.
  **Pickups must go green** if you touch the walk path or crates.
- Look-target remains in the scene graph and visible (tiny scale).
- Enemy meshes stay on `ENEMY_VISUAL_Y`, capsules on `ENEMY_BODY_Y`.
- Commands:

```bash
pnpm exec playwright test tests/browser/neon-corridor-strike-shot-visual.spec.ts --reporter=line
pnpm exec playwright test tests/browser/neon-corridor-strike.spec.ts --reporter=line
```

## Turbo

- Four laps, six ordered gates, finish, reset.
- Player can pass the rival **on grey asphalt**.
- Rapier owns solid contact. SAT does not teleport.
- Opponent `onRoad` is body-on-asphalt.
- Start lights still complete before motion. Pause freezes both cars.
  Result card after finish.
- Commands: existing showcase gameplay + route-primary probes for
  `showcase-turbo-drift-circuit`. Re-run whatever `package.json` scripts
  already own this route rather than inventing a new gate.

## Skyline

- Finish between 70 and 115 seconds on the mounted kit path.
- Move, jump (no tap-hop), dash, fall, respawn, 6 checkpoints, coins,
  ember defeat of at least one sentry, finish.
- New: act palette changes with progression; pause; player HUD no
  longer shows raw `x` in the public layout.
- Keep `level-proof.ts` green. It still publishes
  `provesMountedKitPlayback: false`; Playwright owns mounted playback.

## Clash

- All controls in `docs/agents/game-showcase-build.md`.
- HP changes only through combat collision. KO lock. Reset rematch.
- `window.__AURA_CLASH_ARENA_PROOF__` still published.
- Hit-stop + camera punch fire on a real hit; special spends meter;
  debug volumes remain hidden in normal play.
- Commands:

```bash
pnpm --dir apps/aura-clash-showcase test:playable
pnpm --dir apps/aura-clash-showcase test:flagship
```

Do not mark Clash flagship. Visual approval is still human.

## After implementation

```bash
pnpm typecheck
# then the narrowest existing route tests you touched
```

Regenerate screenshots from the same commands the repo already uses. Do
not hand-author `tests/reports/**` or `route-health.json`.

---

# Phase 6 — Explicit non-goals

Do not implement in this pass:

- New games, new genres, or Blockfall work.
- Multiplayer / netcode / rollback.
- A second circuit, a second Skyline level, a Clash roster expansion, or
  a second Corridor map.
- Physical tyre / drivetrain / suspension simulation.
- Navmesh, animation retargeting, or new engine kits (`game.shooter()`
  does not exist — do not stub one).
- WebGPU / full post stack / “Three.js-quality” marketing copy.
- Classification flips, version bumps, npm publish, or marketing
  homepage rewrites.
- Rebuilding Corridor under `apps/` or the other three under `examples/`.
- Jump on Corridor Strike.

If a public API cannot do a requested juice moment, put it in a short
`KNOWN-LIMITS` note on the route as **route-local / not proven** — do
not hack it with forbidden imports.

---

# Phase 7 — Execution order

1. Read Phase 0 docs and the current source listed in Tier 3.
2. Run each game once. Write a 10-line “what feels cheap” note per title
   before editing. If your note disagrees with Phase 1, trust the running
   game.
3. **Corridor Strike first** — it has the largest visual debt and the
   only burned screenshot failures. Fix creatures + lighting + shot FX
   *without* violating the ten FPS laws. Keep both Playwright specs.
4. **Skyline act palettes + sentry tells** — the HUD is already a game
   HUD; make the world change.
5. **Turbo rival drama + drift smoke + dusk mood** — the HUD and lights
   already exist; make the race a contest.
6. **Clash picture** — hit-stop exists; add renderer-owned spark, KO
   camera, AI roles.
7. **Audio last on all four**, Clash-manifest discipline, CLI-registered
   files only.
8. Update tests for every new player-facing state.
9. Run verification. Leave classification and public “world-class”
   wording alone.

Do not open a fifth app. Do not “quickly rewrite” Corridor from
`docs/agents/fps-shooter-build-prompt.md` — that prompt scaffolds a new
prototype. This prompt upgrades the one that already shipped.

---

# Deliverable

When you stop, the user should be able to play all four and feel the
difference without reading a diff:

- Corridor: a dark rifle fight where shots leave the gun and hostiles
  look like creatures, not shards.
- Turbo: a race with lights, a rival who defends, a drift you can see,
  a finish card that matches the camera.
- Skyline: a journey through five moods with a tool, a threat, and a
  summit.
- Clash: a round that hits, blocks, and ends like a fight.

Plus a short summary with:

- what changed per game (visual / gameplay);
- what evidence commands you ran;
- what still needs a human visual reviewer;
- any API gap you refused to hack around;
- confirmation that Corridor look-target, enemy Y, and tracer laws still
  hold.
