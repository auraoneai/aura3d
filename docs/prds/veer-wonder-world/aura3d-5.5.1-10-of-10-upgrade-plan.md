# Wonder World (`@aura3d/wonder-world`) — Aura3D 5.5.1 10/10 Visual, Rendering & Co-Play UI/UX Upgrade Blueprint

**Status:** Ready for Autonomous Swarm Implementation · **Target Engine:** `@aura3d/engine` `5.5.1` (upgrading from `4.6.2` baseline) · **App Path:** `apps/veer-wonder-world/` · **Production Host:** Cloudflare Pages (`aura3d-wonder-world`)
**Execution Policy:** Authorized for immediate autonomous product code implementation (`CODE_COMPLETE_GO`).

> **Mandatory Execution & Anti-Loop Contract (Binding on Executing Agents & Subagents):**
> 1. **Read-Only Blueprint During Code Execution:** Executing agents and subagents MUST treat this PRD as a **read-only engineering blueprint** during implementation. Do NOT repeatedly edit or commit this `.md` file to tick checkboxes, rewrite status tables, or append run logs after each work package.
> 2. **Frozen Denominator:** The work-package count (`WP-1` through `WP-10`) and verification checklist below are frozen at start. Executing agents MUST NEVER invoke external LLM/ChatGPT/Prism critic reviews mid-execution or add new checkboxes, work packages, or research gates.
> 3. **Zero Human Sign-Off Gates:** All architectural, visual, child-safety, privacy, and performance gates are enforced deterministically via automated code, typechecks, content lint, unit tests, and remote GPU look-dev captures.

---

## 1. Executive Summary & Autonomous Architectural Decisions

### 1.1 Objective
Upgrade **Wonder World** (`apps/veer-wonder-world/`, `@aura3d/wonder-world`) from its prototype Aura3D `4.6.2` baseline (self-scored at `6.0–6.5/10` in `evidence/veer-wonder-world/p1/look-dev.md`, running WebGL2-only with stripped `512px` diffuse-only prop maps, rigid un-articulated statues, flat `70m` untextured planes, disabled runtime VFX, and static non-branching tap responses) to an unmistakable **10/10 real-time Blender Cycles / Pixar-storybook 3D experience** powered by **`@aura3d/engine` 5.5.1**. Every one of the **6 worlds**, **6 characters**, **12 interactive tap games (`g01`–`g12`)**, **20 animated story episodes (`e01`–`e20`)**, and **co-play UI/UX screens** is upgraded to tactile clay-and-felt PBR craft, WebGPU-first rendering with AgX tone mapping, articulated multi-part character animation with deterministic syllable-envelope speech cues, per-target interactive choice choreography, and licensed dense/storybook typography—while preserving 100% of Wonder World's toddler safety, privacy, and fixed-step determinism invariants.

### 1.2 Autonomous Architectural Decisions (Resolved from Repo Conventions)
1. **WebGPU-First with Clean WebGL2 Fallback (`backend: "auto"`):** Adopt the exact 5.5.1 showcase standard (`renderer: { backend: "auto", allowFallback: true, qualityProfile: "production", msaa: "auto" }`, `pixelRatio: { max: 2 }`, `?backend=webgl2` URL opt-out) paired with **AgX output** (`output: { toneMapping: "agx", exposure: 1.0, dither: true }`) and **Reversed-Z depth** (`depth: { mode: "reversed", allowFallback: true }`). Removing the legacy `-1.0 EV` exposure clamp restores highlight roll-off and rich storybook color saturation without blowing out pastel skies.
2. **100% WebGPU-Native Material & Shader Discipline (Zero `webgpuCustomShaderGap` Regressions):** Never use GLSL-only helpers (`material.toon`, `material.strata`, `material.caustics`, `material.lightBeam`, `effects.volumetricBeam`), which trigger `CUSTOM_SHADER_WGSL_MISSING` or `WGSL_PROGRAM_MISSING` on WebGPU. Use 5.5.1 WebGPU-native PBR craft presets (`material.felt`, `material.matteClay`, `material.ceramic`, `material.lacquer`, `material.clearcoatPaint`, `material.rubber`, `material.wood`, `material.clearGlass`, `material.frostedGlass`) with stylized `rim: { color, power, intensity }`, `material.proceduralTextures.{fabric, rubber, brushedMetal, plastic}`, and dual GLSL+WGSL `material.custom` only where bespoke shaders (ground target ripple decal) are needed.
3. **Single-Draw Instancing Rule (`diorama.ts` ForwardPass Constraint):** Keep PBR extension lobes (`sheen`, `clearcoat`, `iridescence`, `transmission`, `ior`) exclusively on hero actors, interactive props, and merged static meshes. On all `instances.*` / `instances.model` pools (grass tufts, flower beds, fence posts, sleepers, pebbles, clouds), approximate soft clay/felt using base PBR (`diffuseRoughness: 0.88, retroreflection: 0.28, envMapIntensity: 0.72`) + GPU vertex `wind` so every instance pool submits in **1 GPU draw call** (`< 180` total scene draws).
4. **Articulated Hierarchical Assemblies Over Broken Humanoid Auto-Rigging:** Meshy humanoid auto-rigging tore 1,465 triangles up to `142.9x` on round plush characters (`02-character-and-content-bible.md`). Instead of shipping rigid A-pose statues, split and assemble the 6 characters and hinged props (`door`, `barn`, `lift`, `toyBox`, `storyBox`, `picnicBasket`, `gogoCarriage`, `car`) into clean multi-part pivot sub-nodes (`body`, `head`, `armL`, `armR`, `footL`, `footR`, `tail`/`wings`/`wheels`, `eyelidL/R`, `jawOrCheek`) driven deterministically by `AnimationDirector` + `@aura3d/engine/game` (`proceduralLegSwing`, `createHandBounce`, `yawToFace`, `createSmoothFollow3`), while keeping `createAnimationController` + `sampleAuraVoiceBridgeAtTime` wired for any verified skinned clip/morph asset.
5. **Deterministic 20 Hz Precomputed Audio Envelopes (Zero Runtime Mic/Analyser Nondeterminism):** Extract quantized `50 ms`-step RMS syllable envelopes into `src/audio-manifest.ts` during `tools/gen-audio-manifest.mjs` so speaking characters drive articulated jaw/beak/cheek/nod motion in exact frame lockstep with recorded voice lines—working identically in live play, muted caption fallback, and `?manual=1` QA stepping without ever claiming clinical phoneme lip-sync.
6. **Full PBR Map Restoration & Region-Aware Atlas Recoloring:** Remove the destructive map-stripping block in `tools/admit-models.mjs` (lines 102–108) that deleted `normal`, `metallicRoughness`, and `occlusion` textures on all 48 non-cast models, and replace whole-mesh multiplicative `baseColorFactor` tints (which tinted eye whites and windows) with UV-island region recoloring + KTX2/Basis compression served via `@aura3d/assets/vite` (`aura3d({ physics: "auto", decoders: { codecs: ["basis", "draco", "meshopt"] } })`, simultaneously stripping the unused `2.85 MB` Rapier WASM chunk).
7. **Target-Parameterized Choice Responses & 3-Round Progression Without Breaking Determinism:** Extend `BeatSpec` with optional `responseByTarget?: Partial<Record<string, BeatResponse>>` and `ActivitySpec` with `roundVariants?: readonly RoundVariantSpec[]` so 2-choice taps (`apple` vs `banana`, `red-ball` vs `blue-ball`, `bubble2` vs `bubble3`, `drum` vs `shaker`) animate and name the **exact tapped object** using existing provenanced `AUDIO_MANIFEST` clips, while silence/timeout and caregiver confirm remain 100% valid, non-failing completions.
8. **Licensed Typography & Dual-Density Co-Play UI (`ui-typography-density.md`):** Self-host licensed `.woff2` files from repo `/public/fonts/` (**Whitney** `--font-ui` with `smcp` + `tnum` for dense `34px`-row / `32px`-control caregiver sheets; **DIN Pro** `--font-metric` for episode/round counters; **Monument Grotesk Mono** `--font-code` for diagnostics IDs; **Graphik Web** `--font-display` for warm storybook titles and karaoke word-highlighted captions; weights `400/500/600` only, `font-synthesis: none`, zero `700`), updating `vite.config.ts` and `tests/unit/ui/strings.test.ts` in lockstep.
9. **Domain & Child-Name Redaction Guard Preservation:** Keep `WELCOME_NAME` confined strictly to `src/personal.ts` and never write `*.auraone.ai` or `*.vercel.app` hostnames inside `apps/veer-wonder-world/{DEPLOYMENT.md,README.md,tools/deploy-preview.sh}` or `tests/browser/wonder-world-live.spec.ts` (`deploy-config.test.ts` L153–155).

---

## 2. Current Codebase State & Bottleneck Audit (`4.6.2` Prototype Baseline)

### 2.1 System Architecture Today
- **Bootstrap & Shell:** `apps/veer-wonder-world/src/main.ts` installs `@aura3d/debug` safety net and boots `src/app.ts`, which owns the `50 ms` `createFixedStepLoop` story clock, `src/runtime/episode-director.ts`, `src/runtime/narration-player.ts`, `src/runtime/audio-mixer.ts` (single `AudioContextManager`, 4 buses with speech ducking, 907 ElevenLabs starter-tier MP3s in `src/audio-manifest.ts`), `src/runtime/touch-router.ts` (`pointerdown` + `[0, 18, 36] px` generous pick rings), `src/scenes/stage.ts` (`createGame` from `@aura3d/engine/game`), and `src/ui/*`.
- **Dependencies & Build:** `apps/veer-wonder-world/package.json` uses `workspace:*` for monorepo Vite builds (`vite.config.ts` aliases `@aura3d/*` to `packages/*/src`), while `tools/published-deps.json` and `tools/deploy-build.sh` still pin **`@aura3d/{engine,debug,audio,cli}: "4.6.2"`**.

### 2.2 Ten Measured Root Causes Preventing a 10/10 Look & Feel
1. **Legacy 4.6.2 Pin, WebGL2-Only Default & `-1.0 EV` Under-Exposure (`src/scenes/stage.ts:1063`, `src/scenes/looks.ts:37`):** `stage.ts` omits `renderer.backend = "auto"`, `output.toneMapping = "agx"`, and reversed depth. Five of six worlds share the identical `outdoor-day` (`autumn_field_puresky_1k.hdr`) look pulled down `-1.0 EV`, compressing highlights into muddy midtones (`look-dev.md` Learning Cloud saturation `s = 0.02 -> 0.11`).
2. **Runtime VFX Globally Disabled (`src/scenes/stage.ts:1176, 2028`):** `app.effects.runtime = "off"` kills all particle, flipbook, and atmospheric life (zero floating meadow pollen, zero soap-bubble pop droplets, zero steam puffs on GoGo's chimney, zero splash droplets in Car Wash).
3. **All 6 Characters Are Un-Articulated Static Meshes (`rigged: false` in `src/aura-assets.ts`):** Momo and Lulu stand frozen in stiff Meshy A-poses; `wave` rocks the rigid statue on Z; `clap` squashes Lulu vertically without hands moving; `wag` oscillates Sheru's entire body on Y instead of wagging his tail; `flap` stretches Peeko's torso `22%` wider along X; GoGo's wheels are fused into the hull and never spin; `blink` squashes the entire character vertically (`character-registry.ts:119`).
4. **48 of 54 GLBs Stripped of Normal, Roughness & AO Maps (`tools/admit-models.mjs:102–108`):** All animals, furniture, vehicles, and props had their PBR maps deleted and flattened to `512px` diffuse-only `roughness: 0.85`.
5. **19 Whole-Mesh Multiplicative Tints & `replaceTextures: true` (`tools/model-review.json`, `stage.ts:837`):** Multiplying pale Meshy textures by RGB hexes tinted character sclera/eye-whites and train/car windows; runtime `tintMode: "replace"` wipes textures completely on doors, cars, blocks, plates, and cushions.
6. **11 Prominent `PROCEDURAL_MODELS` + `"bubble"` Render as Programmer-Art Primitives (`src/scenes/stand-ins.ts`):** `bush` (3 spheres in 5 worlds), `cloud` (4 spheres in 5 worlds), `ball`, `balloon`, `stompStone`, `sun`, `partyHat`, `toothbrush`, and `"bubble"` (plain translucent sphere) read as geometric placeholders next to textured models, and `barn` generated green instead of red (`peekaboo-barn.ts:1`).
7. **Infinite `70m` Untextured Ground Planes & Box-Slab Rooms (`worlds.ts:164`, `home-nook.ts`, `learning-cloud.ts`):** Flat single-quad floors meet CSS clear colors at a razor horizon; Home Nook is 3 un-bevelled `0.2m` box walls with an emissive cylinder lamp that casts **zero actual point/spot light**; Learning Cloud contains zero GLBs (3 intersecting torus tubes in front of a `90x40m` box wall); portrait phones (`390x844`) scored `6.5` composition and `6.0` shadows due to excessive empty floor below the cast and faint mobile contact shadows.
8. **Hinged Props Don't Open (`src/scenes/motion.ts:804–809`):** `open` and `close` actions on `door`, `barn`, `lift`, `toyBox`, `storyBox`, and `picnicBasket` execute an `8 cm` vertical `lidHop` instead of swinging doors or lids open; E01's mirror places a `0.25x` Z-squashed duplicate of Momo *in front of* an opaque disc.
9. **Single Static `BeatSpec.response` & Dead/Inverted Game Beats (`src/content/activities/*`):** Tapping `apple` vs `banana` (`g05`), `bubble2` vs `bubble3` (`g01`), or `red-ball` vs `blue-ball` (`e07`) runs the exact same generic response; `g08` spawns blocks *before* the child taps; `g09` only ever visits with Lulu; `g12` locks out taps on Sheru during a `12,000 ms` `holdMs` before `"waiting"` begins.
10. **Flat 2D Start/Menu Chrome & Un-Synced Captions (`src/ui/*`):** Start screen covers the stage with flat CSS circles instead of showcasing the live 3D island; menu lacks world filtering and rendered world cards; captions display static lines without karaoke target-word emphasis; target highlights use raw unshaded 3D torus/sphere meshes (`__ring`, `__halo`).

---

## 3. Section 1 — Aura3D `4.6.2` -> `5.5.1` Engine Upgrade & Rendering Pipeline

### 3.1 Renderer, Output, Depth & Decoder Pipeline (`stage.ts` & `vite.config.ts`)
Upgrade `createGame` in `apps/veer-wonder-world/src/scenes/stage.ts` and Vite bundling in `apps/veer-wonder-world/vite.config.ts` to the full Aura3D 5.5.1 production stack:

```ts
// apps/veer-wonder-world/vite.config.ts (plugin integration)
import { aura3d } from "@aura3d/assets/vite";
import { decoderBasePath } from "virtual:aura3d-decoder-deployment"; // consumed in stage.ts

// Inside plugins[]:
aura3d({
  physics: "auto", // Wonder World uses 0 physics bodies -> strips 2.85 MB Rapier WASM chunk at build time!
  decoders: { codecs: ["basis", "draco", "meshopt"] } // emits same-origin /aura-decoders/ + ktx2.worker.js
})
```

```ts
// apps/veer-wonder-world/src/scenes/stage.ts (5.5.1 createGame configuration)
const lookOpts = lookAppOptions(initialWorld);
const requestedBackend = options.flags.backend; // "auto" default; "webgl2" when ?backend=webgl2
const gameOptions = {
  id: "wonder-world",
  target: options.target,
  scene: () => initialScene,
  autoStart: true,
  assets: { decoderBasePath },
  pixelRatio: { max: 2 },
  renderer: {
    ...lookOpts.renderer,
    backend: requestedBackend,
    allowFallback: true,
    qualityProfile: "production",
    msaa: "auto",
    morph: { normals: true }
  },
  output: {
    toneMapping: "agx",
    exposure: 1.0,
    dither: true
  },
  qualityRebuild: { flags: ["game", "vfx.fog", "vfx.sky", "world"] },
  ...(options.sound !== undefined ? { sound: options.sound } : {})
};
```

### 3.2 Six-Stage Storybook Cycles Lighting & Post-Processing Architecture
Every world in `src/scenes/looks.ts` transitions from uniform `-1.0 EV` `outdoor-day` to a dedicated **three-point storybook lighting rig + bespoke CC0 HDRI + subtle miniature post chain**:
1. **Per-World Radiance 1K IBL (`AuraHdriId`):** Each world binds a distinct, hash-verified CC0 HDRI from `/public/hdri/<id>_1k.hdr` via `looks.preset(id, { hdri, environmentIntensity, environmentRotationDeg, background: "look" })` so metals, clearcoat toys, ceramic plates, and eyes catch lively specular highlights without washing out diffuse clay.
2. **Three-Point Storybook Rig (Key + Rim + Hemisphere Fill):**
   - **Key Sun (`looks` override `key`):** Warm directional sunlight with `shadow: { mapSize: 2048, cascades: 2, maxDistance: 28, filter: "pcss", softness: 0.65, bias: 0.0015, normalBias: 0.02 }` casting crisp-near / soft-far grounded shadows across the stage plinth.
   - **Plush Rim Backlight (`looks` override `rim`):** Dedicated warm-cream or sky-tinted rim (`intensity: 1.35–1.85`, angled `135°–155°` behind cast) so rounded silhouettes (Momo's purple fuzz, Lulu's mint crest, Peeko's yellow down) separate effortlessly from pastel hills on `320px–390px` screens.
   - **Soft Bounce Fill (`lights.hemisphere`):** Ground-tinted bounce (`intensity: 0.28–0.38`) lifting underside creases so shadows are cosy pastel-cool, never harsh black.
3. **Dual Grounding Shadows (Fixing the `6.0/10` Mobile Shadow Gap):**
   - Screen-space `effects.contactShadows({ length: 0.32, thickness: 0.06, steps: 12, intensity: 0.72, lights: "shadowed" })` (which in 5.5.1 supports reversed-Z depth and normal-mapped meshes) **plus** soft `shadows.blobShadow({ footprint, opacity: 0.34, color: "#3A3142" })` parented under every active character and ground prop (`y = 0.004m`), guaranteeing unmistakable grounding even on Low mobile quality tiers.
4. **Tactile Ambient Occlusion, Selective Soft Bloom & Tilt-Shift Diorama Depth:**
   - `effects.ambientOcclusion({ intensity: 0.42, radius: 0.45, multiBounce: true })` tucks soft contact shading into toy crevices, wooden blocks, and plush seams.
   - `looks` `post: { bloom: { intensity: 0.28, threshold: 1.15, knee: 0.45, clampLuminance: 4.0 } }` gives Lumi's star core, soap-bubble speculars, and magic sparkles a gentle halo **without** glare or strobe, and **zero `effects.vignette`** (preserving the hard Wonder World rule).
   - Gentle miniature diorama focus (`effects.depthOfField({ tiltShift: { bandCenter: 0.52, bandWidth: 0.48 } })` on `high`/`ultra` tiers, automatically off on `low`/`medium` and `reducedMotion`) blurs only the distant horizon hills (`z < -10m`) and extreme foreground grass rim (`z > 3.2m`), keeping 100% of `ON_STAGE_SPOTS` razor-sharp while imparting an instant stop-motion Blender miniature feel.
5. **Atmospheric Height Fog & Procedural Sky Dome (`effects.fog` + `sky.gradient`):**
   - Replace the flat CSS background clear color and `learning-cloud`'s `90x40m` flat box wall with `sky.gradient({ zenith, horizon, ground, clouds })` + `effects.fog({ mode: "height", color, density: 0.012, heightFalloff: 0.22, heightReference: 0 })`—permanently eliminating the software-WebGL2 sky-speck artifact noted in `look-dev.md` line 34.
6. **Runtime Storybook VFX (`app.effects` Enabled with Calm Guardrails):**
   - Set `app.effects.runtime = settings.reducedMotion ? "off" : "on"` (honoring `?vfx=on|off`). Register 8 calm, low-count (`<= 24` particles, `blend: "alpha"`, soft fade-in/out, zero screen flash) presets via `app.effects.registerPreset(...)` using 5.5.1's built-in procedural atlas sprites (`bubble`, `soft-dot`, `glow`, `ring-thin`, `dust-mote`, `smoke-a`, `splash`).

---

## 4. Section 2 — Blender-Quality Art Direction for All 6 Worlds (`src/scenes/*`)

### 4.1 Shared Diorama Plinth & Aspect-Adaptive Framing (`worlds.ts` & `spots.ts`)
- **Sculpted Toy-Island Plinth (`src/scenes/diorama-terrain.ts`):** Replace the infinite `70m x 70m` `primitives.plane` with a `26m`-diameter sculpted, softly bevelled island plinth (`@aura3d/engine/procedural` `heightfield` radial falloff outside `r = 6.5m` so the core `SPOTS` playfield `r <= 3.2m` remains mathematically flat at `y = 0.000m` for exact spot/foot placement!) surrounded by gentle rolling outer meadow/cloud skirts (`r = 7m..28m`).
- **Portrait vs Landscape Camera Curve (`src/scenes/spots.ts`):** Solve `look-dev.md`'s `6.5/10` portrait composition bottleneck by extending `frameCamera(preset, aspect)` with an aspect-smooth portrait curve (`portraitWeight = clamp01((1.0 - aspect) / 0.54)`): when `aspect < 1.0` (e.g. `390x844`, `aspect = 0.462`), smoothly pitch camera target up by `+0.16m`, lower camera eye by `-0.22m`, and tighten `fov` within `minHalfWidth = 1.88m` so characters fill **48–56% of vertical frame height** instead of leaving an empty foreground lawn, while preserving 100% of `spots.test.ts` arm-clearance bounds.

### 4.2 Per-World Visual Overhaul Specifications

| World ID & File | Look & Distinct `AuraHdriId` | Color Script (60 / 30 / 10) | Tactile PBR Material Recipes | Hero Set-Dressing & Sculpted Geometry | Ambient Motion (`0` in `reducedMotion`) |
|---|---|---|---|---|---|
| **1. Momo Meadow** (`src/scenes/meadow.ts`) | `looks.preset("outdoor-day")` · `hdri: "autumn_field_puresky"` · `sun: { azimuthDeg: 35, elevationDeg: 48 }` · `rim: { color: "#FFF2D6", intensity: 1.55, azimuthDeg: 205 }` · `grade: { saturation: 1.08, temperature: 0.06 }` | **60%** Clover mint `#9ED686` & sky `#9BC8EC`<br>**30%** Sage hills `#84C472` & warm bark `#B98B63`<br>**10%** Berry-purple Momo, coral flowers `#F48B94`, red ball `#E4574B` | **Turf:** `material.felt({ color: "#9ED686", roughness: 0.88 })` + fabric micro-normal<br>**Path:** `material.matteClay({ color: "#EBD9BA", roughness: 0.92 })`<br>**Flowers:** `material.ceramic` petals + `rim` | Winding cream-clay garden path (`tubeAlongSpline`), sculpted multi-tiered hills (`heightfield`), 6 `tree` GLBs (`splitScatterByDistance`), admitted fluffy `bush` & `cloud` GLBs, `instances.model` daisy/clover clusters (`48` instances, 1 draw, `castShadow: false`), wooden picket edge posts | GPU `wind: { strength: 0.22, speed: 0.9, assetHeight: 0.7 }` on flowers/tufts/trees; slow Z-locked cloud drift (`0.06 m/s`); `6` drifting `dust-mote` sunlit pollen specks |
| **2. Lulu Music Garden** (`src/scenes/music-garden.ts`) | `looks.preset("outdoor-day")` · `hdri: "outdoor-midday"` · `sun: { azimuthDeg: -32, elevationDeg: 50 }` · `rim: { color: "#FFEAB8", intensity: 1.6, azimuthDeg: 148 }` · `grade: { contrast: 1.05, saturation: 1.1 }` | **60%** Seafoam lawn `#AEE0C2` &robin sky `#A8D2EC`<br>**30%** Birch wood `#E4C59E` & ivory keys `#FCF9F2`<br>**10%** Mint Lulu, lavender/coral/gold stomp stones | **Piano Keys:** `material.lacquer({ color: "#FCF9F2", clearcoat: 0.85, clearcoatRoughness: 0.08 })` & ebony `#3B3748`<br>**Stomp Stones:** `material.ceramic` bevelled river-stone pads<br>** Brass Chimes:** `material.brushedMetal({ color: "#F2C96B", roughness: 0.32 })` | Curved amphitheater terrace (`extrudeContour`), 18 bevelled `instances.roundedBox` piano keys that depress & glow softly on song beats, 5 sculpted `stompStone` GLBs with inlaid musical note reliefs, hanging wooden wind-chime arch, flower & bush clusters | GPU `wind` on garden blooms; gentle `0.4 Hz` pendulum sway on wind-chime tubes; piano-key bounce synced to `advanceSong` lyric cues |
| **3. Home Nook** (`src/scenes/home-nook.ts`) | `looks.preset("interior-warm")` · `hdri: "warm_bar"` · `background: "#F5E7D3"` · `key: { color: "#FFE4BE", intensity: 2.4, shadow: { mapSize: 2048, filter: "pcss" } }` · `rim: { color: "#FFD6A5", intensity: 1.25, azimuthDeg: 165 }` + **real `lights.point` on floor lamp** (`#FFD296`, `intensity: 2.8, distance: 6.5, shadow: true`) + **window `lights.spot` shaft** (`#FFF4DE`, `intensity: 2.1, angle: 0.65, penumbra: 0.7`) | **60%** Honey-oak floor `#D8B282` & warm plaster `#F7E9D6`<br>**30%** Terracotta woven rug `#EC9B86` & sage trim `#C8D8C0`<br>**10%** Butter lamp `#FFE3B0`, storybook spines, pastel cushions | **Floorboards:** `material.wood({ color: "#D8B282", roughness: 0.68 })` (`instances.roundedBox` planks)<br>**Rug & Curtains:** `material.felt({ sheen: 0.8, roughness: 0.9 })`<br>**Lamp Shade:** `material.fabric` + warm `emissive: "#FFD9A0", emissiveIntensity: 0.55` | Bevelled wainscoting & crown molding (`mergeStaticByKey`), pleated soft-cylinder curtains framing a sunlit garden backdrop outside the arched window, framed pastel relief illustration on wall, wooden toy shelf with ceramic/wood miniatures, potted leafy plant | Subtle `0.25 Hz` curtain breath sway (`0.015 rad`); `4` lazy afternoon dust motes inside the window sunbeam |
| **4. GoGo Station** (`src/scenes/station.ts`) | `looks.preset("outdoor-day")` · `hdri: "kloppenheim_06_puresky"` · `sun: { azimuthDeg: 22, elevationDeg: 52 }` · `rim: { color: "#FFF0D0", intensity: 1.65, azimuthDeg: 200 }` · `grade: { contrast: 1.06, saturation: 1.08 }` | **60%** Meadow sage `#B7D9A6` & limestone ballast `#DFD5C5`<br>**30%** Warm brick/timber `station` & `tunnel`, cedar sleepers `#C2966B`<br>**10%** Fire-engine red GoGo `#E4483C`, brass bell, yellow `gogoCarriage` | **Rails:** `material.brushedMetal({ color: "#A7B3C8", roughness: 0.35, metallic: 0.82 })`<br>**Sleepers:** `material.wood({ color: "#C2966B", roughness: 0.82 })`<br>**Platform:** `material.matteClay` with yellow tactile safety stripe | Raised gravel trackbed (`extrudeContour`) along `TRACK_Z = -1.6` extending into curved scenic loop behind `tunnel`, bevelled stone platform with wooden canopy bench, animated round station clock & friendly semaphore paddle, hillside pines (`instances.model`) | Semaphore arm tips gently when GoGo departs/brakes; cloud drift; GPU `wind` on hillside pines |
| **5. Peeko Peekaboo Barn** (`src/scenes/peekaboo-barn.ts`) | `looks.preset("golden-hour")` · `hdri: "spruit_sunrise"` · `exposureEv: -0.35` · `sun: { azimuthDeg: 52, elevationDeg: 38 }` · `rim: { color: "#FFE3A8", intensity: 1.75, azimuthDeg: 225 }` · `grade: { saturation: 1.08, temperature: 0.1 }` | **60%** Golden-green pasture `#C8E19E` & morning sky `#BBD6EC`<br>**30%** Retextured **classic warm-red `barn`** (`#C94A3E` + cream trim `#FAF3E3`), split-rail cedar fence `#E5CCA2`<br>**10%** Sunny-yellow Peeko `#FFE066`, golden straw bales `#ECCB6E`, calme duck-pond puddle (`world.water`) | **Barn Wood:** `material.wood` painted matte-red + cream trim<br>**Straw Hay:** `material.felt({ color: "#ECCB6E", roughness: 0.92 })`<br>**Pond:** `world.water({ kind: "pool", shape: { type: "rect", width: 2.2, depth: 1.5 }, waves: "calm", color: "#8CCAE8" })` | Retextured red `barn` GLB with real **articulated double barn doors**, dirt courtyard path, bevelled `instances.roundedBox` split-rail fence, stacked straw bales, small calm duck pond at `[-3.4, 0.01, -3.2]`, sunflower & clover clusters | Gentle `world.water` ripples on the side pond; swaying sunflowers (`wind`); drifting morning clouds |
| **6. Lumi Learning Cloud** (`src/scenes/learning-cloud.ts`) | `looks.preset("outdoor-day")` · `hdri: "kloppenheim_02"` · `sun: { azimuthDeg: 14, elevationDeg: 56 }` · `rim: { color: "#FFF6D6", intensity: 1.8, azimuthDeg: 195 }` · `grade: { contrast: 1.08, saturation: 1.22, temperature: 0.04 }` *(fixes `s=0.11` washout -> `s>=0.28`)* | **60%** Deep periwinkle sky `#8BB4EC` -> `#C2D9F8` gradient & plush lavender-cream cloud deck `#D8DDF7`<br>**30%** 5-band satin pastel rainbow (`#F58EB6`, `#FAD06C`, `#9BE0B4`, `#88C4F4`, `#C3A6F4`)<br>**10%** Warm-gold Lumi `#FFEB99`, primary red/blue/gold letters & blocks | **Cloud Deck:** `material.felt({ color: "#E4E7FA", roughness: 0.9, sheen: 0.85, sheenColor: "#FFF8E8", rim: { color: "#FFFFFF", power: 2.4, intensity: 0.55 } })`<br>**Rainbow Arch:** `material.ceramic` satin tubes<br>**Plinths:** `material.lacquer` | Remove flat `90x40m` box wall; build sculpted quilted cloud-island floor surrounded by 16 instanced fluffy `cloud` GLB billows, smooth 5-band `tubeAlongSpline` rainbow bridge, 3 bevelled floating storybook card pedestals with embossed star trim | Gentle `0.35 Hz` bob & roll on background cloud billows and floating pedestals; `8` soft `glow` stardust motes drifting slowly upward |

---

## 5. Section 3 — Expressive Character Craft, Articulation & Animation (`src/characters/*` & Asset Pipeline)

### 5.1 Solving `rigged: false`: Articulated Multi-Part Hierarchical Assemblies (`src/scenes/articulated-actors.ts`)
Because Meshy humanoid auto-rigging tore 1,465 triangles on round toddler-safe proportions, we upgrade all 6 cast members from static monolithic meshes into **articulated hierarchical pivot assemblies** (`tools/build-articulated-cast.mjs` + `src/scenes/articulated-actors.ts`) while keeping `createAnimationController` + `sampleAuraVoiceBridgeAtTime` active for any clip-bearing GLB:
- **Offline Mesh Part Split & Seam Filleting (`tools/build-articulated-cast.mjs`):** Cleanly partitions each character's remeshed `2048px`-textured GLB along natural plush seam loops (shoulder sockets, hip/foot cups, neck/head collar, tail base, wing roots, wheel axles) with spherical socket overlap caps so rotations up to `±55°` never expose gaps or stretch a single triangle (`aura3d-retexture` vertex-count & bounds invariants recorded in `provenance/models/*.json`).
- **Procedural Eyelid Blink & Gaze Tracking (All 6 Characters):**
  - Every character mounts lightweight curved `eyelidL` / `eyelidR` caps matching its exact body clay color + subtle `pupilOffset` gaze tracking (`yawToFace` / `faceTowards` from `@aura3d/engine/game`).
  - Natural deterministic blink envelope (`every 3.2–4.1s` seeded by `phaseOf(id)`, `140 ms` close/open smoothstep), replacing the old `SHARED_GESTURES.blink` whole-body vertical squash!
  - Active gaze target (`speaker -> active tap target -> viewer camera`) rotates the `head` sub-node smoothly (`±22°` yaw, `±12°` pitch via `createSmoothFollow3`), leading the toddler's attention naturally toward the named object (`PRD 02 §4`).

### 5.2 Per-Character Articulation & 2K PBR Craft Table

| Character | 2K PBR Material & Atlas Fix | Articulated Sub-Nodes (`runtime` handles) | Upgraded Signature Animations (Replacing Rigid Statue Tweens) |
|---|---|---|---|
| **Momo** (`src/characters/momo.ts`) | Native lavender plush (`2048px` KTX2 baseColor + normal + AO) with `material.felt({ sheen: 0.78, sheenColor: "#F3DCFF", rim: { color: "#FFF0FA", power: 2.6, intensity: 0.45 } })` | `body`, `head`, `armL`, `armR`, `footL`, `footR`, `eyelids`, `cheekPuff` | **`wave`:** Right arm lifts `+115°` and waves friendly arc while head tilts `+8°`.<br>**`point`:** Nearest arm extends toward active prop spot while head/gaze locks onto prop.<br>**`walk`:** `proceduralLegSwing` alternating tiny feet + `createHandBounce` arm counter-swing.<br>**`carry`:** Both arms curl forward (`+48°`) cradling carried prop (`ball`, `cookie`, `basket`). |
| **Lulu** (`src/characters/lulu.ts`) | Region-repainted mint dino atlas (`#8FD9A8` skin, warm cream belly `#FAF0D7`, **pure white `#FFFFFF` eye sclera**—removing flat multiplicative tint!) + `material.matteClay` soft satin sheen | `body`, `head`, `armL`, `armR`, `footL`, `footR`, `tail`, `eyelids` | **`clap`:** `armL` and `armR` swing inward to meet in front of chest on each beat (`3` crisp claps + tiny `ring-thin` puff!).<br>**`stomp`:** Left then right big dino foot lifts `0.16m` and plants firmly with `dust-clay` footstep puff.<br>**`dance`:** Rhythm hip sway + alternating arm groove + counter-swaying `tail`.<br>**`freeze`:** Expressive mid-pose hold on `"Stop!"` (eyes still able to blink calmly). |
| **Sheru** (`src/characters/sheru.ts`) | Region-repainted warm honey-biscuit coat (`#EFCD9C`, dark chocolate nose `#3B2820`, **untinted bright eyes**, soft caramel ears) + `material.felt` plush coat | `body`, `head`, `earL`, `earR`, `legFL/FR/BL/BR`, `tail`, `eyelids` | **`wag`:** Independent `tail` sub-node wags joyfully at `5.5 Hz` (`±0.48 rad`) while torso stays steady!<br>**`sit`:** Hind quarters lower & pitch `-28°` while front paws plant upright and head stays level.<br>**`sniff`:** Head pitches down `-24°` with rapid gentle nose-bob; floppy `earL`/`earR` lag via spring follow.<br>**`carry`:** Ball nests cleanly at mouth/chin socket `[0, 0.52, 0.58]`. |
| **Peeko** (`src/characters/peeko.ts`) | Region-repainted sunny buttercup yellow (`#FFE066`, warm orange beak/feet `#F59B42`, **clean white eye highlights**) + `material.felt` fluffy down (`sheen: 0.85`) | `body`, `head`, `tuft`, `wingL`, `wingR`, `footL`, `footR`, `beakLower`, `eyelids` | **`flap` / `happy` / `cheer`:** `wingL` and `wingR` pivot around shoulder hinges (`±0.65 rad` Z-flap) with tuft secondary bounce—**zero horizontal body stretching**!<br>**`hide`:** Tucks head down, folds wings tight, crouches cleanly behind doors/hay.<br>**Talking cue:** `beakLower` opens `0..14°` in sync with Peeko's syllable envelope! |
| **Lumi** (`src/characters/lumi.ts`) | Warm pearlescent star-gold (`#FFEB99`) with `material.ceramic` satin + soft core `emissive: "#FFE89E", emissiveIntensity: 0.35` (bloom-coupled, **zero flashing**) | `core`, `rayTop`, `rayL`, `rayR`, `rayBL`, `rayBR`, `eyelids` | **`idle` / `float`:** Multi-axis figure-8 Lissajous hover + gentle `±4°` Z-bank.<br>**`glow` / `conjure`:** Smooth `1.2s` warm emissive swell (`0.35 -> 0.65 -> 0.35`, never abrupt) + curving `app.effects.trail` golden ribbon as Lumi introduces letters/numbers/shapes. |
| **GoGo** (`src/characters/gogo.ts`) | Quad-remeshed clean topology (`8,500` tris, replacing `16,773`-tri raw marching-cubes decimation!) in `material.clearcoatPaint` cherry red (`#E4483C`), brass trim (`material.brushedMetal`), glass cab windows (`material.clearGlass`) | `hull`, `chimney`, `wheelFL`, `wheelFR`, `wheelRL`, `wheelRR`, `cabDoorL`, `cabDoorR`, `eyelids` | **`drive` / `go`:** All 4 wheels rotate by exact arc-length `Δθ = Δx / wheelRadius` (`0` slip!), `chimney` squashes slightly before puffing a soft `smoke-a` cotton cloud on each `"chugga"` beat, and `cabDoor` swings open at the station so passengers visibly board (`g02`, `e04`)! |

### 5.3 Deterministic Syllable-Envelope Talking Cue (`gen-audio-manifest.mjs` -> `animation-director.ts`)
- Extend `apps/veer-wonder-world/tools/gen-audio-manifest.mjs` to decode each of the `843` spoken MP3s offline and store a compact quantized Base64 `Uint8Array` (`20 Hz` = one byte per `50 ms` fixed story step!) `env: string` on every `AUDIO_MANIFEST.lines[key]` entry (~`26 KB` total gzip across all 843 lines).
- In `src/runtime/narration-player.ts` and `src/runtime/animation-director.ts`, pass the current `50 ms`-step envelope amplitude `speechEnergy(actorId) ∈ [0, 1]` into `pose(id)`:
  - Drives subtle articulated `jaw` / `beakLower` / `cheekPuff` + `head` nod + `40%`-reduced torso breath—pausing naturally during intra-sentence silences (e.g. `"Ready... ... go!"`) instead of oscillating at a blind `2.4 Hz` sine wave!
  - Preserves 100% of existing unit & browser tests (`talkPulse` stays non-zero during active lines, `0` when silent, never called clinical lip-sync).

### 5.4 Admitting the 11 Remaining Procedural Props + Hinged Containers
- Admit optimized, provenanced GLBs (or sculpted `@aura3d/engine/procedural` bevelled smooth meshes where exact mathematical clarity wins, such as `letterBLower` / `letterALower` / `pastry*`) for `bush`, `cloud`, `stompStone`, `balloon`, `partyHat`, `toothbrush`, `sun`, and multi-seam beach/play `ball`, plus restore `1024px` KTX2 PBR maps on all 48 existing props (`teddy`, `cow`, `sheep`, `duck`, `horse`, `cake`, `picnicBasket`, `toyPiano`, `drum`, `shaker`, `colourMachine`, `storyBox`, `lift`, `car`, etc.).
- Split hinged sub-nodes on `door` (`frame` + `leaf` pivoting `-100°` around hinge X-edge), `barn` (`hull` + `doorL`/`doorR`), `lift` (`shaft` + moving `cab` + sliding `gate`), `toyBox` / `storyBox` / `picnicBasket` (`base` + hinged `lid` opening `-85°`).
- Upgrade `"bubble"` from a flat translucent sphere to a **WebGPU-native thin-film iridescent soap bubble** (`material.physical({ color: "#FFFFFF", roughness: 0.03, metallic: 0.0, transmission: 0.88, ior: 1.33, thickness: 0.08, iridescence: 1.0, iridescenceIOR: 1.33, iridescenceThicknessRange: [180, 480], opacity: 0.36, transparent: true })`) with deterministic harmonic wobble!

---

## 6. Section 4 — Game-by-Game 10/10 Visual & Interaction Upgrade (All 12 Activities + 20 Episodes)

### 6.1 Systemic Interactive Architecture Upgrades (`types.ts`, `episode-director.ts`, `stage.ts`)
1. **Per-Target Choice Branching (`BeatSpec.responseByTarget`):**
   - When a toddler taps `"apple"` vs `"banana"` (`g05`, `e10`), `"bubble2"` vs `"bubble3"` (`g01`), `"red-ball"` vs `"blue-ball"` (`e07`), `"peeko"` vs `"teddy"` (`g02`), `"drum"` vs `"shaker"` (`g10`), or `"teddy"` vs `"ball"` (`e20`), `EpisodeDirector` selects `beat.responseByTarget?.[tappedTargetId] ?? beat.response`.
   - Uses **already-recorded, rights-provenanced single-word & phrase clips** in `AUDIO_MANIFEST.lines` (zero unapproved text, zero TTS blocker), while `parentConfirm()` and `5000 ms` silence timeout gracefully execute the default `beat.response`—preserving 100% of *"silence never fails"*!
2. **3-Round Progressive Variety (`ActivitySpec.roundVariants`):**
   - Each activity's 3 rounds (`roundIndex = 0, 1, 2`) apply `roundVariants?.[roundIndex]` overrides (e.g., rotating visitors in `g09`, varying ball fetch spots `backLeft` / `back` / `backRight` in `g03`, cycling colours/animals) so Round 2 and Round 3 feel fresh and rewarding rather than mechanical replays.
3. **Tactile 3D Tap Anticipation & Calm VFX Juice (`stage.ts`):**
   - Replace raw unlit torus/sphere meshes (`__ring-0/1`, `__halo-0/1`) with **soft ground-projected dual-shader SDF ripple rings** (`material.custom` with both `glsl` and `wgsl`, smooth outer alpha feather, gentle `0.38 Hz` breath) + **soft fresnel `rim` warm highlight** on active target meshes.
   - On valid `pointerdown`, immediately trigger a `90 ms` tactile squash-pop (`scale: [1.08, 0.91, 1.08] -> [0.96, 1.06, 0.96] -> [1, 1, 1]`) + context-matched calm particle burst (`<= 18` particles, `0` in `reducedMotion`).

### 6.2 Complete Upgrade Matrix for All 12 Interactive Tap Games (`g01`–`g12`)

| Game Code & File | Current Prototype Limitation | 10/10 Visual, Prop Choreography, Choice & VFX Upgrade (`@aura3d/engine` 5.5.1) |
|---|---|---|
| **`g01` Bubble Garden** (`activities/bubble-garden.ts`) | Tapping either `bubble2` or `bubble3` pops both at once; opaque-looking sphere stand-ins; zero wand film or pop droplets. | **Thin-film iridescent PBR soap bubbles** (`iridescence: 1.0, transmission: 0.88`) with soft rainbow shimmer + shimmering soap film inside `bubbleWand` hoop. **Individual bubble popping** via `responseByTarget`: tapping `bubble2` pops `bubble2` first with a delicate `ring-thin` + `bubble` micro-droplet burst while `bubble3` floats gently upward to invite a second joyful pop (or gently pops at beat end). |
| **`g02` Go-Go Train** (`activities/gogo-train.ts`) | Tapping either passenger hides both (`hide`); wheels don't turn; train teleports `farRight -> back` between beats; no steam. | Couple `gogoCarriage` behind `gogo` on a continuous **curved oval spline track** (`tubeAlongSpline` — zero teleport cuts!). `responseByTarget` lets `peeko` or `teddy` hop through the **hinged open carriage door** and **remain visibly seated inside the open-top carriage** waving as GoGo's 4 wheels spin (`Δx / r`), semaphore arm drops, and soft white `smoke-a` cotton puffs rise rhythmically on `"Chugga-chugga!"`. |
| **`g03` Sheru's Ball Game** (`activities/sheru-ball.ts`) | Ball glides along identical `front -> backRight` line without rolling rotation; `carry` floats ball in front of chest; rigid dog body. | Sculpted 6-panel stitched matte-rubber `ball` rolls with true angular velocity (`rollAngle = distance / radius`) and subtle grass-blade depression + `dust-turf` puff on bounce. `roundVariants` vary roll destination (`backRight`, `backLeft`, `back`) across Rounds 1–3; Sheru's articulated legs bound out, floppy ears bounce, nose sniffs, ball nests cleanly in jaw socket on return, and independent `tail` wags enthusiastically during `"More ball?"`. |
| **`g04` Peekaboo Animal Barn** (`activities/peekaboo-animal-barn.ts`) | Standalone floating `door` prop in front of a green background barn; animals untappable after reveal; fixed order. | Position camera on the **retextured classic red `barn`'s real hinged double doors** (`doorL`, `doorR`) + hay-loft peek window! Before opening, door gently rattles (`±2.5°` anticipation) with warm golden light spilling through the crack. Revealed `cow`, `duck`, and `horse` wear full `1024px` KTX2 PBR textures, step onto straw with soft `dust-clay` puffs, and become **tappable for an expressive encore ear-wiggle/wing-flap + animal sound**! |
| **`g05` Teddy's Snack Picnic** (`activities/teddy-snack-picnic.ts`) | Tapping `apple` vs `banana` runs identical generic response; neither fruit moves to Teddy or changes state. | Woven checkered felt picnic blanket spread on Home Nook rug; hinged `picnicBasket` lid opens. **`responseByTarget` fixes choice causality:** tapping `apple` arcs the glossy `material.lacquer` red apple to `teddy`'s paws with crisp `munch` + tiny `cookie-crumb` fleck and Momo naming `"Apple! Yum!"`; tapping `banana` arcs the satin yellow banana to `teddy`! Round 1–3 refills fresh fruit from the basket. |
| **`g06` Splashy Car Wash** (`activities/splashy-car-wash.ts`) | Car has zero mud/foam/wet/clean visual change; `sponge` & `towel` are map-stripped stand-ins; zero water/bubbles. | **4-Stage Live Material State Machine on `car` (`handle.setMaterial` / `materialOverrides`):** (0) starts with soft cocoa mud-spot overlay decal (`roughness: 0.92`); (1) tapping `sink` arcs `splash` + `bubble` water droplets onto `car`, shifting to wet sheen (`roughness: 0.15`); (2) tapping `sponge` glides textured cellulose `sponge` in a figure-8 wipe spawning fluffy white `soap-foam` bubbles; (3) tapping woven felt `towel` buffs `car` dry into gleaming **`material.clearcoatPaint`** (`clearcoat: 1.0`) with a subtle `sparkle` star glint! |
| **`g07` The Little Lift** (`activities/little-lift.ts`) | `lift` mesh stays frozen at `y = 0` while only `teddy` floats up/down inside it; doors hop instead of sliding. | Split `lift` into **architectural brass-and-wood shaft + moving `cab` platform + sliding lattice `gate` + illuminated 1/2 floor dial**! `teddy` steps inside, `gate` slides shut smoothly, `cab` and `teddy` ride `up` together (`y = 0 -> +0.85m`) with spinning pulley wheel at top of shaft, brass bell `ding`s, `gate` opens for `teddy` to wave from the balcony, then rides smoothly `down`! |
| **`g08` Build and Tumble** (`activities/build-and-tumble.ts`) | Inverted causality: each block spawns on stack *before* child taps; `topple` tilts all blocks rigidly in unison. | **True Tap-to-Stack Causality:** during each wait (`one`, `two`, `three`), the next bevelled painted-wood `toyBlock` hovers gently in Lumi's golden starlight *above* the stack as the tap target; **tapping drops and settles it onto the tower** with tactile squash, wood `clack`, and `1–2–3` embossed numeral face toward camera! On `"Tumble!"`, deterministic kinematic arc trajectories scatter the 3 blocks onto the quilted cloud floor with soft rotations and cushioned bounces. |
| **`g09` Family Doorbells** (`activities/family-doorbells.ts`) | Plural title `"Family Doorbells"`, yet only 1 door and **only Lulu ever visits** in all 3 rounds. | Cozy porch facade with **illuminated brass doorbell button** (`emissive` warm pulse) beside a panelled wood `door` with frosted glass transom (`material.frostedGlass` showing a friendly silhouette behind the glass before opening!). **`roundVariants` rotate visitors across the 3 rounds:** Round 1 reveals **Lulu** (dino dance), Round 2 reveals **Peeko** (wing-flap peekaboo), Round 3 reveals **Sheru** (happy tail-wag + `"woof!"`), each waving `"Hi!"` and `"Bye!"` as the hinged door swings smoothly. |
| **`g10` Bear's Little Band** (`activities/bears-little-band.ts`) | Only `drum` is ever tappable (1 tap immediately ends turn); `shaker` is passive; flat visual response. | Interactive **2-instrument choice (`["drum", "shaker"]`)** via `responseByTarget`! Tapping `drum` bounces taut parchment drumhead (`material.fabric`) + emits expanding pastel sound-wave `ring-thin` ripple; tapping `shaker` rattles painted maraca (`material.lacquer`) with golden `spark-gold` musical motes! During `"My turn"` ensemble payoff, Lulu claps articulated hands, Bear shakes maraca, and background garden piano keys light up in sync. |
| **`g11` Magic Sound Garden** (`activities/magic-sound-garden.ts`) | `bud-1/2` snaps invisibly (`hide`) while `flower-1/2` pops in (`show`) in 1 frame; fixed left-then-right order. | **Articulated 6-Petal Sculpted Bloom:** replace binary `hide`/`show` swap with smooth `0.85s` `outBack` petal-unfolding choreography (`petals` opening from closed bud cone to full blossom while `stem` rises gently and golden `meadow-pollen` motes + warm `glow` center blossom outward)! Both `["bud-1", "bud-2"]` can be tapped in natural toddler choice order via `responseByTarget`. |
| **`g12` Find My Real Toy** (`activities/find-my-real-toy.ts`) | **12-second dead UX trap:** `holdMs: 12000` runs *before* `"waiting"`, hiding target ring and ignoring all taps on Sheru for 12s! | **Fix `your-turn` Timing Immediately:** move the room-search window *into* `waitMs: 12000` (`normalizeWaitMs` extended to allow story-authored `beat.waitMs` up to `15000 ms`) with `holdMs: 600`! Now Sheru immediately sits in an expectant, tail-wagging pose with his soft ground target ring active **and** caregiver `"Your child had a turn"` enabled the entire time—so the moment the child finds their real ball/teddy (whether in `2s` or `11s`), tapping Sheru or caregiver confirm celebrates immediately! Hinged `toyBox` lid opens smoothly for `ball` and `teddy` reveals. |

### 6.3 Shared & Signature Visual Upgrades Across All 20 Story Episodes (`e01`–`e20`)

Every episode automatically inherits the 6-world diorama overhaul, 2K PBR prop restoration, articulated 6-cast animation, syllable-envelope speech cues, and camera framing curve, **plus** these episode-specific hero upgrades:
- **`e01` Momo's Magic Mouth (`home-nook`):** Replace the floating `0.25x` Z-squashed duplicate mesh in front of an opaque silver disc with a **stencil/planar-clipped mirror interior + `material.clearGlass` bevelled oval mirror frame**, reflecting Momo's real articulated head tilts, blinks, cheek puffs, and `"oh"` / `"mmm"` / `"ah"` poses cleanly from any camera angle.
- **`e02` The Peekaboo Palace (`peekaboo-barn`):** Hinged pastel palace doors (`door-left` coral `#F28B82`, `door-right` sky `#8AB4F8` via non-destructive slot `materialOverrides`, keeping wood grain & brass knobs!) swing `-105°` open smoothly with pre-open knock wiggle as `peeko` and `duck` peek around the doorframe.
- **`e03` The Alphabet Zoo (`learning-cloud`):** Bevelled `material.lacquer` uppercase `B` (`letterB`) & sculpted smooth lowercase `b` (`letterBLower`) glow softly on floating cloud pedestals while Zoo Gate swings open; `responseByTarget` lets tapping `ball` bounce/roll the ball and tapping `bear` trigger `teddy`'s happy wave.
- **`e04` GoGo's ABC Train (`station`):** Articulated `gogo` + `gogoCarriage` with spinning wheels chug out of brick `tunnel` carrying `letterA` / `letterALower`; hinged carriage side folds down into a gentle wooden ramp so glossy `apple` rolls smoothly down to `lulu` and `peeko`.
- **`e05` Momo's Counting Cookies (`home-nook`):** Textured baked-clay chocolate-chip `cookie-1..3` (`1024px` PBR normal + AO) rest on glazed `material.ceramic` `plate`; 1-to-1 count illuminates soft warm rim + number badge above each counted cookie; pretend bite scales cookie cleanly with 4 gentle `cookie-crumb` particles.
- **`e06` Lulu's Dino Dance Party (`music-garden`):** Articulated `lulu` claps hands together, stomps alternating feet onto illuminating `stompStone` pads, and holds expressive mid-step `freeze` pose on `"Stop!"` while garden piano keys dance to `goStop`.
- **`e07` The Magic Colour Machine (`learning-cloud`):** `colourMachine` gains spinning brass gears, warm frosted-glass chamber glow, and gentle chute animation; `responseByTarget` on `["red-ball", "blue-ball"]` bounces and celebrates the exact chosen coloured ball (`material.clearcoatPaint` `#E4483C` vs `#3B82F6` + distinct surface pattern stripe for color-vision accessibility!).
- **`e08` Where's Sheru? (`home-nook`):** Articulated `sheru` peeks floppy ears/wagging tail tip visibly from beneath wooden `table` and behind `bench` (`hinged` `toyBox` lid lifts on search beats) so toddlers delight in spotting the visual clue.
- **`e09` Baby Animal Orchestra (`music-garden`):** `cow`, `sheep`, and `duck` restored to full `1024px` KTX2 PBR textures; each animal's instrument (`cow-drum`, `sheep-shaker`, `duck-piano`) visibly vibrates and emits soft pastel note rings only while its solo plays, culminating in synchronized `animalBand` choreography.
- **`e10` Momo's Hungry Belly (`meadow`):** Woven picnic blanket set-piece under meadow shade tree; hinged `picnicBasket` opens; `responseByTarget` on `["apple", "banana"]` lets Momo cradle and pretend-munch whichever fruit the child taps.
- **`e11` Number Balloon Rescue (`meadow`):** Replace sphere-plus-stick stand-in with sculpted pear-shaped satin latex `balloon` GLBs (`material.clearcoatPaint` with soft translucent rim + curved flexible ribbon `tubeAlongSpline`) swaying gently in breeze and floating smoothly down into Lulu's outstretched hands in 1–2–3 order.
- **`e12` The Magic Shape Bakery (`home-nook`):** Golden-baked `pastryCircle`, quad-remeshed `pastrySquare`, and `pastryTriangle` with warm glaze `material.ceramic` sheen + jelly wobble physics on tap (`responseByTarget` wobbles tapped pastry individually), paired with ceramic `plate`, bevelled `toyBlock`, and woven `partyHat`.
- **`e13` Silly Robot Factory (`home-nook`):** Articulated `robot` (brushed-metal joints + friendly warm LED eyes, region-recolored `#A9CDF2`) places knitted felt `hat` on its articulated foot with comical head-tilt, then arcs `hat` smoothly onto its head on child's `"help-hat"` tap before clapping and stomping with Momo.
- **`e14` The Lost Teddy Adventure (`home-nook`):** Plush `material.felt` `teddy` tucked cozily inside hinged `picnicBasket` after peeking under `table` and behind velvet `cushion` (sliding cushion aside smoothly rather than rigid hop).
- **`e15` Momo's Bubble Universe (`meadow`):** Giant iridescent `bubble-1..3` encapsulate miniature 3D `duck`, `bird`, and `cow` figurines visibly inside the refractive soap sphere before popping into soft mist droplets as each animal hops joyfully onto the meadow grass!
- **`e16` The Little Birthday Party (`music-garden`):** Frosted `cake` (`1024px` PBR swirls) topped with warm flickering dual-shader `candleFlame` (`lights.point` warm `#FFB85C` pool on cake top); on `"blow-invite"`, flame extinguishes smoothly into a tiny curling wisp of white `smoke-a` + warm `lights.point` fadeout (zero real-flame encouragement).
- **`e17` Sheru's Big Adventure (`meadow` — Golden Slice):** Full showcase treatment: articulated Momo waves & points toward rolling stitched `ball`, Sheru tracks ball with head/ear gaze, bounds across `material.felt` clover turf kicking tiny `dust-turf` puffs, carries ball back in jaw socket, and performs line-synced `ballRolls` song choreography.
- **`e18` Who's at the Door? (`home-nook`):** Warm doorbell chime illuminates porch button; hinged `door` swings open to welcome articulated `lulu` and `sheru` waving `"Hi!"` and `"Bye!"` (`responseByTarget` on `["lulu", "sheru"]` triggers individual goodbye bow/tail-wag).
- **`e19` Momo's Day (`home-nook`):** Dynamic **runtime lighting & sky progression (`app.nodes.get(...).setLight` + `app.post.setEffect`)** across the 3 daily routines: crisp morning sunbeams during `"wash"` (water droplets at porcelain `sink` + sculpted `toothbrush`), warm midday glow during `"eat"`, and cosy dimmed amber bedside lamp (`transitionSeconds: 2.0`) as Momo tucks into quilted `bed` for `"sleep"`.
- **`e20` The Little Story Machine (`learning-cloud`):** Hinged brass-trimmed `storyBox` opens with gentle `warm-star-dust` motes; `responseByTarget` on `["teddy", "ball"]` and `["car", "teddy"]` animates the chosen toy pair acting out their miniature two-sentence vignette center-stage.

---

## 7. Section 5 — 10/10 Co-Play UI/UX Overhaul & Licensed Typography (`src/ui/*`)

### 7.1 Canonical Licensed Font Stack (`ui-typography-density.md` Compliant)
Self-host committed `.woff2` files from `/Users/gurbakshchahal/platforms/aura3d/public/fonts/` into `dist/fonts/` via `vite.config.ts` and declare in `apps/veer-wonder-world/src/ui/fonts.css` (imported by `styles.css`, `html { font-synthesis: none }`, weights **`400`, `500`, `600` only — NEVER `700`**):
- **`--font-ui` (`Whitney` licensed web build: `whitney-regular.woff2` 400, `whitney-regular-italic.woff2` 400i, `whitney-medium.woff2` 500, `whitney-semibold.woff2` 600):** All caregiver controls, parent settings sheet, badges, mode toggles, and assistive notes (`13px–14px` dense legibility, `tnum` tabular numerals, real lowercase `smcp` section headers).
- **`--font-display` (`Graphik Web`: `Graphik-Regular-Web.woff2` 400, `Graphik-Medium-Web.woff2` 500, `Graphik-Semibold-Web.woff2` 600):** Storybook hero welcome title (`600`), episode/game card titles (`500`), and large child-facing co-reading captions (`500`).
- **`--font-metric` (`DIN Pro`: `dinpro-regular.woff2` 400, `dinpro-medium.woff2` 500 with `unicode-range` digit subset):** Episode/game index numbers (`1..20`, `1..12`), round counters (`1/3`), and wait-duration readouts.
- **`--font-code` (`Monument Grotesk Mono`: `monument-mono.woff2` 400):** `?diag=1` renderer/backend/SHA diagnostics strings only.
- *Lockstep Test Update:* Update `tests/unit/ui/strings.test.ts` (lines 413–428) and `vite.config.ts` font-copy plugin to validate all 4 licensed `.woff2` families + metric-matched fallbacks (`"Whitney Fallback"`, `"Graphik Fallback"`, `"DIN Pro Fallback"`) and enforce `weights === ["400", "500", "600"]`.

### 7.2 Screen-by-Screen UI/UX Overhaul (All 13 Target Viewports)
1. **Live 3D Diorama Start Screen (`src/ui/start-screen.ts`):**
   - Instead of hiding `#stage` behind an opaque `#FFF8EC` wall of flat CSS circles, warm and reveal **Momo Meadow live behind a frosted translucent storybook card** (`background: rgba(255, 250, 240, 0.88); backdrop-filter: blur(10px)` in normal contrast; solid `#FFFFFF` in `.high-contrast`), with Momo and Sheru gently breathing/waving in the sunlit background!
   - Render crisp `256x256` **2K real-GPU WebP cast portraits** (`tools/make-portraits.sh` re-captured under 5.5.1 lighting), tactile segmented mode cards (`Play Together` vs `Watch & Sing`) with clear 1-line explanations, and the `76px`-tall `"Tap to start"` primary CTA unlocking `AudioContextManager` synchronously on click. Zero timers (`setTimeout`/`requestAnimationFrame` stay strictly `0` in `start-screen.ts`!). Fits above the fold with zero scroll across all **13 viewports** in `wonder-world-start-screen.spec.ts` (`320x568` iPhone SE up to `1366x1024` iPad Pro & desktop).
2. **Illustrated World-Filtered Story & Game Picker (`src/ui/episode-menu.ts`):**
   - Add a **World Filter Strip** across the sticky header (`All worlds` + the 6 illustrated world pills: *Meadow, Music Garden, Barn, Station, Learning Cloud, Home Nook*, keyboard-navigable with roving `tabindex`).
   - Upgrade each `.ww-card` with a **rendered 16:10 miniature WebP world+host scene thumbnail** (`src/assets/thumbnails/<code-or-world>.webp` registered in `src/portrait-assets.ts`), `--font-metric` index pill, host portrait avatar, duration/round chip (`2m` / `3 rounds` in `tnum`), and a subtle **"Practicing star"** badge whenever a story's `targetWords` intersect the caregiver's shortlisted 1–5 words in `ParentSettings.selectedWords`!
3. **Word-Synced Storybook Captions & Caregiver Whisper Pill (`src/ui/captions.ts`):**
   - Add speaker mini-portrait avatar beside `.ww-caption-line`.
   - Highlight each beat's active `targetWords` inside `.ww-caption-text` with a warm, high-contrast pill (`.ww-caption-keyword`, pulsing gently in border warmth via deterministic story-clock progress, static in `reducedMotion`) so co-reading caregivers immediately see which core word (`ball`, `more`, `open`) to model!
   - Refine `.ww-caption-tip` into a calm, compact single-line whisper bar (`13px` `--font-ui`) directly beneath the caption pill.
4. **Unobtrusive Caregiver Corner HUD (`src/ui/child-controls.ts`):**
   - Keep `>= 48x48 CSS px` touch targets (`--ww-tap: 48px`) in top-left (`All done`) and top-right (`Had a turn`, `Pause/Play`, `Replay word`, `Grown-ups` 2s hold) with frosted pill surfaces (`border: 1px solid rgba(43,36,30,0.14)`).
   - Add a calm **SVG radial progress arc** around `"Had a turn"` while `phase === "waiting"` showing the remaining `waitMs` (`3s–8s` or `12s` in `g12`) smoothly counting down on the deterministic `50 ms` story clock—reassuring parents that silence will advance naturally without pressure!
5. **Dense Caregiver Settings Sheet (`src/ui/parent-panel.ts` + `parent-wordlist.ts`):**
   - Apply the canonical **AuraOne Dense UI preset** (`ui-typography-density.md`): `34px` compact setting rows (`--row-height: 34px`), `32px` segmented controls (`--control-height: 32px`, keeping `44px` `.control-touch` on mobile touch viewports `<= 768px`), `17px` Semibold (`600`) sheet title, `12px` metadata floor, lowercase `smcp` section kickers (`playback & mode`, `sensory & accessibility`, `focus words`), hairline row dividers (no nested bloated cards), and live count `X / 5 selected` in `--font-metric`.
6. **Seamless Warmup Veil & Illustrated Offline Bridge Card (`stage.ts` + `src/ui/offline-card.ts`):**
   - Upgrade `.ww-loading` (`showLoading`) with the selected story's host portrait + world colour wash so shader warmup (`warmPrograms(app)`) feels like opening a picture book (`<= 320 ms` crossfade).
   - Upgrade `offline-card.ts` with the story's cast portraits, clickable/visual **Target Word Recap Chips** (showing the 2–4 words modeled in that story), the bold hands-on real-world activity (`<code>.offline`), the caregiver SLP coaching note (`<code>.bridge`), and the single `"Back to stories"` button (zero timers, zero autoplay).

---

## 8. Section 6 — Data Model, TypeScript Interface & Asset Contracts

All new TypeScript contracts in `apps/veer-wonder-world/src/` MUST obey `source-guards.test.ts` (**zero `as T` casts**; use `satisfies`, `as const`, and type-predicate guards only):

```ts
// 1. apps/veer-wonder-world/src/runtime/feature-flags.ts — add backend selector
export type RendererBackendPref = "auto" | "webgl2" | "webgpu";
export interface WonderFlags {
  readonly models: boolean;
  readonly diag: boolean;
  readonly audio: boolean;
  readonly reducedMotion: boolean | null;
  readonly modelWaitMs: number;
  readonly backend: RendererBackendPref; // parsed safely from ?backend=auto|webgl2|webgpu (default "auto")
}

// 2. apps/veer-wonder-world/src/types.ts — choice branching & 3-round variants
export interface BeatResponse {
  readonly stage?: readonly StageAction[];
  readonly lines?: readonly LineRef[];
  readonly holdMs?: number;
}

export interface BeatSpec {
  // ...existing fields preserved 100% backward-compatible...
  readonly response?: BeatResponse;
  /** Optional per-target response when BeatInput.kind === "tap" | "more-or-done". Falls back to `response` on timeout/parentConfirm. */
  readonly responseByTarget?: Readonly<Partial<Record<string, BeatResponse>>>;
}

export interface RoundVariantSpec {
  /** Round-specific stage setup prepended to the first beat of round `0 | 1 | 2`. */
  readonly setupStage?: readonly StageAction[];
  /** Optional per-beat overrides keyed by BeatSpec.id for round `0 | 1 | 2`. */
  readonly beatOverrides?: Readonly<Partial<Record<string, Pick<BeatSpec, "stage" | "lines" | "response" | "responseByTarget">>>>;
}

export interface ActivitySpec {
  // ...existing fields preserved...
  readonly roundVariants?: readonly [RoundVariantSpec, RoundVariantSpec, RoundVariantSpec];
}

// 3. apps/veer-wonder-world/src/audio-manifest.ts — 20 Hz (50ms step) deterministic syllable envelope
export interface AudioLineEntry {
  readonly url: string;
  readonly durationMs: number;
  readonly sha256: string;
  /** Base64-encoded Uint8Array of 50ms-window RMS values [0..255] aligned to STORY_STEP_MS = 50. */
  readonly env: string;
}

// 4. apps/veer-wonder-world/src/scenes/articulated-actors.ts — multi-part character & hinged prop spec
export type SubPartId =
  | "body" | "head" | "armL" | "armR" | "footL" | "footR"
  | "tail" | "wingL" | "wingR" | "tuft" | "earL" | "earR"
  | "legFL" | "legFR" | "legBL" | "legBR"
  | "wheelFL" | "wheelFR" | "wheelRL" | "wheelRR" | "chimney" | "cabDoorL" | "cabDoorR"
  | "eyelidL" | "eyelidR" | "jaw" | "beakLower" | "cheekPuff"
  | "hingeLeaf" | "hingeLeafR" | "lid" | "liftCab" | "liftGate" | "petals";

export interface ArticulatedPartPose {
  readonly position?: Vec3;
  readonly rotation?: Vec3;
  readonly scale?: Vec3;
}
export type ArticulatedPoseMap = Readonly<Partial<Record<SubPartId, ArticulatedPartPose>>>;
```

---

## 9. Section 7 — Non-Negotiable Toddler Safety, Determinism & Static-Guard Invariants

Every single Work Package MUST preserve these hard repository & pediatric-safety rules (verified automatically by `tools/check-all.sh`):

1. **Deterministic `50 ms` Fixed-Step Clock (`STORY_STEP_MS = 50`) & High-Refresh Presentation (`createFixedStepPresenter`):**
   - **Zero** `Date.now()`, `performance.now()`, `new Date()`, or `Math.random()` anywhere in `src/**` (`app-flow.test.ts`, `strings.test.ts`, `game-checks.mjs`). UI click debounces use `event.timeStamp` only.
   - Pair the `50 ms` story clock with `createFixedStepPresenter` + `createRecordBlend` (`@aura3d/engine/game`) and verify via `runMotionGate` at `60`, `120`, and `144` Hz (`maxStillFraction <= 0.05`, `maxCv <= 0.25`).
2. **Toddler Sensory & Co-Play Safety (`README.md`, `LOOK-BRIEF.md`, `01-product-learning-and-safety.md`):**
   - **Zero camera shake**, **zero rapid cuts**, **zero strobe/flashing**, and **zero `effects.vignette`** (`game-checks.mjs` bans `effects.vignette`).
   - **At most 2 active tap targets (`MAX_TAP_TARGETS = 2`)** in any beat, each with a generous hit area `>= 128 x 128 CSS px` (`spots.test.ts`) and `[0, 18, 36] px` touch-router ring forgiveness.
   - **Silence ALWAYS succeeds:** Every wait (`3000..15000 ms`) resolves cleanly via child tap, caregiver `"Had a turn"`, or automatic timeout—**zero** `"wrong"`, `"try again"`, fail branches, scores, streaks, or autoplay-next (`AUTO_NEXT === false`).
   - **Tab-hide safety:** Hiding the tab immediately pauses audio & clock and holds in `"user"` pause on return until a grown-up taps Resume (`pause-reasons.test.ts`).
   - **`reducedMotion` mode:** Sets `app.effects.runtime = "off"`, disables tilt-shift DoF, cloud/wind sway, and secondary idle loops, halves gesture amplitude, keeps semantic actions + syllable cue readable, and disables `#ui` CSS transitions except `.ww-hold-progress`.
3. **Strict Privacy, Zero Mic/Network & Redaction Locks (`no-child-data.test.ts`, `deploy-config.test.ts`):**
   - **Zero** microphone, camera, or Web Speech APIs (`FEATURE_FLAGS` stays `Object.freeze({ voiceInput: false, soundPresence: false, punjabiPack: false, familyPacks: false, parentNotes: false })`).
   - **Zero** external network requests, analytics, cookies, or `IndexedDB`; `fetch` exists **only** in `src/runtime/asset-preloader.ts`; `localStorage` exists **only** in `src/ui/settings-store.ts`.
   - `WELCOME_NAME` stays confined to `src/personal.ts` (`<= 1` literal in built `.js`); **never** write `*.auraone.ai` or `*.vercel.app` inside `apps/veer-wonder-world/{DEPLOYMENT.md,README.md,tools/deploy-preview.sh}` or `tests/browser/wonder-world-live.spec.ts`.
4. **AST & DOM Hygiene Locks (`source-guards.test.ts`, `strings.test.ts`):**
   - **Zero `console.*` or `debugger`** in `src/**`.
   - **Zero `expr as T` type assertions** outside `ALLOWED_CASTS` (use `satisfies`, `as const`, and type guards).
   - **Zero `.innerHTML`** in `src/ui/*.ts`; **zero `setTimeout`/`setInterval`/`requestAnimationFrame`** in `start-screen.ts`, `episode-menu.ts`, and `offline-card.ts`; **zero** top-level `await` on engine readiness (`LINT_TOP_LEVEL_AWAIT_READY`).

### Out of Scope & Anti-Stall Guardrails
- **Out of Scope:** Do NOT enable microphone/ASR (`P3`), do NOT enable unreviewed non-English translation packs (`pa.ts` stays disabled), do NOT add Wonder World to the public marketing site's `showcaseRoutes` or `games.catalog.json` (`index.html` keeps `noindex, nofollow, noarchive`), and do NOT deploy to Vercel (Cloudflare Pages `aura3d-wonder-world` is canonical).
- **No Local Docker or Local Playwright:** All browser captures, `check-deploy --browser`, and visual QA suites run exclusively on the remote runner (`apps/veer-wonder-world/tools/remote-run.sh` / `tools/remote-acr/run.sh`) or authorized loopback headless Chrome CDP per `AGENTS.md` Shipping Rule 1.

---

## 10. Exhaustive File-by-File Breakdown (`CREATE` / `MODIFY`)

Every touched file has **single-lane disjoint ownership** across parallel execution waves:

### Lane A — Engine 5.5.1 Upgrade, Build/Decoder Tooling & Core Stage Pipeline (`WP-1`)
- **`MODIFY` `apps/veer-wonder-world/tools/published-deps.json`** — Bump `@aura3d/engine`, `@aura3d/debug`, `@aura3d/audio`, and `@aura3d/cli` from `"4.6.2"` to `"5.5.1"`.
- **`MODIFY` `apps/veer-wonder-world/tools/deploy-build.sh`** — Update line 28 `npx -y @aura3d/cli@5.5.1 check-deploy --dist dist --no-assets`.
- **`MODIFY` `apps/veer-wonder-world/vite.config.ts`** — Add `aura3d({ physics: "auto", decoders: { codecs: ["basis", "draco", "meshopt"] } })` from `@aura3d/assets/vite`; copy all 6 world 1K `.hdr` files (`autumn_field_puresky_1k.hdr`, `outdoor-midday_1k.hdr`, `spruit_sunrise_1k.hdr`, `kloppenheim_06_puresky_1k.hdr`, `kloppenheim_02_1k.hdr`, `warm_bar_1k.hdr`, plus `studio_small_08_1k.hdr`) and the 4 licensed `.woff2` font families (`whitney-*`, `dinpro-*`, `monument-mono.woff2`, `graphik/*`) from repo `/public/`.
- **`MODIFY` `apps/veer-wonder-world/public/_headers` & `apps/veer-wonder-world/index.html`** — Add `'wasm-unsafe-eval' 'unsafe-eval'` + `worker-src 'self'` to CSP in `_headers` so Basis/KTX2 worker decoding never hits `KTX2_CSP_BLOCKED`; keep `X-Robots-Tag: noindex, nofollow, noarchive`; allow WebGPU or WebGL2 in `index.html` capability check.
- **`MODIFY` `apps/veer-wonder-world/src/runtime/feature-flags.ts`** — Parse `?backend=auto|webgl2|webgpu` into `WonderFlags.backend` (default `"auto"`).
- **`CREATE` `apps/veer-wonder-world/src/scenes/vfx-presets.ts`** — Register the 8 calm Wonder World particle/flipbook presets (`soap-bubble-pop`, `meadow-pollen`, `music-notes-soft`, `steam-puff`, `water-droplets`, `soap-foam`, `warm-star-dust`, `cookie-crumb`) via `app.effects.registerPreset` and dual GLSL+WGSL ground-projected target ripple shader (`targetRippleMaterial`).

### Lane B — PBR Asset Restoration, Retexturing, Articulated Meshes & Audio Envelopes (`WP-2`)
- **`MODIFY` `apps/veer-wonder-world/tools/admit-models.mjs`** — Remove lines 102–108 that strip `normalTexture`, `metallicRoughnessTexture`, and `occlusionTexture` on the 48 non-cast models; raise hero/animal/furniture textures to `1024px` (cast to `2048px`) with KTX2/WebP compression; update `provenance/models/*.json` & `src/aura-assets.ts`.
- **`CREATE` `apps/veer-wonder-world/tools/recolor-atlas-regions.mjs`** — Offline UV-region color grading script fixing pale Meshy models (`lulu`, `sheru`, `peeko`, `lumi`, `robot`, `bird`, `butterfly`, `car`, `gogoCarriage`, `toyPiano`) and recoloring `barn` to classic warm barn-red (`#C94A3E` + `#FAF3E3` trim) **without** tinting white sclera, teeth, keys, or glass windows, verified via `geometry-hash.mjs`.
- **`CREATE` `apps/veer-wonder-world/tools/build-articulated-cast.mjs`** — Splits the 6 main characters + hinged/wheeled props (`gogo`, `gogoCarriage`, `car`, `door`, `barn`, `lift`, `toyBox`, `storyBox`, `picnicBasket`, `flowerBud`) into clean hierarchical child sub-nodes in GLB node trees (`body`, `head`, `armL/R`, `footL/R`, `tail`, `wingL/R`, `wheel*`, `hingeLeaf*`, `lid`, `liftCab`, `liftGate`, `petals`), plus admits the remaining procedural scenery (`bush`, `cloud`, `stompStone`, `balloon`, `ball`, `partyHat`, `toothbrush`, `sun`).
- **`MODIFY` `apps/veer-wonder-world/tools/gen-audio-manifest.mjs` & `apps/veer-wonder-world/src/audio-manifest.ts`** — Compute deterministic `20 Hz` (`50 ms` step) Base64 `Uint8Array` RMS syllable envelopes (`env`) for all `843` spoken MP3s.
- **`MODIFY` `apps/veer-wonder-world/provenance/hdri.json` & `apps/veer-wonder-world/src/assets/rights-manifest.ts`** — Add SHA-256 and CC0 attribution entries for the 5 newly bundled repo HDRIs.

### Lane C — 6-World Blender-Cycles Dioramas, Looks & Camera Framing (`WP-3`)
- **`CREATE` `apps/veer-wonder-world/src/scenes/diorama-terrain.ts`** — Sculpted toy-island plinth (`heightfield` flat `y = 0` inside `r <= 3.2m`, soft bevel rim & rolling outer hills `r = 3.5..26m`), spline paths (`tubeAlongSpline`), and craft PBR material helpers (`clayMat`, `feltMat`, `lacquerMat`, `ceramicMat`, `woodMat`, `instanceClayMat` without extension-lobe draw expansion).
- **`MODIFY` `apps/veer-wonder-world/src/scenes/looks.ts`** — Per-world `AuraLookOverrides` with distinct `AuraHdriId`, key PCSS `2048` shadows, plush `rim` backlights, warm/cool `grade`, `bloom`, `ambientOcclusion`, `contactShadows`, `fog({ mode: "height" })`, `sky.gradient`, and tier-gated `depthOfField({ tiltShift })`.
- **`MODIFY` `apps/veer-wonder-world/src/scenes/spots.ts`** — Add Reversed-Z camera depth config (`depth: { mode: "reversed", allowFallback: true }`) and smooth portrait framing curve (`portraitWeight`) elevating subject fill on `390x844` phones while keeping arms inside frame.
- **`MODIFY` `apps/veer-wonder-world/src/scenes/worlds.ts`** — Mount `diorama-terrain`, `sky.gradient`, GPU `wind` on foliage `instances.model`, deterministic cloud drift handles, and `mergeStaticByKey` architectural molding.
- **`MODIFY` `apps/veer-wonder-world/src/scenes/meadow.ts`, `music-garden.ts`, `home-nook.ts`, `station.ts`, `peekaboo-barn.ts`, `learning-cloud.ts`** — Full Blender-grade world reconstructions per Section 4.2 (including real `lights.point` + `lights.spot` in `home-nook.ts`, `world.water` duck pond & hinged red barn in `peekaboo-barn.ts`, curved continuous track & semaphore in `station.ts`, reactive piano keys in `music-garden.ts`, and sculpted quilted cloud deck + 5-band spline rainbow in `learning-cloud.ts`).

### Lane D — Articulated Character Animation, Speech Envelopes & Stage Runtime (`WP-4`)
- **`CREATE` `apps/veer-wonder-world/src/scenes/articulated-actors.ts`** — Sub-node resolver, procedural eyelid blink generator, smooth head/pupil gaze tracker (`yawToFace`, `createSmoothFollow3`), wheel arc-length roller, hinged door/lid/lift-cab driver, and `createAnimationController` + `sampleAuraVoiceBridgeAtTime` bridge for skinned/morphed assets.
- **`MODIFY` `apps/veer-wonder-world/src/characters/character-registry.ts`, `momo.ts`, `lulu.ts`, `sheru.ts`, `peeko.ts`, `lumi.ts`, `gogo.ts`** — Author articulated sub-part curves for all 32 gestures (`wave` arm arc, `point` arm+gaze, `clap` meeting hands, `stomp` alternating dino feet, `wag` independent tail, `sit` hind-leg bend, `flap` hinged wings, `drive` spinning wheels + chimney squash).
- **`MODIFY` `apps/veer-wonder-world/src/runtime/narration-player.ts` & `apps/veer-wonder-world/src/runtime/animation-director.ts`** — Decode `AUDIO_MANIFEST.lines[key].env` at the exact `50 ms` story clock offset and expose `speechEnergy(actorId)` to drive articulated jaw/beak/cheek/nod motion.
- **`MODIFY` `apps/veer-wonder-world/src/scenes/motion.ts` & `apps/veer-wonder-world/src/scenes/stand-ins.ts`** — Add articulated `open`/`close` hinge angles, kinematic block `topple` arcs, smooth petal `bloom` curves, rolling ball quaternion math, and thin-film iridescent `"bubble"` material.
- **`MODIFY` `apps/veer-wonder-world/src/scenes/stage.ts` & `apps/veer-wonder-world/src/app.ts`** — Wire 5.5.1 `createGame` WebGPU/AgX options, enable calm `app.effects.runtime`, attach `shadows.blobShadow` + SDF ground target ripples, upgrade E01 planar-clipped glass mirror, add 4-stage `car` wash material state transitions, and verify `createFixedStepPresenter` + `createRecordBlend`.

### Lane E — Choice-Branching Director, All 12 Games (`g01`–`g12`) & 20 Episodes (`e01`–`e20`) (`WP-5` & `WP-6`)
- **`MODIFY` `apps/veer-wonder-world/src/types.ts`, `src/runtime/episode-director.ts`, `src/runtime/turn-taking.ts`, `src/content/schema.ts`** — Add `BeatSpec.responseByTarget`, `ActivitySpec.roundVariants`, pass resolved `targetId` from `TouchRouter` into `EpisodeDirector`, and raise `MAX_WAIT_MS` / schema ceiling to `15000 ms` so `g12` uses interactive `waitMs: 12000` instead of dead `holdMs: 12000`.
- **`MODIFY` All 12 Activity Files (`apps/veer-wonder-world/src/content/activities/{bubble-garden,gogo-train,sheru-ball,peekaboo-animal-barn,teddy-snack-picnic,splashy-car-wash,little-lift,build-and-tumble,family-doorbells,bears-little-band,magic-sound-garden,find-my-real-toy}.ts`)** — Implement every per-game upgrade in Section 6.2 (`responseByTarget` individual bubble pop, visible train seating, rolling ball variants, encore tappable barn animals, real `apple` vs `banana` picnic feeding, 4-stage car wash, moving lift cab, tap-to-drop block causality, 3-friend `g09` doorbell rotation, `drum` + `shaker` duet, petal-unfolding `g11` flowers, and immediate `g12` Sheru wait).
- **`MODIFY` All 20 Episode Files (`apps/veer-wonder-world/src/content/episodes/*.ts`)** — Wire `responseByTarget` on 2-target choice beats (`e03`, `e07`, `e10`, `e12`, `e18`, `e20`), routine light transitions in `e19`, encapsulated miniature animals inside iridescent bubbles in `e15`, candle point-light + smoke wisp in `e16`, and hinged container/door actions across `e02`, `e04`, `e05`, `e08`, `e13`, `e14`.

### Lane F — 10/10 Co-Play UI/UX, Licensed Fonts & Thumbnails (`WP-7`)
- **`CREATE` `apps/veer-wonder-world/src/ui/fonts.css` & `MODIFY` `apps/veer-wonder-world/src/ui/styles.css`** — Declare self-hosted `Whitney`, `Graphik Web`, `DIN Pro`, and `Monument Grotesk Mono` (`400/500/600` only, `font-synthesis: none`), `:where(#ui)` resets, frosted glass translucent tokens, dense caregiver tokens (`34px` rows / `32px` controls), and `.high-contrast` / `.reduced-motion` overrides.
- **`MODIFY` `apps/veer-wonder-world/tools/make-portraits.sh` & `apps/veer-wonder-world/src/portrait-assets.ts`** — Generate crisp 5.5.1-lit `256x256` character portraits + 6 `320x200` world thumbnail WebPs (`WORLD_THUMBNAIL_URLS`).
- **`MODIFY` `apps/veer-wonder-world/src/ui/{start-screen,episode-menu,captions,child-controls,parent-panel,parent-wordlist,offline-card}.ts`** — Implement live 3D diorama start screen, world-filtered thumbnail menu with focus-word stars, karaoke target-word caption pills, radial wait-arc on `"Had a turn"`, dense `34px`-row caregiver sheet, and target-word recap chips on `offline-card.ts`.

### Lane G — Targeted Unit, Motion-Gate & Visual Look-Dev Verification Updates (`WP-8`)
- **`MODIFY` `apps/veer-wonder-world/tests/unit/ui/strings.test.ts`** — Update font-family contract check for the 4 licensed families (`Whitney`, `Graphik Web`, `DIN Pro`, `Monument Grotesk Mono`) while keeping strict weight `["400", "500", "600"]`, contrast `>= 4.5:1`, zero `.innerHTML`, and zero timer checks.
- **`MODIFY` `apps/veer-wonder-world/tests/unit/runtime/episode-director.test.ts` & `tests/unit/stage/motion.test.ts`** — Add targeted unit coverage for `responseByTarget` choice branching, `roundVariants` 1–3 progression, `speechEnergy` syllable envelope determinism, articulated sub-part poses, and **headless `runMotionGate` verification at `60`, `120`, and `144` Hz**.
- **`MODIFY` `tests/browser/wonder-world-look.spec.ts`** — Assert upgraded saturation/colourfulness floors (Learning Cloud `s >= 0.24`, 0 `WGSL_PROGRAM_MISSING` / `CUSTOM_SHADER_WGSL_MISSING` / `OPTION_IGNORED` diagnostics, and paired WebGPU + `?backend=webgl2` captures).

---

## 11. Section 8 — Sequenced & Parallelizable Implementation Roadmap (`WP-1`..`WP-10`)

```
Wave 1 (Foundation — Parallel):      [WP-1 Engine 5.5.1 & Build]  ||  [WP-2 PBR Assets, Retexture & Envelopes]  ||  [WP-5 Director Choice/Round Schema]
                                                    \                        |                        /
Wave 2 (3D, Cast, Content, UI — Parallel):  [WP-3 6 Worlds Dioramas] || [WP-4 Articulated Cast] || [WP-6 12 Games + 20 Stories] || [WP-7 10/10 UI/UX & Fonts]
                                                                    \        |        /
Wave 3 (Integration & CODE_COMPLETE_GO):                        [WP-8 Stage Integration & Unit/Motion Gates]
                                                                             |
Wave 4 (Remote GPU Look-Dev & Deploy):                    [WP-9 Remote GPU Visual QA] -> [WP-10 Cloudflare Pages Deploy]
```

### `WP-1` — Aura3D `5.5.1` Engine, Vite Plugin, HDRI & CSP Foundation *(Wave 1, Parallel)*
1. Update `tools/published-deps.json` and `tools/deploy-build.sh` to `5.5.1`; run `apps/veer-wonder-world/tools/install-published-deps.sh` when standalone published-dep checks are needed.
2. Wire `aura3d({ physics: "auto", decoders: { codecs: ["basis", "draco", "meshopt"] } })` in `vite.config.ts`, expand shared HDRI & licensed `.woff2` copy lists, update `public/_headers` CSP for KTX2 worker WASM, and add `backend` flag parsing in `src/runtime/feature-flags.ts` + `src/scenes/vfx-presets.ts`.
3. Update `provenance/hdri.json` and `src/assets/rights-manifest.ts` with SHA-256 hashes for all 7 copied CC0 HDRIs.

### `WP-2` — 2K PBR Texture Restoration, Region Recoloring, Articulated Meshes & Audio Envelopes *(Wave 1, Parallel)*
1. Update `tools/admit-models.mjs` to preserve `normal`, `metallicRoughness`, and `occlusion` maps (KTX2/WebP `2048px` cast, `1024px` props/animals/buildings).
2. Run `tools/recolor-atlas-regions.mjs` to fix the 19 pale Meshy textures without tinting eyes/windows and recolor `barn` to classic red/cream; verify geometry integrity with `.agents/skills/aura3d-retexture/references/geometry-hash.mjs`.
3. Run `tools/build-articulated-cast.mjs` to partition articulated sub-nodes on all 6 characters + wheeled/hinged props and admit the remaining procedural props; regenerate `src/aura-assets.ts` (`node apps/veer-wonder-world/tools/gen-aura-assets.mjs`).
4. Extend `tools/gen-audio-manifest.mjs` and regenerate `src/audio-manifest.ts` with `20 Hz` Base64 `env` syllable envelopes.

### `WP-3` — Blender-Cycles Overhaul of All 6 Worlds & Responsive Framing *(Wave 2, Parallel)*
1. Build `src/scenes/diorama-terrain.ts` (flat `r <= 3.2m` playfield + sculpted bevelled island rim, spline paths, WebGPU-native clay/felt/lacquer/ceramic/wood helpers).
2. Upgrade `src/scenes/looks.ts` (6 distinct `AuraHdriId`s, three-point key/rim/fill, PCSS `2048` shadows, `ambientOcclusion`, `contactShadows`, `fog`, `sky.gradient`, tier-gated `tiltShift` DoF) and `src/scenes/spots.ts` (Reversed-Z depth + portrait framing curve).
3. Rebuild `meadow.ts`, `music-garden.ts`, `home-nook.ts`, `station.ts`, `peekaboo-barn.ts`, and `learning-cloud.ts` with GPU `wind`, deterministic cloud drift, Home Nook lamp/window lights, Barn `world.water` pond, and Learning Cloud spline rainbow.

### `WP-4` — Articulated Character Animation & Syllable-Synced Speech *(Wave 2, Parallel)*
1. Implement `src/scenes/articulated-actors.ts` (sub-node pose driver, natural deterministic blinks, `yawToFace` head/pupil gaze tracking, arc-length wheel rotation, hinged doors/lids/cab/petals, and `createAnimationController` + `sampleAuraVoiceBridgeAtTime` support).
2. Upgrade `momo.ts`, `lulu.ts`, `sheru.ts`, `peeko.ts`, `lumi.ts`, `gogo.ts`, `character-registry.ts`, `motion.ts`, and `stand-ins.ts` (including thin-film iridescent `"bubble"`).
3. Connect `narration-player.ts` -> `animation-director.ts` `speechEnergy(actorId)` to drive syllable-accurate jaw/beak/cheek/nod motion.

### `WP-5` — Choice-Branching & Multi-Round Director Upgrade *(Wave 1, Parallel)*
1. Add `BeatSpec.responseByTarget` and `ActivitySpec.roundVariants` to `src/types.ts`, `src/runtime/episode-director.ts`, `src/runtime/turn-taking.ts`, and `src/content/schema.ts` (supporting up to `15000 ms` `waitMs` for `g12`), maintaining 100% deterministic replay and zero-input completion.

### `WP-6` — 10/10 Choreography Across All 12 Games (`g01`–`g12`) & 20 Episodes (`e01`–`e20`) *(Wave 2, Parallel after `WP-5`)*
1. Upgrade all 12 files in `src/content/activities/*.ts` per Section 6.2 (fixing `g01` individual pop, `g02` visible carriage boarding & continuous loop, `g03` rolling fetch variants, `g04` red barn double-door + tappable animals, `g05` real apple/banana choice, `g06` 4-stage car wash, `g07` moving lift cab, `g08` tap-to-drop block stacking, `g09` 3-visitor doorbell rotation, `g10` drum+shaker choice, `g11` smooth petal bloom, and `g12` immediate interactive Sheru wait).
2. Upgrade all 20 files in `src/content/episodes/*.ts` per Section 6.3 (`e01` glass mirror, `e07`/`e10`/`e12`/`e18`/`e20` choice branching, `e15` animals inside bubbles, `e16` candle light+smoke, `e19` morning-to-bedtime light transitions).

### `WP-7` — 10/10 Co-Play UI/UX & Licensed Typography (`src/ui/*`) *(Wave 2, Parallel)*
1. Create `src/ui/fonts.css` and update `src/ui/styles.css` with licensed `Whitney`, `Graphik Web`, `DIN Pro`, and `Monument Grotesk Mono` (`400/500/600` only, `font-synthesis: none`, `:where(#ui)` specificity `0`, dense caregiver tokens, `.high-contrast` & `.reduced-motion`).
2. Upgrade `start-screen.ts` (frosted card over live 3D Momo Meadow), `episode-menu.ts` (world filter pills + world thumbnails + focus-word star badges), `captions.ts` (speaker avatar + karaoke target-word highlight), `child-controls.ts` (radial wait-arc on `"Had a turn"`), `parent-panel.ts` (`34px` compact rows / `32px` controls), and `offline-card.ts` (target-word recap chips).

### `WP-8` — Stage Integration, Static Guards, Unit Suite & `CODE_COMPLETE_GO` Freeze *(Wave 3, Sequential Integration)*
1. Integrate `WP-1..WP-7` in `src/scenes/stage.ts` and `src/app.ts` (`createGame` WebGPU + AgX, `shadows.blobShadow`, SDF target ripples, 4-stage car material state, E01 planar-clipped mirror, `createFixedStepPresenter` + `createRecordBlend`).
2. Update `tests/unit/ui/strings.test.ts`, `tests/unit/runtime/episode-director.test.ts`, and `tests/unit/stage/motion.test.ts` (`runMotionGate` at `60`, `120`, `144` Hz).
3. Run all Phase A local deterministic checks (`tsc`, `validate-wonder-world-content.mjs`, `vitest`, `game-checks.mjs`, generated-files diff, Vite build + `check-dist.mjs`) to `0` errors and freeze `CODE_COMPLETE_GO`.

### `WP-9` — Remote GPU Look-Dev Loop & Browser Gate Verification *(Wave 4, Post-`CODE_COMPLETE_GO`)*
1. Regenerate 5.5.1 character portraits & world thumbnails (`tools/make-portraits.sh`) and run remote browser suites via `apps/veer-wonder-world/tools/remote-run.sh` (`first-frame build`, `look`, `characters`, `touch-and-layout`, `start-screen`, `playback-activities`, `playback-episodes`, `low-motion`) plus loopback real-GPU Chrome CDP check across both WebGPU (`backend: "auto"`) and WebGL2 (`?backend=webgl2`), driving every `aura3d-art-direction` rubric category to `>= 8.5–10/10` (`0` `aura3d look lint` errors).

### `WP-10` — Production Cloudflare Pages Deployment & Live Readback *(Wave 4, Post-`CODE_COMPLETE_GO`)*
1. Build and deploy to Cloudflare Pages (`aura3d-wonder-world` `--branch main`) using `apps/veer-wonder-world/tools/deploy-build.sh` + `wrangler pages deploy`, then run `apps/veer-wonder-world/tools/remote-run.sh live` to verify HTTP `200`, `X-Robots-Tag: noindex`, KTX2/HDRI/WOFF2/GLB/MP3 MIME headers, and `0` runtime errors on production.

---

## 12. Verification & Acceptance Checklist (`- [ ]`)

### Phase A — `CODE_COMPLETE_GO` Gate (Deterministic & Proportional — Required Before Freeze)
- [ ] **File & Symbol Completeness:** Every `CREATE` and `MODIFY` target in Section 10 implemented completely with zero `TODO`s, mock stubs, `console.*`, `.innerHTML`, `Math.random`, `Date.now`, or unlisted `as T` casts (`tests/unit/privacy/source-guards.test.ts`).
- [ ] **Strict Workspace & Published Typechecks:**
  `pnpm exec tsc -p apps/veer-wonder-world/tsconfig.json --noEmit` and `apps/veer-wonder-world/node_modules/.bin/tsc -p apps/veer-wonder-world/tsconfig.published.json --noEmit` exit `0`.
- [ ] **Generated Asset & Audio Manifest Sync:**
  `node apps/veer-wonder-world/tools/gen-aura-assets.mjs && node apps/veer-wonder-world/tools/gen-audio-manifest.mjs && git diff --exit-code apps/veer-wonder-world/src` exits `0`.
- [ ] **J14 All-32-Story Content & Rights Validator:**
  `node apps/veer-wonder-world/tools/validate-wonder-world-content.mjs` exits `0` across all 20 episodes and 12 activities (`responseByTarget`, `roundVariants`, 1-to-1 counts, letter name-vs-sound, SHA-256 provenance).
- [ ] **Unit Suite, Privacy Guards & Headless `runMotionGate` (60 / 120 / 144 Hz):**
  `pnpm exec vitest run --config apps/veer-wonder-world/vitest.config.ts` and `node apps/veer-wonder-world/tools/game-checks.mjs` exit `0` (`maxStillFraction <= 0.05` at 120 Hz & 144 Hz, `0` child-name or domain leaks).
- [ ] **Production Bundle, Safari 15 Lowering & Static Deploy Gate:**
  `bash apps/veer-wonder-world/tools/deploy-build.sh` exits `0` (Rapier WASM stripped via `physics: "auto"`, `noindex` intact, `0` source maps, `@aura3d/cli@5.5.1 check-deploy --dist dist --no-assets` green).

### Phase B — Post-`CODE_COMPLETE_GO` Remote GPU Visual QA & Cloudflare Pages Deployment
- [ ] **Real-GPU WebGPU & WebGL2 Parity + Look Lint:** Loopback Chrome CDP & `npx @aura3d/cli@5.5.1 look lint` report `0` errors and `0` `WGSL_PROGRAM_MISSING` / `CUSTOM_SHADER_WGSL_MISSING` / `OPTION_IGNORED` / `KTX2_CSP_BLOCKED` warnings across all 6 worlds on both `backend=auto` (WebGPU) and `?backend=webgl2`, with draw calls `< 180` per world.
- [ ] **Remote ACR Visual & Functional Qualification (`tools/remote-run.sh`):**
  - `apps/veer-wonder-world/tools/remote-run.sh first-frame build`
  - `apps/veer-wonder-world/tools/remote-run.sh look` (all 6 worlds at `1024x768` & `390x844` scoring `>= 8.5/10` across lighting, shadows, materials, composition, and silhouette clarity; Learning Cloud saturation `s >= 0.24`)
  - `apps/veer-wonder-world/tools/remote-run.sh start-screen` (all 13 viewports scroll-free & collision-free)
  - `apps/veer-wonder-world/tools/remote-run.sh touch-and-layout` & `playback-activities` & `playback-episodes` & `low-motion`
  *(Verify `0` ephemeral cloud remnants after remote runs per AuraOne cloud lifecycle policy.)*
- [ ] **Canonical Cloudflare Pages Production Deployment & Live Smoke Readback:**
  ```bash
  source ~/.config/auraone/cloudflare-env.sh \
    && bash apps/veer-wonder-world/tools/deploy-build.sh \
    && wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch main
  apps/veer-wonder-world/tools/remote-run.sh live
  ```
