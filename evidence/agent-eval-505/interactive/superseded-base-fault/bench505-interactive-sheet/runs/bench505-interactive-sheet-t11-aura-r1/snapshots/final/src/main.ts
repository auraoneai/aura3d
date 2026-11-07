import {
  camera,
  createAuraApp,
  effects,
  geometry,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

/* ------------------------------------------------------------------ */
/* Data                                                                */
/* ------------------------------------------------------------------ */

type Kind = "rocky" | "venus" | "earth" | "gas";
type Vec3 = [number, number, number];

interface MoonSpec {
  name: string;
  radius: number;
  orbit: number;
  period: number; // simulated seconds per revolution
  color: string;
}

interface PlanetSpec {
  name: string;
  radius: number;
  orbit: number; // scene units
  periodDays: number;
  distanceMkm: number;
  kind: Kind;
  c1: string;
  c2: string;
  spin: number; // rad / s
  phase: number;
  ring?: { inner: number; outer: number };
  moons: MoonSpec[];
}

const PLANETS: PlanetSpec[] = [
  { name: "Mercury", radius: 0.8, orbit: 9, periodDays: 87.97, distanceMkm: 57.9, kind: "rocky", c1: "#9a948c", c2: "#5d5953", spin: 0.5, phase: 0.4, moons: [] },
  { name: "Venus", radius: 1.3, orbit: 13, periodDays: 224.7, distanceMkm: 108.2, kind: "venus", c1: "#dcb870", c2: "#f0dca8", spin: -0.3, phase: 1.7, moons: [] },
  { name: "Earth", radius: 1.4, orbit: 18, periodDays: 365.25, distanceMkm: 149.6, kind: "earth", c1: "#2a62b8", c2: "#3f8a3c", spin: 1.4, phase: 2.9, moons: [{ name: "Moon", radius: 0.4, orbit: 3.1, period: 5, color: "#b5b5b5" }] },
  { name: "Mars", radius: 1.0, orbit: 23, periodDays: 686.98, distanceMkm: 227.9, kind: "rocky", c1: "#c4603c", c2: "#7a3a24", spin: 1.3, phase: 4.1, moons: [] },
  { name: "Jupiter", radius: 3.2, orbit: 33, periodDays: 4332.6, distanceMkm: 778.6, kind: "gas", c1: "#d3a97c", c2: "#8f5d3d", spin: 2.2, phase: 5.2, moons: [{ name: "Io", radius: 0.5, orbit: 6.4, period: 8, color: "#d8c46a" }] },
  { name: "Saturn", radius: 2.6, orbit: 44, periodDays: 10759, distanceMkm: 1433.5, kind: "gas", c1: "#e6d29c", c2: "#b89c64", spin: 2.0, phase: 0.9, ring: { inner: 3.5, outer: 6.2 }, moons: [] },
  { name: "Uranus", radius: 1.9, orbit: 53, periodDays: 30687, distanceMkm: 2872.5, kind: "gas", c1: "#a4e3e8", c2: "#7ecbd6", spin: 1.2, phase: 3.6, moons: [] },
  { name: "Neptune", radius: 1.8, orbit: 61, periodDays: 60190, distanceMkm: 4495.1, kind: "gas", c1: "#4668d8", c2: "#2b44a0", spin: 1.3, phase: 6.0, moons: [] }
];

const STAR_RADIUS = 4.5;
const BASE_PERIOD = 12; // simulated seconds for Mercury's orbit
const orbitSeconds = (days: number): number => BASE_PERIOD * Math.pow(days / PLANETS[0]!.periodDays, 0.6);

/* ------------------------------------------------------------------ */
/* Procedural geometry                                                 */
/* ------------------------------------------------------------------ */

const hexRgb = (hex: string): Vec3 => {
  const n = parseInt(hex.slice(1), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
};
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));

const hash3 = (x: number, y: number, z: number): number => {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(z, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};
const noise3 = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = x - xi, fy = y - yi, fz = z - zi;
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy), w = fz * fz * (3 - 2 * fz);
  const l = (a: number, b: number, t: number): number => a + (b - a) * t;
  return l(
    l(l(hash3(xi, yi, zi), hash3(xi + 1, yi, zi), u), l(hash3(xi, yi + 1, zi), hash3(xi + 1, yi + 1, zi), u), v),
    l(l(hash3(xi, yi, zi + 1), hash3(xi + 1, yi, zi + 1), u), l(hash3(xi, yi + 1, zi + 1), hash3(xi + 1, yi + 1, zi + 1), u), v),
    w
  );
};
const fbm = (x: number, y: number, z: number): number =>
  (0.5 * noise3(x, y, z) + 0.25 * noise3(x * 2, y * 2, z * 2) + 0.125 * noise3(x * 4, y * 4, z * 4)) / 0.875;

const shade = (kind: Kind | "moon", c1: Vec3, c2: Vec3, x: number, y: number, z: number): Vec3 => {
  if (kind === "rocky" || kind === "moon") {
    const n = fbm(x * 4 + 3, y * 4, z * 4);
    const crater = fbm(x * 9, y * 9 + 5, z * 9);
    const k = 0.65 + 0.7 * n - (crater > 0.66 ? 0.18 : 0);
    return mix3([c1[0] * k, c1[1] * k, c1[2] * k], c2, clamp01((n - 0.55) * 2) * 0.5);
  }
  if (kind === "venus") {
    const n = fbm(x * 2, y * 7, z * 2);
    return mix3(c1, c2, clamp01(n * 1.4 - 0.1));
  }
  if (kind === "earth") {
    const n = fbm(x * 2.2 + 7, y * 2.2, z * 2.2);
    if (Math.abs(y) > 0.86 + 0.05 * noise3(x * 6, 0, z * 6)) return [0.93, 0.95, 0.98];
    if (n > 0.52) {
      const h = clamp01((n - 0.52) * 4);
      return mix3(c2, [0.55, 0.45, 0.3], h);
    }
    return mix3([0.1, 0.25, 0.55], c1, clamp01(n * 1.6));
  }
  const warp = fbm(x * 3, y * 1.5, z * 3) * 3.5;
  const band = 0.5 + 0.5 * Math.sin(y * 15 + warp);
  const fine = 0.5 + 0.5 * Math.sin(y * 41 + warp * 2);
  return mix3(mix3(c1, c2, band), c1, fine * 0.25);
};

const sphereGeometry = (radius: number, kind: Kind | "moon", colA: string, colB: string) => {
  const N = 32, M = 64;
  const count = (N + 1) * (M + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices: number[] = [];
  const a = hexRgb(colA), b = hexRgb(colB);
  for (let i = 0; i <= N; i += 1) {
    const th = (i / N) * Math.PI;
    for (let j = 0; j <= M; j += 1) {
      const ph = (j / M) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph), y = Math.cos(th), z = Math.sin(th) * Math.sin(ph);
      const v = i * (M + 1) + j;
      positions.set([x * radius, y * radius, z * radius], v * 3);
      normals.set([x, y, z], v * 3);
      colors.set([...shade(kind, a, b, x, y, z), 1], v * 4);
      if (i < N && j < M) {
        const p = v, q = v + M + 1;
        indices.push(p, p + 1, q, p + 1, q + 1, q);
      }
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] }
  });
};

/** Flat annulus in the XZ plane, visible from both sides. */
const annulusGeometry = (inner: number, outer: number, segs: number, colorAt?: (t: number) => [number, number, number, number]) => {
  const perSide = (segs + 1) * 2;
  const positions = new Float32Array(perSide * 2 * 3);
  const normals = new Float32Array(perSide * 2 * 3);
  const colors = colorAt ? new Float32Array(perSide * 2 * 4) : undefined;
  const indices: number[] = [];
  for (let side = 0; side < 2; side += 1) {
    const base = side * perSide;
    const ny = side === 0 ? 1 : -1;
    for (let i = 0; i <= segs; i += 1) {
      const ang = (i / segs) * Math.PI * 2;
      const c = Math.cos(ang), s = Math.sin(ang);
      for (let k = 0; k < 2; k += 1) {
        const r = k === 0 ? inner : outer;
        const v = base + i * 2 + k;
        positions.set([c * r, 0, s * r], v * 3);
        normals.set([0, ny, 0], v * 3);
        if (colors && colorAt) colors.set(colorAt(k), v * 4);
      }
      if (i < segs) {
        const a = base + i * 2; // inner_i, outer_i = a + 1, inner_n = a + 2, outer_n = a + 3
        if (side === 0) indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
        else indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
  }
  return geometry.define({
    positions,
    normals,
    ...(colors ? { colors } : {}),
    indices,
    bounds: { min: [-outer, -0.05, -outer], max: [outer, 0.05, outer] }
  });
};

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type Kid = Parameters<typeof group>[1][number];

const litWhite = material.pbr({ color: "#ffffff", roughness: 0.85, metallic: 0 });
const systemKids: Kid[] = [];

// Star with halo.
systemKids.push(
  primitives.sphere({
    name: "star",
    size: STAR_RADIUS * 2,
    material: material.emissive({ color: "#ffb43a", emissive: "#ff9a1a", emissiveIntensity: 2.6 }),
    castShadow: false
  }),
  primitives.sphere({
    name: "star-halo-1",
    size: STAR_RADIUS * 2.35,
    material: material.emissive({ color: "#ffb040", emissive: "#ff9a1a", emissiveIntensity: 1.5, opacity: 0.22 }),
    castShadow: false
  }),
  primitives.sphere({
    name: "star-halo-2",
    size: STAR_RADIUS * 3.1,
    material: material.emissive({ color: "#ff8a20", emissive: "#ff7a10", emissiveIntensity: 1.2, opacity: 0.09 }),
    castShadow: false
  })
);

const orbitMat = material.emissive({ color: "#6f86b8", emissive: "#6f86b8", emissiveIntensity: 0.7 });

for (const p of PLANETS) {
  systemKids.push(
    geometry.custom(annulusGeometry(p.orbit - 0.13, p.orbit + 0.13, 180), {
      name: `orbit-${p.name}`,
      material: orbitMat,
      castShadow: false,
      receiveShadow: false
    })
  );

  const kids: Kid[] = [
    geometry
      .custom(sphereGeometry(p.radius, p.kind, p.c1, p.c2), { name: `body-${p.name}`, material: litWhite })
      .runtime({ id: `spin-${p.name}`, mutable: true })
  ];
  if (p.ring) {
    const ringGeo = annulusGeometry(p.ring.inner, p.ring.outer, 96, (k) => {
      // vertex k: 0 = inner edge, 1 = outer edge; alternate bands across the width
      return k === 0 ? [0.86, 0.78, 0.6, 1] : [0.55, 0.47, 0.35, 1];
    });
    kids.push(geometry.custom(ringGeo, { name: `ring-${p.name}`, material: litWhite }).rotate(0.42, 0, 0.18));
    // second, narrower brighter band
    const ring2 = annulusGeometry(p.ring.inner + 0.3, p.ring.inner + 1.3, 96, () => [0.95, 0.88, 0.7, 1]);
    kids.push(geometry.custom(ring2, { name: `ring2-${p.name}`, material: litWhite }).rotate(0.42, 0, 0.18).position(0, 0.02, 0));
  }
  for (const m of p.moons) {
    kids.push(
      group(
        `moonpivot-${p.name}`,
        [geometry.custom(sphereGeometry(m.radius, "moon", m.color, "#6b6b6b"), { name: `moon-${m.name}`, material: litWhite }).position(m.orbit, 0, 0)],
        { position: [0, 0, 0] }
      ).runtime({ id: `moonpivot-${p.name}`, mutable: true })
    );
  }
  systemKids.push(group(`planet-${p.name}`, kids, { position: [p.orbit, 0, 0] }).runtime({ id: `planet-${p.name}`, mutable: true }));
}

// Starfield (rotates with the camera, never translates).
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const starTransforms: AuraTransformSpec[] = [];
for (let i = 0; i < 700; i += 1) {
  const u = rand() * 2 - 1, a = rand() * Math.PI * 2, s = Math.sqrt(1 - u * u);
  const size = 1.6 + rand() * rand() * 4.5;
  starTransforms.push({ position: [Math.cos(a) * s * 1200, u * 1200, Math.sin(a) * s * 1200], scale: [size, size, size] });
}
const starfield = instances.sphere({
  name: "starfield",
  transforms: starTransforms,
  material: material.emissive({ color: "#dfe8ff", emissive: "#dfe8ff", emissiveIntensity: 1.2 }),
  castShadow: false
});

const sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: [0, 0, 0], target: [0, 0, -1], fov: 45, near: 0.1, far: 4000 }))
  .add(lights.ambient({ intensity: 0.35, color: "#9fb0d8" }))
  .add(lights.point({ name: "star-light", position: [0, 0, 0], intensity: 40, distance: 600, decay: 1, color: "#fff0d8", shadow: false }).runtime({ id: "star-light", mutable: true }))
  .add(effects.bloom({ intensity: 0.55, threshold: 0.9, radius: 0.5 }))
  .add(
    group(
      "view-x",
      [group("view-y", [starfield, group("view-t", systemKids).runtime({ id: "view-t", mutable: true })]).runtime({ id: "view-y", mutable: true })]
    ).runtime({ id: "view-x", mutable: true })
  );

const app = createAuraApp("#app", { scene: sc });

/* ------------------------------------------------------------------ */
/* Camera model (virtual camera: the world is moved inversely)         */
/* ------------------------------------------------------------------ */

interface Cam { t: Vec3; yaw: number; pitch: number; dist: number }

const ov = { yaw: 0.5, pitch: 0.72, dist: 140 };
const DIST_MIN = 45, DIST_MAX = 260;
const FOV = (45 * Math.PI) / 180;
const TAN_HALF = Math.tan(FOV / 2);
const canvas = document.getElementById("app") as HTMLCanvasElement;

let cam: Cam = { t: [0, 0, 0], yaw: ov.yaw, pitch: ov.pitch, dist: ov.dist };
let focused = -1;
let paused = false;
let simT = 0;
let trans: { t: number; from: Cam } | null = null;
const FOCUS_SECONDS = 1.5;

const planetPos: Vec3[] = PLANETS.map((p) => [p.orbit, 0, 0]);

const camPos = (c: Cam): Vec3 => [
  c.t[0] + c.dist * Math.cos(c.pitch) * Math.sin(c.yaw),
  c.t[1] + c.dist * Math.sin(c.pitch),
  c.t[2] + c.dist * Math.cos(c.pitch) * Math.cos(c.yaw)
];

/** World point to camera space (camera looks down -Z). */
const toView = (w: Vec3, c: Cam): Vec3 => {
  const p = camPos(c);
  const dx = w[0] - p[0], dy = w[1] - p[1], dz = w[2] - p[2];
  const cy = Math.cos(c.yaw), sy = Math.sin(c.yaw);
  const x1 = dx * cy - dz * sy;
  const z1 = dx * sy + dz * cy;
  const cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
  return [x1, dy * cp - z1 * sp, dy * sp + z1 * cp];
};

const focusDistance = (i: number): number => Math.max(PLANETS[i]!.radius * 4.5, 4);
const focusCam = (i: number): Cam => {
  const pp = planetPos[i]!;
  return { t: [pp[0], pp[1], pp[2]], yaw: Math.atan2(-pp[0], -pp[2]) + 0.7, pitch: 0.25, dist: focusDistance(i) };
};
const overviewCam = (): Cam => ({ t: [0, 0, 0], yaw: ov.yaw, pitch: ov.pitch, dist: ov.dist });

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpAngle = (a: number, b: number, t: number): number => {
  const d = ((((b - a) % (Math.PI * 2)) + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  return a + d * t;
};
const ease = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const mixCam = (a: Cam, b: Cam, t: number): Cam => ({
  t: [lerp(a.t[0], b.t[0], t), lerp(a.t[1], b.t[1], t), lerp(a.t[2], b.t[2], t)],
  yaw: lerpAngle(a.yaw, b.yaw, t),
  pitch: lerp(a.pitch, b.pitch, t),
  dist: lerp(a.dist, b.dist, t)
});

/* ------------------------------------------------------------------ */
/* UI                                                                  */
/* ------------------------------------------------------------------ */

const panel = document.createElement("div");
panel.id = "info-panel";
panel.hidden = true;
panel.style.cssText =
  "position:absolute;left:8px;top:8px;width:196px;padding:8px 10px;background:rgba(10,14,30,0.78);border:1px solid #4a5a8a;border-radius:6px;color:#e8eeff;font:12px/1.5 system-ui,sans-serif;pointer-events:none;";
document.body.appendChild(panel);

const button = document.createElement("button");
button.id = "pause-btn";
button.type = "button";
button.textContent = "Pause";
button.style.cssText =
  "position:absolute;left:572px;top:8px;width:60px;padding:4px 0;background:rgba(10,14,30,0.78);border:1px solid #4a5a8a;border-radius:6px;color:#e8eeff;font:12px system-ui,sans-serif;cursor:pointer;";
button.addEventListener("click", () => {
  paused = !paused;
  button.textContent = paused ? "Play" : "Pause";
  button.blur();
});
document.body.appendChild(button);

const hint = document.createElement("div");
hint.textContent = "Click a planet to focus · Esc or empty space to return · drag / scroll in overview";
hint.style.cssText = "position:absolute;left:8px;top:338px;color:#8f9cc4;font:11px system-ui,sans-serif;pointer-events:none;";
document.body.appendChild(hint);

const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 2 });
const showPanel = (i: number): void => {
  const p = PLANETS[i]!;
  panel.innerHTML =
    `<div style="font-size:15px;font-weight:600;margin-bottom:2px" id="info-name"></div>` +
    `<div>Orbital period: <b>${fmt(p.periodDays)}</b> Earth days</div>` +
    `<div>Distance from star: <b>${fmt(p.distanceMkm)}</b> million km</div>`;
  const nameEl = panel.querySelector("#info-name");
  if (nameEl) nameEl.textContent = p.name;
  panel.hidden = false;
};

/* ------------------------------------------------------------------ */
/* Focus control                                                       */
/* ------------------------------------------------------------------ */

const focusIndex = (i: number): void => {
  if (i < 0 || i >= PLANETS.length || i === focused) return;
  focused = i;
  trans = { t: 0, from: { ...cam, t: [...cam.t] as Vec3 } };
  showPanel(i);
};
const unfocus = (): void => {
  if (focused < 0) return;
  focused = -1;
  trans = { t: 0, from: { ...cam, t: [...cam.t] as Vec3 } };
  panel.hidden = true;
};
const focusByName = (name: string): void => {
  const key = String(name).trim().toLowerCase();
  focusIndex(PLANETS.findIndex((p) => p.name.toLowerCase() === key));
};

const pickPlanet = (px: number, py: number): number => {
  const W = canvas.clientWidth || 640, H = canvas.clientHeight || 360;
  const f = H / 2 / TAN_HALF;
  let best = -1, bestDepth = Infinity;
  PLANETS.forEach((p, i) => {
    const v = toView(planetPos[i]!, cam);
    const depth = -v[2];
    if (depth < 0.2) return;
    const sx = W / 2 + (v[0] / depth) * f;
    const sy = H / 2 - (v[1] / depth) * f;
    const rpx = Math.max((p.radius / depth) * f, 9) + 3;
    if (Math.hypot(sx - px, sy - py) <= rpx && depth < bestDepth) {
      best = i;
      bestDepth = depth;
    }
  });
  return best;
};

const onClick = (px: number, py: number): void => {
  const hit = pickPlanet(px, py);
  if (hit >= 0) focusIndex(hit);
  else unfocus();
};

let down: { id: number; x: number; y: number; lx: number; ly: number; moved: boolean } | null = null;
const local = (e: PointerEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * (canvas.clientWidth || 640)) / (r.width || 640), ((e.clientY - r.top) * (canvas.clientHeight || 360)) / (r.height || 360)];
};
canvas.addEventListener("pointerdown", (e) => {
  const [x, y] = local(e);
  down = { id: e.pointerId, x, y, lx: x, ly: y, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
});
canvas.addEventListener("pointermove", (e) => {
  if (!down || down.id !== e.pointerId) return;
  const [x, y] = local(e);
  if (Math.hypot(x - down.x, y - down.y) > 4) down.moved = true;
  if (down.moved && focused < 0) {
    ov.yaw -= (x - down.lx) * 0.008;
    ov.pitch = Math.min(1.45, Math.max(0.08, ov.pitch + (y - down.ly) * 0.006));
  }
  down.lx = x;
  down.ly = y;
});
const endPointer = (e: PointerEvent, cancelled: boolean): void => {
  if (!down || down.id !== e.pointerId) return;
  const d = down;
  down = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  if (!cancelled && !d.moved) onClick(d.x, d.y);
};
canvas.addEventListener("pointerup", (e) => endPointer(e, false));
canvas.addEventListener("pointercancel", (e) => endPointer(e, true));
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused >= 0) return;
    ov.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, ov.dist * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

/* ------------------------------------------------------------------ */
/* Globals for tests                                                   */
/* ------------------------------------------------------------------ */

let ready = false;
const taskState = Object.defineProperties(
  {},
  {
    ready: { get: () => ready, enumerable: true },
    focused: { get: () => (focused >= 0 ? PLANETS[focused]!.name : null), enumerable: true },
    paused: { get: () => paused, enumerable: true },
    planets: {
      get: () => PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] })),
      enumerable: true
    },
    cameraDistanceToFocus: {
      get: () => {
        if (focused < 0) return null;
        const c = camPos(cam), pp = planetPos[focused]!;
        return Math.hypot(c[0] - pp[0], c[1] - pp[1], c[2] - pp[2]);
      },
      enumerable: true
    }
  }
);
Object.defineProperty(window, "__TASK_STATE__", { value: Object.freeze(taskState), writable: false, configurable: false, enumerable: true });
window.__focusPlanet = focusByName;
window.__unfocus = unfocus;

/* ------------------------------------------------------------------ */
/* Frame loop                                                          */
/* ------------------------------------------------------------------ */

let frames = 0;
app.onFrame((f: { dt: number }) => {
  const dt = Math.min(Math.max(f.dt, 0), 0.1);
  if (!paused) simT += dt;

  PLANETS.forEach((p, i) => {
    const ang = p.phase + (simT * Math.PI * 2) / orbitSeconds(p.periodDays);
    const pos: Vec3 = [Math.cos(ang) * p.orbit, 0, -Math.sin(ang) * p.orbit];
    planetPos[i] = pos;
    app.nodes.require(`planet-${p.name}`).setPosition(pos[0], pos[1], pos[2]);
    app.nodes.require(`spin-${p.name}`).setRotation(0, simT * p.spin, 0);
    for (const m of p.moons) {
      app.nodes.require(`moonpivot-${p.name}`).setRotation(0, (simT * Math.PI * 2) / m.period, 0);
    }
  });

  if (trans) {
    trans.t += dt;
    const k = Math.min(1, trans.t / FOCUS_SECONDS);
    const end = focused >= 0 ? focusCam(focused) : overviewCam();
    cam = mixCam(trans.from, end, ease(k));
    if (k >= 1) trans = null;
  } else {
    cam = focused >= 0 ? focusCam(focused) : overviewCam();
  }

  const p = camPos(cam);
  app.nodes.require("view-x").setRotation(cam.pitch, 0, 0);
  app.nodes.require("view-y").setRotation(0, -cam.yaw, 0);
  app.nodes.require("view-t").setPosition(-p[0], -p[1], -p[2]);
  const s = toView([0, 0, 0], cam);
  app.nodes.require("star-light").setPosition(s[0], s[1], s[2]);

  frames += 1;
  if (frames === 2) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
