/**
 * WP-26: Saltwind Highway (`roadster-hours-port`) — Procedural Multi-Material Models.
 *
 * Builds sculpted, multi-material `@aura3d/engine` procedural assemblies on `proceduralKernel.ts`:
 *   - 8 distinct smooth-normal lofted highway traffic classes (`sedan`, `hatch`, `suv`,
 *     `pickup`, `bus`, `boxtruck`, `semi`, `tanker`) with separated paint, chrome trim,
 *     4-part wheel tires, cabin glass, headlamps, taillamps, and lightweight `-far` LODs.
 *   - Striped headland lighthouse (`latheMesh` masonry shaft + `assembleMultiMaterialNode`
 *     crimson bands, corbelled bronze gallery, `material.physical` Fresnel lantern glass,
 *     glowing dioptric lens drum, and verdigris copper dome).
 *   - Arched stone coastal viaduct (`archwayVoussoirSlots`), Art-Deco streamline roadside
 *     diner & neon pylon sign, steel `latticeTrussMesh` suspension bridge towers & masts,
 *     tapered wind turbines with twisted airfoil rotor blades, curved date palms, wind-swept
 *     coastal umbrella pines (`coniferBoughTierMesh` + `layeredCanopyMesh`), Mediterranean
 *     villas & townhouses, faceted boulders (`icosphereFacetMesh`), and terraced sea-stacks,
 *     mesas, hoodoos & natural arches (`stratifiedCliffMesh`).
 */
import {
  geometry,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  bezierCurve2,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  latticeTrussMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  toFlatShaded,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";

export interface ProceduralGroupGeometry {
  readonly positions: Float32Array;
  readonly normals: Float32Array;
  readonly uvs: Float32Array;
  readonly indices: Uint32Array;
}

export type ProceduralTrafficKey =
  | "sedan"
  | "hatch"
  | "suv"
  | "pickup"
  | "bus"
  | "boxtruck"
  | "semi"
  | "tanker";

export const PROCEDURAL_TRAFFIC_KEYS: readonly ProceduralTrafficKey[] = [
  "sedan",
  "hatch",
  "suv",
  "pickup",
  "bus",
  "boxtruck",
  "semi",
  "tanker"
];

export interface ProceduralTrafficVehicle {
  readonly paint: ProceduralGroupGeometry;
  readonly trim: ProceduralGroupGeometry;
  readonly tires: ProceduralGroupGeometry;
  readonly glass: ProceduralGroupGeometry;
  readonly head: ProceduralGroupGeometry;
  readonly tail: ProceduralGroupGeometry;
  readonly lod: ProceduralGroupGeometry;
}

// ---------------------------------------------------------------------------
// Physical Multi-Material Palette (`>= 8` distinct `@aura3d/engine` presets)
// ---------------------------------------------------------------------------

export function createSaltwindMaterialPalette() {
  const britishRacingTeal = material.carPaint({
    color: "#1b5e63",
    roughness: 0.14,
    metallic: 0.62,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.35
  });
  return {
    // Hero & architectural finish presets (deep coastal British-racing teal `#1b5e63` `material.carPaint`)
    roadsterTeal: britishRacingTeal,
    roadsterCrimson: britishRacingTeal,
    trafficCarPaint: material.carPaint({
      color: "#ffffff",
      roughness: 0.2,
      metallic: 0.58,
      clearcoat: 0.92,
      clearcoatRoughness: 0.05
    }),
    trafficFarPaint: material.pbr({
      color: "#ffffff",
      roughness: 0.3,
      metallic: 0.38,
      clearcoat: 0,
      sheen: 0
    }),
    ivoryLacquer: material.lacquer({
      color: "#f8fafc",
      roughness: 0.1,
      clearcoat: 1,
      clearcoatRoughness: 0.03
    }),
    mahoganyWood: material.lacquer({
      color: "#6e3318",
      roughness: 0.22,
      clearcoat: 0.92,
      clearcoatRoughness: 0.05
    }),
    anisotropicChrome: material.brushedMetal({
      color: "#e8eff7",
      roughness: 0.12,
      anisotropy: 0.88,
      anisotropyRotation: 1.5708
    }),
    machinedAlloy: material.studioMetal({
      color: "#b7c2cf",
      roughness: 0.22
    }),
    tanQuiltedLeather: material.fabric({
      color: "#b87644",
      roughness: 0.62,
      sheen: 0.78,
      sheenColor: "#f0c69e",
      sheenRoughness: 0.48
    }),
    charcoalCabinFabric: material.fabric({
      color: "#1b1918",
      roughness: 0.82,
      sheen: 0.32
    }),
    windshieldGlass: material.studioGlass({
      color: "#1b2834",
      tint: "#233646",
      attenuationColor: "#172532",
      attenuationDistance: 0.85,
      roughness: 0.05,
      opacity: 0.42,
      transmission: 0.52,
      thickness: 0.28,
      ior: 1.5,
      clearcoat: 0.45,
      clearcoatRoughness: 0.05,
      envMapIntensity: 0.78
    }),
    trafficCabinGlass: material.physical({
      color: "#9bc7dc",
      roughness: 0.06,
      opacity: 0.46,
      clearcoat: 1,
      ior: 1.5
    }),
    tireRubber: material.blackRubber({
      color: "#111318",
      roughness: 0.92
    }),
    headlampGlow: material.glowingEmissive({
      color: "#fff4d4",
      emissive: "#ffe4a8",
      emissiveIntensity: 2.2
    }),
    taillampRuby: material.glowingEmissive({
      color: "#5c0810",
      emissive: "#e81922",
      emissiveIntensity: 2.1
    }),
    fresnelBeaconGold: material.glowingEmissive({
      color: "#fff4d2",
      emissive: "#ffd573",
      emissiveIntensity: 4.8
    }),
    dinerNeonCoral: material.emissive({
      color: "#ff5c77",
      emissive: "#ff4868",
      emissiveIntensity: 3.6
    }),
    dinerNeonTeal: material.emissive({
      color: "#3ef0e4",
      emissive: "#28dfd3",
      emissiveIntensity: 3.2
    }),
    dinerSeafoamEnamel: material.ceramic({
      color: "#cde7df",
      roughness: 0.18,
      clearcoat: 0.82,
      clearcoatRoughness: 0.06
    }),
    dinerWarmCream: material.ceramic({
      color: "#f5ede0",
      roughness: 0.22,
      clearcoat: 0.74,
      clearcoatRoughness: 0.08
    }),
    lighthouseCrimson: material.clearcoatPaint({
      color: "#b41f24",
      roughness: 0.22,
      metallic: 0.06,
      clearcoat: 0.78,
      clearcoatRoughness: 0.08
    }),
    verdigrisCopper: material.matteClay({
      color: "#4e8b7b",
      roughness: 0.68
    }),
    limestoneWarm: material.matteClay({
      color: "#ddd2be",
      roughness: 0.88
    }),
    sandstoneKey: material.matteClay({
      color: "#c7b394",
      roughness: 0.86
    }),
    viaductIron: material.studioMetal({
      color: "#333942",
      roughness: 0.42
    }),
    suspensionRedSteel: material.clearcoatPaint({
      color: "#b83a28",
      roughness: 0.32,
      metallic: 0.28,
      clearcoat: 0.55,
      clearcoatRoughness: 0.14
    }),
    // Instanced batch materials (`> 16` instances -> strictly clearcoat: 0, sheen: 0)
    instancedStucco: material.pbr({ color: "#efe6d5", roughness: 0.84, metallic: 0, clearcoat: 0, sheen: 0 }),
    instancedTownStucco: material.pbr({ color: "#e8dcc8", roughness: 0.82, metallic: 0, clearcoat: 0, sheen: 0 }),
    instancedTerracotta: material.pbr({ color: "#b95739", roughness: 0.76, metallic: 0.02, clearcoat: 0, sheen: 0 }),
    instancedShutters: material.pbr({ color: "#3d7a74", roughness: 0.64, metallic: 0.05, clearcoat: 0, sheen: 0 }),
    instancedPalmFronds: material.pbr({ color: "#4d7c43", roughness: 0.78, metallic: 0, doubleSided: true, clearcoat: 0, sheen: 0 }),
    instancedPineNeedles: material.pbr({ color: "#2d6a42", roughness: 0.8, metallic: 0, clearcoat: 0, sheen: 0 }),
    instancedCypressNeedles: material.pbr({ color: "#235c3b", roughness: 0.82, metallic: 0, clearcoat: 0, sheen: 0 }),
    instancedTreeBark: material.pbr({ color: "#6c513c", roughness: 0.92, metallic: 0, clearcoat: 0, sheen: 0 }),
    instancedGranite: material.pbr({ color: "#8e887e", roughness: 0.92, metallic: 0.02, clearcoat: 0, sheen: 0 }),
    instancedTurbineSteel: material.pbr({ color: "#ecebe6", roughness: 0.42, metallic: 0.16, clearcoat: 0, sheen: 0 }),
    instancedGalvanizedTruss: material.metal({ color: "#95a2af", roughness: 0.36, metallic: 0.82, clearcoat: 0, sheen: 0 }),
    instancedArcologyBody: material.pbr({ color: "#cfd9e5", roughness: 0.44, metallic: 0.32, clearcoat: 0, sheen: 0 }),
    instancedArcologyGlass: material.metal({ color: "#5889b0", roughness: 0.16, metallic: 0.88, clearcoat: 0, sheen: 0 })
  };
}

// ---------------------------------------------------------------------------
// Geometry Merging & Unit-Space Normalization Helpers
// ---------------------------------------------------------------------------

function combineRaw(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const p of parts) {
    const vOff = positions.length / 3;
    for (let i = 0; i < p.positions.length; i += 1) positions.push(p.positions[i]!);
    for (let i = 0; i < p.normals.length; i += 1) normals.push(p.normals[i]!);
    for (let i = 0; i < p.uvs.length; i += 1) uvs.push(p.uvs[i]!);
    for (let i = 0; i < p.indices.length; i += 1) indices.push(p.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

export function toGroupGeometry(raw: RawMesh): ProceduralGroupGeometry {
  return {
    positions: Float32Array.from(raw.positions),
    normals: Float32Array.from(raw.normals),
    uvs: raw.uvs.length === (raw.positions.length / 3) * 2
      ? Float32Array.from(raw.uvs)
      : new Float32Array((raw.positions.length / 3) * 2),
    indices: Uint32Array.from(raw.indices)
  };
}

export function toEngineGeometrySpec(raw: RawMesh): AuraCustomGeometrySpec {
  return mergeRawMeshes([raw]);
}

function measureRawBounds(meshes: readonly RawMesh[]): { min: [number, number, number]; max: [number, number, number] } {
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
  if (!Number.isFinite(minX)) return { min: [-0.5, -0.5, -0.5], max: [0.5, 0.5, 0.5] };
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Normalizes a family of vehicle sub-meshes into a shared `[-0.5, +0.5]^3` box (front at `-Z`). */
function normalizeVehicleFamily<K extends string>(parts: Readonly<Record<K, RawMesh>>): Record<K, RawMesh> {
  const keys = Object.keys(parts) as K[];
  const b = measureRawBounds(keys.map((k) => parts[k]));
  const sx = 1 / Math.max(1e-4, b.max[0] - b.min[0]);
  const sy = 1 / Math.max(1e-4, b.max[1] - b.min[1]);
  const sz = 1 / Math.max(1e-4, b.max[2] - b.min[2]);
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cy = (b.min[1] + b.max[1]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  const out = {} as Record<K, RawMesh>;
  for (const k of keys) {
    const centered = transformMesh(parts[k], { pos: [-cx, -cy, -cz] });
    out[k] = transformMesh(centered, { scale: [sx, sy, sz] });
  }
  return out;
}

/** Normalizes a scenery prop family so `y in [0, 1]` (grounded at `y = 0`) and `x, z` scale proportionally by `1 / height`. */
function normalizePropFamily<K extends string>(parts: Readonly<Record<K, RawMesh>>): Record<K, RawMesh> {
  const keys = Object.keys(parts) as K[];
  const b = measureRawBounds(keys.map((k) => parts[k]));
  const h = Math.max(1e-4, b.max[1] - b.min[1]);
  const s = 1 / h;
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  const out = {} as Record<K, RawMesh>;
  for (const k of keys) {
    const shifted = transformMesh(parts[k], { pos: [-cx, -b.min[1], -cz] });
    out[k] = transformMesh(shifted, { scale: [s, s, s] });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Smooth-Normal Lofted Traffic Vehicle Sub-Builders (`[-0.5, +0.5]^3`)
// ---------------------------------------------------------------------------

interface CarStation {
  readonly z: number;
  readonly hw: number;
  readonly botY: number;
  readonly beltY: number;
  readonly roofW: number;
  readonly roofY: number;
}

/** 12-point closed cross-section ring around Z for smooth `loftSectionsMesh` car hulls. */
function carRing(st: CarStation): V3[] {
  const { z, hw, botY, beltY, roofW, roofY } = st;
  const midY = botY + (beltY - botY) * 0.45;
  const shW = hw * 0.94;
  return [
    [0, roofY, z],
    [roofW * 0.62, roofY * 0.99 + beltY * 0.01, z],
    [roofW, roofY * 0.92 + beltY * 0.08, z],
    [shW, beltY, z],
    [hw, midY, z],
    [hw * 0.88, botY, z],
    [0, botY - 0.015, z],
    [-hw * 0.88, botY, z],
    [-hw, midY, z],
    [-shW, beltY, z],
    [-roofW, roofY * 0.92 + beltY * 0.08, z],
    [-roofW * 0.62, roofY * 0.99 + beltY * 0.01, z]
  ];
}

function appendWheelAxles(
  tiresOut: RawMesh[],
  trimOut: RawMesh[],
  trackX: number,
  wheelY: number,
  axleZs: readonly number[],
  radius: number,
  width: number,
  spokeCount = 6
): void {
  const slots = wheelAssemblySlots({ radius, width, spokeCount, tireMat: 0, rimMat: 1, rotorMat: 1 });
  const tireUnit = combineRaw(slots.filter((s) => s.materialIndex === 0).map((s) => s.mesh));
  const rimUnit = combineRaw(slots.filter((s) => s.materialIndex === 1).map((s) => s.mesh));
  for (const z of axleZs) {
    for (const sx of [-1, 1] as const) {
      tiresOut.push(transformMesh(tireUnit, { pos: [sx * trackX, wheelY, z] }));
      trimOut.push(transformMesh(rimUnit, { pos: [sx * trackX, wheelY, z] }));
    }
  }
}

function buildPassengerTrafficRaw(style: "sedan" | "hatch" | "suv" | "pickup"): Record<keyof ProceduralTrafficVehicle, RawMesh> {
  const paint: RawMesh[] = [];
  const trim: RawMesh[] = [];
  const tires: RawMesh[] = [];
  const glass: RawMesh[] = [];
  const head: RawMesh[] = [];
  const tail: RawMesh[] = [];

  const isConvertible = style === "sedan";
  const isHatch = style === "hatch";
  const isSuv = style === "suv";
  const isPickup = style === "pickup";

  const stations: CarStation[] = isConvertible
    ? [
        { z: -2.2, hw: 0.72, botY: 0.24, beltY: 0.56, roofW: 0.52, roofY: 0.62 },
        { z: -1.65, hw: 0.92, botY: 0.2, beltY: 0.72, roofW: 0.74, roofY: 0.8 },
        { z: -0.68, hw: 0.94, botY: 0.18, beltY: 0.78, roofW: 0.78, roofY: 0.84 },
        { z: 0.12, hw: 0.93, botY: 0.18, beltY: 0.76, roofW: 0.76, roofY: 0.72 },
        { z: 0.95, hw: 0.95, botY: 0.19, beltY: 0.8, roofW: 0.78, roofY: 0.86 },
        { z: 1.85, hw: 0.9, botY: 0.22, beltY: 0.78, roofW: 0.72, roofY: 0.83 },
        { z: 2.2, hw: 0.78, botY: 0.28, beltY: 0.7, roofW: 0.62, roofY: 0.75 }
      ]
    : isHatch
    ? [
        { z: -2.0, hw: 0.74, botY: 0.24, beltY: 0.58, roofW: 0.54, roofY: 0.65 },
        { z: -1.35, hw: 0.9, botY: 0.2, beltY: 0.75, roofW: 0.74, roofY: 0.84 },
        { z: -0.45, hw: 0.92, botY: 0.19, beltY: 0.84, roofW: 0.7, roofY: 1.32 },
        { z: 0.65, hw: 0.92, botY: 0.19, beltY: 0.86, roofW: 0.68, roofY: 1.3 },
        { z: 1.55, hw: 0.88, botY: 0.22, beltY: 0.84, roofW: 0.64, roofY: 1.06 },
        { z: 1.98, hw: 0.8, botY: 0.28, beltY: 0.76, roofW: 0.58, roofY: 0.82 }
      ]
    : isSuv
    ? [
        { z: -2.28, hw: 0.82, botY: 0.28, beltY: 0.72, roofW: 0.66, roofY: 0.82 },
        { z: -1.45, hw: 0.98, botY: 0.25, beltY: 0.92, roofW: 0.82, roofY: 0.98 },
        { z: -0.62, hw: 1.0, botY: 0.24, beltY: 0.98, roofW: 0.78, roofY: 1.58 },
        { z: 1.25, hw: 1.0, botY: 0.24, beltY: 0.98, roofW: 0.78, roofY: 1.56 },
        { z: 2.15, hw: 0.94, botY: 0.27, beltY: 0.95, roofW: 0.74, roofY: 1.48 },
        { z: 2.32, hw: 0.86, botY: 0.32, beltY: 0.88, roofW: 0.68, roofY: 1.22 }
      ]
    : [
        { z: -2.4, hw: 0.84, botY: 0.28, beltY: 0.74, roofW: 0.68, roofY: 0.84 },
        { z: -1.5, hw: 1.0, botY: 0.25, beltY: 0.94, roofW: 0.84, roofY: 1.0 },
        { z: -0.65, hw: 1.02, botY: 0.24, beltY: 0.98, roofW: 0.78, roofY: 1.58 },
        { z: 0.32, hw: 1.02, botY: 0.24, beltY: 0.98, roofW: 0.78, roofY: 1.56 },
        { z: 0.42, hw: 1.0, botY: 0.24, beltY: 0.96, roofW: 0.86, roofY: 0.98 },
        { z: 2.28, hw: 0.98, botY: 0.27, beltY: 0.94, roofW: 0.84, roofY: 0.96 },
        { z: 2.42, hw: 0.9, botY: 0.32, beltY: 0.88, roofW: 0.78, roofY: 0.9 }
      ];

  paint.push(loftSectionsMesh(stations.map(carRing), true, false));

  // Glass greenhouse / raked windshield
  if (isConvertible) {
    glass.push(transformMesh(bevelBoxMesh(1.42, 0.34, 0.08, 0.02), { pos: [0, 0.98, -0.58], rot: [-0.52, 0, 0] }));
    trim.push(transformMesh(bevelBoxMesh(1.48, 0.05, 0.06, 0.015), { pos: [0, 1.13, -0.49], rot: [-0.52, 0, 0] }));
    // Twin roll hoops behind open seats
    for (const sx of [-1, 1] as const) {
      trim.push(transformMesh(latheMesh([[0.08, 0], [0.1, 0.2], [0.04, 0.24]], 10), { pos: [sx * 0.36, 0.82, 0.56] }));
    }
  } else {
    const cabZ = isPickup ? -0.18 : 0.28;
    const cabLen = isPickup ? 1.05 : isHatch ? 1.72 : 2.45;
    const cabY = isHatch ? 1.08 : 1.28;
    glass.push(transformMesh(bevelBoxMesh(1.56, 0.44, cabLen, 0.05), { pos: [0, cabY, cabZ] }));
  }

  if (isHatch) {
    paint.push(transformMesh(bevelBoxMesh(1.36, 0.07, 0.24, 0.02), { pos: [0, 1.32, 1.48], rot: [0.12, 0, 0] }));
  }
  if (isSuv) {
    // Coastal surf rack + twin sculpted surfboards
    for (const z of [-0.2, 0.95]) trim.push(transformMesh(bevelBoxMesh(1.52, 0.05, 0.07, 0.015), { pos: [0, 1.62, z] }));
    for (const sx of [-0.34, 0.34]) {
      paint.push(transformMesh(bevelBoxMesh(0.42, 0.06, 2.05, 0.025), { pos: [sx, 1.69, 0.38] }));
    }
  }
  if (isPickup) {
    for (const sx of [-0.88, 0.88]) {
      trim.push(transformMesh(bevelBoxMesh(0.06, 0.16, 1.75, 0.02), { pos: [sx, 1.05, 1.35] }));
    }
  }

  const frontZ = stations[0]!.z;
  const rearZ = stations[stations.length - 1]!.z;
  // Chrome front grille, front/rear bumpers & side mirrors
  trim.push(transformMesh(bevelBoxMesh(1.06, 0.2, 0.09, 0.02), { pos: [0, 0.48, frontZ - 0.02] }));
  trim.push(transformMesh(bevelBoxMesh(1.62, 0.12, 0.12, 0.03), { pos: [0, 0.3, frontZ - 0.03] }));
  trim.push(transformMesh(bevelBoxMesh(1.64, 0.13, 0.12, 0.03), { pos: [0, 0.32, rearZ + 0.03] }));
  for (const sx of [-1, 1] as const) {
    trim.push(transformMesh(bevelBoxMesh(0.16, 0.1, 0.18, 0.025), { pos: [sx * 0.98, 0.86, -0.58] }));
    head.push(transformMesh(bevelBoxMesh(0.26, 0.15, 0.08, 0.025), { pos: [sx * 0.64, 0.54, frontZ - 0.02] }));
    tail.push(transformMesh(bevelBoxMesh(0.3, 0.15, 0.08, 0.025), { pos: [sx * 0.62, 0.58, rearZ + 0.02] }));
  }

  const wRad = isSuv || isPickup ? 0.38 : 0.33;
  appendWheelAxles(tires, trim, isSuv || isPickup ? 0.88 : 0.82, wRad, [frontZ + 0.72, rearZ - 0.74], wRad, 0.25, 6);

  const lod = combineRaw([
    loftSectionsMesh([stations[0]!, stations[Math.floor(stations.length / 2)]!, stations[stations.length - 1]!].map(carRing), true, false)
  ]);

  return normalizeVehicleFamily({
    paint: combineRaw(paint),
    trim: combineRaw(trim),
    tires: combineRaw(tires),
    glass: combineRaw(glass),
    head: combineRaw(head),
    tail: combineRaw(tail),
    lod
  });
}

function buildHeavyTrafficRaw(style: "bus" | "boxtruck" | "semi" | "tanker"): Record<keyof ProceduralTrafficVehicle, RawMesh> {
  const paint: RawMesh[] = [];
  const trim: RawMesh[] = [];
  const tires: RawMesh[] = [];
  const glass: RawMesh[] = [];
  const head: RawMesh[] = [];
  const tail: RawMesh[] = [];

  if (style === "bus") {
    // Streamline panoramic coastal tour coach
    const coachStations: CarStation[] = [
      { z: -5.8, hw: 1.12, botY: 0.34, beltY: 1.45, roofW: 0.96, roofY: 3.02 },
      { z: -5.1, hw: 1.28, botY: 0.3, beltY: 1.56, roofW: 1.18, roofY: 3.24 },
      { z: 0.0, hw: 1.29, botY: 0.3, beltY: 1.56, roofW: 1.2, roofY: 3.28 },
      { z: 5.2, hw: 1.28, botY: 0.32, beltY: 1.56, roofW: 1.18, roofY: 3.24 },
      { z: 5.85, hw: 1.16, botY: 0.38, beltY: 1.52, roofW: 1.04, roofY: 3.08 }
    ];
    paint.push(loftSectionsMesh(coachStations.map(carRing), true, false));
    // Rooftop climate pod + chrome side belt molding
    trim.push(transformMesh(bevelBoxMesh(1.62, 0.24, 3.8, 0.06), { pos: [0, 3.38, -0.4] }));
    trim.push(transformMesh(bevelBoxMesh(2.62, 0.1, 11.2, 0.02), { pos: [0, 1.48, 0] }));
    trim.push(transformMesh(bevelBoxMesh(2.34, 0.24, 0.16, 0.04), { pos: [0, 0.44, -5.82] }));
    trim.push(transformMesh(bevelBoxMesh(2.34, 0.24, 0.16, 0.04), { pos: [0, 0.46, 5.86] }));
    // Panoramic windshield & continuous upper observation ribbon windows
    glass.push(transformMesh(bevelBoxMesh(2.26, 1.16, 0.14, 0.03), { pos: [0, 2.24, -5.74], rot: [-0.14, 0, 0] }));
    glass.push(transformMesh(bevelBoxMesh(2.6, 0.96, 9.8, 0.04), { pos: [0, 2.34, 0.15] }));
    glass.push(transformMesh(bevelBoxMesh(2.1, 0.82, 0.12, 0.03), { pos: [0, 2.32, 5.82] }));
    for (const sx of [-1, 1] as const) {
      head.push(transformMesh(bevelBoxMesh(0.36, 0.2, 0.1, 0.03), { pos: [sx * 0.86, 0.78, -5.82] }));
      tail.push(transformMesh(bevelBoxMesh(0.32, 0.42, 0.1, 0.03), { pos: [sx * 0.92, 0.96, 5.86] }));
    }
    appendWheelAxles(tires, trim, 1.14, 0.48, [-3.65, 2.85, 4.15], 0.48, 0.32, 8);
    const lod = loftSectionsMesh([coachStations[0]!, coachStations[2]!, coachStations[4]!].map(carRing), true, false);
    return normalizeVehicleFamily({
      paint: combineRaw(paint),
      trim: combineRaw(trim),
      tires: combineRaw(tires),
      glass: combineRaw(glass),
      head: combineRaw(head),
      tail: combineRaw(tail),
      lod
    });
  }

  if (style === "boxtruck") {
    // Cab-over coastal freight truck + aerodynamic roof fairing + ribbed cargo box
    const cabStations: CarStation[] = [
      { z: -4.15, hw: 1.06, botY: 0.34, beltY: 1.32, roofW: 0.96, roofY: 2.38 },
      { z: -3.6, hw: 1.16, botY: 0.32, beltY: 1.4, roofW: 1.08, roofY: 2.55 },
      { z: -2.25, hw: 1.16, botY: 0.32, beltY: 1.4, roofW: 1.08, roofY: 2.95 }
    ];
    paint.push(loftSectionsMesh(cabStations.map(carRing), true, false));
    paint.push(transformMesh(bevelBoxMesh(2.48, 2.58, 6.3, 0.06), { pos: [0, 1.98, 1.05] }));
    // Chassis rails, grille & rear roll-up door frame
    trim.push(transformMesh(bevelBoxMesh(1.9, 0.32, 7.6, 0.03), { pos: [0, 0.54, 0.1] }));
    trim.push(transformMesh(bevelBoxMesh(1.72, 0.46, 0.12, 0.03), { pos: [0, 0.92, -4.16] }));
    trim.push(transformMesh(bevelBoxMesh(2.26, 0.22, 0.14, 0.03), { pos: [0, 0.48, -4.18] }));
    trim.push(transformMesh(bevelBoxMesh(2.38, 2.32, 0.08, 0.02), { pos: [0, 1.98, 4.21] }));
    glass.push(transformMesh(bevelBoxMesh(2.04, 0.78, 0.12, 0.03), { pos: [0, 1.92, -4.08], rot: [-0.15, 0, 0] }));
    glass.push(transformMesh(bevelBoxMesh(2.34, 0.7, 1.1, 0.03), { pos: [0, 1.92, -3.15] }));
    for (const sx of [-1, 1] as const) {
      head.push(transformMesh(bevelBoxMesh(0.32, 0.2, 0.1, 0.025), { pos: [sx * 0.82, 0.78, -4.17] }));
      tail.push(transformMesh(bevelBoxMesh(0.34, 0.18, 0.1, 0.025), { pos: [sx * 0.88, 0.68, 4.22] }));
    }
    appendWheelAxles(tires, trim, 1.08, 0.46, [-2.95, 2.55], 0.46, 0.3, 6);
    const lod = combineRaw([
      transformMesh(bevelBoxMesh(2.26, 2.3, 1.9, 0.04), { pos: [0, 1.5, -3.2] }),
      transformMesh(bevelBoxMesh(2.48, 2.58, 6.3, 0.04), { pos: [0, 1.98, 1.05] })
    ]);
    return normalizeVehicleFamily({
      paint: combineRaw(paint),
      trim: combineRaw(trim),
      tires: combineRaw(tires),
      glass: combineRaw(glass),
      head: combineRaw(head),
      tail: combineRaw(tail),
      lod
    });
  }

  // `semi` & `tanker`: long-nose aerodynamic sleeper tractor + 53-ft trailer or cylindrical chrome fuel tank
  const tractorStations: CarStation[] = [
    { z: -7.8, hw: 0.96, botY: 0.38, beltY: 1.48, roofW: 0.88, roofY: 1.62 },
    { z: -6.2, hw: 1.22, botY: 0.34, beltY: 1.58, roofW: 1.04, roofY: 1.78 },
    { z: -5.4, hw: 1.26, botY: 0.34, beltY: 1.68, roofW: 1.16, roofY: 3.15 },
    { z: -3.5, hw: 1.26, botY: 0.34, beltY: 1.68, roofW: 1.18, roofY: 3.55 }
  ];
  paint.push(loftSectionsMesh(tractorStations.map(carRing), true, false));
  // Tall slatted chrome grille, heavy bumper, twin vertical exhaust stacks & chassis frame
  trim.push(transformMesh(bevelBoxMesh(1.36, 0.96, 0.14, 0.03), { pos: [0, 1.08, -7.82] }));
  trim.push(transformMesh(bevelBoxMesh(2.44, 0.3, 0.18, 0.04), { pos: [0, 0.5, -7.84] }));
  trim.push(transformMesh(bevelBoxMesh(1.12, 0.32, 13.8, 0.03), { pos: [0, 0.68, 0.2] }));
  for (const sx of [-1, 1] as const) {
    trim.push(
      tubeSweepMesh(
        [
          [sx * 1.24, 0.95, -3.55, 0.09],
          [sx * 1.24, 3.62, -3.55, 0.085],
          [sx * 1.28, 3.88, -3.38, 0.08]
        ],
        8
      )
    );
    // Cylindrical saddle fuel tanks under sleeper cab
    trim.push(transformMesh(latheMesh([[0, -0.75], [0.34, -0.7], [0.34, 0.7], [0, 0.75]], 12), { pos: [sx * 1.04, 0.72, -4.6], rot: [Math.PI * 0.5, 0, 0] }));
    head.push(transformMesh(bevelBoxMesh(0.36, 0.2, 0.1, 0.025), { pos: [sx * 0.94, 0.86, -7.82] }));
    tail.push(transformMesh(bevelBoxMesh(0.38, 0.2, 0.1, 0.025), { pos: [sx * 0.96, 0.82, 7.82] }));
  }
  glass.push(transformMesh(bevelBoxMesh(2.14, 0.74, 0.12, 0.03), { pos: [0, 2.28, -5.78], rot: [-0.22, 0, 0] }));
  glass.push(transformMesh(bevelBoxMesh(2.54, 0.68, 1.15, 0.03), { pos: [0, 2.28, -4.85] }));

  if (style === "semi") {
    paint.push(transformMesh(bevelBoxMesh(2.56, 2.86, 10.6, 0.06), { pos: [0, 2.38, 2.5] }));
    for (let z = -2.1; z <= 7.1; z += 1.84) {
      trim.push(transformMesh(bevelBoxMesh(2.6, 2.74, 0.09, 0.02), { pos: [0, 2.38, z] }));
    }
  } else {
    // Cylindrical latheMesh polished fuel tanker + painted end-caps, cradles & top catwalk
    const tankProfile: V2[] = [
      [0, -5.2],
      [0.86, -5.05],
      [1.18, -4.65],
      [1.2, 4.65],
      [0.86, 5.05],
      [0, 5.2]
    ];
    const tankBarrel = transformMesh(latheMesh(tankProfile, 20, false), {
      pos: [0, 2.24, 2.55],
      rot: [Math.PI * 0.5, 0, 0],
      scale: [1.06, 0.92, 1.0]
    });
    trim.push(tankBarrel);
    // Painted company stripe band & saddle cradles so per-instance tint reads clearly on tankers too
    paint.push(transformMesh(bevelBoxMesh(2.56, 0.48, 9.6, 0.04), { pos: [0, 2.24, 2.55] }));
    for (const cz of [-1.2, 2.55, 6.2]) {
      paint.push(transformMesh(bevelBoxMesh(2.3, 0.62, 0.36, 0.04), { pos: [0, 1.22, cz] }));
    }
    trim.push(transformMesh(bevelBoxMesh(0.56, 0.08, 9.4, 0.02), { pos: [0, 3.38, 2.55] }));
  }

  appendWheelAxles(tires, trim, 1.12, 0.5, [-6.65, -2.85, -1.55, 5.65, 6.95], 0.5, 0.32, 8);

  const lod = combineRaw([
    loftSectionsMesh([tractorStations[0]!, tractorStations[3]!].map(carRing), true, false),
    transformMesh(bevelBoxMesh(2.52, style === "semi" ? 2.84 : 2.18, 10.4, 0.04), { pos: [0, 2.32, 2.5] })
  ]);

  return normalizeVehicleFamily({
    paint: combineRaw(paint),
    trim: combineRaw(trim),
    tires: combineRaw(tires),
    glass: combineRaw(glass),
    head: combineRaw(head),
    tail: combineRaw(tail),
    lod
  });
}

const trafficCache = new Map<ProceduralTrafficKey, ProceduralTrafficVehicle>();

export function getProceduralTrafficVehicle(key: ProceduralTrafficKey): ProceduralTrafficVehicle {
  let cached = trafficCache.get(key);
  if (!cached) {
    const raw =
      key === "sedan" || key === "hatch" || key === "suv" || key === "pickup"
        ? buildPassengerTrafficRaw(key)
        : buildHeavyTrafficRaw(key);
    cached = {
      paint: toGroupGeometry(raw.paint),
      trim: toGroupGeometry(raw.trim),
      tires: toGroupGeometry(raw.tires),
      glass: toGroupGeometry(raw.glass),
      head: toGroupGeometry(raw.head),
      tail: toGroupGeometry(raw.tail),
      lod: toGroupGeometry(raw.lod)
    };
    trafficCache.set(key, cached);
  }
  return cached;
}

export type ProceduralLegacyCarKey = "sedan" | "hatch" | "taxi" | "sportsCar" | "police";
const legacyCarCache = new Map<string, ProceduralGroupGeometry>();

export function getProceduralCarGroup(
  car: ProceduralLegacyCarKey,
  group: "paint" | "trim" | "glass" | "head" | "tail"
): ProceduralGroupGeometry {
  const cacheKey = `${car}:${group}`;
  let hit = legacyCarCache.get(cacheKey);
  if (!hit) {
    const mapped: ProceduralTrafficKey =
      car === "hatch" ? "hatch" : car === "taxi" ? "suv" : "sedan";
    const src = getProceduralTrafficVehicle(mapped);
    if (group === "trim") {
      // Merge trim + tires for 5-group legacy fallback compatibility
      const t0 = src.trim, t1 = src.tires;
      const v0 = t0.positions.length / 3;
      const positions = new Float32Array(t0.positions.length + t1.positions.length);
      const normals = new Float32Array(t0.normals.length + t1.normals.length);
      const uvs = new Float32Array(t0.uvs.length + t1.uvs.length);
      const indices = new Uint32Array(t0.indices.length + t1.indices.length);
      positions.set(t0.positions, 0); positions.set(t1.positions, t0.positions.length);
      normals.set(t0.normals, 0); normals.set(t1.normals, t0.normals.length);
      uvs.set(t0.uvs, 0); uvs.set(t1.uvs, t0.uvs.length);
      indices.set(t0.indices, 0);
      for (let i = 0; i < t1.indices.length; i += 1) indices[t0.indices.length + i] = t1.indices[i]! + v0;
      hit = { positions, normals, uvs, indices };
    } else {
      hit = src[group];
    }
    legacyCarCache.set(cacheKey, hit);
  }
  return hit;
}

// ---------------------------------------------------------------------------
// Coastal Headland Lighthouse, Villas, Townhouses, Date Palms & Coastal Pines
// ---------------------------------------------------------------------------

function buildLighthouseTowerRaw(): RawMesh {
  const parts: RawMesh[] = [];
  // Octagonal stone base plinth + tapered whitewashed masonry shaft (`latheMesh`)
  parts.push(
    latheMesh(
      [
        [0.095, 0.0],
        [0.092, 0.09],
        [0.082, 0.11],
        [0.074, 0.34],
        [0.064, 0.62],
        [0.056, 0.81],
        [0.068, 0.835],
        [0.0, 0.84]
      ],
      18,
      false
    )
  );
  // Attached coastal keeper's cottage at tower foot
  parts.push(transformMesh(bevelBoxMesh(0.14, 0.085, 0.11, 0.006), { pos: [0.105, 0.042, 0.02] }));
  parts.push(transformMesh(bevelBoxMesh(0.024, 0.055, 0.024, 0.004), { pos: [0.15, 0.095, -0.015] }));
  return combineRaw(parts);
}

/**
 * Multi-material headland lighthouse crown, crimson daymark bands, corbelled bronze gallery,
 * `material.physical` Fresnel lantern glazing (`castShadow: false`), glowing dioptric lens drum
 * & verdigris copper dome. Node names intentionally start with `headland-beacon-*` (never `lighthouse*`).
 */
export function createHeadlandLighthouseNodes(
  basePos: V3,
  towerHeight: number,
  palette: ReturnType<typeof createSaltwindMaterialPalette>
): {
  readonly crown: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glass: ReturnType<typeof geometry.custom>;
} {
  const slots: MultiMatSlot[] = [];
  // Mat 0: Crimson daymark stripes + keeper cottage pitched roof
  slots.push({
    mesh: latheMesh([[0.0725, 0.31], [0.0685, 0.42], [0.0675, 0.422]], 18, false),
    materialIndex: 0
  });
  slots.push({
    mesh: latheMesh([[0.063, 0.61], [0.0585, 0.72], [0.0575, 0.722]], 18, false),
    materialIndex: 0
  });
  const roofPoly: V2[] = [[-0.062, 0], [0.062, 0], [0, 0.042]];
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(roofPoly, 0.15, 0.004, true), {
      pos: [0.105, 0.084, 0.02],
      rot: [0, Math.PI * 0.5, 0]
    }),
    materialIndex: 0
  });

  // Mat 1: Corbelled bronze/iron observation gallery deck, safety railing & lantern mullions
  slots.push({
    mesh: latheMesh([[0.056, 0.81], [0.076, 0.832], [0.076, 0.848], [0.048, 0.85]], 18, false),
    materialIndex: 1
  });
  const railPosts = 12;
  for (let i = 0; i < railPosts; i += 1) {
    const a = (i / railPosts) * Math.PI * 2;
    const rx = Math.cos(a) * 0.071, rz = Math.sin(a) * 0.071;
    slots.push({
      mesh: tubeSweepMesh([[rx, 0.848, rz, 0.003], [rx, 0.878, rz, 0.003]], 6, true),
      materialIndex: 1
    });
    if (i % 2 === 0) {
      const mx = Math.cos(a) * 0.046, mz = Math.sin(a) * 0.046;
      slots.push({
        mesh: tubeSweepMesh([[mx, 0.848, mz, 0.0028], [mx, 0.932, mz, 0.0028]], 6, true),
        materialIndex: 1
      });
    }
  }
  slots.push({
    mesh: latheMesh([[0.069, 0.876], [0.073, 0.878], [0.069, 0.881]], 18, false),
    materialIndex: 1
  });
  slots.push({
    mesh: tubeSweepMesh([[0, 0.975, 0, 0.004], [0, 1.025, 0, 0.0015]], 6, true),
    materialIndex: 1
  });

  // Mat 2: Glowing warm-gold Fresnel dioptric lens drum inside lantern room
  slots.push({
    mesh: latheMesh([[0.0, 0.862], [0.028, 0.868], [0.033, 0.892], [0.028, 0.916], [0.0, 0.922]], 16, false),
    materialIndex: 2
  });

  // Mat 3: Ribbed verdigris copper cupola dome (`bezierCurve2` + `latheMesh`)
  const domeCurve = bezierCurve2([0.052, 0.93], [0.05, 0.962], [0.022, 0.978], [0.0, 0.982], 8);
  slots.push({
    mesh: latheMesh([[0.044, 0.926], ...domeCurve], 18, false),
    materialIndex: 3
  });

  const crown = assembleMultiMaterialNode(
    "headland-beacon-crown",
    slots,
    [
      palette.lighthouseCrimson,
      palette.viaductIron,
      palette.fresnelBeaconGold,
      palette.verdigrisCopper
    ],
    {
      position: basePos,
      scale: [towerHeight, towerHeight, towerHeight],
      castShadow: true,
      receiveShadow: true
    }
  );

  // Separate unshadowed `material.physical` lantern glazing cylinder (`castShadow: false`)
  const glassMesh = latheMesh(
    [
      [0.044, 0.85],
      [0.045, 0.93],
      [0.042, 0.931],
      [0.042, 0.85]
    ],
    18,
    false
  );
  const glass = geometry.custom(toEngineGeometrySpec(glassMesh), {
    name: "headland-beacon-glass",
    position: basePos,
    scale: [towerHeight, towerHeight, towerHeight],
    material: palette.windshieldGlass,
    castShadow: false,
    receiveShadow: false
  });

  return { crown, glass };
}

function buildMediterraneanBuildingSet(isVilla: boolean): {
  readonly stucco: ProceduralGroupGeometry;
  readonly roofAndArch: ProceduralGroupGeometry;
  readonly shutters: ProceduralGroupGeometry;
  readonly lod: ProceduralGroupGeometry;
} {
  const stucco: RawMesh[] = [];
  const roof: RawMesh[] = [];
  const shutters: RawMesh[] = [];

  if (isVilla) {
    // Two-wing Amalfi cliffside villa with arched stone loggia, hipped terracotta roofs & chimney
    stucco.push(transformMesh(bevelBoxMesh(0.92, 0.62, 0.72, 0.02), { pos: [0, 0.31, 0] }));
    stucco.push(transformMesh(bevelBoxMesh(0.48, 0.82, 0.52, 0.02), { pos: [-0.24, 0.41, -0.06] }));
    stucco.push(transformMesh(bevelBoxMesh(0.11, 0.26, 0.11, 0.01), { pos: [-0.32, 0.9, -0.1] }));
    const hipLower: V3[][] = [
      [[-0.5, 0.61, -0.4], [0.5, 0.61, -0.4], [0.5, 0.61, 0.4], [-0.5, 0.61, 0.4]],
      [[-0.22, 0.76, -0.14], [0.22, 0.76, -0.14], [0.22, 0.76, 0.14], [-0.22, 0.76, 0.14]]
    ];
    const hipTower: V3[][] = [
      [[-0.52, 0.81, -0.35], [0.04, 0.81, -0.35], [0.04, 0.81, 0.23], [-0.52, 0.81, 0.23]],
      [[-0.32, 0.96, -0.14], [-0.16, 0.96, -0.14], [-0.16, 0.96, 0.02], [-0.32, 0.96, 0.02]]
    ];
    roof.push(loftSectionsMesh(hipLower, true, true));
    roof.push(loftSectionsMesh(hipTower, true, true));
    // Twin stone voussoir loggia arches on seafront facade
    for (const ax of [0.06, 0.3]) {
      const archSlots = archwayVoussoirSlots({
        radius: 0.085,
        thickness: 0.032,
        depth: 0.08,
        voussoirs: 7,
        stoneMatA: 0,
        stoneMatB: 0,
        keystoneMat: 0
      });
      for (const s of archSlots) {
        roof.push(transformMesh(s.mesh, { pos: [ax, 0.24, 0.36] }));
      }
      stucco.push(transformMesh(bevelBoxMesh(0.035, 0.24, 0.07, 0.006), { pos: [ax - 0.095, 0.12, 0.36] }));
      stucco.push(transformMesh(bevelBoxMesh(0.035, 0.24, 0.07, 0.006), { pos: [ax + 0.095, 0.12, 0.36] }));
    }
    for (const [wx, wy, wz] of [[-0.24, 0.58, 0.21], [-0.24, 0.58, -0.33], [0.2, 0.44, -0.37]] as const) {
      shutters.push(transformMesh(bevelBoxMesh(0.16, 0.16, 0.03, 0.005), { pos: [wx, wy, wz] }));
    }
  } else {
    // Tall narrow coastal townhouse with arched ground portal, upper balcony & barrel-tile gable
    stucco.push(transformMesh(bevelBoxMesh(0.68, 0.88, 0.66, 0.02), { pos: [0, 0.44, 0] }));
    const gablePoly: V2[] = [[-0.38, 0], [0.38, 0], [0, 0.16]];
    roof.push(transformMesh(extrudePolygonMesh(gablePoly, 0.72, 0.015, true), { pos: [0, 0.87, 0] }));
    const doorArch = archwayVoussoirSlots({
      radius: 0.1,
      thickness: 0.035,
      depth: 0.08,
      voussoirs: 7,
      stoneMatA: 0,
      stoneMatB: 0,
      keystoneMat: 0
    });
    for (const s of doorArch) roof.push(transformMesh(s.mesh, { pos: [0, 0.2, 0.33] }));
    // Recessed balcony slab & seafoam louvered window shutters
    roof.push(transformMesh(bevelBoxMesh(0.46, 0.035, 0.14, 0.008), { pos: [0, 0.5, 0.38] }));
    for (const wy of [0.62, 0.62]) {
      void wy;
    }
    for (const sx of [-0.16, 0.16]) {
      shutters.push(transformMesh(bevelBoxMesh(0.14, 0.18, 0.03, 0.005), { pos: [sx, 0.64, 0.34] }));
      shutters.push(transformMesh(bevelBoxMesh(0.14, 0.16, 0.03, 0.005), { pos: [sx, 0.64, -0.34] }));
    }
  }

  const lodRaw = isVilla
    ? combineRaw([
        transformMesh(bevelBoxMesh(0.92, 0.68, 0.72, 0.01), { pos: [0, 0.34, 0] }),
        transformMesh(bevelBoxMesh(0.48, 0.9, 0.52, 0.01), { pos: [-0.24, 0.45, -0.06] })
      ])
    : transformMesh(bevelBoxMesh(0.68, 0.96, 0.66, 0.01), { pos: [0, 0.48, 0] });

  const norm = normalizePropFamily({
    stucco: combineRaw(stucco),
    roofAndArch: combineRaw(roof),
    shutters: combineRaw(shutters),
    lod: lodRaw
  });
  return {
    stucco: toGroupGeometry(norm.stucco),
    roofAndArch: toGroupGeometry(norm.roofAndArch),
    shutters: toGroupGeometry(norm.shutters),
    lod: toGroupGeometry(norm.lod)
  };
}

function buildDatePalmSet(): {
  readonly fronds: ProceduralGroupGeometry;
  readonly trunk: ProceduralGroupGeometry;
  readonly lod: ProceduralGroupGeometry;
} {
  // Gently leaning ringed date-palm trunk (`catmullRomSpline3` + `tubeSweepMesh`)
  const curve = catmullRomSpline3(
    [
      [0, 0, 0],
      [0.03, 0.26, 0.01],
      [0.08, 0.54, 0.03],
      [0.11, 0.8, 0.04]
    ],
    4
  );
  const spine: V4[] = curve.map((p, idx) => {
    const t = idx / Math.max(1, curve.length - 1);
    const ringBump = 1 + 0.09 * Math.sin(idx * 2.4);
    return [p[0], p[1], p[2], (0.046 * (1 - t * 0.48)) * ringBump];
  });
  const trunkRaw = tubeSweepMesh(spine, 8, true);

  // 10 gracefully arching feather palm fronds radiating from crown (`[0.11, 0.8, 0.04]`) + coconut cluster
  const crown: V3 = [0.11, 0.8, 0.04];
  const frondParts: RawMesh[] = [];
  const frondCount = 10;
  for (let i = 0; i < frondCount; i += 1) {
    const yaw = (i / frondCount) * Math.PI * 2 + (i % 2) * 0.14;
    const pitchLift = i < 4 ? 0.36 : 0.12;
    const len = i < 4 ? 0.34 : 0.42;
    const sections: V3[][] = [];
    const steps = 5;
    for (let s = 0; s <= steps; s += 1) {
      const u = s / steps;
      const reach = u * len;
      const archY = Math.sin(u * Math.PI * 0.72) * (0.12 + pitchLift * 0.22) - u * u * 0.19;
      const halfW = Math.sin(Math.max(0.06, u) * Math.PI) * 0.068 + 0.006;
      const keel = halfW * 0.28;
      sections.push([
        [0, archY + keel, reach],
        [halfW, archY - keel * 0.4, reach],
        [0, archY - keel * 0.15, reach],
        [-halfW, archY - keel * 0.4, reach]
      ]);
    }
    frondParts.push(transformMesh(loftSectionsMesh(sections, false, true), { pos: crown, rot: [0, yaw, 0] }));
  }
  for (let c = 0; c < 4; c += 1) {
    const a = (c / 4) * Math.PI * 2;
    frondParts.push(
      transformMesh(icosphereFacetMesh(0.028, 0, 0.05, 13 + c), {
        pos: [crown[0] + Math.cos(a) * 0.036, crown[1] - 0.03, crown[2] + Math.sin(a) * 0.036]
      })
    );
  }

  const lodRaw = combineRaw([
    tubeSweepMesh([[0, 0, 0, 0.044], [0.06, 0.42, 0.02, 0.034], [0.11, 0.8, 0.04, 0.024]], 5, true),
    transformMesh(icosphereFacetMesh(0.28, 0, 0.12, 31), { pos: [0.11, 0.82, 0.04], scale: [1.25, 0.48, 1.25] })
  ]);

  const norm = normalizePropFamily({
    fronds: combineRaw(frondParts),
    trunk: trunkRaw,
    lod: lodRaw
  });
  return {
    fronds: toGroupGeometry(norm.fronds),
    trunk: toGroupGeometry(norm.trunk),
    lod: toGroupGeometry(norm.lod)
  };
}

function buildCoastalPineSet(): {
  readonly needles: ProceduralGroupGeometry;
  readonly trunk: ProceduralGroupGeometry;
  readonly lod: ProceduralGroupGeometry;
} {
  // Wind-swept Mediterranean stone/umbrella pine: twisted trunk + smooth 6-tier conifer boughs + lush multi-lobe umbrella crown
  const trunkSpine: V4[] = [
    [0, 0, 0, 0.058],
    [-0.02, 0.22, 0.01, 0.046],
    [0.03, 0.46, -0.01, 0.036],
    [0.02, 0.66, 0.0, 0.024]
  ];
  const trunkParts: RawMesh[] = [
    tubeSweepMesh(trunkSpine, 8, true),
    tubeSweepMesh([[0.02, 0.48, -0.01, 0.022], [0.15, 0.65, 0.05, 0.012]], 6, true),
    tubeSweepMesh([[0.01, 0.52, 0.0, 0.02], [-0.14, 0.67, -0.04, 0.012]], 6, true)
  ];
  const needleParts: RawMesh[] = [
    transformMesh(coniferBoughTierMesh({ baseRadius: 0.3, height: 0.48, tiers: 6, seed: 41 }), { pos: [0.01, 0.38, 0] }),
    transformMesh(layeredCanopyMesh({ radius: 0.4, height: 0.36, puffs: 12, seed: 73 }), { pos: [0.02, 0.63, 0] }),
    transformMesh(layeredCanopyMesh({ radius: 0.27, height: 0.24, puffs: 8, seed: 109 }), { pos: [-0.11, 0.61, 0.03] })
  ];
  const lodRaw = combineRaw([
    tubeSweepMesh([[0, 0, 0, 0.052], [0.02, 0.62, 0, 0.024]], 5, true),
    transformMesh(coniferBoughTierMesh({ baseRadius: 0.26, height: 0.38, tiers: 4, seed: 41 }), { pos: [0.01, 0.4, 0] }),
    transformMesh(layeredCanopyMesh({ radius: 0.38, height: 0.34, puffs: 5, seed: 79 }), { pos: [0.02, 0.64, 0] })
  ]);

  const norm = normalizePropFamily({
    needles: combineRaw(needleParts),
    trunk: combineRaw(trunkParts),
    lod: lodRaw
  });
  return {
    needles: toGroupGeometry(norm.needles),
    trunk: toGroupGeometry(norm.trunk),
    lod: toGroupGeometry(norm.lod)
  };
}

function buildCoastalCypressSet(): {
  readonly needles: ProceduralGroupGeometry;
  readonly trunk: ProceduralGroupGeometry;
} {
  // Tall columnar Mediterranean hillside cypress (`coniferBoughTierMesh` + smooth apical `layeredCanopyMesh`)
  const trunkRaw = tubeSweepMesh(
    [
      [0, 0, 0, 0.046],
      [0.005, 0.28, 0, 0.034],
      [0, 0.62, 0, 0.02]
    ],
    7,
    true
  );
  const needleRaw = combineRaw([
    transformMesh(coniferBoughTierMesh({ baseRadius: 0.19, height: 0.78, tiers: 7, seed: 57 }), { pos: [0, 0.16, 0] }),
    transformMesh(layeredCanopyMesh({ radius: 0.15, height: 0.26, puffs: 6, seed: 91 }), { pos: [0, 0.72, 0] })
  ]);
  const norm = normalizePropFamily({
    needles: needleRaw,
    trunk: trunkRaw
  });
  return {
    needles: toGroupGeometry(norm.needles),
    trunk: toGroupGeometry(norm.trunk)
  };
}

// ---------------------------------------------------------------------------
// Hero Multi-Material Architectural Landmarks (`assembleMultiMaterialNode`)
// ---------------------------------------------------------------------------

/**
 * Multi-span Romanesque/Amalfi arched stone coastal viaduct (`archwayVoussoirSlots` +
 * tapered stone piers + proud sandstone keystones + iron parapet railings).
 */
export function createCoastalViaductNode(
  name: string,
  position: V3,
  yaw: number,
  scale: V3,
  palette: ReturnType<typeof createSaltwindMaterialPalette>
): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  const spans = 3;
  const archR = 4.2;
  const pierW = 2.1;
  const pitch = archR * 2 + pierW;
  const pierH = 9.5;
  const deckZ = 6.4;
  const halfSpanX = (spans * pitch) * 0.5;

  // Tapered masonry piers + plinth footings
  for (let i = 0; i <= spans; i += 1) {
    const px = -halfSpanX + i * pitch;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(pierW * 1.24, 1.6, deckZ * 1.16, 0.12), { pos: [px, 0.8, 0] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(pierW, pierH, deckZ, 0.1), { pos: [px, pierH * 0.5 + 0.8, 0] }),
      materialIndex: 0
    });
  }

  // Radial stone voussoir arches + spandrel walls
  for (let s = 0; s < spans; s += 1) {
    const cx = -halfSpanX + (s + 0.5) * pitch;
    const archSlots = archwayVoussoirSlots({
      radius: archR,
      thickness: 1.15,
      depth: deckZ * 1.04,
      voussoirs: 11,
      stoneMatA: 0,
      stoneMatB: 1,
      keystoneMat: 2
    });
    for (const v of archSlots) {
      slots.push({
        mesh: transformMesh(v.mesh, { pos: [cx, pierH, 0] }),
        materialIndex: v.materialIndex
      });
    }
    // Spandrel infill blocks flanking the arch crown
    for (const sx of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(1.65, 2.2, deckZ * 0.96, 0.08), {
          pos: [cx + sx * (archR * 0.78), pierH + archR + 0.35, 0]
        }),
        materialIndex: 0
      });
    }
  }

  // Cantilevered cornice roadway deck + wrought-iron parapet railings
  const deckY = pierH + archR + 1.55;
  const totalLen = spans * pitch + pierW * 1.5;
  slots.push({
    mesh: transformMesh(bevelBoxMesh(totalLen, 0.85, deckZ * 1.14, 0.1), { pos: [0, deckY, 0] }),
    materialIndex: 2
  });
  for (const sz of [-1, 1] as const) {
    const rz = sz * (deckZ * 0.52);
    slots.push({
      mesh: transformMesh(bevelBoxMesh(totalLen, 0.14, 0.16, 0.03), { pos: [0, deckY + 1.08, rz] }),
      materialIndex: 3
    });
    for (let x = -totalLen * 0.48; x <= totalLen * 0.48; x += 2.6) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.14, 1.0, 0.14, 0.02), { pos: [x, deckY + 0.56, rz] }),
        materialIndex: 3
      });
    }
  }

  return assembleMultiMaterialNode(
    name,
    slots,
    [palette.limestoneWarm, palette.sandstoneKey, palette.dinerWarmCream, palette.viaductIron],
    { position, rotation: [0, yaw, 0], scale, castShadow: true, receiveShadow: true }
  );
}

/**
 * Streamline-Moderne Art-Deco roadside diner + Googie neon pylon sign + `material.physical`
 * wrap-around ribbon windows (`castShadow: false`).
 */
export function createRoadsideDinerNodes(
  namePrefix: string,
  position: V3,
  yaw: number,
  scale: number,
  palette: ReturnType<typeof createSaltwindMaterialPalette>
): {
  readonly diner: ReturnType<typeof assembleMultiMaterialNode>;
  readonly glass: ReturnType<typeof geometry.custom>;
} {
  const slots: MultiMatSlot[] = [];
  // Rounded-end streamline diner footprint extruded vertically (`XZ` footprint via `rot: [-Math.PI/2, 0, 0]`)
  const halfX = 6.2, halfZ = 2.9, cornerR = 1.9;
  const footprint: V2[] = [];
  for (let i = 0; i <= 6; i += 1) {
    const a = -Math.PI * 0.5 + (i / 6) * Math.PI;
    footprint.push([halfX - cornerR + Math.cos(a) * cornerR, Math.sin(a) * halfZ]);
  }
  for (let i = 0; i <= 6; i += 1) {
    const a = Math.PI * 0.5 + (i / 6) * Math.PI;
    footprint.push([-halfX + cornerR + Math.cos(a) * cornerR, Math.sin(a) * halfZ]);
  }

  // Mat 0: Seafoam ceramic lower wainscot + upper parapet
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(footprint, 1.35, 0.08, false), { pos: [0, 0.68, 0], rot: [-Math.PI * 0.5, 0, 0] }),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(footprint, 0.95, 0.08, false), { pos: [0, 3.65, 0], rot: [-Math.PI * 0.5, 0, 0] }),
    materialIndex: 1
  });
  // Mat 2: Anisotropic brushed stainless roof fascia bands, entrance canopy & corner flutes
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(footprint, 0.32, 0.05, false), { pos: [0, 1.44, 0], rot: [-Math.PI * 0.5, 0, 0], scale: [1.03, 1, 1.03] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(footprint, 0.38, 0.06, false), { pos: [0, 3.12, 0], rot: [-Math.PI * 0.5, 0, 0], scale: [1.04, 1, 1.04] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(3.8, 0.22, 1.7, 0.05), { pos: [0, 2.96, halfZ + 0.65] }),
    materialIndex: 2
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(1.3, 4.9, 1.1, 0.08), { pos: [0, 2.45, halfZ * 0.72] }),
    materialIndex: 2
  });
  // Mat 5: Warm amber diner counter interior glow visible behind ribbon glass
  slots.push({
    mesh: transformMesh(bevelBoxMesh(8.8, 1.25, 3.4, 0.08), { pos: [0, 2.22, 0] }),
    materialIndex: 5
  });

  // Tall roadside Googie / Art-Deco neon pylon sign at `[8.2, 0, 1.8]`
  const sx = 8.2, sz = 1.8;
  for (const dx of [-0.36, 0.36]) {
    slots.push({
      mesh: tubeSweepMesh([[sx + dx, 0, sz, 0.14], [sx + dx, 9.6, sz, 0.11]], 8, false),
      materialIndex: 2
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(3.9, 1.9, 0.36, 0.07), { pos: [sx, 7.6, sz] }),
    materialIndex: 1
  });
  // Coral & teal glowing neon marquee tubes & boomerang fin
  slots.push({
    mesh: transformMesh(bevelBoxMesh(4.1, 0.22, 0.44, 0.04), { pos: [sx, 8.65, sz] }),
    materialIndex: 3
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(4.1, 0.22, 0.44, 0.04), { pos: [sx, 6.55, sz] }),
    materialIndex: 4
  });
  const boomerang: V2[] = [[-2.4, 0], [1.6, 0.65], [2.5, 0], [1.6, -0.65], [1.1, 0]];
  slots.push({
    mesh: transformMesh(extrudePolygonMesh(boomerang, 0.28, 0.04, true), { pos: [sx + 0.2, 5.55, sz] }),
    materialIndex: 3
  });
  slots.push({
    mesh: latheMesh([[0, 9.6], [0.42, 9.95], [0.12, 10.35], [0, 10.8]], 12, false).positions.length
      ? transformMesh(latheMesh([[0, 9.6], [0.42, 9.95], [0.12, 10.35], [0, 10.8]], 12, false), { pos: [sx, 0, sz] })
      : bevelBoxMesh(0.2, 0.2, 0.2),
    materialIndex: 4
  });

  const diner = assembleMultiMaterialNode(
    `${namePrefix}-body`,
    slots,
    [
      palette.dinerSeafoamEnamel,
      palette.dinerWarmCream,
      palette.anisotropicChrome,
      palette.dinerNeonCoral,
      palette.dinerNeonTeal,
      palette.fresnelBeaconGold
    ],
    { position, rotation: [0, yaw, 0], scale, castShadow: true, receiveShadow: true }
  );

  // Unshadowed `material.physical` wrap-around diner ribbon windows (`castShadow: false`)
  const glassRaw = transformMesh(extrudePolygonMesh(footprint, 1.38, 0.02, false), {
    pos: [0, 2.26, 0],
    rot: [-Math.PI * 0.5, 0, 0],
    scale: [0.99, 1, 0.99]
  });
  const glass = geometry.custom(toEngineGeometrySpec(glassRaw), {
    name: `${namePrefix}-glass`,
    position,
    rotation: [0, yaw, 0],
    scale,
    material: palette.windshieldGlass,
    castShadow: false,
    receiveShadow: false
  });

  return { diner, glass };
}

/**
 * Twin-leg Art-Deco steel suspension bridge tower (`latticeTrussMesh` + concrete caissons +
 * swept `catmullRomSpline3` main catenary cables + crimson aviation warning beacons).
 */
export function createSuspensionBridgeTowerNode(
  name: string,
  position: V3,
  yaw: number,
  scale: V3,
  palette: ReturnType<typeof createSaltwindMaterialPalette>
): ReturnType<typeof assembleMultiMaterialNode> {
  const slots: MultiMatSlot[] = [];
  const legX = 7.4;
  const towerH = 44;

  for (const sx of [-1, 1] as const) {
    // Concrete caisson footing (Mat 1) + tall steel `latticeTrussMesh` leg (Mat 0) + saddle cap (Mat 2)
    slots.push({
      mesh: transformMesh(bevelBoxMesh(4.6, 5.2, 5.4, 0.2), { pos: [sx * legX, 2.6, 0] }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [2.9, towerH, 3.2], bays: 9, chordRadius: 0.24, braceRadius: 0.13 }),
        { pos: [sx * legX, 5.0 + towerH * 0.5, 0] }
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(3.4, 1.4, 3.8, 0.12), { pos: [sx * legX, 5.2 + towerH, 0] }),
      materialIndex: 2
    });
    // Swept catenary suspension cable draping fore & aft across the saddle (`catmullRomSpline3` + `tubeSweepMesh`)
    const cablePts = catmullRomSpline3(
      [
        [sx * legX, 14, -36],
        [sx * legX, 28, -16],
        [sx * legX, 5.8 + towerH, 0],
        [sx * legX, 28, 16],
        [sx * legX, 14, 36]
      ],
      5
    );
    slots.push({
      mesh: tubeSweepMesh(cablePts.map((p): V4 => [p[0], p[1], p[2], 0.28]), 8, false),
      materialIndex: 2
    });
    // Aviation warning beacon at tower apex (Mat 3)
    slots.push({
      mesh: transformMesh(icosphereFacetMesh(0.62, 1, 0, 7), { pos: [sx * legX, 6.6 + towerH, 0] }),
      materialIndex: 3
    });
  }

  // 3 horizontal steel lattice portal cross-struts tying the twin tower legs together
  for (const py of [19, 32, 45]) {
    slots.push({
      mesh: transformMesh(
        latticeTrussMesh({ span: [legX * 2 - 2.4, 2.4, 2.4], bays: 5, chordRadius: 0.18, braceRadius: 0.11 }),
        { pos: [0, py, 0] }
      ),
      materialIndex: 0
    });
  }

  return assembleMultiMaterialNode(
    name,
    slots,
    [palette.suspensionRedSteel, palette.limestoneWarm, palette.machinedAlloy, palette.taillampRuby],
    { position, rotation: [0, yaw, 0], scale, castShadow: true, receiveShadow: true }
  );
}

// ---------------------------------------------------------------------------
// Geological, Wind-Farm & Skyway Procedural Scenery Library (Cached Singleton)
// ---------------------------------------------------------------------------

export interface ProceduralSceneryLibrary {
  readonly lighthouseTower: ProceduralGroupGeometry;
  readonly villa: ReturnType<typeof buildMediterraneanBuildingSet>;
  readonly townhouse: ReturnType<typeof buildMediterraneanBuildingSet>;
  readonly palm: ReturnType<typeof buildDatePalmSet>;
  readonly pine: ReturnType<typeof buildCoastalPineSet>;
  readonly cypress: ReturnType<typeof buildCoastalCypressSet>;
  readonly coastalButtress: ProceduralGroupGeometry;
  readonly boulder: ProceduralGroupGeometry;
  readonly boulderLod: ProceduralGroupGeometry;
  readonly seaStack: ProceduralGroupGeometry;
  readonly mesa: ProceduralGroupGeometry;
  readonly hoodoo: ProceduralGroupGeometry;
  readonly sandstoneArch: ProceduralGroupGeometry;
  readonly latticeMast: ProceduralGroupGeometry;
  readonly arcologyBody: ProceduralGroupGeometry;
  readonly arcologyGlass: ProceduralGroupGeometry;
  readonly turbineTower: ProceduralGroupGeometry;
  readonly turbineNacelle: ProceduralGroupGeometry;
  readonly turbineBlade: ProceduralGroupGeometry;
}

let cachedScenery: ProceduralSceneryLibrary | null = null;

export function getProceduralSceneryLibrary(): ProceduralSceneryLibrary {
  if (cachedScenery) return cachedScenery;

  const lighthouseNorm = normalizePropFamily({ tower: buildLighthouseTowerRaw() });

  // Faceted granite boulder cluster (`icosphereFacetMesh`) + lightweight `-far` LOD
  const boulderNorm = normalizePropFamily({
    near: combineRaw([
      transformMesh(icosphereFacetMesh(0.46, 1, 0.24, 19), { pos: [0, 0.36, 0], scale: [1.18, 0.82, 1.05] }),
      transformMesh(icosphereFacetMesh(0.28, 1, 0.22, 53), { pos: [0.32, 0.22, 0.18], scale: [1.1, 0.78, 0.96] })
    ]),
    lod: transformMesh(icosphereFacetMesh(0.46, 0, 0.2, 19), { pos: [0, 0.36, 0], scale: [1.18, 0.82, 1.05] })
  });

  // Wave-undercut stratified coastal sea-stack & landward cliff buttress (`stratifiedCliffMesh`)
  const seaStackNorm = normalizePropFamily({
    stack: combineRaw([
      stratifiedCliffMesh({ radiusX: 0.38, radiusZ: 0.34, height: 1.0, terraces: 6, seed: 37 }),
      transformMesh(stratifiedCliffMesh({ radiusX: 0.22, radiusZ: 0.2, height: 0.52, terraces: 4, seed: 83 }), { pos: [0.28, 0, 0.14] })
    ])
  });
  const buttressNorm = normalizePropFamily({
    buttress: combineRaw([
      stratifiedCliffMesh({ radiusX: 0.46, radiusZ: 0.38, height: 1.0, terraces: 5, seed: 131 }),
      transformMesh(stratifiedCliffMesh({ radiusX: 0.3, radiusZ: 0.28, height: 0.64, terraces: 4, seed: 167 }), { pos: [-0.26, 0, 0.18] })
    ])
  });

  // Broad flat-topped terraced canyon mesa (`[-0.5, +0.5]^3` for `place("mesa")`)
  const mesaNorm = normalizeVehicleFamily({
    mesa: stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.48, height: 1.0, terraces: 5, seed: 61 })
  });

  // Balanced caprock desert hoodoo spire (`latheMesh` + `icosphereFacetMesh`, `y in [0, 1]`)
  const hoodooNorm = normalizePropFamily({
    hoodoo: combineRaw([
      latheMesh(
        [
          [0.34, 0.0],
          [0.24, 0.22],
          [0.14, 0.48],
          [0.2, 0.68],
          [0.11, 0.84],
          [0.28, 0.91],
          [0.22, 0.99],
          [0.0, 1.0]
        ],
        12,
        true
      ),
      transformMesh(icosphereFacetMesh(0.24, 1, 0.18, 97), { pos: [0.02, 0.91, 0], scale: [1.28, 0.44, 1.15] })
    ])
  });

  // Swept natural sandstone arch (`catmullRomSpline3` + `tubeSweepMesh`, `y in [0, 1]`)
  const archCurve = catmullRomSpline3(
    [
      [-0.82, 0.0, 0],
      [-0.72, 0.52, 0.04],
      [-0.36, 0.88, 0.02],
      [0.0, 0.98, 0],
      [0.38, 0.86, -0.02],
      [0.74, 0.48, -0.03],
      [0.84, 0.0, 0]
    ],
    5
  );
  const archSpine: V4[] = archCurve.map((p, idx) => {
    const u = idx / Math.max(1, archCurve.length - 1);
    const crownThin = 1 - Math.sin(u * Math.PI) * 0.42;
    return [p[0], p[1], p[2], 0.22 * crownThin];
  });
  const archNorm = normalizePropFamily({
    arch: combineRaw([
      tubeSweepMesh(archSpine, 9, true),
      transformMesh(stratifiedCliffMesh({ radiusX: 0.28, radiusZ: 0.24, height: 0.36, terraces: 3, seed: 109 }), { pos: [-0.8, 0, 0] }),
      transformMesh(stratifiedCliffMesh({ radiusX: 0.28, radiusZ: 0.24, height: 0.34, terraces: 3, seed: 127 }), { pos: [0.82, 0, 0] })
    ])
  });

  // Open steel lattice mast (`[-0.5, +0.5]^3` for `place("uplink-mast")` & `place("antenna")`)
  const mastNorm = normalizeVehicleFamily({
    mast: combineRaw([
      latticeTrussMesh({ span: [1.0, 10.0, 1.0], bays: 10, chordRadius: 0.075, braceRadius: 0.042 }),
      transformMesh(latheMesh([[0.05, 0], [0.44, 0.16], [0.48, 0.24], [0.42, 0.25], [0.04, 0.1]], 12, true), {
        pos: [0, 2.8, 0.52],
        rot: [Math.PI * 0.5, 0, 0]
      })
    ])
  });

  // Terraced Halo skyway arcology spire (`y in [0, 1]`, separated structural fins + reflective curtain glass)
  const arcologyNorm = normalizePropFamily({
    body: combineRaw([
      transformMesh(bevelBoxMesh(0.46, 0.42, 0.46, 0.02), { pos: [0, 0.21, 0] }),
      transformMesh(bevelBoxMesh(0.34, 0.68, 0.34, 0.02), { pos: [0, 0.34, 0] }),
      transformMesh(bevelBoxMesh(0.22, 0.92, 0.22, 0.015), { pos: [0, 0.46, 0] }),
      tubeSweepMesh([[0, 0.88, 0, 0.025], [0, 1.0, 0, 0.004]], 6, true)
    ]),
    glass: combineRaw([
      transformMesh(bevelBoxMesh(0.48, 0.32, 0.38, 0.01), { pos: [0, 0.22, 0] }),
      transformMesh(bevelBoxMesh(0.36, 0.56, 0.26, 0.01), { pos: [0, 0.36, 0] }),
      transformMesh(bevelBoxMesh(0.24, 0.78, 0.16, 0.01), { pos: [0, 0.48, 0] })
    ])
  });

  // Wind-turbine tapered tubular tower, streamlined nacelle (`-X` nose cone) & twisted airfoil blade (`[-0.5, +0.5]^3`)
  const turbineTowerNorm = normalizeVehicleFamily({
    tower: latheMesh([[0.5, -0.5], [0.42, -0.15], [0.33, 0.2], [0.26, 0.5], [0, 0.5]], 14, false)
  });
  const nacelleSections: V3[][] = [
    [[-0.46, 0.12, 0], [-0.46, 0, 0.12], [-0.46, -0.12, 0], [-0.46, 0, -0.12]],
    [[-0.32, 0.34, 0], [-0.32, 0, 0.34], [-0.32, -0.34, 0], [-0.32, 0, -0.34]],
    [[0.36, 0.38, 0.32], [0.36, -0.38, 0.32], [0.36, -0.38, -0.32], [0.36, 0.38, -0.32]],
    [[0.5, 0.28, 0.24], [0.5, -0.28, 0.24], [0.5, -0.28, -0.24], [0.5, 0.28, -0.24]]
  ];
  const turbineNacelleNorm = normalizeVehicleFamily({
    nacelle: loftSectionsMesh(nacelleSections, true, false)
  });
  const bladeSections: V3[][] = [0, 0.18, 0.45, 0.75, 1.0].map((u) => {
    const y = -0.5 + u;
    const chord = (1 - u * 0.68) * 0.48 + 0.06;
    const thick = (1 - u * 0.75) * 0.38 + 0.05;
    const twist = (1 - u) * 0.32;
    const ct = Math.cos(twist), st = Math.sin(twist);
    const rot = (lx: number, lz: number): V3 => [lx * ct - lz * st, y, lx * st + lz * ct];
    return [
      rot(0, -chord * 0.45),
      rot(thick, -chord * 0.12),
      rot(0, chord * 0.55),
      rot(-thick * 0.65, -chord * 0.12)
    ];
  });
  const turbineBladeNorm = normalizeVehicleFamily({
    blade: loftSectionsMesh(bladeSections, true, false)
  });

  cachedScenery = {
    lighthouseTower: toGroupGeometry(lighthouseNorm.tower),
    villa: buildMediterraneanBuildingSet(true),
    townhouse: buildMediterraneanBuildingSet(false),
    palm: buildDatePalmSet(),
    pine: buildCoastalPineSet(),
    cypress: buildCoastalCypressSet(),
    coastalButtress: toGroupGeometry(buttressNorm.buttress),
    boulder: toGroupGeometry(boulderNorm.near),
    boulderLod: toGroupGeometry(boulderNorm.lod),
    seaStack: toGroupGeometry(seaStackNorm.stack),
    mesa: toGroupGeometry(mesaNorm.mesa),
    hoodoo: toGroupGeometry(hoodooNorm.hoodoo),
    sandstoneArch: toGroupGeometry(archNorm.arch),
    latticeMast: toGroupGeometry(mastNorm.mast),
    arcologyBody: toGroupGeometry(arcologyNorm.body),
    arcologyGlass: toGroupGeometry(arcologyNorm.glass),
    turbineTower: toGroupGeometry(turbineTowerNorm.tower),
    turbineNacelle: toGroupGeometry(turbineNacelleNorm.nacelle),
    turbineBlade: toGroupGeometry(turbineBladeNorm.blade)
  };
  return cachedScenery;
}
