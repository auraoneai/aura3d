import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  lights,
  material,
  primitives,
  scene
} from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
type Kind = "lantern" | "bomb";

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
  }
}

// ---------------------------------------------------------------- constants
const ROUND_SECONDS = 45;
const WIN_SCORE = 150;
const SPACING = 2.1;
const PED_TOP = 0.3;
const HIDDEN_OFFSET = -1.0; // lantern group offset (relative to pedestal top) when lowered
const RISE_SECONDS = 0.18;
const FALL_SECONDS = 0.18;
const BURST_SECONDS = 0.6;
const MISS_SECONDS = 0.35;
const PARTICLES = 8;
const CAM_POS: readonly [number, number, number] = [0, 7.4, 7.0];
const CAM_TARGET: readonly [number, number, number] = [0, 0.3, 0.1];
const CAM_FOV = 34;
const VIEW_W = 640;
const VIEW_H = 360;

const cellX = (i: number): number => ((i % 3) - 1) * SPACING;
const cellZ = (i: number): number => (Math.floor(i / 3) - 1) * SPACING;
const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8];

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
function readSeed(): number {
  const raw = new URLSearchParams(window.location.search).get("seed");
  const n = raw === null ? NaN : Number(raw);
  return Number.isFinite(n) ? Math.floor(n) : 20240611;
}
const SEED = readSeed();

// ---------------------------------------------------------------- scene
const lanternMat = material.emissive({ color: "#ffb938", emissive: "#ff9a1f", emissiveIntensity: 2.6, roughness: 0.35 });
const lanternGlow = material.emissive({ color: "#fff1b0", emissive: "#fff1b0", emissiveIntensity: 3.2, roughness: 0.3 });
const brass = material.pbr({ color: "#5a3d1c", metallic: 0.6, roughness: 0.45 });
const bombMat = material.pbr({ color: "#2b1d3f", metallic: 0.2, roughness: 0.35 });
const bombSpark = material.emissive({ color: "#ff3b3b", emissive: "#ff2020", emissiveIntensity: 3.5, roughness: 0.3 });
const bombBand = material.emissive({ color: "#9b4dff", emissive: "#8a3dff", emissiveIntensity: 1.6, roughness: 0.4 });

function lanternNode(i: number) {
  return group(
    `lantern-${i}`,
    [
      primitives.cylinder({ name: `lantern-base-${i}`, size: [0.5, 0.1, 0.5], material: brass }).position(0, 0.05, 0),
      primitives.sphere({ name: `lantern-body-${i}`, size: [0.62, 0.78, 0.62], material: lanternMat }).position(0, 0.5, 0),
      primitives.sphere({ name: `lantern-core-${i}`, size: [0.3, 0.4, 0.3], material: lanternGlow }).position(0, 0.5, 0),
      primitives.cylinder({ name: `lantern-cap-${i}`, size: [0.44, 0.1, 0.44], material: brass }).position(0, 0.92, 0),
      primitives.torus({ name: `lantern-ring-${i}`, size: 0.2, material: brass }).position(0, 1.05, 0)
    ],
    { position: [cellX(i), PED_TOP + HIDDEN_OFFSET, cellZ(i)] }
  ).runtime({ id: `lantern-${i}`, mutable: true });
}

function bombNode(i: number) {
  return group(
    `bomb-${i}`,
    [
      primitives.sphere({ name: `bomb-body-${i}`, size: 0.8, material: bombMat }).position(0, 0.42, 0),
      primitives.cylinder({ name: `bomb-band-${i}`, size: [0.84, 0.08, 0.84], material: bombBand }).position(0, 0.42, 0),
      primitives.cylinder({ name: `bomb-neck-${i}`, size: [0.22, 0.14, 0.22], material: brass }).position(0, 0.85, 0),
      primitives.sphere({ name: `bomb-spark-${i}`, size: 0.2, material: bombSpark }).position(0, 1.02, 0)
    ],
    { position: [cellX(i), PED_TOP + HIDDEN_OFFSET, cellZ(i)] }
  ).runtime({ id: `bomb-${i}`, mutable: true });
}

function buildScene() {
  const s = scene({ background: "#0a0e1c" })
    .add(environments.neutral({ intensity: 0.55, background: false }))
    .add(lights.directional({ name: "key", position: [3, 8, 4], target: [0, 0, 0], intensity: 1.6, color: "#cfd8ff", shadow: true }))
    .add(lights.directional({ name: "fill", position: [-5, 4, 3], target: [0, 0, 0], intensity: 0.6, color: "#8fa6ff" }))
    .add(
      primitives.cylinder({
        name: "floor",
        size: [14, 0.2, 14],
        material: material.pbr({ color: "#141a2e", roughness: 0.8 }),
        castShadow: false
      }).position(0, -0.1, 0)
    )
    .add(effects.bloom({ intensity: 0.7, threshold: 0.75, radius: 0.5 }));

  for (const i of cells) {
    const x = cellX(i);
    const z = cellZ(i);
    s.add(
      primitives.cylinder({
        name: `pedestal-${i}`,
        size: [1.5, PED_TOP, 1.5],
        material: material.pbr({ color: "#3a4263", roughness: 0.55, metallic: 0.2 })
      }).position(x, PED_TOP / 2, z)
    );
    s.add(
      primitives.cylinder({
        name: `hover-${i}`,
        size: [1.42, 0.02, 1.42],
        material: material.emissive({ color: "#4fd8ff", emissive: "#4fd8ff", emissiveIntensity: 2.2, roughness: 0.4 }),
        castShadow: false
      }).position(x, 0.31, z).runtime({ id: `hover-${i}`, mutable: true })
    );
    s.add(
      primitives.cylinder({
        name: `hole-${i}`,
        size: [1.0, 0.02, 1.0],
        material: material.pbr({ color: "#04050a", roughness: 1 }),
        castShadow: false
      }).position(x, 0.325, z)
    );
    s.add(lanternNode(i));
    s.add(bombNode(i));
    s.add(
      primitives.cylinder({
        name: `miss-${i}`,
        size: [1.5, 0.02, 1.5],
        material: material.emissive({ color: "#ff3040", emissive: "#ff2030", emissiveIntensity: 3, roughness: 0.4 }),
        castShadow: false
      }).position(x, 0.345, z).runtime({ id: `miss-${i}`, mutable: true })
    );
    s.add(
      primitives.cylinder({
        name: `ring-${i}`,
        size: [1, 0.02, 1],
        material: material.emissive({ color: "#ffe28a", emissive: "#ffd15a", emissiveIntensity: 3.5, roughness: 0.4 }),
        castShadow: false
      }).position(x, 0.36, z).runtime({ id: `ring-${i}`, mutable: true })
    );
    for (let k = 0; k < PARTICLES; k++) {
      s.add(
        primitives.sphere({
          name: `spark-${i}-${k}`,
          size: 0.16,
          material: material.emissive({ color: "#ffd15a", emissive: "#ffc23a", emissiveIntensity: 4, roughness: 0.3 }),
          castShadow: false
        }).position(x, PED_TOP, z).runtime({ id: `spark-${i}-${k}`, mutable: true })
      );
    }
  }

  return s.camera(camera.perspective({ position: [...CAM_POS], target: [...CAM_TARGET], fov: CAM_FOV }));
}

// ---------------------------------------------------------------- DOM
const canvas = document.getElementById("app") as HTMLCanvasElement;

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText =
  "width:640px;box-sizing:border-box;display:flex;gap:16px;align-items:center;padding:6px 12px;background:#10142a;color:#e8ecff;font:600 14px/1.4 system-ui,sans-serif;";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span>' +
  '<span>Time: <b id="hud-time">45.0</b></span>' +
  '<span>Status: <b id="hud-status">ready</b></span>' +
  '<span id="hud-msg" style="margin-left:auto;min-width:60px;text-align:right"></span>';
canvas.insertAdjacentElement("afterend", hud);

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;background:rgba(6,8,20,0.72);color:#fff;font:600 16px/1.4 system-ui,sans-serif;text-align:center;";
overlay.innerHTML =
  '<div id="overlay-title" style="font-size:28px;font-weight:800">Lantern Pop</div>' +
  '<div id="overlay-text" style="max-width:480px;font-weight:500">Click raised lanterns for +10. Avoid bombs and empty cells (-5). Score 150 in 45 seconds to win.</div>' +
  '<button id="start-btn" type="button" style="font:700 16px system-ui,sans-serif;padding:8px 22px;border-radius:6px;border:0;background:#ffb938;color:#222;cursor:pointer">Start (Enter)</button>' +
  '<button id="restart-btn" type="button" style="display:none;font:700 16px system-ui,sans-serif;padding:8px 22px;border-radius:6px;border:0;background:#4fd8ff;color:#112;cursor:pointer">Restart (R)</button>';
document.body.appendChild(overlay);

const elScore = document.getElementById("hud-score") as HTMLElement;
const elTime = document.getElementById("hud-time") as HTMLElement;
const elStatus = document.getElementById("hud-status") as HTMLElement;
const elMsg = document.getElementById("hud-msg") as HTMLElement;
const elTitle = document.getElementById("overlay-title") as HTMLElement;
const elText = document.getElementById("overlay-text") as HTMLElement;
const startBtn = document.getElementById("start-btn") as HTMLButtonElement;
const restartBtn = document.getElementById("restart-btn") as HTMLButtonElement;

// ---------------------------------------------------------------- game state
interface Target {
  cell: number;
  kind: Kind;
  age: number;
  dur: number;
  phase: "up" | "down";
  downT: number;
}

const state: TaskState = { status: "ready", score: 0, timeLeft: ROUND_SECONDS, activeCells: [] };
window.__TASK_STATE__ = state;
window.__TASK_READY__ = false;

let rng = mulberry32(SEED);
const targets = new Map<number, Target>();
let spawnTimer = 0.6;
let spawnCount = 0;
let hoverCell = -1;
let msgTimer = 0;
const burstT: number[] = cells.map(() => -1);
const missT: number[] = cells.map(() => -1);
const burstDirs: { vx: number; vz: number; vy: number }[][] = cells.map(() =>
  Array.from({ length: PARTICLES }, (_, k) => {
    const a = (k / PARTICLES) * Math.PI * 2;
    return { vx: Math.cos(a) * 2.2, vz: Math.sin(a) * 2.2, vy: 3 + (k % 2) * 1.2 };
  })
);

type Handle = ReturnType<ReturnType<typeof createAuraApp>["nodes"]["require"]>;
interface Nodes {
  lantern: Handle[];
  bomb: Handle[];
  hover: Handle[];
  miss: Handle[];
  ring: Handle[];
  spark: Handle[][];
}
let nodes: Nodes | null = null;
const shown = {
  lantern: cells.map(() => false),
  bomb: cells.map(() => false),
  hover: cells.map(() => false),
  miss: cells.map(() => false),
  ring: cells.map(() => false),
  spark: cells.map(() => false)
};

function setStatus(status: Status): void {
  state.status = status;
}

function startRound(): void {
  rng = mulberry32(SEED);
  targets.clear();
  state.score = 0;
  state.timeLeft = ROUND_SECONDS;
  state.activeCells = [];
  spawnTimer = 0.6;
  spawnCount = 0;
  msgTimer = 0;
  elMsg.textContent = "";
  setStatus("playing");
  overlay.style.display = "none";
}

function endRound(status: "won" | "lost", reason: string): void {
  setStatus(status);
  state.activeCells = [];
  targets.clear();
  elTitle.textContent = status === "won" ? "You win!" : "You lose";
  elText.textContent = `${reason} Final score: ${state.score}.`;
  startBtn.style.display = "none";
  restartBtn.style.display = "inline-block";
  overlay.style.display = "flex";
}

function say(text: string, color: string): void {
  elMsg.textContent = text;
  elMsg.style.color = color;
  msgTimer = 0.8;
}

function difficulty(): { dur: number; gap: number; maxActive: number } {
  const s = state.score;
  return {
    dur: Math.max(0.5, 1.5 - s * 0.006),
    gap: Math.max(0.3, 0.75 - s * 0.003),
    maxActive: s >= 60 ? 2 : 1
  };
}

function spawn(): void {
  const d = difficulty();
  const free = cells.filter((c) => !targets.has(c));
  // Fixed order of draws per spawn keeps a seed's spawn sequence repeatable.
  const rCell = rng();
  const rKind = rng();
  const rGap = rng();
  if (free.length > 0) {
    const cell = free[Math.floor(rCell * free.length) % free.length] as number;
    const kind: Kind = spawnCount >= 2 && rKind < 0.14 ? "bomb" : "lantern";
    targets.set(cell, { cell, kind, age: 0, dur: kind === "bomb" ? d.dur + 0.2 : d.dur, phase: "up", downT: 0 });
    spawnCount++;
  }
  spawnTimer = d.gap + rGap * 0.35;
}

function triggerBurst(cell: number): void {
  burstT[cell] = 0;
}

function onCellClick(cell: number): void {
  if (state.status !== "playing") return;
  const t = targets.get(cell);
  if (t && t.phase === "up") {
    if (t.kind === "bomb") {
      triggerBurst(cell);
      missT[cell] = 0;
      targets.delete(cell);
      say("BOOM", "#ff5566");
      endRound("lost", "You hit a bomb.");
      return;
    }
    state.score += 10;
    targets.delete(cell);
    triggerBurst(cell);
    say("+10", "#ffd15a");
  } else {
    state.score = Math.max(0, state.score - 5);
    missT[cell] = 0;
    say("-5", "#ff5566");
  }
  refreshActive();
}

function refreshActive(): void {
  const list: number[] = [];
  for (const t of targets.values()) if (t.phase === "up") list.push(t.cell);
  list.sort((a, b) => a - b);
  state.activeCells = list;
}

// ---------------------------------------------------------------- picking
function pickCell(clientX: number, clientY: number): number {
  const rect = canvas.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return -1;
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  if (nx < -1 || nx > 1 || ny < -1 || ny > 1) return -1;

  const f = norm(sub(CAM_TARGET, CAM_POS));
  const r = norm(cross(f, [0, 1, 0]));
  const u = cross(r, f);
  const tanH = Math.tan((CAM_FOV * Math.PI) / 360);
  const aspect = VIEW_W / VIEW_H;
  const dir = norm([
    f[0] + r[0] * nx * tanH * aspect + u[0] * ny * tanH,
    f[1] + r[1] * nx * tanH * aspect + u[1] * ny * tanH,
    f[2] + r[2] * nx * tanH * aspect + u[2] * ny * tanH
  ]);

  // Raised objects: ray vs. a sphere around the object, so clicking the
  // lantern itself works even where it overlaps a neighbouring cell on screen.
  let best = -1;
  let bestDist = Infinity;
  for (const t of targets.values()) {
    if (t.phase !== "up") continue;
    const c: [number, number, number] = [cellX(t.cell), PED_TOP + 0.55, cellZ(t.cell)];
    const oc = sub(CAM_POS, c);
    const b = dot(oc, dir);
    const disc = b * b - (dot(oc, oc) - 0.62 * 0.62);
    if (disc >= 0) {
      const dist = -b - Math.sqrt(disc);
      if (dist > 0 && dist < bestDist) {
        bestDist = dist;
        best = t.cell;
      }
    }
  }
  if (best >= 0) return best;

  // Otherwise intersect the pedestal-top plane and take the square cell.
  if (dir[1] >= -1e-6) return -1;
  const tp = (PED_TOP - CAM_POS[1]) / dir[1];
  const px = CAM_POS[0] + dir[0] * tp;
  const pz = CAM_POS[2] + dir[2] * tp;
  const col = Math.floor((px + SPACING * 1.5) / SPACING);
  const row = Math.floor((pz + SPACING * 1.5) / SPACING);
  if (col < 0 || col > 2 || row < 0 || row > 2) return -1;
  return row * 3 + col;
}

type V3 = [number, number, number];
function sub(a: readonly number[], b: readonly number[]): V3 {
  return [(a[0] ?? 0) - (b[0] ?? 0), (a[1] ?? 0) - (b[1] ?? 0), (a[2] ?? 0) - (b[2] ?? 0)];
}
function dot(a: readonly number[], b: readonly number[]): number {
  return (a[0] ?? 0) * (b[0] ?? 0) + (a[1] ?? 0) * (b[1] ?? 0) + (a[2] ?? 0) * (b[2] ?? 0);
}
function cross(a: readonly number[], b: readonly number[]): V3 {
  const [ax, ay, az] = [a[0] ?? 0, a[1] ?? 0, a[2] ?? 0];
  const [bx, by, bz] = [b[0] ?? 0, b[1] ?? 0, b[2] ?? 0];
  return [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx];
}
function norm(a: readonly number[]): V3 {
  const l = Math.hypot(a[0] ?? 0, a[1] ?? 0, a[2] ?? 0) || 1;
  return [(a[0] ?? 0) / l, (a[1] ?? 0) / l, (a[2] ?? 0) / l];
}

// ---------------------------------------------------------------- input
canvas.addEventListener("pointermove", (e) => {
  hoverCell = pickCell(e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => {
  hoverCell = -1;
});
canvas.addEventListener("pointerdown", (e) => {
  const cell = pickCell(e.clientX, e.clientY);
  hoverCell = cell;
  if (cell >= 0) onCellClick(cell);
  e.preventDefault();
});
startBtn.addEventListener("click", () => {
  if (state.status === "ready") startRound();
});
restartBtn.addEventListener("click", () => startRound());
window.addEventListener("keydown", (e) => {
  if (e.repeat) return;
  if (e.key === "Enter") {
    if (state.status === "ready") startRound();
  } else if (e.key === "r" || e.key === "R") {
    startRound();
  }
});

// ---------------------------------------------------------------- per-frame
function show(kind: keyof typeof shown, i: number, handle: Handle, v: boolean): void {
  const arr = shown[kind];
  if (arr[i] !== v) {
    arr[i] = v;
    handle.setVisible(v);
  }
}

function update(dt: number): void {
  if (state.status === "playing") {
    state.timeLeft = Math.max(0, state.timeLeft - dt);
    for (const t of Array.from(targets.values())) {
      if (t.phase === "up") {
        t.age += dt;
        if (t.age >= t.dur) {
          t.phase = "down";
          t.downT = 0;
        }
      } else {
        t.downT += dt;
        if (t.downT >= FALL_SECONDS) targets.delete(t.cell);
      }
    }
    spawnTimer -= dt;
    let activeCount = 0;
    for (const t of targets.values()) if (t.phase === "up") activeCount++;
    if (spawnTimer <= 0 && activeCount < difficulty().maxActive) spawn();
    refreshActive();
    if (state.timeLeft <= 0) {
      state.timeLeft = 0;
      endRound(state.score >= WIN_SCORE ? "won" : "lost", state.score >= WIN_SCORE ? "Time is up." : "Time is up, under 150 points.");
    }
  }

  if (msgTimer > 0) {
    msgTimer -= dt;
    if (msgTimer <= 0) elMsg.textContent = "";
  }

  if (nodes) {
    for (const i of cells) {
      const t = targets.get(i);
      let off = HIDDEN_OFFSET;
      if (t) {
        if (t.phase === "up") {
          const k = Math.min(1, t.age / RISE_SECONDS);
          off = HIDDEN_OFFSET * (1 - k * (2 - k)); // ease-out rise
        } else {
          off = HIDDEN_OFFSET * Math.min(1, t.downT / FALL_SECONDS);
        }
      }
      const visibleNow = !!t && off > HIDDEN_OFFSET + 0.02;
      const lanternH = nodes.lantern[i] as Handle;
      const bombH = nodes.bomb[i] as Handle;
      const showL = visibleNow && t?.kind === "lantern";
      const showB = visibleNow && t?.kind === "bomb";
      show("lantern", i, lanternH, showL);
      show("bomb", i, bombH, showB);
      if (showL) lanternH.setPosition(cellX(i), PED_TOP + off, cellZ(i));
      if (showB) {
        bombH.setPosition(cellX(i), PED_TOP + off, cellZ(i));
      }

      // Hover highlight.
      show("hover", i, nodes.hover[i] as Handle, hoverCell === i && state.status === "playing");

      // Miss flash.
      const missH = nodes.miss[i] as Handle;
      if ((missT[i] as number) >= 0) {
        missT[i] = (missT[i] as number) + dt;
        const k = (missT[i] as number) / MISS_SECONDS;
        if (k >= 1) {
          missT[i] = -1;
          show("miss", i, missH, false);
        } else {
          show("miss", i, missH, true);
          missH.setScale(1.08 - 0.2 * k);
        }
      }

      // Pop burst: expanding ring + sparks.
      const ringH = nodes.ring[i] as Handle;
      const sparks = nodes.spark[i] as Handle[];
      if ((burstT[i] as number) >= 0) {
        burstT[i] = (burstT[i] as number) + dt;
        const bt = burstT[i] as number;
        if (bt >= BURST_SECONDS) {
          burstT[i] = -1;
          show("ring", i, ringH, false);
          show("spark", i, sparks[0] as Handle, false);
          for (const sp of sparks) sp.setVisible(false);
        } else {
          show("ring", i, ringH, true);
          ringH.setScale(0.5 + (bt / BURST_SECONDS) * 1.6);
          shown.spark[i] = true;
          const dirs = burstDirs[i] as { vx: number; vz: number; vy: number }[];
          for (let k = 0; k < PARTICLES; k++) {
            const d = dirs[k] as { vx: number; vz: number; vy: number };
            const sp = sparks[k] as Handle;
            sp.setVisible(true);
            sp.setPosition(
              cellX(i) + d.vx * bt,
              PED_TOP + 0.5 + d.vy * bt - 5 * bt * bt,
              cellZ(i) + d.vz * bt
            );
          }
        }
      }
    }
  }

  elScore.textContent = String(state.score);
  elTime.textContent = state.timeLeft.toFixed(1);
  elStatus.textContent = state.status;
  document.body.dataset.status = state.status;
}

// ---------------------------------------------------------------- boot
async function boot(): Promise<void> {
  const app = createAuraApp("#app", { scene: buildScene() });
  await app.ready();
  nodes = {
    lantern: cells.map((i) => app.nodes.require(`lantern-${i}`)),
    bomb: cells.map((i) => app.nodes.require(`bomb-${i}`)),
    hover: cells.map((i) => app.nodes.require(`hover-${i}`)),
    miss: cells.map((i) => app.nodes.require(`miss-${i}`)),
    ring: cells.map((i) => app.nodes.require(`ring-${i}`)),
    spark: cells.map((i) => Array.from({ length: PARTICLES }, (_, k) => app.nodes.require(`spark-${i}-${k}`)))
  };
  for (const i of cells) {
    (nodes.lantern[i] as Handle).setVisible(false);
    (nodes.bomb[i] as Handle).setVisible(false);
    (nodes.hover[i] as Handle).setVisible(false);
    (nodes.miss[i] as Handle).setVisible(false);
    (nodes.ring[i] as Handle).setVisible(false);
    for (const sp of nodes.spark[i] as Handle[]) sp.setVisible(false);
  }

  let last = performance.now();
  let first = true;
  const loop = (now: number): void => {
    const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
    last = now;
    update(dt);
    if (first) {
      first = false;
      window.__TASK_READY__ = true;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

void boot().catch((error: unknown) => {
  document.body.dataset.error = error instanceof Error ? error.message : String(error);
  console.error(error);
});
