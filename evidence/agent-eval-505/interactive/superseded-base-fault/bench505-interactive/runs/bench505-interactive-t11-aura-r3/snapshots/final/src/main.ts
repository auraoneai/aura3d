import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

type Vec3 = [number, number, number];
type Child = Parameters<typeof group>[1][number];

interface MoonDef {
  id: string;
  size: number;
  orbit: number;
  period: number; // seconds per revolution
  color: string;
  phase: number;
}

interface PlanetDef {
  name: string;
  radius: number;
  orbit: number; // scene units
  periodDays: number;
  distanceMkm: number;
  color: string;
  spin: number; // rad / s
  phase: number;
  ring?: boolean;
  bands?: Array<[number, string]>; // [height as fraction of radius, colour]
  moons?: MoonDef[];
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", radius: 1.0, orbit: 14, periodDays: 88, distanceMkm: 57.9, color: "#9a9a9a", spin: 0.6, phase: 0.6 },
  { name: "Venus", radius: 1.6, orbit: 20, periodDays: 224.7, distanceMkm: 108.2, color: "#e2b676", spin: -0.4, phase: 2.4 },
  {
    name: "Earth", radius: 1.7, orbit: 27, periodDays: 365.25, distanceMkm: 149.6, color: "#3f7fd6", spin: 1.6, phase: 4.1,
    moons: [{ id: "moon-earth", size: 0.6, orbit: 3.6, period: 6, color: "#c4c4c4", phase: 0 }]
  },
  { name: "Mars", radius: 1.3, orbit: 34, periodDays: 687, distanceMkm: 227.9, color: "#c8573a", spin: 1.4, phase: 5.5 },
  {
    name: "Jupiter", radius: 3.6, orbit: 46, periodDays: 4333, distanceMkm: 778.5, color: "#d8b48a", spin: 2.4, phase: 1.3,
    bands: [[-0.5, "#b07a52"], [-0.12, "#f0dcc0"], [0.28, "#a86a46"], [0.62, "#e6cfae"]],
    moons: [
      { id: "moon-jupiter-a", size: 0.5, orbit: 6.2, period: 5, color: "#d9c27a", phase: 0.5 },
      { id: "moon-jupiter-b", size: 0.42, orbit: 8.0, period: 8, color: "#b9b2a6", phase: 3.1 }
    ]
  },
  {
    name: "Saturn", radius: 3.1, orbit: 60, periodDays: 10759, distanceMkm: 1432, color: "#e3cf9a", spin: 2.0, phase: 3.3, ring: true,
    bands: [[-0.35, "#c9b27a"], [0.3, "#f0e2b8"]]
  },
  { name: "Uranus", radius: 2.4, orbit: 72, periodDays: 30687, distanceMkm: 2867, color: "#7fd6dc", spin: -1.2, phase: 5.0 },
  { name: "Neptune", radius: 2.3, orbit: 83, periodDays: 60190, distanceMkm: 4515, color: "#3a56d4", spin: 1.1, phase: 0.1 }
];

const STAR_RADIUS = 6;
const FOV_DEG = 45;
const ASPECT = 640 / 360;
const TAN_HALF = Math.tan((FOV_DEG * Math.PI) / 360);
const TRANSITION_MS = 1500;
const OVERVIEW_MIN = 60;
const OVERVIEW_MAX = 300;
const PITCH_MIN = 0.08;
const PITCH_MAX = 1.45;

const orbitSpeed = (p: PlanetDef): number => (Math.PI * 2) / (8 * Math.sqrt(p.periodDays / 88));
const focusDistance = (p: PlanetDef): number => Math.max(7, p.radius * (p.ring ? 6.8 : 4.6));

// ---------------------------------------------------------------------------
// Procedural helpers
// ---------------------------------------------------------------------------

function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = amount >= 0 ? c + (255 - c) * amount : c * (1 + amount);
    return Math.max(0, Math.min(255, Math.round(v)));
  });
  return `#${ch.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Thin circular line loop in the XZ plane. */
function orbitLine(name: string, radius: number): Child {
  const segments = 160;
  const positions = new Float32Array(segments * 3);
  const normals = new Float32Array(segments * 3);
  const indices: number[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    positions.set([Math.cos(a) * radius, 0, Math.sin(a) * radius], i * 3);
    normals.set([0, 1, 0], i * 3);
    indices.push(i, (i + 1) % segments);
  }
  const spec = geometry.define({
    positions,
    normals,
    indices,
    topology: "lines",
    bounds: { min: [-radius, 0, -radius], max: [radius, 0, radius] }
  });
  return geometry.custom(spec, {
    name,
    material: material.emissive({ color: "#5c74a8", emissive: "#5c74a8", emissiveIntensity: 0.9 }),
    castShadow: false,
    receiveShadow: false
  });
}

/** Flat annulus, two-sided (duplicate reversed faces). */
function ringDisc(name: string, inner: number, outer: number, color: string): Child {
  const segments = 96;
  const vertCount = (segments + 1) * 2;
  const positions = new Float32Array(vertCount * 2 * 3);
  const normals = new Float32Array(vertCount * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let side = 0; side < 2; side++) {
      const base = side * vertCount;
      positions.set([c * inner, 0, s * inner], (base + i * 2) * 3);
      positions.set([c * outer, 0, s * outer], (base + i * 2 + 1) * 3);
      normals.set([0, side === 0 ? 1 : -1, 0], (base + i * 2) * 3);
      normals.set([0, side === 0 ? 1 : -1, 0], (base + i * 2 + 1) * 3);
    }
  }
  for (let i = 0; i < segments; i++) {
    const a = i * 2;
    const b = i * 2 + 1;
    const c = (i + 1) * 2;
    const d = (i + 1) * 2 + 1;
    indices.push(a, d, b, a, c, d); // faces up
    indices.push(vertCount + a, vertCount + b, vertCount + d, vertCount + a, vertCount + d, vertCount + c); // faces down
  }
  const spec = geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-outer, 0, -outer], max: [outer, 0, outer] }
  });
  return geometry.custom(spec, {
    name,
    material: material.pbr({ color, roughness: 0.8, metallic: 0 }),
    castShadow: false
  });
}

function planetNode(def: PlanetDef, index: number): Child {
  const r = def.radius;
  const rand = rng(1000 + index * 77);
  const body = material.pbr({ color: def.color, roughness: 0.85, metallic: 0 });
  const spinKids: Child[] = [primitives.sphere({ name: `${def.name}-body`, size: r * 2, material: body })];

  // Surface bands (gas giants).
  (def.bands ?? []).forEach(([h, col], i) => {
    spinKids.push(
      primitives
        .sphere({
          name: `${def.name}-band-${i}`,
          size: [r * 2 * 1.012, r * 0.34, r * 2 * 1.012],
          material: material.pbr({ color: col, roughness: 0.85, metallic: 0 })
        })
        .position(0, h * r, 0)
    );
  });

  // Surface spots so the axial spin is visible.
  for (let i = 0; i < 3; i++) {
    const lon = (i / 3) * Math.PI * 2 + rand() * 0.8;
    const lat = (rand() - 0.5) * 1.0;
    const d = r * 0.78;
    const pos: Vec3 = [d * Math.cos(lat) * Math.cos(lon), d * Math.sin(lat), d * Math.cos(lat) * Math.sin(lon)];
    spinKids.push(
      primitives
        .sphere({
          name: `${def.name}-spot-${i}`,
          size: r * 0.56,
          material: material.pbr({ color: shade(def.color, i % 2 === 0 ? -0.35 : 0.35), roughness: 0.9, metallic: 0 })
        })
        .position(pos[0], pos[1], pos[2])
    );
  }

  const kids: Child[] = [group(`${def.name}-spin`, spinKids).runtime({ id: `spin-${def.name}`, mutable: true })];

  if (def.ring) {
    kids.push(ringDisc(`${def.name}-ring-inner`, r * 1.45, r * 1.85, "#cdb98a").rotate(0.45, 0, 0.18));
    kids.push(ringDisc(`${def.name}-ring-outer`, r * 1.95, r * 2.4, "#a8946b").rotate(0.45, 0, 0.18));
  }

  (def.moons ?? []).forEach((m) => {
    kids.push(
      primitives
        .sphere({ name: m.id, size: m.size, material: material.pbr({ color: m.color, roughness: 0.95, metallic: 0 }) })
        .position(m.orbit, 0, 0)
        .runtime({ id: m.id, mutable: true })
    );
  });

  const a = def.phase;
  return group(`planet-${def.name}`, kids, { position: [Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit] }).runtime({
    id: `planet-${def.name}`,
    mutable: true
  });
}

function starField(): Child {
  const rand = rng(424242);
  const transforms: AuraTransformSpec[] = [];
  const colors: string[] = [];
  const tints = ["#ffffff", "#cfe0ff", "#ffe9c4", "#ffffff"];
  for (let i = 0; i < 380; i++) {
    const u = rand() * 2 - 1;
    const phi = rand() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dist = 700 + rand() * 300;
    const size = 1.6 + rand() * 2.6;
    transforms.push({ position: [s * Math.cos(phi) * dist, u * dist, s * Math.sin(phi) * dist], scale: [size, size, size] });
    colors.push(tints[i % tints.length] ?? "#ffffff");
  }
  return instances.sphere({
    name: "starfield",
    transforms,
    colors,
    material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.4 }),
    castShadow: false,
    receiveShadow: false
  });
}

// ---------------------------------------------------------------------------
// Camera model (the engine camera is fixed at the origin looking down -Z; the
// world is moved by three nested groups, which is the exact inverse of an
// orbit camera at yaw / pitch / dist around a target).
// ---------------------------------------------------------------------------

interface CamState {
  yaw: number;
  pitch: number;
  dist: number;
  tx: number;
  ty: number;
  tz: number;
}

/** World point -> camera (view) space. */
function toView(c: CamState, x: number, y: number, z: number): Vec3 {
  const qx = x - c.tx;
  const qy = y - c.ty;
  const qz = z - c.tz;
  const cy = Math.cos(c.yaw);
  const sy = Math.sin(c.yaw);
  const x1 = qx * cy - qz * sy;
  const z1 = qx * sy + qz * cy;
  const cp = Math.cos(c.pitch);
  const sp = Math.sin(c.pitch);
  const y2 = qy * cp - z1 * sp;
  const z2 = qy * sp + z1 * cp;
  return [x1, y2, z2 - c.dist];
}

const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const wrapPi = (a: number): number => {
  let v = a % (Math.PI * 2);
  if (v > Math.PI) v -= Math.PI * 2;
  if (v < -Math.PI) v += Math.PI * 2;
  return v;
};

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __focusPlanet: (name: string) => void;
    __unfocus: () => void;
  }
}

async function main(): Promise<void> {
  const canvas = document.querySelector<HTMLCanvasElement>("#app");
  if (!canvas) throw new Error("canvas #app not found");

  const initialCam: CamState = { yaw: 0.35, pitch: 0.6, dist: 150, tx: 0, ty: 0, tz: 0 };

  const world = group(
    "world",
    [
      primitives.sphere({
        name: "star",
        size: STAR_RADIUS * 2,
        material: material.emissive({ color: "#ffb938", emissive: "#ffa726", emissiveIntensity: 3.2 }),
        castShadow: false
      }),
      ...PLANETS.map((p) => orbitLine(`orbit-${p.name}`, p.orbit)),
      ...PLANETS.map((p, i) => planetNode(p, i))
    ],
    { position: [-initialCam.tx, -initialCam.ty, -initialCam.tz] }
  ).runtime({ id: "cam-world", mutable: true });

  const yawGroup = group("cam-yaw", [world, starField()]).rotate(0, -initialCam.yaw, 0).runtime({ id: "cam-yaw", mutable: true });
  const pitchGroup = group("cam-pitch", [yawGroup], { position: [0, 0, -initialCam.dist] })
    .rotate(initialCam.pitch, 0, 0)
    .runtime({ id: "cam-pitch", mutable: true });

  const stage = scene({ background: "#02030a" })
    .add(environments.neutral({ intensity: 0.4, background: false }))
    .add(lights.ambient({ intensity: 0.12, color: "#9fb0ff" }))
    .add(lights.point({ name: "sun-light", position: [0, 0, 0], intensity: 3, decay: 0, color: "#fff1d6", shadow: false }).runtime({ id: "sun-light", mutable: true }))
    .add(pitchGroup)
    .add(effects.bloom({ intensity: 0.7, threshold: 0.75, radius: 0.55 }))
    .camera(camera.perspective({ position: [0, 0, 0], target: [0, 0, -1], fov: FOV_DEG, near: 0.5, far: 3000 }));

  const app = createAuraApp("#app", { scene: stage });
  await app.ready();

  // ---- DOM overlay -------------------------------------------------------
  const button = document.createElement("button");
  button.id = "pause-btn";
  button.type = "button";
  button.textContent = "Pause";
  Object.assign(button.style, {
    position: "absolute", left: "8px", top: "8px", padding: "4px 12px", font: "13px system-ui, sans-serif",
    color: "#e8eefc", background: "rgba(20,28,52,0.85)", border: "1px solid #5c74a8", borderRadius: "4px", cursor: "pointer"
  } satisfies Partial<CSSStyleDeclaration>);
  document.body.appendChild(button);

  const panel = document.createElement("div");
  panel.id = "info-panel";
  Object.assign(panel.style, {
    position: "absolute", left: "8px", top: "44px", width: "210px", padding: "8px 12px", display: "none",
    font: "13px/1.5 system-ui, sans-serif", color: "#e8eefc", background: "rgba(10,16,34,0.82)",
    border: "1px solid #5c74a8", borderRadius: "6px", pointerEvents: "none"
  } satisfies Partial<CSSStyleDeclaration>);
  const panelName = document.createElement("div");
  panelName.id = "info-name";
  Object.assign(panelName.style, { fontSize: "16px", fontWeight: "600", marginBottom: "2px" });
  const panelPeriod = document.createElement("div");
  panelPeriod.id = "info-period";
  const panelDist = document.createElement("div");
  panelDist.id = "info-distance";
  panel.append(panelName, panelPeriod, panelDist);
  document.body.appendChild(panel);

  canvas.style.touchAction = "none";

  // ---- State -------------------------------------------------------------
  let simTime = 0;
  let paused = false;
  let ready = false;
  let focused: PlanetDef | null = null;
  const overview: CamState = { ...initialCam };
  const cam: CamState = { ...initialCam };
  let from: CamState = { ...cam };
  let transitionStart = 0;
  let transitioning = false;
  let lastNow = performance.now();

  const planetPos = (p: PlanetDef): Vec3 => {
    const a = p.phase + orbitSpeed(p) * simTime;
    return [Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit];
  };

  const targetCam = (): CamState => {
    if (focused) {
      const [x, y, z] = planetPos(focused);
      const yawToStar = Math.atan2(-x, -z);
      return { yaw: yawToStar + 0.6, pitch: 0.3, dist: focusDistance(focused), tx: x, ty: y, tz: z };
    }
    return { ...overview, tx: 0, ty: 0, tz: 0 };
  };

  const beginTransition = (): void => {
    from = { ...cam };
    transitionStart = performance.now();
    transitioning = true;
  };

  const focusPlanet = (name: string): void => {
    const p = PLANETS.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
    if (!p) return;
    focused = p;
    panelName.textContent = p.name;
    panelPeriod.textContent = `Orbital period: ${p.periodDays.toLocaleString("en-US")} Earth days`;
    panelDist.textContent = `Distance from star: ${p.distanceMkm.toLocaleString("en-US")} million km`;
    panel.style.display = "block";
    beginTransition();
  };

  const unfocus = (): void => {
    if (!focused) return;
    focused = null;
    panel.style.display = "none";
    beginTransition();
  };

  const updateCamera = (now: number): void => {
    const to = targetCam();
    if (transitioning) {
      const k = Math.min(1, Math.max(0, (now - transitionStart) / TRANSITION_MS));
      const e = easeInOutCubic(k);
      cam.yaw = from.yaw + wrapPi(to.yaw - from.yaw) * e;
      cam.pitch = from.pitch + (to.pitch - from.pitch) * e;
      cam.dist = Math.exp(Math.log(from.dist) + (Math.log(to.dist) - Math.log(from.dist)) * e);
      cam.tx = from.tx + (to.tx - from.tx) * e;
      cam.ty = from.ty + (to.ty - from.ty) * e;
      cam.tz = from.tz + (to.tz - from.tz) * e;
      if (k >= 1) transitioning = false;
    } else {
      Object.assign(cam, to);
    }
  };

  const applyScene = (): void => {
    for (const p of PLANETS) {
      const [x, y, z] = planetPos(p);
      app.nodes.require(`planet-${p.name}`).setPosition(x, y, z);
      app.nodes.require(`spin-${p.name}`).setRotation(0, p.spin * simTime, 0);
      for (const m of p.moons ?? []) {
        const a = m.phase + ((Math.PI * 2) / m.period) * simTime;
        app.nodes.require(m.id).setPosition(Math.cos(a) * m.orbit, Math.sin(a) * m.orbit * 0.12, Math.sin(a) * m.orbit);
      }
    }
    app.nodes.require("cam-pitch").setPosition(0, 0, -cam.dist);
    app.nodes.require("cam-pitch").setRotation(cam.pitch, 0, 0);
    app.nodes.require("cam-yaw").setRotation(0, -cam.yaw, 0);
    app.nodes.require("cam-world").setPosition(-cam.tx, -cam.ty, -cam.tz);
    const sun = toView(cam, 0, 0, 0);
    app.nodes.require("sun-light").setPosition(sun[0], sun[1], sun[2]);
  };

  // ---- Picking -----------------------------------------------------------
  const pickAt = (clientX: number, clientY: number): PlanetDef | null => {
    const rect = canvas.getBoundingClientRect();
    const px = ((clientX - rect.left) / rect.width) * 640;
    const py = ((clientY - rect.top) / rect.height) * 360;
    const nx = (px / 640) * 2 - 1;
    const ny = 1 - (py / 360) * 2;
    let dx = nx * TAN_HALF * ASPECT;
    let dy = ny * TAN_HALF;
    let dz = -1;
    const len = Math.hypot(dx, dy, dz);
    dx /= len; dy /= len; dz /= len;

    const test = (c: Vec3, radius: number): number | null => {
      const t = c[0] * dx + c[1] * dy + c[2] * dz;
      if (t <= 0) return null;
      const d2 = c[0] * c[0] + c[1] * c[1] + c[2] * c[2] - t * t;
      // Keep tiny planets clickable: at least ~9 px on screen.
      const minWorld = (9 / 360) * 2 * TAN_HALF * t;
      const rr = Math.max(radius, minWorld);
      return d2 <= rr * rr ? t : null;
    };

    let best: PlanetDef | null = null;
    let bestT = Infinity;
    const starT = test(toView(cam, 0, 0, 0), STAR_RADIUS);
    if (starT !== null) bestT = starT;
    for (const p of PLANETS) {
      const [x, y, z] = planetPos(p);
      const t = test(toView(cam, x, y, z), p.radius * (p.ring ? 2.2 : 1.15));
      if (t !== null && t < bestT) {
        bestT = t;
        best = p;
      }
    }
    return best;
  };

  // ---- Input -------------------------------------------------------------
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let pressed = false;
  let moved = 0;

  canvas.addEventListener("pointerdown", (e) => {
    pressed = true;
    moved = 0;
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (!pressed) {
      canvas.style.cursor = pickAt(e.clientX, e.clientY) ? "pointer" : "default";
      return;
    }
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
    if (!focused && moved > 4) {
      overview.yaw -= dx * 0.008;
      overview.pitch = Math.min(PITCH_MAX, Math.max(PITCH_MIN, overview.pitch + dy * 0.006));
    }
  });
  const release = (e: PointerEvent): void => {
    if (!pressed) return;
    pressed = false;
    if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
    if (e.type === "pointerup" && moved <= 4) {
      const hit = pickAt(e.clientX, e.clientY);
      if (hit) focusPlanet(hit.name);
      else unfocus();
    }
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      if (focused) return;
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      overview.dist = Math.min(OVERVIEW_MAX, Math.max(OVERVIEW_MIN, overview.dist * Math.exp(delta * 0.001)));
    },
    { passive: false }
  );
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") unfocus();
  });
  button.addEventListener("click", () => {
    paused = !paused;
    button.textContent = paused ? "Play" : "Pause";
    button.blur();
  });

  // ---- Public hooks ------------------------------------------------------
  window.__focusPlanet = focusPlanet;
  window.__unfocus = unfocus;
  Object.defineProperty(window, "__TASK_STATE__", {
    enumerable: true,
    configurable: false,
    get: () => {
      let distance: number | null = null;
      if (focused) {
        const [x, y, z] = planetPos(focused);
        const cp = Math.cos(cam.pitch);
        const camX = cam.tx + cam.dist * cp * Math.sin(cam.yaw);
        const camY = cam.ty + cam.dist * Math.sin(cam.pitch);
        const camZ = cam.tz + cam.dist * cp * Math.cos(cam.yaw);
        distance = Math.hypot(camX - x, camY - y, camZ - z);
      }
      return Object.freeze({
        ready,
        focused: focused ? focused.name : null,
        paused,
        planets: PLANETS.map((p) => {
          const [x, y, z] = planetPos(p);
          return { name: p.name, x, y, z };
        }),
        cameraDistanceToFocus: distance
      });
    }
  });

  // ---- Frame loop --------------------------------------------------------
  const step = (): void => {
    const now = performance.now();
    const dt = Math.min(0.25, Math.max(0, (now - lastNow) / 1000));
    lastNow = now;
    if (!paused) simTime += dt;
    updateCamera(now);
    applyScene();
  };

  step();
  app.onFrame(step);
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ready = true;
      window.__EVAL_READY__ = true;
    })
  );
}

main().catch((error: unknown) => {
  console.error(error);
});
