import {
  camera, createAuraApp, effects, environments, geometry, instances, lights, material, primitives, scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

type V3 = [number, number, number];

let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const sstep = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const CY = 4.1; // portal centre height
const RING_R = 3.0; // radius of block centres
const DISC_R = 2.72;
const PLATFORM_TOP = 0.9;

// ---------------------------------------------------------------- vortex disc geometry (XY plane, facing +Z)
const RINGS = 36, SEGS = 96;
const dPos = new Float32Array((RINGS * SEGS + 1) * 3);
const dNor = new Float32Array(dPos.length);
const dUv = new Float32Array((RINGS * SEGS + 1) * 2);
const dIdx: number[] = [];
for (let i = 0; i < dNor.length; i += 3) dNor[i + 2] = 1;
dUv.set([0.5, 0.5], 0);
for (let r = 1; r <= RINGS; r += 1) {
  for (let s = 0; s < SEGS; s += 1) {
    const a = (s / SEGS) * Math.PI * 2, rad = (r / RINGS) * DISC_R, v = 1 + (r - 1) * SEGS + s;
    dPos.set([Math.cos(a) * rad, Math.sin(a) * rad, 0], v * 3);
    dUv.set([0.5 + 0.5 * Math.cos(a) * (r / RINGS), 0.5 + 0.5 * Math.sin(a) * (r / RINGS)], v * 2);
  }
}
for (let s = 0; s < SEGS; s += 1) dIdx.push(0, 1 + s, 1 + ((s + 1) % SEGS));
for (let r = 1; r < RINGS; r += 1) {
  for (let s = 0; s < SEGS; s += 1) {
    const a = 1 + (r - 1) * SEGS + s, b = 1 + (r - 1) * SEGS + ((s + 1) % SEGS);
    const c = a + SEGS, d = b + SEGS;
    dIdx.push(a, c, b, b, c, d);
  }
}

const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
void main() {
  float r = clamp(length(vP) / ${DISC_R.toFixed(3)}, 0.0, 1.0);
  float a = atan(vP.y, vP.x);
  float sa = a + (1.0 - r) * 5.5 - log(r + 0.08) * 1.6 - clk * 0.9;
  float arms = 0.5 + 0.5 * sin(sa * 3.0 + r * 6.0 - clk * 1.6);
  float fine = 0.5 + 0.5 * sin(sa * 7.0 - r * 14.0 + clk * 2.2);
  float n = vnoise(vec2(cos(sa) * (1.5 + r * 3.0) + clk * 0.3, sin(sa) * (1.5 + r * 3.0) - r * 4.0 + clk * 0.7) * 1.6);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 violet = vec3(0.50, 0.12, 1.0);
  vec3 deep = vec3(0.02, 0.02, 0.18);
  vec3 col = mix(violet, cyan, smoothstep(0.2, 0.8, arms * 0.7 + n * 0.5));
  col = mix(deep, col, 0.35 + 0.65 * (0.4 * arms + 0.35 * fine + 0.5 * n));
  col *= 1.0 + 0.9 * smoothstep(0.55, 0.95, arms) * (0.5 + 0.5 * fine);
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * r * 5.0);
  col += vec3(0.55, 0.9, 1.0) * halo * 0.9 * pulse;
  col += vec3(1.0, 0.95, 1.0) * core * 4.0 * pulse;
  float rim = smoothstep(0.78, 1.0, r);
  col += mix(cyan, violet, 0.4 + 0.4 * sin(a * 2.0 + clk)) * rim * 1.6;
  outColor = vec4(col * 1.25, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 1 } },
  side: "double",
  fog: false
});

// ---------------------------------------------------------------- materials
const stone = material.pbr({ color: "#ffffff", roughness: 0.95, metallic: 0.02 });
const darkStone = material.pbr({ color: "#5b5566", roughness: 0.92 });
const runeMat = material.emissive({ color: "#7ff3ff", emissive: "#4fe6ff", emissiveIntensity: 2.6 });
const dashMat = material.emissive({ color: "#b58cff", emissive: "#8a55ff", emissiveIntensity: 2.2 });
const cyanMat = material.emissive({ color: "#8ff6ff", emissive: "#3fe8ff", emissiveIntensity: 3.2 });
const violetMat = material.emissive({ color: "#c9a0ff", emissive: "#9a5cff", emissiveIntensity: 3.2 });
const moteMat = material.emissive({ color: "#d6f8ff", emissive: "#a8ecff", emissiveIntensity: 2.8 });

// ---------------------------------------------------------------- ring blocks
const ringBlocks: AuraTransformSpec[] = [], ringColors: string[] = [];
const runes: AuraTransformSpec[] = [];
const BLOCKS = 24;
for (let i = 0; i < BLOCKS; i += 1) {
  const a = ((i + 0.5) / BLOCKS) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
  const w = range(0.6, 0.78), d = range(0.95, 1.12);
  ringBlocks.push({
    position: [c * RING_R, CY + s * RING_R, range(-0.04, 0.04)],
    rotation: [0, 0, a],
    scale: [w, 0.88, d]
  });
  const moss = rand() < 0.25;
  ringColors.push(moss ? `hsl(${95 + Math.floor(rand() * 30)}, 15%, ${26 + Math.floor(rand() * 8)}%)` : `hsl(${255 + Math.floor(rand() * 20)}, 8%, ${34 + Math.floor(rand() * 16)}%)`);
  if (i % 2 === 0) {
    for (const zs of [1, -1]) {
      runes.push({
        position: [c * (RING_R + 0.02), CY + s * (RING_R + 0.02), zs * (d / 2 + 0.01)],
        rotation: [0, 0, a],
        scale: [0.3, 0.12 + rand() * 0.16, 0.04]
      });
    }
  }
}

// ---------------------------------------------------------------- platform detail, rubble
const dashes: AuraTransformSpec[] = [];
for (let i = 0; i < 40; i += 1) {
  const a = (i / 40) * Math.PI * 2;
  dashes.push({ position: [Math.cos(a) * 4.4, PLATFORM_TOP + 0.01, Math.sin(a) * 4.4], rotation: [0, -a, 0], scale: [0.1, 0.03, i % 2 === 0 ? 0.55 : 0.25] });
}
const rubble: AuraTransformSpec[] = [], rubbleColors: string[] = [];
for (let i = 0; i < 90; i += 1) {
  const a = rand() * Math.PI * 2, r = range(5.4, 20), s = range(0.15, 0.7);
  const onPlatform = r < 6.8;
  const y = onPlatform ? PLATFORM_TOP + s * 0.2 : s * 0.3;
  rubble.push({ position: [Math.cos(a) * r, y, Math.sin(a) * r], rotation: [range(-0.4, 0.4), rand() * 6, range(-0.4, 0.4)], scale: [s * range(0.8, 1.6), s * 0.6, s * range(0.8, 1.4)] });
  rubbleColors.push(`hsl(${250 + Math.floor(rand() * 25)}, 8%, ${24 + Math.floor(rand() * 20)}%)`);
}

// ---------------------------------------------------------------- scene
let sc = scene({ background: "#150f26" })
  .camera(camera.orbit({ position: [0, 5.6, 16], target: [0, 3.3, 0], fov: 42, near: 0.5, far: 120, autoRotate: 0.07 }))
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.hemisphere({ skyColor: "#5a47a0", groundColor: "#120d1c", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk-sun", position: [-26, 7, -18], target: [0, 2, 0], intensity: 1.5, color: "#ff8a5c", shadow: true }))
  .add(lights.point({ name: "glow-front", position: [0, CY, 2.6], intensity: 60, color: "#4fe6ff", distance: 22, decay: 2, shadow: false }).runtime({ id: "glow-front", mutable: true }))
  .add(lights.point({ name: "glow-back", position: [0, CY, -2.6], intensity: 60, color: "#9a5cff", distance: 22, decay: 2, shadow: false }).runtime({ id: "glow-back", mutable: true }))
  .add(lights.point({ name: "glow-low", position: [0, 1.6, 0], intensity: 25, color: "#7a8cff", distance: 12, decay: 2, shadow: false }).runtime({ id: "glow-low", mutable: true }))
  .add(effects.fog({ color: "#241a3d", density: 0.022 }))
  .add(effects.bloom({ intensity: 1.25, threshold: 0.65, radius: 0.75 }))
  .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: material.pbr({ color: "#1c1827", roughness: 1 }) }))
  .add(primitives.cylinder({ name: "platform-low", size: [14, 0.5, 14], material: darkStone }).position(0, 0.25, 0))
  .add(primitives.cylinder({ name: "platform-high", size: [11, 0.4, 11], material: material.pbr({ color: "#6d6679", roughness: 0.9 }) }).position(0, 0.7, 0))
  .add(primitives.box({ name: "portal-base", size: [2.4, 0.5, 1.5], material: darkStone }).position(0, PLATFORM_TOP + 0.2, 0))
  .add(instances.box({ name: "ring-blocks", transforms: ringBlocks, colors: ringColors, material: stone }))
  .add(instances.box({ name: "ring-runes", transforms: runes, material: runeMat }))
  .add(instances.box({ name: "platform-dashes", transforms: dashes, material: dashMat }))
  .add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stone }))
  .add(geometry.custom(
    geometry.define({
      positions: dPos, normals: dNor, uvs: dUv, indices: dIdx,
      bounds: { min: [-DISC_R, -DISC_R, -0.1], max: [DISC_R, DISC_R, 0.1] }
    }),
    { name: "vortex", material: vortex, castShadow: false }
  ).position(0, CY, 0).runtime({ id: "vortex", mutable: true }));

// ruined pillars
const pillarSpots: Array<[number, number, number, boolean]> = [
  [-7.2, -3.0, 5.2, false], [7.0, -4.2, 6.4, false], [-6.0, 5.6, 3.4, true], [6.6, 5.4, 4.4, false],
  [-10.5, -9.0, 4.0, true], [10.0, -9.5, 5.5, false], [0.5, -11.5, 4.6, true]
];
pillarSpots.forEach(([x, z, h, broken], i) => {
  sc = sc
    .add(primitives.box({ name: `pillar-base-${i}`, size: [1.7, 0.5, 1.7], material: darkStone }).position(x, 0.25, z))
    .add(primitives.cylinder({ name: `pillar-${i}`, size: [1.1, h, 1.1], material: material.pbr({ color: "#7a7386", roughness: 0.93 }) }).position(x, 0.5 + h / 2, z));
  if (!broken) {
    sc = sc.add(primitives.box({ name: `pillar-cap-${i}`, size: [1.6, 0.45, 1.6], material: darkStone }).position(x, 0.5 + h + 0.22, z));
  } else {
    sc = sc
      .add(primitives.box({ name: `pillar-chunk-${i}`, size: [0.9, 0.7, 0.8], material: darkStone }).position(x + 1.3, 0.35, z + 0.9).rotate(0.3, 0.6, 0.2))
      .add(primitives.cylinder({ name: `pillar-drum-${i}`, size: [1.0, 1.2, 1.0], material: darkStone }).position(x - 1.5, 0.6, z + 1.2).rotate(0, 0, 1.45));
  }
});

// ---------------------------------------------------------------- particles (CPU simulated, instanced spheres)
interface Spiral { rho: number; theta: number; zoff: number; vr: number; size: number; dir: number }
const makeSpiral = (initial: boolean): Spiral => ({
  rho: initial ? range(0.6, 7.5) : range(6.2, 7.8),
  theta: rand() * Math.PI * 2,
  zoff: range(-3.2, 3.2),
  vr: range(0.55, 1.0),
  size: range(0.07, 0.17),
  dir: 1
});
const SPIRAL_N = 110;
const spiralsA = Array.from({ length: SPIRAL_N }, () => makeSpiral(true));
const spiralsB = Array.from({ length: SPIRAL_N }, () => makeSpiral(true));

interface Mote { bx: number; bz: number; age: number; life: number; vy: number; ph: number; size: number }
const makeMote = (initial: boolean): Mote => {
  const a = rand() * Math.PI * 2, r = 5.3 * Math.sqrt(rand());
  const life = range(5, 9);
  return { bx: Math.cos(a) * r, bz: Math.sin(a) * r, age: initial ? rand() * life : 0, life, vy: range(0.35, 0.95), ph: rand() * 6.28, size: range(0.04, 0.11) };
};
const MOTE_N = 70;
const motes = Array.from({ length: MOTE_N }, () => makeMote(true));

const unit = (): AuraTransformSpec => ({ position: [0, -50, 0], scale: [0.001, 0.001, 0.001] });
sc = sc
  .add(instances.sphere({ name: "spiral-a", transforms: spiralsA.map(unit), material: cyanMat, castShadow: false }).runtime({ id: "spiral-a", mutable: true }))
  .add(instances.sphere({ name: "spiral-b", transforms: spiralsB.map(unit), material: violetMat, castShadow: false }).runtime({ id: "spiral-b", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: motes.map(unit), material: moteMat, castShadow: false }).runtime({ id: "motes", mutable: true }));

let liveCount = 0;
const stepSpirals = (list: Spiral[], phase: number, dt: number, out: AuraTransformSpec[]): void => {
  for (let i = 0; i < list.length; i += 1) {
    const p = list[i]!;
    p.theta += (1.1 + 2.6 / (p.rho + 0.7)) * dt * p.dir;
    p.rho -= p.vr * dt;
    if (p.rho < 0.35) Object.assign(p, makeSpiral(false));
    const th = p.theta + phase;
    const f = sstep(0.35, 1.8, p.rho) * sstep(7.9, 6.2, p.rho);
    const s = p.size * f;
    const x = p.rho * Math.cos(th);
    const y = Math.max(1.05, CY + p.rho * 0.85 * Math.sin(th));
    const z = p.zoff * (p.rho / 7);
    if (s > 0.004) liveCount += 1;
    const v: V3 = [x, y, z];
    out[i] = { position: v, scale: [s + 0.0005, s + 0.0005, s + 0.0005] };
  }
};
const stepMotes = (dt: number, out: AuraTransformSpec[]): void => {
  for (let i = 0; i < motes.length; i += 1) {
    const m = motes[i]!;
    m.age += dt;
    if (m.age >= m.life) Object.assign(m, makeMote(false));
    const u = m.age / m.life;
    const s = m.size * Math.sqrt(Math.sin(Math.PI * Math.min(1, u)));
    if (s > 0.004) liveCount += 1;
    out[i] = {
      position: [m.bx + Math.sin(m.age * 0.9 + m.ph) * 0.45, PLATFORM_TOP + 0.1 + m.age * m.vy, m.bz + Math.cos(m.age * 0.7 + m.ph) * 0.45],
      scale: [s + 0.0005, s + 0.0005, s + 0.0005]
    };
  }
};

const tA: AuraTransformSpec[] = spiralsA.map(unit);
const tB: AuraTransformSpec[] = spiralsB.map(unit);
const tM: AuraTransformSpec[] = motes.map(unit);

const app = createAuraApp("#app", { scene: sc });
let t = 0;
const state = { portalActive: true, particleCount: SPIRAL_N * 2 + MOTE_N, time: 0 };
window.__TASK_STATE__ = state;

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  t += dt;
  liveCount = 0;
  stepSpirals(spiralsA, 0, dt, tA);
  stepSpirals(spiralsB, Math.PI, dt, tB);
  stepMotes(dt, tM);
  app.nodes.require("spiral-a").setInstances(tA);
  app.nodes.require("spiral-b").setInstances(tB);
  app.nodes.require("motes").setInstances(tM);

  const pulse = 1 + 0.28 * Math.sin(t * 1.4) + 0.08 * Math.sin(t * 3.1);
  const vx = app.nodes.require("vortex");
  vx.setUniform?.("clk", t);
  vx.setUniform?.("pulse", 0.85 + 0.15 * pulse);
  app.nodes.require("glow-front").setLight?.({ intensity: 60 * pulse });
  app.nodes.require("glow-back").setLight?.({ intensity: 60 * (2 - pulse) });
  app.nodes.require("glow-low").setLight?.({ intensity: 25 * pulse });

  state.portalActive = true;
  state.particleCount = liveCount;
  state.time = t;
  window.__TASK_STATE__ = state;
});

await app.ready();
window.__EVAL_READY__ = true;
