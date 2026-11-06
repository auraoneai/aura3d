import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __EVAL__?: {
      state: () => { score: number; status: "playing" | "paused" | "won" | "lost"; time: number };
      step: (frames: number) => void;
    };
  }
}

type Status = "playing" | "paused" | "won" | "lost";

const DT = 1 / 60;
const ROUND_SECONDS = 30;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF = 10; // arena spans [-HALF, HALF] on x and z
const PLAYER_R = 0.5;
const COIN_R = 0.4;
const SPEED = 8;
const SEED = 20240607;

// ---------- HUD (DOM, outside the canvas) ----------
const hud = document.createElement("div");
hud.style.cssText = "padding:6px 10px;font:14px/1.4 system-ui,sans-serif;display:flex;gap:18px";
const mk = (label: string, id: string): HTMLElement => {
  const wrap = document.createElement("span");
  wrap.append(`${label}: `);
  const v = document.createElement("span");
  v.id = id;
  wrap.append(v);
  hud.append(wrap);
  return v;
};
const scoreEl = mk("Score", "score");
const timeEl = mk("Time", "time");
const statusEl = mk("Status", "status");
document.body.append(hud);

// ---------- Simulation state ----------
let seed = SEED;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

let frames = 0; // simulated fixed steps in this round
let score = 0;
let result: "playing" | "won" | "lost" = "playing";
let paused = false;
let px = 0;
let pz = 0;
const coins: Array<{ x: number; z: number }> = [];
const keys = new Set<string>();

const spawnCoin = (index: number): void => {
  let x = 0;
  let z = 0;
  for (let attempt = 0; attempt < 50; attempt += 1) {
    x = (rand() * 2 - 1) * (HALF - 1);
    z = (rand() * 2 - 1) * (HALF - 1);
    const farFromPlayer = Math.hypot(x - px, z - pz) > 2.5;
    const farFromCoins = coins.every((c, i) => i === index || Math.hypot(x - c.x, z - c.z) > 1.5);
    if (farFromPlayer && farFromCoins) break;
  }
  coins[index] = { x, z };
};

const reset = (): void => {
  seed = SEED;
  frames = 0;
  score = 0;
  result = "playing";
  paused = false;
  px = 0;
  pz = 0;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i += 1) spawnCoin(i);
};
reset();

const axis = (neg: string[], pos: string[]): number =>
  (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

const stepOnce = (): void => {
  if (paused || result !== "playing") return;
  frames += 1;
  let dx = axis(["arrowleft", "a"], ["arrowright", "d"]);
  let dz = axis(["arrowup", "w"], ["arrowdown", "s"]);
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  const lim = HALF - PLAYER_R;
  px = Math.max(-lim, Math.min(lim, px + dx * SPEED * DT));
  pz = Math.max(-lim, Math.min(lim, pz + dz * SPEED * DT));
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i]!;
    if (Math.hypot(c.x - px, c.z - pz) <= PLAYER_R + COIN_R) {
      score += 1;
      spawnCoin(i);
    }
  }
  if (score >= WIN_SCORE) result = "won";
  else if (frames >= ROUND_SECONDS * 60) result = "lost";
};

const status = (): Status => (paused && result === "playing" ? "paused" : result);
const elapsed = (): number => frames / 60;

window.__EVAL__ = {
  state: () => ({ score, status: status(), time: elapsed() }),
  step: (n: number) => {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i += 1) stepOnce();
    updateHud();
  }
};

function updateHud(): void {
  scoreEl.textContent = String(score);
  timeEl.textContent = Math.max(0, ROUND_SECONDS - elapsed()).toFixed(1);
  statusEl.textContent = status();
}

// ---------- Input ----------
const GAME_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "w", "a", "s", "d"]);
window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (GAME_KEYS.has(k)) {
    keys.add(k);
    e.preventDefault();
  } else if (k === "p" && !e.repeat) {
    if (result === "playing") paused = !paused;
  } else if (k === "r" && !e.repeat) {
    reset();
    updateHud();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

// ---------- Scene ----------
let sc = scene({ background: "#1b2230" })
  .camera(camera.perspective({ position: [0, 17, 11], target: [0, 0, 0], fov: 45, near: 0.5, far: 100 }))
  .add(lights.hemisphere({ skyColor: "#dbe8ff", groundColor: "#44506a", intensity: 1.2 }))
  .add(lights.directional({ position: [6, 14, 6], target: [0, 0, 0], intensity: 2.5, shadow: true }))
  .add(primitives.plane({ name: "floor", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#3b4a63", roughness: 0.9 }) }));

sc = sc.add(
  primitives
    .sphere({ name: "player", size: PLAYER_R * 2, material: material.pbr({ color: "#4fc3f7", roughness: 0.4 }) })
    .position(px, PLAYER_R, pz)
    .runtime({ id: "player", mutable: true })
);
for (let i = 0; i < COIN_COUNT; i += 1) {
  const c = coins[i]!;
  sc = sc.add(
    primitives
      .cylinder({ name: `coin${i}`, size: [COIN_R * 2, 0.12, COIN_R * 2], material: material.pbr({ color: "#ffd23f", metallic: 0.6, roughness: 0.3 }) })
      .position(c.x, 0.5, c.z)
      .runtime({ id: `coin${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });

let acc = 0;
app.onFrame((f) => {
  acc += Math.min(f.dt, 0.25);
  while (acc >= DT) {
    stepOnce();
    acc -= DT;
  }
  app.nodes.require("player").setPosition(px, PLAYER_R, pz);
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i]!;
    const n = app.nodes.require(`coin${i}`);
    n.setPosition(c.x, 0.5 + Math.sin(elapsed() * 3 + i) * 0.08, c.z);
    n.setRotation(0.5, elapsed() * 3 + i, 0);
  }
  updateHud();
});

await app.ready();
updateHud();
window.__EVAL_READY__ = true;
