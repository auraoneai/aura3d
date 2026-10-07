# prd04 tint migration (PRD-04 §10.2 / §13 exit)

Generated 2026-10-06 by the C-39 codemod `prd04-model-tint-report` (`packages/aura3d-cli/src/commands/prd04/modelTintReport.ts`) over `apps/**/*.ts` (47 files scanned) and `pin-emissive-defaults` (`tools/codemods/pin-emissive-defaults.mjs`) dry-run over `{apps,packages}/**/*.ts` (168 files scanned). Decisions per §10.2: (a) drop `color` when authored textures are the intent; (b) keep `color` as multiply; (c) `materialOverrides: [{color, replaceTextures: true}]` only where the flat look is art direction. Owners: PRD 14 applies decisions for `apps/showcase-*`; PRD 15 for the `apps/` default sites (request Q-15-3); PRD 04 owns `apps/wow-webgpu-product-viewer/`.

## model() material-tint census — 23 sites

| Site | Construct | Detail | Decision |
|---|---|---|---|
| `apps/showcase-patrol-wing/src/main.ts:264` | model(assets.patrolAircraftMeshy, { material }) | color=true emissive=false material={ name: "ghost shell", color: "#9fd8ff", opacity: 0.32, roughness: 0.4 } [props:name,color,opacity,roughness] | TBD |
| `apps/showcase-courier-rush/src/main.ts:363` | model(assets.courierParcel, { material }) | color=true emissive=true material={ name: "parcel safety-orange finish", color: "#f5ad4f", roughness: 0.38, metallic: 0.08, clearcoat: 0.2, emissive:  | TBD |
| `apps/showcase-courier-rush/src/main.ts:386` | model(car.variant === "sedan" ? assets.courierTrafficSedan : assets.courierTrafficHatc, {  | color=true emissive=false material={           name: car.variant === "sedan" ? "courier traffic sedan lacquer" : "courier traffic hatch lacquer",      | TBD |
| `apps/showcase-courier-rush/src/city.ts:700` | model(assets.courierTrafficSedan, { material }) | color=true emissive=true material={         name: "courier pressure blocker lacquer",         color: "#e85d75",         roughness: 0.2,         metall | TBD |
| `apps/showcase-deep-recovery/src/main.ts:343` | model(assets.deepRecoverySub, { material }) | color=true emissive=true material={         name: "deep recovery sub teal hull",         color: "#2ab0c0",         emissive: "#1596a8",         emissi | TBD |
| `apps/showcase-deep-recovery/src/main.ts:367` | model(assets.deepRecoveryWreckHull, { material }) | color=undefined emissive=undefined material=visualReviewCapture ? material.pbr({         name: "deep recovery oxidized chapel wreck",         color: " | TBD |
| `apps/showcase-deep-recovery/src/main.ts:388` | model(assets.deepRecoveryCrateStandard, { material }) | color=true emissive=true material={ name: "review standard cargo", color: "#d6a54d", emissive: "#684719", emissiveIntensity: 0.34, roughness: 0.5, met | TBD |
| `apps/showcase-deep-recovery/src/main.ts:395` | model(assets.deepRecoveryCrateHeavy, { material }) | color=true emissive=true material={ name: "review heavy cargo", color: "#b86439", emissive: "#672e1d", emissiveIntensity: 0.32, roughness: 0.54, metal | TBD |
| `apps/showcase-deep-recovery/src/main.ts:402` | model(assets.deepRecoveryCrateStandard, { material }) | color=true emissive=true material={ name: "review chapel supply", color: "#668d7f", emissive: "#214f4a", emissiveIntensity: 0.3, roughness: 0.58, meta | TBD |
| `apps/showcase-deep-recovery/src/environment.ts:22` | model(assets.deepRecoveryWreckHull, { material }) | color=true emissive=false material={         name: "distant oxidized wreck dressing",         color: "#5c3b31",         roughness: 0.68,         metal | TBD |
| `apps/showcase-product-configurator/src/main.ts:297` | model(productAsset, { material }) | color=undefined emissive=undefined followed=identifier productMaterial material=productMaterialFor(nextState) | TBD |
| `apps/showcase-webgpu-particle-lab/src/main.ts:181` | model(particleCoreAsset, { material }) | color=true emissive=true material={ color: "#64d8d3", emissive: "#64d8d3", emissiveIntensity: 0.68 } [props:color,emissive,emissiveIntensity] | TBD |
| `apps/showcase-aurora-lander/src/main.ts:763` | model(assets.auroraLanderProbe, { material }) | color=true emissive=false material={ name: "ghost translucency", color: "#7dd3fc", roughness: 0.4, opacity: 0.32 } [props:name,color,roughness,opacity | TBD |
| `apps/showcase-skyline-runner/src/main.ts:378` | model(assets.propPineTree, { material }) | color=true emissive=true followed=identifier relayTreeMaterial material={         name: "Steel Dawn relay pine silhouettes",         color: "#10253a", | TBD |
| `apps/showcase-skyline-runner/src/main.ts:1185` | model(asset, { material }) | color=true emissive=true followed=identifier dressingMaterial material={       name: `steel dawn ${isRock ? "rock" : "pine"} silhouette wash`,       c | TBD |
| `apps/showcase-skyline-runner/src/main.ts:1556` | model(assets.skylineHeroRunner, { material }) | color=true emissive=true material={     name: "skyline ghost echo shell",     color: "#21c4df",     emissive: "#12a5c7",     emissiveIntensity: 0.18,  | TBD |
| `apps/showcase-neon-swarm/src/main.ts:688` | model(visualReviewCapture ? assets.neonRainCourierHero : assets.neonCourierAvatar, { mater | color=true emissive=true material={       name: "courier cyan shell",       // The courier is the only pale value in the finale palette. That value    | TBD |
| `apps/showcase-data-galaxy/src/main.ts:235` | model(dataCoreAsset, { material }) | color=true emissive=true material={ color: "#64f4cf", emissive: "#64f4cf", emissiveIntensity: 0.72 } [props:color,emissive,emissiveIntensity] | TBD |
| `apps/showcase-data-galaxy/src/main.ts:246` | model(dataCoreAsset, { material }) | color=true emissive=false material={ color: "#64f4cf", opacity: 0.28, roughness: 0.2 } [props:color,opacity,roughness] | TBD |
| `apps/showcase-gravity-post/src/main.ts:484` | model(assets.gravityPostDockGate, { material }) | color=true emissive=true material={           name: station.id + " dock gate finish",           color: "#b7f4ff",           roughness: 0.26,           | TBD |
| `apps/showcase-material-asset-inspector/src/main.ts:235` | model(inspectedAsset, { material }) | color=true emissive=false material={ color: "#252627", roughness: 0.5, metallic: 0.08 } [props:color,roughness,metallic] | TBD |
| `apps/showcase-material-asset-inspector/src/main.ts:256` | model(inspectedAsset, { material }) | color=undefined emissive=undefined followed=identifier previewMaterial material=nextState.lighting === "metal"     ? material.brushedMetal({ color: "# | TBD |
| `apps/showcase-turbo-drift-circuit/src/main.ts:3217` | model(assets.showcaseCc0FormulaRaceCar, { material }) | color=true emissive=true material={         name: "time trial ghost shell",         color: "#8fd8ff",         emissive: "#2f9dd8",         emissiveInt | TBD |

## pin-emissive-defaults dry-run — 299 sites

- exact (`material.emissive`/`material.neon` calls missing `emissiveIntensity`): 223
- approximate (`{ emissive: ... }` object literals missing `emissiveIntensity`): 76
- apps/: 161 · packages/: 138
- The codemod is pure and run per-route by PRD 14 when a route opts into `A3D_QR_MATERIALS`; its report rows + `git diff --stat` attach to the route PR (§10.6). Nothing was rewritten by this dry run.

## Aura Clash (§10.3)

PRD 14 replaces the `material.setParameter` pokes (`apps/aura-clash-showcase/**/AuraClashArenaApp.ts` hit-flash + tint sites) with `actor.setMaterialOverrides([...])`; PRD 04 attaches the exact patch to request Q-14-2. Whether the fighter GLBs carry baseColor textures is recorded here once `aura3d assets inspect` output lands in the phase-2 pass.
