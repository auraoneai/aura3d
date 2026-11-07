import {
  camera,
  createAuraApp,
  effects,
  looks,
  material,
  primitives,
  scene,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";

// ---------------------------------------------------------------- types
type Status = "ready" | "playing" | "won" | "lost";
type Kind = "lantern" | "bomb";
type Phase = "down" | "rising" | "up" | "falling";
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

// ---------------------------------------------------------------- constants
const LOOK_ID = "neon-arcade" as const;
const ROUND_SECONDS = 45;
const WIN_SCORE = 150;
const SPACING = 1.8;
const RISE_TIME = 0.14;
const FALL_TIME = 0.2;
const Y_LOW = -1.2;
const Y_HIGH = 0.5;
const HIT_RADIUS = 0.6;
const CELL_HALF = 0.78;
const POOL_SIZE = 28;
const DEFAULT_SEED = 20240607;

const CAM_POS: Vec3 = [0, 8, 5.5];
const CAM_TARGET: Vec3 = [0, 0, 0];
const CAM_FOV = 40;

// ---------------------------------------------------------------- seeded rng
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

function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get("seed");
  if (raw !== null) {
    const n = Number(raw);
    if (Number.isFinite(n)) return Math.floor(n);
  }
  return DEFAULT_SEED;
}

// ---------------------------------------------------------------- scene
const cellX = (i: number): number => ((i % 3) - 1) * SPACING;
const cellZ = (i: number): number => (Math.floor(i / 3) - 1) * SPACING;

interface PartSpec {
  id: string;
  dy: number;
}

const lanternParts = (i: number): PartSpec[] => [
  { id: `lan-body-${i}`, dy: 0 },
  { id: `lan-cap-${i}`, dy: 0.5 },
  { id: `lan-base-${i}`, dy: -0.5 }
];
const bombParts = (i: number): PartSpec[] => [
  { id: `bomb-body-${i}`, dy: 0 },
  { id: `bomb-fuse-${i}`, dy: 0.5 },
  { id: `bomb-spark-${i}`, dy: 0.72 }
];

const lanternMat = material.emissive({ color: "#ffb02e", emissive: "#ff9a1f", emissiveIntensity: 2.6, roughness: 0.35 });
const brassMat = material.pbr({ color: "#5b4630", roughness: 0.5, metallic: 0.6 });
const bombMat = material.emissive({ color: "#23232b", emissive: "#7a0d3a", emissiveIntensity: 0.9, roughness: 0.4 });
const sparkMat = material.emissive({ color: "#ff3d5a", emissive: "#ff2347", emissiveIntensity: 4, roughness: 0.3 });
const goldMat = material.emissive({ color: "#ffd75e", emissive: "#ffd75e", emissiveIntensity: 4, roughness: 0.3 });
const redMat = material.emissive({ color: "#ff3b4e", emissive: "#ff3b4e", emissiveIntensity: 4, roughness: 0.3 });
const hoverMat = material.emissive({ color: "#36e0ff", emissive: "#36e0ff", emissiveIntensity: 2.2, roughness: 0.5 });
const missMat = material.emissive({ color: "#ff2a3a", emissive: "#ff2a3a", emissiveIntensity: 3, roughness: 0.5 });

function buildNodes(): AuraNodeBuilder<AuraSceneNode>[] {
  const nodes: AuraNodeBuilder<AuraSceneNode>[] = [];
  const hidden = -6;

  nodes.push(
    primitives.box({
      name: "base",
      size: [3 * SPACING + 1.2, 0.3, 3 * SPACING + 1.2],
      material: material.pbr({ color: "#15122b", roughness: 0.8 }),
      position: [0, -0.2, 0]
    })
  );

  for (let i = 0; i < 9; i += 1) {
    const x = cellX(i);
    const z = cellZ(i);
    nodes.push(
      primitives.box({
        name: `slab-${i}`,
        size: [1.56, 0.3, 1.56],
        material: material.pbr({ color: "#3a3366", roughness: 0.6 }),
        position: [x, -0.15, z]
      })
    );
    nodes.push(
      primitives.cylinder({
        name: `hole-${i}`,
        size: [1.0, 0.02, 1.0],
        material: material.pbr({ color: "#050408", roughness: 1 }),
        position: [x, 0.02, z]
      })
    );
    nodes.push(
      primitives.cylinder({
        name: `rim-${i}`,
        size: [1.1, 0.012, 1.1],
        material: material.pbr({ color: "#7f6bd1", roughness: 0.5, metallic: 0.3 }),
        position: [x, 0.012, z]
      })
    );

    nodes.push(
      primitives.sphere({ name: `lan-body-${i}`, size: [0.8, 0.95, 0.8], material: lanternMat, position: [x, hidden, z] })
        .runtime({ id: `lan-body-${i}`, mutable: true }),
      primitives.cylinder({ name: `lan-cap-${i}`, size: [0.46, 0.12, 0.46], material: brassMat, position: [x, hidden, z] })
        .runtime({ id: `lan-cap-${i}`, mutable: true }),
      primitives.cylinder({ name: `lan-base-${i}`, size: [0.4, 0.1, 0.4], material: brassMat, position: [x, hidden, z] })
        .runtime({ id: `lan-base-${i}`, mutable: true }),
      primitives.sphere({ name: `bomb-body-${i}`, size: [0.85, 0.85, 0.85], material: bombMat, position: [x, hidden, z] })
        .runtime({ id: `bomb-body-${i}`, mutable: true }),
      primitives.cylinder({ name: `bomb-fuse-${i}`, size: [0.1, 0.26, 0.1], material: brassMat, position: [x, hidden, z] })
        .runtime({ id: `bomb-fuse-${i}`, mutable: true }),
      primitives.sphere({ name: `bomb-spark-${i}`, size: [0.2, 0.2, 0.2], material: sparkMat, position: [x, hidden, z] })
        .runtime({ id: `bomb-spark-${i}`, mutable: true })
    );
  }

  nodes.push(
    primitives.cylinder({ name: "hover", size: [1.5, 0.02, 1.5], material: hoverMat, position: [0, hidden, 0] })
      .runtime({ id: "hover", mutable: true }),
    primitives.cylinder({ name: "miss", size: [1.5, 0.02, 1.5], material: missMat, position: [0, hidden, 0] })
      .runtime({ id: "miss", mutable: true })
  );

  for (let p = 0; p < POOL_SIZE; p += 1) {
    nodes.push(
      primitives.sphere({ name: `gold-${p}`, size: 0.16, material: goldMat, position: [0, -30, 0], castShadow: false })
        .runtime({ id: `gold-${p}`, mutable: true }),
      primitives.sphere({ name: `red-${p}`, size: 0.16, material: redMat, position: [0, -30, 0], castShadow: false })
        .runtime({ id: `red-${p}`, mutable: true })
    );
  }
  return nodes;
}

const app = createAuraApp("#app", {
  scene: scene()
    .add(looks.preset(LOOK_ID))
    .addMany(buildNodes())
    .add(effects.bloom({ intensity: 0.55, threshold: 0.8, radius: 0.5 }))
    .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV })),
  ...looks.appOptions(LOOK_ID)
});

type Handle = ReturnType<typeof app.nodes.require>;

// ---------------------------------------------------------------- game state
interface Cell {
  kind: Kind;
  phase: Phase;
  t: number;
  stay: number;
  parts: { lantern: { node: Handle; dy: number }[]; bomb: { node: Handle; dy: number }[] };
  shownKind: Kind | null;
}

interface Particle {
  node: Handle;
  pos: Vec3;
  vel: Vec3;
  life: number;
  maxLife: number;
}

const state: TaskState = { status: "ready", score: 0, timeLeft: ROUND_SECONDS, activeCells: [] };
window.__TASK_STATE__ = state;

let cells: Cell[] = [];
let goldPool: Particle[] = [];
let redPool: Particle[] = [];
let goldNext = 0;
let redNext = 0;
let hoverNode: Handle | null = null;
let missNode: Handle | null = null;
let hoverCell = -1;
let missCell = -1;
let missTimer = 0;
let spawnTimer = 0.7;
let spawnCount = 0;
let rng = createRng(readSeed());
const fxRng = createRng(99);
let endReason = "";
let elapsed = 0;
let toastTimer = 0;

// ---------------------------------------------------------------- DOM HUD
const canvas = document.getElementById("app") as HTMLCanvasElement;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, css: string, parent: HTMLElement): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  e.style.cssText = css;
  parent.appendChild(e);
  return e;
}

const hud = el(
  "div",
  "width:640px;box-sizing:border-box;display:flex;justify-content:space-between;align-items:center;padding:6px 14px;background:#120f26;color:#f2edff;font:600 15px system-ui,sans-serif;border-top:1px solid #3a3366;",
  document.body
);
hud.id = "hud";
const scoreEl = el("span", "min-width:130px;", hud);
const toastEl = el("span", "color:#ff6b7a;flex:1;text-align:center;font-weight:700;", hud);
const timeEl = el("span", "min-width:110px;text-align:right;", hud);
const statusEl = el("span", "min-width:110px;text-align:right;color:#8fd3ff;", hud);
scoreEl.id = "hud-score";
timeEl.id = "hud-time";
statusEl.id = "hud-status";

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(10,8,24,0.72);color:#fff;text-align:center;font:15px system-ui,sans-serif;";
document.body.appendChild(overlay);
const overlayTitle = el("div", "font:800 30px system-ui,sans-serif;letter-spacing:1px;", overlay);
const overlayText = el("div", "max-width:440px;line-height:1.45;color:#d9d2ff;", overlay);
const actionBtn = el(
  "button",
  "padding:9px 28px;font:700 17px system-ui,sans-serif;border:0;border-radius:8px;background:#ffb02e;color:#241a05;cursor:pointer;",
  overlay
);
actionBtn.id = "action-btn";
actionBtn.type = "button";

function syncHud(): void {
  scoreEl.textContent = `Score: ${state.score}`;
  timeEl.textContent = `Time: ${state.timeLeft.toFixed(1)}`;
  statusEl.textContent = `Status: ${state.status}`;
  toastEl.textContent = toastTimer > 0 ? toastEl.textContent : "";
}

function showOverlay(): void {
  if (state.status === "playing") {
    overlay.style.display = "none";
    return;
  }
  overlay.style.display = "flex";
  if (state.status === "ready") {
    overlayTitle.textContent = "Lantern Pop";
    overlayText.textContent =
      "Pop the glowing lanterns before they sink. Clicking an empty cell costs 5 points. Never touch the bombs. Score 150 in 45 seconds to win.";
    actionBtn.textContent = "Start";
    actionBtn.dataset.role = "start";
  } else {
    overlayTitle.textContent = state.status === "won" ? "You won!" : "You lost";
    overlayText.textContent = `${endReason} Final score: ${state.score}. Press R or click Restart.`;
    actionBtn.textContent = "Restart";
    actionBtn.dataset.role = "restart";
  }
}

function toast(text: string): void {
  toastEl.textContent = text;
  toastEl.style.color = text.startsWith("+") ? "#ffd75e" : "#ff6b7a";
  toastTimer = 0.8;
}

// ---------------------------------------------------------------- game logic
function refreshActive(): void {
  const list: number[] = [];
  cells.forEach((c, i) => {
    if (c.phase === "rising" || c.phase === "up") list.push(i);
  });
  state.activeCells = list;
}

function startRound(): void {
  rng = createRng(readSeed());
  state.status = "playing";
  state.score = 0;
  state.timeLeft = ROUND_SECONDS;
  spawnTimer = 0.7;
  spawnCount = 0;
  endReason = "";
  for (const c of cells) {
    c.phase = "down";
    c.t = 0;
  }
  refreshActive();
  showOverlay();
  syncHud();
}

function endRound(status: "won" | "lost", reason: string): void {
  state.status = status;
  endReason = reason;
  if (status === "won" || state.timeLeft < 0) state.timeLeft = Math.max(0, state.timeLeft);
  for (const c of cells) {
    if (c.phase === "rising" || c.phase === "up") {
      c.phase = "falling";
      c.t = 0;
    }
  }
  refreshActive();
  showOverlay();
  syncHud();
}

function spawn(): void {
  const r1 = rng();
  const r2 = rng();
  const r3 = rng();
  let idx = Math.floor(r1 * 9) % 9;
  let found = -1;
  for (let k = 0; k < 9; k += 1) {
    const c = cells[(idx + k) % 9];
    if (c !== undefined && c.phase === "down") {
      found = (idx + k) % 9;
      break;
    }
  }
  const stay = Math.max(0.45, 1.4 - state.score * 0.006);
  const gap = Math.max(0.4, 0.85 - state.score * 0.003);
  spawnTimer = gap * (0.75 + 0.5 * r3);
  spawnCount += 1;
  if (found < 0) return;
  idx = found;
  const cell = cells[idx];
  if (cell === undefined) return;
  cell.kind = spawnCount > 3 && r2 < 0.16 ? "bomb" : "lantern";
  cell.phase = "rising";
  cell.t = 0;
  cell.stay = stay;
  refreshActive();
}

function burst(pool: Particle[], next: "gold" | "red", x: number, y: number, z: number, n: number, speed: number): void {
  for (let k = 0; k < n; k += 1) {
    let i: number;
    if (next === "gold") {
      i = goldNext;
      goldNext = (goldNext + 1) % pool.length;
    } else {
      i = redNext;
      redNext = (redNext + 1) % pool.length;
    }
    const p = pool[i];
    if (p === undefined) continue;
    const a = fxRng() * Math.PI * 2;
    const s = speed * (0.4 + fxRng() * 0.8);
    p.pos = [x, y, z];
    p.vel = [Math.cos(a) * s, 2.2 + fxRng() * 2.6, Math.sin(a) * s];
    p.maxLife = 0.55 + fxRng() * 0.35;
    p.life = p.maxLife;
    p.node.setVisible(true);
    p.node.setPosition(x, y, z);
  }
}

function heightOf(c: Cell): number {
  switch (c.phase) {
    case "rising":
      return Math.min(1, c.t / RISE_TIME);
    case "up":
      return 1;
    case "falling":
      return Math.max(0, 1 - c.t / FALL_TIME);
    default:
      return 0;
  }
}

const yOf = (h: number): number => Y_LOW + (1 - (1 - h) * (1 - h)) * (Y_HIGH - Y_LOW);

function missAt(i: number): void {
  state.score = Math.max(0, state.score - 5);
  missCell = i;
  missTimer = 0.35;
  burst(redPool, "red", cellX(i), 0.15, cellZ(i), 6, 1.4);
  toast("-5");
  syncHud();
}

function popAt(i: number): void {
  const c = cells[i];
  if (c === undefined) return;
  const x = cellX(i);
  const z = cellZ(i);
  const y = yOf(heightOf(c)) + 0.1;
  if (c.kind === "bomb") {
    burst(redPool, "red", x, y, z, POOL_SIZE, 3.2);
    missCell = i;
    missTimer = 0.6;
    c.phase = "falling";
    c.t = FALL_TIME;
    refreshActive();
    endRound("lost", "You hit a bomb!");
    return;
  }
  state.score += 10;
  burst(goldPool, "gold", x, y, z, 20, 2.6);
  c.phase = "down";
  c.t = 0;
  refreshActive();
  toast("+10");
  syncHud();
}

// ---------------------------------------------------------------- picking
function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}
function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

const camForward = norm(sub(CAM_TARGET, CAM_POS));
const camRight = norm(cross(camForward, [0, 1, 0]));
const camUp = cross(camRight, camForward);

function pickRay(clientX: number, clientY: number): Vec3 {
  const rect = canvas.getBoundingClientRect();
  const w = rect.width || 640;
  const h = rect.height || 360;
  const nx = ((clientX - rect.left) / w) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / h) * 2;
  const th = Math.tan((CAM_FOV * Math.PI) / 360);
  const aspect = w / h;
  return norm([
    camForward[0] + camRight[0] * nx * th * aspect + camUp[0] * ny * th,
    camForward[1] + camRight[1] * nx * th * aspect + camUp[1] * ny * th,
    camForward[2] + camRight[2] * nx * th * aspect + camUp[2] * ny * th
  ]);
}

/** Returns the cell index under the pointer, or -1. Raised objects win over the floor. */
function pickCell(clientX: number, clientY: number): number {
  const dir = pickRay(clientX, clientY);
  let best = -1;
  let bestT = Infinity;
  cells.forEach((c, i) => {
    const h = heightOf(c);
    if (h < 0.25) return;
    const center: Vec3 = [cellX(i), yOf(h) + 0.1, cellZ(i)];
    const oc = sub(CAM_POS, center);
    const b = dot(oc, dir);
    const cc = dot(oc, oc) - HIT_RADIUS * HIT_RADIUS;
    const disc = b * b - cc;
    if (disc < 0) return;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < bestT) {
      bestT = t;
      best = i;
    }
  });
  if (best >= 0) return best;
  if (dir[1] >= -1e-6) return -1;
  const t = -CAM_POS[1] / dir[1];
  const px = CAM_POS[0] + dir[0] * t;
  const pz = CAM_POS[2] + dir[2] * t;
  for (let i = 0; i < 9; i += 1) {
    if (Math.abs(px - cellX(i)) <= CELL_HALF && Math.abs(pz - cellZ(i)) <= CELL_HALF) return i;
  }
  return -1;
}

function handlePointerDown(clientX: number, clientY: number): void {
  hoverCell = pickCell(clientX, clientY);
  if (state.status !== "playing" || hoverCell < 0) return;
  const c = cells[hoverCell];
  if (c === undefined) return;
  if (c.phase === "rising" || c.phase === "up") popAt(hoverCell);
  else missAt(hoverCell);
}

canvas.style.touchAction = "none";
canvas.addEventListener("pointermove", (e) => {
  hoverCell = pickCell(e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => {
  hoverCell = -1;
});
canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  handlePointerDown(e.clientX, e.clientY);
});

actionBtn.addEventListener("click", () => {
  if (state.status !== "playing") startRound();
});
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Enter" && state.status === "ready") startRound();
  else if (e.key === "r" || e.key === "R") startRound();
});

// ---------------------------------------------------------------- frame update
function updateParticles(pool: Particle[], dt: number): void {
  for (const p of pool) {
    if (p.life <= 0) continue;
    p.life -= dt;
    if (p.life <= 0) {
      p.node.setVisible(false);
      p.node.setPosition(0, -30, 0);
      continue;
    }
    p.vel[1] -= 9 * dt;
    p.pos[0] += p.vel[0] * dt;
    p.pos[1] += p.vel[1] * dt;
    p.pos[2] += p.vel[2] * dt;
    p.node.setPosition(p.pos[0], p.pos[1], p.pos[2]);
    p.node.setScale(Math.max(0.05, p.life / p.maxLife));
  }
}

function update(dt: number): void {
  elapsed += dt;
  const playing = state.status === "playing";

  if (playing) {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    spawnTimer -= dt;
    if (spawnTimer <= 0) spawn();
  }

  let changed = false;
  for (const c of cells) {
    if (c.phase === "down") continue;
    c.t += dt;
    if (c.phase === "rising" && c.t >= RISE_TIME) {
      c.phase = "up";
      c.t = 0;
    } else if (c.phase === "up" && c.t >= c.stay) {
      c.phase = "falling";
      c.t = 0;
      changed = true;
    } else if (c.phase === "falling" && c.t >= FALL_TIME) {
      c.phase = "down";
      c.t = 0;
    }
  }
  if (changed) refreshActive();

  if (playing && state.timeLeft <= 0) {
    state.timeLeft = 0;
    endRound(state.score >= WIN_SCORE ? "won" : "lost", state.score >= WIN_SCORE ? "Time is up." : "Time is up, but you needed 150 points.");
  }

  // cell visuals
  cells.forEach((c, i) => {
    const h = heightOf(c);
    const show = h > 0.01;
    const y = yOf(h);
    const x = cellX(i);
    const z = cellZ(i);
    const kindNow: Kind | null = show ? c.kind : null;
    if (kindNow !== c.shownKind) {
      for (const part of c.parts.lantern) part.node.setVisible(kindNow === "lantern");
      for (const part of c.parts.bomb) part.node.setVisible(kindNow === "bomb");
      c.shownKind = kindNow;
    }
    if (kindNow === null) return;
    const parts = kindNow === "lantern" ? c.parts.lantern : c.parts.bomb;
    for (const part of parts) part.node.setPosition(x, y + part.dy, z);
    if (kindNow === "bomb") {
      const spark = c.parts.bomb[2];
      if (spark !== undefined) spark.node.setScale(0.8 + 0.5 * Math.abs(Math.sin(elapsed * 14)));
    }
  });

  // hover + miss markers
  if (hoverNode !== null) {
    if (hoverCell >= 0) {
      hoverNode.setVisible(true);
      hoverNode.setPosition(cellX(hoverCell), 0.006, cellZ(hoverCell));
    } else {
      hoverNode.setVisible(false);
    }
  }
  if (missNode !== null) {
    if (missTimer > 0 && missCell >= 0) {
      missTimer -= dt;
      missNode.setVisible(true);
      missNode.setPosition(cellX(missCell), 0.016, cellZ(missCell));
      missNode.setScale([1 + (0.35 - Math.min(0.35, missTimer)) * 0.8, 1, 1 + (0.35 - Math.min(0.35, missTimer)) * 0.8]);
    } else {
      missNode.setVisible(false);
    }
  }

  updateParticles(goldPool, dt);
  updateParticles(redPool, dt);

  if (toastTimer > 0) {
    toastTimer -= dt;
    if (toastTimer <= 0) {
      toastEl.textContent = "";
      toastEl.style.color = "#ff6b7a";
    }
  }
  syncHud();
}

// ---------------------------------------------------------------- boot
function bind(): void {
  cells = [];
  for (let i = 0; i < 9; i += 1) {
    cells.push({
      kind: "lantern",
      phase: "down",
      t: 0,
      stay: 1,
      shownKind: null,
      parts: {
        lantern: lanternParts(i).map((p) => ({ node: app.nodes.require(p.id), dy: p.dy })),
        bomb: bombParts(i).map((p) => ({ node: app.nodes.require(p.id), dy: p.dy }))
      }
    });
  }
  const makePool = (prefix: string): Particle[] => {
    const pool: Particle[] = [];
    for (let p = 0; p < POOL_SIZE; p += 1) {
      pool.push({ node: app.nodes.require(`${prefix}-${p}`), pos: [0, -30, 0], vel: [0, 0, 0], life: 0, maxLife: 1 });
    }
    return pool;
  };
  goldPool = makePool("gold");
  redPool = makePool("red");
  hoverNode = app.nodes.require("hover");
  missNode = app.nodes.require("miss");
  for (const c of cells) {
    for (const part of [...c.parts.lantern, ...c.parts.bomb]) part.node.setVisible(false);
  }
  for (const p of [...goldPool, ...redPool]) p.node.setVisible(false);
  hoverNode.setVisible(false);
  missNode.setVisible(false);
}

showOverlay();
syncHud();

let last = performance.now();
let bound = false;
app.onFrame(() => {
  const now = performance.now();
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!bound) return;
  update(dt);
});

void app
  .ready()
  .then(() => {
    bind();
    bound = true;
    last = performance.now();
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.__TASK_READY__ = true;
      });
    });
  })
  .catch((error: unknown) => {
    console.error("Aura3D app failed to become ready", error);
  });
