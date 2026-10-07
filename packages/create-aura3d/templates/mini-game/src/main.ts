import {
  camera,
  game,
  looks,
  material,
  model,
  scene,
  type AuraNodeBuilder,
  type AuraSceneNode,
  type GamePlatformerEvent,
  type GamePlatformerSnapshot
} from "@aura3d/engine";
import { createGame } from "@aura3d/engine/contracts";
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
  readonly look: { readonly id: string; readonly category: string };
  readonly animation: {
    readonly clip: string;
    readonly clips: readonly string[];
    readonly tracksApplied: number;
  };
  readonly camera: {
    readonly rig: string;
    readonly presented: boolean;
  };
  readonly evidence: { readonly entry: string; readonly typedAssets: number };
}

// The look sets palette + sky + sun + fog + grade; the scene adds only the
// foreground. Genre row (aura3d-browser-game): mini-game → outdoor-day.
const LOOK_ID = "outdoor-day" as const;

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

// Side-follow framing: the camera sits 10.4 m off the play plane and tracks
// the hero on x only (side-scroller). The C-22 rig is the live camera
// surface; `setPose` every frame applies state to the camera itself.
const CAMERA_OFFSET = { y: 3.45, z: 10.4, targetY: 0.47 } as const;

const input = game.input({
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    jump: ["Space", "KeyW", "ArrowUp"],
    dash: ["ShiftLeft", "ShiftRight"],
    down: ["KeyS", "ArrowDown"],
    reset: ["KeyR"]
  },
  axes: { moveX: { negative: "left", positive: "right" } },
  bufferMs: 140
});
const platformer = game.platformer(level);
const routeEvents: string[] = [];

const auraGame = createGame({
  id: "mini-game",
  target: document.querySelector<HTMLElement>("#app")!,
  scene: buildScene,
  qualityRebuild: { flags: [] }
});
const app = auraGame.app;
auraGame.start();

const player = app.nodes.require("mini-player");
const lift = app.nodes.require("platform-lift");
const coins = level.collectibles.map((coin) => [coin.id, app.nodes.require(`coin-${coin.id}`)] as const);
const checkpoint = app.nodes.require("checkpoint-mid");
const goal = app.nodes.require("goal");
const hudRoot = createHud();
let objective = "Collect stars, avoid the hazard, reach the gate";
let activeClip = "idle";
player.play("idle");

// Mount the C-22 camera surface when the extension is present (stub today,
// real controller under PRD 08): the rig pins the follow framing and each
// frame writes the actual pose. No camera state is parked in evidence.
app.camera?.use(
  camera.rigs.fromSpec({
    position: [level.start.x, level.start.y + CAMERA_OFFSET.y, CAMERA_OFFSET.z],
    target: [level.start.x, level.start.y + CAMERA_OFFSET.targetY, 0],
    fov: 50
  })
);

app.onFrame(({ dt }) => {
  input.update(dt);
  if (input.pressed("reset")) {
    platformer.reset();
    routeEvents.push("reset:Route reset");
    objective = "Collect stars, avoid the hazard, reach the gate";
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
    for (const event of state.events) updateObjective(event);
    remaining -= substep;
    firstSubstep = false;
  } while (remaining > 0.000_001);

  // The certified Oobi hero is feet-origin (GLB min y = 0), so the visual
  // rides at the physics point instead of a +0.5 lift.
  player.setPosition(state.player.x + 0.38, state.player.y + 0.01, 0);
  player.setRotation(0, state.player.facing === 1 ? Math.PI / 2 : -Math.PI / 2, 0);
  playLocomotionClip(state);
  lift.setPosition(level.movingPlatforms[0].x + level.movingPlatforms[0].width / 2, movingLiftY(state.time), 0);
  for (const [id, node] of coins) node.setVisible(!state.collected.includes(id));
  checkpoint.setVisible(!state.activatedCheckpoints.includes("mid"));
  goal.setScale(state.status === "completed" ? [1.35, 1.35, 1.35] : 1);
  app.camera?.setPose({
    position: [state.player.x, state.player.y + CAMERA_OFFSET.y, CAMERA_OFFSET.z],
    target: [state.player.x, state.player.y + CAMERA_OFFSET.targetY, 0]
  });
  renderHud(state);
  publishEvidence(state);
});

publishEvidence(platformer.snapshot());
renderHud(platformer.snapshot());
void auraGame.ready().then(() => {
  const diagnostics = app.diagnostics();
  document.body.dataset.aura3dReady = "true";
  document.body.dataset.aura3dRuntimeBackend = diagnostics.backend;
  document.body.dataset.aura3dDrawCalls = String(diagnostics.drawCalls);
  (window as unknown as { __AURA3D_ROUTE_READY__?: unknown }).__AURA3D_ROUTE_READY__ = { ready: true, diagnostics };
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});

function buildScene() {
  // Platform geometry comes from the typed platformer-kit block (catalog
  // `kenney/platformer-kit`, PRD 05 curated-kit swap is tracked as Q-05-3).
  // The kit's 2.08 × 1.0 m grass block scales to each collision rect.
  const block = assets.kenneyPlatformerKitBlockGrassLarge;
  const BLOCK_SIZE = [2.082, 1.0, 2.082] as const;
  const blockScale = (width: number, height: number, depth: number) =>
    [width / BLOCK_SIZE[0], height / BLOCK_SIZE[1], depth / BLOCK_SIZE[2]] as const;
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [
    ...level.platforms.map((platform) =>
      model(block, { name: `${platform.id} platform` })
        .position(platform.x + platform.width / 2, platform.y, -0.05)
        .scale(blockScale(platform.width, platform.height, 1.24))),
    ...level.movingPlatforms.map((platform) =>
      model(assets.kenneyPlatformerKitBrick, { name: `${platform.id} moving platform` })
        .position(platform.x + platform.width / 2, movingLiftY(0) - platform.height / 2, 0)
        .scale([platform.width / 0.5, platform.height / 0.5, 0.7])
        .runtime(game.runtimeNode("platform-lift", { tags: ["platform", "moving"] }))),
    // Stars are models, not primitives: emissive 3–5 reads as coin sparkle
    // under the daylight-outdoor grade.
    ...level.collectibles.map((coin) =>
      model(assets.kenneyPlatformerKitStar, {
        name: `${coin.id} collectible`,
        material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 4, roughness: 0.3 })
      })
        .position(coin.x, coin.y, 0.02)
        .scale(1.15)
        .runtime(game.runtimeNode(`coin-${coin.id}`, { tags: ["collectible"] }))),
    model(assets.kenneyPlatformerKitBrick, {
      name: "spikes hazard",
      material: material.emissive({ color: "#e5484d", emissive: "#e5484d", emissiveIntensity: 0.9, roughness: 0.4 })
    })
      .position(level.hazards[0].x + level.hazards[0].width / 2, level.hazards[0].y, 0.05)
      .scale([level.hazards[0].width / 0.5, level.hazards[0].height / 0.5, 0.5]),
    model(assets.kenneyPlatformerKitKey, { name: "checkpoint key" })
      .position(level.checkpoints[0].x, level.checkpoints[0].y + 0.2, 0.08)
      .scale(2)
      .runtime(game.runtimeNode("checkpoint-mid", { tags: ["checkpoint"] })),
    model(assets.kenneyPlatformerKitStar, {
      name: "finish gate",
      material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 3, roughness: 0.3 })
    })
      .position(level.finish.x, level.finish.y + 0.5, 0.08)
      .scale(3.4)
      .runtime(game.runtimeNode("goal", { tags: ["finish"] }))
  ];
  // The scene-level follow spec frames the hero today; the C-22 rig (mounted
  // above build) owns presented camera state once PRD 08 lands.
  return scene()
    .add(looks.preset(LOOK_ID))
    .add(
      model(assets.showcaseKenneyOobiPlatformerHero, { name: "certified hero" })
        .position(level.start.x + 0.38, level.start.y + 0.01, 0)
        .scale(1)
        .runtime(game.runtimeNode("mini-player", { tags: ["player"] }))
    )
    .addMany(nodes)
    .camera(
      camera.follow({
        targetNode: "mini-player",
        position: [level.start.x, level.start.y + CAMERA_OFFSET.y, CAMERA_OFFSET.z],
        target: [level.start.x, level.start.y + CAMERA_OFFSET.targetY, 0],
        fov: 50
      })
    );
}

function playLocomotionClip(state: GamePlatformerSnapshot): void {
  // C-19 stub surface: `play` switches clips immediately (`crossFadeTo` is the
  // PRD 06 blend path on the same handle when it lands).
  const next = !state.player.grounded
    ? state.player.vy > 0 ? "jump" : "fall"
    : Math.abs(state.player.vx) > level.dashSpeed * 0.7 ? "sprint"
      : Math.abs(state.player.vx) > 0.4 ? "walk" : "idle";
  if (next === activeClip) return;
  activeClip = next;
  player.play(next);
}

function updateObjective(event: GamePlatformerEvent): void {
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
  root.style.cssText = "position:absolute;left:16px;top:16px;z-index:5;min-width:260px;font:600 13px/1.35 Inter,system-ui,sans-serif;color:#f5fbff;background:rgba(6,18,26,.66);border:1px solid rgba(160,210,240,.34);border-radius:8px;padding:12px;pointer-events:none";
  document.body.append(root);
  return root;
}

function renderHud(state: GamePlatformerSnapshot): void {
  hudRoot.innerHTML = `<strong>Aura3D Mini Game</strong><div>Score ${state.score} | Lives ${state.lives} | Deaths ${state.deaths}</div><div>Checkpoint ${state.checkpointId}</div><div>${objective}</div><div>Move A/D or arrows. Jump Space. Dash Shift. Reset R.</div>`;
}

function publishEvidence(state: GamePlatformerSnapshot): void {
  const animation = player.importedAssetEvidence();
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
    look: { id: LOOK_ID, category: looks.describe(LOOK_ID).category },
    animation: {
      clip: activeClip,
      clips: animation?.clips ?? [],
      // Report-only while the C-19 handle is a stub (T3.1 test reads it).
      tracksApplied: animation?.lastMaterialTracksApplied ?? 0
    },
    camera: {
      rig: app.camera?.rig.id ?? "scene-follow",
      presented: app.camera !== undefined
    },
    evidence: { entry: "@aura3d/engine + @aura3d/engine/contracts createGame", typedAssets: Object.keys(assets).length }
  };
}
