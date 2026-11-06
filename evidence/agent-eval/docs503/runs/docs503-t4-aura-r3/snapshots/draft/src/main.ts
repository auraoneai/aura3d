import { camera, createAuraApp, environments, lights, material, primitives, scene } from "@aura3d/engine";
import { ARENA_HALF, COIN_COUNT, FIXED_DT, ROUND_SECONDS, createSim } from "./sim";

const sim = createSim();

// ---- DOM HUD (outside the canvas) ----
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;padding:6px 8px;font:14px/1.4 system-ui,sans-serif;color:#fff;";
function hudItem(label: string, id: string): HTMLSpanElement {
  const wrap = document.createElement("div");
  wrap.append(`${label}: `);
  const value = document.createElement("span");
  value.id = id;
  wrap.append(value);
  hud.append(wrap);
  return value;
}
const scoreEl = hudItem("Score", "score");
const timeEl = hudItem("Time", "time");
const statusEl = hudItem("Status", "status");
const help = document.createElement("div");
help.style.cssText = "padding:0 8px;opacity:.7";
help.textContent = "Arrows/WASD move, P pause, R restart. Collect 15 coins in 30 s.";
document.body.append(hud, help);

function updateHud(): void {
  const s = sim.state();
  scoreEl.textContent = String(s.score);
  timeEl.textContent = Math.max(0, ROUND_SECONDS - s.time).toFixed(1);
  statusEl.textContent = s.status;
}

// ---- Scene ----
const wallMat = material.pbr({ color: "#4b5567", roughness: 0.8 });
const H = ARENA_HALF;
let sceneBuilder = scene({ background: "#141a26" })
  .add(environments.neutral({ intensity: 0.9, background: false }))
  .add(lights.directional({ name: "key", position: [5, 12, 6], target: [0, 0, 0], intensity: 2.6, shadow: true }))
  .add(lights.directional({ name: "fill", position: [-6, 5, -3], target: [0, 0, 0], intensity: 0.8, color: "#9db8ff" }))
  .camera(camera.perspective({ position: [0, 17, 11], target: [0, 0, 0.5], fov: 45 }))
  .add(primitives.plane({ name: "floor", size: [H * 2, 1, H * 2], material: material.pbr({ color: "#2e3a4f", roughness: 0.9 }) }))
  .add(primitives.box({ name: "wall-n", size: [H * 2 + 0.6, 0.6, 0.3], position: [0, 0.3, -H - 0.15], material: wallMat }))
  .add(primitives.box({ name: "wall-s", size: [H * 2 + 0.6, 0.6, 0.3], position: [0, 0.3, H + 0.15], material: wallMat }))
  .add(primitives.box({ name: "wall-w", size: [0.3, 0.6, H * 2], position: [-H - 0.15, 0.3, 0], material: wallMat }))
  .add(primitives.box({ name: "wall-e", size: [0.3, 0.6, H * 2], position: [H + 0.15, 0.3, 0], material: wallMat }))
  .add(
    primitives
      .sphere({ name: "player", size: 1, material: material.pbr({ color: "#4fc3ff", metallic: 0.2, roughness: 0.35 }) })
      .runtime({ id: "player", mutable: true })
  );
for (let i = 0; i < COIN_COUNT; i += 1) {
  sceneBuilder = sceneBuilder.add(
    primitives
      .cylinder({ name: `coin-${i}`, size: [0.8, 0.12, 0.8], material: material.pbr({ color: "#ffd23f", metallic: 0.6, roughness: 0.3 }), castShadow: false })
      .runtime({ id: `coin-${i}`, mutable: true })
  );
}

const app = createAuraApp("#app", { scene: sceneBuilder, resize: false });

function present(wallSeconds: number): void {
  app.nodes.require("player").setPosition(sim.player.x, 0.5, sim.player.z);
  for (let i = 0; i < COIN_COUNT; i += 1) {
    const c = sim.coins[i];
    if (!c) continue;
    const node = app.nodes.require(`coin-${i}`);
    node.setPosition(c.x, 0.55, c.z);
    node.setRotation(wallSeconds * 2 + i, 0, 0);
  }
}

// ---- Input ----
const KEYMAP: Record<string, keyof typeof sim.input> = {
  ArrowLeft: "left", KeyA: "left", a: "left",
  ArrowRight: "right", KeyD: "right", d: "right",
  ArrowUp: "up", KeyW: "up", w: "up",
  ArrowDown: "down", KeyS: "down", s: "down"
};
function dirFor(e: KeyboardEvent): keyof typeof sim.input | undefined {
  return KEYMAP[e.code] ?? KEYMAP[e.key] ?? KEYMAP[e.key.toLowerCase()];
}
function isKey(e: KeyboardEvent, code: string, key: string): boolean {
  return e.code === code || e.key.toLowerCase() === key;
}
window.addEventListener("keydown", (e) => {
  const dir = dirFor(e);
  if (dir) {
    sim.input[dir] = true;
    e.preventDefault();
    return;
  }
  if (e.repeat) return;
  if (isKey(e, "KeyP", "p")) {
    sim.togglePause();
    updateHud();
  } else if (isKey(e, "KeyR", "r")) {
    sim.reset();
    updateHud();
  }
});
window.addEventListener("keyup", (e) => {
  const dir = dirFor(e);
  if (dir) sim.input[dir] = false;
});
window.addEventListener("blur", () => {
  sim.input.left = sim.input.right = sim.input.up = sim.input.down = false;
});

// ---- Eval hooks ----
declare global {
  interface Window {
    __EVAL__?: { state: () => ReturnType<typeof sim.state>; step: (frames: number) => void };
    __EVAL_READY__?: boolean;
  }
}
window.__EVAL__ = {
  state: () => sim.state(),
  step: (frames: number) => {
    sim.step(frames);
    updateHud();
  }
};

// ---- Frame loop: fixed 1/60 s steps from an accumulator ----
let last = 0;
let accumulator = 0;
let firstFrame = true;
function frame(now: number): void {
  const elapsed = last === 0 ? 0 : Math.min((now - last) / 1000, 0.1);
  last = now;
  if (sim.isRunning()) {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      sim.step(1);
      accumulator -= FIXED_DT;
    }
  } else {
    accumulator = 0;
  }
  present(now / 1000);
  updateHud();
  if (firstFrame) {
    firstFrame = false;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

updateHud();
await app.ready();
requestAnimationFrame(frame);
