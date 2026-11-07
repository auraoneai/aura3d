import { camera, createAuraApp, effects, geometry, instances, lights, material, primitives, scene, sky, type AuraTransformSpec } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

type V3 = [number, number, number];

// ---------- deterministic random ----------
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + rand() * (b - a);

// ---------- layout constants ----------
const CY = 3.1; // portal centre height
const RING_R = 2.5; // ring mid radius
const DISC_R = 2.3;
const TAU = Math.PI * 2;

// ---------- portal disc geometry (XY plane, facing +Z, double sided) ----------
const RINGS = 28;
const SEGS = 72;
const dPos: number[] = [0, 0, 0];
const dNor: number[] = [0, 0, 1];
const dIdx: number[] = [];
for (let j = 1; j <= RINGS; j += 1) {
  for (let i = 0; i < SEGS; i += 1) {
    const a = (i / SEGS) * TAU;
    const r = (j / RINGS) * DISC_R;
    dPos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
    dNor.push(0, 0, 1);
  }
}
const vid = (j: number, i: number): number => (j === 0 ? 0 : 1 + (j - 1) * SEGS + (i % SEGS));
for (let j = 0; j < RINGS; j += 1) {
  for (let i = 0; i < SEGS; i += 1) {
    if (j === 0) {
      dIdx.push(0, vid(1, i), vid(1, i + 1));
    } else {
      dIdx.push(vid(j, i), vid(j + 1, i), vid(j, i + 1), vid(j, i + 1), vid(j + 1, i), vid(j + 1, i + 1));
    }
  }
}

const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xy;
  float r = length(position.xy) / ${DISC_R.toFixed(2)};
  float z = -0.3 * exp(-r * 3.0) + 0.04 * sin(r * 14.0 - clk * 2.0) * r;
  gl_Position = modelViewProjectionMatrix * vec4(position.xy, z, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  float r = length(vP) / ${DISC_R.toFixed(2)};
  float a = atan(vP.y, vP.x);
  float sw = a + 1.3 / (r + 0.18) - clk * 1.1;
  vec2 q = r * vec2(cos(sw), sin(sw));
  float n = vnoise(q * 3.5 + vec2(clk * 0.25, -clk * 0.2));
  float n2 = vnoise(q * 7.0 - vec2(clk * 0.4, clk * 0.1));
  float arms = 0.5 + 0.5 * sin(sw * 3.0 + n * 3.5);
  float fine = 0.5 + 0.5 * sin(sw * 7.0 - clk * 0.6 + n2 * 4.0);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 violet = vec3(0.5, 0.12, 1.0);
  vec3 col = mix(violet, cyan, smoothstep(0.2, 0.8, arms));
  col *= 0.45 + 0.9 * fine * (0.5 + 0.5 * n);
  col += cyan * 0.25 * n2;
  float core = exp(-r * 6.5);
  col += vec3(1.0, 0.92, 1.0) * core * 3.0;
  float rim = smoothstep(0.78, 1.0, r);
  col += mix(cyan, vec3(0.8, 0.5, 1.0), 0.4 + 0.4 * sin(sw * 2.0)) * rim * 1.6;
  col *= mix(1.0, 0.7, r);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------- stone ring (blocks) + runes ----------
const BLOCKS = 28;
const blocks: AuraTransformSpec[] = [];
const blockColors: string[] = [];
const runes: AuraTransformSpec[] = [];
for (let i = 0; i < BLOCKS; i += 1) {
  const a = (i / BLOCKS) * TAU;
  const jitter = range(-0.04, 0.04);
  const r = RING_R + jitter;
  blocks.push({
    position: [Math.cos(a) * r, CY + Math.sin(a) * r, range(-0.03, 0.03)],
    rotation: [0, 0, a + range(-0.02, 0.02)],
    scale: [range(0.46, 0.56), 0.62, range(0.66, 0.76)]
  });
  blockColors.push(`hsl(${24 + Math.floor(rand() * 18)}, ${6 + Math.floor(rand() * 8)}%, ${30 + Math.floor(rand() * 16)}%)`);
  if (i % 2 === 0) {
    for (const zs of [-1, 1]) {
      runes.push({
        position: [Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, zs * 0.37],
        rotation: [0, 0, a],
        scale: [0.1, 0.3, 0.04]
      });
    }
  }
}

// ---------- platform runes ----------
const floorRunes: AuraTransformSpec[] = [];
for (let i = 0; i < 24; i += 1) {
  const a = (i / 24) * TAU;
  const big = i % 2 === 0;
  floorRunes.push({
    position: [Math.cos(a) * 3.7, 0.62, Math.sin(a) * 3.7],
    rotation: [0, -a, 0],
    scale: [big ? 0.34 : 0.14, 0.02, big ? 0.34 : 0.5]
  });
}

// ---------- rubble ----------
const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 70; i += 1) {
  const a = rand() * TAU;
  const r = range(5.6, 14);
  const s = range(0.2, 0.7);
  rubble.push({
    position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r - 1],
    rotation: [range(-0.4, 0.4), rand() * TAU, range(-0.4, 0.4)],
    scale: [s * range(0.8, 1.6), s * 0.7, s * range(0.8, 1.4)]
  });
  rubbleColors.push(`hsl(${240 + Math.floor(rand() * 30)}, 8%, ${22 + Math.floor(rand() * 18)}%)`);
}

// ---------- materials ----------
const stone = material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0.02 });
const darkStone = material.pbr({ color: "#4a4650", roughness: 0.96 });
const pillarStone = material.pbr({ color: "#5d5862", roughness: 0.93 });
const glowCyan = material.emissive({ color: "#0b3a44", emissive: "#2fe8ff", emissiveIntensity: 2.4 });
const glowViolet = material.emissive({ color: "#2a0e55", emissive: "#9a5cff", emissiveIntensity: 2.2 });
const glowMote = material.emissive({ color: "#bff6ff", emissive: "#cffaff", emissiveIntensity: 2.6 });

// ---------- pillars ----------
type Pillar = { x: number; z: number; h: number; d: number; tilt?: [number, number]; cap?: boolean };
const pillars: Pillar[] = [
  { x: -7.2, z: -0.5, h: 6.2, d: 1.1, cap: true },
  { x: 7.6, z: -2, h: 7, d: 1.2, cap: true },
  { x: -5.6, z: -6.5, h: 4.4, d: 1.1 },
  { x: 4.8, z: -7, h: 2.3, d: 1.1 },
  { x: -8.4, z: 4.2, h: 1.5, d: 1.0 },
  { x: 8, z: 4.8, h: 5.2, d: 1.1, cap: true },
  { x: 0.5, z: -10.5, h: 5.6, d: 1.2, cap: true }
];

let sc = scene({ background: "#0a0818" })
  .camera(camera.orbit({ position: [0, 4.6, 15.5], target: [0, 3.0, 0], fov: 45, near: 0.5, far: 220, autoRotate: 0.07 }))
  .add(sky.gradient({ zenith: "#0a0820", horizon: "#6a3468" }))
  .add(lights.hemisphere({ skyColor: "#4b3d86", groundColor: "#1a1220", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk", position: [-22, 8, 14], target: [0, 1, 0], intensity: 1.5, color: "#ff8a5e", shadow: true }))
  .add(lights.point({ name: "glowFront", position: [0, CY, 2.6], intensity: 70, color: "#37e6ff", distance: 22, decay: 2, shadow: false }).runtime({ id: "glowFront", mutable: true }))
  .add(lights.point({ name: "glowBack", position: [0, CY, -2.6], intensity: 70, color: "#9a5cff", distance: 22, decay: 2, shadow: false }).runtime({ id: "glowBack", mutable: true }))
  .add(lights.point({ name: "glowLow", position: [0, 1.4, 0.8], intensity: 28, color: "#6a8cff", distance: 12, decay: 2, shadow: false }).runtime({ id: "glowLow", mutable: true }))
  .add(effects.fog({ color: "#2a1c40", density: 0.022 }))
  .add(effects.bloom({ intensity: 1.15, threshold: 0.65, radius: 0.75 }))
  .add(primitives.plane({ name: "ground", size: [140, 1, 140], material: material.pbr({ color: "#2b2832", roughness: 1 }) }))
  .add(primitives.cylinder({ name: "stepLow", size: [14, 0.3, 14], material: darkStone, params: { radialSegments: 40 } }).position(0, 0.15, 0))
  .add(primitives.cylinder({ name: "platform", size: [10, 0.6, 10], material: darkStone, params: { radialSegments: 40 } }).position(0, 0.3, 0))
  .add(primitives.box({ name: "plinthL", size: [0.9, 0.7, 1.1], material: darkStone }).position(-RING_R, 0.5, 0))
  .add(primitives.box({ name: "plinthR", size: [0.9, 0.7, 1.1], material: darkStone }).position(RING_R, 0.5, 0))
  .add(instances.box({ name: "ringBlocks", transforms: blocks, colors: blockColors, material: stone }))
  .add(instances.box({ name: "runes", transforms: runes, material: glowCyan, castShadow: false }))
  .add(instances.box({ name: "floorRunes", transforms: floorRunes, material: glowViolet, castShadow: false }))
  .add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone }));

for (const [n, p] of pillars.entries()) {
  sc = sc.add(primitives.cylinder({ name: `pillar${n}`, size: [p.d, p.h, p.d], material: pillarStone, params: { radialSegments: 12 } }).position(p.x, p.h / 2, p.z));
  sc = sc.add(primitives.box({ name: `base${n}`, size: [p.d * 1.45, 0.4, p.d * 1.45], material: darkStone }).position(p.x, 0.2, p.z));
  if (p.cap) {
    sc = sc.add(primitives.box({ name: `cap${n}`, size: [p.d * 1.5, 0.4, p.d * 1.5], material: darkStone }).position(p.x, p.h + 0.2, p.z));
  } else {
    sc = sc.add(primitives.box({ name: `broken${n}`, size: [p.d * 0.7, 0.35, p.d * 0.6], material: darkStone }).position(p.x + 0.2, p.h + 0.1, p.z).rotate(0.25, 0.4, 0.3));
  }
}
// fallen column drums
sc = sc
  .add(primitives.cylinder({ name: "drum0", size: [1.0, 1.6, 1.0], material: pillarStone, params: { radialSegments: 12 } }).position(3.8, 0.5, 6.4).rotate(0, 0.5, Math.PI / 2))
  .add(primitives.cylinder({ name: "drum1", size: [1.1, 1.2, 1.1], material: pillarStone, params: { radialSegments: 12 } }).position(-4.2, 0.55, 7.4).rotate(0, -0.6, Math.PI / 2))
  .add(primitives.cylinder({ name: "drum2", size: [1.1, 1.4, 1.1], material: pillarStone, params: { radialSegments: 12 } }).position(5.6, 0.55, -3.8).rotate(0.1, 0.9, Math.PI / 2));

// ---------- portal disc ----------
sc = sc.add(
  geometry
    .custom(
      geometry.define({
        positions: new Float32Array(dPos),
        normals: new Float32Array(dNor),
        indices: dIdx,
        bounds: { min: [-DISC_R, -DISC_R, -0.5], max: [DISC_R, DISC_R, 0.5] }
      }),
      { name: "portalDisc", material: vortex, castShadow: false }
    )
    .position(0, CY, 0)
    .runtime({ id: "portalDisc", mutable: true })
);

// ---------- particles (own simulation, rendered as instanced glowing spheres) ----------
type Spiral = { a0: number; r0: number; z0: number; spin: number; life: number; age: number; size: number };
const makeSpiral = (age?: number): Spiral => ({
  a0: rand() * TAU,
  r0: range(2.6, 4.6),
  z0: (rand() < 0.5 ? -1 : 1) * range(1.2, 5),
  spin: (rand() < 0.5 ? -1 : 1) * range(4, 7.5),
  life: range(2.6, 4.6),
  age: age ?? 0,
  size: range(0.07, 0.15)
});
const SPIRAL_N = 150;
const spiralsA: Spiral[] = Array.from({ length: SPIRAL_N }, () => makeSpiral());
const spiralsB: Spiral[] = Array.from({ length: SPIRAL_N }, () => makeSpiral());
for (const s of [...spiralsA, ...spiralsB]) s.age = rand() * s.life;

type Mote = { x: number; z: number; speed: number; sway: number; ph: number; life: number; age: number; size: number };
const makeMote = (): Mote => {
  const a = rand() * TAU;
  const r = 4.4 * Math.sqrt(rand());
  return { x: Math.cos(a) * r, z: Math.sin(a) * r, speed: range(0.35, 0.85), sway: range(0.15, 0.5), ph: rand() * TAU, life: range(4, 8), age: 0, size: range(0.04, 0.09) };
};
const MOTE_N = 90;
const motes: Mote[] = Array.from({ length: MOTE_N }, () => makeMote());
for (const m of motes) m.age = rand() * m.life;

const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.0001, 0.0001, 0.0001] };
const initSpiral = (list: Spiral[]): AuraTransformSpec[] => list.map(() => HIDDEN);

sc = sc
  .add(instances.sphere({ name: "spiralA", transforms: initSpiral(spiralsA), material: glowCyan, castShadow: false, params: { widthSegments: 8, heightSegments: 6 } }).runtime({ id: "spiralA", mutable: true }))
  .add(instances.sphere({ name: "spiralB", transforms: initSpiral(spiralsB), material: glowViolet, castShadow: false, params: { widthSegments: 8, heightSegments: 6 } }).runtime({ id: "spiralB", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: motes.map(() => HIDDEN), material: glowMote, castShadow: false, params: { widthSegments: 8, heightSegments: 6 } }).runtime({ id: "motes", mutable: true }));

const stepSpirals = (list: Spiral[], dt: number): { out: AuraTransformSpec[]; live: number } => {
  const out: AuraTransformSpec[] = [];
  let live = 0;
  for (const s of list) {
    s.age += dt;
    if (s.age >= s.life) Object.assign(s, makeSpiral(0));
    const u = s.age / s.life;
    const inv = 1 - u;
    const radius = s.r0 * Math.pow(inv, 1.25) + 0.12;
    const ang = s.a0 + s.spin * u;
    const x = Math.cos(ang) * radius;
    const y = Math.max(0.75, CY + Math.sin(ang) * radius * 0.92);
    const z = s.z0 * Math.pow(inv, 1.6);
    const fade = Math.pow(Math.sin(Math.PI * u), 0.6);
    const sc2 = Math.max(0.0001, s.size * fade * (0.6 + 0.8 * u));
    out.push({ position: [x, y, z], scale: [sc2, sc2, sc2] });
    live += 1;
  }
  return { out, live };
};

const stepMotes = (dt: number, t: number): { out: AuraTransformSpec[]; live: number } => {
  const out: AuraTransformSpec[] = [];
  let live = 0;
  for (const m of motes) {
    m.age += dt;
    if (m.age >= m.life) Object.assign(m, makeMote());
    const u = m.age / m.life;
    const y = 0.7 + m.age * m.speed;
    const fade = Math.sin(Math.PI * Math.min(1, u)) ** 0.7;
    const s = Math.max(0.0001, m.size * fade);
    out.push({ position: [m.x + Math.sin(t * 0.8 + m.ph) * m.sway, y, m.z + Math.cos(t * 0.6 + m.ph) * m.sway], scale: [s, s, s] });
    live += 1;
  }
  return { out, live };
};

// ---------- app ----------
const app = createAuraApp("#app", { scene: sc });

let time = 0;
let particleCount = 0;
const publish = (): void => {
  window.__TASK_STATE__ = { portalActive: true, particleCount, time };
};

app.onFrame((f: { dt: number }) => {
  const dt = Math.min(f.dt, 0.05);
  time += dt;

  app.nodes.require("portalDisc").setUniform?.("clk", time);

  const pulse = 1 + 0.28 * Math.sin(time * 1.1) + 0.08 * Math.sin(time * 2.7 + 1);
  app.nodes.require("glowFront").setLight?.({ intensity: 70 * pulse });
  app.nodes.require("glowBack").setLight?.({ intensity: 70 * (2 - pulse) });
  app.nodes.require("glowLow").setLight?.({ intensity: 28 * pulse });

  const a = stepSpirals(spiralsA, dt);
  const b = stepSpirals(spiralsB, dt);
  const m = stepMotes(dt, time);
  app.nodes.require("spiralA").setInstances?.(a.out);
  app.nodes.require("spiralB").setInstances?.(b.out);
  app.nodes.require("motes").setInstances?.(m.out);
  particleCount = a.live + b.live + m.live;
  publish();
});

await app.ready();
publish();
window.__EVAL_READY__ = true;
