import { camera, createAuraApp, effects, geometry, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

type V3 = [number, number, number];
type RGB = [number, number, number];
type ColorFn = (x: number, y: number, z: number) => RGB;

interface TaskState {
  readonly ready: boolean;
  readonly focused: string | null;
  readonly paused: boolean;
  readonly planets: { name: string; x: number; y: number; z: number }[];
  readonly cameraDistanceToFocus: number | null;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: TaskState;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

/* ---------------------------------------------------------------- helpers */

const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const hex = (s: string): RGB => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scaleRgb = (a: RGB, k: number): RGB => [a[0] * k, a[1] * k, a[2] * k];

const hash3 = (ix: number, iy: number, iz: number): number => {
  let h = Math.imul(ix, 374761393) ^ Math.imul(iy, 668265263) ^ Math.imul(iz, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1103515245);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const vnoise = (x: number, y: number, z: number): number => {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), sz = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number => hash3(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), sx), lerp(c(0, 1, 0), c(1, 1, 0), sx), sy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), sx), lerp(c(0, 1, 1), c(1, 1, 1), sx), sy),
    sz
  );
};
const fbm = (x: number, y: number, z: number): number => {
  let sum = 0, amp = 0.5, f = 1;
  for (let i = 0; i < 4; i += 1) {
    sum += amp * vnoise(x * f, y * f, z * f);
    f *= 2;
    amp *= 0.5;
  }
  return sum / 0.9375;
};

/* ------------------------------------------------- procedural surface looks */

const rocky = (c1: string, c2: string, seed: number, freq: number): ColorFn => {
  const a = hex(c1), b = hex(c2);
  return (x, y, z) => {
    const n = fbm(x * freq + seed, y * freq + seed * 1.7, z * freq - seed);
    const spots = vnoise(x * freq * 4 + seed, y * freq * 4, z * freq * 4);
    return scaleRgb(mix(a, b, smooth(0.3, 0.7, n)), 0.82 + 0.3 * spots);
  };
};

const banded = (cols: string[], seed: number, bands: number, warp: number): ColorFn => {
  const pal = cols.map(hex);
  return (x, y, z) => {
    const w = fbm(x * 2 + seed, y * 5, z * 2 - seed) - 0.5;
    const s = clamp01(0.5 + 0.5 * Math.sin((y + w * warp) * bands));
    const sc = s * (pal.length - 1);
    const i = Math.min(pal.length - 2, Math.floor(sc));
    return mix(pal[i]!, pal[i + 1]!, sc - i);
  };
};

const earthLook: ColorFn = (x, y, z) => {
  const n = fbm(x * 2.3 + 3.1, y * 2.3, z * 2.3 - 1.7);
  let c: RGB;
  if (n > 0.52) {
    c = mix(mix(hex("#3f8a3c"), hex("#7a7a3c"), smooth(0.52, 0.72, n)), hex("#bda877"), smooth(0.7, 0.85, n));
  } else {
    c = mix(hex("#0a2a68"), hex("#1f64b8"), smooth(0.25, 0.52, n));
  }
  const cloud = clamp01((fbm(x * 4.5 - 2, y * 3.5 + 5, z * 4.5) - 0.5) * 3);
  c = mix(c, [1, 1, 1], cloud * 0.65);
  return mix(c, [0.95, 0.97, 1], smooth(0.82, 0.92, Math.abs(y)));
};

/* ---------------------------------------------------------------- geometry */

const TWO_PI = Math.PI * 2;

function sphereGeometry(radius: number, look: ColorFn) {
  const W = 56, H = 36;
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (let iy = 0; iy <= H; iy += 1) {
    const v = iy / H;
    for (let ix = 0; ix <= W; ix += 1) {
      const u = ix / W;
      const x = -Math.cos(u * TWO_PI) * Math.sin(v * Math.PI);
      const y = Math.cos(v * Math.PI);
      const z = Math.sin(u * TWO_PI) * Math.sin(v * Math.PI);
      positions.push(x * radius, y * radius, z * radius);
      normals.push(x, y, z);
      colors.push(...look(x, y, z), 1);
    }
  }
  for (let iy = 0; iy < H; iy += 1) {
    for (let ix = 0; ix < W; ix += 1) {
      const a = iy * (W + 1) + ix + 1;
      const b = iy * (W + 1) + ix;
      const c = (iy + 1) * (W + 1) + ix;
      const d = (iy + 1) * (W + 1) + ix + 1;
      if (iy !== 0) indices.push(a, b, d);
      if (iy !== H - 1) indices.push(b, c, d);
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices,
    bounds: { min: [-radius, -radius, -radius], max: [radius, radius, radius] }
  });
}

/** Flat double-sided annulus in the XZ plane, with a colour per radial step. */
function annulusGeometry(rIn: number, rOut: number, rings: number, segs: number, colorAt: (t: number) => RGB) {
  const positions: number[] = [], normals: number[] = [], colors: number[] = [], indices: number[] = [];
  for (const side of [1, -1]) {
    const base = positions.length / 3;
    for (let i = 0; i <= rings; i += 1) {
      const t = i / rings;
      const r = rIn + (rOut - rIn) * t;
      const c = colorAt(t);
      for (let j = 0; j <= segs; j += 1) {
        const a = (j / segs) * TWO_PI;
        positions.push(Math.cos(a) * r, 0, Math.sin(a) * r);
        normals.push(0, side, 0);
        colors.push(c[0], c[1], c[2], 1);
      }
    }
    for (let i = 0; i < rings; i += 1) {
      for (let j = 0; j < segs; j += 1) {
        const a = base + i * (segs + 1) + j;
        const b = a + segs + 1;
        if (side > 0) indices.push(a, a + 1, b, a + 1, b + 1, b);
        else indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    colors: new Float32Array(colors),
    indices,
    bounds: { min: [-rOut, -0.1, -rOut], max: [rOut, 0.1, rOut] }
  });
}

/* -------------------------------------------------------------------- data */

interface Moon {
  readonly id: string;
  readonly size: number;
  readonly orbit: number;
  readonly omega: number;
  angle: number;
}

interface Planet {
  readonly name: string;
  readonly id: string;
  readonly radius: number;
  readonly orbit: number;
  readonly periodDays: number;
  readonly distanceMkm: number;
  readonly omega: number;
  readonly spinRate: number;
  readonly focusDistance: number;
  readonly ring: boolean;
  readonly look: ColorFn;
  readonly moons: Moon[];
  angle: number;
  spin: number;
  pos: V3;
}

const makePlanet = (
  name: string, radius: number, orbit: number, periodDays: number, distanceMkm: number,
  angle: number, spinRate: number, look: ColorFn, ring = false, moons: Omit<Moon, "id" | "angle">[] = []
): Planet => ({
  name,
  id: `planet-${name.toLowerCase()}`,
  radius,
  orbit,
  periodDays,
  distanceMkm,
  omega: 0.5 * Math.sqrt(88 / periodDays),
  spinRate,
  focusDistance: radius * (ring ? 7 : 5.5),
  ring,
  look,
  moons: moons.map((m, i) => ({ ...m, id: `moon-${name.toLowerCase()}-${i}`, angle: i * 2.1 })),
  angle,
  spin: 0,
  pos: [Math.cos(angle) * orbit, 0, Math.sin(angle) * orbit]
});

const planets: Planet[] = [
  makePlanet("Mercury", 1.2, 17, 88, 57.9, 0.6, 0.6, rocky("#9a948d", "#5b5651", 1.3, 3), false),
  makePlanet("Venus", 2.0, 25, 224.7, 108.2, 2.2, -0.25, banded(["#ecd09a", "#d3a465", "#f2deb4"], 4.1, 9, 1.4)),
  makePlanet("Earth", 2.2, 34, 365.25, 149.6, 3.9, 1.0, earthLook, false, [{ size: 1.1, orbit: 4.6, omega: 1.6 }]),
  makePlanet("Mars", 1.6, 43, 687, 227.9, 5.3, 0.95, rocky("#c9633d", "#7a3a25", 7.7, 2.6)),
  makePlanet("Jupiter", 5.2, 58, 4331, 778.6, 1.2, 1.5, banded(["#e8d2ac", "#b9855a", "#f5ead5", "#a8704a"], 2.2, 17, 1.1), false, [
    { size: 0.9, orbit: 8.2, omega: 1.2 },
    { size: 0.8, orbit: 11, omega: 0.75 }
  ]),
  makePlanet("Saturn", 4.4, 75, 10747, 1433.5, 4.5, 1.3, banded(["#e9d6a0", "#cdb27a", "#f1e3b8"], 6.6, 11, 0.6), true),
  makePlanet("Uranus", 3.0, 90, 30589, 2872.5, 2.9, -0.8, banded(["#a5e6e8", "#86d2da", "#b4eef0"], 9.3, 5, 0.3)),
  makePlanet("Neptune", 2.9, 104, 59800, 4495.1, 0.2, 0.9, banded(["#3b62d6", "#2b45a6", "#6f92f2"], 5.5, 8, 0.7))
];

/* ------------------------------------------------------------------- scene */

const FOV = 45;
const NEAR = 0.3;
const FAR = 3000;
const OVERVIEW_PITCH = 0.6;

let yaw = 0.5;
let pitch = OVERVIEW_PITCH;
let dist = 250;
const MIN_DIST = 70;
const MAX_DIST = 480;

const overviewGoal = (): { pos: V3; tgt: V3 } => ({
  pos: [dist * Math.cos(pitch) * Math.sin(yaw), dist * Math.sin(pitch), dist * Math.cos(pitch) * Math.cos(yaw)],
  tgt: [0, 0, 0]
});

let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const starGroups: { name: string; color: string; count: number }[] = [
  { name: "stars-white", color: "#ffffff", count: 420 },
  { name: "stars-blue", color: "#bcd4ff", count: 200 },
  { name: "stars-warm", color: "#ffddb0", count: 200 }
];

const initial = overviewGoal();
let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: initial.pos, target: initial.tgt, fov: FOV, near: NEAR, far: FAR }))
  .add(lights.hemisphere({ skyColor: "#8ea4ff", groundColor: "#1a1830", intensity: 0.35 }))
  .add(lights.point({ name: "starlight", position: [0, 0, 0], intensity: 3.5, decay: 0, color: "#fff1d8" }))
  .add(effects.bloom({ intensity: 0.7, threshold: 0.85, radius: 0.6 }));

for (const g of starGroups) {
  const transforms: AuraTransformSpec[] = [];
  for (let i = 0; i < g.count; i += 1) {
    const z = rand() * 2 - 1, a = rand() * TWO_PI, r = Math.sqrt(1 - z * z), d = 1100;
    const s = 3 + rand() * 4;
    transforms.push({ position: [Math.cos(a) * r * d, z * d, Math.sin(a) * r * d], scale: [s, s, s] });
  }
  sc = sc.add(instances.sphere({
    name: g.name,
    transforms,
    castShadow: false,
    receiveShadow: false,
    params: { widthSegments: 6, heightSegments: 4 },
    material: material.emissive({ color: g.color, emissive: g.color, emissiveIntensity: 1.4 })
  }));
}

sc = sc
  .add(primitives.sphere({
    name: "star",
    size: 16,
    castShadow: false,
    material: material.emissive({ color: "#ffd27a", emissive: "#ffb040", emissiveIntensity: 2.4 })
  }))
  .add(primitives.sphere({
    name: "star-corona",
    size: 21,
    castShadow: false,
    receiveShadow: false,
    material: material.emissive({ color: "#ff9a2e", emissive: "#ff9a2e", emissiveIntensity: 1.2, opacity: 0.16 })
  }));

const orbitMaterial = material.emissive({ color: "#3a4a74", emissive: "#6a86cc", emissiveIntensity: 0.9 });
const white = material.pbr({ color: "#ffffff", roughness: 0.9, metallic: 0 });
const moonMaterial = material.pbr({ color: "#b9b9bd", roughness: 0.9, metallic: 0 });
const ringColor = (t: number): RGB => {
  const gap = smooth(0.55, 0.6, t) * (1 - smooth(0.64, 0.7, t));
  const stripe = 0.85 + 0.15 * Math.sin(t * 40);
  const base = mix(hex("#9c8a64"), hex("#e7d8ae"), smooth(0, 0.45, t) * (1 - 0.35 * smooth(0.7, 1, t)));
  return scaleRgb(base, stripe * (1 - 0.75 * gap));
};

for (const p of planets) {
  const w = 0.45 + 0.006 * p.orbit;
  sc = sc.add(geometry.custom(
    annulusGeometry(p.orbit - w / 2, p.orbit + w / 2, 1, 192, () => [1, 1, 1]),
    { name: `orbit-${p.name.toLowerCase()}`, material: orbitMaterial, castShadow: false, receiveShadow: false }
  ));
  sc = sc.add(geometry.custom(sphereGeometry(p.radius, p.look), {
    name: p.name,
    material: white,
    castShadow: false,
    receiveShadow: false
  }).position(p.pos[0], p.pos[1], p.pos[2]).runtime({ id: p.id, mutable: true }));
  if (p.ring) {
    sc = sc.add(geometry.custom(annulusGeometry(p.radius * 1.4, p.radius * 2.4, 14, 96, ringColor), {
      name: `${p.name}-ring`,
      material: white,
      castShadow: false,
      receiveShadow: false
    }).position(p.pos[0], p.pos[1], p.pos[2]).rotate(0.42, 0, 0.2).runtime({ id: `${p.id}-ring`, mutable: true }));
  }
  for (const m of p.moons) {
    sc = sc.add(primitives.sphere({ name: m.id, size: m.size, material: moonMaterial, castShadow: false, receiveShadow: false })
      .position(p.pos[0] + m.orbit, 0, p.pos[2]).runtime({ id: m.id, mutable: true }));
  }
}

/* --------------------------------------------------------------- DOM / UI */

const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) throw new Error("canvas #app not found");

const panel = document.createElement("div");
panel.id = "info-panel";
panel.style.cssText = "position:absolute;left:10px;top:10px;width:190px;padding:10px 12px;background:rgba(10,14,30,0.82);border:1px solid rgba(140,170,255,0.5);border-radius:8px;color:#e8eeff;font:13px/1.45 system-ui,sans-serif;pointer-events:none;display:none;";
const panelName = document.createElement("div");
panelName.id = "info-name";
panelName.style.cssText = "font-size:17px;font-weight:600;margin-bottom:4px;";
const panelPeriod = document.createElement("div");
panelPeriod.id = "info-period";
const panelDistance = document.createElement("div");
panelDistance.id = "info-distance";
panel.append(panelName, panelPeriod, panelDistance);

const pauseButton = document.createElement("button");
pauseButton.id = "pause-toggle";
pauseButton.type = "button";
pauseButton.textContent = "Pause";
pauseButton.style.cssText = "position:absolute;left:560px;top:10px;width:70px;padding:5px 0;background:rgba(10,14,30,0.82);color:#e8eeff;border:1px solid rgba(140,170,255,0.6);border-radius:6px;font:13px system-ui,sans-serif;cursor:pointer;";

const hint = document.createElement("div");
hint.textContent = "Click a planet to focus. Esc: back to overview. Drag to orbit, scroll to zoom.";
hint.style.cssText = "position:absolute;left:10px;top:340px;color:rgba(200,215,255,0.65);font:11px system-ui,sans-serif;pointer-events:none;";

document.body.append(panel, pauseButton, hint);

/* ------------------------------------------------------------- app state */

let paused = false;
let focus: Planet | null = null;
let ready = false;

type Pose = { pos: V3; tgt: V3 };
const cur: Pose = { pos: [...initial.pos], tgt: [...initial.tgt] };
let from: Pose = { pos: [...cur.pos], tgt: [...cur.tgt] };
const TRANSITION = 1.5;
let transitionT = TRANSITION;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

const focusGoal = (p: Planet): Pose => {
  const len = Math.hypot(p.pos[0], p.pos[2]) || 1;
  const rx = p.pos[0] / len, rz = p.pos[2] / len;
  const tx = -rz, tz = rx;
  const dx = -0.55 * rx + 0.83 * tx, dz = -0.55 * rz + 0.83 * tz;
  const el = 0.28;
  const d = p.focusDistance;
  return {
    pos: [p.pos[0] + dx * d * Math.cos(el), p.pos[1] + d * Math.sin(el), p.pos[2] + dz * d * Math.cos(el)],
    tgt: [p.pos[0], p.pos[1], p.pos[2]]
  };
};

const startTransition = (): void => {
  from = { pos: [...cur.pos], tgt: [...cur.tgt] };
  transitionT = 0;
};

const showPanel = (p: Planet): void => {
  panelName.textContent = p.name;
  panelPeriod.textContent = `Orbital period: ${p.periodDays} Earth days`;
  panelDistance.textContent = `Distance from star: ${p.distanceMkm} million km`;
  panel.style.display = "block";
};

const focusOn = (p: Planet): void => {
  if (focus === p) return;
  focus = p;
  showPanel(p);
  startTransition();
};

const unfocus = (): void => {
  if (focus === null) return;
  focus = null;
  panel.style.display = "none";
  startTransition();
};

const focusByName = (name: string): void => {
  const p = planets.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
  if (p) focusOn(p);
};

/* ----------------------------------------------------------------- picking */

function pickPlanet(clientX: number, clientY: number): Planet | null {
  const rect = canvas!.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) return null;
  const sx = clientX - rect.left, sy = clientY - rect.top;
  const aspect = rect.width / rect.height;
  const t = Math.tan((FOV * Math.PI) / 360);
  let f: V3 = [cur.tgt[0] - cur.pos[0], cur.tgt[1] - cur.pos[1], cur.tgt[2] - cur.pos[2]];
  const fl = Math.hypot(...f) || 1;
  f = [f[0] / fl, f[1] / fl, f[2] / fl];
  let r: V3 = [f[1] * 0 - f[2] * 1, f[2] * 0 - f[0] * 0, f[0] * 1 - f[1] * 0];
  const rl = Math.hypot(...r) || 1;
  r = [r[0] / rl, r[1] / rl, r[2] / rl];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  let best: Planet | null = null;
  let bestDepth = Infinity;
  for (const p of planets) {
    const d: V3 = [p.pos[0] - cur.pos[0], p.pos[1] - cur.pos[1], p.pos[2] - cur.pos[2]];
    const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
    if (z <= NEAR) continue;
    const nx = (d[0] * r[0] + d[1] * r[1] + d[2] * r[2]) / (z * t * aspect);
    const ny = (d[0] * u[0] + d[1] * u[1] + d[2] * u[2]) / (z * t);
    const px = (nx * 0.5 + 0.5) * rect.width;
    const py = (0.5 - ny * 0.5) * rect.height;
    const pxRadius = (p.radius / (z * t)) * (rect.height / 2);
    const tol = Math.max(pxRadius * 1.1, 9);
    if (Math.hypot(px - sx, py - sy) <= tol && z < bestDepth) {
      best = p;
      bestDepth = z;
    }
  }
  return best;
}

const handleClick = (clientX: number, clientY: number): void => {
  const hit = pickPlanet(clientX, clientY);
  if (hit) focusOn(hit);
  else unfocus();
};

let down: { x: number; y: number; lastX: number; lastY: number; moved: boolean } | null = null;

canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, lastX: e.clientX, lastY: e.clientY, moved: false };
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic pointers may not be capturable */
  }
});
canvas.addEventListener("pointermove", (e) => {
  if (!down) return;
  if (!down.moved && Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
  if (down.moved && focus === null) {
    yaw -= (e.clientX - down.lastX) * 0.006;
    pitch = Math.min(1.45, Math.max(0.12, pitch + (e.clientY - down.lastY) * 0.005));
  }
  down.lastX = e.clientX;
  down.lastY = e.clientY;
});
canvas.addEventListener("pointerup", (e) => {
  const d = down;
  down = null;
  try {
    canvas.releasePointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
  if (d && !d.moved) handleClick(e.clientX, e.clientY);
});
canvas.addEventListener("pointercancel", () => {
  down = null;
});
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (focus !== null) return;
  dist = Math.min(MAX_DIST, Math.max(MIN_DIST, dist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});
pauseButton.addEventListener("click", () => {
  paused = !paused;
  pauseButton.textContent = paused ? "Play" : "Pause";
});

/* ------------------------------------------------------------ exposed API */

const taskState = {} as { -readonly [K in keyof TaskState]: TaskState[K] };
Object.defineProperties(taskState, {
  ready: { get: () => ready, enumerable: true },
  focused: { get: () => (focus ? focus.name : null), enumerable: true },
  paused: { get: () => paused, enumerable: true },
  planets: { get: () => planets.map((p) => ({ name: p.name, x: p.pos[0], y: p.pos[1], z: p.pos[2] })), enumerable: true },
  cameraDistanceToFocus: {
    get: () => (focus ? Math.hypot(cur.pos[0] - focus.pos[0], cur.pos[1] - focus.pos[1], cur.pos[2] - focus.pos[2]) : null),
    enumerable: true
  }
});
Object.defineProperty(window, "__TASK_STATE__", { value: taskState, writable: false, configurable: false, enumerable: true });
window.__focusPlanet = focusByName;
window.__unfocus = unfocus;

/* -------------------------------------------------------------------- app */

const app = createAuraApp("#app", { scene: sc });

type CameraRig = Parameters<NonNullable<typeof app.camera>["use"]>[0];
const rig: CameraRig = {
  id: "solar-explorer",
  continuous: true,
  update: () => ({
    position: [cur.pos[0], cur.pos[1], cur.pos[2]],
    target: [cur.tgt[0], cur.tgt[1], cur.tgt[2]],
    up: [0, 1, 0],
    roll: 0,
    fov: FOV,
    near: NEAR,
    far: FAR
  })
};
app.camera?.use(rig);

const setNode = (id: string, pos: V3, rotY?: number): void => {
  const h = app.nodes.get(id);
  if (!h) return;
  h.setPosition(pos[0], pos[1], pos[2]);
  if (rotY !== undefined) h.setRotation(0, rotY, 0);
};

app.onFrame((f) => {
  const dt = Math.min(Math.max(f.dt, 0), 0.25);

  if (!paused) {
    for (const p of planets) {
      p.angle += p.omega * dt;
      p.spin += p.spinRate * dt;
      p.pos = [Math.cos(p.angle) * p.orbit, 0, Math.sin(p.angle) * p.orbit];
      for (const m of p.moons) m.angle += m.omega * dt;
    }
  }

  for (const p of planets) {
    setNode(p.id, p.pos, p.spin);
    if (p.ring) setNode(`${p.id}-ring`, p.pos);
    for (const m of p.moons) {
      const tilt = 0.2;
      setNode(m.id, [
        p.pos[0] + Math.cos(m.angle) * m.orbit,
        p.pos[1] + Math.sin(m.angle) * m.orbit * Math.sin(tilt),
        p.pos[2] + Math.sin(m.angle) * m.orbit * Math.cos(tilt)
      ]);
    }
  }

  const goal = focus ? focusGoal(focus) : overviewGoal();
  if (transitionT < TRANSITION) {
    transitionT = Math.min(TRANSITION, transitionT + dt);
    const e = easeInOutCubic(transitionT / TRANSITION);
    for (let i = 0; i < 3; i += 1) {
      cur.pos[i] = lerp(from.pos[i]!, goal.pos[i]!, e);
      cur.tgt[i] = lerp(from.tgt[i]!, goal.tgt[i]!, e);
    }
  } else {
    cur.pos = [...goal.pos];
    cur.tgt = [...goal.tgt];
  }
});

await app.ready();
await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
ready = true;
window.__EVAL_READY__ = true;
