// Shared deterministic procedural 3D sculpting, craft-material & joint-rigging toolkit.
// Built 100% natively on @aura3d/engine, @aura3d/engine/procedural, and @aura3d/engine/geometry-tools.
// Zero network fetches, zero clocks, zero Math.random, zero console calls, and zero `as T` casts.

import {
  geometry,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import {
  catmullRomCurve,
  composeGeometry,
  createFbm3D,
  latheGeometry,
  parametricSurface,
  path2d,
  sweepGeometry,
  type ComposePart,
  type ProceduralColor,
  type ProceduralVec2,
  type ProceduralVec3
} from "@aura3d/engine/procedural";
import {
  deformAuraMeshAlongCurve,
  tessellateAuraMesh,
  weldAuraGeometry
} from "@aura3d/engine/geometry-tools";
import type { SubPartId } from "../articulated-actors.js";
import type { Vec3 } from "../motion.js";
import type { StageAssetKey } from "../stand-ins.js";
import { getCraftTexture, type CraftTextureId } from "./craft-textures.js";

export type { CraftTextureId };

export type CraftFamily =
  | "felt"
  | "clay"
  | "ceramic"
  | "lacquer"
  | "wood"
  | "carPaint"
  | "brushedMetal"
  | "rubber"
  | "glassCoat"
  | "soapBubble"
  | "warmGlow";

/** One merged draw-call mesh lobe inside a rigid SubPartId (or static prop root). */
export interface ProceduralLobeSpec {
  readonly suffix: string;
  readonly craft: CraftFamily;
  readonly craftTexture?: CraftTextureId;
  /** Unit-height (h = 1.0) custom geometry with [0, 0, 0] already shifted to the SubPartId's hinge. */
  readonly geometry: AuraCustomGeometrySpec;
  /** Base material tint ("#FFFFFF" when vertex colors encode multi-tone palette). */
  readonly baseColor: AuraColor;
  /** Receives runtime PropPlacement.tint / "tint" / applyCarWashState updates. */
  readonly tintTarget?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly emissive?: AuraColor;
  readonly emissiveIntensity?: number;
}

export interface ProceduralSubPartRig {
  readonly part: SubPartId;
  /** Joint hinge position in unit-height (h = 1.0) actor space relative to ground-center [0, 0, 0]. */
  readonly anchor: Vec3;
  /** Optional parent joint for 2-level kinematic composition (e.g. jaw -> head -> body). */
  readonly parent?: SubPartId;
  /** 1-3 merged material lobes. */
  readonly lobes: readonly ProceduralLobeSpec[];
}

export interface ProceduralAssetRig {
  readonly key: StageAssetKey;
  /** Total authored sub-shapes merged across all parts (tracked automatically for CI quality floors). */
  readonly subShapeCount: number;
  /** Total triangle count across interactive parts (computed from indices.length / 3). */
  readonly triangleCount: number;
  /** Rigid articulated parts (for actors/interactive props) and/or `"body"` root lobes (for static props). */
  readonly parts: readonly ProceduralSubPartRig[];
  /** Static merged unit-height lobes when mounted as non-interactive world dressing (1-3 draw calls total). */
  readonly staticDressingLobes: readonly ProceduralLobeSpec[];
}

export interface BuildProceduralActorOptions {
  readonly id: string;
  readonly key: StageAssetKey;
  readonly heightM: number;
  readonly tint?: AuraColor;
  /** Multiplies every lobe's baseColor by this sRGB hex tint (used for E01 mirror reflection). */
  readonly tintAll?: string;
  readonly castShadowOverride?: boolean;
  readonly receiveShadowOverride?: boolean;
  /** Optional runtime tag override on root/part handles (used for E01 mirror reflection). */
  readonly rootTags?: readonly string[];
  readonly partTags?: readonly string[];
  /** False for static world dressing: emits merged staticDressingLobes with no runtime IDs. */
  readonly interactive: boolean;
}

export interface MountedRigPiece {
  readonly runtimeId: string;
  readonly part: SubPartId;
  readonly parent?: SubPartId;
  /** Scaled anchor [anchorX * h, anchorY * h, anchorZ * h] relative to actor ground origin. */
  readonly anchorM: Vec3;
  readonly tintTarget: boolean;
  readonly baseColor: string;
  readonly craft: CraftFamily;
  readonly craftTexture?: CraftTextureId;
  readonly emissive?: AuraColor;
  readonly emissiveIntensity?: number;
}

export interface BuiltProceduralActor {
  readonly nodes: readonly AuraNodeBuilder<AuraSceneNode>[];
  readonly pieces: readonly MountedRigPiece[];
  readonly subParts: ReadonlySet<SubPartId>;
  readonly tintableIds: readonly string[];
}

export interface LobePartInput extends ComposePart {
  readonly subShapes?: number;
}

export interface BuiltLobe {
  readonly lobe: ProceduralLobeSpec;
  readonly subShapeCount: number;
  readonly triangleCount: number;
}

export interface BuiltSubPart {
  readonly subPart: ProceduralSubPartRig;
  readonly subShapeCount: number;
  readonly triangleCount: number;
}

const TAU = Math.PI * 2;

// ---------------------------------------------------------------- color & tactile craft materials

function srgbChannelToLinear(c01: number): number {
  const c = c01 < 0 ? 0 : c01 > 1 ? 1 : c01;
  return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Converts "#RGB" or "#RRGGBB" sRGB hex into linear RGBA [0..1] for `composeGeometry`. */
export function srgbHexToLinearRgba(hex: string, alpha = 1): ProceduralColor {
  const clean = hex.trim().replace(/^#/, "");
  let r = 1;
  let g = 1;
  let b = 1;
  if (clean.length === 3) {
    const r0 = Number.parseInt(clean.slice(0, 1), 16);
    const g0 = Number.parseInt(clean.slice(1, 2), 16);
    const b0 = Number.parseInt(clean.slice(2, 3), 16);
    if (Number.isFinite(r0) && Number.isFinite(g0) && Number.isFinite(b0)) {
      r = (r0 * 17) / 255;
      g = (g0 * 17) / 255;
      b = (b0 * 17) / 255;
    }
  } else if (clean.length >= 6) {
    const r0 = Number.parseInt(clean.slice(0, 2), 16);
    const g0 = Number.parseInt(clean.slice(2, 4), 16);
    const b0 = Number.parseInt(clean.slice(4, 6), 16);
    if (Number.isFinite(r0) && Number.isFinite(g0) && Number.isFinite(b0)) {
      r = r0 / 255;
      g = g0 / 255;
      b = b0 / 255;
    }
  }
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha;
  return [srgbChannelToLinear(r), srgbChannelToLinear(g), srgbChannelToLinear(b), a];
}

export interface CraftMaterialOptions {
  readonly craftTexture?: CraftTextureId;
  readonly emissive?: AuraColor;
  readonly emissiveIntensity?: number;
  readonly opacity?: number;
  readonly roughness?: number;
}

export function craftMaterial(
  craft: CraftFamily,
  color: AuraColor,
  opts: CraftMaterialOptions = {}
): AuraMaterialSpec {
  const emissiveIntensity = opts.emissiveIntensity;
  const emissivePatch: Partial<AuraMaterialSpec> =
    opts.emissive !== undefined || emissiveIntensity !== undefined
      ? {
          emissive: opts.emissive ?? color,
          emissiveIntensity: emissiveIntensity ?? 0.25,
          ...((emissiveIntensity ?? 0.25) > 0.1 ? { practical: true } : {})
        }
      : {};

  switch (craft) {
    case "felt": {
      const tex = getCraftTexture(opts.craftTexture ?? "feltBoucle");
      return material.felt({
        color,
        roughness: opts.roughness ?? 0.86,
        sheen: 0.36,
        sheenRoughness: 0.64,
        sheenColor: "#FFFDF8",
        texture: tex,
        normal: material.proceduralTextures.fabric({ scale: 34, strength: 0.16, contrast: 0.44 }),
        envMapIntensity: 0.44,
        ...emissivePatch
      });
    }
    case "clay": {
      const tex = getCraftTexture(opts.craftTexture ?? "glazedCeramicSpeckle");
      return material.matteClay({
        color,
        roughness: opts.roughness ?? 0.58,
        sheen: 0.22,
        sheenRoughness: 0.72,
        sheenColor: "#FFFDF9",
        texture: tex,
        envMapIntensity: 0.54,
        ...emissivePatch
      });
    }
    case "ceramic": {
      const tex = getCraftTexture(opts.craftTexture ?? "glazedCeramicSpeckle");
      return material.ceramic({
        color,
        roughness: opts.roughness ?? 0.18,
        clearcoat: 0.76,
        clearcoatRoughness: 0.08,
        texture: tex,
        envMapIntensity: 0.96,
        ...emissivePatch
      });
    }
    case "lacquer": {
      const texPatch = opts.craftTexture ? { texture: getCraftTexture(opts.craftTexture) } : {};
      return material.lacquer({
        color,
        roughness: opts.roughness ?? 0.11,
        clearcoat: 0.96,
        clearcoatRoughness: 0.025,
        envMapIntensity: 1.18,
        ...texPatch,
        ...emissivePatch
      });
    }
    case "wood": {
      const tex = getCraftTexture(opts.craftTexture ?? "woodGrainPlank");
      return material.standard({
        color,
        roughness: opts.roughness ?? 0.52,
        metallic: 0.02,
        clearcoat: 0.22,
        clearcoatRoughness: 0.34,
        texture: tex,
        envMapIntensity: 0.58,
        ...emissivePatch
      });
    }
    case "carPaint": {
      const texPatch = opts.craftTexture ? { texture: getCraftTexture(opts.craftTexture) } : {};
      return material.carPaint({
        color,
        roughness: opts.roughness ?? 0.24,
        metallic: 0.05,
        metalness: 0.05,
        clearcoat: 0.78,
        clearcoatRoughness: 0.07,
        envMapIntensity: 0.68,
        ...texPatch,
        ...emissivePatch
      });
    }
    case "brushedMetal": {
      const texPatch = opts.craftTexture ? { texture: getCraftTexture(opts.craftTexture) } : {};
      return material.brushedMetal({
        color,
        roughness: opts.roughness ?? 0.28,
        metallic: 0.42,
        metalness: 0.42,
        normal: material.proceduralTextures.brushedMetal({ scale: 38, strength: 0.2, contrast: 0.5 }),
        envMapIntensity: 0.78,
        ...texPatch,
        ...emissivePatch
      });
    }
    case "rubber": {
      const texPatch = opts.craftTexture ? { texture: getCraftTexture(opts.craftTexture) } : {};
      return material.rubber({
        color,
        roughness: opts.roughness ?? 0.82,
        normal: material.proceduralTextures.rubber({ scale: 26, strength: 0.22, contrast: 0.52 }),
        envMapIntensity: 0.34,
        ...texPatch,
        ...emissivePatch
      });
    }
    case "glassCoat": {
      return material.physical({
        color,
        opacity: opts.opacity ?? 0.36,
        alphaMode: "blend",
        roughness: opts.roughness ?? 0.06,
        metallic: 0.04,
        clearcoat: 0.94,
        clearcoatRoughness: 0.03,
        iridescence: 0.55,
        iridescenceIOR: 1.33,
        iridescenceThicknessRange: [200, 440],
        envMapIntensity: 1.35,
        ...emissivePatch
      });
    }
    case "soapBubble": {
      return material.physical({
        color,
        opacity: opts.opacity ?? 0.28,
        alphaMode: "blend",
        roughness: opts.roughness ?? 0.03,
        metallic: 0.02,
        clearcoat: 0.98,
        clearcoatRoughness: 0.02,
        iridescence: 0.92,
        iridescenceIOR: 1.33,
        iridescenceThicknessRange: [180, 480],
        envMapIntensity: 1.45,
        ...emissivePatch
      });
    }
    case "warmGlow": {
      const texPatch = opts.craftTexture ? { texture: getCraftTexture(opts.craftTexture) } : {};
      const glowIntensity = opts.emissiveIntensity ?? 0.55;
      return material.standard({
        color,
        roughness: opts.roughness ?? 0.32,
        emissive: opts.emissive ?? color,
        emissiveIntensity: glowIntensity,
        ...(glowIntensity > 0.1 ? { practical: true } : {}),
        envMapIntensity: 0.42,
        ...texPatch
      });
    }
  }
}

// ---------------------------------------------------------------- low-level buffer access & normal verification

function toFloat32(src: AuraCustomGeometrySpec["positions"] | undefined): Float32Array {
  if (!src) return new Float32Array(0);
  if (src instanceof Float32Array) return src;
  const flat: number[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const item = src[i];
    if (typeof item === "number") {
      flat.push(item);
    } else if (item) {
      flat.push(item[0], item[1], item[2]);
    }
  }
  return Float32Array.from(flat);
}

function toFloat32Uv(src: AuraCustomGeometrySpec["uvs"] | undefined, vertexCount: number): Float32Array {
  if (!src) return new Float32Array(vertexCount * 2);
  if (src instanceof Float32Array) return src;
  const flat: number[] = [];
  for (let i = 0; i < src.length; i += 1) {
    const item = src[i];
    if (typeof item === "number") {
      flat.push(item);
    } else if (item) {
      flat.push(item[0], item[1]);
    }
  }
  return Float32Array.from(flat);
}

function toIndexArray(src: AuraCustomGeometrySpec["indices"], vertexCount: number): Uint16Array | Uint32Array {
  if (src instanceof Uint16Array || src instanceof Uint32Array) return src;
  if (Array.isArray(src) && src.length > 0) {
    return vertexCount > 65535 ? Uint32Array.from(src) : Uint16Array.from(src);
  }
  const seq = vertexCount > 65535 ? new Uint32Array(vertexCount) : new Uint16Array(vertexCount);
  for (let i = 0; i < vertexCount; i += 1) seq[i] = i;
  return seq;
}

/**
 * Verifies that a closed star/convex organic shell has radially OUTWARD normals (`(p - centroid) · n > 0`).
 * Automatically flips normals and winding if inverted so dark inside-out surfaces are mathematically impossible.
 */
export function ensureOutwardNormals(spec: AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const pos = toFloat32(spec.positions);
  const vCount = pos.length / 3;
  if (vCount === 0) return spec;
  const nrm = spec.normals ? toFloat32(spec.normals) : new Float32Array(0);
  if (nrm.length !== pos.length) return spec;

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < vCount; i += 1) {
    cx += pos[i * 3] ?? 0;
    cy += pos[i * 3 + 1] ?? 0;
    cz += pos[i * 3 + 2] ?? 0;
  }
  cx /= vCount;
  cy /= vCount;
  cz /= vCount;

  let radialDot = 0;
  for (let i = 0; i < vCount; i += 1) {
    const dx = (pos[i * 3] ?? 0) - cx;
    const dy = (pos[i * 3 + 1] ?? 0) - cy;
    const dz = (pos[i * 3 + 2] ?? 0) - cz;
    radialDot += dx * (nrm[i * 3] ?? 0) + dy * (nrm[i * 3 + 1] ?? 0) + dz * (nrm[i * 3 + 2] ?? 0);
  }
  if (radialDot >= 0) return spec;

  const flippedNormals = new Float32Array(nrm.length);
  for (let i = 0; i < nrm.length; i += 1) {
    flippedNormals[i] = -(nrm[i] ?? 0);
  }
  const idx = toIndexArray(spec.indices, vCount);
  const flippedIndices = vCount > 65535 ? new Uint32Array(idx.length) : new Uint16Array(idx.length);
  for (let i = 0; i + 2 < idx.length; i += 3) {
    flippedIndices[i] = idx[i] ?? 0;
    flippedIndices[i + 1] = idx[i + 2] ?? 0;
    flippedIndices[i + 2] = idx[i + 1] ?? 0;
  }
  return {
    ...spec,
    normals: flippedNormals,
    indices: flippedIndices
  };
}

// ---------------------------------------------------------------- organic spline & modifier builders

export interface LatheBezierSegment {
  readonly cp1: ProceduralVec2;
  readonly cp2: ProceduralVec2;
  readonly to: ProceduralVec2;
}

/** Samples a multi-inflection cubic Bezier profile `[radius, y]` via `@aura3d/engine/procedural` `path2d`. */
export function bezierProfilePoints(
  start: ProceduralVec2,
  segments: readonly LatheBezierSegment[],
  samplesPerSegment = 10
): readonly ProceduralVec2[] {
  const builder = path2d().moveTo(Math.max(0, start[0]), start[1]);
  for (const seg of segments) {
    builder.cubicTo(
      Math.max(0, seg.cp1[0]),
      seg.cp1[1],
      Math.max(0, seg.cp2[0]),
      seg.cp2[1],
      Math.max(0, seg.to[0]),
      seg.to[1]
    );
  }
  const raw = builder.points({ curveSegments: Math.max(4, samplesPerSegment) });
  return raw.map((pt): ProceduralVec2 => [Math.max(0, pt[0]), pt[1]]);
}

export interface OrganicModulateResult {
  readonly r?: number;
  readonly rx?: number;
  readonly rz?: number;
  readonly dx?: number;
  readonly dy?: number;
  readonly dz?: number;
}

export interface SculptOrganicLatheOptions {
  /** Radial segments around +Y (default 44 for silky-smooth silhouettes). */
  readonly segments?: number;
  /** Profile crease angle in radians (default Math.PI for continuous plush shading). */
  readonly creaseAngle?: number;
  readonly phiStart?: number;
  readonly phiLength?: number;
  /** Optional azimuthal modulation (`theta = 0` is +Z front, `PI/2` is +X right, `PI` is -Z back). */
  readonly modulate?: (theta: number, v01: number, baseR: number, baseY: number) => OrganicModulateResult;
  /** X/Z elliptical aspect ratios even without a custom `modulate` callback. */
  readonly scaleX?: number;
  readonly scaleZ?: number;
}

/**
 * Sculpted anatomical surface of revolution over multi-inflection Bezier profiles.
 * Automatically orders profile bottom-to-top and verifies outward normals.
 */
export function sculptOrganicLathe(
  profile: readonly ProceduralVec2[],
  opts: SculptOrganicLatheOptions = {}
): AuraCustomGeometrySpec {
  if (profile.length < 2) {
    throw new RangeError("sculptOrganicLathe requires at least 2 profile points");
  }
  const ordered =
    (profile[profile.length - 1]?.[1] ?? 0) < (profile[0]?.[1] ?? 0)
      ? [...profile].reverse()
      : profile;
  const clamped = ordered.map((pt): ProceduralVec2 => [Math.max(0, pt[0]), pt[1]]);
  const segments = opts.segments ?? 44;
  const sx = opts.scaleX ?? 1;
  const sz = opts.scaleZ ?? 1;

  if (!opts.modulate && sx === 1 && sz === 1) {
    const built = latheGeometry({
      profile: clamped,
      segments,
      creaseAngle: opts.creaseAngle ?? Math.PI,
      ...(opts.phiStart !== undefined ? { phiStart: opts.phiStart } : {}),
      ...(opts.phiLength !== undefined ? { phiLength: opts.phiLength } : {})
    });
    if ((opts.phiLength ?? TAU) < TAU - 1e-3) return built;
    return ensureOutwardNormals(built);
  }

  const n = clamped.length - 1;
  const vSegs = Math.max(28, n);
  const sampleProfile = (v01: number): ProceduralVec2 => {
    const fv = Math.max(0, Math.min(n, v01 * n));
    const idx = Math.min(n - 1, Math.floor(fv));
    const frac = fv - idx;
    const a = clamped[idx] ?? [0, 0];
    const b = clamped[idx + 1] ?? a;
    return [a[0] + (b[0] - a[0]) * frac, a[1] + (b[1] - a[1]) * frac];
  };

  // Counter-clockwise azimuth around +Y starting at +Z (`x = rx * sin(theta), z = rz * cos(theta)`)
  // with `v` ascending bottom-to-top yields outward normals `du x dv` everywhere!
  const surf = parametricSurface({
    uSegments: segments,
    vSegments: vSegs,
    wrapU: (opts.phiLength ?? TAU) >= TAU - 1e-4,
    fn: (u, v) => {
      const phiStart = opts.phiStart ?? 0;
      const phiLength = opts.phiLength ?? TAU;
      const theta = phiStart + u * phiLength;
      const [baseR, baseY] = sampleProfile(v);
      const mod = opts.modulate ? opts.modulate(theta, v, baseR, baseY) : undefined;
      const rCommon = mod?.r ?? baseR;
      const rx = (mod?.rx ?? rCommon) * sx;
      const rz = (mod?.rz ?? rCommon) * sz;
      const poleFade = baseR <= 1e-6 ? 0 : Math.min(1, baseR * 25);
      const dx = (mod?.dx ?? 0) * poleFade;
      const dy = mod?.dy ?? 0;
      const dz = (mod?.dz ?? 0) * poleFade;
      return [Math.sin(theta) * rx + dx, baseY + dy, Math.cos(theta) * rz + dz];
    }
  });
  if ((opts.phiLength ?? TAU) < TAU - 1e-3) return surf;
  return ensureOutwardNormals(surf);
}

export interface SculptCurvedLimbOptions {
  readonly steps?: number;
  readonly radialSegments?: number;
  readonly creaseAngle?: number;
  /** Smooth hemispherical dome at t = 0 (default true so shoulders/roots never have flat pipe caps). */
  readonly roundedStart?: boolean;
  /** Smooth hemispherical dome at t = 1 (default true so paws/tips/ears never look sawed-off). */
  readonly roundedEnd?: boolean;
  /** Fraction of path length devoted to each rounded dome cap (default 0.14). */
  readonly capFraction?: number;
  /** Elliptical cross-section aspect ratios in local (normal, binormal) frame (e.g. flat puppy ears or wings). */
  readonly profileScaleX?: number;
  readonly profileScaleY?: number;
  readonly twist?: number;
  readonly closed?: boolean;
}

/**
 * Variable-radius organic spline sweep for arms, legs, tails, floppy ears, horns, stems, and trunks.
 * Smoothly domes open ends by default so limbs never show flat polygon cylinder caps.
 */
export function sculptCurvedLimb(
  spinePoints: readonly ProceduralVec3[],
  radiusFn: number | ((t: number) => number),
  opts: SculptCurvedLimbOptions = {}
): AuraCustomGeometrySpec {
  if (spinePoints.length < 2) {
    throw new RangeError("sculptCurvedLimb requires at least 2 spine points");
  }
  const radialSegments = opts.radialSegments ?? 28;
  const steps = opts.steps ?? 28;
  const closed = opts.closed ?? false;
  const roundedStart = closed ? false : (opts.roundedStart ?? true);
  const roundedEnd = closed ? false : (opts.roundedEnd ?? true);
  const capFrac = Math.max(0.04, Math.min(0.35, opts.capFraction ?? 0.14));
  const evalBaseR = typeof radiusFn === "function" ? radiusFn : () => radiusFn;

  // Extend the spine slightly at rounded ends so the hemispherical dome extends past the endpoint naturally.
  const pts: ProceduralVec3[] = [...spinePoints];
  if (!closed && pts.length >= 2) {
    const first = pts[0]!;
    const second = pts[1]!;
    const last = pts[pts.length - 1]!;
    const prev = pts[pts.length - 2]!;
    if (roundedStart) {
      const r0 = Math.max(0, evalBaseR(0));
      const dx = first[0] - second[0];
      const dy = first[1] - second[1];
      const dz = first[2] - second[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      pts[0] = [first[0] + (dx / len) * r0 * 0.45, first[1] + (dy / len) * r0 * 0.45, first[2] + (dz / len) * r0 * 0.45];
    }
    if (roundedEnd) {
      const r1 = Math.max(0, evalBaseR(1));
      const dx = last[0] - prev[0];
      const dy = last[1] - prev[1];
      const dz = last[2] - prev[2];
      const len = Math.hypot(dx, dy, dz) || 1;
      pts[pts.length - 1] = [last[0] + (dx / len) * r1 * 0.45, last[1] + (dy / len) * r1 * 0.45, last[2] + (dz / len) * r1 * 0.45];
    }
  }

  const curve = catmullRomCurve(pts, { closed });
  const sx = opts.profileScaleX ?? 1;
  const sy = opts.profileScaleY ?? 1;
  const profile: ProceduralVec2[] = Array.from({ length: radialSegments }, (_, i) => {
    const a = (i / radialSegments) * TAU;
    return [Math.cos(a) * sx, Math.sin(a) * sy];
  });

  const radius = (t: number): number => {
    const base = Math.max(0, evalBaseR(t));
    let dome = 1;
    if (roundedStart && t < capFrac) {
      const u = Math.max(0, t / capFrac);
      dome *= Math.sin(u * Math.PI * 0.5);
    }
    if (roundedEnd && t > 1 - capFrac) {
      const u = Math.max(0, (1 - t) / capFrac);
      dome *= Math.sin(u * Math.PI * 0.5);
    }
    return base * dome;
  };

  const needCaps = !closed && (!roundedStart || !roundedEnd);
  return sweepGeometry({
    path: curve,
    steps,
    radialSegments,
    profile,
    radius,
    creaseAngle: opts.creaseAngle ?? Math.PI,
    caps: needCaps,
    twist: opts.twist ?? 0
  });
}

/** Bends an arbitrary sculpted mesh cleanly along a 3D spline via `deformAuraMeshAlongCurve(...).geometry`. */
export function sculptDeformedAlongCurve(
  source: AuraCustomGeometrySpec,
  spinePoints: readonly ProceduralVec3[],
  axis: "x" | "y" | "z" = "y",
  up: readonly [number, number, number] = axis === "y" ? [0, 0, 1] : [0, 1, 0]
): AuraCustomGeometrySpec {
  const curve = catmullRomCurve(spinePoints);
  return deformAuraMeshAlongCurve(source, {
    curve: {
      getPoint: (t) => curve.point(t)
    },
    axis,
    up
  }).geometry;
}

export interface OrganicPuffItem {
  readonly position: ProceduralVec3;
  readonly scale: number | ProceduralVec3;
  readonly rotation?: ProceduralVec3;
  readonly colorHex?: string;
}

export interface SculptFbmPuffsOptions {
  readonly amplitude?: number;
  readonly frequency?: number;
  readonly seed?: number;
  readonly maxEdgeLength?: number;
  readonly maxTriangles?: number;
  readonly puffSegments?: number;
}

/**
 * Builds hand-felted cumulus wool (`sheep`), tree canopies (`tree`), shrubs (`bush`), and clouds (`cloud`)
 * using `tessellateAuraMesh` + smooth 3D `createFbm3D` normal displacement + `weldAuraGeometry` + smooth normals.
 */
export function sculptFbmOrganicPuffs(
  puffs: readonly OrganicPuffItem[],
  opts: SculptFbmPuffsOptions = {}
): { readonly geometry: AuraCustomGeometrySpec; readonly subShapeCount: number } {
  if (puffs.length === 0) {
    throw new RangeError("sculptFbmOrganicPuffs requires at least one puff");
  }
  const seg = opts.puffSegments ?? 20;
  const rings = Math.max(12, Math.round(seg * 0.65));

  // Build unit sphere with 3D-continuous planar UVs so seam vertices share identical attributes and weld cleanly!
  const pos: number[] = [];
  const nrm: number[] = [];
  const uvs: number[] = [];
  const idx: number[] = [];
  for (let r = 0; r <= rings; r += 1) {
    const v = r / rings;
    const phi = (v - 0.5) * Math.PI;
    const cy = Math.sin(phi);
    const cr = Math.cos(phi);
    for (let s = 0; s < seg; s += 1) {
      const theta = (s / seg) * TAU;
      const cx = Math.sin(theta) * cr;
      const cz = Math.cos(theta) * cr;
      pos.push(cx * 0.5, cy * 0.5, cz * 0.5);
      nrm.push(cx, cy, cz);
      uvs.push(cx * 0.5 + 0.5, cy * 0.5 + 0.5);
    }
  }
  for (let r = 0; r < rings; r += 1) {
    for (let s = 0; s < seg; s += 1) {
      const nextS = (s + 1) % seg;
      const a = r * seg + s;
      const b = r * seg + nextS;
      const c = (r + 1) * seg + s;
      const d = (r + 1) * seg + nextS;
      if (r > 0) idx.push(a, b, c);
      if (r < rings - 1) idx.push(b, d, c);
    }
  }
  const unitPuff: AuraCustomGeometrySpec = {
    kind: "aura-custom-geometry",
    positions: Float32Array.from(pos),
    normals: Float32Array.from(nrm),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(idx)
  };

  const parts: ComposePart[] = puffs.map((p) => ({
    geometry: unitPuff,
    position: p.position,
    rotation: p.rotation ?? [0, 0, 0],
    scale: p.scale,
    ...(p.colorHex ? { color: srgbHexToLinearRgba(p.colorHex) } : {})
  }));

  const merged = composeGeometry(parts);
  const subdivided =
    opts.maxEdgeLength !== undefined && opts.maxEdgeLength > 0
      ? tessellateAuraMesh(merged, {
          maxEdgeLength: opts.maxEdgeLength,
          maxTriangles: opts.maxTriangles ?? 2200,
          maxOperations: 900
        }).geometry
      : merged;

  const pArr = Float32Array.from(toFloat32(subdivided.positions));
  const nArr = toFloat32(subdivided.normals);
  const fbm = createFbm3D(opts.seed ?? 307, {
    octaves: 3,
    frequency: opts.frequency ?? 3.4,
    gain: 0.48
  });
  const amp = opts.amplitude ?? 0.016;
  const vCount = pArr.length / 3;
  for (let i = 0; i < vCount; i += 1) {
    const px = pArr[i * 3] ?? 0;
    const py = pArr[i * 3 + 1] ?? 0;
    const pz = pArr[i * 3 + 2] ?? 0;
    const nx = nArr[i * 3] ?? 0;
    const ny = nArr[i * 3 + 1] ?? 1;
    const nz = nArr[i * 3 + 2] ?? 0;
    // Gently bias FBM positive so puffs stay pillowy and convex rather than pinched!
    const ripple = (fbm(px, py, pz) * 0.65 + 0.35) * amp;
    pArr[i * 3] = px + nx * ripple;
    pArr[i * 3 + 1] = py + ny * ripple;
    pArr[i * 3 + 2] = pz + nz * ripple;
  }

  const displaced: AuraCustomGeometrySpec = {
    ...subdivided,
    positions: pArr
  };
  const welded = weldAuraGeometry(displaced, 1e-5).geometry;
  const smoothed: AuraCustomGeometrySpec = {
    ...welded,
    normals: geometry.computeNormals(welded)
  };
  return {
    geometry: ensureOutwardNormals(smoothed),
    subShapeCount: puffs.length
  };
}

// ---------------------------------------------------------------- polygon extrusion with holes & chamfered bevels

function signedArea2D(ring: readonly ProceduralVec2[]): number {
  let area = 0;
  const n = ring.length;
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    area += a[0] * b[1] - b[0] * a[1];
  }
  return area * 0.5;
}

function cleanRing2D(ring: readonly ProceduralVec2[], wantCcw: boolean): ProceduralVec2[] {
  const out: ProceduralVec2[] = [];
  for (const pt of ring) {
    const prev = out[out.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-6) {
      out.push([pt[0], pt[1]]);
    }
  }
  if (out.length > 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) {
      out.pop();
    }
  }
  const area = signedArea2D(out);
  if ((wantCcw && area < 0) || (!wantCcw && area > 0)) {
    out.reverse();
  }
  return out;
}

function cross2D(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): number {
  return (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
}

function pointInTri2D(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number
): boolean {
  const c1 = cross2D(ax, ay, bx, by, px, py);
  const c2 = cross2D(bx, by, cx, cy, px, py);
  const c3 = cross2D(cx, cy, ax, ay, px, py);
  return c1 >= -1e-9 && c2 >= -1e-9 && c3 >= -1e-9;
}

function bridgeHoleIntoPolygon(outer: ProceduralVec2[], hole: readonly ProceduralVec2[]): ProceduralVec2[] {
  let hm = 0;
  for (let i = 1; i < hole.length; i += 1) {
    if ((hole[i]?.[0] ?? -Infinity) > (hole[hm]?.[0] ?? -Infinity)) {
      hm = i;
    }
  }
  const hx = hole[hm]![0];
  const hy = hole[hm]![1];

  let bestIx = Infinity;
  let candidateIdx = -1;
  const n = outer.length;
  for (let i = 0; i < n; i += 1) {
    const a = outer[i]!;
    const b = outer[(i + 1) % n]!;
    if ((a[1] > hy) === (b[1] > hy)) continue;
    const ix = a[0] + ((hy - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
    if (ix >= hx - 1e-7 && ix < bestIx) {
      bestIx = ix;
      candidateIdx = a[0] >= b[0] ? i : (i + 1) % n;
    }
  }
  if (candidateIdx < 0) {
    let bestDist = Infinity;
    for (let i = 0; i < n; i += 1) {
      const p = outer[i]!;
      const d = Math.hypot(p[0] - hx, p[1] - hy);
      if (d < bestDist) {
        bestDist = d;
        candidateIdx = i;
      }
    }
  }

  const cp = outer[candidateIdx]!;
  let bridgeIdx = candidateIdx;
  let bestAngle = Infinity;
  let bestDist = Math.hypot(cp[0] - hx, cp[1] - hy);

  const ax = hx;
  const ay = hy;
  const bx = Number.isFinite(bestIx) ? bestIx : cp[0];
  const by = hy;
  const cx = cp[0];
  const cy = cp[1];
  const triArea = cross2D(ax, ay, bx, by, cx, cy);

  for (let i = 0; i < n; i += 1) {
    if (i === candidateIdx) continue;
    const prev = outer[(i + n - 1) % n]!;
    const cur = outer[i]!;
    const next = outer[(i + 1) % n]!;
    const isReflex = cross2D(prev[0], prev[1], cur[0], cur[1], next[0], next[1]) < 1e-8;
    if (!isReflex) continue;
    const inside =
      triArea >= 0
        ? pointInTri2D(cur[0], cur[1], ax, ay, bx, by, cx, cy)
        : pointInTri2D(cur[0], cur[1], ax, ay, cx, cy, bx, by);
    if (!inside) continue;
    const dx = cur[0] - hx;
    const dy = Math.abs(cur[1] - hy);
    if (dx < -1e-7) continue;
    const angle = Math.atan2(dy, Math.max(1e-9, dx));
    const dist = Math.hypot(dx, dy);
    if (angle < bestAngle - 1e-7 || (Math.abs(angle - bestAngle) <= 1e-7 && dist < bestDist)) {
      bestAngle = angle;
      bestDist = dist;
      bridgeIdx = i;
    }
  }

  const merged: ProceduralVec2[] = [];
  for (let i = 0; i <= bridgeIdx; i += 1) {
    merged.push(outer[i]!);
  }
  for (let k = 0; k <= hole.length; k += 1) {
    merged.push(hole[(hm + k) % hole.length]!);
  }
  merged.push(outer[bridgeIdx]!);
  for (let i = bridgeIdx + 1; i < n; i += 1) {
    merged.push(outer[i]!);
  }
  return merged;
}

function triangulatePolygonWithHoles(
  outerRing: readonly ProceduralVec2[],
  holeRings: readonly (readonly ProceduralVec2[])[]
): { readonly vertices: readonly ProceduralVec2[]; readonly triangles: readonly number[] } {
  let poly = [...outerRing];
  if (holeRings.length > 0) {
    const orderedHoles = [...holeRings].sort((ha, hb) => {
      const maxA = Math.max(...ha.map((p) => p[0]));
      const maxB = Math.max(...hb.map((p) => p[0]));
      return maxB - maxA;
    });
    for (const hole of orderedHoles) {
      if (hole.length >= 3) {
        poly = bridgeHoleIntoPolygon(poly, hole);
      }
    }
  }

  const verts = poly;
  const active: number[] = verts.map((_, idx) => idx);
  const tris: number[] = [];
  let guard = active.length * active.length * 3 + 32;

  while (active.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    const m = active.length;
    for (let pass = 0; pass < 2 && !earFound; pass += 1) {
      const eps = pass === 0 ? 1e-8 : -1e-5;
      for (let i = 0; i < m; i += 1) {
        const i0 = active[(i + m - 1) % m]!;
        const i1 = active[i]!;
        const i2 = active[(i + 1) % m]!;
        const a = verts[i0]!;
        const b = verts[i1]!;
        const c = verts[i2]!;
        const area2 = cross2D(a[0], a[1], b[0], b[1], c[0], c[1]);
        if (area2 <= eps) continue;
        let blocked = false;
        if (area2 > 1e-9) {
          for (let j = 0; j < m; j += 1) {
            const iv = active[j]!;
            if (iv === i0 || iv === i1 || iv === i2) continue;
            const p = verts[iv]!;
            if (
              (Math.hypot(p[0] - a[0], p[1] - a[1]) <= 1e-6) ||
              (Math.hypot(p[0] - b[0], p[1] - b[1]) <= 1e-6) ||
              (Math.hypot(p[0] - c[0], p[1] - c[1]) <= 1e-6)
            ) {
              continue;
            }
            if (pointInTri2D(p[0], p[1], a[0], a[1], b[0], b[1], c[0], c[1])) {
              blocked = true;
              break;
            }
          }
        }
        if (!blocked) {
          if (area2 > 1e-10) {
            tris.push(i0, i1, i2);
          }
          active.splice(i, 1);
          earFound = true;
          break;
        }
      }
    }
    if (!earFound) {
      const i0 = active[0]!;
      const i1 = active[1]!;
      const i2 = active[2]!;
      tris.push(i0, i1, i2);
      active.splice(1, 1);
    }
  }
  if (active.length === 3) {
    const a = verts[active[0]!]!;
    const b = verts[active[1]!]!;
    const c = verts[active[2]!]!;
    if (Math.abs(cross2D(a[0], a[1], b[0], b[1], c[0], c[1])) > 1e-10) {
      tris.push(active[0]!, active[1]!, active[2]!);
    }
  }
  return { vertices: verts, triangles: tris };
}

function ringOutwardMiterNormals(ring: readonly ProceduralVec2[]): readonly ProceduralVec2[] {
  // For CCW outer ring, outward edge normal of (a -> b) is (+dy, -dx) / len.
  // For CW hole ring, (+dy, -dx) / len points INTO the hole (away from the solid), which is ALSO the surface outward normal!
  const n = ring.length;
  const edgeNormals: ProceduralVec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const b = ring[(i + 1) % n]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    edgeNormals.push([dy / len, -dx / len]);
  }
  const miters: ProceduralVec2[] = [];
  for (let i = 0; i < n; i += 1) {
    const nPrev = edgeNormals[(i + n - 1) % n]!;
    const nNext = edgeNormals[i]!;
    const sx = nPrev[0] + nNext[0];
    const sy = nPrev[1] + nNext[1];
    const slen = Math.hypot(sx, sy);
    if (slen < 1e-5) {
      miters.push(nNext);
    } else {
      const bx = sx / slen;
      const by = sy / slen;
      const dot = Math.max(0.48, bx * nNext[0] + by * nNext[1]);
      const scale = Math.min(1.85, 1 / dot);
      miters.push([bx * scale, by * scale]);
    }
  }
  return miters;
}

export interface ExtrudeContourOptions {
  /** Outer 2D contour in XY. */
  readonly outer: readonly ProceduralVec2[];
  /** Optional inner cutouts (true open bores/counters). */
  readonly holes?: readonly (readonly ProceduralVec2[])[];
  /** Total extruded thickness along Z (centered on [-depth/2, +depth/2]). */
  readonly depth: number;
  readonly bevelSize?: number;
  readonly bevelThickness?: number;
  readonly bevelSegments?: number;
  readonly creaseAngle?: number;
}

/**
 * Extrudes a 2D XY contour with arbitrary open inner `holes` and smooth toddler-safe chamfered bevels.
 * Centered on Z in `[-depth/2, +depth/2]` with complete `positions`, `normals`, `uvs`, and `indices`.
 */
export function extrudeContourSpec(opts: ExtrudeContourOptions): AuraCustomGeometrySpec {
  const outer = cleanRing2D(opts.outer, true);
  if (outer.length < 3) {
    throw new RangeError("extrudeContourSpec requires at least 3 distinct outer contour points");
  }
  const holes = (opts.holes ?? []).map((h) => cleanRing2D(h, false)).filter((h) => h.length >= 3);
  const totalDepth = Math.max(1e-4, opts.depth);
  const bevelSegs = Math.max(0, Math.round(opts.bevelSegments ?? 2));
  const rawBevelThick = bevelSegs > 0 ? (opts.bevelThickness ?? Math.min(0.016, totalDepth * 0.18)) : 0;
  const bevelThick = Math.min(rawBevelThick, totalDepth * 0.45);
  const bevelSize = bevelSegs > 0 ? (opts.bevelSize ?? bevelThick * 0.8) : 0;
  const halfFlatZ = Math.max(0, totalDepth * 0.5 - bevelThick);
  const creaseCos = Math.cos(opts.creaseAngle ?? 0.72);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of outer) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);

  const insetRing = (
    ring: readonly ProceduralVec2[],
    miters: readonly ProceduralVec2[],
    insetDist: number
  ): ProceduralVec2[] =>
    ring.map((p, idx): ProceduralVec2 => {
      const m = miters[idx]!;
      return [p[0] - m[0] * insetDist, p[1] - m[1] * insetDist];
    });

  const outerMiters = ringOutwardMiterNormals(outer);
  const holeMiters = holes.map((h) => ringOutwardMiterNormals(h));

  const capOuter = bevelSize > 0 ? insetRing(outer, outerMiters, bevelSize) : outer;
  const capHoles = holes.map((h, idx) => (bevelSize > 0 ? insetRing(h, holeMiters[idx]!, bevelSize) : h));
  const capTri = triangulatePolygonWithHoles(capOuter, capHoles);

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const zFrontCap = halfFlatZ + bevelThick;
  // Front cap (+Z)
  const frontBase = positions.length / 3;
  for (const p of capTri.vertices) {
    positions.push(p[0], p[1], zFrontCap);
    normals.push(0, 0, 1);
    uvs.push((p[0] - minX) / spanX, (p[1] - minY) / spanY);
  }
  for (let i = 0; i + 2 < capTri.triangles.length; i += 3) {
    indices.push(
      frontBase + capTri.triangles[i]!,
      frontBase + capTri.triangles[i + 1]!,
      frontBase + capTri.triangles[i + 2]!
    );
  }

  // Back cap (-Z)
  const backBase = positions.length / 3;
  for (const p of capTri.vertices) {
    positions.push(p[0], p[1], -zFrontCap);
    normals.push(0, 0, -1);
    uvs.push(1 - (p[0] - minX) / spanX, (p[1] - minY) / spanY);
  }
  for (let i = 0; i + 2 < capTri.triangles.length; i += 3) {
    indices.push(
      backBase + capTri.triangles[i]!,
      backBase + capTri.triangles[i + 2]!,
      backBase + capTri.triangles[i + 1]!
    );
  }

  // Build side + bevel profile stages from front cap edge -> outer front -> outer back -> back cap edge.
  interface ZInsetStage {
    readonly z: number;
    readonly inset: number;
    readonly nz: number;
    readonly nr: number;
    readonly vCoord: number;
  }
  const stages: ZInsetStage[] = [];
  if (bevelSegs > 0 && (bevelThick > 0 || bevelSize > 0)) {
    for (let s = bevelSegs; s >= 0; s -= 1) {
      const a = (s / bevelSegs) * (Math.PI * 0.5);
      stages.push({
        z: halfFlatZ + Math.sin(a) * bevelThick,
        inset: (1 - Math.cos(a)) * bevelSize,
        nz: Math.sin(a),
        nr: Math.cos(a),
        vCoord: 0.15 * (1 - s / bevelSegs)
      });
    }
  } else {
    stages.push({ z: halfFlatZ, inset: 0, nz: 0, nr: 1, vCoord: 0 });
  }
  if (halfFlatZ > 1e-6) {
    stages.push({ z: -halfFlatZ, inset: 0, nz: 0, nr: 1, vCoord: 0.85 });
  }
  if (bevelSegs > 0 && (bevelThick > 0 || bevelSize > 0)) {
    for (let s = 1; s <= bevelSegs; s += 1) {
      const a = (s / bevelSegs) * (Math.PI * 0.5);
      stages.push({
        z: -halfFlatZ - Math.sin(a) * bevelThick,
        inset: (1 - Math.cos(a)) * bevelSize,
        nz: -Math.sin(a),
        nr: Math.cos(a),
        vCoord: 0.85 + 0.15 * (s / bevelSegs)
      });
    }
  }

  const stitchContourBands = (ring: readonly ProceduralVec2[], miters: readonly ProceduralVec2[]): void => {
    const n = ring.length;
    const edgeN: ProceduralVec2[] = [];
    const arcU: number[] = [0];
    for (let i = 0; i < n; i += 1) {
      const a = ring[i]!;
      const b = ring[(i + 1) % n]!;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      edgeN.push([dy / len, -dx / len]);
      arcU.push((arcU[i] ?? 0) + len);
    }
    const perim = Math.max(1e-4, arcU[n] ?? 1);

    // Precompute smooth/hard corner normal pairs per edge endpoint.
    const startN: ProceduralVec2[] = [];
    const endN: ProceduralVec2[] = [];
    for (let i = 0; i < n; i += 1) {
      const nPrev = edgeN[(i + n - 1) % n]!;
      const nCur = edgeN[i]!;
      const nNext = edgeN[(i + 1) % n]!;
      if (nPrev[0] * nCur[0] + nPrev[1] * nCur[1] >= creaseCos) {
        const l = Math.hypot(nPrev[0] + nCur[0], nPrev[1] + nCur[1]) || 1;
        startN.push([(nPrev[0] + nCur[0]) / l, (nPrev[1] + nCur[1]) / l]);
      } else {
        startN.push(nCur);
      }
      if (nCur[0] * nNext[0] + nCur[1] * nNext[1] >= creaseCos) {
        const l = Math.hypot(nCur[0] + nNext[0], nCur[1] + nNext[1]) || 1;
        endN.push([(nCur[0] + nNext[0]) / l, (nCur[1] + nNext[1]) / l]);
      } else {
        endN.push(nCur);
      }
    }

    const sc = stages.length;
    for (let i = 0; i < n; i += 1) {
      const iNext = (i + 1) % n;
      const p0 = ring[i]!;
      const p1 = ring[iNext]!;
      const m0 = miters[i]!;
      const m1 = miters[iNext]!;
      const n0 = startN[i]!;
      const n1 = endN[i]!;
      const u0 = (arcU[i] ?? 0) / perim;
      const u1 = (arcU[i + 1] ?? perim) / perim;
      const base = positions.length / 3;

      for (let s = 0; s < sc; s += 1) {
        const st = stages[s]!;
        const x0 = p0[0] - m0[0] * st.inset;
        const y0 = p0[1] - m0[1] * st.inset;
        const x1 = p1[0] - m1[0] * st.inset;
        const y1 = p1[1] - m1[1] * st.inset;

        const nx0 = n0[0] * st.nr;
        const ny0 = n0[1] * st.nr;
        const nl0 = Math.hypot(nx0, ny0, st.nz) || 1;

        const nx1 = n1[0] * st.nr;
        const ny1 = n1[1] * st.nr;
        const nl1 = Math.hypot(nx1, ny1, st.nz) || 1;

        positions.push(x0, y0, st.z, x1, y1, st.z);
        normals.push(nx0 / nl0, ny0 / nl0, st.nz / nl0, nx1 / nl1, ny1 / nl1, st.nz / nl1);
        uvs.push(u0, st.vCoord, u1, st.vCoord);
      }

      for (let s = 0; s < sc - 1; s += 1) {
        const r0 = base + s * 2;
        const r1 = r0 + 2;
        // As stages go from +Z (r0) to -Z (r1) and edge goes a -> b, (r0, r1, r0+1) has outward normal (+dy, -dx)!
        indices.push(r0, r1, r0 + 1, r0 + 1, r1, r1 + 1);
      }
    }
  };

  stitchContourBands(outer, outerMiters);
  for (let h = 0; h < holes.length; h += 1) {
    stitchContourBands(holes[h]!, holeMiters[h]!);
  }

  return {
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: positions.length / 3 > 65535 ? Uint32Array.from(indices) : Uint16Array.from(indices)
  };
}

// ---------------------------------------------------------------- clean smooth primitives (zero hard facets)

/** Chamfered / filleted 3D rounded box centered on [0, 0, 0] with smooth corner highlights. */
export function roundedBoxSpec(
  width: number,
  height: number,
  depth: number,
  radius = Math.min(width, height, depth) * 0.14,
  cornerSegs = 3
): AuraCustomGeometrySpec {
  const w = Math.max(1e-4, width);
  const h = Math.max(1e-4, height);
  const d = Math.max(1e-4, depth);
  const r = Math.max(1e-5, Math.min(radius, w * 0.48, h * 0.48, d * 0.48));
  const seg = Math.max(2, cornerSegs);
  const innerX = Math.max(0, w * 0.5 - r);
  const innerY = Math.max(0, h * 0.5 - r);
  const innerZ = Math.max(0, d * 0.5 - r);

  // Sample spherical angles across both octant transitions so flat faces and curved fillets share smooth normals!
  const axisSamples = (innerHalf: number): readonly { readonly inner: number; readonly unit: number }[] => {
    const out: { readonly inner: number; readonly unit: number }[] = [];
    for (let i = 0; i <= seg; i += 1) {
      const a = -Math.PI * 0.5 + (i / seg) * (Math.PI * 0.5);
      out.push({ inner: -innerHalf, unit: Math.sin(a) });
    }
    for (let i = 0; i <= seg; i += 1) {
      const a = (i / seg) * (Math.PI * 0.5);
      out.push({ inner: innerHalf, unit: Math.sin(a) });
    }
    return out;
  };

  const yRows = axisSamples(innerY);
  const uCols = seg * 4 + 4;
  const ringSamples: { readonly ix: number; readonly iz: number; readonly ux: number; readonly uz: number }[] = [];
  const corners: readonly (readonly [number, number, number])[] = [
    [innerX, innerZ, 0],
    [-innerX, innerZ, Math.PI * 0.5],
    [-innerX, -innerZ, Math.PI],
    [innerX, -innerZ, Math.PI * 1.5]
  ];
  for (const [cx, cz, startAng] of corners) {
    for (let i = 0; i <= seg; i += 1) {
      const ang = startAng + (i / seg) * (Math.PI * 0.5);
      // CCW around +Y starting from (+X corner -> +Z -> -X -> -Z): sin(ang) vs cos(ang)!
      ringSamples.push({
        ix: cx,
        iz: cz,
        ux: Math.cos(ang),
        uz: -Math.sin(ang)
      });
    }
  }
  // Wait: verify CCW around +Y! At ang = 0 -> (+1, 0, -0); ang = PI/2 -> (0, 0, -1) -> that's CW!
  // Let's build ringSamples explicitly CCW around +Y (+Z -> +X -> -Z -> -X) so outward normals are 100% analytic!
  ringSamples.length = 0;
  const ccwQuadrants: readonly (readonly [number, number, number])[] = [
    [innerX, innerZ, 0],
    [innerX, -innerZ, Math.PI * 0.5],
    [-innerX, -innerZ, Math.PI],
    [-innerX, innerZ, Math.PI * 1.5]
  ];
  for (const [cx, cz, startAng] of ccwQuadrants) {
    for (let i = 0; i <= seg; i += 1) {
      const ang = startAng + (i / seg) * (Math.PI * 0.5);
      ringSamples.push({
        ix: cx,
        iz: cz,
        ux: Math.sin(ang),
        uz: Math.cos(ang)
      });
    }
  }
  ringSamples.push(ringSamples[0]!);

  const cols = ringSamples.length;
  const rows = yRows.length;
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j < rows; j += 1) {
    const yr = yRows[j]!;
    const cosPhi = Math.sqrt(Math.max(0, 1 - yr.unit * yr.unit));
    for (let i = 0; i < cols; i += 1) {
      const rs = ringSamples[i]!;
      const nx = rs.ux * cosPhi;
      const ny = yr.unit;
      const nz = rs.uz * cosPhi;
      const nl = Math.hypot(nx, ny, nz) || 1;
      const unx = nx / nl;
      const uny = ny / nl;
      const unz = nz / nl;
      positions.push(rs.ix + unx * r, yr.inner + uny * r, rs.iz + unz * r);
      normals.push(unx, uny, unz);
      uvs.push(i / Math.max(1, uCols), j / Math.max(1, rows - 1));
    }
  }
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < cols - 1; i += 1) {
      const v00 = j * cols + i;
      const v10 = v00 + 1;
      const v01 = v00 + cols;
      const v11 = v01 + 1;
      indices.push(v00, v10, v01, v10, v11, v01);
    }
  }
  // Close top and bottom inner rectangles cleanly.
  const topPole = positions.length / 3;
  positions.push(0, h * 0.5, 0);
  normals.push(0, 1, 0);
  uvs.push(0.5, 1);
  const topRowStart = (rows - 1) * cols;
  for (let i = 0; i < cols - 1; i += 1) {
    indices.push(topPole, topRowStart + i, topRowStart + i + 1);
  }

  const botPole = positions.length / 3;
  positions.push(0, -h * 0.5, 0);
  normals.push(0, -1, 0);
  uvs.push(0.5, 0);
  for (let i = 0; i < cols - 1; i += 1) {
    indices.push(botPole, i + 1, i);
  }

  return ensureOutwardNormals({
    kind: "aura-custom-geometry",
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint16Array.from(indices)
  });
}

/** Smooth ellipsoid centered on [0, 0, 0] with semi-axes (rx, ry, rz). */
export function ellipsoidSpec(
  rx: number,
  ry: number,
  rz: number,
  uSegs = 36,
  vSegs = 24
): AuraCustomGeometrySpec {
  const profile: ProceduralVec2[] = [];
  for (let j = 0; j <= vSegs; j += 1) {
    const a = -Math.PI * 0.5 + (j / vSegs) * Math.PI;
    profile.push([Math.max(0, Math.cos(a)), Math.sin(a) * ry]);
  }
  return sculptOrganicLathe(profile, {
    segments: uSegs,
    scaleX: rx,
    scaleZ: rz
  });
}

/** Smooth vertical capsule centered on [0, 0, 0] with total height `lengthY + 2 * radius`. */
export function capsuleSpec(
  radius: number,
  lengthY: number,
  radialSegs = 34,
  capRings = 10
): AuraCustomGeometrySpec {
  const r = Math.max(1e-4, radius);
  const halfLen = Math.max(0, lengthY * 0.5);
  const profile: ProceduralVec2[] = [];
  for (let i = 0; i <= capRings; i += 1) {
    const a = -Math.PI * 0.5 + (i / capRings) * (Math.PI * 0.5);
    profile.push([Math.max(0, Math.cos(a) * r), -halfLen + Math.sin(a) * r]);
  }
  for (let i = 1; i <= capRings; i += 1) {
    const a = (i / capRings) * (Math.PI * 0.5);
    profile.push([Math.max(0, Math.cos(a) * r), halfLen + Math.sin(a) * r]);
  }
  return latheGeometry({ profile, segments: radialSegs, creaseAngle: Math.PI });
}

/** Chamfered cylinder / frustum centered on [0, 0, 0] along Y. */
export function cylinderSpec(
  radiusTop: number,
  radiusBottom: number,
  height: number,
  radialSegs = 36,
  bevel = Math.min(Math.max(radiusTop, radiusBottom), height) * 0.08
): AuraCustomGeometrySpec {
  const rt = Math.max(1e-4, radiusTop);
  const rb = Math.max(1e-4, radiusBottom);
  const h = Math.max(1e-4, height);
  const b = Math.max(0, Math.min(bevel, rt * 0.45, rb * 0.45, h * 0.35));
  const halfH = h * 0.5;
  const profile: ProceduralVec2[] =
    b > 1e-5
      ? [
          [0, -halfH],
          [rb - b, -halfH],
          [rb - b * 0.29, -halfH + b * 0.29],
          [rb, -halfH + b],
          [rt, halfH - b],
          [rt - b * 0.29, halfH - b * 0.29],
          [rt - b, halfH],
          [0, halfH]
        ]
      : [
          [0, -halfH],
          [rb, -halfH],
          [rt, halfH],
          [0, halfH]
        ];
  return latheGeometry({ profile, segments: radialSegs, creaseAngle: b > 1e-5 ? 1.25 : 0.7 });
}

/** Soft-tipped cone centered on [0, 0, 0] along Y (`y in [-height/2, +height/2]`). */
export function coneSpec(
  radius: number,
  height: number,
  radialSegs = 32,
  tipRadius = radius * 0.08
): AuraCustomGeometrySpec {
  const r = Math.max(1e-4, radius);
  const h = Math.max(1e-4, height);
  const tr = Math.max(0, Math.min(r * 0.6, tipRadius));
  const halfH = h * 0.5;
  const bevel = Math.min(r * 0.1, h * 0.08);
  const profile: ProceduralVec2[] = [
    [0, -halfH],
    [r - bevel, -halfH],
    [r, -halfH + bevel],
    ...(tr > 1e-5
      ? ([
          [tr, halfH - tr * 0.7],
          [tr * 0.55, halfH - tr * 0.18],
          [0, halfH]
        ] as const)
      : ([[0, halfH]] as const))
  ];
  return latheGeometry({ profile, segments: radialSegs, creaseAngle: 1.25 });
}

/** Smooth torus in the XY plane centered on [0, 0, 0] (matching stand-in XY orientation). */
export function torusSpec(
  majorRadius: number,
  tubeRadius: number,
  majorSegs = 36,
  tubeSegs = 18,
  arc = TAU
): AuraCustomGeometrySpec {
  const R = Math.max(1e-4, majorRadius);
  const r = Math.max(1e-4, tubeRadius);
  const pathPts: ProceduralVec3[] = [];
  const closed = Math.abs(arc - TAU) < 1e-4;
  const count = closed ? majorSegs : majorSegs + 1;
  for (let i = 0; i < count; i += 1) {
    const a = (i / majorSegs) * arc;
    pathPts.push([Math.cos(a) * R, Math.sin(a) * R, 0]);
  }
  return sculptCurvedLimb(pathPts, r, {
    steps: majorSegs,
    radialSegments: tubeSegs,
    closed,
    roundedStart: !closed,
    roundedEnd: !closed,
    capFraction: 0.12
  });
}

/** Smooth chamfered circular disc in the XY plane facing +Z (ideal for mirrors, clock faces, pads, coins). */
export function discSpec(radius: number, radialSegs = 36, thickness = radius * 0.12): AuraCustomGeometrySpec {
  const cyl = cylinderSpec(radius, radius, thickness, radialSegs, thickness * 0.24);
  return composeGeometry([
    {
      geometry: cyl,
      rotation: [Math.PI * 0.5, 0, 0]
    }
  ]);
}

/** Convenience wrapper creating a linear-RGB vertex-colored `LobePartInput` for `composeLobe`. */
export function part(
  geo: AuraCustomGeometrySpec,
  colorHex: string,
  transform: {
    readonly position?: ProceduralVec3;
    readonly rotation?: ProceduralVec3;
    readonly scale?: number | ProceduralVec3;
    readonly alpha?: number;
    readonly subShapes?: number;
  } = {}
): LobePartInput {
  const preserveAuthoredVertexColors =
    geo.colors !== undefined &&
    colorHex.trim().toUpperCase() === "#FFFFFF" &&
    (transform.alpha === undefined || transform.alpha >= 1);
  return {
    geometry: geo,
    ...(transform.position ? { position: transform.position } : {}),
    ...(transform.rotation ? { rotation: transform.rotation } : {}),
    ...(transform.scale !== undefined ? { scale: transform.scale } : {}),
    ...(preserveAuthoredVertexColors
      ? {}
      : { color: srgbHexToLinearRgba(colorHex, transform.alpha ?? 1) }),
    ...(transform.subShapes !== undefined ? { subShapes: transform.subShapes } : {})
  };
}

// ---------------------------------------------------------------- 4-layer 3D eyes & blinking plush lash assembly

export interface EyeAssemblyOptions {
  /** Half inter-ocular distance (`±eyeX` in unit-height actor space). */
  readonly eyeX: number;
  /** Eye center Y in unit-height actor space. */
  readonly eyeY: number;
  /** Eye center Z on front of head in unit-height actor space. */
  readonly eyeZ: number;
  /** Outer sclera cabochon radius in unit-height space (e.g. 0.055..0.095). */
  readonly radius: number;
  readonly irisColor: string;
  readonly pupilColor?: string;
  readonly scleraColor?: string;
  readonly lashColor?: string;
  readonly lidColor: string;
  readonly lidCraft?: CraftFamily;
  /** Slight outward yaw of each eye along the curved cheek/head (`0..0.38 rad`, default 0.16). */
  readonly outwardYaw?: number;
  /** Slight upward/downward pitch of gaze (`radians`, default -0.04). */
  readonly pitch?: number;
  /** Parent SubPartId (`"head"` on characters with a head joint; `"body"` on `gogo`/`lumi`). */
  readonly parentPart?: SubPartId;
  /** Optional adorable arched eyebrows above the eyes (added to socketFeltParts). */
  readonly includeBrows?: boolean;
  readonly browColor?: string;
}

export interface EyeAssemblyResult {
  /** Plush socket/brow accents in ACTOR-ROOT space (pass to `head` or `body` felt lobe before hinge baking). */
  readonly socketFeltParts: readonly LobePartInput[];
  /** Left 4-layer liquid-gloss eye + plush upper lash crease (blinks cleanly around eye center!). */
  readonly eyelidL: BuiltSubPart;
  /** Right 4-layer liquid-gloss eye + plush upper lash crease (blinks cleanly around eye center!). */
  readonly eyelidR: BuiltSubPart;
}

/**
 * Builds Pixar / *Link's Awakening* / Pop Mart 4-layer curved cabochon eyes with double specular catchlights.
 * `eyelidL` and `eyelidR` hold the 4-layer eye + upper lash crease anchored right at `[±eyeX, eyeY, eyeZ]`
 * so `blinkPartsAt` (`scaleY: 1 -> 0.1`), `hide`, and `sleep` close into a serene plush lash line
 * while keeping wide-open luminous eyes unobstructed at rest!
 */
export function eyeAssemblyParts(opts: EyeAssemblyOptions): EyeAssemblyResult {
  const r = opts.radius;
  const scleraColor = opts.scleraColor ?? "#FFFDF9";
  const pupilColor = opts.pupilColor ?? "#1B1218";
  const lashColor = opts.lashColor ?? "#3A2628";
  const lidCraft = opts.lidCraft ?? "felt";
  const parentPart = opts.parentPart ?? "head";
  const yawMag = opts.outwardYaw ?? 0.16;
  const pitch = opts.pitch ?? -0.03;

  const scleraGeo = ellipsoidSpec(r, r * 1.05, r * 0.38, 28, 18);
  const irisGeo = ellipsoidSpec(r * 0.72, r * 0.76, r * 0.28, 26, 16);
  const pupilGeo = ellipsoidSpec(r * 0.46, r * 0.5, r * 0.22, 22, 14);
  const catchMainGeo = ellipsoidSpec(r * 0.24, r * 0.24, r * 0.14, 16, 12);
  const catchSubGeo = ellipsoidSpec(r * 0.12, r * 0.12, r * 0.1, 14, 10);

  const buildOneSide = (sign: -1 | 1): BuiltSubPart => {
    const cx = sign * opts.eyeX;
    const cy = opts.eyeY;
    const cz = opts.eyeZ;
    const anchor: Vec3 = [cx, cy, cz];
    const yaw = sign * yawMag;

    // Upper plush lash arc hugging the top rim of the sclera cabochon (local to eye center [0,0,0]).
    const lashPts: ProceduralVec3[] = [
      [-r * 0.92 * sign, r * 0.22, r * 0.16],
      [-r * 0.38 * sign, r * 0.88, r * 0.28],
      [r * 0.38 * sign, r * 0.9, r * 0.28],
      [r * 0.95 * sign, r * 0.18, r * 0.14]
    ];
    const lashArc = sculptCurvedLimb(lashPts, (t) => r * (0.11 + 0.06 * Math.sin(t * Math.PI)), {
      steps: 16,
      radialSegments: 14
    });
    const lidFoldPts: ProceduralVec3[] = [
      [-r * 0.88 * sign, r * 0.36, r * 0.1],
      [0, r * 0.98, r * 0.22],
      [r * 0.88 * sign, r * 0.32, r * 0.1]
    ];
    const lidFold = sculptCurvedLimb(lidFoldPts, r * 0.13, {
      steps: 14,
      radialSegments: 14
    });

    const glossLobe = composeLobe({
      suffix: "eyeGloss",
      craft: "lacquer",
      parts: [
        part(scleraGeo, scleraColor, { rotation: [pitch, yaw, 0] }),
        part(irisGeo, opts.irisColor, {
          position: [Math.sin(yaw) * r * 0.16, -r * 0.03, Math.cos(yaw) * r * 0.16],
          rotation: [pitch, yaw, 0]
        }),
        part(pupilGeo, pupilColor, {
          position: [Math.sin(yaw) * r * 0.25, -r * 0.02, Math.cos(yaw) * r * 0.25],
          rotation: [pitch, yaw, 0]
        }),
        part(catchMainGeo, "#FFFFFF", {
          position: [
            -r * 0.22 + Math.sin(yaw) * r * 0.33,
            r * 0.24,
            Math.cos(yaw) * r * 0.34
          ]
        }),
        part(catchSubGeo, "#FFFFFF", {
          position: [
            r * 0.2 + Math.sin(yaw) * r * 0.32,
            -r * 0.22,
            Math.cos(yaw) * r * 0.33
          ]
        })
      ]
    });

    const lashLobe = composeLobe({
      suffix: "eyeLash",
      craft: lidCraft,
      parts: [
        part(lashArc, lashColor, { rotation: [pitch, yaw, 0] }),
        part(lidFold, opts.lidColor, { rotation: [pitch, yaw, 0] })
      ]
    });

    return makeSubPartRig(
      sign < 0 ? "eyelidL" : "eyelidR",
      anchor,
      [lashLobe, glossLobe],
      parentPart
    );
  };

  const socketFeltParts: LobePartInput[] = [];
  if (opts.includeBrows !== false) {
    const browCol = opts.browColor ?? lashColor;
    for (const sign of [-1, 1] as const) {
      const cx = sign * opts.eyeX;
      const cy = opts.eyeY;
      const cz = opts.eyeZ;
      const browCurve = sculptCurvedLimb(
        [
          [cx - sign * r * 0.55, cy + r * 1.32, cz + r * 0.04],
          [cx, cy + r * 1.52, cz + r * 0.12],
          [cx + sign * r * 0.62, cy + r * 1.24, cz - r * 0.02]
        ],
        (t) => r * (0.09 + 0.05 * Math.sin(t * Math.PI)),
        { steps: 12, radialSegments: 12 }
      );
      socketFeltParts.push(part(browCurve, browCol));
    }
  }

  return {
    socketFeltParts,
    eyelidL: buildOneSide(-1),
    eyelidR: buildOneSide(1)
  };
}

// ---------------------------------------------------------------- hinge baking, lobe merging & rig finalization

function computePositionsBounds(positions: Float32Array): {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
} {
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i + 2 < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    const z = positions[i + 2] ?? 0;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  if (!Number.isFinite(minX)) {
    return { min: [-0.01, -0.01, -0.01], max: [0.01, 0.01, 0.01] };
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Shifts a geometry buffer so `hingeAnchor` in actor space becomes `[0, 0, 0]` in part-local space. */
export function bakeHingeOrigin(spec: AuraCustomGeometrySpec, hingeAnchor: Vec3): AuraCustomGeometrySpec {
  const [hx, hy, hz] = hingeAnchor;
  if (Math.abs(hx) < 1e-9 && Math.abs(hy) < 1e-9 && Math.abs(hz) < 1e-9) {
    return spec;
  }
  const src = toFloat32(spec.positions);
  const shifted = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    shifted[i] = (src[i] ?? 0) - hx;
    shifted[i + 1] = (src[i + 1] ?? 0) - hy;
    shifted[i + 2] = (src[i + 2] ?? 0) - hz;
  }
  return {
    ...spec,
    positions: shifted,
    bounds: computePositionsBounds(shifted)
  };
}

export interface ComposeLobeOptions {
  readonly suffix: string;
  readonly craft: CraftFamily;
  readonly parts: readonly LobePartInput[];
  /** Optional actor-space joint hinge to subtract from merged vertex positions. */
  readonly hinge?: Vec3;
  readonly baseColor?: AuraColor;
  readonly craftTexture?: CraftTextureId;
  readonly tintTarget?: boolean;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
  readonly emissive?: AuraColor;
  readonly emissiveIntensity?: number;
}

/** Merges static sub-shapes of the same tactile `CraftFamily` into 1 draw call while rolling up sub-shape & triangle counts. */
export function composeLobe(opts: ComposeLobeOptions): BuiltLobe {
  if (opts.parts.length === 0) {
    throw new RangeError(`composeLobe(${opts.suffix}) requires at least one part`);
  }
  let subShapeCount = 0;
  for (const p of opts.parts) {
    subShapeCount += p.subShapes ?? 1;
  }
  const merged = composeGeometry(opts.parts);
  const baked = opts.hinge ? bakeHingeOrigin(merged, opts.hinge) : merged;
  const vCount = toFloat32(baked.positions).length / 3;
  const idx = toIndexArray(baked.indices, vCount);
  const triangleCount = Math.floor(idx.length / 3);

  const lobe: ProceduralLobeSpec = {
    suffix: opts.suffix,
    craft: opts.craft,
    geometry: baked,
    baseColor: opts.baseColor ?? "#FFFFFF",
    ...(opts.craftTexture ? { craftTexture: opts.craftTexture } : {}),
    ...(opts.tintTarget !== undefined ? { tintTarget: opts.tintTarget } : {}),
    ...(opts.castShadow !== undefined ? { castShadow: opts.castShadow } : {}),
    ...(opts.receiveShadow !== undefined ? { receiveShadow: opts.receiveShadow } : {}),
    ...(opts.emissive !== undefined ? { emissive: opts.emissive } : {}),
    ...(opts.emissiveIntensity !== undefined ? { emissiveIntensity: opts.emissiveIntensity } : {})
  };
  return { lobe, subShapeCount, triangleCount };
}

export function makeSubPartRig(
  partId: SubPartId,
  anchor: Vec3,
  builtLobes: readonly BuiltLobe[],
  parent?: SubPartId
): BuiltSubPart {
  let subShapeCount = 0;
  let triangleCount = 0;
  const lobes: ProceduralLobeSpec[] = [];
  for (const b of builtLobes) {
    lobes.push(b.lobe);
    subShapeCount += b.subShapeCount;
    triangleCount += b.triangleCount;
  }
  return {
    subPart: {
      part: partId,
      anchor,
      ...(parent ? { parent } : {}),
      lobes
    },
    subShapeCount,
    triangleCount
  };
}

function scaleAndShiftGeometry(
  spec: AuraCustomGeometrySpec,
  anchor: Vec3,
  shiftY: number,
  scaleFactor: number
): { readonly geometry: AuraCustomGeometrySpec; readonly anchor: Vec3 } {
  const newAnchor: Vec3 = [
    anchor[0] * scaleFactor,
    (anchor[1] + shiftY) * scaleFactor,
    anchor[2] * scaleFactor
  ];
  const src = toFloat32(spec.positions);
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 3) {
    dst[i] = (src[i] ?? 0) * scaleFactor;
    dst[i + 1] = (src[i + 1] ?? 0) * scaleFactor;
    dst[i + 2] = (src[i + 2] ?? 0) * scaleFactor;
  }
  return {
    geometry: { ...spec, positions: dst, bounds: computePositionsBounds(dst) },
    anchor: newAnchor
  };
}

export interface FinalizeProceduralRigOptions {
  /**
   * - `"ground-and-fit"` (default): grounds `minY` to exact `0` and uniformly scales so `maxY === 1.0`.
   * - `"exact"`: keeps authored unit-height coordinates verbatim (for calibrated `restAt` surfaces & `mirror` glass),
   *   only clamping negative `minY < -1e-4` up to `0`.
   */
  readonly fitMode?: "ground-and-fit" | "exact";
}

/**
 * Finalizes a `ProceduralAssetRig`: enforces exact `[0, 1]` unit-height bounds, computes static merged
 * world-dressing lobes (1 draw call per unique craft+texture bucket), and records CI quality metrics.
 */
export function finalizeProceduralRig(
  key: StageAssetKey,
  builtParts: readonly BuiltSubPart[],
  opts: FinalizeProceduralRigOptions = {}
): ProceduralAssetRig {
  if (builtParts.length === 0) {
    throw new RangeError(`finalizeProceduralRig(${key}) requires at least one SubPart`);
  }
  const fitMode = opts.fitMode ?? "ground-and-fit";

  let minY = Infinity;
  let maxY = -Infinity;
  for (const bp of builtParts) {
    const ay = bp.subPart.anchor[1];
    for (const lobe of bp.subPart.lobes) {
      const pos = toFloat32(lobe.geometry.positions);
      for (let i = 1; i < pos.length; i += 3) {
        const y = ay + (pos[i] ?? 0);
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  let shiftY = 0;
  let scaleFactor = 1;
  if (Number.isFinite(minY) && Number.isFinite(maxY)) {
    if (fitMode === "ground-and-fit") {
      shiftY = -minY;
      const span = maxY - minY;
      if (span > 1e-5) {
        scaleFactor = 1 / span;
      }
    } else if (minY < -1e-4) {
      shiftY = -minY;
    }
  }

  const normalizedParts: ProceduralSubPartRig[] = [];
  let subShapeCount = 0;
  let triangleCount = 0;
  const needAdjust = Math.abs(shiftY) > 1e-6 || Math.abs(scaleFactor - 1) > 1e-6;

  for (const bp of builtParts) {
    subShapeCount += bp.subShapeCount;
    triangleCount += bp.triangleCount;
    if (!needAdjust) {
      normalizedParts.push(bp.subPart);
      continue;
    }
    const nextAnchor: Vec3 = [
      bp.subPart.anchor[0] * scaleFactor,
      (bp.subPart.anchor[1] + shiftY) * scaleFactor,
      bp.subPart.anchor[2] * scaleFactor
    ];
    const nextLobes: ProceduralLobeSpec[] = bp.subPart.lobes.map((lobe) => ({
      ...lobe,
      geometry: scaleAndShiftGeometry(lobe.geometry, bp.subPart.anchor, shiftY, scaleFactor).geometry
    }));
    normalizedParts.push({
      ...bp.subPart,
      anchor: nextAnchor,
      lobes: nextLobes
    });
  }

  // Merge static world-dressing lobes across all parts by (craft, craftTexture, baseColor, tintTarget, emissive) bucket.
  const buckets = new Map<
    string,
    {
      readonly template: ProceduralLobeSpec;
      readonly composeInputs: ComposePart[];
    }
  >();
  for (const sp of normalizedParts) {
    for (const lobe of sp.lobes) {
      const bucketKey = [
        lobe.craft,
        lobe.craftTexture ?? "",
        String(lobe.baseColor),
        lobe.tintTarget ? "1" : "0",
        String(lobe.emissive ?? ""),
        String(lobe.emissiveIntensity ?? "")
      ].join("|");
      let entry = buckets.get(bucketKey);
      if (!entry) {
        entry = { template: lobe, composeInputs: [] };
        buckets.set(bucketKey, entry);
      }
      entry.composeInputs.push({
        geometry: lobe.geometry,
        position: [sp.anchor[0], sp.anchor[1], sp.anchor[2]]
      });
    }
  }

  const staticDressingLobes: ProceduralLobeSpec[] = [];
  let bucketIdx = 0;
  for (const entry of buckets.values()) {
    const mergedGeo = composeGeometry(entry.composeInputs);
    staticDressingLobes.push({
      ...entry.template,
      suffix: `dressing${bucketIdx}`,
      geometry: mergedGeo
    });
    bucketIdx += 1;
  }

  return {
    key,
    subShapeCount,
    triangleCount,
    parts: normalizedParts,
    staticDressingLobes
  };
}

function scaleCustomGeometryUniform(spec: AuraCustomGeometrySpec, heightM: number): AuraCustomGeometrySpec {
  if (Math.abs(heightM - 1) < 1e-6) return spec;
  const src = toFloat32(spec.positions);
  const dst = new Float32Array(src.length);
  for (let i = 0; i < src.length; i += 1) {
    dst[i] = (src[i] ?? 0) * heightM;
  }
  return {
    ...spec,
    positions: dst,
    bounds: computePositionsBounds(dst)
  };
}

const scaledGeoCache = new WeakMap<AuraCustomGeometrySpec, Map<number, AuraCustomGeometrySpec>>();

function getScaledGeometry(spec: AuraCustomGeometrySpec, heightM: number): AuraCustomGeometrySpec {
  const quantH = Math.round(heightM * 10000) / 10000;
  let byH = scaledGeoCache.get(spec);
  if (!byH) {
    byH = new Map<number, AuraCustomGeometrySpec>();
    scaledGeoCache.set(spec, byH);
  }
  const existing = byH.get(quantH);
  if (existing) return existing;
  const scaled = scaleCustomGeometryUniform(spec, quantH);
  byH.set(quantH, scaled);
  return scaled;
}

function multiplySrgbHex(color: AuraColor, tintHex: string): string {
  const parse = (raw: string): readonly [number, number, number] => {
    const clean = raw.trim().replace(/^#/, "");
    if (clean.length === 3) {
      const r0 = Number.parseInt(clean.slice(0, 1), 16) || 0;
      const g0 = Number.parseInt(clean.slice(1, 2), 16) || 0;
      const b0 = Number.parseInt(clean.slice(2, 3), 16) || 0;
      return [r0 * 17, g0 * 17, b0 * 17];
    }
    if (clean.length >= 6) {
      const v = Number.parseInt(clean.slice(0, 6), 16);
      if (Number.isFinite(v)) return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
    }
    return [255, 255, 255];
  };
  const a = typeof color === "string" ? parse(color) : [255, 255, 255];
  const b = parse(tintHex);
  const ch = (i: 0 | 1 | 2): string =>
    Math.round(((a[i] ?? 255) * (b[i] ?? 255)) / 255)
      .toString(16)
      .padStart(2, "0");
  return `#${ch(0)}${ch(1)}${ch(2)}`.toUpperCase();
}

/**
 * Instantiates an interactive stage actor/prop (`id`, `${id}__${part}`, `${id}__${part}~${lobe}`)
 * or static merged world dressing (`interactive: false`) from a `ProceduralAssetRig`.
 */
export function buildProceduralActor(
  rig: ProceduralAssetRig,
  opts: BuildProceduralActorOptions
): BuiltProceduralActor {
  const h = Math.max(0.02, opts.heightM);
  if (!opts.interactive) {
    const nodes: AuraNodeBuilder<AuraSceneNode>[] = rig.staticDressingLobes.map((lobe, idx) => {
      const rawColor = lobe.tintTarget && opts.tint ? opts.tint : lobe.baseColor;
      const effectiveColor = opts.tintAll ? multiplySrgbHex(rawColor, opts.tintAll) : rawColor;
      const mat = craftMaterial(lobe.craft, effectiveColor, {
        ...(lobe.craftTexture ? { craftTexture: lobe.craftTexture } : {}),
        ...(lobe.emissive ? { emissive: lobe.emissive } : {}),
        ...(lobe.emissiveIntensity !== undefined ? { emissiveIntensity: lobe.emissiveIntensity } : {})
      });
      const defaultCast = lobe.castShadow ?? (lobe.craft !== "glassCoat" && lobe.craft !== "soapBubble");
      const defaultReceive = lobe.receiveShadow ?? (lobe.craft !== "soapBubble");
      const castShadow = opts.castShadowOverride !== undefined ? opts.castShadowOverride && defaultCast : defaultCast;
      const receiveShadow = opts.receiveShadowOverride ?? defaultReceive;
      return geometry.custom(getScaledGeometry(lobe.geometry, h), {
        name: `${opts.id}-${lobe.suffix}-${idx}`,
        material: mat,
        castShadow,
        receiveShadow
      });
    });
    return {
      nodes,
      pieces: [],
      subParts: new Set<SubPartId>(),
      tintableIds: []
    };
  }

  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const pieces: MountedRigPiece[] = [];
  const subParts = new Set<SubPartId>();
  const explicitTintIds: string[] = [];
  const fallbackBodyIds: string[] = [];
  let rootAssigned = false;

  // Put `"body"` first if present so the primary actor root ID `${opts.id}` binds cleanly.
  const orderedParts = [...rig.parts].sort((a, b) => {
    if (a.part === "body" && b.part !== "body") return -1;
    if (b.part === "body" && a.part !== "body") return 1;
    return 0;
  });

  for (const sp of orderedParts) {
    subParts.add(sp.part);
    const anchorM: Vec3 = [sp.anchor[0] * h, sp.anchor[1] * h, sp.anchor[2] * h];
    for (let lIdx = 0; lIdx < sp.lobes.length; lIdx += 1) {
      const lobe = sp.lobes[lIdx]!;
      let runtimeId: string;
      let isRootHandle = false;
      if (!rootAssigned && lIdx === 0 && (sp.part === "body" || orderedParts[0] === sp)) {
        runtimeId = opts.id;
        rootAssigned = true;
        isRootHandle = true;
      } else if (lIdx === 0) {
        runtimeId = `${opts.id}__${sp.part}`;
      } else {
        runtimeId = `${opts.id}__${sp.part}~${lIdx}`;
      }

      const rawColor = lobe.tintTarget && opts.tint ? opts.tint : lobe.baseColor;
      const effectiveColor = opts.tintAll ? multiplySrgbHex(rawColor, opts.tintAll) : rawColor;
      const mat = craftMaterial(lobe.craft, effectiveColor, {
        ...(lobe.craftTexture ? { craftTexture: lobe.craftTexture } : {}),
        ...(lobe.emissive ? { emissive: lobe.emissive } : {}),
        ...(lobe.emissiveIntensity !== undefined ? { emissiveIntensity: lobe.emissiveIntensity } : {})
      });
      const defaultCast = lobe.castShadow ?? (lobe.craft !== "glassCoat" && lobe.craft !== "soapBubble");
      const defaultReceive = lobe.receiveShadow ?? (lobe.craft !== "soapBubble");
      const castShadow = opts.castShadowOverride !== undefined ? opts.castShadowOverride && defaultCast : defaultCast;
      const receiveShadow = opts.receiveShadowOverride ?? defaultReceive;

      const tags: readonly string[] = isRootHandle
        ? [...(opts.rootTags ?? ["wonder-node", opts.id]), "procedural", `subpart:${sp.part}`]
        : [...(opts.partTags ?? ["wonder-node-part", opts.id]), "procedural-part", `subpart:${sp.part}`];

      const builder = geometry
        .custom(getScaledGeometry(lobe.geometry, h), {
          name: `${opts.id}-${sp.part}-${lobe.suffix}`,
          material: mat,
          castShadow,
          receiveShadow
        })
        .position([anchorM[0], anchorM[1], anchorM[2]])
        .runtime({
          id: runtimeId,
          tags,
          mutable: true
        });
      nodes.push(builder);

      const baseColorStr = String(effectiveColor);
      pieces.push({
        runtimeId,
        part: sp.part,
        ...(sp.parent ? { parent: sp.parent } : {}),
        anchorM,
        tintTarget: lobe.tintTarget === true,
        baseColor: baseColorStr,
        craft: lobe.craft,
        ...(lobe.craftTexture ? { craftTexture: lobe.craftTexture } : {}),
        ...(lobe.emissive !== undefined ? { emissive: lobe.emissive } : {}),
        ...(lobe.emissiveIntensity !== undefined ? { emissiveIntensity: lobe.emissiveIntensity } : {})
      });

      if (lobe.tintTarget) {
        explicitTintIds.push(runtimeId);
      } else if (sp.part === "body" && lobe.craft !== "lacquer" && lobe.craft !== "glassCoat") {
        fallbackBodyIds.push(runtimeId);
      }
    }
  }

  return {
    nodes,
    pieces,
    subParts,
    tintableIds: explicitTintIds.length > 0 ? explicitTintIds : fallbackBodyIds
  };
}
