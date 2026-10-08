/**
 * PRD-05 §6.2 — optimize profile table (Phase 0 slice).
 *
 * The admission gates (G1 triangle band, G3 PBR completeness) need the profile
 * triangle floors/ceilings and role→profile resolution inside the CLI, so the
 * §6.2 table lives here as the single source of truth. Phase 2 adds the full
 * `AssetOptimizeProfile` (LOD chains, texture encodings, KTX flags) in
 * `tools/asset-optimize/profiles.ts` re-using these records.
 */

import type { AuraCliAssetRole } from "../asset-core-types.js";

export type AssetOptimizeProfileName =
  | "hero-character"
  | "npc-character"
  | "hero-vehicle"
  | "traffic-vehicle"
  | "product"
  | "weapon"
  | "prop-large"
  | "prop-small"
  | "world-chunk"
  | "track"
  | "backdrop"
  | "hdri";

export interface AdmissionProfile {
  readonly id: AssetOptimizeProfileName;
  /** Roles from the §6.2 table that resolve to this profile. */
  readonly roles: readonly string[];
  /** G1 admission minimum on LOD0 triangles (undefined = no floor). */
  readonly trianglesFloor?: number;
  /** LOD0 optimization target. */
  readonly trianglesTarget?: number;
  /** G1 admission maximum on LOD0 triangles. */
  readonly trianglesCeiling?: number;
  /** §6.4 default gameplay camera for G2 (entry `gameplayCamera` overrides). */
  readonly gameplayCamera?: { readonly distance: number; readonly fovDegrees: number };
  /** §17.2 derived-file budget (High tier). */
  readonly fileBytesHigh?: number;
  /** §17.2 mobile derived-file budget. */
  readonly fileBytesMobile?: number;
  /** §17.2 GPU bytes budget (High tier). */
  readonly gpuBytesHigh?: number;
  /** §6.4 absolute texel-density floor (px/m effective). */
  readonly texelFloorPxPerMeter?: number;
}

const MB = 1_000_000;

export const ADMISSION_PROFILES: Readonly<Record<AssetOptimizeProfileName, AdmissionProfile>> = {
  "hero-character": { id: "hero-character", roles: ["character", "hero"], trianglesFloor: 5_000, trianglesTarget: 25_000, trianglesCeiling: 60_000, gameplayCamera: { distance: 4, fovDegrees: 50 }, fileBytesHigh: 6 * MB, fileBytesMobile: 2.5 * MB, gpuBytesHigh: 20 * MB, texelFloorPxPerMeter: 256 },
  "npc-character": { id: "npc-character", roles: ["enemy"], trianglesFloor: 2_000, trianglesTarget: 10_000, trianglesCeiling: 25_000, gameplayCamera: { distance: 4, fovDegrees: 50 }, fileBytesHigh: 2 * MB, fileBytesMobile: 1 * MB, gpuBytesHigh: 6 * MB, texelFloorPxPerMeter: 256 },
  "hero-vehicle": { id: "hero-vehicle", roles: ["vehicle"], trianglesFloor: 8_000, trianglesTarget: 40_000, trianglesCeiling: 80_000, gameplayCamera: { distance: 7, fovDegrees: 55 }, fileBytesHigh: 5 * MB, fileBytesMobile: 2 * MB, gpuBytesHigh: 20 * MB, texelFloorPxPerMeter: 128 },
  "traffic-vehicle": { id: "traffic-vehicle", roles: [], trianglesFloor: 3_000, trianglesTarget: 12_000, trianglesCeiling: 25_000, gameplayCamera: { distance: 7, fovDegrees: 55 }, fileBytesHigh: 1.5 * MB, fileBytesMobile: 0.8 * MB, gpuBytesHigh: 5 * MB, texelFloorPxPerMeter: 128 },
  "product": { id: "product", roles: ["product"], trianglesFloor: 10_000, trianglesTarget: 60_000, trianglesCeiling: 150_000, gameplayCamera: { distance: 1.5, fovDegrees: 30 }, fileBytesHigh: 8 * MB, fileBytesMobile: 3 * MB, gpuBytesHigh: 32 * MB, texelFloorPxPerMeter: 128 },
  "weapon": { id: "weapon", roles: ["weapon"], trianglesFloor: 1_500, trianglesTarget: 6_000, trianglesCeiling: 15_000, gameplayCamera: { distance: 1.2, fovDegrees: 60 }, fileBytesHigh: 1 * MB, fileBytesMobile: 0.5 * MB, gpuBytesHigh: 4 * MB, texelFloorPxPerMeter: 96 },
  "prop-large": { id: "prop-large", roles: ["prop"], trianglesFloor: 500, trianglesTarget: 4_000, trianglesCeiling: 15_000, gameplayCamera: { distance: 6, fovDegrees: 50 }, fileBytesHigh: 1 * MB, fileBytesMobile: 0.5 * MB, gpuBytesHigh: 4 * MB, texelFloorPxPerMeter: 96 },
  "prop-small": { id: "prop-small", roles: ["prop", "set-dressing"], trianglesFloor: 100, trianglesTarget: 1_000, trianglesCeiling: 5_000, gameplayCamera: { distance: 3, fovDegrees: 50 }, fileBytesHigh: 0.3 * MB, fileBytesMobile: 0.15 * MB, gpuBytesHigh: 1.5 * MB, texelFloorPxPerMeter: 96 },
  "world-chunk": { id: "world-chunk", roles: ["world", "environment"], trianglesTarget: 120_000, trianglesCeiling: 250_000, gameplayCamera: { distance: 15, fovDegrees: 55 }, fileBytesHigh: 8 * MB, fileBytesMobile: 4 * MB, gpuBytesHigh: 32 * MB, texelFloorPxPerMeter: 64 },
  "track": { id: "track", roles: ["track"], trianglesTarget: 60_000, trianglesCeiling: 150_000, gameplayCamera: { distance: 15, fovDegrees: 55 }, fileBytesHigh: 6 * MB, fileBytesMobile: 3 * MB, gpuBytesHigh: 24 * MB, texelFloorPxPerMeter: 64 },
  "backdrop": { id: "backdrop", roles: ["backdrop"], trianglesFloor: 4, trianglesCeiling: 2_000, gameplayCamera: { distance: 30, fovDegrees: 55 }, fileBytesHigh: 1.5 * MB, fileBytesMobile: 0.6 * MB, gpuBytesHigh: 6 * MB },
  "hdri": { id: "hdri", roles: ["hdri", "environment"], fileBytesHigh: 7 * MB, fileBytesMobile: 1.7 * MB },
};

/**
 * §6.2 role→profile resolution. `bounds` disambiguates `prop` into
 * `prop-large` (≥ 1 m gameplay-relevant) vs `prop-small` (< 1 m). Roles that
 * carry no geometry profile (proxy, debug, abstract, unknown, audio,
 * texture-set, vfx-atlas) return undefined — geometry gates record
 * `waived-by-role` for them.
 */
export function profileForRole(
  role: AuraCliAssetRole | string | undefined,
  bounds?: readonly number[],
): AdmissionProfile | undefined {
  switch (role) {
    case "character":
    case "hero":
      return ADMISSION_PROFILES["hero-character"];
    case "enemy":
      return ADMISSION_PROFILES["npc-character"];
    case "vehicle":
      return ADMISSION_PROFILES["hero-vehicle"];
    case "product":
      return ADMISSION_PROFILES["product"];
    case "weapon":
      return ADMISSION_PROFILES["weapon"];
    case "prop": {
      const maxDimension = bounds !== undefined && bounds.length > 0 ? Math.max(...bounds) : 0;
      return maxDimension >= 1 ? ADMISSION_PROFILES["prop-large"] : ADMISSION_PROFILES["prop-small"];
    }
    case "set-dressing":
      return ADMISSION_PROFILES["prop-small"];
    case "world":
    case "environment":
      return ADMISSION_PROFILES["world-chunk"];
    case "track":
      return ADMISSION_PROFILES["track"];
    case "backdrop":
      return ADMISSION_PROFILES["backdrop"];
    case "hdri":
      return ADMISSION_PROFILES["hdri"];
    default:
      return undefined;
  }
}

/**
 * G3 role coverage (PRD-05 §6.4): character/vehicle/product/weapon/world/
 * track/environment, plus `prop` only when it resolves to `prop-large`
 * (hero/enemy map onto the character profiles). Takes no free text — the
 * deleted `requiresTextureEvidence` regex waiver is gone for good.
 */
export function requiresPbrTextures(role: AuraCliAssetRole | string | undefined, profile: AdmissionProfile | undefined): boolean {
  // Fail-safe: an undeclared/unknown role can claim no exemption — release
  // admission treats it as texture-required. Roles that resolve to a real
  // non-PBR profile (prop-small via prop/set-dressing, backdrop, hdri) or no
  // profile at all (proxy, debug, abstract, texture-set, vfx-atlas, audio)
  // are legitimately waived.
  if (role === undefined || role === "unknown") return true;
  return profile !== undefined && PBR_REQUIRED_PROFILES.has(profile.id);
}

const PBR_REQUIRED_PROFILES: ReadonlySet<AssetOptimizeProfileName> = new Set([
  "hero-character",
  "npc-character",
  "hero-vehicle",
  "traffic-vehicle",
  "product",
  "weapon",
  "prop-large",
  "world-chunk",
  "track",
]);
