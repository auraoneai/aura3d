import { camera, createAuraApp, game, looks, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";

type Status = "playing" | "paused" | "won" | "lost";
type RoundStatus = "playing" | "won" | "lost";

const DT = 1 / 60;
const ROUND_FRAMES = 30 * 60;
const ROUND_SECONDS = 30;
const WIN_SCORE = 15;
const COIN_COUNT = 10;
const ARENA_HALF = 10;
const LIMIT = ARENA_HALF - 0.5;
const PLAYER_SPEED = 8;
const PLAYER_RADIUS = 0.5;
const COIN_RADIUS = 0.4;
const PICKUP_DIST = PLAYER_RADIUS + COIN_RADIUS;
const SEED = 20240611;

declare global {
  interface Window {
    __EVAL__?: { state: () => { score: number; status: Status; time: number }; step: (frames: number) => void };
    __EVAL_READY__?: boolean;
  }
}

// ---------- deterministic RNG ----------
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

// ---------- simulation state ----------
interface Vec2 { x: number; z: number }

let rng = mulberry32(SEED);
let px = 0;
let pz = 0;
let score = 0;
let frame = 0;
let roundStatus: RoundStatus = "playing";
let paused = false;
let coins: Vec2[] = [];

const held = new Set<string>();

function spawnCoin(avoid: readonly Vec2[]): Vec2 {
  let candidate: Vec2 = { x: 0, z: 0 };
  for (let attempt = 0; attempt < 50; attempt++) {
    candidate = {
      x: (rng() * 2 - 1) * (LIMIT - 0.5),
      z: (rng() * 2 - 1) * (LIMIT - 0.5)
    };
    const ok = avoid.every((p) => Math.hypot(p.x - candidate.x, p.z - candidate.z) > 2.2);
    if (ok) return candidate;
  }
  return candidate;
}

function resetRound(): void {
  rng = mulberry32(SEED);
  px = 0;
  pz = 0;
  score = 0;
  frame = 0;
  roundStatus = "playing";
  paused = false;
  coins = [];
  for (let i = 0; i < COIN_COUNT; i++) {
    coins.push(spawnCoin([{ x: 0, z: 0 }, ...coins]));
  }
}

function axis(neg: readonly string[], pos: readonly string[]): number {
  const n = neg.some((k) => held.has(k));
  const p = pos.some((k) => held.has(k));
  return (p ? 1 : 0) - (n ? 1 : 0);
}

function stepOnce(): void {
  if (paused || roundStatus !== "playing") return;
  frame++;
  let dx = axis(["arrowleft", "a"], ["arrowright", "d"]);
  let dz = axis(["arrowup", "w"], ["arrowdown", "s"]);
  if (dx !== 0 && dz !== 0) {
    dx *= Math.SQRT1_2;
    dz *= Math.SQRT1_2;
  }
  px = Math.max(-LIMIT, Math.min(LIMIT, px + dx * PLAYER_SPEED * DT));
  pz = Math.max(-LIMIT, Math.min(LIMIT, pz + dz * PLAYER_SPEED * DT));

  for (let i = 0; i < coins.length; i++) {
    const c = coins[i]!;
    if (Math.hypot(c.x - px, c.z - pz) <= PICKUP_DIST) {
      score++;
      const others = coins.filter((_, j) => j !== i);
      coins[i] = spawnCoin([{ x: px, z: pz }, ...others]);
    }
  }

  if (score >= WIN_SCORE) roundStatus = "won";
  else if (frame >= ROUND_FRAMES) roundStatus = "lost";
}

function currentStatus(): Status {
  return paused && roundStatus === "playing" ? "paused" : roundStatus;
}

function elapsed(): number {
  return frame / 60;
}

// ---------- HUD ----------
const scoreEl = document.createElement("div");
const timeEl = document.createElement("div");
const statusEl = document.createElement("div");
scoreEl.id = "score";
timeEl.id = "time";
statusEl.id = "status";
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 10px;font:14px system-ui,sans-serif;width:640px;box-sizing:border-box;";
const hint = document.createElement("div");
hint.style.cssText = "padding:0 10px;font:12px system-ui,sans-serif;opacity:.7;";
hint.textContent = "Move: arrows / WASD. P: pause. R: restart. Collect 15 coins in 30 s.";
hud.append(scoreEl, timeEl, statusEl);
document.body.append(hud, hint);

function updateHud(): void {
  scoreEl.textContent = String(score);
  timeEl.textContent = Math.max(0, ROUND_SECONDS - elapsed()).toFixed(1);
  statusEl.textContent = currentStatus();
}

// ---------- input ----------
function keyName(e: KeyboardEvent): string {
  if (e.code.startsWith("Key")) return e.code.slice(3).toLowerCase();
  if (e.code.startsWith("Arrow")) return e.code.toLowerCase();
  return e.key.length === 1 ? e.key.toLowerCase() : e.key.toLowerCase();
}

window.addEventListener("keydown", (e) => {
  const k = keyName(e);
  if (k === "p") {
    if (!e.repeat) paused = !paused;
    e.preventDefault();
  } else if (k === "r") {
    if (!e.repeat) resetRound();
    e.preventDefault();
  } else if (k.startsWith("arrow") || k === "a" || k === "d" || k === "w" || k === "s") {
    held.add(k);
    e.preventDefault();
  }
  updateHud();
});
window.addEventListener("keyup", (e) => {
  held.delete(keyName(e));
});
window.addEventListener("blur", () => held.clear());

// ---------- eval hooks ----------
resetRound();
updateHud();

window.__EVAL__ = {
  state: () => ({ score, status: currentStatus(), time: elapsed() }),
  step: (frames: number) => {
    const n = Math.max(0, Math.floor(Number(frames) || 0));
    for (let i = 0; i < n; i++) stepOnce();
    updateHud();
  }
};

// ---------- scene ----------
const coinIds = Array.from({ length: COIN_COUNT }, (_, i) => `coin-${i}`);

function buildScene() {
  const nodes = [
    primitives
      .plane({
        name: "arena floor",
        material: material.pbr({ color: "#2f4858", roughness: 0.85, metallic: 0 })
      })
      .position(0, 0, 0)
      .scale([ARENA_HALF * 2, 1, ARENA_HALF * 2]),
    primitives
      .sphere({
        name: "player",
        material: material.pbr({ color: "#4fb3ff", roughness: 0.35, metallic: 0.1 })
      })
      .position(0, PLAYER_RADIUS, 0)
      .scale(PLAYER_RADIUS * 2)
      .runtime(game.runtimeNode("player", { tags: ["player"] })),
    ...coinIds.map((id, i) =>
      primitives
        .cylinder({
          name: id,
          material: material.emissive({ color: "#ffd54d", emissive: "#ffd54d", emissiveIntensity: 1.5, roughness: 0.3 })
        })
        .position(coins[i]!.x, COIN_RADIUS, coins[i]!.z)
        .scale([COIN_RADIUS * 2, 0.12, COIN_RADIUS * 2])
        .rotation(Math.PI / 2, 0, 0)
        .runtime(game.runtimeNode(id, { tags: ["coin"] }))
    )
  ];
  return scene()
    .add(looks.preset("outdoor-day", { fogDensityScale: 0, exposureEv: -0.1 }))
    .addMany(nodes)
    .camera(camera.perspective({ position: [0, 17, 12], target: [0, 0, 0.5], fov: 45 }));
}

let app: AuraApp | undefined;
let playerNode: AuraRuntimeNodeHandle | undefined;
let coinNodes: AuraRuntimeNodeHandle[] = [];

try {
  app = createAuraApp("#app", {
    scene: buildScene(),
    resize: false,
    ...looks.appOptions("outdoor-day")
  });
  playerNode = app.nodes.require("player");
  coinNodes = coinIds.map((id) => app!.nodes.require(id));
} catch (err) {
  console.error("Aura3D mount failed", err);
}

function syncScene(): void {
  try {
    playerNode?.setPosition(px, PLAYER_RADIUS, pz);
    for (let i = 0; i < coinNodes.length; i++) {
      const c = coins[i]!;
      const bob = Math.sin(performance.now() / 300 + i) * 0.08;
      coinNodes[i]!.setPosition(c.x, COIN_RADIUS + 0.1 + bob, c.z);
    }
  } catch (err) {
    console.error(err);
  }
}

// ---------- main loop: fixed timestep accumulator ----------
let last = performance.now();
let acc = 0;
function loop(now: number): void {
  const dt = Math.min(0.25, Math.max(0, (now - last) / 1000));
  last = now;
  if (paused) {
    acc = 0;
  } else {
    acc += dt;
    while (acc >= DT) {
      stepOnce();
      acc -= DT;
    }
  }
  syncScene();
  updateHud();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

const markReady = (): void => {
  requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
};
if (app) {
  app.ready().catch(() => undefined).then(markReady);
} else {
  markReady();
}
