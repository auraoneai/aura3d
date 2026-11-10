import {
  camera,
  createAuraApp,
  environments,
  geometry,
  lights,
  lines,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";
import { backdropModel, backdropOutput } from "./three-bridge/backdrop.bridge";
import { makeBandedTexture, makeEarthTexture, makeRingTexture, makeRockyTexture, makeSunTexture } from "./textures";

type V3 = [number, number, number];

interface PlanetDef {
  readonly name: string;
  readonly size: number; // diameter in scene units
  readonly orbit: number; // orbit radius in scene units
  readonly periodDays: number;
  readonly distanceMkm: number;
  readonly spin: number; // rad/s
  readonly focusDist: number;
  readonly phase: number;
  readonly texture: ReturnType<typeof texture.data>;
  readonly hasRing?: boolean;
}

interface MoonDef {
  readonly id: string;
  readonly planet: string;
  readonly size: number;
  readonly orbit: number;
  readonly speed: number;
  readonly phase: number;
  readonly color: string;
}

const SIZE_SCALE = 1.35;
const RAW_PLANETS: readonly PlanetDef[] = [
  { name: "Mercury", size: 1.0, orbit: 9.5, periodDays: 88, distanceMkm: 57.9, spin: 0.6, focusDist: 4, phase: 0.4,
    texture: makeRockyTexture(1, "#9b948d", "#5c5651", 4.5, false) },
  { name: "Venus", size: 1.8, orbit: 13, periodDays: 224.7, distanceMkm: 108.2, spin: -0.3, focusDist: 5.6, phase: 2.2,
    texture: makeBandedTexture(2, ["#e8cf93", "#d1a65a", "#f1dfb0", "#bd8f4c"], 9, 1.6) },
  { name: "Earth", size: 1.9, orbit: 17, periodDays: 365.25, distanceMkm: 149.6, spin: 1.2, focusDist: 6.4, phase: 4.1,
    texture: makeEarthTexture(3) },
  { name: "Mars", size: 1.3, orbit: 21.5, periodDays: 687, distanceMkm: 227.9, spin: 1.1, focusDist: 4.6, phase: 1.1,
    texture: makeRockyTexture(4, "#c4623a", "#7a2f1c", 3.2, true) },
  { name: "Jupiter", size: 4.2, orbit: 28, periodDays: 4331, distanceMkm: 778.5, spin: 2.2, focusDist: 11.5, phase: 5.3,
    texture: makeBandedTexture(5, ["#e3c9a1", "#b27a4c", "#f2e5cf", "#8e5a3c", "#d6a877"], 14, 1.1) },
  { name: "Saturn", size: 3.5, orbit: 35, periodDays: 10747, distanceMkm: 1432, spin: 2.0, focusDist: 15, phase: 3.0, hasRing: true,
    texture: makeBandedTexture(6, ["#ead7a0", "#cdb377", "#f3e6bd", "#b79d62"], 11, 0.5) },
  { name: "Uranus", size: 2.6, orbit: 41, periodDays: 30589, distanceMkm: 2867, spin: -1.4, focusDist: 7.6, phase: 0.2,
    texture: makeBandedTexture(7, ["#9fe0e3", "#86cfd6", "#b3ebee"], 6, 0.35) },
  { name: "Neptune", size: 2.5, orbit: 47, periodDays: 59800, distanceMkm: 4515, spin: 1.5, focusDist: 7.4, phase: 4.8,
    texture: makeBandedTexture(8, ["#3b63d9", "#2c49b3", "#5b86f0", "#26399b"], 8, 0.8) }
];
const PLANETS: readonly PlanetDef[] = RAW_PLANETS.map((p) => ({ ...p, size: p.size * SIZE_SCALE, focusDist: p.focusDist * SIZE_SCALE }));

const MOONS: readonly MoonDef[] = [
  { id: "moon-luna", planet: "Earth", size: 0.5, orbit: 2.3, speed: 2.6, phase: 0.5, color: "#c9c6c0" },
  { id: "moon-io", planet: "Jupiter", size: 0.7, orbit: 3.9, speed: 1.7, phase: 2.0, color: "#e6d27a" },
  { id: "moon-europa", planet: "Jupiter", size: 0.6, orbit: 5.2, speed: 1.1, phase: 4.0, color: "#d8d2c4" }
];

const SUN_RADIUS = 4;
const SAT_RING_INNER = 1.35;
const SAT_RING_OUTER = 2.4;
const SAT_RING_TILT = 0.5;
const FOV = 40;
const TRANSITION_SECONDS = 1.5;
const MIN_DIST = 30;
const MAX_DIST = 150;

/** Angular speed in rad/s: compressed so inner planets are faster but outer ones still visibly move. */
const orbitSpeed = (def: PlanetDef): number => 0.55 / Math.pow(def.periodDays / 88, 0.5);

const planetId = (name: string): string => `planet-${name.toLowerCase()}`;

// ------------------------------------------------------------------ scene
const SUN_TEXTURE = makeSunTexture(11);
const stage = scene({ background: "#02030a" })
  .add(backdropModel())
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.point({ name: "sunlight", color: "#fff1d6", intensity: 110, position: [0, 0, 0], decay: 0.3 }))
  .add(
    primitives.sphere({
      name: "sun",
      size: SUN_RADIUS * 2,
      material: material.pbr({ texture: SUN_TEXTURE, color: "#ffffff", unlit: true })
    }).runtime({ id: "sun", mutable: true })
  );

for (const def of PLANETS) {
  // thin orbit line
  const pts: V3[] = [];
  for (let i = 0; i < 160; i += 1) {
    const a = (i / 160) * Math.PI * 2;
    pts.push([Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit]);
  }
  stage.add(lines.loop({ name: `orbit-${def.name.toLowerCase()}`, points: pts, material: material.pbr({ color: "#4a587a", unlit: true }) }));
  stage.add(
    primitives.sphere({
      name: def.name,
      size: def.size,
      material: material.pbr({ texture: def.texture, color: "#ffffff", roughness: 0.92, metallic: 0 })
    }).position(def.orbit, 0, 0).runtime({ id: planetId(def.name), mutable: true })
  );
}

// Saturn ring: flat annulus with a radial alpha texture.
{
  const saturn = PLANETS.find((p) => p.hasRing)!;
  const inner = (saturn.size / 2) * SAT_RING_INNER;
  const outer = (saturn.size / 2) * SAT_RING_OUTER;
  const S = 96;
  const positions = new Float32Array((S + 1) * 2 * 3);
  const normals = new Float32Array((S + 1) * 2 * 3);
  const uvs = new Float32Array((S + 1) * 2 * 2);
  const indices: number[] = [];
  for (let i = 0; i <= S; i += 1) {
    const a = (i / S) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.set([c * inner, 0, s * inner, c * outer, 0, s * outer], i * 6);
    normals.set([0, 1, 0, 0, 1, 0], i * 6);
    uvs.set([0, i / S, 1, i / S], i * 4);
    if (i < S) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
    }
  }
  const ringGeo = geometry.define({ positions, normals, indices, uvs, bounds: { min: [-outer, 0, -outer], max: [outer, 0, outer] } });
  stage.add(
    geometry.custom(ringGeo, {
      name: "saturn-ring",
      material: material.pbr({ texture: makeRingTexture(21), color: "#ffffff", roughness: 1, metallic: 0, alphaMode: "blend", doubleSided: true, depthWrite: false, unlit: true })
    }).position(saturn.orbit, 0, 0).rotation(SAT_RING_TILT, 0, 0).runtime({ id: "saturn-ring", mutable: true })
  );
}

for (const m of MOONS) {
  stage.add(
    primitives.sphere({ name: m.id, size: m.size, material: material.pbr({ color: m.color, roughness: 0.95, metallic: 0 }) })
      .position(0, 0, 0)
      .runtime({ id: m.id, mutable: true })
  );
}

const app = createAuraApp("#app", {
  scene: stage.camera(camera.perspective({ position: [0, 55, 75], target: [0, 0, 0], fov: FOV, near: 0.5, far: 1500 })),
  output: backdropOutput
});

// ------------------------------------------------------------------ state
let simTime = 0;
let paused = false;
let focused: PlanetDef | null = null;
let frameCount = 0;
let ready = false;

const view = { yaw: 0.35, pitch: 0.5, dist: 108 };
const camState = { pos: [0, 55, 75] as V3, tgt: [0, 0, 0] as V3 };
const transition = { t: 1, fromPos: [0, 0, 0] as V3, fromTgt: [0, 0, 0] as V3 };

const planetPos = new Map<string, V3>();
const moonPos = new Map<string, V3>();

function orbitAngle(def: PlanetDef): number {
  return def.phase + orbitSpeed(def) * simTime;
}

function updateBodies(): void {
  const sun = app.nodes.require("sun");
  sun.setRotation(0, simTime * 0.08, 0);
  for (const def of PLANETS) {
    const a = orbitAngle(def);
    const p: V3 = [Math.cos(a) * def.orbit, 0, Math.sin(a) * def.orbit];
    planetPos.set(def.name, p);
    const node = app.nodes.require(planetId(def.name));
    node.setPosition(p[0], p[1], p[2]);
    node.setRotation(0.1, simTime * def.spin, 0);
    if (def.hasRing) app.nodes.require("saturn-ring").setPosition(p[0], p[1], p[2]);
  }
  for (const m of MOONS) {
    const host = planetPos.get(m.planet)!;
    const a = m.phase + m.speed * simTime;
    const p: V3 = [host[0] + Math.cos(a) * m.orbit, 0, host[2] + Math.sin(a) * m.orbit];
    moonPos.set(m.id, p);
    app.nodes.require(m.id).setPosition(p[0], p[1], p[2]);
  }
}

// ------------------------------------------------------------------ camera
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const mix3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];
const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

function goalPose(): { pos: V3; tgt: V3 } {
  if (focused) {
    const pp = planetPos.get(focused.name)!;
    const len = Math.hypot(pp[0], pp[2]) || 1;
    const rx = pp[0] / len;
    const rz = pp[2] / len;
    const tx = -rz;
    const tz = rx;
    let ox = -0.5 * rx + 0.8 * tx;
    let oy = 0.35;
    let oz = -0.5 * rz + 0.8 * tz;
    const ol = Math.hypot(ox, oy, oz);
    ox /= ol; oy /= ol; oz /= ol;
    const d = focused.focusDist;
    return { pos: [pp[0] + ox * d, pp[1] + oy * d, pp[2] + oz * d], tgt: [pp[0], pp[1], pp[2]] };
  }
  const cp = Math.cos(view.pitch);
  return {
    pos: [view.dist * cp * Math.sin(view.yaw), view.dist * Math.sin(view.pitch), view.dist * cp * Math.cos(view.yaw)],
    tgt: [0, 0, 0]
  };
}

function beginTransition(): void {
  transition.t = 0;
  transition.fromPos = [...camState.pos] as V3;
  transition.fromTgt = [...camState.tgt] as V3;
}

function updateCamera(dt: number): void {
  const goal = goalPose();
  if (transition.t < 1) {
    transition.t = Math.min(1, transition.t + dt / TRANSITION_SECONDS);
    const k = easeInOutCubic(transition.t);
    camState.pos = mix3(transition.fromPos, goal.pos, k);
    camState.tgt = mix3(transition.fromTgt, goal.tgt, k);
  } else {
    camState.pos = goal.pos;
    camState.tgt = goal.tgt;
  }
  app.camera?.setPose({ position: camState.pos, target: camState.tgt, fov: FOV, near: 0.5, far: 1500 });
}

// ------------------------------------------------------------------ picking
const canvas = document.getElementById("app") as HTMLCanvasElement;

function project(p: V3): { x: number; y: number; z: number; scale: number } | null {
  const W = canvas.clientWidth || 640;
  const H = canvas.clientHeight || 360;
  const aspect = W / H;
  const f: V3 = [camState.tgt[0] - camState.pos[0], camState.tgt[1] - camState.pos[1], camState.tgt[2] - camState.pos[2]];
  const fl = Math.hypot(...f) || 1;
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  // right = f x up(0,1,0)
  let r: V3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(...r) || 1;
  r = [r[0] / rl, 0, r[2] / rl];
  const u: V3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const v: V3 = [p[0] - camState.pos[0], p[1] - camState.pos[1], p[2] - camState.pos[2]];
  const z = v[0] * f[0] + v[1] * f[1] + v[2] * f[2];
  if (z <= 0.1) return null;
  const th = Math.tan((FOV * Math.PI) / 360);
  const nx = (v[0] * r[0] + v[1] * r[1] + v[2] * r[2]) / (z * th * aspect);
  const ny = (v[0] * u[0] + v[1] * u[1] + v[2] * u[2]) / (z * th);
  return { x: ((nx + 1) / 2) * W, y: ((1 - ny) / 2) * H, z, scale: H / 2 / (z * th) };
}

function pickAt(px: number, py: number): PlanetDef | null {
  let best: PlanetDef | null = null;
  let bestZ = Infinity;
  for (const def of PLANETS) {
    const pp = planetPos.get(def.name);
    if (!pp) continue;
    const s = project(pp);
    if (!s) continue;
    const radius = Math.max((def.size / 2) * s.scale * 1.15 + 3, 11);
    if (Math.hypot(s.x - px, s.y - py) <= radius && s.z < bestZ) {
      best = def;
      bestZ = s.z;
    }
  }
  return best;
}

// ------------------------------------------------------------------ focus API + UI
const panel = document.createElement("div");
panel.id = "info-panel";
panel.setAttribute("aria-live", "polite");
panel.style.cssText =
  "position:absolute;left:10px;top:10px;min-width:170px;padding:8px 12px;border-radius:8px;" +
  "background:rgba(10,14,28,0.78);border:1px solid rgba(140,170,255,0.45);color:#e8eeff;" +
  "font:12px/1.5 system-ui,sans-serif;display:none;pointer-events:none;";
document.body.appendChild(panel);

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
pauseBtn.style.cssText =
  "position:absolute;left:566px;top:10px;padding:5px 14px;border-radius:6px;cursor:pointer;" +
  "background:rgba(10,14,28,0.78);border:1px solid rgba(140,170,255,0.55);color:#e8eeff;font:12px system-ui,sans-serif;";
document.body.appendChild(pauseBtn);

const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

function showPanel(def: PlanetDef | null): void {
  if (!def) {
    panel.style.display = "none";
    return;
  }
  panel.innerHTML =
    `<div id="info-name" style="font-size:15px;font-weight:600;margin-bottom:2px">${def.name}</div>` +
    `<div id="info-period">Orbital period: ${fmt(def.periodDays)} Earth days</div>` +
    `<div id="info-distance">Distance from star: ${fmt(def.distanceMkm)} million km</div>`;
  panel.style.display = "block";
}

const TOUR_SECONDS_PER_PLANET = 3;
let touring = false;
let tourIndex = 0;
let tourTimer = 0;

const tourBtn = document.createElement("button");
tourBtn.id = "tour-btn";
tourBtn.type = "button";
tourBtn.textContent = "Tour";
tourBtn.style.cssText =
  "display:block;margin:8px 10px;padding:5px 14px;border-radius:6px;cursor:pointer;" +
  "background:#10162c;border:1px solid rgba(140,170,255,0.55);color:#e8eeff;font:12px system-ui,sans-serif;";
document.body.appendChild(tourBtn);

function applyFocus(name: string): void {
  const def = PLANETS.find((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (!def || focused === def) return;
  focused = def;
  beginTransition();
  showPanel(def);
}

function applyUnfocus(): void {
  if (!focused) return;
  focused = null;
  beginTransition();
  showPanel(null);
}

function setTouring(on: boolean): void {
  touring = on;
  tourBtn.textContent = on ? "Stop tour" : "Tour";
}

/** Manual focus, like a click on that planet; it cancels a running tour. */
function focusPlanet(name: string): void {
  if (touring) setTouring(false);
  applyFocus(name);
}

/** Manual unfocus, like a click on empty space; it cancels a running tour. */
function unfocus(): void {
  if (touring) setTouring(false);
  applyUnfocus();
}

function startTour(): void {
  setTouring(true);
  tourIndex = 0;
  tourTimer = 0;
  applyFocus(PLANETS[0]!.name);
}

function updateTour(dt: number): void {
  if (!touring) return;
  tourTimer += dt;
  if (tourTimer < TOUR_SECONDS_PER_PLANET) return;
  tourTimer = 0;
  tourIndex += 1;
  if (tourIndex < PLANETS.length) {
    applyFocus(PLANETS[tourIndex]!.name);
  } else {
    setTouring(false);
    applyUnfocus();
  }
}

tourBtn.addEventListener("click", () => {
  if (touring) {
    setTouring(false);
    applyUnfocus();
  } else {
    startTour();
  }
});

pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// pointer: drag orbits in overview, click picks
let down: { x: number; y: number; id: number; moved: boolean } | null = null;
const local = (e: PointerEvent | WheelEvent): { x: number; y: number } => {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * (canvas.clientWidth || 640), y: ((e.clientY - r.top) / r.height) * (canvas.clientHeight || 360) };
};

canvas.addEventListener("pointerdown", (e) => {
  const p = local(e);
  down = { x: p.x, y: p.y, id: e.pointerId, moved: false };
  try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
});

canvas.addEventListener("pointermove", (e) => {
  const p = local(e);
  if (down && e.pointerId === down.id) {
    const dx = p.x - down.x;
    const dy = p.y - down.y;
    if (!down.moved && Math.hypot(dx, dy) > 4) down.moved = true;
    if (down.moved && !focused) {
      view.yaw -= (e.movementX || 0) * 0.008;
      view.pitch = clamp(view.pitch + (e.movementY || 0) * 0.006, 0.08, 1.45);
    }
  } else {
    canvas.style.cursor = pickAt(p.x, p.y) ? "pointer" : "default";
  }
});

canvas.addEventListener("pointerup", (e) => {
  if (!down || e.pointerId !== down.id) return;
  const wasDrag = down.moved;
  down = null;
  try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  if (wasDrag) return;
  const p = local(e);
  const hit = pickAt(p.x, p.y);
  if (hit) focusPlanet(hit.name);
  else unfocus();
});

canvas.addEventListener("pointercancel", () => { down = null; });

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused) return;
    view.dist = clamp(view.dist * Math.exp(e.deltaY * 0.001), MIN_DIST, MAX_DIST);
  },
  { passive: false }
);

// ------------------------------------------------------------------ exposed state
const snapshot = () => {
  let dist: number | null = null;
  if (focused) {
    const pp = planetPos.get(focused.name)!;
    dist = Math.hypot(camState.pos[0] - pp[0], camState.pos[1] - pp[1], camState.pos[2] - pp[2]);
  }
  return Object.freeze({
    ready,
    focused: focused ? focused.name : null,
    paused,
    touring,
    planets: PLANETS.map((d) => {
      const p = planetPos.get(d.name) ?? [d.orbit, 0, 0];
      return Object.freeze({ name: d.name, x: p[0], y: p[1], z: p[2] });
    }),
    cameraDistanceToFocus: dist
  });
};
Object.defineProperty(window, "__TASK_STATE__", { get: snapshot, enumerable: true, configurable: false });
Object.defineProperty(window, "__focusPlanet", { value: focusPlanet, writable: false, configurable: false });
Object.defineProperty(window, "__unfocus", { value: unfocus, writable: false, configurable: false });

// ------------------------------------------------------------------ loop
let appReady = false;
void app.ready().then(() => { appReady = true; });

updateBodies();
{
  const g = goalPose();
  camState.pos = g.pos;
  camState.tgt = g.tgt;
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  if (!paused) simTime += dt;
  updateTour(dt);
  updateBodies();
  updateCamera(dt);
  frameCount += 1;
  if (appReady && frameCount > 2 && !ready) {
    ready = true;
    requestAnimationFrame(() => {
      (window as unknown as { __EVAL_READY__?: boolean }).__EVAL_READY__ = true;
    });
  }
});
