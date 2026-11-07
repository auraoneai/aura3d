import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

// ---------- helpers ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const TAU = Math.PI * 2;

// ---------- layout ----------
const CY = 3.45; // portal centre height
const RING_R = 2.6; // ring centre-line radius
const DISC_R = 2.3; // energy disc radius
const PLATFORM_TOP = 0.75;

// ---------- portal ring (stone blocks + runes) ----------
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runes: AuraTransformSpec[] = [];
const SEG = 20;
for (let i = 0; i < SEG; i += 1) {
  const a = (i / SEG) * TAU + 0.1;
  const jitter = (rand() - 0.5) * 0.05;
  ringBlocks.push({
    position: [Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, 0],
    rotation: [0, 0, a + jitter],
    scale: [0.72 + rand() * 0.06, 0.95, 0.8 + rand() * 0.12]
  });
  ringColors.push(`hsl(${250 + Math.floor(rand() * 30)}, ${6 + Math.floor(rand() * 8)}%, ${24 + Math.floor(rand() * 16)}%)`);
  if (i % 2 === 0) {
    runes.push({
      position: [Math.cos(a) * (RING_R + 0.02), CY + Math.sin(a) * (RING_R + 0.02), 0.42],
      rotation: [0, 0, a],
      scale: [0.34, 0.07, 0.04]
    });
    runes.push({
      position: [Math.cos(a) * (RING_R + 0.02), CY + Math.sin(a) * (RING_R + 0.02), -0.42],
      rotation: [0, 0, a],
      scale: [0.34, 0.07, 0.04]
    });
  }
}
// base blocks that hold the ring
const ringBase: AuraTransformSpec[] = [
  { position: [-1.7, PLATFORM_TOP + 0.3, 0], scale: [1.8, 0.6, 1.3] },
  { position: [1.7, PLATFORM_TOP + 0.3, 0], scale: [1.8, 0.6, 1.3] },
  { position: [0, PLATFORM_TOP + 0.15, 0.7], scale: [5.2, 0.3, 0.8] }
];

// ---------- platform ----------
const platformTiers: AuraTransformSpec[] = [
  { position: [0, 0.25, 0], scale: [14, 0.5, 14] },
  { position: [0, 0.6, 0], scale: [10.8, 0.3, 10.8] }
];
const platformRunes: AuraTransformSpec[] = [];
for (let i = 0; i < 36; i += 1) {
  const a = (i / 36) * TAU;
  platformRunes.push({
    position: [Math.cos(a) * 4.0, PLATFORM_TOP + 0.01, Math.sin(a) * 4.0],
    rotation: [0, -(a + Math.PI / 2), 0],
    scale: [i % 3 === 0 ? 0.1 : 0.42, 0.02, 0.07]
  });
}
for (let i = 0; i < 16; i += 1) {
  const a = (i / 16) * TAU + 0.2;
  platformRunes.push({
    position: [Math.cos(a) * 4.6, PLATFORM_TOP + 0.01, Math.sin(a) * 4.6],
    rotation: [0, -a, 0],
    scale: [0.5, 0.02, 0.05]
  });
}

// ---------- ruined pillars ----------
const shafts: AuraTransformSpec[] = [];
const shaftColors: string[] = [];
const blocks: AuraTransformSpec[] = [];
const blockColors: string[] = [];
const stoneCol = (): string => `hsl(${245 + Math.floor(rand() * 40)}, ${5 + Math.floor(rand() * 10)}%, ${20 + Math.floor(rand() * 18)}%)`;
const pillarSpec: Array<[number, number, number, boolean]> = [
  [0.5, 8.8, 6.2, true],
  [1.35, 9.6, 4.0, false],
  [2.2, 8.2, 2.0, false],
  [3.1, 10.2, 5.4, true],
  [4.0, 8.6, 3.0, false],
  [4.9, 9.4, 1.4, false],
  [5.7, 8.0, 4.6, true]
];
for (const [a, r, h, capped] of pillarSpec) {
  const x = Math.cos(a) * r, z = Math.sin(a) * r;
  blocks.push({ position: [x, 0.25, z], scale: [1.7, 0.5, 1.7] });
  blockColors.push(stoneCol());
  shafts.push({ position: [x, 0.5 + h / 2, z], rotation: [0, rand(), 0], scale: [1.1, h, 1.1] });
  shaftColors.push(stoneCol());
  if (capped) {
    blocks.push({ position: [x, 0.5 + h + 0.2, z], scale: [1.6, 0.4, 1.6] });
    blockColors.push(stoneCol());
  } else {
    blocks.push({ position: [x + 0.15, 0.5 + h + 0.15, z - 0.1], rotation: [0.3, rand() * 3, 0.35], scale: [0.7, 0.4, 0.55] });
    blockColors.push(stoneCol());
  }
}
// fallen drums
for (const [x, z, ry] of [[-3.5, 7.2, 0.6], [6.5, 3.2, 2.2], [-7.5, -3.5, 1.1]] as Array<[number, number, number]>) {
  shafts.push({ position: [x, 0.5, z], rotation: [Math.PI / 2, ry, 0], scale: [1.0, 2.2, 1.0] });
  shaftColors.push(stoneCol());
}
// rubble
for (let i = 0; i < 60; i += 1) {
  const a = rand() * TAU, r = i < 14 ? range(4.2, 6.4) : range(6.5, 15);
  const s = range(0.15, 0.6), onPlat = r < 6.4;
  blocks.push({
    position: [Math.cos(a) * r, (onPlat ? PLATFORM_TOP : 0) + s * 0.3, Math.sin(a) * r],
    rotation: [rand() * 0.6, rand() * TAU, rand() * 0.6],
    scale: [s * range(0.8, 1.6), s * 0.7, s * range(0.8, 1.4)]
  });
  blockColors.push(stoneCol());
}

// ---------- particles ----------
interface Spiral { rho0: number; theta0: number; z0: number; life: number; age: number; spin: number; size: number; }
const SPIRAL_PER_COLOR = 130;
const MOTE_POOL = 90;
const newSpiral = (initial: boolean): Spiral => ({
  rho0: range(2.6, 6.2),
  theta0: rand() * TAU,
  z0: range(-3.2, 3.8),
  life: range(3.2, 5.4),
  age: initial ? 0 : 0,
  spin: range(0.9, 1.5) * (rand() < 0.12 ? -1 : 1),
  size: range(0.07, 0.15)
});
const spiralsA: Spiral[] = Array.from({ length: SPIRAL_PER_COLOR }, () => { const s = newSpiral(true); s.age = rand() * s.life; return s; });
const spiralsB: Spiral[] = Array.from({ length: SPIRAL_PER_COLOR }, () => { const s = newSpiral(true); s.age = rand() * s.life; return s; });

interface Mote { x: number; y: number; z: number; vy: number; ph: number; life: number; age: number; size: number; alive: boolean; }
const motes: Mote[] = Array.from({ length: MOTE_POOL }, () => ({ x: 0, y: 0, z: 0, vy: 0, ph: 0, life: 1, age: 0, size: 0.06, alive: false, }));
let moteTimer = 0;
const spawnMote = (m: Mote, prewarm: boolean): void => {
  const a = rand() * TAU, r = 4.8 * Math.sqrt(rand());
  m.x = Math.cos(a) * r; m.z = Math.sin(a) * r; m.y = PLATFORM_TOP + 0.05;
  m.vy = range(0.45, 1.0); m.ph = rand() * TAU; m.life = range(3.5, 6.5); m.age = prewarm ? rand() * m.life : 0;
  m.size = range(0.04, 0.09); m.alive = true;
  if (prewarm) m.y += m.vy * m.age;
};
for (let i = 0; i < 50; i += 1) spawnMote(motes[i]!, true);

const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.0001, 0.0001, 0.0001] };
const spiralTransform = (s: Spiral, t: number): AuraTransformSpec => {
  const u = s.age / s.life; // 0..1
  const ease = u * u * (0.4 + 0.6 * u); // accelerates into the portal
  const rho = s.rho0 * (1 - ease) + 0.05;
  const theta = s.theta0 + s.spin * (u * 5.5 + 2.2 * u * u * u * 3.0) + t * 0.15;
  const z = s.z0 * (1 - u) * (1 - u);
  const fade = Math.min(1, u * 6) * Math.min(1, (1 - u) * 4);
  const sc = s.size * (0.25 + 0.75 * fade) * (0.6 + 0.8 * (1 - u));
  return { position: [Math.cos(theta) * rho, CY + Math.sin(theta) * rho, z], scale: [sc, sc, sc] };
};

// ---------- materials ----------
const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xz * 2.0;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { v += a * vnoise(p); p = p * 2.03 + 7.1; a *= 0.5; } return v; }
void main() {
  float r = length(vP);
  float a = atan(vP.y, vP.x);
  float tw = clk * 0.35 + (1.0 - r) * 2.5;
  vec2 q = mat2(cos(tw), -sin(tw), sin(tw), cos(tw)) * vP;
  float n = fbm(q * 3.2 + vec2(clk * 0.25, -clk * 0.18));
  float s = 3.0 * a - 5.5 * log(r + 0.05) + clk * 1.9;
  float arm = 0.5 + 0.5 * sin(s + n * 2.6);
  float s2 = 5.0 * a - 9.0 * log(r + 0.05) + clk * 2.7;
  float fine = 0.5 + 0.5 * sin(s2 + n * 4.0);
  arm = clamp(arm * 0.75 + fine * 0.25, 0.0, 1.0);
  vec3 cyan = vec3(0.08, 0.85, 1.0);
  vec3 violet = vec3(0.55, 0.16, 1.0);
  vec3 deep = vec3(0.07, 0.02, 0.28);
  vec3 col = mix(deep, mix(violet, cyan, smoothstep(0.25, 0.85, arm + (n - 0.5) * 0.5)), smoothstep(0.05, 0.75, arm));
  col *= 0.9 + 1.3 * arm;
  float ripple = 0.5 + 0.5 * sin(r * 28.0 - clk * 4.0);
  col += cyan * ripple * exp(-r * 5.0) * 0.6;
  float core = exp(-r * r * 22.0);
  col += vec3(0.85, 0.97, 1.0) * core * (3.2 + 1.2 * pls);
  col += vec3(0.4, 0.9, 1.0) * smoothstep(0.78, 1.0, r) * (1.3 + 0.6 * pls) * (0.6 + 0.8 * arm);
  col *= 0.85 + 0.3 * pls;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pls: { type: "f32", value: 0.5 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const halo = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xz * 2.0;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
void main() {
  float d = length(vP) * 6.0;
  float inner = smoothstep(2.3, 2.5, d);
  float a = exp(-(d - 2.3) * 0.75) * inner * smoothstep(6.0, 3.5, d) * (0.55 + 0.35 * pls);
  vec3 c = mix(vec3(0.1, 0.65, 1.0), vec3(0.5, 0.2, 1.0), smoothstep(2.5, 5.5, d));
  outColor = vec4(c * 1.4, a);
}`
  },
  uniforms: { pls: { type: "f32", value: 0.5 } },
  transparent: true,
  blending: "additive",
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const stone = material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0.02 });
const cyanGlow = material.emissive({ color: "#6ff0ff", emissive: "#27d8ff", emissiveIntensity: 3.2 });
const violetGlow = material.emissive({ color: "#b58cff", emissive: "#8a4dff", emissiveIntensity: 3.2 });
const moteGlow = material.emissive({ color: "#d8fbff", emissive: "#a8ecff", emissiveIntensity: 3.0 });
const runeGlow = material.emissive({ color: "#6ff0ff", emissive: "#27d8ff", emissiveIntensity: 2.4 });
const platRuneGlow = material.emissive({ color: "#b58cff", emissive: "#7a45ff", emissiveIntensity: 1.8 });

// ---------- scene ----------
const stage = scene({ background: "#1a1230" })
  .camera(camera.orbit({ position: [1.5, 4.6, 15.5], target: [0, 3.0, 0], fov: 42, near: 0.5, far: 120, autoRotate: 0.08 }))
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.hemisphere({ skyColor: "#5a4a9a", groundColor: "#1c1020", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk-sun", position: [-14, 5, -9], target: [0, 1, 0], intensity: 1.5, color: "#ff8a5a", shadow: true }))
  .add(lights.directional({ name: "dusk-fill", position: [12, 9, 10], target: [0, 2, 0], intensity: 0.5, color: "#6a7cff" }))
  .add(lights.point({ name: "portal-front", position: [0, CY, 2.2], intensity: 60, color: "#2fd8ff", distance: 22, decay: 2, shadow: false }).runtime({ id: "portal-front", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, CY, -2.2], intensity: 60, color: "#8a4dff", distance: 22, decay: 2, shadow: false }).runtime({ id: "portal-back", mutable: true }))
  .add(lights.point({ name: "portal-low", position: [0, PLATFORM_TOP + 1.0, 0], intensity: 36, color: "#6a5cff", distance: 14, decay: 2, shadow: false }).runtime({ id: "portal-low", mutable: true }))
  .add(effects.fog({ color: "#241a40", density: 0.03 }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.6, radius: 0.75 }))
  .add(effects.vignette({ intensity: 0.5, smoothness: 2, roundness: 1 }))
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1d1a28", roughness: 0.96 }) }))
  .add(instances.cylinder({ name: "platform", transforms: platformTiers, colors: ["#5b5870", "#6a6784"], material: stone, params: { radialSegments: 48 } }))
  .add(instances.box({ name: "ring-base", transforms: ringBase, colors: ["#4a4760", "#4a4760", "#55526b"], material: stone }))
  .add(instances.box({ name: "ring", transforms: ringBlocks, colors: ringColors, material: stone }))
  .add(instances.box({ name: "ring-runes", transforms: runes, material: runeGlow }))
  .add(instances.box({ name: "platform-runes", transforms: platformRunes, material: platRuneGlow }))
  .add(instances.cylinder({ name: "pillar-shafts", transforms: shafts, colors: shaftColors, material: stone, params: { radialSegments: 10 } }))
  .add(instances.box({ name: "pillar-blocks", transforms: blocks, colors: blockColors, material: stone }))
  .add(primitives.cylinder({ name: "halo", size: [12, 0.02, 12], material: halo, castShadow: false, params: { radialSegments: 64 } }).position(0, CY, 0).rotate(Math.PI / 2, 0, 0).runtime({ id: "halo", mutable: true }))
  .add(primitives.cylinder({ name: "vortex", size: [DISC_R * 2, 0.06, DISC_R * 2], material: vortex, castShadow: false, params: { radialSegments: 64 } }).position(0, CY, 0).rotate(Math.PI / 2, 0, 0).runtime({ id: "vortex", mutable: true }))
  .add(instances.sphere({ name: "spark-cyan", transforms: spiralsA.map(() => HIDDEN), material: cyanGlow, castShadow: false }).runtime({ id: "spark-cyan", mutable: true }))
  .add(instances.sphere({ name: "spark-violet", transforms: spiralsB.map(() => HIDDEN), material: violetGlow, castShadow: false }).runtime({ id: "spark-violet", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: motes.map(() => HIDDEN), material: moteGlow, castShadow: false }).runtime({ id: "motes", mutable: true }));

const app = createAuraApp("#app", { scene: stage });

let t = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  t += dt;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1); // slow pulse, ~5.7 s period
  const flick = 0.04 * Math.sin(t * 7.3) + 0.03 * Math.sin(t * 11.9);

  // shader + light pulse
  const vx = app.nodes.require("vortex");
  vx.setUniform?.("clk", t);
  vx.setUniform?.("pls", pulse);
  app.nodes.require("halo").setUniform?.("pls", pulse);
  const k = 0.7 + 0.6 * pulse + flick;
  app.nodes.require("portal-front").setLight?.({ intensity: 60 * k });
  app.nodes.require("portal-back").setLight?.({ intensity: 60 * k });
  app.nodes.require("portal-low").setLight?.({ intensity: 36 * (0.75 + 0.5 * pulse) });

  // spiral particles
  let live = 0;
  const stepSpirals = (list: Spiral[], id: string): void => {
    const out: AuraTransformSpec[] = new Array<AuraTransformSpec>(list.length);
    for (let i = 0; i < list.length; i += 1) {
      const s = list[i]!;
      s.age += dt;
      if (s.age >= s.life) {
        const n = newSpiral(false);
        s.rho0 = n.rho0; s.theta0 = n.theta0; s.z0 = n.z0; s.life = n.life; s.age = 0; s.spin = n.spin; s.size = n.size;
      }
      out[i] = spiralTransform(s, t);
      live += 1;
    }
    app.nodes.require(id).setInstances?.(out);
  };
  stepSpirals(spiralsA, "spark-cyan");
  stepSpirals(spiralsB, "spark-violet");

  // rising motes
  moteTimer += dt * 14;
  while (moteTimer >= 1) {
    moteTimer -= 1;
    const free = motes.find((m) => !m.alive);
    if (free) spawnMote(free, false);
  }
  const moteOut: AuraTransformSpec[] = new Array<AuraTransformSpec>(motes.length);
  for (let i = 0; i < motes.length; i += 1) {
    const m = motes[i]!;
    if (m.alive) {
      m.age += dt;
      if (m.age >= m.life) m.alive = false;
    }
    if (!m.alive) { moteOut[i] = HIDDEN; continue; }
    const u = m.age / m.life;
    const fade = Math.min(1, u * 8) * (1 - u) * (1 - u);
    const y = m.y + m.vy * m.age;
    const sc = m.size * (0.15 + 0.85 * Math.min(1, fade * 2.2));
    moteOut[i] = {
      position: [m.x + Math.sin(t * 0.9 + m.ph) * 1.0 * u, y, m.z + Math.cos(t * 0.8 + m.ph) * 1.0 * u],
      scale: [sc, sc, sc]
    };
    live += 1;
  }
  app.nodes.require("motes").setInstances?.(moteOut);

  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
});

await app.ready();
window.__EVAL_READY__ = true;
