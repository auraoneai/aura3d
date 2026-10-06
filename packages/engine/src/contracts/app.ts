/**
 * C-38 — app surface extension registry (CONTRACTS.md). Provider: PRD 15.
 * PR 0 delivers this real; the seam `app/createAuraApp.ts` calls it once per app.
 */

import type { RegistryEntry } from "@aura3d/rendering/contracts";
import { createRegistry } from "@aura3d/rendering/contracts";
import type { QrFlags } from "@aura3d/rendering/contracts";
import type { AuraApp, AuraCreateAppOptions } from "../agent-api/index";
import type { AuraLightingRuntime } from "./lighting";
import type { AuraCameraController } from "./camera";
import type { AuraTimeController, AuraFeelBus } from "./time";
import type { AuraAppEffects } from "./effects";
import type { AuraAppAtmosphere } from "./atmosphere";
import type { AuraWorldQueries } from "./world";
import type { AuraQualityController } from "@aura3d/rendering/contracts";
import type { AuraOutputSurface } from "./output";
import type { AuraPostSurface } from "./post";

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

const appExtensions = createRegistry<AppExtension<keyof AuraAppExtensionMap>>("appExtensions");

export function registerAppExtension<K extends keyof AuraAppExtensionMap>(ext: AppExtension<K>): () => void {
  return appExtensions.register(ext as AppExtension<keyof AuraAppExtensionMap>);
}

export function appExtensionsAll(): readonly AppExtension<keyof AuraAppExtensionMap>[] {
  return appExtensions.all();
}
// AuraApp extends AuraAppExtensionMap (PR 0a): every member always present; stub factories registered in PR 0a under owner "prd15" with the provider lane's flag; the provider lane registers its real factory with the SAME member and flag — resolution: real if provided && flag on.
// Flattened methods on AuraApp (PR 0a): setOutput, setOutputOverlay, capture, onRendererError (C-05); addPostPass, setQualityTier, cutCamera (C-13/C-14); precompile (C-02/C-27); lookSignature(): Promise<string>, lookManifest(): AuraLookManifest (prd09); onRender (C-23).
// AuraCreateAppOptions additions (PR 0a, all optional): qualityRebuild, lighting, output, pixelRatio (number | {max?, min?}), assets, animation, camera, accessibility, strict, onDegradation, compat ({ post?: "3.0" }), loop (AuraLoopOptions)
// AuraCreateAppRendererOptions additions (PR 0a, all optional): quality, output, resolution, msaa, compile, strictMount, debug, renderScale, backend, adaptive, targetFrameRate, batching, vfx, vfxOverrides, skinnedShadows, morph, skinnedPbr, materialStrictness, materialModel, transmission, alphaToCoverage, debugView
