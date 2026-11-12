/**
 * Cross Hop (WP-13) — Bespoke Multi-Material Procedural Fleet, River & Woodland Kit.
 *
 * Replaces all static Meshy vehicle, train, river-log, coin, rescue-pod, and hawk GLBs
 * while keeping all 12 rigged critter hoppers intact. Sculpted exclusively through the
 * shared `@aura3d/engine` + `showcase-port-shared/proceduralKernel` smooth-normal
 * primitives (`loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`,
 * `wheelAssemblySlots`, `icosphereSmoothMesh`, `icosphereFacetMesh`, `layeredCanopyMesh`,
 * `bevelBoxMesh`, `assembleMultiMaterialNode`).
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
  extrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
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
  windshieldGlass: material.studioGlass({
    color: "#14263c",
    tint: "#1e3a5c",
    roughness: 0.04,
    opacity: 0.84,
    ior: 1.52
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
    roughness: 0.22,
    metalness: 0.16,
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

const COL_TIRE: Rgb = [0.13, 0.14, 0.17];
const COL_RIM: Rgb = [0.89, 0.92, 0.97];
const COL_CHROME: Rgb = [0.84, 0.88, 0.94];
const COL_TRIM_DARK: Rgb = [0.16, 0.18, 0.22];
const COL_WELL_LINER: Rgb = [0.08, 0.09, 0.12];
const COL_GRILLE: Rgb = [0.11, 0.13, 0.16];
const COL_CABIN_GLASS: Rgb = [0.09, 0.16, 0.26];
const COL_HEADLIGHT: Rgb = [1.0, 0.96, 0.82];
const COL_TURN_AMBER: Rgb = [1.0, 0.66, 0.16];
const COL_TAILLIGHT: Rgb = [0.96, 0.16, 0.22];

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

/** Extrudes a `(z, y)` side-view silhouette across `X` (`widthX`) in `+Z`-forward vehicle coordinates. */
function extrudeSideSilhouette(
  profileZY: readonly V2[],
  widthX: number,
  bevel = 0.014,
  offsetX = 0
): RawMesh {
  return transformMesh(extrudePolygonMesh(profileZY, widthX, bevel, false), {
    rot: [0, -Math.PI / 2, 0],
    pos: [offsetX, 0, 0]
  });
}

/** Traces a recessed semicircular wheel-arch cutout along `+Z` from `sillY` up over the tire and back to `sillY`. */
function wheelArchCutoutPoints(axleZ: number, wheelR: number, archR: number, sillY: number, steps = 7): V2[] {
  const dy = Math.max(-archR * 0.92, Math.min(archR * 0.4, sillY - wheelR));
  const aSpan = Math.asin(dy / archR);
  const aStart = Math.PI - aSpan;
  const aEnd = aSpan;
  const pts: V2[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = aStart + ((aEnd - aStart) * i) / steps;
    pts.push([axleZ + Math.cos(a) * archR, wheelR + Math.sin(a) * archR]);
  }
  return pts;
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
  readonly kind: "car" | "hatch" | "suv" | "taxi" | "van";
}

function buildRoadCarParts(r: RoadCarRecipe): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const L = r.halfLen;
  const W = r.halfW;
  const sillY = r.wheelR * 0.62;
  const axleZ = L * 0.60;
  const archR = r.wheelR * 1.22;
  const fenderW = Math.min(W * 0.42, r.wheelW * 1.42);
  const coreHalfW = Math.max(0.16, W - fenderW + 0.02);
  const noseY = sillY + (r.beltY - sillY) * 0.68;
  const tailY = r.kind === "van" || r.kind === "suv" ? r.beltY : r.beltY - 0.03;

  // Sculpted left & right fender flanks with 4 genuine semicircular recessed wheel wells (`extrudePolygonMesh`)
  const sideFlankProfile: V2[] = [
    [-L, sillY + 0.04],
    [-L + 0.07, sillY],
    ...wheelArchCutoutPoints(-axleZ, r.wheelR, archR, sillY, 7),
    ...wheelArchCutoutPoints(axleZ, r.wheelR, archR, sillY, 7),
    [L - 0.07, sillY],
    [L, sillY + 0.03],
    [L - 0.03, noseY],
    [r.cabinFrontZ + 0.04, r.beltY],
    [r.cabinRearZ - 0.04, r.beltY + 0.015],
    [-L + 0.04, tailY]
  ];
  for (const sgn of [-1, 1] as const) {
    out.push(tintRawMesh(extrudeSideSilhouette(sideFlankProfile, fenderW, 0.018, sgn * (W - fenderW * 0.5)), r.paint));
  }

  // Central chassis pan + dark inner wheel-well liners + crowned `loftSectionsMesh` hood/beltline/trunk deck
  out.push(placeTinted(chamferBox([coreHalfW * 2, r.beltY - sillY, L * 1.94], 0.02), { pos: [0, (sillY + r.beltY) * 0.5, 0] }, COL_WELL_LINER));
  const centerDeck = superellipseLoft(
    [
      { z: -L * 0.97, rx: coreHalfW * 1.02, ry: (tailY - sillY) * 0.48, y: (sillY + tailY) * 0.52, superellipseN: 3.4 },
      { z: r.cabinRearZ, rx: W * 0.94, ry: (r.beltY - sillY) * 0.50, y: (sillY + r.beltY) * 0.53, superellipseN: 3.8 },
      { z: r.cabinFrontZ, rx: W * 0.94, ry: (r.beltY - sillY) * 0.50, y: (sillY + r.beltY) * 0.52, superellipseN: 3.8 },
      { z: L * 0.97, rx: coreHalfW * 1.02, ry: (noseY - sillY) * 0.48, y: (sillY + noseY) * 0.51, superellipseN: 3.2 }
    ],
    22,
    true,
    false
  );
  out.push(tintRawMesh(centerDeck, r.paint));

  // Sculpted painted greenhouse shell (`loftSectionsMesh` with crowned roof & tumblehome — no flat roof slab)
  const cabSpan = r.cabinFrontZ - r.cabinRearZ;
  const frontRoofZ = r.cabinFrontZ - cabSpan * (r.kind === "van" ? 0.22 : 0.28);
  const rearRoofZ = r.cabinRearZ + cabSpan * (r.kind === "suv" || r.kind === "van" ? 0.14 : r.kind === "hatch" ? 0.20 : 0.26);
  const cabH = r.roofY - r.beltY;
  const roofHalfW = W * 0.80 * r.roofTaper;
  const greenhouse = loftSectionsMesh(
    [
      [[-W * 0.86, r.beltY - 0.01, r.cabinRearZ], [W * 0.86, r.beltY - 0.01, r.cabinRearZ], [roofHalfW, r.roofY - 0.02, rearRoofZ], [0, r.roofY + 0.018, rearRoofZ], [-roofHalfW, r.roofY - 0.02, rearRoofZ]],
      [[-W * 0.87, r.beltY - 0.01, (r.cabinFrontZ + r.cabinRearZ) * 0.5], [W * 0.87, r.beltY - 0.01, (r.cabinFrontZ + r.cabinRearZ) * 0.5], [roofHalfW, r.roofY - 0.01, (frontRoofZ + rearRoofZ) * 0.5], [0, r.roofY + 0.026, (frontRoofZ + rearRoofZ) * 0.5], [-roofHalfW, r.roofY - 0.01, (frontRoofZ + rearRoofZ) * 0.5]],
      [[-W * 0.85, r.beltY - 0.01, r.cabinFrontZ], [W * 0.85, r.beltY - 0.01, r.cabinFrontZ], [roofHalfW, r.roofY - 0.02, frontRoofZ], [0, r.roofY + 0.016, frontRoofZ], [-roofHalfW, r.roofY - 0.02, frontRoofZ]]
    ],
    true,
    false
  );
  out.push(tintRawMesh(greenhouse, r.accent ?? r.paint));

  // Sloped dark smoked windshield, rear backlight & framed side windows with B-pillar
  const wsDz = r.cabinFrontZ - frontRoofZ;
  const wsLen = Math.hypot(wsDz, cabH) * 0.86;
  const wsRake = Math.atan2(wsDz, cabH);
  const blDz = rearRoofZ - r.cabinRearZ;
  const blLen = Math.hypot(blDz, cabH) * 0.84;
  const blRake = -Math.atan2(blDz, cabH);
  out.push(
    placeTinted(chamferBox([roofHalfW * 1.72, wsLen, 0.028], 0.008), { pos: [0, r.beltY + cabH * 0.50, (r.cabinFrontZ + frontRoofZ) * 0.5 + 0.014], rot: [-wsRake, 0, 0] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([roofHalfW * 1.68, blLen, 0.028], 0.008), { pos: [0, r.beltY + cabH * 0.50, (r.cabinRearZ + rearRoofZ) * 0.5 - 0.014], rot: [-blRake, 0, 0] }, COL_CABIN_GLASS)
  );
  const sideWinProfile: V2[] = [
    [r.cabinRearZ + 0.06, r.beltY + 0.03],
    [r.cabinFrontZ - 0.07, r.beltY + 0.03],
    [frontRoofZ - 0.02, r.roofY - 0.045],
    [rearRoofZ + 0.03, r.roofY - 0.045]
  ];
  const sideGlassSpanW = W * 1.73;
  out.push(
    tintRawMesh(extrudeSideSilhouette(sideWinProfile, sideGlassSpanW, 0.006, 0), COL_CABIN_GLASS),
    placeTinted(chamferBox([sideGlassSpanW + 0.012, cabH * 0.78, 0.048], 0.008), { pos: [0, r.beltY + cabH * 0.46, (frontRoofZ + rearRoofZ) * 0.5 + 0.02] }, COL_TRIM_DARK)
  );

  // Slatted front grille, sculpted front/rear bumpers, projector headlights, ruby taillights & wing mirrors
  const midY = (sillY + noseY) * 0.52;
  out.push(
    placeTinted(chamferBox([W * 1.86, 0.095, 0.11], 0.028), { pos: [0, sillY + 0.03, L + 0.02] }, r.kind === "suv" ? COL_TRIM_DARK : COL_CHROME),
    placeTinted(chamferBox([W * 1.88, 0.10, 0.11], 0.028), { pos: [0, sillY + 0.035, -L - 0.02] }, r.kind === "suv" ? COL_TRIM_DARK : COL_CHROME),
    placeTinted(chamferBox([W * 0.96, (noseY - sillY) * 0.58, 0.045], 0.012), { pos: [0, midY, L + 0.008] }, COL_GRILLE),
    placeTinted(chamferBox([W * 0.88, 0.024, 0.052], 0.006), { pos: [0, midY + 0.02, L + 0.012] }, COL_CHROME)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([W * 0.30, 0.085, 0.055], 0.018), { pos: [sgn * W * 0.65, midY + 0.035, L + 0.008] }, COL_HEADLIGHT),
      placeTinted(chamferBox([W * 0.10, 0.075, 0.055], 0.012), { pos: [sgn * W * 0.84, midY + 0.03, L - 0.004] }, COL_TURN_AMBER),
      placeTinted(chamferBox([W * 0.36, 0.09, 0.055], 0.018), { pos: [sgn * W * 0.62, tailY - 0.08, -L - 0.008] }, COL_TAILLIGHT),
      placeTinted(chamferBox([0.05, 0.03, 0.04], 0.008), { pos: [sgn * (W * 0.87), r.beltY + 0.035, r.cabinFrontZ - 0.15] }, COL_TRIM_DARK),
      placeTinted(chamferBox([0.095, 0.062, 0.09], 0.02), { pos: [sgn * (W + 0.035), r.beltY + 0.055, r.cabinFrontZ - 0.17] }, r.paint)
    );
  }

  // Class-specific sculpted details (zero surfboards or stacked boxes)
  if (r.kind === "suv") {
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.036, 0.038, (frontRoofZ - rearRoofZ) * 0.88], 0.01), { pos: [sgn * roofHalfW * 0.84, r.roofY + 0.022, (frontRoofZ + rearRoofZ) * 0.5] }, COL_CHROME));
    }
    const spare = wheelAssemblySlots({ radius: r.wheelR * 0.78, width: r.wheelW * 0.82, spokeCount: 5, tireMat: 0, rimMat: 1 });
    for (const sl of spare) {
      out.push(placeTinted(sl.mesh, { pos: [0, tailY - 0.02, -L - 0.055], rot: [0, Math.PI / 2, 0] }, sl.materialIndex === 0 ? COL_TIRE : COL_RIM));
    }
  } else if (r.kind === "taxi") {
    const taxiDome = superellipseLoft(
      [
        { z: (frontRoofZ + rearRoofZ) * 0.5 - 0.09, rx: 0.17, ry: 0.045, y: r.roofY + 0.048, superellipseN: 2.8 },
        { z: (frontRoofZ + rearRoofZ) * 0.5 + 0.09, rx: 0.15, ry: 0.042, y: r.roofY + 0.045, superellipseN: 2.6 }
      ],
      16,
      true,
      false
    );
    out.push(tintRawMesh(taxiDome, [1.0, 0.88, 0.24]));
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.022, 0.048, L * 0.92], 0.006), { pos: [sgn * (W + 0.004), r.beltY - 0.05, 0] }, COL_TRIM_DARK));
    }
  } else if (r.kind === "van") {
    for (const sgn of [-1, 1] as const) {
      out.push(placeTinted(chamferBox([0.022, 0.028, L * 0.88], 0.006), { pos: [sgn * (W + 0.004), r.beltY - 0.04, -0.14] }, COL_TRIM_DARK));
    }
  }

  appendWheelSet(out, [-axleZ, axleZ], W - r.wheelW * 0.52, r.wheelR, r.wheelW);
  return out;
}

function buildPickupTruckParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const paint: Rgb = [0.20, 0.48, 0.88];
  const L = 1.18;
  const W = 0.51;
  const wheelR = 0.205;
  const wheelW = 0.14;
  const sillY = wheelR * 0.62;
  const beltY = 0.51;
  const bedTopY = 0.49;
  const bedFloorY = sillY + 0.08;
  const roofY = 0.84;
  const frontAxleZ = 0.70;
  const rearAxleZ = -0.68;
  const archR = wheelR * 1.22;
  const fenderW = wheelW * 1.32;
  const innerBedHalfW = W - fenderW;

  // Sculpted left & right pickup flanks with front + rear recessed wheel arches & stepped open bed profile
  const sideFlank: V2[] = [
    [-L, sillY + 0.04],
    [-L + 0.07, sillY],
    ...wheelArchCutoutPoints(rearAxleZ, wheelR, archR, sillY, 7),
    ...wheelArchCutoutPoints(frontAxleZ, wheelR, archR, sillY, 7),
    [L - 0.06, sillY],
    [L, sillY + 0.04],
    [L - 0.03, 0.42],
    [0.48, beltY],
    [-0.05, beltY],
    [-0.08, bedTopY],
    [-L + 0.03, bedTopY]
  ];
  for (const sgn of [-1, 1] as const) {
    out.push(
      tintRawMesh(extrudeSideSilhouette(sideFlank, fenderW, 0.016, sgn * (W - fenderW * 0.5)), paint),
      // Brushed-alloy top bed side rails along the open cargo box
      placeTinted(chamferBox([0.046, 0.032, 1.06], 0.008), { pos: [sgn * (W - 0.048), bedTopY + 0.016, -0.61] }, COL_CHROME),
      // Dark inner bedside liner walls
      placeTinted(chamferBox([0.024, bedTopY - bedFloorY, 1.04], 0.005), { pos: [sgn * (innerBedHalfW - 0.01), (bedTopY + bedFloorY) * 0.5, -0.61] }, COL_TRIM_DARK)
    );
  }

  // Forward chassis core + crowned hood (`loftSectionsMesh`)
  out.push(
    placeTinted(chamferBox([innerBedHalfW * 2, beltY - sillY, 1.18], 0.018), { pos: [0, (sillY + beltY) * 0.5, 0.54] }, COL_WELL_LINER),
    // Recessed open cargo bed floor + dark bedliner ribs + cab bulkhead + rear tailgate
    placeTinted(chamferBox([innerBedHalfW * 2 + 0.04, 0.08, 1.08], 0.012), { pos: [0, bedFloorY - 0.02, -0.61] }, COL_TRIM_DARK),
    placeTinted(chamferBox([innerBedHalfW * 2 + 0.04, bedTopY - bedFloorY, 0.05], 0.01), { pos: [0, (bedTopY + bedFloorY) * 0.5, -0.07] }, COL_TRIM_DARK),
    placeTinted(chamferBox([W * 1.92, bedTopY - sillY - 0.02, 0.065], 0.015), { pos: [0, (sillY + bedTopY) * 0.5 + 0.01, -L + 0.035] }, paint),
    placeTinted(chamferBox([0.28, 0.045, 0.025], 0.006), { pos: [0, bedTopY - 0.07, -L - 0.002] }, COL_TRIM_DARK)
  );
  for (let rx = -0.22; rx <= 0.23; rx += 0.11) {
    out.push(placeTinted(chamferBox([0.035, 0.018, 0.98], 0.004), { pos: [rx, bedFloorY + 0.025, -0.61] }, [0.22, 0.25, 0.30]));
  }
  const hood = superellipseLoft(
    [
      { z: 0.42, rx: W * 0.94, ry: (beltY - sillY) * 0.48, y: (sillY + beltY) * 0.54, superellipseN: 3.8 },
      { z: 0.88, rx: W * 0.92, ry: (beltY - sillY) * 0.46, y: (sillY + beltY) * 0.52, superellipseN: 3.6 },
      { z: L * 0.97, rx: innerBedHalfW * 1.05, ry: (0.43 - sillY) * 0.46, y: (sillY + 0.43) * 0.52, superellipseN: 3.2 }
    ],
    20,
    true,
    false
  );
  out.push(tintRawMesh(hood, paint));

  // Sculpted forward pickup cab (`loftSectionsMesh`) + sloped dark windshield, rear cab window & door glass
  const cabFrontZ = 0.48;
  const cabRearZ = -0.05;
  const frontRoofZ = 0.28;
  const rearRoofZ = -0.02;
  const cabH = roofY - beltY;
  const roofHalfW = W * 0.78;
  const cabShell = loftSectionsMesh(
    [
      [[-W * 0.86, beltY - 0.01, cabRearZ], [W * 0.86, beltY - 0.01, cabRearZ], [roofHalfW, roofY - 0.015, rearRoofZ], [0, roofY + 0.022, rearRoofZ], [-roofHalfW, roofY - 0.015, rearRoofZ]],
      [[-W * 0.87, beltY - 0.01, 0.16], [W * 0.87, beltY - 0.01, 0.16], [roofHalfW, roofY - 0.01, 0.13], [0, roofY + 0.026, 0.13], [-roofHalfW, roofY - 0.01, 0.13]],
      [[-W * 0.85, beltY - 0.01, cabFrontZ], [W * 0.85, beltY - 0.01, cabFrontZ], [roofHalfW, roofY - 0.015, frontRoofZ], [0, roofY + 0.018, frontRoofZ], [-roofHalfW, roofY - 0.015, frontRoofZ]]
    ],
    true,
    false
  );
  const wsRake = Math.atan2(cabFrontZ - frontRoofZ, cabH);
  const sideDoorGlass: V2[] = [
    [cabRearZ + 0.05, beltY + 0.03],
    [cabFrontZ - 0.06, beltY + 0.03],
    [frontRoofZ - 0.02, roofY - 0.045],
    [rearRoofZ + 0.03, roofY - 0.045]
  ];
  out.push(
    tintRawMesh(cabShell, paint),
    placeTinted(chamferBox([roofHalfW * 1.72, Math.hypot(cabFrontZ - frontRoofZ, cabH) * 0.86, 0.028], 0.008), { pos: [0, beltY + cabH * 0.50, (cabFrontZ + frontRoofZ) * 0.5 + 0.014], rot: [-wsRake, 0, 0] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([roofHalfW * 1.64, cabH * 0.72, 0.026], 0.008), { pos: [0, beltY + cabH * 0.52, cabRearZ - 0.008] }, COL_CABIN_GLASS),
    tintRawMesh(extrudeSideSilhouette(sideDoorGlass, W * 1.73, 0.006, 0), COL_CABIN_GLASS),
    // Bold truck grille, chrome front & rear step bumpers
    placeTinted(chamferBox([W * 1.90, 0.11, 0.12], 0.028), { pos: [0, sillY + 0.03, L + 0.02] }, COL_CHROME),
    placeTinted(chamferBox([W * 1.90, 0.11, 0.13], 0.028), { pos: [0, sillY + 0.03, -L - 0.02] }, COL_CHROME),
    placeTinted(chamferBox([W * 1.08, 0.19, 0.05], 0.012), { pos: [0, 0.33, L + 0.01] }, COL_GRILLE),
    placeTinted(chamferBox([W * 1.02, 0.032, 0.058], 0.008), { pos: [0, 0.33, L + 0.016] }, COL_CHROME)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([0.16, 0.10, 0.055], 0.016), { pos: [sgn * W * 0.68, 0.35, L + 0.008] }, COL_HEADLIGHT),
      placeTinted(chamferBox([0.06, 0.09, 0.055], 0.01), { pos: [sgn * W * 0.86, 0.35, L - 0.004] }, COL_TURN_AMBER),
      placeTinted(chamferBox([0.09, 0.18, 0.055], 0.014), { pos: [sgn * (W - 0.06), 0.36, -L - 0.006] }, COL_TAILLIGHT),
      placeTinted(chamferBox([0.10, 0.075, 0.09], 0.018), { pos: [sgn * (W + 0.045), beltY + 0.07, cabFrontZ - 0.14] }, COL_TRIM_DARK)
    );
  }
  appendWheelSet(out, [rearAxleZ, frontAxleZ], W - wheelW * 0.52, wheelR, wheelW);
  return out;
}

function buildBoxTruckParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const wheelR = 0.235;
  const wheelW = 0.155;
  const sillY = 0.17;
  const frontAxleZ = 1.08;
  const rearAxleZ = -0.86;
  const cabPaint: Rgb = [0.96, 0.97, 0.99];
  const boxPaint: Rgb = [0.98, 0.99, 1.0];

  // Heavy steel chassis frame rails + underbody fuel/air tanks
  out.push(
    placeTinted(chamferBox([0.72, 0.13, 3.04], 0.022), { pos: [0, 0.23, -0.02] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.88, 0.14, 0.52], 0.03), { pos: [0, 0.24, 0.18] }, [0.24, 0.27, 0.32])
  );

  // Forward cab-over tractor (`z = 0.56..1.62`): sculpted wheel-arch lower fenders + `loftSectionsMesh` cab
  const cabFenderProfile: V2[] = [
    [0.56, sillY],
    ...wheelArchCutoutPoints(frontAxleZ, wheelR, wheelR * 1.22, sillY, 7),
    [1.56, sillY],
    [1.62, 0.24],
    [1.60, 0.56],
    [0.56, 0.56]
  ];
  for (const sgn of [-1, 1] as const) {
    out.push(tintRawMesh(extrudeSideSilhouette(cabFenderProfile, 0.20, 0.016, sgn * 0.40), cabPaint));
  }
  out.push(placeTinted(chamferBox([0.62, 0.38, 1.02], 0.02), { pos: [0, 0.36, 1.08] }, COL_WELL_LINER));

  const cabUpper = loftSectionsMesh(
    [
      [[-0.49, 0.54, 0.56], [0.49, 0.54, 0.56], [0.46, 1.06, 0.60], [0, 1.09, 0.60], [-0.46, 1.06, 0.60]],
      [[-0.49, 0.54, 1.16], [0.49, 0.54, 1.16], [0.45, 1.05, 1.14], [0, 1.08, 1.14], [-0.45, 1.05, 1.14]],
      [[-0.47, 0.52, 1.60], [0.47, 0.52, 1.60], [0.43, 0.99, 1.44], [0, 1.01, 1.44], [-0.43, 0.99, 1.44]]
    ],
    true,
    false
  );
  const cabDoorWin: V2[] = [
    [0.68, 0.61],
    [1.46, 0.58],
    [1.36, 0.95],
    [0.68, 0.97]
  ];
  out.push(
    tintRawMesh(cabUpper, cabPaint),
    // Sloped dark smoked panoramic windshield + framed cab door windows
    placeTinted(chamferBox([0.82, 0.42, 0.032], 0.008), { pos: [0, 0.79, 1.525], rot: [-0.32, 0, 0] }, COL_CABIN_GLASS),
    tintRawMesh(extrudeSideSilhouette(cabDoorWin, 0.99, 0.006, 0), COL_CABIN_GLASS),
    // Integrated sculpted roof wind deflector (`loftSectionsMesh` wedge, smoothly blending cab to cargo box)
    tintRawMesh(
      loftSectionsMesh(
        [
          [[-0.44, 1.06, 0.58], [0.44, 1.06, 0.58], [0.42, 1.27, 0.56], [-0.42, 1.27, 0.56]],
          [[-0.40, 1.05, 1.10], [0.40, 1.05, 1.10], [0.38, 1.08, 1.08], [-0.38, 1.08, 1.08]]
        ],
        true,
        false
      ),
      cabPaint
    ),
    // Front chrome bumper & slatted dark radiator grille
    placeTinted(chamferBox([1.00, 0.13, 0.12], 0.028), { pos: [0, 0.22, 1.63] }, COL_CHROME),
    placeTinted(chamferBox([0.66, 0.21, 0.045], 0.012), { pos: [0, 0.41, 1.61] }, COL_GRILLE),
    placeTinted(chamferBox([0.62, 0.028, 0.052], 0.006), { pos: [0, 0.42, 1.616] }, COL_CHROME)
  );

  // Chamfered insulated cargo box (`z = -1.62..0.46`) + aluminum corner trim + rear roll-up shutter door
  const rearGuardProfile: V2[] = [
    [-1.34, sillY],
    ...wheelArchCutoutPoints(rearAxleZ, wheelR, wheelR * 1.24, sillY, 7),
    [-0.38, sillY],
    [-0.38, 0.30],
    [-1.34, 0.30]
  ];
  out.push(
    placeTinted(chamferBox([1.08, 1.06, 2.08], 0.05), { pos: [0, 0.81, -0.58] }, boxPaint),
    placeTinted(chamferBox([1.10, 0.055, 2.10], 0.014), { pos: [0, 1.32, -0.58] }, COL_CHROME),
    placeTinted(chamferBox([1.10, 0.06, 2.10], 0.014), { pos: [0, 0.31, -0.58] }, COL_CHROME),
    // Rear roll-up door panel + horizontal shutter slat grooves + rear underride bumper
    placeTinted(chamferBox([0.92, 0.88, 0.036], 0.012), { pos: [0, 0.81, -1.615] }, [0.88, 0.91, 0.95]),
    placeTinted(chamferBox([1.02, 0.11, 0.10], 0.022), { pos: [0, 0.22, -1.62] }, COL_CHROME)
  );
  for (let sy = 0.48; sy <= 1.14; sy += 0.16) {
    out.push(placeTinted(chamferBox([0.86, 0.018, 0.042], 0.004), { pos: [0, sy, -1.622] }, COL_TRIM_DARK));
  }
  for (const sgn of [-1, 1] as const) {
    const mirrorBracket: V4[] = [
      [sgn * 0.48, 0.90, 1.40, 0.014],
      [sgn * 0.56, 0.88, 1.42, 0.014],
      [sgn * 0.56, 0.66, 1.42, 0.014],
      [sgn * 0.48, 0.64, 1.40, 0.014]
    ];
    out.push(
      tintRawMesh(extrudeSideSilhouette(rearGuardProfile, 0.20, 0.012, sgn * 0.44), COL_TRIM_DARK),
      placeTinted(chamferBox([0.045, 1.04, 0.05], 0.01), { pos: [sgn * 0.525, 0.81, 0.44] }, COL_CHROME),
      placeTinted(chamferBox([0.045, 1.04, 0.05], 0.01), { pos: [sgn * 0.525, 0.81, -1.60] }, COL_CHROME),
      tintRawMesh(tubeSweepMesh(mirrorBracket, 8, false), COL_CHROME),
      placeTinted(chamferBox([0.035, 0.18, 0.075], 0.01), { pos: [sgn * 0.565, 0.77, 1.42] }, COL_TRIM_DARK),
      placeTinted(chamferBox([0.17, 0.10, 0.055], 0.016), { pos: [sgn * 0.35, 0.39, 1.615] }, COL_HEADLIGHT),
      placeTinted(chamferBox([0.06, 0.09, 0.055], 0.01), { pos: [sgn * 0.45, 0.39, 1.60] }, COL_TURN_AMBER),
      placeTinted(chamferBox([0.20, 0.095, 0.055], 0.016), { pos: [sgn * 0.36, 0.23, -1.63] }, COL_TAILLIGHT)
    );
  }
  appendWheelSet(out, [rearAxleZ, frontAxleZ], 0.44, wheelR, wheelW);
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
        paint: [0.92, 0.24, 0.21],
        halfLen: 1.06,
        halfW: 0.48,
        beltY: 0.45,
        roofY: 0.74,
        cabinFrontZ: 0.40,
        cabinRearZ: -0.52,
        roofTaper: 0.88,
        wheelR: 0.185,
        wheelW: 0.125
      });
    case "hatch":
      return buildRoadCarParts({
        kind: "hatch",
        paint: [0.20, 0.60, 0.94],
        halfLen: 0.95,
        halfW: 0.47,
        beltY: 0.45,
        roofY: 0.75,
        cabinFrontZ: 0.36,
        cabinRearZ: -0.82,
        roofTaper: 0.90,
        wheelR: 0.18,
        wheelW: 0.12
      });
    case "suv":
      return buildRoadCarParts({
        kind: "suv",
        paint: [0.22, 0.64, 0.42],
        halfLen: 1.15,
        halfW: 0.52,
        beltY: 0.51,
        roofY: 0.87,
        cabinFrontZ: 0.44,
        cabinRearZ: -1.00,
        roofTaper: 0.92,
        wheelR: 0.215,
        wheelW: 0.145
      });
    case "taxi":
      return buildRoadCarParts({
        kind: "taxi",
        paint: [0.99, 0.78, 0.14],
        accent: [0.99, 0.80, 0.18],
        halfLen: 1.06,
        halfW: 0.48,
        beltY: 0.45,
        roofY: 0.74,
        cabinFrontZ: 0.40,
        cabinRearZ: -0.54,
        roofTaper: 0.88,
        wheelR: 0.185,
        wheelW: 0.125
      });
    case "van":
      return buildRoadCarParts({
        kind: "van",
        paint: [0.94, 0.95, 0.92],
        accent: [0.96, 0.97, 0.95],
        halfLen: 1.18,
        halfW: 0.52,
        beltY: 0.52,
        roofY: 0.91,
        cabinFrontZ: 0.88,
        cabinRearZ: -1.06,
        roofTaper: 0.94,
        wheelR: 0.195,
        wheelW: 0.135
      });
    case "pickup":
      return buildPickupTruckParts();
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
 * sculpted wheel-well fenders, 4 `wheelAssemblySlots`, and dark `material.studioGlass` windows.
 */
export function buildHeroVehicleMultiMaterialNode(
  kind: ProceduralVehicleKind,
  opts: VehiclePoolOptions & { readonly name?: string }
) {
  const L = 1.06;
  const W = 0.48;
  const wheelR = 0.185;
  const wheelW = 0.125;
  const sillY = wheelR * 0.62;
  const beltY = 0.45;
  const roofY = 0.74;
  const axleZ = 0.64;
  const cabRearZ = kind === "pickup" ? -0.06 : -0.52;
  const cabFrontZ = 0.40;

  const sideFlank: V2[] = [
    [-L, sillY + 0.04],
    [-L + 0.07, sillY],
    ...wheelArchCutoutPoints(-axleZ, wheelR, wheelR * 1.22, sillY, 7),
    ...wheelArchCutoutPoints(axleZ, wheelR, wheelR * 1.22, sillY, 7),
    [L - 0.06, sillY],
    [L, sillY + 0.03],
    [L - 0.03, 0.36],
    [cabFrontZ + 0.04, beltY],
    [cabRearZ - 0.04, beltY],
    [-L + 0.04, kind === "pickup" ? 0.46 : 0.42]
  ];
  const centerDeck = superellipseLoft(
    [
      { z: kind === "pickup" ? -0.06 : -L * 0.96, rx: W * 0.92, ry: 0.15, y: 0.30, superellipseN: 3.4 },
      { z: 0.20, rx: W * 0.94, ry: 0.16, y: 0.31, superellipseN: 3.8 },
      { z: L * 0.96, rx: W * 0.80, ry: 0.13, y: 0.28, superellipseN: 3.2 }
    ],
    22,
    true,
    false
  );
  const greenhouse = loftSectionsMesh(
    [
      [[-W * 0.85, beltY - 0.01, cabRearZ], [W * 0.85, beltY - 0.01, cabRearZ], [W * 0.70, roofY, cabRearZ + 0.16], [-W * 0.70, roofY, cabRearZ + 0.16]],
      [[-W * 0.84, beltY - 0.01, cabFrontZ], [W * 0.84, beltY - 0.01, cabFrontZ], [W * 0.70, roofY, cabFrontZ - 0.20], [-W * 0.70, roofY, cabFrontZ - 0.20]]
    ],
    true,
    false
  );
  const toX = (m: RawMesh, pos?: V3, rot?: V3) => transformMesh(transformMesh(m, { pos, rot }), { rot: [0, Math.PI / 2, 0] });
  const wheels = wheelAssemblySlots({ radius: wheelR, width: wheelW, spokeCount: 5, tireMat: 2, rimMat: 3 });
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: toX(extrudeSideSilhouette(sideFlank, 0.17, 0.016, -(W - 0.085))) },
    { materialIndex: 0, mesh: toX(extrudeSideSilhouette(sideFlank, 0.17, 0.016, W - 0.085)) },
    { materialIndex: 0, mesh: toX(centerDeck) },
    { materialIndex: 0, mesh: toX(greenhouse) },
    { materialIndex: 1, mesh: toX(chamferBox([W * 1.86, 0.10, 0.11], 0.025), [0, sillY + 0.03, L + 0.02]) },
    { materialIndex: 1, mesh: toX(chamferBox([W * 1.86, 0.10, 0.11], 0.025), [0, sillY + 0.03, -L - 0.02]) },
    { materialIndex: 2, mesh: toX(chamferBox([W * 0.94, 0.14, 0.045], 0.01), [0, 0.29, L + 0.01]) },
    { materialIndex: 4, mesh: toX(chamferBox([0.15, 0.085, 0.055], 0.015), [-W * 0.64, 0.31, L + 0.01]) },
    { materialIndex: 4, mesh: toX(chamferBox([0.15, 0.085, 0.055], 0.015), [W * 0.64, 0.31, L + 0.01]) },
    { materialIndex: 5, mesh: toX(chamferBox([0.17, 0.085, 0.055], 0.015), [-W * 0.62, 0.33, -L - 0.01]) },
    { materialIndex: 5, mesh: toX(chamferBox([0.17, 0.085, 0.055], 0.015), [W * 0.62, 0.33, -L - 0.01]) }
  ];
  if (kind === "pickup") {
    slots.push(
      { materialIndex: 2, mesh: toX(chamferBox([W * 1.32, 0.08, 0.94], 0.012), [0, sillY + 0.06, -0.56]) },
      { materialIndex: 0, mesh: toX(chamferBox([W * 1.88, 0.30, 0.06], 0.014), [0, 0.31, -L + 0.03]) }
    );
  }
  for (const az of [-axleZ, axleZ]) {
    for (const sd of [-1, 1] as const) {
      for (const w of wheels) {
        slots.push({
          materialIndex: w.materialIndex,
          mesh: transformMesh(w.mesh, { pos: [az, wheelR, sd * (W - wheelW * 0.52)], rot: [0, Math.PI / 2 + (sd < 0 ? Math.PI : 0), 0] })
        });
      }
    }
  }
  const scale = opts.targetMaxDimension / (L * 2 + 0.06);
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
  const sideWinProfile: V2[] = [
    [cabRearZ + 0.05, beltY + 0.03],
    [cabFrontZ - 0.06, beltY + 0.03],
    [cabFrontZ - 0.21, roofY - 0.04],
    [cabRearZ + 0.17, roofY - 0.04]
  ];
  const glassParts = [
    toX(chamferBox([W * 1.34, 0.32, 0.028], 0.008), [0, 0.59, cabFrontZ - 0.09], [-0.58, 0, 0]),
    toX(chamferBox([W * 1.30, 0.28, 0.028], 0.008), [0, 0.59, cabRearZ + 0.07], [0.48, 0, 0]),
    toX(extrudeSideSilhouette(sideWinProfile, W * 1.72, 0.006, 0))
  ].map((m) => transformMesh(m, { scale }));
  const glassNode = geometry.custom(mergeRawMeshes(glassParts), {
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

/** Notched water-lily pad (`extrudePolygonMesh`) with radial vein star & sculpted lotus bud (`m-pads`). */
export function buildNotchedLilyPadSpec(): AuraCustomGeometrySpec {
  return cachedProp("lily-pad", () => {
    const ring: V2[] = [[0.05, 0.0]];
    const steps = 28;
    for (let i = 0; i <= steps; i += 1) {
      const a = 0.24 + (i / steps) * (Math.PI * 2 - 0.48);
      const r = 0.48 + Math.sin(i * 1.9) * 0.014;
      ring.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const padBlade = transformMesh(extrudePolygonMesh(ring, 0.34, 0.05, false), { rot: [-Math.PI / 2, 0, 0] });
    const veinStar = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.32, 0.13), 0.08, 0.015, false), {
      pos: [0.02, 0.18, 0],
      rot: [-Math.PI / 2, 0, 0]
    });
    const lotusBud = superellipseLoft(
      [
        { z: 0.14, rx: 0.09, ry: 0.09, y: 0, superellipseN: 2.2 },
        { z: 0.34, rx: 0.13, ry: 0.13, y: 0, superellipseN: 2.0 },
        { z: 0.48, rx: 0.04, ry: 0.04, y: 0, superellipseN: 2.0 }
      ],
      14,
      true,
      false
    );
    return normalizePartsToUnitCube([
      tintRawMesh(padBlade, [0.88, 0.98, 0.86]),
      tintRawMesh(veinStar, [0.98, 1.0, 0.92]),
      placeTinted(lotusBud, { pos: [-0.12, 0.04, 0.08], rot: [-Math.PI / 2, 0, 0] }, [1.0, 0.88, 0.94])
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

/** Smooth rounded botanical oak & meadow foliage cluster (`d-canopy` — zero spiky cone lampshades). */
export function buildWoodlandCanopySpec(): AuraCustomGeometrySpec {
  return cachedProp("woodland-canopy", () =>
    normalizePartsToUnitCube([
      tintRawMesh(layeredCanopyMesh({ radius: 0.50, height: 0.78, puffs: 9, seed: 19 }), [0.94, 0.99, 0.92]),
      placeTinted(icosphereSmoothMesh(0.34, 2, 0.07, 43, 0.48), { pos: [0.06, 0.14, -0.04], scale: [1.08, 0.78, 1.04] }, [0.99, 1.0, 0.95]),
      placeTinted(icosphereSmoothMesh(0.28, 2, 0.06, 61, 0.48), { pos: [-0.14, 0.06, 0.10], scale: [1.05, 0.76, 1.02] }, [0.92, 0.98, 0.90])
    ])
  );
}

/** Single-draw batched woodland tree (`d-trees`): root-flared bark trunk + smooth multi-puff `layeredCanopyMesh` crown grounded at `y = 0`. */
export function buildWoodlandTreeSpec(): AuraCustomGeometrySpec {
  return cachedProp("woodland-tree-batched", () => {
    const trunk = latheMesh(
      [[0, 0.0], [0.16, 0.0], [0.115, 0.16], [0.095, 0.44], [0.075, 0.62], [0, 0.62]],
      12,
      false
    );
    const mainCrown = transformMesh(layeredCanopyMesh({ radius: 0.48, height: 0.62, puffs: 8, seed: 23 }), {
      pos: [0, 0.70, 0]
    });
    const topPuff = transformMesh(icosphereSmoothMesh(0.30, 2, 0.06, 37, 0.50), {
      pos: [0.03, 0.92, -0.02],
      scale: [1.05, 0.78, 1.02]
    });
    const sidePuff = transformMesh(icosphereSmoothMesh(0.26, 2, 0.06, 53, 0.46), {
      pos: [-0.16, 0.68, 0.10],
      scale: [1.04, 0.74, 1.0]
    });
    return mergeColoredMeshesToSpec([
      tintRawMesh(trunk, [0.48, 0.33, 0.21]),
      tintRawMesh(mainCrown, [0.34, 0.70, 0.37]),
      tintRawMesh(topPuff, [0.44, 0.80, 0.43]),
      tintRawMesh(sidePuff, [0.38, 0.74, 0.40])
    ]);
  });
}

/** Single-draw batched meadow shrub (`d-bushes`): pillowy `icosphereSmoothMesh` puffs + wildflower buds grounded at `y = 0`. */
export function buildMeadowBushSpec(): AuraCustomGeometrySpec {
  return cachedProp("meadow-bush-batched", () =>
    mergeColoredMeshesToSpec([
      placeTinted(icosphereSmoothMesh(0.34, 2, 0.07, 11, 0.50), { pos: [0, 0.22, 0], scale: [1.18, 0.68, 1.12] }, [0.35, 0.71, 0.38]),
      placeTinted(icosphereSmoothMesh(0.25, 1, 0.06, 29, 0.50), { pos: [0.22, 0.17, 0.08], scale: [1.10, 0.66, 1.05] }, [0.42, 0.78, 0.43]),
      placeTinted(icosphereSmoothMesh(0.24, 1, 0.06, 47, 0.50), { pos: [-0.20, 0.16, -0.06], scale: [1.08, 0.65, 1.04] }, [0.32, 0.67, 0.36]),
      placeTinted(icosphereSmoothMesh(0.055, 1, 0.02, 71, 0.4), { pos: [0.10, 0.40, 0.12] }, [1.0, 0.86, 0.34]),
      placeTinted(icosphereSmoothMesh(0.05, 1, 0.02, 83, 0.4), { pos: [-0.12, 0.38, -0.08] }, [1.0, 0.70, 0.82])
    ])
  );
}

/** Single-draw batched railroad track strip (`m-rail-tracks`): 22 bevelled timber sleepers, tie plates & 2 steel rails. */
export function buildRailTrackStripSpec(stripWidth = 34): AuraCustomGeometrySpec {
  return cachedProp(`rail-track:${stripWidth.toFixed(2)}`, () => {
    const parts: ColoredRawMesh[] = [];
    const sleeper = chamferBox([0.25, 0.032, 0.90], 0.006);
    const plate = chamferBox([0.15, 0.010, 0.13], 0.003);
    for (let x = -16.25; x <= 16.26; x += 1.55) {
      parts.push(
        placeTinted(sleeper, { pos: [x, 0.016, 0] }, [0.25, 0.20, 0.16]),
        placeTinted(plate, { pos: [x, 0.034, -0.30] }, [0.34, 0.36, 0.40]),
        placeTinted(plate, { pos: [x, 0.034, 0.30] }, [0.34, 0.36, 0.40])
      );
    }
    const rail = chamferBox([stripWidth, 0.034, 0.068], 0.007);
    parts.push(
      placeTinted(rail, { pos: [0, 0.050, -0.30] }, [0.78, 0.82, 0.88]),
      placeTinted(rail, { pos: [0, 0.050, 0.30] }, [0.78, 0.82, 0.88])
    );
    return mergeColoredMeshesToSpec(parts);
  });
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

/** Gentle, wide, rounded stratified meadow hills topped with smooth `layeredCanopyMesh` trees (`horizon-ridge`). */
export function buildHorizonRidgeSpec(): AuraCustomGeometrySpec {
  return cachedProp("horizon-ridge", () => {
    const segs = 22;
    const makeTerraceRing = (rx: number, rz: number, y: number): V3[] => {
      const ring: V3[] = [];
      for (let i = 0; i < segs; i += 1) {
        const a = (i / segs) * Math.PI * 2;
        const wobble = 1 + Math.sin(a * 2 + 0.6) * 0.08 + Math.cos(a * 3 - 0.4) * 0.05;
        ring.push([Math.cos(a) * rx * wobble, y, Math.sin(a) * rz * wobble]);
      }
      return ring;
    };
    // Smooth-shaded low-slope stratified meadow terrace skirt (`flatShaded = false`)
    const terraceSkirt = loftSectionsMesh(
      [
        makeTerraceRing(0.50, 0.46, 0.0),
        makeTerraceRing(0.47, 0.43, 0.16),
        makeTerraceRing(0.40, 0.36, 0.20),
        makeTerraceRing(0.35, 0.32, 0.34),
        makeTerraceRing(0.24, 0.22, 0.42)
      ],
      true,
      false
    );
    // Wide vertically squashed `icosphereSmoothMesh` rolling meadow domes + smooth hilltop `layeredCanopyMesh` trees
    const mainMound = transformMesh(icosphereSmoothMesh(0.42, 2, 0.05, 29, 0.52), {
      pos: [-0.04, 0.36, 0.0],
      scale: [1.06, 0.54, 0.92]
    });
    const shoulderMound = transformMesh(icosphereSmoothMesh(0.32, 2, 0.05, 47, 0.52), {
      pos: [0.18, 0.28, 0.05],
      scale: [1.02, 0.50, 0.88]
    });
    const crestTreesA = transformMesh(layeredCanopyMesh({ radius: 0.11, height: 0.16, puffs: 6, seed: 17 }), {
      pos: [-0.08, 0.58, -0.02]
    });
    const crestTreesB = transformMesh(layeredCanopyMesh({ radius: 0.085, height: 0.13, puffs: 5, seed: 33 }), {
      pos: [0.15, 0.46, 0.04]
    });
    return normalizePartsToUnitCube([
      tintRawMesh(terraceSkirt, [0.88, 0.94, 0.86]),
      tintRawMesh(mainMound, [0.96, 1.0, 0.93]),
      tintRawMesh(shoulderMound, [0.92, 0.98, 0.90]),
      tintRawMesh(crestTreesA, [0.76, 0.92, 0.76]),
      tintRawMesh(crestTreesB, [0.80, 0.94, 0.78])
    ]);
  });
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
