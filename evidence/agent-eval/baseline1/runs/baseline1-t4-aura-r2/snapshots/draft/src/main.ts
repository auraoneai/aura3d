import { camera, createAuraApp, game, lights, material, primitives, scene } from "@aura3d/engine";
import type { AuraApp, AuraRuntimeNodeHandle } from "@aura3d/engine";
import {
  ARENA_HALF_X,
  ARENA_HALF_Z,
  CoinDashSim,
  COIN_COUNT,
  FIXED_DT,
  type Status
} from "./sim";

declare global {
  interface Window {
    __EVAL__?: {
      state: () => { score: number; status: Status; time: number };
      step: (frames: number) => void;
    };
    __EVAL_READY__?: boolean;
  }
}

const sim = new CoinDashSim();

// ---------------------------------------------------------------- HUD (DOM)
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:16px;padding:6px 8px;font:600 14px/1.4 system-ui,sans-serif;";
hud.innerHTML =
  `<span>Score: <span id="score">0</span></span>` +
  `<span>Time: <span id="time">30.0</span></span>` +
  `<span>Status: <span id="status">playing</span></span>` +
  `<span style="opacity:.6;font-weight:400">WASD/arrows move · P pause · R restart</span>`;
document.body.append(hud);
const scoreEl = hud.querySelector<HTMLElement>("#score");
const timeEl = hud.querySelector<HTMLElement>("#time");
const statusEl = hud.querySelector<HTMLElement>("#status");

function renderHud(): void {
  if (scoreEl) scoreEl.textContent = String(sim.score);
  if (timeEl) timeEl.textContent = sim.remaining.toFixed(1);
  if (statusEl) statusEl.textContent = sim.status;
}

// ------------------------------------------------------------------ Input
const KEY_MAP: Record<string, keyof typeof sim.input> = {
  ArrowLeft: "left",
  KeyA: "left",
  ArrowRight: "right",
  KeyD: "right",
  ArrowUp: "up",
  KeyW: "up",
  ArrowDown: "down",
  KeyS: "down"
};

window.addEventListener("keydown", (event) => {
  const dir = KEY_MAP[event.code];
  if (dir) {
    sim.input[dir] = true;
    event.preventDefault();
    return;
  }
  if (event.repeat) return;
  if (event.code === "KeyP") {
    sim.togglePause();
    renderHud();
  } else if (event.code === "KeyR") {
    sim.reset();
    syncNodes();
    renderHud();
  }
});

window.addEventListener("keyup", (event) => {
  const dir = KEY_MAP[event.code];
  if (dir) sim.input[dir] = false;
});

window.addEventListener("blur", () => {
  sim.input.left = sim.input.right = sim.input.up = sim.input.down = false;
});

// -------------------------------------------------------------- Rendering
let playerNode: AuraRuntimeNodeHandle | undefined;
const coinNodes: AuraRuntimeNodeHandle[] = [];
let app: AuraApp | undefined;

function buildScene() {
  const s = scene({ background: "#0b1020" })
    .add(lights.ambient({ intensity: 0.6 }))
    .add(lights.directional({ position: [6, 14, 8], target: [0, 0, 0], intensity: 2.2 }))
    .add(
      primitives.plane({
        name: "arena floor",
        size: [ARENA_HALF_X * 2, 1, ARENA_HALF_Z * 2],
        position: [0, 0, 0],
        material: material.pbr({ color: "#24324f", roughness: 0.9 })
      })
    );

  const wall = (name: string, x: number, z: number, w: number, d: number) =>
    primitives.box({
      name,
      size: [w, 0.5, d],
      position: [x, 0.25, z],
      material: material.pbr({ color: "#5d7bb5", roughness: 0.6 })
    });
  s.add(wall("wall north", 0, -ARENA_HALF_Z - 0.15, ARENA_HALF_X * 2 + 0.6, 0.3));
  s.add(wall("wall south", 0, ARENA_HALF_Z + 0.15, ARENA_HALF_X * 2 + 0.6, 0.3));
  s.add(wall("wall west", -ARENA_HALF_X - 0.15, 0, 0.3, ARENA_HALF_Z * 2));
  s.add(wall("wall east", ARENA_HALF_X + 0.15, 0, 0.3, ARENA_HALF_Z * 2));

  s.add(
    primitives
      .sphere({
        name: "player",
        size: 1,
        position: [0, 0.5, 0],
        material: material.pbr({ color: "#3ec1ff", roughness: 0.35, metalness: 0.1 })
      })
      .runtime(game.runtimeNode("player", { tags: ["player"] }))
  );

  for (let i = 0; i < COIN_COUNT; i++) {
    const coin = sim.coins[i];
    s.add(
      primitives
        .cylinder({
          name: `coin ${i}`,
          size: [0.9, 0.14, 0.9],
          position: [coin?.x ?? 0, 0.6, coin?.z ?? 0],
          rotation: [Math.PI / 2, 0, 0],
          material: material.emissive({
            color: "#ffd54d",
            emissive: "#ffb300",
            emissiveIntensity: 1.5,
            roughness: 0.3
          })
        })
        .runtime(game.runtimeNode(`coin-${i}`, { tags: ["coin"] }))
    );
  }

  return s.camera(camera.perspective({ position: [0, 15, 7.5], target: [0, 0, 0.3], fov: 50 }));
}

function syncNodes(): void {
  playerNode?.setPosition(sim.player.x, 0.5, sim.player.z);
  const bob = Math.sin(sim.ticks * 0.08) * 0.08;
  for (let i = 0; i < coinNodes.length; i++) {
    const coin = sim.coins[i];
    if (coin) coinNodes[i]?.setPosition(coin.x, 0.6 + bob, coin.z);
  }
}

try {
  app = createAuraApp("#app", { scene: buildScene() });
  playerNode = app.nodes.require("player");
  for (let i = 0; i < COIN_COUNT; i++) coinNodes.push(app.nodes.require(`coin-${i}`));
} catch (error) {
  console.error("Aura3D render setup failed; simulation continues headless.", error);
}

// ------------------------------------------------- Fixed-step main loop
let accumulator = 0;
let lastTime: number | undefined;
let firstFrameDrawn = false;
let rendererReady = app === undefined;

void (app ? app.ready() : Promise.resolve())
  .catch(() => undefined)
  .then(() => {
    rendererReady = true;
  });

function frame(now: number): void {
  const elapsed = lastTime === undefined ? 0 : Math.min(0.25, (now - lastTime) / 1000);
  lastTime = now;

  if (sim.status === "playing") {
    accumulator += elapsed;
    while (accumulator >= FIXED_DT) {
      sim.step();
      accumulator -= FIXED_DT;
      if (sim.status !== "playing") {
        accumulator = 0;
        break;
      }
    }
  } else {
    accumulator = 0;
  }

  syncNodes();
  renderHud();

  if (!firstFrameDrawn && rendererReady) {
    firstFrameDrawn = true;
    window.__EVAL_READY__ = true;
  }
  requestAnimationFrame(frame);
}

window.__EVAL__ = {
  state: () => ({ score: sim.score, status: sim.status, time: sim.time }),
  step: (frames: number) => {
    const count = Math.max(0, Math.floor(frames));
    for (let i = 0; i < count; i++) sim.step();
    syncNodes();
    renderHud();
  }
};

renderHud();
requestAnimationFrame(frame);
