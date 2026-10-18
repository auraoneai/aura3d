/**
 * PRISM BREAK — a circular brick-breaker.
 *
 * The arena is a ring, not a box. The paddle orbits the rim, the bricks sit in
 * concentric rings, and the ball never leaves play: the rim is a hard wall that
 * bounces it back whether or not you were there to meet it. Missing the paddle
 * costs you a strike rather than a ball, so the pressure is on positioning
 * rather than on a save.
 *
 * The mechanic that is ours: the core can split into up to three independently
 * scoring shards, and every split shrinks the paddle arc. More scoring surface,
 * less defence, on the same key.
 */
import {
  camera,
  game,
  gameFeel,
  instances,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraColor,
  type AuraNodeInput,
  type AuraRuntimeNodeHandle,
  type AuraTransformSpec,
  type AuraVec3
} from "@aura3d/engine";
import { createGame, sfxUrl } from "@aura3d/engine/game";
import { assets } from "./aura-assets";

const LOOK_ID = "neon-arcade" as const;

// ── arena geometry ───────────────────────────────────────────────────────────
// ARENA_Z exists because of an engine bug, not a design choice. The compiled
// scene enables frustum culling (agent-api/compiler/renderInput.ts sets
// frustumCulling: true) but the frustum it culls with does not match the posed
// camera: every render item whose world bounds sit at negative Z is culled,
// while primitives with large bounds survive. That silently deleted the far half
// of the arena — bricks, paddle and ball all vanished past z=0. Offsetting the
// whole arena into positive Z keeps every gameplay object inside the working
// half of the frustum. Remove ARENA_Z once the frustum tracks the camera.
const ARENA_Z = 4.2;

const RIM_R = 3.35;
const PLAY_R = 2.95; // ball reflects at the rim's inner face
const PADDLE_R = 2.78; // in the clear gap: outside the brick rings (2.35), inside the rim (3.0)
const BALL_R = 0.13;
const BALL_Y = 0.30;
const BRICK_Y = 0.22;
const PADDLE_Y = 0.46;

const RINGS = [2.35, 1.95, 1.55, 1.15] as const;
const BRICK_SLOTS = 96; // fixed instanced capacity; dead bricks park at scale 0
const RING_COLORS: readonly AuraColor[] = ["#4de8ff", "#7be0ff", "#b987d0", "#ff7ab8"];

const BASE_PADDLE_HALF_WIDTH = 0.30; // radians
const PADDLE_SLOTS = 9; // fixed instanced capacity for the segmented paddle
const SPLIT_SHRINK = 0.8;
const MAX_BALLS = 3;
const BASE_SPEED = 4.6;
const SPEED_PER_WAVE = 0.24;
const MAX_SPEED = 9.2;
const MAX_STRIKES = 5;
const STRIKE_COOLDOWN_MS = 1100;

// Meshy bounds (metres) from aura.assets.json — used to scale each GLB to the
// size the layout actually wants rather than trusting the export.
const BRICK_BOUNDS = assets.prismBrick.bounds;
const PADDLE_BOUNDS = assets.prismPaddle.bounds;

interface Brick {
  readonly ring: number;
  readonly index: number;
  readonly angle: number;
  readonly radius: number;
  readonly arc: number;
  alive: boolean;
}

interface Ball {
  x: number;
  z: number;
  vx: number;
  vz: number;
}

interface PrismBreakEvidence {
  readonly frame: number;
  readonly score: number;
  readonly wave: number;
  readonly strikes: number;
  readonly balls: number;
  readonly paddleArcDeg: number;
  readonly aliveBricks: number;
  readonly totalBricks: number;
  readonly gameOver: boolean;
  readonly look: { readonly id: string };
  readonly assetIds: readonly string[];
}

declare global {
  interface Window {
    __AURA3D_PRISM_BREAK__?: PrismBreakEvidence;
  }
}

const inputOptions = {
  actions: {
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    split: ["Space"],
    restart: ["KeyR"]
  },
  bufferMs: 110
} as const;

const gameEvents = game.eventLog({ label: "prism break events", maxEvents: 24 });

// ── state ────────────────────────────────────────────────────────────────────
// Declared before createGame because createGame invokes the scene factory
// immediately, and buildScene() reads this state to lay out the brick ring.
let bricks: Brick[] = [];
let balls: Ball[] = [];
let paddleAngle = -Math.PI / 2;
let paddleTarget = -Math.PI / 2;
let paddleHalfWidth = BASE_PADDLE_HALF_WIDTH;
let score = 0;
let wave = 1;
let strikes = 0;
let strikeCooldownUntil = 0;
let speed = BASE_SPEED;
let gameOver = false;
let frameCount = 0;

let brickNode: AuraRuntimeNodeHandle | undefined;
const ballNodes: AuraRuntimeNodeHandle[] = [];

const prismGame = createGame({
  id: "prism-break",
  target: "#app",
  diagnostics: { overlay: false, performancePanel: false },
  scene: () => buildScene(),
  input: inputOptions,
  hud: { theme: "arcade-neon", widgets: [] },
  touch: {
    preset: "dpad-2btn",
    bindings: { left: "left", right: "right", dash: "split", jump: "split", attack: "split" }
  },
  sound: {
    cues: {
      paddle: { id: "paddle", asset: { url: sfxUrl("ui.toggle.00") }, volume: 0.45 },
      brick: { id: "brick", asset: { url: sfxUrl("impact.wood.medium.00") }, volume: 0.5 },
      rim: { id: "rim", asset: { url: sfxUrl("ui.toggle.01") }, volume: 0.3 },
      wave: { id: "wave", asset: { url: sfxUrl("pickup.coin.00") }, volume: 0.8 },
      lose: { id: "lose", asset: { url: sfxUrl("stinger.lose.00") }, volume: 0.8 }
    }
  },
  juice: {
    paddle: { punch: { fovDeg: 0.9, ms: 160 }, shake: 0.12 },
    brick: { flash: { color: "#4de8ff", peak: 0.14, ms: 160 }, shake: 0.1 },
    rim: { flash: { color: "#ff5d7d", peak: 0.26, ms: 220 }, shake: 0.3 },
    wave: { flash: { color: "#ffd166", peak: 0.22, ms: 320 }, punch: { fovDeg: 2.2, ms: 300 } },
    lose: { flash: { color: "#ff5d7d", peak: 0.34, ms: 420 }, vignette: { amount: 0.6, ms: 900 } }
  },
  qualityRebuild: { flags: ["game"] },
  evidence: {
    schema: 1,
    sections: { prismBreak: () => window.__AURA3D_PRISM_BREAK__ ?? { status: "unbound" } }
  }
});

const app = prismGame.app;
const input = prismGame.input;
if (!input) throw new Error("prism-break failed to create runtime-owned input.");

// ── build ────────────────────────────────────────────────────────────────────
await app.ready();

// The camera is declared on the scene only. Applying a separate runtime rig
// here desynced the frustum the renderer culls with from the camera it draws
// with, which silently culled every object at negative Z — the whole far half
// of the arena. One camera, one frustum.
const feel = gameFeel.create({ app, time: app.time });
app.feel?.preset("arcade");

buildWave(1);
mountNodes();
prismGame.start();
hideBootGate();

app.onFrame(({ dt }) => {
  const step = Math.min(dt, 0.05);
  feel.update(step * 1000);
  frameCount += 1;
  // Restart is read before the game-over early return. Handling it inside
  // stepInput() meant a lost run could never be restarted, because stepInput
  // is skipped once gameOver is true.
  if (input!.pressed("restart")) restartRun();
  if (gameOver) {
    render();
    publish();
    return;
  }
  stepInput(step);
  stepBalls(step);
  render();
  publish();
});

// ── input ────────────────────────────────────────────────────────────────────
const canvas = app.canvas;
if (canvas) {
  canvas.addEventListener("pointermove", (event) => {
    if (gameOver) return;
    const rect = canvas.getBoundingClientRect();
    const dx = (event.clientX - rect.left - rect.width / 2) / (rect.width / 2);
    const dy = (event.clientY - rect.top - rect.height / 2) / (rect.height / 2);
    if (Math.hypot(dx, dy) < 0.08) return; // dead zone at the centre
    paddleTarget = Math.atan2(dy, dx);
  });
  canvas.addEventListener("pointerdown", () => cycleSplit());
}

function stepInput(dt: number): void {
  const turn = 3.1 * dt;
  if (input!.pressed("left")) paddleTarget -= turn;
  if (input!.pressed("right")) paddleTarget += turn;
  if (input!.pressed("split")) cycleSplit();

  // shortest-arc approach so the paddle never spins the long way round
  let delta = paddleTarget - paddleAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  paddleAngle += delta * Math.min(1, dt * 16);
}

function cycleSplit(): void {
  if (gameOver) return;
  if (balls.length >= MAX_BALLS) {
    balls = balls.slice(0, 1);
    paddleHalfWidth = BASE_PADDLE_HALF_WIDTH;
    gameEvents.push({ type: "recall", label: "recall shards" });
    return;
  }
  const source = balls[0];
  if (!source) return;
  const spread = balls.length === 1 ? 0.38 : -0.38;
  const cos = Math.cos(spread);
  const sin = Math.sin(spread);
  balls.push({
    x: source.x,
    z: source.z,
    vx: source.vx * cos - source.vz * sin,
    vz: source.vx * sin + source.vz * cos
  });
  paddleHalfWidth = Math.max(0.16, paddleHalfWidth * SPLIT_SHRINK);
  gameEvents.push({ type: "split", label: `split to ${balls.length}` });
}

// ── simulation ───────────────────────────────────────────────────────────────
function stepBalls(dt: number): void {
  for (const ball of balls) {
    ball.x += ball.vx * dt;
    ball.z += ball.vz * dt;
    resolveBricks(ball);
    resolveRim(ball);
  }
}

function resolveBricks(ball: Ball): void {
  for (const brick of bricks) {
    if (!brick.alive) continue;
    const bx = Math.cos(brick.angle) * brick.radius;
    const bz = Math.sin(brick.angle) * brick.radius;
    const dx = ball.x - bx;
    const dz = ball.z - bz;
    const hitRadius = Math.min(brick.arc * brick.radius, 0.40) * 0.55 + BALL_R;
    const distSq = dx * dx + dz * dz;
    if (distSq > hitRadius * hitRadius || distSq < 1e-6) continue;

    brick.alive = false;
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const nz = dz / dist;
    const dot = ball.vx * nx + ball.vz * nz;
    ball.vx -= 2 * dot * nx;
    ball.vz -= 2 * dot * nz;
    ball.x = bx + nx * (hitRadius + 0.01);
    ball.z = bz + nz * (hitRadius + 0.01);

    score += Math.round(10 * (1 + wave * 0.12));
    gameEvents.push({ type: "brick", label: "brick", severity: "info" });
    void prismGame.sound?.cue("brick");
    prismGame.juice.fire("brick");
  }
  if (bricks.every((brick) => !brick.alive)) nextWave();
}

function resolveRim(ball: Ball): void {
  const radius = Math.hypot(ball.x, ball.z);
  if (radius < PLAY_R - BALL_R) return;

  const nx = ball.x / radius;
  const nz = ball.z / radius;
  const ballAngle = Math.atan2(nz, nx);

  let delta = ballAngle - paddleAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const onPaddle = Math.abs(delta) <= paddleHalfWidth;

  // reflect off the rim normal either way: the ball never leaves play
  const dot = ball.vx * nx + ball.vz * nz;
  ball.vx -= 2 * dot * nx;
  ball.vz -= 2 * dot * nz;

  if (onPaddle) {
    // steer: the offset from the paddle centre bends the return angle
    const steer = (delta / Math.max(paddleHalfWidth, 1e-3)) * 0.55;
    const cos = Math.cos(steer);
    const sin = Math.sin(steer);
    const vx = ball.vx * cos - ball.vz * sin;
    const vz = ball.vx * sin + ball.vz * cos;
    ball.vx = vx;
    ball.vz = vz;
    const mag = Math.hypot(ball.vx, ball.vz) || 1;
    const targetSpeed = Math.min(MAX_SPEED, mag * 1.015);
    ball.vx = (ball.vx / mag) * targetSpeed;
    ball.vz = (ball.vz / mag) * targetSpeed;
    score += 1;
    void prismGame.sound?.cue("paddle");
    prismGame.juice.fire("paddle");
  } else {
    // A strike has a cooldown. Without one, a single fast traverse of the arena
    // can bounce off the rim three times and end the run in under two seconds,
    // which reads as a broken game rather than a hard one.
    const now = performance.now();
    if (now < strikeCooldownUntil) {
      const mag = Math.hypot(ball.vx, ball.vz) || 1;
      ball.vx = (ball.vx / mag) * Math.max(BASE_SPEED * 0.9, mag * 0.97);
      ball.vz = (ball.vz / mag) * Math.max(BASE_SPEED * 0.9, mag * 0.97);
    } else {
      strikeCooldownUntil = now + STRIKE_COOLDOWN_MS;
      strikes += 1;
      const mag = Math.hypot(ball.vx, ball.vz) || 1;
      const slowed = Math.max(BASE_SPEED * 0.9, mag * 0.94);
      ball.vx = (ball.vx / mag) * slowed;
      ball.vz = (ball.vz / mag) * slowed;
      void prismGame.sound?.cue("rim");
      prismGame.juice.fire("rim");
      gameEvents.push({ type: "strike", label: `strike ${strikes}`, severity: "warning" });
      if (strikes >= MAX_STRIKES) endRun();
    }
  }

  const clamped = PLAY_R - BALL_R - 0.005;
  ball.x = nx * clamped;
  ball.z = nz * clamped;
}

function nextWave(): void {
  wave += 1;
  score += 250;
  speed = Math.min(MAX_SPEED, BASE_SPEED + (wave - 1) * SPEED_PER_WAVE);
  paddleHalfWidth = BASE_PADDLE_HALF_WIDTH;
  void prismGame.sound?.cue("wave");
  prismGame.juice.fire("wave");
  gameEvents.push({ type: "wave", label: `wave ${wave}`, severity: "success" });
  buildWave(wave);
  syncBricks();
  resetBalls();
}

function endRun(): void {
  gameOver = true;
  void prismGame.sound?.cue("lose");
  prismGame.juice.fire("lose");
  gameEvents.push({ type: "game-over", label: "run over", severity: "warning" });
}

function restartRun(): void {
  score = 0;
  wave = 1;
  strikes = 0;
  strikeCooldownUntil = 0;
  speed = BASE_SPEED;
  gameOver = false;
  paddleHalfWidth = BASE_PADDLE_HALF_WIDTH;
  buildWave(1);
  syncBricks();
  resetBalls();
  gameEvents.push({ type: "restart", label: "restart" });
}

function resetBalls(): void {
  balls = [spawnBall()];
}

function spawnBall(): Ball {
  const angle = Math.random() * Math.PI * 2;
  return {
    x: Math.cos(angle) * 0.35,
    z: Math.sin(angle) * 0.35,
    vx: Math.cos(angle) * speed,
    vz: Math.sin(angle) * speed
  };
}

function buildWave(currentWave: number): void {
  bricks = [];
  for (let ring = 0; ring < RINGS.length; ring += 1) {
    const radius = RINGS[ring]!;
    const count = Math.max(6, Math.round((Math.PI * 2 * radius) / 0.66));
    const arc = (Math.PI * 2) / count;
    for (let index = 0; index < count; index += 1) {
      if (!brickAlive(ring, index, currentWave)) continue;
      bricks.push({ ring, index, angle: index * arc + ring * 0.11, radius, arc, alive: true });
    }
  }
  if (bricks.length === 0) {
    // a wave pattern must never leave the arena empty
    bricks.push({ ring: 0, index: 0, angle: 0, radius: RINGS[0]!, arc: 0.3, alive: true });
  }
}

function brickAlive(ring: number, index: number, currentWave: number): boolean {
  const pattern = ((currentWave - 1) % 6) + 1;
  switch (pattern) {
    case 1:
      return true;
    case 2:
      return (index + ring) % 3 !== 0;
    case 3:
      return ring <= 2;
    case 4:
      return (index + ring) % 2 === 0;
    case 5:
      return ring !== 1;
    case 6:
      return ring === 0 || ring === 3;
    default:
      return true;
  }
}

// ── scene ────────────────────────────────────────────────────────────────────
function buildScene() {
  const floorMaterial = material.pbr({
    color: "#0a0d18",
    roughness: 0.42,
    metalness: 0.35,
    emissive: "#101a33",
    emissiveIntensity: 0.18
  });

  // The torus tube scales with `size`, so at arena scale the ring is ~0.35
  // thick. Keep its emissive low: at neon intensity the bloom swallows the
  // whole upper frame and hides the paddle behind it.
  const rimMaterial = material.neon({
    color: "#15506a",
    emissive: "#2b8fb0",
    emissiveIntensity: 0.2
  });

  const nodes: AuraNodeInput[] = [
    primitives.plane({
      name: "arena floor",
      size: 44, // deep apron: the floor edge must never cross the frame
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, 0, ARENA_Z],
      material: floorMaterial,
      receiveShadow: true
    }),
    primitives.torus({
      name: "arena rim",
      // the torus primitive is authored at radius 0.43 and scaled by `size`,
      // so the factor is RIM_R / 0.43 rather than RIM_R. It is also authored in
      // the XY plane, so it needs the same -90° X rotation as the floor to lie
      // flat in XZ — without it a top-down camera sees it edge-on as a bar.
      size: RIM_R / 0.43,
      rotation: [-Math.PI / 2, 0, 0],
      position: [0, 0.04, ARENA_Z],
      material: rimMaterial
    }),
    model(assets.prismPylon, {
      name: "prism pylon",
      targetHeight: 1.0,
      position: [0, 0.5, ARENA_Z],
      castShadow: true
    }),
    instances.model(assets.prismBrick, {
      name: "prism bricks",
      transforms: brickTransforms(),
      colors: brickColors(),
      material: material.pbr({
        color: "#ffffff",
        roughness: 0.3,
        metalness: 0.45,
        emissive: "#1d5f8c",
        emissiveIntensity: 0.7
      }),
      instancingAware: true
    }).runtime(game.runtimeNode("prism-bricks", { tags: ["bricks", "runtime"] })),
    // The paddle is drawn INSIDE the brick instanced pool (slots 0..PADDLE_SLOTS-1)
    // rather than as its own node. A separate model node and a separate instanced
    // node both submitted geometry that never appeared on screen, while this pool
    // renders and updates reliably — so the paddle rides the path that is proven.
    ...Array.from({ length: MAX_BALLS }, (_, index) =>
      model(assets.prismCore, {
        name: `prism core ${index}`,
        targetMaxDimension: BALL_R * 2,
        position: [0, BALL_Y, 0],
        material: material.neon({ color: "#8ff4ff", emissive: "#4de8ff", emissiveIntensity: 1.1 }),
        castShadow: true
      }).runtime(game.runtimeNode(`ball-${index}`, { tags: ["ball", "runtime"] }))
    )
  ];

  return scene()
    .add(looks.preset(LOOK_ID, { fogDensityScale: 0, exposureEv: -0.1 }))
    .addMany(nodes)
    .camera(
      // Straight-down orthographic. Two reasons: a brick-breaker reads better
      // with no perspective distortion (the ring is a true circle and what you
      // see is where the ball actually is), and the tilted perspective view was
      // subject to a depth-dependent clip that deleted everything beyond the
      // camera's target plane — the whole far half of the arena.
      camera.orthographic({
        position: [0, 12, ARENA_Z],
        target: [0, 0, ARENA_Z],
        orthographicSize: 4.3,
        near: 0.1,
        far: 40
      })
    );
}

function mountNodes(): void {
  brickNode = app.nodes.require("prism-bricks");
  ballNodes.length = 0;
  for (let index = 0; index < MAX_BALLS; index += 1) {
    ballNodes.push(app.nodes.require(`ball-${index}`));
  }
  syncBricks();
  resetBalls();
}

function brickScale(brick: Brick): AuraVec3 {
  const width = brick.arc * brick.radius * 0.86;
  return [
    Math.max(0.02, width / BRICK_BOUNDS[0]),
    Math.max(0.02, 0.26 / BRICK_BOUNDS[1]),
    Math.max(0.02, 0.40 / BRICK_BOUNDS[2])
  ];
}

// Slots 0..PADDLE_SLOTS-1 are the paddle; the rest are bricks. One pool, one
// draw call, and the paddle shares the exact render path the bricks already use.
function brickTransforms(): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];

  const count = paddleSegmentCount();
  const step = (paddleHalfWidth * 2) / count;
  for (let slot = 0; slot < PADDLE_SLOTS; slot += 1) {
    if (slot >= count) {
      transforms.push({ position: [0, -60, 0], scale: 0 });
      continue;
    }
    const angle = paddleAngle + (slot - (count - 1) / 2) * step;
    const width = Math.max(0.10, step * PADDLE_R * 0.86);
    transforms.push({
      position: [Math.cos(angle) * PADDLE_R, PADDLE_Y, Math.sin(angle) * PADDLE_R + ARENA_Z],
      rotation: [0, angle - Math.PI / 2, 0],
      scale: [width, 0.30, 0.46]
    });
  }

  for (let slot = 0; slot < BRICK_SLOTS - PADDLE_SLOTS; slot += 1) {
    const brick = bricks[slot];
    if (!brick || !brick.alive) {
      transforms.push({ position: [0, -60, 0], scale: 0 });
      continue;
    }
    transforms.push({
      position: [
        Math.cos(brick.angle) * brick.radius,
        BRICK_Y,
        Math.sin(brick.angle) * brick.radius + ARENA_Z
      ],
      rotation: [0, brick.angle - Math.PI / 2, 0],
      scale: brickScale(brick)
    });
  }
  return transforms;
}

function brickColors(): AuraColor[] {
  const colors: AuraColor[] = [];
  for (let slot = 0; slot < PADDLE_SLOTS; slot += 1) colors.push("#ffa8c8");
  for (let slot = 0; slot < BRICK_SLOTS - PADDLE_SLOTS; slot += 1) {
    const brick = bricks[slot];
    colors.push(brick && brick.alive ? RING_COLORS[brick.ring % RING_COLORS.length]! : "#141828");
  }
  return colors;
}

function syncBricks(): void {
  if (!brickNode) return;
  brickNode.setInstances(brickTransforms(), brickColors());
}

// ── paddle arc width ─────────────────────────────────────────────────────────
// Segment count tracks arc width, so the player reads their defensive coverage
// directly off the object rather than off a number in the HUD.
function paddleSegmentCount(): number {
  const ratio = paddleHalfWidth / BASE_PADDLE_HALF_WIDTH;
  return Math.max(3, Math.min(PADDLE_SLOTS, Math.round(ratio * PADDLE_SLOTS)));
}

// ── render ───────────────────────────────────────────────────────────────────
function render(): void {
  // The paddle moves every frame, so the shared instanced pool is re-uploaded
  // every frame. That is one draw call for paddle + bricks together.
  syncBricks();

  ballNodes.forEach((node, index) => {
    const ball = balls[index];
    if (!ball) {
      node.setVisible(false);
      return;
    }
    node.setVisible(true).setPosition(ball.x, BALL_Y, ball.z + ARENA_Z);
  });

  renderHud();
}

// ── HUD ──────────────────────────────────────────────────────────────────────
let hudRoot: HTMLElement | undefined;

function renderHud(): void {
  if (!hudRoot) {
    hudRoot = document.createElement("aside");
    hudRoot.id = "prism-break-hud";
    hudRoot.style.cssText = [
      "position:absolute",
      "left:18px",
      "top:16px",
      "z-index:5",
      "min-width:260px",
      "font:600 13px/1.45 Inter, system-ui, sans-serif",
      "color:#eaf6ff",
      "background:rgba(6,9,20,0.74)",
      "border:1px solid rgba(77,232,255,0.32)",
      "border-radius:10px",
      "padding:12px 14px",
      "pointer-events:none",
      "letter-spacing:0.01em"
    ].join(";");
    document.body.append(hudRoot);
  }

  const alive = bricks.filter((brick) => brick.alive).length;
  const strikesPips = "●".repeat(strikes) + "○".repeat(Math.max(0, MAX_STRIKES - strikes));
  const shardLabel = balls.length === 1 ? "1 core" : `${balls.length} shards`;

  hudRoot.innerHTML = [
    `<div style="font-size:15px;letter-spacing:0.18em;color:#4de8ff">PRISM BREAK</div>`,
    `<div style="margin-top:6px">Score <strong>${score.toLocaleString()}</strong></div>`,
    `<div>Wave ${wave} · ${alive} bricks left</div>`,
    `<div>${shardLabel} · arc ${Math.round((paddleHalfWidth * 2 * 180) / Math.PI)}°</div>`,
    `<div style="color:#ff8aa2">Strikes ${strikesPips}</div>`,
    gameOver
      ? `<div style="margin-top:6px;color:#ffd166">Run over — press R</div>`
      : `<div style="margin-top:6px;opacity:0.62">A/D or pointer to orbit · Space to split</div>`
  ].join("");
}

function publish(): void {
  window.__AURA3D_PRISM_BREAK__ = {
    frame: frameCount,
    score,
    wave,
    strikes,
    balls: balls.length,
    paddleArcDeg: Math.round((paddleHalfWidth * 2 * 180) / Math.PI),
    aliveBricks: bricks.filter((brick) => brick.alive).length,
    totalBricks: bricks.length,
    gameOver,
    look: { id: LOOK_ID },
    assetIds: ["prismBrick", "prismCore", "prismPaddle", "prismPylon"]
  };
}

function hideBootGate(): void {
  const gate = document.getElementById("boot-gate");
  if (!gate) return;
  gate.style.opacity = "0";
  gate.style.pointerEvents = "none";
  window.setTimeout(() => gate.remove(), 320);
}
