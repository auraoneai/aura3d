/**
 * Cross Hop (WP-13 / WP-14) — Bespoke Multi-Material Procedural Critters, Fleet, River & Woodland Kit.
 *
 * Sculpted exclusively through `@aura3d/engine` + `showcase-port-shared/proceduralKernel` smooth-normal
 * primitives (`loftSectionsMesh`, `latheMesh`, `tubeSweepMesh`, `extrudePolygonMesh`,
 * `wheelAssemblySlots`, `icosphereSmoothMesh`, `icosphereFacetMesh`, `layeredCanopyMesh`,
 * `bevelBoxMesh`, `assembleMultiMaterialNode`) — zero Meshy `.glb` dependencies.
 */
import {
  game,
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
  sculptHumanoidLimbMesh,
  sculptStreamlinedHullMesh,
  subdivideSmoothMesh,
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
  // Sculpted playable critter physical materials (moist amphibian lacquer, matte belly clay, plush felt, 24k gold & practical LEDs)
  frogEmeraldSkin: material.lacquer({
    color: "#2eb85c",
    roughness: 0.25,
    clearcoat: 0.78,
    clearcoatRoughness: 0.12,
    envMapIntensity: 1.18
  }),
  frogLeafSpot: material.lacquer({
    color: "#1b6b34",
    roughness: 0.34,
    clearcoat: 0.54,
    clearcoatRoughness: 0.16,
    envMapIntensity: 1.02
  }),
  frogMintToePad: material.lacquer({
    color: "#63db73",
    roughness: 0.28,
    clearcoat: 0.66,
    clearcoatRoughness: 0.14,
    envMapIntensity: 1.1
  }),
  frogGoldenIris: material.lacquer({
    color: "#f4b632",
    roughness: 0.12,
    clearcoat: 0.96,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.34
  }),
  royalBurnishedGold: material.studioMetal({
    color: "#c88719",
    roughness: 0.22,
    metalness: 0.94,
    envMapIntensity: 1.38
  }),
  critterCreamBelly: material.matteClay({
    color: "#fcf4dc",
    roughness: 0.72,
    envMapIntensity: 0.9
  }),
  critterEyeSclera: material.ceramic({
    color: "#ffffff",
    roughness: 0.12,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.24
  }),
  critterEyePupil: material.lacquer({
    color: "#0d121d",
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.025,
    envMapIntensity: 1.4
  }),
  critterCatchlight: material.ceramic({
    color: "#ffffff",
    roughness: 0.04,
    clearcoat: 1,
    clearcoatRoughness: 0.02,
    envMapIntensity: 1.48
  }),
  critterRosyBlush: material.matteClay({
    color: "#ff7d9c",
    roughness: 0.68,
    envMapIntensity: 0.9
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

interface ColoredRawMesh extends Omit<RawMesh, "colors"> {
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
  const { colors: _unusedRawColors, ...geom } = mesh;
  void _unusedRawColors;
  return { ...geom, colors };
}

function transformColoredMesh(src: ColoredRawMesh, opts: Parameters<typeof transformMesh>[1]): ColoredRawMesh {
  const { colors: srcColors, ...rawSrc } = src;
  const { colors: _unusedOutColors, ...out } = transformMesh(rawSrc, opts);
  void _unusedOutColors;
  return srcColors ? { ...out, colors: srcColors } : out;
}

function placeTinted(src: RawMesh, opts: Parameters<typeof transformMesh>[1], rgb: Rgb): ColoredRawMesh {
  return tintRawMesh(transformMesh(src, opts), rgb);
}

/** Merges `RawMesh` parts while preserving per-vertex RGBA `colors` and precomputing `bounds`. */
function mergeColoredMeshesToSpec(parts: readonly ColoredRawMesh[]): AuraCustomGeometrySpec {
  const hasColors = parts.some((p) => p.colors !== undefined);
  if (!hasColors) {
    return mergeRawMeshes(parts.map(({ colors: _c, ...raw }) => { void _c; return raw; }));
  }

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
  const greenhouse = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        [[-W * 0.86, r.beltY - 0.01, r.cabinRearZ], [W * 0.86, r.beltY - 0.01, r.cabinRearZ], [roofHalfW, r.roofY - 0.02, rearRoofZ], [0, r.roofY + 0.018, rearRoofZ], [-roofHalfW, r.roofY - 0.02, rearRoofZ]],
        [[-W * 0.87, r.beltY - 0.01, (r.cabinFrontZ + r.cabinRearZ) * 0.5], [W * 0.87, r.beltY - 0.01, (r.cabinFrontZ + r.cabinRearZ) * 0.5], [roofHalfW, r.roofY - 0.01, (frontRoofZ + rearRoofZ) * 0.5], [0, r.roofY + 0.026, (frontRoofZ + rearRoofZ) * 0.5], [-roofHalfW, r.roofY - 0.01, (frontRoofZ + rearRoofZ) * 0.5]],
        [[-W * 0.85, r.beltY - 0.01, r.cabinFrontZ], [W * 0.85, r.beltY - 0.01, r.cabinFrontZ], [roofHalfW, r.roofY - 0.02, frontRoofZ], [0, r.roofY + 0.016, frontRoofZ], [-roofHalfW, r.roofY - 0.02, frontRoofZ]]
      ],
      true,
      false
    ),
    1,
    0.42
  );
  out.push(tintRawMesh(greenhouse, r.accent ?? r.paint));

  // Sloped recessed dark smoked windshield + wiper cowl bezel, rear backlight & framed side windows with B-pillar
  const wsDz = r.cabinFrontZ - frontRoofZ;
  const wsLen = Math.hypot(wsDz, cabH) * 0.86;
  const wsRake = Math.atan2(wsDz, cabH);
  const blDz = rearRoofZ - r.cabinRearZ;
  const blLen = Math.hypot(blDz, cabH) * 0.84;
  const blRake = -Math.atan2(blDz, cabH);
  out.push(
    placeTinted(chamferBox([roofHalfW * 1.78, wsLen + 0.032, 0.024], 0.008), { pos: [0, r.beltY + cabH * 0.50, (r.cabinFrontZ + frontRoofZ) * 0.5 + 0.008], rot: [-wsRake, 0, 0] }, COL_TRIM_DARK),
    placeTinted(chamferBox([roofHalfW * 1.66, wsLen - 0.018, 0.026], 0.008), { pos: [0, r.beltY + cabH * 0.50, (r.cabinFrontZ + frontRoofZ) * 0.5 + 0.016], rot: [-wsRake, 0, 0] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([roofHalfW * 1.66, 0.026, 0.046], 0.006), { pos: [0, r.beltY + 0.016, r.cabinFrontZ + 0.012] }, COL_TRIM_DARK),
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
      placeTinted(chamferBox([W * 0.36, 0.105, 0.048], 0.018), { pos: [sgn * W * 0.65, midY + 0.035, L + 0.002] }, COL_TRIM_DARK),
      placeTinted(chamferBox([W * 0.28, 0.078, 0.052], 0.016), { pos: [sgn * W * 0.65, midY + 0.035, L + 0.011] }, COL_HEADLIGHT),
      placeTinted(chamferBox([W * 0.10, 0.075, 0.055], 0.012), { pos: [sgn * W * 0.84, midY + 0.03, L - 0.004] }, COL_TURN_AMBER),
      placeTinted(chamferBox([W * 0.38, 0.102, 0.048], 0.018), { pos: [sgn * W * 0.62, tailY - 0.08, -L - 0.002] }, COL_TRIM_DARK),
      placeTinted(chamferBox([W * 0.34, 0.082, 0.052], 0.016), { pos: [sgn * W * 0.62, tailY - 0.08, -L - 0.010] }, COL_TAILLIGHT),
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
  const cabShell = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        [[-W * 0.86, beltY - 0.01, cabRearZ], [W * 0.86, beltY - 0.01, cabRearZ], [roofHalfW, roofY - 0.015, rearRoofZ], [0, roofY + 0.022, rearRoofZ], [-roofHalfW, roofY - 0.015, rearRoofZ]],
        [[-W * 0.87, beltY - 0.01, 0.16], [W * 0.87, beltY - 0.01, 0.16], [roofHalfW, roofY - 0.01, 0.13], [0, roofY + 0.026, 0.13], [-roofHalfW, roofY - 0.01, 0.13]],
        [[-W * 0.85, beltY - 0.01, cabFrontZ], [W * 0.85, beltY - 0.01, cabFrontZ], [roofHalfW, roofY - 0.015, frontRoofZ], [0, roofY + 0.018, frontRoofZ], [-roofHalfW, roofY - 0.015, frontRoofZ]]
      ],
      true,
      false
    ),
    1,
    0.42
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
    placeTinted(chamferBox([roofHalfW * 1.78, Math.hypot(cabFrontZ - frontRoofZ, cabH) * 0.88, 0.024], 0.008), { pos: [0, beltY + cabH * 0.50, (cabFrontZ + frontRoofZ) * 0.5 + 0.008], rot: [-wsRake, 0, 0] }, COL_TRIM_DARK),
    placeTinted(chamferBox([roofHalfW * 1.66, Math.hypot(cabFrontZ - frontRoofZ, cabH) * 0.82, 0.026], 0.008), { pos: [0, beltY + cabH * 0.50, (cabFrontZ + frontRoofZ) * 0.5 + 0.016], rot: [-wsRake, 0, 0] }, COL_CABIN_GLASS),
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
      placeTinted(chamferBox([0.19, 0.12, 0.048], 0.016), { pos: [sgn * W * 0.68, 0.35, L + 0.002] }, COL_TRIM_DARK),
      placeTinted(chamferBox([0.15, 0.092, 0.052], 0.014), { pos: [sgn * W * 0.68, 0.35, L + 0.011] }, COL_HEADLIGHT),
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

  const cabUpper = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        [[-0.49, 0.54, 0.56], [0.49, 0.54, 0.56], [0.46, 1.06, 0.60], [0, 1.09, 0.60], [-0.46, 1.06, 0.60]],
        [[-0.49, 0.54, 1.16], [0.49, 0.54, 1.16], [0.45, 1.05, 1.14], [0, 1.08, 1.14], [-0.45, 1.05, 1.14]],
        [[-0.47, 0.52, 1.60], [0.47, 0.52, 1.60], [0.43, 0.99, 1.44], [0, 1.01, 1.44], [-0.43, 0.99, 1.44]]
      ],
      true,
      false
    ),
    1,
    0.42
  );
  const cabDoorWin: V2[] = [
    [0.68, 0.61],
    [1.46, 0.58],
    [1.36, 0.95],
    [0.68, 0.97]
  ];
  out.push(
    tintRawMesh(cabUpper, cabPaint),
    // Sloped recessed dark smoked panoramic windshield + wiper bezel + framed cab door windows
    placeTinted(chamferBox([0.86, 0.45, 0.026], 0.008), { pos: [0, 0.79, 1.518], rot: [-0.32, 0, 0] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.80, 0.40, 0.028], 0.008), { pos: [0, 0.79, 1.528], rot: [-0.32, 0, 0] }, COL_CABIN_GLASS),
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
  // Aerodynamic Shinkansen/express bullet locomotive with smooth-subdivided fuselage, sculpted nose cone, recessed cab canopy & pantograph
  const fuselage = subdivideSmoothMesh(
    superellipseLoft(
      [
        { z: -2.42, rx: 0.52, ry: 0.52, y: 0.68, superellipseN: 3.8 },
        { z: 0.92, rx: 0.54, ry: 0.54, y: 0.70, superellipseN: 3.8 },
        { z: 1.66, rx: 0.50, ry: 0.44, y: 0.58, superellipseN: 3.0 },
        { z: 2.26, rx: 0.36, ry: 0.25, y: 0.38, superellipseN: 2.5 },
        { z: 2.66, rx: 0.14, ry: 0.10, y: 0.26, superellipseN: 2.1 }
      ],
      26,
      true,
      false
    ),
    1,
    0.46
  );
  const noseFairing = transformMesh(
    sculptStreamlinedHullMesh(1.36, 0.92, 0.42, {
      noseSharpness: 1.58,
      tailTaper: 1.35,
      canopyBulge: 0.12,
      undersideFlat: 0.08,
      stations: 18,
      ringPoints: 20
    }),
    { pos: [0, 0.36, 1.94] }
  );
  const driverCanopyBezel = superellipseLoft(
    [
      { z: 0.90, rx: 0.46, ry: 0.24, y: 0.98, superellipseN: 3.0 },
      { z: 1.50, rx: 0.43, ry: 0.21, y: 0.88, superellipseN: 2.8 },
      { z: 1.98, rx: 0.30, ry: 0.13, y: 0.70, superellipseN: 2.4 }
    ],
    22,
    true,
    false
  );
  const driverCanopy = subdivideSmoothMesh(
    superellipseLoft(
      [
        { z: 0.94, rx: 0.435, ry: 0.22, y: 0.99, superellipseN: 3.0 },
        { z: 1.48, rx: 0.405, ry: 0.195, y: 0.89, superellipseN: 2.8 },
        { z: 1.95, rx: 0.275, ry: 0.118, y: 0.71, superellipseN: 2.4 }
      ],
      22,
      true,
      false
    ),
    1,
    0.42
  );
  const pantoArm: V4[] = [
    [0, 1.25, -0.96, 0.022],
    [0, 1.44, -0.62, 0.018],
    [0, 1.58, -0.84, 0.016]
  ];
  out.push(
    tintRawMesh(fuselage, [0.97, 0.98, 1.0]),
    tintRawMesh(noseFairing, [0.96, 0.98, 1.0]),
    tintRawMesh(driverCanopyBezel, COL_TRIM_DARK),
    tintRawMesh(driverCanopy, COL_CABIN_GLASS),
    placeTinted(chamferBox([1.09, 0.12, 3.72], 0.03), { pos: [0, 0.56, -0.42] }, [0.14, 0.38, 0.86]),
    placeTinted(chamferBox([1.10, 0.042, 3.68], 0.012), { pos: [0, 0.48, -0.44] }, [0.22, 0.68, 0.96]),
    placeTinted(chamferBox([1.09, 0.22, 2.95], 0.03), { pos: [0, 0.84, -0.82] }, COL_CABIN_GLASS),
    placeTinted(chamferBox([0.94, 0.21, 4.42], 0.03), { pos: [0, 0.12, -0.18] }, COL_TRIM_DARK),
    placeTinted(chamferBox([0.52, 0.10, 0.86], 0.03), { pos: [0, 1.24, -0.78] }, COL_CHROME),
    tintRawMesh(tubeSweepMesh(pantoArm, 8, false), COL_CHROME),
    placeTinted(chamferBox([0.54, 0.026, 0.07], 0.008), { pos: [0, 1.59, -0.84] }, COL_CHROME),
    placeTinted(chamferBox([0.26, 0.08, 0.16], 0.025), { pos: [0, 0.22, 2.62] }, COL_TRIM_DARK)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeTinted(chamferBox([0.17, 0.10, 0.17], 0.024), { pos: [sgn * 0.22, 0.38, 2.25], rot: [0.22, 0, 0] }, COL_TRIM_DARK),
      placeTinted(chamferBox([0.13, 0.075, 0.16], 0.018), { pos: [sgn * 0.22, 0.385, 2.29], rot: [0.22, 0, 0] }, COL_HEADLIGHT),
      placeTinted(chamferBox([0.16, 0.105, 0.06], 0.02), { pos: [sgn * 0.34, 0.56, -2.43] }, COL_TAILLIGHT)
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

/** Bark-rippled hollow river log with sculpted bark flutes, recessed bore, branch knot stub & cushion moss (`m-logs`). */
export function buildHollowRiverLogSpec(): AuraCustomGeometrySpec {
  return cachedProp("river-log", () => {
    const shell = latheMesh(
      [
        [0.30, -0.44],
        [0.33, -0.50],
        [0.485, -0.50],
        [0.50, -0.26],
        [0.478, -0.04],
        [0.50, 0.22],
        [0.485, 0.50],
        [0.33, 0.50],
        [0.30, 0.44],
        [0, 0.42],
        [0, -0.42],
        [0.30, -0.44]
      ],
      24,
      false
    );
    const knotSpine: V4[] = [
      [0.34, 0.08, 0.0, 0.11],
      [0.46, 0.15, 0.05, 0.085],
      [0.50, 0.19, 0.08, 0.05]
    ];
    const parts: ColoredRawMesh[] = [
      tintRawMesh(shell, [0.98, 0.95, 0.90]),
      tintRawMesh(tubeSweepMesh(knotSpine, 10, false), [0.84, 0.77, 0.69]),
      placeTinted(subdivideSmoothMesh(chamferBox([0.16, 0.30, 0.14], 0.045), 1, 0.5), { pos: [-0.39, -0.14, 0.18] }, [0.74, 1.0, 0.70]),
      placeTinted(subdivideSmoothMesh(chamferBox([0.13, 0.22, 0.12], 0.04), 1, 0.5), { pos: [0.18, 0.20, -0.38] }, [0.78, 1.0, 0.74])
    ];
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2 + 0.35;
      const rx = Math.cos(a) * 0.475;
      const rz = Math.sin(a) * 0.475;
      parts.push(
        tintRawMesh(
          tubeSweepMesh(
            [
              [rx * 0.98, -0.44, rz * 0.98, 0.028],
              [rx * 1.01, -0.10, rz * 1.01, 0.036],
              [rx * 0.99, 0.18, rz * 0.99, 0.034],
              [rx * 0.97, 0.44, rz * 0.97, 0.026]
            ],
            8,
            false
          ),
          i % 2 === 0 ? [0.90, 0.85, 0.78] : [0.95, 0.91, 0.85]
        )
      );
    }
    return normalizePartsToUnitCube(parts);
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

/** Notched water-lily pad (`extrudePolygonMesh`) with radial vein star & multi-petal lotus blossom (`m-pads`). */
export function buildNotchedLilyPadSpec(): AuraCustomGeometrySpec {
  return cachedProp("lily-pad", () => {
    const ring: V2[] = [[0.05, 0.0]];
    const steps = 32;
    for (let i = 0; i <= steps; i += 1) {
      const a = 0.24 + (i / steps) * (Math.PI * 2 - 0.48);
      const r = 0.48 + Math.sin(i * 1.9) * 0.014;
      ring.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    const padBlade = transformMesh(extrudePolygonMesh(ring, 0.34, 0.055, false), { rot: [-Math.PI / 2, 0, 0] });
    const veinStar = transformMesh(extrudePolygonMesh(makeFivePointStarRing(0.32, 0.13), 0.08, 0.015, false), {
      pos: [0.02, 0.18, 0],
      rot: [-Math.PI / 2, 0, 0]
    });
    const lotusBud = subdivideSmoothMesh(
      superellipseLoft(
        [
          { z: 0.14, rx: 0.08, ry: 0.08, y: 0, superellipseN: 2.2 },
          { z: 0.32, rx: 0.11, ry: 0.11, y: 0, superellipseN: 2.0 },
          { z: 0.46, rx: 0.035, ry: 0.035, y: 0, superellipseN: 2.0 }
        ],
        14,
        true,
        false
      ),
      1,
      0.46
    );
    const petalPoly: V2[] = [[0, 0], [0.052, 0.06], [0, 0.16], [-0.052, 0.06]];
    const petalMesh = extrudePolygonMesh(petalPoly, 0.035, 0.008, false);
    const parts: ColoredRawMesh[] = [
      tintRawMesh(padBlade, [0.88, 0.98, 0.86]),
      tintRawMesh(veinStar, [0.98, 1.0, 0.92]),
      placeTinted(lotusBud, { pos: [-0.13, 0.05, 0.08], rot: [-Math.PI / 2, 0, 0] }, [1.0, 0.92, 0.62])
    ];
    for (let p = 0; p < 6; p += 1) {
      const pa = (p / 6) * Math.PI * 2;
      parts.push(
        placeTinted(
          petalMesh,
          {
            pos: [-0.13 + Math.cos(pa) * 0.03, 0.20, 0.08 + Math.sin(pa) * 0.03],
            rot: [-Math.PI / 2 + 0.42, pa, 0]
          },
          [1.0, 0.86, 0.94]
        )
      );
    }
    return normalizePartsToUnitCube(parts);
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
      tintRawMesh(subdivideSmoothMesh(layeredCanopyMesh({ radius: 0.50, height: 0.78, puffs: 9, seed: 19 }), 1, 0.44), [0.94, 0.99, 0.92]),
      placeTinted(icosphereSmoothMesh(0.34, 2, 0.07, 43, 0.48), { pos: [0.06, 0.14, -0.04], scale: [1.08, 0.78, 1.04] }, [0.99, 1.0, 0.95]),
      placeTinted(icosphereSmoothMesh(0.28, 2, 0.06, 61, 0.48), { pos: [-0.14, 0.06, 0.10], scale: [1.05, 0.76, 1.02] }, [0.92, 0.98, 0.90])
    ])
  );
}

/** Single-draw batched woodland tree (`d-trees`): root-flared bark trunk + root buttresses + smooth multi-puff `layeredCanopyMesh` crown grounded at `y = 0`. */
export function buildWoodlandTreeSpec(): AuraCustomGeometrySpec {
  return cachedProp("woodland-tree-batched", () => {
    const trunk = latheMesh(
      [[0, 0.0], [0.175, 0.0], [0.12, 0.16], [0.095, 0.44], [0.075, 0.62], [0, 0.62]],
      14,
      false
    );
    const mainCrown = transformMesh(
      subdivideSmoothMesh(layeredCanopyMesh({ radius: 0.48, height: 0.62, puffs: 8, seed: 23 }), 1, 0.44),
      { pos: [0, 0.70, 0] }
    );
    const topPuff = transformMesh(icosphereSmoothMesh(0.30, 2, 0.06, 37, 0.50), {
      pos: [0.03, 0.92, -0.02],
      scale: [1.05, 0.78, 1.02]
    });
    const sidePuff = transformMesh(icosphereSmoothMesh(0.26, 2, 0.06, 53, 0.46), {
      pos: [-0.16, 0.68, 0.10],
      scale: [1.04, 0.74, 1.0]
    });
    const parts: ColoredRawMesh[] = [
      tintRawMesh(trunk, [0.48, 0.33, 0.21]),
      tintRawMesh(mainCrown, [0.34, 0.70, 0.37]),
      tintRawMesh(topPuff, [0.44, 0.80, 0.43]),
      tintRawMesh(sidePuff, [0.38, 0.74, 0.40])
    ];
    for (let rIdx = 0; rIdx < 3; rIdx += 1) {
      const ra = (rIdx / 3) * Math.PI * 2 + 0.4;
      parts.push(
        tintRawMesh(
          tubeSweepMesh(
            [
              [Math.cos(ra) * 0.07, 0.20, Math.sin(ra) * 0.07, 0.048],
              [Math.cos(ra) * 0.15, 0.06, Math.sin(ra) * 0.15, 0.038],
              [Math.cos(ra) * 0.22, 0.015, Math.sin(ra) * 0.22, 0.020]
            ],
            8,
            false
          ),
          [0.44, 0.30, 0.19]
        )
      );
    }
    return mergeColoredMeshesToSpec(parts);
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

function spow(v: number, p: number): number {
  return Math.sign(v) * Math.pow(Math.abs(v), p);
}

function wrapSignedAngle(rad: number): number {
  let d = rad;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Builds a watertight, seam-welded `S^2` manifold (`u in [0, 1]` pole-to-pole, `phi in [0, 2*pi)`)
 * with automatic outward CCW winding verification and smooth area-weighted vertex normals.
 */
function sculptClosedParametricSurface(
  uSegs: number,
  vSegs: number,
  evalPt: (u: number, phi: number) => V3
): RawMesh {
  const uN = Math.max(4, Math.floor(uSegs));
  const vN = Math.max(8, Math.floor(vSegs));
  const positions: number[] = [];
  const uvs: number[] = [];

  const pSouth = evalPt(0, 0);
  const pNorth = evalPt(1, 0);
  positions.push(pSouth[0], pSouth[1], pSouth[2]);
  uvs.push(0.5, 0);
  positions.push(pNorth[0], pNorth[1], pNorth[2]);
  uvs.push(0.5, 1);

  for (let j = 1; j < uN; j += 1) {
    const u = j / uN;
    for (let i = 0; i < vN; i += 1) {
      const phi = (i / vN) * Math.PI * 2;
      const p = evalPt(u, phi);
      positions.push(p[0], p[1], p[2]);
      uvs.push(i / vN, u);
    }
  }

  const vCount = positions.length / 3;
  let cx = 0, cy = 0, cz = 0;
  for (let i = 0; i < positions.length; i += 3) {
    cx += positions[i]!;
    cy += positions[i + 1]!;
    cz += positions[i + 2]!;
  }
  cx /= vCount;
  cy /= vCount;
  cz /= vCount;

  const ringIdx = (j: number, i: number): number => 2 + (j - 1) * vN + (i % vN);
  const ringCentroid = (j: number): V3 => {
    if (j <= 0) return pSouth;
    if (j >= uN) return pNorth;
    let rx = 0, ry = 0, rz = 0;
    for (let i = 0; i < vN; i += 1) {
      const vi = ringIdx(j, i) * 3;
      rx += positions[vi]!;
      ry += positions[vi + 1]!;
      rz += positions[vi + 2]!;
    }
    return [rx / vN, ry / vN, rz / vN];
  };

  const triOrientScore = (i0: number, i1: number, i2: number, ref: V3): number => {
    const a0 = i0 * 3, a1 = i1 * 3, a2 = i2 * 3;
    const ux = positions[a1]! - positions[a0]!;
    const uy = positions[a1 + 1]! - positions[a0 + 1]!;
    const uz = positions[a1 + 2]! - positions[a0 + 2]!;
    const vx = positions[a2]! - positions[a0]!;
    const vy = positions[a2 + 1]! - positions[a0 + 1]!;
    const vz = positions[a2 + 2]! - positions[a0 + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    const mx = (positions[a0]! + positions[a1]! + positions[a2]!) / 3 - ref[0];
    const my = (positions[a0 + 1]! + positions[a1 + 1]! + positions[a2 + 1]!) / 3 - ref[1];
    const mz = (positions[a0 + 2]! + positions[a1 + 2]! + positions[a2 + 2]!) / 3 - ref[2];
    return nx * mx + ny * my + nz * mz;
  };

  // Vote globally across interior strips against local spine centroids so concave hollows stay coherent
  let globalVote = 0;
  for (let j = 1; j < uN - 1; j += 1) {
    const c0 = ringCentroid(j);
    const c1 = ringCentroid(j + 1);
    const mid: V3 = [(c0[0] + c1[0]) * 0.5, (c0[1] + c1[1]) * 0.5, (c0[2] + c1[2]) * 0.5];
    for (let i = 0; i < vN; i += 1) {
      const a = ringIdx(j, i);
      const b = ringIdx(j, i + 1);
      const c = ringIdx(j + 1, i + 1);
      const d = ringIdx(j + 1, i);
      globalVote += triOrientScore(a, b, c, mid) + triOrientScore(a, c, d, mid);
    }
  }
  if (Math.abs(globalVote) < 1e-9) {
    const mid: V3 = [cx, cy, cz];
    for (let i = 0; i < vN; i += 1) {
      globalVote += triOrientScore(0, ringIdx(1, i + 1), ringIdx(1, i), mid);
    }
  }
  const flip = globalVote < 0;

  const indices: number[] = [];
  const pushOrientedTri = (i0: number, i1: number, i2: number): void => {
    if (flip) indices.push(i0, i2, i1);
    else indices.push(i0, i1, i2);
  };

  for (let i = 0; i < vN; i += 1) {
    pushOrientedTri(0, ringIdx(1, i + 1), ringIdx(1, i));
  }
  for (let j = 1; j < uN - 1; j += 1) {
    for (let i = 0; i < vN; i += 1) {
      const a = ringIdx(j, i);
      const b = ringIdx(j, i + 1);
      const c = ringIdx(j + 1, i + 1);
      const d = ringIdx(j + 1, i);
      pushOrientedTri(a, b, c);
      pushOrientedTri(a, c, d);
    }
  }
  for (let i = 0; i < vN; i += 1) {
    pushOrientedTri(1, ringIdx(uN - 1, i), ringIdx(uN - 1, i + 1));
  }

  const normals = new Array<number>(positions.length).fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!, i1 = indices[t + 1]!, i2 = indices[t + 2]!;
    const a0 = i0 * 3, a1 = i1 * 3, a2 = i2 * 3;
    const ux = positions[a1]! - positions[a0]!;
    const uy = positions[a1 + 1]! - positions[a0 + 1]!;
    const uz = positions[a1 + 2]! - positions[a0 + 2]!;
    const vx = positions[a2]! - positions[a0]!;
    const vy = positions[a2 + 1]! - positions[a0 + 1]!;
    const vz = positions[a2 + 2]! - positions[a0 + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const vi of [a0, a1, a2]) {
      normals[vi]! += nx;
      normals[vi + 1]! += ny;
      normals[vi + 2]! += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nl = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!);
    if (nl > 1e-8) {
      normals[i]! /= nl;
      normals[i + 1]! /= nl;
      normals[i + 2]! /= nl;
    } else {
      normals[i] = 0;
      normals[i + 1] = 1;
      normals[i + 2] = 0;
    }
  }
  return { positions, normals, uvs, indices };
}

/** Smooth-normal rounded cushion / toe-pad / sole / pillow (`wx * wy * wz` centered at origin; zero flat faces). */
function sculptRoundedPillowMesh(
  wx: number,
  wy: number,
  wz: number,
  roundPower = 0.82,
  uSegs = 14,
  vSegs = 22
): RawMesh {
  const hx = wx * 0.5;
  const hy = wy * 0.5;
  const hz = wz * 0.5;
  return sculptClosedParametricSurface(uSegs, vSegs, (u, phi) => {
    const theta = (1 - u) * Math.PI; // u=0 -> -hy south pole, u=1 -> +hy north pole
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    return [
      hx * spow(st * Math.cos(phi), roundPower),
      hy * spow(ct, roundPower),
      hz * spow(st * Math.sin(phi), roundPower)
    ];
  });
}

interface VerticalContourSection {
  readonly y: number;
  readonly rx: number;
  readonly rz: number;
  readonly z?: number;
  readonly x?: number;
  readonly n?: number;
}

/**
 * Smooth Catmull-Rom vertical organic contour loft with tangent-continuous hemispherical dome closures
 * and welded `S^2` topology (zero flat triangle-fan caps, zero Loop-subdivision seam splits).
 */
function verticalContourLoft(sections: readonly VerticalContourSection[], segs = 30): RawMesh {
  const count = sections.length;
  const getSec = (idx: number): Required<VerticalContourSection> => {
    const s = sections[Math.max(0, Math.min(count - 1, idx))]!;
    // Clamp superellipse exponent gently so organic critter bodies stay plump & round rather than boxy
    const gentleN = Math.min(2.14, Math.max(1.85, s.n ?? 2.02));
    return {
      y: s.y,
      rx: s.rx,
      rz: s.rz,
      x: s.x ?? 0,
      z: s.z ?? 0,
      n: gentleN
    };
  };
  const first = getSec(0);
  const last = getSec(count - 1);
  const botCapH = Math.min(0.026, Math.max(0.006, first.y * 0.42));
  const topCapH = Math.min(0.044, (last.rx + last.rz) * 0.22);

  const evalStation = (tBody: number): Required<VerticalContourSection> => {
    const f = Math.max(0, Math.min(1, tBody)) * Math.max(1, count - 1);
    const idx = Math.min(count - 2, Math.floor(f));
    const lt = f - idx;
    const s0 = getSec(idx - 1);
    const s1 = getSec(idx);
    const s2 = getSec(idx + 1);
    const s3 = getSec(idx + 2);
    return {
      y: catmullRomScalar(s0.y, s1.y, s2.y, s3.y, lt),
      rx: Math.max(0.004, catmullRomScalar(s0.rx, s1.rx, s2.rx, s3.rx, lt)),
      rz: Math.max(0.004, catmullRomScalar(s0.rz, s1.rz, s2.rz, s3.rz, lt)),
      x: catmullRomScalar(s0.x, s1.x, s2.x, s3.x, lt),
      z: catmullRomScalar(s0.z, s1.z, s2.z, s3.z, lt),
      n: catmullRomScalar(s0.n, s1.n, s2.n, s3.n, lt)
    };
  };

  return sculptClosedParametricSurface(26, segs, (u, phi) => {
    let st: Required<VerticalContourSection>;
    let scaleR = 1;
    let yVal: number;
    if (u < 0.11) {
      const a = (u / 0.11) * (Math.PI * 0.5);
      st = first;
      scaleR = Math.sin(a);
      yVal = first.y - botCapH * Math.cos(a);
    } else if (u > 0.89) {
      const a = ((u - 0.89) / 0.11) * (Math.PI * 0.5);
      st = last;
      scaleR = Math.cos(a);
      yVal = last.y + topCapH * Math.sin(a);
    } else {
      const tBody = (u - 0.11) / 0.78;
      st = evalStation(tBody);
      yVal = st.y;
    }
    const p = 2 / Math.max(1.6, st.n);
    const ca = Math.cos(phi);
    const sa = Math.sin(phi);
    return [
      st.x + spow(ca, p) * st.rx * scaleR,
      yVal,
      st.z + spow(sa, p) * st.rz * scaleR
    ];
  });
}

interface FrogAnatomyProfile {
  readonly widthScale?: number;
  readonly eyeDomeAmp?: number;
  readonly headFlare?: number;
  readonly dorsolateralRidge?: number;
  readonly pitchLift?: number;
}

function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

/**
 * Evaluates a continuous, organically sculpted poised tree-frog body-and-head manifold:
 * narrow urostyle rump (`u = 0`) -> compact pear belly -> subtle cervical neck saddle ->
 * wide smiling amphibian cheeks & upturned snout (`u = 1`) -> seamless twin supraorbital eye domes!
 */
function evalFrogSkinPoint(uIn: number, phi: number, profile: FrogAnatomyProfile = {}): V3 {
  const u = Math.max(0, Math.min(1, uIn));
  const widthScale = profile.widthScale ?? 1;
  const eyeDomeAmp = profile.eyeDomeAmp ?? 0.094;
  const headFlare = profile.headFlare ?? 1;
  const ridgeAmp = profile.dorsolateralRidge ?? 0.008;
  const pitchLift = profile.pitchLift ?? 1;

  // Tangent-continuous hemispherical rump (`u=0`) and broad rounded snout (`u=1`) envelopes
  let env = 1;
  if (u < 0.095) {
    env = Math.sin((u / 0.095) * (Math.PI * 0.5));
  } else if (u > 0.895) {
    env = Math.cos(((u - 0.895) / 0.105) * (Math.PI * 0.5));
  }

  // ~33-degree forward-leaning amphibian spine (`z: -0.255 -> +0.335`, `y: 0.145 -> 0.43 -> 0.38`)
  const zSpine = -0.255 + 0.590 * u;
  const ySpine =
    0.142 +
    0.355 * pitchLift * Math.pow(u, 0.84) -
    0.118 * Math.pow(Math.max(0, u - 0.62) / 0.38, 1.95);

  // Pear pelvis -> compact waist (so Z-folded thighs project outside!) -> neck dip -> wide smiling frog head
  const rxBase =
    (0.132 +
      0.044 * gauss(u, 0.36, 0.16) -
      0.018 * gauss(u, 0.55, 0.075) +
      0.096 * headFlare * gauss(u, 0.74, 0.125) +
      0.036 * headFlare * gauss(u, 0.88, 0.085)) *
    widthScale;

  const ryTop =
    0.098 +
    0.038 * gauss(u, 0.35, 0.20) +
    0.046 * gauss(u, 0.68, 0.145);
  const ryBot =
    0.090 +
    0.064 * gauss(u, 0.42, 0.20) +
    0.052 * gauss(u, 0.77, 0.125);

  const ca = Math.cos(phi);
  const sa = Math.sin(phi);

  // Chubby lower cheek flare around `u ~ 0.74` + soft flattened ventral belly cushion
  const cheekWiden = 1 + 0.11 * headFlare * gauss(u, 0.74, 0.10) * ca * ca * Math.max(0, 0.65 - sa * 0.45);
  const rx = rxBase * cheekWiden * env;
  const ry = (sa >= 0 ? ryTop : ryBot * (1 - 0.08 * ca * ca)) * env;

  let x = rx * ca;
  let y = ySpine + ry * sa;
  let z = zSpine + 0.016 * env * sa * gauss(u, 0.72, 0.14);

  // Seamless twin supraorbital eye domes rising organically out of the skull crown (`x = +-0.145`)
  if (eyeDomeAmp > 0) {
    const uEye = gauss(u, 0.705, 0.082);
    for (const [sgn, eyePhi] of [
      [1, 0.94],
      [-1, Math.PI - 0.94]
    ] as const) {
      const dPhi = wrapSignedAngle(phi - eyePhi);
      const dome = uEye * Math.exp(-0.5 * (dPhi / 0.36) * (dPhi / 0.36)) * env;
      x += sgn * 0.36 * eyeDomeAmp * dome;
      y += 0.96 * eyeDomeAmp * dome;
      z += 0.09 * eyeDomeAmp * dome;
    }
    // Gentle interorbital saddle groove between the twin eye domes for crisp rear-camera silhouette
    const interOrb = uEye * Math.exp(-0.5 * (wrapSignedAngle(phi - Math.PI * 0.5) / 0.20) ** 2) * env;
    y -= 0.18 * eyeDomeAmp * interOrb;
  }

  // Subtle dorsolateral amphibian skin folds along upper back
  if (ridgeAmp > 0) {
    const uFold = gauss(u, 0.40, 0.19) * env;
    for (const foldPhi of [0.76, Math.PI - 0.76] as const) {
      const dPhi = wrapSignedAngle(phi - foldPhi);
      const fold = uFold * Math.exp(-0.5 * (dPhi / 0.16) ** 2);
      x += Math.cos(foldPhi) * ridgeAmp * fold;
      y += Math.sin(foldPhi) * ridgeAmp * fold;
    }
  }

  // Tiny upturned snout nostril mounds near `u = 0.90`
  const uNostril = gauss(u, 0.90, 0.032) * env;
  for (const nPhi of [1.08, Math.PI - 1.08] as const) {
    const dPhi = wrapSignedAngle(phi - nPhi);
    const bump = uNostril * Math.exp(-0.5 * (dPhi / 0.20) ** 2);
    y += 0.011 * bump;
    z += 0.007 * bump;
  }

  return [x, y, z];
}

function evalFrogSkinNormal(u: number, phi: number, profile: FrogAnatomyProfile = {}): V3 {
  const du = 0.008;
  const dphi = 0.02;
  const u0 = Math.max(0.01, Math.min(0.99, u));
  const pU0 = evalFrogSkinPoint(u0 - du, phi, profile);
  const pU1 = evalFrogSkinPoint(u0 + du, phi, profile);
  const pV0 = evalFrogSkinPoint(u0, phi - dphi, profile);
  const pV1 = evalFrogSkinPoint(u0, phi + dphi, profile);
  const tux = pU1[0] - pU0[0], tuy = pU1[1] - pU0[1], tuz = pU1[2] - pU0[2];
  const tvx = pV1[0] - pV0[0], tvy = pV1[1] - pV0[1], tvz = pV1[2] - pV0[2];
  // dP/dphi x dP/du points outward on `(rx*cos(phi), y + ry*sin(phi), z(u))`
  const nx = tvy * tuz - tvz * tuy;
  const ny = tvz * tux - tvx * tuz;
  const nz = tvx * tuy - tvy * tux;
  const nl = Math.hypot(nx, ny, nz) || 1;
  return [nx / nl, ny / nl, nz / nl];
}

/**
 * Sculpts a seamless body-conforming patch (cream vocal-sac & belly, dorsal armor carapace, sternum plate)
 * whose boundary tucks 2.5 mm inside the skin while its interior domes smoothly outward along the exact skin normal.
 */
function sculptFrogSurfacePatchMesh(
  profile: FrogAnatomyProfile,
  uMin: number,
  uMax: number,
  phiMin: number,
  phiMax: number,
  uSteps: number,
  phiSteps: number,
  thickness: number
): RawMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const uN = Math.max(4, Math.floor(uSteps));
  const pN = Math.max(4, Math.floor(phiSteps));
  const stride = pN + 1;

  for (let j = 0; j <= uN; j += 1) {
    const su = j / uN;
    const u = uMin + (uMax - uMin) * su;
    const wu = Math.pow(Math.sin(Math.PI * su), 0.58);
    for (let i = 0; i <= pN; i += 1) {
      const sp = i / pN;
      const phi = phiMin + (phiMax - phiMin) * sp;
      const wp = Math.pow(Math.sin(Math.PI * sp), 0.58);
      const p = evalFrogSkinPoint(u, phi, profile);
      const n = evalFrogSkinNormal(u, phi, profile);
      const disp = -0.0028 + (thickness + 0.0028) * wu * wp;
      positions.push(p[0] + n[0] * disp, p[1] + n[1] * disp, p[2] + n[2] * disp);
      uvs.push(sp, su);
    }
  }

  for (let j = 0; j < uN; j += 1) {
    for (let i = 0; i < pN; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      // phi increases with i, u increases with j -> (a, b, c) & (a, c, d) match dP/dphi x dP/du outward normal
      indices.push(a, b, c, a, c, d);
    }
  }

  const normals = new Array<number>(positions.length).fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!, i1 = indices[t + 1]!, i2 = indices[t + 2]!;
    const a0 = i0 * 3, a1 = i1 * 3, a2 = i2 * 3;
    const ux = positions[a1]! - positions[a0]!;
    const uy = positions[a1 + 1]! - positions[a0 + 1]!;
    const uz = positions[a1 + 2]! - positions[a0 + 2]!;
    const vx = positions[a2]! - positions[a0]!;
    const vy = positions[a2 + 1]! - positions[a0 + 1]!;
    const vz = positions[a2 + 2]! - positions[a0 + 2]!;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const vi of [a0, a1, a2]) {
      normals[vi]! += nx;
      normals[vi + 1]! += ny;
      normals[vi + 2]! += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nl = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= nl;
    normals[i + 1]! /= nl;
    normals[i + 2]! /= nl;
  }
  return { positions, normals, uvs, indices };
}

/**
 * Sculpts a curved organic dorsal leaf-spot or rosy cheek blush directly on `evalFrogSkinPoint(u, phi)`
 * so 100% of spots sit proudly on the frog's back/cheeks without ever burying inside the body or floating.
 */
function sculptFrogSkinSpotMesh(
  profile: FrogAnatomyProfile,
  uCenter: number,
  phiCenter: number,
  uRadius: number,
  phiRadius: number,
  thickness = 0.0085,
  rings = 5,
  segs = 18
): RawMesh {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  const p0 = evalFrogSkinPoint(uCenter, phiCenter, profile);
  const n0 = evalFrogSkinNormal(uCenter, phiCenter, profile);
  positions.push(p0[0] + n0[0] * thickness, p0[1] + n0[1] * thickness, p0[2] + n0[2] * thickness);
  uvs.push(0.5, 0.5);

  for (let r = 1; r <= rings; r += 1) {
    const rf = r / rings;
    const dome = Math.cos(rf * Math.PI * 0.5);
    const disp = -0.0024 + (thickness + 0.0024) * dome;
    for (let i = 0; i < segs; i += 1) {
      const a = (i / segs) * Math.PI * 2;
      const u = Math.max(0.05, Math.min(0.95, uCenter + Math.cos(a) * uRadius * rf));
      const phi = phiCenter + Math.sin(a) * phiRadius * rf;
      const p = evalFrogSkinPoint(u, phi, profile);
      const n = evalFrogSkinNormal(u, phi, profile);
      positions.push(p[0] + n[0] * disp, p[1] + n[1] * disp, p[2] + n[2] * disp);
      uvs.push(0.5 + 0.5 * rf * Math.cos(a), 0.5 + 0.5 * rf * Math.sin(a));
    }
  }

  // Orient fan & rings against `n0` so winding is guaranteed outward
  const ringVert = (r: number, i: number): number => 1 + (r - 1) * segs + (i % segs);
  const a1 = ringVert(1, 0) * 3;
  const a2 = ringVert(1, 1) * 3;
  const e1x = positions[a1]! - positions[0]!, e1y = positions[a1 + 1]! - positions[1]!, e1z = positions[a1 + 2]! - positions[2]!;
  const e2x = positions[a2]! - positions[0]!, e2y = positions[a2 + 1]! - positions[1]!, e2z = positions[a2 + 2]! - positions[2]!;
  const fnx = e1y * e2z - e1z * e2y;
  const fny = e1z * e2x - e1x * e2z;
  const fnz = e1x * e2y - e1y * e2x;
  const flip = fnx * n0[0] + fny * n0[1] + fnz * n0[2] < 0;

  for (let i = 0; i < segs; i += 1) {
    const vA = ringVert(1, i);
    const vB = ringVert(1, i + 1);
    if (flip) indices.push(0, vB, vA);
    else indices.push(0, vA, vB);
  }
  for (let r = 1; r < rings; r += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = ringVert(r, i);
      const b = ringVert(r, i + 1);
      const c = ringVert(r + 1, i + 1);
      const d = ringVert(r + 1, i);
      if (flip) indices.push(a, d, c, a, c, b);
      else indices.push(a, b, c, a, c, d);
    }
  }

  const normals = new Array<number>(positions.length).fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!, i1 = indices[t + 1]!, i2 = indices[t + 2]!;
    const b0 = i0 * 3, b1 = i1 * 3, b2 = i2 * 3;
    const ux = positions[b1]! - positions[b0]!, uy = positions[b1 + 1]! - positions[b0 + 1]!, uz = positions[b1 + 2]! - positions[b0 + 2]!;
    const vx = positions[b2]! - positions[b0]!, vy = positions[b2 + 1]! - positions[b0 + 1]!, vz = positions[b2 + 2]! - positions[b0 + 2]!;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    for (const vi of [b0, b1, b2]) {
      normals[vi]! += nx;
      normals[vi + 1]! += ny;
      normals[vi + 2]! += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nl = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= nl;
    normals[i + 1]! /= nl;
    normals[i + 2]! /= nl;
  }
  return { positions, normals, uvs, indices };
}

/** Smooth-normal scalloped interdigital webbing membrane spanning between two splayed amphibian toes. */
function sculptFootWebbingMesh(origin: V3, toeA: V3, toeB: V3, webFrac = 0.72): RawMesh {
  return sculptClosedParametricSurface(10, 16, (u, phi) => {
    const theta = (1 - u) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    // Map unit disc `(st*cos(phi), st*sin(phi))` onto triangle `(origin, toeA*webFrac, toeB*webFrac)` with concave margin
    const s = 0.5 + 0.5 * st * Math.cos(phi);
    const w = 0.5 + 0.5 * st * Math.sin(phi);
    const scallop = 1 - 0.16 * Math.sin(Math.PI * w);
    const reach = s * webFrac * scallop;
    const ax = origin[0] + (toeA[0] - origin[0]) * reach;
    const az = origin[2] + (toeA[2] - origin[2]) * reach;
    const bx = origin[0] + (toeB[0] - origin[0]) * reach;
    const bz = origin[2] + (toeB[2] - origin[2]) * reach;
    const x = ax + (bx - ax) * w;
    const z = az + (bz - az) * w;
    const baseY = Math.max(0.011, origin[1] * (1 - reach) + 0.013 * reach);
    const halfThick = 0.0055 * Math.pow(Math.max(0, st), 0.6);
    return [x, baseY + ct * halfThick, z];
  });
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
  readonly horizontalPupil?: boolean;
  readonly outwardYaw?: number;
}

/** Appends symmetrical big expressive smooth-shaded eyes (liquid-smooth UV corneas + dual catchlights). */
function appendExpressiveEyes(slots: MultiMatSlot[], opts: EyePlacementOptions): void {
  const r = opts.radius;
  const yawBase = opts.outwardYaw ?? 0.18;
  const smoothEyeSphere = (rad: number, uS = 18, vS = 28): RawMesh =>
    sculptRoundedPillowMesh(rad * 2, rad * 2, rad * 2, 1.0, uS, vS);
  for (const sgn of [-1, 1] as const) {
    const ex = sgn * opts.x;
    const yaw = -sgn * yawBase;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    // Outward-and-forward gaze vector `[-sinY, +0.10, cosY]`
    const gx = -sinY;
    const gy = 0.10;
    const gz = cosY;
    if (opts.turretMat !== undefined) {
      slots.push({
        materialIndex: opts.turretMat,
        mesh: transformMesh(smoothEyeSphere(r * 1.16, 18, 28), {
          pos: [ex - gx * r * 0.22, opts.y - r * 0.10, opts.z - gz * r * 0.22],
          scale: [1.06, 1.06, 1.04]
        })
      });
    }
    const pupilScale: [number, number, number] = opts.horizontalPupil
      ? [1.10, 0.56, 0.52]
      : [0.92, 1.02, 0.56];
    slots.push(
      {
        materialIndex: opts.scleraMat,
        mesh: transformMesh(smoothEyeSphere(r, 18, 28), {
          pos: [ex, opts.y, opts.z],
          rot: [-0.08, yaw, 0],
          scale: [0.98, 1.02, 0.94]
        })
      },
      {
        materialIndex: opts.pupilMat,
        mesh: transformMesh(smoothEyeSphere(r * 0.58, 16, 24), {
          pos: [ex + gx * r * 0.54, opts.y + gy * r * 0.54, opts.z + gz * r * 0.54],
          rot: [-0.08, yaw, 0],
          scale: pupilScale
        })
      },
      // Primary upper-outer sun catchlight + secondary lower-inner pinpoint glint
      {
        materialIndex: opts.catchlightMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.23, 2, 0, 31, 0), {
          pos: [ex + gx * r * 0.78 + sgn * r * 0.22, opts.y + r * 0.34, opts.z + gz * r * 0.74],
          rot: [-0.12, yaw, 0],
          scale: [1.0, 1.0, 0.62]
        })
      },
      {
        materialIndex: opts.catchlightMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.11, 2, 0, 33, 0), {
          pos: [ex + gx * r * 0.80 - sgn * r * 0.18, opts.y - r * 0.16, opts.z + gz * r * 0.76],
          rot: [-0.08, yaw, 0],
          scale: [1.0, 1.0, 0.62]
        })
      }
    );
    if (opts.blushMat !== undefined) {
      slots.push({
        materialIndex: opts.blushMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.54, 2, 0, 37, 0), {
          pos: [sgn * (opts.x + r * 0.56), opts.y - r * 0.86, opts.z + r * 0.28],
          rot: [0, -sgn * 0.38, 0],
          scale: [0.96, 0.56, 0.38]
        })
      });
    }
  }
}

interface FrogLimbSculptOptions {
  readonly thighMat: number;
  readonly calfMat?: number;
  readonly foreMat?: number;
  readonly padMat: number;
  readonly webMat?: number;
  readonly stripeMat?: number;
  readonly kneeAccentMat?: number;
  readonly spread?: number;
}

/**
 * Sculpts athletic Z-folded muscular frog hind legs (hip -> wide outward-forward knee -> folded calf -> tarsus ->
 * 3 splayed webbed toes with round sticky tree-frog toe discs at `minY = 0`) and bowed planted forelimbs with 3 splayed fingers.
 */
function appendFrogLimbs(slots: MultiMatSlot[], skinMat: number, padMat: number, spread = 1, extra: Partial<FrogLimbSculptOptions> = {}): void {
  const thighMat = extra.thighMat ?? skinMat;
  const calfMat = extra.calfMat ?? skinMat;
  const foreMat = extra.foreMat ?? skinMat;
  const webMat = extra.webMat ?? padMat;

  for (const sgn of [-1, 1] as const) {
    const kneeX = sgn * 0.258 * spread;
    const ankleX = sgn * 0.228 * spread;
    const footBall: V3 = [sgn * 0.226 * spread, 0.022, 0.020];

    // 1. Muscular folded femur sweeping outward & forward so knees silhouette boldly outside the waist
    slots.push(
      {
        materialIndex: thighMat,
        mesh: sculptHumanoidLimbMesh(
          [
            [sgn * 0.115 * spread, 0.175, -0.145, 0.068],
            [sgn * 0.205 * spread, 0.218, -0.072, 0.082],
            [kneeX, 0.232, 0.012, 0.060]
          ],
          16,
          0.16
        )
      },
      // 2. Folded gastrocnemius calf sweeping backward & downward in a true amphibian Z-fold (`minY > 0.004`)
      {
        materialIndex: calfMat,
        mesh: sculptHumanoidLimbMesh(
          [
            [kneeX * 0.98, 0.222, 0.006, 0.056],
            [sgn * 0.252 * spread, 0.138, -0.088, 0.062],
            [ankleX, 0.048, -0.155, 0.038]
          ],
          16,
          0.14
        )
      },
      // 3. Elongated frog tarsus sweeping forward along the ground to the metatarsal ball
      {
        materialIndex: calfMat,
        mesh: sculptHumanoidLimbMesh(
          [
            [ankleX, 0.040, -0.145, 0.034],
            [sgn * 0.226 * spread, 0.028, -0.055, 0.030],
            [footBall[0], 0.026, footBall[2], 0.024]
          ],
          14,
          0.12
        )
      },
      // Cushioned heel pad kissing `y = 0`
      {
        materialIndex: padMat,
        mesh: transformMesh(sculptRoundedPillowMesh(0.052, 0.028, 0.058, 0.86, 10, 16), {
          pos: [ankleX, 0.014, -0.148]
        })
      },
      // 4. Bowed athletic forelimb planted forward-and-outward (`minY > 0.004`)
      {
        materialIndex: foreMat,
        mesh: sculptHumanoidLimbMesh(
          [
            [sgn * 0.155 * spread, 0.305, 0.105, 0.048],
            [sgn * 0.218 * spread, 0.180, 0.168, 0.043],
            [sgn * 0.175 * spread, 0.034, 0.222, 0.029]
          ],
          14,
          0.14
        )
      }
    );

    if (extra.stripeMat !== undefined) {
      // Organic dorsal leaf-green thigh band visible from the chase camera
      slots.push({
        materialIndex: extra.stripeMat,
        mesh: transformMesh(sculptRoundedPillowMesh(0.088, 0.026, 0.046, 0.88, 10, 16), {
          pos: [sgn * 0.208 * spread, 0.292, -0.068],
          rot: [0.18, -sgn * 0.48, -sgn * 0.24]
        })
      });
    }

    if (extra.kneeAccentMat !== undefined) {
      // Articulated knee cap / poleyn / EVA knee ring for roboFrog, knightToad & astroFrog
      slots.push({
        materialIndex: extra.kneeAccentMat,
        mesh: transformMesh(icosphereSmoothMesh(0.052, 2, 0, 39, 0.1), {
          pos: [kneeX * 1.02, 0.238, 0.024],
          scale: [0.95, 0.92, 1.08]
        })
      });
    }

    // 3 splayed webbed hind toes + round sticky tree-frog toe pads grounded cleanly at `y = 0`
    const hindToes: readonly V3[] = [
      [sgn * 0.168 * spread, 0.015, 0.155],
      [sgn * 0.232 * spread, 0.015, 0.185],
      [sgn * 0.294 * spread, 0.015, 0.142]
    ];
    slots.push(
      { materialIndex: webMat, mesh: sculptFootWebbingMesh(footBall, hindToes[0]!, hindToes[1]!, 0.74) },
      { materialIndex: webMat, mesh: sculptFootWebbingMesh(footBall, hindToes[1]!, hindToes[2]!, 0.74) }
    );
    for (const tip of hindToes) {
      slots.push(
        {
          materialIndex: calfMat,
          mesh: tubeSweepMesh(
            [
              [footBall[0], 0.022, footBall[2], 0.018],
              [(footBall[0] + tip[0]) * 0.5, 0.019, (footBall[2] + tip[2]) * 0.5, 0.015],
              [tip[0], 0.016, tip[2], 0.012]
            ],
            12,
            false
          )
        },
        {
          materialIndex: padMat,
          mesh: transformMesh(sculptRoundedPillowMesh(0.052, 0.030, 0.058, 0.86, 12, 18), {
            pos: [tip[0], 0.015, tip[2] + 0.012]
          })
        }
      );
    }

    // 3 cute splayed front fingers + sticky finger pads grounded cleanly at `y = 0`
    const wristOrigin: V3 = [sgn * 0.175 * spread, 0.020, 0.226];
    const frontFingers: readonly V3[] = [
      [sgn * 0.132 * spread, 0.014, 0.292],
      [sgn * 0.180 * spread, 0.014, 0.308],
      [sgn * 0.228 * spread, 0.014, 0.282]
    ];
    slots.push(
      { materialIndex: webMat, mesh: sculptFootWebbingMesh(wristOrigin, frontFingers[0]!, frontFingers[1]!, 0.62) },
      { materialIndex: webMat, mesh: sculptFootWebbingMesh(wristOrigin, frontFingers[1]!, frontFingers[2]!, 0.62) }
    );
    for (const fTip of frontFingers) {
      slots.push(
        {
          materialIndex: foreMat,
          mesh: tubeSweepMesh(
            [
              [wristOrigin[0], 0.020, wristOrigin[2], 0.014],
              [fTip[0], 0.015, fTip[2], 0.010]
            ],
            10,
            false
          )
        },
        {
          materialIndex: padMat,
          mesh: transformMesh(sculptRoundedPillowMesh(0.042, 0.028, 0.046, 0.86, 10, 16), {
            pos: [fTip[0], 0.014, fTip[2] + 0.008]
          })
        }
      );
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
        mesh: transformMesh(icosphereSmoothMesh(0.028, 2, 0, 59, 0), {
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
          12,
          false
        )
      }
    );
  }
}

/** Appends sturdy smooth-shaded woodland boots planted squarely on `y = 0` (zero flat `bevelBoxMesh` faces). */
function appendBootedLegs(slots: MultiMatSlot[], legMat: number, bootMat: number, soleMat = bootMat): void {
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: legMat,
        mesh: sculptHumanoidLimbMesh(
          [
            [sgn * 0.13, 0.25, 0.0, 0.068],
            [sgn * 0.142, 0.17, 0.015, 0.065],
            [sgn * 0.145, 0.095, 0.02, 0.060]
          ],
          14,
          0.14
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
        mesh: transformMesh(sculptRoundedPillowMesh(0.155, 0.028, 0.225, 0.78, 12, 20), {
          pos: [sgn * 0.145, 0.014, 0.065]
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
  readonly vocalSacMesh?: RawMesh;
  readonly vocalSacPivot?: V3;
  readonly vocalSacMaterial?: AuraMaterialSpec;
}

function buildFrogHeroRecipe(
  skinMat: AuraMaterialSpec,
  spotMat: AuraMaterialSpec,
  bellyMat: AuraMaterialSpec,
  padMat: AuraMaterialSpec,
  irisMat: AuraMaterialSpec,
  withRoyalCrown: boolean
): CritterAssemblyRecipe {
  // 0: skin, 1: cream belly & vocal sac, 2: leaf spots & smile, 3: sticky toe pads & webbing,
  // 4: golden-amber iris, 5: obsidian horizontal pupil, 6: catchlight, 7: rosy blush / royal ruby
  const profile: FrogAnatomyProfile = {
    widthScale: 1.0,
    eyeDomeAmp: 0.096,
    headFlare: 1.04,
    dorsolateralRidge: 0.0085,
    pitchLift: 1.0
  };

  // Continuous, seam-welded `38 x 42` (`1,556` smooth vertices) organic amphibian body-to-head-to-eye-domes sculpt
  const torso = sculptClosedParametricSurface(38, 42, (u, phi) => evalFrogSkinPoint(u, phi, profile));

  // Seamless ventral vocal-sac throat & cream belly feathered directly onto the ventral contour (`phi in [204..336 deg]`)
  const belly = sculptFrogSurfacePatchMesh(
    profile,
    0.16,
    0.90,
    (204 * Math.PI) / 180,
    (336 * Math.PI) / 180,
    22,
    24,
    0.0095
  );

  // Wide upturned smiling amphibian mouth crease sweeping cheek-to-cheek around the snout
  const smilePoints: V4[] = [];
  const smileSegs = 14;
  for (let i = 0; i <= smileSegs; i += 1) {
    const t = (i / smileSegs) * 2 - 1; // -1 (left cheek) .. +1 (right cheek)
    const uSmile = 0.965 - 0.21 * t * t;
    const phiSmile = t >= 0 ? -0.10 + 0.16 * (1 - Math.abs(t)) : Math.PI + 0.10 - 0.16 * (1 - Math.abs(t));
    // Interpolate smoothly across the front snout arc
    const frontAng = t * 1.18; // +-67.6 deg around +Z snout
    const xS = Math.sin(frontAng) * (0.242 - 0.025 * (1 - t * t));
    const zS = 0.168 + Math.cos(frontAng) * 0.168;
    const yS = 0.366 + 0.036 * t * t - 0.006 * Math.cos(frontAng * Math.PI * 0.5);
    void uSmile;
    void phiSmile;
    const rad = 0.0115 - 0.003 * Math.abs(t);
    smilePoints.push([xS, yS, zS, rad]);
  }
  const smileRidge = tubeSweepMesh(smilePoints, 12, false);

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: torso },
    { materialIndex: 1, mesh: belly },
    { materialIndex: 2, mesh: smileRidge }
  ];

  // 7 proudly surface-conforming organic leaf-green dorsal & flank spots (100% visible from rear/top chase camera!)
  const dorsalSpots: readonly [number, number, number, number][] = [
    [0.44, Math.PI * 0.5, 0.075, 0.24],
    [0.27, Math.PI * 0.5 + 0.34, 0.058, 0.20],
    [0.27, Math.PI * 0.5 - 0.34, 0.058, 0.20],
    [0.54, Math.PI * 0.5 + 0.46, 0.052, 0.19],
    [0.54, Math.PI * 0.5 - 0.46, 0.052, 0.19],
    [0.16, Math.PI * 0.5, 0.048, 0.22],
    [0.61, Math.PI * 0.5, 0.044, 0.18]
  ];
  for (const [uS, phiS, rU, rPhi] of dorsalSpots) {
    slots.push({
      materialIndex: 2,
      mesh: sculptFrogSkinSpotMesh(profile, uS, phiS, rU, rPhi, 0.0085, 5, 18)
    });
  }

  // Tiny nostril dimples near the upturned snout tip
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 2,
      mesh: transformMesh(icosphereSmoothMesh(0.012, 2, 0, 15, 0), {
        pos: [sgn * 0.056, 0.452, 0.288],
        scale: [1.1, 0.65, 0.9]
      })
    });
  }

  // Sculpted Z-folded muscular hind legs, 3-toed webbed feet, sticky pads & bowed planted forelimbs (`minY = 0`, fitted to 0.94 m lilypads)
  appendFrogLimbs(slots, 0, 3, 0.91, {
    thighMat: 0,
    calfMat: 0,
    foreMat: 0,
    webMat: 3,
    stripeMat: 2
  });

  // Supraorbital upper-eyelid brow hoods + large panoramic golden-amber / obsidian horizontal-pupil frog eyes
  for (const sgn of [-1, 1] as const) {
    slots.push({
      materialIndex: 0,
      mesh: tubeSweepMesh(
        [
          [sgn * 0.088, 0.575, 0.225, 0.018],
          [sgn * 0.148, 0.632, 0.192, 0.024],
          [sgn * 0.196, 0.605, 0.142, 0.022],
          [sgn * 0.205, 0.548, 0.105, 0.015]
        ],
        14,
        false
      )
    });
  }
  appendExpressiveEyes(slots, {
    x: 0.148,
    y: 0.582,
    z: 0.182,
    radius: 0.072,
    scleraMat: 4,
    pupilMat: 5,
    catchlightMat: 6,
    horizontalPupil: true,
    outwardYaw: 0.40
  });

  // Conforming warm rosy cheek blushes (or royal ruby cheek cabochons) on the wide smiling outer cheeks
  for (const cheekPhi of [0.10, Math.PI - 0.10] as const) {
    slots.push({
      materialIndex: 7,
      mesh: sculptFrogSkinSpotMesh(
        profile,
        0.74,
        cheekPhi,
        withRoyalCrown ? 0.036 : 0.056,
        withRoyalCrown ? 0.14 : 0.22,
        withRoyalCrown ? 0.010 : 0.0075,
        4,
        16
      )
    });
  }

  if (withRoyalCrown) {
    // Smooth-shaded 5-point royal gold coronet nestled cleanly on the crown between/behind the eye domes
    const crownZ = 0.065;
    const crownY = 0.558;
    const band = latheMesh(
      [
        [0.068, 0.0],
        [0.086, 0.0],
        [0.098, 0.062],
        [0.080, 0.066],
        [0.068, 0.0]
      ],
      28,
      false
    );
    slots.push({ materialIndex: 1, mesh: transformMesh(band, { pos: [0, crownY, crownZ] }) });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      slots.push(
        {
          materialIndex: 1,
          mesh: tubeSweepMesh(
            [
              [sa * 0.086, crownY + 0.056, crownZ + ca * 0.086, 0.018],
              [sa * 0.098, crownY + 0.098, crownZ + ca * 0.098, 0.013],
              [sa * 0.104, crownY + 0.132, crownZ + ca * 0.104, 0.006]
            ],
            12,
            false
          )
        },
        {
          materialIndex: 1,
          mesh: transformMesh(icosphereSmoothMesh(0.013, 2, 0, 63 + i, 0), {
            pos: [sa * 0.105, crownY + 0.138, crownZ + ca * 0.105]
          })
        },
        {
          materialIndex: 7,
          mesh: transformMesh(icosphereSmoothMesh(0.016, 2, 0, 71 + i, 0), {
            pos: [sa * 0.095, crownY + 0.034, crownZ + ca * 0.095]
          })
        }
      );
    }
  }

  // Animated submandibular vocal-sac pouch centered on its local throat pivot for live ribbit breathing & landing settle
  const vocalSacPivot: V3 = [0, 0.305, 0.215];
  const vocalSacMesh = sculptRoundedPillowMesh(0.195, 0.105, 0.175, 0.92, 14, 22);

  return {
    slots,
    materials: [
      skinMat,
      bellyMat,
      spotMat,
      padMat,
      irisMat,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil,
      CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight,
      withRoyalCrown ? CROSS_HOP_PROCEDURAL_MATERIALS.crownRubyGem : CROSS_HOP_PROCEDURAL_MATERIALS.critterRosyBlush
    ],
    vocalSacMesh,
    vocalSacPivot,
    vocalSacMaterial: bellyMat
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
  const butterPat = transformMesh(sculptRoundedPillowMesh(0.13, 0.036, 0.11, 0.78, 12, 18), {
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
  // 0: titanium hull, 1: gunmetal servo joints, 2: practical cyan LED visor/cores,
  // 3: brushed steel sternum/pistons/pads, 4: white specular glint
  const roboProfile: FrogAnatomyProfile = {
    widthScale: 0.99,
    eyeDomeAmp: 0.088,
    headFlare: 1.02,
    dorsolateralRidge: 0.014,
    pitchLift: 1.0
  };
  const chassis = sculptClosedParametricSurface(34, 38, (u, phi) => evalFrogSkinPoint(u, phi, roboProfile));

  // Contoured brushed-steel ventral sternum & belly armor shell (zero flat `bevelBoxMesh` faces)
  const chestPlate = sculptFrogSurfacePatchMesh(
    roboProfile,
    0.20,
    0.84,
    (212 * Math.PI) / 180,
    (328 * Math.PI) / 180,
    18,
    20,
    0.013
  );
  const chestBezel = transformMesh(
    latheMesh(
      [
        [0.032, -0.012],
        [0.058, -0.012],
        [0.062, 0.012],
        [0.036, 0.014],
        [0.032, -0.012]
      ],
      22,
      false
    ),
    { pos: [0, 0.285, 0.205], rot: [Math.PI * 0.5 + 0.34, 0, 0] }
  );
  const chestCore = transformMesh(icosphereSmoothMesh(0.038, 2, 0, 127, 0), {
    pos: [0, 0.282, 0.212],
    rot: [0.34, 0, 0],
    scale: [1.05, 1.05, 0.52]
  });

  // Curved wrap-around gunmetal optic visor + glowing cyan dual-optic LED arc across the wide frog head
  const visorHousingPts: V4[] = [];
  const visorGlowPts: V4[] = [];
  for (let i = 0; i <= 16; i += 1) {
    const t = (i / 16) * 2 - 1;
    const ang = t * 1.12;
    const xV = Math.sin(ang) * 0.228;
    const zV = 0.145 + Math.cos(ang) * 0.162;
    const yV = 0.492 + 0.048 * (1 - 0.35 * t * t);
    const rFactor = 1 - 0.22 * Math.pow(Math.abs(t), 2.2);
    visorHousingPts.push([xV, yV, zV, 0.040 * rFactor]);
    if (Math.abs(t) <= 0.88) {
      visorGlowPts.push([xV * 1.01, yV + 0.002, zV + Math.cos(ang) * 0.018, 0.026 * rFactor]);
    }
  }
  const visorHousing = tubeSweepMesh(visorHousingPts, 16, false);
  const visorGlow = tubeSweepMesh(visorGlowPts, 14, false);

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: chassis },
    { materialIndex: 3, mesh: chestPlate },
    { materialIndex: 1, mesh: chestBezel },
    { materialIndex: 2, mesh: chestCore },
    { materialIndex: 1, mesh: visorHousing },
    { materialIndex: 2, mesh: visorGlow }
  ];

  // Dorsal segmented titanium spine vents + twin thruster pods + telemetry antennae + hydraulic thigh pistons
  for (const uPlate of [0.28, 0.44, 0.58] as const) {
    slots.push({
      materialIndex: 3,
      mesh: sculptFrogSkinSpotMesh(roboProfile, uPlate, Math.PI * 0.5, 0.052, 0.22, 0.011, 4, 16)
    });
  }
  for (const sgn of [-1, 1] as const) {
    slots.push(
      // Twin swept telemetry antennae on the optic domes + cyan beacon tips
      {
        materialIndex: 3,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.135, 0.605, 0.11, 0.018],
            [sgn * 0.165, 0.685, 0.04, 0.012],
            [sgn * 0.182, 0.745, -0.02, 0.007]
          ],
          12,
          false
        )
      },
      {
        materialIndex: 2,
        mesh: transformMesh(icosphereSmoothMesh(0.019, 2, 0, 131, 0), {
          pos: [sgn * 0.184, 0.752, -0.024]
        })
      },
      // Twin crisp white optic catchlights on the cyan visor
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.016, 2, 0, 137, 0), {
          pos: [sgn * 0.125, 0.552, 0.296]
        })
      },
      // Angled dorsal jet-thruster nozzles on the upper back (`-Z` silhouette breakup!)
      {
        materialIndex: 1,
        mesh: transformMesh(
          latheMesh(
            [
              [0.022, -0.038],
              [0.052, -0.038],
              [0.058, 0.036],
              [0.038, 0.040],
              [0.022, -0.038]
            ],
            20,
            false
          ),
          { pos: [sgn * 0.095, 0.365, -0.145], rot: [-Math.PI * 0.5 + 0.42, sgn * 0.16, 0] }
        )
      },
      {
        materialIndex: 2,
        mesh: transformMesh(icosphereSmoothMesh(0.028, 2, 0, 141, 0), {
          pos: [sgn * 0.098, 0.352, -0.172],
          scale: [1, 1, 0.55]
        })
      },
      // Outer thigh brushed-steel hydraulic piston strut
      {
        materialIndex: 3,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.145, 0.215, -0.145, 0.014],
            [sgn * 0.268, 0.258, -0.005, 0.012]
          ],
          10,
          false
        )
      }
    );
  }

  // Articulated Z-folded mecha-frog haunches, gunmetal knee servos, 3-toed alloy landing pads (`minY = 0`)
  appendFrogLimbs(slots, 0, 3, 1.02, {
    thighMat: 0,
    calfMat: 1,
    foreMat: 0,
    webMat: 1,
    kneeAccentMat: 1
  });

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
  // 0: polished steel armor, 1: sage toad skin, 2: crimson plume, 3: heraldic blue shield,
  // 4: 24k gold trim, 5: golden-amber iris, 6: obsidian pupil, 7: catchlight
  const toadProfile: FrogAnatomyProfile = {
    widthScale: 1.05,
    eyeDomeAmp: 0.082,
    headFlare: 1.06,
    dorsolateralRidge: 0.010,
    pitchLift: 0.98
  };

  // Plump crouched sage-green amphibian toad body & wide smiling toad head
  const toadBody = sculptClosedParametricSurface(34, 38, (u, phi) => evalFrogSkinPoint(u, phi, toadProfile));

  // Conforming polished-steel breastplate & backplate cuirass shells over the crouched toad torso
  const breastplate = sculptFrogSurfacePatchMesh(
    toadProfile,
    0.18,
    0.64,
    (200 * Math.PI) / 180,
    (340 * Math.PI) / 180,
    18,
    22,
    0.018
  );
  const backplate = sculptFrogSurfacePatchMesh(
    toadProfile,
    0.14,
    0.60,
    (20 * Math.PI) / 180,
    (160 * Math.PI) / 180,
    18,
    22,
    0.018
  );
  // Golden gorget collar trim between steel cuirass and wide toad head
  const goldGorget = sculptFrogSurfacePatchMesh(
    toadProfile,
    0.58,
    0.65,
    (15 * Math.PI) / 180,
    (345 * Math.PI) / 180,
    8,
    26,
    0.021
  );

  // Domed steel sallet helm perched heroically on the toad crown above the twin raised toad eyes
  const helmPos: V3 = [0, 0.548, 0.095];
  const steelHelm = transformMesh(
    latheMesh(
      [
        [0.148, 0.0],
        [0.168, 0.032],
        [0.152, 0.115],
        [0.098, 0.175],
        [0.0, 0.198]
      ],
      28,
      false
    ),
    { pos: helmPos, rot: [-0.10, 0, 0] }
  );
  const helmTrim = transformMesh(
    latheMesh(
      [
        [0.145, -0.004],
        [0.174, 0.008],
        [0.174, 0.032],
        [0.148, 0.038],
        [0.145, -0.004]
      ],
      28,
      false
    ),
    { pos: helmPos, rot: [-0.10, 0, 0] }
  );
  // Sweeping crimson horsehair plume crest arcing gracefully behind the helm
  const plume = tubeSweepMesh(
    [
      [0, 0.735, 0.085, 0.032],
      [0, 0.825, 0.005, 0.056],
      [0, 0.795, -0.125, 0.052],
      [0, 0.675, -0.225, 0.036],
      [0, 0.555, -0.265, 0.015]
    ],
    16,
    false
  );

  // Smooth curved heraldic heater shield (zero flat `extrudePolygonMesh` walls!)
  const makeCurvedHeaterShield = (sx: number, sy: number, thick: number): RawMesh =>
    sculptClosedParametricSurface(16, 24, (u, phi) => {
      const theta = (1 - u) * Math.PI;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      const yNorm = ct; // -1 bottom tip .. +1 flat-arched top
      // Classic heater shield width tapers smoothly toward bottom tip `yNorm = -1`
      const taper = yNorm >= 0 ? 1 - 0.06 * yNorm * yNorm : Math.pow(Math.max(0.04, (yNorm + 1) * 0.5), 0.68) * 1.18;
      const xLocal = sx * st * Math.cos(phi) * taper;
      const yLocal = sy * spow(yNorm, 0.86);
      const zCurve = -0.028 * (xLocal / Math.max(0.01, sx)) ** 2;
      const zLocal = zCurve + thick * st * Math.sin(phi);
      return [xLocal, yLocal, zLocal];
    });

  const shieldRim = transformMesh(makeCurvedHeaterShield(0.142, 0.172, 0.016), {
    pos: [-0.258, 0.285, 0.148],
    rot: [0.10, -Math.PI * 0.42, 0.12]
  });
  const shieldBody = transformMesh(makeCurvedHeaterShield(0.124, 0.152, 0.020), {
    pos: [-0.264, 0.285, 0.151],
    rot: [0.10, -Math.PI * 0.42, 0.12]
  });
  const shieldBoss = transformMesh(icosphereSmoothMesh(0.036, 2, 0, 149, 0), {
    pos: [-0.282, 0.292, 0.160],
    scale: [0.62, 1, 1]
  });

  // Knight broadsword at right hip (smooth swept hilt, curved crossguard & steel scabbard — zero `chamferBox`!)
  const swordGrip = tubeSweepMesh(
    [
      [0.245, 0.255, 0.005, 0.017],
      [0.268, 0.345, 0.115, 0.019],
      [0.274, 0.368, 0.142, 0.026]
    ],
    12,
    false
  );
  const swordCrossguard = tubeSweepMesh(
    [
      [0.232, 0.322, 0.028, 0.012],
      [0.255, 0.292, 0.052, 0.018],
      [0.278, 0.262, 0.076, 0.012]
    ],
    12,
    false
  );
  const swordScabbard = tubeSweepMesh(
    [
      [0.245, 0.255, 0.005, 0.022],
      [0.222, 0.165, -0.145, 0.018],
      [0.210, 0.118, -0.225, 0.009]
    ],
    12,
    false
  );

  // Smiling toad lip crease
  const toadSmile = tubeSweepMesh(
    [
      [-0.19, 0.395, 0.215, 0.011],
      [-0.09, 0.368, 0.305, 0.013],
      [0.0, 0.360, 0.332, 0.013],
      [0.09, 0.368, 0.305, 0.013],
      [0.19, 0.395, 0.215, 0.011]
    ],
    10,
    false
  );

  const slots: MultiMatSlot[] = [
    { materialIndex: 1, mesh: toadBody },
    { materialIndex: 0, mesh: breastplate },
    { materialIndex: 0, mesh: backplate },
    { materialIndex: 4, mesh: goldGorget },
    { materialIndex: 0, mesh: steelHelm },
    { materialIndex: 4, mesh: helmTrim },
    { materialIndex: 2, mesh: plume },
    { materialIndex: 4, mesh: shieldRim },
    { materialIndex: 3, mesh: shieldBody },
    { materialIndex: 4, mesh: shieldBoss },
    { materialIndex: 4, mesh: swordGrip },
    { materialIndex: 4, mesh: swordCrossguard },
    { materialIndex: 0, mesh: swordScabbard },
    { materialIndex: 0, mesh: toadSmile }
  ];

  // Layered steel shoulder pauldrons with gold rivets
  for (const sgn of [-1, 1] as const) {
    slots.push(
      {
        materialIndex: 0,
        mesh: transformMesh(icosphereSmoothMesh(0.076, 2, 0, 151, 0.12), {
          pos: [sgn * 0.205, 0.358, 0.088],
          scale: [1.04, 0.72, 1.12]
        })
      },
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.015, 2, 0, 153, 0), {
          pos: [sgn * 0.268, 0.362, 0.092]
        })
      }
    );
  }

  // Z-folded muscular sage toad thighs + steel shin greaves, knee poleyns & 3-toed steel sabatons grounded at `y = 0`
  appendFrogLimbs(slots, 1, 0, 1.03, {
    thighMat: 1,
    calfMat: 0,
    foreMat: 0,
    webMat: 1,
    kneeAccentMat: 4
  });

  // Expressive horizontal-pupil golden-amber toad eyes peeking boldly beneath the sallet helm
  appendExpressiveEyes(slots, {
    x: 0.148,
    y: 0.535,
    z: 0.195,
    radius: 0.058,
    turretMat: 1,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7,
    horizontalPupil: true,
    outwardYaw: 0.36
  });

  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.knightPolishedSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.turtleSageSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.knightCrimsonPlume,
      CROSS_HOP_PROCEDURAL_MATERIALS.knightHeraldicBlue,
      CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold,
      CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris,
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
    { materialIndex: 1, mesh: transformMesh(icosphereSmoothMesh(0.068, 2, 0, 157, 0.1), { pos: [0, 0.855, 0.0], scale: [1.15, 0.45, 1.15] }) }
  ];
  // Ring of 7 raised white polka-dot spots around the scarlet cap dome
  for (let i = 0; i < 7; i += 1) {
    const a = (i / 7) * Math.PI * 2 + 0.25;
    const rad = i % 2 === 0 ? 0.28 : 0.22;
    const ySpot = i % 2 === 0 ? 0.67 : 0.75;
    slots.push({
      materialIndex: 1,
      mesh: transformMesh(icosphereSmoothMesh(0.056, 2, 0, 163 + i, 0.1), {
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
        12,
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
  // 0: EVA white suit & twin oxygen tanks, 1: NASA orange collar/knee-rings/pads,
  // 2: sculpted emerald frog head inside bubble, 3: brushed steel manifold & nozzles,
  // 4: practical thruster & telemetry glow, 5: golden-amber iris, 6: pupil, 7: catchlight + glass dome
  const evaTorso = verticalContourLoft(
    [
      { y: 0.11, rx: 0.165, rz: 0.165, z: -0.06, n: 2.0 },
      { y: 0.22, rx: 0.215, rz: 0.205, z: -0.01, n: 2.04 },
      { y: 0.35, rx: 0.205, rz: 0.195, z: 0.04, n: 2.04 },
      { y: 0.45, rx: 0.175, rz: 0.170, z: 0.06, n: 2.0 }
    ],
    32
  );

  // Anodized NASA-orange neck seal ring supporting the bubble helmet
  const neckRing = transformMesh(
    latheMesh(
      [
        [0.165, 0.455],
        [0.218, 0.465],
        [0.218, 0.502],
        [0.176, 0.512],
        [0.165, 0.455]
      ],
      28,
      false
    ),
    { pos: [0, 0, 0.06] }
  );

  // Sculpted wide smiling emerald tree-frog head with twin raised eye domes nestled cleanly inside the glass bubble!
  const innerHeadProfile: FrogAnatomyProfile = {
    widthScale: 0.62,
    eyeDomeAmp: 0.056,
    headFlare: 1.08,
    dorsolateralRidge: 0,
    pitchLift: 0.62
  };
  const frogHead = transformMesh(
    sculptClosedParametricSurface(26, 32, (u, phi) => {
      // Sample cranial half (`u in [0.45..1.0]`) with smooth spherical back-of-skull closure
      const uHead = 0.44 + 0.56 * u;
      const p = evalFrogSkinPoint(uHead, phi, innerHeadProfile);
      const backPinch = u < 0.18 ? Math.sin((u / 0.18) * (Math.PI * 0.5)) : 1;
      return [p[0] * backPinch, (p[1] - 0.34) * backPinch, (p[2] - 0.09) * backPinch];
    }),
    { pos: [0, 0.598, 0.055] }
  );
  const innerSmile = tubeSweepMesh(
    [
      [-0.105, 0.585, 0.165, 0.007],
      [0.0, 0.572, 0.212, 0.008],
      [0.105, 0.585, 0.165, 0.007]
    ],
    10,
    false
  );

  // Smooth pillowed chest telemetry pod + round indicator lenses (zero `chamferBox`!)
  const chestModule = transformMesh(sculptRoundedPillowMesh(0.165, 0.115, 0.052, 0.80, 12, 18), {
    pos: [0, 0.325, 0.228],
    rot: [-0.14, 0, 0]
  });

  // Curved white EVA sun-visor hood over the rear-top of the bubble helmet
  const sunShield = transformMesh(
    latheMesh(
      [
        [0.208, 0.725],
        [0.222, 0.748],
        [0.168, 0.828],
        [0.0, 0.862]
      ],
      28,
      false
    ),
    { pos: [0, 0, 0.04], rot: [-0.12, 0, 0] }
  );

  // Twin-cylinder Apollo life-support oxygen tanks + steel manifold on `-Z` (replaces flat rectangular box!)
  const oxygenTankProfile: V2[] = [
    [0.0, -0.135],
    [0.052, -0.132],
    [0.072, -0.102],
    [0.072, 0.098],
    [0.052, 0.128],
    [0.0, 0.138]
  ];
  const singleTank = latheMesh(oxygenTankProfile, 22, false);
  const packBridge = transformMesh(sculptRoundedPillowMesh(0.20, 0.16, 0.075, 0.84, 10, 16), {
    pos: [0, 0.315, -0.175],
    rot: [0.16, 0, 0]
  });

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: evaTorso },
    { materialIndex: 1, mesh: neckRing },
    { materialIndex: 2, mesh: frogHead },
    { materialIndex: 3, mesh: innerSmile },
    { materialIndex: 3, mesh: chestModule },
    {
      materialIndex: 1,
      mesh: transformMesh(icosphereSmoothMesh(0.022, 2, 0, 175, 0), {
        pos: [-0.038, 0.332, 0.252],
        scale: [1.15, 0.85, 0.45]
      })
    },
    {
      materialIndex: 4,
      mesh: transformMesh(icosphereSmoothMesh(0.020, 2, 0, 177, 0), {
        pos: [0.038, 0.332, 0.252],
        scale: [1.0, 1.0, 0.45]
      })
    },
    { materialIndex: 3, mesh: packBridge },
    { materialIndex: 0, mesh: sunShield },
    // Helmet comms whip antenna + glowing beacon tip
    {
      materialIndex: 3,
      mesh: tubeSweepMesh(
        [
          [0.135, 0.795, 0.02, 0.014],
          [0.172, 0.915, -0.02, 0.008]
        ],
        10,
        false
      )
    },
    {
      materialIndex: 4,
      mesh: transformMesh(icosphereSmoothMesh(0.019, 2, 0, 179, 0), {
        pos: [0.174, 0.922, -0.022]
      })
    }
  ];

  for (const sgn of [-1, 1] as const) {
    slots.push(
      // Rounded vertical oxygen cylinder + orange strap band
      {
        materialIndex: 0,
        mesh: transformMesh(singleTank, {
          pos: [sgn * 0.078, 0.325, -0.215],
          rot: [0.16, 0, 0]
        })
      },
      {
        materialIndex: 1,
        mesh: transformMesh(
          latheMesh(
            [
              [0.068, -0.014],
              [0.077, -0.014],
              [0.077, 0.014],
              [0.068, 0.014],
              [0.068, -0.014]
            ],
            22,
            false
          ),
          { pos: [sgn * 0.078, 0.335, -0.214], rot: [0.16, 0, 0] }
        )
      },
      // Angled bell thruster nozzle + warm plasma core under each oxygen tank
      {
        materialIndex: 3,
        mesh: transformMesh(
          latheMesh(
            [
              [0.024, 0.058],
              [0.044, 0.058],
              [0.062, 0.0],
              [0.052, 0.0],
              [0.024, 0.058]
            ],
            20,
            false
          ),
          { pos: [sgn * 0.078, 0.145, -0.242], rot: [0.16, 0, 0] }
        )
      },
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.032, 2, 0, 191, 0), {
          pos: [sgn * 0.078, 0.156, -0.240],
          scale: [1, 0.55, 1]
        })
      },
      // Orange EVA wrist seal ring on each planted forelimb
      {
        materialIndex: 1,
        mesh: transformMesh(icosphereSmoothMesh(0.036, 2, 0, 181, 0), {
          pos: [sgn * 0.196, 0.105, 0.198],
          scale: [1.05, 0.62, 1.05]
        })
      }
    );
  }

  // Pressurized Z-folded EVA frog hind legs, orange knee bellows & 3-toed webbed EVA moon-pad feet (`minY = 0`)
  appendFrogLimbs(slots, 0, 1, 0.98, {
    thighMat: 0,
    calfMat: 0,
    foreMat: 0,
    webMat: 1,
    kneeAccentMat: 1
  });

  // Golden-amber / obsidian frog eyes safely inside the `r = 0.225` transparent bubble dome
  appendExpressiveEyes(slots, {
    x: 0.088,
    y: 0.652,
    z: 0.168,
    radius: 0.044,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7,
    horizontalPupil: true,
    outwardYaw: 0.30
  });

  const bubbleDome = transformMesh(
    latheMesh(
      [
        [0.198, 0.495],
        [0.232, 0.605],
        [0.226, 0.715],
        [0.158, 0.815],
        [0.0, 0.855]
      ],
      32,
      false
    ),
    { pos: [0, 0, 0.06] }
  );

  return {
    slots,
    materials: [
      CROSS_HOP_PROCEDURAL_MATERIALS.astroEvaWhite,
      CROSS_HOP_PROCEDURAL_MATERIALS.astroCollarOrange,
      CROSS_HOP_PROCEDURAL_MATERIALS.frogEmeraldSkin,
      CROSS_HOP_PROCEDURAL_MATERIALS.anisotropicSteel,
      CROSS_HOP_PROCEDURAL_MATERIALS.rescueCoreGlow,
      CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris,
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
        CROSS_HOP_PROCEDURAL_MATERIALS.frogMintToePad,
        CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris,
        false
      );
    case "goldenHop":
      return buildFrogHeroRecipe(
        CROSS_HOP_PROCEDURAL_MATERIALS.sovereign24kGold,
        CROSS_HOP_PROCEDURAL_MATERIALS.royalBurnishedGold,
        CROSS_HOP_PROCEDURAL_MATERIALS.champagneGoldTrim,
        CROSS_HOP_PROCEDURAL_MATERIALS.champagneGoldTrim,
        CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera,
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
  readonly vocalSacSpec?: AuraCustomGeometrySpec;
  readonly vocalSacPivot?: V3;
  readonly vocalSacMaterial?: AuraMaterialSpec;
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
  const scan = (mesh: RawMesh, offset: V3 = [0, 0, 0]): void => {
    const pos = mesh.positions;
    for (let i = 0; i < pos.length; i += 3) {
      const x = pos[i]! + offset[0];
      const y = pos[i + 1]! + offset[1];
      const z = pos[i + 2]! + offset[2];
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
  if (recipe.vocalSacMesh && recipe.vocalSacPivot) scan(recipe.vocalSacMesh, recipe.vocalSacPivot);

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
  const vocalSacSpec = recipe.vocalSacMesh
    ? mergeRawMeshes([transformMesh(recipe.vocalSacMesh, { scale })])
    : undefined;
  const vocalSacPivot: V3 | undefined = recipe.vocalSacPivot
    ? [
        recipe.vocalSacPivot[0] * scale + tx,
        recipe.vocalSacPivot[1] * scale + ty,
        recipe.vocalSacPivot[2] * scale + tz
      ]
    : undefined;

  const entry: CachedCritterGeometry = {
    bodySpec,
    materials: recipe.materials,
    glassSpec,
    glassMaterial: recipe.glassMaterial,
    vocalSacSpec,
    vocalSacPivot,
    vocalSacMaterial: recipe.vocalSacMaterial,
    bounds: {
      min: [(minX - cx) * scale, 0, (minZ - cz) * scale],
      max: [(maxX - cx) * scale, targetHeight, (maxZ - cz) * scale]
    },
    vertexCount:
      bodySpec.positions.length / 3 +
      (glassSpec ? glassSpec.positions.length / 3 : 0) +
      (vocalSacSpec ? vocalSacSpec.positions.length / 3 : 0),
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
 * Deep mesh-quality & material-binding inspector for unit tests: verifies smooth shared-vertex normals,
 * zero `vertexColors` washout, cached reuse across respawns, and sculpted amphibian anatomy.
 */
export function inspectProceduralCritterMeshQuality(id: CritterAssetId, targetHeight = 1.05) {
  const first = getFittedCritterGeometry(id, targetHeight);
  const second = getFittedCritterGeometry(id, targetHeight);
  return {
    id,
    cacheReused: first === second,
    bounds: first.bounds,
    vertexCount: first.vertexCount,
    materialGroupCount: first.materialGroupCount,
    bodySpec: first.bodySpec,
    materials: first.materials,
    hasGlassDome: Boolean(first.glassSpec && first.glassMaterial),
    hasAnimatedVocalSac: Boolean(first.vocalSacSpec && first.vocalSacPivot && first.vocalSacMaterial),
    vocalSacPivot: first.vocalSacPivot
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
  const hasExtras = Boolean((g.glassSpec && g.glassMaterial) || (g.vocalSacSpec && g.vocalSacPivot && g.vocalSacMaterial));
  if (hasExtras) {
    const children: NonNullable<Parameters<typeof group>[1]>[number][] = [
      geometry.multiMaterial(g.bodySpec, [...g.materials], {
        name: `${opts.name}-body`,
        castShadow,
        receiveShadow
      })
    ];
    if (g.vocalSacSpec && g.vocalSacPivot && g.vocalSacMaterial) {
      children.push(
        geometry
          .custom(g.vocalSacSpec, {
            name: `${opts.name}-vocal-sac`,
            material: g.vocalSacMaterial,
            castShadow,
            receiveShadow
          })
          .position(g.vocalSacPivot[0], g.vocalSacPivot[1], g.vocalSacPivot[2])
          .runtime(game.runtimeNode(`${opts.name}-vocal-sac`))
      );
    }
    if (g.glassSpec && g.glassMaterial) {
      children.push(
        geometry.custom(g.glassSpec, {
          name: `${opts.name}-helmet-glass`,
          material: g.glassMaterial,
          castShadow: false,
          receiveShadow: false
        })
      );
    }
    return group(opts.name, children);
  }
  return geometry.multiMaterial(g.bodySpec, [...g.materials], {
    name: opts.name,
    castShadow,
    receiveShadow
  });
}
