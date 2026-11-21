# Aura3D 5.7.2 — 30 Live Games 10/10 Visual, UI/UX & Design Enhancement PRD

> **Execution Policy:** Authorized for immediate autonomous product code implementation (`CODE_COMPLETE_GO`).
> **Blueprint Discipline:** Treat this PRD as a read-only engineering blueprint during execution—do not commit status-table churn or add new checkboxes/work packages mid-run (frozen denominator).

---

## 1. Executive Summary & Autonomous Decisions

- **Objective:** Elevate all **30 live Aura3D showcase games** (`docs/workflows/game-inventory.json`, frozen denominator) to a cohesive, proof-grade 10/10 standard across 3D visuals, UI/UX, mobile (`390x844`) ergonomics, and game feel by adopting Aura3D **`5.7.2`** rendering, animation, and game-kit capabilities, eliminating every observable visual/HUD defect captured in `evidence/<evidenceFolder>/screens/final/`, and clearing all **102 static warnings** currently reported by `node tools/game-checks/run.mjs --all`.
- **Autonomous Decisions Resolved from Codebase:**
  1. **Strict 30-Game Denominator:** Only the 30 `status: "live"` games in `tools/site/games.catalog.json` / `docs/workflows/game-inventory.json` are in scope. Retired or non-live apps (`showcase-red-zone-3d`, `showcase-meshy-relic-pilot`, `veer-wonder-world`, `vesper-gt`, `ember-courier`) are excluded.
  2. **Replay-Parity Preservation Invariant (11 `replay-verified` Ports):** `Craterline GP`, `Splat`, `Serpentine Sky Run`, `Gridlock Courier`, `Ion Circuit`, `Shadowstep Gauntlet`, `Lamplight Line`, `Saltwind Highway`, `The Bellkeeper's Walk`, `Duneglide`, and `Cumulus Dash` have bit/tolerance-exact deterministic replays (`sim.ts`, `course.ts`, `race.ts`, `reentry.ts`, `road.ts`, `collide.ts`, `hazards.ts`). Every visual, shadow, sky, PBR, VFX, camera-occlusion, and UI/HUD upgrade on these 11 games lives strictly in the presentation, art, VFX, and HTML/CSS layers; deterministic simulation files are never altered.
  3. **Aura3D `5.7.2` Direct Kit Migration:** Replace all remaining `apps/showcase-port-shared/{feel,vfx-pack,idol}` shim imports with direct public exports from `@aura3d/engine`, `@aura3d/engine/game`, and `@aura3d/engine/animation`. Adopt `shadow.softness`, `shadow.fit`, stylized `sky.gradient`, `output.neutralCurve: "khronos"` (where neutral daylight/neon color fidelity is required), `createHumanoidAnimator`, `createSnapshotInterpolator`, `readAutoplayFlag` + `createAutoplayHarness`, `createImpactRig`, `createFlipbookAtlas` + `effects.flipbook({ texture })`, `createGradingLut`, and `aura3d assets inspect --pbr` (5.7.1 WebGL2 clearcoat parity + lossless PNG normals).
  4. **Unique Art-Direction Identity (`look-identity`):** Per `docs/agents/art-direction.md` §9, every game retains its own unique primary HDRI (when `background: "hdri"`), unique `signatureEffect`, and distinct `palette.primary` (zero 3-hex collisions). HUDs unify on licensed self-hosted typography (`apps/showcase-port-shared/hud-tokens.css` + `packages/game/src/hud/themes.ts` `HUD_THEMES`) while preserving genre- and game-specific color accents.
  5. **Zero-Warning Hygiene Target:** Implementation resolves all 102 existing warnings from `node tools/game-checks/run.mjs --all`: `borrowed-asset` (41: 35 in `slingshot-siege`, 6 in `pips-big-leap`), `screens-fresh` (30: post-5.7.2 real-GPU recapture + `build-card-images.mjs`), `luma-band` (17: missing `crop:lamp` in `aura-hoops-3d`, missing `crop:flood-bank` in `aura-fc-3d`, low luma spread in `cross-hop`, missing `luma-bands.json`/`luma-after.json` in all 5 runner-kit games), `page-parity` (12: `top-tennis` + all 11 `*-port` apps), `brand-identifiers` (1: `examples/ninja-runner-port/art/proceduralModels.ts:1705`), and `skin` runner invocation (`tools/game-checks/skin-runner.mts`).
  6. **Aura3D-Exclusive & Remote-First Execution:** All 3D/WebGL/WebGPU work uses `@aura3d/*` exclusively; no local Docker or local Playwright. Visual verification uses `tools/remote-acr/run.sh` (software GL luma capture) and batched real-GPU headless Chrome over loopback CDP (`tools/release/render-gate/cdp-capture.mjs` with `--headless=new` and `/tmp/a3d-rea.lock`).

---

## 2. Current Codebase State, Aura3D 5.7.2 Capability Map & 30-Game Gap Matrix

### 2.1 Aura3D `5.7.2` Capabilities Driving the 10/10 Upgrade

| Capability (`5.7.0`–`5.7.2`) | Public Entry / CLI | Current Adoption (of 30) | Target 10/10 Role |
|---|---|---|---|
| **Stylized `sky.gradient`** (`mid`, `haze`, `sun.glow`, `dither`) | `@aura3d/engine` (`sky.gradient`) | 14 / 30 | Painted multi-band game skies with horizon haze & glow lobes without hand-written GLSL/WGSL domes (keep custom domes only where clouds/aurora/planets/stars are required) |
| **Directional `shadow.softness` & `shadow.fit`** | `@aura3d/engine` (`lights.directional` / `lights.key`) | `softness`: 12 / 30; `fit`: 3 / 30 | Texel-locked light-space ortho boxes (eliminates shadow shimmer/crawling on camera zoom/pan) + calibrated PCF penumbra (`0.4–0.6` lunar hard, `1.5–2.2` sunlit/floodlit soft) |
| **Khronos PBR Neutral** (`output.neutralCurve: "khronos"`) | `@aura3d/engine` (`createAuraApp` / `setOutput`) | 0 / 30 | True-to-life daylight whites, chalk, jerseys, and neon saturation below the 0.76 knee without legacy per-channel grey compression |
| **5.7.1 WebGL2 Clearcoat Parity & PBR Tooling** | `@aura3d/cli` (`assets inspect --pbr`, `assets validate --pbr`, glossy-safe `assets slim`/`optimize`) | 0 / 30 audited post-5.7.1 | Crisp dielectric clearcoat paint (`metalness: 0`, `clearcoat: 1.0`, `clearcoatRoughness: 0.05–0.08`), lossless PNG normals, `normalScale <= 0.3` on vehicles/balls/props |
| **Parent-Local Nested Handles & `handle.part()`** | `@aura3d/engine` (5.7.0 breaking fix) | Partial (several M18 workarounds remain) | Clean vehicle-seated riders/drivers (`The Bellkeeper's Walk`, `Saltwind Highway`, `Splat Turf`) and exact enemy attachments (`Bunker Zero` visor/gun/hound) with zero matrix lag |
| **Humanoid Animator & Clip Helpers** | `@aura3d/engine/animation` (`createHumanoidAnimator`, `humanoidLocomotionTime`, `layerHumanoidPose`, `ARM_ROLES`) | 0 / 30 direct (many use `showcase-port-shared/idol/` shims) | Cross-faded skeletal playback, distance-driven planted feet, upper-body grip layering |
| **Game Feel, Flipbook VFX & LUT Kits** | `@aura3d/engine/game` (`createImpactRig`, `createProceduralSfx`, `ScreenFx`, `drainPopups`, `GameRng`, `createFlipbookAtlas`, `createGradingLut`) + `effects.flipbook({ texture })` | `impactRig`: 30 / 30 (many via shims); `flipbook`: 26 / 30; `LUT`: 17 / 30 | Direct live-texture flipbook bursts (`sparks`, `dust`, `ink`, `plasma`, `muzzle`, `ripple`), deterministic zero-asset grading LUTs (`cinema-warm`, `broadcast-crisp`, `cyber-neon`), real-time hit-stop & FOV kicks |
| **Autoplay & Fixed-Step Snapshot Interpolation** | `@aura3d/engine/game` (`readAutoplayFlag`, `createAutoplayHarness`, `createSnapshotInterpolator`) | `snapInterp`: 3 / 30; `autoHarness`: 3 / 30 | Silky 120/144 Hz interpolated motion (`runMotionGate`) + standardized `?autoplay=1` hands-free QA loop (clearing `AUTOPLAY_INLINE_ALLOWLIST`) |
| **Licensed Typography & HUD Theme System** | `apps/showcase-port-shared/{hud-tokens.css,quickbar.css}`, `packages/game/src/hud/themes.ts` (`HUD_THEMES`) | `hud-tokens`: 22 / 30; `quickbar`: 20 / 30; `HUD_THEMES`: 3 / 30 | Cohesive genre HUD craft (`sports-broadcast`, `motorsport`, `sci-fi-telemetry`, `fighting`, `storybook`, `ink-scroll`, `sky-expedition`, `arcade-neon`, `tabletop`) using self-hosted licensed WOFF2 fonts only |

### 2.2 30-Game Master Audit & Gap Matrix

| # | Game (`slug`) | Genre | Replay Lock | Primary Source (`apps/` + `examples/`) | Active Warnings (`game-checks`) | Top Observed Visual / UX Flaws | Key 5.7.2 Upgrades |
|---|---|---|---|---|---|---|---|
| 01 | **Aura Slam 3D** (`top-tennis`) | Sports | Playable | `apps/showcase-top-tennis`, `examples/aura-slam` | `page-parity`, `screens-fresh` | Disabled `SUN_SHADOW_FIT`; dark NY baseline rim loss; huge lime title modal; mobile black letterbox bands; quickbar clips `Beach`/`Moon` | `shadow.fit`+`softness`, `sky.gradient`, `createFlipbookAtlas`, `HUD_THEMES["sports-broadcast"]`, `page-parity` sync |
| 02 | **Aura Hoops 3D** (`aura-hoops-3d`) | Sports | Playable | `apps/showcase-aura-hoops-3d` | `luma-band` (2: `crop:lamp`), `screens-fresh` | Out-of-frustum `lamp` crop; flat Rucker blue-hour; blocky in-world LED board; modal overlaps controls hint; missing `viewport-fit=cover` | `COURT_KEY_SHADOW` `fit`+`softness`, `sky.gradient`, per-court LUT, `crop:lamp` fix, `HUD_THEMES["sports-broadcast"]` |
| 03 | **Aura Diamond 3D** (`aura-diamond-3d`) | Sports | Playable | `apps/showcase-aura-diamond-3d` | `screens-fresh`, `skin` (4 info) | Disabled `KEY_SHADOW_RANGE` `fit`; confusing dual PCI white rings; mobile pitch pill overlaps line score; dead `/fonts/aura-fonts.css` | `shadow.fit`+`softness`, `createGradingLut`, `effects.flipbook`, `createHumanoidAnimator`, mobile scorebug fix |
| 04 | **Aura FC 3D** (`aura-fc-3d`) | Sports | Playable | `apps/showcase-aura-fc-3d` | `luma-band` (8: `crop:flood-bank`), `screens-fresh`, `skin` (10 info) | Disabled `HYBRID_SHADOW_EXTENT` `fit`; out-of-frustum `flood-bank` crop; flat hex night sky; goal card stacks over ticker; dead font stub | `shadow.fit`+`softness`, `sky.gradient`, default-on LUT, `crop:flood-bank` fix, `HUD_THEMES["sports-broadcast"]` |
| 05 | **Aura Links 3D** (`aura-links-3d`) | Sports | Playable | `apps/showcase-aura-links-3d` | `screens-fresh`, `skin` (6 info) | Dark `golfer-shadow` blob under real shadow; unreadable transparent 3-click swing bar over grass; illegible `ROUND COMPLETE` text; no `viewport-fit=cover` | `shadow.softness`+`fit`, hide legacy blob, `createGradingLut`, `createHumanoidAnimator`, frosted swing capsule |
| 06 | **Apex Overdrive** (`roadster-rush`) | Racing | Playable | `apps/showcase-roadster-rush` | `screens-fresh` | Pixelated wet-asphalt sun glare; flat floating salmon brake bar; blank tan billboard; tight 390px top card | Specular AA asphalt fix, `shadow.fit`+`softness`, 5.7.1 clearcoat PBR, `effects.flipbook`, `HUD_THEMES["motorsport"]` |
| 07 | **Thermal Drift** (`heatsink`) | Racing | Playable | `apps/showcase-heatsink` | `screens-fresh` | Muddy drone PBR & weak thruster glow; blank cyan billboard; 1280px quickbar clips `RESTART`; 390px `BOOST PAD` collides with `TIME`/`HULL` | Stylized `sky.gradient`, `shadow.fit`+`softness`, 5.7.1 drone clearcoat+emissive, `HUD_THEMES["sci-fi-telemetry"]` |
| 08 | **Grid Dispatch** (`teleoperator`) | Racing | Playable | `apps/showcase-teleoperator` | `screens-fresh`, `skin` (5 info) | Mid-road shadow cascade seam; blotchy pod roof glass; 390px stacked HUD eats 34% height & clips `L5` badge + `no rati..` | `shadow.fit`+`softness: 1.4`, `createGradingLut`, `createFlipbookAtlas("ripple")`, `createHumanoidAnimator`, collapsible 390px fare pill |
| 09 | **Craterline GP** (`strange-orbit-port`) | Racing | **REPLAY-VERIFIED** | `apps/showcase-strange-orbit-port`, `examples/strange-orbit-port` | `page-parity`, `screens-fresh`, `skin` (3 info) | Floating `cgHabitat` on title; flat cyan exhaust wedges; 390px `.gouache-hud` floats at `top: 236px` covering sky/horizon | Ground habitat, `shadow.softness`, `createGradingLut`, `createHumanoidAnimator`, `effects.flipbook`, dock 390px HUD bottom, `page-parity` sync |
| 10 | **Gridlock Courier** (`drift-and-deliver-port`) | Racing | **REPLAY-VERIFIED** | `apps/showcase-drift-and-deliver-port`, `examples/drift-and-deliver-port` | `page-parity`, `screens-fresh`, `skin` (4 info) | Dark diagonal road shadow-acne streaks; solid black building windows; heavy blurred title; `TICKET 01` blocks vanishing point; mid-road mobile credit | Fix `shiftShadow` bias+`softness`+`fit`, `createGradingLut`, reflective windows, `createHumanoidAnimator`, `page-parity` sync |
| 11 | **Ion Circuit** (`heatsink-port`) | Racing | **REPLAY-VERIFIED** | `apps/showcase-heatsink-port`, `examples/heatsink-port` | `page-parity`, `screens-fresh` | Pitch-black track arch; flat canyon peaks; `#district` line slices through top HUD; 390px shows desktop `[CLICK/F/J]` | Lit alloy arches, `shadow.softness`+`fit`, 5.7.1 drone clearcoat, `HUD_THEMES["sci-fi-telemetry"]`, touch prompt, `page-parity` sync |
| 12 | **Lamplight Line** (`last-train-port`) | Racing | **REPLAY-VERIFIED** | `apps/showcase-last-train-port`, `examples/last-train-port` | `page-parity`, `screens-fresh`, `skin` (9 info) | Jagged black artifacts on `llTram` glass; flat Band A shadows; 390px `#lean` shrinks to 48px (unreadable); route truncates | Clean `studioGlass` + clearcoat enamel, `shadow.softness`+`fit`, `agx`+LUT, `createHumanoidAnimator`, 112px mobile `#lean`, `page-parity` sync |
| 13 | **Saltwind Highway** (`roadster-hours-port`) | Racing | **REPLAY-VERIFIED** | `apps/showcase-roadster-hours-port`, `examples/roadster-hours-port` | `page-parity`, `screens-fresh`, `skin` (1 info) | Matte chalky roadster & blotchy red semi; crest reflection seam; title credit overlapped by legal pill; stark white mobile Pause/Sound | 5.7.1 automotive lacquer PBR, `shadow.fit`, `createHumanoidAnimator` (parent-local `swDriver`), smoked-glass mobile buttons, `page-parity` sync |
| 14 | **Iron Crown** (`iron-crown`) | Action | Playable | `apps/showcase-iron-crown` | `screens-fresh`, `skin` (12 info) | `.ic-setup` slices clock/health on title; harsh white square `cr-crowd-lights`; cotton-ball hit sparks; opaque orange brazier cones | `shadow.fit`+`softness`, warm bokeh crowd, R23 rim lift, `createHumanoidAnimator`, `HUD_THEMES["fighting"]` + `hud-tokens.css` |
| 15 | **Bunker Zero** (`bunker-zero`) | Action | Playable | `apps/showcase-bunker-zero` | `screens-fresh`, `skin` (5 info) | Black-void title screen; flat beige concrete; invisible red enemy visors (5.7.0 parent-local scale mismatch); off-bore muzzle starburst; duplicate `"AMMO"` feed | Fix parent-local `visor`/`gun`/`pack`/`hound` scale, light-pool contrast + `shadow.softness`, bore-aligned `createFlipbookAtlas("muzzle")`, dynamic reticle |
| 16 | **Slingshot Siege** (`slingshot-siege`) | Action | Playable | `apps/showcase-slingshot-siege` | `borrowed-asset` (35), `screens-fresh` | 35 borrowed `siege*` keys; dull grey sky; disabled tilt-shift `dof.maxBlur: 0`; commented `ISLAND_SHADOW_FIT`; 390px `.ss-coach` overlaps `.ss-level-tag`; dead CSS | Re-key 35 assets, fix sky + restore tilt-shift DOF, enable `ISLAND_SHADOW_FIT`+`softness`, `createGradingLut`, fix 390px overlap & `quickbar.css` |
| 17 | **Shadowstep Gauntlet** (`ninja-runner-port`) | Action | **REPLAY-VERIFIED** | `apps/showcase-ninja-runner-port`, `examples/ninja-runner-port` | `brand-identifiers` (1), `page-parity`, `screens-fresh`, `skin` (8 info) | `"proc-sakuraMapleTree"` triggers `"Kurama"` check; 644-line duplicated `<style>` HTML; ink outline OFF; solid blue clones occlude hero; mid-lane credit bar | Rename identifier, deduplicate HTML (`page-parity`), depth-threshold ink + spectral clones, `shadow.fit`+`softness`, `HUD_THEMES["ink-scroll"]` |
| 18 | **Pip's Big Leap** (`pips-big-leap`) | Platformer | Playable | `apps/showcase-pips-big-leap` | `borrowed-asset` (6), `screens-fresh`, `skin` (4 info) | 6 borrowed `showcase*` keys; disabled `shadowSoftness`; flat grey drop-shadow disc; dark HUD clashes with storybook world; mobile quickbar clips | Re-key 6 assets, re-enable `shadow.softness`+`fit`, `HUD_THEMES["storybook"]`, `createGradingLut`, `effects.flipbook`, `readAutoplayFlag` |
| 19 | **Cross Hop** (`cross-hop`) | Platformer | Playable | `apps/showcase-cross-hop` | `luma-band` (2: `spread=117`), `screens-fresh` | Compressed luma (`spread 117–119 < 140`); faint shadows; critter blends into traffic; no `hud-tokens.css`; 390px quickbar clips | Lower fill + `shadow.softness`+`fit` + `neutralCurve: "khronos"` (`spread >= 145`), critter rim, `hud-tokens.css`, `createSnapshotInterpolator` |
| 20 | **Splat** (`splat-rush-port`) | Platformer | **REPLAY-VERIFIED** | `apps/showcase-splat-rush-port`, `examples/splat-rush-port` | `page-parity`, `screens-fresh`, `skin` (1 info) | `<style>` parity drift; faint ball/gate shadows; heavy title card; inline `readQaParams` autoplay | `shadow.softness`+`fit`, 5.7.1 clearcoat ball, `sky.gradient` haze/dither, `effects.flipbook`, `readAutoplayFlag`+`createAutoplayHarness`, `page-parity` sync |
| 21 | **Serpentine Sky Run** (`serpentine-sky-run-port`) | Platformer | **REPLAY-VERIFIED** | `apps/showcase-serpentine-sky-run-port`, `examples/saiyan-snake-way-port` | `page-parity`, `screens-fresh`, `skin` (3 info) | `<style>` parity drift; detached shadows on inverted rolls; weak hero rim against bright clouds; centered title blocks ribbon | Runner-following `shadow.fit`+`softness`, stage-contrasting rim, `HUD_THEMES["sky-expedition"]`, `createSnapshotInterpolator`, `page-parity` sync |
| 22 | **Cumulus Dash** (`cloud-runner-port`) | Platformer | **REPLAY-VERIFIED** | `apps/showcase-cloud-runner-port`, `examples/kid-goku-beyond-the-clouds-port` | `page-parity`, `screens-fresh`, `skin` (2 info) | `<style>`+`<body>` parity drift; missing LUT & flipbook wiring; hard/uneven canyon shadows; heavy title modal | `shadow.softness`+`fit`, `createGradingLut("cinema-warm")`, `effects.flipbook`, `HUD_THEMES["sky-expedition"]`, `page-parity` sync |
| 23 | **Shape Shift Sprint** (`shape-shift-sprint`) | Platformer | Playable | `apps/showcase-shape-shift-sprint`, `examples/shared/runner-kit` | `luma-band` (missing), `screens-fresh` | Missing `luma-bands.json`/`luma-after.json`; stuck `#load-bar`; flat candy walls without bevel glow/soft shadows; no next-morph preview | `shadow.softness`+`fit`, 5.7.1 clearcoat, `createGradingLut`+`neutralCurve`, cutout glow + morph hologram, `luma-bands.json`, hide `#load-bar` |
| 24 | **Number Surge** (`number-surge`) | Platformer | Playable | `apps/showcase-number-surge`, `examples/shared/runner-kit` | `luma-band` (missing), `screens-fresh`, `skin` (1 info) | Missing `luma-bands.json`/`luma-after.json`; stuck `#load-bar`; flat dusk floor; color-only `+`/`−` gates; no boss distance gauge | `shadow.softness`+`fit`, wet-lane reflection, dual-coded gate arches, `createHumanoidAnimator`, Boss Distance pill, `luma-bands.json` |
| 25 | **Beat Hopper** (`beat-hopper`) | Platformer | Playable | `apps/showcase-beat-hopper`, `examples/shared/runner-kit` | `luma-band` (missing), `screens-fresh`, `skin` (1 info) | Missing `luma-bands.json`/`luma-after.json`; stuck `#load-bar`; weak crate landing shadows; Jump vs Duck color overlap; no muted beat rail | `shadow.softness`+`fit`, `#ff3b5c` Duck vs `#00f2ff` Jump coding, silent 132 BPM beat rail, `createHumanoidAnimator`, `luma-bands.json` |
| 26 | **Glint Courier** (`dot-dash-3d`) | Arcade | Playable | `apps/showcase-dot-dash-3d` | `screens-fresh` | Over-bloomed glow discs blur visor; frightened blue clashes with blue walls; 390px quickbar clips `Relay`; stale `REV 5.5` badge | `neutralCurve: "khronos"`, tightened glow discs, indigo-violet frightened ring, `effects.flipbook`, `readAutoplayFlag`, compact 390px bar |
| 27 | **The Bellkeeper's Walk** (`where-the-wind-wanders-port`) | Arcade | **REPLAY-VERIFIED** | `apps/showcase-where-the-wind-wanders-port`, `examples/where-the-wind-wanders-port` | `page-parity`, `screens-fresh`, `skin` (1 info) | Title card slices hero; flat proc trees vs Idol cottages; M18 top-level keeper workaround; duplicate caption+toast; 390px toast under credit | 5.7.0 parent-local `hero-idol` rig, `shadow.softness: 2.2`, painterly tree brushwork, deduplicate toast/caption, `page-parity` sync |
| 28 | **Duneglide** (`silt-and-signal-port`) | Arcade | **REPLAY-VERIFIED** | `apps/showcase-silt-and-signal-port`, `examples/silt-and-signal-port` | `page-parity`, `screens-fresh`, `skin` (1 info) | White arch pillar occludes left 1/3 of camera; 390px `#toast` overlaps `#silt-horizon-tape`; `".."` objective; truncated chapter buttons; sky zenith seam | Extend pier occlusion fade, smooth sky band, `shadow.softness`, `createHumanoidAnimator`, fix `#toast` & chapter grid, `page-parity` sync |
| 29 | **Splat Turf** (`splat-turf`) | Arcade | Playable | `apps/showcase-splat-turf`, `examples/shared/runner-kit` | `luma-band` (missing), `screens-fresh`, `skin` (2 info) | Missing `luma-bands.json`; stuck `#load-bar`; 420px stretched empty Score card; faint flat solvent strips; snowball particles; balloon clips right edge | `shadow.softness: 2.0`, parent-local driver rigs, lane-guided `wetInkRibbonSpec`, wet droplet flipbooks, fix `.score-chip` & 390px stack, `luma-bands.json` |
| 30 | **Polarity Orbs** (`polarity-orbs`) | Arcade | Playable | `apps/showcase-polarity-orbs`, `examples/shared/runner-kit` | `luma-band` (missing), `screens-fresh` | Missing `luma-bands.json`; incoming orbs lack `+`/`−` shape/ring coding; moiré stripes on flux arches; Flip stacked over Pause/Mute on 390px; `direction.ts` asset drift | Dual-coded orb silhouettes + contact shadows, smooth arch shader, `shadow.softness`, `effects.flipbook`, separate Flip/Mute on 390px, `luma-bands.json` |

---

## 3. Cross-Cutting Design, Visual & Technical Contracts

### 3.1 Aura3D `5.7.2` Rendering & Asset Contract
1. **Direct Public Imports Only:** Every game imports `createImpactRig`, `createProceduralSfx`, `ScreenFx`, `drainPopups`, `GameRng`, `createFlipbookAtlas`, `createGradingLut`, `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator` directly from `@aura3d/engine/game`, and `createHumanoidAnimator`, `humanoidLocomotionTime`, `humanoidEventTime`, `layerHumanoidPose`, `ARM_ROLES` from `@aura3d/engine/animation`. No new imports from `apps/showcase-port-shared/{feel,vfx-pack,idol}`.
2. **Shadow Quality Standard:** Every game with a directional sun/key light passes explicit `shadow.softness` (`0.4–0.6` hard lunar/airless; `1.4–2.2` sunlit/stadium/dusk) and an arena- or player-following `shadow.fit: { center, extent, depth }` verified on real-GPU captures so shadows never swim on camera zoom or viewport resize.
3. **5.7.1 Glossy PBR & Clearcoat Standard:** Every vehicle, glossy ball, painted chassis, and hero prop is audited with `npx @aura3d/cli assets inspect <file.glb> --pbr` (targeting zero `PBR_PAINT_METALLIC`, `PBR_NORMAL_LOSSY_GLOSSY`, `PBR_NORMAL_NOISY`, `PBR_SINGLE_MATERIAL_VEHICLE` warnings). Painted bodies use dielectric base (`metalness: 0`, `clearcoat: 1.0`, `clearcoatRoughness: 0.05–0.08`) with lossless PNG normals (`normalScale <= 0.3`).
4. **R23 Silhouette Value Separation & G9 Copy Honesty:** Every playable hero/vehicle/fighter separates from the background by value (rim/back light or contrasting accent) in back-view gameplay frames at `1280x720` and `390x844`. HUD copy naming colors or landmarks matches the post-grade rendered pixels.
5. **5.7.0 Live Flipbooks & Zero-Asset LUTs:** Replace canvas-data-URL flipbook workarounds and manual UV-quad swaps with `effects.flipbook({ texture: atlas.texture, spriteColumns: 8, spriteRows: 4 })`. Prefer `createGradingLut("cinema-warm" | "broadcast-crisp" | "cyber-neon", 16)` over unreferenced `.cube` URLs.
6. **Runner-Kit Shared Upgrade (`examples/shared/runner-kit/sky.ts`):** Extend `gradientSkyOptions(stops, opts?)` to accept optional `haze`, `sun`, and `dither: true` so all 5 runner-kit games inherit stylized 5.7.0 atmospheric depth with zero code duplication.

### 3.2 Unified UI/UX, Licensed Typography & Mobile (`390x844`) Contract
1. **Licensed Self-Hosted Fonts Only (`U3`):** All HUDs import `apps/showcase-port-shared/hud-tokens.css` (Whitney, DIN Pro, Monument Grotesk Mono) and/or adopt the matching preset from `packages/game/src/hud/themes.ts` (`HUD_THEMES`: `sports-broadcast`, `motorsport`, `sci-fi-telemetry`, `fighting`, `storybook`, `ink-scroll`, `sky-expedition`, `arcade-neon`, `tabletop`). Zero Google Fonts, bare system stacks, or unapproved faces; `font-synthesis: none`; `font-variant-numeric: tabular-nums` on every score, timer, speed, and count.
2. **Viewport & Safe Areas (`U1`, `U2`, `U4`, `U5`):**
   - Every app `index.html` includes `viewport-fit=cover` in `<meta name="viewport">`.
   - Top mode/venue bar uses `apps/showcase-port-shared/quickbar.css` (single non-wrapping row); on `< 640px`, multi-item venue/world/circuit lists collapse into a compact picker pill so zero buttons clip mid-word.
   - Mobile (`390x844`) top HUD height is capped at `<= 14%` of viewport height (`<= 118px` including quickbar + safe area); bottom interactive touch targets are `>= 44px` (`>= 48–56px` for primary fire/jump/swing/flip), anchored above `env(safe-area-inset-bottom)` with zero overlap against the `"Built with Aura3D"` credit link (`tests/browser/credit-placement.spec.ts`).
   - Title screens frame the live 3D world unobstructed (left/lower-left card on desktop, compact bottom sheet on `390x844`), hide `#load-bar` upon `loading.done()`, and suppress keyboard-only legends (`WASD`, `[CLICK / F / J]`, `(ENTER)`) on narrow/coarse viewports.
3. **Accessibility & Reduced Motion:** Every game honors `prefers-reduced-motion: reduce` (zeroing camera shake/FOV kicks via `createImpactRig({ reducedMotion })`, capping flashes via `flashStrength`, calming pulsing rings) and dual-codes gameplay-critical states with shape/iconography in addition to hue (e.g., Polarity Orbs `+`/`−`, Number Surge `+`/`×` vs `−`/`÷`, Beat Hopper Jump vs Duck).

### 3.3 Static Hygiene, `look-identity` & `luma-band` Contract
- **Port Page Parity (`page-parity`, 12 warnings):** Fix `apps/showcase-top-tennis/index.html` vs `examples/aura-slam/index.html` and synchronize all 11 `*-port` app pages from their `examples/*-port/index.html` sources via `node tools/showcase-port-pages/sync.mjs`.
- **Borrowed Assets (`borrowed-asset`, 41 warnings):** Re-key all 35 `siege*` keys in `apps/showcase-slingshot-siege` to `ss*` and all 6 `showcase*` keys in `apps/showcase-pips-big-leap` to `pip*` across `aura.assets.json`, route manifests, code, `art/direction.ts`, and `route-health.json`.
- **Brand Identifier (`brand-identifiers`, 1 warning):** Rename `"proc-sakuraMapleTree"` to `"proc-blossomMapleTree"` in `examples/ninja-runner-port/art/proceduralModels.ts:1705`.
- **Luma Bands (`luma-band`, 17 warnings):** Publish `crop:lamp` (`aura-hoops-3d`) and `crop:flood-bank` (`aura-fc-3d`) in frustum; widen tonal spread `>= 145` in `cross-hop`; author `luma-bands.json` and commit steady-state `luma-after.json` for `shape-shift-sprint`, `number-surge`, `splat-turf`, `polarity-orbs`, and `beat-hopper`.
- **Skin Check Runner (`skin`, 1 global warning):** Fix `tools/game-checks/lib/index.mjs:458` / `tools/game-checks/skin-runner.mts` argument/buffer handling so `checkSkin` executes cleanly across all rigged GLBs without failing invocation.
- **Art-Direction Audits:** After any edit to `art/direction.ts`, re-run the game's `art-direction.test.ts` to regenerate `direction.audit.json` and keep `look-identity` 100% collision-free across all 30 games.

---

## 4. Per-Game 10/10 Enhancement Blueprints (All 30 Live Games)

### 4.1 Sports Cluster (5 Games)

#### 01. Aura Slam 3D (`top-tennis`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-top-tennis/index.html`, `examples/aura-slam/index.html`, `examples/aura-slam/view/{lighting.ts,look.ts,scene.ts,vfx.ts,idolMotion.ts,renderer.ts}`, `examples/aura-slam/ui/{hud.ts,styles.css}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-06-clay.jpg`, `1280-07-results.jpg`, `390-03-action.jpg`):* `SUN_SHADOW_FIT` (`lighting.ts:48,63`) is disabled, causing fuzzy/double baseline shadows; NY Hard night court has flat slate sheen and weak far-player rim separation against navy walls; title screen dims the court behind one giant neon-lime card; quickbar clips `Beach`/`Moon` on 1280px and `Lon...` on 390px; `390x844` renders black top/bottom letterbox bands around the canvas; `page-parity` warning (`alt="Aura3D logo"` vs `alt=""`); no `createFlipbookAtlas` or `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-venue tour identity (`cobblestone_street_night`, `kloppenheim_02`, `venice_sunset`, `outdoor-midday`, `sunset-dramatic`, `starmap_2020_4k`; persistent surface ball marks + head-tracking crowd).
  - Enable `fit: SUN_SHADOW_FIT` (`extent: 22, depth: 64`) and `softness: look.id === "moon" ? 0.5 : 1.8` in `keyShadow()` (`lighting.ts:57-66`).
  - Add analytic `sky.gradient` (`captureEnvironment: false, affectsFog: true`) for `hard` (deep night indigo to stadium horizon glow), `clay`, and `beach`; add a venue-matched back-rim directional (`intensity: 0.45`) for R23 athlete separation.
  - Evaluate `output: { toneMapping: "neutral", neutralCurve: "khronos" }` on `grass`/`desert`; replace bespoke particle quads in `vfx.ts` with `createFlipbookAtlas("dust" | "sparks", tint)` + `effects.flipbook({ texture })`; migrate `idolMotion.ts` to `createHumanoidAnimator` (`@aura3d/engine/animation`) and `renderer.ts` to `@aura3d/engine/game` `createImpactRig`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-top-tennis/index.html` and `examples/aura-slam/index.html` to clear `page-parity`.
  - Adopt `hud-tokens.css` + `HUD_THEMES["sports-broadcast"]` (`Whitney`, `DIN Pro` tabular `0/15/30/40/AD` & `KM/H`); remove duplicate `@font-face` rules in `ui/styles.css`.
  - Replace giant lime title card with a left-docked Grand Slam broadcast panel (60%+ live court visible); collapse venues >4 into a compact venue picker on `<640px`; fold serve speed into a transient 1.8 s radar pill attached to the 2-row scorebug.
  - Make `390x844` canvas full-bleed `100dvh` (zero black letterbox bars) with `>= 48px` `HIT` / `POWER HIT` / `LOB` buttons clear of `env(safe-area-inset-bottom)`.
- **Game Design & Feel Polish:**
  - Color-code `landing-indicator-ring` by shot quality (lime sweet-spot, amber smashable lob, cyan drop); add `createSnapshotInterpolator` + `createAutoplayHarness`; add 25–45 ms `createImpactRig` hit-stop + 1.5° FOV punch on aces/winners and surface-specific bounce SFX + rally crowd swells.
- **Exact File Targets:** `apps/showcase-top-tennis/index.html`, `examples/aura-slam/index.html`, `examples/aura-slam/view/{lighting.ts,look.ts,scene.ts,vfx.ts,idolMotion.ts,renderer.ts}`, `examples/aura-slam/ui/{hud.ts,styles.css}`.

#### 02. Aura Hoops 3D (`aura-hoops-3d`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-aura-hoops-3d/index.html`, `apps/showcase-aura-hoops-3d/src/{courtRigs.ts,main.ts,idolBodies.ts,dribble.ts,fxPack.ts,broadcast.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-04-venice.jpg`, `390-03-action.jpg`):* 2 `luma-band` warnings (`crop:lamp` above camera top frustum in `main.ts:3783-3788`); `RUCKER_HAZE = false` and no `shadow.fit` flatten Rucker blue-hour contrast; in-world LED scoreboard has oversized blocky numerals with empty brown space; `1280-01-title.jpg` `Modes & Tour` modal overlaps fixed `.aura3d-controls-hint`; `390-03-action.jpg` truncates `RUCKER PARK · H..` and quickbar clips `MODES & TOU`; missing `viewport-fit=cover` in `index.html:5`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-court streetball identity (Rucker blue-hour sodium through Orbit Dome, spray-tag decals, `createHandBounce` dribble).
  - Add `fit: { center: [0, 0, 4], extent: 18, depth: 48 }` and `softness: 1.6` to `COURT_KEY_SHADOW` (`courtRigs.ts:426`).
  - Re-enable per-court stylized `sky.gradient` in `COURT_RIGS` (`courtRigs.ts:143,572-580`, disposing old sky on court swap) + bounded `effects.lightCone` (`intensity: 0.14`) under Rucker sodium fixtures; switch `createGradingLut` (`@aura3d/engine/game`) per court (`"cinema-warm"` Rucker/Venice/Manila, `"cyber-neon"` Shanghai/Orbit, `"broadcast-crisp"` Athens) and test `neutralCurve: "khronos"` on Athens noon.
  - Fix `luma-band` by adding/lowering in-frame sodium stanchion luminaire heads (`y = 6.2 m`) included in `publishQaCrops()` (`main.ts:3782-3788`) and re-capturing `evidence/game-upgrades-47/aura-hoops-3d/luma-after.json`.
  - Migrate `idolBodies.ts` to `createHumanoidAnimator` (`@aura3d/engine/animation`) and `main.ts` to `@aura3d/engine/game` `createFlipbookAtlas("dust" | "sparks")` + `effects.flipbook`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Add `viewport-fit=cover` to `index.html:5`; hide `.aura3d-controls-hint` whenever the menu/modes overlay is open.
  - Align scorebug & 24s shot clock (amber `<= 5s`, crimson `<= 2s`) with `HUD_THEMES["sports-broadcast"]` + `hud-tokens.css`; abbreviate mobile court subtitle (`RUCKER · NYC`); redraw in-world LED scoreboard canvas with centered `DIN Pro` numerals.
  - Upgrade shot-release meter to a curved arc beside the shooter with glowing `#ffd257` sweet-spot tick + `GREEN!` / `CONTESTED %` feedback; arrange `390x844` touch stick + `>= 48px` `SHOOT`/`PASS`/`CROSS` arc inside safe-area insets.
- **Game Design & Feel Polish:**
  - Add floor passing-lane chevrons + defensive contest ring (`green`/`amber`/`red`) beneath the ball-handler; wire `createSnapshotInterpolator` + `createAutoplayHarness`; boost `createImpactRig` hit-stop (55 ms Jam dunks, 35 ms blocks) + rim rattle SFX & crowd stings.
- **Exact File Targets:** `apps/showcase-aura-hoops-3d/index.html`, `apps/showcase-aura-hoops-3d/src/{courtRigs.ts,main.ts,idolBodies.ts,fxPack.ts,broadcast.ts}`, `evidence/game-upgrades-47/aura-hoops-3d/luma-after.json`.

#### 03. Aura Diamond 3D (`aura-diamond-3d`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-aura-diamond-3d/index.html`, `apps/showcase-aura-diamond-3d/art/look.ts`, `apps/showcase-aura-diamond-3d/src/{main.ts,scene.ts,turfTextures.ts,idol/mocap.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-batter.jpg`, `1280-04-contact.jpg`, `390-03-play.jpg`):* `KEY_SHADOW_RANGE` (`art/look.ts:553-555`) disables `fit: { center: [0, 0, -24], extent: 48, depth: 160 }` and omits `softness`; `art/look.ts` declares unused `.cube` LUT strings; `src/idol/mocap.ts` hand-rolls `PoseSmoother` instead of `createHumanoidAnimator`; `index.html:23` links dead `/fonts/aura-fonts.css`; `1280-03-batter.jpg` shows two confusing floating white rings above the strike zone; `390-03-play.jpg` `CURVE · 75 MPH` / `BALL` pills collide directly over the top-left inning line score, and 5 stacked play-by-play toasts cover the batter.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-ballpark identity (Harbor Sandlot through 1/6-gravity Lunar Park, `createTwoHandGrip` bat calibration).
  - Enable `fit: { center: [0, 0, -24], extent: 48, depth: 160 }` and `softness: 1.6` (`0.6` on `lunar`) in `KEY_SHADOW_RANGE` (`art/look.ts:555`).
  - Standardize `toneMapping: "agx"` across parks (or `neutral` + `neutralCurve: "khronos"` on sunlit Ivy/Canyon) and bind `createGradingLut("cinema-warm" | "broadcast-crisp" | "cyber-neon", 16)` in `src/main.ts:432,469`.
  - Boost infield clay micro-normal & chalk contrast in `src/turfTextures.ts`; add stadium rim (`intensity: 0.55`) to separate batter/catcher from clay; replace canvas data-URL flipbooks (`turfTextures.ts:200-201`) with `createFlipbookAtlas("dust" | "sparks").texture` in `effects.flipbook`; migrate `src/idol/mocap.ts` to `createHumanoidAnimator` + `layerHumanoidPose(..., ARM_ROLES)`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Remove dead `/fonts/aura-fonts.css` (`index.html:23`), import `hud-tokens.css` directly, and align scorebug with `HUD_THEMES["sports-broadcast"]`.
  - Fix `390x844` collision by docking `CURVE · 75 MPH` / `BALL` cleanly below the compact line score and capping mobile play-by-play to 2 fading lines (hidden during live pitch).
  - Replace dual white rings with a crisp hairline 3×3 strike zone, amber `#ffb03a` bat-barrel PCI pill, and a single shrinking pitch-arrival halo; move Statcast contact card (`EXIT VELO / LAUNCH / DIST`) to bottom-right off home plate; keep bottom-left `PCI ZONE` (`124x124px`) and bottom-right `SWING` (`>= 64px`) safe-area padded.
- **Game Design & Feel Polish:**
  - Distinct release-point shimmer + catcher target flash per pitch type (4-seam, Curve, Slider, Changeup); add `createSnapshotInterpolator` (crucial for 120 Hz 98 MPH pitch readability) + `createAutoplayHarness`; 45 ms `createImpactRig` hit-stop + translucent gold Statcast launch ribbon & no-doubter HR camera hold on squared-up barrels.
- **Exact File Targets:** `apps/showcase-aura-diamond-3d/index.html`, `apps/showcase-aura-diamond-3d/art/look.ts`, `apps/showcase-aura-diamond-3d/src/{main.ts,scene.ts,turfTextures.ts,idol/mocap.ts}`.

#### 04. Aura FC 3D (`aura-fc-3d`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-aura-fc-3d/index.html`, `apps/showcase-aura-fc-3d/src/main.ts`, `apps/showcase-aura-fc-3d/src/game/{scene.ts,look.ts,qaCrops.ts,idolBodies.ts,hud.ts,touch.ts,vfx.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-04-goal.jpg`, `390-03-action.jpg`):* 8 `luma-band` warnings (`crop:flood-bank` above top frustum in `qaCrops.ts:57-69` across `favela`, `glacier`, `kyoto`, `munich`); `HYBRID_SHADOW_EXTENT = 34` (`scene.ts:245,254`) not passed as `shadow.fit`, leaving smudged boot shadows; flat solid hex night skies (`HYBRID_LAYERS` `#0a1422`); `VENUE_LUT_ASSETS` gated off by default (`scene.ts:210,237`); `1280-04-goal.jpg` `GOAL` lower-third stacks over raw ticker rows (`BOUNCE - LOOSE BALL`); dead `registerFcHudFonts` stub (`hud.ts:60-70`); `390-03-action.jpg` quickbar clips `De...` and top scorebug + minimap crowd the pitch.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-pitch identity (Favela Cage to aurora-lit Glacier Arena, Magnus spin physics, slanting Munich rain & wet-turf streaks).
  - Pass `fit: { center: [0, 0, 0], extent: HYBRID_SHADOW_EXTENT, depth: 96 }` and `softness: 1.5` in `hybridLookOverrides()` (`scene.ts:245`).
  - Replace flat hex night backgrounds in `HYBRID_LAYERS` (`look.ts:271-331`) with stylized `sky.gradient` (Munich storm-navy, Kyoto plum-indigo, Glacier aurora-teal); boost wet-turf specular contrast (`turfRoughness: 0.32`, mowed-stripe delta) + back-lit rain crossing `effects.lightCone` shafts; enable per-venue `createGradingLut` by default (and test `neutralCurve: "khronos"` on `uyuni`).
  - Fix all 8 `luma-band` warnings by adding/lowering visible stadium fascia floodlight strips inside the top 15% of the broadcast frame and publishing them in `fcQaCrops()` (`qaCrops.ts:57-69`), then re-capturing `evidence/game-upgrades-47/aura-fc-3d/luma-after.json`.
  - Migrate `idolBodies.ts` to `createHumanoidAnimator` + `humanoidLocomotionTime` (`@aura3d/engine/animation`) and `scene.ts`/`vfx.ts` to `@aura3d/engine/game` `createFlipbookAtlas` + `effects.flipbook`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Adopt `hud-tokens.css` + `HUD_THEMES["sports-broadcast"]`; delete dead `registerFcHudFonts` (`hud.ts:60-70`).
  - Merge `POSSESSION` into a sleek sub-bar under `.fc-bug`; suppress `.fc-ticker` whenever `.fc-goal-l3` is visible; replace technical strings (`BOUNCE - LOOSE BALL`) with concise broadcast calls; move shot-charge & stamina to a diegetic ring beneath the controlled player's feet.
  - On `390x844`, shrink/collapse radar (`112x62px`), keep quickbar cleanly fitted so `Demo` never clips, and space `>= 48px` touch joystick + `SHOOT`/`PASS`/`SKILL`/`SPRINT` buttons above `env(safe-area-inset-bottom)`.
- **Game Design & Feel Polish:**
  - Add turf pass-target chevron under aimed teammate + clear off-ball defender switch icon; wire `createSnapshotInterpolator` + `createAutoplayHarness`; trigger 30–50 ms `createImpactRig` hit-stop + spin-tinted shot ribbon + 3 s behind-net goal replay angle with `• REPLAY` stinger.
- **Exact File Targets:** `apps/showcase-aura-fc-3d/index.html`, `apps/showcase-aura-fc-3d/src/main.ts`, `apps/showcase-aura-fc-3d/src/game/{scene.ts,look.ts,qaCrops.ts,idolBodies.ts,hud.ts,touch.ts,vfx.ts}`, `evidence/game-upgrades-47/aura-fc-3d/luma-after.json`.

#### 05. Aura Links 3D (`aura-links-3d`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-aura-links-3d/index.html`, `apps/showcase-aura-links-3d/src/main.ts`, `apps/showcase-aura-links-3d/src/game/{lighting.ts,lookRig.ts,rig.ts,idolHumanoid.ts,vfx.ts,holeCard.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-swing.jpg`, `1280-05-green.jpg`, `1280-08-results.jpg`, `390-03-swing.jpg`):* Dark circular `golfer-shadow` blob (`rig.ts:177,502`) sits stark underneath the real cast shadow (`1280-05-green.jpg`); global `__A3D_SHADOW_FIT__ = "current"` hack (`main.ts:295`) with no explicit `softness`; no `createGradingLut` or `sky.gradient`; 3-click swing bar floats directly over green grass with no dark glass backing (nearly unreadable green-on-green); `1280-08-results.jpg` bare white `ROUND COMPLETE` text is illegible over the bright stone clubhouse; `390-03-swing.jpg` clips `COURS...` in quickbar, lacks `viewport-fit=cover`, and stacks 18% top telemetry; uses local `idolHumanoid.ts` instead of `createHumanoidAnimator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-course championship identity (St. Auroras Links to Lunar Mare, 3-shot broadcast camera grammar, wind/spin flight sim).
  - Add explicit `softness: 1.5` (`0.4` on `mareCourse`) in `keyShadowFor()` (`lighting.ts:371-385`) and per-shot `shadow.fit` centered on the active tee/green lie (`extent: 28, depth: 80`); hide `golfer-shadow` disc (`rig.ts:177,502`) whenever real shadows are active.
  - Layer stylized `sky.gradient` (`captureEnvironment: false, affectsFog: true`) on flat-horizon courses (`stAuroras` sea-haar, `neonBay` indigo night, `cloudTerrace` alpine) in `lookRig.ts`; bind per-course `createGradingLut` (`"broadcast-crisp"` / `"cinema-warm"` / `"cyber-neon"`) in `main.ts:3361` and evaluate `neutralCurve: "khronos"` on sunlit courses.
  - Migrate `idolHumanoid.ts` + `rig.ts` to `createHumanoidAnimator` + `layerHumanoidPose(..., ARM_ROLES)` (`@aura3d/engine/animation`) and move `createImpactRig`/`createFlipbookAtlas` (`main.ts:53-54`) to `@aura3d/engine/game`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Add `viewport-fit=cover` to `index.html:5`; import `hud-tokens.css` directly + adopt `HUD_THEMES["sports-broadcast"]` (`Whitney`, `DIN Pro` tabular yards/wind/score-to-par); hide `.aura3d-controls-hint` when title/modes modal is open.
  - Wrap the 3-click swing bar in a frosted dark-emerald glass capsule (`rgba(8,16,12,0.86)`) with explicit `POWER`/`SNAP` zone brackets, glowing `#ffd257` sweet-spot tick, and `1. START -> 2. POWER -> 3. ACCURACY` cue.
  - Replace bare `ROUND COMPLETE` overlay with a Masters-grade frosted results card featuring color-coded 9-hole par/score symbols (eagle/birdie/par/bogey), Fairways/GIR/Putts stats, and `PLAY NEXT COURSE` CTA.
  - On `390x844`, collapse top telemetry into one sleek horizontal bug (`H1 PAR 4 | E | 245M | 5.5 ↘ | DR`), fold courses into a `Course ▾` quickbar pill, and isolate a large bottom `TAP TO SWING` zone (`>= 54px` tall, safe-area padded).
- **Game Design & Feel Polish:**
  - Add animated slope-speed bead dots on putting greens + wind-drift landing ellipse on the aim ribbon + TV Pro-Tracer flight ribbon with post-shot Carry/Apex/Pin pill; wire `createSnapshotInterpolator` + `createAutoplayHarness`; add 20 ms pure-strike `createImpactRig` micro-punch + divot flipbook & cup-rattle audio.
- **Exact File Targets:** `apps/showcase-aura-links-3d/index.html`, `apps/showcase-aura-links-3d/src/main.ts`, `apps/showcase-aura-links-3d/src/game/{lighting.ts,lookRig.ts,rig.ts,idolHumanoid.ts,vfx.ts,holeCard.ts}`.

### 4.2 Racing & Driving Cluster (8 Games)

#### 06. Apex Overdrive (`roadster-rush`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-roadster-rush/index.html`, `apps/showcase-roadster-rush/src/{main.ts,art/look.ts,art/surfaces.ts,art/paint.ts,art/vfx.ts,art/proceduralModels.ts,render/dressing.ts,native/hud.ts,native/hud.css,native/presentation.ts,native/autopilot.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-traffic.jpg`, `390-03-traffic.jpg`):* Low tangerine sun creates pixelated specular glare speckles on wet asphalt ahead-right of the hero; rear brake bar renders as a flat salmon quad with straight red streaks; left overhead gantry billboard is a blank tan rectangle; `shadow.fit` unset; `390x844` top-left `rr-score-card` eats ~32% of upper-left lane view with tight ~6 px gap to Pause/Sound; uses `showcase-port-shared` shims and inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`).
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve Blue-Hour Backlit Skyway identity (`industrial_sunset_puresky` HDRI, custom cloud/star sky dome `src/art/sky.ts`, city haze floor, sculpted thruster plume `src/art/plume.ts`).
  - Fix asphalt glare in `src/art/surfaces.ts` (`asphaltMaterial`, `asphaltRutSpec`): clamp micro-roughness `>= 0.16` with specular AA and tune `APEX_BLOOM` (`threshold: 0.92, intensity: 0.48`).
  - Pin `shadow: { softness: 2.0, fit: { center: [0, 0, -28], extent: [26, 16], depth: 48 } }` on `APEX_KEY` (`src/main.ts`); recess hero taillight lenses (`buildHeroTaillightBarNode`) with HDR emissive bloom; populate `BILLBOARD_SLOTS` (`src/render/dressing.ts`) with crisp canvas-baked sector signage.
  - Audit `aoHeroBodyNW5.glb` and traffic GLBs via `assets inspect --pbr` for 5.7.1 clearcoat parity (`apexHeroPaint`/`apexTrafficPaint`); migrate `createFlipbookAtlas`/`createGradingLut`/`createImpactRig` directly to `@aura3d/engine/game` and drive sparks/dust via `effects.flipbook({ texture })`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Adopt `HUD_THEMES["motorsport"]` (`National 2 Narrow` + `DIN Pro`) + `quickbar.css`; anchor title card lower-left so the backlit Interceptor owns `1280-01-title.jpg`; split `390x844` mega-card into a slim top bar (`SCORE · ×MULT · BOLTS`) + bottom speed-arc / 6-rung `AIR` ladder between `>= 48px` left/right touch pads clear of safe-area insets.
- **Game Design & Feel Polish:**
  - Wire `createSnapshotInterpolator` into `createRoadsterPresenter` (`src/native/presentation.ts`) and `readAutoplayFlag` + `createAutoplayHarness` over `createFreewayAutopilot` (`src/native/autopilot.ts`); add carrier-ramp pitch dip, progressive speed-lines above 220 km/h, and 35 ms `createImpactRig` micro-hitstop on near-miss chains & sky takedowns.
- **Exact File Targets:** `apps/showcase-roadster-rush/index.html`, `apps/showcase-roadster-rush/src/{main.ts,art/look.ts,art/surfaces.ts,art/paint.ts,art/vfx.ts,art/proceduralModels.ts,render/dressing.ts,native/hud.ts,native/hud.css,native/presentation.ts,native/autopilot.ts}`.

#### 07. Thermal Drift (`heatsink`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-heatsink/index.html`, `apps/showcase-heatsink/src/{main.ts,look.ts,scene.ts,vfx.ts,heatHaze.ts,hud.ts,view.ts,motion.ts}`.
  - *Observed Flaws (`1280-03-action.jpg`, `390-03-action.jpg`):* Drones (`tdDroneOrion`) look weathered/matte with faint thruster glow; trackside right billboard in `390-03-action.jpg` is a blank cyan rectangle; `KEY_SHADOW` (`scene.ts:115`) omits `softness`/`fit`; `1280px` quickbar clips `RESTART` (`RE...`); `.controls-strip` clutters center road; **critical `390x844` collision** where `BOOST PAD` banner overlaps `TIME/BEST` and `HULL`, while bottom-right 4-bar stack clips into the center lane; no `hud-tokens.css` or `HUD_THEMES`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve Foundry Megacity identity (`kloppenheim_02` / `industrial_sunset_puresky` / `spruit_sunrise` HDRIs, molten amber/coolant cyan palette, `src/heatHaze.ts` refraction).
  - Upgrade `sky.gradient` (`scene.ts`) to 5.7.0 stylized profile (`mid`, `haze`, `sun.glow`) + `dither: true`; add `softness: 1.8` and `fit: { center: [0, 0, -20], extent: [24, 16], depth: 44 }` to `KEY_SHADOW`.
  - Audit all 7 `tdDrone*.glb` models via `assets inspect --pbr` for 5.7.1 clearcoat + HDR emissive nacelle rings (`emissiveIntensity: 3.5+`); bind procedural foundry telemetry graphics to blank billboards; migrate `createFlipbookAtlas`/`createGradingLut`/`createImpactRig` to `@aura3d/engine/game` + `effects.flipbook({ texture })`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Adopt `hud-tokens.css` + `HUD_THEMES["sci-fi-telemetry"]` accented with soot/amber/cyan; collapse 7-drone + 3-track pills into `SETUP ▾` below `1440px` so `RESTART` never clips at `1280px`; auto-hide `.controls-strip` after 5 s of input (and hide on `max-width: 760px`).
  - Fix `390x844` overlap by pushing `.banner`/`.incoming` to `top: calc(var(--a3d-bar-space) + 128px)` and condensing bottom-right telemetry into a slim 2-column `KM/H + CORE °C` cluster clear of `>= 48px` `BOOST`/`FIRE`/`AIRBRAKE` buttons.
- **Game Design & Feel Polish:**
  - Wire `createSnapshotInterpolator` (`src/view.ts`, `src/motion.ts`) and `readAutoplayFlag` + `createAutoplayHarness` (`src/main.ts`); escalate turbine whine + edge heat shimmer across 70–95% heat, add cryo-purge steam burst on `tdCoolantCell`, and add directional hit-marker arcs around `#xhair`.
- **Exact File Targets:** `apps/showcase-heatsink/index.html`, `apps/showcase-heatsink/src/{main.ts,look.ts,scene.ts,vfx.ts,heatHaze.ts,hud.ts,view.ts,motion.ts}`.

#### 08. Grid Dispatch (`teleoperator`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-teleoperator/index.html`, `apps/showcase-teleoperator/src/{main.ts,look.ts,scene.ts,vfx.ts,walkers.ts,carMotion.ts,hud.ts}`.
  - *Observed Flaws (`390-03-trip.jpg`):* Horizontal shadow-cascade seam cuts across the asphalt ~15 m ahead (`KEY_SHADOW` `softness: 0.3`, no `fit`); `gdCruiserPodW3` roof glass shows mottled IBL reflections; un-beveled orange-red brake rectangles; hand-rolled 45-line `createBeaconRippleTexture` (`src/vfx.ts:24-68`), no `createGradingLut`, no `createHumanoidAnimator` for `gdCommuter`/`gdWalkerA..D`; **severe `390x844` bloat** (`#where` + `#taxiTotal` with truncated `no rati..` + `#taxiTrip` eat top 34% of screen, speedometer `017` collides with `50` tick, and `L5 · SELF-DRIVING · DUAL-MOTOR E` clips off the right edge).
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve San Francisco Marine-Layer Dispatch identity (4 sky modes, spring-braking `carMotion.ts`, teal LiDAR depth-ring scan pulse).
  - Fix mid-road shadow seam in `src/look.ts:239` (`KEY_SHADOW`): raise `softness: 1.4` and pin `fit: { center: [0, 0, -28], extent: [28, 18], depth: 56 }`; upgrade `sky.gradient` (`golden`/`fog`/`night`) to 5.7.0 stylized profile with marine `haze`.
  - Add per-sky `createGradingLut("broadcast-crisp" | "cinema-warm")` (`@aura3d/engine/game`); replace `createBeaconRippleTexture` (`src/vfx.ts:24`) with `createFlipbookAtlas("ripple", [63, 214, 198])` + `effects.flipbook`.
  - Audit `gdCruiserPodW3.glb` & fleet GLBs via `assets inspect --pbr` (clean `studioGlass` roof `roughness: 0.08`, dielectric clearcoat paint, recessed HDR `BRAKE_RED` lenses); migrate `gdWalkerA..D` & `gdCommuter` (`src/walkers.ts`) onto `createHumanoidAnimator` + `humanoidLocomotionTime`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Adopt `HUD_THEMES["sci-fi-telemetry"]` + `quickbar.css`; merge `#where` + `#taxiTotal` into one 1-line header (`CHINATOWN · $0.00 · 0/5 · 06:46`) and default `#taxiTrip` to a 1-row tap-to-expand pill on `<640px` (cutting top chrome from 34% to `<14%`).
  - Fix speedometer SVG so `017` clears the `50` tick, shorten mobile assist status to `L5 · AUTO`, and collapse L1–L5 buttons into a tap-to-cycle pill.
- **Game Design & Feel Polish:**
  - Wire `createSnapshotInterpolator`, `readAutoplayFlag`, and `createAutoplayHarness` (`src/main.ts`); add proximity chime + glowing teal kerb-stop progress ring + `drainPopups` smoothness micro-rewards (`SMOOTH STOP +$2.50`).
- **Exact File Targets:** `apps/showcase-teleoperator/index.html`, `apps/showcase-teleoperator/src/{main.ts,look.ts,scene.ts,vfx.ts,walkers.ts,hud.ts}`.

#### 09. Craterline GP (`strange-orbit-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/strange-orbit-port/{course.ts,race.ts,reentry.ts}` are frozen. Presentation, art, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-strange-orbit-port/index.html`, `examples/strange-orbit-port/{index.html,world.ts,presentation.ts,main.ts,ui.ts,art/look.ts,art/vfx.ts,art/idolRider.ts,art/idolModels.ts,art/hud.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-amethyst.jpg`, `390-03-amethyst.jpg`):* `cgHabitat` floats visibly above lunar ground on title screen; flat cyan geometric exhaust wedges behind rear tire; chalky bike fairings; no `shadow.softness`/`fit` or `createGradingLut`; `art/idolRider.ts` still references `showcase-port-shared/idol/`; **severe `390x844` layout bug** where `.gouache-hud` floats at `top: 236px` (`ui.ts:140`) across the upper-mid sky/gas giant while top rows already occupy 230 px (~40% top coverage); `page-parity` warning (`<style>` drift, stale `"Graphik Web"`).
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve Gouache Crater Rim identity (banded peach gas-giant sky dome, raking lunar sun, brush-impasto road).
  - Ground `cgHabitat` and all `cg*` set dressing to `groundHeight(x, z) - 0.35` with contact plinths (`world.ts`); add `softness: 0.5–1.6` (crisp lunar penumbra) in `art/look.ts` and subtle `createGradingLut("cinema-warm", 16)` (`intensity: 0.28`).
  - Audit `cgBike*NR.glb` via `assets inspect --pbr` for 5.7.1 clearcoat fairings (`clearcoat: 0.9, clearcoatRoughness: 0.12`), soften road specular glare, replace flat exhaust wedges with `createFlipbookAtlas("plasma", [147, 234, 213])` + `effects.flipbook`, and migrate `art/idolRider.ts` directly onto `createHumanoidAnimator` (`@aura3d/engine/animation`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-strange-orbit-port/index.html` and `examples/strange-orbit-port/index.html` via `node tools/showcase-port-pages/sync.mjs strange-orbit` (`page-parity`).
  - Adopt `HUD_THEMES["motorsport"]` (`National 2 Narrow` + `DIN Pro`); dock `.gouache-hud` at the **bottom** above credit/touch controls on `390x844` (never `top: 236px`) and collapse the 6-rider leaderboard into a compact `4/6 · +136m` top pill so the gas giant and road stay 100% clear.
- **Game Design & Feel Polish (Presentation-Only):**
  - Migrate `createImpactRig`/`createFlipbookAtlas` to `@aura3d/engine/game`, wire `readAutoplayFlag` + `createAutoplayHarness` (`main.ts`), increase boost FOV kick (`9 -> 11`), add harmonic `RESONANCE_GATES` chimes, and scale landing dust puffs to snapshot vertical velocity.
- **Exact File Targets:** `apps/showcase-strange-orbit-port/index.html`, `examples/strange-orbit-port/{index.html,world.ts,main.ts,ui.ts,art/look.ts,art/vfx.ts,art/idolRider.ts,art/idolModels.ts,art/hud.ts}`.

#### 10. Gridlock Courier (`drift-and-deliver-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/drift-and-deliver-port/{sim.ts,brakes.ts}` physics are frozen. Presentation, look, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-drift-and-deliver-port/index.html`, `examples/drift-and-deliver-port/{index.html,look.ts,sky.ts,textures.ts,idol.ts,main.ts,hud.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-avenue.jpg`, `390-03-intersection.jpg`):* Heavy dark diagonal shadow-banding/acne streaks across road and crosswalks (`look.ts:315` `shiftShadow`); opaque black building windows; heavy full-screen blur modal hides harbor title view; `TICKET 01` card blocks central road vanishing point; `390x844` credit pill floats mid-road above speed/nitro while `TIPS` stacks over minimap; static `.cube` URL instead of `createGradingLut`; no `createSnapshotInterpolator`, `createAutoplayHarness`, or `createHumanoidAnimator` (`gcWalkerA..D`); `page-parity` warning (`<style>` + `<body>` drift).
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve Last Shift on the Harbour identity (`venice_sunset` IBL, 84 instanced traffic cars, instanced red brake halos, tall teal `delivery-beacon`, `sky.gradient` on original + custom 3-minute shift sky).
  - Fix road shadow acne in `look.ts:315` (`shiftShadow`): switch to `filter: "pcf", softness: 2.0`, calibrated normal bias, and courier-ahead `fit: { center, extent: [42, 24], depth: 52 }`.
  - Replace `CINEMA_WARM_LUT_URL` (`look.ts:312`) with `createGradingLut("cinema-warm")` (`@aura3d/engine/game`) + explicit `output: { toneMapping: "agx" }`; add daylight sky-reflection Fresnel + tinted interior panes on `facadeMaterial` (`look.ts:331`, `textures.ts`); audit vehicles via `assets inspect --pbr` for 5.7.1 clearcoat (`0.92`); migrate `gcWalkerA..D` (`idol.ts`) to `createHumanoidAnimator` + `humanoidLocomotionTime` and tire-smoke/delivery sparks to `effects.flipbook({ texture })`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-drift-and-deliver-port/index.html` and `examples/drift-and-deliver-port/index.html` via `sync.mjs drift-and-deliver` (`page-parity`).
  - Adopt `HUD_THEMES["motorsport"]` with cream-ticket/teal accents; replace full-screen title blur with left-docked title card over live harbor orbit; move `TICKET 01` off the vanishing point to top-left; dock mobile credit cleanly at bottom edge and shrink `TIPS` to a 1-line pill above a `96x96` minimap.
- **Game Design & Feel Polish (Presentation-Only):**
  - Add `createSnapshotInterpolator` (`main.ts`) for 120 Hz traffic/courier fluidity and `readAutoplayFlag` + `createAutoplayHarness`; add warm amber drift-combo arc glow + teal radial drop-off shockwave on `slamStamp`.
- **Exact File Targets:** `apps/showcase-drift-and-deliver-port/index.html`, `examples/drift-and-deliver-port/{index.html,look.ts,sky.ts,textures.ts,idol.ts,main.ts,hud.ts}`.

#### 11. Ion Circuit (`heatsink-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/heatsink-port/{race.ts,operation.ts,config.ts,vehicle.ts}` are frozen (`1e-6` replay). Presentation, look, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-heatsink-port/index.html`, `examples/heatsink-port/{index.html,world.ts,materials.ts,shaders.ts,meshes.ts,presentation.ts,hud.ts,art/look.ts,art/vfx.ts,art/idolModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):* Overhead track arch renders as a pitch-black unlit bar cutting the horizon; canyon peaks look smooth-shaded/flat; hero `ioncDrone` reads matte rust-brown with weak nozzle glow; `#district` neon line slices straight through the top HUD blocks (`1280` & `390`); `390x844` objective pill prints desktop `[SHOOT: CLICK / F / J]` and spans 3 lines; speed lines distract over center reticle; `page-parity` warning (`<style>` drift); no `shadow.softness`/`fit`; uses `showcase-port-shared` shims.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve Alien Blue-Hour Canyon identity (`sunset-dramatic` IBL, ringed planet + aurora dome, 60-segment `ion-wake` ribbon).
  - Add brushed-alloy specular + emissive edge chase strips to `buildArches` (`meshes.ts`); add `softness: 1.8` + track-ahead `shadow.fit` (`art/look.ts`, `world.ts`) and lock `output: { toneMapping: "agx" }`.
  - Audit `ioncDrone.glb` / `ioncSentry.glb` / `ioncHeavy.glb` via `assets inspect --pbr` (5.7.1 carbon-ceramic clearcoat + HDR emissive ion-cyan thruster cores `3.5`); add procedural strata micro-normals + bioluminescent veins in `terrainSpec` (`materials.ts`, `shaders.ts`); migrate `createFlipbookAtlas`/`createGradingLut`/`createImpactRig` directly to `@aura3d/engine/game`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-heatsink-port/index.html` and `examples/heatsink-port/index.html` via `sync.mjs heatsink` (`page-parity`); adopt `HUD_THEMES["sci-fi-telemetry"]`.
  - Position `#district` cleanly *below* `.top` (zero intersection); condense `#objective` to 1 line (`NEXT: BARREL 57m · 1/16 BRONZE`) with touch-aware prompt (`TAP FIRE`) on mobile; merge 6 top blocks into 2 compact telemetry strips on `<640px` and tame center-reticle speed lines.
- **Game Design & Feel Polish (Presentation-Only):**
  - Keep existing pooled `createSnapshotInterpolator` & `createAutoplayHarness` (`autoplay.diag()` exposed in QA hook); add cyan/amber target-lock snap pulse + audio chirp on `projectTargetLock`, nose-cannon recoil in `stepCraftArticulation`, and multiplier-scaled `ion-wake` width.
- **Exact File Targets:** `apps/showcase-heatsink-port/index.html`, `examples/heatsink-port/{index.html,world.ts,materials.ts,shaders.ts,meshes.ts,presentation.ts,hud.ts,art/look.ts,art/vfx.ts,art/idolModels.ts}`.

#### 12. Lamplight Line (`last-train-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/last-train-port/{sim.ts,replay.ts}` are frozen (flat memory & exact 3-loop parity). Presentation, lighting, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-last-train-port/index.html`, `examples/last-train-port/{index.html,world.ts,bands.ts,lights.ts,idolModels.ts,materials.ts,vfx.ts,figures.ts,walkers.ts,presentation.ts,main.ts,enamel.css,art/proceduralModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-boarding.jpg`, `390-03-viaduct.jpg`):* **Broken jagged black alpha/Z-fighting artifacts on `llTram` curved front/side window frames**; Band A reads flat beige with weak plaza shadows and `toneMapping: "none"` (`bands.ts:55`); faceted grey horizon boulder & blobby bushes; raw concrete viaduct pier rectangles; permanent full-width bottom `#status` keybind bar on desktop; **critical `390x844` usability flaw** where `#lean` meter shrinks to `48px` (dot covers entire bar) and `#top` truncates `MANGO TIDE → FOLDED ...`; `page-parity` warning; no `shadow.softness`/`fit`, no `createSnapshotInterpolator`, and 9 Idol rigs on `showcase-port-shared/idol/`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve The Last Tram Before Dark identity (6-town day-to-night bands, `LanternSky` earned rising sky lanterns, heritage red-and-cream tram).
  - Fix `llTram.glb` window artifacts (`idolModels.ts`, `world.ts`): audit via `assets inspect --pbr`, replace broken cutout glass with clean `material.studioGlass({ opacity: 0.28, roughness: 0.08, clearcoat: 0.9 })`, and apply 5.7.1 clearcoat enamel (`clearcoat: 0.85`) to the body.
  - Add `shadow: { softness: 1.8, fit: { center, extent: 26, depth: 65 } }` in `world.ts`, restore `output: { toneMapping: "agx" }` + `createGradingLut("cinema-warm")` (`@aura3d/engine/game`), enrich Band A/B key-to-fill contrast + chamfered masonry viaduct piers + stratified rock/foliage cards (`art/proceduralModels.ts`), and migrate `figures.ts` + `walkers.ts` (`llMotorman`, `llPax*`, `llWalkerA..D`) to `createHumanoidAnimator` + `humanoidLocomotionTime`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-last-train-port/index.html` and `examples/last-train-port/index.html` via `sync.mjs last-train` (`page-parity`); align `enamel.css` with `HUD_THEMES["tabletop"]` / `"storybook"` brass-and-parchment tokens (`DIN Pro` speed/fares, `Monument Grotesk Mono` `LL-01`).
  - Give `#lean` a dedicated `width: 112px; height: 10px` row on `390x844` so green/amber/red balance zones are unmistakable; show concise destination (`→ Folded Gardens`) in `#top` without truncation; auto-fade desktop `#status` keybind strip 5 s after throttle input.
- **Game Design & Feel Polish (Presentation-Only):**
  - Add `createSnapshotInterpolator` (`presentation.ts`, `main.ts`) for 120 Hz tram bob, lean roll, and passenger walks; trigger `createFlipbookAtlas("sparks")` pantograph arcs on high-lean curves, warm tungsten door-open cobble spill, and chime + bloom trail on launched sky lanterns.
- **Exact File Targets:** `apps/showcase-last-train-port/index.html`, `examples/last-train-port/{index.html,world.ts,bands.ts,lights.ts,idolModels.ts,materials.ts,vfx.ts,figures.ts,walkers.ts,presentation.ts,main.ts,enamel.css,art/proceduralModels.ts}`.

#### 13. Saltwind Highway (`roadster-hours-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/roadster-hours-port/{sim.ts,course.ts,replay.ts}` are frozen (6,124-step reference parity). Presentation, look, PBR, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-roadster-hours-port/index.html`, `examples/roadster-hours-port/{index.html,world.ts,roadsterRig.ts,presentation.ts,main.ts,hud.ts,art/look.ts,art/driver.ts,art/spray.ts,art/proceduralModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-close-pass.jpg`, `390-03-close-pass.jpg`):* Hero roadster paint reads chalky/matte teal and red semi-truck shows blotchy matte clay shading; roadside cliffs show faceted horizontal bands & mushroom-blob trees; rectangular reflection seam near road hill crest; `1280-01-title.jpg` bottom-left `.credit` paragraph is overlapped by the floating `Built with Aura3D` legal pill; `390-03-close-pass.jpg` stark opaque white `Pause` & `Sound on` buttons clash against the sky; `page-parity` (`<style>` + `<body>` drift); `shadow.fit` unset; `art/driver.ts` uses `showcase-port-shared/idol/` + M18 top-level driver workaround; inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`).
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve Wind-Scoured Maritime Road Trip identity (3 coastal routes, 33–35 batched vehicles, crosswind salt/sand/mist spray sheets `art/spray.ts`, custom dual-cloud sky dome).
  - Audit `swRoadster`, `swDriver`, and traffic GLBs via `assets inspect --pbr`: apply 5.7.1 automotive lacquer clearcoat (`clearcoat: 1.0, clearcoatRoughness: 0.06`, chrome roll-hoops `metallic: 0.96, roughness: 0.12`, HDR `emissiveIntensity: 3.2` signal-red taillights, clearcoat metallic semi cabs/trailers).
  - Add roadster-following `fit: { center: [0, 0, -24], extent: [26, 16], depth: 48 }` alongside existing `softness` (`art/look.ts:112`, `world.ts`); smooth road-crest reflection seam (`surfaces.sheen`) and upgrade coastal cliffs/trees (`art/proceduralModels.ts`); refactor `art/driver.ts` (`swDriver`) onto 5.7.0 parent-local vehicle seating + direct `createHumanoidAnimator`; migrate `createFlipbookAtlas`/`createGradingLut`/`createImpactRig` to `@aura3d/engine/game` with `toneMapping: "agx"`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-roadster-hours-port/index.html` and `examples/roadster-hours-port/index.html` via `sync.mjs roadster-hours` (`page-parity`); adopt `HUD_THEMES["motorsport"]` with salt-white/sea-teal/signal-red tokens.
  - Delete duplicate `.credit` paragraph inside `#menu .card` (`1280-01-title.jpg` overlap fix); replace stark white mobile `Pause`/`Sound on` rectangles with `44x44` translucent smoked-glass icon buttons.
- **Game Design & Feel Polish (Presentation-Only):**
  - Keep existing `createSnapshotInterpolator` (`presentation.ts`); add `readAutoplayFlag` + `createAutoplayHarness` (`main.ts`); add wind-shear camera micro-bump + stereo whoosh on `CLOSE PASS`, emerald-to-red `speedo-arc` pulse on `run.nitroWindow`, and intensified ocean-viaduct salt spray (`art/spray.ts`).
- **Exact File Targets:** `apps/showcase-roadster-hours-port/index.html`, `examples/roadster-hours-port/{index.html,world.ts,roadsterRig.ts,main.ts,hud.ts,art/look.ts,art/driver.ts,art/spray.ts,art/proceduralModels.ts}`.

### 4.3 Action & Combat Cluster (4 Games)

#### 14. Iron Crown (`iron-crown`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-iron-crown/index.html`, `apps/showcase-iron-crown/src/{main.ts,styles.css,game/look.ts,game/refinedLook.ts,game/arena.ts,game/stages.ts,game/vfx.ts,game/idolMocap.ts,game/idolFighters.ts,game/controls.ts,game/touchExtras.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-04-neo-tokyo.jpg`, `390-01-title.jpg`, `390-02-crown.jpg`):* `.ic-setup[data-open="true"]` drops directly over `#fight-hud .fh-top`, slicing the clock and hiding health bars; `cr-crowd-lights` (`stages.ts:634`) draws harsh white squares behind fighters' heads; flat black-iron `spawnDisc` swallows foot shadows & Kenji's dark gi merges into stone pillars; Neo-Tokyo spotlight prop sits tangent behind Kenji's head; brazier flames read as opaque orange triangles; `sparks` flipbook burst (`emissiveGain: 1.55`) reads as a white cotton ball; `390x844` quickbar clips `Player Stu…` and `EXTRA_TOUCH_BUTTONS` (`controls.ts:59-64`) places raw normalized circles risking overlap with `dpad-4btn`/`.fh-footer`; custom `idolMocap.ts` instead of `createHumanoidAnimator`; no `hud-tokens.css`, `shadow.fit`, or `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve The Royal Forge identity (`#0e0b0d`, `#d9a441`, `#9e1b22`, `#ffe08a` SUPER gold, `warm_bar`/`studio_small_08` HDRIs, chiaroscuro overhead follow-spot + letterbox cinematics).
  - Add fight-lane `shadow.fit` (`center: [0, 1.5, 0], extent: [6, 3.2], depth: 18`) and `shadow.softness: 1.5–2.2` on all 5 directional sun venues (`look.ts:419`, `refinedLook.ts:73-162`) plus `softness: 1.2` on Crown follow-spot; raise `spawnDisc` albedo/roughness contrast so foot contact shadows read cleanly.
  - Replace harsh white `cr-crowd-lights` boxes with recessed warm amber bokeh (`emissiveIntensity <= 0.35`, `#ffd699`), shift Neo-Tokyo's center spotlight off centerline, and boost back-rim Fresnel on dark fighters (`kenji`, `sovereign`) per R23.
  - Replace opaque brazier cones with layered additive `createFlipbookAtlas("muzzle" | "sparks")` flame cards via `effects.flipbook({ texture })`; tune hit-spark `emissiveGain` (`1.55 -> 1.05`) for crisp forged streaks; migrate `idolMocap.ts` to `createHumanoidAnimator` (`@aura3d/engine/animation`) and `@aura3d/engine/game` kits directly.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Dismiss or dock `.ic-setup` cleanly without colliding with `.fh-top`; collapse topbar modes into a compact `Modes ▾` popover on `<640px`.
  - Import `hud-tokens.css`, bind `.fh-plate`/`.fh-health`/`.fh-meter`/`.fh-clock` to `HUD_THEMES["fighting"]` vars, and delete duplicated CSS (`styles.css:690-711`).
  - Frame `390x844` portrait arena above a dedicated safe-area thumb band (left D-pad/Jump/Crouch, right Strike/Cleave/Parry/Super + Throw/Dash `>= 48px`, Pause moved to top-right).
- **Game Design & Feel Polish:**
  - Add directional hit-spark ejection, cyan hex-guard ripple (`createFlipbookAtlas("ripple")`), 1–2 frame rim-only hit flash, segmented 50%/100% SUPER notches with molten-gold pulse, `COUNTER!`/`PUNISH!`/`GUARD BREAK` callouts, and `createSnapshotInterpolator` + `createAutoplayHarness` (`@aura3d/engine/game`).
- **Exact File Targets:** `apps/showcase-iron-crown/index.html`, `apps/showcase-iron-crown/src/{main.ts,styles.css,game/look.ts,game/refinedLook.ts,game/arena.ts,game/stages.ts,game/vfx.ts,game/idolMocap.ts,game/idolFighters.ts,game/controls.ts,game/touchExtras.ts}`.

#### 15. Bunker Zero (`bunker-zero`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-bunker-zero/index.html`, `apps/showcase-bunker-zero/src/{main.ts,weapons-view.ts,art/lightRig.ts,art/look.ts,art/idolModels.ts,art/idolMocap.ts,art/vfx.ts,art/shaders.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-firing.jpg`, `1280-04-action.jpg`, `1280-06-floor6.jpg`, `390-03-action.jpg`):* `#bz-intro` sits over a black void with a wall of keybinds; corridors read flat evenly-lit beige concrete with circular grey `addBlob` decals (`main.ts:620`) and no Floor 6 moonlight shaft; **5.7.0 parent-local bug** — `idolModels.ts:215,223-226,426-435` writes unscaled model-space `worldT[ro.head]` to sibling `visor`/`gun`/`pack` handles under the parent group while `body` applies `BZ_IDOL_RIGS_SCENE_SCALE * spec.scale`, burying every enemy's glowing red visor inside the mesh (and `poseIdolHound` line 450 risks double-offset); pistol muzzle flash (`main.ts:1883-1885`) floats left/below the barrel as a peach starburst; static `+` crosshair has no spread/hitmarker; `#bz-feed` prints duplicate `"AMMO"` (`weapons-view.ts:66-86`) and stacks 5 pills over 35% of `390x844`; `F1..F6` clips in mobile topbar; no `hud-tokens.css`, `shadow.softness`, `createGradingLut`, `createHumanoidAnimator`, or `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve Cold-War Practical Bunker identity (`hangar_interior` IBL, per-floor lamp temperatures F1–F6, gunfire-lights-the-room signature).
  - Lower `BZ_PLAYER_LIGHT.intensity` (`1.2 -> 0.65`) for dramatic pools of light vs dark alcoves; enable `shadow.softness: 1.8` on `RIG_IDS.key` (`lightRig.ts:99`) and tune `contactShadows` (`length: 0.35, intensity: 0.9`, `main.ts:855`) to retire flat `addBlob` circles; add a low-cost light-cone moonlight shaft through `BZ_HATCH_CELLS` on Floor 6.
  - **Fix 5.7.0 parent-local enemy attachments (`idolModels.ts`):** Multiply `visor`/`gun`/`pack` local placements by `BZ_IDOL_RIGS_SCENE_SCALE[spec.key] * (spec.scale ?? 1)` (with `visor` `z: +0.13` outside brow) so glowing red/amber optic slits pop cleanly against darkened `#525a64` slate armor (`rim.intensity: 0.85`), and fix `poseIdolHound` (`idolModels.ts:444-456`) to avoid double-shifting Y/Z.
  - Align `muzzleCard`/`muzzleFlash` to per-`WeaponId` true barrel bore using `createFlipbookAtlas("muzzle" | "sparks")` + `effects.flipbook({ texture })`; migrate `idolMocap.ts` to `createHumanoidAnimator` + `humanoidLocomotionTime` (`@aura3d/engine/animation`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Replace black-void title modal with a slow pan down lit Floor 1 corridor + compact `DEPLOY` card (keybinds in collapsible `Controls` drawer).
  - Adopt `hud-tokens.css` + `HUD_THEMES["sci-fi-telemetry"]` accented with `--bz-lamp`/`--bz-hazard`; upgrade `#bz-crosshair` to a 4-tick dynamic spread reticle with crimson hitmarker `×` / gold kill-confirm and SVG feathered directional damage chevron.
  - Deduplicate `"AMMO"` in `formatTacticalFeed` (`weapons-view.ts:66-92`), cap `#bz-feed` to 2–3 fading lines (2.5 s TTL), collapse `F1..F6` to `Floor: F1 ▾` on `<640px`, and slim mobile `#bz-status` (`height <= 42px`) so `#bz-touch` move/fire arcs clear the pistol viewmodel.
- **Game Design & Feel Polish:**
  - Add per-weapon recoil kick, shell-casing spark bursts, enemy stagger/rim hit-flash, subtle brass-key compass pip after >50% floor clear, Floor 6 reactor vent alarm telegraph, Kill House par-medal pace indicator, and `createSnapshotInterpolator` + `createAutoplayHarness`.
- **Exact File Targets:** `apps/showcase-bunker-zero/index.html`, `apps/showcase-bunker-zero/src/{main.ts,weapons-view.ts,art/lightRig.ts,art/look.ts,art/idolModels.ts,art/idolMocap.ts,art/vfx.ts,art/shaders.ts}`.

#### 16. Slingshot Siege (`slingshot-siege`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-slingshot-siege/index.html`, `apps/showcase-slingshot-siege/src/{main.ts,styles.css,aura-assets.route.ts,game/stage.ts,game/look.ts,game/vfx.ts,game/shaders.ts,game/hud.ts,art/idolModels.ts,art/setPieces.ts,art/direction.ts}`, `apps/showcase-slingshot-siege/route-health.json`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-collapse.jpg`, `390-01-title.jpg`, `390-03-impact.jpg`):* **35 `borrowed-asset` warnings** (`siege*` keys belonging to retired `showcase-siege-golf`); sky renders flat dull slate-grey despite bright blue gradient in `look.ts:158-165`; signature tilt-shift DOF is disabled (`dof.maxBlur: 0` on all 6 chapters in `look.ts:170-357`); `ISLAND_SHADOW_FIT` (`stage.ts:344-356`) is commented out and `softness` is omitted; smashing timber towers shows almost zero dust/splinter burst; HUD mixes boar emoji `🐗` with `"LAST GULL!"` / `"GULLS SURVIVE…"`; **severe `390-01-title.jpg` overlap** where `.ss-coach` (`bottom: 112px`) covers `.ss-level-tag` (`bottom: 122px`), topbar clips `Tra…`, and `.controls-hint` clips mid-sentence above the ammo dock; `styles.css:26-342` carries 316 lines of dead legacy CSS.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve Tilt-Shift Seaside Toy Diorama identity (6-chapter day-to-night cycle, chalk/sea-teal/sand/driftwood/pennant-red palette).
  - Fix `chapterSkyNode` (`stage.ts:388-394`) so day chapters render crisp cobalt-to-warm-horizon `sky.gradient` with ivory clouds; re-enable miniature tilt-shift `dof.maxBlur` (`0.22–0.32` High/Ultra, `0` Low) via `tiltShiftBand()`.
  - Enable `fit: ISLAND_SHADOW_FIT` and `softness: row.shadowSoftness * 1.8` in `sunShadow()` (`stage.ts:346-356`); add painted meadow variation + cobble footpath decals; wire `@aura3d/engine/game` `createFlipbookAtlas("dust" | "sparks")` + `effects.flipbook({ texture })` + `createGradingLut("cinema-warm" | "broadcast-crisp")` for rich destruction plumes.
  - **Clear all 35 `borrowed-asset` warnings:** Re-prefix all 35 `siege*` keys to `ss*` across `aura.assets.json`, `aura-assets.route.ts`, `art/idolModels.ts`, `art/setPieces.ts`, `art/direction.ts`, and `route-health.json`, then regenerate `direction.audit.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Delete dead CSS (`styles.css:26-342`), adopt `quickbar.css` + `HUD_THEMES["storybook"]` parchment tokens (compact mobile labels `Play / Map / Paint / Lab` + Mute fitting inside `390px`).
  - Fix `390x844` collisions: hide `.controls-hint` on `(pointer: coarse), (max-width: 760px)`, dock `.ss-level-tag` cleanly below `.ss-score-card` at top-left, and slim `.ss-coach` to a 1-line touch pill.
  - Replace raw `🐗` emoji (`hud.ts:224`) with a crisp SVG raider crest and fix copy to `"LAST RAIDER!"` / `"RAIDERS SURVIVE…"`.
- **Game Design & Feel Polish:**
  - Add dotted trajectory preview + angle/power badge beside the pouch while dragging (visible above thumb on `390x844`), rubber-band tension creak audio, 40–60 ms `createImpactRig` `SLOW-MO FINISH` on final Raider, chain-collapse multipliers (`×2 CHAIN!`), mobile `Fort / Sling` quick-pan button, and `readAutoplayFlag` + `createAutoplayHarness` + `createSnapshotInterpolator`.
- **Exact File Targets:** `apps/showcase-slingshot-siege/index.html`, `apps/showcase-slingshot-siege/src/{main.ts,styles.css,aura-assets.route.ts,game/stage.ts,game/look.ts,game/vfx.ts,game/shaders.ts,game/hud.ts,art/idolModels.ts,art/setPieces.ts,art/direction.ts}`, `apps/showcase-slingshot-siege/route-health.json`.

#### 17. Shadowstep Gauntlet (`ninja-runner-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/ninja-runner-port/{sim.ts,course.ts,replay.ts,hazards.ts}` are frozen (106-second event-for-event replay). Presentation, lighting, materials, VFX, HUD/HTML, and identifier rename only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-ninja-runner-port/index.html`, `examples/ninja-runner-port/{index.html,districtLook.ts,lighting.ts,world.ts,vfx.ts,main.ts,art/idolActors.ts,art/idolMotion.ts,art/proceduralModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-02-village-clones.jpg`, `1280-03-village-run.jpg`, `1280-06-valley-gate-ember.jpg`, `390-02-village-clones.jpg`):* **`brand-identifiers` warning** (`examples/ninja-runner-port/art/proceduralModels.ts:1705` `"proc-sakuraMapleTree"` triggers `"Kurama"`); **`page-parity` warning** (`apps/showcase-ninja-runner-port/index.html` is 644 lines with duplicated stale `<style>` blocks); signature woodblock `ink` outline defaults OFF (`main.ts:61`), leaving Valley Gate cliffs faceted; 3 solid opaque blue clones (`nrHeroClone`) run in a tight V directly behind the hero, visually **occluding the hero** and burying the vermilion scarf trail; `.aura-credit` hovers mid-lower-left over the running clones; `390x844` clips `G` seal behind `#stats` and `"OWL CASTER"` has low dark-on-dark contrast; huge beige `#intro-card` hides the hero on title.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve Woodblock Evening Gauntlet identity (`belfast_sunset_puresky` HDRI, 5-district evening color script, vermilion scarf trail).
  - Rename `"proc-sakuraMapleTree"` -> `"proc-blossomMapleTree"` (`proceduralModels.ts:1705`) to clear `brand-identifiers`.
  - Restore ukiyo-e craft via high-threshold depth-weighted `effects.outline` (`threshold: 0.55–0.7`, `world.ts:396`) + sumi-ink Fresnel rim (`#1b2236`) + subtle `createGradingLut("cinema-warm")` (`0.18`); re-enable 2–3 pooled amber lanterns on High from River -> Valley Gate.
  - **Fix Clone vs Hero hierarchy (R23):** Give `nrHeroClone` (`art/idolActors.ts:37-50`) spectral transparency (`opacity: 0.72`, cyan rim `#51dfff`, `intensity: 0.95`) and widen/offset clone render slots slightly behind hero shoulders (render-only, zero sim impact) while boosting `SCARF.width: 0.22` vermilion emissive so the hero is unmistakable.
  - Add runner-following `shadow.fit` (`extent: 28, depth: 60`) + `shadow.softness: 1.6` (`lighting.ts:68-73`), wire `createFlipbookAtlas("ink" | "sparks")` + `effects.flipbook`, and use `createHumanoidAnimator` (`art/idolMotion.ts`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Deduplicate `apps/showcase-ninja-runner-port/index.html` and sync with `examples/ninja-runner-port/index.html` via `sync.mjs ninja-runner` (`page-parity`).
  - Map `.ink-scroll` tokens directly onto `HUD_THEMES["ink-scroll"]` + `hud-tokens.css`; auto-hide `.aura-credit` on run start (never hovering over lanes); offset/compact `#intro-card` (10-row key legend behind `Controls` toggle); on `390x844`, clear `#progress` below `#vitals`/`#stats` so `G` never clips, add mist-paper pill backing behind `#announce` (`"OWL CASTER"`), and add clear cooldown sweeps on the 5-button mobile ability bar (`>= 48px`).
- **Game Design & Feel Polish (Presentation-Only):**
  - Pulse calligraphy ground target rings (`world.ts:554`) + cyan attack windup auras on Owl Caster/Scout; trigger `createFlipbookAtlas("ink")` radial burst + scarf flare on `Sunfire`/`Ember` form shifts; wrap render poses in `createSnapshotInterpolator` (`world.ts`).
- **Exact File Targets:** `examples/ninja-runner-port/art/proceduralModels.ts`, `apps/showcase-ninja-runner-port/index.html`, `examples/ninja-runner-port/{index.html,districtLook.ts,lighting.ts,world.ts,vfx.ts,main.ts,art/idolActors.ts,art/idolMotion.ts}`.

### 4.4 Platformers & Runners Cluster (8 Games)

#### 18. Pip's Big Leap (`pips-big-leap`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-pips-big-leap/index.html`, `apps/showcase-pips-big-leap/src/{main.ts,styles.css,aura-assets.ts,game/looks.ts,game/world.ts,game/framing.ts,game/hud.ts,game/vfx.ts,game/presentation.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-01-title.jpg`, `390-03-action.jpg`):* **6 `borrowed-asset` warnings** (`showcase*` keys in `src/aura-assets.ts:9-34`); `world.ts:752-759` disables `row.shadowSoftness` and omits `shadow.fit`; Pip's airborne `dropShadow` is a hard flat grey ellipse; no `createGradingLut` or `createFlipbookAtlas`; dark-slate HUD (`src/styles.css`) clashes with the sunlit storybook world (ignoring `HUD_THEMES["storybook"]`); centered title card obscures Pip; `390x844` quickbar clips `W5`/`W6`/`Gauntlet` and bottom touch buttons crowd the credit strip; inline `?autoplay=1` (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-world sunlit storybook identity (`meadow_2` HDRI, verdant-to-cloudtop worlds, `framing.ts` aspect widening, Brambleback boss).
  - Re-enable calibrated `shadow: { softness: 1.6, fit: { center: [pipX, pipY, pipZ], extent: 24, depth: 65 } }` (`src/game/world.ts:752-759`, `src/game/looks.ts`); upgrade `dropShadow` to a feathered altitude-scaled disc + glowing gold concentric landing-aim ring.
  - Enrich `sky.gradient` with `haze`, 2-lobe `sun.glow`, and `dither: true`; add `createGradingLut("cinema-warm", 16)` (`intensity: 0.22`) + `output.neutralCurve: "khronos"`; wire `effects.flipbook({ texture })` (`createFlipbookAtlas("dust" | "sparks" | "ripple")`) for jump clouds, dives, ground-pounds, and sun-seeds.
  - **Clear all 6 `borrowed-asset` warnings:** Re-key `showcase*` entries in `src/aura-assets.ts` (and `aura.assets.json`) to Pip-owned `pip*` keys and regenerate `art/direction.audit.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Adopt `HUD_THEMES["storybook"]` (`Canela` + `GT Walsheim` / `DIN Pro` birch-cream parchment chips, umber ink, toadstool-red accents) + `hud-tokens.css`.
  - Left-dock title card on desktop (65% live meadow visible); collapse 6 worlds into `World: 1 ▾` inside `quickbar.css` on `<640px`; space `JUMP` (56 px) + `DIVE`/`POUND` (48 px) cleanly above `env(safe-area-inset-bottom)` and credit placement.
- **Game Design & Feel Polish:**
  - Add brief golden cape shimmer during coyote time, snappy jump-buffer feedback, 45 ms `createImpactRig` hit-stop on ground-pounds & Brambleback stomps, and migrate to `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator` (`@aura3d/engine/game`).
- **Exact File Targets:** `apps/showcase-pips-big-leap/index.html`, `apps/showcase-pips-big-leap/src/{main.ts,styles.css,aura-assets.ts,game/looks.ts,game/world.ts,game/hud.ts,game/vfx.ts,game/presentation.ts}`.

#### 19. Cross Hop (`cross-hop`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-cross-hop/index.html`, `apps/showcase-cross-hop/src/{main.ts,styles.css,game/look.ts,game/themes.ts,game/world.ts,game/critterRig.ts,game/ui.ts,game/vfx.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-traffic.jpg`, `390-01-title.jpg`, `390-03-traffic.jpg`):* **2 `luma-band` warnings** (`evidence/game-upgrades-47/cross-hop/luma-after.json`: `spread=119` at 25 s and `117` at 60 s, failing `[140, ]`); over-lifted ambient/fill washes asphalt & water shadows into mid-grey; no `shadow.softness`/`fit`; critter silhouette blends into bright traffic; no `hud-tokens.css`; `390x844` quickbar clips `Timing...`/`World T...`; inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 6-theme lane-hopper diorama identity (`critterRig.ts` squash/stretch hops, 12 critters, idle-hawk & telegraphed rail pressure).
  - **Fix `luma-band` (`spread >= 145`):** Lower hemisphere/fill floor ~18% in `src/game/look.ts`/`themes.ts` (verifying all 6 runtime theme swaps per lesson R19), deepen asphalt/water shadow cavities, enable `shadow: { softness: 1.5, fit: { center: [playerX, 0, playerZ - 6], extent: 22, depth: 55 } }`, and apply `output: { toneMapping: "neutral", neutralCurve: "khronos" }` + `createGradingLut("broadcast-crisp", 16)` (`intensity: 0.24`), then re-capture `evidence/game-upgrades-47/cross-hop/luma-after.json`.
  - Add warm back-rim highlight + crisp hop contact ring beneath the critter (R23) and route splashes/train sparks/lava embers through `effects.flipbook({ texture })` (`createFlipbookAtlas("dust" | "ripple" | "sparks")`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Import `hud-tokens.css` (`Whitney` + `DIN Pro` tabular numerals); fold 6 themes + `Timing School`/`World Tour`/`Player Studio` into a compact `quickbar.css` selector on `<640px`; keep center hopping lane unobstructed on title and fade tap/swipe ghost arrows on first hop.
- **Game Design & Feel Polish:**
  - Add flashing red rail light cones + bell ding 1.2 s before trains, expanding ground hawk-shadow circle during idle pressure, physical `BEST` pennant on the high-score row, and `readAutoplayFlag` + `createAutoplayHarness` + `createSnapshotInterpolator`.
- **Exact File Targets:** `apps/showcase-cross-hop/index.html`, `apps/showcase-cross-hop/src/{main.ts,styles.css,game/look.ts,game/themes.ts,game/world.ts,game/critterRig.ts,game/ui.ts,game/vfx.ts}`, `evidence/game-upgrades-47/cross-hop/luma-after.json`.

#### 20. Splat (`splat-rush-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/splat-rush-port/sim.ts` matches its recorded reference field-for-field and is frozen. Presentation, look, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-splat-rush-port/index.html`, `examples/splat-rush-port/{index.html,look.ts,world.ts,main.ts,presentation.ts,hud.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-streak.jpg`, `390-01-title.jpg`, `390-03-action.jpg`):* `page-parity` warning (`<style>` drift); faint ball & color-gate shadows on the ribbon track (`noSoftShd`, `noShdFit`); heavy title card obscures track; `390x844` top Score/Combo/Color stack crowds upper third; inline `readQaParams` autoplay (`AUTOPLAY_INLINE_ALLOWLIST`); no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve glossy color-gate ball runner identity (4 color+shape symbols in `symbols.ts`, 5.7.0 `sky.gradient`, splatter game-over).
  - Add `shadow: { softness: 1.8, fit: { center: [0, 0, ballZ - 12], extent: 16, depth: 45 } }` (`world.ts`), push 5.7.1 clearcoat gloss (`clearcoat: 1.0, clearcoatRoughness: 0.06`) on the rolling ball & gate arches, add `haze` + `dither: true` to `sky.gradient` (`look.ts`), and drive gate bursts & game-over splatters via `effects.flipbook({ texture })` (`createFlipbookAtlas("ink" | "sparks" | "ripple")`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-splat-rush-port/index.html` and `examples/splat-rush-port/index.html` via `sync.mjs splat-rush` (`page-parity`); slim `390x844` top HUD into one 40 px frosted bar (`hud-tokens.css`, `DIN Pro` numerals + popping `● / ▲ / ■ / ✕` active badge); compact title card.
- **Game Design & Feel Polish (Presentation-Only):**
  - Migrate `main.ts` to `readAutoplayFlag` + `createAutoplayHarness` (clearing `AUTOPLAY_INLINE_ALLOWLIST`) and `presentation.ts` to `createSnapshotInterpolator`; add streak-tier `createImpactRig` FOV lift + color-matched `ScreenFx.vignette` pulse.
- **Exact File Targets:** `apps/showcase-splat-rush-port/index.html`, `examples/splat-rush-port/{index.html,look.ts,world.ts,main.ts,presentation.ts,hud.ts}`.

#### 21. Serpentine Sky Run (`serpentine-sky-run-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/saiyan-snake-way-port/{sim.ts,road.ts}` outbound simulation is frozen. Presentation, look, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-serpentine-sky-run-port/index.html`, `examples/saiyan-snake-way-port/{index.html,world.ts,main.ts,presentation.ts,hud.ts,hud.css,art/vfx.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-early.jpg`, `1280-05-roll.jpg`, `390-03-early.jpg`):* `page-parity` warning (`<style>` drift); runner shadow detaches/fades during inverted Frenet roll sections (`noSoftShd`, `noShdFit`); weak runner back-rim contrast against bright golden clouds; centered title blocks the sweeping sky ribbon; `390x844` stage progress + telemetry + credit strip crowd top/bottom edges; no `createSnapshotInterpolator` or `createAutoplayHarness`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve 8-stage serpentine sky-road identity (cloud sea, boost rungs, Frenet roll sections).
  - Bind runner-following `shadow: { softness: 1.6, fit: { center: [heroX, heroY, heroZ], extent: 18, depth: 50 } }` (`world.ts`), strengthen stage-contrasting back-rim light (R23), verify `createHumanoidAnimator` uses `humanoidLocomotionTime` on boost sprints, and route boost-rung bursts through `effects.flipbook({ texture })` (`createFlipbookAtlas("sparks" | "plasma")`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-serpentine-sky-run-port/index.html` and `examples/saiyan-snake-way-port/index.html` via `sync.mjs` (`page-parity`); adopt `HUD_THEMES["sky-expedition"]` + `hud-tokens.css` (`Roobert`/`Whitney` + `DIN Pro`); offset title card off-center; compress 8-stage progress into a 4 px top hairline with stage pips on `390x844` (`>= 48px` touch targets, safe-area clear).
- **Game Design & Feel Polish (Presentation-Only):**
  - Add glowing edge chevrons ahead of inverted roll transitions; adopt `createSnapshotInterpolator` and `createAutoplayHarness` (`@aura3d/engine/game`) + progressive `createImpactRig` FOV kick on chained boost rungs.
- **Exact File Targets:** `apps/showcase-serpentine-sky-run-port/index.html`, `examples/saiyan-snake-way-port/{index.html,world.ts,main.ts,presentation.ts,hud.ts,hud.css,art/vfx.ts}`.

#### 22. Cumulus Dash (`cloud-runner-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/kid-goku-beyond-the-clouds-port/{sim.ts,gait.ts}` simulation (`1e-12` parity) is frozen. Presentation, look, VFX, and HUD/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-cloud-runner-port/index.html`, `examples/kid-goku-beyond-the-clouds-port/{index.html,world.ts,main.ts,presentation.ts,ui.ts,art/look.ts,art/vfx.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-02-rolling-log.jpg`, `1280-03-canyon.jpg`, `390-03-canyon.jpg`):* `page-parity` warning (`<style>` AND `<body>` drift); missing `createGradingLut` and `@aura3d/engine/game` `createFlipbookAtlas` wiring (`noLUT`, `noFlipbk`); hard/uneven canyon boulder & log shadows (`noSoftShd`, `noShdFit`); centered title card obscures the sky-kid on the golden cloud steed; inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve sunlit canyon-to-storm-duel adventure identity (2-bone IK stride, 5.7.0 parent-local golden cloud steed, Storm Tyrant finale).
  - Add `shadow: { softness: 1.8, fit: { center: [heroX, heroY, heroZ - 8], extent: 22, depth: 60 } }` (`world.ts`), apply `createGradingLut("cinema-warm", 16)` (`intensity: 0.22`), wire `createFlipbookAtlas("dust" | "sparks" | "plasma")` directly into `effects.flipbook({ texture })` for cloud-steed puffs, rolling-log dust, and duel impacts, and strengthen R23 back-rim lighting during the dark Storm Tyrant duel.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `<style>` + `<body>` between `apps/showcase-cloud-runner-port/index.html` and `examples/kid-goku-beyond-the-clouds-port/index.html` via `sync.mjs cloud-runner` (`page-parity`); adopt `HUD_THEMES["sky-expedition"]` + `hud-tokens.css`; add sleek Storm Tyrant boss HP bar during finale; keep `390x844` touch targets `>= 48px` clear of safe-area & credit.
- **Game Design & Feel Polish (Presentation-Only):**
  - Migrate inline autoplay to `readAutoplayFlag` + `createAutoplayHarness` (clearing `AUTOPLAY_INLINE_ALLOWLIST`) and presenter smoothing to `createSnapshotInterpolator`; add ground dust-trail telegraphs ahead of rolling logs and 40 ms `createImpactRig` hit-stop on duel strikes.
- **Exact File Targets:** `apps/showcase-cloud-runner-port/index.html`, `examples/kid-goku-beyond-the-clouds-port/{index.html,world.ts,main.ts,presentation.ts,ui.ts,art/look.ts,art/vfx.ts}`.

#### 23. Shape Shift Sprint (`shape-shift-sprint`, Runner-Kit)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-shape-shift-sprint/index.html`, `apps/showcase-shape-shift-sprint/src/{main.ts,look.ts,world.ts,presentation.ts,hud.ts}`, `examples/shared/runner-kit/sky.ts`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):* `luma-band` warning (missing `luma-bands.json`/`luma-after.json`); `#load-bar` stays stuck at 100% on title screen; flat candy walls & hero lack soft shadows (`noSoftShd`, `noShdFit`), clearcoat gloss, and `createGradingLut`; morph pickups give no preview of the *next* shape; `390x844` top HUD cards stack tightly beneath `quickbar.css`; inline `readQaParams` autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve candy-primary toy-block identity (sphere/cube/cone cutouts, morph/wildcard tokens, sunrise `sky.gradient`).
  - Give hero forms & morph tokens 5.7.1 clearcoat gloss (`clearcoat: 1.0, clearcoatRoughness: 0.08`), add `shadow: { softness: 1.8, fit: { center: [0, 0, -14], extent: 16, depth: 46 } }` (`src/world.ts`), pass `haze` + `sun.glow` + `dither: true` via `examples/shared/runner-kit/sky.ts`, apply `createGradingLut("broadcast-crisp", 16)` (`0.20`) + `output.neutralCurve: "khronos"`, highlight matching cutout edges within 18 m, and trigger `effects.flipbook({ texture })` (`createFlipbookAtlas("sparks" | "ripple")`) on morphs and perfect passes.
  - Create `evidence/game-upgrades-47/shape-shift-sprint/luma-bands.json` and commit steady-state `luma-after.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Hide `#load-bar` in `loading.done()`; pair `hud-tokens.css` Score/Combo with a bold geometric SVG active-form badge (`● / ■ / ▲`) in one 40 px top glass strip on `390x844`; provide full-width drag steering + optional bottom 3-lane tap rail (`>= 48px`, safe-area clear).
- **Game Design & Feel Polish:**
  - Embed a rotating holographic mini-preview of the *target* shape inside morph pickup rings; add 120 ms elastic squash/stretch on morph + `createImpactRig` micro-FOV kick on perfect chains; adopt `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator`.
- **Exact File Targets:** `examples/shared/runner-kit/sky.ts`, `apps/showcase-shape-shift-sprint/{index.html,src/main.ts,src/look.ts,src/world.ts,src/presentation.ts,src/hud.ts}`, `evidence/game-upgrades-47/shape-shift-sprint/{luma-bands.json,luma-after.json}` (`CREATE`).

#### 24. Number Surge (`number-surge`, Runner-Kit)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-number-surge/index.html`, `apps/showcase-number-surge/src/{main.ts,look.ts,world.ts,presentation.ts,hud.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):* `luma-band` warning (missing `luma-bands.json`/`luma-after.json`); stuck `#load-bar` on title screen; flat dusk corridor floor without grounded soft shadows (`noSoftShd`, `noShdFit`) or gate reflections; `+`/`×` vs `−`/`÷` gates rely mainly on green/red hue; no persistent 300 m boss-wall distance/target-number gauge; `nsGuardRig` not on `createHumanoidAnimator`; inline `readQaParams` autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve neon-dusk arithmetic corridor identity (`sky.gradient`, `createGradingLut("cyber-neon")`, 300 m boss walls).
  - Add `shadow: { softness: 2.0, fit: { center: [0, 0, -16], extent: 18, depth: 52 } }` (`src/world.ts`), add low-roughness specular wet-lane reflection strips so glowing equations reflect down-track, dual-code `+`/`×` gates (upward bright chevron arch caps) vs `−`/`÷` gates (jagged crimson hazard bars), migrate `nsGuardRig` to `createHumanoidAnimator`, and fire `effects.flipbook({ texture })` (`createFlipbookAtlas("plasma" | "sparks")`) on boss-wall shatters.
  - Create `evidence/game-upgrades-47/number-surge/luma-bands.json` and commit steady-state `luma-after.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Hide `#load-bar` on ready; align with `HUD_THEMES["arcade-neon"]` + `hud-tokens.css` (`DIN Pro` tabular numerals); add a slim top **Boss Distance Pill** (`BOSS 120 M · REQ 84`) inside one 42 px glass bar on `390x844`.
- **Game Design & Feel Polish:**
  - Flash distinct gold `OPTIMAL!` vs muted `SAFE` popups (`drainPopups`) when taking the mathematically superior gate; add 55 ms `createImpactRig` hit-stop + glowing shard cascade on 300 m boss smashes; adopt `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator`.
- **Exact File Targets:** `apps/showcase-number-surge/{index.html,src/main.ts,src/look.ts,src/world.ts,src/presentation.ts,src/hud.ts}`, `evidence/game-upgrades-47/number-surge/{luma-bands.json,luma-after.json}` (`CREATE`).

#### 25. Beat Hopper (`beat-hopper`, Runner-Kit)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-beat-hopper/index.html`, `apps/showcase-beat-hopper/src/{main.ts,look.ts,world.ts,audio.ts,presentation.ts,hud.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-duck.jpg`, `1280-04-perfect.jpg`, `390-03-action.jpg`):* `luma-band` warning (missing `luma-bands.json`/`luma-after.json`); stuck `#load-bar` on title screen; speaker crates lack soft grounded shadows on the Acrylic floor (`noSoftShd`, `noShdFit`); overhead **DUCK** bars and ground **JUMP** speaker crates share overlapping cyan/magenta accents; no silent visual 132 BPM beat-pulse rail; `bhSkaterBot` not yet on `createHumanoidAnimator`; no `createSnapshotInterpolator` or `createAutoplayHarness`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve 132 BPM synesthetic concert-stage identity (`#120926`, `#00f2ff`, `#8b5cf6`, `#0e1020`, gold `#ffbe2e`, crimson `#ff3b5c`, dancing equalizer towers, gold `PERFECT` shockwave rings).
  - Add `shadow: { softness: 1.6, fit: { center: [0, 0, -14], extent: 16, depth: 48 } }` (`src/world.ts`), dual-code overhead Duck bars (`#ff3b5c` downward laser chevrons) vs ground Jump crates (`#00f2ff` upward-pulsing rims), fire `effects.flipbook({ texture })` (`createFlipbookAtlas("ripple" | "sparks")`) on `PERFECT` hits, and migrate `bhSkaterBot` hop/duck/skate blends to `createHumanoidAnimator` (`@aura3d/engine/animation`).
  - Create `evidence/game-upgrades-47/beat-hopper/luma-bands.json` and commit steady-state `luma-after.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Hide `#load-bar` on ready; align with `HUD_THEMES["arcade-neon"]` + `hud-tokens.css` (`DIN Pro` tabular Score / Streak / Accuracy % / `132 BPM`); add a subtle bottom-center **Beat-Pulse Rail** synced to the 132 BPM sequencer (works muted + honors `prefers-reduced-motion`); keep `390x844` top HUD to one 40 px bar with intuitive swipe-L/R, tap-hop, hold-duck zones (`>= 48px`, safe-area clear).
- **Game Design & Feel Polish:**
  - Layer progressive 132 BPM synth stems at `10×` / `25×` / `50×` combos (`src/audio.ts`), couple `createImpactRig` micro-FOV breath (`+1.2°`) to `PERFECT` streaks, and adopt `createAutoplayHarness` + `createSnapshotInterpolator` so 132 BPM visual sync stays frame-accurate at 60/120/144 Hz.
- **Exact File Targets:** `apps/showcase-beat-hopper/{index.html,src/main.ts,src/look.ts,src/world.ts,src/audio.ts,src/presentation.ts,src/hud.ts}`, `evidence/game-upgrades-47/beat-hopper/{luma-bands.json,luma-after.json}` (`CREATE`).

### 4.5 Arcade & Exploration Cluster (5 Games)

#### 26. Glint Courier (`dot-dash-3d`)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-dot-dash-3d/index.html`, `apps/showcase-dot-dash-3d/src/{main.ts,styles.css,game/look.ts,game/world.ts,game/camera.ts,game/hud.ts,art/arcadeActors.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-04-surge.jpg`, `390-03-action.jpg`):* Over-bloomed `glowDisc()` (`ACTOR.courierGlow = 2.0`, `ARCADE_EMISSIVE.courier = 2.6`) washes out the courier's cyan visor & sentry star points; frightened sentries turn `#2438ff` blue, clashing with `#2f6bff` blue walls; `ARCADE.toneMapping: "neutral"` lacks `output.neutralCurve: "khronos"`; `look.ts` holds 280 lines of dead PCB workbench constants; HUD hardcodes stale `REV 5.5 · BD-01` (`hud.ts:231`); `390x844` 13-button topbar clips `Relay` and leaves large black vertical voids above/below the maze; inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), hand-rolled `snapshotActors`/`blendActors` (`world.ts:370-394`).
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve top-down neon cabinet identity (`#020307` floor, `indoor-workshop` IBL `background: false`, gold courier `#ffd21a`, board-clear neon blink).
  - Enable `output: { toneMapping: "neutral", neutralCurve: "khronos" }` (`main.ts`) so emissive neon walls and saturated sentries stay crisp below the 0.76 knee.
  - Tighten `ACTOR.courierGlow` (`2.0 -> 1.35`) and `glowDisc` opacity (`0.6 -> 0.32`) with a darker bevel around the cyan visor; shift frightened sentries to deep indigo-violet (`#1b1f7a`) + pulsing cyan/white zig-zag halo (`ARCADE.frightenedFlash`) so they never merge into blue walls; differentiate the 6 boards with subtle 6–8% luma floor silkscreen corner traces; wire `effects.flipbook({ texture: SPARKS_ATLAS.texture })` in `spawnSparkBurst` and `shadow.softness: 1.5` for Tilt Cam.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Collapse the 13-button `.aura3d-top-bar` on `<760px` into a single compact mode/board pill + menu trigger; tighten mobile `.dd-tl` into one top strip (`SCORE | SHARDS | LIVES | PAUSE`) and tune `arcadeMargins(aspect < 0.82)` (`top: 0.76, bottom: 0.66`) so the maze fills ~60% of portrait height cleanly above touch D-pad/swipe + Dash.
  - Replace hardcoded `REV 5.5 · BD-0${boardIdx}` (`hud.ts:231`) with `BD-0${boardIdx} · ${st.maze.def.title}`; surface a compact 4-sentry silhouette mini-legend on the title/pause panel.
- **Game Design & Feel Polish:**
  - Migrate inline autoplay (`main.ts:128`) to `readAutoplayFlag` + `createAutoplayHarness` and `snapshotActors`/`blendActors` (`world.ts:370-394`) to `createSnapshotInterpolator` (preserving wrap-tunnel snap `2.4`); add 1.8 s Surge-end pitch ramp + board-edge pulse, 40 ms dash squash/stretch + cyan afterimage, and a faint 1-tile queued-turn chevron ahead of the courier.
- **Exact File Targets:** `apps/showcase-dot-dash-3d/index.html`, `apps/showcase-dot-dash-3d/src/{main.ts,styles.css,game/look.ts,game/world.ts,game/camera.ts,game/hud.ts,art/arcadeActors.ts}`.

#### 27. The Bellkeeper's Walk (`where-the-wind-wanders-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/where-the-wind-wanders-port/sim.ts` walking trajectory (`1e-9` over 2,098 steps) is frozen. Presentation, lighting, rig nesting, shaders, and UI/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-where-the-wind-wanders-port/index.html`, `examples/where-the-wind-wanders-port/{index.html,world.ts,daylight.ts,ui.ts,main.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/idolModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-oak-letter.jpg`, `1280-06-bell.jpg`, `390-01-title.jpg`, `390-03-oak-letter.jpg`):* `page-parity` warning (`<style>` `"Aeonik Pro"` vs `"Graphik Web"`); `#wwui-title .card` slices across the Bellkeeper's body on desktop and buries her on `390x844` (plus shows `(ENTER)` on mobile); procedural cone pines & spherical tree blobs read flat next to lush Idol cottages/oak, and foreground grass shows alpha-stipple noise; `art/idolModels.ts:244-295` still uses the 5.6 M18 top-level `hero-idol` workaround causing subtle crook-to-hand drift (`1280-06-bell.jpg`); both `#wwui-caption` and `#toast` fire simultaneously with redundant messages; `390x844` toast sits underneath the dark credit bar; no `shadow.softness`, inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve storybook gouache valley identity (`kloppenheim_06_puresky` IBL, 6-key `daylight.ts` progression, gouache `paperPass`, visible downwind gust/cloud-shadow waves).
  - **5.7.0 parent-local keeper rig:** Refactor `createIdolBellkeeperNode` (`art/idolModels.ts`) to nest `hero-idol` cleanly under the `hero` group using 5.7.0 parent-local coordinates, eliminating `idolBellkeeperBodyWorld` and locking staff/body/kite alignment.
  - Add `softness: 2.2` to `valley sun` (`world.ts:476`); enrich procedural pine/deciduous trees (`PROP_FRAGMENT` in `shaders.ts`/`shaders-wgsl.ts`) with painterly gouache normal brushwork & warm canopy rim-translucency and smooth grass alpha edges; restore calibrated dusk shadow contrast (`heroShadow = 0.45`) + warm `bell-light` brass bounce on the bell climax (`world.ts:449`).
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-where-the-wind-wanders-port/index.html` and `examples/where-the-wind-wanders-port/index.html` via `sync.mjs where-the-wind-wanders` (`page-parity`, unified `--font-ui` via `hud-tokens.css` + `HUD_THEMES["storybook"]`).
  - Offset title-state camera slightly right/down (presentation-only while `titleVisible()`) so the Bellkeeper frames cleanly beside the desktop card and above a compact bottom-sheet card on `390x844` (strip `(Enter)` on `max-width: 760px`, fold 6-row controls table behind disclosure); suppress `#toast` when `#wwui-caption` covers the same event, anchor `#toast` above `--credit-gap`, and add 3 visual crimson wax-seal pips (`WAX_SEAL_SVG`) to `#quest`/Journal.
- **Game Design & Feel Polish (Presentation-Only):**
  - Adopt `readAutoplayFlag` + `createAutoplayHarness` (`main.ts:62`) and `createSnapshotInterpolator` (`presentation.ts`); add subtle 3D brass resonance wave + `createImpactRig` `+1.2°` FOV breath on bell ring, warm parchment sparkle beacons on letters visible from 18 m, and wind-gust volume swells synced to `gustAt(x, z, time)` (`audio.ts`).
- **Exact File Targets:** `apps/showcase-where-the-wind-wanders-port/index.html`, `examples/where-the-wind-wanders-port/{index.html,world.ts,daylight.ts,ui.ts,main.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/idolModels.ts}`.

#### 28. Duneglide (`silt-and-signal-port`) — `REPLAY-VERIFIED`
> *Determinism Invariant:* `examples/silt-and-signal-port/{sim.ts,collide.ts,colliders-ch0.ts}` (`1e-9` parity) are frozen. Presentation, camera occlusion, look, shaders, and UI/HTML only.
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-silt-and-signal-port/index.html`, `examples/silt-and-signal-port/{index.html,hud-look.ts,main.ts,camera.ts,occlusionFade.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/look.ts,art/idolRider.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `1280-05-turbo.jpg`, `390-03-scene.jpg`, `390-04-turbo.jpg`):* **Critical camera occlusion (`1280-03-action.jpg`)** where a white arch pillar slices across the left third of the lens (`occlusionFade.ts` only fades trees, not stone piers); **critical `390-04-turbo.jpg` collision** where `#toast` (`"3 of 4 rings"`) overlaps `"170 m"` inside `#silt-horizon-tape`; 5 of 7 chapter buttons truncate with `..` on `1280-01-title.jpg`; `#objective` renders literally `".."` on `390-03-scene.jpg` (`main.ts:502`); `#silt-horizon-tape` wraps awkwardly onto 2 lines and duplicates `#compass-wrap`; hard circular zenith color-step in `SKY_INK_FRAGMENT`; stiff Turbo rider posture & oversized cyan ground blob at bottom frame; `page-parity` warning (`<style>` drift); no `shadow.softness`, inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator` or `createHumanoidAnimator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2, Presentation-Only):**
  - Preserve 7-chapter hand-inked gouache desert identity (`silt-cel` 600 m fading ink pass, sand-wake `signatureEffect`, per-chapter HDRIs).
  - Smooth the upper-dome step in `SKY_INK_FRAGMENT`/`SKY_INK_FRAGMENT_WGSL` with gouache paper-grain dither; add `softness: 2.0` on low-sun chapters (ch0, ch3, ch6); widen distant ring-beacon vertical jade Fresnel column slightly for sky legibility; deepen `riderHumanoidPose` Turbo crouch + scarf stream (`art/idolRider.ts`) via `createHumanoidAnimator` (`@aura3d/engine/animation`) and tone down the oversized blue ground ring under camera bottom.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Sync `apps/showcase-silt-and-signal-port/index.html` and `examples/silt-and-signal-port/index.html` via `sync.mjs silt-and-signal` (`page-parity`, unified `--font-ui` via `hud-tokens.css`).
  - Move `#toast` to `top: calc(max(12px, env(safe-area-inset-top)) + 168px)` on mobile so it never overlaps `#silt-horizon-tape`; hide redundant `#compass-wrap` on `<760px`; keep `#silt-horizon-tape` single-line (`SIGNAL · R04 · 142.4MHz`); hide `#objective-card` while `#scene-screen` modal is active (eliminating `".."`); widen `#title-screen .card` (`520px`) or use a 2-column `.chapters` grid so all 7 chapter titles read cleanly.
- **Game Design & Feel Polish (Presentation-Only):**
  - Extend `camera.ts` (`chaseEyeBlocked`) and `occlusionFade.ts` to ray/segment-check stone piers & arch columns (`sceneryColumns`), smoothly pulling eye inward or fading foreground pillars; adopt `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator` (`presentation.ts`); add 120 ms jade edge-vignette pulse + harmonic pitch-stepped ring chimes.
- **Exact File Targets:** `apps/showcase-silt-and-signal-port/index.html`, `examples/silt-and-signal-port/{index.html,hud-look.ts,main.ts,camera.ts,occlusionFade.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/look.ts,art/idolRider.ts}`.

#### 29. Splat Turf (`splat-turf`, Runner-Kit)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-splat-turf/index.html`, `apps/showcase-splat-turf/src/{main.ts,world.ts,hud.ts,presentation.ts,art/wet-ink.ts,art/idol.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-pickup.jpg`, `1280-04-action.jpg`, `390-01-title.jpg`, `390-03-action.jpg`):* `luma-band` warning (missing `luma-bands.json`/`luma-after.json`); stuck `#load-bar` at 100% on title screen; `.score-chip` stretches to ~420px with 60% empty white space on desktop; 6-lane gesso deck lacks lane seam guides; flat translucent cyan solvent strips read washed-out; chunky icosphere `particles` look like floating yellow/orange snowballs; giant pink balloon clips into the right viewport edge (`1280-03-pickup.jpg`); `390x844` 3-card HUD covers top ~24% of viewport; `noSoftShd`, `noShdFit`, M18 driver rig workaround, inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve sunlit cobalt-to-cream acrylic splat identity (`sky.gradient`, plum-on-cream HUD, GPU wet-ink splat ribbon, Idol karts).
  - Add `shadow: { softness: 2.0 }` to the directional `key` light (`world.ts:319`); clean up `HERO_DRIVER_ID`/`rivalDriverNodes` using 5.7.0 parent-local nested handles so seated drivers track kart roll/pitch with zero lag.
  - Add subtle 6-lane concrete expansion joints + 25 m gold chalk stretch markers inside `wetInkRibbonSpec` (0 extra draw calls); upgrade solvent strips from flat quads to an animated foaming-solvent hazard shader (bubbling cyan-white chevrons + dark caution border); replace snowball spheres with elongated glossy teardrop wet-ink droplets + `effects.flipbook({ texture: turfSplat.inkAtlas.texture })`; widen balloon lateral clearance in `art/idol.ts` so nothing clips the right margin.
  - Create `evidence/game-upgrades-47/splat-turf/luma-bands.json` and commit steady-state `luma-after.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Fix stretched `.score-chip` (`justify-self: start; width: fit-content; min-width: 176px`); hide `#load-bar` in `loading.done()` (`main.ts:309`).
  - Cut `390x844` top HUD height by ~35% by merging `SCORE + MULT` and `INK TANK` into one compact top row alongside `44px` Mute/Pause and slimming `.territory-chip`; add diegetic kart tank glow + subtle crimson low-ink vignette pulse at `<= 25%`.
- **Game Design & Feel Polish:**
  - Add floor sweep-lane indicator ahead of rival eraser bots, gold vertical pickup rings under `turfAerosolCan`, roller-wide rainbow splash on 80%+ 25 m stretch clears, and migrate to `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator`.
- **Exact File Targets:** `apps/showcase-splat-turf/{index.html,src/main.ts,src/world.ts,src/hud.ts,src/presentation.ts,src/art/wet-ink.ts,src/art/idol.ts}`, `evidence/game-upgrades-47/splat-turf/{luma-bands.json,luma-after.json}` (`CREATE`).

#### 30. Polarity Orbs (`polarity-orbs`, Runner-Kit)
- **Current State & Visual/UX Diagnosis:**
  - *Files:* `apps/showcase-polarity-orbs/index.html`, `apps/showcase-polarity-orbs/src/{main.ts,world.ts,hud.ts,presentation.ts,scenery.ts,scenery-wgsl.ts,backdrop.ts,art/direction.ts,art/proceduralModels.ts}`.
  - *Observed Flaws (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):* `luma-band` warning (missing `luma-bands.json`/`luma-after.json`); `art/direction.ts:45` declares `assets: []` while `backdrop.ts:196-215` mounts 6 Idol GLBs; **critical colorblind & shape-affordance gap** where only the player gets `+`/`−` while all incoming red/blue orbs share one identical smooth sphere mesh (`world.ts:774-788`) with low figure-ground pop over matching deck halves; harsh black moiré stripes across flux arches (`buildCorridorArchedFluxGatesNode`); flat low-poly dark islands clash with textured Idol islands; stuck `#load-bar` on title screen; **`390x844` ergonomics bug** where `#btn-flip` sits stacked right above Pause/Mute in bottom-right; cryptic `0%` charge text; `noSoftShd`, `noShdFit`, inline autoplay (`AUTOPLAY_INLINE_ALLOWLIST`), no `createSnapshotInterpolator`.
- **Visual & Rendering Upgrades (Aura3D 5.7.2):**
  - Preserve dual-tone magnetosphere identity (`#ff5468` warm red / `#38bdf8` cool blue, dual warm/cool dusk aurora sky, ferrofluid dipole deck, purple magnet attraction streams).
  - **Dual-code incoming orbs:** Give Red `+` orbs a warm equatorial spiked/plus corona ring (or octahedral core + `+` cap) and Blue `−` orbs a sleek horizontal orbital halo band + `−` bar, plus dark contact-shadow discs (`y = 0.025`) beneath every orb for crisp figure-ground separation over glowing dipole lines.
  - Smooth high-frequency moiré on `buildCorridorArchedFluxGatesNode` (`art/proceduralModels.ts`), retire clashing low-poly `scenery-near` islands overlapping Idol islands, sync the 6 mounted Idol assets into `src/art/direction.ts` + regenerate `direction.audit.json`, add `softness: 1.8` to `dusk-key` (`world.ts:244`), and migrate `PLASMA_ATLAS` (`world.ts:132-147`) to `effects.flipbook({ texture: PLASMA_ATLAS.texture })`.
  - Create `evidence/game-upgrades-47/polarity-orbs/luma-bands.json` and commit steady-state `luma-after.json`.
- **UI/UX & Mobile (`390x844`) Redesign:**
  - Move `#corner-buttons` (Mute/Pause) to **top-right** on `max-width: 760px` and enlarge bottom-right `#btn-flip` to a dedicated `76x76px` tactile circular button (zero accidental Pause/Mute taps); hide `#load-bar`/`#load-label` once ready; replace cryptic `0%` with a 3-pip combo meter (`● ● ○ x3`) and add crisp glyphs (`★`, `◆`, `2×`, `◎`) inside `#powerup-badges`.
- **Game Design & Feel Polish:**
  - Add synchronized horizontal laser pulse + stereo pre-chime on monochromatic "forced flip" rows, brighten the dominant road polarity half +15% on flip shockwave, differentiate shield-break (mint shatter + brief blink) vs life-loss (crimson trauma), and adopt `readAutoplayFlag`, `createAutoplayHarness`, and `createSnapshotInterpolator`.
- **Exact File Targets:** `apps/showcase-polarity-orbs/{index.html,src/main.ts,src/world.ts,src/hud.ts,src/presentation.ts,src/scenery.ts,src/scenery-wgsl.ts,src/backdrop.ts,src/art/direction.ts,src/art/proceduralModels.ts}`, `evidence/game-upgrades-47/polarity-orbs/{luma-bands.json,luma-after.json}` (`CREATE`).

---

## 5. File-by-File Breakdown (Disjoint Workstream Ownership)

| File / Path Pattern | Action | Owner (`WP-#`) | Exact Symbol / Logic Changes |
|---|---|---|---|
| `examples/shared/runner-kit/sky.ts` | `MODIFY` | `WP-0` | Extend `gradientSkyOptions(stops, opts?)` to forward 5.7.0 `haze`, `sun`, and `dither: true` |
| `tools/game-checks/lib/index.mjs` & `tools/game-checks/skin-runner.mts` | `MODIFY` | `WP-0` | Fix `checkSkin` invocation buffer/arg handling; prune `AUTOPLAY_INLINE_ALLOWLIST` entries as games migrate to `readAutoplayFlag` |
| `apps/showcase-top-tennis/index.html`, `examples/aura-slam/{index.html,view/*,ui/*}` | `MODIFY` | `WP-1` | Enable `SUN_SHADOW_FIT`+`softness`, `sky.gradient`, `createFlipbookAtlas`, `HUD_THEMES["sports-broadcast"]`, full-bleed 390px canvas, `page-parity` sync |
| `apps/showcase-aura-hoops-3d/{index.html,src/*}`, `evidence/game-upgrades-47/aura-hoops-3d/luma-after.json` | `MODIFY` | `WP-1` | `COURT_KEY_SHADOW` `fit`+`softness`, `sky.gradient`, per-court LUT, `crop:lamp` QA crop fix, `viewport-fit=cover`, hide controls hint on modal |
| `apps/showcase-aura-diamond-3d/{index.html,art/look.ts,src/*}` | `MODIFY` | `WP-1` | Enable `KEY_SHADOW_RANGE` `fit`+`softness`, `createGradingLut`, `effects.flipbook`, `createHumanoidAnimator`, fix 390px pitch-pill overlap & dead font link |
| `apps/showcase-aura-fc-3d/{index.html,src/*}`, `evidence/game-upgrades-47/aura-fc-3d/luma-after.json` | `MODIFY` | `WP-1` | Enable `HYBRID_SHADOW_EXTENT` `fit`+`softness`, `sky.gradient`, default-on LUT, `crop:flood-bank` QA crop fix, delete `registerFcHudFonts`, goal/ticker separation |
| `apps/showcase-aura-links-3d/{index.html,src/*}` | `MODIFY` | `WP-1` | `keyShadowFor` `softness`+`fit`, hide `golfer-shadow` blob, `createGradingLut`, `createHumanoidAnimator`, frosted 3-click swing capsule, PGA results card, `viewport-fit=cover` |
| `apps/showcase-roadster-rush/{index.html,src/*}` | `MODIFY` | `WP-2` | Fix asphalt glare AA, `shadow.fit`+`softness`, 5.7.1 clearcoat PBR, populate billboards, `effects.flipbook`, `HUD_THEMES["motorsport"]`, `createSnapshotInterpolator`, `createAutoplayHarness` |
| `apps/showcase-heatsink/{index.html,src/*}` | `MODIFY` | `WP-2` | Stylized `sky.gradient`, `KEY_SHADOW` `fit`+`softness`, drone clearcoat+emissive, fix 1280px quickbar & 390px `BOOST PAD` overlap, `HUD_THEMES["sci-fi-telemetry"]` |
| `apps/showcase-teleoperator/{index.html,src/*}` | `MODIFY` | `WP-2` | Fix mid-road shadow seam (`softness: 1.4`+`fit`), `createGradingLut`, `createFlipbookAtlas("ripple")`, `createHumanoidAnimator`, collapse 390px fare/assist stack |
| `apps/showcase-strange-orbit-port/index.html`, `examples/strange-orbit-port/{index.html,world.ts,main.ts,ui.ts,art/*}` | `MODIFY` | `WP-2` | Ground `cgHabitat`, `shadow.softness`, `createGradingLut`, `createHumanoidAnimator`, dock 390px `.gouache-hud` bottom, `page-parity` sync (sim frozen) |
| `apps/showcase-drift-and-deliver-port/index.html`, `examples/drift-and-deliver-port/{index.html,look.ts,sky.ts,textures.ts,idol.ts,main.ts,hud.ts}` | `MODIFY` | `WP-2` | Fix `shiftShadow` road acne (`softness: 2.0`+`fit`), `createGradingLut`, reflective windows, `createHumanoidAnimator`, move `TICKET 01` off vanishing point, `page-parity` sync (sim frozen) |
| `apps/showcase-heatsink-port/index.html`, `examples/heatsink-port/{index.html,world.ts,materials.ts,shaders.ts,meshes.ts,presentation.ts,hud.ts,art/*}` | `MODIFY` | `WP-2` | Lit alloy arches, `shadow.softness`+`fit`, 5.7.1 clearcoat drone, canyon strata, fix `#district` overlap & mobile touch prompt, `page-parity` sync (sim frozen) |
| `apps/showcase-last-train-port/index.html`, `examples/last-train-port/{index.html,world.ts,bands.ts,lights.ts,idolModels.ts,materials.ts,vfx.ts,figures.ts,walkers.ts,presentation.ts,main.ts,enamel.css,art/proceduralModels.ts}` | `MODIFY` | `WP-2` | Fix `llTram` glass artifacts (`studioGlass`+clearcoat), `shadow.softness`+`fit`, `agx`+LUT, `createHumanoidAnimator`, 112px mobile `#lean`, `createSnapshotInterpolator`, `page-parity` sync (sim frozen) |
| `apps/showcase-roadster-hours-port/index.html`, `examples/roadster-hours-port/{index.html,world.ts,roadsterRig.ts,main.ts,hud.ts,art/*}` | `MODIFY` | `WP-2` | 5.7.1 lacquer PBR, `shadow.fit`, parent-local `swDriver`+`createHumanoidAnimator`, remove duplicate `.credit`, smoked-glass 390px controls, `page-parity` sync (sim frozen) |
| `apps/showcase-iron-crown/{index.html,src/*}` | `MODIFY` | `WP-3` | Fight-lane `shadow.fit`+`softness`, warm bokeh crowd, R23 rim lift, flipbook flames/sparks, `createHumanoidAnimator`, `HUD_THEMES["fighting"]`+`hud-tokens.css`, fix `.ic-setup` overlap |
| `apps/showcase-bunker-zero/{index.html,src/*}` | `MODIFY` | `WP-3` | Light-pool contrast+`shadow.softness`, fix 5.7.0 parent-local `visor`/`gun`/`pack`/`hound` scale, bore-aligned muzzle flipbook, live corridor title, dynamic reticle, deduplicate `"AMMO"` |
| `apps/showcase-slingshot-siege/{index.html,route-health.json,src/*}` | `MODIFY` | `WP-3` | Re-key 35 `siege*` -> `ss*`, fix sky + restore tilt-shift `dof.maxBlur`, enable `ISLAND_SHADOW_FIT`+`softness`, `createGradingLut`, delete dead CSS, fix 390px `.ss-coach` overlap, SVG raider crest |
| `apps/showcase-ninja-runner-port/index.html`, `examples/ninja-runner-port/{index.html,districtLook.ts,lighting.ts,world.ts,vfx.ts,main.ts,art/*}` | `MODIFY` | `WP-3` | Rename `proc-sakuraMapleTree` -> `proc-blossomMapleTree`, deduplicate HTML (`page-parity`), depth-threshold ink + spectral clones, `shadow.fit`+`softness`, `HUD_THEMES["ink-scroll"]` (sim frozen) |
| `apps/showcase-pips-big-leap/{index.html,src/*}` | `MODIFY` | `WP-4` | Re-key 6 `showcase*` -> `pip*`, re-enable `shadow.softness`+`fit`, `createGradingLut`, `effects.flipbook`, `HUD_THEMES["storybook"]`, compact 390px quickbar & safe-area touch |
| `apps/showcase-cross-hop/{index.html,src/*}`, `evidence/game-upgrades-47/cross-hop/luma-after.json` | `MODIFY` | `WP-4` | Lower fill + `shadow.softness`+`fit` + `neutralCurve: "khronos"` (`spread >= 145`), critter rim, `hud-tokens.css`, compact 390px quickbar, `createSnapshotInterpolator` |
| `apps/showcase-splat-rush-port/index.html`, `examples/splat-rush-port/{index.html,look.ts,world.ts,main.ts,presentation.ts,hud.ts}` | `MODIFY` | `WP-4` | `shadow.softness`+`fit`, 5.7.1 clearcoat ball, `sky.gradient` haze/dither, `effects.flipbook`, `readAutoplayFlag`+`createAutoplayHarness`, `page-parity` sync (sim frozen) |
| `apps/showcase-serpentine-sky-run-port/index.html`, `examples/saiyan-snake-way-port/{index.html,world.ts,main.ts,presentation.ts,hud.ts,hud.css,art/vfx.ts}` | `MODIFY` | `WP-4` | Runner-following `shadow.fit`+`softness`, stage-contrasting rim, `HUD_THEMES["sky-expedition"]`, `createSnapshotInterpolator`, `page-parity` sync (sim frozen) |
| `apps/showcase-cloud-runner-port/index.html`, `examples/kid-goku-beyond-the-clouds-port/{index.html,world.ts,main.ts,presentation.ts,ui.ts,art/*}` | `MODIFY` | `WP-4` | `shadow.softness`+`fit`, `createGradingLut("cinema-warm")`, `effects.flipbook`, `HUD_THEMES["sky-expedition"]`, boss HP bar, `page-parity` sync (sim frozen) |
| `apps/showcase-shape-shift-sprint/{index.html,src/*}`, `evidence/game-upgrades-47/shape-shift-sprint/{luma-bands.json,luma-after.json}` | `MODIFY` / `CREATE` | `WP-4` | `shadow.softness`+`fit`, 5.7.1 clearcoat, `createGradingLut`+`neutralCurve`, cutout glow + morph hologram, hide `#load-bar`, create `luma-bands.json`/`luma-after.json` |
| `apps/showcase-number-surge/{index.html,src/*}`, `evidence/game-upgrades-47/number-surge/{luma-bands.json,luma-after.json}` | `MODIFY` / `CREATE` | `WP-4` | `shadow.softness`+`fit`, reflective dusk floor, dual-coded gate arches, `createHumanoidAnimator`, Boss Distance pill, hide `#load-bar`, create `luma-bands.json`/`luma-after.json` |
| `apps/showcase-beat-hopper/{index.html,src/*}`, `evidence/game-upgrades-47/beat-hopper/{luma-bands.json,luma-after.json}` | `MODIFY` / `CREATE` | `WP-4` | `shadow.softness`+`fit`, `#ff3b5c` Duck vs `#00f2ff` Jump coding, silent 132 BPM beat rail, `createHumanoidAnimator`, hide `#load-bar`, create `luma-bands.json`/`luma-after.json` |
| `apps/showcase-dot-dash-3d/{index.html,src/*}` | `MODIFY` | `WP-5` | `neutralCurve: "khronos"`, tighten glow discs, indigo-violet frightened ring, `effects.flipbook`, replace stale `REV 5.5`, collapse 390px 13-button bar, `readAutoplayFlag`+`createSnapshotInterpolator` |
| `apps/showcase-where-the-wind-wanders-port/index.html`, `examples/where-the-wind-wanders-port/{index.html,world.ts,daylight.ts,ui.ts,main.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/idolModels.ts}` | `MODIFY` | `WP-5` | 5.7.0 parent-local `hero-idol` rig, `shadow.softness: 2.2`, painterly tree brushwork, deduplicate toast/caption, 3-seal pips, `page-parity` sync (sim frozen) |
| `apps/showcase-silt-and-signal-port/index.html`, `examples/silt-and-signal-port/{index.html,hud-look.ts,main.ts,camera.ts,occlusionFade.ts,presentation.ts,shaders.ts,shaders-wgsl.ts,art/*}` | `MODIFY` | `WP-5` | Extend pier occlusion fade, smooth sky zenith band, `shadow.softness`, `createHumanoidAnimator`, fix 390px `#toast` overlap & `".."` objective & chapter grid, `page-parity` sync (sim frozen) |
| `apps/showcase-splat-turf/{index.html,src/*}`, `evidence/game-upgrades-47/splat-turf/{luma-bands.json,luma-after.json}` | `MODIFY` / `CREATE` | `WP-5` | `shadow.softness: 2.0`, parent-local driver rigs, lane-guided `wetInkRibbonSpec`, animated solvent shader, wet droplet flipbooks, fix `.score-chip` & 390px stack, create `luma-bands.json`/`luma-after.json` |
| `apps/showcase-polarity-orbs/{index.html,src/*}`, `evidence/game-upgrades-47/polarity-orbs/{luma-bands.json,luma-after.json}` | `MODIFY` / `CREATE` | `WP-5` | Dual-coded `+`/`−` orb silhouettes + contact shadows, smooth flux arches, sync 6 Idol assets in `direction.ts`, separate Flip/Mute on 390px, hide `#load-bar`, create `luma-bands.json`/`luma-after.json` |
| `aura.assets.json` (only `pip*` & `ss*` re-keys), `**/art/direction.audit.json`, `public/previews/showcase-index/*.webp`, `marketing/public/previews/showcase-index/*.webp`, `evidence/*/screens/final/*` | `MODIFY` | `WP-6` | Regenerate art-direction audits, run `showcase-port-pages/sync.mjs`, `gen-game-inventory.mjs`, `refresh-catalog-digests.mjs`, `build-card-images.mjs` |

---

## 6. Detailed Phased & Parallelizable Implementation Tasklist (`WP-0..WP-6`)

### `WP-0`: Shared Kit, Runner-Kit & Game-Check Foundations *(Sequential Wave 0 — prerequisite for Waves 1–5)*
1. Extend `examples/shared/runner-kit/sky.ts` (`gradientSkyOptions`) to pass optional `haze`, `sun`, and `dither: true` into `sky.gradient`.
2. Fix `tools/game-checks/lib/index.mjs:458` / `tools/game-checks/skin-runner.mts` so `node tools/game-checks/run.mjs --all` executes `checkSkin` cleanly with zero invocation warnings.
3. Audit `aura.assets.json` entries for `apps/showcase-pips-big-leap` (6 `showcase*` keys) and `apps/showcase-slingshot-siege` (35 `siege*` keys) and prepare the clean `pip*` / `ss*` re-key mapping (preserving exact sha256/provenance/file URLs).

### `WP-1`: Sports Cluster 10/10 Execution (Games 01–05) *(Parallel Wave 1 — disjoint ownership of 5 Sports apps/examples)*
1. Execute Blueprints `01`–`05` (`Aura Slam 3D`, `Aura Hoops 3D`, `Aura Diamond 3D`, `Aura FC 3D`, `Aura Links 3D`): enable `shadow.fit` + `shadow.softness`, add `sky.gradient` / `createGradingLut` / `effects.flipbook` / `createHumanoidAnimator`, fix `crop:lamp` and `crop:flood-bank` QA crop visibility, unify on `HUD_THEMES["sports-broadcast"]` + `hud-tokens.css` + `viewport-fit=cover`, and fix mobile collisions & `page-parity`.
2. Run scoped unit/art-direction tests (`vitest run tests/unit/aura-slam tests/unit/aura-hoops tests/unit/aura-diamond tests/unit/aura-fc-3d tests/unit/aura-links`) and `node tools/game-checks/run.mjs top-tennis aura-hoops-3d aura-diamond-3d aura-fc-3d aura-links-3d`.

### `WP-2`: Racing & Driving Cluster 10/10 Execution (Games 06–13) *(Parallel Wave 1 — disjoint ownership of 8 Racing apps/examples)*
1. Execute Blueprints `06`–`13` (`Apex Overdrive`, `Thermal Drift`, `Grid Dispatch`, `Craterline GP`, `Gridlock Courier`, `Ion Circuit`, `Lamplight Line`, `Saltwind Highway`): run `assets inspect --pbr` on vehicle GLBs and apply 5.7.1 clearcoat parity, fix asphalt glare / road shadow acne / `llTram` window glass / floating `cgHabitat` / black track arches, wire `shadow.softness`+`fit`, `createGradingLut`, `effects.flipbook`, `createHumanoidAnimator`, `createSnapshotInterpolator`, `readAutoplayFlag`+`createAutoplayHarness`, and fix all `390x844` HUD collisions.
2. **Strict Replay Check:** Run all 5 `replay-verified` port unit/replay suites (`strange-orbit-port`, `drift-and-deliver-port`, `heatsink-port`, `last-train-port`, `roadster-hours-port`) confirming zero simulation drift.

### `WP-3`: Action & Combat Cluster 10/10 Execution (Games 14–17) *(Parallel Wave 1 — disjoint ownership of 4 Action apps/examples)*
1. Execute Blueprints `14`–`17` (`Iron Crown`, `Bunker Zero`, `Slingshot Siege`, `Shadowstep Gauntlet`): fix Bunker Zero's 5.7.0 parent-local enemy visor/gun/pack/hound scale & bore-aligned muzzle flash, re-key Slingshot Siege's 35 `siege*` -> `ss*` assets + restore sky & tilt-shift DOF + `ISLAND_SHADOW_FIT`, rename `proc-sakuraMapleTree` -> `proc-blossomMapleTree` + deduplicate Shadowstep Gauntlet HTML + spectral clones + depth-threshold ink, and polish Iron Crown's lighting/sparks/fightpad.
2. **Strict Replay Check:** Run `ninja-runner-port` replay tests plus `iron-crown`, `bunker-zero`, and `slingshot-siege` unit & art-direction suites.

### `WP-4`: Platformers & Runners Cluster 10/10 Execution (Games 18–25) *(Parallel Wave 1 — disjoint ownership of 8 Platformer apps/examples)*
1. Execute Blueprints `18`–`25` (`Pip's Big Leap`, `Cross Hop`, `Splat`, `Serpentine Sky Run`, `Cumulus Dash`, `Shape Shift Sprint`, `Number Surge`, `Beat Hopper`): re-key Pip's 6 `showcase*` -> `pip*` assets + apply `HUD_THEMES["storybook"]`, fix Cross Hop's `luma-band` spread (`>= 145`), upgrade the 3 replay-verified ports (`Splat`, `Serpentine Sky Run`, `Cumulus Dash`) presentation-only, hide stuck `#load-bar` and author `luma-bands.json` on the 3 runner-kit platformers, and wire 5.7.2 shadows/clearcoat/flipbooks/animators/interpolators.
2. **Strict Replay Check:** Run replay tests for `splat-rush-port`, `saiyan-snake-way-port`, and `kid-goku-beyond-the-clouds-port` plus all platformer unit & art-direction suites.

### `WP-5`: Arcade & Exploration Cluster 10/10 Execution (Games 26–30) *(Parallel Wave 1 — disjoint ownership of 5 Arcade apps/examples)*
1. Execute Blueprints `26`–`30` (`Glint Courier`, `The Bellkeeper's Walk`, `Duneglide`, `Splat Turf`, `Polarity Orbs`): fix Duneglide's arch-pier camera occlusion & `#toast` collision, refactor Bellkeeper's `hero-idol` onto 5.7.0 parent-local nesting, dual-code Polarity Orbs' incoming `+`/`−` silhouettes + separate 390px Flip/Mute, fix Splat Turf's stretched `.score-chip`/solvent shader/balloon margin, tune Glint Courier's `neutralCurve: "khronos"` + glow discs + frightened contrast, and author `luma-bands.json` for `splat-turf` and `polarity-orbs`.
2. **Strict Replay Check:** Run replay tests for `where-the-wind-wanders-port` and `silt-and-signal-port` plus all arcade unit & art-direction suites.

### `WP-6`: Integration, Derived Files, Audit Sync & Fresh Evidence *(Sequential Wave 2 — depends on WP-1..WP-5)*
1. Run `node tools/showcase-port-pages/sync.mjs` to synchronize all 11 `*-port` HTML pages and confirm zero `page-parity` warnings.
2. Prune migrated slugs from `AUTOPLAY_INLINE_ALLOWLIST` in `tools/game-checks/lib/index.mjs` so zero stale-allowlist warnings exist.
3. Re-run every modified game's `art-direction.test.ts` to refresh `direction.audit.json` and confirm zero `look-identity` collisions across all 30 games.
4. Run derived site syncs: `node tools/site/gen-game-inventory.mjs`, `node tools/site/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`.

---

## 7. Verification & Acceptance Checklist (`- [ ]`)

### Phase A — `CODE_COMPLETE_GO` Gate (Deterministic & Proportional — Required)
- [ ] **File & Symbol Completeness:** All 30 game blueprints implemented with zero `TODO`s, placeholder stubs, or `apps/showcase-port-shared/{feel,vfx-pack,idol}` shim regressions.
- [ ] **Sharded Typecheck & Lint:** `pnpm typecheck && pnpm lint`
- [ ] **Static Game Checks (Zero Errors, Zero Avoidable Warnings):** `node tools/game-checks/run.mjs --all` reports `0 errors`, `0 borrowed-asset`, `0 page-parity`, `0 brand-identifiers`, `0 skin` runner failures, and `0 stale AUTOPLAY_INLINE_ALLOWLIST` warnings.
- [ ] **Game Runtime & Unit/Replay Suites:** `pnpm check:game-runtime` and targeted `vitest run` suites for all 11 `replay-verified` ports (confirming bit/tolerance-exact sim parity) + all modified `art-direction.test.ts` files pass.
- [ ] **Site & Derived Output Integrity:** `node marketing/scripts/check-site.mjs && node tools/site/gen-game-inventory.mjs --check && node tools/showcase-port-pages/sync.mjs --check`.

### Phase B — Post-`CODE_COMPLETE_GO` Visual, Luma & Real-GPU Acceptance (Batched When Requested)
- [ ] **Production Build:** `pnpm build && pnpm --dir marketing build` (copies admitted GLBs and builds all 30 routes).
- [ ] **Remote Luma Capture (Software GL — Remote Only):** Run `RUN_ID=games-10of10-luma SPECS="tests/browser/game-luma-capture.spec.ts" tools/remote-acr/run.sh`, decode with `node evidence/audit-fix/e5/decode-luma.mjs`, and verify `node tools/look-metrics/region-luma.mjs bands` passes for `aura-hoops-3d`, `aura-fc-3d`, `cross-hop`, `shape-shift-sprint`, `number-surge`, `splat-turf`, `polarity-orbs`, and `beat-hopper` (clearing all 17 `luma-band` warnings).
- [ ] **Batched Real-GPU `?autoplay=1` Acceptance:** Under `/tmp/a3d-rea.lock`, capture all 30 games in headless Chrome (`--headless=new`) via `tools/release/render-gate/cdp-capture.mjs` at `1280x720` and `390x844` (title, early, key action, mid, results + 50 ms motion bursts), verifying 0 console errors, crisp `shadow.fit` / clearcoat / R23 silhouettes, and zero HUD overlap.
- [ ] **Card Images & Freshness:** Commit refreshed final frames (`git add -f evidence/<game>/screens/final/*`), run `node tools/site/build-card-images.mjs`, and confirm `node tools/game-checks/run.mjs --all` clears all 30 `screens-fresh` warnings.
- [ ] **Site-Only Fast-Lane Deploy (Only When Requested):** Ship to Cloudflare Pages (`aura3d.auraone.ai` — never Vercel) per `docs/agents/shipping-and-deploy.md` with zero `/evidence/` leakage, followed by live smoke checks.

---

## 8. Out of Scope & Guardrails

- **Explicitly Out of Scope (`Separate work`):**
  - Modifying `@aura3d/engine`, `@aura3d/rendering`, or `@aura3d/cli` core packages or cutting an npm release / version bump (all upgrades target existing `5.7.2` public APIs).
  - Paid fal.ai 3D mesh re-generation for `aura.skin-allow.json` info-level Idol auto-rig entries unless the owner explicitly approves a fal.ai spend budget (re-keying `borrowed-asset` entries in `Pip's Big Leap` and `Slingshot Siege` reuses already-admitted GLBs first, or flags any replacement needing paid generation).
  - Retired / non-live showcase apps (`showcase-red-zone-3d`, `showcase-meshy-relic-pilot`, `veer-wonder-world`, `vesper-gt`, `ember-courier`).
  - Subjective 120 Hz feel judgment on the owner's physical display (always reported plainly as an owner-only check after `runMotionGate` passes).
- **Execution Invariants:**
  - `@aura3d/*` exclusively for 3D/WebGL/WebGPU (zero Three.js, Babylon.js, PlayCanvas, or Meshy).
  - Zero local Docker and zero local Playwright; remote runner (`tools/remote-acr/run.sh`) or headless Chrome loopback CDP (`tools/release/render-gate/cdp-capture.mjs --headless=new`) only.
  - Licensed self-hosted fonts only (`apps/showcase-port-shared/fonts/` and `packages/game/src/fonts/`).
  - Zero `AskUserQuestion` pauses, zero human sign-off tables, and zero external LLM/Prism critic loops.
