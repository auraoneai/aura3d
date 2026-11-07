import { camera, createAuraApp, effects, environments, instances, lights, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

let seed = 9137;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + rand() * (b - a);

const CY = 3.1; // portal centre height
const RING_R = 2.2;
const PLATFORM_TOP = 0.6;

// ---- stone ring made of blocks ----
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const runes: AuraTransformSpec[] = [];
const SEG = 18;
for (let i = 0; i < SEG; i += 1) {
  const a = (i / SEG) * Math.PI * 2 + 0.1;
  const jitter = range(-0.04, 0.04);
  const r = RING_R + jitter;
  const x = Math.cos(a) * r, y = CY + Math.sin(a) * r;
  const len = ((Math.PI * 2 * RING_R) / SEG) * 1.06;
  ringBlocks.push({
    position: [x, y, range(-0.04, 0.04)],
    rotation: [0, 0, a - Math.PI / 2 + range(-0.03, 0.03)],
    scale: [len, 0.55 + range(-0.04, 0.06), 0.8 + range(-0.05, 0.08)]
  });
  ringColors.push(`hsl(${255 + Math.floor(rand() * 25)}, ${8 + Math.floor(rand() * 10)}%, ${30 + Math.floor(rand() * 18)}%)`);
  if (i % 2 === 0) {
    const rr = RING_R;
    runes.push({
      position: [Math.cos(a) * rr, CY + Math.sin(a) * rr, 0.42],
      rotation: [0, 0, a - Math.PI / 2],
      scale: [0.22, 0.09, 0.04]
    });
  }
}

// ---- pillars and rubble ----
type Pillar = { a: number; r: number; h: number; base: number; w: number };
const pillarDefs: Pillar[] = [
  { a: 0.55, r: 4.4, h: 4.6, base: PLATFORM_TOP, w: 0.9 },
  { a: 2.55, r: 4.5, h: 3.1, base: PLATFORM_TOP, w: 0.9 },
  { a: 3.75, r: 4.3, h: 5.2, base: PLATFORM_TOP, w: 0.95 },
  { a: 5.5, r: 4.6, h: 2.0, base: PLATFORM_TOP, w: 0.9 },
  { a: 1.5, r: 8.2, h: 4.0, base: 0, w: 1.0 },
  { a: 4.6, r: 8.8, h: 6.0, base: 0, w: 1.0 },
  { a: 6.0, r: 9.5, h: 2.6, base: 0, w: 1.0 },
  { a: 2.9, r: 9.8, h: 3.4, base: 0, w: 1.0 }
];
const pillarT: AuraTransformSpec[] = [];
const pillarC: string[] = [];
const capT: AuraTransformSpec[] = [];
const capC: string[] = [];
const rubbleT: AuraTransformSpec[] = [];
const rubbleC: string[] = [];
for (const p of pillarDefs) {
  const x = Math.cos(p.a) * p.r, z = Math.sin(p.a) * p.r;
  pillarT.push({ position: [x, p.base + p.h / 2, z], scale: [p.w, p.h, p.w] });
  pillarC.push(`hsl(${250 + Math.floor(rand() * 25)}, 9%, ${34 + Math.floor(rand() * 12)}%)`);
  capT.push({ position: [x, p.base + p.h + 0.12, z], rotation: [range(-0.1, 0.1), rand() * 3, range(-0.12, 0.12)], scale: [p.w * 1.25, 0.28, p.w * 1.25] });
  capC.push(`hsl(260, 8%, ${40 + Math.floor(rand() * 10)}%)`);
  capT.push({ position: [x, p.base + 0.15, z], scale: [p.w * 1.35, 0.3, p.w * 1.35] });
  capC.push(`hsl(260, 8%, 36%)`);
}
for (let i = 0; i < 40; i += 1) {
  const a = rand() * Math.PI * 2, r = range(3.2, 12);
  const s = range(0.25, 0.9);
  const onPlat = r < 5.3;
  const onStep = !onPlat && r < 6.4;
  const base = onPlat ? PLATFORM_TOP : onStep ? 0.4 : 0;
  rubbleT.push({
    position: [Math.cos(a) * r, base + s * 0.3, Math.sin(a) * r],
    rotation: [range(-0.4, 0.4), rand() * 6, range(-0.4, 0.4)],
    scale: [s * range(0.8, 1.6), s * 0.6, s * range(0.8, 1.4)]
  });
  rubbleC.push(`hsl(${250 + Math.floor(rand() * 30)}, ${6 + Math.floor(rand() * 8)}%, ${24 + Math.floor(rand() * 20)}%)`);
}
// fallen column
rubbleT.push({ position: [-3.2, 0.95, 3.4], rotation: [0, 0.6, Math.PI / 2], scale: [0.8, 3.2, 0.8] });
rubbleC.push("hsl(260, 8%, 40%)");

// ---- particles (instanced emissive spheres, simulated on the CPU) ----
type Spiral = { th: number; u: number; life: number; side: number; size: number; spin: number; zr: number };
type Mote = { x: number; z: number; y: number; u: number; life: number; size: number; vy: number; ph: number; sway: number };
const SPIRAL_N = 130;
const MOTE_N = 70;
const R0 = 5.2;
const newSpiral = (u: number): Spiral => ({
  th: rand() * Math.PI * 2, u, life: range(3.5, 6.5), side: rand() < 0.5 ? -1 : 1,
  size: range(0.06, 0.14), spin: range(0.9, 1.4), zr: range(0.4, 1.4)
});
const newMote = (u: number): Mote => ({
  x: range(-1, 1) * 4, z: range(-1, 1) * 4, y: PLATFORM_TOP + 0.05, u, life: range(4, 8),
  size: range(0.04, 0.09), vy: range(0.35, 0.8), ph: rand() * 6.28, sway: range(0.15, 0.5)
});
const cyanSp: Spiral[] = Array.from({ length: SPIRAL_N }, () => newSpiral(rand()));
const violSp: Spiral[] = Array.from({ length: SPIRAL_N }, () => newSpiral(rand()));
const motes: Mote[] = Array.from({ length: MOTE_N }, () => newMote(rand()));

const spiralTransforms = (list: Spiral[], dt: number): AuraTransformSpec[] =>
  list.map((p) => {
    p.u += dt / p.life;
    if (p.u >= 1) Object.assign(p, newSpiral(0));
    const k = 1 - p.u; // 1 at start, 0 at portal
    const r = 0.15 + R0 * k * k;
    p.th += dt * p.spin * (1.2 + 3.2 * (1 - k));
    const x = Math.cos(p.th) * r;
    const y = CY + Math.sin(p.th) * r * 0.95;
    const z = p.side * p.zr * k * k * 1.6;
    const fade = Math.min(1, p.u * 6) * Math.min(1, (1 - p.u) * 5);
    const s = p.size * (0.15 + fade);
    return { position: [x, y, z], scale: [s, s, s] };
  });

const moteTransforms = (list: Mote[], dt: number, t: number): AuraTransformSpec[] =>
  list.map((p) => {
    p.u += dt / p.life;
    if (p.u >= 1) Object.assign(p, newMote(0));
    const y = PLATFORM_TOP + 0.05 + p.u * p.life * p.vy;
    const x = p.x + Math.sin(t * 0.7 + p.ph) * p.sway * p.u * 3;
    const z = p.z + Math.cos(t * 0.6 + p.ph) * p.sway * p.u * 3;
    const fade = Math.min(1, p.u * 8) * (1 - p.u);
    const s = p.size * fade * 1.2;
    return { position: [x, y, z], scale: [s, s, s] };
  });

// ---- vortex shader ----
const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vUv; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x);
  float lr = log(r + 0.08);
  float swirl = a * 3.0 - lr * 5.0 + clk * 1.8;
  float arms = sin(swirl) * 0.5 + 0.5;
  float arms2 = sin(a * 5.0 + lr * 8.0 - clk * 2.6 + 1.5) * 0.5 + 0.5;
  float n = vnoise(vec2(a * 2.0 + clk * 0.4, lr * 4.0 - clk * 1.2) * 1.6);
  float m = clamp(arms * 0.65 + arms2 * 0.25 + n * 0.35, 0.0, 1.0);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 violet = vec3(0.50, 0.12, 1.0);
  vec3 col = mix(violet, cyan, smoothstep(0.2, 0.85, m));
  col *= 0.55 + 1.1 * m;
  float core = exp(-r * r * 14.0);
  float halo = exp(-r * r * 3.5);
  col += vec3(0.75, 0.95, 1.0) * core * 3.2 + cyan * halo * 0.5;
  float rim = smoothstep(0.78, 0.98, r);
  col += mix(cyan, vec3(0.8, 0.5, 1.0), 0.4) * rim * (0.9 + 0.5 * sin(clk * 2.0 + a * 4.0));
  col *= 0.92 + 0.08 * sin(clk * 1.3);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false
});

const stone = material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0.02 });
const darkStone = material.pbr({ color: "#4a4658", roughness: 0.95 });
const runeMat = material.emissive({ color: "#46e6ff", emissive: "#46e6ff", emissiveIntensity: 4 });
const cyanOrb = material.emissive({ color: "#5fe8ff", emissive: "#5fe8ff", emissiveIntensity: 5 });
const violetOrb = material.emissive({ color: "#a860ff", emissive: "#a860ff", emissiveIntensity: 5 });
const moteMat = material.emissive({ color: "#bff6ff", emissive: "#bff6ff", emissiveIntensity: 4 });

const sc = scene({ background: "#0c0818" })
  .camera(camera.orbit({ position: [0, 3.6, 12.5], target: [0, 2.6, 0], fov: 42, near: 0.5, far: 120, autoRotate: 0.07 }))
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(lights.hemisphere({ skyColor: "#5a4a9a", groundColor: "#1a1226", intensity: 0.5 }))
  .add(lights.directional({ name: "dusk", position: [-14, 5, -10], target: [0, 1, 0], intensity: 0.9, color: "#ff8a62", shadow: true }))
  .add(lights.point({ name: "glowCyan", position: [0, CY, 2.6], intensity: 70, color: "#3fd8ff", distance: 18, decay: 2, shadow: false }).runtime({ id: "glowCyan", mutable: true }))
  .add(lights.point({ name: "glowViolet", position: [0, CY, -2.6], intensity: 60, color: "#9050ff", distance: 18, decay: 2, shadow: false }).runtime({ id: "glowViolet", mutable: true }))
  .add(lights.point({ name: "glowLow", position: [0, 1.4, 1.8], intensity: 30, color: "#7a6aff", distance: 12, decay: 2, shadow: false }).runtime({ id: "glowLow", mutable: true }))
  .add(effects.fog({ color: "#241a40", density: 0.032 }))
  .add(effects.bloom({ intensity: 1.0, threshold: 0.65, radius: 0.75 }))
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1d1a2a", roughness: 1 }) }))
  .add(primitives.cylinder({ name: "step", size: [13, 0.4, 13], material: darkStone, params: { radialSegments: 40 } }).position(0, 0.2, 0))
  .add(primitives.cylinder({ name: "platform", size: [10.6, 0.6, 10.6], material: material.pbr({ color: "#5d586d", roughness: 0.9 }), params: { radialSegments: 40 } }).position(0, 0.3, 0))
  .add(primitives.box({ name: "ringBase", size: [3.2, 0.5, 1.3], material: darkStone }).position(0, PLATFORM_TOP + 0.2, 0))
  .add(instances.box({ name: "ring", transforms: ringBlocks, colors: ringColors, material: stone }))
  .add(instances.box({ name: "runes", transforms: runes, material: runeMat }))
  .add(primitives.plane({ name: "vortex", size: [4.3, 1, 4.3], material: vortex, castShadow: false }).position(0, CY, 0).rotate(Math.PI / 2, 0, 0).runtime({ id: "vortex", mutable: true }))
  .add(instances.cylinder({ name: "pillars", transforms: pillarT, colors: pillarC, material: stone, params: { radialSegments: 10 } }))
  .add(instances.box({ name: "caps", transforms: capT, colors: capC, material: stone }))
  .add(instances.box({ name: "rubble", transforms: rubbleT, colors: rubbleC, material: stone }))
  .add(instances.sphere({ name: "spCyan", transforms: spiralTransforms(cyanSp, 0), material: cyanOrb, castShadow: false }).runtime({ id: "spCyan", mutable: true }))
  .add(instances.sphere({ name: "spViolet", transforms: spiralTransforms(violSp, 0), material: violetOrb, castShadow: false }).runtime({ id: "spViolet", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: moteTransforms(motes, 0, 0), material: moteMat, castShadow: false }).runtime({ id: "motes", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  t += dt;
  app.nodes.require("vortex").setUniform?.("clk", t);
  const pulse = 1 + 0.28 * Math.sin(t * 1.1);
  const pulse2 = 1 + 0.25 * Math.sin(t * 1.1 + 1.7);
  app.nodes.require("glowCyan").setLight?.({ intensity: 70 * pulse });
  app.nodes.require("glowViolet").setLight?.({ intensity: 60 * pulse2 });
  app.nodes.require("glowLow").setLight?.({ intensity: 30 * (1 + 0.35 * Math.sin(t * 1.1 + 0.6)) });
  app.nodes.require("spCyan").setInstances?.(spiralTransforms(cyanSp, dt));
  app.nodes.require("spViolet").setInstances?.(spiralTransforms(violSp, dt));
  app.nodes.require("motes").setInstances?.(moteTransforms(motes, dt, t));
  window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL_N * 2 + MOTE_N, time: t };
});
await app.ready();
window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL_N * 2 + MOTE_N, time: t };
window.__EVAL_READY__ = true;
