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
  type AuraCustomGeometrySpec,
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

// ── floor dressing & atmosphere ───────────────────────────────────────────────
// Instanced markings ONLY — rings, seams and ticks are exactly what primitives
// are for; no hero object is ever assembled from them. Every pool below stays
// ≤ 64 instances (MAX_GPU_INSTANCES batches at 64), so each pool renders as a
// single draw call. All dressing is authored in the ARENA_Z offset frame like
// every other node, sits at y ≤ 0.05 on the floor, and stays within the arena
// bounds so the culling frustum never sees it at negative Z. Emissive caps are
// deliberate: the rim-bloom lesson showed 0.9 swallows the frame, so guide
// dressing holds at ≤ 0.2 and only the small central pulse ring goes above.

// Guide rings: concentric machined grooves, each tinted toward the zone colour
// of the band it sits in. Instance colours multiply the base colour; the
// material carries the single shared emissive.
const GUIDE_RINGS: readonly { readonly radius: number; readonly color: AuraColor }[] = [
  { radius: 0.62, color: "#9a6aa8" }, // inner sanctum — magenta zone
  { radius: 0.92, color: "#8d77b5" }, // violet approach
  { radius: 1.35, color: "#7f74c4" }, // band between brick rings 3→2
  { radius: 1.75, color: "#6bb5d4" }, // band between brick rings 2→1
  { radius: 2.15, color: "#59a8d8" }, // band between brick rings 1→0
  { radius: 2.65, color: "#63cfe4" }, // paddle orbit lane
  { radius: 3.13, color: "#438fb4" } // rim approach
];
const GUIDE_RING_Y = 0.012;

// Radial seams every 30° so the floor reads machined rather than poured.
const SEAM_COUNT = 12;
const SEAM_INNER_R = 0.72;
const SEAM_OUTER_R = 2.52;
const SEAM_Y = 0.014;
const SEAM_THICKNESS = 0.018;
const SEAM_HEIGHT = 0.012;

// Watch-bezel tick ring riding the crest of the rim torus, rotating slowly.
// The rim torus at RIM_R has a tube of ≈0.35, so its crest sits at y ≈ 0.39.
const TICK_COUNT = 24;
const TICK_R = RIM_R;
const TICK_Y = 0.393;
const TICK_LEN = 0.15;
const TICK_LEN_MAJOR = 0.22;
const TICK_WIDTH = 0.02;
const TICK_HEIGHT = 0.014;
const TICK_EVERY_MAJOR = 3;
const BEZEL_SPEED = 0.09; // rad/s — one full sweep ≈ 70 s

// Pylon base: one soft static halo band plus two counter-breathing pulse rings
// whose frequency tracks the wave number. The pulse rides instance transforms
// (the proven cheap path the brick pool already uses every frame) — the shared
// material keeps a single fixed emissive, and the breathing radius plus the
// tint oscillation read as a pulsing glow without any per-frame rebuild.
const HALO_SCALE = 0.46; // halo band spans ≈0.19 → 0.46 around the pylon foot
const HALO_Y = 0.012;
const PULSE_RADII: readonly [number, number] = [0.27, 0.41];
const PULSE_BASE_Y = 0.026;

const BASE_PADDLE_HALF_WIDTH = 0.30; // radians
const PADDLE_SLOTS = 9; // fixed instanced capacity for the segmented paddle
const SPLIT_SHRINK = 0.8;
const MAX_BALLS = 3;
const BASE_SPEED = 4.6;
const SPEED_PER_WAVE = 0.24;
const MAX_SPEED = 9.2;
const MAX_STRIKES = 5;
const STRIKE_COOLDOWN_MS = 1100;
const WAVES_TOTAL = 12; // 12 authored waves, then endless

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
  /** Floor-dressing + atmosphere instance count across the four marking pools. */
  readonly floorDressingInstances: number;
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

// Atmosphere handles + clocks. Declared with the other state above createGame:
// the scene factory runs during createGame, and anything render code reads must
// already be initialised in module-eval order (the TDZ trap).
let linesNode: AuraRuntimeNodeHandle | undefined;
let pulseNode: AuraRuntimeNodeHandle | undefined;
let sceneTime = 0;
let bezelAngle = 0;

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
  sceneTime += step;
  bezelAngle = (bezelAngle + BEZEL_SPEED * step) % (Math.PI * 2);
  // Score count-up: the displayed value eases toward the real one so every
  // brick lands as a small roll rather than a jump. Restart snaps back to 0.
  const scoreGap = score - displayScore;
  displayScore = scoreGap > 0 ? (scoreGap < 1 ? score : displayScore + scoreGap * Math.min(1, step * 6)) : score;
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

  // Floor dressing materials. One emissive per pool (instance colours tint the
  // base colour only); intensities stay well under the rim-bloom threshold.
  const dressingMaterial = material.pbr({
    color: "#ffffff",
    roughness: 0.55,
    metalness: 0.25,
    emissive: "#9fdcff",
    emissiveIntensity: 0.15
  });
  const seamMaterial = material.pbr({
    color: "#e8f2f8",
    roughness: 0.4,
    metalness: 0.5,
    emissive: "#7fd8ff",
    emissiveIntensity: 0.13
  });
  const haloMaterial = material.pbr({
    color: "#bfe8f7",
    roughness: 0.65,
    metalness: 0.1,
    emissive: "#7fd4f0",
    emissiveIntensity: 0.2
  });
  const pulseMaterial = material.pbr({
    color: "#dff6ff",
    roughness: 0.5,
    metalness: 0.2,
    emissive: "#66e8ff",
    emissiveIntensity: 0.3
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
    // ── floor dressing (4 instanced pools ≈ 4 draw calls) ───────────────────
    // Concentric guide rings, zone-tinted per band via instance colours. The
    // annulus is authored at unit radius in the XZ plane and scaled per
    // instance, so ring width grows gently with radius (a machined inlay read).
    instances.custom(annulusSpec(0.978), {
      name: "floor guide rings",
      position: [0, 0, ARENA_Z],
      transforms: GUIDE_RINGS.map(
        (ring): AuraTransformSpec => ({
          position: [0, GUIDE_RING_Y, 0],
          scale: [ring.radius, 1, ring.radius]
        })
      ),
      colors: GUIDE_RINGS.map((ring) => ring.color),
      material: dressingMaterial
    }),
    // Soft glow halo under the centre pylon — a wide, dim band at its foot.
    instances.custom(annulusSpec(0.42), {
      name: "pylon halo",
      position: [0, HALO_Y, ARENA_Z],
      transforms: [{ scale: [HALO_SCALE, 1, HALO_SCALE] }],
      colors: ["#9fd8ec"],
      material: haloMaterial
    }),
    // Two counter-breathing pulse rings at the pylon base; the material's
    // single emissive stays fixed and the pulse rides instance transforms.
    instances.custom(annulusSpec(0.95), {
      name: "pylon pulse rings",
      position: [0, PULSE_BASE_Y, ARENA_Z],
      transforms: pulseTransforms(0),
      colors: pulseColors(0),
      material: pulseMaterial
    }).runtime(game.runtimeNode("prism-pulse", { tags: ["atmosphere", "runtime"] })),
    // Radial seams (12, static) + the rotating bezel tick ring (24) share one
    // box pool — 36 instances, one draw call, one material.
    instances.box({
      name: "floor seams and bezel ticks",
      position: [0, 0, ARENA_Z],
      transforms: lineTransforms(0),
      colors: lineColors(),
      material: seamMaterial
    }).runtime(game.runtimeNode("prism-lines", { tags: ["atmosphere", "runtime"] })),
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
  linesNode = app.nodes.require("prism-lines");
  pulseNode = app.nodes.require("prism-pulse");
  ballNodes.length = 0;
  for (let index = 0; index < MAX_BALLS; index += 1) {
    ballNodes.push(app.nodes.require(`ball-${index}`));
  }
  syncBricks();
  syncAtmosphere();
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
  // Dressing pools: bezel rotation + pylon pulse, same cheap instance path.
  syncAtmosphere();

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

// ── atmosphere ───────────────────────────────────────────────────────────────
// Flat XZ annulus authored at unit radius, +Y-facing (the same CCW-from-above
// winding as the engine's floor plane, so the top face is never back-culled),
// with explicit up normals. Scaled per instance to the wanted radius.
function annulusSpec(innerRatio: number, segments = 96): AuraCustomGeometrySpec {
  const positions: [number, number, number][] = [];
  const normals: [number, number, number][] = [];
  const indices: number[] = [];
  for (let step = 0; step < segments; step += 1) {
    const a0 = (step / segments) * Math.PI * 2;
    const a1 = ((step + 1) / segments) * Math.PI * 2;
    const base = positions.length;
    positions.push(
      [Math.cos(a0), 0, Math.sin(a0)],
      [Math.cos(a0) * innerRatio, 0, Math.sin(a0) * innerRatio],
      [Math.cos(a1), 0, Math.sin(a1)],
      [Math.cos(a1) * innerRatio, 0, Math.sin(a1) * innerRatio]
    );
    normals.push([0, 1, 0], [0, 1, 0], [0, 1, 0], [0, 1, 0]);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  return {
    kind: "aura-custom-geometry",
    positions,
    normals,
    indices,
    bounds: { min: [-1, 0, -1], max: [1, 0, 1] }
  };
}

// Seams are static; ticks ride `bezelAngle`. A yaw of -angle points a box's
// local +X along the radial direction (cos angle, 0, sin angle).
function lineTransforms(bezel: number): AuraTransformSpec[] {
  const transforms: AuraTransformSpec[] = [];
  const seamMid = (SEAM_INNER_R + SEAM_OUTER_R) / 2;
  const seamLength = SEAM_OUTER_R - SEAM_INNER_R;
  for (let index = 0; index < SEAM_COUNT; index += 1) {
    const angle = (index / SEAM_COUNT) * Math.PI * 2;
    transforms.push({
      position: [Math.cos(angle) * seamMid, SEAM_Y, Math.sin(angle) * seamMid],
      rotation: [0, -angle, 0],
      scale: [seamLength, SEAM_HEIGHT, SEAM_THICKNESS]
    });
  }
  for (let index = 0; index < TICK_COUNT; index += 1) {
    const angle = bezel + (index / TICK_COUNT) * Math.PI * 2;
    const major = index % TICK_EVERY_MAJOR === 0;
    transforms.push({
      position: [Math.cos(angle) * TICK_R, TICK_Y, Math.sin(angle) * TICK_R],
      rotation: [0, -angle, 0],
      scale: [major ? TICK_LEN_MAJOR : TICK_LEN, TICK_HEIGHT, TICK_WIDTH]
    });
  }
  return transforms;
}

function lineColors(): AuraColor[] {
  const colors: AuraColor[] = [];
  for (let index = 0; index < SEAM_COUNT; index += 1) colors.push("#a9c9dc");
  for (let index = 0; index < TICK_COUNT; index += 1) {
    colors.push(index % TICK_EVERY_MAJOR === 0 ? "#9fe8ff" : "#6fb4cf");
  }
  return colors;
}

// The two pulse rings breathe in counter-phase; the tint oscillation rides the
// same instance-colour channel (it multiplies the base colour, never the
// emissive — per-instance glow is not available).
function pulseTransforms(phase: number): AuraTransformSpec[] {
  return PULSE_RADII.map((radius, index): AuraTransformSpec => {
    const breathe = index === 0 ? 1 + 0.05 * Math.sin(phase) : 1 - 0.065 * Math.sin(phase);
    const scale = radius * breathe;
    return { position: [0, index * 0.005, 0], scale: [scale, 1, scale] };
  });
}

function pulseColors(phase: number): AuraColor[] {
  const tint = 0.5 + 0.5 * Math.sin(phase);
  return [mixHex("#7fc9e6", "#c9f4ff", tint), mixHex("#c9f4ff", "#7fc9e6", tint)];
}

// Instance colour strings must be #rrggbb — the fallback colour parser only
// accepts 6-digit hex and silently dims anything else.
function mixHex(from: string, to: string, t: number): AuraColor {
  const a = Number.parseInt(from.slice(1), 16);
  const b = Number.parseInt(to.slice(1), 16);
  const channel = (shift: number): string => {
    const start = (a >> shift) & 0xff;
    const end = (b >> shift) & 0xff;
    return Math.round(start + (end - start) * t)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(16)}${channel(8)}${channel(0)}`;
}

function syncAtmosphere(): void {
  linesNode?.setInstances(lineTransforms(bezelAngle), lineColors());
  // Pulse frequency climbs with the wave number — the arena's heartbeat
  // quickens as the run gets deeper.
  const pulseHz = 0.55 + Math.min(wave, 12) * 0.16;
  const phase = sceneTime * pulseHz * Math.PI * 2;
  pulseNode?.setInstances(pulseTransforms(phase), pulseColors(phase));
}

// ── HUD ──────────────────────────────────────────────────────────────────────
// A designed arcade frame rather than a utilitarian panel: a dark glass plate
// top-left (over the apron, never over the rim circle that owns the central
// ~60% of the frame), a key-chip prompt bar bottom-centre, and a translucent
// game-over banner. System font stacks only (the locally licensed Graphik plus
// system fallbacks — nothing external). Every layer is pointer-events:none.
interface HudHandles {
  readonly score: HTMLElement;
  readonly wavePips: HTMLElement;
  readonly waveValue: HTMLElement;
  readonly strikePips: HTMLElement;
  readonly strikeValue: HTMLElement;
  readonly shardPips: HTMLElement;
  readonly shardValue: HTMLElement;
  readonly arcFill: HTMLElement;
  readonly arcValue: HTMLElement;
  readonly bricksLabel: HTMLElement;
  readonly banner: HTMLElement;
}

let hudHandles: HudHandles | undefined;
let displayScore = 0;
const hudCache = {
  score: -1,
  wave: -1,
  strikes: -1,
  balls: -1,
  arcPct: -1,
  alive: -1,
  gameOver: false
};

const HUD_STYLE = [
  "#prism-break-hud{position:absolute;left:16px;top:14px;z-index:5;min-width:280px;max-width:322px;padding:14px;border-radius:10px;background:rgba(6,9,20,0.66);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border:1px solid rgba(77,232,255,0.32);box-shadow:inset 0 0 0 1px rgba(158,236,255,0.07),0 10px 30px rgba(0,0,0,0.35);font-family:'Graphik',system-ui,-apple-system,'Segoe UI',sans-serif;color:#d7e9f5;pointer-events:none;user-select:none}",
  "#prism-break-hud .pb-title{font-size:14px;font-weight:700;letter-spacing:0.32em;line-height:1;background:linear-gradient(93deg,#4de8ff 5%,#9d8cf5 55%,#ff7ab8 95%);-webkit-background-clip:text;background-clip:text;color:transparent}",
  "#prism-break-hud .pb-subtitle{margin-top:5px;font-size:8px;font-weight:600;letter-spacing:0.3em;color:rgba(160,196,222,0.55)}",
  "#prism-break-hud .pb-score-row{display:flex;align-items:baseline;justify-content:space-between;gap:12px;margin-top:11px}",
  "#prism-break-hud .pb-score{font-size:24px;font-weight:700;line-height:1;color:#eef8ff;font-variant-numeric:tabular-nums;letter-spacing:0.02em;text-shadow:0 0 14px rgba(77,232,255,0.28)}",
  "#prism-break-hud .pb-label{font-size:9px;font-weight:600;letter-spacing:0.22em;color:rgba(151,190,214,0.78)}",
  "#prism-break-hud .pb-rows{margin-top:11px;display:grid;gap:7px}",
  "#prism-break-hud .pb-row{display:grid;grid-template-columns:56px 1fr auto;align-items:center;gap:8px}",
  "#prism-break-hud .pb-pips{display:flex;gap:3px;align-items:center}",
  "#prism-break-hud .pb-pip{width:7px;height:7px;border-radius:2px;background:rgba(120,150,180,0.16);box-shadow:inset 0 0 0 1px rgba(150,190,220,0.22)}",
  "#prism-break-hud .pb-pip.on{background:#4de8ff;box-shadow:0 0 6px rgba(77,232,255,0.85)}",
  "#prism-break-hud .pb-pip.strike{border-radius:50%}",
  "#prism-break-hud .pb-pip.strike.on{background:#ff5d7d;box-shadow:0 0 7px rgba(255,93,125,0.95)}",
  "#prism-break-hud .pb-shards{display:flex;gap:5px;font-size:11px;line-height:1}",
  "#prism-break-hud .pb-shard{color:rgba(130,160,190,0.28)}",
  "#prism-break-hud .pb-shard.on{color:#7ff0ff;text-shadow:0 0 8px rgba(77,232,255,0.9)}",
  "#prism-break-hud .pb-meter{position:relative;height:4px;border-radius:2px;background:rgba(120,150,180,0.16);overflow:hidden}",
  "#prism-break-hud .pb-meter-fill{position:absolute;top:0;bottom:0;left:0;width:100%;border-radius:2px;background:#4de8ff;box-shadow:0 0 8px rgba(77,232,255,0.55);transition:width 160ms ease,background 240ms ease}",
  "#prism-break-hud .pb-value{font-size:11px;color:#cfe6f2;font-variant-numeric:tabular-nums;min-width:30px;text-align:right}",
  "#prism-break-hud .pb-footer{margin-top:11px;padding-top:9px;border-top:1px solid rgba(120,160,190,0.14);font-size:8px;font-weight:600;letter-spacing:0.26em;color:rgba(151,190,214,0.55)}",
  "#prism-break-prompt{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);z-index:5;display:flex;gap:16px;align-items:center;padding:8px 14px;border-radius:8px;background:rgba(6,9,20,0.6);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);border:1px solid rgba(77,232,255,0.22);box-shadow:inset 0 0 0 1px rgba(158,236,255,0.05);font-family:'Graphik',system-ui,-apple-system,'Segoe UI',sans-serif;font-size:10px;font-weight:600;letter-spacing:0.16em;color:#a8c6da;pointer-events:none;user-select:none;white-space:nowrap}",
  ".pb-kbd{display:inline-block;min-width:14px;text-align:center;padding:3px 6px;margin-right:7px;border-radius:4px;border:1px solid rgba(77,232,255,0.4);color:#bfeeff;background:rgba(77,232,255,0.08);font-size:9px;letter-spacing:0.08em;box-shadow:inset 0 0 6px rgba(77,232,255,0.1)}",
  "#prism-break-over{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) translateY(8px);z-index:6;padding:20px 36px;border-radius:12px;text-align:center;background:rgba(6,9,20,0.72);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);border:1px solid rgba(255,122,184,0.35);box-shadow:inset 0 0 0 1px rgba(255,158,200,0.08),0 18px 50px rgba(0,0,0,0.5);font-family:'Graphik',system-ui,-apple-system,'Segoe UI',sans-serif;opacity:0;transition:opacity 420ms ease,transform 420ms ease;pointer-events:none;user-select:none}",
  "#prism-break-over.on{opacity:1;transform:translate(-50%,-50%) translateY(0)}",
  "#prism-break-over .pb-over-title{font-size:17px;font-weight:700;letter-spacing:0.3em;color:#ffd9e8;text-shadow:0 0 18px rgba(255,93,125,0.45)}",
  "#prism-break-over .pb-over-sub{margin-top:9px;font-size:10px;font-weight:600;letter-spacing:0.2em;color:#a8c6da}"
].join("");

function mountHud(): HudHandles {
  const style = document.createElement("style");
  style.textContent = HUD_STYLE;
  document.head.append(style);

  const root = document.createElement("aside");
  root.id = "prism-break-hud";
  root.innerHTML = [
    '<div class="pb-title">PRISM BREAK</div>',
    '<div class="pb-subtitle">NEON ARENA · CIRCULAR BREAKER</div>',
    '<div class="pb-score-row"><span class="pb-label">SCORE</span><span class="pb-score">0</span></div>',
    '<div class="pb-rows">',
    '<div class="pb-row"><span class="pb-label">WAVE</span><span class="pb-pips pb-wave-pips"></span><span class="pb-value pb-wave-value">01</span></div>',
    `<div class="pb-row"><span class="pb-label">STRIKES</span><span class="pb-pips pb-strike-pips"></span><span class="pb-value pb-strike-value">0/${MAX_STRIKES}</span></div>`,
    `<div class="pb-row"><span class="pb-label">SHARDS</span><span class="pb-shards"></span><span class="pb-value pb-shard-value">1/${MAX_BALLS}</span></div>`,
    '<div class="pb-row"><span class="pb-label">PADDLE</span><span class="pb-meter"><span class="pb-meter-fill"></span></span><span class="pb-value pb-arc-value">34°</span></div>',
    "</div>",
    '<div class="pb-footer">— BRICKS STANDING</div>'
  ].join("");
  document.body.append(root);

  const prompt = document.createElement("div");
  prompt.id = "prism-break-prompt";
  prompt.innerHTML = [
    "<span><span class=\"pb-kbd\">A</span><span class=\"pb-kbd\">D</span>ORBIT</span>",
    "<span><span class=\"pb-kbd\">SPACE</span>SPLIT</span>",
    "<span><span class=\"pb-kbd\">R</span>RESTART</span>"
  ].join("");
  document.body.append(prompt);

  const banner = document.createElement("div");
  banner.id = "prism-break-over";
  banner.innerHTML =
    '<div class="pb-over-title">RUN OVER</div><div class="pb-over-sub"><span class="pb-kbd">R</span>RESTART</div>';
  document.body.append(banner);

  const pick = (selector: string): HTMLElement => root.querySelector<HTMLElement>(selector)!;
  return {
    score: pick(".pb-score"),
    wavePips: pick(".pb-wave-pips"),
    waveValue: pick(".pb-wave-value"),
    strikePips: pick(".pb-strike-pips"),
    strikeValue: pick(".pb-strike-value"),
    shardPips: pick(".pb-shards"),
    shardValue: pick(".pb-shard-value"),
    arcFill: pick(".pb-meter-fill"),
    arcValue: pick(".pb-arc-value"),
    bricksLabel: pick(".pb-footer"),
    banner
  };
}

function pipMarkup(className: string, on: boolean): string {
  return `<span class="${className}${on ? " on" : ""}"></span>`;
}

function renderHud(): void {
  hudHandles ??= mountHud();
  const hud = hudHandles;

  const shownScore = Math.round(displayScore);
  if (shownScore !== hudCache.score) {
    hud.score.textContent = shownScore.toLocaleString("en-US");
    hudCache.score = shownScore;
  }

  if (wave !== hudCache.wave) {
    hudCache.wave = wave;
    hud.waveValue.textContent = String(wave).padStart(2, "0");
    let pips = "";
    for (let index = 0; index < WAVES_TOTAL; index += 1) {
      pips += pipMarkup("pb-pip", index < Math.min(wave, WAVES_TOTAL));
    }
    hud.wavePips.innerHTML = pips;
  }

  if (strikes !== hudCache.strikes) {
    hudCache.strikes = strikes;
    hud.strikeValue.textContent = `${strikes}/${MAX_STRIKES}`;
    let pips = "";
    for (let index = 0; index < MAX_STRIKES; index += 1) {
      pips += pipMarkup("pb-pip strike", index < strikes);
    }
    hud.strikePips.innerHTML = pips;
  }

  const ballCount = balls.length;
  if (ballCount !== hudCache.balls) {
    hudCache.balls = ballCount;
    hud.shardValue.textContent = `${ballCount}/${MAX_BALLS}`;
    let glyphs = "";
    for (let index = 0; index < MAX_BALLS; index += 1) {
      glyphs += `<span class="pb-shard${index < ballCount ? " on" : ""}">◆</span>`;
    }
    hud.shardPips.innerHTML = glyphs;
  }

  // Paddle-arc meter: 100% is the base 34° arc; the fill turns amber as splits
  // shrink the defence.
  const arcPct = Math.round((paddleHalfWidth / BASE_PADDLE_HALF_WIDTH) * 100);
  if (arcPct !== hudCache.arcPct) {
    hudCache.arcPct = arcPct;
    const arcDeg = Math.round((paddleHalfWidth * 2 * 180) / Math.PI);
    hud.arcValue.textContent = `${arcDeg}°`;
    hud.arcFill.style.width = `${Math.min(100, Math.max(0, arcPct))}%`;
    const color = arcPct >= 80 ? "#4de8ff" : arcPct >= 55 ? "#ffd166" : "#ff9e5c";
    hud.arcFill.style.background = color;
    hud.arcFill.style.boxShadow = `0 0 8px ${arcPct >= 80 ? "rgba(77,232,255,0.55)" : "rgba(255,177,90,0.55)"}`;
  }

  const alive = bricks.reduce((count, brick) => count + (brick.alive ? 1 : 0), 0);
  if (alive !== hudCache.alive) {
    hudCache.alive = alive;
    hud.bricksLabel.textContent = `${alive} BRICKS STANDING`;
  }

  if (gameOver !== hudCache.gameOver) {
    hudCache.gameOver = gameOver;
    hud.banner.classList.toggle("on", gameOver);
  }
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
    assetIds: ["prismBrick", "prismCore", "prismPaddle", "prismPylon"],
    floorDressingInstances:
      GUIDE_RINGS.length + 1 /* halo */ + PULSE_RADII.length + SEAM_COUNT + TICK_COUNT
  };
}

function hideBootGate(): void {
  const gate = document.getElementById("boot-gate");
  if (!gate) return;
  gate.style.opacity = "0";
  gate.style.pointerEvents = "none";
  window.setTimeout(() => gate.remove(), 320);
}
