import {
  camera,
  createAuraApp,
  game,
  material,
  model,
  primitives,
  scene,
  type AuraLeanNodeBuilder,
  type LeanPlatformerEvent
} from "@aura3d/lean/game";
import { assets } from "./aura-assets";

declare global {
  interface Window { __AURA3D_MINI_GAME__?: MiniGameEvidence }
}

interface MiniGameEvidence {
  readonly status: string;
  readonly frame: number;
  readonly score: number;
  readonly deaths: number;
  readonly checkpointId: string;
  readonly collected: readonly string[];
  readonly hero: { readonly assetId: string; readonly url: string };
  readonly player: { readonly x: number; readonly y: number; readonly grounded: boolean };
  readonly events: readonly string[];
  readonly cameraRig: { readonly kind: string; readonly position: readonly [number, number, number] };
  readonly gameFeel: { readonly trauma: number; readonly frozen: boolean };
  readonly debugDraw: boolean;
  readonly governor: { readonly resolutionScale: number; readonly particleScale: number };
  readonly evidence: { readonly entry: string; readonly physics: string; readonly typedAssets: number };
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
  hazards: [{ id: "spikes", x: 7.7, y: 0.42, width: 0.85, height: 0.24 }],
  checkpoints: [{ id: "mid", x: 5.2, y: 0.92, radius: 0.8 }],
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
    reset: ["KeyR"],
    debug: ["KeyT"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 140
});
const platformer = game.platformer(level);
// J3 scaffold surface: camera rig frames the opening shot, game feel adds
// trauma/shake on impacts, the debug toggle gates overlays, and the lean perf
// governor degrades resolution/particle scale when frames run long.
const cameraRig = game.cameraRig({ kind: "side-view-follow", offset: [0, 2.98, 10.4] });
const gameFeel = game.gameFeel();
const debugDraw = game.debugDraw();
const governor = game.performanceGovernor("conservative");
const routeEvents: string[] = [];
const app = createAuraApp("#app", { scene: buildScene() });
const player = app.nodes.require("mini-player");
const lift = app.nodes.require("platform-lift");
const coins = level.collectibles.map((coin) => [coin.id, app.nodes.require(`coin-${coin.id}`)] as const);
const checkpoint = app.nodes.require("checkpoint-mid");
const goal = app.nodes.require("goal");
const hudRoot = createHud();
let objective = "Collect coins, avoid spikes, reach the goal";

app.onFrame((dt) => {
  input.update(dt);
  governor.step(Math.max(0, dt) * 1000);
  gameFeel.update(Math.max(0, dt));
  if (input.pressed("debug")) debugDraw.toggle();
  if (input.pressed("reset")) {
    platformer.reset();
    routeEvents.push("reset:Route reset");
    objective = "Collect coins, avoid spikes, reach the goal";
  }
  const moveX = input.axis("moveX");
  const jumpPressed = input.buffered("jump");
  const dashPressed = input.pressed("dash");
  let remaining = Math.min(0.25, Math.max(0, dt));
  let firstSubstep = true;
  let state = platformer.snapshot();
  do {
    const substep = Math.min(0.05, remaining || 1 / 60);
    state = platformer.step(substep, {
      moveX,
      jumpPressed: firstSubstep && jumpPressed,
      jumpHeld: input.held("jump"),
      dashPressed: firstSubstep && dashPressed,
      fastFall: input.held("down")
    });
    for (const event of state.events) {
      updateObjective(event);
      if (event.type === "collect") gameFeel.addTrauma(0.25);
      if (event.type === "hazard" || event.type === "fall") {
        gameFeel.addTrauma(0.7);
        gameFeel.hitStop();
      }
      if (event.type === "land") gameFeel.addTrauma(0.12);
    }
    remaining -= substep;
    firstSubstep = false;
  } while (remaining > 0.000_001);

  // The certified Oobi hero is feet-origin (GLB min y = 0), so the visual
  // rides at the physics point instead of the old fixture's +0.5 lift.
  player.setPosition(state.player.x + 0.38, state.player.y + 0.01, 0);
  lift.setPosition(level.movingPlatforms[0].x + level.movingPlatforms[0].width / 2, movingLiftY(state.time), 0);
  for (const [id, node] of coins) node.setVisible(!state.collected.includes(id));
  checkpoint.setVisible(!state.activatedCheckpoints.includes("mid"));
  goal.setScale(state.status === "completed" ? [0.28, 1.08, 0.18] : [0.22, 0.92, 0.16]);
  renderHud(state);
  publishEvidence(state);
});

publishEvidence(platformer.snapshot());
renderHud(platformer.snapshot());
void app.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.runtimeBackend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});

function buildScene() {
  const nodes: AuraLeanNodeBuilder[] = [
    ...level.platforms.map((platform) => primitives.box({ name: `${platform.id} platform`, material: material.pbr({ color: "#62d8ef", roughness: 0.28 }) })
      .position(platform.x + platform.width / 2, platform.y + platform.height / 2, -0.05).scale([platform.width, platform.height, 0.22])),
    primitives.box({ name: "moving lift platform", material: material.pbr({ color: "#b5f77d", roughness: 0.24 }) })
      .position(level.movingPlatforms[0].x + level.movingPlatforms[0].width / 2, movingLiftY(0), 0)
      .scale([level.movingPlatforms[0].width, level.movingPlatforms[0].height, 0.22]).runtime("platform-lift"),
    ...level.collectibles.map((coin) => primitives.sphere({ name: `${coin.id} collectible`, material: material.pbr({ color: "#f7d76b", metallic: 0.35, roughness: 0.22 }) })
      .position(coin.x, coin.y, 0.02).scale(0.18).runtime(`coin-${coin.id}`)),
    primitives.box({ name: "hazard spikes", material: material.pbr({ color: "#f06b7a", roughness: 0.2 }) })
      .position(level.hazards[0].x + level.hazards[0].width / 2, level.hazards[0].y + level.hazards[0].height / 2, 0.05)
      .scale([level.hazards[0].width, level.hazards[0].height, 0.2]),
    primitives.box({ name: "checkpoint marker", material: material.pbr({ color: "#9df59e", roughness: 0.2 }) })
      .position(level.checkpoints[0].x, level.checkpoints[0].y + 0.42, 0.08).scale([0.14, 0.85, 0.14]).runtime("checkpoint-mid"),
    primitives.box({ name: "finish portal", material: material.pbr({ color: "#ffad57", metallic: 0.2, roughness: 0.18 }) })
      .position(level.finish.x, level.finish.y + 0.7, 0.08).scale([0.22, 0.92, 0.16]).runtime("goal")
  ];
  // Opening shot is framed by the side-view camera rig. The offset reproduces
  // the certified framing exactly (position [6.1, 3.8, 10.4], target
  // [6.1, 0.82, 0]) so screenshot baselines do not shift.
  const opening = cameraRig.snap([6.1, 0.82, 0]);
  return scene().background("#071015")
    .add(model(assets.showcaseKenneyOobiPlatformerHero, { name: "certified hero vehicle-driver" }).position(level.start.x + 0.38, level.start.y + 0.01, 0).scale(1).runtime("mini-player"))
    .addMany(nodes)
    .camera(camera.perspective({ position: [opening[0], opening[1], opening[2]], target: [6.1, 0.82, 0], fov: 46 }));
}

function updateObjective(event: LeanPlatformerEvent): void {
  routeEvents.push(event.id ? `${event.type}:${event.id}` : event.type);
  if (routeEvents.length > 16) routeEvents.shift();
  if (event.type === "checkpoint") objective = "Checkpoint reached. Finish the route.";
  if (event.type === "complete") objective = "Finished. Press R to replay.";
  if (event.type === "respawn") objective = "Respawned. Take the safer route.";
}

function movingLiftY(time: number): number {
  const platform = level.movingPlatforms[0];
  return platform.y + platform.height / 2 + Math.sin((time / platform.period) * Math.PI * 2) * platform.amplitude;
}

function createHud(): HTMLElement {
  const root = document.createElement("aside");
  root.id = "mini-game-hud";
  root.style.cssText = "position:absolute;left:16px;top:16px;z-index:5;min-width:260px;font:600 13px/1.35 Inter,system-ui,sans-serif;color:#f5fbff;background:rgba(3,9,14,.78);border:1px solid rgba(125,220,235,.34);border-radius:8px;padding:12px;pointer-events:none";
  document.body.append(root);
  return root;
}

function renderHud(state: ReturnType<typeof platformer.snapshot>): void {
  hudRoot.innerHTML = `<strong>Aura3D Mini Game</strong><div>Score ${state.score} | Lives ${state.lives} | Deaths ${state.deaths}</div><div>Checkpoint ${state.checkpointId}</div><div>${objective}</div><div>Move A/D or arrows. Jump Space. Dash Shift. Reset R.</div>`;
}

function publishEvidence(state: ReturnType<typeof platformer.snapshot>): void {
  window.__AURA3D_MINI_GAME__ = {
    status: state.status,
    frame: state.frame,
    score: state.score,
    deaths: state.deaths,
    checkpointId: state.checkpointId,
    collected: state.collected,
    hero: { assetId: assets.showcaseKenneyOobiPlatformerHero.id, url: assets.showcaseKenneyOobiPlatformerHero.url },
    player: { x: state.player.x, y: state.player.y, grounded: state.player.grounded },
    events: [...routeEvents],
    cameraRig: { kind: cameraRig.kind, position: cameraRig.follow([state.player.x, state.player.y, 0], 1 / 60) },
    gameFeel: gameFeel.snapshot(),
    debugDraw: debugDraw.enabled,
    governor: { ...governor.settings },
    evidence: { entry: "@aura3d/lean/game", physics: "solver-free deterministic arcade", typedAssets: Object.keys(assets).length }
  };
}
