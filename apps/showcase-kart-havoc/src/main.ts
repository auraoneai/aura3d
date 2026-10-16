import {
  camera,
  game,
  gameFeel,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import "./styles.css";

export type KartItemKind = "Turbo Canister" | "Homing Canister" | "Oil Barrel Trap";

export type TypedAssetKey = keyof typeof assets;

export interface RivalTelemetry {
  readonly id: string;
  readonly name: string;
  readonly assetKey: TypedAssetKey;
  readonly lap: number;
  readonly progress: number;
  readonly speed: number;
  readonly spinning: boolean;
}

export interface KartHavocEvidence {
  readonly status: string;
  readonly frame: number;
  readonly lap: number;
  readonly lapsToWin: number;
  readonly checkpoint: number;
  readonly checkpointCount: number;
  readonly speed: number;
  readonly progress: number;
  readonly heading: number;
  readonly position: { readonly x: number; readonly y: number };
  readonly events: readonly string[];
  readonly look: { readonly id: string; readonly category: string };
  readonly geometry: {
    readonly tool: string;
    readonly report: string;
    readonly carMetres: readonly number[];
    readonly trackMetres: readonly number[];
    readonly carScale: number;
    readonly modelScale: number;
    readonly trackScale: number;
    readonly routeScale: number;
  };
  readonly camera: {
    readonly rig: string;
    readonly presented: boolean;
  };
  readonly place: number;
  readonly heldItem: KartItemKind | null;
  readonly driftCharge: number;
  readonly rivals: readonly RivalTelemetry[];
  readonly typedAssetsUsed: readonly TypedAssetKey[];
  readonly evidence: unknown;
}

declare global {
  interface Window {
    __AURA3D_KART_HAVOC__?: KartHavocEvidence;
    __AURA3D_RACING_STARTER__?: KartHavocEvidence;
  }
}

const LOOK_ID = "outdoor-day" as const;

const ALL_TYPED_ASSET_KEYS: readonly TypedAssetKey[] = [
  "boostCanister",
  "canyonCactus",
  "canyonTrack",
  "checkpointArch",
  "desertMesa",
  "heroKart",
  "itemCrate",
  "oilBarrel",
  "purpleKart",
  "rivalKart",
  "tireStack",
  "yellowKart"
] as const;

function scaleForSpan(bounds: readonly [number, number, number], targetSpanMetres: number): number {
  const maxDim = Math.max(bounds[0], bounds[1], bounds[2], 0.001);
  return Number((targetSpanMetres / maxDim).toFixed(3));
}

function scaledMetres(bounds: readonly [number, number, number], scale: number): readonly [number, number, number] {
  return [
    Number((bounds[0] * scale).toFixed(3)),
    Number((bounds[1] * scale).toFixed(3)),
    Number((bounds[2] * scale).toFixed(3))
  ];
}

function groundedY(bounds: readonly [number, number, number], scale: number, surfaceY = 0): number {
  return Number((surfaceY + (bounds[1] * scale) * 0.5).toFixed(3));
}

// Full-scale Grand Prix Circuit (~130m x 94m loop, ~380m lap length, 15.6m wide asphalt highway)
const ROUTE_SCALE = 19.5;
const ROAD_WIDTH = 15.6;
const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
const START_PROGRESS = 0.04;
const LAPS_TO_WIN = 3;

const HERO_KART_SCALE = scaleForSpan(assets.heroKart.bounds, 3.5);
const RIVAL_BLUE_SCALE = scaleForSpan(assets.rivalKart.bounds, 3.4);
const RIVAL_PURPLE_SCALE = scaleForSpan(assets.purpleKart.bounds, 3.4);
const RIVAL_YELLOW_SCALE = scaleForSpan(assets.yellowKart.bounds, 3.4);
const TRACK_SCALE = scaleForSpan(assets.canyonTrack.bounds, 58.0);
const ARCH_SCALE = scaleForSpan(assets.checkpointArch.bounds, 17.6);
const CRATE_SCALE = scaleForSpan(assets.itemCrate.bounds, 1.65);
const TIRE_SCALE = scaleForSpan(assets.tireStack.bounds, 1.95);
const BARREL_SCALE = scaleForSpan(assets.oilBarrel.bounds, 1.45);
const CANISTER_SCALE = scaleForSpan(assets.boostCanister.bounds, 1.42);
const MESA_SCALE = scaleForSpan(assets.desertMesa.bounds, 24.5);
const CACTUS_SCALE = scaleForSpan(assets.canyonCactus.bounds, 4.4);

const HERO_CAR_METRES = scaledMetres(assets.heroKart.bounds, HERO_KART_SCALE);
const CANYON_TRACK_METRES = [
  Number((6.65 * ROUTE_SCALE).toFixed(3)),
  Number((assets.canyonTrack.bounds[1] * TRACK_SCALE).toFixed(3)),
  Number((4.8 * ROUTE_SCALE).toFixed(3))
] as const;

const route = {
  id: "canyon-kart-havoc-loop",
  width: ROAD_WIDTH,
  points: [
    { x: -0.4 * ROUTE_SCALE, y: -0.25 * ROUTE_SCALE },
    { x: 2.4 * ROUTE_SCALE, y: -0.9 * ROUTE_SCALE },
    { x: 5.4 * ROUTE_SCALE, y: 0.15 * ROUTE_SCALE },
    { x: 5.9 * ROUTE_SCALE, y: 2.7 * ROUTE_SCALE },
    { x: 3.2 * ROUTE_SCALE, y: 3.9 * ROUTE_SCALE },
    { x: 0.3 * ROUTE_SCALE, y: 3.15 * ROUTE_SCALE },
    { x: -0.75 * ROUTE_SCALE, y: 1.15 * ROUTE_SCALE }
  ],
  checkpoints: [0.14, 0.28, 0.44, 0.60, 0.76, 0.90]
};

const ROUTE_BOUNDS = {
  centerX: ((-0.75 + 5.9) / 2) * ROUTE_SCALE,
  centerZ: ((-0.9 + 3.9) / 2) * ROUTE_SCALE
} as const;

const ROAD_SURFACE_Y = 0;
const CAR_RIDE_Y = groundedY(assets.heroKart.bounds, HERO_KART_SCALE, ROAD_SURFACE_Y);
const CHASE = { back: 7.6, up: 2.85, ahead: 5.2, fov: 60 } as const;

const ITEM_DECK: readonly KartItemKind[] = [
  "Turbo Canister",
  "Homing Canister",
  "Oil Barrel Trap"
] as const;

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    drift: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    useItem: ["KeyE", "Enter"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 80
} as const;

// Direct window keyboard listeners so W/A/S/D and Arrow keys work immediately on load
const directKeysHeld = new Set<string>();
const directKeysPressed = new Set<string>();
if (typeof window !== "undefined") {
  window.addEventListener("keydown", (event) => {
    if (!directKeysHeld.has(event.code)) {
      directKeysPressed.add(event.code);
    }
    directKeysHeld.add(event.code);
    if (
      event.code === "Space" ||
      event.code === "ArrowUp" ||
      event.code === "ArrowDown" ||
      event.code === "ArrowLeft" ||
      event.code === "ArrowRight"
    ) {
      event.preventDefault();
    }
  });
  window.addEventListener("keyup", (event) => {
    directKeysHeld.delete(event.code);
  });
  window.addEventListener("blur", () => {
    directKeysHeld.clear();
  });
}

const isAutoplayRequested =
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).get("autoplay") === "1";

const racing = game.racing({
  route,
  startProgress: START_PROGRESS,
  checkpointRadius: 0.08,
  lapsToWin: LAPS_TO_WIN,
  maxSpeed: 38,
  acceleration: 48,
  drag: 1.1,
  steerRate: 2.55,
  model: "bicycle",
  chassis: true,
  feelBus: { emit: (name, o) => app?.feel?.emit(name, { strength: o?.strength }) }
});

const arcadeKartKit = game.arcadeKart({
  route,
  surfaceQuery: racing.surfaceQuery,
  startProgress: START_PROGRESS,
  lapsToWin: LAPS_TO_WIN,
  roadHalfWidth: ROAD_HALF_WIDTH,
  maxSpeed: 33.5,
  boostMaxSpeed: 43.5,
  acceleration: 38.0,
  boostAcceleration: 52.0
});

function sampleRouteOffset(progress: number, lateralOffset = 0): {
  readonly x: number;
  readonly z: number;
  readonly heading: number;
} {
  return arcadeKartKit.sampleOffset(progress, lateralOffset);
}

interface ItemCrateSlot {
  readonly id: string;
  readonly progress: number;
  readonly lateralOffset: number;
  readonly baseY: number;
  readonly itemGrant: KartItemKind;
  respawnTimer: number;
}

const itemCrateSlots: ItemCrateSlot[] = [
  { id: "item-crate-0", progress: 0.09, lateralOffset: 0.0, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Turbo Canister", respawnTimer: 0 },
  { id: "item-crate-1", progress: 0.22, lateralOffset: -2.4, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Homing Canister", respawnTimer: 0 },
  { id: "item-crate-2", progress: 0.36, lateralOffset: 2.2, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Oil Barrel Trap", respawnTimer: 0 },
  { id: "item-crate-3", progress: 0.51, lateralOffset: -2.0, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Turbo Canister", respawnTimer: 0 },
  { id: "item-crate-4", progress: 0.67, lateralOffset: 2.2, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Homing Canister", respawnTimer: 0 },
  { id: "item-crate-5", progress: 0.83, lateralOffset: 0.0, baseY: groundedY(assets.itemCrate.bounds, CRATE_SCALE, 0.4), itemGrant: "Oil Barrel Trap", respawnTimer: 0 }
];

interface TrackHazardSlot {
  readonly id: string;
  readonly kind: "oilBarrel" | "tireStack";
  readonly x: number;
  readonly z: number;
  readonly radius: number;
  cooldown: number;
}

const tireStackProgresses = [0.17, 0.32, 0.47, 0.62, 0.78, 0.93] as const;
const oilBarrelProgresses = [0.25, 0.41, 0.57, 0.73] as const;
const boostCanisterProgresses = [0.12, 0.53, 0.86] as const;

// Place tire stacks on the outer road shoulders (±5.8m) and oil barrels off-center (±3.8m)
// so the central 8m highway stays wide open for high-speed racing and drifting!
const staticHazards: TrackHazardSlot[] = [
  ...tireStackProgresses.map((prog, index) => {
    const side = index % 2 === 0 ? 5.8 : -5.8;
    const pos = sampleRouteOffset(prog, side);
    return {
      id: `tire-stack-${index}`,
      kind: "tireStack" as const,
      x: pos.x,
      z: pos.z,
      radius: 1.65,
      cooldown: 0
    };
  }),
  ...oilBarrelProgresses.map((prog, index) => {
    const side = index % 2 === 0 ? -4.1 : 4.1;
    const pos = sampleRouteOffset(prog, side);
    return {
      id: `oil-barrel-${index}`,
      kind: "oilBarrel" as const,
      x: pos.x,
      z: pos.z,
      radius: 1.35,
      cooldown: 0
    };
  })
];

interface RivalState {
  readonly id: string;
  readonly nodeId: string;
  readonly name: string;
  readonly assetKey: TypedAssetKey;
  readonly scale: number;
  readonly rideY: number;
  readonly startProgress: number;
  readonly basePace: number;
  readonly baseLane: number;
  readonly weavePhase: number;
  lap: number;
  progress: number;
  speed: number;
  laneOffset: number;
  spinTimer: number;
}

const rivalsState: RivalState[] = [
  {
    id: "rival-blue",
    nodeId: "rival-kart-0",
    name: "Blue Viper",
    assetKey: "rivalKart",
    scale: RIVAL_BLUE_SCALE,
    rideY: groundedY(assets.rivalKart.bounds, RIVAL_BLUE_SCALE, ROAD_SURFACE_Y),
    startProgress: 0.082,
    basePace: 0.058,
    baseLane: -2.8,
    weavePhase: 0.4,
    lap: 1,
    progress: 0.082,
    speed: 28.5,
    laneOffset: -2.8,
    spinTimer: 0
  },
  {
    id: "rival-purple",
    nodeId: "rival-kart-1",
    name: "Phantom Apex",
    assetKey: "purpleKart",
    scale: RIVAL_PURPLE_SCALE,
    rideY: groundedY(assets.purpleKart.bounds, RIVAL_PURPLE_SCALE, ROAD_SURFACE_Y),
    startProgress: 0.068,
    basePace: 0.055,
    baseLane: 2.8,
    weavePhase: 2.1,
    lap: 1,
    progress: 0.068,
    speed: 27.0,
    laneOffset: 2.8,
    spinTimer: 0
  },
  {
    id: "rival-yellow",
    nodeId: "rival-kart-2",
    name: "Solar Wasp",
    assetKey: "yellowKart",
    scale: RIVAL_YELLOW_SCALE,
    rideY: groundedY(assets.yellowKart.bounds, RIVAL_YELLOW_SCALE, ROAD_SURFACE_Y),
    startProgress: 0.055,
    basePace: 0.052,
    baseLane: -1.4,
    weavePhase: 4.2,
    lap: 1,
    progress: 0.055,
    speed: 25.8,
    laneOffset: -1.4,
    spinTimer: 0
  }
];

interface HomingProjectileState {
  active: boolean;
  progress: number;
  lateralOffset: number;
  ttl: number;
  targetRivalIndex: number;
}

interface DroppedTrapState {
  active: boolean;
  x: number;
  z: number;
  progress: number;
  ttl: number;
}

const homingProjectiles: HomingProjectileState[] = [
  { active: false, progress: 0, lateralOffset: 0, ttl: 0, targetRivalIndex: 0 },
  { active: false, progress: 0, lateralOffset: 0, ttl: 0, targetRivalIndex: 1 }
];

const droppedTraps: DroppedTrapState[] = [
  { active: false, x: 0, z: -999, progress: 0, ttl: 0 },
  { active: false, x: 0, z: -999, progress: 0, ttl: 0 }
];

// Direct 2D/3D Arcade Player Kart State
interface PlayerKartState {
  status: "running" | "finished";
  frame: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  speed: number;
  heading: number;
  driftYaw: number;
  driftDir: number;
  roll: number;
  progress: number;
  signedTrackOffset: number;
  lap: number;
  checkpoint: number;
  lapTime: number;
}

const initialStartPose = sampleRouteOffset(START_PROGRESS, 0);
const playerKart: PlayerKartState = {
  status: "running",
  frame: 0,
  x: initialStartPose.x,
  y: 0,
  z: initialStartPose.z,
  vx: 0,
  vy: 0,
  vz: 0,
  speed: 0,
  heading: initialStartPose.heading,
  driftYaw: 0,
  driftDir: 0,
  roll: 0,
  progress: START_PROGRESS,
  signedTrackOffset: 0,
  lap: 1,
  checkpoint: 0,
  lapTime: 0
};

const routeEvents = game.eventLog({ label: "kart havoc events", maxEvents: 24 });

const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Round timer", source: "app-state", valuePath: "appState.lapTime", format: "clock", a11yLabel: "lap timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "checkpoint", id: "hud:checkpoint", label: "checkpoint", source: "app-state", valuePath: "appState.checkpoint", format: "text", a11yLabel: "current checkpoint" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

const racingGame = createGame({
  id: "kart-havoc",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: { theme: "motorsport", widgets: [] },
  touch: {
    preset: "steer-pedals",
    bindings: {
      "steer-left": "left",
      "steer-right": "right",
      throttle: "throttle",
      brake: "brake",
      boost: "boost",
      reset: "reset"
    }
  },
  sound: {
    cues: {
      checkpoint: { id: "checkpoint", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.7 },
      lap: { id: "lap", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.75 },
      finish: { id: "finish", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.85 },
      "off-track": { id: "off-track", asset: { url: sfxUrl("impact.rubber-ball.light.00") }, volume: 0.5 },
      boost: { id: "boost", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.68 },
      "item-pickup": { id: "item-pickup", asset: { url: sfxUrl("pickup.power-up.00") }, volume: 0.72 },
      "item-fire": { id: "item-fire", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.75 },
      "hazard-hit": { id: "hazard-hit", asset: { url: sfxUrl("explosion.small.00") }, volume: 0.78 }
    }
  },
  juice: {
    checkpoint: { punch: { fovDeg: 1.4, ms: 160 }, flash: { color: "#7ff0c5", peak: 0.14, ms: 180 }, fx: { kind: "ring", count: 10, color: "#7ff0c5" } },
    lap: { shake: 0.2, punch: { fovDeg: 2, ms: 240 }, flash: { color: "#f59e0b", peak: 0.16, ms: 200 } },
    finish: { hitStop: 0.05, punch: { fovDeg: 2.6, ms: 320 }, rumble: { strong: 0.6, ms: 300 }, fx: { kind: "spark", count: 22, color: "#ffd166" } },
    "off-track": { shake: 0.25, rumble: { weak: 0.35, ms: 140 }, fx: { kind: "dust", count: 8, color: "#d99b66" } },
    boost: { punch: { fovDeg: 2.2, ms: 240 }, flash: { color: "#38bdf8", peak: 0.14, ms: 160 }, fx: { kind: "streak", count: 12, color: "#38bdf8" } },
    "item-pickup": { punch: { fovDeg: 1.1, ms: 140 }, flash: { color: "#f59e0b", peak: 0.14, ms: 150 }, fx: { kind: "pickup", count: 10, color: "#f59e0b" } },
    "item-fire": { punch: { fovDeg: 1.6, ms: 180 }, shake: 0.16, fx: { kind: "muzzle", count: 12, color: "#38bdf8" } },
    "hazard-hit": { shake: 0.42, hitStop: 0.02, vignette: { amount: 0.28, ms: 220, color: "#fb7185" }, rumble: { strong: 0.55, ms: 200 }, fx: { kind: "explosion-small", count: 14, color: "#fb7185" } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      kartHavoc: () => window.__AURA3D_KART_HAVOC__ ?? { status: "unbound" },
      racingStarter: () => window.__AURA3D_RACING_STARTER__ ?? { status: "unbound" }
    }
  }
});

const app = racingGame.app;
racingGame.start();
const input = racingGame.input;
if (!input) throw new Error("Kart Havoc failed to initialize runtime-owned input.");

const car = app.nodes.require("race-car");
const rivalNodes = rivalsState.map((rival) => app.nodes.require(rival.nodeId));
const checkpointArchNodes = route.checkpoints.map((_, index) => app.nodes.require(`checkpoint-arch-${index}`));
const itemCrateNodes = itemCrateSlots.map((slot) => app.nodes.require(slot.id));
const boostPickupNodes = boostCanisterProgresses.map((_, index) => app.nodes.require(`boost-pickup-${index}`));
const projectileNodes = homingProjectiles.map((_, index) => app.nodes.require(`homing-canister-${index}`));
const droppedTrapNodes = droppedTraps.map((_, index) => app.nodes.require(`dropped-trap-${index}`));

const hudRoot = createHud();
let objective = "Drive with W/A/S/D, hold Space to drift-turbo around canyon corners, and fire items with E.";
const raceEventLabels: string[] = [];
let heldItem: KartItemKind | null = null;
let itemDeckCursor = 0;
let driftCharge = 0;
let wasDriftingLastFrame = false;
let activeBoostTimer = 0;
let elapsedClock = 0;
let playerPlace = 1;
let raceStarted = false;
const boostPickupCooldowns = boostCanisterProgresses.map(() => 0);

app.camera?.use(
  camera.rigs.chase({
    target: "race-car",
    fov: { base: 60, perSpeed: 0.35 },
    lookAhead: { seconds: 0.35, max: 4.5 },
    bank: { gain: 0.45, maxDeg: 5 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

function recordEvent(type: string, label: string, severity: "info" | "success" | "warning" = "info"): void {
  raceEventLabels.push(label);
  routeEvents.push({
    type,
    label,
    severity
  });
}

function drawNextItem(): KartItemKind {
  const item = ITEM_DECK[itemDeckCursor % ITEM_DECK.length] ?? "Turbo Canister";
  itemDeckCursor += 1;
  return item;
}

function activateHeldItem(): void {
  const itemToUse = heldItem ?? drawNextItem();
  heldItem = null;

  recordEvent("item-use", `item-use:${itemToUse}`, "success");
  racingGame.juice.fire("item-fire", { position: [playerKart.x, CAR_RIDE_Y, playerKart.z] });
  void racingGame.sound?.cue("item-fire");

  if (itemToUse === "Turbo Canister") {
    activeBoostTimer = 1.6;
    playerKart.speed = Math.min(45, Math.max(playerKart.speed + 11, 34));
    racingGame.juice.fire("boost", { position: [playerKart.x, CAR_RIDE_Y, playerKart.z] });
    void racingGame.sound?.cue("boost");
    objective = "Turbo Canister ignited — 180 km/h canyon apex surge active!";
    return;
  }

  if (itemToUse === "Homing Canister") {
    const slotIndex = homingProjectiles.findIndex((p) => !p.active);
    const index = slotIndex >= 0 ? slotIndex : 0;
    const nearestRivalIdx = findNearestRivalAhead(playerKart.progress);
    const projectile = homingProjectiles[index];
    if (projectile) {
      projectile.active = true;
      projectile.progress = (playerKart.progress + 0.015) % 1;
      projectile.lateralOffset = playerKart.signedTrackOffset;
      projectile.ttl = 4.0;
      projectile.targetRivalIndex = nearestRivalIdx;
    }
    objective = `Homing Canister locked onto ${rivalsState[nearestRivalIdx]?.name ?? "rival"}.`;
    return;
  }

  // Oil Barrel Trap
  const trapSlotIdx = droppedTraps.findIndex((t) => !t.active);
  const trapIdx = trapSlotIdx >= 0 ? trapSlotIdx : 0;
  const trap = droppedTraps[trapIdx];
  if (trap) {
    const fx = Math.cos(playerKart.heading);
    const fz = Math.sin(playerKart.heading);
    const dropX = playerKart.x - fx * 3.8;
    const dropZ = playerKart.z - fz * 3.8;
    trap.active = true;
    trap.x = dropX;
    trap.z = dropZ;
    trap.progress = (playerKart.progress - 0.015 + 1) % 1;
    trap.ttl = 14.0;
    droppedTrapNodes[trapIdx]
      ?.setPosition(dropX, groundedY(assets.oilBarrel.bounds, BARREL_SCALE, ROAD_SURFACE_Y), dropZ)
      .setVisible(true);
  }
  objective = "Oil Barrel Trap deployed on the asphalt behind you.";
}

function findNearestRivalAhead(playerProgress: number): number {
  let bestIdx = 0;
  let bestDelta = 999;
  for (let i = 0; i < rivalsState.length; i += 1) {
    const rival = rivalsState[i];
    if (!rival) continue;
    const delta = (rival.progress - playerProgress + 1) % 1;
    if (delta < bestDelta) {
      bestDelta = delta;
      bestIdx = i;
    }
  }
  return bestIdx;
}

function resetMatch(): void {
  racing.reset(START_PROGRESS);
  const pose = sampleRouteOffset(START_PROGRESS, 0);
  playerKart.status = "running";
  playerKart.frame = 0;
  playerKart.x = pose.x;
  playerKart.y = 0;
  playerKart.z = pose.z;
  playerKart.vx = 0;
  playerKart.vy = 0;
  playerKart.vz = 0;
  playerKart.speed = 0;
  playerKart.heading = pose.heading;
  playerKart.driftYaw = 0;
  playerKart.driftDir = 0;
  playerKart.roll = 0;
  playerKart.progress = START_PROGRESS;
  playerKart.signedTrackOffset = 0;
  playerKart.lap = 1;
  playerKart.checkpoint = 0;
  playerKart.lapTime = 0;

  heldItem = null;
  itemDeckCursor = 0;
  driftCharge = 0;
  wasDriftingLastFrame = false;
  activeBoostTimer = 0;
  elapsedClock = 0;
  playerPlace = 1;
  raceStarted = false;

  for (const crate of itemCrateSlots) {
    crate.respawnTimer = 0;
  }
  for (let i = 0; i < itemCrateNodes.length; i += 1) {
    itemCrateNodes[i]?.setVisible(true);
  }
  for (const hazard of staticHazards) {
    hazard.cooldown = 0;
  }
  for (let i = 0; i < boostPickupCooldowns.length; i += 1) {
    boostPickupCooldowns[i] = 0;
    boostPickupNodes[i]?.setVisible(true);
  }
  for (let i = 0; i < rivalsState.length; i += 1) {
    const rival = rivalsState[i];
    if (!rival) continue;
    rival.lap = 1;
    rival.progress = rival.startProgress;
    rival.speed = 27;
    rival.laneOffset = rival.baseLane;
    rival.spinTimer = 0;
    const rPose = sampleRouteOffset(rival.progress, rival.laneOffset);
    rivalNodes[i]
      ?.setPosition(rPose.x, rival.rideY, rPose.z)
      .setRotation(0, Math.PI - rPose.heading, 0);
  }
  for (let i = 0; i < homingProjectiles.length; i += 1) {
    const proj = homingProjectiles[i];
    if (proj) proj.active = false;
    projectileNodes[i]?.setVisible(false);
  }
  for (let i = 0; i < droppedTraps.length; i += 1) {
    const trap = droppedTraps[i];
    if (trap) trap.active = false;
    droppedTrapNodes[i]?.setVisible(false);
  }

  recordEvent("reset", "reset");
  objective = "Drive with W/A/S/D, hold Space to drift-turbo around canyon corners, and fire items with E.";
}

function stepPlayerKartPhysics(
  dt: number,
  controls: {
    throttle: boolean;
    brake: boolean;
    steer: number;
    drift: boolean;
    boost: boolean;
  }
): void {
  Object.assign(arcadeKartKit.state, {
    status: playerKart.status,
    frame: playerKart.frame,
    x: playerKart.x,
    y: playerKart.y,
    z: playerKart.z,
    vx: playerKart.vx,
    vy: playerKart.vy,
    vz: playerKart.vz,
    speed: playerKart.speed,
    heading: playerKart.heading,
    driftYaw: playerKart.driftYaw,
    driftDir: playerKart.driftDir,
    roll: playerKart.roll,
    progress: playerKart.progress,
    signedTrackOffset: playerKart.signedTrackOffset,
    lap: playerKart.lap,
    checkpoint: playerKart.checkpoint,
    lapTime: playerKart.lapTime,
    driftCharge,
    wasDrifting: wasDriftingLastFrame,
    activeBoostTimer
  });

  const stepRes = arcadeKartKit.stepPlayer(dt, controls);
  Object.assign(playerKart, stepRes.state);
  driftCharge = stepRes.state.driftCharge;
  wasDriftingLastFrame = stepRes.state.wasDrifting;
  activeBoostTimer = stepRes.state.activeBoostTimer;

  if (stepRes.miniTurboTriggered) {
    recordEvent("drift-boost", "drift-boost:mini-turbo", "success");
    racingGame.juice.fire("boost", { position: [playerKart.x, CAR_RIDE_Y, playerKart.z] });
    void racingGame.sound?.cue("boost");
    objective = "Mini-Turbo unleashed! Carving the canyon apex at top speed!";
  }

  if (stepRes.checkpointCleared !== null) {
    recordEvent("checkpoint", `checkpoint:${stepRes.checkpointCleared}`, "success");
    racingGame.juice.fire("checkpoint");
    void racingGame.sound?.cue("checkpoint");
    objective = `Gate ${stepRes.checkpointCleared}/${route.checkpoints.length} cleared! Keep pushing the pace.`;
  }

  if (stepRes.raceFinished) {
    recordEvent("finish", "finish", "success");
    racingGame.juice.fire("finish");
    void racingGame.sound?.cue("finish");
    objective = `Finished in ${ordinalPlace(playerPlace)} place! Press R to race again.`;
  } else if (stepRes.lapAdvanced !== null) {
    recordEvent("lap", `lap:${stepRes.lapAdvanced}`, "success");
    racingGame.juice.fire("lap");
    void racingGame.sound?.cue("lap");
    objective = `Lap ${stepRes.lapAdvanced}/${LAPS_TO_WIN} — hit item crates and hold your lead!`;
  }
}

app.onFrame(({ dt }) => {
  const clampedDt = Math.min(0.05, Math.max(0, dt || 1 / 60));
  elapsedClock += clampedDt;

  if (input.pressed("reset") || directKeysPressed.has("KeyR")) {
    resetMatch();
  }

  const holdingDrift = input.held("drift") || directKeysHeld.has("Space");
  const manualBoostHeld =
    input.held("boost") ||
    directKeysHeld.has("ShiftLeft") ||
    directKeysHeld.has("ShiftRight");
  const boostHeld = manualBoostHeld || activeBoostTimer > 0;
  const manualThrottle =
    input.held("throttle") ||
    directKeysHeld.has("KeyW") ||
    directKeysHeld.has("ArrowUp");
  const manualBrake =
    input.held("brake") ||
    directKeysHeld.has("KeyS") ||
    directKeysHeld.has("ArrowDown");
  const leftHeld =
    input.held("left") ||
    directKeysHeld.has("KeyA") ||
    directKeysHeld.has("ArrowLeft");
  const rightHeld =
    input.held("right") ||
    directKeysHeld.has("KeyD") ||
    directKeysHeld.has("ArrowRight");
  const manualSteer =
    Math.abs(input.axis("steer")) > 0.01
      ? input.axis("steer")
      : (rightHeld ? 1 : 0) - (leftHeld ? 1 : 0);

  const manualDriving =
    manualThrottle ||
    manualBrake ||
    Math.abs(manualSteer) > 0.01 ||
    holdingDrift ||
    manualBoostHeld;

  if (manualDriving || elapsedClock > 0.6) {
    raceStarted = true;
  }

  let effectiveThrottle = manualThrottle || activeBoostTimer > 0;
  let effectiveSteer = manualSteer;

  // Only if ?autoplay=1 is explicitly in URL does an AI demo driver steer the player kart
  if (isAutoplayRequested && !manualDriving && playerKart.status !== "finished") {
    effectiveThrottle = true;
    const lookSample = sampleRouteOffset((playerKart.progress + 0.03) % 1, 0);
    const desiredHeading = Math.atan2(lookSample.z - playerKart.z, lookSample.x - playerKart.x);
    const deltaHeading = wrapAngle(desiredHeading - playerKart.heading);
    effectiveSteer = clamp(deltaHeading * 1.9, -1, 1);
  }

  if (activeBoostTimer > 0) {
    activeBoostTimer = Math.max(0, activeBoostTimer - clampedDt);
  }

  stepPlayerKartPhysics(clampedDt, {
    throttle: effectiveThrottle,
    brake: manualBrake,
    steer: effectiveSteer,
    drift: holdingDrift,
    boost: boostHeld
  });

  if (
    input.pressed("boost") ||
    directKeysPressed.has("ShiftLeft") ||
    directKeysPressed.has("ShiftRight")
  ) {
    racingGame.juice.fire("boost", { position: [playerKart.x, CAR_RIDE_Y, playerKart.z] });
    void racingGame.sound?.cue("boost");
  }

  if (
    input.pressed("useItem") ||
    directKeysPressed.has("KeyE") ||
    directKeysPressed.has("Enter")
  ) {
    activateHeldItem();
  }

  directKeysPressed.clear();

  // Update rotating/bobbing item crates and check player pickup
  for (let i = 0; i < itemCrateSlots.length; i += 1) {
    const slot = itemCrateSlots[i];
    const node = itemCrateNodes[i];
    if (!slot || !node) continue;

    if (slot.respawnTimer > 0) {
      slot.respawnTimer = Math.max(0, slot.respawnTimer - clampedDt);
      if (slot.respawnTimer === 0) {
        node.setVisible(true);
      }
      continue;
    }

    const pos = sampleRouteOffset(slot.progress, slot.lateralOffset);
    const bobY = slot.baseY + Math.sin(elapsedClock * 3.4 + i) * 0.18;
    node.setPosition(pos.x, bobY, pos.z).setRotation(0, elapsedClock * 1.8 + i * 0.9, 0);

    const dist = Math.hypot(playerKart.x - pos.x, playerKart.z - pos.z);
    if (dist <= 3.6 && playerKart.frame > 1) {
      slot.respawnTimer = 4.5;
      node.setVisible(false);
      if (heldItem === null) {
        heldItem = drawNextItem();
      }
      recordEvent("item-pickup", `item-pickup:${heldItem}`, "success");
      racingGame.juice.fire("item-pickup", { position: [pos.x, bobY, pos.z] });
      void racingGame.sound?.cue("item-pickup");
      objective = `Picked up ${heldItem}! Press E or Enter to deploy.`;
    }
  }

  // Rotate trackside boost canisters & allow player pickup for instant nitro burst
  for (let i = 0; i < boostCanisterProgresses.length; i += 1) {
    if (boostPickupCooldowns[i]! > 0) {
      boostPickupCooldowns[i] = Math.max(0, boostPickupCooldowns[i]! - clampedDt);
      if (boostPickupCooldowns[i] === 0) {
        boostPickupNodes[i]?.setVisible(true);
      }
      continue;
    }
    const prog = boostCanisterProgresses[i] ?? 0;
    const side = i % 2 === 0 ? -3.2 : 3.2;
    const pos = sampleRouteOffset(prog, side);
    const yPos = groundedY(assets.boostCanister.bounds, CANISTER_SCALE, 0.25) + Math.sin(elapsedClock * 4 + i) * 0.12;
    boostPickupNodes[i]
      ?.setPosition(pos.x, yPos, pos.z)
      .setRotation(0, elapsedClock * 2.2 + i, 0);

    if (Math.hypot(playerKart.x - pos.x, playerKart.z - pos.z) <= 3.2) {
      boostPickupCooldowns[i] = 6.0;
      boostPickupNodes[i]?.setVisible(false);
      activeBoostTimer = Math.max(activeBoostTimer, 1.4);
      playerKart.speed = Math.min(44, Math.max(playerKart.speed + 9, 32));
      recordEvent("boost", `boost-canister:${i}`, "success");
      racingGame.juice.fire("boost", { position: [pos.x, CAR_RIDE_Y, pos.z] });
      void racingGame.sound?.cue("boost");
      objective = "Nitro Canister collected — boost surge active!";
    }
  }

  // Check collisions with static hazards (oil barrels & tire stacks) with physical bump deflection
  for (const hazard of staticHazards) {
    if (hazard.cooldown > 0) {
      hazard.cooldown = Math.max(0, hazard.cooldown - clampedDt);
      continue;
    }
    const dx = playerKart.x - hazard.x;
    const dz = playerKart.z - hazard.z;
    const dist = Math.hypot(dx, dz);
    if (dist <= hazard.radius + 1.1 && dist > 1e-4) {
      hazard.cooldown = 1.2;
      const nx = dx / dist;
      const nz = dz / dist;
      playerKart.x = hazard.x + nx * (hazard.radius + 1.2);
      playerKart.z = hazard.z + nz * (hazard.radius + 1.2);
      playerKart.speed *= 0.76;
      recordEvent("hazard-hit", `hazard-hit:${hazard.kind}`, "warning");
      racingGame.juice.fire("hazard-hit", { position: [hazard.x, CAR_RIDE_Y, hazard.z] });
      void racingGame.sound?.cue("hazard-hit");
      objective =
        hazard.kind === "oilBarrel"
          ? "Clipped an oil barrel! Steer back onto the center racing line."
          : "Bumped a chicane tire barrier! Hold the inside apex.";
    }
  }

  // Step active homing canister projectiles
  for (let i = 0; i < homingProjectiles.length; i += 1) {
    const proj = homingProjectiles[i];
    const node = projectileNodes[i];
    if (!proj || !node) continue;
    if (!proj.active) {
      node.setVisible(false);
      continue;
    }
    proj.ttl -= clampedDt;
    if (proj.ttl <= 0) {
      proj.active = false;
      node.setVisible(false);
      continue;
    }

    const targetRival = rivalsState[proj.targetRivalIndex];
    if (targetRival) {
      const laneDiff = targetRival.laneOffset - proj.lateralOffset;
      proj.lateralOffset += laneDiff * Math.min(1, clampedDt * 6);
    }
    proj.progress = (proj.progress + clampedDt * 0.22) % 1;
    const projPos = sampleRouteOffset(proj.progress, proj.lateralOffset);
    node
      .setVisible(true)
      .setPosition(projPos.x, groundedY(assets.boostCanister.bounds, CANISTER_SCALE, 0.35), projPos.z)
      .setRotation(0, -projPos.heading + Math.PI / 2, elapsedClock * 8);

    for (let r = 0; r < rivalsState.length; r += 1) {
      const rival = rivalsState[r];
      if (!rival) continue;
      const rivalPos = sampleRouteOffset(rival.progress, rival.laneOffset);
      const hitDist = Math.hypot(projPos.x - rivalPos.x, projPos.z - rivalPos.z);
      if (hitDist <= 3.8) {
        rival.spinTimer = 1.65;
        rival.speed = 6.0;
        proj.active = false;
        node.setVisible(false);
        recordEvent("item-hit", `item-hit:${rival.id}`, "success");
        racingGame.juice.fire("hazard-hit", { position: [rivalPos.x, rival.rideY, rivalPos.z] });
        void racingGame.sound?.cue("hazard-hit");
        objective = `Direct hit! ${rival.name} spun out in the canyon!`;
        break;
      }
    }
  }

  // Step active dropped oil barrel traps
  for (let i = 0; i < droppedTraps.length; i += 1) {
    const trap = droppedTraps[i];
    const node = droppedTrapNodes[i];
    if (!trap || !node || !trap.active) continue;
    trap.ttl -= clampedDt;
    if (trap.ttl <= 0) {
      trap.active = false;
      node.setVisible(false);
      continue;
    }
    for (const rival of rivalsState) {
      if (rival.spinTimer > 0) continue;
      const rivalPos = sampleRouteOffset(rival.progress, rival.laneOffset);
      const dist = Math.hypot(trap.x - rivalPos.x, trap.z - rivalPos.z);
      if (dist <= 3.2) {
        rival.spinTimer = 1.5;
        rival.speed = 6.5;
        trap.active = false;
        node.setVisible(false);
        recordEvent("trap-triggered", `trap-triggered:${rival.id}`, "success");
        racingGame.juice.fire("hazard-hit", { position: [trap.x, rival.rideY, trap.z] });
        void racingGame.sound?.cue("hazard-hit");
        objective = `${rival.name} hit your Oil Barrel Trap!`;
        break;
      }
    }
  }

  // Step AI rival karts along the 380m canyon spline + resolve kart-to-kart bumps
  const playerTotalProgress = (playerKart.lap - 1) + normalizeStartRelativeProgress(playerKart.progress);
  for (let i = 0; i < rivalsState.length; i += 1) {
    const rival = rivalsState[i];
    const node = rivalNodes[i];
    if (!rival || !node) continue;

    if (rival.spinTimer > 0) {
      rival.spinTimer = Math.max(0, rival.spinTimer - clampedDt);
      rival.speed = 7.5;
    } else if (raceStarted) {
      const rivalTotal = (rival.lap - 1) + normalizeStartRelativeProgress(rival.progress);
      const gap = playerTotalProgress - rivalTotal;
      const rubberBand = clamp(gap * 0.025, -0.012, 0.015);
      const pace = rival.basePace + rubberBand;
      const prevNorm = normalizeStartRelativeProgress(rival.progress);
      rival.progress = (rival.progress + pace * clampedDt) % 1;
      const nextNorm = normalizeStartRelativeProgress(rival.progress);
      if (prevNorm > 0.85 && nextNorm < 0.15) {
        rival.lap = Math.min(LAPS_TO_WIN, rival.lap + 1);
      }
      rival.speed = Number((pace * 480).toFixed(1));
      rival.laneOffset = rival.baseLane + Math.sin(elapsedClock * 1.1 + rival.weavePhase) * 1.25;
    }

    const pose = sampleRouteOffset(rival.progress, rival.laneOffset);
    // Kart-to-kart bump check between player and rival
    const dx = playerKart.x - pose.x;
    const dz = playerKart.z - pose.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 2.85 && dist > 1e-4) {
      const nx = dx / dist;
      const nz = dz / dist;
      const push = (2.85 - dist) * 0.65;
      playerKart.x += nx * push;
      playerKart.z += nz * push;
      rival.laneOffset = clamp(rival.laneOffset - push * 0.5, -ROAD_HALF_WIDTH + 1.5, ROAD_HALF_WIDTH - 1.5);
    }

    const spinYaw = rival.spinTimer > 0 ? rival.spinTimer * 12.5 : 0;
    node
      .setPosition(pose.x, rival.rideY, pose.z)
      .setRotation(0, Math.PI - pose.heading + spinYaw, 0);
  }

  // Compute live race standing (1st..4th)
  playerPlace = computePlayerPlace();

  // Update player kart visual node (including hop height & powerslide drift yaw!)
  car
    .setPosition(playerKart.x, CAR_RIDE_Y + playerKart.y, playerKart.z)
    .setRotation(playerKart.roll, Math.PI - playerKart.heading + playerKart.driftYaw, 0);

  // Align chase camera smoothly behind the kart's travel heading [cos(heading), 0, sin(heading)]
  const fx = Math.cos(playerKart.heading);
  const fz = Math.sin(playerKart.heading);
  app.camera?.setPose({
    position: [
      playerKart.x - fx * CHASE.back,
      CAR_RIDE_Y + CHASE.up + playerKart.y * 0.4,
      playerKart.z - fz * CHASE.back
    ],
    target: [
      playerKart.x + fx * CHASE.ahead,
      CAR_RIDE_Y + 0.75 + playerKart.y * 0.3,
      playerKart.z + fz * CHASE.ahead
    ],
    fov: Math.min(73, CHASE.fov + Math.abs(playerKart.speed) * 0.3)
  });

  for (let i = 0; i < checkpointArchNodes.length; i += 1) {
    const isNextGate = i === playerKart.checkpoint % checkpointArchNodes.length;
    checkpointArchNodes[i]?.setScale(isNextGate ? ARCH_SCALE * 1.06 : ARCH_SCALE);
  }

  feel.update(clampedDt * 1000);
  renderHud();
  publishEvidence();
});

publishEvidence();
renderHud();

function normalizeStartRelativeProgress(progress: number): number {
  return arcadeKartKit.normalizeStartRelativeProgress(progress);
}

function computePlayerPlace(): number {
  const playerScore = (playerKart.lap - 1) + normalizeStartRelativeProgress(playerKart.progress);
  let aheadCount = 0;
  for (const rival of rivalsState) {
    const rivalScore = (rival.lap - 1) + normalizeStartRelativeProgress(rival.progress);
    if (rivalScore > playerScore + 0.002) {
      aheadCount += 1;
    }
  }
  return aheadCount + 1;
}

function ordinalPlace(place: number): string {
  if (place === 1) return "1st";
  if (place === 2) return "2nd";
  if (place === 3) return "3rd";
  return `${place}th`;
}

function buildGrandPrixRoadwayNodes(): AuraNodeInput[] {
  return arcadeKartKit.buildRoadwayNodes({
    roadHalfWidth: ROAD_HALF_WIDTH,
    roadSurfaceY: ROAD_SURFACE_Y,
    segmentCount: 84,
    startProgress: START_PROGRESS,
    centerX: ROUTE_BOUNDS.centerX,
    centerZ: ROUTE_BOUNDS.centerZ,
    floorSize: 440
  });
}

function buildScene() {
  const startPose = sampleRouteOffset(START_PROGRESS, 0);

  // 6 large checkpoint arches spanning cleanly across the 15.6m asphalt highway
  const archNodes: AuraNodeInput[] = route.checkpoints.map((cpProgress, index) => {
    const pose = sampleRouteOffset(cpProgress, 0);
    const tags = index === 0 ? ["checkpoint", "finish", "typed-asset", "runtime"] : ["checkpoint", "typed-asset", "runtime"];
    return model(assets.checkpointArch, { name: `canyon checkpoint arch ${index + 1}`, scaleMode: "world", castShadow: true })
      .position(pose.x, groundedY(assets.checkpointArch.bounds, ARCH_SCALE, ROAD_SURFACE_Y), pose.z)
      .rotate(0, Math.PI / 2 - pose.heading, 0)
      .scale(ARCH_SCALE)
      .runtime(game.runtimeNode(`checkpoint-arch-${index}`, { tags }));
  });

  // 6 rotating mystery item crates along the circuit
  const crateNodes: AuraNodeInput[] = itemCrateSlots.map((slot, index) => {
    const pose = sampleRouteOffset(slot.progress, slot.lateralOffset);
    return model(assets.itemCrate, { name: `mystery item crate ${index + 1}`, scaleMode: "world", castShadow: true })
      .position(pose.x, slot.baseY, pose.z)
      .scale(CRATE_SCALE)
      .runtime(game.runtimeNode(slot.id, { tags: ["collectible", "item-crate", "typed-asset", "runtime"] }));
  });

  // 6 apex chicane tire stacks along the outer road shoulders (±5.8m)
  const tireNodes: AuraNodeInput[] = tireStackProgresses.map((prog, index) => {
    const side = index % 2 === 0 ? 5.8 : -5.8;
    const pose = sampleRouteOffset(prog, side);
    return model(assets.tireStack, { name: `apex tire barrier ${index + 1}`, scaleMode: "world", castShadow: true })
      .position(pose.x, groundedY(assets.tireStack.bounds, TIRE_SCALE, ROAD_SURFACE_Y), pose.z)
      .rotate(0, -pose.heading, 0)
      .scale(TIRE_SCALE)
      .runtime(game.runtimeNode(`tire-stack-${index}`, { tags: ["hazard", "barrier", "typed-asset", "runtime"] }));
  });

  // 4 trackside hairpin oil barrel hazards + 2 deployable player oil-slick traps
  const barrelNodes: AuraNodeInput[] = [
    ...oilBarrelProgresses.map((prog, index) => {
      const side = index % 2 === 0 ? -4.1 : 4.1;
      const pose = sampleRouteOffset(prog, side);
      return model(assets.oilBarrel, { name: `hairpin oil barrel ${index + 1}`, scaleMode: "world", castShadow: true })
        .position(pose.x, groundedY(assets.oilBarrel.bounds, BARREL_SCALE, ROAD_SURFACE_Y), pose.z)
        .scale(BARREL_SCALE)
        .runtime(game.runtimeNode(`oil-barrel-${index}`, { tags: ["hazard", "oil-barrel", "typed-asset", "runtime"] }));
    }),
    ...droppedTraps.map((_, index) =>
      model(assets.oilBarrel, { name: `deployed oil trap ${index + 1}`, scaleMode: "world", castShadow: true })
        .position(0, -50, 0)
        .scale(BARREL_SCALE)
        .runtime(game.runtimeNode(`dropped-trap-${index}`, { tags: ["hazard", "deployed-trap", "typed-asset", "runtime"] }))
    )
  ];

  // 3 trackside boost canisters + 2 homing canister projectiles
  const canisterNodes: AuraNodeInput[] = [
    ...boostCanisterProgresses.map((prog, index) => {
      const side = iSide(index);
      const pose = sampleRouteOffset(prog, side);
      return model(assets.boostCanister, { name: `nitro boost canister ${index + 1}`, scaleMode: "world", castShadow: true })
        .position(pose.x, groundedY(assets.boostCanister.bounds, CANISTER_SCALE, 0.25), pose.z)
        .scale(CANISTER_SCALE)
        .runtime(game.runtimeNode(`boost-pickup-${index}`, { tags: ["boost", "typed-asset", "runtime"] }));
    }),
    ...homingProjectiles.map((_, index) =>
      model(assets.boostCanister, { name: `homing canister projectile ${index + 1}`, scaleMode: "world", castShadow: true })
        .position(0, -50, 0)
        .scale(CANISTER_SCALE)
        .runtime(game.runtimeNode(`homing-canister-${index}`, { tags: ["projectile", "typed-asset", "runtime"] }))
    )
  ];

  // 10 towering desert mesas framing the outer canyon horizon (-31.5m outside the loop + 2 central infield buttes)
  const outerMesaProgresses = [0.03, 0.14, 0.26, 0.38, 0.50, 0.63, 0.77, 0.90] as const;
  const mesaNodes: AuraNodeInput[] = [
    ...outerMesaProgresses.map((prog, index) => {
      const pose = sampleRouteOffset(prog, -31.5);
      return model(assets.desertMesa, { name: `canyon mesa landmark ${index + 1}`, scaleMode: "world", castShadow: true })
        .position(pose.x, groundedY(assets.desertMesa.bounds, MESA_SCALE, ROAD_SURFACE_Y - 0.6), pose.z)
        .rotate(0, index * 1.05, 0)
        .scale(MESA_SCALE);
    }),
    model(assets.desertMesa, { name: "canyon mesa landmark infield west", scaleMode: "world", castShadow: true })
      .position(ROUTE_BOUNDS.centerX - 18, groundedY(assets.desertMesa.bounds, MESA_SCALE, ROAD_SURFACE_Y - 0.6), ROUTE_BOUNDS.centerZ + 4)
      .rotate(0, 0.8, 0)
      .scale(MESA_SCALE),
    model(assets.desertMesa, { name: "canyon mesa landmark infield east", scaleMode: "world", castShadow: true })
      .position(ROUTE_BOUNDS.centerX + 18, groundedY(assets.desertMesa.bounds, MESA_SCALE, ROAD_SURFACE_Y - 0.6), ROUTE_BOUNDS.centerZ - 4)
      .rotate(0, 2.4, 0)
      .scale(MESA_SCALE)
  ];

  // 14 stylized desert saguaro cacti lining the outer canyon shoulders (±11.8m)
  const cactusProgresses = [0.04, 0.11, 0.19, 0.27, 0.35, 0.42, 0.5, 0.58, 0.65, 0.72, 0.8, 0.87, 0.93, 0.98] as const;
  const cactusNodes: AuraNodeInput[] = cactusProgresses.map((prog, index) => {
    const side = index % 2 === 0 ? -11.8 : 11.8;
    const pose = sampleRouteOffset(prog, side);
    return model(assets.canyonCactus, { name: `desert saguaro cactus ${index + 1}`, scaleMode: "world", castShadow: true })
      .position(pose.x, groundedY(assets.canyonCactus.bounds, CACTUS_SCALE, ROAD_SURFACE_Y), pose.z)
      .rotate(0, index * 0.85, 0)
      .scale(CACTUS_SCALE);
  });

  // 3 AI rival karts (rivalKart, purpleKart, yellowKart)
  const rivalKartNodes: AuraNodeInput[] = rivalsState.map((rival) => {
    const pose = sampleRouteOffset(rival.startProgress, rival.baseLane);
    const assetDef =
      rival.assetKey === "rivalKart"
        ? assets.rivalKart
        : rival.assetKey === "purpleKart"
          ? assets.purpleKart
          : assets.yellowKart;
    return model(assetDef, { name: `rival kart ${rival.name}`, scaleMode: "world", castShadow: true })
      .position(pose.x, rival.rideY, pose.z)
      .rotate(0, Math.PI - pose.heading, 0)
      .scale(rival.scale)
      .runtime(game.runtimeNode(rival.nodeId, { tags: ["rival", "vehicle", "typed-asset", "runtime"] }));
  });

  const nodes: AuraNodeInput[] = [
    // Continuous 3D Grand Prix Asphalt Roadway, Red/White Rumble Curbs, & Desert Canyon Floor
    ...buildGrandPrixRoadwayNodes(),

    // Central Canyon Outpost & Red-Rock Infield Formation (assets.canyonTrack)
    model(assets.canyonTrack, { name: "typed desert canyon kart circuit", scaleMode: "world" })
      .position(ROUTE_BOUNDS.centerX, -1.95, ROUTE_BOUNDS.centerZ)
      .scale([TRACK_SCALE, TRACK_SCALE * 0.38, TRACK_SCALE]),

    // Player Hero Go-Kart (assets.heroKart)
    model(assets.heroKart, { name: "typed hero go-kart", scaleMode: "world", castShadow: true })
      .position(startPose.x, CAR_RIDE_Y, startPose.z)
      .rotate(0, Math.PI - startPose.heading, 0)
      .scale(HERO_KART_SCALE)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),

    ...rivalKartNodes,
    ...archNodes,
    ...crateNodes,
    ...tireNodes,
    ...barrelNodes,
    ...canisterNodes,
    ...mesaNodes,
    ...cactusNodes
  ];

  const startFx = Math.cos(startPose.heading);
  const startFz = Math.sin(startPose.heading);

  return scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0, exposureEv: 0.05 }))
    .addMany(nodes)
    .camera(
      camera.perspective({
        position: [startPose.x - startFx * CHASE.back, CAR_RIDE_Y + CHASE.up, startPose.z - startFz * CHASE.back],
        target: [startPose.x + startFx * CHASE.ahead, CAR_RIDE_Y + 0.75, startPose.z + startFz * CHASE.ahead],
        fov: CHASE.fov
      })
    );
}

function iSide(index: number): number {
  return index % 2 === 0 ? -3.2 : 3.2;
}

function createHud(): HTMLElement {
  const existing = document.getElementById("racing-starter-hud");
  existing?.remove();
  const root = document.createElement("aside");
  root.id = "racing-starter-hud";
  root.setAttribute("aria-label", "Kart Havoc telemetry HUD");
  document.body.append(root);
  return root;
}

function renderHud(): void {
  const kmh = Math.round(Math.abs(playerKart.speed) * 4.2);
  const driftPct = Math.round(driftCharge);
  const itemText = heldItem ?? "Empty — hit crate";

  const racers = [
    {
      name: "You (Hero Kart)",
      score: (playerKart.lap - 1) + normalizeStartRelativeProgress(playerKart.progress),
      lap: playerKart.lap,
      isPlayer: true
    },
    ...rivalsState.map((r) => ({
      name: r.spinTimer > 0 ? `${r.name} (Spin)` : r.name,
      score: (r.lap - 1) + normalizeStartRelativeProgress(r.progress),
      lap: r.lap,
      isPlayer: false
    }))
  ].sort((a, b) => b.score - a.score);

  const standingsHtml = racers
    .map(
      (racer, idx) =>
        `<div class="kh-standing-row" data-player="${racer.isPlayer}">` +
        `<span class="metric-num">${idx + 1}/4</span>` +
        `<span>${racer.name}</span>` +
        `<span class="tnum" style="text-align:right">L${racer.lap}/${LAPS_TO_WIN}</span>` +
        `</div>`
    )
    .join("");

  hudRoot.innerHTML = [
    `<header class="kh-header">`,
    `<h1 id="kart-havoc-title" class="kh-title">Kart Havoc</h1>`,
    `<span class="kh-badge tnum">Canyon GP</span>`,
    `</header>`,
    `<section class="kh-grid">`,
    `<div class="kh-cell"><span class="smcp-label">pos</span><span class="kh-val kh-val-hero">${ordinalPlace(playerPlace)}/4</span></div>`,
    `<div class="kh-cell"><span class="smcp-label">lap</span><span class="kh-val">${playerKart.lap}/${LAPS_TO_WIN}</span></div>`,
    `<div class="kh-cell"><span class="smcp-label">gates</span><span class="kh-val">${playerKart.checkpoint % route.checkpoints.length}/${route.checkpoints.length}</span></div>`,
    `<div class="kh-cell"><span class="smcp-label">speed</span><span class="kh-val">${kmh} <small class="smcp-label">km/h</small></span></div>`,
    `</section>`,
    `<div class="kh-row">`,
    `<span class="kh-row-label">Item slot</span>`,
    `<span class="kh-item-pill tnum" data-empty="${heldItem === null}">${itemText}</span>`,
    `</div>`,
    `<div class="kh-row">`,
    `<span class="kh-row-label">Drift turbo</span>`,
    `<div class="kh-meter-wrap">`,
    `<div class="kh-meter-track"><div class="kh-meter-fill" style="width:${driftPct}%"></div></div>`,
    `<span class="metric-num">${driftPct}%</span>`,
    `</div>`,
    `</div>`,
    `<div class="kh-row">`,
    `<span class="kh-row-label">Lap clock</span>`,
    `<span class="tnum">${playerKart.lapTime.toFixed(2)}s</span>`,
    `</div>`,
    `<section class="kh-standings">${standingsHtml}</section>`,
    `<div class="kh-objective">${objective}</div>`,
    `<div class="kh-controls">Drive W/S · Steer A/D · Drift Space · Item E/Enter · Boost Shift · Reset R</div>`
  ].join("");
}

function publishEvidence(): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      objective,
      lapTime: Number(playerKart.lapTime.toFixed(2)),
      checkpoint: `${playerKart.checkpoint}/${route.checkpoints.length}`,
      place: playerPlace,
      heldItem,
      driftCharge: Math.round(driftCharge),
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });

  const payload: KartHavocEvidence = {
    status: playerKart.status,
    frame: playerKart.frame,
    lap: playerKart.lap,
    lapsToWin: LAPS_TO_WIN,
    checkpoint: playerKart.checkpoint,
    checkpointCount: route.checkpoints.length,
    speed: Number(playerKart.speed.toFixed(3)),
    progress: Number(playerKart.progress.toFixed(4)),
    heading: Number(playerKart.heading.toFixed(4)),
    position: {
      x: Number(playerKart.x.toFixed(3)),
      y: Number(playerKart.z.toFixed(3))
    },
    events: raceEventLabels,
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    geometry: {
      tool: "aura3d assets certify-game-geometry --category racing",
      report: "tests/geometry-certification.json",
      carMetres: HERO_CAR_METRES,
      trackMetres: CANYON_TRACK_METRES,
      carScale: 1,
      modelScale: HERO_KART_SCALE,
      trackScale: TRACK_SCALE,
      routeScale: ROUTE_SCALE
    },
    camera: {
      rig: app.camera?.rig.id ?? "chase",
      presented: app.camera !== undefined
    },
    place: playerPlace,
    heldItem,
    driftCharge: Math.round(driftCharge),
    rivals: rivalsState.map((rival) => ({
      id: rival.id,
      name: rival.name,
      assetKey: rival.assetKey,
      lap: rival.lap,
      progress: Number(rival.progress.toFixed(4)),
      speed: rival.speed,
      spinning: rival.spinTimer > 0
    })),
    typedAssetsUsed: ALL_TYPED_ASSET_KEYS,
    evidence
  };

  window.__AURA3D_KART_HAVOC__ = payload;
  window.__AURA3D_RACING_STARTER__ = payload;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function wrapAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}
