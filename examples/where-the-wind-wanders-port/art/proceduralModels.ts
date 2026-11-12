/**
 * The Bellkeeper's Walk (`where-the-wind-wanders-port`) — 100% Procedural Multi-Material Art Module.
 *
 * Sculpts the articulated multi-material Bellkeeper Wanderer (`hero`) and all pastoral highland
 * sanctuary architecture, flora, and interactive props directly on `@aura3d/engine` +
 * `apps/showcase-port-shared/proceduralKernel.ts` with zero external `.glb` files and zero `three` imports.
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
import { RIGHT_STRIKE_PHASE } from "../gait-motion";
import { CLIP_SECONDS, STRIDE_SPEED, type Gait } from "../locomotion";
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
  HULL_TIMBER: 19,
  TERRACOTTA_SUN: 20,
  CLOAK_SAFFRON: 21,
  CLOAK_INDIGO: 22,
  CLOAK_SAGE: 23,
  TUNIC_SLATE: 24,
  REED_STRAW: 25,
  SKIN_SERENE: 26,
  LEATHER_SUPPLE: 27,
  EYE_INK: 28
} as const;

let cachedHighlandMaterials: readonly AuraMaterialSpec[] | null = null;
let cachedMullionGlassMat: AuraMaterialSpec | null = null;
let cachedInstFloraMats: {
  readonly bark: AuraMaterialSpec;
  readonly pine: AuraMaterialSpec;
  readonly cypress: AuraMaterialSpec;
  readonly canopy: AuraMaterialSpec;
  readonly shrub: AuraMaterialSpec;
  readonly stone: AuraMaterialSpec;
  readonly fenceWood: AuraMaterialSpec;
  readonly iron: AuraMaterialSpec;
  readonly brass: AuraMaterialSpec;
  readonly ember: AuraMaterialSpec;
  readonly rune: AuraMaterialSpec;
} | null = null;

/**
 * Pastoral highland multi-material library spanning 10 physical `@aura3d/engine` material presets:
 * `matteClay`, `ceramic`, `pbr`, `lacquer`, `brushedMetal`, `studioMetal`, `fabric`, `felt`,
 * `physical` (mullion/lantern glass), and `emissive` (`practical: true`).
 */
export function getHighlandMaterials(): readonly AuraMaterialSpec[] {
  return (cachedHighlandMaterials ??= [
    unnamed(material.matteClay({ color: "#bdb59f", roughness: 0.91, envMapIntensity: 0.68 })),
    unnamed(material.matteClay({ color: "#82886f", roughness: 0.94, envMapIntensity: 0.6 })),
    unnamed(material.matteClay({ color: "#d4c8a7", roughness: 0.86, envMapIntensity: 0.74 })),
    unnamed(material.matteClay({ color: "#faf1dc", roughness: 0.88, envMapIntensity: 0.75 })),
    unnamed(material.pbr({ color: "#583b22", roughness: 0.82, metallic: 0, envMapIntensity: 0.64 })),
    unnamed(material.pbr({ color: "#a87a49", roughness: 0.74, metallic: 0, envMapIntensity: 0.7 })),
    unnamed(material.lacquer({ color: "#9c3526", roughness: 0.32, clearcoat: 0.78, clearcoatRoughness: 0.14, envMapIntensity: 1.08 })),
    unnamed(material.pbr({ color: "#b3844c", roughness: 0.92, metallic: 0, sheen: 0.28, sheenColor: "#e2c38a", sheenRoughness: 0.82, envMapIntensity: 0.56 })),
    unnamed(material.matteClay({ color: "#53606a", roughness: 0.78, envMapIntensity: 0.76 })),
    unnamed(material.ceramic({ color: "#c94f33", roughness: 0.34, clearcoat: 0.46, clearcoatRoughness: 0.2, envMapIntensity: 0.94 })),
    unnamed(material.brushedMetal({ color: "#d4a656", roughness: 0.24, metallic: 0.94, anisotropy: 0.82, anisotropyRotation: 0, clearcoat: 0.16, clearcoatRoughness: 0.18, envMapIntensity: 1.6 })),
    unnamed(material.brushedMetal({ color: "#3d4247", roughness: 0.48, metallic: 0.88, anisotropy: 0.55, clearcoat: 0, envMapIntensity: 1.1 })),
    unnamed(material.studioMetal({ color: "#f0d58c", roughness: 0.18, metallic: 0.96, clearcoat: 0, envMapIntensity: 1.68 })),
    unnamed(material.fabric({ color: "#f6ecd2", roughness: 0.86, sheen: 0.62, sheenColor: "#fff9e8", sheenRoughness: 0.7, envMapIntensity: 0.58 })),
    unnamed(material.felt({ color: "#d4533c", roughness: 0.82, sheen: 0.84, sheenColor: "#ffa88e", sheenRoughness: 0.56, envMapIntensity: 0.52 })),
    unnamed(material.emissive({ color: "#ffdd94", emissive: "#ffb344", emissiveIntensity: 2.15, roughness: 0.24, practical: true })),
    unnamed(material.emissive({ color: "#9ee6d8", emissive: "#7fd8c8", emissiveIntensity: 1.32, roughness: 0.3, practical: true })),
    unnamed(material.pbr({ color: "#5ab84a", roughness: 0.84, metallic: 0, sheen: 0.24, sheenColor: "#7ed45b", sheenRoughness: 0.78, envMapIntensity: 0.62 })),
    unnamed(material.pbr({ color: "#5b422b", roughness: 0.91, metallic: 0, envMapIntensity: 0.52 })),
    unnamed(material.pbr({ color: "#3b6883", roughness: 0.68, metallic: 0, clearcoat: 0.18, clearcoatRoughness: 0.35, envMapIntensity: 0.85 })),
    unnamed(material.ceramic({ color: "#da6040", roughness: 0.36, clearcoat: 0.42, clearcoatRoughness: 0.22, envMapIntensity: 0.92 })),
    unnamed(material.fabric({ color: "#df9428", roughness: 0.82, sheen: 0.86, sheenColor: "#ffe09a", sheenRoughness: 0.56, envMapIntensity: 0.66 })),
    unnamed(material.fabric({ color: "#2b427d", roughness: 0.84, sheen: 0.78, sheenColor: "#89a8f2", sheenRoughness: 0.6, envMapIntensity: 0.62 })),
    unnamed(material.fabric({ color: "#688262", roughness: 0.83, sheen: 0.82, sheenColor: "#c8dfb8", sheenRoughness: 0.58, envMapIntensity: 0.66 })),
    unnamed(material.fabric({ color: "#48596a", roughness: 0.85, sheen: 0.74, sheenColor: "#a6bdd4", sheenRoughness: 0.62, envMapIntensity: 0.62 })),
    unnamed(material.fabric({ color: "#cfa665", roughness: 0.84, sheen: 0.68, sheenColor: "#f7e2b2", sheenRoughness: 0.66, envMapIntensity: 0.68 })),
    unnamed(material.matteClay({ color: "#ecc4a0", roughness: 0.78, envMapIntensity: 0.72 })),
    unnamed(material.pbr({ color: "#6c4527", roughness: 0.68, metallic: 0, clearcoat: 0.12, clearcoatRoughness: 0.42, envMapIntensity: 0.68 })),
    unnamed(material.pbr({ color: "#261c18", roughness: 0.28, metallic: 0, clearcoat: 0.55, clearcoatRoughness: 0.18, envMapIntensity: 0.9 }))
  ]);
}

/** Warm translucent cottage-window & lantern pane glass (`castShadow: false` on every pane mesh). */
export function getMullionGlassMat(): AuraMaterialSpec {
  return (cachedMullionGlassMat ??= unnamed(
    material.physical({
      color: "#ffe2a6",
      roughness: 0.06,
      opacity: 0.46,
      clearcoat: 1,
      ior: 1.5
    })
  ));
}

/** Strictly `clearcoat: 0, sheen: 0` PBR materials for `>16` `instances.custom` flora & village batches. */
function getInstFloraMats() {
  return (cachedInstFloraMats ??= {
    bark: unnamed(material.pbr({ color: "#634830", roughness: 0.9, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.54 })),
    pine: unnamed(material.pbr({ color: "#438540", roughness: 0.85, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.58 })),
    cypress: unnamed(material.pbr({ color: "#36724c", roughness: 0.84, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.58 })),
    canopy: unnamed(material.pbr({ color: "#5ab84a", roughness: 0.84, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.62 })),
    shrub: unnamed(material.pbr({ color: "#7ed45b", roughness: 0.86, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.58 })),
    stone: unnamed(material.matteClay({ color: "#b2aa95", roughness: 0.9, clearcoat: 0, sheen: 0, envMapIntensity: 0.66 })),
    fenceWood: unnamed(material.pbr({ color: "#a47a4c", roughness: 0.82, metallic: 0, clearcoat: 0, sheen: 0, envMapIntensity: 0.64 })),
    iron: unnamed(material.brushedMetal({ color: "#3d4247", roughness: 0.48, metallic: 0.88, anisotropy: 0.5, clearcoat: 0, sheen: 0, envMapIntensity: 1.08 })),
    brass: unnamed(material.studioMetal({ color: "#eed38a", roughness: 0.2, metallic: 0.95, clearcoat: 0, sheen: 0, envMapIntensity: 1.6 })),
    ember: unnamed(material.emissive({ color: "#ffdd94", emissive: "#ffb344", emissiveIntensity: 2.05, roughness: 0.26, practical: true })),
    rune: unnamed(material.emissive({ color: "#9ee6d8", emissive: "#7fd8c8", emissiveIntensity: 1.32, roughness: 0.3, practical: true }))
  });
}

/** Subdivided icosphere with smooth radial outward vertex normals (`jitter = 0`), for serene sculpted organic forms. */
export function icosphereSmoothMesh(radius: number, subdivisions: 0 | 1 | 2 = 2): RawMesh {
  const base = icosphereFacetMesh(radius, subdivisions, 0, 1);
  const normals = new Array<number>(base.positions.length);
  for (let i = 0; i < base.positions.length; i += 3) {
    const x = base.positions[i]!, y = base.positions[i + 1]!, z = base.positions[i + 2]!;
    const len = Math.hypot(x, y, z) || 1;
    normals[i] = x / len;
    normals[i + 1] = y / len;
    normals[i + 2] = z / len;
  }
  return { ...base, normals };
}

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
// 2. Storybook Terracotta-Roofed & Half-Timbered Cottages (Exact Chimney Coord Preserved)
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

  // Dressed fieldstone foundation plinth + corner stone quoins + warm cream lime-plaster walls
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
      slots.push(slot(bevelBoxMesh(0.28 * s, h + 0.08 * s, 0.28 * s, 0.022 * s), MAT.OAK_DARK, { pos: [sx * w * 0.5, baseH + h * 0.5, sz * d * 0.5] }));
    }
  }
  // Storybook half-timber framing: wall-plates, mid-rail, vertical studs, diagonal wind-braces & gable trusses
  slots.push(slot(bevelBoxMesh(w + 0.16 * s, 0.24 * s, d + 0.16 * s, 0.025 * s), MAT.OAK_DARK, { pos: [0, baseH + h - 0.04 * s, 0] }));
  slots.push(slot(bevelBoxMesh(w + 0.1 * s, 0.17 * s, d + 0.1 * s, 0.02 * s), MAT.TIMBER_WARM, { pos: [0, baseH + h * 0.54, 0] }));
  for (const sz of [-1, 1]) {
    for (const fx of [-w * 0.33, -w * 0.02, w * 0.27]) {
      slots.push(slot(bevelBoxMesh(0.14 * s, h * 0.96, 0.09 * s, 0.015 * s), MAT.OAK_DARK, { pos: [fx, baseH + h * 0.5, sz * (d * 0.5 + 0.02 * s)] }));
    }
    for (const [bx, tilt] of [[-w * 0.41, 0.46], [w * 0.41, -0.46]] as const) {
      slots.push(slot(
        bevelBoxMesh(0.12 * s, 1.62 * s, 0.08 * s, 0.014 * s),
        MAT.TIMBER_WARM,
        { pos: [bx, baseH + h * 0.76, sz * (d * 0.5 + 0.025 * s)], rot: [0, 0, tilt] }
      ));
    }
  }
  const gablePoly: V2[] = [[-d * 0.5, 0], [d * 0.5, 0], [0, 2.92 * s]];
  for (const sx of [-1, 1]) {
    slots.push(slot(
      extrudePolygonMesh(gablePoly, 0.26 * s, 0.02 * s, true),
      MAT.LIMEWASH,
      { pos: [sx * (w * 0.5 - 0.13 * s), baseH + h, 0], rot: [0, Math.PI * 0.5, 0] }
    ));
    // King-post & diagonal gable timber struts + glowing amber gable attic window
    slots.push(slot(bevelBoxMesh(0.08 * s, 2.75 * s, 0.15 * s, 0.015 * s), MAT.OAK_DARK, { pos: [sx * (w * 0.5 + 0.03 * s), baseH + h + 1.38 * s, 0] }));
    for (const sz of [-1, 1]) {
      slots.push(slot(
        bevelBoxMesh(0.08 * s, 1.85 * s, 0.13 * s, 0.014 * s),
        MAT.TIMBER_WARM,
        { pos: [sx * (w * 0.5 + 0.03 * s), baseH + h + 0.92 * s, sz * 0.85 * s], rot: [sz * -0.58, 0, 0] }
      ));
    }
    const gwy = baseH + h + 1.18 * s;
    slots.push(slot(bevelBoxMesh(0.06 * s, 0.78 * s, 0.68 * s, 0.01 * s), MAT.HEARTH_EMISSIVE, { pos: [sx * (w * 0.5 + 0.01 * s), gwy, 0] }));
    slots.push(slot(bevelBoxMesh(0.12 * s, 0.88 * s, 0.09 * s, 0.012 * s), MAT.OAK_DARK, { pos: [sx * (w * 0.5 + 0.04 * s), gwy, 0] }));
    slots.push(slot(bevelBoxMesh(0.12 * s, 0.09 * s, 0.78 * s, 0.012 * s), MAT.OAK_DARK, { pos: [sx * (w * 0.5 + 0.04 * s), gwy, 0] }));
    panes.push(transformMesh(bevelBoxMesh(0.04 * s, 0.8 * s, 0.7 * s, 0.005 * s), { pos: [sx * (w * 0.5 + 0.035 * s), gwy, 0] }));
  }

  // Warm terracotta-red scalloped clay tile gable roof (`#c94f33` `material.ceramic`) with imbricated courses & scalloped eaves
  const eaveY = baseH + h - 0.18 * s;
  const ridgeY = baseH + h + 3.04 * s;
  const eaveZ = d * 0.5 + 0.58 * s;
  const roofProf: V2[] = [
    [-eaveZ, eaveY],
    [-d * 0.5 - 0.46 * s, eaveY + 0.34 * s],
    [-d * 0.24, eaveY + 1.88 * s],
    [0, ridgeY],
    [d * 0.24, eaveY + 1.88 * s],
    [d * 0.5 + 0.46 * s, eaveY + 0.34 * s],
    [eaveZ, eaveY],
    [0, baseH + h + 2.38 * s]
  ];
  const xSpan = w * 0.5 + 0.54 * s;
  const roofSections: V3[][] = [-1, -0.35, 0.35, 1].map((u) => {
    const sag = (1 - u * u) * -0.06 * s;
    return roofProf.map(([pz, py]) => [u * xSpan, py + sag, pz]);
  });
  slots.push(slot(loftSectionsMesh(roofSections, true, false), MAT.TERRACOTTA));

  // Imbricated terracotta tile courses & scalloped barrel-tile eave courses on both slopes
  const slopePitch = Math.atan2(ridgeY - eaveY, eaveZ);
  for (const side of [-1, 1]) {
    for (let row = 0; row < 6; row += 1) {
      const t = (row + 0.5) / 6;
      const czRow = side * eaveZ * (1 - t * 0.88);
      const cyRow = eaveY + (ridgeY - eaveY) * (t * 0.88) + 0.07 * s;
      slots.push(slot(
        bevelBoxMesh(xSpan * 1.98, 0.095 * s, 0.56 * s, 0.028 * s),
        row % 2 === 0 ? MAT.TERRACOTTA : MAT.TERRACOTTA_SUN,
        { pos: [0, cyRow, czRow], rot: [side * slopePitch, 0, 0] }
      ));
    }
    const scallopCount = 15;
    for (let k = 0; k < scallopCount; k += 1) {
      const tx = -xSpan * 0.93 + (k / (scallopCount - 1)) * xSpan * 1.86;
      slots.push(slot(
        bevelBoxMesh(0.36 * s, 0.14 * s, 0.62 * s, 0.055 * s),
        k % 2 === 0 ? MAT.TERRACOTTA : MAT.TERRACOTTA_SUN,
        { pos: [tx, eaveY + 0.14 * s, side * (eaveZ - 0.16 * s)], rot: [side * slopePitch, 0, 0] }
      ));
    }
  }
  // Sculpted half-round terracotta ridge crest tiles + timber bargeboards
  for (let r = 0; r < 11; r += 1) {
    const rx = -xSpan * 0.92 + (r / 10) * xSpan * 1.84;
    slots.push(slot(
      bevelBoxMesh(0.76 * s, 0.24 * s, 0.44 * s, 0.08 * s),
      r % 2 === 0 ? MAT.TERRACOTTA : MAT.TERRACOTTA_SUN,
      { pos: [rx, ridgeY + 0.07 * s, 0] }
    ));
  }

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

  // Glowing amber mullioned cottage windows (+Z front & -Z garden face): practical hearth backplate + oak mullions + flowerboxes
  for (const wx of [w * 0.16, w * 0.36]) {
    const wy = baseH + 1.68 * s;
    slots.push(slot(bevelBoxMesh(0.96 * s, 1.08 * s, 0.06 * s, 0.01 * s), MAT.HEARTH_EMISSIVE, { pos: [wx, wy, frontZ - 0.01 * s] }));
    slots.push(slot(bevelBoxMesh(1.16 * s, 0.1 * s, 0.16 * s, 0.015 * s), MAT.OAK_DARK, { pos: [wx, wy, frontZ + 0.05 * s] }));
    slots.push(slot(bevelBoxMesh(0.09 * s, 1.2 * s, 0.16 * s, 0.015 * s), MAT.OAK_DARK, { pos: [wx, wy, frontZ + 0.05 * s] }));
    slots.push(slot(bevelBoxMesh(1.22 * s, 0.13 * s, 0.22 * s, 0.02 * s), MAT.STONE_KEY, { pos: [wx, wy + 0.62 * s, frontZ + 0.06 * s] }));
    slots.push(slot(bevelBoxMesh(1.18 * s, 0.28 * s, 0.34 * s, 0.025 * s), MAT.TIMBER_WARM, { pos: [wx, baseH + 1.02 * s, frontZ + 0.2 * s] }));
    for (let k = 0; k < 3; k += 1) {
      slots.push(slot(
        icosphereFacetMesh(0.14 * s, 1, 0.12, 31 + k * 7),
        k % 2 === 0 ? MAT.SILK_ACCENT : MAT.FOLIAGE_OAK,
        { pos: [wx + (k - 1) * 0.32 * s, baseH + 1.24 * s, frontZ + 0.21 * s] }
      ));
    }
    panes.push(transformMesh(bevelBoxMesh(0.98 * s, 1.1 * s, 0.04 * s, 0.005 * s), { pos: [wx, wy, frontZ + 0.04 * s] }));
  }
  slots.push(slot(bevelBoxMesh(0.96 * s, 1.04 * s, 0.06 * s, 0.01 * s), MAT.HEARTH_EMISSIVE, { pos: [0, baseH + 1.68 * s, -frontZ + 0.01 * s] }));
  // Climbing sunlit gable ivy clusters (`layeredCanopyMesh`)
  slots.push(slot(layeredCanopyMesh({ radius: 0.66 * s, height: 1.52 * s, puffs: 7, seed: 41 }), MAT.FOLIAGE_OAK, { pos: [w * 0.44, baseH + 0.85 * s, frontZ + 0.14 * s] }));

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
  readonly fenceBay: AuraCustomGeometrySpec;
  readonly dryStoneBay: AuraCustomGeometrySpec;
  readonly stoneCairn: AuraCustomGeometrySpec;
  readonly stoneRune: AuraCustomGeometrySpec;
  readonly lanternPost: AuraCustomGeometrySpec;
  readonly lanternBrass: AuraCustomGeometrySpec;
  readonly lanternEmber: AuraCustomGeometrySpec;
  readonly lanternPane: AuraCustomGeometrySpec;
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

  // Wind-bent sunlit meadow oak/birch (`6.0 m` total height: forked swept trunk + smooth multi-lobed `layeredCanopyMesh`)
  const oakMain = catmullRomSpline3([[0, 0, 0], [0.08, 1.15, -0.02], [0.24, 2.45, -0.06], [0.58, 3.45, -0.12]], 5);
  const oakFork = catmullRomSpline3([[0.16, 1.85, -0.04], [-0.38, 2.75, 0.16], [-0.66, 3.4, 0.24]], 4);
  const oakTrunk = mergeRawMeshes([
    tubeSweepMesh(oakMain.map(([x, y, z], i) => [x, y, z, 0.28 - i * 0.012] as V4), 7),
    tubeSweepMesh(oakFork.map(([x, y, z], i) => [x, y, z, 0.17 - i * 0.01] as V4), 6)
  ]);
  const oakCanopy = mergeRawMeshes([
    transformMesh(layeredCanopyMesh({ radius: 2.08, height: 3.18, puffs: 9, seed: 61 }), { pos: [0.22, 2.82, -0.04] }),
    transformMesh(layeredCanopyMesh({ radius: 1.32, height: 2.05, puffs: 6, seed: 89 }), { pos: [-0.58, 2.95, 0.18] })
  ]);

  // Normalized `1.2 m` sunlit meadow shrub mound (`layeredCanopyMesh`)
  const shrub = mergeRawMeshes([
    layeredCanopyMesh({ radius: 0.82, height: 1.22, puffs: 8, seed: 109 })
  ]);

  // Normalized `3.8 m` village split-rail & picket pasture fence bay (`mergeRawMeshes` for single instanced draw call)
  const fenceParts: RawMesh[] = [
    transformMesh(bevelBoxMesh(3.86, 0.11, 0.08, 0.016), { pos: [0, 0.76, 0] }),
    transformMesh(bevelBoxMesh(3.86, 0.11, 0.08, 0.016), { pos: [0, 0.42, 0] }),
    transformMesh(bevelBoxMesh(0.16, 1.12, 0.16, 0.022), { pos: [-1.9, 0.54, 0] }),
    transformMesh(bevelBoxMesh(0.16, 1.12, 0.16, 0.022), { pos: [1.9, 0.54, 0] })
  ];
  for (let i = 0; i <= 9; i += 1) {
    const px = -1.72 + (i / 9) * 3.44;
    fenceParts.push(transformMesh(bevelBoxMesh(0.11, 0.96 + (i % 2) * 0.05, 0.045, 0.01), { pos: [px, 0.5, 0.045] }));
  }
  const fenceBay = mergeRawMeshes(fenceParts);

  // Normalized `6.0 m` dry-stone wall bay (`mergeRawMeshes` for single instanced draw call)
  const wallSec: V3[][] = [-3.0, -1.0, 1.0, 3.0].map((px, i) => {
    const und = (hash01(201 + i * 13) - 0.5) * 0.05;
    return [
      [px, -0.08, -0.3],
      [px, 0.78 + und, -0.2],
      [px, 0.86 + und, 0],
      [px, 0.78 + und, 0.2],
      [px, -0.08, 0.3]
    ];
  });
  const wallParts: RawMesh[] = [loftSectionsMesh(wallSec, true, true)];
  for (let i = 0; i < 12; i += 1) {
    const px = -2.75 + (i / 11) * 5.5;
    wallParts.push(transformMesh(icosphereFacetMesh(0.19, 1, 0.16, 230 + i * 17), { pos: [px, 0.92, 0], scale: [0.92, 1.16, 1.04] }));
  }
  const dryStoneBay = mergeRawMeshes(wallParts);

  // Standing Highland monolith + pilgrim cairn (`mergeRawMeshes` for instanced village stone batching)
  const cairnParts: RawMesh[] = [
    stratifiedCliffMesh({ radiusX: 0.62, radiusZ: 0.36, height: 3.15, terraces: 6, seed: 53 }),
    transformMesh(stratifiedCliffMesh({ radiusX: 0.95, radiusZ: 0.82, height: 0.68, terraces: 3, seed: 64 }), { pos: [-0.72, 0, 0.25] })
  ];
  for (let k = 0; k < 4; k += 1) {
    cairnParts.push(transformMesh(icosphereFacetMesh(0.42 - k * 0.075, 1, 0.16, 83 + k * 9), { pos: [0.86, 0.2 + k * 0.34, -0.14], scale: [1.18, 0.62, 1.04] }));
  }
  const stoneCairn = mergeRawMeshes(cairnParts);
  const runeCurve = catmullRomSpline3([[-0.14, 1.18, 0.33], [0.14, 1.52, 0.34], [-0.1, 1.92, 0.32], [0.08, 2.26, 0.29]], 6);
  const stoneRune = mergeRawMeshes([tubeSweepMesh(runeCurve.map(([x, y, z]) => [x, y, z, 0.026] as V4), 6)]);

  // Batched wayside & jetty lantern geometry specs
  const crook = catmullRomSpline3([[0, 1.92, -0.02], [0, 2.38, -0.08], [0, 2.58, 0.02], [0, 2.48, 0.12]], 6);
  const lanternPost = mergeRawMeshes([
    latheMesh([[0.24, 0], [0.22, 0.24], [0.15, 0.28]], 10, true),
    transformMesh(bevelBoxMesh(0.16, 2.18, 0.16, 0.022), { pos: [0, 1.12, 0] }),
    tubeSweepMesh(crook.map(([x, y, z]) => [x, y, z, 0.024] as V4), 7)
  ]);
  const brassParts: RawMesh[] = [
    transformMesh(latheMesh([[0, -0.2], [0.14, -0.17], [0.16, -0.12], [0.04, -0.11]], 6, true), { pos: [0, 2.2, 0.12] }),
    transformMesh(latheMesh([[0.04, 0.12], [0.18, 0.14], [0.1, 0.24], [0.03, 0.28], [0, 0.31]], 6, true), { pos: [0, 2.2, 0.12] })
  ];
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    brassParts.push(transformMesh(bevelBoxMesh(0.018, 0.26, 0.018, 0.003), { pos: [Math.cos(a) * 0.135, 2.2, 0.12 + Math.sin(a) * 0.135] }));
  }
  const lanternBrass = mergeRawMeshes(brassParts);
  const lanternEmber = mergeRawMeshes([transformMesh(icosphereFacetMesh(0.055, 1, 0.04, 23), { pos: [0, 2.19, 0.12] })]);
  const lanternPane = mergeRawMeshes([transformMesh(latheMesh([[0.115, -0.12], [0.132, 0.12]], 6, true), { pos: [0, 2.2, 0.12] })]);

  cachedFloraSpecs = {
    pineTrunk, pineBoughs, cypressTrunk, cypressBoughs, oakTrunk, oakCanopy, shrub,
    fenceBay, dryStoneBay, stoneCairn, stoneRune, lanternPost, lanternBrass, lanternEmber, lanternPane
  };
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
    const cols: AuraColor[] = scotsPines.map((_, i) => (i % 3 === 0 ? "#4e9644" : i % 3 === 1 ? "#3e7d3d" : "#5ab84a"));
    builder.add(instances.custom(specs.pineTrunk, { name: "pines-trunks", material: floraMats.bark, transforms: xfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.pineBoughs, { name: "pines", material: floraMats.pine, transforms: xfs, colors: cols, castShadow, receiveShadow }));
  }
  if (cypresses.length > 0) {
    const xfs = cypresses.map((p) => toXf(p.x, p.y, p.z, p.yaw, (p.h ?? 6) / 6));
    const cols: AuraColor[] = cypresses.map((_, i) => (i % 2 === 0 ? "#3c7e54" : "#4b9264"));
    builder.add(instances.custom(specs.cypressTrunk, { name: "cypress-trunks", material: floraMats.bark, transforms: xfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.cypressBoughs, { name: "cypresses", material: floraMats.cypress, transforms: xfs, colors: cols, castShadow, receiveShadow }));
  }
  if (sc.placements.oaks.length > 0) {
    const xfs = sc.placements.oaks.map((p) => toXf(p.x, p.y, p.z, p.yaw, (p.h ?? 6) / 6));
    const barkCols: AuraColor[] = sc.placements.oaks.map((p) => (p.variant === 1 ? "#d4ccb7" : "#664a31"));
    const leafCols: AuraColor[] = sc.placements.oaks.map((p) =>
      p.variant === 2 ? "#d6b848" : p.variant === 1 ? "#7ed45b" : "#5ab84a"
    );
    builder.add(instances.custom(specs.oakTrunk, { name: "oaks-trunks", material: floraMats.bark, transforms: xfs, colors: barkCols, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.oakCanopy, { name: "oaks", material: floraMats.canopy, transforms: xfs, colors: leafCols, castShadow, receiveShadow }));
  }
  if (sc.placements.shrubs.length > 0) {
    const xfs = sc.placements.shrubs.map((p) => toXf(p.x, p.y, p.z, p.yaw, p.s));
    const shrubCols: AuraColor[] = sc.placements.shrubs.map((_, i) => (i % 3 === 0 ? "#7ed45b" : i % 3 === 1 ? "#5ab84a" : "#6ec952"));
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

// ---------------------------------------------------------------------------
// 5. Sculpted Multi-Material Bellkeeper Wanderer & Articulated Stride Rig
// ---------------------------------------------------------------------------

/** Canonical joint offsets and limb lengths (model/world metres) for the 2.90 m Bellkeeper Wanderer. */
export const BELLKEEPER_RIG_SPEC = {
  totalHeight: 2.9,
  hipsRestY: 1.37,
  torsoOffsetY: 0.05,
  headOffset: [0, 0.59, 0.01] as const,
  cloakTailOffset: [0, 0.56, -0.12] as const,
  leftShoulderOffset: [0.3, 0.54, 0] as const,
  rightShoulderOffset: [-0.3, 0.54, 0] as const,
  staffChimeOffset: [-0.04, 0.48, 0.48] as const,
  staffRibbonOffset: [-0.04, 0.53, 0.4] as const,
  rightHandGripOffset: [-0.04, -0.44, 0.24] as const,
  hipHalfWidth: 0.15,
  thighLen: 0.65,
  shinLen: 0.6,
  soleOffset: 0.12,
  toeFromAnkle: [0, -0.1, 0.17] as const
} as const;

export const BELLKEEPER_JOINT_IDS = [
  "hero-hips",
  "hero-torso",
  "hero-head",
  "hero-cloak-tail",
  "hero-arm-l",
  "hero-arm-r",
  "hero-staff-chime",
  "hero-staff-ribbon",
  "hero-leg-l",
  "hero-shin-l",
  "hero-foot-l",
  "hero-leg-r",
  "hero-shin-r",
  "hero-foot-r"
] as const;

export interface BellkeeperRigPose {
  readonly hipsPos: V3;
  readonly hipsRot: V3;
  readonly torsoRot: V3;
  readonly headRot: V3;
  readonly cloakTailRot: V3;
  readonly leftArmRot: V3;
  readonly rightArmRot: V3;
  readonly staffChimeRot: V3;
  readonly staffRibbonRot: V3;
  readonly leftLegRot: V3;
  readonly leftShinRot: V3;
  readonly leftFootRot: V3;
  readonly rightLegRot: V3;
  readonly rightShinRot: V3;
  readonly rightFootRot: V3;
}

export interface BellkeeperPoseInput {
  readonly gait: Gait;
  readonly phaseSeconds: number;
  readonly windTime?: number;
  readonly gust?: number;
  readonly hopPhase?: string;
  readonly onBoat?: boolean;
  readonly bellRing?: number;
  readonly lookYaw?: number;
  readonly lookPitch?: number;
}

function buildPartNode(name: string, slots: readonly MultiMatSlot[], castShadow: boolean, receiveShadow: boolean) {
  return assembleMultiMaterialNode(name, slots, getHighlandMaterials(), {
    castShadow,
    receiveShadow
  });
}

function buildBellkeeperPelvisSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Draped woven slate-indigo lower tunic skirt (`loftSectionsMesh`) with warm ochre border hem
  const skirtStations: V3[][] = [0, 0.45, 0.85, 1].map((u) => {
    const y = 0.08 - u * 0.42;
    const rx = 0.22 + u * 0.1;
    const rz = 0.17 + u * 0.085;
    return Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      const pleat = 1 + 0.045 * u * Math.cos(a * 5);
      return [Math.cos(a) * rx * pleat, y, Math.sin(a) * rz * pleat] as V3;
    });
  });
  slots.push(slot(loftSectionsMesh(skirtStations.slice(0, 3), true, true), MAT.TUNIC_SLATE));
  slots.push(slot(loftSectionsMesh(skirtStations.slice(2), true, false), MAT.CLOAK_SAFFRON));

  // Supple saddle-leather waist belt & polished brass sanctuary buckle
  slots.push(slot(latheMesh([[0.215, 0.01], [0.232, 0.025], [0.232, 0.075], [0.215, 0.09]], 16, true), MAT.LEATHER_SUPPLE, { scale: [1, 1, 0.78] }));
  slots.push(slot(bevelBoxMesh(0.075, 0.068, 0.032, 0.008), MAT.BRASS_POLISHED, { pos: [0, 0.05, 0.182] }));

  // Courier leather satchel pouch at left hip (+X) with folded flap, brass clasp & rolled letter scroll
  slots.push(slot(bevelBoxMesh(0.11, 0.22, 0.24, 0.024), MAT.LEATHER_SUPPLE, { pos: [0.24, -0.07, -0.02], rot: [0.05, 0.08, -0.12] }));
  slots.push(slot(bevelBoxMesh(0.12, 0.09, 0.245, 0.02), MAT.OAK_DARK, { pos: [0.248, 0.01, -0.02], rot: [0.05, 0.08, -0.15] }));
  slots.push(slot(bevelBoxMesh(0.026, 0.045, 0.036, 0.006), MAT.BRASS_POLISHED, { pos: [0.305, -0.03, -0.02] }));
  slots.push(slot(transformMesh(latheMesh([[0, -0.11], [0.028, -0.11], [0.028, 0.11], [0, 0.11]], 10), { rot: [Math.PI * 0.5, 0, 0.1] }), MAT.LINEN_CLOTH, { pos: [0.23, 0.065, -0.02] }));

  // Small brass waist-sash sanctuary chime at right hip (-X)
  slots.push(slot(latheMesh([[0.034, -0.11], [0.042, -0.1], [0.028, -0.05], [0.014, -0.02], [0, -0.015]], 12), MAT.BRASS_POLISHED, { pos: [-0.225, 0.02, 0.06] }));
  slots.push(slot(icosphereSmoothMesh(0.012, 1), MAT.BRONZE_BELL, { pos: [-0.225, -0.105, 0.06] }));
  return slots;
}

function buildBellkeeperTorsoSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Sculpted woven sage-green & slate upper tunic (`loftSectionsMesh`)
  const chestStations: V3[][] = [
    [0, -0.03, 0.21, 0.16],
    [0.22, 0.18, 0.23, 0.175],
    [0.44, 0.39, 0.265, 0.19],
    [0.62, 0.57, 0.24, 0.165],
    [0.72, 0.64, 0.15, 0.125]
  ].map(([, y, rx, rz]) =>
    Array.from({ length: 10 }, (_, k) => {
      const a = (k / 10) * Math.PI * 2;
      return [Math.cos(a) * rx!, y!, Math.sin(a) * rz!] as V3;
    })
  );
  slots.push(slot(loftSectionsMesh(chestStations, true, true), MAT.CLOAK_SAGE));

  // Layered multi-material wind-cloak shoulder mantle (woven sage outer cape + saffron/indigo trim cowl)
  const mantleStations: V3[][] = [0, 0.48, 1].map((u) => {
    const y = 0.62 - u * 0.36;
    const rx = 0.2 + u * 0.18;
    const rz = 0.15 + u * 0.13;
    return Array.from({ length: 12 }, (_, k) => {
      const a = (k / 12) * Math.PI * 2;
      const drape = 1 + 0.06 * u * Math.sin(a * 3);
      return [Math.cos(a) * rx * drape, y, Math.sin(a) * rz * drape - u * 0.02] as V3;
    });
  });
  slots.push(slot(loftSectionsMesh(mantleStations, true, false), MAT.CLOAK_SAGE));
  slots.push(slot(latheMesh([[0.155, 0.63], [0.285, 0.57], [0.315, 0.47], [0.225, 0.45]], 16, true), MAT.CLOAK_SAFFRON, { scale: [1.04, 1, 0.84] }));
  slots.push(slot(latheMesh([[0.145, 0.65], [0.235, 0.61], [0.25, 0.53], [0.175, 0.51]], 14, true), MAT.CLOAK_INDIGO, { scale: [1.02, 1, 0.84] }));

  // Diagonal saddle-leather cross-body courier satchel strap across front & back of torso
  const strapLoop = catmullRomSpline3(
    [
      [-0.21, 0.61, 0.02],
      [-0.04, 0.38, 0.2],
      [0.18, 0.1, 0.15],
      [0.24, -0.02, -0.01],
      [0.14, 0.14, -0.17],
      [-0.06, 0.4, -0.19]
    ],
    4,
    true
  );
  slots.push(slot(tubeSweepMesh(strapLoop.map(([x, y, z]) => [x, y, z, 0.022] as V4), 6, true), MAT.LEATHER_SUPPLE));

  // Burnished brass cloak clasp brooch at chest
  slots.push(slot(latheMesh([[0.024, -0.008], [0.048, 0], [0.048, 0.014], [0.02, 0.018], [0, 0.02]], 14), MAT.BRASS_POLISHED, { pos: [0.03, 0.52, 0.195], rot: [Math.PI * 0.46, 0, 0] }));
  return slots;
}

function buildBellkeeperCloakTailSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Flowing multi-panel woven wind-cloak cape (`loftSectionsMesh`) in highland sage, slate-indigo & saffron
  const outerCape: V3[][] = [0, 0.35, 0.72, 1].map((u) => {
    const y = 0.02 - u * 1.04;
    const hw = 0.27 + u * 0.25;
    const zBack = -0.03 - u * 0.22 - Math.sin(u * Math.PI) * 0.05;
    return [
      [-hw, y, 0.04 - u * 0.06],
      [-hw * 0.58, y, zBack - 0.045],
      [0, y, zBack - 0.07],
      [hw * 0.58, y, zBack - 0.045],
      [hw, y, 0.04 - u * 0.06],
      [0, y, zBack + 0.018]
    ];
  });
  slots.push(slot(loftSectionsMesh(outerCape, true, false), MAT.CLOAK_SAGE));

  const innerLining: V3[][] = [0, 0.5, 1].map((u) => {
    const y = 0.0 - u * 0.86;
    const hw = 0.24 + u * 0.21;
    const zBack = -0.05 - u * 0.2;
    return [
      [-hw, y, 0.01 - u * 0.05],
      [-hw * 0.52, y, zBack - 0.035],
      [0, y, zBack - 0.055],
      [hw * 0.52, y, zBack - 0.035],
      [hw, y, 0.01 - u * 0.05],
      [0, y, zBack]
    ];
  });
  slots.push(slot(loftSectionsMesh(innerLining, true, false), MAT.CLOAK_INDIGO));

  // Woven saffron & indigo wind-scarf streamers trailing behind the collar
  const scarfA = catmullRomSpline3([[0.11, 0.03, 0.04], [0.2, -0.2, -0.14], [0.24, -0.48, -0.36], [0.18, -0.72, -0.56]], 6);
  const scarfB = catmullRomSpline3([[-0.1, 0.02, 0.03], [-0.18, -0.22, -0.15], [-0.16, -0.46, -0.34]], 5);
  slots.push(slot(tubeSweepMesh(scarfA.map(([x, y, z], i) => [x, y, z, 0.044 - i * 0.0018] as V4), 6), MAT.CLOAK_SAFFRON));
  slots.push(slot(tubeSweepMesh(scarfB.map(([x, y, z], i) => [x, y, z, 0.036 - i * 0.0015] as V4), 6), MAT.CLOAK_INDIGO));
  return slots;
}

function buildBellkeeperHeadSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Tucked warm scarf & neck collar
  slots.push(slot(latheMesh([[0.11, -0.01], [0.165, 0.02], [0.175, 0.085], [0.135, 0.13]], 14, true), MAT.CLOAK_SAFFRON));
  slots.push(slot(latheMesh([[0.1, 0.08], [0.145, 0.1], [0.13, 0.15]], 12, true), MAT.LINEN_CLOTH));

  // Sculpted serene head (`icosphereSmoothMesh` warm skin), soft nose bridge, tucked hair, and gentle eyes
  slots.push(slot(icosphereSmoothMesh(0.185, 2), MAT.SKIN_SERENE, { pos: [0, 0.255, 0.015], scale: [0.94, 1.04, 0.96] }));
  slots.push(slot(icosphereSmoothMesh(0.032, 1), MAT.SKIN_SERENE, { pos: [0, 0.242, 0.192], scale: [0.78, 1.05, 0.95] }));
  slots.push(slot(icosphereSmoothMesh(0.188, 2), MAT.OAK_DARK, { pos: [0, 0.285, -0.025], scale: [0.96, 0.88, 0.94] }));
  for (const sx of [-1, 1]) {
    slots.push(slot(icosphereSmoothMesh(0.024, 1), MAT.EYE_INK, { pos: [sx * 0.064, 0.262, 0.182], scale: [0.88, 1.12, 0.55] }));
  }

  // Woven conical/hooded traveller hat (`latheMesh` multi-ring woven reed/straw profile with wide sun-brim -> apex y = 0.89 => world 2.90 m)
  const reedHatProfile: V2[] = [
    [0.175, 0.355],
    [0.34, 0.33],
    [0.475, 0.295],
    [0.488, 0.312],
    [0.39, 0.365],
    [0.315, 0.425],
    [0.325, 0.442],
    [0.255, 0.515],
    [0.264, 0.532],
    [0.195, 0.615],
    [0.203, 0.63],
    [0.132, 0.725],
    [0.068, 0.815],
    [0.02, 0.872],
    [0, 0.89]
  ];
  slots.push(slot(latheMesh(reedHatProfile, 24), MAT.REED_STRAW));
  // Concentric darker-timber woven reed accent rings under & over the sun-brim
  slots.push(slot(latheMesh([[0.468, 0.294], [0.492, 0.308], [0.482, 0.322], [0.458, 0.308]], 24, true), MAT.TIMBER_WARM));

  // Indigo cloth hatband + knotted sash tail at back of crown
  slots.push(slot(latheMesh([[0.308, 0.395], [0.332, 0.402], [0.312, 0.452], [0.292, 0.448]], 22, true), MAT.CLOAK_INDIGO));
  const bandTail = catmullRomSpline3([[0.04, 0.41, -0.31], [0.08, 0.33, -0.39], [0.11, 0.22, -0.44]], 4);
  slots.push(slot(tubeSweepMesh(bandTail.map(([x, y, z], i) => [x, y, z, 0.024 - i * 0.002] as V4), 5), MAT.CLOAK_INDIGO));

  // Subtle braided chin cord looping under the chin with a carved wooden toggle bead
  const chinCord = catmullRomSpline3(
    [
      [-0.175, 0.34, 0.03],
      [-0.145, 0.19, 0.09],
      [0, 0.095, 0.135],
      [0.145, 0.19, 0.09],
      [0.175, 0.34, 0.03]
    ],
    4
  );
  slots.push(slot(tubeSweepMesh(chinCord.map(([x, y, z]) => [x, y, z, 0.0085] as V4), 5), MAT.LEATHER_SUPPLE));
  slots.push(slot(icosphereSmoothMesh(0.018, 1), MAT.TIMBER_WARM, { pos: [0, 0.085, 0.138] }));
  return slots;
}

function buildBellkeeperLeftArmSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const armCurve = catmullRomSpline3(
    [
      [0, 0.02, 0],
      [0.04, -0.25, -0.02],
      [0.05, -0.49, 0.08]
    ],
    5
  );
  slots.push(slot(tubeSweepMesh(armCurve.map(([x, y, z], i) => [x, y, z, 0.086 - i * 0.0022] as V4), 8, true), MAT.TUNIC_SLATE));
  slots.push(slot(latheMesh([[0.068, -0.45], [0.082, -0.47], [0.078, -0.52], [0.06, -0.53]], 10, true), MAT.CLOAK_SAFFRON, { pos: [0.05, 0, 0.07], rot: [-0.22, 0, 0] }));
  slots.push(slot(icosphereSmoothMesh(0.062, 1), MAT.SKIN_SERENE, { pos: [0.055, -0.55, 0.1], scale: [0.85, 1.12, 0.95] }));
  return slots;
}

function buildBellkeeperRightArmAndStaffSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Right sleeve poised forward to carry the sanctuary bell-staff
  const armCurve = catmullRomSpline3(
    [
      [0, 0.02, 0],
      [-0.04, -0.24, 0.08],
      [-0.04, -0.44, 0.24]
    ],
    5
  );
  slots.push(slot(tubeSweepMesh(armCurve.map(([x, y, z], i) => [x, y, z, 0.086 - i * 0.0022] as V4), 8, true), MAT.TUNIC_SLATE));
  slots.push(slot(latheMesh([[0.068, -0.39], [0.082, -0.41], [0.078, -0.46], [0.06, -0.47]], 10, true), MAT.CLOAK_SAFFRON, { pos: [-0.04, 0.02, 0.2], rot: [-0.45, 0, 0] }));
  slots.push(slot(icosphereSmoothMesh(0.064, 1), MAT.SKIN_SERENE, { pos: [-0.04, -0.44, 0.24], scale: [0.9, 1.05, 1.05] }));

  // Carved wooden bell-chime staff (`tubeSweepMesh` curved shepherd/sanctuary crook; ferrule safely at y = -1.48 => world y = 0.45 m)
  const staffPts = catmullRomSpline3(
    [
      [-0.06, -1.48, 0.2],
      [-0.05, -0.92, 0.22],
      [-0.04, -0.44, 0.24],
      [-0.04, 0.14, 0.27],
      [-0.04, 0.48, 0.31],
      [-0.04, 0.62, 0.41],
      [-0.04, 0.52, 0.5],
      [-0.04, 0.41, 0.45]
    ],
    5
  );
  slots.push(
    slot(
      tubeSweepMesh(
        staffPts.map(([x, y, z], i, arr) => {
          const u = i / Math.max(1, arr.length - 1);
          const r = 0.032 - u * 0.011;
          return [x, y, z, r] as V4;
        }),
        8,
        true
      ),
      MAT.TIMBER_WARM
    )
  );
  // Leather hand-grip wrap + brass ferrule & sanctuary crook collar rings
  slots.push(slot(latheMesh([[0.033, -0.52], [0.037, -0.5], [0.037, -0.37], [0.033, -0.35]], 10, true), MAT.LEATHER_SUPPLE, { pos: [-0.04, 0, 0.24] }));
  slots.push(slot(latheMesh([[0, -1.5], [0.028, -1.48], [0.034, -1.38], [0.03, -1.36]], 10), MAT.BRASS_POLISHED, { pos: [-0.06, 0, 0.2] }));
  slots.push(slot(latheMesh([[0.026, 0.16], [0.036, 0.18], [0.036, 0.22], [0.026, 0.24]], 10, true), MAT.BRASS_POLISHED, { pos: [-0.04, 0, 0.27] }));
  return slots;
}

function buildStaffChimeSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Suspension ring + gleaming brass sanctuary chime bell + resonant bronze clapper
  slots.push(slot(latheMesh([[0.008, 0], [0.014, -0.02], [0.008, -0.04]], 8, true), MAT.IRON_FORGED));
  const chimeProfile: V2[] = [
    [0.068, -0.175],
    [0.078, -0.168],
    [0.062, -0.135],
    [0.046, -0.088],
    [0.034, -0.048],
    [0, -0.035]
  ];
  slots.push(slot(latheMesh(chimeProfile, 16), MAT.BRASS_POLISHED));
  slots.push(slot(latheMesh([[0.066, -0.176], [0.081, -0.166], [0.078, -0.154], [0.062, -0.15]], 16, true), MAT.BRONZE_BELL));
  slots.push(slot(icosphereSmoothMesh(0.02, 1), MAT.BRONZE_BELL, { pos: [0, -0.17, 0] }));
  return slots;
}

function buildStaffRibbonSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Fluttering crimson (`MAT.SILK_ACCENT`) & gold (`MAT.CLOAK_SAFFRON`) sanctuary wind-ribbons
  const crimson = catmullRomSpline3(
    [
      [0, 0, 0],
      [0.03, -0.14, -0.1],
      [0.05, -0.31, -0.24],
      [0.02, -0.48, -0.38]
    ],
    5
  );
  const gold = catmullRomSpline3(
    [
      [0, -0.01, -0.01],
      [-0.03, -0.16, -0.12],
      [-0.04, -0.34, -0.26]
    ],
    5
  );
  slots.push(slot(tubeSweepMesh(crimson.map(([x, y, z], i) => [x, y, z, 0.022 - i * 0.0011] as V4), 5), MAT.SILK_ACCENT));
  slots.push(slot(tubeSweepMesh(gold.map(([x, y, z], i) => [x, y, z, 0.018 - i * 0.001] as V4), 5), MAT.CLOAK_SAFFRON));
  return slots;
}

function buildBellkeeperThighSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  slots.push(
    slot(
      latheMesh(
        [
          [0, -0.63],
          [0.082, -0.6],
          [0.095, -0.34],
          [0.115, -0.08],
          [0.105, 0.04],
          [0, 0.05]
        ],
        12
      ),
      MAT.TUNIC_SLATE
    )
  );
  return slots;
}

function buildBellkeeperShinSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  // Criss-cross linen & supple leather wrapped calf gaiters
  slots.push(
    slot(
      latheMesh(
        [
          [0, -0.55],
          [0.068, -0.53],
          [0.076, -0.38],
          [0.088, -0.2],
          [0.084, -0.03],
          [0, 0.03]
        ],
        12
      ),
      MAT.LINEN_CLOTH
    )
  );
  for (const bandY of [-0.14, -0.27, -0.4]) {
    slots.push(
      slot(
        latheMesh(
          [
            [0.072, bandY - 0.025],
            [0.09, bandY - 0.012],
            [0.09, bandY + 0.012],
            [0.072, bandY + 0.025]
          ],
          12,
          true
        ),
        MAT.LEATHER_SUPPLE
      )
    );
  }
  return slots;
}

function buildBellkeeperFootSlots(): MultiMatSlot[] {
  const slots: MultiMatSlot[] = [];
  const soleY = -BELLKEEPER_RIG_SPEC.soleOffset; // exact -0.12 m => world minY = 0.000 m at rest
  const bootRing = (y: number, hw: number, zBack: number, zFront: number): V3[] => [
    [-hw * 0.85, y, zBack],
    [hw * 0.85, y, zBack],
    [hw, y, 0.03],
    [hw * 0.72, y, zFront],
    [0, y, zFront + 0.022],
    [-hw * 0.72, y, zFront],
    [-hw, y, 0.03]
  ];
  // Grounded dark leather sole (`minY = -0.120` exact)
  const soleStations: V3[][] = [
    bootRing(soleY, 0.076, -0.085, 0.17),
    bootRing(soleY + 0.032, 0.078, -0.085, 0.172)
  ];
  slots.push(slot(loftSectionsMesh(soleStations, true, true), MAT.EYE_INK));

  // Supple saddle-leather traveller boot vamp, instep & folded cuff
  const upperStations: V3[][] = [
    bootRing(soleY + 0.03, 0.074, -0.08, 0.168),
    bootRing(-0.045, 0.072, -0.076, 0.135),
    bootRing(0.02, 0.068, -0.068, 0.072),
    bootRing(0.085, 0.074, -0.07, 0.068)
  ];
  slots.push(slot(loftSectionsMesh(upperStations, true, true), MAT.LEATHER_SUPPLE));
  return slots;
}

/**
 * Sculpts the poetic multi-material **Bellkeeper Wanderer** (`id: "hero"`, height `2.90` m, boot soles
 * grounded at `minY = 0.000`) as an articulated `@aura3d/engine` `group` hierarchy using `"ZYX"` Euler
 * rotation order on all articulated limbs, cloak tail, staff chime, and ribbon nodes.
 */
export function createBellkeeperWandererNode(opts: {
  readonly name: string;
  readonly id: string;
  readonly castShadow: boolean;
  readonly receiveShadow: boolean;
}): AuraNodeBuilder<AuraGroupNode> {
  const { castShadow, receiveShadow } = opts;
  const R = BELLKEEPER_RIG_SPEC;

  const staffChime = group(
    "hero-staff-chime",
    [buildPartNode("hero-staff-chime-mesh", buildStaffChimeSlots(), castShadow, receiveShadow)],
    { position: [...R.staffChimeOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-staff-chime" });

  const staffRibbon = group(
    "hero-staff-ribbon",
    [buildPartNode("hero-staff-ribbon-mesh", buildStaffRibbonSlots(), false, receiveShadow)],
    { position: [...R.staffRibbonOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-staff-ribbon" });

  const rightArm = group(
    "hero-arm-r",
    [
      buildPartNode("hero-arm-r-mesh", buildBellkeeperRightArmAndStaffSlots(), castShadow, receiveShadow),
      staffChime,
      staffRibbon
    ],
    { position: [...R.rightShoulderOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-arm-r" });

  const leftArm = group(
    "hero-arm-l",
    [buildPartNode("hero-arm-l-mesh", buildBellkeeperLeftArmSlots(), castShadow, receiveShadow)],
    { position: [...R.leftShoulderOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-arm-l" });

  const head = group(
    "hero-head",
    [buildPartNode("hero-head-mesh", buildBellkeeperHeadSlots(), castShadow, receiveShadow)],
    { position: [...R.headOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-head" });

  const cloakTail = group(
    "hero-cloak-tail",
    [buildPartNode("hero-cloak-tail-mesh", buildBellkeeperCloakTailSlots(), castShadow, receiveShadow)],
    { position: [...R.cloakTailOffset], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-cloak-tail" });

  const torso = group(
    "hero-torso",
    [
      buildPartNode("hero-torso-mesh", buildBellkeeperTorsoSlots(), castShadow, receiveShadow),
      cloakTail,
      head,
      leftArm,
      rightArm
    ],
    { position: [0, R.torsoOffsetY, 0], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-torso" });

  const makeLeg = (side: "l" | "r", signX: number) => {
    const foot = group(
      `hero-foot-${side}`,
      [buildPartNode(`hero-foot-${side}-mesh`, buildBellkeeperFootSlots(), castShadow, receiveShadow)],
      { position: [0, -R.shinLen, 0], rotationOrder: "ZYX" }
    ).runtime({ id: `hero-foot-${side}` });

    const shin = group(
      `hero-shin-${side}`,
      [buildPartNode(`hero-shin-${side}-mesh`, buildBellkeeperShinSlots(), castShadow, receiveShadow), foot],
      { position: [0, -R.thighLen, 0], rotationOrder: "ZYX" }
    ).runtime({ id: `hero-shin-${side}` });

    return group(
      `hero-leg-${side}`,
      [buildPartNode(`hero-leg-${side}-mesh`, buildBellkeeperThighSlots(), castShadow, receiveShadow), shin],
      { position: [signX * R.hipHalfWidth, 0, 0], rotationOrder: "ZYX" }
    ).runtime({ id: `hero-leg-${side}` });
  };

  const hips = group(
    "hero-hips",
    [
      buildPartNode("hero-pelvis-mesh", buildBellkeeperPelvisSlots(), castShadow, receiveShadow),
      torso,
      makeLeg("l", 1),
      makeLeg("r", -1)
    ],
    { position: [0, R.hipsRestY, 0], rotationOrder: "ZYX" }
  ).runtime({ id: "hero-hips" });

  return group(opts.name, [hips], { rotationOrder: "YXZ" }).runtime({ id: opts.id });
}

/** Measures the exact static rest-pose vertex Y bounds of the procedural Bellkeeper Wanderer (`minY === 0`, `maxY === 2.9`). */
export function measureBellkeeperRestBounds(): { readonly minY: number; readonly maxY: number; readonly height: number } {
  const R = BELLKEEPER_RIG_SPEC;
  const torsoY = R.hipsRestY + R.torsoOffsetY;
  const shinY = R.hipsRestY - R.thighLen;
  const footY = shinY - R.shinLen;
  const groups: readonly [readonly MultiMatSlot[], number][] = [
    [buildBellkeeperPelvisSlots(), R.hipsRestY],
    [buildBellkeeperTorsoSlots(), torsoY],
    [buildBellkeeperCloakTailSlots(), torsoY + R.cloakTailOffset[1]],
    [buildBellkeeperHeadSlots(), torsoY + R.headOffset[1]],
    [buildBellkeeperLeftArmSlots(), torsoY + R.leftShoulderOffset[1]],
    [buildBellkeeperRightArmAndStaffSlots(), torsoY + R.rightShoulderOffset[1]],
    [buildStaffChimeSlots(), torsoY + R.rightShoulderOffset[1] + R.staffChimeOffset[1]],
    [buildStaffRibbonSlots(), torsoY + R.rightShoulderOffset[1] + R.staffRibbonOffset[1]],
    [buildBellkeeperThighSlots(), R.hipsRestY],
    [buildBellkeeperShinSlots(), shinY],
    [buildBellkeeperFootSlots(), footY]
  ];
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const [slots, baseY] of groups) {
    for (const s of slots) {
      const p = s.mesh.positions;
      for (let i = 1; i < p.length; i += 3) {
        const y = p[i]! + baseY;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  return { minY, maxY, height: maxY - minY };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

function solveTwoBoneLegPitch(hipsY: number, soleY: number, soleZ: number, swingFootPitch: number): {
  readonly thighPitch: number;
  readonly kneePitch: number;
  readonly footPitch: number;
} {
  const { thighLen: L1, shinLen: L2, soleOffset } = BELLKEEPER_RIG_SPEC;
  const ankleY = soleY + soleOffset;
  const dy = Math.max(0.25, hipsY - ankleY);
  const dz = soleZ;
  const reachMax = L1 + L2 - 0.002;
  const reachMin = Math.abs(L1 - L2) + 0.02;
  const dist = clamp(Math.hypot(dz, dy), reachMin, reachMax);
  const cosKnee = clamp((dist * dist - L1 * L1 - L2 * L2) / (2 * L1 * L2), -1, 1);
  const kneePitch = Math.acos(cosKnee);
  const phi = Math.atan2(-dz, dy);
  const gamma = Math.atan2(L2 * Math.sin(kneePitch), L1 + L2 * Math.cos(kneePitch));
  const thighPitch = phi - gamma;
  const footPitch = -(thighPitch + kneePitch) + swingFootPitch;
  return { thighPitch, kneePitch, footPitch };
}

function sampleFootStepCurve(
  gait: Gait,
  cycle01: number,
  strikePhase: number
): { readonly soleY: number; readonly soleZ: number; readonly swingPitch: number } {
  if (gait === "Idle") {
    return { soleY: 0, soleZ: strikePhase < 0.3 ? -0.024 : 0.024, swingPitch: 0 };
  }
  const p = (((cycle01 - strikePhase) % 1) + 1) % 1;
  const isRun = gait === "Run";
  const T = CLIP_SECONDS[gait];
  const V = STRIDE_SPEED[gait];
  const stanceFrac = isRun ? 0.3 : 0.5;
  const zHalf = 0.5 * V * (stanceFrac * T);
  if (p <= stanceFrac) {
    const s = p / stanceFrac;
    return { soleY: 0, soleZ: zHalf * (1 - 2 * s), swingPitch: 0 };
  }
  const w = (p - stanceFrac) / (1 - stanceFrac);
  const liftPeak = isRun ? 0.3 : 0.22;
  const pitchAmp = isRun ? 0.28 : 0.18;
  return {
    soleY: liftPeak * Math.pow(Math.max(0, Math.sin(Math.PI * w)), 0.45),
    soleZ: -zHalf * Math.cos(Math.PI * w),
    swingPitch: pitchAmp * Math.sin(Math.PI * 2 * w)
  };
}

/**
 * Pure bounded non-cumulative pose sampler for the articulated Bellkeeper Wanderer.
 * Synchronized with `CLIP_SECONDS`, `STRIDE_SPEED`, and `RIGHT_STRIKE_PHASE`:
 * planted boot soles stay flush at `y = 0` (`minY = 0`) and sweep backward at the exact gait stride speed.
 */
export function sampleBellkeeperRigPose(input: BellkeeperPoseInput): BellkeeperRigPose {
  const R = BELLKEEPER_RIG_SPEC;
  const { gait, phaseSeconds } = input;
  const dur = CLIP_SECONDS[gait];
  const u = (((phaseSeconds / dur) % 1) + 1) % 1;
  const tau = u * Math.PI * 2;
  const windT = input.windTime ?? phaseSeconds;
  const gust = clamp(input.gust ?? 1, 0.5, 2.6);
  const ring = clamp(input.bellRing ?? 0, 0, 1);
  const lookYaw = clamp(input.lookYaw ?? 0, -0.7, 0.7);
  const lookPitch = clamp(input.lookPitch ?? 0, -0.38, 0.38);
  const hop = input.hopPhase ?? "idle";
  const onBoat = input.onBoat === true;

  if (onBoat) {
    const breath = Math.sin(windT * 1.55);
    const leftIk = solveTwoBoneLegPitch(1.25, 0, 0.05, 0);
    const rightIk = solveTwoBoneLegPitch(1.25, 0, -0.05, 0);
    return {
      hipsPos: [0, 1.25, 0],
      hipsRot: [0, 0, 0],
      torsoRot: [0.03 + 0.014 * breath, 0.04 * Math.sin(windT * 0.7), 0.02 * Math.sin(windT * 0.9)],
      headRot: [-0.04 + lookPitch, lookYaw + 0.08 * Math.sin(windT * 0.5), 0],
      cloakTailRot: [0.16 + 0.06 * gust + 0.05 * Math.sin(windT * 2.1), 0.06 * Math.sin(windT * 1.4), 0.04 * Math.cos(windT * 1.7)],
      leftArmRot: [0.08 + 0.02 * breath, 0, 0.08],
      rightArmRot: [-0.22 + 0.02 * breath, -0.05, -0.06],
      staffChimeRot: [0.08 * Math.sin(windT * 2.6), 0, 0.07 * Math.cos(windT * 2.1)],
      staffRibbonRot: [0.22 + 0.08 * gust + 0.09 * Math.sin(windT * 3.1), 0.12 * Math.sin(windT * 2.4), 0.08 * Math.cos(windT * 2.8)],
      leftLegRot: [leftIk.thighPitch, 0, 0],
      leftShinRot: [leftIk.kneePitch, 0, 0],
      leftFootRot: [leftIk.footPitch, 0, 0],
      rightLegRot: [rightIk.thighPitch, 0, 0],
      rightShinRot: [rightIk.kneePitch, 0, 0],
      rightFootRot: [rightIk.footPitch, 0, 0]
    };
  }

  const isIdle = gait === "Idle";
  const isRun = gait === "Run";
  const breath = Math.sin(tau);
  const strikeAngle = (u - RIGHT_STRIKE_PHASE) * Math.PI * 2;
  const hipsY = isIdle
    ? 1.26 + 0.007 * breath
    : isRun
      ? 1.075 + 0.026 * Math.cos(strikeAngle * 2)
      : 1.135 + 0.016 * Math.cos(strikeAngle * 2);

  const rightStep = sampleFootStepCurve(gait, u, RIGHT_STRIKE_PHASE);
  const leftStep = sampleFootStepCurve(gait, u, (RIGHT_STRIKE_PHASE + 0.5) % 1);

  // Graceful mid-air tuck during meadow hops while preserving grounded soles otherwise
  const hopTuck = hop === "air" ? 1 : hop === "takeoff" ? 0.45 : hop === "landing" ? 0.35 : 0;
  const leftSoleY = leftStep.soleY + hopTuck * 0.12;
  const rightSoleY = rightStep.soleY + hopTuck * 0.16;

  const leftIk = solveTwoBoneLegPitch(hipsY, leftSoleY, leftStep.soleZ, leftStep.swingPitch);
  const rightIk = solveTwoBoneLegPitch(hipsY, rightSoleY, rightStep.soleZ, rightStep.swingPitch);

  // Counter-swinging arms & poised shepherd staff + sanctuary bell-ring salute
  const strideSin = Math.sin(strikeAngle);
  const moveAmt = isIdle ? 0 : isRun ? 1 : 0.68;
  const leftArmSwing = isIdle ? 0.03 * breath : -0.44 * moveAmt * strideSin - 0.12 * hopTuck;
  const rightArmBase = isIdle ? -0.26 + 0.025 * breath : -0.34 + 0.24 * moveAmt * strideSin - 0.14 * hopTuck;
  const rightArmSalute = -0.68 * Math.sin(ring * Math.PI);

  const torsoLean = (isIdle ? 0.02 + 0.014 * breath : isRun ? 0.13 : 0.065) - 0.06 * Math.sin(ring * Math.PI);
  const torsoTwist = isIdle ? 0.018 * Math.sin(tau * 0.5) : -0.11 * moveAmt * strideSin;
  const torsoSway = isIdle ? 0.01 * Math.cos(tau) : 0.032 * moveAmt * strideSin;

  const cloakBillow = 0.08 + 0.24 * moveAmt + 0.07 * (gust - 1) + 0.055 * Math.sin(windT * 2.35 + u * Math.PI * 2);
  const chimePendulumX =
    0.16 * moveAmt * Math.cos(strikeAngle * 2) +
    0.06 * gust * Math.sin(windT * 3.2) +
    0.36 * ring * Math.sin(windT * 9.5);
  const chimePendulumZ = 0.07 * gust * Math.cos(windT * 2.7) + 0.22 * ring * Math.cos(windT * 8.2);

  return {
    hipsPos: [0, clamp(hipsY, 0.95, R.hipsRestY), 0],
    hipsRot: [0, 0, 0],
    torsoRot: [torsoLean, torsoTwist, torsoSway],
    headRot: [-torsoLean * 0.55 + lookPitch - 0.14 * Math.sin(ring * Math.PI), -torsoTwist * 0.65 + lookYaw, -torsoSway * 0.5],
    cloakTailRot: [clamp(cloakBillow, 0.02, 0.62), 0.08 * Math.sin(windT * 1.65) - torsoTwist * 0.5, 0.06 * gust * Math.cos(windT * 1.9)],
    leftArmRot: [leftArmSwing, 0.04 * moveAmt * strideSin, 0.09 + 0.08 * hopTuck],
    rightArmRot: [rightArmBase + rightArmSalute, -0.06 + 0.08 * Math.sin(ring * Math.PI), -0.08 - 0.06 * hopTuck],
    staffChimeRot: [clamp(chimePendulumX, -0.65, 0.65), 0, clamp(chimePendulumZ, -0.5, 0.5)],
    staffRibbonRot: [0.24 + 0.22 * moveAmt + 0.1 * gust + 0.12 * Math.sin(windT * 3.8), 0.16 * Math.sin(windT * 2.9), 0.12 * Math.cos(windT * 3.3)],
    leftLegRot: [leftIk.thighPitch, 0, 0],
    leftShinRot: [leftIk.kneePitch, 0, 0],
    leftFootRot: [leftIk.footPitch, 0, 0],
    rightLegRot: [rightIk.thighPitch, 0, 0],
    rightShinRot: [rightIk.kneePitch, 0, 0],
    rightFootRot: [rightIk.footPitch, 0, 0]
  };
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerp3 = (a: V3, b: V3, t: number): V3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Smoothly blends two bounded Bellkeeper poses across a gait crossfade (`0 <= t <= 1`). */
export function blendBellkeeperRigPoses(a: BellkeeperRigPose, b: BellkeeperRigPose, t: number): BellkeeperRigPose {
  const s = clamp(t, 0, 1);
  if (s <= 0) return a;
  if (s >= 1) return b;
  return {
    hipsPos: lerp3(a.hipsPos, b.hipsPos, s),
    hipsRot: lerp3(a.hipsRot, b.hipsRot, s),
    torsoRot: lerp3(a.torsoRot, b.torsoRot, s),
    headRot: lerp3(a.headRot, b.headRot, s),
    cloakTailRot: lerp3(a.cloakTailRot, b.cloakTailRot, s),
    leftArmRot: lerp3(a.leftArmRot, b.leftArmRot, s),
    rightArmRot: lerp3(a.rightArmRot, b.rightArmRot, s),
    staffChimeRot: lerp3(a.staffChimeRot, b.staffChimeRot, s),
    staffRibbonRot: lerp3(a.staffRibbonRot, b.staffRibbonRot, s),
    leftLegRot: lerp3(a.leftLegRot, b.leftLegRot, s),
    leftShinRot: lerp3(a.leftShinRot, b.leftShinRot, s),
    leftFootRot: lerp3(a.leftFootRot, b.leftFootRot, s),
    rightLegRot: lerp3(a.rightLegRot, b.rightLegRot, s),
    rightShinRot: lerp3(a.rightShinRot, b.rightShinRot, s),
    rightFootRot: lerp3(a.rightFootRot, b.rightFootRot, s)
  };
}

export interface BellkeeperJointHandle {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
}

/** Writes a `BellkeeperRigPose` onto the live runtime group handles (non-cumulative absolute transforms). */
export function applyBellkeeperRigPose(
  getNode: (id: string) => BellkeeperJointHandle | undefined,
  pose: BellkeeperRigPose
): void {
  const hips = getNode("hero-hips");
  if (!hips) return;
  hips.setPosition(pose.hipsPos[0], pose.hipsPos[1], pose.hipsPos[2]);
  hips.setRotation(pose.hipsRot[0], pose.hipsRot[1], pose.hipsRot[2]);
  const rot = (id: string, r: V3): void => {
    getNode(id)?.setRotation(r[0], r[1], r[2]);
  };
  rot("hero-torso", pose.torsoRot);
  rot("hero-head", pose.headRot);
  rot("hero-cloak-tail", pose.cloakTailRot);
  rot("hero-arm-l", pose.leftArmRot);
  rot("hero-arm-r", pose.rightArmRot);
  rot("hero-staff-chime", pose.staffChimeRot);
  rot("hero-staff-ribbon", pose.staffRibbonRot);
  rot("hero-leg-l", pose.leftLegRot);
  rot("hero-shin-l", pose.leftShinRot);
  rot("hero-foot-l", pose.leftFootRot);
  rot("hero-leg-r", pose.rightLegRot);
  rot("hero-shin-r", pose.rightShinRot);
  rot("hero-foot-r", pose.rightFootRot);
}

function rotateZYX(v: V3, r: V3): V3 {
  const cx = Math.cos(r[0]), sx = Math.sin(r[0]);
  const cy = Math.cos(r[1]), sy = Math.sin(r[1]);
  const cz = Math.cos(r[2]), sz = Math.sin(r[2]);
  const x1 = v[0];
  const y1 = v[1] * cx - v[2] * sx;
  const z1 = v[1] * sx + v[2] * cx;
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;
  return [x2 * cz - y2 * sz, x2 * sz + y2 * cz, z2];
}

const add3 = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];

/** Exact forward-kinematics ankle and toe positions in hero root space for a `BellkeeperRigPose`. */
export function computeBellkeeperFootWorld(pose: BellkeeperRigPose): {
  readonly left: V3;
  readonly right: V3;
  readonly toeLeft: V3;
  readonly toeRight: V3;
} {
  const R = BELLKEEPER_RIG_SPEC;
  const legFk = (signX: number, legRot: V3, shinRot: V3, footRot: V3): { readonly ankle: V3; readonly toe: V3 } => {
    const hipLocal: V3 = [signX * R.hipHalfWidth, 0, 0];
    const kneeFromHip = rotateZYX([0, -R.thighLen, 0], legRot);
    const ankleFromKnee = rotateZYX(rotateZYX([0, -R.shinLen, 0], shinRot), legRot);
    const toeInFoot = rotateZYX([...R.toeFromAnkle], footRot);
    const toeFromAnkle = rotateZYX(rotateZYX(toeInFoot, shinRot), legRot);
    const ankleInHips = add3(hipLocal, add3(kneeFromHip, ankleFromKnee));
    const toeInHips = add3(ankleInHips, toeFromAnkle);
    return {
      ankle: add3(pose.hipsPos, rotateZYX(ankleInHips, pose.hipsRot)),
      toe: add3(pose.hipsPos, rotateZYX(toeInHips, pose.hipsRot))
    };
  };
  const L = legFk(1, pose.leftLegRot, pose.leftShinRot, pose.leftFootRot);
  const Rt = legFk(-1, pose.rightLegRot, pose.rightShinRot, pose.rightFootRot);
  return { left: L.ankle, right: Rt.ankle, toeLeft: L.toe, toeRight: Rt.toe };
}

/** Exact forward-kinematics position of the Bellkeeper's staff-holding right hand in hero root space. */
export function computeBellkeeperRightHandLocal(pose: BellkeeperRigPose): V3 {
  const R = BELLKEEPER_RIG_SPEC;
  const gripInArm = rotateZYX([...R.rightHandGripOffset], pose.rightArmRot);
  const inTorso = add3([...R.rightShoulderOffset], gripInArm);
  const inHips = add3([0, R.torsoOffsetY, 0], rotateZYX(inTorso, pose.torsoRot));
  return add3(pose.hipsPos, rotateZYX(inHips, pose.hipsRot));
}

export function mountProceduralStaticScenery(
  builder: SceneBuilder,
  sc: Scenery,
  flags: { bell: boolean; bellModel?: boolean; cottage: boolean; trees: boolean; stones: boolean; shrubs: boolean },
  castShadow: boolean,
  receiveShadow: boolean,
  bellPoseOf: (tower: { x: number; y: number; z: number; h?: number }) => { position: [number, number, number]; scale: number }
): void {
  const specs = getFloraSpecs();
  const batchMats = getInstFloraMats();
  if (flags.cottage) {
    sc.placements.cottages.forEach((p, i) => {
      builder.add(createHighlandCottageNode({ name: `cottage-${i}`, position: [p.x, p.y, p.z], yaw: p.yaw, scale: p.s, variant: i, castShadow, receiveShadow }));
    });
    const millY = terrainHeight(STRUCTURES.windmill.x, STRUCTURES.windmill.z) - 0.2;
    builder.add(createWindmillTowerNode({ name: "windmill-tower", position: [STRUCTURES.windmill.x, millY, STRUCTURES.windmill.z], castShadow, receiveShadow }));
    builder.add(createPackhorseBridgeNode({ name: "packhorse-bridge", position: [-4.0, terrainHeight(-4.0, -6.54) - 0.16, -6.54], yaw: Math.PI * 0.5 - 0.06, castShadow, receiveShadow }));
    builder.add(createWaysideShrineNode({ name: "wayside-shrine", position: [21.8, terrainHeight(21.8, 7.6) - 0.05, 7.6], yaw: -0.28, castShadow, receiveShadow }));

    // Instanced village split-rail & picket fences (collapses meadow fence segments into 1 draw call)
    const fenceXfs: AuraTransformSpec[] = [];
    for (let x = -18; x < -7; x += 4) {
      fenceXfs.push({ position: [x, terrainHeight(x, -4) - 0.03, -4], rotation: [0, 0, 0], scale: [1.02, 1, 1] });
    }
    for (let x = 25; x < 42; x += 4) {
      fenceXfs.push({ position: [x, terrainHeight(x, 7) - 0.03, 7], rotation: [0, 0, 0], scale: [0.96, 1, 1] });
    }
    builder.add(instances.custom(specs.fenceBay, { name: "village-fences", material: batchMats.fenceWood, transforms: fenceXfs, castShadow, receiveShadow }));

    // Instanced dry-stone walls (collapses stone wall spans into 1 draw call)
    const wallXfs: AuraTransformSpec[] = [
      { position: [-14, terrainHeight(-14, -4.45) - 0.04, -4.45], rotation: [0, 0, 0], scale: [11.4 / 6, 1, 1] },
      { position: [33, terrainHeight(33, 7.45) - 0.04, 7.45], rotation: [0, 0, 0], scale: [18.8 / 6, 1, 1] }
    ];
    builder.add(instances.custom(specs.dryStoneBay, { name: "village-drystone-walls", material: batchMats.stone, transforms: wallXfs, castShadow, receiveShadow }));

    // Instanced wayside & jetty lanterns (collapses 3 multi-material lantern assemblies into instanced batches)
    const deckY = SEA_LEVEL + 0.82;
    const lanternXfs: AuraTransformSpec[] = [
      { position: [31, deckY, -17.52], rotation: [0, 0, 0], scale: [1, 1, 1] },
      { position: [-13.5, terrainHeight(-13.5, 2.35) - 0.04, 2.35], rotation: [0, 0.35, 0], scale: [1, 1, 1] },
      { position: [13.5, terrainHeight(13.5, 3.35) - 0.04, 3.35], rotation: [0, -0.3, 0], scale: [1, 1, 1] }
    ];
    builder.add(instances.custom(specs.lanternPost, { name: "village-lantern-posts", material: batchMats.iron, transforms: lanternXfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.lanternBrass, { name: "village-lantern-brass", material: batchMats.brass, transforms: lanternXfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.lanternEmber, { name: "village-lantern-embers", material: batchMats.ember, transforms: lanternXfs, castShadow: false, receiveShadow: false }));
    builder.add(instances.custom(specs.lanternPane, { name: "village-lantern-glass", material: getMullionGlassMat(), transforms: lanternXfs, castShadow: false, receiveShadow }));
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
    const stoneXfs: AuraTransformSpec[] = [
      ...sc.placements.stones.map((p) => ({ position: [p.x, p.y, p.z] as V3, rotation: [0, p.yaw, 0] as V3, scale: [p.s, p.s, p.s] as V3 })),
      { position: [43.5, terrainHeight(43.5, 7.4) - 0.06, 7.4], rotation: [0, -0.42, 0], scale: [0.78, 0.78, 0.78] }
    ];
    builder.add(instances.custom(specs.stoneCairn, { name: "village-standing-stones", material: batchMats.stone, transforms: stoneXfs, castShadow, receiveShadow }));
    builder.add(instances.custom(specs.stoneRune, { name: "village-stone-runes", material: batchMats.rune, transforms: stoneXfs, castShadow: false, receiveShadow: false }));
  }
}

export function mountProceduralAnimatedActors(
  builder: SceneBuilder,
  flags: { letter: boolean; kite?: boolean; wisp: boolean; boat: boolean; hero?: boolean },
  letterCount: number,
  castShadow: boolean,
  receiveShadow: boolean
): void {
  if (flags.hero) {
    builder.add(createBellkeeperWandererNode({ name: "hero", id: "hero", castShadow, receiveShadow }));
  }
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
