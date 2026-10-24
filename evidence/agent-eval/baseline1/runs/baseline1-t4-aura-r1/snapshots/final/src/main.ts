import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";

interface EvalApi {
  state(): { score: number; status: Status; time: number };
  step(frames: number): void;
}

declare global {
  interface Window {
    __EVAL__?: EvalApi;
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- constants
const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60; // 30 s round at a fixed 1/60 s step
const ROUND_SECONDS = 30;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const ARENA_HALF = 9;
const PLAYER_RADIUS = 0.5;
const COIN_RADIUS = 0.45;
const PLAYER_SPEED = 7;
const SEED = 0xc0ffee;

// ---------------------------------------------------------------- seeded RNG
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
interface Vec2 { x: number; z: number }

const sim = {
  frames: 0,
  score: 0,
  paused: false,
  outcome: "playing" as "playing" | "won" | "lost",
  player: { x: 0, z: 0 } as Vec2,
  coins: [] as Vec2[],
  rand: mulberry32(SEED)
};

function pickCoinPosition(avoid: readonly Vec2[], minDist: number): Vec2 {
  const span = ARENA_HALF - 1;
  let best: Vec2 = { x: 0, z: 0 };
  for (let attempt = 0; attempt < 64; attempt++) {
    const p: Vec2 = { x: (sim.rand() * 2 - 1) * span, z: (sim.rand() * 2 - 1) * span };
    best = p;
    if (avoid.every((o) => Math.hypot(o.x - p.x, o.z - p.z) >= minDist)) return p;
  }
  return best;
}

function resetSim(): void {
  sim.frames = 0;
  sim.score = 0;
  sim.paused = false;
  sim.outcome = "playing";
  sim.player = { x: 0, z: 0 };
  sim.rand = mulberry32(SEED);
  sim.coins = [];
  for (let i = 0; i < COIN_COUNT; i++) {
    sim.coins.push(pickCoinPosition([sim.player, ...sim.coins], 2.5));
  }
}

// ---------------------------------------------------------------- input
const held = new Set<string>();

function keyName(e: KeyboardEvent): string {
  const code = e.code;
  if (code) {
    if (code.startsWith("Key")) return code.slice(3).toLowerCase();
    if (code.startsWith("Arrow")) return code.toLowerCase();
  }
  const key = (e.key ?? "").toLowerCase();
  return key;
}

const ARROW_KEYS = new Set(["arrowup", "arrowdown", "arrowleft", "arrowright"]);

function stepOnce(): void {
  if (sim.paused || sim.outcome !== "playing") return;

  let dx = 0;
  let dz = 0;
  if (held.has("a") || held.has("arrowleft")) dx -= 1;
  if (held.has("d") || held.has("arrowright")) dx += 1;
  if (held.has("w") || held.has("arrowup")) dz -= 1;
  if (held.has("s") || held.has("arrowdown")) dz += 1;
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  const limit = ARENA_HALF - PLAYER_RADIUS;
  sim.player.x = Math.max(-limit, Math.min(limit, sim.player.x + dx * PLAYER_SPEED * DT));
  sim.player.z = Math.max(-limit, Math.min(limit, sim.player.z + dz * PLAYER_SPEED * DT));

  const reach = PLAYER_RADIUS + COIN_RADIUS;
  for (let i = 0; i < sim.coins.length; i++) {
    const coin = sim.coins[i];
    if (!coin) continue;
    if (Math.hypot(coin.x - sim.player.x, coin.z - sim.player.z) < reach) {
      sim.score += 1;
      const others = sim.coins.filter((_, j) => j !== i);
      // New coin appears elsewhere: away from the player, the old spot and other coins.
      sim.coins[i] = pickCoinPosition([sim.player, coin, ...others], 3);
    }
  }

  sim.frames += 1;
  if (sim.score >= WIN_SCORE) sim.outcome = "won";
  else if (sim.frames >= ROUND_FRAMES) sim.outcome = "lost";
}

function status(): Status {
  if (sim.outcome !== "playing") return sim.outcome;
  return sim.paused ? "paused" : "playing";
}

function step(frames: number): void {
  const n = Math.max(0, Math.floor(Number.isFinite(frames) ? frames : 0));
  for (let i = 0; i < n; i++) stepOnce();
  updateHud();
}

window.__EVAL__ = {
  state: () => ({ score: sim.score, status: status(), time: sim.frames * DT }),
  step
};

// ---------------------------------------------------------------- HUD (DOM)
function buildHud(): void {
  const hud = document.createElement("div");
  hud.id = "hud";
  hud.style.cssText = "display:flex;gap:16px;padding:6px 8px;width:624px;font:13px/1.4 system-ui,sans-serif;background:#111;color:#fff";
  hud.innerHTML =
    `<span>Score: <b id="score">0</b></span>` +
    `<span>Time left: <b id="time">30.0</b></span>` +
    `<span>Status: <b id="status" role="status" aria-live="polite">playing</b></span>` +
    `<span style="margin-left:auto;opacity:.7">WASD / arrows move · P pause · R restart</span>`;
  const canvasEl = document.getElementById("app");
  canvasEl?.insertAdjacentElement("afterend", hud);
}

function setText(id: string, text: string): void {
  const el = document.getElementById(id);
  if (el && el.textContent !== text) el.textContent = text;
}

function updateHud(): void {
  const remaining = Math.max(0, ROUND_SECONDS - sim.frames * DT);
  setText("score", String(sim.score));
  setText("time", remaining.toFixed(1));
  setText("status", status());
}

buildHud();
resetSim();
updateHud();

window.addEventListener("keydown", (e) => {
  const k = keyName(e);
  if (ARROW_KEYS.has(k) || (k === " " && e.target === document.body)) e.preventDefault();
  if (e.repeat) {
    held.add(k);
    return;
  }
  if (k === "p") {
    if (sim.outcome === "playing") sim.paused = !sim.paused;
    updateHud();
    return;
  }
  if (k === "r") {
    resetSim();
    updateHud();
    return;
  }
  held.add(k);
});
window.addEventListener("keyup", (e) => {
  held.delete(keyName(e));
});
window.addEventListener("blur", () => held.clear());

// ---------------------------------------------------------------- scene
const coinNames = Array.from({ length: COIN_COUNT }, (_, i) => `coin-${i}`);

const gold = material.pbr({ color: "#ffc61a", metallic: 0.8, roughness: 0.3, emissive: "#6b4a00", emissiveIntensity: 0.6 });
const wallMat = material.pbr({ color: "#3b4a6b", roughness: 0.7 });
const wallLen = ARENA_HALF * 2 + 0.6;
const wallY = 0.3;

const world = scene()
  .background("#10141f")
  .add(lights.ambient({ intensity: 0.6 }))
  .add(lights.directional({ position: [6, 14, 8], target: [0, 0, 0], intensity: 2.2 }))
  .add(
    primitives
      .plane({ name: "arena floor", size: [ARENA_HALF * 2, 1, ARENA_HALF * 2], material: material.pbr({ color: "#2f7d5b", roughness: 0.9 }) })
      .position(0, 0, 0)
  )
  .add(primitives.box({ name: "wall n", size: [wallLen, 0.6, 0.3], material: wallMat }).position(0, wallY, -ARENA_HALF - 0.15))
  .add(primitives.box({ name: "wall s", size: [wallLen, 0.6, 0.3], material: wallMat }).position(0, wallY, ARENA_HALF + 0.15))
  .add(primitives.box({ name: "wall w", size: [0.3, 0.6, wallLen], material: wallMat }).position(-ARENA_HALF - 0.15, wallY, 0))
  .add(primitives.box({ name: "wall e", size: [0.3, 0.6, wallLen], material: wallMat }).position(ARENA_HALF + 0.15, wallY, 0))
  .add(
    primitives
      .sphere({ name: "player", size: PLAYER_RADIUS * 2, material: material.pbr({ color: "#e8453c", roughness: 0.4 }) })
      .position(0, PLAYER_RADIUS, 0)
      .runtime({ id: "player", mutable: true })
  )
  .addMany(
    coinNames.map((id) =>
      primitives
        .cylinder({ name: id, size: [COIN_RADIUS * 2, 0.12, COIN_RADIUS * 2], material: gold })
        .position(0, 0.7, 0)
        .rotate(Math.PI / 2, 0, 0)
        .runtime({ id, mutable: true })
    )
  )
  .camera(camera.perspective({ position: [0, 17, 11], target: [0, 0, 0.5], fov: 45 }));

const app = createAuraApp("#app", {
  scene: world,
  resize: false,
  pixelRatio: 1
});

const playerNode = app.nodes.require("player");
const coinNodes = coinNames.map((id) => app.nodes.require(id));

function syncScene(timeSeconds: number): void {
  playerNode.setPosition(sim.player.x, PLAYER_RADIUS, sim.player.z);
  for (let i = 0; i < coinNodes.length; i++) {
    const c = sim.coins[i];
    const node = coinNodes[i];
    if (!c || !node) continue;
    node.setPosition(c.x, 0.75 + Math.sin(timeSeconds * 3 + i) * 0.1, c.z);
  }
}

// ---------------------------------------------------------------- main loop
let last = 0;
let accumulator = 0;
let framesDrawn = 0;

function frame(now: number): void {
  const dt = last === 0 ? 0 : Math.min(0.25, (now - last) / 1000);
  last = now;
  accumulator += dt;
  let guard = 0;
  while (accumulator >= DT && guard < 30) {
    stepOnce();
    accumulator -= DT;
    guard++;
  }
  if (guard >= 30) accumulator = 0;
  updateHud();
  syncScene(now / 1000);
  framesDrawn++;
  if (framesDrawn === 3) window.__EVAL_READY__ = true;
  requestAnimationFrame(frame);
}

void app.ready().then(() => {
  syncScene(0);
  requestAnimationFrame(frame);
});
