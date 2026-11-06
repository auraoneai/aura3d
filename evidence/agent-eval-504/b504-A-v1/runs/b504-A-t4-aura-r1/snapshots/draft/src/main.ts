import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __EVAL__?: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
  }
}

const DT = 1 / 60;
const ROUND_TICKS = 30 * 60;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF = 9; // arena half-size
const LIMIT = HALF - 0.5; // player centre limit
const SPEED = 9;
const TOUCH = 1.0;

// ---------- HUD (DOM, outside the canvas) ----------
const hud = document.createElement("div");
hud.style.cssText = "padding:6px 10px;font:14px/1.4 system-ui,sans-serif;display:flex;gap:18px";
hud.innerHTML =
  'Score: <b id="score">0</b> Time left: <b id="time">30.0</b> Status: <b id="status">playing</b>';
document.body.appendChild(hud);
const scoreEl = document.getElementById("score") as HTMLElement;
const timeEl = document.getElementById("time") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

// ---------- game state ----------
let seed = 1;
const rand = (): number => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296;

let px = 0;
let pz = 0;
let score = 0;
let ticks = 0;
let ended: "won" | "lost" | null = null;
let paused = false;
const coins: { x: number; z: number }[] = [];

const spawnCoin = (): { x: number; z: number } => {
  for (let i = 0; i < 50; i += 1) {
    const x = (rand() * 2 - 1) * LIMIT;
    const z = (rand() * 2 - 1) * LIMIT;
    if (Math.hypot(x - px, z - pz) > 3) return { x, z };
  }
  return { x: -px, z: -pz };
};

const reset = (): void => {
  seed = 1;
  px = 0;
  pz = 0;
  score = 0;
  ticks = 0;
  ended = null;
  paused = false;
  coins.length = 0;
  for (let i = 0; i < COIN_COUNT; i += 1) coins.push(spawnCoin());
};
reset();

const keys = new Set<string>();
const axis = (neg: string[], pos: string[]): number =>
  (pos.some((k) => keys.has(k)) ? 1 : 0) - (neg.some((k) => keys.has(k)) ? 1 : 0);

const tick = (): void => {
  if (paused || ended) return;
  ticks += 1;
  let dx = axis(["ArrowLeft", "KeyA"], ["ArrowRight", "KeyD"]);
  let dz = axis(["ArrowUp", "KeyW"], ["ArrowDown", "KeyS"]);
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  px = Math.max(-LIMIT, Math.min(LIMIT, px + dx * SPEED * DT));
  pz = Math.max(-LIMIT, Math.min(LIMIT, pz + dz * SPEED * DT));
  for (let i = 0; i < coins.length; i += 1) {
    const c = coins[i]!;
    if (Math.hypot(c.x - px, c.z - pz) < TOUCH) {
      score += 1;
      coins[i] = spawnCoin();
    }
  }
  if (score >= WIN_SCORE) ended = "won";
  else if (ticks >= ROUND_TICKS) ended = "lost";
};

const status = (): Status => (ended ? ended : paused ? "paused" : "playing");

const state = (): { score: number; status: Status; time: number } => ({
  score,
  status: status(),
  time: ticks * DT
});

window.__EVAL__ = {
  state,
  step: (frames: number): void => {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    for (let i = 0; i < n; i += 1) tick();
  }
};

window.addEventListener("keydown", (e) => {
  if (e.code.startsWith("Arrow") || e.code === "Space") e.preventDefault();
  if (e.repeat) return;
  if (e.code === "KeyP") {
    if (!ended) paused = !paused;
    return;
  }
  if (e.code === "KeyR") {
    reset();
    return;
  }
  keys.add(e.code);
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => keys.clear());

// ---------- scene ----------
const coinIds = coins.map((_, i) => `coin${i}`);
let sc = scene({ background: "#14182a" })
  .camera(camera.perspective({ position: [0, 20, 15], target: [0, 0, 0], fov: 45, near: 0.5, far: 100 }))
  .add(lights.hemisphere({ skyColor: "#dfe8ff", groundColor: "#44485a", intensity: 1.2 }))
  .add(lights.directional({ position: [8, 20, 6], target: [0, 0, 0], intensity: 2.5 }))
  .add(
    primitives.plane({
      name: "arena",
      size: [HALF * 2, 1, HALF * 2],
      material: material.pbr({ color: "#3b5b45", roughness: 0.9 })
    })
  )
  .add(
    primitives
      .sphere({ name: "player", size: 1, material: material.pbr({ color: "#4aa3ff", roughness: 0.4 }) })
      .position(px, 0.5, pz)
      .runtime({ id: "player", mutable: true })
  );
const coinMat = material.pbr({ color: "#ffd23a", metallic: 0.6, roughness: 0.3 });
coins.forEach((c, i) => {
  sc = sc.add(
    primitives
      .cylinder({ name: coinIds[i]!, size: [0.8, 0.15, 0.8], material: coinMat })
      .position(c.x, 0.5, c.z)
      .runtime({ id: coinIds[i]!, mutable: true })
  );
});

const app = createAuraApp("#app", { scene: sc });

let acc = 0;
let clock = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.25);
  clock += dt;
  acc += dt;
  while (acc >= DT) {
    acc -= DT;
    tick();
  }
  app.nodes.require("player").setPosition(px, 0.5, pz);
  coins.forEach((c, i) => {
    app.nodes.require(coinIds[i]!).setPosition(c.x, 0.5 + Math.sin(clock * 3 + i) * 0.1, c.z);
  });
  const s = state();
  scoreEl.textContent = String(s.score);
  timeEl.textContent = Math.max(0, 30 - s.time).toFixed(1);
  statusEl.textContent = s.status;
});

await app.ready();
window.__EVAL_READY__ = true;
