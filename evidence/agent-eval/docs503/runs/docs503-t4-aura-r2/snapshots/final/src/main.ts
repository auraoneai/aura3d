import { camera, createAuraApp, lights, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_X = 7;
const HALF_Z = 4.2;
const PLAYER_R = 0.5;
const COIN_R = 0.35;
const SPEED = 6;
const SEED = 20240607;

// --- deterministic RNG (mulberry32) ---
function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// --- simulation state ---
interface Coin { x: number; z: number }
let rng = makeRng(SEED);
let px = 0;
let pz = 0;
let score = 0;
let frames = 0;
let paused = false;
let outcome: "playing" | "won" | "lost" = "playing";
const coins: Coin[] = [];
const keys = new Set<string>();

function spawnCoin(): Coin {
  for (let tries = 0; tries < 50; tries += 1) {
    const x = (rng() * 2 - 1) * (HALF_X - 0.5);
    const z = (rng() * 2 - 1) * (HALF_Z - 0.5);
    const clearOfPlayer = Math.hypot(x - px, z - pz) > PLAYER_R + COIN_R + 1;
    const clearOfCoins = coins.every((c) => Math.hypot(c.x - x, c.z - z) > 1);
    if (clearOfPlayer && clearOfCoins) return { x, z };
  }
  return { x: (rng() * 2 - 1) * (HALF_X - 0.5), z: (rng() * 2 - 1) * (HALF_Z - 0.5) };
}

function resetSim(): void {
  rng = makeRng(SEED);
  px = 0;
  pz = 0;
  score = 0;
  frames = 0;
  paused = false;
  outcome = "playing";
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i += 1) coins.push(spawnCoin());
}

function status(): Status {
  if (outcome !== "playing") return outcome;
  return paused ? "paused" : "playing";
}

function stepOnce(): void {
  if (paused || outcome !== "playing") return;
  const dx = (keys.has("right") ? 1 : 0) - (keys.has("left") ? 1 : 0);
  const dz = (keys.has("down") ? 1 : 0) - (keys.has("up") ? 1 : 0);
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    px = Math.max(-HALF_X + PLAYER_R, Math.min(HALF_X - PLAYER_R, px + (dx / len) * SPEED * DT));
    pz = Math.max(-HALF_Z + PLAYER_R, Math.min(HALF_Z - PLAYER_R, pz + (dz / len) * SPEED * DT));
  }
  frames += 1;
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i];
    if (c && Math.hypot(c.x - px, c.z - pz) < PLAYER_R + COIN_R) {
      score += 1;
      coins[i] = { x: 1e9, z: 1e9 }; // park the slot far away while choosing a new spot
      coins[i] = spawnCoin();
    }
  }
  if (score >= WIN_SCORE) outcome = "won";
  else if (frames >= ROUND_FRAMES) outcome = "lost";
}

function step(n: number): void {
  const count = Math.max(0, Math.floor(Number(n) || 0));
  for (let i = 0; i < count; i += 1) stepOnce();
  syncView();
}

// --- DOM HUD ---
const hud = document.createElement("div");
hud.style.cssText = "position:absolute;left:8px;top:6px;font:14px/1.5 system-ui,sans-serif;color:#fff;text-shadow:0 1px 2px #000;pointer-events:none";
hud.innerHTML =
  'Score: <span id="score">0</span> &nbsp; Time: <span id="time">30.0</span> &nbsp; Status: <span id="status">playing</span>';
document.body.style.position = "relative";
document.body.appendChild(hud);
const scoreEl = hud.querySelector<HTMLElement>("#score");
const timeEl = hud.querySelector<HTMLElement>("#time");
const statusEl = hud.querySelector<HTMLElement>("#status");

// --- scene ---
const LOOK = "neon-arcade" as const;
let sceneBuilder = scene()
  .add(looks.preset(LOOK))
  .add(lights.directional({ position: [3, 9, 4], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .camera(camera.perspective({ position: [0, 11, 7.5], target: [0, 0, 0.3], fov: 45 }))
  .add(primitives.plane({ name: "floor", size: [HALF_X * 2, 1, HALF_Z * 2], material: material.pbr({ color: "#2a3350", roughness: 0.85 }), castShadow: false }))
  .add(
    primitives
      .sphere({ name: "player", size: PLAYER_R * 2, position: [0, PLAYER_R, 0], material: material.pbr({ color: "#4f8cff", roughness: 0.35 }) })
      .runtime({ id: "player", mutable: true })
  );
resetSim();
for (let i = 0; i < COIN_COUNT; i += 1) {
  const c = coins[i] ?? { x: 0, z: 0 };
  sceneBuilder = sceneBuilder.add(
    primitives
      .cylinder({
        name: `coin${i}`,
        size: [COIN_R * 2, 0.12, COIN_R * 2],
        position: [c.x, 0.4, c.z],
        rotation: [Math.PI / 2, 0, 0],
        material: material.pbr({ color: "#ffd24a", metallic: 0.8, roughness: 0.3 })
      })
      .runtime({ id: `coin${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", {
  scene: sceneBuilder,
  resize: false,
  ...looks.appOptions(LOOK)
});

function syncView(): void {
  if (scoreEl) scoreEl.textContent = String(score);
  if (timeEl) timeEl.textContent = Math.max(0, 30 - frames * DT).toFixed(1);
  if (statusEl) statusEl.textContent = status();
  if (!viewReady) return;
  app.nodes.require("player").setPosition(px, PLAYER_R, pz);
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i];
    if (c) app.nodes.require(`coin${i}`).setPosition(c.x, 0.4, c.z);
  }
}

// --- input ---
const KEYMAP: Record<string, string> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down"
};

window.addEventListener("keydown", (e) => {
  const dir = KEYMAP[e.code];
  if (dir) {
    keys.add(dir);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === "KeyP") {
    if (outcome === "playing") paused = !paused;
    syncView();
  } else if (e.code === "KeyR") {
    resetSim();
    accumulator = 0;
    syncView();
  }
});
window.addEventListener("keyup", (e) => {
  const dir = KEYMAP[e.code];
  if (dir) keys.delete(dir);
});
window.addEventListener("blur", () => keys.clear());

// --- eval hooks ---
declare global {
  interface Window {
    __EVAL__: {
      state(): { score: number; status: Status; time: number };
      step(frames: number): void;
    };
    __EVAL_READY__?: boolean;
  }
}
window.__EVAL__ = {
  state: () => ({ score, status: status(), time: frames * DT }),
  step
};

// --- frame loop: fixed-step accumulator ---
let viewReady = false;
let accumulator = 0;
let last = 0;
let firstFrame = true;

function tick(now: number): void {
  const elapsed = last === 0 ? 0 : Math.min((now - last) / 1000, 0.25);
  last = now;
  accumulator += elapsed;
  let guard = 0;
  while (accumulator >= DT && guard < 15) {
    stepOnce();
    accumulator -= DT;
    guard += 1;
  }
  if (guard === 15) accumulator = 0;
  syncView();
  if (firstFrame && viewReady) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(tick);
}

void app.ready().then(() => {
  viewReady = true;
  syncView();
});
syncView();
requestAnimationFrame(tick);
