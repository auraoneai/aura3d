import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
type Kind = "none" | "lantern" | "bomb";
type V3 = [number, number, number];

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; timeLeft: number; activeCells: number[] };
    __TASK_READY__?: boolean;
  }
}

const ROUND_TIME = 45;
const WIN_SCORE = 150;
const SPACING = 2.4;
const RAISED_Y = 0.8;
const LOWERED_Y = -0.7;
const HIDDEN_Y = -6;
const PARTICLES = 14;

// ---------- camera (kept in sync with the scene's camera for picking) ----------
const CAM_POS: V3 = [0, 8.5, 7];
const CAM_TARGET: V3 = [0, 0, 0.3];
const CAM_FOV = 45;
const W = 640;
const H = 360;

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((CAM_FOV * Math.PI) / 360);

function rayAt(px: number, py: number): V3 {
  const nx = (px / W) * 2 - 1;
  const ny = 1 - (py / H) * 2;
  const sx = nx * tanHalf * (W / H);
  const sy = ny * tanHalf;
  return norm([fwd[0] + right[0] * sx + up[0] * sy, fwd[1] + right[1] * sx + up[1] * sy, fwd[2] + right[2] * sx + up[2] * sy]);
}

const cellPos = (i: number): [number, number] => [((i % 3) - 1) * SPACING, (Math.floor(i / 3) - 1) * SPACING];

// ---------- seeded random ----------
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
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam : 20240607;

// ---------- materials ----------
const stone = material.pbr({ color: "#5b6070", roughness: 0.85 });
const holeMat = material.pbr({ color: "#07080c", roughness: 1 });
const groundMat = material.pbr({ color: "#1b2236", roughness: 1 });
const lanternMat = material.emissive({ color: "#ffb02e", emissive: "#ffa010", emissiveIntensity: 2.2 });
const capMat = material.pbr({ color: "#3a2a18", roughness: 0.6, metallic: 0.4 });
const bombMat = material.pbr({ color: "#16171c", roughness: 0.4, metallic: 0.5 });
const bombGlow = material.emissive({ color: "#ff2a2a", emissive: "#ff1010", emissiveIntensity: 2.5 });
const hoverMat = material.emissive({ color: "#46e6ff", emissive: "#2fd8ff", emissiveIntensity: 1.8 });
const missMat = material.emissive({ color: "#ff3b3b", emissive: "#ff2020", emissiveIntensity: 2.2 });
const goldMat = material.emissive({ color: "#ffe27a", emissive: "#ffd34a", emissiveIntensity: 3 });
const boomMat = material.emissive({ color: "#ff6a30", emissive: "#ff4a10", emissiveIntensity: 3 });

// ---------- scene ----------
let sc = scene({ background: "#0a0e1a" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 0.5, far: 100 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#8fa8ff", groundColor: "#1a1f30", intensity: 0.8 }))
  .add(lights.directional({ position: [4, 10, 5], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .add(effects.bloom({ intensity: 0.6, threshold: 0.75, radius: 0.6 }))
  .add(primitives.plane({ name: "ground", size: [24, 1, 24], material: groundMat }));

for (let i = 0; i < 9; i += 1) {
  const [x, z] = cellPos(i);
  sc = sc
    .add(primitives.cylinder({ name: `ped-${i}`, size: [1.9, 0.3, 1.9], material: stone }).position(x, 0.15, z))
    .add(primitives.cylinder({ name: `hole-${i}`, size: [1.35, 0.02, 1.35], material: holeMat, castShadow: false }).position(x, 0.31, z))
    .add(
      group(
        `lantern-${i}`,
        [
          primitives.sphere({ name: `lantern-body-${i}`, size: 0.9, material: lanternMat, castShadow: false }),
          primitives.cylinder({ name: `lantern-cap-${i}`, size: [0.45, 0.14, 0.45], material: capMat }).position(0, 0.48, 0),
          primitives.cylinder({ name: `lantern-base-${i}`, size: [0.4, 0.12, 0.4], material: capMat }).position(0, -0.46, 0)
        ],
        { position: [x, HIDDEN_Y, z] }
      ).runtime({ id: `lantern-${i}`, mutable: true })
    )
    .add(
      group(
        `bomb-${i}`,
        [
          primitives.sphere({ name: `bomb-body-${i}`, size: 0.9, material: bombMat }),
          primitives.cylinder({ name: `bomb-fuse-${i}`, size: [0.12, 0.3, 0.12], material: capMat }).position(0, 0.55, 0),
          primitives.sphere({ name: `bomb-spark-${i}`, size: 0.22, material: bombGlow, castShadow: false }).position(0, 0.76, 0),
          primitives.box({ name: `bomb-band-${i}`, size: [0.95, 0.12, 0.2], material: bombGlow, castShadow: false })
        ],
        { position: [x, HIDDEN_Y, z] }
      ).runtime({ id: `bomb-${i}`, mutable: true })
    );
}

sc = sc
  .add(primitives.cylinder({ name: "hover", size: [2.25, 0.12, 2.25], material: hoverMat, castShadow: false }).position(0, HIDDEN_Y, 0).runtime({ id: "hover", mutable: true }))
  .add(primitives.cylinder({ name: "miss", size: [2.5, 0.14, 2.5], material: missMat, castShadow: false }).position(0, HIDDEN_Y, 0).runtime({ id: "miss", mutable: true }))
  .add(primitives.sphere({ name: "flash", size: 1, material: goldMat, castShadow: false }).position(0, HIDDEN_Y, 0).runtime({ id: "flash", mutable: true }));
for (let p = 0; p < PARTICLES; p += 1) {
  sc = sc.add(primitives.sphere({ name: `spark-${p}`, size: 0.2, material: goldMat, castShadow: false }).position(0, HIDDEN_Y, 0).runtime({ id: `spark-${p}`, mutable: true }));
}

const app = createAuraApp("#app", { scene: sc });

// ---------- DOM ----------
const el = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const canvas = el<HTMLCanvasElement>("app");
const hudScore = el("hud-score");
const hudTime = el("hud-time");
const hudStatus = el("hud-status");
const feedback = el("feedback");
const overlay = el("overlay");
const overlayTitle = el("overlay-title");
const overlayText = el("overlay-text");
const overlayButton = el<HTMLButtonElement>("overlay-button");

// ---------- game state ----------
interface Cell {
  kind: Kind;
  age: number;
  duration: number;
  shown: Kind;
  amount: number;
}
const cells: Cell[] = Array.from({ length: 9 }, () => ({ kind: "none" as Kind, age: 0, duration: 1, shown: "none" as Kind, amount: 0 }));
let rand = mulberry32(SEED);
let status: Status = "ready";
let score = 0;
let timeLeft = ROUND_TIME;
let spawnGap = 0.6;
let spawnCount = 0;
let hoverCell = -1;
let feedbackTimer = 0;

const fx = {
  flashT: 1,
  flashCell: 0,
  flashBig: 1.6,
  missT: 1,
  sparks: Array.from({ length: PARTICLES }, () => ({ life: 0, p: [0, 0, 0] as V3, v: [0, 0, 0] as V3 }))
};

function publish(): void {
  const active: number[] = [];
  cells.forEach((c, i) => {
    if (c.kind !== "none") active.push(i);
  });
  window.__TASK_STATE__ = { status, score, timeLeft, activeCells: active };
}

function say(text: string, color: string): void {
  feedback.textContent = text;
  feedback.style.color = color;
  feedbackTimer = 0.7;
}

function showOverlay(title: string, text: string, button: string): void {
  overlayTitle.textContent = title;
  overlayText.textContent = text;
  overlayButton.textContent = button;
  overlay.classList.remove("hidden");
}

function startRound(): void {
  rand = mulberry32(SEED);
  score = 0;
  timeLeft = ROUND_TIME;
  spawnGap = 0.6;
  spawnCount = 0;
  for (const c of cells) {
    c.kind = "none";
    c.age = 0;
  }
  status = "playing";
  overlay.classList.add("hidden");
  say("", "#fff");
  publish();
}

function endRound(result: "won" | "lost", reason: string): void {
  status = result;
  for (const c of cells) c.kind = "none";
  const title = result === "won" ? "You win!" : "You lose";
  showOverlay(title, `${reason} Final score: ${score}.`, "Restart");
  publish();
}

function currentDuration(): number {
  return Math.max(0.45, 1.5 - score * 0.0065);
}

function spawn(): void {
  const cell = Math.floor(rand() * 9);
  const bombRoll = rand();
  const gapRoll = rand();
  spawnCount += 1;
  const c = cells[cell]!;
  c.kind = spawnCount > 2 && bombRoll < 0.16 ? "bomb" : "lantern";
  c.shown = c.kind;
  c.age = 0;
  c.duration = currentDuration();
  spawnGap = 0.2 + gapRoll * 0.35;
}

// ---------- picking ----------
function hitSphere(o: V3, d: V3, c: V3, r: number): boolean {
  const oc: V3 = [o[0] - c[0], o[1] - c[1], o[2] - c[2]];
  const b = oc[0] * d[0] + oc[1] * d[1] + oc[2] * d[2];
  const cc = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2] - r * r;
  const disc = b * b - cc;
  return disc >= 0 && -b + Math.sqrt(disc) > 0;
}

function pickCell(px: number, py: number): number {
  const d = rayAt(px, py);
  for (let i = 0; i < 9; i += 1) {
    if (cells[i]!.kind === "none") continue;
    const [x, z] = cellPos(i);
    if (hitSphere(CAM_POS, d, [x, RAISED_Y, z], 0.62)) return i;
  }
  if (d[1] >= -1e-6) return -1;
  const t = -CAM_POS[1] / d[1];
  const gx = CAM_POS[0] + d[0] * t;
  const gz = CAM_POS[2] + d[2] * t;
  for (let i = 0; i < 9; i += 1) {
    const [x, z] = cellPos(i);
    if (Math.abs(gx - x) <= 1.15 && Math.abs(gz - z) <= 1.15) return i;
  }
  return -1;
}

function pointerCell(ev: PointerEvent): number {
  const r = canvas.getBoundingClientRect();
  const px = ((ev.clientX - r.left) / r.width) * W;
  const py = ((ev.clientY - r.top) / r.height) * H;
  if (px < 0 || py < 0 || px > W || py > H) return -1;
  return pickCell(px, py);
}

function burst(cell: number, color: "gold" | "boom"): void {
  const [x, z] = cellPos(cell);
  fx.flashT = 0;
  fx.flashCell = cell;
  fx.flashBig = color === "gold" ? 1.8 : 2.6;
  app.nodes.require("flash").setMaterial?.(color === "gold" ? goldMat : boomMat);
  for (const s of fx.sparks) {
    const a = Math.random() * Math.PI * 2;
    const sp = 1.5 + Math.random() * 2.5;
    s.life = 0.55 + Math.random() * 0.25;
    s.p = [x, RAISED_Y, z];
    s.v = [Math.cos(a) * sp, 2.5 + Math.random() * 2.5, Math.sin(a) * sp];
  }
}

function handleClick(ev: PointerEvent): void {
  if (status !== "playing") return;
  const i = pointerCell(ev);
  if (i < 0) return;
  const c = cells[i]!;
  if (c.kind === "lantern") {
    score += 10;
    c.kind = "none";
    burst(i, "gold");
    say("+10", "#ffd36b");
  } else if (c.kind === "bomb") {
    c.kind = "none";
    burst(i, "boom");
    endRound("lost", "You hit a bomb!");
    return;
  } else {
    score = Math.max(0, score - 5);
    fx.missT = 0;
    const [x, z] = cellPos(i);
    app.nodes.require("miss").setPosition(x, 0.1, z);
    say("-5", "#ff6060");
  }
  publish();
}

canvas.addEventListener("pointermove", (ev) => {
  hoverCell = pointerCell(ev);
});
canvas.addEventListener("pointerleave", () => {
  hoverCell = -1;
});
canvas.addEventListener("pointerdown", (ev) => {
  hoverCell = pointerCell(ev);
  handleClick(ev);
});
overlayButton.addEventListener("click", () => {
  if (status === "ready" || status === "won" || status === "lost") startRound();
});
window.addEventListener("keydown", (ev) => {
  if (ev.key === "Enter" && status === "ready") startRound();
  else if ((ev.key === "r" || ev.key === "R") && !ev.repeat) startRound();
});

// ---------- frame loop ----------
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);

  if (status === "playing") {
    timeLeft = Math.max(0, timeLeft - dt);
    let anyActive = false;
    for (const c of cells) {
      if (c.kind === "none") continue;
      c.age += dt;
      if (c.age >= c.duration) c.kind = "none";
      else anyActive = true;
    }
    if (!anyActive) {
      spawnGap -= dt;
      if (spawnGap <= 0) spawn();
    }
    if (timeLeft <= 0) {
      endRound(score >= WIN_SCORE ? "won" : "lost", score >= WIN_SCORE ? "Time is up." : "Time is up, not enough points.");
    }
  }

  // cell animation
  const t = performance.now() / 1000;
  for (let i = 0; i < 9; i += 1) {
    const c = cells[i]!;
    const target = c.kind === "none" ? 0 : 1;
    c.amount += Math.sign(target - c.amount) * Math.min(Math.abs(target - c.amount), dt / 0.14);
    if (c.amount <= 0 && c.kind === "none") c.shown = "none";
    const [x, z] = cellPos(i);
    const y = LOWERED_Y + (RAISED_Y - LOWERED_Y) * c.amount;
    const bob = c.amount >= 1 ? Math.sin(t * 6 + i) * 0.05 : 0;
    app.nodes.require(`lantern-${i}`).setPosition(x, c.shown === "lantern" ? y + bob : HIDDEN_Y, z);
    const bomb = app.nodes.require(`bomb-${i}`);
    bomb.setPosition(x, c.shown === "bomb" ? y + bob : HIDDEN_Y, z);
    if (c.shown === "bomb") bomb.setRotation(0, t * 2, 0);
  }

  // hover
  const hover = app.nodes.require("hover");
  if (hoverCell >= 0 && status !== "ready") {
    const [x, z] = cellPos(hoverCell);
    hover.setPosition(x, 0.08, z);
  } else if (hoverCell >= 0) {
    const [x, z] = cellPos(hoverCell);
    hover.setPosition(x, 0.08, z);
  } else {
    hover.setPosition(0, HIDDEN_Y, 0);
  }

  // miss flash
  const miss = app.nodes.require("miss");
  if (fx.missT < 1) {
    fx.missT += dt / 0.35;
    if (fx.missT >= 1) miss.setPosition(0, HIDDEN_Y, 0);
    else miss.setScale([1 + fx.missT * 0.1, 1, 1 + fx.missT * 0.1]);
  }

  // pop flash and sparks
  const flash = app.nodes.require("flash");
  if (fx.flashT < 1) {
    fx.flashT += dt / 0.3;
    if (fx.flashT >= 1) {
      flash.setPosition(0, HIDDEN_Y, 0);
    } else {
      const [x, z] = cellPos(fx.flashCell);
      const s = 0.6 + fx.flashT * fx.flashBig;
      flash.setPosition(x, RAISED_Y, z);
      flash.setScale([s, s, s]);
    }
  }
  fx.sparks.forEach((s, i) => {
    const node = app.nodes.require(`spark-${i}`);
    if (s.life <= 0) return;
    s.life -= dt;
    if (s.life <= 0) {
      node.setPosition(0, HIDDEN_Y, 0);
      return;
    }
    s.v[1] -= 9 * dt;
    s.p = [s.p[0] + s.v[0] * dt, s.p[1] + s.v[1] * dt, s.p[2] + s.v[2] * dt];
    node.setPosition(s.p[0], s.p[1], s.p[2]);
  });

  // HUD
  if (feedbackTimer > 0) {
    feedbackTimer -= dt;
    if (feedbackTimer <= 0) feedback.textContent = "";
  }
  hudScore.textContent = String(score);
  hudTime.textContent = timeLeft.toFixed(1);
  hudStatus.textContent = status;
  publish();
});

publish();
await app.ready();
requestAnimationFrame(() => {
  window.__TASK_READY__ = true;
});
