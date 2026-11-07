import {
  camera,
  createAuraApp,
  group,
  looks,
  material,
  primitives,
  scene,
  lights,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";

interface TaskState {
  status: Status;
  score: number;
  timeLeft: number;
  activeCells: number[];
}

declare global {
  interface Window {
    __TASK_STATE__: TaskState;
    __TASK_READY__: boolean;
    __TASK_CELL_CENTERS__: Array<{ x: number; y: number } | null>;
  }
}

// ---------------------------------------------------------------- constants
const LOOK_ID = "neon-arcade" as const;
const ROUND_SECONDS = 45;
const WIN_SCORE = 150;
const STEP = 1 / 60;
const SPACING = 1.8;
const PED_TOP = 0.3;
const UP_Y = 0.82;
const DOWN_Y = -0.35;
const RISE_TIME = 0.14;
const FALL_TIME = 0.2;
const PICK_RADIUS = 0.62;
const CELL_HALF = 0.88;
const MAX_ACTIVE = 3;
const CAM_POS: [number, number, number] = [0, 6.6, 7.2];
const CAM_TARGET: [number, number, number] = [0, 0.3, 0.3];
const CAM_FOV = 40;

const cellX = (i: number): number => ((i % 3) - 1) * SPACING;
const cellZ = (i: number): number => (Math.floor(i / 3) - 1) * SPACING;

// ---------------------------------------------------------------- seeded rng
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

const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? Math.floor(seedParam) : 20240607;
let rng = mulberry32(SEED);

// ---------------------------------------------------------------- scene
const GOLD = "#ffb02e";
const sceneBuilder = scene({ camera: camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV }) })
  .add(looks.preset(LOOK_ID))
  .add(lights.point({ position: [0, 4.5, 1], intensity: 14, distance: 14, color: "#9fb4ff" }))
  .add(
    primitives.plane({
      name: "ground",
      size: [40, 1, 40],
      material: material.pbr({ color: "#0d1020", roughness: 0.85 }),
      receiveShadow: true
    })
  );

for (let i = 0; i < 9; i += 1) {
  const x = cellX(i);
  const z = cellZ(i);
  sceneBuilder.add(
    primitives.cylinder({
      name: `pedestal-${i}`,
      size: [1.3, PED_TOP, 1.3],
      position: [x, PED_TOP / 2, z],
      material: material.pbr({ color: "#2b3558", metallic: 0.4, roughness: 0.5 }),
      castShadow: true,
      receiveShadow: true
    })
  );
  sceneBuilder.add(
    primitives.cylinder({
      name: `hole-${i}`,
      size: [0.95, 0.02, 0.95],
      position: [x, PED_TOP + 0.011, z],
      material: material.pbr({ color: "#020308", roughness: 1 })
    })
  );

  const lanternMat = material.emissive({ color: "#ffd27a", emissive: GOLD, emissiveIntensity: 2.2 });
  const capMat = material.pbr({ color: "#3b2a1a", metallic: 0.6, roughness: 0.4 });
  sceneBuilder.add(
    group(
      `lantern-${i}`,
      [
        primitives.sphere({ name: `lantern-body-${i}`, size: [0.72, 0.88, 0.72], material: lanternMat }),
        primitives.cylinder({ name: `lantern-top-${i}`, size: [0.42, 0.1, 0.42], position: [0, 0.46, 0], material: capMat }),
        primitives.cylinder({ name: `lantern-bot-${i}`, size: [0.34, 0.08, 0.34], position: [0, -0.45, 0], material: capMat }),
        primitives.sphere({ name: `lantern-ring-${i}`, size: 0.12, position: [0, 0.57, 0], material: capMat })
      ],
      { position: [x, -3, z] }
    ).runtime({ id: `lantern-${i}`, mutable: true })
  );

  const bombMat = material.emissive({ color: "#2a0716", emissive: "#ff1f5a", emissiveIntensity: 1.1 });
  sceneBuilder.add(
    group(
      `bomb-${i}`,
      [
        primitives.sphere({ name: `bomb-body-${i}`, size: 0.8, material: bombMat }),
        primitives.cylinder({
          name: `bomb-neck-${i}`,
          size: [0.2, 0.14, 0.2],
          position: [0, 0.4, 0],
          material: material.pbr({ color: "#555a70", metallic: 0.7, roughness: 0.4 })
        }),
        primitives.sphere({
          name: `bomb-fuse-${i}`,
          size: 0.16,
          position: [0.08, 0.58, 0],
          material: material.emissive({ color: "#ffffff", emissive: "#fff35c", emissiveIntensity: 3 })
        })
      ],
      { position: [x, -3, z] }
    ).runtime({ id: `bomb-${i}`, mutable: true })
  );
}

sceneBuilder.add(
  primitives.cylinder({
    name: "hover-ring",
    size: [1.6, 0.09, 1.6],
    position: [0, -3, 0],
    material: material.emissive({ color: "#bffaff", emissive: "#4de8ff", emissiveIntensity: 3 })
  }).runtime({ id: "hover-ring", mutable: true })
);
sceneBuilder.add(
  primitives.cylinder({
    name: "miss-ring",
    size: [1.7, 0.14, 1.7],
    position: [0, -3, 0],
    material: material.emissive({ color: "#ff9aa8", emissive: "#ff2442", emissiveIntensity: 3.5 })
  }).runtime({ id: "miss-ring", mutable: true })
);

const GOLD_POOL = 40;
const RED_POOL = 24;
for (let i = 0; i < GOLD_POOL; i += 1) {
  sceneBuilder.add(
    primitives.sphere({
      name: `spark-${i}`,
      size: 0.22,
      position: [0, -3, 0],
      material: material.emissive({ color: "#fff2c0", emissive: i % 2 ? "#ffd24a" : "#ffffff", emissiveIntensity: 3 })
    }).runtime({ id: `spark-${i}`, mutable: true })
  );
}
for (let i = 0; i < RED_POOL; i += 1) {
  sceneBuilder.add(
    primitives.sphere({
      name: `ember-${i}`,
      size: 0.24,
      position: [0, -3, 0],
      material: material.emissive({ color: "#ff8a8a", emissive: "#ff3050", emissiveIntensity: 3 })
    }).runtime({ id: `ember-${i}`, mutable: true })
  );
}

// ---------------------------------------------------------------- DOM
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  css: string,
  parent: HTMLElement,
  id?: string
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  node.style.cssText = css;
  if (id) node.id = id;
  parent.appendChild(node);
  return node;
}

const canvas = document.getElementById("app") as HTMLCanvasElement;
document.body.style.position = "relative";
document.body.style.width = "640px";

const hud = el(
  "div",
  "display:flex;justify-content:space-between;width:640px;box-sizing:border-box;padding:6px 12px;background:#10142a;color:#e8ecff;font:600 15px system-ui,sans-serif;",
  document.body,
  "hud"
);
const hudScore = el("span", "", hud, "hud-score");
const hudTime = el("span", "", hud, "hud-time");
const hudStatus = el("span", "", hud, "hud-status");
const hudHelp = el(
  "div",
  "width:640px;box-sizing:border-box;padding:2px 12px 8px;background:#10142a;color:#8f9bd0;font:12px system-ui,sans-serif;",
  document.body
);
hudHelp.textContent = "Click glowing lanterns (+10). Misses cost 5. Never touch the bombs. 150 points in 45 s wins. Enter = start, R = restart.";

const popup = el(
  "div",
  "position:absolute;left:0;top:300px;width:640px;text-align:center;font:800 26px system-ui,sans-serif;pointer-events:none;opacity:0;text-shadow:0 2px 6px #000;",
  document.body,
  "popup"
);

const overlay = el(
  "div",
  "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(5,7,18,0.72);color:#fff;font-family:system-ui,sans-serif;text-align:center;",
  document.body,
  "overlay"
);
const overlayTitle = el("div", "font-size:34px;font-weight:800;", overlay, "overlay-title");
const overlayText = el("div", "font-size:16px;color:#c7d0ff;max-width:460px;", overlay, "overlay-text");
const btnCss =
  "font:700 18px system-ui,sans-serif;padding:8px 28px;border-radius:8px;border:2px solid #4de8ff;background:#14214a;color:#fff;cursor:pointer;";
const startBtn = el("button", btnCss, overlay, "start-btn");
startBtn.textContent = "Start";
const restartBtn = el("button", btnCss, overlay, "restart-btn");
restartBtn.textContent = "Restart";

// ---------------------------------------------------------------- game state
type Phase = "idle" | "rising" | "up" | "falling" | "popped";
interface Cell {
  kind: "lantern" | "bomb";
  phase: Phase;
  t: number;
  hold: number;
  y: number;
  seed: number;
}
const cells: Cell[] = Array.from({ length: 9 }, (_, i) => ({
  kind: "lantern" as const,
  phase: "idle" as Phase,
  t: 0,
  hold: 0,
  y: DOWN_Y,
  seed: i * 1.7
}));

const state: TaskState = { status: "ready", score: 0, timeLeft: ROUND_SECONDS, activeCells: [] };
window.__TASK_STATE__ = state;
window.__TASK_READY__ = false;
window.__TASK_CELL_CENTERS__ = Array.from({ length: 9 }, () => null);

let spawnTimer = 0.6;
let spawnCount = 0;
let hovered = -1;
let missFlash = 0;
let missCell = 0;
let clock = 0;

const isRaised = (c: Cell): boolean => c.phase === "rising" || c.phase === "up";

function syncState(): void {
  const active: number[] = [];
  for (let i = 0; i < 9; i += 1) if (isRaised(cells[i])) active.push(i);
  state.activeCells = active;
  hudScore.textContent = `Score: ${state.score}`;
  hudTime.textContent = `Time: ${state.timeLeft.toFixed(1)}`;
  hudStatus.textContent = `Status: ${state.status}`;
}

let popupTimer = 0;
function showPopup(text: string, color: string): void {
  popup.textContent = text;
  popup.style.color = color;
  popupTimer = 0.7;
}

function setOverlay(): void {
  const s = state.status;
  overlay.style.display = s === "playing" ? "none" : "flex";
  startBtn.style.display = s === "ready" ? "block" : "none";
  restartBtn.style.display = s === "won" || s === "lost" ? "block" : "none";
  if (s === "ready") {
    overlayTitle.textContent = "Lantern Pop";
    overlayText.textContent = "Pop the glowing lanterns before they sink. Avoid the red bombs. Score 150 in 45 seconds.";
  } else if (s === "won") {
    overlayTitle.textContent = "You win!";
    overlayText.textContent = `Final score: ${state.score}. Press R or Restart to play again.`;
  } else if (s === "lost") {
    overlayTitle.textContent = "Game over";
    overlayText.textContent = `Final score: ${state.score}. Press R or Restart to try again.`;
  }
}

// ---------------------------------------------------------------- app
const app = createAuraApp("#app", { scene: sceneBuilder, ...looks.appOptions(LOOK_ID) });

let lanterns: AuraRuntimeNodeHandle[] = [];
let bombs: AuraRuntimeNodeHandle[] = [];
let hoverRing: AuraRuntimeNodeHandle | undefined;
let missRing: AuraRuntimeNodeHandle | undefined;

interface Particle {
  h: AuraRuntimeNodeHandle;
  life: number;
  max: number;
  p: [number, number, number];
  v: [number, number, number];
  base: number;
}
let goldPool: Particle[] = [];
let redPool: Particle[] = [];
let goldNext = 0;
let redNext = 0;

function emit(pool: Particle[], next: number, x: number, y: number, z: number, n: number, speed: number): number {
  let idx = next;
  for (let k = 0; k < n; k += 1) {
    const prt = pool[idx % pool.length];
    idx += 1;
    const a = (k / n) * Math.PI * 2 + Math.random() * 0.5;
    const up = 2.2 + Math.random() * 2.2;
    const sp = speed * (0.6 + Math.random() * 0.6);
    prt.p = [x, y, z];
    prt.v = [Math.cos(a) * sp, up, Math.sin(a) * sp];
    prt.max = 0.55 + Math.random() * 0.2;
    prt.life = prt.max;
    prt.h.setVisible(true);
  }
  return idx % pool.length;
}

function burstGold(cell: number): void {
  goldNext = emit(goldPool, goldNext, cellX(cell), UP_Y, cellZ(cell), 10, 2.4);
}
function burstRed(cell: number, n: number, speed: number): void {
  redNext = emit(redPool, redNext, cellX(cell), UP_Y, cellZ(cell), n, speed);
}

// ---------------------------------------------------------------- picking
function pointerRay(clientX: number, clientY: number): { o: number[]; d: number[] } {
  const r = canvas.getBoundingClientRect();
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const th = Math.tan((CAM_FOV * Math.PI) / 360);
  const f = norm(sub(CAM_TARGET, CAM_POS));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const d = norm([
    f[0] + right[0] * nx * th * aspect + up[0] * ny * th,
    f[1] + right[1] * nx * th * aspect + up[1] * ny * th,
    f[2] + right[2] * nx * th * aspect + up[2] * ny * th
  ]);
  return { o: [...CAM_POS], d };
}
function sub(a: readonly number[], b: readonly number[]): number[] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: readonly number[], b: readonly number[]): number[] {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: readonly number[]): number[] {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}
/** Distance along the ray to a sphere, or -1. */
function raySphere(o: number[], d: number[], c: number[], r: number): number {
  const oc = sub(o, c);
  const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
  const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r * r;
  const disc = b * b - cc;
  if (disc < 0) return -1;
  const t = -b - Math.sqrt(disc);
  return t > 0 ? t : -1;
}

interface Pick {
  cell: number;
  hitObject: boolean;
}
function pick(clientX: number, clientY: number): Pick | null {
  const { o, d } = pointerRay(clientX, clientY);
  let best = -1;
  let bestT = Infinity;
  let bestRaised = false;
  for (let i = 0; i < 9; i += 1) {
    const c = cells[i];
    if (c.phase === "idle" || c.phase === "popped") continue;
    const t = raySphere(o, d, [cellX(i), c.y, cellZ(i)], PICK_RADIUS);
    if (t > 0 && t < bestT) {
      bestT = t;
      best = i;
      bestRaised = isRaised(c);
    }
  }
  if (best >= 0) return { cell: best, hitObject: bestRaised };
  if (Math.abs(d[1]) < 1e-6) return null;
  const t = (PED_TOP - o[1]) / d[1];
  if (t <= 0) return null;
  const px = o[0] + d[0] * t;
  const pz = o[2] + d[2] * t;
  for (let i = 0; i < 9; i += 1) {
    if (Math.abs(px - cellX(i)) <= CELL_HALF && Math.abs(pz - cellZ(i)) <= CELL_HALF) return { cell: i, hitObject: false };
  }
  return null;
}

// ---------------------------------------------------------------- rules
function resetCells(): void {
  for (const c of cells) {
    c.phase = "idle";
    c.t = 0;
    c.y = DOWN_Y;
  }
}

function startRound(): void {
  rng = mulberry32(SEED);
  spawnCount = 0;
  spawnTimer = 0.6;
  resetCells();
  state.status = "playing";
  state.score = 0;
  state.timeLeft = ROUND_SECONDS;
  missFlash = 0;
  popupTimer = 0;
  popup.style.opacity = "0";
  setOverlay();
  syncState();
  (document.activeElement as HTMLElement | null)?.blur?.();
}

function endRound(status: "won" | "lost"): void {
  state.status = status;
  for (const c of cells) {
    if (isRaised(c)) {
      c.phase = "falling";
      c.t = 0;
    }
  }
  setOverlay();
  syncState();
}

function holdTime(kind: "lantern" | "bomb"): number {
  const base = Math.max(0.45, 1.25 - state.score * 0.0045);
  return kind === "bomb" ? base * 1.15 : base;
}

function spawn(): void {
  // Always consume the same number of random values so a seed repeats the spawn order.
  const rGap = rng();
  const rCell = rng();
  const rBomb = rng();
  const scale = Math.max(0.6, 1 - state.score / 600);
  spawnTimer = (0.4 + rGap * 0.45) * scale;
  spawnCount += 1;
  let active = 0;
  for (const c of cells) if (c.phase !== "idle") active += 1;
  if (active >= MAX_ACTIVE) return;
  const start = Math.floor(rCell * 9);
  for (let k = 0; k < 9; k += 1) {
    const i = (start + k) % 9;
    if (cells[i].phase === "idle") {
      const c = cells[i];
      c.kind = spawnCount > 3 && rBomb < 0.15 ? "bomb" : "lantern";
      c.phase = "rising";
      c.t = 0;
      c.hold = holdTime(c.kind);
      return;
    }
  }
}

function step(dt: number): void {
  if (state.status === "playing") {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) spawn();
  }
  for (const c of cells) {
    if (c.phase === "idle") continue;
    c.t += dt;
    if (c.phase === "rising") {
      const k = Math.min(1, c.t / RISE_TIME);
      c.y = DOWN_Y + (UP_Y - DOWN_Y) * (1 - (1 - k) * (1 - k));
      if (k >= 1) {
        c.phase = "up";
        c.t = 0;
      }
    } else if (c.phase === "up") {
      c.y = UP_Y;
      if (c.t >= c.hold) {
        c.phase = "falling";
        c.t = 0;
      }
    } else if (c.phase === "falling") {
      const k = Math.min(1, c.t / FALL_TIME);
      c.y = UP_Y + (DOWN_Y - UP_Y) * k * k;
      if (k >= 1) {
        c.phase = "idle";
        c.y = DOWN_Y;
      }
    } else if (c.phase === "popped") {
      c.phase = "idle";
      c.y = DOWN_Y;
    }
  }
  if (state.status === "playing" && state.timeLeft <= 0) {
    endRound(state.score >= WIN_SCORE ? "won" : "lost");
    return;
  }
  syncState();
}

function penalize(cell: number): void {
  state.score = Math.max(0, state.score - 5);
  missCell = cell;
  missFlash = 0.35;
  burstRed(cell, 6, 1.6);
  showPopup("-5", "#ff4d6a");
  syncState();
}

function handleClick(clientX: number, clientY: number): void {
  if (state.status !== "playing") return;
  const p = pick(clientX, clientY);
  if (!p) return;
  const c = cells[p.cell];
  if (p.hitObject) {
    if (c.kind === "bomb") {
      c.phase = "popped";
      burstRed(p.cell, 24, 3.4);
      missCell = p.cell;
      missFlash = 0.5;
      showPopup("BOOM!", "#ff3355");
      endRound("lost");
    } else {
      c.phase = "popped";
      state.score += 10;
      burstGold(p.cell);
      showPopup("+10", "#ffd24a");
      syncState();
    }
  } else {
    penalize(p.cell);
  }
}

// ---------------------------------------------------------------- input
canvas.addEventListener("pointermove", (e) => {
  const p = pick(e.clientX, e.clientY);
  hovered = p ? p.cell : -1;
});
canvas.addEventListener("pointerleave", () => {
  hovered = -1;
});
canvas.addEventListener("pointerdown", (e) => {
  const p = pick(e.clientX, e.clientY);
  hovered = p ? p.cell : -1;
  handleClick(e.clientX, e.clientY);
});
canvas.style.touchAction = "none";
startBtn.addEventListener("click", () => {
  if (state.status === "ready") startRound();
});
restartBtn.addEventListener("click", () => {
  if (state.status === "won" || state.status === "lost") startRound();
});
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Enter" && state.status === "ready") {
    e.preventDefault();
    startRound();
  } else if (e.key === "r" || e.key === "R") {
    startRound();
  }
});

// ---------------------------------------------------------------- visuals
function updateParticles(pool: Particle[], dt: number): void {
  for (const prt of pool) {
    if (prt.life <= 0) continue;
    prt.life -= dt;
    if (prt.life <= 0) {
      prt.h.setVisible(false);
      continue;
    }
    prt.v[1] -= 9 * dt;
    prt.p[0] += prt.v[0] * dt;
    prt.p[1] += prt.v[1] * dt;
    prt.p[2] += prt.v[2] * dt;
    prt.h.setPosition(prt.p[0], prt.p[1], prt.p[2]);
    prt.h.setScale(Math.max(0.05, prt.life / prt.max));
  }
}

function render(dt: number): void {
  clock += dt;
  for (let i = 0; i < 9; i += 1) {
    const c = cells[i];
    const lh = lanterns[i];
    const bh = bombs[i];
    const showL = c.phase !== "idle" && c.phase !== "popped" && c.kind === "lantern";
    const showB = c.phase !== "idle" && c.phase !== "popped" && c.kind === "bomb";
    lh.setVisible(showL);
    bh.setVisible(showB);
    const x = cellX(i);
    const z = cellZ(i);
    const bob = isRaised(c) ? Math.sin(clock * 6 + c.seed) * 0.03 : 0;
    if (showL) {
      lh.setPosition(x, c.y + bob, z);
      lh.setRotation(0, clock * 1.5 + c.seed, 0);
    }
    if (showB) {
      bh.setPosition(x, c.y + bob, z);
      bh.setRotation(0, clock * 2 + c.seed, 0);
      const pulse = 1 + 0.06 * Math.sin(clock * 14);
      bh.setScale(pulse);
    }
    window.__TASK_CELL_CENTERS__[i] = isRaised(c) ? projectToCanvas(x, c.y, z) : null;
  }

  if (hoverRing) {
    if (hovered >= 0) {
      const s = 1 + 0.03 * Math.sin(clock * 8);
      hoverRing.setPosition(cellX(hovered), 0.045, cellZ(hovered));
      hoverRing.setScale([s, 1, s]);
      hoverRing.setVisible(true);
    } else {
      hoverRing.setVisible(false);
    }
  }
  if (missRing) {
    if (missFlash > 0) {
      missFlash -= dt;
      const s = 1 + (0.35 - Math.min(0.35, missFlash)) * 0.9;
      missRing.setPosition(cellX(missCell), 0.06, cellZ(missCell));
      missRing.setScale([s, 1, s]);
      missRing.setVisible(missFlash > 0);
    } else {
      missRing.setVisible(false);
    }
  }
  updateParticles(goldPool, dt);
  updateParticles(redPool, dt);

  if (popupTimer > 0) {
    popupTimer -= dt;
    popup.style.opacity = String(Math.max(0, Math.min(1, popupTimer / 0.4)));
    popup.style.transform = `translateY(${(0.7 - popupTimer) * -30}px)`;
  }
}

function projectToCanvas(x: number, y: number, z: number): { x: number; y: number } {
  const f = norm(sub(CAM_TARGET, CAM_POS));
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const v = sub([x, y, z], CAM_POS);
  const depth = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  const th = Math.tan((CAM_FOV * Math.PI) / 360);
  const r = canvas.getBoundingClientRect();
  const aspect = r.width / r.height;
  const nx = (v[0] * right[0] + v[1] * right[1] + v[2] * right[2]) / (depth * th * aspect);
  const ny = (v[0] * up[0] + v[1] * up[1] + v[2] * up[2]) / (depth * th);
  return { x: r.left + ((nx + 1) / 2) * r.width, y: r.top + ((1 - ny) / 2) * r.height };
}

// ---------------------------------------------------------------- boot
async function boot(): Promise<void> {
  try {
    await app.ready();
  } catch (err) {
    console.error(err);
  }
  lanterns = Array.from({ length: 9 }, (_, i) => app.nodes.require(`lantern-${i}`));
  bombs = Array.from({ length: 9 }, (_, i) => app.nodes.require(`bomb-${i}`));
  hoverRing = app.nodes.require("hover-ring");
  missRing = app.nodes.require("miss-ring");
  const mk = (prefix: string, n: number): Particle[] =>
    Array.from({ length: n }, (_, i) => ({
      h: app.nodes.require(`${prefix}-${i}`),
      life: 0,
      max: 1,
      p: [0, 0, 0],
      v: [0, 0, 0],
      base: 1
    }));
  goldPool = mk("spark", GOLD_POOL);
  redPool = mk("ember", RED_POOL);
  for (const prt of [...goldPool, ...redPool]) prt.h.setVisible(false);
  hoverRing.setVisible(false);
  missRing.setVisible(false);
  for (const h of [...lanterns, ...bombs]) h.setVisible(false);

  setOverlay();
  syncState();

  let last = performance.now();
  let acc = 0;
  let frames = 0;
  const loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      step(STEP);
      acc -= STEP;
      n += 1;
    }
    if (n === 6) acc = 0;
    render(dt);
    frames += 1;
    if (frames === 2) window.__TASK_READY__ = true;
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot();
