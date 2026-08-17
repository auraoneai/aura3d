# Aura3D full public-example audit and improvement prompt

Copy everything below the line into another coding agent. Attach this file or paste it as the first message. The agent should work in the Aura3D repo, not write a report and stop.

---

You are the owner of a full visual, gameplay, physics, and stability pass over every public Aura3D 2.0.2 example and game.

This is not a docs-only review and not a “looks fine in a screenshot” pass. You must open every public route, operate every control, play every game, hunt for regressions, and then **fix what you find**. If a route is weak, thin, ugly, unstable, truncated, physically wrong, or less fun than it should be, improve it. Do not wait for permission on clear, reversible local work.

Current version is **Aura3D 2.0.2**. Public packages, templates, and the live site at https://aura3d.auraone.ai already claim that version. Do not bump versions or publish npm unless the user explicitly asks.

## Read first, in this order

1. `llms.txt`
2. `docs/agents/claims-and-boundaries.md`
3. `docs/agents/no-hackjob-rules.md`
4. `docs/agents/anti-hallucination-rules.md`
5. `docs/agents/game-example-standards.md`
6. `docs/guides/build-a-browser-game.md`
7. `docs/api/game-runtime.md`
8. `docs/project/showcase/visual-quality-standard.md`
9. `docs/project/showcase/quality-gates.md`
10. `docs/project/showcase/apps-classification.md`
11. `docs/project/aura3d-202-release-notes.md`

Then inspect source under `apps/`, `examples/`, `marketing/`, and the matching tests under `tests/browser/` and `tests/unit/`.

## Mission

Go through **every public example** on the catalog and the live site. For each one:

1. Inspect source.
2. Run the route locally and on https://aura3d.auraone.ai when the network is available.
3. Operate every control a real user would use.
4. Record defects with the exact file, symptom, and root cause.
5. Fix the defect in source. Do not paper over it.
6. Re-verify the route after the fix.
7. If the route is technically working but still a weak public example, make it better.

A compiling route is not success. A non-blank screenshot is not success. A passing unit test that never mounts the scene is not success.

## Complete public inventory

Visit every card on `/apps/showcase-index/` and the homepage posters that advertise those routes. Do not skip “small” labs.

### Featured apps and games

| # | Route | What “good” means |
| --- | --- | --- |
| 01 | `/apps/showcase-product-configurator/` | Typed headphone product is the hero. Variants, finishes, part focus, and lighting actually change the product. Controls do not cover the product. No wrong-car poster, no cropped license text, no JSON dump thumbnail. |
| 02 | `/apps/showcase-smart-city-control/` | Operations overlay on a readable city. Day/night, district focus, and telemetry change the scene. Card/poster must be this route, not the Tokyo stress-test frame. |
| 03 | `/apps/showcase-cinematic-architecture/` | Typed architecture is readable. Camera staging does not clip the hero. Lighting and framing feel intentional. |
| 04 | `/apps/showcase-digital-twin-ops/` | Zones, sensors, and state are visible and interactive. Dashboard UI does not hide the 3D floor. |
| 05 | `/apps/showcase-blockfall-reactor/` | Playable falling-block game: spawn, move, rotate, soft/hard drop, hold/queue, line-clear, score, game-over, reset, progression. Cabinet and board stay readable. Distinct from Clash. |
| 06 | `/apps/showcase-turbo-drift-circuit/` | Four-lap arcade race. Player can pass the rival **on grey asphalt**. Rapier owns solid contact. SAT must not teleport cars. Opponent `onRoad` is body-on-asphalt, not kerbs. Camera, gates, drift, off-track recovery, reset all work. |
| 07 | `/apps/showcase-skyline-runner/` | Complete Level 1, not a strip. Move, jump (no tap-hop), fall, respawn, checkpoints, coins, score, ember volleys (`KeyJ`), sentries hide when defeated, finish between 70–115s (authored 95s). Camera keeps the hero readable. |
| 08 | `/showcase/aura-clash/playable/` | Movement, attacks, health, rounds, reset, accessibility, touch. Distinct combat feel from Blockfall. Fighters stay on the arena. |

### Advanced gallery (`/apps/advanced-examples-gallery/`)

Open the gallery chrome **and** each hash route. The canvas must not be a 300×150 leftover. CSS must load.

| # | Hash | What “good” means |
| --- | --- | --- |
| 09 | `#water-lab` | Water responds to pointer. Dock/props stay grounded. No flat unlit plane. |
| 10 | `#ocean-observatory` | Distinct from Water Lab. Horizon, deck, and motion stay readable. |
| 11 | `#reactor-post` | Post/emissive controls visibly change the scene without washing it out. |
| 12 | `#smart-city` | Littlest Tokyo is the **only** authored hero. No extra west/east district GLBs. No tram/train/bus running through buildings. Traffic stays outside keepout. |
| 13 | `#data-galaxy` | Dense, interactive, not a static starfield. Controls change formation/count. |
| 14 | `#product-configurator` | This is the **concept car** gallery route, not the headphone studio. Variants, turntable, explode, and lighting work. Thumbnail must not be a broken text dump. |
| 15 | `#robotics-lab` | Animated actors, grounded lab, timeline/state changes. Not one white character on a blank floor. |
| 16 | `#physics-playground` | Rapier/rigid bodies, conveyors, contacts you can see. No fake collision. |
| 17 | `#fog-cathedral` | Depth, haze, readable architecture. No crop seams or empty fog box. |
| 18 | `#digital-twin` | Factory zones tied to the 3D scene. Controls change simulation state. |

Also treat `#` / the gallery shell itself as a route: nav, scene switcher, capture, reset, HUD, and canvas size.

### Focused engine examples

19 `/apps/loader-gltf-variants/` — variant switching is visible  
20 `/apps/loader-obj/` — subject readable, not a dump  
21 `/apps/texture-anisotropy/` — filtering difference is visible  
22 `/apps/postprocessing-depth-outline/` — outline is visible and not a smear  
23 `/apps/controls-trackball/` — drag/zoom work and stay stable  
24 `/apps/geometry-drawrange/` — range change is visible  
25 `/apps/interactive-picking/` — pick highlight/selection works  
26 `/apps/camera-multiple-views/` — every view is live and labeled  
27 `/apps/webxr-interactions/` — honest about injected/supported XR; no fake headset claim  

### Visual / asset labs

28 `/apps/wow-simple-transforms/`  
29 `/apps/wow-robot-expressive-rig/` — must not be overexposed / washed white  
30 `/apps/wow-boombox-texture-lab/`  
31 `/apps/wow-standard-material-spheres/`  
32 `/apps/wow-webgpu-compute-particles/` — honest WebGPU vs WebGL2 fallback  
33 `/apps/wow-tokyo-keyframes/`  
34 `/apps/wow-damaged-helmet-pbr-detail/` — must not be overexposed / washed white  
35 `/apps/wow-concept-car-cinema/` — cinematic car, not a broken thumbnail  
36 `/apps/advanced-examples-gallery/` — full gallery console  

### Also audit these surfaces

- Homepage https://aura3d.auraone.ai/ — posters, overlays, cropped labels, wrong images, version chrome
- `/apps/showcase-index/` — fonts (Aeonik / Aeonik Fono / Minion Pro), orbital Aura3D mark, card copy vs actual route, preview images
- Marketing docs pages under `/docs/`
- Catalog WebP / homepage posters vs the live route they advertise
- Mobile and desktop viewports for every layout you touch

## Hard product rules

These are not optional style preferences.

- Public examples import only `@aura3d/engine` (or the documented lean entries). No `three`, `three/examples/...`, `GLTFLoader`, `OrbitControls`, hand-made renderer loops, or raw `.glb` URLs.
- Assets come from generated `src/aura-assets.ts` / `aura.assets.json`. Never invent IDs or sample-model URLs. Never use `unsafeModelUrl(...)` in public examples.
- Named characters, vehicles, products, creatures, weapons, worlds, and hero environments are typed GLBs. Primitives are set dressing, collision guides, HUD anchors, puzzle cells, or explicit abstract viz only.
- DOM / CSS / canvas overlays are UI only. They must not fake particles, lighting, labels, shadows, trails, explosions, or renderer evidence.
- Rapier is the sole physical-simulation owner. Authored arcade motion is allowed and must be labeled arcade. Do not add a second physics engine.
- Do not claim production renderer parity, full PBR, HDR/IBL, WebGPU, postprocess, skinned animation, morphs, or reusable game-engine kits unless a root-only browser test proves that exact claim.
- Do not weaken tests, delete failing gates, or invent evidence files under `tests/reports/`, `release-artifacts/`, or `dist/`.
- Do not revert unrelated dirty work.
- Screenshots prove only the frame. They do not prove gameplay.

## What to inspect on every route

Work this list. If a row fails, fix it.

### Graphics and framing

- First-load subject is readable within ~3 seconds at 1440×900 and at a mobile viewport
- Overexposure, underexposure, crushed blacks, blown metals, white-out clearcoat
- Clipped cameras, cropped heroes, HUD covering the subject
- Wrong aspect, letterboxing, 300×150 default canvas, empty WebGL context
- Giant debug markers, locator disks, leftover proof geometry
- Materials that ignore variants, textures that fail to load, missing Draco decoder (`/assets/draco`)
- Background / IBL / studio lighting fighting the asset
- Fog, bloom, or post that washes the scene or hides the subject
- Z-fighting, transparent sort breakage, flickering, stuttering camera

### Truncation and UI

- Text overflow, ellipsis on important labels, cropped license/author lines
- Panels off-screen, overlapping controls, unreadable contrast
- Homepage overlay covering poster labels
- Catalog cards using the wrong image or a broken text-dump thumbnail
- Fonts/header/logo inconsistent with the homepage (catalog must use homepage type and orbital mark)

### Physics, contact, and stability

- Feet / wheels / cabinets sit on the visible ground, not in air or through the floor
- Rapier contact is visible when the route claims collision (Turbo cars, physics lab, Clash)
- No tunneling through walls, buildings, platforms, or other vehicles
- No sticky stacking, teleporting SAT corrections, or “one body” glued cars
- On-road / on-platform tests match the **visible** surface, not a wider invisible box
- Jumps, landings, and jump-release feel intentional (Skyline jump-release once per jump)
- Long sessions do not accumulate NaNs, exploding velocities, or sinking bodies
- Reset returns a stable, playable state

### Gameplay and feel

For every game (Blockfall, Turbo, Skyline, Clash) and any interactive lab with a win/fail loop:

- Keyboard / pointer / touch actually change state
- Objective, score or progress, fail or completion, reset, and at least one progression loop
- Session is a real slice, not a 5–10s toy
- Camera keeps the player readable without hiding the world
- AI / rival is passable and honest (Turbo: pass on asphalt; opponent onRoad is asphalt)
- Distinct games stay distinct. Do not make Blockfall and Clash share one log or one feel
- Improve fun when the loop is thin: better pacing, readable feedback, fair challenge, clearer rewards. Skyline already has coins, score, and ember volleys — do not copy Mario IP, but you may deepen original collect / combat / route craft
- Do not replace Rapier with SAT teleports to “fix” racing

### Stability and load

- Hard refresh, hash changes, and back/forward do not leave a dead canvas
- Gallery scene switches dispose the previous scene; no leaked WebGL contexts or stacked HUDs
- Draco / KTX2 / GLB 404s, `/favicon.ico` 404s, missing fonts
- Console errors and uncaught exceptions during first 30s and during play
- Resize, tab backgrounding, and return-to-tab
- Production origin vs local: if production is broken and local is not, fix the deploy path (public assets, base URLs, Draco)

### Honesty

- Card title, homepage poster, and live route must show the same subject
- Do not write “accepted-fidelity” or other internal jargon on public UI
- Do not claim WebGPU, PBR parity, or city simulation the route does not prove
- Keep Turbo / Skyline / Blockfall claim labels honest if independent visual review is still pending; you may still improve the playable routes

## Do not regress these 2.0.2 fixes

Treat these as locked unless you have a strictly better, proven replacement:

- Turbo visual asphalt wide enough to pass; Rapier contact; SAT is player commanded-target clamp only; opponent `onRoad` from grey asphalt
- Skyline coins, score, ember volleys, once-per-jump release, 70–115s / 95s authored window
- Homepage Product Configurator poster is the **headphones**, cropped so labels are not under the overlay
- Smart City Control Room card uses the Control Room capture, not Tokyo
- Smart City Stress Test is Tokyo-only; tram/train/bus authored nodes excluded; traffic keepout
- Catalog uses homepage Aeonik stack and the orbital Aura3D mark
- Robot-rig and Damaged Helmet exposure is lowered
- Public Draco decoder at `/assets/draco`
- Real `/favicon.ico`

## How to work

1. Start from the catalog. Open all 36 routes. Keep a checklist. Do not mark a route done until you have **used** it.
2. For games: play, do not watch. Complete at least one full loop (a race, a Level 1 attempt, a Blockfall game-over, a Clash round). Try the fail path and reset.
3. For configurators and labs: click every control, switch every variant, drag every slider, reset, and confirm the pixels change.
4. For gallery: switch scenes from the shell and via deep links. Confirm chrome + canvas both survive.
5. Check desktop (~1440×900) and a mobile viewport on any route whose layout or HUD you touch.
6. When you find a defect, classify it (graphics / asset / scale-camera / physics / game-feel / UI-truncation / load-stability / claim), find the owning source, and fix the root cause. See `docs/agents/no-hackjob-rules.md`.
7. Prefer public API fixes (`createAuraApp`, `game.*`, lights, camera, materials, typed assets) over route-local hacks.
8. If the asset is the problem, replace it through the CLI catalog / typed manifest. Do not invent a URL.
9. If the example is merely dull, improve it: better camera, lighting, pacing, feedback, readable HUD, fairer physics, richer but original game craft.
10. Add or update focused tests when you change behavior. Do not weaken existing tests.
11. After a cluster of fixes, re-walk neighboring routes that share code (gallery shell, wow lighting, catalog posters, game kits in `packages/engine/src/agent-api/`).

## Local and production

- Local: repo Vite / marketing preview as documented in `docs/project/getting-started.md`
- Production: https://aura3d.auraone.ai and the same paths under `/apps/...`
- A local-only fix is incomplete if production still 404s Draco, favicon, assets, or CSS
- Do not hand-edit `dist/`, `marketing/dist/`, `tests/reports/`, or `release-artifacts/` as source

## Improvement bar for games

You are allowed — and expected — to make the public games better when the current loop is thin or frustrating.

Good improvements:

- Fair passing, readable speed, rival that can be beaten without cheating physics
- Collectibles, score pop, hazard defeat, checkpoints, and camera that sell a complete level
- Board/cabinet readability, piece preview, and game-over that you can immediately replay
- Combat that reads (hit, hurt, round, reset) without HUD-only fakery
- Audio-free visual feedback is fine; do not invent a sound engine claim

Bad improvements:

- Copying Mario / other game IP
- SAT or kinematic snaps that skip Rapier
- CSS explosions or DOM coins as “3D”
- Primitive heroes
- Making every game share one HUD or one log format just to reuse code

## When you are done

Do not claim the job is finished until:

- every inventory row has been opened and operated
- every defect you filed is fixed or explicitly blocked with a root-cause note
- every route you changed has been re-played / re-clicked
- desktop and mobile were checked for layout-affecting changes
- you have not regressed the locked 2.0.2 fixes
- you can list, in plain language: what you inspected, what you fixed, what is still weak, and what you did not verify

Lead with what is true. Do not invent evidence. Do not declare production “approved” because local looked better.

If the user later asks to push, bump, or publish, that is a separate release step. This prompt is the example/game quality pass.
