# Reverse-Engineering Crayon Arcade Games into Aura3D

Validated flow for the ten candidate games from `app.usecrayon.ai`, using REA 6.7.0
(`/opt/homebrew/bin/rea`) plus the Aura3D game kits.

Every number and claim below was observed on 2026-10-21 against the live site.
Nothing here is inferred from filenames or marketing copy.

**Two documents, one pipeline.**

| Document | Answers |
| --- | --- |
| This file | How to capture a game, extract its logic, and build the Aura3D port |
| [`threejs-parity-gaps.md`](./threejs-parity-gaps.md) | What Aura3D must add before a port can reach visual parity, with priorities and fixtures |

A port starts only after the parity items marked `●` for that game exist with a
passing fixture. §5 is the gate; §6 is the per-game plan.

---

## 1. What the target actually is

Crayon is **not** a single SPA whose bundle contains the games. There are three
layers, and only the last one matters:

| Layer | What it is | Size | Do we care |
| --- | --- | --- | --- |
| Shell | React SPA at `app.usecrayon.ai` (`index`, `vendor`, `core`, `messageRouter`, `levelOverrides`, `uiContext`, `engineBrand`, `restoreVersion` chunks) | 1.34 MB + 1.37 MB + 298 KB | **No** — this is what blows up analyzers |
| Game frame | `<iframe data-game-preview sandbox srcdoc>` titled **"Play Labs runtime"** | 120 KB – 317 KB | Yes — it is the game's document |
| Game module | `<script type="module" src="blob:...">`, or inline, or dynamic import | 19 KB – 1.64 MB | **Yes — this is the source** |

The dependency manifest is published in the frame's `importmap`. It is identical
for **all twelve** games measured:

```
three                            -> cdn.jsdelivr.net/npm/three@0.184.0/build/three.module.min.js
three/addons/                    -> .../three@0.184.0/examples/jsm/
@dimforge/rapier3d-compat        -> .../rapier3d-compat@0.12.0/rapier.es.js
```

**The importmap is not what renders.** On the live HEATSINK frame:

```
window.__THREE__      = "184"                      // the importmap copy
canvas[data-engine]   = "three.js r186 webgpu"     // the renderer actually drawing
```

Only `WebGPURenderer` writes that `data-engine` string. So the real stack is
**three r186 WebGPU, bundled inside the game module**, coexisting with an unused
r184 global. Two consequences:

- A `THREE.*` shim will never be a drop-in: the game does not call the global.
- Aura3D is also WebGPU-first, so the renderer family matches even though the
  versions do not. The gap is authoring surface, not backend.

Other facts that shape the flow:

- **Module size tells you the extraction method.** A minified three build is
  365 KB (`three.module.min.js`) and the WebGPU build is 668 KB. A 19 KB module
  cannot contain either, so small modules import through the importmap and stay
  readable. Modules above ~500 KB inline their own renderer and are minified
  end-to-end: `new Mesh(` returns **0 matches** in HEATSINK.
- **Game-domain names survive; library names do not.** HEATSINK carries
  `overheat` ×15, `drone` ×280, `HUD` ×316, `checkpoint` ×25, `lap` ×70 — because
  they are object properties. `WebGPURenderer` ×12 and `BatchedMesh` ×12 are
  library definitions, not proof that the game uses them. Trace, don't grep.
- No source maps are published (`sourceMappingURL` absent from every chunk), so
  `--fetch-source-maps` buys nothing.

### The public API is origin-gated

```
GET https://api.usecrayon.ai/play/<project_id>
HTTP/2 403
{"error":"client_not_allowed","message":"This content can only be opened in the Crayon app."}
```

The same request succeeds **inside the browser page**. So never `curl` the game
payload; every read goes through a real browser context. This is why REA's
loopback-CDP provider is the correct tool and why REA refuses non-loopback
endpoints by design.

### Measured inventory (the ten)

| # | Game | Frame (B) | Game module (B) | Module shape | three source | Extract |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Last Train to the Sea | 317,182 | 1,391,655 | external blob, 1 line | inlined (inferred) | ok |
| 2 | Where the Wind Wanders | 305,649 | 645,204 | external blob, 1 line | inlined (inferred) | ok |
| 3 | Saiyan through the Snake way! | 120,284 | 513,393 | external blob, 211 lines | inlined (inferred) | ok |
| 4 | HEATSINK | 236,808 | 1,641,373 | external blob, 722 lines | inlined (**measured**, r186 webgpu) | ok |
| 5 | Silt & Signal | 172,679 | — | dynamic import, not in DOM | unknown | CDP script enumeration |
| 6 | Drift & Deliver | 124,643 | 1,332,481 | external blob, 1 line | inlined (inferred) | ok |
| 7 | Strange Orbit | 152,499 | 19,300 | external blob, 1 line | importmap (inferred) | ok |
| 8 | Roadster Hours | 120,842 | — | dynamic import, not in DOM | unknown | CDP script enumeration |
| 9 | Splat Rush | 120,284 | 43,212 | external blob, 1 line | importmap (inferred) | ok |
| 10 | Ninja Runner | 160,987 | 867,109 | external blob, 4,447 lines | inlined (inferred) | ok |

Only HEATSINK's renderer was verified at runtime. The rest of the "three source"
column is inferred from module size against the 365 KB / 668 KB builds; confirm
with the same one-line probe during Stage 2 before relying on it.

Backups measured: Cube Dash 21,579 B · Fleet Week (dynamic import).

Module bytes are an **effort proxy only** — some modules inline level data or
textures. Do not read them as source line count: several games ship as a single
minified line.

---

## 2. The flow

Eight stages (0–7). Stages 0–5 are REA; stages 6–7 are Aura3D.

### Stage 0 — Prerequisites

```bash
rea --version                      # expect 6.7.0
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --headless=new --remote-debugging-port=9222 \
  --user-data-dir="$TMPDIR/crayon-chrome" --no-first-run \
  "https://app.usecrayon.ai/play/<project_id>" &
```

REA only accepts loopback: `http://127.0.0.1:9222` or the `ws://` browser URL.
A Docker or remote browser will not work — the endpoint must be on this machine.

### Stage 1 — Discover targets

```bash
rea list-browser-targets http://127.0.0.1:9222 \
  --allowed-origins https://app.usecrayon.ai --format json
```

You will see the `page` (the shell) **and** an `iframe` with `about:srcdoc`.
Note both IDs.

### Stage 2 — Capture the frame, not the page

```bash
NODE_OPTIONS=--max-old-space-size=8192 \
rea analyze-web-bundle http://127.0.0.1:9222 <iframe_target_id> \
  --allowed-origins https://app.usecrayon.ai \
  --allowed-origins https://api.usecrayon.ai \
  --observation-ms 3000 --format json > frame.json
```

Targeting the **frame** keeps the bundle at 120–320 KB instead of 1.34 MB. This
single choice is the difference between a 45-second run and a crash.

### Stage 3 — Extract the game unit

Three shapes occur. Handle all three or you will silently get 0 bytes:

1. **External blob module** — `<script type="module" src="blob:...">`. Fetch the
   blob inside the frame's own JS context and write the text out.
2. **Inline module** — no `src`; read `textContent`.
3. **Dynamic import** — no script element and no blob entry in
   `performance.getEntriesByType("resource")`. The DOM probe returns nothing.
   Use Stage 2's CDP script enumeration (`analyze-web-bundle` lists scripts from
   the debugger, including blob/data/inline) or `rea export-web-scripts`.

Also record the frame's `importmap` — it is the stack fingerprint, but not proof
of what actually renders (see §1).

While the frame is still open, run the four runtime probes in
[`threejs-parity-gaps.md`](./threejs-parity-gaps.md) §9: node-material usage,
`BatchedMesh`, `EffectComposer`, and GLSL `ShaderMaterial`. One CDP session per
game answers all four, and those answers decide whether SH-01 and SH-02 are
really P0 for that title.

The automated runner is [`tools/crayon-probe/`](../../tools/crayon-probe/index.ts)
(**remote runner only** — it drives a real browser against live endpoints;
provision once with `tools/remote-runner/provision.sh`, then run over the SSM
port-forward). It opens one CDP session per game, tries importmap → heap
snapshot → DOM/global evidence in order, and writes
`evidence/crayon-probes/<game>.json` with `yes`/`no`/`inconclusive` per probe —
never a fabricated `yes`:

```bash
pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
  --manifest tools/crayon-probe/games.json            # whole roster
pnpm exec tsx --tsconfig tsconfig.base.json tools/crayon-probe/index.ts \
  --game strange-orbit --url https://app.usecrayon.ai/play/<project-id>
```

`tools/crayon-probe/games.json` is the ten-game roster; fill in the play-page
URLs as they are confirmed. Evidence that already exists under
`evidence/crayon-probes/` is authoritative — a probe reporting `inconclusive`
keeps the gate red; it does not soften it.

### Stage 4 — Static semantics

```bash
rea export-web-scripts /abs/frame.json /abs/game-scripts      # absent dir
rea analyze-javascript-application /abs/game-scripts --json   # module graph
rea trace-javascript-semantics '<workflow json>'               # see --schema
```

Trace **seeds**, not whole files. For the racing games the productive seeds are
`overheat`, `checkpoint`, `lap`, `traffic`, `boost`, `trafficSpawn`, `HUD`.
For runners: `gate`, `speed`, `jump`, `spawn`, `score`.

`analyze-javascript-application` defaults to a 1024 MiB analyzer heap. Raise it:

```bash
rea analyze-javascript-application /abs/game-scripts \
  --max-heap-mb 4096 --max-semantic-nodes 200000 --json
```

### Stage 5 — Build a parity fixture (not a screenshot)

One declared scenario, capture the input → state transition:

```bash
rea capture-browser-scenario /abs/scenario.json --format json > before.json
```

Connect mode navigates to `start_url` and runs declared actions. Capture again
after the Aura3D port, then diff:

```bash
rea compare-web-captures before.json after.json --format json
```

Comparison is normalized (step timing, event sequence, and local network IDs are
ignored) and reports per-artifact diffs. This is the closest thing to a
mechanical parity gate and it is the only stage that proves *behaviour* rather
than structure.

### Stage 6 — Map to Aura3D

Map the extracted mechanic to an Aura3D surface **and** to the parity items it
needs. If the parity item is not built, the mapping is a plan, not a port.

| Crayon mechanic | Aura3D surface | Status | Parity gate |
| --- | --- | --- | --- |
| Vehicle + track + laps | `game.racing`, `game.arcadeKart` | ships | SM-02 (PARTIAL, L3), SG-03 (GAP, L2), SH-05 (PARTIAL, L7) |
| Combat + projectiles | `templates/arena-shooter` pooled-bolt pattern | template, not a kit | SG-01 (PARTIAL, L5), SH-02 (PARTIAL, L1 — `material.custom` spec frozen) |
| Heat / resource meter | `game.simulation` state + HUD binding | compose | — |
| Drift scoring | arcade kart velocity model | compose | SM-01 (PARTIAL, L3) |
| Traffic / AI | racing kit AI + spawner | compose | SG-01 (PARTIAL, L5), SG-02 (PARTIAL internal, L5 — probe-gated) |
| Endless runner lanes | `game.platformer` + `game.planarCollisionWorld` | **no runner kit** | SG-05 (PARTIAL, L2), SM-02 (PARTIAL, L3) |
| 3D collect / wander | `game.locomotion` + character controller | compose | SA-04 (PARTIAL, L8) |
| HUD / score / lives | `packages/game/src/hud/HudKit.ts` | ships | ST-01 (GAP, L4 — only if text must live in a texture; DOM HUD is unaffected) |
| Touch controls | `game.touchControls` | ships | — |
| Stylised VFX | `effects.flipbook` + custom pass | flipbook ships; `app.addPostPass` is the live GPU custom pass | SH-03 (PARTIAL, L1 — `effects.shaderPass` lands there) |

The right-hand column is the contract with
[`threejs-parity-gaps.md`](./threejs-parity-gaps.md). Do not start a build while a
gate is red; the port will end up "mechanically correct, visually prototype".

### Stage 7 — Prove it

Nothing is "done" on a screenshot. The repo gate is
`docs/agents/game-example-standards.md`:

- input visibly changes state; reset works after win and fail;
- objective + scoring/timing/progress/fail;
- at least one progression loop;
- ≥60 s of meaningful player-driven play;
- typed GLB for primary character/vehicle/track, not primitives;
- genre look preset applied (a mechanic-correct game on flat lighting is still
  `prototype`);
- route-health names renderer mode, fallback, primary assets, primitive count,
  known limits;
- browser tests cover movement, restart, and one win/fail/score/lap/completion.

```bash
pnpm -C packages/aura3d-cli aura3d assets validate-game --profile <genre> \
  --asset <key> --no-placeholders --require-license
pnpm game-runtime:unit && pnpm game-runtime:browser
pnpm check:release
```

---

## 3. Known failure modes (all hit during validation)

| Symptom | Cause | Fix |
| --- | --- | --- |
| MCP `analyze_web_bundle` → *"MCP server process exited"*, V8 stack | 1.34 MB minified AST exceeds the server's heap and the MCP transport | Use the CLI, not MCP |
| CLI exit 134, `Scavenge ... 4080 MB` | 4 GB default heap | `NODE_OPTIONS=--max-old-space-size=8192` (peak observed 7.3 GB) |
| 45 s → 0-byte output | Same OOM, output truncated | same |
| `403 client_not_allowed` | Origin gate on `api.usecrayon.ai` | Browser context only; never curl |
| Module extract returns 0 bytes | Dynamic import, no DOM script, no blob perf entry | Stage 2 CDP enumeration |
| `source_maps: not_requested`, no maps found | Publisher ships none | Drop `--fetch-source-maps` |

---

## 4. Legal and claim boundaries

- Reproduce **mechanics, systems, tuning, and control contracts**. Do not copy
  art, audio, text, names, or branding. All assets come from the Aura3D catalog
  with `--require-license`.
- Do not describe a port as "1:1" unless the parity fixture in Stage 5 passes
  and the route-health entry names the exact limits.
- `apps/showcase-heatsink` and `apps/showcase-roadster-rush` are **not** Crayon
  ports. The Roadster showcase documents a different source
  (`roadster-rush.ai.studio`); `showcase-heatsink` has no provenance note. The
  name overlap with Crayon's *HEATSINK* / *Roadster Hours* is coincidence.
  Do not cite them as prior parity work.

---

## 5. Parity gate

Before any build, read [`threejs-parity-gaps.md`](./threejs-parity-gaps.md). The
gate is:

| Tier | Items | Current verdict (lane) | Meaning |
| --- | --- | --- | --- |
| **P0** | SH-02 custom shaders | PARTIAL (L1) — `AuraCustomMaterialSpec` frozen; `PortableShaderMaterial` internal | No port can look like the source without these |
| | SH-03 custom pass | PARTIAL (L1) — `app.addPostPass({fragment:{glsl}})` is the live GPU path; `effects.shaderPass` lands L1 | |
| | SG-03 geometry breadth | GAP (L2) — union widened/frozen, generators not implemented | |
| | SG-05 geometry authoring | PARTIAL (L2) — number-array custom geometry only | |
| | SM-01 math breadth | PARTIAL (L3) | |
| | SM-02 curves | PARTIAL (L3) — frozen `Curve` interface in `@aura3d/engine/math` | |
| | ST-01/02 textures | GAP (L4) / PARTIAL (L4) — `AuraTextureRef` frozen, no `texture.*` factories | |
| **P1** | SH-01 TSL subset | GAP — probe-gated on P-1 (L1) | Required by at least one title |
| | SH-05 renderer facade | PARTIAL (L7) | |
| | SH-07 PMREM | **CLOSED** — `environments.capture`/`hdri`/`neutral` ship | |
| | SG-01/02 instancing | PARTIAL (L5); SG-02 probe-gated on P-2 | |
| | SG-06/07/08 lines/points/sprites | PARTIAL internal (L6) | |
| | SA-01/04 animation | MOSTLY CLOSED / PARTIAL (L8) | |
| | AU-01/02 audio | PARTIAL (L9 — AU-02 has the double-attenuation fix) | |
| | AU-04 AudioLoader | **CLOSED** — `AS/AudioLoader` ships; codemod row only | |
| | SR-01/03/05 runtime | PARTIAL (L7) | |
| | SR-02 fog / SR-08 disposal / SR-09 colour mgmt | MOSTLY CLOSED / CLOSED-capability / **CLOSED** | |
| **P2** | SC-04 WebXR | PARTIAL — Phase 4 | Does not block the ten |
| | SC-01 Cube/Array/Stereo camera | GAP (public, L7 — CubeCamera is P1) | |
| | AD-05 exporters | **EXCLUDED** by contract — bake offline | |
| | AD-12 CSM | **CLOSED (internal)** — `lights.directional({shadow:{cascades}})` + codemod row | |
| | SC-03 helpers | GAP (L6, P2) — deleted with three-compat | |
| | AD-04 loaders (FBX/MMD/PLY/STL/USDZ/3MF/VOX), AD-09/10/11/13 | **EXCLUDED** by contract | |

A game starts only when every item marked `●` in the parity matrix has a passing
fixture. "Mechanically correct, visually prototype" is the failure mode this gate
exists to prevent.

---

## 6. Per-game port plans

Effort assumes one engineer who knows Aura3D, **after** the parity gate is green.
`S` ≤ 1 week · `M` 1–2 weeks · `L` 3–4 weeks · `XL` 5+ weeks.

Each plan lists: the mechanic contract to reproduce (never the art), the RE seeds
to trace, the parity items that must exist, the Aura3D mapping, and the proof.

**Capture scenario.** Each game declares one scenario: start URL, a fixed input
sequence, and the artifacts to record (`lap`, `checkpoint`, `score`, `heat`,
`form`, `delivery`, …). Run `rea capture-browser-scenario --schema` for the exact
field names — do not invent them. The acceptance line in each plan names the
artifacts that must match.

### 6.1 Last Train to the Sea — 4,824 plays · adventure · Aniket

**Shape.** 1,391,655 B, external blob, one line, three inlined. The catalog's #1
game by a wide margin.

**Mechanic contract.** Drive a tram through five towns above the clouds; keep its
wings balanced; collect travellers; earn tips; three rescue lanterns act as lives;
day/night cycle; collectible tickets; unlockable decorations; one-hand phone
controls.

**RE seeds.** `tram`, `wing`, `balance`, `passenger`, `tip`, `lantern`, `town`,
`ticket`, `decor`, `dayNight`.

**Parity gate.** SG-03 (town extrusion, rails — GAP, L2), SM-02 (route — PARTIAL, L3),
ST-01 (sky/HUD — GAP, L4), SH-02 (clouds — PARTIAL, L1), SH-03 (grade — PARTIAL, L1;
`app.addPostPass` is the live GPU path), SA-04 (passengers — PARTIAL, L8),
AU-02 (PARTIAL, L9).

**Aura3D mapping.** No vehicle-adventure kit exists. Compose `game.racing` chassis
(arcadeKart) with `game.simulation` for tips/lanterns, `HudKit`, and
`game.touchControls`. Towns are scene chunks streamed along the route curve.

**Build.**

1. Author the five-town route as one `curve.catmullRom`, with town boundaries as
   distance ranges.
2. Build the tram rig: chassis + two wing pivots + balance torque from lateral
   acceleration.
3. Passenger pickup: seat capacity, boarding animation, tip calculation from
   smoothness.
4. Lantern system: three hits, restore at town stops, fail → restart town.
5. Day/night timeline driven by route distance; sky + light keyframes.
6. Ticket/decor meta loop persisted in the save blob.
7. One-hand touch: throttle slider + tilt steering; no second stick.

**Look.** Warm pastel sky, soft volumetric clouds, low-contrast bloom; no hard
shadows above the cloud deck.

**Acceptance.** One complete town loop: 3 pickups, 1 lantern loss and restore,
day→night transition, tip awarded. Capture diff passes on route progress, pickup
count, and lantern state. Route-health names streaming chunks and cloud limits.

**Effort.** XL — five authored towns and a meta loop.

---

### 6.2 Where the Wind Wanders — 3,558 plays · adventure · Tushar

**Shape.** 645,204 B, external blob, one line, inlined.

**Mechanic contract.** A peaceful 2.5D free-roam through a sunlit valley; gather
wind letters; no fail state; the "quiet moments" are the reward.

**RE seeds.** `wind`, `letter`, `valley`, `breeze`, `grass`, `collect`.

**Parity gate.** SH-02 (grass/wind — PARTIAL, L1), SG-01 (grass instancing —
PARTIAL, L5), SM-02 (valley path — PARTIAL, L3), ST-01 (GAP, L4),
SR-02 (depth fog — MOSTLY CLOSED; per-material `fog` flag is the L7 tail).

**Aura3D mapping.** `game.locomotion` + character controller; `instances.*` for
grass; `particles` for wind; no combat, no timer.

**Build.**

1. Valley heightmap + painted ground; camera constrained to a 2.5D band.
2. Player controller with walk/glide; no fall damage.
3. Wind field: a flowing vector field drives grass, particles, and letter drift.
4. Letters as collectibles with a soft magnetic pull.
5. Ambient audio zones; music swells at each letter.
6. Photo-mode-free "quiet moment" triggers (sit, look, listen).

**Look.** High-key sunlight, long soft shadows, height fog, pastel greens; the
reference is a painting, not a photograph.

**Acceptance.** 60 s of play, 5 letters collected, zero fail states, wind visibly
moves grass and particles. Capture diff passes on letter count and player path.

**Effort.** M.

---

### 6.3 Saiyan through the Snake way! — 3,500 plays · runner · Aniket

**Shape.** 513,393 B, external blob, **211 lines** — the most readable mid-size
module in the set.

**Mechanic contract.** Race against time along a serpentine path to reach a
destination planet; the path is the level, the clock is the enemy.

**RE seeds.** `snake`, `time`, `speed`, `distance`, `gate`, `checkpoint`, `finish`.

**Parity gate.** SM-02 (serpentine curve — PARTIAL, L3; frozen `Curve`
interface already in `@aura3d/engine/math`), SG-03 (`TubeGeometry` — GAP, L2),
SG-05 (PARTIAL, L2), SR-01 (PARTIAL, L7).

**Aura3D mapping.** On-rails mover over a `curve.catmullRom`; `game.platformer`
lane logic only if the path branches. No runner kit needed for a single path.

**Build.**

1. Extract the path control points and the time budget; both are small data.
2. Build the tube/ribbon mesh and a scrolled UV material.
3. On-rails controller: forward speed, lateral offset, jump/dodge.
4. Obstacle gates spawned by distance; collision via `game.planarCollisionWorld`.
5. Par-time HUD and fail/retry at the last checkpoint.
6. Camera: chase with look-ahead along the tangent.

**Look.** Saturated sky, speed lines at high velocity, mild chromatic aberration
at boost — the only post the source appears to need.

**Acceptance.** Finish the path under par, fail once and retry from checkpoint.
Capture diff passes on distance, checkpoint order, and finish time.

**Effort.** M.

---

### 6.4 HEATSINK — 3,269 plays · racing · Tushar

**Shape.** 1,641,373 B, external blob, 722 lines, **three r186 WebGPU inlined**.
Largest and most technically demanding module measured.

**Mechanic contract.** Armed drone racing through a rain-soaked megacity; the
Ramjet has a heat budget; shoot rivals; win only if you do not melt first.

**RE seeds.** `overheat`, `heat`, `drone`, `ramjet`, `rival`, `weapon`, `lap`,
`checkpoint`, `boost`, `cool`.

**Parity gate.** SH-02 (PARTIAL, L1), SH-03 (PARTIAL, L1 — `app.addPostPass`
live), SG-02 (city batching — PARTIAL internal, L5; **probe-gated on P-2**),
SG-03 (GAP, L2), SG-05 (PARTIAL, L2), SM-02 (PARTIAL, L3), ST-01 (GAP, L4),
SR-02 (MOSTLY CLOSED). SH-07 is **CLOSED** — no longer a gate.

**Aura3D mapping.** `game.racing` + `arcadeKart` flight variant; pooled projectiles
from the arena-shooter template; heat as a `game.simulation` resource; city props
via `instances.*` and `BatchedMesh` when it lands.

**Build.**

1. Track spline with checkpoint gates; three laps.
2. Drone controller: thrust, strafe, vertical, boost; no wheels.
3. Heat model: thrust and weapons add heat, rain/cooling vents remove it;
   overheat forces a glide and a long cooldown.
4. Weapon pool: forward bolts, lock-on warning, rival hit reaction.
5. Rival AI: spline following with rubber-banding and occasional attacks.
6. City: batched blocks, neon signs, rain particles, wet-surface reflections.
7. Post: rain streaks, heat shimmer at high heat, bloom on neon.

**Look.** Night, rain, sodium-orange and cyan neon, wet specular streets, heavy
bloom with a high threshold; heat shimmer only above 70% heat.

**Acceptance.** Three laps, two rival kills, one overheat fail and recovery.
Capture diff passes on lap, checkpoint, heat band, and score. Route-health names
the batched prop count and the rain-particle budget.

**Effort.** L — the look and the rival AI are the cost, not the track.

---

### 6.5 Silt & Signal — 2,750 plays · racing · Aniket

**Shape.** Dynamic import — **not in the DOM**; requires CDP script enumeration.
Size unknown until Stage 3 completes.

**Mechanic contract.** Carry a companion through seven living worlds to restore
old crossings; hover-bike; cinematic, voiced scenes; water reacts to the ride.
Declared controls: W/S accelerate/reverse, A/D steer, E/Q rise/fall.

**RE seeds.** `hover`, `bike`, `companion`, `world`, `aqueduct`, `water`, `voice`,
`scene`, `crossing`, `altitude`.

**Parity gate.** SH-02 (water — PARTIAL, L1), SH-03 (PARTIAL, L1),
SM-02 (PARTIAL, L3), SG-03 (aqueducts — GAP, L2), SA-04 (PARTIAL, L8),
AU-02 (PARTIAL, L9), SR-02 (MOSTLY CLOSED). Phase 3.

**Aura3D mapping.** `game.racing` hover variant + `water` + a timeline for voiced
scenes; `game.simulation` for crossing restoration.

**Build.**

1. Enumerate the dynamic import via CDP; recover the module and its scene list.
2. Seven world chunks, each a corridor with a crossing objective.
3. Hover controller: altitude above terrain/water, pitch from vertical velocity.
4. Water interaction: wake, spray, refraction; the ride must visibly disturb it.
5. Dialogue timeline: voice clips bound to trigger volumes, subtitles optional.
6. Cinematic camera rails for scene transitions; skip + pause.
7. Crossing restoration as the progression state.

**Look.** Painterly, cool shadows with warm bounce, volumetric god-rays, water as
the hero material. This is the one game where water quality decides the port.

**Acceptance.** One world crossing with two dialogue beats and visible water
reaction. Capture diff passes on crossing state and dialogue index.

**Effort.** XL — seven worlds, voice, and water.

---

### 6.6 Drift & Deliver — 1,728 plays · racing · Aniket

**Shape.** 1,332,481 B, external blob, one line, inlined.

**Mechanic contract.** Cruise a sun-soaked city, drift through corners, complete
courier runs before the clock.

**RE seeds.** `drift`, `courier`, `delivery`, `corner`, `combo`, `timer`, `traffic`.

**Parity gate.** SH-02 (PARTIAL, L1), SH-03 (PARTIAL, L1 — `app.addPostPass`
live), SG-02 (PARTIAL internal, L5 — **probe-gated on P-2**), SG-03 (GAP, L2),
SM-02 (PARTIAL, L3). SH-07 is **CLOSED** — no longer a gate.

**Aura3D mapping.** `arcadeKart` drift model + delivery objective +
`game.simulation` timer; city via instances.

**Build.**

1. City grid with delivery nodes and a corner-heavy route.
2. Kart drift tuning: slip angle, counter-steer, drift score multiplier.
3. Courier loop: pick up → deliver → next node; timer per run.
4. Traffic as simple spline agents with avoidance.
5. Combo HUD and fail/retry.
6. Sunlit grade with warm bounce and light bloom.

**Look.** LA midday, high sun, warm asphalt, strong specular highlights, mild
heat haze in the distance.

**Acceptance.** Three deliveries, one drift combo above threshold, one timer
fail. Capture diff passes on delivery count, combo, and remaining time.

**Effort.** M — the kit does most of the driving.

---

### 6.7 Strange Orbit — 1,654 plays · racing · Aniket

**Shape.** 19,300 B, external blob, one line, **imports three through the
importmap**. Small enough to read directly; the best pilot. Confirm it is the
whole game and not a loader — if it dynamically imports level chunks, enumerate
them before trusting the effort estimate.

**Mechanic contract.** Race around one continuous painted planetary ring on bikes
or skateboards; three difficulties (Explorer, Racer, Expert); seven laps; branching
lanes; crystal cave; gravity fold; opal jump platforms; land stunts and skate
loops; boost through stardust; limited recovery.

**RE seeds.** `lap`, `ring`, `lane`, `crystal`, `gravity`, `opal`, `boost`,
`stunt`, `recover`, `difficulty`.

**Parity gate.** SM-02 (PARTIAL, L3), SG-03 (ring/tube — GAP, L2),
SG-05 (painted ring mesh — PARTIAL, L2), ST-01 (painted texture — GAP, L4),
SG-01 (PARTIAL, L5).

**Aura3D mapping.** `game.racing` + custom ring track; gravity zones as triggers
that reorient the up vector; stunts as timed input windows.

**Build.**

1. Ring spline with a closed loop and three branch gates; lane graph.
2. Surface adhesion: up vector = ring normal; gravity fold flips it over a zone.
3. Seven-lap race state machine with per-difficulty speed and recovery budget.
4. Stunt input windows (spin/flip) with landing detection.
5. Boost pickups (stardust) and limited recovery charges.
6. Painted-ring material from a canvas texture; opal via a custom shader.
7. Three difficulty presets, one HUD.

**Look.** Painted-toy planets, saturated opal highlights, starfield skybox, light
bloom; no realism.

**Acceptance.** Full seven-lap race on Racer with one branch choice, one gravity
fold, one landed stunt. Capture diff passes on lap count, checkpoint order, and
finish time. This is the Phase 0 exit fixture.

**Effort.** M — small source, but the ring/gravity model is custom.

---

### 6.8 Roadster Hours — 1,645 plays · racing · Aniket

**Shape.** Dynamic import — not in the DOM. Recover at Stage 3.

**Mechanic contract.** Fly a rocket-equipped roadster across three zones; clear
traffic; ride trailer roofs and facade banks; chain aerial tricks; earn tuning
upgrades. Controls: W/S drive, A/D steer, Space thrust, Shift nitro, Q/E roll; in
the air A/D spin and a fresh W/S press flips; Esc pauses.

**RE seeds.** `roadster`, `nitro`, `thrust`, `traffic`, `trick`, `flip`, `spin`,
`tune`, `zone`.

**Parity gate.** SH-02 (PARTIAL, L1), SH-03 (PARTIAL, L1), SG-02 (PARTIAL
internal, L5 — **probe-gated on P-2**), SM-02 (PARTIAL, L3). SH-07 is
**CLOSED** — no longer a gate. Phase 3.

**Aura3D mapping.** `arcadeKart` + flight mode; trick scoring; upgrade state in
`game.simulation`.

**Build.**

1. Three zone tracks (coast, canyon, skyway) with distinct palettes and hazards.
2. Hybrid controller: ground drive → thrust → airborne; roll and flip on the
   declared keys.
3. Traffic agents on splines; roof/facade collision surfaces.
4. Trick detection from rotation + airtime; combo chain and score.
5. Tuning shop: nitro, thrust, handling; persistent currency.
6. Camera that widens with speed and rolls with the car.

**Look.** Sunset coast, red canyon, high-altitude skyway; long shadows, warm
rim light, speed-based FOV.

**Acceptance.** One zone completed, two tricks landed, one upgrade purchased.
Capture diff passes on zone progress, trick count, and currency.

**Effort.** L.

---

### 6.9 Splat Rush — 1,372 plays · runner · Tushar

**Shape.** 43,212 B, external blob, one line, **importmap**. Smallest full game in
the set.

**Mechanic contract.** Roll a paint ball down an endless ramp; match incoming
colour gates; never burst.

**RE seeds.** `splat`, `paint`, `gate`, `color`, `burst`, `ramp`, `speed`.

**Parity gate.** ST-01 (canvas colour — GAP, L4), SM-02 (ramp — PARTIAL, L3),
SG-03 (ring gates — GAP, L2). Phase 0.

**Aura3D mapping.** No runner kit. One-lane auto-run with lateral input, pooled
ramp segments, gate spawner, colour state machine.

**Build.**

1. Pooled ramp segments with a gentle curve; recycle behind the player.
2. Ball controller: lateral position, roll visual, speed ramp.
3. Gate spawner: colour sequence with increasing frequency.
4. Colour match: correct = paint burst + score; wrong = shrink; empty = fail.
5. Speed curve and difficulty ramp over 120 s.
6. One-button + tilt touch input.

**Look.** Flat toy colours, no shadows, strong unlit saturation, light bloom.

**Acceptance.** 60 s run, 20 gates, three colours, one deliberate burst fail.
Capture diff passes on score, gate index, and colour state.

**Effort.** S — the cheapest end-to-end proof after Strange Orbit.

---

### 6.10 Ninja Runner — 1,142 plays · runner · Aniket

**Shape.** 867,109 B, external blob, **4,447 lines**, inlined. The most readable
large module; use it to trace runner mechanics.

**Mechanic contract.** Race through village, rooftops, forest, and water; dodge
masked ninjas; jump gaps; summon shadow clones; spinning energy attacks; unlock
stronger forms. Controls: WASD, Shift, 1–3, or swipe/tap.

**RE seeds.** `ninja`, `clone`, `form`, `spin`, `attack`, `gap`, `roof`, `water`,
`unlock`, `energy`.

**Parity gate.** SA-04 (clones — PARTIAL, L8), SH-02 (energy — PARTIAL, L1),
SG-05 (PARTIAL, L2), SM-02 (PARTIAL, L3), AU-02 (PARTIAL, L9). Phase 2.

**Aura3D mapping.** Runner kit does not exist. Build `game.runner` from
`game.platformer` + `game.planarCollisionWorld`; combat via pooled bolts;
clones via `SkeletonUtils.clone` equivalent.

**Build.**

1. Four biome segments with a shared lane/jump grammar.
2. Runner controller: forward speed, lane switch, jump, double-jump, slide.
3. Gap/hazard spawner and a fair-generation rule (no unwinnable sequences).
4. Shadow clones: 2–3 deferred copies that replay the player's last inputs and
   can absorb one hit.
5. Spinning attack: radial hitbox with cooldown; enemy pool.
6. Form unlocks: speed/jump/damage multipliers, gated by distance.
7. Mobile: swipe lanes, tap jump, hold for attack.

**Look.** Leafy village → sunset rooftops → dark forest → water; strong colour
script per biome, energy VFX additive, light bloom.

**Acceptance.** 60 s run, one clone summon, one form unlock, one combat hit.
Capture diff passes on distance, score, and form index.

**Effort.** L — the runner kit is the real deliverable.

---

## 7. Recommended order

Sequenced by parity phase, not by play count. The biggest games are not first
because their parity is not first.

| Order | Game | Why now | Effort |
| --- | --- | --- | --- |
| 1 | **Strange Orbit** | Smallest source (19 KB), importmap-readable, full racing kit — proves Stage 0–7 end to end and exits Phase 0 | M |
| 2 | **Splat Rush** | 43 KB, one mechanic, no custom shader — proves the loop and the HUD | S |
| 3 | **Saiyan Snake Way** | 211 readable lines; proves curves + tube geometry | M |
| 4 | **Drift & Deliver** | Best kit fit; proves drift scoring and city instancing | M |
| 5 | **HEATSINK** | Highest demand × best fit; exits Phase 1 (shaders + post + batching) | L |
| 6 | **Where the Wind Wanders** | Proves grass instancing and wind, no combat | M |
| 7 | **Ninja Runner** | Forces the runner-kit decision and clone animation | L |
| 8 | **Roadster Hours** | Proves hybrid drive/fly and trick scoring | L |
| 9 | **Last Train to the Sea** | Catalog #1; needs the vehicle-adventure composition | XL |
| 10 | **Silt & Signal** | Seven worlds + voice + water; the Phase 3 showcase | XL |

Games 5–10 are not blocked on each other; run them in parallel once their parity
phase is green, with disjoint file ownership per the repo's parallel-agent rules.
