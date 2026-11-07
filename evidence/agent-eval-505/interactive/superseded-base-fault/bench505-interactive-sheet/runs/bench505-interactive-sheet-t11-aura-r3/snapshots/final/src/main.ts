import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

type V3 = [number, number, number];
type Kids = Parameters<typeof group>[1];

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

// ---------------------------------------------------------------- data
interface MoonDef { name: string; orbit: number; r: number; period: number; phase: number; color: string }
interface PlanetDef {
  name: string;
  r: number; // scene radius
  a: number; // scene orbital radius
  periodDays: number;
  distMkm: number;
  color: string;
  spot: string;
  phase: number;
  spin: number; // rad/s
  ring?: { tilt: number; colors: [string, string] };
  moons: MoonDef[];
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", r: 0.8, a: 12, periodDays: 87.97, distMkm: 57.9, color: "#9a948c", spot: "#6f6a64", phase: 0.5, spin: 0.6, moons: [] },
  { name: "Venus", r: 1.5, a: 17, periodDays: 224.7, distMkm: 108.2, color: "#d9b36c", spot: "#ecd29a", phase: 2.1, spin: -0.4, moons: [] },
  {
    name: "Earth", r: 1.6, a: 22, periodDays: 365.25, distMkm: 149.6, color: "#2f6fcb", spot: "#3f9a4c", phase: 3.7, spin: 1.2,
    moons: [{ name: "Moon", orbit: 3.4, r: 0.42, period: 5, phase: 0.8, color: "#c9c9c9" }]
  },
  { name: "Mars", r: 1.1, a: 28, periodDays: 687, distMkm: 227.9, color: "#c1502e", spot: "#8d3519", phase: 5.0, spin: 1.1, moons: [] },
  {
    name: "Jupiter", r: 4.0, a: 40, periodDays: 4331, distMkm: 778.5, color: "#d2a97c", spot: "#a8663f", phase: 1.0, spin: 2.0,
    moons: [
      { name: "Io", orbit: 6.4, r: 0.5, period: 4, phase: 0.3, color: "#e6d27a" },
      { name: "Europa", orbit: 8.2, r: 0.45, period: 6.5, phase: 3.0, color: "#d8cfc0" }
    ]
  },
  {
    name: "Saturn", r: 3.4, a: 52, periodDays: 10747, distMkm: 1434, color: "#e0c98f", spot: "#bfa467", phase: 2.8, spin: 1.8,
    ring: { tilt: 0.45, colors: ["#cdb98a", "#a69373"] }, moons: []
  },
  { name: "Uranus", r: 2.3, a: 63, periodDays: 30589, distMkm: 2871, color: "#8fd6dc", spot: "#6fb8c2", phase: 4.4, spin: -0.9, moons: [] },
  { name: "Neptune", r: 2.2, a: 73, periodDays: 59800, distMkm: 4495, color: "#3d57d6", spot: "#6b86f0", phase: 5.7, spin: 0.9, moons: [] }
];

const SUN_R = 6;
const EARTH_SECONDS = 24; // simulated seconds for one Earth year
const omegaOf = (p: PlanetDef): number => (Math.PI * 2) / (EARTH_SECONDS * Math.pow(p.periodDays / 365.25, 0.55));

// ---------------------------------------------------------------- simulation state
let simT = 0;
let paused = false;
let focused: string | null = null;

const planetPos: V3[] = PLANETS.map(() => [0, 0, 0]);
const moonPos: V3[][] = PLANETS.map((p) => p.moons.map((): V3 => [0, 0, 0]));

function updateBodies(): void {
  PLANETS.forEach((p, i) => {
    const ang = p.phase + omegaOf(p) * simT;
    const pos = planetPos[i]!;
    pos[0] = Math.cos(ang) * p.a;
    pos[1] = 0;
    pos[2] = Math.sin(ang) * p.a;
    p.moons.forEach((m, j) => {
      const ma = m.phase + ((Math.PI * 2) / m.period) * simT;
      const mp = moonPos[i]![j]!;
      mp[0] = pos[0] + Math.cos(ma) * m.orbit;
      mp[1] = Math.sin(ma) * m.orbit * 0.12;
      mp[2] = pos[2] + Math.sin(ma) * m.orbit;
    });
  });
}
updateBodies();

// ---------------------------------------------------------------- camera model
// The engine camera is fixed at the origin looking down -z. The view is produced by
// transforming the world: root(0,0,-dist) > pitch(rx) > yaw(ry) > pan(-focus) > content.
interface View { yaw: number; pitch: number; dist: number; fx: number; fy: number; fz: number }
const FOV = 45;
const TAN_H = Math.tan((FOV * Math.PI) / 360);
const EASE_SECONDS = 1.5;

const OVERVIEW_DIST_DEFAULT = 150;
const OVERVIEW_DIST_MIN = 55;
const OVERVIEW_DIST_MAX = 300;
let overviewYaw = 0.3;
let overviewPitch = 0.6;
let overviewDist = OVERVIEW_DIST_DEFAULT;

const live: View = { yaw: overviewYaw, pitch: overviewPitch, dist: overviewDist, fx: 0, fy: 0, fz: 0 };
let from: View = { ...live };
let camClock = 0;
let transStart = -100;

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const TWO_PI = Math.PI * 2;
const unwrap = (raw: number, ref: number): number => raw + TWO_PI * Math.round((ref - raw) / TWO_PI);

function toCam(p: V3, v: View): V3 {
  const x0 = p[0] - v.fx, y0 = p[1] - v.fy, z0 = p[2] - v.fz;
  const cy = Math.cos(v.yaw), sy = Math.sin(v.yaw);
  const x1 = x0 * cy + z0 * sy, z1 = -x0 * sy + z0 * cy;
  const cp = Math.cos(v.pitch), sp = Math.sin(v.pitch);
  return [x1, y0 * cp - z1 * sp, y0 * sp + z1 * cp - v.dist];
}

function cameraWorldPos(v: View): V3 {
  return [
    v.fx - v.dist * Math.cos(v.pitch) * Math.sin(v.yaw),
    v.fy + v.dist * Math.sin(v.pitch),
    v.fz + v.dist * Math.cos(v.pitch) * Math.cos(v.yaw)
  ];
}

const focusIndex = (): number => (focused === null ? -1 : PLANETS.findIndex((p) => p.name === focused));

function targetView(ref: number): View {
  const i = focusIndex();
  if (i < 0) {
    return { yaw: unwrap(overviewYaw, ref), pitch: overviewPitch, dist: overviewDist, fx: 0, fy: 0, fz: 0 };
  }
  const p = PLANETS[i]!, pos = planetPos[i]!;
  const len = Math.hypot(pos[0], pos[2]) || 1;
  const ux = -pos[0] / len, uz = -pos[2] / len; // towards the star
  const raw = Math.atan2(-ux, uz) + 0.6;
  return { yaw: unwrap(raw, ref), pitch: 0.3, dist: p.r * 5.5 + 4, fx: pos[0], fy: pos[1], fz: pos[2] };
}

function setFocus(name: string | null): void {
  if (name === focused) return;
  from = { ...live };
  transStart = camClock;
  focused = name;
  showPanel();
}

function updateCamera(): void {
  const e = easeInOutCubic(Math.min(1, Math.max(0, (camClock - transStart) / EASE_SECONDS)));
  const inTransition = camClock - transStart < EASE_SECONDS;
  const t = targetView(inTransition ? from.yaw : live.yaw);
  const mix = (a: number, b: number): number => a + (b - a) * e;
  live.yaw = mix(from.yaw, t.yaw);
  live.pitch = mix(from.pitch, t.pitch);
  live.dist = mix(from.dist, t.dist);
  live.fx = mix(from.fx, t.fx);
  live.fy = mix(from.fy, t.fy);
  live.fz = mix(from.fz, t.fz);
}

// ---------------------------------------------------------------- scene
let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

// star field (rotates with the camera, never translates)
const starTransforms: AuraTransformSpec[] = [];
const starColors: string[] = [];
for (let i = 0; i < 700; i += 1) {
  const u = rand() * 2 - 1, a = rand() * TWO_PI, s = Math.sqrt(1 - u * u), R = 1100;
  const k = 1.6 + rand() * rand() * 4;
  starTransforms.push({ position: [Math.cos(a) * s * R, u * R, Math.sin(a) * s * R], scale: [k, k, k] });
  starColors.push(`hsl(${rand() < 0.5 ? 210 : 40}, ${20 + Math.floor(rand() * 50)}%, ${70 + Math.floor(rand() * 28)}%)`);
}
const starMat = material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1 });

// orbit lines made of small dots
const orbitDots: AuraTransformSpec[] = [];
for (const p of PLANETS) {
  const n = Math.ceil((TWO_PI * p.a) / 0.35);
  for (let k = 0; k < n; k += 1) {
    const t = (k / n) * TWO_PI;
    orbitDots.push({ position: [Math.cos(t) * p.a, 0, Math.sin(t) * p.a], scale: [0.2, 0.2, 0.2] });
  }
}

const planetNode = (p: PlanetDef, i: number) => {
  const kids: Kids = [
    primitives.sphere({ name: `${p.name}-body`, size: p.r * 2, material: material.pbr({ color: p.color, roughness: 0.85 }) })
  ];
  const spotMat = material.pbr({ color: p.spot, roughness: 0.9 });
  const dirs: Array<[number, number]> = [[0.2, 0.2], [2.2, -0.35], [3.9, 0.45], [5.3, -0.1], [1.2, 0.95]];
  dirs.forEach(([lon, lat], k) => {
    const d = p.r * 0.93;
    kids.push(
      primitives.sphere({ name: `${p.name}-spot${k}`, size: p.r * 0.7, material: spotMat })
        .position(Math.cos(lon) * Math.cos(lat) * d, Math.sin(lat) * d, Math.sin(lon) * Math.cos(lat) * d)
    );
  });
  const pos = planetPos[i]!;
  return group(`${p.name}-group`, kids).position(pos[0], pos[1], pos[2]).runtime({ id: `planet-${p.name}`, mutable: true });
};

const sun = primitives.sphere({
  name: "sun-body",
  size: SUN_R * 2,
  castShadow: false,
  material: material.emissive({ color: "#ffb02e", emissive: "#ffa41c", emissiveIntensity: 2.2 })
});
const sunGlow = primitives.sphere({
  name: "sun-glow",
  size: SUN_R * 2.6,
  castShadow: false,
  material: material.emissive({ color: "#ff9a2a", emissive: "#ff8a1a", emissiveIntensity: 1.2, opacity: 0.16 })
});

const content: Kids = [
  sun,
  sunGlow,
  instances.sphere({
    name: "orbit-lines",
    transforms: orbitDots,
    castShadow: false,
    material: material.emissive({ color: "#6f86b5", emissive: "#6f86b5", emissiveIntensity: 0.7 })
  }),
  ...PLANETS.map(planetNode)
];

PLANETS.forEach((p, i) => {
  p.moons.forEach((m, j) => {
    const mp = moonPos[i]![j]!;
    content.push(
      primitives.sphere({ name: `moon-${p.name}-${m.name}`, size: m.r * 2, material: material.pbr({ color: m.color, roughness: 0.9 }) })
        .position(mp[0], mp[1], mp[2])
        .runtime({ id: `moon-${p.name}-${j}`, mutable: true })
    );
  });
  if (p.ring) {
    const pos = planetPos[i]!;
    p.ring.colors.forEach((c, k) => {
      const R = p.r * (k === 0 ? 2.15 : 2.7);
      content.push(
        primitives.torus({ name: `ring-${p.name}-${k}`, size: [R * 2, 0.12, R * 2], castShadow: false, material: material.pbr({ color: c, roughness: 0.8 }) })
          .position(pos[0], pos[1], pos[2])
          .rotate(p.ring!.tilt, 0, 0)
          .runtime({ id: `ring-${p.name}-${k}`, mutable: true })
      );
    });
  }
});

const pan = group("pan", content).position(-live.fx, -live.fy, -live.fz).runtime({ id: "pan", mutable: true });
const yawG = group("yaw", [pan]).rotate(0, live.yaw, 0).runtime({ id: "yaw", mutable: true });
const pitchG = group("pitch", [yawG]).rotate(live.pitch, 0, 0).runtime({ id: "pitch", mutable: true });
const rootG = group("root", [pitchG]).position(0, 0, -live.dist).runtime({ id: "root", mutable: true });

const starsYaw = group("stars-yaw", [
  instances.sphere({ name: "stars", transforms: starTransforms, colors: starColors, castShadow: false, material: starMat })
]).rotate(0, live.yaw, 0).runtime({ id: "stars-yaw", mutable: true });
const starsPitch = group("stars-pitch", [starsYaw]).rotate(live.pitch, 0, 0).runtime({ id: "stars-pitch", mutable: true });

const sunCam = toCam([0, 0, 0], live);
const sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: [0, 0, 0], target: [0, 0, -1], fov: FOV, near: 0.5, far: 3000 }))
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.hemisphere({ skyColor: "#8fa2c8", groundColor: "#1a1c2a", intensity: 0.35 }))
  .add(
    lights.point({ name: "sunlight", position: sunCam, intensity: 6, distance: 0, decay: 0, color: "#fff1d6", shadow: false })
      .runtime({ id: "sunlight", mutable: true })
  )
  .add(effects.bloom({ intensity: 0.6, threshold: 0.85, radius: 0.5 }))
  .add(starsPitch)
  .add(rootG);

// ---------------------------------------------------------------- DOM
const canvas = document.querySelector<HTMLCanvasElement>("#app")!;

const panel = document.createElement("div");
panel.id = "info-panel";
panel.style.cssText =
  "position:absolute;left:424px;top:8px;width:208px;padding:10px 12px;box-sizing:border-box;" +
  "background:rgba(10,14,32,0.82);border:1px solid rgba(140,170,230,0.55);border-radius:6px;" +
  "color:#e8eeff;font:12px/1.5 system-ui,sans-serif;pointer-events:none;display:none;z-index:5";
document.body.appendChild(panel);

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
pauseBtn.style.cssText =
  "position:absolute;left:8px;top:8px;padding:5px 14px;font:12px system-ui,sans-serif;color:#e8eeff;" +
  "background:rgba(10,14,32,0.82);border:1px solid rgba(140,170,230,0.55);border-radius:6px;cursor:pointer;z-index:5";
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
  pauseBtn.blur();
});
document.body.appendChild(pauseBtn);

function showPanel(): void {
  const i = focusIndex();
  if (i < 0) {
    panel.style.display = "none";
    panel.textContent = "";
    return;
  }
  const p = PLANETS[i]!;
  panel.innerHTML = "";
  const title = document.createElement("div");
  title.textContent = p.name;
  title.style.cssText = "font-size:16px;font-weight:600;margin-bottom:4px";
  const period = document.createElement("div");
  period.textContent = `Orbital period: ${p.periodDays.toLocaleString("en-US")} Earth days`;
  const dist = document.createElement("div");
  dist.textContent = `Distance from star: ${p.distMkm.toLocaleString("en-US")} million km`;
  panel.append(title, period, dist);
  panel.style.display = "block";
}

// ---------------------------------------------------------------- picking and input
function pickPlanet(clientX: number, clientY: number): string | null {
  const rect = canvas.getBoundingClientRect();
  const halfW = rect.width / 2, halfH = rect.height / 2;
  const aspect = rect.width / rect.height;
  const px = clientX - rect.left - halfW, py = halfH - (clientY - rect.top);
  let best: string | null = null;
  let bestDepth = Infinity;
  PLANETS.forEach((p, i) => {
    const q = toCam(planetPos[i]!, live);
    const depth = -q[2];
    if (depth < 0.5) return;
    const sx = (q[0] / depth / (TAN_H * aspect)) * halfW;
    const sy = (q[1] / depth / TAN_H) * halfH;
    const projR = (p.r / depth / TAN_H) * halfH;
    const reach = Math.max(projR * (p.ring ? 1.9 : 1), 10);
    if (Math.hypot(sx - px, sy - py) <= reach && depth < bestDepth) {
      best = p.name;
      bestDepth = depth;
    }
  });
  return best;
}

function handleClick(clientX: number, clientY: number): void {
  const hit = pickPlanet(clientX, clientY);
  if (hit) setFocus(hit);
  else setFocus(null);
}

const findPlanet = (name: string): string | null =>
  PLANETS.find((p) => p.name.toLowerCase() === String(name).trim().toLowerCase())?.name ?? null;

let dragging = false;
let downX = 0, downY = 0, lastX = 0, lastY = 0, moved = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  moved = 0;
});
window.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX, dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
  if (focused === null && moved > 4) {
    overviewYaw += dx * 0.008;
    overviewPitch = Math.min(1.45, Math.max(0.08, overviewPitch + dy * 0.006));
  }
});
window.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved <= 4 && e.target === canvas) handleClick(e.clientX, e.clientY);
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused !== null) return;
    overviewDist = Math.min(OVERVIEW_DIST_MAX, Math.max(OVERVIEW_DIST_MIN, overviewDist * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") setFocus(null);
});

window.__focusPlanet = (name: string): void => {
  const n = findPlanet(name);
  if (n) setFocus(n);
};
window.__unfocus = (): void => setFocus(null);

let readyFlag = false;
const state = {
  get ready(): boolean { return readyFlag; },
  get focused(): string | null { return focused; },
  get paused(): boolean { return paused; },
  get planets(): Array<{ name: string; x: number; y: number; z: number }> {
    return PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] }));
  },
  get cameraDistanceToFocus(): number | null {
    const i = focusIndex();
    if (i < 0) return null;
    const c = cameraWorldPos(live), p = planetPos[i]!;
    return Math.hypot(c[0] - p[0], c[1] - p[1], c[2] - p[2]);
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: Object.freeze(state), writable: false, configurable: false, enumerable: true });

// ---------------------------------------------------------------- app
const app = createAuraApp("#app", { scene: sc });
const handles = new Map<string, ReturnType<typeof app.nodes.require>>();
const node = (id: string) => {
  let h = handles.get(id);
  if (!h) {
    h = app.nodes.require(id);
    handles.set(id, h);
  }
  return h;
};

let frames = 0;
app.onFrame((f) => {
  const dt = Math.min(0.1, Math.max(0, f.dt));
  camClock += dt;
  if (!paused) simT += dt;
  updateBodies();
  updateCamera();

  PLANETS.forEach((p, i) => {
    const pos = planetPos[i]!;
    const h = node(`planet-${p.name}`);
    h.setPosition(pos[0], pos[1], pos[2]);
    h.setRotation(0, p.spin * simT, 0);
    p.moons.forEach((_m, j) => {
      const mp = moonPos[i]![j]!;
      node(`moon-${p.name}-${j}`).setPosition(mp[0], mp[1], mp[2]);
    });
    if (p.ring) {
      for (let k = 0; k < 2; k += 1) node(`ring-${p.name}-${k}`).setPosition(pos[0], pos[1], pos[2]);
    }
  });

  node("root").setPosition(0, 0, -live.dist);
  node("pitch").setRotation(live.pitch, 0, 0);
  node("yaw").setRotation(0, live.yaw, 0);
  node("pan").setPosition(-live.fx, -live.fy, -live.fz);
  node("stars-pitch").setRotation(live.pitch, 0, 0);
  node("stars-yaw").setRotation(0, live.yaw, 0);
  const sc2 = toCam([0, 0, 0], live);
  node("sunlight").setPosition(sc2[0], sc2[1], sc2[2]);

  frames += 1;
  if (frames === 2 && !readyFlag) {
    readyFlag = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
// Fallback in case no frame callback has fired yet: flag after the next two animation frames.
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    if (!readyFlag) {
      readyFlag = true;
      window.__EVAL_READY__ = true;
    }
  })
);
