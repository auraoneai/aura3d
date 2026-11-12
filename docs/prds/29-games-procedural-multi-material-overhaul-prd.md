# PRD: 29 Remaining Showcase Games — From-Scratch Sculpted Multi-Material Procedural `@aura3d/engine` 5.5.1 Visual & Graphics Overhaul

**Execution Policy:** Authorized for immediate autonomous product code implementation (`CODE_COMPLETE_GO`).
**Target Engine & Backend:** 100% Native `@aura3d/engine` `5.5.1` + `@aura3d/engine/game` on WebGPU primary (`renderer: { backend: "auto" }`, paired GLSL 3.00 ES + WGSL custom shaders where authored) — **ZERO `three` / Three.js imports, packages, or runtime helpers anywhere (`pnpm check:no-three-runtime` mandatory)**, **ZERO single-mesh melted-clay Meshy GLBs for vehicles, props, buildings, stadiums, arenas, crowds, weapons, pickups, vegetation, rocks, or rigid actors**, and **ZERO lazy stacked-box "Lego" programmer art**.
**Reference Gold-Standard Implementation (Shipped Live in `8bf9eb5bb`):** [`apps/showcase-slingshot-siege/src/art/proceduralModels.ts`](../../apps/showcase-slingshot-siege/src/art/proceduralModels.ts) and [`apps/showcase-slingshot-siege/src/game/stage.ts`](../../apps/showcase-slingshot-siege/src/game/stage.ts) (`0` `model(...)` GLB calls, ~850 lines of curved splines/lathes/voussoir arches/layered boughs, 18 multi-lobe physical `material.*` shaders, Metal/WebGPU visual polish pass completed, `64/64` unit tests green, `0` art-direction audit violations, live at `https://aura3d.auraone.ai/apps/showcase-slingshot-siege/`).

> **Mandatory Execution & Anti-Loop Contract:**
> 1. **Read-Only Blueprint During Code Execution:** Executing agents and subagents must treat this PRD as a **read-only engineering blueprint** during implementation. Do NOT repeatedly edit/commit this `.md` file to tick checkboxes, rewrite status tables, or append run logs after each work package.
> 2. **Frozen Denominator (`31` Work Packages: `WP-00` Shared Sculpting Kernel & Craft Gate + `WP-01..WP-29` Disjoint Per-Game Full-Stack Visual Overhauls + `WP-30` Digest Sync, Build, All-30 Before/After Metal/WebGPU Gallery & Live Cloudflare Pages Cutover):** Executing agents must never shrink scope, cut boxy shortcuts, call external LLM/ChatGPT/Prism critic loops, or add new checkboxes/work packages to this PRD.

---

## 1. Executive Summary & Architectural Decisions

### Objective
Transform all **29 remaining live Aura3D showcase games** (18 standalone `apps/showcase-*` routes + 11 `replay-verified` `examples/*-port` games) by ripping out every single-mesh, muddy-atlas Meshy clay `.glb`/`.bin` blob (`*Meshy*`, static `setPieces.*`, `blacktop*`, `ballpark*`, `bz*Meshy`, borrowed cross-game sci-fi placeholders, rigid clay vehicles/buildings/islands/trees/boulders) and every raw 1–3 primitive placeholder (`box`/`cone`/`cylinder`/`sphere` soup). Replace them with **true curved, multi-part, multi-material sculpted 3D models (`geometry.define`, `geometry.multiMaterial`, `instances.custom`) AND the full advanced `@aura3d/engine` 5.5.1 graphics stack** (`material.carPaint`, `studioGlass`, `studioMetal`, `strata`, `caustics`, `lightBeam`, `planet`, `atmosphere`, `fabric`, `sneakerMesh`, `proceduralTexture`, `effects.volumetricBeam`, `effects.godRays`, `lights.lensFlare`, `effects.trail`, `effects.particles`, `effects.contactShadows`, `effects.ambientOcclusion`, calibrated `effects.screenSpaceReflections`, and paired GLSL 3.00 ES + WGSL custom shaders), verified through a **6-Wave Metal/WebGPU Visual Look-Dev & Polish Pipeline** so zero games ship looking flat, clay-baked, or blocky.

### Autonomous Architectural Decisions Resolved from Codebase Conventions
1. **Rich Shared Zero-Dependency Sculpting & Compound-Assembly Kernel (`WP-00` — `apps/showcase-port-shared/proceduralKernel.ts`):**
   - Extract and expand the proven sculpting kernel from `apps/showcase-slingshot-siege/src/art/proceduralModels.ts` into `apps/showcase-port-shared/proceduralKernel.ts` before spawning any game subagents.
   - Provides **both** low-level smooth spline/surface primitives (`catmullRomSpline3`, `bezierCurve2`, `loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`, `bevelBoxMesh`, `icosphereFacetMesh`, `toFlatShaded`, `transformMesh`) **and** reusable high-craft compound sub-assemblies (`wheelAssemblySlots` with 5-spoke forged alloy rims + brake rotors + chamfered rubber treads, `latticeTrussMesh` open X/Warren-braced steelwork, `archwayVoussoirSlots` dressed stone arches, `layeredCanopyMesh` & `coniferBoughTierMesh` multi-tier foliage, and `stratifiedCliffMesh` `fbm3` faceted rock strata) so subagents never resort to boxy cubes or lollipop sphere trees.
2. **Full-Spectrum Advanced `@aura3d/engine` 5.5.1 Graphics Stack on Every Game (Never Mesh-Swap Alone):**
   - Every game (`WP-01..WP-29`) must pair its sculpted `art/proceduralModels.ts` geometry with `@aura3d/engine`'s advanced rendering features tailored to its genre:
     - **Dual-lobe clearcoat & real glass (`material.carPaint`, `clearcoatPaint`, `studioGlass`, `frostedGlass`, `studioMetal`, `brushedMetal`):** Mandatory on all vehicles, drones, robotaxis, streetcars, helmets, visors, and backboards—never painted-on opaque gray windows.
     - **Geological & aquatic shaders (`material.strata`, `material.caustics`, custom paired GLSL+WGSL water/wet-ink/neon shaders):** Mandatory `material.strata` banding on canyon walls, mesas, hoodoos, lunar craters, and sky-island undercrofts; `material.caustics` / reflective water on harbors, rivers, millponds, and coves.
     - **Volumetrics, atmospheric limb scattering & flares (`material.lightBeam`, `effects.volumetricBeam`, `effects.godRays`, `lights.lensFlare`, `material.planet`, `material.atmosphere`):** Mandatory on night stadium floodlight towers, coastal lighthouses, concert stage beams, robotaxi hail beacons, sunlit forest clearings, and orbital/lunar horizons.
     - **Surface-calibrated post-processing (`effects.ambientOcclusion` + `effects.contactShadows` + `effects.bloom` + `effects.colorGrade` + tuned `effects.screenSpaceReflections`):** Strong SSR (`intensity: 0.28–0.42`) on wet asphalt, polished hardwood courts, and neon glass decks; capped SSR (`intensity <= 0.12` or omitted) on matte grass, clay, sand, snow, and clouds.
3. **Skinned Character Restyling + Sculpted Bone-Socketed Gear (Zero Untouched Clay Athletes or Fighters):**
   - **Rip Out 100% of Static/Unrigged Meshy Blobs & Raw Placeholders:** Every rigid vehicle, drone, bike, tram, car, building, stadium, bleacher, tower, crane, floodlight, barricade, weapon, pickup, gate, tree, cliff, boulder, cloud, rigid passenger/enemy, and standing/seated crowd batch is built 100% procedurally from scratch.
   - **Upgrade Preserved `skins=1` Skeletal Rigs Visually & Geometrically:** Where gameplay and unit tests depend on a 15–24 joint `AnimationController` / 2-bone IK skeleton (`Aura Hoops 3D`, `Aura Diamond 3D`, `Aura FC 3D`, `Aura Links 3D`, `Iron Crown`, `Pip's Big Leap`, `Bunker Zero` 4 enemies, `Cross Hop` 12 critters, `Serpentine Sky Run`, `Shadowstep Gauntlet`, `The Bellkeeper's Walk`, `Duneglide`, `Cumulus Dash`), preserve the bone-animated skeleton AND upgrade its visual presentation: (a) replace chalky clay diffuse overrides with physical `material.fabric` sheen on kits/gis/tunics, `material.sneakerMesh`/`sneakerRubber` on footwear, natural skin speculars, and crisp `rim` backlight separation, and (b) sculpt multi-material procedural 3D gear, helmets, batting caps, visors, weapons, ash bats, leather mitts, titanium drivers, hoverboards, capes, and racquets (`Aura Slam 3D`'s 28-node IK athlete gets 100% anatomical `latheMesh` limbs, collared polo, pleated shorts, contoured sneakers, and bevelled oval graphite racquet!).
4. **Wave-Gated 2-Pass Metal/WebGPU Visual Look-Dev & Hard Anti-Lego Craft Gate (Prevents Subagent Shortcuts):**
   - Never run a blind 29-subagent blast that ships uninspected first-draft geometry. Execution runs in **6 Gated Waves** (`Wave 0` Kernel -> `Wave 1` 5-Genre Flagship Pilot -> `Waves 2–5` Genre Batches of 5–8 games -> `Wave 6` Final Sync & Prod Deploy).
   - Every game must pass **both** (a) `tests/unit/procedural-kernel/procedural-craft-gate.test.ts` (enforcing `>= 350` lines of curved/lofted/lathed/swept procedural code, `>= 4` distinct physical `material.*` lobes on hero assemblies, `0` lollipop trees, `0` box-only cars) **and** (b) **live Metal/WebGPU `1280×720` + `390×844` screenshot inspection (`read_file` on captured PNGs) + a mandatory targeted Visual Polish Pass** before advancing.
5. **Deterministic Simulation & Replay-Parity Isolation (`1e-6` / `1e-9` / `1e-12` Invariant on All 11 Ports):**
   - Across all 11 `replay-verified` ports (`WP-19..WP-29`), deterministic simulation state (`sim`, PRNG seeds, fixed-step integrators, collision radii/AABBs, and recorded replay verifiers) lives strictly outside visual node geometry. Subagents **MUST NOT** alter simulation step math, PRNG consumption order, physics collider extents, or recorded replay fixtures.
6. **Art-Direction Audit, Draw-Call Instancing & Licensed Typography Invariants:**
   - Every material with `emissiveIntensity > 0.1` on non-practical geometry must set `practical: true` (or stay `<= 0.1` for subtle cloud/sky rim lift) so `auditArtDirection` passes with **`0` violations**.
   - Static repeated world dressing (seats, crowd silhouettes, trees, rocks, lamps, traffic fleets, coins/orbs) **MUST** batch through `instances.custom(spec, { transforms, colors })` (1–4 GPU draw calls per prop family).
   - All HUD/title/results CSS strictly uses self-hosted `Whitney`, `DIN Pro` (`tabular-nums`), and `Monument Grotesk Mono`.

---

## 2. Current Codebase State & System Architecture

1. **Catalog & Route Architecture:**
   - All 30 live showcase games are registered in [`tools/site/games.catalog.json`](../../tools/site/games.catalog.json) and [`docs/workflows/game-inventory.json`](../../docs/workflows/game-inventory.json), built into `marketing/dist` by [`marketing/scripts/build-showcase-routes.mjs`](../../marketing/scripts/build-showcase-routes.mjs) against workspace `@aura3d/engine` (`packages/engine/src/public/index.ts`), and deployed to Cloudflare Pages (`aura3d` -> `https://aura3d.auraone.ai`).
   - **19 Standalone Showcase Apps** live in `apps/showcase-<slug>/src/` (`showcase-top-tennis` delegates to `examples/aura-slam/`; `showcase-slingshot-siege` is **DONE**; **18 remain** in `WP-01..WP-18`).
   - **11 Replay-Verified Ports** have route shells in `apps/showcase-<port>-port/` (synced from `examples/<folder>/index.html` via `node tools/showcase-port-pages/sync.mjs` and mapped by [`tools/showcase-port-pages/names.json`](../../tools/showcase-port-pages/names.json)) while their flat TS scene/shader/simulation modules live in `examples/<folder>/*.ts` and `examples/<folder>/art/*.ts` (**11 remain** in `WP-19..WP-29`).
2. **Why Earlier Passes Disappointed Visually — And How This Architecture Solves Both Failure Modes:**
   - **Failure Mode A (Surface-Only Post-Processing Over Melted Meshy Clay):** Tuning LUTs, bloom, and `materialOverrides` on single-mesh Meshy `.glb`s leaves painted-on gray windshields, melted fenders, inverted golf-cart backfaces (`Aura Links 3D`), broken dome UVs (`Aura Diamond 3D`), smeared AI camo basketballs (`Aura Hoops 3D`), and borrowed sci-fi FPS energy cores pretending to be woodland hearts (`Pip's Big Leap`).
   - **Failure Mode B (Lazy Stacked-Box Programmer Art):** Replacing GLBs with 3 unchamfered `primitives.box`es and 1 `primitives.cylinder` looks like 1998 debug geometry.
   - **Proven Cure (`Slingshot Siege` `8bf9eb5bb`):** Smooth cubic splines (`catmullRomSpline3`), cross-section lofts (`loftSectionsMesh`), revolved lathes (`latheMesh`), open lattice steelwork (`latticeTrussMesh`), 4–8 physical `material.*` lobes (`carPaint`, `studioGlass`, `studioMetal`, `strata`, `caustics`, `lightBeam`), and a mandatory **Metal/WebGPU screenshot critique + polish pass** deliver crisp Blender Eevee-grade silhouettes, real glass/metal reflections, and instant zero-GLB-stall boot.

---

## 3. Shared Procedural Sculpting Kernel & Anti-Disappointment Craft Contracts (`WP-00`)

### 3.1 `apps/showcase-port-shared/proceduralKernel.ts` (`CREATE`)

All 29 game modules (`apps/showcase-*/src/art/proceduralModels.ts` and `examples/*/art/proceduralModels.ts`) import from `apps/showcase-port-shared/proceduralKernel.ts`:

```ts
import type {
  AuraColor,
  AuraCustomGeometrySpec,
  AuraGroupNode,
  AuraMaterialSpec,
  AuraNodeBuilder
} from "@aura3d/engine";

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type V4 = readonly [number, number, number, number]; // [x, y, z, radius]

export interface RawMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
}

export interface TransformOpts {
  readonly pos?: V3;
  readonly rot?: V3; // Euler XYZ radians
  readonly scale?: number | V3;
}

export interface MultiMatSlot {
  readonly mesh: RawMesh;
  readonly materialIndex: number;
}

/** Deterministic hash, 3D FBM noise & smooth spline evaluators (bans kinked low-segment polylines). */
export function hash01(seed: number): number;
export function fbm3(x: number, y: number, z: number, seed?: number): number;
export function catmullRomSpline3(points: readonly V3[], segmentsPerSpan?: number, closed?: boolean): V3[];
export function bezierCurve2(p0: V2, p1: V2, p2: V2, p3: V2, segments?: number): V2[];

/** Rigid transform (pos + Euler XYZ + scale with inverse-transpose normal & negative-det winding flip) + flat-shading. */
export function transformMesh(src: RawMesh, opts?: TransformOpts): RawMesh;
export function toFlatShaded(src: RawMesh): RawMesh;

/** Core curved, bevelled, revolved, swept & lofted surface builders. */
export function bevelBoxMesh(wx: number, wy: number, wz: number, bevel?: number): RawMesh;
export function latheMesh(profile: readonly V2[], radialSegments?: number, flatShaded?: boolean): RawMesh;
export function tubeSweepMesh(spine: readonly V4[], radialSegments?: number, flatShaded?: boolean): RawMesh;
export function extrudePolygonMesh(ccwRing: readonly V2[], height: number, bevel?: number, flatShaded?: boolean): RawMesh;
export function loftSectionsMesh(sections: readonly (readonly V3[])[], capEnds?: boolean, flatShaded?: boolean): RawMesh;
export function icosphereFacetMesh(radius: number, detail?: 0 | 1 | 2, noiseAmp?: number, seed?: number): RawMesh;

/** High-craft reusable compound sub-assemblies (eliminates Lego wheels, solid-block trusses & lollipop trees). */
export function wheelAssemblySlots(opts: {
  readonly radius: number;
  readonly width: number;
  readonly spokeCount?: number; // default 5
  readonly tireMat: number;
  readonly rimMat: number;
  readonly rotorMat?: number;
}): MultiMatSlot[];

export function latticeTrussMesh(opts: {
  readonly span: V3; // [wx, wy, wz]
  readonly bays: number;
  readonly chordRadius: number;
  readonly braceRadius?: number;
}): RawMesh;

export function archwayVoussoirSlots(opts: {
  readonly radius: number;
  readonly thickness: number;
  readonly depth: number;
  readonly voussoirs?: number;
  readonly stoneMatA: number;
  readonly stoneMatB: number;
  readonly keystoneMat: number;
}): MultiMatSlot[];

export function layeredCanopyMesh(opts: {
  readonly radius: number;
  readonly height: number;
  readonly puffs?: number;
  readonly seed?: number;
}): RawMesh;

export function coniferBoughTierMesh(opts: {
  readonly baseRadius: number;
  readonly height: number;
  readonly tiers?: number; // default 5 scalloped drooping bough tiers
  readonly seed?: number;
}): RawMesh;

export function stratifiedCliffMesh(opts: {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly height: number;
  readonly terraces?: number;
  readonly seed?: number;
}): RawMesh;

/** Spec & node assemblers (`geometry.define` / `geometry.multiMaterial` / `instances.custom`). */
export function mergeRawMeshes(meshes: readonly RawMesh[]): AuraCustomGeometrySpec;
export function buildGroupedGeometrySpec(slots: readonly MultiMatSlot[]): AuraCustomGeometrySpec;
export function assembleMultiMaterialNode(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  options?: {
    readonly id?: string;
    readonly tags?: readonly string[];
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly visible?: boolean;
  }
): AuraNodeBuilder<AuraGroupNode>;
```

### 3.2 Hard Anti-Lego / Anti-Shortcut Reject Rules (Automated + Visual Gate)

| Domain | BANNED Lazy Shortcut (Automatic Rejection) | MANDATORY `@aura3d/engine` 5.5.1 Craft Standard |
|---|---|---|
| **Vehicles, Drones & Trams** | Stacking 2–3 `bevelBoxMesh` bricks + flat cylinder wheels + painted gray window rectangles | Smooth `loftSectionsMesh` curved fenders/fuselage + separate `material.studioGlass` greenhouse/canopy + `wheelAssemblySlots` 5-spoke `studioMetal` rims & chamfered `blackRubber` tires + splitter/grille/pantograph + `practical: true` headlamps/taillights/thrusters (`5–8` material lobes) |
| **Stadiums, Bridges & Towers** | Solid gray `primitives.box` slabs for floodlight masts, gantries, cranes, roofs, or bleachers | Open `latticeTrussMesh` 4-chord X-braced steel gantries + tiered seating decks with aisle handrails + `archwayVoussoirSlots` masonry arcades + hooded LED luminaire banks + `material.lightBeam` / `effects.volumetricBeam` |
| **Trees, Flora & Clouds** | Single `cylinder` + single `sphere` ("lollipop tree") or single smooth `cone` ("party-hat pine") | Flared root-collar `tubeSweepMesh` curved trunk + `layeredCanopyMesh` (7–11 staggered puffs) or `coniferBoughTierMesh` (4–6 scalloped drooping tiers) with `wind: true` |
| **Cliffs, Mesas & Sky Islands** | Stretched single sphere/box or untextured brown block | `stratifiedCliffMesh` `fbm3` terraced facets paired with `material.strata({ bands, colors, noise, slope })` + draped bevelled emerald/ochre crown cap |
| **Water, Harbors & Rivers** | Flat untextured blue plane | Custom wave/foam shader or `material.caustics` / `material.reflectiveFloor` with shoreline coping, wakes, and sky/IBL speculars |
| **Preserved Skinned Athletes/Fighters** | Leaving chalky Meshy diffuse wash untouched with sphere caps or cylinder bats/clubs | Physical `material.fabric` sheen on jerseys/gis, `sneakerMesh`/`sneakerRubber` shoes, crisp `rim` backlight, plus sculpted `latheMesh`/`extrudePolygonMesh` helmets, bats, mitts, drivers, racquets, crowns & weapons |
| **WebGPU Materials & SSR** | `brushedMetal` on lathed domes (UV rings), mirror SSR on grass/sand, or `clearcoat` on SDF `text3D` | `material.studioMetal` on curved/revolved domes; SSR capped `<= 0.12` (or omitted) on matte terrain & `0.28–0.42` on wet asphalt/hardwood; `material.pbr` only on `backend: "sdf"` `text3D`; zero `material.rubber` on masonry |

---

## 4. File-by-File Breakdown (`CREATE` / `MODIFY` Inventory Across All 31 Work Packages)

> **Cross-Cutting Asset-Manifest & Provenance Rule (Applies to All 29 Games):**
> **NEVER delete `.glb` / `.bin` files on disk or mutate repo-root `aura.assets.json` / repo-root `src/aura-assets.ts`**, and keep route-local `src/aura-assets*.ts` / `models.ts` / `assets.ts` manifest exports intact where cross-cutting provenance, hash, or likeness suites (`tests/unit/likeness-audit/*`, `tests/unit/athletes-rebuild/skin.test.ts`, `tests/unit/aura-hoops/original-asset-integrity.test.ts`, `tests/unit/pips-big-leap/{shared-assets,certification-provenance}.test.ts`, `tests/unit/silt-and-signal-port/terrain.test.ts`, `tests/unit/ninja-runner-port/models.test.ts`) inspect them. Rip `model(...)` and `instances.model(...)` calls out of the **scene/stage/world builders**, mount procedural `@aura3d/engine` `geometry.multiMaterial` / `geometry.custom` / `instances.custom` assemblies from `art/proceduralModels.ts`, and prune `art/direction.ts` `assets` arrays down to only genuinely mounted skinned/rigged GLBs so `auditArtDirection` passes with `0` violations.

| WP | Game Title (Catalog Slug) | Primary Procedural Module (`CREATE`) | Scene / Stage / Test Files (`MODIFY` — Strictly Disjoint Ownership) |
|---|---|---|---|
| `WP-00` | Shared Sculpting Kernel & Craft Gate | `apps/showcase-port-shared/proceduralKernel.ts` | `tests/unit/procedural-kernel/{procedural-kernel.test.ts,procedural-craft-gate.test.ts}` (`CREATE`) |
| `WP-01` | Aura Slam 3D (`top-tennis`) | `examples/aura-slam/art/proceduralModels.ts` | `examples/aura-slam/view/{scene.ts,spectators.ts,athleteRig.ts}`, `examples/aura-slam/art/direction.ts`, `apps/showcase-top-tennis/src/main.ts`, `tests/unit/aura-slam/render-scene.test.ts` |
| `WP-02` | Apex Overdrive (`roadster-rush`) | `apps/showcase-roadster-rush/src/art/proceduralModels.ts` | `apps/showcase-roadster-rush/src/main.ts`, `apps/showcase-roadster-rush/src/render/{pylons.ts,dressing.ts,gantry.ts}`, `apps/showcase-roadster-rush/src/art/direction.ts`, `tests/unit/roadster-rush-native/art-direction.test.ts` |
| `WP-03` | Thermal Drift (`heatsink`) | `apps/showcase-heatsink/src/art/proceduralModels.ts` | `apps/showcase-heatsink/src/{scene.ts,skyline.ts}`, `apps/showcase-heatsink/art/direction.ts`, `tests/unit/heatsink/{scene.test.ts,art-direction.test.ts}` |
| `WP-04` | Grid Dispatch (`teleoperator`) | `apps/showcase-teleoperator/src/art/proceduralModels.ts` | `apps/showcase-teleoperator/src/scene.ts`, `apps/showcase-teleoperator/src/art/direction.ts`, `tests/unit/teleoperator/{scene.test.ts,art-direction.test.ts}` |
| `WP-05` | Iron Crown (`iron-crown`) | `apps/showcase-iron-crown/src/art/proceduralModels.ts` | `apps/showcase-iron-crown/src/game/{stages.ts,backdrop.ts}`, `apps/showcase-iron-crown/src/art/direction.ts`, `tests/unit/iron-crown/{stage-assets.test.ts,stage-dressing.test.ts,backdrop.test.ts,art-direction.test.ts}` |
| `WP-06` | Pip's Big Leap (`pips-big-leap`) | `apps/showcase-pips-big-leap/src/art/proceduralModels.ts` | `apps/showcase-pips-big-leap/src/game/{world.ts,diorama.ts}`, `apps/showcase-pips-big-leap/art/direction.ts`, `tests/unit/pips-big-leap/{props.test.ts,art-direction.test.ts}` |
| `WP-07` | Aura Hoops 3D (`aura-hoops-3d`) | `apps/showcase-aura-hoops-3d/src/art/proceduralModels.ts` | `apps/showcase-aura-hoops-3d/src/{main.ts,setPieces.ts,courtRigs.ts,crowd.ts}`, `apps/showcase-aura-hoops-3d/art/direction.ts`, `tests/unit/aura-hoops/art-direction.test.ts` |
| `WP-08` | Aura Diamond 3D (`aura-diamond-3d`) | `apps/showcase-aura-diamond-3d/src/art/proceduralModels.ts` | `apps/showcase-aura-diamond-3d/src/scene.ts`, `apps/showcase-aura-diamond-3d/art/{crowd.ts,horizon.ts,direction.ts}`, `tests/unit/aura-diamond/{crowd.test.ts,art-direction.test.ts}` |
| `WP-09` | Aura FC 3D (`aura-fc-3d`) | `apps/showcase-aura-fc-3d/src/art/proceduralModels.ts` | `apps/showcase-aura-fc-3d/src/game/scene.ts`, `apps/showcase-aura-fc-3d/art/direction.ts`, `tests/unit/aura-fc-3d/{audit-fixes.test.ts,art-direction.test.ts}` |
| `WP-10` | Aura Links 3D (`aura-links-3d`) | `apps/showcase-aura-links-3d/src/art/proceduralModels.ts` | `apps/showcase-aura-links-3d/src/main.ts`, `apps/showcase-aura-links-3d/src/game/rig.ts`, `apps/showcase-aura-links-3d/art/direction.ts`, `tests/unit/aura-links-3d/art-direction.test.ts` |
| `WP-11` | Bunker Zero (`bunker-zero`) | `apps/showcase-bunker-zero/src/art/proceduralModels.ts` | `apps/showcase-bunker-zero/src/{main.ts,weapons-view.ts}`, `apps/showcase-bunker-zero/src/art/direction.ts`, `tests/unit/bunker-zero/art-direction.test.ts` |
| `WP-12` | Glint Courier (`dot-dash-3d`) | `apps/showcase-dot-dash-3d/src/art/proceduralModels.ts` | `apps/showcase-dot-dash-3d/src/game/world.ts`, `apps/showcase-dot-dash-3d/src/art/direction.ts` |
| `WP-13` | Cross Hop (`cross-hop`) | `apps/showcase-cross-hop/src/art/proceduralModels.ts` | `apps/showcase-cross-hop/src/game/core.ts`, `apps/showcase-cross-hop/src/art/direction.ts`, `tests/unit/cross-hop/gu47-shade.test.ts` |
| `WP-14` | Shape Shift Sprint (`shape-shift-sprint`) | `apps/showcase-shape-shift-sprint/src/art/proceduralModels.ts` | `apps/showcase-shape-shift-sprint/src/{world.ts,scenery.ts}`, `apps/showcase-shape-shift-sprint/src/art/direction.ts`, `tests/unit/shape-shift-sprint/meshy-dressing.test.ts` |
| `WP-15` | Number Surge (`number-surge`) | `apps/showcase-number-surge/src/art/proceduralModels.ts` | `apps/showcase-number-surge/src/{roadside.ts,world.ts,scenery.ts}`, `apps/showcase-number-surge/src/art/direction.ts`, `tests/unit/number-surge/roadside.test.ts` |
| `WP-16` | Splat Turf (`splat-turf`) | `apps/showcase-splat-turf/src/art/proceduralModels.ts` | `apps/showcase-splat-turf/src/{world.ts,scenery.ts}`, `apps/showcase-splat-turf/src/art/direction.ts` |
| `WP-17` | Polarity Orbs (`polarity-orbs`) | `apps/showcase-polarity-orbs/src/art/proceduralModels.ts` | `apps/showcase-polarity-orbs/src/{backdrop.ts,world.ts}`, `apps/showcase-polarity-orbs/src/art/direction.ts`, `tests/unit/polarity-orbs/art-direction.test.ts` |
| `WP-18` | Beat Hopper (`beat-hopper`) | `apps/showcase-beat-hopper/src/art/proceduralModels.ts` | `apps/showcase-beat-hopper/src/{dressing.ts,meshes.ts,stage.ts,world.ts}`, `apps/showcase-beat-hopper/src/art/direction.ts` |
| `WP-19` | Craterline GP (`craterline-gp`) | `examples/strange-orbit-port/art/proceduralModels.ts` | `examples/strange-orbit-port/{world.ts,models.ts}`, `tests/unit/strange-orbit-port/art-direction.test.ts` |
| `WP-20` | Splat (`splat-rush-port`) | `examples/splat-rush-port/art/proceduralModels.ts` | `examples/splat-rush-port/{backdrop.ts,pickups.ts}`, `examples/splat-rush-port/art/direction.ts`, `tests/unit/splat-rush-port/meshy-presentation.test.ts` |
| `WP-21` | Serpentine Sky Run (`serpentine-sky-run-port`) | `examples/saiyan-snake-way-port/art/proceduralModels.ts` | `examples/saiyan-snake-way-port/{world.ts,models.ts}`, `examples/saiyan-snake-way-port/art/direction.ts` |
| `WP-22` | Gridlock Courier (`drift-and-deliver-port`) | `examples/drift-and-deliver-port/art/proceduralModels.ts` | `examples/drift-and-deliver-port/{vehicles.ts,look.ts,props.ts,main.ts}`, `examples/drift-and-deliver-port/art/direction.ts`, `tests/unit/drift-and-deliver-port/hero-car.test.ts` |
| `WP-23` | Ion Circuit (`heatsink-port`) | `examples/heatsink-port/art/proceduralModels.ts` | `examples/heatsink-port/{models.ts,world.ts}`, `examples/heatsink-port/art/direction.ts` |
| `WP-24` | Shadowstep Gauntlet (`ninja-runner-port`) | `examples/ninja-runner-port/art/proceduralModels.ts` | `examples/ninja-runner-port/{scenery.ts,setpieces.ts,world.ts}`, `examples/ninja-runner-port/art/direction.ts` |
| `WP-25` | Lamplight Line (`last-train-port`) | `examples/last-train-port/art/proceduralModels.ts` | `examples/last-train-port/{world.ts,townkit.ts,main.ts}`, `apps/showcase-last-train-port/art/direction.ts` |
| `WP-26` | Saltwind Highway (`roadster-hours-port`) | `examples/roadster-hours-port/art/proceduralModels.ts` | `examples/roadster-hours-port/{cars.ts,world.ts,roadsterRig.ts}`, `examples/roadster-hours-port/art/{landmarks.ts,direction.ts}` |
| `WP-27` | The Bellkeeper's Walk (`where-the-wind-wanders-port`) | `examples/where-the-wind-wanders-port/art/proceduralModels.ts` | `examples/where-the-wind-wanders-port/{scenery.ts,models.ts,world.ts,main.ts}`, `examples/where-the-wind-wanders-port/art/direction.ts` |
| `WP-28` | Duneglide (`silt-and-signal-port`) | `examples/silt-and-signal-port/art/proceduralModels.ts` | `examples/silt-and-signal-port/{architecture.ts,world.ts}`, `examples/silt-and-signal-port/art/direction.ts` |
| `WP-29` | Cumulus Dash (`cloud-runner-port`) | `examples/kid-goku-beyond-the-clouds-port/art/proceduralModels.ts` | `examples/kid-goku-beyond-the-clouds-port/{creatures.ts,props.ts,world.ts}`, `examples/kid-goku-beyond-the-clouds-port/art/direction.ts` |
| `WP-30` | Site Sync, GPU Verification & Live Cutover | *(Generated digests & port shells)* | `tests/fixtures/native-examples-catalog/expectations.json` (via `refresh-catalog-digests.mjs`), `apps/showcase-*-port/index.html` (via `sync.mjs`), `marketing/dist` deploy |

---

## 5. Detailed Implementation Tasklist (`WP-00..WP-30` — Parallel Swarm Execution Blueprint)

### 6-Wave Gated Look-Dev & Metal/WebGPU Visual Polish Schedule (Zero Blind 29-Agent Rush)
> **Anti-Disappointment Execution Law:** Never blast all 29 games in one uninspected pass. Execute in **6 gated waves** below. At the end of **every** wave (`Waves 1–5`), the coordinator builds the touched routes, captures real Metal/WebGPU `1280×720` + `390×844` gameplay screenshots via loopback CDP, **visually inspects every PNG via `read_file`**, and dispatches an immediate **Visual Polish Pass** fixing any boxy proportion, UV ring, wet-grass SSR glare, floating mesh, or low-contrast sign before starting the next wave.

- **Wave 0 (`WP-00` — Parent Agent):** Build `apps/showcase-port-shared/proceduralKernel.ts` (splines, lofts, lathes, 5-spoke `wheelAssemblySlots`, `latticeTrussMesh`, `archwayVoussoirSlots`, `layeredCanopyMesh`, `coniferBoughTierMesh`, `stratifiedCliffMesh`) + `procedural-kernel.test.ts` + `procedural-craft-gate.test.ts`.
- **Wave 1 — 5-Genre Flagship Pilot (`WP-02` Apex Overdrive, `WP-07` Aura Hoops 3D, `WP-06` Pip's Big Leap, `WP-11` Bunker Zero, `WP-25` Lamplight Line):** Prove the sculpting + advanced shader bar across Supercars, Streetball Venues, Storybook Dioramas, Tactical FPS, and Ghibli Coastal Ports -> Metal/WebGPU screenshot `read_file` critique + Visual Polish Pass.
- **Wave 2 — Remaining Racers, AV Fleets & Sci-Fi Combat (`WP-03` Thermal Drift, `WP-04` Grid Dispatch, `WP-19` Craterline GP, `WP-22` Gridlock Courier, `WP-23` Ion Circuit, `WP-26` Saltwind Highway):** 6 parallel subagents -> Metal/WebGPU screenshot `read_file` critique + Visual Polish Pass.
- **Wave 3 — Remaining Championship Sports & Fighting Arenas (`WP-01` Aura Slam 3D, `WP-05` Iron Crown, `WP-08` Aura Diamond 3D, `WP-09` Aura FC 3D, `WP-10` Aura Links 3D):** 5 parallel subagents -> Metal/WebGPU screenshot `read_file` critique + Visual Polish Pass.
- **Wave 4 — Stylized Adventure & Martial-Arts Ports (`WP-21` Serpentine Sky Run, `WP-24` Shadowstep Gauntlet, `WP-27` The Bellkeeper's Walk, `WP-28` Duneglide, `WP-29` Cumulus Dash):** 5 parallel subagents -> Metal/WebGPU screenshot `read_file` critique + Visual Polish Pass.
- **Wave 5 — Arcade Dioramas & Sky-Runners (`WP-12` Glint Courier, `WP-13` Cross Hop, `WP-14` Shape Shift Sprint, `WP-15` Number Surge, `WP-16` Splat Turf, `WP-17` Polarity Orbs, `WP-18` Beat Hopper, `WP-20` Splat):** 8 parallel subagents -> Metal/WebGPU screenshot `read_file` critique + Visual Polish Pass.
- **Wave 6 (`WP-30` — Parent Agent Only):** Derived sync (`sync.mjs`, `refresh-catalog-digests.mjs`, `seo-meta-pass.mjs --check`), `procedural-craft-gate.test.ts` across all 29 modules, `pnpm check:no-three-runtime`, `pnpm build`, `node tools/game-checks/run.mjs --all`, `CODE_COMPLETE_GO` commit, `pnpm --dir marketing build`, side-by-side All-30 Before/After Gallery, Cloudflare Pages prod deploy (`https://aura3d.auraone.ai`), and `git push origin main`.

---

### `WP-00` — Shared Sculpting Kernel & Automated Anti-Lego Craft Gate (`apps/showcase-port-shared/proceduralKernel.ts`)
- **Files:** `CREATE` `apps/showcase-port-shared/proceduralKernel.ts`, `CREATE` `tests/unit/procedural-kernel/procedural-kernel.test.ts`, `CREATE` `tests/unit/procedural-kernel/procedural-craft-gate.test.ts`.
- **Implementation:**
  1. Author smooth curve & surface builders (`hash01`, `fbm3`, `catmullRomSpline3`, `bezierCurve2`, `transformMesh`, `toFlatShaded`, `bevelBoxMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`, `loftSectionsMesh`, `icosphereFacetMesh`) plus high-craft compound sub-assemblies (`wheelAssemblySlots`, `latticeTrussMesh`, `archwayVoussoirSlots`, `layeredCanopyMesh`, `coniferBoughTierMesh`, `stratifiedCliffMesh`, `mergeRawMeshes`, `buildGroupedGeometrySpec`, `assembleMultiMaterialNode`) using `@aura3d/engine` (`geometry.define`, `geometry.multiMaterial`) and **zero `three` imports**.
  2. Author `tests/unit/procedural-kernel/procedural-craft-gate.test.ts` scanning every `art/proceduralModels.ts` present across the 29 games and failing if any module is `< 350` lines, uses `bevelBoxMesh` alone without curved/lofted/lathed/swept builders, uses `< 4` distinct physical `material.*` presets, or imports `three`.
- **Verification:** `pnpm exec vitest run tests/unit/procedural-kernel`

---

### `WP-01` — Aura Slam 3D (`apps/showcase-top-tennis` + `examples/aura-slam`) — Grand Slam Stadium, Floodlights & Sculpted IK Athlete Kit
- **Disjoint File Ownership:**
  - `CREATE` `examples/aura-slam/art/proceduralModels.ts`
  - `MODIFY` `examples/aura-slam/view/scene.ts` (`buildTennisScene`, `buildWorldTourNodes`), `examples/aura-slam/view/spectators.ts` (`buildBleacherNodes`), `examples/aura-slam/view/athleteRig.ts` (`buildAthleteNodes`), `examples/aura-slam/art/direction.ts`, `apps/showcase-top-tennis/src/main.ts`, `tests/unit/aura-slam/render-scene.test.ts`
- **Static Meshy Clay GLB & Raw Primitives Ripped Out (`0` Skinned GLBs) -> Procedural `@aura3d/engine` Replacements:**
  1. `stadiumAssets.tennisFloodMast` (`stadium-floodlight-left` / `stadium-floodlight-right` at `[±12.5, 0, -13.2]`, `height: 9.5 m`) -> Multi-material tapered steel lattice mast (`studioMetal`), angled crossarm gantry, and multi-hood LED luminaire head bank (`practical: true`).
  2. Grandstand, Scoreboard, Umpire & Tour Courtside (`view/scene.ts`, `view/spectators.ts`) -> Replace single-box `stadium-grandstand-rear` (`[4.2, 5.4, 24]`), box `stadium-scoreboard-gantry` (`[6.2, 1.85, 0.42]` at `[0, 2.4, -15.6]`), capsule/sphere `umpire-torso`/`umpire-head`, cylinder `net-post-left/right` (`[±5.94, 0.535, 0]`), stepped-slab `buildBleacherNodes`, and box-only `buildWorldTourNodes` with tiered architectural grandstands + handrails, trussed LED scoreboard frame, stepped high-chair umpire stand with sun canopy, brass-winched tournament net posts, player benches, beverage coolers, manicured boxwood planters, and triumphal tour archway.
  3. 28-Node Procedural 2-Bone IK Athlete (`buildAthleteNodes` in `view/athleteRig.ts`) -> Upgrade raw primitive limbs/kit/racket to sculpted unit-local `geometry.custom` meshes (tailored polo collar/torso, pleated court shorts, contoured court shoes, bevelled oval graphite racquet throat/hoop/stringbed) **preserving all 28 node names and unit local pivots**.
- **CRITICAL Test Guardrails:**
  - **DO NOT touch `updateAthleteRig`** (`athleteRig.test.ts` verifies exact parity over 4,000 poses against `__generated__/originalRig.js`).
  - Preserve `COURT_X = 5.5`, `COURT_Z = 8.0`, `NET_POST_X = 5.94`, `NET_POST_H = 1.07`, `SCENE_NODE_IDS`, `STATIC_RUNTIME_IDS`, `BOARD_IDS`, `CROWD_SEAT_COUNT = 240` (`<= 400` tris/pose in `gu47-crowd.test.ts`), and `?look=original`.
- **Advanced `@aura3d/engine` Graphics & Athlete Polish:** Use `latticeTrussMesh` + `material.lightBeam` on night tournament floodlight banks, anatomical `latheMesh` limbs + `material.fabric` sheen on sculpted polo/pleated-short athlete meshes, `material.sneakerMesh` + `sneakerRubber` on contoured court shoes, `material.studioMetal` + `clearcoatPaint` on the bevelled oval graphite racquet, `effects.contactShadows` under feet/ball, and capped court SSR (`<= 0.14` on hardcourt, `0` on clay/grass).
- **Scoped Verification:** `pnpm exec vitest run tests/unit/aura-slam && node tools/game-checks/run.mjs top-tennis`

### `WP-02` — Apex Overdrive (`apps/showcase-roadster-rush`) — Sculpted Supercar Hero, 10-Class Traffic Fleet & Skyway Architecture
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-roadster-rush/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-roadster-rush/src/main.ts` (`buildRoadsterRushScene`), `apps/showcase-roadster-rush/src/render/{pylons.ts,dressing.ts,gantry.ts}`, `apps/showcase-roadster-rush/src/art/direction.ts`, `tests/unit/roadster-rush-native/art-direction.test.ts`
- **Static Meshy Clay GLBs (31) & Raw Primitives Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. Hero Roadster (`meshy-vehicles.ts` `hero` + raw sphere/box add-ons `player-canopy-visor`, `player-aero-splitter`, `player-lightbar`, `player-headlight-l/r`) -> Lofted `geometry.multiMaterial` wedge supercar (`PLAYER_BOX = { w: 1.9, h: 1.15, l: 4.3 }`, front `-Z`, `minY = 0`: `carPaint` sculpted bodywork, tinted `studioGlass` teardrop canopy, carbon-weave front splitter & rear Venturi diffuser, 4 forged `studioMetal` 5-spoke rims + rubber tires, `practical: true` LED DRLs & full-width taillight bar; preserve `PlayerHandles` IDs).
  2. 10 Traffic & Skycar Classes (`sedan`, `suv`, `hatch`, `taxi`, `van`, `pickup`, `bus`, `boxtruck`, `carrier`, `skycar` + `.far` LODs) -> Multi-material / `instances.custom` traffic hulls matching exact `VEHICLE_SPECS` collider boxes (`sedan [1.9,1.45,4.6]`, `hatch [1.8,1.5,4.0]`, `suv [2.0,1.85,4.8]`, `taxi [1.9,1.5,4.6]`, `van [2.0,2.3,5.2]`, `pickup [2.0,1.9,5.4]`, `boxtruck [2.4,3.4,8.0]`, `bus [2.5,3.2,12.0]`, `carrier [2.5,3.6,16.0]` with `5 m × 3.6 m` jumpable twin-track deck ramp, `skycar [2.0,1.15,4.3]`).
  3. Skyway Gantries, Pylons, Spans, Powerups & Bay Ridge (`main.ts`, `pylons.ts`, `dressing.ts`, `gantry.ts`) -> Trussed highway overhead gantries, tapered Y-pier `deck-pylon-columns`, cantilevered `light-poles`, sculpted powerup emblems (`pickup-${kind}`), and stratified `fbm3` `coastal-bay-ridge` mountains (replacing 24 rotated boxes!).
- **CRITICAL Test Guardrails:**
  - Keep pure layout & paint exports untouched: `gantryBoxes` (`audit-fixes.test.ts`), `pylonLayout`, `ringLayout`, `spanLayout`, `billboardLayout` (`skyway-dressing.test.ts`), `towerLayout` / `towerGlassSpec`, and `heroPaintOverrides` / `trafficPaintOverrides` (`vehicle-paint.test.ts`). Keep `SPAN_DECK_Y = 29.5 > CEILING + 2`.
- **Advanced `@aura3d/engine` Graphics & Shader Polish:** Sculpt hero & 10 traffic classes with `loftSectionsMesh` curved fenders + `wheelAssemblySlots` 5-spoke forged rims + `material.carPaint` dual-lobe clearcoat + real `material.studioGlass` canopies; apply `material.strata` on `coastal-bay-ridge`, `latticeTrussMesh` on overhead gantries, `effects.trail` nitro/taillight ribbons, `lights.lensFlare` on blue-hour beacons, and wet-skyway `effects.screenSpaceReflections` (`intensity: 0.34`).
- **Scoped Verification:** `pnpm exec vitest run tests/unit/roadster-rush-native tests/unit/apps/roadster-rush-wgsl-twins.test.ts && node tools/game-checks/run.mjs roadster-rush`

### `WP-03` — Thermal Drift (`apps/showcase-heatsink`) — 7 Combat Drones, Molten Foundry Megastructures & Track Hazards
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-heatsink/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-heatsink/src/scene.ts` (`buildThermalDriftScene`, `SCENERY_BATCHES`, `SINGLE_SCENERY_ANCHORS`), `apps/showcase-heatsink/src/skyline.ts` (`skylineNodes`), `apps/showcase-heatsink/art/direction.ts`, `tests/unit/heatsink/{scene.test.ts,art-direction.test.ts}`
- **Static Meshy Clay GLBs (29) & Raw Primitives Ripped Out (`0` Skinned Rigs; Keep CC0 Asphalt Textures/HDRI/LUT) -> Procedural `@aura3d/engine` Replacements:**
  1. 7 Distinct Combat Drones (`heatsinkDroneOrion`, `Volt`, `Bastion`, `Spectre`, `Razor`, `Nighthawk`, `Wraith` -> `player-drone-*` & `rival-*-*`, `maxDim: 3.6..4.1 m`) -> 7 distinct `geometry.multiMaterial` aerospace silhouettes (forward-swept `Razor`, twin-boom `Spectre`, heavy armored `Bastion`, delta stealth `Nighthawk`, tri-wing `Volt`, balanced `Orion`, split-tail `Wraith`) with `carPaint`/`studioMetal` hulls, copper heatsink louvers, `studioGlass` sensor canopies, and `practical: true` twin afterburners.
  2. 14 Foundry Megastructures & Track Arches (`thermalArchIron`, `thermalTowerLIron`, `thermalTowerTIron`, `thermalReactorRing`, `thermalLadleCrane`, `thermalCoolingTower`, `thermalSmokestacks`, `thermalWaterTower`, `GantryStart`, `Overpass`, `TunnelFrame`, `HoloBillboard`, `LavaFall`, `WaterEmitter`) -> Hyperboloid `latheMesh` cooling towers, overhead molten-slag ladle cranes with glowing crucible (`practical: true`), toroidal reactor containment rings, riveted truss start gantry & tunnel ribs, and `instances.custom` blast-furnace `skylineNodes`.
  3. Track Pickups, Barriers & Missiles (`BarrierA`, `BoostPad`, `CoolingCanister`, `ShieldPickup`, `ExplosiveBarrel`, `WeaponShockwave`, `WeaponMine`, `homing-missile-active`, `incoming-missile`, `radiator-fins`, `steam-vents`, `bolt-pickups`) -> Chevron boost pads, glass-and-brass cryo coolant cells, hexagonal energy shield cores, ribbed hazard barrels, spiked proximity mines, and finned interceptor missiles.
- **CRITICAL Test Guardrails:**
  - Preserve all `IDS` runtime node names, `INSTANCE_COUNTS`, `TRACK_HALF_WIDTH = 10.5`, `WALL_LIMIT = 8.9`, `PICKUP_REACH = 3.4`, and pure `skylineLayout` / `skylineTransforms` exports (`skyline.test.ts`).
- **Advanced `@aura3d/engine` Graphics & Shader Polish:** Loft all 7 combat drone fuselages (`loftSectionsMesh` + `studioMetal` + `carPaint` + `studioGlass` sensor canopies + copper heatsink louvers), apply `material.strata` on foundry canyon rock walls, `material.lightBeam` / `effects.particles` on molten slag ladle crucibles & hyperboloid cooling-tower steam plumes, `effects.trail` on twin afterburners & homing missiles, and paired GLSL+WGSL heat-haze distortion.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/heatsink && node tools/game-checks/run.mjs heatsink`

### `WP-04` — Grid Dispatch (`apps/showcase-teleoperator`) — Multi-Material AV Robotaxi Fleet, Cable Car & SF Architecture
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-teleoperator/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-teleoperator/src/scene.ts` (`buildGridDispatchScene`), `apps/showcase-teleoperator/src/art/direction.ts`, `tests/unit/teleoperator/{scene.test.ts,art-direction.test.ts}`
- **Rigged Skinned GLB Preserved (`skins: 1, joints: 24`):**
  - Keep `assets.gridPassenger` on `PASSENGER_NODE = "taxi-passenger"` (`clip: "wave"`, `targetHeight: 1.72`) and frame with a procedural kerbside transit totem/luggage.
- **Static Meshy Clay GLBs (23) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. 7 Playable & Rival AV Fleet Vehicles (`gridCruiser` `[1.83,2.90,3.90]`, `gridRivalCruiser`, `gridCoupe` `[2.72,2.42,4.00]`, `gridTruck` `[2.27,2.12,5.55]`, `gridGt` `[2.26,1.29,4.66]`, `gridInterceptor` `[2.07,1.24,4.50]`, `gridCablecar` `[2.82,4.00,8.20]`) -> Sculpted `geometry.multiMaterial` autonomous vehicles (`carPaint` white/champagne/livery bodywork, wraparound panoramic `studioGlass` greenhouse, roof-crown spinning `studioMetal` LiDAR puck & corner radar pods, forged wheels, `practical: true` status lightbars) plus authentic redwood-and-brass SF `Line 59` grip cable car (`8.2 m`) with clerestory roof & open running boards.
  2. 6 Traffic Classes (`gridSedan` `4.75m`, `gridTaxi` `4.6m`, `gridHatch` `3.9m`, `gridVan` `4.7m`, `gridPickup` `5.25m`, `gridBoxTruck` `7.6m`) -> Multi-material procedural traffic rigs (`traffic-0..9`).
  3. 10 SF Buildings, Landmarks & Street Furniture (`gridBldgVictorian`, `Midrise`, `GlassTower`, `ArtDeco`, `New1`, `New2`, `PyramidTower`, `BridgeTower`, `BridgeDeck` -> `sf-bldg-l/r-0..7`; plus `sf-manholes`, `sf-signal-*`, `sf-lamp-*`, `sf-tree-*`) -> Bay-window Painted Lady Victorians with cornices & stoops, stepped Art Deco terracotta towers, tapered Transamerica-style diagrid pyramid spire, International-Orange suspension bridge towers, hooded 3-lamp traffic signals, teardrop globe streetlamps, and multi-puff street trees.
- **CRITICAL Test Guardrails:**
  - Keep `apps/showcase-teleoperator/src/aura-assets.ts` untouched (`assets.test.ts` & `tests/unit/likeness-audit/teleop-vehicles.test.ts`).
  - Keep exported material symbols in `src/scene.ts` (`POD_MATERIALS`, `POD_LIVERY`, `TRUCK_STEEL`, `RIVAL_CHAMPAGNE`, `MUTED_CLEARCOAT`, `carMaterialOverrides`) imported by `materials.test.ts`, and pure layout helpers in `src/dressing.ts`. Preserve all `player-car-${id}`, `ROAD_STRIPS`, and `INSTANCED` IDs.
- **Advanced `@aura3d/engine` Graphics & Character Polish:** Loft all 7 AV fleet hulls (`carPaint` + wraparound `studioGlass` + spinning `studioMetal` LiDAR pucks + `wheelAssemblySlots`), build open `latticeTrussMesh` International-Orange suspension bridge towers, add `effects.volumetricBeam` / `material.lightBeam` on kerbside robotaxi hail beacons, `layeredCanopyMesh` street trees, wet SF asphalt SSR (`0.30`), and restyle `gridPassenger` with `material.fabric` coat sheen + crisp `rim` backlight.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/teleoperator tests/unit/likeness-audit/teleop-vehicles.test.ts tests/unit/likeness-audit/teleop-robotaxi-flat.test.ts && node tools/game-checks/run.mjs teleoperator`

### `WP-05` — Iron Crown (`apps/showcase-iron-crown`) — 6 Fighting Stages, Sovereign Throne, Trophy Cabinets & Backdrops
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-iron-crown/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-iron-crown/src/game/stages.ts` (`buildNeonSkyline`, `buildHarbourDocks`, `buildRuinedColosseum`, `buildDesertAirbase`, `buildSnowMonastery`, `buildCrownTheater`, `buildTrophyCabinets`, `buildThronePlinth`), `apps/showcase-iron-crown/src/game/backdrop.ts` (`buildStageBackdrop`), `apps/showcase-iron-crown/src/art/direction.ts`
  - `MODIFY` `tests/unit/iron-crown/{stage-assets.test.ts,stage-dressing.test.ts,backdrop.test.ts,art-direction.test.ts}`
- **Rigged Skinned Fighters Preserved (All 6):**
  - Keep `ironcrownKenji`, `ironcrownVolt`, `ironcrownBoulder`, `ironcrownSeraph`, `ironcrownJinx`, `ironcrownSovereign` (`24` joints, `14` combat clips via `AnimationController<FighterClip>`, `FIGHTER_RENDER_HEIGHT = 1.8`).
- **Static Meshy & Cross-Game Props (37) + Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements (All Behind `z <= -1.1`):**
  1. **Neon Skyline (`nt-*`):** Rooftop HVAC condenser banks with fan grilles, neon kanji/arcade sign gantries (`practical: true`), transformer cabinets, wrought-iron streetlamps, and bevelled curtain-wall skyscraper backdrops (`bd-neon-*`).
  2. **Harbour Docks (`bk-*`):** Lattice hammerhead harbour crane, clinker-hulled trawler boat with wheelhouse, vendor ramen cart with noren curtains, banded cargo crates & drums.
  3. **Ruined Colosseum (`co-*`):** Fluted travertine Corinthian columns & arched arcade tiers, carved stone gladiator busts on pedestals, iron tripod flame braziers (`BRAZIER_PLUMES`).
  4. **Desert Airbase (`ab-*`):** Swept-wing twin-tail tactical jet (`"ab-jet-center"` with `studioGlass` canopy & `studioMetal` nozzles), rotating lattice radar tower, fuel depot spherical/cylindrical tanks, and stratified red-rock mesas.
  5. **Snow Monastery (`mo-*`):** Upturned-eave timber mountain shrine & bell pavilion, stone torii & lanterns, snow-laden conifers, and faceted alpine peaks (`bd-monastery-*`).
  6. **Crown Theater (`cr-*`):** Gilded iron-and-velvet Sovereign Throne on `buildThronePlinth` (`PLINTH_TOP = 0.34`, `PLINTH_Z = -3.45`), giant forged Iron Crown centerpiece, `buildTrophyCabinets()` with `latheMesh` championship goblets (`"cr-cabinet-cups"`) & `"cr-cabinet-banner"`, concert lighting trusses, and sculpted balcony spectator silhouettes (`ic-crowd-bodies`, `ic-crowd-heads`).
- **CRITICAL Test Guardrails:**
  - **Prefix Rule (`stage-dressing.test.ts:20-34`):** Keep `buildArenaFloorDeck` untouched (`14` floor nodes named `${stage.id}-*`) and **NEVER** name any new stage prop `${stage.id}-*` (strictly use `nt-*`, `bk-*`, `co-*`, `ab-*`, `mo-*`, `cr-*`, `bd-${stage.id}-*`).
  - **Identifier Rule (`likeness-audit/iron-crown-stage-props.test.ts`):** Keep `"buildTrophyCabinets()"`, `'"cr-cabinet-banner"'`, and `'"cr-cabinet-cups"'` in `stages.ts`.
- **Advanced `@aura3d/engine` Graphics & Fighter Polish:** Upgrade all 6 preserved fighters' `fighterMaterialOverrides` (`material.fabric` gi/cloth sheen, `studioMetal` gauntlets/armor, natural skin speculars, strong stage-key `rim`), pair stages with `material.caustics` / reflective harbor water (`bk-*`), `material.strata` desert mesas & alpine peaks (`ab-*`, `mo-*`), `archwayVoussoirSlots` travertine Colosseum arcades (`co-*`), `effects.volumetricBeam` concert spotlights (`cr-*`), and ember `effects.particles` on braziers.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/iron-crown tests/unit/likeness-audit/iron-crown-stage-props.test.ts && node tools/game-checks/run.mjs iron-crown`

### `WP-06` — Pip's Big Leap (`apps/showcase-pips-big-leap`) — Storybook Woodland Dioramas, Sun Gate, Windmills & Pickups
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-pips-big-leap/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-pips-big-leap/src/game/{world.ts,diorama.ts}`, `apps/showcase-pips-big-leap/art/direction.ts`, `tests/unit/pips-big-leap/{props.test.ts,art-direction.test.ts}`
- **Rigged Skinned GLBs Preserved (3):**
  - Keep `assets.pip` (`pipsPip` + procedural `pip:cape`), `assets.boss` (`pipsBrambleback`), and `assets.beetle` (`leapBeetleAnim`). Also leave `src/aura-assets.shared.ts` & `src/aura-assets.ts` untouched (`shared-assets.test.ts` & `certification-provenance.test.ts`).
- **Static Meshy Clay & Borrowed Sci-Fi/FPS Props (26) + Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. 4 Diorama Island Bases (`leapBaseGarden`, `Canopy`, `Millpond`, `Meadow` + `pbl-base-mounds` spheres) -> Bevelled layered storybook island plinths (stratified limestone undercroft + rich soil bevel + emerald turf lip).
  2. Pickups, Checkpoints & Sun Gate (`pipsSunseed`, `pipsGoldenAcorn`, `pipsCheckpointFlag`, `pipsSungate`, plus borrowed `fpsEnergyCorePickupMeshy` hearts/stars/gateLock & `heatsinkBoostPad` springs!) -> Ribbed golden `latheMesh` sunseeds, `studioMetal` golden acorns with cross-hatched oak cupules, glossy crimson heart-berries, bevelled 5-point star relics, coiled copper-and-toadstool bounce `springs` (`0.7 m` radius), carved timber pennant `checkpoint` flags, and runes-carved limestone `Sun Gate` arch (`sun-gate-ring`).
  3. Woodland Landmarks, Critters & Flora (replacing borrowed `reactorFusionTurbineMeshy`, `blockfallReactorContainmentPylonMeshy`, `skylineCrystalShardMeshy`, `auraClashCornerBrazierPylonMeshy`, `gullsiege*`, plus `leapHedgehog`, beetle-as-`hawk`, and `pbl-flora-*` spheres/cones) -> Timber-and-linen woodland windmills, dressed-stone watchtowers, wooden waterwheel/pinwheel updraft fans, carved mossy boundary pillars, spotted red-and-cream Amanita toadstools, quartz crystal clusters, thorny bramble vines (`hazard:${hz.id}`), spiny procedural `hedgehog`, soaring feathered `hawk`, and `instances.custom` 3-leaf clovers, arched grass tufts, fern fronds, river pebbles, and autumn leaves.
- **CRITICAL Test Guardrails:**
  - Preserve exact `WorldSpec` physics colliders (`PLAT_H = 0.55`, `cameraObstacleFor(d)` cylinders, boss `ARENA` `[0,-69]` `5.4×4.4`), all `nodeName.*` / `dioramaName.*` runtime IDs, and `?look=original`.
- **Advanced `@aura3d/engine` Graphics & Hero Polish:** Use `stratifiedCliffMesh` + `material.strata` on the 4 storybook island bases, `material.caustics` on Millpond water, `effects.godRays` / sunbeams through Canopy boughs (`layeredCanopyMesh` + `wind: true`), `archwayVoussoirSlots` on the rune-carved Sun Gate, restyle rigged `pip` & `boss` with plush `material.fabric` / `lacquer` / `rim` separation + flowing procedural `pip:cape`, and cap outdoor turf SSR at `<= 0.10`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/pips-big-leap && node tools/game-checks/run.mjs pips-big-leap`

### `WP-07` — Aura Hoops 3D (`apps/showcase-aura-hoops-3d`) — Tempered-Glass Hoop Stanchions, Pebbled Basketball & 5 Streetball Venues
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-aura-hoops-3d/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-aura-hoops-3d/src/{main.ts,setPieces.ts,courtRigs.ts,crowd.ts}`, `apps/showcase-aura-hoops-3d/art/direction.ts`, `tests/unit/aura-hoops/art-direction.test.ts`
- **Rigged Skinned GLBs Preserved:**
  - Keep 15-joint streetball athletes (`hoopsAthleteBigKit`, `hoopsAthleteGuardKit` + dribble IK `solveElbow` & `headLookQuat`) and the 6 seated rigged fans (`aura_hoops_3d_blacktopFanAPoses/CPoses/DPoses` -> `crowd-live-0..5`, `live-fans.test.ts`). Keep `src/aura-assets.route.ts` untouched (`original-asset-integrity.test.ts`).
- **Static Meshy Clay GLBs (22) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Regulation Hoop Stanchion & Basketball (`hoopsHoopRig`, `hoopsBackboard`, `hoopsRim`, `hoopsBall` in `buildHoopNodes` & `buildBallNodes`) -> Powder-coated gooseneck steel stanchion with stitched vinyl base pad, `studioGlass` tempered glass backboard (`BOARD_Z = -0.35`, `BOARD_HALF_W = 0.9`, `BOARD_Y0 = 2.82`, `BOARD_Y1 = 3.9`) with brushed-aluminum frame & crisp white shooter's square, spring-loaded breakaway collar + orange `clearcoatPaint` rim (`RIM = [0, 3.05, 0]`, `RIM_R = 0.255`), and 8-ribbed pebbled leather basketball (`BALL_R = 0.12`, `"ball-live"`).
  2. 5 Streetball Venues & Standing Crowd (`blacktopMuralWall`, `LifeguardTower`, `CorrugatedRoof`, `Container`, `BleacherR2`, `Floodlight`, `Scoreboard`, `BallCart`, `Trophy`, `Lamp`, `Palm`, `Canopy`, `Skyline`, `Tower`, `Earth`, `OrbitArena`, static `blacktopFanB/C`, plus lollipop `rucker-tree-*` & box horizons) -> Brick mural wall with coping, slatted timber Venice lifeguard tower & curved coastal palms, corrugated Barangay canopy & warm festoon lamps, ribbed steel shipping containers, multi-tier bleachers + scorer's table, tubular chrome ball cart, LED shot-clock/scoreboard gantry, orbital station ring truss, and sculpted `instances.custom` standing spectators (`crowdLayout`).
- **CRITICAL Test Guardrails:**
  - Preserve `courtBackdropNodes` exact return counts in `courtRigs.ts` (`rucker: 3`, `athens: 2`, `venice: 0` — `court-backdrop.test.ts`), all physics constants, and all runtime IDs (`backboard-assembly`, `rim-assembly`, `net-top`, `net-skirt`, `ball-live`, `court-score-sdf`, `p0..p4`, `a0..a4`, `crowd-live-0..5`). Update `art-direction.test.ts:81` asset count check cleanly.
- **Advanced `@aura3d/engine` Graphics & Athlete Polish:** Build regulation hoop with real transparent `material.studioGlass` backboard + `brushedMetal` frame + `studioMetal` breakaway spring collar, restyle rigged guards/bigs with `material.fabric` mesh jersey sheen + `sneakerMesh`/`sneakerRubber` high-tops, add `material.lightBeam` on Rucker/Barangay floodlights, `material.planet` + `material.atmosphere` Earth limb glow on Orbit Arena, and `0.32` hardwood/asphalt court SSR.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/aura-hoops tests/unit/likeness-audit/clean-athletes.test.ts tests/unit/athletes-rebuild/skin.test.ts && node tools/game-checks/run.mjs aura-hoops-3d`

### `WP-08` — Aura Diamond 3D (`apps/showcase-aura-diamond-3d`) — Ballpark Grandstands, Lathe Ash Bat, Leather Gloves & 5 Park Landmarks
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-aura-diamond-3d/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-aura-diamond-3d/src/scene.ts` (`buildFieldNodes`, `buildStandsNodes`, `parkLightingRig`, `wave2SetPieces`, `buildParkExtras`, `horizonNode`, `buildActorsNodes`), `apps/showcase-aura-diamond-3d/art/{crowd.ts,horizon.ts,direction.ts}`, `tests/unit/aura-diamond/{crowd.test.ts,art-direction.test.ts}`
- **Rigged Skinned GLBs Preserved:**
  - Keep `assets.diamondAthlete` (`15` joints, `solveBatterPose` CPU-skinned grip parity in `drawn-grip.test.ts`) and `assets.diamondCrowdAthlete` (`waver-0..17`, `WAVER_COUNT = 18`).
- **Static Meshy Clay GLBs (26) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Actor Gear & Field Hardware (`diamondBat` -> `"bat"`, `diamondGlove` -> `"catcher-mitt"` / `"glove-${id}"`, raw sphere `${id}-cap`, `diamondBase` -> `"base-bags"`, `diamondFoulPole` -> `"foul-poles"`) -> `latheMesh` lacquered white-ash/maple baseball bat (`1.02 m` along local axis matching `batter-pose.ts`!), webbed stitched-leather fielder's glove & padded catcher's mitt, brimmed batting helmet/cap (`${id}-cap` on `Head` bone), quilted canvas `base-bags`, and trussed yellow `foul-poles` with mesh screens.
  2. Grandstands, Dugouts, Scoreboard, Floodlights & Seated Crowd (`diamondDugout`, `diamondStadium`, `diamondScoreboard`, `diamondFloodlight`, `ballpark_fanA/B`, box `bleachers`) -> Sunken concrete-and-rail `dugouts`, tiered steel-and-brick `stadium-shells` & `ivy-grandstand`, classic ballpark `scoreboard-rig` with analog clock pediment, lattice `flood-*` light towers (`practical: true`), and sculpted `instances.custom` seated spectators (`FAN_SKIN` using zero Hoops hexes!).
  3. 5 Park Outfield Landmarks (`ballparkLighthouse`, `Mesa`, `WaterTower`, `RowhouseRoof`, `Habitat`, `HoodooR2`, `HarborPier`, `Tower`, `CanyonArch`, `Rock`, `IvyWall`, `Trophy`, broken-UV `TyphoonDome`, `LunarRover`, `MoonDome`, plus box `sandlot-sailboats-*` & `sandlot-bay-bridge`) -> Striped coastal lighthouse, timber harbor pier & sloop sailboats with curved mainsails, brick ivy outfield arcade & rooftop bleachers, steel-ribbed geodesic `dome-rafters`, red-rock mesas/canyon arch/hoodoos, and pressurized lunar geodesic habitat dome + 6-wheel rover (all strictly `clearOfFence`!).
- **CRITICAL Color & Batch-Name Test Guardrails (`tests/unit/aura-diamond/scene.test.ts`, `crowd.test.ts`):**
  - **Reserved Ball Hex:** **NEVER** use `#f5f1e4` on any material other than `"ball"` (`scene.test.ts:195-200`)!
  - **Banned Hoops Hexes:** **NEVER** use `#c98a5a`, `#070a12`, `#9db8cf`, or any `showcase-aura-hoops-3d` skin hex (`scene.test.ts:202-205`, `crowd.test.ts:55-58`)!
  - **Exact Batch Names & Counts:** Preserve `"field-clay"`, `"field-basepaths"`, `"base-bags"`, `"field-plates"`, `"field-chalk"`, `"foul-poles"`, `"foul-pole-glows"`, `"dugouts"`, `"stadium-shells"`, `"ondeck-mats"` (`2`), `"warning-track"`, `"ivy-vines"` (`7`), `"ivy-trophy"`, `"ivy-statue"`, `"harbor-rocks"` (`2`), `"dome-rafters"`, `"dome-banners"`, `"regolith-mounds"`, `"flood-towers-far"` (`2` on Ivy), `"lunar-earth"`, and `"harbor-water"` (`y = 0.12`, `kind !== "water"`), plus `?look=original`.
- **Advanced `@aura3d/engine` Graphics & Athlete Polish:** Restyle `diamondAthlete` uniforms (`material.fabric` pinstripe wool/poly sheen + `studioMetal` belt buckles + sculpted `latheMesh` brimmed batting helmet & stitched leather mitts), apply `material.strata` on Canyon Arch/Mesa/Hoodoo parks, subtle wave speculars on `harbor-water`, `latticeTrussMesh` + `material.lightBeam` on ballpark floodlight towers, `material.planet` + `atmosphere` on `"lunar-earth"`, and `0` mirror SSR on outfield grass/infield clay.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/aura-diamond tests/unit/likeness-audit/clean-athletes.test.ts && node tools/game-checks/run.mjs aura-diamond-3d`

### `WP-09` — Aura FC 3D (`apps/showcase-aura-fc-3d`) — Cantilevered Football Stadium Bowl, FIFA Goals, Match Ball & Supporter Tiers
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-aura-fc-3d/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-aura-fc-3d/src/game/scene.ts` (`floodNodes`, `originalFloodNodes`, `pitchNodes`, `goalNodes`, `stadiumNodes`, `ballNodes`), `apps/showcase-aura-fc-3d/art/direction.ts`, `tests/unit/aura-fc-3d/{audit-fixes.test.ts,art-direction.test.ts}`
  - *(**DO NOT touch `apps/showcase-aura-fc-3d/src/game/rig.ts`!** `athlete-rig.test.ts` & `clean-athletes.test.ts` enforce strict 3-node & regex rules on `rig.ts`.)*
- **Rigged Skinned GLBs Preserved:**
  - Keep `fcSoccerStrikerMeshy`, `fcGoalkeeperMeshy`, and the 6 rigged rail fans `fcPitchFanA/B/CMeshy` (`fc-fan-0..5`, asserted in `pitch-fans.test.ts`). Keep CC0 turf/concrete textures, HDRI, LUTs, and SFX.
- **Static Meshy Clay GLBs (10) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Stadium Bowl, Canopy, Tunnel, Dugouts & Floodlights (`fcStandModuleMeshy` 45.6k-tri blob -> `fc-stadium-bowl`, `fcPlayerTunnelMeshy` -> `fc-player-tunnel`, `fcFloodlightPylonMeshy` -> `flood-0..3`, `fcScoreboardGantryMeshy` -> `fc-gantry`, `fcGlacierDomeMeshy` -> `fc-dome`, `fcTeamBench` -> `dugout-home/away`, `fcHeroTrophyMeshy` -> `fc-trophy-case`, `fcBallCrate` -> `fc-ball-cart`, plus raw `fc-stands` & `fc-roof-trusses`) -> Tiered concrete-and-seat stadium bowl (`fc-stadium-bowl`), cantilevered space-frame canopy trusses (`fc-roof-trusses`), recessed glazed `fc-player-tunnel`, polycarbonate technical-area `dugout-home/away` shelters with bucket seats, towering 4-mast stadium floodlights (`flood-0..3`, `practical: true`), alpine timber-and-glass `fc-dome` arch ribs, and `latheMesh` silver championship cup on `fc-trophy-plinth`.
  2. FIFA Goals & Match Ball (`fcSoccerGoalNetMeshy` + raw cylinder posts in `goalNodes`, `fcMatchBallMeshy` -> `fc-ball-mesh` & `fc-spare-ball`) -> Regulation `[7.6, 2.85, 2.6]` (`GOAL_HALF_W = 3.8`, `GOAL_H = 2.85`, `GOAL_DEPTH = 2.6`) elliptical white-aluminium posts/crossbar, rear D-stanchions & taut hexagonal net mesh (`fc-goal-mesh--1/1`), plus thermally-bonded icosahedral `clearcoatPaint` match ball (`BALL_VIS_R = 0.21`).
  3. Supporter Tiers (`fc-crowd`, `fc-crowd-heads`, `fc-crowd-scarves`, `fc-wavers` capsule/sphere soup) -> Sculpted `instances.custom` supporter torsos, heads, raised team scarves, and waving supporter silhouettes keeping those exact 4 batch IDs.
- **CRITICAL Venue & Audit Test Guardrails (`gu47-look.test.ts`, `audit-fixes.test.ts`):**
  - Preserve `fc-stands` exact instance counts per venue (`munich: 14`, `glacier: 14`, `kyoto: 11`, `lagos: 6`, `favela: undefined`), `fc-hoardings` (`4`), `fc-lines` (`17`), Favela `cage-(w|e)-*` goal opening `[-3.8, 3.8]`, `"fc-trophy-plinth"` top alignment (`position[1] + size[1]/2 === trophy.position[1]`), `"fc-spare-ball"` `position[1] === 0`, and zero `^stand-|^hoard-|^fc-stripe-\d|^fc-waver-\d` node names.
- **Advanced `@aura3d/engine` Graphics & Supporter Polish:** Build cantilevered stadium roof & floodlight masts with `latticeTrussMesh` + `material.lightBeam` / `lights.lensFlare` night stadium crowns, tensioned hexagonal net geometry on FIFA goals, thermally-bonded `clearcoatPaint` match ball, crisp `material.fabric` kit/sock sheen on preserved footballers & rail fans (`fc-fan-0..5`), animated scarf wave on `fc-crowd-scarves`, and capped `<= 0.10` pitch turf SSR.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/aura-fc-3d tests/unit/likeness-audit/clean-athletes.test.ts && node tools/game-checks/run.mjs aura-fc-3d`

### `WP-10` — Aura Links 3D (`apps/showcase-aura-links-3d`) — Championship Golf Cart, Tour Bag/Clubs, Clubhouse & 6 Course Biomes
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-aura-links-3d/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-aura-links-3d/src/main.ts` (`buildConiferNodes`, `buildBleacherNodes`, `buildClubhouseNodes`, `buildDressingNodes`, `buildHoleScene`), `apps/showcase-aura-links-3d/src/game/rig.ts` (`buildGolferNodes`), `apps/showcase-aura-links-3d/art/direction.ts`, `tests/unit/aura-links-3d/art-direction.test.ts`
- **Rigged Skinned GLBs Preserved:**
  - Keep `assets.links_golfer_player` (`24` joints, `solveSwing` + `retargetSolved` swing IK) and `assets.linksGolferAthleteMeshy` (`caddy-body` + `gallery-fan-0..5`). Keep `apps/showcase-aura-links-3d/src/aura-assets.ts` intact (`golfer-retarget.test.ts`).
- **Static Meshy & Uncertified Candidate GLBs (24) + Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Golfer Cart, Tour Bag, Club, Flagstick & Ball (`linksGolfCartMeshy` -> `"golfer-cart"` `1.65 m`, `tourBagNode` -> `"golfer-bag"`, `clubHeadNode` -> `"golfer-club-*"`, `linksPinFlagMeshy` -> `"flagstick"` `3.1 m`, `linksGolfBall` -> `"golf-ball"` `BALL_R = 0.05`) -> Multi-material racing-green `clearcoatPaint` golf cart with tubular aluminium canopy struts, ivory sun-top, stitched saddle-tan bench, raked `studioGlass` windshield & spoked wheels (fixing the inverted-backface Meshy blob!); quilted leather tour stand bag with club dividers; sculpted 460cc titanium driver head (`studioMetal`) preserving exact `CLUB_PARTS` local frame (`club-continuity.test.ts`!); fiberglass tournament `flagstick` with brass ferrule & fluttering pennant; and dimpled urethane golf ball.
  2. Clubhouse & 6 Biome Landmarks (`links_clubhouse`, `links_lighthouse`, `linksDunesBeaconTower`, `linksBurnFootbridge`, `links_basalt_columns`, `linksCraterCrystal`, `links_cable_car_station`, `linksHarbourTowerA/B/C`, `links_harbour_crane`, `linksHarbourFloodlight`, `links_lander` / `linksMareLander`, `linksMareRover`, `linksMareRelay`) -> Half-timbered stone Tudor links `clubhouse-lodge` with dormer gables & veranda; whitewashed coastal `landmark-lighthouse`; arched ashlar `landmark-bridge` over the burn; true dark hexagonal `landmark-basalt-columns` (fixing the wood-grained taupe Meshy mesh!); alpine timber-and-glass `landmark-cable-car-station`; curtain-wall harbour skyline towers, container crane & floodlights; and gold-foil Apollo `landmark-lander`, 6-wheel `landmark-rover`, & parabolic `landmark-relay`.
  3. Course Trees, Rocks, Bleachers & Ground Cover (`propPineTree`, `propRockA`, `links_marram`, `links_gorse`, `linksAlpineSnowPine`, `buildConiferNodes`, `buildBleacherNodes`, `ground-cover-${l.name}`) -> Layered multi-bough Scots pines, snow-laden alpine spruces & autumn maples, stratified granite outcrops, flowering yellow gorse & dune marram tufts, roped tournament gallery stands, and curved-blade `instances.custom` ground cover.
- **CRITICAL Source-Import & Regex Test Guardrails:**
  - **Root Import Ban (`rig-nodes.test.ts:20-25`):** **NEVER** import from repo-root `src/aura-assets` inside `apps/showcase-aura-links-3d/src/**`.
  - **Ground-Cover Source Regex (`ground-cover.test.ts:56-62`):** Keep the exact loop signature `if (turfOn) { for (const plan of groundCover(`, `name: \`ground-cover-${l.name}\``, and `castShadow: false` within 600 chars in `apps/showcase-aura-links-3d/src/main.ts`!
- **Advanced `@aura3d/engine` Graphics & Golfer Polish:** Fix the inverted-backface golf cart (`loftSectionsMesh` `clearcoatPaint` cowl + `studioGlass` windshield + `wheelAssemblySlots`) and taupe basalt (`extrudePolygonMesh` hexagonal dark `material.strata` columns), pair coastal/pond holes with `material.caustics` / reflective water, `coniferBoughTierMesh` & `layeredCanopyMesh` (`wind: true`) across all 6 biomes, `material.planet`/`atmosphere` on Mare lunar horizon, and `material.fabric` polo/trouser sheen + `sneakerMesh` golf shoes on the golfer.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/aura-links-3d tests/unit/likeness-audit/clean-athletes.test.ts && node tools/game-checks/run.mjs aura-links-3d`

### `WP-11` — Bunker Zero (`apps/showcase-bunker-zero`) — Tactical FPS Corridor Overhaul
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-bunker-zero/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-bunker-zero/src/main.ts` (`buildScene`, `syncScenePose`)
  - `MODIFY` `apps/showcase-bunker-zero/src/weapons-view.ts` (`VIEWMODEL_ASSET`, `VIEWMODEL_YAW_OFFSET`, procedural viewmodel builders)
  - `MODIFY` `apps/showcase-bunker-zero/src/art/direction.ts`, `apps/showcase-bunker-zero/aura.assets.json`, `apps/showcase-bunker-zero/scripts/extract-assets.mjs` (regenerate `src/aura-assets.local.ts` & `src/aura-assets.root.ts`)
  - `MODIFY` `tests/unit/bunker-zero/local-assets.test.ts` & `tests/unit/bunker-zero/art-direction.test.ts` (sync removed static Meshy asset keys)
- **Rigged Skinned GLBs Preserved (`skins: 1, joints: 15, animations: 23`):**
  - Keep `assets.bzGuardMeshy`, `assets.bzHoundMeshy`, `assets.bzGunnerMeshy`, `assets.bzWardenMeshy` (`enemy-facing.test.ts` parses these binary `.glb` skeletons directly and `setEnemyClip` drives `Idle`, `Walk_Loop`, `Sprint_Loop`, `Shoot`, `Attack`, `Hit_Head`, `Death`), plus the 4 CC0 Poly Haven industrial fixtures (`bzBulkheadLamp`, `bzMachete`, `bzMedicalBox`, `bzShutterDoor`). Upgrade skinned enemy material overrides to crisp matte armor + specular visors.
- **Static Meshy Clay GLBs & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `assets.bzBlastDoor` + raw `f${s}-doorleaf` / `f${s}-doorvisor` boxes -> `buildBlastDoorBulkheadNode` (`geometry.multiMaterial`: `brushedMetal` ribbed frame, hazard-yellow `clearcoatPaint` bevelled interlocking leaves, `studioGlass` armored viewport, `latheMesh` locking handwheel; span `CELL = 3.0`, height `wallH * 0.94`).
  2. `assets.fpsSciFiCoverCrateMeshy` (`f${s}-pw-${x}-${z}`) -> `buildSecretPushWallNode` (`CELL * 0.92 × wallH * 0.92` riveted steel-and-concrete false bulkhead with recessed pry seam and iron rings).
  3. Pickups (`assets.bunkerKeyMeshy`, `assets.bunkerTreasureMeshy`, `assets.corridorFireAmmoCrateMeshy`, `assets.bzArmorMeshy`) -> Multi-material RFID clearance keycard (`lacquer` + `studioMetal` gold pad + `practical: true` LED, `0.62 m`), latched bullion case with stacked bevelled gold bars (`0.82 m`), olive-drab munition box with brass cartridge belt (`0.72 m`), and contoured ceramic ballistic plate carrier (`0.95 m`).
  4. Weapons & Viewmodels (`assets.corridorPulseRifleMeshy`, `assets.bzMgViewmodel`, `assets.mechWeaponB`, `assets.bzPistol`) + first-person rig (`vm-sleeve-r/l`, `vm-cuff-r`, `vm-glove-r/l`, `vm-optic` raw capsules/boxes) -> Bullpup tactical pulse carbine (slotted barrel shroud, box mag, `practical: true` tritium rail), twin-tube recoilless rocket launcher (`latheMesh` flared Venturi exhaust + side optical sight), two-tone ported service pistol, hooded `studioGlass` reflex sight, and pleated tactical sleeves + armored-knuckle combat gloves.
  5. Props & Projectiles (`assets.bzBarrelMeshy`, `assets.bzCrateMeshy`, `assets.corridorFireAmmoBoltMeshy`, `assets.corridorMuzzleFlameBurstMeshy`) + corridor `instances.*` pools (`work-lights`, `drains`, `bulkhead-ribs`, `pipes`, `columns`, `tracer-*`) -> Ribbed 55-gallon hazard drum (`latheMesh` rolling hoops + bung plugs, `1.25 m`), steel-strapped military crate (`1.15 m`), fin-stabilized ogive rocket warhead (`0.55 m`, `practical: true` thruster), star-fin plasma muzzle flash, and `instances.custom` caged louvered work-lights, slotted floor drains, flanged I-beams, collared conduit pipes, and chamfered pilasters.
- **Invariants & Test Guardrails:**
  - Preserve `CELL = 3`, `WALL_H = 3`, `SILO_H = 5.4`, `EYE = 1.55`, `PLAYER_R = 0.34`, all `SLOT_IDS[0..6]` / `SLOT_STATIC_IDS[0..6]` IDs, and exact substrings checked by `tests/unit/bunker-zero/flow.test.ts` (`doorOffset(d.open, alongX, CELL)`, `node.setPosition(cellX(slot, d.cx) + offX, 0, cellCenter(d.cz) + offZ)`, `for (const id of SLOT_IDS[s]!) opt(id)?.setVisible(false)`).
  - Orient `vm-pistol` & `vm-mg` along `+X` (`VIEWMODEL_YAW_OFFSET === Math.PI`) and `vm-knife` & `vm-rocket` along `-X` (`0`) so `weapons-view.test.ts` passes, and run `node apps/showcase-bunker-zero/scripts/extract-assets.mjs`.
- **Advanced `@aura3d/engine` Graphics & Enemy/Viewmodel Polish:** Restyle the 4 skinned bunker enemies (`bzGuardMeshy`, `bzHoundMeshy`, `bzGunnerMeshy`, `bzWardenMeshy`) with metallic `studioMetal` armor plates, glowing `practical: true` optic visors & `rim` separation; build viewmodels with `brushedMetal` receivers, `studioGlass` reflex optics & tritium sights; add damp bunker floor `effects.screenSpaceReflections` (`0.26`), volumetric bulkhead light shafts, and rocket `effects.trail` smoke/sparks.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/bunker-zero && node tools/game-checks/run.mjs bunker-zero`

### `WP-12` — Glint Courier (`apps/showcase-dot-dash-3d`) — Macro-PCB Micro-Craft Overhaul
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-dot-dash-3d/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-dot-dash-3d/src/game/world.ts` (`courierPod`, `roomNodes`, `buildScene`, `paintMaze`, `paintDressing`, `paintTrophies`, `syncVisuals`)
  - `MODIFY` `apps/showcase-dot-dash-3d/src/art/direction.ts`, `apps/showcase-dot-dash-3d/aura.assets.json`, `apps/showcase-dot-dash-3d/src/aura-assets.ts`
- **Static Meshy Clay GLB & Raw Primitives Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. `assets.dotdashCourierPod` (`courier-pod`, `courier-pod-echo`) + raw sphere `byte` -> `buildCourierHoverPodNode(id)` (`geometry.multiMaterial`, `0.86 m` max dim grounded at `y = 0`: `latheMesh` porcelain-and-copper micro-craft hull, `studioGlass` bubble canopy, twin brass stator coils, gunmetal intake louvers, `practical: true` cyan plasma core).
  2. 4 Sentry Drone Archetypes (`pool-shC` cone, `pool-shB` roundedBox, `pool-shT` torus, `pool-shY` cylinder, `pool-visor`, `pool-eyes`) -> 4 unit-envelope (`[-0.5..0.5]^3`) `instances.custom` SMD micro-drone chassis (`color: "#ffffff"` for per-instance RGB): swept delta-blade interceptor (`shC`), chamfered quad-rotor spider (`shB`), ringed gyro-turbine orbiter (`shT`), fluted recon saucer (`shY`), wraparound optic visor, and faceted compound sensor eyes.
  3. Pickups, PCB Components & Workshop Desk (`pool-dot`, `pool-orb`, `pool-prism`, `pool-vent`, `pool-gem`, `pool-wall`, `pool-rail`, `pool-dress`, `pool-cap`, `pool-trophy`, `roomNodes`) -> Unit-envelope `instances.custom` flanged SMD LED dome (`dot`), knurled brass power-capacitor turret (`orb`), crown-cut quartz prism & gem (`prism`, `gem`), louvered copper vent ring (`vent`), molded epoxy IC package with pin-1 notch (`wall`), gull-wing IC lead (`rail`), multi-fin extruded heatsink (`dress`), K-vent electrolytic capacitor can (`cap`), tip-off glass Nixie tube (`trophy`), and articulated brass-and-enamel architect desk lamp in `roomNodes()`.
- **Invariants & Test Guardrails:**
  - Keep all 24 `pool-${k}` IDs normalized to `[-0.5..0.5]^3` unit bounds (`push(...)` scales directly in world meters; `TILE = 1`, `EAT_RADIUS = 0.58`, `TOUCH_RADIUS = 0.56`).
  - Preserve the exact light rig pinned by `tests/unit/dot-dash-3d/lighting.test.ts` (1 PCSS spot at `[-16, 13, 8]`, 1 directional bounce `0.25`, 1 `hdri` `0.38`, 1 `reflection` box probe, `0` `ambient`/`look` nodes) and `practical: true` on all `emissiveIntensity > 0.1`.
- **Advanced `@aura3d/engine` Graphics & Macro-PCB Polish:** Sculpt `courier-pod` with `latheMesh` glazed `ceramic` + `studioMetal` copper coils + real `studioGlass` bubble canopy + `practical: true` cyan plasma core, render Nixie `pool-trophy` envelopes in `studioGlass` with warm filament glow, `brushedMetal` gull-wing IC leads & copper heatsinks, `effects.contactShadows` under every SMD component, and crisp solder-mask speculars under the single PCSS desk-lamp spot.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/dot-dash-3d && node tools/game-checks/run.mjs dot-dash-3d`

### `WP-13` — Cross Hop (`apps/showcase-cross-hop`) — Toy-Diorama Traffic, Rail & River Overhaul
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-cross-hop/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-cross-hop/src/game/core.ts` (`poolNodes`, `buildDioramaScene`, `buildVividScene`, `buildOriginalScene`, `syncVisuals`)
  - `MODIFY` `apps/showcase-cross-hop/src/art/direction.ts`, `apps/showcase-cross-hop/aura.assets.json`, `apps/showcase-cross-hop/src/aura-assets.ts`
  - `MODIFY` `tests/unit/cross-hop/gu47-shade.test.ts` (sync procedural `c-coins` pool expectation)
- **Rigged Skinned GLBs Preserved (`skins: 1, joints: 24, clips: 4`):**
  - Keep all 12 rigged critter GLBs (`hop`, `chick`, `turtle`, `bun`, `axolotl`, `ducky`, `roboFrog`, `toastCat`, `mushroomKid`, `knightToad`, `astroFrog`, `goldenHop`) on `"player"` and `"spectator-0..10"`.
- **Static Meshy Clay GLBs (14) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. 10 Traffic & Rail Vehicles (`trafficSedan` -> `m-cars`, `trafficHatch` -> `m-hatch`, `trafficSuv` -> `m-suvs`, `trafficTaxi` -> `m-taxis`, `trafficVan` -> `m-vans`, `trafficPickup` -> `m-pickups`, `trafficBoxtruck` -> `m-trucks`, `tramCar` -> `m-trams`, `trainCar` -> `m-trains`, `trafficSkyCar` -> `m-hover`) -> Sculpted toy-diorama `instances.custom` vehicle hulls (`bevelBoxMesh` fenders & stepped greenhouse cabins, `latheMesh` wheel arches/tires/headlight bezels, taxi roof sign, tram pantograph, streamlined express nose, hover-car ducted fans), grounded at `y = 0`, facing `+X` at `ry = 0`, normalized to exact `targetMaxDimension` (`MOVER_LENGTH.*` / `TRAIN_CAR_LENGTH`).
  2. `assets.hawk` (`"hawk"`), `assets.rescuePod` (`"pod"`), and `assets.xhopCoin` / `assets.coin` (`"c-coins"`) -> Multi-material stooping peregrine hawk (`1.4 m` span, swept feathered wings, hooked yellow beak, fanned tail), lacquered-and-`studioGlass` gacha rescue capsule (`1.05 m`, brass finial, `practical: true` heart core), and `instances.custom` star-embossed milled gold medallion (`0.58 m`).
  3. River & Meadow Pools (`m-logs`, `m-log-ends`, `m-rafts`, `m-pads`, `m-stones`, `d-trunks`, `d-canopy`, `d-b`, `horizon-ridge`) -> Bark-ridged logs with branch stubs, concentric heartwood end-rings, lashed 4-plank bamboo rafts, V-notched ribbed lilypads, bevelled hexagonal basalt stepping stones, root-flared trunks, multi-puff wind-swayed canopies (`wind: true`), chamfered verge bollards, and gabled skyline ridge.
- **Invariants & Source-Regex Test Guardrails:**
  - **CRITICAL (`run-logic.test.ts`):** Keep at least 10 `targetMaxDimension: MOVER_LENGTH.<kind>` / `targetMaxDimension: TRAIN_CAR_LENGTH` property tokens in `apps/showcase-cross-hop/src/game/core.ts` (pass `{ targetMaxDimension: MOVER_LENGTH.car }` etc. into the procedural vehicle pool helper in `core.ts`).
  - **CRITICAL (`instance-colors.test.ts`):** Keep the `name: "m-logs"`, `name: "m-pads"`, and `name: "m-stones"` pool lines in `core.ts` formatted on single lines containing both `material.pbr({ color: "#ffffff"` and `CAP.log` / `CAP.pad` / `CAP.stone`.
- **Advanced `@aura3d/engine` Graphics & Diorama Polish:** Loft all 10 toy-diorama vehicle/tram/bullet-train shells (`clearcoatPaint` / `lacquer` + `studioGlass` windows + `wheelAssemblySlots` wheels), pair river lanes with `material.caustics` & wake foam rings, `layeredCanopyMesh` (`wind: true`) meadow trees, `studioGlass` dome on the gacha `rescuePod`, and glossy vinyl `lacquer`/`ceramic` rim-lit finish on the 12 rigged critters.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/cross-hop && node tools/game-checks/run.mjs cross-hop`

### `WP-14` — Shape Shift Sprint (`apps/showcase-shape-shift-sprint`) — Toy-Block Sky Kingdoms & Morph Forms
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-shape-shift-sprint/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-shape-shift-sprint/src/world.ts` (`buildWorld`), `apps/showcase-shape-shift-sprint/src/scenery.ts` (`MESHY_PIECES`, `islandMesh`, `pillarMesh`), `apps/showcase-shape-shift-sprint/src/art/direction.ts`
  - *(Keep `apps/showcase-shape-shift-sprint/src/aura-model-assets.ts`, `aura.assets.json`, and `gtWalsheimBold` font intact on disk; remove `modelAssets.*` scene mounts and prune `src/art/direction.ts` `assets`)*
  - `MODIFY` `tests/unit/shape-shift-sprint/meshy-dressing.test.ts` (validate procedural landmark builders in place of deleted `.glb` `statSync`)
- **Static Meshy Clay GLBs (2) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `modelAssets.toyCastleIsland` (`meshy-castle-0..2`, `size: 9.5, 10.5, 10.0`) -> `buildToyCastleIslandNode(id, size)` (`geometry.multiMaterial`: faceted terracotta/limestone floating sky rock, bevelled emerald turf terrace, multi-turret pastel `ceramic`/`lacquer` storybook keep, crenellated battlements, arched gatehouse, `studioMetal` brass weathervanes, grounded at `y = 0`).
  2. `modelAssets.toyBlockTower` (`meshy-tower-0..2`, `size: 26, 28, 24`) -> `buildToyBlockTowerNode(id, size)` (`geometry.multiMaterial`: stacked architectural wooden/vinyl toy-block spire with `bevelBoxMesh` arches, `latheMesh` turned balusters, `lacquer` conical roofs, and `studioMetal` star/clock finials, grounded at `y = 0`).
  3. Scenery & Morph Forms (`islandMesh`, `pillarMesh` in `scenery.ts`; `player-0..2` in `world.ts`) -> Bevelled toy-block keeps, multi-tier scalloped trees, fluted `latheMesh` viaduct pillars (`pillar-0..8`), and multi-material morph trim on `player-0` (sphere + `studioMetal` equatorial band), `player-1` (chamfered cube + `studioGlass` core inlay), and `player-2` (pyramid + swept stabilizer winglets + `practical: true` thruster ring) within the exact `1.1 m` outer envelope.
- **Invariants & Test Guardrails:**
  - **DO NOT touch `apps/showcase-shape-shift-sprint/src/meshes.ts`** (`tests/unit/shape-shift-sprint/meshes.test.ts` pins exact vertex/index counts on all 10 exported functions). Preserve all `BATCH_IDS`, `PLAYER_IDS`, `meshy-castle-0..2`, and `meshy-tower-0..2` node IDs.
- **Advanced `@aura3d/engine` Graphics & Sky-Kingdom Polish:** Pair floating storybook castle islands with `stratifiedCliffMesh` + `material.strata` rock bases, `archwayVoussoirSlots` gatehouses, pastel `ceramic`/`lacquer` turrets & `studioMetal` weathervanes; give morph forms (`player-0..2`) multi-lobe `clearcoatPaint` + `studioGlass` core inlays + `effects.trail` morph ribbons and `coniferBoughTierMesh` scalloped toy trees.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/shape-shift-sprint tests/unit/apps/shape-shift-sprint-wgsl-twins.test.ts && node tools/game-checks/run.mjs shape-shift-sprint`

### `WP-15` — Number Surge (`apps/showcase-number-surge`) — Synthwave Cyber-Palms, Monuments & Escort Orbs
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-number-surge/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-number-surge/src/roadside.ts` (`addRoadside`), `apps/showcase-number-surge/src/world.ts` (`buildWorld`), `apps/showcase-number-surge/src/scenery.ts` (`addScenery`), `apps/showcase-number-surge/src/art/direction.ts`
  - *(Keep `apps/showcase-number-surge/src/aura-model-assets.ts`, `aura.assets.json`, and `gtWalsheimBold` font intact on disk; remove `modelAssets.*` scene mounts and prune `src/art/direction.ts` `assets`)*
  - `MODIFY` `tests/unit/number-surge/roadside.test.ts` (match `roadside-*` `instances.custom` nodes instead of `n.kind === "model"`)
- **Static Meshy Clay GLBs (4) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `assets.nsNeonPalm` (`roadside-nsNeonPalm`, height `15`) & `assets.nsPinkPalm` (`roadside-nsPinkPalm`, height `15`) -> `instances.custom` synthwave cyber-palms (`tubeSweepMesh` curved ringed chrome/obsidian trunk + 7 arched ribbed neon-piped fronds + crown, grounded at `y = 0`, `practical: true` on neon).
  2. `assets.nsNumeralSeven` (`roadside-nsNumeralSeven`, height `18`) & `assets.nsFloatingDice` (`roadside-nsFloatingDice`, size `1.6`) -> `instances.custom` bevelled arcade `"7"` monument on stepped chrome plinth (`height: 18`) and chamfered casino die with 21 recessed spherical pip cavities (`size: 1.6`).
  3. `ball`, `crowd-lacquer`, `crowd-ceramic`, `powerups`, `towers`, `pylons` (`world.ts` & `scenery.ts`) -> Multi-material `ball` (`clearcoatPaint` cyan core radius `0.55` + `studioMetal` equatorial gimbal ring + polar trim, keeping `+Z` clear for `ball-label`), faceted star-bevelled escort orbs (`crowd-lacquer`, `crowd-ceramic`), crown-cut crystal medallion `powerups` batch in `world.ts`, stepped setback synthwave skyscrapers (`towers`), and V-strut highway piers (`pylons`).
- **Invariants & Test Guardrails:**
  - **DO NOT touch `apps/showcase-number-surge/src/meshes.ts`** (`meshes.test.ts` pins exact vertex counts). Preserve `BATCH_IDS` and `roadside-*` node names.
- **Advanced `@aura3d/engine` Graphics & Synthwave Polish:** Sweep curved ringed chrome/obsidian palm trunks (`tubeSweepMesh` + `studioMetal` + `practical: true` neon-piped fronds), render casino dice & `"7"` monuments in high-gloss `lacquer` + `chrome` plinths, give `ball` & escort orbs dual-lobe `clearcoatPaint` + `studioMetal` gimbal rings, and pair the synthwave grid deck with `0.32` neon `effects.screenSpaceReflections` & `neonBloom`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/number-surge tests/unit/apps/small-games-wgsl-twins.test.ts && node tools/game-checks/run.mjs number-surge`

### `WP-16` — Splat Turf (`apps/showcase-splat-turf`) — Floating Art-Studio Sky Islands & Industrial Paint Rig
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-splat-turf/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-splat-turf/src/world.ts` (`buildWorld`, `rollerYokeMesh`, `rollerCapsMesh`, `canNozzleMesh`, `botScrubberMesh`, `botBeaconMesh`), `apps/showcase-splat-turf/src/scenery.ts` (`addScenery`), `apps/showcase-splat-turf/src/art/direction.ts`
  - *(Keep `apps/showcase-splat-turf/src/aura-model-assets.ts`, `aura.assets.json`, and `gtWalsheimBold` font intact on disk; remove `modelAssets.*` scene mounts and prune `src/art/direction.ts` `assets`)*
- **Static Meshy Clay GLBs (6) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. 6 Floating Art-Studio Islands (`balloon` `5.5`, `easelIsland` `10.5`, `islandTower` `12`, `islandTree` `10.5`, `paintPotIsland` `10.5`, `paletteIsland` `10.5` -> `isle-group-*`) -> `instances.custom` gored `latheMesh` hot-air festival balloon with wicker gondola, faceted sky-island with A-frame timber easel & giant brush, spray-nozzle lookout tower island, `tubeSweepMesh` gnarled paint-splashed tree island, tilted chrome bucket pouring a glossy frozen paint cascade, and `extrudePolygonMesh` thumb-hole artist palette island with 5 pigment dollops & crossed brushes.
  2. Roller Rig, Cans, Scrubber Bots & Finish Gantry (`world.ts`) -> Swept tubular `brushedMetal` gimbal fork (`roller-yoke`) + lathe-turned flanged `clearcoatPaint` bearing endcaps (`roller-caps`) straddling `BALL_RADIUS = 0.45` (keeping custom `BALL_VERT`/`BALL_FRAG` wet-ink shader on `ball` intact); lathe-turned pressurized aerosol spray canisters with rolled rims & finger-depression actuator nozzles (`cans` + `can-nozzles`); sloped armored industrial floor-scrubber eraser bots with fluted rotary brush skirts (`0.62 m` radius) & caged Fresnel strobe domes (`bots` + `bot-scrubbers` + `bot-beacons`); trussed `6.4 m` skate-park `finish` gantry (`geometry.multiMaterial` with checkered banner & `practical: true` marquee lights); lathe-turned paint pails (`props`) & gooseneck park lamps (`posts`/`bulbs`).
- **Invariants & Test Guardrails:**
  - **DO NOT touch `apps/showcase-splat-turf/src/meshes.ts`** (`meshes.test.ts` pins exact vertex counts on `ballMesh`, `stripMesh`, `canMesh`, `botMesh`, `finishMesh`; wire the new procedural `MeshData` directly in `world.ts`). Preserve all `BATCH_IDS`, `SCENERY_BATCH_IDS`, and `isle-group-*` IDs.
- **Advanced `@aura3d/engine` Graphics & Wet-Ink Polish:** Preserve the paired GLSL+WGSL wet-ink `BALL_VERT`/`BALL_FRAG` shader on `ball` while framing it in a `tubeSweepMesh` `brushedMetal` gimbal fork + `clearcoatPaint` caps; sculpt floating art-studio islands with `stratifiedCliffMesh` + `material.strata` bases, high-gloss `lacquer` pouring paint cascades, `latheMesh` chrome aerosol cans, and `latticeTrussMesh` skate-park finish gantry.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/splat-turf tests/unit/apps/small-games-wgsl-twins.test.ts && node tools/game-checks/run.mjs splat-turf`

### `WP-17` — Polarity Orbs (`apps/showcase-polarity-orbs`) — Tesla Coils, Electromagnets & Quartz Crystal Islands
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-polarity-orbs/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-polarity-orbs/src/backdrop.ts` (`addBackdrop`, `updateBackdrop`), `apps/showcase-polarity-orbs/src/world.ts` (`buildWorld`), `apps/showcase-polarity-orbs/src/art/direction.ts`
  - *(Keep `apps/showcase-polarity-orbs/src/aura-model-assets.ts`, `aura.assets.json`, and `gtWalsheimBold` font intact on disk; remove `modelAssets.*` scene mounts and prune `src/art/direction.ts` `assets`)*
  - `MODIFY` `tests/unit/polarity-orbs/art-direction.test.ts` (set synthetic `snapshot.models` to `[]` matching procedural `instances.custom` backdrop)
- **Static Meshy Clay GLBs (6) & Raw Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `poChargeCoil` (`backdrop-poChargeCoil`, `5.8 m`, warm `-X`) & `poMagnet` (`backdrop-poMagnet`, `6.0 m`, cool `+X`) -> `instances.custom` ribbed ceramic Tesla induction pylon with 3 toroidal copper corona rings (`5.8 m`, grounded at `y = 0`) and chamfered `tubeSweepMesh` horseshoe electromagnet monument with brushed-steel pole shoes & copper bobbins (`6.0 m`, grounded at `y = 0`).
  2. `poCrystalRed` (`6.6 m`), `poCrystalBlue` (`7.0 m`), `poCrystalIslandB` (`10.5 m`), `poCrystalIsland` (`10.5 m`) -> `instances.custom` multi-spire hexagonal quartz-prism crystal clusters (`practical: true` crimson/cyan glow) and faceted magnetosphere sky islands crowned with crystal obelisks & hovering flux rings.
  3. `powerups`, `orbs`, `rails` (`world.ts`) -> Multi-facet crown-cut brilliant prism gem (`GEM_RADIUS = 0.4`), equatorial-fluted dipole collector orb (`ORB_RADIUS = 0.45`), and chamfered dual-conduit deck rails (keeping the 5-node hero assembly `ball`, `ball-glass`, `ball-collar`, `ball-reticle`, `ball-symbol` intact).
- **Invariants & Test Guardrails:**
  - **DO NOT touch `apps/showcase-polarity-orbs/src/meshes.ts`** (`meshes.test.ts` pins exact vertex/index counts). Preserve exact `NODE_IDS` length and names (`runtime.nodeCount` returns `NODE_IDS.length`).
- **Advanced `@aura3d/engine` Graphics & Magnetosphere Polish:** Render crimson/cyan quartz clusters & brilliant powerup gems with refractive `material.studioGlass` / `lacquer` facets + `practical: true` inner dipole cores, `latheMesh` glazed `ceramic` + `studioMetal` copper corona rings on Tesla coils, `stratifiedCliffMesh` + `material.strata` magnetosphere islands, and dual-polarity warm/cool deck reflections.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/polarity-orbs tests/unit/apps/polarity-orbs-wgsl-twins.test.ts && node tools/game-checks/run.mjs polarity-orbs`

### `WP-18` — Beat Hopper (`apps/showcase-beat-hopper`) — Concert Line-Arrays, Holographic Decks & Synth-Skater Bot
- **Disjoint File Ownership:**
  - `CREATE` `apps/showcase-beat-hopper/src/art/proceduralModels.ts`
  - `MODIFY` `apps/showcase-beat-hopper/src/dressing.ts` (`addDressing`, `bindDressing`), `apps/showcase-beat-hopper/src/meshes.ts` (ONLY unpinned `skaterBotMeshes`, `speakerBlockMesh`, `monolithWallMesh`, `plasmaCrossbarMesh`), `apps/showcase-beat-hopper/src/stage.ts` (`palmMesh`, `speakerMesh`), `apps/showcase-beat-hopper/src/world.ts`, `apps/showcase-beat-hopper/src/art/direction.ts`
  - *(Keep `apps/showcase-beat-hopper/src/aura-model-assets.ts`, `aura.assets.json`, and `gtWalsheimBold` font intact on disk; remove `modelAssets.*` scene mounts and prune `src/art/direction.ts` `assets`)*
- **Static Meshy Clay GLBs (3) & Stacked-Box Primitives Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `bhSpeakerStack` (`dress-stack-a-inst`, `8.6 m`), `bhSpeakerStackB` (`dress-stack-b-inst`, `6.6 m`), `bhTurntable` (`dress-deck-inst`, `5.2 m`) -> `instances.custom` concert line-array speaker tower (`bevelBoxMesh` splayed cabinets + `latheMesh` sub-bass woofer cones & phase plugs + `practical: true` magenta VU strip, grounded at `y = 0`), dual-horn club subwoofer stack (`latheMesh` flared waveguides + twin cones + cyan piping), and raked brushed-aluminum holographic DJ console (`latheMesh` strobed vinyl platters + S-curved `tubeSweepMesh` tonearms + mixer faders).
  2. `skaterBotMeshes()` (`bot-torso`, `bot-head`, `bot-arm-l/r`, `bot-skate-l/r`, `player`) -> Replace stacked raw `boxMesh` bricks with sculpted `bevelBoxMesh` + `latheMesh` aerodynamic synth-skater cuirass with chest EQ ribs, curved wraparound visor, contoured gauntlet arms, and winged inline hover-boots with glowing energy-blade skegs.
  3. Obstacles & Stage (`speakerBlockMesh`, `monolithWallMesh`, `plasmaCrossbarMesh`, `stage.ts` `palmMesh`/`speakerMesh`) -> Chamfered acoustic enclosures with concave `latheMesh` woofer cones & bass ports (`BLOCK_SIZE: 1.5×0.95×0.9`), ribbed acoustic monoliths (`WALL_SIZE: 1.7×2.3×0.45`), collared hexagonal plasma emitter crossbars (**preserving exact `0.97 m` duck clearance under `BAR_SIZE.y = 1.12`!**), and curved `tubeSweepMesh` stage palms.
- **Invariants & Test Guardrails:**
  - **DO NOT touch the 10 pinned functions in `apps/showcase-beat-hopper/src/meshes.ts`** (`boxMesh`, `sphereMesh`, `capsuleMesh`, `ringMesh`, `translateMesh`, `playerMesh`, `blockMesh`, `barMesh`, `gapMesh`, `wallMesh` — `meshes.test.ts` pins exact vertex counts & AABBs). Preserve `BATCH_IDS`, `grp-dress-stacks`, and `grp-dress-decks`.
- **Advanced `@aura3d/engine` Graphics & Concert-Stage Polish:** Sculpt `skaterBotMeshes` with aerodynamic `clearcoatPaint` cuirass, wraparound `studioGlass` visor, and `effects.trail` energy-blade skates; build line-array towers with `latheMesh` excursion woofer cones + `studioMetal` rigging + `material.lightBeam` / stage concert beams, strobed vinyl DJ platters, and beat-synced neon deck reflections (`0.34` SSR).
- **Scoped Verification:** `pnpm exec vitest run tests/unit/beat-hopper tests/unit/apps/beat-hopper-wgsl-twins.test.ts && node tools/game-checks/run.mjs beat-hopper`

### `WP-19` — Craterline GP (`examples/strange-orbit-port` + `apps/showcase-strange-orbit-port`) — Lunar Hover-Bikes, Skates & Crater Monuments
- **Disjoint File Ownership:**
  - `CREATE` `examples/strange-orbit-port/art/proceduralModels.ts`
  - `MODIFY` `examples/strange-orbit-port/world.ts` (`riderRig`, `buildWorld`, `placeRider`), `examples/strange-orbit-port/models.ts`
  - `MODIFY` `tests/unit/strange-orbit-port/art-direction.test.ts` (align `rider-0-model..rider-5-model` assertions with procedural multi-material group/mesh nodes)
- **Replay-Parity Contract (`reference-replay.test.ts` — 17,214-step cup race, bit-exact finish time, `1e-5` rival distance, `1e-6` lap):**
  - Never modify `race.ts`, `course.ts`, `track.ts`, `obstacles.ts` (`staticColliders()`, `dressingPlan()`), or isolated `lehmer` RNG consumption in `world.ts`.
- **Static Meshy Clay GLBs (9) & Raw Cones Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. `MESHY.bikeRider`, `MESHY.rivalBike`, `MESHY.skateRider` (`rider-0-model..rider-5-model`, `ghost-rider`) -> Multi-part articulated procedural lunar bikes & gravity-skate rigs wired into the existing `riderRig` part-animation slots (`"hull" | "wheelF" | "wheelR" | "torso" | "visor" | "head" | "coneL" | "coneR"` in `world.ts:305-392`): `carPaint`/`clearcoatPaint` aerodynamic cowling (`clearcoat >= 0.6`, per-rider `riderSuitTint(rider)` + `rim` preserved), `studioMetal` swingarms & gyro-hubs, `studioGlass` gold-iridium astronaut visor, sculpted suit torso, and `practical: true` twin thruster cones (`coneL`/`coneR`). **CRITICAL:** Keep `riders[i].parts[0].id === "rider-${i}-model"` so `app.effects.trail` in `world.ts:977` attaches cleanly!
  2. Lunar Landmarks & Obstacles (`MESHY.lander`, `MESHY.observatory`, `MESHY.pylon`, `MESHY.boulderA`, `MESHY.boulderB`, `ROCK_ASSET` `craterline_moon_rock.glb`, and raw `primitives.cone` `crystal-${i}-${k}`) -> Multi-material Apollo-style gold-foil (`studioMetal`) & white-ceramic descent lander with 4 splayed footpads & dish antenna; domed lunar observatory with slit shutter & telescope barrel; trussed telemetry beacon pylon (`practical: true` strobe); `fbm3` flat-shaded regolith boulders (`rock-${c.id}` matching exact `staticColliders()` radii); and crown-cut quartz `studioGlass`/`lacquer` lunar crystal clusters (`crystal-${i}-${k}`).
- **Advanced `@aura3d/engine` Graphics & Lunar Atmosphere Polish:** Loft lunar hover-bikes & gravity-skates (`carPaint` `clearcoat >= 0.6` + gold-iridium `studioGlass` astronaut visors + `studioMetal` gyro-hubs + `effects.trail` ion wakes), apply `material.strata` on crater rims & regolith boulders, crinkly gold-foil `studioMetal` + `ceramic` on the Apollo lander, and `material.planet` + `material.atmosphere` limb glow on the overhead `"planet"`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/strange-orbit-port && node tools/game-checks/run.mjs craterline-gp`

### `WP-20` — Splat (`examples/splat-rush-port` + `apps/showcase-splat-rush-port`) — Floating Paint-Studio Islands & Faceted Power Gems
- **Disjoint File Ownership:**
  - `CREATE` `examples/splat-rush-port/art/proceduralModels.ts`
  - `MODIFY` `examples/splat-rush-port/backdrop.ts` (`pieceModel`, `addBackdrop`, `updateBackdrop`), `examples/splat-rush-port/pickups.ts` (`addPickups`, `pickupNodeIds`, `hidePickups`, `updatePickups`), `examples/splat-rush-port/art/direction.ts`
  - `MODIFY` `tests/unit/splat-rush-port/meshy-presentation.test.ts` (update `backdrop-0..11` & `pickup-*` assertions for procedural multi-material nodes; leave `MODELS` files on disk untouched)
- **Replay-Parity Contract (`reference-replay.test.ts` — `1e-9` float tolerance & exact `rngCount` across 1,500-step & 450-step captures):**
  - Never modify `sim.ts` or `rng.ts`. Keep custom vinyl track/ramp/turret/ball shaders in `meshes.ts`/`shaders.ts` intact.
- **Static Meshy Clay GLBs (10) Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. 6 Backdrop Sky Islands (`islandTree`, `islandTower`, `balloon`, `paintPotIsland`, `paletteIsland`, `easelIsland` -> `backdrop-0..11`) -> Multi-material `geometry.multiMaterial` floating limestone-and-turf sky islands with gnarled paint-splashed tree, spiral spray-nozzle tower, gored `latheMesh` festival balloon + wicker basket, tilted chrome bucket pouring glossy paint cascade, thumb-hole artist palette with 5 pigment dollops, and A-frame studio easel.
  2. 4 Power Gems (`gemRainbow`, `gemShield`, `gemDouble`, `gemSwitch` -> `pickup-{rainbow,shield,x2,switch}-0..3`) -> Multi-material crown-cut brilliant gem (`rainbow`), bevelled hexagonal Aegis crest shield (`shield`), twin interlocked bevelled `"×2"` star-medallion (`x2`), and yin-yang dual-lobe swirl token (`switch`) with `studioMetal` bezels & `practical: true` core glow. Preserve exact `pickupNodeIds()` & `pickup-halo-*` IDs (`warm(on)` in `world.ts:1298` iterates `pickupNodeIds()` at boot).
- **Advanced `@aura3d/engine` Graphics & Vinyl-Ink Polish:** Pair custom vinyl track/ramp/ball shaders with `stratifiedCliffMesh` + `material.strata` floating studio islands, glossy `lacquer` frozen paint waterfalls, and refractive `studioGlass` + `studioMetal` bezel settings on the 4 rotating power gems (`rainbow`, `shield`, `x2`, `switch`) with `effects.contactShadows`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/splat-rush-port && node tools/game-checks/run.mjs splat-rush-port`

### `WP-21` — Serpentine Sky Run (`examples/saiyan-snake-way-port` + `apps/showcase-serpentine-sky-run-port`) — Dragon-Gate Serpent Head, Oni Guardians & Sky Pagodas
- **Disjoint File Ownership:**
  - `CREATE` `examples/saiyan-snake-way-port/art/proceduralModels.ts`
  - `MODIFY` `examples/saiyan-snake-way-port/world.ts` (`ISLAND_VARIANTS`, `ENTITY_MODELS` / `ENTITY_PARTS`, `buildWorld`), `examples/saiyan-snake-way-port/models.ts`, `examples/saiyan-snake-way-port/art/direction.ts`
- **Replay-Parity Contract (`reference-replay.test.ts` — >5,000-step trace parity):**
  - Never modify `sim.ts` (`createRun`, `stepRun`) or `HERO_PARTS` in `hero.ts` (`hero.test.ts` & `world.test.ts`).
- **Rigged Skinned GLBs Preserved (`skins: 1, joints: 24, clips: 7`):**
  - Keep `RUNNER_MODELS` (`assets/runner.glb` & `assets/runner-script.glb`, cloned via `loadRunner` -> `cloneSkinned` + `attachRootRenderSource`).
- **Static Meshy Clay GLBs (11) Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. `serpentHead` (`serpent-head` colossal finish monument) -> Sculpted `geometry.multiMaterial` jade-and-gold celestial dragon/serpent head (`tubeSweepMesh` curved horns & whiskers, `bevelBoxMesh` stepped jaw & fangs, `ceramic` jade scales, `studioMetal` gold crest, `practical: true` amber eyes).
  2. Sky Islands & Lanterns (`island`, `spireA`, `spireB`, `spireC` -> `island-0..5`; `lantern` -> `lantern-0..9`) -> Faceted floating jade crags crowned with multi-tier vermilion pagoda spires, bonsai pines, and carved stone torii (`ISLAND_VARIANTS`), plus carved stone/lacquer palace lanterns with `practical: true` warm paper cores (`lantern-0..9` aligned with `lantern-light-0..5`).
  3. Pooled Course Entities (`arch`, `barrier`, `oni`, `sweeper`, `feast` -> `ent-${kind}-${slot}-${pi}` using `world.ts`'s multi-part `ENTITY_PARTS` support!) -> Vermilion-and-gold curved kasagi torii gate (`arch` `0..7`), spiked lacquer-and-iron spirit barrier (`barrier` `0..15`), horned crimson/indigo `oni` guardian statue wielding studded iron kanabo (`oni` `0..11`), bladed brass cloud-sweeper pendulum (`sweeper` `0..5`), and lacquered banquet tray stacked with steamed bao, ramen bowl & glazed roast (`feast` `0..5`).
- **Advanced `@aura3d/engine` Graphics & Celestial Ink-Wash Polish:** Sculpt the colossal `serpent-head` dragon gate & `oni` guardians with carved jade `ceramic`, gilded `studioMetal` horns/fangs, and vermilion `lacquer` curved `tubeSweepMesh` torii lintels; pair floating crags with `stratifiedCliffMesh` + `material.strata`, warm shoji `practical: true` palace lanterns, golden `effects.trail` aura ribbons, and crisp anime `rim` lighting on the skinned runner.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/saiyan-snake-way-port && node tools/game-checks/run.mjs serpentine-sky-run-port`

### `WP-22` — Gridlock Courier (`examples/drift-and-deliver-port` + `apps/showcase-drift-and-deliver-port`) — Multi-Material Hero Courier, 84-Car Traffic Fleet & Harbor Landmarks
- **Disjoint File Ownership:**
  - `CREATE` `examples/drift-and-deliver-port/art/proceduralModels.ts`
  - `MODIFY` `examples/drift-and-deliver-port/vehicles.ts` (`buildCarShell`, `buildWheel`, `buildTrafficMeshes`), `examples/drift-and-deliver-port/look.ts` (`buildWorldLook`), `examples/drift-and-deliver-port/props.ts` (`propNodes`), `examples/drift-and-deliver-port/main.ts` (`syncCarRig` & traffic instance sync), `examples/drift-and-deliver-port/art/direction.ts`, `apps/showcase-drift-and-deliver-port/src/aura-assets.ts`
  - `MODIFY` `tests/unit/drift-and-deliver-port/hero-car.test.ts` (align hero `car-rig` node assertions with multi-material procedural rig; keep `models.ts` / disk `.glb` files untouched if checked by `models.test.ts`)
- **Replay-Parity & Solid-Footprint Contract (`sim.test.ts` — `<= 3e-14` / `1e-9` + SHA-256 double-run hash):**
  - **CRITICAL:** `main.ts:165` feeds `furnitureSolids(look.furniture)` and `look.propSolids` (`planProps().solids`: hydrants `0.25×0.25`, bus shelters `2.1×0.7`) into `createSim`! Never change `planProps().solids`, `furnitureSolids`, or `sim.ts`.
- **Static Meshy Clay GLBs (16) Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. Hero `courier` (`car-rig`) -> Upgrade procedural `vehicles.ts` / `proceduralModels.ts` hero rally-courier hatch (`carPaint` flared-fender body + roof cargo rack & insulated delivery box, `studioGlass` raked windshield/windows, `brushedMetal` grille & bumpers, 4 independent spinning `latheMesh` alloy wheels `courier-wheel-fl|fr|rl|rr`, `practical: true` `car-light-l|r` headlamps & brake bar).
  2. 84-Car Traffic Fleet (`sedan`, `hatch`, `van`, `pickup`, `gridlockSedanR2`, `gridlockVanR2`) -> Multi-material `TrafficRig` `instances.custom` pools (`color: "#ffffff"` per-instance body tint + separate dark `studioGlass` greenhouse + tire/chrome trim pass) across distinct fastback sedan, city hatchback, high-roof delivery van, and crew-cab pickup silhouettes.
  3. 9 Street & Harbor Props (`lamp`, `signal`, `tree`, `palm`, `shelter`, `hydrant`, `clocktower`, `lighthouse`, `watertank` -> `model-*` instanced nodes in `props.ts`) -> Gooseneck streetlamp, hooded 3-aspect traffic signal, manicured street tree, coastal date palm, glass-and-steel transit `shelter` (`2.1×0.7 m`), flanged cast-iron fire `hydrant` (`0.25×0.25 m`), brick-and-brass harbor `clocktower`, striped coastal `lighthouse` with Fresnel lantern room, and cross-braced rooftop cedar `watertank`.
- **Advanced `@aura3d/engine` Graphics & Rain-Slick Harbor Polish:** Loft the hero rally-courier & 4-class 84-car traffic fleet (`carPaint` + separate `studioGlass` greenhouses + `wheelAssemblySlots` spinning alloy wheels), add `material.lightBeam` Fresnel beam on the harbor `lighthouse` & `car-light-l/r` headlamps, `layeredCanopyMesh` street trees & date palms, and wet-harbor road reflections + tire-spray particles.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/drift-and-deliver-port && node tools/game-checks/run.mjs drift-and-deliver-port`

### `WP-23` — Ion Circuit (`examples/heatsink-port` + `apps/showcase-heatsink-port`) — Multi-Lobe Strike Drone, Combat Targets & Canyon Megastructures
- **Disjoint File Ownership:**
  - `CREATE` `examples/heatsink-port/art/proceduralModels.ts`
  - `MODIFY` `examples/heatsink-port/models.ts` (`droneHull`, `sentryModel`, `heavyModel`, `pickupModel`, `barrelModel`, `sceneryNodes`, `gatePylonNodes`), `examples/heatsink-port/world.ts` (`DRONE_PARTS`, `buildWorld`), `examples/heatsink-port/art/direction.ts`
- **Replay-Parity Contract (`reference-replay.test.ts` — `1e-6` across 18 player fields, `1e-9` on `track.step`):**
  - Never modify `race.ts`, `vehicle.ts`, `track.ts`, `operation.ts`, `rng.ts`, or `DRONE_PARTS` transform math tested by `drone-parts.test.ts`.
- **Static Meshy Clay GLBs (11) Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. Hero `drone` (`drone-hull` + `drone-flap-0..1`, `drone-rotor-0..3`, `drone-nozzle-0..1`) -> Lofted stealth strike-drone fuselage (`geometry.multiMaterial`: anodized titanium `studioMetal` airframe, copper heatsink fin arrays, `studioGlass` forward sensor dome, articulated control flaps, 4 ducted `latheMesh` lift rotors, twin vectoring `latheMesh` exhaust nozzles; preserve `h.materials?.setEmissive` / `heat` response on `node("drone-hull")` at `world.ts:551`).
  2. Combat Targets & Pickups (`sentry`, `heavy` -> `target-${t.id}`; `pickup` -> `pickup-${i}`; `barrel` -> `barrel-${i}`) -> Tri-pod armored rotary `sentry` turret with optic eye, twin-cannon tracked/hover `heavy` gunship bastion, cryo-coolant cell `pickup` (`studioGlass` cylinder + brass endcaps + `practical: true` cyan core), and ribbed volatile plasma `barrel`.
  3. Canyon Scenery & Gate Pylons (`cap`, `coral`, `ruinA`, `ruinB`, `arch`, `pylon` -> `scenery-caps`, `scenery-corals`, `scenery-ruins`, `scenery-arches`, `gate-pylons`) -> `instances.custom` flat-topped desert mesa `caps`, branching bioluminescent canyon `corals`, monolithic brutalist forerunner `ruins`, spanning stone/steel `arches`, and canted electromagnetic race `gate-pylons` (`practical: true` chevrons, `emissiveIntensity <= 0.35` on non-lamps).
- **Advanced `@aura3d/engine` Graphics & Thermal-Canyon Polish:** Loft the stealth strike-drone airframe (`studioMetal` titanium + copper heatsink fins + `studioGlass` sensor dome + 4 ducted `latheMesh` lift rotors + reactive `heat` emissive glow), apply `material.strata` on flat-topped canyon `scenery-caps` & arches, `studioGlass` cryo-coolant cells, and twin `effects.trail` ion plumes.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/heatsink-port && node tools/game-checks/run.mjs heatsink-port`

### `WP-24` — Shadowstep Gauntlet (`examples/ninja-runner-port` + `apps/showcase-ninja-runner-port`) — Castle Town Architecture, Torii Shrine, Waterwheel & Five-Story Pagoda
- **Disjoint File Ownership:**
  - `CREATE` `examples/ninja-runner-port/art/proceduralModels.ts`
  - `MODIFY` `examples/ninja-runner-port/scenery.ts` (`buildScenery`), `examples/ninja-runner-port/setpieces.ts`, `examples/ninja-runner-port/world.ts` (`buildWorld`), `examples/ninja-runner-port/art/direction.ts`
  - *(Keep `examples/ninja-runner-port/assets/meshy/manifest.ts` & `.glb` files on disk untouched so `tests/unit/ninja-runner-port/models.test.ts` disk-manifest checks remain green.)*
- **Replay-Parity Contract (`sim.test.ts` — exact FNV-1a `courseDigest`, `1e-6` autopilot parity):**
  - Never modify `sim.ts`, `course.ts`, `replay.ts`, or `autopilot.ts`.
- **Rigged Skinned GLBs Preserved (`skins: 1, joints: 24`):**
  - Keep all 6 rigged character skeletons (`hero.glb` ×4, `soldier.glb` ×6, `brute.glb` ×2, `sage.glb` ×1, `ninjaCasterAnimR2.glb` ×3, `ninjaScoutAnimR2.glb` ×3) + bone-socketed `unitKatana()`, `unitKanabo()`, and `SCARF`.
- **Static Meshy Clay GLBs (21) Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. 3 Hero Set-Pieces (`shrineGate`, `waterWheel`, `pagoda` -> `setpiece-shrineGate`, `setpiece-waterWheel`, `setpiece-pagoda` in `setpieces.ts`) -> Multi-material vermilion Myojin torii `shrineGate` (`tubeSweepMesh` curved kasagi lintel + gold `studioMetal` gakuzuka plaque + stone plinths); timber mill `waterWheel` with 16 radial paddles, iron hub bands & stone trough (**centered around its X rotation axis so `world.ts` continuous X-spin turns cleanly!**); and 5-tier upturned-eave Japanese `pagoda` with bronze sorin spire & warm paper shoji glow (`practical: true`).
  2. 18 District Props (`houseA..D`, `ninja_houseADusk`, `tower`, `gate`, `teahouse`, `marketStall`, `fenceRail`, `lantern`, `pine`, `oak`, `bush`, `cliffA`, `cliffB`, `boulder`, `ridge`) -> Route 100% of district architecture & foliage through an upgraded multi-material `scenery.ts` + `proceduralModels.ts` (plaster-and-dark-cedar machiya townhouses with kawara tile roofs, watchtowers, noren-curtained `teahouse` & `marketStall`, bamboo `fenceRail`, stone `lantern` aligned to `lantern-light-*`, crooked wind-swept `pine` & `oak` canopies, and faceted basalt `cliffs`/`boulders`).
- **Advanced `@aura3d/engine` Graphics & Feudal Dusk Polish:** Build the 5-tier upturned-eave `pagoda`, curved `tubeSweepMesh` Myojin `shrineGate`, and spinning 16-paddle `waterWheel` with dark cedar, plaster `ceramic`, bronze `studioMetal` sorin spire & warm `practical: true` shoji glow; upgrade all 6 skinned ninja/samurai rigs with `material.fabric` shinobi shozoku sheen, gleaming `studioMetal` katana/kanabo blades, and `effects.trail` slash arcs.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/ninja-runner-port && node tools/game-checks/run.mjs ninja-runner-port`

### `WP-25` — Lamplight Line (`examples/last-train-port` + `apps/showcase-last-train-port`) — Enamel Brass Streetcar, Stylized Passengers & Coastal Clocktower Town
- **Disjoint File Ownership:**
  - `CREATE` `examples/last-train-port/art/proceduralModels.ts`
  - `MODIFY` `examples/last-train-port/world.ts` (`buildScene`, `tramGroups`, `tramCoachTrim`), `examples/last-train-port/townkit.ts`, `examples/last-train-port/main.ts` (`assetStatus`), `apps/showcase-last-train-port/art/direction.ts`
- **Replay-Parity Contract (`reference-replay.test.ts` — 3 circuits / 18 legs exact fares, aboard, lost, catches & loop-1 score):**
  - Never modify `sim.ts`, `replay.ts`, or `data/{route,tables}.json`.
- **Static Meshy Clay GLBs (14) Ripped Out (`0` Skinned Rigs) -> Procedural `@aura3d/engine` Replacements:**
  1. Hero Streetcar (`tram`, `tramEnamel` -> `tram-body` + `TRAM_GROUP_IDS` / `TRAM_FX_IDS`) -> Sculpted Ghibli-inspired coastal electric streetcar (`geometry.multiMaterial`: cream-and-vermilion `lacquer` lower coach, clerestory wooden roof & pantograph collector, `studioMetal` brass grab-rails/bell/headlamp bezel, `studioGlass` arched clerestory & bay windows, `practical: true` warm interior cabin glow, bogie wheels).
  2. 4 Passenger Archetypes & Station Folk (`paxEasy`, `paxSightseer`, `paxRushed`, `paxSleeper` -> `pax-${0..11}-${kind}`, plus `folk-${0..5}-${0..4}`) -> Expressive multi-material stylized figures driven by `riderMotion.ts` bob/sway: relaxed commuter with satchel (`easy`), camera-toting tourist with sunhat (`sightseer`), leaning briefcase sprinter (`rushed`), and nodded-off cap wearer (`sleeper`).
  3. Coastal Town Architecture & Sky-Island Underside (`houseCream`, `houseOchre`, `houseBlue` -> `house-${i}-${a|b}-${k}`; `clockTower` -> `clock-tower-${i}`; `lighthouse` -> `lighthouse-${i}`; `crates` -> `crates-${i}-${0|1}`; `lamp` -> `lamp-post-${i}-${-9|9}`; `lamplightUndersideAR2` -> `island-rocks`) -> Steep-pitched slate/terracotta coastal townhouses with dormer windows & warm lit shutters, copper-domed station `clock-tower` with Roman dial, striped Fresnel `lighthouse`, banded wooden freight `crates` & luggage, wrought-iron swan-neck `lamp-post` (`lightSource: true`), and faceted basalt `island-rocks` undercroft.
- **CRITICAL Test & Scene-Band Guardrails:**
  - Preserve **every exact node name** asserted by `tests/unit/last-train-port/world.test.ts:58` (`"tram-body"`, `"pax-11-sleeper"`, `"house-0-a-2"`, `"house-5-b-1"`, `"clock-tower-0"`, `"lighthouse-1"`, `"crates-3-0"`, `"lamp-post-2--9"`, `"landmark-5"`, `"facades-0"`, `"roofs-2"`, `"stonework"`, `"plaza-cobbles"`).
  - Ensure band scenes `A..E` mount **identical `runtime.id` sets** (`art-direction.test.ts:58`) and `assetStatus()` in `main.ts:534` reports `ok: true` for procedural `group`/`mesh` nodes.
- **Advanced `@aura3d/engine` Graphics & Ghibli Coastal Polish:** Sculpt the coastal electric streetcar with cream/vermilion `lacquer` coachwork, arched `studioGlass` clerestory windows, `studioMetal` brass bell/grab-rails/pantograph, and warm `practical: true` cabin interior glow across all bands `A..E`; add `material.lightBeam` on the coastal `lighthouse`, `stratifiedCliffMesh` + `material.strata` on `island-rocks`, and `layeredCanopyMesh` / slate-roofed coastal townhouses.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/last-train-port && node tools/game-checks/run.mjs last-train-port`

### `WP-26` — Saltwind Highway (`examples/roadster-hours-port` + `apps/showcase-roadster-hours-port`) — Coastal Traffic Fleet, Mediterranean Villas, Lighthouse & Canyon Arches
- **Disjoint File Ownership:**
  - `CREATE` `examples/roadster-hours-port/art/proceduralModels.ts`
  - `MODIFY` `examples/roadster-hours-port/cars.ts` (`CAR_GROUPS`, `rigParts`), `examples/roadster-hours-port/art/landmarks.ts`, `examples/roadster-hours-port/world.ts` (`buildWorld`, `scatter`), `examples/roadster-hours-port/roadsterRig.ts` (optional detail polish preserving all 15 `car-*` IDs), `examples/roadster-hours-port/art/direction.ts`
  - *(Keep `meshy.ts` / `meshy.lod.baked.ts` test helper exports intact so `meshy.test.ts` passes, and keep hero `car-body` mounted first before `vehicles-*` & scenery + `-far` unshadowed LOD pairs so `hero-first.test.ts` & `lod47.test.ts` pass!)*
- **Replay-Parity Contract (`reference-replay.test.ts` — `1e-9` trace delta, exact score/cells/crashes/medal):**
  - Never modify `sim.ts`, `course.ts`, `data.ts`, `autopilot.ts`, or `replay.ts`.
- **Baked Meshy `.bin` Blobs (19) Ripped Out (`0` Skinned Rigs; Hero `roadsterRig.ts` Already Multi-Material Procedural) -> Procedural `@aura3d/engine` Replacements:**
  1. 8 Traffic Vehicle Classes (`sedan`, `hatch`, `suv`, `pickup`, `bus`, `boxtruck`, `semi`, `tanker`) -> Route traffic rendering in `world.ts` through upgraded sculpted `cars.ts` / `proceduralModels.ts` multi-material `instances.custom` batches (`vehicles-paint` `carPaint` with per-instance color, `vehicles-trim` `studioMetal` grilles/bumpers/wheels, `vehicles-glass` `studioGlass` cabins, `vehicles-head` & `vehicles-tail` `practical: true` lamps, plus articulated semi/tanker `vehicles-rigs`).
  2. 10 Coastal & Canyon Scenery Classes (`lighthouse`, `villa`, `townhouse`, `palm`, `pine`, `boulders`, `seastack`, `hoodoo`, `arch`, `arcology`) -> Multi-material cliffside `lighthouse` (`lighthouse-model`), terracotta-roofed stucco Mediterranean `town-villas` & `town-townhouses` with arched loggias, curved coastal `palms` & maritime `pines` (plus `-far` unshadowed LOD batches), stratified red-rock `hoodoo` spires, natural sandstone `arch` bridges, coastal basalt `seastack` pillars, and gleaming terraced `arcology` spire.
- **Advanced `@aura3d/engine` Graphics & Golden-Hour Highway Polish:** Loft all 8 coastal traffic classes (`carPaint` per-instance body tint + separate `studioGlass` cabins + `studioMetal` grilles/rims + `practical: true` headlamps/taillamps), apply `material.strata` on red-rock `hoodoo` spires, natural `arch` bridges & basalt `seastack`s, `archwayVoussoirSlots` on Mediterranean `town-villas`, `material.lightBeam` on the cliffside `lighthouse`, and `effects.trail` nitro/tire-scuff ribbons.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/roadster-hours-port && node tools/game-checks/run.mjs roadster-hours-port`

### `WP-27` — The Bellkeeper's Walk (`examples/where-the-wind-wanders-port` + `apps/showcase-where-the-wind-wanders-port`) — Stone Belltower, Brass Bell, Timber Cottages & Kite
- **Disjoint File Ownership:**
  - `CREATE` `examples/where-the-wind-wanders-port/art/proceduralModels.ts`
  - `MODIFY` `examples/where-the-wind-wanders-port/scenery.ts` (`buildScenery`), `examples/where-the-wind-wanders-port/models.ts` (`addStaticModels`, `addAnimatedModels`), `examples/where-the-wind-wanders-port/world.ts` (`buildWorld`), `examples/where-the-wind-wanders-port/main.ts` (`watchModelLoads`), `examples/where-the-wind-wanders-port/art/direction.ts`
- **Replay-Parity Contract (`reference-replay.test.ts` — exact trajectory, `[0,1,2]` letter discovery & bell completion):**
  - Never modify `sim.ts` (`VIRTUAL_STEP_MS`, `createState`, `stepFrame`, `runScript`) or `LETTERS`/`BELL` trigger coordinates.
- **Rigged Skinned Hero GLB Preserved (`skins: 1, joints: 24, clips: [Walk, Run, Idle]`):**
  - Keep `assets/models/hero.glb` (`hero-animator.test.ts` parses `hero.glb` directly for `< 15%` stride slip, and `world.ts:721,775` binds `look-at` IK & `socket("RightHand")` for the catenary `kite-thread`).
- **Static Meshy Clay GLBs (11) Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Hilltop `belltower` & `belltowerBell` (`bell` / `bell-model`) -> Dressed limestone-and-timber open belfry (`geometry.multiMaterial`: chamfered ashlar piers, flared slate hip roof, carved oak crossbeams) housing a `latheMesh` cast-bronze `studioMetal` sanctuary bell with clapper & yoke.
  2. Valley Architecture, Boat & Foliage (`cottage`, `oak`, `pine`, `stones`, `shrub`, `boat`) -> Whitewashed stone-and-thatch/slate `cottage` assemblies (**preserving exact `chimney` smoke-emitter anchor coordinates!**), clinker-planked wooden row`boat` with oars at the cove, gnarled multi-puff `oak` & layered `pine` canopies (preserving wind sway), lichen-dappled cairn `stones`, and flowering `shrub` clusters.
  3. Interactive Relics (`letter` -> `letter-0..2`; `kite` -> `kite`; `wisp` -> `wisp`) -> Cream parchment `letter` envelopes sealed with crimson `lacquer` wax stamps, bamboo-framed swallowtail fabric `kite` with fluttering ribbon tails (anchored to `kite-thread`), and luminous filigree lantern `wisp` (`?look=original`). Update `watchModelLoads()` in `main.ts` so boot only tracks `hero.glb`.
- **Advanced `@aura3d/engine` Graphics & Painterly Meadow Polish:** Build the hilltop open belfry with `archwayVoussoirSlots` dressed ashlar stone + flared slate roof + `latheMesh` cast-bronze `studioMetal` sanctuary bell, pair cove/stream scenes with gentle `material.caustics` & `effects.godRays` (`meadow-shaft-0..2`), `layeredCanopyMesh` + `coniferBoughTierMesh` wind-bent trees, `material.fabric` cloak sheen on `hero.glb`, and translucent `fabric` swallowtail `kite` on the catenary `kite-thread`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/where-the-wind-wanders-port && node tools/game-checks/run.mjs where-the-wind-wanders-port`

### `WP-28` — Duneglide (`examples/silt-and-signal-port` + `apps/showcase-silt-and-signal-port`) — Sail-Hoverboard, Desert Aqueducts, Gatehouse & Signal Rings
- **Disjoint File Ownership:**
  - `CREATE` `examples/silt-and-signal-port/art/proceduralModels.ts`
  - `MODIFY` `examples/silt-and-signal-port/architecture.ts`, `examples/silt-and-signal-port/world.ts` (`buildWorld`), `examples/silt-and-signal-port/art/direction.ts`
  - *(**CRITICAL:** Leave `examples/silt-and-signal-port/assets.ts` (`ASSET_HASHES`) and `.glb` files on disk untouched so `tests/unit/silt-and-signal-port/terrain.test.ts:106-123` SHA-256 verification stays 100% green!)*
- **Replay-Parity & Collider Contract (`reference-replay.test.ts` `< 1e-6`, `world-ch0.test.ts` `1e-9`):**
  - Never modify `sim.ts`, `collide.ts`, `world-ch0.ts` (`CHAPTER0_WORLD_COLLIDERS`), `colliders-ch0.ts`, or `terrain.ts` (`createTerrain().props()` & `terrainPhysics()`: `HOUSE_HALF_X=0.82, HOUSE_HALF_Z=0.49, HOUSE_HEIGHT=0.88`, `TREE_COLLIDER_R=0.22`, `ROCK_COLLIDER_R=0.45`, `LAMP_COLLIDER_R=0.16`).
- **Rigged Skinned Courier GLB Preserved (`skins: 1, joints: 24`):**
  - Keep `assets/models/courier.glb` on `node("rider")` (`createAnimationController` + per-frame athletic carve quaternion overlays on `Spine/Spine01/Head/LeftLeg/RightLeg/LeftArm/RightArm` + `siltFx` `motesNode: "rider"`).
- **Static Meshy Clay GLBs (12) Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Hero `hoverboard` (`board` + `board-trim`, `board-sail`, `thruster-l`, `thruster-r`) -> Lofted brass-and-lacquered desert sand-skiff (`geometry.multiMaterial`: contoured deck with foot-straps, brushed-brass nose/rail trim, billowing woven `fabric` trim-sail, twin `latheMesh` ion `thruster-l/r` pods).
  2. Signal Rings (`ringgate`, `ringclean` -> `rings` `instances.custom` pool of `MAX_RINGS = 8` updated via `node("rings").setInstances(...)` at `world.ts:1216`) -> Fluted brass-and-sandstone resonance ring gate with inlaid turquoise `practical: true` signal chevrons.
  3. Chapter-0 & Desert Landmarks (`gatehouse` -> `gatehouse-neri`, `aqueduct` -> `aqueduct-east|west`, `watchtower-0..1`, `stall-0..1`, `banner-0..7`, `pillar-0..5`, `lantern`, `canyonrocks`, `silt_and_signal_port_duneAdobeA` -> `houses`, `trees`, `rocks`, `lamps`) -> Monumental sandstone `gatehouse-neri` arch, multi-span Roman-desert `aqueduct` arcades, timber-and-adobe `watchtower`s, awning-draped bazaar `stall`s, wind-rippled desert `banner`s, carved obelisk `pillar`s, adobe `houses` (`1.64×0.88×0.98 m` exact collider box), wind-swayed desert `trees` (`wind: treeWind(...)`), stratified `canyonrocks`, and brass post `lamps`.
- **Advanced `@aura3d/engine` Graphics & Sun-Baked Dune Polish:** Loft the desert sand-skiff (`board`) with contoured `lacquer` deck, `studioMetal` brass rail trim, woven `material.fabric` billowing sail, and twin `latheMesh` ion thrusters + sand-wake `effects.trail`; build `aqueduct-east|west` & `gatehouse-neri` with `archwayVoussoirSlots` sandstone masonry, `material.strata` on `canyonrocks`, and crisp `material.fabric` desert-wrap sheen + athletic carve rim-light on `courier.glb`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/silt-and-signal-port && node tools/game-checks/run.mjs silt-and-signal-port`

### `WP-29` — Cumulus Dash (`examples/kid-goku-beyond-the-clouds-port` + `apps/showcase-cloud-runner-port`) — Sculpted Kinto-Cloud, Pteranodons, T-Rex, Mesas & Kame Hut
- **Disjoint File Ownership:**
  - `CREATE` `examples/kid-goku-beyond-the-clouds-port/art/proceduralModels.ts`
  - `MODIFY` `examples/kid-goku-beyond-the-clouds-port/creatures.ts`, `examples/kid-goku-beyond-the-clouds-port/props.ts`, `examples/kid-goku-beyond-the-clouds-port/world.ts` (`buildWorld`), `examples/kid-goku-beyond-the-clouds-port/art/direction.ts`, `apps/showcase-cloud-runner-port/src/aura-assets.ts`
- **Replay-Parity Contract (`reference-replay.test.ts` — 800-step replay `< 1e-9` start speed & glider charge, exact hearts/combo/meat/falls/balls/pole/finished):**
  - Never modify `sim.ts`, `course.ts`, `chapter.ts`, `encounters.ts`, `game.ts`, `gait.ts`, or `legcycle.ts`. Keep exported function signatures in `props.ts` & `creatures.ts` intact (`scenery.test.ts` & `dressing.test.ts` call them directly), and preserve `lookNodes()` names (`storm-look.test.ts`).
- **Rigged Skinned Hero GLB Preserved (`skins: 1, joints: 24, clips: 12`):**
  - Keep `assets/meshy/hero.glb` on `node("hero")` (driven by `hero.play(...)` + `plantedGaitPose(...)` IK leg-cycle overlays).
- **Static Meshy Clay GLBs (10) Ripped Out -> Procedural `@aura3d/engine` Replacements:**
  1. Hero Glider `MESHY.cloud` (`"sky-cloud"` — **CRITICAL:** `app.effects.trail("sky-cloud", CUMULUS_GLIDER_TRAIL)` attaches to `"sky-cloud"` at `world.ts:692`!) -> Multi-puff golden nimbus cluster (`geometry.custom` / `geometry.multiMaterial` with golden-cream `ceramic` core puffs + warm rim lift `emissiveIntensity <= 0.1` + swirling tail curl).
  2. Prehistoric Encounters (`MESHY.ptero` -> `ptera-body-${i}`, `MESHY.rex` -> `rex-body`, `MESHY.boulder` -> `boulder-${i}`) -> Multi-material crested `pteranodon` (leathery membrane wings, horned cranial crest, hooked beak, articulated wingbeat), scaled emerald-and-ochre `trex` (`rex-body` with articulated jaw/teeth, dorsal osteoderms, muscular tail), and faceted volcanic `boulder-${i}` (**keep bottom-pivot `y = 0` with `1.9 m` radius so `world.ts:779-785` `±sin/cos(roll)*1.9` roll math stays exact!**).
  3. Valley Landmarks & Finale Hut (`MESHY.mesa` -> `hero-mesas`, `MESHY.treePine` -> `hero-trees-pine`, `MESHY.treeRound` -> `hero-trees-round`, `cumulusTowerA/B` -> `storm-towers` / `storm-towers-b`, `cumulusHut` -> `home` / `home-hut`) -> Stratified terracotta `hero-mesas` with emerald turf crowns, layered ink-wash `hero-trees-pine` & multi-puff `hero-trees-round`, carved limestone sky `storm-towers`, and multi-material cylindrical island `home-hut` (curved dome roof, round porthole windows, wooden porch, weathervane — **preserving `hutCentre` & `finaleBlocked` AABB for the finale camera!**).
- **Advanced `@aura3d/engine` Graphics & Storybook Cloud-Valley Polish:** Sculpt `"sky-cloud"` as a multi-puff golden cumulus cluster (`ceramic` + warm `<= 0.1` rim lift + `CUMULUS_GLIDER_TRAIL`), apply `material.strata` on terracotta `hero-mesas` & `storm-towers`, `coniferBoughTierMesh` & `layeredCanopyMesh` on valley trees, multi-material articulated `pteranodon` wings & `trex` jaws, `studioGlass` round porthole windows on `home-hut`, and vibrant anime `material.fabric` gi + `rim` separation on `hero.glb`.
- **Scoped Verification:** `pnpm exec vitest run tests/unit/kid-goku-beyond-the-clouds-port && node tools/game-checks/run.mjs cloud-runner-port`

---

### `WP-30` — Port Wrapper Sync, Catalog Digests, Workspace Build, Real-GPU Loopback Verification & Live Cloudflare Pages Cutover
- **Owner:** Parent Coordinator Agent ONLY (executes strictly after `WP-00..WP-29` all report green).
- **Step 1 — Regenerate Derived Port Wrappers, Digests & SEO Meta (`AGENTS.md` Rule 7):**
  ```bash
  node tools/showcase-port-pages/sync.mjs
  node tools/agent-examples/refresh-catalog-digests.mjs
  node tools/site/seo-meta-pass.mjs --check
  pnpm skills:sync && pnpm check:skills
  pnpm check:no-three-runtime
  ```
- **Step 2 — Workspace Build, Cross-Cutting Audits & All-30 Static Game Checks (`CODE_COMPLETE_GO`):**
  ```bash
  pnpm build
  pnpm exec vitest run tests/unit/procedural-kernel tests/unit/likeness-audit tests/unit/athletes-rebuild tests/unit/game-luma-targets.test.ts
  node tools/game-checks/run.mjs --all
  ```
  Stage only intentional source, test, wrapper, and digest files (`git status` — never stage `.m07-keys*` or touch locked worktrees) and commit `CODE_COMPLETE_GO` on `main`.
- **Step 3 — Full Marketing Site Build & Real-GPU Loopback CDP Verification (`AGENTS.md` Rule 1):**
  1. Run `pnpm --dir marketing build` (`Built 31 showcase routes, 11 catalog aliases`, `verify-asset-urls: OK`).
  2. Serve `marketing/dist` locally and attach headless Chrome over loopback CDP (`--headless=new --enable-unsafe-webgpu --use-angle=metal`, with `trap` / `finally` immediate teardown of temporary local server + Chrome PIDs; **never** local Docker or local Playwright).
  3. Capture Desktop (`1280×720`) + Mobile (`390×844`) active gameplay screenshots across all 29 upgraded routes, assert **`0` `console.error`, `0` `pageerror`, `0` `WGSL_COMPILE_ERROR` / `GPUValidationError`**, and visually inspect screenshots for silhouette clarity, bevel highlights, ground contact shadows, and HUD legibility (applying targeted polish before deploy if any route shows an artifact).
- **Step 4 — Cloudflare Pages Production Cutover & `main` Push (`https://aura3d.auraone.ai`):**
  1. Replace `marketing/dist/fixtures/asset-corpus/boom-box.glb` (`36.6 MiB` local unoptimized fixture) with the SHA-256-verified (`10d1de0e7699c79de597ac6d813e8505abf126b1a2c2e5dcc621a19d3e081cab`, `8.63 MiB`) production fixture per `tools/release/deploy-site.mjs` so Cloudflare Pages' 25 MiB per-file gate passes cleanly.
  2. Deploy directly to Cloudflare Pages production (`aura3d`):
     ```bash
     source ~/.config/auraone/cloudflare-env.sh
     wrangler pages deploy marketing/dist --project-name aura3d --branch main
     ```
  3. Smoke-check HTTP `200` + updated asset bundle hashes on `https://aura3d.auraone.ai/games/` and spot-check live showcase routes, verify `0` temporary Cloudflare preview projects/resources remain, and run `git push origin main`.

---

## 6. UI/UX, Typography & Edge-Case Specifications

1. **Licensed AuraOne Typography & Dense HUD Standard (Zero Unlicensed / Generic Fonts):**
   - Every standalone `apps/showcase-*/src/styles.css` and every port shell `examples/*-port/index.html` / `apps/showcase-port-shared/quickbar.css` must resolve strictly to self-hosted `.woff2` fonts:
     - `--font-ui`: `Whitney` (`font-variant-numeric: tabular-nums`) for buttons, coach banners, mode pills, settings, and studio cards.
     - `--font-metric`: `DIN Pro` (`font-variant-numeric: tabular-nums`) for scores, speeds, lap deltas, shot clocks, ammo counters, combo multipliers, and results tables.
     - `--font-code`: `Monument Grotesk Mono` (`tabular-nums`) for deterministic seeds, replay hashes, coordinates, and lab readouts.
   - Zero `Inter`, `Roboto`, `Geist`, `Space Grotesk`, Google Fonts `<link>`, or generic `system-ui` stacks.
2. **Mobile Portrait (`390×844`) & Desktop (`1280×720`) Viewport & Framing States:**
   - **Title / Boot State:** Instant procedural mesh mount (`0` network `.glb` stalls for static world/prop/vehicle geometry) so first playable frame settles in `< 1.5s`.
   - **Active Gameplay HUD:** Compact `32px–34px` controls, zero banner-over-coach overlap on `390×844` portrait (`safe-area-inset-*` respected), high-contrast diegetic 3D world signs (`text3D` with `backend: "sdf"` using `material.pbr` only—never `clearcoat` on SDF text).
   - **Reduced-Motion (`?still=1` / `prefers-reduced-motion: reduce`) & Legacy Look Flags:** Respect reduced-motion particle/shake suppression and preserve any existing legacy comparison query flag (e.g., `?look=original` / `?look=4.6.2`) where covered by unit tests.
   - **WebGPU Primary + WebGL2 Parity (`renderer: { backend: "auto" }`):** Every `material.custom` or `effects.shaderPass` must carry paired GLSL 3.00 ES + WGSL shader source (`0` `WGSL_COMPILE_ERROR` or `GPUValidationError`).

---

## 7. Verification & Acceptance Checklist (`- [ ]`)

### Phase A — `CODE_COMPLETE_GO` Gate (Deterministic & Anti-Shortcut — Required Before Deploy)

- [ ] **WP-00 Shared Sculpting Kernel & Automated Anti-Lego Craft Gate Complete:** `apps/showcase-port-shared/proceduralKernel.ts`, `tests/unit/procedural-kernel/procedural-kernel.test.ts`, and `tests/unit/procedural-kernel/procedural-craft-gate.test.ts` created and passing (`0` `three` imports; verifies every `proceduralModels.ts` across all 29 games has `>= 350` lines of curved/lofted/lathed/swept geometry, `>= 4` distinct physical `material.*` presets, and `0` placeholder stubs).
- [ ] **All 29 Game Full-Stack Procedural & Graphics Upgrades (`WP-01..WP-29`) Complete:** Every file listed in Section 4 created/updated with sculpted multi-material models, advanced `@aura3d/engine` materials/volumetrics/VFX (`carPaint`, `studioGlass`, `studioMetal`, `strata`, `caustics`, `lightBeam`, `volumetricBeam`, `planet`/`atmosphere`, restyled athlete/fighter `fabric`/`sneakerMesh` overrides + sculpted gear), zero `TODO`s, zero `three` imports, and zero static single-mesh Meshy clay blobs mounted in upgraded scenes.
- [ ] **Zero Three.js Runtime Gate:** `pnpm check:no-three-runtime` exits `0`.
- [ ] **Workspace TypeScript & Build Gate:** `pnpm build` exits `0` with zero type errors across all workspace packages, apps, and examples.
- [ ] **Targeted Per-Game Unit, Replay-Parity & Art-Direction Audit Suites:**
  - Existing unit, likeness/provenance (`tests/unit/likeness-audit`, `tests/unit/athletes-rebuild`), art-direction (`auditArtDirection` -> `0` violations), and deterministic replay-parity (`1e-6` / `1e-9` / `1e-12`) Vitest suites pass across all touched games, bounded to max 2 targeted fix attempts per in-scope failure with zero recursive test-expansion loops.
- [ ] **Derived Port Wrapper Sync, Catalog Digests & Static Game Checks:**
  - `node tools/showcase-port-pages/sync.mjs`
  - `node tools/agent-examples/refresh-catalog-digests.mjs`
  - `node tools/site/seo-meta-pass.mjs --check` (`OK (33 routes)`)
  - `node tools/game-checks/run.mjs --all` (`0 errors` across all 30 games)
- [ ] **Freeze `CODE_COMPLETE_GO` Commit on `main`:** Stage only intentional product/test/wrapper/digest files and record `CODE_COMPLETE_GO`.

### Phase B — Wave-Gated Metal/WebGPU Visual Polish Loop & Live Cloudflare Pages Cutover (`WP-30`)

- [ ] **Per-Wave Real-GPU Loopback CDP Capture, Direct Visual Inspection (`read_file`) & Polish Pass Across All 29 Games:**
  - For every wave (`Waves 1–5`), capture active gameplay screenshots (`1280×720` Desktop + `390×844` Mobile) via headless Chrome over loopback CDP (`--headless=new --enable-unsafe-webgpu --use-angle=metal`, immediate `finally` teardown, never local Docker or local Playwright), assert `0` `console.error` / `pageerror` / `WGSL_COMPILE_ERROR`, **visually inspect every captured PNG via `read_file`**, and execute an immediate **Visual Polish Pass** on any route exhibiting boxy proportions, polar UV rings, wet-grass SSR glare, floating geometry, or low HUD contrast.
- [ ] **Full Marketing Site Build & All-30 Before/After Visual Comparison Gallery:** `pnpm --dir marketing build` exits `0` (`Built 31 showcase routes, 11 catalog aliases`, `verify-asset-urls: OK`) and side-by-side before/after screenshots are written for owner review.
- [ ] **Cloudflare Pages Production Deployment & Live Smoke Check (`https://aura3d.auraone.ai`):**
  - Swap `marketing/dist/fixtures/asset-corpus/boom-box.glb` to the SHA-256-pinned (`10d1de0e7699c79de597ac6d813e8505abf126b1a2c2e5dcc621a19d3e081cab`, `8.63 MiB`) production fixture per `tools/release/deploy-site.mjs`, deploy via `source ~/.config/auraone/cloudflare-env.sh && wrangler pages deploy marketing/dist --project-name aura3d --branch main`, verify HTTP `200` + live bundle hashes on `https://aura3d.auraone.ai`, verify `0` temporary Cloudflare preview remnants, and `git push origin main`.

---

## 8. Out of Scope & Anti-Stall Guardrails

1. **Out of Scope (`Separate Work` — Do Not Touch):**
   - No npm package version bumps (`5.5.1` stays unchanged per Shipping Rule 6), no `npm publish`, and no full ACR package-release pass (Shipping Rule 1 & Rule 3: games and site changes ship site-only).
   - Do not touch `apps/veer-wonder-world/**`, locked `aura3d-cand*` / `aura3d-site*` worktrees, `release/*` branches, or unrelated untracked files (`.m07-keys*`).
   - Do not rewrite deterministic physics/replay simulation math in `examples/*-port` (`1e-6` / `1e-9` / `1e-12` parity is sacred).
   - Do not replace `Slingshot Siege` (`apps/showcase-slingshot-siege`), which is already 100% procedural and shipped live in commit `8bf9eb5bb`.
2. **Hard Prohibitions:**
   - **Zero `three` / Three.js:** Never import, install, vendor, or copy `three` types, geometries, or shaders anywhere.
   - **Zero Local Docker or Local Playwright:** Never invoke `docker` locally or run `playwright test` on this Mac; real-GPU checks use headless Chrome over loopback CDP with immediate process cleanup.
   - **Zero Scope Inflation, Human Hostage Gates, or External Critic Loops:** Never pause to ask for human sign-off between waves (unless the owner explicitly asked to run only Wave 1), never invoke external LLM/Prism/ChatGPT review loops, and emit non-blocking 10-minute progress heartbeats against the frozen `31`-WP denominator until 100% shipped live.
