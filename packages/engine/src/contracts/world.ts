/**
 * C-26 — world queries (CONTRACTS.md). Provider: PRD 10. Flag: A3D_QR_WORLD.
 */

import type { AuraVec3, AuraApp } from "../agent-api/index";
import type { AuraQualityTier, ContractSlot } from "@aura3d/rendering/contracts";
import { defineContractSlot } from "@aura3d/rendering/contracts";
import type { AuraSkySpec, AuraHeightFogSpec } from "./atmosphere";
import type { AuraPostPresetId } from "./post";

export interface GroundRaycaster { raycastDown(x: number, z: number, fromY?: number, maxDistance?: number): { readonly point: AuraVec3; readonly normal: AuraVec3; readonly distance: number; readonly nodeId?: string } | null; }
export interface AuraHeightQuery { heightAt(x: number, z: number): number; normalAt(x: number, z: number): AuraVec3; occluderHeightAt?(x: number, z: number): number; }
export interface AuraWindSpec { readonly direction?: AuraVec3; readonly strength?: number; readonly gust?: number; readonly gustFrequency?: number; readonly turbulence?: number; }
/** UBO "A3DWind" { vec4 u_windDirStrength; vec4 u_windGust; } + chunk "a3d_prd10_wind": vec3 a3dWindOffset(vec3 localPos, vec3 instanceOrigin, vec4 weights, float assetHeight). */
export const WIND_CHUNK: "a3d_prd10_wind" = "a3d_prd10_wind";
export type AuraBiomeId = "outdoor-day" | "golden-hour" | "overcast" | "night-city" | "polar-night" | "alpine-snow" | "interior-warm" | "interior-neutral" | "interior-industrial" | "space" | "underwater";
export type AuraWorldQualityTier = AuraQualityTier;
export interface AuraBiomeRig { readonly id: AuraBiomeId; readonly sky: AuraSkySpec | null; readonly fog: AuraHeightFogSpec | null; readonly post: AuraPostPresetId; readonly environment: "sky-capture" | "hdri" | "room" | "space-bake"; readonly sun?: { readonly elevationDeg: number; readonly azimuthDeg: number; readonly intensity: number; readonly colorTemperatureK: number }; }
export interface AuraWorldQueries { ground(): GroundRaycaster; height(): AuraHeightQuery; wind(): Required<AuraWindSpec>; biome(): AuraBiomeRig | null; describeBiome(id: AuraBiomeId, tier?: AuraWorldQualityTier): AuraBiomeRig; listBiomes(): readonly AuraBiomeId[]; }

const BIOME_IDS: readonly AuraBiomeId[] = ["outdoor-day", "golden-hour", "overcast", "night-city", "polar-night", "alpine-snow", "interior-warm", "interior-neutral", "interior-industrial", "space", "underwater"];

const OUTDOOR_POST: AuraPostPresetId = "daylight-outdoor";

/**
 * PR 0a stub queries: `ground()` raycasts the physics world when one exists,
 * else falls back to the plane y = 0; `height()` returns 0 and the up normal;
 * `wind()` returns zero strength; `biome()` returns null; `describeBiome`
 * returns a rig built from today's `environments.*` presets with
 * `post: "daylight-outdoor"` for outdoor ids.
 */
class StubWorldQueries implements AuraWorldQueries {
  constructor(private readonly raycast: ((x: number, z: number, fromY?: number, maxDistance?: number) => { readonly point: AuraVec3; readonly normal: AuraVec3; readonly distance: number; readonly nodeId?: string } | null) | null = null) {}

  ground(): GroundRaycaster {
    const raycast = this.raycast;
    return {
      raycastDown: (x, z, fromY = 100, maxDistance = 1000) => {
        if (raycast) return raycast(x, z, fromY, maxDistance);
        const distance = fromY;
        if (distance > maxDistance) return null;
        return { point: [x, 0, z], normal: [0, 1, 0], distance };
      }
    };
  }

  height(): AuraHeightQuery {
    return {
      heightAt: () => 0,
      normalAt: () => [0, 1, 0]
    };
  }

  wind(): Required<AuraWindSpec> {
    return { direction: [0, 0, 0], strength: 0, gust: 0, gustFrequency: 0, turbulence: 0 };
  }

  biome(): AuraBiomeRig | null {
    return null;
  }

  describeBiome(id: AuraBiomeId, _tier?: AuraWorldQualityTier): AuraBiomeRig {
    const outdoor = id === "outdoor-day" || id === "golden-hour" || id === "overcast" || id === "alpine-snow";
    const interior = id.startsWith("interior");
    return {
      id,
      sky: outdoor ? ({ model: "gradient", zenith: "#7fb2ff", horizon: "#e8f1ff", sun: { elevationDeg: 45, azimuthDeg: 180 } } as AuraSkySpec) : null,
      fog: outdoor ? { mode: "linear", near: 40, far: 220 } : null,
      post: outdoor ? OUTDOOR_POST : id === "space" || id === "night-city" || id === "polar-night" ? "neon-night" : "product-studio",
      environment: outdoor ? "sky-capture" : interior ? "room" : "space-bake",
      sun: outdoor ? { elevationDeg: 45, azimuthDeg: 180, intensity: 3, colorTemperatureK: 5600 } : undefined
    };
  }

  listBiomes(): readonly AuraBiomeId[] {
    return BIOME_IDS;
  }
}

export const worldQueriesSlot: ContractSlot<(app: AuraApp) => AuraWorldQueries> =
  defineContractSlot("C-26", "prd10", "A3D_QR_WORLD", () => new StubWorldQueries());
// AuraApp.world: AuraWorldRuntime (PRD 10 full runtime: timeOfDay/wind/terrain/water/diagnostics) extends AuraWorldQueries (via C-38)
