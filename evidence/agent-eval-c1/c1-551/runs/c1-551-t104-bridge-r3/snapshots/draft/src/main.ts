import { camera, createAuraApp, createFixedStepLoop, looks, material, primitives, scene } from "@aura3d/engine";
import { stageLights, stageModel } from "./three-bridge/stage.bridge";

// ---------------------------------------------------------------- constants
const LOOK_ID = "outdoor-day" as const;
const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const WIN_HEIGHT = 25;
const RANGE = 3.8; // slider centre travels between -RANGE and +RANGE
const PERFECT_TOL = 0.12;
const BASE_SPEED = 2.4;
const HOVER = 0.8; // moving slab hangs this far above its landing level
const GRAVITY = 20;
const DEBRIS_POOL = 12;

type Status = "playing" | "won" | "lost";
interface Level { x: number; w: number }
interface Debris { active: boolean; x: number; y: number; vx: number; vy: number; rz: number; vrz: number; w: number; age: number }

// ---------------------------------------------------------------- helpers
const hex = (n: number): string => Math.round(Math.max(0, Math.min(1, n)) * 255).toString(16).padStart(2, "0");
function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return `#${hex(f(0))}${hex(f(8))}${hex(f(4))}`;
}
const levelColor = (level: number): string => hsl((200 + level * 13) % 360, 0.62, 0.56);
const levelY = (level: number): number => SLAB_H * (level + 0.5);
const speedFor = (level: number): number => BASE_SPEED * (1 + 0.09 * Math.floor((level - 1) / 3));

// ---------------------------------------------------------------- scene
const slabMaterial = material.pbr({ color: "#4aa3ff", roughness: 0.45, metallic: 0.05 });
const world = scene()
  .add(looks.preset(LOOK_ID, { exposureEv: -0.6, fogDensityScale: 0.05 }))
  .add(stageModel({ castShadow: true, receiveShadow: true }).runtime({ id: "stage" }))
  .addMany(stageLights());
for (let i = 0; i <= WIN_HEIGHT; i += 1) {
  world.add(primitives.box({ name: `slab-${i}`, size: 1, material: slabMaterial, castShadow: true, receiveShadow: true }).runtime({ id: `slab-${i}`, mutable: true }));
}
for (let i = 0; i < DEBRIS_POOL; i += 1) {
  world.add(primitives.box({ name: `debris-${i}`, size: 1, material: slabMaterial, castShadow: true }).runtime({ id: `debris-${i}`, mutable: true }));
}
world.camera(camera.perspective({ position: [7, 5, 12], target: [0, 0, 0], fov: 40 }));

const app = createAuraApp("#app", { scene: world, ...looks.appOptions(LOOK_ID) });

// ---------------------------------------------------------------- HUD (DOM, outside the canvas)
const canvas = document.getElementById("app") as HTMLCanvasElement;
const hud = document.createElement("div");
hud.style.cssText = "width:640px;box-sizing:border-box;padding:8px 12px;display:flex;gap:18px;align-items:baseline;background:#11151f;color:#f2efe6;font:600 15px/1.3 ui-monospace,Menlo,monospace";
const scoreEl = document.createElement("span");
const bestEl = document.createElement("span");
const statusEl = document.createElement("span");
const noteEl = document.createElement("span");
noteEl.style.cssText = "margin-left:auto;color:#ffd166";
hud.append(scoreEl, bestEl, statusEl, noteEl);
const help = document.createElement("div");
help.style.cssText = "width:640px;box-sizing:border-box;padding:4px 12px;background:#0b0e15;color:#8e97ab;font:12px/1.3 ui-monospace,Menlo,monospace";
help.textContent = "Space/click: drop. Stack 25 to win. R or click after the end: restart.";
canvas.insertAdjacentElement("afterend", hud);
hud.insertAdjacentElement("afterend", help);

// ---------------------------------------------------------------- game state
const levels: Level[] = [];
const debris: Debris[] = Array.from({ length: DEBRIS_POOL }, () => ({ active: false, x: 0, y: 0, vx: 0, vy: 0, rz: 0, vrz: 0, w: 1, age: 0 }));
const dropOffset: number[] = new Array<number>(WIN_HEIGHT + 1).fill(0);
const game = {
  status: "playing" as Status,
  score: 0,
  height: 0,
  best: 0,
  slideX: -RANGE,
  dir: 1,
  camY: 0,
  clock: 0,
  noteUntil: 0,
  perfects: 0
};
let nextDebris = 0;
let pendingColors = new Map<string, string>();
let ready = false;
let frames = 0;
let hudKey = "";

type TaskState = { status: Status; score: number; height: number };
const w = window as unknown as { __TASK_STATE__?: TaskState; __TASK_READY__?: boolean; __EVAL_READY__?: boolean };
function publish(): void {
  w.__TASK_STATE__ = { status: game.status, score: game.score, height: game.height };
}

function setNote(text: string): void {
  noteEl.textContent = text;
  game.noteUntil = game.clock + 1.2;
}

function colorNode(id: string, color: string): void {
  pendingColors.set(id, color);
}

function spawnDebris(x: number, width: number, level: number, dir: number): void {
  const d = debris[nextDebris]!;
  nextDebris = (nextDebris + 1) % DEBRIS_POOL;
  Object.assign(d, { active: true, x, y: levelY(level) + dropOffset[level]!, vx: dir * 1.4, vy: 0.5, rz: 0, vrz: -dir * 2.5, w: width, age: 0 });
  colorNode(`debris-${debris.indexOf(d)}`, levelColor(level));
}

function reset(): void {
  levels.length = 0;
  levels.push({ x: 0, w: BASE_W });
  Object.assign(game, { status: "playing", score: 0, height: 0, slideX: -RANGE, dir: 1, perfects: 0, noteUntil: 0 });
  dropOffset.fill(0);
  debris.forEach((d) => { d.active = false; });
  colorNode("slab-0", levelColor(0));
  colorNode("slab-1", levelColor(1));
  noteEl.textContent = "";
  publish();
}

function drop(): void {
  if (game.status !== "playing") return;
  const level = game.height + 1;
  const top = levels[game.height]!;
  const x = game.slideX;
  const wd = top.w;
  const lo = Math.max(x - wd / 2, top.x - top.w / 2);
  const hi = Math.min(x + wd / 2, top.x + top.w / 2);
  const overlap = hi - lo;
  dropOffset[level] = HOVER;
  if (overlap <= 0) {
    // Miss: the whole slab falls away.
    levels[level] = { x, w: wd };
    spawnDebris(x, wd, level, x >= top.x ? 1 : -1);
    game.status = "lost";
    game.best = Math.max(game.best, game.score);
    setNote("Missed!");
    publish();
    return;
  }
  const perfect = Math.abs(x - top.x) <= PERFECT_TOL;
  if (perfect) {
    levels[level] = { x: top.x, w: top.w };
    game.score += 2; // slab + bonus
    game.perfects += 1;
    setNote("Perfect! +1 bonus");
  } else {
    const cx = (lo + hi) / 2;
    levels[level] = { x: cx, w: overlap };
    const side = x > top.x ? 1 : -1;
    const cutW = wd - overlap;
    const cutX = side > 0 ? hi + cutW / 2 : lo - cutW / 2;
    spawnDebris(cutX, cutW, level, side);
    game.score += 1;
  }
  game.height += 1;
  game.best = Math.max(game.best, game.score);
  if (game.height >= WIN_HEIGHT) {
    game.status = "won";
    setNote("Tower complete!");
  } else {
    colorNode(`slab-${game.height + 1}`, levelColor(game.height + 1));
  }
  publish();
}

// ---------------------------------------------------------------- input
window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR" && !e.repeat) {
    reset();
  }
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (game.status === "playing") drop();
  else reset();
});

// ---------------------------------------------------------------- simulation
function step(dt: number): void {
  game.clock += dt;
  if (game.status === "playing") {
    const speed = speedFor(game.height + 1);
    game.slideX += game.dir * speed * dt;
    if (game.slideX > RANGE) { game.slideX = 2 * RANGE - game.slideX; game.dir = -1; }
    else if (game.slideX < -RANGE) { game.slideX = -2 * RANGE - game.slideX; game.dir = 1; }
  }
  for (let i = 0; i < dropOffset.length; i += 1) {
    if (dropOffset[i]! > 0) dropOffset[i] = Math.max(0, dropOffset[i]! - 9 * dt);
  }
  for (const d of debris) {
    if (!d.active) continue;
    d.age += dt;
    d.vy -= GRAVITY * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rz += d.vrz * dt;
    if (d.age > 3) d.active = false;
  }
  const topY = levelY(game.height) + (game.status === "playing" ? SLAB_H : 0);
  const goal = Math.max(0, topY - 1.4);
  game.camY += (goal - game.camY) * Math.min(1, dt * 3.5);
}

// ---------------------------------------------------------------- render
function render(): void {
  if (!ready) return;
  for (const [id, color] of pendingColors) app.nodes.require(id).setColor?.(color);
  pendingColors = new Map();

  for (let i = 0; i <= WIN_HEIGHT; i += 1) {
    const node = app.nodes.require(`slab-${i}`);
    const placed = i <= game.height;
    const moving = game.status === "playing" && i === game.height + 1;
    if (placed) {
      const l = levels[i]!;
      node.setVisible(true).setScale([l.w, SLAB_H, SLAB_D]).setPosition(l.x, levelY(i) + dropOffset[i]!, 0);
    } else if (moving) {
      node.setVisible(true).setScale([levels[game.height]!.w, SLAB_H, SLAB_D]).setPosition(game.slideX, levelY(i) + HOVER, 0);
    } else {
      node.setVisible(false);
    }
  }
  debris.forEach((d, i) => {
    const node = app.nodes.require(`debris-${i}`);
    if (!d.active) { node.setVisible(false); return; }
    node.setVisible(true).setScale([d.w, SLAB_H, SLAB_D]).setPosition(d.x, d.y, 0).setRotation(0, 0, d.rz);
  });

  const camY = game.camY;
  app.camera?.setPose({ position: [7, camY + 3.4, 12.5], target: [0, camY + 0.6, 0], fov: 40 });

  if (game.clock > game.noteUntil && game.status === "playing") noteEl.textContent = "";
  const label = game.status === "won" ? "WON" : game.status === "lost" ? "LOST" : "PLAYING";
  const key = `${game.score}|${game.best}|${label}`;
  if (key !== hudKey) {
    hudKey = key;
    scoreEl.textContent = `Score ${game.score}`;
    bestEl.textContent = `Best ${game.best}`;
    statusEl.textContent = `Status ${label}`;
  }
  frames += 1;
  if (frames === 2) {
    w.__TASK_READY__ = true;
    w.__EVAL_READY__ = true;
  }
}

reset();
createFixedStepLoop({ stepSeconds: 1 / 60, step, render }).start();

void app.ready().then(() => {
  ready = true;
}).catch((error: unknown) => {
  document.body.dataset.aura3dError = error instanceof Error ? error.message : String(error);
});
