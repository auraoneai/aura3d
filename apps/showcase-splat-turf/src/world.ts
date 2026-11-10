/**
 * Splat Turf world on `@aura3d/engine` 5.5.1 (WP-17):
 * - Sunlit urban skate-arena lighting: shadowed 2-cascade directional sun + softbox studio IBL (zero ambient),
 *   contact shadows, SSAO, wet-ink SSR, extent fog, cinematic bloom, and broadcast-crisp color grading.
 * - Single-draw RGBA8 GPU splat coverage ribbon (`createTurfSplatSurface` + `wetInkRibbonSpec` paired GLSL+WGSL)
 *   replacing the former 7,200-quad dynamic paint batch (0 dynamic paint vertex uploads).
 * - Articulated PBR clearcoat & chrome hero paint-roller yoke, pressurized aerosol cans with chrome nozzles,
 *   rotary floor-scrubber eraser bots with glowing hazard beacons, and 32-frame `createFlipbookAtlas("ink")` bursts.
 */
import {
  camera,
  effects,
  environments,
  geometry,
  lights,
  looks,
  material,
  scene,
  type AuraApp,
  type AuraMaterialSpec,
  type AuraSceneBuilder
} from "@aura3d/engine";
import { labCameraOptions, readLabFlags } from "../../../examples/shared/lab-flags";
import {
  Batch,
  CORRIDOR_BOUNDS,
  flatSpec,
  toonSpec,
  type CustomSpec
} from "../../../examples/shared/runner-kit/index";
import { CONFIG, type SplatTurfSim } from "./sim";
import { LOOK, hexToRgba8, linear, paintColorFor } from "./look";
import {
  BALL_RADIUS,
  ballMesh,
  botMesh,
  boxMesh,
  canMesh,
  cylinderMesh,
  edgeMesh,
  finishMesh,
  merge,
  propMesh,
  quadMesh,
  roadMesh,
  sphereMesh,
  stripMesh,
  translateMesh,
  type MeshData
} from "./meshes";
import type { CameraPose, Shown } from "./presentation";
import { glowSpec, hazed, sunsetSkySpec, type Haze } from "./art/haze";
import { addScenery } from "./scenery";
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
  "props",
  "paint",
  "strips",
  "cans",
  "can-nozzles",
  "bots",
  "bot-scrubbers",
  "bot-beacons",
  "particles"
] as const;

/** Roadside paint pots: one every PROP_SPACING m on each side, sized and tinted from the row (no RNG). */
export const PROP_SPACING = 10;

function propHash(row: number, side: number): number {
  const h = Math.sin(row * 12.9898 + side * 78.233) * 43758.5453;
  return h - Math.floor(h);
}

/* ------------------------------------------------------------------ articulated PBR detail meshes */

/** Gimbaled chrome paint-roller yoke straddling the 0.45 m roller ball (origin at ball centre). */
function rollerYokeMesh(): MeshData {
  return merge([
    translateMesh(boxMesh(0.055, 0.055, 0.56), -0.52, 0.04, 0.24),
    translateMesh(boxMesh(0.055, 0.055, 0.56), 0.52, 0.04, 0.24),
    translateMesh(boxMesh(1.1, 0.06, 0.065), 0, 0.08, 0.52),
    translateMesh(cylinderMesh(0.042, 0.42, 10), 0, 0.22, 0.66)
  ]);
}

/** Clearcoat bearing endcaps clamping both ends of the paint roller. */
function rollerCapsMesh(): MeshData {
  return merge([
    translateMesh(boxMesh(0.09, 0.18, 0.18), -0.49, 0, 0),
    translateMesh(boxMesh(0.09, 0.18, 0.18), 0.49, 0, 0),
    translateMesh(sphereMesh(0.075, 10, 8, 0, 0.42, 0.66), 0, 0, 0)
  ]);
}

/** Chrome aerosol spray valve & collar atop each paint canister (`canMesh` lid sits at y = 0.56). */
function canNozzleMesh(): MeshData {
  return merge([
    translateMesh(cylinderMesh(0.18, 0.05, 12), 0, 0.585, 0),
    translateMesh(cylinderMesh(0.065, 0.09, 10), 0, 0.645, 0)
  ]);
}

/** Counter-rotating notched floor-scrubber foam ring around each eraser bot base. */
function botScrubberMesh(): MeshData {
  return merge([
    translateMesh(cylinderMesh(0.56, 0.09, 14), 0, 0.055, 0),
    translateMesh(boxMesh(1.16, 0.07, 0.12), 0, 0.06, 0),
    translateMesh(boxMesh(0.12, 0.07, 0.88), 0, 0.06, 0)
  ]);
}

/** Glowing hazard strobe beacon mounted on top of each eraser bot dome (`y = 0.62`). */
function botBeaconMesh(): MeshData {
  return sphereMesh(0.11, 10, 8, 0, 0.62, 0);
}

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

/* Sunlit atmospheric horizon haze tiers. */
const NEAR_HAZE: Haze = { color: linear(LOOK.haze), near: 55, far: 245, max: 0.82 };
const CLOUD_HAZE: Haze = { color: linear(LOOK.haze), near: 35, far: 235, max: 0.68 };
const FAR_HAZE: Haze = { color: linear(LOOK.haze), near: 70, far: 340, max: 0.78 };

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
    rollerYokeMesh(),
    material.chrome({ color: "#f6faff", roughness: 0.024, envMapIntensity: 2.1 }),
    { cast: true, receive: true }
  );
  addMesh(
    "roller-caps",
    rollerCapsMesh(),
    material.clearcoatPaint({ color: LOOK.roadEdge, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.4 }),
    { cast: true, receive: true }
  );
  addMesh("ball-shadow", quadMesh(1.18, 1.18), material.custom(contactShadowSpec()));
  addMesh(
    "finish",
    finishMesh(),
    material.clearcoatPaint({ color: LOOK.finish, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.55 }),
    { cast: true, receive: true }
  );

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

  const road = new Batch(roadMesh(), CONFIG.POOL_SEGMENTS, null, CORRIDOR_BOUNDS);
  const edges = new Batch(edgeMesh(), CONFIG.POOL_SEGMENTS * 2, null, CORRIDOR_BOUNDS);
  const props = new Batch(propMesh(), CONFIG.POOL_SEGMENTS * 2, [1, 1, 1], CORRIDOR_BOUNDS);
  const strips = new Batch(stripMesh(), CONFIG.POOL_STRIPS, null, CORRIDOR_BOUNDS);
  const cans = new Batch(canMesh(), CONFIG.POOL_CANS, null, CORRIDOR_BOUNDS);
  const canNozzles = new Batch(canNozzleMesh(), CONFIG.POOL_CANS, null, CORRIDOR_BOUNDS);
  const bots = new Batch(botMesh(), CONFIG.POOL_BOTS, linear(LOOK.eraser), CORRIDOR_BOUNDS);
  const botScrubbers = new Batch(botScrubberMesh(), CONFIG.POOL_BOTS, null, CORRIDOR_BOUNDS);
  const botBeacons = new Batch(botBeaconMesh(), CONFIG.POOL_BOTS, null, CORRIDOR_BOUNDS);
  const particles = new Batch(sphereMesh(0.12, 6, 6), CONFIG.POOL_PARTICLES, [1, 1, 1], CORRIDOR_BOUNDS);
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
    material.clearcoatPaint({ color: LOOK.roadEdge, roughness: 0.075, clearcoat: 1, clearcoatRoughness: 0.024, envMapIntensity: 1.45 }),
    { cast: false, receive: true }
  );
  addBatch("props", props, PROGRAMS.toonTone());
  addBatch("strips", strips, flatSpec(linear(LOOK.solvent), 0.62));
  addPbrBatch(
    "cans",
    cans,
    material.clearcoatPaint({ color: LOOK.can, roughness: 0.055, clearcoat: 1, clearcoatRoughness: 0.018, envMapIntensity: 1.55 }),
    { cast: true, receive: true }
  );
  addPbrBatch(
    "can-nozzles",
    canNozzles,
    material.chrome({ color: "#f8fbff", roughness: 0.022, envMapIntensity: 2.05 }),
    { cast: true, receive: false }
  );
  addBatch("bots", bots, PROGRAMS.toonTone(), { cast: true, receive: true });
  addPbrBatch(
    "bot-scrubbers",
    botScrubbers,
    material.rubber({ color: "#1ad4d8", roughness: 0.5 }),
    { cast: false, receive: true }
  );
  addPbrBatch(
    "bot-beacons",
    botBeacons,
    material.glowingEmissive({ color: "#ff335c", emissive: "#ff2652", emissiveIntensity: 3.1, practical: true }),
    { cast: false, receive: false }
  );
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

  // Sunlit Eevee wet-paint post stack: contact shadows, SSAO, wet-ink SSR, extent fog, cinematic bloom, grade & subtle vignette.
  builder
    .add(effects.contactShadows({ length: 0.28, thickness: 0.14, steps: 12, intensity: 0.52 }))
    .add(effects.ambientOcclusion({ name: "ao", intensity: 0.38, radius: 0.55 }))
    .add(effects.screenSpaceReflections({ name: "ssr", intensity: 0.54, roughness: 0.22 }))
    .add(looks.fogForExtent({ name: "fog", extent: 265, color: LOOK.haze, haze: 0.46, mode: "exp2" }))
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
            if (seg.row < 0 || ((seg.row + side * 3) % PROP_SPACING) !== 0) {
              props.collapse(slot);
              continue;
            }
            const h = propHash(seg.row, side);
            const x = (side === 0 ? -1 : 1) * (EDGE_X + 2.2 + h * 3.6);
            const sc = 0.6 + h * 0.45;
            props.place(slot, x, -0.35, -seg.row - 0.5, h * 6.28, sc, sc * (0.9 + propHash(seg.row + 7, side) * 0.35), sc);
            scenery.placeIslet(seg.row, side, x, sc);
            props.setTone(slot, linear(LOOK.paintColors[Math.floor(propHash(seg.row + 3, side) * LOOK.paintColors.length)] as string));
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
            const yaw = c.row * 0.7;
            cans.place(i, cx, 0, cz, yaw, 1, 1, 1);
            canNozzles.place(i, cx, 0, cz, yaw, 1, 1, 1);
          } else {
            cans.collapse(i);
            canNozzles.collapse(i);
          }
        }

        // Articulated rotary eraser bots lateral-move every frame; scrubber foam rings spin continuously.
        const scrubberSpin = reduced ? 0 : time * 9.5;
        for (let i = 0; i < o.bots.length; i++) {
          const b = o.bots[i]!;
          if (!b.active) {
            if (botShown[i]) {
              bots.collapse(i);
              botScrubbers.collapse(i);
              botBeacons.collapse(i);
              botShown[i] = false;
            }
            continue;
          }
          bots.place(i, b.x, 0, -b.row, 0, 1, 1, 1);
          botScrubbers.place(i, b.x, 0, -b.row, scrubberSpin + i * 1.1, 1, 1, 1);
          const pulse = reduced ? 1 : 0.9 + 0.22 * Math.sin(time * 14 + i * 2.1);
          botBeacons.place(i, b.x, 0, -b.row, 0, pulse, pulse, pulse);
          botShown[i] = true;
          if (botHit[i] !== b.hit) {
            botHit[i] = b.hit;
            bots.setTone(i, b.hit ? [0.25, 0.25, 0.32] : linear(LOOK.eraser));
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
        node("finish").setPosition(0, 0, roadZ - CONFIG.RUN_LENGTH);
        road.flush(node("road"));
        edges.flush(node("edges"));
        props.flush(node("props"));
        strips.flush(node("strips"), false);
        cans.flush(node("cans"));
        canNozzles.flush(node("can-nozzles"));
        bots.flush(node("bots"));
        botScrubbers.flush(node("bot-scrubbers"));
        botBeacons.flush(node("bot-beacons"));
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
        node("roller-mist")
          .setPosition(laneOffset, 0.16, 0.34)
          .setVisible(!gone && !reduced && o.phase === "playing" && o.wipeFlash <= 0);
        node("ball-shadow")
          .setPosition(laneOffset - 0.05, CELL_Y + 0.014, -0.04)
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
        props,
        strips,
        cans,
        canNozzles,
        bots,
        botScrubbers,
        botBeacons,
        particles,
        inkBursts,
        ...scenery.batches
      ];

      function warm(on: boolean): void {
        // Park one instance of each pooled batch below the road so every GPU pipeline compiles before frame one.
        if (on) {
          strips.place(0, 0, -50, -60, 0, 1, 1, 1);
          cans.place(0, 0, -50, -60, 0, 1, 1, 1);
          canNozzles.place(0, 0, -50, -60, 0, 1, 1, 1);
          bots.place(0, 0, -50, -60, 0, 1, 1, 1);
          botScrubbers.place(0, 0, -50, -60, 0, 1, 1, 1);
          botBeacons.place(0, 0, -50, -60, 0, 1, 1, 1);
          particles.place(0, 0, -50, -60, 0, 1, 1, 1);
          inkBursts.place(0, 0, -50, -60, 0, 1, 1, 1);
        } else {
          strips.collapse(0);
          cans.collapse(0);
          canNozzles.collapse(0);
          bots.collapse(0);
          botScrubbers.collapse(0);
          botBeacons.collapse(0);
          particles.collapse(0);
          inkBursts.collapse(0);
          stripKey.fill("");
          canKey.fill("");
          botShown.fill(false);
          particleShown.fill(false);
        }
        strips.flush(node("strips"), false);
        cans.flush(node("cans"));
        canNozzles.flush(node("can-nozzles"));
        bots.flush(node("bots"));
        botScrubbers.flush(node("bot-scrubbers"));
        botBeacons.flush(node("bot-beacons"));
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
