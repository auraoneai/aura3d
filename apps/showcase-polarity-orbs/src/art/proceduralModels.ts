/**
 * Polarity Orbs (`apps/showcase-polarity-orbs`, `WP-17` / `WP-8`) — Art-Directed Dual-Polarity
 * Magnetosphere Laboratory Procedural Multi-Material Library.
 *
 * Built exclusively on `apps/showcase-port-shared/proceduralKernel.ts` + `@aura3d/engine`
 * with zero `three` imports and zero `.glb` assets:
 * - Hero Magnetic Gyro-Orb (`heroGyroOrbMesh`, `heroGyroCollarNode`, `heroGyroGimbalNode`,
 *   `heroPolarityEmblemMesh`): sleek split-hemisphere glazed ceramic core with lathed equatorial
 *   channel, brushed-titanium trunnion bezel, counter-rotating gimballed plasma + chrome flux
 *   rings, and camera-angled chamfered 3D `+` / `−` polarity emblem.
 * - Copper-Wound Tesla Resonator Coils (`poChargeCoil`): stepped brushed-titanium & basalt plinth,
 *   corrugated glazed porcelain HV insulator stacks (`latheMesh`), multi-turn wound copper
 *   secondary drum, conical primary helical copper busbar (`tubeSweepMesh`), and dual spun-chrome
 *   + glowing plasma toroid top-loads.
 * - Chamfered Red/Silver U-Magnets (`poMagnet` & island monuments): extruded/lofted chamfered
 *   horseshoe magnet yokes (`extrudePolygonMesh` + `loftSectionsMesh`) with crimson `+` & cobalt
 *   `−` lacquered arms, mirror-ground silver/chrome pole shoes, and wound copper exciter coils.
 * - Arched Flux Gates (`buildCorridorArchedFluxGatesNode`): track-spanning twin-rib titanium &
 *   copper parabolic flux arches with ceramic standoffs and split red/blue plasma conduits.
 * - Faceted Basalt & Crystal Floating Islands (`poCrystalIslandB`, `poCrystalIsland`,
 *   `poCrystalRed`, `poCrystalBlue`): cavity-AO volcanic basalt cliffs (`stratifiedCliffMesh`),
 *   copper levitation rings, and flat-faceted hexagonal quartz dipole crystal clusters (`castShadow: false`).
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
  bakeMeshCavityAO,
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
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
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
// 1. Magnetosphere Laboratory Physical Material Palette
// ---------------------------------------------------------------------------

/** Warm oxygen-free wound copper for Tesla secondary drums, helical primaries & exciter coils. */
export const MAT_WOUND_COPPER: AuraMaterialSpec = material.brushedMetal({
  name: "po wound tesla copper",
  color: "#dc7c3e",
  roughness: 0.25,
  anisotropy: 0.9,
  anisotropyRotation: 0,
  envMapIntensity: 1.85,
  emissive: "#c86228",
  emissiveIntensity: 0.08
});

/** Precision CNC-machined anisotropic brushed titanium for gyro channels, bezels & gantries. */
export const MAT_BRUSHED_TITANIUM: AuraMaterialSpec = material.brushedMetal({
  name: "po brushed gyro titanium",
  color: "#cfdbe9",
  roughness: 0.22,
  anisotropy: 0.88,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.8,
  emissive: "#b8cae0",
  emissiveIntensity: 0.04
});

/** Dark anodized silicon-steel structural pedestal & yoke alloy. */
export const MAT_LAMINATED_STEEL: AuraMaterialSpec = material.brushedMetal({
  name: "po laminated steel pedestal",
  color: "#556276",
  roughness: 0.3,
  anisotropy: 0.82,
  anisotropyRotation: 1.5708,
  envMapIntensity: 1.65,
  emissive: "#485468",
  emissiveIntensity: 0.035
});

/** Mirror-ground ferromagnetic silver pole shoes & spun high-voltage corona toroid top-loads. */
export const MAT_POLE_SILVER: AuraMaterialSpec = material.studioMetal({
  name: "po silver pole shoe chrome",
  color: "#edf4fc",
  roughness: 0.12,
  envMapIntensity: 1.95,
  emissive: "#d4e6fa",
  emissiveIntensity: 0.045
});

/** High-voltage glazed white porcelain ceramic for warm-pole HV shed insulators. */
export const MAT_HV_CERAMIC_WHITE: AuraMaterialSpec = material.ceramic({
  name: "po hv glazed white ceramic",
  color: "#eef6ff",
  roughness: 0.16,
  clearcoat: 0.9,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.42,
  emissive: "#dcecff",
  emissiveIntensity: 0.04
});

/** High-voltage glazed ice-cyan porcelain ceramic for cool-pole HV shed insulators. */
export const MAT_HV_CERAMIC_CYAN: AuraMaterialSpec = material.ceramic({
  name: "po hv glazed cyan ceramic",
  color: "#bceeff",
  roughness: 0.16,
  clearcoat: 0.9,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.42,
  emissive: "#9ce2ff",
  emissiveIntensity: 0.045
});

/** Vivid crimson (`+` North) automotive lacquer for U-magnet arms, flux arches & quartz facets. */
export const MAT_NORTH_CRIMSON_LACQUER: AuraMaterialSpec = material.carPaint({
  name: "po north crimson magnet lacquer",
  color: "#e63256",
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.035,
  envMapIntensity: 1.68,
  emissive: "#d6284c",
  emissiveIntensity: 0.06
});

/** Vivid cobalt-cyan (`−` South) automotive lacquer for U-magnet arms, flux arches & quartz facets. */
export const MAT_SOUTH_CYAN_LACQUER: AuraMaterialSpec = material.carPaint({
  name: "po south cyan magnet lacquer",
  color: "#1c92e8",
  roughness: 0.14,
  clearcoat: 0.96,
  clearcoatRoughness: 0.035,
  envMapIntensity: 1.68,
  emissive: "#1682d8",
  emissiveIntensity: 0.06
});

/** Gold capacitor & accent lacquer for flux gate keystones & gyro pivot rings. */
export const MAT_GOLD_LACQUER: AuraMaterialSpec = material.lacquer({
  name: "po gold flux keystone lacquer",
  color: "#f4be42",
  roughness: 0.18,
  clearcoat: 0.92,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.6
});

/** Vulcanized dark elastomer isolator pads under high-voltage pedestals. */
export const MAT_SEISMIC_RUBBER: AuraMaterialSpec = material.blackRubber({
  name: "po seismic isolator rubber",
  color: "#2b3242",
  roughness: 0.78
});

/** Rich volcanic columnar basalt rock for floating islands (never chalky or washed out). */
export const MAT_BASALT_WARM: AuraMaterialSpec = material.matteClay({
  name: "po warm volcanic basalt",
  color: "#382034",
  roughness: 0.84
});

export const MAT_BASALT_COOL: AuraMaterialSpec = material.matteClay({
  name: "po cool volcanic basalt",
  color: "#1b314c",
  roughness: 0.84
});

export const MAT_ISLAND_CAP_WARM: AuraMaterialSpec = material.matteClay({
  name: "po warm basalt terrace cap",
  color: "#523248",
  roughness: 0.76
});

export const MAT_ISLAND_CAP_COOL: AuraMaterialSpec = material.matteClay({
  name: "po cool basalt terrace cap",
  color: "#284c6c",
  roughness: 0.76
});

/** Practical dipole plasma & glowing Tesla corona emissives (`practical: true` for auditArtDirection). */
export const MAT_CRIMSON_PLASMA_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po crimson plasma corona",
  color: "#ff667c",
  emissive: "#ff3b5c",
  emissiveIntensity: 2.9,
  roughness: 0.16,
  practical: true
});

export const MAT_CYAN_PLASMA_EMISSIVE: AuraMaterialSpec = material.emissive({
  name: "po cyan plasma corona",
  color: "#7ae6ff",
  emissive: "#28c4ff",
  emissiveIntensity: 2.9,
  roughness: 0.16,
  practical: true
});

/** Crisp dielectric crystal sheen (`material.physical`, fully opaque faceted crystal prism). */
export const MAT_CRYSTAL_PRISM_WARM: AuraMaterialSpec = material.physical({
  name: "po faceted ruby dipole crystal",
  color: "#ff486a",
  roughness: 0.08,
  metalness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  ior: 1.62,
  envMapIntensity: 1.75,
  emissive: "#ff2e58",
  emissiveIntensity: 0.32
});

export const MAT_CRYSTAL_PRISM_COOL: AuraMaterialSpec = material.physical({
  name: "po faceted sapphire dipole crystal",
  color: "#2ec2ff",
  roughness: 0.08,
  metalness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.04,
  ior: 1.62,
  envMapIntensity: 1.75,
  emissive: "#1caeff",
  emissiveIntensity: 0.32
});

/** Dedicated `clearcoat: 0, sheen: 0` materials for `> 16` corridor `instances.custom` batches. */
export const MAT_INST_BEZEL_ALLOY: AuraMaterialSpec = material.studioMetal({
  name: "po instanced steel bezel pedestal",
  color: "#606e82",
  roughness: 0.28,
  envMapIntensity: 1.65,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_COPPER_BUS: AuraMaterialSpec = material.studioMetal({
  name: "po instanced copper winding busbar",
  color: "#dc7c3e",
  roughness: 0.26,
  envMapIntensity: 1.82,
  emissive: "#c86228",
  emissiveIntensity: 0.08,
  clearcoat: 0,
  sheen: 0
});

export const MAT_INST_CERAMIC_POST: AuraMaterialSpec = material.matteClay({
  name: "po instanced ceramic insulator post",
  color: "#e6f4ff",
  roughness: 0.22,
  clearcoat: 0,
  sheen: 0
});

// ---------------------------------------------------------------------------
// 2. Metric Grounding & Reusable Sculpting Primitives
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
}

function fitGroundedAssembly(
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  targetMaxDim: number
): FittedMultiMatAssembly {
  const b = measureRawBounds(slots.map((s) => s.mesh));
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
  return {
    fittedSlots,
    groupedSpec: buildGroupedGeometrySpec(fittedSlots),
    materials
  };
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
  sheds = 6,
  radialSegs = 18
): RawMesh {
  const profile: V2[] = [[0, 0], [shedR * 0.94, 0], [shedR * 0.94, height * 0.038], [coreR, height * 0.052]];
  const usableH = height * 0.896;
  const baseH = height * 0.052;
  for (let s = 0; s < sheds; s += 1) {
    const y0 = baseH + (s / sheds) * usableH;
    const yMid = baseH + ((s + 0.48) / sheds) * usableH;
    const yTop = baseH + ((s + 0.72) / sheds) * usableH;
    const yNext = baseH + ((s + 1) / sheds) * usableH;
    profile.push(
      [coreR, y0],
      [shedR, yMid],
      [shedR * 0.95, yTop],
      [coreR * 1.02, yNext]
    );
  }
  profile.push([shedR * 0.9, height * 0.962], [shedR * 0.9, height], [0, height]);
  return latheMesh(profile, radialSegs, false);
}

/** Multi-turn polished copper secondary winding drum (`y in [0, height]`) via `latheMesh`. */
export function secondaryCopperWindingMesh(
  radius: number,
  height: number,
  turns = 16,
  radialSegs = 22
): RawMesh {
  const profile: V2[] = [
    [0, 0],
    [radius * 1.08, 0],
    [radius * 1.08, height * 0.036],
    [radius * 0.96, height * 0.05]
  ];
  const yStart = height * 0.05;
  const spanH = height * 0.9;
  for (let i = 0; i < turns; i += 1) {
    const y0 = yStart + (i / turns) * spanH;
    const yCrest = yStart + ((i + 0.5) / turns) * spanH;
    const y1 = yStart + ((i + 1) / turns) * spanH;
    profile.push([radius * 0.962, y0], [radius * 1.038, yCrest], [radius * 0.962, y1]);
  }
  profile.push([radius * 1.08, height * 0.964], [radius * 1.08, height], [0, height]);
  return latheMesh(profile, radialSegs, false);
}

/** Conical primary copper helical busbar cage (`tubeSweepMesh` ascending spiral + standoff risers). */
export function helicalPrimaryCoilMesh(
  baseR: number,
  topR: number,
  y0: number,
  height: number,
  turns = 3.5,
  tubeR = 0.062
): RawMesh {
  const steps = Math.max(24, Math.round(turns * 14));
  const spine: V4[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const ang = t * turns * TAU;
    const r = baseR + (topR - baseR) * t;
    spine.push([Math.cos(ang) * r, y0 + t * height, Math.sin(ang) * r, tubeR]);
  }
  const helix = tubeSweepMesh(spine, 8, false);
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

/** Spun high-voltage toroid top-load (`tubeSweepMesh` + `catmullRomSpline3` closed torus). */
export function spunCoronaToroidMesh(
  majorR: number,
  minorR: number,
  majorSegs = 28,
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

/** Wound toroidal copper field ring in the XZ plane (`majorR`, `minorR`) with 4 clamp saddles. */
export function toroidalFieldRingMesh(
  majorR: number,
  minorR: number,
  majorSegs = 24,
  radialSegs = 10
): { readonly copper: RawMesh; readonly clamps: RawMesh } {
  const copper = spunCoronaToroidMesh(majorR, minorR, majorSegs, radialSegs);
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

/** Hexagonal 6-facet quartz prism spire with sharp pyramidal crown (`y in [0, height]`) via `loftSectionsMesh`. */
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
    mkHex(Math.max(0.012, baseR * 0.03), height, 0.06)
  ];
  return loftSectionsMesh(sections, true, true);
}

/**
 * Sculpted Chamfered Horseshoe U-Magnet sub-assembly (`loftSectionsMesh` rectangular-chamfered
 * arch + `bevelBoxMesh` mirror-ground silver pole shoes + wound copper exciter coils).
 * Centered at `[0, 0, 0]` in XY with arch crown at `+Y` and pole tips pointing `-Y` (or rotated by caller).
 */
export function buildChamferedUMagnetSlots(opts: {
  readonly archRadius: number;
  readonly legLength: number;
  readonly sectionWidth: number;
  readonly sectionDepth: number;
  readonly redMat: number;
  readonly blueMat: number;
  readonly silverMat: number;
  readonly copperMat: number;
  readonly titaniumMat: number;
}): MultiMatSlot[] {
  const R = opts.archRadius;
  const leg = opts.legLength;
  const hw = opts.sectionWidth * 0.5;
  const hd = opts.sectionDepth * 0.5;
  const ch = Math.min(hw, hd) * 0.26;
  const slots: MultiMatSlot[] = [];

  // 8-point chamfered rectangular cross-section in local (u, z) plane
  const localProfile: readonly V2[] = [
    [-hw + ch, -hd],
    [hw - ch, -hd],
    [hw, -hd + ch],
    [hw, hd - ch],
    [hw - ch, hd],
    [-hw + ch, hd],
    [-hw, hd - ch],
    [-hw, -hd + ch]
  ];

  const placeSection = (cx: number, cy: number, nx: number, ny: number): V3[] =>
    localProfile.map(([u, z]) => [cx + nx * u, cy + ny * u, z]);

  // Left half (`x <= 0`, Crimson `+` North arm): straight leg from `-leg` up to `0`, then arch `PI -> PI/2`
  const leftSections: V3[][] = [];
  const tipH = leg * 0.28;
  const legStart = -leg + tipH;
  for (let i = 0; i <= 3; i += 1) {
    const y = legStart + (i / 3) * (-legStart);
    leftSections.push(placeSection(-R, y, 1, 0));
  }
  const archSegs = 12;
  for (let i = 1; i <= archSegs; i += 1) {
    const a = Math.PI - (i / archSegs) * (Math.PI * 0.5);
    const ca = Math.cos(a), sa = Math.sin(a);
    leftSections.push(placeSection(ca * R, sa * R, -ca, -sa));
  }
  slots.push({
    mesh: loftSectionsMesh(leftSections, true, false),
    materialIndex: opts.redMat
  });

  // Right half (`x >= 0`, Cobalt-Cyan `−` South arm): arch `PI/2 -> 0`, then straight leg `0 -> legStart`
  const rightSections: V3[][] = [];
  for (let i = 0; i <= archSegs; i += 1) {
    const a = Math.PI * 0.5 - (i / archSegs) * (Math.PI * 0.5);
    const ca = Math.cos(a), sa = Math.sin(a);
    rightSections.push(placeSection(ca * R, sa * R, ca, sa));
  }
  for (let i = 1; i <= 3; i += 1) {
    const y = (i / 3) * legStart;
    rightSections.push(placeSection(R, y, 1, 0));
  }
  slots.push({
    mesh: loftSectionsMesh(rightSections, true, false),
    materialIndex: opts.blueMat
  });

  // Center brushed-titanium keystone seam clamp at top of arch (`x = 0, y = R`)
  slots.push({
    mesh: transformMesh(
      bevelBoxMesh(opts.sectionWidth * 0.24, opts.sectionWidth * 1.12, opts.sectionDepth * 1.12, ch * 0.45),
      { pos: [0, R, 0] }
    ),
    materialIndex: opts.titaniumMat
  });

  // Mirror-ground silver/chrome chamfered pole shoes + wound copper exciter bobbins on both legs
  for (const side of [-1, 1] as const) {
    const lx = side * R;
    slots.push({
      mesh: transformMesh(
        bevelBoxMesh(opts.sectionWidth * 1.06, tipH * 1.04, opts.sectionDepth * 1.06, ch * 0.8),
        { pos: [lx, -leg + tipH * 0.5, 0] }
      ),
      materialIndex: opts.silverMat
    });
    // Titanium transition collar between painted arm & silver pole shoe
    slots.push({
      mesh: transformMesh(
        bevelBoxMesh(opts.sectionWidth * 1.12, tipH * 0.18, opts.sectionDepth * 1.12, ch * 0.45),
        { pos: [lx, legStart, 0] }
      ),
      materialIndex: opts.titaniumMat
    });
    // Wound copper exciter coil sleeve around mid-leg
    slots.push({
      mesh: transformMesh(
        secondaryCopperWindingMesh(Math.max(hw, hd) * 1.18, leg * 0.36, 8, 18),
        { pos: [lx, legStart + leg * 0.14, 0] }
      ),
      materialIndex: opts.copperMat
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// 3. Hero Gyro-Orb Player Assemblies (`ball`, `ball-collar`, `ball-glass`, `ball-symbol`)
// ---------------------------------------------------------------------------

/**
 * Sleek split-hemisphere glazed ceramic hero gyro-orb (`radius = 0.5`) with a lathed
 * recessed equatorial gyro channel, twin dipole shoulder ridges, and polar cap reliefs.
 */
export function heroGyroOrbMesh(radius = 0.5): MeshData {
  return memoizeGeometry(`po:hero-gyro-orb:${radius.toFixed(3)}`, () => {
    const r = radius;
    const profile: V2[] = [];
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const v = i / steps;
      const theta = -Math.PI * 0.5 + v * Math.PI;
      const y = Math.sin(theta) * r;
      const baseR = Math.cos(theta) * r;
      const eqDist = Math.abs(Math.sin(theta));
      // Recessed equatorial channel (`|y/r| < 0.085`) + twin raised shoulder lips (`|y/r| ~ 0.13`)
      const groove = eqDist < 0.085 ? -0.052 * (1 - eqDist / 0.085) : 0;
      const shoulder = Math.exp(-(((eqDist - 0.135) / 0.038) ** 2)) * 0.018;
      // Subtle polar cap recess (`|y/r| > 0.88`)
      const polarStep = eqDist > 0.88 ? -0.012 * ((eqDist - 0.88) / 0.12) : 0;
      const rad = Math.max(0, baseR * (1 + groove + shoulder + polarStep));
      profile.push([rad, y]);
    }
    return rawToMeshData(latheMesh(profile, 36, false));
  });
}

/**
 * Multi-material Brushed-Titanium Equatorial Gyro Channel & Trunnion Housing (`ball-collar`).
 * Replaces the plain thin ring with a precision lathed titanium channel, glazed ceramic
 * dielectric standoffs, and 4 copper-accented gyro trunnion pivots.
 */
export function buildHeroGyroCollarNode(radius = 0.5): AuraNodeBuilder<AuraSceneNode> {
  const built = memoizeGeometry(`po:hero-gyro-collar:${radius.toFixed(3)}`, () => {
    const r = radius;
    const materials: readonly AuraMaterialSpec[] = [
      MAT_BRUSHED_TITANIUM,       // 0: CNC brushed titanium gyro bezel
      MAT_POLE_SILVER,            // 1: polished chrome trunnion pivots
      MAT_WOUND_COPPER,           // 2: micro copper exciter coils
      MAT_HV_CERAMIC_WHITE        // 3: glazed ceramic insulator rings
    ];
    const slots: MultiMatSlot[] = [];

    // Precision lathed equatorial titanium belt sitting inside & proud of the equatorial channel
    const beltProfile: V2[] = [
      [r * 0.94, -0.052],
      [r * 1.045, -0.044],
      [r * 1.062, -0.018],
      [r * 1.028, 0],
      [r * 1.062, 0.018],
      [r * 1.045, 0.044],
      [r * 0.94, 0.052]
    ];
    slots.push({ mesh: latheMesh(beltProfile, 36, false), materialIndex: 0 });

    // 4 radial gyro trunnion lugs with ceramic bushings & wound copper micro-bobbins
    for (let i = 0; i < 4; i += 1) {
      const ang = (i / 4) * TAU;
      const trunnion = concatRaw([
        transformMesh(bevelBoxMesh(0.085, 0.078, 0.095, 0.016), { pos: [0, 0, r * 1.055] }),
        transformMesh(
          latheMesh([[0, 0], [0.028, 0], [0.028, 0.06], [0, 0.06]], 12, false),
          { rot: [Math.PI * 0.5, 0, 0], pos: [0, 0, r * 1.065] }
        )
      ]);
      slots.push({
        mesh: transformMesh(trunnion, { rot: [0, ang, 0] }),
        materialIndex: i % 2 === 0 ? 1 : 0
      });
      slots.push({
        mesh: transformMesh(
          latheMesh([[0.024, 0], [0.038, 0.006], [0.038, 0.032], [0.024, 0.038]], 12, false),
          { rot: [Math.PI * 0.5, 0, 0], pos: [Math.sin(ang) * r * 1.08, 0, Math.cos(ang) * r * 1.08] }
        ),
        materialIndex: i % 2 === 0 ? 2 : 3
      });
    }

    return { spec: buildGroupedGeometrySpec(slots), materials };
  });

  return geometry
    .multiMaterial(built.spec, built.materials, {
      name: "ball-collar",
      castShadow: false,
      receiveShadow: false
    })
    .runtime({ id: "ball-collar" });
}

/**
 * Gimballed Twin Orthogonal Plasma & Chrome Flux Rings (`ball-glass`).
 * Replaces the milky sphere that washed out the ball's red/blue core with crisp counter-tilted
 * brushed-titanium + crimson/cyan plasma gimbal rings orbiting the hero core (`castShadow: false`).
 */
export function buildHeroGyroGimbalNode(radius = 0.5): AuraNodeBuilder<AuraSceneNode> {
  const built = memoizeGeometry(`po:hero-gyro-gimbal:${radius.toFixed(3)}`, () => {
    const r = radius;
    const materials: readonly AuraMaterialSpec[] = [
      MAT_POLE_SILVER,             // 0: spun chrome outer gimbal ring
      MAT_CRIMSON_PLASMA_EMISSIVE, // 1: crimson north plasma filament ring
      MAT_CYAN_PLASMA_EMISSIVE,    // 2: cyan south plasma filament ring
      MAT_GOLD_LACQUER             // 3: gold gimbal bearing nodes
    ];
    const slots: MultiMatSlot[] = [];

    // Outer chrome gimbal ring tilted +26°
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(r * 1.22, 0.022, 36, 10), {
        rot: [0.45, 0, 0.18]
      }),
      materialIndex: 0
    });
    // Crimson plasma inner flux ring tilted +26°
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(r * 1.175, 0.012, 36, 8), {
        rot: [0.45, 0, 0.18]
      }),
      materialIndex: 1
    });
    // Orthogonal cyan plasma gimbal ring tilted -28°
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(r * 1.26, 0.015, 36, 8), {
        rot: [-0.48, 0.35, -0.22]
      }),
      materialIndex: 2
    });
    // Twin gold gimbal bearing nodes on +/-X
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(subdivideSmoothMesh(bevelBoxMesh(0.055, 0.055, 0.055, 0.015), 1), {
          pos: [sx * r * 1.22, 0, 0]
        }),
        materialIndex: 3
      });
    }

    return { spec: buildGroupedGeometrySpec(slots), materials };
  });

  return geometry
    .multiMaterial(built.spec, built.materials, {
      name: "ball-glass",
      castShadow: false,
      receiveShadow: false
    })
    .runtime({ id: "ball-glass" });
}

/**
 * Crisp 3D beveled `+` / `−` polarity emblem (`heroPolarityEmblemMesh`), pre-pitched toward
 * the chase camera (`0.92 rad` around X) with identical vertex/index counts for `"plus"` and
 * `"minus"` so `Batch.place(..., from)` swaps cleanly with zero allocation.
 */
export function heroPolarityEmblemMesh(kind: "plus" | "minus"): MeshData {
  return memoizeGeometry(`po:polarity-emblem:${kind}`, () => {
    const horiz = bevelBoxMesh(0.38, 0.095, 0.058, 0.018);
    const baseVert = bevelBoxMesh(0.095, 0.38, 0.058, 0.018);
    const vert = kind === "plus" ? baseVert : transformMesh(baseVert, { scale: 0.0001 });
    const haloRing = transformMesh(spunCoronaToroidMesh(0.265, 0.022, 24, 8), {
      rot: [Math.PI * 0.5, 0, 0]
    });
    // Pitch slightly backward (-0.52 rad around X) so the +Z emblem face tilts up toward chase camera at [0, 5.4, 9]
    const combined = transformMesh(concatRaw([horiz, vert, haloRing]), {
      rot: [-0.52, 0, 0]
    });
    return rawToMeshData(combined);
  });
}

// ---------------------------------------------------------------------------
// 4. Multi-Material Magnetosphere Landmark Assemblies
// ---------------------------------------------------------------------------

/**
 * `poChargeCoil` (`5.8 m`, warm `-X`): Copper-Wound Tesla Resonator Coil with stepped
 * brushed-titanium & steel plinth, corrugated white porcelain HV insulators, dense multi-turn
 * copper secondary winding drum, conical helical primary busbar, and dual toroid top-loads.
 */
function buildCrimsonDipoleResonatorAssembly(targetSize = 5.8): FittedMultiMatAssembly {
  return memoizeGeometry(`po:tesla-coil:${targetSize.toFixed(2)}`, () => {
    const materials: readonly AuraMaterialSpec[] = [
      MAT_LAMINATED_STEEL,         // 0: dark steel beveled base
      MAT_BRUSHED_TITANIUM,        // 1: CNC brushed titanium collars & clamps
      MAT_HV_CERAMIC_WHITE,        // 2: glazed white ribbed HV porcelain insulators
      MAT_WOUND_COPPER,            // 3: wound copper secondary drum & primary helix
      MAT_POLE_SILVER,             // 4: spun chrome toroid top-load
      MAT_CRIMSON_PLASMA_EMISSIVE, // 5: glowing crimson corona ring (practical: true)
      MAT_SEISMIC_RUBBER           // 6: seismic elastomer base pads
    ];
    const slots: MultiMatSlot[] = [];

    // Grounded seismic pad + stepped chamfered octagonal steel & titanium pedestal
    slots.push({ mesh: machinedOctagonPlinthMesh(1.42, 0.16, 0.03), materialIndex: 6 });
    slots.push({
      mesh: transformMesh(machinedOctagonPlinthMesh(1.32, 0.38, 0.055), { pos: [0, 0.14, 0] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(machinedOctagonPlinthMesh(1.06, 0.26, 0.042), { pos: [0, 0.5, 0] }),
      materialIndex: 1
    });

    // 4 radial buttresses + 4 perimeter corrugated ceramic HV standoff columns
    for (let i = 0; i < 4; i += 1) {
      const a = (i / 4) * TAU + Math.PI * 0.25;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.24, 0.44, 0.58, 0.038), {
          pos: [Math.cos(a) * 0.98, 0.34, Math.sin(a) * 0.98],
          rot: [0, -a, 0]
        }),
        materialIndex: 0
      });
      slots.push({
        mesh: transformMesh(ceramicInsulatorStackMesh(0.11, 0.21, 0.88, 5, 16), {
          pos: [Math.cos(a) * 0.96, 0.56, Math.sin(a) * 0.96]
        }),
        materialIndex: 2
      });
    }

    // Central HV porcelain insulator stack (`y = 0.74..1.48`)
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.42, 0.68, 0.76, 5, 20), { pos: [0, 0.74, 0] }),
      materialIndex: 2
    });

    // Dense copper-wound secondary resonator drum (`y = 1.48..4.08`)
    slots.push({
      mesh: transformMesh(secondaryCopperWindingMesh(0.52, 2.6, 18, 24), { pos: [0, 1.48, 0] }),
      materialIndex: 3
    });

    // Conical primary helical copper cage + field grading rings
    slots.push({
      mesh: helicalPrimaryCoilMesh(1.18, 0.86, 1.26, 1.18, 3.5, 0.062),
      materialIndex: 3
    });
    for (const [ry, majR, minR] of [
      [2.78, 0.86, 0.078],
      [3.54, 0.8, 0.072]
    ] as const) {
      const ring = toroidalFieldRingMesh(majR, minR, 24, 10);
      slots.push({ mesh: transformMesh(ring.copper, { pos: [0, ry, 0] }), materialIndex: 3 });
      slots.push({ mesh: transformMesh(ring.clamps, { pos: [0, ry, 0] }), materialIndex: 1 });
    }

    // Upper ribbed ceramic HV neck (`y = 4.08..4.78`)
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.3, 0.52, 0.72, 4, 18), { pos: [0, 4.08, 0] }),
      materialIndex: 2
    });

    // Dual spun-chrome toroid top-load + glowing crimson plasma corona ring
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(0.94, 0.25, 28, 14), { pos: [0, 5.02, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(0.62, 0.15, 24, 12), { pos: [0, 5.38, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(1.16, 0.065, 28, 10), { pos: [0, 5.02, 0] }),
      materialIndex: 5
    });

    return fitGroundedAssembly(slots, materials, targetSize);
  });
}

/**
 * `poMagnet` (`6.0 m`, cool `+X`): Sculpted Chamfered Red/Silver/Cyan U-Magnet Monument
 * mounted on a brushed-titanium & ceramic HV resonator pedestal with copper exciter windings.
 */
function buildChamferedUMagnetMonumentAssembly(targetSize = 6.0): FittedMultiMatAssembly {
  return memoizeGeometry(`po:u-magnet-monument:${targetSize.toFixed(2)}`, () => {
    const materials: readonly AuraMaterialSpec[] = [
      MAT_LAMINATED_STEEL,        // 0: steel base plinth
      MAT_BRUSHED_TITANIUM,       // 1: titanium yoke & clamps
      MAT_HV_CERAMIC_CYAN,        // 2: cyan porcelain HV insulators
      MAT_WOUND_COPPER,           // 3: wound copper exciter coils
      MAT_NORTH_CRIMSON_LACQUER,  // 4: crimson (+) magnet arm
      MAT_SOUTH_CYAN_LACQUER,     // 5: cobalt-cyan (-) magnet arm
      MAT_POLE_SILVER,            // 6: mirror-ground silver pole shoes
      MAT_CYAN_PLASMA_EMISSIVE    // 7: plasma arc between pole tips (practical: true)
    ];
    const slots: MultiMatSlot[] = [];

    // Grounded chamfered octagonal steel & titanium pedestal
    slots.push({ mesh: machinedOctagonPlinthMesh(1.48, 0.36, 0.055), materialIndex: 0 });
    slots.push({
      mesh: transformMesh(machinedOctagonPlinthMesh(1.18, 0.24, 0.04), { pos: [0, 0.34, 0] }),
      materialIndex: 1
    });

    // Twin ceramic HV support columns under the magnet cradle
    for (const sx of [-0.78, 0.78] as const) {
      slots.push({
        mesh: transformMesh(ceramicInsulatorStackMesh(0.18, 0.32, 0.86, 5, 16), {
          pos: [sx, 0.56, 0]
        }),
        materialIndex: 2
      });
    }

    // Hero Chamfered Red/Silver/Cyan Horseshoe U-Magnet (poles up like classic lab horseshoe or angled 18° toward track)
    const uMagnetSlots = buildChamferedUMagnetSlots({
      archRadius: 1.08,
      legLength: 1.65,
      sectionWidth: 0.58,
      sectionDepth: 0.52,
      redMat: 4,
      blueMat: 5,
      silverMat: 6,
      copperMat: 3,
      titaniumMat: 1
    });
    // Flip 180° around Z so the curved U-yoke sits in the titanium cradle and the silver pole shoes point skyward with a plasma arc!
    for (const s of uMagnetSlots) {
      slots.push({
        materialIndex: s.materialIndex,
        mesh: transformMesh(s.mesh, { rot: [0.12, 0, Math.PI], pos: [0, 2.68, 0] })
      });
    }

    // Titanium cradle saddle under the U-arch
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.92, 0.28, 0.74, 0.045), { pos: [0, 1.42, 0] }),
      materialIndex: 1
    });

    // Glowing plasma discharge bridge arcing between the two silver pole shoes
    const arcPts = catmullRomSpline3(
      [
        [-0.92, 4.35, 0.08],
        [-0.36, 4.68, 0.12],
        [0.36, 4.68, 0.12],
        [0.92, 4.35, 0.08]
      ],
      6,
      false
    );
    slots.push({
      mesh: tubeSweepMesh(
        arcPts.map((p, idx) => {
          const t = idx / Math.max(1, arcPts.length - 1);
          return [p[0], p[1], p[2], 0.045 + 0.035 * Math.sin(Math.PI * t)];
        }),
        8,
        false
      ),
      materialIndex: 7
    });

    return fitGroundedAssembly(slots, materials, targetSize);
  });
}

/**
 * `poCrystalRed` (`6.6 m`, warm `-X`) & `poCrystalBlue` (`7.0 m`, cool `+X`):
 * Open Faceted Dipole Crystal & Copper Pinch Resonator Cluster (zero milky cylinder wall!).
 */
function buildDipoleCrystalClusterAssembly(
  polarity: "warm" | "cool",
  targetSize: number
): FittedMultiMatAssembly {
  return memoizeGeometry(`po:crystal-cluster:${polarity}:${targetSize.toFixed(2)}`, () => {
    const basaltMat = polarity === "warm" ? MAT_BASALT_WARM : MAT_BASALT_COOL;
    const ceramicMat = polarity === "warm" ? MAT_HV_CERAMIC_WHITE : MAT_HV_CERAMIC_CYAN;
    const crystalMat = polarity === "warm" ? MAT_CRYSTAL_PRISM_WARM : MAT_CRYSTAL_PRISM_COOL;
    const emissiveMat = polarity === "warm" ? MAT_CRIMSON_PLASMA_EMISSIVE : MAT_CYAN_PLASMA_EMISSIVE;

    const materials: readonly AuraMaterialSpec[] = [
      basaltMat,             // 0: faceted dark volcanic basalt base
      MAT_BRUSHED_TITANIUM,  // 1: CNC titanium containment ring & struts
      ceramicMat,            // 2: glazed porcelain HV standoffs
      MAT_WOUND_COPPER,      // 3: wound copper pinch coil
      crystalMat,            // 4: vivid faceted ruby/sapphire quartz spires
      emissiveMat            // 5: glowing central dipole crystal core (practical: true)
    ];
    const slots: MultiMatSlot[] = [];

    // Faceted volcanic basalt outcrop base + cavity AO
    const baseRock = bakeMeshCavityAO(
      stratifiedCliffMesh({
        radiusX: 1.55,
        radiusZ: 1.48,
        height: 1.05,
        terraces: 4,
        seed: polarity === "warm" ? 411 : 419
      }),
      0.28
    );
    slots.push({ mesh: baseRock, materialIndex: 0 });

    // Brushed titanium containment collar + copper toroidal pinch ring
    slots.push({
      mesh: transformMesh(machinedOctagonPlinthMesh(1.24, 0.24, 0.04), { pos: [0, 0.96, 0] }),
      materialIndex: 1
    });
    const pinch = toroidalFieldRingMesh(1.36, 0.095, 24, 10);
    slots.push({ mesh: transformMesh(pinch.copper, { pos: [0, 1.52, 0] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(pinch.clamps, { pos: [0, 1.52, 0] }), materialIndex: 1 });

    // 3 perimeter ceramic HV insulators supporting an upper copper corona ring
    for (let i = 0; i < 3; i += 1) {
      const ang = (i / 3) * TAU + (polarity === "warm" ? 0.2 : -0.2);
      const rx = Math.cos(ang), rz = Math.sin(ang);
      slots.push({
        mesh: transformMesh(ceramicInsulatorStackMesh(0.11, 0.2, 0.72, 4, 14), {
          pos: [rx * 1.18, 1.12, rz * 1.18]
        }),
        materialIndex: 2
      });
    }

    // 7 sharp flat-faceted hexagonal quartz dipole spires erupting cleanly into the dusk air
    const spireSpecs: readonly [number, number, number, number, number, number, boolean][] = [
      [0, 0, 0.42, 3.85, 0.02, -0.02, true],
      [0.52, 0.22, 0.29, 2.95, 0.14, -0.22, false],
      [-0.48, 0.28, 0.31, 3.1, 0.15, 0.2, true],
      [0.2, -0.54, 0.27, 2.68, -0.22, -0.08, false],
      [-0.28, -0.48, 0.25, 2.48, -0.18, 0.14, false],
      [0.64, -0.24, 0.21, 2.05, -0.1, -0.28, false],
      [-0.62, -0.16, 0.22, 2.15, -0.08, 0.26, false]
    ];
    for (const [sx, sz, br, sh, rx, rz, glowing] of spireSpecs) {
      slots.push({
        mesh: transformMesh(toFlatShaded(hexQuartzSpireMesh(br, sh, 0.72)), {
          pos: [sx, 1.08, sz],
          rot: [rx, sx * 0.7, rz]
        }),
        materialIndex: glowing ? 5 : 4
      });
    }

    return fitGroundedAssembly(slots, materials, targetSize);
  });
}

/**
 * `poCrystalIslandB` (`10.5 m`, warm `-X`) & `poCrystalIsland` (`10.5 m`, cool `+X`):
 * Faceted Basalt & Crystal Floating Island crowned with a sculpted Chamfered U-Magnet /
 * Copper Tesla Resonator, hovering copper levitation ring, and vivid quartz spires.
 */
function buildMagnetosphereFloatingIslandAssembly(
  polarity: "warm" | "cool",
  targetSize = 10.5
): FittedMultiMatAssembly {
  return memoizeGeometry(`po:floating-island:${polarity}:${targetSize.toFixed(2)}`, () => {
    const basaltMat = polarity === "warm" ? MAT_BASALT_WARM : MAT_BASALT_COOL;
    const capMat = polarity === "warm" ? MAT_ISLAND_CAP_WARM : MAT_ISLAND_CAP_COOL;
    const crystalMat = polarity === "warm" ? MAT_CRYSTAL_PRISM_WARM : MAT_CRYSTAL_PRISM_COOL;
    const emissiveMat = polarity === "warm" ? MAT_CRIMSON_PLASMA_EMISSIVE : MAT_CYAN_PLASMA_EMISSIVE;
    const ceramicMat = polarity === "warm" ? MAT_HV_CERAMIC_WHITE : MAT_HV_CERAMIC_CYAN;

    const materials: readonly AuraMaterialSpec[] = [
      basaltMat,                  // 0: cavity-AO stratified volcanic basalt cliff & keel
      capMat,                     // 1: upper basalt terrace cap
      MAT_BRUSHED_TITANIUM,       // 2: titanium station ring & magnet yoke
      MAT_WOUND_COPPER,           // 3: copper levitation coil & windings
      crystalMat,                 // 4: faceted ruby/sapphire crystal spires
      emissiveMat,                // 5: glowing dipole spires & corona (practical: true)
      MAT_NORTH_CRIMSON_LACQUER,  // 6: crimson (+) U-magnet arm
      MAT_SOUTH_CYAN_LACQUER,     // 7: cyan (-) U-magnet arm
      MAT_POLE_SILVER,            // 8: silver U-magnet pole shoes & toroid
      ceramicMat                  // 9: ceramic HV insulators
    ];
    const slots: MultiMatSlot[] = [];

    // Tapered faceted volcanic basalt inverted spire keel (`loftSectionsMesh`)
    const keelSegs = 10;
    const keelLevels: readonly [number, number, number][] = [
      [0.08, 0.0, 0.0],
      [0.85, 1.05, 0.12],
      [1.68, 2.25, -0.08],
      [2.42, 3.35, 0.05]
    ];
    const keelRings: V3[][] = keelLevels.map(([rad, y, twist], li) => {
      const ring: V3[] = [];
      for (let i = 0; i < keelSegs; i += 1) {
        const a = (i / keelSegs) * TAU + twist;
        const facetMod = i % 2 === 0 ? 1.06 : 0.9;
        ring.push([Math.cos(a) * rad * facetMod, y, Math.sin(a) * rad * facetMod]);
      }
      void li;
      return ring;
    });
    slots.push({
      mesh: bakeMeshCavityAO(loftSectionsMesh(keelRings, true, true), 0.3),
      materialIndex: 0
    });

    // Stratified columnar basalt upper mesa (`stratifiedCliffMesh`) + beveled terrace cap
    const cliff = bakeMeshCavityAO(
      stratifiedCliffMesh({
        radiusX: 2.68,
        radiusZ: 2.52,
        height: 2.15,
        terraces: 5,
        seed: polarity === "warm" ? 1701 : 1709
      }),
      0.28
    );
    slots.push({ mesh: transformMesh(cliff, { pos: [0, 2.85, 0] }), materialIndex: 0 });
    slots.push({
      mesh: transformMesh(machinedOctagonPlinthMesh(2.25, 0.28, 0.05), { pos: [0, 4.88, 0] }),
      materialIndex: 1
    });

    // Hovering wound-copper toroidal levitation field ring encircling the basalt waist
    const levRing = toroidalFieldRingMesh(3.02, 0.14, 28, 10);
    slots.push({ mesh: transformMesh(levRing.copper, { pos: [0, 3.82, 0] }), materialIndex: 3 });
    slots.push({ mesh: transformMesh(levRing.clamps, { pos: [0, 3.82, 0] }), materialIndex: 2 });

    // Landmark monument atop the island: tilted Chamfered Red/Silver U-Magnet + faceted crystal cluster
    const islandMagnet = buildChamferedUMagnetSlots({
      archRadius: 1.15,
      legLength: 1.45,
      sectionWidth: 0.56,
      sectionDepth: 0.48,
      redMat: 6,
      blueMat: 7,
      silverMat: 8,
      copperMat: 3,
      titaniumMat: 2
    });
    const tiltZ = polarity === "warm" ? -0.24 : 0.24;
    const yawY = polarity === "warm" ? 0.38 : -0.38;
    for (const s of islandMagnet) {
      slots.push({
        materialIndex: s.materialIndex,
        mesh: transformMesh(s.mesh, {
          pos: [polarity === "warm" ? -0.35 : 0.35, 6.85, -0.15],
          rot: [0.08, yawY, tiltZ]
        })
      });
    }

    // Companion Tesla resonator coil & faceted quartz crystal spires on the island terrace
    const coilX = polarity === "warm" ? 1.25 : -1.25;
    slots.push({
      mesh: transformMesh(ceramicInsulatorStackMesh(0.18, 0.32, 0.68, 4, 14), {
        pos: [coilX, 5.12, 0.55]
      }),
      materialIndex: 9
    });
    slots.push({
      mesh: transformMesh(secondaryCopperWindingMesh(0.26, 0.88, 9, 16), {
        pos: [coilX, 5.78, 0.55]
      }),
      materialIndex: 3
    });
    slots.push({
      mesh: transformMesh(spunCoronaToroidMesh(0.42, 0.095, 20, 10), {
        pos: [coilX, 6.76, 0.55]
      }),
      materialIndex: 8
    });

    const islandSpires: readonly [number, number, number, number, number, boolean][] = [
      [-coilX * 0.55, 0.88, 0.44, 2.85, 0.14, true],
      [coilX * 0.85, -0.78, 0.36, 2.35, -0.16, false],
      [0.12, -1.12, 0.32, 2.05, -0.12, true],
      [-coilX * 1.05, -0.62, 0.28, 1.75, 0.18, false]
    ];
    for (const [sx, sz, br, sh, tilt, glowing] of islandSpires) {
      slots.push({
        mesh: transformMesh(toFlatShaded(hexQuartzSpireMesh(br, sh, 0.74)), {
          pos: [sx, 5.08, sz],
          rot: [tilt * 0.5, sx * 0.4, -tilt]
        }),
        materialIndex: glowing ? 5 : 4
      });
    }

    return fitGroundedAssembly(slots, materials, targetSize);
  });
}

// ---------------------------------------------------------------------------
// 5. Arched Flux Gates & Corridor Instanced Batches (`castShadow: false`)
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

/**
 * Sculpted Track-Spanning Arched Flux Gates (`x = -5.15 .. +5.15 m` over the `8 m` deck),
 * tiled every `60 m` across `[0, -360]` so `SPAN = 180` wraps seamlessly (`castShadow: false`).
 */
function buildCorridorArchedFluxGatesNode(groupId: string): AuraNodeBuilder<AuraSceneNode> {
  const built = memoizeGeometry("po:corridor-arched-flux-gates", () => {
    const materials: readonly AuraMaterialSpec[] = [
      MAT_LAMINATED_STEEL,         // 0: pedestal plinths
      MAT_BRUSHED_TITANIUM,        // 1: chamfered parabolic arch girder
      MAT_WOUND_COPPER,            // 2: copper exciter collars
      MAT_HV_CERAMIC_WHITE,        // 3: HV porcelain standoffs
      MAT_NORTH_CRIMSON_LACQUER,   // 4: left (+ warm) flux conduit trim
      MAT_SOUTH_CYAN_LACQUER,      // 5: right (- cool) flux conduit trim
      MAT_CRIMSON_PLASMA_EMISSIVE, // 6: left crimson inner plasma arc (practical: true)
      MAT_CYAN_PLASMA_EMISSIVE,    // 7: right cyan inner plasma arc (practical: true)
      MAT_GOLD_LACQUER             // 8: crown dipole keystone capacitor
    ];

    // Build one single Arched Flux Gate centered at z = 0
    const singleGateSlots: MultiMatSlot[] = [];
    const spanR = 5.18;
    const springY = 0.85;
    const archRise = 4.65;

    // Chamfered octagonal girder cross-section
    const girder2D: readonly V2[] = [
      [-0.18, -0.22],
      [0.18, -0.22],
      [0.24, -0.06],
      [0.24, 0.06],
      [0.18, 0.22],
      [-0.18, 0.22],
      [-0.24, 0.06],
      [-0.24, -0.06]
    ];
    const archSegs = 24;
    const girderRings: V3[][] = [];
    const leftPlasmaPts: V4[] = [];
    const rightPlasmaPts: V4[] = [];

    for (let i = 0; i <= archSegs; i += 1) {
      const t = i / archSegs;
      const a = Math.PI * (1 - t);
      const cx = Math.cos(a) * spanR;
      const cy = springY + Math.sin(a) * archRise;
      const nx = Math.cos(a);
      const ny = Math.sin(a);
      girderRings.push(girder2D.map(([u, z]) => [cx + nx * u, cy + ny * u, z]));

      const px = Math.cos(a) * (spanR - 0.3);
      const py = springY + Math.sin(a) * (archRise - 0.3);
      if (i <= archSegs / 2) leftPlasmaPts.push([px, py, 0, 0.068]);
      if (i >= archSegs / 2) rightPlasmaPts.push([px, py, 0, 0.068]);
    }
    singleGateSlots.push({ mesh: loftSectionsMesh(girderRings, true, false), materialIndex: 1 });
    singleGateSlots.push({ mesh: tubeSweepMesh(leftPlasmaPts, 8, false), materialIndex: 6 });
    singleGateSlots.push({ mesh: tubeSweepMesh(rightPlasmaPts, 8, false), materialIndex: 7 });

    // Copper exciter collars along the arch + crown keystone capacitor
    for (const frac of [0.16, 0.34, 0.66, 0.84] as const) {
      const a = Math.PI * (1 - frac);
      const cx = Math.cos(a) * spanR;
      const cy = springY + Math.sin(a) * archRise;
      singleGateSlots.push({
        mesh: transformMesh(bevelBoxMesh(0.58, 0.34, 0.58, 0.05), {
          pos: [cx, cy, 0],
          rot: [0, 0, a - Math.PI * 0.5]
        }),
        materialIndex: 2
      });
    }
    singleGateSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.68, 0.62, 0.64, 0.08), {
        pos: [0, springY + archRise + 0.04, 0]
      }),
      materialIndex: 8
    });

    // Left & right stepped steel pedestals + ceramic insulators + polarity lacquer shrouds
    for (const side of [-1, 1] as const) {
      const px = side * spanR;
      singleGateSlots.push({
        mesh: transformMesh(machinedOctagonPlinthMesh(0.68, 0.42, 0.05), { pos: [px, 0, 0] }),
        materialIndex: 0
      });
      singleGateSlots.push({
        mesh: transformMesh(ceramicInsulatorStackMesh(0.24, 0.4, 0.54, 4, 14), { pos: [px, 0.38, 0] }),
        materialIndex: 3
      });
      singleGateSlots.push({
        mesh: transformMesh(bevelBoxMesh(0.62, 0.46, 0.62, 0.06), { pos: [px, 0.86, 0] }),
        materialIndex: side < 0 ? 4 : 5
      });
    }

    // Tile at z = -32, -92, -152 and -212, -272, -332 (exact 180m period!)
    const tiledSlots: MultiMatSlot[] = [];
    for (const zGate of [-32, -92, -152, -212, -272, -332] as const) {
      for (const s of singleGateSlots) {
        tiledSlots.push({
          materialIndex: s.materialIndex,
          mesh: transformMesh(s.mesh, { pos: [0, -0.12, zGate] })
        });
      }
    }

    return { spec: buildGroupedGeometrySpec(tiledSlots), materials };
  });

  return geometry.multiMaterial(built.spec, built.materials, {
    name: `${groupId}-flux-gates`,
    castShadow: false,
    receiveShadow: false
  });
}

/**
 * Batches outer arena rim bezel segments, brushed steel pylon pedestals, copper secondary
 * windings + busbar gantries, and ribbed ceramic insulator posts into 3 `instances.custom`
 * draw calls (`24` instances each) across `[0, -360]` (`castShadow: false`).
 */
function buildCorridorLabInstancedChildren(
  groupId: string,
  side: -1 | 1
): readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] {
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
    transformMesh(machinedOctagonPlinthMesh(0.5, 0.32, 0.04), { pos: [side * 0.68, -0.26, 0] })
  ]);
  const bezelSpec = defineSingleSpec(steelPedestalAndRim);

  const copperPylonAndBus = concatRaw([
    transformMesh(secondaryCopperWindingMesh(0.23, 0.9, 9, 14), { pos: [0, 0.42, 0] }),
    transformMesh(spunCoronaToroidMesh(0.38, 0.078, 18, 8), { pos: [0, 1.44, 0] }),
    transformMesh(
      latticeTrussMesh({ span: [0.22, 0.24, 5.2], bays: 4, chordRadius: 0.02 }),
      { pos: [0, 0.56, -2.6] }
    )
  ]);
  const busSpec = defineSingleSpec(copperPylonAndBus);
  const insulatorSpec = defineSingleSpec(ceramicInsulatorStackMesh(0.15, 0.28, 0.62, 4, 14));

  const bezelTransforms: AuraTransformSpec[] = [];
  const busTransforms: AuraTransformSpec[] = [];
  const insulatorTransforms: AuraTransformSpec[] = [];
  const busColors: string[] = [];
  const insulatorColors: string[] = [];
  const copperA = "#de834b";
  const copperB = "#cf723c";
  const ceramicPrimary = side < 0 ? "#eef6ff" : "#bceeff";
  const ceramicAlt = side < 0 ? "#dceeff" : "#d0f4ff";

  for (let i = 0; i < 24; i += 1) {
    const z = -6 - i * 15;
    bezelTransforms.push({ position: [side * 5.24, 0.34, z] });
    busTransforms.push({ position: [side * 5.92, 0.42, z] });
    insulatorTransforms.push({ position: [side * 5.92, 0.26, z] });
    busColors.push(i % 2 === 0 ? copperA : copperB);
    insulatorColors.push(i % 2 === 0 ? ceramicPrimary : ceramicAlt);
  }

  const out: (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] = [
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
      material: MAT_INST_CERAMIC_POST,
      transforms: insulatorTransforms,
      colors: insulatorColors,
      castShadow: false,
      receiveShadow: false
    })
  ];

  if (side < 0) {
    out.push(buildCorridorArchedFluxGatesNode(groupId));
  }

  return out;
}

function resolveAssemblyForKind(kind: BackdropAssetKind, targetSize: number): FittedMultiMatAssembly {
  switch (kind) {
    case "poChargeCoil":
      return buildCrimsonDipoleResonatorAssembly(targetSize);
    case "poMagnet":
      return buildChamferedUMagnetMonumentAssembly(targetSize);
    case "poCrystalRed":
      return buildDipoleCrystalClusterAssembly("warm", targetSize);
    case "poCrystalBlue":
      return buildDipoleCrystalClusterAssembly("cool", targetSize);
    case "poCrystalIslandB":
      return buildMagnetosphereFloatingIslandAssembly("warm", targetSize);
    case "poCrystalIsland":
      return buildMagnetosphereFloatingIslandAssembly("cool", targetSize);
  }
}

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
      side < 0 ? MAT_HV_CERAMIC_WHITE : MAT_HV_CERAMIC_CYAN,
      MAT_WOUND_COPPER,
      side < 0 ? MAT_CRIMSON_PLASMA_EMISSIVE : MAT_CYAN_PLASMA_EMISSIVE
    ],
    {
      position: [side * 5.85, 0.22, zPos],
      castShadow: false,
      receiveShadow: false
    }
  );
}

/**
 * Builds one scrolling runtime `group(groupSpec.id, ...).runtime({ id: groupSpec.id })`
 * mounting all double-span multi-material landmarks + arched flux gates + corridor
 * `instances.custom` hardware batches (`castShadow: false` on all distant/backdrop geometry).
 */
export function buildBackdropGroupNode(groupSpec: BackdropGroupSpec): GroupBuilder {
  const assembly = resolveAssemblyForKind(groupSpec.kind, groupSpec.size);
  const children: (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[] = [];

  const batchedSlots: MultiMatSlot[] = [];
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

  if (groupSpec.kind === "poChargeCoil" || groupSpec.kind === "poMagnet") {
    children.push(...buildCorridorLabInstancedChildren(groupSpec.id, groupSpec.side));
  }

  return group(groupSpec.id, children).runtime({ id: groupSpec.id });
}

// ---------------------------------------------------------------------------
// 6. Gameplay & Trackside Procedural `MeshData` Builders (`world.ts` Batches)
// ---------------------------------------------------------------------------

/**
 * Precision CNC-machined titanium & ferromagnetic arena bezel rail segment (`Z in [-segLen/2, +segLen/2]`)
 * with chamfered octagonal containment profile and twin clamp collars.
 */
export function arenaBezelRailMesh(segLen = 2): MeshData {
  return memoizeGeometry(`po:arena-bezel:${segLen.toFixed(2)}`, () => {
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
  });
}

/**
 * Lathe-turned dipole collector orb (`radius = 0.45`) with recessed equatorial coil groove
 * and twin toroidal stator shoulders so `plasmaOrbSpec` highlights machined relief.
 */
export function dipoleCollectorOrbMesh(radius = 0.45): MeshData {
  return memoizeGeometry(`po:collector-orb:${radius.toFixed(3)}`, () => {
    const r = radius;
    const profile: V2[] = [
      [0, -r],
      [r * 0.46, -r * 0.9],
      [r * 0.82, -r * 0.58],
      [r * 1.0, -r * 0.22],
      [r * 0.9, -r * 0.065],
      [r * 0.9, r * 0.065],
      [r * 1.0, r * 0.22],
      [r * 0.82, r * 0.58],
      [r * 0.46, r * 0.9],
      [0, r]
    ];
    return rawToMeshData(latheMesh(profile, 20, false));
  });
}

/**
 * Multi-facet octagonal crown-cut brilliant power-up prism gem (`radius = 0.4`, `y in [-1.3r, +1.3r]`)
 * with sharp flat-shaded facets (`toFlatShaded(latheMesh(..., 8))`).
 */
export function crownPrismGemMesh(radius = 0.4): MeshData {
  return memoizeGeometry(`po:crown-gem:${radius.toFixed(3)}`, () => {
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
  });
}

/** Unused Bezier export reference helper kept for smooth horseshoe yoke profiling. */
export const magnetProfileBezier = bezierCurve2;
