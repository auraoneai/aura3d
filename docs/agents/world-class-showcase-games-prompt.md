# World-Class Showcase Games Prompt

Copy everything below the horizontal rule into an AI coding agent. The agent must
upgrade the **existing** Turbo Drift, Skyline Runner, and Aura Clash routes — not
scaffold replacements.

**Capability labels stay honest.** Turbo Drift and Skyline Runner remain
`createAuraApp` root routes classified `prototype-blocked` until independent
visual review passes. Aura Clash remains a `production-runtime` /
`development showcase` until a named human approves the exact final screenshots.

**Do not claim:** Gran Turismo / Forza / Mario Kart parity, Celeste / Hollow
Knight / Super Mario parity, Street Fighter / Mortal Kombat / Tekken parity,
Unity/Unreal replacement, “flagship quality,” or “world-class” in README,
route-health, marketing, or public copy. “World class” in this prompt is the
**internal player-experience target**, not a public claim.

---

# Mission

Take the three games that already exist in this repo and make them feel like
the best browser 3D games a player would actually choose to keep playing —
visually and as gameplay — **from where they are right now**.

Do not start over. Do not swap the genre. Do not replace the certified
geometry contracts, typed primary assets, or evidence objects unless a named
blocker forces a replacement and you re-prove the whole route.

The current games already have real loops. They do not yet have commercial
game feel: ceremony, juice, audio, player-facing HUD, dramatic AI, readable
lighting hierarchy, and a first-load screenshot that looks like a game poster
instead of an evidence harness.

Work all three. Do not finish one and stop.

| Game | Route | Source | Current class |
| --- | --- | --- | --- |
| Turbo Drift Circuit | `/apps/showcase-turbo-drift-circuit/` | `apps/showcase-turbo-drift-circuit/` | `prototype-blocked` arcade racer |
| Skyline Runner | `/apps/showcase-skyline-runner/` | `apps/showcase-skyline-runner/` | `prototype-blocked` five-act platformer |
| Aura Clash Arena | `/showcase/aura-clash/playable/` | `apps/aura-clash-showcase/` | `development showcase` 2.5D fighter |

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

Do **not** use frozen copies under `benchmark/context/aura3d/files/`.

## Tier 1 — Mandatory agent docs

| File | Purpose |
| --- | --- |
| `docs/agents/claims-and-boundaries.md` | Claim labels. Do not leak production-runtime into Turbo/Skyline root claims. |
| `docs/agents/no-hackjob-rules.md` | No CSS fake 3D, no loader hacks, no workaround slop. |
| `docs/agents/anti-hallucination-rules.md` | No invented assets or APIs. |
| `docs/agents/game-example-standards.md` | Public game bar: input, objective, reset, tests, session length. |
| `docs/agents/cinematic-scene-quality.md` | Lighting, camera, atmosphere ladder. Aim for L3 realtime cinematic. |
| `docs/agents/game-showcase-build.md` | **Required for Aura Clash.** Do not break its proof contract. |
| `docs/agents/asset-workflow.md` | CLI add / resolve / validate / typegen. |
| `docs/agents/rendering-proof-required.md` | When pixel proof is mandatory. |
| `docs/agents/verification.md` | Evidence commands. |

## Tier 2 — Game and visual standards

| File | Purpose |
| --- | --- |
| `docs/guides/build-a-browser-game.md` | End-to-end game walkthrough. |
| `docs/api/game-runtime.md` | `game.input`, kits, `cameraDirector`, `effects`, HUD, accessibility. |
| `docs/api/app-api.md` | `createAuraApp`, frame loop, nodes. |
| `docs/project/showcase/visual-quality-standard.md` | **The public visual bar.** Racing + platformer sections are the floor. |
| `docs/project/showcase/quality-gates.md` | What “release-ready candidate” actually requires. |
| `docs/project/showcase/apps-classification.md` | Current labels. Do not silently promote. |
| `docs/project/status/known-limits.md` | What root `createAuraApp` does **not** prove. |
| `docs/examples/aura-clash.md` | Clash claim boundary. |
| `docs/concepts/physics.md` | `app.physics` for contact-backed feel. |

## Tier 3 — Current source (read the real games, not the READMEs only)

### Turbo Drift Circuit

| Path | Why |
| --- | --- |
| `apps/showcase-turbo-drift-circuit/src/main.ts` | Scene, chase camera, Rapier contact, HUD, evidence. |
| `apps/showcase-turbo-drift-circuit/src/opponent-ai.ts` | Route-local rival. `step(dt, playerProgress)` is required. |
| `apps/showcase-turbo-drift-circuit/src/passing-lane.ts` | On-asphalt pass contract. Do not break. |
| `apps/showcase-turbo-drift-circuit/src/race-proof.ts` | Duration proof. Publishes `provesMountedKitPlayback: false`. |
| `apps/showcase-turbo-drift-circuit/src/generated/game-geometry.ts` | Certified topology. Do not hand-edit. |
| `apps/showcase-turbo-drift-circuit/README.md` | Current honest claims. |
| `apps/showcase-turbo-drift-circuit/index.html` | Shell: canvas + evidence aside. |
| `apps/showcase-turbo-drift-circuit/src/styles.css` | Current HUD chrome. |

### Skyline Runner

| Path | Why |
| --- | --- |
| `apps/showcase-skyline-runner/src/main.ts` | Scene, camera, sentries, HUD, evidence. |
| `apps/showcase-skyline-runner/src/level.ts` | Single level owner. Jump/motion lives here. |
| `apps/showcase-skyline-runner/src/level-layout.ts` | Five-act / ten-district story. |
| `apps/showcase-skyline-runner/src/runner-challenge.ts` | Route-local flow/score. |
| `apps/showcase-skyline-runner/src/level-proof.ts` | 70–115s window proof. |
| `apps/showcase-skyline-runner/src/generated/game-geometry.ts` | Mesh-derived surfaces. Do not hand-edit. |
| `apps/showcase-skyline-runner/README.md` | Current honest claims. |
| `apps/showcase-skyline-runner/index.html` | Shell: canvas + evidence aside. |
| `apps/showcase-skyline-runner/src/styles.css` | Current HUD chrome. |

### Aura Clash

| Path | Why |
| --- | --- |
| `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | Full fight loop. |
| `apps/aura-clash-showcase/src/playable/combat/auraClashMoveData.ts` | Frame data. Do not invert startup/active/recovery again. |
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
against this baseline. If source has moved, update the baseline in your
summary — do not invent a worse past.

## What is already good (keep it)

**Turbo Drift**

- Four-lap arcade race on typed Tsukuba circuit + typed red Formula player +
  distinct typed blue/black rival.
- Chase camera from `resolveChaseFraming` / `game.racingCameraRig`.
- Manual throttle / brake / steer / drift. Ordered gates. Off-track recovery.
  `R` reset.
- Rapier owns solid vehicle contact. SAT clamps only the player's commanded
  target. Opponent `onRoad` is body-on-asphalt, not kerbs.
- Visual asphalt is wide enough to pass the rival on tarmac.
- Daylight key + cool rim + pit/start fills, studio environment, distance fog,
  light AO, light bloom, drift-ribbon nodes.
- Pace is multiplied (~4× certified speed) so a lap is playable, not a crawl.

**Skyline Runner**

- Original five-act Level 1: Home Grove → Broken Canopy → Sentry Pass →
  Cloudstep Rise → Aurora Crown. Authored 95s, finish window 70–115s.
- Typed Kenney Oobi hero + typed verdant world. Mesh-derived playable surfaces.
- Move, variable jump (not tap-hop), coyote, dash, fall, checkpoint respawn,
  coins, ember volleys (`J` / `L`), stompable typed robot sentries, finish beacon.
- Side-scroller camera that keeps the hero readable without turning them into
  an oversized mascot.
- Layered sky, AO, bloom, distance haze, warm key + cyan checkpoint lift.

**Aura Clash**

- Playable 2.5D arena fighter with two distinct typed Quaternius rigs, neon
  downtown/rooftop stage, AI rival, meter, KO lock, rematch.
- Full control surface: A/D, S, Space, Shift, Q, J/K/L, P, R.
- Real clip maps, hit windows, combo / guard-break / knockdown helpers, SFX
  manifest, accessibility route, `window.__AURA_CLASH_ARENA_PROOF__`.
- Uses `production-runtime` + `A3DRenderer`. That is allowed **only** on this
  app. Do not copy those imports into Turbo or Skyline.

## What is not world-class yet (this is the work)

Shared across Turbo and Skyline:

- The page still reads as an **evidence harness**. The aside is labeled
  “controls and evidence.” HUD values include debug telemetry (`x` position,
  “Road locked”, surface IDs, alignment). A player should see a game, not a
  lab.
- No music. Almost no game-feel audio on Turbo/Skyline.
- First-load composition is technically readable but not poster-grade: lighting
  is competent, not authored as a mood; set dressing is thin; ceremony is
  missing (no countdown, no act titles in-world, no finish spectacle).
- Juice is thin: little camera punch, little impact freeze, little readable
  VFX beyond drift ribbons / ember shots.
- Touch exists; pause / reduced-motion / high-contrast are incomplete or
  Clash-only.
- Independent visual review is pending / stale. Screenshots must be regenerated
  from the final source, then left for a human. You cannot self-approve.

Turbo-specific gaps:

- Handling is a complete arcade loop but not a *race*. No countdown, no start
  lights, no split times, no best-lap memory, no ghost, no position/gap to
  rival, no finish camera, no pit-board / sector story.
- Rival is deterministic and passable, but does not create late-race drama
  (defend, dive, mistake, recover).
- Drift is a held modifier + ribbon boxes, not a committed slide with risk,
  score, or readable tyre smoke.
- No engine / tyre / wind / crowd / checkpoint audio.
- Night or dusk mood is unused. The circuit can look like a postcard and
  currently looks like a daylight proof.

Skyline-specific gaps:

- HUD is a debug strip: `x`, deaths, surface name, challenge multipliers.
- Acts exist in data; they barely exist as *places*. Lighting, palette, and
  music should change per act.
- Sentries patrol; they do not telegraph, idle, or die with weight.
- Ember volley is a mechanic, not a toy: weak muzzle / impact / defeat
  feedback.
- Summit beacon is primitive boxes. Finish should be unmistakable and
  beautiful.
- No audio. No land-dust, no coin chime, no checkpoint fanfare, no death sting,
  no summit theme.
- Secrets / optional height / risk-reward ledges are thin for a 95s Level 1.

Clash-specific gaps:

- Starter-grade fighters and a single stage. Visual approval is still pending.
- Combat is correct more than it is *scary*. Hits need readable pop, camera
  punch, hit-stop, spark/impact that is renderer-owned, and KO that ends the
  round like a show.
- HUD/chrome can still read as a development overlay.
- AI pressures; it does not yet have roles (rushdown, keep-away, punish
  whiffs, respect meaty).
- Training / frame-data debug must stay behind an explicit debug mode, never
  in normal play.
- Do not add a third fighter or a new stage until the current pair + current
  arena look and play at the target bar.

---

# Phase 2 — What “world class” means in this repo

A player who has never read a README should, within 3 seconds:

1. Know what game this is (racer / platformer / fighter).
2. See a hero that is the subject of the frame.
3. Want to press a key.

After 60 seconds they should have had a complete emotional loop: tension,
a mistake, a recovery, a reward, a finish or a rematch they choose to take.

## Visual bar (all three)

Treat `docs/project/showcase/visual-quality-standard.md` as the **floor**.
The target is a poster you would put on the homepage without apology.

- Hero readable in 3 seconds on desktop and 390px mobile.
- Lighting has intent: key, fill, rim, practical. Not “studio + one point.”
- Materials contrast: painted bodywork vs asphalt vs grass; foliage vs sky
  shards vs metal sentries; skin/cloth vs neon wet rooftop.
- Atmosphere is in the **scene** (`effects.fog`, `game.effects`, `particles`,
  lights). DOM/CSS is UI only. No fake bloom, trails, explosions, or scanlines
  in CSS.
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
exact route’s screenshots + diagnostics prove it. Turbo and Skyline may *use*
bounded root effects; they may not advertise a production post stack.

## Gameplay bar (all three)

- Input has weight: acceleration, release, coyote, buffer, recovery. Instant
  on/off digital snapping is the current floor, not the target.
- Every important action has a readable start, contact, and recovery
  (throttle, drift, jump, dash, fire, light, heavy, special, KO).
- Camera is a performer: chase lean, land dip, hit punch, finish push-in.
  `game.accessibility.reducedMotion` disables shake.
- Audio is part of feel. Register every loop/SFX through the CLI
  (`assets add ... --type audio`) and typed `assets.*`. Clash already has a
  manifest — match that discipline on Turbo and Skyline.
- Fail states are fair and fast to retry. Reset is instant and complete.
- Pause exists and actually freezes simulation, AI, and combat.
- Touch controls stay bound with `bindGameTouchControls` / `game.touchControls`.
- Session length stays at or above the current authored bars (Turbo four laps,
  Skyline 70–115s, Clash a full round to KO). Do not shorten to make polish
  easier.

## Honesty bar

Allowed internal language: “player-facing quality pass,” “cinematic
presentation,” “arcade feel,” “development showcase with stronger juice.”

Forbidden public language: world-class, flagship, AAA, photoreal, physical
tyre model, production fighting kit, Celeste-quality, Street Fighter-quality.

Keep READMEs and route-health at the current capability labels. If you close
every mechanical blocker, you still do **not** flip classification to
`release-ready candidate`. A named human reviewer does that.

---

# Phase 3 — Per-game upgrade spec

Do the work in-place. Preserve evidence globals, geometry hashes, and
control bindings unless you extend them and update tests in the same change.

## A. Turbo Drift Circuit — arcade race, not a driving proof

**Keep:** typed cars, Tsukuba topology, four laps, six gates, Rapier contact,
on-asphalt passing, chase framing, drift input, `R` reset, `window` evidence
object, `passing-lane.ts` contracts.

**Visual target**

- First frame is a grid poster: both cars on the start straight, circuit
  receding, horizon graded, hero car 18–24% of frame height (already the
  framing band — compose the *lighting and HUD* to match).
- Player-facing HUD only: speed, lap `2/4`, gate, gap to rival
  (`+0.42s` / `P1`/`P2`), last lap / best lap, race status
  (`Lights` / `Racing` / `Finished`). Move alignment, offsets, and kit
  telemetry to debug.
- Mood pass: keep daylight as the default, but author it like late afternoon
  at a real circuit — longer shadows if the root path proves them, warmer key,
  cooler distant fog, practical start-light glow. If shadows are not
  root-proven on this route, do not fake them with dark boxes.
- Drift must read in pixels: ribbons already exist — add `game.effects` tyre
  smoke / dust only while drifting and only on asphalt. Hide them in reduced
  motion.
- Finish: camera eases to a 3/4 hero shot, rival still on track, HUD swaps to
  a result card (time, best lap, position). No debug dump.

**Gameplay target**

- Ceremony: 3-2-1-GO start lights. Input is buffered but cars do not move
  until GO. Jumping the lights is a small time penalty, not a soft start.
- Race, not ghost-train: rival uses the existing `createTurboOpponentAi` +
  `createVehicleDriverAi`. Add late-race behavior *inside that module*:
  defend the inside when the player is close, leave a passing lane when
  yielded, small speed error after a missed apex so a human can create a
  pass. Keep it deterministic enough for tests (seeded or snapshot-driven).
- Drift is a commitment: hold Space/Shift to break traction, lose some
  forward speed, gain yaw, leave marks. Reward a clean drift through a
  hairpin with a short burst (arcade nitro), not a physics tyre model.
- Off-track is a *feeling*: grass slowdown, camera nudge, audio change,
  recovery assist that is visible as “Off track” not “Edge assist.”
- Pause on `P` / `Esc`. Reset on `R` restores lights, laps, rival, camera,
  audio.
- Optional second mode only if the primary race is already better: a
  time-trial ghost of the player’s last finish. Do not add weather, damage,
  pits, or a second circuit in this pass.

**Do not**

- Claim physical tyres, drivetrain, suspension, or motorsport simulation.
- Shrink the cars or widen the road with a one-off scale hack that fights
  `gameGeometryContract`.
- Replace Tsukuba or the Formula pair unless an asset is broken; if you must
  swap, CLI-resolve, re-bind topology, and re-prove passing + contact.

## B. Skyline Runner — a place you run through, not a strip you prove

**Keep:** five acts, ten districts, 95s authored / 70–115s finish window,
typed hero + world, mesh surfaces, coins, ember volleys, sentries, dash,
coyote, checkpoints, `createSkylineLevel()` as the single level owner.

**Visual target**

- Player-facing HUD only: score, coins, ember stock, current act title,
  checkpoint pips, lives/retries. Hide `x`, surface IDs, “Grounded/Airborne,”
  and raw challenge multipliers unless debug is on.
- Each act has a readable palette shift in the **scene**: sky ramp, key color,
  fog color/density, practical lights. Home Grove is warm gold-green; Sentry
  Pass is colder steel; Aurora Crown is dusk magenta/teal. Use
  `blendSkyBandColor` / `planSkyBackdrop` already imported — drive them from
  act, not one static look.
- Sentries face the player, play a visible idle, and have a defeat that is
  more than `visible = false`: hide + `game.effects` burst + audio + score
  pop. Collision boxes stay smaller than the visual silhouette (already
  tuned — do not grow them).
- Summit beacon: replace the stacked primitive monument with a typed prop if
  the catalog has a clean CC0/CC-BY beacon/obelisk/lantern that fits the
  verdant world. If not, keep primitives but make one designed silhouette
  (plinth + mast + emissive core) and light it like a goal, not a debug
  totem.
- Collectibles must glitter in the scene (emissive / `game.effects` sparkle),
  not only increment a counter.
- Camera: keep the current readability band. Add a short land dip and a
  dash punch via `game.cameraDirector`. No zoom that turns the hero into a
  mascot.

**Gameplay target**

- Jump feel is already the kit’s variable jump — protect it. Add land recovery
  dust and a tighter coyote/buffer only if tests still finish inside 70–115s.
- Ember volley should feel like a tool: muzzle flash in-scene, travel, impact
  on sentry, one-shot defeat, limited stock. Empty stock has a deny sound,
  not silence.
- Sentries telegraph a 0.4–0.6s tell before the intercept frame so a jump or
  volley is a read, not a surprise overlap.
- Checkpoints are story beats: brief act title card (DOM UI is fine),
  checkpoint chime, optional warm light pulse on the relay.
- Optional risk/reward: one high coin path per act that costs a harder jump.
  Do not add a second level.
- Death is fast: sting, respawn at last relay, camera already framed. Do not
  add a long animation that blows the 115s window.
- Pause on `P`. Reset on `R` restores act 1, coins, ember, deaths, sentries.

**Do not**

- Break the 70–115s completion window. If polish slows the route, retune
  spacing in `level.ts` / `level-layout.ts` and re-run
  `src/level-proof.ts` + the mounted Playwright finish.
- Author new playable rectangles that fight the mesh-derived surface map.
- Use a primitive as the hero or the world.

## C. Aura Clash — a fight you feel, not a combat harness

**Keep:** both typed rigs, current arena, move table, clip maps, audio
manifest, proof object, KO lock, rematch, accessibility routes, package
import boundary (`@aura3d/engine/production-runtime` is OK **here only**).

**Visual target**

- First frame is a fight poster: two silhouettes, readable faces/hood, neon
  practicals, grounded floor, no debug volumes.
- HUD is a fighter HUD: names, HP bars, meter, timer, combo count, round
  marks. Training numbers and proof JSON stay on `/evidence/` or `?debug=1`.
- Hits change the *picture*: hit-stop (2–8 frames by move strength), camera
  punch, renderer-owned spark/impact (`game.effects` or the existing hit-spark
  path), brief victim flash that is not a CSS overlay pretending to be light.
- Special (L) is the showpiece: readable startup, distinct silhouette, screen
  freeze, unique SFX already in the manifest.
- KO: inert hitboxes (already required), camera push-in, loser down clip
  once, winner idle, result card. No looping combat.
- Hide hitboxes in normal play. This is already a rule — verify it still
  holds after VFX work.

**Gameplay target**

- Frame data stays fighting-game shaped: short active, real recovery, punish
  windows. Read `auraClashMoveData.ts` comments before touching numbers.
- Combos: light can cancel into heavy on hit if `canCancelCombo` says so;
  heavy does not combo into itself for free. Special spends meter and is a
  mixer, not a safer jab.
- Guard is a game: chip or guard-break via existing `defaultGuardBreakRules`.
  Blocking must look and sound different from getting hit.
- AI roles inside the current rival: approach, space, punish whiff, respect
  meaty wakeup. Keep it deterministic for replay tests.
- Input buffer already exists — make it feel like a fighter (6–8f buffer),
  not a platformer (120ms is fine for Skyline, tight for Clash).
- Pause freezes both fighters, AI, timer, and hitboxes. Reset restores HP,
  meter, positions, clips, combo, and audio state.

**Do not**

- Import `three` or write a second renderer.
- Add roster characters or a second stage in this pass.
- Call it a reusable fighting kit or Street Fighter clone in any copy.
- Recreate deleted attempt-number directories.

---

# Phase 4 — Hard rules

1. **Public imports only on Turbo and Skyline:** `@aura3d/engine` + generated
   `assets`. No `three`, no `GLTFLoader`, no hand-wired render loops.
2. **Clash may keep** `@aura3d/engine/advanced-runtime`,
   `production-runtime`, `rendering`, `scene`, `animation` — label every
   Clash visual claim `production-runtime`, never root `createAuraApp`.
3. **Typed assets only.** CLI `assets add` / `resolve` / `validate`. No
   string IDs, raw GLB URLs, or `unsafeModelUrl`.
4. **No primitive heroes.** Primitives stay set dressing, drift marks,
   HUD anchors, or an explicitly designed beacon if no catalog prop fits.
5. **One app per route.** Mutate in `app.onFrame`.
6. **DOM/CSS = UI only.** Bars, titles, pause, results — never fake 3D VFX.
7. **Simulation leads, render follows.** Cars, feet, hitboxes, and VFX
   attach to runtime/physics state.
8. **Do not hand-edit** `src/generated/game-geometry.ts` or generated
   `src/aura-assets.ts`.
9. **Do not silently promote** classification or rewrite route-health by
   hand. Regenerate evidence from commands.
10. **Do not break existing tests to hide a gap.** Extend tests to cover
    the new feel (countdown, pause, act lighting, hit-stop, audio trigger).

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

## Turbo

- Four laps, six ordered gates, finish, reset.
- Player can pass the rival **on grey asphalt**.
- Rapier owns solid contact. SAT does not teleport.
- Opponent `onRoad` is body-on-asphalt.
- New: countdown completes; pause freezes both cars; result card after finish.
- Commands: existing showcase gameplay + route-primary probes for
  `showcase-turbo-drift-circuit`. Re-run whatever `package.json` scripts
  already own this route rather than inventing a new gate.

## Skyline

- Finish between 70 and 115 seconds on the mounted kit path.
- Move, jump (no tap-hop), dash, fall, respawn, 6 checkpoints, coins, ember
  defeat of at least one sentry, finish.
- New: act palette changes with progression; pause; player HUD no longer
  shows raw `x` in the public layout.
- Keep `level-proof.ts` green. It still publishes
  `provesMountedKitPlayback: false`; Playwright owns mounted playback.

## Clash

- All controls in `docs/agents/game-showcase-build.md`.
- HP changes only through combat collision. KO lock. Reset rematch.
- `window.__AURA_CLASH_ARENA_PROOF__` still published.
- New: hit-stop + camera punch fire on a real hit; special spends meter;
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

Regenerate screenshots from the same commands the repo already uses. Do not
hand-author `tests/reports/**` or `route-health.json`.

---

# Phase 6 — Explicit non-goals

Do not implement in this pass:

- New games, new genres, or Blockfall work.
- Multiplayer / netcode / rollback.
- A second circuit, a second Skyline level, or a Clash roster expansion.
- Physical tyre / drivetrain / suspension simulation.
- Navmesh, animation retargeting, or new engine kits.
- WebGPU / full post stack / “Three.js-quality” marketing copy.
- Classification flips, version bumps, npm publish, or marketing homepage
  rewrites.
- Rebuilding the games under `examples/` or a new scaffold.

If a public API cannot do a requested juice moment, put it in a short
`KNOWN-LIMITS` note on the route as **route-local / not proven** — do not
hack it with forbidden imports.

---

# Phase 7 — Execution order

1. Read Phase 0 docs and the current source listed in Tier 3.
2. Run each game once. Write a 10-line “what feels cheap” note per title
   before editing. If your note disagrees with Phase 1, trust the running
   game.
3. **HUD first** on Turbo and Skyline: split player HUD vs debug. This
   single change moves both from “lab” to “game.”
4. **Feel second:** countdown (Turbo), act lighting (Skyline), hit-stop +
   camera punch (Clash).
5. **Audio third:** CLI-register loops/SFX; wire to the same events tests
   already observe.
6. **AI / juice fourth:** rival drama, sentry tells, Clash roles.
7. **Ceremony last:** start lights, act cards, KO/finish cameras.
8. Update tests for every new player-facing state.
9. Run verification. Leave classification and public “world-class” wording
   alone.

Start with Turbo Drift HUD + countdown, then Skyline HUD + act palettes,
then Clash hit-stop. Do not open a fourth app.

---

# Deliverable

When you stop, the user should be able to play all three and feel the
difference without reading a diff:

- Turbo: a race with lights, a rival, a pass, a finish card.
- Skyline: a journey through five moods with a tool, a threat, and a summit.
- Clash: a round that hits, blocks, and ends like a fight.

Plus a short summary with:

- what changed per game (visual / gameplay);
- what evidence commands you ran;
- what still needs a human visual reviewer;
- any API gap you refused to hack around.
