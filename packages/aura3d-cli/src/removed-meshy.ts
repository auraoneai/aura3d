/**
 * Deprecated public exports kept only so 5.x consumers still compile.
 *
 * Meshy support was removed from `@aura3d/cli` in 5.7.0. These declarations keep
 * their 5.6.0 shapes (a minor release cannot remove public exports), and every
 * function throws. Admit a GLB you already have with `aura3d assets add` or
 * `aura3d assets convert`, or generate one with `aura3d assets generate`.
 */
import type { AssetInspectionReport } from "./asset-inspection-types.js";
import type { AssetCliResult, AuraAssetQuality, AuraCliAssetRole } from "./asset-core-types.js";
import type { AssetGeometryFacts } from "./asset-role-admission.js";

const REMOVED_MESSAGE = "Meshy support was removed in 5.7.0. Admit an existing GLB with `aura3d assets add` (or `aura3d assets convert`), or generate one with `aura3d assets generate`.";

function removed(name: string): never {
  throw new Error(`${name}: ${REMOVED_MESSAGE}`);
}

/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export type MeshyAssetProfile = "prop" | "environment" | "vehicle" | "humanoid";
/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export type MeshyAdmissionVerdict = "pass" | "fail" | "unproven" | "advisory";

/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export interface MeshyAdmissionCheck {
  readonly id: string;
  readonly verdict: MeshyAdmissionVerdict;
  readonly detail: string;
  readonly measured?: number | string | boolean;
  readonly limit?: number;
}

/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export interface MeshyAdmissionReport {
  readonly schema: "aura3d.meshy-admission/1.0";
  readonly profile: MeshyAssetProfile;
  readonly candidateQuality: true;
  readonly routeReady: boolean;
  readonly checks: readonly MeshyAdmissionCheck[];
  readonly blockers: readonly string[];
  readonly unproven: readonly string[];
  readonly nextActions: readonly string[];
}

/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export interface ImportMeshyOptions {
  readonly projectDir?: string;
  readonly input: string;
  readonly name: string;
  readonly file?: string;
  readonly thumbnail?: string;
  readonly allowedRoot?: string;
  readonly rightsEvidence: string;
  readonly quality?: AuraAssetQuality;
  readonly role?: AuraCliAssetRole;
  readonly profile?: MeshyAssetProfile;
  /** §6.5 release path: candidate entry id whose --from-generated derived bytes are being imported. */
  readonly sourceEntry?: string;
}

/** @deprecated Meshy support was removed in 5.7.0; kept for type compatibility only. */
export interface ImportMeshyResult extends AssetCliResult {
  readonly typedKey: string;
  readonly sourceFile: string;
  readonly metadataFile: string;
  readonly rightsEvidence: string;
  readonly thumbnailEvidence?: string;
  readonly admission: MeshyAdmissionReport;
  readonly nextCommands: readonly string[];
}

/**
 * @deprecated Meshy support was removed in 5.7.0. Always throws. Use
 * `aura3d assets add` (or `aura3d assets convert`) for a GLB you already have.
 */
export function importMeshyAsset(options: ImportMeshyOptions): ImportMeshyResult {
  void options;
  return removed("importMeshyAsset");
}

/**
 * @deprecated Meshy support was removed in 5.7.0. Always throws. `aura3d assets
 * validate` and `aura3d assets inspect` report bounds, triangles and textures for any GLB.
 */
export function createMeshyAdmissionReport(options: {
  readonly profile: MeshyAssetProfile;
  readonly inspection: AssetInspectionReport;
  readonly geometry: AssetGeometryFacts;
  readonly textureDimensions?: readonly { readonly label: string; readonly width: number; readonly height: number }[];
  readonly hasThumbnailEvidence?: boolean;
}): MeshyAdmissionReport {
  void options;
  return removed("createMeshyAdmissionReport");
}

/** @deprecated Meshy support was removed in 5.7.0. Always throws. */
export function inferMeshyAssetProfile(role: AuraCliAssetRole | undefined): MeshyAssetProfile {
  void role;
  return removed("inferMeshyAssetProfile");
}

/**
 * @deprecated Meshy support was removed in 5.7.0. Always throws. `aura3d assets
 * inspect` reports texture dimensions for any GLB.
 */
export function inspectMeshyTextureDimensions(file: string): readonly { readonly label: string; readonly width: number; readonly height: number }[] {
  void file;
  return removed("inspectMeshyTextureDimensions");
}
