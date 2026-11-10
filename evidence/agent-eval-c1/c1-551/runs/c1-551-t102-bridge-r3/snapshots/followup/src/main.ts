import {
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene,
  type AuraRuntimeNodeHandle,
  type AuraTransformSpec
} from "@aura3d/engine";
import { ruinsCamera, ruinsModel, ruinsOutput } from "./three-bridge/ruins.bridge";

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

// ---- layout constants (match recipes/ruins.mjs: ring centre y = 0.84 + R + 0.1) ----
const CY = 0.84 + 2.6 + 0.1;
const DISC_R = 1.95;

// ---- seeded PRNG (deterministic) ----
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
const rand = rng(20240611);

// ---- vortex disc geometry (flat, polar grid) ----
function discGeometry(radius: number, rings: number, segs: number) {
  const count = 1 + rings * (segs + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];
  normals[2] = 1;
  uvs[0] = 0.5;
  uvs[1] = 0.5;
  for (let r = 1; r <= rings; r += 1) {
    for (let s = 0; s <= segs; s += 1) {
      const a = (s / segs) * Math.PI * 2;
      const rr = (r / rings) * radius;
      const i = 1 + (r - 1) * (segs + 1) + s;
      positions.set([Math.cos(a) * rr, Math.sin(a) * rr, 0], i * 3);
      normals[i * 3 + 2] = 1;
      uvs.set([0.5 + 0.5 * Math.cos(a) * (r / rings), 0.5 + 0.5 * Math.sin(a) * (r / rings)], i * 2);
      if (s < segs) {
        if (r === 1) indices.push(0, i, i + 1);
        else {
          const prev = 1 + (r - 2) * (segs + 1) + s;
          indices.push(prev, i, i + 1, prev, i + 1, prev + 1);
        }
      }
    }
  }
  return geometry.define({ positions, normals, uvs, indices, bounds: { min: [-radius, -radius, -0.01], max: [radius, radius, 0.01] } });
}

function quadGeometry(half: number) {
  const positions = new Float32Array([-half, -half, 0, half, -half, 0, half, half, 0, -half, half, 0]);
  const normals = new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1]);
  return geometry.define({
    positions,
    normals,
    indices: [0, 1, 2, 0, 2, 3],
    bounds: { min: [-half, -half, -0.01], max: [half, half, 0.01] }
  });
}

// ---- materials ----
const vortexMaterial = material.custom({
  glsl: {
    vertex: /* glsl */ `
out vec3 vP;
void main() {
  vP = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: /* glsl */ `
in vec3 vP;
out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; }
  return v;
}
void main() {
  vec2 p = vP.xy / ${DISC_R.toFixed(3)};
  float r = length(p);
  float a = atan(p.y, p.x);
  // twist grows toward the core and rotates over time
  float tw = a + 2.2 / (r + 0.28) - uT * 1.1;
  float arms = 0.5 + 0.5 * sin(tw * 3.0 + fbm(p * 3.0 + uT * 0.15) * 3.0);
  float arms2 = 0.5 + 0.5 * sin(a * 5.0 + 5.0 * r - uT * 1.9 + sin(r * 8.0 - uT) * 1.2);
  float ang = (1.0 - r) * 3.2 + uT * 0.35;
  mat2 rot = mat2(cos(ang), -sin(ang), sin(ang), cos(ang));
  float n = fbm(rot * p * 3.2 + vec2(0.0, uT * 0.25));
  float swirl = clamp(arms * 0.65 + arms2 * 0.25 + n * 0.5, 0.0, 1.4);
  vec3 violet = vec3(0.55, 0.12, 1.0);
  vec3 cyan = vec3(0.1, 0.85, 1.0);
  vec3 col = mix(violet, cyan, smoothstep(0.25, 0.95, arms * 0.7 + n * 0.45));
  col *= 0.35 + swirl * 0.9;
  // streaks of bright filaments
  float fil = pow(max(0.0, sin(tw * 7.0 + n * 6.0)), 10.0);
  col += vec3(0.5, 0.9, 1.0) * fil * 0.6 * (1.0 - r * 0.5);
  // bright core
  float core = exp(-r * r * 14.0);
  float core2 = exp(-r * r * 60.0);
  col += vec3(0.45, 0.7, 1.0) * core * 0.7 + vec3(1.0) * core2 * 1.6;
  // luminous rim where the energy meets the frame
  float rim = smoothstep(0.72, 1.0, r);
  col += mix(cyan, vec3(0.8, 0.5, 1.0), 0.5 + 0.5 * sin(a * 2.0 + uT)) * rim * 0.9;
  float alpha = smoothstep(1.0, 0.94, r);
  outColor = vec4(col * 0.9, alpha);
}`
  },
  uniforms: { uT: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double"
});

function haloMaterial(color: string, strength: number, power: number) {
  return material.custom({
    glsl: {
      vertex: /* glsl */ `
out vec3 vP;
void main() { vP = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`,
      fragment: /* glsl */ `
in vec3 vP;
out vec4 outColor;
void main() {
  float r = length(vP.xy) / ${(6.0).toFixed(2)};
  float f = pow(max(0.0, 1.0 - r), ${power.toFixed(2)});
  float pulse = 0.85 + 0.15 * sin(uT * 0.9);
  vec3 c = mix(vec3(0.55, 0.2, 1.0), vec3(0.1, 0.8, 1.0), smoothstep(1.0, 0.0, r)) ;
  outColor = vec4(c * f * ${strength.toFixed(2)} * pulse, f * 0.9);
}`
    },
    uniforms: { uT: { type: "f32", value: 0 } },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "double",
    fog: false
  });
}
void haloMaterial;

const sparkMat = material.pbr({ color: "#000000", emissive: "#ffffff", emissiveIntensity: 3.2, roughness: 1 });

// ---- particle simulation ----
const SPIRAL = 240;
const MOTES = 70;
interface Spiral { u: number; speed: number; r0: number; th0: number; dir: number; z0: number; size: number; hue: number }
interface Mote { u: number; speed: number; x: number; z: number; sway: number; ph: number; size: number; h: number }

function newSpiral(initial: boolean): Spiral {
  const front = rand() < 0.72;
  return {
    u: initial ? rand() : 0,
    speed: 0.09 + rand() * 0.1,
    r0: 2.8 + rand() * 3.4,
    th0: rand() * Math.PI * 2,
    dir: 1,
    z0: (front ? 1 : -1) * (1.0 + rand() * 4.2),
    size: 0.04 + rand() * 0.07,
    hue: rand()
  };
}
function newMote(initial: boolean): Mote {
  const a = rand() * Math.PI * 2;
  const rr = Math.sqrt(rand()) * 5.6;
  return {
    u: initial ? rand() : 0,
    speed: 0.1 + rand() * 0.12,
    x: Math.cos(a) * rr,
    z: Math.sin(a) * rr,
    sway: 0.2 + rand() * 0.5,
    ph: rand() * 6.28,
    size: 0.03 + rand() * 0.05,
    h: 5 + rand() * 4
  };
}
const spirals = Array.from({ length: SPIRAL }, () => newSpiral(true));
const motes = Array.from({ length: MOTES }, () => newMote(true));
const spiralColors = spirals.map((p) => (p.hue < 0.5 ? "#35d8ff" : p.hue < 0.85 ? "#9a5cff" : "#d9f6ff"));
const moteColors = motes.map((_, i) => (i % 3 === 0 ? "#ffb066" : i % 3 === 1 ? "#7fe8ff" : "#c9a0ff"));

const bell = (u: number) => Math.min(1, u * 6) * Math.min(1, (1 - u) * 5);
function spiralTransforms(): AuraTransformSpec[] {
  return spirals.map((p) => {
    const u = p.u;
    const k = Math.pow(1 - u, 1.35); // radius factor: pulled inward, accelerating
    const r = p.r0 * k + 0.05;
    const th = p.th0 + p.dir * (3.2 * u + 5.5 * (1 - k) * 1.0) + 0.6 * u * u;
    const z = p.z0 * Math.pow(k, 1.6);
    const s = p.size * bell(u) * (0.6 + 0.8 * (1 - k));
    return { position: [r * Math.cos(th), CY + r * Math.sin(th), z], scale: [s, s, s] };
  });
}
function moteTransforms(t: number): AuraTransformSpec[] {
  return motes.map((m) => {
    const y = 0.9 + m.u * m.h;
    const x = m.x + Math.sin(t * m.sway + m.ph) * 0.35 * (0.3 + m.u);
    const z = m.z + Math.cos(t * m.sway * 0.8 + m.ph) * 0.35 * (0.3 + m.u);
    const s = m.size * bell(m.u) * (1.0 - 0.4 * m.u);
    return { position: [x, y, z], scale: [s, s, s] };
  });
}

// ---- scene ----
const stage = scene({ background: "#0b0a16" })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(ruinsModel().runtime({ id: "ruins" }))
  // dusk: warm low key from the left, cool violet fill, dim sky hemisphere
  .add(lights.hemisphere({ name: "sky", skyColor: "#3b3470", groundColor: "#120f1c", intensity: 0.7 }))
  .add(lights.directional({ name: "dusk-sun", position: [-14, 5.5, 8], target: [0, 1.5, 0], intensity: 1.35, color: "#ff8c5a", shadow: true }))
  .add(lights.directional({ name: "moon-rim", position: [10, 9, -12], target: [0, 2, 0], intensity: 0.7, color: "#6a7cff" }))
  .add(lights.point({ name: "portal-cyan", position: [0, CY, 2.2], intensity: 60, distance: 18, decay: 2, color: "#37d6ff" }).runtime({ id: "lightCyan", mutable: true }))
  .add(lights.point({ name: "portal-violet", position: [-2.6, 1.6, 3.4], intensity: 38, distance: 14, decay: 2, color: "#9a50ff" }).runtime({ id: "lightViolet", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, CY, -2.4], intensity: 40, distance: 16, decay: 2, color: "#8a5cff" }).runtime({ id: "lightBack", mutable: true }))
  .add(lights.point({ name: "portal-floor", position: [0, 1.3, 0.8], intensity: 24, distance: 9, decay: 2, color: "#52e0ff" }).runtime({ id: "lightFloor", mutable: true }))
  // glow halos
  .add(
    geometry
      .custom(quadGeometry(6), { name: "halo-back", material: haloMaterial("#7a6cff", 1.2, 2.6), castShadow: false, receiveShadow: false })
      .position(0, CY, -0.9)
      .runtime({ id: "haloBack", mutable: true })
  )
  .add(
    geometry
      .custom(quadGeometry(6), { name: "halo-front", material: haloMaterial("#37d6ff", 0.5, 4.0), castShadow: false, receiveShadow: false })
      .position(0, CY, 0.9)
      .runtime({ id: "haloFront", mutable: true })
  )
  // the energy surface
  .add(geometry.custom(discGeometry(DISC_R, 28, 72), { name: "vortex", material: vortexMaterial, castShadow: false, receiveShadow: false }).position(0, CY, 0).runtime({ id: "vortex", mutable: true }))
  // particles
  .add(
    primitives
      .sphere({ name: "swirl", size: 1, material: sparkMat, instances: spiralTransforms(), instanceColors: spiralColors, castShadow: false, receiveShadow: false })
      .runtime({ id: "swirl", mutable: true })
  )
  .add(
    primitives
      .sphere({ name: "motes", size: 1, material: sparkMat, instances: moteTransforms(0), instanceColors: moteColors, castShadow: false, receiveShadow: false })
      .runtime({ id: "motes", mutable: true })
  )
  // atmosphere
  .add(effects.fog({ color: "#241c3c", density: 0.035 }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.7, radius: 0.8 }))
  .add(effects.vignette({ intensity: 0.45 }))
  .camera(ruinsCamera);

const app = createAuraApp("#app", { scene: stage, output: ruinsOutput });

window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL + MOTES, time: 0 };

let portalActive = true;
let applied = true;

const toggle = document.createElement("button");
toggle.id = "portal-toggle";
toggle.type = "button";
toggle.textContent = "Close portal";
toggle.style.cssText = "display:block;margin:8px;padding:6px 14px;font:inherit;cursor:pointer";
toggle.addEventListener("click", () => {
  portalActive = !portalActive;
  toggle.textContent = portalActive ? "Close portal" : "Open portal";
  window.__TASK_STATE__ = {
    portalActive,
    particleCount: portalActive ? SPIRAL + MOTES : 0,
    time: window.__TASK_STATE__?.time ?? 0
  };
});
document.body.appendChild(toggle);

let first = true;
let last = -1;
const node = (id: string): AuraRuntimeNodeHandle => app.nodes.require(id);
let handles: Record<string, AuraRuntimeNodeHandle> | undefined;

app.onFrame((f) => {
  const t = f.time;
  const dt = last < 0 ? 0 : Math.min(0.05, t - last);
  last = t;
  if (!handles) {
    handles = {
      vortex: node("vortex"),
      haloBack: node("haloBack"),
      haloFront: node("haloFront"),
      swirl: node("swirl"),
      motes: node("motes"),
      lightCyan: node("lightCyan"),
      lightViolet: node("lightViolet"),
      lightBack: node("lightBack"),
      lightFloor: node("lightFloor")
    };
  }
  const h = handles;

  if (applied !== portalActive) {
    applied = portalActive;
    for (const id of ["vortex", "haloBack", "haloFront", "swirl", "motes"]) h[id]!.setVisible(portalActive);
  }
  if (!portalActive) {
    h.lightCyan!.setLight?.({ intensity: 0 });
    h.lightViolet!.setLight?.({ intensity: 0 });
    h.lightBack!.setLight?.({ intensity: 0 });
    h.lightFloor!.setLight?.({ intensity: 0 });
    const az0 = Math.sin(t * 0.13) * 0.42;
    const d0 = 15.2 + Math.sin(t * 0.09) * 0.8;
    app.camera?.setPose({ position: [Math.sin(az0) * d0, 3.4 + Math.sin(t * 0.17) * 0.5, Math.cos(az0) * d0], target: [0, 3.0, 0], fov: 45 }, { cut: true });
    window.__TASK_STATE__ = { portalActive: false, particleCount: 0, time: t };
    return;
  }

  // shader clocks
  h.vortex!.setUniform?.("uT", t);
  h.haloBack!.setUniform?.("uT", t);
  h.haloFront!.setUniform?.("uT", t);

  // slow light pulse (~7 s period) with a faint flicker
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);
  const flick = 1 + 0.04 * Math.sin(t * 7.3) * Math.sin(t * 2.9);
  h.lightCyan!.setLight?.({ intensity: (38 + 42 * pulse) * flick });
  h.lightViolet!.setLight?.({ intensity: (22 + 32 * (1 - pulse)) * flick });
  h.lightBack!.setLight?.({ intensity: (26 + 30 * pulse) * flick });
  h.lightFloor!.setLight?.({ intensity: (14 + 22 * pulse) * flick });

  // particles
  for (const p of spirals) {
    p.u += p.speed * dt;
    if (p.u >= 1) Object.assign(p, newSpiral(false));
  }
  for (const m of motes) {
    m.u += m.speed * dt;
    if (m.u >= 1) Object.assign(m, newMote(false));
  }
  h.swirl!.setInstances?.(spiralTransforms(), spiralColors);
  h.motes!.setInstances?.(moteTransforms(t), moteColors);

  // slow orbiting camera sway
  const az = Math.sin(t * 0.13) * 0.42;
  const dist = 15.2 + Math.sin(t * 0.09) * 0.8;
  const camY = 3.4 + Math.sin(t * 0.17) * 0.5;
  app.camera?.setPose({ position: [Math.sin(az) * dist, camY, Math.cos(az) * dist], target: [0, 3.0, 0], fov: 45 }, { cut: true });

  window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL + MOTES, time: t };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
