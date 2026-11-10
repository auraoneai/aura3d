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

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

type Vec3 = [number, number, number];

interface MoonDef {
  orbit: number;
  radius: number;
  period: number; // seconds of sim time
  tilt: number;
  phase: number;
  color: string;
}

interface PlanetDef {
  name: string;
  kind: "rock" | "venus" | "earth" | "mars" | "jupiter" | "saturn" | "ice" | "neptune";
  radius: number;
  orbit: number;
  periodDays: number;
  distanceMkm: number;
  spin: number; // rad/s
  phase: number;
  ring?: boolean;
  moons: MoonDef[];
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", kind: "rock", radius: 0.45, orbit: 8, periodDays: 88, distanceMkm: 57.9, spin: 0.5, phase: 0.6, moons: [] },
  { name: "Venus", kind: "venus", radius: 0.85, orbit: 11.5, periodDays: 225, distanceMkm: 108.2, spin: -0.3, phase: 2.4, moons: [] },
  {
    name: "Earth", kind: "earth", radius: 0.95, orbit: 15.5, periodDays: 365, distanceMkm: 149.6, spin: 1.4, phase: 4.1,
    moons: [{ orbit: 1.9, radius: 0.26, period: 5, tilt: 0.25, phase: 0, color: "#b9b7b2" }]
  },
  { name: "Mars", kind: "mars", radius: 0.65, orbit: 19.5, periodDays: 687, distanceMkm: 227.9, spin: 1.3, phase: 1.1, moons: [] },
  {
    name: "Jupiter", kind: "jupiter", radius: 2.1, orbit: 26.5, periodDays: 4333, distanceMkm: 778.5, spin: 2.2, phase: 5.2,
    moons: [
      { orbit: 3.6, radius: 0.28, period: 6, tilt: 0.1, phase: 1, color: "#d8c9a0" },
      { orbit: 4.8, radius: 0.34, period: 10, tilt: -0.15, phase: 3.5, color: "#a99b8a" }
    ]
  },
  { name: "Saturn", kind: "saturn", radius: 1.7, orbit: 34, periodDays: 10759, distanceMkm: 1432, spin: 2, phase: 3.3, ring: true, moons: [] },
  { name: "Uranus", kind: "ice", radius: 1.2, orbit: 40.5, periodDays: 30687, distanceMkm: 2867, spin: -1.2, phase: 0.2, moons: [] },
  { name: "Neptune", kind: "neptune", radius: 1.15, orbit: 46.5, periodDays: 60190, distanceMkm: 4515, spin: 1.1, phase: 5.9, moons: [] }
];

const SUN_RADIUS = 3.4;
const RING_TILT = 0.42;
const FOV = 45;
const W = 640;
const H = 360;
const TRANSITION_MS = 1500;

// ---------- procedural textures ----------

function hash(ix: number, iy: number, seed: number): number {
  let h = (ix * 374761393 + iy * 668265263 + seed * 144665) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967295;
}

// Value noise that wraps horizontally with the given period so the sphere has no seam.
function vnoise(x: number, y: number, period: number, seed: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const wrap = (v: number): number => ((v % period) + period) % period;
  const a = hash(wrap(x0), y0, seed);
  const b = hash(wrap(x0 + 1), y0, seed);
  const c = hash(wrap(x0), y0 + 1, seed);
  const d = hash(wrap(x0 + 1), y0 + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

function fbm(u: number, v: number, baseX: number, baseY: number, octaves: number, seed: number): number {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let px = baseX;
  let py = baseY;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * vnoise(u * px, v * py, px, seed + o * 17);
    norm += amp;
    amp *= 0.5;
    px *= 2;
    py *= 2;
  }
  return sum / norm;
}

type RGB = readonly [number, number, number];
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const hex = (s: string): RGB => [
  parseInt(s.slice(1, 3), 16),
  parseInt(s.slice(3, 5), 16),
  parseInt(s.slice(5, 7), 16)
];
const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

function paintPlanet(kind: PlanetDef["kind"], seed: number): HTMLCanvasElement {
  const w = 256;
  const h = 128;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  if (!ctx) return cv;
  const img = ctx.createImageData(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      const v = y / h;
      let c: RGB;
      switch (kind) {
        case "rock": {
          const n = fbm(u, v, 8, 4, 5, seed);
          const crater = fbm(u, v, 24, 12, 2, seed + 9);
          c = mix(hex("#6f675f"), hex("#b3a99c"), n);
          c = mix(c, [60, 56, 52], clamp01((crater - 0.62) * 4));
          break;
        }
        case "venus": {
          const n = fbm(u + 0.15 * Math.sin(v * 9), v, 6, 5, 5, seed);
          c = mix(hex("#c98e45"), hex("#f1d9a0"), n);
          break;
        }
        case "earth": {
          const n = fbm(u, v, 5, 3, 6, seed);
          const lat = Math.abs(v - 0.5) * 2;
          if (n > 0.52) {
            const dry = fbm(u, v, 10, 6, 3, seed + 5);
            c = mix(hex("#3f7a3a"), hex("#a89466"), clamp01((dry - 0.4) * 2.2));
          } else {
            c = mix(hex("#0d2f6e"), hex("#2a6fb8"), clamp01(n * 2));
          }
          const cloud = fbm(u, v, 6, 5, 5, seed + 30);
          c = mix(c, [250, 250, 255], clamp01((cloud - 0.55) * 3.2) * 0.75);
          c = mix(c, [245, 248, 255], clamp01((lat - 0.82) * 8));
          break;
        }
        case "mars": {
          const n = fbm(u, v, 7, 4, 5, seed);
          c = mix(hex("#8f3a20"), hex("#d27a4a"), n);
          const lat = Math.abs(v - 0.5) * 2;
          c = mix(c, [240, 240, 245], clamp01((lat - 0.9) * 10));
          break;
        }
        case "jupiter": {
          const warp = (fbm(u, v, 6, 8, 4, seed) - 0.5) * 0.12;
          const band = 0.5 + 0.5 * Math.sin((v + warp) * Math.PI * 14);
          const fine = fbm(u, v, 4, 40, 3, seed + 3);
          c = mix(hex("#a9683f"), hex("#f0dcc0"), clamp01(band * 0.75 + fine * 0.35));
          const dx = (u - 0.35) * 6;
          const dy = (v - 0.62) * 14;
          const spot = clamp01(1 - (dx * dx + dy * dy));
          c = mix(c, hex("#b5472b"), spot * 0.9);
          break;
        }
        case "saturn": {
          const warp = (fbm(u, v, 4, 6, 3, seed) - 0.5) * 0.05;
          const band = 0.5 + 0.5 * Math.sin((v + warp) * Math.PI * 10);
          c = mix(hex("#b89a62"), hex("#eedcab"), band * 0.8 + 0.1);
          break;
        }
        case "ice": {
          const band = 0.5 + 0.5 * Math.sin(v * Math.PI * 6);
          const n = fbm(u, v, 4, 4, 3, seed);
          c = mix(hex("#6fc7cf"), hex("#a9e8e8"), clamp01(band * 0.4 + n * 0.5));
          break;
        }
        default: {
          const warp = (fbm(u, v, 6, 6, 3, seed) - 0.5) * 0.1;
          const band = 0.5 + 0.5 * Math.sin((v + warp) * Math.PI * 9);
          c = mix(hex("#1b3ea8"), hex("#4f86e8"), clamp01(band * 0.7 + 0.1));
          const dx = (u - 0.6) * 9;
          const dy = (v - 0.4) * 18;
          c = mix(c, hex("#0f2370"), clamp01(1 - (dx * dx + dy * dy)) * 0.8);
          break;
        }
      }
      const i = (y * w + x) * 4;
      img.data[i] = c[0];
      img.data[i + 1] = c[1];
      img.data[i + 2] = c[2];
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return cv;
}

// ---------- geometry helpers ----------

function annulus(inner: number, outer: number, segments = 96) {
  const positions = new Float32Array(segments * 2 * 3 * 2);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  // top face vertices 0..2n-1, bottom face vertices 2n..4n-1
  for (let i = 0; i < segments; i += 1) {
    const a = (i / segments) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    for (let f = 0; f < 2; f += 1) {
      const base = f * segments * 2 + i * 2;
      positions.set([c * inner, 0, s * inner], base * 3);
      positions.set([c * outer, 0, s * outer], (base + 1) * 3);
      normals.set([0, f === 0 ? 1 : -1, 0], base * 3);
      normals.set([0, f === 0 ? 1 : -1, 0], (base + 1) * 3);
    }
  }
  for (let i = 0; i < segments; i += 1) {
    const j = (i + 1) % segments;
    const a0 = i * 2;
    const a1 = i * 2 + 1;
    const b0 = j * 2;
    const b1 = j * 2 + 1;
    // top face (normal +y): counter-clockwise seen from above
    indices.push(a0, b0, a1, a1, b0, b1);
    const o = segments * 2;
    indices.push(o + a0, o + a1, o + b0, o + a1, o + b1, o + b0);
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-outer, 0, -outer], max: [outer, 0, outer] }
  });
}

function circlePoints(radius: number, n = 160): Vec3[] {
  const pts: Vec3[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * radius, 0, Math.sin(a) * radius]);
  }
  return pts;
}

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

// ---------- scene ----------

const planetId = (p: PlanetDef): string => `planet-${p.name}`;
const ringId = (p: PlanetDef): string => `ring-${p.name}`;
const moonId = (p: PlanetDef, i: number): string => `moon-${p.name}-${i}`;

let sceneBuilder = scene({ background: "#02030a" })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.point({ name: "sun-light", position: [0, 0, 0], intensity: 9, color: "#fff1d6", distance: 0, decay: 0 }))
  .add(
    primitives
      .sphere({ name: "sun", size: SUN_RADIUS * 2, material: material.solarSun({ emissiveIntensity: 2.6 }) })
      .runtime({ id: "sun", mutable: true })
  )
  .add(
    primitives.sphere({
      name: "sun-corona",
      size: SUN_RADIUS * 2.45,
      material: material.solarCorona({ opacity: 0.28 })
    })
  );

// starfield
{
  const r = rng(1234);
  const stars: AuraTransformSpec[] = [];
  const colors: string[] = [];
  const tints = ["#ffffff", "#dbe7ff", "#fff0d6", "#ffd9c2", "#c9d8ff"];
  for (let i = 0; i < 700; i += 1) {
    const u = r() * 2 - 1;
    const a = r() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const rad = 330;
    const size = 0.35 + r() * r() * 1.1;
    stars.push({ position: [Math.cos(a) * s * rad, u * rad, Math.sin(a) * s * rad], scale: [size, size, size] });
    colors.push(tints[Math.floor(r() * tints.length)]!);
  }
  sceneBuilder = sceneBuilder.add(
    instances.sphere({
      name: "stars",
      transforms: stars,
      colors,
      material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.6, unlit: true })
    })
  );
}

PLANETS.forEach((p, idx) => {
  sceneBuilder = sceneBuilder.add(
    lines
      .loop({
        name: `orbit-${p.name}`,
        points: circlePoints(p.orbit),
        material: material.emissive({ color: "#8fa3c9", emissive: "#8fa3c9", emissiveIntensity: 0.8, opacity: 0.55, unlit: true })
      })
  );
  const tex = texture.canvas({ canvas: paintPlanet(p.kind, 11 + idx * 31) });
  sceneBuilder = sceneBuilder.add(
    primitives
      .sphere({
        name: p.name,
        size: p.radius * 2,
        material: material.pbr({ texture: tex, color: "#ffffff", roughness: 0.85, metallic: 0 })
      })
      .position(p.orbit, 0, 0)
      .runtime({ id: planetId(p), mutable: true })
  );
  if (p.ring) {
    const bands: [number, number, string][] = [
      [1.35, 1.65, "#8c7a5b"],
      [1.7, 2.1, "#d9c391"],
      [2.15, 2.4, "#b3a07a"]
    ];
    bands.forEach(([a, b, color], bi) => {
      sceneBuilder = sceneBuilder.add(
        geometry
          .custom(annulus(p.radius * a, p.radius * b), {
            name: `${p.name}-ring-${bi}`,
            material: material.pbr({ color, roughness: 0.9, doubleSided: true })
          })
          .runtime({ id: `${ringId(p)}-${bi}`, mutable: true })
      );
    });
  }
  p.moons.forEach((m, mi) => {
    sceneBuilder = sceneBuilder.add(
      primitives
        .sphere({ name: `${p.name} moon ${mi + 1}`, size: m.radius * 2, material: material.pbr({ color: m.color, roughness: 0.95 }) })
        .runtime({ id: moonId(p, mi), mutable: true })
    );
  });
});

sceneBuilder = sceneBuilder
  .add(effects.bloom({ intensity: 0.55, threshold: 0.85, radius: 0.5 }))
  .camera(camera.perspective({ position: [0, 50, 70], target: [0, 0, 0], fov: FOV, near: 0.1, far: 900 }));

const app = createAuraApp("#app", { scene: sceneBuilder });

// ---------- simulation state ----------

const canvasEl = document.getElementById("app") as HTMLCanvasElement;
let paused = false;
let simTime = 0; // seconds of orbital motion

// Angular speed: inner planets faster (stylised compression of the real period ratios).
const omega = (p: PlanetDef): number => 0.75 / Math.pow(p.periodDays / 88, 0.55);

const planetPos = new Map<string, Vec3>();
const planetNodes = PLANETS.map((p) => ({ def: p, node: app.nodes.require(planetId(p)) }));
const ringNodes = PLANETS.filter((p) => p.ring).flatMap((p) =>
  [0, 1, 2].map((bi) => ({ def: p, node: app.nodes.require(`${ringId(p)}-${bi}`) }))
);
const moonNodes = PLANETS.flatMap((p) => p.moons.map((m, mi) => ({ def: p, moon: m, node: app.nodes.require(moonId(p, mi)) })));

function planetPosition(p: PlanetDef, t: number): Vec3 {
  const a = p.phase + omega(p) * t;
  return [Math.cos(a) * p.orbit, 0, Math.sin(a) * p.orbit];
}

function updateBodies(): void {
  for (const { def, node } of planetNodes) {
    const pos = planetPosition(def, simTime);
    planetPos.set(def.name, pos);
    node.setPosition(pos[0], pos[1], pos[2]);
    node.setRotation(0, def.phase + def.spin * simTime, 0);
  }
  for (const { def, node } of ringNodes) {
    const pos = planetPos.get(def.name)!;
    node.setPosition(pos[0], pos[1], pos[2]);
    node.setRotation(RING_TILT, 0, 0.12);
  }
  for (const { def, moon, node } of moonNodes) {
    const pos = planetPos.get(def.name)!;
    const a = moon.phase + (Math.PI * 2 * simTime) / moon.period;
    const lx = Math.cos(a) * moon.orbit;
    const lz = Math.sin(a) * moon.orbit;
    // tilt orbit plane about the x axis
    const ly = -lz * Math.sin(moon.tilt);
    const lz2 = lz * Math.cos(moon.tilt);
    node.setPosition(pos[0] + lx, pos[1] + ly, pos[2] + lz2);
  }
}

// ---------- camera ----------

const view = { azimuth: 0.0, elevation: 0.62, distance: 88 };
const MIN_DIST = 30;
const MAX_DIST = 160;

let curPos: Vec3 = [0, 0, 0];
let curTarget: Vec3 = [0, 0, 0];
let focused: PlanetDef | null = null;
let trans: { start: number; fromPos: Vec3; fromTarget: Vec3 } | null = null;

function overviewPose(): { pos: Vec3; target: Vec3 } {
  const ce = Math.cos(view.elevation);
  return {
    pos: [view.distance * ce * Math.sin(view.azimuth), view.distance * Math.sin(view.elevation), view.distance * ce * Math.cos(view.azimuth)],
    target: [0, 0, 0]
  };
}

function focusDistance(p: PlanetDef): number {
  return p.radius * (p.ring ? 7.2 : p.moons.length ? 6.5 : 4.6);
}

function focusPose(p: PlanetDef): { pos: Vec3; target: Vec3 } {
  const c = planetPos.get(p.name)!;
  const len = Math.hypot(c[0], c[2]) || 1;
  // direction from planet toward the star, rotated for a lit three-quarter view
  const bx = -c[0] / len;
  const bz = -c[2] / len;
  const rot = 0.55;
  const dx = bx * Math.cos(rot) - bz * Math.sin(rot);
  const dz = bx * Math.sin(rot) + bz * Math.cos(rot);
  const el = 0.28;
  const d = focusDistance(p);
  return {
    pos: [c[0] + d * Math.cos(el) * dx, c[1] + d * Math.sin(el), c[2] + d * Math.cos(el) * dz],
    target: [c[0], c[1], c[2]]
  };
}

const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

function updateCamera(): void {
  const goal = focused ? focusPose(focused) : overviewPose();
  if (trans) {
    const p = clamp01((performance.now() - trans.start) / TRANSITION_MS);
    const e = easeInOutCubic(p);
    curPos = lerp3(trans.fromPos, goal.pos, e);
    curTarget = lerp3(trans.fromTarget, goal.target, e);
    if (p >= 1) trans = null;
  } else {
    curPos = goal.pos;
    curTarget = goal.target;
  }
  app.camera?.setPose({ position: curPos, target: curTarget, fov: FOV });
}

function beginTransition(): void {
  trans = { start: performance.now(), fromPos: curPos, fromTarget: curTarget };
}

// ---------- focus / UI ----------

const ui = document.createElement("div");
ui.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:hidden;font:12px/1.4 system-ui,sans-serif;color:#e8eefc;`;
document.body.appendChild(ui);

const pauseBtn = document.createElement("button");
pauseBtn.type = "button";
pauseBtn.id = "pause-toggle";
pauseBtn.textContent = "Pause";
pauseBtn.style.cssText =
  "position:absolute;left:8px;top:8px;pointer-events:auto;padding:4px 12px;font:600 12px system-ui,sans-serif;color:#e8eefc;background:rgba(18,26,48,0.8);border:1px solid #5b6f9e;border-radius:4px;cursor:pointer;";
ui.appendChild(pauseBtn);

const hint = document.createElement("div");
hint.textContent = "Click a planet to focus. Drag to orbit, scroll to zoom.";
hint.style.cssText = "position:absolute;left:8px;bottom:8px;opacity:0.7;font-size:11px;text-shadow:0 0 3px #000;";
ui.appendChild(hint);

const panel = document.createElement("div");
panel.id = "info-panel";
panel.style.cssText =
  "position:absolute;right:8px;top:8px;min-width:150px;padding:8px 12px;background:rgba(10,16,34,0.82);border:1px solid #4a5d8f;border-radius:6px;display:none;";
panel.innerHTML =
  '<div id="info-name" style="font-size:15px;font-weight:700;margin-bottom:4px"></div>' +
  '<div>Orbital period: <b id="info-period"></b></div>' +
  '<div>Distance from star: <b id="info-distance"></b></div>';
ui.appendChild(panel);
const infoName = panel.querySelector<HTMLElement>("#info-name")!;
const infoPeriod = panel.querySelector<HTMLElement>("#info-period")!;
const infoDistance = panel.querySelector<HTMLElement>("#info-distance")!;

const fmt = (n: number): string => n.toLocaleString("en-US", { maximumFractionDigits: 1 });

function focusPlanet(p: PlanetDef): void {
  if (focused === p) return;
  beginTransition();
  focused = p;
  infoName.textContent = p.name;
  infoPeriod.textContent = `${fmt(p.periodDays)} Earth days`;
  infoDistance.textContent = `${fmt(p.distanceMkm)} million km`;
  panel.style.display = "block";
  hint.style.display = "none";
}

function unfocus(): void {
  if (!focused) return;
  beginTransition();
  focused = null;
  panel.style.display = "none";
  hint.style.display = "block";
}

pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
});

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------- picking (own projection of the pose we set) ----------

function project(world: Vec3): { x: number; y: number; depth: number; scale: number } | null {
  const f: Vec3 = [curTarget[0] - curPos[0], curTarget[1] - curPos[1], curTarget[2] - curPos[2]];
  const fl = Math.hypot(...f);
  f[0] /= fl; f[1] /= fl; f[2] /= fl;
  // right = f x up(0,1,0)
  let r: Vec3 = [-f[2], 0, f[0]];
  const rl = Math.hypot(...r) || 1;
  r = [r[0] / rl, 0, r[2] / rl];
  // true up = r x f
  const u: Vec3 = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  const d: Vec3 = [world[0] - curPos[0], world[1] - curPos[1], world[2] - curPos[2]];
  const z = d[0] * f[0] + d[1] * f[1] + d[2] * f[2];
  if (z <= 0.05) return null;
  const x = d[0] * r[0] + d[1] * r[1] + d[2] * r[2];
  const y = d[0] * u[0] + d[1] * u[1] + d[2] * u[2];
  const tanHalf = Math.tan((FOV * Math.PI) / 360);
  const ndcX = x / (z * tanHalf * (W / H));
  const ndcY = y / (z * tanHalf);
  return { x: ((ndcX + 1) / 2) * W, y: ((1 - ndcY) / 2) * H, depth: z, scale: H / 2 / (z * tanHalf) };
}

function pick(px: number, py: number): PlanetDef | null {
  let best: PlanetDef | null = null;
  let bestDepth = Infinity;
  for (const p of PLANETS) {
    const pos = planetPos.get(p.name);
    if (!pos) continue;
    const s = project(pos);
    if (!s) continue;
    const rad = Math.max(p.radius * s.scale * (p.ring ? 2.2 : 1), 9);
    const dist = Math.hypot(px - s.x, py - s.y);
    if (dist <= rad && s.depth < bestDepth) {
      best = p;
      bestDepth = s.depth;
    }
  }
  return best;
}

// ---------- pointer input ----------

let dragging = false;
let moved = 0;
let downX = 0;
let downY = 0;
let lastX = 0;
let lastY = 0;

canvasEl.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = 0;
  downX = lastX = e.clientX;
  downY = lastY = e.clientY;
  try {
    canvasEl.setPointerCapture(e.pointerId);
  } catch {
    /* ignore */
  }
});

canvasEl.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved = Math.max(moved, Math.hypot(e.clientX - downX, e.clientY - downY));
  if (!focused && moved > 4) {
    view.azimuth -= dx * 0.006;
    view.elevation = Math.max(0.08, Math.min(1.45, view.elevation + dy * 0.005));
  }
});

canvasEl.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved <= 4) {
    const rect = canvasEl.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const py = ((e.clientY - rect.top) / rect.height) * H;
    const hit = pick(px, py);
    if (hit) focusPlanet(hit);
    else unfocus();
  }
});

canvasEl.addEventListener("pointercancel", () => {
  dragging = false;
});

canvasEl.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focused) return;
    view.distance = Math.max(MIN_DIST, Math.min(MAX_DIST, view.distance * Math.exp(e.deltaY * 0.0012)));
  },
  { passive: false }
);

// ---------- test hooks ----------

let ready = false;

Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get() {
    return {
      ready,
      focused: focused ? focused.name : null,
      paused,
      planets: PLANETS.map((p) => {
        const pos = planetPos.get(p.name) ?? planetPosition(p, simTime);
        return { name: p.name, x: pos[0], y: pos[1], z: pos[2] };
      }),
      cameraDistanceToFocus: focused
        ? Math.hypot(
            curPos[0] - (planetPos.get(focused.name)?.[0] ?? 0),
            curPos[1] - (planetPos.get(focused.name)?.[1] ?? 0),
            curPos[2] - (planetPos.get(focused.name)?.[2] ?? 0)
          )
        : null
    };
  }
});

window.__focusPlanet = (name: string): void => {
  const p = PLANETS.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
  if (p) focusPlanet(p);
};
window.__unfocus = (): void => unfocus();

// ---------- frame loop ----------

// Initialise state before the first rendered frame.
updateBodies();
{
  const o = overviewPose();
  curPos = o.pos;
  curTarget = o.target;
}

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.1);
  if (!paused) simTime += dt;
  updateBodies();
  updateCamera();
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
