/**
 * Splat Turf world on `@aura3d/engine` 5.5.1 (WP-17):
 * - Sunlit urban skate-arena lighting: shadowed 2-cascade directional sun + softbox studio IBL (zero ambient),
 *   contact shadows, SSAO, wet-ink SSR, extent fog, cinematic bloom, and broadcast-crisp color grading.
 * - Single-draw RGBA8 GPU splat coverage ribbon (`createTurfSplatSurface` + `wetInkRibbonSpec` paired GLSL+WGSL)
 *   replacing the former 7,200-quad dynamic paint batch (0 dynamic paint vertex uploads).
 * - Articulated PBR clearcoat & chrome hero paint-roller yoke, 32-frame `createFlipbookAtlas("ink")` bursts, and Idol
 *   image-to-3D GLBs (`art/idol.ts`) for the kid-driven hero kart, rival scrubber karts, aerosol cans, paint buckets,
 *   arena set pieces, finish gantry and sky islands (instanced, render-only; the splat ribbon is untouched).
 */
import {
  camera,
  effects,
  environments,
  geometry,
  lights,
  material,
  scene,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraSceneBuilder
} from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch,
  flatSpec,
  toonSpec,
  type CustomSpec
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, type SplatTurfSim } from "./sim";
import { LOOK, hexToRgba8, linear, paintColorFor } from "./look";
import {
  BALL_RADIUS,
  ballMesh,
  quadMesh,
  roadMesh,
  cylinderMesh,
  translateMesh,
  sphereMesh,
  stripMesh,
  type MeshData
} from "./meshes";
import {
  turfArenaCurbWallMesh,
  turfRollerCapsMesh,
  turfRollerYokeMesh
} from "./art/proceduralModels";
import {
  HERO_BODY_LOCAL,
  HERO_KART_LAYOUT,
  IDOL_DIMS,
  IdolPool,
  RIVAL_BRUSH_LOCAL,
  RIVAL_KART_LAYOUT,
  DRIVER_RIG_SCALE,
  HERO_DRIVER_ID,
  HERO_SEAT,
  RIVAL_SEAT,
  rivalDriverId,
  rivalDriverNodes,
  heroDriverNode,
  PAINT_BUCKET_KEYS,
  PAINT_BUCKET_NODE_IDS,
  TURF_IDOL_ASSETS,
  finishGantryNode,
  heroRoverNode,
  idolInstancedNode
} from "./art/idol";
import type { CameraPose, Shown } from "./presentation";
import { glowSpec, hazed, sunsetSkySpec, type Haze } from "./art/haze";
import { RUN_FRAME_BOUNDS, addScenery } from "./scenery";
import { ballSquash, contactShadowSpec, glossyBallSpec } from "./art/ball";
import {
  createTurfSplatSurface,
  dualWetInkSurfaceSpec,
  inkFlipbookSpec,
  packInkBurstTone,
  paintRibbonMesh,
  wetInkRibbonSpec
} from "./art/wet-ink";

export const CAMERA_FAR = 400;
export const ROAD_WIDTH = 6.4;
export const EDGE_X = 3.35;
export const CELL_Y = 0.022;
export const GRID_CELLS = CONFIG.RUN_LENGTH * CONFIG.GRID_COLS;

export const BATCH_IDS = [
  "road",
  "edges",
  "paint",
  "strips",
  "can-halos",
  "can-beacons",
  "particles"
] as const;

/** Idol GLB pools in the scrolling road frame (instanced `setInstanceMatrices` nodes; see `art/idol.ts`). */
export const IDOL_POOL_IDS = ["cans", "bots", ...PAINT_BUCKET_NODE_IDS] as const;

import { MatrixWriter, decompose, multiply, transformPoint, trs, wheelLocal, type KartLayout, type Mat4 } from "./art/kartRig";
import { driverPose, seatedHips } from "./art/riders";
import { loadIdolHumanoid, type HumanoidDriver } from "../../showcase-port-shared/idol/humanoid";

/** Every kart wheel (hero + rivals) is one instanced Idol draw in world space; rival scrub brushes are another. */
export const KART_WHEEL_CAPACITY = 4 * (1 + CONFIG.POOL_BOTS);
const WHEEL_GLB = { dims: IDOL_DIMS.turfKartWheel };
/** Rival scrub brush spin (rad/s), the old procedural hydro-scrubber rate. */
export const BRUSH_SPIN_RATE = 9.5;

/** Aerosol-can pickup display scale (the 0.69 m GLB reads at ~8 px at chase distance otherwise). */
export const CAN_SCALE = 1.7;

/**
 * A rammed rival eraser kart is bumped off the causeway instead of being driven through: from the contact frame it
 * slides sideways away from the rover (never across it), hops, spins and drops off the deck edge into the cloud sea.
 * `s` = metres the rover has travelled since contact; `side` = +1/-1 away from the rover. Presentation only (the sim
 * keeps the bot where it was; the hit is already resolved). Clears the rover's 1.24 m summed half-width within ~0.9 m.
 */
export function eraserKnock(s: number, side: number, reduced: boolean, clear = 0): { dx: number; dy: number; spin: number } {
  const t = Math.max(0, s);
  return { dx: side * (clear + 1.4 * t), dy: Math.max(-12, t * 0.9 - 0.12 * t * t), spin: reduced ? 0 : side * t * 0.8 };
}

/**
 * Bump pop for a kart the rover just hit: the lateral overlap at contact (summed half-widths minus the centre gap), so
 * from the first drawn frame of the knock the two karts only touch, never interpenetrate.
 */
export function knockClearance(botX: number, laneOffset: number): number {
  return Math.max(0, CONFIG.ROVER_HALF_WIDTH + CONFIG.ERASER_HALF_WIDTH - Math.abs(botX - laneOffset));
}

/** Rival karts yaw their nose this far (rad) into their lateral slide (the brush swings with it; sim footprint covers it). */
export const BOT_STEER_YAW = 0.16;

/** Rival kart instance tint once it has been hit (multiplies the baked albedo; white = untouched). */
const BOT_HIT_TINT = [0.36, 0.36, 0.44] as const;
const WHITE = [1, 1, 1] as const;

/** Roadside paint pots: one every PROP_SPACING m on each side, sized and tinted from the row (no RNG). */
export const PROP_SPACING = 10;
/** Live roadside paint buckets never exceed one per PROP_SPACING rows per side across the pooled segments. */
const PROP_POOL_CAPACITY = Math.ceil(CONFIG.POOL_SEGMENTS / PROP_SPACING) * 2 + 2;
/**
 * Segment-side slot (`segment * 2 + side`) -> dense bucket-pool slot. A segment's row keeps its residue mod PROP_SPACING
 * (POOL_SEGMENTS is a multiple of it), so the at most one prop per PROP_SPACING segments per side never collide.
 */
const propSlot = (slot: number): number => (slot & 1) * Math.ceil(CONFIG.POOL_SEGMENTS / PROP_SPACING) + Math.floor((slot >> 1) / PROP_SPACING);

function propHash(row: number, side: number): number {
  const h = Math.sin(row * 12.9898 + side * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/** Roadside paint buckets sit at least this far outside the curb line (EDGE_X), plus up to PROP_SETBACK_JITTER more. */
export const PROP_SETBACK = 2.2;
export const PROP_SETBACK_JITTER = 3.6;

/** Roadside paint-bucket pose for `row`/`side` (0 left, 1 right), or null when that row carries no bucket (pure, no RNG). */
export function roadsidePropPose(row: number, side: number): { x: number; sc: number; sy: number; yaw: number; variant: number } | null {
  if (row < 0 || ((row + side * 3) % PROP_SPACING) !== 0) return null;
  const h = propHash(row, side);
  const sc = 0.6 + h * 0.45;
  return {
    x: (side === 0 ? -1 : 1) * (EDGE_X + PROP_SETBACK + h * PROP_SETBACK_JITTER),
    sc,
    sy: sc * (0.9 + propHash(row + 7, side) * 0.35),
    yaw: h * 6.28,
    variant: Math.floor(propHash(row + 3, side) * PAINT_BUCKET_KEYS.length) % PAINT_BUCKET_KEYS.length
  };
}

/* ------------------------------------------------------------------ ink-burst billboard quad */

/** Vertical XY quad facing +Z for camera-facing 32-frame ink-droplet flipbook bursts. */
function billboardQuadMesh(size = 1): MeshData {
  const h = size * 0.5;
  return {
    positions: [-h, -h, 0, h, -h, 0, h, h, 0, -h, h, 0],
    normals: [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1],
    uvs: [0, 1, 1, 1, 1, 0, 0, 0],
    indices: [0, 1, 2, 0, 2, 3]
  };
}

export type InkBurstKind = "can" | "solvent" | "eraser" | "stretch" | "finish";

export interface WorldOptions {
  sim: SplatTurfSim;
  aspect: number;
  /** Rigged-driver skeleton loader (default: fetch the GLB and map it; tests inject a file-backed loader). */
  loadHumanoid?: (url: string) => Promise<HumanoidDriver>;
}

export interface WorldView {
  shown?: Shown;
  camera?: CameraPose;
  reducedMotion?: boolean;
  impactShake?: readonly [number, number, number];
  impactRoll?: number;
  impactFov?: number;
}

export interface WorldRuntime {
  update(sim: SplatTurfSim, aspect: number, view?: WorldView): void;
  warm(on: boolean): void;
  spawnInkBurst(kind: InkBurstKind): void;
  readonly nodeCount: number;
  readonly uploadedVertices: number;
}

export interface World {
  scene: AuraSceneBuilder;
  bind(app: AuraApp): WorldRuntime;
}

/* Sunlit atmospheric horizon haze tiers — pushed well beyond active corridor so foreground & sky stay crisp. */
const NEAR_HAZE: Haze = { color: linear(LOOK.haze), near: 98, far: 320, max: 0.42 };
const CLOUD_HAZE: Haze = { color: linear(LOOK.haze), near: 90, far: 310, max: 0.36 };
const FAR_HAZE: Haze = { color: linear(LOOK.haze), near: 120, far: 380, max: 0.44 };

const PROGRAMS = {
  sky: () => sunsetSkySpec(LOOK.skyStops, LOOK.sunDir, LOOK.sunColor),
  toon: (hex: string) => hazed(toonSpec(linear(hex)), NEAR_HAZE),
  toonTone: () => hazed(toonSpec([1, 1, 1], undefined, [0, 0, 0], true), NEAR_HAZE),
  cloud: () => hazed(toonSpec([1, 1, 1], undefined, linear("#7ba6cc"), true), CLOUD_HAZE),
  far: () => hazed(toonSpec([1, 1, 1], undefined, linear("#8bb4d8"), true), FAR_HAZE),
  glow: () => glowSpec(2.1),
  /** Glossy clearcoat paint roller ball: vivid magenta pigment, sunlit sky window, warm rim, crisp silhouette ink. */
  ball: () => glossyBallSpec({ color: LOOK.ball, skyWindow: "#eef7ff", rim: "#ffe3b3", ink: LOOK.ink })
};

/** Every distinct `material.custom` program the game draws with (verified by `shaders-compile.test.ts`). */
export function allProgramSpecs(): readonly { readonly name: string; readonly spec: CustomSpec }[] {
  const sampleSplat = createTurfSplatSurface(8, CONFIG.GRID_COLS);
  return [
    { name: "sky", spec: PROGRAMS.sky() },
    { name: "toon", spec: PROGRAMS.toon(LOOK.road) },
    { name: "toon-tone", spec: PROGRAMS.toonTone() },
    {
      name: "wet-ink-ribbon",
      spec: wetInkRibbonSpec({
        splatMap: sampleSplat.texture,
        gradingLut: sampleSplat.gradingLut,
        gessoColor: linear("#f7f4ec"),
        sunDir: LOOK.sun,
        haze: NEAR_HAZE
      })
    },
    {
      name: "dual-wet-ink",
      spec: dualWetInkSurfaceSpec({
        baseColor: linear("#f7f4ec"),
        splatMap: sampleSplat.texture,
        sunDir: LOOK.sun
      }) as CustomSpec
    },
    { name: "ink-flipbook", spec: inkFlipbookSpec(sampleSplat.inkAtlas) },
    { name: "ball", spec: PROGRAMS.ball() },
    { name: "contact-shadow", spec: contactShadowSpec() },
    { name: "cloud", spec: PROGRAMS.cloud() },
    { name: "far", spec: PROGRAMS.far() },
    { name: "glow", spec: PROGRAMS.glow() },
    { name: "flat", spec: flatSpec(linear(LOOK.solvent), 0.58) }
  ];
}

const f32 = (a: readonly number[]): Float32Array => Float32Array.from(a);

function staticGeometryFrom(m: MeshData, bounds?: { readonly min: [number, number, number]; readonly max: [number, number, number] }) {
  return geometry.define({
    positions: f32(m.positions),
    normals: f32(m.normals),
    uvs: f32(m.uvs),
    indices: Uint32Array.from(m.indices),
    ...(bounds ? { bounds } : {})
  });
}

const PARTICLE_COLORS: Record<number, string> = { 1: LOOK.ball, 2: LOOK.can, 3: LOOK.solvent, 4: LOOK.eraser };
const INK_BURST_POOL = 18;

interface InkBurstState {
  active: boolean;
  age: number;
  duration: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  size: number;
  rgb: readonly [number, number, number];
}

export function buildWorld(options: WorldOptions): World {
  void options.aspect;
  const builder: AuraSceneBuilder = scene()
    .background(LOOK.background)
    .camera(
      camera.perspective({
        ...labCameraOptions(readLabFlags(), "reversed"),
        position: [0, 8, 12],
        target: [0, 0.5, -10],
        fov: 55,
        near: 0.1,
        far: CAMERA_FAR
      })
    );

  // Sunlit outdoor skate-arena rig: 1 shadowed 2-cascade directional sun (48 deg el, -32 deg az) + softbox IBL (zero ambient).
  builder.add(
    lights.directional({
      name: "key",
      position: [-9.2, 18.6, 14.8],
      target: [0, 0, -14],
      intensity: 2.35,
      color: "#fff7e4",
      shadow: { cascades: 2, maxDistance: 88, mapSize: 2048 }
    })
  );
  builder.add(environments.studio({ preset: "softbox", name: "environment", intensity: 0.82, background: false }));

  const turfSplat = createTurfSplatSurface(CONFIG.RUN_LENGTH, CONFIG.GRID_COLS);
  const paintColorTable = LOOK.paintColors.map((hex) => hexToRgba8(hex, 255));

  const addMesh = (
    id: string,
    mesh: MeshData,
    mat: AuraMaterialSpec,
    shadow: { cast?: boolean; receive?: boolean; bounds?: { readonly min: [number, number, number]; readonly max: [number, number, number] } } = {}
  ): void => {
    builder.add(
      geometry
        .custom(staticGeometryFrom(mesh, shadow.bounds), {
          name: id,
          material: mat,
          castShadow: shadow.cast ?? false,
          receiveShadow: shadow.receive ?? false
        })
        .runtime({ id })
    );
  };

  const addBatch = (
    id: string,
    batch: Batch,
    spec: CustomSpec,
    shadow: { cast?: boolean; receive?: boolean } = {}
  ): void => {
    builder.add(
      geometry
        .custom(batch.geometry(), {
          name: id,
          material: material.custom(spec),
          castShadow: shadow.cast ?? false,
          receiveShadow: shadow.receive ?? false
        })
        .runtime({ id })
    );
  };

  const addPbrBatch = (
    id: string,
    batch: Batch,
    mat: AuraMaterialSpec,
    shadow: { cast?: boolean; receive?: boolean } = {}
  ): void => {
    builder.add(
      geometry
        .custom(batch.geometry(), {
          name: id,
          material: mat,
          castShadow: shadow.cast ?? false,
          receiveShadow: shadow.receive ?? false
        })
        .runtime({ id })
    );
  };

  addMesh("sky", sphereMesh(380, 32, 24), material.custom(PROGRAMS.sky()));
  addMesh("ball", ballMesh(), material.custom(PROGRAMS.ball()), { cast: true, receive: true });
  addMesh(
    "roller-yoke",
    turfRollerYokeMesh(),
    material.brushedMetal({ color: "#e8bb4e", roughness: 0.16, anisotropy: 0.88, anisotropyRotation: 0.42 }),
    { cast: true, receive: true }
  );
  addMesh(
    "roller-caps",
    turfRollerCapsMesh(),
    material.carPaint({ color: LOOK.roadEdge, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02 }),
    { cast: true, receive: true }
  );
  builder.add(heroRoverNode());
  builder.add(heroDriverNode());
  for (const n of rivalDriverNodes(CONFIG.POOL_BOTS)) builder.add(n);
  addMesh("ball-shadow", quadMesh(1.42, 1.48), material.custom(contactShadowSpec()));
  builder.add(finishGantryNode());

  // Static 1,200 m wet-ink splat ribbon: 1 draw call, 0 CPU vertex rewrites!
  addMesh(
    "paint",
    paintRibbonMesh(CONFIG.RUN_LENGTH, CONFIG.GRID_COLS, 300),
    material.custom(
      wetInkRibbonSpec({
        splatMap: turfSplat.texture,
        gradingLut: turfSplat.gradingLut,
        gessoColor: linear("#f7f4ec"),
        sunDir: LOOK.sun,
        haze: NEAR_HAZE
      })
    ),
    {
      cast: false,
      receive: true,
      bounds: { min: [-3.2, -0.2, -CONFIG.RUN_LENGTH - 2], max: [3.2, 0.2, 2] }
    }
  );

  const road = new Batch(roadMesh(), CONFIG.POOL_SEGMENTS, null, RUN_FRAME_BOUNDS);
  const edges = new Batch(turfArenaCurbWallMesh(), CONFIG.POOL_SEGMENTS * 2, null, RUN_FRAME_BOUNDS);
  const strips = new Batch(stripMesh(), CONFIG.POOL_STRIPS, null, RUN_FRAME_BOUNDS);
  // Idol GLB pools: roadside paint buckets (one pool per paint colour), aerosol can pickups, rival eraser karts.
  const propPools = PAINT_BUCKET_KEYS.map(() => new IdolPool(PROP_POOL_CAPACITY));
  const propVariant = new Int8Array(CONFIG.POOL_SEGMENTS * 2).fill(-1);
  const cans = new IdolPool(CONFIG.POOL_CANS);
  // Pickup readability at chase distance: a glowing hot-magenta ring under each can and a tall glowing light beacon
  // above it (unlit, over the bloom threshold), on top of a 1.7x can that spins and bobs.
  const canHalos = new Batch(cylinderMesh(0.78, 0.02, 32), CONFIG.POOL_CANS, linear(LOOK.ball), RUN_FRAME_BOUNDS);
  const canBeacons = new Batch(translateMesh(cylinderMesh(0.07, 2.4, 10), 0, 1.2, 0), CONFIG.POOL_CANS, linear(LOOK.can), RUN_FRAME_BOUNDS);
  const bots = new IdolPool(CONFIG.POOL_BOTS);
  const particles = new Batch(sphereMesh(0.12, 6, 6), CONFIG.POOL_PARTICLES, [1, 1, 1], RUN_FRAME_BOUNDS);
  const inkBursts = new Batch(billboardQuadMesh(1), INK_BURST_POOL, [1, 1, 1], {
    min: [-16, -8, -48],
    max: [16, 16, 16]
  });

  const scenery = addScenery(
    builder,
    (id, batch, spec) => addBatch(id, batch, spec),
    {
      toonTone: PROGRAMS.toonTone(),
      cloud: PROGRAMS.cloud(),
      far: PROGRAMS.far(),
      keel: PROGRAMS.toon(LOOK.keel),
      glow: PROGRAMS.glow()
    },
    CONFIG.POOL_SEGMENTS,
    EDGE_X
  );

  addBatch("road", road, PROGRAMS.toon("#f7f4ec"), { cast: false, receive: true });
  addPbrBatch(
    "edges",
    edges,
    material.pbr({ color: LOOK.roadEdge, roughness: 0.48, metalness: 0.04, clearcoat: 0, sheen: 0 }),
    { cast: false, receive: true }
  );
  PAINT_BUCKET_KEYS.forEach((key, v) => builder.add(idolInstancedNode(PAINT_BUCKET_NODE_IDS[v]!, TURF_IDOL_ASSETS[key], PROP_POOL_CAPACITY)));
  addBatch("strips", strips, flatSpec(linear(LOOK.solvent), 0.62));
  addBatch("can-halos", canHalos, glowSpec(2.6));
  addBatch("can-beacons", canBeacons, glowSpec(2.4));
  builder.add(idolInstancedNode("cans", TURF_IDOL_ASSETS.turfAerosolCan, CONFIG.POOL_CANS, { cast: true, receive: true }));
  builder.add(idolInstancedNode("bots", TURF_IDOL_ASSETS.turfRivalKartShell, CONFIG.POOL_BOTS, { cast: true, receive: true }));
  builder.add(idolInstancedNode("kart-wheels", TURF_IDOL_ASSETS.turfKartWheel, KART_WHEEL_CAPACITY, { cast: true, receive: true }));
  builder.add(idolInstancedNode("bot-brushes", TURF_IDOL_ASSETS.turfScrubBrush, CONFIG.POOL_BOTS, { cast: true, receive: true }));
  addBatch("particles", particles, PROGRAMS.toonTone());
  addBatch("ink-bursts", inkBursts, inkFlipbookSpec(turfSplat.inkAtlas));

  // Continuous pressurized paint-mist trailing the roller yoke while painting.
  builder.add(
    effects
      .particles({
        name: "roller-mist",
        position: [0, 0.16, 0.34],
        maxParticles: 30,
        rate: 24,
        speed: 1.55,
        shape: "cone",
        coneAngleDeg: 28,
        size: 0.085,
        lifetime: 0.26,
        color: LOOK.ball,
        lifetimeColorRamp: [LOOK.ball, LOOK.can],
        blend: "alpha"
      })
      .runtime({ id: "roller-mist" })
  );

  // Sunlit Eevee wet-paint post stack: contact shadows, SSAO, wet-ink SSR, cinematic bloom, grade & subtle vignette (haze handled per-material in NEAR/CLOUD/FAR_HAZE so sky dome stays 100% crisp).
  builder
    .add(effects.contactShadows({ length: 0.28, thickness: 0.14, steps: 12, intensity: 0.52 }))
    .add(effects.ambientOcclusion({ name: "ao", intensity: 0.38, radius: 0.55 }))
    .add(effects.screenSpaceReflections({ name: "ssr", intensity: 0.12, roughness: 0.18 }))
    .add(effects.cinematicBloom({ name: "bloom", intensity: LOOK.post.bloom.intensity, threshold: LOOK.post.bloom.threshold }))
    .add(effects.colorGrade({ name: "grade", ...LOOK.post.grade }))
    .add(effects.vignette({ name: "vignette", intensity: LOOK.post.vignette.intensity, color: LOOK.post.vignette.color }));

  return {
    scene: builder,
    bind(app: AuraApp): WorldRuntime {
      const handles = new Map<string, ReturnType<AuraApp["nodes"]["require"]>>();
      const node = (id: string) => {
        let h = handles.get(id);
        if (!h) handles.set(id, (h = app.nodes.require(id)));
        return h;
      };
      const maybeController = app.camera;
      if (!maybeController) throw new Error("splat-turf: the app exposes no camera controller");
      const controller = maybeController;

      // 0 = dry gesso, 1 = glossy painted, 2 = cyan solvent wash; -1 forces initial sync.
      const cellTone = new Int8Array(GRID_CELLS).fill(-1);
      const segRow = new Float64Array(CONFIG.POOL_SEGMENTS).fill(Number.NaN);
      const stripKey = Array.from({ length: CONFIG.POOL_STRIPS }, () => "");
      const canKey = Array.from({ length: CONFIG.POOL_CANS }, () => "");
      const botShown = Array.from({ length: CONFIG.POOL_BOTS }, () => false);
      const botHit = Array.from({ length: CONFIG.POOL_BOTS }, () => false);
      const botKnockFrom = new Float64Array(CONFIG.POOL_BOTS).fill(Number.NaN);
      const botKnockSide = new Int8Array(CONFIG.POOL_BOTS);
      const botKnockClear = new Float64Array(CONFIG.POOL_BOTS);
      const particleShown = Array.from({ length: CONFIG.POOL_PARTICLES }, () => false);
      const particleKind = new Int8Array(CONFIG.POOL_PARTICLES).fill(-1);
      const bursts: InkBurstState[] = Array.from({ length: INK_BURST_POOL }, () => ({
        active: false,
        age: 0,
        duration: 0.42,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        size: 1,
        rgb: [1, 0.2, 0.55]
      }));
      let burstCursor = 0;
      let burstSerial = 0;
      let lastBurstClock = 0;
      let lastDistance = 0;
      let lastLane = Number.NaN;
      let lastTime = 0;
      let lateral = 0;
      let lastSquash = "";
      // Rigged drivers: skeletons load once (the GLB is already fetched by the renderer; this reads its glTF JSON).
      const load = options.loadHumanoid ?? ((url: string) => loadIdolHumanoid(url));
      let heroDriver: HumanoidDriver | undefined;
      let rivalDriver: HumanoidDriver | undefined;
      let heroHips: readonly [number, number, number] = [0, 0.5, 0];
      let rivalHips: readonly [number, number, number] = [0, 0.5, 0];
      const driversReady = Promise.all([
        load(TURF_IDOL_ASSETS.turfHeroDriverRig.url).then((d) => { heroDriver = d; heroHips = seatedHips(d); }),
        load(TURF_IDOL_ASSETS.turfRivalDriverRig.url).then((d) => { rivalDriver = d; rivalHips = seatedHips(d); })
      ]).catch((e: unknown) => { console.warn("splat-turf: rigged drivers unavailable", e); });
      void driversReady;
      const wheelWriter = new MatrixWriter(KART_WHEEL_CAPACITY);
      const brushWriter = new MatrixWriter(CONFIG.POOL_BOTS);
      const pushKartWheels = (parent: Mat4, layout: KartLayout, spin: number, steer: number): void => {
        for (let w = 0; w < 4; w++) wheelWriter.push(multiply(parent, wheelLocal(layout, WHEEL_GLB, w, spin, steer)));
      };

      function spawnInkBurst(kind: InkBurstKind): void {
        const count = kind === "finish" ? 4 : kind === "eraser" ? 3 : 2;
        const baseHex =
          kind === "can"
            ? LOOK.can
            : kind === "solvent"
              ? LOOK.solvent
              : kind === "eraser"
                ? "#ff2e6c"
                : kind === "stretch"
                  ? paintColorFor(Math.floor(lastDistance))
                  : LOOK.finish;
        const rgb = linear(baseHex);
        const laneX = Number.isFinite(lastLane) ? lastLane : 0;

        for (let k = 0; k < count; k += 1) {
          const slot = bursts[burstCursor % INK_BURST_POOL]!;
          burstCursor += 1;
          burstSerial += 1;
          const angle = ((burstSerial * 2.39996) % (Math.PI * 2));
          const spread = 0.24 + (k % 3) * 0.16;
          slot.active = true;
          slot.age = 0;
          slot.duration = kind === "eraser" ? 0.46 : 0.38;
          slot.x = laneX + Math.cos(angle) * spread;
          slot.y = 0.48 + (k % 2) * 0.22;
          slot.z = -0.25 - k * 0.18;
          slot.vx = Math.cos(angle) * (1.2 + k * 0.45);
          slot.vy = 1.45 + (k % 2) * 0.65;
          slot.vz = -0.8 - k * 0.35;
          slot.size = kind === "eraser" ? 1.55 : kind === "solvent" ? 1.35 : 1.2;
          slot.rgb = rgb;
        }
      }

      function updateInkBursts(dt: number, reduced: boolean): void {
        const stepDt = Math.min(0.05, Math.max(0, dt));
        for (let i = 0; i < INK_BURST_POOL; i += 1) {
          const b = bursts[i]!;
          if (!b.active) continue;
          b.age += stepDt > 0 ? stepDt : 1 / 60;
          if (b.age >= b.duration || reduced) {
            b.active = false;
            inkBursts.collapse(i);
            continue;
          }
          const t = b.age / b.duration;
          const x = b.x + b.vx * b.age;
          const y = Math.max(0.18, b.y + b.vy * b.age - 3.6 * b.age * b.age);
          const z = b.z + b.vz * b.age;
          const sc = b.size * (0.65 + 0.75 * Math.sin(Math.min(1, t * 1.35) * Math.PI * 0.5));
          const frame = Math.min(31, Math.floor(t * 32));
          inkBursts.place(i, x, y, z, 0, sc, sc, sc);
          inkBursts.setTone(i, packInkBurstTone(frame, b.rgb));
        }
        inkBursts.flush(node("ink-bursts"), false);
      }

      function updatePaint(sim: SplatTurfSim, distance: number): void {
        const full = distance < lastDistance - 5;
        if (full) {
          turfSplat.clearAll();
          cellTone.fill(0);
        }
        const from = full ? 0 : Math.max(0, Math.floor(distance) - 25);
        const to = full ? CONFIG.RUN_LENGTH : Math.min(CONFIG.RUN_LENGTH, Math.floor(distance) + 13);
        const washRow = Math.floor(distance);
        const colorCount = paintColorTable.length;
        for (let r = from; r < to; r++) {
          const stretchColor = paintColorTable[Math.floor(r / 25) % colorCount]!;
          for (let c = 0; c < CONFIG.GRID_COLS; c++) {
            const idx = r * CONFIG.GRID_COLS + c;
            const painted = sim.grid[idx] === 1;
            const wash =
              !painted &&
              sim.o.wipeFlash > 0 &&
              r >= washRow - CONFIG.ERASER_WIPE_METERS - 1 &&
              r <= washRow + CONFIG.SOLVENT_LENGTH + 1;
            const state = painted ? 1 : wash ? 2 : 0;
            if (cellTone[idx] === state) continue;
            cellTone[idx] = state;
            turfSplat.writeCell(r, c, state, stretchColor);
          }
        }
        turfSplat.flush();
        lastDistance = distance;
      }

      function update(sim: SplatTurfSim, aspect: number, view: WorldView = {}): void {
        const o = sim.o;
        const distance = view.shown?.distance ?? o.distance;
        const back = view.shown?.back ?? 0;
        const laneOffset = view.shown?.laneOffset ?? o.laneOffset;
        const time = view.shown?.time ?? o.time;
        const roadZ = distance - back;
        const reduced = view.reducedMotion === true;

        // Road + clearcoat barriers + roadside props: rewritten only when a segment recycles.
        for (let i = 0; i < o.segments.length; i++) {
          const seg = o.segments[i]!;
          if (segRow[i] === seg.row) continue;
          segRow[i] = seg.row;
          road.place(i, 0, -0.15, -seg.row - 0.5, 0, 1, 1, 1);
          edges.place(i * 2, -EDGE_X, -0.12, -seg.row - 0.5, 0, 1, 1, 1);
          edges.place(i * 2 + 1, EDGE_X, -0.12, -seg.row - 0.5, 0, 1, 1, 1);
          scenery.placeSegment(i, seg.row);
          for (let side = 0; side < 2; side++) {
            const slot = i * 2 + side;
            const prev = propVariant[slot]!;
            if (prev >= 0) {
              propPools[prev]!.collapse(propSlot(slot));
              propVariant[slot] = -1;
            }
            const prop = roadsidePropPose(seg.row, side);
            if (!prop) continue;
            propPools[prop.variant]!.place(propSlot(slot), prop.x, -0.35, -seg.row - 0.5, prop.yaw, prop.sc, 0, 0, prop.sy);
            propVariant[slot] = prop.variant;
            scenery.placeIslet(seg.row, side, prop.x, prop.sc);
          }
        }

        updatePaint(sim, distance);

        // Solvent strips and pressurized aerosol cans: written when they spawn / recycle.
        for (let i = 0; i < o.strips.length; i++) {
          const s = o.strips[i]!;
          const key = s.active ? `${s.row}:${s.col}` : "";
          if (stripKey[i] === key) continue;
          stripKey[i] = key;
          if (s.active) strips.place(i, s.col - CONFIG.LANE_LIMIT, 0.04, -s.row - CONFIG.SOLVENT_LENGTH / 2, 0, 1, 1, 1);
          else strips.collapse(i);
        }
        for (let i = 0; i < o.cans.length; i++) {
          const c = o.cans[i]!;
          const key = c.active ? `${c.row}:${c.col}` : "";
          if (canKey[i] === key) continue;
          canKey[i] = key;
          if (c.active) {
            const cx = c.col - CONFIG.LANE_LIMIT;
            const cz = -c.row - 0.5;
            canHalos.place(i, cx, 0.02, cz, 0, 1, 1, 1);
            canBeacons.place(i, cx, 0, cz, 0, 1, 1, 1);
          } else {
            cans.collapse(i);
            canHalos.collapse(i);
            canBeacons.collapse(i);
          }
        }
        // Live cans spin and bob every frame (presentation only; collection is the sim's row/col test).
        for (let i = 0; i < o.cans.length; i++) {
          const c = o.cans[i]!;
          if (!c.active) continue;
          const spin = reduced ? c.row * 0.7 : c.row * 0.7 + time * 2.4;
          const bob = reduced ? 0.05 : 0.05 + 0.08 * (0.5 + 0.5 * Math.sin(time * 4 + c.row));
          cans.place(i, c.col - CONFIG.LANE_LIMIT, bob, -c.row - 0.5, spin, CAN_SCALE);
        }

        const botFrames: { x: number; y: number; z: number; yaw: number; dir: number; slot: number }[] = [];
        // Karts knocked in the same step (a strike) share one bump pop so they fly off in formation.
        let strikeClear = 0;
        for (let i = 0; i < o.bots.length; i++) {
          const b = o.bots[i]!;
          if (b.active && b.hit && Number.isNaN(botKnockFrom[i]!)) strikeClear = Math.max(strikeClear, knockClearance(b.x, laneOffset));
        }
        // Rival eraser karts face the approaching player (+Z) and slide laterally every frame; a hit kart greys out.
        for (let i = 0; i < o.bots.length; i++) {
          const b = o.bots[i]!;
          if (!b.active) {
            if (botShown[i]) {
              bots.collapse(i);
              botShown[i] = false;
            }
            continue;
          }
          const steer = reduced ? 0 : Math.max(-0.22, Math.min(0.22, b.dir * BOT_STEER_YAW));
          if (!b.hit) botKnockFrom[i] = Number.NaN;
          else if (Number.isNaN(botKnockFrom[i]!)) {
            botKnockFrom[i] = distance;
            botKnockSide[i] = b.x > laneOffset ? 1 : b.x < laneOffset ? -1 : b.x >= 0 ? 1 : -1;
            botKnockClear[i] = strikeClear;
          }
          const knock = b.hit ? eraserKnock(distance - botKnockFrom[i]!, botKnockSide[i]!, reduced, botKnockClear[i]!) : { dx: 0, dy: 0, spin: 0 };
          const bx = b.x + knock.dx;
          bots.place(i, bx, knock.dy, -b.row, steer + knock.spin);
          botFrames.push({ x: bx, y: knock.dy, z: -b.row, yaw: steer + knock.spin, dir: b.dir, slot: i });
          botShown[i] = true;
          if (botHit[i] !== b.hit) {
            botHit[i] = b.hit;
            bots.setTint(i, b.hit ? BOT_HIT_TINT : WHITE);
          }
        }

        for (let i = 0; i < o.particles.length; i++) {
          const p = o.particles[i]!;
          if (!p.active) {
            if (particleShown[i]) {
              particles.collapse(i);
              particleShown[i] = false;
            }
            continue;
          }
          const s = Math.max(0.2, p.life * 1.6);
          particles.place(i, p.x, p.y, -p.z, 0, s, s, s);
          particleShown[i] = true;
          if (particleKind[i] !== p.kind) {
            particleKind[i] = p.kind;
            particles.setTone(i, linear(PARTICLE_COLORS[p.kind] ?? LOOK.ball));
          }
        }

        // Scrolling frame: one node transform per corridor layer.
        for (const id of BATCH_IDS) {
          node(id).setPosition(0, id === "paint" ? CELL_Y : 0, roadZ);
        }
        const roadFrame = [0, 0, roadZ] as const;
        node("finish").setPosition(0, 0, roadZ - CONFIG.RUN_LENGTH);
        road.flush(node("road"));
        edges.flush(node("edges"));
        propPools.forEach((pool, v) => pool.flush(node(PAINT_BUCKET_NODE_IDS[v]!), false, roadFrame));
        strips.flush(node("strips"), false);
        canHalos.flush(node("can-halos"), false);
        canBeacons.flush(node("can-beacons"), false);
        cans.flush(node("cans"), false, roadFrame);
        bots.flush(node("bots"), false, roadFrame);
        particles.flush(node("particles"));
        scenery.update(node, roadZ, distance, time, reduced);

        // Hero roller ball + gimbaled chrome roller yoke + pressurized mist.
        const bursting = o.phase === "bursting";
        const gone = o.phase === "gameOver";
        const scale = bursting ? 1 + (1 - o.burstTimer / CONFIG.BURST_SECONDS) * 0.6 : 1;
        const dt = time - lastTime;
        if (Number.isFinite(lastLane) && dt > 1e-4 && dt < 0.25) {
          lateral += ((laneOffset - lastLane) / dt - lateral) * Math.min(1, dt * 18);
        } else {
          lateral = 0;
        }
        lastLane = laneOffset;
        lastTime = time;

        const burstDt = time >= lastBurstClock ? time - lastBurstClock : 1 / 60;
        lastBurstClock = time;
        updateInkBursts(burstDt, reduced);

        const [qx, qy, qz] = ballSquash(o.phase === "playing" ? lateral : 0, o.speed, reduced);
        const ball = node("ball");
        ball.setPosition(laneOffset, BALL_RADIUS * scale, 0).setRotation(distance / BALL_RADIUS, 0, 0).setScale(scale).setVisible(!gone);
        const squashKey = `${qx.toFixed(3)},${qy.toFixed(3)},${qz.toFixed(3)},${scale.toFixed(3)}`;
        if (squashKey !== lastSquash) {
          ball.setUniform?.("crSquash", [qx, qy, qz, BALL_RADIUS * scale]);
          lastSquash = squashKey;
        }

        const yokeBank = reduced ? 0 : Math.max(-0.28, Math.min(0.28, -lateral * 0.042));
        const yokePitch = reduced ? -0.14 : -0.14 - Math.min(0.12, Math.max(0, (o.speed - CONFIG.SPEED_INIT) * 0.006));
        const roverPitch = reduced ? 0 : -Math.min(0.08, Math.max(0, (o.speed - CONFIG.SPEED_INIT) * 0.004));
        node("roller-yoke")
          .setPosition(laneOffset, BALL_RADIUS * scale, 0)
          .setRotation(yokePitch, yokeBank * 0.35, yokeBank)
          .setScale(scale)
          .setVisible(!gone);
        node("roller-caps")
          .setPosition(laneOffset, BALL_RADIUS * scale, 0)
          .setRotation(yokePitch, yokeBank * 0.35, yokeBank)
          .setScale(scale)
          .setVisible(!gone);
        node("ink-rover-body")
          .setPosition(laneOffset, BALL_RADIUS * scale, 0)
          .setRotation(roverPitch, yokeBank * 0.42, yokeBank * 0.65)
          .setScale(scale)
          .setVisible(!gone);
        // Moving parts: hero wheels roll by distance / radius and steer with the lateral speed; rival wheels roll with
        // their lateral slide and steer into it; rival scrub brushes spin continuously (world-space instanced draws).
        wheelWriter.begin();
        brushWriter.begin();
        if (!gone) {
          const heroParent = multiply(
            trs([laneOffset, BALL_RADIUS * scale, 0], [roverPitch, yokeBank * 0.42, yokeBank * 0.65], scale),
            HERO_BODY_LOCAL
          );
          const heroSteer = reduced ? 0 : Math.max(-0.4, Math.min(0.4, -lateral * 0.08));
          pushKartWheels(heroParent, HERO_KART_LAYOUT, distance / HERO_KART_LAYOUT.wheelRadius, heroSteer);
        }
        // Hero driver: seated in the empty shell, hands on the turning wheel, torso and head leaning into the steer.
        const speedRatio = Math.max(0, Math.min(1, (o.speed - CONFIG.SPEED_INIT) / Math.max(1e-6, CONFIG.SPEED_INIT)));
        if (heroDriver) {
          const hs = DRIVER_RIG_SCALE.turfHeroDriverRig;
          const steerIn = reduced ? 0 : Math.max(-1, Math.min(1, -lateral * 0.2));
          // world = kart pose · shell offset (Ry pi) · T(seat - scale * seated hips) · S(rig scale)
          const seat = decompose(multiply(
            multiply(trs([laneOffset, BALL_RADIUS * scale, 0], [roverPitch, yokeBank * 0.42, yokeBank * 0.65], scale), HERO_BODY_LOCAL),
            trs([HERO_SEAT[0] - hs * heroHips[0], HERO_SEAT[1] - hs * heroHips[1], HERO_SEAT[2] - hs * heroHips[2]], [0, 0, 0], hs)
          ));
          node(HERO_DRIVER_ID)
            .setPosition(seat.t[0], seat.t[1], seat.t[2])
            .setRotation(seat.rot[0], seat.rot[1], seat.rot[2])
            .setScale(seat.s)
            .setVisible(!gone)
            .setAnimationPose?.(driverPose(heroDriver, { steer: steerIn, time, speed: speedRatio, reduced }).pose as never);
        }
        const brushSpin = reduced ? 0 : -time * BRUSH_SPIN_RATE;
        for (const f of botFrames) {
          const parent = trs([f.x, f.y, f.z + roadZ], [0, f.yaw, 0]);
          pushKartWheels(parent, RIVAL_KART_LAYOUT, f.x / RIVAL_KART_LAYOUT.wheelRadius, reduced ? 0 : f.dir * 0.45);
          brushWriter.push(multiply(parent, multiply(trs([0, RIVAL_BRUSH_LOCAL.y, RIVAL_BRUSH_LOCAL.z], [brushSpin, 0, 0]), trs([0, -IDOL_DIMS.turfScrubBrush[1] / 2, 0]))));
          if (rivalDriver) {
            const rs = DRIVER_RIG_SCALE.turfRivalDriverRig;
            const at = transformPoint(parent, [RIVAL_SEAT[0] - rs * rivalHips[0], RIVAL_SEAT[1] - rs * rivalHips[1], RIVAL_SEAT[2] - rs * rivalHips[2]]);
            node(rivalDriverId(f.slot))
              .setPosition(at[0], at[1], at[2])
              .setRotation(0, f.yaw, 0)
              .setVisible(true)
              .setAnimationPose?.(driverPose(rivalDriver, { steer: reduced ? 0 : f.dir * 0.8, time: time + f.slot * 0.7, speed: 0.5, reduced }).pose as never);
          }
        }
        for (let i = 0; i < CONFIG.POOL_BOTS; i++) if (!o.bots[i]!.active) node(rivalDriverId(i)).setVisible(false);
        wheelWriter.end(node("kart-wheels"));
        brushWriter.end(node("bot-brushes"));
        node("roller-mist")
          .setPosition(laneOffset, 0.16, 0.34)
          .setVisible(!gone && !reduced && o.phase === "playing" && o.wipeFlash <= 0);
        node("ball-shadow")
          .setPosition(laneOffset - 0.05, CELL_Y + 0.014, 0.22)
          .setScale([scale * qx, 1, scale * qz])
          .setVisible(!gone);

        // Chase camera + deterministic sim shake + real-time ImpactRig trauma/roll/FOV kick.
        const c = view.camera ?? { x: 0.5 * laneOffset, y: 5, z: 9, lookX: laneOffset, lookY: 0.5, lookZ: -10 };
        const shake = reduced ? 0 : o.shake * 0.25;
        const impactShake = view.impactShake ?? [0, 0, 0];
        const sx = shake * Math.sin(time * 47) + (reduced ? 0 : impactShake[0]);
        const sy = shake * Math.cos(time * 53) + (reduced ? 0 : impactShake[1]);
        const roll = reduced ? 0 : (view.impactRoll ?? 0);
        const baseFov = aspect >= 1 ? 55 : 55 + 25 * Math.min(1, (1 - aspect) / 0.5);
        const speedFov = reduced || o.phase !== "playing" ? 0 : (o.speed - CONFIG.SPEED_INIT) * 0.5;
        const fov = Math.max(46, Math.min(86, baseFov + speedFov + (reduced ? 0 : (view.impactFov ?? 0))));
        controller.setPose(
          {
            position: [c.x + sx, c.y + sy, c.z],
            target: [c.lookX, c.lookY, c.lookZ],
            up: [Math.sin(roll), Math.cos(roll), 0],
            fov
          },
          { cut: false }
        );
      }

      const batches = [
        road,
        edges,
        strips,
        canHalos,
        canBeacons,
        particles,
        inkBursts,
        ...scenery.batches
      ];

      function warm(on: boolean): void {
        // Park one instance of each pooled batch below the road so every GPU pipeline compiles before frame one.
        if (on) {
          strips.place(0, 0, -50, -60, 0, 1, 1, 1);
          cans.place(0, 0, -50, -60, 0);
          bots.place(0, 0, -50, -60, 0);
          particles.place(0, 0, -50, -60, 0, 1, 1, 1);
          inkBursts.place(0, 0, -50, -60, 0, 1, 1, 1);
        } else {
          strips.collapse(0);
          cans.collapse(0);
          bots.collapse(0);
          particles.collapse(0);
          inkBursts.collapse(0);
          stripKey.fill("");
          canKey.fill("");
          botShown.fill(false);
          particleShown.fill(false);
        }
        strips.flush(node("strips"), false);
        cans.flush(node("cans"), true);
        bots.flush(node("bots"), true);
        particles.flush(node("particles"));
        inkBursts.flush(node("ink-bursts"), false);
      }

      return {
        update,
        warm,
        spawnInkBurst,
        get nodeCount() {
          return handles.size;
        },
        get uploadedVertices() {
          return batches.reduce((sum, b) => sum + b.uploadedVertices, 0);
        }
      };
    }
  };
}
