import { camera, createAuraApp, effects, environments, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
type Vec3 = [number, number, number];

interface TaskState {
  status: Status;
  score: number;
  timeLeft: number;
  activeCells: number[];
}

declare global {
  interface Window {
    __TASK_STATE__?: TaskState;
    __TASK_READY__?: boolean;
  }
}

const ROUND_SECONDS = 45;
const WIN_SCORE = 150;
const SPACING = 2.4;
const PED_TOP = 0.4;
const HIDDEN_Y = -0.3;
const RAISED_Y = PED_TOP + 0.45;
const RISE = 0.14;
const DROP = 0.16;
const POOL = 48;

// ---------- seeded random ----------
const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam >>> 0 : 20240607;
let rngState = SEED;
const rand = (): number => {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// ---------- scene ----------
const cellX = (i: number): number => ((i % 3) - 1) * SPACING;
const cellZ = (i: number): number => (Math.floor(i / 3) - 1) * SPACING;

const CAM_POS: Vec3 = [0, 8, 7.5];
const CAM_TARGET: Vec3 = [0, 0.2, 0];
const CAM_FOV = 45;

const pedMat = material.pbr({ color: "#5a5f78", roughness: 0.7, metallic: 0.2 });
const holeMat = material.pbr({ color: "#07080d", roughness: 1 });
const lanternMat = material.emissive({ color: "#ffb52e", emissive: "#ffb52e", emissiveIntensity: 2.2 });
const bombMat = material.emissive({ color: "#2b1245", emissive: "#ff1f4d", emissiveIntensity: 1.6 });
const hoverMat = material.emissive({ color: "#6fe3ff", emissive: "#6fe3ff", emissiveIntensity: 2 });
const missMat = material.emissive({ color: "#ff2a2a", emissive: "#ff2a2a", emissiveIntensity: 2.5 });
const sparkMat = material.emissive({ color: "#fff2a8", emissive: "#fff2a8", emissiveIntensity: 3 });
const boomMat = material.emissive({ color: "#ff5030", emissive: "#ff5030", emissiveIntensity: 3 });

let sc = scene({ background: "#10131f" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 0.5, far: 100 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#9db4ff", groundColor: "#2a2030", intensity: 0.7 }))
  .add(lights.directional({ position: [4, 10, 5], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .add(effects.bloom({ intensity: 0.5, threshold: 0.8, radius: 0.5 }))
  .add(primitives.plane({ name: "ground", size: [30, 1, 30], material: material.pbr({ color: "#1b2030", roughness: 0.95 }) }));

for (let i = 0; i < 9; i += 1) {
  const x = cellX(i), z = cellZ(i);
  sc = sc
    .add(primitives.cylinder({ name: `hole${i}`, size: [1.9, 0.04, 1.9], material: holeMat, castShadow: false }).position(x, 0.02, z))
    .add(primitives.cylinder({ name: `ped${i}`, size: [1.5, PED_TOP, 1.5], material: pedMat }).position(x, PED_TOP / 2, z))
    .add(primitives.cylinder({ name: `hover${i}`, size: [1.95, 0.06, 1.95], material: hoverMat, castShadow: false }).position(x, 0.05, z).runtime({ id: `hover${i}`, mutable: true }))
    .add(primitives.cylinder({ name: `miss${i}`, size: [1.7, 0.1, 1.7], material: missMat, castShadow: false }).position(x, PED_TOP + 0.06, z).runtime({ id: `miss${i}`, mutable: true }))
    .add(primitives.sphere({ name: `lantern${i}`, size: 0.8, material: lanternMat }).position(x, HIDDEN_Y, z).runtime({ id: `lantern${i}`, mutable: true }))
    .add(primitives.sphere({ name: `bomb${i}`, size: 0.8, material: bombMat }).position(x, HIDDEN_Y, z).runtime({ id: `bomb${i}`, mutable: true }));
}
for (let p = 0; p < POOL; p += 1) {
  sc = sc.add(primitives.sphere({ name: `spark${p}`, size: 0.16, material: p % 2 === 0 ? sparkMat : boomMat, castShadow: false }).position(0, -20, 0).runtime({ id: `spark${p}`, mutable: true }));
}

const app = createAuraApp("#app", { scene: sc });
const canvas = document.getElementById("app") as HTMLCanvasElement;

// ---------- DOM HUD ----------
const hud = document.createElement("div");
hud.style.cssText = "width:640px;display:flex;justify-content:space-between;padding:6px 10px;box-sizing:border-box;font:600 15px system-ui,sans-serif;background:#161a28;";
hud.innerHTML = `<span>Score: <b id="hud-score">0</b></span><span>Time: <b id="hud-time">45.0</b></span><span>Status: <b id="hud-status">ready</b></span>`;
document.body.appendChild(hud);
const hudScore = document.getElementById("hud-score") as HTMLElement;
const hudTime = document.getElementById("hud-time") as HTMLElement;
const hudStatus = document.getElementById("hud-status") as HTMLElement;

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,7,14,0.7);text-align:center;font-family:system-ui,sans-serif;";
const ovTitle = document.createElement("div");
ovTitle.style.cssText = "font-size:30px;font-weight:700;";
const ovText = document.createElement("div");
ovText.style.cssText = "font-size:15px;max-width:460px;";
const btnCss = "font:600 16px system-ui,sans-serif;padding:8px 22px;border-radius:6px;border:0;background:#ffb52e;color:#201400;cursor:pointer;";
const startBtn = document.createElement("button");
startBtn.id = "start-btn";
startBtn.textContent = "Start";
startBtn.style.cssText = btnCss;
const restartBtn = document.createElement("button");
restartBtn.id = "restart-btn";
restartBtn.textContent = "Restart";
restartBtn.style.cssText = btnCss;
overlay.append(ovTitle, ovText, startBtn, restartBtn);
document.body.appendChild(overlay);

// ---------- game state ----------
interface Item {
  kind: "lantern" | "bomb";
  age: number;
  life: number;
}
interface Spark {
  active: boolean;
  pos: Vec3;
  vel: Vec3;
  age: number;
  life: number;
}

const state: TaskState = { status: "ready", score: 0, timeLeft: ROUND_SECONDS, activeCells: [] };
window.__TASK_STATE__ = state;

const items: (Item | null)[] = Array.from({ length: 9 }, () => null);
const missFlash: number[] = Array.from({ length: 9 }, () => 0);
const sparks: Spark[] = Array.from({ length: POOL }, () => ({ active: false, pos: [0, 0, 0], vel: [0, 0, 0], age: 0, life: 1 }));
let nextSpawn = 0.6;
let hover = -1;
let pointer: { x: number; y: number } | null = null;
let hudPulse = 0;
let hudPulseColor = "#fff";

const syncState = (): void => {
  const cells: number[] = [];
  for (let i = 0; i < 9; i += 1) {
    const it = items[i];
    if (it && it.age < it.life) cells.push(i);
  }
  state.activeCells = cells;
  hudScore.textContent = String(state.score);
  hudTime.textContent = state.timeLeft.toFixed(1);
  hudStatus.textContent = state.status;
};

const showOverlay = (): void => {
  const s = state.status;
  overlay.style.display = s === "playing" ? "none" : "flex";
  startBtn.style.display = s === "ready" ? "" : "none";
  restartBtn.style.display = s === "won" || s === "lost" ? "" : "none";
  if (s === "ready") {
    ovTitle.textContent = "Lantern Pop";
    ovText.textContent = "Click raised lanterns (+10). Missing a cell costs 5. Avoid the bombs! Score 150 in 45 seconds to win. Press Enter or Start.";
  } else if (s === "won") {
    ovTitle.textContent = "You won!";
    ovText.textContent = `Final score: ${state.score}. Press R or Restart to play again.`;
  } else if (s === "lost") {
    ovTitle.textContent = "You lost";
    ovText.textContent = `Final score: ${state.score}. Press R or Restart to play again.`;
  }
};

const burst = (cell: number, bombBurst: boolean): void => {
  const n = bombBurst ? 20 : 12;
  let made = 0;
  for (const sp of sparks) {
    if (sp.active) continue;
    const a = (made / n) * Math.PI * 2 + Math.random() * 0.3;
    const speed = (bombBurst ? 3.5 : 2.5) + Math.random() * 1.5;
    sp.active = true;
    sp.age = 0;
    sp.life = 0.55 + Math.random() * 0.2;
    sp.pos = [cellX(cell), RAISED_Y, cellZ(cell)];
    sp.vel = [Math.cos(a) * speed, 2.5 + Math.random() * 2, Math.sin(a) * speed];
    made += 1;
    if (made >= n) break;
  }
};

const endRound = (status: "won" | "lost"): void => {
  state.status = status;
  for (let i = 0; i < 9; i += 1) items[i] = null;
  syncState();
  showOverlay();
};

const startRound = (): void => {
  rngState = SEED;
  state.status = "playing";
  state.score = 0;
  state.timeLeft = ROUND_SECONDS;
  for (let i = 0; i < 9; i += 1) {
    items[i] = null;
    missFlash[i] = 0;
  }
  for (const sp of sparks) sp.active = false;
  nextSpawn = 0.6;
  syncState();
  showOverlay();
};

const lifeFor = (): number => Math.max(0.6, 1.5 - state.score * 0.004);

const spawn = (): void => {
  const free: number[] = [];
  for (let i = 0; i < 9; i += 1) if (!items[i]) free.push(i);
  const cell = free[Math.floor(rand() * free.length)]!;
  const bomb = rand() < 0.16;
  items[cell] = { kind: bomb ? "bomb" : "lantern", age: 0, life: lifeFor() };
};

const addScore = (delta: number, color: string): void => {
  state.score = Math.max(0, state.score + delta);
  hudPulse = 0.35;
  hudPulseColor = color;
};

// ---------- picking (ray vs per-cell box) ----------
const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);

const pick = (clientX: number, clientY: number): number => {
  const r = canvas.getBoundingClientRect();
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((clientY - r.top) / r.height) * 2;
  const th = Math.tan((CAM_FOV * Math.PI) / 360);
  const aspect = r.width / r.height;
  const dir: Vec3 = [
    fwd[0] + right[0] * nx * th * aspect + up[0] * ny * th,
    fwd[1] + right[1] * nx * th * aspect + up[1] * ny * th,
    fwd[2] + right[2] * nx * th * aspect + up[2] * ny * th
  ];
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < 9; i += 1) {
    const lo: Vec3 = [cellX(i) - 0.95, 0, cellZ(i) - 0.95];
    const hi: Vec3 = [cellX(i) + 0.95, RAISED_Y + 0.5, cellZ(i) + 0.95];
    let t0 = 0;
    let t1 = Infinity;
    for (let k = 0; k < 3; k += 1) {
      const o = CAM_POS[k]!, d = dir[k]!;
      if (Math.abs(d) < 1e-9) {
        if (o < lo[k]! || o > hi[k]!) { t0 = Infinity; break; }
      } else {
        let a = (lo[k]! - o) / d, b = (hi[k]! - o) / d;
        if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a);
        t1 = Math.min(t1, b);
      }
    }
    if (t0 <= t1 && t0 < bestT) { bestT = t0; best = i; }
  }
  return best;
};

canvas.addEventListener("pointermove", (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  hover = pick(e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => {
  pointer = null;
  hover = -1;
});
canvas.addEventListener("pointerdown", (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  hover = pick(e.clientX, e.clientY);
  if (state.status !== "playing" || hover < 0) return;
  const cell = hover;
  const it = items[cell];
  if (it && it.age < it.life) {
    items[cell] = null;
    if (it.kind === "bomb") {
      burst(cell, true);
      addScore(0, "#ff4040");
      endRound("lost");
    } else {
      burst(cell, false);
      addScore(10, "#7dff8a");
    }
  } else {
    missFlash[cell] = 0.35;
    addScore(-5, "#ff4040");
  }
  syncState();
});

startBtn.addEventListener("click", () => { if (state.status === "ready") startRound(); });
restartBtn.addEventListener("click", () => startRound());
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && state.status === "ready") startRound();
  else if (e.key === "r" || e.key === "R") startRound();
});

// ---------- per frame ----------
type RuntimeNode = ReturnType<typeof app.nodes.require>;
const nodeCache = new Map<string, RuntimeNode>();
const node = (id: string): RuntimeNode => {
  let n = nodeCache.get(id);
  if (!n) {
    n = app.nodes.require(id);
    nodeCache.set(id, n);
  }
  return n;
};

const itemY = (it: Item): number => {
  const up01 = Math.min(1, it.age / RISE);
  const down01 = Math.min(1, Math.max(0, (it.age - (it.life - DROP)) / DROP));
  const e = up01 * (2 - up01) * (1 - down01 * down01);
  return HIDDEN_Y + (RAISED_Y - HIDDEN_Y) * e;
};

let clock = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  clock += dt;

  if (state.status === "playing") {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    for (let i = 0; i < 9; i += 1) {
      const it = items[i];
      if (!it) continue;
      it.age += dt;
      if (it.age >= it.life + 0.02) items[i] = null;
    }
    nextSpawn -= dt;
    if (nextSpawn <= 0) {
      if (items.every((it) => !it)) {
        spawn();
        nextSpawn = 0.25 + rand() * 0.35;
      } else {
        nextSpawn = 0.1;
      }
    }
    if (state.timeLeft <= 0) endRound(state.score >= WIN_SCORE ? "won" : "lost");
  }
  if (pointer && state.status !== "playing") hover = pick(pointer.x, pointer.y);

  for (let i = 0; i < 9; i += 1) {
    const it = items[i];
    const lantern = node(`lantern${i}`);
    const bomb = node(`bomb${i}`);
    const x = cellX(i), z = cellZ(i);
    const showL = !!it && it.kind === "lantern";
    const showB = !!it && it.kind === "bomb";
    lantern.setVisible(showL);
    bomb.setVisible(showB);
    if (it) {
      const y = itemY(it);
      const target = it.kind === "lantern" ? lantern : bomb;
      target.setPosition(x, y, z);
      target.setRotation(0, clock * 2, 0);
      const pulse = 1 + 0.06 * Math.sin(clock * 10 + i);
      target.setScale([pulse, pulse, pulse]);
    }
    const h = node(`hover${i}`);
    h.setVisible(hover === i && state.status === "playing");
    const m = node(`miss${i}`);
    if (missFlash[i]! > 0) {
      missFlash[i] = Math.max(0, missFlash[i]! - dt);
      m.setVisible(true);
      const s = 1 + (0.35 - missFlash[i]!) * 1.2;
      m.setScale([s, 1, s]);
    } else {
      m.setVisible(false);
    }
  }

  for (let p = 0; p < POOL; p += 1) {
    const sp = sparks[p]!;
    const n = node(`spark${p}`);
    if (!sp.active) {
      n.setVisible(false);
      continue;
    }
    sp.age += dt;
    if (sp.age >= sp.life) {
      sp.active = false;
      n.setVisible(false);
      continue;
    }
    sp.vel[1] -= 9 * dt;
    sp.pos = [sp.pos[0] + sp.vel[0] * dt, sp.pos[1] + sp.vel[1] * dt, sp.pos[2] + sp.vel[2] * dt];
    const s = Math.max(0.05, 1 - sp.age / sp.life);
    n.setVisible(true);
    n.setPosition(sp.pos[0], sp.pos[1], sp.pos[2]);
    n.setScale([s, s, s]);
  }

  if (hudPulse > 0) {
    hudPulse = Math.max(0, hudPulse - dt);
    hudScore.style.color = hudPulse > 0 ? hudPulseColor : "";
    hudScore.style.fontSize = hudPulse > 0 ? "19px" : "";
  }
  syncState();
});

showOverlay();
syncState();
await app.ready();
window.__TASK_READY__ = true;
