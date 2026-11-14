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
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  deformMesh,
  extrudePolygonMesh,
  icosphereFacetMesh,
  icosphereSmoothMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  mergeRawMeshes,
  paintMeshColors,
  recomputeSmoothWeldedNormals,
  sculptAnatomicalLimbMesh,
  sculptCurvedHairLockMesh,
  sculptHumanoidLimbMesh,
  sculptOrganicSdfMesh,
  sculptStreamlinedHullMesh,
  sdfEllipsoid,
  sdfTaperedCapsule,
  smaxPoly,
  sminPoly,
  srgbHexToLinearRgba,
  srgbToLinearChannel,
  subdivideSmoothMesh,
  taubinSmoothMesh,
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
    roughness: 0.28,
    metalness: 0.12,
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
  // Sculpted playable critter physical materials (warm matte-velvet amphibian skin, tangerine webbed toes, coral bandana, 24k gold & practical LEDs)
  frogEmeraldSkin: material.pbr({
    color: "#ffffff",
    roughness: 0.56,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.04
  }),
  frogLeafSpot: material.pbr({
    color: "#1e7a44",
    roughness: 0.56,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.22
  }),
  frogMintToePad: material.pbr({
    color: "#ff7a1a",
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.56
  }),
  frogTangerineFoot: material.pbr({
    color: "#ffffff",
    roughness: 0.54,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.56
  }),
  frogCoralBandana: material.pbr({
    color: "#ffffff",
    roughness: 0.68,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.52
  }),
  frogGoldenIris: material.pbr({
    color: "#f59e0b",
    emissive: "#d97706",
    emissiveIntensity: 0.10,
    roughness: 0.14,
    metalness: 0,
    clearcoat: 0.92,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.18,
    practical: true
  }),
  royalBurnishedGold: material.studioMetal({
    color: "#c88719",
    roughness: 0.22,
    metalness: 0.94,
    envMapIntensity: 1.38
  }),
  critterCreamBelly: material.pbr({
    color: "#fef3c7",
    roughness: 0.58,
    metalness: 0,
    clearcoat: 0,
    envMapIntensity: 0.52
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

function rawToColoredMesh(painted: RawMesh): ColoredRawMesh {
  const { colors: rawColors, ...geom } = painted;
  return rawColors ? { ...geom, colors: new Float32Array(rawColors) } : geom;
}

/** Stamps linear-space sRGB `[r, g, b]` + smooth cavity AO onto a `RawMesh` for single-draw multi-tone instancing. */
function tintRawMesh(mesh: RawMesh, rgb: Rgb, aoStrength = 0.16): ColoredRawMesh {
  const lin: V4 = [
    srgbToLinearChannel(rgb[0]),
    srgbToLinearChannel(rgb[1]),
    srgbToLinearChannel(rgb[2]),
    1
  ];
  return rawToColoredMesh(bakeMeshCavityAO(paintMeshColors(mesh, lin, false), aoStrength));
}

function paintHexPart(mesh: RawMesh, hex: string, aoStrength = 0.18): ColoredRawMesh {
  return rawToColoredMesh(bakeMeshCavityAO(paintMeshColors(mesh, hex, false), aoStrength));
}

function lerpRgba(a: V4, b: V4, t: number): V4 {
  const k = Math.max(0, Math.min(1, t));
  return [
    a[0] + (b[0] - a[0]) * k,
    a[1] + (b[1] - a[1]) * k,
    a[2] + (b[2] - a[2]) * k,
    1
  ];
}

/** Paints compound-curve automotive bodywork with studio sky-to-beltline sheen + lower-rocker roll-off + cavity AO. */
function paintAutomotiveBody(
  mesh: RawMesh,
  lowHex: string,
  highHex: string,
  aoStrength = 0.22,
  customMod?: (pos: V3, norm: V3, base: V4) => V4
): ColoredRawMesh {
  const cLow = srgbHexToLinearRgba(lowHex);
  const cHigh = srgbHexToLinearRgba(highHex);
  let minY = Infinity, maxY = -Infinity;
  for (let i = 1; i < mesh.positions.length; i += 3) {
    const y = mesh.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanY = Math.max(0.08, maxY - minY);
  const painted = paintMeshColors(
    mesh,
    (pos, norm) => {
      const hFrac = Math.max(0, Math.min(1, (pos[1] - minY) / spanY));
      const skyFace = Math.max(0, Math.min(1, norm[1] * 0.55 + 0.45));
      const t = Math.max(0, Math.min(1, hFrac * 0.62 + skyFace * 0.38));
      let col = lerpRgba(cLow, cHigh, t);
      if (hFrac < 0.16) {
        const rockerShade = 0.76 + (hFrac / 0.16) * 0.24;
        col = [col[0] * rockerShade, col[1] * rockerShade, col[2] * rockerShade, 1];
      }
      return customMod ? customMod(pos, norm, col) : col;
    },
    false
  );
  return rawToColoredMesh(bakeMeshCavityAO(painted, aoStrength));
}

/** Paints recessed tinted automotive glass with a crisp horizon-to-zenith reflection gradient. */
function paintAutomotiveGlass(mesh: RawMesh): ColoredRawMesh {
  const cDeep = srgbHexToLinearRgba("#0d1e33");
  const cSky = srgbHexToLinearRgba("#2f6396");
  const painted = paintMeshColors(
    mesh,
    (_pos, norm) => {
      const refl = Math.max(0, Math.min(1, norm[1] * 0.68 + Math.abs(norm[0]) * 0.18 + 0.24));
      return lerpRgba(cDeep, cSky, refl);
    },
    false
  );
  return rawToColoredMesh(bakeMeshCavityAO(painted, 0.10));
}

function transformColoredMesh(src: ColoredRawMesh, opts: Parameters<typeof transformMesh>[1]): ColoredRawMesh {
  const { colors: srcColors, ...rawSrc } = src;
  const { colors: _unusedOutColors, ...out } = transformMesh(rawSrc, opts);
  void _unusedOutColors;
  return srcColors ? { ...out, colors: srcColors } : out;
}

function placeTinted(src: RawMesh, opts: Parameters<typeof transformMesh>[1], rgb: Rgb, aoStrength = 0.16): ColoredRawMesh {
  return tintRawMesh(transformMesh(src, opts), rgb, aoStrength);
}

function placeHexPart(src: RawMesh, opts: Parameters<typeof transformMesh>[1], hex: string, aoStrength = 0.18): ColoredRawMesh {
  return paintHexPart(transformMesh(src, opts), hex, aoStrength);
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

const HEX_TIRE = "#1d2128";
const HEX_RIM = "#e6edf6";
const HEX_CHROME = "#d8e1ec";
const HEX_CARBON = "#232832";
const HEX_WELL_LINER = "#10141b";
const HEX_GRILLE = "#171b23";
const HEX_HEADLIGHT = "#fff7d6";
const HEX_TURN_AMBER = "#ffaa2b";
const HEX_TAILLIGHT = "#ff263d";

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

function smoothStep01(t: number): number {
  const x = Math.max(0, Math.min(1, t));
  return x * x * (3 - 2 * x);
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

/** Lofts a semicircular recessed dark inner wheel-arch liner shell over each wheel opening. */
function buildWheelArchLinerMesh(axleZ: number, side: -1 | 1, outerX: number, innerX: number, wheelR: number, archR: number, sillY: number): RawMesh {
  const steps = 9;
  const outerRing: V3[] = [];
  const innerRing: V3[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = Math.PI - (i / steps) * Math.PI;
    const z = axleZ + Math.cos(a) * archR;
    const y = Math.max(sillY, wheelR * 0.92 + Math.sin(a) * archR * 0.96);
    outerRing.push([side * outerX, y, z]);
    innerRing.push([side * innerX, y, z]);
  }
  outerRing.push([side * outerX, sillY, axleZ]);
  innerRing.push([side * innerX, sillY, axleZ]);
  return loftSectionsMesh(side > 0 ? [innerRing, outerRing] : [outerRing, innerRing], true, false);
}

function appendWheelSet(
  out: ColoredRawMesh[],
  axlesZ: readonly number[],
  trackHalfX: number,
  radius: number,
  width: number,
  withArchLiners = true,
  bodyHalfW = trackHalfX + width * 0.52
): void {
  const wheelSlots = wheelAssemblySlots({ radius, width, spokeCount: 5, tireMat: 0, rimMat: 1, rotorMat: 2 });
  const sillY = radius * 0.58;
  const archR = radius * 1.18;
  for (const az of axlesZ) {
    for (const side of [-1, 1] as const) {
      if (withArchLiners) {
        out.push(
          paintHexPart(
            buildWheelArchLinerMesh(az, side, bodyHalfW * 0.96, Math.max(0.10, trackHalfX - width * 0.62), radius, archR, sillY),
            HEX_WELL_LINER,
            0.25
          )
        );
      }
      for (const slot of wheelSlots) {
        const hex = slot.materialIndex === 0 ? HEX_TIRE : slot.materialIndex === 1 ? HEX_RIM : HEX_CHROME;
        out.push(
          placeHexPart(
            slot.mesh,
            {
              pos: [side * trackHalfX, radius, az],
              rot: side < 0 ? [0, Math.PI, 0] : [0, 0, 0]
            },
            hex,
            slot.materialIndex === 0 ? 0.22 : 0.14
          )
        );
      }
    }
  }
}

interface CompoundUnibodyConfig {
  readonly halfLen: number;
  readonly halfW: number;
  readonly sillY: number;
  readonly beltY: number;
  readonly noseY: number;
  readonly tailY: number;
  readonly roofY: number;
  readonly cabinFrontZ: number;
  readonly frontRoofZ: number;
  readonly rearRoofZ: number;
  readonly cabinRearZ: number;
  readonly roofTaper: number; // ~0.66..0.78 -> pronounced tumblehome!
  readonly frontAxleZ: number;
  readonly rearAxleZ: number;
  readonly wheelR: number;
  readonly flareAmp: number;
  readonly hoodCrown?: number;
  readonly nosePlanTaper?: number;
  readonly tailPlanTaper?: number;
}

function evalAutoCrossSection(
  z: number,
  c: CompoundUnibodyConfig
): {
  readonly sillHere: number;
  readonly beltHere: number;
  readonly topY: number;
  readonly rockerW: number;
  readonly doorMidW: number;
  readonly shoulderW: number;
  readonly upperMidW: number;
  readonly topW: number;
  readonly roofCrown: number;
  readonly inGreenhouse: number;
} {
  const L = c.halfLen;
  const zNorm = Math.max(-1, Math.min(1, z / L));

  // Boat-tail & aerodynamic nose plan-view curvature (never parallel slab walls!)
  const foreTaper = zNorm > 0.48 ? 1 - (1 - (c.nosePlanTaper ?? 0.80)) * Math.pow((zNorm - 0.48) / 0.52, 1.65) : 1;
  const aftTaper = zNorm < -0.52 ? 1 - (1 - (c.tailPlanTaper ?? 0.84)) * Math.pow((-zNorm - 0.52) / 0.48, 1.65) : 1;
  const midSwell = 1 + 0.035 * Math.cos(zNorm * Math.PI * 0.85);
  const planScale = foreTaper * aftTaper * midSwell;

  // 3D flared wheel-arch blisters & semicircular wheel-well arch openings
  const archR = c.wheelR * 1.18;
  let archLift = 0;
  let flare = 0;
  for (const az of [c.frontAxleZ, c.rearAxleZ]) {
    const dz = Math.abs(z - az);
    if (dz < archR) {
      const lift = c.wheelR * 0.90 + Math.sqrt(Math.max(0, archR * archR - dz * dz)) * 0.94 - c.sillY;
      if (lift > archLift) archLift = lift;
    }
    flare += c.flareAmp * Math.exp(-Math.pow(dz / (archR * 0.95), 2));
  }
  // Gently sweep bumper aprons upward at extreme nose & tail overhangs
  const endSweep = zNorm > 0.82
    ? 0.045 * Math.pow((zNorm - 0.82) / 0.18, 1.6)
    : zNorm < -0.82
      ? 0.050 * Math.pow((-zNorm - 0.82) / 0.18, 1.6)
      : 0;
  const sillHere = c.sillY + Math.max(archLift * 0.88, endSweep);

  // Smooth beltline wave (subtle athletic coke-bottle / haunch rise over rear fender)
  const beltHere =
    z >= c.cabinFrontZ
      ? c.noseY + (c.beltY - c.noseY) * Math.pow(Math.max(0, 1 - (z - c.cabinFrontZ) / Math.max(0.08, L - c.cabinFrontZ)), 0.68)
      : z <= c.cabinRearZ
        ? c.tailY + (c.beltY - c.tailY) * smoothStep01((z + L) / Math.max(0.06, c.cabinRearZ + L))
        : c.beltY + 0.014 * Math.exp(-Math.pow((z - c.rearAxleZ) / 0.34, 2));

  // Greenhouse longitudinal profile (sloped hood -> raked windshield -> crowned roof -> fastback/hatch C-pillar)
  let inGreenhouse = 0;
  if (z >= c.rearRoofZ && z <= c.frontRoofZ) {
    inGreenhouse = 1;
  } else if (z > c.frontRoofZ && z < c.cabinFrontZ) {
    inGreenhouse = 1 - smoothStep01((z - c.frontRoofZ) / Math.max(0.04, c.cabinFrontZ - c.frontRoofZ));
  } else if (z < c.rearRoofZ && z > c.cabinRearZ) {
    inGreenhouse = 1 - smoothStep01((c.rearRoofZ - z) / Math.max(0.04, c.rearRoofZ - c.cabinRearZ));
  }

  const roofArchLong =
    inGreenhouse > 0.01
      ? 0.022 * Math.sin(Math.PI * Math.max(0, Math.min(1, (z - c.cabinRearZ) / Math.max(0.1, c.cabinFrontZ - c.cabinRearZ))))
      : 0;
  const hoodBulge =
    z > c.cabinFrontZ - 0.05
      ? (c.hoodCrown ?? 0.028) * Math.sin(Math.PI * Math.max(0, Math.min(1, (z - c.cabinFrontZ) / Math.max(0.1, L - c.cabinFrontZ))))
      : 0;

  const deckY = beltHere + 0.024 + hoodBulge;
  const topY = deckY + (c.roofY + roofArchLong - deckY) * inGreenhouse;

  const baseW = c.halfW * planScale;
  const shoulderW = baseW + flare;
  const rockerW = baseW * 0.82 + flare * 0.32;
  const doorMidW = baseW * 0.98 + flare * 0.92;
  // Pronounced tumblehome: roof rail is substantially narrower than shoulder + flared wheel arches!
  const deckTopW = baseW * 0.78;
  const greenhouseTopW = c.halfW * c.roofTaper * (0.94 + 0.06 * planScale);
  const topW = deckTopW + (greenhouseTopW - deckTopW) * inGreenhouse;
  const upperMidW = shoulderW * 0.90 * (1 - inGreenhouse) + (shoulderW * 0.84 * 0.42 + topW * 0.58) * inGreenhouse;
  const roofCrown = 0.020 + 0.014 * inGreenhouse;

  return {
    sillHere,
    beltHere: Math.max(sillHere + 0.045, beltHere),
    topY: Math.max(sillHere + 0.075, topY),
    rockerW,
    doorMidW,
    shoulderW,
    upperMidW,
    topW,
    roofCrown,
    inGreenhouse
  };
}

/**
 * Sculpts a seamless, smooth-subdivided compound-curve 3D automotive unibody with convex barrel doors,
 * 3D flared wheel-arch blisters, sloped hood, raked pillars, crowned roof, and pronounced tumblehome.
 */
function sculptCompoundUnibodyMesh(c: CompoundUnibodyConfig): RawMesh {
  const L = c.halfLen;
  // Sorted longitudinal stations densely sampling nose/tail curves, wheel arches, and pillar transitions
  const rawZs = [
    -L,
    -L * 0.965,
    -L * 0.90,
    c.rearAxleZ - c.wheelR * 1.12,
    c.rearAxleZ - c.wheelR * 0.55,
    c.rearAxleZ,
    c.rearAxleZ + c.wheelR * 0.55,
    c.rearAxleZ + c.wheelR * 1.12,
    c.cabinRearZ,
    (c.cabinRearZ + c.rearRoofZ) * 0.5,
    c.rearRoofZ,
    (c.rearRoofZ + c.frontRoofZ) * 0.5,
    c.frontRoofZ,
    (c.frontRoofZ + c.cabinFrontZ) * 0.5,
    c.cabinFrontZ,
    c.frontAxleZ - c.wheelR * 1.12,
    c.frontAxleZ - c.wheelR * 0.55,
    c.frontAxleZ,
    c.frontAxleZ + c.wheelR * 0.55,
    c.frontAxleZ + c.wheelR * 1.12,
    L * 0.90,
    L * 0.965,
    L
  ]
    .map((z) => Math.max(-L, Math.min(L, z)))
    .sort((a, b) => a - b);

  const zs: number[] = [];
  for (const z of rawZs) {
    if (zs.length === 0 || z - zs[zs.length - 1]! > 0.018) zs.push(z);
  }
  if (L - zs[zs.length - 1]! > 1e-4) zs.push(L);

  const rings: V3[][] = zs.map((z, idx) => {
    const endPin = idx === 0 || idx === zs.length - 1 ? 0.88 : 1;
    const s = evalAutoCrossSection(z, c);
    const doorMidY = s.sillHere + (s.beltHere - s.sillHere) * 0.52;
    const upperMidY = s.beltHere + (s.topY - s.beltHere) * 0.54;
    const rw = s.rockerW * endPin;
    const dmw = s.doorMidW * endPin;
    const sw = s.shoulderW * endPin;
    const bStepW = (s.shoulderW * 0.93) * endPin;
    const umw = s.upperMidW * endPin;
    const tw = s.topW * endPin;
    return [
      [0, s.sillHere - 0.008, z],
      [rw * 0.55, s.sillHere - 0.004, z],
      [rw, s.sillHere + 0.012, z],
      [dmw, doorMidY, z],
      [sw, s.beltHere - 0.012, z],
      [bStepW, s.beltHere + 0.014, z],
      [umw, upperMidY, z],
      [tw, s.topY - 0.012, z],
      [tw * 0.52, s.topY + s.roofCrown * 0.78, z],
      [0, s.topY + s.roofCrown, z],
      [-tw * 0.52, s.topY + s.roofCrown * 0.78, z],
      [-tw, s.topY - 0.012, z],
      [-umw, upperMidY, z],
      [-bStepW, s.beltHere + 0.014, z],
      [-sw, s.beltHere - 0.012, z],
      [-dmw, doorMidY, z],
      [-rw, s.sillHere + 0.012, z],
      [-rw * 0.55, s.sillHere - 0.004, z]
    ];
  });

  return subdivideSmoothMesh(loftSectionsMesh(rings, true, false), 1, 0.36);
}

/** Builds compound-curve wraparound tinted windshield, backlight & side window glass + dark pillar frames. */
function buildContouredCabinGlassMeshes(c: CompoundUnibodyConfig): {
  readonly glassMeshes: RawMesh[];
  readonly frameMeshes: RawMesh[];
} {
  const glassMeshes: RawMesh[] = [];
  const frameMeshes: RawMesh[] = [];

  // 1. Curved wrap-around front windshield + dark cowl/pillar bezel
  const wsBot = evalAutoCrossSection(c.cabinFrontZ - 0.02, c);
  const wsTop = evalAutoCrossSection(c.frontRoofZ + 0.02, c);
  const makeArcStrip = (
    z0: number,
    y0: number,
    w0: number,
    bowZ0: number,
    z1: number,
    y1: number,
    w1: number,
    bowZ1: number,
    thick: number
  ): RawMesh => {
    const cols = 9;
    const makeRow = (zBase: number, yBase: number, halfSpan: number, bowZ: number): V3[] => {
      const pts: V3[] = [];
      for (let i = 0; i <= cols; i += 1) {
        const u = (i / cols) * 2 - 1; // -1..+1
        const crownY = (1 - u * u) * 0.016;
        const curveZ = (1 - u * u) * bowZ;
        pts.push([u * halfSpan, yBase + crownY, zBase + curveZ]);
      }
      for (let i = cols; i >= 0; i -= 1) {
        const u = (i / cols) * 2 - 1;
        const crownY = (1 - u * u) * 0.016;
        const curveZ = (1 - u * u) * bowZ;
        pts.push([u * halfSpan, yBase + crownY - thick, zBase + curveZ - Math.sign(bowZ || 1) * thick]);
      }
      return pts;
    };
    return loftSectionsMesh(
      [makeRow(z0, y0, w0, bowZ0), makeRow(z1, y1, w1, bowZ1)],
      true,
      false
    );
  };

  frameMeshes.push(
    makeArcStrip(
      c.cabinFrontZ - 0.015,
      wsBot.beltHere + 0.022,
      wsBot.shoulderW * 0.81,
      0.048,
      c.frontRoofZ + 0.01,
      wsTop.topY - 0.012,
      wsTop.topW * 0.91,
      0.032,
      0.022
    )
  );
  glassMeshes.push(
    makeArcStrip(
      c.cabinFrontZ + 0.006,
      wsBot.beltHere + 0.042,
      wsBot.shoulderW * 0.76,
      0.060,
      c.frontRoofZ + 0.032,
      wsTop.topY - 0.018,
      wsTop.topW * 0.86,
      0.044,
      0.014
    )
  );

  // 2. Curved wrap-around rear backlight + surround frame
  const blBot = evalAutoCrossSection(c.cabinRearZ + 0.02, c);
  const blTop = evalAutoCrossSection(c.rearRoofZ - 0.02, c);
  frameMeshes.push(
    makeArcStrip(
      c.cabinRearZ + 0.015,
      blBot.beltHere + 0.022,
      blBot.shoulderW * 0.79,
      -0.044,
      c.rearRoofZ - 0.01,
      blTop.topY - 0.012,
      blTop.topW * 0.89,
      -0.030,
      0.022
    )
  );
  glassMeshes.push(
    makeArcStrip(
      c.cabinRearZ - 0.006,
      blBot.beltHere + 0.042,
      blBot.shoulderW * 0.74,
      -0.056,
      c.rearRoofZ - 0.032,
      blTop.topY - 0.018,
      blTop.topW * 0.84,
      -0.042,
      0.014
    )
  );

  // 3. Tumblehome-curved left & right side window bands + crisp B-pillar divider
  const zRearWin = c.cabinRearZ + (c.rearRoofZ - c.cabinRearZ) * 0.35 + 0.03;
  const zFrontWin = c.cabinFrontZ - (c.cabinFrontZ - c.frontRoofZ) * 0.35 - 0.03;
  const winStations = 7;
  for (const side of [-1, 1] as const) {
    const sideGlassRings: V3[][] = [];
    for (let k = 0; k < winStations; k += 1) {
      const f = k / (winStations - 1);
      const z = zRearWin + (zFrontWin - zRearWin) * f;
      const st = evalAutoCrossSection(z, c);
      const endTaper = Math.sin(Math.PI * (0.12 + 0.76 * f));
      const yBot = st.beltHere + 0.034;
      const yTop = st.topY - 0.026 * (1.15 - 0.25 * endTaper);
      const xBot = side * (st.shoulderW * 0.935 + 0.012);
      const xMid = side * (st.upperMidW + 0.014);
      const xTop = side * (st.topW + 0.010);
      const inset = side * -0.010;
      sideGlassRings.push([
        [xBot, yBot, z],
        [xMid, (yBot + yTop) * 0.52, z],
        [xTop, yTop, z],
        [xTop + inset, yTop, z],
        [xMid + inset, (yBot + yTop) * 0.52, z],
        [xBot + inset, yBot, z]
      ]);
    }
    glassMeshes.push(loftSectionsMesh(sideGlassRings, true, false));

    // Sleek raked B-pillar strut following exact tumblehome slope
    const zB = c.rearRoofZ * 0.42 + c.frontRoofZ * 0.58;
    const stB = evalAutoCrossSection(zB, c);
    frameMeshes.push(
      tubeSweepMesh(
        [
          [side * stB.shoulderW * 0.91, stB.beltHere + 0.025, zB + 0.01, 0.022],
          [side * stB.upperMidW * 1.012, (stB.beltHere + stB.topY) * 0.52, zB, 0.020],
          [side * stB.topW * 0.99, stB.topY - 0.02, zB - 0.015, 0.018]
        ],
        10,
        false
      )
    );
  }

  return { glassMeshes, frameMeshes };
}

/** Lofts a curved wrap-around front bumper splitter or rear diffuser following the bow/stern plan arc. */
function buildCurvedBumperMesh(zBase: number, bowZ: number, halfW: number, yCenter: number, halfH: number, depth: number): RawMesh {
  const segs = 9;
  const rings: V3[][] = [];
  for (let i = 0; i <= segs; i += 1) {
    const u = (i / segs) * 2 - 1;
    const x = u * halfW;
    const zCurve = zBase + (1 - u * u) * bowZ;
    const hScale = 1 - 0.16 * u * u;
    const hh = halfH * hScale;
    const hd = depth * 0.5;
    rings.push([
      [x, yCenter - hh, zCurve - hd],
      [x, yCenter - hh * 0.55, zCurve + hd],
      [x, yCenter + hh * 0.65, zCurve + hd],
      [x, yCenter + hh, zCurve - hd * 0.6]
    ]);
  }
  return subdivideSmoothMesh(loftSectionsMesh(rings, true, false), 1, 0.35);
}

interface RoadCarRecipe {
  readonly paintLow: string;
  readonly paintHigh: string;
  readonly roofAccentLow?: string;
  readonly roofAccentHigh?: string;
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
  const sillY = r.wheelR * 0.58;
  const axleZ = L * 0.60;
  const cabSpan = r.cabinFrontZ - r.cabinRearZ;
  const frontRoofZ = r.cabinFrontZ - cabSpan * (r.kind === "van" ? 0.19 : 0.27);
  const rearRoofZ = r.cabinRearZ + cabSpan * (r.kind === "van" ? 0.12 : r.kind === "suv" ? 0.16 : r.kind === "hatch" ? 0.21 : 0.28);
  const noseY = r.kind === "van" ? r.beltY - 0.04 : sillY + (r.beltY - sillY) * 0.64;
  const tailY = r.kind === "van" || r.kind === "suv" ? r.beltY - 0.01 : r.beltY - 0.035;

  const cfg: CompoundUnibodyConfig = {
    halfLen: L,
    halfW: W,
    sillY,
    beltY: r.beltY,
    noseY,
    tailY,
    roofY: r.roofY,
    cabinFrontZ: r.cabinFrontZ,
    frontRoofZ,
    rearRoofZ,
    cabinRearZ: r.cabinRearZ,
    roofTaper: r.roofTaper,
    frontAxleZ: axleZ,
    rearAxleZ: -axleZ,
    wheelR: r.wheelR,
    flareAmp: r.kind === "suv" ? 0.048 : r.kind === "van" ? 0.028 : 0.042,
    hoodCrown: r.kind === "car" ? 0.034 : r.kind === "van" ? 0.016 : 0.026,
    nosePlanTaper: r.kind === "van" ? 0.86 : 0.79,
    tailPlanTaper: r.kind === "van" ? 0.88 : 0.83
  };

  const unibody = sculptCompoundUnibodyMesh(cfg);
  const cCheckerBlack = srgbHexToLinearRgba("#141820");
  const cCheckerWhite = srgbHexToLinearRgba("#f8fafc");
  const cRoofLow = r.roofAccentLow ? srgbHexToLinearRgba(r.roofAccentLow) : null;
  const cRoofHigh = r.roofAccentHigh ? srgbHexToLinearRgba(r.roofAccentHigh) : null;
  const cClad = srgbHexToLinearRgba("#1f2530");

  out.push(
    paintAutomotiveBody(unibody, r.paintLow, r.paintHigh, 0.22, (pos, _norm, base) => {
      // Two-tone camper van upper shell or hot-hatch floating roof
      if (cRoofLow && cRoofHigh) {
        const splitY = r.kind === "van" ? r.beltY - 0.015 : r.roofY - 0.075;
        if (pos[1] > splitY) {
          const blend = smoothStep01((pos[1] - splitY) / 0.035);
          const roofCol = lerpRgba(cRoofLow, cRoofHigh, Math.min(1, (pos[1] - splitY) / 0.25));
          return lerpRgba(base, roofCol, blend);
        }
      }
      // Crisp taxi black-and-white checkered beltline stripe along the curved flanks
      if (r.kind === "taxi" && Math.abs(pos[0]) > W * 0.78 && Math.abs(pos[2]) < L * 0.56) {
        const dy = pos[1] - (r.beltY - 0.055);
        if (dy > 0 && dy < 0.056) {
          const row = dy > 0.028 ? 1 : 0;
          const colIdx = Math.floor((pos[2] + 4) / 0.075);
          return (colIdx + row) % 2 === 0 ? cCheckerBlack : cCheckerWhite;
        }
      }
      // Rugged SUV satin charcoal lower rocker & wheel-arch cladding
      if (r.kind === "suv" && pos[1] < sillY + 0.075) {
        return lerpRgba(cClad, base, smoothStep01((pos[1] - (sillY + 0.04)) / 0.035));
      }
      return base;
    })
  );

  // Recessed dark chassis undertray
  out.push(
    placeHexPart(
      sculptRoundedPillowMesh(W * 1.48, 0.07, L * 1.62, 0.72, 10, 16),
      { pos: [0, sillY + 0.015, 0] },
      HEX_WELL_LINER,
      0.24
    )
  );

  // Contoured wraparound tinted cabin glass + raked dark pillar frames
  const { glassMeshes, frameMeshes } = buildContouredCabinGlassMeshes(cfg);
  for (const fm of frameMeshes) out.push(paintHexPart(fm, HEX_CARBON, 0.18));
  for (const gm of glassMeshes) out.push(paintAutomotiveGlass(gm));

  // Curved front splitter/bumper, contoured grille + chrome bezel, rear diffuser & twin exhausts
  const noseSt = evalAutoCrossSection(L * 0.96, cfg);
  const tailSt = evalAutoCrossSection(-L * 0.96, cfg);
  const grilleY = (sillY + noseY) * 0.54;
  out.push(
    paintHexPart(
      buildCurvedBumperMesh(L * 0.955, 0.058, noseSt.shoulderW * 0.98, sillY + 0.036, 0.046, 0.085),
      r.kind === "suv" || r.kind === "hatch" ? HEX_CARBON : HEX_CHROME,
      0.20
    ),
    paintHexPart(
      buildCurvedBumperMesh(-L * 0.955, -0.052, tailSt.shoulderW * 0.98, sillY + 0.040, 0.048, 0.085),
      r.kind === "suv" || r.kind === "car" || r.kind === "hatch" ? HEX_CARBON : HEX_CHROME,
      0.20
    ),
    placeHexPart(
      sculptRoundedPillowMesh(W * 0.94, (noseY - sillY) * 0.54, 0.058, 0.74, 10, 16),
      { pos: [0, grilleY, L * 0.985] },
      HEX_GRILLE,
      0.24
    ),
    paintHexPart(
      tubeSweepMesh(
        [
          [-W * 0.44, grilleY + 0.012, L * 0.982, 0.013],
          [0, grilleY + 0.020, L * 1.012, 0.015],
          [W * 0.44, grilleY + 0.012, L * 0.982, 0.013]
        ],
        10,
        false
      ),
      HEX_CHROME,
      0.12
    )
  );

  // Sculpted projector headlights + LED DRL brow, amber corner lenses, wraparound ruby LED taillight blades & teardrop wing mirrors
  for (const sgn of [-1, 1] as const) {
    const hlX = sgn * W * 0.59;
    const hlY = grilleY + 0.048;
    const hlZ = L * 0.945;
    out.push(
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.34, 0.095, 0.075, 0.80, 10, 16),
        { pos: [hlX, hlY, hlZ], rot: [0, sgn * 0.24, -sgn * 0.08] },
        HEX_CARBON,
        0.18
      ),
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.26, 0.068, 0.065, 0.90, 12, 18),
        { pos: [hlX, hlY, hlZ + 0.018], rot: [0, sgn * 0.24, -sgn * 0.08] },
        HEX_HEADLIGHT,
        0.04
      ),
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.11, 0.058, 0.055, 0.88, 8, 14),
        { pos: [sgn * W * 0.75, hlY - 0.01, hlZ - 0.022], rot: [0, sgn * 0.38, 0] },
        HEX_TURN_AMBER,
        0.06
      ),
      // Wraparound ruby LED taillight housing + glowing crimson blade
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.38, 0.088, 0.068, 0.78, 10, 16),
        { pos: [sgn * W * 0.56, tailY - 0.055, -L * 0.955], rot: [0, -sgn * 0.22, 0] },
        HEX_CARBON,
        0.18
      ),
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.34, 0.066, 0.062, 0.86, 12, 18),
        { pos: [sgn * W * 0.56, tailY - 0.055, -L * 0.968], rot: [0, -sgn * 0.22, 0] },
        HEX_TAILLIGHT,
        0.04
      ),
      // Swept mirror stalk + teardrop aerodynamic mirror shell
      paintHexPart(
        tubeSweepMesh(
          [
            [sgn * W * 0.82, r.beltY + 0.022, r.cabinFrontZ - 0.14, 0.015],
            [sgn * (W * 0.96), r.beltY + 0.055, r.cabinFrontZ - 0.16, 0.013]
          ],
          8,
          false
        ),
        HEX_CARBON,
        0.16
      ),
      paintAutomotiveBody(
        transformMesh(sculptRoundedPillowMesh(0.088, 0.056, 0.105, 0.86, 10, 16), {
          pos: [sgn * (W * 1.00), r.beltY + 0.062, r.cabinFrontZ - 0.17],
          rot: [0, -sgn * 0.18, 0]
        }),
        r.paintLow,
        r.paintHigh,
        0.16
      ),
      // Chrome exhaust tip
      placeHexPart(
        transformMesh(latheMesh([[0.018, -0.04], [0.028, -0.04], [0.028, 0.04], [0.020, 0.04]], 12, false), {
          pos: [sgn * W * 0.48, sillY + 0.018, -L * 0.97],
          rot: [Math.PI / 2, 0, 0]
        }),
        {},
        HEX_CHROME,
        0.14
      )
    );
  }

  // Class-defining sculpted accessories (zero boxy slabs!)
  if (r.kind === "car") {
    // Sleek sculpted fastback ducktail rear lip spoiler + full-width ruby LED light bar bridge
    out.push(
      paintHexPart(
        buildCurvedBumperMesh(-L * 0.92, -0.036, W * 0.78, tailY + 0.028, 0.018, 0.085),
        HEX_CARBON,
        0.16
      ),
      placeHexPart(
        sculptRoundedPillowMesh(W * 0.84, 0.026, 0.042, 0.82, 8, 14),
        { pos: [0, tailY - 0.052, -L * 0.972] },
        HEX_TAILLIGHT,
        0.04
      )
    );
  } else if (r.kind === "hatch") {
    // Sporty hot-hatch roof-edge wing spoiler
    const wingZ = rearRoofZ - 0.03;
    out.push(
      paintHexPart(
        buildCurvedBumperMesh(wingZ, -0.03, W * 0.72, r.roofY + 0.024, 0.018, 0.11),
        HEX_CARBON,
        0.16
      )
    );
  } else if (r.kind === "suv") {
    // Twin anodized roof rails + sleek aerodynamic rooftop touring cargo pod (`sculptStreamlinedHullMesh`) + tailgate alloy wheel
    const railSpan = (frontRoofZ - rearRoofZ) * 0.82;
    const railMidZ = (frontRoofZ + rearRoofZ) * 0.5;
    for (const sgn of [-1, 1] as const) {
      out.push(
        paintHexPart(
          tubeSweepMesh(
            [
              [sgn * W * 0.56, r.roofY + 0.012, railMidZ - railSpan * 0.5, 0.014],
              [sgn * W * 0.56, r.roofY + 0.036, railMidZ, 0.016],
              [sgn * W * 0.56, r.roofY + 0.012, railMidZ + railSpan * 0.5, 0.014]
            ],
            10,
            false
          ),
          HEX_CHROME,
          0.14
        )
      );
    }
    const cargoPod = transformMesh(
      sculptStreamlinedHullMesh(railSpan * 0.86, W * 0.76, 0.135, {
        noseSharpness: 0.72,
        tailTaper: 0.58,
        canopyBulge: 0.18,
        undersideFlat: 0.55,
        stations: 13,
        ringPoints: 18
      }),
      { pos: [0, r.roofY + 0.082, railMidZ - 0.02] }
    );
    out.push(paintHexPart(cargoPod, "#27303d", 0.18));
    const spare = wheelAssemblySlots({ radius: r.wheelR * 0.76, width: r.wheelW * 0.78, spokeCount: 5, tireMat: 0, rimMat: 1 });
    for (const sl of spare) {
      out.push(
        placeHexPart(
          sl.mesh,
          { pos: [0, tailY - 0.03, -L * 0.99], rot: [0, Math.PI / 2, 0] },
          sl.materialIndex === 0 ? HEX_TIRE : HEX_RIM,
          0.18
        )
      );
    }
  } else if (r.kind === "taxi") {
    // Sculpted aerodynamic rooftop TAXI sign beacon dome on twin chrome crossbars
    const signZ = (frontRoofZ + rearRoofZ) * 0.5 + 0.04;
    const taxiDome = subdivideSmoothMesh(
      superellipseLoft(
        [
          { z: signZ - 0.10, rx: 0.165, ry: 0.048, y: r.roofY + 0.056, superellipseN: 2.6 },
          { z: signZ, rx: 0.185, ry: 0.056, y: r.roofY + 0.060, superellipseN: 2.8 },
          { z: signZ + 0.10, rx: 0.155, ry: 0.045, y: r.roofY + 0.054, superellipseN: 2.5 }
        ],
        18,
        true,
        false
      ),
      1,
      0.40
    );
    out.push(
      paintHexPart(
        tubeSweepMesh(
          [
            [-W * 0.58, r.roofY + 0.015, signZ, 0.011],
            [0, r.roofY + 0.030, signZ, 0.012],
            [W * 0.58, r.roofY + 0.015, signZ, 0.011]
          ],
          8,
          false
        ),
        HEX_CHROME,
        0.14
      ),
      paintHexPart(taxiDome, "#ffe566", 0.08)
    );
  } else if (r.kind === "van") {
    // Tubular alloy camper rooftop expedition rack + rolled side awning cylinder
    const rackMidZ = -0.08;
    for (const sgn of [-1, 1] as const) {
      out.push(
        paintHexPart(
          tubeSweepMesh(
            [
              [sgn * W * 0.62, r.roofY + 0.014, rackMidZ - 0.56, 0.013],
              [sgn * W * 0.62, r.roofY + 0.036, rackMidZ - 0.44, 0.013],
              [sgn * W * 0.62, r.roofY + 0.036, rackMidZ + 0.44, 0.013],
              [sgn * W * 0.62, r.roofY + 0.014, rackMidZ + 0.56, 0.013]
            ],
            8,
            false
          ),
          HEX_CHROME,
          0.14
        )
      );
    }
    out.push(
      paintHexPart(
        tubeSweepMesh(
          [
            [W * 0.68, r.roofY + 0.008, -0.68, 0.030],
            [W * 0.68, r.roofY + 0.008, 0.46, 0.030]
          ],
          12,
          false
        ),
        "#f1f5f9",
        0.16
      )
    );
  }

  appendWheelSet(out, [-axleZ, axleZ], W - r.wheelW * 0.46, r.wheelR, r.wheelW, true, W);
  return out;
}

function buildPickupTruckParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const paintLow = "#1d4ed8";
  const paintHigh = "#60a5fa";
  const L = 1.18;
  const W = 0.51;
  const wheelR = 0.205;
  const wheelW = 0.14;
  const sillY = wheelR * 0.58;
  const beltY = 0.52;
  const roofY = 0.85;
  const frontAxleZ = 0.72;
  const rearAxleZ = -0.68;
  const cabFrontZ = 0.48;
  const frontRoofZ = 0.26;
  const rearRoofZ = -0.02;
  const cabRearZ = -0.06;

  // 1. Compound-curve muscular crew-cab & sculpted front hood (`z in [-0.08 .. +1.18]`)
  const frontCabCfg: CompoundUnibodyConfig = {
    halfLen: L,
    halfW: W,
    sillY,
    beltY,
    noseY: 0.44,
    tailY: 0.49,
    roofY,
    cabinFrontZ: cabFrontZ,
    frontRoofZ,
    rearRoofZ,
    cabinRearZ: cabRearZ,
    roofTaper: 0.74,
    frontAxleZ,
    rearAxleZ,
    wheelR,
    flareAmp: 0.052,
    hoodCrown: 0.036,
    nosePlanTaper: 0.82,
    tailPlanTaper: 0.88
  };

  // Sculpt continuous unibody then carve recessed open rear cargo bed (`z in [-1.09 .. -0.10]`, `|x| < 0.35`) via `deformMesh`!
  const pickupBody = deformMesh(sculptCompoundUnibodyMesh(frontCabCfg), ([x, y, z]) => {
    if (z < -0.08 && z > -L + 0.085 && y > sillY + 0.12) {
      const zBed = smoothStep01((-0.08 - z) / 0.08) * smoothStep01((z - (-L + 0.085)) / 0.07);
      const xBed = smoothStep01((0.36 - Math.abs(x)) / 0.08);
      const depress = zBed * xBed;
      if (depress > 0.001) {
        const bedFloorY = sillY + 0.115;
        return [x, y + (bedFloorY - y) * depress, z];
      }
    }
    return [x, y, z];
  });
  out.push(paintAutomotiveBody(pickupBody, paintLow, paintHigh, 0.24));

  // Dark bedliner floor pad + longitudinal cargo ribs inside the recessed open bed
  const bedFloorY = sillY + 0.12;
  out.push(
    placeHexPart(
      sculptRoundedPillowMesh(0.68, 0.028, 0.94, 0.65, 8, 14),
      { pos: [0, bedFloorY, -0.58] },
      HEX_CARBON,
      0.22
    )
  );
  for (let rx = -0.24; rx <= 0.25; rx += 0.12) {
    out.push(
      paintHexPart(
        tubeSweepMesh(
          [
            [rx, bedFloorY + 0.016, -1.00, 0.014],
            [rx, bedFloorY + 0.016, -0.15, 0.014]
          ],
          8,
          false
        ),
        "#333b48",
        0.18
      )
    );
  }

  // Tubular brushed-chrome sport rollbar behind the cab + twin round rally spotlights!
  const hoopPts: V4[] = [
    [-0.36, beltY - 0.02, -0.13, 0.024],
    [-0.35, roofY + 0.02, -0.11, 0.024],
    [0, roofY + 0.045, -0.11, 0.025],
    [0.35, roofY + 0.02, -0.11, 0.024],
    [0.36, beltY - 0.02, -0.13, 0.024]
  ];
  out.push(paintHexPart(tubeSweepMesh(hoopPts, 12, false), HEX_CHROME, 0.14));
  for (const sgn of [-1, 1] as const) {
    out.push(
      paintHexPart(
        tubeSweepMesh(
          [
            [sgn * 0.34, roofY - 0.02, -0.12, 0.020],
            [sgn * 0.36, beltY - 0.01, -0.56, 0.020]
          ],
          10,
          false
        ),
        HEX_CHROME,
        0.14
      ),
      // Rally spotlight housing + glowing warm lens
      placeHexPart(
        sculptRoundedPillowMesh(0.095, 0.095, 0.075, 0.92, 10, 16),
        { pos: [sgn * 0.14, roofY + 0.095, -0.10] },
        HEX_CARBON,
        0.16
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.076, 0.076, 0.055, 0.96, 10, 16),
        { pos: [sgn * 0.14, roofY + 0.095, -0.075] },
        HEX_HEADLIGHT,
        0.04
      )
    );
  }

  // Contoured crew-cab tinted glass + pillar frames
  const { glassMeshes, frameMeshes } = buildContouredCabinGlassMeshes(frontCabCfg);
  for (const fm of frameMeshes) out.push(paintHexPart(fm, HEX_CARBON, 0.18));
  for (const gm of glassMeshes) out.push(paintAutomotiveGlass(gm));

  // Bold truck front & rear curved chrome step bumpers, sculpted grille, projector headlamps & vertical ruby taillights
  out.push(
    paintHexPart(buildCurvedBumperMesh(L * 0.96, 0.055, W * 0.98, sillY + 0.038, 0.052, 0.095), HEX_CHROME, 0.18),
    paintHexPart(buildCurvedBumperMesh(-L * 0.96, -0.045, W * 0.98, sillY + 0.038, 0.052, 0.095), HEX_CHROME, 0.18),
    placeHexPart(
      sculptRoundedPillowMesh(W * 1.04, 0.19, 0.062, 0.72, 10, 16),
      { pos: [0, 0.34, L * 0.985] },
      HEX_GRILLE,
      0.24
    ),
    paintHexPart(
      tubeSweepMesh(
        [
          [-W * 0.48, 0.34, L * 0.985, 0.018],
          [0, 0.345, L * 1.018, 0.020],
          [W * 0.48, 0.34, L * 0.985, 0.018]
        ],
        10,
        false
      ),
      HEX_CHROME,
      0.12
    )
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeHexPart(
        sculptRoundedPillowMesh(0.18, 0.115, 0.068, 0.80, 10, 16),
        { pos: [sgn * W * 0.66, 0.36, L * 0.955], rot: [0, sgn * 0.20, 0] },
        HEX_CARBON,
        0.18
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.145, 0.088, 0.062, 0.88, 12, 18),
        { pos: [sgn * W * 0.66, 0.36, L * 0.972], rot: [0, sgn * 0.20, 0] },
        HEX_HEADLIGHT,
        0.04
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.065, 0.082, 0.055, 0.86, 8, 14),
        { pos: [sgn * W * 0.84, 0.355, L * 0.935], rot: [0, sgn * 0.35, 0] },
        HEX_TURN_AMBER,
        0.06
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.085, 0.175, 0.062, 0.82, 10, 16),
        { pos: [sgn * (W * 0.86), 0.365, -L * 0.965] },
        HEX_TAILLIGHT,
        0.04
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.095, 0.068, 0.10, 0.84, 10, 16),
        { pos: [sgn * (W * 1.02), beltY + 0.068, cabFrontZ - 0.15] },
        HEX_CARBON,
        0.16
      )
    );
  }

  appendWheelSet(out, [rearAxleZ, frontAxleZ], W - wheelW * 0.46, wheelR, wheelW, true, W);
  return out;
}

function buildBoxTruckParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  const wheelR = 0.235;
  const wheelW = 0.155;
  const sillY = 0.165;
  const frontAxleZ = 1.08;
  const rearAxleZ = -0.86;
  // Bright neutral pearl-white paint so `core.ts` `TRUCK_TINTS` tint every truck into vivid fleet colors cleanly!
  const cabLow = "#e8eef6";
  const cabHigh = "#ffffff";

  // 1. Sleek rounded aerodynamic cab-over tractor (`z = 0.52 .. 1.62`) with sweeping integrated aero roof fairing!
  const cabCfg: CompoundUnibodyConfig = {
    halfLen: 0.56,
    halfW: 0.50,
    sillY,
    beltY: 0.58,
    noseY: 0.50,
    tailY: 0.58,
    roofY: 1.08,
    cabinFrontZ: 0.50,
    frontRoofZ: 0.30,
    rearRoofZ: -0.46,
    cabinRearZ: -0.54,
    roofTaper: 0.84,
    frontAxleZ: 0.0,
    rearAxleZ: -9.0, // single front tractor axle centered in local cab space (`1.08` after +1.08 shift)
    wheelR,
    flareAmp: 0.046,
    hoodCrown: 0.02,
    nosePlanTaper: 0.84,
    tailPlanTaper: 0.96
  };
  const aeroCab = transformMesh(sculptCompoundUnibodyMesh(cabCfg), { pos: [0, 0, 1.06] });
  // Integrated sweeping aerodynamic roof wind deflector blending cab crown (`y = 1.08`) up to trailer roof (`y = 1.32`)
  const windFairing = subdivideSmoothMesh(
    loftSectionsMesh(
      [
        [[-0.45, 1.04, 0.52], [0.45, 1.04, 0.52], [0.42, 1.31, 0.50], [0, 1.35, 0.50], [-0.42, 1.31, 0.50]],
        [[-0.43, 1.05, 0.92], [0.43, 1.05, 0.92], [0.39, 1.22, 0.90], [0, 1.25, 0.90], [-0.39, 1.22, 0.90]],
        [[-0.38, 1.06, 1.28], [0.38, 1.06, 1.28], [0.34, 1.09, 1.26], [0, 1.11, 1.26], [-0.34, 1.09, 1.26]]
      ],
      true,
      false
    ),
    1,
    0.42
  );
  out.push(
    paintAutomotiveBody(aeroCab, cabLow, cabHigh, 0.22),
    paintAutomotiveBody(windFairing, cabLow, cabHigh, 0.20)
  );

  // Contoured tractor panoramic windshield & side windows
  const cabGlass = buildContouredCabinGlassMeshes(cabCfg);
  for (const fm of cabGlass.frameMeshes) out.push(paintHexPart(transformMesh(fm, { pos: [0, 0, 1.06] }), HEX_CARBON, 0.18));
  for (const gm of cabGlass.glassMeshes) out.push(paintAutomotiveGlass(transformMesh(gm, { pos: [0, 0, 1.06] })));

  // 2. Crowned-roof, rounded-corner aerodynamic cargo body (`z = -1.62 .. 0.46`) — zero flat chamferBox slab!
  const trailerStations = 15;
  const trailerRings: V3[][] = [];
  for (let s = 0; s <= trailerStations; s += 1) {
    const f = s / trailerStations;
    const z = -1.62 + 2.08 * f;
    const endPin = s === 0 || s === trailerStations ? 0.94 : 1;
    // Subtle rhythmic vertical structural rib modulation along the curved trailer flanks
    const rib = s > 0 && s < trailerStations ? 0.010 * Math.cos(f * Math.PI * 12) : 0;
    const hw = (0.545 + rib) * endPin;
    const yBot = 0.29;
    const yShoulder = 1.22 * endPin + 0.04 * (1 - endPin);
    const yCrown = 1.35 * endPin + 0.04 * (1 - endPin);
    trailerRings.push([
      [0, yBot - 0.015, z],
      [hw * 0.90, yBot, z],
      [hw * 1.03, 0.44, z],
      [hw * 1.01, 0.78, z],
      [hw * 0.91, 1.08, z],
      [hw * 0.80, yShoulder, z],
      [hw * 0.44, yCrown - 0.014, z],
      [0, yCrown, z],
      [-hw * 0.44, yCrown - 0.014, z],
      [-hw * 0.80, yShoulder, z],
      [-hw * 0.91, 1.08, z],
      [-hw * 1.01, 0.78, z],
      [-hw * 1.03, 0.44, z],
      [-hw * 0.90, yBot, z]
    ]);
  }
  const aeroTrailer = subdivideSmoothMesh(loftSectionsMesh(trailerRings, true, false), 1, 0.32);
  out.push(paintAutomotiveBody(aeroTrailer, "#eaeff7", "#ffffff", 0.22));

  // Chassis frame rails, cylindrical aluminum side fuel tanks, rear roll-up door slats & curved chrome bumpers
  out.push(
    placeHexPart(sculptRoundedPillowMesh(0.68, 0.13, 2.96, 0.72, 10, 16), { pos: [0, 0.23, -0.04] }, HEX_CARBON, 0.24),
    paintHexPart(buildCurvedBumperMesh(1.61, 0.055, 0.50, 0.22, 0.058, 0.10), HEX_CHROME, 0.18),
    paintHexPart(buildCurvedBumperMesh(-1.62, -0.035, 0.51, 0.22, 0.052, 0.09), HEX_CHROME, 0.18),
    placeHexPart(sculptRoundedPillowMesh(0.66, 0.21, 0.058, 0.74, 10, 16), { pos: [0, 0.41, 1.615] }, HEX_GRILLE, 0.24),
    placeHexPart(sculptRoundedPillowMesh(0.86, 0.84, 0.038, 0.72, 10, 16), { pos: [0, 0.80, -1.618] }, "#dde4ee", 0.18)
  );
  for (let sy = 0.50; sy <= 1.10; sy += 0.15) {
    out.push(
      paintHexPart(
        tubeSweepMesh([[-0.39, sy, -1.628, 0.009], [0.39, sy, -1.628, 0.009]], 8, false),
        HEX_CARBON,
        0.16
      )
    );
  }
  for (const sgn of [-1, 1] as const) {
    const fuelTank = transformMesh(
      latheMesh([[0, -0.24], [0.095, -0.22], [0.105, 0], [0.095, 0.22], [0, 0.24]], 16, false),
      { pos: [sgn * 0.40, 0.25, 0.16], rot: [Math.PI / 2, 0, 0] }
    );
    const mirrorBracket: V4[] = [
      [sgn * 0.45, 0.94, 1.40, 0.012],
      [sgn * 0.55, 0.92, 1.43, 0.012],
      [sgn * 0.55, 0.68, 1.43, 0.012],
      [sgn * 0.46, 0.66, 1.40, 0.012]
    ];
    out.push(
      paintHexPart(fuelTank, HEX_CHROME, 0.18),
      paintHexPart(tubeSweepMesh(mirrorBracket, 8, false), HEX_CHROME, 0.14),
      placeHexPart(sculptRoundedPillowMesh(0.042, 0.17, 0.08, 0.82, 8, 14), { pos: [sgn * 0.555, 0.80, 1.43] }, HEX_CARBON, 0.16),
      placeHexPart(sculptRoundedPillowMesh(0.16, 0.095, 0.06, 0.86, 10, 16), { pos: [sgn * 0.35, 0.39, 1.615], rot: [0, sgn * 0.18, 0] }, HEX_HEADLIGHT, 0.04),
      placeHexPart(sculptRoundedPillowMesh(0.06, 0.085, 0.055, 0.86, 8, 14), { pos: [sgn * 0.45, 0.39, 1.595], rot: [0, sgn * 0.32, 0] }, HEX_TURN_AMBER, 0.06),
      placeHexPart(sculptRoundedPillowMesh(0.19, 0.085, 0.058, 0.84, 10, 16), { pos: [sgn * 0.35, 0.23, -1.63] }, HEX_TAILLIGHT, 0.04)
    );
  }
  appendWheelSet(out, [rearAxleZ, frontAxleZ], 0.44, wheelR, wheelW, true, 0.53);
  return out;
}

function buildTramParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  // Sleek panoramic compound-curve city streetcar / light-rail tram (`z in [-2.08 .. +2.08]`):
  // tapered aerodynamic symmetrical bonnets, tumblehome upper saloon, recessed panoramic vista glass & diamond pantograph!
  const stations = 21;
  const bodyRings: V3[][] = [];
  for (let s = 0; s <= stations; s += 1) {
    const f = s / stations;
    const z = -2.08 + 4.16 * f;
    const zAbs = Math.abs(z) / 2.08;
    const endTaper = zAbs > 0.68 ? 1 - 0.34 * Math.pow((zAbs - 0.68) / 0.32, 1.6) : 1;
    const endNoseDrop = zAbs > 0.72 ? 0.08 * Math.pow((zAbs - 0.72) / 0.28, 1.7) : 0;
    const hwSkirt = 0.47 * endTaper;
    const hwWaist = 0.55 * endTaper;
    const hwCantrail = 0.44 * endTaper; // pronounced streetcar tumblehome!
    const ySkirt = 0.16 + (zAbs > 0.82 ? 0.05 * Math.pow((zAbs - 0.82) / 0.18, 1.5) : 0);
    const yWaist = 0.62 - endNoseDrop * 0.5;
    const yRoof = 1.24 - endNoseDrop;
    // Slight window-band recess (`-0.018`) along `y in [0.68 .. 1.10]` so glass sits flush inside a sculpted frame!
    const winInset = zAbs < 0.90 ? 0.016 : 0;
    bodyRings.push([
      [0, ySkirt - 0.01, z],
      [hwSkirt, ySkirt + 0.02, z],
      [hwWaist, 0.42, z],
      [hwWaist, yWaist, z],
      [hwWaist * 0.94 - winInset, yWaist + 0.05, z],
      [hwCantrail + 0.03 - winInset, (yWaist + yRoof) * 0.54, z],
      [hwCantrail, yRoof - 0.04, z],
      [hwCantrail * 0.52, yRoof + 0.065, z],
      [0, yRoof + 0.085, z],
      [-hwCantrail * 0.52, yRoof + 0.065, z],
      [-hwCantrail, yRoof - 0.04, z],
      [-(hwCantrail + 0.03 - winInset), (yWaist + yRoof) * 0.54, z],
      [-(hwWaist * 0.94 - winInset), yWaist + 0.05, z],
      [-hwWaist, yWaist, z],
      [-hwWaist, 0.42, z],
      [-hwSkirt, ySkirt + 0.02, z]
    ]);
  }
  const tramShell = subdivideSmoothMesh(loftSectionsMesh(bodyRings, true, false), 1, 0.36);

  const cCoral = srgbHexToLinearRgba("#e11d48");
  const cCoralHi = srgbHexToLinearRgba("#fb7185");
  const cCream = srgbHexToLinearRgba("#fef3c7");
  const cRoof = srgbHexToLinearRgba("#f8fafc");
  const cGoldStripe = srgbHexToLinearRgba("#fbbf24");
  const cGlassDeep = srgbHexToLinearRgba("#0f233a");
  const cGlassSky = srgbHexToLinearRgba("#34699a");
  const cMullion = srgbHexToLinearRgba("#1e2530");

  out.push(
    rawToColoredMesh(
      bakeMeshCavityAO(
        paintMeshColors(
          tramShell,
          (pos, norm) => {
            const y = pos[1];
            const z = pos[2];
            // Recessed panoramic vista window band (`y in [0.68..1.09]`) with slender dark vertical mullions!
            if (y > 0.68 && y < 1.09 && Math.abs(z) < 1.94) {
              const bay = Math.abs(((z + 3.0) % 0.54) - 0.27);
              if (bay < 0.028 || y < 0.705 || y > 1.065) return cMullion;
              const refl = Math.max(0, Math.min(1, norm[1] * 0.65 + 0.32));
              return lerpRgba(cGlassDeep, cGlassSky, refl);
            }
            if (y < 0.58) {
              return lerpRgba(cCoral, cCoralHi, Math.max(0, Math.min(1, (y - 0.16) / 0.42)));
            }
            if (y < 0.635) return cGoldStripe;
            if (y > 1.18) return cRoof;
            return cCream;
          },
          false
        ),
        0.20
      )
    )
  );

  // Shrouded aero bogie skirts, glowing amber destination headsigns, round Cyclops/twin headlamps & roof pantograph
  for (const bz of [-1.14, 1.14]) {
    out.push(
      placeHexPart(sculptRoundedPillowMesh(0.76, 0.16, 0.88, 0.74, 10, 16), { pos: [0, 0.12, bz] }, HEX_CARBON, 0.24)
    );
  }
  for (const endSgn of [-1, 1] as const) {
    out.push(
      placeHexPart(
        sculptRoundedPillowMesh(0.42, 0.095, 0.075, 0.84, 10, 16),
        { pos: [0, 1.16, endSgn * 1.92] },
        "#ffd859",
        0.06
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.18, 0.13, 0.075, 0.92, 12, 18),
        { pos: [0, 0.48, endSgn * 2.05] },
        endSgn > 0 ? HEX_HEADLIGHT : HEX_TAILLIGHT,
        0.04
      )
    );
  }
  const panto: V4[] = [
    [0, 1.32, -0.26, 0.022],
    [0, 1.54, 0.08, 0.018],
    [0, 1.70, -0.14, 0.016]
  ];
  out.push(
    paintHexPart(tubeSweepMesh(panto, 10, false), HEX_CHROME, 0.14),
    paintHexPart(
      tubeSweepMesh([[-0.28, 1.71, -0.14, 0.016], [0.28, 1.71, -0.14, 0.016]], 8, false),
      HEX_CHROME,
      0.14
    )
  );
  appendWheelSet(out, [-1.36, -0.88, 0.88, 1.36], 0.34, 0.11, 0.08, false, 0.48);
  return out;
}

function buildExpressTrainParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  // Sleek aerodynamic Shinkansen bullet express train (`z in [-2.44 .. +2.68]`):
  // compound-curve duckbill aero nose, tumblehome fuselage, painted cobalt/cyan racing livery & flush panoramic glass (zero protruding boxes!)
  const fuselage = subdivideSmoothMesh(
    superellipseLoft(
      [
        { z: -2.44, rx: 0.48, ry: 0.48, y: 0.66, superellipseN: 3.1 },
        { z: -2.18, rx: 0.54, ry: 0.53, y: 0.69, superellipseN: 3.2 },
        { z: 0.88, rx: 0.54, ry: 0.53, y: 0.69, superellipseN: 3.2 },
        { z: 1.56, rx: 0.49, ry: 0.42, y: 0.57, superellipseN: 2.8 },
        { z: 2.18, rx: 0.35, ry: 0.24, y: 0.38, superellipseN: 2.4 },
        { z: 2.66, rx: 0.13, ry: 0.09, y: 0.25, superellipseN: 2.1 }
      ],
      28,
      true,
      false
    ),
    1,
    0.46
  );

  const noseFairing = transformMesh(
    sculptStreamlinedHullMesh(1.42, 0.90, 0.40, {
      noseSharpness: 1.48,
      tailTaper: 1.25,
      canopyBulge: 0.16,
      undersideFlat: 0.18,
      stations: 18,
      ringPoints: 22
    }),
    { pos: [0, 0.35, 1.95] }
  );

  const cPearl = srgbHexToLinearRgba("#f8fafc");
  const cSilverSkirt = srgbHexToLinearRgba("#cbd5e1");
  const cCobalt = srgbHexToLinearRgba("#1d4ed8");
  const cCyan = srgbHexToLinearRgba("#06b6d4");
  const cWinDark = srgbHexToLinearRgba("#0c1d33");
  const cWinGlint = srgbHexToLinearRgba("#2e6194");

  const paintBulletHull = (mesh: RawMesh): ColoredRawMesh =>
    rawToColoredMesh(
      bakeMeshCavityAO(
        paintMeshColors(
          mesh,
          (pos, norm) => {
            const y = pos[1];
            const z = pos[2];
            const sweepY = z > 0.85 ? (z - 0.85) * 0.16 : 0;
            // Flush passenger vista window band (`z in [-2.18 .. +0.72]`, `y in [0.74 .. 0.96]`)
            if (z > -2.18 && z < 0.72 && y > 0.73 && y < 0.96 && Math.abs(pos[0]) > 0.36) {
              const pillar = Math.abs(((z + 3.2) % 0.56) - 0.28);
              if (pillar > 0.048 && y > 0.75 && y < 0.94) {
                return lerpRgba(cWinDark, cWinGlint, Math.max(0, Math.min(1, norm[1] * 0.65 + 0.35)));
              }
            }
            if (y > 0.53 - sweepY && y < 0.63 - sweepY) return cCobalt;
            if (y > 0.47 - sweepY && y <= 0.53 - sweepY) return cCyan;
            if (y < 0.30) return cSilverSkirt;
            return cPearl;
          },
          false
        ),
        0.20
      )
    );

  const driverCanopy = subdivideSmoothMesh(
    superellipseLoft(
      [
        { z: 0.88, rx: 0.42, ry: 0.21, y: 0.99, superellipseN: 2.7 },
        { z: 1.46, rx: 0.39, ry: 0.18, y: 0.88, superellipseN: 2.5 },
        { z: 1.96, rx: 0.26, ry: 0.11, y: 0.70, superellipseN: 2.2 }
      ],
      24,
      true,
      false
    ),
    1,
    0.44
  );

  const pantoArm: V4[] = [
    [0, 1.24, -0.96, 0.020],
    [0, 1.44, -0.62, 0.016],
    [0, 1.58, -0.84, 0.015]
  ];
  out.push(
    paintBulletHull(fuselage),
    paintBulletHull(noseFairing),
    paintAutomotiveGlass(driverCanopy),
    placeHexPart(sculptRoundedPillowMesh(0.84, 0.18, 4.10, 0.72, 10, 18), { pos: [0, 0.13, -0.18] }, HEX_CARBON, 0.24),
    placeHexPart(sculptRoundedPillowMesh(0.46, 0.09, 0.82, 0.80, 10, 16), { pos: [0, 1.23, -0.78] }, HEX_CHROME, 0.16),
    paintHexPart(tubeSweepMesh(pantoArm, 10, false), HEX_CHROME, 0.14),
    paintHexPart(tubeSweepMesh([[-0.26, 1.59, -0.84, 0.014], [0.26, 1.59, -0.84, 0.014]], 8, false), HEX_CHROME, 0.14)
  );
  for (const sgn of [-1, 1] as const) {
    out.push(
      placeHexPart(
        sculptRoundedPillowMesh(0.16, 0.088, 0.18, 0.88, 10, 16),
        { pos: [sgn * 0.22, 0.38, 2.24], rot: [0.24, sgn * 0.14, 0] },
        HEX_CARBON,
        0.16
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.125, 0.068, 0.16, 0.92, 12, 18),
        { pos: [sgn * 0.22, 0.386, 2.28], rot: [0.24, sgn * 0.14, 0] },
        HEX_HEADLIGHT,
        0.04
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.15, 0.092, 0.055, 0.86, 10, 16),
        { pos: [sgn * 0.33, 0.56, -2.44] },
        HEX_TAILLIGHT,
        0.04
      )
    );
  }
  appendWheelSet(out, [-1.76, -1.16, 1.16, 1.76], 0.36, 0.115, 0.085, false, 0.48);
  return out;
}

function buildHoverCarParts(): ColoredRawMesh[] {
  const out: ColoredRawMesh[] = [];
  // Sleek compound-curve anti-gravity sci-fi speeder (`sculptStreamlinedHullMesh` + `loftSectionsMesh` + `subdivideSmoothMesh`)
  const mainHull = transformMesh(
    subdivideSmoothMesh(
      sculptStreamlinedHullMesh(2.36, 0.98, 0.40, {
        noseSharpness: 0.92,
        tailTaper: 0.56,
        canopyBulge: 0.26,
        undersideFlat: 0.52,
        stations: 17,
        ringPoints: 22
      }),
      1,
      0.40
    ),
    { pos: [0, 0.26, 0.02] }
  );
  const bubbleCanopy = subdivideSmoothMesh(
    superellipseLoft(
      [
        { z: -0.56, rx: 0.29, ry: 0.13, y: 0.46, superellipseN: 2.3 },
        { z: 0.04, rx: 0.35, ry: 0.20, y: 0.53, superellipseN: 2.2 },
        { z: 0.62, rx: 0.24, ry: 0.10, y: 0.42, superellipseN: 2.1 }
      ],
      24,
      true,
      false
    ),
    1,
    0.44
  );
  out.push(
    paintAutomotiveBody(mainHull, "#0891b2", "#67e8f9", 0.22),
    paintAutomotiveGlass(bubbleCanopy)
  );

  // Sculpted side intake sponsons, airfoil-lofted canted twin tail fins (zero boxes!) & 4 vectored lift-fan thrusters
  const shroudRing = latheMesh(
    [
      [0.105, -0.052],
      [0.175, -0.042],
      [0.182, 0.040],
      [0.118, 0.048],
      [0.105, -0.052]
    ],
    20,
    false
  );
  const fanCore = latheMesh(
    [
      [0, -0.022],
      [0.110, -0.022],
      [0.110, 0.022],
      [0, 0.022]
    ],
    18,
    false
  );
  for (const zz of [-0.66, 0.64]) {
    for (const sgn of [-1, 1] as const) {
      out.push(
        placeHexPart(shroudRing, { pos: [sgn * 0.39, 0.20, zz] }, HEX_CHROME, 0.16),
        placeHexPart(fanCore, { pos: [sgn * 0.39, 0.18, zz] }, "#38f6ff", 0.04)
      );
    }
  }
  for (const sgn of [-1, 1] as const) {
    // Swept canted airfoil tail fin (`loftSectionsMesh`)
    const fin = subdivideSmoothMesh(
      loftSectionsMesh(
        [
          [[sgn * 0.31, 0.34, -0.58], [sgn * 0.35, 0.34, -0.78], [sgn * 0.33, 0.34, -1.04], [sgn * 0.29, 0.34, -0.78]],
          [[sgn * 0.41, 0.62, -0.82], [sgn * 0.43, 0.62, -0.96], [sgn * 0.42, 0.62, -1.12], [sgn * 0.40, 0.62, -0.96]]
        ],
        true,
        false
      ),
      1,
      0.38
    );
    out.push(
      paintAutomotiveBody(fin, "#db2777", "#fb7185", 0.16),
      placeHexPart(
        sculptRoundedPillowMesh(0.15, 0.048, 0.09, 0.90, 10, 16),
        { pos: [sgn * 0.22, 0.26, 1.12], rot: [0, sgn * 0.26, 0] },
        HEX_HEADLIGHT,
        0.04
      ),
      placeHexPart(
        sculptRoundedPillowMesh(0.16, 0.052, 0.065, 0.88, 10, 16),
        { pos: [sgn * 0.24, 0.29, -1.10] },
        HEX_TAILLIGHT,
        0.04
      )
    );
  }
  return out;
}

function buildVehiclePartsForKind(kind: ProceduralVehicleKind): ColoredRawMesh[] {
  switch (kind) {
    case "car":
      return buildRoadCarParts({
        kind: "car",
        paintLow: "#dc2626",
        paintHigh: "#f87171",
        halfLen: 1.06,
        halfW: 0.48,
        beltY: 0.46,
        roofY: 0.74,
        cabinFrontZ: 0.42,
        cabinRearZ: -0.56,
        roofTaper: 0.69,
        wheelR: 0.185,
        wheelW: 0.125
      });
    case "hatch":
      return buildRoadCarParts({
        kind: "hatch",
        paintLow: "#0284c7",
        paintHigh: "#38bdf8",
        roofAccentLow: "#18202c",
        roofAccentHigh: "#2d3748",
        halfLen: 0.96,
        halfW: 0.47,
        beltY: 0.46,
        roofY: 0.76,
        cabinFrontZ: 0.38,
        cabinRearZ: -0.84,
        roofTaper: 0.72,
        wheelR: 0.18,
        wheelW: 0.12
      });
    case "suv":
      return buildRoadCarParts({
        kind: "suv",
        paintLow: "#15803d",
        paintHigh: "#4ade80",
        halfLen: 1.14,
        halfW: 0.50,
        beltY: 0.52,
        roofY: 0.87,
        cabinFrontZ: 0.44,
        cabinRearZ: -1.00,
        roofTaper: 0.75,
        wheelR: 0.215,
        wheelW: 0.145
      });
    case "taxi":
      return buildRoadCarParts({
        kind: "taxi",
        paintLow: "#eab308",
        paintHigh: "#fde047",
        halfLen: 1.06,
        halfW: 0.48,
        beltY: 0.46,
        roofY: 0.75,
        cabinFrontZ: 0.42,
        cabinRearZ: -0.56,
        roofTaper: 0.70,
        wheelR: 0.185,
        wheelW: 0.125
      });
    case "van":
      return buildRoadCarParts({
        kind: "van",
        paintLow: "#0d9488",
        paintHigh: "#2dd4bf",
        roofAccentLow: "#f1f5f9",
        roofAccentHigh: "#ffffff",
        halfLen: 1.16,
        halfW: 0.50,
        beltY: 0.52,
        roofY: 0.90,
        cabinFrontZ: 0.90,
        cabinRearZ: -1.04,
        roofTaper: 0.78,
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
 * compound-curve tumblehome bodywork, flared wheel arches, 4 `wheelAssemblySlots`, and `material.studioGlass` windows.
 */
export function buildHeroVehicleMultiMaterialNode(
  kind: ProceduralVehicleKind,
  opts: VehiclePoolOptions & { readonly name?: string }
) {
  const L = 1.08;
  const W = 0.48;
  const wheelR = 0.188;
  const wheelW = 0.128;
  const sillY = wheelR * 0.58;
  const beltY = 0.47;
  const roofY = 0.76;
  const axleZ = 0.65;
  const cabRearZ = kind === "pickup" ? -0.06 : -0.56;
  const cabFrontZ = 0.42;
  const cabSpan = cabFrontZ - cabRearZ;
  const cfg: CompoundUnibodyConfig = {
    halfLen: L,
    halfW: W,
    sillY,
    beltY,
    noseY: 0.36,
    tailY: kind === "pickup" ? 0.47 : 0.43,
    roofY,
    cabinFrontZ: cabFrontZ,
    frontRoofZ: cabFrontZ - cabSpan * 0.28,
    rearRoofZ: cabRearZ + cabSpan * 0.24,
    cabinRearZ: cabRearZ,
    roofTaper: 0.70,
    frontAxleZ: axleZ,
    rearAxleZ: -axleZ,
    wheelR,
    flareAmp: 0.045,
    hoodCrown: 0.032,
    nosePlanTaper: 0.80,
    tailPlanTaper: 0.84
  };

  let unibody = sculptCompoundUnibodyMesh(cfg);
  if (kind === "pickup") {
    unibody = deformMesh(unibody, ([x, y, z]) => {
      if (z < -0.08 && z > -L + 0.085 && y > sillY + 0.12) {
        const zBed = smoothStep01((-0.08 - z) / 0.08) * smoothStep01((z - (-L + 0.085)) / 0.07);
        const xBed = smoothStep01((0.35 - Math.abs(x)) / 0.08);
        const depress = zBed * xBed;
        if (depress > 0.001) return [x, y + (sillY + 0.11 - y) * depress, z];
      }
      return [x, y, z];
    });
  }

  const toX = (m: RawMesh, pos?: V3, rot?: V3) => transformMesh(transformMesh(m, { pos, rot }), { rot: [0, Math.PI / 2, 0] });
  const wheels = wheelAssemblySlots({ radius: wheelR, width: wheelW, spokeCount: 5, tireMat: 2, rimMat: 3 });
  const { glassMeshes, frameMeshes } = buildContouredCabinGlassMeshes(cfg);

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: toX(unibody) },
    { materialIndex: 1, mesh: toX(buildCurvedBumperMesh(L * 0.96, 0.055, W * 0.96, sillY + 0.036, 0.046, 0.085)) },
    { materialIndex: 1, mesh: toX(buildCurvedBumperMesh(-L * 0.96, -0.048, W * 0.96, sillY + 0.038, 0.048, 0.085)) },
    { materialIndex: 2, mesh: toX(sculptRoundedPillowMesh(W * 0.92, 0.15, 0.055, 0.74, 10, 16), [0, 0.30, L * 0.985]) },
    { materialIndex: 4, mesh: toX(sculptRoundedPillowMesh(0.15, 0.08, 0.06, 0.88, 10, 16), [-W * 0.62, 0.32, L * 0.965]) },
    { materialIndex: 4, mesh: toX(sculptRoundedPillowMesh(0.15, 0.08, 0.06, 0.88, 10, 16), [W * 0.62, 0.32, L * 0.965]) },
    { materialIndex: 5, mesh: toX(sculptRoundedPillowMesh(0.18, 0.075, 0.06, 0.86, 10, 16), [-W * 0.58, 0.34, -L * 0.965]) },
    { materialIndex: 5, mesh: toX(sculptRoundedPillowMesh(0.18, 0.075, 0.06, 0.86, 10, 16), [W * 0.58, 0.34, -L * 0.965]) }
  ];
  for (const fm of frameMeshes) {
    slots.push({ materialIndex: 2, mesh: toX(fm) });
  }
  for (const az of [-axleZ, axleZ]) {
    for (const sd of [-1, 1] as const) {
      for (const w of wheels) {
        slots.push({
          materialIndex: w.materialIndex,
          mesh: transformMesh(w.mesh, { pos: [az, wheelR, sd * (W - wheelW * 0.46)], rot: [0, Math.PI / 2 + (sd < 0 ? Math.PI : 0), 0] })
        });
      }
    }
  }

  const scale = opts.targetMaxDimension / (L * 2 + 0.08);
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
  const glassParts = glassMeshes.map((m) => transformMesh(toX(m), { scale }));
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

  const rawLoft = sculptClosedParametricSurface(26, segs, (u, phi) => {
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
  return taubinSmoothMesh(rawLoft, 4, 0.46, -0.48);
}

interface FrogAnatomyProfile {
  readonly widthScale?: number;
  readonly eyeDomeAmp?: number;
  readonly headFlare?: number;
  readonly dorsolateralRidge?: number;
  readonly spinalRidge?: number;
  readonly tailboneTuck?: number;
  readonly pitchLift?: number;
}

function gauss(x: number, mu: number, sigma: number): number {
  const d = (x - mu) / sigma;
  return Math.exp(-0.5 * d * d);
}

/**
 * Smooth analytic normal/height shading (replaces discrete Laplacian `bakeMeshCavityAO` on organic critter skin
 * so subdivision triangle rings NEVER imprint concentric ripples or turn thin toes black).
 */
function shadeSmoothOrganicColors(mesh: RawMesh, baseRgba?: V4, shadeStrength = 0.11): RawMesh {
  return paintMeshColors(
    mesh,
    ([, y], [, ny], _uv, idx) => {
      const sky = Math.max(0, Math.min(1, ny * 0.5 + 0.5));
      const lift = Math.max(0, Math.min(1, y * 1.15));
      const shade = 1 - shadeStrength * (1 - (sky * 0.72 + lift * 0.28));
      if (mesh.colors && mesh.colors.length >= (idx + 1) * 4) {
        return [
          mesh.colors[idx * 4]! * shade,
          mesh.colors[idx * 4 + 1]! * shade,
          mesh.colors[idx * 4 + 2]! * shade,
          1
        ];
      }
      const c = baseRgba ?? [1, 1, 1, 1];
      return [c[0] * shade, c[1] * shade, c[2] * shade, 1];
    },
    false
  );
}

/**
 * Linear-space vertex-painted tree-frog amphibian skin (`paintMeshColors` + smooth analytic shading):
 * natural sunlit olive-emerald crown & dorsal ridge (`#24c55e` / `#2ed168`) -> warm leaf-green midtones (`#1da34b`) ->
 * warm chartreuse-lime flanks, thighs & forearms (`#84cc16` / `#a3e635`) -> creamy butter-ivory throat & belly (`#fef3c7`).
 */
function paintFrogAmphibianSkin(mesh: RawMesh, aoStrength = 0.08): RawMesh {
  const cSunLime = srgbHexToLinearRgba("#6ad136");
  const cOliveEmerald = srgbHexToLinearRgba("#4eb42c");
  const cCreaseGreen = srgbHexToLinearRgba("#3b8f22");
  const cChartreuseFlank = srgbHexToLinearRgba("#8cd832");
  const cSoftLime = srgbHexToLinearRgba("#dcf79e");
  const cButterCream = srgbHexToLinearRgba("#fef3c7");

  const painted = paintMeshColors(
    mesh,
    ([x, y, z], [nx, ny]) => {
      // Smooth ventral transition into creamy butter-ivory throat, chest, belly & inner thighs
      const underNormal = Math.max(0, -ny);
      const throatBias = Math.max(0, z - 0.07) * Math.max(0, 0.42 - y) * 2.2;
      const bellyMask = Math.max(
        0,
        Math.min(
          1,
          (underNormal * 0.82 + Math.max(0, 0.22 - y) * 1.45 + throatBias) *
            Math.max(0, 1 - Math.abs(x) * 2.35)
        )
      );

      // Warm sunlit olive-lime crown, brow ridges & muscular thigh crests (matches Meshy reference palette!)
      const sunTop = Math.max(0, Math.min(1, ny * 0.54 + (y - 0.16) * 1.05));
      let col = lerpRgba(cOliveEmerald, cSunLime, sunTop * 0.84);

      const flankMask = Math.max(
        0,
        Math.min(1, (Math.abs(nx) * 0.62 + (1 - Math.abs(ny)) * 0.38) * Math.max(0, 1.02 - (y - 0.22) * 1.5))
      );
      col = lerpRgba(col, cChartreuseFlank, flankMask * 0.44);

      // Gentle deeper leaf-olive shading in the lower spine / neck waist crease
      const neckWaistShade = gauss(y, 0.395, 0.045) * gauss(z, 0.055, 0.055) * Math.max(0, ny);
      if (neckWaistShade > 0.02) {
        col = lerpRgba(col, cCreaseGreen, Math.min(0.28, neckWaistShade * 0.32));
      }

      if (bellyMask > 0.01) {
        const boostedBelly = Math.min(1, bellyMask * 1.62);
        const midBelly = lerpRgba(cSoftLime, cButterCream, Math.min(1, boostedBelly * 1.35));
        col = lerpRgba(col, midBelly, boostedBelly);
      }
      return col;
    },
    false
  );
  return shadeSmoothOrganicColors(painted, undefined, aoStrength);
}

/** Paints flared bright-tangerine webbed frog feet & round suction toe-pads with clean sunlit marigold highlights (zero black AO sticks!). */
function paintTangerineWebbedFoot(mesh: RawMesh, aoStrength = 0.08): RawMesh {
  const cDeepTangerine = srgbHexToLinearRgba("#ff6b18");
  const cBrightOrange = srgbHexToLinearRgba("#ff8820");
  const cMarigoldPad = srgbHexToLinearRgba("#ffab38");
  const painted = paintMeshColors(
    mesh,
    ([x, y, z], [, ny]) => {
      const forwardReach = Math.max(0, Math.min(1, (z + 0.08) / 0.34));
      const padTip = Math.max(0, Math.min(1, forwardReach * 0.68 + Math.max(0, ny) * 0.32 + Math.abs(x) * 0.22));
      const mid = lerpRgba(cDeepTangerine, cBrightOrange, forwardReach);
      return lerpRgba(mid, cMarigoldPad, padTip * 0.58 + Math.min(0.16, y * 2.2));
    },
    false
  );
  return shadeSmoothOrganicColors(painted, undefined, aoStrength);
}

/** Paints `Hop`'s coral-orange explorer neckerchief, knot, and short folded tails with smooth fabric shading. */
function paintCoralBandana(mesh: RawMesh, aoStrength = 0.08): RawMesh {
  const cCoralDeep = srgbHexToLinearRgba("#c8382b");
  const cCoralVibrant = srgbHexToLinearRgba("#e24a36");
  const cCoralSun = srgbHexToLinearRgba("#f46d52");
  const cCreamTrim = srgbHexToLinearRgba("#fff3d6");
  const painted = paintMeshColors(
    mesh,
    ([x, y, z], [, ny]) => {
      const crest = Math.max(0, Math.min(1, ny * 0.55 + 0.45));
      let col = lerpRgba(cCoralDeep, cCoralVibrant, 0.58);
      col = lerpRgba(col, cCoralSun, crest * 0.52);
      const tailDist = Math.hypot(x * 0.8, z + 0.04);
      const borderBand = gauss(tailDist, 0.145, 0.014) + gauss(y, 0.268, 0.010) * Math.max(0, z - 0.16) * 8;
      if (borderBand > 0.08) {
        col = lerpRgba(col, cCreamTrim, Math.min(0.55, borderBand * 0.48));
      }
      return col;
    },
    false
  );
  return shadeSmoothOrganicColors(painted, undefined, aoStrength);
}

/**
 * Evaluates a continuous, organically sculpted poised tree-frog body-and-head manifold:
 * cute tucked urostyle tailbone (`u = 0`) -> plump pear torso with gentle dorsal spinal ridge ->
 * distinct cervical neck taper (`u = 0.53`) -> wide heart-shaped smiling frog head (`u = 0.72..1.0`) ->
 * tall raised periscope supraorbital eye-domes (`+Y/+X/-X`) with crisp interorbital valley!
 */
function evalFrogSkinPoint(uIn: number, phi: number, profile: FrogAnatomyProfile = {}): V3 {
  const u = Math.max(0, Math.min(1, uIn));
  const widthScale = profile.widthScale ?? 1;
  const eyeDomeAmp = profile.eyeDomeAmp ?? 0.132;
  const headFlare = profile.headFlare ?? 1.14;
  const pitchLift = profile.pitchLift ?? 1;

  // Pole-free superellipsoid spherical coordinates (`u = theta / pi`, `st = sin(theta)`, `ct = -cos(theta)`)
  const theta = u * Math.PI;
  const st = Math.sin(theta);
  const st2 = st * st;
  const ct = -Math.cos(theta);
  const poleFullness = 1 + 0.34 * ct * ct;

  // Compact, plump chubby frog spine (`z: -0.165 -> +0.328`, zero elongated cucumber overhang!)
  const zSpine = 0.0815 + 0.2465 * ct - 0.018 * st2;
  const ySpine =
    0.295 +
    0.105 * pitchLift * ct +
    0.056 * pitchLift * st2 -
    0.032 * Math.max(0, ct) * ct;

  // Wide, chubby rounded emerald back & haunches (`~0.47 m` wide) flowing smoothly into a wide smiling frog head (`~0.53 m` wide)
  const rxBase =
    (0.226 +
      0.028 * st2 * gauss(u, 0.36, 0.20) -
      0.012 * st2 * gauss(u, 0.54, 0.085) +
      0.078 * headFlare * st2 * gauss(u, 0.72, 0.145)) *
    poleFullness *
    widthScale;

  const ryTop =
    (0.148 +
      0.024 * st2 * gauss(u, 0.38, 0.22) +
      0.036 * st2 * gauss(u, 0.69, 0.14)) *
    poleFullness;
  const ryBot =
    (0.142 +
      0.032 * st2 * gauss(u, 0.42, 0.22) +
      0.028 * st2 * gauss(u, 0.74, 0.14)) *
    poleFullness;

  const ca = Math.cos(phi);
  const sa = Math.sin(phi);

  // Heart-shaped cheek flare around `u ~ 0.72` + soft flattened ventral belly cushion (multiplied by `st2` for C^infinity poles)
  const cheekWiden = 1 + 0.12 * headFlare * st2 * gauss(u, 0.72, 0.105) * ca * ca * Math.max(0, 0.68 - sa * 0.42);
  const rx = rxBase * cheekWiden * st;
  const ryMid = 0.5 * (ryTop + ryBot) + 0.5 * (ryTop - ryBot) * sa * st2;
  const ry = ryMid * (sa >= 0 ? 1 : 1 - 0.06 * st2 * ca * ca) * st;

  let x = rx * ca;
  let y = ySpine + ry * sa;
  let z = zSpine + 0.014 * st2 * sa * gauss(u, 0.72, 0.14);

  // Tall raised periscope supraorbital eye-domes on top-outer corners of the heart-shaped head (`+Y/+X/-X`)
  if (eyeDomeAmp > 0) {
    const uEye = gauss(u, 0.695, 0.082) * st2;
    for (const [sgn, eyePhi] of [
      [1, 0.86],
      [-1, Math.PI - 0.86]
    ] as const) {
      const dPhi = wrapSignedAngle(phi - eyePhi);
      const dome = uEye * Math.exp(-0.5 * (dPhi / 0.36) * (dPhi / 0.36));
      x += sgn * 0.42 * eyeDomeAmp * dome;
      y += 1.06 * eyeDomeAmp * dome;
      z += 0.04 * eyeDomeAmp * dome;
    }
    const interOrb = uEye * Math.exp(-0.5 * (wrapSignedAngle(phi - Math.PI * 0.5) / 0.24) ** 2);
    y -= 0.22 * eyeDomeAmp * interOrb;
  }

  // Upturned heart-snout nostril mounds near `u = 0.88`
  const uNostril = gauss(u, 0.88, 0.036) * st2;
  for (const nPhi of [1.08, Math.PI - 1.08] as const) {
    const dPhi = wrapSignedAngle(phi - nPhi);
    const bump = uNostril * Math.exp(-0.5 * (dPhi / 0.22) ** 2);
    y += 0.009 * bump;
    z += 0.006 * bump;
  }

  return [x, y, z];
}

/**
 * Evaluates a continuous, Meshy-grade implicit SDF (`< 0` inside) for our athletic poised tree-frog (`+Z` forward, `+Y` up):
 * unified urostyle rump -> leaned amphibian torso & soft belly -> shoulder girdle -> broad smiling frog cranium ->
 * integrated supraorbital brow hoods & orbital sockets -> muscular Z-folded thighs/calves & bowed forelimbs (`sminPoly`).
 */
function evalUnifiedFrogSdf(
  x: number,
  y: number,
  z: number,
  profile: FrogAnatomyProfile = {},
  includeLimbs = false,
  spread = 0.94
): number {
  const ax = Math.abs(x);
  const pSym: V3 = [ax, y, z];
  const wS = profile.widthScale ?? 1;
  const hF = profile.headFlare ?? 1.12;
  const browScale = (profile.eyeDomeAmp ?? 0.132) / 0.132;

  // 1. Sleek, athletic 42-deg forward-poised Meshy tree-frog spine (`old_meshy_card_2x.jpg` silhouette!):
  // compact tapered urostyle pelvis -> lean athletic ribcage -> distinct narrower cervical neck waist!
  const rump = sdfEllipsoid([x, y, z], [0, 0.178, -0.128], [0.098 * wS, 0.104, 0.112]);
  const midTorso = sdfEllipsoid([x, y, z], [0, 0.284, -0.014], [0.126 * wS, 0.124, 0.146]);
  const shoulderGirdle = sdfEllipsoid([x, y, z], [0, 0.362, 0.056], [0.124 * wS, 0.108, 0.116]);
  const neckWaist = sdfEllipsoid([x, y, z], [0, 0.418, 0.088], [0.108 * wS, 0.088, 0.098]);
  let d = sminPoly(sminPoly(sminPoly(rump, midTorso, 0.054), shoulderGirdle, 0.044), neckWaist, 0.036);

  // Subtle dorsal iliac/spinal amphibian poise crest + compact hip/shoulder sockets so subdivided limbs seat with zero gap
  const spineCrest = sdfTaperedCapsule([x, y, z], [0, 0.208, -0.146], [0, 0.408, 0.042], 0.046, 0.038);
  d = sminPoly(d, spineCrest, 0.042);
  const hipSocket = sdfEllipsoid(pSym, [0.094 * spread * wS, 0.194, -0.104], [0.052, 0.054, 0.058]);
  const shoulderSocket = sdfEllipsoid(pSym, [0.108 * spread * wS, 0.348, 0.084], [0.046, 0.048, 0.048]);
  d = sminPoly(sminPoly(d, hipSocket, 0.026), shoulderSocket, 0.024);

  // 2. Sleek heart-shaped tree-frog cranium clearly wider than the neck waist + cheeks + upturned snout + smooth jaw
  const cranium = sdfEllipsoid([x, y, z], [0, 0.492, 0.138], [0.172 * hF * wS, 0.118, 0.140]);
  const cheeks = sdfEllipsoid(pSym, [0.126 * hF * wS, 0.464, 0.162], [0.080, 0.072, 0.084]);
  const snout = sdfEllipsoid([x, y, z], [0, 0.456, 0.232], [0.124 * wS, 0.076, 0.088]);
  const jaw = sdfEllipsoid([x, y, z], [0, 0.402, 0.180], [0.118 * wS, 0.066, 0.096]);
  const head = sminPoly(sminPoly(sminPoly(cranium, cheeks, 0.046), snout, 0.048), jaw, 0.042);
  d = sminPoly(d, head, 0.038);

  // 3. Integrated tree-frog supraorbital brow & posterior eyelid hoods cupping the eye globe naturally
  // (convex-to-convex crease eliminates both ping-pong rear eye-shells AND grazing-angle socket z-fighting!)
  if (browScale > 0.05) {
    const browHood = sdfEllipsoid(
      pSym,
      [0.130 * wS, 0.568, 0.128],
      [0.068, 0.075 * browScale, 0.068]
    );
    const rearEyelidWrap = sdfEllipsoid(
      pSym,
      [0.138 * wS, 0.560, 0.112],
      [0.062, 0.066 * browScale, 0.058]
    );
    d = sminPoly(sminPoly(d, browHood, 0.042), rearEyelidWrap, 0.026);
  }

  // Gentle organic lip smile contour carved softly into the snout
  const smileGroove = sdfEllipsoid([x, y, z], [0, 0.426 + 0.026 * (ax / 0.19) ** 2, 0.304], [0.142, 0.009, 0.032]);
  d = smaxPoly(d, -smileGroove, 0.010);

  if (includeLimbs) {
    const femur = sdfTaperedCapsule(
      pSym,
      [0.104 * spread, 0.196, -0.098],
      [0.246 * spread, 0.252, 0.044],
      0.062,
      0.046
    );
    const calf = sdfTaperedCapsule(
      pSym,
      [0.246 * spread, 0.244, 0.040],
      [0.214 * spread, 0.042, -0.108],
      0.046,
      0.030
    );
    const hindLeg = sminPoly(femur, calf, 0.022);
    const upperArm = sdfTaperedCapsule(
      pSym,
      [0.118 * spread, 0.348, 0.088],
      [0.204 * spread, 0.188, 0.150],
      0.040,
      0.034
    );
    const foreArm = sdfTaperedCapsule(
      pSym,
      [0.204 * spread, 0.186, 0.150],
      [0.164 * spread, 0.034, 0.212],
      0.034,
      0.026
    );
    const frontArm = sminPoly(upperArm, foreArm, 0.020);
    d = sminPoly(d, hindLeg, 0.022);
    d = sminPoly(d, frontArm, 0.020);
  }

  return d;
}

/** Projects any 3D point outward along `grad(evalUnifiedFrogSdf)` until `sdf >= minClearance` so accessories NEVER clip skin! */
function projectPointOutsideFrogSdf(
  pt: V3,
  minClearance: number,
  profile: FrogAnatomyProfile = {},
  includeLimbs = false
): V3 {
  let [px, py, pz] = pt;
  const eps = 0.004;
  for (let step = 0; step < 5; step += 1) {
    const val = evalUnifiedFrogSdf(px, py, pz, profile, includeLimbs);
    if (val >= minClearance) break;
    const gx = evalUnifiedFrogSdf(px + eps, py, pz, profile, includeLimbs) - evalUnifiedFrogSdf(px - eps, py, pz, profile, includeLimbs);
    const gy = evalUnifiedFrogSdf(px, py + eps, pz, profile, includeLimbs) - evalUnifiedFrogSdf(px, py - eps, pz, profile, includeLimbs);
    const gz = evalUnifiedFrogSdf(px, py, pz + eps, profile, includeLimbs) - evalUnifiedFrogSdf(px, py, pz - eps, profile, includeLimbs);
    const gl = Math.hypot(gx, gy, gz) || 1;
    const push = (minClearance - val) + 0.001;
    px += (gx / gl) * push;
    py += (gy / gl) * push;
    pz += (gz / gl) * push;
  }
  return [px, py, pz];
}

function sculptUnifiedFrogSdfMesh(profile: FrogAnatomyProfile = {}, includeLimbs = false): RawMesh {
  return sculptOrganicSdfMesh({
    boundsMin: includeLimbs ? [-0.34, 0.004, -0.30] : [-0.24, 0.065, -0.26],
    boundsMax: includeLimbs ? [0.34, 0.66, 0.36] : [0.24, 0.66, 0.34],
    resolution: [52, 58, 56],
    taubinIterations: 8,
    projectToIso: 0.96,
    evaluate: (x, y, z) => evalUnifiedFrogSdf(x, y, z, profile, includeLimbs)
  });
}

/**
 * Builds an ultra-smooth, Taubin-faired + analytic-normal amphibian body manifold for armored/mecha frog variants.
 */
function buildSubdividedFrogBodyMesh(profile: FrogAnatomyProfile = {}): RawMesh {
  const unitSphere = subdivideSmoothMesh(icosphereSmoothMesh(1, 2, 0, 7, 0), 2, 0);
  const deformed = deformMesh(unitSphere, ([px, py, pz]) => {
    const len = Math.hypot(px, py, pz) || 1;
    const dx = px / len;
    const dy = py / len;
    const dz = Math.max(-1, Math.min(1, pz / len));
    const u = Math.acos(-dz) / Math.PI;
    const phi = Math.atan2(dy, dx);
    return evalFrogSkinPoint(u, phi, profile);
  });
  return taubinSmoothMesh(deformed, 4, 0.45, -0.47);
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
 * Sculpts a curved surface-conforming medallion / armor vent / cabochon on `evalFrogSkinPoint(u, phi)`.
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
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vz;
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
function sculptFootWebbingMesh(origin: V3, toeA: V3, toeB: V3, webFrac = 0.78): RawMesh {
  return sculptClosedParametricSurface(10, 16, (u, phi) => {
    const theta = (1 - u) * Math.PI;
    const st = Math.sin(theta);
    const ct = Math.cos(theta);
    const s = 0.5 + 0.5 * st * Math.cos(phi);
    const w = 0.5 + 0.5 * st * Math.sin(phi);
    const scallop = 1 - 0.15 * Math.sin(Math.PI * w);
    const reach = s * webFrac * scallop;
    const ax = origin[0] + (toeA[0] - origin[0]) * reach;
    const az = origin[2] + (toeA[2] - origin[2]) * reach;
    const bx = origin[0] + (toeB[0] - origin[0]) * reach;
    const bz = origin[2] + (toeB[2] - origin[2]) * reach;
    const x = ax + (bx - ax) * w;
    const z = az + (bz - az) * w;
    const baseY = Math.max(0.011, origin[1] * (1 - reach) + 0.013 * reach);
    const halfThick = 0.0062 * Math.pow(Math.max(0, st), 0.6);
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
  readonly paintTurretMesh?: (mesh: RawMesh) => RawMesh;
  readonly horizontalPupil?: boolean;
  readonly outwardYaw?: number;
  readonly rearChaseReadable?: boolean;
}

/**
 * Appends symmetrical big expressive smooth-shaded eyes.
 * When `rearChaseReadable` is enabled (tree-frog periscope eyes), sculpts panoramic golden-amber globes
 * with wrap-around horizontal obsidian slit pupils and a bright upper-crown-outer white catchlight
 * so eyes, pupils, and catchlights gleam unmistakably from BOTH the rear-3/4 chase camera AND front views!
 */
function appendExpressiveEyes(slots: MultiMatSlot[], opts: EyePlacementOptions): void {
  const r = opts.radius;
  const yawBase = opts.outwardYaw ?? 0.18;
  const smoothEyeSphere = (rad: number, uS = 20, vS = 30): RawMesh =>
    sculptRoundedPillowMesh(rad * 2, rad * 2, rad * 2, 1.0, uS, vS);
  const mapTurret = opts.paintTurretMesh ?? ((m: RawMesh) => m);
  for (const sgn of [-1, 1] as const) {
    const ex = sgn * opts.x;
    const yaw = -sgn * yawBase;
    const sinY = Math.sin(yaw);
    const cosY = Math.cos(yaw);
    const gx = -sinY;
    const gy = opts.rearChaseReadable ? 0.18 : 0.10;
    const gz = cosY;

    if (opts.turretMat !== undefined) {
      slots.push({
        materialIndex: opts.turretMat,
        mesh: mapTurret(
          transformMesh(smoothEyeSphere(r * (opts.rearChaseReadable ? 1.06 : 1.14), 18, 28), {
            pos: opts.rearChaseReadable
              ? [ex - sgn * r * 0.10, opts.y - r * 0.08, opts.z - r * 0.24]
              : [ex - sgn * r * 0.14, opts.y - r * 0.18, opts.z - r * 0.08],
            scale: opts.rearChaseReadable ? [1.04, 0.96, 0.92] : [1.02, 0.98, 1.02]
          })
        )
      });
    }

    slots.push({
      materialIndex: opts.scleraMat,
      mesh: transformMesh(
        opts.rearChaseReadable ? icosphereSmoothMesh(r, 3, 0, 19, 0) : smoothEyeSphere(r, 20, 30),
        {
          pos: [ex, opts.y, opts.z],
          rot: [-0.08, yaw, 0],
          scale: opts.rearChaseReadable ? [1.02, 1.04, 1.0] : [0.98, 1.02, 0.94]
        }
      )
    });

    if (opts.rearChaseReadable && opts.horizontalPupil) {
      // High-density icosphere obsidian cornea intersecting the amber iris at a crisp ~38° dihedral angle (zero grazing z-fight!)
      slots.push({
        materialIndex: opts.pupilMat,
        mesh: transformMesh(icosphereSmoothMesh(r * 0.85, 3, 0, 23, 0), {
          pos: [ex + sgn * r * 0.24, opts.y + r * 0.05, opts.z + r * 0.26],
          rot: [-0.06, -sgn * 0.62, 0],
          scale: [1.0, 0.98, 0.94]
        })
      });

      // 1. Upper-outer sun catchlight (gleams cleanly on the glossy eye dome from rear-3/4 chase & side views)
      slots.push(
        {
          materialIndex: opts.catchlightMat,
          mesh: transformMesh(icosphereSmoothMesh(r * 0.23, 2, 0, 29, 0), {
            pos: [ex + sgn * r * 0.56, opts.y + r * 0.64, opts.z - r * 0.06],
            rot: [0.36, -sgn * 0.78, 0],
            scale: [1.0, 0.94, 0.56]
          })
        },
        // 2. Studio Front-Upper Key Catchlight
        {
          materialIndex: opts.catchlightMat,
          mesh: transformMesh(icosphereSmoothMesh(r * 0.22, 2, 0, 31, 0), {
            pos: [ex + sgn * r * 0.32, opts.y + r * 0.40, opts.z + r * 0.92],
            rot: [-0.22, -sgn * 0.36, 0],
            scale: [1.0, 1.0, 0.54]
          })
        },
        // 3. Secondary lateral pinpoint sparkle
        {
          materialIndex: opts.catchlightMat,
          mesh: transformMesh(icosphereSmoothMesh(r * 0.11, 2, 0, 33, 0), {
            pos: [ex + sgn * r * 0.94, opts.y + r * 0.08, opts.z + r * 0.42],
            rot: [0, -sgn * 1.05, 0],
            scale: [1.0, 1.0, 0.56]
          })
        }
      );
    } else {
      const pupilScale: [number, number, number] = opts.horizontalPupil
        ? [1.10, 0.56, 0.52]
        : [0.92, 1.02, 0.56];
      slots.push(
        {
          materialIndex: opts.pupilMat,
          mesh: transformMesh(smoothEyeSphere(r * 0.58, 16, 24), {
            pos: [ex + gx * r * 0.54, opts.y + gy * r * 0.54, opts.z + gz * r * 0.54],
            rot: [-0.08, yaw, 0],
            scale: pupilScale
          })
        },
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
    }

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
  readonly kneeAccentMat?: number;
  readonly spread?: number;
  readonly paintSkinMesh?: (mesh: RawMesh) => RawMesh;
  readonly paintFootMesh?: (mesh: RawMesh) => RawMesh;
  readonly skipLimbSegments?: boolean;
}

/**
 * Sculpts athletic Z-folded muscular frog hind legs (`sculptAnatomicalLimbMesh` + `subdivideSmoothMesh`)
 * or webbed feet-only when limbs are organically fused into `sculptUnifiedFrogSdfMesh`,
 * flowing into smooth bright-tangerine webbed feet & front webbed hands grounded cleanly at `minY = 0`.
 */
function appendFrogLimbs(slots: MultiMatSlot[], skinMat: number, padMat: number, spread = 1, extra: Partial<FrogLimbSculptOptions> = {}): void {
  const thighMat = extra.thighMat ?? skinMat;
  const calfMat = extra.calfMat ?? skinMat;
  const foreMat = extra.foreMat ?? skinMat;
  const webMat = extra.webMat ?? padMat;
  const mapSkin = extra.paintSkinMesh ?? ((m: RawMesh) => shadeSmoothOrganicColors(m, undefined, 0.10));
  const mapFoot = extra.paintFootMesh ?? ((m: RawMesh) => shadeSmoothOrganicColors(m, undefined, 0.08));
  const skipLimbSegments = extra.skipLimbSegments ?? false;

  for (const sgn of [-1, 1] as const) {
    const kneeX = sgn * 0.278 * spread;
    const ankleX = sgn * 0.236 * spread;
    const footBall: V3 = [sgn * 0.242 * spread, 0.022, 0.028];

    // Flared tangerine tarsus / foot arch sweeping forward along the ground to the wide metatarsal palm
    const tarsusMesh = taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: [ankleX, 0.040, -0.112], rx: 0.036, rz: 0.038 },
            { pos: [sgn * 0.238 * spread, 0.028, -0.036], rx: 0.040, rz: 0.036 },
            { pos: [footBall[0], 0.022, footBall[2]], rx: 0.046, rz: 0.034 }
          ],
          { ringPoints: 12, capEnds: true, peakT: 0.5 }
        ),
        1,
        0.44
      ),
      2
    );

    if (!skipLimbSegments) {
      const sampleQuadraticLimb = (p0: V3, p1: V3, p2: V3, r0: number, rMid: number, r2: number, steps = 20): RawMesh => {
        const pts: V4[] = [];
        for (let i = 0; i <= steps; i += 1) {
          const t = i / steps;
          const omt = 1 - t;
          const x = omt * omt * p0[0] + 2 * omt * t * p1[0] + t * t * p2[0];
          const y = omt * omt * p0[1] + 2 * omt * t * p1[1] + t * t * p2[1];
          const z = omt * omt * p0[2] + 2 * omt * t * p1[2] + t * t * p2[2];
          const dome = i === 0 || i === steps ? 0.15 : i === 1 || i === steps - 1 ? 0.78 : 1.0;
          const baseR = omt * omt * r0 + 2 * omt * t * rMid + t * t * r2;
          pts.push([x, y, z, Math.max(0.003, baseR * dome)]);
        }
        return taubinSmoothMesh(subdivideSmoothMesh(tubeSweepMesh(pts, 20, false), 1, 0.45), 4, 0.45, -0.47);
      };

      // Smooth bowed forelimb tucked cleanly inside the chest wall (hemispherical dome ends, zero cap pucks or voxel creases!)
      const forelimbMesh = sampleQuadraticLimb(
        [sgn * 0.082 * spread, 0.340, 0.076],
        [sgn * 0.214 * spread, 0.194, 0.156],
        [sgn * 0.174 * spread, 0.022, 0.212],
        0.038,
        0.036,
        0.025,
        20
      );

      // Seamless single-spline Z-folded muscular hind leg (hip -> thigh belly -> rounded knee bend -> calf belly -> ankle; zero knee marble or seam!)
      const hindSpine = catmullRomSpline3(
        [
          [sgn * 0.076 * spread, 0.180, -0.108],
          [sgn * 0.182 * spread, 0.228, -0.036],
          [kneeX * 0.94, 0.244, 0.038],
          [sgn * 0.252 * spread, 0.148, -0.038],
          [ankleX, 0.036, -0.114]
        ],
        8,
        false
      );
      const hindProfile = [0.050, 0.064, 0.044, 0.049, 0.029];
      const hindPts: V4[] = hindSpine.map((pt, idx) => {
        const u = idx / Math.max(1, hindSpine.length - 1);
        const seg = Math.min(hindProfile.length - 2, Math.floor(u * (hindProfile.length - 1)));
        const localT = u * (hindProfile.length - 1) - seg;
        const sm = localT * localT * (3 - 2 * localT);
        const rBase = hindProfile[seg]! * (1 - sm) + hindProfile[seg + 1]! * sm;
        const dome = idx === 0 || idx === hindSpine.length - 1 ? 0.16 : idx === 1 || idx === hindSpine.length - 2 ? 0.80 : 1.0;
        return [pt[0], pt[1], pt[2], Math.max(0.003, rBase * dome)];
      });
      const hindLegMesh = taubinSmoothMesh(subdivideSmoothMesh(tubeSweepMesh(hindPts, 20, false), 1, 0.45), 4, 0.45, -0.47);
      slots.push(
        { materialIndex: thighMat, mesh: mapSkin(hindLegMesh) },
        { materialIndex: foreMat, mesh: mapSkin(forelimbMesh) }
      );
    }

    slots.push(
      { materialIndex: padMat, mesh: mapFoot(tarsusMesh) },
      {
        materialIndex: padMat,
        mesh: mapFoot(
          transformMesh(sculptRoundedPillowMesh(0.054, 0.028, 0.058, 0.88, 10, 16), {
            pos: [ankleX, 0.014, -0.114]
          })
        )
      }
    );

    if (extra.kneeAccentMat !== undefined) {
      slots.push({
        materialIndex: extra.kneeAccentMat,
        mesh: bakeMeshCavityAO(
          transformMesh(icosphereSmoothMesh(0.052, 2, 0, 39, 0.1), {
            pos: [kneeX * 1.02, 0.238, 0.024],
            scale: [0.95, 0.92, 1.08]
          }),
          0.12
        )
      });
    }

    // 3 flared webbed tangerine hind toes + plump round tree-frog suction toe-pads grounded cleanly at `y = 0`
    const hindToes: readonly V3[] = [
      [sgn * 0.166 * spread, 0.015, 0.160],
      [sgn * 0.238 * spread, 0.015, 0.194],
      [sgn * 0.296 * spread, 0.015, 0.144]
    ];
    slots.push(
      { materialIndex: webMat, mesh: mapFoot(sculptFootWebbingMesh(footBall, hindToes[0]!, hindToes[1]!, 0.80)) },
      { materialIndex: webMat, mesh: mapFoot(sculptFootWebbingMesh(footBall, hindToes[1]!, hindToes[2]!, 0.80)) }
    );
    for (const tip of hindToes) {
      slots.push(
        {
          materialIndex: padMat,
          mesh: mapFoot(
            tubeSweepMesh(
              [
                [footBall[0], 0.022, footBall[2], 0.019],
                [(footBall[0] + tip[0]) * 0.5, 0.019, (footBall[2] + tip[2]) * 0.5, 0.016],
                [tip[0], 0.016, tip[2], 0.013]
              ],
              12,
              false
            )
          )
        },
        {
          materialIndex: padMat,
          mesh: mapFoot(
            transformMesh(sculptRoundedPillowMesh(0.056, 0.030, 0.062, 0.86, 12, 18), {
              pos: [tip[0], 0.015, tip[2] + 0.012]
            })
          )
        }
      );
    }

    // 3 splayed front webbed fingers + cute round tangerine suction finger-pads grounded cleanly at `y = 0`
    const wristOrigin: V3 = [sgn * 0.174 * spread, 0.020, 0.212];
    const frontFingers: readonly V3[] = [
      [sgn * 0.130 * spread, 0.014, 0.270],
      [sgn * 0.180 * spread, 0.014, 0.284],
      [sgn * 0.228 * spread, 0.014, 0.262]
    ];
    slots.push(
      { materialIndex: webMat, mesh: mapFoot(sculptFootWebbingMesh(wristOrigin, frontFingers[0]!, frontFingers[1]!, 0.68)) },
      { materialIndex: webMat, mesh: mapFoot(sculptFootWebbingMesh(wristOrigin, frontFingers[1]!, frontFingers[2]!, 0.68)) }
    );
    for (const fTip of frontFingers) {
      slots.push(
        {
          materialIndex: padMat,
          mesh: mapFoot(
            tubeSweepMesh(
              [
                [wristOrigin[0], 0.020, wristOrigin[2], 0.014],
                [fTip[0], 0.015, fTip[2], 0.011]
              ],
              10,
              false
            )
          )
        },
        {
          materialIndex: padMat,
          mesh: mapFoot(
            transformMesh(sculptRoundedPillowMesh(0.044, 0.028, 0.048, 0.86, 10, 16), {
              pos: [fTip[0], 0.014, fTip[2] + 0.008]
            })
          )
        }
      );
    }
  }
}

/**
 * Sculpts `Hop`'s signature coral-orange explorer neckerchief/bandana projected strictly outside `evalUnifiedFrogSdf`
 * (`>= +0.018` clearance everywhere!) so ZERO 1px vertical side-clipping slivers can ever pierce the frog's skin!
 */
function appendFrogExplorerBandana(slots: MultiMatSlot[], profile: FrogAnatomyProfile, bandanaMat: number): void {
  const collarRings: V3[][] = [];
  const ringSegs = 44;
  const tubeRadial = 14;
  for (let i = 0; i < ringSegs; i += 1) {
    const phi = (i / ringSegs) * Math.PI * 2;
    const ca = Math.cos(phi);
    const sa = Math.sin(phi); // +1 = nape back, -1 = throat front
    const frontDip = Math.max(0, -sa);
    const seedPt: V3 = [
      ca * 0.106,
      0.412 + 0.014 * sa - 0.032 * frontDip,
      0.086 - 0.058 * sa + 0.048 * frontDip
    ];
    const rad = 0.010 + 0.002 * frontDip;
    const surfPt = projectPointOutsideFrogSdf(seedPt, 0.0035, profile, false);
    const ox = ca;
    const oz = -sa;
    const ring: V3[] = [];
    for (let k = 0; k < tubeRadial; k += 1) {
      const a = (k / tubeRadial) * Math.PI * 2;
      const cR = Math.cos(a);
      const sR = Math.sin(a);
      // Low-profile flat woven ribbon hugging the neck waist (`0.58 * rad` radial thickness, never a puffy dog-collar!)
      ring.push([
        surfPt[0] + ox * cR * rad * 0.58,
        surfPt[1] + sR * rad * 1.18,
        surfPt[2] + oz * cR * rad * 0.58
      ]);
    }
    collarRings.push(ring);
  }
  collarRings.push(collarRings[0]!.map((p): V3 => [p[0], p[1], p[2]]));
  const collarRoll = paintCoralBandana(
    recomputeSmoothWeldedNormals(taubinSmoothMesh(loftSectionsMesh(collarRings, false, false), 2, 0.40, -0.42))
  );

  // Neat tucked front triangular kerchief fold resting flush against the upper sternum
  const bibA = projectPointOutsideFrogSdf([0, 0.368, 0.172], 0.005, profile, false);
  const bibB = projectPointOutsideFrogSdf([0, 0.332, 0.184], 0.005, profile, false);
  const bibC = projectPointOutsideFrogSdf([0, 0.304, 0.188], 0.004, profile, false);
  const frontKerchief = paintCoralBandana(
    taubinSmoothMesh(
      subdivideSmoothMesh(
        sculptAnatomicalLimbMesh(
          [
            { pos: bibA, rx: 0.052, rz: 0.009 },
            { pos: bibB, rx: 0.032, rz: 0.008 },
            { pos: bibC, rx: 0.011, rz: 0.006 }
          ],
          { ringPoints: 12, capEnds: true, peakT: 0.3 }
        ),
        1,
        0.48
      ),
      2
    )
  );

  // Sleek low-profile nape knot nestled snugly in the cervical crease (`-Z` chase-camera accent)
  const knotPos = projectPointOutsideFrogSdf([0, 0.424, -0.010], 0.005, profile, false);
  const rearKnot = paintCoralBandana(
    transformMesh(sculptRoundedPillowMesh(0.036, 0.024, 0.026, 0.86, 12, 18), {
      pos: knotPos,
      rot: [0.36, 0, 0]
    })
  );

  slots.push(
    { materialIndex: bandanaMat, mesh: collarRoll },
    { materialIndex: bandanaMat, mesh: frontKerchief },
    { materialIndex: bandanaMat, mesh: rearKnot }
  );

  // Two sleek, flat-draped folded neckerchief ends resting flush along the upper back
  for (const [sgn, spreadX, dropY, reachZ] of [
    [-1, 0.036, 0.042, 0.068],
    [1, 0.040, 0.048, 0.076]
  ] as const) {
    const tRoot = projectPointOutsideFrogSdf([sgn * 0.010, knotPos[1] - 0.003, knotPos[2] - 0.005], 0.0045, profile, false);
    const tMid = projectPointOutsideFrogSdf(
      [sgn * spreadX * 0.55, knotPos[1] - dropY * 0.46, knotPos[2] - reachZ * 0.54],
      0.0045,
      profile,
      false
    );
    const tTip = projectPointOutsideFrogSdf(
      [sgn * spreadX, knotPos[1] - dropY, knotPos[2] - reachZ],
      0.004,
      profile,
      false
    );
    const tailRibbon = paintCoralBandana(
      sculptCurvedHairLockMesh({
        root: tRoot,
        mid: tMid,
        tip: tTip,
        width: 0.028,
        thickness: 0.009,
        segments: 9,
        radialSegments: 12
      })
    );
    slots.push({ materialIndex: bandanaMat, mesh: tailRibbon });
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
  // 0: frog skin (vertex-painted emerald-lime -> chartreuse -> butter-cream + cavity AO on Hop; 24k gold on Golden Hop),
  // 1: butter-cream belly & vocal sac, 2: smiling mouth crease & nostrils, 3: flared tangerine webbed feet & suction pads,
  // 4: raised golden-amber periscope iris, 5: panoramic horizontal obsidian pupil, 6: catchlights,
  // 7: coral-orange explorer bandana (`hop`) / royal ruby cabochons (`goldenHop`)
  const profile: FrogAnatomyProfile = {
    widthScale: 1.0,
    eyeDomeAmp: 0.132,
    headFlare: 1.15,
    dorsolateralRidge: 0.008,
    spinalRidge: 0.013,
    tailboneTuck: 0.018,
    pitchLift: 1.0
  };

  const paintSkin = withRoyalCrown
    ? (m: RawMesh) => shadeSmoothOrganicColors(m, undefined, 0.09)
    : (m: RawMesh) => paintFrogAmphibianSkin(m, 0.09);
  const paintFoot = withRoyalCrown
    ? (m: RawMesh) => shadeSmoothOrganicColors(m, undefined, 0.09)
    : (m: RawMesh) => paintTangerineWebbedFoot(m, 0.07);

  // Sleek Meshy-grade hybrid sculpt:
  // 1) Glass-smooth Newton-projected + tangentially-relaxed analytic-normal SDF head, brow hoods, tapered neck & poised torso,
  // 2) Crisply articulated Loop-subdivided muscular Z-folded thighs, calves & bowed forelimbs with clean silhouette negative space!
  const unifiedHeadNeckTorso = paintSkin(sculptUnifiedFrogSdfMesh(profile, false));

  // Soft ventral cream belly cushion tucked cleanly inside the lower torso
  const bellyBase = transformMesh(icosphereSmoothMesh(0.072, 2, 0, 37, 0), {
    pos: [0, 0.244, 0.026],
    rot: [-0.46, 0, 0],
    scale: [0.95, 0.62, 1.05]
  });
  const belly = shadeSmoothOrganicColors(bellyBase, undefined, 0.08);

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: unifiedHeadNeckTorso },
    { materialIndex: 1, mesh: belly }
  ];

  // Subtle sculpted snout nostril accents (slot materialIndex 2, zero black mustache bar!)
  for (const sgn of [-1, 1] as const) {
    const nostrilPt = projectPointOutsideFrogSdf([sgn * 0.046, 0.486, 0.304], 0.001, profile, false);
    slots.push({
      materialIndex: 2,
      mesh: shadeSmoothOrganicColors(
        transformMesh(icosphereSmoothMesh(0.009, 2, 0, 15, 0), {
          pos: nostrilPt,
          scale: [1.1, 0.62, 0.85]
        }),
        undefined,
        0.08
      )
    });
  }

  // Crisply articulated muscular Z-folded thighs, calves, bowed forelimbs & flared webbed tree-frog feet grounded at `minY = 0`!
  appendFrogLimbs(slots, 0, 3, 0.94, {
    thighMat: 0,
    calfMat: 0,
    foreMat: 0,
    webMat: 3,
    paintSkinMesh: paintSkin,
    paintFootMesh: paintFoot,
    skipLimbSegments: false
  });

  // Sleek obsidian-and-amber tree-frog eyes cupped cleanly inside the sculpted green supraorbital brow & posterior eyelid hoods!
  appendExpressiveEyes(slots, {
    x: 0.144,
    y: 0.568,
    z: 0.150,
    radius: 0.056,
    scleraMat: 4,
    pupilMat: 5,
    catchlightMat: 6,
    horizontalPupil: true,
    outwardYaw: 0.78,
    rearChaseReadable: true
  });

  if (withRoyalCrown) {
    // Royal ruby cheek cabochons + smooth-shaded 5-point 24k gold coronet nestled cleanly between the brow hoods
    for (const sgn of [-1, 1] as const) {
      const rubyPt = projectPointOutsideFrogSdf([sgn * 0.188, 0.452, 0.172], 0.004, profile, false);
      slots.push({
        materialIndex: 7,
        mesh: transformMesh(icosphereSmoothMesh(0.022, 2, 0, 57, 0), {
          pos: rubyPt,
          scale: [0.55, 1.0, 1.0]
        })
      });
    }
    const crownZ = 0.088;
    const crownY = 0.548;
    const band = latheMesh(
      [
        [0.060, 0.0],
        [0.078, 0.0],
        [0.090, 0.056],
        [0.072, 0.060],
        [0.060, 0.0]
      ],
      28,
      false
    );
    slots.push({ materialIndex: 1, mesh: shadeSmoothOrganicColors(transformMesh(band, { pos: [0, crownY, crownZ] }), undefined, 0.08) });
    for (let i = 0; i < 5; i += 1) {
      const a = (i / 5) * Math.PI * 2;
      const sa = Math.sin(a);
      const ca = Math.cos(a);
      slots.push(
        {
          materialIndex: 1,
          mesh: tubeSweepMesh(
            [
              [sa * 0.078, crownY + 0.050, crownZ + ca * 0.078, 0.016],
              [sa * 0.088, crownY + 0.088, crownZ + ca * 0.088, 0.011],
              [sa * 0.094, crownY + 0.118, crownZ + ca * 0.094, 0.006]
            ],
            12,
            false
          )
        },
        {
          materialIndex: 1,
          mesh: transformMesh(icosphereSmoothMesh(0.012, 2, 0, 63 + i, 0), {
            pos: [sa * 0.095, crownY + 0.124, crownZ + ca * 0.095]
          })
        },
        {
          materialIndex: 7,
          mesh: transformMesh(icosphereSmoothMesh(0.015, 2, 0, 71 + i, 0), {
            pos: [sa * 0.087, crownY + 0.028, crownZ + ca * 0.087]
          })
        }
      );
    }
  } else {
    // Hop's signature coral-orange explorer neckerchief projected cleanly outside the SDF neck!
    appendFrogExplorerBandana(slots, profile, 7);
  }

  // Animated submandibular vocal-sac pouch centered on its local throat pivot: tucked 4mm inside at rest (zero z-fight!) and domes out on ribbit
  const vocalSacPivot: V3 = [0, 0.402, 0.186];
  const vocalSacMesh = shadeSmoothOrganicColors(
    transformMesh(icosphereSmoothMesh(0.056, 3, 0, 41, 0), { scale: [1.04, 0.68, 0.86] }),
    undefined,
    0.08
  );

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
      withRoyalCrown ? CROSS_HOP_PROCEDURAL_MATERIALS.crownRubyGem : CROSS_HOP_PROCEDURAL_MATERIALS.frogCoralBandana
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
    eyeDomeAmp: 0.118,
    headFlare: 1.12,
    dorsolateralRidge: 0.014,
    spinalRidge: 0.015,
    tailboneTuck: 0.016,
    pitchLift: 1.0
  };
  const chassis = bakeMeshCavityAO(buildSubdividedFrogBodyMesh(roboProfile), 0.14);

  // Contoured brushed-steel ventral sternum & belly armor shell (zero flat `bevelBoxMesh` faces)
  const chestPlate = bakeMeshCavityAO(
    sculptFrogSurfacePatchMesh(
      roboProfile,
      0.20,
      0.84,
      (212 * Math.PI) / 180,
      (328 * Math.PI) / 180,
      18,
      20,
      0.013
    ),
    0.12
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

  // Curved wrap-around gunmetal optic visor + glowing cyan dual-optic LED arc wrapping around the wide head temples
  const visorHousingPts: V4[] = [];
  const visorGlowPts: V4[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const t = (i / 18) * 2 - 1;
    const ang = t * 1.32;
    const xV = Math.sin(ang) * 0.246;
    const zV = 0.142 + Math.cos(ang) * 0.170;
    const yV = 0.505 + 0.052 * (1 - 0.32 * t * t);
    const rFactor = 1 - 0.20 * Math.pow(Math.abs(t), 2.2);
    visorHousingPts.push([xV, yV, zV, 0.040 * rFactor]);
    if (Math.abs(t) <= 0.92) {
      visorGlowPts.push([xV * 1.015, yV + 0.004, zV + Math.cos(ang) * 0.018, 0.027 * rFactor]);
    }
  }
  const visorHousing = subdivideSmoothMesh(tubeSweepMesh(visorHousingPts, 14, false), 1, 0.42);
  const visorGlow = subdivideSmoothMesh(tubeSweepMesh(visorGlowPts, 12, false), 1, 0.42);

  const slots: MultiMatSlot[] = [
    { materialIndex: 0, mesh: chassis },
    { materialIndex: 3, mesh: chestPlate },
    { materialIndex: 1, mesh: chestBezel },
    { materialIndex: 2, mesh: chestCore },
    { materialIndex: 1, mesh: visorHousing },
    { materialIndex: 2, mesh: visorGlow }
  ];

  // Dorsal segmented titanium spine vents + twin thruster pods + telemetry antennae + periscope cyan optic domes
  for (const uPlate of [0.28, 0.44, 0.58] as const) {
    slots.push({
      materialIndex: 3,
      mesh: sculptFrogSkinSpotMesh(roboProfile, uPlate, Math.PI * 0.5, 0.052, 0.22, 0.011, 4, 16)
    });
  }
  for (const sgn of [-1, 1] as const) {
    slots.push(
      // Raised periscope cyan optic sensor dome + rear-3/4 white catchlight so Robo-Frog's eyes gleam from behind!
      {
        materialIndex: 2,
        mesh: transformMesh(icosphereSmoothMesh(0.056, 2, 0, 129, 0), {
          pos: [sgn * 0.168, 0.612, 0.146],
          scale: [1.04, 0.96, 1.02]
        })
      },
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.018, 2, 0, 135, 0), {
          pos: [sgn * 0.198, 0.648, 0.126]
        })
      },
      // Twin swept telemetry antennae on the optic domes + cyan beacon tips
      {
        materialIndex: 3,
        mesh: tubeSweepMesh(
          [
            [sgn * 0.138, 0.618, 0.11, 0.016],
            [sgn * 0.172, 0.698, 0.035, 0.011],
            [sgn * 0.190, 0.758, -0.025, 0.007]
          ],
          12,
          false
        )
      },
      {
        materialIndex: 2,
        mesh: transformMesh(icosphereSmoothMesh(0.019, 2, 0, 131, 0), {
          pos: [sgn * 0.192, 0.764, -0.028]
        })
      },
      // Twin crisp white optic catchlights on the front cyan visor
      {
        materialIndex: 4,
        mesh: transformMesh(icosphereSmoothMesh(0.016, 2, 0, 137, 0), {
          pos: [sgn * 0.132, 0.562, 0.302]
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
            [sgn * 0.262, 0.254, -0.005, 0.012]
          ],
          10,
          false
        )
      }
    );
  }

  // Articulated Z-folded mecha-frog haunches, gunmetal knee servos, 3-toed alloy landing pads (`minY = 0`)
  appendFrogLimbs(slots, 0, 3, 0.96, {
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
    widthScale: 1.04,
    eyeDomeAmp: 0.108,
    headFlare: 1.14,
    dorsolateralRidge: 0.010,
    spinalRidge: 0.012,
    tailboneTuck: 0.016,
    pitchLift: 0.98
  };

  // Smooth 2x Loop-subdivided crouched sage-green amphibian toad body & wide smiling toad head
  const toadBody = bakeMeshCavityAO(buildSubdividedFrogBodyMesh(toadProfile), 0.14);

  // Conforming polished-steel breastplate & backplate cuirass shells over the crouched toad torso
  const breastplate = bakeMeshCavityAO(
    sculptFrogSurfacePatchMesh(
      toadProfile,
      0.18,
      0.64,
      (200 * Math.PI) / 180,
      (340 * Math.PI) / 180,
      18,
      22,
      0.018
    ),
    0.12
  );
  const backplate = bakeMeshCavityAO(
    sculptFrogSurfacePatchMesh(
      toadProfile,
      0.14,
      0.60,
      (20 * Math.PI) / 180,
      (160 * Math.PI) / 180,
      18,
      22,
      0.018
    ),
    0.12
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

  // Domed steel sallet helm perched heroically on the toad crown between the twin raised toad eyes
  const helmPos: V3 = [0, 0.556, 0.088];
  const steelHelm = transformMesh(
    latheMesh(
      [
        [0.138, 0.0],
        [0.156, 0.032],
        [0.142, 0.115],
        [0.092, 0.175],
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
        [0.136, -0.004],
        [0.162, 0.008],
        [0.162, 0.032],
        [0.140, 0.038],
        [0.136, -0.004]
      ],
      28,
      false
    ),
    { pos: helmPos, rot: [-0.10, 0, 0] }
  );
  // Sweeping crimson horsehair plume crest arcing gracefully behind the helm
  const plume = subdivideSmoothMesh(
    tubeSweepMesh(
      [
        [0, 0.742, 0.078, 0.032],
        [0, 0.832, -0.002, 0.056],
        [0, 0.802, -0.132, 0.052],
        [0, 0.682, -0.232, 0.036],
        [0, 0.562, -0.272, 0.015]
      ],
      14,
      false
    ),
    1,
    0.44
  );

  // Smooth curved heraldic heater shield (zero flat `extrudePolygonMesh` walls!)
  const makeCurvedHeaterShield = (sx: number, sy: number, thick: number): RawMesh =>
    sculptClosedParametricSurface(16, 24, (u, phi) => {
      const theta = (1 - u) * Math.PI;
      const st = Math.sin(theta);
      const ct = Math.cos(theta);
      const yNorm = ct;
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

  // Knight broadsword at right hip
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

  const toadSmile = tubeSweepMesh(
    [
      [-0.20, 0.398, 0.215, 0.011],
      [-0.095, 0.370, 0.310, 0.013],
      [0.0, 0.362, 0.338, 0.013],
      [0.095, 0.370, 0.310, 0.013],
      [0.20, 0.398, 0.215, 0.011]
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
  appendFrogLimbs(slots, 1, 0, 0.98, {
    thighMat: 1,
    calfMat: 0,
    foreMat: 0,
    webMat: 1,
    kneeAccentMat: 4
  });

  // Expressive panoramic horizontal-pupil golden-amber toad eyes peeking boldly beside the sallet helm
  appendExpressiveEyes(slots, {
    x: 0.168,
    y: 0.565,
    z: 0.172,
    radius: 0.066,
    turretMat: 1,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7,
    horizontalPupil: true,
    outwardYaw: 0.78,
    rearChaseReadable: true
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
  const evaTorso = bakeMeshCavityAO(
    subdivideSmoothMesh(
      verticalContourLoft(
        [
          { y: 0.11, rx: 0.165, rz: 0.165, z: -0.06, n: 2.0 },
          { y: 0.22, rx: 0.215, rz: 0.205, z: -0.01, n: 2.04 },
          { y: 0.35, rx: 0.205, rz: 0.195, z: 0.04, n: 2.04 },
          { y: 0.45, rx: 0.175, rz: 0.170, z: 0.06, n: 2.0 }
        ],
        24
      ),
      1,
      0.44
    ),
    0.12
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

  // Smooth Loop-subdivided emerald-lime tree-frog head (`paintFrogAmphibianSkin`) nestled cleanly inside the glass bubble!
  const innerHeadProfile: FrogAnatomyProfile = {
    widthScale: 0.62,
    eyeDomeAmp: 0.072,
    headFlare: 1.15,
    dorsolateralRidge: 0,
    spinalRidge: 0,
    tailboneTuck: 0,
    pitchLift: 0.62
  };
  const frogHeadCage = sculptClosedParametricSurface(14, 18, (u, phi) => {
    const uHead = 0.44 + 0.56 * u;
    const p = evalFrogSkinPoint(uHead, phi, innerHeadProfile);
    const backPinch = u < 0.18 ? Math.sin((u / 0.18) * (Math.PI * 0.5)) : 1;
    return [p[0] * backPinch, (p[1] - 0.34) * backPinch, (p[2] - 0.09) * backPinch];
  });
  const frogHead = paintFrogAmphibianSkin(
    transformMesh(subdivideSmoothMesh(frogHeadCage, 2, 0.44), { pos: [0, 0.598, 0.055] }),
    0.14
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

  // Smooth pillowed chest telemetry pod + round indicator lenses
  const chestModule = transformMesh(sculptRoundedPillowMesh(0.165, 0.115, 0.052, 0.80, 12, 18), {
    pos: [0, 0.325, 0.228],
    rot: [-0.14, 0, 0]
  });

  // Curved white EVA sun-visor hood trimmed higher so the inner emerald frog & golden eyes show clearly through the bubble!
  const sunShield = transformMesh(
    latheMesh(
      [
        [0.196, 0.748],
        [0.210, 0.768],
        [0.158, 0.832],
        [0.0, 0.862]
      ],
      28,
      false
    ),
    { pos: [0, 0, 0.03], rot: [-0.16, 0, 0] }
  );

  // Twin-cylinder Apollo life-support oxygen tanks + steel manifold on `-Z`
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
      {
        materialIndex: 1,
        mesh: transformMesh(icosphereSmoothMesh(0.036, 2, 0, 181, 0), {
          pos: [sgn * 0.190, 0.105, 0.198],
          scale: [1.05, 0.62, 1.05]
        })
      }
    );
  }

  // Pressurized Z-folded EVA frog hind legs, orange knee bellows & 3-toed webbed EVA moon-pad feet (`minY = 0`)
  appendFrogLimbs(slots, 0, 1, 0.95, {
    thighMat: 0,
    calfMat: 0,
    foreMat: 0,
    webMat: 1,
    kneeAccentMat: 1
  });

  // Raised golden-amber / obsidian frog eyes safely inside the `r = 0.225` transparent bubble dome
  appendExpressiveEyes(slots, {
    x: 0.098,
    y: 0.665,
    z: 0.156,
    radius: 0.048,
    scleraMat: 5,
    pupilMat: 6,
    catchlightMat: 7,
    horizontalPupil: true,
    outwardYaw: 0.72,
    rearChaseReadable: true
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
        CROSS_HOP_PROCEDURAL_MATERIALS.frogTangerineFoot,
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

function shouldSkipAutoCritterAO(mat: AuraMaterialSpec | undefined): boolean {
  if (!mat) return true;
  if (
    mat === CROSS_HOP_PROCEDURAL_MATERIALS.critterCatchlight ||
    mat === CROSS_HOP_PROCEDURAL_MATERIALS.critterEyeSclera ||
    mat === CROSS_HOP_PROCEDURAL_MATERIALS.critterEyePupil ||
    mat === CROSS_HOP_PROCEDURAL_MATERIALS.frogGoldenIris
  ) {
    return true;
  }
  const rec = mat as Record<string, unknown>;
  return rec.emissive !== undefined || rec.practical === true;
}

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

  const fittedSlots: MultiMatSlot[] = recipe.slots.map((s) => {
    // Never overwrite exact analytic SDF gradient normals with triangle-facet Taubin recomputation!
    const faired = !s.mesh.analyticNormals && s.mesh.positions.length / 3 < 2500
      ? taubinSmoothMesh(s.mesh, 2, 0.42, -0.44)
      : s.mesh;
    const transformed = transformMesh(faired, { scale, pos: [tx, ty, tz] });
    const mat = recipe.materials[s.materialIndex];
    const shaded = shouldSkipAutoCritterAO(mat)
      ? paintMeshColors(transformed, [1, 1, 1, 1], false)
      : transformed.colors
        ? transformed
        : shadeSmoothOrganicColors(transformed, [1, 1, 1, 1], 0.09);
    return {
      materialIndex: s.materialIndex,
      mesh: shaded
    };
  });
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
  // Disable coarse 220m world shadow-map self-shadow acne ripples on curved 0.5m organic critters while preserving ground castShadow.
  const receiveShadow = opts.receiveShadow ?? false;
  const g = getFittedCritterGeometry(id, targetHeight);
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
  // Decouple outer world Y-yaw (`opts.name`) from inner local pitch/bank (`${opts.name}-tilt`) so Euler ZYX gimbal lock
  // or worker-thread angle interpolation can NEVER flip or underground-clip the critter on lateral/forward hops!
  const innerTilt = group(`${opts.name}-tilt`, children).runtime(game.runtimeNode(`${opts.name}-tilt`));
  return group(opts.name, [innerTilt]);
}
