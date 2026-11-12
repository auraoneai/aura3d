/**
 * Polarity Orbs (`apps/showcase-polarity-orbs`, `WP-17`) — High-Energy Tokamak &
 * Dual-Polarity Magnetic Confinement Lab Procedural Multi-Material Art Library.
 *
 * Built exclusively on `apps/showcase-port-shared/proceduralKernel.ts` + `@aura3d/engine`
 * with zero `three` imports and zero static Meshy `.glb` scene mounts:
 * - Wound copper & superconducting toroidal D-field coils (`tubeSweepMesh` + `catmullRomSpline3`
 *   + `latheMesh` corrugated high-voltage alumina ceramic insulator stacks).
 * - Crimson (`+` warm left) & cyan (`−` cool right) dipole resonator towers and horseshoe /
 *   toroidal electromagnet monuments grounded cleanly at `y = 0`.
 * - Open structural `latticeTrussMesh` high-current busbar gantries & `tubeSweepMesh` frosted
 *   liquid-helium cryo-manifold conduits with lathe-turned vacuum bellows flanges.
 * - Glass-walled borosilicate/quartz vacuum containment pods (`material.physical` with
 *   `roughness: 0.04, opacity: 0.44, clearcoat: 1, ior: 1.52`, `castShadow: false`) housing
 *   multi-spire hexagonal quartz-prism dipole clusters (`practical: true` emissive cores).
 * - Stratified magnetosphere Tokamak sky islands (`stratifiedCliffMesh` + `material.strata`),
 *   precision CNC-machined aluminum arena bezel segments, equatorial-fluted dipole collector
 *   orbs, and crown-cut brilliant power-up prism gems.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { MeshData } from "../../../../examples/shared/runner-kit/batch";

export type BackdropAssetKind =
  | "poChargeCoil"
  | "poMagnet"
  | "poCrystalRed"
  | "poCrystalBlue"
  | "poCrystalIslandB"
  | "poCrystalIsland";

const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// 1. Tokamak & High-Field Magnetosphere Physical Material Palette
// ---------------------------------------------------------------------------

/** Warm polished oxygen-free copper for Tesla secondary windings, helical primary busbars & field rings (`roughness: 0.28`). */
export const MAT_WOUND_COPPER: AuraMaterialSpec = material.brushedMetal({
  name: "po wound tesla copper",
  color: "#d67c44",
  roughness: 0.28,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  envMapIntensity: 1.92,
  emissive: "#d67c44",
  emissiveIntensity: 0.085
});

/** Precision CNC-machined anisotropic brushed aluminum for bezels, vacuum flanges & trusses. */
export const MAT_MACHINED_ALUMINUM: AuraMaterialSpec = material.brushedMetal({
  name: "po machined lab aluminum",
  color: "#d4dfee",
  roughness: 0.24,
  anisotropy: 0.88,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.84,
  emissive: "#c8d6ea",
  emissiveIntensity: 0.045
});

/** Light brushed silicon-steel pedestal & yoke alloy (`#6a7688` with crisp specular chamfers, never near-black). */
export const MAT_LAMINATED_STEEL: AuraMaterialSpec = material.brushedMetal({
  name: "po brushed steel pedestal",
  color: "#6a7688",
  roughness: 0.3,
  anisotropy: 0.84,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.8,
  emissive: "#6a7688",
  emissiveIntensity: 0.055
});

/** Mirror-ground ferromagnetic pole shoes & high-voltage spun corona toroid terminals. */
export const MAT_POLE_CHROME: AuraMaterialSpec = material.studioMetal({
  name: "po ground pole shoe chrome",
  color: "#eaf2fc",
  roughness: 0.14,
  envMapIntensity: 1.95,
  emissive: "#cfe2f8",
  emissiveIntensity: 0.045
});

/** Glazed white high-voltage ribbed porcelain ceramic (`#eaf6ff`) for warm-pole insulator stacks. */
export const MAT_HV_CERAMIC: AuraMaterialSpec = material.ceramic({
  name: "po hv glazed white ceramic",
  color: "#eaf6ff",
  roughness: 0.18,
  clearcoat: 0.88,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.48,
  emissive: "#eaf6ff",
  emissiveIntensity: 0.055
});

/** Glazed electric-cyan high-voltage ribbed ceramic (`#b8ecff`) for cool-pole insulator stacks. */
export const MAT_HV_CERAMIC_CYAN: AuraMaterialSpec = material.ceramic({
  name: "po hv glazed cyan ceramic",
  color: "#b8ecff",
  roughness: 0.18,
  clearcoat: 0.88,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.48,
  emissive: "#b8ecff",
  emissiveIntensity: 0.06
});

/** Warm crimson (`+`) high-gloss stator & quartz facet clearcoat housing. */
export const MAT_CRIMSON_CLEARCOAT: AuraMaterialSpec = material.clearcoatPaint({
  name: "po crimson north stator clearcoat",
  color: "#d93658",
  metallic: 0.24,
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.72,
  emissive: "#d93658",
  emissiveIntensity: 0.05
});

/** Cool electric-cyan (`−`) high-gloss cryostat & superconducting shell clearcoat. */
export const MAT_CYAN_CLEARCOAT: AuraMaterialSpec = material.clearcoatPaint({
  name: "po cyan south cryostat clearcoat",
  color: "#1e84d4",
  metallic: 0.26,
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.72,
  emissive: "#1e84d4",
  emissiveIntensity: 0.05
});

/** Frosted stainless cryogenic manifold jacket & slate isolator pad (`material.pbr`, never near-black). */
export const MAT_CRYO_CONDUIT_PBR: AuraMaterialSpec = material.pbr({
  name: "po frosted cryo conduit",
  color: "#a8c0d8",
  roughness: 0.32,
  metalness: 0.72,
  envMapIntensity: 1.45,
  emissive: "#9cb6d0",
  emissiveIntensity: 0.04
});

export const MAT_SEISMIC_RUBBER: AuraMaterialSpec = material.pbr({
  name: "po slate isolator pad",
  color: "#525e74",
  roughness: 0.62,
  metalness: 0.24,
  envMapIntensity: 0.95
});

/** WebGPU-native magnetosphere basalt & iron-ore mesa rock (`material.pbr`) for sky islands. */
export const MAT_WARM_STRATA: AuraMaterialSpec = material.pbr({
  name: "po warm magnetosphere basalt",
  color: "#5c2a42",
  roughness: 0.8,
  metalness: 0.16,
  envMapIntensity: 1.05
});

export const MAT_COOL_STRATA: AuraMaterialSpec = material.pbr({
  name: "po cool magnetosphere basalt",
  color: "#23466c",
  roughness: 0.8,
  metalness: 0.16,
  envMapIntensity: 1.05
});

/** Practical dipole plasma & glowing Tesla toroid crown emissives (`practical: true` for auditArtDirection). */
export const MAT_CRIMSON_DIPOLE_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po crimson dipole core",
  color: "#ff6b80",
  emissive: "#ff4862",
  emissiveIntensity: 3.1,
  roughness: 0.16,
  practical: true
});

export const MAT_CYAN_DIPOLE_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po cyan dipole core",
  color: "#84e6ff",
  emissive: "#34c8ff",
  emissiveIntensity: 3.1,
  roughness: 0.16,
  practical: true
});

/**
 * WebGPU-safe borosilicate/quartz vacuum containment chamber glass (`castShadow: false` on every node).
 * Uses `material.physical` (`roughness: 0.04, opacity: 0.44, clearcoat: 1, ior: 1.52`) — never `studioGlass` with `opacity < 1`.
 */
export const MAT_VACUUM_GLASS_COOL: AuraMaterialSpec = material.physical({
  name: "po vacuum containment quartz cool",
  color: "#a6ecff",
  roughness: 0.04,
  opacity: 0.44,
  clearcoat: 1,
  ior: 1.52,
  envMapIntensity: 1.85
});

export const MAT_VACUUM_GLASS_WARM: AuraMaterialSpec = material.physical({
  name: "po vacuum containment quartz warm",
  color: "#ffc2d1",
  roughness: 0.04,
  opacity: 0.44,
  clearcoat: 1,
  ior: 1.52,
  envMapIntensity: 1.85
});

/** Dedicated `clearcoat: 0, sheen: 0` materials for `> 16` corridor `instances.custom` batches. */
export const MAT_INST_BEZEL_ALLOY: AuraMaterialSpec = material.metal({
  name: "po instanced steel bezel pedestal",
  color: "#6a7688",
  roughness: 0.28,
  metallic: 0.88,
  envMapIntensity: 1.75,
  emissive: "#6a7688",
  emissiveIntensity: 0.055,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_COPPER_BUS: AuraMaterialSpec = material.metal({
  name: "po instanced copper winding busbar",
  color: "#d67c44",
  roughness: 0.28,
  metallic: 0.9,
  envMapIntensity: 1.88,
  emissive: "#d67c44",
  emissiveIntensity: 0.085,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_CRYO_MANIFOLD: AuraMaterialSpec = material.pbr({
  name: "po instanced ceramic insulator post",
  color: "#eaf6ff",
  roughness: 0.2,
  metalness: 0.06,
  envMapIntensity: 1.45,
  emissive: "#b8ecff",
  emissiveIntensity: 0.065,
  clearcoat: 0,
  sheen: 0
});

// ---------------------------------------------------------------------------
// 2. Metric Grounding & Reusable Tokamak / HV Sub-Assembly Sculptors
// ---------------------------------------------------------------------------

function concatRaw(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const base = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + base);
  }
  return { positions, normals, uvs, indices };
}

function rawToMeshData(m: RawMesh): MeshData {
  return {
    positions: m.positions.slice(),
    normals: m.normals.slice(),
    uvs: m.uvs.slice(),
    indices: m.indices.slice()
  };
}

function measureRawBounds(meshes: readonly RawMesh[]): { readonly min: V3; readonly max: V3 } {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const m of meshes) {
    for (let i = 0; i < m.positions.length; i += 3) {
      const x = m.positions[i]!, y = m.positions[i + 1]!, z = m.positions[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  if (!Number.isFinite(minX)) return { min: [0, 0, 0], max: [1, 1, 1] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

interface FittedMultiMatAssembly {
  readonly fittedSlots: readonly MultiMatSlot[];
  readonly groupedSpec: AuraCustomGeometrySpec;
  readonly materials: readonly AuraMaterialSpec[];
  readonly fittedGlass?: readonly RawMesh[];
  readonly glassSpec?: AuraCustomGeometrySpec;
  readonly glassMaterial?: AuraMaterialSpec;
}

/**
 * Grounds an entire multi-material assembly + optional borosilicate vacuum glass shell
 * jointly to `minY = 0`, centered in `X/Z`, scaled to `targetMaxDim`.
 */
function fitGroundedAssembly(
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  targetMaxDim: number,
  glassMeshes?: readonly RawMesh[],
  glassMaterial?: AuraMaterialSpec
): FittedMultiMatAssembly {
  const allMeshes = [
    ...slots.map((s) => s.mesh),
    ...(glassMeshes ?? [])
  ];
  const b = measureRawBounds(allMeshes);
  const span = Math.max(1e-4, b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const scale = targetMaxDim / span;
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  const minY = b.min[1];

  const fitOne = (m: RawMesh): RawMesh =>
    transformMesh(transformMesh(m, { pos: [-cx, -minY, -cz] }), { scale });

  const fittedSlots: MultiMatSlot[] = slots.map((s) => ({
    materialIndex: s.materialIndex,
    mesh: fitOne(s.mesh)
  }));
  const groupedSpec = buildGroupedGeometrySpec(fittedSlots);

  if (glassMeshes && glassMeshes.length > 0 && glassMaterial) {
    const fittedGlass = glassMeshes.map(fitOne);
    return {
      fittedSlots,
      groupedSpec,
      materials,
      fittedGlass,
      glassSpec: mergeRawMeshes(fittedGlass),
      glassMaterial
    };
  }
  return { fittedSlots, groupedSpec, materials };
}

/** CNC-machined chamfered octagonal plinth (`y in [0, height]`) via `extrudePolygonMesh`. */
export function machinedOctagonPlinthMesh(radius: number, height: number, bevel = 0.04): RawMesh {
  const ring: V2[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU + Math.PI / 8;
    ring.push([Math.cos(a) * radius, Math.sin(a) * radius]);
  }
  const slab = extrudePolygonMesh(ring, height, bevel, false);
  return transformMesh(slab, { rot: [-Math.PI * 0.5, 0, 0], pos: [0, height * 0.5, 0] });
}

/** Corrugated high-voltage ceramic shed insulator column (`y in [0, height]`) via `latheMesh`. */
export function ceramicInsulatorStackMesh(
  coreR: number,
  shedR: number,
  height: number,
  sheds = 8,
  radialSegs = 18
): RawMesh {
  const profile: V2[] = [[0, 0], [shedR * 0.94, 0], [shedR * 0.94, height * 0.035], [coreR, height * 0.05]];
  const usableH = height * 0.9;
  const baseH = height * 0.05;
  for (let s = 0; s < sheds; s += 1) {
    const y0 = baseH + (s / sheds) * usableH;
    const yMid = baseH + ((s + 0.48) / sheds) * usableH;
    const yTop = baseH + ((s + 0.72) / sheds) * usableH;
    const yNext = baseH + ((s + 1) / sheds) * usableH;
    profile.push(
      [coreR, y0],
      [shedR, yMid],
      [shedR * 0.96, yTop],
      [coreR * 1.02, yNext]
    );
  }
  profile.push([shedR * 0.9, height * 0.965], [shedR * 0.9, height], [0, height]);
  return latheMesh(profile, radialSegs, false);
}

/** Wound toroidal copper field ring in the XZ plane (`majorR`, `minorR`) with 4 clamp saddles. */
export function toroidalFieldRingMesh(
  majorR: number,
  minorR: number,
  majorSegs = 24,
  radialSegs = 10
): { readonly copper: RawMesh; readonly clamps: RawMesh } {
  const controlPts: V3[] = [];
  const ctrlCount = 8;
  for (let i = 0; i < ctrlCount; i += 1) {
    const a = (i / ctrlCount) * TAU;
    controlPts.push([Math.cos(a) * majorR, 0, Math.sin(a) * majorR]);
  }
  const curve = catmullRomSpline3(controlPts, Math.max(2, Math.round(majorSegs / ctrlCount)), true);
  const spine: V4[] = [...curve, curve[0]!].map((p) => [p[0], p[1], p[2], minorR]);
  const copper = tubeSweepMesh(spine, radialSegs, false);

  const clampParts: RawMesh[] = [];
  for (let k = 0; k < 4; k += 1) {
    const ang = (k / 4) * TAU + Math.PI * 0.25;
    clampParts.push(
      transformMesh(bevelBoxMesh(minorR * 2.55, minorR * 2.55, minorR * 1.35, minorR * 0.28), {
        pos: [Math.cos(ang) * majorR, 0, Math.sin(ang) * majorR],
        rot: [0, -ang, 0]
      })
    );
  }
  return { copper, clamps: concatRaw(clampParts) };
}

/** Constant-tension Tokamak D-shaped toroidal field coil (`XY` plane, `y in [0, height]`). */
export function tokamakDCoilYokeMesh(halfWidth: number, height: number, tubeR: number): RawMesh {
  const r0 = tubeR;
  const xIn = -halfWidth * 0.72;
  const xPeak = -halfWidth * 0.12;
  const xOut = halfWidth * 0.96;
  const yBot = r0 * 1.08;
  const yTop = height - r0 * 1.08;
  const yMid = height * 0.5;

  const upperArc = bezierCurve2([xIn, yTop], [xPeak + halfWidth * 0.48, yTop], [xOut, yTop * 0.84], [xOut, yMid], 9);
  const lowerArc = bezierCurve2([xOut, yMid], [xOut, height - yTop * 0.84], [xPeak + halfWidth * 0.48, yBot], [xIn, yBot], 9);

  const loop2D: V2[] = [
    [xIn, yBot],
    [xIn, yMid],
    ...upperArc,
    ...lowerArc.slice(1)
  ];
  const spine: V4[] = loop2D.map(([x, y]) => [x, y, 0, tubeR]);
  return tubeSweepMesh(spine, 12, false);
}

/** Smooth swept cryogenic manifold pipe (`catmullRomSpline3` + `tubeSweepMesh`) with union bellows collars. */
export function cryoManifoldConduitMesh(waypoints: readonly V3[], pipeR: number): {
  readonly pipe: RawMesh;
  readonly flanges: RawMesh;
} {
  const smoothPts = catmullRomSpline3(waypoints, 6, false);
  const spine: V4[] = smoothPts.map((p) => [p[0], p[1], p[2], pipeR]);
  const pipe = tubeSweepMesh(spine, 8, false);

  const flangeProfile: V2[] = [
    [pipeR * 0.95, -pipeR * 0.75],
    [pipeR * 1.52, -pipeR * 0.55],
    [pipeR * 1.52, -pipeR * 0.18],
    [pipeR * 1.24, 0],
    [pipeR * 1.52, pipeR * 0.18],
    [pipeR * 1.52, pipeR * 0.55],
    [pipeR * 0.95, pipeR * 0.75]
  ];
  const collar = latheMesh(flangeProfile, 12, false);
  const flangeParts: RawMesh[] = [];
  const step = Math.max(3, Math.floor(smoothPts.length / 4));
  for (let idx = step; idx < smoothPts.length - 2; idx += step) {
    const pt = smoothPts[idx]!;
    flangeParts.push(transformMesh(collar, { pos: pt }));
  }
  return { pipe, flanges: concatRaw(flangeParts) };
}

/** Hexagonal 6-facet quartz prism spire with sharp pyramidal point (`y in [0, height]`) via `loftSectionsMesh`. */
export function hexQuartzSpireMesh(baseR: number, height: number, shoulderFrac = 0.74): RawMesh {
  const mkHex = (r: number, y: number, twist = 0): V3[] => {
    const ring: V3[] = [];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * TAU + twist;
      ring.push([Math.cos(a) * r, y, Math.sin(a) * r]);
    }
    return ring;
  };
  const sections: V3[][] = [
    mkHex(baseR * 0.88, 0),
    mkHex(baseR, height * 0.14),
    mkHex(baseR * 0.9, height * shoulderFrac, 0.04),
    mkHex(Math.max(0.012, baseR * 0.04), height, 0.06)
  ];
  return loftSectionsMesh(sections, true, true);
}

/** Multi-turn polished copper secondary winding drum (`y in [0, height]`) via `latheMesh` wire-rib profile. */
export function secondaryCopperWindingMesh(
  radius: number,
  height: number,
  turns = 14,
  radialSegs = 22
): RawMesh {
  const profile: V2[] = [
    [0, 0],
    [radius * 1.07, 0],
    [radius * 1.07, height * 0.035],
    [radius * 0.96, height * 0.048]
  ];
  const yStart = height * 0.05;
  const spanH = height * 0.9;
  for (let i = 0; i < turns; i += 1) {
    const y0 = yStart + (i / turns) * spanH;
    const yCrest = yStart + ((i + 0.5) / turns) * spanH;
    const y1 = yStart + ((i + 1) / turns) * spanH;
    profile.push(
      [radius * 0.965, y0],
      [radius * 1.035, yCrest],
      [radius * 0.965, y1]
    );
  }
  profile.push(
    [radius * 1.07, height * 0.965],
    [radius * 1.07, height],
    [0, height]
  );
  return latheMesh(profile, radialSegs, false);
}

/** Conical primary copper helical busbar cage (`tubeSweepMesh` ascending spiral + standoff risers). */
export function helicalPrimaryCoilMesh(
  baseR: number,
  topR: number,
  y0: number,
  height: number,
  turns = 3.25,
  tubeR = 0.058
): RawMesh {
  const steps = Math.max(24, Math.round(turns * 14));
  const spine: V4[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = t * turns * TAU;
    const r = baseR + (topR - baseR) * t;
    spine.push([Math.cos(ang) * r, y0 + t * height, Math.sin(ang) * r, tubeR]);
  }
  const helix = tubeSweepMesh(spine, 8, true);
  const posts: RawMesh[] = [helix];
  for (let k = 0; k < 4; k += 1) {
    const a = (k / 4) * TAU + Math.PI * 0.25;
    posts.push(
      tubeSweepMesh(
        [
          [Math.cos(a) * (baseR + tubeR * 0.6), y0 - 0.12, Math.sin(a) * (baseR + tubeR * 0.6), tubeR * 0.68],
          [Math.cos(a) * (topR + tubeR * 0.6), y0 + height + 0.05, Math.sin(a) * (topR + tubeR * 0.6), tubeR * 0.68]
        ],
        6,
        true
      )
    );
  }
  return concatRaw(posts);
}

/** Spun high-voltage toroid crown (`tubeSweepMesh` + `catmullRomSpline3` closed torus). */
export function spunCoronaToroidMesh(
  majorR: number,
  minorR: number,
  majorSegs = 24,
  radialSegs = 12
): RawMesh {
  const ctrl: V3[] = [];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    ctrl.push([Math.cos(a) * majorR, 0, Math.sin(a) * majorR]);
  }
  const ring = catmullRomSpline3(ctrl, Math.max(2, Math.round(majorSegs / 8)), true);
  const spine: V4[] = [...ring, ring[0]!].map((p) => [p[0], p[1], p[2], minorR]);
  return tubeSweepMesh(spine, radialSegs, false);
}

// ---------------------------------------------------------------------------
// 3. Multi-Material Tokamak & Magnetic Lab Landmark Assemblies
// ---------------------------------------------------------------------------

/**
 * `poChargeCoil` (`5.8 m`, warm `-X`): Crimson (`+`) Tesla Coil & Dipole Resonator Pylon —
 * stepped `#6a7688` brushed steel beveled pedestal, `#eaf6ff` glazed white ceramic ribbed insulators,
 * warm polished `#d67c44` copper secondary winding drum (`roughness: 0.28`), conical primary copper
 * helical/ring busbars, and a glowing spun toroid crown grounded at `y = 0`.
 */
function buildCrimsonDipoleResonatorAssembly(targetSize = 5.8): FittedMultiMatAssembly {
  const materials: readonly AuraMaterialSpec[] = [
    MAT_LAMINATED_STEEL,         // 0: #6a7688 light brushed steel beveled pedestal
    MAT_MACHINED_ALUMINUM,       // 1: #d4dfee CNC chamfered collars & lattice gantry
    MAT_HV_CERAMIC,              // 2: #eaf6ff glazed white ribbed ceramic insulators
    MAT_WOUND_COPPER,            // 3: #d67c44 polished copper secondary drum & primary helix
    MAT_POLE_CHROME,             // 4: spun chrome toroid crown & standoffs
    MAT_CRIMSON_DIPOLE_EMISSIVE  // 5: glowing crimson toroid corona & plasma core (practical: true)
  ];
  const slots: MultiMatSlot[] = [];

  // Light brushed steel `#6a7688` chamfered octagonal pedestal + specular beveled buttresses
  slots.push({ mesh: machinedOctagonPlinthMesh(1.34, 0.42, 0.06), materialIndex: 0 });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.08, 0.28, 0.045), { pos: [0, 0.4, 0] }),
    materialIndex: 1
  });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + Math.PI * 0.25;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.26, 0.48, 0.64, 0.04), {
        pos: [Math.cos(a) * 0.98, 0.26, Math.sin(a) * 0.98],
        rot: [0, -a, 0]
      }),
      materialIndex: 0
    });
    // 4 perimeter glazed white ceramic ribbed standoff insulators on the steel pedestal
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.11, 0.21, 0.82, 5, 14), {
        pos: [Math.cos(a) * 0.96, 0.5, Math.sin(a) * 0.96]
      }),
      materialIndex: 2
    });
  }

  // Lower central glazed white ceramic ribbed insulator collar (`y = 0.66..1.42`)
  slots.push({
    mesh: transformMesh(ceramicInsulatorStackMesh(0.42, 0.68, 0.8, 5, 20), { pos: [0, 0.66, 0] }),
    materialIndex: 2
  });

  // Prominent warm polished `#d67c44` copper secondary winding drum (`y = 1.42..3.92`)
  slots.push({
    mesh: transformMesh(secondaryCopperWindingMesh(0.52, 2.52, 16, 22), { pos: [0, 1.42, 0] }),
    materialIndex: 3
  });

  // Conical primary copper helical busbar cage + copper field rings around the base
  slots.push({
    mesh: helicalPrimaryCoilMesh(1.18, 0.86, 1.18, 1.16, 3.25, 0.064),
    materialIndex: 3
  });
  for (const [ry, majR, minR] of [
    [2.68, 0.88, 0.085],
    [3.42, 0.82, 0.08]
  ] as const) {
    const ring = toroidalFieldRingMesh(majR, minR, 24, 10);
    slots.push({ mesh: transformMesh(ring.copper, { pos: [0, ry, 0] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(ring.clamps, { pos: [0, ry, 0] }), materialIndex: 1 });
  }

  // Upper glazed ceramic neck insulator (`y = 3.92..4.62`) + glowing dipole core
  slots.push({
    mesh: transformMesh(ceramicInsulatorStackMesh(0.32, 0.54, 0.72, 4, 18), { pos: [0, 3.92, 0] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.32, 0.1], [0.36, 0.42], [0.32, 0.74], [0, 0.84]], 16),
      { pos: [0, 4.38, 0] }
    ),
    materialIndex: 5
  });

  // Spun high-voltage toroid crown (`latheMesh` / `tubeSweepMesh`) + glowing plasma corona torus
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.96, 0.24, 24, 12), { pos: [0, 5.12, 0] }),
    materialIndex: 4
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(1.16, 0.075, 24, 10), { pos: [0, 5.12, 0] }),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.56, 0.11, 20, 10), { pos: [0, 5.34, 0] }),
    materialIndex: 3
  });

  // Cylindrical quartz vacuum sleeve around upper discharge neck
  const glassChamber = transformMesh(
    latheMesh([[0.52, 0], [0.54, 0.06], [0.54, 0.82], [0.52, 0.88]], 18),
    { pos: [0, 4.22, 0] }
  );

  return fitGroundedAssembly(slots, materials, targetSize, [glassChamber], MAT_VACUUM_GLASS_WARM);
}

/**
 * `poMagnet` (`6.0 m`, cool `+X`): Cyan (`−`) Tesla Coil & Superconducting Tokamak D-Coil Pylon —
 * stepped `#6a7688` light brushed steel beveled pedestal, `#b8ecff` glazed cyan ceramic ribbed insulators,
 * warm polished `#d67c44` copper secondary winding drum (`roughness: 0.28`), primary copper helical/ring
 * busbars, twin cyan Tokamak D-coils, and a glowing spun toroid crown grounded at `y = 0`.
 */
function buildCyanTokamakMagnetAssembly(targetSize = 6.0): FittedMultiMatAssembly {
  const materials: readonly AuraMaterialSpec[] = [
    MAT_LAMINATED_STEEL,      // 0: #6a7688 light brushed steel beveled pedestal & yoke
    MAT_MACHINED_ALUMINUM,    // 1: #d4dfee CNC chamfered collars & lattice gantry
    MAT_HV_CERAMIC_CYAN,      // 2: #b8ecff glazed cyan ribbed ceramic insulators
    MAT_WOUND_COPPER,         // 3: #d67c44 polished copper secondary drum & primary helix
    MAT_CYAN_CLEARCOAT,       // 4: #1e84d4 superconducting D-coil cryostat shell
    MAT_CYAN_DIPOLE_EMISSIVE  // 5: glowing cyan toroid corona & plasma core (practical: true)
  ];
  const slots: MultiMatSlot[] = [];

  // Light brushed steel `#6a7688` beveled pedestal + CNC chamfered octagonal collar (zero black crush)
  slots.push({
    mesh: transformMesh(bevelBoxMesh(2.28, 0.42, 1.74, 0.06), { pos: [0, 0.21, 0] }),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.16, 0.28, 0.045), { pos: [0, 0.4, 0] }),
    materialIndex: 1
  });
  for (const [sx, sz] of [
    [-0.94, -0.66],
    [0.94, -0.66],
    [-0.94, 0.66],
    [0.94, 0.66]
  ] as const) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.38, 0.34, 0.38, 0.035), { pos: [sx, 0.28, sz] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.11, 0.2, 0.78, 5, 14), { pos: [sx, 0.46, sz] }),
      materialIndex: 2
    });
  }

  // Glazed cyan ceramic base insulator + tall `#d67c44` copper secondary winding drum + primary copper helix
  slots.push({
    mesh: transformMesh(ceramicInsulatorStackMesh(0.38, 0.62, 0.76, 5, 18), { pos: [-0.22, 0.66, 0] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(secondaryCopperWindingMesh(0.48, 2.38, 15, 22), { pos: [-0.22, 1.4, 0] }),
    materialIndex: 3
  });
  slots.push({
    mesh: transformMesh(helicalPrimaryCoilMesh(1.06, 0.8, 1.18, 1.12, 3.0, 0.058), { pos: [-0.22, 0, 0] }),
    materialIndex: 3
  });

  // Twin parallel Tokamak D-shaped superconducting field coils (`z = ±0.46`) + copper busbar ring
  const dCoil = tokamakDCoilYokeMesh(1.24, 4.15, 0.2);
  for (const zOff of [-0.46, 0.46]) {
    slots.push({ mesh: transformMesh(dCoil, { pos: [0.18, 0.68, zOff] }), materialIndex: 4 });
  }
  const ringMid = toroidalFieldRingMesh(0.82, 0.085, 22, 10);
  slots.push({ mesh: transformMesh(ringMid.copper, { pos: [-0.22, 2.86, 0] }), materialIndex: 3 });

  // Upper glazed cyan ceramic neck + glowing dipole core + spun toroid crown
  slots.push({
    mesh: transformMesh(ceramicInsulatorStackMesh(0.3, 0.5, 0.7, 4, 16), { pos: [-0.22, 3.76, 0] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.3, 0.1], [0.34, 0.42], [0.3, 0.74], [0, 0.84]], 16),
      { pos: [-0.22, 4.22, 0] }
    ),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.94, 0.22, 24, 12), { pos: [-0.14, 5.12, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(1.12, 0.072, 24, 10), { pos: [-0.14, 5.12, 0] }),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.54, 0.1, 20, 10), { pos: [-0.14, 5.32, 0] }),
    materialIndex: 3
  });

  const glassPod = transformMesh(
    latheMesh([[0.48, 0], [0.5, 0.05], [0.5, 0.82], [0.48, 0.88]], 18),
    { pos: [-0.22, 4.18, 0] }
  );
  return fitGroundedAssembly(slots, materials, targetSize, [glassPod], MAT_VACUUM_GLASS_COOL);
}


/**
 * `poCrystalRed` (`6.6 m`, warm `-X`) & `poCrystalBlue` (`7.0 m`, cool `+X`):
 * Glass-Walled Borosilicate Vacuum Containment Pod housing a 7-spire hexagonal
 * quartz dipole resonator cluster, copper pinch coils, ceramic HV feedthroughs,
 * and external lattice cryo-gantry, grounded cleanly at `y = 0`.
 */
function buildVacuumQuartzPodAssembly(
  polarity: "warm" | "cool",
  targetSize: number
): FittedMultiMatAssembly {
  const clearcoatMat = polarity === "warm" ? MAT_CRIMSON_CLEARCOAT : MAT_CYAN_CLEARCOAT;
  const ceramicMat = polarity === "warm" ? MAT_HV_CERAMIC : MAT_HV_CERAMIC_CYAN;
  const emissiveMat = polarity === "warm" ? MAT_CRIMSON_DIPOLE_EMISSIVE : MAT_CYAN_DIPOLE_EMISSIVE;
  const glassMat = polarity === "warm" ? MAT_VACUUM_GLASS_WARM : MAT_VACUUM_GLASS_COOL;

  const materials: readonly AuraMaterialSpec[] = [
    MAT_MACHINED_ALUMINUM, // 0
    MAT_LAMINATED_STEEL,   // 1: #6a7688 brushed steel beveled pedestal
    ceramicMat,            // 2: #eaf6ff / #b8ecff glazed ribbed ceramic insulators
    MAT_WOUND_COPPER,      // 3: #d67c44 polished copper secondary coil & pinch rings
    clearcoatMat,          // 4
    emissiveMat,           // 5: glowing toroid crown & dipole core (practical: true)
    MAT_POLE_CHROME        // 6: spun chrome toroid crown
  ];
  const slots: MultiMatSlot[] = [];

  // Grounded `#6a7688` brushed steel beveled pedestal + CNC aluminum collar + lower copper secondary collar & pinch ring
  slots.push({ mesh: machinedOctagonPlinthMesh(1.52, 0.38, 0.055), materialIndex: 1 });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.28, 0.28, 0.042), { pos: [0, 0.36, 0] }),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(secondaryCopperWindingMesh(1.16, 0.44, 6, 20), { pos: [0, 0.54, 0] }),
    materialIndex: 3
  });
  const lowerPinch = toroidalFieldRingMesh(1.28, 0.105, 24, 10);
  slots.push({ mesh: transformMesh(lowerPinch.copper, { pos: [0, 0.96, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(lowerPinch.clamps, { pos: [0, 0.96, 0] }), materialIndex: 0 });

  // 3 radial glazed ceramic ribbed HV feedthrough bushings + 3 external lattice tie-columns
  for (let i = 0; i < 3; i += 1) {
    const ang = (i / 3) * TAU + (polarity === "warm" ? 0.25 : -0.25);
    const rx = Math.cos(ang);
    const rz = Math.sin(ang);
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.13, 0.24, 0.94, 5, 14), {
        pos: [rx * 1.24, 0.56, rz * 1.24],
        rot: [rz * 0.2, 0, -rx * 0.2]
      }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [0.22, 3.55, 0.22], bays: 6, chordRadius: 0.022 }),
        { pos: [rx * 1.32, 2.58, rz * 1.32], rot: [0, -ang, 0] }
      ),
      materialIndex: 0
    });
  }

  // Upper vacuum bell flange + copper pinch coil + spun toroid crown & glowing corona ring
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.16, 0.24, 0.038), { pos: [0, 4.32, 0] }),
    materialIndex: 0
  });
  const upperPinch = toroidalFieldRingMesh(1.16, 0.098, 24, 10);
  slots.push({ mesh: transformMesh(upperPinch.copper, { pos: [0, 4.22, 0] }), materialIndex: 3 });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.82, 0.18, 22, 10), { pos: [0, 4.74, 0] }),
    materialIndex: 6
  });
  slots.push({
    mesh: transformMesh(spunCoronaToroidMesh(0.98, 0.065, 22, 8), { pos: [0, 4.74, 0] }),
    materialIndex: 5
  });

  // External swept copper busbar manifold feeding top toroid
  const sideSign = polarity === "warm" ? -1 : 1;
  const cryo = cryoManifoldConduitMesh(
    [
      [sideSign * 1.05, 0.52, -0.58],
      [sideSign * 1.54, 1.65, -0.44],
      [sideSign * 1.52, 3.35, 0.36],
      [sideSign * 0.82, 4.66, 0.24]
    ],
    0.058
  );
  slots.push({ mesh: cryo.pipe, materialIndex: 3 });
  slots.push({ mesh: cryo.flanges, materialIndex: 0 });

  // 7-spire flat-faceted hexagonal quartz dipole cluster inside the vacuum chamber
  const spireSpecs: readonly [number, number, number, number, number, number, boolean][] = [
    [0, 0, 0.34, 3.25, 0, 0, true],
    [0.44, 0.18, 0.24, 2.55, 0.08, -0.18, false],
    [-0.42, 0.24, 0.25, 2.68, 0.1, 0.17, true],
    [0.16, -0.46, 0.23, 2.4, -0.19, -0.06, false],
    [-0.22, -0.42, 0.21, 2.22, -0.16, 0.11, false],
    [0.54, -0.22, 0.18, 1.84, -0.09, -0.24, true],
    [-0.52, -0.14, 0.19, 1.92, -0.06, 0.22, false]
  ];
  for (const [sx, sz, br, sh, rx, rz, glowing] of spireSpecs) {
    const spire = toFlatShaded(hexQuartzSpireMesh(br, sh, 0.72));
    slots.push({
      mesh: transformMesh(spire, { pos: [sx, 0.88, sz], rot: [rx, sx * 0.8, rz] }),
      materialIndex: glowing ? 5 : 4
    });
  }

  // Cylindrical borosilicate/quartz vacuum containment chamber wall (`castShadow: false`)
  const glassWall = transformMesh(
    latheMesh(
      [[1.04, 0], [1.08, 0.08], [1.08, 3.32], [1.02, 3.44]],
      22
    ),
    { pos: [0, 0.92, 0] }
  );

  return fitGroundedAssembly(slots, materials, targetSize, [glassWall], glassMat);
}

/**
 * `poCrystalIslandB` (`10.5 m`, warm `-X`) & `poCrystalIsland` (`10.5 m`, cool `+X`):
 * Stratified Magnetosphere Tokamak Sky Island with `material.strata` basalt mesa,
 * CNC aluminum laboratory deck, hovering wound-copper toroidal field ring, lattice
 * cantilever gantries, vacuum diagnostics dome, and hexagonal dipole quartz spires.
 */
function buildMagnetosphereTokamakIslandAssembly(
  polarity: "warm" | "cool",
  targetSize = 10.5
): FittedMultiMatAssembly {
  const strataMat = polarity === "warm" ? MAT_WARM_STRATA : MAT_COOL_STRATA;
  const clearcoatMat = polarity === "warm" ? MAT_CRIMSON_CLEARCOAT : MAT_CYAN_CLEARCOAT;
  const ceramicMat = polarity === "warm" ? MAT_HV_CERAMIC : MAT_HV_CERAMIC_CYAN;
  const emissiveMat = polarity === "warm" ? MAT_CRIMSON_DIPOLE_EMISSIVE : MAT_CYAN_DIPOLE_EMISSIVE;
  const glassMat = polarity === "warm" ? MAT_VACUUM_GLASS_WARM : MAT_VACUUM_GLASS_COOL;

  const materials: readonly AuraMaterialSpec[] = [
    strataMat,             // 0
    MAT_MACHINED_ALUMINUM, // 1
    MAT_LAMINATED_STEEL,   // 2: #6a7688 brushed steel deck collar
    MAT_WOUND_COPPER,      // 3: #d67c44 copper field ring & Tesla pylon windings
    clearcoatMat,          // 4
    emissiveMat,           // 5: glowing toroid crowns & quartz cores (practical: true)
    ceramicMat             // 6: #eaf6ff / #b8ecff glazed ribbed ceramic insulators
  ];
  const slots: MultiMatSlot[] = [];

  // Tapered faceted magnetosphere keel + stratified cliff rock mesa (`stratifiedCliffMesh`)
  const keel = transformMesh(
    icosphereFacetMesh(1.45, 1, 0.14, polarity === "warm" ? 1703 : 1711),
    {
      scale: [1.48, 1.55, 1.42],
      pos: [0, 2.25, 0]
    }
  );
  const cliff = transformMesh(
    stratifiedCliffMesh({
      radiusX: 2.6,
      radiusZ: 2.45,
      height: 2.65,
      terraces: 6,
      seed: polarity === "warm" ? 1701 : 1709
    }),
    { pos: [0, 2.05, 0] }
  );
  slots.push({ mesh: keel, materialIndex: 0 });
  slots.push({ mesh: cliff, materialIndex: 0 });

  // Machined octagonal Tokamak station deck + `#6a7688` brushed steel pedestal collar
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(2.38, 0.34, 0.05), { pos: [0, 4.55, 0] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(2.12, 0.24, 0.04), { pos: [0, 4.86, 0] }),
    materialIndex: 1
  });

  // Hovering wound-copper toroidal levitation field coil encircling the mesa waist
  const levRing = toroidalFieldRingMesh(3.05, 0.16, 28, 10);
  slots.push({ mesh: transformMesh(levRing.copper, { pos: [0, 3.65, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(levRing.clamps, { pos: [0, 3.65, 0] }), materialIndex: 1 });

  // Twin cantilevered `latticeTrussMesh` outriggers + Tesla coil pylons (ceramic + copper winding + glowing toroid)
  for (const dir of [-1, 1]) {
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.55, 0.42, 0.46], bays: 4, chordRadius: 0.032 }),
        { pos: [dir * 2.48, 4.78, 0] }
      ),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.16, 0.3, 0.68, 4, 14), {
        pos: [dir * 1.72, 5.06, 0.65]
      }),
      materialIndex: 6
    });
    slots.push({
      mesh: transformMesh(secondaryCopperWindingMesh(0.24, 0.72, 8, 16), {
        pos: [dir * 1.72, 5.72, 0.65]
      }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(0.38, 0.08, 18, 8), {
        pos: [dir * 1.72, 6.52, 0.65]
      }),
      materialIndex: 5
    });
  }
  const cryo = cryoManifoldConduitMesh(
    [[-1.65, 5.05, -0.92], [-0.85, 5.85, -1.18], [0.88, 5.85, -1.12], [1.68, 5.05, -0.86]],
    0.075
  );
  slots.push({ mesh: cryo.pipe, materialIndex: 3 });
  slots.push({ mesh: cryo.flanges, materialIndex: 1 });

  // Towering hexagonal dipole quartz spires erupting from the Tokamak island deck
  const islandSpires: readonly [number, number, number, number, number, boolean][] = [
    [0, 0.08, 0.56, 3.85, 0.03, true],
    [-0.92, 0.28, 0.38, 2.85, 0.14, false],
    [0.96, -0.18, 0.4, 3.05, -0.13, true],
    [-0.38, -0.86, 0.34, 2.35, -0.11, false],
    [0.48, 0.88, 0.32, 2.2, 0.12, false]
  ];
  for (const [sx, sz, br, sh, tilt, glowing] of islandSpires) {
    slots.push({
      mesh: transformMesh(toFlatShaded(hexQuartzSpireMesh(br, sh, 0.75)), {
        pos: [sx, 5.04, sz],
        rot: [tilt * 0.6, sx * 0.5, -tilt]
      }),
      materialIndex: glowing ? 5 : 4
    });
  }

  // Borosilicate vacuum diagnostics containment dome around the central island spire
  const dome = transformMesh(
    latheMesh([[1.32, 0], [1.36, 0.12], [1.34, 1.95], [0.92, 2.65], [0, 2.88]], 20),
    { pos: [0, 5.06, 0] }
  );

  return fitGroundedAssembly(slots, materials, targetSize, [dome], glassMat);
}

// ---------------------------------------------------------------------------
// 4. Scrolling Corridor Instanced Batches (`> 16` instances) & Scene Mounters
// ---------------------------------------------------------------------------

export interface BackdropGroupSpec {
  readonly id: string;
  readonly kind: BackdropAssetKind;
  readonly side: -1 | 1;
  readonly size: number;
  readonly transforms: readonly {
    readonly position: readonly [number, number, number];
    readonly rotation: readonly [number, number, number];
    readonly scale: number;
  }[];
}

function defineSingleSpec(m: RawMesh): AuraCustomGeometrySpec {
  const positions = Float32Array.from(m.positions);
  const normals = Float32Array.from(m.normals);
  const uvs = Float32Array.from(m.uvs);
  const indices =
    positions.length / 3 > 65535
      ? Uint32Array.from(m.indices)
      : Uint16Array.from(m.indices);
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: computePositionsBounds(positions)
  });
}

type GroupBuilder = ReturnType<typeof group>;

export function buildPortalBusbarJunctionNode(
  name: string,
  side: -1 | 1,
  zPos: number
): GroupBuilder {
  const slots: MultiMatSlot[] = [
    { mesh: machinedOctagonPlinthMesh(0.48, 0.3, 0.035), materialIndex: 0 },
    {
      mesh: transformMesh(ceramicInsulatorStackMesh(0.12, 0.22, 0.66, 4, 14), { pos: [0, 0.28, 0] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(secondaryCopperWindingMesh(0.18, 0.54, 7, 16), { pos: [0, 0.92, 0] }),
      materialIndex: 2
    },
    {
      mesh: transformMesh(spunCoronaToroidMesh(0.32, 0.068, 18, 8), { pos: [0, 1.54, 0] }),
      materialIndex: 3
    }
  ];
  return assembleMultiMaterialNode(
    name,
    slots,
    [
      MAT_LAMINATED_STEEL,
      side < 0 ? MAT_HV_CERAMIC : MAT_HV_CERAMIC_CYAN,
      MAT_WOUND_COPPER,
      side < 0 ? MAT_CRIMSON_DIPOLE_EMISSIVE : MAT_CYAN_DIPOLE_EMISSIVE
    ],
    {
      position: [side * 5.85, 0.22, zPos],
      castShadow: false,
      receiveShadow: false
    }
  );
}

/**
 * Batches ALL static repeated outer arena rim bezel segments, `#6a7688` brushed steel pylon
 * pedestals, `#d67c44` copper secondary windings + busbar gantries, and `#eaf6ff`/`#b8ecff`
 * ribbed ceramic insulator posts into 3 `instances.custom` draw calls (`24` instances each)
 * across `[0, -360]` using strictly `clearcoat: 0, sheen: 0` instanced materials.
 */
function buildCorridorLabInstancedChildren(
  groupId: string,
  side: -1 | 1
): readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] {
  // 1) Batched outer arena rim bezel segment + `#6a7688` brushed steel pylon pedestal (`24` instances)
  const bezelProfile: V2[] = [
    [-0.22, -0.18],
    [0.22, -0.18],
    [0.26, 0.04],
    [0.14, 0.24],
    [-0.14, 0.24],
    [-0.26, 0.04]
  ];
  const steelPedestalAndRim = concatRaw([
    extrudePolygonMesh(bezelProfile, 4.2, 0.03, false),
    transformMesh(machinedOctagonPlinthMesh(0.52, 0.34, 0.04), { pos: [side * 0.68, -0.26, 0] })
  ]);
  const bezelSpec = defineSingleSpec(steelPedestalAndRim);

  // 2) Batched `#d67c44` copper secondary winding drum + busbar truss + toroid ring (`24` instances)
  const copperPylonAndBus = concatRaw([
    transformMesh(secondaryCopperWindingMesh(0.24, 0.92, 9, 14), { pos: [0, 0.42, 0] }),
    transformMesh(spunCoronaToroidMesh(0.38, 0.075, 16, 8), { pos: [0, 1.44, 0] }),
    transformMesh(
      latticeTrussMesh({ span: [0.24, 0.26, 5.4], bays: 4, chordRadius: 0.022 }),
      { pos: [0, 0.56, -2.7] }
    )
  ]);
  const busSpec = defineSingleSpec(copperPylonAndBus);

  // 3) Batched `#eaf6ff` / `#b8ecff` ribbed ceramic insulator posts (`24` instances)
  const insulatorSpec = defineSingleSpec(ceramicInsulatorStackMesh(0.15, 0.28, 0.62, 4, 14));

  const bezelTransforms: AuraTransformSpec[] = [];
  const busTransforms: AuraTransformSpec[] = [];
  const insulatorTransforms: AuraTransformSpec[] = [];
  const busColors: string[] = [];
  const insulatorColors: string[] = [];
  const copperA = "#de834b";
  const copperB = "#cf723c";
  const ceramicPrimary = side < 0 ? "#eaf6ff" : "#b8ecff";
  const ceramicAlt = side < 0 ? "#d8efff" : "#cff4ff";
  for (let i = 0; i < 24; i += 1) {
    const z = -6 - i * 15;
    bezelTransforms.push({
      position: [side * 5.24, 0.34, z]
    });
    busTransforms.push({
      position: [side * 5.92, 0.42, z]
    });
    insulatorTransforms.push({
      position: [side * 5.92, 0.26, z]
    });
    busColors.push(i % 2 === 0 ? copperA : copperB);
    insulatorColors.push(i % 2 === 0 ? ceramicPrimary : ceramicAlt);
  }

  return [
    instances.custom(bezelSpec, {
      name: `${groupId}-arena-bezels`,
      material: MAT_INST_BEZEL_ALLOY,
      transforms: bezelTransforms,
      castShadow: false,
      receiveShadow: false
    }),
    instances.custom(busSpec, {
      name: `${groupId}-copper-busbars`,
      material: MAT_INST_COPPER_BUS,
      transforms: busTransforms,
      colors: busColors,
      castShadow: false,
      receiveShadow: false
    }),
    instances.custom(insulatorSpec, {
      name: `${groupId}-ceramic-insulators`,
      material: MAT_INST_CRYO_MANIFOLD,
      transforms: insulatorTransforms,
      colors: insulatorColors,
      castShadow: false,
      receiveShadow: false
    })
  ];
}

function resolveAssemblyForKind(kind: BackdropAssetKind, targetSize: number): FittedMultiMatAssembly {
  switch (kind) {
    case "poChargeCoil":
      return buildCrimsonDipoleResonatorAssembly(targetSize);
    case "poMagnet":
      return buildCyanTokamakMagnetAssembly(targetSize);
    case "poCrystalRed":
      return buildVacuumQuartzPodAssembly("warm", targetSize);
    case "poCrystalBlue":
      return buildVacuumQuartzPodAssembly("cool", targetSize);
    case "poCrystalIslandB":
      return buildMagnetosphereTokamakIslandAssembly("warm", targetSize);
    case "poCrystalIsland":
      return buildMagnetosphereTokamakIslandAssembly("cool", targetSize);
  }
}

/**
 * Builds one scrolling runtime `group(groupSpec.id, ...).runtime({ id: groupSpec.id })`
 * mounting all double-span multi-material Tokamak / Magnetic Lab landmarks + glass vacuum
 * chambers (`castShadow: false`) + corridor `instances.custom` hardware batches.
 */
export function buildBackdropGroupNode(groupSpec: BackdropGroupSpec): GroupBuilder {
  const assembly = resolveAssemblyForKind(groupSpec.kind, groupSpec.size);
  const children: (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] = [];

  const batchedSlots: MultiMatSlot[] = [];
  const batchedGlass: RawMesh[] = [];

  for (const tr of groupSpec.transforms) {
    const pos: V3 = [tr.position[0], tr.position[1], tr.position[2]];
    const rot: V3 = [tr.rotation[0], tr.rotation[1], tr.rotation[2]];
    const xform = { pos, rot, scale: tr.scale };
    for (const slot of assembly.fittedSlots) {
      batchedSlots.push({
        materialIndex: slot.materialIndex,
        mesh: transformMesh(slot.mesh, xform)
      });
    }
    if (assembly.fittedGlass) {
      for (const gm of assembly.fittedGlass) {
        batchedGlass.push(transformMesh(gm, xform));
      }
    }
  }

  if (batchedSlots.length > 0) {
    children.push(
      geometry.multiMaterial(buildGroupedGeometrySpec(batchedSlots), assembly.materials, {
        name: `${groupSpec.id}-body`,
        castShadow: false,
        receiveShadow: false
      })
    );
  }
  if (batchedGlass.length > 0 && assembly.glassMaterial) {
    children.push(
      geometry.custom(mergeRawMeshes(batchedGlass), {
        name: `${groupSpec.id}-glass`,
        material: assembly.glassMaterial,
        castShadow: false,
        receiveShadow: false
      })
    );
  }

  if (groupSpec.kind === "poChargeCoil" || groupSpec.kind === "poMagnet") {
    children.push(...buildCorridorLabInstancedChildren(groupSpec.id, groupSpec.side));
  }

  return group(groupSpec.id, children).runtime({ id: groupSpec.id });
}

// ---------------------------------------------------------------------------
// 5. Gameplay & Trackside Procedural `MeshData` Builders (`world.ts` Batches)
// ---------------------------------------------------------------------------

/**
 * Precision CNC-machined aluminum & ferromagnetic arena bezel rail segment (`Z in [-segLen/2, +segLen/2]`)
 * with chamfered octagonal containment profile and twin clamp collars (`~84` verts per `2 m` segment).
 */
export function arenaBezelRailMesh(segLen = 2): MeshData {
  const ring2D: readonly V2[] = [
    [-0.15, -0.17],
    [0.15, -0.17],
    [0.19, -0.02],
    [0.13, 0.18],
    [-0.13, 0.18],
    [-0.19, -0.02]
  ];
  const half = segLen * 0.5;
  const collarHalf = Math.min(0.11, segLen * 0.12);
  const mkSection = (z: number, scale: number): V3[] =>
    ring2D.map(([x, y]) => [x * scale, y * scale, z]);
  const mesh = loftSectionsMesh(
    [
      mkSection(-half, 1),
      mkSection(-collarHalf * 1.25, 1),
      mkSection(-collarHalf, 1.14),
      mkSection(collarHalf, 1.14),
      mkSection(collarHalf * 1.25, 1),
      mkSection(half, 1)
    ],
    true,
    false
  );
  return rawToMeshData(mesh);
}

/**
 * Lathe-turned dipole collector orb (`radius = 0.45`) with recessed equatorial coil groove
 * and twin toroidal stator shoulders so `plasmaOrbSpec` highlights machined relief.
 */
export function dipoleCollectorOrbMesh(radius = 0.45): MeshData {
  const r = radius;
  const profile: V2[] = [
    [0, -r],
    [r * 0.46, -r * 0.9],
    [r * 0.82, -r * 0.58],
    [r * 1.0, -r * 0.22],
    [r * 0.91, -r * 0.07],
    [r * 0.91, r * 0.07],
    [r * 1.0, r * 0.22],
    [r * 0.82, r * 0.58],
    [r * 0.46, r * 0.9],
    [0, r]
  ];
  return rawToMeshData(latheMesh(profile, 18, false));
}

/**
 * Multi-facet octagonal crown-cut brilliant power-up prism gem (`radius = 0.4`, `y in [-1.3r, +1.3r]`)
 * with sharp flat-shaded facets (`toFlatShaded(latheMesh(..., 8))`).
 */
export function crownPrismGemMesh(radius = 0.4): MeshData {
  const r = radius;
  const profile: V2[] = [
    [0, -r * 1.3],
    [r * 0.58, -r * 0.58],
    [r * 1.02, -r * 0.07],
    [r * 1.02, r * 0.08],
    [r * 0.72, r * 0.68],
    [r * 0.44, r * 1.18],
    [0, r * 1.24]
  ];
  return rawToMeshData(toFlatShaded(latheMesh(profile, 8, false)));
}
