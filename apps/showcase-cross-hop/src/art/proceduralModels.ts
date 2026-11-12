/**
 * Cross Hop (WP-13 / WP-14) — Bespoke Multi-Material Procedural Critters, Fleet, River & Woodland Kit.
 *
 * Sculpted exclusively through `@aura3d/engine` + `showcase-port-shared/proceduralKernel` smooth-normal
 * primitives (`loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`,
 * `wheelAssemblySlots`, `icosphereSmoothMesh`, `icosphereFacetMesh`, `layeredCanopyMesh`,
 * `bevelBoxMesh`, `assembleMultiMaterialNode`) — zero Meshy `.glb` dependencies.
 */
import {
  geometry,
  group,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec
} from "@aura3d/engine";
import type { CritterAssetId } from "../aura-assets";
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
  }),
  // Sculpted playable critter physical materials (clay, plush felt, lacquer, brushed metal, 24k gold & practical LEDs)
  frogEmeraldSkin: material.lacquer({
    color: "#39b858",
    roughness: 0.34,
    clearcoat: 0.68,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.12
  }),
  frogLeafSpot: material.matteClay({
    color: "#227a3b",
    roughness: 0.56,
    envMapIntensity: 0.9
  }),
  critterCreamBelly: material.matteClay({
    color: "#fbf3dc",
    roughness: 0.74,
    envMapIntensity: 0.88
  }),
  critterEyeSclera: material.ceramic({
    color: "#ffffff",
    roughness: 0.14,
    clearcoat: 0.85,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.2
  }),
  critterEyePupil: material.lacquer({
    color: "#111622",
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.35
  }),
  critterCatchlight: material.ceramic({
    color: "#ffffff",
    roughness: 0.05,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.45
  }),
  critterRosyBlush: material.matteClay({
    color: "#ff85a2",
    roughness: 0.72,
    envMapIntensity: 0.86
  }),
  duckSunnyPlumage: material.felt({
    color: "#ffcf3d",
    roughness: 0.72,
    sheen: 0.38,
    envMapIntensity: 0.92
  }),
  chickDownYellow: material.felt({
    color: "#ffe159",
    roughness: 0.78,
    sheen: 0.44,
    envMapIntensity: 0.92
  }),
  waterfowlOrangeBill: material.lacquer({
    color: "#ff7e21",
    roughness: 0.24,
    clearcoat: 0.76,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.1
  }),
  bunnyCloudPlush: material.felt({
    color: "#f7f3ee",
    roughness: 0.82,
    sheen: 0.45,
    envMapIntensity: 0.88
  }),
  sakuraPinkSkin: material.matteClay({
    color: "#ffa8c5",
    roughness: 0.48,
    envMapIntensity: 0.96
  }),
  axolotlCoralGill: material.matteClay({
    color: "#ff5484",
    roughness: 0.56,
    envMapIntensity: 0.94
  }),
  turtleJadeShell: material.lacquer({
    color: "#2f7d4f",
    roughness: 0.28,
    clearcoat: 0.66,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.08
  }),
  turtleScuteAmber: material.matteClay({
    color: "#c89548",
    roughness: 0.58,
    envMapIntensity: 0.9
  }),
  turtleSageSkin: material.matteClay({
    color: "#69ad62",
    roughness: 0.52,
    envMapIntensity: 0.92
  }),
  toastGoldenCrust: material.matteClay({
    color: "#b86b2b",
    roughness: 0.82,
    envMapIntensity: 0.82
  }),
  toastWarmCrumb: material.matteClay({
    color: "#f3d59b",
    roughness: 0.86,
    envMapIntensity: 0.84
  }),
  toastButterPat: material.lacquer({
    color: "#ffe46b",
    roughness: 0.22,
    clearcoat: 0.75,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.08
  }),
  gingerCatPlush: material.felt({
    color: "#f09b46",
    roughness: 0.78,
    sheen: 0.38,
    envMapIntensity: 0.88
  }),
  roboTitaniumHull: material.carPaint({
    color: "#637894",
    roughness: 0.18,
    metalness: 0.78,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.4
  }),
  roboGunmetalJoint: material.brushedMetal({
    color: "#2b3340",
    roughness: 0.34,
    metalness: 0.88,
    envMapIntensity: 1.2
  }),
  roboCyanVisor: material.emissive({
    color: "#38f6ff",
    emissive: "#1ae8ff",
    emissiveIntensity: 1.38,
    roughness: 0.12,
    practical: true
  }),
  knightPolishedSteel: material.studioMetal({
    color: "#d7e0ec",
    roughness: 0.18,
    metalness: 0.94,
    envMapIntensity: 1.38
  }),
  knightCrimsonPlume: material.felt({
    color: "#d92b3a",
    roughness: 0.76,
    sheen: 0.42,
    envMapIntensity: 0.9
  }),
  knightHeraldicBlue: material.lacquer({
    color: "#2756b8",
    roughness: 0.2,
    clearcoat: 0.88,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.22
  }),
  mushroomScarletCap: material.lacquer({
    color: "#e23434",
    roughness: 0.26,
    clearcoat: 0.72,
    clearcoatRoughness: 0.1,
    envMapIntensity: 1.12
  }),
  woodlandBootLeather: material.matteClay({
    color: "#7a4928",
    roughness: 0.72,
    envMapIntensity: 0.82
  }),
  astroEvaWhite: material.ceramic({
    color: "#f4f7fb",
    roughness: 0.2,
    clearcoat: 0.9,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.25
  }),
  astroCollarOrange: material.lacquer({
    color: "#f26722",
    roughness: 0.22,
    clearcoat: 0.82,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.15
  }),
  astroBubbleGlass: material.studioGlass({
    color: "#bfe6ff",
    tint: "#d8f1ff",
    roughness: 0.03,
    opacity: 0.42,
    ior: 1.48
  }),
  sovereign24kGold: material.studioMetal({
    color: "#f5c43d",
    roughness: 0.14,
    metalness: 0.96,
    envMapIntensity: 1.48
  }),
  champagneGoldTrim: material.brushedMetal({
    color: "#fbe08a",
    roughness: 0.22,
    metalness: 0.9,
    envMapIntensity: 1.34
  }),
  crownRubyGem: material.lacquer({
    color: "#e01e48",
    roughness: 0.08,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.4
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
  appendWheelSet(out, [-1.36, -0.88, 0.88, 1.36], 0.34, 0.11, 0.08);
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
  appendWheelSet(out, [-1.76, -1.16, 1.16, 1.76], 0.36, 0.115, 0.085);
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
 * Stooping peregrine hawk (`name: "hawk"`, `~1.42 m` wingspan) with layered swept feathered wings,
 * curved hooked beak, curved grasping talons, and expressive iris/pupil/catchlight raptor eyes.
 */
export function buildStoopingHawkNode() {
  const body = superellipseLoft(
    [
      { z: -0.44, rx: 0.05, ry: 0.04, y: 0.02, superellipseN: 2.2 },
      { z: -0.14, rx: 0.14, ry: 0.13, y: 0.0, superellipseN: 2.3 },
      { z: 0.18, rx: 0.16, ry: 0.15, y: 0.02, superellipseN: 2.3 },
      { z: 0.40, rx: 0.11, ry: 0.11, y: 0.07, superellipseN: 2.1 },
      { z: 0.51, rx: 0.045, ry: 0.045, y: 0.06, superellipseN: 2.0 }
    ],
    20,
    true,
    false
  );
  const breast = superellipseLoft(
    [
      { z: -0.12, rx: 0.115, ry: 0.095, y: -0.05, superellipseN: 2.2 },
      { z: 0.16, rx: 0.135, ry: 0.115, y: -0.04, superellipseN: 2.2 },
      { z: 0.36, rx: 0.075, ry: 0.065, y: 0.015, superellipseN: 2.0 }
    ],
    18,
    true,
    false
  );
  // Swept primary flight-feather wing + overlapping covert plumage layer
  const primaryWingRing: V2[] = [
    [0.07, 0.23],
    [0.42, 0.19],
    [0.72, -0.04],
    [0.66, -0.15],
    [0.54, -0.12],
    [0.46, -0.19],
    [0.34, -0.14],
    [0.22, -0.17],
    [0.08, -0.12]
  ];
  const covertWingRing: V2[] = [
    [0.07, 0.21],
    [0.36, 0.16],
    [0.48, 0.02],
    [0.32, -0.06],
    [0.08, -0.06]
  ];
  const rightWing = transformMesh(extrudePolygonMesh(primaryWingRing, 0.032, 0.009, false), {
    pos: [0, 0.05, 0.04],
    rot: [-Math.PI / 2 + 0.14, 0, 0.18]
  });
  const leftWing = transformMesh(extrudePolygonMesh(primaryWingRing, 0.032, 0.009, false), {
    pos: [0, 0.05, 0.04],
    rot: [-Math.PI / 2 + 0.14, 0, -0.18],
    scale: [-1, 1, 1]
  });
  const rightCovert = transformMesh(extrudePolygonMesh(covertWingRing, 0.028, 0.008, false), {
    pos: [0, 0.072, 0.05],
    rot: [-Math.PI / 2 + 0.14, 0, 0.18]
  });
  const leftCovert = transformMesh(extrudePolygonMesh(covertWingRing, 0.028, 0.008, false), {
    pos: [0, 0.072, 0.05],
    rot: [-Math.PI / 2 + 0.14, 0, -0.18],
    scale: [-1, 1, 1]
  });
  const tailFan: V2[] = [
    [-0.06, 0],
    [0.06, 0],
    [0.23, -0.34],
    [0.11, -0.38],
    [0.0, -0.41],
    [-0.11, -0.38],
    [-0.23, -0.34]
  ];
  // Down-curved hooked raptor beak (`tubeSweepMesh`)
  const hookedBeak = tubeSweepMesh(
    [
      [0, 0.065, 0.48, 0.048],
      [0, 0.055, 0.56, 0.034],
      [0, 0.018, 0.615, 0.018],
      [0, -0.028, 0.625, 0.005]
    ],
    12,
    false
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 0, mesh: rightWing },
    { materialIndex: 0, mesh: leftWing },
    { materialIndex: 0, mesh: transformMesh(extrudePolygonMesh(tailFan, 0.024, 0.006, false), { pos: [0, 0.03, -0.36], rot: [-Math.PI / 2 - 0.10, 0, 0] }) },
    { materialIndex: 1, mesh: breast },
    { materialIndex: 1, mesh: rightCovert },
    { materialIndex: 1, mesh: leftCovert },
    { materialIndex: 2, mesh: hookedBeak }
  ];
  // Curved grasping talons + feathered drumsticks + amber iris / dark pupil / white catchlight eyes
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 0,
      mesh: tubeSweepMesh(
        [
          [sgn * 0.075, -0.04, 0.02, 0.042],
          [sgn * 0.08, -0.13, 0.07, 0.024]
        ],
        10,
        false
      )
    });
    for (const toeX of [-0.022, 0, 0.022]) {
      slots.push({
        materialIndex: 2,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.08 + toeX, -0.13, 0.07, 0.014],
            [sgn * 0.08 + toeX * 1.35, -0.18, 0.13, 0.010],
            [sgn * 0.08 + toeX * 1.4, -0.22, 0.115, 0.004]
          ],
          8,
          false
        )
      });
    }
    slots.push(
      { materialIndex: 3, mesh: transformMesh(icosphereSmoothMesh(0.028, 1, 0, 3, 0), { pos: [sgn * 0.078, 0.09, 0.42] }) },
      { materialIndex: 4, mesh: transformMesh(icosphereSmoothMesh(0.016, 1, 0, 5, 0), { pos: [sgn * 0.086, 0.09, 0.436] }) },
      { materialIndex: 5, mesh: transformMesh(icosphereSmoothMesh(0.007, 1, 0, 7, 0), { pos: [sgn * 0.092, 0.10, 0.444] }) }
    );
  }
  return assembleMultiMaterialNode(
    "hawk",
    slots,
    [
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorPlumage,
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorBreast,
      CROSS_HOP_PROCEDURAL_MATERIALS.raptorBeak,
      CROSS_HOP_PROCEDURAL_MATERIALS.rescueCoreGlow,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
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

/** Upright beveled golden coin with milled outer rim, recessed dish & star/frog-pad relief grounded on `y = 0`. */
export function buildStarCoinStandingSpec(diameter: number): AuraCustomGeometrySpec {
  return cachedProp(`coin-standing:${diameter.toFixed(4)}`, () => {
    const r = diameter * 0.5;
    const halfT = diameter * 0.14;
    const dishT = halfT * 0.64;
    const rim = transformMesh(
      latheMesh(
        [
          [0, -dishT],
          [r * 0.74, -dishT],
          [r * 0.78, -halfT],
          [r * 0.90, -halfT],
          [r, -halfT * 0.70],
          [r, halfT * 0.70],
          [r * 0.90, halfT],
          [r * 0.78, halfT],
          [r * 0.74, dishT],
          [0, dishT]
        ],
        28,
        false
      ),
      { pos: [0, r, 0], rot: [Math.PI / 2, 0, 0] }
    );
    const star = extrudePolygonMesh(makeFivePointStarRing(r * 0.48, r * 0.21), halfT * 2.18, 0.008, false);
    const padBead = icosphereSmoothMesh(r * 0.085, 1, 0, 13, 0);
    return mergeColoredMeshesToSpec([
      tintRawMesh(rim, [1.0, 0.85, 0.22]),
      placeTinted(star, { pos: [0, r - r * 0.04, 0] }, [1.0, 0.96, 0.62]),
      placeTinted(padBead, { pos: [-r * 0.20, r + r * 0.48, 0], scale: [1, 1, 1.55] }, [1.0, 0.97, 0.68]),
      placeTinted(padBead, { pos: [0, r + r * 0.55, 0], scale: [1, 1, 1.55] }, [1.0, 0.97, 0.68]),
      placeTinted(padBead, { pos: [r * 0.20, r + r * 0.48, 0], scale: [1, 1, 1.55] }, [1.0, 0.97, 0.68])
    ]);
  });
}

/** Unit `Y`-axis beveled golden coin (`[-0.5..+0.5]^3`, rotated upright by `rz = Math.PI / 2` in diorama/original). */
export function buildStarCoinUnitSpec(): AuraCustomGeometrySpec {
  return cachedProp("coin-unit", () => {
    const rim = latheMesh(
      [
        [0, -0.26],
        [0.37, -0.26],
        [0.40, -0.39],
        [0.46, -0.39],
        [0.50, -0.26],
        [0.50, 0.26],
        [0.46, 0.39],
        [0.40, 0.39],
        [0.37, 0.26],
        [0, 0.26]
      ],
      28,
      false
    );
    const star = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.26, 0.115), 0.88, 0.02, false), {
      rot: [-Math.PI / 2, 0, 0]
    });
    const padBead = icosphereSmoothMesh(0.048, 1, 0, 17, 0);
    return normalizePartsToUnitCube([
      tintRawMesh(rim, [1.0, 0.91, 0.58]),
      tintRawMesh(star, [1.0, 0.98, 0.82]),
      placeTinted(padBead, { pos: [-0.11, 0, 0.27], scale: [1, 9.2, 1] }, [1.0, 0.98, 0.84]),
      placeTinted(padBead, { pos: [0, 0, 0.31], scale: [1, 9.2, 1] }, [1.0, 0.98, 0.84]),
      placeTinted(padBead, { pos: [0.11, 0, 0.27], scale: [1, 9.2, 1] }, [1.0, 0.98, 0.84])
    ]);
  });
}

// ---------------------------------------------------------------------------
// Sculpted Multi-Material Playable Critter Kit (All 12 Heroes — Zero GLBs)
// ---------------------------------------------------------------------------

interface VerticalContourSection {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly z?: number;
  readonly x?: number;
  readonly n?: number;
}

function verticalContourLoft(sections: readonly VerticalContourSection[], segs = 22): RawMesh {
  const makeRing = (sec: VerticalContourSection, scaleR = 1): V3[] => {
    const cx = sec.x ?? 0;
    const cz = sec.z ?? 0;
    const p = 2 / (sec.n ?? 2.1);
    const ring: V3[] = [];
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const x = Math.sign(ca) * Math.pow(Math.abs(ca), p) * sec.rx * scaleR + cx;
      const z = Math.sign(sa) * Math.pow(Math.abs(sa), p) * sec.rz * scaleR + cz;
      ring.push([x, sec.y, z]);
    }
    return ring;
  };
  const first = sections[0]!;
  const last = sections[sections.length - 1]!;
  const rings: V3[][] = [
    makeRing({ ...first, y: first.y - 0.004 }, 0.06),
    ...sections.map((s) => makeRing(s, 1)),
    makeRing({ ...last, y: last.y + 0.004 }, 0.06)
  ];
  return loftSectionsMesh(rings, true, false);
}

interface EyePlacementOptions {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly radius: number;
  readonly scleraMat: number;
  readonly pupilMat: number;
  readonly catchlightMat: number;
  readonly blushMat?: number;
  readonly turretMat?: number;
}

/** Appends symmetrical big expressive eyes (ivory sclera, dark obsidian pupil, pure white catchlight & optional turrets/blush). */
function appendExpressiveEyes(slots: MultiMatSlot[], opts: EyePlacementOptions): void {
  const r = opts.radius;
  for (const sgn of [-1, 1] as const) {
    const ex = sgn * opts.x;
    if (opts.turretMat !== undefined) {
      slots.push({
        materialIndex: opts.turretMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 1.18, 2, 0, 19, 0.25), {
          pos: [ex, opts.y - r * 0.14, opts.z - r * 0.24],
          scale: [1.05, 1.08, 1.04]
        })
      });
    }
    slots.push(
      {
        materialIndex: opts.scleraMat,
        mesh: transformMesh(icosphereSmoothMesh(r, 2, 0, 23, 0), {
          pos: [ex, opts.y, opts.z],
          scale: [0.96, 1.04, 0.92]
        })
      },
      {
        materialIndex: opts.pupilMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.58, 2, 0, 29, 0), {
          pos: [ex * 0.95, opts.y + r * 0.02, opts.z + r * 0.56],
          scale: [0.92, 1.02, 0.58]
        })
      },
      {
        materialIndex: opts.catchlightMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.24, 1, 0, 31, 0), {
          pos: [ex + sgn * r * 0.24, opts.y + r * 0.30, opts.z + r * 0.78],
          scale: [1, 1, 0.65]
        })
      }
    );
    if (opts.blushMat !== undefined) {
      slots.push({
        materialIndex: opts.blushMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.55, 1, 0, 37, 0), {
          pos: [sgn * (opts.x + r * 0.52), opts.y - r * 0.88, opts.z + r * 0.32],
          scale: [0.95, 0.56, 0.38]
        })
      });
    }
  }
}

/** Appends sculpted folded frog haunches, 3-toed webbed hind feet (`minY = 0`), and planted forelimbs. */
function appendFrogLimbs(slots: MultiMatSlot[], skinMat: number, padMat: number, spread = 1): void {
  for (const sgn of [-1, 1] as const) {
    const hx = sgn * 0.26 * spread;
    // Muscular folded thigh & lower shank
    slots.push(
      {
        materialIndex: skinMat,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.17 * spread, 0.22, -0.05, 0.088],
            [hx * 1.12, 0.25, -0.14, 0.095],
            [hx * 1.04, 0.12, -0.04, 0.068],
            [hx * 0.98, 0.036, 0.09, 0.052]
          ],
          12,
          false
        )
      },
      // Foreleg planted forward in athletic crouch
      {
        materialIndex: skinMat,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.17 * spread, 0.29, 0.12, 0.056],
            [sgn * 0.21 * spread, 0.14, 0.20, 0.045],
            [sgn * 0.19 * spread, 0.032, 0.24, 0.040]
          ],
          10,
          false
        )
      }
    );
    // 3 splayed webbed hind toes + bulbous tree-frog toe pads grounded at y = 0
    for (const [tx, tz] of [
      [-0.065, 0.24],
      [0.0, 0.27],
      [0.065, 0.23]
    ] as const) {
      const endX = hx * 0.98 + sgn * tx;
      slots.push(
        {
          materialIndex: padMat,
          mesh: tubeSweepMesh(
            [
              [hx * 0.98, 0.028, 0.09, 0.030],
              [endX, 0.020, tz, 0.021]
            ],
            8,
            false
          )
        },
        {
          materialIndex: padMat,
          mesh: transformMesh(icosphereSmoothMesh(0.026, 1, 0, 41, 0), {
            pos: [endX, 0.020, tz + 0.016],
            scale: [1.1, 0.76, 1.15]
          })
        }
      );
    }
    // 2 splayed front fingers
    for (const fx of [-0.035, 0.035] as const) {
      slots.push({
        materialIndex: padMat,
        mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0, 43, 0), {
          pos: [sgn * 0.19 * spread + fx, 0.018, 0.285],
          scale: [1.0, 0.82, 1.35]
        })
      });
    }
  }
}

/** Appends plump crouched mammal hind haunches, cushioned paws (`minY = 0`) & tucked front paws. */
function appendMammalLimbs(slots: MultiMatSlot[], furMat: number, padMat: number): void {
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: furMat,
        mesh: transformMesh(icosphereSmoothMesh(0.115, 2, 0, 47, 0.2), {
          pos: [sgn * 0.21, 0.16, -0.05],
          scale: [0.88, 1.05, 1.18]
        })
      },
      {
        materialIndex: furMat,
        mesh: transformMesh(icosphereSmoothMesh(0.078, 2, 0, 53, 0.15), {
          pos: [sgn * 0.19, 0.042, 0.10],
          scale: [0.92, 0.54, 1.48]
        })
      },
      {
        materialIndex: padMat,
        mesh: transformMesh(icosphereSmoothMesh(0.028, 1, 0, 59, 0), {
          pos: [sgn * 0.19, 0.038, 0.205],
          scale: [1.25, 0.68, 0.85]
        })
      },
      {
        materialIndex: furMat,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.15, 0.30, 0.14, 0.052],
            [sgn * 0.16, 0.19, 0.23, 0.046],
            [sgn * 0.14, 0.15, 0.27, 0.042]
          ],
          10,
          false
        )
      }
    );
  }
}

/** Appends sturdy rounded boots / sabatons / EVA moon-boots planted squarely on `y = 0`. */
function appendBootedLegs(slots: MultiMatSlot[], legMat: number, bootMat: number, soleMat = bootMat): void {
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: legMat,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.13, 0.24, 0.0, 0.068],
            [sgn * 0.145, 0.10, 0.02, 0.062]
          ],
          12,
          false
        )
      },
      {
        materialIndex: bootMat,
        mesh: transformMesh(icosphereSmoothMesh(0.088, 2, 0, 61, 0.15), {
          pos: [sgn * 0.145, 0.056, 0.065],
          scale: [0.92, 0.64, 1.38]
        })
      },
      {
        materialIndex: soleMat,
        mesh: transformMesh(chamferBox([0.155, 0.026, 0.225], 0.008), {
          pos: [sgn * 0.145, 0.013, 0.065]
        })
      }
    );
  }
}

interface CritterAssemblyRecipe {
  readonly slots: readonly MultiMatSlot[];
  readonly materials: readonly AuraMaterialSpec[];
  readonly glassMeshes?: readonly RawMesh[];
  readonly glassMaterial?: AuraMaterialSpec;
}

function buildFrogHeroRecipe(
  skinMat: AuraMaterialSpec,
  spotMat: AuraMaterialSpec,
  bellyMat: AuraMaterialSpec,
  withRoyalCrown: boolean
): CritterAssemblyRecipe {
  // 0: skin, 1: belly, 2: spot/trim, 3: sclera, 4: pupil, 5: catchlight, 6: blush/gem
  const torso = transformMesh(
    verticalContourLoft([
      { y: 0.06, rx: 0.22, rz: 0.21, z: -0.02, n: 2.2 },
      { y: 0.19, rx: 0.30, rz: 0.29, z: 0.01, n: 2.2 },
      { y: 0.35, rx: 0.29, rz: 0.28, z: 0.04, n: 2.3 },
      { y: 0.50, rx: 0.26, rz: 0.25, z: 0.06, n: 2.2 },
      { y: 0.61, rx: 0.18, rz: 0.18, z: 0.05, n: 2.1 }
    ]),
    { rot: [0.06, 0, 0] }
  );
  const belly = verticalContourLoft([
    { y: 0.09, rx: 0.15, rz: 0.08, z: 0.18, n: 2.2 },
    { y: 0.24, rx: 0.21, rz: 0.11, z: 0.23, n: 2.2 },
    { y: 0.40, rx: 0.19, rz: 0.10, z: 0.25, n: 2.2 },
    { y: 0.50, rx: 0.12, rz: 0.07, z: 0.24, n: 2.1 }
  ]);
  const smileRidge = tubeSweepMesh(
    [
      [-0.14, 0.43, 0.26, 0.016],
      [-0.07, 0.405, 0.305, 0.018],
      [0.0, 0.398, 0.318, 0.018],
      [0.07, 0.405, 0.305, 0.018],
      [0.14, 0.43, 0.26, 0.016]
    ],
    10,
    false
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: torso },
    { materialIndex: 1, mesh: belly },
    { materialIndex: 2, mesh: smileRidge },
    // Dorsal organic spots on back
    { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.062, 1, 0, 11, 0.2), { pos: [0, 0.39, -0.21], scale: [1.1, 0.9, 0.35] }) },
    { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.048, 1, 0, 13, 0.2), { pos: [-0.11, 0.31, -0.22], scale: [1.0, 0.9, 0.35] }) },
    { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.048, 1, 0, 17, 0.2), { pos: [0.11, 0.31, -0.22], scale: [1.0, 0.9, 0.35] }) }
  ];
  appendFrogLimbs(slots, 0, 0, 1);
  appendExpressiveEyes(slots, {
    x: 0.135,
    y: 0.62,
    z: 0.14,
    radius: 0.088,
    turretMat: 0,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: withRoyalCrown ? undefined : 6
  });
  if (withRoyalCrown) {
    // 5-point royal gold crown with cabochon ruby gems perched proudly on crown
    const band = latheMesh(
      [
        [0.095, 0.62],
        [0.125, 0.62],
        [0.138, 0.70],
        [0.112, 0.70],
        [0.095, 0.62]
      ],
      20,
      false
    );
    slots.push({ materialIndex: 1, mesh: transformMesh(band, { pos: [0, 0.02, -0.02] }) });
    const spikeRing: V2[] = [
      [-0.032, 0],
      [0.032, 0],
      [0.0, 0.088]
    ];
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const sx = Math.sin(a) * 0.122;
      const sz = Math.cos(a) * 0.122 - 0.02;
      slots.push(
        {
          materialIndex: 1,
          mesh: transformMesh(extrudePolygonMesh(spikeRing, 0.022, 0.005, false), {
            pos: [sx, 0.71, sz],
            rot: [0, a, 0]
          })
        },
        {
          materialIndex: 6,
          mesh: transformMesh(icosphereSmoothMesh(0.018, 1, 0, 71 + i, 0), {
            pos: [Math.sin(a) * 0.13, 0.675, Math.cos(a) * 0.13 - 0.02]
          })
        }
      );
    }
  }
  return {
    slots,
    materials: [
      skinMat,
      bellyMat,
      spotMat,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight,
      withRoyalCrown ? CROSS_HOP_PROCEDURAL_MATERIALS.crownRubyGem : CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush
    ]
  };
}

function buildDuckyRecipe(): CritterAssemblyRecipe {
  // 0: sunny plumage, 1: cream bib, 2: orange bill & webbed feet, 3: sclera, 4: pupil, 5: catchlight, 6: blush
  const body = verticalContourLoft([
    { y: 0.08, rx: 0.19, rz: 0.22, z: -0.02, n: 2.2 },
    { y: 0.22, rx: 0.28, rz: 0.33, z: -0.02, n: 2.2 },
    { y: 0.36, rx: 0.25, rz: 0.28, z: 0.02, n: 2.2 },
    { y: 0.48, rx: 0.20, rz: 0.20, z: 0.08, n: 2.1 },
    { y: 0.64, rx: 0.22, rz: 0.22, z: 0.10, n: 2.1 },
    { y: 0.76, rx: 0.13, rz: 0.13, z: 0.09, n: 2.0 }
  ]);
  const bib = verticalContourLoft([
    { y: 0.16, rx: 0.16, rz: 0.08, z: 0.23, n: 2.2 },
    { y: 0.30, rx: 0.18, rz: 0.09, z: 0.26, n: 2.2 },
    { y: 0.42, rx: 0.12, rz: 0.07, z: 0.24, n: 2.1 }
  ]);
  const upperBill = superellipseLoft(
    [
      { z: 0.24, rx: 0.115, ry: 0.048, y: 0.585, superellipseN: 2.4 },
      { z: 0.36, rx: 0.125, ry: 0.038, y: 0.575, superellipseN: 2.6 },
      { z: 0.44, rx: 0.085, ry: 0.022, y: 0.568, superellipseN: 2.2 }
    ],
    18,
    true,
    false
  );
  const lowerBill = superellipseLoft(
    [
      { z: 0.24, rx: 0.098, ry: 0.028, y: 0.548, superellipseN: 2.3 },
      { z: 0.38, rx: 0.085, ry: 0.020, y: 0.545, superellipseN: 2.2 }
    ],
    16,
    true,
    false
  );
  const wingPoly: V2[] = [
    [-0.14, 0.06],
    [0.14, 0.09],
    [0.16, -0.04],
    [-0.08, -0.11],
    [-0.20, -0.03]
  ];
  const tailPoly: V2[] = [
    [-0.12, 0.0],
    [0.12, 0.0],
    [0.16, 0.18],
    [0.0, 0.23],
    [-0.16, 0.18]
  ];
  const webbedFootPoly: V2[] = [
    [-0.04, -0.06],
    [0.04, -0.06],
    [0.10, 0.13],
    [0.03, 0.11],
    [0.0, 0.15],
    [-0.03, 0.11],
    [-0.10, 0.13]
  ];
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 1, mesh: bib },
    { materialIndex: 2, mesh: upperBill },
    { materialIndex: 2, mesh: lowerBill },
    // Head feather tuft
    {
      materialIndex: 0,
      mesh: tubeSweepMesh(
        [
          [0, 0.74, 0.08, 0.042],
          [0, 0.83, 0.04, 0.030],
          [0, 0.87, -0.02, 0.012]
        ],
        10,
        false
      )
    },
    // Upturned tail feathers
    {
      materialIndex: 0,
      mesh: transformMesh(extrudePolygonMesh(tailPoly, 0.042, 0.01, false), {
        pos: [0, 0.28, -0.31],
        rot: [-0.62, 0, 0]
      })
    }
  ];
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: 0,
        mesh: transformMesh(extrudePolygonMesh(wingPoly, 0.045, 0.012, false), {
          pos: [sgn * 0.265, 0.29, -0.02],
          rot: [0, sgn * (Math.PI / 2 - 0.14), 0]
        })
      },
      {
        materialIndex: 2,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.11, 0.13, 0.02, 0.034],
            [sgn * 0.115, 0.022, 0.04, 0.028]
          ],
          10,
          false
        )
      },
      {
        materialIndex: 2,
        mesh: transformMesh(extrudePolygonMesh(webbedFootPoly, 0.026, 0.006, false), {
          pos: [sgn * 0.115, 0.0, 0.07],
          rot: [Math.PI / 2, 0, sgn * 0.08]
        })
      }
    );
  }
  appendExpressiveEyes(slots, {
    x: 0.145,
    y: 0.64,
    z: 0.23,
    radius: 0.064,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: 6
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.duckSunnyPlumage,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.waterfowlOrangeBill,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush
    ]
  };
}

function buildChickRecipe(): CritterAssemblyRecipe {
  // 0: fluffy lemon down, 1: cream belly, 2: orange beak & 3-toed feet, 3: sclera, 4: pupil, 5: catchlight, 6: blush
  const body = verticalContourLoft([
    { y: 0.11, rx: 0.20, rz: 0.20, z: 0.0, n: 2.1 },
    { y: 0.27, rx: 0.28, rz: 0.28, z: 0.01, n: 2.1 },
    { y: 0.44, rx: 0.25, rz: 0.25, z: 0.02, n: 2.1 },
    { y: 0.60, rx: 0.24, rz: 0.24, z: 0.04, n: 2.1 },
    { y: 0.74, rx: 0.15, rz: 0.15, z: 0.04, n: 2.0 }
  ]);
  const belly = verticalContourLoft([
    { y: 0.17, rx: 0.15, rz: 0.07, z: 0.22, n: 2.2 },
    { y: 0.31, rx: 0.18, rz: 0.08, z: 0.25, n: 2.2 },
    { y: 0.44, rx: 0.12, rz: 0.06, z: 0.23, n: 2.1 }
  ]);
  const beak = transformMesh(
    latheMesh([[0, 0.11], [0.052, 0.02], [0.058, -0.02], [0, -0.02]], 14, false),
    { pos: [0, 0.56, 0.27], rot: [Math.PI / 2, 0, 0] }
  );
  const tinyWing: V2[] = [
    [-0.08, 0.06],
    [0.09, 0.07],
    [0.12, -0.03],
    [-0.06, -0.08]
  ];
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 1, mesh: belly },
    { materialIndex: 2, mesh: beak },
    // Fluffy 3-puff chick head crest + tail puff
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.068, 1, 0, 19, 0.3), { pos: [0, 0.78, 0.05], scale: [0.85, 1.28, 0.9] }) },
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.052, 1, 0, 23, 0.3), { pos: [-0.05, 0.76, 0.02], rot: [0, 0, 0.32] }) },
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.052, 1, 0, 29, 0.3), { pos: [0.05, 0.76, 0.02], rot: [0, 0, -0.32] }) },
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.078, 1, 0, 31, 0.25), { pos: [0, 0.30, -0.26], scale: [0.85, 1.05, 1.25] }) }
  ];
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: 0,
        mesh: transformMesh(extrudePolygonMesh(tinyWing, 0.04, 0.012, false), {
          pos: [sgn * 0.26, 0.36, 0.02],
          rot: [0, sgn * (Math.PI / 2 - 0.26), sgn * 0.22]
        })
      },
      {
        materialIndex: 2,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.095, 0.15, 0.02, 0.026],
            [sgn * 0.10, 0.018, 0.03, 0.022]
          ],
          8,
          false
        )
      }
    );
    for (const [tx, tz] of [
      [-0.045, 0.14],
      [0.0, 0.16],
      [0.045, 0.14],
      [0.0, -0.05]
    ] as const) {
      slots.push({
        materialIndex: 2,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.10, 0.016, 0.03, 0.018],
            [sgn * 0.10 + tx, 0.014, tz, 0.012]
          ],
          8,
          false
        )
      });
    }
  }
  appendExpressiveEyes(slots, {
    x: 0.135,
    y: 0.60,
    z: 0.22,
    radius: 0.068,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: 6
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.chickDownYellow,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.waterfowlOrangeBill,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush
    ]
  };
}

function buildBunRecipe(): CritterAssemblyRecipe {
  // 0: cloud plush, 1: sakura inner ear / nose / paw pads, 2: cream belly, 3: sclera, 4: pupil, 5: catchlight
  const body = verticalContourLoft([
    { y: 0.06, rx: 0.20, rz: 0.20, z: -0.01, n: 2.2 },
    { y: 0.20, rx: 0.26, rz: 0.26, z: 0.0, n: 2.2 },
    { y: 0.36, rx: 0.22, rz: 0.21, z: 0.02, n: 2.2 },
    { y: 0.52, rx: 0.24, rz: 0.23, z: 0.05, n: 2.1 },
    { y: 0.66, rx: 0.16, rz: 0.16, z: 0.04, n: 2.0 }
  ]);
  const belly = verticalContourLoft([
    { y: 0.12, rx: 0.14, rz: 0.07, z: 0.20, n: 2.2 },
    { y: 0.26, rx: 0.16, rz: 0.08, z: 0.23, n: 2.2 },
    { y: 0.38, rx: 0.11, rz: 0.06, z: 0.21, n: 2.1 }
  ]);
  // Left ear tall & upright; right ear charmingly cocked at the tip
  const leftEarOuter = transformMesh(
    tubeSweepMesh(
      [
        [-0.095, 0.63, 0.02, 0.052],
        [-0.115, 0.80, 0.01, 0.068],
        [-0.12, 0.96, 0.02, 0.052],
        [-0.115, 1.04, 0.03, 0.022]
      ],
      14,
      false
    ),
    { scale: [1, 1, 0.58] }
  );
  const leftEarInner = transformMesh(
    tubeSweepMesh(
      [
        [-0.095, 0.66, 0.048, 0.028],
        [-0.115, 0.82, 0.044, 0.038],
        [-0.118, 0.96, 0.048, 0.024]
      ],
      12,
      false
    ),
    { scale: [1, 1, 0.42] }
  );
  const rightEarOuter = transformMesh(
    tubeSweepMesh(
      [
        [0.095, 0.63, 0.02, 0.052],
        [0.125, 0.79, 0.01, 0.068],
        [0.165, 0.91, 0.05, 0.054],
        [0.21, 0.95, 0.10, 0.024]
      ],
      14,
      false
    ),
    { scale: [1, 1, 0.58] }
  );
  const rightEarInner = transformMesh(
    tubeSweepMesh(
      [
        [0.095, 0.66, 0.048, 0.028],
        [0.125, 0.80, 0.044, 0.038],
        [0.165, 0.90, 0.075, 0.024]
      ],
      12,
      false
    ),
    { scale: [1, 1, 0.42] }
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 2, mesh: belly },
    { materialIndex: 0, mesh: leftEarOuter },
    { materialIndex: 1, mesh: leftEarInner },
    { materialIndex: 0, mesh: rightEarOuter },
    { materialIndex: 1, mesh: rightEarInner },
    // Fluffy cottonball tail
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.092, 2, 0.02, 67, 0.35), { pos: [0, 0.18, -0.25] }) },
    // Whisker muzzle puffs & pink button nose
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.058, 1, 0, 71, 0.2), { pos: [-0.048, 0.49, 0.245], scale: [1.1, 0.85, 0.8] }) },
    { materialIndex: 0, mesh: transformMesh(icosphereSmoothMesh(0.058, 1, 0, 73, 0.2), { pos: [0.048, 0.49, 0.245], scale: [1.1, 0.85, 0.8] }) },
    { materialIndex: 1, mesh: transformMesh(icosphereSmoothMesh(0.030, 1, 0, 79, 0), { pos: [0, 0.525, 0.285], scale: [1.2, 0.88, 0.85] }) }
  ];
  appendMammalLimbs(slots, 0, 1);
  appendExpressiveEyes(slots, {
    x: 0.115,
    y: 0.56,
    z: 0.225,
    radius: 0.062,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: 1
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.bunnyCloudPlush,
      CROSS_HOP_PROCEDURAL_MATERIALS.sakuraPinkSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function makeHexagonRing(r: number): V2[] {
  const pts: V2[] = [];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return pts;
}

function buildTurtleRecipe(): CritterAssemblyRecipe {
  // 0: jade carapace, 1: amber scutes & rim, 2: sage turtle skin, 3: cream plastron, 4: sclera, 5: pupil, 6: catchlight
  const dome = verticalContourLoft([
    { y: 0.12, rx: 0.33, rz: 0.36, z: -0.05, n: 2.3 },
    { y: 0.23, rx: 0.32, rz: 0.35, z: -0.05, n: 2.2 },
    { y: 0.36, rx: 0.26, rz: 0.29, z: -0.05, n: 2.1 },
    { y: 0.45, rx: 0.14, rz: 0.16, z: -0.05, n: 2.0 }
  ]);
  const shellRim = transformMesh(
    latheMesh(
      [
        [0.28, 0.10],
        [0.355, 0.105],
        [0.365, 0.155],
        [0.31, 0.165],
        [0.28, 0.10]
      ],
      24,
      false
    ),
    { pos: [0, 0, -0.05], scale: [1, 1, 1.08] }
  );
  const plastron = verticalContourLoft([
    { y: 0.065, rx: 0.26, rz: 0.29, z: -0.04, n: 2.4 },
    { y: 0.115, rx: 0.30, rz: 0.33, z: -0.04, n: 2.4 }
  ]);
  const neckAndHead = tubeSweepMesh(
    [
      [0, 0.16, 0.18, 0.088],
      [0, 0.26, 0.30, 0.084],
      [0, 0.36, 0.37, 0.125],
      [0, 0.39, 0.43, 0.092]
    ],
    16,
    false
  );
  const tail = tubeSweepMesh(
    [
      [0, 0.13, -0.36, 0.048],
      [0, 0.11, -0.47, 0.020]
    ],
    10,
    false
  );
  const scuteHex = extrudePolygonMesh(makeHexagonRing(0.095), 0.026, 0.008, false);
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: dome },
    { materialIndex: 1, mesh: shellRim },
    { materialIndex: 3, mesh: plastron },
    { materialIndex: 2, mesh: neckAndHead },
    { materialIndex: 2, mesh: tail },
    // Crown & lateral hexagonal tortoise scute pattern
    { materialIndex: 1, mesh: transformMesh(scuteHex, { pos: [0, 0.445, -0.05], rot: [-Math.PI / 2, 0, 0] }) },
    { materialIndex: 1, mesh: transformMesh(scuteHex, { pos: [0, 0.39, 0.12], rot: [-Math.PI / 2 + 0.46, 0, 0], scale: 0.88 }) },
    { materialIndex: 1, mesh: transformMesh(scuteHex, { pos: [0, 0.39, -0.22], rot: [-Math.PI / 2 - 0.46, 0, 0], scale: 0.88 }) }
  ];
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 1,
      mesh: transformMesh(scuteHex, { pos: [sgn * 0.17, 0.38, -0.05], rot: [-Math.PI / 2, 0, -sgn * 0.52], scale: 0.88 })
    });
    // Front & hind splayed tortoise legs grounded cleanly on y = 0
    for (const [lx, lz] of [
      [0.24, 0.17],
      [0.23, -0.22]
    ] as const) {
      slots.push(
        {
          materialIndex: 2,
          mesh: tubeSweepMesh(
            [
              [sgn * (lx - 0.05), 0.13, lz * 0.85, 0.068],
              [sgn * lx, 0.038, lz, 0.058]
            ],
            12,
            false
          )
        },
        {
          materialIndex: 2,
          mesh: transformMesh(icosphereSmoothMesh(0.062, 1, 0, 83, 0.15), {
            pos: [sgn * lx, 0.028, lz + 0.025],
            scale: [1.05, 0.48, 1.25]
          })
        }
      );
    }
  }
  appendExpressiveEyes(slots, {
    x: 0.088,
    y: 0.41,
    z: 0.45,
    radius: 0.052,
    scleraMat: 4,
    pupilMat: 5,
    catchlightMat: 6
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.turtleJadeShell,
      CROSS_HOP_PROCEDURAL_MATERIALS.turtleScuteAmber,
      CROSS_HOP_PROCEDURAL_MATERIALS.turtleSageSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function buildAxolotlRecipe(): CritterAssemblyRecipe {
  // 0: pastel sakura skin, 1: coral external gills & tail fin, 2: cream belly, 3: sclera, 4: pupil, 5: catchlight
  const body = verticalContourLoft([
    { y: 0.07, rx: 0.18, rz: 0.22, z: -0.02, n: 2.2 },
    { y: 0.20, rx: 0.24, rz: 0.26, z: 0.0, n: 2.2 },
    { y: 0.36, rx: 0.23, rz: 0.24, z: 0.03, n: 2.2 },
    { y: 0.52, rx: 0.27, rz: 0.23, z: 0.06, n: 2.1 },
    { y: 0.64, rx: 0.18, rz: 0.15, z: 0.05, n: 2.0 }
  ]);
  const belly = verticalContourLoft([
    { y: 0.12, rx: 0.14, rz: 0.08, z: 0.20, n: 2.2 },
    { y: 0.28, rx: 0.16, rz: 0.09, z: 0.23, n: 2.2 },
    { y: 0.42, rx: 0.12, rz: 0.07, z: 0.22, n: 2.1 }
  ]);
  const tailCore = tubeSweepMesh(
    [
      [0, 0.14, -0.18, 0.095],
      [0, 0.13, -0.36, 0.065],
      [0, 0.15, -0.54, 0.025]
    ],
    12,
    false
  );
  const tailFinPoly: V2[] = [
    [0.0, 0.06],
    [-0.18, 0.13],
    [-0.42, 0.11],
    [-0.48, 0.02],
    [-0.38, -0.05],
    [-0.14, -0.04]
  ];
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 2, mesh: belly },
    { materialIndex: 0, mesh: tailCore },
    {
      materialIndex: 1,
      mesh: transformMesh(extrudePolygonMesh(tailFinPoly, 0.026, 0.008, false), {
        pos: [0, 0.14, -0.14],
        rot: [0, Math.PI / 2, 0]
      })
    }
  ];
  // 3 feathery coral external gill stalks per side fanning out from head temples
  for (const sgn of [-1, 1] as const) {
    for (const [gy, dy, dx] of [
      [0.60, 0.10, 0.15],
      [0.54, 0.03, 0.18],
      [0.48, -0.03, 0.15]
    ] as const) {
      const x0 = sgn * 0.22;
      const x1 = sgn * (0.22 + dx);
      slots.push(
        {
          materialIndex: 1,
          mesh: tubeSweepMesh(
            [
              [x0, gy, 0.03, 0.028],
              [(x0 + x1) * 0.5, gy + dy * 0.6, 0.01, 0.024],
              [x1, gy + dy, -0.02, 0.012]
            ],
            10,
            false
          )
        },
        // Feathery gill filament buds along stalk
        {
          materialIndex: 1,
          mesh: transformMesh(icosphereSmoothMesh(0.024, 1, 0, 89, 0.2), {
            pos: [(x0 + x1) * 0.62, gy + dy * 0.72 + 0.022, 0.0],
            scale: [1.1, 1.3, 0.6]
          })
        },
        {
          materialIndex: 1,
          mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0, 97, 0.2), {
            pos: [x1 * 0.92, gy + dy + 0.018, -0.015],
            scale: [1.1, 1.3, 0.6]
          })
        }
      );
    }
    // Cute salamander hind & fore feet on y = 0
    slots.push(
      {
        materialIndex: 0,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.16, 0.16, -0.02, 0.058],
            [sgn * 0.20, 0.032, 0.06, 0.048]
          ],
          10,
          false
        )
      },
      {
        materialIndex: 0,
        mesh: transformMesh(icosphereSmoothMesh(0.052, 1, 0, 101, 0.15), {
          pos: [sgn * 0.20, 0.024, 0.10],
          scale: [1.05, 0.46, 1.35]
        })
      },
      {
        materialIndex: 0,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.16, 0.30, 0.12, 0.044],
            [sgn * 0.21, 0.22, 0.20, 0.036]
          ],
          10,
          false
        )
      }
    );
  }
  appendExpressiveEyes(slots, {
    x: 0.135,
    y: 0.55,
    z: 0.24,
    radius: 0.058,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: 1
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.sakuraPinkSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.axolotlCoralGill,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function makeToastSlicePoly(scale: number): V2[] {
  const s = scale;
  return [
    [-0.26 * s, -0.25 * s],
    [0.26 * s, -0.25 * s],
    [0.28 * s, 0.06 * s],
    [0.31 * s, 0.16 * s],
    [0.24 * s, 0.26 * s],
    [0.10 * s, 0.28 * s],
    [0.0 * s, 0.24 * s],
    [-0.10 * s, 0.28 * s],
    [-0.24 * s, 0.26 * s],
    [-0.31 * s, 0.16 * s],
    [-0.28 * s, 0.06 * s]
  ];
}

function buildToastCatRecipe(): CritterAssemblyRecipe {
  // 0: ginger cat plush, 1: golden baked toast crust, 2: warm toasted crumb, 3: butter pat, 4: pink nose/inner-ear/pads, 5: sclera, 6: pupil, 7: catchlight
  const body = verticalContourLoft([
    { y: 0.06, rx: 0.19, rz: 0.21, z: -0.04, n: 2.2 },
    { y: 0.20, rx: 0.24, rz: 0.25, z: -0.02, n: 2.2 },
    { y: 0.35, rx: 0.20, rz: 0.20, z: 0.02, n: 2.2 },
    { y: 0.50, rx: 0.19, rz: 0.18, z: 0.06, n: 2.1 }
  ]);
  const headSphere = transformMesh(icosphereSmoothMesh(0.185, 2, 0, 103, 0.15), {
    pos: [0, 0.52, 0.10],
    scale: [1.05, 0.96, 0.92]
  });
  const crustSlice = transformMesh(extrudePolygonMesh(makeToastSlicePoly(1.0), 0.11, 0.024, false), {
    pos: [0, 0.53, 0.12]
  });
  const crumbSlice = transformMesh(extrudePolygonMesh(makeToastSlicePoly(0.84), 0.125, 0.014, false), {
    pos: [0, 0.53, 0.12]
  });
  const butterPat = transformMesh(chamferBox([0.13, 0.036, 0.11], 0.01), {
    pos: [0.03, 0.80, 0.12],
    rot: [0.08, 0.32, -0.06]
  });
  const catTail = tubeSweepMesh(
    [
      [0, 0.15, -0.22, 0.045],
      [0, 0.26, -0.35, 0.040],
      [0.05, 0.44, -0.38, 0.036],
      [0.09, 0.56, -0.32, 0.026]
    ],
    14,
    false
  );
  const earOuter: V2[] = [
    [-0.075, 0],
    [0.075, 0],
    [0.0, 0.145]
  ];
  const earInner: V2[] = [
    [-0.042, 0.015],
    [0.042, 0.015],
    [0.0, 0.105]
  ];
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: body },
    { materialIndex: 0, mesh: headSphere },
    { materialIndex: 1, mesh: crustSlice },
    { materialIndex: 2, mesh: crumbSlice },
    { materialIndex: 3, mesh: butterPat },
    { materialIndex: 0, mesh: catTail },
    // Whisker muzzle puffs & pink cat nose poking cleanly through the toast slice
    { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.048, 1, 0, 107, 0.15), { pos: [-0.042, 0.47, 0.255], scale: [1.1, 0.82, 0.7] }) },
    { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.048, 1, 0, 109, 0.15), { pos: [0.042, 0.47, 0.255], scale: [1.1, 0.82, 0.7] }) },
    { materialIndex: 4, mesh: transformMesh(icosphereSmoothMesh(0.024, 1, 0, 113, 0), { pos: [0, 0.495, 0.285], scale: [1.2, 0.85, 0.75] }) }
  ];
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: 0,
        mesh: transformMesh(extrudePolygonMesh(earOuter, 0.048, 0.01, false), {
          pos: [sgn * 0.165, 0.74, 0.10],
          rot: [0, 0, -sgn * 0.20]
        })
      },
      {
        materialIndex: 4,
        mesh: transformMesh(extrudePolygonMesh(earInner, 0.054, 0.006, false), {
          pos: [sgn * 0.165, 0.74, 0.105],
          rot: [0, 0, -sgn * 0.20]
        })
      }
    );
  }
  appendMammalLimbs(slots, 0, 4);
  appendExpressiveEyes(slots, {
    x: 0.10,
    y: 0.555,
    z: 0.245,
    radius: 0.055,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7,
    blushMat: 4
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.gingerCatPlush,
      CROSS_HOP_PROCEDURAL_MATERIALS.toastGoldenCrust,
      CROSS_HOP_PROCEDURAL_MATERIALS.toastWarmCrumb,
      CROSS_HOP_PROCEDURAL_MATERIALS.toastButterPat,
      CROSS_HOP_PROCEDURAL_MATERIALS.sakuraPinkSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function buildRoboFrogRecipe(): CritterAssemblyRecipe {
  // 0: titanium hull, 1: gunmetal servo joints, 2: practical cyan LED visor, 3: brushed steel belly/pistons, 4: white glint
  const chassis = verticalContourLoft([
    { y: 0.08, rx: 0.22, rz: 0.21, z: -0.01, n: 2.8 },
    { y: 0.22, rx: 0.29, rz: 0.27, z: 0.01, n: 3.0 },
    { y: 0.39, rx: 0.28, rz: 0.26, z: 0.04, n: 3.0 },
    { y: 0.55, rx: 0.25, rz: 0.23, z: 0.06, n: 2.8 },
    { y: 0.64, rx: 0.17, rz: 0.16, z: 0.04, n: 2.6 }
  ]);
  const chestPlate = transformMesh(chamferBox([0.30, 0.24, 0.08], 0.022), {
    pos: [0, 0.27, 0.24],
    rot: [-0.08, 0, 0]
  });
  const chestCore = transformMesh(icosphereSmoothMesh(0.048, 1, 0, 127, 0), {
    pos: [0, 0.28, 0.275],
    scale: [1.2, 0.9, 0.45]
  });
  // Wrap-around recessed gunmetal visor housing + glowing cyan LED visor strip
  const visorHousing = superellipseLoft(
    [
      { z: 0.16, rx: 0.235, ry: 0.078, y: 0.51, superellipseN: 3.2 },
      { z: 0.295, rx: 0.205, ry: 0.068, y: 0.51, superellipseN: 3.2 }
    ],
    20,
    true,
    false
  );
  const visorGlow = superellipseLoft(
    [
      { z: 0.22, rx: 0.19, ry: 0.048, y: 0.51, superellipseN: 3.2 },
      { z: 0.312, rx: 0.17, ry: 0.042, y: 0.51, superellipseN: 3.2 }
    ],
    18,
    true,
    false
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: chassis },
    { materialIndex: 3, mesh: chestPlate },
    { materialIndex: 2, mesh: chestCore },
    { materialIndex: 1, mesh: visorHousing },
    { materialIndex: 2, mesh: visorGlow }
  ];
  for (const sgn of [-1, 1] as const) {
    // Twin roof telemetry antennae + glowing cyan tips + specular visor glints + rear exhaust pods
    slots.push(
      {
        materialIndex: 3,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.11, 0.62, 0.02, 0.022],
            [sgn * 0.15, 0.77, -0.03, 0.012]
          ],
          10,
          false
        )
      },
      { materialIndex: 2, mesh: transformMesh(icosphereSmoothMesh(0.026, 1, 0, 131, 0), { pos: [sgn * 0.15, 0.78, -0.03] }) },
      { materialIndex: 4, mesh: transformMesh(icosphereSmoothMesh(0.018, 1, 0, 137, 0), { pos: [sgn * 0.095, 0.525, 0.315] }) },
      {
        materialIndex: 1,
        mesh: transformMesh(
          latheMesh([[0.03, -0.04], [0.065, -0.04], [0.072, 0.04], [0.03, 0.04], [0.03, -0.04]], 14, false),
          { pos: [sgn * 0.12, 0.34, -0.23], rot: [Math.PI / 2, 0, 0] }
        )
      }
    );
  }
  appendFrogLimbs(slots, 1, 3, 1.04);
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.roboTitaniumHull,
      CROSS_HOP_PROCEDURAL_MATERIALS.roboGunmetalJoint,
      CROSS_HOP_PROCEDURAL_MATERIALS.roboCyanVisor,
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function buildKnightToadRecipe(): CritterAssemblyRecipe {
  // 0: polished steel armor, 1: toad sage skin, 2: crimson plume, 3: heraldic blue shield, 4: gold trim, 5: sclera, 6: pupil, 7: catchlight
  const cuirass = verticalContourLoft([
    { y: 0.11, rx: 0.22, rz: 0.21, z: 0.0, n: 2.5 },
    { y: 0.25, rx: 0.29, rz: 0.26, z: 0.01, n: 2.6 },
    { y: 0.42, rx: 0.27, rz: 0.24, z: 0.02, n: 2.6 },
    { y: 0.49, rx: 0.20, rz: 0.19, z: 0.02, n: 2.4 }
  ]);
  const toadHead = transformMesh(icosphereSmoothMesh(0.21, 2, 0, 139, 0.18), {
    pos: [0, 0.54, 0.05],
    scale: [1.08, 0.88, 1.04]
  });
  // Domed steel sallet helm with raised golden brow band
  const steelHelm = transformMesh(
    latheMesh(
      [
        [0.225, 0.55],
        [0.238, 0.60],
        [0.215, 0.70],
        [0.145, 0.78],
        [0.0, 0.81]
      ],
      24,
      false
    ),
    { pos: [0, 0, 0.03], rot: [-0.08, 0, 0] }
  );
  const helmTrim = transformMesh(
    latheMesh(
      [
        [0.22, 0.545],
        [0.244, 0.555],
        [0.244, 0.585],
        [0.22, 0.595],
        [0.22, 0.545]
      ],
      24,
      false
    ),
    { pos: [0, 0, 0.03], rot: [-0.08, 0, 0] }
  );
  // Sweeping crimson horsehair plume crest
  const plume = tubeSweepMesh(
    [
      [0, 0.79, 0.04, 0.038],
      [0, 0.90, -0.04, 0.068],
      [0, 0.88, -0.19, 0.064],
      [0, 0.74, -0.31, 0.042],
      [0, 0.60, -0.35, 0.018]
    ],
    14,
    false
  );
  // Mini heater shield on left arm + golden shield boss
  const shieldPoly: V2[] = [
    [-0.13, 0.16],
    [0.13, 0.16],
    [0.14, 0.01],
    [0.09, -0.12],
    [0.0, -0.20],
    [-0.09, -0.12],
    [-0.14, 0.01]
  ];
  const shieldBody = transformMesh(extrudePolygonMesh(shieldPoly, 0.034, 0.01, false), {
    pos: [-0.29, 0.31, 0.11],
    rot: [0, -Math.PI / 2 + 0.35, 0.08]
  });
  const shieldRim = transformMesh(extrudePolygonMesh(shieldPoly, 0.022, 0.006, false), {
    pos: [-0.285, 0.31, 0.11],
    rot: [0, -Math.PI / 2 + 0.35, 0.08],
    scale: [1.10, 1.08, 1]
  });
  const shieldBoss = transformMesh(icosphereSmoothMesh(0.045, 1, 0, 149, 0), {
    pos: [-0.315, 0.32, 0.12],
    scale: [0.55, 1, 1]
  });
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: cuirass },
    { materialIndex: 1, mesh: toadHead },
    { materialIndex: 0, mesh: steelHelm },
    { materialIndex: 4, mesh: helmTrim },
    { materialIndex: 2, mesh: plume },
    { materialIndex: 4, mesh: shieldRim },
    { materialIndex: 3, mesh: shieldBody },
    { materialIndex: 4, mesh: shieldBoss },
    // Sword pommel at right hip
    {
      materialIndex: 4,
      mesh: tubeSweepMesh(
        [
          [0.28, 0.24, -0.08, 0.022],
          [0.31, 0.36, 0.06, 0.024]
        ],
        10,
        false
      )
    },
    { materialIndex: 4, mesh: transformMesh(chamferBox([0.03, 0.14, 0.03], 0.008), { pos: [0.295, 0.30, -0.01], rot: [0.65, 0, 0] }) }
  ];
  // Shoulder pauldrons
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 0,
      mesh: transformMesh(icosphereSmoothMesh(0.095, 1, 0, 151, 0.15), {
        pos: [sgn * 0.25, 0.42, 0.03],
        scale: [1.05, 0.78, 1.1]
      })
    });
  }
  appendBootedLegs(slots, 1, 0, 0);
  appendExpressiveEyes(slots, {
    x: 0.115,
    y: 0.535,
    z: 0.235,
    radius: 0.054,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.knightPolishedSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.turtleSageSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.knightCrimsonPlume,
      CROSS_HOP_PROCEDURAL_MATERIALS.knightHeraldicBlue,
      CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ]
  };
}

function buildMushroomKidRecipe(): CritterAssemblyRecipe {
  // 0: scarlet toadstool cap, 1: cream stem body & white polka spots, 2: russet woodland boots, 3: sclera, 4: pupil, 5: catchlight, 6: blush
  const stemBody = verticalContourLoft([
    { y: 0.10, rx: 0.18, rz: 0.18, z: 0.0, n: 2.1 },
    { y: 0.24, rx: 0.23, rz: 0.22, z: 0.01, n: 2.1 },
    { y: 0.40, rx: 0.20, rz: 0.20, z: 0.02, n: 2.1 },
    { y: 0.54, rx: 0.21, rz: 0.21, z: 0.03, n: 2.1 }
  ]);
  const capRed = latheMesh(
    [
      [0.19, 0.52],
      [0.39, 0.50],
      [0.42, 0.55],
      [0.37, 0.68],
      [0.24, 0.80],
      [0.09, 0.86],
      [0.0, 0.87]
    ],
    28,
    false
  );
  const capGills = latheMesh(
    [
      [0.18, 0.52],
      [0.38, 0.50],
      [0.19, 0.48],
      [0.18, 0.52]
    ],
    24,
    false
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 1, mesh: stemBody },
    { materialIndex: 0, mesh: transformMesh(capRed, { pos: [0, 0, 0.01], rot: [-0.06, 0, 0] }) },
    { materialIndex: 1, mesh: transformMesh(capGills, { pos: [0, 0, 0.01], rot: [-0.06, 0, 0] }) },
    // Crown white toadstool wart spot
    { materialIndex: 1, mesh: transformMesh(icosphereSmoothMesh(0.068, 1, 0, 157, 0.1), { pos: [0, 0.855, 0.0], scale: [1.15, 0.45, 1.15] }) }
  ];
  // Ring of 7 raised white polka-dot spots around the scarlet cap dome
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + 0.25;
    const rad = i % 2 === 0 ? 0.28 : 0.22;
    const ySpot = i % 2 === 0 ? 0.67 : 0.75;
    slots.push({
      materialIndex: 1,
      mesh: transformMesh(icosphereSmoothMesh(0.056, 1, 0, 163 + i, 0.1), {
        pos: [Math.cos(a) * rad, ySpot, Math.sin(a) * rad + 0.01],
        rot: [Math.sin(a) * 0.55, 0, -Math.cos(a) * 0.55],
        scale: [1.1, 0.42, 1.1]
      })
    });
  }
  // Cute stubby cream arms
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 1,
      mesh: tubeSweepMesh(
        [
          [sgn * 0.19, 0.34, 0.02, 0.050],
          [sgn * 0.27, 0.25, 0.08, 0.044]
        ],
        10,
        false
      )
    });
  }
  appendBootedLegs(slots, 1, 2, 2);
  appendExpressiveEyes(slots, {
    x: 0.095,
    y: 0.42,
    z: 0.215,
    radius: 0.054,
    scleraMat: 3,
    pupilMat: 4,
    catchlightMat: 5,
    blushMat: 6
  });
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.mushroomScarletCap,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
      CROSS_HOP_PROCEDURAL_MATERIALS.woodlandBootLeather,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush
    ]
  };
}

function buildAstroFrogRecipe(): CritterAssemblyRecipe {
  // 0: EVA white suit, 1: NASA orange collar/cuffs, 2: emerald frog head inside bubble, 3: steel pack/nozzles,
  // 4: practical thruster glow, 5: sclera, 6: pupil, 7: catchlight + transparent glass bubble helmet
  const evaSuit = verticalContourLoft([
    { y: 0.11, rx: 0.21, rz: 0.20, z: 0.0, n: 2.3 },
    { y: 0.25, rx: 0.26, rz: 0.24, z: 0.01, n: 2.4 },
    { y: 0.42, rx: 0.24, rz: 0.22, z: 0.02, n: 2.4 },
    { y: 0.50, rx: 0.19, rz: 0.18, z: 0.02, n: 2.2 }
  ]);
  const neckRing = latheMesh(
    [
      [0.175, 0.48],
      [0.235, 0.49],
      [0.235, 0.53],
      [0.185, 0.54],
      [0.175, 0.48]
    ],
    24,
    false
  );
  const frogHead = transformMesh(icosphereSmoothMesh(0.165, 2, 0, 173, 0.14), {
    pos: [0, 0.65, 0.03],
    scale: [1.05, 0.94, 1.0]
  });
  const chestModule = transformMesh(chamferBox([0.19, 0.14, 0.06], 0.016), {
    pos: [0, 0.34, 0.23]
  });
  const jetpack = transformMesh(chamferBox([0.28, 0.30, 0.15], 0.028), {
    pos: [0, 0.36, -0.23]
  });
  const sunShield = latheMesh(
    [
      [0.225, 0.74],
      [0.238, 0.76],
      [0.18, 0.85],
      [0.0, 0.89]
    ],
    22,
    false
  );
  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: evaSuit },
    { materialIndex: 1, mesh: neckRing },
    { materialIndex: 2, mesh: frogHead },
    { materialIndex: 3, mesh: chestModule },
    { materialIndex: 1, mesh: transformMesh(chamferBox([0.06, 0.04, 0.02], 0.006), { pos: [-0.04, 0.35, 0.262] }) },
    { materialIndex: 4, mesh: transformMesh(chamferBox([0.05, 0.04, 0.02], 0.006), { pos: [0.045, 0.35, 0.262] }) },
    { materialIndex: 0, mesh: jetpack },
    { materialIndex: 0, mesh: sunShield },
    // Helmet comms antenna + beacon tip
    {
      materialIndex: 3,
      mesh: tubeSweepMesh(
        [
          [0.14, 0.82, -0.02, 0.016],
          [0.18, 0.95, -0.05, 0.009]
        ],
        8,
        false
      )
    },
    { materialIndex: 4, mesh: transformMesh(icosphereSmoothMesh(0.022, 1, 0, 179, 0), { pos: [0.18, 0.96, -0.05] }) }
  ];
  for (const sgn of [-1, 1] as const) {
    // EVA spacesuit arms + orange wrist rings + twin jetpack bell nozzles & thruster cores
    slots.push(
      {
        materialIndex: 0,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.22, 0.40, 0.02, 0.056],
            [sgn * 0.28, 0.29, 0.11, 0.050]
          ],
          10,
          false
        )
      },
      {
        materialIndex: 1,
        mesh: transformMesh(icosphereSmoothMesh(0.052, 1, 0, 181, 0.1), {
          pos: [sgn * 0.285, 0.27, 0.13]
        })
      },
      {
        materialIndex: 3,
        mesh: transformMesh(
          latheMesh([[0.03, 0.08], [0.055, 0.08], [0.078, 0.0], [0.068, 0.0], [0.03, 0.08]], 16, false),
          { pos: [sgn * 0.085, 0.15, -0.24] }
        )
      },
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.042, 1, 0, 191, 0), {
          pos: [sgn * 0.085, 0.16, -0.24],
          scale: [1, 0.55, 1]
        })
      }
    );
  }
  appendBootedLegs(slots, 0, 0, 1);
  appendExpressiveEyes(slots, {
    x: 0.082,
    y: 0.68,
    z: 0.155,
    radius: 0.048,
    turretMat: 2,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7
  });
  const bubbleDome = latheMesh(
    [
      [0.215, 0.52],
      [0.248, 0.63],
      [0.242, 0.74],
      [0.165, 0.84],
      [0.0, 0.88]
    ],
    26,
    false
  );
  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.astroEvaWhite,
      CROSS_HOP_PROCEDURAL_MATERIALS.astroCollarOrange,
      CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.rescueCoreGlow,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight
    ],
    glassMeshes: [bubbleDome],
    glassMaterial: CROSS_HOP_PROCEDURAL_MATERIALS.astroBubbleGlass
  };
}

function buildCritterRecipe(id: CritterAssetId): CritterAssemblyRecipe {
  switch (id) {
    case "hop":
      return buildFrogHeroRecipe(
        CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin,
        CROSS_HOP_PROCEDURAL_MATERIALS.frogLeafSpot,
        CROSS_HOP_PROCEDURAL_MATERIALS.critterCreamBelly,
        false
      );
    case "goldenHop":
      return buildFrogHeroRecipe(
        CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold,
        CROSS_HOP_PROCEDURAL_MATERIALS.champagneGoldTrim,
        CROSS_HOP_PROCEDURAL_MATERIALS.champagneGoldTrim,
        true
      );
    case "ducky":
      return buildDuckyRecipe();
    case "chick":
      return buildChickRecipe();
    case "bun":
      return buildBunRecipe();
    case "turtle":
      return buildTurtleRecipe();
    case "axolotl":
      return buildAxolotlRecipe();
    case "toastCat":
      return buildToastCatRecipe();
    case "roboFrog":
      return buildRoboFrogRecipe();
    case "knightToad":
      return buildKnightToadRecipe();
    case "mushroomKid":
      return buildMushroomKidRecipe();
    case "astroFrog":
      return buildAstroFrogRecipe();
  }
}

interface CachedCritterGeometry {
  readonly bodySpec: AuraCustomGeometrySpec;
  readonly materials: readonly AuraMaterialSpec[];
  readonly glassSpec?: AuraCustomGeometrySpec;
  readonly glassMaterial?: AuraMaterialSpec;
  readonly bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
  readonly vertexCount: number;
  readonly materialGroupCount: number;
}

const critterGeometryCache = new Map<string, CachedCritterGeometry>();

function getFittedCritterGeometry(id: CritterAssetId, targetHeight: number): CachedCritterGeometry {
  const key = `${id}:${targetHeight.toFixed(4)}`;
  const cached = critterGeometryCache.get(key);
  if (cached) return cached;

  const recipe = buildCritterRecipe(id);
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  const scan = (mesh: RawMesh): void => {
    const pos = mesh.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]!, y = pos[i + 1]!, z = pos[i + 2]!;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }
  };
  for (const s of recipe.slots) scan(s.mesh);
  if (recipe.glassMeshes) for (const g of recipe.glassMeshes) scan(g);

  const spanY = Math.max(1e-4, maxY - minY);
  const scale = targetHeight / spanY;
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const tx = -cx * scale;
  const ty = -minY * scale;
  const tz = -cz * scale;

  const fittedSlots: MultiMatSlot[] = recipe.slots.map((s) => ({
    materialIndex: s.materialIndex,
    mesh: transformMesh(s.mesh, { scale, pos: [tx, ty, tz] })
  }));
  const bodySpec = buildGroupedGeometrySpec(fittedSlots);
  const glassSpec = recipe.glassMeshes && recipe.glassMeshes.length > 0
    ? mergeRawMeshes(recipe.glassMeshes.map((g) => transformMesh(g, { scale, pos: [tx, ty, tz] })))
    : undefined;

  const entry: CachedCritterGeometry = {
    bodySpec,
    materials: recipe.materials,
    glassSpec,
    glassMaterial: recipe.glassMaterial,
    bounds: {
      min: [(minX - cx) * scale, 0, (minZ - cz) * scale],
      max: [(maxX - cx) * scale, targetHeight, (maxZ - cz) * scale]
    },
    vertexCount: bodySpec.positions.length / 3 + (glassSpec ? glassSpec.positions.length / 3 : 0),
    materialGroupCount: (bodySpec.groups?.length ?? 1) + (glassSpec ? 1 : 0)
  };
  critterGeometryCache.set(key, entry);
  return entry;
}

export interface ProceduralCritterOptions {
  readonly name: string;
  readonly targetHeight?: number;
  readonly castShadow?: boolean;
  readonly receiveShadow?: boolean;
}

/**
 * Inspects exact fitted bounds (`minY === 0`), vertex count, and multi-material group count
 * for any of the 12 sculpted playable critters.
 */
export function inspectProceduralCritterBounds(id: CritterAssetId, targetHeight = 1.05) {
  const g = getFittedCritterGeometry(id, targetHeight);
  return {
    id,
    bounds: g.bounds,
    vertexCount: g.vertexCount,
    materialGroupCount: g.materialGroupCount
  };
}

/**
 * Builds a fresh multi-material `@aura3d/engine` scene node for any of the 12 playable Cross Hop critters,
 * facing `+Z`, centered on `X/Z`, and grounded cleanly at `minY = 0` (`maxY = targetHeight`).
 */
export function buildProceduralCritterNode(id: CritterAssetId, opts: ProceduralCritterOptions) {
  const targetHeight = opts.targetHeight ?? 1.05;
  const castShadow = opts.castShadow ?? true;
  const receiveShadow = opts.receiveShadow ?? true;
  const g = getFittedCritterGeometry(id, targetHeight);
  if (g.glassSpec && g.glassMaterial) {
    const bodyNode = geometry.multiMaterial(g.bodySpec, [...g.materials], {
      name: `${opts.name}-body`,
      castShadow,
      receiveShadow
    });
    const glassNode = geometry.custom(g.glassSpec, {
      name: `${opts.name}-helmet-glass`,
      material: g.glassMaterial,
      castShadow: false,
      receiveShadow: false
    });
    return group(opts.name, [bodyNode, glassNode]);
  }
  return geometry.multiMaterial(g.bodySpec, [...g.materials], {
    name: opts.name,
    castShadow,
    receiveShadow
  });
}
