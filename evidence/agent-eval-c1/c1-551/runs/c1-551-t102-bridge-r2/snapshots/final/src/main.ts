import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";
import { ruinModel, ruinOutput } from "./three-bridge/ruin.bridge";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

// ---------------------------------------------------------------- constants
const CENTER_Y = 3.6; // matches recipes/ruin.mjs (ring centre)
const DISC_RADIUS = 2.4;

const CYAN = "#36e6ff";
const VIOLET = "#9b5cff";
const MOTE = "#b9f3ff";

// ---------------------------------------------------------------- vortex disc
const SEGMENTS = 72;
const discPositions = new Float32Array((SEGMENTS + 1) * 3 * 2);
const discNormals = new Float32Array((SEGMENTS + 1) * 3 * 2);
const discIndices: number[] = [];
discPositions.set([0, 0, 0], 0);
for (let i = 0; i < SEGMENTS; i += 1) {
  const a = (i / SEGMENTS) * Math.PI * 2;
  discPositions.set([Math.cos(a), Math.sin(a), 0], (i + 1) * 3);
  discIndices.push(0, i + 1, ((i + 1) % SEGMENTS) + 1);
}
for (let i = 0; i <= SEGMENTS; i += 1) discNormals.set([0, 0, 1], i * 3);
const discGeo = geometry.define({
  positions: discPositions.subarray(0, (SEGMENTS + 1) * 3),
  normals: discNormals.subarray(0, (SEGMENTS + 1) * 3),
  indices: discIndices,
  bounds: { min: [-1, -1, -0.01], max: [1, 1, 0.01] }
});

const vortexMaterial = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
uniform float clk;
uniform float pulse;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  // logarithmic spiral arms, rotating, pulled inward over time
  float lr = log(r + 0.08);
  float twist = a * 4.0 + lr * 4.2 - clk * 1.5;
  float arms = 0.5 + 0.5 * sin(twist);
  arms = pow(arms, 2.2);
  float twist2 = a * 6.0 - lr * 5.5 + clk * 0.9;
  float fine = 0.5 + 0.5 * sin(twist2 + 0.8 * vnoise(vec2(a * 2.0 + clk * 0.4, lr * 3.0 - clk * 0.8)));
  float swirl = clamp(arms * 0.85 + fine * 0.22, 0.0, 1.0);
  // turbulent flow
  float n = vnoise(vec2(cos(a + clk * 0.3), sin(a + clk * 0.3)) * 2.0 + vec2(lr * 3.0 + clk * 1.3, 0.0));
  swirl = clamp(swirl + (n - 0.5) * 0.2, 0.0, 1.0);
  vec3 deep = vec3(0.06, 0.01, 0.22);
  vec3 violet = vec3(0.50, 0.18, 1.00);
  vec3 cyan = vec3(0.05, 0.80, 1.00);
  vec3 col = mix(deep, violet, smoothstep(0.05, 0.55, swirl));
  col = mix(col, cyan, smoothstep(0.6, 1.0, swirl) * (0.5 + 0.5 * (1.0 - r)));
  col *= 0.3 + 0.8 * swirl;
  // bright core
  float core = exp(-r * r * 60.0);
  float halo = exp(-r * 4.5) * 0.4;
  col += vec3(0.75, 0.95, 1.0) * core * 2.4 * pulse;
  col += vec3(0.25, 0.4, 1.0) * halo * pulse;
  // luminous rim where the energy meets the frame
  float rim = smoothstep(0.80, 1.0, r);
  col += mix(cyan, violet, 0.4 + 0.4 * sin(a * 2.0 - clk)) * rim * 1.3;
  col *= 0.8 + 0.3 * pulse;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 1 } },
  side: "double",
  castShadow: false,
  receiveShadow: false
});

// ---------------------------------------------------------------- particle pools
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = makeRng(20240611);
const range = (a: number, b: number): number => a + (b - a) * rand();
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

interface Spiral {
  age: number;
  life: number; // life <= 0 while waiting to respawn (age counts down the delay)
  ang: number;
  r0: number;
  dir: number;
  side: number;
  z0: number;
  size: number;
  wob: number;
}
interface Mote {
  age: number;
  life: number;
  x: number;
  z: number;
  vy: number;
  sway: number;
  swayF: number;
  size: number;
}

const SPIRAL_PER_GROUP = 150;
const MOTE_COUNT = 90;

function spawnSpiral(p: Spiral, prefill: boolean): void {
  p.life = range(3.6, 6.2);
  p.age = prefill ? rand() * p.life : 0;
  p.ang = rand() * Math.PI * 2;
  p.r0 = range(2.7, 3.9);
  p.side = rand() < 0.62 ? 1 : -1;
  p.z0 = range(0.6, 3.4);
  p.size = range(0.05, 0.12);
  p.wob = rand() * Math.PI * 2;
}
function makeSpirals(count: number, dir: number): Spiral[] {
  return Array.from({ length: count }, () => {
    const p: Spiral = { age: 0, life: 1, ang: 0, r0: 3, dir, side: 1, z0: 1, size: 0.08, wob: 0 };
    spawnSpiral(p, true);
    return p;
  });
}
const cyanSpirals = makeSpirals(SPIRAL_PER_GROUP, 1);
const violetSpirals = makeSpirals(SPIRAL_PER_GROUP, -1);

function spawnMote(m: Mote, prefill: boolean): void {
  m.life = range(4.5, 8);
  m.age = prefill ? rand() * m.life : 0;
  const a = rand() * Math.PI * 2;
  const r = Math.sqrt(rand()) * 4.6;
  m.x = Math.cos(a) * r;
  m.z = Math.sin(a) * r;
  m.vy = range(0.35, 0.85);
  m.sway = rand() * Math.PI * 2;
  m.swayF = range(0.4, 1.1);
  m.size = range(0.035, 0.08);
}
const motes: Mote[] = Array.from({ length: MOTE_COUNT }, () => {
  const m: Mote = { age: 0, life: 1, x: 0, z: 0, vy: 0.5, sway: 0, swayF: 1, size: 0.05 };
  spawnMote(m, true);
  return m;
});

const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.0001, 0.0001, 0.0001] };
const cyanTransforms: AuraTransformSpec[] = Array.from({ length: SPIRAL_PER_GROUP }, () => HIDDEN);
const violetTransforms: AuraTransformSpec[] = Array.from({ length: SPIRAL_PER_GROUP }, () => HIDDEN);
const moteTransforms: AuraTransformSpec[] = Array.from({ length: MOTE_COUNT }, () => HIDDEN);
const cyanColors = cyanTransforms.map(() => CYAN);
const violetColors = violetTransforms.map(() => VIOLET);
const moteColors = moteTransforms.map(() => MOTE);

/** Advance spiral particles; returns the number alive. Writes transforms in place. */
function stepSpirals(list: Spiral[], out: AuraTransformSpec[], dt: number, t: number): number {
  let live = 0;
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i]!;
    p.age += dt;
    if (p.age >= p.life) {
      // dead: wait a short random delay, then respawn
      if (p.age >= p.life + 0.15 + (i % 7) * 0.12) spawnSpiral(p, false);
      out[i] = HIDDEN;
      continue;
    }
    const u = p.age / p.life;
    const k = 1 - u;
    const r = p.r0 * Math.pow(k, 1.35) + 0.12;
    const theta = p.ang + p.dir * (u * 5.2 + u * u * 9.0);
    const x = Math.cos(theta) * r;
    const y = Math.max(0.95, CENTER_Y + Math.sin(theta) * r * 0.86);
    const z = p.side * p.z0 * Math.pow(k, 1.6) + Math.sin(t * 2.1 + p.wob) * 0.08 * k;
    const s = p.size * smooth(0, 0.12, u) * (1 - smooth(0.82, 1, u)) * (0.75 + 0.5 * Math.sin(t * 6 + p.wob));
    out[i] = { position: [x, y, z], scale: [s, s, s] };
    live += 1;
  }
  return live;
}

function stepMotes(dt: number, t: number): number {
  let live = 0;
  for (let i = 0; i < motes.length; i += 1) {
    const m = motes[i]!;
    m.age += dt;
    if (m.age >= m.life) {
      spawnMote(m, false);
    }
    const u = m.age / m.life;
    const y = 0.85 + m.age * m.vy;
    const x = m.x + Math.sin(t * m.swayF + m.sway) * 0.35;
    const z = m.z + Math.cos(t * m.swayF * 0.8 + m.sway) * 0.35;
    const s = m.size * smooth(0, 0.15, u) * (1 - smooth(0.55, 1, u)) * (0.8 + 0.4 * Math.sin(t * 4 + m.sway));
    moteTransforms[i] = { position: [x, y, z], scale: [s, s, s] };
    live += 1;
  }
  return live;
}

// ---------------------------------------------------------------- scene
const glow = (color: string, intensity: number) =>
  material.emissive({ color, emissive: color, emissiveIntensity: intensity });

const stage = scene({ background: "#120d24" })
  .add(sky.gradient({ zenith: "#0b0a22", horizon: "#8a3f6a", ground: "#1a1226", exponent: 0.55, horizonGlow: 0.6, intensity: 0.9 }))
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(ruinModel())
  // dusk key (cool violet, from behind-left) and a low warm rim from the horizon
  .add(lights.directional({ name: "dusk-key", position: [-9, 9, -7], target: [0, 1.5, 0], intensity: 0.9, color: "#8d86d6", shadow: true }))
  .add(lights.directional({ name: "dusk-rim", position: [11, 2.5, -4], target: [0, 2, 0], intensity: 0.3, color: "#ff8a5c" }))
  // portal light: cyan in front, violet behind and low, all pulsing slowly
  .add(lights.point({ name: "portal-front", position: [0, CENTER_Y, 2.4], intensity: 55, color: CYAN, distance: 15, decay: 2 }).runtime({ id: "portal-front", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, CENTER_Y, -2.4], intensity: 50, color: VIOLET, distance: 14, decay: 2 }).runtime({ id: "portal-back", mutable: true }))
  .add(lights.point({ name: "portal-floor", position: [0, 1.4, 3.2], intensity: 22, color: VIOLET, distance: 9, decay: 2 }).runtime({ id: "portal-floor", mutable: true }))
  // the swirling energy surface
  .add(geometry.custom(discGeo, { name: "vortex", material: vortexMaterial }).position(0, CENTER_Y, 0).scale(DISC_RADIUS).runtime({ id: "vortex", mutable: true }))
  // soft bright sprite at the core so the bloom has something dense to grab
  .add(primitives.sphere({ name: "core", size: 0.5, material: glow("#d8f6ff", 5) }).position(0, CENTER_Y, 0).scale([1, 1, 0.12]).runtime({ id: "core", mutable: true }))
  .add(instances.sphere({ name: "spiral-cyan", transforms: cyanTransforms, colors: cyanColors, material: glow(CYAN, 4) }).runtime({ id: "spiral-cyan", mutable: true }))
  .add(instances.sphere({ name: "spiral-violet", transforms: violetTransforms, colors: violetColors, material: glow(VIOLET, 4.5) }).runtime({ id: "spiral-violet", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: moteTransforms, colors: moteColors, material: glow(MOTE, 3.5) }).runtime({ id: "motes", mutable: true }))
  .add(effects.fog({ color: "#3a2148", density: 0.017 }))
  .add(effects.bloom({ intensity: 0.8, threshold: 0.9, radius: 0.7 }))
  .add(effects.vignette({ intensity: 0.45, smoothness: 2, roundness: 1 }))
  .camera(camera.perspective({ position: [0, 3.4, 13.5], target: [0, 3.0, 0], fov: 42, near: 0.1, far: 120 }));

const app = createAuraApp("#app", { scene: stage, output: ruinOutput });

window.__TASK_STATE__ = { portalActive: true, particleCount: 0, time: 0 };
window.__EVAL_READY__ = false;

// ---------------------------------------------------------------- open / close control
let portalOpen = true;
let lightLevel = 1; // eases towards 0 (closed) or 1 (open)
const PORTAL_NODES = ["vortex", "core", "spiral-cyan", "spiral-violet", "motes"] as const;

const toggle = document.createElement("button");
toggle.id = "portal-toggle";
toggle.type = "button";
toggle.textContent = "Close portal";
toggle.style.cssText = "display:block;margin:8px;padding:6px 14px;font:inherit;cursor:pointer;";
document.body.appendChild(toggle);

function setPortalOpen(open: boolean): void {
  portalOpen = open;
  toggle.textContent = open ? "Close portal" : "Open portal";
  for (const id of PORTAL_NODES) app.nodes.require(id).setVisible(open);
  if (open) {
    // restart the particle pools so the portal re-forms from a fresh state
    for (const p of cyanSpirals) spawnSpiral(p, true);
    for (const p of violetSpirals) spawnSpiral(p, true);
    for (const m of motes) spawnMote(m, true);
  } else {
    cyanTransforms.fill(HIDDEN);
    violetTransforms.fill(HIDDEN);
    moteTransforms.fill(HIDDEN);
    app.nodes.require("spiral-cyan").setInstances?.(cyanTransforms, cyanColors);
    app.nodes.require("spiral-violet").setInstances?.(violetTransforms, violetColors);
    app.nodes.require("motes").setInstances?.(moteTransforms, moteColors);
  }
  window.__TASK_STATE__ = {
    portalActive: open,
    particleCount: 0,
    time: window.__TASK_STATE__?.time ?? 0
  };
}
toggle.addEventListener("click", () => {
  if (appReady) setPortalOpen(!portalOpen);
});

let firstFrame = true;
app.onFrame((f) => {
  const dt = Math.min(0.05, Math.max(0, f.dt));
  const t = f.time;

  // particles (none while closed)
  let live = 0;
  if (portalOpen) {
    live =
      stepSpirals(cyanSpirals, cyanTransforms, dt, t) +
      stepSpirals(violetSpirals, violetTransforms, dt, t) +
      stepMotes(dt, t);
    app.nodes.require("spiral-cyan").setInstances?.(cyanTransforms, cyanColors);
    app.nodes.require("spiral-violet").setInstances?.(violetTransforms, violetColors);
    app.nodes.require("motes").setInstances?.(moteTransforms, moteColors);
  }

  // slow pulse (period ~ 5 s) plus a faint flicker
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.25);
  const flick = 1 + 0.04 * Math.sin(t * 9.0) + 0.03 * Math.sin(t * 15.3);
  const k = (0.7 + 0.5 * pulse) * flick;
  lightLevel += ((portalOpen ? 1 : 0) - lightLevel) * Math.min(1, dt * 5);
  const L = lightLevel < 0.003 ? 0 : lightLevel;
  if (portalOpen) {
    app.nodes.require("vortex").setUniform?.("clk", t);
    app.nodes.require("vortex").setUniform?.("pulse", 0.8 + 0.4 * pulse);
    const coreScale = 1 + 0.12 * pulse;
    app.nodes.require("core").setScale?.([coreScale, coreScale, 0.12]);
  }
  app.nodes.require("portal-front").setLight?.({ intensity: 55 * k * L });
  app.nodes.require("portal-back").setLight?.({ intensity: 50 * (0.7 + 0.5 * (1 - pulse)) * flick * L });
  app.nodes.require("portal-floor").setLight?.({ intensity: 22 * k * L });

  // gentle camera orbit / sway
  const az = Math.sin(t * 0.13) * 0.5;
  const rad = 13.5 + Math.sin(t * 0.07) * 0.8;
  const h = 3.4 + Math.sin(t * 0.11 + 1) * 0.5;
  app.camera?.setPose({
    position: [Math.sin(az) * rad, h, Math.cos(az) * rad],
    target: [0, 3.0 + Math.sin(t * 0.09) * 0.15, 0]
  });

  window.__TASK_STATE__ = { portalActive: portalOpen, particleCount: live, time: t };
  if (firstFrame) {
    firstFrame = false;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

let appReady = false;
void app.ready().then(() => {
  appReady = true;
});
