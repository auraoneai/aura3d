import { readFileSync } from "node:fs";
import type { AssetInspectionReport } from "../asset-inspection-types.js";
import type { AuraCliAssetRole } from "../asset-core-types.js";
import type { AssetGeometryFacts } from "../asset-role-admission.js";

export type MeshyAssetProfile = "prop" | "environment" | "vehicle" | "humanoid";
export type MeshyAdmissionVerdict = "pass" | "fail" | "unproven" | "advisory";

export interface MeshyAdmissionCheck {
  readonly id: string;
  readonly verdict: MeshyAdmissionVerdict;
  readonly detail: string;
  readonly measured?: number | string | boolean;
  readonly limit?: number;
}

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

interface ProfileLimits {
  readonly maxTriangles: number;
  readonly maxTextures: number;
  readonly maxTextureDimension: number;
  readonly minTriangles?: number;
}

const PROFILE_LIMITS: Readonly<Record<MeshyAssetProfile, ProfileLimits>> = {
  prop: { maxTriangles: 100_000, maxTextures: 8, maxTextureDimension: 4_096 },
  environment: { maxTriangles: 500_000, maxTextures: 16, maxTextureDimension: 8_192 },
  vehicle: { maxTriangles: 250_000, maxTextures: 12, maxTextureDimension: 4_096, minTriangles: 1_000 },
  humanoid: { maxTriangles: 150_000, maxTextures: 12, maxTextureDimension: 4_096, minTriangles: 3_000 }
};

export function inferMeshyAssetProfile(role: AuraCliAssetRole | undefined): MeshyAssetProfile {
  if (role === "vehicle") return "vehicle";
  if (role === "character") return "humanoid";
  if (role === "environment" || role === "world" || role === "track") return "environment";
  return "prop";
}

export function inspectMeshyTextureDimensions(file: string): readonly { readonly label: string; readonly width: number; readonly height: number }[] {
  const bytes = readFileSync(file);
  if (bytes.length < 20 || bytes.toString("ascii", 0, 4) !== "glTF") return [];
  const jsonLength = bytes.readUInt32LE(12);
  const json = JSON.parse(bytes.subarray(20, 20 + jsonLength).toString("utf8").trim()) as {
    readonly images?: readonly { readonly name?: string; readonly uri?: string; readonly bufferView?: number }[];
    readonly bufferViews?: readonly { readonly buffer?: number; readonly byteOffset?: number; readonly byteLength?: number }[];
  };
  const binOffset = align4(20 + jsonLength);
  const hasBin = binOffset + 8 <= bytes.length && bytes.toString("ascii", binOffset + 4, binOffset + 8) === "BIN\0";
  const binDataOffset = hasBin ? binOffset + 8 : -1;
  return (json.images ?? []).flatMap((image, index) => {
    let imageBytes: Buffer | undefined;
    if (typeof image.uri === "string" && image.uri.startsWith("data:")) {
      const comma = image.uri.indexOf(",");
      if (comma >= 0 && /;base64$/i.test(image.uri.slice(0, comma))) imageBytes = Buffer.from(image.uri.slice(comma + 1), "base64");
    } else if (binDataOffset >= 0 && typeof image.bufferView === "number") {
      const view = json.bufferViews?.[image.bufferView];
      if (view && (view.buffer ?? 0) === 0 && typeof view.byteLength === "number") {
        const start = binDataOffset + (view.byteOffset ?? 0);
        imageBytes = bytes.subarray(start, start + view.byteLength);
      }
    }
    const dimensions = imageBytes ? readImageDimensions(imageBytes) : undefined;
    return dimensions ? [{ label: image.name ?? image.uri ?? "image-" + index, ...dimensions }] : [];
  });
}

export function createMeshyAdmissionReport(options: {
  readonly profile: MeshyAssetProfile;
  readonly inspection: AssetInspectionReport;
  readonly geometry: AssetGeometryFacts;
  readonly textureDimensions?: readonly { readonly label: string; readonly width: number; readonly height: number }[];
  readonly hasThumbnailEvidence?: boolean;
}): MeshyAdmissionReport {
  const { profile, inspection, geometry } = options;
  const limits = PROFILE_LIMITS[profile];
  const checks: MeshyAdmissionCheck[] = [];
  const bounds = inspection.bounds ?? geometry.bounds;
  const boundsMeasured = bounds.length === 3 && bounds.every((value) => Number.isFinite(value) && value > 0);
  checks.push({ id: "bounds", verdict: boundsMeasured ? "pass" : "unproven", detail: boundsMeasured ? "measured bounds " + bounds.map(formatNumber).join(" x ") : "no positive finite bounds were measurable; inspect scale, origin, and framing before route use", measured: boundsMeasured ? bounds.map(formatNumber).join("x") : false });
  if (boundsMeasured) {
    const longest = Math.max(...bounds);
    const shortest = Math.min(...bounds);
    const ratio = longest / shortest;
    checks.push({ id: "bounds-degeneracy", verdict: ratio <= 1_000 ? "pass" : "fail", detail: ratio <= 1_000 ? "bounds aspect ratio " + formatNumber(ratio) + " is bounded" : "bounds aspect ratio " + formatNumber(ratio) + " is degenerate; check export scale and stray geometry", measured: formatNumber(ratio), limit: 1_000 });
    checks.push({ id: "scale-normalization", verdict: longest > 12 || longest < 0.08 ? "advisory" : "pass", detail: longest > 12 || longest < 0.08 ? "longest axis is " + formatNumber(longest) + " units; use manifest bounds to fit and ground the candidate rather than raw units" : "longest axis is " + formatNumber(longest) + " units and already near scene scale", measured: formatNumber(longest) });
  }

  const triangles = geometry.triangles;
  checks.push({ id: "triangle-budget", verdict: triangles <= 0 ? "unproven" : triangles <= limits.maxTriangles ? "pass" : "fail", detail: triangles <= 0 ? "triangle count was not measurable (for example, non-indexed geometry); measure it before route use" : triangles <= limits.maxTriangles ? triangles + " triangles are within the " + profile + " candidate budget of " + limits.maxTriangles : triangles + " triangles exceed the " + profile + " candidate budget of " + limits.maxTriangles, measured: triangles, limit: limits.maxTriangles });
  if (limits.minTriangles !== undefined && triangles > 0) {
    checks.push({ id: "triangle-floor", verdict: triangles >= limits.minTriangles ? "pass" : "fail", detail: triangles >= limits.minTriangles ? triangles + " triangles meet the " + profile + " structural floor of " + limits.minTriangles : triangles + " triangles are below the " + profile + " structural floor of " + limits.minTriangles + "; inspect silhouette and topology", measured: triangles, limit: limits.minTriangles });
  }

  const textureCount = inspection.textures.length;
  checks.push({ id: "texture-count", verdict: textureCount <= limits.maxTextures ? "pass" : "fail", detail: textureCount <= limits.maxTextures ? textureCount + " texture(s) are within the " + profile + " candidate limit of " + limits.maxTextures : textureCount + " textures exceed the " + profile + " candidate limit of " + limits.maxTextures, measured: textureCount, limit: limits.maxTextures });
  const dimensions = options.textureDimensions ?? [];
  const largestTexture = dimensions.reduce((largest, item) => Math.max(largest, item.width, item.height), 0);
  checks.push({ id: "texture-dimensions", verdict: textureCount === 0 ? "advisory" : dimensions.length === 0 ? "unproven" : largestTexture <= limits.maxTextureDimension ? "pass" : "fail", detail: textureCount === 0 ? "no texture images were declared; confirm flat materials are intentional and readable" : dimensions.length === 0 ? "texture dimensions were not available from embedded PNG/JPEG/WebP inspection; verify them before route use" : largestTexture <= limits.maxTextureDimension ? "largest inspected texture dimension is " + largestTexture + "px, within the " + limits.maxTextureDimension + "px limit" : "largest inspected texture dimension is " + largestTexture + "px, exceeding the " + limits.maxTextureDimension + "px limit", measured: largestTexture, limit: limits.maxTextureDimension });

  const readableMaterials = inspection.materialMetadata?.filter((material) => material.visible && material.readable).length ?? inspection.materials.length;
  checks.push({ id: "readable-material", verdict: readableMaterials > 0 ? "pass" : "unproven", detail: readableMaterials > 0 ? readableMaterials + " readable material(s) detected" : "no readable material was detected; visually inspect the retained thumbnail or route render", measured: readableMaterials });

  if (profile === "vehicle") {
    const corners = geometry.distinctWheelCorners;
    checks.push({ id: "vehicle-parts", verdict: corners === undefined ? "unproven" : corners >= 3 ? "pass" : "fail", detail: corners === undefined ? "wheel/body separation was not measurable" : corners >= 3 ? "wheel-like geometry reaches " + corners + " corners" : "wheel-like geometry reaches only " + corners + " corners; inspect wheel/body separation and collider plan", measured: corners ?? false });
    checks.push({ id: "vehicle-orientation", verdict: inspection.orientation?.source === "unknown" ? "unproven" : "pass", detail: inspection.orientation?.source === "unknown" ? "no forward/up orientation evidence is declared" : "orientation evidence source: " + (inspection.orientation?.source ?? "unknown"), measured: inspection.orientation?.source ?? "unknown" });
  } else if (profile === "humanoid") {
    checks.push({ id: "humanoid-structure", verdict: inspection.humanoid?.humanoid ? "pass" : inspection.humanoid?.status === "non-humanoid" ? "fail" : "unproven", detail: inspection.humanoid?.humanoid ? "humanoid structure detected with " + inspection.humanoid.jointCount + " joints" : inspection.humanoid?.messages.join(" ") ?? "humanoid structure was not inspected", measured: inspection.humanoid?.jointCount ?? 0 });
    checks.push({ id: "skin-skeleton", verdict: (inspection.skeleton?.skinCount ?? 0) > 0 ? "pass" : "unproven", detail: (inspection.skeleton?.skinCount ?? 0) > 0 ? inspection.skeleton!.skinCount + " skin(s), " + inspection.skeleton!.jointCount + " joints" : "no skin/skeleton evidence; deformation and animation readiness are unproven", measured: inspection.skeleton?.skinCount ?? 0 });
  } else if (profile === "environment") {
    checks.push({ id: "environment-plan", verdict: "unproven", detail: "modular seams, walkable scale, repeated-instance cost, collision, and navigation require route-specific evidence", measured: false });
  } else {
    checks.push({ id: "collision-plan", verdict: "unproven", detail: "collision shape and pickup/prop origin require route-specific evidence", measured: false });
  }

  checks.push({ id: "rendered-candidate-evidence", verdict: options.hasThumbnailEvidence ? "pass" : "unproven", detail: options.hasThumbnailEvidence ? "a local Meshy thumbnail was retained as candidate-only rendered evidence" : "no local Meshy thumbnail was retained; provider success is not rendered route evidence", measured: options.hasThumbnailEvidence ?? false });
  const blockers = checks.filter((check) => check.verdict === "fail").map((check) => check.id + ":" + check.detail);
  const unproven = checks.filter((check) => check.verdict === "unproven").map((check) => check.id + ":" + check.detail);
  const nextActions = profile === "humanoid"
    ? ["Inspect humanoid pose/topology/deformation and verify animation clips in a real route.", "Retain route renders and independent human review before release quality."]
    : profile === "vehicle"
      ? ["Verify vehicle orientation, wheel/body separation, collider plan, and gameplay-camera readability.", "Retain route renders and independent human review before release quality."]
      : profile === "environment"
        ? ["Verify environment modular seams, walkable scale, repeated-instance cost, collision, navigation, and occlusion in route.", "Retain route renders and independent human review before release quality."]
        : ["Verify prop origin/grounding, collision plan, material readability, and gameplay-camera silhouette.", "Retain route renders and independent human review before release quality."];
  return { schema: "aura3d.meshy-admission/1.0", profile, candidateQuality: true, routeReady: blockers.length === 0 && unproven.length === 0, checks, blockers, unproven, nextActions };
}

function readImageDimensions(bytes: Buffer): { readonly width: number; readonly height: number } | undefined {
  if (bytes.length >= 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
  if (bytes.length >= 30 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" && bytes.toString("ascii", 12, 16) === "VP8X") return { width: 1 + bytes.readUIntLE(24, 3), height: 1 + bytes.readUIntLE(27, 3) };
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset += 1; continue; }
      const marker = bytes[offset + 1]!;
      if (marker === 0xd8 || marker === 0xd9) { offset += 2; continue; }
      const length = bytes.readUInt16BE(offset + 2);
      if (length < 2 || offset + 2 + length > bytes.length) break;
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7) || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) return { width: bytes.readUInt16BE(offset + 7), height: bytes.readUInt16BE(offset + 5) };
      offset += 2 + length;
    }
  }
  return undefined;
}

function align4(value: number): number { return (value + 3) & ~3; }
function formatNumber(value: number): string { return Number(value.toFixed(4)).toString(); }
