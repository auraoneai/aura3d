# Lane E-D (WP-4): materials and custom-shader access

- Branch: `gu47/ed` (worktree `/Users/gurbakshchahal/platforms/aura3d-gu47/ed`)
- Base commit: `f797808be` (gu47/integration = main 4.6.1 + swarm plan)
- Wave: 1 (phase 1, code). No browsers, no remote runs, no captures.
- Status: phase 1 complete except ED-7 reporting (handoff, see below).

## Rows

| ID | Pri | Status | Commit | Notes / evidence |
|---|---|---|---|---|
| ED-T | M | done | 85bd80eb0 | Contract types (predecessor): `AuraMaterialSpec.rim`, `AuraMaterialSpec.bloom` (E-C contract), `AuraMaterialRimSpec`, `AuraInstanceColorTarget`, node `instanceColorTarget`, `AuraCustomMaterialSpec.castShadow`, `AuraDiagnostics.triangles/textureBytes`, `AuraModelMaterialOverride.rim/transmission/iridescence`. |
| ED-1 | M | done (pixels phase 2) | 7f9b90d82, 377e5c869 | `rim` lowers onto the existing PRD-04 `prd04.rim` ShaderFeature (`u_prd04RimColor/Power/Strength`): primitives per frame via `applyNodeMaterialExtras` (compiler/renderInput.ts), models via `lowerModelMaterialOverrides` (spec `rim` and `materialOverrides[].rim`). No rim, or rim removed again: byte-identical program (`tests/unit/gu47/ed/material-rim.test.ts`). Receipt spec `tests/browser/gu47/material-rim.spec.ts` + harness (not run); `evidence/receipts/material-rim/README.md`. |
| ED-2 | M | done | 09087ded0 | `material.toon({ color?, steps, ramp, shadowColor, rim })` lowers to `material.custom` over `a3d_lights` + `a3d_toon` + `a3d_rim`; fog on, castShadow on, instance-aware vertex stage. `tests/unit/gu47/ed/material-toon.test.ts` (all variants compile on the mock device). |
| ED-3 | M | done | 7f9b90d82, 4d140880f | Author chunks `a3d_scene` (built-ins beside `u_a3dSunDirection` in `shadow.glsl.ts`), `a3d_lights` (`a3dDirect`), `a3d_ibl` (`a3dEnvDiffuse`, `a3dEnvSpecular`), `a3d_rim`; adapter expands each author chunk once per stage; `fog: true` wraps the author `main` and applies `environment_fog_common`; ForwardPass binds every built-in (reflection-guarded). `tests/unit/gu47/ed/custom-shader-chunks.test.ts`. |
| ED-4 | M | done (pixels phase 2) | b31037a28 | `castShadow: true` publishes `<shaderKey>/depth` (baked author vertex + depth-only fragment); `DepthPass` draws such casters with it (light VP in the matrix built-ins, material uniforms incl. runtime `setUniform`, `u_time` on the forward-pass clock, material side). `tests/unit/gu47/ed/custom-cast-shadow-instancing.test.ts`. |
| ED-5 | M | done | 7f9b90d82, b91343b50, b31037a28, 1b7564b08 | `prd04.instanceColorTarget` feature ("emissive": colour buffer bound as `a_a3dInstanceEmissive`, no base multiply; "both": base and emissive); engine stamps `u_a3dInstanceColorTarget` from the node's `instanceColorTarget` (primitives and `instances.model`). `material.custom` vertex stages reading `instanceMatrix` / `instanceColor` draw all instances in one call (forward and depth). Tests: `emissive-overrides.test.ts`, `custom-cast-shadow-instancing.test.ts`. |
| ED-6 | M | done | 7f9b90d82, 1b7564b08 | `AuraModelMaterialHandle.setEmissive(target, color, intensity)` (live write via `applyMaterialEmissive`, no snapshot re-apply; flag-off stub records); `transmission` / `iridescence` override fields write `u_transmissionFactor` / `u_iridescenceFactor` (clamped 0..1, authored keys only). `tests/unit/gu47/ed/emissive-overrides.test.ts`. |
| ED-7 | M | blocked (handoff: no §4.1 owner) | — | Both counters already exist at the device: `RenderDeviceDiagnostics.triangles` (per frame, every pass) and `.textureBytes` (live gauge), surfaced today as `app.info.render.triangles` and inside `approximateGpuMemoryBytes`. Copying them into `app.diagnostics()` needs `agent-api/diagnostics.ts` (`MutableDiagnostics`, `snapshotDiagnostics`) and `agent-api/app/frameLoop.ts`, which no lane owns; exact change in Handoffs. Types already shipped (ED-T). |
| ED-8 | M | done | 7f9b90d82, 5c05bb187 | `registerForwardDrawHook` in ForwardPass (per-draw uniform extension point for E-E; none registered by default). `tests/unit/gu47/ed/forward-draw-hook.test.ts`. All 10 `tests/unit/*/shaders-compile.test.ts` suites pass on the branch. |

## API as shipped

Engine (`@aura3d/engine`, types in `packages/engine/src/agent-api/nodes/types.ts`):

- `AuraMaterialSpec.rim?: AuraMaterialRimSpec`; `interface AuraMaterialRimSpec { readonly color: AuraColor; readonly power?: number; readonly intensity?: number }` (power 0.1..16 default 3, intensity 0..16 default 1).
- `AuraMaterialSpec.bloom?: number` (E-C reads it).
- `material.toon(options?: AuraToonMaterialOptions): AuraMaterialSpec`; `interface AuraToonMaterialOptions { readonly color?: AuraColor; readonly steps?: number; readonly ramp?: AuraAssetRef<"texture">; readonly shadowColor?: AuraColor; readonly rim?: AuraMaterialSpec["rim"] }` (superset of the PRD shape: adds `color`, default "#d7dee8"; steps 1..8 default 3; shadowColor default 35% of color). Also exported: `toonMaterial(options)` from `agent-api/nodes/material.ts`.
- `AuraCustomMaterialSpec.castShadow?: boolean`; `material.custom({ fog: true })` now applies scene fog.
- `type AuraInstanceColorTarget = "base" | "emissive" | "both"`; `AuraPrimitiveNode.instanceColorTarget?`, `AuraModelNode.instanceColorTarget?` (E-G stamps them from `instances.*({ instanceColorTarget })`).
- `AuraModelMaterialOverride.rim? / transmission? / iridescence?` (`contracts/materials.ts`).
- `AuraModelMaterialHandle.setEmissive(target: string, color: string, intensity: number): void` (`"*"` = every material).
- `AuraDiagnostics.triangles?: number`, `AuraDiagnostics.textureBytes?: number` (types only; see ED-7).
- `AuraCustomShaderMaterial.customDepthShaderKey: string | undefined`; `CUSTOM_DEPTH_FRAGMENT_GLSL`; `customFragmentOutputName(source): string | undefined` (`agent-api/compiler/customMaterial.ts`).
- `production-runtime/ModelMaterialOverrides.ts`: `LoweredMaterialRim`, `MATERIAL_RIM_COLOR_PARAM | MATERIAL_RIM_POWER_PARAM | MATERIAL_RIM_INTENSITY_PARAM` (= `u_prd04RimColor | u_prd04RimPower | u_prd04RimStrength`), `MATERIAL_INSTANCE_COLOR_TARGET_PARAM` (`u_a3dInstanceColorTarget`), `lowerMaterialRim(rim)`, `setMaterialRimParameters(material, rim): boolean`, `setMaterialInstanceColorTarget(material, target): boolean`, `applyNodeMaterialExtras(material, spec, instanceColorTarget)`, `applyMaterialEmissive(materials, target, color, intensity): number`; `TypedGLBActorMaterialOverride.rim / transmission / iridescence`.

GLSL for `material.custom` (`#include <name>`, `packages/rendering/src/shaders/chunks/author/`):

- `a3d_scene`: uniforms `u_a3dSunDirection`, `u_a3dSunColor`, `u_a3dSunIntensity`, `u_a3dHemiSky`, `u_a3dHemiGround`, `u_a3dFogColor`, `u_a3dFogDensity`; `vec3 a3dSunRadiance()`, `vec3 a3dHemiLight(n)`, `vec3 a3dSceneFog(color, viewDistance)`.
- `a3d_shadow` (now includes `a3d_scene`): adds `vec3 a3dFragWorldPosition()` (uniform `u_a3dInverseViewProjection`).
- `a3d_lights`: `vec3 a3dDirect(N, V, albedo, roughness)`, `vec3 a3dDirect(N, V, albedo, roughness, worldPos)`, `vec3 a3dDirectLight(N, V, L, radiance, albedo, roughness)`.
- `a3d_ibl`: `vec3 a3dEnvDiffuse(N)`, `vec3 a3dEnvSpecular(R, roughness)` (uniforms `u_a3dEnvAmbient`, `u_a3dEnvSh[9]`, `u_a3dEnvShEnabled`, `u_a3dEnvSky/Horizon/Ground`, `u_a3dEnvMap`, `u_a3dEnvMapEnabled/Intensity/Rotation/MaxLod/Encoding`).
- `a3d_rim`: `vec3 a3dRim(n, v, color, power, intensity)`.
- Vertex stages may read `instanceMatrix` (mat4) and `instanceColor` (vec4): per-instance transform/colour on instanced nodes, identity/white otherwise.

Rendering (`packages/rendering/src`, internal unless re-exported by the rendering barrel, which no lane owns):

- `ForwardPass.ts`: `interface ForwardDrawHook { id; bind(item, shader, set) }`, `registerForwardDrawHook(hook): () => void`, `applyCustomShaderLightingUniforms(options, fog, shader, uniforms, frame)`, `interface CustomShaderFrameCache { lights(); inverseViewProjection() }`, `customShaderInverseViewProjection(options): Float32Array`.
- `DepthPass.ts`: `DepthPassOptions.timeSeconds?: number`, `customDepthShaderKeyOf(material): string | undefined`.
- `shaders/chunks/rim.glsl.ts`: `A3D_RIM_FEATURE` (`"prd04.rim"`), `A3D_RIM_COLOR_PARAM`, `A3D_RIM_POWER_PARAM`, `A3D_RIM_INTENSITY_PARAM`, `A3D_RIM_DEFAULT_POWER`, `A3D_RIM_DEFAULT_INTENSITY`, `A3D_RIM_POWER_RANGE`, `A3D_RIM_INTENSITY_RANGE`, `A3D_RIM_FUNCTION_GLSL`, `materialRimIntensity(material)`.
- `shaders/chunks/instance_color_target.glsl.ts`: `type InstanceColorTarget`, `A3D_INSTANCE_COLOR_TARGET_FEATURE` (`"prd04.instanceColorTarget"`), `A3D_INSTANCE_COLOR_TARGET_PARAM`, `A3D_INSTANCE_EMISSIVE_ATTRIBUTE` (`a_a3dInstanceEmissive`), chunk-name constants, `instanceColorTargetCode`, `materialInstanceColorTarget`, `selectInstanceColorTargetFeature`, `registerInstanceColorTargetFeature`.
- `shaders/chunks/author/shadow.glsl.ts` `A3D_SCENE_GLSL`; `author/lights.glsl.ts` `A3D_LIGHTS_GLSL`; `author/ibl.glsl.ts` `A3D_IBL_GLSL`.

## Handoffs

| to lane | file:symbol | change | why |
|---|---|---|---|
| integration (no §4.1 owner; nearest E-F) | `packages/engine/src/agent-api/diagnostics.ts`: `MutableDiagnostics`, `snapshotDiagnostics`; `packages/engine/src/agent-api/app/frameLoop.ts` (after `diagnosticsState.drawCalls = drawCalls;`) | Add `triangles?: number; textureBytes?: number` to `MutableDiagnostics`; in the frame loop set them from the renderer's device diagnostics (`d = renderer.device?.getDiagnostics?.()`: `triangles = d.triangles`, `textureBytes = d.textureBytes`; `app.info.render.triangles` is the same triangle counter); in `snapshotDiagnostics` spread `...(value.triangles !== undefined ? { triangles: value.triangles } : {})` and the same for `textureBytes`. | ED-7: `app.diagnostics().triangles/textureBytes` (types shipped in `types.ts`, counters already in the device). |
| E-G | `packages/engine/src/agent-api/nodes/instances.ts`: `instances.*` options | Accept `instanceColorTarget?: AuraInstanceColorTarget` and stamp it on the node (`AuraPrimitiveNode.instanceColorTarget` / `AuraModelNode.instanceColorTarget`). | ED-5: the renderer reads the node field (already wired). |
| E-G | `packages/engine/src/public/index.ts` | Export type `AuraToonMaterialOptions` and `AuraInstanceColorTarget`, `AuraMaterialRimSpec` (if not reached through the existing `agent-api/index.ts` type barrel). | Game lanes type their options. |
| E-E (only if needed) | `packages/rendering/src/ForwardPass.ts`: `registerForwardDrawHook` | Use the hook for an outline-target ID mask; it needs a rendering-barrel export (`packages/rendering/src/index.ts`, no owner). | ED-8 extension point. |

## Decisions

- The predecessor's uncommitted `rim.glsl.ts` registered a second `prd04.rim` ShaderFeature and reused the `a3d_prd04_rim_*` chunk names: the rendering barrel threw `REGISTRY_DUPLICATE:prd04.rim` on import (9 suites failed). Fixed before committing: rim rides the existing PRD-04 feature (same term, byte-identical without rim, already tested); `rim.glsl.ts` is the new single source of parameter names, defaults and the shared `a3dRim()` GLSL (author chunk `a3d_rim`, toon).
- The instance-emissive varying was renamed `v_a3dInstanceEmissiveTint` (PRD-11 already declares `v_a3dInstanceEmissive`).
- Built-ins live in a new `a3d_scene` chunk in `shadow.glsl.ts`, included by `a3d_shadow`/`a3d_lights`/`a3d_ibl`; the adapter's include-once map makes nested/duplicate includes safe (the bake preprocessor drops `#ifndef` guards). Stages that include each chunk once bake exactly as before.
- `a3dDirect` without a position reconstructs the world position from `gl_FragCoord` and `u_a3dInverseViewProjection` (exact under any author vertex displacement, no varying); the 5-argument form takes the author's own.
- `a3d_ibl` uses its own `u_a3dEnv*` names (the legacy binders reuse `u_environmentMapIntensity` with another meaning); the equirect convention, decode and mip mapping mirror `indirect_default.glsl.ts`.
- `fog: true` reuses the legacy `environment_fog_common` (what every non-generated draw already applies), so custom surfaces fog exactly like built-in fallback draws, including height fog and volumetric inscatter.
- `castShadow` depth draws use `u_viewMatrix = identity`, `u_projectionMatrix = light VP` (documented in the predecessor's type doc), `u_time` = `performance.now()/1000` (the clock ForwardPass's `timeSeconds` uses); the caster keeps its real geometry (not `shadowGeometry`). Alpha-tested custom shadows are out of scope (depth fragment is opaque).
- `material.toon` is a `material.custom` lowering (reuses the new chunks; no new forward ShaderFeature); options add `color`.
- Ownership exceptions (files no §4.1 row lists, minimal edits): `agent-api/compiler/renderInput.ts` (predecessor; two hooks: rim/instance target onto the draw material) and `production-runtime/actor/TypedGLBActorMaterials.ts` (one `setEmissive` method, required by the interface change).
- Default behaviour unchanged for scenes that do not opt in; no separate default-change commit was needed.

## CHANGELOG text for WP-38

- Materials: `rim: { color, power, intensity }` on any PBR material, `model(asset, { material: { rim } })` and `materialOverrides: [{ rim }]` adds a fresnel rim to the emitted light; materials without it render exactly as before.
- `material.toon({ color, steps, ramp, shadowColor, rim })`: cel shading lit by every scene light, with sun shadows, scene fog and instancing.
- `material.custom`: new author chunks `a3d_lights` (`a3dDirect`), `a3d_ibl` (`a3dEnvDiffuse`, `a3dEnvSpecular`), `a3d_scene` (sun, hemisphere and fog uniforms), `a3d_rim`, and `a3dFragWorldPosition()`; `fog: true` now applies the scene fog; `castShadow: true` casts shadows with the material's own vertex shader, so swaying or displaced geometry moves its shadow; vertex shaders on instanced nodes can read `instanceMatrix` and `instanceColor`.
- Instanced nodes: `instanceColorTarget: "emissive" | "both"` makes per-instance colours glow.
- Model material handles: `setEmissive(target, color, intensity)` for brake lights, signs and charge glows, cheap enough per frame; overrides gain `transmission` and `iridescence`.
- Measured on software WebGL2 in the phase-2 receipts (no visual numbers in phase 1).

## Phase-2 plan

- `material-rim` receipt: run `tests/browser/gu47/material-rim.spec.ts` on the remote runner (480x270, SwiftShader); checks: clean runtime, changed pixels >= 1%, silhouette band (0.80..0.97 of the projected radius) luma +6 or more and warmth (r - b) +4 or more, centre disc (0..0.35) luma within +-2. Commit `evidence/receipts/material-rim/<version>.json` and the two frames.
- Swaying-card shadow (PRD WP-4 acceptance): a `material.custom({ castShadow: true })` card with a time-driven sway over a floor, one shadow-casting sun; capture two frames 0.5 s apart; frame diff > 0 in the shadow crop on the floor (and 0 with `castShadow` false, where the shadow is the rest pose).
- `material.toon`, `a3d_lights` / `a3d_ibl` and `fog: true`: one capture per variant beside a built-in PBR sphere under the same light (luma within 15% on the lit side; fogged custom quad matches the fogged PBR quad's luma at equal distance within 3).
- Instance emissive: an `instances.box` row with `instanceColorTarget: "emissive"` and a white emissive material under a dark look; each instance's crop hue matches its instance colour.

## Verification

- Typecheck delta: run 1 (after the first commit) `NEW_ERRORS 1` (predecessor's instance-colour-target `defines` type), fixed in b91343b50; run 2 `NEW_ERRORS 4` (an `@aura3d/scene` import clashing with ForwardPass's local mat4 helpers, one test optional chain), fixed in 0137bf731; final run at 0137bf731: `58 errors (baseline 58)`, `NEW_ERRORS 0`.
- New unit tests (all pass): `tests/unit/gu47/ed/{material-rim,custom-shader-chunks,custom-cast-shadow-instancing,emissive-overrides,material-toon,forward-draw-hook}.test.ts` (41 tests).
- Touched existing suites, branch result: `tests/unit/parity/{glsl-chunks,custom-material-shadow,shader-material,empty-instances}.test.ts`, `tests/unit/rendering/{portable-shader-material,current-routes-forward-pass-cache,shadow-pass,audit-e3-shadows-instancing,instance-frustum-cull}.test.ts`, `tests/unit/engine/instanced-shadow-proxy.test.ts`, `tests/qr/prd04/unit/{rim-feature,model-material-overrides,model-tint-bridge,material-diagnostics}.test.ts`, `tests/unit/contracts/impl/prd04-overrides.test.ts`, `tests/unit/contracts/C-15-materials.test.ts`, `tests/unit/agent-api/agent-api.test.ts`: all pass.
- Pre-existing failures (also fail on the base, unrelated): `tests/unit/rendering/shader-library.test.ts` (2 tests: packaged direct-PBR shader files out of sync; verified on base by stashing), `tests/qr/prd04/unit/typed-glb-actor-snapshot.test.ts` "material variants" (fixture `fixtures/asset-corpus/materials-variants-shoe.glb` missing in the worktree), `tests/unit/public-api-contracts.test.ts` "keeps examples on public package barrels" (`examples/custom-shader-webgpu-lab/main.ts` imports engine internals).
- Shader-compile suites of all ports (`tests/unit/*/shaders-compile.test.ts`, 10 files, 183 tests): pass on the branch.
- Lint: `eslint` clean on every touched file.
