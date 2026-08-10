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
    __AURA3D_MINI_GAME__?: MiniGameEvidence;
  }
}

interface MiniGameEvidence {
  readonly status: string;
  readonly frame: number;
  readonly score: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly collected: readonly string[];
  readonly player: {
    readonly x: number;
    readonly y: number;
    readonly grounded: boolean;
  };
  readonly events: readonly string[];
  readonly evidence: unknown;
}

const level = {
  start: { x: 0, y: 0.35 },
  finish: { x: 12.4, y: 0.35 },
  platforms: [
    { id: "launch", x: -0.6, y: 0, width: 4.2, height: 0.35 },
    { id: "middle", x: 3.8, y: 0.62, width: 3.2, height: 0.3 },
    { id: "finish", x: 8.2, y: 0.18, width: 4.8, height: 0.35 }
  ],
  movingPlatforms: [
    { id: "lift", x: 6.9, y: 1.05, width: 1.35, height: 0.22, axis: "y" as const, amplitude: 0.42, period: 2.4 }
  ],
  collectibles: [
    { id: "coin-01", x: 1.4, y: 1.15, value: 50, radius: 0.55 },
    { id: "coin-02", x: 4.8, y: 1.45, value: 75, radius: 0.55 },
    { id: "coin-03", x: 9.8, y: 1.05, value: 100, radius: 0.55 }
  ],
  hazards: [
    { id: "spikes", x: 7.7, y: 0.42, width: 0.85, height: 0.24 }
  ],
  checkpoints: [
    { id: "mid", x: 5.2, y: 0.92, radius: 0.8 }
  ],
  lowerBound: -2.4,
  moveSpeed: 5.2,
  jumpVelocity: 8,
  dashSpeed: 9.5
};

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["Space", "KeyW", "ArrowUp"],
    dash: ["ShiftLeft", "ShiftRight"],
    down: ["KeyS", "ArrowDown"],
    reset: ["KeyR"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" }
  },
  bufferMs: 140
});

const platformer = game.platformer(level);
const routeEvents = game.eventLog({ label: "mini game route events", maxEvents: 16 });
const hud = game.hud.bindings([
  game.hud.score({ valuePath: "appState.score" }),
  game.hud.lives({ valuePath: "appState.lives" }),
  game.hud.objective({ valuePath: "appState.objective" }),
  game.hud.checkpoint({ valuePath: "appState.checkpoint" }),
  game.hud.eventLog({ valuePath: "appState.events" })
]);

const app = createAuraApp("#app", {
  diagnostics: { overlay: true, performancePanel: true },
  scene: buildScene()
});

const player = app.nodes.require("mini-player");
const lift = app.nodes.require("platform-lift");
const coins = level.collectibles.map((coin) => [coin.id, app.nodes.require(`coin-${coin.id}`)] as const);
const checkpoint = app.nodes.require("checkpoint-mid");
const goal = app.nodes.require("goal");
const hudRoot = createHud();

let objective = "Collect coins, avoid spikes, reach the goal";

app.onFrame(({ dt }: { readonly dt: number }) => {
  input.update(dt);
  if (input.pressed("reset")) {
    platformer.reset();
    routeEvents.push({ type: "reset", label: "Route reset" });
    objective = "Collect coins, avoid spikes, reach the goal";
  }

  const moveX = input.axis("moveX");
  const jumpPressed = input.buffered("jump");
  const jumpHeld = input.held("jump");
  const dashPressed = input.pressed("dash");
  const fastFall = input.held("down");
  let remaining = Math.min(0.25, Math.max(0, dt));
  let firstSubstep = true;
  let state = platformer.snapshot();
  do {
    const substep = Math.min(0.05, remaining || 1 / 60);
    state = platformer.step(substep, {
      moveX,
      jumpPressed: firstSubstep && jumpPressed,
      jumpHeld,
      dashPressed: firstSubstep && dashPressed,
      fastFall
    });
    for (const event of state.events) {
      routeEvents.push({
        type: event.type,
        label: event.id ? `${event.type}:${event.id}` : event.type,
        targetId: event.id,
        severity: event.type === "complete" || event.type === "collect" ? "success" : event.type === "hazard" || event.type === "fall" ? "warning" : "info",
        frame: event.frame,
        time: event.time
      });
      if (event.type === "checkpoint") objective = "Checkpoint reached. Finish the route.";
      if (event.type === "complete") objective = "Finished. Press R to replay.";
      if (event.type === "respawn") objective = "Respawned. Take the safer route.";
    }
    remaining -= substep;
    firstSubstep = false;
  } while (remaining > 0.000_001);

  player.setPosition(state.player.x, state.player.y + 0.54, 0);
  lift.setPosition(level.movingPlatforms[0].x + level.movingPlatforms[0].width / 2, movingLiftY(state.time), 0);
  for (const [id, node] of coins) node.setVisible(!state.collected.includes(id));
  checkpoint.setVisible(!state.activatedCheckpoints.includes("mid"));
  goal.setScale(state.status === "completed" ? [0.28, 1.08, 0.18] : [0.22, 0.92, 0.16]);

  renderHud(state);
  publishEvidence(state);
});

publishEvidence(platformer.snapshot());
renderHud(platformer.snapshot());

function buildScene() {
  const nodes: AuraNodeInput[] = [
    model(assets.playerModel, { name: "typed mini-game player", castShadow: true })
      .position(level.start.x, level.start.y + 0.54, 0)
      .scale(0.42)
      .runtime(game.runtimeNode("mini-player", { tags: ["player", "typed-asset", "runtime"] })),
    ...level.platforms.map((platform) =>
      primitives.box({ name: `${platform.id} platform`, material: material.neon({ color: "#62d8ef", emissive: "#62d8ef", emissiveIntensity: 0.18 }) })
        .position(platform.x + platform.width / 2, platform.y + platform.height / 2, -0.05)
        .scale([platform.width, platform.height, 0.22])
    ),
    primitives.box({ name: "moving lift platform", material: material.neon({ color: "#b5f77d", emissive: "#b5f77d", emissiveIntensity: 0.35 }) })
      .position(level.movingPlatforms[0].x + level.movingPlatforms[0].width / 2, movingLiftY(0), 0)
      .scale([level.movingPlatforms[0].width, level.movingPlatforms[0].height, 0.22])
      .runtime(game.runtimeNode("platform-lift", { tags: ["moving-platform", "runtime"] })),
    ...level.collectibles.map((coin) =>
      primitives.sphere({ name: `${coin.id} collectible`, material: material.neon({ color: "#f7d76b", emissive: "#f7d76b", emissiveIntensity: 0.7 }) })
        .position(coin.x, coin.y, 0.02)
        .scale(0.18)
        .runtime(game.runtimeNode(`coin-${coin.id}`, { tags: ["coin", "runtime"] }))
    ),
    primitives.box({ name: "hazard spikes", material: material.neon({ color: "#f06b7a", emissive: "#f06b7a", emissiveIntensity: 0.7 }) })
      .position(level.hazards[0].x + level.hazards[0].width / 2, level.hazards[0].y + level.hazards[0].height / 2, 0.05)
      .scale([level.hazards[0].width, level.hazards[0].height, 0.2]),
    primitives.box({ name: "checkpoint marker", material: material.neon({ color: "#9df59e", emissive: "#9df59e", emissiveIntensity: 0.65 }) })
      .position(level.checkpoints[0].x, level.checkpoints[0].y + 0.42, 0.08)
      .scale([0.14, 0.85, 0.14])
      .runtime(game.runtimeNode("checkpoint-mid", { tags: ["checkpoint", "runtime"] })),
    primitives.box({ name: "finish portal", material: material.neon({ color: "#ffad57", emissive: "#ffad57", emissiveIntensity: 0.82 }) })
      .position(level.finish.x, level.finish.y + 0.7, 0.08)
      .scale([0.22, 0.92, 0.16])
      .runtime(game.runtimeNode("goal", { tags: ["finish", "runtime"] }))
  ];

  return scene()
    .background("#071015")
    .addMany(nodes)
    .add(lights.ambient({ name: "game ambient", intensity: 0.38, color: "#d9f8ff" }))
    .add(lights.directional({ name: "game key", position: [4, 6, 5], intensity: 1.2, color: "#ffffff" }))
    .camera(camera.perspective({ position: [5.8, 4.3, 8.5], target: [5.8, 0.9, 0], fov: 44 }));
}

function movingLiftY(time: number): number {
  const platform = level.movingPlatforms[0];
  return platform.y + platform.height / 2 + Math.sin((time / platform.period) * Math.PI * 2) * platform.amplitude;
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "mini-game-hud";
  root.style.cssText = [
    "position:absolute",
    "left:16px",
    "top:16px",
    "z-index:5",
    "min-width:260px",
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

function renderHud(state: ReturnType<typeof platformer.snapshot>): void {
  hudRoot.innerHTML = [
    `<strong>Aura3D Mini Game</strong>`,
    `<div>Score ${state.score} | Lives ${state.lives} | Deaths ${state.deaths}</div>`,
    `<div>Checkpoint ${state.checkpointId}</div>`,
    `<div>${objective}</div>`,
    `<div>Move A/D or arrows. Jump Space. Dash Shift. Reset R.</div>`
  ].join("");
}

function publishEvidence(state: ReturnType<typeof platformer.snapshot>): void {
  const evidence = app.evidence({
    input,
    events: routeEvents,
    hud,
    appState: {
      score: state.score,
      lives: state.lives,
      objective,
      checkpoint: state.checkpointId,
      events: routeEvents.events().map((event: { readonly label: string }) => event.label)
    },
    assets: {
      typedAssets: Object.keys(assets).length,
      missingAssets: []
    },
    source: { expectsGame: true }
  });
  window.__AURA3D_MINI_GAME__ = {
    status: state.status,
    frame: state.frame,
    score: state.score,
    deaths: state.deaths,
    checkpointId: state.checkpointId,
    collected: state.collected,
    player: {
      x: state.player.x,
      y: state.player.y,
      grounded: state.player.grounded
    },
    events: routeEvents.events().map((event: { readonly label: string }) => event.label),
    evidence
  };
}
