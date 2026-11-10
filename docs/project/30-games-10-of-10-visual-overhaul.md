# Aura3D 5.5.1 — 30 Showcase Games 10/10 Blender Eevee-Grade Visual, VFX, Animation & UI/UX Overhaul Blueprint

> **Execution Mandate (`execute docs/project/30-games-10-of-10-visual-overhaul.md`):** This blueprint is an execution-ready engineering specification covering `WP-00` (shared engine, shader, VFX, motion, and typography foundation) plus individual deep-dives `WP-01` through `WP-30` for all **30 live Aura3D showcase games**. Every API call, shader contract, asset workflow, and verification gate in this document targets **100% standalone `@aura3d/engine` `5.5.1` and `@aura3d/engine/game`**.

---

## 0. Non-Negotiable Architecture, Zero-Three.js & Determinism Contracts

1. **Absolute Zero-Three.js Mandate (Zero Packages, Zero Types, Zero Imports, Zero Bridges):**
   - **Never** install, keep, import, bundle, or reference `three`, `@types/three`, `three/*` (`three/addons/*`, `three/examples/*`, `three/webgpu`, `three/tsl`), `@react-three/fiber`, `@react-three/drei`, `postprocessing`, `troika-three-text`, `window.THREE`, `THREE.*`, `GLTFLoader`, `RGBELoader`, `EffectComposer`, `ShaderMaterial`, `WebGLRenderer`, `aura3d import-three`, or `aura3d migrate three` anywhere in any `package.json` (`dependencies`, `devDependencies`, `peerDependencies`, `optionalDependencies`), `pnpm-lock.yaml`, Vite config, or `.ts`/`.js`/`.html` source file.
   - Audit status today: all 30 live game apps and `examples/*` ports already have **0 `three` dependencies and 0 `three` imports**; `WP-00` removes the last stale internal entry (`"three": "0.185.1"` in `apps/showcase-kits/package.json:8`) and adds a permanent workspace-wide `zero-three` gate so `three` can never re-enter the repository.
2. **100% Verified Native `@aura3d/engine` 5.5.1 API Surface (Zero Hallucinated or Deprecated Exports):**
   - **Color Management & Tone Mapping:** Configure via `createAuraApp(target, { output: { preset, toneMapping: "agx" | "aces" | "neutral" | "reinhard" | "cineon" | "linear" | "none", exposure, dither: true, outputColorSpace: "srgb" | "display-p3" } })` and `app.output?.setOutput(...)` (`packages/engine/src/contracts/output.ts:9-29`). Never call a nonexistent `output.preset(...)` function or pass `"filmic"` to `output.toneMapping` (`TONE_MAPPING_UNKNOWN`).
   - **15 Canonical `looks.preset(id, overrides)` IDs:** `"outdoor-day"`, `"golden-hour"`, `"overcast"`, `"polar-night"`, `"alpine-snow"`, `"product-studio"`, `"interior-neutral"`, `"interior-warm"`, `"interior-industrial"`, `"night-city"`, `"neon-arcade"`, `"arena-fight"`, `"space"`, `"underwater"`, `"character-showcase"` (plus `"plain"`). Never invent look IDs; keep every game `aura3d look lint` clean (zero IBL-flattening `lights.ambient`).
   - **Exact Eevee Post-Stack Option Signatures:**
     - `effects.contactShadows({ length, thickness, steps: 8 | 12 | 16, intensity, lights: "sun" | "shadowed" })`
     - `effects.screenSpaceReflections({ intensity, roughness, maxDistance, thickness })` (`roughness <= 0.35` full strength; `>= 0.5` gates off via `SSR_ROUGHNESS_GATED` — never pass a nonexistent `maxRoughness` key)
     - `effects.ambientOcclusion({ intensity, radius, falloff })` / `effects.contactOcclusion(...)`
     - `effects.depthOfField({ focusDistance, fStop, focalLength, maxBlur })` (WebGPU-batched single encoder)
     - `effects.godRays({ source, intensity, decay, samples: 32 | 48 | 64, color, density, medium })` / `effects.volumetricBeam(...)` / `effects.volumetricFog(...)`
     - `looks.fogForExtent({ extent, color, haze, mode: "exp" | "exp2" })`
   - **World & Crowd Modules (Zero Deprecated 4.x Calls):** Use `world.water`, `world.terrain`, `world.grass`, `world.scatter`, `world.street`, `decals.project` / `decals.projectOntoMesh`, `createCrowd` / `bakeCrowdPoses`, `scatterAlongPath` / `scatterInArea` / `splitScatterByDistance` / `mergeStaticByKey`, and `groundedFittedModelPosition`. Purge legacy `weather.wetGround` (`Aura Hoops 3D`) and never introduce `water.surface`.
   - **Dual-Backend Custom Shaders (`backend: "auto"` WebGPU Default):** Every `material.custom` and `effects.shaderPass` MUST ship **paired GLSL 3.00 + WGSL twins** (`a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`, `examples/shared/wgsl-twins.ts`) so WebGPU (`>= 0.92x` WebGL2 FPS, 0 errors), `?backend=webgl2`, and `?worker=1` render identically.
3. **11-Port Replay-Parity Hard Invariant (`WP-20` through `WP-30`):**
   - For all 11 `replay-verified` ports, deterministic fixed-step simulation modules, RNG draw counts/orders, physics constants, and collision boundaries MUST remain at **0 bytes diff** (`1e-6` to `1e-12` reference trajectory parity verified by each port's `reference-replay.test.ts`). All visual, material, animation, VFX, camera, and HUD upgrades attach strictly to presentation/view layers reading interpolated `Shown` snapshots.
4. **AuraOne Licensed Typography & Mobile Ergonomics Hard Invariant:**
   - **Self-hosted `.woff2` licensed fonts only:** `Whitney` (`400` prose, `500` controls, `600` labels with `tnum` and lowercase `smcp` `>= 12px`), `DIN Pro` (`400`/`500` `tabular-nums` strictly on standalone HUD scores, speeds, timers, and deltas—never body prose), and `Monument Grotesk Mono` (`400` strictly on seeds, hashes, and diagnostic telemetry), with `html { font-synthesis: none }` and `font-weight <= 600` in UI (`GT Walsheim` `400`/`500` optional for game title wordmarks only). Purge all `"Graphik"` / `"Graphik Web"`, `"TT Commons Pro Mono"`, `"Aeonik Pro"`, `Roobert 700`, `GT Walsheim 700/800/900`, `.woff`/`.ttf` legacy files, raw OS emojis, and sub-`12px` labels.
   - **Desktop (`1280x720`) + Mobile (`390x844`) Parity:** Every coarse-pointer interactive control MUST meet `>= 44x44px` with `env(safe-area-inset-*)`, zero HUD-over-HUD or HUD-over-gameplay collisions, and full portrait camera framing.
5. **Site-Only Shipping & Generated-Copy Regeneration (`AGENTS.md` Rules 1, 2, 7):**
   - Never hand-edit generated files: after editing any port in `examples/<port>/`, run `node tools/showcase-port-pages/sync.mjs`; after any app/example edit, run `node tools/agent-examples/refresh-catalog-digests.mjs` and `node tools/site/seo-meta-pass.mjs --check`.
   - Ship live via workspace build (`pnpm build && pnpm --dir marketing build`), real-GPU verification (`tools/remote-acr/run.sh` / loopback CDP), and Cloudflare Pages (`wrangler pages deploy marketing/dist --project-name aura3d --branch main` — never Vercel, no unnecessary npm version bumps).

---

## 1. Executive Architecture & 30-Game Visual Gap Matrix

Portfolio baseline across all 30 live games: **mean current overall score `6.27 / 10`** (range `4.8 / 10` on `Splat Turf` to `7.6 / 10` on `The Bellkeeper's Walk`), elevating every title to **`10.0 / 10`**.

| WP | Title | App / Canonical Source | Mode | Light / Post | Mat / Assets | VFX / Anim | UI / Type | Perf / GPU | **Current** | **Target** | #1 Screenshot- & Source-Verified Bottleneck |
|---|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|
| **WP-01** | **Aura Slam 3D** | `apps/showcase-top-tennis` + `examples/aura-slam` | `playable` | 7.0 | 5.6 | 6.4 | 5.8 | 7.8 | **6.5** | **10.0** | LEGO-brick grandstand blocks + opaque black wall net + `"Graphik"`/`8px` HUD & `390x844` modal occlusion |
| **WP-02** | **Aura Hoops 3D** | `apps/showcase-aura-hoops-3d` | `playable` | 6.8 | 5.2 | 6.0 | 4.8 | 7.6 | **6.1** | **10.0** | `390x844` camera aims at empty court + detached sphere shoulders + empty grey void horizon + deprecated `weather.wetGround` |
| **WP-03** | **Aura Diamond 3D** | `apps/showcase-aura-diamond-3d` | `playable` | 6.4 | 5.0 | 5.8 | 5.4 | 7.8 | **6.1** | **10.0** | Dead grey Harbor sky + smeared AI-artifact outfield arches + cylinder puck mound + missing `390x844` touch pads |
| **WP-04** | **Aura FC 3D** | `apps/showcase-aura-fc-3d` | `playable` | 6.8 | 5.4 | 6.3 | 5.8 | 7.8 | **6.4** | **10.0** | Floating detached roof slabs (`390x844`) + Tic-Tac egg crowd + white frost SSR noise on pitch + drywall goal net |
| **WP-05** | **Aura Links 3D** | `apps/showcase-aura-links-3d` | `playable` | 6.6 | 5.0 | 5.4 | 5.8 | 7.6 | **6.1** | **10.0** | Twisted golfer arm/chest clipping + `0.45m` push-broom clubhead + 8-texel tee shadow + white clay cart & GLSL-only lava |
| **WP-06** | **Apex Overdrive** | `apps/showcase-roadster-rush` | `playable` | 7.2 | 6.6 | 7.4 | 7.0 | 8.5 | **7.2** | **10.0** | Dry matte asphalt lacking SSR/micro-flake car paint + billboard horizon props + `"Graphik"` HUD violations |
| **WP-07** | **Thermal Drift** | `apps/showcase-heatsink` | `playable` | 4.8 | 5.8 | 6.4 | 5.2 | 3.8 | **5.2** | **10.0** | `884`-draw multi-lobe instancing explosion (`19–22 fps`) + GLSL-only `heatHaze` + blown-out flat desert glare |
| **WP-08** | **Grid Dispatch** | `apps/showcase-teleoperator` | `playable` | 6.4 | 5.9 | 7.0 | 6.1 | 6.6 | **6.4** | **10.0** | Flat untextured warehouse grey-box walls + GLSL-only `scanPulse` (`no WGSL`) + washed-out isometric lighting |
| **WP-09** | **Iron Crown** | `apps/showcase-iron-crown` | `playable` | 6.6 | 6.0 | 7.2 | 6.2 | 8.2 | **6.7** | **10.0** | GLSL-only `airstripHaze` + plastic single-lobe tank hulls without mud/reactive-armor wear or muzzle god-rays |
| **WP-10** | **Bunker Zero** | `apps/showcase-bunker-zero` | `playable` | 5.8 | 6.3 | 6.2 | 5.6 | 6.8 | **6.1** | **10.0** | Pitch-dark crushed corridors without volumetric flashlight/muzzle bounce + global `DIN Pro` body-prose violation |
| **WP-11** | **Pip's Big Leap** | `apps/showcase-pips-big-leap` | `playable` | 6.2 | 5.0 | 6.4 | 5.6 | 4.5 | **5.5** | **10.0** | `1,138` draws/frame from clearcoat instancing unroll + GLSL-only lava/shimmer + washed-out Meshy diorama props |
| **WP-12** | **Slingshot Siege** | `apps/showcase-slingshot-siege` | `playable` | 4.8 | 4.6 | 6.0 | 4.9 | 5.2 | **5.1** | **10.0** | Untextured primitive wood/stone blocks on flat green slab + zero trajectory glass arc + `Aeonik`/`Graphik` HUD |
| **WP-13** | **Glint Courier** | `apps/showcase-dot-dash-3d` | `playable` | 7.4 | 5.3 | 6.6 | 6.0 | 5.4 | **6.1** | **10.0** | `1,600` wall draws (`200 × 8` clearcoat + probe re-capture bug) + plain box maze corridors & raw `🔊` emoji HUD |
| **WP-14** | **Cross Hop** | `apps/showcase-cross-hop` | `playable` | 6.3 | 5.7 | 5.9 | 6.1 | 8.6 | **6.5** | **10.0** | Split `vivid` (good camera, weak post) vs `diorama` (good post, clipped horizon) + voxel-box critters & matte river |
| **WP-15** | **Shape Shift Sprint** | `apps/showcase-shape-shift-sprint` | `playable` | 6.4 | 6.2 | 6.9 | 7.1 | 9.0 | **7.1** | **10.0** | Abrupt pop-swap between vehicle forms without morph-field VFX + matte track lacking SSR & `GT Walsheim 700` UI |
| **WP-16** | **Number Surge** | `apps/showcase-number-surge` | `playable` | 5.5 | 5.0 | 6.0 | 5.5 | 8.5 | **5.8** | **10.0** | Flat sticker quad on cyan circle ball + cardboard box math gates/walls under `toneMapping: "none"` |
| **WP-17** | **Splat Turf** | `apps/showcase-splat-turf` | `playable` | 5.5 | 5.0 | 5.5 | 5.5 | **2.5** | **4.8** | **10.0** | **5–10 fps** (`99k`-vert CPU `refreshBounds` + `OPEN_BOUNDS` shadow leak + `7,200` paint quads) + dry seamed paint |
| **WP-18** | **Polarity Orbs** | `apps/showcase-polarity-orbs` | `playable` | 6.0 | 5.5 | 5.8 | 5.8 | 8.2 | **6.0** | **10.0** | `mixRgb` turns player orb ambiguous lavender-purple mid-flip + flat washer shockwave + muddy dusk fog |
| **WP-19** | **Beat Hopper** | `apps/showcase-beat-hopper` | `playable` | 6.8 | 5.8 | 6.4 | 5.6 | 8.6 | **6.4** | **10.0** | Tic-Tac capsule + 9 floating pink headphone cubes + `#popups` blocking horizon obstacles + `390x844` arch clip |
| **WP-20** | **Craterline GP** | `apps/showcase-strange-orbit-port` → `examples/strange-orbit-port` | `replay-verified` | 7.0 | 6.0 | 6.6 | 5.5 | 8.6 | **6.7** | **10.0** | Floating D20 dodecahedron rocks & chopstick spires + frozen statue riders + colliding `"Graphik Web"` HUDs |
| **WP-21** | **Gridlock Courier** | `apps/showcase-drift-and-deliver-port` → `examples/drift-and-deliver-port` | `replay-verified` | 6.0 | 5.0 | 6.0 | 5.5 | 7.8 | **5.8** | **10.0** | Grey-beige single-material city blocks + dry non-SSR intersections + boxy van without suspension roll/brake glow |
| **WP-22** | **Ion Circuit** | `apps/showcase-heatsink-port` → `examples/heatsink-port` | `replay-verified` | 5.2 | 4.5 | 6.0 | 4.5 | 8.0 | **5.2** | **10.0** | Flat untextured canyon ribbons + unlit matte hover-craft + bare monospace/system HUD lacking thermal telemetry |
| **WP-23** | **Shadowstep Gauntlet** | `apps/showcase-ninja-runner-port` → `examples/ninja-runner-port` | `replay-verified` | 5.8 | 4.8 | 6.8 | 5.0 | 6.8 | **5.6** | **10.0** | Faceless mannequin rooftops + flat grey Pagoda silhouettes + matte wet tiles without moonlit SSR or katana trails |
| **WP-24** | **Lamplight Line** | `apps/showcase-last-train-port` → `examples/last-train-port` | `replay-verified` | 6.5 | 5.2 | 5.8 | 5.8 | 6.2 | **5.8** | **10.0** | Per-frame `update: "once"` cubemap re-capture stall + flat dark coach exterior + un-volumetric lantern cones |
| **WP-25** | **Saltwind Highway** | `apps/showcase-roadster-hours-port` → `examples/roadster-hours-port` | `replay-verified` | 6.5 | 5.6 | 6.2 | 6.0 | 8.2 | **6.3** | **10.0** | GLSL-only `roadPass` (`no WGSL`) + flat coastal cliff bands + global `DIN Pro` UI prose violation |
| **WP-26** | **Splat** | `apps/showcase-splat-rush-port` → `examples/splat-rush-port` | `replay-verified` | 7.2 | 6.5 | 7.4 | 6.6 | 8.5 | **7.2** | **10.0** | Dry vertex-tinted track surface lacking wet-ink meniscus specular/SSR + unlicensed HUD font fallbacks |
| **WP-27** | **Serpentine Sky Run** | `apps/showcase-serpentine-sky-run-port` → `examples/saiyan-snake-way-port` | `replay-verified` | 7.3 | 6.4 | 6.8 | 6.7 | 8.2 | **7.0** | **10.0** | Repetitive uniform stone-scale segments + flat yellow cloud sea lacking volumetric SSS rim glow |
| **WP-28** | **The Bellkeeper's Walk** | `apps/showcase-where-the-wind-wanders-port` → `examples/where-the-wind-wanders-port` | `replay-verified` | 7.8 | 6.8 | 8.0 | 7.4 | 8.4 | **7.6** | **10.0** | Distant hillside LOD pop + uniform grass roughness lacking wind-gust sheen waves & bell-chime shockwave refraction |
| **WP-29** | **Duneglide** | `apps/showcase-silt-and-signal-port` → `examples/silt-and-signal-port` | `replay-verified` | 7.6 | 6.3 | 7.2 | 7.1 | 8.3 | **7.2** | **10.0** | GLSL-only `ringSpec` & `?water=glsl` lacking WGSL twins + smooth sand lacking micro-glint & slipface ripples |
| **WP-30** | **Cumulus Dash** | `apps/showcase-cloud-runner-port` → `examples/kid-goku-beyond-the-clouds-port` | `replay-verified` | 7.4 | 6.2 | 7.8 | 6.5 | 8.1 | **7.1** | **10.0** | Opaque marshmallow cloud puffs lacking anisotropic forward-scattered silver-lining SSS + sky-temple PBR polish |

---

## 2. `WP-00` — Shared Cross-Game Visual, Shader, VFX & HUD Foundation (100% Native Aura3D 5.5.1)

Before dispatching per-game swarms across `WP-01`..`WP-30`, execute `WP-00` once so every systemic engine bottleneck, dual-backend WGSL chunk, KTX2 VFX flipbook, motion-gate helper, and licensed `.woff2` HUD token sheet is available workspace-wide with zero duplication.

### `WP-00.1` — Multi-Lobe `InstancedPBRMaterial` & Reflection-Probe `update: "once"` Fix (`packages/engine`, `packages/rendering`)
- **Root-Cause Defect Verified in Source:**
  1. In `packages/engine/src/agent-api/compiler/primitives.ts:845, 978` and `packages/rendering/src/passes/ForwardPass.ts:1954`, any `instances.*` node whose material enables `clearcoat > 0`, `sheen > 0`, `transmission > 0`, `iridescence > 0`, or procedural maps sets `declaresExtension = true` and **unrolls `N` instances into `N` separate draw calls** across the forward pass, every shadow cascade, and all 6 reflection-probe faces (`Pip's Big Leap` = `1,138` draws/frame; `Glint Courier` = `200 × 8 = 1,600` wall draws; `Thermal Drift` = `884` draws).
  2. In `Glint Courier` (`showcase-dot-dash-3d`) and `Lamplight Line` (`last-train-port`), `environments.capture({ update: "once" })` re-captures 6 cubemap faces whenever dynamic scene descriptors rebuild on tick.
- **Native Aura3D Fix:**
  - Extend `InstancedPBRMaterial` (both GLSL 3.00 and WGSL pipelines in `packages/rendering`) to evaluate **`clearcoat`, `clearcoatRoughness`, `sheen`, `sheenColor`, `sheenRoughness`, and tangent-space normal maps in a single GPU-instanced draw call** (`declaresExtension = false` for clearcoat/sheen/normal), collapsing `800–1,600` unrolled draws down to `1–4` instanced draws!
  - Key `environments.capture({ update: "once" })` cubemap bakes by explicit `(probeId, resolution, staticEnvironmentSignature)` so per-frame dynamic actor updates never trigger 6-face re-captures unless `app.probes?.refresh(id)` is explicitly invoked.

### `WP-00.2` — `runner-kit` Tight Bounds, Fast Dirty-Upload & GPU RGBA8 Splat-Map Helper (`examples/shared/runner-kit`, `packages/engine`)
- **Root-Cause Defect Verified in Source:** `examples/shared/runner-kit/batch.ts:99` hardcodes `OPEN_BOUNDS` (disabling frustum culling and leaking `215k` dynamic vertices into directional shadow cascades when `castShadow` defaults to `true`), while `handle.updateAttribute("position", ...)` (`packages/engine/src/agent-api/compiler/primitives.ts:1414`) validates every float twice in JS and scans `99,000+` vertices on CPU via `Geometry.refreshBounds()` every frame.
- **Native Aura3D Fix:**
  - Add `bounds?: AuraBounds` + automatic tight-corridor AABB computation to `Batch`, default `castShadow: false, receiveShadow: false` on `Batch` helpers unless explicitly opted in, and add `{ skipBoundsRefresh?: boolean, dirtyVertexRange?: [number, number] }` to `updateAttribute(...)`.
  - Add `createScrollingChunkRing` (mounting static corridor props via periodic `instances.*` groups scrolled via `setPosition`) and `createGpuSplatMap({ width, height })` wrapping native `texture.data({ format: "rgba8", colorSpace: "linear" })` for single-draw wet-paint/scorch/tire-mark surfaces (`WP-17` Splat Turf, `WP-26` Splat, `WP-06` Apex Overdrive).

### `WP-00.3` — Paired GLSL 3.00 + WGSL Shader Twin Library (`examples/shared/wgsl-twins.ts` & `apps/showcase-port-shared/shaders/`)
- Extend `examples/shared/wgsl-twins.ts` and `apps/showcase-port-shared/shaders/` (built on native `a3d_math`, `a3d_noise`, `a3d_sky`, `a3d_fog`, `a3d_toon`) with unit-tested, pixel-matched GLSL 3.00 + WGSL pairs:
  1. `DUAL_HEAT_HAZE_PASS` (`effects.shaderPass` screen-space refractive shimmer — fixes WebGPU gaps in `WP-07` Thermal Drift, `WP-09` Iron Crown, `WP-11` Pip's Big Leap).
  2. `DUAL_SCAN_PULSE_PASS` (`effects.shaderPass` world-depth sonar/tactical wave — fixes `WP-08` Grid Dispatch & `WP-10` Bunker Zero).
  3. `DUAL_WOVEN_CORD_NET` (`material.custom` derivative-antialiased alpha-hashed sports/chain-link net + impact ripple — powers `WP-01` Aura Slam, `WP-02` Aura Hoops, `WP-04` Aura FC).
  4. `DUAL_WET_MENISCUS_PAINT` (`material.custom` `texture.data` height-gradient normal + clearcoat acrylic specular — powers `WP-17` Splat Turf & `WP-26` Splat).
  5. `DUAL_VORONOI_MICRO_SPARKLE` (`material.custom` metallic-flake car paint, lunar agglutinate glass beads, desert silica, and snow glint — powers `WP-05`, `WP-06`, `WP-20`, `WP-29`).
  6. `DUAL_ANISOTROPIC_CLOUD_SSS` (`material.custom` Henyey-Greenstein silver-lining forward scatter — powers `WP-27` Serpentine Sky Run & `WP-30` Cumulus Dash).

### `WP-00.4` — Shared KTX2 Flipbook VFX, AgX/ACES `.cube` LUTs & Curated HDRI Pack (`packages/game`, `public/vfx/`, `public/luts/`, `public/hdri/`)
- Admit via `aura3d assets add --type texture` (KTX2 UASTC/BC7 compressed, `0` Three.js loaders) a shared cross-game pack registered through `@aura3d/engine/game`:
  - **8 `8×8` KTX2 Flipbook Sprite Sheets (`effects.flipbook`):** `vfx-fireball-explosion`, `vfx-plasma-electric-arc`, `vfx-wet-paint-splat`, `vfx-water-foam-splash`, `vfx-tire-drift-smoke`, `vfx-turf-chalk-divot`, `vfx-anime-impact-star`, `vfx-muzzle-shock-flash`.
  - **8 `.cube` 3D Grading LUTs (`effects.colorGrade({ lut })`):** `agx-punchy-sports`, `agx-neon-synth`, `agx-desert-chrome`, `agx-noir-rain`, `agx-gouache-lunar`, `agx-ghibli-meadow`, `agx-arctic-aurora`, `agx-tactical-amber`.
  - **6 Compact `1K/2K` `.hdr` Lighting Environments (`environments.hdri`):** studio softbox automotive, floodlit stadium night, coastal golden-hour cliff, overcast alpine links, industrial hangar, and twilight synth horizon (`background: false`, lighting-only with sky dome/Preetham backdrop).

### `WP-00.5` — High-Refresh Presenter, Camera Clearance & Impact Feel Kit (`packages/game`, `apps/showcase-port-shared/`)
- Provide drop-in helpers in `apps/showcase-port-shared/feel.ts` re-exporting `@aura3d/engine/game`:
  - `mountHighRefreshPresenter` (`createFixedStepPresenter` + `runMotionGate` asserting `0%` stalled frames at `60 / 120 / 144 Hz`).
  - `mountSmartFollowCamera` (`createCameraClearance` + `createOccluderFade` + aspect-aware portrait `390x844` vertical/horizontal FOV solver so mobile cameras never crop out players or goals).
  - `mountImpactChoreography` (`createHitStop` auto-zeroed when `prefers-reduced-motion: reduce`, `createJuice`, `createCameraShake`, and `createFootSlideMeter`).

### `WP-00.6` — Canonical AuraOne `.woff2` HUD Typography Sheet & Workspace Zero-`three` Gate (`apps/common/src/fonts.css`, `apps/showcase-port-shared/hud-tokens.css`)
- Publish `apps/showcase-port-shared/hud-tokens.css` imported by all 30 games:
  - Self-hosted `.woff2` `@font-face` declarations for **`Whitney`** (`400`, `500`, `600`), **`DIN Pro`** (`400`, `500`), and **`Monument Grotesk Mono`** (`400`) with `html { font-synthesis: none; -webkit-font-smoothing: antialiased; }`.
  - Semantic CSS classes: `.a3d-hud-prose` (`Whitney 400/500`), `.a3d-hud-eyebrow` (`Whitney 600`, `font-size: max(12px, 0.75rem)`, lowercase source + `font-feature-settings: "smcp" 1, "tnum" 1`), `.a3d-hud-metric` (`DIN Pro 500`, `font-variant-numeric: tabular-nums`), `.a3d-hud-code` (`Monument Grotesk Mono 400`, `font-size >= 12px`), and `.a3d-touch-btn` (`min-width: 44px; min-height: 44px`, safe-area aware, SVG icons replacing all raw OS emojis).
- Remove `"three": "0.185.1"` from `apps/showcase-kits/package.json:8` and add `tools/game-checks/checks/no-three-anywhere.mjs` failing CI if `three`, `@types/three`, `three/*`, `@react-three/*`, `postprocessing`, or `troika-three-text` appears in any workspace manifest or game source file.

### `WP-00` Executable Checklist (`- [ ]`) & Swarm Dispatch Wave Plan
- [ ] **`WP-00.1`:** Upgrade `InstancedPBRMaterial` in `packages/rendering` + `packages/engine/src/agent-api/compiler/primitives.ts` for single-draw instanced `clearcoat` / `sheen` / normal maps (GLSL 3.00 + WGSL), and cache `environments.capture({ update: "once" })` cubemaps against dynamic tick rebuilds.
- [ ] **`WP-00.2`:** Upgrade `examples/shared/runner-kit/batch.ts` with tight frustum bounds, `castShadow: false` defaults, dirty-range `skipBoundsRefresh` attribute updates, `createScrollingChunkRing`, and `createGpuSplatMap` (`texture.data` RGBA8).
- [ ] **`WP-00.3`:** Add the 6 paired GLSL 3.00 + WGSL shader modules to `examples/shared/wgsl-twins.ts` + `apps/showcase-port-shared/shaders/` with shader-compile unit tests on both backends.
- [ ] **`WP-00.4`:** Admit and typegen the shared KTX2 `8×8` flipbook pack, 8 `.cube` LUTs, and 6 `.hdr` environments via `@aura3d/cli`.
- [ ] **`WP-00.5`:** Add `apps/showcase-port-shared/feel.ts` (`mountHighRefreshPresenter`, portrait-safe `mountSmartFollowCamera`, `mountImpactChoreography`).
- [ ] **`WP-00.6`:** Ship `apps/showcase-port-shared/hud-tokens.css` (`.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, `font-synthesis: none`, `>= 12px` floor, `>= 44px` touch buttons), delete `"three"` from `apps/showcase-kits/package.json:8`, and enable `no-three-anywhere.mjs` in `tools/game-checks/run.mjs`.
- [ ] **Conflict-Free Parallel Execution Order:**
  1. **Wave 0 (Serial Prerequisite):** Complete & test `WP-00` (`pnpm build && pnpm test:unit`).
  2. **Waves 1–6 (Parallel Disjoint Game Swarms — Zero Shared-File Contention):** Dispatch up to 30 isolated game workers in parallel across `WP-01`..`WP-30` (each worker owns exclusively its `apps/showcase-<slug>/` and mapped `examples/<port>/` directory; port workers never touch frozen deterministic sim files).
  3. **Wave 7 (Parent Integration & Site-Only Ship):** Parent runs `node tools/showcase-port-pages/sync.mjs`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, full 30-game `node tools/game-checks/run.mjs <slug>` + remote real-GPU WebGPU/WebGL2/`1280x720`/`390x844` qualification via `tools/remote-acr/run.sh`, `pnpm build && pnpm --dir marketing build`, and Cloudflare Pages deployment (`wrangler pages deploy marketing/dist --project-name aura3d --branch main`).

---

## 3. Per-Game 10/10 Overhaul Blueprints (`WP-01` through `WP-30`)

## WP-01 — Aura Slam 3D (`showcase-top-tennis` + `examples/aura-slam`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-top-tennis/` (`@aura3d/showcase-top-tennis`) mounting `examples/aura-slam/` (**standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `examples/aura-slam/{main.ts,index.html}`, `examples/aura-slam/view/{renderer.ts,scene.ts,lighting.ts,venueRuntime.ts,crowd.ts,ball.ts,boards.ts,vfx.ts}`, `examples/aura-slam/shell/{presentation.ts,bootProgress.ts}`, `examples/aura-slam/ui/styles.css`.
- **Evidence Reviewed (`evidence/aura-slam/screens/final/`):** `1280-01-title.jpg`, `1280-03-action.jpg`, `1280-04-mid.jpg`, `390-01-title.jpg`, `390-03-action.jpg`.
- **Current Scores:** Lighting/Post `7.0` | Materials/Assets `5.6` | VFX/Animation `6.4` | UI/UX/Typography `5.8` | Perf/WebGPU `7.8` → **Overall: `6.5 / 10`** (`backend: "auto"` WebGPU enabled; `?worker=1` and reversed depth not yet wired).
- **Screenshot-Verified Defects:**
  1. **LEGO-Brick Voxel Grandstand Crowd & Box Courtside Furniture (`1280-03-action.jpg`, `390-03-action.jpg`):** Both grandstands in `view/crowd.ts` render as dense rows of unarticulated rectangular colored LEGO blocks, the umpire chair is 4 untextured brown/black boxes, and the playerside bench is a single bare brown box.
  2. **Opaque Black Wall Tennis Net & Solid Racket Heads (`1280-03-action.jpg`):** The center net renders as an opaque solid black slab with a jagged stair-stepped white tape top—zero see-through woven cord mesh, zero center strap buckle, and zero translucent racket string beds.
  3. **Blocky Mannequin Athletes & `rigparity` Ambient Flattening (`1280-03-action.jpg`, `view/rigparity/main.ts:62`):** Athletes have stiff low-poly cylinder limbs with zero jersey cloth ripple or follow-through torso twist; `rigparity/main.ts:62` still mounts `lights.ambient` and forces `pixelRatio: 1`.
  4. **Typography Violations & `390x844` Modal Occlusion (`apps/showcase-top-tennis/index.html:34-118`, `examples/aura-slam/ui/styles.css:26-742`, `390-03-action.jpg`):** Loads prohibited marketing-only `"Graphik"` and `"TT Commons Pro Mono"`, uses `font-weight: 700/800` and `8px` `.slam-set-label`, and on `390x844` the `HOW TO PLAY` overlay occludes the entire upper stadium and LED boards.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output, Reversed Depth & Display-P3 (`examples/aura-slam/main.ts`, `view/venueRuntime.ts`):** Default `output: { preset: venuePreset, toneMapping: "agx", exposure: plan.output.exposure, dither: true, outputColorSpace: resolveGamut() }` with `depthBufferMode: "reversed"` across all 6 Grand Slam venues (NY Hard, London Grass, Paris Clay, Melbourne Dusk, Tokyo Neon, Monte Carlo Golden Hour); purge `lights.ambient` from `view/rigparity/main.ts:62` (`aura3d look lint` clean).
- **Venue-Calibrated HDRI,IES Floodlights & Eevee Post (`view/lighting.ts`, `view/scene.ts`):** Pair per-venue `looks.preset` (`"night-city"` NY Night, `"outdoor-day"` Wimbledon Grass, `"golden-hour"` Roland-Garros Clay) + `environments.hdri` (`intensity: 0.85, background: false`) + 2-cascade `2048` `lights.key` + stadium tower `lights.spot` with Type-C IES flood profiles, `effects.contactShadows({ length: 0.35, thickness: 0.08, steps: 16, intensity: 0.85, lights: "sun" })`, `effects.ambientOcclusion({ intensity: 0.55, radius: 0.75 })`, **`effects.screenSpaceReflections({ intensity: 0.48, roughness: 0.28 })`** (acrylic hard-court sheen reflecting net tape, athletes, and LED ribbon boards!), WebGPU-batched `effects.depthOfField` on serve setup/replays, `effects.volumetricBeam` on night floodlight towers, and `effects.cinematicBloom({ intensity: 0.28, threshold: 0.84 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Paired GLSL 3.00 + WGSL Alpha-Hashed Woven Tennis Net & String-Bed Shader (`examples/aura-slam/view/`):** Replace the opaque black net slab with a beveled `material.brushedMetal` post pair, `material.fabric` white canvas top headband + center tension strap, and a **paired GLSL 3.00 + WGSL `material.custom` woven-cord net shader** (`netMeshSpec`: sub-pixel derivative-filtered `4.2 cm` square cord grid with grazed specular rim and ball-impact elastic ripple uniform `uNetImpact`!). Apply a matching derivative-antialiased gut string-bed shader to both `material.clearcoatPaint` carbon-graphite rackets.
- **Multi-Surface Court Micro-PBR (`view/scene.ts`):** Author distinct surface materials per venue: cushioned US Open acrylic (`material.physical` fine silica normal + `roughness: 0.32` in service boxes vs `0.46` baseline wear), Paris crushed red brick clay (`material.physical` + normal-mapped slide grooves via `decals.project`), and Wimbledon striped perennial ryegrass (`material.physical` two-tone mower stripe anisotropy + `sheen: 0.35`).
- **Baked Silhouette Crowd & Sculpted Courtside Set Pieces (`view/crowd.ts`, `view/scene.ts`):** Replace LEGO-brick crowd blocks with `createCrowd` / `bakeCrowdPoses` seated spectator silhouettes (`instances.model` upper-torso/head/hat clusters swaying between points and standing on aces/set points), and replace the 4-box umpire chair + brown box bench with admitted, KTX2-retextured `umpireChair`, `playerBench`, `courtCooler`, and `lineJudge` props.

### 4. Animation, Camera Choreography & Game Juice
- **Rigged Split-Step, Torso Coil & Footwork (`examples/aura-slam/view/`, `shell/presentation.ts`):** Upgrade athlete rigs to `AnimationController` layered clips (`idle-bounce`, `split-step`, `forehand-topspin`, `two-hand-backhand`, `kick-serve-arch`, `overhead-smash`) + `createLocomotion` (`createFootSlideMeter` `< 0.04 m/s`) + racket `attachToBone("RightHand")` + clay slide dust `effects.particles`.
- **120/144 Hz Presenter & Broadcast Impact (`shell/presentation.ts`, `view/vfx.ts`):** Keep `createFixedStepPresenter` zero-stall at 120/144 Hz, add `createHitStop` (`28 ms` on flat winner / `42 ms` on overhead smash), `createJuice` micro-FOV punch on `> 195 km/h` first serves, felt fuzz `effects.flipbook` burst at sweet-spot contact, and Hawk-Eye close-call zoom replay on lines within `< 4 cm`.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **Purge `"Graphik"` & `"TT Commons Pro Mono"` (`apps/showcase-top-tennis/index.html`, `examples/aura-slam/index.html`, `examples/aura-slam/ui/styles.css`):** Self-host `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px`—fixing the `8px` `.slam-set-label`!), `DIN Pro` (`500` `tabular-nums` on `15 / 30 / 40 / AD`, `km/h` serve radar, set games), and `Monument Grotesk Mono` (`400` on seed/shot telemetry), removing all `700`/`800` weights and setting `html { font-synthesis: none }`.
- **Non-Occluding `390x844` Onboarding & Touch Ergonomics:** Replace the stadium-blocking `HOW TO PLAY` modal on `390x844` with a compact bottom-docked 3-step coach strip above the `>= 44x44px` safe-area joystick + `HIT` / `TOP` / `SLICE` / `LOB` radial shot buttons; sync wrapper via `node tools/showcase-port-pages/sync.mjs` if touched.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Enable `output: { toneMapping: "agx", dither: true, outputColorSpace }` + `depthBufferMode: "reversed"`, serialize rig state cleanly for `?worker=1` worker rendering, and remove `lights.ambient` in `examples/aura-slam/view/rigparity/main.ts` (`aura3d look lint` clean).
- [ ] Replace the opaque black net wall and solid rackets with paired GLSL 3.00 + WGSL derivative-filtered woven net (`uNetImpact`) and racket string-bed shaders; upgrade `view/crowd.ts` LEGO bricks to `bakeCrowdPoses` spectator silhouettes and admit sculpted umpire chair + player bench GLBs.
- [ ] Layer `AnimationController` split-step/stroke clips + `createFootSlideMeter` + `createHitStop` + felt-burst VFX on sweet-spot strikes.
- [ ] Purge `"Graphik"` and `"TT Commons Pro Mono"` across `apps/showcase-top-tennis/` and `examples/aura-slam/`, enforce `>= 12px` `Whitney`/`DIN Pro`/`Monument Grotesk Mono` `.woff2` tokens, and dock `HOW TO PLAY` non-occludingly on `390x844`.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-top-tennis typecheck && pnpm --filter @aura3d/showcase-top-tennis build`, `pnpm vitest run tests/unit/aura-slam`, `node tools/game-checks/run.mjs top-tennis`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2, `?worker=1`, 0 errors, `1280x720` & `390x844` captures).

---

## WP-02 — Aura Hoops 3D (`showcase-aura-hoops-3d`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-aura-hoops-3d/` (`@aura3d/showcase-aura-hoops-3d`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-aura-hoops-3d/src/{main.ts,courtRigs.ts,hoopMaterials.ts,setPieces.ts,crowd.ts,dribble.ts,locomotionRates.ts,headLook.ts,broadcast.ts,diegetic.ts,fxPack.ts,photometric.ts}` + `apps/showcase-aura-hoops-3d/index.html` + `public/fonts/hoops-fonts.css`.
- **Evidence Reviewed (`evidence/aura-hoops-3d/screens/final/`):** `1280x720/01-title.jpg`, `1280x720/03-action-03-route-showcase-aura-hoops-3d-state-p.jpg`, `1280x720/04-mid.jpg`, `390x844/04-mid.jpg`.
- **Current Scores:** Lighting/Post `6.8` | Materials/Assets `5.2` | VFX/Animation `6.0` | UI/UX/Typography `4.8` | Perf/WebGPU `7.6` → **Overall: `6.1 / 10`**.
- **Screenshot-Verified Defects:**
  1. **Catastrophic `390x844` Portrait Camera Framing & Scoreboard Collision (`390x844/04-mid.jpg`):** In portrait play, the broadcast camera points at empty asphalt and white bleacher steps with **zero players and zero hoop visible in frame**, while the floating `MENU` pill physically overlaps `SHN / 0 / BALL` inside the top-right scoreboard!
  2. **Empty Grey Void Horizon & Deprecated `weather.wetGround` (`1280x720/03-action-03...jpg`, `src/courtRigs.ts:716`):** Rucker Park's asphalt slab terminates abruptly into an empty grey void with bare white stepped boxes and a giant gold trophy sitting under the stanchion; `courtRigs.ts:716` still calls deprecated `weather.wetGround(...)`.
  3. **Detached Marshmallow Sphere Shoulders & Clay-Doll Faces (`1280x720/03-action-03...jpg`):** Streetballers exhibit disconnected white sphere shoulder caps sticking out from their torsos, stiff arm planes, and painted black eyebrow triangles; the hoop lacks dynamic chain/nylon net physics.
  4. **Prohibited Fonts & Low-Contrast Header (`public/fonts/hoops-fonts.css:4-6`):** Aliases `"Hoops Calibre"` (`font-weight: 600 900`) and `"Hoops Mono"` (`hoops-tt-commons-pro-mono-400.woff2`), and the top-left `QUICK PLAY` orange-on-grey badge fails contrast.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output, Reversed Depth & IES Sodium Practicals (`src/main.ts:1050`, `src/courtRigs.ts`, `src/photometric.ts`):** Configure `output: { preset: courtPostPreset, toneMapping: "agx", exposure: 1.02, dither: true, outputColorSpace: resolveGamut() }`, `depthBufferMode: "reversed"`, and `?worker=1` support; promote the verified Type-C sodium floodlight `photometricProfile` (`src/photometric.ts`) with 2-cascade `lights.key` (`aura3d look lint` clean).
- **Replace Deprecated `weather.wetGround` with Native Micro-Puddle PBR + SSR (`src/courtRigs.ts:714-718`):** Delete `weather.wetGround` completely! Drive rain-slicked courts (Shanghai Neon, Rucker Dusk) via a **paired GLSL 3.00 + WGSL Voronoi puddle-mask + ripple-normal asphalt shader (`material.custom`)** paired with `effects.screenSpaceReflections({ intensity: 0.62, roughness: 0.24, maxDistance: 28 })`, `effects.contactShadows({ length: 0.4, thickness: 0.08, steps: 12, intensity: 0.85, lights: "shadowed" })`, `effects.ambientOcclusion({ intensity: 0.55, radius: 0.55 })`, `effects.volumetricBeam` on overhead court cages, and `effects.cinematicBloom({ intensity: 0.34, threshold: 0.8 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **360° Urban Streetball Enclosures (`src/setPieces.ts`, `src/courtRigs.ts`):** Eliminate the empty grey void horizon across all 6 courts (Rucker, Venice, Athens, Manila, Shanghai, Orbit)! Surround Rucker Park with `world.street` / instanced Harlem brownstone brick facades (`material.physical`), alpha-hashed galvanized chain-link cage fencing (`material.brushedMetal` + derivative-filtered diamond mesh shader), park sycamore trees, and courtside benches (`groundedFittedModelPosition` — moving the gold trophy onto a proper courtside scorer's table!).
- **Seamless Skinned Streetballer Rigs & Jersey Sheen (`src/main.ts`, `src/hoopMaterials.ts`):** Replace the detached marshmallow-shoulder mannequin meshes with unified skinned streetballer GLBs (`aura3d assets assemble-character` / KTX2-retextured kits) shaded with breathable micromesh `material.fabric({ roughness: 0.68, sheen: 0.42 })` jerseys, `material.clearcoatPaint` patent-leather sneakers, `material.studioGlass` tempered polycarbonate backboard (`ior: 1.58` + painted white shooter's square), `material.lacquer` breakaway orange rim, and a **paired GLSL 3.00 + WGSL vertex-deforming chain/nylon swish net shader** (`uSwishImpulse`).

### 4. Animation, Camera Choreography & Game Juice
- **Portrait-Aware Half-Court Broadcast Camera (`src/broadcast.ts`):** Fix the `390x844` empty-court bug by computing aspect-aware framing (`camera.framePose` / dynamic horizontal-to-vertical FOV + baseline-high angle on `aspect < 0.75`) that **guarantees the ballhandler, primary defender, and active rim stay inside the safe play frustum at all times**!
- **Crossover Footwork, Rim Hang & Shot-Release Juice (`src/dribble.ts`, `src/locomotionRates.ts`, `src/fxPack.ts`):** Wrap gameplay state in `createFixedStepPresenter` (120/144 Hz smooth), synchronize `dribble.ts` ball-hand IK contact (`attachToBone`), fire `uSwishImpulse` net whip on clean makes, trigger `createHitStop` (`45 ms` on posterizer dunks & chase-down blocks) + backboard stanchion spring-shake + sneaker squeak court-scuff `decals.project`.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **Purge `"Hoops Calibre"` & `"Hoops Mono"` (`public/fonts/hoops-fonts.css`, `index.html`):** Self-host `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` on scoreboard points, shot clock, release `%`), and `Monument Grotesk Mono` (`400` on court/seed tags) with `html { font-synthesis: none }` and zero `700–900` weights.
- **Fix `MENU` Overlap & Add Arc Shot-Release Meter:** Move the mobile `MENU` button out of the `SHN` score box into the top-right header bar (`>= 44x44px`), fix `QUICK PLAY` pill contrast (`>= 7:1` WCAG AAA), add a crisp diegetic curved **green-window shot-release arc** beside the shooter's hip, and space `PASS / SPRINT / CROSS / SHOOT / HESI` thumb pads ergonomically with `env(safe-area-inset-bottom)`.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Delete deprecated `weather.wetGround` in `apps/showcase-aura-hoops-3d/src/courtRigs.ts:716` and replace with a paired GLSL 3.00 + WGSL puddle-normal asphalt shader + `screenSpaceReflections` + `depthBufferMode: "reversed"` + `?worker=1`.
- [ ] Fix `src/broadcast.ts` portrait `390x844` camera framing so ballhandler + hoop remain 100% framed in `390x844`, and enclose all 6 courts in `src/setPieces.ts` (brownstones, chain-link fence, trees) to eliminate the empty grey void horizon.
- [ ] Replace detached sphere-shoulder player models with unified skinned streetballer GLBs (`material.fabric` jerseys), tempered `material.studioGlass` backboard, and vertex-whipping swish net shader (`uSwishImpulse`) + dunk `createHitStop`.
- [ ] Replace `hoops-fonts.css` with `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, relocate the overlapping `MENU` pill off `SHN` on `390x844`, and add a curved green-release shot meter.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-aura-hoops-3d typecheck && pnpm --filter @aura3d/showcase-aura-hoops-3d build`, `pnpm vitest run tests/unit/aura-hoops-3d`, `node tools/game-checks/run.mjs aura-hoops-3d`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2, `?worker=1`, 0 errors, players + hoop framed in both `1280x720` & `390x844`).

---

## WP-03 — Aura Diamond 3D (`showcase-aura-diamond-3d`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-aura-diamond-3d/` (`@aura3d/showcase-aura-diamond-3d`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-aura-diamond-3d/src/{main.ts,scene.ts,batter-pose.ts,contact.ts,rules.ts,turfTextures.ts,boardTexture.ts,windowTexture.ts}` + `art/{look.ts,vfx.ts}` + `apps/showcase-aura-diamond-3d/index.html`.
- **Evidence Reviewed (`evidence/aura-diamond-3d/screens/final/`):** `1280x720/01-title.jpg`, `1280x720/03-action-03-swing-0-450.jpg`, `390x844/03-action-03-swing-0-450.jpg`.
- **Current Scores:** Lighting/Post `6.4` | Materials/Assets `5.0` | VFX/Animation `5.8` | UI/UX/Typography `5.4` | Perf/WebGPU `7.8` → **Overall: `6.1 / 10`**.
- **Screenshot-Verified Defects:**
  1. **Dead Grey Outfield Sky & Smeared AI-Artifact Meshy Arches (`1280x720/03-action-03-swing-0-450.jpg`):** "Harbor" ballpark renders zero harbor bay water, suspension bridge, or skyline—only an overcast grey void and melted, grey-streaked Meshy stone arches + tiny isolated bleacher blocks sitting on an infinite flat green plane.
  2. **Vertical Hockey-Puck Pitcher's Mound & Un-Raked Orange Pancake Dirt (`1280x720` & `390x844`):** The pitcher's mound is a sharp vertical-walled orange cylinder step-cake rather than a smoothly graded `10"-rise` earthen mound, and the infield dirt lacks raked drag-screen ridges, chalk batter's-box wear, and grass-lip transitions.
  3. **Identical Frozen Mannequin Fielders (`1280x720`):** All infielders and outfielders stand frozen in identical stiff white mannequin stances with zero pre-pitch ready crouch or glove-prep motion.
  4. **Missing `390x844` Touch Controls & Low-Contrast Header (`390x844/03-action-03-swing-0-450.jpg`):** Portrait phone screenshot exposes **zero visible touch buttons** for `SWING` / `PITCH` / `EXTRA BASE`, pale orange-on-grey `QUICK PLAY` fails contrast, and unlicensed display/mono font stacks require AuraOne `.woff2` standardization.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output, Reversed Depth & Ballpark Sky (`src/main.ts:396, 430`, `art/look.ts`):** Unify `output: { preset: plan.output.preset, toneMapping: "agx", exposure: plan.output.exposure, dither: true, outputColorSpace: resolveGamut() }` (removing the hardcoded `setOutput({ toneMapping: "aces", exposure: 1 })` override in `src/main.ts:430` that clobbers per-park AgX looks!) and enable `depthBufferMode: "reversed"` + `?worker=1`.
- **Preetham/Golden-Hour Ballpark Atmosphere & Stadium Light Towers (`src/scene.ts:434, 925-991`):** Pair `sky.preetham` (replacing the dead flat grey Harbor sky with crisp coastal Mie horizon scatter!) + `looks.preset(plan.baseLook, plan.overrides)` + 2-cascade `2048` `lights.key` + stadium light-bank `lights.spot` + `lights.lensFlare`, `effects.contactShadows({ length: 0.42, thickness: 0.1, steps: 16, intensity: 0.9 })`, `effects.ambientOcclusion({ intensity: 0.52, radius: 0.7 })`, `effects.screenSpaceReflections({ intensity: 0.38, roughness: 0.3 })`, `effects.godRays` / `effects.volumetricFog` on Dome & night parks, and `effects.cinematicBloom({ intensity: 0.3, threshold: 0.84 })` (`aura3d look lint` clean).

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Smoothly Graded Pitcher's Mound & Paired GLSL 3.00 + WGSL Raked-Clay / Mowed-Grass Shader (`src/scene.ts`, `src/turfTextures.ts`):**
  - Replace the vertical-walled cylinder mound with a smooth cosine-bell `geometry.define` mesh (`radius: 2.74 m`, `height: 0.254 m` with authored tangents) seamlessly skirted into the infield skin!
  - Author a **paired GLSL 3.00 + WGSL ballpark surface shader (`material.custom`)** blending radial mower-checkered outfield turf (`sheen: 0.38` grass blades) with directional drag-raked red/terracotta infield clay, crisp lime-chalk foul/batter's-box lines (`decals.project`), and scuffed cleat marks around home plate.
- **Authentic Harbor Bay Water, Bridge & Clean Grandstand Architecture (`src/scene.ts`, `src/boardTexture.ts`):** Delete the smeared grey Meshy stone ruin arches! Behind Harbor's right-field brick arcade wall (`material.physical` weathered red brick), mount a shimmering **`world.water` McCovey-style bay cove** with moored sailboats, a distant steel suspension bridge (`material.brushedMetal`), wraparound tiered grandstands populated via `bakeCrowdPoses` (`instances.model`), and a crisp LED matrix jumbotron (`text3D` SDF + emissive pixel grid).
- **Equipment Multi-Lobe PBR (`src/main.ts:2742-2771`):** Shade maple/ash bats with `material.lacquer({ clearcoat: 0.92, clearcoatRoughness: 0.08 })` woodgrain, batting helmets with `material.clearcoatPaint`, mitts with oiled `material.physical` leather, and jerseys with `material.fabric` pinstripes.

### 4. Animation, Camera Choreography & Game Juice
- **Live Pre-Pitch Ready Stances, Pitcher Windup & Full-Body Swing (`src/batter-pose.ts`, `src/main.ts`):** Replace frozen mannequin fielder clones with phase-offset `AnimationController` pre-pitch creeping/ready idles, full leg-kick pitcher windup + follow-through, and hip-leading batter torque + bat-flip on no-doubt home runs (`attachToBone` cap/mitt/bat preserved).
- **120/144 Hz Ball Flight, Sweet-Spot Hit-Stop & Exit-Velo Tracker (`src/main.ts:3015`, `art/vfx.ts`):** Extend `createFixedStepPresenter` from `{ ball }` to `{ ball, batterPose, cameraRig }`, trigger `@aura3d/engine/game` `createHitStop` (`48 ms` on barrelled `>= 105 mph` contact) + `createCameraShake` + chalk-puff `effects.particles` + stadium home-run fireworks (`effects.flipbook` starbursts), and smoothly transition from pitcher-mound duel framing to dynamic ball-tracking outfield follow cam.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`index.html`):** Wire self-hosted `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` on inning box score, `0-0` count, pitch `mph`, exit velocity, launch angle, projected `ft`), and `Monument Grotesk Mono` (`400` on pitch-type chips `4SFB / SL / CH / CB`) with `html { font-synthesis: none }`.
- **Dedicated `390x844` Touch Controls & High-Contrast Broadcast Bug:** Add dedicated `>= 48x48px` coarse-pointer thumb controls on `390x844` (left-thumb translucent **PCI zone drag pad** + right-thumb **`SWING` / `CHECK`**, and **`1-4` pitch selector + `PITCH`** when pitching!), fix the washed-out `QUICK PLAY` pill contrast (`>= 7:1`), and display a crisp Statcast-style `EXIT VELO · LAUNCH ANGLE · EST. DIST` ribbon on balls in play.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Remove the hardcoded `setOutput({ toneMapping: "aces", exposure: 1 })` override in `apps/showcase-aura-diamond-3d/src/main.ts:430`, enable `depthBufferMode: "reversed"` + `?worker=1`, and mount `sky.preetham` + 2-cascade `lights.key` + `contactShadows` + `ambientOcclusion` (`aura3d look lint` clean).
- [ ] Replace the hockey-puck cylinder mound with a smooth cosine-graded `geometry.define` mound, author the paired GLSL 3.00 + WGSL checkered-turf / raked-clay shader, and replace smeared Harbor outfield Meshy arches with a brick right-field arcade + `world.water` bay cove + suspension bridge + `bakeCrowdPoses` stands.
- [ ] Animate infielder/outfielder pre-pitch ready idles, bat-barrel `createHitStop` (`48 ms`), home-run fireworks, and full `{ ball, batterPose, cameraRig }` `createFixedStepPresenter` interpolation.
- [ ] Standardize `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, add Statcast exit-velo telemetry, and mount `>= 48x48px` `PCI` + `SWING`/`PITCH` touch controls on `390x844`.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-aura-diamond-3d typecheck && pnpm --filter @aura3d/showcase-aura-diamond-3d build`, `pnpm vitest run tests/unit/aura-diamond`, `node tools/game-checks/run.mjs aura-diamond-3d`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2, `?worker=1`, 0 errors, `1280x720` & `390x844` captures).

---

## WP-04 — Aura FC 3D (`showcase-aura-fc-3d`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-aura-fc-3d/` (`@aura3d/showcase-aura-fc-3d`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-aura-fc-3d/src/main.ts`, `src/aura-assets-v2.ts`, `src/game/{scene.ts,look.ts,luts.ts,sim.ts,locomotion.ts,rig.ts,ballPhysics.ts,ballOrient.ts,camera.ts,hud.ts,modes.ts,scoreboard3d.ts,touch.ts,vfx.ts,replay.ts}` + `apps/showcase-aura-fc-3d/index.html`.
- **Evidence Reviewed (`evidence/aura-fc-3d/screens/final/`):** `1280x720/01-title.jpg`, `1280x720/03-action-03-route-showcase-aura-fc-3d-state-play.jpg`, `1280x720/04-mid.jpg`, `390x844/04-mid.jpg`.
- **Current Scores:** Lighting/Post `6.8` | Materials/Assets `5.4` | VFX/Animation `6.3` | UI/UX/Typography `5.8` | Perf/WebGPU `7.8` → **Overall: `6.4 / 10`**.
- **Screenshot-Verified Defects:**
  1. **Detached Floating Stadium Roof Slabs (`390x844/04-mid.jpg`) & Sparse Tic-Tac Egg Crowd (`1280x720`, `390x844`):** On `390x844` portrait, two grey textured roof canopy slabs float completely disconnected in pitch-black space above the far stand, while grandstands hold sparse glowing pastel capsules/eggs spaced 2 m apart on empty black shelves.
  2. **White Frost/Salt Static on Wet Pitch & Solid White Drywall Goal Net (`1280x720/03-action-03...jpg`):** High-frequency roughness/normal noise (`fcTurfRough` / `fcTurfNormal` at `512px` JPEG in `aura-assets-v2.ts`) causes SSR + floodlights to sparkle like white frost/mold smeared across the grass, and the goal net renders as an opaque solid white box wall!
  3. **Missing Worker/Reversed-Depth Wiring (`src/main.ts:120`):** `labAppOptions` omits `createWorker` and `depthBufferMode: "reversed"`.
  4. **Typography & Sub-12px Controls (`index.html:58-66`, `src/game/hud.ts:81,126`, `src/game/modes.ts:58,94,96`):** Uses `"A3G Calibre"` and `"Graphik"` fallbacks, `font-weight: 800`, and `10px–11px` `.venue` / `.fc-kbd` labels, while `390x844/04-mid.jpg` lacks visible on-screen touch controls during play.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output, Reversed Depth & Worker Parity (`src/main.ts:120-130`, `src/game/look.ts`):** Wire `createWorkerRendererWorker` + `depthBufferMode: "reversed"` + `output: { preset: venuePreset, toneMapping: "agx", exposure: vl.exposure, dither: true, outputColorSpace: resolveGamut() }` across all 6 venues (Munich Night Rain, Favela Sunset, Lagos Floodlight, Kyoto Drizzle, Uyuni Mirror Salt Flat, Glacier Aurora).
- **Floodlit UEFA-Broadcast Atmosphere & Calibrated Wet-Pitch SSR (`src/game/scene.ts:175, 344-457, 1063-1086`):** Keep `sky.dayNight` + `fcNightIblHdri` (`intensity: 0.7, background: false`) + 4-corner stadium `lights.spot` banks + `lights.lensFlare`, `effects.contactShadows({ length: 0.42, thickness: 0.08, steps: 16, intensity: 0.9 })`, `effects.ambientOcclusion({ intensity: 0.5, radius: 0.65 })`, **`effects.screenSpaceReflections({ intensity: 0.34, roughness: 0.32, maxDistance: 32 })`** (clamping minimum turf roughness to `0.26` except inside smooth Voronoi puddles so white salt-static disappears completely!), `effects.volumetricBeam` on floodlight towers, Glacier `effects.auroraRibbon`, and `effects.cinematicBloom({ intensity: 0.3, threshold: 0.84 })` (`aura3d look lint` clean).

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Paired GLSL 3.00 + WGSL Mowed-Turf Stripe & Hexagonal Goal-Net Shaders (`src/game/scene.ts`):**
  - **UEFA Mowed-Grass Pitch Shader (`pitchTurfSpec`):** Replace the `512px` JPEG salt-noise turf setup with KTX2 `1024px` BC7/UASTC maps + a paired GLSL 3.00 + WGSL shader authoring crisp **6 m alternating mower stripes** (two-tone chlorophyll albedo + opposing blade-lean normal anisotropy), chalk touchlines, and low-frequency rain puddles.
  - **Transparent Hexagonal Goal Netting (`goalNetSpec`):** Replace the opaque white drywall goal box with tubular `material.clearcoatPaint` white aluminum posts/crossbar, rear tension stanchions, and a **paired GLSL 3.00 + WGSL derivative-antialiased hexagonal cord mesh shader** (`alphaToCoverage` / hashed transparency) that ripples elastically via `uGoalRipple` (`vec4(hitPos, impulse)`) when the ball hits the back of the net!
- **Connected Cantilever Stadium Bowl & Dense `bakeCrowdPoses` Supporters (`src/game/scene.ts`):** Anchor the floating roof canopies in `390x844` onto continuous steel truss columns (`material.brushedMetal`) wrapping a closed 4-stand bowl, and replace the sparse Tic-Tac capsules with dense multi-row `bakeCrowdPoses` supporter clusters (`instances.model` wearing home/away kit scarves and waving flags). Upgrade kits to `material.fabric({ sheen: 0.4 })` and match-ball panels to thermally bonded `material.clearcoatPaint`.

### 4. Animation, Camera Choreography & Game Juice
- **120/144 Hz Presenter, Stride Lock & Net-Ripple Goal Celebration (`src/game/locomotion.ts`, `src/game/camera.ts`, `src/game/vfx.ts`):** Drive player/ball transforms through `createFixedStepPresenter` (`0%` stalled frames at 120/144 Hz), verify `createFootSlideMeter` `< 0.05 m/s` across sprint/cut/slide-tackle transitions, kick up wet-turf spray `effects.particles` on driven shots and sliding tackles, fire `uGoalRipple` + `createHitStop` (`55 ms` on top-bins strikes) + corner-flag `effects.flipbook` pyrotechnics on goals, and frame `390x844` portrait with dynamic broadcast zoom + off-screen teammate directional chevrons.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **Purge `"A3G Calibre"`, `"Graphik"` & Sub-12px Labels (`index.html`, `src/game/hud.ts`, `src/game/modes.ts`):** Self-host `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px`—fixing `10px` `.venue` and `11px` `.fc-kbd`!), `DIN Pro` (`500` `tabular-nums` on `0 - 0` scoreline, match clock, shot power, possession `%`), and `Monument Grotesk Mono` (`400` on venue/replay telemetry), removing `font-weight: 800` and setting `html { font-synthesis: none }`.
- **Broadcast Tactical Radar & `390x844` Touch Pad (`src/game/touch.ts`, `src/game/hud.ts`):** Add a compact bottom-center translucent **2D pitch radar strip** showing all 10 outfielders + ball, diegetic player stamina/shot-power foot rings, and always-visible `>= 48x48px` coarse-pointer virtual stick + `PASS / THROUGH / SHOOT / SPRINT-SKILL` diamond buttons on `390x844`.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Wire `createWorkerRendererWorker` (`?worker=1`) + `depthBufferMode: "reversed"` + `output: { toneMapping: "agx", dither: true, outputColorSpace }` in `apps/showcase-aura-fc-3d/src/main.ts` (`aura3d look lint` clean).
- [ ] Author paired GLSL 3.00 + WGSL `pitchTurfSpec` (6 m mower stripes + smooth puddles, eliminating white SSR static) and `goalNetSpec` (see-through hexagonal cord mesh + `uGoalRipple` ball impact), KTX2-compress turf/concrete textures, connect the floating stadium roof trusses on `390x844`, and replace Tic-Tac crowd pills with dense `bakeCrowdPoses` stands.
- [ ] Wire `createFixedStepPresenter` across players/ball/camera, `createHitStop` (`55 ms` on goal strikes), and sliding-tackle wet spray VFX.
- [ ] Purge `"A3G Calibre"` and `"Graphik"`, enforce `>= 12px` `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` (`font-weight <= 600`), add a compact 2D pitch radar, and ensure `>= 48x48px` touch controls render cleanly on `390x844`.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-aura-fc-3d typecheck && pnpm --filter @aura3d/showcase-aura-fc-3d build`, `pnpm vitest run tests/unit/aura-fc-3d`, `node tools/game-checks/run.mjs aura-fc-3d`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2, `?worker=1`, 0 errors, `1280x720` & `390x844` captures).

---

## WP-05 — Aura Links 3D (`showcase-aura-links-3d`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-aura-links-3d/` (`@aura3d/showcase-aura-links-3d`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-aura-links-3d/src/main.ts`, `src/aura-assets.ts`, `src/game/{lookRig.ts,lighting.ts,water.ts,terrainMesh.ts,turf.ts,turfTextures.ts,groundCover.ts,horizon.ts,golferSkeleton.ts,golferRetarget.ts,broadcast.ts,holeCard.ts,vfx.ts}` + `apps/showcase-aura-links-3d/index.html` + `public/fonts/fonts.css`.
- **Evidence Reviewed (`evidence/aura-links-3d/screens/final/`):** `1280x720/01-title.jpg`, `1280x720/03-action-03-accuracy.jpg`, `390x844/03-action-03-accuracy.jpg`, `390x844/04-results.jpg`.
- **Current Scores:** Lighting/Post `6.6` | Materials/Assets `5.0` | VFX/Animation `5.4` | UI/UX/Typography `5.8` | Perf/WebGPU `7.6` → **Overall: `6.1 / 10`**.
- **Screenshot-Verified Defects:**
  1. **Twisted Golfer Shoulder/Neck Skinning, Push-Broom Clubhead & Giant 8-Texel Tee Shadow (`1280x720/03-action-03-accuracy.jpg`, `390x844/03-action-03-accuracy.jpg`):** At top-of-backswing, `golferRetarget.ts` twists the golfer's clavicles/neck so his left arm clips straight through a distorted flesh-colored chest/chin blob; the driver head is an oversized `0.45 m` blue rectangular push-broom block; and the tee-box shadow on `390x844` is a massive blocky 8-texel staircase!
  2. **Lollipop Sphere-on-Stick Trees & Untextured Chalk-White Clay Golf Cart (`1280x720/03-action-03-accuracy.jpg`):** Every tree across St. Auroras Links is 2–3 smooth untextured dark-green spheres stacked on a cylinder stick, and the Meshy golf cart beside the tee is 100% unpainted solid white clay (tires, seats, steering wheel, and canopy all white).
  3. **IBL-Flattening `lights.ambient` (`src/main.ts:1219`) & GLSL-Only Lava Shader (`src/game/water.ts:144`):** `main.ts:1219` mounts `lights.ambient` on top of `looks.preset` HDRI, washing out bunker/green shadow contrast, while Cinder Rim's `lavaSpec` lacks a WGSL twin (`docs/upgrade-5.0.0/aura-links-3d.md:22`).
  4. **Keyboard Copy on `390x844` Mobile & Contrast Defect (`390x844/03-action-03-accuracy.jpg`):** Portrait mobile still displays **`SPACE — SET ACCURACY`** without a dedicated `>= 48x48px` `SWING` thumb button, top-left pale green `QUICK PLAY` fails contrast on grey, and `public/fonts/fonts.css:42` introduces custom `"Links Figures"` instead of standardizing `DIN Pro` + `Monument Grotesk Mono`.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Purge `lights.ambient` & Tighten Tee-Box Shadow Cascades (`src/main.ts:1219, 3368`, `src/game/lookRig.ts`):** Delete `lights.ambient` (`src/main.ts:1219` — `aura3d look lint` zero-ambient clean!) so `looks.preset` HDRIs + `lights.hemisphere` provide natural sky/turf bounce, and configure 3-cascade PCF `lights.key({ shadow: { cascades: 3, maxDistance: 140, mapSize: 2048 } })` so cascade 0 covers the `6 m` golfer/tee-box closeup with razor-sharp club-shaft and dimpled-ball shadows instead of 8-texel blocks!
- **HDR Output & Course Post Stack:** Default `output: { preset: coursePostPreset, toneMapping: "agx", exposure: courseExposure, dither: true, outputColorSpace: resolveGamut() }` (keeping standard depth where `contactShadows` requires it per `aura-links-3d.md:24`, or engine 5.5.1 reversed-depth-compatible `contactShadows`), `effects.contactShadows({ length: 0.32, steps: 16, intensity: 0.75, lights: "sun" })`, `effects.ambientOcclusion({ intensity: 0.48, radius: 0.75 })`, planar-reflecting `world.water` lakes (`src/game/water.ts`), `effects.volumetricFog({ godRayDensity: 0.35 })` morning coastal mist, WebGPU-batched `effects.depthOfField` on address/putting, and `effects.cinematicBloom({ intensity: 0.26, threshold: 0.86 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Fix Golfer Clavicle Retargeting, Sculpted Titanium Driver & Retextured Golf Cart (`src/game/golferRetarget.ts`, `src/game/golferSkeleton.ts`, `src/main.ts`):**
  - Clamp clavicle/spine twist distribution (`35%` upper-thoracic, `45%` lumbar, `20%` shoulder swing with 2-bone elbow pole constraints) in `golferRetarget.ts` so the arms **never intersect the torso or neck** across address -> top -> impact -> finish!
  - Replace the `0.45 m` push-broom clubhead with a realistic `460cc` pear-shaped `material.brushedMetal` + carbon-crown `material.clearcoatPaint` driver head (`0.12 m` wide) + tapered `material.chrome` shaft, and replace the caddie's block-on-stick with a proper `caddieBag` stand bag GLB.
  - Run `aura3d-retexture` + KTX2 on the chalk-white golf cart GLB into multi-lobe PBR (`material.clearcoatPaint` forest-green body, matte black rubber tires, tan quilted `material.fabric` seats, `material.studioGlass` windshield).
- **Botanical Course Trees, Grass Blades & Paired GLSL 3.00 + WGSL Cinder-Rim Lava (`src/game/groundCover.ts`, `src/game/water.ts`, `src/game/terrainMesh.ts`):**
  - Replace the sphere-on-stick lollipop trees (preserving exact seeded RNG draw count per `aura-links-3d.md:23` so hole seeds stay 100% deterministic!) with admitted botanical wind-swaying coastal pine, maple, and links gorse GLBs (`instances.model`) + `world.grass` fescue rough collars around bunkers.
  - Add the missing **WGSL twin** to `lavaSpec` in `src/game/water.ts:144` (`a3d_noise` crusted basalt + emissive magma fissures) so all 6 courses—including volcanic Cinder Rim—render identically on WebGPU (`backend: "auto"`) and WebGL2!
  - Upgrade `terrainMesh.ts` + `turf.ts` with multi-cut PBR roughness/sheen differentiation: velvety bentgrass putting green (`roughness: 0.52`, subtle stimp grain normal), striped fairway (`sheen: 0.38`), deep rough (`roughness: 0.88`), and sculpted lip-shadowed raked silica sand bunkers (`material.physical` micro-glint).

### 4. Animation, Camera Choreography & Game Juice
- **120/144 Hz Ball-Flight Tracer, Divot Burst & Flagstick Wind (`src/main.ts`, `src/game/vfx.ts`, `src/game/broadcast.ts`):** Wrap golfer joints, clubhead arc, and ball flight in `createFixedStepPresenter` (120/144 Hz smooth), fire turf-divot + sand-splash `effects.meshParticles` / `effects.particles` at impact, animate vertex-fluttering nylon pin flags driven by the hole's actual wind vector, add a green-reading **contour-slope grid overlay** when putting, and trigger `createHitStop` (`25 ms` on pure `100%` sweet-spot drive impact) + cup-rattle celebration cam on birdies/eagles.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`public/fonts/fonts.css`, `index.html`):** Consolidate `"Links Figures"` into canonical `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` on hole/par/strokes, yardage-to-pin, wind `m/s`, carry/apex telemetry), and `Monument Grotesk Mono` (`400` on lie `%` & seed) with `html { font-synthesis: none }`.
- **Mobile `SWING` Thumb Button & High-Contrast Tee Card (`390x844`):** Replace desktop `SPACE — SET ACCURACY` copy on `pointer: coarse` (`390x844`) with a tactile `64x64px` **`TAP: LOCK POWER / ACCURACY`** thumb button + `>= 44x44px` `AIM / CLUB / GREEN GRID` pills, fix the washed-out green-on-grey `QUICK PLAY` badge (`>= 7:1` contrast), and add live TrackMan-style `BALL SPEED · APEX · CARRY` broadcast telemetry during flight.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Delete `lights.ambient` in `apps/showcase-aura-links-3d/src/main.ts:1219` (`aura3d look lint` clean), configure 3-cascade `2048` `lights.key` shadows to eliminate the 8-texel blocky tee-box shadow on `390x844`, and add the missing WGSL twin to `lavaSpec` in `src/game/water.ts:144` for 100% WebGPU parity across all 6 courses.
- [ ] Fix `src/game/golferRetarget.ts` clavicle/arm self-intersection, replace the `0.45 m` push-broom clubhead with a sculpted `460cc` titanium/carbon driver, retexture the chalk-white golf cart via `aura3d-retexture` + KTX2, and swap lollipop sphere trees for botanical `instances.model` pines/maples without altering RNG draw counts.
- [ ] Add putting green slope-grid contours, wind-driven pin flag flutter, `createFixedStepPresenter` 120/144 Hz interpolation, divot/bunker-sand bursts, and pure-strike `createHitStop`.
- [ ] Standardize `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` in `public/fonts/fonts.css`, fix `QUICK PLAY` contrast, add TrackMan shot-flight telemetry, and mount a dedicated `64x64px` mobile `SWING` thumb button on `390x844` (replacing `SPACE` copy).
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-aura-links-3d typecheck && pnpm --filter @aura3d/showcase-aura-links-3d build`, `pnpm vitest run tests/unit/aura-links-3d`, `node tools/game-checks/run.mjs aura-links-3d`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2 across all 6 courses including Cinder Rim, `?worker=1`, 0 errors, `1280x720` & `390x844` captures).

---

---

## WP-06 — Apex Overdrive (`showcase-roadster-rush`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-roadster-rush/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-roadster-rush/{package.json,index.html}`, `public/rr-fonts/rr-fonts.css`, `src/main.ts`, `src/assets.ts`, `src/meshy-vehicles.ts` (`10` near + `10` `.far.glb` vehicle LODs), `src/assets/luts/apex-bluehour.cube`
  - Art & Shaders: `src/art/{direction,look,post,surfaces,paint,sky,ground,plume,shield,vfx,lut,wgsl}.ts` (`7` custom shader surfaces already paired GLSL 3.00 + WGSL), `src/render/{towers,gantry,pylons,dressing,decals,wakes,pools,instancePool,cinematics,vfxDirector,qa}.ts`, `src/native/{world,player,traffic,game,input,presentation,hud,hudCluster,hud.css,audio}.ts`
- **Genre Look Recipe:** Blue-Hour Skyway Automotive Showcase (`looks.preset("golden-hour")` + dawn HDRI specular probe + damp tire-polished asphalt SSR + `.cube` blue-hour grade).
- **Current Rendering & Screenshot Diagnosis (`evidence/apex-overdrive/screens/final/`):**
  - **Wallpapered 3-Box Skyline & Exposed Horizon Cutoff (`mid-drive.1280x720.jpg`, `key-ramp.1280x720.jpg`):** `src/render/towers.ts` (`skyline-tower-{slab,stepped,blade}`) instances 3 plain unit boxes with procedural window stripes and zero rooftop spires, setbacks, HVAC penthouses, or podiums. Between towers, the flat slate edge of `freeway-outer-ground` (`src/art/ground.ts`) cuts sharply against the sky dome.
  - **Orange Sandpaper Road Glare & Blocky Traffic Shadows:** `src/art/surfaces.ts` tiles a 512px JPG (`Asphalt033`, `ASPHALT_REPEAT = [6, 95]`) at uniform `roughness: 0.55` (`src/main.ts:318`) with **zero `effects.screenSpaceReflections`** in `src/art/post.ts`, smearing golden sun into orange sandpaper, while `maxDistance: 90` shadow cascades cause blocky stair-stepping behind the white van (`key-ramp.1280x720.jpg` & `390x844.jpg`).
  - **Primitive Pickups, Flat Orange Ramps & Oversized Shield Egg:** `pickup-bolts` (`src/main.ts:764`) are bare yellow `primitives.torus` donuts; `POWERUP_LOOK` (`main.ts:203`) uses raw primitive capsules/cones/spheres; `carrier-ramps` (`main.ts:720`) are untextured flat orange boxes (`[2.38, 0.18, 6.6]`); `player-power-shield` (`art/shield.ts`, `[2.9, 1.6, 4.9]`) wraps the roadster in a milky cyan egg that washes out the cobalt clearcoat and clips into the road; and `player-plume-rear-l/r` (`art/plume.ts`) protrude like smooth cyan popsicles.
  - **Typography & Mobile `390x844` Clutter (`key-ramp.390x844.jpg`, `rr-fonts.css`, `hud.css`):** Ships legacy `.ttf` (`monument-grotesk-mono.ttf`) and `.woff` (`DINPro-*.woff` mapped to `600 800`), omits `html { font-synthesis: none }`, misuses `DIN Pro` on prose titles (`"Apex Overdrive"`), drops labels to `10px–11px`, lets `.rr-left` (`170px` = 44% width) block the left lane on `390x844`, and floats 5 rectangular text touch boxes (`Roll L/R`, `Boost`, `Dive`, `Fly`) directly over the hero car.
- **Current Sub-Scores (`/10`):** Lighting/Post `7.2` · Materials/Assets `6.6` · VFX/Animation `7.4` · UI/UX/Typography `7.0` · Perf/WebGPU `8.5` → **Overall `7.2 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Tightened Cascades, Practical Gantries & Horizon Fog (`src/art/look.ts`, `src/art/post.ts`, `src/main.ts:340–395`):**
  - Configure `looks.preset("golden-hour", { environmentIntensity: 0.88, hdri: dawnHdriAsset })` (`background: false` on `environments.hdri` so the custom dual-backend sky dome owns the horizon) with `output: { toneMapping: "agx", exposure: 1.06, dither: true }` and tightened directional sun shadows (`shadow: { mapSize: 2048, cascades: 3, maxDistance: 58, bias: 0.0004 }`) to eliminate blocky van shadows.
  - Pool 4 nearest overhead gantry `lights.spot({ color: "#ff9e52", intensity: 24, distance: 28, angle: 0.68, penumbra: 0.45 })` + `effects.lightCone` mist cones and dual hero headlamp `effects.volumetricBeam({ length: 22, endRadius: 2.8, color: "#dbeafe", intensity: 0.22 })`.
  - Erase the `freeway-outer-ground` horizon seam with `looks.fogForExtent({ extent: 420, color: "#22324d", haze: 0.38, mode: "exp2" })` + an instanced distant bay-ridge silhouette ring.
- **Damp Tire-Track SSR, GTAO & `.cube` Grade (`src/art/post.ts`):**
  - Mount `effects.screenSpaceReflections({ intensity: 0.42, maxDistance: 36, roughness: 0.24, thickness: 0.30 })`, `effects.contactShadows({ length: 0.32, thickness: 0.06, steps: 16, intensity: 0.72, lights: "sun" })`, `effects.ambientOcclusion({ intensity: 0.58, radius: 0.55, multiBounce: true })`, `effects.cinematicBloom({ threshold: 0.88, intensity: 0.38, radius: 0.45 })`, title/ramp-airborne `effects.depthOfField`, and `effects.colorGrade({ lut: apexBluehourLut, lutIntensity: 0.75 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Architectural Skyline Crowns & Sculpted Carrier/Pickup GLBs (`src/render/towers.ts`, `src/main.ts:720–775`):**
  - Add GPU-instanced rooftop crown tiers, illuminated penthouse setbacks, aviation obstruction beacons, and cantilevered highway underpass trusses in `towers.ts`.
  - Replace bare `pickup-bolts` tori, `POWERUP_LOOK` primitive shapes, and flat orange `carrier-ramps` boxes with admitted KTX2 GLBs (`model` / `instances.model`) featuring `material.brushedMetal` diamond-plate treads, animated `material.glowingEmissive` launch chevrons, and hazard side rails.
- **Multi-Lobe Automotive PBR & Dual-Backend Tire-Polish Road Shader (`src/art/paint.ts`, `src/art/surfaces.ts`, `src/art/shield.ts`, `src/art/plume.ts`, `src/art/wgsl.ts`):**
  - Upgrade the hero roadster with `material.carPaint({ color: "#0c4da2", clearcoat: 1.0, clearcoatRoughness: 0.05 })`, `material.studioGlass({ tint: "#0b1320", roughness: 0.04 })` canopy, `material.blackRubber` tires + `material.chrome` rims, and `material.clearcoatPaint` across all 10 Meshy traffic vehicles (KTX2 compressed).
  - Convert `Asphalt033` 512px JPG to a 1024px KTX2 texture set with a **paired GLSL 3.00 + WGSL lane-wear roughness shader** (`roughness = 0.20` in polished dual wheel ruts vs `0.66` coarse aggregate shoulders, curing the uniform orange glare).
  - Shrink `SHIELD_SIZE` (`[2.9, 1.6, 4.9]` → `[2.18, 1.22, 4.35]` above `y = 0.12`) using a Fresnel-edge-only hexagonal energy shell (`center alpha <= 0.05` in GLSL+WGSL), and upgrade `plume.ts` (+ WGSL twin) from smooth cyan popsicles to Mach-diamond shock cones.

### 4. Animation, Camera Choreography & Game Juice
- **2-DOF Suspension Dynamics & 120/144 Hz Presenter (`src/native/presentation.ts`, `src/render/cinematics.ts`):**
  - Drive 2-DOF spring-damper chassis pitch (brake dive / boost squat), lateral lane-cut roll (`±4.5°`), and wheel rotation blur through `createRoadsterPresenter` (`createFixedStepPresenter` verified with `runMotionGate`).
- **Takedown Hit-Stop, Wingtip Ribbons & Scrape Sparks (`src/art/vfx.ts`, `src/render/vfxDirector.ts`):**
  - Trigger `createHitStop` (`35ms` on traffic takedowns & carrier ramp launch) + `createJuice` (`+5.5°` Boost/Fly FOV kick), `effects.particles` tire-smoke & guardrail spark showers, and `effects.auroraRibbon` / `effects.trail` wingtip vortices during `Fly`.

### 5. UI/UX, HUD & Mobile Polish
- **Licensed `.woff2` Typography Fix (`public/rr-fonts/rr-fonts.css`, `src/native/hud.css`, `index.html`):**
  - Replace `.ttf` and `.woff` font files with self-hosted `.woff2` (`Whitney` `400/500/600`, `DIN Pro` `400/500`, `Monument Grotesk Mono` `400`), add `html { font-synthesis: none }`, move prose titles (`"Apex Overdrive"`) from `DIN Pro` onto `Whitney 600`, enforce `>= 12px` lowercase `smcp` labels (`tnum`), and keep `DIN Pro` strictly on speed, bolt, score, and distance numerals.
- **1-Second Objective & `390x844` Thumb-Zone HUD (`src/native/hudCluster.ts`, `hud.css`):**
  - Display a crisp 1-second launch callout (`Hit Carrier Ramps · Collect Bolts · Survive Traffic`); on `390x844`, collapse `.rr-left` (`170px`) into a `42px` top telemetry strip and move the 5 center-blocking text buttons into left/right thumb-edge `>= 48px × 48px` vector pads (`env(safe-area-inset-bottom)`), leaving the center 65% roadster lane wide open.

### 6. Executable Checklist & Verification Gates
- [ ] Configure `looks.preset("golden-hour")` + dawn HDRI (`background: false`), AgX output, `maxDistance: 58` cascades, pooled gantry `lights.spot` + `effects.volumetricBeam` headlamps, `looks.fogForExtent`, and `effects.screenSpaceReflections` + `effects.contactShadows` + `effects.ambientOcclusion`.
- [ ] Add instanced skyline rooftop crowns in `towers.ts`, replace primitive bolt/powerup/carrier-ramp meshes with KTX2 GLBs, upgrade `Asphalt033` to 1024px KTX2 with paired GLSL+WGSL wheel-rut roughness, and refine `shield.ts` + `plume.ts` Mach diamonds.
- [ ] Add 2-DOF suspension dive/squat/roll + `createHitStop` + guardrail spark/smoke VFX + `Fly` wingtip ribbons.
- [ ] Convert all fonts to `.woff2` (`Whitney` prose/labels + `DIN Pro` numerals + `Monument Grotesk Mono` IDs, `font-synthesis: none`, `>= 12px` floor) and unblock the `390x844` center car lane.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-roadster-rush/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-roadster-rush/src
  pnpm vitest run tests/unit/roadster-rush-native tests/unit/apps/roadster-rush-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-roadster-rush --json
  node tools/game-checks/run.mjs showcase-roadster-rush
  ```

---

## WP-07 — Thermal Drift (`showcase-heatsink`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-heatsink/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-heatsink/{package.json,index.html}`, `src/{entry,main,scene,look,view,camera,motion,sim,shown,track,sectors,skyline,shaders,heatHaze,vfx,lut,hud,input,audio,data,records,aura-assets}.ts`, `textures/luts/td-foundry.cube`, `textures/asphalt033/*.webp`, `public/aura-assets/heatsink_thermal*.glb` (`8` industrial GLBs)
- **Genre Look Recipe:** Rain-Soaked Sodium Megacity & Molten Foundry Drone Racing (`looks.preset("night-city")` / `"interior-industrial"` + wet asphalt SSR + dual-backend exhaust heat-haze).
- **Current Rendering & Screenshot Diagnosis (`evidence/thermal-drift/screens/final/` & `CHANGELOG.md:118`):**
  - **CATASTROPHIC DAYTIME GRASSY MEADOW SKYBOX IN A NIGHT MEGACITY (`1280-01-title.jpg`):** `src/scene.ts:214–219` + `src/look.ts` mounts `kloppenheim_02` HDRI with `background: true` on `grand` ("rain-wet sodium night"), exposing **a blurry daytime green grass field and forest treeline** across the entire left horizon!
  - **EXACT ROOT CAUSE OF `2–5 FPS` HEADLESS BOTTLENECK (`src/scene.ts:245–259`):** `circuitReflections` mounts a live cubemap probe (`environments.capture` / `reflectionProbe` with `resolution: 64, update: { everyNFrames: 6 }`) that re-renders the entire scene **6 extra times every 6 frames** (forcing `frameMode: "async"` on WebGPU and CPU prefiltering on WebGL2), compounded by `30` unbatched individual `model()` props (`MODEL_NODE_COUNT = 30`, mutated individually in `src/main.ts:538–558`), `frustumCulled: false` across track/skyline, `maxDistance: 140` 3-cascade PCSS shadows, and 4 full-screen CSS blend overlays!
  - **Missing WebGPU Heat-Haze Twin (`src/heatHaze.ts:247`):** `effects.shaderPass({ glsl: HEAT_HAZE_GLSL })` has **ZERO `wgsl` twin**, so Thermal Drift's signature exhaust heat distortion is completely missing on default WebGPU!
  - **Cardboard Brown Skyline & Grey Nozzle Circles (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):** `skylineFacadeMaterial` (`src/shaders.ts:202–285`) renders flat unlit brown boxes with yellow dots; `ORION` and rival drones (`src/view.ts`) have static stick rotors and **two flat opaque grey circles** pasted over their rear thruster nozzles.
  - **Fused HUD Text & Missing Standalone Fonts (`1280-03-action.jpg`, `index.html`):** `.drone-telemetry-card .dt-head` (`width: 154px`, `index.html:413–433`) has `justify-content: space-between` with zero `gap`, fusing `"ORIONMEGACITY"` + wrapping `"AVE"`! `#hud` applies `Monument Grotesk Mono` to 100% of prose/buttons, `/fonts/aura-fonts.css` 404s in standalone Vite dev, and a 20-button dev bar crowds gameplay and truncates `"BASTION SP..."` on `390x844`.
- **Current Sub-Scores (`/10`):** Lighting/Post `4.8` · Materials/Assets `5.8` · VFX/Animation `6.4` · UI/UX/Typography `5.2` · Perf/WebGPU `3.8` → **Overall `5.2 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Kill Daytime Meadow Skybox & Delete the `everyNFrames: 6` Live Probe (`src/scene.ts:214–259`, `src/look.ts`, `src/main.ts:133`):**
  - Immediately set `background: false` on `environments.hdri` across all 3 circuits (`grand`, `foundry`, `vesper`) and mount per-circuit procedural sky domes (`sky.gradient` dark sodium-indigo night dome on `grand`, ember-lit industrial smog dome on `foundry`, crisp high-altitude twilight dome on `vesper`).
  - **Delete the `everyNFrames: 6` live cubemap probe** in `src/scene.ts:245–259` and drop `frameMode: "async"` in `src/main.ts:133`; rely on prefiltered HDRI specular IBL + `effects.screenSpaceReflections({ intensity: 0.62, maxDistance: 42, roughness: 0.20, thickness: 0.30 })` for real-time wet-asphalt reflections.
- **Practical Sector Lights, Rain & Dual-Backend Heat Haze (`src/sectors.ts`, `src/heatHaze.ts:247`):**
  - Tighten directional shadow cascades (`cascades: 2, mapSize: 2048, maxDistance: 65`), pool 6 nearest overhead sodium `lights.spot` / `lights.rect` fixtures (`#ff9442`) + cyan cooling-gate `lights.point` (`#38bdf8`) + tunnel portal `effects.volumetricBeam`, add `looks.fogForExtent({ extent: 320, color: "#0b1322", haze: 0.42 })`, `effects.contactShadows({ length: 0.35, thickness: 0.07, steps: 16, intensity: 0.72 })`, `effects.ambientOcclusion({ intensity: 0.64, radius: 0.6 })`, `effects.rain({ intensity: 0.65 })` on `grand`, `effects.neonBloom({ threshold: 0.82, intensity: 0.52 })`, `effects.colorGrade({ lut: tdFoundryLut, lutIntensity: 0.7 })`, and `output: { toneMapping: "agx", exposure: 1.12, dither: true }`.
  - Author `HEAT_HAZE_WGSL` in `src/heatHaze.ts:247` and pass `{ glsl: HEAT_HAZE_GLSL, wgsl: HEAT_HAZE_WGSL }` to `effects.shaderPass` so thermal refraction runs natively on WebGPU.

### 3. Geometry, Multi-Lobe PBR, Retexturing & Custom Shaders
- **Carbon/Anodized Racing Drones, Rotor Blur & Plasma Thruster Cones (`src/view.ts`, `src/aura-assets.ts`):**
  - Upgrade `ORION` and rival drone hulls (`aura3d-retexture` + KTX2) with `material.brushedMetal` + `material.carPaint` cowls, `material.studioGlass` sensor canopies, translucent RPM-driven radial rotor-blur discs (`material.custom` GLSL+WGSL), and **replace the two flat opaque grey nozzle circles** with dual additive Fresnel Mach-cone plasma plumes (`material.custom` GLSL+WGSL shifting `#38bdf8` nominal → `#fb923c` hot → `#fff7ed` critical core heat).
- **Rain-Puddle Asphalt, Lit Glass Skyline & `instances.model` Trackside Batching (`src/scene.ts`, `src/skyline.ts`, `src/shaders.ts`, `src/main.ts:538–558`):**
  - Convert `asphalt033` 512px WebP to 1024px KTX2 with a paired GLSL+WGSL standing-puddle & raindrop-ripple roughness shader (`roughness: 0.08` in puddles vs `0.38` crown).
  - Upgrade `skylineFacadeMaterial` (`src/shaders.ts:202–285`, GLSL+WGSL) from unlit brown boxes to dark slate/curtain-wall glass towers (`roughness: 0.22`) with interior parallax rooms and rooftop aviation strobes.
  - Replace the 30 individual `model()` nodes (`MODEL_NODE_COUNT = 30` in `src/main.ts:538–558`) with `instances.model` pools per工业 prop (`LadleCrane`, `TowerTIron`, `CoolingTower`, `ReactorRing`, `Smokestacks`, `ArchIron`, `WaterTower`), re-enable chunk frustum culling, and delete the 4 full-screen CSS blend divs (`.screen-fx`, `.speed-lines`, `.heat-glaze`, `.damage-glaze`).

### 4. Animation, Camera Choreography & Game Juice
- **120/144 Hz Gimbal Attitude & Vent Purge Juice (`src/motion.ts`, `src/camera.ts`, `src/vfx.ts`):**
  - Drive drone roll/pitch/yaw-slip and articulated thruster-vane angles through `createFixedStepPresenter` (`runMotionGate` clean); trigger `createHitStop` (`45ms` on barrier slam / core meltdown) + `createJuice` (`+6°` FOV surge on Vent Purge, high-frequency thermal shudder above `85%` heat).
  - Spawn `effects.particles` cryogenic white `CO2` purge plumes on cooling-gate entry, rooster-tail rain spray `effects.trail` wakes, and barrier-scrape ember bursts.

### 5. UI/UX, HUD & Mobile Polish
- **Fix `"ORIONMEGACITY"` Collision & Self-Host `.woff2` Fonts (`index.html`, `src/hud.ts`):**
  - Bundle self-hosted `.woff2` files (`Whitney` `400/500/600`, `DIN Pro` `400/500`, `Monument Grotesk Mono` `400`) inside the route so standalone Vite never 404s `/fonts/aura-fonts.css`; add `html { font-synthesis: none }`; move `#hud` and `.aura3d-top-bar` labels/buttons off `Monument Grotesk Mono` onto `Whitney 500/600` (`tnum`, lowercase `smcp`, `>= 12px` floor, zero `700` weight); restrict `DIN Pro` strictly to speed, core temp `°C`/`%`, lap, and rank numerals.
  - Widen `.drone-telemetry-card` (`index.html:413–433`) to `min-width: 198px` with `gap: 10px` and stacked drone/circuit badges so `"ORION"` and `"MEGACITY AVE"` never fuse.
- **Title Briefing & Collapsible Setup Drawer (`index.html`, `390x844`):**
  - Present a sleek translucent title plaque on boot (`Vent Heat in Cyan Cooling Gates · Do Not Melt Cores · 3 Laps`), collapse the 20-button top dev bar (`DRONE | TRACK | MODE`) into a compact `[⚙ Race Setup]` drawer during active laps, and enforce `>= 48px × 48px` coarse-pointer steer/vent/brake pads on `390x844`.

### 6. Executable Checklist & Verification Gates
- [ ] Set `background: false` on `environments.hdri` (curing the daytime grassy meadow in `1280-01-title.jpg`), mount dark night/foundry `sky.gradient` domes, delete the `everyNFrames: 6` live cubemap probe (`src/scene.ts:245–259`), and add `HEAT_HAZE_WGSL` in `src/heatHaze.ts:247`.
- [ ] Replace flat grey drone nozzle circles with dual GLSL+WGSL plasma cones + spinning rotor-blur discs, upgrade `asphalt033` to 1024px KTX2 puddle-ripple PBR, upgrade `skylineFacadeMaterial` to dark glass towers, batch the 30 `model()` props into `instances.model` pools, and delete the 4 full-screen CSS blend divs.
- [ ] Wire `createFixedStepPresenter` gimbal motion + `createHitStop` + cryogenic `CO2` vent plumes & rain wakes.
- [ ] Fix `.drone-telemetry-card` `"ORIONMEGACITY"` text collision, self-host `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` (`font-synthesis: none`), collapse the 20-button top bar during play, and verify `390x844` touch pads (`>= 48px`).
- [ ] Run verification gates (confirming headless FPS jumps from `2–5 fps` to `30+ fps` and real-GPU `60 fps`):
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-heatsink/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-heatsink/src
  pnpm vitest run tests/unit/heatsink
  npx @aura3d/cli look lint apps/showcase-heatsink --json
  node tools/game-checks/run.mjs showcase-heatsink
  ```

---

## WP-08 — Grid Dispatch (`showcase-teleoperator`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-teleoperator/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-teleoperator/{package.json,index.html}`, `src/{main,scene,look,sim,rules,collision,scanPulse,tailTrails,vfx,dressing,carMotion,cameraFeel,hud,touch,bezel,intro,audio,qaCrops,aura-assets}.ts`, `public/aura-assets/meshy/models/teleoperator_dispatch*.glb` (`9` SF vehicle & architecture GLBs)
- **Genre Look Recipe:** San Francisco Marine-Layer Dusk Autonomous Fleet Console (`looks.preset("night-city")` / `"overcast"` + damp cable-car street SSR + dual-backend LiDAR range-contour pass).
- **Current Rendering & Screenshot Diagnosis (`evidence/teleoperator/screens/final/`):**
  - **Detached Floating Red Brake-Light Boxes (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):** `src/scene.ts:284, 561` + `src/main.ts:861–863` positions two flat red boxes (`player-tail-lamps`) at `[carX ± width * 0.36, height * 0.52, z]` with **zero yaw/roll transform**, leaving the right brake bar floating detached in mid-air outside the tapered `gridCruiser` pod!
  - **Missing WebGPU LiDAR & Fog Shader + Clobbered AgX Exposure:** `src/scanPulse.ts:173` (`gd-sensor-pass` `effects.shaderPass({ glsl: SENSOR_PASS_GLSL })`) has **ZERO `wgsl` twin** (dropping both the marine fog deck aloft and the teal LiDAR scan ring on default WebGPU!). Meanwhile `src/main.ts:259–263` (`applySkyOutput`) hardcodes `setOutput({ toneMapping: "aces", exposure: 1 })`, overwriting `SKY_LOOKS[weather].output` (`toneMapping: "agx", exposure: 3.8` on Marine dusk in `src/look.ts`) and leaving Marine dusk murky (`mean 53`)!
  - **411 Unbatched Draws, Lollipop Trees, Wall-Sliced Street Sign & Foreground Traffic Clipping (`1280-04-mid.jpg`):** `sf-tree-trunks/crowns` (`scene.ts:498`) are literal green spheres on brown sticks; `16` individual building GLBs + `15` individual traffic GLBs + `11` road strips push draws to **`411`**; SDF `text3D` `"TGOMERY ST"` (`SIGN.x = 9.2`) slices straight into the brick building wall; and adjacent traffic clips directly through the bottom-right foreground camera!
  - **Typography & HUD Overlaps (`index.html`, `1280-03`, `390-03`):** Loads banned `"Graphik"` and `"TT Commons Pro Mono"` + `.woff` `DIN Pro`, declares zero `@font-face` rules for `Whitney` or `Monument Grotesk Mono`, misuses `DIN Pro` on `#opBezel .strip` prose, lets `#teleopDock` overlap `#opBezel .strip` on `1280x720`, and on `390x844` stacks top HUD over 32% of screen height, piles 4 rival pills onto the pod's roof, and collides `#gmode` with `[D]`.
- **Current Sub-Scores (`/10`):** Lighting/Post `6.4` · Materials/Assets `5.9` · VFX/Animation `7.0` · UI/UX/Typography `6.1` · Perf/WebGPU `6.6` → **Overall `6.4 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Honor Per-Weather AgX Output & Damp SF Street SSR (`src/main.ts:259–263`, `src/look.ts`, `src/scene.ts`):**
  - Fix `applySkyOutput` (`main.ts:259`) to forward `SKY_LOOKS[weather].output` (`toneMapping: "agx"`, weather-calibrated `exposure`, `dither: true`) instead of clobbering to `{ toneMapping: "aces", exposure: 1 }`.
  - Mount `effects.screenSpaceReflections({ intensity: 0.48, maxDistance: 34, roughness: 0.22, thickness: 0.30 })` (mirroring Victorian streetlamps, brake bars, and cable-car steel rails in damp marine-mist asphalt), `effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 16, intensity: 0.68 })`, `effects.ambientOcclusion({ intensity: 0.62, radius: 0.55, multiBounce: true })`, `looks.fogForExtent({ extent: 260, color: "#334155", haze: 0.36 })`, and `effects.cinematicBloom({ threshold: 0.86, intensity: 0.36 })`.
  - Pool 6 nearest warm sodium streetlamp `lights.spot({ color: "#ffad5c", intensity: 20, distance: 24 })` + `effects.lightCone` mist halos + forward AV pod `effects.volumetricBeam`.
- **Dual-Backend Precision LiDAR Pass (`src/scanPulse.ts:173`):**
  - Author `SENSOR_PASS_WGSL` alongside `SENSOR_PASS_GLSL` in `effects.shaderPass` (`inputs: ["color", "depth", "normal"]`), tightening the blurry `1.8m` cyan smear (`SCAN_RING_WIDTH_M = 0.9`) into razor-sharp `4cm` primary + `5m`-interval range-contour lines, azimuth ticks, and obstacle normal-edge highlights on both WebGPU and WebGL2.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Conformal Tail Lightbar & Spinning Roof LiDAR Crown (`src/scene.ts:284, 561`, `src/main.ts:861–863`):**
  - Transform conformal wrap-around LED brake/turn lightbars by the hero pod's full 3D pose (`yaw`, `pitch`, `roll`, and hull-specific `rearZ`/`halfWidth`) so red bars NEVER float detached in space.
  - Upgrade `teleoperator_dispatchPodPearl.glb` via `material.clearcoatPaint({ color: "#f1f5f9", clearcoat: 1.0, clearcoatRoughness: 0.05 })`, flush `material.studioGlass({ tint: "#090d16", roughness: 0.03 })`, and a crisp `10 Hz` rotating `material.chrome` + `material.brushedMetal` roof LiDAR sensor puck with an emissive teal laser slit.
- **Batch `411` Draws Down to `< 140` & Fix Street Signs (`src/scene.ts:498–575`):**
  - Replace primitive sphere-on-stick `sf-tree-crowns` with admitted urban street-tree GLBs (`instances.model`), retexture SF Victorian/brick facades at 1024px KTX2 (`aura3d-retexture`), and mount `text3D` street-name blades on curbside mast arms (`x = ±6.1m`, `size: 0.28`) so `"MONTGOMERY ST"` never slices into brick walls.
  - Convert the 16 individual `buildingNode` GLBs and 15 `traffic-*`/`rival-car-*` GLBs into `instances.model` pools per asset (`5` building pools + `4` vehicle pools) and merge the 11 `ROAD_STRIPS` boxes into a single UV-mapped street mesh with metallic cable-car rail strips (`411` draws → `< 140` draws!).

### 4. Animation, Camera Choreography & Game Juice
- **Foreground Traffic Clearance & Active Suspension (`src/cameraFeel.ts`, `src/carMotion.ts`, `src/vfx.ts`):**
  - Wire `createCameraClearance` / lateral near-car avoidance + dithered near-fade (`camDist < 3.2m`) on adjacent traffic so passing cars never block the bottom-right lens (`1280-04-mid.jpg`), paired with 120/144 Hz `createFixedStepPresenter` suspension pitch/roll, damp tire mist `effects.particles`, holographic fare-zone pickup rings, and `createHitStop` + teleop link-glitch pulse on impact.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `Graphik` & `TT Commons Pro Mono` (`index.html`):**
  - Self-host `.woff2` files + `@font-face` rules for `Whitney` (`400/500/600`), `DIN Pro` (`400/500`), and `Monument Grotesk Mono` (`400`) with `html { font-synthesis: none }`; bind `Whitney` (`tnum`, lowercase `smcp`, `>= 12px` floor) to UI prose/buttons (`#opBezel .strip` prose fixed!), `DIN Pro` strictly to MPH, `$` fare, timer, and distance numerals, and `Monument Grotesk Mono` to `CAM 01 · LAT 18ms` link telemetry.
- **De-Collide Desktop & `390x844` Operator Bezel (`index.html`, `src/bezel.ts`, `src/hud.ts`, `src/touch.ts`):**
  - Lift `#teleopDock` to `bottom: 44px` above `#opBezel .strip` on desktop; add a 1-second dispatch objective callout (`Deliver Fares · Pulse LiDAR [Space] · Zero Collisions`); on `390x844`, collapse the 3 stacked top cards into one `46px` operator bar, cap world-space rival tags to the 2 nearest pods de-clustered above the roofline, separate `#gmode` from `[D]`, and keep `>= 48px × 48px` touch pads.

### 6. Executable Checklist & Verification Gates
- [ ] Fix `applySkyOutput` (`src/main.ts:259`) to preserve `SKY_LOOKS[weather].output` (`toneMapping: "agx"`), add `SENSOR_PASS_WGSL` in `src/scanPulse.ts:173`, and mount damp street `effects.screenSpaceReflections` + `effects.contactShadows` + `effects.ambientOcclusion` + pooled streetlamp `lights.spot`.
- [ ] Bind conformal LED brake/turn bars to full pod pose (fixing floating red boxes), add rotating chrome/teal roof LiDAR puck, replace sphere-on-stick trees, move `"MONTGOMERY ST"` signs onto curbside poles (`x = ±6.1m`), and batch buildings/traffic/road strips (`411` → `< 140` draws).
- [ ] Add near-camera traffic fade/avoidance in `cameraFeel.ts` + damp tire-mist & holographic fare-pickup VFX.
- [ ] Replace `Graphik`/`TT Commons Pro Mono`/`.woff` with self-hosted `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, and fix `#teleopDock`, `#gmode`, and `390x844` rival-pill overlaps.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-teleoperator/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-teleoperator/src
  pnpm vitest run tests/unit/teleoperator
  npx @aura3d/cli look lint apps/showcase-teleoperator --json
  node tools/game-checks/run.mjs showcase-teleoperator
  ```

---

## WP-09 — Iron Crown (`showcase-iron-crown`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-iron-crown/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-iron-crown/{package.json,index.html,aura.assets.json}`, `public/fonts/fonts.css`, `src/styles.css`, `src/main.ts`, `src/aura-assets.ts` (`5` rigged fighters + `22` stage GLBs + `4` `.cube` LUTs)
  - Game & Art: `src/game/{fighters,stages,stage-assets,backdrop,arena,look,refinedLook,originalLook,surfaces,vfx,ambientMotion,airstripHaze,flareScorch,ringPhotometry,cinematics,moves,rules,ai,ladder,controls,controlsSheet,touchExtras,hud,qaCrops}.ts`
- **Genre Look Recipe:** Championship Arena Fighting Stage (`looks.preset("arena-fight")` + tracking fighter rim spots + obsidian/wet-concrete ring SSR + shallow ring DoF).
- **Current Rendering & Screenshot Diagnosis (`evidence/iron-crown/screens/final/`):**
  - **GIANT UNTEXTURED BROWN CARDBOARD BOX BLOCKING THE THRONE (`1280-01-title.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):** `buildThronePlinth()` (`src/game/stages.ts:489–500, 620–625`) stacks 4 brown primitive boxes (`1.0m` tall) at **`z = -2.5`**, parked **0.7m directly in front of `cr-throne-chair` (`[0, 0, -3.2]`)**—putting a flat brown crate dead-center between the fighters!
  - **`buildRefinedArenaScene` Regressions & Missing WGSL Twin:** `src/game/arena.ts:227–252` passes `surfaceExtras = false` to `createFighterNode` (**disabling the `fighterSurface` Fresnel rim shader** so Mara Volt's dark brown leather vanishes into `#141519`!), mounts `s.originalDressing` (**skipping `floorDetailFields(id)` normal/roughness maps and `venueBackdrop(id)`!**), and **omits `effects.ambientOcclusion`**! Meanwhile `AIRSTRIP_HAZE_PASS` (`src/game/airstripHaze.ts:22–28`) is GLSL-only with **zero `wgsl` twin**.
  - **Jump Camera Decapitates Fighter Heads (`1280-03-action.jpg`):** `FIGHT_LENS` (`{ fov: 40, lift: 0.6, aim: 0.78 }` in `src/game/cinematics.ts:42`) never tracks `max(p1.y, p2.y)`, slicing jumping Mara Volt's head and shoulders clean off behind the top HUD! Two static `1.15m` cream bullseyes (`spawnRing`) also stay frozen on the floor mid-fight; spectators (`stages.ts:443`) are black spheres on boxes; trophy cabinets hold 40 yellow cylinders; and Versus Setup (`1280-05-modes.jpg`) shows blank colored squares instead of portraits!
  - **Sub-12px Fonts & Scattered Mobile Buttons (`fonts.css`, `styles.css`, `390-03-action.jpg`):** Ships `.woff`/`.ttf` files, drops HUD labels to **`6px`–`11px`** (`.fh-meter-tag` `6px`, `.fh-clock-label` `8px`), clips `"Playe..."` on `390x844`, and scatters 10 outline buttons across 45% empty black floor.
- **Current Sub-Scores (`/10`):** Lighting/Post `6.6` · Materials/Assets `6.0` · VFX/Animation `7.2` · UI/UX/Typography `6.2` · Perf/WebGPU `8.2` → **Overall `6.7 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Restore Full Ring Stack & Tracking Rim Spotlights (`src/game/arena.ts:227–252`, `refinedLook.ts`, `ringPhotometry.ts`, `airstripHaze.ts`):**
  - Enable `surfaceExtras = true` on `createFighterNode`, wire `floorDetailFields(id)` + `venueBackdrop(id)` into `buildRefinedArenaScene`, and mount `effects.ambientOcclusion({ intensity: 0.60, radius: 0.5, multiBounce: true })`, `effects.contactShadows({ length: 0.28, thickness: 0.05, steps: 16, intensity: 0.74 })`, `effects.screenSpaceReflections({ intensity: 0.36, maxDistance: 20, roughness: 0.26, thickness: 0.25 })` on obsidian/wet-concrete aprons, `effects.depthOfField` (`focusDistance: 6.4`, softening background stands while keeping both fighters tack-sharp), `effects.cinematicBloom({ threshold: 0.85, intensity: 0.38 })`, per-venue `.cube` `effects.colorGrade`, and `output: { toneMapping: "agx", exposure: 1.10, dither: true }`.
  - Add two fighter-tracking rim `lights.spot` (`p1` cool steel `#7dd3fc`, `p2` warm amber `#fbbf24`, `intensity: 28`, `angle: 0.52`, `penumbra: 0.5`) + overhead truss `effects.volumetricBeam` shafts so dark outfits (`Volt`, `Sovereign`) pop with razor-sharp silhouette rims.
  - Add `AIRSTRIP_HAZE_WGSL` to `src/game/airstripHaze.ts:22–28` (`effects.shaderPass`).

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Relocate Throne Plinth Into a Regal Dais & Upgrade Crowd/Trophies (`src/game/stages.ts:443–625`, `arena.ts:66–79`):**
  - Move `buildThronePlinth()` **under** `cr-throne-chair` at `z = -3.45`, lower it to a `0.34m` stepped obsidian-and-brass dais (`ic-obsidian` normal/roughness KTX2 + `material.brushedMetal` gold trim), and seat `cr-throne-chair` atop `[0, 0.34, -3.45]` flanked by `ironcrownBrazierPylon` fire bowls; fade out `spawnRing` (`arena.ts:66`) as soon as `FIGHT!` begins.
  - Replace sphere-on-box spectators (`stages.ts:443`) with `createCrowd` / `bakeCrowdPoses` (`@aura3d/engine`) instanced arena spectators in shadowed tiers, and replace the 40 yellow cylinder cups (`stages.ts:532`) with instanced `ironcrownCrown` / chalice GLBs in `material.chrome` & `material.brushedMetal({ color: "#eab308" })` behind `material.studioGlass`.
- **Multi-Lobe Fighter Retexturing & Impact Shader (`src/game/fighters.ts`, `src/game/surfaces.ts`):**
  - Run `aura3d-retexture` + KTX2 compression on all 5 fighter GLBs (`material.fabric` micro-weave on Kenji's gi, grained `material.clearcoatPaint` leather on Volt, `material.brushedMetal` plate armor on Sovereign) and extend `fighterSurface` (paired GLSL 3.00 + WGSL) with uniform-driven impact hit-flash (`uHitFlash`), crimson guard-crush rim, and golden EX-super aura.

### 4. Animation, Camera Choreography & Game Juice
- **Dynamic Aerial Camera Tracking (`src/game/cinematics.ts:40–110`):**
  - Update `FIGHT_LENS` to track `aimY = 0.88 + Math.max(p1.y, p2.y) * 0.68` with `+0.85m` pullback during jumps/juggles (and Hor+ FOV `52°` on portrait `aspect < 0.75`) so aerial fighters NEVER get decapitated behind the top HUD (`1280-03-action.jpg`)!
- **Layered `AnimationController`, Asymmetric Hit-Stop & Impact Flipbooks (`src/game/fighters.ts`, `src/game/vfx.ts`):**
  - Pair `createFixedStepPresenter` (120/144 Hz) with `createFootSlideMeter` (`< 0.04 m/s` grounded stance), asymmetric `createHitStop` (`50ms` light, `95ms` heavy/counter, `140ms` KO), `4×4` KTX2 block-parry & hit-spark `effects.flipbook` sheets, fist/blade `effects.auroraRibbon` arcs, and `decals.project` knockdown scorch marks.

### 5. UI/UX, HUD & Mobile Polish
- **`.woff2` Fonts, `>= 12px` Floor & Rendered Fighter Portraits (`public/fonts/fonts.css`, `src/styles.css`, `src/game/hud.ts`):**
  - Convert `dinpro-*.woff` and `monument-mono.ttf` to `.woff2` (`font-synthesis: none`), lift all `6px–11px` tags (`.fh-meter-tag`, `.fh-clock-label`, `.fh-round`, `.ic-group-label`) to `>= 12px` `Whitney 500/600` (`tnum`, lowercase `smcp`), restrict `DIN Pro` to timer/combo/damage numerals, and replace Versus Setup's blank colored squares (`1280-05-modes.jpg`) with crisp rendered fighter bust thumbnails (`aura3d assets thumbnail`).
- **`390x844` Arcade Fightpad (`src/game/touchExtras.ts`, `src/styles.css`):**
  - Collapse the top quickbar on mobile so `"Playe..."` never clips, and replace the 10 scattered outline buttons with a tactile left 8-way virtual D-pad (`132px × 132px`) + right 4-button arcade diamond (`LP`, `HP`, `BLK`, `EX`, each `52px × 52px` circular glass pad).

### 6. Executable Checklist & Verification Gates
- [ ] Move `buildThronePlinth()` (`stages.ts:489`) under `cr-throne-chair` at `z = -3.45` (`0.34m` obsidian/brass dais), fade `spawnRing` on round start, re-enable `surfaceExtras = true` + `floorDetailFields` + `venueBackdrop` + `effects.ambientOcclusion` + `effects.screenSpaceReflections` + tracking rim `lights.spot` in `buildRefinedArenaScene`, and add `AIRSTRIP_HAZE_WGSL`.
- [ ] Fix `FIGHT_LENS` (`cinematics.ts:42`) vertical jump tracking so fighter heads never clip under the HUD, replace primitive spectators/trophy cylinders with `createCrowd` + trophy GLBs, and KTX2-retexture all 5 fighters.
- [ ] Add `4×4` KTX2 parry/hit-spark `effects.flipbook` sheets, weapon/limb `effects.auroraRibbon` arcs, and asymmetric `createHitStop`.
- [ ] Convert `.woff`/`.ttf` to `.woff2`, raise all `6px–11px` HUD labels to `>= 12px` `Whitney` (`smcp`/`tnum`), render fighter portraits for Versus Setup & HUD corners, and mount the `390x844` D-pad + 4-button arcade diamond.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-iron-crown/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-iron-crown/src
  pnpm vitest run tests/unit/iron-crown tests/unit/likeness-audit/iron-crown-stage-props.test.ts
  npx @aura3d/cli look lint apps/showcase-iron-crown --json
  node tools/game-checks/run.mjs showcase-iron-crown
  ```

---

## WP-10 — Bunker Zero (`showcase-bunker-zero`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-bunker-zero/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-bunker-zero/{package.json,index.html,aura.assets.json}`, `public/fonts/DINPro-*.woff`, `src/aura-assets.ts` (`14` enemy/weapon/door/prop GLBs)
  - Sim & Art: `src/{main,sim,maps,weapons-view,enemy-facing,autopilot,flow}.ts`, `src/art/{direction,look,lightRig,textures,vfx,decals,lut,hatch,floorLoad,minimap,motion}.ts`
- **Genre Look Recipe:** High-Contrast Tactical Subterranean Bunker FPS (`looks.preset("interior-industrial")` + moody bulkhead practicals + damp concrete SSR + ballistic muzzle/tracer VFX).
- **Current Rendering & Screenshot Diagnosis (`evidence/showcase-bunker-zero/screens/final/` & `CHANGELOG.md:179`):**
  - **1.25-Metre Blinding White Beach-Ball Tracer Bug (`1280-04-mid.jpg`, `src/main.ts:665, 1566`):** `main.ts:665` creates `tracer` spheres at `size: [0.14, 0.14, 0.46]` (`emissiveIntensity: 9.0`), and then `main.ts:1566` calls `setScale([1.25, 1.25, 1.4])` / `[0.95, 0.95, 1.15]`—inflating bullets into **1.25-metre glowing white beach-balls** alongside 4-pointed cartoon star sprites (`✦ ✦ ✦`)!
  - **Bleached Milky Floor Glare (`1280-03-action.jpg`, `390-03-action.jpg`):** Stacked `BZ_OUTPUT_EXPOSURE = 1.7` (`art/look.ts:95`) + `key.intensity = 84` + floor `glintInst`/`glintHalo` emissive quads (`main.ts:366–375`) + `BZ_SSR` (`0.45`) bleaches the bunker floor into solid cream-white glare!
  - **Disembodied Gun on Desktop & 100% Clipped Off-Screen Gun on `390x844` (`390-03-action.jpg`):** `bzMgViewmodel` floats in mid-air without gloved hands/forearms on desktop, and on `390x844` (`aspect = 0.462`, vertical `BZ_FOV = 68°` → horizontal FOV `34.6°` in `main.ts:1406–1413`), the weapon is **100% clipped outside the right edge of the viewport**!
  - **Missing Floor Stencil Bug (`CHANGELOG.md:179`, `src/main.ts:336–343`):** `text3D(stencil.text, { backend: "sdf" })` omits `+ slot * FLOOR_SPAN` (dumping Floors 2–6 stencils back into Slot 0!), omits explicit `color`, and buries `y = 0.02` beneath floor decals (which themselves show sharp grey 128px quad edges). Corridors are plain `3m` cube walls.
  - **Rule-6 Typography Violation & Raw Debug Killfeed (`index.html:19`):** Sets `body, html { font-family: "DIN Pro", "Graphik", sans-serif }` (**100% prose in `DIN Pro` + banned `Graphik`**), ships `.woff` only, and prints raw internal strings (`"treasure-big collected"`, `"kill confirmed - guard"`) in `#bz-feed`.
- **Current Sub-Scores (`/10`):** Lighting/Post `5.8` · Materials/Assets `6.3` · VFX/Animation `6.2` · UI/UX/Typography `5.6` · Perf/WebGPU `6.8` → **Overall `6.1 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Fix Overexposure & Build Moody Bulkhead Photometry (`src/art/look.ts`, `src/art/lightRig.ts`, `src/main.ts:366–375, 850`):**
  - Lower `BZ_OUTPUT_EXPOSURE` from `1.7` to `1.05` (`output: { toneMapping: "agx", exposure: 1.05, dither: true }`), delete the fake floor `glintInst`/`glintHalo` emissive quads (`main.ts:366–375`), wire `?depth=` to `readLabFlags()` (`"reversed"` default), and drop `key.intensity` from `84` into balanced `looks.preset("interior-industrial", { environmentIntensity: 0.45 })` + shadowed bulkhead practical `lights.spot` / `lights.point` pools (`#ff9b54` sodium cages, `#ef4444` alarm strobes, `#38bdf8` medbay) + dynamic muzzle-flash `lights.point`.
  - Pair `effects.contactShadows({ length: 0.25, thickness: 0.05, steps: 16, intensity: 0.75 })` with `effects.ambientOcclusion({ intensity: 0.68, radius: 0.55, multiBounce: true })`, damp-puddle `effects.screenSpaceReflections({ intensity: 0.34, maxDistance: 16, roughness: 0.24, thickness: 0.22 })`, `effects.cinematicBloom({ threshold: 0.90, intensity: 0.30 })`, `.cube` tactical grade, and moonlit `effects.volumetricBeam` + `effects.volumetricFog` down the Floor 6 extraction hatch.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Modular Steel Bulkhead Ribs, Rising-Damp Shader & Fixed Stencils/Decals (`src/main.ts:250–355`, `src/art/textures.ts`, `src/art/decals.ts`):**
  - Break up the `3m` cube corridors with 3 GPU-instanced architectural trim pools per floor (`instances.model` / `instances.roundedBox` steel doorway frames around `"D"`/`"E"` cells, overhead I-beam ceiling ribs every `3m`, grated floor drains & wall cable conduits).
  - Upgrade bunker wall/floor maps to 1024px KTX2 driven by a **paired GLSL 3.00 + WGSL rising-damp concrete/riveted-steel shader** (dark wet seepage band along the bottom `0.45m` + puddle roughness modulation).
  - **Fix `floorStencil` (`main.ts:341` / `CHANGELOG.md:179`):** Add `slot * FLOOR_SPAN + stencil.position[0]`, pass explicit `color: BZ_STENCIL_COLOR`, raise `y = 0.028`, and bind active-slot visibility; upgrade `decals.project` textures (`bz-crack`, `bz-scorch`) to 256px KTX2 premultiplied radial-alpha masks (`alpha = 0` at UV border) so zero grey quad edges appear.
- **Rigged Tactical Hands + Hor+ Portrait Viewmodel Fix (`src/weapons-view.ts`, `src/main.ts:601–618, 1393–1420`):**
  - Attach gloved tactical forearms (`material.fabric` sleeves + `material.pbr` armored knuckles via `createTwoHandGrip` / weapon sockets) to `vm-knife`, `vm-pistol`, `vm-mg`, and `vm-rocket`, and upgrade receivers with `material.brushedMetal({ color: "#272a30", roughness: 0.30, metallic: 0.88 })` + `material.blackRubber` grips.
  - **Fix `390x844` off-screen clipping (`main.ts:1393–1413`):** Apply Hor+ FOV scaling (`fov = aspect < 0.85 ? 82 : BZ_FOV`) and portrait-calibrated weapon offsets (`side = aspect < 0.85 ? 0.11 : 0.24`, `forward = 0.56`) so weapon + gloved hands frame cleanly in the bottom-right third on `390x844`!

### 4. Animation, Camera Choreography & Game Juice
- **Fix `1.25m` Beach-Ball Tracer, Add Muzzle Flipbooks & `AnimationController` Crossfades (`src/main.ts:526–570, 1438–1566`, `src/art/vfx.ts`):**
  - Change `tracerNodes[i]!.setScale` (`main.ts:1566`) from `[1.25, 1.25, 1.4]` to **`[0.05, 0.05, 0.42]`** paired with `effects.trail` supersonic streaks, and replace cartoon 4-point star billboards (`✦`) with `4×4` KTX2 directional muzzle-flash `effects.flipbook` sheets + `effects.particles` spinning brass casings, concrete spall chips, and spark hit-confirms.
  - Upgrade enemy clip swaps (`main.ts:1438`) to `AnimationController` crossfades (`Idle_Loop` ↔ `Walk_Loop` ↔ `Run` ↔ `Shoot`) with upper-body bullet-stagger flinch, `createFixedStepPresenter` (120/144 Hz camera + `createHandBounce` viewmodel sway), `createHitStop` (`40ms` kill confirm), and `instances.model` batching for static barrels/crates/lamps (deferring off-floor enemy skinning so headless FPS rises from `10.5` → `30+ fps`).

### 5. UI/UX, HUD & Mobile Polish
- **Purge `DIN Pro` Prose & `Graphik` (`index.html`):**
  - Self-host `.woff2` files for `Whitney` (`400/500/600`), `DIN Pro` (`400/500`), and `Monument Grotesk Mono` (`400`) with `html { font-synthesis: none }`; set `body, html` to `Whitney` (`tnum`, lowercase `smcp`, `>= 12px` floor); restrict `DIN Pro` strictly to HP, Armor, Ammo (`32 / 96`), Floor, and Score numerals; use `Monument Grotesk Mono` strictly for dogtag/sector IDs.
- **Humanized Tactical Feed & `390x844` Dual-Thumb Controls (`index.html`, `src/main.ts`):**
  - Map raw slugs in `#bz-feed` (`"treasure-big collected"` → `"Gold Bullion +500"`, `"kill confirmed - guard"` → `"Patrol Guard Neutralized"`), add a 1-second objective banner (`Locate Gold Keycard · Breach Lift Shutter`), prevent `"MACHINE GUN"` badge truncation on `390x844`, and style mobile dual-thumb look/move + `FIRE` / `USE` / `RELOAD` pads as sleek `>= 48px × 48px` translucent tactical rings.

### 6. Executable Checklist & Verification Gates
- [ ] Lower `BZ_OUTPUT_EXPOSURE` (`1.7` → `1.05`, `toneMapping: "agx"`), delete fake floor `glintInst`/`glintHalo` quads, balance bulkhead spot/point photometry, and wire `?depth=` to `readLabFlags()`.
- [ ] Fix `tracerNodes[i]!.setScale` (`main.ts:1566`) from `1.25m` beach-ball to `[0.05, 0.05, 0.42]` + `effects.trail`, fix `floorStencil` `+ slot * FLOOR_SPAN` & explicit `color` (`main.ts:341`), upgrade `decals.project` radial alpha masks, and add 1024px KTX2 rising-damp wall/floor shaders + instanced doorway/I-beam ribs.
- [ ] Attach gloved tactical hands to all 4 viewmodels, fix `390x844` portrait weapon clipping via Hor+ FOV (`main.ts:1393–1413`), replace star sprites with `4×4` KTX2 muzzle-flash `effects.flipbook` + brass casings, and migrate enemies to `AnimationController` crossfades (culling inactive-slot skinning).
- [ ] Replace `DIN Pro` body prose + `Graphik` (`index.html:19`) with self-hosted `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, and humanize `#bz-feed` strings.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-bunker-zero/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-bunker-zero/src
  pnpm vitest run tests/unit/bunker-zero
  npx @aura3d/cli look lint apps/showcase-bunker-zero --json
  node tools/game-checks/run.mjs showcase-bunker-zero
  ```

---

---

## WP-11 — Pip's Big Leap (`showcase-pips-big-leap`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-pips-big-leap/`); `0` `three` packages or imports (`package.json` depends only on `"@aura3d/engine": "workspace:*"` and `"@aura3d/animation": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-pips-big-leap/{package.json,index.html,aura.assets.json}`, `src/styles.css`, `src/main.ts`, `src/aura-assets.ts` (`10` local Meshy GLBs), `src/aura-catalog.ts` & `src/aura-assets.shared.ts` (`25` shared GLBs)
  - Game & Art: `src/game/{boss,certify,diorama,framing,gate,hud,legacySlab,looks,medals,motion,player,presentation,save,simInput,types,vfx,world,worlds}.ts`
- **Genre Look Recipe:** Handcrafted 6-World Stop-Motion Storybook Diorama (`looks.preset("outdoor-day")` / `"golden-hour"` / `"arena-fight"` / `"space"` + miniature DoF + water/frost SSR).
- **Current Rendering & Screenshot Diagnosis (`evidence/pips-big-leap/screens/final/` & `CHANGELOG.md`):**
  - **EXACT ROOT CAUSE OF `1,138 DRAWS/FRAME` (`src/game/diorama.ts:109–118` + `packages/engine/src/agent-api/compiler/primitives.ts:845, 978`):** `felt()` (`sheen: 0.35` + procedural normal map) and `glazedClay()` (`clearcoat: 0.3`) set `declaresExtension = true`, forcing `ForwardPass.expandInstancedRenderItem` to unroll all **`320` `floraNodes` cones/spheres**, **`14` `baseMounds`**, **`~50` `millpondFoam` spheres**, and all `w2–w5` `instances.roundedBox` platforms into `450+` individual draws × `4` passes (forward + 3-cascade PCSS shadow map) = **`1,138` draws/frame (`14.7 fps` headless)**!
  - **Clobbered World Output & Missing WGSL Twins:** `src/game/presentation.ts:296` calls `app.setOutput?.({ toneMapping: "aces", exposure: 1 })` on every world mount, overwriting `looks.ts`'s per-world AgX/neutral operators and `exposureEv`! Furthermore, `lavaMaterial()` (`diorama.ts:154–206`) and `heatShimmerPass()` (`diorama.ts:550–577` in World 4 Ember Cellar) are **GLSL-only with zero `wgsl` twins**!
  - **Domino-Box Glide Cape, Faceted Start Slab & Cyberpunk Quadcopters in a Meadow (`card-2x.jpg`, `1280-01-title.jpg`, `1280-03-action.jpg`):** Pip's glide cape (`world.ts:902`) is a rigid `primitives.box` (`[0.3, 0.03, 0.32]`) sticking straight out of Pip's lower waist like a blue-and-white Domino slab; `legacySlab.ts` (`9×8m` start pad) shows ugly diagonal triangulation bands; `floraNodes` are spiky green primitive cones; and **`world.ts:228` mounts `heatsinkDroneNighthawk` (purple cyberpunk quadcopters from Thermal Drift!) as `"hawk"` enemies over Sunlit Meadow!**
  - **Mobile `390x844` Occlusion & Banned Fonts (`390-03-action.jpg`, `src/styles.css`):** Upside-down `leapBaseCanopy` scaled `25×` (`diorama.ts:299`) blocks the bottom 22% of `390x844` as a blurry brown blob; the top quickbar clips after `Ember`; and `styles.css` hardcodes banned `"Graphik", system-ui` with non-tabular jittering timers.
- **Current Sub-Scores (`/10`):** Lighting/Post `6.2` · Materials/Assets `5.0` · VFX/Animation `6.4` · UI/UX/Typography `5.6` · Perf/WebGPU `4.5` → **Overall `5.5 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Un-Clobber 6-World AgX Grades & Tighten Cascades (`src/game/presentation.ts:296`, `src/game/looks.ts`):**
  - Delete `app.setOutput?.({ toneMapping: "aces", exposure: 1 })` in `presentation.ts:296` so each world's authored `postPresets` / `output` (`toneMapping: "agx"`, calibrated `exposure`, `dither: true`) governs `w1` Sunlit Meadow, `w2` Millpond Crossing, `w3` Lantern Hollow, `w4` Ember Cellar, `w5` Frost Clockwork, and `w6` Starlight Crown.
  - Reduce `sun-key` from 3 cascades to **2 camera-fitted cascades** (`cascades: 2, mapSize: 2048, maxDistance: 42`, cutting shadow draws by 33% while sharpening near-Pip penumbrae), paired with `effects.contactShadows({ length: 0.28, thickness: 0.05, steps: 16, intensity: 0.65 })` and `effects.ambientOcclusion({ intensity: 0.60, radius: 0.45, multiBounce: true })`.
- **Per-World SSR, God Rays, Miniature DoF & WGSL Heat Shimmer (`src/game/looks.ts`, `src/game/diorama.ts:550`):**
  - Enable `effects.screenSpaceReflections({ intensity: 0.52, maxDistance: 14, roughness: 0.22, thickness: 0.25 })` on `w2` Millpond water, `w5` brass/ice clockwork, and `w6` astral star-stone; add `effects.godRays({ source: "sun", intensity: 0.36, decay: 0.94, samples: 48 })` on `w1`/`w3`; add `looks.fogForExtent({ extent: 48, haze: 0.32 })`, `effects.cinematicBloom({ threshold: 1.02, intensity: 0.24 })`, miniature diorama `effects.depthOfField`, and author `HEAT_SHIMMER_WGSL` in `diorama.ts:550` (`effects.shaderPass`).

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Collapse `1,138` Draws Down to `< 210` (`src/game/diorama.ts:109–118, 320–480`):**
  - Strip `sheen`/`clearcoat`/procedural maps off high-count `instances.cone`/`sphere`/`roundedBox` pools (or route through `WP-00`'s multi-lobe `InstancedPBRMaterial`) so hardware instancing stays **1 draw per pool**, and replace the 320 spiky cone `floraNodes` with `2` `instances.model` pools of KTX2-compressed stylized clover/wildflower tuft GLBs.
  - Reserve rich multi-lobe `material.matteClay`, `material.ceramic`, `material.lacquer`, `material.strata`, and `material.brushedMetal` for hero/platform GLBs (`leapPadBlock`, `leapGoalArch`, `leapObservatoryGear`).
- **Storybook Woodland Owl, Tiled Pads & Dual-Backend Lava/Water (`src/game/world.ts:228, 760`, `legacySlab.ts`, `diorama.ts:154`):**
  - **Replace `heatsinkDroneNighthawk` (`world.ts:228`)** with an admitted rigged **storybook woodland owl/crow GLB** (`model(assets.leapWoodlandOwl)` with `Flap`/`Swoop` clips, KTX2)!
  - Replace stretched diagonal-banded `legacySlab.ts` with modular tiled `leapPadBlock` (`instances.model`) + `material.strata` earthen cliff skirts, and retexture `propConifer` (`aura3d-retexture`) into warm gouache foliage canopies.
  - Add `LAVA_VERTEX_WGSL` + `LAVA_FRAGMENT_WGSL` to `lavaMaterial()` (`diorama.ts:154`) and upgrade `w2` Millpond water with `world.water` / `material.caustics` shoreline foam.

### 4. Animation, Camera Choreography & Game Juice
- **Articulated Cloth Glide Cape & 120/144 Hz Presenter (`src/game/world.ts:902`, `player.ts`, `motion.ts`, `framing.ts`):**
  - **Delete the rigid waist-box Domino cape (`world.ts:902`)** and attach a shoulder-pinned subdivided cloth cape mesh (`attachToBone` / shoulder socket + paired GLSL+WGSL billow wave driven by Pip's `vy` and airspeed) trailing dual wingtip `effects.auroraRibbon` / `effects.trail` streamers during glide.
  - Insert `createFixedStepPresenter` (`@aura3d/engine/game`) for 120/144 Hz interpolation + `createFootSlideMeter`, `createHitStop` + `createJuice` on beetle stomps, spring-mushroom launches, and Boss Toad slams, and `4×4` KTX2 dust-ring `effects.flipbook` puffs on double-jump/landings.
  - Fix `390x844` portrait framing (`framing.ts`, `diorama.ts:299`): lower `leapBaseCanopy` pedestal Y and raise portrait camera pitch `+3.5°` so the brown pedestal rim never occludes the bottom 22% of the screen.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `"Graphik"` & Fix Mobile Quickbar (`src/styles.css`, `src/game/hud.ts`, `index.html`):**
  - Replace `"Graphik", system-ui` (`styles.css`) with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` on `.k` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) on seeds (`0/5`), acorns, and medal split timers (`00:14.82`), and **Monument Grotesk Mono** (`400`) on seed/replay IDs.
  - Dock the title plaque left of center so Pip waves visibly on the sunlit pedestal, add a 1-second diegetic goal chevron pointing toward `leapGoalArch`, make `.aura3d-top-bar` horizontally scrollable/compact (`W1–W6`) on `390x844`, and enforce `>= 44px × 44px` touch buttons (`Jump`, `Glide`, virtual stick).

### 6. Executable Checklist & Verification Gates
- [ ] Delete `app.setOutput` ACES clobber (`presentation.ts:296`), set `sun-key` to 2 camera-fitted cascades (`maxDistance: 42`), enable `effects.screenSpaceReflections` + `effects.godRays` + miniature `effects.depthOfField`, and add `HEAT_SHIMMER_WGSL` + `LAVA_*_WGSL` (`diorama.ts:154, 550`).
- [ ] Collapse `1,138` draws to `<= 210` by fixing `felt`/`glazedClay` instancing expansion (`diorama.ts:109`), replacing 320 cone `floraNodes` with `instances.model` wildflower GLBs, swapping `heatsinkDroneNighthawk` (`world.ts:228`) for a rigged woodland owl GLB, and replacing `legacySlab`.
- [ ] Replace the rigid waist-box cape (`world.ts:902`) with a shoulder-pinned fluttering cloth cape + wingtip trails, wire `createFixedStepPresenter`, and fix `390x844` `leapBaseCanopy` bottom occlusion.
- [ ] Purge `"Graphik"`/`system-ui` for `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` (`font-synthesis: none`) and make the `390x844` world bar scrollable.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-pips-big-leap/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-pips-big-leap/src
  pnpm vitest run tests/unit/pips-big-leap/
  npx @aura3d/cli look lint apps/showcase-pips-big-leap --json
  node tools/game-checks/run.mjs showcase-pips-big-leap
  ```

---

## WP-12 — Slingshot Siege (`showcase-slingshot-siege`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-slingshot-siege/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-slingshot-siege/{package.json,index.html}`, `src/styles.css`, `src/main.ts`, `src/aura-assets.route.ts` (`10` Meshy GLBs + `8` WAV SFX), `src/art/setPieces.ts` (`6` far GLBs + `3` huge Objaverse scans totaling `20 MB`), `src/art/surfaces.ts` (`6` JPGs gated off behind `?surfaces=1`!)
  - Game: `src/game/{ammo,blockInstances,hud,levels,look,materials,presentation,sign,sim,stage,vfx}.ts`
- **Genre Look Recipe:** Tactile Stop-Motion Island Siege Maquette (`looks.preset("outdoor-day")` / `"golden-hour"` / `"polar-night"` across 6 live chapters + `world.water` + tilt-shift miniature DoF).
- **Current Rendering & Screenshot Diagnosis (`evidence/slingshot-siege/screens/final/`):**
  - **Dead Grey HDRI Wall Sky & Frozen Chapter 0 Look (`01-title.jpg`, `03-action-01.jpg`, `04-mid.jpg`):** `stage.ts:248` passes `kloppenheim_06_puresky` HDRI without `background: false`, washing out `sky.gradient` into a featureless grey-beige wall, while `worldWater: false` (`look.ts:176`) leaves `stage-ocean` as a flat matte blue cylinder! Worse, `buildScene(chapter)` (`main.ts:82`) runs **only once at boot**, so Chapters 1–5 never swap lighting, sky, or set pieces!
  - **Severe Art-Style Whiplash & `20 MB` Scan Bloat:** Because `SURFACES` (`main.ts:61`) defaults to `false`, the island is an untextured `#4c8c3c` plastic cylinder dotted with 7 olive `primitives.box` dominoes (`dirt-path`), spiky cones, and intersecting `primitives.sphere` hills right beside `20 MB` (`~2M` tris!) of dark photorealistic Objaverse rock scans (`sling_rocksA/B`, `sling_islandTrees`) that camouflage brown `gullsiegeRaiderBossMeshy` targets!
  - **Crate Used as Slingshot Pouch, Identical Gull Mesh for All 5 Ammos & 84 Unbatched Actors:** `stage.ts:593` uses a squashed shipping crate (`gullsiegeCrateMeshy`) as the slingshot pouch; **all 5 ammo classes (`pebble`, `stone`, `triple`, `squid`, `ember` in `stage.ts:710`) mount the exact same white gull GLB**; and `84` crates/barrels/planks/debris (`stage.ts:635–690`) mount as individual `model()` nodes (`17.3 fps` headless).
  - **HUD Overlaps, Boar/Gull Copy Bug & `390x844` Cropping (`card-2x.jpg`, `390x844/03-action-02.jpg`):** `.ss-coach` overlaps `.ss-level-tag` in `card-2x.jpg`; HUD calls boar targets `"GULLS SURVIVE"` beside `🐗`; `390x844` crops both slingshot and fortress off-screen (`RIFTWOOD COVE`, `Tap / Space mid-f`), uses `"Aeonik Pro"` + emojis, and has `28px–38px` buttons (`< 44px`).
- **Current Sub-Scores (`/10`):** Lighting/Post `4.8` · Materials/Assets `4.6` · VFX/Animation `6.0` · UI/UX/Typography `4.9` · Perf/WebGPU `5.2` → **Overall `5.1 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Fix HDRI Sky Washout & Live 6-Chapter Look Swaps (`src/game/stage.ts:248`, `look.ts`, `src/main.ts`):**
  - Force `background: false` on every chapter `environments.hdri` node so `sky.gradient` / `sky.preetham` renders vibrant coastal azure (`Ch.0`), golden-hour quarry (`Ch.1`), sunbeam greenhouse (`Ch.2` + `effects.godRays`), breezy noon (`Ch.3`), crimson sunset keep (`Ch.4`), and starry `Moon Roost` (`Ch.5` + warm lantern `lights.point`), and dynamically swap `chapterLookNode` / `chapterSkyNode` / `farSetPieces` inside `loadLevel()` whenever `chapterForLevel(id)` changes!
- **Enable `world.water`, Fortress GTAO & Tabletop Tilt-Shift DoF (`src/game/look.ts:176`):**
  - Turn `world.water` **ON** around the island beach with shoreline foam + `effects.screenSpaceReflections({ intensity: 0.50, maxDistance: 20, roughness: 0.20, thickness: 0.25 })`, `effects.ambientOcclusion({ intensity: 0.68, radius: 0.55, multiBounce: true })` inside timber/stone joints, `effects.contactShadows({ length: 0.35, thickness: 0.06, steps: 16, intensity: 0.70 })`, `effects.cinematicBloom({ threshold: 0.95, intensity: 0.24 })`, miniature `effects.depthOfField({ tiltShift: { bandCenter: 0.56, bandWidth: 0.38 } })`, and `output: { toneMapping: "agx", exposure: 1.04, dither: true }`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Retire `20 MB` Photogrammetry Scans & Enable KTX2 Turf (`src/art/setPieces.ts`, `surfaces.ts`, `stage.ts:310–420`):**
  - Replace `sling_rocksA.glb` (`9.33 MB`), `sling_islandTrees.glb` (`6.93 MB`), and `sling_rocksB.glb` (`3.70 MB`) with stylized painted coastal cliff & palm/pine GLBs (`< 18k` tris total, KTX2) shaded with pale warm limestone `material.strata` so dark raider bosses pop with `>= 40` luminance contrast! Enable KTX2 turf/sand `surfaces.ts` by default (`material.matteClay` / `material.felt`), deleting the 7 box-domino `dirt-path` slabs and `terrain-spheres`.
- **Batch `84` Props Into `4` `instances.model` Pools, Multi-Lobe Blocks & 5 Distinct Ammo Gulls (`stage.ts:158–172, 585–725`):**
  - Convert the `84` individual `model()` crate/barrel/plank/debris nodes into **`4` `instances.model` pools** (`84` draws → `4` draws!).
  - Differentiate fortress materials: **Ice/Glass blocks** on `material.studioGlass({ tint: "#bfe9ff", roughness: 0.06 })`, **Stone blocks** on `material.ceramic` / `material.matteClay`, and **Timber beams** on warm wood-grain `InstancedPBRMaterial`.
  - Author **5 visually unmistakable gull ammo variants** (`aura3d-retexture` + crest/helmet props): Scout Gull (`pebble`), Iron-Helm Heavy Pelican (`stone`), Blue Trio Swiftlets (`triple`), Violet Ink Cuttle-Gull (`squid`), and Blazing Ember Gull (`ember`), and replace the squashed crate "pouch" (`stage.ts:593`) with a carved driftwood Y-fork slingshot + leather pouch + **paired GLSL 3.00 + WGSL strain-colored elastic band ribbons**!

### 4. Animation, Camera Choreography & Game Juice
- **Ballistic Follow Camera, `390x844` Auto-Frame & Destruction Flipbooks (`src/game/presentation.ts`, `vfx.ts`, `stage.ts`):**
  - Insert `createFixedStepPresenter` (120/144 Hz rigid-body block & gull motion), dynamic aspect camera framing (`camera.framePose` pullback on `390x844` so **both** launcher and fortress stay inside portrait frame during aim, smooth pan along projectile apex, and `0.6s` boss-topple push-in), `createHitStop` (`45ms` stone hit, `75ms` powder-barrel chain blast) + `createJuice`, wood-splinter & ice-shard `effects.meshParticles`, `4×4` KTX2 fireball `effects.flipbook` explosions, and mid-flight feather `effects.trail` ribbons.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `"Aeonik Pro"`, Fix Copy & De-Collide HUD (`src/styles.css`, `src/game/hud.ts`):**
  - Replace `"Aeonik Pro"` (`styles.css:4`) and emojis (`🔊`, `🐗`, `🔒`) with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) for score, shots left, and damage popups, and crisp inline SVGs.
  - Rename target copy consistently to `RAIDERS` (fixing `"GULLS SURVIVE"` next to boars!), separate `.ss-coach`, `.ss-level-tag`, and `.controls-hint` into non-overlapping flex slots (`gap: 8px`), and enlarge `.ss-utility-btn` & ammo pips to `>= 44px × 44px` on `(pointer: coarse)` with non-truncated mobile hint copy.

### 6. Executable Checklist & Verification Gates
- [ ] Set `background: false` on chapter HDRIs (`stage.ts:248`), wire live 6-chapter look/sky/setpiece swaps in `loadLevel()`, and enable `world.water` + `effects.screenSpaceReflections` + `effects.ambientOcclusion` + tilt-shift `effects.depthOfField` + AgX output.
- [ ] Replace the `20 MB` Objaverse scans (`sling_rocksA/B`, `sling_islandTrees`) with `< 18k`-tri stylized `material.strata` cliff/tree GLBs, enable KTX2 island surfaces by default, convert `84` prop actors into `4` `instances.model` pools, differentiate Ice (`studioGlass`) / Stone / Wood blocks, and build the driftwood Y-fork slingshot + 5 distinct ammo gull variants.
- [ ] Wire `createFixedStepPresenter`, portrait-safe `camera.framePose` aim/follow choreography, `createHitStop`, and powder-barrel `effects.flipbook` + splinter/ice-shard VFX.
- [ ] Replace `"Aeonik Pro"` + emojis with `.woff2` `Whitney` + `DIN Pro` + inline SVGs, fix `"RAIDERS"` copy & `.ss-coach` overlap, and enforce `>= 44px` touch controls.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-slingshot-siege/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-slingshot-siege/src
  pnpm vitest run tests/unit/slingshot-siege/
  npx @aura3d/cli look lint apps/showcase-slingshot-siege --json
  node tools/game-checks/run.mjs showcase-slingshot-siege
  ```

---

## WP-13 — Glint Courier (`showcase-dot-dash-3d`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-dot-dash-3d/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-dot-dash-3d/{package.json,index.html,aura.assets.json}`, `src/styles.css`, `src/main.ts`, `src/aura-assets.ts` (`dotdashCourierPod` GLB, `workshopHdr`, `6` `.cube` LUTs)
  - Game: `src/game/{boardMaterial,camera,engineCompat,grid,hud,look,mazes,motion,palette,save,sim,traces,vfx,world}.ts`
- **Genre Look Recipe:** Macro Electronics Workbench & Illuminated FR-4 PCB Diorama (`environments.hdri(workshopHdr)` + articulated bench spot lamp + glossy solder-mask SSR + shallow macro DoF + 6 board `.cube` LUTs).
- **Current Rendering & Screenshot Diagnosis (`evidence/dot-dash-3d/screens/final/` & `CHANGELOG.md`):**
  - **Reflection-Probe Settle Stalls & `200×` Clearcoat Wall Draw Expansion (`src/game/world.ts:315, 352, 624`):** `"board probe"` (`update: "once"`, `resolution: 128`) triggers up to 6 multi-face settle/env recaptures during boot yet never refreshes on board swaps (`applyBoardLook`), while `wallMat` (`clearcoat: 1` on `pool-wall` `instances.roundedBox`) triggers `ForwardPass.expandInstancedRenderItem`—unrolling `~200` walls into individual draws across main view + shadow map + `6` probe faces (`~1,600` draws per probe bake)!
  - **Raw Primitive Sentries & Nearly Invisible Cyan Torus (`card-2x.jpg`, `1280-03-action.jpg`):** All 4 enemy sentries (`world.ts:384–387`) are bare untextured primitives—orange cone (`Hunter`), purple cube (`Ambusher`), yellow disc (`Skittish`), and a **thin cyan torus (`Drifter`) that vanishes into the cyan dots and 1,700 noisy white pins (`pool-rail`)**—with zero eyes, chassis, or facing direction!
  - **Obscured Hero Pod & 10 Giant Pastel RPG Dice (`1280-03-action.jpg`, `390-03-action.jpg`):** `dotdashCourierPod` is buried inside a blurry translucent `courier-shell` octahedron, while `PEDESTALS` (`world.ts:570–575`) lines both board edges with **10 giant pastel icosahedron D20 dice** instead of electronic components!
  - **`390x844` 50% Empty Dead Margins & `"Graphik Web"` (`390-03-action.jpg`, `styles.css:25`):** Portrait camera leaves 50% of the vertical screen as empty brown/black bands and clips all 6 board buttons off the top bar; `styles.css` uses banned `"Graphik Web"` on UI labels.
- **Current Sub-Scores (`/10`):** Lighting/Post `7.4` · Materials/Assets `5.3` · VFX/Animation `6.6` · UI/UX/Typography `6.0` · Perf/WebGPU `5.4` → **Overall `6.1 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Deterministic `on-demand` Bench Probe & Macro Shallow DoF (`src/game/world.ts:315, 624`, `look.ts`):**
  - Switch `"board probe"` (`environments.capture`) from `update: "once"` to **`update: "on-demand"`** (`resolution: 128`), invoking probe refresh once when `workshopHdr` finishes loading and once inside `applyBoardLook(boardIdx)`—eliminating multi-frame settle stalls while keeping all 6 board palettes accurately reflected!
  - Pair the warm overhead bench `lights.spot` (`shadow: { mapSize: 2048 }`) + cool oscilloscope fill with `effects.contactShadows({ length: 0.22, thickness: 0.04, steps: 16, intensity: 0.72 })`, `effects.ambientOcclusion({ intensity: 0.68, radius: 0.38, multiBounce: true })`, glossy solder-mask `effects.screenSpaceReflections({ intensity: 0.62, maxDistance: 8, roughness: 0.20, thickness: 0.20 })`, `effects.cinematicBloom({ threshold: 0.92, intensity: 0.28 })`, macro `effects.depthOfField` softening only the outer cutting-mat perimeter, 6 per-board `.cube` `effects.colorGrade` LUTs, and `output: { toneMapping: "agx", exposure: 1.02, dither: true }`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **4 Directional Micro-Bot Sentry GLBs & Macro PCB Components (`src/game/world.ts:384–387, 570–575`):**
  - Replace the raw cone/cube/torus/disc primitives with **4 admitted KTX2 micro-drone sentry GLBs** featuring forward optic visors & projected laser scan cones (`Hunter` crimson spider-probe, `Ambusher` violet twin-coil bot, `Drifter` high-contrast coral-lime hover-mite—never cyan-on-cyan!—and `Skittish` gold capacitor-bug).
  - Remove the obscuring `courier-shell` octahedron and retexture `dotdashCourierPod` (`aura3d-retexture`) with `material.clearcoatPaint` + nose headlamp & rear plasma vent.
  - Replace the 10 pastel D20 `PEDESTALS` with GPU-instanced macro electronics GLBs (`instances.model`): glowing **Nixie tube digits**, `material.brushedMetal` **electrolytic capacitors**, **anodized finned heatsinks**, and **quartz crystal cans**, plus soldering-iron / ribbon-cable workbench dressing on `roomNodes`.
- **Collapse `200×` Wall Expansion & Add Dual-Backend Trace-Pulse Shader (`world.ts:352`, `boardMaterial.ts`):**
  - Replace `clearcoat: 1` `pool-wall` `instances.roundedBox` with **3 hardware-instanced IC package pools** (`instances.model` / `InstancedPBRMaterial` matte black epoxy SOIC/QFP chips with silkscreen part numbers, `roughness: 0.34`, `1` draw per pool!) and mipmapped ENIG gold/copper lead-frames (`material.brushedMetal`, eliminating the 1,700-pin sub-pixel shimmer).
  - Author a **paired GLSL 3.00 + WGSL energized copper-bus pulse shader** (`material.custom`) sending bright current waves along PCB traces toward active Overclock capacitors.

### 4. Animation, Camera Choreography & Game Juice
- **90° Portrait Board Framing, Vulnerable Glitch State & Arc VFX (`src/game/camera.ts`, `motion.ts`, `vfx.ts`):**
  - On `390x844` portrait (`aspect < 0.8` in `camera.ts`), orient/fit the rectangular PCB along the portrait vertical axis so the maze fills **78%+ of the screen** instead of leaving 50% empty margins!
  - Drive courier/sentry banking via `createFixedStepPresenter` (120/144 Hz), switch sentries into an unmistakable **blue strobe/wobble Vulnerable Glitch state** during Overclock/EMP pulses, and fire `createHitStop` (`55ms` sentry derez) + `effects.trail` plasma wake + `4×4` KTX2 electric arc-spark `effects.flipbook` bursts.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `"Graphik Web"` & Un-Clip Board Switcher (`src/styles.css:25, 342`, `src/game/hud.ts`):**
  - Replace `"Graphik Web"` with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` on `.dd-chip .k` labels, `font-synthesis: none`), keep **DIN Pro** (`500`, `tnum`) on score/multiplier/packets/lives, and use **Monument Grotesk Mono** (`400`) on PCB silkscreen revision IDs (`REV 5.5 · BOARD 01`).
  - Make `.aura3d-top-bar` scrollable/compact on `390x844` so all 6 board presets + `Tilt Cam` stay reachable, add a 1-second silkscreen objective cue (`Swipe / WASD · Clear All Signal Nodes`), and enforce `>= 44px × 44px` touch controls.

### 6. Executable Checklist & Verification Gates
- [ ] Switch `"board probe"` (`world.ts:315`) to `update: "on-demand"` refreshed once at HDRI load and on `applyBoardLook`, and enable AgX output + macro `effects.depthOfField` + `effects.screenSpaceReflections`.
- [ ] Replace raw cone/cube/torus/disc sentries with 4 directional KTX2 micro-drone GLBs, remove the opaque `courier-shell` octahedron, replace the 10 D20 `PEDESTALS` with Nixie/capacitor/heatsink GLBs, collapse `pool-wall` `200×` clearcoat draw expansion into batched epoxy IC chips, and add the paired GLSL+WGSL copper-trace pulse shader.
- [ ] Fit the PCB to 78%+ of `390x844` portrait in `camera.ts`, wire `createFixedStepPresenter`, and add Overclock vulnerable-sentry strobe + electric arc `effects.flipbook` VFX.
- [ ] Replace `"Graphik Web"` (`styles.css:25`) with `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` (`font-synthesis: none`) and un-clip the mobile board switcher.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-dot-dash-3d/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-dot-dash-3d/src
  pnpm vitest run tests/unit/dot-dash-3d/
  npx @aura3d/cli look lint apps/showcase-dot-dash-3d --json
  node tools/game-checks/run.mjs showcase-dot-dash-3d
  ```

---

## WP-14 — Cross Hop (`showcase-cross-hop`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-cross-hop/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-cross-hop/{package.json,index.html,aura.assets.json}`, `src/styles.css`, `src/main.ts`, `src/aura-assets.ts` (`27` admitted critter & vehicle Meshy GLBs)
  - Game: `src/game/{core,critterLook,diorama,loadingUx,look,persistence,qa,shade,themes,ui,vfx,world}.ts` (`shade.ts` already ships paired GLSL+WGSL)
- **Genre Look Recipe:** Vibrant Tilt-Shift Toy-Crossing Diorama (`looks.preset("outdoor-day")` / `"golden-hour"` / `"night-city"` across 6 themes + river/wet-street SSR + subtle horizon tilt-shift DoF).
- **Current Rendering & Screenshot Diagnosis (`evidence/cross-hop/screens/final/`):**
  - **CRITICAL ARCHITECTURAL FINDING — `vivid` Mode Accidentally Disabled 80% of Cross Hop's Built Upgrades (`src/main.ts:41–53`, `src/game/core.ts:656–1483`):** Setting `VIVID_DEFAULT_THEMES = [0,1,2,3,4,5]` to keep the shallower chase camera **turned off**: (1) per-surface lane materials (`pool-felt`, `pool-asphalt`, `pool-gravel`, `pool-lava`), reverting lanes to 1 flat untextured `instances.box`, (2) `critterOverrides` & `VEHICLE_OVERRIDES` clearcoat/rim lobes, (3) tilt-shift `effects.depthOfField`, (4) all 5 per-theme `ambientNode` weather emitters (`pollen`, `fireflies`, `embers`, `rain`, `confetti`) and 12 pooled `lamp` point lights, (5) **every landing VFX (`landingEffect` at `core.ts:1073` returns early when `lookMode !== "diorama"`)**, and (6) volume-preserving `hopScale` squash-and-stretch!
  - **Barren Ruler-Flat Horizon, Lego Rafts & 3 Coupled Steam Engines (`card-2x.jpg`, `1280-03-action.jpg`, `390-03-action.jpg`):** `fog.density: 0` exposes an empty ruler-straight green plane at row 18; rivers are flat `#3f8fd2` boxes with zero ripples/foam/SSR; `pool-pad` lilypads are green hockey-puck cylinders; `pool-raft` logs are orange Tupperware bricks; `core.ts:1448` couples **3 identical `trainCar` steam locomotives nose-to-tail** instead of 1 engine + 2 coaches; and `assets.hop` stands upright like a tiny human in a frog suit (`Walking_Woman` rig)!
  - **Banned `"Graphik Web"` & UI Clutter (`styles.css:3`, `1280-01`, `390-03`):** `#hud` uses `"Graphik Web"`, `#ch-ticker` floats an orphan `"Quick Play"` string over Hop's feet, `#ch-menu` is a generic dark 5-button modal, and `390x844` clips the world bar at `Ember`.
- **Current Sub-Scores (`/10`):** Lighting/Post `6.3` · Materials/Assets `5.7` · VFX/Animation `5.9` · UI/UX/Typography `6.1` · Perf/WebGPU `8.6` → **Overall `6.5 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Unify the Horizon-Framing `vivid` Camera With the Full `diorama` Lighting & Post Stack (`src/game/core.ts:599–668`, `look.ts`):**
  - Keep the horizon-seeing chase camera (`CAM`, `fov: 46`) while enabling across all 6 worlds (`Meadow Roads`, `Downtown Trams`, `Riverbend` + `effects.godRays`, `Emberline`, `Neon District`, `Critter Core`):
    - 2-cascade `2048` directional `sun-key` + 12 pooled street/neon/lava `lights.point` (`syncLamps`) + per-theme HDRI specular IBL (`background: false`) + `output: { toneMapping: "agx", exposure: 1.02, dither: true }`.
    - `effects.contactShadows({ length: 0.3, thickness: 0.05, steps: 16, intensity: 0.65 })`, `effects.ambientOcclusion({ intensity: 0.56, radius: 0.42, multiBounce: true })`, **`effects.screenSpaceReflections({ intensity: 0.58, maxDistance: 14, roughness: 0.22, thickness: 0.25 })`** (reflecting cars, trams, and neon signs in rivers and rain-wet Neon District lanes!), `looks.fogForExtent({ extent: 54, haze: 0.34 })`, `effects.cinematicBloom({ threshold: 0.90, intensity: 0.28 })`, and subtle `effects.depthOfField({ tiltShift: { bandCenter: 0.62, bandWidth: 0.44 } })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Un-Gate Multi-Lobe Overrides, Dual-Backend River/Lava Shaders & Real Train Coaches (`src/game/core.ts:746–868, 1420–1460`, `critterLook.ts`):**
  - Apply `critterOverrides` and `VEHICLE_OVERRIDES` (`material.clearcoatPaint` toy-car gloss + KTX2 graphic livery retexture on `trafficBoxtruck`'s blank grey side) unconditionally in default play!
  - Replace flat blue `v-water` boxes with a **paired GLSL 3.00 + WGSL scrolling caustics, shoreline-foam & log-wake water shader** (`material.custom` / `material.caustics`), and replace flat `s-lava` boxes with a paired GLSL+WGSL glowing Voronoi magma-crust shader.
  - Replace cylinder `pool-pad` and Tupperware `pool-raft` bricks with admitted **notched 3D lotus-lilypad** and **strapped timber-log raft GLBs** (`instances.model`); admit a **`trainCoach` passenger carriage GLB** so trains spawn `1` `trainCar` locomotive + `2` `trainCoach` cars; add a rolling horizon ridge/skyline skirt anchored to `pz - 38` + dense verge trees/shopfronts; and re-pose/replace `assets.hop` into a crouched toy-amphibian stance!

### 4. Animation, Camera Choreography & Game Juice
- **Restore All Hop Squash/Stretch, Splash VFX & Rail Telegraphing (`src/game/core.ts:878, 1028, 1073, 1483, 1691`):**
  - Remove every `if (lookMode !== "diorama")` early return so **every hop** fires volume-preserving anticipation/stretch/landing squash (`hopScale`), 70ms smooth yaw turns, turf dust, water splash + expanding ripple rings, lava sparks, coin combo trails, and per-world weather particles!
  - Upgrade rail-crossing masts (`core.ts:1691`) with alternating red `lights.point` strobes, smooth hinged barrier-arm rotation (`0° → -90°`), and `createHitStop` (`60ms`) + whoosh shake on close train near-misses.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `"Graphik Web"` & Redesign Critter Showcase Title (`src/styles.css:3`, `src/game/ui.ts`):**
  - Replace `"Graphik Web"` with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` on `.ch-cap` / `#ch-theme`, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) on `#ch-score`, `#ch-coins`, and `#ch-best`, and **Monument Grotesk Mono** (`400`) on seed/row badges.
  - Replace the full-screen blurred 5-button `#ch-menu` with a compact frosted side plaque showcasing the live 3D critter on row 0 + 6-world postcards + rendered 12-critter grid; delete the orphan `#ch-ticker` `"Quick Play"` label over Hop's feet; and make `.aura3d-top-bar` scrollable on `390x844` (`>= 44px` hit areas).

### 6. Executable Checklist & Verification Gates
- [ ] Unify `vivid` chase camera with `diorama` surface pools, `critterOverrides`, `VEHICLE_OVERRIDES`, `syncLamps`, `ambientNode`, `effects.screenSpaceReflections`, `looks.fogForExtent`, tilt-shift `effects.depthOfField`, and AgX output in `src/game/core.ts`.
- [ ] Remove all `lookMode !== "diorama"` gates on `landingEffect`, `hopScale`, `turnToward`, and `comboTrail` (`core.ts:1028–1483`).
- [ ] Author paired GLSL+WGSL river-caustics/foam and magma shaders, replace cylinder lilypads/brick rafts with lotus-pad & timber-raft GLBs, admit `trainCoach` (`1` engine + `2` coaches), add the rolling horizon skirt, and fix `assets.hop`'s crouched amphibian posture.
- [ ] Replace `"Graphik Web"` (`styles.css:3`) with `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, delete the orphan `#ch-ticker` text, redesign `#ch-menu`, and make the `390x844` world bar scrollable.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-cross-hop/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-cross-hop/src
  pnpm vitest run apps/showcase-cross-hop/tests/ tests/unit/cross-hop/
  npx @aura3d/cli look lint apps/showcase-cross-hop --json
  node tools/game-checks/run.mjs showcase-cross-hop
  ```

---

## WP-15 — Shape Shift Sprint (`showcase-shape-shift-sprint`)

### 1. Paths & Mode
- **Mode & Architecture:** Standalone showcase app (`apps/showcase-shape-shift-sprint/`); `0` `three` packages or imports (`package.json` depends solely on `"@aura3d/engine": "workspace:*"`).
- **Exact Files:**
  - App & Config: `apps/showcase-shape-shift-sprint/{package.json,index.html,aura.assets.json}`, `src/aura-assets.ts`, `src/aura-model-assets.ts` (`toyCastleIsland`, `toyBlockTower`)
  - Game & Shaders: `src/{main,sim,look,world,meshes,scenery,scenery-wgsl,presentation,fx,hud,howto,audio,autopilot}.ts` (100% paired GLSL+WGSL today)
- **Genre Look Recipe:** Glossy Candy-Lacquer Vinyl Toybox Skyway Across 6 Milestone Worlds (`looks.preset("product-studio")` / `"golden-hour"` / `"neon-arcade"` + glossy track SSR + molded 3D shape-sorter blocks).
- **Current Rendering & Screenshot Diagnosis (`evidence/shape-shift-sprint/screens/final/`):**
  - **`toneMapping: "none"`, Zero Shadows & Unlit Flat Cel Look (`main.ts:241`, `world.ts:128–135, 190`):** `output: { toneMapping: "none", dither: false }` and `post = "lite"` leave road, walls, and player completely unshadowed with zero AO/SSR/bloom, while `toyCastleIsland` and `toyBlockTower` GLBs look bleached and pasted onto the sky (`action-1280.jpg`). Only 1 static biome exists across the entire run.
  - **Square Wall Holes With Paper-Flat 2D Sticker Rims (`card@2x.jpg`, `action-1280.jpg`, `action-390.jpg`):** `wallCellMesh()` (`src/meshes.ts:146–198`) cuts **3 identical `1.7 × 1.7m` square openings** and places a 0-thickness 2D polygon rim (`z + 0.03`) in front—leaving empty square corner gaps visibly exposed behind circular and triangular outlines!
  - **Road-Clipping Cube Corners & Muddy Grey Shield (`action-1280.jpg`, `world.ts:346`):** Player shapes are un-bevelled primitives; the tumbling cube rotates around fixed `y = 0.48 * scale` so its corners clip `-0.19m` into the track every 90°; the cone slides without hop/bank; and `"shield"` (`flatSpec(..., 0.24)`) wraps the yellow cube in a muddy grey-green sphere.
  - **HUD Popups Obscure Next Gate & Empty Pill Bug (`action-1280.jpg`, `card@2x.jpg`, `title-1280.jpg`):** `#popups` (`top: 24vh`) stacks `PERFECT +300` **dead-center over the upcoming wall's shape holes**; `#status-line.chip` (`hud.ts:64`) renders an empty bordered cream pill box when idle; `index.html` uses only `GT Walsheim Bold` + an Apple 3D silver speaker emoji `🔊` on `#btn-mute` (`index.html:182`).
- **Current Sub-Scores (`/10`):** Lighting/Post `6.4` · Materials/Assets `6.2` · VFX/Animation `6.9` · UI/UX/Typography `7.1` · Perf/WebGPU `9.0` → **Overall `7.1 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **AgX Candy-Lacquer Output, 6 Milestone Toybox Worlds & Track SSR (`src/main.ts:241`, `src/look.ts`, `src/world.ts`):**
  - Switch `main.ts:241` to `output: { toneMapping: "agx", exposure: 1.03, dither: true }` and progress smoothly through **6 Toybox Worlds** every `750` points (`Candy Skyway`, `Mint Cloudworks`, `Carousel Sunset` + `effects.godRays`, `Berry Sorbet Bay`, `Starlight Toybox` night neon, `Prism Crown`).
  - Enable real 2-cascade `2048` directional `sun-key` shadows + HDRI specular IBL (`background: false`) + `effects.contactShadows({ length: 0.25, thickness: 0.05, steps: 16, intensity: 0.65 })` + `effects.ambientOcclusion({ intensity: 0.52, radius: 0.40 })` + **`effects.screenSpaceReflections({ intensity: 0.55, maxDistance: 16, roughness: 0.20, thickness: 0.25 })`** (mirroring red/yellow/blue gate rims in the glossy track!) + `effects.cinematicBloom({ threshold: 1.05, intensity: 0.26 })` + distant island `effects.depthOfField`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **True Molded 3D Shape-Sorter Cutout Gates — Zero Square Corner Gaps (`src/meshes.ts:146–198`):**
  - Replace the square-hole `wallCellMesh()` with a **triangulated annulus faceplate** bridging the outer `cellWidth × cellHeight` frame directly to `outlinePoint(shapeIndex, t, RIM_OUTER)` (`circle`, `rounded-square`, `rounded-triangle`) extruded through chunky `0.48m` wall depth with a **3D bevelled collar**—eliminating every empty square corner gap!
- **Bevelled Clearcoat Toy Forms, Sculpted Tokens & Fresnel Glass Bubble (`src/meshes.ts:139`, `src/scenery.ts`, `src/scenery-wgsl.ts`):**
  - Upgrade the 3 player forms to chamfered vinyl-toy geometry (superellipsoid rounded cube, filleted toy cone, grooved marble sphere) with GGX clearcoat specular + shadow-map reception in `toyToonSpec` + `toyFragmentWgsl` (`clearcoat = 1.0, clearcoatRoughness = 0.06`), and harmonize `toyCastleIsland` & `toyBlockTower` (`castShadow: true, receiveShadow: true`, KTX2 retexture).
  - Replace the muddy `"shield"` sphere with a **paired GLSL 3.00 + WGSL iridescent Fresnel soap/glass bubble shader** (`alpha` concentrated at `pow(1.0 - dot(N, V), 3.5)` so the player's yellow/red/blue pigment stays 100% vibrant), and replace `12×8` sphere tokens with sculpted 3D gyroscope/star-prism/buckler/twin-bolt medallions.

### 4. Animation, Camera Choreography & Game Juice
- **Exact Cube Corner-Lift Physics & Elastic Morph Shockwave (`src/world.ts:339–348`, `src/fx.ts`):**
  - Add exact center-of-mass lift `dy = baseY * p.scale * (Math.SQRT2 - 1) * Math.abs(Math.sin(p.rotX * 2))` during cube `rotX` tumble so corners kiss `y = 0` without ever clipping into the track; add playful lateral bank + micro-hop to the cone; convert `squashT` into volume-preserving `[1/sqrt(sy), sy, 1/sqrt(sy)]` gate-squeeze stretch; and fire `35ms` `createHitStop` + `createJuice` FOV punch + elastic cross-scale pop + `effects.auroraRibbon` chromatic shockwave on every shape morph and `PERFECT` gate pass!

### 5. UI/UX, HUD & Mobile Polish
- **Unblock Gate Sightline, Hide Empty Pill & Migrate Fonts (`index.html:27, 53–60, 182`, `src/hud.ts:61–65`):**
  - Move `#popups` (`PERFECT +300`) out of the center gate sightline (`top: 24vh` → `top: 12vh` offset arc) so upcoming holes are NEVER blocked; toggle `this.status.classList.toggle("hidden", status === "")` in `hud.ts:64` to banish the empty `#status-line` pill box!
  - Load self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` chip labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) for `#score`, `#best`, `#mult` (`×5`), and powerup timers, and **Monument Grotesk Mono** (`400`) for seed/telemetry; replace the Apple `🔊` emoji (`index.html:182`) with a crisp inline SVG speaker icon and add a subtle first-touch lane-drag cue on `390x844`.

### 6. Executable Checklist & Verification Gates
- [ ] Switch `main.ts:241` to AgX output (`toneMapping: "agx"`), add the 6 milestone Toybox worlds, and enable 2-cascade `sun-key` shadows + `effects.contactShadows` + `effects.ambientOcclusion` + track `effects.screenSpaceReflections` + `effects.cinematicBloom`.
- [ ] Rebuild `wallCellMesh()` (`meshes.ts:146–198`) as an extruded shape-cutout annulus + 3D bevelled collar (zero square corner gaps!), bevel the 3 player forms with clearcoat speculars, and replace the muddy shield with a paired GLSL+WGSL Fresnel bubble shader.
- [ ] Fix cube corner ground-clipping (`world.ts:346`), add volume-preserving gate squeeze, and trigger `createHitStop` + elastic morph shockwaves.
- [ ] Move `#popups` off the gate sightline (`index.html:53`), hide `#status-line` when empty (`hud.ts:64`), replace `🔊` with SVG, and load `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`.
- [ ] Run verification gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-shape-shift-sprint/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-shape-shift-sprint/src
  pnpm vitest run tests/unit/shape-shift-sprint/ tests/unit/apps/shape-shift-sprint-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-shape-shift-sprint --json
  node tools/game-checks/run.mjs showcase-shape-shift-sprint
  ```

---

## WP-16 — Number Surge (`showcase-number-surge`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-number-surge/` (`@aura3d/showcase-number-surge`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-number-surge/src/{main.ts,sim.ts,world.ts,meshes.ts,scenery.ts,scenery-wgsl.ts,roadside.ts,look.ts,presentation.ts,fx.ts,hud.ts,audio.ts}` + `apps/showcase-number-surge/index.html` + 4 admitted Meshy GLBs in `src/aura-model-assets.ts` (`nsFloatingDice`, `nsNeonPalm`, `nsNumeralSeven`, `nsPinkPalm`).
- **Evidence Reviewed (`evidence/number-surge/screens/final/`):** `title-1280.jpg`, `mid-1280.jpg`, `action-1280.jpg`, `action-390.jpg`.
- **Current Scores:** Lighting/Post `5.5` | Materials/Assets `5.0` | VFX/Animation `6.0` | UI/UX/Typography `5.5` | Perf/WebGPU `8.5` → **Overall: `5.8 / 10`** (`108.8` WebGL2 / `103.5` WebGPU fps, `0.92x` median, `?worker=1`, reversed depth).
- **Screenshot-Verified Defects:**
  1. **Sticker-on-Circle Player Avatar (`mid-1280.jpg`, `action-1280.jpg`, `action-390.jpg`):** `ball` (`sphereMesh(0.55)`) renders as a flat cel-shaded cyan circle while `ball-label` (`quadMesh(0.85, 0.85)` in `src/world.ts:226`) floats rigidly in front as an uncurved flat quad—numerals (`"689"`, `"981"`) read like flat paper stickers rather than curved energy inlays; `shield` (`flatSpec` alpha `0.24`) is a featureless translucent green disc.
  2. **Razor-Thin Cardboard Math Gates & Monolithic Boss Bricks (`mid-1280.jpg`, `action-1280.jpg`):** `gatePanelMesh` (`boxMesh(2.9, 3.0, 0.12)`) and 3-box `gateFrameMesh` float above the deck with zero contact shadows, zero frosted-glass Fresnel refraction, and zero metallic frame bevels; `wallMesh` (`boxMesh(7.2, 3.6, 0.6)`) is an unsegmented orange slab with no visual breakable-vs-lethal cue (`playerValue >= wallCost`).
  3. **Disabled Tone Mapping & Fake Ground Glow (`src/main.ts:288`, `src/world.ts:212`):** `output: { toneMapping: "none", dither: false }` disables HDR bloom, specular dynamic range, and gradient dithering, forcing fake `edge-glow` alpha strips on the road; `roadside.ts:104-125` mounts 18 individual `model()` nodes instead of `instances.model(...)`.
  4. **Typography & Mobile Touch Defects (`index.html:100-112`, `action-390.jpg`):** Loads prohibited `GT-Walsheim-Bold.woff2` (`700`) globally without `tabular-nums`, and `#corner-buttons button` (`~36px` tall) violates the `44x44px` coarse-pointer floor.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output & Color Grading (`src/main.ts:288`):** Upgrade `createAuraApp` from `toneMapping: "none"` to `output: { preset: "neon-night", toneMapping: "agx", exposure: 1.05, dither: true, outputColorSpace: resolveGamut() }` (enabling `?gamut=p3` Display-P3 wide-gamut neon cyan/magenta saturation) and delete the fake `edge-glow` alpha quad batch (`src/world.ts:212`).
- **Look Preset, Studio Glass IBL & Shadowed Key (`src/world.ts`, `src/look.ts`):** Mount `looks.preset("neon-arcade", { exposureEv: 0.18, fogDensityScale: 0.85 })` + `environments.studio({ preset: "softbox", intensity: 0.72, background: false })` + `lights.key({ position: [-14, 24, 16], target: [0, 0, -12], color: "#ffe6c8", intensity: 2.8, shadow: { cascades: 2, maxDistance: 90, mapSize: 2048 } })` + cool fill `lights.hemisphere({ skyColor: "#6e7bff", groundColor: "#1a1033", intensity: 0.5 })` (`aura3d look lint` zero-ambient clean).
- **Eevee Post Stack:** Add `effects.contactShadows({ length: 0.35, thickness: 0.2, steps: 12, intensity: 0.65 })`, `effects.ambientOcclusion({ intensity: 0.45, radius: 0.6 })`, **`effects.screenSpaceReflections({ intensity: 0.55, roughness: 0.28 })`** (mirroring cyan `+`/`×` and coral `−`/`÷` holographic math portals cleanly across the wet slate-indigo runway!), `effects.volumetricBeam` flanking boss-wall portals, WebGPU-batched `effects.depthOfField({ focusDistance: 14, fStop: 4.0, focalLength: 35 })` on title/results & far skyline, `looks.fogForExtent({ extent: 220, color: "#1d1b4b", haze: 0.65, mode: "exp2" })`, and `effects.cinematicBloom({ intensity: 0.48, threshold: 0.78 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Chamfered Portal Stanchions & Holographic Frosted-Glass Gate Shader (`src/meshes.ts`, `src/world.ts`):** Replace 3-box `gateFrameMesh` with beveled arch stanchions (`primitives.roundedBox`) shaded via `material.chrome({ roughness: 0.14 })` + `material.glowingEmissive` operator caps. Upgrade `gatePanelMesh` (`src/world.ts:215`) to a paired GLSL 3.00 + WGSL `material.custom` **`frostedGateSpec`** (`a3d_math` + `a3d_fog`) with Schlick `ior: 1.52` edge Fresnel, animated horizontal holographic scanlines, interior parallax micro-grid, and crisp SDF `DIN Pro` operator numerals.
- **Segmented Crystal-Masonry Boss Walls (`src/meshes.ts`, `src/world.ts`):** Replace flat `wallMesh` with chamfered multi-brick crystal masonry using `material.lacquer` + a paired GLSL 3.00 + WGSL crack-stress shader driven by `uBreakRatio = clamp(playerValue / wallCost, 0.0, 1.5)` that veins breakable walls with molten gold fissures when `playerValue >= wallCost` vs pulsing crimson warning runes when fatal.
- **Spherical-Cap Energy Core & Hex Fresnel Shield (`src/world.ts:225-228`):** Wrap `ball-label` onto a curved `sphereCapMesh(0.565, 42°)` hugging a `material.clearcoatPaint({ color: "#18d8ff", clearcoat: 1.0, clearcoatRoughness: 0.06 })` energy core, and replace the flat `shield` disc with a paired GLSL 3.00 + WGSL hexagonal Fresnel barrier shader.
- **Retextured & Instanced Roadside GLBs + Zero-`refreshBounds` Track Chunks (`src/roadside.ts`, `src/world.ts`):** Run `aura3d-retexture` + KTX2 compression on `nsNeonPalm`, `nsPinkPalm`, `nsFloatingDice`, and `nsNumeralSeven` into cohesive glossy synth-arcade lacquer, collapse `roadside.ts`'s 18 individual `model()` nodes into **4 `instances.model(...)` batches**, and replace dynamic `Batch` scrolling on static `road`/`rails`/`dashes` with periodic `instances.roundedBox` chunks scrolled via `chunk.setPosition(0, 0, zOffset)`.

### 4. Animation, Camera Choreography & Game Juice
- **Logarithmic Value-Evolution Satellites (`src/world.ts`, `src/presentation.ts`):** Drive `instances.sphere` orbiting satellite cores + plasma rings around the hero ball scaled by `floor(log10(playerValue))` (`10+` = 2 micro-satellites, `100+` = 5 satellites + equatorial ring, `1,000+` = 8 satellites + golden surge crown) while keeping `sim.ts` lane hitboxes untouched.
- **High-Refresh Motion & Impact Choreography (`src/presentation.ts`, `src/fx.ts`, `src/main.ts`):** Preserve 60 Hz `createFixedStepPresenter` (`0%` stalled frames at 120/144 Hz), wire `@aura3d/engine/game` `createHitStop` (`35 ms` on boss-wall smash, `0 ms` under `prefers-reduced-motion`), `createJuice` + `createCameraShake` + `1.8°` FOV surge punch on `×2`/`×3` gates, `effects.meshParticles` crystal-brick shatter chunks on wall breakthrough, and a cyan/gold `effects.trail` speed ribbon.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`index.html`, `src/hud.ts`):** Purge `GT-Walsheim-Bold` (`700`) from `body`; self-host `.woff2` `Whitney` (`400`/`500`/`600` with `tnum` & lowercase `smcp` `>= 12px` on `score`, `best`, `surge`), `DIN Pro` (`500` `tabular-nums` on ball value, gate math, score, and wall cost), and `Monument Grotesk Mono` (`400` on seed/diagnostics) with `html { font-synthesis: none }`.
- **1-Second Wall Affordance & Mobile Ergonomics:** Lock a compact world-projected status chip (`SMASH −275` in emerald-gold vs `DANGER 1561` in coral) onto approaching boss walls, style `#hud` as a compact smoked-glass pill, enlarge `#corner-buttons button` to `44x44px` minimum with `env(safe-area-inset-*)`, and add a subtle bottom thumb-glide lane rail on `pointer: coarse` (`390x844`).

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Switch `apps/showcase-number-surge/src/main.ts` to `output: { preset: "neon-night", toneMapping: "agx", exposure: 1.05, dither: true, outputColorSpace }` and mount `looks.preset("neon-arcade")`, `lights.key` (2 cascades), `contactShadows`, `ambientOcclusion`, `screenSpaceReflections`, `volumetricBeam`, `depthOfField`, and `cinematicBloom` (`aura3d look lint` clean).
- [ ] Author paired GLSL 3.00 + WGSL `frostedGateSpec`, crystal-masonry `uBreakRatio` wall shader, curved `sphereCapMesh` core numerals, and hex-Fresnel shield; retexture + KTX2-compress the 4 Meshy GLBs and batch via 4 `instances.model(...)` groups in `src/roadside.ts`.
- [ ] Add logarithmic orbiting value-evolution satellites, `createHitStop`, `createJuice` FOV surge punch, `effects.meshParticles` wall shatter, and `effects.trail`.
- [ ] Migrate `index.html` + `src/hud.ts` to `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono` (`font-synthesis: none`), add `SMASH`/`DANGER` wall chips, and enforce `>= 44x44px` mobile controls on `390x844`.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-number-surge typecheck && pnpm --filter @aura3d/showcase-number-surge build`, `pnpm vitest run tests/unit/number-surge`, `node tools/game-checks/run.mjs number-surge`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (`backend: "auto"` WebGPU `>= 0.92x` WebGL2 at `>= 95 fps`, `?worker=1`, 0 console/page errors, `1280x720` & `390x844` captures).

---

## WP-17 — Splat Turf (`showcase-splat-turf`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-splat-turf/` (`@aura3d/showcase-splat-turf`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-splat-turf/src/{main.ts,sim.ts,world.ts,scenery.ts,meshes.ts,look.ts,presentation.ts,fx.ts,hud.ts,audio.ts}` + `src/art/{ball.ts,haze.ts}` + `apps/showcase-splat-turf/index.html` + 6 high-poly Meshy GLBs in `src/aura-model-assets.ts` (`balloon`, `easelIsland`, `islandTower`, `islandTree`, `paintPotIsland`, `paletteIsland` — `12k–28k` tris each).
- **Evidence Reviewed (`evidence/splat-turf/screens/final/`):** `title-1280.jpg`, `mid-1280.jpg`, `action-1280.jpg`, `action-390.jpg`.
- **Current Scores:** Lighting/Post `5.5` | Materials/Assets `5.0` | VFX/Animation `5.5` | UI/UX/Typography `5.5` | Perf/WebGPU **`2.5`** → **Overall: `4.8 / 10`** (**`10.7` WebGL2 / `10.2` WebGPU fps** in active play — critical playability & visual blocker).
- **Screenshot- & Source-Verified Defects:**
  1. **Catastrophic 5–10 FPS Bottleneck (`src/world.ts:119, 125-137`, `src/scenery.ts:141-235`):** Five compounding bugs collapse frame rate: (a) `addBatch()` omits `castShadow: false` on 17 `OPEN_BOUNDS` batches (~215k dynamic vertices rendered into the shadow cascade every frame), (b) `props = new Batch(propMesh(), 440)` (`99,000` vertices) triggers full-buffer JS float validation + CPU `Geometry.refreshBounds()` 16–24×/s alongside 10 other scrolling batches, (c) all `6 × 1,200 = 7,200` turf paint quads (`28,800` verts) stream CPU `updateAttribute("tone")` floats, (d) 14 un-decimated, un-instanced Meshy island `model()` nodes submit `319,092` triangles, and (e) `sampleQuality` throttles `pixelRatio` to `1.0`, causing severe stair-step aliasing jaggies in `action-1280.jpg`.
  2. **Blinding Flat `#ffffff` Deck & Seamed 1 m Paint Rectangles (`mid-1280.jpg`, `action-1280.jpg`, `action-390.jpg`):** Unpainted road has zero gesso/concrete micro-texture or AO, while painted cells show hard rectangular 1 m grid seams with **zero wet-paint thickness, raised meniscus lip, organic splatter edges, or glossy SSR specular highlights**.
  3. **Muddy Meshy Albedos & Toy Props (`mid-1280.jpg`):** `paintPotIsland` and `easelIsland` carry muddy grey-brown baked Meshy textures clashing with the pastel sky; `propMesh` trees are primitive cylinder+sphere lollipops; `eraserBots` are tiny unreadable grey pucks.
  4. **HUD & Typography Gaps:** Global `GT-Walsheim-Bold` (`700`) policy violation, zero `1,200 m` finish-line progress indicator, and zero `C / B / A / S` grade threshold ticks on the coverage readout.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output & Color Grading (`src/main.ts:236`):** Switch from `toneMapping: "none"` to `output: { preset: "daylight-outdoor", toneMapping: "agx", exposure: 1.0, dither: true, outputColorSpace: resolveGamut() }` and delete `effects.outline` (`src/world.ts:158`) so full `1.5–2.0` `devicePixelRatio` runs crisp and jaggy-free at `90+ fps`.
- **Sunlit Art-Park Look & Studio Softbox IBL (`src/world.ts`, `src/look.ts`):** Mount `looks.preset("outdoor-day", { sun: { elevationDeg: 48, azimuthDeg: -32 }, exposureEv: 0.08 })` + `environments.studio({ preset: "softbox", intensity: 0.78, background: false })` (giving wet acrylic paint broad, creamy Blender-style specular studio highlights!) + `lights.key({ shadow: { cascades: 2, maxDistance: 85, mapSize: 2048 } })` (`aura3d look lint` clean).
- **Eevee Wet-Paint Post Stack:** Add `effects.contactShadows({ length: 0.28, thickness: 0.18, steps: 12, intensity: 0.55 })`, `effects.ambientOcclusion({ intensity: 0.38, radius: 0.55 })`, **`effects.screenSpaceReflections({ intensity: 0.54, roughness: 0.22 })`** (festive pennants, aerosol cans, and cel clouds mirroring crisply in fresh wet cyan/coral/magenta acrylic turf!), WebGPU-batched `effects.depthOfField` on splash/results, `looks.fogForExtent({ extent: 260, color: "#bfe8ff", haze: 0.48, mode: "exp2" })`, and `effects.cinematicBloom({ intensity: 0.3, threshold: 0.86 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Single-Draw `texture.data` RGBA8 GPU Splat Map (`src/world.ts:137, 201-218`):** Replace the `28,800`-vertex `paint` `Batch` with **one static beveled track ribbon** backed by `texture.data({ width: 32, height: 1200, data: splatRgba8, format: "rgba8", colorSpace: "linear" })` (`R`: pigment ID, `G`: paint thickness, `B`: wetness decay, `A`: coverage mask). Painting or erasing a cell mutates 4–16 bytes in `splatRgba8`—**0 vertex uploads, 0 CPU `Geometry.refreshBounds()`, 1 draw call instead of 7,200 quads!**
- **Paired GLSL 3.00 + WGSL Wet-Acrylic Meniscus & Gesso Canvas Shader (`material.custom`):** Sample `uSplatMap` with domain-warped FBM UV jitter (`a3d_noise`) so grid cells dissolve into organic splattered brushstrokes; compute central-difference height gradients on `G` (`thickness`) to perturb surface normals into a **3D raised wet-paint meniscus lip**, transitioning from warm woven gesso canvas (`#f6f3ea`, `roughness: 0.72`) into rich acrylic pigments (`roughness = mix(0.62, 0.05, wetness)`) with dual-lobe clearcoat specular!
- **Zero-`refreshBounds` Track Chunks & Decimated/Retextured Island GLBs (`src/world.ts`, `src/scenery.ts`):**
  - Replace all dynamic scrolling `Batch`es (`road`, `edges`, `keel`, `drips`, `posts`, `bulbs`, `pennants`, `islets`, `props`) with periodic static `instances.*` / `group` chunks scrolled via `chunk.setPosition(0, 0, zOffset)` (eliminating the `99,000`-vert CPU scan) and set `castShadow: false, receiveShadow: false` on sky/cloud/particle layers.
  - Decimate the 6 Meshy island GLBs from `12k–28k` tris down to `3k–4.5k` tris each, repaint via `aura3d-retexture` + KTX2 into clean gouache/pastel palettes (`aura3d assets inspect` bounds/hash verified), and mount via **6 `instances.model(...)` nodes** (`~45k` tris & 6 draws vs `319k` tris & 14 draws).
  - Upgrade hero `ball` (`src/art/ball.ts`) with a gimbaled `material.chrome` paint-roller yoke, `cans` with `material.lacquer` + `material.chrome` aerosol nozzles, and `bots` with articulated spinning floor-scrubber foam rings + `material.glowingEmissive` hazard beacons.

### 4. Animation, Camera Choreography & Game Juice
- **Pressurized Spray & Splatter Choreography (`src/presentation.ts`, `src/fx.ts`, `src/main.ts`):** Keep 60 Hz `createFixedStepPresenter` rock-solid at 90–144 Hz, add continuous pressurized paint-mist `effects.particles` behind the roller yoke, fire `effects.flipbook` wet-ink splatter sprite sheets (`WP-00` shared KTX2 pack) on canister pickup and bot collision, and trigger `@aura3d/engine/game` `createHitStop` (`30 ms` on scrubber-bot hit) + `createJuice` squash-and-stretch on lane swoops.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`index.html`, `src/hud.ts`):** Replace `GT-Walsheim-Bold` (`700`) with `.woff2` `Whitney` (`500`/`600` `tnum`, lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` for coverage `%` and remaining `m`), and `Monument Grotesk Mono` (`400`) with `html { font-synthesis: none }`.
- **Coverage Grade Bar, Finish Progress & Glass Ink Cylinder:** Add a top turf-coverage progress bar marked with **`C (10%) / B (20%) / A (35%) / S (50%)`** ticks + a **`1,200 m` finish-line progress strip**, restyle the right-hand ink gauge into a tactile glass pressure cylinder showing live pigment level, and enforce `>= 44x44px` safe-area touch controls on `390x844`.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Replace the `7,200`-quad `paint` `Batch` in `apps/showcase-splat-turf/src/world.ts` with a single static track ribbon + `texture.data` RGBA8 splat map + paired GLSL 3.00 + WGSL wet-acrylic meniscus/gesso shader.
- [ ] Convert `props` (`99k` verts) and static scrolling corridor batches to periodic `instances.*` chunks, disable shadow casting on non-shadowed batches, decimate + `aura3d-retexture` + KTX2-compress the 6 Meshy islands into 6 `instances.model(...)` batches, and remove `effects.outline`.
- [ ] Mount `output: { preset: "daylight-outdoor", toneMapping: "agx", dither: true }`, `looks.preset("outdoor-day")`, `environments.studio`, `contactShadows`, `ambientOcclusion`, `screenSpaceReflections`, and `cinematicBloom` (`aura3d look lint` clean).
- [ ] Add gimbaled chrome roller yoke, articulated scrubber bots, `effects.flipbook` paint-splatter bursts, `createHitStop`, `.woff2` `Whitney`/`DIN Pro`/`Monument Grotesk Mono` HUD, `C/B/A/S` grade bar + `1,200 m` progress strip, and `>= 44px` mobile controls.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-splat-turf typecheck && pnpm --filter @aura3d/showcase-splat-turf build`, `pnpm vitest run tests/unit/splat-turf`, `node tools/game-checks/run.mjs splat-turf`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (**sustained `>= 90 fps`** on both WebGL2 and WebGPU, WebGPU `>= 0.92x` WebGL2, `dpr >= 1.5`, `?worker=1`, 0 errors).

---

## WP-18 — Polarity Orbs (`showcase-polarity-orbs`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-polarity-orbs/` (`@aura3d/showcase-polarity-orbs`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-polarity-orbs/src/{main.ts,sim.ts,world.ts,scenery.ts,scenery-wgsl.ts,backdrop.ts,meshes.ts,look.ts,presentation.ts,fx.ts,hud.ts,audio.ts}` + `apps/showcase-polarity-orbs/index.html` + 6 Meshy GLBs in `src/aura-model-assets.ts` (`poCrystalBlue`, `poCrystalIsland`, `poCrystalIslandB`, `poCrystalRed`, `poMagnet`, `poChargeCoil`).
- **Evidence Reviewed (`evidence/polarity-orbs/screens/final/`):** `title-1280.jpg`, `action-1280.jpg`, `action-390.jpg`.
- **Current Scores:** Lighting/Post `6.0` | Materials/Assets `5.5` | VFX/Animation `5.8` | UI/UX/Typography `5.8` | Perf/WebGPU `8.2` → **Overall: `6.0 / 10`** (`62.5` WebGL2 / `57.8` WebGPU fps, `0.95x`, `?worker=1`, reversed depth).
- **Screenshot-Verified Defects:**
  1. **Ambiguous Lavender-Purple Mid-Flip Ball & Matte Clay Orbs (`action-1280.jpg`, `action-390.jpg`):** Hero `ball` and track `orbs` use matte 2-band `toonSpec` clay shading, and `mixRgb(LINEAR.red, LINEAR.blue, mix)` blends the player sphere into an unreadable lavender-purple mid-flip so players cannot tell at runner speed whether they are `+` (crimson) or `−` (cyan).
  2. **Flat Geometric Washer Shockwave & Rigid Stick Streams (`action-1280.jpg`, `action-390.jpg`):** `shockwave` (`ringMesh(0.85, 1.0, 48)`) is an un-feathered blue washer lying flat on the deck; magnetic attraction `streams` (`boxMesh(0.06, 0.06, 1)`) are rigid rectangular sticks instead of curved dipole flux arcs.
  3. **Low-Contrast Brownish Dusk Soup & Un-Culled Shadow Leak (`title-1280.jpg`, `action-1280.jpg`, `src/world.ts:148`):** Heavy vertex fog under `toneMapping: "none"` washes 8-sided faceted mountain cones and distant Meshy coils into muddy grey-brown haze, while `OPEN_BOUNDS` batches cast unnecessary directional shadows and `backdrop.ts` mounts 16 un-instanced `model()` nodes.
  4. **Disconnected Polarity Readout & `<12px` Badges (`index.html:92`, `action-390.jpg`):** `#polarity-icon` sits far away in the top-right corner, `.badge` pills (`RAINBOW`, `x2`, `MAGNET`) use `11px` font without remaining-time bars, `GT-Walsheim-Bold` (`700`) violates font policy, and single-gesture drag+tap causes accidental flips on `390x844`.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output & Color Grading (`src/main.ts:242`):** Switch to `output: { preset: "cinematic-film", toneMapping: "agx", exposure: 1.05, dither: true, outputColorSpace: resolveGamut() }`.
- **Magnetosphere Dusk Look, Night-Cinematic IBL & Polarity Point Light (`src/world.ts`, `src/look.ts`):** Mount `looks.preset("golden-hour", { exposureEv: 0.12 })` + `environments.nightCinematic({ intensity: 0.72, background: false })` + `lights.key({ shadow: { cascades: 2, maxDistance: 90, mapSize: 2048 } })` + a dynamic under-ball `lights.point({ intensity: 2.2, range: 6.5 })` snapping cleanly between `#ff3b5c` (`+`) and `#22b8ff` (`−`) (`aura3d look lint` clean).
- **Eevee Post Stack & Overhead Magnetosphere Aurora:** Add `effects.contactShadows({ length: 0.3, thickness: 0.18, steps: 12, intensity: 0.6 })`, `effects.ambientOcclusion({ intensity: 0.42, radius: 0.65 })`, **`effects.screenSpaceReflections({ intensity: 0.6, roughness: 0.24 })`** (ferrofluid-glass split warm/cool track slabs reflecting glowing `+`/`−` plasma orbs and copper charge coils!), **`effects.auroraRibbon`** (overhead crimson/cyan magnetosphere curtains!), WebGPU-batched `effects.depthOfField` on splash/results, `looks.fogForExtent({ extent: 240, color: "#1c1833", haze: 0.52, mode: "exp2" })`, and `effects.neonBloom({ intensity: 0.52, threshold: 0.74 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Paired GLSL 3.00 + WGSL Dielectric Plasma-Core Orb Shader (`plasmaOrbSpec` via `material.custom`):** Replace matte `toonSpec` on `ball` and `orbs` with a clear dielectric glass outer shell (`ior: 1.52` Schlick Fresnel specular + IBL cubemap reflection) enclosing a swirling emissive dipole plasma core (`a3d_noise`) and an etched equatorial `+` / `−` ring. **Ban `mixRgb` lavender mud:** animate polarity switches via a **crisp `180°` gyroscopic hemisphere shell flip / sharp equatorial wipe** so every pixel stays unmistakably crimson `+` or cobalt-cyan `−`.
- **Ferrofluid Dipole Isoline Track, Feathered Pulse & Flux Arcs (`src/world.ts`, `src/meshes.ts`):** Upgrade `deck-warm` and `deck-cool` to brushed-metal + dark glass conduit slabs overlaid with animated dipole isolines (`sin(dipolePotential * 18.0 - uClock * 6.5)`); replace the solid washer `shockwave` with a feathered radial Fresnel wave shader; replace stick `streams` with curved sinusoidal electric-arc / magnetic-flux ribbons.
- **Retextured & Instanced Trackside Coils (`src/backdrop.ts`, `src/scenery.ts`):** Repaint `poChargeCoil`, `poMagnet`, `poCrystalRed`, `poCrystalBlue`, `poCrystalIsland`, and `poCrystalIslandB` via `aura3d-retexture` + KTX2 with `material.chrome` copper/steel windings and `material.glowingEmissive` cores, mount via **6 `instances.model(...)` groups**, pull `poChargeCoil` + `poMagnet` to `x = ±6.2..10.5 m` as trackside pylons, smooth `scenery-near` ridges (`radialSegments: 24`), and set `castShadow: false` on `OPEN_BOUNDS` track/particle batches.

### 4. Animation, Camera Choreography & Game Juice
- **Gyroscopic Flip Hop & Electric Arc Choreography (`src/presentation.ts`, `src/fx.ts`, `src/main.ts`):** Add a snappy `180°` gyroscopic shell flip + `0.18 m` magnetic micro-hop in `presentation.ts`, dual-polarity `effects.trail` ribbon, `effects.flipbook` electric plasma-arc bursts on orb absorption and pylon discharge, and `@aura3d/engine/game` `createHitStop` (`40 ms` on opposite-polarity hit / shield break) + `createJuice` / `createCameraShake`.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`index.html`, `src/hud.ts`):** Replace `GT-Walsheim-Bold` (`700`) with `.woff2` `Whitney` (`500`/`600` `tnum`, lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` on score & combo multiplier), and `Monument Grotesk Mono` (`400`) with `html { font-synthesis: none }`.
- **Grounded Polarity Reticle, Timed Buff Pills & Dedicated Mobile `FLIP` Button:** Project a live grounded **`+` / `−` polarity reticle ring (`y = 0.03`)** directly under the hero orb (and enable crisp core `+`/`−` glyphs by default), raise `.badge` from `11px` to `12px` with depleting duration bars (`RAINBOW`, `x2`, `MAGNET`, `SHIELD`), enforce `>= 44x44px` HUD buttons, and add a dedicated `56x56px` bottom-right **`FLIP (+/−)` thumb button** on `pointer: coarse` (`390x844`) decoupling left-thumb lane steering from right-thumb polarity flips.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Mount `output: { preset: "cinematic-film", toneMapping: "agx", exposure: 1.05, dither: true }`, `looks.preset("golden-hour")`, `environments.nightCinematic`, polarity `lights.point`, `contactShadows`, `ambientOcclusion`, `screenSpaceReflections`, `auroraRibbon`, and `neonBloom` (`aura3d look lint` clean).
- [ ] Replace `toonSpec` orbs and `mixRgb` lavender blend with paired GLSL 3.00 + WGSL `plasmaOrbSpec` + `180°` hemisphere flip, dipole isoline track shader, feathered shockwave, and curved magnetic-flux arc ribbons.
- [ ] Retexture + KTX2-compress the 6 Meshy crystal/coil GLBs into 6 `instances.model(...)` batches in `src/backdrop.ts` and set `castShadow: false` on `OPEN_BOUNDS` scrolling batches (lifting WebGPU from `57.8` fps to `80+ fps`).
- [ ] Migrate `index.html` + `src/hud.ts` to `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, add grounded `+`/`−` orb reticle, `12px` timed buff bars, and `56x56px` right-thumb `FLIP` control on `390x844`.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-polarity-orbs typecheck && pnpm --filter @aura3d/showcase-polarity-orbs build`, `pnpm vitest run tests/unit/polarity-orbs`, `node tools/game-checks/run.mjs polarity-orbs`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2 at `>= 75 fps`, `?worker=1`, 0 errors).

---

## WP-19 — Beat Hopper (`showcase-beat-hopper`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** `apps/showcase-beat-hopper/` (`@aura3d/showcase-beat-hopper`, **standalone showcase app**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**). Key files: `apps/showcase-beat-hopper/src/{main.ts,sim.ts,world.ts,stage.ts,stage-shaders.ts,stage-shaders-wgsl.ts,dressing.ts,meshes.ts,look.ts,presentation.ts,fx.ts,hud.ts,input.ts,audio.ts}` + `apps/showcase-beat-hopper/index.html` + 3 Meshy GLBs in `src/aura-model-assets.ts` (`bhSpeakerStack`, `bhSpeakerStackB`, `bhTurntable`).
- **Evidence Reviewed (`evidence/beat-hopper/screens/final/`):** `title-1280.jpg`, `action-1280.jpg`, `action-390.jpg`.
- **Current Scores:** Lighting/Post `6.8` | Materials/Assets `5.8` | VFX/Animation `6.4` | UI/UX/Typography `5.6` | Perf/WebGPU `8.6` → **Overall: `6.4 / 10`** (`73.1` WebGL2 / `69.1` WebGPU fps, `0.94x`, `?worker=1`, reversed depth).
- **Screenshot-Verified Defects:**
  1. **Center-Screen `#popups` Vanishing-Point Occlusion (`action-1280.jpg`, `index.html:115-123`):** Six stacked floating popup strings (`PERFECT +60`, `DODGE +20`, `PERFECT +120`) sit at `top: 24%; left: 50%` directly on top of the track's horizon vanishing point, physically hiding approaching red dodge walls and cyan beat orbs.
  2. **Mobile `390x844` Arch Lintel Slicing Defect (`action-390.jpg`, `src/stage.ts:134-154`):** At `390x844` portrait (`fov = 80°`), `archMesh` + `archGlowMesh` (`top = 8.0..8.5 m`) slice horizontally straight across the upper sky right below `365 / BEST 0 / x2`.
  3. **Tic-Tac Capsule Avatar & 9 Disconnected Pink Cubes (`action-1280.jpg`, `action-390.jpg`, `src/world.ts:137-148`):** `playerMesh()` is an unarticulated cyan capsule and `headphonesMesh()` floats **9 separate tiny pink cubes** in a dotted arc over its head; `gaps` (`y = 0.07 m` *above* the deck) read like dark purple rugs rather than recessed laser chasms; both `deck` and `stage-floor` are 100% matte with zero SSR reflections.
  4. **Shadow Leak, Un-Instanced GLBs & Typography (`src/world.ts:163`, `src/dressing.ts`):** `OPEN_BOUNDS` batches cast shadows into `stage-key` unnecessarily, `dressing.ts` mounts 18 individual `model()` nodes (`art/direction.ts` leaves `assets: []` out of sync), `GT-Walsheim-Bold` (`700`) violates font policy, and `#corner-buttons button` (`~36px`) fails `44px`.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output & Color Grading (`src/main.ts:218`):** Switch to `output: { preset: "neon-night", toneMapping: "aces", exposure: 1.05, dither: true, outputColorSpace: resolveGamut() }`.
- **Synthwave Concert Look & Night-Cinematic IBL (`src/world.ts`, `src/stage.ts`):** Mount `looks.preset("neon-arcade", { exposureEv: 0.15 })` + `environments.nightCinematic({ intensity: 0.65, background: false })` + `lights.key({ shadow: { cascades: 2, maxDistance: 85, mapSize: 2048 } })` (`aura3d look lint` clean).
- **Eevee Wet-Obsidian SSR & Volumetric Concert Lasers:** Add `effects.contactShadows({ length: 0.25, thickness: 0.18, steps: 12, intensity: 0.6 })`, `effects.ambientOcclusion({ intensity: 0.4, radius: 0.6 })`, **`effects.screenSpaceReflections({ intensity: 0.68, roughness: 0.18 })`** (turning the obsidian `deck` and lower `stage-floor` into wet dark-glass synthwave mirrors reflecting the striped sunset, neon arches, speaker stacks, and incoming magenta/amber/red obstacles!), **`effects.volumetricBeam`** (replacing flat 4-quad `beamMesh` in `src/stage.ts:156` with feathered volumetric concert lasers sweeping on 4-bar 132 BPM phrases!), WebGPU-batched `effects.depthOfField` on splash/results, `looks.fogForExtent({ extent: 260, color: "#2d0c4e", haze: 0.58, mode: "exp2" })`, and `effects.neonBloom({ intensity: 0.65, threshold: 0.72 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Rigged 132 BPM Synth-Skater Bot & Continuous Headphones (`src/world.ts:137-148`, `src/meshes.ts`):** Replace the Tic-Tac capsule + 9 floating cubes with an admitted rigged synth-skater robot GLB (`bhHopperBot`, `AnimationController` clips synced to 132 BPM: `skate-stride`, `hop-flip`, `duck-slide`, `stumble` with continuous `primitives.torus` headband + `material.glowingEmissive` ear-cups attached via `attachToBone("Head")` and `material.chrome` LED visor + `material.clearcoatPaint` chassis).
- **Paired GLSL 3.00 + WGSL BPM Spectrum Runway & Parallax Laser-Abyss Shader (`src/stage-shaders.ts`, `src/stage-shaders-wgsl.ts`):** Upgrade `deckSpec` into a wet dark-glass LED equalizer deck with per-lane 132 BPM spectrum bars, a crisp quarter-note `z = 0` beat-judgement threshold bar (`uBeatPulse`), and an interior-mapped parallax chasm shader on `gaps` so floor gaps read as 4 m deep neon laser trenches rather than purple rugs.
- **Sculpted Obstacles, Raised Portrait Arch & Instanced Stage Gear (`src/stage.ts`, `src/dressing.ts`):** Upgrade `blocks` to beveled sub-bass speaker crates (`primitives.roundedBox` + excursion woofer cone), `bars` to `material.chrome` stanchions spanning a hot-magenta plasma beam, `walls` to segmented LED equalizer monoliths, and `orbs` to `material.studioGlass` polyhedral beat-crystals. **Raise `archMesh` / `archGlowMesh` (`src/stage.ts:135`) from `top = 8.5 m` to `top = 12.5 m` with curved chamfered corners** so `390x844` frames cleanly! Retexture + KTX2-compress `bhSpeakerStack`, `bhSpeakerStackB`, `bhTurntable`, mount via **3 `instances.model(...)` groups**, sync `src/art/direction.ts` `assets`, and set `castShadow: false` on non-shadowed `OPEN_BOUNDS` batches.

### 4. Animation, Camera Choreography & Game Juice
- **132 BPM Concert Choreography (`src/presentation.ts`, `src/fx.ts`, `src/main.ts`):** Phase-lock `AnimationController` skate cadence, speaker woofer excursion, stage `volumetricBeam` sweeps, and subtle `0.35°` camera FOV nod to `beatPulse` (132 BPM); replace flat 32-gon `rings` (`src/world.ts:167`) with a feathered harmonic ripple shader; fire golden star-spark `effects.flipbook` bursts on `PERFECT`, cyan sparks on `GOOD`, twin hover-blade `effects.trail` ribbons, and `@aura3d/engine/game` `createHitStop` (`35 ms`) + `createCameraShake` on `MISS`.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **AuraOne Licensed Typography (`index.html`, `src/hud.ts`):** Replace `GT-Walsheim-Bold` (`700`) with `.woff2` `Whitney` (`500`/`600` `tnum`, lowercase `smcp` `>= 12px`), `DIN Pro` (`500` `tabular-nums` on score, combo `×8`, timing accuracy `%`), and `Monument Grotesk Mono` (`400` on `132 BPM` / seed) with `html { font-synthesis: none }`.
- **Unobstructed Vanishing Point, Runway Beat Bar & `44px` Touch Targets:** Relocate `#popups` (`index.html:115`) off the center vanishing point to `top: 58%; left: calc(50% + 128px)` on desktop (`top: 64%; right: 16px` on `390x844`, max 2 compact pills), pair `#beat-dot` with converging quarter-note ticks on the `z = 0` runway judgement bar for 1-second timing clarity, and enforce `>= 44x44px` safe-area buttons on `390x844`.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Mount `output: { preset: "neon-night", toneMapping: "aces", exposure: 1.05, dither: true }`, `looks.preset("neon-arcade")`, `environments.nightCinematic`, `contactShadows`, `ambientOcclusion`, `screenSpaceReflections`, `volumetricBeam` concert lasers, and `neonBloom` (`aura3d look lint` clean).
- [ ] Replace the Tic-Tac capsule + 9 pink cubes with rigged `bhHopperBot` (`AnimationController` 132 BPM clips + `attachToBone` continuous headphones), author paired GLSL 3.00 + WGSL spectrum runway + parallax laser-abyss gap shaders, raise `archMesh` to `top = 12.5 m` for `390x844`, and batch `dressing.ts` into 3 `instances.model(...)` groups.
- [ ] Relocate `#popups` away from the horizon vanishing point, migrate `index.html` + `src/hud.ts` to `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, add `z = 0` runway beat ticks, and enforce `>= 44x44px` touch buttons.
- [ ] **Verification Gates:** `pnpm --filter @aura3d/showcase-beat-hopper typecheck && pnpm --filter @aura3d/showcase-beat-hopper build`, `pnpm vitest run tests/unit/beat-hopper`, `node tools/game-checks/run.mjs beat-hopper`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2 at `>= 90 fps`, `?worker=1`, 0 errors, unobstructed `1280x720` & `390x844` captures).

---

## WP-20 — Craterline GP (`showcase-strange-orbit-port` + `examples/strange-orbit-port`)

### 1. Paths, Mode & Current Visual Audit
- **Paths & Mode:** Wrapper `apps/showcase-strange-orbit-port/` (`@aura3d/showcase-strange-orbit-port`, generated `index.html` via `node tools/showcase-port-pages/sync.mjs`) + canonical implementation `examples/strange-orbit-port/` (**`replay-verified` deterministic port**; sole runtime dependency `"@aura3d/engine": "workspace:*"`, **0 Three.js dependencies or imports**).
- **FROZEN DETERMINISTIC SIMULATION BOUNDARY (0 DIFF ALLOWED):** `examples/strange-orbit-port/{race.ts,course.ts,track.ts,obstacles.ts,reentry.ts,vec3.ts}` are strictly off-limits (`tests/unit/strange-orbit-port/reference-replay.test.ts`: `17,214` steps, 7 laps, 35 checkpoints, `< 1e-5 m` rival `s`, `1e-6` rounding). All upgrades operate exclusively in `examples/strange-orbit-port/{world.ts,models.ts,materials.ts,shaders.ts,shaders-wgsl.ts,meshes.ts,index.html,ui.ts,touch.ts,audio.ts,art/*}`.
- **Evidence Reviewed (`evidence/strange-orbit-port/screens/final/`):** `title-1280.jpg`, `mid-action-1280.jpg`, `boost-1280.jpg`, `mid-action-390.jpg`.
- **Current Scores:** Lighting/Post `7.0` | Materials/Assets `6.0` | VFX/Animation `6.6` | UI/UX/Typography `5.5` | Perf/WebGPU `8.6` → **Overall: `6.7 / 10`** (`81.5` WebGL2 / `76.4` WebGPU fps, `0.96x`, `?worker=1`, reversed depth).
- **Screenshot-Verified Defects:**
  1. **Floating D20 Dice, Smooth Chopstick Spires & White Lollipop Beacons (`mid-action-1280.jpg`, `boost-1280.jpg`, `mid-action-390.jpg`):** `rim-rocks` (`instances.polyhedron({ variant: "dodecahedron", detail: 0 })` in `world.ts:463`) float disconnected in mid-air like tabletop D20 dice; `rim-spires` (`instances.cylinder({ radialSegments: 7 })` in `world.ts:474`) float like cut beige chopsticks; `beacon-posts` + `beacon-lamps` read like untextured white debug lollipops.
  2. **Frozen Single-Mesh Statue Riders & Dead Thrusters (`title-1280.jpg`, `mid-action-1280.jpg`, `boost-1280.jpg`):** `bike_rider.glb`, `rival_bike.glb`, and `skate_rider.glb` bake rider + bike into one rigid mesh (`world.ts:186-189`) with zero cornering hang-off lean, zero apex head-turn, zero boost aero-tuck, chalky single-lobe suit highlights, and dark unlit rear nozzles during `"Stardust boost"`.
  3. **Flat Brown Cutout Crater Rim & Violet-Purple Smudge Shadow (`boost-1280.jpg`, `shaders.ts:438`):** `crater-rim` lacks sunlit basalt strata relief, while `RIDER_SHADOW_FRAGMENT` (`vec4(0.07, 0.04, 0.10, a)`) paints an unnatural violet-purple oval smudge on the warm terracotta track (`dither: false` in `main.ts:640`).
  4. **Colliding `"Graphik Web"` HUDs (`mid-action-1280.jpg`, `mid-action-390.jpg`, `art/hud.ts:53`):** Uses prohibited marketing-only `"Graphik Web"` everywhere; `.gouache-hud` physically overlaps `#hud .bottom` (`199 km/h`) on `1280x720` (duplicating speed & boost!) and collides into `#order` (`6 You +494m`) on `390x844`.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **HDR Output & Color Grading (`examples/strange-orbit-port/main.ts:640`):** Set `output: { preset: "space", toneMapping: "aces", exposure: lookExposure(artLook, 1), dither: true, outputColorSpace: resolveGamut() }`.
- **14° Grazing Lunar Rim Sunlight, Earthshine & Earthrise Landmark (`world.ts:289-355`, `art/look.ts`):** Tune crisp **14° low-angle lunar rim sunlight** (`lights.key` with 2-cascade `2048` PCF shadows) + cool Earthshine fill `lights.hemisphere({ skyColor: "#6da8ff", groundColor: "#2d1a14", intensity: 0.42 })` + `environments.capture({ resolution: 256, update: "once" })`, and mount a sunlit **crescent Earthrise sphere** (`primitives.sphere` with Rayleigh limb `a3d_sky` + cloud-swirl shader) low over the crater rim alongside the banded ochre gas giant (`aura3d look lint` clean).
- **Eevee Post Stack (Replacing Purple Blob Shadow):** Delete the violet `rider-shadow` smudge quad (`world.ts:557`) in favor of warm-umbra `effects.contactShadows({ length: 0.4, thickness: 0.22, steps: 12, intensity: 0.68 })`, `effects.ambientOcclusion({ intensity: 0.45, radius: 0.8 })`, `effects.screenSpaceReflections({ intensity: 0.42, roughness: 0.32 })` (subtle reflections on the tire-burnished racing groove and opal infield islands), WebGPU-batched `effects.depthOfField` on splash/finish, and `effects.cinematicBloom({ intensity: 0.3, threshold: 0.82 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders (Paired GLSL 3.00 + WGSL)
- **Grounded Lunar Boulders, Stratified Crater Rim & Pylon Beacons (`world.ts:434-508`, `art/craterRim.ts`):** Delete floating `dodecahedron` `rim-rocks` and `cylinder` `rim-spires`; replace with `instances.model(MESHY.boulderA, ...)`, `instances.model(MESHY.boulderB, ...)`, and `instances.model(ROCK_ASSET, ...)` planted `0.8 m` below exact `rimHeight(x, z)` terrain elevation (zero floating bases!). Upgrade `crater-rim` with `material.strata` / paired GLSL 3.00 + WGSL basalt & anorthosite strata relief, and replace lollipop `beacon-posts`/`beacon-lamps` with chamfered `material.brushedMetal` lunar pylons + hooded `material.glowingEmissive` amber guide lenses.
- **Paired GLSL 3.00 + WGSL Lunar Regolith Agglutinate Micro-Sparkle Shader (`shaders.ts`, `shaders-wgsl.ts`):** Upgrade `trackFragment`/`trackFragmentWgsl` and `mineralFragment`/`mineralFragmentWgsl` with Voronoi glass-bead micro-sparkle (`pow(max(dot(N_grain, H), 0.0), 512.0)` glinting under grazing rim sun!), anisotropic tire-glazed racing-line sheen (`roughness: 0.24` on groove vs `0.82` dusty shoulder), and gouache impasto normal relief.
- **Multi-Lobe Bike & Astronaut Materials (`world.ts:180-220`, `models.ts`):** Split single-lobe vehicle meshes via `aura3d-retexture` + KTX2 into `material.carPaint` metallic-flake fairings, `material.chrome` forks & thruster bells, `material.glowingEmissive` Mach-diamond plasma cones inside `nozzleL`/`nozzleR`, matte `material.fabric({ roughness: 0.78 })` flight suits, and **`material.studioGlass` gold-iridium reflective helmet visors**.

### 4. Animation, Camera Choreography & Game Juice (Presentation-Only — Zero Sim Touch)
- **Read-Only `Shown`-Driven Rider Lean, Apex Head-Turn & Aero-Tuck (`placeRider` in `world.ts:835`):** Decompose `bike_rider.glb`, `rival_bike.glb`, and `skate_rider.glb` into articulated sub-nodes (`chassis`, `riderTorso`, `riderHead`, `wheelF`, `wheelR`, `thrusterCones`) driven **100% from interpolated read-only `Shown` (`state.lean`, `state.speed`, `state.boosting`, `state.air`)**:
  - `chassis` rolls `-lean * 1.8`; `riderTorso` hangs off inside corners (`roll = -lean * 0.65`, lateral shift `lean * 0.22 m`) and tucks `-0.28 rad` over the tank during `state.boosting`;
  - `riderHead` counter-rolls level with the lunar horizon and yaws `lean * 0.85 rad` toward the corner apex;
  - `wheelF`/`wheelR` spin by `shown.speed * dt / wheelRadius` while `thrusterCones` + nozzle-locked `EXHAUST_FLAME` plumes flare blue-white Mach diamonds and hard cornering (`|state.lean| >= 0.16`) kicks up lunar regolith rooster-tail `effects.particles` alongside existing 120/144 Hz `createFixedStepPresenter` + `createHitStop` + `createCameraShake`.

### 5. UI/UX, HUD & Mobile Polish (`1280x720` & `390x844`)
- **Purge `"Graphik Web"` & Wire AuraOne Licensed Typography (`examples/strange-orbit-port/index.html`, `art/hud.ts`):** Remove `"Graphik Web"` everywhere; self-host `.woff2` `Whitney` (`500`/`600` `tnum`, lowercase `smcp` `>= 12px` on `position`, `lap`, `race time`, `stardust`), `DIN Pro` (`500` `tabular-nums` on `km/h`, `0:17.78` timer, `+3m` rival gaps, countdown), and `Monument Grotesk Mono` (`400` on sector chip & lap-split deltas) with `html { font-synthesis: none }`.
- **Zero-Collision Unified Telemetry Cluster & Wrapper Sync:** Merge `.gouache-hud` and `#hud .bottom` into **one unified bottom-right telemetry cluster** (`220°` speed/stardust arc + single `DIN Pro` `km/h` readout + `72x72` orbit-ring minimap + live `-0.38s` / `+0.21s` lap-split delta—zero duplicate speed/boost widgets and zero overlap!). On `390x844`, dock a `56x56` minimap cleanly below top-left `#hud-tools` and compact top-right `#order` to top-3 + `You` with `56x56px` touch buttons; preserve exact `ui.ts` replay-tested announcement step timing and run **`node tools/showcase-port-pages/sync.mjs`** to regenerate `apps/showcase-strange-orbit-port/index.html`.

### 6. Executable Checklist (`- [ ]`) & Verification Gates
- [ ] Keep `examples/strange-orbit-port/{race.ts,course.ts,track.ts,obstacles.ts,reentry.ts,vec3.ts}` at **0 bytes diff**.
- [ ] Set `output: { preset: "space", toneMapping: "aces", dither: true }`, tune 14° lunar rim `lights.key` + Earthshine + crescent Earthrise sky sphere, and replace the purple `rider-shadow` quad with `contactShadows` + `ambientOcclusion` + `screenSpaceReflections` + `cinematicBloom` (`aura3d look lint` clean).
- [ ] Replace floating `dodecahedron` rocks, `cylinder` spires, and lollipop beacons in `world.ts` with terrain-planted `instances.model(...)` lunar boulders + `material.strata` crater rim + brushed-metal amber pylons; add paired GLSL 3.00 + WGSL regolith micro-sparkle shader and multi-lobe bike/gold-iridium visor materials + `Shown`-driven rider hang-off/head-turn/aero-tuck.
- [ ] Purge `"Graphik Web"`, wire `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, merge `.gouache-hud` + `#hud .bottom` to eliminate `1280x720` and `390x844` HUD collisions, and run `node tools/showcase-port-pages/sync.mjs`.
- [ ] **Verification Gates:** **`pnpm vitest run tests/unit/strange-orbit-port/reference-replay.test.ts` (100% deterministic pass across all `17,214` steps, 7 laps, and 35 checkpoints)**, `pnpm --filter @aura3d/showcase-strange-orbit-port typecheck && pnpm --filter @aura3d/showcase-strange-orbit-port build`, `node tools/game-checks/run.mjs strange-orbit-port`, `node tools/agent-examples/refresh-catalog-digests.mjs`, `node tools/site/seo-meta-pass.mjs --check`, and remote real-GPU verification via `tools/remote-acr/run.sh` (WebGPU `>= 0.92x` WebGL2 at `>= 75 fps`, `?worker=1`, 0 errors).

---

---

## WP-21 — Gridlock Courier (`showcase-drift-and-deliver-port` → `examples/drift-and-deliver-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/drift-and-deliver-port/` locks the **3,240-step deterministic trajectory within `1e-6`**). **Hard rule:** `examples/drift-and-deliver-port/sim.ts` and `world.ts` MUST remain 100% untouched; apply all upgrades in visual/city/vehicle/HUD modules and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-drift-and-deliver-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-drift-and-deliver-port/{package.json,index.html,route-health.json,src/aura-assets.ts,src/main.ts}`
  - Implementation: `examples/drift-and-deliver-port/{main.ts,index.html,look.ts,city.ts,vehicles.ts,models.ts,props.ts,shift.ts,shiftRuntime.ts,phases.ts,daylight.ts,fx.ts,headlights.ts,headlightProfile.ts,brakes.ts,chase.ts,cinema.ts,presentation.ts,hud.ts,board.ts,banners.ts,festoons.ts,lamps.ts,roadPaint.ts,wet.ts,textures.ts,facadeNormal.ts,water.ts,sky.ts,mesh.ts,input.ts,touch.ts,audio.ts}`
- **Genre Look Recipe:** Sun-Drenched Golden-to-Blue-Hour Coastal Delivery Drift (`looks.preset("golden-hour")` + `venice_sunset_1k.hdr` IBL + wet intersection SSR + IES dusk headlamps).
- **Current Rendering & Screenshot Diagnosis (`evidence/drift-and-deliver-port/screens/final/`):**
  - **SEVERE MID-AIR FLOATING STREET PROPS (`drift-1280.jpg`, `drift-390.jpg`):** Streetlamps hover `~2.5m` in mid-air with severed bases; traffic signals float `~2.1m` up; and avenue palm trees hover `~3–4m` off the sidewalk in front of upper awnings! Root cause: `propTransform` (`models.ts:91–99`) adds `+ PROP_BELOW[key] * s` (`streetlamp: 2.5`, `signal: 2.1`, `palm: 1.5`) onto GLBs whose pivots are already grounded!
  - **Tan Mud-Oval Puddles & Disabled Default AO (`look.ts:142–147`, `main.ts:69`):** `ao` defaults to `false` unless `?ao=1` (`main.ts:69`), `effects.contactShadows` and `effects.screenSpaceReflections` are absent, and `output: { toneMapping: "neutral", exposure: 2.3 }` (`main.ts:76`) turns `wetRoad` puddles into flat muddy tan ovals across crosswalks.
  - **Minecraft-Cube Far Pedestrians, Clearcoat-0 Courier & Legacy Interpolator (`title-1280.jpg`, `models.ts:62`, `main.ts:325`):** Far-LOD sidewalk pedestrians (`city.ts`) are stacked Minecraft cubes; `COURIER_PAINT` disables clearcoat (`0`) with opaque matte-grey windows and merged non-spinning wheels; and `main.ts:325` still uses `createRenderInterpolator`.
  - **Tachometer Text Collision, Unreadable 225-Block Minimap & Banned Fonts (`drift-1280.jpg`, `drift-390.jpg`, `index.html`):** `#speed` (`102` + `KM/H`) collides directly with the orange needle hub and white gauge arc in `#dial`; `240×240` `#minimap` crams all 225 city blocks + 174 dots into visual noise; and `index.html` uses banned `"Graphik Web"` + `"TT Commons Pro Mono"`.
- **Current Sub-Scores (`/10`):** Lighting/Post `6.0` · Materials/Assets `5.0` · VFX/Animation `6.0` · UI/UX/Typography `5.5` · Perf/WebGPU `7.8` → **Overall `5.8 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Default GTAO, Wet-Crosswalk SSR & AgX Dusk Shift (`examples/drift-and-deliver-port/main.ts:69–90`, `look.ts`, `phases.ts`, `headlights.ts`):**
  - Flip `ao: params.get("ao") !== "0"` (`true` by default in `main.ts:69`) and switch `output` from `{ toneMapping: "neutral", exposure: 2.3 }` to `{ toneMapping: "agx", exposure: 1.08, dither: true }` paired with `looks.preset("golden-hour")` + `environments.hdri({ texture: veniceSunsetHdr, intensity: 0.88, background: false })` + `looks.fogForExtent({ extent: 340, color: "#f2c69d", haze: 0.32 })` transitioning across `phases.ts`.
  - Mount `effects.ambientOcclusion({ intensity: 0.65, radius: 0.85, multiBounce: true })`, `effects.contactShadows({ length: 0.32, thickness: 0.06, steps: 16, intensity: 0.70, lights: "sun" })`, **`effects.screenSpaceReflections({ intensity: 0.68, maxDistance: 28, roughness: 0.22, thickness: 0.28 })`** (turning tan puddle ovals into live reflections of shopfront neon, festoon bulbs, and taillights!), `effects.cinematicBloom({ threshold: 0.88, intensity: 0.36 })`, title/cinema `effects.depthOfField`, and dusk `effects.volumetricBeam` + IES `lights.spot` headlamps (`headlightProfile.ts` enabled by default at dusk).

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Ground Every Floating Prop Flush at `SIDEWALK_Y` (`models.ts:91–99`):**
  - Use `groundedFittedModelPosition` / inspected `min.y` bounds (`aura3d assets inspect`) on `streetlamp.glb`, `signal.glb`, `palm.glb`, `tree.glb`, and `hydrant.glb` so every pole base and trunk collar sits flush at `SIDEWALK_Y = 0.16m` with zero mid-air hovering!
- **Multi-Lobe Fleet Retexture, Crowd & Dual-Backend Puddle/Skid Shaders (`models.ts:62`, `vehicles.ts`, `city.ts`, `wet.ts`, `fx.ts`):**
  - Retexture `courier.glb` and traffic GLBs (`aura3d-retexture` + KTX2), upgrading `COURIER_PAINT` (`models.ts:62`) to `material.carPaint({ color: "#f4b41a", clearcoat: 1.0, clearcoatRoughness: 0.05 })`, glazing to `material.studioGlass({ tint: "#16202b", roughness: 0.04 })`, rims to `material.brushedMetal`, and roof delivery pack to `material.fabric` + `material.lacquer`.
  - Replace stacked-cube far pedestrians (`city.ts`) with `createCrowd` / `bakeCrowdPoses` (`@aura3d/engine`) phase-offset sidewalk strollers, and upgrade `wet.ts` + `fx.ts` (paired GLSL 3.00 + WGSL) with micro-aggregate wet-asphalt roughness modulation, warm parallax dusk shop windows, and dual-tire `0.21m` rubber skid-mark ribbons.

### 4. Animation, Camera Choreography & Game Juice
- **120/144 Hz `createFixedStepPresenter`, Spinning Wheels & Drift Smoke (`main.ts:325`, `presentation.ts`, `vehicles.ts`, `fx.ts`):**
  - Migrate `main.ts:325` from `createRenderInterpolator` to `createFixedStepPresenter` + `runMotionGate` (keeping `sim.ts` untouched), articulate spinning 4-wheel pitch (`v * dt / wheelRadius`) + front steering-knuckle yaw + chassis drift roll/dive, and spawn `4×4` KTX2 tire-smoke `effects.flipbook` plumes + curb-graze spark showers + `createHitStop` (`35ms`) on rush drop-offs.

### 5. UI/UX, HUD & Mobile Polish
- **Purge `"Graphik Web"` & `"TT Commons Pro Mono"`, Fix `#dial` & Zoom GPS Radar (`index.html`, `hud.ts`, `board.ts`, `touch.ts`):**
  - Self-host `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) strictly on `#speed`, `#score`, `#combo`, and `$` tips, and **Monument Grotesk Mono** (`400`) on ticket/seed IDs.
  - Seat the `DIN Pro` `#speed` readout cleanly inside a recessed bottom bezel of `#dial` so `102 KM/H` never touches the needle hub or gauge arc on `1280x720` or `390x844`; convert `#minimap` from a 225-block grid into a **player-centered 3-block rotating GPS radar** paired with a top-center diegetic delivery chevron + distance pill; and verify `>= 48px × 48px` coarse-pointer drift/gas/brake pads.

### 6. Executable Checklist & Verification Gates
- [ ] Ground `streetlamp`, `signal`, `palm`, `tree`, and `hydrant` flush at `SIDEWALK_Y = 0.16m` (`models.ts:91–99`), enable default GTAO (`main.ts:69`), switch to AgX output, and mount wet-street `effects.screenSpaceReflections` + `effects.contactShadows` + dusk IES `effects.volumetricBeam` headlamps.
- [ ] Upgrade `courier.glb` + fleet to KTX2 `material.carPaint` + `studioGlass` + spinning/steering wheel nodes, replace cube pedestrians with `createCrowd`, and upgrade dual GLSL+WGSL wet-asphalt & dual-track skid shaders.
- [ ] Migrate `main.ts:325` to `createFixedStepPresenter` and add `4×4` KTX2 drift-smoke `effects.flipbook` plumes.
- [ ] Replace `Graphik Web` + `TT Commons Pro Mono` with `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`, de-collide `#dial` speed numerals, and zoom `#minimap` to a 3-block rotating GPS radar.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-drift-and-deliver-port/package.json
  ! rg -n "from ['\"]three|import-three" apps/showcase-drift-and-deliver-port examples/drift-and-deliver-port
  pnpm vitest run tests/unit/drift-and-deliver-port/
  npx @aura3d/cli look lint apps/showcase-drift-and-deliver-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-drift-and-deliver-port
  ```

---

## WP-22 — Ion Circuit (`showcase-heatsink-port` → `examples/heatsink-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/heatsink-port/` locks **9,000-step Time Trial + 5,400-step Operation trajectories within `1e-6`**). **Hard rule:** `examples/heatsink-port/{race,vehicle,track,operation,rng,map,config,orient,bot,input-script}.ts` MUST remain 100% untouched; apply all upgrades in visual/shader/audio/HUD files and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-heatsink-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-heatsink-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/heatsink-port/{main.ts,index.html,presentation.ts,world.ts,meshes.ts,materials.ts,shaders.ts,shaders-wgsl.ts,point-quads.ts,models.ts,hud.ts,audio.ts}` + `art/{look,direction,director,beacons,pools,telemetry,vfx,wake}.ts`
- **Genre Look Recipe:** High-Speed *WipEout* / *Redout* Twilight Mag-Lev Canyon Circuit (`looks.preset("night-city")` + seamless 3D aurora dome + carbon-anodized mag-lev track SSR + rock-arch god rays).
- **Current Rendering & Screenshot Diagnosis (`evidence/heatsink-port/screens/final/`):**
  - **#1 DEFECT — RAZOR-SHARP VERTICAL `atan` SEAM TEARING THE SKY (`card@2x.jpg`, `shaders.ts:230`):** `SKY_FRAGMENT` (`shaders.ts:230, 251–259` & `shaders-wgsl.ts`) computes `float az = atan(d.z, d.x);` and feeds non-integer multiples (`az * 2.4, 1.6, 2.1, 7.0`) into `fbm`/`sin`, slicing a brutal vertical `2π` step seam right through the clouds and cyan aurora ~26% from the left edge!
  - **Unlit Lavender-Plastic Track, Black Slab Arches, Floating Mushrooms & Black-Hole Shadow (`card@2x.jpg`, `mid-action-640.jpg`):** Custom unlit shaders (`materials.ts`) make the road look like matte purple plastic painted with cyan amoebas (zero SSR, zero AO, zero shadow casting on arches/scenery); `buildArches` are unadorned `#2a2a33` slabs; `plant-cap` mushrooms **float in mid-air off banked curves** (`models.ts:89` ignores `track.latY`); `drone2.glb` has frozen rotors; `drone-blob` (`world.ts:269`) detaches into a giant black hole; and `main.ts:545–547` has a duplicate `renderer:` key capping `pixelRatio: 1` (`mid-action-640.jpg` is blurry `640×360`!).
  - **CATASTROPHIC `390x844` HUD STRIKE-THROUGH (`mid-action-390.jpg`, `index.html:42`):** `#district` (`VESPER CIRCUIT / TWILIGHT BASIN`, hardcoded at `top: 64px; left: 18px`) **strikes straight across the middle of the `LAP 1`, `TIME`, and `HULL` cards**, while `.meter` (`74px` label width) clips `AFTERBURNER` into the cyan bar! Uses banned `"Graphik Web"` + `"TT Commons Pro Mono"` + `9px` sub-labels, and lacks continuous synth race music/thruster beds.
- **Current Sub-Scores (`/10`):** Lighting/Post `5.2` · Materials/Assets `4.5` · VFX/Animation `6.0` · UI/UX/Typography `4.5` · Perf/WebGPU `8.0` → **Overall `5.2 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Fix Duplicate `renderer:` Key, Delete Detached Blob & Enable Mag-Lev Track SSR (`main.ts:545–547`, `world.ts`, `art/look.ts`):**
  - Merge the duplicate `renderer:` literal in `main.ts:545–547` (`pixelRatio: { max: 1.5, min: 1 }`, `output: { toneMapping: "agx", exposure: 1.08, dither: true }`), delete the duplicate detached `drone-blob` mesh (`world.ts:269`), and enable craft-following `lights.key` `2048` shadows (`castShadow: true` on arches, pylons, sentries, barrels, and craft).
  - Mount `effects.ambientOcclusion({ intensity: 0.68, radius: 1.0, multiBounce: true })`, `effects.contactShadows({ length: 0.35, thickness: 0.06, steps: 16, intensity: 0.68 })`, **`effects.screenSpaceReflections({ intensity: 0.72, maxDistance: 36, roughness: 0.18, thickness: 0.28 })`** across the anodized mag-lev deck, `effects.godRays({ source: "sun", intensity: 0.38, decay: 0.95, samples: 48 })` through `rock-arch` spans, `looks.fogForExtent({ extent: 1200, color: "#14182e", haze: 0.36 })`, and `effects.cinematicBloom({ threshold: 0.82, intensity: 0.48 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Eliminate the `atan` Sky Seam (`shaders.ts:230–262`, `shaders-wgsl.ts`):**
  - Replace `atan(d.z, d.x)` in both `SKY_FRAGMENT` and `SKY_FRAGMENT_WGSL` with **seamless 3D unit-sphere noise** (`fbm3(normalize(d) * scale + windOffset)`)—100% eradicating the vertical sky tear across `360°`!
- **Reflective Carbon-Weave Mag-Lev Track, Chamfered Gantries & Bank-Grounded Flora (`materials.ts`, `meshes.ts`, `models.ts:89`):**
  - Upgrade the track surface to dark carbon-weave / anodized alloy PBR (`roughness: 0.18, metallic: 0.72` catching live SSR) inlaid with recessed paired GLSL 3.00 + WGSL scrolling plasma-conduit channels and SDF boost chevrons; replace black box `buildArches` with chamfered `material.brushedMetal` + `material.clearcoatPaint` race gantries carrying holographic banners.
  - Fix floating mushrooms/spires in `models.ts:89`: sample exact banked height & surface normal from `track.sampleSurface(s, lateral)` and sink root skirts `-0.8m` along the local normal; replace soft-serve cone rocks with `material.strata` basalt columns; and KTX2-retexture `drone2.glb` (`material.carPaint` + `studioGlass` + `brushedMetal` vector nozzles + split counter-rotating ducted-fan submeshes).

### 4. Animation, Camera Choreography & Game Juice
- **Spinning Ducted Rotors, Wingtip Plasma Ribbons & Driving 138 BPM Synth Soundtrack (`presentation.ts`, `art/vfx.ts`, `audio.ts`):**
  - Spin split ducted-fan rotors (`40–90 rad/s` by throttle) + articulate airbrake flaps in `presentation.ts` (`createFixedStepPresenter` untouched), add twin `effects.auroraRibbon` / `effects.trail` plasma wakes + `4×4` KTX2 shield/sentry `effects.flipbook` blasts, and upgrade `audio.ts` (`@aura3d/engine/audio` `createStepSequencer` 138 BPM electro bass/arp soundtrack + continuous `createToneLoop` turbine/afterburner/drift layers + `duckMusic` on EMP/lap hits).

### 5. UI/UX, HUD & Mobile Polish
- **Eliminate `#district` Strike-Through, Fix `.meter` Clipping & Migrate Fonts (`index.html:42`, `hud.ts`):**
  - Convert `#district` (`index.html:42`) from a permanent `top: 64px` overlap into a transient `2.4s` center-top sector-entry toast (`top: 14%`, below `#top`) so `VESPER CIRCUIT` NEVER strikes through `LAP` / `TIME` / `HULL` on `1280x720` or `390x844`! Widen/stack `.meter` labels so `AFTERBURNER` and `OVERDRIVE HEAT` never clip into the cyan gauge bar.
  - Replace `"Graphik Web"`, `"TT Commons Pro Mono"`, and `9px–11px` labels with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum` on `00:15.917` formatted lap times, lowercase `smcp` `>= 12px` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) strictly on standalone `KM/H`, lap `#`, and hull `%`, and `>= 48px × 48px` mobile touch pads.

### 6. Executable Checklist & Verification Gates
- [ ] Replace `atan(d.z, d.x)` with seamless 3D `fbm3(normalize(d))` in `shaders.ts:230` & `shaders-wgsl.ts`, fix the duplicate `renderer:` key in `main.ts:545–547` (`pixelRatio: { max: 1.5 }`, AgX output), delete `drone-blob` (`world.ts:269`), and enable craft-following shadows + `effects.screenSpaceReflections` + `effects.ambientOcclusion` + `effects.godRays`.
- [ ] Upgrade track & arches to reflective carbon/anodized PBR + holographic gantries, ground `sceneryNodes` (`models.ts:89`) onto banked `track.sampleSurface` normals, and split spinning rotors on KTX2-retextured `drone2.glb`.
- [ ] Add wingtip plasma `effects.auroraRibbon` wakes and the 138 BPM `createStepSequencer` + `createToneLoop` race soundtrack in `audio.ts`.
- [ ] Fix `#district` (`index.html:42`) striking through `#top` on `390x844`, fix `.meter` `AFTERBURNER` clipping, migrate to `.woff2` `Whitney` + `DIN Pro`, and re-shoot crisp `1280x720` & `390x844` evidence frames (retiring `mid-action-640.jpg`!).
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-heatsink-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-heatsink-port examples/heatsink-port
  pnpm vitest run tests/unit/heatsink-port/
  npx @aura3d/cli look lint apps/showcase-heatsink-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-heatsink-port
  ```

---

## WP-23 — Shadowstep Gauntlet (`showcase-ninja-runner-port` → `examples/ninja-runner-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/ninja-runner-port/` locks the **12,759-step full-course run & 102 kills at `0` trace delta**; `shadowstep-gauntlet-wgsl-twins.test.ts` gates shaders). **Hard rule:** `examples/ninja-runner-port/{sim,course,autopilot,replay}.ts` MUST remain 100% untouched; apply all upgrades in visual/lighting/model/HUD modules and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-ninja-runner-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-ninja-runner-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/ninja-runner-port/{main.ts,index.html,world.ts,lighting.ts,districtLook.ts,scenery.ts,setpieces.ts,models.ts,materials.ts,shaders.ts,shaders-wgsl.ts,meshes.ts,shapes.ts,textures.ts,palette.ts,presentation.ts,cinematics.ts,vfx.ts,impact.ts,audio.ts,labels.ts}`
- **Genre Look Recipe:** Edo / Sengoku Dusk Lantern & Bamboo Shinobi Gauntlet (`looks.preset("golden-hour")` / `"night-city"` + runner-tracking sun shadows + warm *shoji*/lantern practicals + damp shrine stone SSR).
- **Current Rendering & Screenshot Diagnosis (`evidence/ninja-runner-port/screens/final/`):**
  - **THREE COMPOUNDING BUGS MAKING SHADOWS & AO LOOK COMPLETELY OFF (`action-1280.jpg`, `mid-action-1280.jpg`, `run-390.jpg`):**
    1. `world.ts:353` (`if (high && !evening)`) **explicitly disables `effects.ambientOcclusion` in the default `evening` look**, and `effects.contactShadows` is absent!
    2. `lighting.ts:78` & `world.ts:665` leave `sun` (`lights.directional`) aiming at static `target: [0, 0, 0]` at the start line instead of following the runner along the `2,640m` curved course!
    3. `main.ts:54–62` defaults `lanterns`, `godRays`, and `ink` to `false` unless URL flags are passed—turning off all 5 pooled warm lantern point lights!
  - **#1 ART CLASH — EUROPEAN TUDOR COTTAGES & CASTLE KEEPS IN A SHINOBI GAME (`title-1280.jpg`, `action-1280.jpg`, `mid-action-1280.jpg`):** `houseB/C/D` and `tower.glb` are **European half-timbered Tudor cottages and crenellated medieval stone keeps** sitting on a flat neon-green plane (`26.8 MB` uncompressed GLBs!), while `sword-i`/`club-i` (`world.ts:508–509`) are untextured white/brown `primitives.box` sticks and `CLONE_TINT` (`world.ts:208`) multiplies orange hoods into **baby-pink gummy-bear heads**!
  - **Fused HUD Text (`DISTANCE52 m`) & Banned Fonts (`index.html:12, 98–145`, `run-390.jpg`):** `#stats` concatenates labels directly into numerals (`DISTANCE52 m`, `DEFEATED00`, `SCORE45`), uses banned `"Graphik Web"`, `700` bold `"Domaine Display"`, italic serif buttons, stacks top mobile HUD down 30% of `390x844`, and prints `Shift · 38` / `1 · 60` on touch buttons!
- **Current Sub-Scores (`/10`):** Lighting/Post `5.8` · Materials/Assets `4.8` · VFX/Animation `6.8` · UI/UX/Typography `5.0` · Perf/WebGPU `6.8` → **Overall `5.6 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Runner-Tracking Sun Frustum, Default Evening GTAO & Lantern Pool (`world.ts:353, 665`, `lighting.ts:78`, `main.ts:54–62`):**
  - Update `sun` position AND `target` every frame to follow `groundFrame(view.s)` (`45m` tight shadow frustum, `castShadow: true` on characters, weapons, gates, houses, and trees), **remove `!evening` in `world.ts:353`** so `effects.ambientOcclusion({ intensity: 0.72, radius: 0.80, multiBounce: true })` + `effects.contactShadows({ length: 0.30, thickness: 0.05, steps: 16, intensity: 0.72 })` run by default, and flip `lanterns: params.get("lanterns") !== "0"` (`true` by default in `main.ts:54`).
  - Mount `effects.godRays({ source: "sun", intensity: 0.36, decay: 0.95, samples: 48 })` through bamboo groves, damp flagstone `effects.screenSpaceReflections({ intensity: 0.42, maxDistance: 18, roughness: 0.25, thickness: 0.25 })`, `looks.fogForExtent({ extent: 180, haze: 0.38 })`, `effects.cinematicBloom({ threshold: 0.85, intensity: 0.40 })`, and `output: { toneMapping: "agx", exposure: 1.04, dither: true }`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Authentic Edo *Machiya* / *Tenshu* Architecture & `26.8 MB → < 5 MB` Meshopt+KTX2 Pack (`models.ts`, `scenery.ts`):**
  - Replace European Tudor `houseB/C/D` and crenellated `tower.glb` with authentic Edo *machiya* timber-slat townhouses (`material.lacquer` dark charred *yakisugi* cedar + warm emissive *shoji* screens) and curved-gable *kawara*-tiled *tenshu* watchtowers (`ninjaPagodaSilhouette`), compressing all Meshy GLBs with **Meshopt + KTX2** (`@aura3d/cli`) to cut initial transfer from **`26.8 MB` to `< 5 MB`**.
  - Upgrade ground/verge shaders (`shaders.ts` + `shaders-wgsl.ts`) with moss/soil/fallen-leaf splat blending + normal-mapped wet shrine flagstones + instanced wind-swaying bamboo/grass clusters (erasing the flat neon-green plane and hard cobble seam).
- **Curved Katana / Kanabo Meshes & Spectral Sumi-Indigo Clone Shader (`world.ts:208, 508–509, 891–893`):**
  - Expand R2 enemy pools to `6` per archetype (eliminating `soldier.glb` fallback), replace white/brown `primitives.box` sticks (`sword-i`, `club-i`) with curved `material.brushedMetal` **katana** and iron-studded **kanabo** meshes, replace baby-pink `CLONE_TINT` (`world.ts:208`) with a **paired GLSL 3.00 + WGSL spectral sumi-indigo Fresnel smoke shader** (`#0c1324` ink core + `#38bdf8` spirit rim overriding base hue), replace the opaque peach `threat` pancake with a crisp calligraphy ring decal, and swap lollipop `spiralorb` for a faceted jade *magatama*.

### 4. Animation, Camera Choreography & Game Juice
- **Katana Slash Ribbons, *Kawari* Smoke Flipbooks & Maple Drift (`presentation.ts`, `vfx.ts`, `impact.ts`):**
  - Keep `createFixedStepPresenter` + `sim.ts` untouched; attach `effects.auroraRibbon` / `effects.trail` sumi-ink + steel-glint katana arcs, `4×4` KTX2 *kawari* smoke-bomb `effects.flipbook` puffs on clone spawn/derez, district-specific drifting maple leaves / embers (`effects.particles`), and `createHitStop` + lateral dash camera banking.

### 5. UI/UX, HUD & Mobile Polish
- **Fix `DISTANCE52 m` Concatenation, Purge Banned Fonts & Compact `390x844` HUD (`index.html:12, 98–145`):**
  - Purge `"Graphik Web"`, `700` bold `"Domaine Display"`, italic serif buttons, and `9px` badges; self-host `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` `>= 12px` labels, `font-synthesis: none`) and **DIN Pro** (`500`, `tnum`) strictly on distance, defeated count, combo, and score.
  - Add `display: flex; gap: 8px; align-items: baseline` in `#stats` (`distance  52 m`, `defeated  00`, `score  45`); on `390x844`, collapse `#vitals` + `#stats` + `#progress` into one `46px` top strip, strip `Shift ·` / `1 ·` desktop prefixes off touch buttons, and enforce `>= 48px × 48px` thumb targets.

### 6. Executable Checklist & Verification Gates
- [ ] Track `sun` position + `target` along `groundFrame(view.s)` (`lighting.ts:78`, `world.ts:665`), enable `effects.ambientOcclusion` + `effects.contactShadows` in `evening` (`world.ts:353`), enable default `lanterns` + `effects.godRays` + wet stone `effects.screenSpaceReflections` + AgX output.
- [ ] Swap European Tudor `houseB/C/D` & `tower.glb` for Edo *machiya*/*tenshu* GLBs, Meshopt+KTX2 compress all GLBs (`26.8 MB → < 5 MB`), replace box-stick weapons with katana/kanabo meshes, and replace baby-pink `CLONE_TINT` with the paired GLSL+WGSL sumi-indigo spectral shader.
- [ ] Add sumi-ink + steel katana `effects.auroraRibbon` trails and `4×4` KTX2 *kawari* smoke `effects.flipbook` bursts.
- [ ] Fix `DISTANCE52 m` spacing in `#stats`, migrate `index.html` to `.woff2` `Whitney` + `DIN Pro`, compact the `390x844` top stack to `46px`, and strip keyboard prefixes on mobile touch pads.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-ninja-runner-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-ninja-runner-port examples/ninja-runner-port
  pnpm vitest run tests/unit/ninja-runner-port/ tests/unit/apps/shadowstep-gauntlet-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-ninja-runner-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-ninja-runner-port
  ```

---

## WP-24 — Lamplight Line (`showcase-last-train-port` → `examples/last-train-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/last-train-port/` locks the **full 6-town circuit score `4,039` within `1e-6`**; `duneglide-lamplight-wgsl-twins.test.ts` gates shaders). **Hard rule:** `examples/last-train-port/{sim,replay}.ts` and `data/{route,tables}.json` MUST remain 100% untouched; apply all upgrades in visual/world/rider/CSS files and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-last-train-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-last-train-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/last-train-port/{main.ts,index.html,enamel.css,world.ts,bands.ts,lights.ts,models.ts,townkit.ts,materials.ts,portable.ts,shaders.ts,shaders-wgsl.ts,point-quads.ts,orient.ts,riderMotion.ts,presentation.ts,shots.ts,lanterns.ts,vfx.ts,audio.ts}`
- **Genre Look Recipe:** *Spirited Away* / Ghibli Rain-Kissed Brass & Enamel Night Sky-Tram (`looks.preset("night-city")` / `"golden-hour"` interpolated across 5 sky bands + wet cobble/rail SSR + warm brass headlamp beam).
- **Current Rendering & Screenshot Diagnosis (`evidence/last-train-port/screens/final/` & `CHANGELOG.md`):**
  - **5 DUPLICATE `Scene` GRAPHS × 6 PROBES = 36 CUBEMAP RENDERS PER BAND SWAP (`world.ts:799–806`, `main.ts:313–328`):** `buildWorld` constructs **5 complete duplicate `Scene` graphs (`BAND_IDS = A..E`)**, each mounting **6 `128×128` station reflection probes** plus **80+ unbatched individual `model()` nodes** (`48` `pax-*`, `36` `townhouse-*`, `12` `lamp-post-*`, `12` `crates-*`), causing ~8s frame-1 WebGPU pipeline compile stalls and `setScene` hitches on docked band transitions! `main.ts:558` also hardcodes **`toneMapping: "none"`**!
  - **Foreground Bowling-Pin Plaza Folk & Standing Statue Riders (`title.1280x720.jpg`, `key-depart.1280x720.jpg`, `key-depart.390x844.jpg`):** ~60 foreground station onlookers (`folk-bodies` + `folk-heads`, `world.ts:557–559`) are giant untextured neon-orange/cyan/magenta capsule+sphere bowling pins next to cone trees and grey dome `stones`, while `pax-*` inside the tram (`world.ts:829–838`, `riderMotion.ts`) are **unrigged standing statues** rocking rigidly around their ankles inside cabin benches!
  - **Unshaded Mud-Wall Island Undersides & Toothpick Pylons (`mid-leg.1280x720.jpg`):** `lamplightUndersideAR2.glb` (`world.ts:702`, `castShadow: false, receiveShadow: false`) fills the left third of the frame as a flat unshaded brown mud wall covered in solid white soap-bubble `cloud-puffs`; `pylons` (`1m × 150m` cylinders) look like beige toothpicks; and `tram-enamel.glb` has crumpled roof normals.
  - **55% Occluded `390x844` Viewport & Banned Fonts (`key-depart.390x844.jpg`, `enamel.css`):** 5 full-width navy enamel HUD panels cover **>55% of `390x844`**, burying the train, using `"Graphik Web"`, `700` bold `"Lamplight Narrow"`, and `"TT Commons Pro Mono"` on prose!
- **Current Sub-Scores (`/10`):** Lighting/Post `6.5` · Materials/Assets `5.2` · VFX/Animation `5.8` · UI/UX/Typography `5.8` · Perf/WebGPU `6.2` → **Overall `5.8 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Collapse 5 Duplicate `Scene`s Into 1 Persistent Band-Interpolated Scene (`world.ts:799–806`, `main.ts:313–328, 558`, `bands.ts`):**
  - Replace `world.scenes[A..E]` and `app.setScene(...)` with **one persistent `Scene`** whose sky/fog/key/IBL parameters smoothly interpolate across bands `A–E` (`bands.ts`), and replace the 6 per-scene cubemap probes with `environments.nightCinematic({ intensity: 0.85, background: false })` + **`effects.screenSpaceReflections({ intensity: 0.72, maxDistance: 26, roughness: 0.20, thickness: 0.25 })`** across rain-wet station cobblestones and steel rail heads!
  - Switch `main.ts:558` from `toneMapping: "none"` to `output: { toneMapping: "agx", exposure: 1.05, dither: true }`, add `effects.ambientOcclusion({ intensity: 0.68, radius: 0.85, multiBounce: true })`, `effects.contactShadows({ length: 0.30, thickness: 0.05, steps: 16, intensity: 0.68 })`, `effects.cinematicBloom({ threshold: 0.86, intensity: 0.38 })`, docked-station `effects.depthOfField`, and a warm `2700K` `effects.volumetricBeam` brass headlamp cone piercing the mist ahead of the tram!

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Multi-Lobe Enamel Tram, Riveted Trestle Piers & Stratified Island Cliffs (`models.ts`, `world.ts:550–710`, `shaders.ts`, `shaders-wgsl.ts`):**
  - Batch `townhouse-*`, `lamp-post-*`, `crates-*`, and station onlookers into `instances.model` / `createCrowd` pools (cutting unbatched `model()` nodes by `>75%` and eliminating cold WebGPU compile stalls).
  - Smooth `tram-enamel.glb` roof normals and assign `material.clearcoatPaint({ color: "#1d3557", clearcoat: 1.0, clearcoatRoughness: 0.06 })` navy/cream enamel livery, `material.brushedMetal({ color: "#d4a359", roughness: 0.24 })` brass trim/pantograph, `material.studioGlass` rain-beaded windows, and warm `2700K` interior `lights.rect` / `lights.point` cabin glow.
  - Replace `1m` cylinder `pylons` with riveted stone-and-iron viaduct trestle piers (`instances.model`), enable `receiveShadow: true` + `material.strata` / paired GLSL+WGSL cliff-rock detail shader on `lamplightUndersideAR2/BR2`, replace solid white `cloud-puffs` spheres with soft subsurface-lit cloud banks (preserving `?portable=1` `portable.ts` parity), add warm parallax window interiors to `townhouse-a/b/c`, and swap cone trees/dome stones for KTX2 painterly pines and mossy boulders.

### 4. Animation, Camera Choreography & Game Juice
- **Authentic Seated Passengers, Coat-Wearing Station Crowd & Pantograph Arcs (`world.ts:557, 829–838`, `riderMotion.ts`, `vfx.ts`):**
  - Rig/pose `pax-easy`, `pax-sightseer`, `pax-rushed`, and `pax-sleeper2` into **true seated bench poses** (`AnimationController` clips `seated-idle`, `read-paper`, `look-window`, `nod-sleep` + upper-torso G-force sway in `riderMotion.ts`—never ankle-pivoting standing statues!), and replace foreground capsule+sphere bowling-pin folk (`world.ts:557`) with `createCrowd` lantern/umbrella-holding station travelers!
  - Add `effects.particles` + `4×4` KTX2 overhead pantograph electric rain-arc `effects.flipbook` sparks, hard-braking flange sparks, and warm steam vents at station stops (`sim.ts` untouched).

### 5. UI/UX, HUD & Mobile Polish
- **Shrink `390x844` Enamel HUD From `>55%` to `<20%` & Migrate Fonts (`index.html`, `enamel.css`):**
  - Purge `"Graphik Web"`, `700` bold `"Lamplight Narrow"`, `"TT Commons Pro Mono"` prose, and `11px` `.dot`; self-host `.woff2` **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` station plaques, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) strictly on speed, stop distance `m`, comfort score, and rider counts, and **Monument Grotesk Mono** (`400`) on route/timetable IDs.
  - Add a subtle smoked-glass scrim behind `#title` text (`title.1280x720.jpg`), and on `390x844` (`enamel.css`) collapse `#top` + `#stats` + `#riders` into a slim `44px` top brass-and-enamel timetable bar + bottom-corner `>= 48px × 48px` throttle/brake/doors/bell levers so 80%+ of the night tram & sky-sea shine unobstructed!

### 6. Executable Checklist & Verification Gates
- [ ] Collapse the 5 duplicate `world.scenes[A..E]` (`world.ts:799`) into 1 band-interpolated `Scene`, replace the 6 cubemap probes with `environments.nightCinematic` + wet-rail `effects.screenSpaceReflections`, switch `main.ts:558` to AgX output, and add the warm `effects.volumetricBeam` tram headlamp.
- [ ] Batch townhouses/lamps/crates via `instances.model`, upgrade `tram-enamel.glb` with `clearcoatPaint` + `brushedMetal` brass + warm interior glow, replace toothpick `pylons` with riveted trestle piers, and apply `material.strata` + soft 3D clouds to `lamplightUndersideAR2/BR2`.
- [ ] Pose cabin `pax-*` in true seated animations (`riderMotion.ts`), replace foreground bowling-pin `folk-*` capsules (`world.ts:557`) with `createCrowd` station travelers, and add pantograph/brake spark VFX.
- [ ] Compact the `390x844` enamel HUD (`enamel.css`) from `>55%` down to `<20%` height and migrate `index.html` + `enamel.css` to `.woff2` `Whitney` + `DIN Pro` + `Monument Grotesk Mono`.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-last-train-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-last-train-port examples/last-train-port
  pnpm vitest run tests/unit/last-train-port/ tests/unit/apps/last-train-skip-unchanged.test.ts tests/unit/apps/duneglide-lamplight-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-last-train-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-last-train-port
  ```

---

## WP-25 — Saltwind Highway (`showcase-roadster-hours-port` → `examples/roadster-hours-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/roadster-hours-port/` locks the **6,124-step coastal trajectory within `2e-14`**; `saltwind-highway-wgsl-twins.test.ts` gates shaders). **Hard rule:** `examples/roadster-hours-port/{sim,course,data,autopilot,replay}.ts` MUST remain 100% untouched; apply all upgrades in visual/car/post/HUD files and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-roadster-hours-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-roadster-hours-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/roadster-hours-port/{main.ts,index.html,input.ts,hud.ts,presentation.ts,camera.ts,world.ts,look.ts,materials.ts,shaders.ts,shaders-wgsl.ts,cars.ts,cars.baked.ts,meshy.ts,meshy.baked.ts,meshy.lod.baked.ts,audio.ts}` + `art/{look,post,heatPass,speedPass,output,lut,detail,spray,fx,lean,landmarks,signs,shots,direction}.ts`
- **Genre Look Recipe:** Sunlit Big Sur / Amalfi 4 PM Coastal Grand-Touring Highway (`looks.preset("golden-hour")` + sparkling turquoise Gerstner ocean SSR + headland god rays + multi-lobe crimson `carPaint`).
- **Current Rendering & Screenshot Diagnosis (`evidence/roadster-hours-port/screens/final/`):**
  - **#1 BOTTLENECK — LUMPY MELTED-CLAY HERO ROADSTER WITH FROZEN WHEELS (`title.1280x720.jpg`, `key-drive.1280x720.jpg`):** `roadster.{bin,jpg}` (`world.ts:644–649`) is an asymmetric melted-clay Meshy mesh with a wavy white stripe, flat white painted ovals for taillights, brown clay-noodle rollbars, an opaque milky cockpit tub, and **all 4 wheels merged into `car-body` so tires never spin or steer**!
  - **Giant Grey Cotton-Ball Exhaust Smoke Blocking `217 KM/H` (`mid-drive.1280x720.jpg`, `world.ts:1002–1008`):** `plume-dust` spawns `2.0m` blurry grey point sprites straight into the chase lens right behind the speedometer!
  - **Dreary Overcast Coastline, Pyramid Sea-Stack, Cheeto Boulders & Missing WGSL `roadPass` (`art/post.ts:32–39`):** Heavy grey haze turns `"4 pm side sun"` into a dull overcast afternoon; `sea-stack` is a sharp dark-green pyramid cone; `boulders` are Cheeto-orange crystals; `flank-cliff` has white polka-dot noise; and **`roadPass` (`art/post.ts:32–39`) passes `glsl: ROAD_PASS_GLSL` with ZERO `wgsl` twin**!
  - **Global `DIN Pro` Rule-6 Violation & Mobile Keyboard Coach (`index.html:33`, `key-drive.390x844.jpg`):** `html, body { font: 400 14px/1.4 "DIN Pro" }` sets `DIN Pro` (`.woff`!) on **100% of prose/buttons/timers**, `#toast` (`CLEAN LANDING`) collides with 3D `HARBOR RELAY` highway signs, `#combo` dark-red text is illegible, and `390x844` floats `#dash` in mid-sky (`top: 182px`) while `#coach` prints `"W to accelerate · A / D to steer"` right above the touch buttons!
- **Current Sub-Scores (`/10`):** Lighting/Post `6.5` · Materials/Assets `5.6` · VFX/Animation `6.2` · UI/UX/Typography `6.0` · Perf/WebGPU `8.2` → **Overall `6.3 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Sunlit Golden-Hour Coastline, Ocean/Asphalt SSR & Dual-Backend `roadPass` (`art/look.ts`, `art/post.ts:32–39`, `main.ts`):**
  - Wire `backend: "auto"`, `?worker=1`, and `depth: { mode: "reversed" }` directly in `examples/roadster-hours-port/main.ts` (as well as wrapper) with `output: { toneMapping: "agx", exposure: 1.06, dither: true }`.
  - Replace dreary grey fog with warm coastal aerial perspective (`looks.preset("golden-hour")` + `looks.fogForExtent({ extent: 1400, color: "#f6dcc2", haze: 0.28 })`), 2-cascade `2048` sun shadows + `effects.contactShadows({ length: 0.35, thickness: 0.06, steps: 16, intensity: 0.70 })`, `effects.ambientOcclusion({ intensity: 0.60, radius: 0.9 })`, **`effects.screenSpaceReflections({ intensity: 0.65, maxDistance: 36, roughness: 0.22, thickness: 0.28 })`** across ocean swells and sea-spray-dampened coastal asphalt, headland `effects.godRays({ source: "sun", intensity: 0.36, decay: 0.95, samples: 48 })`, and `effects.cinematicBloom({ threshold: 0.86, intensity: 0.36 })`.
  - **Port `ROAD_PASS_GLSL` (`art/post.ts:32–39`) to paired `ROAD_PASS_WGSL`** so boost heat shimmer and speed streaks execute natively on WebGPU!

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Crisp Symmetrical Classic Roadster GLB With 4 Split Wheels (`world.ts:644–660`, `materials.ts`):**
  - Replace melted-clay `roadster.{bin,jpg}` with an admitted, symmetrical open-top classic grand-touring roadster GLB (KTX2) shaded with `material.carPaint({ color: "#b81d24", clearcoat: 1.0, clearcoatRoughness: 0.05 })` + crisp twin white lacquer racing stripes, `material.brushedMetal` chrome rollbar/wire-spoke rims/side-pipes, `material.studioGlass` raked windscreen, dark leather `material.fabric` cockpit + driver silhouette, **ruby-red `material.glowingEmissive` brake/afterburner lenses**, and **4 independent wheel/knuckle nodes**! Upgrade all 8 traffic classes (`sedan`..`bus`) with `material.clearcoatPaint` + `studioGlass` (KTX2).
- **Multi-Octave Gerstner Coastal Ocean & Limestone Sea-Stacks (`shaders.ts`, `shaders-wgsl.ts`, `world.ts`):**
  - Upgrade `SEA_VERTEX` + `SEA_FRAGMENT` (+ WGSL twins) from flat stripes to **multi-octave Gerstner swells** with turquoise shallow-cove `material.caustics` absorption, white breaker foam bands, and glancing sun-glitter; replace the green pyramid `sea-stack` and Cheeto-orange `boulders` with `material.strata` weathered coastal limestone sea-stacks & sandstone boulders (removing the white polka-dot `rhNoise` on `flank-cliff`).

### 4. Animation, Camera Choreography & Game Juice
- **Wheel Spin/Steer & Clean Ground-Hugging Tire Trails (`presentation.ts`, `world.ts:1002–1008`, `art/fx.ts`):**
  - Drive 4-wheel pitch spin (`speed * dt / wheelRadius`), front steering yaw, and landing suspension jounce in `presentation.ts` (`createFixedStepPresenter` + `2e-14` sim parity untouched!).
  - **Fix `plume-dust` (`world.ts:1002–1008`):** Delete the `2.0m` grey cotton-ball sprites blocking the speedometer; replace with ground-hugging twin `effects.trail` tire-scuff ribbons + compact lateral `4×4` KTX2 slip-smoke `effects.flipbook` wisps only when `|slipAngle| > 0.14` + crisp blue-amber twin boost exhaust cones + `createHitStop` (`35ms`) on near-miss overtakes.

### 5. UI/UX, HUD & Mobile Polish
- **Fix Global `DIN Pro` Violation, De-Collide `#toast` & Fix `390x844` Touch HUD (`index.html:33`, `main.ts:37`, `hud.ts`):**
  - Replace global `.woff` `DIN Pro` (`index.html:33`) and `700` `.wordmark` with self-hosted `.woff2` **Whitney** (`400/500/600`, `tnum` on `0:12.04` timers & prose/buttons/toasts, lowercase `smcp` `>= 12px` labels, `font-synthesis: none`), reserving `.woff2` **DIN Pro** (`500`, `tnum`) **strictly** for standalone `#speedo` (`217`), `#score`, `#combo`, and distance numerals!
  - Brighten `#combo` to high-contrast gold (`#fbbf24`) on smoked glass; dock `#toast` (`CLEAN LANDING`) at `bottom: 118px` above `#dash` so it never collides with 3D `HARBOR RELAY` highway signs; and on `390x844`, dock `#dash` cleanly at `bottom: 24px` between the `>= 48px × 48px` left/right touch pads and swap `#coach` on `(pointer: coarse)` to `"Hold Gas / Boost · Tap ◀ ▶ to Steer"`.

### 6. Executable Checklist & Verification Gates
- [ ] Add `ROAD_PASS_WGSL` in `art/post.ts:32–39`, wire direct WebGPU/reversed-Z/worker flags in `examples/roadster-hours-port/main.ts`, switch to sunlit golden-hour aerial fog + AgX output, and enable ocean/asphalt `effects.screenSpaceReflections` + `effects.godRays` + `effects.contactShadows`.
- [ ] Replace lumpy `roadster.{bin,jpg}` (`world.ts:644`) with a symmetrical classic roadster GLB (`material.carPaint` + `studioGlass` + ruby emissive taillights + **4 spinning/steering wheel nodes**), upgrade `SEA_*` (+ WGSL) to Gerstner swells + breaker foam, and replace green pyramid sea-stacks & Cheeto boulders with `material.strata` coastal limestone.
- [ ] Delete the `2.0m` lens-blocking `plume-dust` cotton balls (`world.ts:1002`), replacing them with ground-hugging `effects.trail` tire ribbons + slip-angle smoke wisps + twin boost exhaust flames.
- [ ] Replace global `.woff` `DIN Pro` (`index.html:33`) with `.woff2` `Whitney` + `DIN Pro` (`font-synthesis: none`), move `#toast` off 3D highway signs, dock `#dash` at bottom on `390x844`, and swap `"W / A / D"` coach copy to touch prompts.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-roadster-hours-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-roadster-hours-port examples/roadster-hours-port
  pnpm vitest run tests/unit/roadster-hours-port/ tests/unit/apps/saltwind-highway-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-roadster-hours-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-roadster-hours-port
  ```

---

---

## WP-26 — Splat (`showcase-splat-rush-port` → `examples/splat-rush-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/splat-rush-port/reference-replay.test.ts` locks **28 simulation state fields + `rng.count`** across 1,500 fixed 60 Hz steps against `tests/browser/data/splat-rush-reference-replay.json`). **Hard rule:** `examples/splat-rush-port/sim.ts`, `rng.ts`, `autopilot.ts`, collider math, and `rng.next()` call counts MUST remain 100% untouched. All edits land in presentation/render files under `examples/splat-rush-port/` followed by `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-splat-rush-port/package.json` depends solely on `"@aura3d/engine": "workspace:*"` (`0` `three` / `@types/three` / `@react-three/*` / `postprocessing` entries across package manifests and source).
- **Exact Files:**
  - Wrapper: `apps/showcase-splat-rush-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/splat-rush-port/{main.ts,world.ts,look.ts,shaders.ts,shaders-wgsl.ts,meshes.ts,backdrop.ts,pickups.ts,models.ts,vfx3d.ts,presentation.ts,hud.ts,fx.ts,audio.ts,art/direction.ts,index.html}`
  - Assets: `examples/splat-rush-port/assets/models/{ball-shell,barrier-spike,finish-arch,gate-arch,gem-double,gem-single,shield-orb,star-pickup}.glb` + `/aura-assets/chroma-{palette,easel}-island.glb`
- **Genre Look Recipe:** Glossy Vinyl-Studio Lacquer & Wet-Enamel Arcade (`looks.preset("product-studio")` + warm pastel carnival dome + AgX highlight rolloff).
- **Current Rendering & Screenshot Diagnosis (`evidence/splat-rush-port/screens/final/`):**
  - `main.ts:358` mounts `output: { toneMapping: "none", dither: false }` and compensates in `look.ts` with `effects.colorGrade({ gain: 1.4, contrast: 1.14, saturation: 1.14 })`, clipping specular highlights on the white track and gem facets while leaving banding in pastel sky gradients.
  - In `mid-action-1280.jpg`, the cyan player ball hovers above a pitch-black circular `ball-shadow` quad (`world.ts:759`) visibly detached to the lower-left over flat unlit paint circles (`splatters`). Track edges (`rails`, `world.ts:763`) are chains of low-poly `8×6` sphere beads; colour-switch `gates` (`world.ts:769–777`) are bare tubular arches with static frozen drip spheres and **empty openings** (no translucent paint curtain to telegraph the active pigment).
  - Surrounding the ribbon (`title-1280.jpg`, `mid-action-1280.jpg`, `mid-action-390.jpg`), 54 6-sided hexagonal cylinder-cones (`spireRingMesh`, `world.ts:537`) poke through a flat `cloud-sea` disc, while realistic gritty PBR Meshy `gem-double.glb` rocks clash with cel-outlined (`effects.outline`) flat-toon track batches. Speed lines (`streaks`, `world.ts:996`) are 50 rigid white rectangular toothpicks floating in mid-air.
  - `title-1280.jpg` displays a stale `"CHROMA ROLL"` card inside an oversized opaque cream `#modal` covering ~45% of the viewport; `index.html` + `hud.ts` load `GT-Walsheim-Bold.woff2` (`font-weight: 800/900`) with `'Trebuchet MS', system-ui` fallbacks and raw emoji icons (`🔊`, `🌈`, `🛡`, `🎨`).
- **Current Sub-Scores (`/10`):** Lighting/Post `7.2` · Materials/Assets `6.5` · VFX/Animation `7.4` · UI/UX/Typography `6.6` · Perf/WebGPU `8.5` → **Overall `7.2 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **AgX Filmic Output & Studio IBL (`main.ts:355–361`, `look.ts`, `world.ts`):**
  - Replace `output: { toneMapping: "none", dither: false }` with `output: { toneMapping: "agx", exposure: 1.04, dither: true, ...lab.output }` (preserving `?gamut=p3` wide-gamut laboratory support) so saturated magenta/cyan/amber enamel highlights roll off smoothly like Blender Eevee AgX instead of clipping flat white.
  - Replace ad-hoc ambient fill with `environments.productHero({ intensity: 0.88, specularIntensity: 1.15, background: false })` paired with `sky.gradient({ zenith: "#f3e8ff", horizon: "#ffe8d6", ground: "#e5d4f7", horizonGlow: 0.42 })` and `looks.fogForExtent({ extent: 260, color: "#f6ebfa", haze: 0.34, mode: "exp2" })` (`aura3d look lint` clean, zero `AMBIENT_FLATTENS_IBL`).
- **Shadow Grounding, GTAO & Wet-Track SSR (`look.ts`):**
  - Upgrade directional sun light to `lights.key({ position: [18, 34, 16], target: [0, 0, -18], intensity: 2.8, color: "#fff6ea", shadow: { mapSize: 2048, bias: 0.0015 } })`.
  - Add `effects.contactShadows({ length: 0.35, thickness: 0.08, steps: 16, intensity: 0.72, lights: "sun" })` + `effects.ambientOcclusion({ intensity: 0.42, radius: 0.62, density: 0.6, multiBounce: true })`, and soften/shrink `ball-shadow` (`world.ts:759`) into a subtle pigment-tinted ambient bounce under the sphere rather than a detached black disc.
  - Enable `effects.screenSpaceReflections({ intensity: 0.38, maxDistance: 22, roughness: 0.22, thickness: 0.25 })` so colorful pigment gates, gems, and the glossy ball cast live reflections down the wet-enamel white track, paired with `effects.cinematicBloom({ threshold: 0.84, intensity: 0.30, radius: 0.38, knee: 0.25 })` and `effects.colorGrade({ contrast: 1.06, saturation: 1.08, vibrance: 0.12, temperature: 0.04 })`. Keep `effects.depthOfField` active on title/results modals and `depth: { mode: "reversed" }` on the gameplay camera.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Liquid-Chroma Ball & Brushed-Gesso Track (`shaders.ts`, `shaders-wgsl.ts`, `models.ts`, `world.ts`):**
  - Upgrade `BALL_FRAGMENT` (`shaders.ts`) and its exact WebGPU twin `BALL_FRAGMENT_WGSL` (`shaders-wgsl.ts`) using `a3d_noise` + `WGSL_NOISE` (`examples/shared/wgsl-twins.ts`) to render a multi-layer **swirling wet-lacquer marble pigment** driven by `ballRot`, topped with a crisp Schlick Fresnel clearcoat specular lobe (`clearcoat = 1.0`, `clearcoatRoughness = 0.05`) and subtle grazing iridescence.
  - Upgrade `TRACK_FRAGMENT` + `TRACK_FRAGMENT_WGSL` with fine gesso canvas micro-normal weave (`canvas` uniform) and a glossy wet-enamel center racing line that modulates specular response.
- **Translucent Pigment Gate Curtain (`meshes.ts`, `world.ts:769–783`, `shaders.ts`, `shaders-wgsl.ts`):**
  - Mount an interior curtain quad batch (`gate-curtains`, `GATE_MAX` instances) inside each `gate-arch.glb` / `gateMesh` opening driven by a **paired GLSL 3.00 + WGSL liquid-paint curtain shader** (`transparent: true, depthWrite: false, side: "double"`): vertical downward paint-drip meniscus waves, colour-blind symbol watermark silhouette (`circle`/`triangle`/`square`/`cross`), and bright Fresnel rim glow in the gate's active pigment colour.
- **Retextured Studio Islands, Bevelled Curbs & Volumetric Cloud Sea (`backdrop.ts`, `pickups.ts`, `world.ts`):**
  - Delete `spireRingMesh` (`world.ts:537` 6-sided hexagonal cones) and replace the horizon ring with GPU-instanced, KTX2-compressed painterly vinyl-studio spires and floating art-supply islands (`chroma-palette-island.glb`, `chroma-easel-island.glb`), plus `instances.sphere` + `scatterInArea` 3D pastel cloud puffs billowing across the `cloud-sea` plane.
  - Run the `aura3d-retexture` KTX2 workflow across `gem-single.glb`, `gem-double.glb`, `shield-orb.glb`, `star-pickup.glb`, and `barrier-spike.glb` (preserving vertex counts and position-accessor hashes) so every prop uses cohesive glossy ceramic/lacquer/studio-glass surface families (`material.ceramic`, `material.lacquer`, `material.studioGlass`) instead of gritty dark rock PBR.
  - Replace the `8×6` sphere-bead `rails` (`world.ts:763`) with smooth continuous bevelled extruded curb strips (`meshes.ts`) along each track segment.

### 4. Animation, Camera Choreography & Game Juice
- **120/144 Hz Presenter & Camera Feel (`presentation.ts`, `world.ts`):**
  - Retain `createSplatPresenter` (`createFixedStepPresenter`) for 0%-stalled high-refresh interpolation; add `createHitStop` + `createJuice` micro-FOV punch (`+3.5°` over `140ms` exponential decay) when smashing matching barriers or triggering Fever/Rainbow mode, plus dynamic portrait FOV widening (`60°` → `68°` on `aspect < 0.8`) so studio islands frame both sides of the ribbon on `390x844` mobile.
- **Pigment Ribbon Wake & Paint-Splash Flipbooks (`vfx3d.ts`, `world.ts:920–1005`, `audio.ts`):**
  - Delete the 50 rigid white toothpick boxes (`streaks` in `world.ts:996`); attach a continuous `effects.auroraRibbon` / `effects.trail` pigment ribbon behind the ball (live-tinted to `COLORS[sim.ballColor]`) plus soft peripheral velocity motes (`effects.particles`).
  - Upgrade colour-switch and barrier-shatter bursts (`vfx3d.ts`) to `effects.flipbook` (`4×4` KTX2 glossy paint-splash sprite sheet authored via `aura3d-game-art`) and upgrade ground `splatters` (`world.ts:922`) with raised glossy wet-meniscus normal shading.
  - Wire pitched marimba/glass-pop combo ascending harmonic cues in `audio.ts` (`createCueBank`).

### 5. UI/UX, HUD & Mobile Polish
- **AuraOne Typography & Zero-Emoji Vector HUD (`index.html`, `hud.ts`):**
  - Remove `GT-Walsheim-Bold.woff2`, `font-weight: 800/900`, and `'Trebuchet MS', system-ui, sans-serif`. Self-host licensed `.woff2` **Whitney** (`400/500/600`, `font-feature-settings: "tnum" 1`, lowercase `smcp` for `score` / `streak` / `best` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) for live score, speed multiplier (`×4`), and summary totals, and **Monument Grotesk Mono** (`400`) for seed/diagnostic readouts.
  - Replace all raw emojis (`🔊`, `🔇`, `🌈`, `🛡`, `🎨` in `index.html` & `hud.ts`) with crisp 1.5px-stroke inline SVGs + colour-blind shape badges (`● ▲ ■ ✚`).
- **Compact Frosted Title Card & `390x844` Touch Ergonomics (`index.html`, `hud.ts`):**
  - Redesign `#modal` from an opaque 45%-screen cream sheet into a compact translucent frosted glass studio plaque (`max-width: 336px`, `backdrop-filter: blur(14px)`), retiring stale `"CHROMA ROLL"` screenshots in favor of `"SPLAT"`.
  - Add a non-intrusive 1.5-second diegetic lane-drag chevron cue (`‹ Drag to Steer · Match Pigment Gates ›`) on first spawn that fades on first input, and enforce `min-width: 44px; min-height: 44px` + `env(safe-area-inset-*)` on `#sound-btn`, pause, and modal CTAs on `(pointer: coarse)`.

### 6. Executable Checklist & Verification Gates
- [ ] Switch `examples/splat-rush-port/main.ts` output to `{ toneMapping: "agx", exposure: 1.04, dither: true }` and configure `environments.productHero`, `lights.key`, `effects.contactShadows`, `effects.ambientOcclusion`, `effects.screenSpaceReflections`, and `effects.cinematicBloom` in `look.ts`.
- [ ] Upgrade `BALL_FRAGMENT` + `BALL_FRAGMENT_WGSL` (wet-lacquer swirl + Fresnel clearcoat), `TRACK_FRAGMENT` + `TRACK_FRAGMENT_WGSL` (gesso weave + glossy racing line), and add paired GLSL+WGSL translucent `gate-curtains` inside every gate arch.
- [ ] Replace `spireRingMesh` 6-sided hex cones and `8×6` sphere-bead `rails` with bevelled continuous curbs, 3D instanced cloud puffs, and KTX2-retextured ceramic/lacquer pickup & island GLBs (`aura3d-retexture`).
- [ ] Replace the 50 rigid `streaks` toothpick boxes with a live-tinted `effects.auroraRibbon` wake + `4×4` KTX2 paint-splash `effects.flipbook` bursts and widen mobile portrait FOV so peripheral islands stay in frame.
- [ ] Migrate `index.html` + `hud.ts` to licensed `Whitney` + `DIN Pro` `.woff2` (`font-synthesis: none`), replace all emoji icons with inline SVGs, compact `#modal`, and enforce `44px` coarse-pointer touch targets.
- [ ] Run verification & wrapper sync gates (confirming zero `sim.ts`/`rng.ts` diffs and zero `three` packages/imports):
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-splat-rush-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-splat-rush-port examples/splat-rush-port
  pnpm vitest run tests/unit/splat-rush-port/
  npx @aura3d/cli look lint apps/showcase-splat-rush-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-splat-rush-port
  ```

---

## WP-27 — Serpentine Sky Run (`showcase-serpentine-sky-run-port` → `examples/saiyan-snake-way-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/saiyan-snake-way-port/reference-replay.test.ts` verifies **183 snapshots across 5,433 fixed steps within `1e-6`** against `tests/browser/data/saiyan-snake-way-reference-replay.json`; `tests/unit/apps/serpentine-sky-run-wgsl-twins.test.ts` gates shader parity). **Hard rule:** `examples/saiyan-snake-way-port/sim.ts`, `road.ts` spline/elevation math, obstacle placement tables, and RNG sequences MUST remain 100% untouched; apply all upgrades in render/camera/art/HUD modules and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-serpentine-sky-run-port/package.json` depends only on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports anywhere).
- **Exact Files:**
  - Wrapper: `apps/showcase-serpentine-sky-run-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/saiyan-snake-way-port/{main.ts,world.ts,road.ts,materials.ts,shaders.ts,shaders-wgsl.ts,models.ts,hero.ts,presentation.ts,hud.ts,input.ts,sfx.ts,styles.ts,index.html}` + `art/{colorScript.ts,lookRuntime.ts,cinePost.ts,vfx.ts,vfxEvents.ts,ambientFx.ts,motion.ts,shots.ts,direction.ts}`
  - Assets: `examples/saiyan-snake-way-port/assets/models/{barrier,cart,feast,gate,island,lantern,ogre,runner-script,runner,serpentHead,spireA,spireB,spireC}.glb`
- **Genre Look Recipe:** Mythic Cloud-Sea Golden-Hour Anime Diorama (`looks.preset("golden-hour")` + 5-chapter `colorScript.ts` + crepuscular sun shafts + carved stone/crimson lacquer PBR).
- **Current Rendering & Screenshot Diagnosis (`evidence/saiyan-snake-way-port/screens/final/`):**
  - **CRITICAL DEFECT IN `mid-action-1280.jpg`:** A huge out-of-focus dark-crimson vertical slab blocks the **entire right ~13% of the 1280×720 screen** from top to bottom! In `world.ts:1036`, the right-shoulder chase camera (`eye += frame.R * 2.6`) passes straight into the right pilgrim gate post placed at `onRoad(gf, +5.6, 4.5)` (`world.ts:884`).
  - **Flat 2D Sand-Ripple Cloud Floor & Bend Seam:** `SKY_FRAGMENT` (`shaders.ts`, `DECK_BASE = -115`) renders a 2D ray-marched floor that reads like flat wavy yellow sand ripples with **zero 3D volumetric cloud puffs** around the coils. Where the road curves away (center-left of `mid-action-1280.jpg`), the unlit road underside forms a harsh black/olive gash against the bright sky. The road deck (`ROAD_FRAGMENT`) reads like flat yellow bathroom tiles with green grid lines flanked by smooth plastic olive cylinders (`bolster`) and rigid cuboid `verge-flags` (`world.ts:893`).
  - **Dim Title & Legacy Interpolator:** `title-1280.jpg` leaves `serpentHead.glb` silhouettes-dark in murky purple haze; `main.ts:58` still calls older `createRenderInterpolator` instead of `createFixedStepPresenter`.
  - **Mobile `390x844` HUD Crowding (`mid-action-390.jpg`):** `#player`, `#side`, `#surge-chip` (`"SURGE READY · SPACE"`—showing a keyboard prompt on touch!), and `#banner` stack across the **top 38% of the portrait screen**, styled in `"Graphik Web"` (marketing font) and `"A3G Canela"`.
- **Current Sub-Scores (`/10`):** Lighting/Post `7.3` · Materials/Assets `6.4` · VFX/Animation `6.8` · UI/UX/Typography `6.7` · Perf/WebGPU `8.2` → **Overall `7.0 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Immediate Camera Clearance & Title Rim Rig (`world.ts:880–915`, `world.ts:1010–1070`):**
  - Widen the purely decorative `gate.glb` visual arch span (`±5.6` → `±7.4`, outside the stone bolsters; gates have zero sim colliders), attach `createCameraClearance` (`@aura3d/engine`) to the chase rig, and add a smooth near-plane dither/alpha fade (`smoothstep(1.6, 4.8, camDist)`) on `gate`, `lantern`, and `spire` shaders so no foreground post can ever block the lens.
  - Add dedicated title-mode hero key + jade rim `lights.spot` nodes framing `serpentHead.glb` when `mode === "title"` so the carved dragon head gleams against the dawn mist.
- **Chapter-Driven God Rays, Contact Grounding & Coil Mist (`art/colorScript.ts`, `art/cinePost.ts`, `art/lookRuntime.ts`):**
  - Configure `output: { toneMapping: "agx", exposure: 1.02, dither: true }`, chapter-interpolated `environments.outdoor({ intensity: 0.9, biome: "alpine" })`, and `lights.key` (`shadow: { mapSize: 2048, bias: 0.0018 }`).
  - Add `effects.godRays({ source: "sun", intensity: 0.44, decay: 0.95, samples: 48, medium: 0.16, color: "#ffe6b3" })`, `effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 16, intensity: 0.68, lights: "sun" })`, `effects.ambientOcclusion({ intensity: 0.45, radius: 0.78, multiBounce: true })`, `effects.volumetricFog({ density: 0.12, heightFalloff: 0.045, heightReference: -18, godRayDensity: 0.32, color: "#ffd996" })` pooling between the serpent coils, and `effects.cinematicBloom({ threshold: 0.85, intensity: 0.34, radius: 0.4 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Cyclopean Carved Stone Road, Underside Bounce & Dragon-Scale Bolsters (`shaders.ts`, `shaders-wgsl.ts`, `road.ts`, `materials.ts`):**
  - Upgrade `ROAD_FRAGMENT` + `ROAD_FRAGMENT_WGSL` (`a3d_noise` + `WGSL_NOISE`) from flat yellow grid lines to **bevelled cyclopean temple flagstones**: recessed mortar joints with height-derived normal perturbation, jade moss/lichen tucked into kerb crevices, specular roughness variation (`0.42..0.88`), and warm cloud-sea hemisphere upward bounce on the underside triangles of `road.ts` (completely erasing the black bend seam in `mid-action-1280.jpg`).
  - Upgrade `BOLSTER_FRAGMENT` + `BOLSTER_FRAGMENT_WGSL` with imbricated carved dragon-scale relief normals and warm gilded ridge highlights; assign `material.lacquer({ color: "#8f1d24", roughness: 0.18, clearcoat: 0.92 })` + `material.brushedMetal` gold fittings to `gate.glb` and `lantern.glb`.
- **3D Subsurface-Lit Cumulus Cloud Sea & Cloth Banners (`world.ts`, `models.ts`, `shaders.ts`, `shaders-wgsl.ts`):**
  - Scatter 220 GPU-instanced 3D billowy cloud banks (`instances.custom` / `scatterAlongPath` along the `buildRoad()` spine at `y = -30..-5`, partitioned via `splitScatterByDistance`) shaded with a **paired GLSL 3.00 + WGSL subsurface-scattering cumulus shader** (Henyey-Greenstein sun silver-lining + Beer-Powder self-shadowing + chapter-tinted under-glow) layered above the distant sky dome.
  - Replace rigid box `verge-flags` (`world.ts:893`) with subdivided silk prayer-banner meshes driven by a vertex wind-flutter wave in GLSL+WGSL; run `aura3d-retexture` + KTX2 compression across `serpentHead.glb`, `gate.glb`, `island.glb`, `spireA/B/C.glb`, `cart.glb`, `feast.glb`, and `ogre.glb`.

### 4. Animation, Camera Choreography & Game Juice
- **Migrate to `createFixedStepPresenter` + `runMotionGate` (`main.ts:58`, `presentation.ts`, `hero.ts`):**
  - Swap legacy `createRenderInterpolator` in `main.ts:58` to `createFixedStepPresenter` (`presentation.ts`) verified by `runMotionGate` (`0%` stalled frames at 120/144 Hz), keeping `sim.ts` fixed-step advancing untouched.
  - Add `createFootSlideMeter` verification on `runner-script.glb` (`< 0.04 m/s` stance slip) and secondary spring-lag bone offsets on the pilgrim's sash/headband in `hero.ts`.
- **Surge Ki Ribbon & Gate Sonic Rings (`art/vfx.ts`, `art/vfxEvents.ts`, `sfx.ts`):**
  - Attach dual golden-jade `effects.auroraRibbon` + `effects.trail` slipstreams during `surge`/dash states, trigger a `4×4` KTX2 anime shockwave `effects.flipbook` + FOV kick (`+4°`) when clearing guardian gates or boost pads, and layer taiko/shakuhachi wind-rush dynamics in `sfx.ts`.

### 5. UI/UX, HUD & Mobile Polish
- **AuraOne Typography Migration (`styles.ts`, `hud.ts`, `index.html`):**
  - Remove `"Graphik Web"` (AuraOne marketing-only font) and `"A3G Canela"`. Self-host **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` for `pilgrim` / `chapter` / `surge` labels, `font-synthesis: none`) and **DIN Pro** (`500`, `tnum`) for distance (`m`), speed, stamina `%`, and split deltas.
- **Un-Crowd `390x844` Mobile Portrait & Fix Touch Prompts (`styles.ts`, `hud.ts`, `input.ts`):**
  - Collapse `#player` and `#side` on `@media (max-width: 640px)` into a single compact `38px` top telemetry pill (`<= 12%` of vertical height) and auto-fade chapter `#banner` toasts after `2.2s` so the horizon and serpent coils stay wide open.
  - Detect `(pointer: coarse)` to display `"TAP SURGE"` instead of `"SURGE READY · SPACE"`, and render tactile `48px × 48px` bottom-corner glass touch buttons (`JUMP`, `CROUCH`, `SURGE`) respecting `env(safe-area-inset-bottom)`.

### 6. Executable Checklist & Verification Gates
- [ ] Widen visual `gate.glb` arch offset (`±5.6` → `±7.4`), wire `createCameraClearance` + near-camera alpha fade (`world.ts:884, 1036`), and add title-mode hero/rim lights on `serpentHead.glb`.
- [ ] Enable AgX output, `effects.godRays`, `effects.contactShadows`, `effects.ambientOcclusion`, coil-level `effects.volumetricFog`, and `effects.cinematicBloom` across all 5 chapters in `art/colorScript.ts` + `art/cinePost.ts`.
- [ ] Upgrade `ROAD_FRAGMENT`/`BOLSTER_FRAGMENT` (+ WGSL twins) with carved stone relief & underside bounce, scatter 220 3D SSS cumulus cloud instances along the spline, replace cuboid `verge-flags` with wind-fluttering banners, and KTX2-retexture landmark GLBs.
- [ ] Swap `createRenderInterpolator` (`main.ts:58`) to `createFixedStepPresenter` + `runMotionGate`, and add golden-jade `effects.auroraRibbon` surge trails + gate `effects.flipbook` shockwaves.
- [ ] Replace `Graphik Web`/`Canela` with `Whitney` + `DIN Pro` `.woff2`, compact the `390x844` top HUD to `<= 12%` height, replace `"SPACE"` with `"TAP SURGE"` on touch devices, and verify `>= 44px` touch buttons.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-serpentine-sky-run-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-serpentine-sky-run-port examples/saiyan-snake-way-port
  pnpm vitest run tests/unit/saiyan-snake-way-port/ tests/unit/apps/serpentine-sky-run-wgsl-twins.test.ts
  npx @aura3d/cli look lint apps/showcase-serpentine-sky-run-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-serpentine-sky-run-port
  ```

---

## WP-28 — The Bellkeeper's Walk (`showcase-where-the-wind-wanders-port` → `examples/where-the-wind-wanders-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/where-the-wind-wanders-port/reference-replay.test.ts` locks the **2,098-step trajectory within `1e-9`** against `tests/browser/data/where-the-wind-wanders-reference-replay.json`). **Hard rule:** `examples/where-the-wind-wanders-port/sim.ts`, `wind.ts` simulation state, letter trigger radii, and bell trigger step counts MUST remain 100% untouched; apply all upgrades in `world.ts`, `scenery.ts`, `shaders*.ts`, `models.ts`, `vfx.ts`, and `ui.ts`, then run `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-where-the-wind-wanders-port/package.json` depends only on `"@aura3d/engine": "workspace:*"` (`0` Three.js dependencies or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-where-the-wind-wanders-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/where-the-wind-wanders-port/{main.ts,world.ts,daylight.ts,shaders.ts,shaders-wgsl.ts,paper-pass.ts,scenery.ts,terrain.ts,wind.ts,meshkit.ts,models.ts,model-assets.ts,env-assets.ts,locomotion.ts,gait-motion.ts,vfx.ts,camera-seq.ts,ui.ts,captions.ts,presentation.ts,audio.ts,index.html}`
  - Assets: `examples/where-the-wind-wanders-port/assets/models/{belltower,belltower-bell,boat,cottage,hero,kite,letter,oak,pine,shrub,stones,wisp}.glb`
- **Genre Look Recipe:** Golden-Hour Painterly Pastoral Diorama (`looks.preset("golden-hour")` + 4-phase `daylight.ts` progression + crepuscular meadow sunbeams + moonlit reflective lake + subtle watercolor `paper-pass.ts`).
- **Current Rendering & Screenshot Diagnosis (`evidence/where-the-wind-wanders-port/screens/final/`):**
  - **Disabled Sun Shafts (`world.ts:271`):** `const SHAFTS_ENABLED = false;` disables volumetric sunbeams completely, flattening the golden-hour atmosphere across `key-walk.1280x720.jpg` and `mid-walk.1280x720.jpg`. DPR is also capped low at `1.25` in `main.ts:154`.
  - **Giant Pink Polka-Dot Crossed Shrubs & Lollipop Trees:** Across `title.1280x720.jpg`, `key-walk.1280x720.jpg`, and `key-walk.390x844.jpg`, `shrub` instances (`world.ts:524`, scaled `2.2m–3.1m` wide) render as flat intersecting X-billboard planes plastered with uniform pastel-pink circles and noisy Bayer-dithered white spikes, while `scenery.ts` (`buildTreeMesh`) still places faceted icosahedron blobs in the background.
  - **Ruler-Straight Lake Cut & Blotchy Night Water:** In `mid-walk.1280x720.jpg`, the flat `sea` quad intersects the meadow in a razor-sharp straight line with zero foam, depth absorption, or reflection; in `results.1280x720.jpg` (night boat epilogue), the water displays posterized dark-teal ovals.
  - **Stale Rigid-Stick Screenshots & Disconnected Live Kite:** `title.1280x720.jpg` is stale (still showing the thick white rigid pole from hip to roof deleted in `models.ts:105`), while live builds now leave `kite.glb` floating unattached in mid-air without a string!
  - **Typography & Mobile Touch Size:** `ui.ts` loads `GT Walsheim`, `Graphik Web`, and `Canela`, and `#wwui-pause-btn` (`ui.ts:78`) has `height: 36px` (`< 44px` coarse-pointer minimum).
- **Current Sub-Scores (`/10`):** Lighting/Post `7.8` · Materials/Assets `6.8` · VFX/Animation `8.0` · UI/UX/Typography `7.4` · Perf/WebGPU `8.4` → **Overall `7.6 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Golden-Hour Crepuscular Rays & 4-Phase IBL (`world.ts:268–360`, `daylight.ts`, `main.ts:154`):**
  - Raise DPR cap in `main.ts:154` from `1.25` to `1.5` and set `output: { toneMapping: "agx", exposure: 1.0, dither: true }` feeding the dual-backend `paper-pass.ts` (`effects.shaderPass` with `insertAt: "after-tonemap"`).
  - Re-enable volumetric meadow sun shafts (`SHAFTS_ENABLED = true` in `world.ts:271` using `effects.volumetricBeam` raking through the oak/belltower silhouettes) AND add screen-space `effects.godRays({ source: "sun", intensity: 0.38, decay: 0.96, samples: 48, medium: 0.15, color: "#ffe7ba" })` modulated per `daylight.ts` phase (`meadow: 0.24`, `gold: 0.46`, `dusk: 0.30`, `night: 0.10`).
- **Contact Grounding, GTAO & Moonlit Lake SSR (`world.ts`):**
  - Add `effects.contactShadows({ length: 0.28, thickness: 0.05, steps: 16, intensity: 0.65, lights: "sun" })` + `effects.ambientOcclusion({ intensity: 0.42, radius: 0.72, multiBounce: true })` so cottage stone walls, wildflower clumps, and the bellkeeper's boots sit firmly in the turf.
  - Add `effects.screenSpaceReflections({ intensity: 0.52, maxDistance: 32, roughness: 0.16, thickness: 0.25 })` + `effects.cinematicBloom({ threshold: 0.86, intensity: 0.26, radius: 0.38 })` so the dusk belltower, stars, and moonlit lantern reflect across the lake during `mid-walk` and the `results` boat epilogue, paired with `sky.preetham` + `looks.fogForExtent({ extent: 220, color: "#f3dfc1", haze: 0.30 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Retire Pink Polka-Dot Crossed Shrubs & Icosahedron Trees (`world.ts:510–560`, `scenery.ts`, `shaders.ts`, `shaders-wgsl.ts`):**
  - Delete the `2.2m–3.1m` crossed-card `shrub.glb` billboards (`world.ts:524`) and remaining `scenery.ts` icosahedron `buildTreeMesh` blobs.
  - Populate the meadow with GPU-instanced 3D curved grass tufts + true 3D painterly wildflower clusters (chamomile, poppies, lavender stalks via `instances.custom` + `scatterInArea` + `splitScatterByDistance` distance LOD) driven by an upgraded **paired GLSL 3.00 + WGSL wind-wave foliage shader** (`GRASS_VERTEX/FRAGMENT` + WGSL twin): travelling gust waves from `wind.ts`, root-to-tip ambient darkening, and warm forward sun subsurface translucency.
  - Line the far shore with KTX2-retextured `oak.glb` and `pine.glb` (`instances.model`), and run `aura3d-retexture` + KTX2 compression on `cottage.glb` (`material.matteClay` limewash plaster + weathered cedar shingles), `belltower.glb`, `belltower-bell.glb` (`material.brushedMetal` aged verdigris bronze), `hero.glb` (`material.fabric` woven wool cloak with sheen), and `boat.glb`.
- **Feathered Shoreline Foam & Gerstner Lake Shader (`SEA_FRAGMENT` + `seaFragmentWgsl` in `shaders.ts` / `shaders-wgsl.ts`):**
  - Pass terrain elevation / signed shore distance into `SEA_FRAGMENT` and `seaFragmentWgsl` to render depth-based teal/amber absorption, soft lapping shoreline foam bands (erasing the ruler-straight geometric lake cut in `mid-walk.1280x720.jpg`), and smooth dual-octave Gerstner micro-normals that eliminate the posterized ovals in `results.1280x720.jpg`.

### 4. Animation, Camera Choreography & Game Juice
- **Dynamic Catenary Kite Thread (`models.ts`, `world.ts`):**
  - Connect `heroActor.animation.socket("RightHand")` (or shoulder clasp) to the swaying `kite.glb` with a 16-segment procedural catenary filament (`geometry.dynamic` thin warm-linen ribbon, `opacity: 0.55`) flexing gently with wind gusts—replacing the deleted rigid white pole without floating disconnected.
- **Cloak Wind Lag, Acoustic Bell Shockwave & Boat Wake (`models.ts`, `vfx.ts`, `audio.ts`):**
  - Layer subtle wind-gust secondary bone sway onto the hero's cloak/scarf over `createAnimationController` + `createLocomotion` (`createFootSlideMeter` verified).
  - Trigger a warm golden acoustic shimmer dome + swirling dandelion-seed & petal burst (`effects.flipbook` + `effects.particles` in `vfx.ts`) when `sim.bellRung` fires, and trail a moonlit V-shaped water ripple (`effects.auroraRibbon` / wake uniform) behind `boat.glb` in the epilogue.

### 5. UI/UX, HUD & Mobile Polish
- **Licensed Typography & Artisanal Letter Card (`ui.ts`, `captions.ts`, `index.html`):**
  - Remove `"A3G GT Walsheim"`, `"Graphik Web"`, and `"A3G Canela"`. Self-host **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` for quiet `"letters"` / `"bell"` HUD whispers, `font-synthesis: none`) and **DIN Pro** (`400/500`, `tnum`) for `0 / 3` progress numerals (optionally pairing a licensed literary serif from `/Users/gurbakshchahal/fonts/` strictly inside the opened `#wwui-letter` parchment body, with zero system fallbacks).
  - Style `#wwui-letter` as a tactile warm cotton-paper card with an inline SVG wax seal and subtle ink-wash border.
- **Mobile `390x844` Ergonomics (`ui.ts:70–130`):**
  - Enlarge `#wwui-pause-btn` (`ui.ts:78`, currently `36px` tall) and letter-close / interact buttons to `min-width: 44px; min-height: 44px` on `(pointer: coarse)` with full `env(safe-area-inset-*)` padding.

### 6. Executable Checklist & Verification Gates
- [ ] Enable `SHAFTS_ENABLED = true` (`effects.volumetricBeam`) + phase-modulated `effects.godRays`, `effects.contactShadows`, `effects.ambientOcclusion`, lake `effects.screenSpaceReflections`, AgX output, and `1.5` DPR cap in `world.ts` / `main.ts`.
- [ ] Delete `2.2m–3.1m` pink polka-dot `shrub` X-billboards and `scenery.ts` icosahedron blobs; replace with LOD-split GPU-instanced 3D grass + wildflowers (paired GLSL+WGSL wind/SSS shader) and KTX2-retextured `oak`, `pine`, `cottage`, `belltower`, and `hero` GLBs.
- [ ] Upgrade `SEA_FRAGMENT` + `seaFragmentWgsl` with terrain-height shoreline foam feathering and smooth Gerstner moonlit normals.
- [ ] Add the 16-segment catenary linen kite thread (`models.ts`/`world.ts`), bell-ring acoustic/petal `effects.flipbook` burst, and epilogue boat V-wake.
- [ ] Migrate `ui.ts` + `index.html` to `Whitney` + `DIN Pro` `.woff2` (`font-synthesis: none`) and raise `#wwui-pause-btn` to `>= 44px × 44px` on mobile.
- [ ] Run verification, re-capture all 5 `evidence/where-the-wind-wanders-port/screens/final/` frames (retiring stale white-stick screenshots!), and sync wrapper:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-where-the-wind-wanders-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-where-the-wind-wanders-port examples/where-the-wind-wanders-port
  pnpm vitest run tests/unit/where-the-wind-wanders-port/
  npx @aura3d/cli look lint apps/showcase-where-the-wind-wanders-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-where-the-wind-wanders-port
  ```

---

## WP-29 — Duneglide (`showcase-silt-and-signal-port` → `examples/silt-and-signal-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/silt-and-signal-port/reference-replay.test.ts` locks the **13-float simulation state vector across all 7 chapters / 4,620 steps within `1e-12`** against `tests/browser/data/silt-and-signal-reference-replay.json`). **Hard rule:** `examples/silt-and-signal-port/sim.ts`, `collide.ts`, `colliders-ch0.ts`, `terrain.ts` height math, and `autopilot.ts` physics inputs MUST remain 100% untouched; apply all upgrades in visual/material/rig/HUD modules and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-silt-and-signal-port/package.json` depends only on `"@aura3d/engine": "workspace:*"` (`0` Three.js dependencies or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-silt-and-signal-port/{package.json,index.html,route-health.json,src/main.ts}`
  - Implementation: `examples/silt-and-signal-port/{main.ts,world.ts,world-ch0.ts,architecture.ts,dressing.ts,decals.ts,water-graph.ts,portable-water.ts,shaders.ts,shaders-wgsl.ts,assets.ts,storm.ts,fx.ts,camera.ts,hud-look.ts,presentation.ts,audio.ts,index.html}` + `art/{look.ts,vfx.ts,direction.ts}`
  - Assets: 18 GLBs in `examples/silt-and-signal-port/assets/models/` + `/aura-assets/silt_and_signal_port_duneAdobeA.514e8fc2.glb` + 18 `.jpg` textures in `assets/textures/`
- **Genre Look Recipe:** Moebius / *Sable* & *Journey* Desert Ligne-Claire + Glittering Aeolian Silt (`looks.preset("golden-hour")` + 7-chapter color script + clean depth-only ink lines + canyon god rays).
- **Current Rendering & Screenshot Diagnosis (`evidence/silt-and-signal-port/screens/final/`):**
  - **Anachronistic Pine-Cone Christmas Trees in a Silt Desert (`title.1280x720.jpg`, `key-boost.390x844.jpg`):** `assets/models/tree.glb` (`world.ts:624`) populates the desert sanctuary and canyon with bright mint-green Kenney evergreen Christmas cones!
  - **Cobblestone Black Static & Jagged 10-Seg Arches:** `effects.toon({ inkSource: "both", outline: 0.85 })` (`art/look.ts`) runs Sobel normal-edge ink over `paving_NormalGL.jpg`, coating the plaza floor in noisy salt-and-pepper black static (`key-boost.1280x720.jpg`, `mid-fly.1280x720.jpg`), while `architecture.ts:145` extrudes 10-segment arches with jagged stair-stepped silhouettes.
  - **Missing WebGPU WGSL Twin (`world.ts:150`):** `ringSpec` (custom GLSL boost-ring shader) and `?water=glsl` (`world.ts:95`) lack WGSL twins (`shaders-wgsl.ts` currently holds only `decalWgsl`), triggering WebGPU shader-twin fallback/warnings! `PCSS` shadows are also gated off behind `?siltpcss=1` (`world.ts:463`).
  - **Standing-Idle Rider, Popsicle-Stick Thrusters & Mid-Crash Evidence Frames:** `courier.glb` (`world.ts:694`) plays a bolt-upright standing `"idle"` clip on the hoverboard, flanked by two rigid cyan `primitives.box` sticks (`thruster-l`, `thruster-r` in `world.ts:718`). Worse, both retained gameplay frames (`key-boost.1280x720.jpg` and `mid-fly.1280x720.jpg`) were captured **crashing nose-first into a blank beige wall** (`Impact: speed 60 to 50`)!
  - **80%-Screen Title Wall-of-Text & Fonts:** `#title-screen` (`index.html`) covers 80% of the canvas with a 9-row keyboard table + 7 chapter buttons, using `"Silt Graphik"` / `"Silt Canela"` (`weight: "500 900"` in `hud-look.ts:47`).
- **Current Sub-Scores (`/10`):** Lighting/Post `7.6` · Materials/Assets `6.3` · VFX/Animation `7.2` · UI/UX/Typography `7.1` · Perf/WebGPU `8.3` → **Overall `7.2 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **Clean Depth-Only Ligne-Claire Ink & Default Soft Shadows (`art/look.ts`, `world.ts:455–505`):**
  - Change `effects.toon` in `art/look.ts` from `inkSource: "both", outline: 0.85` to **`inkSource: "depth", outline: 0.50, fadeDistance: 180, inkColor: "#2b1d16"`**—preserving crisp Moebius architectural silhouettes while **100% eliminating** normal-map stipple static across cobbled plazas and dunes!
  - Enable `PCSS` / 2048px soft directional sun shadows by default on hardware GPUs (`world.ts:463`), paired with `effects.contactShadows({ length: 0.35, thickness: 0.07, steps: 16, intensity: 0.70, lights: "sun" })` and `effects.ambientOcclusion({ intensity: 0.44, radius: 0.85, multiBounce: true })`.
- **7-Chapter God Rays, Basin Volumetric Fog & Oasis SSR (`art/look.ts`, `world.ts`):**
  - Expand `effects.godRays({ source: "sun", intensity: 0.40, decay: 0.95, samples: 48, medium: 0.16 })` beyond `ch2` across low-sun chapters (`ch0` Sanctuary dawn, `ch2` Canyon, `ch3` Silt Basin, `ch6` Spire), add `effects.volumetricFog({ density: 0.14, heightFalloff: 0.05, heightReference: 2, godRayDensity: 0.28 })` pooling in canyon floors, enable `effects.screenSpaceReflections({ intensity: 0.48, maxDistance: 24, roughness: 0.18, thickness: 0.25 })` for the `ch0` oasis canal (`waterGraphMaterial` / `portableWaterMaterial`) and `ch4` storm-wet flagstones, and finish with `effects.cinematicBloom({ threshold: 0.86, intensity: 0.28 })` + `output: { toneMapping: "agx", exposure: 1.0, dither: true }`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Desert Flora Swap, KTX2 Texture Pack & Stratified Cliffs (`assets.ts`, `architecture.ts`, `dressing.ts`, `world.ts`):**
  - Replace `assets/models/tree.glb` (`assets.ts` / `world.ts:624` mint-green pine cones) with admitted desert date-palm and wind-sculpted tamarisk/acacia GLBs (`aura3d-assets` + `aura3d-retexture` in warm ochre/sage Moebius tones, keeping the exact `instances.model` node slot so sim colliders stay untouched), and convert all 18 `assets/textures/*.jpg` files to KTX2 (`aura3d assets`).
  - Assign `material.strata({ bands: 9, colors: ["#d9a066", "#c47d4e", "#e6be8a", "#9e5c3b"], seam: 0.35, variation: 0.4, roughness: 0.82 })` to `cliffs` (`world.ts:581`) and canyon `boulders`/`rock` for authentic sedimentary sandstone banding.
  - Increase arch ring radial segments in `architecture.ts:145` (`10` → `28`) with bevelled stone voussoir trim + `duneAdobeA` weathered stucco cornices, and enrich chapters 1–6 (`dressing.ts`) via `scatterInArea` + `splitScatterByDistance` sandstone hoodoos, half-buried relay obelisks, and `material.fabric` fluttering `banner.glb` pennants.
- **Complete WGSL Shader Twins & Glittering Aeolian Silt (`shaders.ts`, `shaders-wgsl.ts`, `world.ts:95, 150, 529`):**
  - Author `ringFragmentWgsl` + `ringVertexWgsl` in `shaders-wgsl.ts` for `ringSpec` (`world.ts:150`) and complete the WGSL twin for `world.ts:95` so zero `CUSTOM_SHADER_WGSL_MISSING` warnings occur on WebGPU.
  - Upgrade the `terrain` dune material (`world.ts:529`) with a **paired GLSL 3.00 + WGSL wind-rippled mica silt shader**: procedural aeolian sand-ripple micro-normals perpendicular to wind direction, *Journey*-style glancing-angle specular mica sparkle (`a3d_noise` + `WGSL_NOISE`), and height-feathered oasis stone transitions.

### 4. Animation, Camera Choreography & Game Juice
- **Athletic Hoverboard Carve Stance (`world.ts:694–755`):**
  - Layer additive `setAnimationPose` bone rotations onto `courier.glb` (`Spine`, `Chest`, `Hips`, `LeftUpLeg`, `RightUpLeg`, `LeftArm`, `RightArm`) so the courier rides sideways in an athletic knees-bent surf crouch that banks, compresses on landings, and tucks forward during `boost`—retiring the bolt-upright standing `"idle"` pose!
- **Jade Slipstream Ribbons & Low-Altitude Silt Rooster-Tail (`world.ts:718`, `art/vfx.ts`, `fx.ts`, `camera.ts`):**
  - Replace the two rigid cyan `primitives.box` sticks (`thruster-l/r`, `world.ts:718`) with sculpted `material.lacquer` + emissive signal-jade thruster vents trailing dual `effects.auroraRibbon` / `effects.trail` wingtip ribbons.
  - Scale a golden silt rooster-tail plume (`effects.particles` + `4×4` KTX2 sand-billow `effects.flipbook` in `art/vfx.ts`) inversely with `altitudeAboveGround` (`< 3.5m`), paired with `createCameraClearance` so courtyard walls never fill the frame.

### 5. UI/UX, HUD & Mobile Polish
- **Licensed Typography, Compact Plaque & Horizon Beacon Compass (`index.html`, `hud-look.ts`):**
  - Remove `"Silt Graphik"`, `"Graphik Web"`, and `"Silt Canela"` (`weight: "500 900"` in `hud-look.ts:47`). Self-host **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` labels, `font-synthesis: none`), **DIN Pro** (`500`, `tnum`) for speed (`km/h`), altitude (`m`), boost `%`, and beacon range, and **Monument Grotesk Mono** (`400`) for chapter/signal frequencies.
  - Replace the 80%-screen `#title-screen` wall-of-text with a sleek translucent glass flight plaque (`Start Flight`, compact 7-chapter pill selector, collapsible `? Controls` drawer), auto-hide desktop `#keys` hints after `4s`, and add a minimalist **top-center horizon compass tape** ticking toward `sim.beaconPos` for instant 1-second navigation clarity.
  - Maintain `>= 48px × 48px` coarse-pointer touch pads (`BOOST`, `BRAKE`, `CAM`) with safe-area insets on `390x844`.

### 6. Executable Checklist & Verification Gates
- [ ] Switch `effects.toon` to `inkSource: "depth"` (`art/look.ts`), enable hardware soft shadows + `effects.contactShadows` + `effects.ambientOcclusion` + multi-chapter `effects.godRays` + oasis `effects.screenSpaceReflections` + AgX output.
- [ ] Replace `assets/models/tree.glb` mint-green Christmas cones with desert palm/tamarisk GLBs, convert all 18 `assets/textures/*.jpg` to KTX2, apply `material.strata` to canyon cliffs, and raise `architecture.ts:145` arch segments from `10` to `28`.
- [ ] Add the missing WGSL shader twins (`ringSpec` in `world.ts:150` & `?water=glsl`) and author the paired GLSL+WGSL wind-rippled glittering mica silt shader on `terrain`.
- [ ] Pose `courier.glb` into a dynamic knees-bent hoverboard carve stance (`setAnimationPose`), replace rigid `thruster-l/r` boxes with `effects.auroraRibbon` jade wakes + low-altitude silt plumes, and wire `createCameraClearance`.
- [ ] Migrate `index.html` + `hud-look.ts` to `Whitney` + `DIN Pro` + `Monument Grotesk Mono` `.woff2`, compact `#title-screen`, and add the top-center beacon compass tape.
- [ ] Run verification, re-capture soaring open-canyon `key-boost` & `mid-fly` screenshots (retiring the mid-wall-crash frames!), and sync wrapper:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-silt-and-signal-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-silt-and-signal-port examples/silt-and-signal-port
  pnpm vitest run tests/unit/silt-and-signal-port/
  npx @aura3d/cli look lint apps/showcase-silt-and-signal-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-silt-and-signal-port
  ```

---

## WP-30 — Cumulus Dash (`showcase-cloud-runner-port` → `examples/kid-goku-beyond-the-clouds-port`)

### 1. Paths & Mode
- **Mode & Replay Contract:** `replay-verified` port (`tests/unit/kid-goku-beyond-the-clouds-port/reference-replay.test.ts` locks **762 snapshots across 3,810 fixed steps at `0` max diff (`< 1e-9`)** against `tests/browser/data/kid-goku-beyond-the-clouds-reference-replay.json`; `wgsl-twins.test.ts` gates shader parity). **Hard rule:** `examples/kid-goku-beyond-the-clouds-port/sim.ts`, `course.ts`, `encounters.ts` state transitions, and obstacle colliders MUST remain 100% untouched; apply all upgrades in visual/world/props/shader/UI files and sync via `node tools/showcase-port-pages/sync.mjs`.
- **Zero-Three.js Package & Source Audit:** `apps/showcase-cloud-runner-port/package.json` depends only on `"@aura3d/engine": "workspace:*"` (`0` Three.js packages or imports).
- **Exact Files:**
  - Wrapper: `apps/showcase-cloud-runner-port/{package.json,index.html,route-health.json,aura.assets.json,src/aura-assets.ts,src/lab.ts,src/main.ts}`
  - Implementation: `examples/kid-goku-beyond-the-clouds-port/{main.ts,world.ts,terrain.ts,props.ts,waymarks.ts,puddles.ts,waterfall.ts,groundShadows.ts,creatures.ts,materials.ts,shaders.ts,shaders-wgsl.ts,mesh.ts,sprites.ts,models.ts,gait.ts,fx.ts,presentation.ts,ui.ts,audio.ts,index.html}` + `art/{look.ts,post.ts,vfx.ts,camera.ts,direction.ts}`
  - Assets: `examples/kid-goku-beyond-the-clouds-port/assets/meshy/{boulder,cloud,hero,mesa,ptero,rex,treePine,treeRound}.glb`, `assets/textures/{grass-color,path-color,path-normal,rock-color}.jpg`, + `/aura-assets/cumulus-{tower-a,tower-b,hut}.glb`
- **Genre Look Recipe:** Sunlit Ghibli / *Dragon Ball* High-Altitude Cumulus Adventure Diorama (`looks.preset("outdoor-day")` + 4-chapter sky script + storm-anvil sun shafts + subsurface-lit 3D cloud sea).
- **Current Rendering & Screenshot Diagnosis (`evidence/kid-goku-beyond-the-clouds-port/screens/final/`):**
  - **Giant Plastic Hot-Dog Log (`card.2x.1440x900.jpg`, `title.640x360.jpg`):** Forefront `ride-log` (`buildLog()` in `world.ts:105` & `props.ts:120`) is a smooth 14-sided untextured brown cylinder with flat beige circular end-caps that looks like a giant plastic hot-dog.
  - **Mid-Air Floating Boulders, Blown-Out Road Glare & Toy Verge Primitives (`dsf2-key.640x360@2x.jpg`, `mid-track.640x360.jpg`):** Left-bank `MESHY.boulder` props (`world.ts:261`) visibly hover in mid-air above the slope with gap shadows underneath; `ground.road` exhibits harsh pure-white specular/bloom blowout with razor-sharp straight edges against flat green grass; `scatter.bushes` are smooth green gumdrop hemispheres, `scatter.flowers` are single-triangle confetti pyramids, `scatter.trees` are green spheres on brown sticks, and `valley` (`world.ts:231`) is a flat ocean-like blue-white quad!
  - **CRITICAL `390x844` MOBILE HUD OVERLAP (`key-run.390x844.jpg`):** The circular `.touch` **`cloud` button** (`bottom: 40px; right: 172px; width: 52px` in `ui.ts:188`) **sits directly on top of and obscures the `.gauge` `"SKY CLOUD"` bar** (`bottom: 16px; left: 50%; width: 170px` in `ui.ts:122`)!
  - **Typography & Standalone WebGPU Gap:** `ui.ts` loads `roobert-400/700.woff2` (`font-weight: 700/800`), `-webkit-text-stroke: 2px` comic italic numerals, and `Arial`/`system-ui` fallbacks; `cumulusTowerA.glb` spends `51,404` tris on a distant silhouette prop; and `examples/kid-goku-beyond-the-clouds-port/main.ts:328` falls back to WebGL2 when launched standalone outside `apps/showcase-cloud-runner-port/src/lab.ts`.
- **Current Sub-Scores (`/10`):** Lighting/Post `7.4` · Materials/Assets `6.2` · VFX/Animation `7.8` · UI/UX/Typography `6.5` · Perf/WebGPU `8.1` → **Overall `7.1 / 10`**.

### 2. Blender-Grade Visual & Lighting Recipe (100% Native Aura3D 5.5.1)
- **AgX Highlight Rolloff, Anvil God Rays & Storm Puddle SSR (`art/look.ts`, `art/post.ts`, `world.ts`, `main.ts:328`):**
  - Wire `readLabFlags` directly inside `examples/kid-goku-beyond-the-clouds-port/main.ts:328` whenever `window.__AURA_LAB_APP_OPTIONS__` is unset so both standalone and showcase routes default to `renderer: { backend: "auto" }` (WebGPU), `depth: { mode: "reversed" }`, `?worker=1`, and `output: { toneMapping: "agx", exposure: 1.0, dither: true }`—immediately curing the harsh white specular blowout on `ground.road`.
  - Raise crepuscular shaft strength in `art/look.ts` / `art/post.ts`: `effects.godRays({ source: "sun", intensity: 0.40, decay: 0.95, samples: 48, medium: 0.16 })` + `effects.volumetricFog({ density: 0.11, heightFalloff: 0.04, heightReference: -22, godRayDensity: 0.34 })` so sunlit shafts pierce dramatically between `cumulusTowerA/B` storm anvils in Chapters 2–4.
  - Pair `effects.contactShadows({ length: 0.3, thickness: 0.06, steps: 16, intensity: 0.68, lights: "sun" })` with `effects.ambientOcclusion({ intensity: 0.44, radius: 0.68, multiBounce: true })`, `effects.screenSpaceReflections({ intensity: 0.50, maxDistance: 20, roughness: 0.18, thickness: 0.25 })` across rain-slicked `puddles.ts` and `waterfall.ts` pools, and `effects.cinematicBloom({ threshold: 0.88, intensity: 0.28 })`.

### 3. Geometry, Materials, Retexturing & Custom Shaders
- **Sculpted Gnarled Cedar Trunk & Grounded Slope Boulders (`world.ts:105, 261`, `props.ts:120`):**
  - Replace `buildLog()` (`world.ts:105` & `props.ts:120` 14-sided smooth brown cylinder) with an admitted, KTX2-compressed **gnarled mossy cedar trunk GLB** (`model(assets.cedarTrunk)` via `@aura3d/cli` + `aura3d-retexture`) featuring deeply fluted bark normal maps, end-grain growth rings, broken branch knots, and `material.matteClay` / high-roughness bark shading.
  - Fix mid-air floating boulders in `world.ts:261`: project every `MESHY.boulder` placement onto exact `terrainHeightAt(x, z) - 0.20 * scale` tilted partially into the embankment normal so zero rocks hover above the grass.
- **Feathered Trail Curbs, Painterly Foliage & 3D SSS Cumulus Sea (`terrain.ts`, `materials.ts`, `world.ts`, `shaders.ts`, `shaders-wgsl.ts`):**
  - Convert `assets/textures/*.jpg` to KTX2, author a proper `path-roughness.ktx2` (`roughness: 0.78..0.92`) on `ground.road`, and blend vertex-feathered grass/pebble verges + instanced mossy kerb stones along the trail border so the razor-sharp polygon cut disappears.
  - Delete lollipop `scatter.trees`, gumdrop `scatter.bushes`, and triangle `scatter.flowers` (`world.ts` / `props.ts`), replacing them with GPU-instanced KTX2-retextured `MESHY.treePine` & `MESHY.treeRound` canopies plus 3D wind-swaying meadow tufts & wildflower clusters (`instances.custom` + `scatterAlongPath` + `splitScatterByDistance`).
  - Replace the flat `valley` quad (`world.ts:231`) with multi-altitude GPU-instanced 3D cumulus cloud banks (`y = -38..-6`) shaded by a **paired GLSL 3.00 + WGSL subsurface-scattering cumulus shader** (warm golden forward scattering, powder self-shadowing, cerulean ambient troughs, gentle vertex billow), apply the same shader to `MESHY.cloud` (`sky-cloud` nimbus), and decimate `cumulusTowerA.glb` (`51,404` → `~8,000` tris via meshopt + KTX2) so distant silhouettes cost <16k tris total.

### 4. Animation, Camera Choreography & Game Juice
- **Preserve Replay-Safe IK Sprint + Upgrade Cloud & Duel VFX (`presentation.ts`, `gait.ts`, `art/vfx.ts`, `fx.ts`):**
  - Keep `createGoPresenter` (`createFixedStepPresenter`) and `plantedGaitPose` (`setAnimationPose` foot-planted gait + `createLocomotion`) untouched so all 762 replay snapshots stay at `0` diff.
  - Trail a swirling golden `effects.auroraRibbon` + warm puff particles (`art/vfx.ts`) from `sky-cloud` during cloud flight, spawn bark/leaf bursts on log vaults, and fire `4×4` KTX2 anime impact-star / shockwave `effects.flipbook` bursts + `createHitStop` camera presentation punch during `encounters.ts` clashes and dragon-orb pickups.

### 5. UI/UX, HUD & Mobile Polish
- **CRITICAL `390x844` Mobile HUD De-Collision (`ui.ts:120–198`):**
  - Immediately eliminate `.touch` `cloud` button (`bottom: 40px; right: 172px`) overlapping `.gauge` (`SKY CLOUD`, `bottom: 16px; left: 50%`)! On `@media (max-width: 640px), (pointer: coarse)`, dock `.gauge` cleanly into the top-center HUD cluster beneath the chapter pill (and mirror live charge as a crisp SVG radial golden progress ring around the `52px × 52px` `CLOUD` touch button in the bottom-right action arc), guaranteeing `>= 12px` clearance across all HUD and touch nodes (`JUMP`, `SLIDE`, `STRIKE`, `CLOUD` all `>= 48px × 48px` with safe-area insets).
- **AuraOne Typography Migration (`ui.ts`, `index.html`):**
  - Remove `roobert-400/700.woff2`, `font-weight: 700/800`, `-webkit-text-stroke: 2px` comic italic numerals, and `Arial` / `system-ui` fallbacks. Self-host **Whitney** (`400/500/600`, `tnum`, lowercase `smcp` for `sky cloud` / `chapter` / `orbs` labels, `font-synthesis: none`) and **DIN Pro** (`500`, `tnum`) for score, orb count, streak multiplier, and course `%` inside dark-frosted high-contrast telemetry pills (`backdrop-filter: blur(10px)`).

### 6. Executable Checklist & Verification Gates
- [ ] Wire `readLabFlags` fallback directly in `examples/kid-goku-beyond-the-clouds-port/main.ts:328`, switch output to AgX (`toneMapping: "agx"`), raise `effects.godRays` + `effects.volumetricFog` (`godRayDensity: 0.34`), and add `effects.ambientOcclusion` + puddle `effects.screenSpaceReflections`.
- [ ] Replace 14-sided smooth `buildLog()` cylinders (`world.ts:105`, `props.ts:120`) with a KTX2 gnarled cedar trunk GLB, ground all floating `MESHY.boulder` slope placements (`world.ts:261`), add `path-roughness.ktx2` + feathered trail curbs, and replace gumdrop/triangle/lollipop verge primitives with instanced KTX2 foliage.
- [ ] Replace flat `valley` (`world.ts:231`) with GPU-instanced 3D SSS cumulus banks (paired GLSL+WGSL) and decimate `cumulusTowerA.glb` (`51,404` → `~8,000` tris + KTX2).
- [ ] Add golden `effects.auroraRibbon` nimbus trail + anime shockwave `effects.flipbook` encounter bursts while keeping `sim.ts` / `course.ts` untouched.
- [ ] Fix the `390x844` mobile `.touch` `cloud` button vs `SKY CLOUD` `.gauge` collision (`ui.ts:120–198`) and migrate `ui.ts` + `index.html` from `Roobert`/`Arial`/`system-ui` to `Whitney` + `DIN Pro` `.woff2`.
- [ ] Run verification & wrapper sync gates:
  ```bash
  ! rg -n '"three"|"@types/three"|"@react-three|postprocessing|troika-three-text' apps/showcase-cloud-runner-port/package.json
  ! rg -n "from ['\"]three|window\.THREE|import-three" apps/showcase-cloud-runner-port examples/kid-goku-beyond-the-clouds-port
  pnpm vitest run tests/unit/kid-goku-beyond-the-clouds-port/
  npx @aura3d/cli look lint apps/showcase-cloud-runner-port --json
  node tools/showcase-port-pages/sync.mjs && node tools/agent-examples/refresh-catalog-digests.mjs && node tools/site/seo-meta-pass.mjs --check
  node tools/game-checks/run.mjs showcase-cloud-runner-port
  ```
