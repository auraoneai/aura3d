/**
 * C-10 — lighting model and lights API (engine side, CONTRACTS.md). Provider: PRD 02.
 * Flag: A3D_QR_LIGHTING. AuraLightType gains "hemisphere" in PR 0a (index.ts:1542).
 */

import type { AuraColor, AuraVec3, AuraNodeBuilder, AuraLightNode, AuraAssetRef } from "../agent-api/index";
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
  /** Sun row: `cascadeCount` fitted this frame and `skippedCascades` (indices allocated but not redrawn, PRD-2 WP-7). */
  readonly shadows: readonly { readonly light: string; readonly filter: string; readonly casterVariants: readonly string[]; readonly sampled: boolean; readonly cascadeCount?: number; readonly skippedCascades?: readonly number[] }[];
  readonly droppedFeatures: readonly string[];
  readonly contactShadows: { readonly passExecuted: boolean };
  readonly programCompileCount: number;
  readonly readPixelsCalls: number;
  /** GU47 E-B: visible authored punctual lights (directional, point, spot, rect/softbox) this app submitted on its last frame. */
  readonly punctualLights: number;
  /**
   * GU47 E-B: visible local (spot/point) lights holding a shadow caster slot on the last frame, at most the quality
   * tier's `localShadowLights` (low 0, medium 1, high 2, ultra 4; a scene whose only shadow request is one local light
   * keeps that caster on every tier). The sun is not counted. When the PRD-02 shadow pass renders local tiles, each
   * caster also has a `local-<i>` row in `shadows`.
   */
  readonly localShadowLights: number;
}
/** GU47 E-B: options of `app.lighting.setEnvironment`. */
export interface AuraEnvironmentSwapOptions {
  /**
   * Scale on the environment term (image-based diffuse + specular) once the new environment is bound; the same
   * value `setEnvironmentIntensity` takes (finite, >= 0). Default: the current scale.
   */
  readonly intensity?: number;
  /** Draw the new environment as the background. Default: what the current environment does (false when none). */
  readonly background?: boolean;
  /** Yaw of the new environment in degrees; same as calling `setEnvironmentRotation` with the radians. */
  readonly rotationDeg?: number;
  /**
   * Seconds of the swap: the outgoing environment term fades out over the first half and the incoming one fades in
   * over the second half (the probe swaps when the new one is ready; one probe is bound per frame). Default 0.
   */
  readonly crossfadeSeconds?: number;
}
export interface AuraLightingRuntime {
  updateProbe(name: string): Promise<void>;
  rebakeIrradiance(name?: string): Promise<void>;
  /** Absolute yaw (radians, about +Y) applied to probe / IBL sampling of the active environment. */
  setEnvironmentRotation(radians: number): void;
  setEnvironmentIntensity(value: number): void;
  /** GU47 E-B: swap the scene environment to `texture` (an `.hdr` texture asset) at runtime, optionally cross-fading. */
  setEnvironment(texture: AuraAssetRef<"texture">, opts?: AuraEnvironmentSwapOptions): void;
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
  private environment: AuraAssetRef<"texture"> | null = null;

  async updateProbe(_name: string): Promise<void> { /* no probe path on the stub */ }
  async rebakeIrradiance(_name?: string): Promise<void> { /* noop */ }
  setEnvironmentRotation(radians: number): void { this.rotation = radians; }
  setEnvironmentIntensity(value: number): void { this.intensity = value; }
  /** Bookkeeping only on the stub: no probe path exists to swap. */
  setEnvironment(texture: AuraAssetRef<"texture">, opts?: AuraEnvironmentSwapOptions): void {
    this.environment = texture;
    if (opts?.intensity !== undefined) this.intensity = opts.intensity;
    if (opts?.rotationDeg !== undefined) this.rotation = (opts.rotationDeg * Math.PI) / 180;
  }
  diagnostics(): AuraLightingDiagnostics {
    void this.environment;
    return {
      environment: { source: "legacy", faceSize: 0, mipCount: 0, format: "rgba16f", shBound: false, backgroundDrawn: false, pmremGpuMs: null },
      shadows: [],
      droppedFeatures: [],
      contactShadows: { passExecuted: false },
      programCompileCount: 0,
      readPixelsCalls: 0,
      punctualLights: 0,
      localShadowLights: 0
    };
  }
}
