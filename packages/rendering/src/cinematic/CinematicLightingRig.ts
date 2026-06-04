import type { EnvironmentLightingOptions } from "../ForwardPass";
import { createRendererOwnedEvidenceFlag, type CinematicRendererEvidenceFlag } from "./CinematicEvidence";

export type CinematicLightingRigId =
  | "soft-key-fill-rim"
  | "moody-alley"
  | "studio-product"
  | "warm-sunrise"
  | "cool-moonlit";

export type CinematicLightRole = "key" | "fill" | "rim" | "practical" | "ambient";
export type CinematicLightType = "directional" | "point" | "spot" | "ambient";

export interface CinematicRuntimeLight {
  readonly id: string;
  readonly role: CinematicLightRole;
  readonly type: CinematicLightType;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly position?: readonly [number, number, number];
  readonly direction?: readonly [number, number, number];
  readonly castsShadow: boolean;
}

export interface CinematicLightingRig {
  readonly id: CinematicLightingRigId;
  readonly label: string;
  readonly exposure: number;
  readonly toneMap: {
    readonly operator: "filmic" | "aces" | "reinhard";
    readonly whitePoint: number;
  };
  readonly environmentLighting: EnvironmentLightingOptions;
  readonly lights: readonly CinematicRuntimeLight[];
  readonly rendererOwnedEvidence: CinematicRendererEvidenceFlag;
  readonly diagnostics: readonly string[];
}

export function createCinematicLightingRig(id: CinematicLightingRigId): CinematicLightingRig {
  const rig = rigWithoutEvidence(id);
  return {
    ...rig,
    rendererOwnedEvidence: createRendererOwnedEvidenceFlag({
      id: `lighting:${id}`,
      feature: "lighting",
      label: rig.label,
      source: "renderer-light",
      diagnostics: rig.diagnostics
    })
  };
}

export function listCinematicLightingRigs(): readonly CinematicLightingRig[] {
  const ids: readonly CinematicLightingRigId[] = ["soft-key-fill-rim", "moody-alley", "studio-product", "warm-sunrise", "cool-moonlit"];
  return ids.map(createCinematicLightingRig);
}

export function selectCinematicLightingRig(tags: readonly string[]): CinematicLightingRigId {
  const lower = tags.map((tag) => tag.toLowerCase());
  if (lower.some((tag) => tag.includes("alley") || tag.includes("neon") || tag.includes("rain"))) return "moody-alley";
  if (lower.some((tag) => tag.includes("studio") || tag.includes("product"))) return "studio-product";
  if (lower.some((tag) => tag.includes("sunrise") || tag.includes("warm") || tag.includes("golden"))) return "warm-sunrise";
  if (lower.some((tag) => tag.includes("moon") || tag.includes("night") || tag.includes("cool"))) return "cool-moonlit";
  return "soft-key-fill-rim";
}

function rigWithoutEvidence(id: CinematicLightingRigId): Omit<CinematicLightingRig, "rendererOwnedEvidence"> {
  switch (id) {
    case "moody-alley":
      return makeRig(id, "Moody alley", 1.24, [0.035, 0.045, 0.07], 0.34, [
        light("alley-key", "key", "spot", [0.42, 0.58, 1], 2.2, [-2.4, 3.6, 2.2], [0.45, -0.72, -0.52], true),
        light("alley-rim", "rim", "point", [0.04, 0.86, 1], 3.4, [1.8, 1.2, -1.4], undefined, true),
        light("alley-practical-neon", "practical", "point", [1, 0.08, 0.62], 2.8, [-1.6, 1.7, -2.1], undefined, false)
      ], ["Moody alley rig includes key, rim, and practical light metadata compiled for the renderer."]);
    case "studio-product":
      return makeRig(id, "Studio product", 1.08, [0.78, 0.8, 0.84], 0.54, [
        light("studio-key", "key", "directional", [1, 0.95, 0.88], 1.8, undefined, [0.4, -0.7, -0.58], true),
        light("studio-fill", "fill", "directional", [0.62, 0.72, 1], 0.7, undefined, [-0.5, -0.35, -0.8], false),
        light("studio-rim", "rim", "directional", [1, 1, 1], 0.9, undefined, [0.12, -0.2, 0.97], false)
      ], ["Studio product rig uses renderer light records, not CSS panel highlights."]);
    case "warm-sunrise":
      return makeRig(id, "Warm sunrise", 1.16, [0.9, 0.58, 0.32], 0.48, [
        light("sunrise-key", "key", "directional", [1, 0.58, 0.28], 2.05, undefined, [0.62, -0.52, -0.58], true),
        light("sunrise-fill", "fill", "ambient", [0.28, 0.36, 0.55], 0.32, undefined, undefined, false),
        light("sunrise-rim", "rim", "directional", [1, 0.86, 0.52], 0.78, undefined, [-0.12, -0.28, 0.95], false)
      ], ["Warm sunrise is an analytic renderer lighting preset."]);
    case "cool-moonlit":
      return makeRig(id, "Cool moonlit", 1.32, [0.2, 0.28, 0.48], 0.38, [
        light("moon-key", "key", "directional", [0.48, 0.62, 1], 1.35, undefined, [0.24, -0.62, -0.74], true),
        light("moon-fill", "fill", "ambient", [0.08, 0.12, 0.2], 0.24, undefined, undefined, false),
        light("moon-rim", "rim", "directional", [0.62, 0.86, 1], 0.92, undefined, [-0.22, -0.14, 0.96], false)
      ], ["Cool moonlit rig remains renderer-owned lighting evidence."]);
    case "soft-key-fill-rim":
      return makeRig(id, "Soft key fill rim", 1.12, [0.52, 0.58, 0.66], 0.45, [
        light("soft-key", "key", "directional", [1, 0.92, 0.82], 1.55, undefined, [0.42, -0.62, -0.66], true),
        light("soft-fill", "fill", "directional", [0.46, 0.58, 0.82], 0.46, undefined, [-0.46, -0.28, -0.84], false),
        light("soft-rim", "rim", "directional", [0.7, 0.88, 1], 0.72, undefined, [0.08, -0.28, 0.96], false)
      ], ["Soft three-point rig supplies key/fill/rim renderer lights."]);
  }
}

function makeRig(
  id: CinematicLightingRigId,
  label: string,
  exposure: number,
  color: readonly [number, number, number],
  intensity: number,
  lights: readonly CinematicRuntimeLight[],
  diagnostics: readonly string[]
): Omit<CinematicLightingRig, "rendererOwnedEvidence"> {
  return {
    id,
    label,
    exposure,
    toneMap: { operator: "filmic", whitePoint: id === "cool-moonlit" ? 1.05 : 1.22 },
    environmentLighting: {
      color,
      intensity,
      proceduralMap: {
        skyColor: [color[0] * 0.9, color[1] * 0.95, Math.min(1, color[2] * 1.15)],
        horizonColor: [Math.min(1, color[0] * 1.2), Math.min(1, color[1] * 1.1), color[2]],
        groundColor: [0.04, 0.045, 0.05],
        specularColor: [1, 0.95, 0.86],
        intensity,
        specularIntensity: Math.min(1, intensity + 0.28)
      }
    },
    lights,
    diagnostics
  };
}

function light(
  id: string,
  role: CinematicLightRole,
  type: CinematicLightType,
  color: readonly [number, number, number],
  intensity: number,
  position: readonly [number, number, number] | undefined,
  direction: readonly [number, number, number] | undefined,
  castsShadow: boolean
): CinematicRuntimeLight {
  return { id, role, type, color, intensity, position, direction, castsShadow };
}
