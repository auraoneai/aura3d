/**
 * Beat Hopper world on `@aura3d/engine`:
 *   - Concert-stage volumetric night rig (`environments.preset("night")`, shadowed 2-cascade `lights.directional`,
 *     magenta + cyan stage practicals, zero `lights.ambient`)
 *   - Eevee post stack (`contactShadows`, `ambientOcclusion`, mirrored Acrylic `screenSpaceReflections`,
 *     `looks.fogForExtent`, beat-reactive `cinematicBloom`, `colorGrade`, `vignette`)
 *   - Wet dark-glass LED equalizer runway (`deckRunwaySpec`) + `material.studioGlass` beat-threshold pad & crystal
 *     beat orbs + anodized `material.lacquer` beat pads, rails, sub-bass speaker crates, plasma crossbars (`chrome`
 *     stanchions), and equalizer monolith walls + interior-mapped 4.2 m laser-abyss `gapChasmSpec` trenches
 *   - Articulated 132 BPM synth-skater bot (`clearcoatPaint` chassis, `chrome` LED visor, continuous welded headphone
 *     band + `glowingEmissive` ear-cups, hover-skates + twin scrolling `effects.trail` ribbons)
 *   - Paired GLSL+WGSL `ringShockwaveSpec` + `createFlipbookAtlas("ripple")` & `createFlipbookAtlas("sparks")` VFX
 *   - Tight `CORRIDOR_BOUNDS` on all dynamic corridor batches.
 */
import { camera, effects, environments, geometry, group, lights, material, scene, type AuraApp, type AuraMaterialSpec } from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch, CORRIDOR_BOUNDS, flatSpec, shadowSpec, toonSpec,
  type CustomSpec, type MeshData
} from "../../../examples/shared/runner-kit/index";
import { createFlipbookAtlas } from "../../showcase-port-shared/vfx-pack";
import { CONFIG, LANES, laneBit, laneX, obstacleZ, type BeatHopperSim, type ObstacleType } from "./sim";
import { LOOK, beatPulse, linear } from "./look";
import {
  DASH_SIZE, ORB_RADIUS, ROAD_WIDTH, SEGMENT_LENGTH,
  boxMesh, flatQuadXZMesh, gapChasmQuadMesh, monolithWallGlowParts, monolithWallMesh,
  monolithWallTrussMesh, plasmaCrossbarParts, ringMesh, skaterBotMeshes, speakerBlockGlowParts,
  speakerBlockHardwareMesh, speakerBlockMesh, sphereMesh, stanchionPostsMesh,
  translateMesh, uprightQuadXYMesh, vinylBeatDiscGlowParts, vinylBeatDiscMesh,
  type ColoredMeshData
} from "./meshes";
import { poseScale, type CameraPose, type Shown } from "./presentation";
import { FLOOR_Y, addStage } from "./stage";
import { addDressing, bindDressing } from "./dressing";
import {
  EQ_HARMONIC_BANDS,
  buildEqualizerTowerBanks,
  buildRunwayRailsNode,
  createJudgementThresholdGateNode,
  sculptBeatPadFrameMesh,
  sculptBeatPadGlassMesh
} from "./art/proceduralModels";
import {
  deckRunwaySpec, flipbookBurstSpec, gapChasmSpec, glowSpec, heroSpec, ringShockwaveSpec,
  stageLitSpec, stageSkySpec, type Haze
} from "./stage-shaders";

type Scene = ReturnType<typeof scene>;
type NodeHandle = ReturnType<AuraApp["nodes"]["require"]>;

const STRIPES = 40;
const DASHES = 36;
const DASH_PERIOD = 4;
const EQ_PERIOD = 64;
const PIECES = CONFIG.POOL_OBSTACLES * 3;
const ORB_Y = 0.96;
const SKY_RADIUS = 360;
const POOL_RIPPLES = 10;
const POOL_SPARK_CARDS = 16;

export const FOG_NEAR = 148;
export const FOG_FAR = 365;
export const FOG_COLOR = "#120926";
export const HAZE: Haze = { color: linear(FOG_COLOR), density: 0.0015 };
const FAR_HAZE: Haze = { color: linear("#100924"), density: 0.0013 };
const RIDGE_HAZE: Haze = { color: linear("#140b2c"), density: 0.0010 };
export const CAMERA_FAR = 400;

let cachedRippleAtlas: ReturnType<typeof createFlipbookAtlas> | null = null;
let cachedSparksAtlas: ReturnType<typeof createFlipbookAtlas> | null = null;
const rippleAtlas = () => (cachedRippleAtlas ??= createFlipbookAtlas("ripple", [255, 240, 210]));
const sparksAtlas = () => (cachedSparksAtlas ??= createFlipbookAtlas("sparks", [255, 248, 232]));

export interface WorldOptions {
  readonly sim: BeatHopperSim;
  readonly aspect: number;
}

export interface WorldView {
  readonly shown?: Shown;
  readonly camera?: CameraPose;
  readonly reducedMotion?: boolean;
  readonly fovKickDeg?: number;
  readonly shakeOffset?: readonly [number, number, number];
  readonly shakeRoll?: number;
}

export interface WorldRuntime {
  update(sim: BeatHopperSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  readonly scene: Scene;
  bind(app: AuraApp): WorldRuntime;
}

/** Presentation-only LCG (particle jitter): never the gameplay stream. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

interface Particle {
  alive: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; color: string; size: number;
}
interface Ring {
  alive: boolean; x: number; y: number; z: number;
  age: number; color: string;
}
interface FlipCard {
  alive: boolean; x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  age: number; life: number; size0: number; size1: number;
  rgb: readonly [number, number, number];
}

const normPeakRgb = (hex: string): readonly [number, number, number] => {
  const c = linear(hex);
  const m = Math.max(c[0], c[1], c[2], 1e-4);
  return [c[0] / m, c[1] / m, c[2] / m];
};

const dynamicFrom = (m: ColoredMeshData, bounds = CORRIDOR_BOUNDS) => {
  const vCount = Math.floor(m.positions.length / 3);
  const hasColors = Boolean(m.colors && m.colors.length >= vCount * 4);
  return geometry.dynamic({
    positions: Float32Array.from(m.positions),
    normals: Float32Array.from(m.normals),
    uvs: Float32Array.from(m.uvs),
    ...(hasColors ? { colors: Float32Array.from(m.colors!.slice(0, vCount * 4)) } : {}),
    indices: Uint32Array.from(m.indices),
    bounds
  });
};

const batchGeometryWithColors = (batch: Batch, templateColors?: readonly number[], bounds = CORRIDOR_BOUNDS) => {
  if (!templateColors || templateColors.length < batch.vertsPer * 4) return batch.geometry();
  const colors = new Float32Array(batch.max * batch.vertsPer * 4);
  for (let i = 0; i < batch.max; i++) {
    const off = i * batch.vertsPer * 4;
    for (let j = 0; j < batch.vertsPer * 4; j++) {
      colors[off + j] = templateColors[j]!;
    }
  }
  return geometry.dynamic({
    positions: batch.positions.slice(),
    normals: batch.normals.slice(),
    uvs: Float32Array.from(batch.mesh.uvs),
    colors,
    indices: Uint32Array.from(batch.mesh.indices),
    bounds,
    ...(batch.tones ? { attributes: { tone: { itemSize: 3, data: batch.tones.slice() } } } : {})
  });
};

export const BATCH_IDS = [
  "stripes", "lane-dashes", "blocks", "block-chrome", "block-glow", "bars", "bar-posts",
  "gaps", "walls", "wall-truss", "wall-glow", "orbs", "orb-glow", "rings", "particles", "vfx-ripples", "vfx-sparks"
] as const;

const deckSpec = (): CustomSpec => deckRunwaySpec({
  haze: HAZE,
  tiles: [linear(LOOK.road), linear("#151932")]
});

const multiGlowBatchSpec = (): CustomSpec => stageLitSpec({
  base: [0.04, 0.05, 0.10],
  haze: HAZE,
  toneBase: 1,
  toneEmissive: 1.55
});

const stagePrograms = (): { name: string; spec: CustomSpec }[] =>
  addStage(() => undefined, { haze: HAZE, farHaze: FAR_HAZE, ridgeHaze: RIDGE_HAZE }).programs();

/** Every custom program the world draws (`tests/unit/beat-hopper/shaders-compile.test.ts` bakes & links each one). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  return [
    { name: "sky", spec: stageSkySpec() },
    { name: "deck", spec: deckSpec() },
    { name: "gap-chasm", spec: gapChasmSpec(HAZE) },
    { name: "obstacle-glow", spec: multiGlowBatchSpec() },
    { name: "ring-shockwave", spec: ringShockwaveSpec() },
    { name: "flipbook-ripple", spec: flipbookBurstSpec(rippleAtlas(), 1.85) },
    { name: "flipbook-sparks", spec: flipbookBurstSpec(sparksAtlas(), 1.95) },
    { name: "hero", spec: heroSpec(linear(LOOK.player)) },
    ...stagePrograms(),
    { name: "toon", spec: toonSpec(linear(LOOK.road)) },
    { name: "toon-tone", spec: toonSpec([1, 1, 1], undefined, [0, 0, 0], true) },
    { name: "flat", spec: flatSpec(linear(LOOK.roadLine), 0.9) },
    { name: "flat-tone", spec: flatSpec([1, 1, 1], 0.9, true) },
    { name: "shadow", spec: shadowSpec() }
  ];
}

const translateBox = (w: number, h: number, d: number, y: number, z: number): MeshData =>
  translateMesh(boxMesh(w, h, d), 0, y, z);

export function buildWorld(_options: WorldOptions): World {
  const builder: Scene = scene()
    .background(LOOK.background)
    .camera(camera.perspective({
      ...labCameraOptions(readLabFlags(), "reversed"),
      position: [0, 4.6, 8.5],
      target: [0, 1, -10],
      fov: 55,
      near: 0.1,
      far: CAMERA_FAR
    }));

  /* Concert-stage volumetric night lighting: night IBL + 1 shadowed 2-cascade key + solar-gold & electric-cyan stage practicals (zero ambient). */
  builder.add(environments.preset("night", {
    name: "stage-environment",
    intensity: 0.76,
    diffuseIntensity: 0.54,
    specularIntensity: 1.30,
    background: false
  }));
  builder.add(lights.directional({
    name: "moon-key",
    position: [-14, 22, 12],
    target: [0, 0, -12],
    intensity: 1.28,
    color: "#cee2ff",
    shadow: { cascades: 2, maxDistance: 85, mapSize: 2048 }
  }));
  builder.add(lights.point({
    name: "stage-gold-kicker",
    position: [-3.5, 5.8, -15],
    color: "#ffbe2e",
    intensity: 1.25,
    distance: 34
  }));
  builder.add(lights.point({
    name: "stage-cyan-rim",
    position: [2.2, 2.8, 5.4],
    color: "#00f2ff",
    intensity: 1.55,
    distance: 26
  }));

  const addCustom = (id: string, mesh: ColoredMeshData, spec: CustomSpec, bounds = CORRIDOR_BOUNDS): void => {
    builder.add(
      geometry.custom(dynamicFrom(mesh, bounds), {
        name: id,
        material: material.custom(spec),
        castShadow: false,
        receiveShadow: false
      }).runtime({ id })
    );
  };
  const addPbrMesh = (id: string, mesh: ColoredMeshData, mat: AuraMaterialSpec, shadow = false): void => {
    builder.add(
      geometry.custom(dynamicFrom(mesh, CORRIDOR_BOUNDS), {
        name: id,
        material: mat,
        castShadow: shadow,
        receiveShadow: shadow
      }).runtime({ id })
    );
  };
  const addBatchCustom = (id: string, batch: Batch, spec: CustomSpec): void => {
    builder.add(
      geometry.custom(batch.geometry(), {
        name: id,
        material: material.custom(spec),
        castShadow: false,
        receiveShadow: false
      }).runtime({ id })
    );
  };
  const addBatchPbr = (
    id: string,
    batch: Batch,
    mat: AuraMaterialSpec,
    castShadow = false,
    templateColors?: readonly number[]
  ): void => {
    builder.add(
      geometry.custom(batchGeometryWithColors(batch, templateColors), {
        name: id,
        material: mat,
        castShadow,
        receiveShadow: true
      }).runtime({ id })
    );
  };

  /* Sky dome */
  addCustom("sky", sphereMesh(SKY_RADIUS, 32, 20), stageSkySpec(), {
    min: [-SKY_RADIUS, -SKY_RADIUS, -SKY_RADIUS],
    max: [SKY_RADIUS, SKY_RADIUS, SKY_RADIUS]
  });

  /* Synthwave stage: floor, ridges, city, pylons, palms, raised chamfered arches, islands, equalizer, volumetric beams, motes */
  const stageGroups = new Map<string, ReturnType<typeof geometry.custom>[]>();
  const stage = addStage((id, geom, spec, mount) => {
    const g = geometry.custom(geom, { name: id, material: material.custom(spec), castShadow: false, receiveShadow: false });
    if (mount === "live") builder.add(g.runtime({ id }));
    else if (mount === "static") builder.add(g);
    else {
      const list = stageGroups.get(mount.group) ?? [];
      list.push(g);
      stageGroups.set(mount.group, list);
    }
  }, { haze: HAZE, farHaze: FAR_HAZE, ridgeHaze: RIDGE_HAZE });
  for (const [id, children] of stageGroups) builder.add(group(id, children).runtime({ id }));

  /* GPU-instanced procedural concert stage dressing (`grp-dress-stacks`, `grp-dress-decks`), equalizer banks (`grp-eq`) + hero z=0 judgement gate */
  addDressing(builder);
  const eqBanks = buildEqualizerTowerBanks({ floorY: FLOOR_Y, nearZ: 30, farZ: -260, period: EQ_PERIOD });
  builder.add(eqBanks.rootGroup);
  builder.add(createJudgementThresholdGateNode(ROAD_WIDTH / 2 + 0.58));

  /* Elevated track girder + cyan under-glow strip */
  const trackLen = CONFIG.POOL_SEGMENTS * SEGMENT_LENGTH;
  addCustom("girder", translateBox(ROAD_WIDTH + 0.72, 0.56, trackLen, -0.6, 18 - trackLen / 2), stageLitSpec({ base: linear("#11152b"), haze: HAZE, toneless: true }));
  addCustom("underglow", translateBox(ROAD_WIDTH + 0.80, 0.07, trackLen, -0.42, 18 - trackLen / 2), stageLitSpec({ base: [0, 0, 0], haze: HAZE, emissive: linear("#00f2ff"), toneless: true }));

  /* Wet dark-glass Acrylic equalizer deck + GPU-instanced multi-hue side rails (`instances.custom`) */
  const deckZ = 19 - trackLen / 2;
  addCustom("deck", translateBox(ROAD_WIDTH, 0.3, trackLen, -0.15, deckZ), deckSpec());
  builder.add(buildRunwayRailsNode(ROAD_WIDTH, trackLen, deckZ));

  /* Sculpted octagonal `studioGlass` + anodized multi-hue `lacquer` 3-lane beat-judgement threshold pads at z = 0 */
  const lanesCoords = [laneX(-1), laneX(0), laneX(1)] as const;
  addPbrMesh("beat-pad-glass", sculptBeatPadGlassMesh(lanesCoords), material.studioGlass({
    name: "beat-pad-studio-glass",
    tint: "#9ef8ff",
    color: "#ffffff",
    roughness: 0.03,
    ior: 1.52,
    thickness: 0.65,
    clearcoat: 0.9,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.75
  }), false);

  addPbrMesh("beat-pad-lacquer", sculptBeatPadFrameMesh(lanesCoords), material.lacquer({
    name: "beat-pad-lacquer",
    color: "#ffffff",
    emissive: "#0c2233",
    emissiveIntensity: 0.35,
    practical: true,
    roughness: 0.12,
    clearcoat: 0.95,
    clearcoatRoughness: 0.08,
    envMapIntensity: 1.6
  }), false);

  /* Beat-grid stripes & pre-baked lane dividers (`CORRIDOR_BOUNDS`, scrolled via runtime transform handle) */
  const stripes = new Batch(boxMesh(ROAD_WIDTH, 0.018, 0.20), STRIPES, linear(LOOK.roadLine), CORRIDOR_BOUNDS);
  addBatchCustom("stripes", stripes, flatSpec([1, 1, 1], 0.88, true));

  const dashes = new Batch(boxMesh(DASH_SIZE.w, DASH_SIZE.h, DASH_SIZE.d), DASHES * 2, linear(LOOK.laneLine), CORRIDOR_BOUNDS);
  for (let i = 0; i < DASHES; i++) {
    const z = 12 - i * DASH_PERIOD;
    dashes.place(i, -CONFIG.LANE_WIDTH / 2, 0.013, z, 0, 1, 1, 1);
    dashes.place(DASHES + i, CONFIG.LANE_WIDTH / 2, 0.013, z, 0, 1, 1, 1);
  }
  addBatchCustom("lane-dashes", dashes, flatSpec([1, 1, 1], 0.94, true));

  /* 132 BPM Cyber-DJ Street Hover-Skater Hero Rig (vertex `COLOR_0` + true neutral `clearcoatPaint` / `pbr` / `studioGlass` + twin-hue neon emissives) */
  const bot = skaterBotMeshes();
  const botSatinMat = material.clearcoatPaint({
    name: "bot-satin-jacket",
    color: "#ffffff",
    roughness: 0.16,
    clearcoat: 0.92,
    clearcoatRoughness: 0.06,
    envMapIntensity: 1.60
  });
  const botFabricMat = material.pbr({
    name: "bot-techwear-fabric",
    color: "#ffffff",
    roughness: 0.50,
    metalness: 0.08,
    envMapIntensity: 1.20
  });
  const botMetalTrimMat = material.clearcoatPaint({
    name: "bot-metal-trim",
    color: "#ffffff",
    roughness: 0.14,
    metalness: 0.36,
    clearcoat: 0.92,
    clearcoatRoughness: 0.05,
    envMapIntensity: 1.70
  });
  const botVisorGlassMat = material.studioGlass({
    name: "bot-visor-studio-glass",
    tint: "#7df9ff",
    color: "#ffffff",
    emissive: "#00f2ff",
    emissiveIntensity: 0.52,
    practical: true,
    roughness: 0.025,
    ior: 1.54,
    thickness: 0.34,
    clearcoat: 1,
    clearcoatRoughness: 0.03,
    envMapIntensity: 1.95
  });
  const botNeonCyanMat = material.glowingEmissive({
    name: "bot-neon-cyan",
    color: "#00f2ff",
    emissive: "#00f2ff",
    emissiveIntensity: 2.15,
    roughness: 0.14
  });
  const botNeonMagentaMat = material.glowingEmissive({
    name: "bot-neon-magenta",
    color: "#ff2e88",
    emissive: "#ff2e88",
    emissiveIntensity: 2.05,
    roughness: 0.14
  });
  const botBoostGlowMat = material.glowingEmissive({
    name: "bot-boost-glow",
    color: "#ffbe2e",
    emissive: "#00f2ff",
    emissiveIntensity: 2.35,
    roughness: 0.12
  });

  const partNode = (id: string, m: ColoredMeshData, mat: AuraMaterialSpec, cast = true) =>
    geometry.custom(dynamicFrom(m, CORRIDOR_BOUNDS), { name: id, material: mat, castShadow: cast, receiveShadow: false });

  builder.add(group("player", []).runtime({ id: "player" }));
  builder.add(partNode("bot-torso", bot.torso, botSatinMat).position(0, 0.94, 0).runtime({ id: "bot-torso" }));
  builder.add(
    group("bot-torso-glow", [
      partNode("bot-collar-cyan", bot.collarGlowCyan, botNeonCyanMat, false),
      partNode("bot-collar-magenta", bot.collarGlowMagenta, botNeonMagentaMat, false)
    ]).position(0, 0.94, 0).runtime({ id: "bot-torso-glow" })
  );
  builder.add(
    group("bot-pelvis", [
      partNode("bot-pelvis-shell", bot.pelvis, botFabricMat),
      partNode("bot-pelvis-belt", bot.pelvisBelt, botMetalTrimMat)
    ]).position(0, 0.65, 0).runtime({ id: "bot-pelvis" })
  );
  builder.add(
    group("bot-head", [
      partNode("bot-head-shell", bot.head, botSatinMat),
      partNode("bot-hair", bot.hair, botFabricMat),
      partNode("bot-visor", bot.visor, botVisorGlassMat, false),
      partNode("bot-headband", bot.headband, botMetalTrimMat, false),
      partNode("bot-earcups-cyan", bot.earCupsCyan, botNeonCyanMat, false),
      partNode("bot-earcups-magenta", bot.earCupsMagenta, botNeonMagentaMat, false)
    ]).position(0, 1.33, 0).runtime({ id: "bot-head" })
  );
  builder.add(partNode("bot-arm-l", bot.armL, botSatinMat).position(-0.245, 1.13, 0).runtime({ id: "bot-arm-l" }));
  builder.add(partNode("bot-arm-r", bot.armR, botSatinMat).position(0.245, 1.13, 0).runtime({ id: "bot-arm-r" }));
  builder.add(
    group("bot-leg-l", [
      partNode("bot-thigh-l", bot.leg, botFabricMat),
      partNode("bot-knee-l", bot.kneePad, botMetalTrimMat),
      partNode("bot-leg-stripe-l", bot.legStripeCyan, botNeonCyanMat, false)
    ]).position(-0.135, 0.62, 0).runtime({ id: "bot-leg-l" })
  );
  builder.add(
    group("bot-leg-r", [
      partNode("bot-thigh-r", bot.leg, botFabricMat),
      partNode("bot-knee-r", bot.kneePad, botMetalTrimMat),
      partNode("bot-leg-stripe-r", bot.legStripeMagenta, botNeonMagentaMat, false)
    ]).position(0.135, 0.62, 0).runtime({ id: "bot-leg-r" })
  );
  builder.add(
    group("bot-skate-l", [
      partNode("bot-boot-l", bot.skate, botMetalTrimMat),
      partNode("bot-blade-l-cyan", bot.skateBladeCyan, botNeonCyanMat, false),
      partNode("bot-blade-l-magenta", bot.skateBladeMagenta, botNeonMagentaMat, false)
    ]).position(-0.150, 0, 0).runtime({ id: "bot-skate-l" })
  );
  builder.add(
    group("bot-skate-r", [
      partNode("bot-boot-r", bot.skate, botMetalTrimMat),
      partNode("bot-blade-r-cyan", bot.skateBladeCyan, botNeonCyanMat, false),
      partNode("bot-blade-r-magenta", bot.skateBladeMagenta, botNeonMagentaMat, false)
    ]).position(0.150, 0, 0).runtime({ id: "bot-skate-r" })
  );
  builder.add(partNode("bot-boost-flare", bot.boostFlare, botBoostGlowMat, false).position(0, -50, 0).runtime({ id: "bot-boost-flare" }));
  addCustom("player-shadow", boxMesh(1.65, 0.002, 1.65), shadowSpec());

  /* Multi-part sculpted concert-stage obstacles (`CORRIDOR_BOUNDS`):
   *   - Low Jump Hurdles: dual-woofer bass amp cabinets + brushed-chrome hardware + LED EQ & laser-bar glow
   *   - Duck Gates: chrome/truss stanchions + multi-hue plasma emitter crossbar (`0.97 m` exact clearance)
   *   - Tall Dodge Barriers: stacked line-array speaker towers + truss/horn hardware + crimson-coral/amber danger rims
   *   - Synth-Vinyl Collectibles: grooved obsidian/gold LP platter + cyan/ultraviolet/gold energy-disc halos
   */
  const blockTpl = speakerBlockMesh();
  const blockHwTpl = speakerBlockHardwareMesh();
  const blockGlowTpl = speakerBlockGlowParts();
  const barPostsTpl = stanchionPostsMesh();
  const barGlowTpl = plasmaCrossbarParts();
  const wallTpl = monolithWallMesh();
  const wallTrussTpl = monolithWallTrussMesh();
  const wallGlowTpl = monolithWallGlowParts();

  const blocks = new Batch(blockTpl, PIECES, null, CORRIDOR_BOUNDS);
  const blockChrome = new Batch(blockHwTpl, PIECES, null, CORRIDOR_BOUNDS);
  const blockGlow = new Batch(blockGlowTpl.mesh, PIECES, blockGlowTpl.tones, CORRIDOR_BOUNDS);
  const barPosts = new Batch(barPostsTpl, PIECES, null, CORRIDOR_BOUNDS);
  const bars = new Batch(barGlowTpl.mesh, PIECES, barGlowTpl.tones, CORRIDOR_BOUNDS);
  const gaps = new Batch(gapChasmQuadMesh(), PIECES, null, CORRIDOR_BOUNDS);
  const walls = new Batch(wallTpl, PIECES, null, CORRIDOR_BOUNDS);
  const wallTruss = new Batch(wallTrussTpl, PIECES, null, CORRIDOR_BOUNDS);
  const wallGlow = new Batch(wallGlowTpl.mesh, PIECES, wallGlowTpl.tones, CORRIDOR_BOUNDS);

  addBatchPbr("blocks", blocks, material.lacquer({
    name: "block-speaker-lacquer",
    color: "#ffffff",
    emissive: "#0d1630",
    emissiveIntensity: 0.22,
    practical: true,
    roughness: 0.22,
    clearcoat: 0.88,
    clearcoatRoughness: 0.10,
    envMapIntensity: 1.45
  }), true, blockTpl.colors);
  addBatchPbr("block-chrome", blockChrome, material.studioMetal({
    name: "block-chrome-metal",
    color: "#ffffff",
    roughness: 0.16,
    metalness: 1,
    envMapIntensity: 1.85
  }), false, blockHwTpl.colors);
  addBatchCustom("block-glow", blockGlow, multiGlowBatchSpec());

  addBatchPbr("bar-posts", barPosts, material.studioMetal({
    name: "bar-stanchion-studio-metal",
    color: "#ffffff",
    roughness: 0.16,
    metalness: 0.92,
    envMapIntensity: 1.80
  }), true, barPostsTpl.colors);
  addBatchCustom("bars", bars, multiGlowBatchSpec());

  addBatchCustom("gaps", gaps, gapChasmSpec(HAZE));

  addBatchPbr("walls", walls, material.lacquer({
    name: "wall-monolith-lacquer",
    color: "#ffffff",
    emissive: "#240812",
    emissiveIntensity: 0.26,
    practical: true,
    roughness: 0.20,
    clearcoat: 0.90,
    clearcoatRoughness: 0.09,
    envMapIntensity: 1.45
  }), true, wallTpl.colors);
  addBatchPbr("wall-truss", wallTruss, material.studioMetal({
    name: "wall-truss-metal",
    color: "#ffffff",
    roughness: 0.18,
    metalness: 1,
    envMapIntensity: 1.85
  }), false, wallTrussTpl.colors);
  addBatchCustom("wall-glow", wallGlow, multiGlowBatchSpec());

  /* Sculpted double-sided synth-vinyl / harmonic energy-disc collectibles (`CORRIDOR_BOUNDS`) */
  const orbTpl = vinylBeatDiscMesh(ORB_RADIUS);
  const orbGlowTpl = vinylBeatDiscGlowParts(ORB_RADIUS);
  const orbs = new Batch(orbTpl, CONFIG.POOL_ORBS, null, CORRIDOR_BOUNDS);
  const orbGlow = new Batch(orbGlowTpl.mesh, CONFIG.POOL_ORBS, orbGlowTpl.tones, CORRIDOR_BOUNDS);
  addBatchPbr("orbs", orbs, material.lacquer({
    name: "orb-vinyl-lacquer",
    color: "#ffffff",
    emissive: "#0c2036",
    emissiveIntensity: 0.28,
    practical: true,
    roughness: 0.12,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 1.85
  }), false, orbTpl.colors);
  addBatchCustom("orb-glow", orbGlow, multiGlowBatchSpec());

  /* Concentric beat rings + `createFlipbookAtlas("ripple")` & `createFlipbookAtlas("sparks")` sprite-sheet bursts + 3D sparks */
  const rings = new Batch(ringMesh(0.76, 1.04, 36), CONFIG.POOL_RINGS, linear(LOOK.perfect), CORRIDOR_BOUNDS);
  addBatchCustom("rings", rings, ringShockwaveSpec([1.45, 1.45, 1.45]));

  const rippleCards = new Batch(flatQuadXZMesh(1), POOL_RIPPLES, [0, 0, 0], CORRIDOR_BOUNDS);
  addBatchCustom("vfx-ripples", rippleCards, flipbookBurstSpec(rippleAtlas(), 1.85));

  const sparkCards = new Batch(uprightQuadXYMesh(1), POOL_SPARK_CARDS, [0, 0, 0], CORRIDOR_BOUNDS);
  addBatchCustom("vfx-sparks", sparkCards, flipbookBurstSpec(sparksAtlas(), 1.95));

  const particles = new Batch(sphereMesh(0.09, 4, 3), CONFIG.POOL_PARTICLES, [1, 1, 1], CORRIDOR_BOUNDS);
  addBatchCustom("particles", particles, toonSpec([1, 1, 1], undefined, [0, 0, 0], true));

  /* Eevee concert-stage post stack: deep midnight-indigo fog (near = 148, maxOpacity = 0.18 <= 0.22) + contactShadows + AO + SSR + crisp HDR-only white bloom + neutral grade */
  builder
    .add(effects.fog({
      name: "stage-fog",
      mode: "linear",
      near: FOG_NEAR,
      far: FOG_FAR,
      start: FOG_NEAR,
      density: 0.0012,
      intensity: 0.14,
      maxOpacity: 0.18,
      color: FOG_COLOR
    }))
    .add(effects.contactShadows({ length: 0.25, thickness: 0.18, steps: 12, intensity: 0.6 }))
    .add(effects.ambientOcclusion({ name: "ao", intensity: 0.4, radius: 0.6 }))
    .add(effects.screenSpaceReflections({ name: "ssr", intensity: 0.34, roughness: 0.18, maxDistance: 32 }))
    .add(effects.cinematicBloom({ name: "bloom", intensity: 0.28, threshold: 1.08, radius: 0.36, color: "#ffffff" }))
    .add(effects.colorGrade({ name: "grade", contrast: 1.09, saturation: 1.06, temperature: -0.02, tint: 0.0, gain: 1.0 }))
    .add(effects.vignette({ name: "vignette", intensity: 0.24, color: "#09061a" }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, NodeHandle>();
      const node = (id: string): NodeHandle => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const stageRt = stage.bind(node);
      const dressingRt = bindDressing(node);
      let clock = 0;
      let lastWall = -1;
      const maybeController = app.camera;
      if (!maybeController) throw new Error("beat-hopper: the app exposes no camera controller");
      const controller: NonNullable<typeof maybeController> = maybeController;

      /* Twin hover-blade ribbons shifted along +Z by `dt * speed` so trails stream down the scrolling runway */
      type TrailHandle = { translate?: (dx: number, dy: number, dz: number) => void; clear?: () => void };
      const skateTrails: TrailHandle[] = [];
      try {
        const fxApi = (app as unknown as { effects?: { trail?: (target: string, opts: Record<string, unknown>) => TrailHandle } }).effects;
        if (fxApi?.trail) {
          skateTrails.push(
            fxApi.trail("bot-skate-l", { color: "#00f2ff", width: 0.14, life: 0.30, maxPoints: 26, intensity: 1.32 }),
            fxApi.trail("bot-skate-r", { color: "#ff2e88", width: 0.14, life: 0.30, maxPoints: 26, intensity: 1.32 })
          );
        }
      } catch {
        /* optional runtime ribbon surface */
      }

      const parts: Particle[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => ({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 1, color: "#ffffff", size: 1
      }));
      const ringPool: Ring[] = Array.from({ length: CONFIG.POOL_RINGS }, () => ({
        alive: false, x: 0, y: 0, z: 0, age: 0, color: LOOK.perfect
      }));
      const ripplePool: FlipCard[] = Array.from({ length: POOL_RIPPLES }, () => ({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.55, size0: 1.2, size1: 4.8, rgb: [1, 0.85, 0.4]
      }));
      const sparkPool: FlipCard[] = Array.from({ length: POOL_SPARK_CARDS }, () => ({
        alive: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, age: 0, life: 0.45, size0: 0.9, size1: 2.4, rgb: [1, 0.85, 0.4]
      }));
      const jitter = lcg(0x51a7e);
      let lastT = -1;
      let lastX = 0;
      let lastPose = "run";
      let lastBigJump = false;
      let lastJudgeAt = -10;
      let lastMilestones = 0;
      let lastOrbs = 0;
      const partShown: boolean[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => false);
      const partColor: string[] = Array.from({ length: CONFIG.POOL_PARTICLES }, () => "");
      const ringShown: boolean[] = Array.from({ length: CONFIG.POOL_RINGS }, () => false);
      const rippleShown: boolean[] = Array.from({ length: POOL_RIPPLES }, () => false);
      const sparkShown: boolean[] = Array.from({ length: POOL_SPARK_CARDS }, () => false);
      const obstacleShown: Record<ObstacleType, boolean[]> = {
        gap: Array.from({ length: PIECES }, () => false),
        block: Array.from({ length: PIECES }, () => false),
        bar: Array.from({ length: PIECES }, () => false),
        wall: Array.from({ length: PIECES }, () => false)
      };
      const obsSlotSig: string[] = Array.from({ length: CONFIG.POOL_OBSTACLES }, () => "__init__");
      let obsEpochT = 0;
      let lastObsSpeed = -1;
      let obsForceRefresh = true;
      const orbShown: boolean[] = Array.from({ length: CONFIG.POOL_ORBS }, () => false);
      let px = 0;

      const burst = (count: number, color: string, y: number, speed: number): void => {
        let spawned = 0;
        for (const p of parts) {
          if (spawned >= count) break;
          if (p.alive) continue;
          p.alive = true;
          p.x = px; p.y = y; p.z = 0;
          const a = jitter() * Math.PI * 2;
          const r = (0.4 + jitter() * 0.6) * speed;
          p.vx = Math.cos(a) * r;
          p.vz = Math.sin(a) * r * 0.6;
          p.vy = 2 + jitter() * speed;
          p.age = 0;
          p.life = 0.5 + jitter() * 0.35;
          p.color = color;
          p.size = 0.7 + jitter() * 0.8;
          spawned++;
        }
      };
      const spawnRing = (color: string, y: number): void => {
        const slot = ringPool.find((r) => !r.alive) ?? ringPool[0];
        if (!slot) return;
        slot.alive = true;
        slot.x = px; slot.y = y; slot.z = 0;
        slot.age = 0;
        slot.color = color;
      };
      const spawnFlipRipple = (color: string, size1 = 4.9, life = 0.52): void => {
        const slot = ripplePool.find((r) => !r.alive) ?? ripplePool[0];
        if (!slot) return;
        slot.alive = true;
        slot.x = px; slot.y = 0.042; slot.z = 0;
        slot.vx = 0; slot.vy = 0; slot.vz = 0;
        slot.age = 0; slot.life = life;
        slot.size0 = 1.15; slot.size1 = size1;
        slot.rgb = normPeakRgb(color);
      };
      const spawnFlipSparks = (count: number, color: string, y: number, spread = 1.6): void => {
        const rgb = normPeakRgb(color);
        let n = 0;
        for (const s of sparkPool) {
          if (n >= count) break;
          if (s.alive) continue;
          s.alive = true;
          const a = jitter() * Math.PI * 2;
          s.x = px + Math.cos(a) * 0.18;
          s.y = y + (jitter() - 0.3) * 0.25;
          s.z = 0.08;
          s.vx = Math.cos(a) * spread;
          s.vy = 0.8 + jitter() * spread;
          s.vz = 0;
          s.age = 0;
          s.life = 0.38 + jitter() * 0.14;
          s.size0 = 0.85;
          s.size1 = 2.35;
          s.rgb = rgb;
          n++;
        }
      };

      function update(sim: BeatHopperSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const shown = view.shown;
        const t = shown?.t ?? o.t;
        const dist = shown?.dist ?? o.dist;
        const y = shown?.y ?? o.y;
        const vyNow = shown?.vy ?? o.vy;
        const pose = shown?.pose ?? o.pose;
        const isBigJump = pose === "air" && Boolean(shown?.bigJump ?? o.bigJump);
        px = shown?.x ?? o.laneOffset;
        const reduced = view.reducedMotion === true;
        if (t < lastT) {
          for (const r of ringPool) r.alive = false;
          for (const p of parts) p.alive = false;
          for (const r of ripplePool) r.alive = false;
          for (const s of sparkPool) s.alive = false;
          for (const tr of skateTrails) tr.clear?.();
          lastX = px;
          lastBigJump = false;
        }
        const dt = lastT < 0 || t < lastT ? 0 : Math.min(0.1, t - lastT);
        const vx = dt > 1e-4 ? (px - lastX) / dt : 0;
        lastX = px;
        lastT = t;
        const beatPhase = t / CONFIG.BEAT;
        const pulse = reduced ? 0 : beatPulse(t, CONFIG.BEAT);
        const gain = LOOK.pulseGain * pulse;

        if (!reduced && dt > 0 && o.phase === "playing") {
          const scrollDz = dt * o.speed;
          for (const tr of skateTrails) tr.translate?.(0, 0, scrollDz);
        }

        /* Wet dark-glass equalizer deck + pulsing `studioGlass` / `lacquer` beat-threshold pads */
        node("deck").setUniform?.("uTileShift", dist % (SEGMENT_LENGTH * 2));
        node("deck").setUniform?.("uBeatPhase", beatPhase);
        node("deck").setUniform?.("uPulse", pulse);
        node("deck").setUniform?.("emissive", [0.015 * gain, 0.045 * gain, 0.085 * gain]);
        node("beat-pad-glass").setScale([1, 1 + 0.35 * pulse, 1 + 0.06 * pulse]);
        node("beat-pad-lacquer").setScale([1 + 0.02 * pulse, 1 + 0.45 * pulse, 1]);
        node("beat-threshold-gate").setScale([1, 1 + 0.032 * pulse, 1]);
        node("rails").setScale([1, 1 + 0.08 * pulse, 1]);

        /* Beat-grid stripes */
        const beatNow = Math.floor(t / CONFIG.BEAT + 1e-9);
        for (let i = 0; i < STRIPES; i++) {
          const b = beatNow - 2 + i;
          if (b < 0) { stripes.collapse(i); continue; }
          const z = -(b * CONFIG.BEAT - t) * o.speed;
          stripes.place(i, 0, 0.011, z, 0, 1, 1, b % 4 === 0 ? 1.7 : 0.95);
          const k = b % 4 === 0 ? 1.05 : 0.40 + 0.55 * pulse;
          const c = linear(LOOK.roadLine);
          stripes.setTone(i, [c[0] * k, c[1] * k, c[2] * k]);
        }
        stripes.flush(node("stripes"), false);

        /* Scrolling lane dividers + GPU-instanced harmonic equalizer tower banks (zero per-frame vertex uploads) */
        node("lane-dashes").setPosition(0, 0, dist % DASH_PERIOD);
        node("grp-eq").setPosition(0, 0, dist % EQ_PERIOD);
        for (let b = 0; b < EQ_HARMONIC_BANDS; b++) {
          const phase = eqBanks.bandPhases[b] ?? 0;
          const dance = reduced ? 0.5 : 0.5 + 0.5 * Math.sin(phase + beatPhase * Math.PI);
          node(`eq-band-${b}`).setScale([1, 0.52 + 0.68 * dance, 1]);
        }

        /* Stage scenery + GPU-instanced concert line-array speaker towers & DJ consoles */
        const wall = typeof performance !== "undefined" ? performance.now() / 1000 : t;
        clock += lastWall < 0 ? 0 : Math.min(0.1, Math.max(0, wall - lastWall));
        lastWall = wall;
        const animClock = reduced ? 0 : clock;
        stageRt.update(dist, beatPhase, pulse, animClock, reduced);
        dressingRt.update(dist, pulse);
        const telegraphPulse = Math.min(1, pulse * 1.18 + 0.14);
        node("sky").setUniform?.("uClock", animClock);
        node("sky").setUniform?.("uPulse", pulse);
        node("gaps").setUniform?.("uClock", animClock);
        node("gaps").setUniform?.("uPulse", telegraphPulse);
        node("block-glow").setUniform?.("uPulse", telegraphPulse);
        node("bars").setUniform?.("uPulse", telegraphPulse);
        node("wall-glow").setUniform?.("uPulse", telegraphPulse);
        node("orb-glow").setUniform?.("uPulse", pulse);
        node("rings").setUniform?.("uClock", animClock);
        node("underglow").setUniform?.("emissive", [linear("#00f2ff")[0] * (0.55 + gain), linear("#00f2ff")[1] * (0.55 + gain), linear("#00f2ff")[2] * (0.55 + gain)]);

        /* 132 BPM Cyber-DJ Street Hover-Skater choreography (`grounded`, `duck` < 0.75 m, `air`, and `bigJump` ~2.35 m booster flare) */
        const scale = poseScale(pose, vyNow);
        const stride = reduced ? 0 : Math.sin(beatPhase * Math.PI);
        const headNod = reduced ? 0 : 0.12 * pulse;
        const bankRoll = reduced ? 0 : Math.max(-0.28, Math.min(0.28, -vx * 0.042));
        const bodyPitch =
          pose === "duck"
            ? 0.36
            : isBigJump
              ? Math.max(-0.24, Math.min(0.22, -vyNow * 0.026))
              : pose === "air"
                ? Math.max(-0.26, Math.min(0.26, -vyNow * 0.032))
                : -0.06;

        const cp = Math.cos(bodyPitch), sp = Math.sin(bodyPitch);
        const cr = Math.cos(bankRoll), sr = Math.sin(bankRoll);
        const placeBotPart = (
          id: string,
          lx: number,
          ly: number,
          lz: number,
          rx: number,
          ry: number,
          rz: number,
          partScale: [number, number, number] = [scale.sx, scale.sy, scale.sz]
        ) => {
          const sx = lx * scale.sx;
          const sy = ly * scale.sy;
          const sz = lz * scale.sz;
          // Roll around Z then pitch around X around `(px, y, 0)`
          const x1 = sx * cr - sy * sr;
          const y1 = sx * sr + sy * cr;
          const y2 = y1 * cp - sz * sp;
          const z2 = y1 * sp + sz * cp;
          node(id)
            .setPosition(px + x1, y + y2, z2)
            .setRotation(bodyPitch + rx, ry, bankRoll + rz)
            .setScale(partScale);
        };

        const aimBotLeg = (
          id: string,
          hx: number,
          hy: number,
          hz: number,
          ax: number,
          ay: number,
          az: number
        ) => {
          const wdx = (ax - hx) * scale.sx;
          const wdy = (ay - hy) * scale.sy;
          const wdz = (az - hz) * scale.sz;
          const wdist = Math.max(0.16, Math.min(0.56, Math.hypot(wdx, wdy, wdz)));
          const rz = Math.asin(Math.max(-0.68, Math.min(0.68, wdx / wdist)));
          const rx = Math.atan2(-wdz, -wdy);
          placeBotPart(id, hx, hy, hz, rx, 0, rz, [scale.sx, wdist / 0.45, scale.sz]);
        };

        node("player")
          .setPosition(px, y, 0)
          .setRotation(bodyPitch, 0, bankRoll)
          .setScale([scale.sx, scale.sy, scale.sz]);
        const torsoBob = reduced ? 0 : 0.032 * pulse;
        const pelvisY = (pose === "duck" ? 0.48 : 0.65) + torsoBob;
        const pelvisZ = pose === "duck" ? 0.030 : 0;
        const hipY = pelvisY - 0.03;
        const torsoY = (pose === "duck" ? 0.74 : 0.94) + torsoBob;
        const headY = (pose === "duck" ? 1.08 : 1.33) + torsoBob * 0.9;
        const torsoYaw = isBigJump ? 0.12 : pose === "grounded" ? stride * 0.05 : 0;
        placeBotPart("bot-torso", 0, torsoY, 0, 0, torsoYaw, 0);
        placeBotPart("bot-torso-glow", 0, torsoY, 0, 0, torsoYaw, 0);
        placeBotPart("bot-pelvis", 0, pelvisY, pelvisZ, pose === "duck" ? -0.06 : 0, pose === "grounded" ? -stride * 0.06 : torsoYaw * 0.5, 0);
        placeBotPart("bot-head", 0, headY, 0, headNod + (pose === "duck" ? -0.22 : isBigJump ? -0.08 : 0), isBigJump ? -0.08 : 0, -bankRoll * 0.35);

        if (pose === "duck") {
          placeBotPart("bot-arm-l", -0.255, 0.89 + torsoBob, 0.03, 0.72, 0, 0.22);
          placeBotPart("bot-arm-r", 0.255, 0.89 + torsoBob, 0.03, 0.72, 0, -0.22);
          placeBotPart("bot-skate-l", -0.175, 0.02, -0.06, 0, 0.10, 0.08);
          placeBotPart("bot-skate-r", 0.175, 0.02, 0.06, 0, -0.10, -0.08);
          aimBotLeg("bot-leg-l", -0.135, hipY, pelvisZ, -0.175, 0.18, -0.03);
          aimBotLeg("bot-leg-r", 0.135, hipY, pelvisZ, 0.175, 0.18, 0.07);
        } else if (isBigJump) {
          // Jet Set Radio / Hi-Fi Rush aerial DJ-cue boost pose + spinning neon booster ring!
          placeBotPart("bot-arm-l", -0.245, 1.15 + torsoBob, -0.03, -1.18, 0.18, 0.42);
          placeBotPart("bot-arm-r", 0.250, 1.14 + torsoBob, -0.02, -0.62, -0.12, -0.52);
          placeBotPart("bot-skate-l", -0.165, 0.22, -0.09, -0.26, 0.12, 0.11);
          placeBotPart("bot-skate-r", 0.160, 0.13, 0.08, 0.22, -0.08, -0.09);
          aimBotLeg("bot-leg-l", -0.135, hipY, pelvisZ, -0.165, 0.37, -0.06);
          aimBotLeg("bot-leg-r", 0.135, hipY, pelvisZ, 0.160, 0.28, 0.09);
        } else if (pose === "air") {
          placeBotPart("bot-arm-l", -0.248, 1.14 + torsoBob, -0.02, -0.78, 0, 0.34);
          placeBotPart("bot-arm-r", 0.248, 1.14 + torsoBob, -0.02, -0.78, 0, -0.34);
          placeBotPart("bot-skate-l", -0.155, 0.12, -0.06, -0.18, 0.06, 0.07);
          placeBotPart("bot-skate-r", 0.155, 0.09, 0.06, 0.16, -0.06, -0.07);
          aimBotLeg("bot-leg-l", -0.135, hipY, pelvisZ, -0.155, 0.27, -0.03);
          aimBotLeg("bot-leg-r", 0.135, hipY, pelvisZ, 0.155, 0.24, 0.07);
        } else {
          const liftL = Math.max(0, stride) * 0.055;
          const liftR = Math.max(0, -stride) * 0.055;
          const skateZL = -stride * 0.145;
          const skateZR = stride * 0.145;
          placeBotPart("bot-arm-l", -0.245, 1.13 + torsoBob, 0, stride * 0.46, 0, 0.11);
          placeBotPart("bot-arm-r", 0.245, 1.13 + torsoBob, 0, -stride * 0.46, 0, -0.11);
          placeBotPart("bot-skate-l", -0.150, liftL, skateZL, stride * 0.12, 0, 0);
          placeBotPart("bot-skate-r", 0.150, liftR, skateZR, -stride * 0.12, 0, 0);
          aimBotLeg("bot-leg-l", -0.135, hipY, pelvisZ, -0.150, liftL + 0.17, skateZL + 0.02);
          aimBotLeg("bot-leg-r", 0.135, hipY, pelvisZ, 0.150, liftR + 0.17, skateZR + 0.02);
        }

        if (isBigJump) {
          const boostSpin = reduced ? 0 : animClock * 9.5;
          const boostSwell = 1.05 + 0.18 * pulse;
          const plumeStretch = 1.0 + Math.min(0.45, Math.max(0, vyNow) * 0.045);
          node("bot-boost-flare")
            .setVisible(true)
            .setPosition(px, Math.max(0.05, y + 0.08), 0)
            .setRotation(bodyPitch * 0.5, boostSpin, bankRoll * 0.5)
            .setScale([boostSwell, plumeStretch, boostSwell]);
        } else {
          node("bot-boost-flare").setVisible(false).setPosition(0, -50, 0);
        }

        if (!lastBigJump && isBigJump && o.phase === "playing") {
          spawnRing("#00f2ff", Math.max(0.055, y + 0.05));
          spawnFlipRipple("#00f2ff", 5.2, 0.52);
          spawnFlipSparks(4, "#ffbe2e", 0.35 + y, 2.0);
          burst(12, "#00f2ff", 0.25 + y, 3.0);
        }
        if (lastPose === "air" && pose !== "air" && o.phase === "playing") {
          spawnFlipRipple(lastBigJump ? "#ffbe2e" : LOOK.player, lastBigJump ? 4.4 : 3.2, 0.42);
        }
        lastPose = pose;
        lastBigJump = isBigJump;

        node("player-shadow").setPosition(px, 0.018, 0).setScale(1 / (1 + 0.25 * y));
        node("player-shadow").setUniform?.("alpha", 0.32 / (1 + 0.4 * y));

        /* Obstacles: scroll-epoch cached placement + runtime batch node translation (zero steady-frame vertex rewrites) */
        if (obsForceRefresh || o.t < obsEpochT || (o.t - obsEpochT) * o.speed > 64 || o.speed !== lastObsSpeed) {
          obsEpochT = o.t;
          lastObsSpeed = o.speed;
          obsForceRefresh = false;
          obsSlotSig.fill("__rebase__");
        }
        for (let i = 0; i < CONFIG.POOL_OBSTACLES; i++) {
          const slot = o.obstacles[i];
          const sig = slot && slot.active ? `${slot.beat}:${slot.type}:${slot.lanes}:${slot.crossTime}` : "";
          if (sig === obsSlotSig[i]) continue;
          obsSlotSig[i] = sig;
          const localOz = slot && slot.active ? -(slot.crossTime - obsEpochT) * o.speed : 0;
          for (const lane of LANES) {
            const piece = i * 3 + lane + 1;
            const lx = laneX(lane);

            const showGap = Boolean(slot && slot.active && slot.type === "gap" && (slot.lanes & laneBit(lane)) !== 0);
            if (showGap) {
              gaps.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              obstacleShown.gap[piece] = true;
            } else if (obstacleShown.gap[piece]) {
              gaps.collapse(piece);
              obstacleShown.gap[piece] = false;
            }

            const showBlock = Boolean(slot && slot.active && slot.type === "block" && (slot.lanes & laneBit(lane)) !== 0);
            if (showBlock) {
              blocks.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              blockChrome.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              blockGlow.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              obstacleShown.block[piece] = true;
            } else if (obstacleShown.block[piece]) {
              blocks.collapse(piece);
              blockChrome.collapse(piece);
              blockGlow.collapse(piece);
              obstacleShown.block[piece] = false;
            }

            const showBar = Boolean(slot && slot.active && slot.type === "bar" && (slot.lanes & laneBit(lane)) !== 0);
            if (showBar) {
              barPosts.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              bars.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              obstacleShown.bar[piece] = true;
            } else if (obstacleShown.bar[piece]) {
              barPosts.collapse(piece);
              bars.collapse(piece);
              obstacleShown.bar[piece] = false;
            }

            const showWall = Boolean(slot && slot.active && slot.type === "wall" && (slot.lanes & laneBit(lane)) !== 0);
            if (showWall) {
              walls.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              wallTruss.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              wallGlow.place(piece, lx, 0, localOz, 0, 1, 1, 1);
              obstacleShown.wall[piece] = true;
            } else if (obstacleShown.wall[piece]) {
              walls.collapse(piece);
              wallTruss.collapse(piece);
              wallGlow.collapse(piece);
              obstacleShown.wall[piece] = false;
            }
          }
        }
        const obsScroll = (o.t - obsEpochT) * o.speed;
        const blockScale: [number, number, number] = [1, 1 + 0.03 * pulse, 1];
        const wallScale: [number, number, number] = [1, 1 + 0.02 * pulse, 1];
        node("blocks").setPosition(0, 0, obsScroll).setScale(blockScale);
        node("block-chrome").setPosition(0, 0, obsScroll).setScale(blockScale);
        node("block-glow").setPosition(0, 0, obsScroll).setScale(blockScale);
        node("bar-posts").setPosition(0, 0, obsScroll);
        node("bars").setPosition(0, 0, obsScroll);
        node("gaps").setPosition(0, 0, obsScroll);
        node("walls").setPosition(0, 0, obsScroll).setScale(wallScale);
        node("wall-truss").setPosition(0, 0, obsScroll).setScale(wallScale);
        node("wall-glow").setPosition(0, 0, obsScroll).setScale(wallScale);
        blocks.flush(node("blocks"));
        blockChrome.flush(node("block-chrome"));
        blockGlow.flush(node("block-glow"));
        barPosts.flush(node("bar-posts"));
        bars.flush(node("bars"));
        gaps.flush(node("gaps"), false);
        walls.flush(node("walls"));
        wallTruss.flush(node("wall-truss"));
        wallGlow.flush(node("wall-glow"));

        /* Sculpted synth-vinyl / harmonic energy-disc collectibles: spin and swell on the 132 BPM beat */
        for (let i = 0; i < CONFIG.POOL_ORBS; i++) {
          const orb = o.orbSlots[i];
          if (orb && orb.active && !orb.collected && o.t <= orb.crossTime + 0.25) {
            const k = 1 + 0.22 * pulse;
            const spin = reduced ? 0.4 : orb.beat * 1.1 + t * 2.6;
            const ox = laneX(orb.lane);
            const oy = ORB_Y + (reduced ? 0 : 0.12 * Math.sin(orb.beat * 1.7 + t * 4));
            const oz = -obstacleZ(o, orb);
            orbs.place(i, ox, oy, oz, spin, k, k, k);
            orbGlow.place(i, ox, oy, oz, spin, k, k, k);
            orbShown[i] = true;
          } else if (orbShown[i]) {
            orbs.collapse(i);
            orbGlow.collapse(i);
            orbShown[i] = false;
          }
        }
        orbs.flush(node("orbs"));
        orbGlow.flush(node("orb-glow"));

        /* Judgement events → concentric harmonic rings + `createFlipbookAtlas("ripple" | "sparks")` + 3D sparks */
        const j = o.lastJudge;
        if (j.kind && j.at > lastJudgeAt) {
          lastJudgeAt = j.at;
          if (j.kind === "perfect") {
            spawnRing(LOOK.perfect, 0.055);
            spawnFlipRipple(LOOK.perfect, 5.4, 0.56);
            spawnFlipSparks(4, LOOK.perfect, 0.9 + y, 1.9);
            burst(16, LOOK.perfect, 0.8 + y, 3.2);
          } else if (j.kind === "good") {
            spawnRing(LOOK.good, 0.055);
            spawnFlipRipple(LOOK.good, 4.2, 0.48);
            spawnFlipSparks(2, LOOK.good, 0.8 + y, 1.4);
            burst(8, LOOK.good, 0.7 + y, 2.2);
          } else if (j.kind === "dodge") {
            spawnFlipRipple(LOOK.laneLine, 3.8, 0.44);
            spawnFlipSparks(2, LOOK.laneLine, 0.85 + y, 1.5);
            burst(8, LOOK.laneLine, 0.8 + y, 2.4);
          } else if (j.kind === "miss") {
            spawnFlipSparks(4, LOOK.miss, 0.85 + y, 2.2);
            burst(14, LOOK.miss, 0.8 + y, 3.6);
          }
        }
        if (o.orbs > lastOrbs) {
          lastOrbs = o.orbs;
          spawnFlipSparks(2, LOOK.orb, ORB_Y, 1.5);
          burst(10, LOOK.orb, ORB_Y, 2.6);
        }
        if (o.orbs < lastOrbs) lastOrbs = o.orbs;
        if (o.milestones > lastMilestones) {
          lastMilestones = o.milestones;
          spawnFlipRipple(LOOK.gold, 6.2, 0.62);
          spawnFlipSparks(5, LOOK.gold, 1.25, 2.4);
          burst(20, LOOK.gold, 1.2, 4);
          spawnRing(LOOK.gold, 0.055);
        }
        if (o.phase === "splash" && lastMilestones !== 0) {
          lastMilestones = 0;
          lastJudgeAt = -10;
        }

        for (let i = 0; i < ringPool.length; i++) {
          const r = ringPool[i] as Ring;
          if (!r.alive) {
            if (ringShown[i]) { rings.collapse(i); ringShown[i] = false; }
            continue;
          }
          r.age += dt;
          if (r.age >= LOOK.ring.life) {
            r.alive = false;
            rings.collapse(i);
            ringShown[i] = false;
            continue;
          }
          const radius = LOOK.ring.radius + LOOK.ring.growth * r.age;
          const fade = 1 - r.age / LOOK.ring.life;
          rings.place(i, r.x, r.y, r.z, 0, radius, 1, radius);
          const c = linear(r.color);
          rings.setTone(i, [c[0] * fade, c[1] * fade, c[2] * fade]);
          ringShown[i] = true;
        }
        rings.flush(node("rings"), false);

        for (let i = 0; i < ripplePool.length; i++) {
          const r = ripplePool[i] as FlipCard;
          if (!r.alive) {
            if (rippleShown[i]) { rippleCards.collapse(i); rippleShown[i] = false; }
            continue;
          }
          r.age += dt;
          if (r.age >= r.life) {
            r.alive = false;
            rippleCards.collapse(i);
            rippleShown[i] = false;
            continue;
          }
          const prog = r.age / r.life;
          const rem = Math.max(0.01, 1 - prog);
          const sz = r.size0 + (r.size1 - r.size0) * (1 - Math.pow(1 - prog, 2));
          rippleCards.place(i, r.x, r.y, r.z, prog * 0.8, sz, 1, sz);
          rippleCards.setTone(i, [r.rgb[0] * rem, r.rgb[1] * rem, r.rgb[2] * rem]);
          rippleShown[i] = true;
        }
        rippleCards.flush(node("vfx-ripples"), false);

        for (let i = 0; i < sparkPool.length; i++) {
          const s = sparkPool[i] as FlipCard;
          if (!s.alive) {
            if (sparkShown[i]) { sparkCards.collapse(i); sparkShown[i] = false; }
            continue;
          }
          s.age += dt;
          if (s.age >= s.life) {
            s.alive = false;
            sparkCards.collapse(i);
            sparkShown[i] = false;
            continue;
          }
          s.vy -= 4.5 * dt;
          s.x += s.vx * dt;
          s.y = Math.max(0.12, s.y + s.vy * dt);
          const prog = s.age / s.life;
          const rem = Math.max(0.01, 1 - prog);
          const sz = s.size0 + (s.size1 - s.size0) * Math.pow(prog, 0.55);
          sparkCards.place(i, s.x, s.y, s.z, 0, sz, sz, 1);
          sparkCards.setTone(i, [s.rgb[0] * rem, s.rgb[1] * rem, s.rgb[2] * rem]);
          sparkShown[i] = true;
        }
        sparkCards.flush(node("vfx-sparks"), false);

        for (let i = 0; i < parts.length; i++) {
          const p = parts[i] as Particle;
          if (!p.alive) {
            if (partShown[i]) { particles.collapse(i); partShown[i] = false; }
            continue;
          }
          p.age += dt;
          if (p.age >= p.life) {
            p.alive = false;
            particles.collapse(i);
            partShown[i] = false;
            continue;
          }
          p.vy -= 9 * dt;
          p.x += p.vx * dt;
          p.y = Math.max(0.05, p.y + p.vy * dt);
          p.z += p.vz * dt;
          const k = p.size * (1 - p.age / p.life);
          particles.place(i, p.x, p.y, p.z, 0, k, k, k);
          if (partColor[i] !== p.color) {
            particles.setTone(i, linear(p.color));
            partColor[i] = p.color;
          }
          partShown[i] = true;
        }
        particles.flush(node("particles"));

        /* Camera pose + 132 BPM subtle nod + real-time `createImpactRig` PERFECT FOV kick & MISS trauma shake */
        const c = view.camera ?? { x: 0, y: 4.6, z: 8.5, lookX: 0, lookY: 1, lookZ: -10 };
        const sx = view.shakeOffset?.[0] ?? 0;
        const sy = view.shakeOffset?.[1] ?? 0;
        const roll = reduced ? 0 : (view.shakeRoll ?? 0);
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const fov = baseFov + (reduced ? 0 : 1.15 * pulse + (view.fovKickDeg ?? 0));
        controller.setPose(
          {
            position: [c.x + sx, c.y + sy, c.z],
            target: [c.lookX + sx * 0.35, c.lookY + sy * 0.35, c.lookZ],
            up: [Math.sin(roll), Math.cos(roll), 0],
            fov
          },
          { cut: false }
        );
      }

      const parked = [
        "blocks", "block-chrome", "block-glow", "bar-posts", "bars", "gaps",
        "walls", "wall-truss", "wall-glow", "orbs", "orb-glow", "rings", "vfx-ripples", "vfx-sparks", "particles"
      ];
      function warm(on: boolean): void {
        if (!on) obsForceRefresh = true;
        for (const id of parked) {
          const h = node(id).setVisible(true);
          if (on) h.setPosition(0, -50, -60);
          else h.setPosition(0, 0, 0);
        }
      }

      const batches = [
        stripes, dashes, blocks, blockChrome, blockGlow, barPosts, bars, gaps,
        walls, wallTruss, wallGlow, orbs, orbGlow, rings, rippleCards, sparkCards, particles
      ];
      return {
        update,
        warm,
        get nodeCount() { return handles.size; },
        get uploadedVertices() { return batches.reduce((sum, b) => sum + b.uploadedVertices, 0); }
      };
    }
  };
}
