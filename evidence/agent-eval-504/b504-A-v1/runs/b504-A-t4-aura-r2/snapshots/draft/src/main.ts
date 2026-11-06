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

const DT = 1 / 60;
const ROUND_SECONDS = 30;
const ROUND_FRAMES = ROUND_SECONDS * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF = 10; // arena half-size
const SPEED = 9; // units per second
const PLAYER_R = 0.6;
const COIN_R = 0.45;
const SEED = 20240611;

// ---- Simulation state ----
type Status = "playing" | "paused" | "won" | "lost";
let rngState = SEED;
const rand = (): number => (rngState = (Math.imul(rngState, 1664525) + 1013904223) >>> 0) / 4294967296;

let px = 0;
let pz = 0;
let score = 0;
let frames = 0;
let paused = false;
let ended: "won" | "lost" | null = null;
const coins: Array<[number, number]> = [];

const spawnCoin = (): [number, number] => {
  for (let tries = 0; tries < 20; tries += 1) {
    const x = (rand() * 2 - 1) * (HALF - 1);
    const z = (rand() * 2 - 1) * (HALF - 1);
    if (Math.hypot(x - px, z - pz) > 2.5) return [x, z];
  }
  return [(rand() * 2 - 1) * (HALF - 1), (rand() * 2 - 1) * (HALF - 1)];
};

const reset = (): void => {
  rngState = SEED;
  px = 0;
  pz = 0;
  score = 0;
  frames = 0;
  paused = false;
  ended = null;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i += 1) coins.push(spawnCoin());
};

const keys = new Set<string>();
const axis = (neg: string[], pos: string[]): number => {
  let v = 0;
  if (neg.some((k) => keys.has(k))) v -= 1;
  if (pos.some((k) => keys.has(k))) v += 1;
  return v;
};

const stepOnce = (): void => {
  if (paused || ended) return;
  let dx = axis(["arrowleft", "a"], ["arrowright", "d"]);
  let dz = axis(["arrowup", "w"], ["arrowdown", "s"]);
  const len = Math.hypot(dx, dz);
  if (len > 0) {
    dx /= len;
    dz /= len;
  }
  px = Math.max(-HALF + PLAYER_R, Math.min(HALF - PLAYER_R, px + dx * SPEED * DT));
  pz = Math.max(-HALF + PLAYER_R, Math.min(HALF - PLAYER_R, pz + dz * SPEED * DT));
  frames += 1;

  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i]!;
    if (Math.hypot(c[0] - px, c[1] - pz) < PLAYER_R + COIN_R) {
      score += 1;
      coins[i] = spawnCoin();
      if (score >= WIN_SCORE) {
        ended = "won";
        return;
      }
    }
  }
  if (frames >= ROUND_FRAMES) ended = "lost";
};

const status = (): Status => (ended ? ended : paused ? "paused" : "playing");

reset();

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "p") {
    if (!e.repeat && !ended) paused = !paused;
    return;
  }
  if (k === "r") {
    reset();
    return;
  }
  if (["arrowup", "arrowdown", "arrowleft", "arrowright", "w", "a", "s", "d"].includes(k)) {
    keys.add(k);
    if (k.startsWith("arrow")) e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener("blur", () => keys.clear());

window.__EVAL__ = {
  state: () => ({ score, status: status(), time: frames * DT }),
  step: (n: number) => {
    const count = Math.max(0, Math.floor(Number(n) || 0));
    for (let i = 0; i < count; i += 1) stepOnce();
  }
};

// ---- HUD (DOM, outside canvas) ----
const hud = document.createElement("div");
hud.style.cssText = "padding:6px 0;font:14px system-ui,sans-serif;display:flex;gap:18px";
hud.innerHTML =
  'Score: <span id="score">0</span> Time left: <span id="time">30.0</span> Status: <span id="status">playing</span>';
document.body.appendChild(hud);
const elScore = document.getElementById("score")!;
const elTime = document.getElementById("time")!;
const elStatus = document.getElementById("status")!;
const updateHud = (): void => {
  elScore.textContent = String(score);
  elTime.textContent = Math.max(0, ROUND_SECONDS - frames * DT).toFixed(1);
  elStatus.textContent = status();
};

// ---- Scene ----
let sc = scene({ background: "#10151f" })
  .camera(camera.perspective({ position: [0, 17, 12], target: [0, 0, 0], fov: 50, near: 0.5, far: 100 }))
  .add(lights.hemisphere({ skyColor: "#dfe9ff", groundColor: "#3a3f4a", intensity: 1.2 }))
  .add(lights.directional({ position: [8, 20, 6], target: [0, 0, 0], intensity: 2.5, shadow: true }))
  .add(primitives.plane({ name: "arena", size: [HALF * 2, 1, HALF * 2], material: material.pbr({ color: "#3f6b4a", roughness: 1 }) }))
  .add(
    primitives
      .sphere({ name: "player", size: PLAYER_R * 2, material: material.pbr({ color: "#4aa3ff", roughness: 0.4 }) })
      .position(px, PLAYER_R, pz)
      .runtime({ id: "player", mutable: true })
  );
const coinMat = material.pbr({ color: "#ffd23a", metallic: 0.6, roughness: 0.3 });
for (let i = 0; i < COIN_COUNT; i += 1) {
  const c = coins[i]!;
  sc = sc.add(
    primitives
      .cylinder({ name: `coin${i}`, size: [COIN_R * 2, 0.15, COIN_R * 2], material: coinMat })
      .position(c[0], 0.5, c[1])
      .runtime({ id: `coin${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sc });
let acc = 0;
app.onFrame((f) => {
  if (!paused && !ended) {
    acc = Math.min(acc + f.dt, 0.25);
    while (acc >= DT) {
      stepOnce();
      acc -= DT;
    }
  }
  app.nodes.require("player").setPosition(px, PLAYER_R, pz);
  for (let i = 0; i < COIN_COUNT; i += 1) {
    const c = coins[i]!;
    app.nodes.require(`coin${i}`).setPosition(c[0], 0.5, c[1]);
  }
  updateHud();
});
await app.ready();
updateHud();
window.__EVAL_READY__ = true;
