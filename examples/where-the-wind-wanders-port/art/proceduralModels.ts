/**
 * WP-27 — The Bellkeeper's Walk (`where-the-wind-wanders-port`) Procedural Multi-Material Art Module.
 *
 * Replaces all static Meshy scenery/prop GLBs with bespoke multi-material `@aura3d/engine` 5.5.1
 * pastoral highland sculptures built on `apps/showcase-port-shared/proceduralKernel.ts`, while
 * preserving the rigged `hero.glb` traveller (`skins=1`), exact chimney smoke world coordinates,
 * and deterministic valley simulation/placements. Zero `three` imports.
 */
import {
  geometry,
  group,
  instances,
  material,
  type AuraColor,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraTransformSpec,
  type scene
} from "@aura3d/engine";
import {
  archwayVoussoirSlots,
  assembleMultiMaterialNode,
  bevelBoxMesh,
  buildGroupedGeometrySpec,
  catmullRomSpline3,
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
  type TransformOpts,
  type V2,
  type V3,
  type V4
} from "../../../apps/showcase-port-shared/proceduralKernel";
import { STRUCTURES } from "../sim";
import { SEA_LEVEL, terrainHeight } from "../terrain";
import type { Scenery } from "../scenery";

type SceneBuilder = ReturnType<typeof scene>;
type AuraGroupNode = ReturnType<typeof group>["value"];

function unnamed(spec: AuraMaterialSpec): AuraMaterialSpec {
  const { name: _name, ...rest } = spec;
  return rest;
}

/** Material slot indices into `getHighlandMaterials()`. */
export const MAT = {
  STONE_LIGHT: 0,
  STONE_MOSS: 1,
  STONE_KEY: 2,
  LIMEWASH: 3,
  OAK_DARK: 4,
  TIMBER_WARM: 5,
  LACQUER_TRIM: 6,
  THATCH_ROOF: 7,
  SLATE_SHINGLE: 8,
  TERRACOTTA: 9,
  BRONZE_BELL: 10,
  IRON_FORGED: 11,
  BRASS_POLISHED: 12,
  LINEN_CLOTH: 13,
  SILK_ACCENT: 14,
  HEARTH_EMISSIVE: 15,
  RUNE_EMISSIVE: 16,
  FOLIAGE_OAK: 17,
  BARK_GNARLED: 18,
  HULL_TIMBER: 19
} as const;

let cachedHighlandMaterials: readonly AuraMaterialSpec[] | null = null;
let cachedMullionGlassMat: AuraMaterialSpec | null = null;
let cachedInstFloraMats: {
  readonly bark: AuraMaterialSpec;
  readonly pine: AuraMaterialSpec;
  readonly cypress: AuraMaterialSpec;
  readonly canopy: AuraMaterialSpec;
  readonly shrub: AuraMaterialSpec;
} | null = null;

/**
 * Pastoral highland multi-material library spanning 10 physical `@aura3d/engine` material presets:
 * `matteClay`, `ceramic`, `pbr`, `lacquer`, `brushedMetal`, `studioMetal`, `fabric`, `felt`,
 * `physical` (mullion/lantern glass), and `emissive` (`practical: true`).
 */
export function getHighlandMaterials(): readonly AuraMaterialSpec[] {
  return (cachedHighlandMaterials ??= [
    unnamed(material.matteClay({ color: "#b6af9b", roughness: 0.92, envMapIntensity: 0.65 })),
    unnamed(material.matteClay({ color: "#7f836c", roughness: 0.95, envMapIntensity: 0.58 })),
    unnamed(material.matteClay({ color: "#ccc0a0", roughness: 0.88, envMapIntensity: 0.72 })),
    unnamed(material.matteClay({ color: "#efe4c7", roughness: 0.9, envMapIntensity: 0.7 })),
    unnamed(material.pbr({ color: "#5f4329", roughness: 0.82, metallic: 0, envMapIntensity: 0.62 })),
    unnamed(material.pbr({ color: "#9d7549", roughness: 0.76, metallic: 0, envMapIntensity: 0.68 })),
    unnamed(material.lacquer({ color: "#842f24", roughness: 0.34, clearcoat: 0.78, clearcoatRoughness: 0.14, envMapIntensity: 1.05 })),
    unnamed(material.pbr({ color: "#a67b47", roughness: 0.94, metallic: 0, sheen: 0.28, sheenColor: "#d8ba84", sheenRoughness: 0.84, envMapIntensity: 0.52 })),
    unnamed(material.matteClay({ color: "#505c64", roughness: 0.8, envMapIntensity: 0.74 })),
    unnamed(material.ceramic({ color: "#b95b3c", roughness: 0.38, clearcoat: 0.42, clearcoatRoughness: 0.22, envMapIntensity: 0.88 })),
    unnamed(material.brushedMetal({ color: "#cfa255", roughness: 0.25, metallic: 0.94, anisotropy: 0.82, anisotropyRotation: 0, clearcoat: 0.14, clearcoatRoughness: 0.18, envMapIntensity: 1.55 })),
    unnamed(material.brushedMetal({ color: "#3d4247", roughness: 0.48, metallic: 0.88, anisotropy: 0.55, clearcoat: 0, envMapIntensity: 1.1 })),
    unnamed(material.studioMetal({ color: "#ecd18a", roughness: 0.18, metallic: 0.96, clearcoat: 0, envMapIntensity: 1.65 })),
    unnamed(material.fabric({ color: "#f3e8cc", roughness: 0.88, sheen: 0.58, sheenColor: "#fff8e6", sheenRoughness: 0.72, envMapIntensity: 0.55 })),
    unnamed(material.felt({ color: "#c94c38", roughness: 0.84, sheen: 0.82, sheenColor: "#ff9e84", sheenRoughness: 0.58, envMapIntensity: 0.48 })),
    unnamed(material.emissive({ color: "#ffd998", emissive: "#ffbf61", emissiveIntensity: 1.85, roughness: 0.26, practical: true })),
    unnamed(material.emissive({ color: "#9ee6d8", emissive: "#7fd8c8", emissiveIntensity: 1.32, roughness: 0.3, practical: true })),
    unnamed(material.pbr({ color: "#5f8f3e", roughness: 0.86, metallic: 0, sheen: 0.22, sheenColor: "#b8d96e", sheenRoughness: 0.82, envMapIntensity: 0.58 })),
    unnamed(material.pbr({ color: "#5b422b", roughness: 0.91, metallic: 0, envMapIntensity: 0.5 })),
    unnamed(material.pbr({ color: "#3b6883", roughness: 0.68, metallic: 0, clearcoat: 0.18, clearcoatRoughness: 0.35, envMapIntensity: 0.85 }))
  ]);
}

/** Warm translucent cottage-window & lantern pane glass (`castShadow: false` on every pane mesh). */
export function getMullionGlassMat(): AuraMaterialSpec {
  return (cachedMullionGlassMat ??= unnamed(
    material.physical({
      color: "#ffe9bc",
      roughness: 0.06,
      opacity: 0.48,
      clearcoat: 1,
      ior: 1.5
    })
  ));
}

/** Strictly `clearcoat: 0, sheen: 0` PBR materials for `>16` `instances.custom` flora batches. */
function getInstFloraMats() {
  return (cachedInstFloraMats ??= {
    bark: unnamed(material.pbr({ color: "#634830", roughness: 0.9, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.52 })),
    pine: unnamed(material.pbr({ color: "#3b6f3b", roughness: 0.86, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.56 })),
    cypress: unnamed(material.pbr({ color: "#2f5f44", roughness: 0.84, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.56 })),
    canopy: unnamed(material.pbr({ color: "#76a648", roughness: 0.85, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.58 })),
    shrub: unnamed(material.pbr({ color: "#58893c", roughness: 0.88, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.54 }))
  });
}

/** Upgraded woven-wool cloak & weathered leather sheen override for the rigged `hero.glb` traveller (`replaceTextures` unset). */
export const HERO_SHEEN_OVERRIDES = [
  {
    roughness: 0.76,
    sheen: 0.58,
    sheenColor: "#f6e0c2",
    sheenRoughness: 0.62,
    envMapIntensity: 0.88,
    rim: { color: "#ffebd0", power: 2.4, intensity: 0.74 }
  }
] as const;

function slot(mesh: RawMesh, materialIndex: number, xf?: TransformOpts): MultiMatSlot {
  return { mesh: xf ? transformMesh(mesh, xf) : mesh, materialIndex };
}

function buildGlassChildNode(name: string, panes: readonly RawMesh[], receiveShadow: boolean) {
  return geometry.custom(mergeRawMeshes(panes), {
    name,
    material: getMullionGlassMat(),
    castShadow: false,
    receiveShadow
  });
}

// ---------------------------------------------------------------------------
// 1. Wayside Bell Shrines & Sculpted Bronze Sanctuary Bell
// ---------------------------------------------------------------------------

export function createBellShrineBelfryNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly height?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const s = (opts.height ?? 4.6) / 4.6;
  const slots: MultiMatSlot[] = [];

  // Stepped ashlar plinth + worn approach flags
  slots.push(slot(bevelBoxMesh(3.15, 0.34, 2.85, 0.05), MAT.STONE_MOSS, { pos: [0, 0.17, 0] }));
  slots.push(slot(bevelBoxMesh(2.78, 0.32, 2.48, 0.045), MAT.STONE_LIGHT, { pos: [0, 0.48, 0] }));
  slots.push(slot(bevelBoxMesh(1.62, 0.2, 0.62, 0.035), MAT.STONE_KEY, { pos: [0, 0.1, 1.62] }));
  slots.push(slot(bevelBoxMesh(1.36, 0.22, 0.5, 0.035), MAT.STONE_LIGHT, { pos: [0, 0.28, 1.32] }));

  // Four corner masonry piers + chamfered stone caps + radial voussoir arches on front/back & sides
  for (const sx of [-1.02, 1.02]) {
    for (const sz of [-0.84, 0.84]) {
      slots.push(slot(bevelBoxMesh(0.48, 1.65, 0.48, 0.04), MAT.STONE_LIGHT, { pos: [sx, 1.44, sz] }));
      slots.push(slot(bevelBoxMesh(0.56, 0.14, 0.56, 0.03), MAT.STONE_KEY, { pos: [sx, 2.32, sz] }));
      slots.push(slot(bevelBoxMesh(0.28, 1.56, 0.28, 0.025), MAT.OAK_DARK, { pos: [sx, 3.16, sz] }));
      slots.push(slot(bevelBoxMesh(0.34, 0.09, 0.34, 0.015), MAT.IRON_FORGED, { pos: [sx, 2.44, sz] }));
    }
  }
  for (const sz of [-0.84, 0.84]) {
    for (const arch of archwayVoussoirSlots({
      radius: 0.78,
      thickness: 0.22,
      depth: 0.42,
      voussoirs: 9,
      stoneMatA: MAT.STONE_LIGHT,
      stoneMatB: MAT.STONE_MOSS,
      keystoneMat: MAT.STONE_KEY
    })) {
      slots.push(slot(arch.mesh, arch.materialIndex, { pos: [0, 2.34, sz] }));
    }
  }

  // Mortised oak belfry wall-plates, curved knee braces, and yoke crossbeam at [0.009, 3.804, 0.463]
  for (const sz of [-0.84, 0.84]) {
    slots.push(slot(bevelBoxMesh(2.44, 0.22, 0.3, 0.025), MAT.OAK_DARK, { pos: [0, 3.92, sz] }));
    for (const sx of [-1, 1]) {
      const brace = catmullRomSpline3([[sx * 0.96, 3.05, sz], [sx * 0.74, 3.52, sz], [sx * 0.42, 3.84, sz]], 5);
      slots.push(slot(tubeSweepMesh(brace.map(([x, y, z]) => [x, y, z, 0.068] as V4), 6, true), MAT.TIMBER_WARM));
    }
  }
  for (const sx of [-1.02, 1.02]) {
    slots.push(slot(bevelBoxMesh(0.3, 0.22, 2.08, 0.025), MAT.OAK_DARK, { pos: [sx, 3.92, 0] }));
  }
  // Yoke bearer beams flanking and supporting the bell pivot at [0.009, 3.804, 0.463]
  slots.push(slot(bevelBoxMesh(2.26, 0.2, 0.24, 0.025), MAT.OAK_DARK, { pos: [0.009, 3.92, 0.463] }));
  for (const sx of [-0.44, 0.44]) {
    slots.push(slot(bevelBoxMesh(0.12, 0.22, 0.26, 0.018), MAT.IRON_FORGED, { pos: [0.009 + sx, 3.83, 0.463] }));
  }

  // Flared multi-section riven-slate pagoda/hip roof + terracotta ridge + brass wind finial
  const roofSections: V3[][] = [
    [[-1.62, 3.96, -1.42], [1.62, 3.96, -1.42], [1.62, 3.96, 1.42], [-1.62, 3.96, 1.42]],
    [[-1.22, 4.2, -1.06], [1.22, 4.2, -1.06], [1.22, 4.2, 1.06], [-1.22, 4.2, 1.06]],
    [[-0.58, 4.48, -0.44], [0.58, 4.48, -0.44], [0.58, 4.48, 0.44], [-0.58, 4.48, 0.44]],
    [[-0.22, 4.6, -0.06], [0.22, 4.6, -0.06], [0.22, 4.6, 0.06], [-0.22, 4.6, 0.06]]
  ];
  slots.push(slot(loftSectionsMesh(roofSections, true, true), MAT.SLATE_SHINGLE));
  slots.push(slot(bevelBoxMesh(0.84, 0.11, 0.16, 0.025), MAT.TERRACOTTA, { pos: [0, 4.62, 0] }));
  const finial = latheMesh([[0, 0], [0.08, 0.03], [0.04, 0.14], [0.09, 0.24], [0.025, 0.38], [0, 0.46]], 12);
  slots.push(slot(finial, MAT.BRASS_POLISHED, { pos: [0, 4.64, 0] }));

  // Votive brass sanctuary lamp suspended beside the south-east pier
  const lampPos: V3 = [1.02, 2.74, 1.08];
  slots.push(slot(bevelBoxMesh(0.08, 0.08, 0.36, 0.015), MAT.IRON_FORGED, { pos: [1.02, 2.98, 0.94] }));
  slots.push(slot(latheMesh([[0, -0.14], [0.11, -0.1], [0.13, -0.05], [0.03, -0.04]], 8, true), MAT.BRASS_POLISHED, { pos: lampPos }));
  slots.push(slot(latheMesh([[0.03, 0.08], [0.15, 0.1], [0.08, 0.2], [0, 0.25]], 8, true), MAT.BRASS_POLISHED, { pos: lampPos }));
  slots.push(slot(icosphereFacetMesh(0.055, 1, 0.05, 7), MAT.HEARTH_EMISSIVE, { pos: [lampPos[0], lampPos[1] + 0.02, lampPos[2]] }));

  const lampPane = transformMesh(
    latheMesh([[0.095, -0.05], [0.115, 0.08]], 6, true),
    { pos: lampPos }
  );
  const body = assembleMultiMaterialNode(`${opts.name}-opaque`, slots, getHighlandMaterials(), {
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
  return group(
    opts.name,
    [body, buildGlassChildNode(`${opts.name}-glass`, [lampPane], opts.receiveShadow)],
    { position: opts.position, scale: s }
  );
}

/**
 * Sculpted patinated-bronze sanctuary bell centered at its yoke axle `[0, 0, 0]`:
 * flared sound-bow lip, waist inscription bands, arched crown canons, mortised oak
 * headstock, wrought-iron yoke straps, and suspended forged clapper.
 */
export function createSanctuaryBellNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly position: V3;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  // Oak yoke headstock & iron axle gudgeons + forged straps
  slots.push(slot(bevelBoxMesh(0.76, 0.16, 0.22, 0.022), MAT.OAK_DARK, { pos: [0, 0.02, 0] }));
  slots.push(slot(transformMesh(latheMesh([[0, -0.5], [0.038, -0.5], [0.038, 0.5], [0, 0.5]], 10), { rot: [0, 0, -Math.PI * 0.5] }), MAT.IRON_FORGED, { pos: [0, 0, 0] }));
  for (const sx of [-0.2, 0.2]) {
    slots.push(slot(bevelBoxMesh(0.065, 0.24, 0.25, 0.012), MAT.IRON_FORGED, { pos: [sx, -0.02, 0] }));
  }

  // Four swept bronze crown canons looping into the headstock
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * Math.PI * 2 + Math.PI * 0.25;
    const ca = Math.cos(a), sa = Math.sin(a);
    const canon = catmullRomSpline3([
      [ca * 0.14, -0.22, sa * 0.14],
      [ca * 0.18, -0.11, sa * 0.18],
      [ca * 0.07, -0.04, sa * 0.07]
    ], 5);
    slots.push(slot(tubeSweepMesh(canon.map(([x, y, z]) => [x, y, z, 0.028] as V4), 7), MAT.BRONZE_BELL));
  }

  // Revolved patinated-bronze bell shell (hollow mouth + thick resonant sound-bow)
  const bellProfile: V2[] = [
    [0.44, -0.96],
    [0.51, -0.98],
    [0.54, -0.93],
    [0.47, -0.84],
    [0.37, -0.68],
    [0.3, -0.48],
    [0.25, -0.31],
    [0.18, -0.22],
    [0, -0.19]
  ];
  slots.push(slot(latheMesh(bellProfile, 26), MAT.BRONZE_BELL));
  // Burnished brass sound-bow lip & raised inscription fillets
  slots.push(slot(latheMesh([[0.485, -0.975], [0.548, -0.94], [0.545, -0.905], [0.48, -0.88]], 26), MAT.BRASS_POLISHED));
  slots.push(slot(latheMesh([[0.302, -0.5], [0.318, -0.485], [0.318, -0.462], [0.298, -0.448]], 24), MAT.BRASS_POLISHED));
  slots.push(slot(latheMesh([[0.252, -0.33], [0.268, -0.318], [0.266, -0.298], [0.246, -0.286]], 24), MAT.BRASS_POLISHED));
  // Hollow dark interior throat + forged iron clapper rod & bronze strike ball
  slots.push(slot(latheMesh([[0, -0.3], [0.24, -0.52], [0.43, -0.95]], 18), MAT.IRON_FORGED));
  slots.push(slot(latheMesh([[0, -0.95], [0.026, -0.95], [0.022, -0.32], [0, -0.32]], 10), MAT.IRON_FORGED));
  slots.push(slot(icosphereFacetMesh(0.095, 1, 0.03, 19), MAT.BRASS_POLISHED, { pos: [0, -0.91, 0] }));

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    id: opts.id,
    position: opts.position,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

/** Pathside timber-and-stone wayside shrine housing a minor pilgrim bell and votive flame. */
export function createWaysideShrineNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly yaw?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push(slot(bevelBoxMesh(1.45, 0.28, 1.15, 0.04), MAT.STONE_MOSS, { pos: [0, 0.14, 0] }));
  slots.push(slot(bevelBoxMesh(1.18, 0.78, 0.88, 0.04), MAT.STONE_LIGHT, { pos: [0, 0.65, 0] }));
  slots.push(slot(bevelBoxMesh(1.28, 0.12, 0.98, 0.03), MAT.STONE_KEY, { pos: [0, 1.08, 0] }));
  for (const sx of [-0.44, 0.44]) {
    slots.push(slot(bevelBoxMesh(0.16, 1.05, 0.16, 0.02), MAT.OAK_DARK, { pos: [sx, 1.64, 0.24] }));
    slots.push(slot(bevelBoxMesh(0.16, 1.05, 0.16, 0.02), MAT.OAK_DARK, { pos: [sx, 1.64, -0.24] }));
  }
  for (const arch of archwayVoussoirSlots({
    radius: 0.34,
    thickness: 0.13,
    depth: 0.24,
    voussoirs: 7,
    stoneMatA: MAT.STONE_LIGHT,
    stoneMatB: MAT.STONE_MOSS,
    keystoneMat: MAT.STONE_KEY
  })) {
    slots.push(slot(arch.mesh, arch.materialIndex, { pos: [0, 1.72, 0.24] }));
  }
  const hood: V3[][] = [
    [[-0.78, 2.12, -0.58], [0.78, 2.12, -0.58], [0.78, 2.12, 0.58], [-0.78, 2.12, 0.58]],
    [[-0.48, 2.48, -0.44], [0.48, 2.48, -0.44], [0.48, 2.48, 0.44], [-0.48, 2.48, 0.44]],
    [[-0.08, 2.74, -0.34], [0.08, 2.74, -0.34], [0.08, 2.74, 0.34], [-0.08, 2.74, 0.34]]
  ];
  slots.push(slot(loftSectionsMesh(hood, true, true), MAT.SLATE_SHINGLE));
  slots.push(slot(latheMesh([[0.18, -0.34], [0.21, -0.31], [0.13, -0.14], [0.08, -0.04], [0, 0]], 18), MAT.BRONZE_BELL, { pos: [0, 2.02, 0] }));
  slots.push(slot(icosphereFacetMesh(0.045, 1, 0.04, 13), MAT.HEARTH_EMISSIVE, { pos: [0, 1.2, 0.18] }));

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    position: opts.position,
    rotation: [0, opts.yaw ?? 0, 0],
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

// ---------------------------------------------------------------------------
// 2. Stone-and-Thatch Highland Cottages (Exact Chimney Smoke Coord Preserved)
// ---------------------------------------------------------------------------

export function createHighlandCottageNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly yaw: number;
  readonly scale: number;
  readonly variant?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const s = opts.scale;
  const w = 7.2 * s;
  const d = 5.4 * s;
  const h = 3.6 * s;
  const baseH = 0.6 * s;
  const slots: MultiMatSlot[] = [];
  const panes: RawMesh[] = [];

  // Dressed fieldstone foundation plinth + corner stone quoins + limewash walls
  slots.push(slot(bevelBoxMesh(w + 0.34 * s, 0.72 * s, d + 0.34 * s, 0.05 * s), MAT.STONE_MOSS, { pos: [0, 0.32 * s, 0] }));
  slots.push(slot(bevelBoxMesh(w, h, d, 0.04 * s), MAT.LIMEWASH, { pos: [0, baseH + h * 0.5, 0] }));
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      for (let q = 0; q < 5; q += 1) {
        const qLong = q % 2 === 0;
        slots.push(slot(
          bevelBoxMesh((qLong ? 0.52 : 0.34) * s, 0.52 * s, (qLong ? 0.34 : 0.52) * s, 0.03 * s),
          q % 2 === 0 ? MAT.STONE_KEY : MAT.STONE_LIGHT,
          { pos: [sx * (w * 0.5 - 0.12 * s), baseH + (0.34 + q * 0.68) * s, sz * (d * 0.5 - 0.12 * s)] }
        ));
      }
      slots.push(slot(bevelBoxMesh(0.26 * s, h + 0.08 * s, 0.26 * s, 0.022 * s), MAT.OAK_DARK, { pos: [sx * w * 0.5, baseH + h * 0.5, sz * d * 0.5] }));
    }
  }
  // Timber wall-plates, mid-rail & gable limewash infill triangles
  slots.push(slot(bevelBoxMesh(w + 0.14 * s, 0.22 * s, d + 0.14 * s, 0.025 * s), MAT.OAK_DARK, { pos: [0, baseH + h - 0.04 * s, 0] }));
  slots.push(slot(bevelBoxMesh(w + 0.08 * s, 0.16 * s, d + 0.08 * s, 0.02 * s), MAT.TIMBER_WARM, { pos: [0, baseH + h * 0.54, 0] }));
  const gablePoly: V2[] = [[-d * 0.5, 0], [d * 0.5, 0], [0, 2.92 * s]];
  for (const sx of [-1, 1]) {
    slots.push(slot(
      extrudePolygonMesh(gablePoly, 0.26 * s, 0.02 * s, true),
      MAT.LIMEWASH,
      { pos: [sx * (w * 0.5 - 0.13 * s), baseH + h, 0], rot: [0, Math.PI * 0.5, 0] }
    ));
  }

  // Cambered overhanging heather-thatch gable roof (lofted across X with soft rolled eaves & ridge roll)
  const eaveY = baseH + h - 0.18 * s;
  const ridgeY = baseH + h + 3.04 * s;
  const roofProf: V2[] = [
    [-d * 0.5 - 0.58 * s, eaveY],
    [-d * 0.5 - 0.48 * s, eaveY + 0.36 * s],
    [-d * 0.24, eaveY + 1.88 * s],
    [0, ridgeY],
    [d * 0.24, eaveY + 1.88 * s],
    [d * 0.5 + 0.48 * s, eaveY + 0.36 * s],
    [d * 0.5 + 0.58 * s, eaveY],
    [0, baseH + h + 2.38 * s]
  ];
  const xSpan = w * 0.5 + 0.54 * s;
  const roofSections: V3[][] = [-1, -0.35, 0.35, 1].map((u) => {
    const sag = (1 - u * u) * -0.08 * s;
    return roofProf.map(([pz, py]) => [u * xSpan, py + sag, pz]);
  });
  slots.push(slot(loftSectionsMesh(roofSections, true, false), opts.variant === 1 ? MAT.SLATE_SHINGLE : MAT.THATCH_ROOF));
  slots.push(slot(bevelBoxMesh(xSpan * 2.02, 0.26 * s, 0.44 * s, 0.06 * s), MAT.TERRACOTTA, { pos: [0, ridgeY + 0.05 * s, 0] }));

  // Stepped masonry chimney stack + lathed terracotta chimney pot at exact local [0.28*w, 0.6*s + h + 3.9*s, -0.1*d]
  const cx = w * 0.28;
  const cz = -d * 0.1;
  const topY = baseH + h + 3.9 * s;
  slots.push(slot(bevelBoxMesh(1.06 * s, 2.55 * s, 1.06 * s, 0.045 * s), MAT.STONE_LIGHT, { pos: [cx, topY - 1.65 * s, cz] }));
  slots.push(slot(bevelBoxMesh(1.24 * s, 0.2 * s, 1.24 * s, 0.035 * s), MAT.STONE_KEY, { pos: [cx, topY - 0.42 * s, cz] }));
  const potProfile: V2[] = [
    [0.24 * s, -0.34 * s],
    [0.21 * s, -0.08 * s],
    [0.26 * s, -0.02 * s],
    [0.24 * s, 0],
    [0.17 * s, 0]
  ];
  slots.push(slot(latheMesh(potProfile, 16), MAT.TERRACOTTA, { pos: [cx, topY, cz] }));

  // Arched stone doorway + recessed planked oak door + brass ring + stone doorstep (+Z front face)
  const doorX = -w * 0.18;
  const frontZ = d * 0.5;
  slots.push(slot(bevelBoxMesh(1.88 * s, 0.24 * s, 1.04 * s, 0.04 * s), MAT.STONE_KEY, { pos: [doorX, 0.12 * s, frontZ + 0.52 * s] }));
  slots.push(slot(bevelBoxMesh(1.28 * s, 2.26 * s, 0.14 * s, 0.02 * s), MAT.TIMBER_WARM, { pos: [doorX, baseH + 1.13 * s, frontZ + 0.02 * s] }));
  for (const hy of [0.68, 1.68]) {
    slots.push(slot(bevelBoxMesh(0.72 * s, 0.08 * s, 0.06 * s, 0.01 * s), MAT.IRON_FORGED, { pos: [doorX - 0.22 * s, baseH + hy * s, frontZ + 0.09 * s] }));
  }
  slots.push(slot(icosphereFacetMesh(0.065 * s, 1, 0.02, 5), MAT.BRASS_POLISHED, { pos: [doorX + 0.38 * s, baseH + 1.1 * s, frontZ + 0.11 * s] }));
  for (const arch of archwayVoussoirSlots({
    radius: 0.64 * s,
    thickness: 0.2 * s,
    depth: 0.24 * s,
    voussoirs: 7,
    stoneMatA: MAT.STONE_LIGHT,
    stoneMatB: MAT.STONE_MOSS,
    keystoneMat: MAT.STONE_KEY
  })) {
    slots.push(slot(arch.mesh, arch.materialIndex, { pos: [doorX, baseH + 1.92 * s, frontZ + 0.06 * s] }));
  }

  // Mullioned cottage windows (+Z front & +X gable): warm practical hearth backplate + oak mullions + physical glass + flowerboxes
  for (const wx of [w * 0.18, w * 0.36]) {
    const wy = baseH + 1.68 * s;
    slots.push(slot(bevelBoxMesh(0.92 * s, 1.04 * s, 0.06 * s, 0.01 * s), MAT.HEARTH_EMISSIVE, { pos: [wx, wy, frontZ - 0.01 * s] }));
    slots.push(slot(bevelBoxMesh(1.12 * s, 0.1 * s, 0.16 * s, 0.015 * s), MAT.OAK_DARK, { pos: [wx, wy, frontZ + 0.05 * s] }));
    slots.push(slot(bevelBoxMesh(0.09 * s, 1.16 * s, 0.16 * s, 0.015 * s), MAT.OAK_DARK, { pos: [wx, wy, frontZ + 0.05 * s] }));
    slots.push(slot(bevelBoxMesh(1.18 * s, 0.12 * s, 0.22 * s, 0.02 * s), MAT.STONE_KEY, { pos: [wx, wy + 0.6 * s, frontZ + 0.06 * s] }));
    slots.push(slot(bevelBoxMesh(1.16 * s, 0.28 * s, 0.34 * s, 0.025 * s), MAT.TIMBER_WARM, { pos: [wx, baseH + 1.02 * s, frontZ + 0.2 * s] }));
    for (let k = 0; k < 3; k += 1) {
      slots.push(slot(
        icosphereFacetMesh(0.14 * s, 1, 0.12, 31 + k * 7),
        k % 2 === 0 ? MAT.SILK_ACCENT : MAT.FOLIAGE_OAK,
        { pos: [wx + (k - 1) * 0.32 * s, baseH + 1.24 * s, frontZ + 0.21 * s] }
      ));
    }
    panes.push(transformMesh(bevelBoxMesh(0.96 * s, 1.08 * s, 0.04 * s, 0.005 * s), { pos: [wx, wy, frontZ + 0.04 * s] }));
  }
  // Climbing gable ivy clusters
  slots.push(slot(layeredCanopyMesh({ radius: 0.62 * s, height: 1.45 * s, puffs: 6, seed: 41 }), MAT.FOLIAGE_OAK, { pos: [w * 0.44, baseH + 0.85 * s, frontZ + 0.14 * s] }));

  const body = assembleMultiMaterialNode(`${opts.name}-opaque`, slots, getHighlandMaterials(), {
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
  return group(
    opts.name,
    [body, buildGlassChildNode(`${opts.name}-glass`, panes, opts.receiveShadow)],
    { position: opts.position, rotation: [0, opts.yaw, 0] }
  );
}

// ---------------------------------------------------------------------------
// 3. Creaking Wooden Windmill & Billowed Linen Sails
// ---------------------------------------------------------------------------

export function createWindmillTowerNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  const panes: RawMesh[] = [];

  // Battered circular ashlar & fieldstone base (0..4.5 m) + stone portal arch
  slots.push(slot(latheMesh([[4.16, 0], [4.08, 0.55], [3.9, 2.3], [3.68, 4.5], [3.4, 4.52]], 22), MAT.STONE_LIGHT));
  slots.push(slot(latheMesh([[4.24, 0], [4.18, 0.38], [4.08, 0.42]], 22), MAT.STONE_MOSS));
  slots.push(slot(bevelBoxMesh(1.86, 2.75, 0.24, 0.03), MAT.OAK_DARK, { pos: [0, 1.38, 3.84] }));
  for (const arch of archwayVoussoirSlots({
    radius: 0.94,
    thickness: 0.28,
    depth: 0.34,
    voussoirs: 9,
    stoneMatA: MAT.STONE_LIGHT,
    stoneMatB: MAT.STONE_MOSS,
    keystoneMat: MAT.STONE_KEY
  })) {
    slots.push(slot(arch.mesh, arch.materialIndex, { pos: [0, 2.72, 3.84] }));
  }

  // Cantilevered timber reefing gallery (y = 4.5..5.78 m), balusters & timber stair flight
  slots.push(slot(latheMesh([[3.55, 4.48], [4.76, 4.5], [4.76, 4.72], [3.5, 4.74]], 22), MAT.TIMBER_WARM));
  slots.push(slot(latheMesh([[4.6, 5.66], [4.76, 5.66], [4.76, 5.8], [4.6, 5.8]], 22), MAT.OAK_DARK));
  for (let i = 0; i < 18; i += 1) {
    const a = (i / 18) * Math.PI * 2;
    const ca = Math.cos(a), sa = Math.sin(a);
    slots.push(slot(latheMesh([[0.055, 0], [0.065, 0.5], [0.05, 0.98]], 6, true), MAT.OAK_DARK, { pos: [ca * 4.66, 4.72, sa * 4.66] }));
    if (i % 3 === 0) {
      const strut = catmullRomSpline3([[ca * 3.68, 3.85, sa * 3.68], [ca * 4.18, 4.24, sa * 4.18], [ca * 4.58, 4.5, sa * 4.58]], 4);
      slots.push(slot(tubeSweepMesh(strut.map(([x, y, z]) => [x, y, z, 0.08] as V4), 5, true), MAT.OAK_DARK));
    }
  }
  for (let i = 0; i < 8; i += 1) {
    const sx = 4.35 + i * 0.42;
    const sy = 4.42 - i * 0.55;
    slots.push(slot(bevelBoxMesh(0.58, 0.12, 1.14, 0.018), MAT.TIMBER_WARM, { pos: [sx, sy, 1.9] }));
    if (i % 2 === 0) {
      slots.push(slot(bevelBoxMesh(0.11, sy + 0.65, 0.11, 0.015), MAT.OAK_DARK, { pos: [sx, (sy + 0.45) * 0.5, 2.42] }));
    }
  }

  // Tapered larch smock-mill body (4.4..13.8 m) + forged iron tension hoops + mullioned casements
  slots.push(slot(latheMesh([[3.62, 4.42], [3.22, 8.2], [2.72, 12.2], [2.46, 13.85]], 16, true), MAT.TIMBER_WARM));
  for (const [hy, hr] of [[6.2, 3.44], [8.8, 3.14], [11.4, 2.83]] as const) {
    slots.push(slot(latheMesh([[hr, hy], [hr + 0.07, hy + 0.03], [hr + 0.07, hy + 0.19], [hr, hy + 0.22]], 20), MAT.IRON_FORGED));
  }
  for (const [wy, ww] of [[7.0, 0.98], [9.4, 0.88], [11.8, 0.78]] as const) {
    const rz = 3.6 - (wy - 4.4) * 0.12 - 0.06;
    slots.push(slot(bevelBoxMesh(ww * 0.92, ww * 1.22, 0.08, 0.01), MAT.HEARTH_EMISSIVE, { pos: [0, wy, rz - 0.04] }));
    slots.push(slot(bevelBoxMesh(ww + 0.28, 0.12, 0.18, 0.018), MAT.OAK_DARK, { pos: [0, wy, rz + 0.05] }));
    slots.push(slot(bevelBoxMesh(0.1, ww * 1.44, 0.18, 0.018), MAT.OAK_DARK, { pos: [0, wy, rz + 0.05] }));
    panes.push(transformMesh(bevelBoxMesh(ww, ww * 1.3, 0.05, 0.006), { pos: [0, wy, rz + 0.02] }));
  }

  // Ogee shingled wooden cap (13.7..17.8 m), windshaft housing snout & brass weathervane
  slots.push(slot(latheMesh([[2.62, 13.72], [3.08, 14.02], [2.56, 15.32], [1.38, 16.62], [0.36, 17.52], [0, 17.85]], 20), MAT.OAK_DARK));
  slots.push(slot(bevelBoxMesh(0.74, 0.74, 1.45, 0.04), MAT.OAK_DARK, { pos: [0, 14.7, 2.38] }));
  slots.push(slot(latheMesh([[0, 17.82], [0.22, 17.95], [0.06, 18.22], [0.14, 18.42], [0, 18.68]], 12), MAT.BRASS_POLISHED));
  slots.push(slot(bevelBoxMesh(0.04, 0.18, 0.95, 0.008), MAT.BRASS_POLISHED, { pos: [0, 18.52, 0.12] }));

  const body = assembleMultiMaterialNode(`${opts.name}-opaque`, slots, getHighlandMaterials(), {
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
  return group(
    opts.name,
    [body, buildGlassChildNode(`${opts.name}-glass`, panes, opts.receiveShadow)],
    { position: opts.position }
  );
}

/** Multi-material windmill sail assembly (`id: "sails"`) with mortised oak stocks, whip lattice & billowed linen sails. */
export function createWindmillSailsNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly position: V3;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  // Iron-hooped oak poll-end canister hub
  slots.push(slot(transformMesh(latheMesh([[0, -0.45], [0.46, -0.42], [0.52, 0], [0.46, 0.42], [0, 0.48]], 14), { rot: [Math.PI * 0.5, 0, 0] }), MAT.OAK_DARK, { pos: [0, 0, 0.06] }));
  slots.push(slot(transformMesh(latheMesh([[0.47, -0.22], [0.55, -0.18], [0.55, 0.18], [0.47, 0.22]], 14), { rot: [Math.PI * 0.5, 0, 0] }), MAT.IRON_FORGED, { pos: [0, 0, 0.08] }));
  slots.push(slot(icosphereFacetMesh(0.22, 1, 0.02, 9), MAT.BRASS_POLISHED, { pos: [0, 0, 0.56] }));

  for (let i = 0; i < 4; i += 1) {
    const ang = (i * Math.PI) / 2;
    const armSlots: MultiMatSlot[] = [];
    // Tapered main oak stock (x = 0.35..11.0) + outer & inner hemlock rails + 6 sailbars
    armSlots.push(slot(bevelBoxMesh(10.65, 0.28, 0.22, 0.025), MAT.OAK_DARK, { pos: [5.68, 0, 0.06] }));
    armSlots.push(slot(bevelBoxMesh(8.3, 0.12, 0.1, 0.015), MAT.TIMBER_WARM, { pos: [6.72, 0.34, 0.05] }));
    armSlots.push(slot(bevelBoxMesh(8.3, 0.12, 0.1, 0.015), MAT.TIMBER_WARM, { pos: [6.72, 2.88, 0.05] }));
    armSlots.push(slot(bevelBoxMesh(8.3, 0.26, 0.05, 0.01), MAT.TIMBER_WARM, { pos: [6.72, -0.2, 0.08], rot: [0.22, 0, 0] }));
    for (let k = 0; k < 6; k += 1) {
      const bx = 2.62 + k * 1.64;
      armSlots.push(slot(bevelBoxMesh(0.09, 2.62, 0.09, 0.012), MAT.OAK_DARK, { pos: [bx, 1.6, 0.05] }));
    }
    // Cambered billowed woven-linen sail sheet (`loftSectionsMesh` with aerodynamic twist & belly)
    const sailStations: V3[][] = [0, 0.33, 0.67, 1].map((u) => {
      const sx = 2.72 + u * 8.02;
      const twist = (1 - u * 0.45) * 0.16;
      const belly = Math.sin(u * Math.PI) * 0.14 + 0.08;
      return [
        [sx, 0.4, 0.04],
        [sx, 1.22, 0.04 + belly],
        [sx, 2.08, 0.04 + belly * 0.92 - twist * 0.4],
        [sx, 2.82, 0.02 - twist],
        [sx, 2.08, -0.01 + belly * 0.92 - twist * 0.4],
        [sx, 1.22, -0.01 + belly]
      ];
    });
    armSlots.push(slot(loftSectionsMesh(sailStations, true, false), MAT.LINEN_CLOTH));

    for (const sItem of armSlots) {
      slots.push(slot(sItem.mesh, sItem.materialIndex, { rot: [0, 0, ang] }));
    }
  }

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    id: opts.id,
    position: opts.position,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

// ---------------------------------------------------------------------------
// 4. Arched Stone Packhorse Bridge, Dry-Stone Walls, Rune Cairns & Lanterns
// ---------------------------------------------------------------------------

export function createPackhorseBridgeNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly yaw: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  // Radial masonry arch spanning X in [-2.1, +2.1], extruded across bridge width Z in [-1.15, +1.15]
  for (const v of archwayVoussoirSlots({
    radius: 1.75,
    thickness: 0.36,
    depth: 2.28,
    voussoirs: 13,
    stoneMatA: MAT.STONE_LIGHT,
    stoneMatB: MAT.STONE_MOSS,
    keystoneMat: MAT.STONE_KEY
  })) {
    slots.push(slot(v.mesh, v.materialIndex, { pos: [0, 0.12, 0] }));
  }

  // Flared stone abutments & triangular upstream/downstream cutwaters
  for (const sx of [-2.45, 2.45]) {
    slots.push(slot(bevelBoxMesh(1.28, 1.15, 2.52, 0.05), MAT.STONE_MOSS, { pos: [sx, 0.52, 0] }));
  }
  const deckX = [-3.2, -1.9, -0.9, 0, 0.9, 1.9, 3.2];
  const deckSections: V3[][] = deckX.map((px) => {
    const camber = Math.max(0, 1 - (px / 3.3) ** 2) * 1.18 + 0.92;
    return [
      [px, camber - 0.24, -1.16],
      [px, camber, -1.12],
      [px, camber + 0.04, 0],
      [px, camber, 1.12],
      [px, camber - 0.24, 1.16]
    ];
  });
  slots.push(slot(loftSectionsMesh(deckSections, true, true), MAT.STONE_KEY));

  // Low battered rubble parapets + dressed sandstone coping stones on both flanks
  for (const sz of [-1.04, 1.04]) {
    const wallSections: V3[][] = deckX.map((px) => {
      const camber = Math.max(0, 1 - (px / 3.3) ** 2) * 1.18 + 0.92;
      return [
        [px, camber - 0.06, sz - 0.14],
        [px, camber + 0.48, sz - 0.11],
        [px, camber + 0.52, sz],
        [px, camber + 0.48, sz + 0.11],
        [px, camber - 0.06, sz + 0.14]
      ];
    });
    slots.push(slot(loftSectionsMesh(wallSections, true, true), MAT.STONE_LIGHT));
  }

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    position: opts.position,
    rotation: [0, opts.yaw, 0],
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

export function createDryStoneWallNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly length: number;
  readonly yaw?: number;
  readonly seed?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const len = opts.length;
  const seed = opts.seed ?? 101;
  const slots: MultiMatSlot[] = [];
  const xs = [-len * 0.5, -len * 0.18, len * 0.18, len * 0.5];
  const wallSec: V3[][] = xs.map((px, i) => {
    const und = (hash01(seed + i * 13) - 0.5) * 0.06;
    return [
      [px, -0.08, -0.3],
      [px, 0.78 + und, -0.2],
      [px, 0.86 + und, 0],
      [px, 0.78 + und, 0.2],
      [px, -0.08, 0.3]
    ];
  });
  slots.push(slot(loftSectionsMesh(wallSec, true, true), MAT.STONE_MOSS));
  const copes = Math.max(5, Math.round(len / 0.42));
  for (let i = 0; i < copes; i += 1) {
    const px = -len * 0.46 + (i / Math.max(1, copes - 1)) * len * 0.92;
    const r = 0.17 + hash01(seed * 7 + i * 19) * 0.07;
    slots.push(slot(
      icosphereFacetMesh(r, 1, 0.18, seed + i * 29),
      i % 3 === 0 ? MAT.STONE_KEY : MAT.STONE_LIGHT,
      { pos: [px, 0.92, (hash01(seed + i * 5) - 0.5) * 0.05], scale: [0.88, 1.18, 1.05] }
    ));
  }
  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    position: opts.position,
    rotation: [0, opts.yaw ?? 0, 0],
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

export function createRuneStoneCairnNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly scale?: number;
  readonly yaw?: number;
  readonly seed?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const s = opts.scale ?? 1;
  const seed = opts.seed ?? 53;
  const slots: MultiMatSlot[] = [];

  // Standing Highland monolith sculpted via stratifiedCliffMesh + carved glowing wind-rune inlays
  slots.push(slot(
    stratifiedCliffMesh({ radiusX: 0.62 * s, radiusZ: 0.36 * s, height: 3.15 * s, terraces: 6, seed }),
    MAT.STONE_LIGHT
  ));
  slots.push(slot(
    stratifiedCliffMesh({ radiusX: 0.95 * s, radiusZ: 0.82 * s, height: 0.68 * s, terraces: 3, seed: seed + 11 }),
    MAT.STONE_MOSS,
    { pos: [-0.72 * s, 0, 0.25 * s] }
  ));
  // Stacked pilgrim cairn beside the monolith
  for (let k = 0; k < 4; k += 1) {
    const r = (0.42 - k * 0.075) * s;
    slots.push(slot(
      icosphereFacetMesh(r, 1, 0.16, seed + 30 + k * 9),
      k % 2 === 0 ? MAT.STONE_KEY : MAT.STONE_MOSS,
      { pos: [0.86 * s, (0.2 + k * 0.34) * s, -0.14 * s], scale: [1.18, 0.62, 1.04] }
    ));
  }
  // Swept turquoise wind-rune spiral inlay on the front (+Z) stone face
  const runeCurve = catmullRomSpline3([
    [-0.14 * s, 1.18 * s, 0.33 * s],
    [0.14 * s, 1.52 * s, 0.34 * s],
    [-0.1 * s, 1.92 * s, 0.32 * s],
    [0.08 * s, 2.26 * s, 0.29 * s]
  ], 6);
  slots.push(slot(tubeSweepMesh(runeCurve.map(([x, y, z]) => [x, y, z, 0.026 * s] as V4), 6), MAT.RUNE_EMISSIVE));

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    position: opts.position,
    rotation: [0, opts.yaw ?? 0, 0],
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

/** Brass-and-glass wayside & jetty lantern (`flameOffset = [0, 2.2, 0]` aligns with `sc.lanterns`). */
export function createWaysideLanternNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly yaw?: number;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  // Stone collar + chamfered oak post + wrought-iron shepherd's crook arm
  slots.push(slot(latheMesh([[0.24, 0], [0.22, 0.24], [0.15, 0.28]], 10, true), MAT.STONE_MOSS));
  slots.push(slot(bevelBoxMesh(0.16, 2.18, 0.16, 0.022), MAT.OAK_DARK, { pos: [0, 1.12, 0] }));
  const crook = catmullRomSpline3([
    [0, 1.92, -0.02],
    [0, 2.38, -0.08],
    [0, 2.58, 0.02],
    [0, 2.48, 0.12]
  ], 6);
  slots.push(slot(tubeSweepMesh(crook.map(([x, y, z]) => [x, y, z, 0.024] as V4), 7), MAT.IRON_FORGED));

  // Suspended brass lantern cage centered at [0, 2.2, 0] (jetty candle height = deckY + 2.2)
  const lx = 0, ly = 2.2, lz = 0.12;
  slots.push(slot(latheMesh([[0, -0.2], [0.14, -0.17], [0.16, -0.12], [0.04, -0.11]], 6, true), MAT.BRASS_POLISHED, { pos: [lx, ly, lz] }));
  slots.push(slot(latheMesh([[0.04, 0.12], [0.18, 0.14], [0.1, 0.24], [0.03, 0.28], [0, 0.31]], 6, true), MAT.BRASS_POLISHED, { pos: [lx, ly, lz] }));
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    slots.push(slot(
      bevelBoxMesh(0.018, 0.26, 0.018, 0.003),
      MAT.BRASS_POLISHED,
      { pos: [lx + Math.cos(a) * 0.135, ly, lz + Math.sin(a) * 0.135] }
    ));
  }
  slots.push(slot(icosphereFacetMesh(0.055, 1, 0.04, 23), MAT.HEARTH_EMISSIVE, { pos: [lx, ly - 0.01, lz] }));

  const pane = transformMesh(latheMesh([[0.115, -0.12], [0.132, 0.12]], 6, true), { pos: [lx, ly, lz] });
  const body = assembleMultiMaterialNode(`${opts.name}-opaque`, slots, getHighlandMaterials(), {
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
  return group(
    opts.name,
    [body, buildGlassChildNode(`${opts.name}-glass`, [pane], opts.receiveShadow)],
    { position: opts.position, rotation: [0, opts.yaw ?? 0, 0] }
  );
}

// ---------------------------------------------------------------------------
// 5. Ancient Wind-Bent Oaks, Scots Pines, Highland Cypresses & Shrubs
// ---------------------------------------------------------------------------

export function createGrandAncientOakNode(opts: {
  readonly name: string;
  readonly position: V3;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];

  // Buttressed ancient trunk + 5 swept surface roots + 6 downwind-leaning gnarled boughs
  slots.push(slot(latheMesh([[2.55, 0], [1.92, 0.72], [1.46, 2.25], [1.18, 4.55], [0.92, 5.9]], 16), MAT.BARK_GNARLED));
  for (let i = 0; i < 5; i += 1) {
    const a = i * 1.256 + 0.22;
    const ca = Math.cos(a), sa = Math.sin(a);
    const rootPts = catmullRomSpline3([[ca * 1.35, 1.1, sa * 1.35], [ca * 2.45, 0.36, sa * 2.45], [ca * 3.45, -0.05, sa * 3.45]], 5);
    slots.push(slot(tubeSweepMesh(rootPts.map(([x, y, z], k) => [x, y, z, 0.44 - k * 0.024] as V4), 7), MAT.BARK_GNARLED));
  }
  const boughCrownCenters: V3[] = [[0.4, 9.6, -0.2]];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2 + 0.35;
    const windLeanX = 0.85;
    const tx = Math.cos(a) * 4.5 + windLeanX;
    const tz = Math.sin(a) * 4.1 - 0.35;
    const ty = 7.5 + (i % 2) * 0.85;
    const boughPts = catmullRomSpline3([[Math.cos(a) * 0.65, 4.7, Math.sin(a) * 0.65], [tx * 0.56, 6.45, tz * 0.56], [tx, ty, tz]], 6);
    slots.push(slot(tubeSweepMesh(boughPts.map(([x, y, z], k) => [x, y, z, 0.52 - k * 0.022] as V4), 7), MAT.BARK_GNARLED));
    boughCrownCenters.push([tx * 1.06, ty + 0.45, tz * 1.06]);
  }
  for (let i = 0; i < boughCrownCenters.length; i += 1) {
    const c = boughCrownCenters[i]!;
    const isApex = i === 0;
    slots.push(slot(
      layeredCanopyMesh({ radius: isApex ? 4.4 : 3.35, height: isApex ? 4.3 : 3.2, puffs: isApex ? 11 : 8, seed: 71 + i * 19 }),
      MAT.FOLIAGE_OAK,
      { pos: [c[0], c[1] - (isApex ? 1.2 : 0.9), c[2]] }
    ));
  }

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    position: opts.position,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

let cachedFloraSpecs: {
  readonly pineTrunk: AuraCustomGeometrySpec;
  readonly pineBoughs: AuraCustomGeometrySpec;
  readonly cypressTrunk: AuraCustomGeometrySpec;
  readonly cypressBoughs: AuraCustomGeometrySpec;
  readonly oakTrunk: AuraCustomGeometrySpec;
  readonly oakCanopy: AuraCustomGeometrySpec;
  readonly shrub: AuraCustomGeometrySpec;
} | null = null;

function getFloraSpecs() {
  if (cachedFloraSpecs) return cachedFloraSpecs;

  // Normalized to 6.0 m total tree height (`models.ts` scales each placement by `(p.h ?? 6) / 6`)
  const pineSpine = catmullRomSpline3([[0, 0, 0], [0.06, 1.35, -0.02], [0.16, 2.85, -0.05], [0.22, 4.6, -0.07]], 5);
  const pineTrunk = mergeRawMeshes([tubeSweepMesh(pineSpine.map(([x, y, z], i) => [x, y, z, 0.24 - i * 0.011] as V4), 7)]);
  const pineBoughs = mergeRawMeshes([
    transformMesh(coniferBoughTierMesh({ baseRadius: 1.58, height: 4.85, tiers: 5, seed: 37 }), { pos: [0.14, 1.15, -0.04], rot: [0, 0, -0.045] })
  ]);

  // Slender wind-bent Highland cypress (`6.0 m` spire)
  const cypSpine = catmullRomSpline3([[0, 0, 0], [0.04, 1.6, 0], [0.11, 3.6, -0.03], [0.16, 5.1, -0.04]], 5);
  const cypressTrunk = mergeRawMeshes([tubeSweepMesh(cypSpine.map(([x, y, z], i) => [x, y, z, 0.18 - i * 0.008] as V4), 6)]);
  const cypressBoughs = mergeRawMeshes([
    transformMesh(coniferBoughTierMesh({ baseRadius: 0.92, height: 5.25, tiers: 7, seed: 83 }), { pos: [0.1, 0.75, -0.02], rot: [0, 0, -0.035] })
  ]);

  // Wind-bent meadow oak/birch (`6.0 m` total height: forked swept trunk + multi-puff crown)
  const oakMain = catmullRomSpline3([[0, 0, 0], [0.08, 1.15, -0.02], [0.24, 2.45, -0.06], [0.58, 3.45, -0.12]], 5);
  const oakFork = catmullRomSpline3([[0.16, 1.85, -0.04], [-0.38, 2.75, 0.16], [-0.66, 3.4, 0.24]], 4);
  const oakTrunk = mergeRawMeshes([
    tubeSweepMesh(oakMain.map(([x, y, z], i) => [x, y, z, 0.28 - i * 0.012] as V4), 7),
    tubeSweepMesh(oakFork.map(([x, y, z], i) => [x, y, z, 0.17 - i * 0.01] as V4), 6)
  ]);
  const oakCanopy = mergeRawMeshes([
    transformMesh(layeredCanopyMesh({ radius: 2.05, height: 3.15, puffs: 9, seed: 61 }), { pos: [0.18, 2.78, -0.03] })
  ]);

  // Normalized `1.2 m` Highland heather/gorse shrub mound
  const shrub = mergeRawMeshes([
    layeredCanopyMesh({ radius: 0.78, height: 1.18, puffs: 7, seed: 109 })
  ]);

  cachedFloraSpecs = { pineTrunk, pineBoughs, cypressTrunk, cypressBoughs, oakTrunk, oakCanopy, shrub };
  return cachedFloraSpecs;
}

export function addProceduralFloraBatches(
  builder: SceneBuilder,
  sc: Scenery,
  castShadow: boolean,
  receiveShadow: boolean
): void {
  const specs = getFloraSpecs();
  const floraMats = getInstFloraMats();
  const toXf = (x: number, y: number, z: number, yaw: number, scVal: number): AuraTransformSpec => ({
    position: [x, y, z],
    rotation: [0, yaw, 0],
    scale: [scVal, scVal, scVal]
  });

  const scotsPines = sc.placements.pines.filter((p) => (p.variant ?? 0) === 0);
  const cypresses = sc.placements.pines.filter((p) => (p.variant ?? 0) !== 0);

  if (scotsPines.length > 0) {
    const xfs = scotsPines.map((p) => toXf(p.x, p.y, p.z, p.yaw, (p.h ?? 6) / 6));
    const cols: AuraColor[] = scotsPines.map((_, i) => (i % 3 === 0 ? "#4d8542" : i % 3 === 1 ? "#3a6e3b" : "#568c4c"));
    builder.add(instances.custom(specs.pineTrunk, { name: "pines-trunks", material: floraMats.bark, transforms: xfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.pineBoughs, { name: "pines", material: floraMats.pine, transforms: xfs, colors: cols, castShadow, receiveShadow }));
  }
  if (cypresses.length > 0) {
    const xfs = cypresses.map((p) => toXf(p.x, p.y, p.z, p.yaw, (p.h ?? 6) / 6));
    const cols: AuraColor[] = cypresses.map((_, i) => (i % 2 === 0 ? "#356a4f" : "#447c5d"));
    builder.add(instances.custom(specs.cypressTrunk, { name: "cypress-trunks", material: floraMats.bark, transforms: xfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.cypressBoughs, { name: "cypresses", material: floraMats.cypress, transforms: xfs, colors: cols, castShadow, receiveShadow }));
  }
  if (sc.placements.oaks.length > 0) {
    const xfs = sc.placements.oaks.map((p) => toXf(p.x, p.y, p.z, p.yaw, (p.h ?? 6) / 6));
    const barkCols: AuraColor[] = sc.placements.oaks.map((p) => (p.variant === 1 ? "#cfc6b2" : "#664a31"));
    const leafCols: AuraColor[] = sc.placements.oaks.map((p) =>
      p.variant === 2 ? "#c7a348" : p.variant === 1 ? "#8fbe52" : "#6c9e42"
    );
    builder.add(instances.custom(specs.oakTrunk, { name: "oaks-trunks", material: floraMats.bark, transforms: xfs, colors: barkCols, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.oakCanopy, { name: "oaks", material: floraMats.canopy, transforms: xfs, colors: leafCols, castShadow, receiveShadow }));
  }
  if (sc.placements.shrubs.length > 0) {
    const xfs = sc.placements.shrubs.map((p) => toXf(p.x, p.y, p.z, p.yaw, p.s));
    const shrubCols: AuraColor[] = sc.placements.shrubs.map((_, i) => (i % 3 === 0 ? "#6a9946" : i % 3 === 1 ? "#4f8138" : "#809848"));
    builder.add(instances.custom(specs.shrub, { name: "shrubs", material: floraMats.shrub, transforms: xfs, colors: shrubCols, castShadow, receiveShadow }));
  }
}

// ---------------------------------------------------------------------------
// 6. Interactive Relics (Letters, Swallowtail Kite, Wisp) & Clinker Boat
// ---------------------------------------------------------------------------

export function createSealedLetterNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push(slot(bevelBoxMesh(0.76, 0.5, 0.048, 0.012), MAT.LINEN_CLOTH));
  const flapPoly: V2[] = [[-0.37, 0.24], [0.37, 0.24], [0, -0.04]];
  slots.push(slot(extrudePolygonMesh(flapPoly, 0.018, 0.004, true), MAT.LINEN_CLOTH, { pos: [0, 0, 0.026] }));
  slots.push(slot(bevelBoxMesh(0.78, 0.045, 0.056, 0.006), MAT.SILK_ACCENT));
  slots.push(slot(transformMesh(latheMesh([[0, -0.012], [0.092, -0.012], [0.098, 0.008], [0.072, 0.02], [0, 0.016]], 14), { rot: [Math.PI * 0.5, 0, 0] }), MAT.LACQUER_TRIM, { pos: [0, -0.02, 0.036] }));
  slots.push(slot(icosphereFacetMesh(0.032, 1, 0.02, 17), MAT.BRASS_POLISHED, { pos: [0, -0.02, 0.052], scale: [1, 1, 0.35] }));

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    id: opts.id,
    castShadow: false,
    receiveShadow: opts.receiveShadow
  });
}

export function createSwallowtailKiteNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly castShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  // Bowed bamboo cross-spar & spine + brass bridle ring at [0, -0.1, 0.04]
  const spar = catmullRomSpline3([[-0.66, 0.22, -0.08], [0, 0.26, 0.04], [0.66, 0.22, -0.08]], 6);
  const spine = catmullRomSpline3([[0, -0.58, -0.02], [0, 0.05, 0.03], [0, 0.62, 0]], 5);
  slots.push(slot(tubeSweepMesh(spar.map(([x, y, z]) => [x, y, z, 0.016] as V4), 6), MAT.TIMBER_WARM));
  slots.push(slot(tubeSweepMesh(spine.map(([x, y, z]) => [x, y, z, 0.018] as V4), 6), MAT.TIMBER_WARM));

  const mainSail: V2[] = [[0, 0.62], [-0.66, 0.22], [-0.34, -0.48], [0, -0.24], [0.34, -0.48], [0.66, 0.22]];
  slots.push(slot(extrudePolygonMesh(mainSail, 0.014, 0.003, false), MAT.LINEN_CLOTH, { pos: [0, 0, 0.01] }));
  const chevron: V2[] = [[0, 0.56], [-0.52, 0.2], [-0.22, 0.06], [0, 0.24], [0.22, 0.06], [0.52, 0.2]];
  slots.push(slot(extrudePolygonMesh(chevron, 0.018, 0.003, false), MAT.SILK_ACCENT, { pos: [0, 0, 0.015] }));

  for (const sx of [-1, 1]) {
    const tail = catmullRomSpline3([[sx * 0.3, -0.46, 0], [sx * 0.42, -0.78, -0.12], [sx * 0.28, -1.08, -0.24]], 6);
    slots.push(slot(tubeSweepMesh(tail.map(([x, y, z], i) => [x, y, z, 0.024 - i * 0.001] as V4), 5), MAT.SILK_ACCENT));
  }
  slots.push(slot(icosphereFacetMesh(0.035, 1, 0.02, 3), MAT.BRASS_POLISHED, { pos: [0, -0.1, 0.045] }));

  const spec = buildGroupedGeometrySpec(slots);
  return geometry.multiMaterial(spec, getHighlandMaterials(), {
    name: opts.name,
    rotationOrder: "YXZ",
    castShadow: opts.castShadow,
    receiveShadow: false
  }).runtime({ id: opts.id });
}

export function createFiligreeWispNode(opts: { readonly name: string; readonly id: string }): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  slots.push(slot(icosphereFacetMesh(0.2, 2, 0.05, 19), MAT.RUNE_EMISSIVE));
  for (const rot of [[0.4, 0, 0.5], [-0.5, 0.6, -0.3]] as const) {
    const ringPts: V3[] = Array.from({ length: 12 }, (_, i) => {
      const a = (i / 12) * Math.PI * 2;
      return [Math.cos(a) * 0.3, Math.sin(a) * 0.3, 0];
    });
    const curve = catmullRomSpline3(ringPts, 3, true);
    slots.push(slot(tubeSweepMesh(curve.map(([x, y, z]) => [x, y, z, 0.016] as V4), 6), MAT.BRASS_POLISHED, { rot }));
  }
  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), { id: opts.id, castShadow: false, receiveShadow: false });
}

/** 5.4 m clinker-built wooden sailing skiff (`id: "boat"`, waterline y=0, bow +Z, cockpit at [0, 0.55, -0.3] clear). */
export function createClinkerRowboatNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const slots: MultiMatSlot[] = [];
  const stations: readonly [number, number, number, number][] = [
    [-2.55, 0.42, 0.72, 0.14],
    [-1.8, 0.78, 0.64, -0.08],
    [-0.6, 0.98, 0.6, -0.18],
    [0.5, 0.96, 0.62, -0.18],
    [1.55, 0.72, 0.68, -0.1],
    [2.35, 0.28, 0.78, 0.04],
    [2.72, 0.05, 0.88, 0.24]
  ];
  const hullSections: V3[][] = stations.map(([z, halfB, sheerY, keelY]) => [
    [0, keelY, z],
    [halfB * 0.65, keelY + 0.16, z],
    [halfB, sheerY, z],
    [halfB * 0.86, sheerY + 0.05, z],
    [halfB * 0.55, keelY + 0.24, z],
    [0, keelY + 0.18, z],
    [-halfB * 0.55, keelY + 0.24, z],
    [-halfB * 0.86, sheerY + 0.05, z],
    [-halfB, sheerY, z],
    [-halfB * 0.65, keelY + 0.16, z]
  ]);
  slots.push(slot(loftSectionsMesh(hullSections, true, false), MAT.HULL_TIMBER));

  // Keel spine, lacquered sheer gunwales, floorboards & thwarts (keeping z = -0.3 clear for the Bellkeeper!)
  slots.push(slot(bevelBoxMesh(0.11, 0.16, 4.95, 0.02), MAT.OAK_DARK, { pos: [0, -0.14, 0.05] }));
  slots.push(slot(bevelBoxMesh(1.18, 0.07, 4.1, 0.012), MAT.TIMBER_WARM, { pos: [0, 0.48, -0.1] }));
  for (const tz of [-1.45, 1.05]) {
    slots.push(slot(bevelBoxMesh(1.42, 0.08, 0.34, 0.015), MAT.TIMBER_WARM, { pos: [0, 0.56, tz] }));
  }
  for (const sx of [-1, 1]) {
    const gunwale = catmullRomSpline3([[-0.42 * sx, 0.74, -2.5], [-0.96 * sx, 0.64, -0.4], [-0.72 * sx, 0.7, 1.55], [-0.06 * sx, 0.88, 2.7]], 5);
    slots.push(slot(tubeSweepMesh(gunwale.map(([x, y, z]) => [x, y, z, 0.042] as V4), 6), MAT.LACQUER_TRIM));
    slots.push(slot(bevelBoxMesh(0.06, 0.06, 2.35, 0.01), MAT.LACQUER_TRIM, { pos: [sx * 0.78, 0.63, -0.25], rot: [0, sx * 0.05, 0] }));
    slots.push(slot(icosphereFacetMesh(0.038, 1, 0.01, 11), MAT.BRASS_POLISHED, { pos: [sx * 0.92, 0.68, 0.15] }));
  }

  // Forward-stepped larch mast at z = +1.05, diagonal lugsail yard, billowed linen sail & stern rudder
  slots.push(slot(latheMesh([[0.095, 0.48], [0.085, 2.4], [0.062, 4.35], [0, 4.45]], 10), MAT.OAK_DARK, { pos: [0, 0, 1.05] }));
  const yard = catmullRomSpline3([[0, 3.15, 1.38], [0, 3.78, 0.45], [0, 4.32, -0.58]], 4);
  slots.push(slot(tubeSweepMesh(yard.map(([x, y, z]) => [x, y, z, 0.038] as V4), 6), MAT.OAK_DARK));
  const lugStations: V3[][] = [0, 0.5, 1].map((u) => {
    const y = 1.15 + u * 2.95;
    const zLead = 1.02 + (1 - u) * 0.18;
    const zLeech = -1.18 + u * 0.55;
    const belly = Math.sin(u * Math.PI) * 0.24 + 0.08;
    return [
      [0.02, y, zLead],
      [belly, y, (zLead + zLeech) * 0.5],
      [0.02, y, zLeech],
      [belly - 0.03, y, (zLead + zLeech) * 0.5]
    ];
  });
  slots.push(slot(loftSectionsMesh(lugStations, true, false), MAT.LINEN_CLOTH));
  slots.push(slot(bevelBoxMesh(0.08, 0.62, 0.46, 0.015), MAT.OAK_DARK, { pos: [0, 0.48, -2.72] }));

  return assembleMultiMaterialNode(opts.name, slots, getHighlandMaterials(), {
    id: opts.id,
    castShadow: opts.castShadow,
    receiveShadow: opts.receiveShadow
  });
}

export function mountProceduralStaticScenery(
  builder: SceneBuilder,
  sc: Scenery,
  flags: { bell: boolean; bellModel?: boolean; cottage: boolean; trees: boolean; stones: boolean; shrubs: boolean },
  castShadow: boolean,
  receiveShadow: boolean,
  bellPoseOf: (tower: { x: number; y: number; z: number; h?: number }) => { position: [number, number, number]; scale: number }
): void {
  if (flags.cottage) {
    sc.placements.cottages.forEach((p, i) => {
      builder.add(createHighlandCottageNode({ name: `cottage-${i}`, position: [p.x, p.y, p.z], yaw: p.yaw, scale: p.s, variant: i, castShadow, receiveShadow }));
    });
    const millY = terrainHeight(STRUCTURES.windmill.x, STRUCTURES.windmill.z) - 0.2;
    builder.add(createWindmillTowerNode({ name: "windmill-tower", position: [STRUCTURES.windmill.x, millY, STRUCTURES.windmill.z], castShadow, receiveShadow }));
    builder.add(createPackhorseBridgeNode({ name: "packhorse-bridge", position: [-4.0, terrainHeight(-4.0, -6.54) - 0.16, -6.54], yaw: Math.PI * 0.5 - 0.06, castShadow, receiveShadow }));
    builder.add(createWaysideShrineNode({ name: "wayside-shrine", position: [21.8, terrainHeight(21.8, 7.6) - 0.05, 7.6], yaw: -0.28, castShadow, receiveShadow }));
    for (const [wx, wz, len, seed] of [[-14, -4, 11.4, 201], [33, 7, 18.8, 307]] as const) {
      builder.add(createDryStoneWallNode({ name: `drystone-wall-${seed}`, position: [wx, terrainHeight(wx, wz) - 0.04, wz], length: len, seed, castShadow, receiveShadow }));
    }
    const deckY = SEA_LEVEL + 0.82;
    builder.add(createWaysideLanternNode({ name: "jetty-lantern", position: [31, deckY, -17.52], yaw: 0, castShadow, receiveShadow }));
    for (const [lx, lz, lyaw, idx] of [[-13.5, 2.35, 0.35, 0], [13.5, 3.35, -0.3, 1]] as const) {
      builder.add(createWaysideLanternNode({ name: `wayside-lantern-${idx}`, position: [lx, terrainHeight(lx, lz) - 0.04, lz], yaw: lyaw, castShadow, receiveShadow }));
    }
  }
  if (flags.bell) {
    sc.placements.bell.forEach((p) => {
      builder.add(createBellShrineBelfryNode({ name: "belltower", position: [p.x, p.y, p.z], height: p.h, castShadow, receiveShadow }));
    });
  }
  if (flags.bellModel) {
    sc.placements.bell.slice(0, 1).forEach((p) => {
      const pose = bellPoseOf(p);
      builder.add(createSanctuaryBellNode({ name: "belltower-bell", id: "bell-model", position: pose.position, castShadow, receiveShadow }));
    });
  }
  if (flags.trees) {
    builder.add(createGrandAncientOakNode({ name: "grand-ancient-oak", position: [-25, terrainHeight(-25, 0) - 0.2, 0], castShadow, receiveShadow }));
    addProceduralFloraBatches(builder, sc, castShadow, receiveShadow);
  } else if (flags.shrubs) {
    addProceduralFloraBatches(builder, { ...sc, placements: { ...sc.placements, pines: [], oaks: [] } }, castShadow, receiveShadow);
  }
  if (flags.stones) {
    sc.placements.stones.forEach((p, i) => {
      builder.add(createRuneStoneCairnNode({ name: `stones-${i}`, position: [p.x, p.y, p.z], scale: p.s, yaw: p.yaw, seed: 53 + i * 29, castShadow, receiveShadow }));
    });
    builder.add(createRuneStoneCairnNode({ name: "stones-hilltop", position: [43.5, terrainHeight(43.5, 7.4) - 0.06, 7.4], scale: 0.78, yaw: -0.42, seed: 97, castShadow, receiveShadow }));
  }
}

export function mountProceduralAnimatedActors(
  builder: SceneBuilder,
  flags: { letter: boolean; kite?: boolean; wisp: boolean; boat: boolean },
  letterCount: number,
  castShadow: boolean,
  receiveShadow: boolean
): void {
  if (flags.letter) {
    for (let i = 0; i < letterCount; i += 1) {
      builder.add(createSealedLetterNode({ name: `letter-${i}`, id: `letter-${i}`, receiveShadow }));
    }
  }
  if (flags.kite) {
    builder.add(createSwallowtailKiteNode({ name: "kite", id: "kite", castShadow }));
  } else if (flags.wisp) {
    builder.add(createFiligreeWispNode({ name: "wisp", id: "wisp" }));
  }
  if (flags.boat) {
    builder.add(createClinkerRowboatNode({ name: "boat", id: "boat", castShadow, receiveShadow }));
  }
}
