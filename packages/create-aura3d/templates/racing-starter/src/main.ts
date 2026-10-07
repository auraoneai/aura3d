import {
  camera,
  game,
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

// Both showcase GLBs are authored at real scale: the car measures
// 3.455 × 3.428 × 2.206 m and the kart circuit 24.651 × 24.647 × 2.073 m, so
// the models mount at scale 1 (the former 0.18 shrink is removed). The logical
// route is scaled by the same factor the track grew (24.651 / 6.65 ≈ 3.7 → 3.5)
// so the driven line still traces inside the visible circuit footprint.
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

// GLB z-extent normalizes to world height: track top surface sits at y=0 when
// the model is dropped by its 1.0 m max. The car's raw min-y is -1.206 m, so
// the ride height lifts it until the wheels rest on that surface.
const TRACK_Y = -1.0;
const CAR_RIDE_Y = 1.206;

// Chase framing: 8 m back and 3.4 m up at fov 60, aimed a car-length ahead.
const CHASE = { back: 8, up: 3.4, ahead: 4, fov: 60 } as const;

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
  steerRate: 2.85
});

const routeEvents = game.eventLog({ label: "racing starter events", maxEvents: 16 });
// HUD bindings as descriptor literals (the deprecated game.hud.* helpers are
// replaced by the createGame `hud` option + evidence channel sections).
const hudBindings = [
  { kind: "aura-game-hud-binding", owner: "app", binding: "objective", id: "hud:objective", label: "objective", source: "app-state", valuePath: "appState.objective", format: "text", a11yLabel: "current objective" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "timer", id: "hud:round:timer", label: "Round timer", source: "app-state", valuePath: "appState.lapTime", format: "seconds", a11yLabel: "lap timer" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "checkpoint", id: "hud:checkpoint", label: "checkpoint", source: "app-state", valuePath: "appState.checkpoint", format: "text", a11yLabel: "current checkpoint" },
  { kind: "aura-game-hud-binding", owner: "app", binding: "event-log", id: "hud:event-log", label: "event log", source: "app-state", valuePath: "appState.events", format: "text", a11yLabel: "game event log", debugOnly: true }
] as const;

const evidenceMode = navigator.webdriver;
const racingGame = createGame({
  id: "racing-starter",
  target: "#app",
  autoStart: !evidenceMode,
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
const input = racingGame.input;
if (!input) throw new Error("create-aura3d racing-starter failed to create runtime-owned input.");

const car = app.nodes.require("race-car");
const checkpointMarker = app.nodes.require("checkpoint-marker");
const finishMarker = app.nodes.require("finish-marker");
const hudRoot = createHud();
let objective = "Clear six gates across a 3-lap typed-asset route.";
const raceEventLabels: string[] = [];

// C-22 camera surface: the chase rig pins the framing, and every frame writes
// the actual chase pose behind the car heading — camera state lives on the
// camera, not in evidence.
app.camera?.use(camera.rigs.chase({ target: "race-car" }));

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

  const forwardX = Math.cos(state.heading);
  const forwardZ = Math.sin(state.heading);
  app.camera?.setPose({
    position: [
      state.position.x - forwardX * CHASE.back,
      CAR_RIDE_Y + CHASE.up,
      state.position.y - forwardZ * CHASE.back
    ],
    target: [
      state.position.x + forwardX * CHASE.ahead,
      CAR_RIDE_Y + 0.4,
      state.position.y + forwardZ * CHASE.ahead
    ]
  });

  renderHud(state);
  publishEvidence(state);
});

publishEvidence(racing.snapshot());
renderHud(racing.snapshot());

// Keep browser evidence deterministic on software GPUs without replacing real
// keyboard input. The input controller receives each DOM event first; this
// handler then advances the same app.onFrame gameplay callback and presents one
// completed frame. Generated apps outside WebDriver retain continuous playback.
if (evidenceMode) {
  await app.ready();
  // Present the initial production frame asynchronously. SwiftShader can take
  // seconds to drain a typed GLB scene; a synchronous submission here blocks
  // Playwright's state readback and turns an input contract into a timeout.
  await app.stepAsync(0);
  const advanceFromKeyboard = (event: KeyboardEvent) => {
    const frames = event.type === "keydown" ? 18 : 1;
    // Advance the real input/game callbacks immediately. The playable contract
    // reads simulation-owned evidence, so it does not need another GPU frame
    // for every key transition; visual lifecycle coverage retains the initial
    // completed production frame above.
    for (let frame = 0; frame < frames; frame += 1) app.advance(1 / 60);
  };
  window.addEventListener("keydown", advanceFromKeyboard);
  window.addEventListener("keyup", advanceFromKeyboard);
}

function buildScene() {
  const nodes: AuraNodeInput[] = [
    // Real-scale assets: kart circuit 24.651 m, sports car 3.455 m (aura-assets
    // bounds). No 0.18 shrink — see CAR_RIDE_Y / ROUTE_SCALE comments above.
    model(assets.trackModel, { name: "typed kart circuit asset" })
      .position(ROUTE_BOUNDS.centerX, TRACK_Y, ROUTE_BOUNDS.centerZ)
      .scale(1),
    model(assets.carModel, { name: "typed playable sports car", castShadow: true })
      .position(0, CAR_RIDE_Y, 0)
      .scale(1)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    primitives.box({ name: "checkpoint marker", material: material.neon({ color: "#7ff0c5", emissive: "#7ff0c5", emissiveIntensity: 0.7 }) })
      .position(0.06 * ROUTE_SCALE, CAR_RIDE_Y, 0.2 * ROUTE_SCALE)
      .scale([0.7, 1.2, 4.2])
      .runtime(game.runtimeNode("checkpoint-marker", { tags: ["checkpoint", "runtime"] })),
    primitives.box({ name: "finish stripe", material: material.neon({ color: "#f9f1d0", emissive: "#f9f1d0", emissiveIntensity: 0.75 }) })
      .position(0.1 * ROUTE_SCALE, CAR_RIDE_Y - 0.1, 0.05 * ROUTE_SCALE)
      .scale([3.8, 0.36, 0.5])
      .runtime(game.runtimeNode("finish-marker", { tags: ["finish", "runtime"] }))
  ];

  return scene()
    .add(looks.preset(LOOK_ID))
    .addMany(nodes)
    .camera(camera.perspective({ position: [0, CAR_RIDE_Y + CHASE.up, -CHASE.back], target: [0, CAR_RIDE_Y, 0], fov: CHASE.fov }));
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
    "font:600 13px/1.35 Inter, system-ui, sans-serif",
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
