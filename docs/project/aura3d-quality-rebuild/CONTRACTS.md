# Aura3D Quality Rebuild: CONTRACTS.md (contracts-first parallel execution)

Status: authoritative for the program. Written 2026-10-05 against branch `aura3d-quality-rebuild/audit`, HEAD `85aafcd0`.
Inputs:
- PRD-01..PRD-15 (this directory).
- The parallel conflict map: 253 dependency edges, 105 shared files, 651 affected-path entries. It was given as task input.
  Its target path, `_sections/parallel-conflict-map.md`, does not exist at `85aafcd0`.
- Research 19, 21, 22 and 23.

Purpose: 15 lane teams (one per PRD) start on the same day. No lane waits for another. Every cross-PRD need is a numbered
contract (C-01..C-40). Each contract has a frozen TypeScript surface, a stub that ships in PR 0, and a conformance test.
The real implementation replaces the stub behind a flag.

This document records no visual result. A green conformance test or engineering gate shows that an interface behaves
as specified. It does not show that Aura3D looks like three.js. Visual parity claims come only from the integration
checkpoint judgments in §7: vision plus human panel (G-PANEL, PRD 12) against the three r185 references in
`benchmarks/quality-rebuild/`.

Line anchors below were re-verified with `rg`/`sed` at `85aafcd0` unless marked "(map)", which means the anchor is
taken from the conflict map's verified list. `packages/engine/src/agent-api/index.ts` is 18,733 lines.

---

## 0. Cross-PRD conflicts resolved by this document

Several PRDs propose the same surface. Each row below fixes the single provider, and the PRD text must be read through
these rows. PRD lanes update their own PRD files to match during the Parallelize phase.

| # | Conflict (PRDs) | Resolution | Contract |
|---|---|---|---|
| R1 | `AuraQualityTier` is defined in PRD 01 §17, PRD 03, PRD 05 and PRD 11 | PRD 11 owns the type and the settings table. Everyone else imports it from `packages/rendering/src/contracts/quality.ts` (re-exported by engine). The value set is `'low'\|'medium'\|'high'\|'ultra'`, and `'auto'` appears only in option types. | C-27 |
| R2 | Tone-mapping operators and `setOutput`: PRD 01 `OutputPass` vs PRD 03 `AuraOutputOptions`/`ToneOperators.ts` | PRD 01 owns `OutputPass`, the operator enum and the single tone-map shader (`output/ToneMappingOperators.glsl.ts`). PRD 03 owns everything upstream of `OutputPass` (post graph, auto-exposure, presets) and passes values into `OutputPass`. There is one `AuraOutputOptions` type (C-05). PRD 03 adds `preset`/`autoExposure` semantics to it (C-13). `app.setOutput` is implemented by PRD 01. PRD 03's `ToneOperators.ts` is a CPU reference kept for tests only. | C-05, C-13 |
| R3 | Two program caches: PRD 01 `ProgramCache` vs PRD 04 `PhysicalProgramCache` | There is one `ProgramCache` (PRD 01). PRD 04 contributes lobes via the MaterialLobe registry (C-03) and does not ship a second cache. Any `PhysicalProgramCache` name stays only as a type alias of `ProgramCache`. | C-02, C-03 |
| R4 | DFG LUT: PRD 01 "renderer-owned `u_dfgLut`" vs PRD 04 `createDFGLut` | PRD 01 owns `BRDFLut.ts` and binding `u_dfgLut` (r185 16x16 RG16F). PRD 04 consumes it. | C-02 |
| R5 | Morph texture: PRD 01 `MorphTargetTexture.fromGeometry` vs PRD 06 `buildMorphTargetTexture` | PRD 06 owns all deformation resources and chunks: morph texture, skinning palette, `a3dDeform`. PRD 01's generator includes the `deform` chunk through C-02. The `resources/MorphTargetTexture.ts` file moves to PRD 06. | C-18 |
| R6 | KTX2 target selection: PRD 04 `selectKTX2TargetFormat(caps, hasAlpha)` vs PRD 05 4-arg version | PRD 05's signature wins: `(caps, source, hasAlpha, colorSpace)`. PRD 04 consumes it. `packages/assets/src/KTX2TargetSelection.ts` is owned by PRD 05. | C-16 |
| R7 | `sceneKits` lighting vs `promptRecipes` (PRD 02 vs PRD 13, the C-02-kits item) | PRD 02 owns the scene-kit builder region `index.ts:9841-10005` (`makeSceneKit` at :9841, `sceneKits` at :9994), which is carved out to `nodes/sceneKits.ts`. PRD 13 owns the prompt-plan block `index.ts:10103-10363` (`definePromptPlan` :10103, `compilePromptPlan` :10118, `promptRecipes` :10147-10250, warnings to ~:10363), which is carved out to `nodes/prompt/*.ts`. PRD 02's task "update scene kits (`index.ts:10152-10245`)" points at recipe lines and is withdrawn. PRD 02 delivers its lighting recipe to PRD 13 as facts (C-40). | C-36, C-40 |
| R8 | `index.ts:18256` "Scene has no lights … lights.ambient()" warning (PRD 02 vs PRD 13, the C-02-lint item) | PRD 13 owns `collectGeneratedCodeWarnings` (`index.ts:18253-18293`), carved out to `looks/generatedCodeWarnings.ts`. It replaces the line with `lookLint`. PRD 02 does not edit it and registers `look/ambient-flattens` through `registerLookLintRule`. | C-34 |
| R9 | Anisotropy defaults: PRD 04 (L4/M8/H16/U16) vs PRD 11 table (L2/M4/H8/U16) | Frozen as **L4 / M8 / H16 / U16**. PRD 11's values would drop Medium below today's default of 8 (`Sampler.ts` `DEFAULT_SAMPLER_ANISOTROPY`, PRD 04 :1287). PRD 11 updates its table. | C-27 |
| R10 | Ultra froxel grid: PRD 11 table 240x135x128 vs PRD 07 request 240x135x96 | Frozen as **240x135x128**. When the PRD 11 Ultra memory budget check fails, PRD 07 may drop to 240x135x96 and must report `diagnostics().effects.atmosphere.volumetric.grid` and `VOLUMETRIC_GRID_REDUCED`. | C-27 |
| R11 | Particle budget Ultra: PRD 07 stub copy says 100k; PRD 11 table says 200k WebGPU-compute / else 100k | PRD 11 table wins. The stub uses 100,000. | C-27 |
| R12 | `AuraMaterialSpec.alphaMode/alphaCutoff` declared by both PRD 04 and PRD 10 | PRD 04 owns the semantics. PRD 10 consumes. | C-15 |
| R13 | `game.effects` / `GameFxLayer` (PRD 09) vs `app.effects` (PRD 07) | PRD 07 owns the VFX runtime (`app.effects`). PRD 09 owns the `GameFxLayer` facade with `backend: 'primitive-pool'\|'particle-pass'`. The facade's `'particle-pass'` backend calls C-20. | C-20, C-24 |
| R14 | Runtime node `add/remove`: PRD 07 C-07-OUT-5 vs PRD 15 registry | PRD 15 implements `AuraRuntimeNodeRegistry.add/remove`. PRD 07 consumes it, and its semantics text (C-07-OUT-5) is the spec input. | C-37 |
| R15 | Hit-stop / time scale: PRD 08 `app.time` vs PRD 09 `GameSession.hitStop` vs PRD 09 `FrameLoop.setTimeScale` | PRD 08 owns `AuraTimeController` and `FrameLoop.ts`. PRD 09's `GameSession` delegates to `app.time`. PRD 06 reads `handle.timeScale` (C-23). | C-23 |
| R16 | Touch controls: PRD 08 `mountTouchControls(app, input, layout)` vs PRD 09 `mountTouchControls(input, opts)` | PRD 09's `@aura3d/game` version is the public API (C-24). PRD 08 owns the engine-level input primitives (`packages/input/src/VirtualTouchControls.ts`, `Haptics.ts`, `controls/DevicePrompts.ts`). PRD 08's `controls/TouchControls.ts` becomes the internal implementation that PRD 09 wraps. | C-24 |
| R17 | Audio additions: PRD 08 `GameAudio.loop/engine/attachListener` vs PRD 09 `GameSoundEngine` | PRD 09 owns all audio (C-25). PRD 08 consumes `setListener` through `app.camera.presented()`. | C-25 |
| R18 | Instance-size bug (`createProductionInstanceTransforms` ignores `node.size`, `index.ts:14747`, research 22) is claimed by PRD 10 V4 and PRD 15 | PRD 15 owns `compiler/primitives.ts`, where `index.ts:14747-14754` moves. The fix ships behind no flag because it is a correctness bug. The 16-instancing benchmark scene result changes, and PRD 12 re-baselines that scene. | C-36 |
| R19 | `Renderer.create`/`renderFrame`/device-lost: PRD 15 vs PRD 11 `ResourceRegistry` | PRD 11 owns the backend factory and the device lifecycle (`renderer/RendererFactory.ts`, `renderer/DeviceLifecycle.ts`). PRD 15 consumes them for the single-renderer arch gate. | C-29 |
| R20 | Templates and skills edited by PRDs 02, 03, 05, 06, 08, 09, 11, 15 | PRD 13 is the only writer. Other lanes send facts (C-40) or template requests. `packages/create-aura3d/templates/character-hero/` (PRD 06 proposal) is written by PRD 13 from PRD 06's acceptance bar (PRD 06 §17.2). | C-40 |
| R21 | Game route `main.ts` files edited by PRDs 01, 03, 04, 05, 06, 08, 09, 11 | PRD 14 is the only writer. Other lanes ship codemods or reports (core-v2, post-v2, pin-emissive-defaults, animation-3.1, camera-cast, prd11-batch-optout, migrate lighting). PRD 14 applies them per route. | §4 |
| R22 | `games.json` fields from PRDs 02, 06, 09, 11, 12, 14 | PRD 14 owns the data. PRD 12 owns `tools/quality-rebuild-capture/games.schema.json`, which PR 0 creates with every field optional. | C-33, C-35 |

---

## 1. Principle

1. Every cross-PRD dependency in the conflict map is a contract: a TypeScript interface, its semantics, a stub, and a
   conformance test. A PRD never says "after PRD X". It names the contract IDs it consumes and the IDs it provides.
2. **Consumers build against the stub.** Each stub is either the engine's current behavior wrapped in the contract
   shape, or a small honest reference implementation. A stub never fakes evidence. When the real capability is
   absent, the stub reports it in diagnostics (`degradations`, `*_PENDING` codes) rather than claiming it ran.
3. **Providers build the real implementation in their own files.** They register it into the contract slot from their
   lane barrel. The real implementation must pass the same conformance suite as the stub, plus its own tests.
4. **Swapping is a flag flip.** `ContractSlot.get(flags)` returns the real implementation when it has been provided and
   its flag is on. Otherwise it returns the stub. No consumer code changes at swap time.
5. **Contracts are frozen.** After PR 0 merges, a signature can only change through a Contract Change Request
   (CCR, §6.4). Additive optional fields are cheap. Breaking changes need a new contract version (`C-09v2`) alongside
   the old one, and are not expected during the program.
6. **Single writer.** Every file has exactly one owning lane (§4). Lanes add behavior to shared hot files only through
   the registries and hooks that PR 0 creates (§3).
7. **Integration never blocks.** Integrated visual acceptance is evaluated at weekly checkpoints with all flags on (§7).
   A failure becomes a bug against the owning lane. It does not hold another lane's merge.

### 1.1 Shared mechanics (PR 0a, file `packages/rendering/src/contracts/core.ts`)

`@aura3d/rendering` is the lowest package shared by renderer, assets and engine (its dependencies are math and
scene). Packages that do not depend on rendering get contracts by type-only duplication. `@aura3d/audio` and
`@aura3d/animation` define pure types in their own `src/contracts/` folders, and engine binds them to slots.

```ts
export type PrdId =
  | "prd01" | "prd02" | "prd03" | "prd04" | "prd05" | "prd06" | "prd07" | "prd08"
  | "prd09" | "prd10" | "prd11" | "prd12" | "prd13" | "prd14" | "prd15";
export type ContractId = `C-${string}`;      // "C-01".."C-40", versioned "C-09v2"

/** Full flag names; see §5. */
export type QrFlagName =
  | "A3D_QR_CORE" | "A3D_QR_LIGHTING" | "A3D_QR_POST" | "A3D_QR_MATERIALS" | "A3D_QR_ASSETS"
  | "A3D_QR_ANIMATION" | "A3D_QR_VFX" | "A3D_QR_CAMERA" | "A3D_QR_GAME" | "A3D_QR_WORLD"
  | "A3D_QR_TIERS" | "A3D_QR_WEBGPU" | "A3D_QR_LOOKS" | "A3D_QR_COMPILER" | "A3D_QR_STRICT"
  | `A3D_QR_${string}_${string}`;           // sub-flags, e.g. A3D_QR_POST_TAA
export type QrFlagValue = boolean | string;  // string only for multi-valued flags (A3D_QR_CORE = "v2")
export interface QrFlags { readonly values: Readonly<Partial<Record<QrFlagName, QrFlagValue>>>; on(name: QrFlagName): boolean; }

export interface ContractSlot<T> {
  readonly id: ContractId;
  readonly owner: PrdId;
  readonly flag: QrFlagName;
  readonly stub: T;
  /** True once the provider lane has called provide(). */
  readonly provided: boolean;
  /** Called exactly once, from the provider's lane barrel. A second call throws `CONTRACT_ALREADY_PROVIDED:<id>`. */
  provide(real: T): void;
  /** Real impl iff provided && flags.on(flag); otherwise stub. Call at mount/resolve time, never per draw. */
  get(flags: QrFlags): T;
}
export function defineContractSlot<T>(id: ContractId, owner: PrdId, flag: QrFlagName, stub: T): ContractSlot<T>;

/** Registry primitive used by every hook registry in §3 (ordered, owner-tagged, duplicate-id safe). */
export interface RegistryEntry { readonly id: string; readonly owner: PrdId; readonly flag: QrFlagName; readonly order?: number; }
export interface Registry<E extends RegistryEntry> {
  register(entry: E): () => void;                 // duplicate id throws REGISTRY_DUPLICATE:<id>
  active(flags: QrFlags): readonly E[];           // entries whose flag is on, sorted by (order ?? 0, id)
  all(): readonly E[];
}
export function createRegistry<E extends RegistryEntry>(name: string): Registry<E>;
```

Engine-level contracts live in `packages/engine/src/contracts/*.ts`. They import these primitives from
`@aura3d/rendering` (export path `@aura3d/rendering/contracts`, added in PR 0a). Unqualified names in engine
signatures below resolve as follows:
- `RegistryEntry`, `QrFlags`, `PrdId`, `QrFlagName`, `ContractSlot`: this core module.
- `AuraQualityTier`: C-27.
- Existing `Aura*` types: `agent-api/index.ts`.

Flag resolution lives in `packages/engine/src/contracts/flags.ts`:

```ts
export type QrFlagInput = "all" | readonly string[] | Readonly<Partial<Record<QrFlagName, QrFlagValue>>>;
export function resolveQrFlags(input: { readonly options?: QrFlagInput; readonly url?: URL | string; readonly env?: Readonly<Record<string, string | undefined>> }): QrFlags;
// createAuraApp/createGameApp option: qualityRebuild?: { readonly flags?: QrFlagInput; readonly allowUrlFlags?: boolean /* default true */ }
```

Conformance harness (PR 0a, `tests/unit/contracts/harness.ts`):

```ts
export function conformance<T>(slot: ContractSlot<T>, suite: (impl: T, label: "stub" | "real") => void): void;
// Runs suite(slot.stub, "stub") always. Imports the lane barrels (`@aura3d/rendering/lanes`, `@aura3d/engine/lanes`)
// and runs suite(real, "real") when slot.provided. Browser variants: tests/browser/contracts/harness.ts, same API.
```

Conformance test layout:
- Unit suites live at `tests/unit/contracts/C-NN-<slug>.test.ts` and are picked up by `pnpm test:unit`
  (`vitest run tests/unit`).
- Browser suites live at `tests/browser/contracts/C-NN-<slug>.spec.ts`. They run remotely in
  `.github/workflows/qr-contracts.yml` on macos-14 (Chromium, ANGLE Metal), the same runner class as
  `quality-rebuild-capture.yml` (run 37289688772).
- Conformance files belong to PRD 15, the contract custodian. A provider adds real-implementation-specific cases in
  its own `tests/unit/contracts/impl/prdNN-*.test.ts`.

---

## 2. Contract catalog

### 2.0 Index

| ID | Contract | Provider | Consumers | Flag | PR 0 | PRD-proposed aliases |
|---|---|---|---|---|---|---|
| C-01 | FrameGraph phase hooks (pass registration) | 01 | 02,03,04,06,07,08,10,11,13 | A3D_QR_CORE | 0a+0b | C-07-IN-3 |
| C-02 | ProgramFeatures + ShaderFeature/chunk registry + ProgramCache | 01 | 02,03,04,05,06,07,08,10,11,13,15 | A3D_QR_CORE | 0a | C-07-IN-4; PRD 01 "generator feature record" |
| C-03 | MaterialFeature lobe registry | 04 | 01,06,07,10,13,14 | A3D_QR_MATERIALS | 0a | PRD 04 PhysicalFeatureSet |
| C-04 | BlendMode / RenderCommandState / DepthCompare | 01 | 03,04,07,11,14 | A3D_QR_CORE | 0a | C-07-IN-1 |
| C-05 | Output: HDR target, tone mapping, exposure, background coverage, output overlay | 01 | 02,03,04,05,07,09,11,12,13,14,15 | A3D_QR_CORE | 0a+0b | C-01-quality (part) |
| C-06 | Scene graph transforms + color parsing | 01 | 08,09,10,15 | A3D_QR_CORE | 0a | — |
| C-07 | Primitive tessellation + InstanceBuffer | 01 | 06,07,09,10,11,13,14 | A3D_QR_CORE | 0a | C-01-quality (part) |
| C-08 | Frame uniforms (AuraFrame/AuraLights UBO) + CameraLike | 01 | 02,03,07,08,10,11 | A3D_QR_CORE | 0a | — |
| C-09 | EnvironmentSource / EnvironmentProbe | 02 | 01,03,04,05,06,07,10,13,14,15 | A3D_QR_LIGHTING | 0a+0b | C-07-IN-5, C-02-env |
| C-10 | Lighting API + lighting runtime | 02 | 01,03,06,10,12,13,14,15 | A3D_QR_LIGHTING | 0a | C-02-env |
| C-11 | ShadowCaster depth-variant hook + shadow lookup | 02 | 01,03,04,05,06,07,10,11,13,14,15 | A3D_QR_LIGHTING | 0a+0b | C-07-IN-6 |
| C-12 | Sampler / texture-sampling descriptors (device mapping) | 02 | 01,04,05,10 | A3D_QR_LIGHTING | 0a+0b | — |
| C-13 | PostPass registry + post pipeline + output presets | 03 | 01,02,07,08,09,10,11,13,14,15 | A3D_QR_POST | 0a+0b | C-03-post, C-07-IN-8 (part) |
| C-14 | Velocity / temporal history | 03 | 01,06,07,08,11,14,15 | A3D_QR_POST | 0a+0b | C-07-IN-8 |
| C-15 | Material spec additions + model material overrides | 04 | 03,05,09,10,13,14,15 | A3D_QR_MATERIALS | 0a | C-04-override |
| C-16 | Compressed textures + decoder registry | 05 | 01,04,07,10 | A3D_QR_ASSETS | 0a+0b | — |
| C-17 | Asset manifest 1.1 / AssetOptimize / admission | 05 | 06,07,09,10,13,14,15 | A3D_QR_ASSETS | 0a | C-05-assets, C-07-OUT-3 (consumer side) |
| C-18 | Deformation resources (texture update/2d-array, palette, morph, deform chunk) | 06 | 01,02,03,04,11,14 | A3D_QR_ANIMATION | 0a+0b | — |
| C-19 | AnimationPlayback API | 06 | 05,07,08,09,13,14,15 | A3D_QR_ANIMATION | 0a | C-06-anim, C-07-IN-7 |
| C-20 | ParticleEmitter render hook + `app.effects` | 07 | 08,09,11,13,14,15 | A3D_QR_VFX | 0a | C-07-OUT-1, C-07-OUT-7, C-07-fx |
| C-21 | Sky / fog / atmosphere | 07 | 01,02,03,10,11,13,14,15 | A3D_QR_VFX | 0a | C-07-OUT-2, C-07-OUT-4 |
| C-22 | CameraRig live API | 08 | 03,06,07,09,12,13,14 | A3D_QR_CAMERA | 0a | C-08-camera |
| C-23 | Time controller + feel bus + screen-feel uniforms | 08 | 03,06,07,09,14 | A3D_QR_CAMERA | 0a | — |
| C-24 | GameShell / Session / HUD / Touch / capture context | 09 | 08,12,13,14 | A3D_QR_GAME | 0a | C-09-game |
| C-25 | Game audio | 09 | 08,13,14 | A3D_QR_GAME | 0a | — |
| C-26 | World queries: ground raycast, height, wind, biome | 10 | 02,06,07,08,13,14 | A3D_QR_WORLD | 0a | C-07-IN-11, C-10-biome |
| C-27 | QualityTier settings | 11 | all other lanes | A3D_QR_TIERS | 0a | C-07-IN-9, C-11-tier |
| C-28 | Device capabilities: probe, counters, compileAsync, FrameStats, resource registry | 11 | all lanes except 10,11 | A3D_QR_TIERS | 0a+0b | — |
| C-29 | Renderer factory / backends / frame API / device lifecycle | 11 | 01,02,03,04,05,06,07,09,12,14,15 | A3D_QR_WEBGPU | 0b | — |
| C-30 | Benchmark scene registry + ReadyPayload + report schema | 12 | all lanes except 12,13 | (tooling) | 0a | C-07-OUT-8, C-12-harness |
| C-31 | Diagnostics / evidence schema + sections registry | 12 | all other lanes | (tooling) | 0a+0b | C-12-harness |
| C-32 | VisualReview rubric / judgement schema | 12 | all lanes except 10,12 | (tooling) | 0a | C-12-harness |
| C-33 | Capture harness interface (+ capture step plugins, games.json schema) | 12 | all other lanes | (tooling) | 0a | C-12-harness |
| C-34 | Looks + lookLint rule registry | 13 | 02,07,08,09,10,12,14 | A3D_QR_LOOKS | 0a+0b | P-13-looks, P-13-lint, C-02-lint |
| C-35 | Art direction + game acceptance schema | 14 | 05,09,11,12,13 | (data) | 0a | — |
| C-36 | SceneCompiler extension points | 15 | 01,02,03,04,05,06,07,08,10,11,12,13 | A3D_QR_COMPILER | 0a+0b | C-07-IN-10, C-07-OUT-6 |
| C-37 | RuntimeNode add/remove + node-handle extensions | 15 | 02,04,06,07,08,09,10,11,14 | A3D_QR_COMPILER | 0a+0b | C-07-OUT-5 |
| C-38 | App surface extension registry (AuraApp / options / diagnostics members) | 15 | all other lanes | — (infrastructure) | 0a+0b | — |
| C-39 | CLI command + codemod registry | 15 | all lanes except 12,15 | — (infrastructure) | 0a+0b | — |
| C-40 | Facts handoff tables (skills, recipes, defaults) | each lane → 13 | 01,02,03,04,05,06,08,09,10,11,15 | — | none | C-07-OUT-9, P-13-skills |

Column "PR 0" means:
- `0a`: only new contract or stub files are needed.
- `0b`: a seam or verbatim carve-out in an existing hot file is also needed.
- `none`: purely additive. The contract is a document table that lanes fill in, and no PR 0 code is needed.

### 2.1 Entry format

Each entry gives the following, in this order:
- Provider and consumers.
- The file that holds the frozen contract. PR 0 creates it, and it is custodian-owned by PRD 15.
- The signatures, in full.
- Semantics and invariants.
- The stub that ships in PR 0.
- What "real" must add.
- The conformance test.
- The flag.

Types not defined in an entry come from existing code: `Geometry`, `Texture`, `RenderTarget`, `RenderDevice`,
`Mat4`, `AuraVec3`, `AuraNodeBuilder`, `AuraSceneSnapshot`, `AuraColor`.

---

### C-01 FrameGraph phase hooks
Provider: PRD 01. Consumers: 02 (shadows, contact shadows, probes), 03 (post inputs), 04 (transmission capture), 07 (sky, particles, decals, volumetrics), 08 (presented-pose injection), 10 (water, scene-color copy, reflection views), 11 (batching, culling).
File: `packages/rendering/src/contracts/frameGraph.ts`. Seam: `packages/rendering/src/renderer/FrameGraph.ts` (PR 0b).

```ts
import type { RenderPass } from "../RenderPass";
import type { RenderItem } from "./renderItem";
import type { RenderSource } from "./renderSource";
import type { CameraLike } from "./frameUniforms";
import type { AuraQualityTierSettings } from "./quality";
import type { QrFlags, PrdId, QrFlagName, RegistryEntry } from "./core";

export type AuraFramePhase =
  | "collect"            // mutate/replace the item list before any GPU work (LOD, batching, interpolation, culling)
  | "shadows"            // shadow/depth work; may publish ShadowFrameUniforms
  | "background"         // sky/environment background draws (writes aura.scene.color before opaque)
  | "opaque"             // reserved: PRD 01 forward opaque
  | "after-opaque"       // scene depth copy, contact shadows, SSR inputs, scene-color copy
  | "transmission"       // PRD 04 transmission capture
  | "transparent"        // contributes TransparentQueueItems sorted with forward transparents
  | "after-transparent"  // decals/ribbons that must follow transparents
  | "post-hdr"           // linear-HDR passes before OutputPass (C-13 owns ordering inside this phase)
  | "output"             // reserved: PRD 01 OutputPass
  | "after-output";      // LDR overlays (debug views only); never used for look-affecting work

/** Well-known frame resource names (RenderGraph reads/writes). */
export const FRAME_RESOURCES: {
  readonly sceneColor: "aura.scene.color";        // RGBA16F linear HDR when A3D_QR_CORE=v2, else legacy target
  readonly sceneDepth: "aura.scene.depth";
  readonly sceneDepthCopy: "aura.scene.depth.copy";
  readonly sceneVelocity: "aura.scene.velocity";  // C-14
  readonly sceneReactive: "aura.scene.reactive";  // C-14
  readonly sceneColorCopy: "aura.scene.color.copy";
  readonly shadowMaps: "aura.shadow.maps";
  readonly output: "aura.output";
};

export interface FrameCamera extends CameraLike {
  readonly viewMatrix: Float32Array;
  readonly projectionMatrix: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly previousViewProjectionMatrix: Float32Array | null;
  readonly near: number;
  readonly far: number;
  readonly projection: "perspective" | "orthographic";
  readonly position: readonly [number, number, number];
}

export interface TransparentQueueItem {
  readonly sortDepth: number;             // view-space depth, larger = farther
  readonly order?: number;                // tie-break, lower first
  draw(ctx: FrameContributorContext): void;
}

export interface SceneDepthSource {         // C-07-IN-2
  readonly texture: import("../Texture").Texture | null;
  readonly linearize: { readonly near: number; readonly far: number; readonly orthographic: boolean };
  readonly available: boolean;
}

export interface FrameContributorContext {
  readonly device: import("../RenderDevice").RenderDevice;
  readonly width: number;
  readonly height: number;
  readonly frameIndex: number;
  readonly timeSeconds: number;
  readonly camera: FrameCamera | null;
  readonly source: RenderSource;
  readonly items: readonly RenderItem[];
  readonly tier: AuraQualityTierSettings;
  readonly flags: QrFlags;
  readonly sceneDepth: SceneDepthSource;
  /** Publish/read cross-pass values (e.g. "shadow.frameUniforms"); keys namespaced "<prdNN>.<name>". */
  readonly blackboard: Map<string, unknown>;
}

export interface FrameContributor extends RegistryEntry {
  readonly id: string;                      // "<prdNN>.<name>", e.g. "prd07.particles"
  readonly owner: PrdId;
  readonly flag: QrFlagName;
  readonly phases: readonly AuraFramePhase[];
  readonly order?: number;
  collect?(items: RenderItem[], ctx: FrameContributorContext): RenderItem[];
  passes?(phase: AuraFramePhase, ctx: FrameContributorContext): readonly RenderPass[];
  transparentItems?(ctx: FrameContributorContext): readonly TransparentQueueItem[];
  dispose?(): void;
}

export function registerFrameContributor(contributor: FrameContributor): () => void;
export function frameContributors(flags: QrFlags): readonly FrameContributor[];
```

Semantics and invariants:
- Contributors are only invoked when their flag is on. With every flag off, the frame is bit-identical to `85aafcd0`.
  IC-0 checks this on all 18 games and the 18 base scenes (§7).
- `collect` runs once per frame in registration `order`. It must return the same array or a new array, and it must not
  mutate `RenderItem` objects it does not own.
- Passes returned by `passes()` are added to the existing `RenderGraph` (`Renderer.ts:428`, `RenderGraph.ts:16`) and
  ordered by declared `reads`/`writes` of `FRAME_RESOURCES`. Writing a resource another pass writes throws, as
  `RenderGraph.compilePlan` does today.
- `opaque` and `output` are reserved. Registering any contributor for them except `prd01.*` throws
  `FRAME_PHASE_RESERVED`.
- No phase may perform synchronous GPU readback. The C-28 counters assert `readbacksThisFrame === 0` in conformance.

Stub (PR 0b, `renderer/FrameGraph.ts`, called from `Renderer.render` :541 and `Renderer.renderAsync` :710; async-path twins at :724/:791/:819/:833/:857):
- `collect` runs right after `collectRenderItemsWithDiagnostics` (`Renderer.ts:555`).
- `shadows` runs after `executeRendererShadowMap` (:622).
- `background` passes are added after the `EnvironmentBackgroundPass` `addPass` (:650) and before the `ForwardPass`
  `addPass` (:664).
- `after-opaque`, `transmission`, `transparent` and `after-transparent` all run after the single `ForwardPass`, in that
  order. Transparents from contributors are drawn after every forward transparent. This is a documented deviation:
  water and particle interleaving is wrong until PRD 01 splits `ForwardPass`.
- `post-hdr` passes run immediately before `executePostprocess` (:680), and only when a postprocess target exists.
  Otherwise they are skipped with diagnostic `FRAME_PHASE_SKIPPED:post-hdr:<id>`.
- `after-output` runs after `executePostprocess`, before `endFrame`.
- `sceneDepth` in the stub is `{ texture: null, available: false }`. PRD 07's own `vfx/SceneDepthSource.ts` stub
  (C-07-IN-2) can blit depth itself.

Real (PRD 01):
- Split `ForwardPass` into opaque and transparent passes.
- Interleave contributor transparents by `sortDepth`.
- Provide `sceneDepthCopy` as a single-sample sampleable depth after opaque.
- Publish `FrameCamera.previousViewProjectionMatrix`.

Conformance: `tests/unit/contracts/C-01-frame-graph.test.ts` (ordering, reserved phases, flag gating, all-flags-off
call count 0) and `tests/browser/contracts/C-01-frame-graph.spec.ts` (all-off pixel identity on 3 base scenes;
`after-opaque` pass sees depth when real). Flag: `A3D_QR_CORE` gates the real split; each contributor carries its own lane flag.

---

### C-02 ProgramFeatures, ShaderFeature/chunk registry, ProgramCache
Provider: PRD 01. Consumers: 02 (lighting/shadow chunks), 03 (velocity variant), 04 (lobes via C-03), 05 (LOD dither, debug view), 06 (deform chunks), 07 (particle/fog/wetness chunks), 08 (camera fade), 10 (wind, terrain, water chunks), 11 (WGSL twins, multi-draw, tier defines).
File: `packages/rendering/src/contracts/program.ts`.

```ts
export interface TextureSlotFeature { readonly uvSet: 0 | 1; readonly transform: boolean; }
export type ShadowReceiveFeature = { readonly cascades: 0 | 1 | 2 | 3 | 4; readonly pcfTaps: 1 | 4 | 9; readonly localShadows: number; readonly contact: boolean };
export interface ProgramFeatures {
  readonly pass: "forward" | "depth" | "distance" | "velocity";
  readonly target: "glsl300es" | "wgsl";
  readonly lighting: "lit" | "unlit";
  readonly maps: { readonly baseColor?: TextureSlotFeature; readonly normal?: TextureSlotFeature; readonly metallicRoughness?: TextureSlotFeature; readonly occlusion?: TextureSlotFeature; readonly emissive?: TextureSlotFeature };
  readonly extensions: readonly MaterialExtensionFeature[];        // C-03
  readonly alphaMode: "opaque" | "mask" | "blend";
  readonly doubleSided: boolean;
  readonly vertexColors: boolean;
  readonly flatShading: boolean;
  readonly skinning?: { readonly influences: 4 | 8; readonly palette: "uniform" | "texture" };
  readonly morph?: { readonly targetBucket: 4 | 8 | 16 | 32; readonly normals: boolean; readonly tangents: boolean };
  readonly instancing?: { readonly color: boolean; readonly emissive?: boolean };
  readonly drawId?: "multi-draw" | "uniform";                       // PRD 11
  readonly lights: { readonly dir: 0 | 1 | 2 | 4 | 8; readonly point: 0 | 1 | 2 | 4 | 8; readonly spot: 0 | 1 | 2 | 4 | 8; readonly rect: 0 | 1 | 2 | 4; readonly clustered: boolean; readonly hemisphere: boolean };
  readonly shadows: ShadowReceiveFeature;                           // C-11
  readonly environment: "none" | "pmrem-cube" | "equirect";          // C-09
  readonly fog: "none" | "linear" | "exp2" | "height" | "volumetric"; // C-21
  readonly diffuseModel: "lambert" | "burley";
  readonly specularAntialiasing: boolean;
  readonly backgroundCoverage: boolean;
  /** Open feature bits contributed by registered ShaderFeatures; key = ShaderFeature.id. */
  readonly features: Readonly<Record<string, string | number | boolean>>;
}
export interface MaterialExtensionFeature { readonly lobe: string; readonly maps: readonly string[]; readonly bits: Readonly<Record<string, string | number | boolean>>; }
export function computeProgramKey(features: ProgramFeatures): string;   // stable, order-independent, includes registered feature ids+values

export interface ShaderChunk {
  readonly name: string;                     // global unique, "a3d_<owner>_<name>" for new chunks; legacy names allowed
  readonly owner: import("./core").PrdId;
  readonly glsl: string;                     // GLSL ES 3.00 body; no #version; may declare uniforms/functions
  readonly wgsl?: string;                    // PRD 11 twin; absence => WGSL_PROGRAM_MISSING on webgpu backend
  readonly stage: "vertex" | "fragment" | "both";
  readonly requires?: readonly string[];     // other chunk names
}
export interface ShaderFeature extends import("./core").RegistryEntry {
  readonly id: string;                       // e.g. "prd08.cameraFade", "prd05.lodDither", "prd10.wind"
  /** Return the feature bit value for this draw, or undefined when inactive. Must be pure. */
  select(input: ShaderFeatureSelectInput): string | number | boolean | undefined;
  defines(value: string | number | boolean): Readonly<Record<string, string | number | true>>;
  readonly chunks: readonly string[];        // inserted at hook points
  readonly hooks: readonly ShaderHookPoint[];
  bindUniforms?(value: string | number | boolean, item: import("./renderItem").RenderItem, set: (name: string, v: import("../RenderDevice").UniformValue) => void): void;
}
export type ShaderHookPoint =
  | "vertex:pars" | "vertex:deform" | "vertex:world" | "vertex:end"
  | "fragment:pars" | "fragment:alpha" | "fragment:normal" | "fragment:material"
  | "fragment:lights" | "fragment:indirect" | "fragment:emissive" | "fragment:fog" | "fragment:end";
export interface ShaderFeatureSelectInput { readonly item: import("./renderItem").RenderItem; readonly pass: ProgramFeatures["pass"]; readonly tier: import("./quality").AuraQualityTierSettings; readonly flags: import("./core").QrFlags; }

export function registerShaderChunk(chunk: ShaderChunk): void;               // duplicate name throws SHADER_CHUNK_DUPLICATE
export function registerShaderFeature(feature: ShaderFeature): () => void;
export function shaderChunk(name: string): ShaderChunk | undefined;

export interface GeneratedProgram { readonly key: string; readonly vertex: string; readonly fragment: string; readonly defines: Readonly<Record<string, string | number | true>>; }
export function generateProgram(features: ProgramFeatures): GeneratedProgram;

export interface ProgramHandle { readonly key: string; readonly status: "pending" | "ready" | "failed"; readonly program?: import("../RenderDevice").RenderShaderProgram; readonly error?: string; }
export interface ProgramCacheLike {
  acquire(features: ProgramFeatures): ProgramHandle;
  precompile(list: readonly ProgramFeatures[]): Promise<void>;
  stats(): { readonly compiled: number; readonly pending: number; readonly failed: number; readonly compileMsTotal: number };
  dispose(): void;
}
export const programCacheSlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice, o?: { parallelCompile?: boolean }) => ProgramCacheLike>;
```

Semantics and invariants:
- `computeProgramKey` is deterministic. Two feature records that are equal by value produce equal keys.
- Each hook point is spliced in `(feature.order, feature.id)` order. A chunk is included at most once.
- `select()` is evaluated per `RenderItem` at program-acquire time, not per frame, unless `item` changes key inputs.
- Tier values that alter generated code (cascade count, PCF taps, `MAX_LIGHTS_PER_PIXEL`, `SOFT_PARTICLES`) must be
  feature bits. The generator warms both the current tier and the next-lower tier (PRD 11 §6 rule).
- The `u_dfgLut` binding (r185 16x16 RG16F, `BRDFLut.ts`) and the `brdf` chunk (`PhysicalMaterial` struct,
  `F_Schlick`, `V_GGX_SmithCorrelated`, `D_GGX`, `a3dDFG`, `a3dDirectSpecular`, `a3dDirectLight`) are PRD 01's. They
  are the base lobe for C-03.

Stub (PR 0a):
- The chunk and feature registries are real: they store and validate.
- `generateProgram` throws `PROGRAM_GENERATOR_PENDING`, and `programCacheSlot.stub` wraps the existing
  `ShaderLibrary` lookups (`ShaderLibrary.ts:52` `createDefaultShaderLibrary`), ignoring registered features.
- Lanes validate chunks with `packages/rendering/src/contracts/testing/ChunkHarness.ts` (PR 0a). It wraps the listed
  chunks into a minimal GLSL ES 3.00 program (`#version 300 es`, fullscreen-triangle vertex shader, fragment `main`
  calling an entry symbol). The unit test checks the text with `tools/shader-lint` once it exists. The browser
  conformance test compiles it with WebGL2 on macos-14.

Real (PRD 01):
- `program/ProgramGenerator.ts`, `ProgramKey.ts`, `ProgramCache.ts`, `ProgramWarmup.ts`.
- Chunks in `program/chunks/*.glsl.ts`, with hook points exactly as listed.

Conformance: `tests/unit/contracts/C-02-program.test.ts` (key stability; duplicate chunk rejection; hook splice order;
feature bits in key) and `tests/browser/contracts/C-02-chunks.spec.ts` (every registered chunk compiles in
ChunkHarness, and in the generator when real). Flag: `A3D_QR_CORE=v2` routes draws through the generator.

---

### C-03 MaterialFeature lobe registry
Provider: PRD 04. Consumers: 01 (generator includes lobes), 06 (skinned physical), 07 (lit mesh particles), 10 (foliage/terrain/water/planet materials register their own lobes), 13 (material facts).
File: `packages/rendering/src/contracts/materialLobes.ts`.

```ts
export type MaterialLobeId =
  | "base" | "clearcoat" | "sheen" | "iridescence" | "anisotropy" | "transmission" | "volume"
  | "specular" | "ior" | "dispersion" | "emissive-strength" | "unlit" | `${"prd04" | "prd10" | "prd07"}.${string}`;
export interface MaterialLobe extends import("./core").RegistryEntry {
  readonly id: MaterialLobeId;
  /** Return the extension feature for this material or undefined when the lobe is inactive. */
  feature(material: MaterialLobeInput): import("./program").MaterialExtensionFeature | undefined;
  readonly chunks: { readonly pars: string; readonly fragment: string; readonly ibl?: string };  // chunk names (C-02)
  readonly samplerSlots: readonly string[];          // counted by the PRD 02 sampler budget (C-12)
  bind(material: MaterialLobeInput, set: (uniform: string, value: import("../RenderDevice").UniformValue) => void): void;
  readonly glTFExtension?: string;                   // e.g. "KHR_materials_clearcoat"
}
export interface MaterialLobeInput { readonly parameters: Readonly<Record<string, unknown>>; readonly textures: Readonly<Record<string, import("../Texture").Texture | undefined>>; }
export function registerMaterialLobe(lobe: MaterialLobe): () => void;
export function materialLobes(flags: import("./core").QrFlags): readonly MaterialLobe[];
export interface MaterialFeatureContext { readonly flags: import("./core").QrFlags; readonly tier: import("./quality").AuraQualityTierSettings; }
/** Implemented by every Material subclass (abstract in Material.ts, PRD 01). */
export interface ProgramFeatureSource {
  programFeatures(ctx: MaterialFeatureContext): Omit<import("./program").ProgramFeatures, "lights" | "shadows" | "environment" | "fog" | "pass" | "target" | "backgroundCoverage">;
}
```

Semantics and invariants:
- A lobe's chunks add energy only through `PhysicalMaterial` fields and the `fragment:material` and
  `fragment:indirect` hook points.
- A lobe never re-applies tone mapping or a color-space encode.
- The sampler slots of all active lobes plus the base must stay within `resolveLightingSamplerBudget` (C-12).
  Overflow drops lobes in a fixed order and reports `extension-lobe-pending` degradation (C-36).

Stub: the registry is real. `materialLobes()` returns registered lobes. Until the C-02 generator is real, lobes have no
render effect and diagnostics report `materials.paths.materialModel = "legacy"`.

Real (PRD 04):
- `shaders/physical/*.glsl.ts`: clearcoat, sheen, iridescence, anisotropy, transmission, tangent_frame, uv_transform.
- `materials/PhysicalMaterial.ts`.
- Golden material conformance (`tests/reports/material-conformance.json`).

Conformance: `tests/unit/contracts/C-03-material-lobes.test.ts` (feature/key round-trip; sampler-budget drop order;
duplicate id) and `tests/browser/contracts/C-03-lobes-compile.spec.ts`. Flag: `A3D_QR_MATERIALS` (requires
`A3D_QR_CORE=v2` for visible effect).

---

### C-04 BlendMode, RenderCommandState, DepthCompare
Provider: PRD 01. Consumers: 03 (`blendFuncSeparate` for transparent/additive), 04 (alpha-to-coverage), 07 (additive HDR accumulation), 11 (WebGPU pipeline keys).
File: `packages/rendering/src/contracts/blend.ts`. `RenderCommandState` (`RenderDevice.ts:135`) gains optional fields in PR 0a.

```ts
export type BlendFactor = "zero" | "one" | "src-color" | "one-minus-src-color" | "src-alpha" | "one-minus-src-alpha" | "dst-color" | "one-minus-dst-color" | "dst-alpha" | "one-minus-dst-alpha";
export type BlendEquation = "add" | "subtract" | "reverse-subtract" | "min" | "max";
export interface BlendComponent { readonly equation: BlendEquation; readonly src: BlendFactor; readonly dst: BlendFactor; }
export type BlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply" | { readonly kind: "custom"; readonly color: BlendComponent; readonly alpha: BlendComponent };
export type DepthCompare = "never" | "less" | "equal" | "less-equal" | "greater" | "not-equal" | "greater-equal" | "always";
// RenderCommandState additions (PR 0a, optional; existing `blend: boolean` and `depthCompare: "always"|"less-equal"` remain):
//   readonly blendMode?: BlendMode;            // wins over `blend` when present
//   readonly depthCompareV2?: DepthCompare;    // wins over `depthCompare` when present
//   readonly alphaToCoverage?: boolean;        // PRD 04
export function resolveBlendMode(state: import("../RenderDevice").RenderCommandState): Exclude<BlendMode, string> | "opaque";
export function renderStateKey(state: import("../RenderDevice").RenderCommandState): number;
export type AuraBlendMode = "opaque" | "alpha" | "premultiplied" | "additive" | "multiply";   // engine-level (AuraMaterialSpec.blend, C-15)
```

Semantics:
- `premultiplied` is `one, one-minus-src-alpha` for color and alpha.
- `additive` is `one, one` for color and `zero, one` for alpha, so destination alpha is preserved.
- `multiply` is `dst-color, zero`.
- All of these are evaluated in the linear-HDR target. `renderStateKey` is stable across WebGL2 and WebGPU.

Stub (PR 0a):
- `resolveBlendMode` maps the existing `blend: true` to `alpha` and `false` to `opaque`.
- `WebGL2Device` ignores `blendMode`, `depthCompareV2` and `alphaToCoverage` until real.
- PRD 07's `vfx/BlendModes.ts` adapter (C-07-IN-1 stub) switches additive sequences to premultiplied and reports
  `VFX_BLEND_FALLBACK`.

Real (PRD 01): apply these in `WebGL2Device` state application and `WebGL2StateCache.ts`. PRD 11 implements the
WebGPU mapping in its device (C-29).

Conformance: `tests/unit/contracts/C-04-blend.test.ts` (factor tables; key stability) and
`tests/browser/contracts/C-04-blend.spec.ts` (4 blend modes x 3 backgrounds, read back in a test-only path).
Flag: `A3D_QR_CORE`.

---

### C-05 Output: HDR target, tone mapping, exposure, background coverage, output overlay
Provider: PRD 01. Consumers: 03 (feeds exposure/grade into OutputPass; must not add another tone mapper), 09 (juice overlay), 12 (diagnostics), 13 (looks), 14 (games).
File: `packages/rendering/src/contracts/output.ts` and `packages/engine/src/contracts/output.ts`.

```ts
// rendering
export type AuraToneMappingOperatorLike = "none" | "linear" | "reinhard" | "aces" | "agx" | "neutral";
export interface OutputPassOptions { readonly toneMapping: AuraToneMappingOperatorLike; readonly exposure: number; readonly dithering: boolean; readonly backgroundCoverage: boolean; readonly overlay?: OutputOverlayUniforms; }
export interface OutputOverlayUniforms { readonly flash: readonly [number, number, number, number]; readonly vignette: readonly [number, number, number, number]; readonly shape: readonly [number, number]; readonly fade: readonly [number, number, number, number]; }
export interface OutputPassLike { execute(input: import("../RenderTarget").RenderTarget, coverage: import("../RenderTarget").RenderTarget | null, options: OutputPassOptions, output: import("../RenderTarget").RenderTarget | "canvas"): void; }
export const DEFAULT_TONE_MAPPING: AuraToneMappingOperatorLike;   // "aces" at PR 0
export type HdrTargetFormat = "rgba16f" | "r11f_g11f_b10f" | "rgba8";
export function probeHdrTargetFormat(device: import("../RenderDevice").RenderDevice): HdrTargetFormat;   // order rgba16f -> r11f_g11f_b10f -> rgba8 (degraded)

// engine
export type AuraToneMappingOperator = AuraToneMappingOperatorLike;
export interface AuraOutputOptions {
  readonly toneMapping?: AuraToneMappingOperator;
  readonly exposure?: number;                                    // linear multiplier, default 1
  readonly dither?: boolean;                                     // default true
  readonly backgroundPassthrough?: boolean;                      // background excluded from tone map when true
  readonly autoExposure?: false | import("./post").AuraAutoExposureOptions;   // semantics C-13
  readonly preset?: import("./post").AuraPostPresetId;                        // semantics C-13
}
export interface AuraOutputOverlay { readonly flash?: readonly [number, number, number, number]; readonly vignette?: readonly [number, number, number, number]; readonly shape?: readonly [number, number]; readonly fade?: readonly [number, number, number, number]; }
export interface AuraOutputSurface {
  setOutput(output: Partial<AuraOutputOptions>): void;
  setOutputOverlay(overlay: AuraOutputOverlay): { readonly applied: boolean; readonly reason?: "no-post-pass" | "disposed" | "dom-fallback" };
  capture(options?: { readonly type?: "image-bitmap" | "png-blob" }): Promise<ImageBitmap | Blob>;
  onRendererError(listener: (e: { readonly code: string; readonly message: string; readonly cause?: unknown }) => void): () => void;
}
export interface AuraOutputDiagnostics { readonly toneMapping: AuraToneMappingOperator; readonly exposure: { readonly applied: number; readonly source: "output" | "grade" | "auto"; readonly autoEv?: number }; readonly dithering: boolean; readonly targetFormat: "rgba16f" | "r11g11b10f" | "rgba8"; readonly degraded?: "rgba8-no-float-target"; }
// SceneBuilder: scene().background(color: AuraColor, o?: { toneMapped?: boolean }) | background({ environment: true; blurriness?: number; intensity?: number })   (environment form: C-09)
```

Semantics and invariants:
- There is exactly one tone map per frame, applied in `OutputPass`.
- Every pass before it is linear HDR (C-13).
- The sRGB encode happens once, in `OutputPass`.
- The exposure value is a multiplier applied before the operator. PRD 03 auto-exposure and grade produce the value,
  and `OutputPass` applies it.
- `DEFAULT_TONE_MAPPING` is frozen as `"aces"` (PRD 03 :451 and :680, PRD 01 :1020). It switches to `"agx"` only in
  a separate PRD 01 PR that links PRD 12's ACES-vs-AgX A/B record from a checkpoint. This is a value change and needs
  no CCR.
- An overlay at zero values must be bit-identical to no overlay.
- `capture()` never sets `preserveDrawingBuffer`. It renders the frame now and reads it back.

Stub (PR 0a/0b):
- `setOutput` maps to the existing tone-map path. That is the WebGL2 present shader `WebGL2Device.ts:3453-3633`
  (map), default `'reinhard'` at :1906 (map), with ACES at :3501-3517. Unsupported operators fall back to `aces` and
  report `capability-degraded`.
- `setOutputOverlay` returns `{ applied: true, reason: "dom-fallback" }` and drives an absolutely positioned
  `div.a3d-output-overlay` over the canvas: flash and fade as background RGBA, vignette as a radial-gradient. This is
  honest because the overlay is visible in screenshots captured from the page, but diagnostics report it as DOM.
- `capture()` uses `canvas.toBlob` after a synchronous render.
- `probeHdrTargetFormat` returns `"rgba16f"` when the `hdr-render-targets` capability exists, else `"rgba8"`.

Real (PRD 01):
- `output/OutputPass.ts` and `output/ToneMappingOperators.glsl.ts` (none, linear, reinhard, aces, r185 agx, Khronos
  neutral).
- Delete the fake agx/neutral at `WebGL2Device.ts:3541-3560` (map).
- Overlay uniforms in the output shader.

Conformance: `tests/unit/contracts/C-05-output.test.ts` (option normalization; zero-overlay identity in the CPU
reference operators from PRD 03 `post/ToneOperators.ts`) and `tests/browser/contracts/C-05-output.spec.ts`
(exposure ramp monotonic; single sRGB encode measured on a 50% grey card; overlay identity at zero).
Flag: `A3D_QR_CORE`.

---

### C-06 Scene graph transforms and color parsing
Provider: PRD 01. Consumers: 08 (world `lookAt`), 09 (game kits as groups), 10 (kits/placement), 15 (three-compat Euler order mapping).
File: `packages/engine/src/contracts/sceneGraph.ts`. The implementations are PRD 01's new files `agent-api/sceneGraph.ts` and `agent-api/color.ts`, so this is purely additive.

```ts
export type AuraEulerOrder = "XYZ" | "XZY" | "YXZ" | "YZX" | "ZXY" | "ZYX";
export type AuraQuat = readonly [number, number, number, number];         // shared with C-22 (PRD 08 "first public quaternion type")
export interface AuraWorldTransform { readonly matrix: Float32Array; readonly position: AuraVec3; readonly quaternion: AuraQuat; readonly scale: AuraVec3; readonly sheared: boolean; }
export function composeWorldMatrix(parent: Float32Array, local: AuraTransformSpec, out: Float32Array): Float32Array;
export function decomposeMatrix(m: Float32Array): AuraWorldTransform;
export function eulerToQuaternion(euler: AuraVec3, order: AuraEulerOrder): AuraQuat;
// AuraTransformSpec additions (PR 0a, optional): rotationOrder?: AuraEulerOrder (default "ZYX" = today's behaviour); quaternion?: AuraQuat (wins over rotation)
// AuraNodeBuilder additions: rotate(x: number, y: number, z: number, order?: AuraEulerOrder): this; quaternion(x: number, y: number, z: number, w: number): this
export type AuraColor = `#${string}` | string | number;
export class AuraColorParseError extends Error { readonly input: unknown; }
export function parseAuraColor(color: AuraColor): readonly [number, number, number, number];      // linear RGBA
export function parseAuraColorSrgb(color: AuraColor): readonly [number, number, number, number];  // sRGB-encoded RGBA
```

Semantics:
- The default order `"ZYX"` reproduces current rotation, so the default output is bit-identical.
- `lookAt` resolves in world space.
- A sheared world matrix sets `sheared` and emits a `SCENE_GRAPH_SHEAR` warning.

Stub (PR 0a):
- `composeWorldMatrix` and `eulerToQuaternion` delegate to the existing `eulerToQuat` (`index.ts:5345`) with ZYX.
- `parseAuraColor` delegates to the existing hex parser.
- New fields are declared and listed in `DIAGNOSTIC_ONLY_FIELDS` (C-36) with `ownerPrd: 1`.

Real (PRD 01): all six orders, quaternion input, per-node dirty flags.

Conformance: `tests/unit/contracts/C-06-scene-graph.test.ts` (6 orders vs reference matrices; default identity; color
round-trips for hex, CSS names and numbers). Flag: `A3D_QR_CORE`.

---

### C-07 Primitive tessellation and InstanceBuffer
Provider: PRD 01. Consumers: 06, 10 (static world instance buffers), 11 (batching), 13 (template primitives).
File: `packages/rendering/src/contracts/geometry.ts`.

```ts
export interface AuraPrimitiveTessellation { readonly widthSegments?: number; readonly heightSegments?: number; readonly depthSegments?: number; readonly radialSegments?: number; readonly tubularSegments?: number; readonly capSegments?: number; readonly openEnded?: boolean; readonly radiusTop?: number; readonly radiusBottom?: number; readonly tube?: number; }
// AuraPrimitiveOptions.tessellation?: AuraPrimitiveTessellation   (PR 0a, engine)
// AuraPrimitiveNode.batch?: boolean; AuraPrimitiveNode.static?: boolean   (PR 0a, semantics PRD 11)
export interface InstanceBufferLike {
  readonly count: number; readonly version: number;
  setMatrices(m: Float32Array, count?: number): void;
  setColors(c: Float32Array): void;
  bind(): { readonly matrixBuffer: import("../RenderDevice").RenderBuffer; readonly colorBuffer?: import("../RenderDevice").RenderBuffer };
  dispose(): void;
}
export const instanceBufferSlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice, capacity: number, options?: { colors?: boolean }) => InstanceBufferLike>;
```

Semantics:
- Instance transforms compose as world · instance · geometry (`u_modelMatrix`, `u_geometryMatrix`).
- Capacity is the hard limit: `setMatrices` with `count > capacity` throws `INSTANCE_CAPACITY_EXCEEDED`.
- Generated geometry emits position, normal, uv0 and tangent, and uses Uint32 indices above 65,535 vertices.
- The geometry cache key is `(primitive, params)`.

Stub (PR 0a): `instanceBufferSlot.stub` wraps the current per-frame instance upload in `ForwardPass`
(`ForwardPass.ts:1711-1803`, map), with `version` incremented on each set. Tessellation is declared and inert.

Real (PRD 01): `resources/InstanceBuffer.ts`, plus `Geometry.torus`, `Geometry.box`, `Geometry.litPlane`, the
extended `cylinder`/`capsule`, and textured `uvSphere`.

Conformance: `tests/unit/contracts/C-07-geometry.test.ts` (segment counts; Uint32 promotion; capacity throw).
Flag: `A3D_QR_CORE`.

---

### C-08 Frame uniforms and CameraLike
Provider: PRD 01. Consumers: 02 (SSR and contact shadows near/far), 03 (post depth linearization), 07 (soft particles), 08 (presented pose), 10 (reflection views).
File: `packages/rendering/src/contracts/frameUniforms.ts`.

```ts
export interface CameraLike {                                     // superset of today's Renderer CameraLike
  readonly viewMatrix?: Float32Array;
  readonly projectionMatrix?: Float32Array;
  readonly viewProjectionMatrix: Float32Array;
  readonly position?: readonly [number, number, number];
  readonly near?: number; readonly far?: number; readonly fov?: number; readonly aspect?: number;
  readonly projection?: "perspective" | "orthographic";
}
/** std140 block AuraFrame, binding 0. Field order is frozen. */
export const AURA_FRAME_BLOCK: readonly [
  ["u_view", "mat4"], ["u_projection", "mat4"], ["u_viewProjection", "mat4"], ["u_prevViewProjection", "mat4"],
  ["u_cameraPositionNear", "vec4"], ["u_resolutionFarTime", "vec4"], ["u_exposureFlags", "vec4"]
];
/** std140 block AuraLights, binding 1; layout owned by PRD 02 inside this name (C-10). */
export const AURA_LIGHTS_BLOCK_NAME: "AuraLights";
export interface FrameUniformsLike { update(camera: import("./frameGraph").FrameCamera, timeSeconds: number, exposure: number, flags: number): void; readonly buffer: import("../RenderDevice").RenderBuffer | null; }
```

Semantics:
- `u_cameraPositionNear.w` is the near plane.
- `u_resolutionFarTime` is `(width, height, far, timeSeconds)`.
- `u_exposureFlags.x` is exposure. `.y` bit 0 is orthographic and bit 1 is "background coverage enabled".
- Renderer resolve accepts a plain `CameraLike`. The `instanceof PerspectiveCamera` gate at `Renderer.ts:1387-1399`
  (map) is removed by PRD 02 inside its shadow carve-out.

Stub: `buffer: null`. Chunks read the legacy uniforms `u_cameraPosition`/`u_viewProjection`, and the ChunkHarness
declares both forms. Post passes keep their current depth range: the `{ near: 0.1, far: 1000 }` literal at
`WebGL2Device.ts:865` (map). This is a known defect reported by `diagnostics().post`.

Real (PRD 01): `resources/UniformBlock.ts` std140 packer, with the block bound for all generated programs.

Conformance: `tests/unit/contracts/C-08-frame-uniforms.test.ts` (std140 offsets equal to the frozen table).
Flag: `A3D_QR_CORE`.

### C-09 EnvironmentSource / EnvironmentProbe
Provider: PRD 02. Consumers: 04 (IBL for lobes), 07 (sky → IBL capture; fog colour from SH), 10 (biome resolver chooses source), 13 (looks).
File: `packages/rendering/src/contracts/environment.ts` and `packages/engine/src/contracts/environment.ts`. Seam: `compiler/environment.ts` (carve-out of `index.ts:12628-12732`, PR 0b).

```ts
// rendering
export interface EnvironmentProbe {
  readonly kind: "environment-probe";
  readonly specularCube: import("../Texture").Texture;   // PMREM, linear HDR
  readonly mipCount: number;
  readonly faceSize: 128 | 256 | 512 | 1024;
  readonly sh9: Float32Array;                            // length 27, linear radiance SH (RGB x 9)
  readonly shTexture: import("../Texture").Texture | null;
  readonly background: import("../Texture").Texture | null;
  readonly source: "neutral" | "preset" | "hdri" | "capture" | "sky" | "space-bake" | "legacy";
  dispose(): void;
}
export interface EnvironmentCaptureRequest { renderFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: import("../RenderTarget").RenderTarget, viewProjection: Float32Array): void; readonly resolution: 64 | 128 | 256; }
export interface EnvironmentProbeFactory {
  fromEquirect(src: import("../Texture").Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  fromCube(src: import("../Texture").Texture, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  fromScene(req: EnvironmentCaptureRequest, o?: { faceSize?: EnvironmentProbe["faceSize"] }): EnvironmentProbe;
  neutral(tier: import("./quality").AuraQualityTier): EnvironmentProbe;
}
export const environmentProbeFactorySlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice) => EnvironmentProbeFactory>;
export function projectCubeToSH9(faces: readonly Float32Array[], faceSize: number): Float32Array;
export function evaluateSH9Irradiance(sh9: Float32Array, normal: readonly [number, number, number]): [number, number, number];
/** GLSL entry points every consumer may call (chunk "a3d_prd02_sh9"): vec3 a3dSampleIrradianceSH(vec3 N); uniform block A3DSH9 { vec4 u_sh9[9]; } */
export const SH9_CHUNK: "a3d_prd02_sh9";

// engine
export type AuraEnvironmentSourceKind = "explicit" | "biome" | "look" | "time-of-day" | "scene-signal" | "neutral-room" | "legacy";
export interface AuraEnvironmentSourceResolution {
  readonly kind: AuraEnvironmentSourceKind;
  readonly probe: "neutral" | { readonly preset: "neutral" | "studio" | "outdoor" | "sunset" | "night" | "indoor" } | { readonly hdri: string; readonly reflection?: string } | { readonly capture: { readonly include: "sky-only" | "all"; readonly position?: AuraVec3; readonly resolution?: 64 | 128 | 256; readonly update?: "once" | "on-demand" | { readonly everyNFrames: number } } } | { readonly spaceBake: string };
  readonly intensity: number; readonly diffuseIntensity: number; readonly specularIntensity: number; readonly rotation: number;
  readonly background: false | { readonly visible: boolean; readonly blurriness: number; readonly intensity: number; readonly rotation: number };
  readonly ambient: { readonly color: AuraColor; readonly intensity: number } | null;   // ADDITIVE to IBL (never replaces it)
}
export interface AuraEnvironmentSource extends RegistryEntry {
  readonly id: string;               // "prd02.explicit", "prd10.biome", "prd13.look", "prd07.sky"
  readonly priority: number;         // higher wins; frozen order: explicit 400 > biome 300 > time-of-day 250 > look 200 > scene-signal 100 > neutral-room 0
  resolve(snapshot: AuraSceneSnapshot, tier: AuraQualityTier): AuraEnvironmentSourceResolution | undefined;
}
export function registerEnvironmentSource(source: AuraEnvironmentSource): () => void;
export function resolveEnvironment(snapshot: AuraSceneSnapshot, tier: AuraQualityTier, flags: QrFlags): AuraEnvironmentSourceResolution;
```

Semantics and invariants:
- Indirect lighting is additive in linear HDR. This is PRD 02's lighting contract (6.1):
  `direct·V_l + kd·albedo/π·(E_SH·I_diff·ao_d + E_probe) + kd·albedo/π·(E_amb+E_hemi)·ao_d + Fss·DFG·L_spec·I_spec·SO·H + emissive`.
- An authored `lights.ambient` never zeroes IBL. This corrects the ambient-kills-IBL defect that research 19
  verified in **15 of 18 games** (`createProductionRuntimeEnvironment` authored-ambient branch `index.ts:12693-12707`,
  map).
- The highest-priority source that returns a value wins. Ties throw `ENVIRONMENT_SOURCE_TIE`.
- `background` is independent of lighting. `visible: false` keeps IBL.

Stub (PR 0b):
- `resolveEnvironment` runs the moved, verbatim `createProductionRuntimeEnvironment` and wraps its result as
  `{ kind: "legacy", ... }`. The current ambient-replaces behaviour is preserved when `A3D_QR_LIGHTING` is off.
- Registered sources are consulted only when their flag is on.
- `environmentProbeFactorySlot.stub` wraps the existing PMREM path
  (`packages/rendering/src/production-runtime/environment/PMREMGenerator.ts`). `sh9` is computed on the CPU from the
  lowest mip, and `source` is `"legacy"`.
- `a3dSampleIrradianceSH` stub chunk: hemisphere colour pair from SH band 0/1. This matches the C-07-IN-5 stub.

Real (PRD 02):
- `environment/{EnvironmentProbe,GPUPMREMGenerator,EnvironmentCache,SphericalHarmonics,RoomEnvironmentScene}.ts`.
- `environments.preset/neutral/none/hdri/capture`.
- The neutral room as the floor source.

Conformance: `tests/unit/contracts/C-09-environment.test.ts` (priority order; ambient additive invariant; SH9
projection of a constant cube equals the constant ±1e-3) and `tests/browser/contracts/C-09-probe.spec.ts` (probe
mipCount = log2(faceSize)+1; roughness→LOD monotonic). Flag: `A3D_QR_LIGHTING`.

---

### C-10 Lighting API and lighting runtime
Provider: PRD 02. Consumers: 10 (biome rigs), 12 (evidence), 13 (looks, recipe), 14 (games).
File: `packages/engine/src/contracts/lighting.ts`.

```ts
export type AuraLightingModel = "physical" | "legacy-3.0";
export interface AuraLightingOptions { readonly model?: AuraLightingModel; readonly autoSunShadow?: boolean; readonly quality?: AuraQualityTier | "auto"; readonly maxShadowedLights?: number; }
// AuraCreateAppOptions.lighting?: AuraLightingOptions    (PR 0a)
// AuraLightType gains "hemisphere" (PR 0a; index.ts:1542 map)
export interface AuraShadowOptions { readonly intensity?: number; readonly mapSize?: 512 | 1024 | 2048 | 4096; readonly bias?: number; readonly normalBias?: number; readonly filter?: "hard" | "pcf" | "pcss"; readonly softness?: number; readonly lightSize?: number; }
export interface AuraDirectionalShadowOptions extends AuraShadowOptions { readonly cascades?: 1 | 2 | 3 | 4 | "auto"; readonly maxDistance?: number; readonly splitLambda?: number; readonly blend?: number; readonly fit?: "camera" | { readonly center: AuraVec3; readonly extent: number; readonly depth?: number }; }
export interface AuraLocalShadowOptions extends AuraShadowOptions {}
export interface AuraLightsApiAdditions {
  hemisphere(o?: { name?: string; skyColor?: AuraColor; groundColor?: AuraColor; intensity?: number; position?: AuraVec3 }): AuraNodeBuilder<AuraLightNode>;
  // point/spot gain: distance?: number (0 = infinite), decay?: number (default 2), power?: number (lumens), shadow?: boolean | AuraLocalShadowOptions
  // directional gains: shadow?: boolean | AuraDirectionalShadowOptions
}
export interface AuraLightingDiagnostics {
  readonly environment: { readonly source: string; readonly faceSize: number; readonly mipCount: number; readonly format: string; readonly shBound: boolean; readonly backgroundDrawn: boolean; readonly pmremGpuMs: number | null };
  readonly shadows: readonly { readonly light: string; readonly filter: string; readonly casterVariants: readonly string[]; readonly sampled: boolean }[];
  readonly droppedFeatures: readonly string[];
  readonly contactShadows: { readonly passExecuted: boolean };
  readonly programCompileCount: number;
  readonly readPixelsCalls: number;
}
export interface AuraLightingRuntime {
  updateProbe(name: string): Promise<void>;
  rebakeIrradiance(name?: string): Promise<void>;
  setEnvironmentRotation(radians: number): void;
  setEnvironmentIntensity(value: number): void;
  diagnostics(): AuraLightingDiagnostics;
}
// AuraApp.lighting: AuraLightingRuntime   (via C-38)
// decals.blobShadow({ name?, position?, footprint?, opacity?, color? }); shadows.contact stays as deprecated alias
// effects.contactShadows(o?: { length?; thickness?; steps?: 8|12|16; intensity?; lights?: "sun"|"shadowed" })
// probes.reflection(o: { name; position; box?; resolution?; update?; blendDistance?; priority?; intensity? }); probes.irradianceVolume(o: { name; bounds; resolution: [n,n,n]; update?; intensity? })
```

Semantics:
- `point`/`spot` `power` is in lumens, and `intensity` is in candela (three-physical units).
- The default directional `shadow` strength is 1.0. Today it is 0.65 at `ForwardPass.ts:913/1048/1172` (map).
  The change applies only when `model: "physical"`.
- `model` defaults to `"physical"` when `A3D_QR_LIGHTING` is on, and to `"legacy-3.0"` otherwise.
  `?aura-lighting=legacy-3.0` forces legacy (`readLightingModelFromUrl`).

Stub:
- `hemisphere` lowers to two directional fills at 0.5 intensity each, sky above and ground below, with a
  `capability-degraded` degradation.
- `distance`, `decay` and `power` are inert and listed in DIAGNOSTIC_ONLY_FIELDS.
- `AuraApp.lighting.diagnostics()` reports observed values from the existing renderer
  (`getShadowEvidence`, `Renderer.ts:442`). Unknown fields are `null`.

Real (PRD 02): physical units, shadowed local lights, CSM, contact shadows, probes.

Conformance: `tests/unit/contracts/C-10-lighting.test.ts` (unit conversions: lumens→candela for point = lm/4π; legacy
model identity) and `tests/browser/contracts/C-10-lighting.spec.ts`. Flag: `A3D_QR_LIGHTING`.

---

### C-11 ShadowCaster depth-variant hook and shadow lookup
Provider: PRD 02. Consumers: 06 (skinned/morph casters), 07 (alpha cards, shadowed smoke, god-ray visibility), 10 (wind-deformed foliage), 11 (instanced and batched casters).
File: `packages/rendering/src/contracts/shadows.ts`. Seam: `renderer/ShadowOrchestration.ts` (carve-out of `Renderer.ts:1354-1603`, map) and `DepthPass.ts` (owner PRD 02).

```ts
export interface ShadowCasterVariantKey { readonly skinning: 0 | 4 | 8; readonly skinningTexture: boolean; readonly morphTargets: boolean; readonly instanced: boolean; readonly batched: boolean; readonly alphaTest: boolean; readonly alphaHash: boolean; readonly doubleSided: boolean; readonly features: Readonly<Record<string, string | number | boolean>>; }
export function resolveShadowCasterVariant(item: import("./renderItem").RenderItem, flags: import("./core").QrFlags): ShadowCasterVariantKey;
export function shadowCasterVariantId(key: ShadowCasterVariantKey): string;
/** Depth-pass feature: same shape as C-02 ShaderFeature but applied to pass "depth" | "distance". */
export interface DepthVariantFeature extends import("./program").ShaderFeature { readonly passes: readonly ("depth" | "distance" | "velocity")[]; }
export function registerDepthVariantFeature(feature: DepthVariantFeature): () => void;
export interface ShadowFrameUniforms {
  readonly cascadeTexture: import("../Texture").Texture | null; readonly cascadeMatrices: Float32Array; readonly cascadeSplits: Float32Array; readonly cascadeTexelWorld: Float32Array;
  readonly atlasTexture: import("../Texture").Texture | null; readonly localShadowData: Float32Array; readonly perLightShadowIndex: Int32Array;
}
/** Published on the C-01 blackboard under "prd02.shadowFrameUniforms". */
export const SHADOW_BLACKBOARD_KEY: "prd02.shadowFrameUniforms";
/** GLSL (chunk "a3d_prd02_shadow_lookup"): float a3dSunShadowAt(vec3 worldPos); usable in vertex and fragment stages of non-forward passes. */
export const SHADOW_LOOKUP_CHUNK: "a3d_prd02_shadow_lookup";
export interface SkinnedBoundsProvider { worldBounds(item: import("./renderItem").RenderItem): Float32Array | null; } // PRD 06 joint AABB (C-18)
export function registerSkinnedBoundsProvider(p: SkinnedBoundsProvider): void;
```

Semantics and invariants:
- A caster renders with the variant that matches its forward deformation. Skinned, morphed, instanced and
  alpha-tested geometry casts its deformed silhouette.
- The variant id is stable, and is part of the depth program key.
- `a3dSunShadowAt` returns visibility in [0,1], and 1 when no shadow is bound.

Stub:
- `resolveShadowCasterVariant` returns a key with only `instanced` and `doubleSided` filled, which is today's depth
  shader `registerLeanDepthShader` (`ShaderLibraryCore.ts:784-806`, map).
- Registered depth features are stored and are applied once PRD 02's `DepthPass` consumes them.
- The `a3dSunShadowAt` stub chunk returns 1.0 (C-07-IN-6).

Real (PRD 02): `shadows/{ShadowSystem,ShadowCasterVariants,DirectionalCascadeFitter,ShadowAtlas,ShadowFilterKernels}.ts`
and `DepthPass.ts` variant composition. PRD 06 registers a `prd06.deform` depth feature.

Conformance: `tests/unit/contracts/C-11-shadow-variants.test.ts` (variant id stability; registered feature appears
in key) and `tests/browser/contracts/C-11-skinned-shadow.spec.ts` (a posed skinned caster's shadow silhouette IoU
≥ 0.9 against a CPU-skinned reference, when real). Flag: `A3D_QR_LIGHTING`.

---

### C-12 Sampler and texture-sampling descriptors
Provider: PRD 02, which owns the WebGL2 sampler mapping `webgl2/Samplers.ts`. Consumers: 04 (`Sampler.trilinear/fromGLTF`, anisotropy by tier), 05 (KTX2 mip chains), 10 (terrain/foliage).
File: `packages/rendering/src/contracts/sampling.ts`. `SamplerDescriptor` (`Sampler.ts:11`) gains optional fields in PR 0a.

```ts
// SamplerDescriptor additions (PR 0a):
//   readonly compare?: "less-equal" | "greater-equal";        // PRD 02 shadow compare samplers
//   readonly addressW?: TextureAddressMode;
//   readonly mirror?: boolean;                                // maps "mirror" wrap for glTF MIRRORED_REPEAT (33648)
export type AuraTextureWrap = "repeat" | "clamp" | "mirror";
export interface AuraTextureSampling { readonly wrap?: AuraTextureWrap; readonly filter?: "trilinear" | "bilinear" | "nearest"; readonly anisotropy?: number; }
export function resolveSamplerAnisotropy(req: { readonly desired?: number; readonly tier?: import("./quality").AuraQualityTier; readonly deviceMax: number }): number; // R9 table L4/M8/H16/U16, clamped
export function resolveLightingSamplerBudget(programDefines: Readonly<Record<string, unknown>>, materialSamplerCount: number, deviceLimits: { readonly maxTextureImageUnits: number }): { readonly droppedFeatures: readonly string[] };
export const LIGHTING_SAMPLER_DROP_ORDER: readonly ["contact-shadow", "irradiance-volume", "reflection-probe-2", "local-shadow-atlas", "sh-texture", "cascade-3", "lobe:iridescence", "lobe:sheen", "lobe:anisotropy", "lobe:clearcoat"];
```

Semantics:
- When a texture has exactly one mip level, the min filter `linear-mipmap-linear` is downgraded to `linear` by the
  device, so it never samples an incomplete texture.
- The `compare` field makes the sampler usable as `sampler2DShadow`/`sampler2DArrayShadow`.

Stub:
- The fields are inert in `WebGL2Device`, which keeps today's mapping at `WebGL2Device.ts:4139-4155` (map).
- `resolveSamplerAnisotropy` implements the R9 table immediately, because it is a pure function.
- `resolveLightingSamplerBudget` returns `{ droppedFeatures: [] }`.

Real (PRD 02): `webgl2/Samplers.ts` (carve-out, §3.4). PRD 04 builds `Sampler.trilinear/fromGLTF` in `Sampler.ts`
(owner PRD 04) on these fields.

Conformance: `tests/unit/contracts/C-12-sampling.test.ts` (anisotropy table; drop order deterministic) and
`tests/browser/contracts/C-12-sampler.spec.ts` (1-mip downgrade; compare sampler compiles). Flag: `A3D_QR_LIGHTING`.

---

### C-13 PostPass registry, post pipeline, output presets
Provider: PRD 03. Consumers: 02 (SSR placement, contact shadows as post input), 07 (god rays / volumetric composite), 08 (screen-feel uniforms), 09 (juice through C-05 overlay), 10 (underwater post), 13 (looks/presets), 14 (games).
File: `packages/rendering/src/contracts/post.ts` and `packages/engine/src/contracts/post.ts`. Seam: `renderer/PostprocessExecution.ts` (carve-out of `Renderer.ts:977-1330`, PR 0b).

```ts
// rendering
export type PostSpace = "linear-hdr" | "display";
export type PostInsertAt = "after-depth" | "before-taa" | "after-taa" | "before-tonemap" | "after-tonemap";
export interface PostPassDescriptor extends import("./core").RegistryEntry {
  readonly id: string;                         // "<prdNN>.<name>"
  readonly insertAt: PostInsertAt;
  readonly space: PostSpace;                   // must be "linear-hdr" unless insertAt === "after-tonemap"
  readonly inputs: readonly ("color" | "depth" | "velocity" | "normal" | "reactive")[];
  readonly fragment: { readonly glsl: string; readonly wgsl?: string };
  readonly uniforms?: (frame: import("./frameGraph").FrameContributorContext) => Readonly<Record<string, number | readonly number[]>>;
  readonly enabled?: (frame: import("./frameGraph").FrameContributorContext) => boolean;
  readonly gpuOnly: true;                      // CPU passes are rejected: POSTPROCESS_PASS_NOT_GPU:<id>
}
export function registerPostPass(pass: PostPassDescriptor): () => void;
export interface PostGraphReport { readonly stages: readonly { readonly name: string; readonly format: string; readonly width: number; readonly height: number; readonly gpuMs?: number }[]; readonly skipped: readonly { readonly name: string; readonly reason: string }[]; }
export interface PostPipelineOptions {
  readonly antiAliasing: "msaa" | "taa" | "smaa" | "fxaa" | "off"; readonly renderScale?: number;
  readonly depthRange: { readonly near: number; readonly far: number; readonly projection: "perspective" | "orthographic" };
  readonly ao?: unknown; readonly ssr?: unknown; readonly godRays?: unknown; readonly taa?: unknown; readonly dof?: unknown; readonly motionBlur?: unknown;
  readonly exposure: number; readonly bloom?: unknown; readonly toneMapping: import("./output").AuraToneMappingOperatorLike;
  readonly grade?: unknown; readonly lut?: unknown; readonly vignette?: unknown; readonly filmGrain?: unknown; readonly chromaticAberration?: unknown;
  readonly dither: boolean; readonly backgroundPassthrough?: boolean; readonly customPasses?: readonly PostPassDescriptor[];
} // `unknown` members are typed by PRD 03 in post/PostGraph.ts (GtaoOptions, BloomOptionsV2, TaaOptions, DofOptions, MotionBlurOptions, ColorGradeOptionsV2, LutTexture3D) — adding the concrete types is an allowed additive CCR.
// RendererPostProcessOptions (Renderer.ts:378) additions (PR 0a): pipeline?: "v2" | "legacy"; v2?: PostPipelineOptions
// RenderDevice.executePostGraph?(source: SceneTargets, options: PostPipelineOptions, output: RenderTarget | null): PostGraphReport  (optional member, PR 0a)

// engine
export type AuraAntiAliasMode = "auto" | "msaa" | "taa" | "smaa" | "fxaa" | "off";
export type AuraPostPresetId = "product-studio" | "daylight-outdoor" | "neon-night" | "space" | "underwater" | "arena-fight" | "cinematic-film";
export interface AuraAutoExposureOptions { readonly minEv?: number; readonly maxEv?: number; readonly speedUp?: number; readonly speedDown?: number; readonly meteringMask?: "center-weighted" | "average"; }
export interface AuraPostPreset { readonly id: AuraPostPresetId; readonly output: import("./output").AuraOutputOptions; readonly effects: readonly AuraNodeBuilder<AuraEffectNode>[]; readonly emissiveStrengthRange: readonly [number, number]; }
export const postPresets: Readonly<Record<AuraPostPresetId, AuraPostPreset>>;
export interface AuraCustomPostPass { readonly name: string; readonly insertAt: PostInsertAt; readonly fragment: { readonly glsl: string; readonly wgsl?: string }; readonly uniforms?: Readonly<Record<string, number | readonly number[]>>; readonly inputs?: readonly ("color" | "depth" | "velocity")[]; }
export interface AuraPostSurface { addPostPass(p: AuraCustomPostPass): () => void; setQualityTier(t: AuraQualityTier | "auto"): void; }
export interface AuraPostDiagnostics { readonly tier: AuraQualityTier; readonly antiAlias: AuraAntiAliasMode; readonly renderPixels: number; readonly pixelRatio: number; readonly renderScale: number; readonly stages: PostGraphReport["stages"]; readonly skipped: PostGraphReport["skipped"]; readonly velocityCoverage: { readonly items: number; readonly withVelocity: number }; }
// effects factories (bloom, ambientOcclusion, antiAlias, colorGrade, vignette, filmGrain, chromaticAberration, depthOfField, motionBlur): field lists frozen in PRD 03 §APIs; unknown fields throw AuraRuntimeError("POST_FIELD_UNSUPPORTED") before first frame when A3D_QR_POST is on, warn (option-ignored) when off.
```

Semantics and invariants:
- Every pass between MSAA resolve and `OutputPass` is `linear-hdr` (RGBA16F).
- A `display`-space pass before tonemap is rejected at plan time with `POSTPROCESS_SPACE_INVALID:<id>`.
- Post passes read real near/far from C-08. No pass performs readback.
- `postPresets` values are data, so changing one is not a CCR. Changing the id set is a CCR.

Stub:
- `registerPostPass` stores entries. With `A3D_QR_POST` off, the existing chain runs (`executePostprocess`
  `Renderer.ts:977`), and registered passes are listed in `diagnostics().post.skipped` with reason
  `post-graph-v2-pending`.
- `postPresets` is defined in PR 0a as the seven ids. Each `output` is `{}` and each `effects` is `[]`, with a
  `PRESET_PENDING` degradation. PRD 03 fills the values in its own file `agent-api/postPresets.ts`, and the contract
  file re-exports from there once it exists.
- `addPostPass` maps to `registerPostPass`.

Real (PRD 03): `post/PostGraph.ts` and the WebGL2 `executePostGraph`. PRD 11 adds the WGSL twin.

Conformance: `tests/unit/contracts/C-13-post.test.ts` (space validation; insertAt ordering; preset id set) and
`tests/browser/contracts/C-13-post.spec.ts` (registered linear-hdr pass executes before tonemap when real; zero
readbacks). Flag: `A3D_QR_POST` (sub-flags `A3D_QR_POST_TAA`, `A3D_QR_POST_SSR`, `A3D_QR_POST_AO`).

---

### C-14 Velocity and temporal history
Provider: PRD 03. Consumers: 06 (skinned/morph velocity), 07 (particles write reactive mask), 08 (camera cut and interpolated previous matrices), 11 (instanced previous transforms).
File: `packages/rendering/src/contracts/velocity.ts`. `RenderItem` gains optional fields in PR 0a (`contracts/renderItem.ts` re-exports the interface from `ForwardPass.ts:24`).

```ts
// RenderItem additions (PR 0a, all optional, all inert until A3D_QR_POST):
//   readonly previousModelMatrix?: Float32Array;
//   readonly previousInstanceTransforms?: Float32Array;
//   readonly previousJointTexture?: import("../Texture").Texture;     // C-18 palette.previous
//   readonly previousMorphWeights?: Float32Array;
//   readonly writesReactive?: boolean;                                // particles/transparents (C-07-IN-8)
export const VELOCITY_MRT: { readonly velocityLocation: 1; readonly velocityFormat: "rg16f"; readonly reactiveLocation: 2; readonly reactiveFormat: "r8"; readonly define: "AURA_VELOCITY" };
export interface TemporalHistoryLike { prepare(viewProjection: Float32Array, jitter: readonly [number, number]): { readonly jittered: Float32Array; readonly unjittered: Float32Array; readonly previous: Float32Array }; reset(reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void; }
export function resetTemporalHistory(reason: "camera-cut" | "resize" | "tier-change" | "scene-swap"): void;
// AuraApp.cutCamera(): void  (via C-38; PRD 08's app.camera.cut() calls it)
```

Semantics:
- Velocity is `(currNDC - prevNDC) * 0.5` in UV units, written at location 1 when `AURA_VELOCITY` is defined.
- An item with no previous data writes camera-only velocity.
- `reset` must be called within the same frame as a camera cut.
- `TemporalHistory.prepare` must not re-draw geometry (`TemporalHistory.ts:72-74` throw path).

Stub:
- Fields are inert.
- `resetTemporalHistory` calls the existing `this.temporalHistory.reset()` (`Renderer.ts`, inside `render` before
  post).
- Shader chunks compile `o_velocity`/`o_reactive` out when the attachment is absent (C-07-IN-8 stub).

Real (PRD 03): `forward/Velocity.ts` (carve-out, §3.3) with MRT selection.

Conformance: `tests/unit/contracts/C-14-velocity.test.ts` (velocity math for a translated item) and
`tests/browser/contracts/C-14-velocity.spec.ts` (static scene gives zero velocity; cut resets history).
Flag: `A3D_QR_POST`.

### C-15 Material spec additions and model material overrides
Provider: PRD 04. Consumers: 09 (game kits), 10 (foliage, terrain layers, water), 13 (templates must not use `replaceTextures: true`), 14 (route material work).
File: `packages/engine/src/contracts/materials.ts`. `AuraMaterialSpec` (`index.ts:1027-1120`) and `AuraModelOptions` (`index.ts:1235-1257`, map) gain fields in PR 0a.

```ts
// AuraMaterialSpec additions (PR 0a; owner tags in JSDoc):
//   blend?: AuraBlendMode (C-04, PRD 01); depthWrite?: boolean (PRD 01); ior?: number (PRD 01, reaches F0)
//   specularIntensity?: number; specularColor?: AuraColor; specularIntensityMap?, specularColorMap?: AuraAssetRef<"texture">
//   dispersion?: number; transmissionMap?, thicknessMap?: AuraAssetRef<"texture">
//   alphaMode?: "opaque" | "mask" | "blend"; alphaCutoff?: number; alphaToCoverage?: boolean; doubleSided?: boolean; unlit?: boolean
//   sampling?: AuraTextureSampling (C-12); slotSampling?: Partial<Record<AuraMaterialTextureSlot, AuraTextureSampling>>
//   practical?: boolean (PRD 10: emissive practical light scale)
export interface AuraModelMaterialOverride {
  readonly target?: string | RegExp | readonly (string | RegExp)[];
  readonly color?: AuraColor; readonly colorMode?: "multiply" | "replace"; readonly replaceTextures?: boolean;
  readonly roughness?: number; readonly metallic?: number; readonly emissive?: AuraColor; readonly emissiveIntensity?: number;
  readonly clearcoat?: number; readonly clearcoatRoughness?: number; readonly envMapIntensity?: number; readonly opacity?: number;
}
// AuraModelOptions additions: materialOverrides?: readonly AuraModelMaterialOverride[]; variant?: string
export interface AuraResolvedMaterialInfo { readonly name: string; readonly featureKey: string; readonly baseColorFactor: readonly [number, number, number, number]; readonly enabledMaps: readonly string[]; readonly extensions: readonly string[]; readonly lightsEvaluated: "uniform-16" | "clustered"; readonly warnings: readonly string[]; }
export interface AuraModelMaterialHandle {
  materialNames(): readonly string[];
  materialVariants(): readonly string[];
  setMaterialVariant(name: string | null): void;
  setMaterialOverrides(o: readonly AuraModelMaterialOverride[]): void;   // idempotent, re-applied from the authored snapshot
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
}
// AuraRuntimeNodeHandle.materials?: AuraModelMaterialHandle   (via C-37 extension, model nodes only)
export interface AuraRendererMaterialOptions { readonly materialStrictness?: "warn" | "strict"; readonly materialModel?: "legacy" | "physical-r185"; readonly transmission?: "auto" | "env" | "off"; readonly alphaToCoverage?: boolean; readonly debugView?: "baseColor" | "normal" | "roughness" | "metallic" | "clearcoat" | "clearcoatRoughness" | "clearcoatRoughnessEffective" | "sheen" | "F0" | "tangent" | "anisotropyDirection"; }
export interface AuraMaterialDiagnostics { readonly programs: number; readonly programCompileMs: number; readonly transmissionTargetActive: boolean; readonly lightsDroppedByMaterial: number; readonly paths: { readonly materialModel: string; readonly transmission: string; readonly ktx2: string; readonly tangents: string }; readonly textureBytes: number; readonly textureBudgetBytes: number; readonly downscaledTextures: number; readonly issues: readonly { readonly code: string; readonly material: string; readonly message: string }[]; }
```

Semantics:
- `colorMode: "multiply"` with `replaceTextures` false or omitted preserves base-colour textures. This is the opposite
  of today's tint bridge (`index.ts:13570` `replaceSurfaceTextures: true`, map).
- Overrides are applied in array order, and the last match wins per field.
- The `/joint/i` heuristic and 0.28 constants in `applyMaterialTint` (`TypedGLBActor.ts:484-515`, map) are not part of
  the contract.

Stub:
- `materialOverrides` lowers to the existing `setTint` (`TypedGLBActor.ts:179`) for `color` only. Other fields are
  listed in DIAGNOSTIC_ONLY_FIELDS (owner 4).
- `inspectMaterials` returns names and `featureKey: "legacy"`.

Real (PRD 04): `production-runtime/ModelMaterialOverrides.ts`, plus the TypedGLBActor material extension
(`actor/TypedGLBActorMaterials.ts`, §3.6).

Conformance: `tests/unit/contracts/C-15-materials.test.ts` (override precedence; texture preserved on multiply) and
`tests/browser/contracts/C-15-override.spec.ts`. Flag: `A3D_QR_MATERIALS`.

---

### C-16 Compressed textures and decoder registry
Provider: PRD 05. Consumers: 04 (KTX2 material textures, R6), 07 (KTX2 flipbook atlases), 10 (terrain/foliage KTX2).
File: `packages/assets/src/contracts/decoders.ts` and `packages/rendering/src/contracts/textureFormats.ts`. Seam: `webgl2/TextureFormats.ts` (carve-out of `WebGL2Device.ts:4117-4133` `resolveCompressedTextureFormat`, call site :3922, map).

```ts
// rendering
// TextureCompressedFormat (Texture.ts:1) gains "bc7-rgba-unorm" | "etc2-rgb8unorm" in PR 0a; every exhaustive switch gets a throwing default for the new members.
export interface CompressedTextureCapabilities { readonly astc: boolean; readonly bptc: boolean; readonly etc2: boolean; readonly s3tc: boolean; readonly s3tcSrgb: boolean; }
export function resolveCompressedTextureFormatSlot(): import("./core").ContractSlot<(format: import("../Texture").TextureCompressedFormat, colorSpace: "srgb" | "linear", gl: WebGL2RenderingContext) => number | null>;
// assets
export type KTX2BasisTargetFormat = "astc-4x4-rgba-unorm" | "bc7-rgba-unorm" | "etc2-rgba8unorm" | "etc2-rgb8unorm" | "bc3-rgba-unorm" | "bc1-rgb-unorm" | "rgba8";
export function selectKTX2TargetFormat(caps: CompressedTextureCapabilities, source: "uastc" | "etc1s", hasAlpha: boolean, colorSpace: "srgb" | "linear"): KTX2BasisTargetFormat;
export interface KTX2BasisTextureTranscoderOptions { readonly targetFormat: KTX2BasisTargetFormat; readonly colorSpace: "srgb" | "linear"; readonly maxDimension?: number; readonly transcoderUrl: string; }  // same-origin, default "/aura-decoders/basis/"
export interface AuraAssetDecoderSet { readonly meshopt?: unknown; readonly draco?: unknown; readonly imageDecoder?: unknown; }  // concrete GLTF*Decoder types from GLTFCompressionDecoders.ts
export interface AssetDecoderRegistry { require(decoders: readonly ("meshopt" | "draco" | "ktx2")[]): Promise<AuraAssetDecoderSet>; diagnostics(): { readonly loaded: readonly string[]; readonly failed: readonly { id: string; url: string }[] }; dispose(): void; }
export function createAssetDecoderRegistry(options: { readonly basePath: string; readonly capabilities: CompressedTextureCapabilities; readonly maxTextureSize: number; readonly workerCount: number }): AssetDecoderRegistry;
export class AssetDecoderUnavailable extends Error { readonly decoderId: string; readonly url: string; }
```

Semantics:
- No CDN fetches. The unpkg constant at `KTX2BasisTextureTranscoder.ts:22` is removed by PRD 05.
- A missing decoder throws `AssetDecoderUnavailable`. It never silently falls back.
- sRGB data uses sRGB internal formats.

Stub:
- `selectKTX2TargetFormat` implements a pure capability table: ASTC, then BC7, then ETC2, then BC3/BC1, then RGBA8.
  It ships real in PR 0a because it is pure and has no I/O.
- `createAssetDecoderRegistry` wraps the existing `GLTFCompressionDecoders.ts` loaders.
- `resolveCompressedTextureFormatSlot().stub` is the verbatim moved function.

Real (PRD 05): local vendored decoders (`packages/assets/vendor/{basis,draco}`), worker transcode, sRGB enums, BPTC.

Conformance: `tests/unit/contracts/C-16-ktx2.test.ts`, driven by `tests/unit/assets/ktx2-target-format.table.json`
(PRD 05). Flag: `A3D_QR_ASSETS`.

---

### C-17 Asset manifest 1.1, AssetOptimize, admission
Provider: PRD 05. Consumers: 06 (clip metadata, rigged assets), 07 (KTX2 VFX atlas admission), 09 (SFX pack provenance), 10 (world content), 13 (templates, catalog phrases), 14 (kits K1-K9, per-game replacement lists), 15 (manifest stops emitting lean imports).
File: `packages/aura3d-cli/src/contracts/assetManifest.ts` and `packages/engine/src/contracts/assets.ts`.

```ts
// manifest schema "aura3d.assets/1.1" (reader accepts 1.0 and 1.1; writer emits 1.1)
export type AuraCliAssetRole = "hero" | "character" | "vehicle" | "enemy" | "world" | "prop" | "set-dressing" | "backdrop" | "proxy" | "hdri" | "texture-set" | "vfx-atlas" | "audio";
export interface AuraCliDerivedAsset { readonly url: string; readonly hash: string; readonly mobileUrl?: string; readonly collisionUrl?: string; readonly profile: AssetOptimizeProfileId; readonly steps: readonly OptimizeStepRecord[]; }
export interface AuraCliAssetEntry1_1 {
  readonly id: string; readonly role: AuraCliAssetRole; readonly source: string; readonly license: string; readonly hash: string;
  readonly derived?: AuraCliDerivedAsset; readonly admission?: AuraCliAdmissionRecord; readonly lookDev?: AuraCliLookDevRecord;
  readonly artDirection?: string; readonly aliasOf?: string; readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number };
  readonly animationClips?: readonly { readonly name: string; readonly duration: number; readonly channelCount: number }[];   // PRD 06 typegen
}
export type AssetOptimizeProfileId = string;   // ids defined in tools/asset-optimize/profiles.ts (PRD 05)
export interface OptimizeStepRecord { readonly step: string; readonly ms: number; readonly bytesBefore: number; readonly bytesAfter: number; }
export interface AssetBudgetMeasurement { readonly triangles: number; readonly drawCalls: number; readonly gpuBytesByTier: Readonly<Record<AuraQualityTier, number>>; readonly downloadBytes: number; }
export interface AssetQualityCheck { readonly gate: `G${1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11}`; readonly verdict: "pass" | "fail" | "waived-by-role"; readonly measured: unknown; readonly message: string; }
export interface AuraCliAdmissionRecord { readonly status: "admitted" | "rejected" | "pending"; readonly checks: readonly AssetQualityCheck[]; readonly at: string; }
export interface AuraCliLookDevRecord { readonly runUrl: string; readonly reviews: readonly { readonly reviewer: string; readonly verdict: "accept" | "reject"; readonly notes: string; readonly at: string }[]; }
export function optimizeAssets(options: { readonly ids?: readonly string[]; readonly dryRun?: boolean; readonly profile?: AssetOptimizeProfileId }): Promise<{ readonly rows: readonly { readonly id: string; readonly budget: AssetBudgetMeasurement; readonly checks: readonly AssetQualityCheck[] }[] }>;
// engine: AuraAssetDefinition (index.ts:951-960 map) additions: variants?: { source?: string; mobile?: string }; requiredDecoders?: readonly ("meshopt"|"draco"|"ktx2")[]; lods?: readonly { level: number; screenCoverage: number }[]; colliderUrl?: string; budget?: { triangles: number; gpuBytesHigh: number }
// AuraModelOptions additions: lod?: false | "auto" | { bias?: number; crossFadeSeconds?: number }; collider?: "auto" | "bounds" | false
// AuraCreateAppOptions.assets?: { decoders?: { basePath?: string; meshopt?: boolean; draco?: boolean; ktx2?: boolean; workerCount?: number }; variant?: "optimized" | "source" | "mobile"; maxTextureSize?: number; lod?: false }
```

Semantics:
- Derived files are content-addressed: `public/aura-assets/<id>.<derivedHash8>.glb`.
- `aura.assets.json` is a generated file. It changes only through `aura3d assets …` commands (§4.3 generated-file
  rule).
- Admission gates are pure functions over glTF JSON.

Stub:
- The reader accepts 1.1 fields and ignores unknown ones. The writer keeps emitting 1.0 until `A3D_QR_ASSETS` is on.
- Engine-side fields are DIAGNOSTIC_ONLY (owner 5).
- Consumers needing clips use the existing `AuraCliAnimationClipInspection`.

Real (PRD 05): `tools/asset-optimize/`, `packages/aura3d-cli/src/admission/`, `apps/asset-lookdev/`, and the curated
`assets/library` (HDRIs ≥6 at 2k for PRD 02/12).

Conformance: `tests/unit/contracts/C-17-manifest.test.ts` (1.0 and 1.1 round-trip; gate purity). Flag: `A3D_QR_ASSETS`.

---

### C-18 Deformation resources
Provider: PRD 06. Consumers: 01 (generator includes `deform`), 02 (skinned/morph depth variants, joint-AABB caster culling), 03 (previous palette for velocity), 11 (compileAsync, palette budgets).
File: `packages/rendering/src/contracts/deform.ts`. `TextureDescriptor`/`TextureDimension` (`Texture.ts:5,30`) gain fields in PR 0a. Seams: `forward/Skinning.ts` and `forward/Morph.ts` (carve-outs of `ForwardPass.ts:1855-2036`, map), `webgl2/TextureUpload.ts`.

```ts
// Texture.ts additions (PR 0a): TextureDimension = "2d" | "cube" | "2d-array"; TextureDescriptor.layers?: number;
//   class Texture { readonly revision: number; update(data: TexturePixelData, region?: { x: number; y: number; width: number; height: number; layer?: number }): void }
//   (stub: update() replaces data and bumps revision; WebGL2Device re-uploads the whole texture on revision change)
export interface SkinningPaletteBinding { readonly jointCount: number; readonly matrices: Float32Array; readonly previousMatrices?: Float32Array; readonly paletteKey: object; readonly extraInfluences?: boolean; }
export interface SkinningPaletteTextureCacheLike {
  acquire(device: import("../RenderDevice").RenderDevice, key: object, jointCount: number): { readonly current: import("../Texture").Texture; readonly previous: import("../Texture").Texture };
  upload(key: object, matrices: Float32Array): void; swap(key: object): void; release(key: object): void;
  diagnostics(): { readonly textures: number; readonly bytes: number; readonly createdThisFrame: number };
}
export type MorphTargetTextureResult = { readonly texture: import("../Texture").Texture; readonly targetCount: number; readonly hasNormals: boolean; readonly hasTangents: boolean } | { readonly fallback: "cpu"; readonly reason: string };
export function buildMorphTargetTexture(geometry: import("../Geometry").Geometry, targets: readonly import("../MorphTargetPlan").MorphTargetDelta[], limits: { readonly maxTextureSize: number; readonly maxArrayLayers: number }, format?: "rgba16f" | "rgba32f"): MorphTargetTextureResult;
/** Chunks: "a3d_prd06_skinning_common" (u_boneTexture/u_prevBoneTexture), "a3d_prd06_morph_texture" (sampler2DArray), "a3d_prd06_deform": void a3dDeform(out vec4 pos, out vec3 nrm, out vec4 tan); void a3dDeformPrevious(out vec4 pos). Hook point: "vertex:deform". */
export const DEFORM_CHUNKS: readonly ["a3d_prd06_skinning_common", "a3d_prd06_morph_texture", "a3d_prd06_deform"];
export const deformFeatureId: "prd06.deform";
```

Semantics and invariants:
- Morph weights are bucketed into {4, 8, 16, 32}. Truncation emits `MORPH_TARGETS_TRUNCATED`.
- Palette keys are stable per skin instance.
- `previous` is the palette of the previous presented frame.
- Each texture is created once per key, with no per-frame allocation (C-28 counters).

Stub:
- `forward/Skinning.ts` and `forward/Morph.ts` contain the verbatim moved current code. That is
  `applySkinningUniforms` (`ForwardPass.ts:1942-2006`, map), `createSkinningPaletteTexture` (:2014-2036, map) and
  `applyGpuMorphUniforms` (:1855-1940, map).
- `buildMorphTargetTexture` returns `{ fallback: "cpu", reason: "PRD06_PENDING" }`.
- The deform chunks are registered as passthrough (`pos = vec4(a_position,1)`).

Real (PRD 06): `SkinningPaletteTextureCache.ts`, `SkinningUniforms.ts`, `SkinningBounds.ts`, the morph texture, and
the 8-influence path.

Conformance: `tests/unit/contracts/C-18-deform.test.ts` (palette key stability; no allocation on second upload) and
`tests/browser/contracts/C-18-deform.spec.ts` (GPU deform equals CPU reference within 1e-3 world units on the
fixture). Flag: `A3D_QR_ANIMATION`.

---

### C-19 AnimationPlayback API
Provider: PRD 06. Consumers: 07 (bone sockets for trails/emitters), 08 (hit-stop via timeScale), 09 (character binding in `game`), 13 (templates: `tracksApplied > 0`), 14 (games).
File: `packages/engine/src/contracts/animation.ts` and `packages/animation/src/contracts/pose.ts`.

```ts
// AuraAnimationSpec (index.ts:1288-1304) additions (PR 0a):
//   crossFade?: number | false; transition?: "crossfade" | "inertialize"; warp?: boolean; syncGroup?: string; layer?: string;
//   blendMode?: "override" | "additive"; additiveReference?: { clip?: string; time?: number }; mask?: AuraBoneMaskSpec; weight?: number;
//   rootMotion?: AuraRootMotionSpec | false; fallback?: "error" | "first"; restPoseReset?: boolean
export interface AuraBoneMaskSpec { readonly include?: readonly string[]; readonly exclude?: readonly string[]; readonly humanoid?: "upper-body" | "lower-body" | "head" | "arms"; }
export interface AuraRootMotionSpec { readonly bone?: string; readonly axes?: readonly ("x" | "y" | "z" | "yaw")[]; readonly mode: "apply" | "extract-only"; }
export interface AuraResolvedClipInfo { readonly name: string; readonly duration: number; readonly channelCount: number; readonly hasRootMotionCandidate: boolean; }
export interface AuraActorAnimationStateSnapshot { readonly activeClip: string | null; readonly tracksApplied: number; readonly activeActions: readonly { readonly clip: string; readonly layer: string; readonly weight: number; readonly time: number }[]; readonly timeScale: number; }
export interface AuraBoneSocket { readonly bone: string; worldMatrix(out?: Float32Array): Float32Array; readonly valid: boolean; }
export interface AuraActorAnimationApi {
  crossFadeTo(clip: string, seconds: number, options?: { transition?: "crossfade" | "inertialize"; warp?: boolean }): this;
  playLayer(layer: string, clip: string, options?: { weight?: number; fadeIn?: number; mask?: AuraBoneMaskSpec; blendMode?: "override" | "additive" }): this;
  stopLayer(layer: string, fadeOut?: number): this;
  resolveAnimationClips(): Promise<readonly AuraResolvedClipInfo[]>;
  animationState(): AuraActorAnimationStateSnapshot | undefined;
  socket(bone: string): AuraBoneSocket;
  readonly ik: { add(spec: unknown): () => void; clear(): void };          // concrete specs: PRD 06 TwoBoneIk/LookAt/Ccd/FootIk
  readonly springBones: { add(spec: unknown): () => void; clear(): void };
}
// AuraRuntimeNodeHandle gains these members on model nodes (via C-37 extension "prd06.animation")
export interface AuraCreateAppAnimationOptions { readonly strict?: boolean; readonly defaults?: "3.0" | "3.1"; readonly mixer?: "pose" | "legacy"; readonly tier?: AuraQualityTier; }
// renderer options additions: skinnedShadows?: boolean; morph?: "gpu" | "cpu"; skinnedPbr?: "unified" | "fork"
export interface AuraAnimationDiagnostics { readonly actors: readonly { readonly id: string; readonly activeClip: string | null; readonly tracksApplied: number; readonly activeActions: number; readonly mixerMs: number; readonly constraintsMs: number; readonly springsMs: number; readonly paletteBytes: number; readonly morphActive: number; readonly morphDropped: number; readonly cpuMs: number }[]; }
```

Semantics:
- The per-actor time used by the mixer is `dt * app.time.scale * handle.timeScale` (C-23). Hit-stop freezes
  `handle.timeScale` actors.
- With `fallback: "error"`, an unknown clip name throws. With `"first"`, it plays the first clip with a warning.
  The default is `"error"` in 3.1 defaults and `"first"` in 3.0.
- `tracksApplied` counts channels written to the presented pose this frame.

Stub:
- `crossFadeTo` maps to the existing `node.play` (`index.ts:10970-10973`, map) with an immediate switch.
- `playLayer` and `stopLayer` apply to the base layer only and report `option-ignored`.
- `socket()` returns the node root world matrix with `valid: false` (C-07-IN-7 stub).
- `animationState()` reads the existing `applyProductionActorAnimation` result (`index.ts:15070-15132`).

Real (PRD 06): `@aura3d/animation/pose` (PoseMixer, inertializer, blend trees, IK, retargeting), and actor binding in
`actor/TypedGLBActorAnimation.ts` (§3.6).

Conformance: `tests/unit/contracts/C-19-animation.test.ts` (timeScale composition; fallback semantics) and
`tests/browser/contracts/C-19-tracks-applied.spec.ts` (a rigged fixture reports tracksApplied > 0 and its bone moves
between frames). Flag: `A3D_QR_ANIMATION`.

---

### C-20 ParticleEmitter render hook and `app.effects`
Provider: PRD 07. Consumers: 08 (feel bus `vfx`), 09 (`GameFxLayer` backend `particle-pass`), 13 (skills, recipes), 14 (games).
File: `packages/engine/src/contracts/effects.ts` and `packages/rendering/src/contracts/particles.ts`.

```ts
// rendering
export interface ParticleBatchDescriptor { readonly key: string; readonly capacity: number; readonly source: "cpu" | "gpu" | "procedural" | "compute"; readonly atlas: import("../Texture").Texture; readonly blend: import("./blend").BlendMode; readonly shading: "unlit" | "lit"; readonly softDepth: boolean; readonly stretch: boolean; readonly frameBlend: boolean; }
export interface ParticleBatchHandle { readonly key: string; readonly liveCount: number; }
export interface ParticleRenderHook {
  upsertBatch(desc: ParticleBatchDescriptor): ParticleBatchHandle;
  writeInstances(h: ParticleBatchHandle, data: Float32Array, liveCount: number): void;
  removeBatch(h: ParticleBatchHandle): void;
}
/** PRD 07 registers a C-01 FrameContributor "prd07.particles" (phase "transparent") that draws all batches. */
export const particleRenderHookSlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice) => ParticleRenderHook>;
export const PARTICLE_PROGRAM_DEFINES: readonly ["PARTICLE_SOURCE", "STRETCH", "SHADING_LIT", "PARTICLE_SHADOW", "SOFT_PARTICLES", "FRAME_BLEND", "BLEND_ADDITIVE", "FOG_VOLUMETRIC"]; // C-07-OUT-7

// engine
export type AuraVfxKind = "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble" | "impact-flash" | "super-flash" | "impact-decal" | "aura-burst";
export interface AuraVfxEffectSpec { readonly name: string; readonly layers: readonly ({ readonly type: "emitter" | "mesh" | "ribbon" | "decal" | "light" | "camera"; readonly at?: number } & Readonly<Record<string, unknown>>)[]; }
export interface AuraEffectInstanceHandle { readonly id: string; readonly alive: boolean; stop(o?: { immediate?: boolean }): void; setPosition(p: AuraVec3): void; setDirection?(n: AuraVec3): void; }
export interface AuraDecalOptions { readonly kind?: string; readonly size?: number; readonly lifetime?: number; readonly color?: AuraColor; readonly opacity?: number; }
export interface AuraAppEffects {
  burst(kind: AuraVfxKind, position: AuraVec3, options?: { count?: number; speed?: number; scale?: number; color?: AuraColor; normal?: AuraVec3; seed?: number; intensity?: number }): AuraEffectInstanceHandle;
  spawn(effect: AuraVfxEffectSpec | AuraVfxKind, at: AuraVec3 | { node: string; socket?: string }, options?: { seed?: number; scale?: number; color?: AuraColor }): AuraEffectInstanceHandle;
  trail(target: string | { node: string; socket?: string }, options: { width: number; life: number; color?: AuraColor }): AuraEffectInstanceHandle;
  decal(at: { position: AuraVec3; normal: AuraVec3; target?: string }, options: AuraDecalOptions): AuraEffectInstanceHandle;
  readonly presets: Readonly<Record<AuraVfxKind, AuraVfxEffectSpec>>;
  registerPreset(kind: string, spec: AuraVfxEffectSpec): void;
  readonly liveCount: number;
  clear(): void;
}
// AuraApp.effects: AuraAppEffects (via C-38)
export interface AuraEffectsDiagnostics { readonly nodes: readonly { readonly id: string; readonly effect: string; readonly consumer: string; readonly live: number; readonly drawCalls: number; readonly instancesDrawn: number; readonly sim: string; readonly softDepth: boolean; readonly zeroPixelFrames: number }[]; readonly batches: number; readonly liveParticles: number; readonly budget: { readonly tier: AuraQualityTier; readonly cap: number; readonly culled: number }; readonly gpuMs?: number; readonly errors: readonly { readonly code: string; readonly nodeId: string; readonly message: string }[]; readonly pixelBacked: readonly string[]; }
```

Semantics and invariants:
- A declared effect that draws zero pixels reports `EFFECT_ZERO_PIXELS`. Effects never report success without
  `instancesDrawn > 0`.
- `liveParticles` never exceeds the C-27 `particleBudget`. Continuous emitters reduce emission and never kill
  particles mid-life.
- `pixelBacked` lists effect kinds that actually drew this frame. PRD 13's prompt v2 consumes it (C-07-fx).

Stub (PR 0a, honest):
- `burst` and `spawn` create pooled primitive nodes through C-37 `add`: small unlit spheres or quads, scaled over
  their lifetime, using today's `createGameEffects` primitive shapes (`GameRuntime.ts:2800-2879`, map).
  `trail` is a polyline of primitives. `decal` is a quad.
- `pixelBacked` is computed from the stub's own draw counts, so a primitive-pool burst is pixel-backed and reported as
  `sim: "primitive-pool"`.
- `particleRenderHookSlot.stub` throws `PARTICLE_PASS_PENDING`.
- Today's production bridge draws zero particle pixels (benchmark 14-particles scores 1/10, research 23). The stub
  reports `EFFECT_ZERO_PIXELS` for `effects.particles` nodes rather than hiding it.

Real (PRD 07): `packages/rendering/src/vfx/` (ParticleBatchPass, ribbons, decals, mesh particles) and
`agent-api/vfx/`.

Conformance: `tests/unit/contracts/C-20-effects.test.ts` (budget cap; zero-pixel reporting) and
`tests/browser/contracts/C-20-burst.spec.ts` (burst gives instancesDrawn > 0 and a non-empty diff region).
Flag: `A3D_QR_VFX`.

---

### C-21 Sky, fog, atmosphere
Provider: PRD 07. Consumers: 02 (sky-only capture → IBL), 10 (biome rigs compose sky and fog), 13 (looks), 14 (games).
File: `packages/engine/src/contracts/atmosphere.ts` and `packages/rendering/src/contracts/atmosphere.ts`.

```ts
// engine
export interface AuraSkySunSpec { readonly elevationDeg: number; readonly azimuthDeg: number; readonly intensity?: number; readonly color?: AuraColor; readonly discSize?: number; }
export type AuraSkySpec =
  | { readonly model: "preetham"; readonly sun: AuraSkySunSpec; readonly turbidity?: number; readonly rayleigh?: number; readonly mieCoefficient?: number; readonly mieDirectionalG?: number; readonly exposure?: number; readonly clouds?: unknown; readonly stars?: unknown; readonly moon?: unknown; readonly groundColor?: AuraColor }
  | { readonly model: "gradient"; readonly zenith: AuraColor; readonly horizon: AuraColor; readonly ground?: AuraColor; readonly exponent?: number; readonly horizonGlow?: number; readonly sun?: AuraSkySunSpec; readonly bands?: unknown; readonly stars?: unknown; readonly moon?: unknown; readonly intensity?: number }
  | { readonly model: "hdri"; readonly texture: AuraAssetRef<"texture">; readonly intensity?: number; readonly rotation?: number; readonly blurriness?: number }
  | { readonly model: "cubemap"; readonly faces: readonly AuraAssetRef<"texture">[]; readonly intensity?: number };
export interface AuraHeightFogSpec { readonly mode?: "height" | "exp" | "exp2" | "linear" | "absorption"; readonly color?: AuraColor | "sky"; readonly density?: number; readonly heightDensity?: number; readonly heightFalloff?: number; readonly heightReference?: number; readonly start?: number; readonly maxOpacity?: number; readonly near?: number; readonly far?: number; readonly absorption?: AuraVec3; readonly sunInscatter?: number; readonly anisotropy?: number; readonly affectsBackground?: boolean; readonly backgroundDistance?: number; readonly transitionSeconds?: number; }
export interface AuraVolumetricFogSpec extends AuraHeightFogSpec { readonly quality?: "auto" | "analytic" | "froxel"; readonly volumetricFar?: number; readonly noise?: unknown; readonly lightShafts?: boolean; readonly localLights?: boolean; }
export interface AuraSkyNode { readonly kind: "sky"; readonly name: string; readonly spec: AuraSkySpec; readonly captureEnvironment: boolean; readonly affectsFog: boolean; }
export interface AuraAppAtmosphere { setFog(spec: AuraHeightFogSpec | null, o?: { transitionSeconds?: number }): void; setSky(spec: Partial<AuraSkySpec>, o?: { transitionSeconds?: number }): void; setWetness(value: number, o?: { transitionSeconds?: number }): void; state(): { readonly fog: AuraHeightFogSpec | null; readonly sky: AuraSkySpec | null; readonly wetness: number }; }
// AuraApp.atmosphere: AuraAppAtmosphere (via C-38); sky.preetham/gradient/hdri builders; sky node kind registered via C-36
// rendering
/** Chunk "a3d_prd07_fog": vec3 a3dApplyFog(vec3 color, vec3 worldPos); float a3dFogAmount(vec3 worldPos); float a3dHeightFogTau(vec3 a, vec3 b, float density). Hook "fragment:fog". */
export const FOG_CHUNK: "a3d_prd07_fog";
/** Chunk "a3d_prd07_wetness" behind #define A3D_WETNESS; uniforms u_wetness, u_puddleThreshold, u_rainRipples, u_snowCover. Hook "fragment:material". */
export const WETNESS_CHUNK: "a3d_prd07_wetness";
export interface SkyBackgroundPassLike { setSpec(spec: AuraSkySpec, time: number): void; renderToCubeFace(face: 0 | 1 | 2 | 3 | 4 | 5, target: import("../RenderTarget").RenderTarget, viewProjection: Float32Array): void; horizonRadiance(azimuthSamples: 8): Float32Array; }
export const skyBackgroundSlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice) => SkyBackgroundPassLike>;
/** Sky change event for re-capture (C-07-OUT-4): emitted when the sun moves > 0.5 degrees. */
export function onSkyChanged(listener: (spec: AuraSkySpec) => void): () => void;
```

Semantics:
- The sky draws after opaque with LEQUAL at the far plane (C-01 phase `background` when real).
- `color: "sky"` samples sky horizon radiance.
- `a3dApplyFog` operates in linear HDR before OutputPass.
- Fog defaults are frozen to PRD 07 §6.6: `mode: "height"`, `density` (σ_d) `0.004`, `heightDensity` (σ_h)
  `0.008`, `heightFalloff` `0.2`, `heightReference` `0`, `start` `2`, `maxOpacity` `1`, `color` `"sky"`
  (else `#a9bccf`). Today's values are `effects.fog` at `index.ts:3442-3449` (density 0.12 exp2, cap ≤ 0.525),
  with `near 1/far 60` hard-coded at :12755-12756 (map). Legacy density-only calls keep exp2.

Stub (PR 0a):
- `sky.preetham` and `sky.gradient` lower to today's `sky.dayNight` (`index.ts:3730-3770`), with a
  `capability-degraded` degradation.
- `setFog` writes the existing `environmentFog` RenderSource field (`createProductionRuntimeEnvironmentFog`
  `index.ts:12733-12786`).
- `a3dApplyFog` stub chunk is linear fog from `u_fogColor/u_fogNear/u_fogFar`.
- `skyBackgroundSlot.stub.renderToCubeFace` clears to the horizon colour.

Real (PRD 07): `packages/rendering/src/atmosphere/`, Preetham sky, height/volumetric fog, wetness. The posterized
`planSkyBackdrop` bands are deleted.

Conformance: `tests/unit/contracts/C-21-atmosphere.test.ts` (fog transmittance closed form against the reference;
spec union validation) and `tests/browser/contracts/C-21-sky.spec.ts`. Flag: `A3D_QR_VFX` (sub-flags
`A3D_QR_VFX_SKY`, `A3D_QR_VFX_FOG`, `A3D_QR_VFX_VOLUMETRIC`).

### C-22 CameraRig live API
Provider: PRD 08. Consumers: 03 (`cut()` → temporal reset), 09 (game shell transitions, scenarios `cameraPose`), 12 (camera evidence gates M1-M6), 13 (templates, prompt camera mapping), 14 (games).
File: `packages/engine/src/contracts/camera.ts`.

```ts
export interface AuraCameraPose { readonly position: AuraVec3; readonly target: AuraVec3; readonly up: AuraVec3; readonly roll: number; readonly fov: number; readonly near: number; readonly far: number; readonly orthographicSize?: number; }
export type AuraEaseName = "linear" | "inQuad" | "outQuad" | "inOutQuad" | "inCubic" | "outCubic" | "inOutCubic" | "outBack" | "outElastic" | "inOutSine" | "outExpo";
export interface AuraCameraSubject { readonly position: AuraVec3; readonly velocity: AuraVec3; readonly forward: AuraVec3; readonly bounds: { readonly min: AuraVec3; readonly max: AuraVec3 }; }
export interface AuraCameraProbe { sphereCast(from: AuraVec3, to: AuraVec3, radius: number): { readonly hit: boolean; readonly distance: number; readonly node?: string }; occluders(from: AuraVec3, to: AuraVec3): readonly string[]; }
export interface AuraCameraRigContext { readonly dt: number; readonly time: number; readonly aspect: number; readonly previous: AuraCameraPose; subject(ref: string | AuraRuntimeNodeHandle): AuraCameraSubject | undefined; readonly probe: AuraCameraProbe; }
export interface AuraCameraRig { readonly id: string; update(ctx: AuraCameraRigContext): AuraCameraPose; reset?(pose?: AuraCameraPose): void; }
export interface AuraCameraLayer { readonly id: string; readonly timeDomain?: "real" | "sim"; apply(pose: AuraCameraPose, ctx: { readonly dt: number; readonly reducedMotion: boolean }): AuraCameraPose; readonly energy?: () => number; }
export interface AuraTraumaLayer extends AuraCameraLayer { add(amount: number): void; configure(o: { maxAngleDeg?: number; maxOffset?: number; frequency?: number; decayPerSecond?: number }): void; }
export interface AuraPunchLayer extends AuraCameraLayer { trigger(o: { fov?: number; dolly?: number; attack?: number; hold?: number; release?: number }): void; }
export interface AuraFovKickLayer extends AuraCameraLayer { set(channel: string, offsetDeg: number, halflife?: number): void; }
export interface AuraCameraShot { readonly rig: AuraCameraRig; readonly duration: number; readonly blendIn?: number; readonly bars?: boolean; }
export interface AuraCameraSequence { readonly id: string; readonly shots: readonly AuraCameraShot[]; readonly onEnd?: "hold" | "return"; }
export interface AuraCameraSequencePlayback { readonly done: Promise<void>; skip(): void; readonly progress: number; }
export interface AuraCameraEvidence { readonly kind: "aura-camera-presented"; readonly rig: string; readonly pose: AuraCameraPose; readonly viewProjection: readonly number[]; readonly layers: readonly { readonly id: string; readonly energy: number }[]; readonly subjectScreenHeightFraction?: number; readonly cutThisFrame: boolean; }
export interface AuraCameraController {
  presented(): AuraCameraPose;
  setPose(p: Partial<AuraCameraPose>, o?: { cut?: boolean }): void;
  setFov(fov: number, o?: { halflife?: number }): void;
  setRoll(roll: number, o?: { halflife?: number }): void;
  use(rig: AuraCameraRig, o?: { blend?: number; ease?: AuraEaseName }): void;
  readonly rig: AuraCameraRig;
  addLayer(l: AuraCameraLayer, order?: number): () => void;
  readonly shake: AuraTraumaLayer; readonly punch: AuraPunchLayer; readonly fovKick: AuraFovKickLayer;
  play(s: AuraCameraSequence): AuraCameraSequencePlayback;
  cut(): void;                      // calls resetTemporalHistory("camera-cut") (C-14)
  evidence(): AuraCameraEvidence;
}
export interface AuraCameraRailOptions { readonly points: readonly AuraVec3[]; readonly lookAt: string | AuraVec3 | readonly AuraVec3[]; readonly fov?: number | readonly number[]; readonly duration: number; readonly ease?: AuraEaseName; readonly loop?: "none" | "loop" | "pingpong"; readonly alpha?: number; }
export interface AuraCameraRigFactories {
  chase(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  flight(o: Readonly<Record<string, unknown>> & { target: string; horizonLock?: number; followPitch?: number }): AuraCameraRig;
  follow2d(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  fighting(o: Readonly<Record<string, unknown>> & { fighters: readonly [string, string] }): AuraCameraRig;
  shoulder(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  orbit(o: Readonly<Record<string, unknown>>): AuraCameraRig;
  topDown(o: Readonly<Record<string, unknown>> & { target?: string; pitchDeg?: number }): AuraCameraRig;
  altitude(o: Readonly<Record<string, unknown>> & { target: string }): AuraCameraRig;
  rail(o: AuraCameraRailOptions): AuraCameraRig;
  static(pose: Partial<AuraCameraPose>): AuraCameraRig;
  fromSpec(spec: AuraCameraSpec): AuraCameraRig;   // AuraCameraSpec: index.ts:3163
}
// camera.rigs: AuraCameraRigFactories (rig-specific option interfaces are PRD 08's and are additive); AuraApp.camera: AuraCameraController (via C-38)
// createAuraApp({ camera?: { legacy?: boolean; freezeSpecs?: boolean } }) (PR 0a)
```

Semantics:
- `presented()` returns the pose actually used to render this frame, after layers. Evidence is computed from the
  same pose.
- Layers apply in `order`. `reducedMotion` scales trauma and punch to 0 and FOV kick to 25%.
- Direct writes to camera node fields are disallowed under `A3D_QR_CAMERA` (`tools/camera-cast-codemod` reports
  them).

Stub (PR 0a):
- `presented()` reads the current camera spec through the existing camera resolution. That path ends in
  `createProductionRuntimeRendererInput` (`index.ts:13842`).
- `setPose` writes the camera node.
- `use(rig)` registers a per-frame callback that calls `rig.update` and `setPose`.
- `camera.rigs.fromSpec` and `static` are real. The other factories return a static rig at the subject's bounds plus
  the spec offset, with `capability-degraded`.
- Layers are applied, because they are pure math on the pose.
- `cut()` calls C-14 `resetTemporalHistory`.

Real (PRD 08): `agent-api/camera/` (controller, rigs, springs, spline, framing, probe) and `time/Interpolation.ts`.

Conformance: `tests/unit/contracts/C-22-camera.test.ts` (layer order; reduced motion; spline arc-length; evidence
equals presented) and `tests/browser/contracts/C-22-presented.spec.ts` (screen-projected subject matches
`subjectScreenHeightFraction` within 2%). Flag: `A3D_QR_CAMERA`.

---

### C-23 Time controller, feel bus, screen-feel uniforms
Provider: PRD 08. Consumers: 03 (screen-feel uniforms in post), 06 (per-actor timeScale), 07 (feel `vfx` → `app.effects`), 09 (`GameSession.hitStop/slowMo/setTimeScale` delegate here), 14.
File: `packages/engine/src/contracts/time.ts`.

```ts
export interface AuraTimeController {
  scale: number;
  scaleTo(value: number, halflife: number): void;
  hitStop(seconds: number, o?: { scope?: "global" | readonly (string | AuraRuntimeNodeHandle)[] }): void;
  slowMo(scale: number, seconds: number, o?: { easeOut?: number }): void;
  readonly simTime: number; readonly realTime: number; readonly hitStopRemaining: number;
}
export interface AuraLoopOptions { readonly fixedDt?: number; readonly maxSubSteps?: number /* default 6 */; readonly maxFrameDt?: number /* 0.1 */; readonly overload?: "slow-motion" | "catch-up"; readonly interpolation?: boolean; readonly renderPerSubstep?: boolean; }
// AuraRuntimeNodeHandle additions (via C-37 extension "prd08.time"): interpolate: boolean; timeScale: number; teleport(x: number, y: number, z: number, rotation?: AuraVec3): this
export interface AuraFeelEventSpec { readonly shake?: number; readonly punch?: { readonly fov?: number; readonly dolly?: number }; readonly hitStop?: { readonly seconds: number; readonly scope?: "global" | "actors" }; readonly haptics?: { readonly strong?: number; readonly weak?: number; readonly ms?: number }; readonly audio?: { readonly cue: string; readonly pitchJitter?: number; readonly gainJitter?: number; readonly positional?: boolean }; readonly vfx?: { readonly kind: string; readonly count?: number }; readonly screen?: { readonly flash?: number; readonly chroma?: number; readonly radialBlur?: number; readonly vignette?: number }; }
export interface AuraFeelBus { define(event: string, spec: AuraFeelEventSpec): void; emit(event: string, at?: { position?: AuraVec3; actors?: readonly string[]; strength?: number }): void; preset(name: "arcade" | "fighting" | "racing" | "platformer" | "puzzle" | "calm"): void; evidence(): { readonly emitted: number; readonly executed: Readonly<Record<string, number>> }; }
export interface AuraScreenFeelUniforms { readonly flash: number; readonly chroma: number; readonly radialBlur: number; readonly vignette: number; readonly center: readonly [number, number]; }
export const SCREEN_FEEL_BLACKBOARD_KEY: "prd08.screenFeel";   // published per frame on the C-01 blackboard
// AuraApp: readonly time: AuraTimeController; readonly feel: AuraFeelBus; onRender(cb: (f: { alpha: number; realDt: number; simTime: number }) => void): () => void   (via C-38)
```

Semantics and invariants:
- `scale` multiplies simulation dt.
- `hitStop` with a scope list freezes only those actors: their `timeScale` reads 0 for the duration.
- `hitStop` and `slowMo` run on real time.
- `emit` executes each channel through its owning contract: `vfx` through C-20, `audio` through C-25, `screen`
  through C-13 post (or C-05 overlay), and `shake`/`punch` through C-22.
- `executed[channel]` counts only channels that actually ran. A channel whose contract is a stub that did nothing
  counts 0. This is the evidence-only-feel defect that PRD 13's lint rule `look/evidence-only-feel` checks.

Stub:
- `AuraTimeController` is real, since it is pure state. It is wired to the existing `FrameLoop` (`FrameLoop.ts`) via
  `setTimeScale` in PR 0b. Today's `maxSubSteps ?? 5` stays at `index.ts:7061`/`:8204` (map) until PRD 08 changes it.
- The screen-feel uniforms are published. With no consumer they appear in `diagnostics().camera.screenFeel` only.

Real (PRD 08): `agent-api/time/`, `agent-api/feel/`.

Conformance: `tests/unit/contracts/C-23-time.test.ts` (scoped hit-stop; slowMo ease; executed counts only real
channels). Flag: `A3D_QR_CAMERA`.

---

### C-24 GameShell, Session, HUD, Touch, capture context
Provider: PRD 09. Consumers: 12 (capture beacon, scenario query), 13 (6 game templates), 14 (all 18 routes).
File: `packages/engine/src/contracts/game.ts`. `@aura3d/game` is created by PRD 09, and its subpath export is reserved in PR 0a (§3.8).

```ts
export type GameSessionState = "booting" | "loading" | "title" | "playing" | "paused" | "results" | "transitioning" | "context-lost" | "disposed";
export type PauseReason = "user" | "blur" | "visibility" | "menu" | "context-lost";
export interface TransitionSpec { readonly kind: "fade" | "cut" | "wipe"; readonly ms?: number; readonly color?: string; }
export interface GameSession { readonly state: GameSessionState; readonly paused: boolean; readonly timeScale: number; readonly simTime: number; readonly seed: number; readonly reducedMotion: boolean; readonly reducedFlash: boolean; readonly highContrast: boolean; pause(reason?: PauseReason): void; resume(): void; setTimeScale(scale: number, o?: { rampMs?: number }): void; hitStop(seconds: number, o?: { actors?: readonly string[] }): void; slowMo(scale: number, ms: number, o?: { ease?: string }): void; scaledDt(rawDt: number, actorId?: string): number; isFrozen(actorId?: string): boolean; on(event: "state" | "pause" | "resume" | "settings", cb: (s: GameSession) => void): () => void; }
export interface GameShell { readonly state: GameSessionState; showResults(values: Readonly<Record<string, number>>): Promise<"retry" | "title" | "next">; transition<T>(run: () => T | Promise<T>, spec?: TransitionSpec): Promise<T>; openMenu(id: "pause" | "settings" | "about"): void; closeMenus(): void; setLoadingProgress(fraction: number, label?: string): void; track(promise: Promise<unknown>, weight: number): void; }
export type GameShellLayout = "full-bleed" | "letterbox-16x9" | "letterbox-4x3";
export interface HudWidgetSpec { readonly id: string; readonly kind: string; readonly anchor: "top-left" | "top" | "top-right" | "left" | "center" | "right" | "bottom-left" | "bottom" | "bottom-right"; readonly label?: string; }
export interface Hud { set(id: string, value: unknown): void; banner(text: string, o?: { holdMs?: number; style?: string }): Promise<void>; toast(text: string, o?: { ms?: number }): void; damageNumber(value: number, world: AuraVec3, o?: { color?: string; crit?: boolean }): void; setVisible(v: boolean): void; snapshot(): { readonly widgets: readonly { readonly id: string; readonly value: unknown; readonly screenFraction: number }[] }; dispose(): void; }
export interface HudMountOptions { readonly theme?: "arcade-neon" | "motorsport" | "sports-broadcast" | "sci-fi-telemetry" | "fighting" | "tabletop" | "plain" | Readonly<Record<`--a3g-${string}`, string>>; readonly widgets: readonly HudWidgetSpec[]; readonly maxScreenFraction?: number; }
export type TouchPreset = "twin-stick" | "dpad-2btn" | "dpad-4btn" | "steer-pedals" | "aim-drag" | "flight" | "lane-swipe" | "flippers";
export interface TouchControls { readonly visible: boolean; setVisible(v: boolean): void; dispose(): void; }
export type GameFxKind = "spark" | "dust" | "debris" | "ring" | "streak" | "pickup" | "explosion-small" | "muzzle" | "splash" | "bubble";
export interface GameFxLayer { burst(kind: GameFxKind, position: AuraVec3, o?: { count?: number; speed?: number; color?: string; normal?: AuraVec3; seed?: number }): void; trail(target: string, o: { width: number; life: number; color?: string }): { stop(): void }; readonly liveCount: number; readonly backend: "primitive-pool" | "particle-pass"; }
export interface CaptureContext { readonly mode: "play" | "scenario"; readonly scenario?: string; readonly seed?: number; readonly freezeAt?: number; readonly cameraPose?: string; }
export function captureFromUrl(url?: URL): CaptureContext;     // ignores ?capture=review|overview with a console warning
export interface GameScenario { readonly description: string; setup(game: unknown /* Game */): void | Promise<void>; }
export interface GameBeacon { readonly route: string; readonly state: GameSessionState; readonly frame: number; readonly firstFrameAt: number | null; readonly sessionStartedAt: number; }
// window.__AURA3D_GAME__: GameBeacon; readiness: window.__AURA3D_GAME__?.state === "playing"
// window.__AURA3D_GAME_EVIDENCE__[route]: lazy getter object with sections session/sound/juice/hud/perf/capture (+ route sections)
export interface CreateGameOptions<TCue extends string, TEvent extends string> { readonly id: string; readonly target: HTMLElement; readonly scene: () => unknown; readonly layout?: GameShellLayout; readonly hud?: HudMountOptions; readonly touch?: { readonly preset: TouchPreset; readonly bindings: Readonly<Record<string, string>> }; readonly sound?: unknown /* C-25 GameSoundOptions<TCue> */; readonly juice?: Readonly<Record<TEvent, unknown>>; readonly qualityRebuild?: { readonly flags?: readonly string[] }; }
export interface Game<TCue extends string = string, TEvent extends string = string> { readonly id: string; readonly app: AuraApp; readonly session: GameSession; readonly shell: GameShell; readonly hud: Hud; readonly touch: TouchControls | null; readonly fx: GameFxLayer; readonly capture: CaptureContext; ready(): Promise<void>; start(): void; setScene(scene: AuraSceneSnapshot, o?: { transition?: TransitionSpec | false }): Promise<void>; dispose(): Promise<void>; }
export function createGame<TCue extends string, TEvent extends string>(options: CreateGameOptions<TCue, TEvent>): Game<TCue, TEvent>;
```

Semantics and invariants:
- Route source contains no capture branches. The evidence beacon reads live state, and a scenario only sets up game
  state, never camera hacks. The ESLint rule prefix is `aura3d/no-route-capture-flags:`.
- `GameSession.hitStop`, `slowMo` and `setTimeScale` delegate to C-23 `app.time`.
- The HUD stays within `maxScreenFraction`, default 0.18.

Stub (PR 0a, in `packages/engine/src/contracts/stubs/game.ts`):
- `createGame` wraps `createGameApp` (`index.ts:11818`) and existing DOM.
- `GameShell` provides title, pause and results as minimal DOM, plus a fade transition.
- `Hud` is a DOM grid with `set/banner/toast`. `damageNumber` is a DOM label projected with
  `app.camera.presented()`.
- `touch` delegates to the existing `game.touchControls` (`index.ts:8250`, map).
- `fx.backend` is `"primitive-pool"`, delegating to C-20.
- `captureFromUrl` is real (pure).
- The beacon is published.

Real (PRD 09): `packages/game/`.

Conformance: `tests/unit/contracts/C-24-game.test.ts` (state machine transitions; captureFromUrl parsing; time
delegation) and `tests/browser/contracts/C-24-beacon.spec.ts`. Flag: `A3D_QR_GAME`.

---

### C-25 Game audio
Provider: PRD 09. Consumers: 08 (feel `audio`, listener from camera), 13 (templates), 14 (routes).
File: `packages/audio/src/contracts/gameSound.ts`. These are pure types, and engine binds the slot.

```ts
export type GameBusId = "master" | "music" | "sfx" | "ui" | "ambience" | "voice";
export interface AudioAssetRef { readonly url: string; readonly hash: string; readonly license: string; readonly provenance: "sample" | "synth"; }
export interface SoundCueSpec { readonly asset?: AudioAssetRef | readonly AudioAssetRef[]; readonly play?: (ctx: AudioContext, dest: AudioNode) => void; readonly bus: GameBusId; readonly volumeDb?: number; readonly pitchJitterSemitones?: number; readonly gainJitterDb?: number; readonly maxVoices?: number; readonly cooldownMs?: number; readonly loop?: boolean; readonly spatial?: boolean; readonly priority?: number; }
export interface VoiceHandle { stop(fadeMs?: number): void; setPosition(p: readonly [number, number, number]): void; }
export interface LoopHandle extends VoiceHandle { setRate(rate: number, rampMs?: number): void; setGain(gainDb: number, rampMs?: number): void; }
export interface EngineLoopHandle { setRpm(rpm: number): void; setLoad(load01: number): void; setPosition(p: readonly [number, number, number]): void; stop(fadeMs?: number): void; }
export interface MusicController { play(track: string, o?: { crossfadeMs?: number }): void; setIntensity(level01: number): void; stinger(cue: string, o?: { quantize?: "beat" | "bar" | "none" }): void; stop(fadeMs?: number): void; }
export interface GameSoundProof { readonly contextState: AudioContextState | "none"; readonly voicesPlayed: number; readonly assetCues: number; readonly synthCues: number; readonly limiterEngaged: boolean; }
export interface GameSoundOptions<TCue extends string> { readonly cues: Readonly<Record<TCue, SoundCueSpec>>; readonly reverb?: "none" | "small-room" | "hall" | "street" | "hangar" | "underwater"; readonly voiceLimit?: number; }
export interface GameSound<TCue extends string> {
  play(cue: TCue, o?: { position?: readonly [number, number, number]; velocity?: readonly [number, number, number]; volumeDb?: number; rate?: number }): VoiceHandle | null;
  loop(cue: TCue, o?: { position?: readonly [number, number, number]; bus?: GameBusId }): LoopHandle | null;
  engine(spec: { readonly cue: TCue; readonly rpmRange: readonly [number, number]; readonly pitchRange: readonly [number, number] }): EngineLoopHandle;
  readonly music: MusicController;
  setListener(pose: { position: readonly [number, number, number]; forward: readonly [number, number, number]; up: readonly [number, number, number] }): void;
  setBusVolume(bus: GameBusId, v: number): void; setMuted(muted: boolean): void; duck(bus: GameBusId, ratio01: number, ms: number): void;
  suspend(): Promise<void>; resume(): Promise<void>; unlock(): Promise<void>; proof(): GameSoundProof; dispose(): void;
}
export function createGameSoundEngine<TCue extends string>(options: GameSoundOptions<TCue>): GameSound<TCue>;
// AudioSource.setPlaybackRate(rate: number, rampMs?: number): void  (packages/audio/src/AudioSource.ts, PRD 09)
```

Semantics:
- A cue with neither `asset` nor `play` throws:
  `Game audio cue "<id>" has no asset or play(); synthesized default cues were removed (PRD 09).`
  This applies when `A3D_QR_GAME` is on. When it is off, a warning is logged.
- Spatial cues use a real `PannerNode` (HRTF on high and ultra).
- The master chain has a limiter.

Stub:
- The engine wraps the existing `packages/engine/src/game/GameAudio.ts`. `engine()` maps to a loop with `setRate`
  emulated by restarting the voice, and `proof().synthCues` counts synthesized cues.

Real (PRD 09): `packages/audio/src/game-sound/`, and `assets/packs/game-sfx-core/` (≥269 licensed,
loudness-normalized files, per PRD 09).

Conformance: `tests/unit/contracts/C-25-sound.test.ts` (cue validation; bus math in an OfflineAudioContext shim).
Flag: `A3D_QR_GAME`.

---

### C-26 World queries: ground raycast, height, wind, biome
Provider: PRD 10. Consumers: 06 (`FootIkConstraintSpec.ground: GroundRaycaster`), 07 (`heightAt` for splashes and rain occlusion), 13 (looks → biomes), 14 (worlds).
File: `packages/engine/src/contracts/world.ts`.

```ts
export interface GroundRaycaster { raycastDown(x: number, z: number, fromY?: number, maxDistance?: number): { readonly point: AuraVec3; readonly normal: AuraVec3; readonly distance: number; readonly nodeId?: string } | null; }
export interface AuraHeightQuery { heightAt(x: number, z: number): number; normalAt(x: number, z: number): AuraVec3; occluderHeightAt?(x: number, z: number): number; }
export interface AuraWindSpec { readonly direction?: AuraVec3; readonly strength?: number; readonly gust?: number; readonly gustFrequency?: number; readonly turbulence?: number; }
/** UBO "A3DWind" { vec4 u_windDirStrength; vec4 u_windGust; } + chunk "a3d_prd10_wind": vec3 a3dWindOffset(vec3 localPos, vec3 instanceOrigin, vec4 weights, float assetHeight). */
export const WIND_CHUNK: "a3d_prd10_wind";
export type AuraBiomeId = "outdoor-day" | "golden-hour" | "overcast" | "night-city" | "polar-night" | "alpine-snow" | "interior-warm" | "interior-neutral" | "interior-industrial" | "space" | "underwater";
export type AuraWorldQualityTier = AuraQualityTier;
export interface AuraBiomeRig { readonly id: AuraBiomeId; readonly sky: import("./atmosphere").AuraSkySpec | null; readonly fog: import("./atmosphere").AuraHeightFogSpec | null; readonly post: import("./post").AuraPostPresetId; readonly environment: "sky-capture" | "hdri" | "room" | "space-bake"; readonly sun?: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly intensity: number; readonly colorTemperatureK: number }; }
export interface AuraWorldQueries { ground(): GroundRaycaster; height(): AuraHeightQuery; wind(): Required<AuraWindSpec>; biome(): AuraBiomeRig | null; describeBiome(id: AuraBiomeId, tier?: AuraWorldQualityTier): AuraBiomeRig; listBiomes(): readonly AuraBiomeId[]; }
export const worldQueriesSlot: ContractSlot<(app: AuraApp) => AuraWorldQueries>;
// AuraApp.world: AuraWorldRuntime (PRD 10 full runtime: timeOfDay/wind/terrain/water/diagnostics) extends AuraWorldQueries (via C-38)
```

Semantics:
- `raycastDown` hits terrain, physics colliders and static meshes, in that order of preference.
- `heightAt` is bilinear and matches the terrain rendering heightfield (`TerrainHeightTexture` bilinear contract).
- `describeBiome` is pure and deterministic.

Stub:
- `ground()` raycasts the physics world if a physics world exists. That path is `packages/physics/src/Raycast.ts`,
  owned by PRD 08 with its API unchanged. With no physics world it falls back to the plane `y = 0`.
- `height()` returns 0 and the up normal (C-07-IN-11 stub).
- `wind()` returns zero strength.
- `biome()` returns null.
- `describeBiome` returns a rig built from today's `environments.*` presets, with `post: "daylight-outdoor"` for
  outdoor ids.

Real (PRD 10): `agent-api/world/`, `production-runtime/world/BiomeResolver.ts` (registered as a C-09 environment
source, priority 300), terrain, scatter, water.

Conformance: `tests/unit/contracts/C-26-world.test.ts` (biome list and determinism; stub plane hit). Flag: `A3D_QR_WORLD`.

---

### C-27 QualityTier settings
Provider: PRD 11. Consumers: 01 (pixel ratio, render scale, MSAA, tessellation, light buckets), 02 (shadows, environment size), 03 (AO, SSR, bloom, AA), 04 (texture size and budget, anisotropy), 05 (asset budgets), 07 (particles, soft particles, volumetric), 10 (LOD bias), 12 (`?aura3d-quality=` capture), 13 (`tierCap`), 14 (route budgets).
File: `packages/rendering/src/contracts/quality.ts`, with engine re-export.

```ts
export type AuraQualityTier = "low" | "medium" | "high" | "ultra";
export type AuraFeatureLevel = "off" | "low" | "medium" | "high";
export interface AuraQualityTierSettings {
  readonly maxPixelRatio: number; readonly minRenderScale: number; readonly targetFrameMs: number;
  readonly msaaSamples: 0 | 4; readonly postAntiAlias: "fxaa" | "none" | "taa";
  readonly shadow: { readonly mapSize: 1024 | 2048 | 4096; readonly cascades: 1 | 2 | 3 | 4; readonly filter: "pcf2" | "pcf3" | "pcf5"; readonly localShadowLights: number; readonly contact: boolean };
  readonly maxLightsPerPixel: 4 | 8 | 16 | 32;
  readonly ambientOcclusion: AuraFeatureLevel; readonly ssr: AuraFeatureLevel; readonly bloomMipLevels: 3 | 5 | 6;
  readonly volumetricFog: "analytic" | "froxel-medium" | "froxel-high";
  readonly froxelGrid: readonly [number, number, number] | null;
  readonly particleBudget: number; readonly softParticles: boolean; readonly lodBias: number;
  readonly primitiveSegments: "half" | "full"; readonly maxTextureSize: 1024 | 2048 | 4096; readonly textureBudgetBytes: number;
  readonly anisotropy: 2 | 4 | 8 | 16; readonly environmentSize: 128 | 256 | 512 | 1024; readonly drawBudget: number;
}
export const QUALITY_TIERS: Readonly<Record<AuraQualityTier, AuraQualityTierSettings>>;
export function resolveTierSettings(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): AuraQualityTierSettings; // validates; invalid => QUALITY_OVERRIDE_INVALID
export function nextLowerTier(tier: AuraQualityTier): AuraQualityTier | null;
export interface AuraTierDecision { readonly tier: AuraQualityTier; readonly source: "explicit" | "url" | "cache" | "classified" | "calibrated" | "default"; readonly reason: string; }
export interface AuraQualityController { readonly tier: AuraQualityTier; readonly settings: AuraQualityTierSettings; readonly decision: AuraTierDecision; set(tier: AuraQualityTier, overrides?: Partial<AuraQualityTierSettings>): Promise<void>; lock(): void; unlock(): void; forceRenderScale(scale: number | "floor" | null): void; onChange(l: (e: { readonly from: AuraQualityTier; readonly to: AuraQualityTier; readonly reason: string }) => void): () => void; }
// AuraApp.quality: AuraQualityController (via C-38); AuraCreateAppRendererOptions.quality?: AuraQualityTier | "auto" | { tier: AuraQualityTier | "auto"; overrides?: Partial<AuraQualityTierSettings> }
// URL: ?aura3d-quality=low|medium|high|ultra, ?aura3d-adaptive=0
```

Frozen `QUALITY_TIERS`. These are PRD 11 §6.3 table values (PRD 11 :257-280) with the R9, R10 and R11 corrections:

| Field | low | medium | high | ultra |
|---|---|---|---|---|
| maxPixelRatio | 1 | 1.5 | 2 | 3 (backing ≤ 8.3 MP) |
| minRenderScale | 0.5 | 0.6 | 0.7 | 0.75 |
| targetFrameMs | 33.3 mobile / 16.7 desktop | 16.7 | 16.7 | 16.7 |
| msaaSamples / postAntiAlias | 0 / fxaa | 4 / none | 4 / none | 4 / taa (MSAA fallback w/o motion vectors) |
| shadow.mapSize / cascades / filter / localShadowLights / contact | 1024 / 1 / pcf2 / 0 / false | 2048 / 2 / pcf3 / 1 / false | 2048 / 3 / pcf5 / 2 / false | 4096 / 4 / pcf5 / 4 / true |
| maxLightsPerPixel | 4 | 8 | 16 | 32 |
| ambientOcclusion / ssr | off / off | low / off | medium / medium | high / high |
| bloomMipLevels | 3 | 5 | 6 | 6 |
| volumetricFog / froxelGrid | analytic / null | analytic / null | froxel-medium / [160,90,64] | froxel-high / [240,135,128] (R10) |
| particleBudget / softParticles | 2,000 / false | 10,000 / true | 50,000 / true | 100,000 (200,000 with WebGPU compute) / true |
| lodBias | 2.0 | 1.5 | 1.0 | 0.75 |
| primitiveSegments | half | full | full | full |
| maxTextureSize / textureBudgetBytes | 1024 / 128 MiB | 2048 / 256 MiB | 4096 / 512 MiB | 4096 / 1 GiB |
| anisotropy (R9) | 4 | 8 | 16 | 16 |
| environmentSize | 128 | 256 | 512 | 1024 |
| drawBudget (warning) | 150 | 300 | 600 | 1,500 |

Semantics:
- `"auto"` is the default in option types. An explicit `pixelRatio` wins over `maxPixelRatio`.
- Tier changes that alter generated code are feature bits (C-02).
- The table is the contract. Owners of each feature implement it. Value changes are additive CCRs approved by PRD 11
  and the consuming owner.

Stub (PR 0a):
- `QUALITY_TIERS` ships real. It is data.
- `"auto"` resolves to `"high"` on desktop and `"medium"` when `matchMedia("(pointer: coarse)")`, with
  `decision.source: "default"`.
- `app.quality.set` updates settings and emits `onChange`. Consumers re-read the settings at their next resolve.
- `forceRenderScale` is applied through the existing canvas sizing (`createAuraApp` canvas sizing,
  `index.ts:11126-11140`, map).

Real (PRD 11): `quality/{DeviceProbe,DeviceClasses,TierResolver,QualityGovernor}.ts`, plus calibration and caching.

Conformance: `tests/unit/contracts/C-27-quality.test.ts` (every field present for every tier; override validation;
nextLowerTier chain). Flag: `A3D_QR_TIERS`.

---

### C-28 Device capabilities: probe, counters, compileAsync, FrameStats, resource registry
Provider: PRD 11. Consumers: 01 (ProgramWarmup reads `parallelShaderCompile`), 02 (no-stall checks: `programCompileCount`, `readPixelsCalls`), 03 (render-target pool), 06 (`compileAsync` warm-up; palette budgets), 07 (`particles` timing scope), 12 (diagnostics().frame).
File: `packages/rendering/src/contracts/device.ts`. `RenderDevice` (`RenderDevice.ts:428`) gains optional members in PR 0a. Seams: `webgl2/{Probe,Counters,ContextLifecycle}.ts` (PR 0b, §3.4).

```ts
export interface DeviceProbe { readonly backend: "webgl2" | "webgpu"; readonly rendererString: string; readonly unmaskedRenderer: string | null; readonly unmaskedVendor: string | null; readonly maxTextureSize: number; readonly maxSamples: number; readonly floatColorBuffer: boolean; readonly halfFloatColorBuffer: boolean; readonly timerQuery: boolean; readonly parallelShaderCompile: boolean; readonly multiDraw: boolean; readonly devicePixelRatio: number; readonly screen: readonly [number, number]; readonly hardwareConcurrency: number | null; readonly deviceMemoryGB: number | null; readonly mobile: boolean | null; }
export interface DeviceCounters { readonly drawCalls: number; readonly bufferCreates: number; readonly textureUploads: number; readonly readbacks: number; readonly renderTargetsCreated: number; readonly programCompiles: number; readonly liveBuffers: number; readonly liveVertexArrays: number; readonly textureBytes: number; readonly renderTargetBytes: number; }
// RenderDevice optional additions (PR 0a):
//   readonly probe?: DeviceProbe;
//   counters?(): DeviceCounters;            // per-frame fields reset by resetFrameCounters()
//   resetFrameCounters?(): void;
//   compileAsync?(shader: import("../ShaderModule").ShaderModule): Promise<void>;     // KHR_parallel_shader_compile / createRenderPipelineAsync
//   multiDrawElementsInstanced?(mode: "triangles", counts: Int32Array, offsetsBytes: Int32Array, instanceCounts: Int32Array, drawCount: number): void;
// RenderDeviceDiagnostics additions: programCompileCount?: number; readPixelsCalls?: number   (monotonic; = counters().programCompiles / readbacks totals)
export interface FrameStatsSample { readonly intervalMs: number; readonly cpuFrameMs: number; readonly cpuSubmitMs: number; readonly gpuMs: number | null; readonly scopes: Readonly<Record<string, number>>; }
export interface FrameStatsLike { begin(ts: number): void; end(): FrameStatsSample; scope<T>(name: "shadow" | "forward" | "post" | "particles" | string, fn: () => T): T; percentiles(field: "intervalMs" | "cpuFrameMs" | "cpuSubmitMs" | "gpuMs"): { readonly p50: number; readonly p95: number; readonly p99: number; readonly max: number }; fps(): number | null; }
export const frameStatsSlot: import("./core").ContractSlot<(capacity?: number) => FrameStatsLike>;
export interface RenderTargetPoolLike { acquire(desc: { width: number; height: number; format: import("../Texture").TextureFormat; samples: 1 | 4; depth: boolean }): import("../RenderTarget").RenderTarget; release(t: import("../RenderTarget").RenderTarget): void; trim(maxIdleFrames: number): void; }
export const renderTargetPoolSlot: import("./core").ContractSlot<(device: import("../RenderDevice").RenderDevice) => RenderTargetPoolLike>;
```

Semantics:
- Counters are measured, never estimated.
- `fps()` is `null` until 30 samples exist. `diagnostics().fps` is measured, not a constant 60.

Stub:
- `probe` is filled from `WEBGL_debug_renderer_info` when available, else nulls.
- `counters` is partial: `drawCalls`, `bufferCreates` and `textureBytes` come from existing diagnostics. `readbacks`
  and `programCompiles` are counted by wrapping `readPixels` and `linkProgram` (`WebGL2Device.ts` linkProgram sites
  552, 2770, 2812, 3429, 3641 and readPixels sites 1132-1186, 1623, map) in `webgl2/Counters.ts`.
- `compileAsync` resolves after a synchronous compile.
- FrameStats is real, since it is pure, and uses rAF intervals. `gpuMs` is null.
- `renderTargetPoolSlot.stub` creates targets on every acquire and disposes them on release.

Real (PRD 11): timer queries, pooling, ResourceRegistry rebuild on context restore.

Conformance: `tests/unit/contracts/C-28-device.test.ts` (FrameStats percentiles; counter reset semantics on
MockRenderDevice) and `tests/browser/contracts/C-28-counters.spec.ts` (a static scene renders with 0 readbacks and
0 bufferCreates after warm-up). Flag: `A3D_QR_TIERS`.

---

### C-29 Renderer factory, backends, frame API, device lifecycle
Provider: PRD 11. Consumers: 01 (renderer core runs inside), 07 (device-lost re-upload of particle resources), 12 (backend in diagnostics), 15 (single-renderer arch gate, `@aura3d/engine/renderer` subpath).
File: `packages/rendering/src/contracts/rendererFactory.ts`. Seam: `renderer/RendererFactory.ts` and `renderer/DeviceLifecycle.ts` (carve-out of `Renderer.create` `Renderer.ts:472` and `ProductionRuntimeRenderer.ts:57-90` selection, map).

```ts
export interface RendererCreateOptions { readonly canvas: HTMLCanvasElement | OffscreenCanvas; readonly width?: number; readonly height?: number; readonly backend?: "webgl2" | "webgpu" | "auto"; readonly antialias?: boolean; readonly powerPreference?: "default" | "high-performance" | "low-power"; readonly errorCheckMode?: "off" | "frame" | "draw"; }
export interface RendererFrameResult { readonly backend: "webgl2" | "webgpu"; readonly diagnostics: import("../RenderDevice").RenderDeviceDiagnostics; readonly timing: { readonly cpuMs: number; readonly gpuMs: number | null }; }
export interface RendererLifecycle { onDeviceLost(l: () => void): () => void; onDeviceRestored(l: () => void): () => void; isDeviceLost(): boolean; }
// Renderer additions (PR 0b delegating stubs): static create(options: RendererCreateOptions): Promise<Renderer>; readonly backend: "webgl2" | "webgpu";
//   renderFrame(frame: RendererInput): RendererFrameResult; renderFrameAsync(frame: RendererInput): Promise<RendererFrameResult>; + RendererLifecycle
export interface ResourceRegistryLike { register<T extends object>(handle: T, descriptor: { readonly kind: string; readonly rebuild: () => Promise<void> | void }): T; unregister(handle: object): void; rebuild(device: import("../RenderDevice").RenderDevice): Promise<{ readonly rebuilt: number; readonly refetched: number; readonly failed: readonly string[] }>; }
export const resourceRegistrySlot: import("./core").ContractSlot<() => ResourceRegistryLike>;
```

Semantics:
- `backend: "auto"` selects WebGPU only on ultra and only when `A3D_QR_WEBGPU` is on. WebGPU never sync-reads back
  (`WEBGPU_SYNC_READBACK_UNSUPPORTED`).
- Device-restored listeners run after `ResourceRegistry.rebuild` resolves.

Stub:
- `create` keeps today's `Renderer.create` (`Renderer.ts:472`) and backend selection.
- `renderFrame` wraps `render()` (:541) and returns the timing from FrameStats.
- `onDeviceLost`/`onDeviceRestored` attach to the existing context listeners (`WebGL2Device.ts:417-445`, map).
- `resourceRegistrySlot.stub` records registrations, and `rebuild` calls each `rebuild` in order.

Real (PRD 11): the WebGPU render device, pipeline cache and WGSL generator target.

Conformance: `tests/unit/contracts/C-29-renderer-factory.test.ts` and
`tests/browser/contracts/C-29-context-loss.spec.ts` (`WEBGL_lose_context` round-trip restores pixels). Flag:
`A3D_QR_WEBGPU` (backend selection); lifecycle is unflagged.

### C-30 Benchmark scene registry, ReadyPayload, report schema
Provider: PRD 12. Consumers: 01-11 (each lane adds its own scenes), 14 (game-scene stress).
File: `benchmarks/quality-rebuild/shared/contracts.ts`, re-exported by `shared/types.ts` (owner PRD 12). Seam: `benchmarks/quality-rebuild/shared/registry.ts` aggregates `benchmarks/quality-rebuild/scenes/prdNN/index.ts` (PR 0a creates one empty index per lane).

```ts
export type ReferenceProfile = "contract" | "showcase";
export type SceneOwner = "prd12" | "prd01" | "prd02" | "prd03" | "prd04" | "prd05" | "prd06" | "prd07" | "prd08" | "prd10" | "prd11";
export type BrokenControlId = "no-shadows" | "no-ibl" | "dpr-half" | "no-aa" | "no-tonemap" | "flat-sky" | "albedo-only";
export type MaskId = "object-id" | "shadow-receiver" | "sky" | "metal" | "silhouette-edge";
export type RegionId = "frame" | "subject" | `object:${number}` | MaskId | "scene-minus-hud";
export interface StripSpec { readonly frames: number; readonly intervalMs: number; readonly orbitDegrees: number; }
// SceneSpec (existing, benchmarks/quality-rebuild/shared/types.ts) gains (PR 0a, optional until PRD 12 makes them required):
//   owner: SceneOwner; referenceProfile: ReferenceProfile; dprs?: readonly (1 | 2)[]; masks: readonly MaskId[]; brokenControls: readonly BrokenControlId[];
//   strip?: StripSpec; primaryCriterion: string; primaryRegion: RegionId; qrFlags?: readonly string[]
export interface RegistryEntry { readonly id: string; readonly spec: unknown /* SceneSpec */; readonly admittedAsReference: boolean; readonly status: "active" | "quarantined" | "retired"; }
export const REGISTRY: readonly RegistryEntry[];
export interface ShadowReport { readonly mapRendered: boolean; readonly mapSampled: boolean; readonly mapSize: number | null; readonly strength: number | null; readonly casterName: string | null; }
export interface FrameTimingSample { readonly source: "rAF" | "gpu-timer-query"; readonly frames: number; readonly cpuMsP50: number; readonly cpuMsP95: number; readonly gpuMsP50: number | null; readonly gpuMsP95: number | null; readonly rafFps: number; }
export interface ReadyPayloadV2 { readonly variant: "default" | "aura3d-tuned" | BrokenControlId; readonly dpr: 1 | 2; readonly appliedExposure: number | null; readonly appliedToneMapping: string | null; readonly lightUnits: "three-physical" | "aura-internal" | "unknown"; readonly shadows: ShadowReport | null; readonly fallbackLightsActive: boolean | null; readonly frameTiming?: FrameTimingSample; readonly assetHashes: Readonly<Record<string, string>>; readonly qrFlags: readonly string[]; }
```

Semantics:
- New scene ids use the form `<owner>-<slug>`, for example `prd07-fog-height` or `prd04-clearcoat-carpaint`.
- Every scene has both engine adapters, Aura and three r185. A scene without a three reference is
  `admittedAsReference: false` and is never used for a parity claim.
- `ReadyPayloadV2.qrFlags` records the flags each capture ran with, so checkpoint scores are attributable.

Stub:
- `REGISTRY` wraps today's 18 scenes from `scenes.ts` with `owner: "prd12"` and `status: "active"`, and appends each
  lane index.
- Unknown new fields are optional.

Real (PRD 12): the registry, masks, broken controls and showcase three references.

Conformance: `tests/unit/contracts/C-30-bench-registry.test.ts` (unique ids; owner prefix; every active entry has
both adapters). Flag: none (tooling). Scenes declare `qrFlags`.

---

### C-31 Diagnostics and evidence schema, sections registry
Provider: PRD 12 defines the schema. Each section is implemented by its owner. Consumers: all lanes, 12 (capture), 13 (lint), 14 (scorecards).
File: `packages/engine/src/contracts/diagnostics.ts`. Seam: `app/diagnostics.ts` (carve-out of the `AuraDiagnostics` assembly; `AuraDiagnostics` at `index.ts:10377`, PR 0b).

```ts
export interface AppliedLookReport { readonly exposure: number; readonly toneMapping: "aces-filmic" | "agx" | "neutral" | "reinhard" | "none"; readonly environment: { readonly specularIntensity: number; readonly diffuseIntensity: number; readonly background: "color" | "hdri" | "sky" }; readonly shadows: ShadowReport | null; readonly fallbackLightsActive: boolean; readonly renderPath: "production" | "safe-basic" | "lean" | "compat-preset"; readonly pixelRatio: number; }
export interface DiagnosticsSection<T = unknown> extends RegistryEntry { readonly id: string; readonly key: AuraDiagnosticsSectionKey; collect(app: AuraApp): T; }
export type AuraDiagnosticsSectionKey =
  | "output" | "resolution" | "programs" | "frameAllocations"            // PRD 01
  | "lighting" | "shadows"                                               // PRD 02
  | "post" | "exposure"                                                  // PRD 03
  | "materials"                                                          // PRD 04
  | "assets"                                                             // PRD 05
  | "animation"                                                          // PRD 06
  | "effects" | "atmosphere"                                             // PRD 07
  | "camera" | "loop"                                                    // PRD 08
  | "game"                                                               // PRD 09
  | "world"                                                              // PRD 10
  | "frame" | "renderer.batching" | "quality"                            // PRD 11
  | "appliedLook" | "frameTiming"                                        // PRD 12 (assembled from others)
  | "look"                                                               // PRD 13
  | "degradations" | "compiledFeatures" | "qrFlags";                     // PRD 15
export function registerDiagnosticsSection<T>(section: DiagnosticsSection<T>): () => void;
// AuraDiagnostics (index.ts:10377) gains optional members for every key above (PR 0a), typed by the owning contract's *Diagnostics interface.
```

Semantics and invariants:
- A section reports observed values: what was submitted, bound or drawn. It never reports configured intent as
  observed.
- A field that cannot be measured is `null`, not a constant. This is the PRD 12 no-fabricated-evidence rule.
- `diagnostics()` performs no GPU readback.

Stub:
- Each key is present with `null` or empty values. `qrFlags` and `degradations` are real.
- `appliedLook` is assembled from existing fields: tone mapping literal (`index.ts:1801`, map), shadow evidence,
  and `fallbackLightsActive` from `createProductionRuntimeFallbackLights` (`index.ts:13363-13413`) being used.

Conformance: `tests/unit/contracts/C-31-diagnostics.test.ts` (key ownership is unique; stub produces a
schema-valid object; no section throws on a disposed app). Flag: none.

---

### C-32 VisualReview rubric and judgement schema
Provider: PRD 12. Consumers: 13 (agent-eval, `LookJudgement`), 14 (game scorecards).
File: `tools/quality-gate/src/contracts.ts`, re-exported from `tools/quality-gate/src/types.ts` (owner PRD 12).

```ts
export const GAME_VISUAL_CATEGORIES: readonly string[];      // 27 values, frozen to research 21's category list (last is "overall_visual_quality")
export const GAME_NONVISUAL_CATEGORIES: readonly ["sound_audio", "controls", "physics_feel", "game_feel", "loading_transitions", "performance"];
export type GameVisualCategory = (typeof GAME_VISUAL_CATEGORIES)[number];
export interface JudgeIdentity { readonly kind: "human" | "vision-model"; readonly id: string; readonly model?: string; }
export interface BenchmarkJudgement { readonly sceneId: string; readonly round: string; readonly judge: JudgeIdentity; readonly aura: number; readonly three: number; readonly categories: Readonly<Record<string, number>>; readonly observations: readonly string[]; readonly rubricPromptVersion: string; }
export interface GameJudgement { readonly gameId: string; readonly round: string; readonly judge: JudgeIdentity; readonly scores: Readonly<Record<GameVisualCategory, number>>; readonly observations: readonly { readonly category: GameVisualCategory; readonly seen: string }[]; readonly captureRunId: string; readonly rubricPromptVersion: string; }
export interface PanelRoundRecord { readonly round: string; readonly date: string; readonly commit: string; readonly captureRunId: string; readonly qrFlags: readonly string[]; readonly judges: readonly JudgeIdentity[]; readonly benchmark: readonly BenchmarkJudgement[]; readonly games: readonly GameJudgement[]; }
export type GateVerdict = "pass" | "regression" | "reference-gap" | "admitted-loss" | "calibration-broken" | "non-discriminating" | "mask-misaligned" | "forbidden-capture-flag" | "blocked-runner" | "capture-failed";
export const RUBRIC_PROMPT_VERSION: string;
```

Semantics:
- Scores are 0-10 with 0.5 resolution.
- G-PANEL is 2 humans and 1 vision model. The median is the score of record.
- Vision-only rounds are "screening". They are recorded but cannot accept a lane or a game.
- Score history is append-only in `benchmarks/quality-rebuild/history/index.jsonl`.

Stub (PR 0a): the types plus `GAME_VISUAL_CATEGORIES` copied verbatim from research 21's scorecard rows. PRD 14's
`@aura3d/game/art` `GameVisualCategory` must equal it, which a unit test checks.

Conformance: `tests/unit/contracts/C-32-rubric.test.ts` (27 visual and 6 non-visual categories; score range).

---

### C-33 Capture harness interface
Provider: PRD 12. Consumers: 06 (`burst` step), 08 (12-frame strips, 5 s WebM), 09 (beacon readiness), 13 (template and look capture), 14 (games).
File: `tools/quality-rebuild-capture/contracts.mjs` (JSDoc-typed) and `tools/quality-rebuild-capture/games.schema.json` (PR 0a, owner PRD 12). Seam: `capture-games.mjs` loads step plugins from `tools/quality-rebuild-capture/steps/*.mjs` (PR 0b).

```ts
// pnpm quality:capture --scenes <ids|all> [--flags <qr-list>|all] [--out <dir>]          (benchmarks)
// pnpm quality:games  --routes <ids|all> [--flags <qr-list>|all] [--strict] [--pr-build]  (games)
// Both dispatch .github/workflows/quality-rebuild-capture.yml (workflow_call + workflow_dispatch, input `qr_flags`, input `strict`).
export interface CaptureStepPlugin { readonly name: string; readonly owner: string; run(page: unknown /* Playwright Page */, step: Readonly<Record<string, unknown>>, ctx: { readonly outDir: string; readonly route: string; readonly log: (m: string) => void }): Promise<{ readonly files: readonly string[]; readonly data?: unknown }>; }
// steps/burst.mjs (PRD 06): { burst: { frames: number; intervalMs: number; region: "character" | "full" } }
// steps/strip.mjs (PRD 12): { strip: { frames: 12; intervalMs: number } }; steps/webm.mjs (PRD 12): { webm: { seconds: 5 } }
// games.json entry (schema, all optional in PR 0a): scenarios[] {id, query: {scenario, seed, freezeAt, cameraPose}}, hudSelectors[], keyboardHintSelectors[], captureContractMigrated, qrFlags[], plus C-35 GameEntryV2 fields
```

Semantics:
- Captures run remotely only, on macOS with Chromium and ANGLE Metal, routed per `CI-ROUTING.md`. Judged frames (lane evidence, checkpoints, G-PANEL) run on GitLab `saas-macos-medium-m1` with `chromium-headless-shell`. PR sentinel checks run on GitHub `macos-14`. Reports record `ciProvider` and `browserChannel`, and frames from different providers are never compared. Local browser runs are not evidence.
- Readiness is `window.__AURA3D_GAME__?.state === "playing"` (C-24) when present, else the existing readiness probe.
- `?capture=review|overview` URL keys are forbidden in migrated routes (`forbidden-capture-flag`).

Stub: today's `capture-games.mjs` and `capture.mjs`, extended in PR 0b only with plugin loading and a `--flags`
passthrough. The passthrough appends `a3d-qr=<list>` to the URL.

Conformance: `tests/unit/contracts/C-33-capture.test.ts` (games.json validates against the schema; plugin names are
unique). Flag: none.

---

### C-34 Looks and the lookLint rule registry
Provider: PRD 13. Consumers: 02 (registers `look/ambient-flattens`), 07 (`look/fake-effect-names`), 08 (`look/evidence-only-feel`), 09 (`look/capture-branch`), 10 (biome ids), 12 (`diagnostics().look`), 14 (games use looks).
File: `packages/engine/src/contracts/looks.ts`. Seam: `looks/generatedCodeWarnings.ts` (carve-out of `index.ts:18253-18293`, R8).

```ts
export type AuraStudioLookId = "product-studio" | "character-showcase" | "arena-fight" | "neon-arcade";
export type AuraLookId = AuraBiomeId | AuraStudioLookId;
export interface AuraLookOverrides { readonly sun?: { readonly azimuthDeg?: number; readonly elevationDeg?: number }; readonly exposureEv?: number /* [-2,2] */; readonly fogDensityScale?: number /* [0,3] */; readonly accent?: AuraColor; readonly background?: "look" | AuraColor; }
export interface AuraLookNode { readonly kind: "look"; readonly look: AuraLookId; readonly overrides?: AuraLookOverrides; }
export type AuraLookLintCode = "look/no-lights" | "look/ambient-kills-ibl" | "look/ambient-flattens" | "look/no-ibl" | "look/weak-shadow" | "look/low-dpr" | "look/solid-void" | "look/primitive-subject" | "look/flat-palette" | "look/double-aa" | "look/debug-overlay" | "look/fake-effect-names" | "look/evidence-only-feel" | "look/capture-branch";
export interface AuraLookLintFinding { readonly code: AuraLookLintCode | `look/${string}`; readonly severity: "error" | "warning"; readonly message: string; readonly nodes?: readonly string[]; }
export interface AuraLookLintContext { readonly appliedLook?: AppliedLookReport; readonly devicePixelRatio: number; readonly tierCap: number; readonly production: boolean; readonly capabilities: { readonly ambientAdditive: boolean; readonly effectsPixelBacked: readonly string[] }; }
export function lookLint(s: AuraSceneSnapshot, c: AuraLookLintContext): readonly AuraLookLintFinding[];
export function registerLookLintRule(rule: { readonly code: AuraLookLintCode | `look/${string}`; readonly owner: PrdId; run(s: AuraSceneSnapshot, c: AuraLookLintContext): readonly AuraLookLintFinding[] }): void;  // duplicate code throws
export interface AuraLookDiagnostics { readonly id: AuraLookId | "engine-default" | null; readonly expansion: "v1-contracts" | "v0-current-engine" | "none"; readonly missingContracts: readonly ("world.biome" | "environments.preset" | "output.preset" | "quality.auto" | "lights.hemisphere")[]; readonly lint: readonly AuraLookLintFinding[]; }
// looks.preset/list/describe/resolveDefault; AuraSceneBuilder.look(id, overrides?)  (signatures as PRD 13 P-13-looks)
```

Semantics:
- The `v1-contracts` expansion of a look uses the real contracts: C-09 `environments.preset`, C-10 hemisphere,
  C-13 `output.preset`, C-26 `world.biome` and C-27 `quality: "auto"`.
- The `v0-current-engine` expansion uses only today's builders, and is what runs while a consumed slot is still a
  stub.
- `missingContracts` lists the stubs in use.
- `look/ambient-kills-ibl` is active only while `capabilities.ambientAdditive` is false, i.e. until C-09 is real.

Stub: the registry and the `lookLint` host are real in PR 0b. Line `index.ts:18256` is replaced by a `lookLint` call
that registers `look/no-lights` with the same message text, so behaviour is unchanged.

Real (PRD 13): `agent-api/looks/`.

Conformance: `tests/unit/contracts/C-34-looks.test.ts` (duplicate rule throws; `index.ts:18256` text preserved under
flag off). Flag: `A3D_QR_LOOKS`, with `A3D_LOOK_EXPANSION=v0|v1|auto` kept as a sub-flag alias of
`A3D_QR_LOOKS_EXPANSION`.

---

### C-35 Art direction and game acceptance schema
Provider: PRD 14. Consumers: 12 (scorecards, gates), 13 (templates follow pilot patterns).
File: `packages/game/src/art/contracts.ts`. Until PRD 09 creates `packages/game`, PR 0a places it at `packages/engine/src/contracts/art.ts`. PRD 14 owns `packages/game/src/art/`.

```ts
export type GameGenre = "fighting" | "falling-blocks" | "platformer" | "racing" | "golf-physics" | "lander" | "twin-stick" | "orbital-puzzle" | "vehicle-delivery" | "rhythm-runner" | "mech-fighting" | "pinball" | "basketball" | "stealth" | "underwater-salvage" | "flight" | "billiards" | "arena-shooter";
export type RebuildTier = "S-presentation" | "S-world" | "F";
export interface GameAcceptance { readonly minOverall: 7; readonly minVisualCategory: 5; readonly critical: Readonly<Record<string, number>>; readonly minNonVisual: { readonly sound_audio: 6; readonly controls: 7; readonly game_feel: 6.5; readonly loading_transitions: 6; readonly physics_feel?: 6 }; }
export interface GameBudgets { readonly transferToPlayableMB: number; readonly routeJsGzipKB: number; readonly drawCalls: Readonly<Record<AuraQualityTier, number>>; readonly gameLogicCpuMs: number; }
export interface GameEntryV2 { readonly wave: 0 | 1 | 2 | 3 | 4; readonly rebuildTier: RebuildTier; readonly artDirection: string; readonly requiredConditions: readonly { readonly shot: string; readonly expr: string; readonly deadlineMs: number }[]; readonly canvasBlankCheck: { readonly maxDarkFraction: number /* <= 0.97 */; readonly minDistinctColors: number; readonly reason?: string }; readonly acceptance: GameAcceptance; readonly budgets: GameBudgets; }
export interface RouteHealthQualityGate { readonly status: "unreviewed" | "in-rebuild" | "rejected" | "accepted" | "withdrawn"; readonly scorecard?: string; readonly acceptedAt?: string; readonly acceptedBy?: readonly string[]; }
// GameArtDirection, defineArtDirection, auditArtDirection, ArtDirectionSnapshot, ArtDirectionViolation: as PRD 14 provides list (frozen there).
```

Semantics:
- `publicShowcase: true` requires `status: "accepted"`.
- Acceptance is evaluated only on G-PANEL rounds (C-32), never on engineering gates.

Stub: types only. `auditArtDirection` returns `[]` with a `PENDING` marker until PRD 14 implements it.

Conformance: `tests/unit/contracts/C-35-art.test.ts` (category list equals C-32; schema of `games.json` V2 fields).

---

### C-36 SceneCompiler extension points
Provider: PRD 15. Consumers: 01 (sceneGraph, color, primitives), 02 (environment, lights, shadows), 03 (postprocess), 04 (materials, textures), 05 (model LOD, decoders), 06 (actors), 07 (effects, sky, fog), 10 (world nodes), 11 (batching flags), 13 (looks, prompt).
File: `packages/engine/src/contracts/compiler.ts`. Seam: `agent-api/compiler/` and `agent-api/nodes/` (PR 0b carve-out table §3.2).

```ts
export type AuraDegradationCode = "renderer-mount-failed" | "texture-upgrade-failed" | "sdf-text-fallback" | "pose-apply-failed" | "clip-apply-failed" | "morph-apply-failed" | "foot-planting-failed" | "extension-lobe-pending" | "capability-degraded" | "option-ignored";
export interface AuraDegradation { readonly code: AuraDegradationCode; readonly nodeId?: string; readonly message: string; readonly cause?: unknown; readonly frame: number; readonly ownerPrd?: number; }
export type AuraCompiledFeature = "lights.directional" | "lights.point" | "lights.spot" | "lights.ambient" | "lights.hemisphere" | "environment.ibl" | "environment.background" | "shadows.directional" | "shadows.csm" | "shadows.spot" | "shadows.point" | "fog" | "post.bloom" | "post.ao" | "post.ssr" | "post.dof" | "post.taa" | "post.smaa" | "post.fxaa" | "post.colorGrade" | "instancing" | "skinning" | "morph" | "text.sdf" | "particles" | "water" | "sky.dayNight" | "weather" | `${"world" | "vfx" | "look"}.${string}`;
export interface SceneCompileContext { readonly renderer: unknown /* Renderer */; readonly assets: unknown /* AuraAssetResolver */; readonly quality: AuraQualityTierSettings & { readonly tier: AuraQualityTier }; readonly strict: boolean; readonly flags: QrFlags; degrade(d: Omit<AuraDegradation, "frame">): void; }
export interface CompiledActor { readonly nodeId: string; dispose(): void; }
export interface CompiledScene { readonly snapshotVersion: number; readonly source: unknown /* RenderSource */; readonly actors: readonly CompiledActor[]; readonly features: ReadonlySet<AuraCompiledFeature>; readonly degradations: readonly AuraDegradation[]; dispose(): void; }
export interface NodeHandler<N extends { readonly kind: string }> {
  readonly kind: N["kind"]; readonly owner: PrdId; readonly flag?: QrFlagName;
  compile(node: N, ctx: SceneCompileContext, out: RenderSourceContributions): void | Promise<void>;
  update?(node: N, handle: AuraRuntimeNodeHandle | undefined, ctx: SceneCompileContext, out: RenderSourceContributions, timeSeconds: number): void;
  dispose?(node: N): void;
}
export interface RenderSourceContributions { addItems(items: readonly unknown[] /* RenderItem */): void; addLights(lights: readonly unknown[] /* CollectedLight */): void; set<K extends string>(field: K, value: unknown): void; feature(f: AuraCompiledFeature): void; }
/** Node kinds: open registry via declaration merging (PR 0a declares every kind in the catalog). */
export interface AuraNodeKindMap { model: unknown; primitive: unknown; group: unknown; light: unknown; effect: unknown; interaction: unknown; label: unknown; environment: unknown;  // existing (index.ts:1474-1482)
  sky: unknown; look: unknown; probe: unknown; biome: unknown; "time-of-day": unknown; wind: unknown; terrain: unknown; water: unknown; scatter: unknown; grass: unknown; }
export function registerNodeHandler<K extends keyof AuraNodeKindMap>(handler: NodeHandler<{ readonly kind: K & string }>): () => void;   // duplicate kind throws unless flag differs and only one is active
export const DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>>;   // key "<builder>.<field>"
export interface OptionCoverageRow { readonly builder: string; readonly field: string; readonly probeValueA: unknown; readonly probeValueB: unknown; readonly ownerPrd: number; }
export function registerOptionCoverage(rows: readonly OptionCoverageRow[]): void;
export function compileScene(snapshot: AuraSceneSnapshot, ctx: SceneCompileContext): Promise<CompiledScene>;
export function updateCompiledScene(compiled: CompiledScene, snapshot: AuraSceneSnapshot, runtime: AuraRuntimeNodeRegistry, timeSeconds: number): unknown /* RenderSource */;
```

Semantics and invariants:
- An unknown node kind is `AuraRuntimeError("unknown-node-kind")` under strict, and an `option-ignored` degradation
  otherwise.
- Every builder field is either covered by an option-coverage row, meaning changing it changes the
  RenderSource/pixels, or is listed in `DIAGNOSTIC_ONLY_FIELDS` with its owner. The arch gate `option-coverage`
  enforces this.
- A lane removes its DIAGNOSTIC_ONLY entries as it wires them. Those entries live in the lane's own file
  `compiler/diagnosticOnly.prdNN.ts`, which PR 0a creates and the PRD 15 index merges.
- `strict` defaults to true only when `A3D_QR_STRICT` is on.

Stub (PR 0b):
- `compileScene` and `updateCompiledScene` wrap the moved `createProductionRuntimeSceneRenderer`
  (`index.ts:13540-13841`) and `createProductionRuntimeRendererInput` (`index.ts:13842-14012`).
- Registered handlers for new kinds run. Existing kinds keep the legacy path unless a handler for that kind is
  registered and its flag is on.

Real (PRD 15): the compiler, with lane handlers living in lane-owned `compiler/*.ts` files (§3.2).

Conformance: `tests/unit/contracts/C-36-compiler.test.ts` (unknown kind; option coverage; degradation strictness;
flag-off byte-equal RenderSource for the 18 base scenes' snapshots) and `tests/unit/agent-api/optionCoverage.test.ts`
(PRD 15). Flag: `A3D_QR_COMPILER`, sub-flag `A3D_QR_STRICT`.

---

### C-37 RuntimeNode add/remove and node-handle extensions
Provider: PRD 15. Consumers: 06 (animation members), 07 (effects add/remove after mount), 08 (interpolate, timeScale, teleport), 09 (`setInstanceTransforms`), 10 (world nodes), 14.
File: `packages/engine/src/contracts/runtimeNodes.ts`. Seam: `app/runtimeNodes.ts` (carve-out of `AuraRuntimeNodeRegistry` `index.ts:10664-10670`, plus its implementation in `createAuraApp`).

```ts
export interface AuraRuntimeNodeRegistryV2 /* merges into AuraRuntimeNodeRegistry */ {
  get(id: string): AuraRuntimeNodeHandle | undefined; require(id: string): AuraRuntimeNodeHandle; has(id: string): boolean; ids(): readonly string[]; all(): readonly AuraRuntimeNodeHandle[];
  add(node: AuraSceneNode | AuraNodeBuilder<AuraSceneNode>, options?: { readonly parent?: string }): AuraRuntimeNodeHandle;
  remove(idOrHandle: string | AuraRuntimeNodeHandle): boolean;
  readonly version: number;          // increments on add/remove
}
export interface NodeHandleExtension<K extends keyof AuraNodeHandleExtensionMap> extends RegistryEntry { readonly member: K; readonly appliesTo: readonly (keyof AuraNodeKindMap)[]; create(handle: AuraRuntimeNodeHandle, app: AuraApp): AuraNodeHandleExtensionMap[K]; }
export interface AuraNodeHandleExtensionMap {
  materials: AuraModelMaterialHandle;                                  // C-15, prd04
  animation: AuraActorAnimationApi;                                    // C-19, prd06 (members also flattened onto handle: crossFadeTo, playLayer, ...)
  interpolate: boolean; timeScale: number; teleport: (x: number, y: number, z: number, rotation?: AuraVec3) => AuraRuntimeNodeHandle;   // C-23, prd08
  setInstanceTransforms: (matrices: Float32Array, count: number, colors?: Float32Array) => AuraRuntimeNodeHandle;                        // prd09 (instanced nodes only; throws if count > capacity)
  setFog: (partial: Partial<import("./atmosphere").AuraHeightFogSpec>) => void;                                                          // C-21, prd07 (fog nodes)
}
export function registerNodeHandleExtension<K extends keyof AuraNodeHandleExtensionMap>(ext: NodeHandleExtension<K>): () => void;
```

Semantics:
- `add` and `remove` never remount. They create or dispose only the subtree's render items and physics bodies.
- `add` inside a frame callback takes effect next frame.
- `remove` of an id that is not present returns false.
- Extension members are present on every handle of an applicable kind. When the provider's flag is off they are the
  stub members.

Stub (PR 0b):
- `add` appends the node to the current snapshot and calls the existing `setScene` path (`index.ts:11480-11492`,
  map). This is a correct but slow remount. The diagnostic `RUNTIME_ADD_REMOUNT` reports it, and the stub honours
  "no visual change other than the added node".
- `remove` works the same way.
- `version` is real.
- Extension stubs: `timeScale` is a plain field defaulting to 1, `teleport` is `setPosition` plus
  `interpolate = false` for one frame, and `setInstanceTransforms` rebuilds instance transforms through the existing
  instanced-node update. `materials` and `animation` stubs are in C-15 and C-19.

Real (PRD 15): subtree add/remove on the compiler (C-36), with version counters per node.

Conformance: `tests/unit/contracts/C-37-runtime-nodes.test.ts` (add→has; remove→!has; version increments) and
`tests/browser/contracts/C-37-add-remove.spec.ts` (no frame with a blank canvas during add, when real). Flag:
`A3D_QR_COMPILER`.

---

### C-38 App surface extension registry
Provider: PRD 15. This is infrastructure and PR 0 delivers it real. Consumers: every lane that adds `AuraApp` members or `createAuraApp` options.
File: `packages/engine/src/contracts/app.ts`. Seam: `app/createAuraApp.ts` (carve-out of `createAuraApp` `index.ts:11126-11743`) calls the registry once per app.

```ts
export interface AuraAppExtensionMap {
  lighting: AuraLightingRuntime;            // C-10 prd02
  camera: AuraCameraController;             // C-22 prd08
  time: AuraTimeController;                 // C-23 prd08
  feel: AuraFeelBus;                        // C-23 prd08
  effects: AuraAppEffects;                  // C-20 prd07
  atmosphere: AuraAppAtmosphere;            // C-21 prd07
  world: AuraWorldQueries;                  // C-26 prd10 (AuraWorldRuntime when real)
  quality: AuraQualityController;           // C-27 prd11
  output: AuraOutputSurface;                // C-05 prd01 (setOutput/setOutputOverlay/capture/onRendererError also flattened onto AuraApp)
  post: AuraPostSurface;                    // C-13 prd03 (addPostPass/setQualityTier flattened)
}
export interface AppExtension<K extends keyof AuraAppExtensionMap> extends RegistryEntry { readonly member: K; create(app: AuraApp, ctx: { readonly flags: QrFlags; readonly options: AuraCreateAppOptions }): AuraAppExtensionMap[K]; dispose?(value: AuraAppExtensionMap[K]): void; }
export function registerAppExtension<K extends keyof AuraAppExtensionMap>(ext: AppExtension<K>): () => void;
// AuraApp extends AuraAppExtensionMap (PR 0a): every member always present; stub factories registered in PR 0a under owner "prd15" with the provider lane's flag; the provider lane registers its real factory with the SAME member and flag — resolution: real if provided && flag on.
// Flattened methods on AuraApp (PR 0a): setOutput, setOutputOverlay, capture, onRendererError (C-05); addPostPass, setQualityTier, cutCamera (C-13/C-14); precompile (C-02/C-27); lookSignature(): Promise<string>, lookManifest(): AuraLookManifest (prd09); onRender (C-23).
// AuraCreateAppOptions additions (PR 0a, all optional): qualityRebuild, lighting, output, pixelRatio (number | {max?, min?}), assets, animation, camera, accessibility, strict, onDegradation, compat ({ post?: "3.0" }), loop (AuraLoopOptions)
// AuraCreateAppRendererOptions additions (PR 0a, all optional): quality, output, resolution, msaa, compile, strictMount, debug, renderScale, backend, adaptive, targetFrameRate, batching, vfx, vfxOverrides, skinnedShadows, morph, skinnedPbr, materialStrictness, materialModel, transmission, alphaToCoverage, debugView
```

Semantics:
- Extension factories run in registration `order` after the renderer mounts, and before `app.ready()` resolves.
- `dispose` runs in reverse order.
- A factory throwing during `create` triggers `renderer-mount-failed` handling only under strict. Otherwise the stub
  factory is used and a `capability-degraded` degradation is recorded.
- `lookSignature()` is SHA-256 hex over canonical look state, with the camera excluded (PRD 09). Its stub hashes
  `JSON.stringify` of `appliedLook` plus `qrFlags`.

Conformance: `tests/unit/contracts/C-38-app-extensions.test.ts` (every member present on a mounted app with all flags
off; real overrides stub only with flag on; dispose order).

---

### C-39 CLI command and codemod registry
Provider: PRD 15. This is infrastructure and PR 0 delivers it real. Consumers: 01 (`core-v2` codemod), 02 (`migrate lighting`), 03 (`post-v2`), 04 (`pin-emissive-defaults`), 05 (`assets *`), 06 (`animation-3.1`), 08 (`camera-cast`, doctor rule), 09 (`perf-report`), 10 (`assets bake-impostor`), 11 (`prd11-batch-optout`), 13 (`look *`, `doctor --look`).
File: `packages/aura3d-cli/src/contracts/commands.ts`. Seam: `packages/aura3d-cli/src/cli.ts` dispatch falls through to the registry (PR 0b).

```ts
export interface AuraCliCommand { readonly name: string /* "assets optimize", "look capture", "migrate lighting" */; readonly owner: string /* "prd05" */; readonly summary: string; readonly usage: string; run(argv: readonly string[], io: { readonly cwd: string; stdout(s: string): void; stderr(s: string): void }): Promise<number>; }
export function registerCliCommand(cmd: AuraCliCommand): void;                 // duplicate name throws
export interface AuraCodemod { readonly name: string; readonly owner: string; readonly description: string; transform(source: string, fileName: string): { readonly code: string; readonly rows: readonly { readonly file: string; readonly line: number; readonly construct: string; readonly mapping: "exact" | "approximate" | "none"; readonly target?: string; readonly note?: string }[] }; }
export function registerCodemod(mod: AuraCodemod): void;                       // run via `aura3d codemod <name> <glob> [--report|--write|--dry-run]`
export interface AuraDoctorRule { readonly code: string /* "feel/evidence-only", "look/capture-branch" */; readonly owner: string; check(file: { readonly path: string; readonly text: string }): readonly { readonly line: number; readonly message: string; readonly severity: "error" | "warning" }[]; }
export function registerDoctorRule(rule: AuraDoctorRule): void;                // hosted by `aura3d doctor --look` (PRD 13)
```

Semantics:
- Codemods are pure (`source → code + rows`), so they are deterministic and testable.
- Codemods target route and template files owned by PRDs 13 and 14, who run them (R20, R21).
- Lanes put commands in `packages/aura3d-cli/src/commands/prdNN/*.ts` and register them from
  `packages/aura3d-cli/src/commands/prdNN/index.ts`, which PR 0a creates empty.

Conformance: `tests/unit/contracts/C-39-cli.test.ts` (dispatch to registered command; duplicate rejection; codemod
purity on a fixture).

---

### C-40 Facts handoff tables
Providers: every lane that changes agent-facing behaviour. Consumer: PRD 13, which writes skills, `llms.txt`, recipes and template text.
File: §9 of this document (Appendix B). No code and no PR 0 work.

Each fact is a row: `id | lane | statement | API | since (date, commit) | evidence (test or capture run id) | status (proposed/verified)`.
- PRD 13 writes skill text only from `verified` rows.
- A lane adds rows in its own PR. Appending rows to Appendix B is the one permitted shared edit to this file
  (§6.4), and it is append-only.
- C-07-OUT-9 is the PRD 07 subset: which builders render on which tier, impact-library kinds, sky and fog defaults.

---

## 3. Extension-point refactor plan and PR 0 (Contract Bootstrap)

### 3.1 Mechanisms

Shared hot files stop being shared through three mechanisms. All three land in PR 0. None of them changes behaviour.

1. **Registries and hooks.** These are the `register*` functions in the catalog. A lane adds behaviour by
   registering from its own file. The hot file calls the registry at a fixed seam.
2. **Verbatim carve-outs.** A region that one lane must substantially rewrite moves, unchanged, into a new module
   owned by that lane. The hot file imports it and calls it in place. Carve-out rules:
   - Function bodies are byte-identical.
   - The only changes allowed are imports and `export` keywords.
   - A block inside a larger function is extracted into a named function whose parameters are the free variables of
     the block (no closures over mutable state). The caller passes them explicitly.
   - The original module re-exports every moved public symbol, so the public API and
     `tests/unit/public-api-contracts.test.ts` are unchanged.
   - Moved modules import types from `agent-api/index.ts` with `import type` only. Runtime helpers they need move
     with them, or move to `agent-api/internal/shared.ts` (owner 15).
3. **Pre-declared optional types.** Every field, member, union member and node kind that the catalog adds to an
   existing shared interface is declared in PR 0a as optional and inert, with a JSDoc `@qrOwner prdNN @contract C-NN`
   tag. It is listed in `DIAGNOSTIC_ONLY_FIELDS` (C-36) until its owner wires it. Consumers compile against it on
   day 0.

Shared hot files are owned by one lane each (§4). After PR 0, other lanes never edit them. They use the seams.
Edits to a hot file's remaining core by a non-owner go through a request to the owner (§6.5).

### 3.2 `packages/engine/src/agent-api/index.ts` (18,733 lines; owner after PR 0: PRD 15)

The types section (`index.ts:1-2097`) stays in place, gains the PR 0a pre-declared fields, and is frozen except by
CCR. The builder and runtime regions move as follows. Line ranges were checked at `85aafcd0`; "(map)" means the range
comes from the conflict map's verified list.

| Range | Symbol(s) | Target module (`agent-api/…`) | Owner | Contract seam |
|---|---|---|---|---|
| 2222-2287 | `instances` | `nodes/instances.ts` | 10 | C-07, C-36 |
| 2366-2386 | `shadows` (contact) | `nodes/shadows.ts` | 02 | C-10 |
| 2414-2724 | `material` presets | `nodes/material.ts` | 04 | C-15 |
| 2721, 2959, 8409, 8424, 9018, 9254, 9366, 9452 (map) | `visualQA` implementations, `validateMaterialVisualQA` | `looks/structuralQA.ts` (namespaces keep property references) | 13 | P-13 structuralQA |
| 3063-3159 | `lights` | `nodes/lights.ts` | 02 | C-10 |
| 3215-3395 | `camera` builders | `nodes/camera.ts` | 08 | C-22 |
| 3441-3728 | `effects`. The post factories `bloom` :3450, `neonBloom` :3482, `ambientOcclusion` :3518, `contactOcclusion` :3528, `colorGrade` :3543 and `antiAlias` :3561-3568 (map) move to `effects.post.ts`. Everything else moves to `effects.ts`. | `nodes/effects.ts` (07) + `nodes/effects.post.ts` (03) + `nodes/effects.lighting.ts` (02, new, empty) | 07 / 03 / 02 | `effects = { ...vfxEffectBuilders, ...postEffectBuilders, ...lightingEffectBuilders }`. A duplicate key fails the C-36 conformance test. |
| 3730-3770 | `sky` | `nodes/sky.ts` | 07 | C-21 |
| 3772-3868 | `weather` | `nodes/weather.ts` | 07 | C-21 |
| 3870-3909 | `water` | `nodes/water.ts` | 10 | C-26 |
| 4123-4190 | `environments` | `nodes/environments.ts` (02), spreading `nodes/environments.world.ts` (10, new, empty) | 02 / 10 | C-09 |
| 4192-4214 (map) | `rendererColorManagementPreset`, `sceneExposurePresets` | `app/colorManagement.ts` | 01 | C-05 |
| 4225-4327 (map) | renderer quality profiles, `normalizeCreateAppRendererOptions` (:4315) | `app/rendererOptions.ts` | 11 | C-27 |
| 5842-5901 (map) | `prefabs.cityBlock` | `nodes/prefabs/cityBlock.ts` | 10 | C-26 |
| 7061, 8204 (map) | `maxSubSteps ?? 5` defaults | `app/frameLoopDefaults.ts` (`DEFAULT_MAX_SUBSTEPS`) | 08 | C-23 |
| 7605-7650 (map) | racing presentation camera, `createGameRacingCameraRig` gate | `nodes/game/racingCamera.ts` | 08 | C-22 |
| 6980 (map), 8198-8307 | `collectGameRuntimeEvidence`, `game` namespace | `nodes/game/index.ts` | 09 | C-24 |
| 8344-8365 | `collectParticleBudgetDiagnostics`, `particles` | `nodes/particles.ts` | 07 | C-20 |
| 9595-9677 | lazy-system evidence | `devtools/lazySystemEvidence.ts` | 15 | C-31 |
| 9681-9796 (map) | `sceneKitPerformanceBudgets` | `devtools/sceneKitBudgets.ts` | 11 | C-27 |
| 9841-10005 | `makeSceneKit`, `sceneKits` | `nodes/sceneKits.ts` | 02 | R7 |
| 10103-10363 | `definePromptPlan`, `compilePromptPlan`, `promptRecipes`, warnings | `nodes/prompt/{promptPlan,promptRecipes}.ts` | 13 | R7 |
| 10664-10670 + impl in `createAuraApp` | `AuraRuntimeNodeRegistry` | `app/runtimeNodes.ts` | 15 | C-37 |
| 10970-10984 (map) | `node.play`, `setAnimationPose` handle impl | `app/actorAnimationHandle.ts` | 06 | C-19 |
| 11126-11743 | `createAuraApp` (calls C-38 registry, C-31 sections, C-27 tier resolve, flags resolve) | `app/createAuraApp.ts` | 15 | C-38 |
| 11290-11302 (map) | `runtimeAlpha` | `app/frameAlpha.ts` | 08 | C-23 |
| 11818-11827 | `createGameApp` | `app/createGameApp.ts` | 09 | C-24 |
| 12552 (map), 15070-15132, 15461-15490 (map) | `ProductionRuntimeActorEntry` animation fields, `applyProductionActorAnimation`, `resolveAnimationSeconds` | `compiler/animation.ts` | 06 | C-19 |
| 12628-12732 | `createProductionRuntimeEnvironment` | `compiler/environment.ts` (body becomes the `"legacy"` source of `resolveEnvironment`) | 02 | C-09 |
| 12733-12786 | `createProductionRuntimeEnvironmentFog` | `compiler/fog.ts` | 07 | C-21 |
| 12797-12941 | `createProductionRuntimePostprocess` | `compiler/postprocess.ts` | 03 | C-13 |
| 12942-12984 | `createProductionRuntimeShadowOptions` | `compiler/shadows.ts` | 02 | C-11 |
| 13363-13413 (+ `createProductionRuntimeCollectedLight` :13415) | fallback lights | `compiler/lights.ts` | 02 | C-10 |
| 13540-13841 | `createProductionRuntimeSceneRenderer` | `compiler/renderer.ts` | 15 | C-36 |
| 13560-13580 (map), inside the above | tint bridge (`replaceSurfaceTextures: true` :13570) | `compiler/modelMaterials.ts` (`applyModelTintBridge`) | 04 | C-15 |
| 13842-14012 | `createProductionRuntimeRendererInput` | `compiler/renderInput.ts` | 15 | C-36 |
| 14013-14755 | primitive entries, `createProductionInstanceTransforms` (:14747, R18) | `compiler/primitives.ts` | 15 | C-07 |
| 14040-14104, 14163, 14290-14460, 14529 (map) | procedural no-rasterizer paths, C1 textured path, SDF text sampler | `compiler/textures.ts` | 04 | C-12, C-15 |
| 15989 (map) and safe-basic paths ~16000 | second `webgl2` getContext, `createWebGLRainModel`/`createWebGLParticleModel` | `compiler/safeBasic.ts` | 15 | C-36 |
| 18253-18293 | `collectGeneratedCodeWarnings` | `looks/generatedCodeWarnings.ts` | 13 | C-34 |

After PR 0b, `index.ts` keeps the types, `scene` (:4842), `physics` (:5172), `prefabs` (minus cityBlock),
`analyzeProductionBridgeEligibility` (:4339), the evidence helpers that PRD 15 moves to devtools later, and
re-exports. All of these are owned by PRD 15. Each public builder namespace keeps its exact current export name.

### 3.3 `packages/rendering/src/ForwardPass.ts` (2,213 lines; owner PRD 01)

| Range (map) | Content | Target (`packages/rendering/src/…`) | Owner |
|---|---|---|---|
| 24-48 | `RenderItem` interface | `contracts/renderItem.ts`, re-exported from `ForwardPass.ts`. PR 0a adds `receiveShadow?` (02), the C-14 previous-frame fields (03), `lodFade?` (05), `cameraFade?` (08) and `instanceEmissive?` (11). | 15 (custodian) |
| 242-265, 294, 298, 834-854, 913/1048/1172 | clustered-light setup, `applyClusteredLightingUniforms`, shadow-map selection, the 0.65 shadow strengths | `forward/Lighting.ts` | 02 |
| 312-314, 343-349, 382-452, 1841-1853, 1855-1940, 1942-2036 | morph dispatch, CPU morph, `SkinningPaletteUploadManager`, `resolveRenderGeometry` CPU morph, `applyGpuMorphUniforms`, `applySkinningUniforms`, `createSkinningPaletteTexture` | `forward/Deform.ts` | 06 |
| the device draw issuance inside `drawItem` 269-351 | the final `device.draw*`/instanced draw call | `forward/DrawSubmit.ts` (`submitDraw(device, pipeline, geometry, instanceCount, ranges)`) | 11 |
| new | velocity MRT binding seam: `ForwardPass` calls `bindVelocityUniforms?.(item, uniforms)` per draw (no-op stub) | `forward/Velocity.ts` | 03 |
| new | transmission capture (runs via C-01 `transmission` phase) | `forward/Transmission.ts` | 04 |

Everything else stays with PRD 01: `drawItem` core, `shaderCacheKey` 681-683 (map), instancing 1711-1803 (map) and
`MAX_GPU_*` 119-121. PRD 10's static world instance buffers and PRD 11's instancing chunk removal reach this code
through C-07 `instanceBufferSlot` and C-01 `collect`.

### 3.4 `packages/rendering/src/WebGL2Device.ts` (4,769 lines; owner PRD 01)

| Range (map) | Content | Target (`packages/rendering/src/webgl2/…`) | Owner |
|---|---|---|---|
| 4117-4133 (call site :3922) | `resolveCompressedTextureFormat` | `TextureFormats.ts` | 05 |
| ~3859-3946, ~4106-4114, :274-275, :1390, :3898 | texture create/upload path, `releaseDisposedTextureHandles`, texture map. Upload calls `applyTextureBudget(desc, policy)` from `textures/TextureBudget.ts` (04; identity stub). | `TextureUpload.ts` | 06 |
| ~4139-4155 | sampler min-filter/wrap mapping | `Samplers.ts` | 02 |
| 871-1110, 1734, 1804, 2838-3409 | `presentLdrPostprocess`, bloom/outline LUTs, legacy SSAO/SSR/DOF/MB/TAA programs | `LegacyPost.ts` | 03 |
| 417-445 | context lost/restored listeners | `ContextLifecycle.ts` | 11 |
| linkProgram 552, 2770, 2812, 3429, 3641; readPixels 1132-1186, 1623 | call sites wrapped by counters (wrapping only, call order unchanged) | `Counters.ts` | 11 |
| new | extension probe (`WEBGL_multi_draw`, `KHR_parallel_shader_compile`, `EXT_disjoint_timer_query_webgl2`, `WEBGL_debug_renderer_info`), `probe` property | `Probe.ts` | 11 |
| new | `multiDrawElementsInstanced` | `MultiDraw.ts` | 11 |

These stay with PRD 01:
- The present/tone-map shader `ensureLdrPostprocessProgram` (3440-3640, map) and its uniform upload (1893-1910,
  map). C-05 is the seam for PRD 09's juice overlay.
- Render-target creation, including the shadow target at 663-676 (map). `RenderTargetDescriptor`
  (`RenderDevice.ts:65`) gains these fields in PR 0a: `dimension?: "2d" | "cube" | "2d-array"`, `layers?`,
  `depthOnly?`, `depthCompare?`, `colorAttachments?: readonly { format: TextureFormat }[]`. Until PRD 01 implements
  them, the stub throws `RENDER_TARGET_FEATURE_PENDING:<field>`. PRD 02 uses one 2D depth target per cascade in the
  meantime.
- Buffers, the VAO cache, state application (C-04) and draw.

### 3.5 `packages/rendering/src/Renderer.ts` (3,152 lines; owner PRD 01)

| Range | Content | Target (`packages/rendering/src/renderer/…`) | Owner |
|---|---|---|---|
| 246-290 | `RenderSource` | `contracts/renderSource.ts`, re-exported. PR 0a adds `environmentProbe?`, `ambient?`, `hemisphere?`, `reflectionProbes?`, `irradianceVolumes?`, `shadows?`, `contactShadows?` (02); `vfx?`, `sky?`, `fog?`, `volumetric?`, `wetness?` (07); `reflectionViews?`, `sceneColorCopy?`, `worldUniforms?` (10). | 15 |
| 363-376, 1354-1603, 1915-1931, 1964-1986 (map) | `RendererShadowOptions` mapping, shadow orchestration incl. `executeRendererPointShadowMap`, `readShadowFacePixels`, directional fit | `ShadowOrchestration.ts` | 02 |
| 559, 649-656, 728, 818-822, ~1806 (map) | background wiring, `collectEnvironmentBackground` | `Background.ts` | 02 |
| 977-1330 | `executePostprocess`, `executePostprocessAsync`, `executePixelPostprocessPass(Async)`, readback helpers | `PostprocessExecution.ts` | 03 |
| 2208-2258, 2361-2409 (map) | explicit-item frustum culling, `applyRendererOwnedStaticBatching`, `staticBatchKey` | `CullingBatching.ts` | 11 |
| 2295-2305 (map) | `skinnedItemLocalBounds` | `SkinnedBounds.ts` | 06 |
| 472 (`static create`) + backend selection | factory | `RendererFactory.ts` | 11 |
| new | `onDeviceLost`/`onDeviceRestored`/`isDeviceLost` | `DeviceLifecycle.ts` | 11 |
| new | phase-hook dispatcher (C-01) at :555, :622, :650/:664, :680, :688 and async twins | `FrameGraph.ts` | 01 |

### 3.6 TypedGLBActor and GLTF resources

- `packages/engine/src/production-runtime/TypedGLBActor.ts` (514 lines, owner 04). PR 0b adds
  `production-runtime/actor/extensions.ts` (custodian 15):
  `registerTypedGLBActorExtension({ id, owner, flag, onLoad?(actor, pipeline), collectRenderItems?(actor, items): RenderItem[], dispose?(actor) })`.
  It is called at `createTypedGLBActor` after the pipeline load (:184-191, map), in `collectRenderItems` (:177/:302,
  map), and in `dispose` (:180, map).
  - Carved to `actor/TypedGLBActorAnimation.ts` (06): `lastApply` collection :205-248, evidence :357-390, palette-key
    handling.
  - New `actor/TypedGLBActorLod.ts` (05) registers an extension for LOD selection.
  - `TypedGLBActorOptions` gains `materialOverrides?`, `variant?`, `decoders?`, `textureBudget?`, `maxTextureSize?`
    and `lod?` in PR 0a.
- `packages/assets/src/GLTFRenderResources.ts` (2,330 lines, owner 04). `decodeImageInBrowser` (~2219-2238, map) is
  carved to `packages/assets/src/gltf/ImageDecode.ts` (05). `GLTFRenderResourceOptions` gains `tangents?`,
  `textureBudget?` and `anisotropy?` in PR 0a.

### 3.7 Shader libraries: legacy is frozen

`ShaderLibrary.ts` (3,331), `ShaderLibraryCore.ts` (904) and `ShaderChunks.ts` are owned by PRD 01 and frozen as
the flag-off path.
- No lane adds features there. New lighting, material, deformation, fog, wind, LOD-dither, camera-fade and velocity
  code goes into registered chunks and features (C-02, C-03, C-11, C-18, C-21, C-26) in lane-owned files.
- It becomes visible on the production path when `A3D_QR_CORE=v2` routes draws through the generator.
- Legacy fudge deletions are done by PRD 01 when the flag is removed (§5.4). Example: the stripe/roughEnvironmentFloor
  terms at `ShaderLibrary.ts:377-383` (map).
- A lane that needs a legacy-path fix before then files a legacy patch request (§6.5). PRD 01 applies these within
  2 working days. The requesting lane never waits on it, because its acceptance runs on its own path.

### 3.8 Barrels, subpaths, lean, templates, CLI, benchmarks, CI

- **Barrels.** Each package gets `src/lanes/index.ts` (custodian 15), containing exactly 15 lines
  `export * from "./prdNN.js";`, plus 15 empty lane barrels `src/lanes/prdNN.ts` (each owned by its lane). This
  applies to `packages/rendering`, `packages/engine`, `packages/assets` and `packages/animation`.
  `packages/rendering/src/index.ts` and `packages/engine/src/index.ts` gain `export * from "./lanes/index.js"` and
  `export * from "./contracts/index.js"`. Provider `provide()` calls live in lane barrels, so importing the package
  registers real implementations.
- **Subpaths reserved in PR 0a.** These go in `package.json#exports`, owner 15, each pointing at a lane-owned entry
  file:
  - `@aura3d/rendering/contracts`
  - `@aura3d/rendering/reference` (03)
  - `@aura3d/rendering/world` (10)
  - `@aura3d/animation/pose` (06)
  - `@aura3d/engine/contracts`
  - `@aura3d/engine/renderer` and `@aura3d/engine/devtools` (15)
  - `@aura3d/game`, `@aura3d/game/capture` (09) and `@aura3d/game/art` (14)

  PR 0a creates the `packages/game` skeleton: `package.json`, `tsconfig.json`, `src/index.ts` re-exporting the C-24
  stubs, and `src/art/index.ts` re-exporting C-35.
- **Lean** (`packages/lean/**`, `packages/rendering/src/lean*`, `LeanWebGL2Device.ts`) is owned by PRD 15.
  PRD 01's "route lean through Renderer + OutputPass" is a request to PRD 15. PRD 15 executes it as the
  lean-to-engine shim or deletion (PRD 15 T2.3).
- **Templates and skills** (`packages/create-aura3d/**`, root `templates/`, `examples/`,
  `packages/aura3d-cli/skills/**`, `llms.txt`) are owned by PRD 13 (R20). Lanes deliver C-40 facts and codemods.
- **CLI.** `packages/aura3d-cli/src/cli.ts` (owner 05) dispatches unknown verbs to the C-39 registry. PR 0b adds
  that fallthrough and help generation. Lanes add `src/commands/prdNN/`.
- **ESLint.** `eslint.config.js` (owner 15) imports `eslint/qr/*.js` (PR 0a, empty array export per lane file).
  PRD 09 owns `eslint/qr/no-route-capture-flags.js`.
- **Benchmarks.** PR 0a creates `benchmarks/quality-rebuild/scenes/prdNN/index.ts`,
  `aura3d/scenes/prdNN/index.ts` and `three/scenes/prdNN/index.ts` (empty arrays, lane-owned), and
  `shared/registry.ts` (12) aggregates them. New scene ids are `<owner>-<slug>`. The colliding "19-*" numbering
  proposed by both PRD 03 (19-25) and PRD 11 (19-20) is withdrawn.
- **Capture.** PR 0b adds step-plugin loading and the `--flags` passthrough to `capture-games.mjs` and `capture.mjs`,
  and adds the `qr_flags` input to `.github/workflows/quality-rebuild-capture.yml`. All three are owned by 12.
- **CI.**
  - `.github/workflows/qr-contracts.yml` (15): on every PR and push to main, run `pnpm typecheck:raw`, `pnpm lint`,
    `pnpm test:unit` (includes `tests/unit/contracts/`), and `tools/qr-ownership/check.mjs`. Browser conformance
    runs on macos-14 (Chromium/ANGLE Metal).
  - `.github/QR_OWNERSHIP.json` is the §4 table in machine form. `check.mjs` fails a PR labelled `lane:prdNN` that
    modifies a path owned by another lane. The exceptions are the §4.3 generated-file rule and appends to Appendix B.

### 3.9 PR 0: Contract Bootstrap (owned by the PRD 15 lane; executed first by whichever agent starts)

Contract-wide rule: PR 0 changes no rendered pixel, no public signature (only optional additions), and no default.

**PR 0a, additive only (day 0, 2026-10-05).** It creates new files and edits no existing logic.
1. `packages/rendering/src/contracts/` with `core.ts`, `frameGraph.ts`, `program.ts`, `materialLobes.ts`,
   `blend.ts`, `output.ts`, `geometry.ts`, `frameUniforms.ts`, `environment.ts`, `shadows.ts`, `sampling.ts`,
   `post.ts`, `velocity.ts`, `textureFormats.ts`, `deform.ts`, `particles.ts`, `atmosphere.ts`, `quality.ts`,
   `device.ts`, `rendererFactory.ts`, `renderItem.ts`, `renderSource.ts`, `index.ts`, and
   `testing/ChunkHarness.ts`.
2. `packages/engine/src/contracts/` with `flags.ts`, `output.ts`, `sceneGraph.ts`, `environment.ts`, `lighting.ts`,
   `post.ts`, `materials.ts`, `assets.ts`, `animation.ts`, `effects.ts`, `atmosphere.ts`, `camera.ts`, `time.ts`,
   `game.ts`, `world.ts`, `diagnostics.ts`, `looks.ts`, `art.ts`, `compiler.ts`, `runtimeNodes.ts`, `app.ts`,
   `index.ts`, and `stubs/*.ts`. Each stub implements exactly the "Stub" paragraph of its catalog entry.
3. `packages/assets/src/contracts/decoders.ts`, `packages/animation/src/contracts/pose.ts`,
   `packages/audio/src/contracts/gameSound.ts`, `packages/aura3d-cli/src/contracts/{assetManifest,commands}.ts`,
   `packages/aura3d-cli/src/commands/{registry.ts,prdNN/index.ts}`.
4. Pre-declared optional fields (§3.1 item 3) on the existing types named in C-04, C-06, C-07, C-10, C-12, C-13,
   C-14, C-15, C-16, C-17, C-18, C-19, C-27, C-28, C-30, C-31, C-37 and C-38. This is the one kind of edit PR 0a
   makes to existing files, and it is declaration-only.
5. Lane barrels, subpath reservations, the `packages/game` skeleton, `eslint/qr/*.js`, the benchmark lane scene
   indices, `tools/quality-rebuild-capture/games.schema.json` and `contracts.mjs`, and
   `tools/quality-gate/src/contracts.ts`.
6. The conformance harness and all `tests/unit/contracts/C-NN-*.test.ts` and `tests/browser/contracts/*.spec.ts`
   suites, passing against the stubs.
7. `.github/workflows/qr-contracts.yml`, `.github/QR_OWNERSHIP.json` and `tools/qr-ownership/check.mjs`.

**PR 0b, seams and verbatim carve-outs (days 1-2, 2026-10-06..07).** It is split into three independently mergeable
PRs, so a slip in one does not hold the others:
- 0b-1: `agent-api/index.ts` carve-outs (§3.2) and the C-36/C-37/C-38/C-31/C-34 seams.
- 0b-2: rendering hot files (§3.3, §3.4, §3.5, §3.7) and the C-01, C-09, C-11, C-12, C-13, C-16, C-18, C-28 and
  C-29 seams.
- 0b-3: TypedGLBActor and GLTF (§3.6), CLI fallthrough (C-39), capture plugins and `qr_flags` (C-33).

**Acceptance for each PR 0 part, verified remotely:**
1. `pnpm typecheck:raw` (tsconfig.build.json), `pnpm lint`, `pnpm test:unit` and `pnpm test:integration` are green.
   No pre-existing test is modified, except import paths in tests that import moved internals.
2. `tests/unit/public-api-contracts.test.ts` is green. Exports are a superset of the `85aafcd0` exports.
3. Every conformance suite passes on stubs.
4. **IC-0 identity run** on GitLab macOS: `.github/workflows/qr-gitlab-ci.yml` with suite `all` and `qr_flags=none`, covering all 18 games and the 18 base benchmark scenes. Per-image ΔE2000 p99 must stay at or below the run-to-run noise from two GitLab captures of `qr/prd15-ic0-base` (the `85aafcd0` engine code plus CI/capture tooling only; `85aafcd0` itself has no GitLab pipeline config). GitHub run 37289688772 is historical audit evidence. Because it used a different provider and browser channel (`CI-ROUTING.md`), it is not the comparison baseline.
5. `tools/qr-ownership/check.mjs` passes. Moved line counts equal source line counts, checked by a script in the PR
   description.

**Size budget:** about 2,500 new lines (contracts, stubs, tests) and about 9,000 moved lines with 0 changed logic
lines. If an agent cannot keep a carve-out verbatim, that carve-out is dropped from PR 0b and its region stays with
the hot-file owner (§6.5 requests). PR 0 never grows to include behaviour.

**Who starts what on day 0:** every lane starts on 2026-10-05 in its own new files against PR 0a types. Lanes do not
wait for PR 0a to merge to begin: they branch from the PR 0a branch, which is pushed within hours. Edits to a carved
region start when the 0b part containing it merges, no later than day 2. Until then, the lane writes the replacement
in its new module and wires it after the 0b merge.

**Contracts whose consumption needs no PR 0b seam.** For these, the PR 0a types and stubs are all a consumer needs:
C-02, C-03, C-04, C-06, C-07, C-08, C-10, C-15, C-17, C-19, C-20, C-21, C-22, C-23, C-24, C-25, C-26, C-27, C-30,
C-32 and C-35. The §3.2-§3.6 carve-outs that touch their providers' regions exist to give the provider single-writer
editing room. They are not needed for consumption. C-40 needs no PR 0 at all.

Extra 0b-1 item: carve `GameRuntime.ts` `GameEffectKind` :1150-1171, `createGameEffects` :2800-2879 and
`effectToSceneNode` :3879-3915 (map) into `agent-api/vfx/gameEffects.ts` (07). `GameRuntime.ts` itself is owned by
08.

---

## 4. File-ownership map (single-writer rule)

Each path has exactly one owning lane. Only the owner commits changes to it. The machine-readable form is
`.github/QR_OWNERSHIP.json` (PR 0a), and `tools/qr-ownership/check.mjs` resolves it by **longest matching prefix**.
`prdNN` / `NN` means the lane's own number. All 651 entries in the conflict map's `allFiles` resolve under these rules.
I checked this with a resolver script against the map at writing time. The one unresolvable entry, "skill sources …
(paths not verified)", falls under `packages/aura3d-cli/skills/` and goes to 13.

### 4.1 Ownership rules

| Owner | Paths |
|---|---|
| **01** Rendering core | `packages/rendering/` default for anything not listed below, which includes `Renderer.ts`, `ForwardPass.ts`, `WebGL2Device.ts`, `WebGL2StateCache.ts`, `RenderGraph.ts`, `RenderPass.ts`, `SceneOptimization.ts`, `BRDFLut.ts`, and legacy `ShaderLibrary.ts`/`ShaderLibraryCore.ts`/`ShaderChunks.ts`. Also: `renderer/` (default, incl. `FrameGraph.ts`), `forward/` (default), `webgl2/` (default, incl. `RenderTargets.ts`), `program/` (except the 11 items), `output/`, `resources/` (except 06 and 11 items), `shaders/` (default), `production-runtime/shaders/chunks/`, `BlendModes.ts`, `ResolutionGovernor.ts`, `ColorManagement.ts`, `Exposure.ts`, `ToneMapping.ts`, `Geometry.ts`, `Material.ts`, `MeshConsolidation.ts`, `PbrReference.ts`, `ShaderModule.ts`; `packages/engine/src/agent-api/{sceneGraph,color}.ts`, `agent-api/app/colorManagement.ts`, `agent-api/compiler/{sceneGraph,color}.ts`; `tools/quality-rebuild-codemods/`, `tools/shader-lint/` |
| **02** Lighting | `packages/rendering/src/{environment,probes,shadows}/`, `passes/ContactShadowPass.ts`, `renderer/{ShadowOrchestration,Background}.ts`, `forward/Lighting.ts`, `webgl2/Samplers.ts`, `shaders/chunks/{contact_shadow,lighting_*,sh9,shadow_*}`, `shaders/pbr-direct.frag.glsl`, `DepthPass.ts`, `ShadowPass.ts`, `ShadowMap.ts`, `CascadedShadowMaps.ts`, `EnvironmentMapResources.ts`, `EnvironmentLighting.ts`, `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `EnvironmentPipeline.ts`, `EnvironmentPlatform.ts`, `ExternalParityRenderPreset.ts`, `LightUniforms.ts`, `ReflectionProbe.ts`, `ClusteredForwardLighting.ts`, `production-runtime/environment/`, `production-runtime/PBRHDRPipeline.ts`; `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts`; `packages/engine/src/agent-api/compiler/{environment,lights,shadows}.ts`, `agent-api/nodes/{shadows,lights,environments,sceneKits,effects.lighting,probes}.ts`; `public/aura-environments/`; `.github/workflows/lighting-quality.yml` |
| **03** Post | `packages/rendering/src/{post,postprocess,reference}/`, `renderer/PostprocessExecution.ts`, `forward/Velocity.ts`, `webgl2/LegacyPost.ts`, `cinematic/{BloomPass,VignettePass,FilmGrainPass,DepthHazePass}.ts`, `webgpu/WebGPUPostShaders.ts`, `RendererPostprocessPlan.ts`, `PostProcessPass.ts`, `TemporalHistory.ts`; `packages/engine/src/agent-api/{postBridge,postPresets}.ts`, `agent-api/compiler/postprocess.ts`, `agent-api/nodes/effects.post.ts`; `apps/postprocessing-*`; `tools/quality-rebuild/codemods/`; `.github/workflows/post-quality.yml` |
| **04** Materials | `packages/rendering/src/materials/`, `shaders/{physical,physical-wgsl}/`, `forward/Transmission.ts`, `textures/TextureBudget.ts`, `production-runtime/materials/`, `PBRMaterial.ts`, `TexturedPBRMaterial.ts`, `InstancedPBRMaterial.ts`, `SkinnedLitMaterial.ts`, `NormalMappedPBRMaterial.ts`, `IBL.ts`, `ProceduralMaterialTextures.ts`, `TransmissionRenderTarget.ts`, `Sampler.ts`; `packages/assets/src/{GLTFRenderResources,GLTFExtensionSupport,MikkTSpaceTangents}.ts`, `asset-corpus/ProductionGLTFRenderPipeline.ts`; `packages/engine/src/production-runtime/{TypedGLBActor,ModelMaterialOverrides}.ts`, `production-runtime/actor/` (default), `material-physical/`, `agent-api/compiler/{modelMaterials,textures}.ts`, `agent-api/nodes/material.ts`; `apps/wow-webgpu-product-viewer/`; `fixtures/asset-corpus/`; `tools/codemods/pin-emissive-defaults.mjs`, `tools/generate-extension-matrix.mjs` |
| **05** Assets | `packages/assets/` default (decoders, `KTX2*`, `KTX2TargetSelection.ts`, `GLTFLoader.ts`, `MeshOptimization.ts`, `AssetImportPreflight.ts`, `vendor/`, `loaders/`, `gltf/ImageDecode.ts`); `packages/rendering/src/webgl2/TextureFormats.ts`, `performance/LOD.ts`, `shaders/{lod-dither,debug-view}.glsl.ts`; `packages/engine/src/agent-api/AssetDecoders.ts`, `production-runtime/LodSelector.ts`, `production-runtime/actor/TypedGLBActorLod.ts`; `packages/aura3d-cli/` default (`cli.ts`, `cli-help.ts`, `index.ts`, `asset-*`, `admission/`, `lookdev/`, `optimize/`, `meshy/`, `pull-bridge/`, `cli-options.ts`, `tests/`); `packages/asset-index/`; `packages/physics-rapier/` (except `HeightfieldLayout.ts`); `apps/{asset-lookdev,loader-ktx2}/`; `assets/` default (`library/`, `art-direction/`); `public/{aura-assets,aura-decoders}/`; `aura.assets.json`, `aura.library.json`, `src/aura-assets.ts`, `LICENSE-THIRD-PARTY` (generated); `tools/asset-optimize/`; `.github/workflows/{asset-lookdev,asset-optimize}.yml` |
| **06** Animation | `packages/animation/` (all, incl. `Keyframe.ts`, `AnimationController.ts`, `pose/`); `packages/rendering/src/Skinning*.ts`, `WebGPUSkinningLimits.ts`, `MorphTargetPlan.ts`, `Texture.ts`, `resources/MorphTargetTexture.ts`, `shaders/deform/`, `forward/Deform.ts`, `webgl2/TextureUpload.ts`, `renderer/SkinnedBounds.ts`; `packages/assets/src/GLTFAnimationRuntime.ts`; `packages/engine/src/agent-api/{AnimationController,GameCharacterAnimation,VisemeController,FootPlanting,humanoid-walk-runtime}.ts`, `agent-api/app/actorAnimationHandle.ts`, `agent-api/compiler/animation.ts`, `production-runtime/actor/TypedGLBActorAnimation.ts`; `packages/aura3d-cli/src/{animation-asset-validator,asset-inspection-types}.ts`; `tools/codemods/animation-3.1.mjs`; `tools/quality-rebuild-capture/steps/burst.mjs`; `playwright.animation-matrix.config.ts`; `docs/rendering/skinning-and-morphs.md` |
| **07** VFX/atmosphere | `packages/rendering/src/{vfx,atmosphere,effects}/` (incl. `GPUParticleBackend.ts`, `ResidentGPUParticleRenderer.ts`), `cinematic/` (default), `DayNightSky.ts`, `Weather.ts`, `AtmosphereWetness.ts`, `SpriteFlipbook.ts`, `VolumetricFog.ts`, `production-runtime/geometry/ProjectedDecalGeometry.ts`; `packages/engine/src/agent-api/vfx/` (incl. carved `gameEffects.ts`), `agent-api/Decals.ts`, `agent-api/compiler/{fog,effects,sky}.ts`, `agent-api/nodes/{effects,sky,weather,particles}.ts`, `production-runtime/effects/`, `production-runtime/RootGpuParticleWorkload.ts`; `packages/engine/assets/vfx/`; `tools/{vfx-atlas-bake,effects-vfx-visual-audit}/`; `.github/workflows/prd07-vfx.yml` |
| **08** Camera/feel | `packages/engine/src/agent-api/{camera,feel,time,controls,vehicle}/`, `agent-api/{GameCameraRigs,CameraChoreographer,GameGenreKits,GameSceneGeometryBindings,PlatformerMotion,VehicleChassis,FrameLoop,GameRuntime,GameFeel}.ts`, `agent-api/app/{frameAlpha,frameLoopDefaults}.ts`, `agent-api/nodes/camera.ts`, `agent-api/nodes/game/racingCamera.ts`; `packages/rendering/src/shaders/camera-fade.glsl.ts`; `packages/input/` (except `TouchLayouts.ts`, `controls/`); `packages/physics/src/{Raycast,ScenePhysicsBridge}.ts`; `packages/scene/src/MathTypes.ts`; `benchmarks/quality-rebuild/motion/`; `tools/camera-cast-codemod/` |
| **09** Game runtime | `packages/game/` (except `src/art/`); `packages/audio/` (all except `src/contracts/`); `packages/engine/src/game/`, `agent-api/GameAppRuntime.ts`, `agent-api/app/createGameApp.ts`, `agent-api/nodes/game/` (default); `packages/input/src/TouchLayouts.ts`; `packages/math/src/{Easing,Random}.ts`; `apps/common/`; `assets/packs/game-sfx-core/`; `eslint/qr/no-route-capture-flags.js`; `tools/showcase-library/` (except `game-visual-qa.mjs`), `tools/quality-rebuild-capture/route-composition.mjs`, `tools/public-api-contract/`; `docs/project/aura3d-quality-rebuild/migration/` |
| **10** World | `packages/rendering/src/world/`, `EnvironmentPreset.ts`, `EnvironmentPresetPack.ts`, `OceanSurface.ts`, `SpaceEnvironment.ts`, `Terrain*.ts`, `VegetationScatter.ts`, `WaterSurface.ts`; `packages/engine/src/agent-api/world/`, `agent-api/{Scatter,LayeredSceneComposition}.ts`, `agent-api/compiler/world.ts`, `agent-api/nodes/{instances,water,environments.world}.ts`, `agent-api/nodes/prefabs/cityBlock.ts`, `production-runtime/world/`; `packages/engine/assets/world/`; `packages/environments/src/BiomeEnvironmentRegistry.ts`; `packages/physics-rapier/src/HeightfieldLayout.ts`; `fixtures/three-compat/environments/`; `tools/{impostor-bake,world-content-bake}/` |
| **11** GPU/tiers | `packages/rendering/src/{quality,batching,webgpu}/` (except `WebGPUPostShaders.ts`), `renderer/{CullingBatching,RendererFactory,DeviceLifecycle}.ts`, `forward/DrawSubmit.ts`, `webgl2/{Probe,Counters,ContextLifecycle,MultiDraw}.ts`, `program/UniformLayout.ts`, `program/chunks/*.wgsl.ts`, `program/chunks/manifest.ts`, `resources/{ResourceRegistry,RenderTargetPool}.ts`, `performance/{BVH,Batcher,FrustumCuller}.ts`, `production-runtime/backends/`, `production-runtime/shaders/wgsl/`, `production-runtime/ProductionWebGPURenderer.ts`, `RenderDevice.ts`, `WebGPUDevice.ts`, `RenderBackend.ts`, `RendererTiming.ts`, `MockRenderDevice.ts`; `packages/materials/src/NodeMaterial.ts`; `packages/engine/src/production-runtime/GameRenderPreset.ts`, `agent-api/RootPerformanceQuality.ts`, `agent-api/app/rendererOptions.ts`, `agent-api/devtools/sceneKitBudgets.ts`; `apps/{webgpu-lab,wow-webgpu-instancing}/`; `tools/{perf-gate,wgsl-validate,bundle-size,production-runtime-template-readiness,production-runtime-package-surface-readiness}/` (except `bundle-size/lit-scene.ts`); `scripts/migrations/prd11-*`; `docs/rendering/webgpu-*` |
| **12** Bench/gates | `.gitlab-ci.yml`, `.github/workflows/qr-gitlab-ci.yml`, `docs/project/aura3d-quality-rebuild/CI-ROUTING.md`; `benchmarks/` default, incl. all of `benchmarks/quality-rebuild/` except lane scene dirs and `motion/`, plus `benchmarks/three-compat/` and `benchmarks/production-runtime/`; `tools/quality-rebuild-capture/` (except `games.json`, `route-composition.mjs`, `steps/burst.mjs`); `tools/quality-gate/` (except `src/scorecard.ts`, `forms/`); `tools/{_quarantine,compare-engines,visual-baseline,premium-indie-reference,production-runtime-report-bridge,production-runtime-threejs-parity}/`, `tools/{head-to-head,superiority,three-compat,muse3jsparity,external-parity,threejs-parity}-*`, `tools/showcase-library/game-visual-qa.mjs`; `apps/threejs-parity-lab/`; `.github/workflows/` default (`quality-*`, `browser-matrix`, `release`, `muse301-*`, `external-parity-*`, `remote-browser-301`, `native-*-301`); `playwright*.config.ts` (except animation matrix); `.gitattributes`; `AURA3D-VERIFICATION-MATRIX.md`; `docs/project/{claim-guidelines.md,parity/,threejs-superiority-status.md}`; `docs/project/aura3d-quality-rebuild/` default (`research/`, `_sections/`, `evidence/` not lane-specific) |
| **13** Agent authoring | `packages/create-aura3d/` (all: `templates/**` incl. `three-compat-*`, `character-hero`, `arena-shooter`, `*/aura.assets.json`; `skills/**`; `src/`; `package.json`); root `templates/`, `examples/`; `packages/aura3d-cli/skills/**`, `packages/aura3d-cli/src/look/`; `packages/engine/src/agent-api/{looks,prompt}/`, `agent-api/nodes/prompt/`; `benchmarks/agent-eval/`; `tools/agent-*/`; `llms.txt`; `docs/agents/`, `docs/guides/`; `.github/skills`, `.claude/skills`, `.cursor/skills`, `.agents/skills`; `.github/workflows/{agent-output-eval,template-lookdev}.yml` |
| **14** Games | `apps/showcase-*/` (every showcase app incl. `showcase-index`, `showcase-webgpu-particle-lab`, `showcase-cinematic-architecture`), `apps/aura-clash-showcase/`, `apps/world-war-x-showcase/`; `packages/game/src/art/`; `tools/quality-rebuild-capture/games.json`; `tools/quality-gate/src/scorecard.ts`, `tools/quality-gate/forms/`; `scripts/{check-art-direction,check-route-health}.mjs`; `docs/project/aura3d-quality-rebuild/evidence/games-after/` |
| **15** Architecture / custodian | All `contracts/` folders (`packages/{rendering,engine,assets,animation,audio,aura3d-cli}/src/contracts/`), all `src/lanes/index.ts`, `packages/engine/src/agent-api/index.ts` and `agent-api/` default (incl. `RuntimeNodeHandle.ts`, `RootRuntimeSupport.ts`, `lean*.ts`, `SceneGroundingUtils.ts`), `agent-api/{app,compiler,nodes,devtools}/` defaults, `production-runtime/` default (engine and rendering: `ProductionRuntimeRenderer.ts`, `ProductionWebGL2Renderer.ts`, `ProductionEffectsPipeline.ts`, `framegraph/`, both `index.ts`), `production-runtime/actor/extensions.ts`, `packages/engine/` default (`index.ts`, `public/`, `advanced-runtime/`, `threejs-example-parity/`, `package.json`); `packages/rendering/src/{lean*,advanced-runtime,threejs-example-parity,diagnostics}`, `LeanWebGL2Device.ts`, `performance/` default, `cinematic/CinematicMaterialPresets.ts`, `animation/AnimationMaterialStyle.ts`, the orphans `{RendererVisualPipelineReport,PrimitiveSubmissionAudit,ReflectionSurfaces,VoxelWorld,ScreenSpaceReflectionPass,UniformBinder,MaterialPresets,ArchitecturalMaterialCatalog}.ts`, `index.ts`, `package.json`; `packages/assets/src/{asset-corpus/ (default),AdvancedAssetCorpus.ts}`; `packages/{lean,three-compat,editor,editor-runtime,environments (default),materials (default),math (default),scene (default),physics (default)}/`, `packages/input/src/controls/`, and every unlisted package; `packages/aura3d-cli/src/{migrate-three,codemods}/`, `src/commands/registry.ts`; `apps/` default (incl. `apps/public-scene`); root `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, `tsconfig*.json`, `vite.config.ts`, `vite.aliases.generated.ts`, `aura.exports.json`, `eslint.config.js`, `eslint/qr/` default; `README.md`, `BUNDLE_SIZES.md`, `MIGRATION-2.0.md`, `docs/` default (`docs/architecture/`, `docs/project/migration.md`); `docs/project/aura3d-quality-rebuild/{CONTRACTS.md,AURA3D-QUALITY-MASTER-PLAN.md}`; `scripts/` default; `public/` default; `fixtures/` default; `tools/` default (`arch-gates`, `generate-resolution-maps`, `packed-consumer-check`, `script-prune`, `finalize-dist`, `verify-*`, `qr-ownership`, `bundle-size/lit-scene.ts`); `.github/{QR_OWNERSHIP.json,workflows/qr-contracts.yml,workflows/ci.yml,workflows/test.yml}` |
| **lane NN** | `docs/project/aura3d-quality-rebuild/PRD-NN-*.md`, `…/evidence/prdNN/` and `…/evidence/prd-NN/`; `packages/*/src/lanes/prdNN.ts`; `agent-api/compiler/diagnosticOnly.prdNN.ts`; `packages/aura3d-cli/src/commands/prdNN/`; `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prdNN/`; `.github/workflows/qr-prdNN-*.yml`; `tests/qr/prdNN/`; `tests/unit/contracts/impl/prdNN-*` |
| **creator** | `tests/**` not matched above. A new test file belongs to the lane that adds it. An existing test belongs to the owner of the first `packages/**` module it imports, with ties going to 15. Explicit cases: `tests/unit/engine/game-feel.test.ts` → 08; `tests/unit/agent-api-root-performance-quality.test.ts` and `tests/unit/muse3jsparity-root-governor-contract.test.ts` → 11; the 141 source-substring tests named by PRD 12 → 12 (deletion). |

### 4.2 Hot shared files: resolution of every file the conflict map lists as touched by more than one PRD

Contributors who are not the owner change these files only through the named seam or by request (§6.5).

| File | Touched by (PRD) | Owner | How the others contribute |
|---|---|---|---|
| `packages/engine/src/agent-api/index.ts` | 01,02,03,04,05,06,07,08,09,10,11,13,15 | 15 | §3.2 carve-outs; types pre-declared in PR 0a |
| `packages/engine/src/agent-api/LayeredSceneComposition.ts` | 01,07,10 | 10 | C-06, C-21 |
| `packages/engine/src/agent-api/RootRuntimeSupport.ts` | 01,02,03,11,15 | 15 | lanes add their own files (e.g. `resolveLightingTier` in `compiler/lights.ts`) |
| `packages/engine/src/agent-api/GameAppRuntime.ts` | 01,08,09,11 | 09 | C-05, C-23, C-27 |
| `packages/engine/src/production-runtime/GameRenderPreset.ts` | 01,02,03,11 | 11 | 01/02/03 read C-27 settings |
| `packages/rendering/src/RenderDevice.ts` | 01,02,03,06,11 | 11 | optional members pre-declared (C-04, C-13, C-18, C-28) |
| `packages/rendering/src/WebGL2Device.ts` | 01,02,03,04,05,06,09,11,15 | 01 | §3.4 carve-outs; 09 via C-05; 15 Lean bug-fix port as request |
| `packages/rendering/src/WebGL2StateCache.ts` | 01,11 | 01 | C-04 `renderStateKey` |
| `packages/rendering/src/ForwardPass.ts` | 01,02,03,04,06,10,11 | 01 | §3.3 carve-outs; 04 via C-01 `transmission`; 10 via C-02, C-07 |
| `packages/rendering/src/Renderer.ts` | 01,02,03,06,07,11,15 | 01 | §3.5 carve-outs; 07 via C-01; 15 via C-29 |
| `packages/rendering/src/RendererPostprocessPlan.ts` | 01,03 | 03 | PRD 01's HDR plan rule is C-13 semantics |
| `packages/rendering/src/ShaderChunks.ts`, `ShaderLibraryCore.ts`, `ShaderLibrary.ts` | 01,02,03,04,05,06,07,08,15 | 01 | frozen legacy (§3.7); features via C-02, C-03, C-11, C-18 |
| `packages/rendering/src/{PBRMaterial,TexturedPBRMaterial,InstancedPBRMaterial}.ts` | 01,04 | 04 | 01 via C-03 `ProgramFeatureSource` |
| `packages/rendering/src/SkinnedLitMaterial.ts` | 01,04,06 | 04 | 06 via C-18 deform chunks |
| `packages/rendering/src/SceneOptimization.ts` | 01,02,03 | 01 | requests |
| `packages/rendering/src/PostProcessPass.ts` | 01,03,07 | 03 | C-13 |
| `packages/rendering/src/BRDFLut.ts` | 01,04 | 01 | R4 |
| `packages/rendering/src/MorphTargetPlan.ts` | 01,06 | 06 | R5 |
| `packages/rendering/src/WebGPUDevice.ts` | 01,02,03,04,05,06,08,09,10,11 | 11 | WGSL twins on C-02 chunks; C-16 compressed upload request |
| `packages/rendering/src/WaterSurface.ts` | 01,10 | 10 | — |
| `packages/rendering/src/ShadowPass.ts` | 01,02,06 | 02 | C-11 depth features |
| `packages/rendering/src/LeanWebGL2Device.ts` | 01,02,03,06,15 | 15 | deletion/port; requests |
| `packages/rendering/src/production-runtime/shaders/chunks/` | 01,04 | 01 | C-03 |
| `packages/rendering/src/production-runtime/shaders/wgsl/pbr.wgsl` | 01,04,15 | 11 | WGSL; chunk requests |
| `packages/rendering/src/production-runtime/materials/{MaterialCompiler,GLTFMaterialAdapter,PBRShaderFeatures}.ts` | 01,04 | 04 | C-03 |
| `packages/rendering/src/production-runtime/ProductionRuntimeRenderer.ts` | 01,11,15 | 15 | backend selection moves to `renderer/RendererFactory.ts` (11, C-29) |
| `packages/rendering/src/production-runtime/ProductionWebGPURenderer.ts` | 11,15 | 11 | — |
| `packages/assets/src/GLTFRenderResources.ts` | 01,04,05 | 04 | §3.6 carve-out to 05; 01 via C-04 |
| `packages/lean/src/base.ts`, `packages/lean/src/game.ts` | 01,08,15 | 15 | requests (lean → engine shim) |
| `benchmarks/quality-rebuild/shared/scenes.ts` | 01,02,03,04,06,07,10,11,12 | 12 | lane scenes in `scenes/prdNN/` (C-30) |
| `benchmarks/quality-rebuild/aura3d/`, `aura3d/common.ts` | 01,03,07,10,12,15 | 12 | lane adapters in `aura3d/scenes/prdNN/`; helper requests |
| `benchmarks/quality-rebuild/three/common.ts` | 07,10,12 | 12 | `three/scenes/prdNN/` |
| `benchmarks/quality-rebuild/shared/{assets,types,procedural}.ts`, `ci.sh` | 04,05,06,10,11,12 | 12 | `scenes/prdNN/assets.ts`; C-30; LFS list requests |
| `benchmarks/quality-rebuild/capture.mjs` | 01,02,11,12 | 12 | metric plugins (C-33) |
| `tools/quality-rebuild-capture/capture-games.mjs` | 01,02,06,11,12,14 | 12 | `steps/*.mjs` plugins (C-33) |
| `tools/quality-rebuild-capture/games.json` | 02,06,09,11,12,14 | 14 | schema owned by 12 (R22) |
| `.github/workflows/quality-rebuild-capture.yml` | 01,02,04,09,11,12,14,15 | 12 | `qr_flags`/`strict` inputs |
| `.gitlab-ci.yml`, `.github/workflows/qr-gitlab-ci.yml` | 12, 15 | 12 | new suites via `QR_SUITE` values (CCR-free additions by 12; others send `qr-request`) |
| `.github/workflows/browser-matrix.yml` | 05,06,07,08,12 | 12 | lanes add `qr-prdNN-*.yml` |
| `packages/rendering/src/DepthPass.ts` | 02,06,10 | 02 | C-11 `registerDepthVariantFeature` |
| `packages/rendering/src/Sampler.ts` | 02,04 | 04 | C-12 fields pre-declared |
| `packages/rendering/src/EnvironmentBackgroundPass.ts` | 02,07 | 02 | 07 sky via C-21 / C-01 `background` |
| `packages/rendering/src/EnvironmentPlatform.ts` | 02,07,10 | 02 | C-09 sources |
| `packages/rendering/src/production-runtime/PBRHDRPipeline.ts` | 02,15 | 02 | PRD 15's move to `environment/hdrEnvironment.ts` is executed by 02 on request |
| `packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts` | 02,10 | 02 | 10 via `BiomeEnvironmentRegistry.ts` |
| `packages/assets/src/loaders/KTX2Loader.ts` | 02,04,05 | 05 | C-16 |
| `packages/rendering/src/TemporalHistory.ts` | 03,06,08 | 03 | C-14 |
| `packages/rendering/src/VolumetricFog.ts` | 03,07 | 07 | C-13 post pass registration |
| `packages/rendering/src/index.ts`, `packages/engine/src/production-runtime/index.ts` | 03,04,07,10,11,15 | 15 | lane barrels |
| `packages/assets/src/{KTX2BasisTextureTranscoder,GLTFCompressionDecoders}.ts` | 04,05 | 05 | C-16 |
| `packages/assets/src/GLTFExtensionSupport.ts` | 04,05 | 04 | generated matrix |
| `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts` | 04,05 | 04 | C-16 decoders option |
| `packages/engine/src/production-runtime/TypedGLBActor.ts` | 04,05,06 | 04 | §3.6 extension hook |
| `apps/wow-webgpu-product-viewer/src/main.ts` | 04,11 | 04 | request |
| `packages/aura3d-cli/src/{index,cli,cli-help,asset-manifest}.ts` | 05,06,08,10,13,15 | 05 | C-39 registry; C-17 fields |
| `packages/aura3d-cli/skills/{aura3d-materials-environments,aura3d-browser-game}/SKILL.md` | 05,08,13 | 13 | C-40 |
| `packages/rendering/src/Texture.ts` | 05,06 | 06 | 05's format union pre-declared in PR 0a |
| `package.json` (root) | 05,06,09,12,14 | 15 | §4.4 |
| `aura.assets.json` | 05,14 | 05 | §4.3 generated-file rule |
| `packages/animation/src/AnimationController.ts` | 06,15 | 06 | — |
| `packages/create-aura3d/templates/{fighting-game,character-controller,racing-starter,falling-blocks-starter}/src/main.ts` | 06,08,13 | 13 | R20 |
| `apps/showcase-*/src/main.ts` (skyline-runner, turbo-drift-circuit, gallery-shift, rooftop-buckets, neon-swarm, mech-hangar, bank-shot, blockfall-reactor, vault-breakers, siege-golf, courier-rush), `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts` | 01,03,04,06,08,11,14 | 14 | R21 codemods/reports |
| `packages/rendering/src/effects/ResidentGPUParticleRenderer.ts` | 07,11 | 07 | request |
| `packages/engine/src/agent-api/GameRuntime.ts` | 07,08 | 08 | effects regions carved to `agent-api/vfx/gameEffects.ts` (07) |
| `packages/engine/src/agent-api/GameFeel.ts` | 07,08 | 08 | 07 auto-mount via C-20 |
| `packages/engine/src/agent-api/Decals.ts` | 07,15 | 07 | — |
| `packages/engine/src/production-runtime/RootGpuParticleWorkload.ts` | 07,11 | 07 | delete |
| `tests/unit/engine/game-feel.test.ts` | 07,08 | 08 | 07 adds `tests/qr/prd07/` cases |
| `packages/engine/src/agent-api/FrameLoop.ts` | 08,09 | 08 | R15 |
| `packages/engine/src/game/GameAudio.ts`, `packages/audio/src/{PositionalEmitter,AudioSource}.ts` | 08,09 | 09 | R17 |
| `apps/common/src/rapier-physics-proof.ts` | 08,09 | 09 | — |

### 4.3 Generated-file rule

These files are written only by their generator:
- `aura.assets.json` and `LICENSE-THIRD-PARTY` (generator owned by 05).
- `pnpm-lock.yaml`, `tsconfig.paths.generated.json`, `vite.aliases.generated.ts` and
  `tools/finalize-dist/manifest.generated.json` (15).
- `GLTF_EXTENSION_SUPPORT_MATRIX` (04).

Any lane may commit a regenerated diff for entries it owns, such as its own asset ids, provided CI re-runs the
generator with `--check` and gets an identical result.

### 4.4 Root manifest batch

Root `package.json` belongs to 15.
- A lane needing a dependency adds it to its own workspace package's `package.json` (`packages/*`, `tools/*` with
  its own manifest, `apps/*`), with an exact version.
- Root-level changes, such as new root scripts or root devDependencies, go in a `root-manifest` request. PRD 15
  merges these in a daily batch PR.
- Lanes can run their tools through their package's scripts, so no lane waits on the batch.

---

## 5. Feature flags

### 5.1 Names

The scheme is `A3D_QR_<AREA>` for a lane flag and `A3D_QR_<AREA>_<SUB>` for a sub-flag. Each flag has exactly one
owning lane. PRD-local switch names are kept as aliases so PRD text stays valid.

| Flag | Owner | Values | Sub-flags | PRD-local alias |
|---|---|---|---|---|
| `A3D_QR_CORE` | 01 | `off` \| `v2` | `A3D_QR_CORE_OUTPUT`, `A3D_QR_CORE_GENERATOR` | `renderer.core: 'v1'\|'v2'`, benchmark `?core=v1\|v2` |
| `A3D_QR_LIGHTING` | 02 | bool | `_CSM`, `_PROBES`, `_CONTACT` | `lighting.model: 'physical'\|'legacy-3.0'`, `?aura-lighting=` |
| `A3D_QR_POST` | 03 | bool | `_TAA`, `_SSR`, `_AO`, `_DOF` | `RendererPostProcessOptions.pipeline: 'v2'\|'legacy'`, `compat.post: '3.0'` |
| `A3D_QR_MATERIALS` | 04 | bool | `_TRANSMISSION`, `_KTX2` | `materialModel: 'legacy'\|'physical-r185'` |
| `A3D_QR_ASSETS` | 05 | bool | `_LOD`, `_DECODERS` | `assets.variant: 'optimized'\|'source'` |
| `A3D_QR_ANIMATION` | 06 | bool | `_POSE_MIXER`, `_GPU_MORPH`, `_SKINNED_SHADOWS` | `animation.mixer: 'pose'\|'legacy'`, `defaults: '3.0'\|'3.1'` |
| `A3D_QR_VFX` | 07 | bool | `_SKY`, `_FOG`, `_VOLUMETRIC`, `_DECALS` | `renderer.vfx: 'v1'\|'v2'`, `vfxOverrides` |
| `A3D_QR_CAMERA` | 08 | bool | `_LOOP`, `_INTERPOLATION` | `camera.legacy` (inverse) |
| `A3D_QR_GAME` | 09 | bool | `_SOUND`, `_SHELL` | — |
| `A3D_QR_WORLD` | 10 | bool | `_TERRAIN`, `_WATER`, `_BIOME` | — |
| `A3D_QR_TIERS` | 11 | bool | `_GOVERNOR`, `_BATCHING` | `qualityProfile` (deprecated mapping) |
| `A3D_QR_WEBGPU` | 11 | bool | — | `backend: 'webgpu-experimental'` |
| `A3D_QR_LOOKS` | 13 | bool | `_EXPANSION` (`v0`\|`v1`\|`auto`), `_PROMPT_STRICT` | `A3D_LOOK_EXPANSION`, `A3D_PROMPT_PLAN_STRICT` |
| `A3D_QR_COMPILER` | 15 | bool | — | — |
| `A3D_QR_STRICT` | 15 | bool | — | `strict` option, capture `aura-strict=1` |
| `A3D_QR_ROUTE_<ROUTE_ID>` | 14 | bool | — | rebuilt route vs current route, e.g. `A3D_QR_ROUTE_TURBO_DRIFT_CIRCUIT` |

PRD 12 runs no runtime flags. Its tooling changes ship directly behind CLI options.

### 5.2 Resolution

`resolveQrFlags` (§1.1) resolves sources in this order. The first source that sets a flag wins.
1. Explicit `createAuraApp/createGameApp/createGame({ qualityRebuild: { flags } })`.
2. URL `?a3d-qr=<list>`, where `<list>` is `all`, `none`, or a comma list of short names (`core`, `lighting`, …), with
   `-name` to exclude and `name=value` for valued flags. It is ignored when `allowUrlFlags: false`.
3. Environment `A3D_QR=<list>` (Node, CI) or build-time `import.meta.env.VITE_A3D_QR`.
4. The per-flag `A3D_QR_<AREA>=1|0|value`.
5. The registry default (§5.3 state).

`diagnostics().qrFlags` and `ReadyPayloadV2.qrFlags` always report the resolved set.

### 5.3 States and defaults

Each flag moves through these states. The state is recorded in `packages/rendering/src/contracts/flags.state.ts`.
That file is custodian-owned. State changes are made only at checkpoints (§7), by the PRD 15 lane, from the
checkpoint record.

| State | Default | Who may turn it on |
|---|---|---|
| `dev` | off | tests, lane benchmarks, any capture with explicit flags |
| `standalone-accepted` | off | the above, plus PRD 14 routes and PRD 13 templates behind explicit opt-in |
| `integrated-accepted` | **on** for new apps/templates; off for existing routes unless opted in | everyone |
| `default-on` | on everywhere; `-name` opts out (deprecated) | everyone |
| `removed` | flag ignored; setting it logs `QR_FLAG_REMOVED:<name>` | — |

- A flag moves to `standalone-accepted` when its lane's standalone acceptance passes in that lane's own CI.
- It moves to `integrated-accepted` when its integrated acceptance criteria (§8) pass at a G-PANEL checkpoint.
- It moves to `default-on` after two consecutive checkpoints with no attributed regression.

### 5.4 Opt-in and removal

- **Games** (PRD 14) opt in per route in their own source (`createGame({ qualityRebuild: { flags: [...] } })`). Each
  route's `games.json` entry carries the same list in `qrFlags`, so captures run with identical flags. Every
  checkpoint also captures each route with `all` and `none`.
- **Templates** (PRD 13) may opt into flags in `standalone-accepted` state or later. `integrated-accepted` flags are
  picked up automatically through the default.
- **Benchmarks.** Each scene's `qrFlags` sets its default. The capture `--flags` option overrides it.
- **Removal.** When a flag has been `default-on` for two checkpoints, its owner removes the off path in one PR:
  - The legacy code is deleted. For `A3D_QR_CORE` this includes the frozen legacy shader programs (§3.7).
  - The slot's `get()` ignores the flag. The stub remains only as a test double.
  - The name is added to `REMOVED_QR_FLAGS`.
  - PRD 15's arch gate `no-qr-flags` fails the release build if any non-removed `A3D_QR_*` flag remains at program
    end.
- **Combinatorics are bounded on purpose.**
  - CI runs conformance with flags `none`, `all`, and each single lane flag on (15 configurations).
  - Weekly checkpoints run `none` and `all`.
  - Monthly G-PANEL checkpoints add leave-one-out (`all,-<lane>`) for attribution.
  - No other combinations are supported or claimed.

---

## 6. Merge protocol

### 6.1 Every lane merges to main at any time, behind its flag

- **Required checks on every PR:**
  - `qr-contracts.yml`: typecheck, lint, unit tests including all conformance suites, and the ownership check.
  - The existing `ci.yml` / `test.yml`.
- **Additional check** for PRs touching `packages/rendering/**` or `packages/engine/**`: browser conformance plus a
  **flag-off sentinel identity check**. That check captures 6 sentinel benchmark scenes, listed in
  `benchmarks/quality-rebuild/sentinels.json` (PRD 12, PR 0a), remotely with `qr_flags=none` and compares them with
  the last GitHub macos-14 main capture using the GitHub sentinel noise floor (two macos-14 runs of one main commit; `CI-ROUTING.md`). The GitLab IC-0 floor never applies to GitHub frames.
- **Trunk stays green.** A PR that turns main red is reverted at once by anyone. Reverts are exempt from the
  ownership check. The owning lane re-lands the change.
- **No PR changes flag-off behaviour.** The exceptions are correctness bug fixes declared in the PR (R18 is one) and
  removals in §5.4. A declared fix triggers a re-baseline of the affected scenes by PRD 12.

### 6.2 Dependencies only through contracts

- A lane imports another lane's code only through `contracts/` modules or a package's public entry points. The
  contract-defined public builder namespaces count as public entry points.
- PRD 15's arch gate `qr-no-cross-lane-import`, added in PR 0a as a warning and made an error at IC-1, fails an
  import of a non-contract module owned by another lane.
- Lanes rebase only against main. Because they touch only their own files and the frozen contracts, rebases do not
  conflict. Appendix B appends merge as concatenation.

### 6.3 Swapping stub for real

The provider's PR includes:
- `slot.provide(real)` in its lane barrel.
- A green conformance run for `real`.
- Its own tests.

With the flag off, nothing changes for anyone. Consumers never change code to swap.

### 6.4 Contract Change Requests (CCR)

- A CCR is a PR labelled `ccr` that edits `contracts/` files. It needs approval from PRD 15 (custodian), the
  provider, and one listed consumer, and is merged within one working day.
- Allowed: optional fields, new union members that consumers can ignore, new registry entry kinds, and concrete types
  replacing `unknown` placeholders.
- Breaking changes are not allowed. They become a new versioned contract (`C-NNv2`) alongside the old one, which
  keeps its stub until every consumer migrates.
- Appendix B (C-40) rows and status edits to a lane's own rows are the only edits a non-custodian lane makes to this
  file. They need no CCR.

### 6.5 Requests to other lanes (non-blocking)

- A lane needing a change in a file it does not own opens an issue labelled `qr-request` and `to:prdNN`. The issue
  states the file, the exact change, and the contract it serves.
- The owner handles it within 2 working days, or declines with a reason.
- The requester never waits. It keeps working against the stub or in its own files, and any integrated result that
  depends on the request is evaluated at the next checkpoint after it lands.
- Unresolved requests are listed in each checkpoint report.

---

## 7. Integration checkpoints (non-blocking)

| Checkpoint | Date (UTC) | Purpose |
|---|---|---|
| IC-0 | 2026-10-08 | PR 0 identity: flags `none` vs `85aafcd0`. This is the program's measured baseline. It should reproduce research 23 (vision-judged benchmark: Aura 1-4.5, mean 3.6, vs three r185 4-7, mean 5.4) and research 21 (games overall 1.5-4/10, mean 3.0). The 6.5-8.5 three.js figures in research 22 come from the blind pass-1 judges and are not a baseline. |
| IC-1 … IC-n | every Thursday from 2026-10-15 (IC-1), 2026-10-22 (IC-2), 2026-10-29 (IC-3), 2026-11-05 (IC-4), … | weekly integrated run |
| G-PANEL rounds | IC-4, IC-8, IC-12, … (every 4th) | human plus vision panel; the only rounds that can accept |

**Each checkpoint run**, dispatched by PRD 12 on the main HEAD at 00:00 UTC Thursday:
1. `.github/workflows/qr-gitlab-ci.yml` (GitLab macOS, `CI-ROUTING.md`), with suite `all` and both `qr_flags=all` and `qr_flags=none`. `qr_flags` other than `none` is refused by the bridge until C-33 (PR 0b-3) adds `--flags` to the capture tools; until then checkpoints capture `none` only and say so. The GitHub fallback is `quality-rebuild-capture.yml`. A checkpoint is captured entirely on one provider. It covers:
   - Every `active` C-30 registry scene in both engines (the 18 base scenes plus lane scenes).
   - All 18 games on the desktop and mobile viewports from `games.json`.
   - Each route also with its own `qrFlags`.
2. PRD 12 metrics (`tools/quality-gate/metrics/metrics.py`): FLIP, SSIM, LPIPS, ΔE2000, region masks, broken-control
   discrimination.
3. A vision screening judgement per scene and per game through `judgeWithPrism` (C-32). This is screening only.
4. On G-PANEL rounds: 2 human judges plus 1 vision model per PRD 12, with leave-one-out captures for attribution.
5. Performance, measured per tier on the same runner: p50/p95 frame ms, draw calls, readbacks (C-28).

**Combined score.** It is written to `benchmarks/quality-rebuild/history/rounds/IC-<k>.json` as a
`PanelRoundRecord` and appended to `history/index.jsonl`. It contains:
- Per-scene Aura and three medians, and their gap.
- Per-game overall and the 27 visual categories, plus the 6 non-visual categories.
- The flags-all minus flags-none delta per scene and per game.
- Per-lane attribution (on G-PANEL rounds, from leave-one-out).
- Performance per tier.
- Open `qr-request` issues.

**What a checkpoint decides:**
- **Integrated acceptance (§8) is evaluated only here.** A lane's integrated criterion passes when the G-PANEL
  median meets it with the lane's flag on in `all`.
- Flag state transitions (§5.3).
- **Failures do not block.** A regression, a crash, or a missed integrated target is filed as a `qr-ic-regression`
  issue against the owning lane, determined by leave-one-out or by the diagnostics attribution of the failing
  section. That lane's flag is not promoted, and nothing else happens.
- If the `all` run crashes, PRD 12 re-runs it the same day with the crashing lane excluded (`all,-<lane>`), so every
  other lane still gets scored.
- No lane's merges are held because of a checkpoint result.

**Honesty rule.** These do not support a claim that Aura3D matches three.js:
- conformance tests
- engineering gates
- vision-only screening rounds
- metric thresholds

A parity claim needs a G-PANEL round in which the scene's or game's median Aura score is within the stated margin of
the three r185 reference under the same capture conditions. The rubric version and capture run id are cited.

---

## 8. Soft-dependency table

"Standalone" means provable by the lane alone with the current renderer plus its own flag, using stubs for
everything else. It gates the lane's own merges and the `standalone-accepted` state. "Integrated" means it depends on
other lanes' real implementations and is evaluated only at checkpoints (§7).

| PRD | Integrated acceptance that depends on other lanes (contracts) | What the PRD proves standalone |
|---|---|---|
| 01 Core | Benchmark PBR/IBL/shadow scenes approaching the three reference need 02 (C-09, C-11), 03 (C-13) and 04 (C-03). Game visual uplift needs 14. | `A3D_QR_CORE=v2` renders every base scene with no G-REG regression vs legacy. It also proves: one tone map and one sRGB encode (exposure ramp scene); RGBA16F target with degraded fallback reported; blend-mode, specular-AA and primitive-catalog scenes; scene-graph orders; instance composition order; ProgramCache warm-up with 0 compiles after ready (C-28 counters). |
| 02 Lighting | Visible chunk-based IBL/CSM on generated programs needs 01 (C-02). Sky-driven IBL needs 07 (C-21). Biome-driven environments need 10 (C-26). SSR placement needs 03 (C-13). | Through its own carve-outs it proves: ambient additive to IBL on the production path (`compiler/environment.ts`), the defect verified in 15 of 18 games; directional shadow strength 1.0 and caster variants (`forward/Lighting.ts`, `DepthPass.ts`); PMREM/SH correctness; neutral-room fallback; physical light units; lighting scenes vs three with the flag on. |
| 03 Post | TAA/motion blur on skinned characters needs 06 (C-14/C-18). The particle reactive mask needs 07. Cut handling with real rigs needs 08 (C-22). Full linear-HDR input everywhere needs 01 (C-05). | The post graph runs on today's forward target, which is already RGBA16F when post is active (`defaultPostprocessTargetFormat`). It proves bloom with a real threshold, GTAO, SMAA/FXAA/TAA on static scenes, grading/LUT, auto-exposure, zero readbacks, and the post benchmark scenes. |
| 04 Materials | Physical lobes (clearcoat, sheen, iridescence, anisotropy, transmission) visible on production draws need 01 (C-02). IBL-correct lobes need 02 (C-09). | Material overrides that preserve textures, which fixes the `replaceSurfaceTextures: true` tint bridge, plus samplers and anisotropy by tier, MikkTSpace tangents, the generated extension matrix and the glTF fidelity fixtures. Lobe chunks are validated against CPU references in ChunkHarness. |
| 05 Assets | LOD cross-fade dither on generated programs needs 01 (C-02). Asset-driven game uplift needs 14. | The optimize pipeline, admission gates G1-G11, local decoders (no CDN), the KTX2 target table, tier budget measurements, the look-dev viewer with Aura and three adapters, the HDRI library (≥6 at 2k) and the curated kits. |
| 06 Animation | Unified skinned PBR needs 01. Skinned/morph shadows on the real ShadowSystem need 02 (C-11). TAA ghosting needs 03 (C-14). Foot IK on terrain needs 10 (C-26). | PoseMixer and inertialization correctness via MotionMetrics (transition continuity, foot slide, limb flips), `tracksApplied > 0` on the visible actor, GPU deform equal to the CPU reference, sockets, retargeting, and the character-hero acceptance bar on the current renderer. |
| 07 VFX | Soft particles and correct transparent interleave need 01 (C-01 split, scene depth). Sky→IBL capture needs 02 (C-09). God rays and volumetric composite need 03 (C-13). Tier caps need 11 (C-27). Bone-socket trails need 06 (C-19). | The particle pass draws pixels: benchmark 14-particles scores 1/10 today, and `EFFECT_ZERO_PIXELS` must be eliminated. It also proves flipbooks, additive with premultiplied fallback, Preetham/gradient sky background, height fog on the production path via `compiler/fog.ts`, effects auto-mount, and impact library kinds. |
| 08 Camera | Camera cuts without TAA smear need 03 (C-14). Feel channels executing real VFX, audio and post need 07, 09 and 03. Adoption in games needs 14. | Rigs, springs, layers, rails, fixed-step with interpolation, hit-stop/slow-mo, motion scenes M1-M6 metric thresholds, the vehicle bicycle model, and touch input primitives. |
| 09 Game runtime | The `particle-pass` fx backend needs 07 (C-20). Look-backed games need 13. Game visual targets need 14 plus the engine lanes. | `createGame` shell and session state machine, sound engine with licensed assets (no synthesized defaults), HUD within screen fraction, capture contract with 0 route capture branches, the beacon, and the non-visual `sound_audio` and `loading_transitions` categories on migrated routes. |
| 10 World | Production-quality terrain, foliage and water materials need 01 (C-02) and 04 (C-03). Biome IBL needs 02 (C-09). Sky and fog need 07 (C-21). Post presets need 03 (C-13). Content needs 05 (C-17). Instancing and tiers need 11 (C-27). | Heightfield queries and colliders, deterministic scatter (checksums), CDLOD selection, biome rig descriptions, ground raycaster, and world scenes rendered on the current renderer. Those renders are reported, but they are not claimed as quality. |
| 11 GPU/tiers | Per-tier budgets on rebuilt games need 14 and the full feature set from all lanes. | Tier table, device probe, governor stability, measured fps (not a constant 60), device counters, batching pixel identity with draw-call reduction (draw-call-stress, instancing-100k), context-loss restore, and WebGPU parity on contract scenes. |
| 12 Bench/gates | None. It measures other lanes. | Masks, calibration, goldens, broken-control discrimination, three showcase references, panel pipeline, remote capture reproducibility (IC-0 noise floor). |
| 13 Authoring | The look v1 expansion needs 01, 02, 03, 10 and 11 real. The template `characterExpected` floor needs 06. Game templates on `createGame` need 09. | The looks v0 expansion, lookLint with all registered rules, prompt plan v2, template look-floor static checks, the agent-eval harness (P01-P12), and skills written from verified C-40 facts. |
| 14 Games | Game visual targets (`minOverall` 7, `minVisualCategory` 5) need 01, 02, 03, 04 and 07. Character games also need 06. World-heavy games need 10. Camera feel needs 08. Sound and feel non-visual targets need 09. | With the current renderer plus flags: asset replacement from admitted kits, camera framing (stub rigs or route code), HUD, composition, art-direction contracts with audits passing, removal of ambient-only lighting and capture branches, `games.json` V2. These are scored at checkpoints with flags `none` and with route flags. |
| 15 Architecture | None for its gates. Final single-renderer deletion waits for each owning lane's flag removal, which is non-blocking: until then the gate runs in report mode. | Compiler byte-equal RenderSource on the base snapshots, arch gates, the export manifest and resolution maps, packed-consumer check, lean shim, script prune, option coverage. |

---

## 9. Appendices

### Appendix A. Map from PRD-proposed IDs to catalog IDs

| PRD-proposed | Catalog | PRD-proposed | Catalog |
|---|---|---|---|
| C-07-IN-1 | C-04 | C-07-OUT-1 | C-20 |
| C-07-IN-2 | C-01 (`SceneDepthSource`) | C-07-OUT-2 | C-21 |
| C-07-IN-3 | C-01 | C-07-OUT-3 | C-17 (VFX atlas admission); atlas manifest stays PRD 07 |
| C-07-IN-4 | C-02, C-07 | C-07-OUT-4 | C-21 (`skyBackgroundSlot`, `onSkyChanged`) |
| C-07-IN-5 | C-09 | C-07-OUT-5 | C-37 |
| C-07-IN-6 | C-11 | C-07-OUT-6 | C-36 |
| C-07-IN-7 | C-19 | C-07-OUT-7 | C-20 (`PARTICLE_PROGRAM_DEFINES`), C-02 |
| C-07-IN-8 | C-14, C-13 | C-07-OUT-8 | C-30, C-31 |
| C-07-IN-9 | C-27, C-28 | C-07-OUT-9 | C-40 |
| C-07-IN-10 | C-36, C-37 | C-01-quality | C-05, C-07, C-27 |
| C-07-IN-11 | C-26 | C-02-env | C-09, C-10 |
| C-02-lint | C-34 (R8) | C-02-kits | R7 |
| C-03-post | C-13 | C-04-override | C-15 |
| C-05-assets | C-17 | C-06-anim | C-19 |
| C-07-fx | C-20 (`pixelBacked`) | C-08-camera | C-22 |
| C-09-game | C-24 | C-10-biome | C-26 |
| C-11-tier | C-27 | C-12-harness | C-30, C-31, C-32, C-33 |
| C-14-pilots | C-35 + C-40 | C-15-surface | C-36, C-39, §3.8 lean |
| P-13-looks, P-13-lint | C-34 | P-13-prompt, P-13-floor, P-13-templates, P-13-skills, P-13-eval, P-13-cli | PRD 13-owned. They are provided through C-34, C-39, C-40 and C-32. |

### Appendix B. Facts handoff (C-40)

Rows are append-only. PRD 13 writes skill text only from `verified` rows. A row stays `proposed` until its evidence
column cites a passing test or a capture run id.

| id | lane | statement | API | since | evidence | status |
|---|---|---|---|---|---|---|
| F-07-01 | 07 | `effects.fog()` defaults: `mode "height"`, σ_d 0.004, σ_h 0.008, b 0.2, start 2 m, maxOpacity 1, color `"sky"` | `effects.fog` | 2026-10-05 (PRD 07 §6.6) | — | proposed |
| F-07-02 | 07 | CPU emitters coalesce into one instanced draw per §6.2.2 material key `(blend, atlasKey, softDepth, stretch, frameBlend)`; builder draws per frame = number of distinct material keys, bounded by the C-27 `particleBudget` cap | `effects.particles` | 2026-10-06 (PRD 07 §6.2.2) | — | proposed |
| F-07-03 | 07 | Blend fallback limits under the C-04 stub: additive → premultiplied ×1.6 core (`additiveFallback`); alpha/premultiplied → alpha-over + `UNPREMULTIPLY_OUTPUT` define; multiply → skipped with `VFX_BLEND_SKIPPED`; every degradation reports once per batch key (`VFX_BLEND_FALLBACK`) | `effects.particles` | 2026-10-06 (PRD 07 §6.2.3) | — | proposed |
| F-07-04 | 07 | The 14 `AuraVfxKind` impact kinds (spark, dust, debris, ring, streak, pickup, explosion-small, muzzle, splash, bubble, impact-flash, super-flash, impact-decal, aura-burst) resolve to presets with ≥ 1 emitter layer each; PRD 09 `GameFxKind` is a subset | `app.effects.presets` | 2026-10-06 (PRD 07 §6.4) | — | proposed |
| F-11-01 | 11 | Tier table per C-27 (R9 anisotropy L4/M8/H16/U16; R10 Ultra froxel 240x135x128) | `app.quality` | 2026-10-05 | — | proposed |
| F-11-02 | 11 | WebGPU: experimental probe device; not used by any game; no visual parity claim. WebGL2 is the only shipping backend; sync `readPixels`/`readFloatPixels` on WebGPU throw `WEBGPU_SYNC_READBACK_UNSUPPORTED` — use the async variants. `experimental-webgpu` quality profile throws `AuraMigrationError`. | — | 2026-10-06 (PRD 11 §6.2 Phase 1 freeze) | — | proposed |
| F-02-01 | 02 | `lights.ambient` is additive to IBL under `model: "physical"`. It never replaces IBL. | `lights.ambient` | 2026-10-05 (C-09) | prd02-phase3 ambient×1/π+additive-bind tests; vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-02-02 | 02 | Kit/recipe default under `A3D_QR_LIGHTING`: `environments.preset(...)` + `lights.directional({ shadow: true })` + optional `lights.ambient` ≤ 1 fill — replaces ambient+directional kits. | `environments.preset`, `lights.directional`, `lights.ambient` | 2026-10-06 (PRD 02 §7) | prd02-builders env-preset/shadowed-sun/ambient tests; vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-02-03 | 02 | `look/ambient-flattens` replacement text: "Scene uses the neutral environment only; add `environments.preset(...)` and `lights.directional({ shadow: true })` for a key light." | `look/ambient-flattens` | 2026-10-06 (PRD 02:1915) | prd02-chunks look/ambient-flattens fires-tests; vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-02-04 | 02 | Units: `power` lumens → cd = lm/4π (point), lm/π (spot); defaults point 8 cd, spot 30 cd, directional 3, ambient 0.3 irradiance multiplier; hemisphere sky #bcd7ff / ground #4a4036 / 0; decay 2, distance 0 (infinite). | `lights.point`, `lights.spot`, `lights.ambient`, `lights.hemisphere` | 2026-10-06 (PRD 02 §6.3) | prd02-light-units (16t); vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-02-05 | 02 | three-compat 1:1: `DirectionalLight`→`lights.directional`, `PointLight(power)`→`lights.point({power})`, `SpotLight`→`lights.spot`, `AmbientLight`→`lights.ambient` (additive), `HemisphereLight`→`lights.hemisphere`, PMREM+RoomEnvironment→`environments.neutral()`, `scene.environment`→`environments.preset`/`hdri`, `shadowMap`→`shadow` options on the light node. | `three-compat` ledger | 2026-10-06 (PRD 02 §6.3) | prd02-cli-commands codemod tests + migrate-lighting sweep (334 rows); vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-02-06 | 02 | Shadow defaults: mapSize/cascades/filter per C-27 tier (low 1024×1/pcf2 → ultra 4096×4/pcf5); `autoSunShadow` true; cascades `"auto"` = 1 if scene radius ≤ 15 m else tier; λ 0.75, blend 0.1, maxDistance min(camera.far,150), strength 1.0, bias 0 (auto), normalBias 1.5×texel. | `AuraShadowOptions`, `AuraDirectionalShadowOptions` | 2026-10-06 (PRD 02 §6.4) | prd02-builders shadow-options verbatim + prd02-shadow-system tier config; vitest 2026-10-06T16:55Z qr/prd02-engine-composition | verified |
| F-01-01 | 01 | Exactly one tone map per frame, in OutputPass. `DEFAULT_TONE_MAPPING = "aces"` until the PRD 12 AgX A/B. | `output.toneMapping` | 2026-10-05 (C-05) | — | proposed |
| F-06-01 | 06 | With `A3D_QR_ANIMATION`, `bindRuntimeNode(hero, { defaultClipId })` drives GLB clips; never pass `applyPose`. | `AnimationController.bindRuntimeNode` | 2026-10-06 (PRD-06 T0.16) | `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts` | verified |
| F-06-02 | 06 | Map actions to the asset's real clip names from `assets.hero.metadata.animations`; run `aura3d animation inspect-clips` first. | `assets.hero.metadata.animations`, `aura3d animation inspect-clips` | 2026-10-06 (PRD-06 T0.16) | `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts`, `tests/unit/aura3d-cli/asset-inspection-animation.test.ts` | verified |
| F-06-03 | 06 | `createAuraApp(..., { animation: { strict: true } })` throws on empty poses and unknown clips. | `AuraCreateAppAnimationOptions.strict` | 2026-10-06 (PRD-06 T0.16) | `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts` | verified |
| F-06-04 | 06 | `animationState().tracksApplied > 0` is a precondition, not proof of quality. | `animationState().tracksApplied` | 2026-10-06 (PRD-06 T0.16) | `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts` | verified |
| F-06-05 | 06 | No `poseBakedFallback` / `tracks: []` clips. | `AnimationClipDefinition` | 2026-10-06 (PRD-06 T0.16) | `tests/qr/prd06/unit/character-animation-skill-snippet.test.ts` | verified |
| F-03-01 | 03 | `output: { preset }` replaces the bloom/grade/antiAlias tail (PRD 03 §10). | `output.preset` | 2026-10-06 | — | proposed |
| F-03-02 | 03 | Never stack FXAA on MSAA/TAA; `antiAlias` default is `auto` (PRD 03 §10). | `effects.antiAlias` | 2026-10-06 | — | proposed |
| F-03-03 | 03 | Bloom threshold is linear HDR, default 1.0; do not author < 1 on lit scenes (PRD 03 §10). | `effects.bloom` | 2026-10-06 | — | proposed |
| F-03-04 | 03 | Emissive ≥ 2.5 to glow under `neon-night` (PRD 03 §10). | `material.emissiveIntensity` | 2026-10-06 | — | proposed |
| F-03-05 | 03 | Do not fix bloom blobs by lowering intensity; raise threshold or lower emissive (PRD 03 §10). | `effects.bloom` | 2026-10-06 | — | proposed |
| F-04-01 | 04 | Override semantics: `material:{color}` on a GLB under `A3D_QR_MATERIALS` is a multiply override — authored maps preserved, `baseColorFactor` multiplied. Flag-off it is the legacy emissive tint. `setMaterialOverrides([])` restores the authored snapshot exactly. | `model().material`, `setMaterialOverrides` | 2026-10-06 (C-15) | `model-material-override.spec.ts` (S3) | proposed |
| F-04-02 | 04 | Preset defaults: `material.fabric/brushedMetal/blackRubber/frostedGlass` emit physical materials whose procedural micro-structure raises masked Laplacian variance ≥ 3× vs flag-off at 1280×720. | `material.*` presets | 2026-10-06 (C-15) | `procedural-material-detail.spec.ts` (S7) | proposed |
| F-04-03 | 04 | Anisotropy table: `resolveSamplerAnisotropy` caps desired sampler anisotropy at L4/M8/H16/U16 by quality tier (R9 row). | `resolveSamplerAnisotropy` | 2026-10-06 (C-27, R9) | `texture-tiling.spec.ts` (S6) | proposed |
| F-04-04 | 04 | Procedural detail kinds: `fabric`, `brushedMetal`, `blackRubber`, `frostedGlass` — deterministic, flag-gated, no texture fetches added. | `material.*` | 2026-10-06 | `procedural-material-detail.spec.ts` (S7) | proposed |
| F-04-05 | 04 | `alphaMode` semantics: `mask` + `alphaToCoverage` renders a ≥2 px edge gradient at the mask boundary under `A3D_QR_MATERIALS`; flag-off stays a hard ≤1 px clip. | `material.alphaMode`, `prd04.alphaToCoverage` | 2026-10-06 (E22, C-37) | `integrated-acceptance.spec.ts` | proposed |
| F-04-06 | 04 | `inspectMaterials()` shape: `AuraResolvedMaterialInfo[]` — `{name, featureKey, baseColorFactor, enabledMaps, extensions, lightsEvaluated, warnings}`; flag-on it lists authored keys incl. `baseColor`, flag-off the stub returns `featureKey: "legacy"`. | `materials.inspectMaterials` | 2026-10-06 (C-15) | `model-material-override.spec.ts` (S3) | proposed |

