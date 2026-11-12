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
  mergeRawMeshes,
  stratifiedCliffMesh,
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
  kawaraRoof: unnamed(material.pbr({ color: "#2d384a", roughness: 0.34, metallic: 0.12, clearcoat: 0, sheen: 0 })),
  shikkuiWall: unnamed(material.pbr({ color: "#e6dccb", roughness: 0.72, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  cedarWood: unnamed(material.pbr({ color: "#553624", roughness: 0.68, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  vermilion: unnamed(material.pbr({ color: "#c63a2b", roughness: 0.36, metallic: 0.06, clearcoat: 0, sheen: 0 })),
  ishigakiStone: unnamed(material.pbr({ color: "#828581", roughness: 0.85, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  mossStone: unnamed(material.pbr({ color: "#667463", roughness: 0.88, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  bambooCulm: unnamed(material.pbr({ color: "#4d7c45", roughness: 0.44, metallic: 0.04, clearcoat: 0, sheen: 0 })),
  pineFoliage: unnamed(material.pbr({ color: "#2d5735", roughness: 0.78, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  sakuraFoliage: unnamed(material.pbr({ color: "#e58fa9", roughness: 0.74, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  clothCanopy: unnamed(material.pbr({ color: "#c24331", roughness: 0.72, metallic: 0.02, clearcoat: 0, sheen: 0 })),
  goldTrim: unnamed(material.metal({ color: "#dfb14b", roughness: 0.26, metallic: 0.92, clearcoat: 0, sheen: 0 })),
  warmLanternCore: unnamed(material.pbr({
    color: "#fff0d0",
    emissive: "#ff9e3d",
    emissiveIntensity: 1.85,
    practical: true,
    roughness: 0.36,
    metallic: 0,
    clearcoat: 0,
    sheen: 0
  }))
};

// ---------------------------------------------------------------------------
// 2. Core Sengoku Curved Architectural & Botanical Sculpting Primitives
// ---------------------------------------------------------------------------

/** merge helper returning a RawMesh from multiple RawMeshes without TypedArray packing yet. */
function joinRaw(parts: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const m of parts) {
    const off = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + off);
  }
  return { positions, normals, uvs, indices };
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
  const ridge = transformMesh(bevelBoxMesh(ridgeLen, rise * 0.16, Math.max(0.08, depth * topRatio * 0.8), 0.015), {
    pos: [0, rise * 1.02, 0]
  });
  return joinRaw([main, ridge]);
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

/** Carved stone `toro` lantern (`y in [0, height]`) built with `latheMesh` + glowing `hibukuro` firebox. */
export function carvedToroLanternSlots(opts: {
  readonly height: number;
  readonly stoneMat: number;
  readonly glowMat: number;
  readonly shojiMat?: number;
}): MultiMatSlot[] {
  const h = opts.height;
  const r = h * 0.22;
  // Base pedestal + column shaft (`kiso` + `sao` + `chudai`)
  const shaftProfile: V2[] = [
    [0, 0],
    [r * 0.95, 0],
    [r * 0.88, h * 0.09],
    [r * 0.52, h * 0.14],
    [r * 0.34, h * 0.18],
    [r * 0.3, h * 0.54],
    [r * 0.76, h * 0.6],
    [r * 0.82, h * 0.64],
    [0, h * 0.64]
  ];
  // Umbrella cap + lotus jewel (`kasa` + `hoju`)
  const capProfile: V2[] = [
    [0, h * 0.8],
    [r * 1.12, h * 0.8],
    [r * 0.85, h * 0.88],
    [r * 0.32, h * 0.93],
    [r * 0.22, h * 0.96],
    [r * 0.04, h],
    [0, h]
  ];
  const slots: MultiMatSlot[] = [
    { mesh: latheMesh(shaftProfile, 6, true), materialIndex: opts.stoneMat },
    { mesh: latheMesh(capProfile, 6, true), materialIndex: opts.stoneMat }
  ];
  // Corner mullions of the `hibukuro` firebox
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.12, h * 0.17, r * 0.12, 0.005), {
        pos: [Math.cos(a) * r * 0.42, h * 0.72, Math.sin(a) * r * 0.42]
      }),
      materialIndex: opts.stoneMat
    });
  }
  slots.push({
    mesh: transformMesh(icosphereFacetMesh(r * 0.28, 1, 0.03, 7), {
      pos: [0, h * 0.72, 0],
      scale: [1, 1.15, 1]
    }),
    materialIndex: opts.glowMat
  });
  if (opts.shojiMat !== undefined) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(r * 0.68, h * 0.14, r * 0.68, 0.008), {
        pos: [0, h * 0.72, 0]
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
    receiveShadow: true
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
    receiveShadow: true
  });
  const cradleNode = assembleMultiMaterialNode("setpiece-waterWheel-cradle", cradleSlots, HERO_SETPIECE_PALETTE, {
    castShadow: false,
    receiveShadow: true
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

    // Curved upturned `kawara` pagoda roof + gilded corner wind-bells (`futaku`)
    const roofY = yCursor + coreH - 0.18;
    slots.push({
      mesh: transformMesh(curvedPagodaRoofMesh(roofSpan, roofSpan, roofRise, 0.26, 0.28), {
        pos: [0, roofY, 0]
      }),
      materialIndex: 3
    });
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
    receiveShadow: true
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
    // 2-story machiya townhouse with curved kirizuma gable roof, plaster upper wall, cedar lattice & glowing shoji
    parts.push({ mat: "ishigakiStone", mesh: ishigakiRampartMesh(2.0, 1.08, 0.24, 0.1) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.86, 1.08, 0.94, 0.02), { pos: [0, 0.76, 0] }), tintable: true });
    parts.push({ mat: "cedarWood", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.94, 0.08, 1.04, 0.01), { pos: [0, 0.72, 0] }),
      transformMesh(bevelBoxMesh(1.9, 0.46, 0.98, 0.015), { pos: [0, 0.45, 0] })
    ]) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.72, 0.34, 1.0, 0.01), { pos: [0, 0.98, 0] }) });
    parts.push({ mat: "kawaraRoof", mesh: joinRaw([
      transformMesh(curvedGableRoofMesh(2.14, 1.24, 0.46, 0.22), { pos: [0, 1.26, 0] }),
      transformMesh(curvedPagodaRoofMesh(2.04, 0.42, 0.14, 0.14, 0.6), { pos: [0, 0.68, 0.38] })
    ]) });
  } else if (variant === "B") {
    // Tall narrow corner merchant house with wrap veranda & hipped curved roof
    parts.push({ mat: "ishigakiStone", mesh: ishigakiRampartMesh(0.98, 1.24, 0.3, 0.12) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(0.88, 1.38, 1.12, 0.02), { pos: [0, 0.96, 0] }), tintable: true });
    parts.push({ mat: "cedarWood", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.02, 0.12, 1.28, 0.012), { pos: [0, 0.92, 0] }),
      transformMesh(bevelBoxMesh(0.94, 0.48, 1.18, 0.012), { pos: [0, 0.52, 0] })
    ]) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.46, 0.42, 1.16, 0.01), { pos: [0, 1.24, 0] }) });
    parts.push({ mat: "kawaraRoof", mesh: transformMesh(curvedPagodaRoofMesh(1.16, 1.46, 0.52, 0.24, 0.24), { pos: [0, 1.6, 0] }) });
  } else if (variant === "C") {
    // Stepped Sengoku castle-town `kura` storehouse keep with twin tiered roofs & gold ridge crest
    parts.push({ mat: "ishigakiStone", mesh: ishigakiRampartMesh(1.96, 1.42, 0.42, 0.2) });
    parts.push({ mat: "shikkuiWall", mesh: joinRaw([
      transformMesh(bevelBoxMesh(1.74, 0.78, 1.22, 0.025), { pos: [0, 0.78, 0] }),
      transformMesh(bevelBoxMesh(1.28, 0.58, 0.92, 0.02), { pos: [0, 1.42, 0] })
    ]), tintable: true });
    parts.push({ mat: "kawaraRoof", mesh: joinRaw([
      transformMesh(curvedPagodaRoofMesh(2.08, 1.54, 0.32, 0.2, 0.58), { pos: [0, 1.1, 0] }),
      transformMesh(curvedPagodaRoofMesh(1.62, 1.22, 0.44, 0.26, 0.22), { pos: [0, 1.68, 0] })
    ]) });
    parts.push({ mat: "goldTrim", mesh: transformMesh(bevelBoxMesh(0.44, 0.14, 0.1, 0.015), { pos: [0, 2.12, 0] }) });
  } else {
    // Compact Sengoku turret tenshu (`houseD`) with vermilion trim & dormer gable
    parts.push({ mat: "ishigakiStone", mesh: ishigakiRampartMesh(1.2, 0.82, 0.44, 0.22) });
    parts.push({ mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.02, 1.12, 0.68, 0.02), { pos: [0, 0.98, 0] }), tintable: true });
    parts.push({ mat: "vermilion", mesh: transformMesh(bevelBoxMesh(1.12, 0.1, 0.78, 0.012), { pos: [0, 1.02, 0] }) });
    parts.push({ mat: "warmLanternCore", mesh: transformMesh(bevelBoxMesh(0.42, 0.32, 0.72, 0.01), { pos: [0, 1.26, 0] }) });
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
        { mat: "ishigakiStone", mesh: ishigakiRampartMesh(1.94, 1.68, 0.22, 0.1) },
        { mat: "cedarWood", mesh: joinRaw([
          transformMesh(bevelBoxMesh(1.88, 0.1, 1.62, 0.012), { pos: [0, 0.24, 0] }),
          transformMesh(bevelBoxMesh(1.52, 0.88, 1.24, 0.02), { pos: [0, 0.72, -0.1] })
        ]) },
        { mat: "shikkuiWall", mesh: transformMesh(bevelBoxMesh(1.44, 0.82, 1.16, 0.015), { pos: [0, 0.72, -0.1] }), tintable: true },
        { mat: "clothCanopy", mesh: transformMesh(bevelBoxMesh(1.42, 0.34, 0.06, 0.01), { pos: [0, 0.86, 0.62] }) },
        { mat: "warmLanternCore", mesh: joinRaw([
          transformMesh(icosphereFacetMesh(0.12, 0, 0, 5), { pos: [-0.52, 0.78, 0.68] }),
          transformMesh(icosphereFacetMesh(0.12, 0, 0, 9), { pos: [0.52, 0.78, 0.68] })
        ]) },
        { mat: "kawaraRoof", mesh: joinRaw([
          transformMesh(curvedPagodaRoofMesh(2.08, 1.82, 0.48, 0.24, 0.26), { pos: [0, 1.14, 0] }),
          transformMesh(curvedPagodaRoofMesh(1.18, 1.02, 0.32, 0.22, 0.2), { pos: [0, 1.52, -0.06] })
        ]) }
      ];
      return { anchor: "ground", parts };
    }
    case "marketStall": {
      const posts: RawMesh[] = [];
      for (const sx of [-0.82, 0.82]) {
        for (const sz of [-0.46, 0.46]) {
          posts.push(transformMesh(bevelBoxMesh(0.07, 1.08, 0.07, 0.008), { pos: [sx, 0.56, sz] }));
        }
      }
      posts.push(transformMesh(bevelBoxMesh(1.74, 0.44, 0.92, 0.015), { pos: [0, 0.26, 0] }));
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: joinRaw(posts) },
          { mat: "clothCanopy", mesh: transformMesh(curvedGableRoofMesh(1.92, 1.2, 0.32, 0.14), { pos: [0, 1.04, 0] }), tintable: true },
          { mat: "shikkuiWall", mesh: joinRaw([
            transformMesh(latheMesh([[0, 0], [0.12, 0], [0.16, 0.12], [0.11, 0.24], [0, 0.24]], 8, true), { pos: [-0.42, 0.48, 0.1] }),
            transformMesh(latheMesh([[0, 0], [0.13, 0], [0.17, 0.14], [0.1, 0.26], [0, 0.26]], 8, true), { pos: [0.36, 0.48, -0.08] })
          ]) },
          { mat: "warmLanternCore", mesh: transformMesh(icosphereFacetMesh(0.09, 0, 0, 2), { pos: [0.76, 0.88, 0.46] }) }
        ]
      };
    }
    case "tower": {
      return {
        anchor: "ground",
        parts: [
          { mat: "ishigakiStone", mesh: ishigakiRampartMesh(1.62, 1.66, 0.62, 0.26) },
          { mat: "shikkuiWall", mesh: joinRaw([
            transformMesh(bevelBoxMesh(1.18, 0.68, 1.22, 0.02), { pos: [0, 0.92, 0] }),
            transformMesh(bevelBoxMesh(0.88, 0.48, 0.92, 0.018), { pos: [0, 1.48, 0] })
          ]), tintable: true },
          { mat: "cedarWood", mesh: transformMesh(bevelBoxMesh(1.36, 0.1, 1.4, 0.012), { pos: [0, 1.24, 0] }) },
          { mat: "kawaraRoof", mesh: joinRaw([
            transformMesh(curvedPagodaRoofMesh(1.56, 1.6, 0.28, 0.22, 0.56), { pos: [0, 1.22, 0] }),
            transformMesh(curvedPagodaRoofMesh(1.26, 1.3, 0.42, 0.26, 0.18), { pos: [0, 1.68, 0] })
          ]) },
          { mat: "goldTrim", mesh: transformMesh(latheMesh([[0, 0], [0.08, 0], [0.03, 0.24], [0, 0.24]], 8, false), { pos: [0, 2.08, 0] }) }
        ]
      };
    }
    case "gate": {
      const colL = transformMesh(latheMesh([[0, 0], [0.13, 0], [0.11, 1.56], [0, 1.56]], 12), { pos: [-0.68, 0.12, 0] });
      const colR = transformMesh(latheMesh([[0, 0], [0.13, 0], [0.11, 1.56], [0, 1.56]], 12), { pos: [0.68, 0.12, 0] });
      const nuki = transformMesh(bevelBoxMesh(1.74, 0.11, 0.14, 0.012), { pos: [0, 1.34, 0] });
      const kasagi = transformMesh(curvedPagodaRoofMesh(1.94, 0.78, 0.28, 0.28, 0.72), { pos: [0, 1.62, 0] });
      return {
        anchor: "ground",
        parts: [
          { mat: "ishigakiStone", mesh: joinRaw([
            transformMesh(latheMesh([[0, 0], [0.22, 0], [0.17, 0.16], [0, 0.16]], 10, true), { pos: [-0.68, 0, 0] }),
            transformMesh(latheMesh([[0, 0], [0.22, 0], [0.17, 0.16], [0, 0.16]], 10, true), { pos: [0.68, 0, 0] })
          ]) },
          { mat: "vermilion", mesh: joinRaw([colL, colR, nuki]), tintable: true },
          { mat: "kawaraRoof", mesh: kasagi },
          { mat: "goldTrim", mesh: transformMesh(bevelBoxMesh(0.22, 0.28, 0.08, 0.01), { pos: [0, 1.5, 0] }) },
          { mat: "warmLanternCore", mesh: joinRaw([
            transformMesh(icosphereFacetMesh(0.08, 0, 0, 4), { pos: [-0.46, 1.2, 0.14] }),
            transformMesh(icosphereFacetMesh(0.08, 0, 0, 8), { pos: [0.46, 1.2, 0.14] })
          ]) }
        ]
      };
    }
    case "lantern": {
      const slots = carvedToroLanternSlots({ height: 1.9, stoneMat: 0, glowMat: 1 });
      const stoneRaw = joinRaw(slots.filter((s) => s.materialIndex === 0).map((s) => s.mesh));
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
          { mat: "bambooCulm", mesh: joinRaw(rails), tintable: true },
          { mat: "cedarWood", mesh: joinRaw(knots) }
        ]
      };
    }
    case "pine": {
      const trunk = tubeSweepMesh([
        [0, 0, 0, 0.085],
        [0.05, 0.42, 0.02, 0.068],
        [-0.04, 0.88, -0.02, 0.05],
        [0.02, 1.38, 0.01, 0.028]
      ], 7, true);
      const boughs = transformMesh(coniferBoughTierMesh({ baseRadius: 0.48, height: 1.48, tiers: 5, seed: 29 }), {
        pos: [0, 0.38, 0]
      });
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: trunk },
          { mat: "pineFoliage", mesh: boughs, tintable: true }
        ]
      };
    }
    case "oak": {
      const trunk = joinRaw([
        tubeSweepMesh([[0, 0, 0, 0.11], [0.04, 0.38, -0.02, 0.085], [-0.03, 0.78, 0.03, 0.055]], 7, true),
        tubeSweepMesh([[0.02, 0.55, 0, 0.05], [0.22, 0.92, 0.12, 0.028]], 6, true),
        tubeSweepMesh([[-0.02, 0.58, 0, 0.048], [-0.2, 0.96, -0.1, 0.026]], 6, true)
      ]);
      const crown = transformMesh(layeredCanopyMesh({ radius: 0.58, height: 1.15, puffs: 9, seed: 17 }), {
        pos: [0, 0.68, 0]
      });
      return {
        anchor: "ground",
        parts: [
          { mat: "cedarWood", mesh: trunk },
          { mat: "sakuraFoliage", mesh: crown, tintable: true }
        ]
      };
    }
    case "bush": {
      const shrub = layeredCanopyMesh({ radius: 0.82, height: 1.35, puffs: 7, seed: 41 });
      return {
        anchor: "ground",
        parts: [{ mat: "pineFoliage", mesh: shrub, tintable: true }]
      };
    }
    case "boulder": {
      return {
        anchor: "center",
        parts: [
          { mat: "ishigakiStone", mesh: icosphereFacetMesh(0.92, 1, 0.24, 13), tintable: true },
          { mat: "mossStone", mesh: transformMesh(icosphereFacetMesh(0.68, 1, 0.18, 31), { pos: [0.12, 0.26, 0.08], scale: [1.1, 0.55, 1.05] }) }
        ]
      };
    }
    case "cliffA": {
      return {
        anchor: "center",
        parts: [{ mat: "ishigakiStone", mesh: stratifiedCliffMesh({ radiusX: 0.52, radiusZ: 0.62, height: 1.9, terraces: 5, seed: 23 }), tintable: true }]
      };
    }
    case "cliffB": {
      return {
        anchor: "center",
        parts: [
          { mat: "ishigakiStone", mesh: stratifiedCliffMesh({ radiusX: 0.88, radiusZ: 0.94, height: 1.4, terraces: 4, seed: 53 }), tintable: true },
          { mat: "mossStone", mesh: transformMesh(icosphereFacetMesh(0.58, 1, 0.16, 61), { pos: [0, 1.22, 0], scale: [1.2, 0.36, 1.2] }) }
        ]
      };
    }
    case "ridge": {
      return {
        anchor: "center",
        parts: [{ mat: "mossStone", mesh: stratifiedCliffMesh({ radiusX: 0.86, radiusZ: 0.94, height: 0.35, terraces: 3, seed: 79 }), tintable: true }]
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
    { mat: "bambooCulm", mesh: joinRaw(culms), tintable: true },
    { mat: "pineFoliage", mesh: joinRaw(leaves), tintable: true }
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

/**
 * Emits instancing-safe (`clearcoat: 0, sheen: 0`) procedural multi-material district prop batches
 * plus Sengoku bamboo groves, `ishigaki` stone rampart retaining walls, and arched stone bridges.
 */
export function buildProceduralDistrictBatches(
  modelSink: ModelSink,
  accents: CourseAccents | null,
  options: { readonly castShadow: boolean }
): InstancedPrimitiveBuilder[] {
  const nodes: InstancedPrimitiveBuilder[] = [];

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

    parts.forEach((part, idx) => {
      const spec = mergeRawMeshes([part.mesh]);
      const isGlow = part.mat === "warmLanternCore";
      nodes.push(instances.custom(spec, {
        name: `${prefix}-${part.mat}-${idx}`,
        material: INST_SENGOKU_MATERIALS[part.mat],
        transforms,
        ...(colors && part.tintable ? { colors } : {}),
        castShadow: castShadow && !isGlow,
        receiveShadow: !isGlow
      }));
    });
  };

  for (const [id, list] of Object.entries(modelSink)) {
    if (!list || list.length === 0 || !(id in MESHY_MANIFEST)) continue;
    const propId = id as PropId;
    const shadow = options.castShadow && propId !== "ridge" && propId !== "bush";
    emitParts(`proc-${propId}`, getNormalizedPropParts(propId), list, shadow);
  }

  if (accents) {
    emitParts("proc-bambooGrove", buildBambooGroveParts(), accents.bambooGroves, options.castShadow);
    emitParts(
      "proc-ishigakiRampart",
      [
        { mat: "ishigakiStone", mesh: ishigakiRampartMesh(4.6, 1.35, 2.4, 0.24), tintable: true },
        { mat: "kawaraRoof", mesh: transformMesh(curvedGableRoofMesh(4.8, 1.55, 0.34, 0.12), { pos: [0, 2.38, 0] }) }
      ],
      accents.ishigakiRamparts,
      options.castShadow
    );
    emitParts("proc-stoneBridgeArch", buildStoneBridgeArchParts(), accents.stoneBridgeArches, false);
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

/** Curved `sori` Sengoku katana (`Z in [-0.5, +0.5]` matching `aim()` bone-socket transform). */
export function buildKatanaWeaponNode(id: string): GroupBuilder {
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
  const slots: MultiMatSlot[] = [
    { mesh: loftSectionsMesh(bladeSlices, true, true), materialIndex: 0 },
    { mesh: transformMesh(latheMesh([[0, -0.008], [0.055, -0.008], [0.055, 0.008], [0, 0.008]], 10, true), { pos: [0, 0, -0.23], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 },
    { mesh: transformMesh(bevelBoxMesh(0.024, 0.034, 0.25, 0.005), { pos: [0, -0.004, -0.365] }), materialIndex: 3 },
    { mesh: transformMesh(bevelBoxMesh(0.028, 0.038, 0.026, 0.005), { pos: [0, -0.006, -0.49] }), materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(id, slots, WEAPON_PALETTE, { id, castShadow: false, receiveShadow: false });
}

/** Iron-studded octagonal `kanabo` war club (`Z in [-0.5, +0.5]`). */
export function buildKanaboWeaponNode(id: string): GroupBuilder {
  const slots: MultiMatSlot[] = [
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
      slots.push({
        mesh: transformMesh(icosphereFacetMesh(0.022, 0, 0, k + 1), {
          pos: [Math.cos(a) * r, Math.sin(a) * r, z]
        }),
        materialIndex: 2
      });
    }
  }
  return assembleMultiMaterialNode(id, slots, WEAPON_PALETTE, { id, castShadow: false, receiveShadow: false });
}

/** Sculpted Sengoku armored `tate` palisade barricade (`barrier-${i}`, `barrier-band-${i}`, `barrier-top-${i}`). */
export function buildBarrierHazardNodes(index: number): GroupBuilder[] {
  const bodySlots: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(2.0, 1.46, 0.44, 0.03), materialIndex: 4 },
    { mesh: transformMesh(bevelBoxMesh(0.68, 0.68, 0.48, 0.02), { pos: [0, 0.08, 0], rot: [0, 0, Math.PI * 0.25] }), materialIndex: 5 },
    { mesh: transformMesh(latheMesh([[0, -0.26], [0.22, -0.26], [0.22, 0.26], [0, 0.26]], 12, true), { pos: [0, 0.08, 0], rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 2 }
  ];
  const bandSlots: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(2.12, 0.18, 0.54, 0.02), materialIndex: 1 }
  ];
  for (const sx of [-0.78, -0.39, 0, 0.39, 0.78]) {
    bandSlots.push({
      mesh: transformMesh(latheMesh([[0, 0], [0.055, 0], [0.008, 0.22], [0, 0.22]], 6, true), {
        pos: [sx, 0, 0.26],
        rot: [Math.PI * 0.5, 0, 0]
      }),
      materialIndex: 0
    });
  }
  const topSlots: MultiMatSlot[] = [
    { mesh: transformMesh(curvedGableRoofMesh(2.26, 0.72, 0.24, 0.18), { pos: [0, -0.08, 0] }), materialIndex: 5 }
  ];

  return [
    assembleMultiMaterialNode(`barrier-${index}`, bodySlots, WEAPON_PALETTE, { id: `barrier-${index}`, castShadow: true, receiveShadow: true }),
    assembleMultiMaterialNode(`barrier-band-${index}`, bandSlots, WEAPON_PALETTE, { id: `barrier-band-${index}`, castShadow: true, receiveShadow: true }),
    assembleMultiMaterialNode(`barrier-top-${index}`, topSlots, WEAPON_PALETTE, { id: `barrier-top-${index}`, castShadow: true, receiveShadow: true })
  ];
}

/** Multi-material spiked hazard beam (`beam-${i}`, `2.5m` wide) with kunai spikes & glowing ember collars. */
export function buildSpikedBeamHazardNode(index: number): GroupBuilder {
  const slots: MultiMatSlot[] = [
    { mesh: bevelBoxMesh(2.5, 0.26, 0.26, 0.025), materialIndex: 4 }
  ];
  const spikeRing: V2[] = [[0, 0.24], [-0.07, 0.08], [-0.24, 0], [-0.07, -0.08], [0, -0.24], [0.07, -0.08], [0.24, 0], [0.07, 0.08]];
  for (const x of [-0.95, -0.48, 0, 0.48, 0.95]) {
    slots.push({
      mesh: transformMesh(extrudePolygonMesh(spikeRing, 0.05, 0.008, true), { pos: [x, 0, 0], rot: [0, Math.PI * 0.5, 0] }),
      materialIndex: 0
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.08, 0.3, 0.3, 0.01), { pos: [x, 0, 0] }),
      materialIndex: 1
    });
  }
  for (const x of [-0.72, 0.72]) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.1, 0.28, 0.28, 0.01), { pos: [x, 0, 0] }),
      materialIndex: 6
    });
  }
  return assembleMultiMaterialNode(`beam-${index}`, slots, WEAPON_PALETTE, { id: `beam-${index}`, castShadow: true, receiveShadow: true });
}

/** Forged 6-point tamahagane `shuriken` star (`shuriken-star-${i}`) spinning inside the Gale Star vortex. */
export function buildShurikenStarNode(index: number): GroupBuilder {
  const starPts: V2[] = [];
  const points = 6;
  for (let i = 0; i < points * 2; i += 1) {
    const a = (i / (points * 2)) * Math.PI * 2;
    const r = i % 2 === 0 ? 0.48 : 0.17;
    starPts.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  const slots: MultiMatSlot[] = [
    { mesh: transformMesh(extrudePolygonMesh(starPts, 0.05, 0.012, true), { rot: [Math.PI * 0.5, 0, 0] }), materialIndex: 0 },
    { mesh: latheMesh([[0.08, -0.035], [0.16, -0.035], [0.16, 0.035], [0.08, 0.035]], 12, true), materialIndex: 2 }
  ];
  return assembleMultiMaterialNode(`shuriken-star-${index}`, slots, WEAPON_PALETTE, {
    id: `shuriken-star-${index}`,
    castShadow: false,
    receiveShadow: false
  });
}

/** Multi-material spinning Shinobi Secret Scroll or Stamped Imperial Koban Coin pickup (`pickup-prop-${i}`). */
export function buildPickupPropNode(index: number, kind: "scroll" | "coin"): GroupBuilder {
  const slots: MultiMatSlot[] = [];
  if (kind === "scroll") {
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, -0.26], [0.085, -0.26], [0.085, 0.26], [0, 0.26]], 12, false),
        { rot: [0, 0, 0.42] }
      ),
      materialIndex: 8
    });
    for (const sy of [-0.28, 0.28]) {
      slots.push({
        mesh: transformMesh(
          latheMesh([[0, -0.03], [0.105, -0.03], [0.105, 0.03], [0, 0.03]], 12, true),
          { pos: [-Math.sin(0.42) * sy, Math.cos(0.42) * sy, 0], rot: [0, 0, 0.42] }
        ),
        materialIndex: 2
      });
    }
    slots.push({
      mesh: transformMesh(
        latheMesh([[0, -0.05], [0.096, -0.05], [0.096, 0.05], [0, 0.05]], 12, false),
        { rot: [0, 0, 0.42] }
      ),
      materialIndex: 7
    });
  } else {
    // Oval Sengoku `koban` gold coin with square `ryo` stamp boss & spirit glint
    const oval: V2[] = [];
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      oval.push([Math.cos(a) * 0.19, Math.sin(a) * 0.28]);
    }
    slots.push({ mesh: extrudePolygonMesh(oval, 0.045, 0.01, true), materialIndex: 2 });
    slots.push({ mesh: bevelBoxMesh(0.09, 0.09, 0.058, 0.008), materialIndex: 1 });
    slots.push({ mesh: bevelBoxMesh(0.04, 0.16, 0.054, 0.006), materialIndex: 7 });
  }
  return assembleMultiMaterialNode(`pickup-prop-${index}`, slots, WEAPON_PALETTE, {
    id: `pickup-prop-${index}`,
    castShadow: false,
    receiveShadow: false
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
    roughness: tint.roughness ?? (isHeavyArmor ? 0.64 : 0.72),
    metallic: tint.metallic ?? (isHeavyArmor ? 0.28 : 0.14),
    sheenColor,
    sheenRoughness: isMysticCloth ? 0.34 : 0.42,
    clearcoat: isHeavyArmor ? 0.24 : 0.12,
    clearcoatRoughness: isHeavyArmor ? 0.26 : 0.38,
    ...(evening ? {
      envMapIntensity: 1.08,
      rim: {
        color: stateKey === "clone" ? [0.45, 0.9, 1.0] : [1.0, 0.74, 0.48],
        power: 3.2,
        intensity: stateKey === "flash" ? 0.6 : 0.22
      }
    } : {})
  }];
}
