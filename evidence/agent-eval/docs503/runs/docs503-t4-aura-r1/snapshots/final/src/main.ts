import { camera, createAuraApp, lights, looks, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

const STEP = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const ARENA_HALF = 8;
const PLAYER_RADIUS = 0.5;
const COIN_RADIUS = 0.45;
const PLAYER_SPEED = 7;
const SEED = 20240611;

declare global {
  interface Window {
    __EVAL__?: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__?: boolean;
  }
}

// ---------- deterministic RNG (mulberry32) ----------
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

// ---------- simulation ----------
interface Vec2 { x: number; z: number }

const sim = {
  rng: mulberry32(SEED),
  player: { x: 0, z: 0 } as Vec2,
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
    const farFromPlayer = Math.hypot(x - sim.player.x, z - sim.player.z) > 2.5;
    const farFromCoins = sim.coins.every((c, i) => i === index || Math.hypot(x - c.x, z - c.z) > 1.5);
    if (farFromPlayer && farFromCoins) break;
  }
  sim.coins[index] = { x, z };
}

function resetSim(): void {
  sim.rng = mulberry32(SEED);
  sim.player = { x: 0, z: 0 };
  sim.coins = [];
  for (let i = 0; i < COIN_COUNT; i++) spawnCoin(i);
  sim.score = 0;
  sim.frames = 0;
  sim.ended = null;
  sim.paused = false;
}

// ---------- input ----------
const held = new Set<string>();
const MOVE_KEYS = new Set(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"]);

function axis(neg: string[], pos: string[]): number {
  const n = neg.some((k) => held.has(k)) ? 1 : 0;
  const p = pos.some((k) => held.has(k)) ? 1 : 0;
  return p - n;
}

window.addEventListener("keydown", (e) => {
  if (MOVE_KEYS.has(e.code)) {
    held.add(e.code);
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (e.code === "KeyP") {
    if (sim.ended === null) sim.paused = !sim.paused;
  } else if (e.code === "KeyR") {
    resetSim();
  }
});
window.addEventListener("keyup", (e) => {
  held.delete(e.code);
});
window.addEventListener("blur", () => held.clear());

function stepOnce(): void {
  if (sim.paused || sim.ended !== null) return;
  sim.frames++;

  const dx = axis(["ArrowLeft", "KeyA"], ["ArrowRight", "KeyD"]);
  const dz = axis(["ArrowUp", "KeyW"], ["ArrowDown", "KeyS"]);
  if (dx !== 0 || dz !== 0) {
    const len = Math.hypot(dx, dz);
    const lim = ARENA_HALF - PLAYER_RADIUS;
    sim.player.x = Math.max(-lim, Math.min(lim, sim.player.x + (dx / len) * PLAYER_SPEED * STEP));
    sim.player.z = Math.max(-lim, Math.min(lim, sim.player.z + (dz / len) * PLAYER_SPEED * STEP));
  }

  for (let i = 0; i < sim.coins.length; i++) {
    const c = sim.coins[i];
    if (Math.hypot(c.x - sim.player.x, c.z - sim.player.z) < PLAYER_RADIUS + COIN_RADIUS) {
      sim.score++;
      spawnCoin(i);
      if (sim.score >= WIN_SCORE) {
        sim.ended = "won";
        return;
      }
    }
  }

  if (sim.frames >= ROUND_FRAMES) sim.ended = "lost";
}

function status(): Status {
  if (sim.ended !== null) return sim.ended;
  return sim.paused ? "paused" : "playing";
}

function elapsed(): number {
  return sim.frames * STEP;
}

window.__EVAL__ = {
  state: () => ({ score: sim.score, status: status(), time: elapsed() }),
  step: (frames: number) => {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    for (let i = 0; i < n; i++) stepOnce();
  }
};

// ---------- HUD (DOM, outside the canvas) ----------
const hud = document.createElement("div");
hud.style.cssText = "display:flex;gap:24px;padding:6px 10px;font:14px/1.4 system-ui,sans-serif;color:#fff;background:#111;width:620px;";
function hudField(label: string, id: string): HTMLElement {
  const wrap = document.createElement("span");
  wrap.append(`${label}: `);
  const value = document.createElement("span");
  value.id = id;
  wrap.append(value);
  hud.append(wrap);
  return value;
}
const scoreEl = hudField("Score", "score");
const timeEl = hudField("Time left", "time");
const statusEl = hudField("Status", "status");
const help = document.createElement("span");
help.textContent = "Move: arrows/WASD. P pause, R restart. Reach 15 coins in 30 s.";
help.style.opacity = "0.7";
hud.append(help);
document.body.append(hud);

function updateHud(): void {
  scoreEl.textContent = String(sim.score);
  timeEl.textContent = Math.max(0, 30 - elapsed()).toFixed(1);
  statusEl.textContent = status();
}

// ---------- scene ----------
const LOOK = "neon-arcade" as const;
let sceneBuilder = scene()
  .add(looks.preset(LOOK))
  .add(lights.directional({ position: [4, 12, 6], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .camera(camera.perspective({ position: [0, 17, 11], target: [0, 0, 0.5], fov: 45 }))
  .add(
    primitives.plane({
      name: "floor",
      size: [ARENA_HALF * 2, 1, ARENA_HALF * 2],
      material: material.pbr({ color: "#2b3a55", roughness: 0.85 }),
      castShadow: false
    })
  )
  .add(
    primitives
      .sphere({
        name: "player",
        size: PLAYER_RADIUS * 2,
        material: material.pbr({ color: "#43b0ff", roughness: 0.35, metallic: 0.1 })
      })
      .runtime({ id: "player", mutable: true })
  );
for (let i = 0; i < COIN_COUNT; i++) {
  sceneBuilder = sceneBuilder.add(
    primitives
      .cylinder({
        name: `coin-${i}`,
        size: [COIN_RADIUS * 2, 0.15, COIN_RADIUS * 2],
        material: material.pbr({ color: "#ffd23f", roughness: 0.3, metallic: 0.4 })
      })
      .runtime({ id: `coin-${i}`, mutable: true })
  );
}

resetSim();
const app = createAuraApp("#app", { scene: sceneBuilder, ...looks.appOptions(LOOK) });

function present(): void {
  app.nodes.require("player").setPosition(sim.player.x, PLAYER_RADIUS, sim.player.z);
  for (let i = 0; i < sim.coins.length; i++) {
    app.nodes.require(`coin-${i}`).setPosition(sim.coins[i].x, 0.3, sim.coins[i].z);
  }
}

// ---------- main loop: fixed-step accumulator ----------
let ready = false;
let accumulator = 0;
let last = performance.now();
let firstFrameDone = false;

function frame(now: number): void {
  requestAnimationFrame(frame);
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (ready) {
    if (!sim.paused && sim.ended === null) {
      accumulator += dt;
      let guard = 0;
      while (accumulator >= STEP && guard++ < 15) {
        stepOnce();
        accumulator -= STEP;
      }
      if (guard >= 15) accumulator = 0;
    } else {
      accumulator = 0;
    }
    present();
    updateHud();
    if (!firstFrameDone) {
      firstFrameDone = true;
      window.__EVAL_READY__ = true;
    }
  }
}

updateHud();
app
  .ready()
  .then(() => {
    ready = true;
    last = performance.now();
  })
  .catch((error: unknown) => {
    console.error(error);
    ready = true; // keep the simulation and HUD usable even if rendering failed
  });
requestAnimationFrame(frame);
