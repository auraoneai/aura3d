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
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraPrimitiveNode,
  type AuraSceneNode,
  type AuraTransformSpec
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
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
    roughness: isPlayer ? 0.22 : 0.24,
    clearcoat: isPlayer ? 0.94 : 0.9,
    clearcoatRoughness: isPlayer ? 0.05 : 0.06,
    envMapIntensity: 1.88
  });
}

export const MAT_BRUSHED_TITANIUM: AuraMaterialSpec = material.brushedMetal({
  name: "td aero brushed titanium",
  color: "#5b677a",
  roughness: 0.26,
  anisotropy: 0.88,
  envMapIntensity: 1.68
});

export const MAT_RADIATOR_COPPER: AuraMaterialSpec = material.brushedMetal({
  name: "td heatsink radiator copper",
  color: "#cc6f38",
  roughness: 0.24,
  anisotropy: 0.9,
  envMapIntensity: 1.72
});

export const MAT_DARK_CHASSIS: AuraMaterialSpec = material.physical({
  name: "td tungsten chassis frame",
  color: "#1b222e",
  metallic: 0.88,
  roughness: 0.32,
  anisotropy: 0.7,
  clearcoat: 0.22,
  envMapIntensity: 1.45
});

export const MAT_THERMAL_CERAMIC: AuraMaterialSpec = material.ceramic({
  name: "td thermal nozzle ceramic",
  color: "#2b303a",
  roughness: 0.34,
  clearcoat: 0.62,
  clearcoatRoughness: 0.12,
  envMapIntensity: 1.18
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
  roughness: 0.04,
  opacity: 0.42,
  clearcoat: 1,
  ior: 1.52,
  envMapIntensity: 1.85
});

export const MAT_CRYO_GLASS: AuraMaterialSpec = material.physical({
  name: "td cryo containment glass",
  color: "#7ce8ff",
  roughness: 0.04,
  opacity: 0.42,
  clearcoat: 1,
  ior: 1.52,
  envMapIntensity: 1.9
});

export const MAT_AFTERBURNER_PLASMA: AuraMaterialSpec = material.emissive({
  name: "td rear afterburner plasma",
  color: "#ff7a24",
  emissive: "#ff6a14",
  emissiveIntensity: 3.2,
  roughness: 0.14,
  practical: true
});

export const MAT_AFTERBURNER_CYAN: AuraMaterialSpec = material.emissive({
  name: "td rear cryo afterburner",
  color: "#35d6ff",
  emissive: "#35d6ff",
  emissiveIntensity: 3.1,
  roughness: 0.14,
  practical: true
});

export const MAT_TAIL_STROBE_RED: AuraMaterialSpec = material.emissive({
  name: "td tail navigation strobe",
  color: "#ff2952",
  emissive: "#ff2952",
  emissiveIntensity: 2.8,
  roughness: 0.18,
  practical: true
});

export const MAT_FURNACE_MOLTEN: AuraMaterialSpec = material.emissive({
  name: "td molten slag core",
  color: "#ff6e1a",
  emissive: "#ff5c12",
  emissiveIntensity: 2.9,
  roughness: 0.2,
  practical: true
});

export const MAT_CRYO_CORE: AuraMaterialSpec = material.emissive({
  name: "td cryo coolant core",
  color: "#35d6ff",
  emissive: "#35d6ff",
  emissiveIntensity: 2.75,
  roughness: 0.16,
  practical: true
});

export const MAT_BOOST_AMBER: AuraMaterialSpec = material.emissive({
  name: "td turbo boost chevron",
  color: "#ffb800",
  emissive: "#ffa014",
  emissiveIntensity: 2.65,
  roughness: 0.18,
  practical: true
});

export const MAT_BEACON_STROBE: AuraMaterialSpec = material.emissive({
  name: "td foundry warning beacon",
  color: "#ff3b1f",
  emissive: "#ff3b1f",
  emissiveIntensity: 2.5,
  roughness: 0.2,
  practical: true
});

export const MAT_SOOT_IRON: AuraMaterialSpec = material.pbr({
  name: "td soot cast iron",
  color: "#241e1c",
  roughness: 0.62,
  metalness: 0.78,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.35
});

export const MAT_OXIDISED_STEEL: AuraMaterialSpec = material.pbr({
  name: "td oxidised foundry steel",
  color: "#3d2d24",
  roughness: 0.54,
  metalness: 0.72,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.3
});

export const MAT_REFRACTORY_CONCRETE: AuraMaterialSpec = material.pbr({
  name: "td refractory concrete",
  color: "#363134",
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
  color: "#2a3548",
  roughness: 0.28,
  metallic: 0.92,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.55
});

export const MAT_INSTANCED_FIN_ARRAY: AuraMaterialSpec = material.metal({
  name: "td heatsink louver array",
  color: "#202b3d",
  roughness: 0.24,
  metallic: 0.95,
  clearcoat: 0,
  sheen: 0,
  envMapIntensity: 1.75
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
  color: "#6ad8ff",
  emissive: "#2ab8ff",
  emissiveIntensity: 1.65,
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
  emissiveIntensity: 2.8,
  roughness: 0.12,
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
  chineSharpness = 0.82,
  pts = 14
): V3[] {
  const ring: V3[] = [];
  for (let i = 0; i < pts; i += 1) {
    const a = (i / pts) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    const sx = Math.sign(ca) * Math.pow(Math.abs(ca), chineSharpness);
    const sy = Math.sign(sa) * Math.pow(Math.abs(sa), sa >= 0 ? 0.88 : 1.08);
    ring.push([sx * rx, yOff + sy * (sa >= 0 ? ryTop : ryBot), z]);
  }
  return ring;
}

function buildCanopyBubbleMesh(zFront: number, zRear: number, width: number, height: number, baseY: number): RawMesh {
  const zMidA = zFront + (zRear - zFront) * 0.32;
  const zMidB = zFront + (zRear - zFront) * 0.72;
  return loftSectionsMesh(
    [
      fuselageRing(zFront, width * 0.14, height * 0.12, 0.02, baseY, 0.9, 12),
      fuselageRing(zMidA, width * 0.48, height * 0.88, 0.05, baseY + 0.02, 0.86, 12),
      fuselageRing(zMidB, width * 0.5, height, 0.05, baseY + 0.03, 0.86, 12),
      fuselageRing(zRear, width * 0.18, height * 0.18, 0.02, baseY + 0.01, 0.9, 12)
    ],
    true,
    false
  );
}

/** Dual `+Z` vector thruster nozzles, glowing afterburner plasma rings, and tail strobes facing the chase camera. */
function addDualVectorNozzles(slots: MultiMatSlot[], lateral = 0.44, y = -0.04, zExit = 1.52): void {
  const nozzleProfile: V2[] = [
    [0.24, -0.26],
    [0.28, -0.1],
    [0.21, 0.06],
    [0.27, 0.24],
    [0.23, 0.26],
    [0.18, 0.08]
  ];
  const burnerRingProfile: V2[] = [
    [0.05, -0.02],
    [0.2, -0.02],
    [0.22, 0.03],
    [0.08, 0.05],
    [0, 0.02]
  ];
  for (const side of [-1, 1] as const) {
    const nx = side * lateral;
    slots.push({
      mesh: transformMesh(latheMesh(nozzleProfile, 16), { pos: [nx, y, zExit - 0.12], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: 4
    });
    slots.push({
      mesh: transformMesh(
        tubeSweepMesh(
          Array.from({ length: 13 }, (_, k) => {
            const a = (k / 12) * Math.PI * 2;
            return [Math.cos(a) * 0.255, Math.sin(a) * 0.255, 0, 0.024] as V4;
          }),
          6
        ),
        { pos: [nx, y, zExit + 0.11] }
      ),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(latheMesh(burnerRingProfile, 14), { pos: [nx, y, zExit + 0.06], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: 5
    });
  }
  // Dorsal & wing-trailing-edge `+Z` red-amber combat strobes directly visible to the chase camera
  slots.push(
    { mesh: transformMesh(bevelBoxMesh(0.14, 0.07, 0.1, 0.02), { pos: [0, y + 0.34, zExit - 0.04] }), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(0.08, 0.06, 0.1, 0.015), { pos: [-0.92, y + 0.12, zExit - 0.18] }), materialIndex: 6 },
    { mesh: transformMesh(bevelBoxMesh(0.08, 0.06, 0.1, 0.015), { pos: [0.92, y + 0.12, zExit - 0.18] }), materialIndex: 6 }
  );
}

/** Quad lift-fan shrouds aligned to `ROTOR_DISC` (`[±1.05, +0.22, ±0.88]`) plus copper heatsink louver bank. */
function addQuadLiftShroudsAndRadiators(slots: MultiMatSlot[], finCount = 6, radiatorZ = 0.42, radiatorY = 0.24): void {
  const ductProfile: V2[] = [
    [0.26, -0.05],
    [0.32, 0],
    [0.3, 0.06],
    [0.24, 0.05]
  ];
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      slots.push({
        mesh: transformMesh(latheMesh(ductProfile, 14), { pos: [sx * 1.02, 0.16, sz * 0.84] }),
        materialIndex: 1
      });
    }
  }
  for (let i = 0; i < finCount; i += 1) {
    const fz = radiatorZ - ((finCount - 1) * 0.5 - i) * 0.11;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.56, 0.14, 0.026, 0.006), { pos: [0, radiatorY, fz], rot: [-0.22, 0, 0] }),
      materialIndex: 2
    });
  }
}

interface DroneSculptResult {
  readonly slots: MultiMatSlot[];
  readonly canopy: RawMesh;
  readonly cyanBurner?: boolean;
}

/** 1. ORION: Balanced twin-strake aerospace interceptor. */
function sculptOrion(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.88, 0.05, 0.04, 0.04, -0.04, 0.85),
        fuselageRing(-1.42, 0.28, 0.16, 0.12, -0.02, 0.78),
        fuselageRing(-0.72, 0.56, 0.28, 0.19, 0.01, 0.72),
        fuselageRing(0.08, 0.68, 0.31, 0.22, 0.02, 0.68),
        fuselageRing(0.84, 0.62, 0.26, 0.2, 0.01, 0.74),
        fuselageRing(1.42, 0.52, 0.19, 0.16, -0.02, 0.82)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Swept delta-strake wings + twin canted dorsal tail strakes + twin S-duct intake cowls
  const rightWing: V2[] = [[0.46, -0.58], [1.56, 0.36], [1.48, 0.86], [0.48, 0.92]];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(rightWing, 0.075, 0.022), {
        rot: [Math.PI * 0.5, 0, 0],
        scale: [side, 1, 1],
        pos: [0, 0.01, 0]
      }),
      materialIndex: 0
    });
    // Forward intake cowl (`loftSectionsMesh`)
    slots.push({
      mesh: loftSectionsMesh(
        [
          fuselageRing(-0.78, 0.18, 0.13, 0.11, -0.04, 0.65, 10),
          fuselageRing(-0.1, 0.22, 0.16, 0.13, -0.03, 0.68, 10),
          fuselageRing(0.72, 0.19, 0.14, 0.12, -0.03, 0.75, 10)
        ],
        true,
        false
      ),
      materialIndex: 1
    });
    slots[slots.length - 1] = {
      mesh: transformMesh(slots[slots.length - 1]!.mesh, { pos: [side * 0.58, 0, 0] }),
      materialIndex: 1
    };
    // Canted dorsal strake fin
    const finPoly: V2[] = [[0, 0], [0.58, 0.18], [0.76, 0.62], [0.34, 0.64]];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(finPoly, 0.045, 0.012), {
        pos: [side * 0.54, 0.16, 0.52],
        rot: [0, Math.PI * 0.5, side * -0.34]
      }),
      materialIndex: 0
    });
  }
  addQuadLiftShroudsAndRadiators(slots, 6, 0.44, 0.27);
  addDualVectorNozzles(slots, 0.44, -0.04, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.05, 0.05, 0.52, 0.24, 0.2) };
}

/** 2. VOLT: Split-prong arc catamaran racer with forward plasma arc-bridge. */
function sculptVolt(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  // Central streamlined pod
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.02, 0.16, 0.12, 0.1, 0.02, 0.84),
        fuselageRing(-0.28, 0.42, 0.25, 0.17, 0.04, 0.8),
        fuselageRing(0.62, 0.46, 0.24, 0.18, 0.02, 0.8),
        fuselageRing(1.38, 0.42, 0.17, 0.14, -0.02, 0.85)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Twin forward-projecting catamaran needle prongs + intake scoops + outer arc-fins
  for (const side of [-1, 1] as const) {
    const prong = loftSectionsMesh(
      [
        fuselageRing(-1.86, 0.035, 0.035, 0.035, -0.02, 0.9, 12),
        fuselageRing(-1.18, 0.17, 0.15, 0.13, -0.01, 0.78, 12),
        fuselageRing(-0.15, 0.24, 0.19, 0.16, 0.01, 0.74, 12),
        fuselageRing(0.95, 0.22, 0.17, 0.15, 0, 0.78, 12),
        fuselageRing(1.36, 0.16, 0.13, 0.12, -0.02, 0.85, 12)
      ],
      true,
      false
    );
    slots.push({ mesh: transformMesh(prong, { pos: [side * 0.66, 0, 0] }), materialIndex: 0 });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.46, 0.1, 0.44, 0.024), { pos: [side * 0.36, 0.02, 0.12] }),
      materialIndex: 3
    });
    const wingTip: V2[] = [[0.78, -0.22], [1.46, 0.35], [1.4, 0.82], [0.8, 0.68]];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(wingTip, 0.055, 0.016), {
        rot: [Math.PI * 0.5, 0, 0],
        scale: [side, 1, 1]
      }),
      materialIndex: 1
    });
  }
  // Forward plasma arc-capacitor bridge between the twin prongs
  slots.push({
    mesh: tubeSweepMesh([[-0.6, -0.01, -1.24, 0.048], [0, 0.05, -1.32, 0.062], [0.6, -0.01, -1.24, 0.048]], 8),
    materialIndex: 5
  });
  addQuadLiftShroudsAndRadiators(slots, 7, 0.48, 0.25);
  addDualVectorNozzles(slots, 0.44, -0.04, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-0.82, 0.24, 0.46, 0.23, 0.21), cyanBurner: true };
}

/** 3. BASTION: Armored heavy gunship with twin oversized intake shrouds & dorsal cannon housing. */
function sculptBastion(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  // Broad armored gunship hull
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.76, 0.18, 0.11, 0.1, -0.03, 0.62),
        fuselageRing(-1.18, 0.52, 0.25, 0.2, 0, 0.58),
        fuselageRing(-0.34, 0.76, 0.36, 0.26, 0.03, 0.55),
        fuselageRing(0.58, 0.8, 0.35, 0.26, 0.03, 0.56),
        fuselageRing(1.48, 0.64, 0.24, 0.2, -0.01, 0.64)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Twin oversized armored ramjet intake shrouds (`loftSectionsMesh`) + internal `latheMesh` shock cones
  const coneProfile: V2[] = [[0, -0.22], [0.14, 0.04], [0.11, 0.16], [0, 0.18]];
  for (const side of [-1, 1] as const) {
    const shroud = loftSectionsMesh(
      [
        fuselageRing(-1.06, 0.29, 0.24, 0.22, 0.02, 0.52, 12),
        fuselageRing(-0.28, 0.34, 0.27, 0.24, 0.02, 0.54, 12),
        fuselageRing(0.76, 0.31, 0.25, 0.22, 0.01, 0.58, 12),
        fuselageRing(1.32, 0.24, 0.19, 0.18, -0.01, 0.68, 12)
      ],
      true,
      false
    );
    slots.push({ mesh: transformMesh(shroud, { pos: [side * 0.86, 0, 0] }), materialIndex: 1 });
    slots.push({
      mesh: transformMesh(latheMesh(coneProfile, 12), { pos: [side * 0.86, 0.02, -1.04], rot: [-Math.PI * 0.5, 0, 0] }),
      materialIndex: 2
    });
    // Sloped reactive armor cheek plates + stub heavy sponsons
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.42, 0.16, 1.15, 0.035), { pos: [side * 1.24, -0.02, 0.08], rot: [0, 0, side * -0.18] }),
      materialIndex: 3
    });
  }
  // Dorsal twin-autocannon turret pod
  slots.push(
    { mesh: transformMesh(bevelBoxMesh(0.44, 0.16, 0.58, 0.04), { pos: [0, 0.4, 0.34] }), materialIndex: 3 },
    { mesh: tubeSweepMesh([[-0.11, 0.41, -0.35, 0.032], [-0.11, 0.41, 0.12, 0.038]], 8), materialIndex: 1 },
    { mesh: tubeSweepMesh([[0.11, 0.41, -0.35, 0.032], [0.11, 0.41, 0.12, 0.038]], 8), materialIndex: 1 }
  );
  addQuadLiftShroudsAndRadiators(slots, 8, 0.88, 0.32);
  addDualVectorNozzles(slots, 0.46, -0.04, 1.54);
  return { slots, canopy: buildCanopyBubbleMesh(-1.12, -0.14, 0.58, 0.21, 0.26) };
}

/** 4. SPECTRE: Forward-swept stealth delta with twin cryo-cooled laser barrel shrouds. */
function sculptSpectre(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.9, 0.04, 0.03, 0.03, -0.03, 0.7),
        fuselageRing(-1.24, 0.34, 0.16, 0.11, -0.01, 0.65),
        fuselageRing(-0.36, 0.58, 0.24, 0.16, 0.01, 0.62),
        fuselageRing(0.56, 0.62, 0.23, 0.16, 0.01, 0.64),
        fuselageRing(1.44, 0.48, 0.16, 0.13, -0.02, 0.72)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Dramatic forward-swept Berkut-style stealth wings (`z` sweeps forward to `-0.88` at wingtip!)
  const fwdWing: V2[] = [[0.48, -0.15], [1.62, -0.88], [1.66, -0.42], [0.54, 0.86]];
  const barrelProfile: V2[] = [[0.045, -0.75], [0.068, -0.55], [0.068, 0.45], [0.095, 0.65], [0.075, 0.75]];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(fwdWing, 0.062, 0.018), {
        rot: [Math.PI * 0.5, 0, 0],
        scale: [side, 1, 1]
      }),
      materialIndex: 0
    });
    // Long cryo-cooled gun barrel shroud along wing root
    slots.push({
      mesh: transformMesh(latheMesh(barrelProfile, 12), { pos: [side * 0.68, 0.02, -0.58], rot: [Math.PI * 0.5, 0, 0] }),
      materialIndex: 1
    });
    // Canted V-tail stabilizer
    const vTail: V2[] = [[0, 0], [0.46, 0.22], [0.62, 0.58], [0.24, 0.56]];
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(vTail, 0.04, 0.01), {
        pos: [side * 0.42, 0.14, 0.68],
        rot: [0, Math.PI * 0.5, side * -0.52]
      }),
      materialIndex: 3
    });
  }
  addQuadLiftShroudsAndRadiators(slots, 7, 0.46, 0.22);
  addDualVectorNozzles(slots, 0.44, -0.04, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.1, 0.02, 0.48, 0.21, 0.18), cyanBurner: true };
}

/** 5. RAZOR: Needle-nose canard racer with dorsal ram-air scoop & scimitar blades. */
function sculptRazor(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.98, 0.03, 0.03, 0.03, -0.02, 0.9),
        fuselageRing(-1.38, 0.21, 0.14, 0.11, -0.01, 0.82),
        fuselageRing(-0.48, 0.44, 0.25, 0.18, 0.02, 0.76),
        fuselageRing(0.46, 0.56, 0.27, 0.19, 0.02, 0.74),
        fuselageRing(1.46, 0.46, 0.18, 0.15, -0.02, 0.84)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Dorsal ram-air scoop intake (`loftSectionsMesh`)
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(0.05, 0.16, 0.12, 0.04, 0.28, 0.72, 10),
        fuselageRing(0.55, 0.2, 0.15, 0.05, 0.28, 0.72, 10),
        fuselageRing(1.18, 0.14, 0.09, 0.04, 0.23, 0.8, 10)
      ],
      true,
      false
    ),
    materialIndex: 1
  });
  // Forward needle canards + rear swept scimitar blades + ventral strake fins
  const canard: V2[] = [[0.18, -1.32], [0.76, -1.04], [0.72, -0.82], [0.22, -0.96]];
  const scimitar: V2[] = [[0.42, -0.08], [1.58, 0.62], [1.46, 1.04], [0.46, 0.94]];
  for (const side of [-1, 1] as const) {
    slots.push(
      {
        mesh: transformMesh(extrudePolygonMesh(canard, 0.05, 0.014), { rot: [Math.PI * 0.5, 0, 0], scale: [side, 1, 1] }),
        materialIndex: 1
      },
      {
        mesh: transformMesh(extrudePolygonMesh(scimitar, 0.068, 0.02), { rot: [Math.PI * 0.5, 0, 0], scale: [side, 1, 1] }),
        materialIndex: 0
      },
      {
        mesh: transformMesh(bevelBoxMesh(0.05, 0.22, 0.68, 0.012), { pos: [side * 0.34, -0.22, 0.62], rot: [0, 0, side * 0.28] }),
        materialIndex: 3
      }
    );
  }
  addQuadLiftShroudsAndRadiators(slots, 7, 0.68, 0.36);
  addDualVectorNozzles(slots, 0.44, -0.04, 1.5);
  return { slots, canopy: buildCanopyBubbleMesh(-1.18, 0.02, 0.42, 0.22, 0.2) };
}

/** 6. NIGHTHAWK: Faceted-chine twin-boom strike craft with inverted V-tail bridge & ordnance pylons. */
function sculptNighthawk(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  // Sharp stealth chine central fuselage (`chineSharpness = 0.56` with smooth longitudinal lofting)
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.86, 0.05, 0.03, 0.03, -0.02, 0.58),
        fuselageRing(-1.18, 0.36, 0.17, 0.11, 0, 0.56),
        fuselageRing(-0.28, 0.58, 0.25, 0.15, 0.02, 0.56),
        fuselageRing(0.62, 0.54, 0.22, 0.15, 0.01, 0.58),
        fuselageRing(1.38, 0.44, 0.16, 0.12, -0.02, 0.65)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  const wingPoly: V2[] = [[0.46, -0.42], [1.54, 0.18], [1.48, 0.68], [0.48, 0.72]];
  for (const side of [-1, 1] as const) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(wingPoly, 0.068, 0.018), { rot: [Math.PI * 0.5, 0, 0], scale: [side, 1, 1] }),
      materialIndex: 0
    });
    // Twin elongated tail booms (`loftSectionsMesh`) + boom-tip strobes + under-wing ordnance pods
    const boom = loftSectionsMesh(
      [
        fuselageRing(-0.36, 0.11, 0.1, 0.09, 0, 0.72, 10),
        fuselageRing(0.45, 0.14, 0.12, 0.11, 0.02, 0.72, 10),
        fuselageRing(1.56, 0.09, 0.09, 0.08, 0.04, 0.8, 10)
      ],
      true,
      false
    );
    slots.push(
      { mesh: transformMesh(boom, { pos: [side * 0.86, 0, 0] }), materialIndex: 1 },
      { mesh: transformMesh(bevelBoxMesh(0.09, 0.08, 0.1, 0.018), { pos: [side * 0.86, 0.06, 1.58] }), materialIndex: 6 },
      {
        mesh: tubeSweepMesh([[side * 1.18, -0.14, -0.26, 0.055], [side * 1.18, -0.14, 0.42, 0.065]], 8),
        materialIndex: 3
      }
    );
    // Inverted V-tail struts rising from twin booms to high dorsal bridge
    slots.push({
      mesh: tubeSweepMesh([[side * 0.86, 0.08, 1.28, 0.048], [side * 0.24, 0.46, 1.38, 0.042]], 6),
      materialIndex: 3
    });
  }
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.56, 0.05, 0.28, 0.014), { pos: [0, 0.46, 1.38] }),
    materialIndex: 0
  });
  addQuadLiftShroudsAndRadiators(slots, 6, 0.46, 0.24);
  addDualVectorNozzles(slots, 0.42, -0.04, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-1.08, -0.04, 0.5, 0.21, 0.2) };
}

/** 7. WRAITH: Ring-wing plasma interceptor with continuous annular shroud wing & split X-tail. */
function sculptWraith(): DroneSculptResult {
  const slots: MultiMatSlot[] = [];
  // Sleek spindle central fuselage (`loftSectionsMesh`)
  slots.push({
    mesh: loftSectionsMesh(
      [
        fuselageRing(-1.92, 0.04, 0.04, 0.04, -0.02, 0.88),
        fuselageRing(-1.22, 0.26, 0.18, 0.15, 0, 0.84),
        fuselageRing(-0.22, 0.46, 0.26, 0.2, 0.02, 0.82),
        fuselageRing(0.72, 0.48, 0.24, 0.19, 0.01, 0.82),
        fuselageRing(1.44, 0.42, 0.17, 0.15, -0.02, 0.86)
      ],
      true,
      false
    ),
    materialIndex: 0
  });
  // Continuous annular ring-wing encircling mid-aft hull (`tubeSweepMesh` closed oval loop) + glowing inner plasma rail
  const ringSpine: V4[] = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    const x = Math.cos(a) * 1.48;
    const y = 0.08 + Math.sin(a) * 0.44;
    const z = 0.16 + Math.cos(a * 2) * 0.18;
    return [x, y, z, 0.085];
  });
  const plasmaRail: V4[] = Array.from({ length: 25 }, (_, i) => {
    const a = (i / 24) * Math.PI * 2;
    return [Math.cos(a) * 1.38, 0.08 + Math.sin(a) * 0.38, 0.22 + Math.cos(a * 2) * 0.18, 0.026];
  });
  slots.push(
    { mesh: tubeSweepMesh(ringSpine, 10), materialIndex: 0 },
    { mesh: tubeSweepMesh(plasmaRail, 6), materialIndex: 5 }
  );
  // 4 radial airfoil struts anchoring the annular wing + split X-tail fins
  for (const sx of [-1, 1] as const) {
    for (const sy of [-1, 1] as const) {
      slots.push({
        mesh: tubeSweepMesh([[sx * 0.36, 0.04 + sy * 0.08, 0.1, 0.055], [sx * 1.42, 0.08 + sy * 0.26, 0.18, 0.045]], 6),
        materialIndex: 1
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.42, 0.04, 0.38, 0.01), {
          pos: [sx * 0.52, 0.04 + sy * 0.22, 1.18],
          rot: [0, 0, sx * sy * 0.58]
        }),
        materialIndex: 3
      });
    }
  }
  addQuadLiftShroudsAndRadiators(slots, 6, 0.5, 0.26);
  addDualVectorNozzles(slots, 0.42, -0.04, 1.48);
  return { slots, canopy: buildCanopyBubbleMesh(-1.12, -0.02, 0.44, 0.22, 0.2), cyanBurner: true };
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

export function buildCombatDroneNode(id: DroneId, spec: DroneSpec): AuraNodeBuilder<AuraGroupNode> {
  const sculpted = DRONE_SCULPTORS[id]();
  const bounds = measureMeshesBounds([...sculpted.slots.map((s) => s.mesh), sculpted.canopy]);
  const rawMax = Math.max(1e-4, bounds.max[0] - bounds.min[0], bounds.max[1] - bounds.min[1], bounds.max[2] - bounds.min[2]);
  const scale = spec.maxDim / rawMax;
  const scaledSlots: MultiMatSlot[] = sculpted.slots.map((s) => ({
    materialIndex: s.materialIndex,
    mesh: transformMesh(s.mesh, { scale })
  }));
  const scaledCanopy = transformMesh(sculpted.canopy, { scale });
  const materials: AuraMaterialSpec[] = [
    droneHullPaint(spec.color, id === "orion"),
    MAT_BRUSHED_TITANIUM,
    MAT_RADIATOR_COPPER,
    MAT_DARK_CHASSIS,
    MAT_THERMAL_CERAMIC,
    sculpted.cyanBurner ? MAT_AFTERBURNER_CYAN : MAT_AFTERBURNER_PLASMA,
    MAT_TAIL_STROBE_RED
  ];
  return group(
    spec.nodeId,
    [
      geometry.multiMaterial(buildGroupedGeometrySpec(scaledSlots), materials, {
        name: `${spec.nodeId}-hull`,
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(mergeRawMeshes([scaledCanopy]), {
        name: `${spec.nodeId}-canopy`,
        material: MAT_CANOPY_GLASS,
        castShadow: false,
        receiveShadow: false
      })
    ],
    { position: [0, 1.45, id === "orion" ? -0.4 : -24] }
  ).runtime(
    game.runtimeNode(
      spec.nodeId,
      id === "orion" ? { tags: ["primarySubject", "primaryVehicle", "player"] } : undefined
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
      v.materialIndex === 2 ? "#ff7a24" : v.materialIndex === 1 ? "#4b382e" : "#2b2422"
    )
  );
  for (const side of [-1, 1] as const) {
    parts.push(
      tintRawMesh(transformMesh(bevelBoxMesh(4.4, 3.2, 4.8, 0.2), { pos: [side * 16.4, 1.6, 0] }), "#252020"),
      tintRawMesh(transformMesh(bevelBoxMesh(0.8, 2.4, 4.2, 0.08), { pos: [side * 14.3, 2.0, 0] }), "#d86b28")
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
    parts.push(tintRawMesh(transformMesh(tubeSweepMesh(portalSpine, 8, true), { pos: [0, 0, zOff] }), "#2c2625"));
  }
  parts.push(
    tintRawMesh(transformMesh(bevelBoxMesh(23.0, 1.1, 14.2, 0.14), { pos: [0, 14.8, 0] }), "#382f2b"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.2, 0.42, 13.6, 0.06), { pos: [0, 13.55, 0] }), "#ffd6a0"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.4, 10.2, 14.0, 0.16), { pos: [-15.8, 5.1, 0] }), "#241f1e"),
    tintRawMesh(transformMesh(bevelBoxMesh(3.4, 10.2, 14.0, 0.16), { pos: [15.8, 5.1, 0] }), "#241f1e")
  );
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

/** 13. Batched L-Cantilever Blast-Furnace Crane Tower (`46 m`, `latticeTrussMesh` + Cowper hot-blast stoves). */
function buildTowerLBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const stoveProfile: V2[] = [[0, 0], [3.2, 0], [3.2, 22.0], [2.4, 25.2], [0.8, 26.5], [0, 26.8]];
  const parts: ColoredRawMesh[] = [
    tintRawMesh(transformMesh(bevelBoxMesh(12.0, 4.6, 10.0, 0.28), { pos: [0, 2.3, 0] }), "#312a28"),
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [5.4, 42.0, 5.4], bays: 9, chordRadius: 0.3 }), { pos: [-2.4, 23.0, 0] }), "#2b2321"),
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [22.0, 3.6, 4.0], bays: 7, chordRadius: 0.24 }), { pos: [6.2, 42.5, 0] }), "#433128"),
    tintRawMesh(transformMesh(latheMesh(stoveProfile, 16), { pos: [4.6, 0, -2.2] }), "#543b2e"),
    tintRawMesh(transformMesh(latheMesh(stoveProfile, 16), { pos: [4.6, 0, 2.6] }), "#4a3429"),
    tintRawMesh(transformMesh(bevelBoxMesh(1.1, 1.1, 1.1, 0.14), { pos: [16.8, 44.8, 0] }), "#ff4d1f")
  ];
  return fitGroundedColoredSpec(parts, baseMaxDim);
}

/** 14. Batched Cantilevered Holo-Billboard (`9.5 m`, side truss arm + holographic emitter frame). */
function buildHoloBillboardBatchSpec(baseMaxDim: number): AuraCustomGeometrySpec {
  const parts: ColoredRawMesh[] = [
    tintRawMesh(transformMesh(latticeTrussMesh({ span: [1.1, 8.8, 1.1], bays: 5, chordRadius: 0.09 }), { pos: [-3.4, 4.4, 0] }), "#283648"),
    tintRawMesh(transformMesh(bevelBoxMesh(7.6, 0.42, 0.48, 0.06), { pos: [0.4, 8.4, 0] }), "#35d6ff"),
    tintRawMesh(transformMesh(bevelBoxMesh(7.6, 0.42, 0.48, 0.06), { pos: [0.4, 3.6, 0] }), "#ff6a1a"),
    tintRawMesh(transformMesh(bevelBoxMesh(6.8, 4.2, 0.14, 0.04), { pos: [0.4, 6.0, 0] }), "#6be4ff")
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

function buildCryoCoolantCellNode(anchor: SceneryAnchor): AuraNodeBuilder<AuraGroupNode> {
  const capBot: V2[] = [[0, 0], [0.44, 0], [0.48, 0.18], [0.42, 0.34], [0, 0.34]];
  const capTop: V2[] = [[0, 1.72], [0.42, 1.72], [0.48, 1.88], [0.28, 2.04], [0, 2.1]];
  const core: V2[] = [[0, 0.32], [0.24, 0.36], [0.24, 1.7], [0, 1.74]];
  const glassSleeve = latheMesh([[0.38, 0.34], [0.41, 0.42], [0.41, 1.66], [0.38, 1.72]], 16);
  const opaqueSlots: MultiMatSlot[] = [
    { mesh: latheMesh(capBot, 16), materialIndex: 3 },
    { mesh: latheMesh(capTop, 16), materialIndex: 3 },
    { mesh: latheMesh(core, 14), materialIndex: 7 }
  ];
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2;
    opaqueSlots.push({
      mesh: tubeSweepMesh([[Math.cos(a) * 0.47, 0.24, Math.sin(a) * 0.47, 0.032], [Math.cos(a) * 0.47, 1.82, Math.sin(a) * 0.47, 0.032]], 6),
      materialIndex: 2
    });
  }
  return group(
    anchor.id,
    [
      geometry.multiMaterial(buildGroupedGeometrySpec(opaqueSlots), FOUNDRY_MATS, {
        name: `${anchor.id}-body`,
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(mergeRawMeshes([glassSleeve]), {
        name: `${anchor.id}-glass`,
        material: MAT_CRYO_GLASS,
        castShadow: false,
        receiveShadow: false
      })
    ],
    { position: [anchor.lateralX, anchor.baseY, -anchor.s], rotation: [0, anchor.yaw, 0] }
  ).runtime(game.runtimeNode(anchor.id));
}

function buildShieldPickupNode(anchor: SceneryAnchor): AuraNodeBuilder<AuraGroupNode> {
  const ringA: V4[] = Array.from({ length: 21 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return [Math.cos(a) * 0.78, 1.0 + Math.sin(a) * 0.78, 0, 0.055];
  });
  const ringB: V4[] = Array.from({ length: 21 }, (_, i) => {
    const a = (i / 20) * Math.PI * 2;
    return [0, 1.0 + Math.sin(a) * 0.72, Math.cos(a) * 0.72, 0.05];
  });
  const opaqueSlots: MultiMatSlot[] = [
    { mesh: transformMesh(icosphereFacetMesh(0.42, 1, 0.04, 13), { pos: [0, 1.0, 0] }), materialIndex: 7 },
    { mesh: tubeSweepMesh(ringA, 8), materialIndex: 2 },
    { mesh: tubeSweepMesh(ringB, 8), materialIndex: 3 }
  ];
  const shell = transformMesh(icosphereFacetMesh(0.94, 1, 0, 5), { pos: [0, 1.0, 0] });
  return group(
    anchor.id,
    [
      geometry.multiMaterial(buildGroupedGeometrySpec(opaqueSlots), FOUNDRY_MATS, {
        name: `${anchor.id}-core`,
        castShadow: true,
        receiveShadow: true
      }),
      geometry.custom(mergeRawMeshes([shell]), {
        name: `${anchor.id}-shell`,
        material: MAT_CRYO_GLASS,
        castShadow: false,
        receiveShadow: false
      })
    ],
    { position: [anchor.lateralX, anchor.baseY, -anchor.s], rotation: [0, anchor.yaw, 0] }
  ).runtime(game.runtimeNode(anchor.id));
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

export function buildSingleSceneryNode(anchor: SceneryAnchor, castShadow: boolean): AuraNodeBuilder<AuraGroupNode> {
  if (anchor.assetKey === "heatsinkCoolingCanister") return buildCryoCoolantCellNode(anchor);
  if (anchor.assetKey === "heatsinkShieldPickup") return buildShieldPickupNode(anchor);
  const fn = SINGLE_SCENERY_BUILDERS[anchor.assetKey];
  if (!fn) throw new Error(`thermal-drift: unknown procedural scenery key ${anchor.assetKey}`);
  const fitted = fitGroundedSlots(fn(), anchor.maxDim);
  return assembleMultiMaterialNode(anchor.id, fitted, FOUNDRY_MATS, {
    id: anchor.id,
    position: [anchor.lateralX, anchor.baseY, -anchor.s],
    rotation: [0, anchor.yaw, 0],
    castShadow,
    receiveShadow: true
  });
}

export function buildBatchedSceneryNode(batch: {
  readonly id: string;
  readonly assetKey: string;
  readonly baseMaxDim: number;
  readonly castShadow: boolean;
  readonly anchors: readonly SceneryAnchor[];
}): AuraNodeBuilder<AuraPrimitiveNode> {
  const spec =
    batch.assetKey === "heatsink_thermalArchIron"
      ? buildThermalArchBatchSpec(batch.baseMaxDim)
      : batch.assetKey === "heatsinkTunnelFrame"
        ? buildTunnelFrameBatchSpec(batch.baseMaxDim)
        : batch.assetKey === "heatsink_thermalTowerLIron"
          ? buildTowerLBatchSpec(batch.baseMaxDim)
          : buildHoloBillboardBatchSpec(batch.baseMaxDim);
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

export function buildProximityMineNode(id: string): AuraNodeBuilder<AuraGroupNode> {
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
  return assembleMultiMaterialNode(id, fitGroundedSlots(slots, 1.45), FOUNDRY_MATS, {
    id,
    position: [0, 0.35, -28],
    castShadow: true,
    receiveShadow: true
  });
}

/** Lathed seeker missile along `Y` (`main.ts` rotates `[+PI/2, -heading, 0]`, mapping `-Y -> -Z` and `+Y -> +Z`). */
export function buildSeekerMissileNode(id: string, isIncoming: boolean): AuraNodeBuilder<AuraGroupNode> {
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
  return assembleMultiMaterialNode(id, slots, FOUNDRY_MATS, {
    id,
    position: [0, -60, 0],
    rotation: [Math.PI * 0.5, 0, 0],
    castShadow: false,
    receiveShadow: false
  });
}

/** XY-plane plasma shockwave torus (`main.ts` expands `scale: [s, s, 1]` on top of `.rotate(PI/2, 0, 0)`). */
export function buildShockwaveRingNode(id: string): AuraNodeBuilder<AuraSceneNode> {
  const spine: V4[] = Array.from({ length: 29 }, (_, i) => {
    const a = (i / 28) * Math.PI * 2;
    return [Math.cos(a) * 1.1, Math.sin(a) * 1.1, 0, 0.075];
  });
  return geometry
    .custom(mergeRawMeshes([tubeSweepMesh(spine, 10)]), {
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
  const profile: V2[] = [[-0.475, -0.675], [0.475, -0.675], [0.42, -0.15], [0.3, 0.56], [0.18, 0.675], [-0.18, 0.675], [-0.3, 0.56], [-0.42, -0.15]];
  const body = extrudePolygonMesh(profile, 12.8, 0.06, true);
  const cap = transformMesh(bevelBoxMesh(0.46, 0.14, 12.6, 0.03), { pos: [0, 0.64, 0] });
  return mergeRawMeshes([body, cap]);
}

export function buildHeatsinkFinSpec(): AuraCustomGeometrySpec {
  const parts: RawMesh[] = [bevelBoxMesh(0.24, 2.75, 2.1, 0.04)];
  for (let i = 0; i < 6; i += 1) {
    const fz = -0.85 + i * 0.34;
    parts.push(transformMesh(bevelBoxMesh(0.58, 2.52, 0.09, 0.02), { pos: [0, 0.04, fz] }));
  }
  return mergeRawMeshes(parts);
}

export function buildLaserBoltSpec(): AuraCustomGeometrySpec {
  const bolt = latheMesh([[0, -1.4], [0.075, -0.85], [0.065, 0.95], [0, 1.4]], 8, true);
  return mergeRawMeshes([transformMesh(bolt, { rot: [Math.PI * 0.5, 0, 0] })]);
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
}

/** Horizon Foundry Spire & Smokestack Battery (`[-0.5..+0.5]^3`): tapered stack + truss collars + cryo outriggers. */
export function buildSkylineSpireSpec(layerIndex: number): AuraCustomGeometrySpec {
  const spireProfile: V2[] = [[0.46, 0], [0.38, 0.32], [0.24, 0.68], [0.15, 0.92], [0.04, 1.0], [0, 1.0]];
  const parts: RawMesh[] = [
    latheMesh(spireProfile, layerIndex === 0 ? 12 : 8, true),
    transformMesh(bevelBoxMesh(0.76, 0.08, 0.76, 0.02), { pos: [0, 0.42, 0] }),
    transformMesh(bevelBoxMesh(0.56, 0.07, 0.56, 0.02), { pos: [0, 0.72, 0] })
  ];
  return normalizeToUnitCubeSpec(parts);
}

/** Horizon Emissive Furnace Band & Aviation Warning Beacon (`[-0.5..+0.5]^3`). */
export function buildSkylineBeaconSeamSpec(): AuraCustomGeometrySpec {
  const collar = latheMesh([[0.42, -0.5], [0.5, -0.15], [0.5, 0.2], [0.34, 0.5], [0, 0.5]], 8, true);
  return normalizeToUnitCubeSpec([collar]);
}
