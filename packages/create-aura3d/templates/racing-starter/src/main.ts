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
// PRD-09: mounted via the shared runtime — createGame owns mount/lifecycle,
// the §7.7 HUD theme, the §6.11 steer-pedals touch preset, game-sfx-core
// cues, and the juice event map (no route-local flash/hit-stop code).
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

declare global {
  interface Window {
    __AURA3D_RACING_STARTER__?: RacingStarterEvidence;
  }
}

interface RacingStarterEvidence {
  readonly status: string;
  readonly frame: number;
  readonly lap: number;
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
    readonly routeScale: number;
  };
  readonly camera: {
    readonly rig: string;
    readonly presented: boolean;
  };
  readonly evidence: unknown;
}

// The look sets sky + sun + fog + grade; the scene adds only the foreground.
// Genre row (aura3d-browser-game): racing-starter → golden-hour, chase fov 60.
const LOOK_ID = "golden-hour" as const;

// Both showcase GLBs are authored off-origin and at real scale (car 3.18 m
// long, kart circuit 24.65 m wide). model() in its default fit mode re-centres
// each GLB on x/z and sits its lowest point on y = 0, so the car rotates about
// its own middle and the circuit lands under the route; targetLength /
// targetMaxDimension pin the real metre scale instead of the ~1.55 m default
// fit. The logical route is scaled by the factor the track grew
// (24.651 / 6.65 ≈ 3.7 -> 3.5) so the driven line still traces inside the
// visible circuit footprint.
const ROUTE_SCALE = 3.5;
const route = {
  id: "starter-kart-loop",
  width: 2.2 * ROUTE_SCALE,
  points: [
    { x: -0.4 * ROUTE_SCALE, y: -0.25 * ROUTE_SCALE },
    { x: 2.4 * ROUTE_SCALE, y: -0.9 * ROUTE_SCALE },
    { x: 5.4 * ROUTE_SCALE, y: 0.15 * ROUTE_SCALE },
    { x: 5.9 * ROUTE_SCALE, y: 2.7 * ROUTE_SCALE },
    { x: 3.2 * ROUTE_SCALE, y: 3.9 * ROUTE_SCALE },
    { x: 0.3 * ROUTE_SCALE, y: 3.15 * ROUTE_SCALE },
    { x: -0.75 * ROUTE_SCALE, y: 1.15 * ROUTE_SCALE }
  ],
  checkpoints: [0.14, 0.27, 0.4, 0.53, 0.66, 0.79]
};

// The circuit GLB is origin-centred (±12.3 m on x/z). Placing it under the
// scaled route's bounding-box centre keeps the visible ribbon over the route.
const ROUTE_BOUNDS = {
  centerX: ((-0.75 + 5.9) / 2) * ROUTE_SCALE,
  centerZ: ((-0.9 + 3.9) / 2) * ROUTE_SCALE
} as const;

// The fitted circuit is 1.69 m tall with its asphalt surface ~1.17 m above its
// lowest point, so dropping it by TRACK_Y puts the road at y = 0. The fitted
// car already rests on y = 0; CAR_RIDE_Y only lifts it a hair off z-fighting.
const TRACK_Y = -1.17;
const CAR_RIDE_Y = 0.03;

// Chase framing: 8 m back and 3.6 m up at fov 55, looking at the car's roof. The
// mounted rig owns the camera; this is the flag-off scene-camera fallback.
const CHASE = { back: 8, up: 3.6, lookUp: 0.8, ahead: 4, fov: 55 } as const;

const inputOptions = {
  actions: {
    throttle: ["KeyW", "ArrowUp"],
    brake: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    drift: ["Space"],
    boost: ["ShiftLeft", "ShiftRight"],
    reset: ["KeyR"]
  },
  axes: {
    steer: { negative: "left", positive: "right" }
  },
  bufferMs: 80
} as const;

const racing = game.racing({
  route,
  startProgress: 0.04,
  checkpointRadius: 0.08,
  lapsToWin: 3,
  maxSpeed: 40,
  acceleration: 60,
  drag: 1.4,
  steerRate: 2.85,
  // F-08-1: bicycle vehicle model + V-5 chassis presentation publish the
  // vLong/lateralG telemetry the chase rig's perSpeed FOV and bank read.
  model: "bicycle",
  chassis: true,
  // F-08-5: kit edges (boost/drift/collision/lap) emit on the app feel bus.
  feelBus: { emit: (name, o) => app?.feel?.emit(name, { strength: o?.strength }) }
});

const routeEvents = game.eventLog({ label: "racing starter events", maxEvents: 16 });
// HUD bindings as descriptor literals (the deprecated game.hud.* helpers are
// replaced by the createGame `hud` option + evidence channel sections).
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Round timer", source: "app-state", valuePath: "appState.lapTime", format: "clock", a11yLabel: "lap timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "checkpoint", id: "hud:checkpoint", label: "checkpoint", source: "app-state", valuePath: "appState.checkpoint", format: "text", a11yLabel: "current checkpoint" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

const racingGame = createGame({
  id: "racing-starter",
  target: "#app",
  diagnostics: { overlay: true, performancePanel: true },
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
      lap: { id: "lap", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.7 },
      finish: { id: "finish", asset: { url: sfxUrl("stinger.win.00") }, volume: 0.8 },
      "off-track": { id: "off-track", asset: { url: sfxUrl("impact.rubber-ball.light.00") }, volume: 0.5 },
      boost: { id: "boost", asset: { url: sfxUrl("vehicle.boost") }, volume: 0.6 }
    }
  },
  juice: {
    checkpoint: { punch: { fovDeg: 1.4, ms: 160 }, flash: { color: "#7ff0c5", peak: 0.14, ms: 180 } },
    lap: { shake: 0.2, punch: { fovDeg: 2, ms: 240 } },
    finish: { hitStop: 0.05, punch: { fovDeg: 2.6, ms: 320 }, rumble: { strong: 0.6, ms: 300 } },
    "off-track": { shake: 0.35, rumble: { weak: 0.5, ms: 160 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { racingStarter: () => window.__AURA3D_RACING_STARTER__ ?? { status: "unbound" } }
  }
});
const app = racingGame.app;
racingGame.start();
const input = racingGame.input;
if (!input) throw new Error("create-aura3d racing-starter failed to create runtime-owned input.");

const car = app.nodes.require("race-car");
const checkpointMarker = app.nodes.require("checkpoint-marker");
const finishMarker = app.nodes.require("finish-marker");
const hudRoot = createHud();
let objective = "Clear six gates across a 3-lap typed-asset route.";
const raceEventLabels: string[] = [];

// F-08-1: the chase rig owns the presented camera — speed-scaled FOV,
// velocity look-ahead and lateral bank come from the rig spec (flag-off
// mounts the no-op stub controller; the scene camera spec is the fallback).
// F-08-5: feel bus + GameFeel attach through app.time.
app.camera?.use(
  camera.rigs.chase({
    target: "race-car",
    distance: CHASE.back,
    height: CHASE.up,
    lookHeight: CHASE.lookUp,
    fov: { base: CHASE.fov, perSpeed: 0.4 },
    lookAhead: { seconds: 0.35, max: 4 },
    bank: { gain: 0.5, maxDeg: 6 }
  })
);
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("racing");

app.onFrame(({ dt }) => {
  if (input.pressed("reset")) {
    racing.reset(0);
    routeEvents.push({ type: "reset", label: "reset" });
    raceEventLabels.push("reset");
    objective = "Clear six gates across a 3-lap typed-asset route.";
  }

  const state = racing.step(dt, {
    throttle: input.held("throttle"),
    brake: input.held("brake"),
    steer: input.axis("steer"),
    drift: input.held("drift"),
    boost: input.held("boost")
  });

  for (const event of state.events) {
    const label = event.id ? `${event.type}:${event.id}` : event.type;
    raceEventLabels.push(label);
    routeEvents.push({
      type: event.type,
      label,
      severity: event.type === "finish" || event.type === "lap" || event.type === "checkpoint" ? "success" : "info",
      frame: event.frame,
      time: event.time
    });
    if (event.type === "checkpoint") objective = `Gate ${state.checkpoint}/${state.checkpointCount}. Stay on the route.`;
    if (event.type === "lap") objective = `Lap ${state.lap}/${state.lapsToWin}. Keep the line.`;
    if (event.type === "finish") objective = "Finished. Press R to run it again.";
    if (event.type === "off-track") objective = "Back onto the racing line.";
    if (event.type === "checkpoint" || event.type === "lap" || event.type === "finish" || event.type === "off-track") {
      racingGame.juice.fire(event.type);
      void racingGame.sound?.cue(event.type);
    }
  }
  if (input.pressed("boost")) void racingGame.sound?.cue("boost");

  car
    .setPosition(state.position.x, CAR_RIDE_Y, state.position.y)
    .setRotation(0, -state.heading + Math.PI / 2, 0);
  checkpointMarker.setVisible(state.checkpoint === 0);
  finishMarker.setScale(state.status === "finished" ? [1.15, 0.08, 0.14] : [0.86, 0.08, 0.12]);

  feel.update(dt * 1000);
  renderHud(state);
  publishEvidence(state);
});

publishEvidence(racing.snapshot());
renderHud(racing.snapshot());


function buildScene() {
  const nodes: AuraNodeInput[] = [
    // Real-scale assets: kart circuit 24.65 m wide, sports car 3.2 m long, centred and grounded by model()'s fit (see the comment above).
    model(assets.trackModel, { name: "typed kart circuit asset", targetMaxDimension: 24.65 })
      .position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)
      .scale(1),
    model(assets.carModel, { name: "typed playable sports car", castShadow: true, targetLength: 3.2 })
      .position(0, CAR_RIDE_Y, 0)
      .scale(1)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    primitives.box({ name: "checkpoint marker", material: material.neon({ color: "#7ff0c5", emissive: "#7ff0c5", emissiveIntensity: 0.7 }) })
      .position(0.06 * ROUTE_SCALE, CAR_RIDE_Y + 0.05, 0.2 * ROUTE_SCALE)
      .scale([0.7, 0.1, 3])
      .runtime(game.runtimeNode("checkpoint-marker", { tags: ["checkpoint", "runtime"] })),
    primitives.box({ name: "finish stripe", material: material.neon({ color: "#f9f1d0", emissive: "#f9f1d0", emissiveIntensity: 0.75 }) })
      .position(0.1 * ROUTE_SCALE, CAR_RIDE_Y + 0.02, 0.05 * ROUTE_SCALE)
      .scale([3.8, 0.06, 0.5])
      .runtime(game.runtimeNode("finish-marker", { tags: ["finish", "runtime"] }))
  ];

  return scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0.3 }))
    .addMany(nodes)
    .camera(camera.perspective({ position: [0, CAR_RIDE_Y + CHASE.up, -CHASE.back], target: [0, CAR_RIDE_Y + CHASE.lookUp, 0], fov: CHASE.fov }));
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "racing-starter-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:290px",
    "font:500 13px/1.35 Graphik,sans-serif",
    "color:#f5fbff",
    "background:rgba(20,12,4,0.66)",
    "border:1px solid rgba(235,190,125,0.34)",
    "border-radius:8px",
    "padding:12px",
    "pointer-events:none"
  ].join(";");
  document.body.append(root);
  return root;
}

function renderHud(state: ReturnType<typeof racing.snapshot>): void {
  hudRoot.innerHTML = [
    `<strong>Aura3D Racing Starter</strong>`,
    `<div>Lap ${state.lap}/${state.lapsToWin} | Checkpoint ${state.checkpoint}/${state.checkpointCount}</div>`,
    `<div>Speed ${Math.round(Math.abs(state.speed) * 4.2)} km/h | Time ${state.lapTime.toFixed(2)}s</div>`,
    `<div>${objective}</div>`,
    `<div>Throttle W/Up. Steer A/D. Drift Space. Reset R.</div>`
  ].join("");
}

function publishEvidence(state: ReturnType<typeof racing.snapshot>): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud: hudBindings,
    appState: {
      objective,
      lapTime: state.lapTime,
      checkpoint: `${state.checkpoint}/${state.checkpointCount}`,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  window.__AURA3D_RACING_STARTER__ = {
    status: state.status,
    frame: state.frame,
    lap: state.lap,
    checkpoint: state.checkpoint,
    checkpointCount: state.checkpointCount,
    speed: state.speed,
    progress: state.progress,
    heading: state.heading,
    position: state.position,
    events: raceEventLabels,
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    geometry: {
      // Geometry truth comes from the real certify-game-geometry screen output
      // committed under tests/geometry-certification.json — not from constants.
      tool: "aura3d assets certify-game-geometry --category racing",
      report: "tests/geometry-certification.json",
      carMetres: assets.carModel.bounds ?? [],
      trackMetres: assets.trackModel.bounds ?? [],
      carScale: 1,
      routeScale: ROUTE_SCALE
    },
    camera: {
      rig: app.camera?.rig.id ?? "chase",
      presented: app.camera !== undefined
    },
    evidence
  };
}
