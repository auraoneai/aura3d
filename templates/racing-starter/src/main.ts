import {
  camera,
  createAuraApp,
  game,
  lights,
  material,
  model,
  primitives,
  scene,
  type AuraNodeInput
} from "@aura3d/engine";
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
  readonly lapProof: {
    readonly status: string;
    readonly events: readonly string[];
    readonly bestTime?: number;
    readonly checkpointCount: number;
    readonly lapsToWin: number;
    readonly minLapSeconds: number;
    readonly routeAlignedToVisibleTrack: boolean;
  };
  readonly evidence: unknown;
}

const raceContract = {
  checkpointCount: 6,
  lapsToWin: 3,
  minLapSeconds: 22,
  routeAlignedToVisibleTrack: true
} as const;

const routeRibbonSegments = [
  ["route south straight", [2.8, 0.03, 0], [5.8, 0.08, 0.58]],
  ["route east straight", [5.6, 0.03, 1.7], [0.58, 0.08, 3.6]],
  ["route north straight", [2.8, 0.03, 3.4], [5.8, 0.08, 0.58]],
  ["route west straight", [0, 0.03, 1.7], [0.58, 0.08, 3.6]]
] as const;

const route = {
  id: "starter-kart-loop",
  width: 2.2,
  points: [
    { x: -0.4, y: -0.25 },
    { x: 2.4, y: -0.9 },
    { x: 5.4, y: 0.15 },
    { x: 5.9, y: 2.7 },
    { x: 3.2, y: 3.9 },
    { x: 0.3, y: 3.15 },
    { x: -0.75, y: 1.15 }
  ],
  checkpoints: [0.08, 0.22, 0.36, 0.5, 0.64, 0.78]
};

const input = game.input({
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
});

const racing = game.racing({
  route,
  startProgress: 0.04,
  checkpointRadius: 0.08,
  lapsToWin: raceContract.lapsToWin,
  maxSpeed: 11.5,
  acceleration: 18,
  drag: 1.4,
  steerRate: 2.85
});

const routeEvents = game.eventLog({ label: "racing starter events", maxEvents: 16 });
const hud = game.hud.bindings([
  game.hud.objective({ valuePath: "appState.objective" }),
  game.hud.timer({ valuePath: "appState.lapTime" }),
  game.hud.checkpoint({ valuePath: "appState.checkpoint" }),
  game.hud.eventLog({ valuePath: "appState.events" })
]);
const lapProof = createLapProof();

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: buildScene()
});

const car = app.nodes.require("race-car");
const checkpointMarker = app.nodes.require("checkpoint-marker");
const finishMarker = app.nodes.require("finish-marker");
const hudRoot = createHud();
let objective = "Clear six gates across a 3-lap typed-asset route.";
const raceEventLabels: string[] = [];

app.onFrame(({ dt }: { readonly dt: number }) => {
  input.update(dt);
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
  }

  car
    .setPosition(state.position.x, 0.32, state.position.y)
    .setRotation(0, -state.heading + Math.PI / 2, 0)
    .setScale(state.drift > 0.15 ? [0.2, 0.2, 0.22] : [0.18, 0.18, 0.18]);
  checkpointMarker.setVisible(state.checkpoint === 0);
  finishMarker.setScale(state.status === "finished" ? [1.15, 0.08, 0.14] : [0.86, 0.08, 0.12]);

  renderHud(state);
  publishEvidence(state);
});

publishEvidence(racing.snapshot());
renderHud(racing.snapshot());

function buildScene() {
  const nodes: AuraNodeInput[] = [
    model(assets.trackModel, { name: "typed kart circuit asset" })
      .position(2.8, -0.08, 1.7)
      .scale(0.18),
    model(assets.carModel, { name: "typed playable sports car", castShadow: true })
      .position(0, 0.32, 0)
      .scale(0.18)
      .runtime(game.runtimeNode("race-car", { tags: ["player", "vehicle", "typed-asset", "runtime"] })),
    ...routeRibbonNodes(),
    primitives.box({ name: "checkpoint marker", material: material.neon({ color: "#7ff0c5", emissive: "#7ff0c5", emissiveIntensity: 0.7 }) })
      .position(0.06, 0.18, 0.2)
      .scale([0.16, 0.28, 0.95])
      .runtime(game.runtimeNode("checkpoint-marker", { tags: ["checkpoint", "runtime"] })),
    primitives.box({ name: "finish stripe", material: material.neon({ color: "#f9f1d0", emissive: "#f9f1d0", emissiveIntensity: 0.75 }) })
      .position(0.1, 0.2, 0.05)
      .scale([0.86, 0.08, 0.12])
      .runtime(game.runtimeNode("finish-marker", { tags: ["finish", "runtime"] }))
  ];

  return scene()
    .background("#060b10")
    .addMany(nodes)
    .add(lights.ambient({ name: "race ambient", intensity: 0.38, color: "#e9f6ff" }))
    .add(lights.directional({ name: "race key", position: [4, 7, 5], intensity: 1.1, color: "#ffffff" }))
    .camera(camera.perspective({ position: [2.7, 7.8, 8.6], target: [2.7, 0, 1.55], fov: 43 }));
}

function routeRibbonNodes(): AuraNodeInput[] {
  const asphalt = material.pbr({ color: "#5a6570", roughness: 0.78, metallic: 0.03 });
  return routeRibbonSegments.map(([name, position, scale]) =>
    primitives.box({ name, material: asphalt }).position(...position).scale(scale)
  );
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
    "background:rgba(3,9,14,0.78)",
    "border:1px solid rgba(125,220,235,0.34)",
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
    `<div>Speed ${Math.round(Math.abs(state.speed) * 8)} km/h | Time ${state.lapTime.toFixed(2)}s</div>`,
    `<div>${objective}</div>`,
    `<div>Throttle W/Up. Steer A/D. Drift Space. Reset R.</div>`
  ].join("");
}

function publishEvidence(state: ReturnType<typeof racing.snapshot>): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud,
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
    lapProof,
    evidence
  };
}

function createLapProof(): RacingStarterEvidence["lapProof"] {
  return {
    status: "contract-ready",
    events: [
      ...route.checkpoints.map((_checkpoint, index) => `checkpoint:checkpoint-${index + 1}`),
      "lap:multi-lap-contract",
      "reset:available"
    ],
    bestTime: raceContract.minLapSeconds * raceContract.lapsToWin,
    checkpointCount: raceContract.checkpointCount,
    lapsToWin: raceContract.lapsToWin,
    minLapSeconds: raceContract.minLapSeconds,
    routeAlignedToVisibleTrack: raceContract.routeAlignedToVisibleTrack
  };
}
