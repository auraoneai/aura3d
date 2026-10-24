import { camera, createAuraApp, game, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

interface EvalState {
  score: number;
  status: Status;
  time: number;
}

declare global {
  interface Window {
    __EVAL__?: { state: () => EvalState; step: (frames: number) => void };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- constants
const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60; // 30 s
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const ARENA_HALF = 9; // arena spans [-9, 9] on x and z
const PLAYER_RADIUS = 0.5;
const COIN_RADIUS = 0.35;
const PLAYER_SPEED = 7; // units per second
const SEED = 20240611;

// ---------------------------------------------------------------- seeded rng
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- simulation
interface Vec2 {
  x: number;
  z: number;
}

const sim = {
  rng: mulberry32(SEED),
  px: 0,
  pz: 0,
  coins: [] as Vec2[],
  score: 0,
  frames: 0,
  ended: null as null | "won" | "lost",
  paused: false
};

function spawnCoin(index: number): void {
  const limit = ARENA_HALF - 1;
  let x = 0;
  let z = 0;
  for (let attempt = 0; attempt < 30; attempt++) {
    x = (sim.rng() * 2 - 1) * limit;
    z = (sim.rng() * 2 - 1) * limit;
    const farFromPlayer = Math.hypot(x - sim.px, z - sim.pz) > 2.5;
    const farFromCoins = sim.coins.every((c, i) => i === index || Math.hypot(c.x - x, c.z - z) > 1.5);
    if (farFromPlayer && farFromCoins) break;
  }
  sim.coins[index] = { x, z };
}

function resetRound(): void {
  sim.rng = mulberry32(SEED);
  sim.px = 0;
  sim.pz = 0;
  sim.coins = [];
  for (let i = 0; i < COIN_COUNT; i++) spawnCoin(i);
  sim.score = 0;
  sim.frames = 0;
  sim.ended = null;
  sim.paused = false;
}

// ---------------------------------------------------------------- input
const keys = new Set<string>();

function normalizeKey(e: KeyboardEvent): string {
  switch (e.code) {
    case "ArrowUp":
    case "KeyW":
      return "up";
    case "ArrowDown":
    case "KeyS":
      return "down";
    case "ArrowLeft":
    case "KeyA":
      return "left";
    case "ArrowRight":
    case "KeyD":
      return "right";
    case "KeyP":
      return "p";
    case "KeyR":
      return "r";
    default:
  }
  switch (e.key) {
    case "ArrowUp":
    case "w":
    case "W":
      return "up";
    case "ArrowDown":
    case "s":
    case "S":
      return "down";
    case "ArrowLeft":
    case "a":
    case "A":
      return "left";
    case "ArrowRight":
    case "d":
    case "D":
      return "right";
    case "p":
    case "P":
      return "p";
    case "r":
    case "R":
      return "r";
    default:
      return "";
  }
}

window.addEventListener("keydown", (e) => {
  const k = normalizeKey(e);
  if (!k) return;
  e.preventDefault();
  if (k === "p") {
    if (!e.repeat) sim.paused = !sim.paused;
    syncHud();
    return;
  }
  if (k === "r") {
    if (!e.repeat) {
      resetRound();
      syncNodes();
      syncHud();
    }
    return;
  }
  keys.add(k);
});

window.addEventListener("keyup", (e) => {
  const k = normalizeKey(e);
  if (k) keys.delete(k);
});

window.addEventListener("blur", () => keys.clear());

// ---------------------------------------------------------------- step
function status(): Status {
  if (sim.ended) return sim.ended;
  return sim.paused ? "paused" : "playing";
}

function stepOnce(): void {
  if (sim.paused || sim.ended) return;

  let dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
  let dz = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  const limit = ARENA_HALF - PLAYER_RADIUS;
  sim.px = Math.max(-limit, Math.min(limit, sim.px + dx * PLAYER_SPEED * DT));
  sim.pz = Math.max(-limit, Math.min(limit, sim.pz + dz * PLAYER_SPEED * DT));
  sim.frames += 1;

  const reach = PLAYER_RADIUS + COIN_RADIUS;
  for (let i = 0; i < sim.coins.length; i++) {
    const c = sim.coins[i];
    if (c && Math.hypot(c.x - sim.px, c.z - sim.pz) <= reach) {
      sim.score += 1;
      spawnCoin(i);
    }
  }

  if (sim.score >= WIN_SCORE) sim.ended = "won";
  else if (sim.frames >= ROUND_FRAMES) sim.ended = "lost";
}

function step(frames: number): void {
  const n = Math.max(0, Math.floor(Number(frames) || 0));
  for (let i = 0; i < n; i++) stepOnce();
  syncNodes();
  syncHud();
}

function state(): EvalState {
  return { score: sim.score, status: status(), time: sim.frames * DT };
}

window.__EVAL__ = { state, step };

// ---------------------------------------------------------------- HUD (DOM)
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:16px;width:640px;padding:6px 0;font:13px/1.4 system-ui,sans-serif;color:#fff;";
hud.innerHTML =
  `<span>Score: <b id="score">0</b></span>` +
  `<span>Time left: <b id="time">30.0</b></span>` +
  `<span>Status: <b id="status">playing</b></span>` +
  `<span style="margin-left:auto;opacity:.7">WASD/arrows move, P pause, R restart</span>`;
document.body.appendChild(hud);
const scoreEl = hud.querySelector<HTMLElement>("#score");
const timeEl = hud.querySelector<HTMLElement>("#time");
const statusEl = hud.querySelector<HTMLElement>("#status");

function syncHud(): void {
  const remaining = Math.max(0, (ROUND_FRAMES - sim.frames) * DT);
  if (scoreEl) scoreEl.textContent = String(sim.score);
  if (timeEl) timeEl.textContent = remaining.toFixed(1);
  if (statusEl) statusEl.textContent = status();
}

// ---------------------------------------------------------------- scene
resetRound();

const canvas = document.getElementById("app");
if (!(canvas instanceof HTMLCanvasElement)) throw new Error("canvas #app not found");

const wall = material.pbr({ color: "#3b4a63", roughness: 0.8 });
const half = ARENA_HALF;

const builder = scene()
  .add(looks.preset("outdoor-day"))
  .add(primitives.plane({ name: "arena floor", size: [half * 2, 1, half * 2], material: material.pbr({ color: "#4f7a5a", roughness: 0.9 }) }))
  .add(primitives.box({ name: "wall n", size: [half * 2 + 0.4, 0.6, 0.4], material: wall }).position(0, 0.3, -half - 0.2))
  .add(primitives.box({ name: "wall s", size: [half * 2 + 0.4, 0.6, 0.4], material: wall }).position(0, 0.3, half + 0.2))
  .add(primitives.box({ name: "wall w", size: [0.4, 0.6, half * 2], material: wall }).position(-half - 0.2, 0.3, 0))
  .add(primitives.box({ name: "wall e", size: [0.4, 0.6, half * 2], material: wall }).position(half + 0.2, 0.3, 0))
  .add(
    primitives
      .sphere({ name: "player", size: PLAYER_RADIUS * 2, material: material.pbr({ color: "#e8523f", roughness: 0.4 }) })
      .position(sim.px, PLAYER_RADIUS, sim.pz)
      .runtime(game.runtimeNode("player", { tags: ["player"] }))
  );

for (let i = 0; i < COIN_COUNT; i++) {
  const c = sim.coins[i] ?? { x: 0, z: 0 };
  builder.add(
    primitives
      .sphere({
        name: `coin ${i}`,
        size: COIN_RADIUS * 2,
        material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 3, roughness: 0.3 })
      })
      .position(c.x, 0.5, c.z)
      .runtime(game.runtimeNode(`coin-${i}`, { tags: ["coin"] }))
  );
}

builder.camera(camera.perspective({ position: [0, 17, 11], target: [0, 0, 0.5], fov: 45 }));

const app = createAuraApp(canvas, {
  scene: builder,
  resize: false,
  pixelRatio: 1
});

const playerNode = app.nodes.require("player");
const coinNodes = Array.from({ length: COIN_COUNT }, (_, i) => app.nodes.require(`coin-${i}`));

function syncNodes(): void {
  playerNode.setPosition(sim.px, PLAYER_RADIUS, sim.pz);
  for (let i = 0; i < coinNodes.length; i++) {
    const c = sim.coins[i];
    const node = coinNodes[i];
    if (c && node) node.setPosition(c.x, 0.5, c.z);
  }
}

// ---------------------------------------------------------------- main loop
let last = -1;
let accumulator = 0;

function frame(now: number): void {
  if (last < 0) last = now;
  accumulator += Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  while (accumulator >= DT) {
    stepOnce();
    accumulator -= DT;
  }
  syncNodes();
  syncHud();
  requestAnimationFrame(frame);
}

syncNodes();
syncHud();
requestAnimationFrame(frame);

void app.ready().then(() => {
  requestAnimationFrame(() => requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  }));
});
