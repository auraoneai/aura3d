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

/** Anisotropic wound oxygen-free copper for toroidal field coils, corona rings & busbars. */
export const MAT_WOUND_COPPER: AuraMaterialSpec = material.brushedMetal({
  name: "po wound tokamak copper",
  color: "#d9753b",
  roughness: 0.22,
  anisotropy: 0.92,
  anisotropyRotation: 0,
  envMapIntensity: 1.82
});

/** Precision CNC-machined anisotropic brushed aluminum for bezels, vacuum flanges & trusses. */
export const MAT_MACHINED_ALUMINUM: AuraMaterialSpec = material.brushedMetal({
  name: "po machined lab aluminum",
  color: "#cdd8e6",
  roughness: 0.24,
  anisotropy: 0.88,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.72
});

/** Dark laminated silicon-steel & tungsten alloy for magnet yokes and structural plinths. */
export const MAT_LAMINATED_STEEL: AuraMaterialSpec = material.physical({
  name: "po laminated magnet steel",
  color: "#1c2332",
  metallic: 0.88,
  roughness: 0.3,
  anisotropy: 0.76,
  clearcoat: 0.18,
  envMapIntensity: 1.48
});

/** Mirror-ground ferromagnetic pole shoes & high-voltage corona toroid terminals. */
export const MAT_POLE_CHROME: AuraMaterialSpec = material.studioMetal({
  name: "po ground pole shoe chrome",
  color: "#e6eef8",
  roughness: 0.12,
  envMapIntensity: 1.88
});

/** Glazed alumina / porcelain ceramic for corrugated high-voltage standoff insulator stacks. */
export const MAT_HV_CERAMIC: AuraMaterialSpec = material.ceramic({
  name: "po hv alumina insulator",
  color: "#eef3f9",
  roughness: 0.2,
  clearcoat: 0.82,
  clearcoatRoughness: 0.06,
  envMapIntensity: 1.25
});

/** Warm crimson (`+`) high-gloss stator & quartz facet clearcoat housing. */
export const MAT_CRIMSON_CLEARCOAT: AuraMaterialSpec = material.clearcoatPaint({
  name: "po crimson north stator clearcoat",
  color: "#cf2d4f",
  metallic: 0.26,
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.68
});

/** Cool electric-cyan (`−`) high-gloss cryostat & superconducting shell clearcoat. */
export const MAT_CYAN_CLEARCOAT: AuraMaterialSpec = material.clearcoatPaint({
  name: "po cyan south cryostat clearcoat",
  color: "#1576bd",
  metallic: 0.28,
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.68
});

/** Frosted stainless cryogenic manifold jacket & seismic isolator elastomer (`material.pbr` / `blackRubber`). */
export const MAT_CRYO_CONDUIT_PBR: AuraMaterialSpec = material.pbr({
  name: "po frosted cryo conduit",
  color: "#9cb4cc",
  roughness: 0.36,
  metalness: 0.72,
  envMapIntensity: 1.32
});

export const MAT_SEISMIC_RUBBER: AuraMaterialSpec = material.blackRubber({
  name: "po seismic isolator pad",
  color: "#11151d",
  roughness: 0.92
});

/** WebGPU-native magnetosphere basalt & iron-ore mesa rock (`material.pbr`) for sky islands. */
export const MAT_WARM_STRATA: AuraMaterialSpec = material.pbr({
  name: "po warm magnetosphere basalt",
  color: "#52253a",
  roughness: 0.84,
  metalness: 0.16,
  envMapIntensity: 0.92
});

export const MAT_COOL_STRATA: AuraMaterialSpec = material.pbr({
  name: "po cool magnetosphere basalt",
  color: "#1e3d60",
  roughness: 0.84,
  metalness: 0.16,
  envMapIntensity: 0.92
});

/** Practical dipole plasma & quartz-core emissives (`practical: true` for auditArtDirection). */
export const MAT_CRIMSON_DIPOLE_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po crimson dipole core",
  color: "#ff6378",
  emissive: "#ff425b",
  emissiveIntensity: 3.15,
  roughness: 0.16,
  practical: true
});

export const MAT_CYAN_DIPOLE_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po cyan dipole core",
  color: "#7ae2ff",
  emissive: "#2ec4ff",
  emissiveIntensity: 3.15,
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
  name: "po instanced arena bezel alloy",
  color: "#aebcd0",
  roughness: 0.28,
  metallic: 0.9,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_COPPER_BUS: AuraMaterialSpec = material.metal({
  name: "po instanced copper busbar",
  color: "#d47138",
  roughness: 0.26,
  metallic: 0.92,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_CRYO_MANIFOLD: AuraMaterialSpec = material.pbr({
  name: "po instanced cryo manifold",
  color: "#8ea8c4",
  roughness: 0.38,
  metalness: 0.74,
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

// ---------------------------------------------------------------------------
// 3. Multi-Material Tokamak & Magnetic Lab Landmark Assemblies
// ---------------------------------------------------------------------------

/**
 * `poChargeCoil` (`5.8 m`, warm `-X`): Crimson (`+`) Dipole Resonator Tower &
 * Corrugated Ceramic Tesla / Tokamak Poloidal Field Coil Pylon, grounded at `y = 0`.
 */
function buildCrimsonDipoleResonatorAssembly(targetSize = 5.8): FittedMultiMatAssembly {
  const materials: readonly AuraMaterialSpec[] = [
    MAT_MACHINED_ALUMINUM,       // 0
    MAT_LAMINATED_STEEL,         // 1
    MAT_HV_CERAMIC,              // 2
    MAT_WOUND_COPPER,            // 3
    MAT_CRIMSON_CLEARCOAT,       // 4
    MAT_POLE_CHROME,             // 5
    MAT_CRYO_CONDUIT_PBR,        // 6
    MAT_CRIMSON_DIPOLE_EMISSIVE  // 7
  ];
  const slots: MultiMatSlot[] = [];

  // Grounded octagonal CNC aluminum plinth + dark steel anchor gussets
  slots.push({ mesh: machinedOctagonPlinthMesh(1.22, 0.34, 0.05), materialIndex: 1 });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(0.98, 0.28, 0.04), { pos: [0, 0.32, 0] }),
    materialIndex: 0
  });
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU + Math.PI * 0.25;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.22, 0.42, 0.58, 0.03), {
        pos: [Math.cos(a) * 0.92, 0.24, Math.sin(a) * 0.92],
        rot: [0, -a, 0]
      }),
      materialIndex: 0
    });
  }

  // Central corrugated HV alumina ceramic insulator column (`y = 0.58..3.78`)
  slots.push({
    mesh: transformMesh(ceramicInsulatorStackMesh(0.34, 0.62, 3.2, 9, 18), { pos: [0, 0.58, 0] }),
    materialIndex: 2
  });

  // 3 ascending wound-copper toroidal corona/poloidal field coils + radial chrome standoffs
  const ringHeights: readonly [number, number, number][] = [
    [1.38, 1.18, 0.11],
    [2.36, 1.04, 0.105],
    [3.32, 0.9, 0.095]
  ];
  for (const [ry, majR, minR] of ringHeights) {
    const ring = toroidalFieldRingMesh(majR, minR, 24, 10);
    slots.push({ mesh: transformMesh(ring.copper, { pos: [0, ry, 0] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(ring.clamps, { pos: [0, ry, 0] }), materialIndex: 0 });
    for (let k = 0; k < 3; k += 1) {
      const ang = (k / 3) * TAU;
      slots.push({
        mesh: tubeSweepMesh(
          [
            [Math.cos(ang) * 0.34, ry, Math.sin(ang) * 0.34, 0.038],
            [Math.cos(ang) * (majR - minR * 0.5), ry, Math.sin(ang) * (majR - minR * 0.5), 0.038]
          ],
          6,
          true
        ),
        materialIndex: 5
      });
    }
  }

  // Side-mounted lattice busbar gantry mast + swept cryo-manifold riser
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.34, 3.55, 0.34], bays: 6, chordRadius: 0.028 }),
      { pos: [-0.94, 2.35, 0] }
    ),
    materialIndex: 0
  });
  const cryo = cryoManifoldAssemblyHelper([
    [-0.78, 0.45, 0.42],
    [-1.08, 1.35, 0.46],
    [-1.06, 2.85, 0.32],
    [-0.58, 3.92, 0.18]
  ], 0.058);
  slots.push({ mesh: cryo.pipe, materialIndex: 6 });
  slots.push({ mesh: cryo.flanges, materialIndex: 0 });

  // Upper crimson clearcoat stator bell + dipole plasma core + top chrome corona toroid
  const statorBell = latheMesh(
    [[0, 0], [0.68, 0], [0.76, 0.14], [0.58, 0.32], [0, 0.32]],
    18
  );
  slots.push({ mesh: transformMesh(statorBell, { pos: [0, 3.74, 0] }), materialIndex: 4 });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.34, 0.12], [0.38, 0.52], [0.34, 0.92], [0, 1.04]], 16),
      { pos: [0, 4.02, 0] }
    ),
    materialIndex: 7
  });
  const topCrown = toroidalFieldRingMesh(0.76, 0.14, 24, 12);
  slots.push({ mesh: transformMesh(topCrown.copper, { pos: [0, 5.26, 0] }), materialIndex: 5 });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.52, 0.02], [0.44, 0.22], [0.18, 0.44], [0, 0.5]], 16),
      { pos: [0, 5.06, 0] }
    ),
    materialIndex: 4
  });

  // Cylindrical quartz vacuum containment sleeve around the crimson dipole core
  const glassChamber = transformMesh(
    latheMesh([[0.54, 0], [0.56, 0.06], [0.56, 1.02], [0.54, 1.08]], 20),
    { pos: [0, 4.0, 0] }
  );

  return fitGroundedAssembly(slots, materials, targetSize, [glassChamber], MAT_VACUUM_GLASS_WARM);
}

function cryoManifoldAssemblyHelper(waypoints: readonly V3[], pipeR: number) {
  return cryoManifoldConduitMesh(waypoints, pipeR);
}

/**
 * `poMagnet` (`6.0 m`, cool `+X`): Cyan (`−`) Superconducting Tokamak D-Coil &
 * Horseshoe Dipole Electromagnet Monument, grounded at `y = 0`.
 */
function buildCyanTokamakMagnetAssembly(targetSize = 6.0): FittedMultiMatAssembly {
  const materials: readonly AuraMaterialSpec[] = [
    MAT_MACHINED_ALUMINUM,    // 0
    MAT_LAMINATED_STEEL,      // 1
    MAT_HV_CERAMIC,           // 2
    MAT_WOUND_COPPER,         // 3
    MAT_CYAN_CLEARCOAT,       // 4
    MAT_POLE_CHROME,          // 5
    MAT_CRYO_CONDUIT_PBR,     // 6
    MAT_CYAN_DIPOLE_EMISSIVE, // 7
    MAT_SEISMIC_RUBBER        // 8
  ];
  const slots: MultiMatSlot[] = [];

  // Seismic elastomer pads + CNC aluminum cryostat pedestal
  for (const sx of [-0.95, 0.95]) {
    for (const sz of [-0.68, 0.68]) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.46, 0.14, 0.46, 0.025), { pos: [sx, 0.07, sz] }),
        materialIndex: 8
      });
    }
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(2.35, 0.42, 1.72, 0.055), { pos: [0, 0.34, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.12, 0.24, 0.04), { pos: [0, 0.54, 0] }),
    materialIndex: 0
  });

  // Twin parallel Tokamak D-shaped superconducting field coils (`z = ±0.42`)
  const dCoil = tokamakDCoilYokeMesh(1.36, 4.55, 0.23);
  for (const zOff of [-0.42, 0.42]) {
    slots.push({ mesh: transformMesh(dCoil, { pos: [0.14, 0.72, zOff] }), materialIndex: 4 });
  }
  // Laminated steel cross-yoke spine & wound-copper excitation bobbins
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.58, 3.65, 1.18, 0.05), { pos: [-0.84, 2.85, 0] }),
    materialIndex: 1
  });
  for (const by of [1.65, 3.95]) {
    const bobbin = latheMesh(
      [[0.32, -0.34], [0.62, -0.32], [0.58, -0.22], [0.58, 0.22], [0.62, 0.32], [0.32, 0.34]],
      16
    );
    slots.push({ mesh: transformMesh(bobbin, { pos: [-0.84, by, 0] }), materialIndex: 3 });
  }

  // Cantilevered mirror-ground dipole pole shoes + glowing cyan plasma gap core
  for (const py of [2.15, 3.78]) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.96, 0.36, 0.98, 0.045), { pos: [-0.24, py, 0] }),
      materialIndex: 5
    });
  }
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.32, 0.1], [0.36, 0.55], [0.32, 1.0], [0, 1.1]], 16),
      { pos: [-0.18, 2.42, 0] }
    ),
    materialIndex: 7
  });
  const ringMid = toroidalFieldRingMesh(0.58, 0.075, 20, 8);
  slots.push({ mesh: transformMesh(ringMid.copper, { pos: [-0.18, 2.97, 0] }), materialIndex: 3 });

  // Twin ceramic HV bushings + rear lattice gantry + cryo-manifold loop
  for (const bz of [-0.44, 0.44]) {
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.14, 0.26, 0.92, 5, 14), { pos: [-0.52, 5.12, bz] }),
      materialIndex: 2
    });
  }
  slots.push({
    mesh: transformMesh(
      latticeTrussMesh({ span: [0.34, 4.1, 0.72], bays: 6, chordRadius: 0.028 }),
      { pos: [0.95, 2.8, 0] }
    ),
    materialIndex: 0
  });
  const cryo = cryoManifoldConduitMesh(
    [[0.78, 0.72, -0.55], [1.26, 1.85, -0.52], [1.28, 3.65, 0.44], [0.62, 4.75, 0.42]],
    0.062
  );
  slots.push({ mesh: cryo.pipe, materialIndex: 6 });
  slots.push({ mesh: cryo.flanges, materialIndex: 0 });

  const glassPod = transformMesh(
    latheMesh([[0.48, 0], [0.5, 0.05], [0.5, 1.16], [0.48, 1.22]], 18),
    { pos: [-0.18, 2.36, 0] }
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
  const emissiveMat = polarity === "warm" ? MAT_CRIMSON_DIPOLE_EMISSIVE : MAT_CYAN_DIPOLE_EMISSIVE;
  const glassMat = polarity === "warm" ? MAT_VACUUM_GLASS_WARM : MAT_VACUUM_GLASS_COOL;

  const materials: readonly AuraMaterialSpec[] = [
    MAT_MACHINED_ALUMINUM, // 0
    MAT_LAMINATED_STEEL,   // 1
    MAT_HV_CERAMIC,        // 2
    MAT_WOUND_COPPER,      // 3
    clearcoatMat,          // 4
    MAT_CRYO_CONDUIT_PBR,  // 5
    emissiveMat,           // 6
    MAT_POLE_CHROME        // 7
  ];
  const slots: MultiMatSlot[] = [];

  // Grounded CNC vacuum vessel base flange + dark steel sump + lower copper pinch coil
  slots.push({ mesh: machinedOctagonPlinthMesh(1.48, 0.34, 0.05), materialIndex: 1 });
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.26, 0.26, 0.04), { pos: [0, 0.32, 0] }),
    materialIndex: 0
  });
  const lowerPinch = toroidalFieldRingMesh(1.22, 0.105, 24, 10);
  slots.push({ mesh: transformMesh(lowerPinch.copper, { pos: [0, 0.68, 0] }), materialIndex: 3 });
  slots.push({ mesh: transformMesh(lowerPinch.clamps, { pos: [0, 0.68, 0] }), materialIndex: 0 });

  // 3 radial ceramic HV feedthrough bushings + 3 external lattice tie-columns
  for (let i = 0; i < 3; i += 1) {
    const ang = (i / 3) * TAU + (polarity === "warm" ? 0.25 : -0.25);
    const rx = Math.cos(ang);
    const rz = Math.sin(ang);
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.12, 0.22, 0.88, 5, 12), {
        pos: [rx * 1.24, 0.52, rz * 1.24],
        rot: [rz * 0.22, 0, -rx * 0.22]
      }),
      materialIndex: 2
    });
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [0.22, 3.65, 0.22], bays: 6, chordRadius: 0.022 }),
        { pos: [rx * 1.32, 2.52, rz * 1.32], rot: [0, -ang, 0] }
      ),
      materialIndex: 0
    });
  }

  // Upper vacuum bell flange + upper wound-copper pinch coil + chrome vent crown
  slots.push({
    mesh: transformMesh(machinedOctagonPlinthMesh(1.16, 0.24, 0.038), { pos: [0, 4.32, 0] }),
    materialIndex: 0
  });
  const upperPinch = toroidalFieldRingMesh(1.14, 0.095, 24, 10);
  slots.push({ mesh: transformMesh(upperPinch.copper, { pos: [0, 4.22, 0] }), materialIndex: 3 });
  slots.push({
    mesh: transformMesh(
      latheMesh([[0, 0], [0.76, 0], [0.62, 0.26], [0.24, 0.48], [0, 0.54]], 16),
      { pos: [0, 4.54, 0] }
    ),
    materialIndex: 7
  });

  // External swept liquid-helium cryo-manifold pipe feeding top condenser
  const sideSign = polarity === "warm" ? -1 : 1;
  const cryo = cryoManifoldConduitMesh(
    [
      [sideSign * 1.05, 0.45, -0.58],
      [sideSign * 1.54, 1.65, -0.44],
      [sideSign * 1.52, 3.35, 0.36],
      [sideSign * 0.82, 4.58, 0.24]
    ],
    0.056
  );
  slots.push({ mesh: cryo.pipe, materialIndex: 5 });
  slots.push({ mesh: cryo.flanges, materialIndex: 0 });

  // 7-spire flat-faceted hexagonal quartz dipole cluster inside the vacuum chamber
  const spireSpecs: readonly [number, number, number, number, number, number, boolean][] = [
    [0, 0, 0.34, 3.35, 0, 0, true],
    [0.44, 0.18, 0.24, 2.62, 0.08, -0.18, false],
    [-0.42, 0.24, 0.25, 2.75, 0.1, 0.17, true],
    [0.16, -0.46, 0.23, 2.48, -0.19, -0.06, false],
    [-0.22, -0.42, 0.21, 2.28, -0.16, 0.11, false],
    [0.54, -0.22, 0.18, 1.88, -0.09, -0.24, true],
    [-0.52, -0.14, 0.19, 1.96, -0.06, 0.22, false]
  ];
  for (const [sx, sz, br, sh, rx, rz, glowing] of spireSpecs) {
    const spire = toFlatShaded(hexQuartzSpireMesh(br, sh, 0.72));
    slots.push({
      mesh: transformMesh(spire, { pos: [sx, 0.56, sz], rot: [rx, sx * 0.8, rz] }),
      materialIndex: glowing ? 6 : 4
    });
  }

  // Cylindrical borosilicate/quartz vacuum containment chamber wall (`castShadow: false`)
  const glassWall = transformMesh(
    latheMesh(
      [[1.04, 0], [1.08, 0.08], [1.08, 3.56], [1.02, 3.68]],
      24
    ),
    { pos: [0, 0.62, 0] }
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
  const emissiveMat = polarity === "warm" ? MAT_CRIMSON_DIPOLE_EMISSIVE : MAT_CYAN_DIPOLE_EMISSIVE;
  const glassMat = polarity === "warm" ? MAT_VACUUM_GLASS_WARM : MAT_VACUUM_GLASS_COOL;

  const materials: readonly AuraMaterialSpec[] = [
    strataMat,             // 0
    MAT_MACHINED_ALUMINUM, // 1
    MAT_LAMINATED_STEEL,   // 2
    MAT_WOUND_COPPER,      // 3
    clearcoatMat,          // 4
    emissiveMat,           // 5
    MAT_CRYO_CONDUIT_PBR,  // 6
    MAT_HV_CERAMIC         // 7
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

  // Machined octagonal Tokamak station deck + steel sub-collar on top of the mesa
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

  // Twin cantilevered `latticeTrussMesh` busbar outriggers + ceramic HV arresters + cryo loop
  for (const dir of [-1, 1]) {
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [1.55, 0.42, 0.46], bays: 4, chordRadius: 0.032 }),
        { pos: [dir * 2.48, 4.78, 0] }
      ),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.16, 0.3, 1.15, 5, 12), {
        pos: [dir * 1.72, 5.08, 0.65]
      }),
      materialIndex: 7
    });
  }
  const cryo = cryoManifoldConduitMesh(
    [[-1.65, 5.05, -0.92], [-0.85, 5.85, -1.18], [0.88, 5.85, -1.12], [1.68, 5.05, -0.86]],
    0.075
  );
  slots.push({ mesh: cryo.pipe, materialIndex: 6 });
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

function buildPortalBusbarJunctionNode(
  name: string,
  side: -1 | 1,
  zPos: number
): GroupBuilder {
  const slots: MultiMatSlot[] = [
    { mesh: machinedOctagonPlinthMesh(0.46, 0.28, 0.03), materialIndex: 0 },
    {
      mesh: transformMesh(ceramicInsulatorStackMesh(0.11, 0.2, 0.68, 4, 12), { pos: [0, 0.26, 0] }),
      materialIndex: 1
    },
    {
      mesh: transformMesh(toroidalFieldRingMesh(0.36, 0.065, 18, 8).copper, { pos: [0, 0.96, 0] }),
      materialIndex: 2
    }
  ];
  return assembleMultiMaterialNode(
    name,
    slots,
    [MAT_MACHINED_ALUMINUM, MAT_HV_CERAMIC, MAT_WOUND_COPPER],
    {
      position: [side * 5.85, 0.22, zPos],
      castShadow: false,
      receiveShadow: false
    }
  );
}

/**
 * Builds `> 16`-instance corridor Tokamak hardware batches (`24` aluminum outer arena bezel
 * stanchions, `24` lattice copper busbar gantries, `18` cryo-manifold conduits) across the
 * `[0, -360]` double-span using strictly `clearcoat: 0, sheen: 0` PBR/metal materials.
 */
function buildCorridorLabInstancedChildren(
  groupId: string,
  side: -1 | 1
): readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] {
  // 1) Precision CNC outer arena bezel stanchion segment (`24` instances > 16)
  const bezelProfile: V2[] = [
    [-0.22, -0.18],
    [0.22, -0.18],
    [0.26, 0.04],
    [0.14, 0.24],
    [-0.14, 0.24],
    [-0.26, 0.04]
  ];
  const bezelSpec = defineSingleSpec(extrudePolygonMesh(bezelProfile, 3.8, 0.03, false));
  const bezelTransforms: AuraTransformSpec[] = [];
  const busTransforms: AuraTransformSpec[] = [];
  const busColors: string[] = [];
  const tintA = side < 0 ? "#e68653" : "#7cb8dc";
  const tintB = side < 0 ? "#cf6d3a" : "#629ec6";
  for (let i = 0; i < 24; i += 1) {
    const z = -6 - i * 15;
    bezelTransforms.push({
      position: [side * 5.28, 0.34, z],
      rotation: [0, 0, side * -0.12]
    });
    busTransforms.push({
      position: [side * 6.08, 0.82, z - 3.5],
      rotation: [0, 0, 0]
    });
    busColors.push(i % 2 === 0 ? tintA : tintB);
  }

  // 2) Open `latticeTrussMesh` high-current copper busbar gantry (`24` instances > 16)
  const busSpec = defineSingleSpec(
    latticeTrussMesh({ span: [0.28, 0.32, 6.2], bays: 5, chordRadius: 0.024 })
  );

  // 3) Swept cryogenic liquid-helium manifold conduit (`18` instances > 16)
  const cryoSeg = tubeSweepMesh(
    [
      [0, 0, -4.6, 0.068],
      [side * 0.08, 0.12, -1.5, 0.072],
      [side * 0.08, 0.12, 1.5, 0.072],
      [0, 0, 4.6, 0.068]
    ],
    8,
    true
  );
  const cryoSpec = defineSingleSpec(cryoSeg);
  const cryoTransforms: AuraTransformSpec[] = [];
  for (let i = 0; i < 18; i += 1) {
    cryoTransforms.push({
      position: [side * 6.52, 0.44, -9 - i * 20]
    });
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
    instances.custom(cryoSpec, {
      name: `${groupId}-cryo-manifolds`,
      material: MAT_INST_CRYO_MANIFOLD,
      transforms: cryoTransforms,
      castShadow: false,
      receiveShadow: false
    }),
    buildPortalBusbarJunctionNode(`${groupId}-junction-near`, side, -33),
    buildPortalBusbarJunctionNode(`${groupId}-junction-far`, side, -213)
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
  const profile: V2[] = [
    [-0.15, -0.17],
    [0.15, -0.17],
    [0.19, -0.02],
    [0.13, 0.18],
    [-0.13, 0.18],
    [-0.19, -0.02]
  ];
  const body = extrudePolygonMesh(profile, segLen, 0.022, false);
  const collarRing: V2[] = [
    [-0.17, -0.18],
    [0.17, -0.18],
    [0.215, 0],
    [0.15, 0.2],
    [-0.15, 0.2],
    [-0.215, 0]
  ];
  const collar = extrudePolygonMesh(collarRing, 0.12, 0.012, false);
  return rawToMeshData(
    concatRaw([
      body,
      transformMesh(collar, { pos: [0, 0, -segLen * 0.28] }),
      transformMesh(collar, { pos: [0, 0, segLen * 0.28] })
    ])
  );
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
