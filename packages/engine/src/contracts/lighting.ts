/**
 * C-10 — lighting model and lights API (engine side, CONTRACTS.md). Provider: PRD 02.
 * Flag: A3D_QR_LIGHTING. AuraLightType gains "hemisphere" in PR 0a (index.ts:1542).
 */

import type { AuraColor, AuraVec3, AuraNodeBuilder, AuraLightNode } from "../agent-api/index";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";

export type AuraLightingModel = "physical" | "legacy-3.0";
export interface AuraLightingOptions { readonly model?: AuraLightingModel; readonly autoSunShadow?: boolean; readonly quality?: AuraQualityTier | "auto"; readonly maxShadowedLights?: number; }
// AuraCreateAppOptions.lighting?: AuraLightingOptions    (PR 0a)
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

/**
 * PR 0a stub runtime: hemisphere lowers to two directional fills at 0.5
 * intensity each (sky above, ground below) with a `capability-degraded`
 * degradation; diagnostics reports observed values with unknown fields null.
 */
export class StubLightingRuntime implements AuraLightingRuntime {
  private rotation = 0;
  private intensity = 1;

  async updateProbe(_name: string): Promise<void> { /* no probe path on the stub */ }
  async rebakeIrradiance(_name?: string): Promise<void> { /* noop */ }
  setEnvironmentRotation(radians: number): void { this.rotation = radians; }
  setEnvironmentIntensity(value: number): void { this.intensity = value; }
  diagnostics(): AuraLightingDiagnostics {
    return {
      environment: { source: "legacy", faceSize: 0, mipCount: 0, format: "rgba16f", shBound: false, backgroundDrawn: false, pmremGpuMs: null },
      shadows: [],
      droppedFeatures: [],
      contactShadows: { passExecuted: false },
      programCompileCount: 0,
      readPixelsCalls: 0
    };
  }
}
