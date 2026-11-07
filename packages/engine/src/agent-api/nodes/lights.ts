// PR 0b-1 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraColor, AuraLightNode, AuraVec3 } from "./types.js";
import type { AuraDirectionalShadowOptions, AuraLocalShadowOptions, AuraPhotometricProfile, AuraProjectedLightImage } from "../../contracts/lighting.js";
import { AuraNodeBuilder } from "./builder.js";
import { distance } from "../SpatialAnchoring.js";
import { createLensFlareNode } from "./lensFlare.js";
import { assertAuraColorOption } from "../color.js";

/** Validate every colour option of a light at its API entry (throws COLOR_INVALID naming `where`); contributes no fields. */
function checkedColors(where: string, options: { readonly color?: unknown; readonly skyColor?: unknown; readonly groundColor?: unknown }): Record<string, never> {
  for (const key of ["color", "skyColor", "groundColor"] as const) assertAuraColorOption(options[key], `${where}({ ${key} })`);
  return {};
}

function validateProfile(profile: AuraPhotometricProfile | undefined): void {
  if (!profile) return;
  if (profile.profile?.format !== "ies-lm63" || profile.profile.photometricType !== "C") throw new TypeError("photometricProfile requires a parsed Type-C IES profile");
  if (profile.scale !== undefined && (!Number.isFinite(profile.scale) || profile.scale < 0)) throw new RangeError("photometricProfile scale must be finite and non-negative");
  if (profile.rotation !== undefined && !Number.isFinite(profile.rotation)) throw new RangeError("photometricProfile rotation must be finite");
  const { verticalAngles, horizontalAngles, candela, symmetry } = profile.profile;
  if (!Array.isArray(verticalAngles) || !Array.isArray(horizontalAngles) || !Array.isArray(candela) || verticalAngles.length < 1 || horizontalAngles.length < 1 || verticalAngles.length > 4096 || horizontalAngles.length > 4096 || verticalAngles.length * horizontalAngles.length > 1048576 || candela.length !== verticalAngles.length * horizontalAngles.length) throw new RangeError("photometricProfile has invalid table dimensions");
  for (const [angles, max] of [[verticalAngles, 180], [horizontalAngles, 360]] as const) {
    for (let i = 0; i < angles.length; i++) {
      if (!Number.isFinite(angles[i]) || angles[i]! < 0 || angles[i]! > max || (i > 0 && angles[i]! <= angles[i - 1]!)) throw new RangeError("photometricProfile angles must be finite and strictly increasing");
    }
  }
  const end = horizontalAngles[horizontalAngles.length - 1];
  const expected = horizontalAngles.length === 1 ? "rotational" : end === 90 ? "quadrant" : end === 180 ? "bilateral" : end === 360 ? "none" : undefined;
  if (horizontalAngles[0] !== 0 || symmetry !== expected || candela.some((v) => !Number.isFinite(v) || v < 0)) throw new RangeError("photometricProfile has invalid symmetry or candela values");
}

function validateProjection(projection: AuraProjectedLightImage | undefined): void {
  if (!projection) return;
  if (projection.texture?.kind !== "aura-asset-ref" || projection.texture.type !== "texture") throw new TypeError("projectedImage requires an admitted texture asset");
  if (projection.rotation !== undefined && !Number.isFinite(projection.rotation)) throw new RangeError("projectedImage rotation must be finite");
  if (projection.offset && (!Array.isArray(projection.offset) || projection.offset.length !== 2 || projection.offset.some((n) => !Number.isFinite(n)))) throw new RangeError("projectedImage offset must contain two finite values");
  if (projection.scale && (!Array.isArray(projection.scale) || projection.scale.length !== 2 || projection.scale.some((n) => !Number.isFinite(n) || n === 0))) throw new RangeError("projectedImage scale must contain two finite non-zero values");
}

function validateTwoSided(value: boolean | undefined): void {
  if (value !== undefined && typeof value !== "boolean") throw new TypeError("twoSided must be a boolean");
}

export const lights = {
  /**
   * threejs-parity AD-15 (P2): three's `Lensflare` — additive flare sprites
   * placed along the line from `position`/`light` through the screen centre.
   * See `nodes/lensFlare.ts` for placement rules and the occlusion caveat.
   */
  lensFlare: createLensFlareNode,
  ambient: (options: { readonly name?: string; readonly intensity?: number; readonly color?: AuraColor } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "ambient",
      ...checkedColors("lights.ambient", options),
      name: options.name,
      intensity: options.intensity ?? 0.28,
      color: options.color ?? "#ffffff"
    }),
  hemisphere: (options: { readonly name?: string; readonly skyColor?: AuraColor; readonly groundColor?: AuraColor; readonly intensity?: number; readonly position?: AuraVec3 } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "hemisphere",
      ...checkedColors("lights.hemisphere", options),
      name: options.name ?? "hemisphere light",
      position: options.position ?? [0, 1, 0],
      intensity: options.intensity ?? 1,
      color: options.skyColor ?? "#bcd7ff",
      // CCR-02-2 additive field: the C-36 handler reads groundColor.
      ...(options.groundColor !== undefined ? { groundColor: options.groundColor } : {})
    } as AuraLightNode),
  /**
   * threejs-parity AD-16: three's `LightProbe` — ambient irradiance authored
   * as 27 SH9 coefficients (e.g. from `LightProbeGenerator`) or as plain
   * sky/ground colours. Compiles to the hemisphere-irradiance channel.
   */
  lightProbe: (options: { readonly name?: string; readonly sh?: readonly number[]; readonly skyColor?: AuraColor; readonly groundColor?: AuraColor; readonly intensity?: number; readonly position?: AuraVec3 } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "probe",
      name: options.name ?? "light probe",
      position: options.position ?? [0, 1, 0],
      intensity: options.intensity ?? 1,
      color: options.skyColor ?? "#ffffff",
      ...(options.groundColor !== undefined ? { groundColor: options.groundColor } : {}),
      ...(options.sh !== undefined ? { sh: options.sh } : {})
    } as AuraLightNode),
  directional: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraDirectionalShadowOptions } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "directional",
      ...checkedColors("lights.directional", options),
      name: options.name,
      position: options.position ?? [3, 4, 3],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 1.5,
      color: options.color ?? "#ffffff",
      shadow: options.shadow
    }),
  point: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly power?: number; readonly distance?: number; readonly decay?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraLocalShadowOptions; readonly photometricProfile?: AuraPhotometricProfile } = {}) => {
    validateProfile(options.photometricProfile);
    return new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "point",
      ...checkedColors("lights.point", options),
      name: options.name,
      position: options.position ?? [2, 2.5, 1.5],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 8,
      ...(options.power !== undefined ? { power: options.power } : {}),
      ...(options.distance !== undefined ? { distance: options.distance } : {}),
      ...(options.decay !== undefined ? { decay: options.decay } : {}),
      ...(options.shadow !== undefined ? { shadow: options.shadow } : {}),
      ...(options.photometricProfile !== undefined ? { photometricProfile: options.photometricProfile } : {}),
      color: options.color ?? "#ffffff"
    });
  },
  spot: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly angle?: number; readonly penumbra?: number; readonly distance?: number; readonly decay?: number; readonly intensity?: number; readonly power?: number; readonly color?: AuraColor; readonly shadow?: boolean | AuraLocalShadowOptions; readonly photometricProfile?: AuraPhotometricProfile; readonly projectedImage?: AuraProjectedLightImage } = {}) => {
    validateProfile(options.photometricProfile);
    validateProjection(options.projectedImage);
    return new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "spot",
      ...checkedColors("lights.spot", options),
      name: options.name ?? "spot light",
      position: options.position ?? [0, 4, 0],
      target: options.target,
      angle: options.angle ?? Math.PI / 6,
      penumbra: options.penumbra ?? 0.4,
      distance: options.distance ?? 12,
      decay: options.decay,
      intensity: options.intensity ?? 30,
      ...(options.power !== undefined ? { power: options.power } : {}),
      ...(options.photometricProfile !== undefined ? { photometricProfile: options.photometricProfile } : {}),
      ...(options.projectedImage !== undefined ? { projectedImage: options.projectedImage } : {}),
      color: options.color ?? "#ffffff",
      shadow: options.shadow
    });
  },
  studio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "studio",
      name: "studio-key-fill-rim",
      intensity: options.intensity ?? 1,
      color: "#ffffff",
      position: [0, 3, 4]
    }),
  rect: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number; readonly twoSided?: boolean } = {}) => {
    validateTwoSided(options.twoSided);
    return new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "rect",
      name: options.name ?? "rect area light",
      position: options.position ?? [0, 2.6, 1.8],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 1.4,
      color: options.color ?? "#ffffff",
      width: options.width ?? 2.2,
      height: options.height ?? 1.2,
      ...(options.twoSided !== undefined ? { twoSided: options.twoSided } : {})
    });
  },
  /**
   * threejs-parity L7/AD-16 (P2): three's `RectAreaLight` — an alias over the
   * `rect` area light (width × height, position + target, twoSided).
   */
  rectArea: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number; readonly twoSided?: boolean } = {}) =>
    lights.rect(options),
  softbox: (options: { readonly name?: string; readonly position?: AuraVec3; readonly target?: AuraVec3; readonly intensity?: number; readonly color?: AuraColor; readonly width?: number; readonly height?: number; readonly twoSided?: boolean } = {}) => {
    validateTwoSided(options.twoSided);
    return new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: options.name ?? "large softbox light",
      position: options.position ?? [-2.2, 2.4, 2.2],
      ...(options.target !== undefined ? { target: options.target } : {}),
      intensity: options.intensity ?? 1.75,
      color: options.color ?? "#f7fbff",
      width: options.width ?? 2.4,
      height: options.height ?? 1.6,
      ...(options.twoSided !== undefined ? { twoSided: options.twoSided } : {})
    });
  },
  productStudio: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "product-studio-softbox-rig",
      position: [-2.25, 2.45, 2.35],
      intensity: options.intensity ?? 1.7,
      color: "#f7fbff",
      width: 2.5,
      height: 1.6
    }),
  materialLab: (options: { readonly intensity?: number } = {}) =>
    new AuraNodeBuilder<AuraLightNode>({
      kind: "light",
      light: "softbox",
      name: "material-lab-rect-softbox-rig",
      position: [0, 2.55, 1.8],
      intensity: options.intensity ?? 1.9,
      color: "#ffffff",
      width: 3.2,
      height: 1.2
    })
} as const;
