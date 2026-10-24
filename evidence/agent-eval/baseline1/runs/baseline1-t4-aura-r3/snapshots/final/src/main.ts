import { camera, createAuraApp, lights, material, primitives, scene } from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Pure, deterministic simulation (no DOM, no Math.random, no wall clock)
// ---------------------------------------------------------------------------

type Status = "playing" | "paused" | "won" | "lost";

const DT = 1 / 60; // fixed timestep
const ROUND_FRAMES = 30 * 60; // 30 s round
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const HALF_W = 9; // arena half extents (x / z)
const HALF_H = 5.5;
const PLAYER_RADIUS = 0.5;
const COIN_RADIUS = 0.35;
const PLAYER_SPEED = 7; // units / second
const SEED = 20240607;

interface Vec2 {
  x: number;
  z: number;
}

/** mulberry32: small seeded PRNG, fully deterministic. */
function createRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Sim {
  rng: () => number;
  frames: number;
  score: number;
  finished: "won" | "lost" | null;
  paused: boolean;
  player: Vec2;
  coins: Vec2[];
}

function spawnCoin(sim: Sim, ignoreIndex: number): Vec2 {
  let best: Vec2 = { x: 0, z: 0 };
  for (let attempt = 0; attempt < 30; attempt++) {
    const candidate: Vec2 = {
      x: (sim.rng() * 2 - 1) * (HALF_W - 0.8),
      z: (sim.rng() * 2 - 1) * (HALF_H - 0.8)
    };
    best = candidate;
    if (Math.hypot(candidate.x - sim.player.x, candidate.z - sim.player.z) < 2.2) continue;
    let clear = true;
    for (let i = 0; i < sim.coins.length; i++) {
      if (i === ignoreIndex) continue;
      const other = sim.coins[i];
      if (other && Math.hypot(candidate.x - other.x, candidate.z - other.z) < 1.4) {
        clear = false;
        break;
      }
    }
    if (clear) return candidate;
  }
  return best;
}

function createSim(): Sim {
  const sim: Sim = {
    rng: createRng(SEED),
    frames: 0,
    score: 0,
    finished: null,
    paused: false,
    player: { x: 0, z: 0 },
    coins: []
  };
  for (let i = 0; i < COIN_COUNT; i++) {
    sim.coins.push(spawnCoin(sim, -1));
  }
  return sim;
}

const keys = new Set<string>();

function axis(negative: readonly string[], positive: readonly string[]): number {
  const n = negative.some((k) => keys.has(k)) ? 1 : 0;
  const p = positive.some((k) => keys.has(k)) ? 1 : 0;
  return p - n;
}

function advance(sim: Sim): void {
  if (sim.paused || sim.finished) return;
  sim.frames += 1;

  let dx = axis(["arrowleft", "a"], ["arrowright", "d"]);
  let dz = axis(["arrowup", "w"], ["arrowdown", "s"]);
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  sim.player.x = Math.max(-HALF_W + PLAYER_RADIUS, Math.min(HALF_W - PLAYER_RADIUS, sim.player.x + dx * PLAYER_SPEED * DT));
  sim.player.z = Math.max(-HALF_H + PLAYER_RADIUS, Math.min(HALF_H - PLAYER_RADIUS, sim.player.z + dz * PLAYER_SPEED * DT));

  const reach = PLAYER_RADIUS + COIN_RADIUS;
  for (let i = 0; i < sim.coins.length; i++) {
    const coin = sim.coins[i];
    if (!coin) continue;
    if (Math.hypot(coin.x - sim.player.x, coin.z - sim.player.z) <= reach) {
      sim.score += 1;
      sim.coins[i] = spawnCoin(sim, i);
    }
  }

  // Win has priority: reaching the target score within the round wins at once.
  if (sim.score >= WIN_SCORE) {
    sim.finished = "won";
  } else if (sim.frames >= ROUND_FRAMES) {
    sim.finished = "lost";
  }
}

function statusOf(sim: Sim): Status {
  if (sim.finished) return sim.finished;
  return sim.paused ? "paused" : "playing";
}

// ---------------------------------------------------------------------------
// Scene (Aura3D renders into the existing <canvas id="app">)
// ---------------------------------------------------------------------------

let sim = createSim();

const coinMaterial = material.emissive({ color: "#ffcc33", emissive: "#ffb300", emissiveIntensity: 1.5, roughness: 0.3, metalness: 0.6 });

const arena = scene()
  .background("#0e131a")
  .add(lights.studio())
  .add(
    primitives
      .plane({ name: "arena floor", material: material.pbr({ color: "#2b3a4a", roughness: 0.85, metalness: 0.05 }) })
      .position(0, 0, 0)
      .scale([HALF_W * 2, 1, HALF_H * 2])
  )
  .add(
    primitives
      .box({ name: "wall north", material: material.pbr({ color: "#566b82", roughness: 0.6 }) })
      .position(0, 0.25, -HALF_H - 0.15)
      .scale([HALF_W * 2 + 0.6, 0.5, 0.3])
  )
  .add(
    primitives
      .box({ name: "wall south", material: material.pbr({ color: "#566b82", roughness: 0.6 }) })
      .position(0, 0.25, HALF_H + 0.15)
      .scale([HALF_W * 2 + 0.6, 0.5, 0.3])
  )
  .add(
    primitives
      .box({ name: "wall west", material: material.pbr({ color: "#566b82", roughness: 0.6 }) })
      .position(-HALF_W - 0.15, 0.25, 0)
      .scale([0.3, 0.5, HALF_H * 2])
  )
  .add(
    primitives
      .box({ name: "wall east", material: material.pbr({ color: "#566b82", roughness: 0.6 }) })
      .position(HALF_W + 0.15, 0.25, 0)
      .scale([0.3, 0.5, HALF_H * 2])
  )
  .add(
    primitives
      .sphere({ name: "player", material: material.pbr({ color: "#3ec5ff", roughness: 0.35, metalness: 0.2, emissive: "#0a4a66", emissiveIntensity: 0.6 }) })
      .position(0, PLAYER_RADIUS, 0)
      .scale(PLAYER_RADIUS * 2)
      .runtime({ id: "player", tags: ["player"] })
  );

for (let i = 0; i < COIN_COUNT; i++) {
  const coin = sim.coins[i] ?? { x: 0, z: 0 };
  arena.add(
    primitives
      .cylinder({ name: `coin ${i}`, material: coinMaterial })
      .position(coin.x, 0.45, coin.z)
      .scale([COIN_RADIUS * 2, 0.12, COIN_RADIUS * 2])
      .runtime({ id: `coin-${i}`, tags: ["coin"] })
  );
}

arena.camera(camera.perspective({ position: [0, 14, 10.5], target: [0, 0, 0.3], fov: 45 }));

const canvasEl = document.getElementById("app");
const app = createAuraApp(canvasEl instanceof HTMLCanvasElement ? canvasEl : "#app", {
  scene: arena,
  resize: false,
  pixelRatio: 1
});

const playerNode = app.nodes.require("player");
const coinNodes = Array.from({ length: COIN_COUNT }, (_, i) => app.nodes.require(`coin-${i}`));

// ---------------------------------------------------------------------------
// HUD (DOM, outside the canvas)
// ---------------------------------------------------------------------------

const hud = document.createElement("div");
hud.style.cssText = "display:flex;gap:24px;padding:6px 8px;font:600 14px/1.3 system-ui,sans-serif;width:624px";
hud.innerHTML =
  '<span>Score: <span id="score">0</span></span>' +
  '<span>Time: <span id="time">30.0</span></span>' +
  '<span>Status: <span id="status">playing</span></span>' +
  '<span style="margin-left:auto;font-weight:400;opacity:.7">Move: arrows/WASD · P pause · R restart</span>';
document.body.append(hud);

const scoreEl = document.getElementById("score") as HTMLElement;
const timeEl = document.getElementById("time") as HTMLElement;
const statusEl = document.getElementById("status") as HTMLElement;

function snapshot(): { score: number; status: Status; time: number } {
  return { score: sim.score, status: statusOf(sim), time: sim.frames * DT };
}

function renderHud(): void {
  const s = snapshot();
  const remaining = Math.max(0, ROUND_FRAMES * DT - s.time);
  scoreEl.textContent = String(s.score);
  timeEl.textContent = remaining.toFixed(1);
  statusEl.textContent = s.status;
}

function syncNodes(timeSeconds: number): void {
  playerNode.setPosition(sim.player.x, PLAYER_RADIUS, sim.player.z);
  for (let i = 0; i < coinNodes.length; i++) {
    const coin = sim.coins[i];
    const node = coinNodes[i];
    if (!coin || !node) continue;
    node.setPosition(coin.x, 0.45 + Math.sin(timeSeconds * 3 + i) * 0.06, coin.z);
  }
}

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const MOVE_KEYS = new Set(["arrowleft", "arrowright", "arrowup", "arrowdown", "a", "d", "w", "s"]);

function keyName(event: KeyboardEvent): string {
  const code = event.code;
  if (code.startsWith("Arrow")) return code.toLowerCase();
  if (code.startsWith("Key") && code.length === 4) return code.slice(3).toLowerCase();
  return (event.key || "").toLowerCase();
}

window.addEventListener("keydown", (event) => {
  const name = keyName(event);
  if (MOVE_KEYS.has(name)) {
    keys.add(name);
    event.preventDefault();
  } else if (name === "p") {
    if (!event.repeat && !sim.finished) sim.paused = !sim.paused;
  } else if (name === "r") {
    if (!event.repeat) {
      sim = createSim();
    }
  }
  renderHud();
});

window.addEventListener("keyup", (event) => {
  keys.delete(keyName(event));
});

window.addEventListener("blur", () => keys.clear());

// ---------------------------------------------------------------------------
// Fixed-timestep accumulator driven by the engine's requestAnimationFrame loop
// ---------------------------------------------------------------------------

let accumulator = 0;
let renderTime = 0;

app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), 0.25); // clamp tab-switch spikes
  renderTime += dt;
  accumulator += dt;
  while (accumulator >= DT) {
    advance(sim);
    accumulator -= DT;
  }
  syncNodes(renderTime);
  renderHud();
});

// ---------------------------------------------------------------------------
// Evaluation hooks
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __EVAL__?: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__?: boolean;
  }
}

window.__EVAL__ = {
  state: snapshot,
  step(frames: number): void {
    const count = Math.max(0, Math.floor(Number(frames) || 0));
    for (let i = 0; i < count; i++) advance(sim);
    syncNodes(renderTime);
    renderHud();
  }
};

renderHud();

void app.ready().catch(() => undefined).then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
