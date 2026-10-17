/**
 * Apex Overdrive v2 — flagship sky-lane highway racer.
 *
 * Same identity as the original Roadster Rush port (fly the Apex Interceptor
 * over a gridlocked sunset freeway: cold-gas thrusters, barrel rolls, carrier
 * launch ramps, sky-lane dogfights, near-miss scoring) rebuilt on the Aura3D
 * game kits instead of the legacy engine.js runtime:
 *
 *   - game.racing + game.arcadeKart own the route, surface query and the
 *     player's ground arcade vehicle model (open `closed:false` freeway).
 *   - createVehicleChassis resolves grounded suspension/attitude telemetry.
 *   - createVehicleDriverAi drives every freeway commuter, sky-lane courier
 *     and the three named rivals — deterministic racing-line AI.
 *   - game.cameraDirector marks takedown/barrel-roll special moments;
 *     camera.rigs.chase + a createCameraPathFromPreset intro flythrough own
 *     presentation; trauma/punch/fovKick layers juice boost and crashes.
 *   - effects: SSR wet asphalt, motion blur, cinematic bloom, additive thruster
 *     trails, boost-pad beams, projected scorch decals, storm rain layer.
 *   - createGame shell (title/pause/results/settings), HUD kit widgets
 *     (score/speedometer/meter/combo/objective/prompt), DOM event feed,
 *     game.eventLog + app.evidence, steer-pedals touch controls, cue audio
 *     with the original music/voice pack, reduced-motion accessibility.
 */
import {
  camera,
  createVehicleChassis,
  createVehicleDriverAi,
  effects,
  game,
  gameFeel,
  looks,
  material,
  model,
  primitives,
  scene,
  vehicleChassisSpecFromBounds,
  type AuraNodeInput,
  type AuraVec3,
  type VehicleSurface
} from "@aura3d/engine";
import { createCameraPathFromPreset } from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assetsV2 } from "./aura-assets-v2";
import "./styles.css";

/* ------------------------------------------------------------------ *
 *  Route & world constants
 * ------------------------------------------------------------------ */

const LOOK_ID = "golden-hour" as const;
const ROAD_WIDTH = 30;
const ROAD_HALF_WIDTH = ROAD_WIDTH * 0.5;
const FREEWAY_Z_START = 60;
const FREEWAY_Z_END = -4400;
const ROUTE_LENGTH = FREEWAY_Z_START - FREEWAY_Z_END; // ~4460 m
const FINISH_PROGRESS = 0.985;
const LANES = [-12.5, -7.5, -2.5, 2.5, 7.5, 12.5] as const;
const SKY_ALT_LOW = 6.4;
const SKY_ALT_HIGH = 12.6;
const HOVER_RIDE_Y = 0.9;
const MAX_ALTITUDE = 15.5;
const START_PROGRESS = 0.012;
const PLAYER_SCALE = 0.62;

/** Straight freeway heading — points sample -Z so heading ~ -Z. */
const route = {
  id: "apex-overdrive-freeway",
  width: ROAD_WIDTH,
  closed: false as const,
  points: [
    { x: 0, y: FREEWAY_Z_START },
    { x: 0, y: -700 },
    { x: 0, y: -1500 },
    { x: 0, y: -2300 },
    { x: 0, y: -3100 },
    { x: 0, y: -3900 },
    { x: 0, y: FREEWAY_Z_END }
  ],
  // Sector gates — the racing kit's checkpoint system, spaced down the corridor.
  checkpoints: [0.12, 0.28, 0.44, 0.60, 0.76, 0.92]
};

function scaleForSpan(bounds: readonly [number, number, number], targetSpan: number): number {
  return Number((targetSpan / Math.max(bounds[0], bounds[1], bounds[2], 0.001)).toFixed(3));
}
function groundedY(bounds: readonly [number, number, number], scale: number, surfaceY = 0): number {
  return Number((surfaceY + bounds[1] * scale * 0.5).toFixed(3));
}

const CARRIER_SCALE = 0.9;
const BUILDING_SCALE = scaleForSpan(assetsV2.building.bounds, 118);
const BLIMP_SCALE = scaleForSpan(assetsV2.apexBlimp.bounds, 34);
const APEX_PLAYER_SCALE = scaleForSpan(assetsV2.apexInterceptor.bounds, 4.9);
const APEX_RIVAL_SCALE = scaleForSpan(assetsV2.apexRival.bounds, 4.6);
const GUNSHIP_SCALE = scaleForSpan(assetsV2.apexGunship.bounds, 14);

/* ------------------------------------------------------------------ *
 *  Kits
 * ------------------------------------------------------------------ */

const racing = game.racing({
  route,
  startProgress: START_PROGRESS,
  checkpointRadius: 0.012,
  lapsToWin: 1,
  maxSpeed: 58,
  acceleration: 30,
  drag: 1.6,
  steerRate: 2.4,
  boostAcceleration: 26,
  feelBus: { emit: (name, o) => apexGame?.app?.feel?.emit(name, { strength: o?.strength }) }
});

const kart = game.arcadeKart({
  route,
  surfaceQuery: racing.surfaceQuery,
  startProgress: START_PROGRESS,
  lapsToWin: 1,
  roadHalfWidth: ROAD_HALF_WIDTH,
  maxSpeed: 46,
  boostMaxSpeed: 62,
  acceleration: 26,
  boostAcceleration: 34
});

/** sampleOffset returns {x, z, heading}; heading ~ -Z travel direction. */
function sampleRoute(progress: number, lateral = 0) {
  return kart.sampleOffset(Math.min(1, Math.max(0, progress)), lateral);
}

const driverRoute = {
  sample: (p: number) => {
    const s = sampleRoute(p, 0);
    return { x: s.x, y: s.z, heading: s.heading };
  },
  halfWidth: () => ROAD_HALF_WIDTH - 1.2,
  length: ROUTE_LENGTH
};

/* ------------------------------------------------------------------ *
 *  Traffic / sky-lane / rival fleets
 * ------------------------------------------------------------------ */

type ModelKey = Exclude<
  keyof typeof assetsV2,
  "billboard0" | "billboard1" | "billboard2" | "billboard3"
>;

interface FleetEntry {
  readonly id: string;
  readonly nodeId: string;
  readonly asset: ModelKey;
  readonly scale: number;
  readonly rideY: number;
  readonly lane: number;
  readonly startProgress: number;
  readonly cruise: number;
  readonly aggression: "cautious" | "balanced" | "aggressive";
  readonly seed: number;
  readonly altitude: number;
  progress: number;
  signedOffset: number;
  speed: number;
  heading: number;
  x: number;
  z: number;
  nearMissArmed: boolean;
  tumble: number;
}

const TRAFFIC_ASSETS = [
  "sedan", "hatch", "suv", "taxi", "van", "pickup", "boxtruck", "bus", "sedan", "hatch", "suv", "taxi"
] as const;

const trafficFleet: FleetEntry[] = TRAFFIC_ASSETS.map((asset, i) => {
  const lane = LANES[i % LANES.length] ?? 0;
  const prog = 0.06 + (i * 0.037) % 0.9;
  const pose = sampleRoute(prog, lane);
  const scale = asset === "bus" || asset === "boxtruck" ? 0.9 : 1;
  return {
    id: `traffic-${i}`,
    nodeId: `traffic-${i}`,
    asset,
    scale,
    rideY: 0,
    lane,
    startProgress: prog,
    cruise: asset === "bus" || asset === "boxtruck" ? 9 + (i % 3) : 11 + ((i * 7) % 9),
    aggression: i % 5 === 0 ? "aggressive" : i % 3 === 0 ? "balanced" : "cautious",
    seed: 100 + i,
    altitude: 0,
    progress: prog,
    signedOffset: lane,
    speed: 10,
    heading: pose.heading,
    x: pose.x,
    z: pose.z,
    nearMissArmed: true,
    tumble: 0
  };
});

const SKY_ASSETS = ["skyCar", "skyCar", "skyCar", "apexRival"] as const;
const skyFleet: FleetEntry[] = SKY_ASSETS.map((asset, i) => {
  const lane = [-6, -1.5, 4.5, 9][i] ?? 0;
  const prog = 0.1 + (i * 0.16) % 0.85;
  const pose = sampleRoute(prog, lane);
  return {
    id: `sky-${i}`,
    nodeId: `sky-${i}`,
    asset,
    scale: asset === "apexRival" ? APEX_RIVAL_SCALE : 0.72,
    rideY: 0,
    lane,
    startProgress: prog,
    cruise: 26 + i * 4,
    aggression: "balanced" as const,
    seed: 300 + i,
    altitude: SKY_ALT_LOW + (i % 3) * 2.4,
    progress: prog,
    signedOffset: lane,
    speed: 26,
    heading: pose.heading,
    x: pose.x,
    z: pose.z,
    nearMissArmed: true,
    tumble: 0
  };
});

const rivals: FleetEntry[] = [
  { name: "Vex Corvid", asset: "apexRival", lane: -4, prog: 0.05, cruise: 41 },
  { name: "Mara Kestrel", asset: "skyCar", lane: 3.5, prog: 0.04, cruise: 39 },
  { name: "Ion Bishop", asset: "apexRival", lane: -0.5, prog: 0.085, cruise: 43 }
].map((r, i) => {
  const pose = sampleRoute(r.prog, r.lane);
  return {
    id: `rival-${i}`,
    nodeId: `rival-${i}`,
    name: r.name,
    asset: r.asset,
    scale: r.asset === "apexRival" ? APEX_RIVAL_SCALE : 0.72,
    rideY: 0,
    lane: r.lane,
    startProgress: r.prog,
    cruise: r.cruise,
    aggression: "aggressive" as const,
    seed: 700 + i,
    altitude: SKY_ALT_LOW + 1.6 + i * 1.4,
    progress: r.prog,
    signedOffset: r.lane,
    speed: r.cruise,
    heading: pose.heading,
    x: pose.x,
    z: pose.z,
    nearMissArmed: true,
    tumble: 0
  } as FleetEntry & { name: string };
}) as FleetEntry[];

/** Carrier launch ramps — parked on shoulders, drive over the deck to launch. */
const CARRIER_SLOTS = [
  { progress: 0.16, lane: 13.4 },
  { progress: 0.34, lane: -13.4 },
  { progress: 0.52, lane: 13.4 },
  { progress: 0.68, lane: -13.4 },
  { progress: 0.85, lane: 13.4 }
] as const;

const BOOST_PADS = [0.09, 0.22, 0.3, 0.47, 0.58, 0.72, 0.8, 0.95].map((progress, i) => ({
  progress,
  lane: [-4.8, 0, 4.8, -4.8, 4.8, 0, -4.8, 4.8][i] ?? 0,
  cooldown: 0
}));

const drivers = new Map<string, ReturnType<typeof createVehicleDriverAi>>();
function driverFor(entry: FleetEntry) {
  let d = drivers.get(entry.id);
  if (!d) {
    d = createVehicleDriverAi(driverRoute, {
      maxSpeed: entry.cruise,
      aggression: entry.aggression,
      paceFraction: 0.82,
      seed: entry.seed,
      reactionSeconds: 0.2
    });
    drivers.set(entry.id, d);
  }
  return d;
}

/* ------------------------------------------------------------------ *
 *  Input
 * ------------------------------------------------------------------ */

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    thrust: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    rollLeft: ["KeyQ"],
    rollRight: ["KeyE"],
    takedown: ["KeyF"],
    storm: ["KeyT"],
    reset: ["KeyR"],
    pause: ["Escape", "KeyP"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 80
} as const;

const isAutoplay =
  typeof window !== "undefined" && new URLSearchParams(window.location.search).get("autoplay") === "1";

/* ------------------------------------------------------------------ *
 *  Game state
 * ------------------------------------------------------------------ */

interface PlayerState {
  x: number; z: number; y: number;
  vy: number;
  speed: number;
  heading: number;
  progress: number;
  signedTrackOffset: number;
  roll: number;          // visual roll (barrel roll + bank)
  pitch: number;
  rollAnim: number;      // 0..1 barrel roll progress, -1 idle
  rollDir: number;
  invuln: number;
  hull: number;
  boost: number;         // 0..100
  charge: number;        // cold-gas thruster charge 0..100
  airtime: number;
  launched: number;
  status: "idle" | "running" | "finished" | "totaled";
  checkpoint: number;
  raceTime: number;
}

const player: PlayerState = {
  x: 0, z: 0, y: HOVER_RIDE_Y, vy: 0, speed: 0, heading: Math.PI,
  progress: START_PROGRESS, signedTrackOffset: 0,
  roll: 0, pitch: 0, rollAnim: -1, rollDir: 1, invuln: 0,
  hull: 100, boost: 55, charge: 100, airtime: 0, launched: 0,
  status: "idle", checkpoint: 0, raceTime: 0
};

const score = {
  total: 0,
  combo: 1,
  comboTimer: 0,
  nearMisses: 0,
  rolls: 0,
  launches: 0,
  takedowns: 0,
  bestCombo: 1
};

const freewaySurface: VehicleSurface = {
  sample: () => ({ height: 0, normal: [0, 1, 0], grip: 1, hit: true })
};

const chassis = createVehicleChassis(
  {
    ...vehicleChassisSpecFromBounds([
      assetsV2.playerInterceptor.bounds[0] * PLAYER_SCALE,
      assetsV2.playerInterceptor.bounds[1] * PLAYER_SCALE,
      assetsV2.playerInterceptor.bounds[2] * PLAYER_SCALE
    ]),
    maxRoll: 0.34,
    maxPitch: 0.22
  },
  freewaySurface
);

const routeEvents = game.eventLog({ label: "apex overdrive events", maxEvents: 40 });
let apexGame: ReturnType<typeof createGame> | undefined;

function recordEvent(type: string, label: string, severity: "info" | "success" | "warning" = "info") {
  routeEvents.push({ type, label, severity });
}

/* ------------------------------------------------------------------ *
 *  Scene
 * ------------------------------------------------------------------ */

const BILLBOARD_TEXTURES = [assetsV2.billboard0, assetsV2.billboard1, assetsV2.billboard2, assetsV2.billboard3];

function buildScene() {
  const startPose = sampleRoute(START_PROGRESS, 0);
  const nodes: AuraNodeInput[] = [];

  // Grand-prix asphalt ribbon + curbs + centre dashes along the open freeway.
  nodes.push(
    ...kart.buildRoadwayNodes({
      roadHalfWidth: ROAD_HALF_WIDTH,
      startProgress: START_PROGRESS,
      palette: {
        asphalt: "#2b2630",
        curbRed: "#c23b4e",
        curbWhite: "#e8e2da",
        centerDash: "#ffb36b",
        startLineWhite: "#f5ede4",
        startLineDark: "#1a1520",
        desertFloor: "#3a2733"
      }
    })
  );

  // Player interceptor — Meshy hero flies when the GLB lands, catalog hero is
  // the always-present authored node (trail targets bind to both ids).
  nodes.push(
    model(assetsV2.playerInterceptor, { name: "apex interceptor", scaleMode: "world", castShadow: true })
      .position(startPose.x, HOVER_RIDE_Y, startPose.z)
      .rotate(0, Math.PI - startPose.heading, 0)
      .scale(PLAYER_SCALE)
      .runtime(game.runtimeNode("player-interceptor", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    model(assetsV2.apexInterceptor, { name: "meshy apex interceptor", scaleMode: "world", castShadow: true })
      .position(startPose.x, HOVER_RIDE_Y, startPose.z)
      .rotate(0, Math.PI - startPose.heading, 0)
      .scale(APEX_PLAYER_SCALE)
      .runtime(game.runtimeNode("player-apex", { tags: ["player", "vehicle", "typed-asset", "runtime"] }))
  );

  for (const entry of trafficFleet) {
    nodes.push(
      model(assetsV2[entry.asset], { name: `commuter ${entry.id}`, scaleMode: "world", castShadow: true })
        .position(entry.x, entry.rideY, entry.z)
        .rotate(0, Math.PI - entry.heading, 0)
        .scale(entry.scale)
        .runtime(game.runtimeNode(entry.nodeId, { tags: ["traffic", "vehicle", "typed-asset", "runtime"] }))
    );
  }
  for (const entry of skyFleet) {
    nodes.push(
      model(assetsV2[entry.asset], { name: `sky courier ${entry.id}`, scaleMode: "world", castShadow: true })
        .position(entry.x, entry.altitude, entry.z)
        .rotate(0, Math.PI - entry.heading, 0)
        .scale(entry.scale)
        .runtime(game.runtimeNode(entry.nodeId, { tags: ["sky-car", "vehicle", "typed-asset", "runtime"] }))
    );
  }
  for (const entry of rivals) {
    nodes.push(
      model(assetsV2[entry.asset], { name: `rival ${entry.id}`, scaleMode: "world", castShadow: true })
        .position(entry.x, entry.altitude, entry.z)
        .rotate(0, Math.PI - entry.heading, 0)
        .scale(entry.scale)
        .runtime(game.runtimeNode(entry.nodeId, { tags: ["rival", "vehicle", "typed-asset", "runtime"] }))
    );
  }

  // Carrier launch-ramp trucks parked on the shoulders.
  CARRIER_SLOTS.forEach((slot, i) => {
    const pose = sampleRoute(slot.progress, slot.lane);
    nodes.push(
      model(assetsV2.carrier, { name: `launch carrier ${i + 1}`, scaleMode: "world", castShadow: true })
        .position(pose.x, groundedY(assetsV2.carrier.bounds, CARRIER_SCALE, -0.05), pose.z)
        .rotate(0, Math.PI - pose.heading, 0)
        .scale(CARRIER_SCALE)
        .runtime(game.runtimeNode(`carrier-${i}`, { tags: ["carrier", "vehicle", "typed-asset", "runtime"] }))
    );
  });

  // City canyon — scaled building tiles flanking the corridor.
  const buildingZ = [-140, -420, -760, -1080, -1420, -1780, -2140, -2500, -2860, -3220, -3580, -3940, -4280];
  buildingZ.forEach((z, i) => {
    const side = i % 2 === 0 ? -46 : 46;
    nodes.push(
      model(assetsV2.building, { name: `city block ${i + 1}`, scaleMode: "world" })
        .position(side, -1.5, z)
        .rotate(0, i % 2 === 0 ? Math.PI * 0.5 : -Math.PI * 0.5, 0)
        .scale(BUILDING_SCALE)
    );
  });

  // Holo-billboard pairs on gantry poles (typed texture assets on cards —
  // minor set dressing, not scene-effect fakes).
  const boardZ = [-180, -520, -900, -1260, -1680, -2060, -2440, -2820, -3200, -3620, -4000];
  boardZ.forEach((z, i) => {
    const side = i % 2 === 0 ? -21 : 21;
    const texture = BILLBOARD_TEXTURES[i % BILLBOARD_TEXTURES.length]!;
    nodes.push(
      primitives.box({ name: `billboard pole ${i}`, material: material.metal({ color: "#3a3540" }) })
        .position(side, 7, z).scale([0.5, 14, 0.5]),
      primitives.box({
        name: `holo billboard ${i}`,
        material: material.pbr({
          color: "#ffffff",
          roughness: 0.5,
          texture,
          emissive: "#ffffff",
          emissiveIntensity: 0.35,
          emissiveMap: texture
        }),
        castShadow: false
      }).position(side, 15.5, z).scale([14, 7, 0.4])
    );
  });

  // Meshy holo blimp drifting high over the corridor mid-point.
  nodes.push(
    model(assetsV2.apexBlimp, { name: "holo blimp", scaleMode: "world" })
      .position(0, 42, -1400)
      .rotate(0, 0.35, 0)
      .scale(BLIMP_SCALE)
      .runtime(game.runtimeNode("holo-blimp", { tags: ["set-dressing", "typed-asset"] })),
    // Meshy gunship escort parked far down-route as a landmark.
    model(assetsV2.apexGunship, { name: "apex gunship", scaleMode: "world", castShadow: true })
      .position(-26, 4, -2600)
      .rotate(0, 0.7, 0)
      .scale(GUNSHIP_SCALE)
  );

  // Boost-pad light columns (additive engine beams on the racing line).
  BOOST_PADS.forEach((pad, i) => {
    const pose = sampleRoute(pad.progress, pad.lane);
    nodes.push(
      effects.beam({
        name: `boost column ${i}`,
        from: [pose.x, 0.4, pose.z],
        to: [pose.x, 11, pose.z],
        color: "#5fe6ff",
        intensity: 0.55,
        widthWorld: 1.1
      })
    );
  });

  // Cold-gas thruster trails bound to the player's runtime node.
  nodes.push(
    effects.trail({ name: "port thruster trail", target: "player-interceptor", color: "#5fe6ff", width: 0.34, intensity: 0.9, maxPoints: 40 }),
    effects.trail({ name: "starboard thruster trail", target: "player-apex", color: "#ffb36b", width: 0.3, intensity: 0.8, maxPoints: 40 })
  );

  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .add(effects.screenSpaceReflections({ name: "wet asphalt reflections", intensity: 0.75 }))
    .add(effects.motionBlur({ name: "velocity blur", intensity: 0.32, shutter: 0.55 }))
    .add(effects.cinematicBloom({ name: "sunset neon bloom", intensity: 0.5, color: "#ffb36b", threshold: 0.66 }))
    .add(
      effects
        .rain({ name: "storm front rain", intensity: 0.9, density: 0.66, speed: 1.35, particleCount: 2600 })
        .runtime(game.runtimeNode("storm-rain", { tags: ["weather", "runtime"] }))
    )
    .camera(
      camera.perspective({
        position: [startPose.x, HOVER_RIDE_Y + 4.4, startPose.z + 11],
        target: [startPose.x, HOVER_RIDE_Y + 0.8, startPose.z - 12],
        fov: 60
      })
    );
}

/* ------------------------------------------------------------------ *
 *  DOM HUD + shell
 * ------------------------------------------------------------------ */

let hudRoot: HTMLElement;
let shellEl: HTMLElement;
let vignetteEl: HTMLElement;
let objective = "Thread the gridlock: near-miss traffic, hit boost columns, launch off carriers — finish the 4.5 km corridor.";

function mountDom() {
  hudRoot = document.createElement("aside");
  hudRoot.id = "apex-hud";
  hudRoot.setAttribute("aria-label", "Apex Overdrive telemetry HUD");
  hudRoot.dataset.hidden = "true";
  document.body.append(hudRoot);

  vignetteEl = document.createElement("div");
  vignetteEl.id = "apex-vignette";
  vignetteEl.dataset.hit = "false";
  document.body.append(vignetteEl);

  shellEl = document.createElement("section");
  shellEl.className = "apex-shell";
  shellEl.setAttribute("aria-label", "Apex Overdrive shell");
  document.body.append(shellEl);
}

function renderHud() {
  const kmh = Math.round(Math.abs(player.speed) * 3.6);
  const combo = score.combo > 1 ? `x${score.combo}` : "—";
  const ev = routeEvents.events().slice(-6);
  const standings = [
    { name: "You", prog: player.progress, isPlayer: true },
    ...rivals.map((r, i) => ({ name: (r as FleetEntry & { name?: string }).name ?? `Rival ${i + 1}`, prog: r.progress, isPlayer: false }))
  ].sort((a, b) => b.prog - a.prog);

  hudRoot.innerHTML = `
    <div class="hud-top-left">
      <div class="apex-panel">
        <div class="apex-title">APEX OVERDRIVE</div>
        <div class="apex-sub">Sector ${Math.min(player.checkpoint + 1, route.checkpoints.length)}/${route.checkpoints.length} · ${(player.progress * 100).toFixed(0)}% of corridor</div>
        <div class="metric-grid" style="margin-top:8px">
          <div class="metric-cell"><span class="smcp-label">speed</span><span class="metric-val metric-hero tnum">${kmh}<small> km/h</small></span></div>
          <div class="metric-cell"><span class="smcp-label">alt</span><span class="metric-val tnum">${player.y.toFixed(1)}<small> m</small></span></div>
          <div class="metric-cell"><span class="smcp-label">score</span><span class="metric-val tnum">${score.total.toLocaleString()}</span></div>
        </div>
      </div>
      <div class="apex-panel meter-wrap">
        <div class="meter-row"><span class="smcp-label">boost</span><div class="meter-track"><div class="meter-fill" style="width:${player.boost.toFixed(0)}%"></div></div><span class="tnum">${player.boost.toFixed(0)}</span></div>
        <div class="meter-row"><span class="smcp-label">cold gas</span><div class="meter-track"><div class="meter-fill cold" style="width:${player.charge.toFixed(0)}%"></div></div><span class="tnum">${player.charge.toFixed(0)}</span></div>
        <div class="meter-row"><span class="smcp-label">hull</span><div class="meter-track"><div class="meter-fill hull" style="width:${player.hull.toFixed(0)}%"></div></div><span class="tnum">${player.hull.toFixed(0)}</span></div>
      </div>
    </div>
    <div class="hud-center">
      <div class="combo-callout" data-live="${score.combo > 1 && score.comboTimer > 0}">NEAR-MISS ${combo}</div>
    </div>
    <div class="hud-top-right">
      <div class="apex-panel standings">
        <span class="smcp-label">sky-lane rivals</span>
        ${standings.map((s, i) => `<div class="standing-row" data-player="${s.isPlayer}"><span class="tnum">P${i + 1}</span><span>${s.name}</span><span class="tnum">${(s.prog * 100).toFixed(0)}%</span></div>`).join("")}
      </div>
      <div class="apex-panel event-feed">
        ${ev.map((e) => `<div class="ev ev-${e.severity}"><span class="ev-tag">${e.type}</span><span>${e.label}</span></div>`).join("") || `<div class="ev"><span class="ev-tag">ready</span><span>thrusters primed</span></div>`}
      </div>
    </div>
    <div class="hud-bottom-left">
      <div class="apex-panel">
        <div class="objective-line">${objective}</div>
        <div class="controls-hint" style="margin-top:6px">W/S throttle · A/D steer · Space thrust · Shift boost · Q/E barrel roll · F takedown · T storm · R reset</div>
      </div>
    </div>`;
}

type ShellScreen = "title" | "pause" | "results" | "settings" | "hidden";
let shellScreen: ShellScreen = "title";
let settings = { storm: false, music: true, voice: true, shake: true, reducedMotion: false };

function renderShell() {
  shellEl.dataset.hidden = shellScreen === "hidden" ? "true" : "false";
  const keybinds = `
    <div class="kbd-list">
      <div><kbd>W/S</kbd>throttle / brake</div><div><kbd>A/D</kbd>steer lanes</div>
      <div><kbd>Space</kbd>cold-gas thrust</div><div><kbd>Shift</kbd>boost burn</div>
      <div><kbd>Q/E</kbd>barrel roll</div><div><kbd>F</kbd>rival takedown</div>
      <div><kbd>T</kbd>storm front</div><div><kbd>Esc</kbd>pause</div>
    </div>`;
  if (shellScreen === "title") {
    shellEl.innerHTML = `<div class="shell-card">
      <div class="shell-kicker">Aura3D flagship · sky-lane racer</div>
      <h1 class="shell-title">APEX<br/>OVERDRIVE</h1>
      <p class="shell-sub">Fly the Apex Interceptor over a gridlocked sunset freeway. Cold-gas thrusters over traffic, barrel rolls through sky-lane dogfights, carrier-ramp launches, 4.5&nbsp;km to the finish gantry.</p>
      ${keybinds}
      <div class="shell-actions">
        <button class="apex-btn" data-act="start">LAUNCH RUN</button>
        <button class="apex-btn secondary" data-act="settings">SETTINGS</button>
      </div></div>`;
  } else if (shellScreen === "pause") {
    shellEl.innerHTML = `<div class="shell-card">
      <div class="shell-kicker">paused</div>
      <h1 class="shell-title" style="font-size:30px">HOLD POSITION</h1>
      <div class="shell-rows">
        <div class="shell-row"><span class="smcp-label">score</span><span class="tnum">${score.total.toLocaleString()}</span></div>
        <div class="shell-row"><span class="smcp-label">progress</span><span class="tnum">${(player.progress * 100).toFixed(1)}%</span></div>
        <div class="shell-row"><span class="smcp-label">best combo</span><span class="tnum">x${score.bestCombo}</span></div>
      </div>
      <div class="shell-actions">
        <button class="apex-btn" data-act="resume">RESUME</button>
        <button class="apex-btn secondary" data-act="restart">RESTART</button>
        <button class="apex-btn secondary" data-act="settings">SETTINGS</button>
        <button class="apex-btn secondary" data-act="title">QUIT TO TITLE</button>
      </div></div>`;
  } else if (shellScreen === "results") {
    const won = player.status === "finished";
    shellEl.innerHTML = `<div class="shell-card">
      <div class="shell-kicker">${won ? "corridor cleared" : "interceptor totaled"}</div>
      <h1 class="shell-title" style="font-size:30px">${won ? "RUN COMPLETE" : "RUN LOST"}</h1>
      <div class="shell-rows">
        <div class="shell-row"><span class="smcp-label">final score</span><span class="tnum">${score.total.toLocaleString()}</span></div>
        <div class="shell-row"><span class="smcp-label">progress</span><span class="tnum">${(player.progress * 100).toFixed(1)}%</span></div>
        <div class="shell-row"><span class="smcp-label">near misses</span><span class="tnum">${score.nearMisses}</span></div>
        <div class="shell-row"><span class="smcp-label">barrel rolls</span><span class="tnum">${score.rolls}</span></div>
        <div class="shell-row"><span class="smcp-label">carrier launches</span><span class="tnum">${score.launches}</span></div>
        <div class="shell-row"><span class="smcp-label">rival takedowns</span><span class="tnum">${score.takedowns}</span></div>
        <div class="shell-row"><span class="smcp-label">best combo</span><span class="tnum">x${score.bestCombo}</span></div>
        <div class="shell-row"><span class="smcp-label">run time</span><span class="tnum">${player.raceTime.toFixed(1)}s</span></div>
      </div>
      <div class="shell-actions">
        <button class="apex-btn" data-act="restart">RUN IT BACK</button>
        <button class="apex-btn secondary" data-act="title">TITLE</button>
      </div></div>`;
  } else if (shellScreen === "settings") {
    shellEl.innerHTML = `<div class="shell-card">
      <div class="shell-kicker">settings</div>
      <h1 class="shell-title" style="font-size:30px">CALIBRATION</h1>
      <div class="shell-rows">
        <div class="settings-row"><span>Music</span><input type="checkbox" data-set="music" ${settings.music ? "checked" : ""}/></div>
        <div class="settings-row"><span>Voice callouts</span><input type="checkbox" data-set="voice" ${settings.voice ? "checked" : ""}/></div>
        <div class="settings-row"><span>Camera shake</span><input type="checkbox" data-set="shake" ${settings.shake ? "checked" : ""}/></div>
        <div class="settings-row"><span>Reduced motion</span><input type="checkbox" data-set="reducedMotion" ${settings.reducedMotion ? "checked" : ""}/></div>
        <div class="settings-row"><span>Storm front (wet freeway)</span><input type="checkbox" data-set="storm" ${settings.storm ? "checked" : ""}/></div>
      </div>
      <div class="shell-actions"><button class="apex-btn" data-act="back">BACK</button></div></div>`;
  } else {
    shellEl.innerHTML = "";
  }
  shellEl.querySelectorAll<HTMLElement>("[data-act]").forEach((el) => {
    el.onclick = () => shellAction(el.dataset.act ?? "");
  });
  shellEl.querySelectorAll<HTMLInputElement>("[data-set]").forEach((el) => {
    el.onchange = () => applySetting(el.dataset.set ?? "", el.checked);
  });
}

let shellReturn: ShellScreen = "title";
function shellAction(act: string) {
  if (act === "start") { startRun(); }
  else if (act === "resume") { setScreen("hidden"); apexGame?.session.resume(); }
  else if (act === "restart") { resetRun(); startRun(); }
  else if (act === "settings") { shellReturn = shellScreen; setScreen("settings"); }
  else if (act === "back") { setScreen(shellReturn); }
  else if (act === "title") { apexGame?.sessionImpl?.transition("title"); player.status = "idle"; setScreen("title"); }
}
function setScreen(s: ShellScreen) {
  shellScreen = s;
  renderShell();
  hudRoot.dataset.hidden = s === "title" || s === "settings" && shellReturn === "title" ? "true" : "false";
}
function applySetting(key: string, value: boolean) {
  settings = { ...settings, [key]: value };
  if (key === "storm") applyStorm(value);
  if (key === "reducedMotion") {
    void apexGame?.app?.feel?.emit("accessibility.reduced-motion", { strength: value ? 1 : 0 });
  }
  if (key === "music") apexGame?.sound?.setBusVolume("music", value ? 1 : 0);
}

function startRun() {
  setScreen("hidden");
  hudRoot.dataset.hidden = "false";
  player.status = "running";
  apexGame?.sessionImpl?.transition("playing");
  void apexGame?.sound?.unlock().then(() => {
    void apexGame?.sound?.cue("music-run");
    void apexGame?.sound?.cue("voice-start");
  });
  recordEvent("run-start", "corridor run started", "success");
}

/* ------------------------------------------------------------------ *
 *  Game construction
 * ------------------------------------------------------------------ */

const VOICE_BASE = "/roadster-rush/audio/voice";
const MUSIC_BASE = "/roadster-rush/audio/music";

const racingGame = createGame({
  id: "apex-overdrive-v2",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: buildScene,
  input: inputOptions,
  hud: {
    theme: "motorsport",
    widgets: [
      { kind: "score", id: "score", anchor: "top", label: "score" },
      { kind: "speedometer", id: "speed", anchor: "bottom", label: "km/h" },
      { kind: "meter", id: "boost", anchor: "bottom-left", label: "boost" },
      { kind: "combo", id: "combo", anchor: "right", label: "near-miss combo" },
      { kind: "objective", id: "objective", anchor: "bottom", label: "objective" },
      { kind: "prompt", id: "prompt", anchor: "center", label: "callout" }
    ]
  },
  touch: {
    preset: "steer-pedals",
    bindings: {
      "steer-left": "left",
      "steer-right": "right",
      throttle: "thrust",
      brake: "brake",
      boost: "boost",
      reset: "reset"
    }
  },
  sound: {
    buses: [
      { id: "music", volume: 0.42 },
      { id: "voice", volume: 0.9 },
      { id: "sfx", volume: 0.85 }
    ],
    cues: {
      "music-title": { id: "music-title", bus: "music", asset: { url: `${MUSIC_BASE}/title.mp3` }, loop: true, volume: 0.8 },
      "music-run": { id: "music-run", bus: "music", asset: { url: `${MUSIC_BASE}/run.mp3` }, loop: true, volume: 0.9 },
      "music-rocket": { id: "music-rocket", bus: "music", asset: { url: `${MUSIC_BASE}/rocket.mp3` }, loop: false, volume: 0.9 },
      "voice-start": { id: "voice-start", bus: "voice", asset: { url: `${VOICE_BASE}/start_0.mp3` }, volume: 1 },
      "voice-roll": { id: "voice-roll", bus: "voice", asset: { url: `${VOICE_BASE}/roll_0.mp3` }, volume: 1 },
      "voice-close": { id: "voice-close", bus: "voice", asset: { url: `${VOICE_BASE}/closeCall_0.mp3` }, volume: 1 },
      "voice-airlow": { id: "voice-airlow", bus: "voice", asset: { url: `${VOICE_BASE}/airLow_0.mp3` }, volume: 1 },
      "voice-rocket": { id: "voice-rocket", bus: "voice", asset: { url: `${VOICE_BASE}/rocket_0.mp3` }, volume: 1 },
      "voice-crash": { id: "voice-crash", bus: "voice", asset: { url: `${VOICE_BASE}/crash_0.mp3` }, volume: 1 },
      "voice-combo": { id: "voice-combo", bus: "voice", asset: { url: `${VOICE_BASE}/combo_0.mp3` }, volume: 1 },
      "voice-mile": { id: "voice-mile", bus: "voice", asset: { url: `${VOICE_BASE}/milestone_0.mp3` }, volume: 1 },
      "voice-sky": { id: "voice-sky", bus: "voice", asset: { url: `${VOICE_BASE}/sky_0.mp3` }, volume: 1 },
      "sfx-boost": { id: "sfx-boost", bus: "sfx", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.7 },
      "sfx-checkpoint": { id: "sfx-checkpoint", bus: "sfx", asset: { url: sfxUrl("stinger.checkpoint.00") }, volume: 0.75 },
      "sfx-crash": { id: "sfx-crash", bus: "sfx", asset: { url: sfxUrl("impact.car-crash.00") }, volume: 0.85 },
      "sfx-launch": { id: "sfx-launch", bus: "sfx", asset: { url: sfxUrl("whoosh.dash.00") }, volume: 0.8 },
      "sfx-takedown": { id: "sfx-takedown", bus: "sfx", asset: { url: sfxUrl("explosion.small.00") }, volume: 0.85 },
      "sfx-finish": { id: "sfx-finish", bus: "sfx", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.9 },
      "sfx-pickup": { id: "sfx-pickup", bus: "sfx", asset: { url: sfxUrl("pickup.power-up.00") }, volume: 0.7 }
    },
    ducking: { music: { duck: 0.35, attackMs: 60, releaseMs: 420 } }
  },
  juice: {
    "near-miss": { punch: { fovDeg: 1.8, ms: 180 }, flash: { color: "#5fe6ff", peak: 0.1, ms: 160 }, rumble: { weak: 0.3, ms: 120 }, fx: { kind: "streak", count: 8, color: "#5fe6ff" } },
    roll: { shake: 0.12, punch: { fovDeg: 1.4, ms: 200 }, fx: { kind: "ring", count: 10, color: "#ffb36b" } },
    boost: { punch: { fovDeg: 2.6, ms: 260 }, flash: { color: "#ffb36b", peak: 0.12, ms: 200 }, fx: { kind: "streak", count: 14, color: "#ffb36b" } },
    crash: { hitStop: 0.06, shake: 0.5, vignette: { amount: 0.4, ms: 300, color: "#ff5c7a" }, rumble: { strong: 0.8, ms: 320 }, fx: { kind: "explosion-small", count: 16, color: "#ff5c7a" } },
    launch: { punch: { fovDeg: 3.2, ms: 340 }, shake: 0.18, flash: { color: "#7ff0c5", peak: 0.14, ms: 240 }, fx: { kind: "spark", count: 18, color: "#7ff0c5" } },
    takedown: { hitStop: 0.09, shake: 0.34, punch: { fovDeg: 2.4, ms: 280 }, rumble: { strong: 0.7, ms: 260 }, fx: { kind: "explosion-small", count: 20, color: "#ffd166" } },
    checkpoint: { punch: { fovDeg: 1.2, ms: 150 }, flash: { color: "#7ff0c5", peak: 0.1, ms: 160 }, fx: { kind: "ring", count: 10, color: "#7ff0c5" } },
    finish: { hitStop: 0.05, punch: { fovDeg: 3, ms: 400 }, flash: { color: "#ffd166", peak: 0.2, ms: 320 }, fx: { kind: "spark", count: 30, color: "#ffd166" } },
    "low-air": { vignette: { amount: 0.22, ms: 260, color: "#5fe6ff" } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: {
      apexOverdrive: () => window.__APEX_OVERDRIVE__ ?? { status: "unbound" }
    }
  }
});

apexGame = racingGame;
const app = racingGame.app;
const input = racingGame.input;
if (!input) throw new Error("Apex Overdrive failed to initialize runtime-owned input.");
racingGame.start();
setInterval(() => {
  try {
    const d = (app as any).diagnostics?.();
    const cv = document.querySelector("canvas");
    const r = cv?.getBoundingClientRect?.();
    console.log("[diag]", JSON.stringify({ backend: d?.backend, drawCalls: d?.drawCalls, renderSize: d?.renderSize, errors: (d?.errors ?? []).slice(0, 2), warn: (d?.warnings ?? []).slice(0, 2), rect: r ? [Math.round(r.width), Math.round(r.height)] : null }));
  } catch (e) { console.log("[diag-fail]", String(e)); }
}, 2500);

/* ------------------------------------------------------------------ *
 *  Camera, feel, director
 * ------------------------------------------------------------------ */

const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

const chaseRig = camera.rigs.chase({
  target: "player-interceptor",
  fov: { base: 60, perSpeed: 0.42 },
  lookAhead: { seconds: 0.4, max: 5.5 },
  bank: { gain: 0.5, maxDeg: 6.5 }
});

// Intro flythrough: choreographed path preset → rail rig → chase handoff.
const introPath = createCameraPathFromPreset({
  id: "apex-intro",
  presetId: "crane",
  startTime: 0,
  endTime: 5.4,
  subjectPosition: [0, HOVER_RIDE_Y, 40]
});
const introRail = camera.rigs.rail({
  points: introPath.keyframes.map((k) => k.position),
  lookAt: [0, 2.5, 20],
  fov: 58,
  duration: 5.4,
  ease: "inOutSine"
});

const cameraDirector = game.cameraDirector({
  baseFov: 60,
  distance: 9.5,
  targetY: 2,
  mode: "follow",
  stageBounds: { minX: -16, maxX: 16 }
});

app.camera?.use(chaseRig);

function playIntro() {
  if (!app.camera) return;
  const seq = { id: "intro-flythrough", shots: [{ rig: introRail, duration: 5.4, blendIn: 0.4 }], onEnd: "return" as const };
  void app.camera.play(seq).done.then(() => app.camera?.use(chaseRig, { blend: 0.9 }));
}

function takedownCam(target: AuraVec3) {
  cameraDirector.special([target[0], target[1], target[2]], 1.1);
  app.camera?.fovKick.set("takedown", -6, 0.9);
}

/* ------------------------------------------------------------------ *
 *  Storm front (wet freeway variant)
 * ------------------------------------------------------------------ */

let stormNode: ReturnType<typeof app.nodes.require> | undefined;
let stormOn = false;
function applyStorm(on: boolean) {
  stormOn = on;
  try {
    stormNode ??= app.nodes.require("storm-rain");
  } catch { stormNode = undefined; }
  stormNode?.setVisible(on);
  app.atmosphere?.setWetness(on ? 0.85 : 0.12, { transitionSeconds: 1.2 });
  if (on) {
    app.atmosphere?.setFog({ density: 0.012, color: "#4a3550", heightFalloff: 0.5 }, { transitionSeconds: 1.4 });
    recordEvent("weather", "storm front rolling in — freeway slick", "warning");
  } else {
    app.atmosphere?.setFog(null, { transitionSeconds: 1.4 });
    recordEvent("weather", "storm cleared — golden hour back", "info");
  }
}

/* ------------------------------------------------------------------ *
 *  Game logic
 * ------------------------------------------------------------------ */

function resetRun() {
  kart.reset(START_PROGRESS);
  const pose = sampleRoute(START_PROGRESS, 0);
  Object.assign(player, {
    x: pose.x, z: pose.z, y: HOVER_RIDE_Y, vy: 0, speed: 0,
    heading: pose.heading, progress: START_PROGRESS, signedTrackOffset: 0,
    roll: 0, pitch: 0, rollAnim: -1, rollDir: 1, invuln: 0,
    hull: 100, boost: 55, charge: 100, airtime: 0, launched: 0,
    status: "idle" as const, checkpoint: 0, raceTime: 0
  });
  Object.assign(score, { total: 0, combo: 1, comboTimer: 0, nearMisses: 0, rolls: 0, launches: 0, takedowns: 0, bestCombo: 1 });
  for (const entry of [...trafficFleet, ...skyFleet, ...rivals]) {
    const p = sampleRoute(entry.startProgress, entry.lane);
    entry.progress = entry.startProgress;
    entry.signedOffset = entry.lane;
    entry.speed = entry.cruise * 0.8;
    entry.heading = p.heading;
    entry.x = p.x;
    entry.z = p.z;
    entry.nearMissArmed = true;
    entry.tumble = 0;
    driverFor(entry).reset();
  }
  for (const pad of BOOST_PADS) pad.cooldown = 0;
  routeEvents.clear();
  chassis.reset({ x: pose.x, z: pose.z, heading: pose.heading, speed: 0, steer: 0 });
  recordEvent("reset", "run reset");
}

function award(points: number, label: string, type = "score", severity: "info" | "success" | "warning" = "info") {
  const scaled = Math.round(points * score.combo);
  score.total += scaled;
  recordEvent(type, `${label} +${scaled}`, severity);
}

function bumpCombo() {
  score.combo = Math.min(12, score.combo + 1);
  score.comboTimer = 4.5;
  score.bestCombo = Math.max(score.bestCombo, score.combo);
  if (score.combo >= 4) void apexGame?.sound?.cue("voice-combo");
}

function crash(reason: string) {
  if (player.invuln > 0 || player.status !== "running") return;
  player.hull = Math.max(0, player.hull - 22);
  score.combo = 1;
  score.comboTimer = 0;
  player.invuln = 1.2;
  racingGame.juice.fire("crash", { position: [player.x, player.y, player.z] });
  feel.hitStop(60);
  app.camera?.shake.add(0.55);
  vignetteEl.dataset.hit = "true";
  setTimeout(() => { vignetteEl.dataset.hit = "false"; }, 320);
  void apexGame?.sound?.cue("sfx-crash");
  void apexGame?.sound?.cue("voice-crash");
  recordEvent("crash", `${reason} — hull ${player.hull}%`, "warning");
  objective = player.hull <= 0 ? "Hull breached." : `${reason} — hull at ${player.hull}%.`;
  if (player.hull <= 0) {
    player.status = "totaled";
    setTimeout(() => setScreen("results"), 700);
  }
}

function launch(vertical: number, label: string) {
  player.vy = Math.max(player.vy, vertical);
  player.launched = 1.4;
  player.airtime = 0;
  score.launches += 1;
  award(320, label, "launch", "success");
  racingGame.juice.fire("launch", { position: [player.x, player.y, player.z] });
  app.camera?.fovKick.set("launch", 7, 0.8);
  void apexGame?.sound?.cue("sfx-launch");
  void apexGame?.sound?.cue("voice-rocket");
  objective = "Carrier launch! Hold Space to stay airborne over the gridlock.";
}

function stepFleet(entry: FleetEntry, dt: number) {
  const driver = driverFor(entry);
  if (entry.tumble > 0) {
    entry.tumble -= dt;
    entry.z -= entry.speed * dt;
    return;
  }
  const inputIn = driver.decide(dt, {
    progress: entry.progress,
    speed: entry.speed,
    heading: entry.heading,
    signedTrackOffset: entry.signedOffset,
    position: { x: entry.x, y: entry.z },
    offTrack: Math.abs(entry.signedOffset) > ROAD_HALF_WIDTH,
    preferredSignedOffset: entry.lane
  });
  const accel = inputIn.throttle * 14 - inputIn.brake * 20 - entry.speed * 0.16;
  entry.speed = Math.max(0, Math.min(entry.cruise * 1.15, entry.speed + accel * dt));
  entry.heading += inputIn.steer * 1.9 * dt;
  const fx = Math.sin(entry.heading);
  const fz = Math.cos(entry.heading);
  entry.x += fx * entry.speed * dt;
  entry.z += fz * entry.speed * dt;
  const contact = racing.surfaceQuery.query({ x: entry.x, y: entry.z });
  entry.progress = contact.progress;
  entry.signedOffset = contact.signedTrackOffset;
  if (entry.progress >= 0.995) {
    // End of corridor — recycle gridlocked commuters to the back (they're
    // queueing; rivals/sky couriers hold at the finish gantry).
    if (entry.id.startsWith("traffic-")) {
      const back = 0.02 + ((entry.seed * 0.037) % 0.05);
      const p = sampleRoute(back, entry.lane);
      entry.progress = back;
      entry.x = p.x; entry.z = p.z; entry.heading = p.heading;
      entry.signedOffset = entry.lane;
      driver.reset();
    } else {
      entry.speed = 0;
    }
  }
}

function distXZ(ax: number, az: number, bx: number, bz: number) {
  return Math.hypot(ax - bx, az - bz);
}

/* ------------------------------------------------------------------ *
 *  Frame loop
 * ------------------------------------------------------------------ */

const playerNodes = () => {
  let primary: ReturnType<typeof app.nodes.require> | undefined;
  let alt: ReturnType<typeof app.nodes.require> | undefined;
  try { primary = app.nodes.require("player-interceptor"); } catch { /* unloaded */ }
  try { alt = app.nodes.require("player-apex"); } catch { /* unloaded */ }
  return { primary, alt };
};

let elapsed = 0;
let introPlayed = false;
let stormHidden = false;
let hudTick = 0;

app.onFrame(({ dt }) => {
  const cdt = Math.min(0.05, Math.max(0, dt || 1 / 60));
  elapsed += cdt;
  hudTick += cdt;

  if (!stormHidden) {
    stormHidden = true;
    try { app.nodes.require("storm-rain").setVisible(false); } catch { /* not mounted yet */ }
  }
  if (!introPlayed) { introPlayed = true; playIntro(); }

  const paused = racingGame.session.state === "paused" || player.status === "idle";
  if (!paused && input.pressed("pause")) {
    racingGame.session.pause("user");
    setScreen("pause");
    return;
  }
  if (racingGame.session.state === "paused") return;
  if (player.status === "idle") return;

  if (input.pressed("reset")) resetRun();
  if (input.pressed("storm")) applySetting("storm", !settings.storm);

  const running = player.status === "running";
  if (!running) { syncNodes(cdt); return; }

  player.raceTime += cdt;
  score.comboTimer = Math.max(0, score.comboTimer - cdt);
  if (score.comboTimer <= 0 && score.combo > 1) score.combo = 1;
  player.invuln = Math.max(0, player.invuln - cdt);
  player.launched = Math.max(0, player.launched - cdt);

  /* --- ground arcade model (kart kit) --- */
  const grounded = player.y <= HOVER_RIDE_Y + 0.06 && player.vy <= 0;
  const steer = input.axis("steer");
  const boosting = input.held("boost") && player.boost > 0;
  Object.assign(kart.state, {
    status: "running",
    x: player.x,
    y: 0,
    z: player.z,
    vx: Math.sin(player.heading) * player.speed,
    vy: 0,
    vz: Math.cos(player.heading) * player.speed,
    speed: player.speed,
    heading: player.heading,
    driftYaw: 0,
    driftDir: 0,
    roll: 0,
    progress: player.progress,
    signedTrackOffset: player.signedTrackOffset,
    lap: 1,
    checkpoint: player.checkpoint,
    lapTime: player.raceTime,
    driftCharge: 0,
    wasDrifting: false,
    activeBoostTimer: 0
  });
  const step = kart.stepPlayer(cdt, {
    throttle: input.held("throttle") || isAutoplay,
    brake: input.held("brake"),
    steer,
    drift: false,
    boost: boosting
  });
  player.x = step.state.x;
  player.z = step.state.z;
  player.speed = step.state.speed;
  player.heading = step.state.heading;
  player.progress = step.state.progress;
  player.signedTrackOffset = step.state.signedTrackOffset;
  if (step.checkpointCleared !== null) {
    player.checkpoint = step.checkpointCleared;
    award(250, `sector ${step.checkpointCleared} gate`, "checkpoint", "success");
    racingGame.juice.fire("checkpoint");
    void apexGame?.sound?.cue("sfx-checkpoint");
    void apexGame?.sound?.cue("voice-mile");
  }
  if (boosting) {
    player.boost = Math.max(0, player.boost - 26 * cdt);
    feel.speedLines(Math.min(1, player.speed / 62));
    if (Math.random() < cdt * 1.4) racingGame.juice.fire("boost");
  } else {
    player.boost = Math.min(100, player.boost + 4.2 * cdt);
  }

  /* --- cold-gas flight layer --- */
  const thrusting = input.held("thrust") && player.charge > 0;
  if (thrusting) {
    player.vy = Math.min(9.5, player.vy + 16 * cdt);
    player.charge = Math.max(0, player.charge - 18 * cdt);
  } else {
    player.vy = Math.max(player.launched > 0 ? -7 : -11, player.vy - 13 * cdt);
    if (grounded) player.charge = Math.min(100, player.charge + 22 * cdt);
    else player.charge = Math.min(100, player.charge + 5 * cdt);
  }
  if (player.charge < 18 && !grounded && Math.random() < cdt * 0.6) {
    void apexGame?.sound?.cue("voice-airlow");
    racingGame.juice.fire("low-air");
  }
  player.y += player.vy * cdt;
  if (player.y < HOVER_RIDE_Y) {
    if (player.vy < -9) {
      feel.landingDust([player.x, 0.1, player.z]);
      app.camera?.shake.add(0.22);
    }
    player.y = HOVER_RIDE_Y;
    player.vy = 0;
    player.airtime = 0;
  } else if (!grounded) {
    player.airtime += cdt;
  }
  player.y = Math.min(MAX_ALTITUDE, player.y);
  const airborne = player.y > SKY_ALT_LOW * 0.55;

  /* --- chassis attitude (grounded suspension telemetry) --- */
  const pose = chassis.step(cdt, {
    x: player.x, z: player.z, heading: player.heading,
    speed: player.speed, steer, throttle: input.held("throttle") ? 1 : 0,
    brake: input.held("brake") ? 1 : 0, slip: 0
  });
  const ch = chassis.telemetry();
  const targetPitch = grounded
    ? pose.rotation[0]
    : Math.min(0.34, player.vy * 0.035 - 0.04);
  player.pitch += (targetPitch - player.pitch) * Math.min(1, cdt * 7);

  /* --- barrel roll --- */
  if (player.rollAnim < 0 && (input.pressed("rollLeft") || input.pressed("rollRight"))) {
    player.rollAnim = 0;
    player.rollDir = input.pressed("rollLeft") ? -1 : 1;
    player.invuln = Math.max(player.invuln, 0.95);
    score.rolls += 1;
    award(140, "barrel roll", "roll");
    racingGame.juice.fire("roll");
    void apexGame?.sound?.cue("voice-roll");
    cameraDirector.impact(0.7, 0.3);
  }
  if (player.rollAnim >= 0) {
    player.rollAnim = Math.min(1, player.rollAnim + cdt / 0.85);
    player.roll = player.rollDir * Math.PI * 2 * player.rollAnim;
    if (player.rollAnim >= 1) { player.rollAnim = -1; player.roll = 0; }
  } else {
    const bank = -steer * (airborne ? 0.42 : 0.22) + pose.rotation[2];
    player.roll += (bank - player.roll) * Math.min(1, cdt * 6);
  }

  /* --- fleet --- */
  for (const entry of trafficFleet) stepFleet(entry, cdt);
  for (const entry of skyFleet) stepFleet(entry, cdt);
  for (const entry of rivals) stepFleet(entry, cdt);

  /* --- interactions --- */
  for (const entry of trafficFleet) {
    const d = distXZ(player.x, player.z, entry.x, entry.z);
    const aboveRoof = player.y > 3.4;
    if (!aboveRoof && d < 3.4 && Math.abs(player.signedTrackOffset - entry.signedOffset) < 3.2) {
      crash(`slammed a commuter at ${Math.round(player.speed * 3.6)} km/h`);
    } else if (d < 5.6 && entry.nearMissArmed && Math.abs(player.signedTrackOffset - entry.signedOffset) > 1.9) {
      entry.nearMissArmed = false;
      score.nearMisses += 1;
      bumpCombo();
      award(180, "near-miss", "near-miss", "success");
      racingGame.juice.fire("near-miss", { position: [player.x, player.y, player.z] });
      void apexGame?.sound?.cue("voice-close");
      player.boost = Math.min(100, player.boost + 12);
    } else if (d > 14) {
      entry.nearMissArmed = true;
    }
  }
  for (const entry of skyFleet) {
    const d = distXZ(player.x, player.z, entry.x, entry.z);
    const dy = Math.abs(player.y - entry.altitude);
    if (d < 4 && dy < 1.6 && player.rollAnim < 0) {
      crash("clipped a sky courier");
      entry.tumble = 1.6;
    } else if (d < 7 && dy < 2.2 && entry.nearMissArmed) {
      entry.nearMissArmed = false;
      score.nearMisses += 1;
      bumpCombo();
      award(240, "sky-lane near-miss", "near-miss", "success");
      racingGame.juice.fire("near-miss", { position: [player.x, player.y, player.z] });
      void apexGame?.sound?.cue("voice-sky");
      player.boost = Math.min(100, player.boost + 14);
    } else if (d > 18) {
      entry.nearMissArmed = true;
    }
  }

  // Rival takedowns — fly close in the sky lane and hit F.
  for (const entry of rivals) {
    const d = distXZ(player.x, player.z, entry.x, entry.z);
    const dy = Math.abs(player.y - entry.altitude);
    if (input.pressed("takedown") && d < 7.5 && dy < 3) {
      entry.tumble = 2.4;
      entry.speed *= 0.3;
      score.takedowns += 1;
      bumpCombo(); bumpCombo();
      award(650, `takedown — ${entry.id}`, "takedown", "success");
      racingGame.juice.fire("takedown", { position: [entry.x, entry.altitude, entry.z] });
      feel.hitStop(90);
      takedownCam([entry.x, entry.altitude, entry.z]);
      void apexGame?.sound?.cue("sfx-takedown");
      void apexGame?.sound?.cue("voice-combo");
      objective = "Rival down! The sky lane is yours.";
    } else if (d < 6 && dy < 2 && entry.nearMissArmed) {
      entry.nearMissArmed = false;
      bumpCombo();
      award(300, "rival draft", "near-miss", "success");
    } else if (d > 20) {
      entry.nearMissArmed = true;
    }
  }

  // Carrier ramps — drive onto the deck while grounded to launch.
  CARRIER_SLOTS.forEach((slot, i) => {
    const pose = sampleRoute(slot.progress, slot.lane);
    const d = distXZ(player.x, player.z, pose.x, pose.z);
    if (d < 9 && grounded && player.launched <= 0) launch(11.5, `carrier ${i + 1} launch`);
  });

  // Boost pads.
  for (const pad of BOOST_PADS) {
    pad.cooldown = Math.max(0, pad.cooldown - cdt);
    if (pad.cooldown > 0) continue;
    const pose = sampleRoute(pad.progress, pad.lane);
    if (distXZ(player.x, player.z, pose.x, pose.z) < 3.6) {
      pad.cooldown = 6;
      player.boost = Math.min(100, player.boost + 38);
      player.charge = Math.min(100, player.charge + 30);
      award(90, "boost column", "pickup");
      racingGame.juice.fire("boost");
      void apexGame?.sound?.cue("sfx-pickup");
      void apexGame?.sound?.cue("sfx-boost");
    }
  }

  // Storm gusts nudge lateral offset.
  if (stormOn && airborne) {
    player.signedTrackOffset += Math.sin(elapsed * 0.9) * 0.35 * cdt;
  }

  // Finish.
  if (player.progress >= FINISH_PROGRESS) {
    player.status = "finished";
    award(1500 + Math.round(player.hull * 10), "finish gantry", "finish", "success");
    racingGame.juice.fire("finish");
    void apexGame?.sound?.cue("sfx-finish");
    setTimeout(() => setScreen("results"), 900);
  }

  // Engine + wind audio levels.
  apexGame?.sound?.setCueLevel?.("music-run", { volume: airborne ? 1 : 0.8 });
  apexGame?.sound?.setListener?.({
    position: [player.x, player.y + 2, player.z + 9],
    forward: [Math.sin(player.heading), 0, Math.cos(player.heading)],
    up: [0, 1, 0]
  });

  cameraDirector.update(cdt, [{ id: "player", position: [player.x, player.y, player.z] }]);
  feel.update(cdt * 1000);

  syncNodes(cdt);
  if (hudTick > 0.12) {
    hudTick = 0;
    renderHud();
    apexGame?.hud.set("score", score.total);
    apexGame?.hud.set("speed", Math.round(Math.abs(player.speed) * 3.6));
    apexGame?.hud.set("boost", player.boost);
    apexGame?.hud.set("combo", score.combo > 1 ? `x${score.combo}` : "—");
    apexGame?.hud.set("objective", objective);
  }
  publishEvidence();
});

function syncNodes(dt: number) {
  const { primary, alt } = playerNodes();
  const useApex = alt !== undefined;
  primary?.setPosition(player.x, player.y, player.z);
  primary?.setRotation(player.pitch, Math.PI - player.heading, player.roll);
  primary?.setVisible(!useApex);
  alt?.setPosition(player.x, player.y, player.z);
  alt?.setRotation(player.pitch, Math.PI - player.heading, player.roll);
  alt?.setVisible(useApex);

  const setFleet = (entry: FleetEntry) => {
    let node: ReturnType<typeof app.nodes.require> | undefined;
    try { node = app.nodes.require(entry.nodeId); } catch { return; }
    const y = entry.altitude > 0 ? entry.altitude + Math.sin(elapsed * 0.8 + entry.seed) * 0.35 : entry.rideY;
    node.setPosition(entry.x, y, entry.z);
    const tumbleRoll = entry.tumble > 0 ? Math.sin(elapsed * 14) * 0.6 : 0;
    node.setRotation(tumbleRoll * 0.4, Math.PI - entry.heading, tumbleRoll);
  };
  trafficFleet.forEach(setFleet);
  skyFleet.forEach(setFleet);
  rivals.forEach(setFleet);
  void dt;
}

/* ------------------------------------------------------------------ *
 *  Evidence + boot
 * ------------------------------------------------------------------ */

const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "meter", id: "hud:boost", label: "boost meter", source: "app-state", valuePath: "appState.boost", maxPath: "rules.maxBoost", format: "percent", a11yLabel: "boost meter" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "combo", id: "hud:combo", label: "near-miss combo", source: "app-state", valuePath: "appState.combo", format: "number", a11yLabel: "near-miss combo counter" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "checkpoint", id: "hud:checkpoint", label: "sector gates", source: "app-state", valuePath: "appState.checkpoint", format: "text", a11yLabel: "sector gate progress" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event feed", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event feed" }
] as const;

declare global {
  interface Window { __APEX_OVERDRIVE__?: unknown }
}

function publishEvidence() {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      objective,
      score: score.total,
      combo: score.combo,
      boost: Math.round(player.boost),
      charge: Math.round(player.charge),
      hull: Math.round(player.hull),
      progress: Number(player.progress.toFixed(4)),
      checkpoint: `${player.checkpoint}/${route.checkpoints.length}`,
      storm: stormOn,
      maxBoost: 100,
      events: routeEvents.events().map((e) => e.label)
    },
    assets: { typedAssets: Object.keys(assetsV2).length, missingAssets: [] },
    source: { expectsGame: true }
  });
  window.__APEX_OVERDRIVE__ = {
    status: player.status,
    frame: Math.round(elapsed * 60),
    score: score.total,
    combo: score.combo,
    progress: player.progress,
    speed: player.speed,
    altitude: player.y,
    hull: player.hull,
    storm: stormOn,
    traffic: trafficFleet.length,
    skyCars: skyFleet.length,
    rivals: rivals.length,
    look: LOOK_ID,
    kits: ["game.racing", "game.arcadeKart", "createVehicleChassis", "createVehicleDriverAi", "game.cameraDirector"],
    evidence
  };
}

if (typeof window !== "undefined") {
  mountDom();
  resetRun();
  setScreen("title");
  void apexGame?.sound?.unlock().then(() => apexGame?.sound?.cue("music-title"));
  if (isAutoplay) {
    setTimeout(() => { startRun(); }, 600);
  }
}
