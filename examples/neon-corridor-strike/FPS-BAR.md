# Neon Corridor Strike — FPS Reference Bar (LAW)

Scope: this file is the binding constraint set for any Neon Corridor Strike FPS
work in the Aura3D repo. Descendants treat it as law. It is derived from
`llms.txt`, `docs/agents/claims-and-boundaries.md`,
`docs/agents/game-example-standards.md`, `docs/agents/no-hackjob-rules.md`,
`docs/agents/asset-workflow.md`, `docs/guides/build-a-browser-game.md`, and the
public `templates/mini-game` game (positive example) plus `examples/game-slice`
(negative internal fixture). If anything here conflicts with those source docs,
the source docs win and this file must be corrected.

## 0. Repository state

- `examples/neon-corridor-strike` is a route-local **prototype** FPS on the
  public `@aura3d/engine` / `createAuraApp` surface.
- This file remains the constraint set: allowed APIs, typed assets, screenshot
  proof, and fail conditions. It does not promote the route to a flagship or
  reusable shooter kit.
- If gunfire reads as a yellow blob/cube/plane, or enemies read as shaking
  shards rather than characters, do not raise the claim label.

## 1. Allowed public APIs (hard boundary)

Public agent-authored FPS routes may import ONLY from public engine entries:

- Root safe API: `@aura3d/engine`
- Recommended isolated entries: `@aura3d/lean`, `@aura3d/lean/game`,
  `@aura3d/lean/product` (the `mini-game` public template uses
  `@aura3d/lean/game`).

Public symbols available (import only what you use): `createAuraApp`, `scene`,
`model`, `camera`, `lights`, `material`, `effects`, `prefabs`, `sceneKits`,
`primitives`, `group`/`groups`, `timeline`, `interactions`, `physics`, `labels`,
`environments`, `game`, `games`, `charts`, `character`, `city`, `product`,
`solar`, `particles`, `ui`, `instances`, `distanceLod`, `text3D`, `geometry`,
evidence helpers, `AnimationController`/`createAnimationController`,
`groundedRenderedAssetPlacement`, `normalizedRenderScaleForTargetHeight`,
`normalizedRenderScaleForTargetMaxDimension`.

Runtime pattern (law):

- One `createAuraApp(...)` per route. Never call it per frame; never
  `dispose()` + recreate in the loop.
- Mutable actors use `.runtime(game.runtimeNode("id"))` /
  `.runtime("id")`; read them via `app.nodes.require("id")`.
- Frame loop via `app.onFrame(...)`, with `app.pause()`, `app.resume()`,
  `app.step(dt)` for deterministic tests.
- Input via `app.input({...})` or `game.input({...})`; call `input.update(dt)`
  once per frame before `pressed`/`held`/`released`/`buffered`/`axis`/`combo`.
- Movement/physics through `game.*` helpers (`game.kinematicBody`,
  `game.collisionWorld`, `game.collider.*`, `game.combatWorld`,
  `game.fighting`, `game.platformer`, etc.) or the safe root `physics.*`
  namespace. Do NOT import `PhysicsWorld`, `Shape`, `PhysicsDebugAdapter`,
  `ArcadeCharacterController` directly (those are package internals — see
  `examples/game-slice`, which is an internal fixture, NOT a public example).
- Gunfire, muzzle flash, tracers, impact sparks, smoke MUST be real Aura3D
  scene content: `particles.*` / `effects.*` / typed/model geometry / lights.
  They are NOT DOM/CSS/canvas overlays.

## 2. Claim label: PROTOTYPE (mandatory until gated)

- Neon Corridor Strike is a route-local game. Until root-exported, root-tested
  game kits + full browser pixel/runtime evidence exist for every claimed
  mechanic, its label is **`prototype`** per the label table in
  `docs/agents/claims-and-boundaries.md`.
- Route-local gameplay logic (fail states, corridor collision, weapon fire,
  enemy AI, objective pacing) must be documented as **route-local**, and any
  gap in the public kit filed as a library task. Do NOT claim a reusable
  FPS/shooter/character-controller/collision kit.
- Forbidden claim inflation: production rendering, PBR parity, HDR/IBL,
  postprocess (bloom/SSAO/DOF/TAA), WebGPU, skinned animation, morph targets,
  production game kits, generic collision systems, "Unity/Unreal/Babylon
  parity", "flagship". None of these may be claimed from root `createAuraApp`
  without root-only browser evidence proving that exact result.
- A compiling route, a nonblank screenshot, a large PNG, or a route load is NOT
  proof. If evidence is missing, lower the label; never broaden the claim.

## 3. Typed-asset rules (release blocker, not style)

- Every primary subject — the rifle/weapon, the corridor/world, and each
  humanoid/creature enemy — MUST be a typed GLB/glTF asset resolved through the
  Aura3D CLI, imported from generated `./aura-assets` and rendered with
  `model(assets.<key>)`.
- Acquire via CLI BEFORE writing scene code:
  - Catalog: `assets search "<phrase>"` then
    `assets resolve "<phrase>" --name <key>`.
  - Enemies/characters: use the fighting-character profile
    (`--profile fighting-character`) so candidates are animated, redistributable
    humanoids with preserved provenance.
  - Local files: `assets add ./assets/<file>.glb --name <key>`.
- After resolve/add, read generated `src/aura-assets.ts` and import `assets`.
  Use the EXACT generated key. If the key is missing, stop and fix the asset
  step — never fall back to a made-up id, URL, or draft path.
- Placement: use `groundedRenderedAssetPlacement(...)` /
  `normalizedRenderScaleForTargetHeight(...)` /
  `normalizedRenderScaleForTargetMaxDimension(...)`. Do NOT do raw
  `boundsMetadata` scale math in route code; the safe renderer normalizes and
  grounds GLBs first.
- Provenance required for release-facing primary assets: typed key in
  `src/aura-assets.ts`, entry in `aura.assets.json`, hashed file under
  `public/aura-assets/`, source page, download URL when available, license name
  + URL, author when available, acquisition timestamp, and inspection data
  (bounds/nodes/materials/textures/clips/skins/morphs). Temp
  `/var/folders/.../T/aura3d-resolve-*` paths are NOT durable provenance.
- Primitives are allowed ONLY as set dressing / collision guides / debug markers
  / HUD anchors around resolved real assets. A primitive can NEVER be the
  primary rifle, corridor hero geometry, or enemy body.
- Validate before claiming asset readiness:
  - `assets validate --no-placeholders --require-license`
  - `assets validate-game --profile fighting-character --asset <enemyKey> ...`
  - `assets validate --source` / `assets validate --release` when available;
    otherwise perform the source scan manually and hold at `prototype`/`blocked`.

## 4. Screenshot / evidence proof rules

A route is a game claim only with browser pixel + runtime evidence, not source
or a still. Follow the `templates/mini-game` proof pattern:

- Mount the real route, wait for `data-aura3d-ready="true"` (set from
  `app.ready()` diagnostics), then drive real keyboard/pointer input.
- Read the actual WebGL2 canvas with `gl.readPixels(...)` and assert color
  buckets that must be present (e.g. bright pixels, distinct hue buckets,
  weapon/tracer warm pixels, enemy pixels, impact/blood red pixels,
  `uniqueBuckets` diversity). Blank/mono screens fail.
- Assert runtime state changed from input (e.g. player moved, enemy hp dropped,
  ammo decremented, score/objective advanced) via a `window.__...__` evidence
  object, not just that a canvas exists.
- Capture start, after-input, mid-route, fail/reset, and finish/progression
  screenshots. Save screenshot + JSON profile under `tests/reports/`.
- Session length: FPS showcase must support ≥60s of meaningful play; no 5–10s
  micro-demo. A deterministic proof replay may supplement but NEVER replaces
  player-driven input evidence.
- Required proven mechanics: keyboard/pointer input visibly changes state;
  objective; scoring OR fail condition; reset (after normal play and after
  win/fail); progression loop; automated tests for movement, restart, and at
  least one hit/kill/score/completion mechanic.
- Route-health (or equivalent) must name: renderer backend/mode, fallback
  state, exact primary assets, primitive count, known limits, and claims — and
  must match source. Stale route-health is a fail.
- **UI/interactive bug fixes**: capture a screen recording (before/after) and
  cite its artifact path in the handoff.

## 5. Explicit FAIL conditions (auto-reject — treat as law)

Any one of these fails the route regardless of green automated status:

1. **Yellow-blob / cube / plane / sprite gunfire.** Muzzle flash, projectiles,
   tracers, and impacts that are a flat yellow blob, a primitive cube/quad/
   plane, or a 2D sprite/DOM/CSS overlay standing in for real fire. Gunfire must
   be real Aura3D scene content (typed/model geometry, `particles.*`,
   `effects.*`, lights) and must read as a weapon discharge on screen.
2. **Shaking / unreadable / non-character meshes.** Enemies or the player that
   merely translate left-right, jitter/shake in place, or are primitive
   blobs/boxes/capsules that do not read as a humanoid/creature. Characters must
   be typed GLB/glTF humanoid/creature assets that are readable as characters
   and actually act (move with intent, aim, attack, die/react), not vibrate.
3. **CSS / DOM / canvas fake 3D.** Any particle, bloom, trail, muzzle flash,
   lighting, shadow, explosion, label, scanline, or "3D" effect faked with
   CSS/DOM/2D-canvas and presented as Aura3D rendering or as screenshot
   evidence. DOM/CSS is UI chrome/HUD only.
4. **Raw three / GLTFLoader / raw GLB URLs / string ids.** `import * as THREE`,
   `three/examples/...`, `new GLTFLoader()`, `OrbitControls`, hand-wired
   renderer/scene/camera loops, `model("id")`, `model("/path.glb")`, raw
   `.glb`/`.gltf`/CDN URLs, or `unsafeModelUrl(...)` in the public route.
5. **Primitive-only primary subject.** Rifle, corridor hero geometry, or enemy
   built only from primitives (the subject of this whole task's complaint).
6. **Claim > evidence.** Any production/PBR/WebGPU/postprocess/skinned-animation
   /"parity"/"flagship" wording without matching root-only browser pixel proof.
7. **Autoplay-as-playability.** Deterministic proof replay or a ghost/autoplay
   used to stand in for real player input evidence.
8. **Stale/absent provenance.** Primary asset missing from `aura.assets.json` /
   `src/aura-assets.ts`, or lacking durable license/source metadata.
9. **Shown before 10/10.** Surfacing the route in galleries, README, marketing,
   deploy manifests, or claims before browser-audited 10/10 evidence exists.
   If it is not a proven 10/10, delete/omit it — do not show it.

## 6. Recommended asset search / resolve queries

Run these with `npx @aura3d/cli@latest`. Prefer descriptive natural-language
phrases (the index ranks by meaning + quality). Resolve the top clean,
redistributable, license-verified match, then use the generated typed key.

Readable rifle / weapon (first-person + world model):

```bash
npx @aura3d/cli@latest assets search "sci-fi futuristic assault rifle game weapon"
npx @aura3d/cli@latest assets search "neon cyberpunk energy rifle blaster gun"
npx @aura3d/cli@latest assets resolve "sci-fi futuristic assault rifle game weapon" --name rifle
# fallbacks: "modern military assault rifle low poly game ready",
#            "plasma pulse rifle handheld weapon"
```

Corridor / world (neon sci-fi interior):

```bash
npx @aura3d/cli@latest assets search "neon cyberpunk sci-fi corridor interior hallway"
npx @aura3d/cli@latest assets search "futuristic space station corridor modular hallway"
npx @aura3d/cli@latest assets resolve "neon cyberpunk sci-fi corridor interior hallway" --name corridor
# fallbacks: "dark industrial spaceship corridor with pipes and panels",
#            "sci-fi tunnel walkway with emissive strip lights"
# also consider sceneKits.neonTunnel() ONLY as set dressing/backdrop context,
# never as the primary typed corridor asset.
```

Humanoid / creature enemies (animated, fighting-character profile):

```bash
npx @aura3d/cli@latest assets search "animated humanoid enemy soldier combat character" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated humanoid enemy soldier combat character" --name enemySoldier --profile fighting-character
npx @aura3d/cli@latest assets search "animated sci-fi robot drone enemy creature" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "animated alien creature monster enemy" --name enemyCreature --profile fighting-character
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset enemySoldier --asset enemyCreature --no-placeholders --require-license
# fallbacks: "cyberpunk armored guard humanoid character rigged",
#            "quadruped alien beast game creature animated"
```

Player hands/arms (optional, for viewmodel):

```bash
npx @aura3d/cli@latest assets search "first person player hands arms tactical gloves rigged" --profile fighting-character --json
npx @aura3d/cli@latest assets resolve "first person player hands arms tactical gloves rigged" --name playerHands --profile fighting-character
```

## 7. Build order for descendants (non-binding guidance)

1. Resolve typed assets (§6) → confirm keys in `src/aura-assets.ts`, provenance
   in `aura.assets.json`.
2. Mount one `createAuraApp` route from `@aura3d/engine` or `@aura3d/lean/game`;
   corridor + rifle viewmodel + enemies as typed models with runtime nodes.
3. Real input (WASD + mouse/pointer look + fire) via `game.input` /
   `app.input`; movement/collision via `game.*` or `physics.*`.
4. Real gunfire with `particles.*`/`effects.*`/lights + hit detection that drops
   enemy hp; enemies act (approach/aim/attack/die) via `game.*` AI or
   route-local logic documented as route-local.
5. Objective + scoring/fail + reset + ≥60s progression; HUD via `ui.*`/DOM
   (chrome only).
6. Browser pixel + runtime evidence (§4) for every claimed mechanic; capture
   the required screenshot set + a screen recording of interaction.
7. Only then attach a `prototype`-labeled claim. If any §5 fail condition holds
   or evidence is missing, do not show it — omit or delete.
