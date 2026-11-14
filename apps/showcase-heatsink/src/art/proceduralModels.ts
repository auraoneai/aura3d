/**
 * Procedural multi-material aerospace hover-drone, foundry megastructure, pickup, ordnance,
 * and horizon skyline sculpting library for Thermal Drift (`apps/showcase-heatsink`, `WP-03`).
 *
 * Built exclusively on `showcase-port-shared/proceduralKernel` + `@aura3d/engine` 5.5.1 with:
 * - Zero `three` imports and zero static Meshy `.glb` mounts.
 * - Smooth-normal multi-station `loftSectionsMesh` fuselages, `latheMesh` hyperboloid cooling towers,
 *   Cowper stoves, cryo vessels & vector nozzles, `latticeTrussMesh` foundry gantries & cranes,
 *   `tubeSweepMesh` plasma/slag conduits & ring-wings, `archwayVoussoirSlots` thermal arches,
 *   `extrudePolygonMesh` swept delta/canard airfoils, and `stratifiedCliffMesh` slag headwalls.
 * - WebGPU-clean physical materials: `material.physical` (`opacity: 0.42, clearcoat: 1, ior: 1.52`,
 *   `castShadow: false`) for tinted canopies & cryo shields, `clearcoat: 0, sheen: 0` on all
 *   instanced batches, and `practical: true` on every emissive surface (`emissiveIntensity > 0.1`).
 */
import {
  game,
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
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
  sculptStreamlinedHullMesh,
  sculptStylizedHeadMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  taubinSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";
import type { DroneId, DroneSpec, SceneryAnchor } from "../data";

export type ColoredRawMesh = RawMesh & { readonly colors?: Float32Array };

// ---------------------------------------------------------------------------
// Color, Vertex-Tint & Metric Bounds Fitting Helpers
// ---------------------------------------------------------------------------

export function mixHex(hexA: string, hexB: string, t: number): string {
  const a = Number.parseInt(hexA.replace("#", ""), 16);
  const b = Number.parseInt(hexB.replace("#", ""), 16);
  const u = Math.min(1, Math.max(0, t));
  const ch = (shift: number): string => {
    const ca = (a >> shift) & 255;
    const cb = (b >> shift) & 255;
    return Math.round(ca + (cb - ca) * u).toString(16).padStart(2, "0");
  };
  return `#${ch(16)}${ch(8)}${ch(0)}`;
}

function srgbHexToLinear(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (c: number): number => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return [lin((n >> 16) & 255), lin((n >> 8) & 255), lin(n & 255)];
}

function tintRawMesh(mesh: RawMesh, hex: string): ColoredRawMesh {
  const [r, g, b] = srgbHexToLinear(hex);
  const vc = mesh.positions.length / 3;
  const colors = new Float32Array(vc * 4);
  for (let i = 0; i < vc; i += 1) {
    const o = i * 4;
    colors[o] = r;
    colors[o + 1] = g;
    colors[o + 2] = b;
    colors[o + 3] = 1;
  }
  return { ...mesh, colors };
}

function mergeColoredMeshesToSpec(parts: readonly ColoredRawMesh[]): AuraCustomGeometrySpec {
  let totalVerts = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = new Float32Array(totalVerts * 4);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  let vOff = 0;
  let iOff = 0;
  for (const p of parts) {
    const vc = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (p.colors && p.colors.length === vc * 4) {
      colors.set(p.colors, vOff * 4);
    } else {
      for (let i = 0; i < vc; i += 1) {
        const co = (vOff + i) * 4;
        colors[co] = 1;
        colors[co + 1] = 1;
        colors[co + 2] = 1;
        colors[co + 3] = 1;
      }
    }
    for (let k = 0; k < p.indices.length; k += 1) indices[iOff + k] = p.indices[k]! + vOff;
    vOff += vc;
    iOff += p.indices.length;
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    colors,
    indices,
    bounds: computePositionsBounds(positions)
  });
}

function measureMeshesBounds(meshes: readonly RawMesh[]): { min: V3; max: V3 } {
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

function fitGroundedSlots(slots: readonly MultiMatSlot[], targetMaxDim: number): MultiMatSlot[] {
  const b = measureMeshesBounds(slots.map((s) => s.mesh));
  const span = Math.max(1e-4, b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const s = targetMaxDim / span;
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  const minY = b.min[1];
  return slots.map((slot) => ({
    materialIndex: slot.materialIndex,
    mesh: transformMesh(transformMesh(slot.mesh, { pos: [-cx, -minY, -cz] }), { scale: s })
  }));
}

function fitGroundedColoredSpec(parts: readonly ColoredRawMesh[], targetMaxDim: number): AuraCustomGeometrySpec {
  const b = measureMeshesBounds(parts);
  const span = Math.max(1e-4, b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  const s = targetMaxDim / span;
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  const minY = b.min[1];
  const fitted = parts.map((p) => {
    const moved = transformMesh(transformMesh(p, { pos: [-cx, -minY, -cz] }), { scale: s });
    return p.colors ? { ...moved, colors: p.colors } : moved;
  });
  return mergeColoredMeshesToSpec(fitted);
}

// ---------------------------------------------------------------------------
// Foundry & Aerospace Physical Material Library (>= 7 distinct presets)
// ---------------------------------------------------------------------------

export function droneHullPaint(specColor: string, isPlayer: boolean): AuraMaterialSpec {
  const hullHex = isPlayer ? mixHex(specColor, "#180f0b", 0.42) : mixHex(specColor, "#ffffff", 0.16);
  return material.clearcoatPaint({
    name: isPlayer ? "td orion foundry clearcoat" : "td rival aero clearcoat",
    color: hullHex,
    metallic: isPlayer ? 0.72 : 0.56,
    roughness: isPlayer ? 0.24 : 0.26,
    clearcoat: isPlayer ? 0.94 : 0.9,
    clearcoatRoughness: isPlayer ? 0.18 : 0.2,
    envMapIntensity: 0.54
  });
}

export const MAT_BRUSHED_TITANIUM: AuraMaterialSpec = material.brushedMetal({
  name: "td aero brushed titanium",
  color: "#5b677a",
  roughness: 0.28,
  anisotropy: 0.88,
  envMapIntensity: 0.62
});

export const MAT_RADIATOR_COPPER: AuraMaterialSpec = material.brushedMetal({
  name: "td heatsink radiator copper",
  color: "#cc6f38",
  roughness: 0.26,
  anisotropy: 0.9,
  envMapIntensity: 0.66
});

export const MAT_DARK_CHASSIS: AuraMaterialSpec = material.physical({
  name: "td tungsten chassis frame",
  color: "#1b222e",
  metallic: 0.88,
  roughness: 0.34,
  anisotropy: 0.7,
  clearcoat: 0.22,
  clearcoatRoughness: 0.2,
  envMapIntensity: 0.54
});

export const MAT_THERMAL_CERAMIC: AuraMaterialSpec = material.ceramic({
  name: "td thermal nozzle ceramic",
  color: "#2b303a",
  roughness: 0.36,
  clearcoat: 0.58,
  clearcoatRoughness: 0.2,
  envMapIntensity: 0.52
});

export const MAT_SEAL_RUBBER: AuraMaterialSpec = material.blackRubber({
  name: "td shock mount rubber",
  color: "#101318",
  roughness: 0.92
});

/** WebGPU-safe tinted aerospace canopy & cryo energy glass (`castShadow: false` on every consumer). */
export const MAT_CANOPY_GLASS: AuraMaterialSpec = material.physical({
  name: "td tinted cockpit canopy",
  color: "#7ce8ff",
  roughness: 0.14,
  opacity: 0.42,
  clearcoat: 1,
  clearcoatRoughness: 0.16,
  ior: 1.52,
  envMapIntensity: 0.44
});

export const MAT_CRYO_GLASS: AuraMaterialSpec = material.physical({
  name: "td cryo containment glass",
  color: "#7ce8ff",
  roughness: 0.14,
  opacity: 0.42,
  clearcoat: 1,
  clearcoatRoughness: 0.16,
  ior: 1.52,
  envMapIntensity: 0.52
});

export const MAT_AFTERBURNER_PLASMA: AuraMaterialSpec = material.emissive({
  name: "td rear afterburner plasma",
  color: "#ff6a14",
  emissive: "#ff580c",
  emissiveIntensity: 1.55,
  roughness: 0.18,
  practical: true
});

export const MAT_AFTERBURNER_CYAN: AuraMaterialSpec = material.emissive({
  name: "td rear cryo afterburner",
  color: "#18c8ff",
  emissive: "#0eb8ff",
  emissiveIntensity: 1.5,
  roughness: 0.18,
  practical: true
});

export const MAT_TAIL_STROBE_RED: AuraMaterialSpec = material.emissive({
  name: "td tail navigation strobe",
  color: "#ff244c",
  emissive: "#ff1c40",
  emissiveIntensity: 1.45,
  roughness: 0.2,
  practical: true
});

export const MAT_FURNACE_MOLTEN: AuraMaterialSpec = material.emissive({
  name: "td molten slag core",
  color: "#ff6e1a",
  emissive: "#ff5c12",
  emissiveIntensity: 1.85,
  roughness: 0.2,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_CRYO_CORE: AuraMaterialSpec = material.emissive({
  name: "td cryo coolant core",
  color: "#22ccff",
  emissive: "#16bef5",
  emissiveIntensity: 1.7,
  roughness: 0.16,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_BOOST_AMBER: AuraMaterialSpec = material.emissive({
  name: "td turbo boost chevron",
  color: "#ffb800",
  emissive: "#ffa014",
  emissiveIntensity: 1.75,
  roughness: 0.18,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_BEACON_STROBE: AuraMaterialSpec = material.emissive({
  name: "td foundry warning beacon",
  color: "#ff3b1f",
  emissive: "#ff3018",
  emissiveIntensity: 1.65,
  roughness: 0.2,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_SOOT_IRON: AuraMaterialSpec = material.pbr({
  name: "td soot cast iron",
  color: "#1b1822",
  roughness: 0.62,
  metalness: 0.78,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.35
});

export const MAT_OXIDISED_STEEL: AuraMaterialSpec = material.pbr({
  name: "td oxidised foundry steel",
  color: "#332826",
  roughness: 0.54,
  metalness: 0.72,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.3
});

export const MAT_REFRACTORY_CONCRETE: AuraMaterialSpec = material.pbr({
  name: "td refractory concrete",
  color: "#24222c",
  roughness: 0.82,
  metalness: 0.14,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 0.85
});

export const MAT_CRYOGENIC_VESSEL: AuraMaterialSpec = material.clearcoatPaint({
  name: "td cryogenic tank enamel",
  color: "#cfdce8",
  metallic: 0.34,
  roughness: 0.22,
  clearcoat: 0.76,
  clearcoatRoughness: 0.08,
  envMapIntensity: 1.48
});

/** Hardware-instanced (`> 16`) track materials: `clearcoat: 0, sheen: 0` guaranteed. */
export const MAT_INSTANCED_WALL_ARMOR: AuraMaterialSpec = material.metal({
  name: "td barrier wall armor",
  color: "#ffffff",
  roughness: 0.3,
  metallic: 0.9,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.55
});

export const MAT_INSTANCED_FIN_ARRAY: AuraMaterialSpec = material.metal({
  name: "td heatsink louver array",
  color: "#ffffff",
  roughness: 0.26,
  metallic: 0.92,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.68
});

export const MAT_BATCH_FOUNDRY_IRON: AuraMaterialSpec = material.metal({
  name: "td batched foundry iron",
  color: "#ffffff",
  roughness: 0.38,
  metallic: 0.84,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.45
});

export const MAT_BATCH_HOLO_FRAME: AuraMaterialSpec = material.emissive({
  name: "td batched holo frame",
  color: "#52ccff",
  emissive: "#1caeff",
  emissiveIntensity: 1.35,
  roughness: 0.22,
  metallic: 0.3,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_LASER_BOLT: AuraMaterialSpec = material.emissive({
  name: "td plasma laser bolt",
  color: "#ff5c26",
  emissive: "#ff4d1f",
  emissiveIntensity: 1.95,
  roughness: 0.12,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

export const MAT_DRONE_METALLIC_ALLOY: AuraMaterialSpec = material.brushedMetal({
  name: "td drone alloy radiator trim",
  color: "#ffffff",
  roughness: 0.27,
  anisotropy: 0.88,
  envMapIntensity: 0.56
});

export const MAT_DRONE_DARK_COMPOSITE: AuraMaterialSpec = material.ceramic({
  name: "td drone composite ceramic",
  color: "#ffffff",
  roughness: 0.35,
  clearcoat: 0.42,
  clearcoatRoughness: 0.2,
  envMapIntensity: 0.46
});

export const MAT_DRONE_EMISSIVE_TRIM: AuraMaterialSpec = material.emissive({
  name: "td drone plasma strobe trim",
  color: "#ffffff",
  emissive: "#ffffff",
  emissiveIntensity: 1.55,
  roughness: 0.18,
  practical: true
});

export const MAT_BATCH_EMISSIVE_GLOW: AuraMaterialSpec = material.emissive({
  name: "td batched foundry emissive",
  color: "#ffffff",
  emissive: "#ffffff",
  emissiveIntensity: 1.72,
  roughness: 0.18,
  clearcoat: 0,
  sheen: 0,
  practical: true
});

// ---------------------------------------------------------------------------
// Aerospace Combat Hover-Drone Sculpting Primitives (`DRONE_MAT` indices)
// 0: hull clearcoat, 1: brushed titanium, 2: radiator copper, 3: dark chassis,
// 4: thermal ceramic, 5: afterburner plasma, 6: tail strobe red
// ---------------------------------------------------------------------------

function fuselageRing(
  z: number,
  rx: number,
  ryTop: number,
  ryBot: number,
  yOff = 0,
  chineSharpness = 0.86,
  pts = 18
): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i += 1) {
    const a = (i / pts) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), chineSharpness);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), sa >= 0 ? 0.9 : 1.06);
    ring.push([sx * rx, yOff + sy * (sa >= 0 ? ryTop : ryBot), z]);
  }
  return ring;
}

/** Smooth Catmull-Rom swept tube helper (`flatShaded = false`) for aerospace rails, manifolds & pilot trim. */
function smoothDroneTubeMesh(controlPts: readonly V4[], samplesPerSpan = 4, radialSegments = 14): RawMesh {
  if (controlPts.length < 2) return tubeSweepMesh(controlPts, radialSegments, false);
  const pts3 = controlPts.map((p): V3 => [p[0], p[1], p[2]]);
  const curve = catmullRomSpline3(pts3, samplesPerSpan, false);
  const dense: V4[] = [];
  for (let i = 0; i < curve.length; i += 1) {
    const t = curve.length > 1 ? i / (curve.length - 1) : 0;
    const fIdx = t * (controlPts.length - 1);
    const i0 = Math.min(controlPts.length - 1, Math.floor(fIdx));
    const i1 = Math.min(controlPts.length - 1, i0 + 1);
    const frac = fIdx - i0;
    const r = controlPts[i0]![3] + (controlPts[i1]![3] - controlPts[i0]![3]) * frac;
    dense.push([curve[i]![0], curve[i]![1], curve[i]![2], r]);
  }
  return tubeSweepMesh(dense, radialSegments, false);
}

/**
 * Smooth 12-point cambered NACA teardrop airfoil wing/canard lofted across spanwise stations (`flatShaded = false`),
 * eliminating flat extruded slab wings.
 */
function buildSweptAirfoilMesh(
  stations: readonly {
    readonly x: number;
    readonly y: number;
    readonly zLead: number;
    readonly chord: number;
    readonly thickness: number;
  }[],
  side: -1 | 1 = 1
): RawMesh {
  const mkSection = (st: (typeof stations)[number]): V3[] => {
    const x = st.x * side;
    const y = st.y;
    const z0 = st.zLead;
    const c = st.chord;
    const h = st.thickness * 0.5;
    const camber = h * 0.24;
    const pts: V3[] = [
      [x, y, z0],
      [x, y + h * 0.62 + camber * 0.45, z0 + c * 0.08],
      [x, y + h + camber, z0 + c * 0.26],
      [x, y + h * 0.88 + camber * 0.9, z0 + c * 0.52],
      [x, y + h * 0.48 + camber * 0.5, z0 + c * 0.78],
      [x, y + h * 0.14, z0 + c * 0.96],
      [x, y, z0 + c],
      [x, y - h * 0.14, z0 + c * 0.96],
      [x, y - h * 0.42 + camber * 0.2, z0 + c * 0.76],
      [x, y - h * 0.74 + camber * 0.28, z0 + c * 0.48],
      [x, y - h * 0.82 + camber * 0.2, z0 + c * 0.22],
      [x, y - h * 0.52, z0 + c * 0.07]
    ];
    return side > 0 ? pts : [...pts].reverse();
  };
  const ordered = side > 0 ? stations : [...stations].reverse();
  const raw = loftSectionsMesh(ordered.map(mkSection), true, false);
  return taubinSmoothMesh(subdivideSmoothMesh(raw, 1, 0.46), 2, 0.46, -0.485);
}

/** Smooth cambered vertical/canted tail stabilizer fin lofted from root to tip (`flatShaded = false`). */
function buildVerticalFinAirfoilMesh(
  stations: readonly {
    readonly x: number;
    readonly y: number;
    readonly zLead: number;
    readonly chord: number;
    readonly thickness: number;
  }[]
): RawMesh {
  const mkSection = (st: (typeof stations)[number]): V3[] => {
    const x = st.x;
    const y = st.y;
    const z0 = st.zLead;
    const c = st.chord;
    const hw = st.thickness * 0.5;
    return [
      [x, y, z0],
      [x + hw * 0.68, y, z0 + c * 0.1],
      [x + hw, y, z0 + c * 0.3],
      [x + hw * 0.78, y, z0 + c * 0.62],
      [x + hw * 0.26, y, z0 + c * 0.92],
      [x, y, z0 + c],
      [x - hw * 0.26, y, z0 + c * 0.92],
      [x - hw * 0.78, y, z0 + c * 0.62],
      [x - hw, y, z0 + c * 0.3],
      [x - hw * 0.68, y, z0 + c * 0.1]
    ];
  };
  return taubinSmoothMesh(subdivideSmoothMesh(loftSectionsMesh(stations.map(mkSection), true, false), 1, 0.46), 2, 0.46, -0.485);
}

function buildCanopyBubbleMesh(zFront: number, zRear: number, width: number, height: number, baseY: number): RawMesh {
  const span = zRear - zFront;
  const raw = loftSectionsMesh(
    [
      fuselageRing(zFront, width * 0.12, height * 0.08, 0.015, baseY - 0.005, 0.94, 20),
      fuselageRing(zFront + span * 0.1, width * 0.32, height * 0.48, 0.035, baseY + 0.008, 0.92, 20),
      fuselageRing(zFront + span * 0.24, width * 0.47, height * 0.84, 0.052, baseY + 0.02, 0.9, 20),
      fuselageRing(zFront + span * 0.42, width * 0.52, height * 1.02, 0.06, baseY + 0.03, 0.89, 20),
      fuselageRing(zFront + span * 0.58, width * 0.52, height * 1.05, 0.06, baseY + 0.032, 0.89, 20),
      fuselageRing(zFront + span * 0.74, width * 0.45, height * 0.86, 0.05, baseY + 0.026, 0.9, 20),
      fuselageRing(zFront + span * 0.88, width * 0.31, height * 0.52, 0.032, baseY + 0.016, 0.92, 20),
      fuselageRing(zRear, width * 0.15, height * 0.16, 0.016, baseY + 0.006, 0.94, 20)
    ],
    true,
    false
  );
  return taubinSmoothMesh(subdivideSmoothMesh(raw, 1, 0.52), 3, 0.46, -0.485);
}

/**
 * Sculpted recessed dark-composite cockpit tub + G-suit aerospace pilot bust, contoured flight helmet &
 * glowing HUD visor band tucked cleanly inside `[zFront..zRear]` beneath the `0.42`-opacity canopy bubble.
 */
function addCockpitPilotAssembly(
  slots: MultiMatSlot[],
  zFront: number,
  zRear: number,
  width: number,
  height: number,
  baseY: number
): void {
  const span = zRear - zFront;
  const zPilot = zFront + span * 0.54;
  const zConsole = zFront + span * 0.24;
  const tubHalfW = width * 0.42;

  // Recessed dark-composite cockpit coaming & bucket tub (`materialIndex: 3`)
  const tubRing = (z: number, hw: number, yFloor: number, yRim: number): V3[] => [
    [0, yFloor, z],
    [hw * 0.65, yFloor + 0.01, z],
    [hw, (yFloor + yRim) * 0.55, z],
    [hw * 0.92, yRim, z],
    [0, yRim + 0.008, z],
    [-hw * 0.92, yRim, z],
    [-hw, (yFloor + yRim) * 0.55, z],
    [-hw * 0.65, yFloor + 0.01, z]
  ];
  slots.push({
    mesh: taubinSmoothMesh(
      loftSectionsMesh(
        [
          tubRing(zFront + span * 0.1, tubHalfW * 0.58, baseY - 0.04, baseY + 0.025),
          tubRing(zFront + span * 0.34, tubHalfW * 0.96, baseY - 0.08, baseY + 0.038),
          tubRing(zFront + span * 0.66, tubHalfW, baseY - 0.085, baseY + 0.042),
          tubRing(zFront + span * 0.9, tubHalfW * 0.62, baseY - 0.035, baseY + 0.03)
        ],
        true,
        false
      ),
      2,
      0.45,
      -0.475
    ),
    materialIndex: 3
  });

  // Curved holographic HUD glare-shield coaming + ejection headrest bolsters (`materialIndex: 3` & `1`)
  slots.push({
    mesh: smoothDroneTubeMesh(
      [
        [-tubHalfW * 0.66, baseY + 0.04, zConsole + 0.04, 0.022],
        [0, baseY + height * 0.36, zConsole, 0.028],
        [tubHalfW * 0.66, baseY + 0.04, zConsole + 0.04, 0.022]
      ],
      4,
      12
    ),
    materialIndex: 3
  });

  // Sculpted pilot G-suit shoulders & torso (`materialIndex: 3`) + titanium neck collar (`materialIndex: 1`)
  const shoulderW = width * 0.31;
  slots.push({
    mesh: smoothDroneTubeMesh(
      [
        [-shoulderW, baseY + height * 0.16, zPilot + 0.03, height * 0.2],
        [-shoulderW * 0.52, baseY + height * 0.3, zPilot + 0.01, height * 0.24],
        [0, baseY + height * 0.34, zPilot, height * 0.25],
        [shoulderW * 0.52, baseY + height * 0.3, zPilot + 0.01, height * 0.24],
        [shoulderW, baseY + height * 0.16, zPilot + 0.03, height * 0.2]
      ],
      4,
      14
    ),
    materialIndex: 3
  });

  // Sculpted aerodynamic flight helmet (`sculptStylizedHeadMesh` + `subdivideSmoothMesh` + `taubinSmoothMesh`)
  const helmetR = Math.min(width * 0.24, height * 0.36);
  const helmetY = baseY + height * 0.62;
  const helmetMesh = taubinSmoothMesh(
    subdivideSmoothMesh(
      sculptStylizedHeadMesh(helmetR, { jawTaper: 0.18, noseBridge: 0.08, craniumHeight: 1.06, seed: 23 }),
      1,
      0.52
    ),
    3,
    0.46,
    -0.485
  );
  slots.push({
    mesh: transformMesh(helmetMesh, {
      pos: [0, helmetY, zPilot - 0.015],
      rot: [-0.14, Math.PI, 0],
      scale: [1.02, 0.98, 1.15]
    }),
    materialIndex: 1
  });

  // Glowing aerospace HUD visor band (`materialIndex: 5`) + copper oxygen/comms conduit (`materialIndex: 2`)
  slots.push({
    mesh: transformMesh(
      smoothDroneTubeMesh(
        [
          [-helmetR * 0.84, helmetY + helmetR * 0.02, zPilot - helmetR * 0.42, helmetR * 0.22],
          [-helmetR * 0.48, helmetY + helmetR * 0.06, zPilot - helmetR * 0.88, helmetR * 0.26],
          [0, helmetY + helmetR * 0.08, zPilot - helmetR * 1.04, helmetR * 0.27],
          [helmetR * 0.48, helmetY + helmetR * 0.06, zPilot - helmetR * 0.88, helmetR * 0.26],
          [helmetR * 0.84, helmetY + helmetR * 0.02, zPilot - helmetR * 0.42, helmetR * 0.22]
        ],
        4,
        14
      ),
      { scale: [1, 0.78, 0.72] }
    ),
    materialIndex: 5
  });
  slots.push({
    mesh: smoothDroneTubeMesh(
      [
        [0, helmetY - helmetR * 0.34, zPilot - helmetR * 0.92, helmetR * 0.12],
        [helmetR * 0.28, baseY + height * 0.34, zPilot - helmetR * 0.65, helmetR * 0.1],
        [helmetR * 0.36, baseY + height * 0.16, zPilot - helmetR * 0.32, helmetR * 0.09]
      ],
      3,
      10
    ),
    materialIndex: 2
  });
}

function sculptInterceptorFuselageMesh(
  length: number,
  width: number,
  height: number,
  opts: {
    readonly noseSharpness?: number;
    readonly tailTaper?: number;
    readonly canopyBulge?: number;
    readonly undersideFlat?: number;
    readonly yOffset?: number;
    readonly zOffset?: number;
  } = {}
): RawMesh {
  const hull = sculptStreamlinedHullMesh(length, width, height, {
    noseSharpness: opts.noseSharpness ?? 0.74,
    tailTaper: opts.tailTaper ?? 0.48,
    canopyBulge: opts.canopyBulge ?? 0.26,
    undersideFlat: opts.undersideFlat ?? 0.42,
    stations: 17,
    ringPoints: 20
  });
  const oriented = transformMesh(hull, {
    rot: [0, Math.PI, 0],
    pos: [0, opts.yOffset ?? 0.03, opts.zOffset ?? -0.16]
  });
  return taubinSmoothMesh(subdivideSmoothMesh(oriented, 1, 0.5), 3, 0.46, -0.485);
}

/**
 * Sleek variable-geometry aerospace engine nacelles (`loftSectionsMesh` dark-titanium outer pod + `28`-segment `latheMesh`
 * recessed thermal-ceramic Venturi throat & `24`-segment dark turbine core + 8 contoured iris vectoring petals +
 * inner plasma flameholder ring) facing the `+Z` chase camera without white emissive blowout.
 */
function addDualVectorNozzles(slots: MultiMatSlot[], lateral = 0.44, y = -0.04, zExit = 1.52): void {
  const throatLinerProfile: V2[] = [
    [0.215, -0.18],
    [0.226, -0.03],
    [0.196, 0.088],
    [0.182, 0.094],
    [0.168, 0.08],
    [0.148, -0.04],
    [0.142, -0.2]
  ];
  const darkTurbineConeProfile: V2[] = [
    [0, 0.035],
    [0.048, -0.008],
    [0.096, -0.115],
    [0.138, -0.18],
    [0, -0.2]
  ];
  const petalCurve: V4[] = [
    [0, 0.205, -0.095, 0.018],
    [0, 0.194, 0, 0.021],
    [0, 0.172, 0.098, 0.015]
  ];
  const basePetal = transformMesh(smoothDroneTubeMesh(petalCurve, 3, 10), { scale: [2.1, 0.58, 1] });
  const plasmaFlameholderRing = tubeSweepMesh(
    Array.from({ length: 25 }, (_, k) => {
      const a = (k / 24) * Math.PI * 2;
      return [Math.cos(a) * 0.128, Math.sin(a) * 0.128, 0, 0.015] as V4;
    }),
    12,
    false
  );

  for (const side of [-1, 1] as const) {
    const nx = side * lateral;
    // Streamlined outer dark-tungsten nacelle pod blending into the aft fuselage
    const nacellePod = taubinSmoothMesh(
      loftSectionsMesh(
        [
          fuselageRing(zExit - 0.6, 0.238, 0.198, 0.188, y, 0.72, 16),
          fuselageRing(zExit - 0.4, 0.252, 0.216, 0.202, y, 0.7, 16),
          fuselageRing(zExit - 0.2, 0.254, 0.218, 0.204, y, 0.72, 16),
          fuselageRing(zExit - 0.03, 0.22, 0.195, 0.188, y, 0.78, 16)
        ],
        true,
        false
      ),
      2,
      0.45,
      -0.475
    );
    slots.push(
      { mesh: transformMesh(nacellePod, { pos: [nx, 0, 0] }), materialIndex: 3 },
      {
        mesh: transformMesh(latheMesh(throatLinerProfile, 28), { pos: [nx, y, zExit - 0.06], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 4
      },
      {
        mesh: transformMesh(latheMesh(darkTurbineConeProfile, 24), { pos: [nx, y, zExit - 0.14], rot: [Math.PI * 0.5, 0, 0] }),
        materialIndex: 3
      },
      {
        mesh: transformMesh(plasmaFlameholderRing, { pos: [nx, y, zExit - 0.07] }),
        materialIndex: 5
      }
    );
    // 8 overlapping variable-geometry convergent iris vectoring petals
    for (let k = 0; k < 8; k += 1) {
      const angle = ((k + 0.5) / 8) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(basePetal, { pos: [nx, y, zExit + 0.015], rot: [0, 0, angle] }),
        materialIndex: k % 2 === 0 ? 4 : 1
      });
    }
  }
  // Sculpted teardrop dorsal & wingtip `+Z` navigation strobes
  const strobePod = transformMesh(
    latheMesh(
      [
        [0, -0.045],
        [0.028, -0.025],
        [0.032, 0.015],
        [0.02, 0.04],
        [0, 0.048]
      ],
      18
    ),
    { rot: [Math.PI * 0.5, 0, 0] }
  );
  slots.push(
    { mesh: transformMesh(strobePod, { pos: [0, y + 0.33, zExit - 0.06], scale: [1.35, 0.9, 1] }), materialIndex: 6 },
    { mesh: transformMesh(strobePod, { pos: [-0.92, y + 0.12, zExit - 0.18] }), materialIndex: 6 },
    { mesh: transformMesh(strobePod, { pos: [0.92, y + 0.12, zExit - 0.18] }), materialIndex: 6 }
  );
}

/**
 * High-segment (`28` radial segments) quad lift-fan bellmouth shrouds + hub spinners aligned to `ROTOR_DISC`
 * (`[±1.05, +0.22, ±0.88]`) plus contoured copper/titanium radiator fin array.
 */
function addQuadLiftShroudsAndRadiators(slots: MultiMatSlot[], finCount = 7, radiatorZ = 0.44, radiatorY = 0.29): void {
  const ductProfile: V2[] = [
    [0.242, -0.058],
    [0.295, -0.045],
    [0.328, -0.004],
    [0.324, 0.048],
    [0.296, 0.072],
    [0.252, 0.066],
    [0.236, 0.02],
    [0.242, -0.058]
  ];
  const spinnerProfile: V2[] = [
    [0, -0.035],
    [0.062, -0.02],
    [0.058, 0.028],
    [0.024, 0.064],
    [0, 0.074]
  ];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      slots.push(
        {
          mesh: transformMesh(latheMesh(ductProfile, 28), { pos: [sx * 1.02, 0.16, sz * 0.84] }),
          materialIndex: 1
        },
        {
          mesh: transformMesh(latheMesh(spinnerProfile, 24), { pos: [sx * 1.02, 0.16, sz * 0.84] }),
          materialIndex: 3
        }
      );
    }
    // Contoured titanium radiator manifold rails flanking the copper heatsink louvers
    const railHalfZ = (finCount * 0.11 + 0.14) * 0.5;
    slots.push({
      mesh: transformMesh(
        smoothDroneTubeMesh(
          [
            [sx * 0.31, radiatorY - 0.025, radiatorZ - railHalfZ, 0.028],
            [sx * 0.31, radiatorY - 0.015, radiatorZ, 0.036],
            [sx * 0.31, radiatorY - 0.025, radiatorZ + railHalfZ, 0.028]
          ],
          4,
          12
        ),
        { scale: [0.95, 1.25, 1] }
      ),
      materialIndex: 1
    });
  }
  const finSpan = Math.max(1, finCount - 1) * 0.105;
  for (let i = 0; i < finCount; i += 1) {
    const fz = radiatorZ - finSpan * 0.5 + i * 0.105;
    const finArc: V4[] = [
      [-0.285, radiatorY - 0.018, fz + 0.012, 0.014],
      [0, radiatorY + 0.018, fz - 0.008, 0.016],
      [0.285, radiatorY - 0.018, fz + 0.012, 0.014]
    ];
    slots.push({
      mesh: transformMesh(smoothDroneTubeMesh(finArc, 4, 10), { scale: [1, 4.6, 0.85] }),
      materialIndex: 2
    });
  }
  // Glowing thermal core manifold running through the copper radiator bank
  slots.push({
    mesh: smoothDroneTubeMesh(
      [
        [-0.22, radiatorY - 0.02, radiatorZ - finSpan * 0.48, 0.026],
        [0, radiatorY + 0.01, radiatorZ, 0.032],
        [0.22, radiatorY - 0.02, radiatorZ + finSpan * 0.48, 0.026]
      ],
      4,
      14
    ),
    materialIndex: 5
  });
}

interface DroneSculptResult {
  readonly slots: MultiMatSlot[];
  readonly canopy: RawMesh;
  readonly cyanBurner?: boolean;
}

/** 1. ORION: Balanced twin-strake thermal-interceptor craft (`sculptStreamlinedHullMesh` + cambered airfoils + pilot). */
function sculptOrion(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.48, 1.38, 0.68, {
      noseSharpness: 0.76,
      tailTaper: 0.52,
      canopyBulge: 0.3,
      undersideFlat: 0.44,
      yOffset: 0.04,
      zOffset: -0.18
    }),
    materialIndex: 0
  });
  // Smooth cambered blended delta-strake wings + twin canted dorsal tail airfoils + smooth S-duct intake cowls
  const wingStations = [
    { x: 0.42, y: 0.035, zLead: -0.68, chord: 1.62, thickness: 0.115 },
    { x: 0.88, y: 0.028, zLead: -0.24, chord: 1.18, thickness: 0.088 },
    { x: 1.32, y: 0.018, zLead: 0.14, chord: 0.76, thickness: 0.058 },
    { x: 1.56, y: 0.012, zLead: 0.34, chord: 0.52, thickness: 0.032 }
  ] as const;
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: buildSweptAirfoilMesh(wingStations, side),
      materialIndex: 0
    });
    const intakeCowl = taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            fuselageRing(-0.86, 0.185, 0.145, 0.125, -0.02, 0.76, 16),
            fuselageRing(-0.42, 0.228, 0.172, 0.144, -0.014, 0.74, 16),
            fuselageRing(0.12, 0.242, 0.182, 0.152, -0.01, 0.74, 16),
            fuselageRing(0.78, 0.208, 0.158, 0.138, -0.01, 0.8, 16)
          ],
          true,
          false
        ),
        1,
        0.5
      ),
      2,
      0.46,
      -0.485
    );
    slots.push({
      mesh: transformMesh(intakeCowl, { pos: [side * 0.58, 0, 0] }),
      materialIndex: 1
    });
    // Canted cambered dorsal stabilizer fin + curved copper leading-edge strake
    const finMesh = buildVerticalFinAirfoilMesh([
      { x: 0, y: 0, zLead: -0.34, chord: 0.68, thickness: 0.064 },
      { x: 0, y: 0.34, zLead: -0.14, chord: 0.52, thickness: 0.048 },
      { x: 0, y: 0.68, zLead: 0.08, chord: 0.34, thickness: 0.026 }
    ]);
    slots.push(
      {
        mesh: transformMesh(finMesh, {
          pos: [side * 0.54, 0.18, 0.82],
          rot: [0, 0, side * -0.34]
        }),
        materialIndex: 0
      },
      {
        mesh: smoothDroneTubeMesh(
          [
            [side * 0.55, 0.22, 0.5, 0.016],
            [side * 0.65, 0.5, 0.72, 0.018],
            [side * 0.74, 0.78, 0.94, 0.013]
          ],
          4,
          12
        ),
        materialIndex: 2
      }
    );
  }
  addCockpitPilotAssembly(slots, -1.08, 0.08, 0.56, 0.28, 0.23);
  addQuadLiftShroudsAndRadiators(slots, 7, 0.46, 0.31);
  addDualVectorNozzles(slots, 0.44, -0.02, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.08, 0.08, 0.56, 0.28, 0.23) };
}

/** 2. VOLT: Split-prong arc catamaran racer with forward plasma arc-bridge. */
function sculptVolt(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(2.58, 0.96, 0.62, {
      noseSharpness: 0.68,
      tailTaper: 0.54,
      canopyBulge: 0.28,
      undersideFlat: 0.4,
      yOffset: 0.05,
      zOffset: 0.16
    }),
    materialIndex: 0
  });
  // Twin forward-projecting smooth catamaran needle prongs + wing-root fairings + cambered outer arc-fins
  for (const side of [-1, 1] as const) {
    const prong = taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            fuselageRing(-1.86, 0.04, 0.04, 0.04, -0.02, 0.92, 16),
            fuselageRing(-1.42, 0.13, 0.12, 0.11, -0.015, 0.84, 16),
            fuselageRing(-0.82, 0.21, 0.18, 0.15, -0.005, 0.78, 16),
            fuselageRing(-0.08, 0.252, 0.212, 0.172, 0.01, 0.76, 16),
            fuselageRing(0.88, 0.232, 0.184, 0.162, 0, 0.8, 16),
            fuselageRing(1.36, 0.168, 0.14, 0.128, -0.02, 0.86, 16)
          ],
          true,
          false
        ),
        1,
        0.5
      ),
      2,
      0.46,
      -0.485
    );
    slots.push({ mesh: transformMesh(prong, { pos: [side * 0.66, 0, 0] }), materialIndex: 0 });
    slots.push({
      mesh: buildSweptAirfoilMesh(
        [
          { x: 0.22, y: 0.03, zLead: -0.18, chord: 0.64, thickness: 0.11 },
          { x: 0.58, y: 0.025, zLead: -0.12, chord: 0.56, thickness: 0.095 }
        ],
        side
      ),
      materialIndex: 3
    });
    slots.push({
      mesh: buildSweptAirfoilMesh(
        [
          { x: 0.78, y: 0.015, zLead: -0.22, chord: 0.92, thickness: 0.072 },
          { x: 1.18, y: 0.01, zLead: 0.08, chord: 0.72, thickness: 0.052 },
          { x: 1.48, y: 0.005, zLead: 0.35, chord: 0.48, thickness: 0.03 }
        ],
        side
      ),
      materialIndex: 1
    });
  }
  // Forward plasma arc-capacitor bridge between the twin prongs
  slots.push({
    mesh: smoothDroneTubeMesh(
      [
        [-0.6, -0.01, -1.24, 0.044],
        [-0.3, 0.035, -1.3, 0.056],
        [0, 0.052, -1.325, 0.062],
        [0.3, 0.035, -1.3, 0.056],
        [0.6, -0.01, -1.24, 0.044]
      ],
      4,
      16
    ),
    materialIndex: 5
  });
  addCockpitPilotAssembly(slots, -0.84, 0.26, 0.5, 0.26, 0.24);
  addQuadLiftShroudsAndRadiators(slots, 7, 0.48, 0.29);
  addDualVectorNozzles(slots, 0.44, -0.03, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-0.84, 0.26, 0.5, 0.26, 0.24), cyanBurner: true };
}

/** 3. BASTION: Armored heavy gunship with twin oversized intake shrouds & dorsal cannon housing. */
function sculptBastion(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.32, 1.62, 0.76, {
      noseSharpness: 0.58,
      tailTaper: 0.56,
      canopyBulge: 0.24,
      undersideFlat: 0.5,
      yOffset: 0.04,
      zOffset: -0.14
    }),
    materialIndex: 0
  });
  const coneProfile: V2[] = [[0, -0.22], [0.09, -0.08], [0.142, 0.04], [0.112, 0.16], [0, 0.18]];
  for (const side of [-1, 1] as const) {
    const shroud = taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            fuselageRing(-1.06, 0.29, 0.24, 0.22, 0.02, 0.66, 16),
            fuselageRing(-0.56, 0.33, 0.27, 0.235, 0.02, 0.66, 16),
            fuselageRing(0.18, 0.34, 0.28, 0.24, 0.018, 0.68, 16),
            fuselageRing(0.84, 0.305, 0.255, 0.218, 0.008, 0.72, 16),
            fuselageRing(1.32, 0.24, 0.2, 0.18, -0.01, 0.78, 16)
          ],
          true,
          false
        ),
        1,
        0.48
      ),
      2,
      0.46,
      -0.485
    );
    slots.push({ mesh: transformMesh(shroud, { pos: [side * 0.86, 0, 0] }), materialIndex: 1 });
    slots.push({
      mesh: transformMesh(latheMesh(coneProfile, 26), { pos: [side * 0.86, 0.02, -1.04], rot: [-Math.PI * 0.5, 0, 0] }),
      materialIndex: 2
    });
    slots.push({
      mesh: buildSweptAirfoilMesh(
        [
          { x: 1.02, y: 0.02, zLead: -0.48, chord: 1.16, thickness: 0.16 },
          { x: 1.46, y: -0.05, zLead: -0.34, chord: 0.94, thickness: 0.09 }
        ],
        side
      ),
      materialIndex: 3
    });
  }
  const dorsalTurretPod = taubinSmoothMesh(
    subdivideSmoothMesh(
      loftSectionsMesh(
        [
          fuselageRing(0.04, 0.16, 0.08, 0.05, 0.42, 0.78, 14),
          fuselageRing(0.28, 0.22, 0.1, 0.06, 0.43, 0.76, 14),
          fuselageRing(0.62, 0.18, 0.08, 0.05, 0.42, 0.8, 14)
        ],
        true,
        false
      ),
      1,
      0.48
    ),
    2,
    0.46,
    -0.485
  );
  slots.push(
    { mesh: dorsalTurretPod, materialIndex: 3 },
    { mesh: smoothDroneTubeMesh([[-0.11, 0.44, -0.36, 0.028], [-0.11, 0.44, -0.12, 0.034], [-0.11, 0.44, 0.12, 0.038]], 3, 16), materialIndex: 1 },
    { mesh: smoothDroneTubeMesh([[0.11, 0.44, -0.36, 0.028], [0.11, 0.44, -0.12, 0.034], [0.11, 0.44, 0.12, 0.038]], 3, 16), materialIndex: 1 }
  );
  addCockpitPilotAssembly(slots, -1.12, -0.12, 0.6, 0.25, 0.28);
  addQuadLiftShroudsAndRadiators(slots, 8, 0.88, 0.35);
  addDualVectorNozzles(slots, 0.46, -0.03, 1.54);
  return { slots, canopy: buildCanopyBubbleMesh(-1.12, -0.12, 0.6, 0.25, 0.28) };
}

/** 4. SPECTRE: Forward-swept stealth delta with twin cryo-cooled laser barrel shrouds. */
function sculptSpectre(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.42, 1.26, 0.62, {
      noseSharpness: 0.82,
      tailTaper: 0.48,
      canopyBulge: 0.26,
      undersideFlat: 0.46,
      yOffset: 0.03,
      zOffset: -0.2
    }),
    materialIndex: 0
  });
  const barrelProfile: V2[] = [[0.045, -0.75], [0.068, -0.55], [0.068, 0.45], [0.096, 0.65], [0.075, 0.75]];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: buildSweptAirfoilMesh(
        [
          { x: 0.46, y: 0.015, zLead: -0.16, chord: 1.06, thickness: 0.09 },
          { x: 1.08, y: 0.01, zLead: -0.54, chord: 0.82, thickness: 0.068 },
          { x: 1.64, y: 0.005, zLead: -0.88, chord: 0.48, thickness: 0.036 }
        ],
        side
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(latheMesh(barrelProfile, 26), { pos: [side * 0.68, 0.02, -0.58], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: 1
    });
    const vTail = buildVerticalFinAirfoilMesh([
      { x: 0, y: 0, zLead: -0.24, chord: 0.52, thickness: 0.052 },
      { x: 0, y: 0.32, zLead: -0.06, chord: 0.42, thickness: 0.038 },
      { x: 0, y: 0.6, zLead: 0.12, chord: 0.3, thickness: 0.022 }
    ]);
    slots.push({
      mesh: transformMesh(vTail, {
        pos: [side * 0.42, 0.16, 0.88],
        rot: [0, 0, side * -0.52]
      }),
      materialIndex: 3
    });
  }
  addCockpitPilotAssembly(slots, -1.12, 0.04, 0.5, 0.25, 0.22);
  addQuadLiftShroudsAndRadiators(slots, 7, 0.46, 0.27);
  addDualVectorNozzles(slots, 0.44, -0.03, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.12, 0.04, 0.5, 0.25, 0.22), cyanBurner: true };
}

/** 5. RAZOR: Needle-nose canard racer with dorsal ram-air scoop & scimitar blades. */
function sculptRazor(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.52, 1.16, 0.64, {
      noseSharpness: 0.86,
      tailTaper: 0.5,
      canopyBulge: 0.28,
      undersideFlat: 0.42,
      yOffset: 0.03,
      zOffset: -0.22
    }),
    materialIndex: 0
  });
  // Smooth dorsal ram-air scoop intake (`flatShaded = false`)
  slots.push({
    mesh: taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            fuselageRing(0.04, 0.17, 0.14, 0.05, 0.3, 0.8, 16),
            fuselageRing(0.32, 0.21, 0.165, 0.058, 0.3, 0.78, 16),
            fuselageRing(0.68, 0.215, 0.165, 0.058, 0.29, 0.8, 16),
            fuselageRing(1.18, 0.15, 0.1, 0.04, 0.25, 0.86, 16)
          ],
          true,
          false
        ),
        1,
        0.5
      ),
      2,
      0.46,
      -0.485
    ),
    materialIndex: 1
  });
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: buildSweptAirfoilMesh(
          [
            { x: 0.18, y: 0.02, zLead: -1.32, chord: 0.38, thickness: 0.055 },
            { x: 0.76, y: 0.015, zLead: -1.04, chord: 0.24, thickness: 0.028 }
          ],
          side
        ),
        materialIndex: 1
      },
      {
        mesh: buildSweptAirfoilMesh(
          [
            { x: 0.42, y: 0.02, zLead: -0.08, chord: 1.06, thickness: 0.088 },
            { x: 1.04, y: 0.015, zLead: 0.28, chord: 0.78, thickness: 0.064 },
            { x: 1.56, y: 0.008, zLead: 0.62, chord: 0.44, thickness: 0.032 }
          ],
          side
        ),
        materialIndex: 0
      },
      {
        mesh: transformMesh(
          buildVerticalFinAirfoilMesh([
            { x: 0, y: 0, zLead: -0.34, chord: 0.68, thickness: 0.05 },
            { x: 0, y: -0.24, zLead: -0.22, chord: 0.48, thickness: 0.028 }
          ]),
          { pos: [side * 0.34, -0.08, 0.62], rot: [0, 0, side * 0.28] }
        ),
        materialIndex: 3
      }
    );
  }
  addCockpitPilotAssembly(slots, -1.18, 0.04, 0.46, 0.26, 0.23);
  addQuadLiftShroudsAndRadiators(slots, 7, 0.68, 0.38);
  addDualVectorNozzles(slots, 0.44, -0.03, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.18, 0.04, 0.46, 0.26, 0.23) };
}

/** 6. NIGHTHAWK: Twin-boom strike craft with inverted V-tail bridge & ordnance pylons. */
function sculptNighthawk(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.32, 1.2, 0.64, {
      noseSharpness: 0.78,
      tailTaper: 0.46,
      canopyBulge: 0.26,
      undersideFlat: 0.48,
      yOffset: 0.03,
      zOffset: -0.22
    }),
    materialIndex: 0
  });
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: buildSweptAirfoilMesh(
        [
          { x: 0.46, y: 0.02, zLead: -0.42, chord: 1.18, thickness: 0.09 },
          { x: 1.02, y: 0.015, zLead: -0.1, chord: 0.88, thickness: 0.068 },
          { x: 1.54, y: 0.008, zLead: 0.18, chord: 0.52, thickness: 0.034 }
        ],
        side
      ),
      materialIndex: 0
    });
    const boom = taubinSmoothMesh(
      subdivideSmoothMesh(
        loftSectionsMesh(
          [
            fuselageRing(-0.36, 0.12, 0.11, 0.1, 0, 0.8, 16),
            fuselageRing(0.18, 0.15, 0.132, 0.12, 0.014, 0.78, 16),
            fuselageRing(0.88, 0.142, 0.126, 0.115, 0.028, 0.8, 16),
            fuselageRing(1.56, 0.1, 0.1, 0.09, 0.04, 0.86, 16)
          ],
          true,
          false
        ),
        1,
        0.48
      ),
      2,
      0.46,
      -0.485
    );
    slots.push(
      { mesh: transformMesh(boom, { pos: [side * 0.86, 0, 0] }), materialIndex: 1 },
      {
        mesh: transformMesh(
          latheMesh([[0, -0.05], [0.042, -0.02], [0.045, 0.03], [0, 0.055]], 18),
          { pos: [side * 0.86, 0.06, 1.58], rot: [Math.PI * 0.5, 0, 0] }
        ),
        materialIndex: 6
      },
      {
        mesh: smoothDroneTubeMesh(
          [
            [side * 1.18, -0.14, -0.28, 0.045],
            [side * 1.18, -0.14, 0.08, 0.064],
            [side * 1.18, -0.14, 0.44, 0.052]
          ],
          3,
          16
        ),
        materialIndex: 3
      },
      {
        mesh: smoothDroneTubeMesh(
          [
            [side * 0.86, 0.08, 1.28, 0.048],
            [side * 0.55, 0.31, 1.33, 0.046],
            [side * 0.24, 0.48, 1.38, 0.042]
          ],
          3,
          14
        ),
        materialIndex: 3
      }
    );
  }
  slots.push({
    mesh: buildSweptAirfoilMesh(
      [
        { x: -0.28, y: 0.48, zLead: 1.24, chord: 0.28, thickness: 0.052 },
        { x: 0, y: 0.495, zLead: 1.22, chord: 0.3, thickness: 0.056 },
        { x: 0.28, y: 0.48, zLead: 1.24, chord: 0.28, thickness: 0.052 }
      ],
      1
    ),
    materialIndex: 0
  });
  addCockpitPilotAssembly(slots, -1.08, -0.02, 0.52, 0.25, 0.23);
  addQuadLiftShroudsAndRadiators(slots, 6, 0.46, 0.29);
  addDualVectorNozzles(slots, 0.42, -0.03, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-1.08, -0.02, 0.52, 0.25, 0.23) };
}

/** 7. WRAITH: Ring-wing plasma interceptor with continuous annular shroud wing & split X-tail. */
function sculptWraith(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: sculptInterceptorFuselageMesh(3.42, 1.04, 0.66, {
      noseSharpness: 0.8,
      tailTaper: 0.52,
      canopyBulge: 0.3,
      undersideFlat: 0.38,
      yOffset: 0.03,
      zOffset: -0.2
    }),
    materialIndex: 0
  });
  const ringSpine: V4[] = Array.from({ length: 37 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    const x = Math.cos(a) * 1.48;
    const y = 0.08 + Math.sin(a) * 0.46;
    const z = 0.16 + Math.cos(a * 2) * 0.18;
    return [x, y, z, 0.09];
  });
  const plasmaRail: V4[] = Array.from({ length: 37 }, (_, i) => {
    const a = (i / 36) * Math.PI * 2;
    return [Math.cos(a) * 1.38, 0.08 + Math.sin(a) * 0.4, 0.22 + Math.cos(a * 2) * 0.18, 0.028];
  });
  slots.push(
    { mesh: tubeSweepMesh(ringSpine, 16, false), materialIndex: 0 },
    { mesh: tubeSweepMesh(plasmaRail, 12, false), materialIndex: 5 }
  );
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      slots.push({
        mesh: smoothDroneTubeMesh(
          [
            [sx * 0.36, 0.04 + sy * 0.08, 0.1, 0.052],
            [sx * 0.9, 0.06 + sy * 0.17, 0.14, 0.048],
            [sx * 1.42, 0.08 + sy * 0.26, 0.18, 0.044]
          ],
          3,
          12
        ),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(
          buildSweptAirfoilMesh(
            [
              { x: 0, y: 0, zLead: -0.19, chord: 0.38, thickness: 0.048 },
              { x: 0.42, y: 0, zLead: -0.12, chord: 0.26, thickness: 0.026 }
            ],
            sx
          ),
          {
            pos: [sx * 0.32, 0.04 + sy * 0.16, 1.18],
            rot: [0, 0, sx * sy * 0.58]
          }
        ),
        materialIndex: 3
      });
    }
  }
  addCockpitPilotAssembly(slots, -1.12, 0, 0.48, 0.26, 0.23);
  addQuadLiftShroudsAndRadiators(slots, 6, 0.5, 0.3);
  addDualVectorNozzles(slots, 0.42, -0.03, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-1.12, 0, 0.48, 0.26, 0.23), cyanBurner: true };
}

const DRONE_SCULPTORS: Readonly<Record<DroneId, () => DroneSculptResult>> = {
  orion: sculptOrion,
  volt: sculptVolt,
  bastion: sculptBastion,
  spectre: sculptSpectre,
  razor: sculptRazor,
  nighthawk: sculptNighthawk,
  wraith: sculptWraith
};

type AuraGroupNodeBuilder = ReturnType<typeof group>;

export function buildCombatDroneNode(id: DroneId, spec: DroneSpec): AuraGroupNodeBuilder {
  const isPlayer = id === "orion";
  const hullSpec = memoizeGeometry(`td:drone-hull:v3:${id}:${spec.maxDim}`, () => {
    const sculpted = DRONE_SCULPTORS[id]();
    const bounds = measureMeshesBounds([...sculpted.slots.map((s) => s.mesh), sculpted.canopy]);
    const rawMax = Math.max(1e-4, bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
    const scale = spec.maxDim / rawMax;
    const burnerHex = sculpted.cyanBurner ? "#18c8ff" : "#ff6a14";
    const coalescedSlots: MultiMatSlot[] = [];
    for (const s of sculpted.slots) {
      const scaled = transformMesh(s.mesh, { scale });
      if (s.materialIndex === 0) {
        coalescedSlots.push({ materialIndex: 0, mesh: bakeMeshCavityAO(paintMeshColors(scaled, "#ffffff"), 0.28) });
      } else if (s.materialIndex === 1 || s.materialIndex === 2) {
        const hex = s.materialIndex === 2 ? "#d27238" : "#627084";
        coalescedSlots.push({ materialIndex: 1, mesh: bakeMeshCavityAO(paintMeshColors(scaled, hex), 0.34) });
      } else if (s.materialIndex === 3 || s.materialIndex === 4) {
        const hex = s.materialIndex === 4 ? "#2c313b" : "#1b222e";
        coalescedSlots.push({ materialIndex: 2, mesh: bakeMeshCavityAO(paintMeshColors(scaled, hex), 0.36) });
      } else {
        const hex = s.materialIndex === 6 ? "#ff244c" : burnerHex;
        coalescedSlots.push({ materialIndex: 3, mesh: paintMeshColors(scaled, hex) });
      }
    }
    return buildGroupedGeometrySpec(coalescedSlots);
  });
  const canopySpec = memoizeGeometry(`td:drone-canopy:v3:${id}:${spec.maxDim}`, () => {
    const sculpted = DRONE_SCULPTORS[id]();
    const bounds = measureMeshesBounds([...sculpted.slots.map((s) => s.mesh), sculpted.canopy]);
    const rawMax = Math.max(1e-4, bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
    const scale = spec.maxDim / rawMax;
    return mergeRawMeshes([transformMesh(sculpted.canopy, { scale })]);
  });
  const materials: AuraMaterialSpec[] = [
    droneHullPaint(spec.color, isPlayer),
    MAT_DRONE_METALLIC_ALLOY,
    MAT_DRONE_DARK_COMPOSITE,
    MAT_DRONE_EMISSIVE_TRIM
  ];
  return group(
    spec.nodeId,
    [
      geometry.multiMaterial(hullSpec, materials, {
        name: `${spec.nodeId}-hull`,
        castShadow: isPlayer,
        receiveShadow: true
      }),
      geometry.custom(canopySpec, {
        name: `${spec.nodeId}-canopy`,
        material: MAT_CANOPY_GLASS,
        castShadow: false,
        receiveShadow: false
      })
    ],
    { position: [0, 1.45, isPlayer ? -0.4 : -24] }
  ).runtime(
    game.runtimeNode(
      spec.nodeId,
      isPlayer ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined
    )
  );
}

// ---------------------------------------------------------------------------
// 14 Foundry Megastructures & Trackside Landmarks (`FOUNDRY_MATS`)
// 0: soot iron, 1: oxidised steel, 2: brushed titanium, 3: radiator copper,
// 4: refractory concrete, 5: cryo vessel enamel, 6: molten slag emissive,
// 7: cryo cyan emissive, 8: boost amber emissive, 9: warning beacon, 10: rubber
// ---------------------------------------------------------------------------

export const FOUNDRY_MATS: readonly AuraMaterialSpec[] = [
  MAT_SOOT_IRON,
  MAT_OXIDISED_STEEL,
  MAT_BRUSHED_TITANIUM,
  MAT_RADIATOR_COPPER,
  MAT_REFRACTORY_CONCRETE,
  MAT_CRYOGENIC_VESSEL,
  MAT_FURNACE_MOLTEN,
  MAT_CRYO_CORE,
  MAT_BOOST_AMBER,
  MAT_BEACON_STROBE,
  MAT_SEAL_RUBBER
];

/** 1. Start Gantry (`38 m` span, legs outside `±13.8 m`, bridge `y = 8.4..13.2 m` clear of track & chase cam). */
function buildGantryStartSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(4.4, 1.4, 5.2, 0.14), { pos: [side * 16.8, 0.7, 0] }), materialIndex: 4 },
      {
        mesh: transformMesh(latticeTrussMesh({ span: [2.4, 13.2, 3.6], bays: 6, chordRadius: 0.22 }), {
          pos: [side * 16.2, 7.6, 0],
          rot: [0, 0, side * 0.08]
        }),
        materialIndex: 0
      }
    );
  }
  slots.push(
    {
      mesh: transformMesh(latticeTrussMesh({ span: [36.4, 3.2, 3.4], bays: 10, chordRadius: 0.22 }), { pos: [0, 10.6, 0] }),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(24.0, 1.35, 0.75, 0.08), { pos: [0, 10.6, 1.85] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(18.0, 0.42, 0.18, 0.04), { pos: [0, 10.6, 2.28] }), materialIndex: 8 }
  );
  for (const lx of [-8, -3, 3, 8]) {
    slots.push(
      { mesh: transformMesh(bevelBoxMesh(1.3, 0.65, 0.9, 0.06), { pos: [lx, 8.55, 0.8] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(1.0, 0.22, 0.6, 0.03), { pos: [lx, 8.18, 0.8] }), materialIndex: 6 }
    );
  }
  return slots;
}

/** 2. Foundry Viaduct Overpass (`56 m` span, `baseY: 4.8`, high overhead deck `y = 6.4..10.6 m`). */
function buildOverpassSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(latticeTrussMesh({ span: [3.2, 9.6, 4.8], bays: 5, chordRadius: 0.26 }), { pos: [side * 22.5, 4.8, 0] }),
        materialIndex: 0
      },
      { mesh: transformMesh(bevelBoxMesh(0.7, 0.7, 0.7, 0.1), { pos: [side * 26.8, 10.9, 0] }), materialIndex: 9 }
    );
  }
  slots.push(
    {
      mesh: transformMesh(latticeTrussMesh({ span: [56.0, 3.8, 5.2], bays: 12, chordRadius: 0.26 }), { pos: [0, 8.4, 0] }),
      materialIndex: 0
    },
    { mesh: transformMesh(bevelBoxMesh(55.4, 0.65, 5.8, 0.1), { pos: [0, 10.4, 0] }), materialIndex: 1 },
    { mesh: tubeSweepMesh([[-27.5, 6.1, -1.8, 0.48], [0, 6.1, -1.8, 0.48], [27.5, 6.1, -1.8, 0.48]], 10), materialIndex: 3 },
    { mesh: tubeSweepMesh([[-27.5, 6.1, 1.8, 0.42], [0, 6.1, 1.8, 0.42], [27.5, 6.1, 1.8, 0.42]], 10), materialIndex: 2 }
  );
  return slots;
}

/** 3. Foundry Ladle Gantry Crane (`24 m`, tilted refractory steelmaking ladle pouring molten slag). */
function buildLadleCraneSlots(): MultiMatSlot[] {
  const ladleProfile: V2[] = [[0, 0], [2.4, 0], [3.1, 1.4], [3.5, 5.2], [3.8, 5.6], [3.2, 5.6], [2.8, 1.2], [0, 1.0]];
  return [
    { mesh: transformMesh(latticeTrussMesh({ span: [2.6, 22.0, 2.6], bays: 7, chordRadius: 0.2 }), { pos: [-7.2, 11.0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [2.6, 22.0, 2.6], bays: 7, chordRadius: 0.2 }), { pos: [7.2, 11.0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [19.6, 2.6, 3.2], bays: 7, chordRadius: 0.22 }), { pos: [0, 21.8, 0] }), materialIndex: 1 },
    { mesh: tubeSweepMesh([[-2.4, 20.6, 0, 0.14], [-2.4, 13.4, 0, 0.14]], 6), materialIndex: 2 },
    { mesh: tubeSweepMesh([[2.4, 20.6, 0, 0.14], [2.4, 13.4, 0, 0.14]], 6), materialIndex: 2 },
    { mesh: transformMesh(latheMesh(ladleProfile, 18), { pos: [0, 9.2, 0], rot: [0, 0, 0.36] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(5.2, 0.6, 5.2, 0.15), { pos: [0.6, 13.4, 0], rot: [0, 0, 0.36] }), materialIndex: 6 },
    {
      mesh: tubeSweepMesh(
        catmullRomSpline3([[2.6, 12.6, 0], [4.1, 9.2, 0.2], [4.7, 4.4, 0.1], [4.9, 0.4, 0]], 5).map((p, i) => [p[0], p[1], p[2], 0.42 + i * 0.02] as V4),
        10
      ),
      materialIndex: 6
    },
    { mesh: transformMesh(bevelBoxMesh(6.2, 0.5, 6.2, 0.12), { pos: [4.8, 0.25, 0] }), materialIndex: 6 }
  ];
}

/** 4. Hammerhead T-Iron Blast Tower (`52 m` tall industrial crane & furnace tower). */
function buildTowerTIronSlots(): MultiMatSlot[] {
  return [
    { mesh: transformMesh(bevelBoxMesh(11.0, 6.0, 11.0, 0.35), { pos: [0, 3.0, 0] }), materialIndex: 4 },
    { mesh: transformMesh(latticeTrussMesh({ span: [6.4, 46.0, 6.4], bays: 10, chordRadius: 0.34 }), { pos: [0, 26.0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [34.0, 4.2, 4.6], bays: 9, chordRadius: 0.28 }), { pos: [0, 48.2, 0] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(4.6, 18.0, 4.6, 0.2), { pos: [0, 18.0, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(1.6, 12.0, 5.0, 0.1), { pos: [0, 18.0, 0] }), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(1.1, 1.1, 1.1, 0.15), { pos: [-16.5, 50.8, 0] }), materialIndex: 9 },
    { mesh: transformMesh(bevelBoxMesh(1.1, 1.1, 1.1, 0.15), { pos: [16.5, 50.8, 0] }), materialIndex: 9 }
  ];
}

/** 5. Hyperboloid Natural-Draft Cooling Tower (`36 m`, `bezierCurve2` + `latheMesh` + colonnade struts). */
function buildCoolingTowerSlots(): MultiMatSlot[] {
  const shellCurve = bezierCurve2([11.8, 3.8], [8.2, 14.0], [6.8, 25.0], [8.6, 35.2], 14);
  const profile: V2[] = [...shellCurve, [7.9, 35.2], [6.4, 24.5], [8.0, 12.0], [0, 8.0]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh([[0, 0], [13.2, 0], [13.2, 1.4], [11.6, 1.8], [0, 1.2]], 22), materialIndex: 4 },
    { mesh: latheMesh(profile, 24), materialIndex: 4 },
    { mesh: latheMesh([[0, 8.2], [7.2, 8.2], [7.5, 9.4], [0, 9.4]], 18), materialIndex: 6 },
    {
      mesh: tubeSweepMesh(
        Array.from({ length: 19 }, (_, i) => {
          const a = (i / 18) * Math.PI * 2;
          return [Math.cos(a) * 8.45, 35.35, Math.sin(a) * 8.45, 0.24] as V4;
        }),
        8
      ),
      materialIndex: 9
    }
  ];
  for (let i = 0; i < 12; i += 1) {
    const a0 = (i / 12) * Math.PI * 2;
    const a1 = ((i + 0.5) / 12) * Math.PI * 2;
    slots.push({
      mesh: tubeSweepMesh(
        [[Math.cos(a0) * 12.4, 1.0, Math.sin(a0) * 12.4, 0.34], [Math.cos(a1) * 11.5, 4.2, Math.sin(a1) * 11.5, 0.3]],
        6
      ),
      materialIndex: 1
    });
  }
  return slots;
}

/** 6. Triple-Flue Smokestack Battery (`40 m`, `latheMesh` stacks + `latticeTrussMesh` catwalk collars). */
function buildSmokestacksSlots(): MultiMatSlot[] {
  const flueProfile: V2[] = [[2.8, 0], [2.5, 12], [2.0, 28], [1.75, 38.6], [2.05, 39.4], [1.45, 39.6], [0, 38.0]];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(19.0, 4.2, 9.0, 0.28), { pos: [0, 2.1, 0] }), materialIndex: 4 },
    { mesh: transformMesh(latticeTrussMesh({ span: [16.5, 1.8, 6.2], bays: 6, chordRadius: 0.18 }), { pos: [0, 17.5, 0] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [15.5, 1.6, 5.6], bays: 6, chordRadius: 0.16 }), { pos: [0, 29.5, 0] }), materialIndex: 0 }
  ];
  for (const sx of [-5.8, 0, 5.8]) {
    slots.push(
      { mesh: transformMesh(latheMesh(flueProfile, 18), { pos: [sx, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.85, 0.85, 0.85, 0.14), { pos: [sx, 39.9, 0] }), materialIndex: 9 }
    );
  }
  return slots;
}

/** 7. Cryo-Tank Cluster Tower (`30 m`, 3 domed `latheMesh` pressure vessels on `latticeTrussMesh` legs + manifolds). */
function buildCryoWaterTowerSlots(): MultiMatSlot[] {
  const vesselProfile: V2[] = [[0, 12.2], [2.4, 12.8], [3.3, 14.8], [3.3, 25.4], [2.4, 27.6], [0.8, 28.6], [0, 28.9]];
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(latticeTrussMesh({ span: [12.8, 15.0, 12.8], bays: 5, chordRadius: 0.24 }), { pos: [0, 7.5, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(14.0, 1.1, 14.0, 0.16), { pos: [0, 13.8, 0] }), materialIndex: 2 }
  ];
  const offsets: readonly [number, number][] = [[0, 3.8], [-3.5, -2.2], [3.5, -2.2]];
  for (const [ox, oz] of offsets) {
    slots.push(
      { mesh: transformMesh(latheMesh(vesselProfile, 18), { pos: [ox, 0, oz] }), materialIndex: 5 },
      { mesh: transformMesh(latheMesh([[3.38, 19.6], [3.38, 20.3]], 18), { pos: [ox, 0, oz] }), materialIndex: 7 },
      { mesh: tubeSweepMesh([[ox, 12.5, oz, 0.34], [ox * 0.4, 6.2, oz * 0.4, 0.34], [ox * 0.3, 0.2, oz * 0.3, 0.36]], 8), materialIndex: 2 }
    );
  }
  slots.push({ mesh: transformMesh(bevelBoxMesh(0.9, 0.9, 0.9, 0.14), { pos: [0, 29.5, 3.8] }), materialIndex: 9 });
  return slots;
}

/** 8. Toroidal Magnetic Reactor Ring (`24 m`, closed plasma torus + 8 copper poloidal field coils + cradle). */
function buildReactorRingSlots(): MultiMatSlot[] {
  const majorR = 8.4;
  const torusSpine: V4[] = Array.from({ length: 29 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return [Math.cos(a) * majorR, 13.8 + Math.sin(a) * majorR, 0, 1.38];
  });
  const plasmaCore: V4[] = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [Math.cos(a) * (majorR - 1.48), 13.8 + Math.sin(a) * (majorR - 1.48), 0, 0.34];
  });
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(18.0, 2.8, 8.4, 0.26), { pos: [0, 1.4, 0] }), materialIndex: 4 },
    { mesh: transformMesh(latticeTrussMesh({ span: [2.8, 11.0, 5.2], bays: 4, chordRadius: 0.22 }), { pos: [-6.8, 6.8, 0], rot: [0, 0, -0.18] }), materialIndex: 0 },
    { mesh: transformMesh(latticeTrussMesh({ span: [2.8, 11.0, 5.2], bays: 4, chordRadius: 0.22 }), { pos: [6.8, 6.8, 0], rot: [0, 0, 0.18] }), materialIndex: 0 },
    { mesh: tubeSweepMesh(torusSpine, 12), materialIndex: 0 },
    { mesh: tubeSweepMesh(plasmaCore, 8), materialIndex: 6 }
  ];
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * Math.PI * 2;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(3.4, 0.9, 3.4, 0.14), {
        pos: [Math.cos(a) * majorR, 13.8 + Math.sin(a) * majorR, 0],
        rot: [0, 0, a + Math.PI * 0.5]
      }),
      materialIndex: 3
    });
  }
  return slots;
}

/** 9. Foundry Slag Sluice & Lava Curtain (`18 m`, `stratifiedCliffMesh` basalt headwall + lofted molten ribbon). */
function buildLavaFallSlots(): MultiMatSlot[] {
  const ribbonSections: V3[][] = [
    [[-2.2, 14.4, -0.8], [2.2, 14.4, -0.8], [2.2, 14.8, 0.4], [-2.2, 14.8, 0.4]],
    [[-2.5, 10.2, 0.8], [2.5, 10.2, 0.8], [2.5, 10.5, 1.5], [-2.5, 10.5, 1.5]],
    [[-2.9, 4.8, 1.6], [2.9, 4.8, 1.6], [2.9, 5.1, 2.2], [-2.9, 5.1, 2.2]],
    [[-3.4, 0.2, 2.0], [3.4, 0.2, 2.0], [3.4, 0.5, 2.8], [-3.4, 0.5, 2.8]]
  ];
  return [
    { mesh: stratifiedCliffMesh({ radiusX: 6.2, radiusZ: 4.8, height: 15.6, terraces: 5, seed: 31 }), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(6.2, 1.4, 5.4, 0.14), { pos: [0, 14.8, 0.4] }), materialIndex: 0 },
    { mesh: loftSectionsMesh(ribbonSections, true, false), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(7.8, 0.45, 4.6, 0.1), { pos: [0, 0.24, 2.4] }), materialIndex: 6 }
  ];
}

/** 10. Plasma & Coolant Conduit Spillway (`14 m`, swept twin `tubeSweepMesh` overhead manifolds + mist nozzles). */
function buildWaterEmitterSlots(): MultiMatSlot[] {
  const archA: V4[] = catmullRomSpline3([[-4.6, 0.4, -1.8], [-3.8, 9.2, -0.9], [0, 12.8, 0], [3.6, 10.8, 1.2]], 6).map((p) => [p[0], p[1], p[2], 0.58]);
  const archB: V4[] = catmullRomSpline3([[-4.6, 0.4, 1.8], [-3.8, 8.6, 0.9], [0, 11.6, 0], [3.4, 9.8, 1.2]], 6).map((p) => [p[0], p[1], p[2], 0.48]);
  return [
    { mesh: transformMesh(bevelBoxMesh(9.8, 1.6, 6.4, 0.16), { pos: [-1.4, 0.8, 0] }), materialIndex: 4 },
    { mesh: transformMesh(latticeTrussMesh({ span: [2.2, 11.6, 4.4], bays: 5, chordRadius: 0.16 }), { pos: [-3.8, 6.2, 0] }), materialIndex: 0 },
    { mesh: tubeSweepMesh(archA, 10), materialIndex: 2 },
    { mesh: tubeSweepMesh(archB, 10), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(2.4, 1.1, 3.6, 0.12), { pos: [3.6, 10.2, 1.2] }), materialIndex: 1 },
    { mesh: transformMesh(bevelBoxMesh(1.9, 0.35, 3.1, 0.06), { pos: [3.6, 9.5, 1.2] }), materialIndex: 7 }
  ];
}

/** 11. Batched Soot-Iron Thermal Arch (`38 m` span, `archwayVoussoirSlots` + buttress piers, clear `±14.2 m` road). */
function buildThermalArchBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const voussoirs = archwayVoussoirSlots({
    radius: 14.4,
    thickness: 2.3,
    depth: 3.4,
    voussoirs: 13,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 2
  });
  const parts: ColoredRawMesh[] = voussoirs.map((v) =>
    tintRawMesh(
      transformMesh(v.mesh, { pos: [0, 2.2, 0] }),
      v.materialIndex === 2 ? "#d8641e" : v.materialIndex === 1 ? "#242a3a" : "#151924"
    )
  );
  for (const side of [-1, 1] as const) {
    parts.push(
      tintRawMesh(transformMesh(bevelBoxMesh(4.4, 3.2, 4.8, 0.2), { pos: [side * 16.4, 1.6, 0] }), "#121620"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.8, 2.4, 4.2, 0.08), { pos: [side * 14.3, 2.0, 0] }), "#c95e20")
    );
  }
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

/** 12. Batched Octagonal Ribbed Foundry Tunnel Portal (`36 m` span, clear `±13.3 m`, roof at `y = 13.5 m`). */
function buildTunnelFrameBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const portalSpine: V4[] = [
    [-15.6, 0.2, 0, 1.35],
    [-15.2, 9.6, 0, 1.25],
    [-10.8, 14.6, 0, 1.2],
    [0, 15.2, 0, 1.25],
    [10.8, 14.6, 0, 1.2],
    [15.2, 9.6, 0, 1.25],
    [15.6, 0.2, 0, 1.35]
  ];
  const parts: ColoredRawMesh[] = [];
  for (const zOff of [-5.6, -1.8, 1.8, 5.6]) {
    parts.push(tintRawMesh(transformMesh(tubeSweepMesh(portalSpine, 8, true), { pos: [0, 0, zOff] }), "#171c2a"));
  }
  parts.push(
    tintRawMesh(transformMesh(bevelBoxMesh(23.0, 1.1, 14.2, 0.14), { pos: [0, 14.8, 0] }), "#1f2638"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.2, 0.42, 13.6, 0.06), { pos: [0, 13.55, 0] }), "#e09448"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.4, 10.2, 14.0, 0.16), { pos: [-15.8, 5.1, 0] }), "#121622"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.4, 10.2, 14.0, 0.16), { pos: [15.8, 5.1, 0] }), "#121622")
  );
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

/** 13. Batched L-Cantilever Blast-Furnace Crane Tower (`46 m`, `latticeTrussMesh` + Cowper hot-blast stoves). */
function buildTowerLBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const stoveProfile: V2[] = [[0, 0], [3.2, 0], [3.2, 22.0], [2.4, 25.2], [0.8, 26.5], [0, 26.8]];
  const parts: ColoredRawMesh[] = [
    tintRawMesh(transformMesh(bevelBoxMesh(12.0, 4.6, 10.0, 0.28), { pos: [0, 2.3, 0] }), "#181c28"),
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [5.4, 42.0, 5.4], bays: 9, chordRadius: 0.3 }), { pos: [-2.4, 23.0, 0] }), "#151924"),
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [22.0, 3.6, 4.0], bays: 7, chordRadius: 0.24 }), { pos: [6.2, 42.5, 0] }), "#252a3a"),
    tintRawMesh(transformMesh(latheMesh(stoveProfile, 16), { pos: [4.6, 0, -2.2] }), "#322b32"),
    tintRawMesh(transformMesh(latheMesh(stoveProfile, 16), { pos: [4.6, 0, 2.6] }), "#2b252c"),
    tintRawMesh(transformMesh(bevelBoxMesh(1.1, 1.1, 1.1, 0.14), { pos: [16.8, 44.8, 0] }), "#e84a1c")
  ];
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

/** 14. Batched Cantilevered Holo-Billboard (`9.5 m`, side truss arm + holographic emitter frame). */
function buildHoloBillboardBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const parts: ColoredRawMesh[] = [
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [1.1, 8.8, 1.1], bays: 5, chordRadius: 0.09 }), { pos: [-3.4, 4.4, 0] }), "#182436"),
    tintRawMesh(transformMesh(bevelBoxMesh(7.6, 0.42, 0.48, 0.06), { pos: [0.4, 8.4, 0] }), "#28beff"),
    tintRawMesh(transformMesh(bevelBoxMesh(7.6, 0.42, 0.48, 0.06), { pos: [0.4, 3.6, 0] }), "#e86218"),
    tintRawMesh(transformMesh(bevelBoxMesh(6.8, 4.2, 0.14, 0.04), { pos: [0.4, 6.0, 0] }), "#3ec8f5")
  ];
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

// ---------------------------------------------------------------------------
// Trackside Barriers, Coolant Cells, Boost Pads, Shield Pickups & Ordnance
// ---------------------------------------------------------------------------

function buildTrackBarrierSlots(): MultiMatSlot[] {
  const profile: V2[] = [[-0.58, 0], [0.58, 0], [0.46, 0.42], [0.28, 1.18], [-0.28, 1.18], [-0.46, 0.42]];
  return [
    { mesh: extrudePolygonMesh(profile, 3.8, 0.05, true), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.66, 0.14, 3.6, 0.03), { pos: [0, 0.72, 0] }), materialIndex: 8 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.18, 0.48, 0.03), { pos: [0, 1.26, -1.2] }), materialIndex: 9 },
    { mesh: transformMesh(bevelBoxMesh(0.28, 0.18, 0.48, 0.03), { pos: [0, 1.26, 1.2] }), materialIndex: 9 }
  ];
}

function buildBoostPadSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(bevelBoxMesh(3.4, 0.14, 4.8, 0.04), { pos: [0, 0.07, 0] }), materialIndex: 0 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.22, 4.6, 0.04), { pos: [-1.58, 0.12, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.22, 0.22, 4.6, 0.04), { pos: [1.58, 0.12, 0] }), materialIndex: 2 }
  ];
  const chevPoly: V2[] = [[-1.18, 0.45], [0, -0.52], [1.18, 0.45], [0.84, 0.68], [0, 0.02], [-0.84, 0.68]];
  for (const cz of [-1.35, 0, 1.35]) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(chevPoly, 0.08, 0.02), {
        pos: [0, 0.16, cz],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 8
    });
  }
  return slots;
}

function buildExplosiveBarrelSlots(): MultiMatSlot[] {
  const drumProfile: V2[] = [
    [0, 0], [0.58, 0], [0.62, 0.08], [0.59, 0.46], [0.64, 0.52], [0.59, 0.92],
    [0.64, 0.98], [0.59, 1.38], [0.64, 1.44], [0.58, 1.82], [0.46, 1.88], [0, 1.88]
  ];
  return [
    { mesh: latheMesh(drumProfile, 18), materialIndex: 1 },
    { mesh: latheMesh([[0.645, 0.84], [0.645, 1.06]], 18), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(0.24, 0.14, 0.24, 0.03), { pos: [0.24, 1.92, 0] }), materialIndex: 3 }
  ];
}

function buildShockwavePylonSlots(): MultiMatSlot[] {
  const coreProfile: V2[] = [[0, 0], [0.52, 0], [0.44, 0.24], [0.22, 0.36], [0.18, 1.32], [0.3, 1.48], [0, 1.55]];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(coreProfile, 16), materialIndex: 2 },
    { mesh: transformMesh(icosphereFacetMesh(0.22, 1, 0, 7), { pos: [0, 1.38, 0] }), materialIndex: 7 }
  ];
  for (const ry of [0.52, 0.82, 1.12]) {
    slots.push({
      mesh: tubeSweepMesh(
        Array.from({ length: 17 }, (_, i) => {
          const a = (i / 16) * Math.PI * 2;
          return [Math.cos(a) * 0.44, ry, Math.sin(a) * 0.44, 0.045] as V4;
        }),
        6
      ),
      materialIndex: 3
    });
  }
  return slots;
}

const STRUCTURAL_SLOT_HEX: Readonly<Record<number, string>> = {
  0: "#181622",
  1: "#2e2426",
  2: "#546378",
  3: "#c86c36",
  4: "#22202b",
  5: "#b8cde0",
  10: "#101318"
};

type BuiltFoundryGeometry = {
  readonly structural?: AuraCustomGeometrySpec;
  readonly emissives: readonly { readonly matIdx: number; readonly spec: AuraCustomGeometrySpec }[];
};

const FOUNDRY_GEOMETRY_CACHE = new Map<string, BuiltFoundryGeometry>();

function getOrBuildFoundryGeometry(cacheKey: string, buildSlots: () => readonly MultiMatSlot[]): BuiltFoundryGeometry {
  const cached = FOUNDRY_GEOMETRY_CACHE.get(cacheKey);
  if (cached) return cached;
  const slots = buildSlots();
  const structuralParts: ColoredRawMesh[] = [];
  const emissiveByMat = new Map<number, RawMesh[]>();
  for (const slot of slots) {
    const structHex = STRUCTURAL_SLOT_HEX[slot.materialIndex];
    if (structHex !== undefined) {
      structuralParts.push(tintRawMesh(slot.mesh, structHex));
    } else {
      let list = emissiveByMat.get(slot.materialIndex);
      if (!list) emissiveByMat.set(slot.materialIndex, (list = []));
      list.push(slot.mesh);
    }
  }
  const built: BuiltFoundryGeometry = {
    ...(structuralParts.length > 0
      ? {
          structural: memoizeGeometry(`td:foundry-struct:${cacheKey}`, () => mergeColoredMeshesToSpec(structuralParts))
        }
      : {}),
    emissives: Array.from(emissiveByMat.entries(), ([matIdx, meshes]) => ({
      matIdx,
      spec: memoizeGeometry(`td:foundry-emissive:${cacheKey}:${matIdx}`, () => mergeRawMeshes(meshes))
    }))
  };
  FOUNDRY_GEOMETRY_CACHE.set(cacheKey, built);
  return built;
}

/**
 * Collapses multi-slot `FOUNDRY_MATS` assemblies into 1 vertex-colored `geometry.custom` structural draw (`clearcoat: 0,
 * sheen: 0`) plus unshadowed merged `geometry.custom` emissive draw(s), memoized across restarts and circuit switches.
 */
function buildMergedFoundryGroup(
  id: string,
  cacheKey: string,
  buildSlots: () => readonly MultiMatSlot[],
  options: {
    readonly position: V3;
    readonly rotation?: V3;
    readonly castShadow: boolean;
    readonly receiveShadow: boolean;
    readonly extraChildren?: readonly AuraNodeBuilder<AuraSceneNode>[];
  }
): AuraGroupNodeBuilder {
  const built = getOrBuildFoundryGeometry(cacheKey, buildSlots);
  const children: AuraNodeBuilder<AuraSceneNode>[] = [];
  if (built.structural) {
    children.push(
      geometry.custom(built.structural, {
        name: `${id}-body`,
        material: MAT_BATCH_FOUNDRY_IRON,
        castShadow: options.castShadow,
        receiveShadow: options.receiveShadow
      })
    );
  }
  for (const { matIdx, spec } of built.emissives) {
    children.push(
      geometry.custom(spec, {
        name: `${id}-emissive-${matIdx}`,
        material: FOUNDRY_MATS[matIdx] ?? MAT_FURNACE_MOLTEN,
        castShadow: false,
        receiveShadow: false
      })
    );
  }
  if (options.extraChildren) children.push(...options.extraChildren);
  return group(id, children, {
    position: options.position,
    ...(options.rotation ? { rotation: options.rotation } : {})
  }).runtime(game.runtimeNode(id));
}

function buildCryoCoolantCellNode(anchor: SceneryAnchor, castShadow: boolean): AuraGroupNodeBuilder {
  const glassSpec = memoizeGeometry("td:cryo-cell:glass", () =>
    mergeRawMeshes([latheMesh([[0.38, 0.34], [0.41, 0.42], [0.41, 1.66], [0.38, 1.72]], 16)])
  );
  return buildMergedFoundryGroup(
    anchor.id,
    "cryo-coolant-cell",
    () => {
      const capBot: V2[] = [[0, 0], [0.44, 0], [0.48, 0.18], [0.42, 0.34], [0, 0.34]];
      const capTop: V2[] = [[0, 1.72], [0.42, 1.72], [0.48, 1.88], [0.28, 2.04], [0, 2.1]];
      const core: V2[] = [[0, 0.32], [0.24, 0.36], [0.24, 1.7], [0, 1.74]];
      const opaqueSlots: MultiMatSlot[] = [
        { mesh: latheMesh(capBot, 16), materialIndex: 3 },
        { mesh: latheMesh(capTop, 16), materialIndex: 3 },
        { mesh: latheMesh(core, 14), materialIndex: 7 }
      ];
      for (let i = 0; i < 4; i += 1) {
        const a = (i / 4) * Math.PI * 2;
        opaqueSlots.push({
          mesh: tubeSweepMesh(
            [
              [Math.cos(a) * 0.47, 0.24, Math.sin(a) * 0.47, 0.032],
              [Math.cos(a) * 0.47, 1.82, Math.sin(a) * 0.47, 0.032]
            ],
            6
          ),
          materialIndex: 2
        });
      }
      return opaqueSlots;
    },
    {
      position: [anchor.lateralX, anchor.baseY, -anchor.s],
      rotation: [0, anchor.yaw, 0],
      castShadow,
      receiveShadow: true,
      extraChildren: [
        geometry.custom(glassSpec, {
          name: `${anchor.id}-glass`,
          material: MAT_CRYO_GLASS,
          castShadow: false,
          receiveShadow: false
        })
      ]
    }
  );
}

function buildShieldPickupNode(anchor: SceneryAnchor, castShadow: boolean): AuraGroupNodeBuilder {
  const shellSpec = memoizeGeometry("td:shield-pickup:shell", () =>
    mergeRawMeshes([transformMesh(subdivideSmoothMesh(icosphereFacetMesh(0.94, 1, 0, 5), 1, 0.5), { pos: [0, 1.0, 0] })])
  );
  return buildMergedFoundryGroup(
    anchor.id,
    "shield-pickup",
    () => {
      const ringA: V4[] = Array.from({ length: 21 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return [Math.cos(a) * 0.78, 1.0 + Math.sin(a) * 0.78, 0, 0.055];
      });
      const ringB: V4[] = Array.from({ length: 21 }, (_, i) => {
        const a = (i / 20) * Math.PI * 2;
        return [0, 1.0 + Math.sin(a) * 0.72, Math.cos(a) * 0.72, 0.05];
      });
      return [
        { mesh: transformMesh(icosphereFacetMesh(0.42, 1, 0.04, 13), { pos: [0, 1.0, 0] }), materialIndex: 7 },
        { mesh: tubeSweepMesh(ringA, 8), materialIndex: 2 },
        { mesh: tubeSweepMesh(ringB, 8), materialIndex: 3 }
      ];
    },
    {
      position: [anchor.lateralX, anchor.baseY, -anchor.s],
      rotation: [0, anchor.yaw, 0],
      castShadow,
      receiveShadow: true,
      extraChildren: [
        geometry.custom(shellSpec, {
          name: `${anchor.id}-shell`,
          material: MAT_CRYO_GLASS,
          castShadow: false,
          receiveShadow: false
        })
      ]
    }
  );
}

const SINGLE_SCENERY_BUILDERS: Readonly<Record<string, () => MultiMatSlot[]>> = {
  heatsinkGantryStart: buildGantryStartSlots,
  heatsinkOverpass: buildOverpassSlots,
  heatsink_thermalLadleCrane: buildLadleCraneSlots,
  heatsink_thermalTowerTIron: buildTowerTIronSlots,
  heatsink_thermalCoolingTower: buildCoolingTowerSlots,
  heatsink_thermalSmokestacks: buildSmokestacksSlots,
  heatsink_thermalWaterTower: buildCryoWaterTowerSlots,
  heatsinkLavaFall: buildLavaFallSlots,
  heatsinkWaterEmitter: buildWaterEmitterSlots,
  heatsinkBarrierA: buildTrackBarrierSlots,
  heatsink_thermalReactorRing: buildReactorRingSlots,
  heatsinkBoostPad: buildBoostPadSlots,
  heatsinkExplosiveBarrel: buildExplosiveBarrelSlots,
  heatsinkWeaponShockwave: buildShockwavePylonSlots
};

export function buildSingleSceneryNode(anchor: SceneryAnchor, castShadow: boolean): AuraGroupNodeBuilder {
  if (anchor.assetKey === "heatsinkCoolingCanister") return buildCryoCoolantCellNode(anchor, castShadow);
  if (anchor.assetKey === "heatsinkShieldPickup") return buildShieldPickupNode(anchor, castShadow);
  const fn = SINGLE_SCENERY_BUILDERS[anchor.assetKey];
  if (!fn) throw new Error(`thermal-drift: unknown procedural scenery key ${anchor.assetKey}`);
  return buildMergedFoundryGroup(
    anchor.id,
    `${anchor.assetKey}:${anchor.maxDim.toFixed(3)}`,
    () => fitGroundedSlots(fn(), anchor.maxDim),
    {
      position: [anchor.lateralX, anchor.baseY, -anchor.s],
      rotation: [0, anchor.yaw, 0],
      castShadow,
      receiveShadow: true
    }
  );
}

export function buildBatchedSceneryNode(batch: {
  readonly id: string;
  readonly assetKey: string;
  readonly baseMaxDim: number;
  readonly castShadow: boolean;
  readonly anchors: readonly SceneryAnchor[];
}): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec = memoizeGeometry(`td:batch:${batch.assetKey}:${batch.baseMaxDim.toFixed(3)}`, () =>
    batch.assetKey === "heatsink_thermalArchIron"
      ? buildThermalArchBatchSpec(batch.baseMaxDim)
      : batch.assetKey === "heatsinkTunnelFrame"
        ? buildTunnelFrameBatchSpec(batch.baseMaxDim)
        : batch.assetKey === "heatsink_thermalTowerLIron"
          ? buildTowerLBatchSpec(batch.baseMaxDim)
          : buildHoloBillboardBatchSpec(batch.baseMaxDim)
  );
  const mat = batch.assetKey === "heatsinkHoloBillboard" ? MAT_BATCH_HOLO_FRAME : MAT_BATCH_FOUNDRY_IRON;
  const transforms: AuraTransformSpec[] = batch.anchors.map((anchor) => {
    const u = Math.max(0.01, anchor.maxDim / batch.baseMaxDim);
    return {
      position: [anchor.lateralX, anchor.baseY, -anchor.s],
      rotation: [0, anchor.yaw, 0],
      scale: [u, u, u]
    };
  });
  return instances
    .custom(spec, {
      name: batch.id,
      material: mat,
      transforms,
      frustumCulled: false,
      castShadow: batch.castShadow,
      receiveShadow: batch.assetKey !== "heatsinkHoloBillboard"
    })
    .runtime(game.runtimeNode(batch.id));
}

export function buildProximityMineNode(id: string): AuraGroupNodeBuilder {
  return buildMergedFoundryGroup(
    id,
    "proximity-mine",
    () => {
      const bodyProfile: V2[] = [[0, 0], [0.58, 0], [0.68, 0.14], [0.54, 0.3], [0.26, 0.38], [0, 0.4]];
      const slots: MultiMatSlot[] = [
        { mesh: latheMesh(bodyProfile, 18), materialIndex: 0 },
        { mesh: latheMesh([[0.52, 0.28], [0.56, 0.33], [0.22, 0.42], [0, 0.44]], 16), materialIndex: 9 }
      ];
      for (let i = 0; i < 6; i += 1) {
        const a = (i / 6) * Math.PI * 2;
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.11, 0.1, 0.28, 0.02), {
            pos: [Math.cos(a) * 0.64, 0.14, Math.sin(a) * 0.64],
            rot: [0, -a, 0]
          }),
          materialIndex: 2
        });
      }
      return fitGroundedSlots(slots, 1.45);
    },
    {
      position: [0, 0.35, -28],
      castShadow: false,
      receiveShadow: true
    }
  );
}

/** Lathed seeker missile along `Y` (`main.ts` rotates `[+PI/2, -heading, 0]`, mapping `-Y -> -Z` and `+Y -> +Z`). */
export function buildSeekerMissileNode(id: string, isIncoming: boolean): AuraGroupNodeBuilder {
  return buildMergedFoundryGroup(
    id,
    isIncoming ? "seeker-missile:incoming" : "seeker-missile:player",
    () => {
      const sign = isIncoming ? -1 : 1;
      const bodyProfile: V2[] = [
        [0, -0.98],
        [0.08, -0.74],
        [0.135, -0.44],
        [0.135, 0.68],
        [0.105, 0.88],
        [0, 0.92]
      ];
      const finPoly: V2[] = [[0.12, 0.32], [0.34, 0.68], [0.34, 0.88], [0.11, 0.84]];
      const slots: MultiMatSlot[] = [
        { mesh: transformMesh(latheMesh(bodyProfile, 16), { scale: [1, sign, 1] }), materialIndex: 2 },
        {
          mesh: transformMesh(latheMesh([[0.085, -0.72], [0.14, -0.46]], 16), { scale: [1, sign, 1] }),
          materialIndex: isIncoming ? 9 : 6
        },
        {
          mesh: transformMesh(latheMesh([[0, 0.86], [0.12, 0.88], [0.14, 1.0], [0, 1.02]], 14), { scale: [1, sign, 1] }),
          materialIndex: isIncoming ? 9 : 6
        }
      ];
      for (let i = 0; i < 4; i += 1) {
        slots.push({
          mesh: transformMesh(
            transformMesh(extrudePolygonMesh(finPoly, 0.032, 0.008), { rot: [0, (i / 4) * Math.PI * 2, 0] }),
            { scale: [1, sign, 1] }
          ),
          materialIndex: 0
        });
      }
      return slots;
    },
    {
      position: [0, -60, 0],
      rotation: [Math.PI * 0.5, 0, 0],
      castShadow: false,
      receiveShadow: false
    }
  );
}

/** XY-plane plasma shockwave torus (`main.ts` expands `scale: [s, s, 1]` on top of `.rotate(PI/2, 0, 0)`). */
export function buildShockwaveRingNode(id: string): AuraNodeBuilder<AuraSceneNode> {
  const ringSpec = memoizeGeometry("td:shockwave-ring", () => {
    const spine: V4[] = Array.from({ length: 29 }, (_, i) => {
      const a = (i / 28) * Math.PI * 2;
      return [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0, 0.075];
    });
    return mergeRawMeshes([tubeSweepMesh(spine, 10)]);
  });
  return geometry
    .custom(ringSpec, {
      name: id,
      material: MAT_CRYO_CORE,
      castShadow: false,
      receiveShadow: false
    })
    .position(0, -60, 0)
    .rotate(Math.PI * 0.5, 0, 0)
    .runtime(game.runtimeNode(id));
}

// ---------------------------------------------------------------------------
// Instanced Track Hardware & Unit-Normalized `[-0.5..+0.5]^3` Skyline Specs
// ---------------------------------------------------------------------------

export function buildTrackWallSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("td:track-wall", () => {
    const profile: V2[] = [
      [-0.475, -0.675],
      [0.475, -0.675],
      [0.42, -0.15],
      [0.3, 0.56],
      [0.18, 0.675],
      [-0.18, 0.675],
      [-0.3, 0.56],
      [-0.42, -0.15]
    ];
    const parts: ColoredRawMesh[] = [
      tintRawMesh(extrudePolygonMesh(profile, 12.8, 0.06, true), "#141824"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.46, 0.14, 12.6, 0.03), { pos: [0, 0.64, 0] }), "#435268"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.98, 0.16, 12.7, 0.03), { pos: [0, -0.58, 0] }), "#0d1018")
    ];
    for (const rz of [-4.8, -1.6, 1.6, 4.8]) {
      parts.push(
        tintRawMesh(transformMesh(bevelBoxMesh(0.92, 1.24, 0.34, 0.03), { pos: [0, -0.02, rz] }), "#252e40"),
        tintRawMesh(transformMesh(bevelBoxMesh(0.56, 0.22, 0.42, 0.02), { pos: [0, 0.52, rz] }), "#b86232")
      );
    }
    return mergeColoredMeshesToSpec(parts);
  });
}

export function buildHeatsinkFinSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("td:heatsink-fin", () => {
    const ribProfile: V2[] = [
      [-0.34, -1.36],
      [0.34, -1.36],
      [0.28, 0.88],
      [0.42, 1.36],
      [-0.42, 1.36],
      [-0.28, 0.88]
    ];
    const parts: ColoredRawMesh[] = [
      tintRawMesh(bevelBoxMesh(0.24, 2.75, 2.1, 0.04), "#121622"),
      tintRawMesh(extrudePolygonMesh(ribProfile, 0.32, 0.03, true), "#242d40"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.64, 0.18, 2.16, 0.03), { pos: [0, 1.3, 0] }), "#485870"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.66, 0.22, 2.16, 0.03), { pos: [0, -1.28, 0] }), "#1c2332")
    ];
    for (let i = 0; i < 6; i += 1) {
      const fz = -0.85 + i * 0.34;
      parts.push(tintRawMesh(transformMesh(bevelBoxMesh(0.58, 2.36, 0.085, 0.02), { pos: [0, 0.02, fz] }), "#c46834"));
    }
    return mergeColoredMeshesToSpec(parts);
  });
}

/**
 * Open-ended Mach-diamond plasma spindle (`capEnds = false` via non-zero throat radius) along `Y` (`[-halfLength..+halfLength]`),
 * eliminating the closed flat base cap and triangular silhouette of `instances.cone`.
 */
export function buildThrusterPlumeSpec(halfLength: number, radius: number): AuraCustomGeometrySpec {
  const h = Math.max(0.05, halfLength);
  const r = Math.max(0.02, radius);
  return memoizeGeometry(`td:thruster-plume:${h.toFixed(3)}:${r.toFixed(3)}`, () => {
    const profile: V2[] = [
      [r * 0.68, -h],
      [r * 0.96, -h * 0.62],
      [r, -h * 0.24],
      [r * 0.76, h * 0.16],
      [r * 0.44, h * 0.56],
      [r * 0.16, h * 0.86],
      [r * 0.03, h]
    ];
    return mergeRawMeshes([latheMesh(profile, 18, false)]);
  });
}

export function buildLaserBoltSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("td:laser-bolt", () => {
    const bolt = latheMesh([[0, -1.4], [0.075, -0.85], [0.065, 0.95], [0, 1.4]], 8, true);
    return mergeRawMeshes([transformMesh(bolt, { rot: [Math.PI * 0.5, 0, 0] })]);
  });
}

function normalizeToUnitCubeSpec(parts: readonly RawMesh[]): AuraCustomGeometrySpec {
  const b = measureMeshesBounds(parts);
  const sx = Math.max(1e-4, b.max[0] - b.min[0]);
  const sy = Math.max(1e-4, b.max[1] - b.min[1]);
  const sz = Math.max(1e-4, b.max[2] - b.min[2]);
  const cx = (b.min[0] + b.max[0]) * 0.5;
  const cy = (b.min[1] + b.max[1]) * 0.5;
  const cz = (b.min[2] + b.max[2]) * 0.5;
  return mergeRawMeshes(
    parts.map((p) => transformMesh(transformMesh(p, { pos: [-cx, -cy, -cz] }), { scale: [1 / sx, 1 / sy, 1 / sz] }))
  );
}

/** Horizon Foundry Megastructure Complex (`[-0.5..+0.5]^3`): furnace hall + cooling tower + gantry + cryo pods + conduit. */
export function buildSkylineComplexSpec(layerIndex: number): AuraCustomGeometrySpec {
  return memoizeGeometry(`td:skyline-complex:${layerIndex}`, () => {
    const towerProfile: V2[] = bezierCurve2([0.34, 0], [0.22, 0.35], [0.19, 0.72], [0.25, 0.96], 8);
    const parts: RawMesh[] = [
      transformMesh(bevelBoxMesh(0.92, 0.56, 0.88, 0.03), { pos: [0, 0.28, 0] }),
      transformMesh(latheMesh([[0, 0], ...towerProfile, [0, 0.96]], 12, true), { pos: [-0.18, 0, -0.1] }),
      transformMesh(latticeTrussMesh({ span: [0.88, 0.11, 0.24], bays: 4, chordRadius: 0.022 }), { pos: [0, 0.88, 0.14] }),
      tubeSweepMesh([[-0.38, 0.52, 0.24, 0.045], [0, 0.68, 0.28, 0.045], [0.36, 0.52, 0.22, 0.045]], 6, true)
    ];
    if (layerIndex < 2) {
      parts.push(
        transformMesh(latheMesh([[0, 0.52], [0.16, 0.58], [0.16, 0.84], [0, 0.9]], 10, true), { pos: [0.26, 0, 0.16] }),
        transformMesh(latheMesh([[0, 0.52], [0.14, 0.58], [0.14, 0.8], [0, 0.86]], 10, true), { pos: [0.24, 0, -0.18] })
      );
    }
    return normalizeToUnitCubeSpec(parts);
  });
}

/** Horizon Foundry Spire & Smokestack Battery (`[-0.5..+0.5]^3`): tapered stack + truss collars + cryo outriggers. */
export function buildSkylineSpireSpec(layerIndex: number): AuraCustomGeometrySpec {
  return memoizeGeometry(`td:skyline-spire:${layerIndex}`, () => {
    const spireProfile: V2[] = [[0.46, 0], [0.38, 0.32], [0.24, 0.68], [0.15, 0.92], [0.04, 1.0], [0, 1.0]];
    const parts: RawMesh[] = [
      latheMesh(spireProfile, layerIndex === 0 ? 12 : 8, true),
      transformMesh(bevelBoxMesh(0.76, 0.08, 0.76, 0.02), { pos: [0, 0.42, 0] }),
      transformMesh(bevelBoxMesh(0.56, 0.07, 0.56, 0.02), { pos: [0, 0.72, 0] })
    ];
    return normalizeToUnitCubeSpec(parts);
  });
}

/** Horizon Emissive Furnace Band & Aviation Warning Beacon (`[-0.5..+0.5]^3`). */
export function buildSkylineBeaconSeamSpec(): AuraCustomGeometrySpec {
  return memoizeGeometry("td:skyline-beacon-seam", () => {
    const collar = latheMesh([[0.42, -0.5], [0.5, -0.15], [0.5, 0.2], [0.34, 0.5], [0, 0.5]], 8, true);
    return normalizeToUnitCubeSpec([collar]);
  });
}
