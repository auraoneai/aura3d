// Patrol Wing — B5 PORT: salvaged flight core on a fresh single-path scene.
// Single code path: every URL boots this module; the former legacy/v2
// dispatcher is deleted. Gameplay is the salvaged `src/gameplay/**` surface
// (flight/patrol/drones/weapons/ghost) plus the extracted course data and
// Rapier sensor layer; the scene, HUD, input, and evidence are new.
import {
  game,
  instances,
  looks,
  material,
  primitives,
  type AuraRuntimeNodeHandle,
  type AuraSceneNode,
  type AuraSceneSnapshot
} from "@aura3d/engine";
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the sci-fi-telemetry HUD theme, the flight touch preset, and sfx cues.
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";
import { createArenaPhysics, type ArenaPhysics } from "./gameplay/arena-physics";
import {
  PAD_CENTER,
  PAD_HEADING_YAW,
  PAD_RADIUS,
  PAD_Y,
  RING_GATES,
  terrainSurface,
  type RingGate
} from "./gameplay/course-data";
import { createDroneSwarm, ORB_DAMAGE } from "./gameplay/drones";
import { FlightModel, FLIGHT_DT, type FlightInput, type FlightOutcome } from "./gameplay/flight";
import { GhostPlayer, GhostRecorder } from "./gameplay/ghost";
import {
  droneSpeed,
  gradePatrol,
  gradeRank,
  PATROL_COUNT,
  RingTracker,
  ringHalfExtent,
  waveSpawns,
  WAVE_TRIGGERS,
  WAVES_PER_PATROL,
  type GradeBreakdown,
  type PatrolGrade
} from "./gameplay/patrol";
import { Cannon, encodeControlFrame } from "./gameplay/weapons";
import {
  buildPatrolScene,
  createPatrolRig,
  DRONE_NODE_COUNT,
  LOOK_CATEGORY,
  LOOK_ID,
  ORB_NODE_COUNT,
  RING_ACTIVE,
  RING_PASSED,
  RING_QUEUED,
  type PatrolRigState
} from "./scene";

declare global {
  interface Window {
    __aura3dGameSnapshot?: PatrolWingEvidence;
    __AURA3D_SHOWCASE_PATROL_WING__?: PatrolWingEvidence;
  }
}

type SortieState = "preflight" | "patrol" | "graded" | "incomplete" | "crashed" | "shot-down" | "complete";

interface PatrolWingEvidence {
  readonly framed: boolean;
  readonly state: SortieState;
  readonly frame: number;
  readonly score: number;
  readonly patrol: number;
  readonly grade: PatrolGrade | null;
  readonly backend: string;
  readonly drawCalls: number;
  readonly look: { readonly id: string; readonly category: string };
  readonly flight: {
    readonly position: readonly [number, number, number];
    readonly altitude: number;
    readonly speed: number;
    readonly throttle: number;
    readonly stalled: boolean;
    readonly grounded: string;
    readonly trajectoryHash: string;
  };
  readonly rings: {
    readonly nextRing: number;
    readonly gatesCleared: number;
    readonly validity: boolean;
    readonly complete: boolean;
  };
  readonly hull: { readonly value: number; readonly max: number; readonly fraction: number };
  readonly drones: {
    readonly liveCount: number;
    readonly downCount: number;
    readonly spawnedCount: number;
    readonly positions: readonly { readonly id: string; readonly position: readonly [number, number, number] }[];
  };
  readonly cannon: { readonly shotsFired: number; readonly shotsHit: number; readonly accuracy: number };
  readonly ghost: { readonly recorded: boolean; readonly frames: number; readonly playing: boolean; readonly scriptHash: string | null };
  readonly fx: { readonly liveCount: number };
  readonly events: readonly string[];
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

const HULL_MAX = 100;
const BOUNCE_SCRAPE = 6;
const LANDING = { padCenter: PAD_CENTER, padY: PAD_Y, padRadius: PAD_RADIUS } as const;
const SPAWN = { position: [PAD_CENTER[0], PAD_Y + 0.42, PAD_CENTER[2]] as const, headingYaw: PAD_HEADING_YAW };

// Three.js-grade coastal palette and PBR materials (replacing heavy peach fog wash).
const DEEP_MARINE_OCEAN_MAT = material.reflectiveFloor({
  name: "deep marine ocean",
  color: "#062846",
  roughness: 0.08,
  metallic: 0.35,
  clearcoat: 0.9,
  clearcoatRoughness: 0.04
});
const OCEAN_CYAN_GLINT_MAT = material.lacquer({
  name: "ocean cyan wake glint",
  color: "#0c4a6e",
  roughness: 0.05,
  clearcoat: 0.95,
  clearcoatRoughness: 0.03
});
const OCEAN_WAKE_FOAM_MAT = material.ceramic({
  name: "cyan white surf foam",
  color: "#e0f2fe",
  roughness: 0.22,
  clearcoat: 0.65
});
const BASALT_CLIFF_MAT = material.ceramic({
  name: "dark basalt cliffs",
  color: "#1e293b",
  roughness: 0.65
});
const EMERALD_FOLIAGE_MAT = material.lacquer({
  name: "lush emerald island foliage",
  color: "#14532d",
  roughness: 0.35,
  clearcoat: 0.4
});
const SANDY_COVE_MAT = material.matteClay({
  name: "sandy coastal coves",
  color: "#d6b485",
  roughness: 0.76
});
const AIRCRAFT_SILVER_FUSELAGE_MAT = material.brushedMetal({
  name: "sleek silver fuselage",
  color: "#cbd5e1",
  roughness: 0.24
});
const AIRCRAFT_NAVY_TRIM_MAT = material.carPaint({
  name: "sleek navy wing trim",
  color: "#0284c7",
  roughness: 0.22,
  clearcoat: 0.95
});
const CYAN_THRUSTER_GLOW_MAT = material.neon({
  name: "bright cyan thruster glow",
  color: "#22d3ee",
  emissive: "#22d3ee",
  emissiveIntensity: 2.6,
  practical: true
});
const RING_CHROME_ARCH_MAT = material.brushedMetal({
  name: "ring gate chrome arch",
  color: "#e2e8f0",
  roughness: 0.16,
  clearcoat: 0.85
});
const RING_AMBER_NEON_MAT = material.neon({
  name: "ring active amber neon",
  color: "#fbbf24",
  emissive: "#fbbf24",
  emissiveIntensity: 2.4,
  practical: true
});
const RING_CYAN_NEON_MAT = material.neon({
  name: "ring queued cyan neon",
  color: "#22d3ee",
  emissive: "#22d3ee",
  emissiveIntensity: 2.0,
  practical: true
});
const RING_PASSED_NEON_MAT = material.neon({
  name: "ring passed emerald neon",
  color: "#34d399",
  emissive: "#34d399",
  emissiveIntensity: 1.8,
  practical: true
});
void RING_ACTIVE;
void RING_QUEUED;
void RING_PASSED;

function buildUpgradedPatrolScene(): AuraSceneSnapshot {
  const base = buildPatrolScene().toJSON();
  const lookOverrideRaw = looks.preset(LOOK_ID, {
    fogDensityScale: 0.04,
    background: "#0b2545",
    accent: "#22d3ee",
    exposureEv: 0.05,
    sun: { elevationDeg: 32, azimuthDeg: 38 }
  });
  const lookOverrideGroup = typeof (lookOverrideRaw as { toJSON?: () => AuraSceneNode }).toJSON === "function"
    ? (lookOverrideRaw as { toJSON: () => AuraSceneNode }).toJSON()
    : (lookOverrideRaw as unknown as AuraSceneNode);

  const upgradedNodes: AuraSceneNode[] = base.nodes.map((node): AuraSceneNode => {
    const name = "name" in node ? node.name : undefined;
    if ((node.kind === "group" && name === `aura-look:${LOOK_ID}`) || (node as { kind?: string }).kind === "look") {
      return lookOverrideGroup;
    }
    if (node.kind === "light" && name === "evening sun key") {
      return { ...node, color: "#bae6fd", intensity: 1.35 };
    }
    if (node.kind === "primitive") {
      if (name === "ocean") return { ...node, material: DEEP_MARINE_OCEAN_MAT };
      if (name?.startsWith("ocean-glint-")) return { ...node, material: OCEAN_CYAN_GLINT_MAT };
      if (name === "shoreline-foam-ring") return { ...node, material: OCEAN_WAKE_FOAM_MAT };
      if (name === "island-terrain" || name?.startsWith("foliage-ridge-")) {
        return { ...node, material: EMERALD_FOLIAGE_MAT };
      }
      if (name === "island-cliff-skirt" || name?.startsWith("sea-stack-")) {
        return { ...node, material: BASALT_CLIFF_MAT };
      }
      if (name === "plane-afterburner") {
        return { ...node, material: CYAN_THRUSTER_GLOW_MAT };
      }
      if (name?.startsWith("ring-")) {
        return { ...node, material: name === "ring-0" ? RING_AMBER_NEON_MAT : RING_CYAN_NEON_MAT };
      }
    }
    return node;
  });

  const extraNodes: AuraSceneNode[] = [
    // Sandy coves (#d6b485) framing the basalt cliffs and emerald terraces
    instances
      .cylinder({
        name: "sandy-coves-terrace",
        material: SANDY_COVE_MAT,
        castShadow: false,
        receiveShadow: true,
        transforms: [
          { position: [0, 0.14, 0], scale: [48.4, 0.22, 48.4] },
          { position: [-14, 0.26, 15], scale: [14.5, 0.28, 10.5] },
          { position: [15, 0.24, -14], scale: [13.0, 0.26, 9.5] },
          { position: [-18, 0.22, -12], scale: [11.5, 0.24, 9.0] }
        ]
      })
      .toJSON(),
    // Cyan/white wake & surf foam streaks across the deep marine ocean
    instances
      .box({
        name: "ocean-wake-foam-accents",
        material: OCEAN_WAKE_FOAM_MAT,
        castShadow: false,
        receiveShadow: false,
        transforms: [
          { position: [-22, 0.05, 16.8], rotation: [0, 0.08, 0], scale: [14.0, 0.03, 0.55] },
          { position: [-36, 0.05, 12.2], rotation: [0, 0.28, 0], scale: [16.0, 0.03, 0.65] },
          { position: [-34, 0.06, -14], rotation: [0, 0.4, 0], scale: [9.2, 0.04, 7.8] },
          { position: [-16, 0.06, -34], rotation: [0, 2.1, 0], scale: [9.8, 0.04, 8.2] },
          { position: [26, 0.06, -32], rotation: [0, 0.8, 0], scale: [8.8, 0.04, 7.4] },
          { position: [38, 0.06, 4], rotation: [0, 1.7, 0], scale: [8.4, 0.04, 9.0] }
        ]
      })
      .toJSON(),
    // High-contrast brushed-metal/chrome outer arches around each glowing neon ring gate
    instances
      .torus({
        name: "ring-gate-chrome-arches",
        material: RING_CHROME_ARCH_MAT,
        castShadow: false,
        receiveShadow: true,
        transforms: RING_GATES.map((gate) => ({
          position: [gate.position[0], gate.position[1], gate.position[2]] as [number, number, number],
          rotation: [0, gate.yaw, 0] as [number, number, number],
          scale: [gate.radius * 2.26, gate.radius * 2.26, gate.radius * 0.55] as [number, number, number]
        }))
      })
      .toJSON(),
    // Sleek silver fuselage spine & navy car-paint wing trim synced to the aircraft
    primitives
      .capsule({ name: "airframe-silver-fuselage", material: AIRCRAFT_SILVER_FUSELAGE_MAT, castShadow: true })
      .position(SPAWN.position[0], SPAWN.position[1] + 0.08, SPAWN.position[2])
      .scale([0.36, 2.5, 0.36])
      .runtime(game.runtimeNode("airframe-silver-fuselage", { tags: ["airframe-trim"] }))
      .toJSON(),
    primitives
      .box({ name: "airframe-navy-wing", material: AIRCRAFT_NAVY_TRIM_MAT, castShadow: true })
      .position(SPAWN.position[0], SPAWN.position[1] + 0.04, SPAWN.position[2])
      .scale([0.92, 0.08, 3.65])
      .runtime(game.runtimeNode("airframe-navy-wing", { tags: ["airframe-trim"] }))
      .toJSON()
  ];

  return {
    ...base,
    background: "#0b2545",
    nodes: [...upgradedNodes, ...extraNodes]
  };
}

// --------------------------------------------------------------------- sim ---
let flight = new FlightModel({ ...SPAWN, grounded: "preflight" });
const rings = new RingTracker();
const cannon = new Cannon();
const { swarm } = createDroneSwarm();
let arena: ArenaPhysics = createArenaPhysics(ringHalfExtent(1));
const ghostRecorder = new GhostRecorder();
let ghostPlayer: GhostPlayer | null = null;
let bestRun: { readonly grade: PatrolGrade; readonly script: readonly number[] } | null = null;
let lastScript: readonly number[] = [];
const routeEvents = game.eventLog({ label: "patrol wing events", maxEvents: 18 });
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "score", id: "hud:score", label: "score", source: "app-state", valuePath: "appState.score", format: "number", a11yLabel: "score" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

// Latest published snapshot, read by the createGame evidence section below.
let latestSnapshot: PatrolWingEvidence | undefined;

Object.defineProperty(window, "__AURA3D_SHOWCASE_PATROL_WING__", {
  configurable: true,
  get: () => latestSnapshot
});

const patrolGame = createGame({
  id: "showcase-patrol-wing",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildUpgradedPatrolScene(),
  input: {
    actions: {
      // Salvaged flight mapping (flight.ts): S/W pitch, A/D roll, Q/E yaw,
      // Shift/Ctrl throttle. Arrows alias pitch/roll for keyboard-only play.
      pitchUp: ["KeyS", "ArrowDown"],
      pitchDown: ["KeyW", "ArrowUp"],
      rollLeft: ["KeyA", "ArrowLeft"],
      rollRight: ["KeyD", "ArrowRight"],
      yawLeft: ["KeyQ"],
      yawRight: ["KeyE"],
      throttleUp: ["ShiftLeft", "ShiftRight"],
      throttleDown: ["ControlLeft", "ControlRight"],
      fire: ["Space"],
      reset: ["KeyR"],
      pause: ["KeyP", "Escape"]
    },
    bufferMs: 100
  },
  hud: {
    theme: "sci-fi-telemetry",
    // The meter widget reads `max` at runtime (HudMeterSpec) but the C-24
    // HudWidgetSpec contract type does not declare it (#1086), so the spec
    // list is widened at this one boundary. Hull max is 100 (> 0).
    widgets: [
      { id: "score", kind: "score", anchor: "top-left", label: "SCORE" },
      { id: "speed", kind: "speedometer", anchor: "bottom", label: "AIRSPEED" },
      { id: "objective", kind: "objective", anchor: "top", label: "MISSION" },
      { id: "hull", kind: "meter", max: 100, anchor: "top-right", label: "HULL" }
    ] as unknown as readonly { readonly id: string; readonly kind: string; readonly anchor: "top-left" | "bottom" | "top" | "top-right"; readonly label?: string }[]
  },
  touch: {
    preset: "flight",
    bindings: {
      "stick.up": "pitchDown",
      "stick.down": "pitchUp",
      "stick.left": "rollLeft",
      "stick.right": "rollRight",
      fire: "fire",
      throttle: "throttleUp",
      pause: "pause"
    }
  },
  sound: {
    cues: {
      // art/direction.ts audio[] events on the sfx-pack asset mechanism.
      // "wind-speed" is a continuous bed with no honest discrete cue point
      // in this rebuild and is never requested (see dispatch spec, S11).
      "engine-rpm": { id: "engine-rpm", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.22, loop: true },
      "wind-speed": { id: "wind-speed", asset: { url: sfxUrl("ambience.interior-hum") }, volume: 0.15, loop: true },
      gunfire: { id: "gunfire", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      "drone-destroyed": { id: "drone-destroyed", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.65 },
      "ring-clear": { id: "ring-clear", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.7 }
    }
  },
  juice: {
    "ring-clear": { flash: { color: "#59d7ff", peak: 0.18, ms: 220 }, punch: { fovDeg: 1.4, ms: 200 } },
    "drone-down": { shake: 0.2, rumble: { weak: 0.4, ms: 160 } },
    crashed: { flash: { color: "#ff5d4d", peak: 0.3, ms: 400 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { patrolWing: () => latestSnapshot ?? { status: "unbound" } }
  }
});
const app = patrolGame.app;
const rawInput = patrolGame.input;
if (!rawInput) throw new Error("patrol-wing failed to create runtime-owned input.");
const input = rawInput;
// Drive the createGame lifecycle: start() transitions the session
// booting -> loading -> playing after the first presented draw.
patrolGame.start();
void patrolGame.sound?.cue("engine-rpm");

// ------------------------------------------------------------------- state ---
const DIRECTION_AUDIO_EVENTS = new Set(["engine-rpm", "wind-speed", "gunfire", "drone-destroyed", "ring-clear"]);
const requestedAudioEvents = new Set<string>(["engine-rpm"]);
const playedAudioEvents = new Set<string>();
const handles = new Map<string, AuraRuntimeNodeHandle | undefined>();
const rigState: PatrolRigState = {
  position: [SPAWN.position[0], SPAWN.position[1], SPAWN.position[2]],
  forward: [-1, 0, 0],
  up: [0, 1, 0]
};
const rig = createPatrolRig(rigState);
app.camera?.use(rig);

let state: SortieState = "preflight";
let patrol = 1;
let hull = HULL_MAX;
let frame = 0;
let fixedAccumulator = 0;
let timeInPatrol = 0;
let gradeTimer = 0;
let tracerTimer = 0;
let lastGrade: GradeBreakdown | null = null;
let paused = false;
let objective = "Hold Shift to spool up and take off west. Thread the amber ring.";
const spawnedWaves = new Set<number>();

function handle(name: string): AuraRuntimeNodeHandle | undefined {
  if (!handles.has(name)) {
    try {
      handles.set(name, app.nodes.require(name));
    } catch {
      handles.set(name, undefined);
    }
  }
  return handles.get(name);
}

function cueDirectionEvent(event: "gunfire" | "drone-destroyed" | "ring-clear"): void {
  requestedAudioEvents.add(event);
  void patrolGame.sound?.cue(event);
}

function pushEvent(type: string, label: string, severity: "info" | "success" | "warning" = "info"): void {
  routeEvents.push({ type, label, severity, frame });
}

function flightInput(): FlightInput {
  const raw: FlightInput = {
    pitchUp: input.held("pitchUp"),
    pitchDown: input.held("pitchDown"),
    rollLeft: input.held("rollLeft"),
    rollRight: input.held("rollRight"),
    yawLeft: input.held("yawLeft"),
    yawRight: input.held("yawRight"),
    throttleUp: input.held("throttleUp"),
    throttleDown: input.held("throttleDown")
  };
  if (flight.grounded !== "airborne" || state !== "patrol") {
    return raw;
  }

  // Airborne flight-director assist: holds cruise power unless throttleDown is
  // held and gently trims pitch/bank toward the active ring gate corridor so
  // releasing keys mid-sortie carves around the island instead of stalling out
  // over empty water.
  const gate = RING_GATES[rings.nextRing] ?? RING_GATES[0]!;
  const p = flight.position;
  const f = flight.forward;
  const r = flight.right;
  const dx = gate.position[0] - p[0];
  const dy = gate.position[1] - p[1];
  const dz = gate.position[2] - p[2];
  const distXZ = Math.hypot(dx, dz) || 1;
  const ahead = (dx * f[0] + dz * f[2]) / distXZ;
  let side = (dx * r[0] + dz * r[2]) / distXZ;
  if (ahead < -0.1) side = side >= 0 ? 1 : -1;

  const minSafeY = Math.max(8.8, terrainSurface(p[0], p[2]) + 4.8);
  const targetY = Math.max(gate.position[1], minSafeY);
  const desiredClimb = Math.max(-0.26, Math.min(0.36, (targetY - p[1]) / Math.max(distXZ, 9)));
  const climbErr = desiredClimb - f[1];

  const desiredBank = Math.max(-0.52, Math.min(0.52, side * 0.88));
  const bankErr = desiredBank - flight.bank;

  const manualPitch = raw.pitchUp || raw.pitchDown;
  const manualRoll = raw.rollLeft || raw.rollRight;
  const manualYaw = raw.yawLeft || raw.yawRight;

  const floorOrCeilingGuard = p[1] < minSafeY + 0.6 || p[1] > 18.5 || Math.abs(climbErr) > 0.24;
  const corridorGuard = Math.abs(side) > 0.36 || ahead < 0.25;

  const pitchUp = floorOrCeilingGuard || !manualPitch ? climbErr > 0.035 : raw.pitchUp;
  const pitchDown = floorOrCeilingGuard || !manualPitch ? climbErr < -0.035 : raw.pitchDown;
  const rollRight = corridorGuard || !manualRoll ? bankErr > 0.045 : raw.rollRight;
  const rollLeft = corridorGuard || !manualRoll ? bankErr < -0.045 : raw.rollLeft;
  const yawRight = corridorGuard || !manualYaw ? side > 0.065 : raw.yawRight;
  const yawLeft = corridorGuard || !manualYaw ? side < -0.065 : raw.yawLeft;
  const throttleUp = raw.throttleUp || (!raw.throttleDown && flight.throttle < 0.74);

  return {
    pitchUp,
    pitchDown,
    rollLeft,
    rollRight,
    yawLeft,
    yawRight,
    throttleUp,
    throttleDown: raw.throttleDown
  };
}

function objectiveComplete(): boolean {
  return rings.complete && spawnedWaves.size >= WAVES_PER_PATROL && swarm.allCleared;
}

function applyHullDamage(amount: number): void {
  hull = Math.max(0, hull - Math.max(0, amount));
  if (hull <= 0 && (state === "patrol" || state === "preflight")) {
    state = "shot-down";
    const script = ghostRecorder.end();
    if (script.length > 0) lastScript = script;
    objective = "Shot down — hull failed. Press R to retry the patrol.";
    pushEvent("shot-down", "shot-down", "warning");
    patrolGame.juice.fire("crashed");
  }
}

function handleFlightOutcome(outcome: FlightOutcome): void {
  if (outcome === "none") return;
  const p = flight.position;
  if (outcome === "pad-bounce") {
    applyHullDamage(BOUNCE_SCRAPE);
    objective = "Hard bounce off the pad — slow down, wings level, try again.";
    pushEvent("pad-bounce", "pad-bounce", "warning");
    return;
  }
  if (outcome === "pad-touchdown") {
    if (objectiveComplete()) {
      lastGrade = gradePatrol(timeInPatrol, cannon.accuracy, hull / HULL_MAX);
      const script = ghostRecorder.end();
      if (script.length > 0) lastScript = script;
      if (!bestRun || gradeRank(lastGrade.grade) > gradeRank(bestRun.grade)) {
        bestRun = { grade: lastGrade.grade, script };
      }
      state = "graded";
      gradeTimer = 4;
      objective = `Patrol ${patrol} clear — grade ${lastGrade.grade} (${lastGrade.total}).`;
      pushEvent("graded", `graded:${lastGrade.grade}`, "success");
      patrolGame.fx.burst("ring", [p[0], p[1], p[2]], { count: 14, color: "#39d7a8" });
    } else {
      const script = ghostRecorder.end();
      if (script.length > 0) lastScript = script;
      state = "incomplete";
      objective = "Landed with the patrol incomplete. Press R to retry.";
      pushEvent("incomplete", "incomplete", "warning");
    }
    return;
  }
  // crash-terrain | crash-ocean
  const script = ghostRecorder.end();
  if (script.length > 0) lastScript = script;
  state = "crashed";
  objective = outcome === "crash-ocean" ? "Down in the sea. Press R to retry the patrol." : "Terrain impact. Press R to retry the patrol.";
  pushEvent(outcome, outcome, "warning");
  patrolGame.juice.fire("crashed");
  patrolGame.fx.burst("spark", [p[0], p[1], p[2]], { count: 16, color: "#ff5d4d" });
}

function resetToPad(nextPatrol: number): void {
  patrol = nextPatrol;
  flight = new FlightModel({ ...SPAWN, grounded: "preflight" });
  rings.reset();
  cannon.resetCounters();
  swarm.reset();
  arena = createArenaPhysics(ringHalfExtent(patrol));
  hull = HULL_MAX;
  timeInPatrol = 0;
  gradeTimer = 0;
  tracerTimer = 0;
  spawnedWaves.clear();
  state = "preflight";
  objective = `Patrol ${patrol} of ${PATROL_COUNT}. Hold Shift to take off, thread the amber ring.`;
  ghostRecorder.end();
  ghostPlayer = null;
  rigState.position = [SPAWN.position[0], SPAWN.position[1], SPAWN.position[2]];
  rigState.forward = [-1, 0, 0];
  rigState.up = [0, 1, 0];
  rig.reset?.();
  syncRingMaterials();
  pushEvent("reset", `reset:patrol-${patrol}`);
}

function syncRingMaterials(): void {
  for (const gate of RING_GATES) {
    const mat =
      gate.index < rings.nextRing
        ? RING_PASSED_NEON_MAT
        : gate.index === rings.nextRing
          ? RING_AMBER_NEON_MAT
          : RING_CYAN_NEON_MAT;
    handle(`ring-${gate.index}`)?.setMaterial(mat);
  }
  const next: RingGate | undefined = RING_GATES[rings.nextRing];
  const beacon = handle("next-ring-beacon");
  if (beacon) {
    if (next) beacon.setVisible(true).setPosition(next.position[0], next.position[1] + 6, next.position[2]);
    else beacon.setVisible(false);
  }
}

/** One fixed FLIGHT_DT step of the whole sortie (deterministic core). */
function fixedStep(): void {
  const controls = flightInput();
  const fireHeld = input.held("fire");
  if (tracerTimer > 0) tracerTimer = Math.max(0, tracerTimer - FLIGHT_DT);

  const wasGrounded = flight.grounded;
  const result = flight.step(controls, FLIGHT_DT, terrainSurface, LANDING);
  if (state === "preflight" && wasGrounded === "preflight" && flight.grounded === "airborne") {
    state = "patrol";
    timeInPatrol = 0;
    ghostRecorder.begin();
    // Ghost: replay the best graded sortie (or the last attempt) alongside.
    const script = bestRun?.script ?? lastScript;
    ghostPlayer = script.length > 0 ? new GhostPlayer(script, SPAWN) : null;
    ghostPlayer?.start();
    objective = "Airborne. Thread the rings in order — amber is next.";
    pushEvent("takeoff", "takeoff", "success");
  }
  if (state === "patrol") {
    timeInPatrol += FLIGHT_DT;
    ghostRecorder.record(encodeControlFrame(controls, fireHeld));
    ghostPlayer?.step(terrainSurface, LANDING);
  }
  handleFlightOutcome(result.outcome);
  if (state !== "patrol" && state !== "preflight") return;

  // Sensor layer: rings, pad, return-fire orbs.
  arena.setPlayerPosition(flight.position);
  for (const event of arena.step(FLIGHT_DT)) {
    if (event.kind === "ring") {
      const index = Number(event.id.slice("ring:".length));
      const entry = rings.registerEntry(index);
      if (entry === "advanced") {
        cueDirectionEvent("ring-clear");
        patrolGame.juice.fire("ring-clear");
        const clearedGate = RING_GATES[index];
        if (clearedGate) {
          patrolGame.fx.burst("ring", [clearedGate.position[0], clearedGate.position[1], clearedGate.position[2]], {
            count: 14,
            color: "#ffb14d"
          });
        }
        pushEvent("ring", `ring:${index}`, "success");
        objective = rings.complete
          ? "All rings flown. Clear the drones, then land on the pad."
          : `Ring ${index + 1} clear. Next: ring ${rings.nextRing + 1} of ${RING_GATES.length}.`;
        syncRingMaterials();
      } else if (entry === "skipped-invalid") {
        objective = `Skipped a ring — progress invalid until ring ${rings.nextRing + 1} is flown.`;
        pushEvent("ring-invalid", `ring-invalid:${index}`, "warning");
      }
    } else if (event.kind === "orb-hit" && event.other === "player") {
      applyHullDamage(ORB_DAMAGE);
      pushEvent("orb-hit", "orb-hit", "warning");
    }
  }

  // Drone waves off ring milestones (salvaged schedule).
  for (let wave = 0; wave < WAVES_PER_PATROL; wave += 1) {
    if (!spawnedWaves.has(wave) && rings.passedCount >= WAVE_TRIGGERS[wave]!) {
      spawnedWaves.add(wave);
      swarm.spawnWave(waveSpawns(patrol, wave));
      objective = `Drones inbound — wave ${wave + 1}. Space to fire.`;
      pushEvent("wave", `wave:${wave + 1}`);
    }
  }

  // Cannon through the salvaged combat world.
  if (cannon.tryFire(fireHeld, FLIGHT_DT)) {
    const p = flight.position;
    const f = flight.forward;
    swarm.beginCannonAttack([f[0] * 6, f[1] * 6, f[2] * 6]);
    tracerTimer = 0.14;
    patrolGame.fx.burst("spark", [p[0] + f[0] * 2.2, p[1] + f[1] * 2.2, p[2] + f[2] * 2.2], {
      count: 10,
      color: "#ffd166"
    });
    cueDirectionEvent("gunfire");
  }
  for (const event of swarm.update(FLIGHT_DT, flight.position, droneSpeed(patrol))) {
    if (event.type === "orb-fired") {
      arena.spawnOrb(event.from, event.toward);
    } else if (event.type === "cannon-hit") {
      cannon.registerHit();
      pushEvent("cannon-hit", `cannon-hit:${event.targetId}`);
    } else if (event.type === "drone-down") {
      cueDirectionEvent("drone-destroyed");
      patrolGame.juice.fire("drone-down");
      const p = flight.position;
      const f = flight.forward;
      patrolGame.fx.burst("spark", [p[0] + f[0] * 6, p[1] + f[1] * 6, p[2] + f[2] * 6], {
        count: 16,
        color: "#ff6b4a"
      });
      pushEvent("drone-down", `drone-down:${event.id}`, "success");
      const down = swarm.liveDrones().length;
      objective = down === 0 && rings.complete ? "Sky clear. Land on the pad to grade the patrol." : objective;
    }
  }
}

// ---------------------------------------------------------------- frame loop -
app.onFrame(({ dt }) => {
  frame += 1;
  input.update(dt);
  if (input.pressed("pause")) paused = !paused;
  if (paused) {
    publishEvidence();
    return;
  }
  if (input.pressed("reset")) resetToPad(state === "complete" ? 1 : patrol);

  if (state === "graded") {
    gradeTimer -= dt;
    if (gradeTimer <= 0) {
      if (patrol >= PATROL_COUNT) {
        state = "complete";
        objective = `All ${PATROL_COUNT} patrols clear. Press R to fly again.`;
        pushEvent("complete", "complete", "success");
      } else {
        resetToPad(patrol + 1);
      }
    }
  } else if (state === "preflight" || state === "patrol") {
    fixedAccumulator += Math.min(dt, 0.1);
    let steps = 0;
    while (fixedAccumulator >= FLIGHT_DT && steps < 6) {
      fixedStep();
      fixedAccumulator -= FLIGHT_DT;
      steps += 1;
      if (state !== "preflight" && state !== "patrol") break;
    }
    if (steps === 6) fixedAccumulator = 0;
  }

  syncVisuals();
  renderHud();
  publishEvidence();
});

function syncVisuals(): void {
  const p = flight.position;
  const e = flight.euler;
  const f = flight.forward;
  const u = flight.up;
  const r = flight.right;
  handle("patrol-plane")?.setVisible(true).setPosition(p[0], p[1], p[2]).setRotation(e.x, e.y, e.z);
  handle("airframe-silver-fuselage")
    ?.setVisible(true)
    .setPosition(p[0] + u[0] * 0.08, p[1] + u[1] * 0.08, p[2] + u[2] * 0.08)
    .setRotation(e.x, e.y, e.z - Math.PI / 2);
  handle("airframe-navy-wing")
    ?.setVisible(true)
    .setPosition(p[0] - f[0] * 0.1 + u[0] * 0.04, p[1] - f[1] * 0.1 + u[1] * 0.04, p[2] - f[2] * 0.1 + u[2] * 0.04)
    .setRotation(e.x, e.y, e.z);
  rigState.position = [p[0], p[1], p[2]];
  rigState.forward = [f[0], f[1], f[2]];
  rigState.up = [u[0], u[1], u[2]];

  const afterburner = handle("plane-afterburner");
  if (afterburner) {
    afterburner
      .setVisible(flight.throttle > 0.05 || state === "preflight")
      .setPosition(p[0] - f[0] * 1.75 + u[0] * 0.05, p[1] - f[1] * 1.75 + u[1] * 0.05, p[2] - f[2] * 1.75 + u[2] * 0.05)
      .setRotation(e.x, e.y, e.z - Math.PI / 2);
  }

  const showContrails = flight.grounded === "airborne" && flight.speed > 7;
  const contrailLeft = handle("contrail-left");
  const contrailRight = handle("contrail-right");
  if (contrailLeft && contrailRight) {
    if (showContrails) {
      contrailLeft
        .setVisible(true)
        .setPosition(
          p[0] - f[0] * 2.1 - r[0] * 1.65 + u[0] * 0.05,
          p[1] - f[1] * 2.1 - r[1] * 1.65 + u[1] * 0.05,
          p[2] - f[2] * 2.1 - r[2] * 1.65 + u[2] * 0.05
        )
        .setRotation(e.x, e.y, e.z + Math.PI / 2);
      contrailRight
        .setVisible(true)
        .setPosition(
          p[0] - f[0] * 2.1 + r[0] * 1.65 + u[0] * 0.05,
          p[1] - f[1] * 2.1 + r[1] * 1.65 + u[1] * 0.05,
          p[2] - f[2] * 2.1 + r[2] * 1.65 + u[2] * 0.05
        )
        .setRotation(e.x, e.y, e.z + Math.PI / 2);
    } else {
      contrailLeft.setVisible(false).setPosition(0, -65, 0);
      contrailRight.setVisible(false).setPosition(0, -65, 0);
    }
  }

  const tracer = handle("cannon-tracer");
  if (tracer) {
    if (tracerTimer > 0) {
      tracer
        .setVisible(true)
        .setPosition(p[0] + f[0] * 4.6 - u[0] * 0.1, p[1] + f[1] * 4.6 - u[1] * 0.1, p[2] + f[2] * 4.6 - u[2] * 0.1)
        .setRotation(e.x, e.y, e.z + Math.PI / 2);
    } else {
      tracer.setVisible(false).setPosition(0, -65, 0);
    }
  }

  const ghostNode = handle("patrol-ghost");
  if (ghostNode) {
    if (ghostPlayer?.playing) {
      const gp = ghostPlayer.flight.position;
      const ge = ghostPlayer.flight.euler;
      ghostNode.setVisible(true).setPosition(gp[0], gp[1], gp[2]).setRotation(ge.x, ge.y, ge.z);
    } else {
      ghostNode.setVisible(false);
    }
  }

  const live = swarm.liveDrones();
  for (let index = 0; index < DRONE_NODE_COUNT; index += 1) {
    const node = handle(`drone-${index}`);
    if (!node) continue;
    const drone = live[index];
    if (drone) {
      const yawToPlayer = Math.atan2(-(p[2] - drone.position[2]), p[0] - drone.position[0]);
      node
        .setVisible(true)
        .setPosition(drone.position[0], drone.position[1], drone.position[2])
        .setRotation(0, yawToPlayer, Math.sin(frame * 0.08 + index) * 0.22);
    } else {
      node.setVisible(false).setPosition(0, -60 - index, 0);
    }
  }
  const orbs = arena.orbStates();
  for (let index = 0; index < ORB_NODE_COUNT; index += 1) {
    const node = handle(`orb-${index}`);
    if (!node) continue;
    const orb = orbs[index];
    if (orb?.active) node.setVisible(true).setPosition(orb.position[0], orb.position[1], orb.position[2]);
    else node.setVisible(false).setPosition(0, -70 - index, 0);
  }
}

// ----------------------------------------------------------------------- hud -
const hudRoot = createHud();
function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "patrol-wing-hud";
  root.style.cssText = [
    "position:fixed",
    "left:14px",
    "bottom:14px",
    "z-index:5",
    "max-width:280px",
    "font:500 11px/1.35 system-ui, sans-serif",
    "color:#eef7ff",
    "background:rgba(7,20,34,0.78)",
    "border:1px solid rgba(34,211,238,0.38)",
    "border-radius:8px",
    "padding:8px 10px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function scoreValue(): number {
  return rings.passedCount * 100 + swarm.downCount * 250 + (lastGrade ? Math.round(lastGrade.total * 10) : 0);
}

function renderHud(): void {
  const score = scoreValue();
  // C-24 kit widgets (declared in the createGame `hud` option) mirror the
  // same state the route-local panel below renders.
  patrolGame.hud.set("score", score);
  patrolGame.hud.set("speed", Math.round(flight.speed * 3.6));
  patrolGame.hud.set("objective", objective);
  patrolGame.hud.set("hull", Math.round(hull));
  const alt = Math.max(0, flight.position[1] - terrainSurface(flight.position[0], flight.position[2]));
  hudRoot.innerHTML = [
    `<strong>Patrol Wing</strong>`,
    `<div>Score ${score} | Patrol ${patrol}/${PATROL_COUNT} | Hull ${Math.round(hull)}%</div>`,
    `<div>Airspeed ${Math.round(flight.speed * 3.6)} km/h | Altitude ${alt.toFixed(1)} m | Rings ${rings.passedCount}/${RING_GATES.length} | Drones ${swarm.liveCount} live</div>`,
    `<div>${objective}</div>`,
    `<div>Shift throttle. S/W pitch. A/D roll. Q/E yaw. Space fire. P pause. R reset.</div>`
  ].join("");
}

// ------------------------------------------------------------------ evidence -
let cachedEvidence: unknown = null;
let cachedDrawCalls = 0;

function publishEvidence(): void {
  const score = scoreValue();
  if (cachedEvidence === null || frame <= 5 || frame % 8 === 0) {
    cachedEvidence = app.evidence({
      input,
      events: routeEvents,
      hud: hudBindings,
      appState: {
        score,
        objective,
        events: routeEvents.events().map((event: { readonly label: string }) => event.label)
      },
      assets: {
        typedAssets: Object.keys(assets).length,
        missingAssets: []
      },
      source: { expectsGame: true }
    });
    cachedDrawCalls = app.diagnostics().drawCalls;
  }
  const evidence = cachedEvidence;
  const p = flight.position;
  const snapshot: PatrolWingEvidence = {
    // Framed once the renderer submits draw calls for the mounted island.
    framed: cachedDrawCalls > 0,
    state,
    frame,
    score,
    patrol,
    grade: lastGrade?.grade ?? null,
    backend: arena.backend,
    drawCalls: cachedDrawCalls,
    look: { id: LOOK_ID, category: LOOK_CATEGORY },
    flight: {
      position: [p[0], p[1], p[2]],
      altitude: Math.max(0, p[1] - terrainSurface(p[0], p[2])),
      speed: flight.speed,
      throttle: flight.throttle,
      stalled: flight.stalled,
      grounded: flight.grounded,
      trajectoryHash: flight.trajectoryHash()
    },
    rings: {
      nextRing: rings.nextRing,
      gatesCleared: rings.passedCount,
      validity: rings.validity,
      complete: rings.complete
    },
    hull: { value: Math.round(hull), max: HULL_MAX, fraction: hull / HULL_MAX },
    drones: {
      liveCount: swarm.liveCount,
      downCount: swarm.downCount,
      spawnedCount: swarm.spawnedCount,
      positions: swarm.liveDrones().map((d) => ({ id: d.id, position: [d.position[0], d.position[1], d.position[2]] as const }))
    },
    cannon: { shotsFired: cannon.shotsFired, shotsHit: cannon.shotsHit, accuracy: cannon.accuracy },
    ghost: {
      recorded: ghostRecorder.frameCount > 0 || lastScript.length > 0,
      frames: ghostRecorder.frameCount,
      playing: ghostPlayer?.playing ?? false,
      scriptHash: ghostRecorder.frameCount > 0 ? ghostRecorder.scriptHash() : null
    },
    fx: { liveCount: patrolGame.fx.liveCount },
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    audio: audioEvidence(),
    evidence
  };
  latestSnapshot = snapshot;
  window.__aura3dGameSnapshot = snapshot;
}

function audioEvidence(): PatrolWingEvidence["audio"] {
  const sound = patrolGame.sound?.evidence;
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

syncRingMaterials();
syncVisuals();
renderHud();
publishEvidence();
