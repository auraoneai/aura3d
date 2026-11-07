import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
interface TaskState { status: Status; score: number; speed: number; airborne: boolean }

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

// ---------- constants ----------
const GOAL = 500;
const GRAVITY = 26;
const JUMP_V = 9;
const BASE_SPEED = 8;
const SPEED_GAIN = 0.02; // m/s per meter
const FIRST_HURDLE = 30;
const HURDLE_POOL = 16;
const HURDLE_RANGE = 110;
const SPAWN_AHEAD = 100;
const TREES_PER_SIDE = 16;
const TREE_SPACING = 10;
const DASHES = 24;
const DASH_SPACING = 6;
const SEED = (() => {
  const v = Number(new URLSearchParams(location.search).get("seed"));
  return Number.isFinite(v) && v !== 0 ? v >>> 0 : 20240607;
})();

// ---------- seeded random ----------
const makeRng = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

// ---------- scene ----------
const SKY = "#a9c9e6";
let sc = scene({ background: SKY })
  .camera(camera.perspective({ position: [0, 3.4, 7.5], target: [0, 1, -8], fov: 55, near: 0.3, far: 240 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#dbe9f7", groundColor: "#5d6b45", intensity: 1.0 }))
  .add(lights.directional({ position: [12, 22, 10], target: [0, 0, -4], intensity: 2.6, shadow: true }))
  .add(effects.fog({ color: SKY, density: 0.02 }))
  .add(primitives.plane({ name: "ground", size: [320, 1, 420], material: material.pbr({ color: "#5e7a3e", roughness: 1 }), castShadow: false }).position(0, 0, -150))
  .add(primitives.plane({ name: "track", size: [8, 1, 420], material: material.pbr({ color: "#4a4d57", roughness: 0.9 }), castShadow: false }).position(0, 0.02, -150))
  .add(primitives.box({ name: "edge-l", size: [0.25, 0.04, 420], material: material.pbr({ color: "#f2f2f2", roughness: 0.8 }), castShadow: false }).position(-4, 0.04, -150))
  .add(primitives.box({ name: "edge-r", size: [0.25, 0.04, 420], material: material.pbr({ color: "#f2f2f2", roughness: 0.8 }), castShadow: false }).position(4, 0.04, -150));

// Scrolling scenery: dashes down the middle and trees on both sides.
const dashMat = material.pbr({ color: "#ffe9a0", roughness: 0.8 });
for (let i = 0; i < DASHES; i += 1) {
  sc = sc.add(primitives.box({ name: `dash${i}`, size: [0.3, 0.04, 2.4], material: dashMat, castShadow: false }).position(0, 0.05, -100).runtime({ id: `dash${i}`, mutable: true }));
}
const trunkMat = material.pbr({ color: "#5a3d24", roughness: 1 });
const leafMat = material.pbr({ color: "#2f7d32", roughness: 0.9 });
for (let side = 0; side < 2; side += 1) {
  for (let i = 0; i < TREES_PER_SIDE; i += 1) {
    const id = `tree${side}-${i}`;
    sc = sc.add(
      group(id, [
        primitives.cylinder({ name: `${id}-trunk`, size: [0.5, 2, 0.5], material: trunkMat }).position(0, 1, 0),
        primitives.cone({ name: `${id}-leaf`, size: [2.4, 4.2, 2.4], material: leafMat }).position(0, 3.6, 0)
      ], { position: [0, 0, -100] }).runtime({ id, mutable: true })
    );
  }
}

// Hurdle pool (unit boxes scaled per hurdle).
const hurdleMat = material.pbr({ color: "#e8344a", roughness: 0.5 });
for (let i = 0; i < HURDLE_POOL; i += 1) {
  sc = sc.add(primitives.box({ name: `hurdle${i}`, size: [1, 1, 1], material: hurdleMat }).position(0, -50, 0).runtime({ id: `hurdle${i}`, mutable: true }));
}

// Runner built from joints.
const skin = material.pbr({ color: "#f1c27d", roughness: 0.7 });
const shirt = material.pbr({ color: "#ff7a1a", roughness: 0.6 });
const pants = material.pbr({ color: "#23366b", roughness: 0.7 });
const J = (id: string, position: [number, number, number], kids: Parameters<typeof group>[1]) =>
  group(id, kids, { position }).runtime({ id, mutable: true });
sc = sc.add(
  J("runner", [0, 0, 0], [
    primitives.box({ name: "torso", size: [0.55, 0.7, 0.3], material: shirt }).position(0, 1.2, 0),
    primitives.sphere({ name: "head", size: 0.42, material: skin }).position(0, 1.78, 0),
    primitives.box({ name: "visor", size: [0.34, 0.1, 0.1], material: pants }).position(0, 1.82, -0.2),
    J("l-leg", [-0.15, 0.85, 0], [primitives.box({ name: "l-leg-m", size: [0.22, 0.85, 0.24], material: pants }).position(0, -0.42, 0)]),
    J("r-leg", [0.15, 0.85, 0], [primitives.box({ name: "r-leg-m", size: [0.22, 0.85, 0.24], material: pants }).position(0, -0.42, 0)]),
    J("l-arm", [-0.38, 1.5, 0], [primitives.box({ name: "l-arm-m", size: [0.16, 0.6, 0.16], material: skin }).position(0, -0.28, 0)]),
    J("r-arm", [0.38, 1.5, 0], [primitives.box({ name: "r-arm-m", size: [0.16, 0.6, 0.16], material: skin }).position(0, -0.28, 0)])
  ])
);

const app = createAuraApp("#app", { scene: sc });

// ---------- DOM HUD (outside the canvas) ----------
const canvas = document.querySelector<HTMLCanvasElement>("#app");
const hud = document.createElement("div");
hud.style.cssText = "width:640px;box-sizing:border-box;padding:6px 10px;display:flex;justify-content:space-between;background:#111;color:#fff;font:14px system-ui,sans-serif";
const elDist = document.createElement("span");
const elBest = document.createElement("span");
const elStatus = document.createElement("span");
hud.append(elDist, elBest, elStatus);
canvas?.insertAdjacentElement("afterend", hud);

const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,0.45);color:#fff;font:bold 28px system-ui,sans-serif;text-align:center;pointer-events:none";
document.body.append(overlay);

// ---------- game state ----------
let status: Status = "ready";
let dist = 0;
let best = 0;
let speed = BASE_SPEED;
let ry = 0;
let vy = 0;
let phase = 0;
let rng = makeRng(SEED);
interface Hurdle { d: number; h: number }
let hurdles: Hurdle[] = [];
let nextD = FIRST_HURDLE;
let firstIdx = 0;

const speedAt = (d: number): number => BASE_SPEED + SPEED_GAIN * d;

const reset = (): void => {
  status = "ready";
  dist = 0;
  speed = speedAt(0);
  ry = 0;
  vy = 0;
  phase = 0;
  rng = makeRng(SEED);
  hurdles = [];
  nextD = FIRST_HURDLE;
  firstIdx = 0;
  spawn();
};

function spawn(): void {
  while (nextD < dist + SPAWN_AHEAD) {
    const h = 0.4 + Math.round(rng() * 6) * 0.1; // 0.4 .. 1.0
    hurdles.push({ d: nextD, h });
    nextD += speedAt(nextD) * (1.0 + rng() * 1.3) + 5;
  }
}

const tryJump = (): void => {
  if (ry <= 0 && vy === 0) vy = JUMP_V;
};

const jumpInput = (): void => {
  if (status === "ready") {
    status = "playing";
    tryJump();
  } else if (status === "playing") {
    tryJump();
  } else {
    reset();
    status = "playing";
    tryJump();
  }
};

window.addEventListener("keydown", (e) => {
  if (e.code === "Space" || e.code === "ArrowUp" || e.code === "KeyW") {
    e.preventDefault();
    if (!e.repeat) jumpInput();
  } else if (e.code === "KeyR") {
    if (!e.repeat) reset();
  }
});
window.addEventListener("pointerdown", () => jumpInput());

// ---------- simulation ----------
const step = (dt: number): void => {
  if (status !== "playing") return;
  speed = speedAt(dist);
  dist += speed * dt;
  vy -= GRAVITY * dt;
  ry += vy * dt;
  if (ry <= 0) {
    ry = 0;
    vy = 0;
  }
  phase += dt * speed * 1.1;
  spawn();
  for (let i = firstIdx; i < hurdles.length; i += 1) {
    const hd = hurdles[i]!;
    if (Math.abs(hd.d - dist) < 0.5 && ry < hd.h - 0.05) {
      status = "lost";
      return;
    }
  }
  if (dist >= GOAL) {
    dist = GOAL;
    status = "won";
  }
};

// ---------- rendering ----------
const mod = (a: number, n: number): number => ((a % n) + n) % n;
const node = (id: string) => app.nodes.require(id);

const render = (): void => {
  node("runner").setPosition(0, ry, 0);
  const air = ry > 0;
  const swing = status === "playing" && !air ? Math.sin(phase) * 0.9 : 0;
  const tuck = air ? 0.7 : 0;
  node("l-leg").setRotation(swing - tuck, 0, 0);
  node("r-leg").setRotation(-swing + (air ? 0.2 : 0), 0, 0);
  node("l-arm").setRotation(-swing * 0.8 - (air ? 1.2 : 0), 0, 0);
  node("r-arm").setRotation(swing * 0.8 - (air ? 1.2 : 0), 0, 0);

  const dashL = DASHES * DASH_SPACING;
  for (let i = 0; i < DASHES; i += 1) {
    node(`dash${i}`).setPosition(0, 0.05, 8 - mod(i * DASH_SPACING - dist, dashL));
  }
  const treeL = TREES_PER_SIDE * TREE_SPACING;
  for (let side = 0; side < 2; side += 1) {
    for (let i = 0; i < TREES_PER_SIDE; i += 1) {
      const z = 8 - mod(i * TREE_SPACING - dist + side * 5, treeL);
      node(`tree${side}-${i}`).setPosition(side === 0 ? -6.5 : 6.5, 0, z);
    }
  }

  const used = new Set<number>();
  for (let i = firstIdx; i < hurdles.length; i += 1) {
    const hd = hurdles[i]!;
    const z = dist - hd.d;
    if (z < -HURDLE_RANGE) break;
    if (z > 12) {
      if (i === firstIdx) firstIdx += 1;
      continue;
    }
    const slot = i % HURDLE_POOL;
    used.add(slot);
    const n = node(`hurdle${slot}`);
    n.setScale([2.8, hd.h, 0.4]);
    n.setPosition(0, hd.h / 2, z);
  }
  for (let s = 0; s < HURDLE_POOL; s += 1) {
    if (!used.has(s)) node(`hurdle${s}`).setPosition(0, -50, 0);
  }
};

const updateDom = (): void => {
  if (dist > best) best = dist;
  elDist.textContent = `Distance: ${Math.floor(dist)} m`;
  elBest.textContent = `Best: ${Math.floor(best)} m`;
  elStatus.textContent = `Status: ${status}`;
  let html = "";
  if (status === "ready") html = "RUNNER<br><span style=\"font-size:16px\">Space / W / ↑ / click to jump and start</span>";
  else if (status === "lost") html = `GAME OVER<br><span style="font-size:18px">${Math.floor(dist)} m</span><br><span style="font-size:16px">Press R, jump or click to restart</span>`;
  else if (status === "won") html = `YOU WIN!<br><span style="font-size:18px">${GOAL} m reached</span><br><span style="font-size:16px">Press R, jump or click to restart</span>`;
  if (overlay.innerHTML !== html) overlay.innerHTML = html;
  overlay.style.display = html === "" ? "none" : "flex";
  window.__TASK_STATE__ = { status, score: Math.floor(dist * 100) / 100, speed, airborne: ry > 0 };
};

app.onFrame((f) => {
  let left = Math.min(f.dt, 1 / 20);
  while (left > 0) {
    const dt = Math.min(left, 1 / 120);
    step(dt);
    left -= dt;
  }
  render();
  updateDom();
});

reset();
spawn();
updateDom();
await app.ready();
requestAnimationFrame(() => {
  window.__TASK_READY__ = true;
});
