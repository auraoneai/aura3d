/**
 * Cross Hop (WP-13) — Bespoke Multi-Material Procedural Fleet, River & Woodland Kit.
 *
 * Replaces all static Meshy vehicle, train, river-log, coin, rescue-pod, and hawk GLBs
 * while keeping all 12 rigged critter hoppers intact. Sculpted exclusively through the
 * shared `@aura3d/engine` + `showcase-port-shared/proceduralKernel` smooth-normal
 * primitives (`loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`,
 * `wheelAssemblySlots`, `icosphereFacetMesh`, `coniferBoughTierMesh`, `layeredCanopyMesh`,
 * `stratifiedCliffMesh`, `bevelBoxMesh`, `assembleMultiMaterialNode`).
 */
import {
  geometry,
  group,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import {
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  computePositionsBounds,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  stratifiedCliffMesh,
  transformMesh,
  tubeSweepMesh,
  wheelAssemblySlots,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../showcase-port-shared/proceduralKernel";

export type ProceduralVehicleKind =
  | "car"
  | "hatch"
  | "suv"
  | "taxi"
  | "van"
  | "pickup"
  | "truck"
  | "tram"
  | "train"
  | "hover";

export interface VehiclePoolOptions {
  readonly targetMaxDimension: number;
}

/**
 * Physical multi-lobe material library for single-node hero & showcase assemblies, plus
 * single-lobe (`clearcoat: 0, sheen: 0`) `pbr` / `metal` presets for `>16` instanced pools.
 */
export const CROSS_HOP_PROCEDURAL_MATERIALS = {
  // Multi-lobe automotive, rail, raptor & gacha hero materials
  sedanClearcoat: material.clearcoatPaint({
    color: "#df3f35",
    roughness: 0.14,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.35
  }),
  cobaltCarPaint: material.carPaint({
    color: "#2958b8",
    roughness: 0.16,
    metalness: 0.42,
    clearcoat: 1,
    clearcoatRoughness: 0.045,
    envMapIntensity: 1.38
  }),
  capsuleLacquer: material.lacquer({
    color: "#ff5c97",
    roughness: 0.12,
    clearcoat: 0.96,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.3
  }),
  anisotropicSteel: material.brushedMetal({
    color: "#cdd5e0",
    roughness: 0.28,
    metalness: 0.92,
    envMapIntensity: 1.28
  }),
  forgedRimAlloy: material.studioMetal({
    color: "#e6edf5",
    roughness: 0.2,
    metalness: 0.94,
    envMapIntensity: 1.34
  }),
  porcelainSign: material.ceramic({
    color: "#f7f4ec",
    roughness: 0.24,
    clearcoat: 0.62,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.05
  }),
  raptorPlumage: material.matteClay({
    color: "#5b4030",
    roughness: 0.84,
    envMapIntensity: 0.78
  }),
  raptorBreast: material.matteClay({
    color: "#efe1c8",
    roughness: 0.8,
    envMapIntensity: 0.82
  }),
  raptorBeak: material.lacquer({
    color: "#f5b82e",
    roughness: 0.22,
    clearcoat: 0.72,
    clearcoatRoughness: 0.1
  }),
  mossyFelt: material.felt({
    color: "#4f8d4e",
    roughness: 0.9,
    sheen: 0.32,
    envMapIntensity: 0.65
  }),
  tireRubber: material.blackRubber({
    color: "#1f2228",
    roughness: 0.88
  }),
  windshieldGlass: material.physical({
    color: "#cde8f6",
    roughness: 0.04,
    opacity: 0.42,
    clearcoat: 1,
    ior: 1.5
  }),
  headlightLamp: material.emissive({
    color: "#fff7dc",
    emissive: "#ffe9a6",
    emissiveIntensity: 1.25,
    roughness: 0.18,
    practical: true
  }),
  taillightLamp: material.emissive({
    color: "#ff3348",
    emissive: "#ff243c",
    emissiveIntensity: 1.18,
    roughness: 0.22,
    practical: true
  }),
  rescueCoreGlow: material.emissive({
    color: "#ffe169",
    emissive: "#ffba3b",
    emissiveIntensity: 1.32,
    roughness: 0.2,
    practical: true
  }),
  // Single-lobe hardware-instancing (`>16` instances) pool materials (`clearcoat: 0, sheen: 0`)
  instancedVehicleBody: material.pbr({
    color: "#ffffff",
    roughness: 0.28,
    metalness: 0.14,
    clearcoat: 0,
    sheen: 0
  }),
  instancedCoinGold: material.metal({
    color: "#ffd84d",
    roughness: 0.24,
    metalness: 0.86,
    clearcoat: 0,
    sheen: 0
  }),
  instancedWoodBark: material.pbr({
    color: "#ffffff",
    roughness: 0.88,
    metalness: 0,
    clearcoat: 0,
    sheen: 0
  }),
  instancedFoliage: material.pbr({
    color: "#ffffff",
    roughness: 0.78,
    metalness: 0,
    clearcoat: 0,
    sheen: 0
  })
} as const satisfies Readonly<Record<string, AuraMaterialSpec>>;

type Rgb = readonly [number, number, number];

interface ColoredRawMesh extends RawMesh {
  readonly colors?: Float32Array;
}

/** Stamps uniform `[r, g, b, 1]` vertex color onto a `RawMesh` for single-draw multi-tone instancing. */
function tintRawMesh(mesh: RawMesh, rgb: Rgb): ColoredRawMesh {
  const vCount = mesh.positions.length / 3;
  const colors = new Float32Array(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const o = i * 4;
    colors[o] = rgb[0];
    colors[o + 1] = rgb[1];
    colors[o + 2] = rgb[2];
    colors[o + 3] = 1;
  }
  return { ...mesh, colors };
}

function transformColoredMesh(src: ColoredRawMesh, opts: Parameters<typeof transformMesh>[1]): ColoredRawMesh {
  const out = transformMesh(src, opts);
  return src.colors ? { ...out, colors: src.colors } : out;
}

function placeTinted(src: RawMesh, opts: Parameters<typeof transformMesh>[1], rgb: Rgb): ColoredRawMesh {
  return tintRawMesh(transformMesh(src, opts), rgb);
}

/** Merges `RawMesh` parts while preserving per-vertex RGBA `colors` and precomputing `bounds`. */
function mergeColoredMeshesToSpec(parts: readonly ColoredRawMesh[]): AuraCustomGeometrySpec {
  const hasColors = parts.some((p) => p.colors !== undefined);
  if (!hasColors) return mergeRawMeshes(parts);

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
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
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

/**
 * Rotates a `+Z`-forward vehicle assembly onto `+X` (Cross Hop lane travel axis at `ry = 0`),
 * scales uniformly so `max(spanX, spanY, spanZ) === targetMaxDimension`, centers `X/Z`, and grounds `minY = 0`.
 */
function fitPartsToMoverEnvelope(partsZForward: readonly ColoredRawMesh[], targetMaxDimension: number): AuraCustomGeometrySpec {
  const rotated = partsZForward.map((p) => transformColoredMesh(p, { rot: [0, Math.PI / 2, 0] }));
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of rotated) {
    const pos = p.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  const maxSpan = Math.max(1e-4, maxX - minX, maxY - minY, maxZ - minZ);
  const s = targetMaxDimension / maxSpan;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const fitted = rotated.map((p) =>
    transformColoredMesh(p, {
      scale: s,
      pos: [-cx * s, -minY * s, -cz * s]
    })
  );
  return mergeColoredMeshesToSpec(fitted);
}

/** Normalizes any multi-part `RawMesh` list into `[-0.5..+0.5]^3` so unit `InstancePool` scales map `1:1`. */
function normalizePartsToUnitCube(parts: readonly ColoredRawMesh[]): AuraCustomGeometrySpec {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const pos = p.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  }
  const sx = 1 / Math.max(1e-4, maxX - minX);
  const sy = 1 / Math.max(1e-4, maxY - minY);
  const sz = 1 / Math.max(1e-4, maxZ - minZ);
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const fitted = parts.map((p) =>
    transformColoredMesh(p, {
      scale: [sx, sy, sz],
      pos: [-cx * sx, -cy * sy, -cz * sz]
    })
  );
  return mergeColoredMeshesToSpec(fitted);
}

const COL_TIRE: Rgb = [0.15, 0.16, 0.19];
const COL_RIM: Rgb = [0.88, 0.91, 0.96];
const COL_CHROME: Rgb = [0.84, 0.88, 0.93];
const COL_TRIM_DARK: Rgb = [0.19, 0.21, 0.25];
const COL_CABIN_GLASS: Rgb = [0.46, 0.72, 0.88];
const COL_HEADLIGHT: Rgb = [1.0, 0.96, 0.80];
const COL_TAILLIGHT: Rgb = [0.98, 0.20, 0.25];

interface SuperellipseSection {
  readonly z: number;
  readonly rx: number;
  readonly ry: number;
  readonly y: number;
  readonly superellipseN?: number;
}

function chamferBox(size: readonly [number, number, number], bevel = 0.03): RawMesh {
  return bevelBoxMesh(size[0], size[1], size[2], bevel);
}

function superellipseLoft(
  specs: readonly SuperellipseSection[],
  radialSegs = 24,
  capEnds = true,
  flatShaded = false
): RawMesh {
  const segs = Math.max(8, Math.floor(radialSegs));
  const rings: V3[][] = specs.map((s) => {
    const exp = 2 / Math.max(1.2, s.superellipseN ?? 2.4);
    const ring: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), exp) * s.rx;
      const y = s.y + Math.sign(sa) * Math.pow(Math.abs(sa), exp) * s.ry;
      ring.push([x, y, s.z]);
    }
    return ring;
  });
  return loftSectionsMesh(rings, capEnds, flatShaded);
}

function appendWheelSet(
  out: ColoredRawMesh[],
  axlesZ: readonly number[],
  trackHalfX: number,
  radius: number,
  width: number
): void {
  const wheelSlots = wheelAssemblySlots({ radius, width, spokeCount: 5, tireMat: 0, rimMat: 1, rotorMat: 2 });
  for (const az of axlesZ) {
    for (const side of [-1, 1] as const) {
      for (const slot of wheelSlots) {
        const rgb = slot.materialIndex === 0 ? COL_TIRE : slot.materialIndex === 1 ? COL_RIM : COL_CHROME;
        out.push(
          placeTinted(
            slot.mesh,
            {
              pos: [side * trackHalfX, radius, az],
              rot: side < 0 ? [0, Math.PI, 0] : [0, 0, 0]
            },
            rgb
          )
        );
      }
    }
  }
}

interface RoadCarRecipe {
  readonly paint: Rgb;
  readonly accent?: Rgb;
  readonly halfLen: number;
  readonly halfW: number;
  readonly beltY: number;
  readonly roofY: number;
  readonly cabinFrontZ: number;
  readonly cabinRearZ: number;
  readonly roofTaper: number;
  readonly wheelR: number;
  readonly wheelW: number;
  readonly kind: "car" | "hatch" | "suv" | "taxi" | "van" | "pickup";
}

function buildRoadCarParts(r: RoadCarRecipe): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const groundClear = r.wheelR * 0.56;
  const midY = (groundClear + r.beltY) * 0.5;
  const bodyHalfH = (r.beltY - groundClear) * 0.5;
  const L = r.halfLen;
  const W = r.halfW;

  // Smooth lofted lower coachwork hull (`loftSectionsMesh`, `flatShaded = false`)
  const hull = superellipseLoft(
    [
      { z: -L, rx: W * 0.78, ry: bodyHalfH * 0.72, y: midY, superellipseN: 3.1 },
      { z: -L * 0.78, rx: W * 0.98, ry: bodyHalfH * 0.96, y: midY + 0.01, superellipseN: 3.6 },
      { z: 0, rx: W, ry: bodyHalfH, y: midY + 0.015, superellipseN: 3.8 },
      { z: L * 0.72, rx: W * 0.97, ry: bodyHalfH * 0.92, y: midY, superellipseN: 3.5 },
      { z: L, rx: W * 0.80, ry: bodyHalfH * 0.66, y: midY - 0.015, superellipseN: 3.0 }
    ],
    24,
    true,
    false
  );
  out.push(tintRawMesh(hull, r.paint));

  // Smooth lofted wraparound glass greenhouse + crowned painted roof cap
  const cabH = r.roofY - r.beltY;
  const cabMidY = r.beltY + cabH * 0.48;
  const glass = superellipseLoft(
    [
      { z: r.cabinRearZ, rx: W * 0.84, ry: cabH * 0.42, y: cabMidY - 0.01, superellipseN: 3.0 },
      { z: r.cabinRearZ + (r.cabinFrontZ - r.cabinRearZ) * 0.24, rx: W * 0.86 * r.roofTaper, ry: cabH * 0.52, y: cabMidY + 0.01, superellipseN: 3.3 },
      { z: r.cabinFrontZ - (r.cabinFrontZ - r.cabinRearZ) * 0.28, rx: W * 0.85 * r.roofTaper, ry: cabH * 0.50, y: cabMidY + 0.008, superellipseN: 3.3 },
      { z: r.cabinFrontZ, rx: W * 0.82, ry: cabH * 0.36, y: cabMidY - 0.02, superellipseN: 2.9 }
    ],
    22,
    true,
    false
  );
  out.push(tintRawMesh(glass, COL_CABIN_GLASS));

  const roofLen = (r.cabinFrontZ - r.cabinRearZ) * 0.62;
  const roofCenterZ = (r.cabinFrontZ + r.cabinRearZ) * 0.5 - 0.02;
  out.push(
    placeTinted(
      chamferBox([W * 1.56 * r.roofTaper, 0.055, roofLen], 0.02),
      { pos: [0, r.roofY + 0.006, roofCenterZ] },
      r.accent ?? r.paint
    )
  );

  // Front radiator grille, bevelled bumpers, dual headlights, crimson taillights & side mirrors
  out.push(
    placeTinted(chamferBox([W * 1.66, 0.11, 0.11], 0.03), { pos: [0, groundClear + 0.04, L + 0.02] }, COL_CHROME),
    placeTinted(chamferBox([W * 1.66, 0.11, 0.11], 0.03), { pos: [0, groundClear + 0.04, -L - 0.02] }, COL_CHROME),
    placeTinted(chamferBox([W * 0.92, bodyHalfH * 0.62, 0.05], 0.015), { pos: [0, midY - 0.01, L + 0.01] }, COL_TRIM_DARK)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([W * 0.32, 0.095, 0.06], 0.02), { pos: [sgn * W * 0.62, midY + 0.04, L + 0.01] }, COL_HEADLIGHT),
      placeTinted(chamferBox([W * 0.34, 0.095, 0.06], 0.02), { pos: [sgn * W * 0.60, midY + 0.05, -L - 0.01] }, COL_TAILLIGHT),
      placeTinted(chamferBox([0.09, 0.065, 0.11], 0.02), { pos: [sgn * (W + 0.04), r.beltY + 0.06, r.cabinFrontZ - 0.18] }, r.paint)
    );
  }

  // Class-specific silhouettes
  if (r.kind === "hatch") {
    out.push(
      placeTinted(chamferBox([W * 1.48, 0.045, 0.18], 0.015), { pos: [0, r.roofY + 0.03, r.cabinRearZ + 0.04], rot: [0.18, 0, 0] }, COL_TRIM_DARK)
    );
  } else if (r.kind === "suv") {
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.045, 0.05, roofLen * 0.94], 0.012), { pos: [sgn * W * 0.64, r.roofY + 0.045, roofCenterZ] }, COL_CHROME));
    }
    const spare = wheelAssemblySlots({ radius: r.wheelR * 0.82, width: r.wheelW * 0.85, spokeCount: 5, tireMat: 0, rimMat: 1 });
    for (const sl of spare) {
      out.push(
        placeTinted(
          sl.mesh,
          { pos: [0, midY + 0.14, -L - 0.06], rot: [0, Math.PI / 2, 0] },
          sl.materialIndex === 0 ? COL_TIRE : COL_RIM
        )
      );
    }
  } else if (r.kind === "taxi") {
    out.push(
      placeTinted(chamferBox([0.40, 0.12, 0.20], 0.03), { pos: [0, r.roofY + 0.08, roofCenterZ + 0.08] }, [1.0, 0.88, 0.22]),
      placeTinted(chamferBox([0.44, 0.03, 0.24], 0.01), { pos: [0, r.roofY + 0.025, roofCenterZ + 0.08] }, COL_TRIM_DARK)
    );
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.03, 0.075, L * 1.32], 0.008), { pos: [sgn * (W + 0.006), midY + 0.04, 0] }, COL_TRIM_DARK));
    }
  } else if (r.kind === "van") {
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.03, 0.12, L * 1.62], 0.01), { pos: [sgn * (W + 0.006), midY - 0.03, -0.04] }, [0.93, 0.48, 0.20]));
    }
    out.push(placeTinted(chamferBox([W * 1.32, 0.05, roofLen * 0.72], 0.015), { pos: [0, r.roofY + 0.045, roofCenterZ - 0.08] }, COL_CHROME));
  } else if (r.kind === "pickup") {
    // Open rear bed liner + tubular roll bar + amber beacon
    out.push(placeTinted(chamferBox([W * 1.56, 0.06, L * 0.82], 0.015), { pos: [0, r.beltY - 0.06, -L * 0.48] }, COL_TRIM_DARK));
    const rollBar: V4[] = [
      [-W * 0.68, r.beltY, -0.06, 0.035],
      [-W * 0.62, r.roofY + 0.02, -0.10, 0.035],
      [W * 0.62, r.roofY + 0.02, -0.10, 0.035],
      [W * 0.68, r.beltY, -0.06, 0.035]
    ];
    out.push(
      tintRawMesh(tubeSweepMesh(rollBar, 10, false), COL_CHROME),
      placeTinted(chamferBox([0.36, 0.08, 0.14], 0.02), { pos: [0, r.roofY + 0.055, roofCenterZ] }, [1.0, 0.68, 0.14])
    );
  }

  const axleSpan = L * 0.62;
  appendWheelSet(out, [-axleSpan, axleSpan], W * 0.90, r.wheelR, r.wheelW);
  return out;
}

function buildBoxTruckParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const wheelR = 0.24;
  const wheelW = 0.15;
  const chassisY = 0.22;

  // Chassis frame rails
  out.push(placeTinted(chamferBox([0.78, 0.12, 3.05], 0.025), { pos: [0, chassisY, 0] }, COL_TRIM_DARK));

  // Sculpted cab-over-engine forward tractor (`loftSectionsMesh`)
  const cab = superellipseLoft(
    [
      { z: 0.56, rx: 0.50, ry: 0.44, y: 0.66, superellipseN: 4.0 },
      { z: 1.12, rx: 0.50, ry: 0.44, y: 0.65, superellipseN: 3.8 },
      { z: 1.50, rx: 0.47, ry: 0.38, y: 0.58, superellipseN: 3.2 },
      { z: 1.62, rx: 0.43, ry: 0.26, y: 0.48, superellipseN: 2.8 }
    ],
    22,
    true,
    false
  );
  out.push(
    tintRawMesh(cab, [0.98, 0.98, 0.99]),
    placeTinted(chamferBox([0.88, 0.30, 0.38], 0.04), { pos: [0, 0.84, 1.34], rot: [0.16, 0, 0] }, COL_CABIN_GLASS),
    // Rooftop aero wind fairing + emergency rescue lightbar
    placeTinted(chamferBox([0.88, 0.18, 0.44], 0.05), { pos: [0, 1.16, 0.96], rot: [0.28, 0, 0] }, [0.96, 0.97, 0.99]),
    placeTinted(chamferBox([0.62, 0.075, 0.15], 0.02), { pos: [0, 1.14, 1.34] }, [0.98, 0.24, 0.22]),
    // Bevelled cargo/rescue box body + brushed aluminum corner trim
    placeTinted(chamferBox([1.06, 1.06, 2.12], 0.06), { pos: [0, 0.80, -0.56] }, [0.98, 0.98, 1.0]),
    placeTinted(chamferBox([0.92, 0.88, 0.05], 0.02), { pos: [0, 0.80, -1.62] }, COL_CHROME),
    placeTinted(chamferBox([0.98, 0.14, 0.12], 0.03), { pos: [0, 0.26, 1.62] }, COL_CHROME),
    placeTinted(chamferBox([0.64, 0.22, 0.05], 0.015), { pos: [0, 0.46, 1.61] }, COL_TRIM_DARK)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([0.18, 0.11, 0.06], 0.02), { pos: [sgn * 0.34, 0.42, 1.62] }, COL_HEADLIGHT),
      placeTinted(chamferBox([0.20, 0.10, 0.06], 0.02), { pos: [sgn * 0.36, 0.32, -1.63] }, COL_TAILLIGHT)
    );
  }
  appendWheelSet(out, [-1.12, -0.54, 1.12], 0.47, wheelR, wheelW);
  return out;
}

function buildTramParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  // Heritage streetcar: rounded symmetrical bonnets, coral lower apron, ivory clerestory window band & pantograph
  const lowerApron = superellipseLoft(
    [
      { z: -2.08, rx: 0.44, ry: 0.26, y: 0.42, superellipseN: 3.0 },
      { z: -1.72, rx: 0.54, ry: 0.30, y: 0.44, superellipseN: 3.8 },
      { z: 1.72, rx: 0.54, ry: 0.30, y: 0.44, superellipseN: 3.8 },
      { z: 2.08, rx: 0.44, ry: 0.26, y: 0.42, superellipseN: 3.0 }
    ],
    24,
    true,
    false
  );
  const upperSaloon = superellipseLoft(
    [
      { z: -1.96, rx: 0.42, ry: 0.30, y: 0.92, superellipseN: 3.0 },
      { z: -1.64, rx: 0.52, ry: 0.34, y: 0.95, superellipseN: 3.6 },
      { z: 1.64, rx: 0.52, ry: 0.34, y: 0.95, superellipseN: 3.6 },
      { z: 1.96, rx: 0.42, ry: 0.30, y: 0.92, superellipseN: 3.0 }
    ],
    24,
    true,
    false
  );
  out.push(
    tintRawMesh(lowerApron, [0.86, 0.30, 0.25]),
    tintRawMesh(upperSaloon, [0.97, 0.94, 0.86]),
    placeTinted(chamferBox([1.07, 0.32, 3.28], 0.03), { pos: [0, 0.94, 0] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([0.92, 0.11, 3.55], 0.04), { pos: [0, 1.31, 0] }, [0.92, 0.90, 0.84]),
    placeTinted(chamferBox([0.78, 0.18, 0.92], 0.02), { pos: [0, 0.11, -1.12] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.78, 0.18, 0.92], 0.02), { pos: [0, 0.11, 1.12] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.22, 0.14, 0.08], 0.03), { pos: [0, 0.52, 2.09] }, COL_HEADLIGHT),
    placeTinted(chamferBox([0.46, 0.10, 0.06], 0.02), { pos: [0, 1.16, 1.96] }, [1.0, 0.84, 0.32])
  );
  const panto: V4[] = [
    [0, 1.36, -0.26, 0.026],
    [0, 1.56, 0.06, 0.022],
    [0, 1.72, -0.14, 0.022]
  ];
  out.push(
    tintRawMesh(tubeSweepMesh(panto, 8, false), COL_CHROME),
    placeTinted(chamferBox([0.58, 0.03, 0.08], 0.01), { pos: [0, 1.73, -0.14] }, COL_CHROME)
  );
  return out;
}

function buildExpressTrainParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  // Aerodynamic Shinkansen/express bullet locomotive with swept duckbill nose & skirted bogies
  const fuselage = superellipseLoft(
    [
      { z: -2.42, rx: 0.52, ry: 0.52, y: 0.68, superellipseN: 3.8 },
      { z: 0.92, rx: 0.54, ry: 0.54, y: 0.70, superellipseN: 3.8 },
      { z: 1.66, rx: 0.50, ry: 0.44, y: 0.58, superellipseN: 3.0 },
      { z: 2.26, rx: 0.36, ry: 0.25, y: 0.38, superellipseN: 2.5 },
      { z: 2.62, rx: 0.14, ry: 0.10, y: 0.26, superellipseN: 2.1 }
    ],
    26,
    true,
    false
  );
  const driverCanopy = superellipseLoft(
    [
      { z: 0.94, rx: 0.44, ry: 0.22, y: 0.98, superellipseN: 3.0 },
      { z: 1.48, rx: 0.41, ry: 0.20, y: 0.88, superellipseN: 2.8 },
      { z: 1.94, rx: 0.28, ry: 0.12, y: 0.70, superellipseN: 2.4 }
    ],
    22,
    true,
    false
  );
  out.push(
    tintRawMesh(fuselage, [0.97, 0.98, 1.0]),
    tintRawMesh(driverCanopy, COL_CABIN_GLASS),
    placeTinted(chamferBox([1.09, 0.13, 3.65], 0.03), { pos: [0, 0.56, -0.45] }, [0.16, 0.38, 0.84]),
    placeTinted(chamferBox([1.09, 0.22, 2.95], 0.03), { pos: [0, 0.84, -0.82] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([0.92, 0.20, 4.35], 0.03), { pos: [0, 0.12, -0.20] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.52, 0.10, 0.86], 0.03), { pos: [0, 1.24, -0.78] }, COL_CHROME)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([0.14, 0.08, 0.16], 0.02), { pos: [sgn * 0.22, 0.38, 2.28], rot: [0.22, 0, 0] }, COL_HEADLIGHT),
      placeTinted(chamferBox([0.15, 0.10, 0.06], 0.02), { pos: [sgn * 0.34, 0.56, -2.43] }, COL_TAILLIGHT)
    );
  }
  return out;
}

function buildHoverCarParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const hull = superellipseLoft(
    [
      { z: -1.12, rx: 0.44, ry: 0.16, y: 0.30, superellipseN: 2.8 },
      { z: -0.45, rx: 0.54, ry: 0.22, y: 0.32, superellipseN: 3.2 },
      { z: 0.48, rx: 0.50, ry: 0.20, y: 0.30, superellipseN: 3.0 },
      { z: 1.18, rx: 0.28, ry: 0.10, y: 0.24, superellipseN: 2.3 }
    ],
    24,
    true,
    false
  );
  const canopy = superellipseLoft(
    [
      { z: -0.58, rx: 0.32, ry: 0.14, y: 0.48, superellipseN: 2.6 },
      { z: 0.04, rx: 0.36, ry: 0.20, y: 0.54, superellipseN: 2.6 },
      { z: 0.58, rx: 0.28, ry: 0.11, y: 0.44, superellipseN: 2.4 }
    ],
    22,
    true,
    false
  );
  out.push(tintRawMesh(hull, [0.30, 0.82, 0.92]), tintRawMesh(canopy, COL_CABIN_GLASS));

  // Four vectored lift-fan nacelles (`latheMesh`) + glowing cyan thrust cores + twin tail fins
  const shroudRing = latheMesh(
    [
      [0.13, -0.05],
      [0.21, -0.04],
      [0.22, 0.04],
      [0.14, 0.05],
      [0.13, -0.05]
    ],
    18,
    false
  );
  const fanCore = latheMesh(
    [
      [0, -0.02],
      [0.13, -0.02],
      [0.13, 0.02],
      [0, 0.02]
    ],
    16,
    false
  );
  for (const zz of [-0.66, 0.64]) {
    for (const sgn of [-1, 1] as const) {
      out.push(
        placeTinted(shroudRing, { pos: [sgn * 0.56, 0.22, zz] }, COL_CHROME),
        placeTinted(fanCore, { pos: [sgn * 0.56, 0.20, zz] }, [0.36, 0.98, 1.0])
      );
    }
  }
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([0.04, 0.24, 0.36], 0.012), { pos: [sgn * 0.38, 0.48, -0.88], rot: [0, 0, -sgn * 0.24] }, [0.96, 0.34, 0.68]),
      placeTinted(chamferBox([0.14, 0.05, 0.06], 0.015), { pos: [sgn * 0.22, 0.26, 1.16] }, COL_HEADLIGHT)
    );
  }
  return out;
}

function buildVehiclePartsForKind(kind: ProceduralVehicleKind): ColoredRawMesh[] {
  switch (kind) {
    case "car":
      return buildRoadCarParts({
        kind: "car",
        paint: [0.93, 0.27, 0.23],
        halfLen: 1.05,
        halfW: 0.48,
        beltY: 0.44,
        roofY: 0.72,
        cabinFrontZ: 0.38,
        cabinRearZ: -0.52,
        roofTaper: 0.88,
        wheelR: 0.18,
        wheelW: 0.12
      });
    case "hatch":
      return buildRoadCarParts({
        kind: "hatch",
        paint: [0.22, 0.62, 0.93],
        halfLen: 0.94,
        halfW: 0.47,
        beltY: 0.44,
        roofY: 0.74,
        cabinFrontZ: 0.34,
        cabinRearZ: -0.78,
        roofTaper: 0.90,
        wheelR: 0.175,
        wheelW: 0.12
      });
    case "suv":
      return buildRoadCarParts({
        kind: "suv",
        paint: [0.25, 0.66, 0.45],
        halfLen: 1.15,
        halfW: 0.52,
        beltY: 0.50,
        roofY: 0.86,
        cabinFrontZ: 0.42,
        cabinRearZ: -0.98,
        roofTaper: 0.93,
        wheelR: 0.21,
        wheelW: 0.14
      });
    case "taxi":
      return buildRoadCarParts({
        kind: "taxi",
        paint: [0.98, 0.78, 0.15],
        accent: [0.99, 0.82, 0.20],
        halfLen: 1.06,
        halfW: 0.48,
        beltY: 0.44,
        roofY: 0.73,
        cabinFrontZ: 0.38,
        cabinRearZ: -0.54,
        roofTaper: 0.88,
        wheelR: 0.18,
        wheelW: 0.12
      });
    case "van":
      return buildRoadCarParts({
        kind: "van",
        paint: [0.96, 0.93, 0.86],
        halfLen: 1.18,
        halfW: 0.52,
        beltY: 0.52,
        roofY: 0.92,
        cabinFrontZ: 0.86,
        cabinRearZ: -1.04,
        roofTaper: 0.95,
        wheelR: 0.19,
        wheelW: 0.13
      });
    case "pickup":
      return buildRoadCarParts({
        kind: "pickup",
        paint: [0.24, 0.48, 0.86],
        halfLen: 1.16,
        halfW: 0.51,
        beltY: 0.49,
        roofY: 0.82,
        cabinFrontZ: 0.46,
        cabinRearZ: -0.10,
        roofTaper: 0.90,
        wheelR: 0.205,
        wheelW: 0.14
      });
    case "truck":
      return buildBoxTruckParts();
    case "tram":
      return buildTramParts();
    case "train":
      return buildExpressTrainParts();
    case "hover":
      return buildHoverCarParts();
  }
}

const vehicleSpecCache = new Map<string, AuraCustomGeometrySpec>();

/**
 * Returns a smooth-normal, vertex-colored `AuraCustomGeometrySpec` fitted cleanly to
 * `{ targetMaxDimension }` along `+X`, grounded on `y = 0`, for hardware-instanced lane pools.
 */
export function buildProceduralVehicleSpec(
  kind: ProceduralVehicleKind,
  opts: VehiclePoolOptions
): AuraCustomGeometrySpec {
  const key = `${kind}:${opts.targetMaxDimension.toFixed(4)}`;
  const cached = vehicleSpecCache.get(key);
  if (cached) return cached;
  const spec = fitPartsToMoverEnvelope(buildVehiclePartsForKind(kind), opts.targetMaxDimension);
  vehicleSpecCache.set(key, spec);
  return spec;
}

/**
 * Builds a multi-lobe physical `geometry.multiMaterial` showcase vehicle node with
 * separate transparent `material.physical` (`castShadow: false`) wraparound glass.
 */
export function buildHeroVehicleMultiMaterialNode(
  kind: ProceduralVehicleKind,
  opts: VehiclePoolOptions & { readonly name?: string }
) {
  const hull = superellipseLoft(
    [
      { z: -1.0, rx: 0.44, ry: 0.16, y: 0.28, superellipseN: 3.2 },
      { z: 0, rx: 0.49, ry: 0.20, y: 0.30, superellipseN: 3.8 },
      { z: 1.0, rx: 0.42, ry: 0.15, y: 0.26, superellipseN: 3.0 }
    ],
    24,
    true,
    false
  );
  const wheels = wheelAssemblySlots({ radius: 0.18, width: 0.12, spokeCount: 5, tireMat: 2, rimMat: 3 });
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: transformMesh(hull, { rot: [0, Math.PI / 2, 0] }) },
    { materialIndex: 1, mesh: transformMesh(chamferBox([0.82, 0.10, 0.10], 0.025), { pos: [1.02, 0.20, 0], rot: [0, Math.PI / 2, 0] }) },
    { materialIndex: 4, mesh: transformMesh(chamferBox([0.56, 0.08, 0.05], 0.015), { pos: [1.01, 0.30, 0], rot: [0, Math.PI / 2, 0] }) },
    { materialIndex: 5, mesh: transformMesh(chamferBox([0.58, 0.08, 0.05], 0.015), { pos: [-1.01, 0.31, 0], rot: [0, Math.PI / 2, 0] }) }
  ];
  for (const ax of [-0.62, 0.62]) {
    for (const sd of [-1, 1] as const) {
      for (const w of wheels) {
        slots.push({
          materialIndex: w.materialIndex,
          mesh: transformMesh(w.mesh, { pos: [ax, 0.18, sd * 0.44], rot: [0, Math.PI / 2 + (sd < 0 ? Math.PI : 0), 0] })
        });
      }
    }
  }
  const scale = opts.targetMaxDimension / 2.12;
  const nodeName = opts.name ?? `hero-${kind}`;
  const bodyNode = assembleMultiMaterialNode(
    `${nodeName}-body`,
    slots.map((s) => ({ materialIndex: s.materialIndex, mesh: transformMesh(s.mesh, { scale }) })),
    [
      kind === "pickup" ? CROSS_HOP_PROCEDURAL_MATERIALS.cobaltCarPaint : CROSS_HOP_PROCEDURAL_MATERIALS.sedanClearcoat,
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.tireRubber,
      CROSS_HOP_PROCEDURAL_MATERIALS.forgedRimAlloy,
      CROSS_HOP_PROCEDURAL_MATERIALS.headlightLamp,
      CROSS_HOP_PROCEDURAL_MATERIALS.taillightLamp
    ],
    { castShadow: true, receiveShadow: true }
  );
  const cabinGlass = superellipseLoft(
    [
      { z: -0.52, rx: 0.39, ry: 0.14, y: 0.50, superellipseN: 3.0 },
      { z: 0, rx: 0.41, ry: 0.18, y: 0.54, superellipseN: 3.3 },
      { z: 0.42, rx: 0.38, ry: 0.13, y: 0.48, superellipseN: 2.9 }
    ],
    20,
    true,
    false
  );
  const glassNode = geometry.custom(mergeRawMeshes([transformMesh(cabinGlass, { rot: [0, Math.PI / 2, 0], scale })]), {
    name: `${nodeName}-glass`,
    material: CROSS_HOP_PROCEDURAL_MATERIALS.windshieldGlass,
    castShadow: false,
    receiveShadow: false
  });
  return group(nodeName, [bodyNode, glassNode]);
}

/**
 * Sculpted railroad crossing gate & flashing signal bell assembly (`tubeSweepMesh` post,
 * `extrudePolygonMesh` crossbuck blades, `latheMesh` brass bell, `lacquer` striped barrier arm).
 */
export function buildRailCrossingGateNode(name = "rail-crossing-signal") {
  const postSpine: V4[] = [
    [0, 0, 0, 0.09],
    [0, 0.12, 0, 0.065],
    [0, 1.08, 0, 0.052],
    [0, 1.18, 0, 0.038]
  ];
  const bladeRing: V2[] = [
    [-0.36, -0.055],
    [0.36, -0.055],
    [0.36, 0.055],
    [-0.36, 0.055]
  ];
  const bellMesh = latheMesh(
    [
      [0, 0.12],
      [0.05, 0.11],
      [0.085, 0.04],
      [0.105, -0.02],
      [0.08, -0.025],
      [0, -0.01]
    ],
    18,
    false
  );
  const spec = buildGroupedGeometrySpec([
    { materialIndex: 0, mesh: tubeSweepMesh(postSpine, 14, false) },
    { materialIndex: 1, mesh: transformMesh(extrudePolygonMesh(bladeRing, 0.025, 0.005, false), { pos: [0, 0.92, 0.06], rot: [0, 0, 0.62] }) },
    { materialIndex: 1, mesh: transformMesh(extrudePolygonMesh(bladeRing, 0.025, 0.005, false), { pos: [0, 0.92, 0.06], rot: [0, 0, -0.62] }) },
    { materialIndex: 2, mesh: transformMesh(bellMesh, { pos: [0, 1.20, 0] }) },
    { materialIndex: 3, mesh: transformMesh(chamferBox([0.13, 0.13, 0.10], 0.03), { pos: [-0.14, 0.74, 0.07] }) },
    { materialIndex: 3, mesh: transformMesh(chamferBox([0.13, 0.13, 0.10], 0.03), { pos: [0.14, 0.74, 0.07] }) },
    { materialIndex: 4, mesh: transformMesh(chamferBox([1.45, 0.065, 0.045], 0.012), { pos: [0.74, 0.58, 0.05] }) }
  ]);
  return geometry.multiMaterial(
    spec,
    [
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.porcelainSign,
      CROSS_HOP_PROCEDURAL_MATERIALS.forgedRimAlloy,
      CROSS_HOP_PROCEDURAL_MATERIALS.taillightLamp,
      CROSS_HOP_PROCEDURAL_MATERIALS.capsuleLacquer
    ],
    { name, castShadow: true, receiveShadow: true }
  );
}

/**
 * Stooping peregrine hawk (`name: "hawk"`, `~1.38 m` wingspan) assembled via `assembleMultiMaterialNode`.
 */
export function buildStoopingHawkNode() {
  const body = superellipseLoft(
    [
      { z: -0.44, rx: 0.05, ry: 0.04, y: 0.02, superellipseN: 2.2 },
      { z: -0.14, rx: 0.14, ry: 0.13, y: 0.0, superellipseN: 2.3 },
      { z: 0.18, rx: 0.16, ry: 0.15, y: 0.02, superellipseN: 2.3 },
      { z: 0.40, rx: 0.10, ry: 0.10, y: 0.06, superellipseN: 2.1 },
      { z: 0.50, rx: 0.03, ry: 0.03, y: 0.05, superellipseN: 2.0 }
    ],
    18,
    true,
    false
  );
  const breast = superellipseLoft(
    [
      { z: -0.10, rx: 0.11, ry: 0.09, y: -0.05, superellipseN: 2.2 },
      { z: 0.16, rx: 0.13, ry: 0.11, y: -0.04, superellipseN: 2.2 },
      { z: 0.34, rx: 0.07, ry: 0.06, y: 0.01, superellipseN: 2.0 }
    ],
    16,
    true,
    false
  );
  const wingRing: V2[] = [
    [0.08, 0.22],
    [0.44, 0.18],
    [0.69, -0.06],
    [0.58, -0.18],
    [0.34, -0.14],
    [0.08, -0.12]
  ];
  const rightWing = transformMesh(extrudePolygonMesh(wingRing, 0.036, 0.01, false), {
    pos: [0, 0.05, 0.04],
    rot: [-Math.PI / 2 + 0.14, 0, 0.18]
  });
  const leftWing = transformMesh(extrudePolygonMesh(wingRing, 0.036, 0.01, false), {
    pos: [0, 0.05, 0.04],
    rot: [-Math.PI / 2 + 0.14, 0, -0.18],
    scale: [-1, 1, 1]
  });
  const tailFan: V2[] = [
    [-0.06, 0],
    [0.06, 0],
    [0.20, -0.34],
    [0.0, -0.39],
    [-0.20, -0.34]
  ];
  const beak = transformMesh(
    latheMesh([[0, 0.13], [0.045, 0.03], [0.055, -0.03], [0, -0.03]], 12, false),
    { pos: [0, 0.03, 0.54], rot: [Math.PI * 0.62, 0, 0] }
  );
  return assembleMultiMaterialNode(
    "hawk",
    [
      { materialIndex: 0, mesh: body },
      { materialIndex: 0, mesh: rightWing },
      { materialIndex: 0, mesh: leftWing },
      { materialIndex: 0, mesh: transformMesh(extrudePolygonMesh(tailFan, 0.024, 0.006, false), { pos: [0, 0.03, -0.36], rot: [-Math.PI / 2 - 0.10, 0, 0] }) },
      { materialIndex: 1, mesh: breast },
      { materialIndex: 2, mesh: beak },
      { materialIndex: 2, mesh: transformMesh(chamferBox([0.05, 0.10, 0.08], 0.012), { pos: [-0.07, -0.15, 0.02], rot: [0.35, 0, 0] }) },
      { materialIndex: 2, mesh: transformMesh(chamferBox([0.05, 0.10, 0.08], 0.012), { pos: [0.07, -0.15, 0.02], rot: [0.35, 0, 0] }) },
      { materialIndex: 3, mesh: transformMesh(icosphereFacetMesh(0.024, 1, 0, 1), { pos: [-0.075, 0.085, 0.42] }) },
      { materialIndex: 3, mesh: transformMesh(icosphereFacetMesh(0.024, 1, 0, 2), { pos: [0.075, 0.085, 0.42] }) }
    ],
    [
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorPlumage,
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorBreast,
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorBeak,
      CROSS_HOP_PROCEDURAL_MATERIALS.rescueCoreGlow
    ],
    { castShadow: true, receiveShadow: false }
  );
}

function makeFivePointStarRing(outerR: number, innerR: number): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2;
    const r = i % 2 === 0 ? outerR : innerR;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

/**
 * Gacha rescue capsule (`name: "pod"`, `~1.12 m` tall grounded on `y = 0`) with lacquered base cup,
 * brushed-steel equatorial collar, glowing 5-point star core, and transparent `material.physical` dome.
 */
export function buildRescuePodNode() {
  const cup = latheMesh(
    [
      [0, 0.0],
      [0.24, 0.0],
      [0.39, 0.14],
      [0.44, 0.34],
      [0.45, 0.50],
      [0.37, 0.50],
      [0.33, 0.24],
      [0, 0.22]
    ],
    26,
    false
  );
  const collar = latheMesh(
    [
      [0.43, 0.46],
      [0.475, 0.48],
      [0.475, 0.54],
      [0.43, 0.56],
      [0.43, 0.46]
    ],
    26,
    false
  );
  const finial = latheMesh(
    [
      [0, 0.99],
      [0.10, 1.00],
      [0.11, 1.08],
      [0.05, 1.12],
      [0, 1.12]
    ],
    18,
    false
  );
  const starCore = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.21, 0.095), 0.08, 0.014, false), {
    pos: [0, 0.64, 0]
  });
  const podBase = assembleMultiMaterialNode(
    "pod-base",
    [
      { materialIndex: 0, mesh: cup },
      { materialIndex: 1, mesh: collar },
      { materialIndex: 1, mesh: finial },
      { materialIndex: 2, mesh: starCore }
    ],
    [
      CROSS_HOP_PROCEDURAL_MATERIALS.capsuleLacquer,
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.rescueCoreGlow
    ],
    { castShadow: true, receiveShadow: true }
  );
  const dome = latheMesh(
    [
      [0.44, 0.54],
      [0.43, 0.72],
      [0.34, 0.89],
      [0.18, 0.98],
      [0, 1.01]
    ],
    26,
    false
  );
  const podDome = geometry.custom(mergeRawMeshes([dome]), {
    name: "pod-dome-glass",
    material: CROSS_HOP_PROCEDURAL_MATERIALS.windshieldGlass,
    castShadow: false,
    receiveShadow: false
  });
  return group("pod", [podBase, podDome]);
}

// ---------------------------------------------------------------------------
// River, Lava, Coin & Meadow Instanced Geometries (unit-envelope normalized)
// ---------------------------------------------------------------------------

const propSpecCache = new Map<string, AuraCustomGeometrySpec>();

function cachedProp(key: string, build: () => AuraCustomGeometrySpec): AuraCustomGeometrySpec {
  const hit = propSpecCache.get(key);
  if (hit) return hit;
  const spec = build();
  propSpecCache.set(key, spec);
  return spec;
}

/** Bark-rippled hollow river log with recessed bore, branch knot stub & moss patches (`m-logs`). */
export function buildHollowRiverLogSpec(): AuraCustomGeometrySpec {
  return cachedProp("river-log", () => {
    const shell = latheMesh(
      [
        [0.30, -0.44],
        [0.32, -0.50],
        [0.49, -0.50],
        [0.50, -0.26],
        [0.475, -0.04],
        [0.50, 0.22],
        [0.49, 0.50],
        [0.32, 0.50],
        [0.30, 0.44],
        [0, 0.42],
        [0, -0.42],
        [0.30, -0.44]
      ],
      22,
      false
    );
    const knotSpine: V4[] = [
      [0.34, 0.08, 0.0, 0.11],
      [0.46, 0.15, 0.05, 0.085],
      [0.50, 0.19, 0.08, 0.05]
    ];
    return normalizePartsToUnitCube([
      tintRawMesh(shell, [0.98, 0.95, 0.90]),
      tintRawMesh(tubeSweepMesh(knotSpine, 10, false), [0.82, 0.75, 0.68]),
      placeTinted(chamferBox([0.16, 0.28, 0.12], 0.04), { pos: [-0.38, -0.14, 0.18] }, [0.76, 1.0, 0.72])
    ]);
  });
}

/** Concentric heartwood/sapwood end-grain ring disc (`m-log-ends`). */
export function buildLogEndGrainSpec(): AuraCustomGeometrySpec {
  return cachedProp("log-end", () => {
    const outer = latheMesh([[0.22, -0.5], [0.50, -0.5], [0.50, 0.5], [0.22, 0.5], [0.22, -0.5]], 20, false);
    const pith = latheMesh([[0, -0.44], [0.22, -0.44], [0.22, 0.44], [0, 0.44]], 16, false);
    return normalizePartsToUnitCube([
      tintRawMesh(outer, [1.0, 0.96, 0.88]),
      tintRawMesh(pith, [0.54, 0.40, 0.30])
    ]);
  });
}

/** Lashed bevelled timber raft module (`m-rafts`). */
export function buildTimberRaftSpec(): AuraCustomGeometrySpec {
  return cachedProp("timber-raft", () =>
    normalizePartsToUnitCube([
      tintRawMesh(chamferBox([1.0, 0.82, 0.96], 0.09), [0.98, 0.96, 0.92]),
      placeTinted(chamferBox([0.92, 1.0, 0.16], 0.03), { pos: [0, 0, -0.28] }, [0.88, 0.84, 0.76]),
      placeTinted(chamferBox([0.92, 1.0, 0.16], 0.03), { pos: [0, 0, 0.28] }, [0.88, 0.84, 0.76])
    ])
  );
}

/** Notched water-lily pad (`extrudePolygonMesh`) with radial veins & sculpted lotus bud (`m-pads`). */
export function buildNotchedLilyPadSpec(): AuraCustomGeometrySpec {
  return cachedProp("lily-pad", () => {
    const ring: V2[] = [[0.05, 0.0]];
    const steps = 26;
    for (let i = 0; i <= steps; i += 1) {
      const a = 0.24 + (i / steps) * (Math.PI * 2 - 0.48);
      const r = 0.48 + Math.sin(i * 1.9) * 0.015;
      ring.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const padBlade = transformMesh(extrudePolygonMesh(ring, 0.46, 0.06, false), { rot: [-Math.PI / 2, 0, 0] });
    const lotusBud = superellipseLoft(
      [
        { z: 0.08, rx: 0.08, ry: 0.08, y: 0, superellipseN: 2.2 },
        { z: 0.34, rx: 0.12, ry: 0.12, y: 0, superellipseN: 2.0 },
        { z: 0.50, rx: 0.03, ry: 0.03, y: 0, superellipseN: 2.0 }
      ],
      14,
      true,
      false
    );
    return normalizePartsToUnitCube([
      tintRawMesh(padBlade, [0.96, 1.0, 0.94]),
      placeTinted(lotusBud, { pos: [-0.08, 0.10, 0.06], rot: [-Math.PI / 2, 0, 0] }, [1.0, 0.94, 0.96])
    ]);
  });
}

/** Faceted mossy stepping boulder with flat playable top (`m-stones`). */
export function buildMossySteppingBoulderSpec(): AuraCustomGeometrySpec {
  return cachedProp("stepping-boulder", () => {
    const raw = icosphereFacetMesh(0.52, 2, 0.16, 41);
    const clampedPos = raw.positions.slice();
    for (let i = 0; i < clampedPos.length; i += 3) {
      if (clampedPos[i + 1]! > 0.28) clampedPos[i + 1] = 0.28 + (clampedPos[i + 1]! - 0.28) * 0.12;
      if (clampedPos[i + 1]! < -0.32) clampedPos[i + 1] = -0.32;
    }
    const cap = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.36, 0.33), 0.10, 0.02, false), {
      pos: [0, 0.27, 0],
      rot: [-Math.PI / 2, 0, 0]
    });
    return normalizePartsToUnitCube([
      tintRawMesh({ ...raw, positions: clampedPos }, [0.88, 0.90, 0.94]),
      tintRawMesh(cap, [0.98, 1.0, 0.96])
    ]);
  });
}

/** Root-flared woodland tree trunk (`d-trunks`). */
export function buildWoodlandTrunkSpec(): AuraCustomGeometrySpec {
  return cachedProp("woodland-trunk", () =>
    normalizePartsToUnitCube([
      tintRawMesh(
        latheMesh([[0, -0.5], [0.50, -0.5], [0.39, -0.26], [0.35, 0.18], [0.32, 0.5], [0, 0.5]], 14, false),
        [0.98, 0.95, 0.90]
      )
    ])
  );
}

/** Tiered woodland pine & oak foliage cluster (`d-canopy`). */
export function buildWoodlandCanopySpec(): AuraCustomGeometrySpec {
  return cachedProp("woodland-canopy", () =>
    normalizePartsToUnitCube([
      tintRawMesh(layeredCanopyMesh({ radius: 0.50, height: 0.86, puffs: 8, seed: 19 }), [0.98, 1.0, 0.95]),
      placeTinted(coniferBoughTierMesh({ baseRadius: 0.46, height: 0.56, tiers: 5, seed: 31 }), { pos: [0, 0.18, 0] }, [1.0, 1.0, 0.94])
    ])
  );
}

/** Stepped architectural verge pilaster/gable block (`d-b`). */
export function buildVergeArchitectureSpec(): AuraCustomGeometrySpec {
  return cachedProp("verge-arch", () =>
    normalizePartsToUnitCube([
      placeTinted(chamferBox([1.0, 0.14, 1.0], 0.025), { pos: [0, -0.43, 0] }, [0.86, 0.87, 0.90]),
      placeTinted(chamferBox([0.92, 0.74, 0.92], 0.035), { pos: [0, 0.0, 0] }, [0.98, 0.98, 1.0]),
      placeTinted(chamferBox([0.98, 0.14, 0.98], 0.03), { pos: [0, 0.43, 0] }, [0.92, 0.93, 0.96])
    ])
  );
}

/** Terraced mountain & urban skyline ridge (`horizon-ridge`). */
export function buildHorizonRidgeSpec(): AuraCustomGeometrySpec {
  return cachedProp("horizon-ridge", () =>
    normalizePartsToUnitCube([
      tintRawMesh(stratifiedCliffMesh({ radiusX: 0.5, radiusZ: 0.5, height: 1.0, terraces: 5, seed: 29 }), [0.96, 0.97, 1.0])
    ])
  );
}

/** Upright star-embossed golden coin grounded on `y = 0` (`m-coins` phase-4 view). */
export function buildStarCoinStandingSpec(diameter: number): AuraCustomGeometrySpec {
  return cachedProp(`coin-standing:${diameter.toFixed(4)}`, () => {
    const r = diameter * 0.5;
    const halfT = diameter * 0.13;
    const rim = transformMesh(
      latheMesh([[0, -halfT], [r * 0.88, -halfT], [r, -halfT * 0.72], [r, halfT * 0.72], [r * 0.88, halfT], [0, halfT]], 24, false),
      { pos: [0, r, 0], rot: [Math.PI / 2, 0, 0] }
    );
    const star = extrudePolygonMesh(makeFivePointStarRing(r * 0.54, r * 0.24), halfT * 2.32, 0.008, false);
    return mergeColoredMeshesToSpec([
      tintRawMesh(rim, [1.0, 0.86, 0.24]),
      placeTinted(star, { pos: [0, r, 0] }, [1.0, 0.95, 0.58])
    ]);
  });
}

/** Unit `Y`-axis star-embossed coin (`[-0.5..+0.5]^3`, rotated upright by `rz = Math.PI / 2` in diorama/original). */
export function buildStarCoinUnitSpec(): AuraCustomGeometrySpec {
  return cachedProp("coin-unit", () => {
    const rim = latheMesh([[0, -0.38], [0.45, -0.38], [0.50, -0.26], [0.50, 0.26], [0.45, 0.38], [0, 0.38]], 24, false);
    const star = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.28, 0.125), 0.96, 0.02, false), {
      rot: [-Math.PI / 2, 0, 0]
    });
    return normalizePartsToUnitCube([
      tintRawMesh(rim, [1.0, 0.92, 0.62]),
      tintRawMesh(star, [1.0, 0.98, 0.82])
    ]);
  });
}
