// Siege Golf — single-path rebuild on the salvaged gameplay core.
// Every URL boots this module; the former legacy/v2 dispatcher is deleted.
//
// Kit-vs-salvaged division (parent-accepted PORT scoping): the public
// mini-golf kit (`games.createMiniGolfState` / `games.miniGolfPointerShot`)
// canonicalizes every shot input and launch speed through the salvaged
// shot.ts oracle — the scene never re-derives aim or power math. The kit has
// no destructible structures or hole flow, so those travel salvaged and
// unchanged: course.ts (9 authored holes), structures.ts (Rapier hole
// simulation + PropVisual descriptors), hole-flow.ts (aiming -> simulating
// -> complete/failed state machine), score.ts (par/stars/round totals) and
// solutions.ts (verified canonical strokes, replayed by ?autorun=1).
// This module is presentation only: one union scene posed from live sim
// bodies, aim/charge input, HUD, audio cues and evidence.
import {
  camera,
  environments,
  game as engineGame,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraCameraPose,
  type AuraCameraRig,
  type AuraCameraRigContext,
  type AuraNodeInput
} from "@aura3d/engine";
import { createGame, lookManifest, sfxUrl, type GameHudMountOptions } from "@aura3d/engine/game";
import { SIEGE_GOLF_HOLES } from "./gameplay/course";
import { HoleFlow, type SiegeGameEvent } from "./gameplay/hole-flow";
import { roundTotals, versusPar, type HoleScoreEntry } from "./gameplay/score";
import { ShotController } from "./gameplay/shot";
import { SIEGE_GOLF_CANONICAL_SOLUTIONS } from "./gameplay/solutions";
import { createHoleSimulation, quatToEuler, type PropVisual } from "./gameplay/structures";
import direction from "../art/direction";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __aura3dGameSnapshot?: SiegeGolfEvidence;
  }
}

interface SiegeGolfEvidence {
  readonly framed: boolean;
  readonly state: string;
  readonly frame: number;
  readonly phase: string;
  readonly hole: { readonly index: number; readonly id: string; readonly name: string; readonly par: number };
  readonly strokes: number;
  readonly score: {
    readonly totalStrokes: number;
    readonly totalStars: number;
    readonly holesCompleted: number;
    readonly versusPar: string;
  };
  readonly ball: {
    readonly position: readonly [number, number, number];
    readonly resting: boolean;
    readonly restingPosition: readonly [number, number, number] | null;
  };
  readonly structures: {
    readonly total: number;
    readonly standing: number;
    readonly targetsDown: number;
    readonly targetsSunk: number;
    readonly totalTargets: number;
    readonly toppledThisShot: number;
  };
  readonly shot: { readonly phase: string; readonly angle: number; readonly charge: number; readonly power: number };
  readonly loading: { readonly sceneSwaps: number };
  readonly look: { readonly id: string; readonly category: string };
  readonly appliedLook: Record<string, unknown>;
  readonly events: readonly string[];
  readonly roundComplete: boolean;
  readonly audio: {
    readonly requestedEvents: readonly string[];
    readonly playedEvents: readonly string[];
    readonly playedCueCount: number;
    readonly suppressedCueCount: number;
    readonly contextState: string;
    readonly unlocked: boolean;
  };
  readonly evidence: unknown;
}

const AIM_RATE = 0.9; // radians/s while an aim key is held
const AUTOPLAY_DELAY_SECONDS = 0.9;
const RANGE_BG = "#8ecfe8";
// Static diagnostic surfaces the course-world GLB already covers.
const HIDDEN_BODIES = new Set(["felt", "wall-left", "wall-right", "wall-tee", "wall-far"]);
const MODEL_ASSETS = {
  siegeGolfBall: assets.siegeGolfBall,
  siegeWoodenCrate: assets.siegeWoodenCrate,
  siegeWoodenBarrel: assets.siegeWoodenBarrel,
  siegePlankSet: assets.siegePlankSet
} as const;

const target = document.getElementById("app") ?? document.body;

// ---------------------------------------------------------------- sim state --

let holeIndex = 0;
let flow = new HoleFlow(SIEGE_GOLF_HOLES[0]!);
const shot = new ShotController();
shot.loadHole(flow.hole.aim);
let lastStrikePower = 0;
let toppledAtStrike = 0;
let toppledThisShot = 0;
let autoplayWait = AUTOPLAY_DELAY_SECONDS;
let autoplayEnabled = false;
let pendingAdvance: "next-hole" | "retry-hole" | "new-round" | null = null;
let currentVisualKeyByName = new Map<string, string>();
let scoreEntries: HoleScoreEntry[] = [];
let frame = 0;
let objective = "Topple every pin into its cup. A/D aim, hold Space to charge, release to drive.";
// Authored pose per dynamic visual at hole load; `structures.standing`
// counts bodies still near these poses (derived from live sim poses).
let authoredPoses = new Map<string, readonly [number, number, number]>();
captureAuthoredPoses();

const rigState = { ball: { x: flow.hole.tee[0], z: flow.hole.tee[1] }, ballInFlight: false };
const routeEvents = engineGame.eventLog({ label: "siege golf events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

let latestSnapshot: SiegeGolfEvidence | undefined;

// ------------------------------------------------------------------ scene ----

const FAIRWAY_FELT_MAT = material.felt({ color: "#15803d", roughness: 0.86, sheen: 0.8, sheenColor: "#4ade80" });
const ROUGH_BANK_MAT = material.felt({ color: "#166534", roughness: 0.92, sheen: 0.55 });
const CASTLE_STONE_MAT = material.planet("rocky", { color: "#78716c", roughness: 0.78 });
const MOAT_WATER_MAT = material.reflectiveFloor({
  color: "#0369a1",
  roughness: 0.08,
  metallic: 0.45,
  clearcoat: 0.92,
  clearcoatRoughness: 0.03
});
const TIMBER_RAIL_MAT = material.lacquer({ color: "#78350f", roughness: 0.28, clearcoat: 0.95 });
const IRON_TRIM_MAT = material.brushedMetal({ color: "#94a3b8", roughness: 0.25 });
const SAND_BUNKER_MAT = material.fabric({ color: "#fde68a", roughness: 0.9, sheen: 0.3 });
const GOLF_BALL_MAT = material.ceramic({
  color: "#ffffff",
  roughness: 0.14,
  clearcoat: 1,
  normal: material.proceduralTextures.rubber({ scale: 48, strength: 0.35 })
});
const SPRING_CAP_MAT = material.ceramic({ color: "#fbbf24", roughness: 0.18, clearcoat: 0.9 });
const AIM_ARC_INDICES = [0, 1, 2, 3] as const;

function visualKey(v: PropVisual): string {
  if (v.source === "model") {
    return `${v.name}@model:${v.typedAsset ?? ""}:${v.targetMaxDimension ?? 1}`;
  }
  const p = v.primitive!;
  return `${v.name}@${p.shape}:${p.size.join("x")}:${p.color}:${p.emissive ?? ""}:${p.opacity ?? ""}`;
}

function nodeForVisual(v: PropVisual, key = visualKey(v)): AuraNodeInput {
  if (v.source === "model") {
    return model(MODEL_ASSETS[v.typedAsset!], {
      name: key,
      targetMaxDimension: v.targetMaxDimension ?? 1,
      ...(v.typedAsset === "siegeGolfBall" ? { material: GOLF_BALL_MAT } : {})
    })
      .position(...v.position)
      .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
      .runtime(engineGame.runtimeNode(key, { tags: ["typed-asset", "physics-synced"] }))
      .toJSON();
  }
  const p = v.primitive!;
  const isPracticalGlow = v.name.startsWith("cup:") || v.name.endsWith("-lamp");
  const isIronHardware = v.name.endsWith("-pedestal") || v.name.endsWith("-base");
  const isSpringTop = v.name.endsWith("-top");
  const primitiveMaterial = isPracticalGlow
    ? material.emissive({
        color: p.color,
        emissive: p.emissive ?? p.color,
        emissiveIntensity: 0.9,
        practical: true,
        ...(p.opacity !== undefined ? { opacity: p.opacity } : {})
      })
    : isIronHardware
      ? IRON_TRIM_MAT
      : isSpringTop
        ? SPRING_CAP_MAT
        : TIMBER_RAIL_MAT;
  const spec = {
    name: key,
    material: primitiveMaterial
  };
  const builder =
    p.shape === "sphere" ? primitives.sphere(spec)
      : p.shape === "torus" ? primitives.torus(spec)
        : primitives.box(spec);
  return builder
    .position(...v.position)
    .rotate(v.rotation.x, v.rotation.y, v.rotation.z)
    .scale([p.size[0], p.size[1], p.size[2]])
    .runtime(engineGame.runtimeNode(key, { tags: ["primitive", "physics-synced"] }))
    .toJSON();
}

/**
 * Union over all nine holes: instantiate each sim once to enumerate its
 * visual specs (Rapier worlds are dropped immediately), then emit one
 * runtime node per unique (name, dimensions) key. Hole transitions
 * re-pose/scale/hide the matching nodes, so the scene is built once and
 * never swapped while preserving each hole's exact visual dimensions.
 */
function buildWorldNodes(): { nodes: AuraNodeInput[]; visualKeys: readonly string[] } {
  const byKey = new Map<string, PropVisual>();
  for (const hole of SIEGE_GOLF_HOLES) {
    const sim = createHoleSimulation(hole);
    for (const v of sim.visuals) {
      if (HIDDEN_BODIES.has(v.name)) continue;
      const key = visualKey(v);
      if (!byKey.has(key)) byKey.set(key, v);
    }
  }
  const visualKeys = [...byKey.keys()];
  const aimGuideMat = material.emissive({ color: "#59d7ff", emissive: "#59d7ff", emissiveIntensity: 1.1, opacity: 0.85, practical: true });
  const chargeRingMat = material.emissive({ color: "#ffcf5c", emissive: "#ffcf5c", emissiveIntensity: 1.2, opacity: 0.9, practical: true });
  const strikeFlashMat = material.emissive({ color: "#fff3d6", emissive: "#ffd166", emissiveIntensity: 1.5, practical: true });
  const cupHaloMat = material.emissive({ color: "#ff9d3c", emissive: "#ff9d3c", emissiveIntensity: 0.9, opacity: 0.75, practical: true });
  const cupBeaconMat = material.emissive({ color: "#38bdf8", emissive: "#59d7ff", emissiveIntensity: 1.25, opacity: 0.82, practical: true });
  const nodes: AuraNodeInput[] = [
    model(assets.siegeGolfCourseWorld, {
      name: "siege-golf-course-world",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true
    })
      .position(0, -0.14, 0)
      .toJSON(),
    // Fairway & putting green: woven felt normal + sheen lobe.
    primitives.box({
      name: "siege-fairway-putting-green",
      material: FAIRWAY_FELT_MAT,
      instances: [
        { position: [0, -0.008, -1.8], scale: [6.7, 0.024, 10.6] },
        { position: [0, 0.006, 3.2], scale: [3.2, 0.02, 1.8] },
        { position: [0, 0.004, -8.8], scale: [5.4, 0.028, 3.6] }
      ]
    }).toJSON(),
    // Rough & terraced hillside banks flanking the valley lane.
    primitives.box({
      name: "siege-rough-terraced-banks",
      material: ROUGH_BANK_MAT,
      instances: [
        { position: [0, -0.48, -3.5], scale: [18, 0.72, 24] },
        { position: [-5.6, 0.22, -3.4], scale: [3.4, 0.65, 19.5] },
        { position: [5.6, 0.22, -3.4], scale: [3.4, 0.65, 19.5] },
        { position: [-8.2, 0.78, -4.0], scale: [3.6, 1.15, 21.0] },
        { position: [8.2, 0.78, -4.0], scale: [3.6, 1.15, 21.0] },
        { position: [0, 0.55, -13.8], scale: [20.0, 1.2, 3.8] }
      ]
    }).toJSON(),
    // Reflective castle moat water plane encircling the target green & keep.
    primitives.box({ name: "siege-castle-moat-water", material: MOAT_WATER_MAT })
      .position(0, -0.003, -8.8)
      .scale([10.4, 0.012, 5.8])
      .toJSON(),
    // Sculpted sand bunkers guarding the fairway waist and green approaches.
    primitives.cylinder({
      name: "siege-sand-bunkers",
      material: SAND_BUNKER_MAT,
      instances: [
        { position: [-2.45, 0.004, -2.1], scale: [1.55, 0.022, 2.2] },
        { position: [2.45, 0.004, -4.2], scale: [1.45, 0.022, 2.1] },
        { position: [-2.55, 0.008, -7.8], scale: [1.35, 0.022, 1.65] },
        { position: [2.55, 0.008, -7.8], scale: [1.35, 0.022, 1.65] }
      ]
    }).toJSON(),
    // Castle stone keep, twin towers, battlements, moat walls & windmill base.
    primitives.box({
      name: "siege-keep-stonework",
      material: CASTLE_STONE_MAT,
      instances: [
        // Main keep curtain wall & gatehouse arch behind the hole
        { position: [0, 1.45, -11.2], scale: [7.6, 2.9, 1.1] },
        // Twin flanking keep towers (siegeKeepTower bastions)
        { position: [-3.9, 1.95, -10.8], scale: [1.85, 3.9, 1.85] },
        { position: [3.9, 1.95, -10.8], scale: [1.85, 3.9, 1.85] },
        // Keep battlements / merlons
        { position: [-2.4, 3.12, -10.85], scale: [0.62, 0.48, 0.52] },
        { position: [-1.2, 3.12, -10.85], scale: [0.62, 0.48, 0.52] },
        { position: [0, 3.12, -10.85], scale: [0.62, 0.48, 0.52] },
        { position: [1.2, 3.12, -10.85], scale: [0.62, 0.48, 0.52] },
        { position: [2.4, 3.12, -10.85], scale: [0.62, 0.48, 0.52] },
        // Stone moat coping & bridge abutments
        { position: [-3.85, 0.28, -2.8], scale: [0.46, 0.56, 15.8] },
        { position: [3.85, 0.28, -2.8], scale: [0.46, 0.56, 15.8] },
        // Windmill stone bastion on the left flank (siegeWindmillObstacle base)
        { position: [-3.55, 1.25, -4.8], scale: [1.35, 2.5, 1.35] }
      ]
    }).toJSON(),
    // Course timber rails & moat drawbridge deck (lacquered siege timber).
    primitives.box({
      name: "siege-timber-rails-drawbridge",
      material: TIMBER_RAIL_MAT,
      instances: [
        { position: [-3.52, 0.34, -1.6], scale: [0.22, 0.44, 12.6] },
        { position: [3.52, 0.34, -1.6], scale: [0.22, 0.44, 12.6] },
        // Moat drawbridge spanning onto the putting green island
        { position: [0, 0.03, -6.45], scale: [2.35, 0.07, 1.65] },
        { position: [-1.18, 0.28, -6.45], scale: [0.14, 0.45, 1.65] },
        { position: [1.18, 0.28, -6.45], scale: [0.14, 0.45, 1.65] }
      ]
    }).toJSON(),
    // Brushed-metal iron siege trim, bumper posts & portcullis hardware.
    primitives.cylinder({
      name: "siege-iron-bumper-trim",
      material: IRON_TRIM_MAT,
      instances: [
        // Siege bumper posts flanking the lane
        { position: [-3.15, 0.36, -1.5], scale: [0.34, 0.72, 0.34] },
        { position: [3.15, 0.36, -1.5], scale: [0.34, 0.72, 0.34] },
        { position: [-3.15, 0.36, -5.8], scale: [0.34, 0.72, 0.34] },
        { position: [3.15, 0.36, -5.8], scale: [0.34, 0.72, 0.34] },
        // Windmill rotor iron hub
        { position: [-2.82, 2.05, -4.8], rotation: [0, 0, Math.PI / 2], scale: [0.32, 0.28, 0.32] }
      ]
    }).toJSON(),
    // Admitted GLB siege props staged on the drawbridge and keep bastions.
    model(assets.siegePlankSet, { name: "siege-moat-ramp-bridge-glb", targetMaxDimension: 2.3 })
      .position(0, 0.04, -6.45)
      .rotate(0, Math.PI / 2, 0)
      .toJSON(),
    model(assets.siegeWoodenBarrel, { name: "siege-bumper-post-left-glb", targetMaxDimension: 0.88 })
      .position(-3.1, 0.44, -3.4)
      .toJSON(),
    model(assets.siegeWoodenBarrel, { name: "siege-bumper-post-right-glb", targetMaxDimension: 0.88 })
      .position(3.1, 0.44, -3.4)
      .toJSON(),
    model(assets.siegeWoodenCrate, { name: "siege-keep-supply-crate-glb", targetMaxDimension: 0.92 })
      .position(3.05, 0.46, -9.4)
      .rotate(0, 0.35, 0)
      .toJSON(),
    // Rotating windmill obstacle blades (driven in app.onFrame).
    primitives.box({ name: "siege-windmill-blade-a", material: TIMBER_RAIL_MAT })
      .position(-2.72, 2.05, -4.8)
      .scale([0.09, 2.35, 0.28])
      .runtime(engineGame.runtimeNode("siege-windmill-blade-a", { tags: ["windmill", "renderer-owned"] })),
    primitives.box({ name: "siege-windmill-blade-b", material: TIMBER_RAIL_MAT })
      .position(-2.72, 2.05, -4.8)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.09, 2.35, 0.28])
      .runtime(engineGame.runtimeNode("siege-windmill-blade-b", { tags: ["windmill", "renderer-owned"] })),
    // Flag pin & glowing hole cup beacon (posed over the active hole's primary cup).
    primitives.cylinder({ name: "siege-flag-pin-pole", material: IRON_TRIM_MAT })
      .position(0, 0.95, -8.4)
      .scale([0.06, 1.9, 0.06])
      .runtime(engineGame.runtimeNode("siege-flag-pin-pole", { tags: ["flag-pin", "renderer-owned"] })),
    primitives.cylinder({ name: "siege-cup-beacon", material: cupBeaconMat })
      .position(0, 0.18, -8.4)
      .scale([0.42, 0.32, 0.42])
      .runtime(engineGame.runtimeNode("siege-cup-beacon", { tags: ["cup-beacon", "renderer-owned"] })),
    primitives.box({ name: "siege aim guide", material: aimGuideMat })
      .position(0, 0.06, 2)
      .scale([0.07, 0.02, 1.6])
      .runtime(engineGame.runtimeNode("siege-aim-guide", { tags: ["aim-indicator", "renderer-owned"] })),
    ...AIM_ARC_INDICES.map((idx) =>
      primitives.sphere({ name: `siege-aim-arc-${idx}`, material: aimGuideMat })
        .position(0, 0.08, 2 - (idx + 1) * 0.65)
        .scale([0.11, 0.05, 0.11])
        .runtime(engineGame.runtimeNode(`siege-aim-arc-${idx}`, { tags: ["aim-indicator", "renderer-owned"] }))
    ),
    primitives.torus({ name: "siege charge ring", material: chargeRingMat })
      .position(0, 0.05, 2)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.5, 0.5, 0.5])
      .runtime(engineGame.runtimeNode("siege-charge-ring", { tags: ["charge-indicator", "renderer-owned"] })),
    primitives.sphere({ name: "siege strike flash", material: strikeFlashMat })
      .position(0, -20, -20)
      .scale([0.3, 0.3, 0.3])
      .runtime(engineGame.runtimeNode("siege-strike-flash", { tags: ["event-feedback", "renderer-owned"] })),
    primitives.torus({ name: "siege cup flash ring", material: cupHaloMat })
      .position(0, -20, -20)
      .rotate(Math.PI / 2, 0, 0)
      .scale([0.8, 0.8, 0.8])
      .runtime(engineGame.runtimeNode("siege-cup-flash", { tags: ["event-feedback", "renderer-owned"] })),
    ...visualKeys.map((key) => nodeForVisual(byKey.get(key)!, key))
  ];
  return { nodes, visualKeys };
}

const world = buildWorldNodes();

const EYE: [number, number, number] = [0, 9.2, 7.8];
const LANE_TARGET: [number, number, number] = [0, 0.2, -3.4];
const FOV = 52;
const BALL_FOLLOW_FRACTION = 0.55;

function createSiegeRig(state: typeof rigState): AuraCameraRig {
  const rigTarget: [number, number, number] = [...LANE_TARGET];
  return {
    id: "siege-golf.altitude",
    reset: () => {
      rigTarget[0] = LANE_TARGET[0];
      rigTarget[1] = LANE_TARGET[1];
      rigTarget[2] = LANE_TARGET[2];
    },
    update: (ctx: AuraCameraRigContext): AuraCameraPose => {
      const dt = Math.min(Math.max(ctx.dt, 0.001), 0.1);
      const k = Math.min(1, dt / 0.16);
      const wantX = state.ballInFlight
        ? LANE_TARGET[0] + (state.ball.x - LANE_TARGET[0]) * BALL_FOLLOW_FRACTION
        : LANE_TARGET[0];
      const wantZ = state.ballInFlight
        ? LANE_TARGET[2] + (state.ball.z - LANE_TARGET[2]) * BALL_FOLLOW_FRACTION
        : LANE_TARGET[2];
      rigTarget[0] += (wantX - rigTarget[0]) * k;
      rigTarget[2] += (wantZ - rigTarget[2]) * k;
      return {
        position: [EYE[0], EYE[1], EYE[2]],
        target: [rigTarget[0], rigTarget[1], rigTarget[2]],
        up: [0, 1, 0],
        roll: 0,
        fov: FOV,
        near: 0.1,
        far: 160
      };
    }
  };
}

function buildScene() {
  return scene()
    .background(RANGE_BG)
    .camera(camera.perspective({ position: EYE, target: LANE_TARGET, fov: FOV }))
    .addMany(world.nodes)
    .addMany([
      lights.directional({ name: "golden valley sun key", color: "#ffcf9a", intensity: 2.8, position: [-7, 10, 5], shadow: true }).toJSON(),
      lights.point({ name: "keep rim practical", color: "#59d7ff", intensity: 0.9, position: [0, 2.4, -10.5] }).toJSON(),
      environments.hdri({ name: "golden field dome reflections", texture: assets.goldenValleyHdr, intensity: 0.55 }).toJSON()
    ]);
}

// ------------------------------------------------------------------- game ----

const inputOptions = {
  actions: {
    aimLeft: ["KeyA", "ArrowLeft"],
    aimRight: ["KeyD", "ArrowRight"],
    charge: ["Space", "KeyW", "ArrowUp"],
    confirm: ["Enter", "KeyJ"],
    pause: ["KeyP", "Escape"],
    reset: ["KeyR"]
  },
  bufferMs: 90
} as const;

// Typed against the HudKit mount options (whose meter spec carries `max`)
// rather than inlined: the C-24 contract widget spec has no max field, so
// an inline literal cannot express a full-scale meter. The runtime casts
// hud options to this same mount type, so the meter's max is honoured.
const hudOptions: GameHudMountOptions = {
  theme: "sports-broadcast",
  maxScreenFraction: 0.15,
  widgets: [
    { id: "score", kind: "score", anchor: "top-left", label: "STROKES" },
    { id: "power", kind: "meter", max: 100, anchor: "top-right", label: "POWER" },
    { id: "objective", kind: "objective", anchor: "bottom", label: "OBJECTIVE" }
  ]
};

const siegeGame = createGame({
  id: "showcase-siege-golf",
  target,
  layout: "full-bleed",
  scene: buildScene,
  diagnostics: { overlay: false, performancePanel: false },
  input: inputOptions,
  hud: hudOptions,
  touch: {
    preset: "aim-drag",
    bindings: { aim: "drag", strike: "release-drag", confirm: "tap", pause: "menu" }
  },
  sound: {
    cues: {
      // art/direction.ts audio[] events (launch / bounce / break / hole /
      // bed) on the shared sfx-pack mechanism, plus route-internal cues.
      launch: { id: "launch", asset: { url: sfxUrl("impact.wood.heavy.00") }, volume: 0.7 },
      bounce: { id: "bounce", asset: { url: sfxUrl("impact.rubber-ball.light.00") }, volume: 0.4 },
      break: { id: "break", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.6 },
      hole: { id: "hole", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      bed: { id: "bed", asset: { url: sfxUrl("ambience.wind-open") }, volume: 0.25, loop: true },
      metal: { id: "metal", asset: { url: sfxUrl("impact.metal.medium.00") }, volume: 0.5 },
      "pin-down": { id: "pin-down", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.6 },
      failed: { id: "failed", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.7 },
      ui: { id: "ui", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.3 }
    }
  },
  juice: {
    strike: { hitStop: 0.03, shake: 0.15 },
    "pin-sunk": { hitStop: 0.04, shake: 0.18 },
    complete: { shake: 0.25, flash: { color: "#ffcf5c", peak: 0.22, ms: 240 } },
    failed: { hitStop: 0.05, shake: 0.2, flash: { color: "#d88791", peak: 0.3, ms: 400 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      siegeGolf: () => latestSnapshot ?? { status: "unbound" },
      run: () => latestSnapshot
        ? { holeIndex: latestSnapshot.hole.index, holeName: latestSnapshot.hole.name, holeId: latestSnapshot.hole.id, phase: latestSnapshot.phase, strokes: latestSnapshot.strokes, par: latestSnapshot.hole.par, toppledThisShot: latestSnapshot.structures.toppledThisShot, lastStrikePower: latestSnapshot.shot.power, roundComplete: latestSnapshot.roundComplete }
        : { status: "unbound" },
      structures: () => latestSnapshot?.structures ?? { status: "unbound" },
      shot: () => latestSnapshot?.shot ?? { status: "unbound" },
      loading: () => latestSnapshot?.loading ?? { sceneSwaps: 0 }
    }
  }
});
const app = siegeGame.app;
const input = siegeGame.input;
if (!input) throw new Error("siege-golf failed to create runtime-owned input.");
// Drive the createGame lifecycle: start() transitions booting -> loading
// and ready() lands in "playing" after the first presented draw.
siegeGame.start();
// Direction bed: the looping valley-wind ambience, cued once at start. Pre-
// gesture it may be suppressed by the locked AudioContext; the published
// audio evidence reports requested vs played honestly.
const DIRECTION_AUDIO_EVENTS = new Set(["launch", "bounce", "break", "hole", "bed"]);
const requestedAudioEvents = new Set<string>(["bed"]);
const playedAudioEvents = new Set<string>();
void siegeGame.sound?.cue("bed");

function cueDirectionEvent(event: "launch" | "bounce" | "break" | "hole"): void {
  requestedAudioEvents.add(event);
  void siegeGame.sound?.cue(event);
}

type NodeHandle = ReturnType<typeof app.nodes.get>;
const handles = new Map<string, NodeHandle>();
function handle(name: string): NodeHandle {
  if (!handles.has(name)) handles.set(name, app.nodes.get(name));
  return handles.get(name);
}

// ------------------------------------------------------------- fx flashes ----

let strikeFlashRemaining = 0;
let cupFlashRemaining = 0;
function fxStrike(x: number, z: number, power: number): void {
  handle("siege-strike-flash")?.setPosition(x, 0.3, z).setVisible(true);
  strikeFlashRemaining = 0.3;
  siegeGame.fx.burst("dust", [x, 0.12, z], { count: 8, speed: 1.4, color: "#d9c79a" });
  siegeGame.juice.fire("strike");
  void power;
}
function fxStep(dt: number): void {
  if (strikeFlashRemaining > 0) {
    strikeFlashRemaining -= dt;
    if (strikeFlashRemaining <= 0) handle("siege-strike-flash")?.setPosition(0, -20, -20).setVisible(false);
  }
  if (cupFlashRemaining > 0) {
    cupFlashRemaining -= dt;
    if (cupFlashRemaining <= 0) handle("siege-cup-flash")?.setPosition(0, -20, -20).setVisible(false);
  }
}

// ------------------------------------------------------------- hole flow -----

function captureAuthoredPoses(): void {
  authoredPoses = new Map(
    flow.sim.visuals.filter((v) => v.dynamic).map((v) => [v.name, v.position] as const)
  );
}

/** Pose + show the active hole's visuals; hide union keys it doesn't own. */
function layoutHole(): void {
  const activeByKey = new Map<string, PropVisual>();
  currentVisualKeyByName = new Map();
  for (const v of flow.sim.visuals) {
    if (HIDDEN_BODIES.has(v.name)) continue;
    const key = visualKey(v);
    activeByKey.set(key, v);
    currentVisualKeyByName.set(v.name, key);
  }
  captureAuthoredPoses();
  for (const key of world.visualKeys) {
    const h = handle(key);
    if (!h) continue;
    const spec = activeByKey.get(key);
    if (!spec) {
      h.setVisible(false);
      continue;
    }
    h.setVisible(true)
      .setPosition(spec.position[0], spec.position[1], spec.position[2])
      .setRotation(spec.rotation.x, spec.rotation.y, spec.rotation.z);
    if (spec.source === "primitive" && spec.primitive) {
      h.setScale([spec.primitive.size[0], spec.primitive.size[1], spec.primitive.size[2]]);
    }
  }
  const primaryCup = flow.hole.cups[0];
  if (primaryCup) {
    handle("siege-flag-pin-pole")?.setPosition(primaryCup.x, 0.95, primaryCup.z - 0.32).setVisible(true);
    handle("siege-cup-beacon")?.setPosition(primaryCup.x, 0.18, primaryCup.z).setVisible(true);
  }
}

function loadHole(index: number): void {
  holeIndex = index;
  flow = new HoleFlow(SIEGE_GOLF_HOLES[index]!);
  shot.loadHole(flow.hole.aim);
  lastStrikePower = 0;
  toppledAtStrike = 0;
  toppledThisShot = 0;
  pendingAdvance = null;
  autoplayWait = AUTOPLAY_DELAY_SECONDS;
  objective = `Hole ${index + 1} ${flow.hole.name} (par ${flow.hole.par}). Topple every pin into its cup.`;
  layoutHole();
}

function applyStrikeResult(result: NonNullable<ReturnType<ShotController["strike"]>>): void {
  const applied = flow.strike(result.input.vector, result.input.power);
  if (!applied) {
    shot.armNextShot();
    return;
  }
  toppledAtStrike = flow.snapshot().targetsDown;
  lastStrikePower = result.input.power;
  const p = flow.sim.ball.position;
  fxStrike(p[0], p[2], result.input.power);
  cueDirectionEvent("launch");
  routeEvents.push({ type: "strike", label: `strike:${result.input.power.toFixed(2)}` });
}

function recordHoleResult(): void {
  scoreEntries = [
    ...scoreEntries.filter((entry) => entry.holeIndex !== holeIndex),
    { holeIndex, par: flow.hole.par, strokes: flow.strokes }
  ].sort((a, b) => a.holeIndex - b.holeIndex);
}

function consumeEvents(events: readonly SiegeGameEvent[]): void {
  for (const event of events) {
    routeEvents.push({ type: event.type, label: event.type });
    switch (event.type) {
      case "impact-wood": {
        const p = flow.sim.ball.position;
        cueDirectionEvent("break");
        siegeGame.fx.burst("debris", [p[0], Math.max(p[1], 0.15), p[2]], { count: 6, speed: 2.2, color: "#a8823f" });
        break;
      }
      case "impact-metal": {
        const p = flow.sim.ball.position;
        void siegeGame.sound?.cue("metal");
        siegeGame.fx.burst("spark", [p[0], Math.max(p[1], 0.15), p[2]], { count: 5, speed: 2.6, color: "#ffd9a0" });
        break;
      }
      case "cup-flash": {
        const p = flow.sim.ball.position;
        handle("siege-cup-flash")?.setPosition(p[0], 0.06, p[2]).setVisible(true);
        cupFlashRemaining = 0.5;
        break;
      }
      case "pin-down": {
        const body = flow.sim.pinBodies.get(event.pinId);
        const p = body?.position ?? [0, 0.4, 0];
        void siegeGame.sound?.cue("pin-down");
        siegeGame.fx.burst("pickup", [p[0], Math.max(p[1], 0.4), p[2]], { count: 8, speed: 2.4, color: "#ffcf5c" });
        break;
      }
      case "pin-sunk": {
        const cup = flow.hole.cups[0];
        siegeGame.juice.fire("pin-sunk");
        if (cup) siegeGame.fx.burst("ring", [cup.x, 0.1, cup.z], { count: 10, speed: 3, color: "#59d7ff" });
        break;
      }
      case "settled":
        toppledThisShot = flow.snapshot().targetsDown - toppledAtStrike;
        break;
      case "complete": {
        recordHoleResult();
        cueDirectionEvent("hole");
        siegeGame.juice.fire("complete");
        const cup = flow.hole.cups[0];
        if (cup) siegeGame.fx.burst("ring", [cup.x, 0.3, cup.z], { count: 16, speed: 4, color: "#ffcf5c" });
        pendingAdvance = holeIndex >= SIEGE_GOLF_HOLES.length - 1 ? "new-round" : "next-hole";
        objective = holeIndex >= SIEGE_GOLF_HOLES.length - 1
          ? "Round complete. Press Enter to restart."
          : `Hole complete in ${flow.strokes} (${versusPar(flow.strokes, flow.hole.par)}). Press Enter for the next hole.`;
        break;
      }
      case "failed":
        recordHoleResult();
        void siegeGame.sound?.cue("failed");
        siegeGame.juice.fire("failed");
        pendingAdvance = "retry-hole";
        objective = "Hole failed. Press Enter to retry.";
        break;
      default:
        break;
    }
  }
}

/** Deterministic replay: strike the salvaged canonical solution for the
 *  active hole through the real ShotController + HoleFlow path. */
function autoplayStroke(): void {
  const solution = SIEGE_GOLF_CANONICAL_SOLUTIONS.find((s) => s.holeId === flow.hole.id);
  if (!solution || flow.phase !== "aiming") return;
  const stroke = solution.strokes[Math.min(flow.strokes, solution.strokes.length - 1)]!;
  shot.aimTo(stroke.angle);
  const result = shot.strikeAtPower(stroke.power);
  if (result) applyStrikeResult(result);
}

// ------------------------------------------------------------------ input ----

window.addEventListener("keydown", (e) => {
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.code)) e.preventDefault();
}, { passive: false });

// Touch/pointer: hold-drag aims + charges in one gesture (strikeFromDrag
// routes through the kit pointer mapping); a tap confirms result cards.
let dragStart: { x: number; y: number } | null = null;
let pendingDrag: { start: { x: number; y: number }; end: { x: number; y: number } } | null = null;
let confirmTap = false;
target.addEventListener("pointerdown", (e) => {
  dragStart = { x: e.clientX, y: e.clientY };
  (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
});
target.addEventListener("pointerup", (e) => {
  if (dragStart === null) return;
  const dist = Math.hypot(e.clientX - dragStart.x, e.clientY - dragStart.y);
  if (dist >= 12) pendingDrag = { start: dragStart, end: { x: e.clientX, y: e.clientY } };
  else confirmTap = true;
  dragStart = null;
});
target.addEventListener("pointercancel", () => { dragStart = null; });

document.addEventListener("visibilitychange", () => {
  if (document.hidden) siegeGame.session.pause("visibility");
  else siegeGame.sessionImpl.releasePause("visibility");
});

// --------------------------------------------------------------------- HUD ---

const hudRoot = createHud();

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "siege-golf-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:320px",
    "font:600 13px/1.35 system-ui, sans-serif",
    "color:#fff8ea",
    "background:rgba(24,32,14,0.72)",
    "border:1px solid rgba(255,207,92,0.4)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const snap = flow.snapshot();
  const aim = shot.state;
  const totals = roundTotals(scoreEntries);
  siegeGame.hud.set("score", snap.strokes);
  siegeGame.hud.set("power", Math.round(aim.charge * 100));
  siegeGame.hud.set("objective", objective);
  hudRoot.innerHTML = [
    `<strong>Siege Golf</strong>`,
    `<div>Hole ${holeIndex + 1}/${SIEGE_GOLF_HOLES.length} ${flow.hole.name} | Par ${snap.par} | Strokes ${snap.strokes}</div>`,
    `<div>Targets ${snap.targetsSunk}/${snap.totalTargets} sunk | ${snap.targetsDown} down | Round ${totals.totalStrokes} strokes, ${totals.totalStars} stars</div>`,
    `<div>${objective}</div>`,
    `<div>A/D aim. Hold Space to charge, release to drive. Enter next. R reset.</div>`
  ].join("");
}

// --------------------------------------------------------------- evidence ----

function ballResting(): boolean {
  const ball = flow.sim.ball;
  if (ball.snapshot().sleeping) return true;
  const v = ball.velocity;
  const w = ball.angularVelocity;
  return Math.hypot(v[0], v[1], v[2]) <= 0.14 && Math.hypot(w[0], w[1], w[2]) <= 0.6;
}

function structuresStanding(): { total: number; standing: number } {
  let standing = 0;
  const poses = new Map(flow.sim.poses().map((p) => [p.name, p.position] as const));
  for (const [name, authored] of authoredPoses) {
    if (name === "golf-ball") continue;
    const live = poses.get(name);
    if (!live) continue;
    const drift = Math.hypot(live[0] - authored[0], live[2] - authored[2]);
    const drop = authored[1] - live[1];
    if (drift < 0.25 && drop < 0.25) standing += 1;
  }
  return { total: Math.max(0, authoredPoses.size - 1), standing };
}

function audioEvidence(): SiegeGolfEvidence["audio"] {
  const sound = siegeGame.sound?.evidence;
  for (const node of sound?.playingNodes ?? []) {
    if (DIRECTION_AUDIO_EVENTS.has(node.cue)) playedAudioEvents.add(node.cue);
  }
  return {
    requestedEvents: [...requestedAudioEvents].sort(),
    playedEvents: [...playedAudioEvents].sort(),
    playedCueCount: sound?.playedCueCount ?? 0,
    suppressedCueCount: sound?.suppressedCueCount ?? 0,
    contextState: sound?.contextState ?? "none",
    unlocked: sound?.unlocked ?? false
  };
}

const appliedLook: Record<string, unknown> = Object.freeze({
  ...lookManifest(siegeGame.lookSource()),
  postPreset: "daylight-outdoor",
  exposureEV: direction.lighting.exposureEV,
  hdri: direction.lighting.environment.hdri,
  rig: "siege-golf.altitude"
});

function publishEvidence(): void {
  const snap = flow.snapshot();
  const aim = shot.state;
  const totals = roundTotals(scoreEntries);
  const ballPos = flow.sim.ball.position;
  const resting = ballResting();
  const standing = structuresStanding();
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      score: snap.strokes,
      objective,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: { typedAssets: Object.keys(assets).length, missingAssets: [] },
    source: { expectsGame: true }
  });
  const diagnostics = app.diagnostics();
  const snapshot: SiegeGolfEvidence = {
    framed: diagnostics.drawCalls > 0 && flow.sim.poses().length > 0,
    state: siegeGame.session.state,
    frame,
    phase: snap.phase,
    hole: { index: holeIndex, id: flow.hole.id, name: flow.hole.name, par: flow.hole.par },
    strokes: snap.strokes,
    score: {
      totalStrokes: totals.totalStrokes,
      totalStars: totals.totalStars,
      holesCompleted: totals.holesCompleted,
      versusPar: versusPar(snap.strokes, snap.par)
    },
    ball: {
      position: [ballPos[0], ballPos[1], ballPos[2]],
      resting,
      restingPosition: resting ? [ballPos[0], ballPos[1], ballPos[2]] : null
    },
    structures: {
      total: standing.total,
      standing: standing.standing,
      targetsDown: snap.targetsDown,
      targetsSunk: snap.targetsSunk,
      totalTargets: snap.totalTargets,
      toppledThisShot
    },
    shot: { phase: aim.phase, angle: aim.angle, charge: aim.charge, power: lastStrikePower },
    loading: { sceneSwaps: 0 },
    look: { id: "daylight-outdoor", category: "outdoor" },
    appliedLook,
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    roundComplete: holeIndex >= SIEGE_GOLF_HOLES.length - 1 && snap.phase === "hole-complete",
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

// -------------------------------------------------------------- frame loop ---

app.onFrame(({ dt: rawDt }) => {
  const baseDt = Number.isFinite(rawDt) && rawDt > 0 ? rawDt : 1 / 60;
  const scaledDt = siegeGame.session.scaledDt(baseDt);
  frame += 1;
  if (siegeGame.session.paused || scaledDt <= 0) return;
  const stepSeconds = Math.min(0.05, Math.max(1 / 240, scaledDt));

  const aim = shot.state;
  if (flow.phase === "aiming") {
    if (input.held("aimLeft")) shot.aimBy(-AIM_RATE * stepSeconds);
    if (input.held("aimRight")) shot.aimBy(AIM_RATE * stepSeconds);
    if (input.pressed("charge") && aim.phase === "idle") {
      shot.beginCharge();
      void siegeGame.sound?.cue("ui");
    }
    if (input.held("charge") && aim.phase === "charging") shot.updateCharge(stepSeconds);
    if (!input.held("charge") && aim.phase === "charging") {
      const result = shot.strike();
      if (result) applyStrikeResult(result);
    }
    if (pendingDrag) {
      const result = shot.strikeFromDrag(pendingDrag.start, pendingDrag.end);
      pendingDrag = null;
      if (result) applyStrikeResult(result);
    }
    if (autoplayEnabled) {
      autoplayWait -= stepSeconds;
      if (autoplayWait <= 0) {
        autoplayWait = 1.2;
        autoplayStroke();
      }
    }
  } else if (flow.phase === "simulating") {
    pendingDrag = null;
    consumeEvents(flow.update(Math.max(1, Math.round(stepSeconds * 60))));
    toppledThisShot = flow.snapshot().targetsDown - toppledAtStrike;
  }

  if (input.pressed("reset")) {
    flow.resetHole();
    layoutHole();
    pendingAdvance = null;
    objective = `Hole ${holeIndex + 1} ${flow.hole.name} reset. Topple every pin into its cup.`;
    routeEvents.push({ type: "reset", label: "reset" });
  }
  if (pendingAdvance && (input.pressed("confirm") || confirmTap)) {
    void siegeGame.sound?.cue("ui");
    if (pendingAdvance === "next-hole") loadHole(holeIndex + 1);
    else if (pendingAdvance === "retry-hole") loadHole(holeIndex);
    else {
      scoreEntries = [];
      loadHole(0);
    }
  }
  confirmTap = false;
  if (shot.state.phase === "struck" && flow.phase === "aiming") shot.armNextShot();

  const ball = flow.sim.ball.position;
  rigState.ball = { x: ball[0], z: ball[2] };
  rigState.ballInFlight = flow.phase === "simulating";

  for (const pose of flow.sim.poses()) {
    const key = currentVisualKeyByName.get(pose.name);
    if (!key) continue;
    const e = quatToEuler(pose.rotation);
    handle(key)?.setPosition(pose.position[0], pose.position[1], pose.position[2])
      .setRotation(e.x, e.y, e.z);
  }

  const aiming = flow.phase === "aiming";
  const holeAim = flow.hole.aim;
  const aimLen = Math.hypot(holeAim[0], holeAim[1]) || 1;
  const baseDir: readonly [number, number] = [holeAim[0] / aimLen, holeAim[1] / aimLen];
  const dirX = baseDir[0] * Math.cos(aim.angle) - baseDir[1] * Math.sin(aim.angle);
  const dirZ = baseDir[1] * Math.cos(aim.angle) + baseDir[0] * Math.sin(aim.angle);
  const aimYaw = Math.atan2(dirX, -dirZ) + Math.PI;
  handle("siege-aim-guide")
    ?.setPosition(ball[0] + dirX * 0.9, 0.06, ball[2] + dirZ * 0.9)
    .setRotation(0, aimYaw, 0)
    .setVisible(aiming);
  const charge = aim.phase === "charging" ? aim.charge : 0;
  const arcReach = 1.9 + charge * 2.4;
  for (const idx of AIM_ARC_INDICES) {
    const t = (idx + 1) / (AIM_ARC_INDICES.length + 1);
    const dist = t * arcReach;
    const arcY = 0.08 + Math.sin(t * Math.PI) * (0.14 + charge * 0.22);
    handle(`siege-aim-arc-${idx}`)
      ?.setPosition(ball[0] + dirX * dist, arcY, ball[2] + dirZ * dist)
      .setVisible(aiming);
  }
  const windmillAngle = frame * 0.022;
  handle("siege-windmill-blade-a")?.setRotation(windmillAngle, 0, 0);
  handle("siege-windmill-blade-b")?.setRotation(windmillAngle + Math.PI / 2, 0, 0);
  handle("siege-charge-ring")
    ?.setPosition(ball[0], 0.05, ball[2])
    .setScale([0.5 + charge * 0.7, 0.5 + charge * 0.7, 0.5])
    .setVisible(aiming && aim.phase === "charging");

  fxStep(stepSeconds);
  renderHud();
  publishEvidence();
});

layoutHole();
renderHud();
publishEvidence();

// -------------------------------------------------------------------- boot ---

const params = new URL(location.href).searchParams;
if (params.get("autorun") === "1") autoplayEnabled = true;
const scenario = params.get("scenario");
if (scenario === "finale") loadHole(8);
else if (scenario === "tower") loadHole(6);
else if (scenario === "charged") autoplayEnabled = true;

void siegeGame.ready().then(() => {
  app.camera?.use?.(createSiegeRig(rigState), { blend: 0.4 });
  app.setOutput?.({ preset: "daylight-outdoor", exposure: Math.pow(2, direction.lighting.exposureEV) });
});





