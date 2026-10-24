import { camera, createAuraApp, game, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

declare global {
  interface Window {
    __EVAL__?: { state: () => { score: number; status: Status; time: number }; step: (frames: number) => void };
    __EVAL_READY__?: boolean;
  }
}

// ---- Rules -----------------------------------------------------------------
const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60; // 30 s round
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HX = 9; // arena half extents (x, z)
const HZ = 5;
const PLAYER_R = 0.5;
const COIN_R = 0.35;
const SPEED = 8;
const SEED = 20240607;

// ---- Deterministic RNG -----------------------------------------------------
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

// ---- Simulation state ------------------------------------------------------
interface Coin { x: number; z: number }
let rng = mulberry32(SEED);
let frames = 0;
let score = 0;
let outcome: "playing" | "won" | "lost" = "playing";
let paused = false;
const player = { x: 0, z: 0 };
const coins: Coin[] = [];

const keys = new Set<string>();

function spawnCoin(index: number): Coin {
  let x = 0;
  let z = 0;
  for (let attempt = 0; attempt < 60; attempt++) {
    x = (rng() * 2 - 1) * (HX - 1);
    z = (rng() * 2 - 1) * (HZ - 1);
    const nearPlayer = Math.hypot(x - player.x, z - player.z) < 2;
    const nearCoin = coins.some((c, i) => i !== index && Math.hypot(x - c.x, z - c.z) < 1.4);
    if (!nearPlayer && !nearCoin) break;
  }
  return { x, z };
}

function reset(): void {
  rng = mulberry32(SEED);
  frames = 0;
  score = 0;
  outcome = "playing";
  paused = false;
  player.x = 0;
  player.z = 0;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i++) coins.push(spawnCoin(i));
}

function inputAxis(): { x: number; z: number } {
  const left = keys.has("left") ? 1 : 0;
  const right = keys.has("right") ? 1 : 0;
  const up = keys.has("up") ? 1 : 0;
  const down = keys.has("down") ? 1 : 0;
  let x = right - left;
  let z = down - up;
  const len = Math.hypot(x, z);
  if (len > 0) {
    x /= len;
    z /= len;
  }
  return { x, z };
}

function simulate(): void {
  if (paused || outcome !== "playing") return;
  const dir = inputAxis();
  player.x = Math.max(-HX + PLAYER_R, Math.min(HX - PLAYER_R, player.x + dir.x * SPEED * DT));
  player.z = Math.max(-HZ + PLAYER_R, Math.min(HZ - PLAYER_R, player.z + dir.z * SPEED * DT));
  frames++;

  for (let i = 0; i < coins.length; i++) {
    const c = coins[i]!;
    if (Math.hypot(c.x - player.x, c.z - player.z) <= PLAYER_R + COIN_R) {
      score++;
      if (score >= WIN_SCORE) {
        outcome = "won";
        return;
      }
      coins[i] = spawnCoin(i);
    }
  }
  if (frames >= ROUND_FRAMES) outcome = "lost";
}

function currentStatus(): Status {
  if (outcome !== "playing") return outcome;
  return paused ? "paused" : "playing";
}

function getState(): { score: number; status: Status; time: number } {
  return { score, status: currentStatus(), time: frames * DT };
}

// ---- HUD (DOM, outside the canvas) ----------------------------------------
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 10px;font:14px/1.4 system-ui,sans-serif;color:#fff;background:#111;width:620px";
hud.innerHTML =
  '<span>Score: <b id="score">0</b></span>' +
  '<span>Time left: <b id="time">30.0</b></span>' +
  '<span>Status: <b id="status">playing</b></span>' +
  '<span style="margin-left:auto;opacity:.7">WASD/arrows move, P pause, R restart</span>';
document.body.appendChild(hud);
const scoreEl = document.getElementById("score")!;
const timeEl = document.getElementById("time")!;
const statusEl = document.getElementById("status")!;

function updateHud(): void {
  const s = getState();
  scoreEl.textContent = String(s.score);
  timeEl.textContent = Math.max(0, ROUND_FRAMES * DT - s.time).toFixed(1);
  statusEl.textContent = s.status;
}

// ---- Scene -----------------------------------------------------------------
let app: AuraApp | undefined;
const coinHandles: Array<ReturnType<AuraApp["nodes"]["require"]>> = [];
let playerHandle: ReturnType<AuraApp["nodes"]["require"]> | undefined;

function buildScene() {
  const s = scene({ background: "#10151f" })
    .add(lights.ambient({ intensity: 0.7 }))
    .add(lights.directional({ position: [6, 12, 6], target: [0, 0, 0], intensity: 2.2, shadow: true }))
    .add(primitives.plane({
      name: "arena floor",
      size: [HX * 2, 1, HZ * 2],
      material: material.pbr({ color: "#2b3a55", roughness: 0.9 })
    }))
    .add(primitives.box({ name: "wall n", size: [HX * 2 + 0.6, 0.6, 0.3], position: [0, 0.3, -HZ - 0.15], material: material.pbr({ color: "#8aa0c8" }) }))
    .add(primitives.box({ name: "wall s", size: [HX * 2 + 0.6, 0.6, 0.3], position: [0, 0.3, HZ + 0.15], material: material.pbr({ color: "#8aa0c8" }) }))
    .add(primitives.box({ name: "wall w", size: [0.3, 0.6, HZ * 2], position: [-HX - 0.15, 0.3, 0], material: material.pbr({ color: "#8aa0c8" }) }))
    .add(primitives.box({ name: "wall e", size: [0.3, 0.6, HZ * 2], position: [HX + 0.15, 0.3, 0], material: material.pbr({ color: "#8aa0c8" }) }))
    .add(
      primitives.sphere({
        name: "player",
        size: PLAYER_R * 2,
        position: [0, PLAYER_R, 0],
        material: material.pbr({ color: "#3ea6ff", roughness: 0.35, metalness: 0.1 })
      }).runtime(game.runtimeNode("player", { tags: ["player"] }))
    );
  for (let i = 0; i < COIN_COUNT; i++) {
    s.add(
      primitives.cylinder({
        name: `coin ${i}`,
        size: [COIN_R * 2, 0.12, COIN_R * 2],
        position: [0, 0.45, 0],
        rotation: [Math.PI / 2, 0, 0],
        material: material.emissive({ color: "#ffd54d", emissive: "#ffb800", emissiveIntensity: 2, roughness: 0.3 })
      }).runtime(game.runtimeNode(`coin-${i}`, { tags: ["coin"] }))
    );
  }
  return s.camera(camera.perspective({ position: [0, 13, 9.5], target: [0, 0, 0.4], fov: 45 }));
}

function syncVisuals(): void {
  if (!playerHandle) return;
  playerHandle.setPosition(player.x, PLAYER_R, player.z);
  const t = frames * DT;
  for (let i = 0; i < coinHandles.length; i++) {
    const c = coins[i]!;
    coinHandles[i]!.setPosition(c.x, 0.5 + Math.sin(t * 4 + i) * 0.08, c.z);
  }
}

// ---- Input -----------------------------------------------------------------
const CODE_TO_DIR: Record<string, string> = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up",
  ArrowDown: "down", KeyS: "down"
};
const KEY_TO_DIR: Record<string, string> = {
  arrowleft: "left", a: "left",
  arrowright: "right", d: "right",
  arrowup: "up", w: "up",
  arrowdown: "down", s: "down"
};

function dirOf(e: KeyboardEvent): string | undefined {
  return CODE_TO_DIR[e.code] ?? KEY_TO_DIR[e.key.toLowerCase()];
}

function isKey(e: KeyboardEvent, code: string, key: string): boolean {
  return e.code === code || e.key.toLowerCase() === key;
}

window.addEventListener("keydown", (e) => {
  const dir = dirOf(e);
  if (dir) {
    keys.add(dir);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (isKey(e, "KeyP", "p")) {
    if (outcome === "playing") paused = !paused;
    updateHud();
  } else if (isKey(e, "KeyR", "r")) {
    reset();
    syncVisuals();
    updateHud();
  }
});
window.addEventListener("keyup", (e) => {
  const dir = dirOf(e);
  if (dir) keys.delete(dir);
});
window.addEventListener("blur", () => keys.clear());

// ---- Eval hooks ------------------------------------------------------------
window.__EVAL__ = {
  state: getState,
  step(n: number): void {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i++) simulate();
    syncVisuals();
    updateHud();
  }
};

// ---- Boot ------------------------------------------------------------------
reset();
updateHud();

try {
  const canvas = document.getElementById("app") as HTMLCanvasElement;
  app = createAuraApp(canvas, {
    scene: buildScene(),
    resize: false,
    pixelRatio: 1
  });
  playerHandle = app.nodes.require("player");
  for (let i = 0; i < COIN_COUNT; i++) coinHandles.push(app.nodes.require(`coin-${i}`));
  syncVisuals();
} catch (err) {
  console.error("Aura3D init failed", err);
}

// Fixed-timestep loop (accumulator), independent of display refresh rate.
let last: number | null = null;
let acc = 0;
function frame(ts: number): void {
  if (last !== null) {
    acc += Math.min((ts - last) / 1000, 0.25);
    while (acc >= DT - 1e-9) {
      simulate();
      acc -= DT;
    }
  }
  last = ts;
  syncVisuals();
  updateHud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

const mounted = app ? app.ready() : Promise.resolve();
void Promise.race([mounted, new Promise<void>((resolve) => setTimeout(resolve, 5000))]).then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
