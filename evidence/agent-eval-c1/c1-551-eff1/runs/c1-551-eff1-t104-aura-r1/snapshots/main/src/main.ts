import { camera, createAuraApp, environments, instances, lights, material, scene, type AuraTransformSpec } from "@aura3d/engine";

type Status = "playing" | "won" | "lost";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; height: number };
    __TASK_READY__?: boolean;
    __EVAL_READY__?: boolean;
  }
}

const SLAB_H = 0.5;
const SLAB_D = 3;
const BASE_W = 3;
const RANGE = 3.6;
const TOLERANCE = 0.12;
const WIN_HEIGHT = 25;
const CAP = 72;

interface Slab { x: number; w: number }
interface Debris { x: number; y: number; w: number; vx: number; vy: number; level: number; rot: number; vr: number }

const game = {
  status: "playing" as Status,
  score: 0,
  best: 0,
  tower: [{ x: 0, w: BASE_W }] as Slab[],
  cur: { x: -RANGE, w: BASE_W, dir: 1 },
  debris: [] as Debris[],
  flash: 0,
  message: ""
};

const height = (): number => game.tower.length - 1;
const speedFor = (level: number): number => 2.2 + Math.floor(level / 3) * 0.45;

function colorFor(level: number): string {
  const h = ((210 + level * 14) % 360) / 360;
  const s = 0.62, l = 0.56;
  const q = l + s - l * s, p = 2 * l - q;
  const ch = (t0: number): number => {
    let t = t0;
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const hex = (v: number): string => Math.round(v * 255).toString(16).padStart(2, "0");
  return `#${hex(ch(h + 1 / 3))}${hex(ch(h))}${hex(ch(h - 1 / 3))}`;
}

const HIDDEN: AuraTransformSpec = { position: [0, -200, 0], scale: [0.001, 0.001, 0.001] };
const boxAt = (x: number, level: number, w: number, rot = 0): AuraTransformSpec => ({
  position: [x, level * SLAB_H + SLAB_H / 2, 0],
  scale: [w, SLAB_H, SLAB_D],
  rotation: [0, 0, rot]
});

function buildInstances(): { transforms: AuraTransformSpec[]; colors: string[] } {
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  game.tower.forEach((s, i) => { transforms.push(boxAt(s.x, i, s.w)); colors.push(colorFor(i)); });
  if (game.status === "playing") {
    const lvl = game.tower.length;
    transforms.push(boxAt(game.cur.x, lvl, game.cur.w));
    colors.push(colorFor(lvl));
  }
  for (const d of game.debris) {
    transforms.push({ position: [d.x, d.y + SLAB_H / 2, 0], scale: [d.w, SLAB_H, SLAB_D], rotation: [0, 0, d.rot] });
    colors.push(colorFor(d.level));
  }
  while (transforms.length < CAP) { transforms.push(HIDDEN); colors.push("#000000"); }
  return { transforms: transforms.slice(0, CAP), colors: colors.slice(0, CAP) };
}

// DOM HUD (outside the canvas)
const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "display:flex;gap:24px;width:640px;box-sizing:border-box;padding:6px 10px;background:#111;font:14px system-ui,sans-serif;color:#fff";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Best: <b id="hud-best">0</b></span>' +
  '<span>Height: <b id="hud-height">0</b></span>' +
  '<span>Status: <b id="hud-status">playing</b></span>' +
  '<span id="hud-hint" style="margin-left:auto;opacity:.7">Space / click to drop, R to restart</span>';
document.body.appendChild(hud);
const elScore = document.getElementById("hud-score") as HTMLElement;
const elBest = document.getElementById("hud-best") as HTMLElement;
const elHeight = document.getElementById("hud-height") as HTMLElement;
const elStatus = document.getElementById("hud-status") as HTMLElement;

function publish(): void {
  game.best = Math.max(game.best, game.score);
  window.__TASK_STATE__ = { status: game.status, score: game.score, height: height() };
  elScore.textContent = String(game.score);
  elBest.textContent = String(game.best);
  elHeight.textContent = String(height());
  elStatus.textContent = game.status;
}

function spawnCurrent(): void {
  const level = game.tower.length;
  const top = game.tower[game.tower.length - 1]!;
  game.cur = { x: level % 2 === 0 ? -RANGE : RANGE, w: top.w, dir: level % 2 === 0 ? 1 : -1 };
}

function restart(): void {
  game.status = "playing";
  game.score = 0;
  game.tower = [{ x: 0, w: BASE_W }];
  game.debris = [];
  game.flash = 0;
  spawnCurrent();
  publish();
}

function drop(): void {
  if (game.status !== "playing") return;
  const top = game.tower[game.tower.length - 1]!;
  const level = game.tower.length;
  const cur = game.cur;
  const left = Math.max(cur.x - cur.w / 2, top.x - top.w / 2);
  const right = Math.min(cur.x + cur.w / 2, top.x + top.w / 2);
  const overlap = right - left;
  if (overlap <= 0) {
    game.status = "lost";
    game.debris.push({ x: cur.x, y: level * SLAB_H, w: cur.w, vx: cur.dir * 0.8, vy: 0, level, rot: 0, vr: -cur.dir * 0.8 });
    publish();
    return;
  }
  if (Math.abs(cur.x - top.x) <= TOLERANCE) {
    game.tower.push({ x: top.x, w: top.w });
    game.score += 2; // slab + perfect bonus
    game.flash = 1;
  } else {
    game.tower.push({ x: (left + right) / 2, w: overlap });
    game.score += 1;
    const cutW = cur.w - overlap;
    const curL = cur.x - cur.w / 2;
    const cutLeft = curL < left; // overhang on the left side
    const cutX = cutLeft ? curL + cutW / 2 : right + cutW / 2;
    const side = cutLeft ? -1 : 1;
    game.debris.push({ x: cutX, y: level * SLAB_H, w: cutW, vx: side * 1.2, vy: 0, level, rot: 0, vr: side * -1.5 });
  }
  if (height() >= WIN_HEIGHT) game.status = "won";
  else spawnCurrent();
  publish();
}

window.addEventListener("keydown", (e) => {
  if (e.code === "Space") {
    e.preventDefault();
    if (!e.repeat) drop();
  } else if (e.code === "KeyR") {
    restart();
  }
});

const init = buildInstances();
const app = createAuraApp("#app", {
  scene: scene({ background: "#141a2b" })
    .add(environments.neutral({ intensity: 0.7, background: false }))
    .add(lights.key({ position: [6, 14, 8], target: [0, 0, 0], intensity: 3, shadow: false }))
    .add(instances.box({
      name: "slabs",
      transforms: init.transforms,
      colors: init.colors,
      material: material.pbr({ color: "#ffffff", roughness: 0.55 })
    }).runtime({ id: "slabs", mutable: true }))
    .camera(camera.perspective({ position: [6, 5, 7], target: [0, 1, 0], fov: 40 }))
});

const canvas = document.getElementById("app") as HTMLCanvasElement;
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  if (game.status === "playing") drop();
  else restart();
});

let camY = 1;
let first = true;
let ready = false;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  if (game.status === "playing") {
    const c = game.cur;
    c.x += c.dir * speedFor(height()) * dt;
    if (c.x > RANGE) { c.x = RANGE; c.dir = -1; }
    if (c.x < -RANGE) { c.x = -RANGE; c.dir = 1; }
  }
  const floorY = -30;
  for (const d of game.debris) {
    d.vy -= 18 * dt;
    d.y += d.vy * dt;
    d.x += d.vx * dt;
    d.rot += d.vr * dt;
  }
  game.debris = game.debris.filter((d) => d.y > floorY + height() * SLAB_H * 0);

  const topY = game.tower.length * SLAB_H;
  const goal = Math.max(1.4, topY - 0.6);
  camY += (goal - camY) * Math.min(1, dt * 4);
  app.camera?.setPose({ position: [4.5, camY + 3.6, 9], target: [0, camY, 0], fov: 40 }, { cut: true });

  const b = buildInstances();
  app.nodes.require("slabs").setInstances(b.transforms, b.colors);

  if (first) {
    first = false;
    requestAnimationFrame(() => {
      ready = true;
      window.__TASK_READY__ = true;
      window.__EVAL_READY__ = true;
    });
  }
  void ready;
});

restart();
void app.ready();
