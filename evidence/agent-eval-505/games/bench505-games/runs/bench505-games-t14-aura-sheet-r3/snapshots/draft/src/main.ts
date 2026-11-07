import { camera, createAuraApp, effects, environments, group, lights, material, primitives, scene } from "@aura3d/engine";

type Status = "ready" | "playing" | "won" | "lost";
type ItemType = "lantern" | "bomb";

declare global {
  interface Window {
    __TASK_STATE__?: { status: Status; score: number; timeLeft: number; activeCells: number[] };
    __TASK_READY__?: boolean;
  }
}

// ---------- constants ----------
const ROUND_TIME = 45;
const WIN_SCORE = 150;
const SPACING = 2.4;
const PED_TOP = 0.3;
const REST_Y = 0.8;
const DOWN_Y = -0.7;
const RISE = 0.12;
const FALL = 0.2;
const POP_TIME = 0.16;
const MISS_TIME = 0.4;
const FLASH_TIME = 0.35;
const PARTICLES = 24;

const CAM_POS: [number, number, number] = [0, 9.5, 8];
const CAM_TARGET: [number, number, number] = [0, 0, 0.3];
const CAM_FOV = 40;

const cellX = (i: number): number => ((i % 3) - 1) * SPACING;
const cellZ = (i: number): number => (Math.floor(i / 3) - 1) * SPACING;

// ---------- seeded random ----------
const seedParam = Number(new URLSearchParams(location.search).get("seed"));
const SEED = Number.isFinite(seedParam) && seedParam !== 0 ? seedParam >>> 0 : 12345;
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
let rng = makeRng(SEED);
const fxRng = makeRng(99);

// ---------- scene ----------
const lanternMat = material.emissive({ color: "#ffb347", emissive: "#ffa726", emissiveIntensity: 2.2 });
const capMat = material.pbr({ color: "#3a2a1a", roughness: 0.6 });
const bombMat = material.pbr({ color: "#2a1a40", metallic: 0.5, roughness: 0.35 });
const fuseMat = material.emissive({ color: "#ff2a2a", emissive: "#ff1a1a", emissiveIntensity: 3 });
const stoneMat = material.pbr({ color: "#6f7686", roughness: 0.85 });
const holeMat = material.pbr({ color: "#07080c", roughness: 1 });
const haloMat = material.emissive({ color: "#40e0ff", emissive: "#40e0ff", emissiveIntensity: 2.5 });
const goldFx = material.emissive({ color: "#ffe066", emissive: "#ffd54a", emissiveIntensity: 3 });
const redFx = material.emissive({ color: "#ff5a3a", emissive: "#ff3a1a", emissiveIntensity: 3 });

let sc = scene({ background: "#12162a" })
  .camera(camera.perspective({ position: CAM_POS, target: CAM_TARGET, fov: CAM_FOV, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 0.5, background: false }))
  .add(lights.hemisphere({ skyColor: "#8fa4d8", groundColor: "#2a2038", intensity: 0.9 }))
  .add(lights.directional({ position: [4, 10, 5], target: [0, 0, 0], intensity: 2.2, shadow: true }))
  .add(effects.bloom({ intensity: 0.55, threshold: 0.8, radius: 0.5 }))
  .add(primitives.plane({ name: "ground", size: [40, 1, 40], material: material.pbr({ color: "#1e2438", roughness: 1 }) }));

for (let i = 0; i < 9; i += 1) {
  const x = cellX(i);
  const z = cellZ(i);
  sc = sc
    .add(primitives.cylinder({ name: `ped${i}`, size: [1.9, PED_TOP, 1.9], material: stoneMat }).position(x, PED_TOP / 2, z))
    .add(primitives.cylinder({ name: `hole${i}`, size: [1.3, 0.02, 1.3], material: holeMat }).position(x, PED_TOP + 0.01, z))
    .add(
      group(
        `lantern${i}`,
        [
          primitives.sphere({ name: `lbody${i}`, size: 0.9, material: lanternMat }),
          primitives.cylinder({ name: `ltop${i}`, size: [0.42, 0.12, 0.42], material: capMat }).position(0, 0.47, 0),
          primitives.cylinder({ name: `lbot${i}`, size: [0.42, 0.1, 0.42], material: capMat }).position(0, -0.45, 0)
        ],
        { position: [x, DOWN_Y, z] }
      ).runtime({ id: `lantern${i}`, mutable: true })
    )
    .add(
      group(
        `bomb${i}`,
        [
          primitives.sphere({ name: `bbody${i}`, size: 0.95, material: bombMat }),
          primitives.cylinder({ name: `bfuse${i}`, size: [0.14, 0.3, 0.14], material: capMat }).position(0, 0.55, 0),
          primitives.sphere({ name: `bspark${i}`, size: 0.24, material: fuseMat }).position(0, 0.78, 0)
        ],
        { position: [x, DOWN_Y, z] }
      ).runtime({ id: `bomb${i}`, mutable: true })
    )
    .add(primitives.cylinder({ name: `flash${i}`, size: [1.9, 0.05, 1.9], material: goldFx }).position(x, 0.35, z).runtime({ id: `flash${i}`, mutable: true }))
    .add(primitives.cylinder({ name: `miss${i}`, size: [1.9, 0.05, 1.9], material: redFx }).position(x, 0.36, z).runtime({ id: `miss${i}`, mutable: true }));
}
sc = sc.add(primitives.cylinder({ name: "halo", size: [2.25, 0.04, 2.25], material: haloMat }).position(0, 0.04, 0).runtime({ id: "halo", mutable: true }));
for (let p = 0; p < PARTICLES; p += 1) {
  sc = sc
    .add(primitives.sphere({ name: `pg${p}`, size: 0.2, material: goldFx }).runtime({ id: `pg${p}`, mutable: true }))
    .add(primitives.sphere({ name: `pr${p}`, size: 0.2, material: redFx }).runtime({ id: `pr${p}`, mutable: true }));
}

// ---------- DOM ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;
const wrap = document.createElement("div");
wrap.style.cssText = "position:relative;width:640px;height:360px;";
canvas.parentElement?.insertBefore(wrap, canvas);
wrap.appendChild(canvas);
canvas.style.touchAction = "none";

const hud = document.createElement("div");
hud.id = "hud";
hud.style.cssText = "width:640px;display:flex;justify-content:space-between;padding:6px 10px;box-sizing:border-box;font:600 15px system-ui,sans-serif;background:#0b0d18;";
hud.innerHTML =
  '<span>Score: <b id="hud-score">0</b></span><span>Time: <b id="hud-time">45.0</b></span><span>Status: <b id="hud-status">ready</b></span>';
wrap.after(hud);
const scoreEl = document.getElementById("hud-score") as HTMLElement;
const timeEl = document.getElementById("hud-time") as HTMLElement;
const statusEl = document.getElementById("hud-status") as HTMLElement;

const overlay = document.createElement("div");
overlay.id = "overlay";
overlay.style.cssText =
  "position:absolute;left:0;top:0;width:640px;height:360px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;background:rgba(6,8,18,0.72);text-align:center;";
const overlayTitle = document.createElement("div");
overlayTitle.style.cssText = "font:700 28px system-ui,sans-serif;";
const overlayText = document.createElement("div");
overlayText.style.cssText = "font:14px system-ui,sans-serif;max-width:460px;";
const startBtn = document.createElement("button");
startBtn.id = "start-btn";
startBtn.textContent = "Start";
const restartBtn = document.createElement("button");
restartBtn.id = "restart-btn";
restartBtn.textContent = "Restart";
for (const b of [startBtn, restartBtn]) {
  b.style.cssText = "font:700 16px system-ui,sans-serif;padding:8px 22px;border-radius:6px;border:0;background:#ffb347;color:#201408;cursor:pointer;";
}
overlay.append(overlayTitle, overlayText, startBtn, restartBtn);
wrap.appendChild(overlay);

// ---------- game state ----------
interface Item {
  type: ItemType;
  age: number;
  dur: number;
  popped: boolean;
  popT: number;
}
interface Particle {
  id: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
}

let status: Status = "ready";
let score = 0;
let timeLeft = ROUND_TIME;
let spawnIn = 0.6;
let spawned = 0;
let hover = -1;
let clock = 0;
const items: (Item | null)[] = Array.from({ length: 9 }, () => null);
const flashT: number[] = Array.from({ length: 9 }, () => 0);
const missT: number[] = Array.from({ length: 9 }, () => 0);
const particles: Particle[] = [];
for (let p = 0; p < PARTICLES; p += 1) {
  particles.push({ id: `pg${p}`, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
  particles.push({ id: `pr${p}`, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, max: 1 });
}

const isActive = (it: Item | null): it is Item => it !== null && !it.popped && it.age < it.dur;

const syncState = (): void => {
  const activeCells: number[] = [];
  for (let i = 0; i < 9; i += 1) if (isActive(items[i] ?? null)) activeCells.push(i);
  window.__TASK_STATE__ = { status, score, timeLeft: Math.round(timeLeft * 100) / 100, activeCells };
  scoreEl.textContent = String(score);
  timeEl.textContent = timeLeft.toFixed(1);
  statusEl.textContent = status;
};

const flashHud = (color: string): void => {
  scoreEl.style.color = color;
  window.setTimeout(() => {
    scoreEl.style.color = "";
  }, 250);
};

const showOverlay = (): void => {
  if (status === "playing") {
    overlay.style.display = "none";
    return;
  }
  overlay.style.display = "flex";
  if (status === "ready") {
    overlayTitle.textContent = "Lantern Pop";
    overlayText.textContent = "Pop the glowing lanterns (+10). Avoid the dark bombs and empty cells (-5). Score 150 in 45 seconds to win. Press Enter or click Start.";
    startBtn.style.display = "";
    restartBtn.style.display = "none";
  } else {
    overlayTitle.textContent = status === "won" ? "You won!" : "You lost";
    overlayText.textContent = `Final score: ${score}. Press R or click Restart.`;
    startBtn.style.display = "none";
    restartBtn.style.display = "";
  }
};

const startRound = (): void => {
  rng = makeRng(SEED);
  score = 0;
  timeLeft = ROUND_TIME;
  status = "playing";
  spawnIn = 0.6;
  spawned = 0;
  for (let i = 0; i < 9; i += 1) {
    items[i] = null;
    flashT[i] = 0;
    missT[i] = 0;
  }
  for (const p of particles) p.life = 0;
  showOverlay();
  syncState();
};

const endRound = (result: "won" | "lost"): void => {
  status = result;
  for (let i = 0; i < 9; i += 1) {
    const it = items[i] ?? null;
    if (it && !it.popped) items[i] = null;
  }
  showOverlay();
  syncState();
};

const burst = (cell: number, red: boolean, count: number): void => {
  const prefix = red ? "pr" : "pg";
  let n = 0;
  for (const p of particles) {
    if (n >= count) break;
    if (!p.id.startsWith(prefix) || p.life > 0) continue;
    const a = fxRng() * Math.PI * 2;
    const sp = 1.5 + fxRng() * 2.5;
    p.x = cellX(cell);
    p.y = REST_Y;
    p.z = cellZ(cell);
    p.vx = Math.cos(a) * sp;
    p.vz = Math.sin(a) * sp;
    p.vy = 3 + fxRng() * 3;
    p.max = 0.5 + fxRng() * 0.3;
    p.life = p.max;
    n += 1;
  }
};

const handleClick = (cell: number): void => {
  if (status !== "playing" || cell < 0) return;
  const it = items[cell] ?? null;
  if (isActive(it)) {
    if (it.type === "bomb") {
      it.popped = true;
      it.popT = 0;
      burst(cell, true, PARTICLES);
      missT[cell] = MISS_TIME;
      flashHud("#ff4a4a");
      endRound("lost");
      return;
    }
    it.popped = true;
    it.popT = 0;
    score += 10;
    flashT[cell] = FLASH_TIME;
    burst(cell, false, 14);
    flashHud("#ffe066");
  } else {
    score = Math.max(0, score - 5);
    missT[cell] = MISS_TIME;
    burst(cell, true, 4);
    flashHud("#ff4a4a");
  }
  syncState();
};

// ---------- picking ----------
const norm = (v: [number, number, number]): [number, number, number] => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const cross = (a: [number, number, number], b: [number, number, number]): [number, number, number] => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const fwd = norm([CAM_TARGET[0] - CAM_POS[0], CAM_TARGET[1] - CAM_POS[1], CAM_TARGET[2] - CAM_POS[2]]);
const right = norm(cross(fwd, [0, 1, 0]));
const up = cross(right, fwd);
const tanHalf = Math.tan((CAM_FOV * Math.PI) / 360);

const pickCell = (clientX: number, clientY: number): number => {
  const r = canvas.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return -1;
  const nx = ((clientX - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((clientY - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const d = norm([
    fwd[0] + right[0] * nx * tanHalf * aspect + up[0] * ny * tanHalf,
    fwd[1] + right[1] * nx * tanHalf * aspect + up[1] * ny * tanHalf,
    fwd[2] + right[2] * nx * tanHalf * aspect + up[2] * ny * tanHalf
  ]);
  // raised objects first (sphere test)
  let best = -1;
  let bestT = Infinity;
  for (let i = 0; i < 9; i += 1) {
    if (!isActive(items[i] ?? null)) continue;
    const ox = CAM_POS[0] - cellX(i);
    const oy = CAM_POS[1] - REST_Y;
    const oz = CAM_POS[2] - cellZ(i);
    const b = ox * d[0] + oy * d[1] + oz * d[2];
    const c = ox * ox + oy * oy + oz * oz - 0.7 * 0.7;
    const disc = b * b - c;
    if (disc < 0) continue;
    const t = -b - Math.sqrt(disc);
    if (t > 0 && t < bestT) {
      bestT = t;
      best = i;
    }
  }
  if (best >= 0) return best;
  // ground plane at pedestal height
  if (d[1] >= -1e-6) return -1;
  const t = (PED_TOP - CAM_POS[1]) / d[1];
  const px = CAM_POS[0] + d[0] * t;
  const pz = CAM_POS[2] + d[2] * t;
  for (let i = 0; i < 9; i += 1) {
    if (Math.abs(px - cellX(i)) < SPACING / 2 && Math.abs(pz - cellZ(i)) < SPACING / 2) return i;
  }
  return -1;
};

canvas.addEventListener("pointermove", (e) => {
  hover = pickCell(e.clientX, e.clientY);
});
canvas.addEventListener("pointerleave", () => {
  hover = -1;
});
canvas.addEventListener("pointerdown", (e) => {
  e.preventDefault();
  hover = pickCell(e.clientX, e.clientY);
  handleClick(hover);
});
startBtn.addEventListener("click", () => {
  if (status === "ready") startRound();
});
restartBtn.addEventListener("click", () => startRound());
window.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    if (status === "ready") {
      e.preventDefault();
      startRound();
    }
  } else if (e.key === "r" || e.key === "R") {
    startRound();
  }
});

// ---------- update ----------
const duration = (): number => Math.max(0.55, 1.5 - score * 0.005);

const update = (dt: number): void => {
  clock += dt;
  for (let i = 0; i < 9; i += 1) {
    flashT[i] = Math.max(0, (flashT[i] ?? 0) - dt);
    missT[i] = Math.max(0, (missT[i] ?? 0) - dt);
  }
  for (const p of particles) {
    if (p.life <= 0) continue;
    p.life -= dt;
    p.vy -= 12 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.z += p.vz * dt;
  }
  if (status !== "playing") {
    for (const it of items) if (it && it.popped) it.popT += dt;
    return;
  }
  timeLeft -= dt;
  for (let i = 0; i < 9; i += 1) {
    const it = items[i] ?? null;
    if (!it) continue;
    if (it.popped) {
      it.popT += dt;
      if (it.popT > POP_TIME) items[i] = null;
      continue;
    }
    it.age += dt;
    if (it.age >= it.dur) items[i] = null;
  }
  if (timeLeft <= 0) {
    timeLeft = 0;
    endRound(score >= WIN_SCORE ? "won" : "lost");
    return;
  }
  const anyBusy = items.some((it) => it !== null && !it.popped);
  if (!anyBusy) {
    spawnIn -= dt;
    if (spawnIn <= 0) {
      const free: number[] = [];
      for (let i = 0; i < 9; i += 1) if (!items[i]) free.push(i);
      if (free.length > 0) {
        const cell = free[Math.floor(rng() * free.length)] ?? 0;
        const type: ItemType = spawned >= 3 && rng() < 0.12 ? "bomb" : "lantern";
        items[cell] = { type, age: 0, dur: duration(), popped: false, popT: 0 };
        spawned += 1;
        spawnIn = (0.25 + rng() * 0.45) * Math.max(0.5, 1 - score / 400);
      }
    }
  }
};

// ---------- render ----------
const app = createAuraApp("#app", { scene: sc });
type Handle = ReturnType<typeof app.nodes.require>;
const handles = new Map<string, Handle>();
const node = (id: string): Handle => {
  let h = handles.get(id);
  if (!h) {
    h = app.nodes.require(id);
    handles.set(id, h);
  }
  return h;
};

const ease = (t: number): number => {
  const c = Math.min(1, Math.max(0, t));
  return c * c * (3 - 2 * c);
};

const applyScene = (): void => {
  for (let i = 0; i < 9; i += 1) {
    const it = items[i] ?? null;
    const lan = node(`lantern${i}`);
    const bomb = node(`bomb${i}`);
    let showL = false;
    let showB = false;
    let y = DOWN_Y;
    let s = 1;
    if (it) {
      if (it.popped) {
        const k = Math.min(1, it.popT / POP_TIME);
        y = REST_Y;
        s = 1 + 0.5 * k;
        if (k >= 1) s = 0.001;
      } else {
        const up = ease(it.age / RISE);
        const down = ease((it.dur - it.age) / FALL);
        y = DOWN_Y + (REST_Y - DOWN_Y) * Math.min(up, down);
      }
      showL = it.type === "lantern" && s > 0.01;
      showB = it.type === "bomb" && s > 0.01;
    }
    const target = showL ? lan : bomb;
    if (showL || showB) target.setPosition(cellX(i), y, cellZ(i)).setScale([s, s, s]).setRotation(0, clock * 1.5 + i, 0);
    lan.setVisible(showL);
    bomb.setVisible(showB);

    const fl = node(`flash${i}`);
    const ft = (flashT[i] ?? 0) / FLASH_TIME;
    if (ft > 0) {
      const g = 1 + (1 - ft) * 0.9;
      fl.setScale([g, 1, g]).setVisible(true);
    } else fl.setVisible(false);
    const ms = node(`miss${i}`);
    const mt = (missT[i] ?? 0) / MISS_TIME;
    if (mt > 0) {
      const g = 0.7 + mt * 0.4;
      ms.setScale([g, 1, g]).setVisible(true);
    } else ms.setVisible(false);
  }
  const halo = node("halo");
  if (hover >= 0) halo.setPosition(cellX(hover), 0.04, cellZ(hover)).setVisible(true);
  else halo.setVisible(false);
  for (const p of particles) {
    const n = node(p.id);
    if (p.life > 0) {
      const k = Math.max(0.05, p.life / p.max);
      n.setPosition(p.x, Math.max(0.3, p.y), p.z).setScale([k, k, k]).setVisible(true);
    } else n.setVisible(false);
  }
};

let last = performance.now();
let first = true;
app.onFrame(() => {
  const now = performance.now();
  const dt = Math.min(1, Math.max(0, (now - last) / 1000));
  last = now;
  update(dt);
  applyScene();
  syncState();
  if (first) {
    first = false;
    requestAnimationFrame(() => {
      window.__TASK_READY__ = true;
    });
  }
});

showOverlay();
syncState();
await app.ready();
