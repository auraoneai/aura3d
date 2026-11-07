import { camera, createAuraApp, effects, environments, geometry, group, instances, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

interface Spot { lat: number; lon: number; r: number; color: string }
interface Band { y: number; color: string }
interface PlanetDef {
  name: string;
  dia: number;
  orbit: number;
  periodDays: number;
  distMkm: number;
  color: string;
  spin: number;
  theta0: number;
  focusDist: number;
  spots: Spot[];
  bands: Band[];
  ring?: { inner: number; outer: number; tilt: number };
  moon?: { dia: number; orbit: number; omega: number; phase: number };
}

const PLANETS: PlanetDef[] = [
  {
    name: "Mercury", dia: 0.8, orbit: 9, periodDays: 88, distMkm: 57.9, color: "#a9a39b", spin: 0.3, theta0: 0.5, focusDist: 3.6,
    spots: [
      { lat: 0.3, lon: 0.4, r: 0.26, color: "#7d776f" }, { lat: -0.4, lon: 2.2, r: 0.3, color: "#8a847b" },
      { lat: 0.1, lon: 4.0, r: 0.22, color: "#74706a" }, { lat: 0.8, lon: 5.2, r: 0.2, color: "#8a847b" }
    ],
    bands: []
  },
  {
    name: "Venus", dia: 1.3, orbit: 12.5, periodDays: 224.7, distMkm: 108.2, color: "#e0b872", spin: -0.15, theta0: 2.4, focusDist: 4.6,
    spots: [
      { lat: 0.2, lon: 1.0, r: 0.34, color: "#c8975a" }, { lat: -0.5, lon: 3.0, r: 0.3, color: "#efd29a" },
      { lat: 0.6, lon: 4.4, r: 0.28, color: "#c8975a" }
    ],
    bands: [{ y: 0.35, color: "#d2a55f" }, { y: -0.3, color: "#ecc88a" }]
  },
  {
    name: "Earth", dia: 1.4, orbit: 16, periodDays: 365.25, distMkm: 149.6, color: "#2f6fd0", spin: 1.0, theta0: 4.0, focusDist: 4.9,
    spots: [
      { lat: 0.4, lon: 0.6, r: 0.42, color: "#3f9b4f" }, { lat: -0.3, lon: 2.4, r: 0.38, color: "#4aa655" },
      { lat: 0.5, lon: 4.1, r: 0.34, color: "#3a8a49" }, { lat: -0.2, lon: 5.4, r: 0.26, color: "#6aa84f" },
      { lat: 1.4, lon: 1.0, r: 0.3, color: "#f2f6fa" }, { lat: -1.4, lon: 3.0, r: 0.3, color: "#f2f6fa" }
    ],
    bands: [],
    moon: { dia: 0.38, orbit: 2.1, omega: 1.6, phase: 0.8 }
  },
  {
    name: "Mars", dia: 1.0, orbit: 20, periodDays: 687, distMkm: 227.9, color: "#c1583a", spin: 0.95, theta0: 5.6, focusDist: 3.9,
    spots: [
      { lat: 0.1, lon: 0.5, r: 0.3, color: "#8d3b24" }, { lat: -0.3, lon: 2.6, r: 0.26, color: "#a3472c" },
      { lat: 0.4, lon: 4.3, r: 0.3, color: "#d4734f" }, { lat: 1.4, lon: 0.0, r: 0.3, color: "#f0e6e0" }
    ],
    bands: []
  },
  {
    name: "Jupiter", dia: 3.6, orbit: 27, periodDays: 4333, distMkm: 778.5, color: "#d9b48a", spin: 1.6, theta0: 1.2, focusDist: 11,
    spots: [{ lat: -0.35, lon: 0.8, r: 0.2, color: "#c4553a" }, { lat: 0.3, lon: 3.4, r: 0.12, color: "#f0e2cc" }],
    bands: [
      { y: 0.55, color: "#b8845a" }, { y: 0.15, color: "#efdcc0" }, { y: -0.2, color: "#a8744c" }, { y: -0.6, color: "#c99d72" }
    ],
    moon: { dia: 0.5, orbit: 3.4, omega: 1.1, phase: 2.0 }
  },
  {
    name: "Saturn", dia: 3.0, orbit: 34, periodDays: 10759, distMkm: 1434, color: "#e2cd96", spin: 1.4, theta0: 3.1, focusDist: 13,
    spots: [{ lat: 0.5, lon: 1.5, r: 0.16, color: "#b89a58" }],
    bands: [{ y: 0.5, color: "#c9ab6b" }, { y: 0.1, color: "#f0dfae" }, { y: -0.35, color: "#c9ab6b" }],
    ring: { inner: 1.45, outer: 2.5, tilt: 0.42 }
  },
  {
    name: "Uranus", dia: 2.0, orbit: 40, periodDays: 30687, distMkm: 2871, color: "#8fd8e0", spin: -0.9, theta0: 4.9, focusDist: 7,
    spots: [{ lat: 0.3, lon: 0.9, r: 0.2, color: "#6cc0ca" }, { lat: -0.4, lon: 3.6, r: 0.22, color: "#b4eaf0" }],
    bands: [{ y: 0.3, color: "#7cc9d2" }, { y: -0.4, color: "#a6e4ea" }]
  },
  {
    name: "Neptune", dia: 1.9, orbit: 46, periodDays: 60190, distMkm: 4495, color: "#3f5fd8", spin: 1.1, theta0: 0.2, focusDist: 6.8,
    spots: [{ lat: -0.3, lon: 1.0, r: 0.26, color: "#24379b" }, { lat: 0.4, lon: 3.8, r: 0.14, color: "#e6ecff" }],
    bands: [{ y: 0.4, color: "#5272ea" }, { y: -0.2, color: "#3350b8" }]
  }
];

const omegaOf = (p: PlanetDef): number => 0.32 * Math.pow(88 / p.periodDays, 0.45);

// ---------------------------------------------------------------------------
// Scene building
// ---------------------------------------------------------------------------

const planetMat = (c: string) => material.pbr({ color: c, roughness: 0.85, metallic: 0, emissive: c, emissiveIntensity: 0.12 });

/** Flat annulus in the xz plane (optionally tilted about x), visible from both sides. */
function annulus(inner: number, outer: number, segments: number, tilt: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  const rot = (x: number, y: number, z: number): V3 => [x, y * ct - z * st, y * st + z * ct];
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    const n = rot(0, side, 0);
    for (let i = 0; i <= segments; i += 1) {
      const a = (i / segments) * Math.PI * 2;
      const c = Math.cos(a);
      const s = Math.sin(a);
      positions.push(...rot(c * inner, 0, s * inner), ...rot(c * outer, 0, s * outer));
      normals.push(...n, ...n);
    }
    for (let i = 0; i < segments; i += 1) {
      const i0 = base + i * 2;
      const o0 = i0 + 1;
      const i1 = i0 + 2;
      const o1 = i0 + 3;
      if (side > 0) indices.push(i0, o1, o0, i0, i1, o1);
      else indices.push(i0, o0, o1, i0, o1, i1);
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-outer, -outer, -outer], max: [outer, outer, outer] }
  });
}

function planetPosition(p: PlanetDef, t: number): V3 {
  const th = p.theta0 + omegaOf(p) * t;
  return [Math.cos(th) * p.orbit, 0, Math.sin(th) * p.orbit];
}

function moonPosition(p: PlanetDef, t: number): V3 {
  const c = planetPosition(p, t);
  const m = p.moon;
  if (!m) return c;
  const a = m.phase + m.omega * t;
  return [c[0] + Math.cos(a) * m.orbit, c[1] + 0.15, c[2] + Math.sin(a) * m.orbit];
}

const baseScene = scene({ background: "#02030a" });
baseScene.add(environments.neutral({ intensity: 0.25, background: false }));
baseScene.add(lights.ambient({ intensity: 0.22 }));
baseScene.add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 16, decay: 1, distance: 600, color: "#fff1d6" }));

// Starfield: a far shell of tiny emissive spheres.
{
  let seed = 90210;
  const rnd = (): number => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  const palette = ["#ffffff", "#cfe0ff", "#fff1d0", "#ffd9c0", "#e6eeff"];
  const transforms: { position: V3; scale: number }[] = [];
  const colors: string[] = [];
  for (let i = 0; i < 900; i += 1) {
    const z = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const r = Math.sqrt(1 - z * z);
    const dist = 420 + rnd() * 40;
    transforms.push({ position: [dist * r * Math.cos(a), dist * z, dist * r * Math.sin(a)], scale: 0.9 + Math.pow(rnd(), 3) * 2.4 });
    colors.push(palette[Math.floor(rnd() * palette.length)] ?? "#ffffff");
  }
  baseScene.add(instances.sphere({
    name: "starfield",
    transforms,
    colors,
    castShadow: false,
    receiveShadow: false,
    material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.4 })
  }));
}

// Central star.
baseScene.add(primitives.sphere({
  name: "star",
  size: 7,
  castShadow: false,
  material: material.solarSun({ color: "#ffd166", coreColor: "#fff7ad", rimColor: "#f97316", emissiveIntensity: 2.4 })
}));
baseScene.add(primitives.sphere({
  name: "star-corona",
  size: 10,
  castShadow: false,
  receiveShadow: false,
  material: material.solarCorona({ color: "#ff9f1c", coreColor: "#ffd166", rimColor: "#f97316", opacity: 0.3, falloff: 2.6 })
}));

// Orbit lines, planets, rings and moons.
const orbitMaterial = material.emissive({ color: "#3a4668", emissive: "#3a4668", emissiveIntensity: 1 });
for (const p of PLANETS) {
  const halfWidth = 0.11 + p.orbit * 0.0015;
  baseScene.add(geometry.custom(annulus(p.orbit - halfWidth, p.orbit + halfWidth, 256, 0), {
    name: `orbit-${p.name}`,
    material: orbitMaterial,
    castShadow: false,
    receiveShadow: false
  }));

  const R = p.dia / 2;
  const kids = [primitives.sphere({ name: `${p.name}-body`, size: p.dia, material: planetMat(p.color) })];
  p.bands.forEach((b, i) => {
    const y = b.y * R;
    const w = 2 * Math.sqrt(R * R - y * y) * 1.03;
    kids.push(primitives.sphere({ name: `${p.name}-band-${i}`, size: [w, 0.32 * R, w], material: planetMat(b.color) }).position(0, y, 0));
  });
  p.spots.forEach((s, i) => {
    const rs = s.r * R;
    const c = 1.02 * R - rs;
    const dir: V3 = [Math.cos(s.lat) * Math.cos(s.lon), Math.sin(s.lat), Math.cos(s.lat) * Math.sin(s.lon)];
    kids.push(primitives.sphere({ name: `${p.name}-spot-${i}`, size: rs * 2, material: planetMat(s.color) }).position(dir[0] * c, dir[1] * c, dir[2] * c));
  });
  const start = planetPosition(p, 0);
  baseScene.add(group(`planet-${p.name}`, kids, { position: start }).runtime({ id: `planet-${p.name}`, mutable: true }));

  if (p.ring) {
    const rr = p.ring;
    baseScene.add(group(`ring-${p.name}`, [
      geometry.custom(annulus(rr.inner * R, (rr.inner + (rr.outer - rr.inner) * 0.55) * R, 128, rr.tilt), {
        name: `${p.name}-ring-inner`,
        material: material.pbr({ color: "#d8c79c", roughness: 0.9, emissive: "#d8c79c", emissiveIntensity: 0.35 }),
        castShadow: false
      }),
      geometry.custom(annulus((rr.inner + (rr.outer - rr.inner) * 0.65) * R, rr.outer * R, 128, rr.tilt), {
        name: `${p.name}-ring-outer`,
        material: material.pbr({ color: "#a89870", roughness: 0.9, emissive: "#a89870", emissiveIntensity: 0.3 }),
        castShadow: false
      })
    ], { position: start }).runtime({ id: `ring-${p.name}`, mutable: true }));
  }

  if (p.moon) {
    baseScene.add(primitives.sphere({
      name: `moon-${p.name}`,
      size: p.moon.dia,
      material: planetMat("#cfcfd4")
    }).position(...moonPosition(p, 0)).runtime({ id: `moon-${p.name}`, mutable: true }));
  }
}

baseScene.add(effects.bloom({ intensity: 0.5, threshold: 0.85, radius: 0.5 }));

// ---------------------------------------------------------------------------
// Camera model
// ---------------------------------------------------------------------------

const FOV = 45;
const NEAR = 0.3;
const FAR = 2000;
const UP: V3 = [0, 1, 0];
const MIN_DIST = 28;
const MAX_DIST = 180;

const view = { yaw: 0.35, pitch: 0.62, dist: 95 };

interface CamPose { pos: V3; tgt: V3 }

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const easeInOutCubic = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function overviewPose(): CamPose {
  const cp = Math.cos(view.pitch);
  return {
    pos: [view.dist * cp * Math.sin(view.yaw), view.dist * Math.sin(view.pitch), view.dist * cp * Math.cos(view.yaw)],
    tgt: [0, 0, 0]
  };
}

function focusPose(p: PlanetDef): CamPose {
  const P = planetPosition(p, simTime);
  const th = p.theta0 + omegaOf(p) * simTime;
  const sx = -Math.cos(th);
  const sz = -Math.sin(th);
  const a = 0.9;
  const hx = sx * Math.cos(a) - sz * Math.sin(a);
  const hz = sx * Math.sin(a) + sz * Math.cos(a);
  const el = 0.32;
  const d = p.focusDist;
  return {
    pos: [P[0] + d * hx * Math.cos(el), P[1] + d * Math.sin(el), P[2] + d * hz * Math.cos(el)],
    tgt: P
  };
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

let simTime = 0;
let paused = false;
let ready = false;
let focused: PlanetDef | null = null;
let current: CamPose = overviewPose();
let transition: { t0: number; from: CamPose } | null = null;
let lastNow = performance.now();
let dirty = true;

const TRANSITION_MS = 1500;

type Handle = { setPosition(x: number, y: number, z: number): unknown; setRotation(x: number, y: number, z: number): unknown };
interface PlanetHandles { body: Handle; ring?: Handle; moon?: Handle }
let handles: Map<string, PlanetHandles> | null = null;

const app = createAuraApp("#app", {
  scene: baseScene.camera(camera.perspective({ position: current.pos, target: current.tgt, fov: FOV, near: NEAR, far: FAR }))
});

function writeNodes(): void {
  if (!handles) return;
  for (const p of PLANETS) {
    const h = handles.get(p.name);
    if (!h) continue;
    const P = planetPosition(p, simTime);
    h.body.setPosition(P[0], P[1], P[2]);
    h.body.setRotation(0, p.spin * simTime, 0);
    h.ring?.setPosition(P[0], P[1], P[2]);
    if (h.moon) {
      const M = moonPosition(p, simTime);
      h.moon.setPosition(M[0], M[1], M[2]);
    }
  }
}

function tick(): void {
  const now = performance.now();
  const dt = clamp((now - lastNow) / 1000, 0, 0.1);
  lastNow = now;
  if (!paused && dt > 0) {
    simTime += dt;
    dirty = true;
  }
  if (dirty) {
    writeNodes();
    dirty = false;
  }
}

const rig = {
  id: "solar-explorer",
  continuous: true,
  update() {
    tick();
    const target = focused ? focusPose(focused) : overviewPose();
    let pose = target;
    if (transition) {
      const u = (performance.now() - transition.t0) / TRANSITION_MS;
      if (u >= 1) {
        transition = null;
      } else {
        const e = easeInOutCubic(clamp(u, 0, 1));
        pose = { pos: lerp3(transition.from.pos, target.pos, e), tgt: lerp3(transition.from.tgt, target.tgt, e) };
      }
    }
    current = pose;
    return { position: pose.pos, target: pose.tgt, up: UP, roll: 0, fov: FOV, near: NEAR, far: FAR };
  }
};
app.camera?.use(rig);
app.onFrame(() => tick());

function beginTransition(): void {
  transition = { t0: performance.now(), from: { pos: [...current.pos], tgt: [...current.tgt] } };
}

function focusPlanet(name: string): void {
  const p = PLANETS.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
  if (!p) return;
  if (focused === p) return;
  focused = p;
  beginTransition();
  showPanel(p);
}

function unfocus(): void {
  if (!focused) return;
  focused = null;
  beginTransition();
  hidePanel();
}

window.__focusPlanet = focusPlanet;
window.__unfocus = unfocus;

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get() {
    let dist: number | null = null;
    if (focused) {
      const P = planetPosition(focused, simTime);
      dist = Math.hypot(current.pos[0] - P[0], current.pos[1] - P[1], current.pos[2] - P[2]);
    }
    return Object.freeze({
      ready,
      focused: focused ? focused.name : null,
      paused,
      planets: PLANETS.map((p) => {
        const P = planetPosition(p, simTime);
        return { name: p.name, x: P[0], y: P[1], z: P[2] };
      }),
      cameraDistanceToFocus: dist
    });
  }
});

// ---------------------------------------------------------------------------
// DOM UI
// ---------------------------------------------------------------------------

const style = document.createElement("style");
style.textContent = `
  #hint { position: fixed; left: 8px; top: 6px; font: 11px/1.3 system-ui, sans-serif; color: #8fa0c8; pointer-events: none; z-index: 5; }
  #info-panel { position: fixed; left: 8px; top: 268px; width: 224px; box-sizing: border-box; padding: 8px 10px; z-index: 10;
    background: rgba(8, 12, 28, 0.88); border: 1px solid #3a4a7a; border-radius: 6px; color: #e8eeff; font: 12px/1.45 system-ui, sans-serif; display: none; }
  #info-panel h2 { margin: 0 0 4px; font-size: 16px; font-weight: 600; color: #ffe8a8; }
  #info-panel div { color: #c8d4f4; }
  #info-panel b { color: #fff; font-weight: 600; }
  #pause-toggle { position: fixed; left: 566px; top: 326px; width: 66px; height: 26px; z-index: 10; cursor: pointer;
    background: rgba(8, 12, 28, 0.88); color: #e8eeff; border: 1px solid #3a4a7a; border-radius: 6px; font: 12px system-ui, sans-serif; }
  #pause-toggle:hover { background: rgba(40, 56, 110, 0.9); }
`;
document.head.appendChild(style);

const hint = document.createElement("div");
hint.id = "hint";
hint.textContent = "Click a planet to focus. Esc or empty space to return. Drag to orbit, scroll to zoom.";
document.body.appendChild(hint);

const panel = document.createElement("div");
panel.id = "info-panel";
const panelName = document.createElement("h2");
panelName.id = "info-name";
const panelPeriod = document.createElement("div");
panelPeriod.id = "info-period";
const panelDist = document.createElement("div");
panelDist.id = "info-distance";
panel.append(panelName, panelPeriod, panelDist);
document.body.appendChild(panel);

function showPanel(p: PlanetDef): void {
  panelName.textContent = p.name;
  panelPeriod.innerHTML = `Orbital period: <b>${p.periodDays} Earth days</b>`;
  panelDist.innerHTML = `Distance from star: <b>${p.distMkm} million km</b>`;
  panel.style.display = "block";
}

function hidePanel(): void {
  panel.style.display = "none";
}

const pauseButton = document.createElement("button");
pauseButton.id = "pause-toggle";
pauseButton.type = "button";
pauseButton.textContent = "Pause";
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Play" : "Pause";
  lastNow = performance.now();
});
document.body.appendChild(pauseButton);

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

const canvas = document.getElementById("app") as HTMLCanvasElement;

function pick(px: number, py: number, width: number, height: number): PlanetDef | null {
  const f = norm(sub(current.tgt, current.pos));
  const r = norm(cross(f, UP));
  const u = cross(r, f);
  const t = Math.tan((FOV * Math.PI) / 360);
  const aspect = width / height;
  let best: PlanetDef | null = null;
  let bestZ = Infinity;
  for (const p of PLANETS) {
    const v = sub(planetPosition(p, simTime), current.pos);
    const z = dot(v, f);
    if (z <= NEAR) continue;
    const sx = (dot(v, r) / (z * t * aspect) * 0.5 + 0.5) * width;
    const sy = (0.5 - (dot(v, u) / (z * t)) * 0.5) * height;
    const extent = (p.ring ? p.ring.outer : 1) * (p.dia / 2);
    const rpx = (extent / (z * t)) * (height / 2);
    const tol = Math.max(rpx * 1.1, 12);
    if (Math.hypot(sx - px, sy - py) <= tol && z < bestZ) {
      best = p;
      bestZ = z;
    }
  }
  return best;
}

let press: { x: number; y: number; lastX: number; lastY: number; moved: number; dragging: boolean } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  press = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: 0, dragging: false };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    // synthetic pointers may not support capture
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!press) return;
  const dx = e.clientX - press.lastX;
  const dy = e.clientY - press.lastY;
  press.lastX = e.clientX;
  press.lastY = e.clientY;
  press.moved = Math.hypot(e.clientX - press.x, e.clientY - press.y);
  if (press.moved > 4) press.dragging = true;
  if (press.dragging && !focused) {
    view.yaw -= dx * 0.008;
    view.pitch = clamp(view.pitch + dy * 0.006, 0.1, 1.45);
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!press) return;
  const wasClick = !press.dragging;
  press = null;
  if (!wasClick) return;
  const rect = canvas.getBoundingClientRect();
  const hit = pick(e.clientX - rect.left, e.clientY - rect.top, rect.width, rect.height);
  if (hit) focusPlanet(hit.name);
  else unfocus();
});

canvas.addEventListener("pointercancel", () => {
  press = null;
});

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused) return;
    view.dist = clamp(view.dist * Math.exp(e.deltaY * 0.0012), MIN_DIST, MAX_DIST);
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------------------------------------------------------------------------
// Startup
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  await app.ready();
  const map = new Map<string, PlanetHandles>();
  for (const p of PLANETS) {
    const entry: PlanetHandles = { body: app.nodes.require(`planet-${p.name}`) };
    if (p.ring) entry.ring = app.nodes.require(`ring-${p.name}`);
    if (p.moon) entry.moon = app.nodes.require(`moon-${p.name}`);
    map.set(p.name, entry);
  }
  handles = map;
  dirty = true;
  lastNow = performance.now();
  await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  ready = true;
  window.__EVAL_READY__ = true;
}

void start();
