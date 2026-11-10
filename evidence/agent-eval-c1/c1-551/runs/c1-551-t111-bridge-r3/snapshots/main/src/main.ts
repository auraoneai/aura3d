import {
  camera,
  createAuraApp,
  effects,
  environments,
  instances,
  lights,
  lines,
  material,
  primitives,
  scene,
  texture,
  type AuraTransformSpec
} from "@aura3d/engine";

// ---------------------------------------------------------------- data
interface PlanetDef {
  readonly name: string;
  readonly dist: number; // scene units
  readonly radius: number; // scene units
  readonly periodDays: number; // real orbital period
  readonly distMkm: number; // real distance from the Sun
  readonly kind: "rock" | "gas" | "earth" | "ice";
  readonly colors: readonly [string, string, string];
  readonly spin: number; // rad/s
  readonly phase: number;
  readonly ring?: boolean;
  readonly moon?: boolean;
}

const PLANETS: readonly PlanetDef[] = [
  { name: "Mercury", dist: 7, radius: 0.45, periodDays: 88, distMkm: 57.9, kind: "rock", colors: ["#8d867d", "#b3aca2", "#6b655e"], spin: 0.5, phase: 0.4 },
  { name: "Venus", dist: 10, radius: 0.8, periodDays: 224.7, distMkm: 108.2, kind: "gas", colors: ["#e3b878", "#f0d3a0", "#c58f4e"], spin: -0.3, phase: 2.1 },
  { name: "Earth", dist: 13.5, radius: 0.9, periodDays: 365.25, distMkm: 149.6, kind: "earth", colors: ["#2a62b8", "#3f9a54", "#f2f4f7"], spin: 1.2, phase: 4.0, moon: true },
  { name: "Mars", dist: 17, radius: 0.62, periodDays: 687, distMkm: 227.9, kind: "rock", colors: ["#b9502f", "#d9754a", "#7d3320"], spin: 1.1, phase: 5.3 },
  { name: "Jupiter", dist: 23, radius: 2.0, periodDays: 4333, distMkm: 778.5, kind: "gas", colors: ["#c9a27a", "#efe0cb", "#a56c45"], spin: 2.0, phase: 1.2 },
  { name: "Saturn", dist: 30, radius: 1.7, periodDays: 10759, distMkm: 1434, kind: "gas", colors: ["#d9c28a", "#f1e4b8", "#b99a5c"], spin: 1.8, phase: 3.3, ring: true },
  { name: "Uranus", dist: 36, radius: 1.2, periodDays: 30687, distMkm: 2871, kind: "ice", colors: ["#7fd6dc", "#a9eaee", "#5bb6c2"], spin: -1.0, phase: 0.9 }
];

const SUN_RADIUS = 2.6;
const MOON_ORBIT = 1.7;
const MOON_RADIUS = 0.26;
const MOON_PERIOD = 6; // seconds
const RING_INNER = 1.45;
const RING_OUTER = 2.45;
const RING_TILT = 0.45;
const TRANSITION_SECONDS = 1.5;

// Simulated seconds per revolution: compressed so inner planets stay faster but outer ones still move.
const simPeriod = (p: PlanetDef): number => 14 * Math.pow(p.periodDays / 88, 0.55);

// ---------------------------------------------------------------- procedural textures
const mulberry = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeTexture = (def: PlanetDef, seed: number) => {
  const W = 256;
  const H = 128;
  const c = document.createElement("canvas");
  c.width = W;
  c.height = H;
  const g = c.getContext("2d");
  if (!g) throw new Error("2d context unavailable");
  const rnd = mulberry(seed * 977 + 13);
  const [base, light, dark] = def.colors;
  g.fillStyle = base;
  g.fillRect(0, 0, W, H);
  if (def.kind === "gas" || def.kind === "ice") {
    const amp = def.kind === "gas" ? 1 : 0.35;
    for (let y = 0; y < H; y += 1) {
      const v = Math.sin(y * 0.35 + rnd() * 0.4) * 0.5 + Math.sin(y * 0.11 + seed) * 0.5;
      g.globalAlpha = Math.min(0.9, Math.abs(v) * 0.8 * amp);
      g.fillStyle = v > 0 ? light : dark;
      g.fillRect(0, y, W, 1);
    }
    g.globalAlpha = 0.25 * amp;
    for (let i = 0; i < 30; i += 1) {
      g.fillStyle = rnd() > 0.5 ? light : dark;
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 6 + rnd() * 14, 1.5 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else if (def.kind === "earth") {
    for (let i = 0; i < 26; i += 1) {
      g.globalAlpha = 0.95;
      g.fillStyle = light === "" ? base : def.colors[1];
      g.beginPath();
      const cx = rnd() * W;
      const cy = 20 + rnd() * (H - 40);
      g.ellipse(cx, cy, 8 + rnd() * 22, 5 + rnd() * 12, rnd() * 3, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = 1;
    g.fillStyle = light;
    g.fillRect(0, 0, W, 7);
    g.fillRect(0, H - 7, W, 7);
    g.globalAlpha = 0.35;
    for (let i = 0; i < 40; i += 1) {
      g.beginPath();
      g.ellipse(rnd() * W, rnd() * H, 8 + rnd() * 16, 2 + rnd() * 3, 0, 0, Math.PI * 2);
      g.fill();
    }
  } else {
    for (let i = 0; i < 160; i += 1) {
      g.globalAlpha = 0.25 + rnd() * 0.4;
      g.fillStyle = rnd() > 0.5 ? light : dark;
      g.beginPath();
      g.arc(rnd() * W, rnd() * H, 1 + rnd() * 7, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.globalAlpha = 1;
  return texture.canvas({ canvas: c });
};

// ---------------------------------------------------------------- scene
const stars: AuraTransformSpec[] = [];
const starColors: string[] = [];
{
  const rnd = mulberry(4242);
  const tints = ["#ffffff", "#cfe0ff", "#fff1d0", "#ffd9d0"];
  for (let i = 0; i < 420; i += 1) {
    const u = rnd() * 2 - 1;
    const a = rnd() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = 230;
    const k = 0.5 + rnd() * rnd() * 1.6;
    stars.push({ position: [Math.cos(a) * s * r, u * r, Math.sin(a) * s * r], scale: [k, k, k] });
    starColors.push(tints[Math.floor(rnd() * tints.length)] ?? "#ffffff");
  }
}

const orbitPoints = (r: number): [number, number, number][] =>
  Array.from({ length: 160 }, (_, i) => {
    const a = (i / 160) * Math.PI * 2;
    return [Math.cos(a) * r, 0, Math.sin(a) * r];
  });

const stage = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.point({ name: "sunlight", position: [0, 0, 0], color: "#fff1d6", intensity: 2200, decay: 2, distance: 0 }))
  .add(instances.sphere({ name: "stars", transforms: stars, colors: starColors, material: material.pbr({ color: "#ffffff", unlit: true }) }))
  .add(primitives.sphere({ name: "sun", size: SUN_RADIUS * 2, material: material.pbr({ color: "#ffb43a", emissive: "#ff9a1f", emissiveIntensity: 2.4, unlit: true }) }).runtime({ id: "sun", mutable: true }))
  .add(primitives.sphere({ name: "sun-glow", size: SUN_RADIUS * 2.5, material: material.pbr({ color: "#ff9d2e", unlit: true, opacity: 0.18, alphaMode: "blend", depthWrite: false }) }).runtime({ id: "sun-glow", mutable: true }))
  .add(effects.bloom({ intensity: 0.7, threshold: 0.75, radius: 0.6 }))
  .camera(camera.perspective({ position: [0, 40, 70], target: [0, 0, 0], fov: 45, near: 0.2, far: 1000 }));

PLANETS.forEach((p, i) => {
  stage.add(lines.loop({ name: `orbit-${p.name}`, points: orbitPoints(p.dist), material: material.pbr({ color: "#5f7399", unlit: true }) }));
  stage.add(
    primitives.sphere({
      name: p.name,
      size: p.radius * 2,
      material: material.pbr({ color: "#ffffff", texture: makeTexture(p, i + 1), roughness: 0.85, metallic: 0 })
    }).runtime({ id: `planet-${i}`, mutable: true })
  );
  if (p.ring) {
    stage.add(
      primitives.ring({
        name: `${p.name}-ring-a`,
        size: p.radius,
        params: { innerRadius: RING_INNER, outerRadius: 1.9, thetaSegments: 64 },
        material: material.pbr({ color: "#cdb68a", roughness: 0.9, opacity: 0.85, alphaMode: "blend", doubleSided: true, depthWrite: false })
      }).runtime({ id: `ring-a-${i}`, mutable: true })
    );
    stage.add(
      primitives.ring({
        name: `${p.name}-ring-b`,
        size: p.radius,
        params: { innerRadius: 1.97, outerRadius: RING_OUTER, thetaSegments: 64 },
        material: material.pbr({ color: "#9c8a69", roughness: 0.9, opacity: 0.7, alphaMode: "blend", doubleSided: true, depthWrite: false })
      }).runtime({ id: `ring-b-${i}`, mutable: true })
    );
  }
  if (p.moon) {
    stage.add(
      primitives.sphere({ name: `${p.name}-moon`, size: MOON_RADIUS * 2, material: material.pbr({ color: "#b9b9bd", roughness: 1 }) }).runtime({ id: `moon-${i}`, mutable: true })
    );
  }
});

const app = createAuraApp("#app", { scene: stage });

// ---------------------------------------------------------------- DOM
const host = document.body;
const mkEl = <K extends keyof HTMLElementTagNameMap>(tag: K, css: string): HTMLElementTagNameMap[K] => {
  const el = document.createElement(tag);
  el.style.cssText = css;
  host.append(el);
  return el;
};
const panel = mkEl(
  "div",
  "position:absolute;left:12px;top:12px;min-width:170px;padding:10px 14px;border-radius:10px;background:rgba(10,16,30,.72);border:1px solid rgba(150,180,255,.35);color:#eaf0ff;font:13px/1.5 system-ui,sans-serif;display:none;pointer-events:none"
);
panel.id = "info-panel";
const panelName = document.createElement("div");
panelName.style.cssText = "font-size:17px;font-weight:700;margin-bottom:4px";
const panelPeriod = document.createElement("div");
const panelDist = document.createElement("div");
panelName.id = "info-name";
panelPeriod.id = "info-period";
panelDist.id = "info-distance";
panel.append(panelName, panelPeriod, panelDist);

const pauseBtn = mkEl(
  "button",
  "position:absolute;left:560px;top:322px;width:72px;height:28px;border-radius:8px;border:1px solid rgba(150,180,255,.5);background:rgba(10,16,30,.8);color:#eaf0ff;font:600 13px system-ui,sans-serif;cursor:pointer"
);
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";

const hint = mkEl(
  "div",
  "position:absolute;left:12px;top:334px;color:rgba(200,215,255,.65);font:11px system-ui,sans-serif;pointer-events:none"
);
hint.textContent = "Drag to orbit, scroll to zoom, click a planet to focus, Esc to return";

// ---------------------------------------------------------------- state
type Vec3 = [number, number, number];
interface Pose {
  position: Vec3;
  target: Vec3;
}
const FOV = 45;
const ASPECT = 640 / 360;

const sim = { time: 0, paused: false, spinTime: 0 };
let focusedIndex: number | null = null;
const planetPos: Vec3[] = PLANETS.map(() => [0, 0, 0]);
const orbit = { yaw: 0.5, pitch: 0.5, dist: 88 };
const ORBIT_MIN = 22;
const ORBIT_MAX = 140;
let currentPose: Pose = { position: [0, 40, 70], target: [0, 0, 0] };
let fromPose: Pose = currentPose;
let blend = 1;

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));
const ease = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const overviewPose = (): Pose => {
  const cp = Math.cos(orbit.pitch);
  return {
    position: [Math.sin(orbit.yaw) * cp * orbit.dist, Math.sin(orbit.pitch) * orbit.dist, Math.cos(orbit.yaw) * cp * orbit.dist],
    target: [0, 0, 0]
  };
};

const focusPose = (i: number): Pose => {
  const p = PLANETS[i]!;
  const pos = planetPos[i]!;
  const len = Math.hypot(pos[0], pos[2]) || 1;
  const ox = pos[0] / len;
  const oz = pos[2] / len;
  const tx = -oz;
  const tz = ox;
  let dx = -ox * 0.75 + tx * 0.55;
  let dy = 0.4;
  let dz = -oz * 0.75 + tz * 0.55;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const reach = p.ring ? RING_OUTER * p.radius * 2.6 : p.radius * 4.6;
  const d = Math.max(reach, 3);
  return { position: [pos[0] + dx * d, pos[1] + dy * d, pos[2] + dz * d], target: [pos[0], pos[1], pos[2]] };
};

const startTransition = (): void => {
  fromPose = currentPose;
  blend = 0;
};

const focusPlanet = (name: string): void => {
  const i = PLANETS.findIndex((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (i < 0 || i === focusedIndex) return;
  focusedIndex = i;
  const p = PLANETS[i]!;
  panelName.textContent = p.name;
  panelPeriod.textContent = `Orbital period: ${p.periodDays.toLocaleString("en-US")} Earth days`;
  panelDist.textContent = `Distance from star: ${p.distMkm.toLocaleString("en-US")} million km`;
  panel.style.display = "block";
  startTransition();
};

const unfocus = (): void => {
  if (focusedIndex === null) return;
  focusedIndex = null;
  panel.style.display = "none";
  startTransition();
};

// ---------------------------------------------------------------- input
const canvas = document.getElementById("app") as HTMLCanvasElement;
let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;

const pickAt = (clientX: number, clientY: number): number | null => {
  const rect = canvas.getBoundingClientRect();
  const nx = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ny = 1 - ((clientY - rect.top) / rect.height) * 2;
  const pos = currentPose.position;
  const tgt = currentPose.target;
  let fx = tgt[0] - pos[0];
  let fy = tgt[1] - pos[1];
  let fz = tgt[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = forward x up(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  // camera up = right x forward
  const upx = 0 * fz - rz * fy;
  const upy = rz * fx - rx * fz;
  const upz = rx * fy - 0 * fx;
  const th = Math.tan((FOV * Math.PI) / 360);
  let dx = fx + rx * nx * th * ASPECT + upx * ny * th;
  let dy = fy + upy * ny * th;
  let dz = fz + rz * nx * th * ASPECT + upz * ny * th;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;
  let best: number | null = null;
  let bestT = Infinity;
  PLANETS.forEach((p, i) => {
    const c = planetPos[i]!;
    const ox = c[0] - pos[0];
    const oy = c[1] - pos[1];
    const oz = c[2] - pos[2];
    const t = ox * dx + oy * dy + oz * dz;
    if (t <= 0) return;
    const perp2 = ox * ox + oy * oy + oz * oz - t * t;
    const r = Math.max(p.radius * 1.15, t * 0.03);
    if (perp2 <= r * r && t < bestT) {
      best = i;
      bestT = t;
    }
  });
  return best;
};

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (focusedIndex === null) {
    orbit.yaw -= dx * 0.008;
    orbit.pitch = clamp(orbit.pitch + dy * 0.006, 0.08, 1.45);
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  if (canvas.hasPointerCapture(e.pointerId)) canvas.releasePointerCapture(e.pointerId);
  if (moved > 5) return;
  const hit = pickAt(e.clientX, e.clientY);
  if (hit === null) unfocus();
  else focusPlanet(PLANETS[hit]!.name);
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focusedIndex !== null) return;
    orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), ORBIT_MIN, ORBIT_MAX);
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});
pauseBtn.addEventListener("click", () => {
  sim.paused = !sim.paused;
  pauseBtn.textContent = sim.paused ? "Play" : "Pause";
});

// ---------------------------------------------------------------- per frame
let ready = false;
let frames = 0;

const updatePlanets = (): void => {
  PLANETS.forEach((p, i) => {
    const a = p.phase + (sim.time / simPeriod(p)) * Math.PI * 2;
    const x = Math.cos(a) * p.dist;
    const z = Math.sin(a) * p.dist;
    const pos = planetPos[i]!;
    pos[0] = x;
    pos[1] = 0;
    pos[2] = z;
    app.nodes.require(`planet-${i}`).setPosition(x, 0, z).setRotation(0.1, sim.spinTime * p.spin, 0);
    if (p.ring) {
      app.nodes.require(`ring-a-${i}`).setPosition(x, 0, z).setRotation(-Math.PI / 2 + RING_TILT, 0, 0);
      app.nodes.require(`ring-b-${i}`).setPosition(x, 0, z).setRotation(-Math.PI / 2 + RING_TILT, 0, 0);
    }
    if (p.moon) {
      const m = (sim.time / MOON_PERIOD) * Math.PI * 2;
      app.nodes.require(`moon-${i}`).setPosition(x + Math.cos(m) * MOON_ORBIT, Math.sin(m) * 0.25, z + Math.sin(m) * MOON_ORBIT);
    }
  });
  app.nodes.require("sun").setRotation(0, sim.spinTime * 0.2, 0);
};

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  if (!sim.paused) {
    sim.time += dt;
    sim.spinTime += dt;
  }
  updatePlanets();

  if (blend < 1) blend = Math.min(1, blend + dt / TRANSITION_SECONDS);
  const desired = focusedIndex === null ? overviewPose() : focusPose(focusedIndex);
  if (blend >= 1) {
    currentPose = desired;
  } else {
    const e = ease(blend);
    currentPose = { position: lerp3(fromPose.position, desired.position, e), target: lerp3(fromPose.target, desired.target, e) };
  }
  app.camera?.setPose({ position: currentPose.position, target: currentPose.target, fov: FOV, near: 0.2, far: 1000 });

  frames += 1;
  if (frames === 2) {
    (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
  }
});

// ---------------------------------------------------------------- test hooks
const taskState = {
  get ready(): boolean {
    return ready;
  },
  get focused(): string | null {
    return focusedIndex === null ? null : PLANETS[focusedIndex]!.name;
  },
  get paused(): boolean {
    return sim.paused;
  },
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] }));
  },
  get cameraDistanceToFocus(): number | null {
    if (focusedIndex === null) return null;
    const c = planetPos[focusedIndex]!;
    const p = currentPose.position;
    return Math.hypot(p[0] - c[0], p[1] - c[1], p[2] - c[2]);
  }
};
Object.defineProperty(window, "__TASK_STATE__", { value: taskState, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__focusPlanet", { value: (name: string): void => focusPlanet(name), writable: false });
Object.defineProperty(window, "__unfocus", { value: (): void => unfocus(), writable: false });

void app.ready().then(() => {
  ready = true;
});
