/**
 * C-10 — lighting model and lights API (engine side, CONTRACTS.md). Provider: PRD 02.
 * Flag: A3D_QR_LIGHTING. AuraLightType gains "hemisphere" in PR 0a (index.ts:1542).
 */

import type { AuraNodeBuilder } from "../agent-api/nodes/builder.js";
import type { AuraColor, AuraVec3, AuraLightNode, AuraAssetRef } from "../agent-api/nodes/types.js";
import type { AuraQualityTier } from "@aura3d/rendering/contracts";
import type { IESProfile } from "@aura3d/assets";
import type { NativeBakedLightmapRenderData, NativeLightProbeGrid, ProbeOutsidePolicy, VoxelIndirectLighting } from "@aura3d/rendering/lighting";

/**
 * A parsed Type-C distribution. Its candelas replace the punctual light's
 * scalar candela value; `scale` applies a linear dimmer. The local forward
 * axis points from the light toward `target`, 0 degrees is along that axis,
 * and `rotation` turns the profile around it in radians.
 */
export interface AuraPhotometricProfile {
  readonly profile: IESProfile;
  readonly scale?: number;
  readonly rotation?: number;
}

/** Spot-light projection sampled in local light space and multiplied by shadow visibility. */
export interface AuraProjectedLightImage {
  readonly texture: AuraAssetRef<"texture">;
  /** UV offset, default [0, 0]. */
  readonly offset?: readonly [number, number];
  /** UV scale, default [1, 1]. */
  readonly scale?: readonly [number, number];
  /** UV rotation around the image center, in radians. */
  readonly rotation?: number;
}

/** Explicit capacity and fallback choice for the local-light clustering path. */
export interface AuraClusteredLightingOptions {
  readonly enabled?: boolean;
  readonly maxLights?: number;
  readonly maxLightsPerCluster?: number;
  readonly fallback?: "forward" | "error";
}

/** Bounds and resolution of an irradiance probe grid, with a finite update budget. */
export interface AuraLightProbeGridOptions {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
  readonly resolution: readonly [number, number, number];
  readonly maxUpdatesPerFrame?: number;
}

export type AuraLightingModel = "physical" | "legacy-3.0";
export interface AuraLightingOptions { readonly model?: AuraLightingModel; readonly autoSunShadow?: boolean; readonly quality?: AuraQualityTier | "auto"; readonly maxShadowedLights?: number; readonly clustered?: AuraClusteredLightingOptions; }
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
/** A runtime-only indirect-light source; neither resource is serialized into the scene. */
export type AuraAdvancedIndirectSource =
  | { readonly kind: "probe-grid"; readonly grid: NativeLightProbeGrid }
  | { readonly kind: "voxel"; readonly volume: VoxelIndirectLighting };

export interface AuraProbeGridAttachmentOptions {
  readonly intensity?: number;
  /** `null` leaves the existing environment outside the grid. */
  readonly outside?: ProbeOutsidePolicy;
}

export interface AuraVoxelAttachmentOptions {
  readonly intensity?: number;
  /** Maximum trace distance in world units, up to four volume diagonals. */
  readonly maxDistance?: number;
}

export type AuraAdvancedIndirectOptions = AuraProbeGridAttachmentOptions | AuraVoxelAttachmentOptions;

export interface AuraLightmapAttachmentOptions {
  /**
   * `replace-diffuse` replaces dynamic diffuse lighting where the bake has
   * coverage, while preserving dynamic specular; `add-indirect` adds an
   * indirect-only bake. Choose explicitly to avoid double-counting light.
   */
  readonly composition: "replace-diffuse" | "add-indirect";
  readonly intensity?: number;
}

/** The requested advanced-lighting renderer path is not available for this app. */
export class AuraAdvancedLightingUnavailableError extends Error {
  readonly code = "ADVANCED_LIGHTING_RENDER_PATH_UNAVAILABLE";

  constructor() {
    super("Advanced lighting requires a ready renderer with a compatible lighting consumer.");
    this.name = "AuraAdvancedLightingUnavailableError";
  }
}

export interface AuraLightingRuntime {
  updateProbe(name: string): Promise<void>;
  rebakeIrradiance(name?: string): Promise<void>;
  /** Absolute yaw (radians, about +Y) applied to probe / IBL sampling of the active environment. */
  setEnvironmentRotation(radians: number): void;
  setEnvironmentIntensity(value: number): void;
  /** GU47 E-B: swap the scene environment to `texture` (an `.hdr` texture asset) at runtime, optionally cross-fading. */
  setEnvironment(texture: AuraAssetRef<"texture">, opts?: AuraEnvironmentSwapOptions): void;
  /**
   * Attach one caller-owned probe grid or voxel volume to the current scene.
   * Replacing it invalidates its old detach handle. Attachment requires a
   * ready renderer that supports the selected source and its material path.
   * The generated physical forward path accepts one diffuse source per draw;
   * it rejects incompatible materials, attached lightmaps and overlapping
   * PRD02 irradiance volumes. The source remains owned by the caller.
   */
  attachIndirect(source: Extract<AuraAdvancedIndirectSource, { kind: "probe-grid" }>, options?: AuraProbeGridAttachmentOptions): () => void;
  attachIndirect(source: Extract<AuraAdvancedIndirectSource, { kind: "voxel" }>, options?: AuraVoxelAttachmentOptions): () => void;
  attachIndirect(source: AuraAdvancedIndirectSource, options?: AuraAdvancedIndirectOptions): () => void;
  /**
   * Attach a caller-owned completed lightmap to a named scene mesh. Supported
   * UV channels and material paths are validated by the active renderer; the
   * name must identify exactly one node that emits one draw item. The caller
   * must use the geometry and UV atlas that were used for the bake. The current
   * renderer rejects bakes containing authored ambient or direct lights for
   * either composition, and rejects concurrent global indirect sources.
   * Both lightmap and indirect attachments are cleared by `setScene`; callers
   * reattach them after loading or replacing a scene.
   */
  attachLightmap(nodeName: string, lightmap: NativeBakedLightmapRenderData, options: AuraLightmapAttachmentOptions): () => void;
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
  attachIndirect(_source: AuraAdvancedIndirectSource, _options?: AuraAdvancedIndirectOptions): () => void { throw new AuraAdvancedLightingUnavailableError(); }
  attachLightmap(_nodeName: string, _lightmap: NativeBakedLightmapRenderData, _options: AuraLightmapAttachmentOptions): () => void { throw new AuraAdvancedLightingUnavailableError(); }
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
