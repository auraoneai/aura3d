/**
 * Slingshot Siege — scene construction (WP-12 visual & batching overhaul).
 *
 * One persistent scene built once: every gameplay visual is a POOLED or INSTANCED
 * runtime node driven by the fixed-step presenter each frame (5 instanced block
 * families, 4 instanced prop pools + iron/lacquer keg bands, raider boss rigs,
 * 5 visually distinct Hero Gull ammo variants, carved driftwood Y-fork + saddle-leather
 * pouch + strain-colored dual-backend elastic bands, parabolic trajectory ribbon,
 * and 32-frame dust/sparks flipbook burst cards).
 */
import {
  camera,
  effects,
  geometry,
  instances,
  lights,
  looks,
  material,
  primitives,
  scene,
  sky,
  world,
  type AuraColor,
  type AuraDirectionalShadowOptions,
  type AuraMaterialSpec,
  type AuraModelMaterialOverride,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";
import { MATERIALS, type SiegeMaterialId } from "./materials";
import type { AmmoId } from "./ammo";
import type { ChapterDef } from "./levels";
import { chapterLook, sunDirection, type ChapterLook } from "./look";
import { beachDressing } from "./dressing";
import { islandSurface } from "../art/surfaces";
import { SEA_STACK_PLACEMENT, farSetPiecesFor, type FarSetPiece as FarSetPiecePlacement } from "../art/setPieces";
import {
  CRAFT_MATS,
  bevelBoxMesh,
  buildArchedStoneBridgeNode,
  buildBarrelHoopsSpec,
  buildChapterBackdropLandmark,
  buildCliffTurfCapSpec,
  buildCoastalPinesNodes,
  buildDriftwoodSpec,
  buildFacetedSeaCliffMesh,
  buildFlagBastionNode,
  buildFortressFoundationNode,
  buildGatehouseNode,
  buildHeroSiegeBirdNode,
  buildHorizonCloudsNode,
  buildLaunchBastionNode,
  buildLobsterPotSpec,
  buildPlankScatterNode,
  buildProceduralBarrelSpec,
  buildProceduralCrateSpec,
  buildProceduralPlankSpec,
  buildQuayBollardSpec,
  buildRaiderBossNode,
  buildScallopShellSpec,
  buildSeaGrassClumpSpec,
  buildSeaStackLighthouseLandmark,
  buildSiegeSlingshotRigNode,
  buildSlingshotYokeNode,
  buildTerracedIslandSpec,
  buildWatchtowerNode,
  buildWindmillNode,
  buildWindmillSailBladeNode,
  latheMesh,
  mergeRawMeshes
} from "../art/proceduralModels";
import { levelSignNodes } from "./sign";
import {
  BARREL_BAND_POOL_ID,
  BLOCK_FAMILIES,
  PARKED_BLOCK,
  blockFamilyNodeId,
  propPoolNodeId
} from "./blockInstances";
import {
  blastSparksMaterial,
  coastalSeaMaterial,
  elasticBandMaterial,
  masonryPlumeMaterial,
  trajectoryRibbonMaterial
} from "./shaders";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";

// ----------------------------------------------------------------- pools --

export const POOL = {
  blocks: 80,
  crates: 18,
  barrels: 12,
  planks: 24,
  gullRigs: 8,
  projectiles: 10,
  debris: 30,
  dots: 20,
  plumes: 6,
  blasts: 4,
  windmillBlades: 4,
  windmills: 3
} as const;

export function blockNodeId(i: number): string { return `v-block-${i}`; }
export function crateNodeId(i: number): string { return `v-crate-${i}`; }
export function barrelNodeId(i: number): string { return `v-barrel-${i}`; }
export function plankNodeId(i: number): string { return `v-plank-${i}`; }
export function gullPartId(g: number, part: "body" | "head" | "beak" | "wingL" | "wingR" | "tail"): string { return `v-gull-${g}-${part}`; }
export function projectileNodeId(i: number): string { return `v-proj-${i}`; }
export function debrisNodeId(i: number): string { return `v-debris-${i}`; }
export function dotNodeId(i: number): string { return `v-dot-${i}`; }
export function plumeNodeId(i: number): string { return `v-plume-${i}`; }
export function blastNodeId(i: number): string { return `v-blast-${i}`; }
export function bladeNodeId(mill: number, blade: number): string { return `v-mill-${mill}-blade-${blade}`; }
export function millHubNodeId(mill: number): string { return `v-mill-${mill}-hub`; }
export function millPoleNodeId(mill: number): string { return `v-mill-${mill}-pole`; }
export function farPieceNodeId(key: FarSetPiecePlacement["key"]): string { return `far-${key.slice(6)}`; }

/** All chapter-selectable far horizon set-piece placements so `loadLevel()` can swap chapters live. */
export const ALL_FAR_PIECES: readonly { readonly chapter: number | null; readonly piece: FarSetPiecePlacement }[] = [
  { chapter: null, piece: farSetPiecesFor(0)[0]! },
  { chapter: 1, piece: farSetPiecesFor(1)[1]! },
  { chapter: 2, piece: farSetPiecesFor(2)[1]! },
  { chapter: 4, piece: farSetPiecesFor(4)[1]! },
  { chapter: 5, piece: farSetPiecesFor(5)[1]! }
];

/**
 * Every pooled node that starts parked at y -120. Hidden when unused so idle slots cost 0 draws.
 */
export function pooledNodeIds(): string[] {
  const ids: string[] = [];
  for (let i = 0; i < POOL.blocks; i += 1) ids.push(blockNodeId(i));
  for (let i = 0; i < POOL.crates; i += 1) ids.push(crateNodeId(i));
  for (let i = 0; i < POOL.barrels; i += 1) ids.push(barrelNodeId(i));
  for (let i = 0; i < POOL.planks; i += 1) ids.push(plankNodeId(i));
  for (let i = 0; i < POOL.projectiles; i += 1) ids.push(projectileNodeId(i));
  for (let i = 0; i < POOL.debris; i += 1) ids.push(debrisNodeId(i));
  for (let i = 0; i < POOL.dots; i += 1) ids.push(dotNodeId(i));
  for (let i = 0; i < POOL.plumes; i += 1) ids.push(plumeNodeId(i));
  for (let i = 0; i < POOL.blasts; i += 1) ids.push(blastNodeId(i));
  return ids;
}

export const SLING_IDS = {
  catapult: "sling-catapult",
  forkL: "sling-fork-l",
  forkR: "sling-fork-r",
  pouch: "sling-pouch",
  bandL: "sling-band-l",
  bandR: "sling-band-r",
  loaded: "sling-loaded",
  ammoCrest: "sling-ammo-crest"
} as const;

export const PROP_IDS = {
  watchtower: "prop-watchtower",
  gatehouse: "prop-gatehouse",
  windmillProp: "prop-windmill",
  stoneBridge: "prop-stone-bridge",
  plankScatter: "prop-plank-scatter",
  flag: "fortress-flag",
  flagPole: "fortress-flag-pole",
  cliffs: "coastal-limestone-cliffs"
} as const;

// ------------------------------------------------------------- materials --

export const BLOCK_LOOKS: Readonly<Record<SiegeMaterialId, readonly AuraModelMaterialOverride[]>> = {
  wood: [{ color: "#e8be86", colorMode: "multiply", roughness: 0.72, metallic: 0, clearcoat: 0.38, clearcoatRoughness: 0.26 }],
  stone: [{ color: "#dbd6ca", colorMode: "multiply", roughness: 0.88, metallic: 0, clearcoat: 0.18, clearcoatRoughness: 0.42 }],
  glass: [{
    color: "#bfe9f5", colorMode: "replace", replaceTextures: true, roughness: 0.06, metallic: 0, opacity: 0.55,
    clearcoat: 1, clearcoatRoughness: 0.04, transmission: 0.65, envMapIntensity: 1.48,
    rim: { color: "#eafcff", power: 3, intensity: 0.62 }
  }],
  ice: [{
    color: "#d6f0ff", colorMode: "replace", replaceTextures: true, roughness: 0.18, metallic: 0, opacity: 0.82,
    clearcoat: 0.85, clearcoatRoughness: 0.08,
    emissive: "#bfe6ff", emissiveIntensity: 0.35, rim: { color: "#f0fbff", power: 2.5, intensity: 0.52 }
  }],
  obsidian: [{
    color: "#241d34", colorMode: "replace", replaceTextures: true, roughness: 0.1, metallic: 0.16,
    clearcoat: 1, clearcoatRoughness: 0.03, rim: { color: "#a874ff", power: 4, intensity: 0.38 }
  }]
};

export function blockLook(id: SiegeMaterialId): readonly AuraModelMaterialOverride[] {
  return BLOCK_LOOKS[id] ?? BLOCK_LOOKS.wood;
}

/**
 * Five visually unmistakable Hero Gull ammo variants (WP-12):
 * Scout Gull (`pebble`), Iron-Helm Heavy Pelican (`stone`), Cerulean Trio Swiftlet (`triple`),
 * Abyssal Cuttle-Gull (`squid`), and Blazing Cinder Gull (`ember`).
 */
export const AMMO_GULL_LOOKS: Readonly<Record<AmmoId, readonly AuraModelMaterialOverride[]>> = {
  pebble: [{
    color: "#fff8eb", colorMode: "multiply", roughness: 0.56, metallic: 0, clearcoat: 0.25,
    rim: { color: "#ffd766", power: 2.8, intensity: 0.34 }
  }],
  stone: [{
    color: "#9db0c9", colorMode: "multiply", roughness: 0.32, metallic: 0.45, clearcoat: 0.72, clearcoatRoughness: 0.12,
    rim: { color: "#e2eeff", power: 2.6, intensity: 0.48 }
  }],
  triple: [{
    color: "#7ad6ff", colorMode: "multiply", roughness: 0.42, metallic: 0.06, clearcoat: 0.55,
    rim: { color: "#e8fbff", power: 2.4, intensity: 0.52 }
  }],
  squid: [{
    color: "#ba94ff", colorMode: "multiply", roughness: 0.36, metallic: 0.12, clearcoat: 0.78,
    rim: { color: "#9ef7dc", power: 2.4, intensity: 0.58 }
  }],
  ember: [{
    color: "#ff883d", colorMode: "multiply", roughness: 0.3, metallic: 0.08, clearcoat: 0.88,
    emissive: "#ff5c1c", emissiveIntensity: 0.08,
    rim: { color: "#ffe082", power: 2.2, intensity: 0.68 }
  }]
};

export function ammoGullLook(ammo: AmmoId): readonly AuraModelMaterialOverride[] {
  return AMMO_GULL_LOOKS[ammo] ?? AMMO_GULL_LOOKS.pebble;
}

export function seaGloss(color: AuraColor, envMapIntensity: number): AuraMaterialSpec {
  return material.physical({ color, roughness: 0.08, metallic: 0, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity });
}

/**
 * Distinct multi-lobe material response across all 5 fortress structural families (WP-12):
 *  - `wood`: warm timber beams with procedural wood-grain roughness & fiber relief under satin lacquer
 *  - `stone`: chiseled warm limestone blocks with mineral micro-roughness & crisp bevel catchlights
 *  - `glass`: physical refractive `studioGlass` (`#bfe9f5`, `roughness: 0.06`, `opacity: 0.55`)
 *  - `ice`: translucent glacial crystal with pale internal glow & clearcoat sheen
 *  - `obsidian`: high-gloss volcanic `lacquer` with violet grazing rim
 */
export const SOLID_BLOCK_MATERIALS: Readonly<Record<SiegeMaterialId, AuraMaterialSpec>> = {
  wood: material.pbr({
    name: "timber beam",
    color: "#b47740",
    roughness: 0.62,
    metallic: 0,
    envMapIntensity: 1.24
  }),
  stone: material.pbr({
    name: "chiseled limestone",
    color: "#d4cec0",
    roughness: 0.72,
    metallic: 0,
    envMapIntensity: 1.15
  }),
  glass: material.studioGlass({
    name: "fortress glass pane",
    tint: "#bfe9f5",
    color: "#bfe9f5",
    roughness: 0.06,
    opacity: 0.55,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    transmission: 0.65,
    thickness: 0.65,
    ior: 1.52,
    envMapIntensity: 1.48,
    rim: { color: "#eafcff", power: 3, intensity: 0.6 }
  }),
  ice: material.pbr({
    name: "glacial ice block",
    color: "#d6f0ff",
    roughness: 0.16,
    metallic: 0.04,
    opacity: 0.85,
    emissive: "#bfe6ff",
    emissiveIntensity: 0.3,
    practical: true,
    envMapIntensity: 1.38
  }),
  obsidian: material.pbr({
    name: "obsidian block",
    color: "#2a2338",
    roughness: 0.12,
    metallic: 0.22,
    envMapIntensity: 1.38
  })
};

export function solidBlockMaterial(id: SiegeMaterialId): AuraMaterialSpec {
  return SOLID_BLOCK_MATERIALS[id] ?? SOLID_BLOCK_MATERIALS.stone;
}

/** Explosive powder-keg crimson lacquer + dark forged-iron collar band material. */
export const KEG_BAND_MATERIAL: AuraMaterialSpec = material.pbr({
  name: "explosive keg band",
  color: "#8f201a",
  roughness: 0.24,
  metallic: 0.42,
  envMapIntensity: 1.35
});

/** Debris chips take the colour of the material they broke off. */
export function debrisLook(matId: string): readonly AuraModelMaterialOverride[] {
  const key = (matId in MATERIALS ? matId : "wood") as SiegeMaterialId;
  return [{ color: MATERIALS[key].debrisColor, colorMode: "replace", replaceTextures: true, roughness: 0.6 }];
}

function pbr(color: AuraColor, opts: { roughness?: number; metallic?: number; opacity?: number } = {}): AuraMaterialSpec {
  return material.pbr({ color, roughness: opts.roughness ?? 0.65, metallic: opts.metallic ?? 0, ...(opts.opacity !== undefined ? { opacity: opts.opacity } : {}) });
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (shift: number): number => {
    const va = (pa >> shift) & 255;
    const vb = (pb >> shift) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `#${((ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).padStart(6, "0")}`;
}

// ------------------------------------------------------------------ scene --

export interface StageNodes {
  readonly nodes: readonly (AuraSceneNode | AuraNodeBuilder<AuraSceneNode>)[];
  readonly cameraSpec: ReturnType<typeof camera.perspective>;
}

type StageNode = AuraSceneNode | AuraNodeBuilder<AuraSceneNode>;

export interface StageOptions {
  readonly reducedMotion: boolean;
  readonly ambientOcclusion?: boolean;
  readonly surfaceMaps?: boolean;
}

export const SIEGE_AO_NODE = "siege miniature ambient occlusion";
export const SIEGE_DOF_NODE = "siege miniature tilt-shift";
export const ISLAND_SHADOW_FIT = { center: [1.5, 0.8, -0.4] as [number, number, number], extent: 13.5, depth: 48 };

export function sunShadow(row: Pick<ChapterLook, "shadowSoftness">): AuraDirectionalShadowOptions {
  return {
    filter: "pcss",
    cascades: 2,
    mapSize: 2048,
    lightSize: row.shadowSoftness,
    maxDistance: 42,
    fit: { center: ISLAND_SHADOW_FIT.center, extent: ISLAND_SHADOW_FIT.extent, depth: ISLAND_SHADOW_FIT.depth }
  };
}

/**
 * Chapter look group: forces `background: false` on the HDRI node and drops any solid `look background`
 * child so `chapterSkyNode` (`sky.gradient` / `sky.preetham`) renders crisp coastal skies behind the sea-cliffs,
 * with zero `lights.ambient`.
 */
export function chapterLookNode(row: ChapterLook): StageNode {
  const look = looks.preset(row.preset, {
    ...(row.hdri !== undefined ? { hdri: row.hdri } : {}),
    environmentIntensity: row.environmentIntensity,
    environmentRotationDeg: row.environmentRotationDeg,
    exposureEv: row.exposureEv,
    sun: { elevationDeg: row.sun.elevationDeg, azimuthDeg: row.sun.azimuthDeg },
    key: { color: row.sun.color, intensity: row.sun.intensity, shadow: sunShadow(row) },
    rim: false,
    fog: { color: row.fog.color, near: row.fog.near, far: row.fog.far },
    accent: row.accent,
    background: row.horizon,
    grade: { contrast: row.grade.contrast, saturation: row.grade.saturation, temperature: row.grade.temperature, tint: row.grade.tint },
    post: row.post
  }) as unknown as { toJSON?: () => AuraSceneNode };
  if (typeof look.toJSON !== "function") return look as unknown as AuraSceneNode;
  const group = look.toJSON() as AuraSceneNode & { readonly children?: readonly AuraSceneNode[] };
  const replaced = new Set(["look ambient occlusion", "look bloom", "look background"]);
  const children = (group.children ?? [])
    .filter((c) => !replaced.has((c as { name?: string }).name ?? ""))
    .map((c) => (c.kind === "environment" ? ({ ...c, background: false } as AuraSceneNode) : c));
  return { ...group, children } as AuraSceneNode;
}

export function chapterSkyNode(row: ChapterLook): StageNode {
  const { model: skyModel, ...spec } = row.sky as { model: string } & Record<string, unknown>;
  const options = { name: `siege sky ch${row.chapter}`, captureEnvironment: false, affectsFog: row.skyFog, ...spec };
  return skyModel === "preetham"
    ? sky.preetham(options as unknown as Parameters<typeof sky.preetham>[0])
    : sky.gradient(options as unknown as Parameters<typeof sky.gradient>[0]);
}

export function chapterPracticals(row: ChapterLook): StageNode[] {
  const out: StageNode[] = [];
  const amber = row.accent;
  if (row.practicals.windows) {
    out.push(
      lights.point({ name: "siege window gatehouse", position: [9.6, 1.5, -2.0], color: "#ffb35c", intensity: 2.2, distance: 6, decay: 2 }),
      lights.point({ name: "siege window watchtower", position: [-12.2, 2.6, 4.0], color: "#ffb35c", intensity: 1.8, distance: 6, decay: 2 })
    );
  }
  if (row.practicals.lighthouse) {
    out.push(lights.spot({ name: "siege lighthouse", position: [-17, 6, -24], target: [2, 0.5, -2], angle: 0.32, penumbra: 0.6, distance: 60, decay: 1, color: "#fff1c8", intensity: 6 }));
  }
  if (row.practicals.lanterns) {
    out.push(lights.point({ name: "siege harbour lantern", position: [5.6, 1.4, 1.8], color: amber, intensity: 2.4, distance: 7, decay: 2 }));
  }
  if (row.flare) {
    const d = sunDirection(row.sun);
    out.push(lights.lensFlare({
      name: "siege sun flare",
      position: [d[0] * 320, d[1] * 320, d[2] * 320],
      intensity: 0.55,
      edgeFade: 0.2,
      elements: [
        { size: 420, distance: 0, color: row.sun.color },
        { size: 54, distance: 0.55, color: "#ffd9b0" },
        { size: 90, distance: 0.8, color: "#ffe9c4" },
        { size: 60, distance: 1, color: "#c4d8ff" }
      ]
    }));
  }
  return out;
}

/**
 * Miniature post stack (WP-12):
 *  - Tilt-shift `depthOfField` (`SIEGE_DOF_NODE`)
 *  - Crisp sun `contactShadows` grounding blocks & timber joints
 *  - `screenSpaceReflections` (`roughness: 0.22 <= 0.35`)
 *  - `cinematicBloom` (`name: "siege bloom"`)
 *  - Multi-bounce miniature `ambientOcclusion` (`SIEGE_AO_NODE`, `radius: 0.48`)
 *  - Optional `godRays` sunbeams on Chapter 2
 *  - `vignette` (dropped on reduced motion) + `antiAlias("fxaa")`
 */
export function chapterPost(row: ChapterLook, options: StageOptions): StageNode[] {
  const out: StageNode[] = [
    effects.depthOfField({ name: SIEGE_DOF_NODE, maxBlur: row.dof.maxBlur, tiltShift: { bandCenter: 0.54, bandWidth: row.dof.bandWidth, angleDeg: 0 } }),
    effects.contactShadows({ length: 0.35, thickness: 0.06, steps: 8, intensity: 0.85, lights: "sun" }),
    { ...effects.cinematicBloom({ threshold: row.bloom.threshold, intensity: row.bloom.intensity, color: "#fff4e6" }).toJSON(), name: "siege bloom" }
  ];
  if (row.chapter === 2 && !options.reducedMotion) {
    out.push(effects.godRays({ name: "siege greenhouse sunbeams", intensity: 0.24, decay: 0.93, samples: 32, color: "#fff5dc", medium: 0.14 }));
  }
  if (options.ambientOcclusion !== false) {
    out.push(effects.ambientOcclusion({ name: SIEGE_AO_NODE, radius: 0.48, intensity: 0.72, density: 0.62, multiBounce: false }));
  }
  if (!options.reducedMotion) out.push(effects.vignette({ intensity: row.vignette }));
  out.push(effects.antiAlias({ mode: "fxaa" }));
  return out;
}

export const SEA_LEVEL = -0.26;

export function seaNode(row: ChapterLook, options: StageOptions): StageNode {
  const water = world.water({
    id: "siege-sea",
    name: "siege sea",
    kind: "ocean",
    shape: { kind: "infinite", radius: 360 },
    height: SEA_LEVEL,
    shallowColor: row.terrain.shallows,
    deepColor: mixHex(row.terrain.sea, "#0b2a38", 0.35),
    waves: "calm",
    normalSpeed: options.reducedMotion ? 0.3 : 1,
    foam: { shoreDepth: 0.35, crest: 0.2 },
    reflection: "ibl",
    refraction: { low: false, medium: false, high: true, ultra: true }
  });
  return water.toJSON() as unknown as AuraSceneNode;
}

export function chapterWeather(row: ChapterLook, options: StageOptions): StageNode[] {
  if (row.weather === "drizzle") {
    return options.reducedMotion ? [] : [{ ...effects.rain({ intensity: 0.22, density: 0.35, color: "#c9d6e6", speed: 0.8, wind: [-0.9, -5, -0.2], splashes: true, mist: false }).toJSON(), name: "siege drizzle" }];
  }
  if (row.weather === "dust") {
    return options.reducedMotion ? [] : [effects.particles({
      name: "siege dust motes", emitter: "ambient", shape: "box", shapeSize: [22, 2.4, 16], position: [1.5, 1.2, 0],
      rate: 18, maxParticles: 120, lifetime: [4, 7], speed: 0.12, size: [0.03, 0.07], gravity: 0, wind: [0.25, 0.02, 0],
      color: "#efe2c2", intensity: 0.5, particleCount: 120, materialMode: "soft-alpha", seed: 1414
    })];
  }
  if (row.weather === "mist") {
    return [effects.fog({ name: "siege sea mist", density: 0.012, color: row.fog.color, height: 1.2, falloff: 0.9 })];
  }
  return [];
}

export function cliffRockMaterial(row: ChapterLook): AuraMaterialSpec {
  const isNight = row.chapter === 5;
  return material.pbr({
    name: "faceted coastal chalk cliff",
    color: isNight ? "#3a465c" : row.terrain.chalk,
    roughness: 0.78,
    metallic: 0,
    envMapIntensity: isNight ? 0.95 : 1.15
  });
}

export function beachDressingNodes(row: ChapterLook, options: StageOptions): StageNode[] {
  const d = beachDressing();
  const t = row.terrain;
  const tone = (base: string, n: number, mix: string, amt: number): string[] =>
    Array.from({ length: n }, (_, i) => mixHex(base, mix, (i % 3) * amt));
  return [
    instances.custom(buildSeaGrassClumpSpec(), {
      name: "dressing-sea-grass",
      material: pbr("#ffffff", { roughness: 0.84 }),
      transforms: d.grass,
      colors: tone(mixHex(t.turf, "#b9ca72", 0.25), d.grass.length, "#3f6a34", 0.2),
      castShadow: false,
      receiveShadow: true,
      ...(options.reducedMotion ? {} : { wind: { assetHeight: 0.8 } })
    }),
    instances.custom(buildScallopShellSpec(), {
      name: "dressing-shells",
      material: pbr("#ffffff", { roughness: 0.34 }),
      transforms: d.shell,
      colors: tone("#f6ead9", d.shell.length, "#eb9d82", 0.24),
      castShadow: false,
      receiveShadow: true
    }),
    instances.custom(buildDriftwoodSpec(), {
      name: "dressing-driftwood",
      material: pbr("#ffffff", { roughness: 0.88 }),
      transforms: d.driftwood,
      colors: tone(t.driftwood, d.driftwood.length, "#dfd2ba", 0.22),
      castShadow: false,
      receiveShadow: true
    }),
    instances.custom(buildQuayBollardSpec(), {
      name: "dressing-rope-posts",
      material: pbr("#583924", { roughness: 0.72 }),
      transforms: d.ropePost,
      castShadow: true,
      receiveShadow: true
    }),
    instances.custom(buildLobsterPotSpec(), {
      name: "dressing-lobster-pots",
      material: pbr("#ffffff", { roughness: 0.78 }),
      transforms: d.lobsterPot,
      colors: tone("#9b7042", d.lobsterPot.length, row.accent, 0.14),
      castShadow: true,
      receiveShadow: true
    })
  ];
}

export function buildStage(chapter: ChapterDef, options: StageOptions): StageNodes {
  const nodes: StageNode[] = [];
  const row = chapterLook(chapter.id);

  // Zero ambient/hemisphere lights: IBL + one PCSS shadowed sun + authored night/sunset practicals.
  nodes.push(chapterLookNode(row), chapterSkyNode(row), ...chapterPracticals(row));

  // ------------------------------------------------------------- terrain --
  const terrain = row.terrain;
  const textured = options.surfaceMaps === true;
  const groundColor = terrain.turf;
  const farColor = terrain.sand;
  const accentColor = row.accent;
  const grassLight = mixHex(groundColor, "#dceab0", 0.2);
  const grassDark = mixHex(groundColor, "#1b3520", 0.34);
  const rimColor = terrain.lip;
  const shallowColor = terrain.shallows;

  const tuftInst: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [];
  for (let i = 0; i < 46; i += 1) {
    const zz = 1.35 + (((i * 41) % 46) / 46) * 4.6;
    const half = 9 * Math.sqrt(Math.max(0.12, 1 - (zz / 7) ** 2)) - 0.55;
    const xx = 1.5 + ((((i * 29) % 46) / 46) * 2 - 1) * half;
    tuftInst.push({ position: [xx, 0.13, zz], rotation: [0, i * 1.71, 0], scale: [0.055, 0.26, 0.055] });
  }
  for (let i = 0; i < 18; i += 1) {
    const zz = -1.2 - (((i * 13) % 17) / 17) * 3.8;
    const half = 9 * Math.sqrt(Math.max(0.12, 1 - (zz / 7) ** 2)) - 0.8;
    const xx = 1.5 + ((((i * 7) % 17) / 17) * 2 - 1) * half;
    tuftInst.push({ position: [xx, 0.11, zz], rotation: [0, i * 2.13, 0], scale: [0.05, 0.22, 0.05] });
  }
  const tuftColors = tuftInst.map((_, i) => (i % 3 === 0 ? grassLight : i % 3 === 1 ? grassDark : mixHex(groundColor, "#9ab060", 0.3)));

  // Sun-bleached sedimentary limestone sea-cliffs (replaces 19 MB / ~2M-tri dark Objaverse rock & pine scans).
  const cliffTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }[] = [
    { position: [-13.2, 0.65, -9.8], rotation: [0.04, 0.38, -0.03], scale: [4.2, 2.3, 2.6] },
    { position: [-6.4, 0.95, -11.4], rotation: [-0.03, 0.92, 0.02], scale: [5.4, 2.9, 3.0] },
    { position: [1.8, 1.15, -12.2], rotation: [0.02, 1.74, -0.04], scale: [6.2, 3.3, 3.2] },
    { position: [9.6, 0.9, -11.0], rotation: [-0.04, 0.68, 0.03], scale: [5.0, 2.7, 2.8] },
    { position: [14.8, 0.6, -8.8], rotation: [0.03, 1.35, -0.02], scale: [3.8, 2.1, 2.4] },
    { position: [-6.4, 0.42, -5.4], rotation: [0, 0.52, 0], scale: [3.6, 1.35, 2.3] },
    { position: [9.6, 0.48, -4.9], rotation: [0, -0.44, 0], scale: [3.9, 1.45, 2.5] },
    { position: [-11.4, 0.32, -2.8], rotation: [0, 0.6, 0], scale: [2.5, 1.1, 1.9] },
    { position: [8.4, 0.28, 3.1], rotation: [0, 1.42, 0], scale: [2.1, 0.92, 1.6] }
  ];

  const pineTransforms: { position: [number, number, number]; rotation: [number, number, number]; scale: number }[] = [
    { position: [-10.2, 0, -2.9], rotation: [0, 0.3, 0], scale: 0.25 },
    { position: [-5.1, 0, -3.7], rotation: [0, 1.2, 0], scale: 0.22 },
    { position: [3.8, 0, -3.9], rotation: [0, 2.1, 0], scale: 0.26 },
    { position: [10.8, 0, -2.7], rotation: [0, 3.0, 0], scale: 0.27 },
    { position: [11.5, 0, 2.2], rotation: [0, 4.1, 0], scale: 0.22 }
  ];

  nodes.push(
    geometry.custom(buildTerracedIslandSpec(17, 0.045, true), {
      name: "stage-ground",
      material: islandSurface("turf", groundColor, 0.78, textured),
      castShadow: false,
      receiveShadow: true
    }).position(1.5, -0.185, 0).scale([18.2, 0.36, 14.2]).runtime({ id: "stage-ground", tags: ["stage"] }),
    geometry.custom(buildTerracedIslandSpec(29, 0.065, true), {
      name: "stage-ground-rim",
      material: islandSurface("wetRock", rimColor, 0.88, textured),
      castShadow: false,
      receiveShadow: true
    }).position(1.5, -0.22, 0).scale([18.9, 0.38, 14.8]).runtime({ id: "stage-ground-rim", tags: ["stage"] }),
    geometry.custom(buildTerracedIslandSpec(43, 0.075, false), {
      name: "stage-far-ground",
      material: islandSurface("sand", farColor, 0.92, textured),
      castShadow: false,
      receiveShadow: true
    }).position(1.6, -0.275, -0.4).scale([20.2, 0.34, 15.8]).runtime({ id: "stage-far-ground", tags: ["stage"] }),
    primitives.cylinder({ name: "stage-shallows", material: seaGloss(shallowColor, row.seaReflection), castShadow: false, receiveShadow: true })
      .position(1.5, -0.315, -0.4).scale([22.5, 0.05, 17.5]).runtime({ id: "stage-shallows", tags: ["stage"] }),
    // Animated dual-backend GLSL 300 es + WGSL coastal water (`dualAnimatedWaterSpec`).
    primitives.cylinder({ name: "stage-ocean", material: coastalSeaMaterial(row, options.reducedMotion), castShadow: false, receiveShadow: true })
      .position(1.5, -0.42, -2.0).scale([72, 0.24, 58]).runtime({ id: "stage-ocean", tags: ["stage"] }),
    ...(row.worldWater ? [seaNode(row, options)] : []),
    instances.custom(buildSeaGrassClumpSpec(), {
      name: "grass-tufts",
      material: pbr("#ffffff", { roughness: 0.86 }),
      transforms: tuftInst.map((t) => ({ position: t.position, rotation: t.rotation, scale: [t.scale[0] * 2.2, t.scale[1] * 1.15, t.scale[2] * 2.2] as [number, number, number] })),
      colors: tuftColors,
      castShadow: false,
      receiveShadow: false
    }),
    // Sculpted coastal sea-stack + striped lighthouse & chapter horizon landmarks (zero Meshy blobs).
    buildSeaStackLighthouseLandmark(
      "far-sea-stack",
      SEA_STACK_PLACEMENT.position,
      SEA_STACK_PLACEMENT.rotationY,
      SEA_STACK_PLACEMENT.scale * 0.38
    ),
    ...ALL_FAR_PIECES.map(({ chapter: onlyChapter, piece }) => {
      const id = farPieceNodeId(piece.key);
      const active = onlyChapter === null || onlyChapter === chapter.id;
      return buildChapterBackdropLandmark(
        piece.key,
        id,
        active ? [piece.position[0], piece.position[1], piece.position[2]] : [0, -160, 0],
        piece.rotationY,
        piece.scale,
        active
      );
    }),
    buildLaunchBastionNode(),
    buildArchedStoneBridgeNode(),
    buildFortressFoundationNode()
  );

  nodes.push(...beachDressingNodes(row, options), ...chapterWeather(row, options));
  nodes.push(...levelSignNodes(chapter.id));

  // Faceted, stepped coastal chalk/limestone sea-cliffs + overhanging turf caps + wind-swept Monterey pines + horizon clouds.
  const cliffMeshSpec = mergeRawMeshes([buildFacetedSeaCliffMesh(11)]);
  nodes.push(
    instances.custom(cliffMeshSpec, {
      name: PROP_IDS.cliffs,
      material: cliffRockMaterial(row),
      transforms: cliffTransforms,
      castShadow: true,
      receiveShadow: true
    }).runtime({ id: PROP_IDS.cliffs, tags: ["dressing"] }),
    instances.custom(buildCliffTurfCapSpec(), {
      name: "coastal-cliff-turf-caps",
      material: material.pbr({
        name: "cliff headland meadow",
        color: mixHex(groundColor, "#6a994e", 0.35),
        roughness: 0.78,
        metallic: 0
      }),
      transforms: cliffTransforms,
      castShadow: true,
      receiveShadow: true
    }),
    ...buildCoastalPinesNodes(pineTransforms, row),
    buildHorizonCloudsNode(row)
  );

  // ------------------------------------------------------------- slingshot --
  const saddleLeather = material.physical({
    name: "saddle leather pouch",
    color: "#5e3419",
    roughness: 0.62,
    metallic: 0,
    sheen: 0.36,
    sheenColor: "#b87b48",
    clearcoat: 0.22,
    clearcoatRoughness: 0.35,
    normal: material.proceduralTextures.fabric({ scale: 24, strength: 0.4, contrast: 0.65 })
  });

  nodes.push(
    buildSiegeSlingshotRigNode([-7.4, 0.42, 0], 0.08, SLING_IDS.catapult),
    buildSlingshotYokeNode(),
    // Sculpted saddle-leather cradle pouch.
    primitives.roundedBox({ name: "sling-pouch", params: { radius: 0.045, widthSegments: 2 }, material: saddleLeather, castShadow: true, receiveShadow: true })
      .position(-7.4, 1.6, 0).scale([0.26, 0.12, 0.26]).runtime({ id: SLING_IDS.pouch, tags: ["sling"] }),
    // Paired GLSL 300 es + WGSL strain-colored elastic band ribbons.
    primitives.box({ name: "sling-band-l", material: elasticBandMaterial("#d94f30", 0), castShadow: false, receiveShadow: false })
      .position(-7.5, 1.7, -0.16).scale([0.05, 0.032, 0.45]).runtime({ id: SLING_IDS.bandL, tags: ["sling"] }),
    primitives.box({ name: "sling-band-r", material: elasticBandMaterial("#d94f30", 0), castShadow: false, receiveShadow: false })
      .position(-7.5, 1.7, 0.16).scale([0.05, 0.032, 0.45]).runtime({ id: SLING_IDS.bandR, tags: ["sling"] }),
    buildHeroSiegeBirdNode("sling-loaded", "pebble", [-7.4, 1.62, 0], Math.PI * 0.5, 0.5, SLING_IDS.loaded, "sling"),
    buildHeroSiegeBirdNode("ammo-wait-0", "stone", [-8.35, 0.44, 0.52], Math.PI * 0.42, 0.5, "ammo-wait-0", "stage"),
    buildHeroSiegeBirdNode("ammo-wait-1", "triple", [-8.95, 0.18, -0.42], Math.PI * 0.48, 0.48, "ammo-wait-1", "stage"),
    buildHeroSiegeBirdNode("ammo-wait-2", "ember", [-9.45, 0.15, 0.28], Math.PI * 0.45, 0.46, "ammo-wait-2", "stage")
  );

  // ------------------------------------------------------- piece pools ------
  const blockFallbackSpec = mergeRawMeshes([bevelBoxMesh(1, 1, 1, 0.06)]);
  if (row.solidBlocks) {
    for (const family of BLOCK_FAMILIES) {
      nodes.push(instances.roundedBox({
        name: blockFamilyNodeId(family), params: { radius: 0.07, widthSegments: 2 }, material: SOLID_BLOCK_MATERIALS.stone,
        transforms: Array.from({ length: POOL.blocks }, () => PARKED_BLOCK), castShadow: true, receiveShadow: true
      }).runtime({ id: blockFamilyNodeId(family), tags: ["piece"] }));
    }
  } else {
    for (let i = 0; i < POOL.blocks; i += 1) {
      nodes.push(geometry.custom(blockFallbackSpec, { name: blockNodeId(i), material: SOLID_BLOCK_MATERIALS.stone, castShadow: true, receiveShadow: true })
        .position(0, -120, 0).scale(0.45).runtime({ id: blockNodeId(i), tags: ["piece"] }));
    }
  }

  // Sculpted procedural crate, coopered barrel + dual iron/crimson keg hoops, and mortised plank pools!
  const crateSpec = buildProceduralCrateSpec();
  const barrelSpec = buildProceduralBarrelSpec();
  const barrelHoopsSpec = buildBarrelHoopsSpec();
  const plankSpec = buildProceduralPlankSpec();
  nodes.push(
    instances.custom(crateSpec, {
      name: propPoolNodeId("crate"),
      material: pbr("#c89b66", { roughness: 0.66 }),
      castShadow: true,
      receiveShadow: true,
      transforms: Array.from({ length: POOL.crates }, () => PARKED_BLOCK)
    }).runtime({ id: propPoolNodeId("crate"), tags: ["piece"] }),
    instances.custom(barrelSpec, {
      name: propPoolNodeId("barrel"),
      material: pbr("#8c5832", { roughness: 0.64 }),
      castShadow: true,
      receiveShadow: true,
      transforms: Array.from({ length: POOL.barrels }, () => PARKED_BLOCK)
    }).runtime({ id: propPoolNodeId("barrel"), tags: ["piece"] }),
    instances.custom(barrelHoopsSpec, {
      name: BARREL_BAND_POOL_ID,
      material: KEG_BAND_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: Array.from({ length: POOL.barrels }, () => PARKED_BLOCK)
    }).runtime({ id: BARREL_BAND_POOL_ID, tags: ["piece"] }),
    instances.custom(plankSpec, {
      name: propPoolNodeId("plank"),
      material: SOLID_BLOCK_MATERIALS.wood,
      castShadow: true,
      receiveShadow: true,
      transforms: Array.from({ length: POOL.planks }, () => PARKED_BLOCK)
    }).runtime({ id: propPoolNodeId("plank"), tags: ["piece"] }),
    instances.custom(plankSpec, {
      name: propPoolNodeId("debris"),
      material: SOLID_BLOCK_MATERIALS.wood,
      castShadow: true,
      receiveShadow: false,
      transforms: Array.from({ length: POOL.debris }, () => PARKED_BLOCK)
    }).runtime({ id: propPoolNodeId("debris"), tags: ["debris"] })
  );

  // ------------------------------------------------------- raider rigs ------
  for (let g = 0; g < POOL.gullRigs; g += 1) {
    nodes.push(buildRaiderBossNode(g, gullPartId(g, "body")));
  }

  // ------------------------------------------------- projectiles + ribbon ---
  const projAmmos: readonly AmmoId[] = ["pebble", "stone", "triple", "squid", "ember"];
  for (let i = 0; i < POOL.projectiles; i += 1) {
    nodes.push(
      buildHeroSiegeBirdNode(
        projectileNodeId(i),
        projAmmos[i % projAmmos.length]!,
        [0, -120, 0],
        Math.PI * 0.5,
        0.5,
        projectileNodeId(i),
        "projectile"
      )
    );
  }

  // Predictive parabolic trajectory ribbon segments (paired GLSL 300 es + WGSL flow-pulsed arc dashes).
  const arcRibbonMat = trajectoryRibbonMaterial("#ffe89e", options.reducedMotion ? 0 : 2.8);
  for (let i = 0; i < POOL.dots; i += 1) {
    nodes.push(
      primitives.box({ name: dotNodeId(i), material: arcRibbonMat, castShadow: false, receiveShadow: false })
        .position(0, -120, 0).scale([0.28, 0.05, 0.025]).runtime({ id: dotNodeId(i), tags: ["trajectory"] })
    );
  }

  // Pooled 8x4 RGBA8 flipbook cards (`createFlipbookAtlas("dust")` masonry plumes & `createFlipbookAtlas("sparks")` blasts).
  for (let i = 0; i < POOL.plumes; i += 1) {
    nodes.push(
      primitives.plane({ name: plumeNodeId(i), material: masonryPlumeMaterial(0), castShadow: false, receiveShadow: false })
        .position(0, -120, 0).scale(1.1).runtime({ id: plumeNodeId(i), tags: ["vfx"] })
    );
  }
  for (let i = 0; i < POOL.blasts; i += 1) {
    nodes.push(
      primitives.plane({ name: blastNodeId(i), material: blastSparksMaterial(0), castShadow: false, receiveShadow: false })
        .position(0, -120, 0).scale(1.5).runtime({ id: blastNodeId(i), tags: ["vfx"] })
    );
  }

  // ------------------------------------------------------- windmill rigs ----
  const hubSpec = mergeRawMeshes([latheMesh([[0, -0.6], [0.75, -0.5], [0.75, 0.5], [0, 0.6]], 12)]);
  for (let m = 0; m < POOL.windmills; m += 1) {
    nodes.push(
      buildWindmillNode(millPoleNodeId(m), millPoleNodeId(m), ["windmill"], [0, -120, 0], 0, 0.9, false),
      geometry.custom(hubSpec, { name: millHubNodeId(m), material: CRAFT_MATS.navalBrass, castShadow: true, receiveShadow: true })
        .position(0, -120, 0).scale([0.18, 0.18, 0.18]).runtime({ id: millHubNodeId(m), tags: ["windmill"] })
    );
    for (let b = 0; b < POOL.windmillBlades; b += 1) {
      nodes.push(buildWindmillSailBladeNode(bladeNodeId(m, b), bladeNodeId(m, b)));
    }
  }

  // -------------------------------------------------- chapter dressing ------
  nodes.push(
    buildWatchtowerNode(PROP_IDS.watchtower),
    buildGatehouseNode(PROP_IDS.gatehouse),
    buildWindmillNode(PROP_IDS.windmillProp, PROP_IDS.windmillProp, ["dressing"], [4.2, 0, -3.2], 0.25, 1.35, true),
    buildPlankScatterNode(PROP_IDS.plankScatter)
  );

  // -------------------------------------------------- foreground framing ----
  nodes.push(
    instances.custom(crateSpec, {
      name: "fg-crates",
      material: CRAFT_MATS.cratePine,
      castShadow: true,
      receiveShadow: true,
      transforms: [
        { position: [-4.9, 0.34, 4.6], rotation: [0, 0.35, 0], scale: 0.44 },
        { position: [-4.95, 0.92, 4.55], rotation: [0, 0.9, 0], scale: 0.32 },
        { position: [-10.2, 0.28, 3.6], rotation: [0, 0.7, 0], scale: 0.34 }
      ]
    }).runtime({ id: "fg-crates", tags: ["dressing"] }),
    instances.custom(barrelSpec, {
      name: "fg-barrels",
      material: CRAFT_MATS.seasonedOak,
      castShadow: true,
      receiveShadow: true,
      transforms: [
        { position: [-4.0, 0.34, 4.95], rotation: [0, 0.2, 0], scale: 0.44 },
        { position: [-9.6, 0.27, 4.1], rotation: [0, 0.5, 0], scale: 0.36 }
      ]
    }).runtime({ id: "fg-barrels", tags: ["dressing"] }),
    instances.custom(barrelHoopsSpec, {
      name: "fg-barrel-bands",
      material: KEG_BAND_MATERIAL,
      castShadow: false,
      receiveShadow: true,
      transforms: [
        { position: [-4.0, 0.38, 4.95], rotation: [0, 0.2, 0], scale: 0.44 },
        { position: [-9.6, 0.30, 4.1], rotation: [0, 0.5, 0], scale: 0.36 }
      ]
    }),
    instances.cylinder({
      name: "flag-poles", material: CRAFT_MATS.darkWalnut, castShadow: true, receiveShadow: true,
      transforms: [
        { position: [6.3, 1.35, 5.15], scale: [0.06, 2.7, 0.06] },
        { position: [7.2, 3.4, -0.6], scale: [0.075, 4.5, 0.075] }
      ]
    }),
    instances.box({
      name: "flag-cloths", material: pbr("#ffffff", { roughness: 0.72 }), castShadow: false, receiveShadow: true,
      transforms: [
        { position: [6.66, 2.14, 5.13], scale: [0.72, 0.92, 0.035] },
        { position: [6.66, 2.62, 5.12], scale: [0.76, 0.08, 0.045] },
        { position: [7.74, 5.42, -0.6], scale: [1.06, 0.026, 0.026] },
        { position: [7.62, 4.82, -0.605], scale: [0.78, 0.075, 0.02] }
      ],
      colors: [mixHex(accentColor, "#c8452e", 0.4), mixHex(accentColor, "#ffe9b0", 0.5), "#3a2c20", mixHex(accentColor, "#f0b45a", 0.5)]
    }),
    instances.sphere({
      name: "flag-finials", material: CRAFT_MATS.navalBrass, castShadow: false, receiveShadow: true,
      transforms: [
        { position: [6.3, 2.75, 5.15], scale: [0.14, 0.14, 0.14] },
        { position: [7.2, 5.7, -0.6], scale: [0.18, 0.18, 0.18] }
      ]
    })
  );

  // Sculpted crenelated stone flag bastion + animated heraldic pennant.
  nodes.push(
    buildFlagBastionNode(),
    primitives.box({ name: "flag-pennant", material: material.physical({ color: "#ff4d5a", roughness: 0.62, sheen: 0.48, sheenColor: "#ffb3b8" }), castShadow: false })
      .position(7.74, 5.15, -0.6).scale([1.06, 0.52, 0.04]).runtime({ id: PROP_IDS.flag, tags: ["flag"] })
  );

  // --------------------------------------------------------------- post ----
  nodes.push(...chapterPost(row, options));

  // ---------------------------------------------------------- camera spec ---
  const cameraSpec = camera.perspective({
    ...labCameraOptions(readLabFlags(), "reversed"),
    position: [-2.5, 4.0, 15.5],
    target: [-0.5, 1.5, 0],
    fov: 55
  });

  return { nodes, cameraSpec };
}

export function buildScene(chapter: ChapterDef, options: StageOptions): ReturnType<typeof scene> {
  const { nodes, cameraSpec } = buildStage(chapter, options);
  let s = scene();
  for (const node of nodes) s = s.add(node);
  s = s.camera(cameraSpec);
  return s;
}
