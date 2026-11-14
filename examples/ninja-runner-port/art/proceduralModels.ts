/**
 * WP-24 — Shadowstep Gauntlet (`ninja-runner-port`) Procedural Multi-Material 3D Art Kit.
 *
 * Replaces all static district & set-piece Meshy GLBs with sculpted multi-material Sengoku
 * dusk architecture, foliage, watermill engineering, hazards, weapons, and pickups built
 * exclusively from `apps/showcase-port-shared/proceduralKernel.ts` and `@aura3d/engine`.
 * Keeps the 6 `skins=1` rigged ninja/rival skeletons intact with upgraded shinobi cloth
 * sheen + anisotropic metallic armor overrides. Zero `three` imports.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraTransformSpec,
  type TypedGLBActor
} from "@aura3d/engine";

type GroupBuilder = ReturnType<typeof assembleMultiMaterialNode>;
type InstancedPrimitiveBuilder = ReturnType<typeof instances.custom>;
type ActorMaterialOverride = Parameters<TypedGLBActor["setMaterialOverrides"]>[0];
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bakeMeshCavityAO,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
  computePositionsBounds,
  coniferBoughTierMesh,
  extrudePolygonMesh,
  hash01,
  icosphereFacetMesh,
  latheMesh,
  layeredCanopyMesh,
  loftSectionsMesh,
  memoizeGeometry,
  mergeRawMeshes,
  paintMeshColors,
  sculptHumanoidLimbMesh,
  stratifiedCliffMesh,
  subdivideSmoothMesh,
  transformMesh,
  tubeSweepMesh,
  type MultiMatSlot,
  type RawMesh,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import { MESHY_MANIFEST, type PropId } from "../assets/meshy/manifest";
import type { CharacterId } from "../models";
import type { CourseAccents, ModelPlacement, ModelSink } from "../scenery";

/** Strips preset `.name` so shared material specs never emit duplicate names in scene JSON. */
export const unnamed = (spec: AuraMaterialSpec): AuraMaterialSpec => {
  const { name: _name, ...rest } = spec;
  return rest;
};

// ---------------------------------------------------------------------------
// 1. Sengoku Dusk Physical Material Library (>= 8 distinct `material.*` presets)
// ---------------------------------------------------------------------------

/** Rich physical materials for non-instanced multi-material hero set-pieces, weapons & hazards. */
export const SENGOKU_MATERIALS = {
  /** Aged hinoki & dark cedar structural beams (`wood` lacquer lobe). */
  woodDarkCedar: unnamed(material.lacquer({
    color: "#4d2f1e",
    roughness: 0.44,
    clearcoat: 0.46,
    clearcoatRoughness: 0.24
  })),
  /** Warm soaked mill-wheel & bridge timber (`wood` grain tone). */
  woodMillTimber: unnamed(material.lacquer({
    color: "#6f472c",
    roughness: 0.5,
    clearcoat: 0.36,
    clearcoatRoughness: 0.28
  })),
  /** Sacred Myojin torii & tenshu vermilion (`clearcoatPaint`). */
  vermilionLacquer: unnamed(material.clearcoatPaint({
    color: "#cc3728",
    roughness: 0.2,
    clearcoat: 0.9,
    clearcoatRoughness: 0.07
  })),
  /** Glazed indigo-slate Sengoku `kawara` roof tiles (`ceramic`). */
  kawaraGlazeTile: unnamed(material.ceramic({
    color: "#273244",
    roughness: 0.26,
    clearcoat: 0.78,
    clearcoatRoughness: 0.1
  })),
  /** Lime-white `shikkui` castle plaster (`ceramic` matte lime). */
  shikkuiPlaster: unnamed(material.ceramic({
    color: "#eae0cf",
    roughness: 0.58,
    clearcoat: 0.16,
    clearcoatRoughness: 0.36
  })),
  /** Cyclopean `ishigaki` granite & carved stone (`mineral`). */
  ishigakiGranite: unnamed(material.pbr({
    color: "#7b7f7c",
    roughness: 0.86,
    metallic: 0.04
  })),
  /** Weathered river-moss granite (`mineral` secondary). */
  mossyBasalt: unnamed(material.pbr({
    color: "#5c6c5b",
    roughness: 0.88,
    metallic: 0.03
  })),
  /** Folded `tamahagane` katana & shuriken steel (`anisotropicMetal` / `brushedMetal`). */
  tamahaganeSteel: unnamed(material.brushedMetal({
    color: "#dfe8f5",
    roughness: 0.15,
    metallic: 0.97
  })),
  /** Blackened forged iron straps, axle hubs & studs (`brushedMetal`). */
  forgedIron: unnamed(material.brushedMetal({
    color: "#363f4d",
    roughness: 0.3,
    metallic: 0.9
  })),
  /** Imperial gilded bronze `sorin` finial, `tsuba`, & `koban` gold (`studioMetal`). */
  imperialGold: unnamed(material.studioMetal({
    color: "#e6b44c",
    roughness: 0.2,
    metallic: 0.95
  })),
  /** Indigo shinobi silk wrap & scroll backing (`sheenFabric` / `fabric`). */
  shinobiIndigoCloth: unnamed(material.fabric({
    color: "#2b3a5e",
    roughness: 0.72,
    sheen: 0.86,
    sheenColor: "#8fb0ea",
    sheenRoughness: 0.32
  })),
  /** Persimmon `noren` curtain & scroll silk (`sheenFabric` / `fabric`). */
  crimsonNorenCloth: unnamed(material.fabric({
    color: "#b9382a",
    roughness: 0.7,
    sheen: 0.82,
    sheenColor: "#ffb89e",
    sheenRoughness: 0.35
  })),
  /** Translucent warm washi `shoji` screen & lantern pane (`material.physical`, never `studioGlass` w/ opacity < 1). */
  shojiWashiPaper: unnamed(material.physical({
    color: "#ffe7b8",
    roughness: 0.08,
    opacity: 0.55,
    clearcoat: 0.8,
    ior: 1.5
  })),
  /** Warm amber lantern flame core (`practical: true` for art-direction audit compliance). */
  lanternFlameEmissive: unnamed(material.emissive({
    color: "#fff2d2",
    emissive: "#ffb048",
    emissiveIntensity: 2.5,
    practical: true
  })),
  /** Cyan shinobi spirit seal glow (`practical: true`). */
  spiritSealEmissive: unnamed(material.emissive({
    color: "#d6f8ff",
    emissive: "#51dfff",
    emissiveIntensity: 2.35,
    practical: true
  }))
} as const;

/**
 * Instancing-safe materials (`clearcoat: 0, sheen: 0` strictly enforced on `material.pbr` / `material.metal`)
 * for all `instances.custom` district batches (`> 16` instances).
 */
export type InstMatKey =
  | "kawaraRoof"
  | "shikkuiWall"
  | "cedarWood"
  | "vermilion"
  | "ishigakiStone"
  | "mossStone"
  | "bambooCulm"
  | "pineFoliage"
  | "sakuraFoliage"
  | "clothCanopy"
  | "goldTrim"
  | "warmLanternCore";

export const INST_SENGOKU_MATERIALS: Readonly<Record<InstMatKey, AuraMaterialSpec>> = {
  kawaraRoof: unnamed(material.pbr({ color: "#1f293d", roughness: 0.28, metallic: 0.14, clearcoat: 0, sheen: 0 })),
  shikkuiWall: unnamed(material.pbr({ color: "#f3e9d7", roughness: 0.7, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  cedarWood: unnamed(material.pbr({ color: "#4a2816", roughness: 0.66, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  vermilion: unnamed(material.pbr({ color: "#c9261e", roughness: 0.28, metallic: 0.08, clearcoat: 0, sheen: 0 })),
  ishigakiStone: unnamed(material.pbr({ color: "#948e82", roughness: 0.84, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  mossStone: unnamed(material.pbr({ color: "#4b6b47", roughness: 0.86, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  bambooCulm: unnamed(material.pbr({ color: "#3f873c", roughness: 0.42, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  pineFoliage: unnamed(material.pbr({ color: "#256332", roughness: 0.74, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  sakuraFoliage: unnamed(material.pbr({ color: "#fff7fa", roughness: 0.7, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  clothCanopy: unnamed(material.pbr({ color: "#cc3324", roughness: 0.7, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  goldTrim: unnamed(material.metal({ color: "#e8b43c", roughness: 0.22, metallic: 0.94, clearcoat: 0, sheen: 0 })),
  warmLanternCore: unnamed(material.pbr({
    color: "#ffe8b0",
    emissive: "#ff9d32",
    emissiveIntensity: 2.25,
    practical: true,
    roughness: 0.32,
    metallic: 0,
    clearcoat: 0,
    sheen: 0
  }))
};

// ---------------------------------------------------------------------------
// 2. Core Sengoku Curved Architectural & Botanical Sculpting Primitives
// ---------------------------------------------------------------------------

const srgbChanToLin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
function hexToLinearRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const n = parseInt(clean, 16);
  return [
    srgbChanToLin(((n >> 16) & 255) / 255),
    srgbChanToLin(((n >> 8) & 255) / 255),
    srgbChanToLin((n & 255) / 255)
  ];
}

/**
 * Color-preserving `RawMesh` combiner: unlike `mergeRawMeshesToRaw`, this NEVER drops `COLOR_0`
 * (`m.colors`), filling `[1, 1, 1, 1]` for any uncolored sub-mesh when combined with colored siblings.
 */
export function mergeColoredRawMeshes(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  let hasAnyColors = false;
  for (const m of parts) {
    if (m.colors && m.colors.length > 0) {
      hasAnyColors = true;
      break;
    }
  }
  const colors: number[] | undefined = hasAnyColors ? [] : undefined;
  for (const m of parts) {
    const off = positions.length / 3;
    const vCount = Math.floor(m.positions.length / 3);
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + off);
    if (colors) {
      if (m.colors && m.colors.length >= vCount * 4) {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(m.colors[i]!);
      } else {
        for (let i = 0; i < vCount; i += 1) colors.push(1, 1, 1, 1);
      }
    }
  }
  const allAnalytic = parts.length > 0 && parts.every((m) => m.analyticNormals === true);
  return {
    positions,
    normals,
    uvs,
    indices,
    ...(colors ? { colors } : {}),
    ...(allAnalytic ? { analyticNormals: true } : {})
  };
}

/** Paints a smooth bottom-to-top linear-RGB vertex color gradient with deterministic organic variation. */
export function paintVerticalGradient(
  src: RawMesh,
  bottomHex: string,
  topHex: string,
  noiseAmp = 0.08
): RawMesh {
  const lo = hexToLinearRgb(bottomHex);
  const hi = hexToLinearRgb(topHex);
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 1; i < src.positions.length; i += 3) {
    const y = src.positions[i]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const span = Math.max(1e-4, maxY - minY);
  const vCount = Math.floor(src.positions.length / 3);
  const colors = new Array<number>(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!;
    const y = src.positions[i * 3 + 1]!;
    const z = src.positions[i * 3 + 2]!;
    const jitter = (hash01(i * 19 + Math.round((x * 13 + z * 29) * 10)) - 0.5) * noiseAmp;
    const t = Math.max(0, Math.min(1, (y - minY) / span + jitter));
    const c4 = i * 4;
    colors[c4] = lo[0] + (hi[0] - lo[0]) * t;
    colors[c4 + 1] = lo[1] + (hi[1] - lo[1]) * t;
    colors[c4 + 2] = lo[2] + (hi[2] - lo[2]) * t;
    colors[c4 + 3] = 1;
  }
  return { ...src, colors };
}

/** merge helper returning a RawMesh from multiple RawMeshes while preserving vertex colors. */
function joinRaw(parts: readonly RawMesh[]): RawMesh {
  return mergeColoredRawMeshes(parts);
}

/**
 * Curved `terimukuri` Sengoku hipped/pagoda roof (`y in [0, rise]`) built via `loftSectionsMesh`
 * with concave swooping eaves and upturned corner rafters (`sumigi`).
 */
export function curvedPagodaRoofMesh(
  width: number,
  depth: number,
  rise: number,
  flare = 0.22,
  topRatio = 0.16
): RawMesh {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const steps = 5;
  const sections: V3[][] = [];
  const corners: readonly V2[] = [
    [-1, -1], [0, -1], [1, -1], [1, 0],
    [1, 1], [0, 1], [-1, 1], [-1, 0]
  ];
  for (let s = 0; s <= steps; s += 1) {
    const t = s / steps;
    const curve = Math.pow(1 - t, 1.55);
    const scaleXZ = topRatio + (1 - topRatio) * curve;
    const yBase = Math.pow(t, 1.28) * rise;
    const ring: V3[] = corners.map(([cx, cz]) => {
      const isCorner = cx !== 0 && cz !== 0;
      const tipLift = isCorner ? Math.pow(1 - t, 2.2) * rise * flare : 0;
      const cornerOut = isCorner ? 1 + (1 - t) * flare * 0.38 : 1;
      return [cx * hw * scaleXZ * cornerOut, yBase + tipLift, cz * hd * scaleXZ * cornerOut];
    });
    sections.push(ring);
  }
  const main = loftSectionsMesh(sections, true, false);
  const ridgeLen = Math.max(0.12, (width - depth * 0.35) * topRatio * 1.9);
  const ridgeCapW = Math.max(0.08, depth * topRatio * 0.82);
  const ridge = transformMesh(bevelBoxMesh(ridgeLen, rise * 0.17, ridgeCapW, 0.015), {
    pos: [0, rise * 1.02, 0]
  });
  const endParts: RawMesh[] = [main, ridge];
  // Upturned `onigawara` / `shachihoko` ridge-end horns crowning both gable/ridge tips
  for (const sx of [-1, 1] as const) {
    endParts.push(
      transformMesh(bevelBoxMesh(rise * 0.12, rise * 0.24, ridgeCapW * 1.18, 0.012), {
        pos: [sx * ridgeLen * 0.52, rise * 1.11, 0],
        rot: [0, 0, -sx * 0.24]
      })
    );
  }
  return joinRaw(endParts);
}

/**
 * Curved gable (`kirizuma`) Sengoku machiya roof (`y in [0, rise]`) lofted along X with parabolic eaves.
 */
export function curvedGableRoofMesh(width: number, depth: number, rise: number, eaveCurve = 0.18): RawMesh {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const slices = 7;
  const sections: V3[][] = [];
  for (let i = 0; i < slices; i += 1) {
    const u = (i / (slices - 1)) * 2 - 1;
    const endLift = u * u * rise * eaveCurve;
    const x = u * hw;
    sections.push([
      [x, endLift, -hd],
      [x, rise * 0.42 + endLift * 0.7, -hd * 0.54],
      [x, rise + endLift * 0.55, 0],
      [x, rise * 0.42 + endLift * 0.7, hd * 0.54],
      [x, endLift, hd],
      [x, -rise * 0.08 + endLift, hd * 0.92],
      [x, rise * 0.72 + endLift * 0.5, 0],
      [x, -rise * 0.08 + endLift, -hd * 0.92]
    ]);
  }
  return loftSectionsMesh(sections, true, true);
}

/** Concave fan-sloped `ogi-no-kobai` Sengoku `ishigaki` castle stone rampart (`y in [0, height]`). */
export function ishigakiRampartMesh(width: number, depth: number, height: number, batter = 0.26): RawMesh {
  const hw = width * 0.5;
  const hd = depth * 0.5;
  const tiers = 5;
  const sections: V3[][] = [];
  for (let s = 0; s <= tiers; s += 1) {
    const t = s / tiers;
    // Authentic Sengoku concave parabolic wall batter: wide foot sweeping steeper toward the crest
    const k = 1 - batter * (1 - Math.pow(1 - t, 1.85));
    const y = t * height;
    sections.push([
      [-hw * k, y, -hd * k],
      [hw * k, y, -hd * k],
      [hw * k, y, hd * k],
      [-hw * k, y, hd * k]
    ]);
  }
  return loftSectionsMesh(sections, true, true);
}

/** Carved curved-eave stone `toro` lantern (`y in [0, height]`) with `curvedPagodaRoofMesh` `kasa`, `latheMesh` `hoju`, & glowing `hibukuro` firebox. */
export function carvedToroLanternSlots(opts: {
  readonly height: number;
  readonly stoneMat: number;
  readonly glowMat: number;
  readonly shojiMat?: number;
}): MultiMatSlot[] {
  const h = opts.height;
  const r = h * 0.22;
  // Carved hexagonal pedestal (`kiso`) + waisted shaft (`sao`) + lotus platform (`chudai`)
  const shaftProfile: V2[] = [
    [0, 0],
    [r * 1.04, 0],
    [r * 0.96, h * 0.08],
    [r * 0.62, h * 0.13],
    [r * 0.36, h * 0.18],
    [r * 0.31, h * 0.36],
    [r * 0.38, h * 0.40],
    [r * 0.30, h * 0.54],
    [r * 0.80, h * 0.60],
    [r * 0.90, h * 0.64],
    [0, h * 0.64]
  ];
  // Smooth `subdivideSmoothMesh` sacred flame-jewel finial (`ukebana` + `hoju`) crowning the upturned `kasa` roof
  const hojuProfile: V2[] = [
    [0, h * 0.90],
    [r * 0.36, h * 0.915],
    [r * 0.28, h * 0.955],
    [r * 0.12, h * 0.985],
    [0, h]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(shaftProfile, 6, true), materialIndex: opts.stoneMat },
    {
      mesh: transformMesh(curvedPagodaRoofMesh(r * 2.58, r * 2.58, h * 0.16, 0.34, 0.2), {
        pos: [0, h * 0.775, 0]
      }),
      materialIndex: opts.stoneMat
    },
    { mesh: subdivideSmoothMesh(latheMesh(hojuProfile, 10, false), 1, 0.52), materialIndex: opts.stoneMat }
  ];
  // Corner mullions of the `hibukuro` firebox
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.12, h * 0.16, r * 0.12, 0.005), {
        pos: [Math.cos(a) * r * 0.44, h * 0.71, Math.sin(a) * r * 0.44]
      }),
      materialIndex: opts.stoneMat
    });
  }
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(r * 0.28, 1, 0.03, 7), {
      pos: [0, h * 0.71, 0],
      scale: [1, 1.12, 1]
    }),
    materialIndex: opts.glowMat
  });
  if (opts.shojiMat !== undefined) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.68, h * 0.14, r * 0.68, 0.008), {
        pos: [0, h * 0.71, 0]
      }),
      materialIndex: opts.shojiMat
    });
  }
  return slots;
}

/** Segmented curved bamboo culm (`y in [0, height]`) swept via `tubeSweepMesh` with nodal rings. */
export function bambooStalkMesh(
  height: number,
  baseRadius: number,
  leanX: number,
  leanZ: number,
  segments = 6
): RawMesh {
  const ctrl: V3[] = [
    [0, 0, 0],
    [leanX * 0.25, height * 0.35, leanZ * 0.25],
    [leanX * 0.68, height * 0.72, leanZ * 0.68],
    [leanX, height, leanZ]
  ];
  const pts = catmullRomSpline3(ctrl, Math.max(2, Math.round(segments * 2)), false);
  const spine: V4[] = pts.map((p, idx) => {
    const t = idx / Math.max(1, pts.length - 1);
    const nodeWave = Math.pow(Math.abs(Math.sin(t * segments * Math.PI)), 10);
    const rad = baseRadius * (1 - t * 0.46) * (1 + nodeWave * 0.22);
    return [p[0], p[1], p[2], Math.max(0.008, rad)];
  });
  return tubeSweepMesh(spine, 7, false);
}

// ---------------------------------------------------------------------------
// 3. Hero Multi-Material Evening Set-Pieces (`shrineGate`, `waterWheel`, `pagoda`)
// ---------------------------------------------------------------------------

const HERO_SETPIECE_PALETTE: readonly AuraMaterialSpec[] = [
  SENGOKU_MATERIALS.vermilionLacquer,     // 0: sacred vermilion lacquer
  SENGOKU_MATERIALS.woodDarkCedar,        // 1: aged dark cedar
  SENGOKU_MATERIALS.woodMillTimber,       // 2: soaked mill timber
  SENGOKU_MATERIALS.kawaraGlazeTile,      // 3: indigo-slate kawara tile
  SENGOKU_MATERIALS.shikkuiPlaster,       // 4: white shikkui castle plaster
  SENGOKU_MATERIALS.ishigakiGranite,      // 5: carved granite & ishigaki stone
  SENGOKU_MATERIALS.mossyBasalt,          // 6: mossy river stone
  SENGOKU_MATERIALS.forgedIron,           // 7: blackened forged iron
  SENGOKU_MATERIALS.imperialGold,         // 8: gilded bronze / imperial gold
  SENGOKU_MATERIALS.lanternFlameEmissive, // 9: practical amber lantern glow
  SENGOKU_MATERIALS.shojiWashiPaper       // 10: translucent warm shoji paper
];

/**
 * Forest-clearing Myojin Shrine Torii Gate (`8.8m` tall, base at `y = 0`):
 * swept curved `kasagi` & `shimaki` lintels, tapered vermilion `hashira` columns on granite `kamebara`
 * pedestals, gilded `gakuzuka` tablet, stepped granite threshold, and flanking carved `toro` lanterns.
 */
export function buildShrineGateSetpieceNode(placement: ModelPlacement): GroupBuilder {
  const slots: MultiMatSlot[] = [];
  const pillarX = 3.25;
  const colH = 7.45;

  // Stepped granite forest shrine threshold
  slots.push({
    mesh: transformMesh(ishigakiRampartMesh(9.8, 3.1, 0.42, 0.14), { pos: [0, 0, 0] }),
    materialIndex: 5
  });

  // Twin granite `kamebara` column bases + tapered vermilion `hashira` pillars + bronze collars
  for (const sx of [-1, 1] as const) {
    const px = sx * pillarX;
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [0.68, 0], [0.64, 0.36], [0.46, 0.62], [0.42, 0.72], [0, 0.72]], 14, true),
        { pos: [px, 0.38, 0] }
      ),
      materialIndex: 5
    });
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [0.39, 0], [0.36, colH * 0.55], [0.32, colH], [0, colH]], 16),
        { pos: [px, 0.95, 0] }
      ),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, 0], [0.42, 0], [0.42, 0.24], [0, 0.24]], 16),
        { pos: [px, 1.02, 0] }
      ),
      materialIndex: 8
    });
    // Wedged `kusabi` timber keys where `nuki` pierces each pillar
    slots.push({
      mesh: transformMesh(bevelBoxMesh(1.08, 0.22, 0.48, 0.03), { pos: [px, 6.28, 0] }),
      materialIndex: 1
    });
  }

  // `Nuki` lower tie-beam + `gakuzuka` center strut & gilded calligraphy plaque
  slots.push({
    mesh: transformMesh(bevelBoxMesh(8.9, 0.38, 0.34, 0.04), { pos: [0, 6.02, 0] }),
    materialIndex: 0
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.72, 1.35, 0.26, 0.03), { pos: [0, 6.86, 0] }),
    materialIndex: 1
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(0.86, 1.18, 0.09, 0.02), { pos: [0, 6.86, 0.16] }),
    materialIndex: 8
  });

  // Braided sacred `shimenawa` straw rope slung beneath the `nuki` beam + zigzag white `shide` paper streamers
  const ropePts = catmullRomSpline3(
    [[-3.15, 5.78, 0.22], [-1.55, 5.42, 0.26], [0, 5.28, 0.28], [1.55, 5.42, 0.26], [3.15, 5.78, 0.22]],
    6,
    false
  ).map((p, idx, arr): V4 => {
    const u = Math.abs((idx / Math.max(1, arr.length - 1)) * 2 - 1);
    return [p[0], p[1], p[2], 0.13 * (1 - u * 0.45)];
  });
  slots.push({ mesh: tubeSweepMesh(ropePts, 10, true), materialIndex: 8 });
  for (const sx of [-1.8, -0.62, 0.62, 1.8]) {
    const sagY = 5.3 + Math.abs(sx) * 0.11;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.16, 0.46, 0.03, 0.006), { pos: [sx, sagY - 0.26, 0.28], rot: [0, 0, 0.18] }),
      materialIndex: 4
    });
  }

  // Swept curved `shimaki` under-lintel + kawara-capped `kasagi` top lintel (`loftSectionsMesh`)
  const lintelSlices = 9;
  const kasagiSections: V3[][] = [];
  const capSections: V3[][] = [];
  for (let i = 0; i < lintelSlices; i += 1) {
    const u = (i / (lintelSlices - 1)) * 2 - 1;
    const x = u * 5.45;
    const sweepLift = Math.pow(Math.abs(u), 2.35) * 0.78;
    const y0 = 7.55 + sweepLift;
    kasagiSections.push([
      [x, y0, -0.34],
      [x, y0 + 0.38, -0.42],
      [x, y0 + 0.38, 0.42],
      [x, y0, 0.34]
    ]);
    const cx = u * 5.68;
    const cy = 7.92 + Math.pow(Math.abs(u), 2.35) * 0.86;
    capSections.push([
      [cx, cy, -0.48],
      [cx, cy + 0.26, 0],
      [cx, cy, 0.48],
      [cx, cy - 0.06, 0]
    ]);
  }
  slots.push({ mesh: loftSectionsMesh(kasagiSections, true, false), materialIndex: 0 });
  slots.push({ mesh: loftSectionsMesh(capSections, true, false), materialIndex: 3 });

  // Flanking carved stone `toro` lanterns with warm flame + shoji screens
  for (const sx of [-1, 1] as const) {
    for (const s of carvedToroLanternSlots({ height: 2.55, stoneMat: 5, glowMat: 9, shojiMat: 10 })) {
      slots.push({
        mesh: transformMesh(s.mesh, { pos: [sx * 4.25, 0.4, 1.05] }),
        materialIndex: s.materialIndex
      });
    }
  }

  return assembleMultiMaterialNode("setpiece-shrineGate", slots, HERO_SETPIECE_PALETTE, {
    id: "setpiece-shrineGate",
    position: placement.position,
    rotation: [0, placement.yaw, 0],
    scale: placement.scale,
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
}

/** Exact outer paddle-tip radius (m) of the centered `waterWheel` rotor around `(0, 0, 0)`. */
export const WATER_WHEEL_ROTOR_RADIUS = 4.0;
export const WATER_WHEEL_HALF_WIDTH = 0.72;

/**
 * Builds the multi-material `waterWheel` rotor slots STRICTLY centered around `(0, 0, 0)` on its
 * local X spin axis (`minX = -maxX`, `minY = -maxY`, `minZ = -maxZ`) for zero-wobble concentric spin.
 */
export function buildWaterWheelRotorSlots(): MultiMatSlot[] {
  const R = WATER_WHEEL_ROTOR_RADIUS;
  const hw = WATER_WHEEL_HALF_WIDTH;
  const slots: MultiMatSlot[] = [];

  // Twin cedar outer & inner shroud rims revolved around Y then rotated onto X (`[-hw, +hw]`)
  for (const side of [-1, 1] as const) {
    const x0 = side * (hw - 0.14);
    const x1 = side * hw;
    const lo = Math.min(x0, x1);
    const hi = Math.max(x0, x1);
    const rimProfile: V2[] = [
      [R * 0.82, lo],
      [R * 0.96, lo],
      [R * 0.96, hi],
      [R * 0.82, hi],
      [R * 0.82, lo]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(rimProfile, 24, true), { rot: [0, 0, -Math.PI * 0.5] }),
      materialIndex: 2
    });
    // Forged iron tire strap around outer rim
    const strapProfile: V2[] = [
      [R * 0.955, lo + 0.02],
      [R * 0.975, lo + 0.02],
      [R * 0.975, hi - 0.02],
      [R * 0.955, hi - 0.02]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(strapProfile, 24, false), { rot: [0, 0, -Math.PI * 0.5] }),
      materialIndex: 7
    });
  }

  // 16 antipodally paired radial cedar bucket paddles (`k = 0..15`) reaching exact radius `R`
  const paddleCount = 16;
  const paddleMidR = R * 0.9;
  for (let k = 0; k < paddleCount; k += 1) {
    const ang = (k / paddleCount) * Math.PI * 2;
    const py = Math.cos(ang) * paddleMidR;
    const pz = Math.sin(ang) * paddleMidR;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(hw * 1.82, R * 0.2, 0.11, 0.015), {
        pos: [0, py, pz],
        rot: [ang, 0, 0]
      }),
      materialIndex: 2
    });
    // Bucket lip board
    const lipR = R * 0.83;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(hw * 1.76, 0.09, 0.22, 0.012), {
        pos: [0, Math.cos(ang) * lipR, Math.sin(ang) * lipR],
        rot: [ang, 0, 0]
      }),
      materialIndex: 1
    });
  }

  // 8 antipodally paired heavy cedar spokes on both `-X` and `+X` wheel faces + cross-tie rungs
  const spokeCount = 8;
  const spokeMid = R * 0.46;
  for (const side of [-1, 1] as const) {
    for (let k = 0; k < spokeCount; k += 1) {
      const ang = (k / spokeCount) * Math.PI * 2;
      slots.push({
        mesh: transformMesh(bevelBoxMesh(0.13, R * 0.78, 0.16, 0.016), {
          pos: [side * (hw - 0.08), Math.cos(ang) * spokeMid, Math.sin(ang) * spokeMid],
          rot: [ang, 0, 0]
        }),
        materialIndex: 1
      });
    }
  }
  for (let k = 0; k < spokeCount; k += 1) {
    const ang = (k / spokeCount) * Math.PI * 2 + Math.PI / spokeCount;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(hw * 1.9, 0.12, 0.12, 0.015), {
        pos: [0, Math.cos(ang) * R * 0.78, Math.sin(ang) * R * 0.78],
        rot: [ang, 0, 0]
      }),
      materialIndex: 1
    });
  }

  // Symmetric forged iron central hub + axle shaft (`x in [-1.08, +1.08]`) + bronze bearing collars
  const axleProfile: V2[] = [
    [0, -1.08],
    [0.2, -1.08],
    [0.2, -hw * 1.05],
    [0.54, -hw * 0.98],
    [0.58, 0],
    [0.54, hw * 0.98],
    [0.2, hw * 1.05],
    [0.2, 1.08],
    [0, 1.08]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(axleProfile, 16, false), { rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: 7
  });
  for (const side of [-1, 1] as const) {
    const cx = side * (hw * 0.96);
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, cx - 0.06], [0.64, cx - 0.06], [0.64, cx + 0.06], [0, cx + 0.06]], 16, true),
        { rot: [0, 0, -Math.PI * 0.5] }
      ),
      materialIndex: 8
    });
  }

  return slots;
}

export function buildWaterWheelRotorSpec(): AuraCustomGeometrySpec {
  return buildGroupedGeometrySpec(buildWaterWheelRotorSlots());
}

export function computeWaterWheelRotorBounds(): { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] } {
  const slots = buildWaterWheelRotorSlots();
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const s of slots) {
    const pos = s.mesh.positions;
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
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/**
 * Complete riverside watermill assembly: stationary stone `archwayVoussoirSlots` sluice channel &
 * timber A-frame bearings cradling the concentrically spinning `setpiece-waterWheel` rotor at `[0, 0, 0]`.
 */
export function buildWaterWheelSetpieceGroup(placement: ModelPlacement): ReturnType<typeof group> {
  const R = WATER_WHEEL_ROTOR_RADIUS;
  const hw = WATER_WHEEL_HALF_WIDTH;
  const cradleSlots: MultiMatSlot[] = [];

  // Twin cedar A-frame axle bearing trestles on mossy granite piers (`y = -R` sits on river bed)
  for (const side of [-1, 1] as const) {
    const bx = side * (hw + 0.24);
    cradleSlots.push({
      mesh: transformMesh(ishigakiRampartMesh(0.62, 3.4, 1.15, 0.16), { pos: [bx, -R - 0.25, 0] }),
      materialIndex: 6
    });
    for (const sz of [-1, 1] as const) {
      cradleSlots.push({
        mesh: transformMesh(bevelBoxMesh(0.22, R * 0.98, 0.24, 0.02), {
          pos: [bx, -R * 0.44, sz * 0.72],
          rot: [sz * 0.34, 0, 0]
        }),
        materialIndex: 1
      });
    }
    // Iron pillow-block journal bearing cradling the axle at `[bx, 0, 0]`
    cradleSlots.push({
      mesh: transformMesh(bevelBoxMesh(0.32, 0.44, 0.58, 0.03), { pos: [bx, -0.06, 0] }),
      materialIndex: 7
    });
  }

  // Mossy stone millrace sluice arch (`archwayVoussoirSlots`) feeding the wheel paddles
  for (const s of archwayVoussoirSlots({
    radius: 1.05,
    thickness: 0.42,
    depth: 0.95,
    voussoirs: 9,
    stoneMatA: 5,
    stoneMatB: 6,
    keystoneMat: 8
  })) {
    cradleSlots.push({
      mesh: transformMesh(s.mesh, { pos: [-hw - 0.85, -R + 0.55, -1.65], rot: [0, Math.PI * 0.5, 0] }),
      materialIndex: s.materialIndex
    });
  }
  // Timber flume chute delivering water onto the lower breast paddles
  cradleSlots.push({
    mesh: transformMesh(bevelBoxMesh(1.9, 0.28, 2.8, 0.02), { pos: [0, -R + 0.62, -2.55], rot: [0.16, 0, 0] }),
    materialIndex: 2
  });

  const rotorNode = assembleMultiMaterialNode("setpiece-waterWheel", buildWaterWheelRotorSlots(), HERO_SETPIECE_PALETTE, {
    id: "setpiece-waterWheel",
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
  const cradleNode = assembleMultiMaterialNode("setpiece-waterWheel-cradle", cradleSlots, HERO_SETPIECE_PALETTE, {
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });

  return group("setpiece-waterWheel-rig", [cradleNode, rotorNode], {
    position: placement.position,
    rotation: [0, placement.yaw, 0],
    scale: placement.scale
  });
}

/**
 * 5-Tier Sengoku Castle Pagoda / Gojunoto (`36m` tall, base at `y = 0`):
 * battered `ishigaki` rampart plinth, 5 diminishing `shikkui` plaster stories, dark cedar
 * `ko-ran` balconies, curved `loftSectionsMesh` `kawara` roofs, glowing shoji watch-chamber,
 * and a `latheMesh` gilded 9-ring `sorin` finial spire.
 */
export function buildPagodaSetpieceNode(placement: ModelPlacement): GroupBuilder {
  const slots: MultiMatSlot[] = [];

  // Battered `ishigaki` stone castle foundation (`0 .. 4.6m`)
  slots.push({
    mesh: ishigakiRampartMesh(14.8, 14.8, 4.6, 0.24),
    materialIndex: 5
  });
  slots.push({
    mesh: transformMesh(bevelBoxMesh(12.2, 0.42, 12.2, 0.04), { pos: [0, 4.65, 0] }),
    materialIndex: 1
  });

  // 5 diminishing stories (`4.8m .. 29.2m`)
  let yCursor = 4.82;
  for (let tier = 0; tier < 5; tier += 1) {
    const k = 1 - tier * 0.135;
    const coreW = 8.4 * k;
    const coreH = (tier === 0 ? 4.4 : 3.7) * (1 - tier * 0.04);
    const roofSpan = 13.6 * k;
    const roofRise = 2.05 * (1 - tier * 0.06);

    // White `shikkui` plaster story core + vermilion corner columns
    slots.push({
      mesh: transformMesh(bevelBoxMesh(coreW, coreH, coreW, 0.05), { pos: [0, yCursor + coreH * 0.5, 0] }),
      materialIndex: 4
    });
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        slots.push({
          mesh: transformMesh(bevelBoxMesh(0.36 * k, coreH, 0.36 * k, 0.02), {
            pos: [sx * coreW * 0.49, yCursor + coreH * 0.5, sz * coreW * 0.49]
          }),
          materialIndex: 0
        });
      }
    }

    // Cedar `ko-ran` wrap-around balcony rail on tiers 1..4
    if (tier > 0) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(coreW + 1.35 * k, 0.26, coreW + 1.35 * k, 0.02), {
          pos: [0, yCursor + 0.16, 0]
        }),
        materialIndex: 1
      });
    }

    // Warm backlit shoji lantern windows on top two stories
    if (tier >= 3) {
      slots.push({
        mesh: transformMesh(bevelBoxMesh(coreW * 0.58, coreH * 0.46, coreW + 0.12, 0.015), {
          pos: [0, yCursor + coreH * 0.52, 0]
        }),
        materialIndex: 10
      });
      slots.push({
        mesh: transformMesh(bevelBoxMesh(coreW + 0.12, coreH * 0.46, coreW * 0.58, 0.015), {
          pos: [0, yCursor + coreH * 0.52, 0]
        }),
        materialIndex: 10
      });
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(coreW * 0.24, 0, 0, 3), {
          pos: [0, yCursor + coreH * 0.52, 0]
        }),
        materialIndex: 9
      });
    }

    // Stepped `tokigumi` bracket corbel band + curved upturned `kawara` pagoda roof + gilded corner `futaku` wind-bells
    const roofY = yCursor + coreH - 0.18;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(coreW + 1.05 * k, 0.28 * k, coreW + 1.05 * k, 0.02), {
        pos: [0, roofY - 0.08, 0]
      }),
      materialIndex: 1
    });
    slots.push({
      mesh: transformMesh(curvedPagodaRoofMesh(roofSpan, roofSpan, roofRise, 0.28, 0.26), {
        pos: [0, roofY, 0]
      }),
      materialIndex: 3
    });
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        slots.push({
          mesh: transformMesh(latheMesh([[0, 0], [0.14 * k, 0.04], [0.11 * k, 0.28 * k], [0, 0.32 * k]], 8, true), {
            pos: [sx * roofSpan * 0.46, roofY + roofRise * 0.12, sz * roofSpan * 0.46]
          }),
          materialIndex: 8
        });
      }
    }
    yCursor += coreH + roofRise * 0.62;
  }

  // Gilded bronze 9-ring `sorin` finial spire (`latheMesh` reaching `y = 36.0m`)
  const spireBase = yCursor + 0.35;
  const spireH = Math.max(4.5, 36.0 - spireBase);
  const sorinProfile: V2[] = [[0, 0], [0.88, 0], [0.76, 0.45], [0.34, 0.72]];
  for (let r = 0; r < 9; r += 1) {
    const ty = 0.85 + (r / 9) * (spireH * 0.66);
    const ringR = 0.56 * (1 - r * 0.055);
    sorinProfile.push([0.16, ty - 0.06], [ringR, ty], [0.15, ty + 0.06]);
  }
  sorinProfile.push([0.12, spireH * 0.84], [0.42, spireH * 0.91], [0.06, spireH], [0, spireH]);
  slots.push({
    mesh: transformMesh(latheMesh(sorinProfile, 14, false), { pos: [0, spireBase, 0] }),
    materialIndex: 8
  });

  return assembleMultiMaterialNode("setpiece-pagoda", slots, HERO_SETPIECE_PALETTE, {
    id: "setpiece-pagoda",
    position: placement.position,
    rotation: [0, placement.yaw, 0],
    scale: placement.scale,
    castShadow: false,
    receiveShadow: true,
    coalesceColors: false
  });
}

// ---------------------------------------------------------------------------
// 4. Normalized Multi-Material District Scenery Props (`PropId` -> `instances.custom`)
// ---------------------------------------------------------------------------

export interface PropMatPart {
  readonly mat: InstMatKey;
  readonly mesh: RawMesh;
  readonly tintable?: boolean;
}

/**
 * Rigidly normalizes all material sub-parts of a procedural prop to exact `targetSize` (`[wx, wy, wz]`)
 * so every joint/eave stays aligned while matching `MESHY_MANIFEST[id].size` and `cameraGap` clearances.
 * - `"ground"`: base anchored slightly into terrain (`y in [-0.05*wy, +0.95*wy]`) so sloped streets never float.
 * - `"center"`: centered vertically (`y in [-0.5*wy, +0.5*wy]`) for rock/cliff landforms (`fallsCliff`).
 */
function normalizePropParts(
  parts: readonly PropMatPart[],
  targetSize: V3,
  anchor: "ground" | "center"
): PropMatPart[] {
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of parts) {
    const pos = p.mesh.positions;
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
  const sx = targetSize[0] / Math.max(1e-4, maxX - minX);
  const sy = targetSize[1] / Math.max(1e-4, maxY - minY);
  const sz = targetSize[2] / Math.max(1e-4, maxZ - minZ);
  const cx = (minX + maxX) * 0.5;
  const cz = (minZ + maxZ) * 0.5;
  const yTargetMin = anchor === "ground" ? -0.05 * targetSize[1] : -0.5 * targetSize[1];

  return parts.map((p) => {
    const shifted = transformMesh(p.mesh, { pos: [-cx, -minY, -cz] });
    const scaled = transformMesh(shifted, { scale: [sx, sy, sz], pos: [0, yTargetMin, 0] });
    return { mat: p.mat, mesh: scaled, tintable: p.tintable };
  });
}

function buildMachiyaHouseParts(variant: "A" | "B" | "C" | "D"): PropMatPart[] {
  const parts: PropMatPart[] = [];
  if (variant === "A") {
    // 2-story half-timbered machiya townhouse: stone plinth, cream plaster, exposed cedar beams, crimson noren & curved gable roof
    parts.push({ mat: "ishigakiStone", mesh: paintVerticalGradient(ishigakiRampartMesh(2.0, 1.08, 0.28, 0.12), "#6b665d", "#9e9688", 0.08) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.86, 1.08, 0.94, 0.02), { pos: [0, 0.78, 0] }), tintable: true });
    const beams: RawMesh[] = [
      transformMesh(bevelBoxMesh(1.94, 0.09, 1.04, 0.01), { pos: [0, 0.72, 0] }),
      transformMesh(bevelBoxMesh(1.94, 0.08, 1.02, 0.01), { pos: [0, 1.24, 0] }),
      transformMesh(bevelBoxMesh(1.9, 0.46, 0.98, 0.015), { pos: [0, 0.46, 0] })
    ];
    for (const sx of [-0.91, -0.32, 0.32, 0.91]) {
      beams.push(transformMesh(bevelBoxMesh(0.075, 1.08, 0.99, 0.008), { pos: [sx, 0.78, 0] }));
    }
    parts.push({ mat: "cedarWood", mesh: joinRaw(beams) });
    parts.push({ mat: "vermilion", mesh: transformMesh(bevelBoxMesh(0.92, 0.22, 0.06, 0.008), { pos: [0, 0.56, 0.51] }) });
    parts.push({ mat: "warmLanternCore", mesh: joinRaw([
      transformMesh(bevelBoxMesh(0.46, 0.34, 1.01, 0.01), { pos: [-0.46, 0.99, 0] }),
      transformMesh(bevelBoxMesh(0.46, 0.34, 1.01, 0.01), { pos: [0.46, 0.99, 0] })
    ]) });
    parts.push({ mat: "kawaraRoof", mesh: joinRaw([
      transformMesh(curvedGableRoofMesh(2.14, 1.24, 0.46, 0.22), { pos: [0, 1.26, 0] }),
      transformMesh(curvedPagodaRoofMesh(2.04, 0.42, 0.14, 0.14, 0.6), { pos: [0, 0.68, 0.38] })
    ]) });
  } else if (variant === "B") {
    // Tall narrow corner merchant house with wrap veranda, warm terracotta-vermilion upper roof & timber shutters
    parts.push({ mat: "ishigakiStone", mesh: paintVerticalGradient(ishigakiRampartMesh(0.98, 1.24, 0.32, 0.12), "#69645b", "#9b9385", 0.08) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(0.88, 1.38, 1.12, 0.02), { pos: [0, 0.96, 0] }), tintable: true });
    const beams: RawMesh[] = [
      transformMesh(bevelBoxMesh(1.02, 0.12, 1.28, 0.012), { pos: [0, 0.92, 0] }),
      transformMesh(bevelBoxMesh(0.94, 0.48, 1.18, 0.012), { pos: [0, 0.52, 0] })
    ];
    for (const sx of [-0.43, 0.43]) {
      for (const sz of [-0.55, 0.55]) {
        beams.push(transformMesh(bevelBoxMesh(0.07, 1.38, 0.07, 0.008), { pos: [sx, 0.96, sz] }));
      }
    }
    parts.push({ mat: "cedarWood", mesh: joinRaw(beams) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.48, 0.42, 1.17, 0.01), { pos: [0, 1.24, 0] }) });
    parts.push({ mat: "vermilion", mesh: transformMesh(curvedPagodaRoofMesh(1.16, 1.46, 0.52, 0.24, 0.24), { pos: [0, 1.6, 0] }) });
    parts.push({ mat: "kawaraRoof", mesh: transformMesh(bevelBoxMesh(0.16, 0.12, 0.68, 0.012), { pos: [0, 2.1, 0] }) });
  } else if (variant === "C") {
    // Stepped Sengoku castle-town `kura` storehouse keep with battered stone rampart, timber bands, twin tiered roofs & gold crest
    parts.push({ mat: "ishigakiStone", mesh: paintVerticalGradient(ishigakiRampartMesh(1.96, 1.42, 0.44, 0.2), "#635f58", "#9e988c", 0.09) });
    parts.push({ mat: "shikkuiWall", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.74, 0.78, 1.22, 0.025), { pos: [0, 0.78, 0] }),
      transformMesh(bevelBoxMesh(1.28, 0.58, 0.92, 0.02), { pos: [0, 1.42, 0] })
    ]), tintable: true });
    parts.push({ mat: "cedarWood", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.8, 0.09, 1.28, 0.01), { pos: [0, 0.44, 0] }),
      transformMesh(bevelBoxMesh(1.34, 0.08, 0.98, 0.01), { pos: [0, 1.18, 0] })
    ]) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.46, 0.28, 0.96, 0.01), { pos: [0, 1.44, 0] }) });
    parts.push({ mat: "kawaraRoof", mesh: joinRaw([
      transformMesh(curvedPagodaRoofMesh(2.08, 1.54, 0.32, 0.2, 0.58), { pos: [0, 1.1, 0] }),
      transformMesh(curvedPagodaRoofMesh(1.62, 1.22, 0.44, 0.26, 0.22), { pos: [0, 1.68, 0] })
    ]) });
    parts.push({ mat: "goldTrim", mesh: transformMesh(bevelBoxMesh(0.44, 0.14, 0.1, 0.015), { pos: [0, 2.12, 0] }) });
  } else {
    // Compact Sengoku turret tenshu (`houseD`) with vermilion balcony rail, dark timber framing & dormer gable
    parts.push({ mat: "ishigakiStone", mesh: paintVerticalGradient(ishigakiRampartMesh(1.2, 0.82, 0.44, 0.22), "#66625a", "#9c9589", 0.08) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.02, 1.12, 0.68, 0.02), { pos: [0, 0.98, 0] }), tintable: true });
    parts.push({ mat: "cedarWood", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.06, 0.08, 0.72, 0.01), { pos: [0, 0.62, 0] }),
      transformMesh(bevelBoxMesh(0.07, 1.12, 0.72, 0.008), { pos: [-0.48, 0.98, 0] }),
      transformMesh(bevelBoxMesh(0.07, 1.12, 0.72, 0.008), { pos: [0.48, 0.98, 0] })
    ]) });
    parts.push({ mat: "vermilion", mesh: transformMesh(bevelBoxMesh(1.14, 0.12, 0.8, 0.012), { pos: [0, 1.02, 0] }) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.42, 0.32, 0.73, 0.01), { pos: [0, 1.26, 0] }) });
    parts.push({ mat: "kawaraRoof", mesh: joinRaw([
      transformMesh(curvedPagodaRoofMesh(1.34, 0.96, 0.48, 0.25, 0.22), { pos: [0, 1.5, 0] }),
      transformMesh(curvedGableRoofMesh(0.58, 0.68, 0.24, 0.18), { pos: [0, 1.62, 0.16] })
    ]) });
  }
  return parts;
}

function buildDistrictPropRawParts(id: PropId): { readonly anchor: "ground" | "center"; readonly parts: PropMatPart[] } {
  switch (id) {
    case "houseA": return { anchor: "ground", parts: buildMachiyaHouseParts("A") };
    case "houseB": return { anchor: "ground", parts: buildMachiyaHouseParts("B") };
    case "houseC": return { anchor: "ground", parts: buildMachiyaHouseParts("C") };
    case "houseD": return { anchor: "ground", parts: buildMachiyaHouseParts("D") };
    case "teahouse": {
      const parts: PropMatPart[] = [
        { mat: "ishigakiStone", mesh: paintVerticalGradient(ishigakiRampartMesh(1.94, 1.68, 0.24, 0.1), "#67635b", "#999387", 0.08) },
        { mat: "cedarWood", mesh: joinRaw([
          transformMesh(bevelBoxMesh(1.88, 0.1, 1.62, 0.012), { pos: [0, 0.24, 0] }),
          transformMesh(bevelBoxMesh(1.52, 0.88, 1.24, 0.02), { pos: [0, 0.72, -0.1] }),
          transformMesh(bevelBoxMesh(0.08, 0.88, 0.08, 0.01), { pos: [-0.82, 0.68, 0.62] }),
          transformMesh(bevelBoxMesh(0.08, 0.88, 0.08, 0.01), { pos: [0.82, 0.68, 0.62] })
        ]) },
        { mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.44, 0.82, 1.16, 0.015), { pos: [0, 0.72, -0.1] }), tintable: true },
        { mat: "vermilion", mesh: transformMesh(bevelBoxMesh(1.48, 0.36, 0.07, 0.01), { pos: [0, 0.88, 0.62] }) },
        { mat: "warmLanternCore", mesh: joinRaw([
          transformMesh(icosphereFacetMesh(0.13, 0, 0, 5), { pos: [-0.52, 0.78, 0.68] }),
          transformMesh(icosphereFacetMesh(0.13, 0, 0, 9), { pos: [0.52, 0.78, 0.68] }),
          transformMesh(bevelBoxMesh(0.68, 0.46, 1.28, 0.01), { pos: [0, 0.68, -0.1] })
        ]) },
        { mat: "kawaraRoof", mesh: joinRaw([
          transformMesh(curvedPagodaRoofMesh(2.08, 1.82, 0.48, 0.24, 0.26), { pos: [0, 1.14, 0] }),
          transformMesh(curvedPagodaRoofMesh(1.18, 1.02, 0.32, 0.22, 0.2), { pos: [0, 1.52, -0.06] })
        ]) },
        { mat: "goldTrim", mesh: transformMesh(latheMesh([[0, 0], [0.09, 0], [0.03, 0.2], [0, 0.2]], 8, false), { pos: [0, 1.82, -0.06] }) }
      ];
      return { anchor: "ground", parts };
    }
    case "marketStall": {
      const posts: RawMesh[] = [];
      for (const sx of [-0.82, 0.82]) {
        for (const sz of [-0.46, 0.46]) {
          posts.push(transformMesh(bevelBoxMesh(0.075, 1.08, 0.075, 0.008), { pos: [sx, 0.56, sz] }));
        }
      }
      posts.push(transformMesh(bevelBoxMesh(1.74, 0.46, 0.92, 0.015), { pos: [0, 0.26, 0] }));
      // Striped teal-jade & cream canvas awning + colorful produce crates & ceramic jars
      const awningStripes: RawMesh[] = [
        paintMeshColors(transformMesh(curvedGableRoofMesh(1.92, 1.2, 0.32, 0.14), { pos: [0, 1.04, 0] }), "#1b6e68")
      ];
      for (const sx of [-0.62, -0.2, 0.2, 0.62]) {
        awningStripes.push(
          paintMeshColors(transformMesh(bevelBoxMesh(0.21, 0.31, 1.22, 0.008), { pos: [sx, 1.16, 0] }), "#f7eed7")
        );
      }
      const wares = joinRaw([
        paintMeshColors(transformMesh(latheMesh([[0, 0], [0.12, 0], [0.16, 0.12], [0.11, 0.24], [0, 0.24]], 8, true), { pos: [-0.52, 0.49, 0.1] }), "#d8c9ae"),
        paintMeshColors(transformMesh(latheMesh([[0, 0], [0.13, 0], [0.17, 0.14], [0.1, 0.26], [0, 0.26]], 8, true), { pos: [0.48, 0.49, -0.08] }), "#2b6b78"),
        paintMeshColors(transformMesh(icosphereFacetMesh(0.14, 0, 0, 3), { pos: [-0.14, 0.55, 0.16], scale: [1.3, 0.65, 1.0] }), "#d92920"),
        paintMeshColors(transformMesh(icosphereFacetMesh(0.14, 0, 0, 7), { pos: [0.18, 0.55, 0.16], scale: [1.3, 0.65, 1.0] }), "#f2851d")
      ]);
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: joinRaw(posts) },
          { mat: "clothCanopy", mesh: joinRaw(awningStripes), tintable: true },
          { mat: "shikkuiWall", mesh: wares },
          { mat: "warmLanternCore", mesh: transformMesh(icosphereFacetMesh(0.1, 0, 0, 2), { pos: [0.76, 0.88, 0.46] }) }
        ]
      };
    }
    case "tower": {
      // Round / polygonal ashlar masonry watchtower with slate-indigo conical tiled cap (inspired by village stone towers)
      const stoneDrum = paintVerticalGradient(
        latheMesh([[0, 0], [0.84, 0], [0.78, 0.38], [0.74, 1.38], [0.77, 1.46], [0, 1.46]], 14, true),
        "#82796c",
        "#c2b8a6",
        0.12
      );
      const timberGallery = joinRaw([
        transformMesh(latheMesh([[0, 0], [0.81, 0], [0.81, 0.11], [0, 0.11]], 14, true), { pos: [0, 1.36, 0] }),
        transformMesh(bevelBoxMesh(0.32, 0.46, 1.54, 0.012), { pos: [0, 0.92, 0] }),
        transformMesh(bevelBoxMesh(1.54, 0.46, 0.32, 0.012), { pos: [0, 0.92, 0] })
      ]);
      const conicalCap = joinRaw([
        transformMesh(latheMesh([[0, 0], [0.96, 0], [0.72, 0.24], [0.38, 0.54], [0.06, 0.78], [0, 0.8]], 14, true), { pos: [0, 1.42, 0] }),
        transformMesh(curvedPagodaRoofMesh(1.66, 1.66, 0.24, 0.2, 0.62), { pos: [0, 1.38, 0] })
      ]);
      return {
        anchor: "ground",
        parts: [
          { mat: "ishigakiStone", mesh: stoneDrum, tintable: true },
          { mat: "cedarWood", mesh: timberGallery },
          { mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.24, 0.34, 1.56, 0.008), { pos: [0, 0.94, 0] }) },
          { mat: "kawaraRoof", mesh: conicalCap },
          { mat: "goldTrim", mesh: transformMesh(latheMesh([[0, 0], [0.09, 0], [0.03, 0.24], [0, 0.24]], 10, false), { pos: [0, 2.18, 0] }) }
        ]
      };
    }
    case "gate": {
      const colL = transformMesh(latheMesh([[0, 0], [0.145, 0], [0.12, 1.56], [0, 1.56]], 12), { pos: [-0.68, 0.12, 0] });
      const colR = transformMesh(latheMesh([[0, 0], [0.145, 0], [0.12, 1.56], [0, 1.56]], 12), { pos: [0.68, 0.12, 0] });
      const braceL = transformMesh(bevelBoxMesh(0.32, 0.08, 0.1, 0.01), { pos: [-0.52, 1.44, 0], rot: [0, 0, 0.52] });
      const braceR = transformMesh(bevelBoxMesh(0.32, 0.08, 0.1, 0.01), { pos: [0.52, 1.44, 0], rot: [0, 0, -0.52] });
      const daiwaL = transformMesh(latheMesh([[0, 0], [0.17, 0], [0.17, 0.09], [0, 0.09]], 12), { pos: [-0.68, 1.56, 0] });
      const daiwaR = transformMesh(latheMesh([[0, 0], [0.17, 0], [0.17, 0.09], [0, 0.09]], 12), { pos: [0.68, 1.56, 0] });
      const nuki = transformMesh(bevelBoxMesh(1.82, 0.12, 0.15, 0.014), { pos: [0, 1.34, 0] });
      const gakuzuka = transformMesh(bevelBoxMesh(0.18, 0.26, 0.12, 0.012), { pos: [0, 1.48, 0] });
      const shimaki = transformMesh(curvedGableRoofMesh(1.9, 0.28, 0.14, 0.28), { pos: [0, 1.55, 0] });
      const kasagi = transformMesh(curvedPagodaRoofMesh(1.98, 0.78, 0.29, 0.34, 0.72), { pos: [0, 1.63, 0] });
      const shimenawaPts = catmullRomSpline3([[-0.64, 1.28, 0.09], [0, 1.18, 0.11], [0.64, 1.28, 0.09]], 5, false).map(
        (p, idx, arr): V4 => [p[0], p[1], p[2], 0.045 * (1 - Math.abs((idx / Math.max(1, arr.length - 1)) * 2 - 1) * 0.42)]
      );
      const shide: RawMesh[] = [];
      for (const sx of [-0.36, -0.12, 0.12, 0.36]) {
        shide.push(transformMesh(bevelBoxMesh(0.055, 0.14, 0.018, 0.004), { pos: [sx, 1.15, 0.11], rot: [0, 0, 0.2] }));
      }
      return {
        anchor: "ground",
        parts: [
          { mat: "ishigakiStone", mesh: joinRaw([
            transformMesh(latheMesh([[0, 0], [0.23, 0], [0.18, 0.16], [0, 0.16]], 10, true), { pos: [-0.68, 0, 0] }),
            transformMesh(latheMesh([[0, 0], [0.23, 0], [0.18, 0.16], [0, 0.16]], 10, true), { pos: [0.68, 0, 0] })
          ]) },
          { mat: "vermilion", mesh: joinRaw([colL, colR, braceL, braceR, nuki, gakuzuka, shimaki]), tintable: true },
          { mat: "kawaraRoof", mesh: joinRaw([kasagi, daiwaL, daiwaR]) },
          { mat: "shikkuiWall", mesh: joinRaw(shide) },
          { mat: "goldTrim", mesh: joinRaw([
            transformMesh(bevelBoxMesh(0.24, 0.28, 0.09, 0.01), { pos: [0, 1.5, 0] }),
            tubeSweepMesh(shimenawaPts, 8, true)
          ]) },
          { mat: "warmLanternCore", mesh: joinRaw([
            transformMesh(icosphereFacetMesh(0.09, 0, 0, 4), { pos: [-0.46, 1.2, 0.14] }),
            transformMesh(icosphereFacetMesh(0.09, 0, 0, 8), { pos: [0.46, 1.2, 0.14] })
          ]) }
        ]
      };
    }
    case "lantern": {
      // Redwood & stone Sengoku street lantern with carved mossy base, upturned roof & warm amber lantern chamber
      const slots = carvedToroLanternSlots({ height: 1.9, stoneMat: 0, glowMat: 1 });
      const stoneRaw = paintVerticalGradient(
        joinRaw(slots.filter((s) => s.materialIndex === 0).map((s) => s.mesh)),
        "#5b6356",
        "#949086",
        0.08
      );
      const glowRaw = joinRaw(slots.filter((s) => s.materialIndex === 1).map((s) => s.mesh));
      return {
        anchor: "ground",
        parts: [
          { mat: "ishigakiStone", mesh: stoneRaw, tintable: true },
          { mat: "warmLanternCore", mesh: glowRaw }
        ]
      };
    }
    case "fenceRail": {
      const rails: RawMesh[] = [
        bambooStalkMesh(0.66, 0.045, 0, 0, 3),
        transformMesh(bambooStalkMesh(0.66, 0.045, 0, 0, 3), { pos: [-0.88, 0, 0] }),
        transformMesh(bambooStalkMesh(0.66, 0.045, 0, 0, 3), { pos: [0.88, 0, 0] }),
        tubeSweepMesh([[-0.94, 0.52, 0, 0.036], [0, 0.53, 0, 0.036], [0.94, 0.52, 0, 0.036]], 6, false),
        tubeSweepMesh([[-0.94, 0.26, 0, 0.032], [0, 0.27, 0, 0.032], [0.94, 0.26, 0, 0.032]], 6, false)
      ];
      const knots: RawMesh[] = [];
      for (const x of [-0.88, 0, 0.88]) {
        for (const y of [0.26, 0.52]) {
          knots.push(transformMesh(bevelBoxMesh(0.1, 0.09, 0.11, 0.01), { pos: [x, y, 0] }));
        }
      }
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: paintVerticalGradient(joinRaw(rails), "#593822", "#875c3c", 0.08), tintable: true },
          { mat: "cedarWood", mesh: joinRaw(knots) }
        ]
      };
    }
    case "pine": {
      const trunk = paintVerticalGradient(tubeSweepMesh([
        [0, 0, 0, 0.085],
        [0.05, 0.42, 0.02, 0.068],
        [-0.04, 0.88, -0.02, 0.05],
        [0.02, 1.38, 0.01, 0.028]
      ], 7, true), "#381f12", "#5e3620", 0.08);
      const boughs = paintVerticalGradient(
        transformMesh(coniferBoughTierMesh({ baseRadius: 0.48, height: 1.48, tiers: 5, seed: 29 }), {
          pos: [0, 0.38, 0]
        }),
        "#184723",
        "#3c8744",
        0.12
      );
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: trunk },
          { mat: "pineFoliage", mesh: boughs, tintable: true }
        ]
      };
    }
    case "oak": {
      const trunk = paintVerticalGradient(joinRaw([
        tubeSweepMesh([[0, 0, 0, 0.12], [0.04, 0.38, -0.02, 0.085], [-0.03, 0.78, 0.03, 0.055]], 8, false),
        tubeSweepMesh([[0.02, 0.55, 0, 0.05], [0.24, 0.94, 0.13, 0.028]], 7, false),
        tubeSweepMesh([[-0.02, 0.58, 0, 0.048], [-0.22, 0.98, -0.11, 0.026]], 7, false)
      ]), "#361d10", "#613922", 0.08);
      // Shaded-to-sunlit neutral canopy gradient so sakura/maple/emerald instance tints gain deep 3D volume!
      const crown = paintVerticalGradient(joinRaw([
        transformMesh(layeredCanopyMesh({ radius: 0.62, height: 1.12, puffs: 12, seed: 17 }), {
          pos: [0, 0.66, 0]
        }),
        transformMesh(layeredCanopyMesh({ radius: 0.38, height: 0.62, puffs: 8, seed: 43 }), {
          pos: [0.22, 0.84, 0.12]
        }),
        transformMesh(layeredCanopyMesh({ radius: 0.36, height: 0.58, puffs: 8, seed: 67 }), {
          pos: [-0.2, 0.88, -0.1]
        })
      ]), "#b8aebf", "#ffffff", 0.12);
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: trunk },
          { mat: "sakuraFoliage", mesh: crown, tintable: true }
        ]
      };
    }
    case "bush": {
      const shrub = paintVerticalGradient(
        layeredCanopyMesh({ radius: 0.84, height: 1.36, puffs: 9, seed: 41 }),
        "#1b5225",
        "#4ca644",
        0.14
      );
      const buds: RawMesh[] = [];
      const budCoords: readonly [number, number, number, string][] = [
        [0.32, 0.96, 0.34, "#ff75a0"],
        [-0.36, 0.88, 0.28, "#ff9b54"],
        [0.12, 1.14, -0.22, "#ff75a0"],
        [-0.18, 1.06, -0.34, "#ffb3cf"]
      ];
      for (let i = 0; i < budCoords.length; i += 1) {
        const [bx, by, bz, hex] = budCoords[i]!;
        buds.push(paintMeshColors(transformMesh(icosphereFacetMesh(0.085, 0, 0, 19 + i), { pos: [bx, by, bz] }), hex));
      }
      return {
        anchor: "ground",
        parts: [{ mat: "pineFoliage", mesh: joinRaw([shrub, ...buds]), tintable: true }]
      };
    }
    case "boulder": {
      return {
        anchor: "center",
        parts: [
          { mat: "ishigakiStone", mesh: paintVerticalGradient(icosphereFacetMesh(0.92, 1, 0.24, 13), "#5c5850", "#9c968a", 0.1), tintable: true },
          { mat: "mossStone", mesh: paintVerticalGradient(transformMesh(icosphereFacetMesh(0.68, 1, 0.18, 31), { pos: [0.12, 0.26, 0.08], scale: [1.1, 0.55, 1.05] }), "#2f5732", "#558a48", 0.1) }
        ]
      };
    }
    case "cliffA": {
      return {
        anchor: "center",
        parts: [{
          mat: "ishigakiStone",
          mesh: paintVerticalGradient(stratifiedCliffMesh({ radiusX: 0.52, radiusZ: 0.62, height: 1.9, terraces: 5, seed: 23 }), "#544e46", "#9c9282", 0.12),
          tintable: true
        }]
      };
    }
    case "cliffB": {
      return {
        anchor: "center",
        parts: [
          {
            mat: "ishigakiStone",
            mesh: paintVerticalGradient(stratifiedCliffMesh({ radiusX: 0.88, radiusZ: 0.94, height: 1.4, terraces: 4, seed: 53 }), "#575047", "#9e9484", 0.12),
            tintable: true
          },
          {
            mat: "mossStone",
            mesh: paintVerticalGradient(transformMesh(icosphereFacetMesh(0.58, 1, 0.16, 61), { pos: [0, 1.22, 0], scale: [1.2, 0.36, 1.2] }), "#2c5730", "#528c46", 0.1)
          }
        ]
      };
    }
    case "ridge": {
      return {
        anchor: "center",
        parts: [{
          mat: "mossStone",
          mesh: paintVerticalGradient(stratifiedCliffMesh({ radiusX: 0.86, radiusZ: 0.94, height: 0.35, terraces: 3, seed: 79 }), "#395c48", "#6b9970", 0.1),
          tintable: true
        }]
      };
    }
  }
}

const PROP_PART_CACHE = new Map<PropId, readonly PropMatPart[]>();

export function getNormalizedPropParts(id: PropId): readonly PropMatPart[] {
  let cached = PROP_PART_CACHE.get(id);
  if (!cached) {
    const raw = buildDistrictPropRawParts(id);
    const sz = MESHY_MANIFEST[id].size;
    cached = normalizePropParts(raw.parts, [sz[0], sz[1], sz[2]], raw.anchor);
    PROP_PART_CACHE.set(id, cached);
  }
  return cached;
}

function buildBambooGroveParts(): readonly PropMatPart[] {
  const culms: RawMesh[] = [];
  const leaves: RawMesh[] = [];
  const offsets: readonly [number, number, number, number, number][] = [
    [0, 0, 1.0, 0.08, 0.04],
    [-0.28, 0.18, 0.88, -0.14, 0.09],
    [0.26, -0.16, 0.94, 0.12, -0.08],
    [-0.14, -0.26, 0.78, -0.09, -0.12],
    [0.2, 0.24, 0.82, 0.14, 0.1]
  ];
  for (let i = 0; i < offsets.length; i += 1) {
    const [ox, oz, hk, lx, lz] = offsets[i]!;
    culms.push(transformMesh(bambooStalkMesh(3.6 * hk, 0.065, lx, lz, 7), { pos: [ox, 0, oz] }));
    leaves.push(transformMesh(layeredCanopyMesh({ radius: 0.42, height: 0.75, puffs: 6, seed: 91 + i * 7 }), {
      pos: [ox + lx * 0.85, 2.75 * hk, oz + lz * 0.85],
      scale: [1.15, 0.68, 1.15]
    }));
  }
  return [
    { mat: "bambooCulm", mesh: paintVerticalGradient(joinRaw(culms), "#2c6b31", "#5bb34b", 0.08), tintable: true },
    { mat: "pineFoliage", mesh: paintVerticalGradient(joinRaw(leaves), "#1d5728", "#459c44", 0.14), tintable: true }
  ];
}

function buildStoneBridgeArchParts(): readonly PropMatPart[] {
  const voussoirs = archwayVoussoirSlots({
    radius: 2.6,
    thickness: 0.65,
    depth: 1.6,
    voussoirs: 11,
    stoneMatA: 0,
    stoneMatB: 1,
    keystoneMat: 2
  });
  const stoneA = joinRaw(voussoirs.filter((v) => v.materialIndex === 0).map((v) => v.mesh));
  const stoneB = joinRaw(voussoirs.filter((v) => v.materialIndex === 1).map((v) => v.mesh));
  const key = joinRaw(voussoirs.filter((v) => v.materialIndex === 2).map((v) => v.mesh));
  const spandrels = joinRaw([
    transformMesh(ishigakiRampartMesh(1.4, 1.55, 2.9, 0.14), { pos: [-3.3, 0, 0] }),
    transformMesh(ishigakiRampartMesh(1.4, 1.55, 2.9, 0.14), { pos: [3.3, 0, 0] })
  ]);
  return [
    { mat: "ishigakiStone", mesh: joinRaw([stoneA, spandrels]) },
    { mat: "mossStone", mesh: stoneB },
    { mat: "goldTrim", mesh: key }
  ];
}

function buildRooftopToroLanternParts(): readonly PropMatPart[] {
  const slots = carvedToroLanternSlots({ height: 1.78, stoneMat: 0, glowMat: 1 });
  return [
    { mat: "ishigakiStone", mesh: joinRaw(slots.filter((s) => s.materialIndex === 0).map((s) => s.mesh)), tintable: true },
    { mat: "warmLanternCore", mesh: joinRaw(slots.filter((s) => s.materialIndex === 1).map((s) => s.mesh)) }
  ];
}

/**
 * Outer-rooftop vermilion `ko-ran` shrine railing (`5.8m` span along local Z, height `0.94m`):
 * lacquered vermilion `giboshi` posts with gilded bronze onion finials + twin horizontal rails,
 * strictly open above `0.94m` with zero overhead crossbars blocking forward sightlines.
 */
function buildVermilionShrineRailingParts(): readonly PropMatPart[] {
  const vermilionParts: RawMesh[] = [
    // Upper gently cambered `hoko` handrail + middle `hirageta` rail
    tubeSweepMesh([[0, 0.78, -2.92, 0.046], [0, 0.81, 0, 0.048], [0, 0.78, 2.92, 0.046]], 8, false),
    transformMesh(bevelBoxMesh(0.065, 0.065, 5.76, 0.01), { pos: [0, 0.44, 0] }),
    transformMesh(bevelBoxMesh(0.08, 0.06, 5.76, 0.01), { pos: [0, 0.14, 0] })
  ];
  const goldFinials: RawMesh[] = [];
  const stonePlinths: RawMesh[] = [];
  for (const z of [-2.75, 0, 2.75]) {
    vermilionParts.push(transformMesh(bevelBoxMesh(0.11, 0.82, 0.11, 0.014), { pos: [0, 0.43, z] }));
    goldFinials.push(transformMesh(
      latheMesh([[0, 0], [0.068, 0], [0.072, 0.035], [0.055, 0.085], [0.064, 0.125], [0.018, 0.18], [0, 0.19]], 10, false),
      { pos: [0, 0.83, z] }
    ));
    stonePlinths.push(transformMesh(bevelBoxMesh(0.18, 0.08, 0.18, 0.012), { pos: [0, 0.04, z] }));
  }
  return [
    { mat: "vermilion", mesh: joinRaw(vermilionParts) },
    { mat: "goldTrim", mesh: joinRaw(goldFinials) },
    { mat: "ishigakiStone", mesh: joinRaw(stonePlinths) }
  ];
}

/** Batched glazed `kawara` eave ridge tile course (`5.9m` along local Z) with round `tomoe-gawara` end-caps. */
function buildRooftopRidgeTileParts(): readonly PropMatPart[] {
  const tiles: RawMesh[] = [
    transformMesh(
      curvedGableRoofMesh(0.62, 5.92, 0.24, 0.06),
      { pos: [0, 0.08, 0] }
    )
  ];
  for (let z = -2.6; z <= 2.61; z += 0.65) {
    tiles.push(transformMesh(
      latheMesh([[0, -0.09], [0.085, -0.09], [0.085, 0.09], [0, 0.09]], 8, false),
      { pos: [0, 0.22, z], rot: [0, 0, Math.PI * 0.5] }
    ));
  }
  return [
    { mat: "kawaraRoof", mesh: joinRaw(tiles) },
    { mat: "cedarWood", mesh: transformMesh(bevelBoxMesh(0.46, 0.14, 5.9, 0.014), { pos: [0, 0.04, 0] }) }
  ];
}

const INST_MAT_HEX: Readonly<Record<InstMatKey, string>> = {
  kawaraRoof: "#1f293d",
  shikkuiWall: "#f3e9d7",
  cedarWood: "#4a2816",
  vermilion: "#c9261e",
  ishigakiStone: "#948e82",
  mossStone: "#4b6b47",
  bambooCulm: "#3f873c",
  pineFoliage: "#256332",
  sakuraFoliage: "#fff7fa",
  clothCanopy: "#cc3324",
  goldTrim: "#e8b43c",
  warmLanternCore: "#ffe8b0"
};

const INST_GLAZED_VCOLOR = unnamed(material.pbr({
  color: "#ffffff",
  roughness: 0.28,
  metallic: 0.14,
  clearcoat: 0,
  sheen: 0
}));

const INST_DIELECTRIC_VCOLOR = unnamed(material.pbr({
  color: "#ffffff",
  roughness: 0.68,
  metallic: 0.02,
  clearcoat: 0,
  sheen: 0
}));

const SHADOW_PROP_IDS: ReadonlySet<PropId> = new Set([
  "houseA", "houseB", "houseC", "houseD",
  "teahouse", "tower", "gate", "pine", "oak"
]);

/**
 * Emits instancing-safe (`clearcoat: 0, sheen: 0`) procedural multi-material district prop batches
 * preserving `COLOR_0` vertex colors + cavity AO into glazed/matte/gold/glow PBR groups per prop, with
 * `castShadow: false` on lanterns, bamboo groves, fences, bushes, distant rocks/ridges, and rooftop accents.
 */
export function buildProceduralDistrictBatches(
  modelSink: ModelSink,
  accents: CourseAccents | null,
  options: { readonly castShadow: boolean }
): InstancedPrimitiveBuilder[] {
  const nodes: InstancedPrimitiveBuilder[] = [];

  const colorPart = (p: PropMatPart): RawMesh =>
    p.mesh.colors && p.mesh.colors.length > 0 ? p.mesh : paintMeshColors(p.mesh, INST_MAT_HEX[p.mat]);

  const emitParts = (
    prefix: string,
    parts: readonly PropMatPart[],
    list: readonly ModelPlacement[],
    castShadow: boolean
  ): void => {
    if (list.length === 0) return;
    const transforms: AuraTransformSpec[] = list.map((p) => ({
      position: p.position,
      rotation: [0, p.yaw, 0],
      scale: p.scale
    }));
    const hasTint = list.some((p) => p.tint !== undefined);
    const colors = hasTint ? list.map((p) => p.tint ?? "#ffffff") : undefined;

    const untintedGlazed: PropMatPart[] = [];
    const untintedDielectric: PropMatPart[] = [];
    const tintedDielectric: PropMatPart[] = [];
    const goldParts: PropMatPart[] = [];
    const glowParts: PropMatPart[] = [];

    for (const part of parts) {
      if (part.mat === "warmLanternCore") glowParts.push(part);
      else if (part.mat === "goldTrim") goldParts.push(part);
      else if (hasTint && part.tintable) tintedDielectric.push(part);
      else if (part.mat === "kawaraRoof" || part.mat === "vermilion") untintedGlazed.push(part);
      else untintedDielectric.push(part);
    }

    if (untintedGlazed.length > 0) {
      const spec = memoizeGeometry(`ninja:inst:v3:${prefix}:glazed:${hasTint ? "split" : "all"}`, () => {
        const colored = untintedGlazed.map(colorPart);
        return mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(colored), 0.22)]);
      });
      nodes.push(instances.custom(spec, {
        name: `${prefix}-glazed`,
        material: INST_GLAZED_VCOLOR,
        transforms,
        castShadow,
        receiveShadow: true
      }));
    }

    if (untintedDielectric.length > 0) {
      const spec = memoizeGeometry(`ninja:inst:v3:${prefix}:dielectric:${hasTint ? "split" : "all"}`, () => {
        const colored = untintedDielectric.map(colorPart);
        return mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(colored), 0.22)]);
      });
      nodes.push(instances.custom(spec, {
        name: `${prefix}-dielectric`,
        material: INST_DIELECTRIC_VCOLOR,
        transforms,
        castShadow,
        receiveShadow: true
      }));
    }

    if (tintedDielectric.length > 0) {
      const spec = memoizeGeometry(`ninja:inst:v3:${prefix}:tinted`, () => {
        const colored = tintedDielectric.map(colorPart);
        return mergeRawMeshes([bakeMeshCavityAO(mergeColoredRawMeshes(colored), 0.22)]);
      });
      nodes.push(instances.custom(spec, {
        name: `${prefix}-tinted`,
        material: INST_DIELECTRIC_VCOLOR,
        transforms,
        ...(colors ? { colors } : {}),
        castShadow,
        receiveShadow: true
      }));
    }

    if (goldParts.length > 0) {
      const spec = memoizeGeometry(`ninja:inst:v3:${prefix}:gold`, () =>
        mergeRawMeshes(goldParts.map((p) => p.mesh))
      );
      nodes.push(instances.custom(spec, {
        name: `${prefix}-goldTrim`,
        material: INST_SENGOKU_MATERIALS.goldTrim,
        transforms,
        castShadow: false,
        receiveShadow: true
      }));
    }

    if (glowParts.length > 0) {
      const spec = memoizeGeometry(`ninja:inst:v3:${prefix}:glow`, () =>
        mergeRawMeshes(glowParts.map((p) => p.mesh))
      );
      nodes.push(instances.custom(spec, {
        name: `${prefix}-warmLanternCore`,
        material: INST_SENGOKU_MATERIALS.warmLanternCore,
        transforms,
        castShadow: false,
        receiveShadow: false
      }));
    }
  };

  for (const [id, list] of Object.entries(modelSink)) {
    if (!list || list.length === 0 || !(id in MESHY_MANIFEST)) continue;
    const propId = id as PropId;
    const shadow = options.castShadow && SHADOW_PROP_IDS.has(propId);
    emitParts(`proc-${propId}`, getNormalizedPropParts(propId), list, shadow);
  }

  if (accents) {
    emitParts("proc-bambooGrove", buildBambooGroveParts(), accents.bambooGroves, false);
    emitParts(
      "proc-ishigakiRampart",
      [
        { mat: "ishigakiStone", mesh: ishigakiRampartMesh(4.6, 1.35, 2.4, 0.24), tintable: true },
        { mat: "kawaraRoof", mesh: transformMesh(curvedGableRoofMesh(4.8, 1.55, 0.34, 0.12), { pos: [0, 2.38, 0] }) }
      ],
      accents.ishigakiRamparts,
      false
    );
    emitParts("proc-stoneBridgeArch", buildStoneBridgeArchParts(), accents.stoneBridgeArches, false);
    emitParts("proc-rooftopToroLantern", buildRooftopToroLanternParts(), accents.rooftopToroLanterns, false);
    emitParts("proc-rooftopShrineRailing", buildVermilionShrineRailingParts(), accents.rooftopShrineRailings, false);
    emitParts("proc-rooftopRidgeTile", buildRooftopRidgeTileParts(), accents.rooftopRidgeTiles, false);
    emitParts("proc-sakuraMapleTree", getNormalizedPropParts("oak"), accents.sakuraMapleTrees, false);
  }

  return nodes;
}

// ---------------------------------------------------------------------------
// 5. Multi-Material Weapons, Hazards, Pickups & Rigged Shinobi Overrides
// ---------------------------------------------------------------------------

const WEAPON_PALETTE: readonly AuraMaterialSpec[] = [
  SENGOKU_MATERIALS.tamahaganeSteel,    // 0: folded blade steel
  SENGOKU_MATERIALS.forgedIron,         // 1: blackened iron
  SENGOKU_MATERIALS.imperialGold,       // 2: gilded tsuba / collars
  SENGOKU_MATERIALS.shinobiIndigoCloth, // 3: diamond-wrapped tsuka silk
  SENGOKU_MATERIALS.woodDarkCedar,      // 4: heavy lacquered hardwood
  SENGOKU_MATERIALS.vermilionLacquer,   // 5: crimson lacquer scabbard/accent
  SENGOKU_MATERIALS.lanternFlameEmissive, // 6: warning ember glow (`practical: true`)
  SENGOKU_MATERIALS.spiritSealEmissive,   // 7: cyan spirit scroll glow (`practical: true`)
  SENGOKU_MATERIALS.crimsonNorenCloth     // 8: crimson scroll silk
];

const SHARED_SLOTS_CACHE = new Map<string, readonly MultiMatSlot[]>();
function cachedSlots(key: string, build: () => MultiMatSlot[]): readonly MultiMatSlot[] {
  let hit = SHARED_SLOTS_CACHE.get(key);
  if (!hit) {
    hit = build();
    SHARED_SLOTS_CACHE.set(key, hit);
  }
  return hit;
}

/** Curved `sori` Sengoku katana (`Z in [-0.5, +0.5]` matching `aim()` bone-socket transform). */
export function buildKatanaWeaponNode(id: string): GroupBuilder {
  const slots = cachedSlots("katana", () => {
    const bladeSlices: V3[][] = [];
    const steps = 6;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const z = -0.22 + t * 0.72;
      const sori = Math.pow(t, 1.8) * 0.032;
      const h = (1 - Math.pow(t, 3.2) * 0.72) * 0.022;
      const w = (1 - t * 0.55) * 0.008;
      bladeSlices.push([
        [0, sori + h, z],
        [w, sori, z],
        [0, sori - h * 0.65, z],
        [-w, sori, z]
      ]);
    }
    return [
      { mesh: loftSectionsMesh(bladeSlices, true, true), materialIndex: 0 },
      { mesh: transformMesh(latheMesh([[0, -0.008], [0.055, -0.008], [0.055, 0.008], [0, 0.008]], 10, true), { pos: [0, 0, -0.23], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 },
      { mesh: transformMesh(bevelBoxMesh(0.024, 0.034, 0.25, 0.005), { pos: [0, -0.004, -0.365] }), materialIndex: 3 },
      { mesh: transformMesh(bevelBoxMesh(0.028, 0.038, 0.026, 0.005), { pos: [0, -0.006, -0.49] }), materialIndex: 2 }
    ];
  });
  return assembleMultiMaterialNode("shared-katana", slots, WEAPON_PALETTE, {
    id,
    castShadow: false,
    receiveShadow: false,
    visible: false,
    coalesceColors: false
  });
}

/** Iron-studded octagonal `kanabo` war club (`Z in [-0.5, +0.5]`). */
export function buildKanaboWeaponNode(id: string): GroupBuilder {
  const slots = cachedSlots("kanabo", () => {
    const out: MultiMatSlot[] = [
      {
        mesh: transformMesh(
          latheMesh([[0, 0], [0.026, 0], [0.028, 0.28], [0.056, 0.34], [0.078, 0.94], [0.052, 1.0], [0, 1.0]], 8, true),
          { pos: [0, 0, -0.5], rot: [Math.PI * 0.5, 0, 0] }
        ),
        materialIndex: 1
      },
      { mesh: transformMesh(bevelBoxMesh(0.044, 0.044, 0.26, 0.008), { pos: [0, 0, -0.36] }), materialIndex: 4 },
      { mesh: transformMesh(latheMesh([[0, -0.015], [0.064, -0.015], [0.064, 0.015], [0, 0.015]], 10, true), { pos: [0, 0, -0.2], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 }
    ];
    for (const z of [-0.05, 0.14, 0.33]) {
      for (let k = 0; k < 6; k += 1) {
        const a = (k / 6) * Math.PI * 2;
        const r = 0.072;
        out.push({
          mesh: transformMesh(icosphereFacetMesh(0.022, 0, 0, k + 1), {
            pos: [Math.cos(a) * r, Math.sin(a) * r, z]
          }),
          materialIndex: 2
        });
      }
    }
    return out;
  });
  return assembleMultiMaterialNode("shared-kanabo", slots, WEAPON_PALETTE, {
    id,
    castShadow: false,
    receiveShadow: false,
    visible: false,
    coalesceColors: false
  });
}

/** Sculpted Sengoku armored `tate` palisade barricade (`barrier-${i}`, `barrier-band-${i}`, `barrier-top-${i}`). */
export function buildBarrierHazardNodes(index: number): GroupBuilder[] {
  const bodySlots = cachedSlots("barrier-body", () => [
    { mesh: bevelBoxMesh(2.0, 1.46, 0.44, 0.03), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.68, 0.68, 0.48, 0.02), { pos: [0, 0.08, 0], rot: [0, 0, Math.PI * 0.25] }), materialIndex: 5 },
    { mesh: transformMesh(latheMesh([[0, -0.26], [0.22, -0.26], [0.22, 0.26], [0, 0.26]], 12, true), { pos: [0, 0.08, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 }
  ]);
  const bandSlots = cachedSlots("barrier-band", () => {
    const out: MultiMatSlot[] = [{ mesh: bevelBoxMesh(2.12, 0.18, 0.54, 0.02), materialIndex: 1 }];
    for (const sx of [-0.78, -0.39, 0, 0.39, 0.78]) {
      out.push({
        mesh: transformMesh(latheMesh([[0, 0], [0.055, 0], [0.008, 0.22], [0, 0.22]], 6, true), {
          pos: [sx, 0, 0.26],
          rot: [Math.PI * 0.5, 0, 0]
        }),
        materialIndex: 0
      });
    }
    return out;
  });
  const topSlots = cachedSlots("barrier-top", () => [
    { mesh: transformMesh(curvedGableRoofMesh(2.26, 0.72, 0.24, 0.18), { pos: [0, -0.08, 0] }), materialIndex: 5 }
  ]);

  return [
    assembleMultiMaterialNode("shared-barrier-body", bodySlots, WEAPON_PALETTE, { id: `barrier-${index}`, castShadow: true, receiveShadow: true, visible: false, coalesceColors: false }),
    assembleMultiMaterialNode("shared-barrier-band", bandSlots, WEAPON_PALETTE, { id: `barrier-band-${index}`, castShadow: false, receiveShadow: true, visible: false, coalesceColors: false }),
    assembleMultiMaterialNode("shared-barrier-top", topSlots, WEAPON_PALETTE, { id: `barrier-top-${index}`, castShadow: false, receiveShadow: true, visible: false, coalesceColors: false })
  ];
}

/** Multi-material spiked hazard beam (`beam-${i}`, `2.5m` wide) with kunai spikes & glowing ember collars. */
export function buildSpikedBeamHazardNode(index: number): GroupBuilder {
  const slots = cachedSlots("spiked-beam", () => {
    const out: MultiMatSlot[] = [{ mesh: bevelBoxMesh(2.5, 0.26, 0.26, 0.025), materialIndex: 4 }];
    const spikeRing: V2[] = [[0, 0.24], [-0.07, 0.08], [-0.24, 0], [-0.07, -0.08], [0, -0.24], [0.07, -0.08], [0.24, 0], [0.07, 0.08]];
    for (const x of [-0.95, -0.48, 0, 0.48, 0.95]) {
      out.push({
        mesh: transformMesh(extrudePolygonMesh(spikeRing, 0.05, 0.008, true), { pos: [x, 0, 0], rot: [0, Math.PI * 0.5, 0] }),
        materialIndex: 0
      });
      out.push({
        mesh: transformMesh(bevelBoxMesh(0.08, 0.3, 0.3, 0.01), { pos: [x, 0, 0] }),
        materialIndex: 1
      });
    }
    for (const x of [-0.72, 0.72]) {
      out.push({
        mesh: transformMesh(bevelBoxMesh(0.1, 0.28, 0.28, 0.01), { pos: [x, 0, 0] }),
        materialIndex: 6
      });
    }
    return out;
  });
  return assembleMultiMaterialNode("shared-spiked-beam", slots, WEAPON_PALETTE, {
    id: `beam-${index}`,
    castShadow: true,
    receiveShadow: true,
    visible: false,
    coalesceColors: false
  });
}

/** Forged 6-point tamahagane `shuriken` star (`shuriken-star-${i}`) spinning inside the Gale Star vortex. */
export function buildShurikenStarNode(index: number): GroupBuilder {
  const slots = cachedSlots("shuriken-star", () => {
    const starPts: V2[] = [];
    const points = 6;
    for (let i = 0; i < points * 2; i += 1) {
      const a = (i / (points * 2)) * Math.PI * 2;
      const r = i % 2 === 0 ? 0.48 : 0.17;
      starPts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    return [
      { mesh: transformMesh(extrudePolygonMesh(starPts, 0.05, 0.012, true), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
      { mesh: latheMesh([[0.08, -0.035], [0.16, -0.035], [0.16, 0.035], [0.08, 0.035]], 12, true), materialIndex: 2 }
    ];
  });
  return assembleMultiMaterialNode("shared-shuriken-star", slots, WEAPON_PALETTE, {
    id: `shuriken-star-${index}`,
    castShadow: false,
    receiveShadow: false,
    visible: false,
    coalesceColors: false
  });
}

/** Multi-material spinning Shinobi Secret Scroll or Stamped Imperial Koban Coin pickup (`pickup-prop-${i}`). */
export function buildPickupPropNode(index: number, kind: "scroll" | "coin"): GroupBuilder {
  const slots = cachedSlots(`pickup-${kind}`, () => {
    const out: MultiMatSlot[] = [];
    if (kind === "scroll") {
      out.push({
        mesh: transformMesh(
          latheMesh([[0, -0.26], [0.085, -0.26], [0.085, 0.26], [0, 0.26]], 12, false),
          { rot: [0, 0, 0.42] }
        ),
        materialIndex: 8
      });
      for (const sy of [-0.28, 0.28]) {
        out.push({
          mesh: transformMesh(
            latheMesh([[0, -0.03], [0.105, -0.03], [0.105, 0.03], [0, 0.03]], 12, true),
            { pos: [-Math.sin(0.42) * sy, Math.cos(0.42) * sy, 0], rot: [0, 0, 0.42] }
          ),
          materialIndex: 2
        });
      }
      out.push({
        mesh: transformMesh(
          latheMesh([[0, -0.05], [0.096, -0.05], [0.096, 0.05], [0, 0.05]], 12, false),
          { rot: [0, 0, 0.42] }
        ),
        materialIndex: 7
      });
    } else {
      const oval: V2[] = [];
      for (let i = 0; i < 14; i += 1) {
        const a = (i / 14) * Math.PI * 2;
        oval.push([Math.cos(a) * 0.19, Math.sin(a) * 0.28]);
      }
      out.push({ mesh: extrudePolygonMesh(oval, 0.045, 0.01, true), materialIndex: 2 });
      out.push({ mesh: bevelBoxMesh(0.09, 0.09, 0.058, 0.008), materialIndex: 1 });
      out.push({ mesh: bevelBoxMesh(0.04, 0.16, 0.054, 0.006), materialIndex: 7 });
    }
    return out;
  });
  return assembleMultiMaterialNode(`shared-pickup-${kind}`, slots, WEAPON_PALETTE, {
    id: `pickup-prop-${index}`,
    castShadow: false,
    receiveShadow: false,
    visible: false,
    coalesceColors: false
  });
}

/**
 * Physical `sheenFabric` shinobi cloth + `anisotropic`/clearcoat armor & dusk `rim` material overrides
 * for the 6 kept `skins=1` rigged character skeletons (`hero`, `sage`, `soldier`, `brute`, `caster`, `scout`).
 */
export function shinobiActorMaterialOverrides(
  character: CharacterId,
  stateKey: string,
  tint: {
    readonly base: readonly [number, number, number, number?];
    readonly emissive?: readonly [number, number, number];
    readonly strength?: number;
    readonly roughness?: number;
    readonly metallic?: number;
  },
  evening: boolean
): ActorMaterialOverride {
  const isHeavyArmor = character === "brute" || character === "soldier";
  const isMysticCloth = character === "caster" || character === "sage";
  const sheenColor: [number, number, number] = stateKey === "clone"
    ? [0.42, 0.86, 1.0]
    : stateKey === "beast"
      ? [1.0, 0.72, 0.28]
      : isMysticCloth
        ? [0.68, 0.58, 0.96]
        : [0.46, 0.6, 0.88];

  return [{
    baseColorMultiply: [tint.base[0], tint.base[1], tint.base[2], tint.base[3] ?? 1],
    emissiveColor: tint.emissive ? [tint.emissive[0], tint.emissive[1], tint.emissive[2]] : [0, 0, 0],
    emissiveStrength: tint.strength ?? 0,
    roughness: tint.roughness ?? (isHeavyArmor ? 0.58 : 0.62),
    metallic: tint.metallic ?? (isHeavyArmor ? 0.28 : 0.06),
    sheenColor,
    sheenRoughness: isMysticCloth ? 0.34 : 0.42,
    clearcoat: isHeavyArmor ? 0.18 : 0,
    clearcoatRoughness: isHeavyArmor ? 0.28 : 0.42,
    envMapIntensity: isHeavyArmor ? 0.12 : 0.08,
    ...(evening ? {
      rim: {
        color: stateKey === "clone" ? [0.45, 0.9, 1.0] : [1.0, 0.74, 0.48],
        power: 3.2,
        intensity: stateKey === "flash" ? 0.6 : 0.22
      }
    } : {})
  }];
}
