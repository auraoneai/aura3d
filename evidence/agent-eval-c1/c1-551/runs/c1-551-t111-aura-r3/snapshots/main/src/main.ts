import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  lines,
  material,
  primitives,
  scene,
  texture,
  type AuraTransformSpec
} from "@aura3d/engine";

type Vec3 = [number, number, number];

interface MoonDef {
  radius: number;
  orbit: number;
  period: number; // seconds of simulated time per revolution
  phase: number;
  color: string;
}

interface PlanetDef {
  name: string;
  radius: number; // world units
  orbit: number; // world units
  periodDays: number;
  distanceMkm: number;
  phase: number;
  spinPeriod: number; // seconds per rotation
  kind: "rocky" | "earth" | "bands" | "ice" | "venus";
  colors: [string, string, string];
  ring?: { inner: number; outer: number; tilt: number; colors: [string, string] };
  moons: MoonDef[];
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", radius: 0.4, orbit: 6.5, periodDays: 88, distanceMkm: 57.9, phase: 0.4, spinPeriod: 9, kind: "rocky", colors: ["#8d8680", "#5e5953", "#b3aca4"], moons: [] },
  { name: "Venus", radius: 0.7, orbit: 9, periodDays: 224.7, distanceMkm: 108.2, phase: 2.3, spinPeriod: 14, kind: "venus", colors: ["#e3b66b", "#c98f45", "#f2d49b"], moons: [] },
  { name: "Earth", radius: 0.75, orbit: 11.8, periodDays: 365.25, distanceMkm: 149.6, phase: 4.1, spinPeriod: 6, kind: "earth", colors: ["#2a63c4", "#3f8f4f", "#f4f7fb"], moons: [{ radius: 0.2, orbit: 1.6, period: 5, phase: 0.5, color: "#b9b6b0" }] },
  { name: "Mars", radius: 0.55, orbit: 14.6, periodDays: 687, distanceMkm: 227.9, phase: 1.1, spinPeriod: 6.5, kind: "rocky", colors: ["#b8522d", "#8a371b", "#d9835a"], moons: [] },
  {
    name: "Jupiter", radius: 1.8, orbit: 19.5, periodDays: 4333, distanceMkm: 778.5, phase: 5.2, spinPeriod: 4, kind: "bands", colors: ["#d4a574", "#9a6a43", "#efe1c8"],
    moons: [
      { radius: 0.25, orbit: 3.1, period: 6, phase: 1.0, color: "#d8c9a0" },
      { radius: 0.2, orbit: 4.1, period: 9, phase: 3.6, color: "#a99d8a" }
    ]
  },
  {
    name: "Saturn", radius: 1.5, orbit: 25.5, periodDays: 10759, distanceMkm: 1433.5, phase: 3.2, spinPeriod: 4.5, kind: "bands", colors: ["#e3cf9a", "#b89d63", "#f3e8c6"],
    ring: { inner: 1.9, outer: 3.4, tilt: 0.42, colors: ["#d9c79b", "#6f6045"] }, moons: []
  },
  { name: "Uranus", radius: 1.05, orbit: 30.5, periodDays: 30687, distanceMkm: 2872.5, phase: 0.9, spinPeriod: 6, kind: "ice", colors: ["#8fd7dd", "#6fb9c4", "#b8eef0"], moons: [] },
  { name: "Neptune", radius: 1.0, orbit: 35, periodDays: 60190, distanceMkm: 4495.1, phase: 2.0, spinPeriod: 6.5, kind: "ice", colors: ["#3e5fd1", "#2a409a", "#6f8cf0"], moons: [] }
];

const SUN_RADIUS = 3;
const FOV = 45;
const NEAR = 0.1;
const FAR = 1500;
const CANVAS_W = 640;
const CANVAS_H = 360;

// ---------- deterministic random ----------
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- procedural textures ----------
function planetCanvas(def: PlanetDef, seed: number): HTMLCanvasElement {
  const w = 512;
  const h = 256;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d")!;
  const rand = rng(seed * 977 + 13);
  const [a, b, hi] = def.colors;
  if (def.kind === "bands" || def.kind === "ice" || def.kind === "venus") {
    const bandCount = def.kind === "bands" ? 26 : def.kind === "venus" ? 10 : 7;
    const grad = g.createLinearGradient(0, 0, 0, h);
    for (let i = 0; i <= bandCount; i += 1) {
      const t = i / bandCount;
      const pick = rand();
      grad.addColorStop(t, pick < 0.4 ? a : pick < 0.75 ? b : hi);
    }
    g.fillStyle = grad;
    g.fillRect(0, 0, w, h);
    // soften bands with swirled streaks
    for (let i = 0; i < 160; i += 1) {
      const y = rand() * h;
      const len = 40 + rand() * 160;
      const x = rand() * w;
      g.globalAlpha = 0.07 + rand() * 0.1;
      g.fillStyle = rand() < 0.5 ? b : hi;
      for (const ox of [-w, 0, w]) g.fillRect(x + ox, y, len, 1 + rand() * 4);
    }
    g.globalAlpha = 1;
    if (def.name === "Jupiter") {
      g.fillStyle = "#b5532f";
      g.globalAlpha = 0.85;
      g.beginPath();
      g.ellipse(w * 0.3, h * 0.62, 26, 14, 0, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 1;
    }
  } else {
    g.fillStyle = def.kind === "earth" ? a : b;
    g.fillRect(0, 0, w, h);
    const blotch = (color: string, count: number, minR: number, maxR: number, alpha: number): void => {
      g.fillStyle = color;
      for (let i = 0; i < count; i += 1) {
        const x = rand() * w;
        const y = rand() * h;
        const r = minR + rand() * (maxR - minR);
        g.globalAlpha = alpha * (0.5 + rand() * 0.5);
        for (const ox of [-w, 0, w]) {
          g.beginPath();
          g.ellipse(x + ox, y, r, r * (0.6 + rand() * 0.5), rand() * 3, 0, Math.PI * 2);
          g.fill();
        }
      }
      g.globalAlpha = 1;
    };
    if (def.kind === "earth") {
      blotch(b, 70, 8, 40, 0.95);
      blotch("#c9b77a", 16, 5, 16, 0.6);
      g.fillStyle = hi;
      g.fillRect(0, 0, w, 14);
      g.fillRect(0, h - 14, w, 14);
      blotch(hi, 40, 6, 22, 0.55);
    } else {
      blotch(a, 120, 4, 22, 0.55);
      blotch(hi, 80, 2, 10, 0.4);
      blotch("#000000", 40, 5, 18, 0.18);
    }
  }
  return c;
}

function ringCanvas(colors: [string, string]): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 8;
  const g = c.getContext("2d")!;
  const rand = rng(42);
  g.fillStyle = colors[0];
  g.fillRect(0, 0, 256, 8);
  for (let x = 0; x < 256; x += 1) {
    const n = rand();
    g.globalAlpha = 0.25 + 0.45 * n * (0.5 + 0.5 * Math.sin(x * 0.21));
    g.fillStyle = colors[1];
    g.fillRect(x, 0, 1, 8);
  }
  g.globalAlpha = 1;
  g.fillStyle = "#1a1510";
  g.fillRect(150, 0, 9, 8); // Cassini-like gap
  return c;
}

function ringGeometry(inner: number, outer: number) {
  const seg = 96;
  const positions = new Float32Array((seg + 1) * 2 * 3);
  const normals = new Float32Array((seg + 1) * 2 * 3);
  const uvs = new Float32Array((seg + 1) * 2 * 2);
  const indices: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const ca = Math.cos(a);
    const sa = Math.sin(a);
    positions.set([ca * inner, 0, sa * inner], i * 6);
    positions.set([ca * outer, 0, sa * outer], i * 6 + 3);
    normals.set([0, 1, 0, 0, 1, 0], i * 6);
    uvs.set([0, i / seg, 1, i / seg], i * 4);
    if (i < seg) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
      indices.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: { min: [-outer, -0.01, -outer], max: [outer, 0.01, outer] }
  });
}

// ---------- scene ----------
const starTransforms: AuraTransformSpec[] = [];
const starColors: string[] = [];
{
  const rand = rng(7);
  const tints = ["#ffffff", "#cfe0ff", "#fff1d6", "#ffd9d0"];
  for (let i = 0; i < 420; i += 1) {
    const u = rand() * 2 - 1;
    const a = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 600;
    const size = 0.5 + rand() * 1.4;
    starTransforms.push({ position: [Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], scale: size });
    starColors.push(tints[Math.floor(rand() * tints.length)]!);
  }
}

let sceneBuilder = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.point({ name: "sunlight", position: [0, 0, 0], intensity: 9, color: "#fff0d0" }))
  .add(
    instances.sphere({
      name: "starfield",
      transforms: starTransforms,
      colors: starColors,
      material: material.emissive({ color: "#ffffff", emissive: "#ffffff" })
    })
  )
  .add(
    primitives
      .sphere({ name: "sun", size: SUN_RADIUS * 2, material: material.solarSun({ emissiveIntensity: 2.4 }) })
      .runtime({ id: "sun", mutable: true })
  )
  .add(
    primitives.sphere({
      name: "sun-corona",
      size: SUN_RADIUS * 3.1,
      material: material.solarCorona({ opacity: 0.3, falloff: 2.6 })
    })
  )
  .add(effects.bloom({ intensity: 0.45, threshold: 0.8, radius: 0.5 }));

PLANETS.forEach((p, i) => {
  const pts: Vec3[] = [];
  for (let k = 0; k < 192; k += 1) {
    const a = (k / 192) * Math.PI * 2;
    pts.push([Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit]);
  }
  sceneBuilder = sceneBuilder.add(
    lines.loop({
      name: `orbit-${p.name}`,
      points: pts,
      material: material.emissive({ color: "#4a5878", emissive: "#4a5878" })
    })
  );
  sceneBuilder = sceneBuilder.add(
    primitives
      .sphere({
        name: p.name,
        size: p.radius * 2,
        material: material.pbr({ color: "#ffffff", texture: texture.canvas({ canvas: planetCanvas(p, i + 1) }), roughness: 0.85 })
      })
      .runtime({ id: `planet-${p.name}`, mutable: true })
  );
  if (p.ring) {
    sceneBuilder = sceneBuilder.add(
      geometry
        .custom(ringGeometry(p.ring.inner, p.ring.outer), {
          name: `${p.name}-ring`,
          material: material.pbr({
            color: "#ffffff",
            texture: texture.canvas({ canvas: ringCanvas(p.ring.colors) }),
            roughness: 0.9,
            doubleSided: true
          })
        })
        .runtime({ id: `ring-${p.name}`, mutable: true })
    );
  }
  p.moons.forEach((m, j) => {
    sceneBuilder = sceneBuilder.add(
      primitives
        .sphere({ name: `${p.name}-moon-${j}`, size: m.radius * 2, material: material.pbr({ color: m.color, roughness: 0.95 }) })
        .runtime({ id: `moon-${p.name}-${j}`, mutable: true })
    );
  });
});

const startPose = overviewPose(0.7, 0.62, 82);
sceneBuilder = sceneBuilder.camera(camera.perspective({ position: startPose.pos, target: startPose.tgt, fov: FOV, near: NEAR, far: FAR }));

const app = createAuraApp("#app", { scene: sceneBuilder });

// ---------- simulation state ----------
interface Pose {
  pos: Vec3;
  tgt: Vec3;
}

const orbitAngle = (p: PlanetDef, simTime: number): number => {
  // Angular speed falls with period^0.5 so outer planets still visibly move.
  const secPerOrbit = 14 * Math.sqrt(p.periodDays / 88);
  return p.phase + (simTime / secPerOrbit) * Math.PI * 2;
};

let simTime = 0;
let paused = false;
let focused: PlanetDef | null = null;
let ready = false;
let az = 0.7;
let el = 0.62;
let dist = 82;
const DIST_MIN = 35;
const DIST_MAX = 160;
const TRANSITION = 1.5;
let trans: { t: number; from: Pose } | null = null;
let currentPose: Pose = startPose;

function overviewPose(a: number, e: number, d: number): Pose {
  return {
    pos: [d * Math.cos(e) * Math.sin(a), d * Math.sin(e), d * Math.cos(e) * Math.cos(a)],
    tgt: [0, 0, 0]
  };
}

function planetPos(p: PlanetDef): Vec3 {
  const a = orbitAngle(p, simTime);
  return [Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit];
}

function focusPose(p: PlanetDef): Pose {
  const a = orbitAngle(p, simTime);
  const c = planetPos(p);
  const d = p.radius * (p.ring ? 7 : 5.2);
  const r: Vec3 = [Math.cos(a), 0, Math.sin(a)];
  const t: Vec3 = [-Math.sin(a), 0, Math.cos(a)];
  const off: Vec3 = [-0.5 * r[0] - 0.75 * t[0], 0.38, -0.5 * r[2] - 0.75 * t[2]];
  const len = Math.hypot(off[0], off[1], off[2]);
  return {
    pos: [c[0] + (off[0] / len) * d, c[1] + (off[1] / len) * d, c[2] + (off[2] / len) * d],
    tgt: c
  };
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix = (a: Vec3, b: Vec3, k: number): Vec3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

function beginTransition(): void {
  trans = { t: 0, from: { pos: [...currentPose.pos], tgt: [...currentPose.tgt] } };
}

function focusPlanet(name: string): void {
  const p = PLANETS.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
  if (!p || p === focused) return;
  beginTransition();
  focused = p;
  showPanel(p);
}

function unfocus(): void {
  if (!focused) return;
  beginTransition();
  focused = null;
  hidePanel();
}

// ---------- DOM ----------
const overlayStyle = document.createElement("style");
overlayStyle.textContent = `
  .sx-btn { position:absolute; left:10px; top:10px; padding:5px 14px; font:600 13px system-ui,sans-serif; color:#e8eefc;
    background:rgba(20,28,52,.82); border:1px solid rgba(140,170,255,.55); border-radius:6px; cursor:pointer; }
  .sx-btn:hover { background:rgba(40,56,100,.9); }
  .sx-panel { position:absolute; left:${CANVAS_W - 210}px; top:10px; width:190px; box-sizing:border-box; padding:10px 12px;
    background:rgba(10,14,30,.82); border:1px solid rgba(140,170,255,.45); border-radius:8px; color:#e8eefc; display:none;
    pointer-events:none; font:12px/1.5 system-ui,sans-serif; }
  .sx-panel h2 { margin:0 0 4px; font:700 16px system-ui,sans-serif; color:#ffe9a8; }
  .sx-panel dt { color:#93a4cf; font-size:11px; margin-top:4px; }
  .sx-panel dd { margin:0; font-weight:600; }
  .sx-hint { position:absolute; left:10px; top:${CANVAS_H - 24}px; color:rgba(200,214,255,.7); font:11px system-ui,sans-serif; pointer-events:none; }
`;
document.head.appendChild(overlayStyle);

const button = document.createElement("button");
button.className = "sx-btn";
button.type = "button";
button.id = "pause-toggle";
button.textContent = "Pause";
button.addEventListener("click", () => {
  paused = !paused;
  button.textContent = paused ? "Play" : "Pause";
});
document.body.appendChild(button);

const panel = document.createElement("div");
panel.className = "sx-panel";
panel.id = "info-panel";
panel.innerHTML = `<h2 id="info-name"></h2><dl><dt>Orbital period</dt><dd id="info-period"></dd><dt>Distance from star</dt><dd id="info-dist"></dd></dl>`;
document.body.appendChild(panel);
const hint = document.createElement("div");
hint.className = "sx-hint";
hint.textContent = "Click a planet to focus. Drag to orbit, scroll to zoom, Esc to return.";
document.body.appendChild(hint);

function showPanel(p: PlanetDef): void {
  panel.querySelector("#info-name")!.textContent = p.name;
  panel.querySelector("#info-period")!.textContent = `${p.periodDays.toLocaleString("en-US")} Earth days`;
  panel.querySelector("#info-dist")!.textContent = `${p.distanceMkm.toLocaleString("en-US")} million km`;
  panel.style.display = "block";
  hint.style.display = "none";
}
function hidePanel(): void {
  panel.style.display = "none";
  hint.style.display = "block";
}

// ---------- picking & input ----------
const canvas = document.getElementById("app") as HTMLCanvasElement;

function pickPlanet(clientX: number, clientY: number): PlanetDef | null {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  const { pos, tgt } = currentPose;
  const f = norm([tgt[0] - pos[0], tgt[1] - pos[1], tgt[2] - pos[2]]);
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const th = Math.tan((FOV * Math.PI) / 360);
  const aspect = rect.width / rect.height;
  const d = norm([
    f[0] + right[0] * nx * th * aspect + up[0] * ny * th,
    f[1] + right[1] * nx * th * aspect + up[1] * ny * th,
    f[2] + right[2] * nx * th * aspect + up[2] * ny * th
  ]);
  let best: PlanetDef | null = null;
  let bestT = Infinity;
  for (const p of PLANETS) {
    const c = planetPos(p);
    const w: Vec3 = [c[0] - pos[0], c[1] - pos[1], c[2] - pos[2]];
    const t = w[0] * d[0] + w[1] * d[1] + w[2] * d[2];
    if (t <= 0) continue;
    const perp = Math.hypot(w[0] - d[0] * t, w[1] - d[1] * t, w[2] - d[2] * t);
    const tol = Math.max(p.radius * 1.25, (t * th * 9) / (rect.height / 2));
    if (perp <= tol && t < bestT) {
      best = p;
      bestT = t;
    }
  }
  return best;
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function norm(a: Vec3): Vec3 {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
}

let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (dragging) {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved += Math.abs(dx) + Math.abs(dy);
    if (!focused && moved > 4) {
      az -= dx * 0.006;
      el = Math.min(1.45, Math.max(0.08, el + dy * 0.006));
    }
  } else {
    canvas.style.cursor = pickPlanet(e.clientX, e.clientY) ? "pointer" : "default";
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  if (moved <= 4) {
    const hit = pickPlanet(e.clientX, e.clientY);
    if (hit) focusPlanet(hit.name);
    else unfocus();
  }
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused) return;
    dist = Math.min(DIST_MAX, Math.max(DIST_MIN, dist * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------- task state ----------
declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

const state = {
  get ready() {
    return ready;
  },
  get focused() {
    return focused ? focused.name : null;
  },
  get paused() {
    return paused;
  },
  get planets() {
    return PLANETS.map((p) => {
      const c = planetPos(p);
      return { name: p.name, x: c[0], y: c[1], z: c[2] };
    });
  },
  get cameraDistanceToFocus() {
    if (!focused) return null;
    const c = planetPos(focused);
    return Math.hypot(currentPose.pos[0] - c[0], currentPose.pos[1] - c[1], currentPose.pos[2] - c[2]);
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: state, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__focusPlanet", { value: focusPlanet, writable: false, configurable: false });
Object.defineProperty(window, "__unfocus", { value: unfocus, writable: false, configurable: false });

// ---------- frame loop ----------
let frames = 0;
app.onFrame((f) => {
  const dt = Math.min(0.1, Math.max(0, f.dt));
  if (!paused) simTime += dt;

  // bodies
  for (const p of PLANETS) {
    const a = orbitAngle(p, simTime);
    const x = Math.cos(a) * p.orbit;
    const z = Math.sin(a) * p.orbit;
    const node = app.nodes.require(`planet-${p.name}`);
    node.setPosition(x, 0, z);
    node.setRotation(0, (simTime / p.spinPeriod) * Math.PI * 2, 0);
    if (p.ring) {
      app.nodes.require(`ring-${p.name}`).setPosition(x, 0, z).setRotation(p.ring.tilt, 0, 0.18);
    }
    p.moons.forEach((m, j) => {
      const ma = m.phase + (simTime / m.period) * Math.PI * 2;
      app.nodes.require(`moon-${p.name}-${j}`).setPosition(x + Math.cos(ma) * m.orbit, Math.sin(ma) * m.orbit * 0.12, z + Math.sin(ma) * m.orbit);
    });
  }
  app.nodes.require("sun").setRotation(0, simTime * 0.1, 0);

  // camera
  const desired = focused ? focusPose(focused) : overviewPose(az, el, dist);
  let pose = desired;
  if (trans) {
    trans.t += dt / TRANSITION;
    const k = easeInOutCubic(Math.min(1, trans.t));
    pose = { pos: mix(trans.from.pos, desired.pos, k), tgt: mix(trans.from.tgt, desired.tgt, k) };
    if (trans.t >= 1) trans = null;
  }
  currentPose = pose;
  app.camera?.setPose({ position: pose.pos, target: pose.tgt, up: [0, 1, 0], fov: FOV, near: NEAR, far: FAR }, { cut: true });

  frames += 1;
  if (frames === 2) {
    requestAnimationFrame(() => {
      ready = true;
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
