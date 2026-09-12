# Recovered turn-14 material — NextGames-PRD work (session-71f44548)

The original session's final turn ("create a PRD for all the games ... NextGames-PRD.md")
failed 6 times with upstream idle timeouts before any PRD text or file write occurred.
Below is the salvaged reasoning/planning stream from each attempt, in order.
The 14 events lost to the corruption (seq 81471-81484 pre-repair) were reasoning deltas
inside attempt 3; a short fragment of reasoning text is permanently missing there.


---

## Attempt 1

### Reasoning (block 0, 10029 chars)

I have the canonical app layout. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root (matching the user's naming, similar to their `continue2.md` at root).

Structure per game:
- Identity block (name, route, genre, claim label, engine surface, priority)
- Summary/pitch
- Goals / Non-goals
- Game design: core loop, controls table, mechanics detail, scoring/fail/reset/progression, session length
- Presentation direction: visual + audio
- File plan: complete file-by-file listing with purpose per file
- Asset plan: CLI commands, asset names
- Evidence & test plan: unit tests, browser tests, route-health, screenshots
- Task list: phased with task IDs (SG-1.1 etc.)
- Checklist: acceptance criteria checkboxes

Plus shared sections: standards, execution order, risk register, master checklist.

Seven games:
1. Siege Golf (Wrecking Green) — apps/showcase-siege-golf/
2. Neon Swarm — apps/showcase-neon-swarm/
3. Aurora Lander — apps/showcase-aurora-lander/
4. Gravity Post — apps/showcase-gravity-post/
5. Courier Rush — apps/showcase-courier-rush/
6. Pulse Tunnel — apps/showcase-pulse-tunnel/
7. Mech Hangar Arena — apps/showcase-mech-hangar/

This is going to be a long document. Let me write it carefully and completely. I'll write it in one `write` call. I need to be careful about being grounded in real APIs:

Game 1 Siege Golf:
- `games.createMiniGolfState()` → AuraMiniGolfStateController (shots, score, collisions, cup trigger, reset, follow-camera metrics)
- `sceneKits.miniGolf()`, `prefabs.miniGolfHole()`
- physics: dynamic bodies box/sphere/capsule/convexHull; joints fixed/hinge/slider/ball-socket/spring/motorised-hinge; sensors onTriggerEnter; deterministic stepping
- Note: mini golf state controller is authored-unit; the destruction structures use app.physics rigid bodies. Need to be careful: mixing authored kinematic ball with physical stacks — design decision: ball is a physical sphere body launched by impulse; cups are sensors; structures are dynamic boxes + joints. Actually simpler: whole thing on app.physics. But games.createMiniGolfState covers shot input/score/reset logic which is still useful as the rules layer. I'll specify: rules layer = createMiniGolfState; simulation = app.physics world with sphere ball body; impulse launch from aim UI.

Files for siege golf:
```
apps/showcase-siege-golf/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
├── KNOWN-LIMITS.md
├── assets/
│   ├── sfx/*.wav (via scripts/build-sfx.mjs)
│   └── models/ (source GLBs if any)
├── scripts/build-sfx.mjs
├── public/aura-assets/ (generated)
└── src/
    ├── main.ts
    ├── aura-assets.ts (generated)
    ├── aura.assets.json (generated)
    ├── styles.css
    └── game/
        ├── courses.ts          # hole definitions (structures, targets, pars)
        ├── structures.ts       # jointed stack builders
        ├── shot.ts             # aim/power, impulse launch, camera
        ├── rules.ts            # wrapper over games.createMiniGolfState
        ├── scoring.ts          # stars, par, totals
        ├── effects.ts          # impact dust, topple cues via game.effects
        ├── hud.ts              # DOM HUD
        ├── siege-audio.ts      # audio controller + manifest
        └── siege-proof.ts      # runtime evidence object
tests/unit/apps/siege-golf-toppling.test.ts
tests/unit/apps/siege-golf-scoring.test.ts
tests/browser/siege-golf-playable.spec.ts
```

Game 2 Neon Swarm:
- instances.* native instancing, distanceLod, game.effects, particles, cameraDirector, touch controls
- Files:
```
apps/showcase-neon-swarm/
├── src/
│   ├── main.ts
│   ├── styles.css
│   └── game/
│       ├── arena.ts           # city-block-derived arena, spawner pads
│       ├── swarm.ts           # instanced drone pool, steering, LOD tiers
│       ├── player.ts          # dash, pulse fire, i-frames
│       ├── waves.ts           # wave definitions, escalation, shop
│       ├── upgrades.ts
│       ├── pickups.ts         # cores/scrap sensors
│       ├── combat.ts          # pulse AoE hits vs swarm positions
│       ├── feel.ts            # hit-stop, camera punch, vignette state
│       ├── hud.ts
│       ├── swarm-audio.ts
│       └── swarm-proof.ts
tests/unit/apps/neon-swarm-waves.test.ts
tests/unit/apps/neon-swarm-steering.test.ts
tests/browser/neon-swarm-playable.spec.ts
tests/browser/neon-swarm-instancing.spec.ts
```

Game 3 Aurora Lander:
- heightfield static colliders, mesh surface query BVH, sensors for pads, replay
- Files:
```
apps/showcase-aurora-lander/
├── src/game/
│   ├── terrain.ts        # heightfield generation (seeded), collider binding
│   ├── lander.ts         # thrust, rotation, fuel
│   ├── pads.ts           # landing pad placement + sensors
│   ├── grading.ts        # touchdown velocity/angle/fuel grading
│   ├── sites.ts          # mission chain / progression
│   ├── replay.ts         # input capture/export, ghost playback
│   ├── camera-rig.ts
│   ├── hud.ts
│   ├── lander-audio.ts
│   └── lander-proof.ts
tests/unit/apps/aurora-lander-grading.test.ts
tests/unit/apps/aurora-lander-replay.test.ts
tests/browser/aurora-lander-playable.spec.ts
```

Game 4 Gravity Post:
- solarSystem kit, route-local gravity, trajectory prediction, delivery sensors
```
apps/showcase-gravity-post/
├── src/game/
│   ├── system-map.ts     # level defs: planets, wells, stations
│   ├── gravity.ts        # authored gravity field integration
│   ├── launcher.ts       # aim, power, prediction line
│   ├── pods.ts           # pod flight state, burns
│   ├── delivery.ts       # station sensors, scoring
│   ├── camera-rig.ts
│   ├── hud.ts
│   ├── post-audio.ts
│   └── post-proof.ts
tests/unit/apps/gravity-post-trajectory.test.ts
tests/browser/gravity-post-playable.spec.ts
```

Game 5 Courier Rush:
- cityBlock night kit, createGameArcadeVehicle, createVehicleDriverAi traffic, checkpoint sensors
```
apps/showcase-courier-rush/
├── src/game/
│   ├── city.ts           # cityBlock night scene, drop zones
│   ├── van.ts            # arcade vehicle tuning (createGameArcadeVehicle)
│   ├── traffic.ts        # createVehicleDriverAi civilians
│   ├── jobs.ts           # pickup/dropoff chain, timer, combo
│   ├── navigation.ts     # waypoint graph (honest: no navmesh claims)
│   ├── feel.ts
│   ├── hud.ts
│   ├── courier-audio.ts
│   └── courier-proof.ts
tests/unit/apps/courier-rush-jobs.test.ts
tests/browser/courier-rush-playable.spec.ts
```

Game 6 Pulse Tunnel:
- neonTunnel kit, audio bus, timeline beats, lane dodge
```
apps/showcase-pulse-tunnel/
├── src/game/
│   ├── tunnel.ts         # neonTunnel scene, gate spawners
│   ├── beat-clock.ts     # Web-Audio-anchored clock, tolerance window
│   ├── patterns.ts       # gate pattern generation synced to track sections
│   ├── ship.ts           # lane movement, buffer
│   ├── sync-audit.ts     # drift measurement evidence
│   ├── hud.ts
│   ├── pulse-audio.ts
│   └── pulse-proof.ts
tests/unit/apps/pulse-tunnel-beatclock.test.ts
tests/browser/pulse-tunnel-playable.spec.ts
```

Game 7 Mech Hangar Arena:
- characterAssembly, locomotion kit, fighting-lite duel
```
apps/showcase-mech-hangar/
├── src/game/
│   ├── hangar.ts         # assembly UI scene, part slots
│   ├── parts-catalog.ts  # typed part assets, stat mapping
│   ├── assembly.ts       # characterAssembly plan build + validation
│   ├── stats.ts          # derived stats from parts
│   ├── arena.ts          # duel stage
│   ├── mech-controller.ts# createGameLocomotionKit bindings
│   ├── rival-ai.ts
│   ├── hud.ts
│   ├── hangar-audio.ts
│   └── hangar-proof.ts
tests/unit/apps/mech-hangar-assembly.test.ts
tests/browser/mech-hangar-playable.spec.ts
```

Shared infra files:
- apps/showcase-index/ gallery card registration
- marketing sitemap/link tasks
- vercel deployment config (marketing project) — learned lessons: root vercel.json builds marketing only; new apps deploy as part of monorepo build? Actually the four games are served under /apps/... paths from marketing/dist. So new showcase apps need to be built into marketing dist too. Include a deployment section documenting that.

Also each game needs package.json scripts aligned with repo conventions (build, test, route-health). And registration in whatever drives `current-routes-route-health.spec.ts`? That spec is canonical route-health evidence pattern — new routes need adding there or their own route-health spec.

Priority order: P0 Siege Golf, P0 Neon Swarm, P1 Aurora Lander, P1 Gravity Post, P2 Courier Rush, P2 Pulse Tunnel, P3 Mech Hangar.

Session length ≥60s per standards. Each game design must include that.

Now write the document. It will be long (~1000+ lines). Let me be disciplined: full but tight. Use tables where possible to compress.

Also include "Definition of Done" master checklist and per-game checklists with `- [ ]` items.

Let me also include honest claim labels: all seven start as `prototype` under `createAuraApp` root safe API; none may claim production kits; Pulse Tunnel audio-sync bounded; Neon Swarm instancing claims backed by telemetry; etc.

Deployment notes: learned from the previous session — Vercel project `marketing`, root vercel.json builds `pnpm --dir marketing build` output `marketing/dist`; new apps must be wired into the marketing build pipeline (or whatever serves /apps/*). I should keep this section short and factual: "deployment follows the established marketing-project pipeline documented in docs/agents/deployment.md; do not re-link projects."

Actually let me quickly check how marketing includes the apps — does marketing build copy apps? Not critical for PRD; I'll reference docs/agents/deployment.md and note the wiring task generically ("add route to marketing build manifest / sitemap"). Keep it as a task without inventing specifics.

One more consideration: the user said "do it by file name" — so the file plans must be explicit per-file listings. I'm doing that.

Write the file now. Also mention in final response the created file path.

---

## Attempt 2

### Reasoning (block 0, 14996 chars)

I have the canonical app layout. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root (matching where the user's own files like `continue2.md` live).

Structure per game:
- Identity block (name, route, genre, claim label, engine surface, priority)
- Summary & player fantasy
- Goals / Non-goals
- Game design: core loop, controls, mechanics detail, scoring/fail/reset/progression, session length, difficulty
- Presentation: visual direction, audio direction (with SFX cue list)
- File plan: every file by name with purpose (app files, root tests, assets)
- Asset plan: CLI commands, typed keys
- Evidence & test plan: unit tests, browser tests, route-health, screenshots
- Task list: phased with task IDs
- Checklist: acceptance criteria checkboxes

Plus shared sections at top and portfolio-level execution order, risk register, master checklist at bottom.

Seven games:
1. Siege Golf (Wrecking Green) — apps/showcase-siege-golf/
2. Neon Swarm — apps/showcase-neon-swarm/
3. Aurora Lander — apps/showcase-aurora-lander/
4. Gravity Post — apps/showcase-gravity-post/
5. Courier Rush — apps/showcase-courier-rush/
6. Pulse Tunnel — apps/showcase-pulse-tunnel/
7. Mech Hangar Arena — apps/showcase-mech-hangar/

Let me be careful to keep claims honest per docs:
- No navmesh from root
- No WebGPU/HDR/shadow claims
- Physics via app.physics / game.* public APIs
- Typed assets only
- DOM = UI only
- All games labeled prototype until human review

For each game I need realistic file lists modeled on turbo's layout:

```
apps/showcase-siege-golf/
├── package.json
├── README.md
├── index.html
├── vite.config.ts
├── tsconfig.json
├── route-health.json (generated)
├── showcase-evidence-checklist.json
├── assets/
│   ├── sfx/*.wav (source)
│   └── models/ (downloaded glbs before CLI add)
├── scripts/build-sfx.mjs
├── public/aura-assets/ (generated)
└── src/
    ├── main.ts
    ├── styles.css
    ├── aura-assets.ts (generated)
    ├── aura.assets.json (generated)
    └── game/
        ├── course.ts        # hole definitions + structure stacks
        ├── physics-course.ts# bodies/joints/sensors build
        ├── shot.ts          # aim/power state machine
        ├── ball.ts          # ball body + camera follow
        ├── scoring.ts       # par/strokes/score-of-hole
        ├── effects.ts       # impact dust, topple sparks
        ├── hud.ts           # DOM HUD
        └── siege-audio.ts   # audio controller + manifest
```

Root tests:
```
tests/browser/siege-golf-playable.spec.ts
tests/browser/siege-golf-shot-visual.spec.ts
tests/unit/apps/siege-golf-scoring.test.ts
tests/unit/apps/siege-golf-topple-determinism.test.ts
```

Similar for others. Let me draft each game's specifics.

**Game 1: Siege Golf "Wrecking Green"**
- Genre: physics puzzle-sports
- Engine surface: app.physics dynamic bodies (boxes/planks), joints (hinge/spring), sensors (cups/target zones), games.createMiniGolfState() for shot/score/cup/reset discipline, prefabs.miniGolfHole(), particles for impacts, text3D for hole numbers? (text3D uppercase A-Z 0-9 — hole numbers work), cameraDirector.
- Loop: aim (left/right or drag) → power (hold/release) → ball flies, hits structures → targets (pinned blocks/target goblins?) knocked into cup zones OR target plates knocked over → strokes counted vs par → holed = next of 9 holes → out of strokes on a hole = fail/retry → total scorecard at end → reset R.
- Actually simpler and more testable: each hole has a goal sensor (the cup). Structures guard the cup. Sink in ≤ par. Optional bonus targets (knock all 3 crown plates for a star).
- Session: 9 holes × ~20-40s = 4-6 min; ≥60s meaningful play easily.
- Determinism: fixed-step physics stepping gives replayable shots; input replay export as "share your shot" feature? Keep as stretch.
- SFX: tee, swing/whoosh, wood impact, stone impact, topple creak, cup drop, par chime, birdie fanfare, fail buzz, UI confirm. ~10 cues.
- Assets: typed golf ball GLB? A sphere primitive is fine for a ball? Rule: primitives not allowed as primary subject... "primary character, vehicle, product, creature, weapon, world" — a golf ball is borderline; better resolve a catalog ball or use sceneKits.miniGolf which presumably has its own presentation. miniGolf kit exists with ball/cup/aim/power state expected in screenshots. The kit itself is the sanctioned pattern ("Do not submit toy mini-golf with only a flat plane and a ball. Use sceneKits.miniGolf() or games.createMiniGolfState()"). So ball via kit conventions is fine. Primary world asset: resolve a catalog environment or use prefabs.miniGolfHole(). Structures: wooden plank/crate GLBs from catalog (search "wooden crate", "wooden plank") — CLI-resolved, typed. Target: catalog target/totem or knight figure? Keep abstract-ish but typed: "stone guardian statue" small props as knock targets.
- Claim label: prototype.

**Game 2: Neon Swarm**
- Genre: arena horde survival, twin-stick-lite (keyboard rotate/move + auto-aim pulse or mouse aim).
- Engine surface: instances.* for drones (instanced material ≤2 draws proven), distanceLod, CPU culling, game.effects, particles, cameraDirector (top-down slight tilt), touch controls (virtual sticks), HUD bindings, accessibility reduced motion.
- Player: one typed hero GLB (catalog "sci-fi trooper" or robot) or hoverbike? Keep hero typed GLB; drones instanced primitives are set dressing? Hmm — enemies as instanced primitives: is that "primitive-only primary subject"? Enemies are named creatures... The rule says primitives not allowed as primary character/creature. But instancing evidence uses boxes. Risky. Mitigation: drones are explicitly abstract machines ("abstract visualization" label risk)... Better: make enemies instanced *capsule drones* presented as an explicitly abstract machine swarm, and note in README that swarm units are deliberately abstract instanced geometry (like Geometry Wars); the HERO is a typed GLB. That satisfies "unless the game is explicitly abstract" for the swarm while keeping a real primary subject. I'll write that into the PRD honestly.
- Loop: waves spawn at street edges → move/dash/pulse → kills → cores drop → collect to level up (choose 1 of 3 upgrades between waves) → survive 8 waves = run complete → death = fail → reset. Score = kills×wave multiplier.
- Session: 8 waves × ~30s ≈ 4 min.
- SFX: pulse fire, drone pop, dash whoosh, pickup, level-up chime, wave horn, low-HP alarm, death sting, ambient hum. ~9 cues.
- Tests: unit sim for wave director + upgrade math; browser: move→kill→score→wave→upgrade→death→reset; instancing telemetry assertion (draw calls ≤ budget); screenshot with visible swarm.

**Game 3: Aurora Lander**
- Genre: physics lander.
- Engine surface: static heightfield terrain collider, createMeshSurfaceQuery BVH height/normal queries, sensors for pads, kinematic or dynamic lander body (dynamic rigid body with thrust forces — proven), fuel model, deterministic replay (input replay export/import as ghost).
- Terrain: generated heightfield data authored in code (deterministic seed), rendered as custom indexed geometry (geometry.define/custom proven) + heightfield collider.
- Lander: typed GLB module (catalog "lunar lander"/"space capsule" — search may find something; fallback: explicitly abstract lander built from primitives labeled abstract? Better: resolve catalog "space probe" or "satellite"). PRD will specify catalog-first with abstract fallback documented.
- Loop: thrust/rotate → fuel drains → navigate to lit pad → touchdown checks (vertical speed, horizontal speed, angle, pad zone) → Perfect/Good/Hard/Crash → cargo delivered score multiplier → chain 3 landing sites → crash/fuel-out = fail → reset.
- Ghost: best-run input replay plays as translucent ghost — showcases input replay as feature.
- SFX: thruster loop, RCS puff, touchdown thud, perfect chime, crash boom, fuel warning, wind ambience, UI. ~8 cues.
- Tests: unit grading math + fuel; browser: thrust changes altitude→land success→fail→reset; heightfield contact proof (lander rests on terrain slope).

**Game 4: Gravity Post**
- Genre: orbital slingshot puzzle.
- Engine surface: solarSystem kit visuals (typed planets), route-local Newtonian-lite gravity (authored arcade motion — sanctioned non-physical), trajectory prediction line (custom geometry line strip), station sensors, timeline for delivery cinematics, labels for planet names.
- Loop: select launch angle/power → prediction arc shows path → launch pod → gravity curves it → hit station ring sensor = delivered (accuracy = closest approach) → fuel for mid-flight burn (hold shift) → deliver N pods across escalating systems → pod lost (ejected/planet hit) = retry.
- Session: 10 deliveries ≈ 5 min.
- SFX: launch, burn, whoosh flyby, delivery chime, planet impact thud, fail, ambient space drone. ~7 cues.
- Tests: unit gravity integration determinism (same inputs → same landing), browser: launch→delivery sensor→score→fail→reset.

**Game 5: Courier Rush**
- Genre: arcade delivery driving.
- Engine surface: cityBlock night kit, createGameArcadeVehicle (light van feel), createVehicleDriverAi traffic cars, checkpoint sensors, HUD bindings, drift-free handling distinct from Turbo.
- Loop: accept order → timer starts → drive to pickup marker → pick up (sensor) → deliver before timer → tip multiplier by remaining time → chain orders → shift ends after 6 deliveries → timeout = strike, 3 strikes = fail → reset.
- Must differentiate from Turbo: no laps/checkpoints race; city grid navigation, stop-and-go, handbrake stops at markers.
- SFX: engine, horn, pickup chime, delivery cash, timer tick, strike buzzer, night ambience, skid. ~8 cues.
- Tests: unit order/economy math; browser: drive→pickup→deliver→strike→reset. Traffic AI determinism seeded.

**Game 6: Pulse Tunnel** (prototype-risk flagged)
- Genre: rhythm dodger on rails.
- Engine surface: neonTunnel kit, audio bus graph, timeline scheduling, lane input buffering, beat-tolerance window honest claim.
- Loop: ship auto-scrolls → 3 lanes (or 5 positions) → gates/barriers spawn on beat map → dodge + collect pulses on beat → miss = shield loss → 3 shields → song end = run graded S/A/B/C → shields gone = fail → reset.
- Honest sync design: schedule gameplay events from audio clock (AudioContext.currentTime) with tolerance windows; document measured drift; if drift > tolerance, fall back to "music-reactive" mode and label accordingly.
- SFX: this game IS music — one licensed/CC0 music track registered via CLI + hit/miss/pickup/UI cues. Music licensing must be CC0/CC-BY verified through catalog or self-synthesized like existing build-sfx pipelines.
- Tests: unit beat-map parsing; browser: dodge gate→shield loss→fail→reset; sync drift telemetry published.

**Game 7: Mech Hangar Arena** (largest scope, phase last)
- Genre: build-and-battle.
- Engine surface: characterAssembly plans + validation, assets assemble-character CLI, locomotion kit clip maps, combatWorld or fighting kit reuse, arena stage builder.
- Loop: hangar: pick chassis/arms/legs/weapon (each part typed GLB part) → stats preview (speed/armor/power from part metadata) → validate assembly → arena: 1v1 vs rival assembled from mirrored parts → first to 3 KO rounds → credits earned unlock parts → reset/rematch/garage.
- Risk: highest; depends on curated part catalog. Gate: only start after two other games shipped. MVP: 2 chassis × 2 arms × 2 legs = 8 combos.
- Tests: unit assembly validation + stat math; browser: assemble→stats change→fight→KO→garage→unlock.

Shared infrastructure section:
- New app scaffold pattern (copy conventions from existing showcase apps; package.json scripts dev/build/test)
- Asset pipeline: npx @aura3d/cli assets add/resolve/search --profile; aura.assets.json + src/aura-assets.ts generated; never hand-edit
- Audio pipeline: scripts/build-sfx.mjs deterministic synthesis (pattern established in four games), assets add --type audio
- Route registration: apps/showcase-index gallery card, marketing sitemap, deployment via marketing Vercel project (root vercel.json builds marketing)
- Claims: all seven launch as `prototype`; promotion blocked pending human visual review
- Testing conventions: tests/browser/<game>-*.spec.ts, tests/unit/apps/<game>-*.test.ts; polling patterns for load-sensitive assertions (lesson learned from Turbo grounding spec)
- Performance budgets: draw call budgets via sceneKitPerformanceBudget; instancing telemetry for Swarm

Execution order: Siege Golf → Neon Swarm → Aurora Lander → Gravity Post → Courier Rush → Pulse Tunnel → Mech Hangar. With rationale.

Risk register: physics tuning time, catalog asset availability, load-sensitive browser tests, sync drift (Pulse Tunnel), scope creep (Mech Hangar), primitive-subject rule (Swarm drones — mitigated by explicit abstract framing + typed hero).

Master checklist: portfolio gates.

Also include "governing docs read-order" and hard rules (no three imports etc.).

Length: this will be long (~1000+ lines). That's what was asked: "in full". Let me write it well-organized with tables and checkboxes so it's usable as a working doc.

One decision: file location. Root: `/Users/gurbakshchahal/platforms/aura3d/NextGames-PRD.md`. 

Let me also double check naming: user said "call it NextGames-PRD.md". Exact name. Good.

Now write the file. I'll use the write tool. Given size, maybe split into two writes? The write tool takes full content — one call with the whole document. It'll be large but fine.

Let me carefully compose. I'll number tasks like SG-01, NS-01 etc. Checklists with `- [ ]`.

For each game's file plan, include exact paths. Also include generated files marked "(generated)".

Let me draft the content now.

Key details to get right per repo law:
- Imports only @aura3d/engine + generated assets
- One createAuraApp per route
- .runtime(game.runtimeNode(...)) for mutable nodes
- app.onFrame, input.update(dt)
- Pause P, Reset R conventions
- ?debug=1 debug fold
- Reduced motion gating
- Touch controls where applicable
- Evidence globals window.__<GAME>_PROOF__ pattern (Corridor uses __AURA3D_FPS_SHOOT__, Clash uses __AURA_CLASH_ARENA_PROOF__)
- README honest claims + KNOWN-LIMITS notes
- route-health.json generated by commands, never hand-authored
- Screenshots desktop+mobile, first-load/input/mid/fail/reset/finish
- Session length ≥60s
- No CSS fake VFX
- Audio via CLI --type audio, typed refs

For each game I'll define its evidence global name:
- SG: window.__SIEGE_GOLF_PROOF__
- NS: window.__NEON_SWARM_PROOF__
- AL: window.__AURORA_LANDER_PROOF__
- GP: window.__GRAVITY_POST_PROOF__
- CR: window.__COURIER_RUSH_PROOF__
- PT: window.__PULSE_TUNNEL_PROOF__
- MH: window.__MECH_HANGAR_PROOF__

Routes (marketing deployment path convention): existing routes are /apps/showcase-turbo-drift-circuit/. So new: https://aura3d.auraone.ai/apps/showcase-siege-golf/ etc.

Alright — writing now. This is going to be a big file; I'll keep prose tight and lean on tables/lists.
### Visible reply text (block 1, 114 chars)

Now I'll write the full PRD covering all seven games with file-by-file plans, detailed task lists, and checklists.

---

## Attempt 3

### Reasoning (block 0, 18394 chars)

I have the canonical app layout. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root (matching where the user's own files like `continue2.md` live).

Structure per game:
1. Identity block (name, route, genre, claim label, engine surface, priority)
2. Concept & player fantasy
3. Goals / Non-goals
4. Game design (core loop, controls, mechanics, scoring, fail, reset, progression, session length)
5. Presentation direction (visual + audio)
6. File plan — every file by name with purpose (app files, root test files)
7. Asset plan
8. Evidence & test plan
9. Detailed task list (phased with task IDs)
10. Checklist

Plus shared sections: governing docs, portfolio overview table, shared engineering standards, execution order/milestones, risk register, master checklist.

Seven games:
1. Siege Golf ("Wrecking Green") — apps/showcase-siege-golf/
2. Neon Swarm — apps/showcase-neon-swarm/
3. Aurora Lander — apps/showcase-aurora-lander/
4. Gravity Post — apps/showcase-gravity-post/
5. Courier Rush — apps/showcase-courier-rush/
6. Pulse Tunnel — apps/showcase-pulse-tunnel/
7. Mech Hangar Arena — apps/showcase-mech-hangar/

Let me write detailed file plans for each based on the turbo layout:

Common app skeleton per game:
```
apps/showcase-<slug>/
├── package.json
├── tsconfig.json
├── vite.config.ts
├── index.html
├── README.md
├── route-health.json              (generated evidence)
├── showcase-evidence-checklist.json
├── assets/
│   ├── sfx/*.wav                  (source cues)
│   └── models/                    (source GLBs if local)
├── scripts/build-sfx.mjs
├── public/aura-assets/            (generated blobs)
└── src/
    ├── main.ts
    ├── styles.css
    ├── aura-assets.ts             (generated)
    ├── aura.assets.json           (generated)
    └── <game modules>
```

Root tests:
```
tests/browser/<slug>-*.spec.ts
tests/unit/apps/<slug>-*.test.ts
```

Now details per game.

---

**Game 1: Siege Golf (Wrecking Green)**

Concept: physics golf-demolition. Launch ball into jointed structures, knock target pins into sensor cups, par scoring across 9 holes.

Files:
```
apps/showcase-siege-golf/
├── package.json / tsconfig.json / vite.config.ts / index.html / README.md
├── assets/sfx/: clubHit.wav, structureCrack.wav, pinDrop.wav, cupSink.wav, holeFanfare.wav, uiTick.wav, aimLoop.wav, outOfBounds.wav (8 cues)
├── scripts/build-sfx.mjs
├── src/
│   ├── main.ts               — app mount, scene assembly, frame loop wiring
│   ├── styles.css            — HUD chrome
│   ├── course.ts             — 9-hole definitions (structures, targets, pars, tee/cup positions)
│   ├── structures.ts         — jointed stack builders (planks, joints, pins) via physics bodies/joints
│   ├── ball.ts               — ball body state, launch impulse, spin, sleep detection
│   ├── aiming.ts             — aim arc/power UI state, camera framing for shot
│   ├── shot-resolver.ts      — settle detection, pin-in-cup sensor checks, stroke counting
│   ├── scoring.ts            — par/diff/eagle logic, total scorecard
│   ├── hud.ts                — DOM HUD bindings (hole, par, strokes, total, wind? no wind—keep honest)
│   ├── siege-audio.ts        — audio controller + cue manifest
│   └── siege-proof.ts        — deterministic sim proof (fixed-step replay of a hole solve)
└── tests (root):
    tests/browser/siege-golf-playable.spec.ts     — input→shot→sensor→score→reset
    tests/browser/siege-golf-shot-visual.spec.ts  — ball flight pixels, impact FX in scene
    tests/unit/apps/siege-golf-physics.test.ts    — deterministic toppling snapshots
    tests/unit/apps/siege-golf-scoring.test.ts    — par math, edge cases
```

Mechanics detail:
- Controls: ←/→ or mouse drag to aim; hold Space to charge power, release to hit; R reset hole; P pause; N next hole after sink (or auto).
- Physics: dynamic ball sphere; planks as boxes with fixed/hinge joints; pins as convex hulls or capsules; cups as trigger sensors; ground static plane.
- Determinism: fixed-step stepping; seedless deterministic layout; unit test snapshot hashes of settled stacks.
- Session: 9 holes × ~30–60s = 6–10 min full round; single-hole quick play ≥60s evidence.
- Progression: holes unlock sequentially; scorecard persists in localStorage? Careful — keep it session-local to stay deterministic; maybe localStorage is fine as UI-only. I'll say optional.
- Claim label: prototype. No "physics destruction kit" claims.

**Game 2: Neon Swarm**

Concept: top-down-ish third-person arena survival vs instanced drone swarms.

Files:
```
apps/showcase-neon-swarm/
├── assets/sfx/: pulseFire.wav, pulseHit.wav, droneDeath.wav, playerHurt.wav, waveStart.wav, waveClear.wav, dashWhoosh.wav, pickupChime.wav, gameOver.wav, uiConfirm.wav (10)
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── arena.ts             — floor, cover blocks, boundary walls, spawn gates
│   ├── swarm.ts             — instanced enemy pool, spawn director, steering, separation
│   ├── player.ts            — movement, dash i-frames, health
│   ├── combat.ts            — pulse fire (hitscan cone/AOE), damage, knockback
│   ├── waves.ts             — wave definitions, escalation, intermission shop
│   ├── upgrades.ts          — between-wave upgrade choices (3 cards)
│   ├── pickups.ts           — energy shards dropped by drones
│   ├── camera.ts            — cameraDirector follow + shake gating
│   ├── hud.ts               — HP, wave, score, combo, upgrade cards UI
│   ├── swarm-audio.ts       — audio controller
│   └── swarm-proof.ts       — runtime evidence (enemy count, draw telemetry)
└── tests:
    tests/browser/neon-swarm-playable.spec.ts    — move/fire/kill/score/wave/reset
    tests/browser/neon-swarm-instancing.spec.ts  — enemy count ≥N alive, instanced draws ≤ budget
    tests/unit/apps/neon-swarm-waves.test.ts     — wave math determinism
    tests/unit/apps/neon-swarm-steering.test.ts  — separation/seek behavior
```

Key numbers: 300+ concurrent drones target; instancing via `instances.*`; LOD via distanceLod for far drones... actually for a top-down arena all drones are near; instancing alone suffices; LOD optional. Keep honest.

**Game 3: Aurora Lander**

Files:
```
apps/showcase-aurora-lander/
├── assets/sfx/: thrustLoop.wav, touchdownSoft.wav, touchdownHard.wav, crash.wav, padLock.wav, fuelWarn.wav, deploy.wav, missionFanfare.wav, uiMove.wav (9)
├── src/
│   ├── main.ts
│   ├── terrain.ts           — heightfield generation (seeded), collider creation, surface query helpers
│   ├── lander.ts            — thrust, rotation, fuel, velocity state
│   ├── pads.ts              — landing pad placement on flat segments, sensors, grading zones
│   ├── flight-model.ts      — authored gravity/thrust integration (deterministic)
│   ├── grading.ts           — touchdown evaluation (vSpeed, hSpeed, angle, zone)
│   ├── missions.ts          — site chain, payload delivery, multipliers
│   ├── hud.ts               — altitude, v/h speed, fuel, angle indicator, grade card
│   ├── ghost.ts             — best-run replay via input replay export/import
│   ├── lander-audio.ts
│   └── lander-proof.ts
└── tests:
    tests/browser/aurora-lander-playable.spec.ts   — thrust/fuel/land/crash/reset
    tests/browser/aurora-lander-terrain.spec.ts    — terrain collision + pad sensor proof
    tests/unit/apps/aurora-lander-flight.test.ts   — deterministic descent snapshots
    tests/unit/apps/aurora-lander-grading.test.ts  — grading boundaries
```

Heightfield note: static-only heightfield colliders are proven at app.physics level. Terrain visual: generated heightfield mesh via geometry.define/custom or primitives? There's a rendering-internal generated terrain heightfield... but root-safe path: custom indexed geometry (`geometry.define`) proven from root. Good — use geometry.define for terrain mesh + heightfield collider from same data so visuals match collision.

**Game 4: Gravity Post**

Files:
```
apps/showcase-gravity-post/
├── assets/sfx/: launch.wav, burn.wav, slingshot.wav, deliver.wav, missSting.wav, orbitChime.wav, uiAim.wav, levelClear.wav (8)
├── src/
│   ├── main.ts
│   ├── system-map.ts        — planet/station layouts per level (positions, masses, radii)
│   ├── gravity.ts           — authored pairwise gravity integration (deterministic, seeded)
│   ├── pod.ts               — pod state, launch impulse, mid-flight burns, trail
│   ├── trajectory.ts        — predicted path line (simulated forward), rendered as line/instances
│   ├── delivery.ts          — station sensors, scoring by accuracy+fuel
│   ├── levels.ts            — 12 levels progression, star ratings
│   ├── hud.ts
│   ├── gravity-post-audio.ts
│   └── post-proof.ts
└── tests:
    tests/browser/gravity-post-playable.spec.ts  — aim/launch/deliver/fail/reset
    tests/unit/apps/gravity-post-trajectory.test.ts — prediction matches simulation
    tests/unit/apps/gravity-post-levels.test.ts  — solvability smoke (seeded solve paths)
```

Presentation: solarSystem kit styling but custom layout (kit is presentational; route composes its own planets via spheres/materials + labels). Planets can be primitives? Hmm — primitive boundary: named real-world objects need catalog assets; planets in an abstract orbital puzzle = explicitly abstract visualization, allowed if labeled abstract. I'll note that: label the route abstract-stylized; optionally resolve catalog planet/rock GLBs. Safer: stylized abstract planets are fine under "explicit abstract visualization" clause. Document it.

**Game 5: Courier Rush**

Files:
```
apps/showcase-courier-rush/
├── assets/models: courierVan GLB (catalog resolve), traffic car GLB variants (2–3), city props come from cityBlock kit
├── assets/sfx/: engineLoop.wav, sirenNear.wav? no police... keep: pickupBell.wav, dropoffChime.wav, horn.wav, crashThud.wav, timerTick.wav, comboUp.wav, shiftStart.wav, shiftEnd.wav (8)
├── src/
│   ├── main.ts
│   ├── city.ts              — cityBlock night composition, district anchors, road graph waypoints
│   ├── van.ts               — arcade vehicle tuning (createGameArcadeVehicle), damage-less bump feel
│   ├── traffic.ts           — createVehicleDriverAi traffic loops
│   ├── jobs.ts              — pickup/dropoff job chain, timers, combo windows
│   ├── routes.ts            — waypoint navigation for AI + optional guide line
│   ├── economy.ts           — payout, tips, shift goals
│   ├── hud.ts               — job card, timer, minimap? (minimap = DOM UI allowed as UI)
│   ├── courier-audio.ts
│   └── courier-proof.ts
└── tests:
    tests/browser/courier-rush-playable.spec.ts  — drive/pickup/dropoff/combo/reset
    tests/unit/apps/courier-rush-jobs.test.ts    — job chain/timer math
    tests/unit/apps/courier-rush-traffic.test.ts — driver AI determinism
```

Differentiation guard: no laps, no rival race; jobs + clock identity.

**Game 6: Pulse Tunnel**

Files:
```
apps/showcase-pulse-tunnel/
├── assets/audio/: track-loop-01.wav (music bed, CLI --type audio), plus sfx cues: laneSwitch.wav, gateHit.wav, gatePerfect.wav, shieldBreak.wav, runEnd.wav (5)
├── src/
│   ├── main.ts
│   ├── tunnel.ts            — neonTunnel composition, ring/gate spawner
│   ├── beat-clock.ts        — audio-context-scheduled beat clock with tolerance window
│   ├── patterns.ts          — authored gate patterns aligned to BPM grid
│   ├── ship.ts              — lane movement, shield charges
│   ├── conductor.ts         — syncs pattern spawning to beat clock; drift measurement
│   ├── scoring.ts           — perfect/good/miss judgments, multiplier
│   ├── hud.ts               — judgment text, combo, shield pips, calibration offset control
│   ├── pulse-audio.ts
│   └── pulse-proof.ts       — publishes beat-drift stats (honest tolerance claim)
└── tests:
    tests/browser/pulse-tunnel-playable.spec.ts  — dodge/judge/score/fail/reset
    tests/unit/apps/pulse-tunnel-beatclock.test.ts — schedule drift within tolerance
```

Explicit risk section: Web Audio vs rAF drift; mitigation: schedule via AudioContext time, judge with ±80ms window, publish measured drift in proof; label prototype with bounded claim.

**Game 7: Mech Hangar Arena**

Files:
```
apps/showcase-mech-hangar/
├── assets/models: mech part GLBs (torso/arm/leg/weapon × few variants) via characterAssembly plan or manual group assembly
├── assets/sfx/: servoMove.wav, weld.wav, partLock.wav, arenaHorn.wav, cannonFire.wav, stomp.wav, victorySting.wav, uiHover.wav (8)
├── src/
│   ├── main.ts
│   ├── hangar/
│   │   ├── parts-catalog.ts   — part definitions, stat modifiers, typed asset keys
│   │   ├── assembly.ts        — characterAssembly plan build + validation report handling
│   │   └── loadout-ui.ts      — slot picker DOM UI, stat bars
│   ├── arena/
│   │   ├── duel.ts            — 1v1 vs AI using locomotion kit clip maps + combatWorld
│   │   ├── rival-ai.ts        — deterministic roles (aggression presets exist: CombatAi)
│   │   └── arena-stage.ts     — stage nodes
│   ├── shared/
│   │   ├── mech-stats.ts      — derived stats (speed/armor/power) from parts
│   │   └── hangar-audio.ts
│   └── hangar-proof.ts
└── tests:
    tests/browser/mech-hangar-build.spec.ts   — part swap changes stats + silhouette pixels
    tests/browser/mech-hangar-duel.spec.ts    — fight loop win/KO/reset
    tests/unit/apps/mech-hangar-stats.test.ts — stat derivation
```

Scope risk: highest; gated behind shipping games 1–2. Parts strategy: prefer catalog resolve with fighting-character profile; fallback: explicitly abstract labeled mechs from primitives? No — primitive heroes banned unless abstract-labeled. Mechs are named subjects → must be typed GLB parts. If catalog lacks parts, descope to prebuilt full-mech GLB variants (3 whole mechs instead of assembled parts) — still showcases choice without violating rules. I'll write both options with a decision gate.

Shared sections:

Governing docs read-order (llms.txt, claims-and-boundaries, no-hackjob-rules, anti-hallucination-rules, game-example-standards, game-runtime API, build-a-browser-game, known-limits).

Portfolio overview table with priority order: P0 Siege Golf, P0 Neon Swarm, P1 Aurora Lander, P1 Gravity Post, P2 Courier Rush, P3 Pulse Tunnel, P3 Mech Hangar.

Shared engineering standards:
- One createAuraApp per route; public imports only; typed assets only; DOM=UI only; sim leads render follows; reduced motion support; pause/resume; reset completeness; touch controls where sensible; route-health evidence naming renderer mode/fallback/assets/primitive count/claims; README honesty; classification stays prototype until human review.
- Audio pipeline: scripts/build-sfx.mjs → assets add --type audio → typed manifests (pattern proven in the four-game pass).
- Deployment: marketing Vercel project, vercel.json already configured for marketing build; new apps need gallery card registration in apps/showcase-index and marketing routing checks; deploy via prebuilt flow given past upload failures.

Execution order & milestones:
- M0: portfolio bootstrap (scaffold conventions doc alignment, index cards placeholders?) — actually keep minimal.
- M1: Siege Golf complete
- M2: Neon Swarm complete
- M3: Aurora Lander
- M4: Gravity Post
- M5: Courier Rush
- M6: Pulse Tunnel
- M7: Mech Hangar
Each milestone ends with evidence gates + human visual review request.

Risk register: physics perf on low-end, instancing material limits, beat sync drift, catalog part availability, scope creep, load-sensitive browser tests (lesson from Turbo grounding spec — poll-based assertions, avoid tight timing), deployment upload failures (use prebuilt).

Master checklist: per-game gates condensed + portfolio gates.

Also include for each game an "Acceptance checklist" with checkbox syntax `- [ ]`.

Length: this will be long (~1000+ lines). That's what was asked: "in full". Let me write it efficiently but completely. I'll use consistent per-game template.

One more consideration: user said "do it by file name" — I interpret: organize the work breakdown by exact file names (file-by-file plans + tasks referencing files). I'll make each task list reference concrete file names.

Also should I number games' routes: live route paths like `/apps/showcase-siege-golf/` served by marketing dist. Marketing copies apps into dist? From earlier context: marketing builds and serves `/apps/...` routes. Deployment section will mention verifying route on aura3d.auraone.ai after deploy.

Let me now write the file. It'll be big; I'll write it in one write call. Let me draft carefully.

Also add a "Definition of Done (per game)" identical bar derived from game-example-standards.md.

Session length requirement: ≥60s meaningful play evidence. For each game define authored session length:
- Siege Golf: 9 holes, full round ~6–9 min; quick-play single hole ≥60s.
- Neon Swarm: run to first death ≥90s typical; wave 1 clear ~45s, three-wave tour ≥150s.
- Aurora Lander: 4-site mission chain ~3–5 min; single descent 60–90s.
- Gravity Post: 12 levels; early levels 20–40s each; first session ≥5 min.
- Courier Rush: shift = 5 jobs ≈ 4 min; single job ≤75s.
- Pulse Tunnel: one song run ≈ 90s.
- Mech Hangar: hangar build 2–3 min + best-of-3 duels ≈ 3 min.

Controls per game defined. Pause key P everywhere; reset R everywhere (consistency with existing games).

Evidence globals: each game publishes window.__<GAME>_PROOF__ style object (consistent with existing patterns like __AURA_CLASH_ARENA_PROOF__, __WORLD_WAR_X_EVIDENCE__). Names:
- __SIEGE_GOLF_PROOF__
- __NEON_SWARM_PROOF__
- __AURORA_LANDER_PROOF__
- __GRAVITY_POST_PROOF__
- __COURIER_RUSH_PROOF__
- __PULSE_TUNNEL_PROOF__
- __MECH_HANGAR_PROOF__

Good consistency.

Now write. I'll produce the markdown content. Given size, careful formatting. Use tables where compact. Checkboxes for checklists.

File name: NextGames-PRD.md at repo root: /Users/gurbakshchal/platforms/aura3d/NextGames-PRD.md — wait, correct path: /Users/gurbakshchahal/platforms/aura3d/NextGames-PRD.md.

Let me compose the document now. I'll keep each game section rich but avoid redundant boilerplate by having a strong shared standards section, then per-game specifics.

Draft outline sizes: header + how-to-use + governing docs (~60 lines), portfolio table (~20), shared standards (~120), then 7 games × ~130 lines avg (~900), milestones (~40), risks (~40), master checklist (~80). Total ~1250 lines. Acceptable.

Let me write it.
### Visible reply text (block 1, 148 chars)

The layout is confirmed. Now I'll write the full PRD covering all seven games with file-by-file plans, phased task lists, and acceptance checklists.

---

## Attempt 4

### Reasoning (block 0, 24848 chars)

I have the canonical app layout. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root (matching the user's naming, similar to their `continue2.md` root-level file pattern).

Structure per game:
- Identity block (name, route, genre, label, priority)
- Summary & fantasy
- Goals / Non-goals
- Game design: core loop, controls table, mechanics detail, scoring/fail/reset/progression, session length
- Presentation direction: visual + audio + HUD
- File plan: complete file-by-file listing with purpose per file
- Asset plan: CLI commands, asset names
- Evidence & test plan: unit tests, browser tests, route-health, screenshots
- Task list: phased with task IDs and checkboxes... actually the user wants "detailed task list and checklist" — I'll do a detailed task list (phased, numbered tasks) AND a checklist section (acceptance gates as checkboxes).

Then portfolio-level sections:
- Execution order/milestones
- Shared infrastructure tasks
- Risk register
- Master checklist

The 7 games:
1. Siege Golf ("Wrecking Green") — apps/showcase-siege-golf/
2. Neon Swarm — apps/showcase-neon-swarm/
3. Aurora Lander — apps/showcase-aurora-lander/
4. Gravity Post — apps/showcase-gravity-post/
5. Courier Rush — apps/showcase-courier-rush/
6. Pulse Tunnel — apps/showcase-pulse-tunnel/
7. Mech Hangar Arena — apps/showcase-mech-hangar/

For each I need to define the file plan grounded in the turbo layout:

```
apps/showcase-<slug>/
├── package.json
├── README.md
├── index.html
├── tsconfig.json
├── vite.config.ts
├── route-health.json              (generated by route gate tooling)
├── showcase-evidence-checklist.json
├── assets/
│   ├── sfx/*.wav                  (source cues)
│   └── models/                    (source GLBs if local)
├── scripts/
│   └── build-sfx.mjs
├── public/aura-assets/            (generated blobs via CLI)
├── src/
│   ├── main.ts                    (app mount, scene assembly, wiring)
│   ├── aura-assets.ts             (GENERATED by CLI - do not hand-edit)
│   ├── aura.assets.json           (GENERATED provenance - do not hand-edit)
│   ├── styles.css                 (HUD/UI chrome only)
│   ├── hud.ts                     (DOM HUD bindings)
│   ├── <game>-audio.ts            (audio controller + manifest)
│   ├── feel.ts / state modules    (route-local gameplay)
│   └── generated/game-geometry.ts (if certified geometry needed; generated)
└── tests/
    └── *.spec.ts                  (app-local Playwright if applicable)
```

Plus repo-level:
```
tests/browser/<slug>-*.spec.ts
tests/unit/apps/<slug>-*.test.ts
apps/showcase-index/ registration
marketing sitemap/gallery card
aura.assets.json + src/aura-assets.ts (root, if assets registered at root level — actually routes register locally per the four-games work: "route-local generated asset manifests")
```

From the compacted summary: "aura.assets.json, src/aura-assets.ts, and route-local generated asset manifests — Regenerated typed asset registrations for the new audio assets." So both root-level and route-local manifests... it showed src files but no aura-assets.ts! Interesting — turbo's src doesn't include aura-assets.ts in the glob output. Wait, looking again: turbo src has audio-cues.ts, feel.ts, generated/game-geometry.ts, hud.ts, main.ts, opponent-ai.ts, passing-lane.ts, race-proof.ts, styles.css, turbo-audio.ts. No aura-assets.ts visible. Hmm, but the summary said route-local generated asset manifests were regenerated for the four games. Maybe turbo uses a different mechanism (game-template composition). Skyline/clash may have them. Not critical — the PRD will specify CLI-generated typed manifests per app following llms.txt (`import { assets } from "./aura-assets"`), which is the canonical documented pattern.

Let me not over-index on turbo's exact quirk; the PRD defines the target state per docs.

Now — details per game. Let me design each properly.

---

**GAME 1: Siege Golf (Wrecking Green)**

Concept: physics puzzle-golf. Launch ball into jointed structures, knock target pins into sensor cups or topple towers onto target plates. Par per hole. 9 holes across 3 biomes.

Core loop: aim (mouse drag or arrow keys rotate aim arc) → power (hold space to charge meter) → launch → watch simulation resolve (max ~6s settle window) → score counted when targets hit sensors or ball rests in cup → strokes increment → next shot from where ball rests (or reset-to-tee after out of bounds) → hole complete when all targets down or ball cupped → par comparison → next hole → course summary.

Controls:
- A/D or ←/→: rotate aim
- W/S: camera height/pitch preset cycle? Keep simple: Q/E camera orbit presets
- Space hold/release: charge and fire
- R: reset shot (re-tee, +1 stroke penalty)
- N: next hole (after complete)
- P: pause
- M: mute

Mechanics:
- Ball: dynamic sphere body, impulse launch
- Structures: stacked dynamic boxes/planks connected with fixed/spring joints; some motorised hinge spinners as obstacles
- Targets: sensor cups (cup trigger = sink), knock-target pins standing on sensor plates (pin toppling detection via orientation threshold or plate trigger when pin body sleeps on plate... simpler: pin falls below Y threshold within target zone → scored)
- Bounce pads (spring joints / high-restitution surfaces)
- Moving spinner obstacles (motorised hinge)
- Out of bounds: water planes → re-tee penalty
- Settle detection: bodies sleeping or timeout → scoring resolution

Scoring: strokes vs par per hole; total course score; star rating (eagle/birdie/par/bogey). Progression: holes unlock sequentially; best-score persistence in localStorage (careful: deterministic tests use fresh state).

Session: 9 holes × ~40–70s = 6–10 min full course; single-hole quick play ≥60s meaningful evidence standard satisfied by full-course mode.

Visual: three biomes (Dawn Meadow, Dusk Quarry, Night Rooftop) — palette/fog/lighting shifts per 3 holes; typed primary assets: a catalog "golf ball" is overkill — ball can be emissive sphere primitive? NO — primitive boundary: primary subject must be typed unless explicitly abstract. Hmm. The ball is the hero object. Options: resolve a catalog ball/sphere prop, or label the route explicitly abstract. Safer: resolve catalog props for structures (crates, barrels, planks) and a distinctive hero ball (catalog "glowing orb" or metal sphere). Also flags/cups from catalog. Let me spec: CLI-resolve "wooden crate", "wooden plank", "metal barrel", "stone pillar", "golf flag", "glowing sphere orb". If catalog lacks good ball, use polished metal sphere primitive but then route must be labeled abstract-ish... Better to require catalog resolution with fallback documented. I'll write: primary props typed; ball resolved from catalog ("chrome sphere ball ornament"); fallback documented in KNOWN-LIMITS as explicitly abstract sports equipment.

Audio: swing/launch whoosh, impact wood/metal/stone variants, topple rumble, cup sink chime, par fanfare, UI clicks, ambient biome loops. ~12 cues via scripts/build-sfx.mjs deterministic synthesis (matching the established pattern).

Engine surface: app.physics dynamic bodies, fixed/spring/motorised-hinge joints, sensors onTriggerEnter, sleep/settle detection, deterministic stepping for tests, games.createMiniGolfState() partially reused for stroke/score semantics? The mini golf state controller covers shots/score/cup/reset — reuse where it fits, document deviations as route-local.

File plan (detailed):
```
apps/showcase-siege-golf/
├── package.json                        # app scripts: dev/build/test, deps @aura3d/engine
├── README.md                           # honest claims, controls, known limits
├── index.html                          # mount #app + HUD containers
├── tsconfig.json
├── vite.config.ts
├── assets/
│   ├── models/                         # source GLBs downloaded via CLI resolve
│   └── sfx/                            # source WAVs (generated by script)
│       ├── swingWhoosh.wav … etc
├── scripts/build-sfx.mjs               # deterministic SFX synthesis → assets/sfx
├── public/aura-assets/                 # CLI-generated blobs + thumbnails
├── src/
│   ├── main.ts                         # createAuraApp mount, scene assembly, frame loop wiring
│   ├── aura-assets.ts                  # GENERATED typed asset map (CLI)
│   ├── aura.assets.json                # GENERATED provenance (CLI)
│   ├── styles.css                      # HUD chrome only (no fake VFX)
│   ├── course.ts                       # 9-hole definitions: tee, targets, pars, biome id
│   ├── hole-builder.ts                 # builds scene nodes + physics bodies/joints/sensors per hole def
│   ├── ball.ts                         # ball controller: launch impulse, rest/OOB detection
│   ├── structures.ts                   # stack/joint recipes (tower, plank bridge, spinner, pendulum)
│   ├── scoring.ts                      # strokes, par, stars, settle resolution, OOB penalties
│   ├── settle.ts                       # sleep/timeout settle detector
│   ├── camera-rig.ts                   # aim cam, follow cam, sink cam via game.cameraDirector
│   ├── hud.ts                          # DOM HUD: hole, par, strokes, power meter, wind? (no wind—nonphysical ok arcade), banners
│   ├── siege-audio.ts                  # audio controller + cue manifest
│   └── evidence.ts                     # window.__SIEGE_GOLF_EVIDENCE__ contract
└── tests/
    └── siege-golf-playable.spec.ts     # app-local smoke (optional; canonical tests live at repo root)
tests/browser/siege-golf.spec.ts        # movement/aim/fire, sink, score, reset, pause, audio cue
tests/browser/siege-golf-shot-visual.spec.ts  # ball leaves tee along aim line (pixel-backed)
tests/unit/apps/siege-golf-scoring.test.ts    # deterministic sim: launch→topple→sensor→score snapshots
tests/unit/apps/siege-golf-settle.test.ts     # settle detector + OOB penalty logic
```

Task list phases: scaffold → assets → course data → builder → ball/launch → structures/joints → sensors/scoring → camera → HUD → audio → evidence → browser tests → polish pass → route-health/deploy.

Checklist: input changes state; objective; scoring; fail (OOB/stroke cap); reset; progression (hole unlock); typed assets; route-health fields; screenshots set; session length; labels honest; no forbidden imports; reduced motion; mobile readable.

---

**GAME 2: Neon Swarm**

Top-down-ish third-person arena survival. Player = catalog mech/android character or hover drone; enemies = instanced drones.

Wait — instancing uses primitives (instances.box/sphere/etc). Enemy horde as instanced primitives conflicts with "primitive-only primary subject"? Enemies are named creatures? They're abstract drones — the anti-pattern says primitives not allowed as primary character/creature for a *named* prompt. A swarm of abstract geometric drones in an explicitly stylized neon arena could qualify as "explicit abstract visualization"... risky. Mitigation: player hero must be a typed catalog character/mech (primary subject), enemies are explicitly abstract swarm entities (documented as abstract set dressing akin to particles). That's defensible: enemies function as hazards/projectiles, hero + arena are typed. I'll spec: hero = catalog mech/drone GLB; arena floor/props = cityBlock kit or catalog crates; swarm = instanced primitives explicitly labeled abstract hazard entities in README/route-health claims.

Loop: waves spawn at street edges → move (WASD) + dash (Shift) + pulse fire (J auto-aim nearest or facing) → kills drop energy pickups → between waves spend energy on upgrades (fire rate/dash cooldown/pulse radius) → survive N waves → extraction pad opens → reach pad = win. Death = fail → reset wave 1.

Progression: wave counter, upgrade tiers, best-wave record.
Fail: HP zero.
Session: 8 waves × ~35s ≈ 5 min; evidence run uses first 2 waves deterministically.

Engine: instances.* for drones (≤2 draws), distanceLod, CPU culling, game.effects for hits, particles for deaths, cameraDirector top-down chase, touch dual-stick layout, input buffering, accessibility reduced motion.

Files:
```
apps/showcase-neon-swarm/
├── package.json / README.md / index.html / tsconfig.json / vite.config.ts
├── assets/sfx/*.wav (~10 cues) ; scripts/build-sfx.mjs ; public/aura-assets/
├── src/
│   ├── main.ts
│   ├── aura-assets.ts (GEN) / aura.assets.json (GEN)
│   ├── styles.css
│   ├── arena.ts            # arena geometry, spawn edges, extraction pad, prop cover
│   ├── swarm.ts            # instanced drone pool: spawn, steering, separation, despawn
│   ├── swarm-material.ts   # instancing-aware emissive material config
│   ├── player.ts           # hero controller: move/dash/fire, i-frames, HP
│   ├── combat.ts           # pulse projectiles/hitscan, damage, knockback
│   ├── upgrades.ts         # between-wave shop state machine
│   ├── waves.ts            # wave scripting, budget scaling, spawn scheduling
│   ├── pickups.ts          # energy orbs, magnet radius
│   ├── camera-rig.ts
│   ├── hud.ts              # HP, wave, energy, upgrade cards, banners
│   ├── swarm-audio.ts
│   └── evidence.ts         # __NEON_SWARM_EVIDENCE__
└── tests/…
tests/browser/neon-swarm.spec.ts        # move/fire/kill/score/wave/reset/pause
tests/browser/neon-swarm-instancing.spec.ts  # draw-call telemetry + enemy count pixels
tests/unit/apps/neon-swarm-waves.test.ts     # deterministic wave budget/scaling
tests/unit/apps/neon-swarm-steering.test.ts  # steering/separation invariants
```

---

**GAME 3: Aurora Lander**

Side-view? Or 2.5D behind? Classic lunar lander is side view — fine in 3D scene with orthographic-ish perspective camera. Terrain: static heightfield collider generated at build time (authored seed list, NOT runtime random, for determinism). Thrust fuel, rotate, land on pads.

Win: land within velocity/angle tolerance on a pad → payload delivered → next site. Sites chain into a "shift" of 5 landings; fuel carries over partially. Fail: crash (velocity/angle exceed) or OOB.

Engine: static heightfield shape (AURA_STATIC_ONLY_SHAPES includes heightfield per capability report), createMeshSurfaceQuery BVH for terrain height/normal under lander, kinematic-or-dynamic lander body (dynamic with forces is natural), sensors for pads, text3D altitude markers, deterministic replay export/import as feature ("flight recorder").

Typed assets: lander = catalog "lunar module spacecraft" or authored from characterAssembly? Keep catalog resolve "space lander capsule"; pads = catalog beacon/landing pad props; terrain mesh = custom indexed geometry (proven) + matching heightfield collider.

Files:
```
apps/showcase-aurora-lander/
├── ...standard shell
├── scripts/generate-terrain.mjs      # seeded heightfield → src/generated/terrain.ts + collision heights JSON
├── src/
│   ├── main.ts
│   ├── aura-assets.ts (GEN) / aura.assets.json (GEN)
│   ├── generated/terrain.ts          # GENERATED heights/mesh indices (do not hand-edit)
│   ├── terrain-query.ts              # BVH surface query wrapper: height/normal sampling
│   ├── lander.ts                     # thrust/rotation/fuel, rigid body integration
│   ├── landing.ts                    # touchdown grading: vy, vx, angle, pad zone
│   ├── sites.ts                      # 5 landing site defs (seed, pad pos, fuel budget)
│   ├── flight-recorder.ts            # input replay capture/export/import (feature!)
│   ├── camera-rig.ts
│   ├── hud.ts                        # altimeter, v-speed, fuel, angle indicator, grade card
│   ├── lander-audio.ts               # thrust loop, RCS puffs, touchdown, alarm, crash
│   └── evidence.ts
tests/browser/aurora-lander.spec.ts          # thrust changes altitude, soft landing win, crash fail, reset
tests/browser/aurora-lander-replay.spec.ts   # recorded flight replays to identical outcome (hash)
tests/unit/apps/aurora-lander-grading.test.ts
tests/unit/apps/aurora-lander-terrain.test.ts # query vs mesh agreement
```

---

**GAME 4: Gravity Post**

Orbital courier. Top-down solar view using solarSystem kit presentation (or dedicated mini-system with 4 planets). Route-local Newtonian-lite gravity (authored, non-physical claim-wise). Launch pods from post station; trajectory prediction line; deliver to station orbit sensors; gravity assists bonus.

Win: deliver quota per sector (e.g., 5/7 pods) before runs out. Fail: quota missed after N launches. Progression: sectors unlock, assist streak multiplier.

Engine: kinematic pods w/ authored acceleration integration (or dynamic bodies with force application — cleaner: app.physics dynamic bodies + applyForce each step), sensors around stations, timeline for delivery cinematics, labels for planet names, text3D sector titles.

Files:
```
apps/showcase-gravity-post/
├── scripts/… standard
├── src/
│   ├── main.ts
│   ├── aura-assets.ts (GEN)/aura.assets.json (GEN)
│   ├── system-map.ts        # planet defs: mass well radius, strength, station orbits
│   ├── gravity.ts           # authored well-fall-off integration (pure functions, unit-tested)
│   ├── pod.ts               # launch impulse, burn control, trail
│   ├── prediction.ts        # forward-integrated trajectory line points
│   ├── deliveries.ts        # station sensors, quota, assist streaks, scoring
│   ├── sectors.ts           # sector progression defs
│   ├── camera-rig.ts
│   ├── hud.ts               # quota, fuel/burns, streak, sector banner
│   ├── gravity-post-audio.ts
│   └── evidence.ts
tests/browser/gravity-post.spec.ts       # launch moves pod, delivery scores, fail, reset
tests/unit/apps/gravity-post-trajectory.test.ts  # prediction matches simulated path (pure fn parity)
tests/unit/apps/gravity-post-economy.test.ts     # quota/streak math
```

Typed assets: post station = catalog "space station"; pods = catalog "cargo container sci-fi"; planets = solar kit presets (presentational kit usage allowed).

---

**GAME 5: Courier Rush**

Night-city delivery. cityBlock night kit as the world; arcade van (createGameArcadeVehicle) with different tuning than Turbo; traffic cars driven by createVehicleDriverAi on lane waypoints; pickup/dropoff markers; timer per delivery; combo for punctual chains.

Win: complete shift quota (e.g., 6 deliveries) before shift clock ends. Fail: shift clock expires mid-contract (contract fails, continue until quota impossible → shift end screen). Progression: earnings, tip multiplier.

Must differentiate from Turbo: no laps/checkpoints racing; it's errand routing with traffic avoidance; lighter, boxier van; night lighting.

Files:
```
apps/showcase-courier-rush/
├── src/
│   ├── main.ts
│   ├── GEN manifests
│   ├── city.ts               # cityBlock kit config, district anchors, road graph waypoints
│   ├── van.ts                # createGameArcadeVehicle tuning + cargo state
│   ├── traffic.ts            # createVehicleDriverAi pool on waypoint lanes
│   ├── contracts.ts          # pickup/dropoff generation, timers, tips
│   ├── shift.ts              # shift clock, quota, earnings, end states
│   ├── minimap.ts            # DOM/canvas minimap (UI allowed) fed by runtime positions
│   ├── camera-rig.ts
│   ├── hud.ts
│   ├── courier-audio.ts
│   └── evidence.ts
tests/browser/courier-rush.spec.ts    # drive, pickup, dropoff, earn, fail, reset, pause
tests/unit/apps/courier-rush-contracts.test.ts
tests/unit/apps/courier-rush-van-tuning.test.ts  # distinct-from-turbo handling envelope assertions
```

---

**GAME 6: Pulse Tunnel**

Rhythm dodger. Auto-forward through neonTunnel-style corridor; 3 lanes; obstacles spawn on beat patterns; hold/tap to switch lanes, jump? Keep lanes + duck. Music: synthesized beat track via Web Audio (registered asset), obstacles scheduled from a beat map JSON derived from same constants as audio tempo — sync strategy: schedule obstacle arrival to audio clock (audioContext.currentTime) rather than frame time; document tolerance ±80ms; prototype label.

Win: survive track (≈90s) reaching portal. Fail: 3 hits. Score: perfect-dodge streaks.

Honesty: this one ships as explicit prototype with bounded sync claim; KNOWN-LIMITS entry required.

Files:
```
apps/showcase-pulse-tunnel/
├── scripts/build-music.mjs      # deterministic beat WAV stems synthesis
├── src/
│   ├── main.ts
│   ├── GEN manifests
│   ├── beatmap.ts               # pattern data (seeded), beat→distance mapping
│   ├── audio-clock.ts           # Web Audio clock bridge, drift measurement
│   ├── tunnel.ts                # tunnel kit config, ring spawner, lane geometry
│   ├── runner.ts                # lane switching, duck, hit/i-frames
│   ├── obstacles.ts             # gate/bar types tied to patterns
│   ├── score.ts                 # streaks, combo multipliers
│   ├── camera-rig.ts
│   ├── hud.ts
│   ├── pulse-audio.ts
│   └── evidence.ts
tests/browser/pulse-tunnel.spec.ts   # lane input dodges, hit decrements lives, fail, reset
tests/unit/apps/pulse-tunnel-beatmap.test.ts  # pattern validity, no impossible overlaps
tests/unit/apps/pulse-tunnel-clock.test.ts    # drift math pure functions
```

---

**GAME 7: Mech Hangar Arena**

Two-phase: hangar builder (characterAssembly parts → stats) + arena duel vs AI rival using locomotion kit + combatWorld. Scope-flagged as Phase-2 portfolio item, gated on one earlier game shipping.

Hangar: pick chassis/arms/legs/weapon from curated part set (all CLI-registered); validation report shown; stats derive from part metadata weights; save loadout to localStorage; "Deploy" transitions to arena.

Arena: 1v1, best of 3 rounds, simple moves (light/heavy/dash-block) mapped to assembled parts visually (weapon model swaps!). Uses createGameLocomotionKit clip maps + game.combatWorld.

Files:
```
apps/showcase-mech-hangar/
├── scripts/curate-parts.mjs     # resolves/validates part candidates via CLI, writes parts manifest
├── src/
│   ├── main.ts
│   ├── GEN manifests
│   ├── parts-catalog.ts         # part defs: ids, slots, stat blocks, asset keys
│   ├── hangar.ts                # assembly UI state, characterAssembly plan, validation display
│   ├── stats.ts                 # loadout → combat stats derivation (pure)
│   ├── arena-stage.ts           # stage build (games.fighting.stagePreset industrial?)
│   ├── duel.ts                  # round flow, combatWorld wiring, AI rival roles
│   ├── loadout-store.ts         # localStorage persistence (test-safe accessor)
│   ├── camera-rig.ts
│   ├── hud.ts                   # hangar panels + fight HUD
│   ├── hangar-audio.ts
│   └── evidence.ts
tests/browser/mech-hangar.spec.ts    # swap part changes stats+model, deploy enters arena, KO, rematch
tests/unit/apps/mech-hangar-stats.test.ts
tests/unit/apps/mech-hangar-assembly.test.ts # validation report shapes
```

---

Shared/portfolio sections:
- Execution order: Siege Golf → Neon Swarm → Aurora Lander → Gravity Post → Courier Rush → Pulse Tunnel → Mech Hangar. With milestone gates.
- Shared infra tasks: showcase-index card registration per game; marketing gallery + sitemap updates; deployment via marketing project (root vercel.json already configured for marketing build — new apps automatically included since they're workspace apps built into marketing/dist? Actually marketing build copies apps? From the deployment history: marketing/dist serves /apps/... routes. So adding an app requires marketing build config awareness — add a task "verify marketing build includes new app route + deploy-check").
- Risk register.
- Master checklist.

Also governing rules section referencing docs to read (claims-and-boundaries, no-hackjob, anti-hallucination, game-example-standards, visual-quality-standard).

Length concern: this will be a long file (~1000+ lines). That's what was asked ("in full", "detailed"). Let me write it efficiently — dense tables and tight bullets, consistent structure so it's skimmable.

One more consideration: user said "do it by file name" — I'll make each game's File Plan section an explicit table of every file with purpose + generated-vs-authored status. And task lists reference file names in tasks.

Also include per-game "Definition of Done checklist" with checkbox syntax `- [ ]`.

Portfolio master checklist at end.

Evidence globals naming: follow existing conventions like `window.__AURA_CLASH_ARENA_PROOF__`, `__WORLD_WAR_X_EVIDENCE__`. I'll define per-game evidence global names.

Route URLs: `/apps/showcase-siege-golf/` etc.

Claim labels: all seven start at `prototype`; promotion blocked pending human visual review (per repo law). Pulse Tunnel additionally bounded sync claim. Neon Swarm enemy abstraction note. No genre-parity language.

Now write the file. It'll be big; that's fine. Then verify it was written, maybe run a quick lint check? There's `pnpm check:agent-docs` for docs/agents — my file is at root, not in docs/, so those checks don't apply. I'll just write it.

Let me draft carefully but completely.
### Visible reply text (block 1, 103 chars)

Now I'll write the full PRD covering all seven games with file-level plans, task lists, and checklists.

---

## Attempt 5

### Reasoning (block 0, 12754 chars)

I now have the canonical layout of a showcase app. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root.

Structure:
1. Header: version, date, status, scope
2. Governing docs / read-order
3. Portfolio summary table
4. Shared standards (claims, evidence, assets, audio, deployment)
5. Per-game PRDs (7 games), each with:
   - Summary & positioning
   - Goals / non-goals
   - Claim label
   - Game design (core loop, controls, mechanics, scoring, fail, reset, progression, session length)
   - Presentation (visual, audio, HUD)
   - File plan (exact file names with purposes) — the "by file name" requirement
   - Asset plan
   - Evidence & test plan
   - Detailed task list (phased with IDs like SG-1, SG-2...)
   - Checklist (acceptance gates)
6. Cross-game execution order & milestones
7. Risk register
8. Master portfolio checklist

The seven games:
1. Siege Golf "Wrecking Green" — apps/showcase-siege-golf/
2. Neon Swarm — apps/showcase-neon-swarm/
3. Aurora Lander — apps/showcase-aurora-lander/
4. Gravity Post — apps/showcase-gravity-post/
5. Courier Rush — apps/showcase-courier-rush/
6. Pulse Tunnel — apps/showcase-pulse-tunnel/
7. Mech Hangar Arena — apps/showcase-mech-hangar/

Each game's file plan needs to be concrete. Based on the turbo layout:

```
apps/showcase-siege-golf/
├── package.json
├── README.md
├── index.html
├── tsconfig.json
├── vite.config.ts
├── route-health.json (generated)
├── showcase-evidence-checklist.json
├── assets/
│   ├── sfx/*.wav (source)
│   └── (models if local)
├── scripts/build-sfx.mjs
├── public/aura-assets/ (generated blobs)
├── src/
│   ├── main.ts
│   ├── styles.css
│   ├── aura-assets.ts (generated)
│   ├── aura.assets.json (generated)
│   └── game/
│       ├── course.ts (hole definitions)
│       ├── structures.ts (jointed stacks)
│       ├── ball.ts
│       ├── shot.ts (aim/power)
│       ├── scoring.ts
│       ├── hud.ts
│       ├── audio.ts + audio-manifest.ts
│       ├── feel.ts (camera/effects)
│       └── proof.ts (evidence object)
└── tests/ (app-local playwright if pattern exists)
```

Wait — do the showcase apps have their own tests dir? Turbo has tests in root tests/. Aura Clash has app-local `tests/combat-feel.spec.ts`. Both patterns exist. I'll specify root `tests/browser/` specs + `tests/unit/apps/` unit tests as primary, matching the dominant pattern.

Root-level files per game:
- `tests/browser/<name>-*.spec.ts`
- `tests/unit/apps/<name>-*.test.ts`
- `apps/showcase-index/` registration (gallery card) — need to check how showcase-index lists games; there's `apps/showcase-index/` with dist/llms.txt. I'll include a task to register the route in the showcase index and marketing sitemap.

Deployment: marketing Vercel project, root vercel.json builds marketing; routes served under /apps/<name>/. Include deployment tasks per game (build marketing, deploy, verify URL 200 + screenshots).

Now the details per game. Let me design each carefully but concisely-enough. This will be a long file — that's expected ("in full"). Let me draft the content.

Key grounding constraints to bake in:
- Public imports only from `@aura3d/engine` + generated `assets` (no three, no GLTFLoader)
- Typed assets via CLI; no string IDs/raw URLs
- No primitive-only primary subjects (named objects need catalog GLBs) — for Siege Golf structures, primitives are fine? Hmm: "Primitives are allowed for: set dressing... simple abstract visualization where the route is labeled abstract." For a physics puzzle with stacked boxes, the *structures* are the gameplay geometry. Is a stack of crates "a named object"? The primary subject rule applies to "primary character, vehicle, product, creature, weapon, world, or hero environment". A ball could be a catalog asset (sphere-ish ball GLB), targets could be catalog props (barrels, crates, pins). I'll spec: resolve catalog props for targets/props (barrels/crates/pins), ball from catalog, environment/ground can be primitives + kit. That satisfies the rule.
- Neon Swarm: enemies as instanced primitives — is that a "creature made only from primitives"? Risk! The rule says primitives are not allowed as primary creature for a named real-world or game prompt... but instancing only supports primitives/custom geometry. Hmm. Options: (a) label the route explicitly abstract ("abstract visualization" — drone swarm as abstract geometric hostiles is a designed aesthetic, e.g., Geometry Wars style); (b) use instanced spheres as "drones" — abstract geometric enemies. I'll design Neon Swarm as explicitly abstract-styled (the PRD states the route is labeled as abstract geometric combat, hero is a catalog ship/drone GLB, enemies are abstract instanced geometry by design). That's defensible: the *hero* is a real typed asset; the swarm is explicitly abstract. I'll note this as a claim-boundary decision.
- Aurora Lander: lander = catalog GLB (lander/pod/spacecraft), terrain = heightfield (world geometry, generated — fine, it's terrain not a named object; "world" primary environment... hmm, "hero environment" primitive-only is disallowed unless abstract. A generated heightfield terrain is custom geometry, not primitives per se — geometry.define/custom indexed geometry is root-proven. Terrain from heightfield data is authored world geometry; I'll treat it as acceptable with a note, since heightfields are a physics shape + custom geometry, and the *hero* lander + pads + skybox props carry the visual identity. I'll add explicit note to keep the route honest: terrain is authored custom geometry, not primitive boxes.)
- Gravity Post: solar kit provides planets (kit-owned presentation), pod = catalog probe/satellite GLB.
- Courier Rush: van = catalog GLB (van/delivery truck), city kit.
- Pulse Tunnel: ship = catalog GLB, tunnel kit.
- Mech Hangar: parts from catalog via assemble-character; arena stage.

Audio: every game gets CLI-registered SFX via scripts/build-sfx.mjs pattern (deterministic synthesized WAVs), typed manifests.

Evidence: each game needs:
- route-health.json (regenerated, not hand-authored)
- browser specs covering movement/input, reset, win/fail/score/progression
- unit tests for pure logic
- screenshots: first load, after input, mid, fail/reset, finish — desktop + mobile
- window evidence object
- README honest claims
- showcase-index registration
- deployment verification

Session length ≥ 60s.

Now task lists: I'll use IDs like SG-01…, NS-01…, AL-01…, GP-01…, CR-01…, PT-01…, MH-01…, plus shared tasks XG-01…

Checklists: per-game acceptance checklist with checkboxes, plus master checklist.

Also include "Out of scope / non-goals" per game and portfolio-level non-goals (multiplayer, WebGPU claims, navmesh claims, ragdoll, classification promotion without human review).

Priority order: Siege Golf (P1), Neon Swarm (P2), Aurora Lander (P3), Gravity Post (P4), Courier Rush (P5), Pulse Tunnel (P6, prototype-gated), Mech Hangar (P7, descope-gated).

Let me also include for each game: "Engine surface used" table mapping mechanic → public API → proof requirement. This is the strongest grounding.

Length: this will be a very large markdown file (maybe 1200-1600 lines). That's fine — "in full" was requested. But I should be careful to remain high-quality and not padded. Let me write it.

One more consideration: the user said "do it by file name" — I interpret: the PRD must be organized around concrete file names (the file plan per game). I'll make the File Plan sections the centerpiece with tables: file path | owner | purpose | generated? | tests bound.

Let me write the file now with the write tool. Path: /Users/gurbakshchal/platforms/aura3d/NextGames-PRD.md — wait, careful: /Users/gurbakshchahal/platforms/aura3d/NextGames-PRD.md.

Let me compose the document.

Draft outline per game (I'll keep consistent structure):

### N.1 Summary
### N.2 Positioning and claim label
### N.3 Goals
### N.4 Non-goals
### N.5 Game design
- Core loop
- Controls (keyboard + touch)
- Mechanics
- Scoring / fail / reset / progression
- Session length
### N.6 Presentation direction
- Visual
- HUD
- Audio
### N.7 Engine surface map (mechanic → API → proof)
### N.8 File plan (by file name)
### N.9 Asset plan
### N.10 Evidence and test plan
### N.11 Detailed task list
### N.12 Acceptance checklist

I'll write it now. For file plans, be specific:

**Siege Golf files:**
```
apps/showcase-siege-golf/
  package.json
  index.html
  tsconfig.json
  vite.config.ts
  README.md
  scripts/build-sfx.mjs
  assets/sfx/shotFire.wav ... (source wavs)
  public/aura-assets/          (generated)
  src/main.ts                  app mount, scene assembly, frame loop
  src/styles.css               HUD/layout
  src/aura-assets.ts           (generated)
  src/aura.assets.json         (generated)
  src/game/course.ts           hole layouts, tee/cup/target placement data
  src/game/course-geometry.ts  ground, walls, water/sand zones (kit + primitives)
  src/game/structures.ts       jointed stack builders (boxes, planks, pins)
  src/game/ball.ts             ball body state
  src/game/shot.ts             aim/power/launch impulse, stroke state
  src/game/targets.ts          target props + sensor cups
  src/game/rules.ts            strokes, par, hole progression, win/fail
  src/game/camera.ts           follow/aim camera via game.cameraDirector
  src/game/effects.ts          impact bursts, sink celebration
  src/game/hud.ts              DOM HUD
  src/game/audio.ts            audio controller
  src/game/audio-manifest.ts   cue manifest
  src/game/proof.ts            window.__SIEGE_GOLF_PROOF__
tests/browser/siege-golf-playable.spec.ts
tests/browser/siege-golf-visual.spec.ts (screens)
tests/unit/apps/siege-golf-rules.test.ts
tests/unit/apps/siege-golf-structures.test.ts
```

**Neon Swarm files:**
```
apps/showcase-neon-swarm/
  src/main.ts
  src/game/swarm.ts            instanced enemy field, spawn waves
  src/game/enemy-ai.ts         route-local steering (honest note)
  src/game/player.ts           hero ship movement/dash
  src/game/combat.ts           pulse fire (raycast/overlap), damage
  src/game/pickups.ts          upgrades
  src/game/waves.ts            wave definitions, escalation
  src/game/rules.ts            score/lives/fail/reset
  src/game/lod.ts              distanceLod + culling config
  src/game/hud.ts
  src/game/audio.ts / audio-manifest.ts
  src/game/proof.ts
tests: swarm instancing draw-count telemetry test, wave progression, death reset
```

**Aurora Lander:**
```
src/game/terrain.ts     heightfield generation (seeded), surface query
src/game/lander.ts      thrust/fuel/rotation state
src/game/pads.ts        landing pad sensors + grading
src/game/rules.ts       fuel/score/site progression/fail
src/game/ghost.ts       input replay of best run
...
```

**Gravity Post:**
```
src/game/bodies.ts      planet data from solar kit positions
src/game/gravity.ts     authored n-body-lite attraction
src/game/trajectory.ts  prediction polyline
src/game/pod.ts         launch + flight state
src/game/deliveries.ts  station sensors, scoring
...
```

**Courier Rush:**
```
src/game/city.ts        cityBlock night config
src/game/van.ts         arcade vehicle config
src/game/traffic.ts     driver AI vehicles
src/game/jobs.ts        pickup/dropoff generation, timers
src/game/rules.ts
```

**Pulse Tunnel:**
```
src/game/beat-clock.ts  audio-clock-driven scheduling (bounded tolerance)
src/game/patterns.ts    obstacle patterns
src/game/lanes.ts       lane dodge state
src/game/sync.ts        audio-frame sync + drift monitor
```

**Mech Hangar:**
```
src/game/assembly.ts    characterAssembly plan + validation
src/game/parts-catalog.ts
src/game/stats.ts       part->stats mapping
src/game/arena.ts       duel vs rival with locomotion kit
```

OK. Also shared infra files:
- apps/showcase-index/ registration file (need name — there's likely a data file; I'll phrase as "showcase index gallery entry (follow existing registration pattern in apps/showcase-index/)")
- marketing sitemap/homepage cards — task
- root vercel.json — no change needed (marketing build covers apps)
- .vercelignore — keep minimal

Deployment per game: build marketing locally, deploy --prebuilt to project marketing (prj_UobkWy6IxsUtMrmkddY2XTX2aDQi), verify URL.

Now write. I'll aim for completeness with tight prose. Also add a "Definition of done (every game)" shared checklist to avoid repeating 40 items 7 times — per-game checklists reference the shared one plus game-specific gates. Actually the user asked for detailed checklist — I'll do both: per-game specific checklist items AND a shared master checklist. To keep the file from bloating, per-game checklists include their unique gates and point to §13 shared gates.

Let me write the document now.
### Visible reply text (block 1, 103 chars)

Now I'll write the full PRD covering all seven games with file-level plans, task lists, and checklists.

---

## Attempt 6

### Reasoning (block 0, 8663 chars)

I have the canonical app layout. Now let me write the comprehensive PRD. The file will be `NextGames-PRD.md` at the repo root (matching the user's naming, similar to their `continue2.md` root-level file pattern).

Structure per game:
- Identity block (name, route, genre, label, priority)
- Summary & fantasy
- Goals / Non-goals
- Game design: core loop, controls table, mechanics detail, scoring/fail/reset/progression, session length
- Presentation direction: visual + audio
- File plan: complete file-by-file listing with purpose per file
- Asset plan: CLI commands, asset names
- Evidence & test plan: unit tests, browser tests, route-health, screenshots
- Task list: phased with task IDs
- Checklist: acceptance criteria checkboxes

Plus shared sections:
- Governing docs / read order
- Portfolio overview table
- Shared engineering standards
- Shared infrastructure workstreams (scaffold, gallery registration, deployment)
- Execution order & milestones
- Risk register
- Master checklist

This is going to be a long document. Let me write it carefully and completely. I'll write it in one `write` call. Let me draft the content.

Key details to get right for each game:

**Game 1: Siege Golf (Wrecking Green)**
- Route: `/apps/showcase-siege-golf/`
- Genre: physics puzzle-sports
- Engine surface: games.createMiniGolfState(), app.physics dynamic bodies, joints (spring/hinge/fixed), sensors, prefabs.miniGolfHole(), sceneKits presentation discipline
- Files:
  - apps/showcase-siege-golf/package.json, index.html, vite.config.ts, tsconfig.json, README.md
  - src/main.ts — app mount, scene assembly, frame loop wiring
  - src/game/course.ts — hole definitions (9 holes), structure stacks, target/cup placement
  - src/game/structures.ts — jointed stack builders (towers, planks, pendulums, spring traps)
  - src/game/ball.ts — launch state machine (aim → charge → flight → rest), impulse application
  - src/game/aiming.ts — aim UI math, power meter, trajectory hint line
  - src/game/scoring.ts — par/strokes/sensors/targets, star grading
  - src/game/hud.ts — DOM HUD (strokes, par, hole n/9, score card)
  - src/game/state.ts — run state machine (hole intro → play → holed → summary)
  - src/game/wrecking-proof.ts — deterministic proof object
  - src/golf-audio.ts + manifest — audio controller
  - scripts/build-sfx.mjs, assets/sfx/*.wav (10 cues: drive, impact wood, impact stone, chime cup, target bell, structure collapse, ui confirm, hole complete, par fanfare, deny)
  - public/aura-assets/, aura.assets.json, src/aura-assets.ts generated
  - tests/unit/apps/siege-golf-physics.test.ts (deterministic toppling snapshots)
  - tests/browser/siege-golf-playable.spec.ts
  - route-health.json, showcase-evidence-checklist.json

**Game 2: Neon Swarm**
- Route: /apps/showcase-neon-swarm/
- Genre: arena horde survival
- Surface: instances.* native instancing, distanceLod, particles, game.effects, cameraDirector, touch controls
- Files:
  - src/main.ts, src/game/arena.ts (floor, pillars, neon rails), src/game/swarm.ts (spawn director, wave tables, steering), src/game/player.ts (move/dash/pulse), src/game/combat.ts (pulse AoE, damage, pickups), src/game/upgrades.ts (between-wave shop), src/game/waves.ts (wave definitions), src/game/hud.ts, src/game/state.ts, src/game/swarm-proof.ts, src/swarm-audio.ts
  - assets/sfx ~10 cues
  - tests/unit/apps/neon-swarm-waves.test.ts, tests/browser/neon-swarm-playable.spec.ts (+ instancing telemetry spec)

**Game 3: Aurora Lander**
- Route: /apps/showcase-aurora-lander/
- Genre: physics lander
- Surface: static heightfield colliders, createMeshSurfaceQuery BVH queries, sensors for pads, text3D markers, input replay ghost
- Files: src/main.ts, src/game/terrain.ts (heightfield generation, seeded), src/game/lander.ts (thrust/rotation/fuel), src/game/touchdown.ts (grading math), src/game/sites.ts (landing sites, pads), src/game/replay.ts (input replay export/import ghost), src/game/hud.ts, src/game/state.ts, src/game/lander-proof.ts, src/lander-audio.ts
  - tests/unit/apps/aurora-lander-touchdown.test.ts, tests/browser/aurora-lander-playable.spec.ts

**Game 4: Gravity Post**
- Route: /apps/showcase-gravity-post/
- Genre: orbital slingshot puzzle
- Surface: sceneKits.solarSystem() presentation, route-local gravity, kinematic bodies, sensors, labels, timeline
- Files: src/main.ts, src/game/orbits.ts (gravity model, prediction), src/game/launch.ts (aim/power), src/game/deliveries.ts (contracts, stations, sensors), src/game/fuel.ts, src/game/hud.ts, src/game/state.ts, src/game/post-proof.ts, src/post-audio.ts
  - tests/unit/apps/gravity-post-trajectory.test.ts, tests/browser/gravity-post-playable.spec.ts

**Game 5: Courier Rush**
- Route: /apps/showcase-courier-rush/
- Genre: arcade delivery driving
- Surface: cityBlock night kit, createGameArcadeVehicle, createVehicleDriverAi traffic, checkpoint sensors, HUD bindings
- Files: src/main.ts, src/game/city.ts (block config, districts), src/game/van.ts (arcade vehicle tuning), src/game/jobs.ts (delivery contracts, timers), src/game/traffic.ts (driver AI cars), src/game/routes.ts (waypoint graph), src/game/hud.ts, src/game/state.ts, src/game/courier-proof.ts, src/courier-audio.ts
  - tests/unit/apps/courier-rush-jobs.test.ts, tests/browser/courier-rush-playable.spec.ts

**Game 6: Pulse Tunnel**
- Route: /apps/showcase-pulse-tunnel/
- Genre: rhythm dodger (prototype)
- Surface: neonTunnel kit, audio bus graph, timeline beat scheduling, lane input buffering
- Files: src/main.ts, src/game/lane.ts (3-lane movement), src/game/beats.ts (pattern data, scheduling), src/game/gates.ts (obstacle spawning), src/game/sync.ts (audio-clock to frame-time bridge, tolerance), src/game/hud.ts, src/game/state.ts, src/game/pulse-proof.ts, src/pulse-audio.ts
  - tests/unit/apps/pulse-tunnel-patterns.test.ts, tests/browser/pulse-tunnel-playable.spec.ts

**Game 7: Mech Hangar → Arena**
- Route: /apps/showcase-mech-hangar/
- Genre: build-and-battle
- Surface: characterAssembly, assets assemble-character, locomotion kit, combatWorld
- Files: src/main.ts, src/hangar/parts.ts (part catalog metadata), src/hangar/assembly.ts (assembly plan + validation), src/hangar/stats.ts (stat derivation), src/hangar/ui.ts (hangar DOM UI), src/arena/arena.ts, src/arena/rival.ts, src/arena/combat.ts, src/game/hud.ts, src/game/state.ts, src/game/mech-proof.ts, src/mech-audio.ts
  - tests/unit/apps/mech-hangar-assembly.test.ts, tests/browser/mech-hangar-playable.spec.ts

Shared infra files:
- apps/showcase-index/ registration (gallery card)
- marketing sitemap/homepage cards (optional, gated)
- vercel/marketing deployment notes
- Root: docs updates? Keep minimal; README per app.

Also each game needs route-health.json + showcase-evidence-checklist.json (generated by commands).

Priority order: Siege Golf P1, Neon Swarm P1, Aurora Lander P2, Gravity Post P2, Courier Rush P3, Pulse Tunnel P3 (prototype), Mech Hangar P4 (exploration).

Now the task lists. Each game gets phases:
- Phase A: Scaffold & typed assets
- Phase B: Core simulation (unit-tested)
- Phase C: Scene presentation
- Phase D: Input/feel/HUD
- Phase E: Audio
- Phase F: Evidence & browser tests
- Phase G: Route health, README, review handoff

Checklists per game mirror the game-example-standards requirements plus game-specific gates.

Master checklist: portfolio-level.

Also include a "hard rules" section referencing claims-and-boundaries: no three imports, typed assets only, DOM=UI only, one app per route, no claim promotion, etc. And explicit non-goals per game.

Length concern: this will be a very large markdown file (~1500+ lines). That's what "in full" demands. Let me write it efficiently but completely. I'll keep each game section tight but complete — using tables where possible to compress.

Let me write the file now. I'll number tasks like SG-T01 etc. per game prefix:
- SG = Siege Golf
- NS = Neon Swarm
- AL = Aurora Lander
- GP = Gravity Post
- CR = Courier Rush
- PT = Pulse Tunnel
- MH = Mech Hangar
- INF = shared infrastructure

One more consideration: date. The AGENTS.md was generated 2026-06-20 but release notes mention 2026-08 dates... The world-class prompt says "August 2026 source". Known limits dated 2026-08-11. I'll date the PRD 2026-08-14-ish? Actually I don't know today's date precisely. I'll avoid a specific fabricated date or use "2026-08" as status period. Better: "Status: Draft v1" without a hard date, or use a generic date field. I'll put "Generated: Aura3D NextGames planning pass" and leave date as blank-ish? PRDs usually have dates. I'll say "Date: 2026-08 (planning cycle)". Hmm, safer to omit precise day.

Let me write it.
### Visible reply text (block 1, 137 chars)

The layout is confirmed. Now I'll write the full PRD covering all seven games with file-level plans, detailed task lists, and checklists.
