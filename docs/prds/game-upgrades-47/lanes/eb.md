# GU47 lane eb: WP-2 (E-B) runtime light, environment, fog; multi-caster shadows

- Branch: `gu47/eb` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/eb`)
- Base commit: `f797808be`
- Wave: 1 (phase 1, code). Nothing was run in a browser, remotely or on a GPU.
- Scope: `briefs/scope-eb.md`; PRD contract lines 157-178, WP lines 389-396, PRD §4.1 E-B row.
- Files edited: only E-B-owned files (PRD §4.1 E-B row) plus new tests (`tests/unit/lighting/set-light.test.ts`, `tests/unit/gu47/eb/`), the receipt spec (`tests/browser/gu47/runtime-light-control*`) and this report.

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| E-B.0 predecessor contract | M | done | `c95d4a170` | Predecessor's uncommitted `contracts/lighting.ts` reviewed and kept (diagnostics fields, `AuraEnvironmentSwapOptions`, `setEnvironment`, stub). Corrected: the `localShadowLights` doc (rows are `local-<i>`), `intensity` defined as the environment-term scale. |
| E-B.1 setLight + lights follow their handle | M | done | `5f9efcb6c` | Mount-time collected lights are bound to their authored node; the PRD-02 light handler's per-frame `update` writes the handle's position, visibility and `setLight` blends into them. A hidden light shades with intensity 0 and `source.visible = false`, so no shadow pass picks it. `tests/unit/lighting/set-light.test.ts` (15). |
| E-B.2 setEnvironment + rotation | M | done; renderer consumption handed off | `60ec60747` | Swap with crossfade, per-device probe-ready wait, a scene without an environment gets an hdri node. The frame's yaw goes on the render source as `environmentProbeRotation` (radians). `renderer/Background.ts` (no GU47 owner) still has to apply it: see Handoffs. `tests/unit/gu47/eb/set-environment.test.ts` (9). |
| E-B.3 setFog on effects.fog scenes | M | done | `a5b0e892f` | `overrideSceneFog` (default true when every fog node is a plain `effects.fog`), `null` clears, the option's transition blends. `handle.setFog` writes its own node. The atmosphere extension and section are declared under `A3D_QR_VFX`; the binding works with `A3D_QR_VFX_FOG` alone (test). `tests/unit/gu47/eb/set-fog.test.ts` (9). |
| E-B.4 multi-caster shadows | M | done (own commit, default change) | `d9a5d1e72` | `resolveProductionShadowCasterIndices`: the N1 caster plus explicitly shadowed spot / point lights up to the tier's `localShadowLights`. A 4-spot stadium at High gives sun + `local-0` + `local-1` sampled rows from the `prd02.shadows` pass; `setVisible(false)` drops a row. `tests/unit/gu47/eb/multi-caster-shadows.test.ts` (7). On the default bridge path this is pixel-neutral (that path renders sun cascades only; see Handoffs). |
| E-B.5 lighting diagnostics | M | done | `c95d4a170` | `punctualLights` / `localShadowLights` are counted from the frame's collected lights (visible lights only). `diagnostics().lighting` also carries `shadows`, which the WP-2 acceptance reads. |
| E-B.6 declarations for E-H / E-G | M | done | `5f9efcb6c`, `a5b0e892f` | `part?(name)` on `AuraRuntimeNodeHandle` (E-H implements it). `AuraSkyStarsOptions` / `AuraSkyCloudsOptions` on preetham / gradient (gradient gains `clouds`). The pre-GU47 star shapes stay assignable (decision 9). |
| E-B.7 tests + receipt spec | M | done (receipt is phase 2) | `cb8e64a6e` + the commits above | 40 new unit tests. `tests/browser/gu47/runtime-light-control.spec.ts` (+ harness, html) written, not run. |

## Decisions (resolved without questions)

1. **Unowned renderer files were not edited.** `compileScene.ts`, `renderInput.ts`, `renderer.ts`, `runtimeNodes.ts` and `renderer/Background.ts` have no GU47 owner, and EXECUTION allows edits to owned files only. Everything goes through owned seams instead: C-36 handler `update` hooks (light and environment handlers in `lanes/prd02.ts`), a C-37 handle extension (`setLight`, typed by module augmentation of `AuraNodeHandleExtensionMap` from `prd02.ts`), the `prd02.explicit` environment source, and `runtimeEnvironmentIntensity`, which `compileScene` already reads every frame. The pieces that need those files are handoffs.
2. **Per-frame lights are written in place.** `compileScene` passes the mount-time `ctx.collectedLights` to every frame, so the light update writes live values into those objects (WeakMap-bound to their node) and into their scene `Light`, whose transform the legacy shadow path reads. Hiding a light keeps its slot (intensity 0, `source.visible = false`), so the light count, and with it the shader program, never changes. Untouched lights keep their exact mount objects, and a light whose handle version is unchanged and has no blend running skips the frame.
3. **setLight semantics.** All fields are absolute. A change blends linearly from the value shown on the next frame. Colour blends in linear light. `power` converts with the light kind (point /4π, spot /π, rect /(π·w·h), directional as intensity), and `intensity` wins when both are given. An explicit `direction` stays fixed while the light moves (a carried torch); an unpatched directional or spot re-aims at its authored target using the rule its mount path was built with. A `position` blend writes through `setPosition`, and a later `setPosition` cancels it. Ambient / hemisphere / probe lights take colour and intensity on the flattened node, which the environment resolution reads every frame. Input is validated at the call site (RangeError, AuraColorParseError).
4. **setEnvironment is a dip crossfade.** Only one probe is bound per frame, so the environment term fades out over the first half, the texture swaps, and the term fades back in over the second half once the new probe is ready on the app's device (or has failed, or after 10 s). The texture and background are laid over the resolved node without mutating it. A scene with no environment node gets one (`runtime: { id: "a3d-runtime-environment" }`, background false, no fade). `intensity` is the environment-term scale, the same value `setEnvironmentIntensity` takes, applied at the swap.
5. **Rotation.** `setEnvironmentRotation` (absolute) wins over the node's authored `rotation`, which E-A's `environmentRotationDeg` emits. The field is put on the source only when it is non-zero or was set, so other scenes' sources are unchanged.
6. **setFog.** `overrideSceneFog` merges the spec into the active fog node's live spec (the C-37 `setNodeFog` path). A scene that authors a height or volumetric node keeps it unless the option is true. The live fog path itself is still gated by `A3D_QR_VFX_FOG` in `compiler/fog.ts` (E-G); E-G's WP-7 promotes that flag. The app extension's declared flag was `A3D_QR_VFX_SKY`, but `createAuraApp` never reads extension flags and `createAtmosphereExtension` already accepted `VFX_FOG` alone. The declaration now says `A3D_QR_VFX`, and a test proves the binding with only `VFX_FOG` on.
7. **Multi-caster selection is on the physical path only.** The legacy descriptor path (COMPILER or LIGHTING off) keeps its single caster, because the legacy renderer shadows the first caster in array order. The tier defaults to the PRD-02 shadow config's own resolution ("medium" on a coarse pointer, else "high"), because `renderer.ts` passes no tier (handoff). No unrequested light and no second directional is ever added, so one-caster scenes are unchanged. A scene whose only request is one spot keeps it on Low.
8. **Shadow rows are `local-<i>`.** Row names come from `Prd02ShadowsContributor.ts` (unowned), so the contract doc now says `local-<i>` instead of naming the light.
9. **Sky option types are kept compatible.** `stars` is `AuraSkyStarsOptions | AuraSkyStarsLegacySpec`, because `nodes/sky.ts:131,138` (`{ density, intensity }`) and `world/biomes.ts:189` (`{ enabled, auroraBand }`) still emit the old shapes, and narrowing would add typecheck errors in files E-B does not own. Narrow it in wave 2 once those emit `count`.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| integration (no GU47 owner) | `packages/rendering/src/renderer/Background.ts:resolvePrd02EnvironmentLighting`, `:resolvePrd02EnvironmentBackground` | Read `(source as { environmentProbeRotation?: number }).environmentProbeRotation ?? 0` (radians). Add `environmentMapRotation: rotation / (2 * Math.PI)` (turns) to the lighting result and include the rotation in the `prd02LightingMemo` key. Use the same turns as the background `rotation` when the explicit background carries none. | The engine now puts the frame's yaw on the source (`setEnvironmentRotation`, `setEnvironment({ rotationDeg })`, authored hdri `rotation` / E-A `environmentRotationDeg`). `ForwardPass.applyPrd02EnvironmentUniforms` already maps `environmentMapRotation` (turns) to `u_envRotation` (radians), but on the PRD-02 probe path nothing sets it today. Check the sign against the background in the phase-2 envRotation frames. |
| integration | `packages/engine/src/agent-api/compiler/renderer.ts:194` | `createProductionRuntimeCollectedLights(snapshot, flags, { hemisphereAsEnvironment: true, shadowTier: resolveMountQuality(rendererOptions).tier })` | The local caster cap should follow the app's quality tier instead of the desktop "high" / coarse "medium" default. |
| integration, E-D (`ForwardPass.ts`) | `packages/rendering/src/shadows/Prd02ShadowBridge.ts:executePrd02BridgedShadowMap` (`localLights: []`) | Render local spot / point tiles on the default forward path. Today the bridge renders sun cascades only, and local tiles render only when a forward program declares the `a3d_prd02_shadow_lookup` chunk. | Engine selection, per-frame poses and diagnostics are in place. The WP-2 "2 sampled spot shadow rows" acceptance (soft expect in the receipt) needs local tiles on the path games actually use. |
| integration | `packages/engine/src/agent-api/compiler/compileScene.ts:addSubtree` / `:removeSubtree` | Give light nodes added at runtime (`app.nodes.add(lights.*)`) a collected light (`createProductionRuntimeCollectedLight` + `bindAuthoredLight`, as persistent contributions) and remove it with the subtree. | Known gap outside WP-2: the PRD-02 light handler adds no light (T0-09), so runtime-added lights neither render nor respond to `setLight`. Mount-time lights are covered. |
| E-G | `packages/engine/src/public/index.ts` | Export the types `AuraLightPatch`, `AuraLightTransitionOptions` (`agent-api/nodes/types/runtime.ts`), `AuraEnvironmentSwapOptions` (`contracts/lighting.ts`), `AuraSetFogSpec`, `AuraSetFogOptions`, `AuraSkyStarsOptions`, `AuraSkyCloudsOptions` (`contracts/atmosphere.ts`). | So games can name them; inline literals already type-check. |
| E-G | `nodes/sky.ts:131,138`, `world/biomes.ts:189`, the `GU47(E-B)` sky-type mirror | Wave 2: import `AuraSkyStarsOptions` / `AuraSkyCloudsOptions` from `contracts/atmosphere.ts` and emit `count` / `brightness`. E-B then narrows `stars` and drops `AuraSkyStarsLegacySpec`. | Decision 9. |
| E-G | `packages/engine/src/agent-api/compiler/fog.ts:createProductionRuntimeEnvironmentFog` | None if `A3D_QR_VFX_FOG` promotes (WP-7). Until then `app.atmosphere.setFog` reaches pixels only for apps that opt into `vfx.fog`. | Decision 6. |
| E-I | `packages/aura3d-cli/skills/aura3d-materials-environments/SKILL.md` | Document `handle.setLight`, `app.lighting.setEnvironment` / `setEnvironmentRotation`, `setFog({ overrideSceneFog })`, the tier caster caps (low 0 / medium 1 / high 2 / ultra 4) and `diagnostics().lighting.{shadows, punctualLights, localShadowLights}`, then run `pnpm check:skills`. | Agent-facing API; E-I owns the skill doc. |

### Handoffs received

| from | item | status |
|---|---|---|
| E-A | `compiler/environment.ts`: the hdri node's `rotation` rotates probe sampling and the background | Applied on the engine side (`60ec60747`): the node's authored rotation reaches the source as `environmentProbeRotation` (test). Renderer consumption is in `renderer/Background.ts` (no owner): first handoff row. |
| E-G, E-H | (re-read at the end) | Nothing addressed to E-B. E-G mirrors the sky types and E-H mirrors `part?` until merge; both names and shapes match what shipped here. |

## CHANGELOG text for WP-38

- Lights: a light node's handle now drives the light every frame. `setPosition` moves it, and `setVisible(false)` removes the light and its shadow. `handle.setLight({ color, intensity, power, distance, direction, position }, { transitionSeconds })` retunes any light kind at runtime and blends colours in linear light; ambient, hemisphere and probe lights take colour and intensity.
- Environment: `app.lighting.setEnvironment(texture, { intensity, background, rotationDeg, crossfadeSeconds })` swaps the scene's HDRI at runtime and cross-fades through the environment term while the new probe loads. `app.lighting.setEnvironmentRotation(radians)` and an environment node's `rotation` are carried to the renderer for image-based lighting (needs the renderer change listed in the lane report).
- Fog: `app.atmosphere.setFog(spec, { transitionSeconds, overrideSceneFog })` now applies to scenes that declare an `effects.fog` node, `handle.setFog` writes its own fog node, and the live fog binding works with `A3D_QR_VFX_FOG` alone.
- Shadows: scenes with several explicitly shadowed spot or point lights get up to the quality tier's local shadow casters plus the sun (low 0, medium 1, high 2, ultra 4); scenes with one caster are unchanged. `diagnostics().lighting` reports `punctualLights`, `localShadowLights` and the shadow rows.
- Sky: typed `stars { count, brightness }` and `clouds { coverage, speed, color }` options on preetham and gradient skies.
- Visual numbers for these changes are software WebGL2 captures.

## Phase-2 plan

Run `tests/browser/gu47/runtime-light-control.spec.ts` through `tools/remote-acr/run.sh` (640x360, `qualityProfile: "production"`). It writes `artifacts/gu47-eb/runtime-light-control.json` and frames, and prints `GU47_EB_RECEIPT`. Copy the JSON and frames to `evidence/receipts/runtime-light-control/4.7.0.json` (+ `.jpg`).

1. `colourRamp`: floor crop (x 0.3-0.7, y 0.55-0.85) at t = 0, 0.5, 1, 1.5, 2, 2.5 s after `setLight({ color: "#ff0000" }, { transitionSeconds: 2 })`. Pass: G/R > 0.85 at t = 0, non-increasing, 0.3 < G/R < 0.95 at 1 s, < 0.15 at 2 s. Frames `ramp-0s/1s/2s`.
2. `pointFollow`: bright-pool x centroid strictly increases while the lamp steps x = -4 to 4.
3. `spotVisibility`: `localShadowLights` goes 1 to 0, `punctualLights` drops by 1, and spot-pool crop luma drops by > 2. Soft: one fewer `local-*` row. Frames `spot-visible` / `spot-hidden`.
4. `stadium`: `localShadowLights` 2 is a hard check. "2 sampled spot shadow rows" is soft until the bridge handoff lands; record the rows.
5. `envRotation` (`kloppenheim_06_puresky_1k`, chrome sphere, 0 vs 90°): soft sky-crop mean abs diff > 4 and sphere diff > 2. This needs the Background.ts handoff; also check the sign so the sky and reflections turn the same way. Also covers E-A's phase-2 item 5.
6. `envCrossfade` (to `autumn_field_puresky_1k`, 1 s): sphere luma dips below 0.9x start, then recovers on the new sky. Record the series.
7. Before/after luma on the 64 game targets: E-B changes pixels only for scenes that call the new APIs, or that have several explicit shadow casters and a lookup-chunk consumer, so expect no change > 2 luma elsewhere (E-I table).

## Verification

- Typecheck delta (`bin/typecheck-delta.mjs`): `NEW_ERRORS 0` (58 errors, baseline 58) after the light / fog / sky group, and again at the end on `cb8e64a6e`.
- Unit suites, `node_modules/.bin/vitest run <files> --maxWorkers=2`:
  - Base `f797808be`, predecessor file removed: 23 files, 189 tests, all pass. Files: prd02-root-collected-lights, prd02-lighting-diagnostics, prd02-environment-knob, e2-environment-intensity, prd02-lighting-legacy-golden, production-bridge-boundary, shadow-family-b1, audit-e3-shadows-instancing, shadow-pass, shadow-cascade-skip, prd02-shadow-atlas, prd02-atlas-roundtrip, prd02-shadow-system, prd02-light-cap, C-36-compiler, external-parity-ibl, scene-contract-g1n1m2, prd07 fog-live / fog-compile / C-21 / bench-lane-flags / registration / transient-light-pool.
  - Branch: the same 23 files plus the 4 new ones, 27 files, 229 tests, all pass. Also green on the branch: prd02-light-mirrors, prd02-light-units, prd02-shadow-bridge, prd02-tier-budget. No test that passes on the base fails on the branch.
- Lint: `node_modules/.bin/eslint` on every touched `.ts` file: clean.
- `pnpm check:skills`: not needed (no skill doc edited).

## API as shipped

`packages/engine/src/agent-api/nodes/types/runtime.ts`

```ts
export interface AuraLightPatch { readonly color?: string; readonly intensity?: number; readonly power?: number; readonly distance?: number; readonly direction?: AuraVec3; readonly position?: AuraVec3 }
export interface AuraLightTransitionOptions { readonly transitionSeconds?: number }
// AuraRuntimeNodeHandle
setLight?(patch: AuraLightPatch, opts?: AuraLightTransitionOptions): void;   // light nodes, A3D_QR_LIGHTING (C-37 extension "prd02.setLight")
part?(name: string): AuraRuntimeNodeHandle | undefined;                     // declaration only (E-H implements)
```

`packages/engine/src/contracts/lighting.ts`

```ts
// AuraLightingDiagnostics gains
readonly punctualLights: number;
readonly localShadowLights: number;
export interface AuraEnvironmentSwapOptions { readonly intensity?: number; readonly background?: boolean; readonly rotationDeg?: number; readonly crossfadeSeconds?: number }
// AuraLightingRuntime
setEnvironmentRotation(radians: number): void;   // now reaches the frame (environmentProbeRotation)
setEnvironment(texture: AuraAssetRef<"texture">, opts?: AuraEnvironmentSwapOptions): void;
// StubLightingRuntime implements setEnvironment (bookkeeping) and the two counts (0)
```

`packages/engine/src/contracts/atmosphere.ts`

```ts
export interface AuraSkyStarsOptions { readonly count: number; readonly brightness?: number }
export interface AuraSkyCloudsOptions { readonly coverage: number; readonly speed?: number; readonly color?: string }
export interface AuraSkyStarsLegacySpec { readonly density?: number; readonly intensity?: number; readonly enabled?: boolean; readonly auroraBand?: boolean }
// AuraSkySpec: preetham { clouds?: AuraSkyCloudsOptions; stars?: AuraSkyStarsOptions | AuraSkyStarsLegacySpec }
//              gradient { stars?: AuraSkyStarsOptions | AuraSkyStarsLegacySpec; clouds?: AuraSkyCloudsOptions }
export type AuraSetFogSpec = Partial<AuraHeightFogSpec> & { readonly near?: number; readonly far?: number };
export interface AuraSetFogOptions { readonly transitionSeconds?: number; readonly overrideSceneFog?: boolean }
// AuraAppAtmosphere
setFog(spec: AuraSetFogSpec | null, o?: AuraSetFogOptions): void;
```

`packages/engine/src/agent-api/compiler/lights.ts` (engine-internal helpers)

```ts
export function recordRuntimeFrameLights(owner: object, lights: readonly CollectedLight[]): void;
export function runtimeLightStats(owner: object | null | undefined): { readonly punctualLights: number; readonly localShadowLights: number };
export interface RuntimeLightBinding { runtimeId; authoredLight; part; base: { color; intensity; range; position; direction; width; height }; aim(position) }
export function bindRuntimeLight(light: CollectedLight, binding: RuntimeLightBinding): CollectedLight;
export function runtimeLightBinding(light: CollectedLight): RuntimeLightBinding | undefined;
export function bindAuthoredLight(light: CollectedLight, node: AuraLightNode, part: number, aim: (position: AuraVec3) => AuraVec3): CollectedLight;
export function queueRuntimeLightPatch(handle: object, patch: AuraLightPatch, opts?: AuraLightTransitionOptions): void;
export function lightPowerToIntensity(authoredLight: string, power: number, width?: number, height?: number): number;
export function evaluateLightChannel<T>(channel, now: number, shown: T, mix: (a: T, b: T, t: number) => T): T;
export interface RuntimeLightFrameValues { visible; color; intensity; range; position; direction }
export function writeRuntimeLight(light: CollectedLight, values: RuntimeLightFrameValues): void;
export interface RuntimeLightHandleLike { id; version?; visible; position; setPosition(x, y, z) }
export function updateRuntimeLight(node: AuraLightNode, handle: RuntimeLightHandleLike | undefined, lights: readonly CollectedLight[], timeSeconds: number): void;
export function prd02DescriptorNode(descriptor: PhysicalLightDescriptor): AuraLightNode | undefined;
```

`packages/engine/src/agent-api/compiler/observations.ts`

```ts
export function resolveProductionShadowCasterIndices(descriptors: readonly { kind: string; shadowPriority: number; shadowRequested: boolean; shadowDisabled?: boolean; intensity: number }[], localShadowLights: number): readonly number[];
// ProductionRuntimeCollectedLightsOptions gains: readonly shadowTier?: AuraQualityTier
```

`packages/engine/src/agent-api/compiler/environment.ts` (engine-internal helpers)

```ts
export function setRuntimeEnvironmentRotation(owner: object, radians: number): void;
export function runtimeEnvironmentRotation(owner: object | null | undefined): number | undefined;
export interface RuntimeEnvironmentSwapOptions { intensity?; background?; rotationDeg?; crossfadeSeconds? }
export function runtimeEnvironmentTextureUrl(texture: AuraAssetRef<"texture">): string;
export function requestRuntimeEnvironmentSwap(owner: object, texture: AuraAssetRef<"texture">, opts?: RuntimeEnvironmentSwapOptions): void;
export function runtimeEnvironmentSwapState(owner: object | null | undefined): { phase: "fade-out" | "apply" | "loading" | "fade-in" | "idle"; crossfade: number; url?: string };
export function stepRuntimeEnvironment(owner: object, timeSeconds: number, probeOutcome: (url: string) => "ready" | "failed" | undefined): void;
export function noteRuntimeEnvironmentNode(node: object, owner: object): void;
export function runtimeEnvironmentNode<T extends object>(node: T): T;
export function runtimeEnvironmentFrameRotation(owner: object | null | undefined, node: { readonly rotation?: number } | undefined): number;
export function environmentProbeOutcome(device: object | undefined, url: string): "ready" | "failed" | undefined;
// runtimeEnvironmentIntensity(owner) now multiplies the running crossfade
```

`packages/engine/src/lanes/prd02.ts`

```ts
export class Prd02LightingRuntime { constructor(flags?: QrFlags, scaleOwner?: object, app?: Prd02LightingApp); setEnvironment(...); setEnvironmentRotation(...); diagnostics(): AuraLightingDiagnostics /* + counts */ }
export const RUNTIME_ENVIRONMENT_NODE_ID = "a3d-runtime-environment";
export interface Prd02LightingApp { readonly scene?: { readonly nodes: readonly AuraSceneNode[] }; readonly nodes?: { add(node: AuraSceneNode): unknown } }
// render source field (per frame, environment handler): environmentProbeRotation: number (radians)
// diagnostics().lighting gains: shadows, punctualLights, localShadowLights
```

`packages/engine/src/production-runtime/effects/LiveAtmosphere.ts`

```ts
setFog(spec: AuraSetFogSpec | null, o?: AuraSetFogOptions): void;
setNodeFogByRuntimeId(runtimeId: string, partial: Partial<AuraHeightFogSpec>): boolean;
sceneFogOverridden(): boolean;
```
