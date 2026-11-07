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
  type AuraTransformSpec,
  type AuraVec3
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------------------------------------------------------------- helpers
let seed = 20240611;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const CY = 3.2; // portal centre height
const RING_R = 2.3; // ring block centre radius
const DISC_R = 2.05; // energy disc radius

// ---------------------------------------------------------------- portal disc shaders
function discGeometry(radius: number) {
  const rings = 28, segs = 72;
  const positions = new Float32Array(((rings + 1) * (segs + 1)) * 3);
  const normals = new Float32Array(positions.length);
  const indices: number[] = [];
  for (let i = 0; i <= rings; i += 1) {
    for (let j = 0; j <= segs; j += 1) {
      const r = (i / rings) * radius, a = (j / segs) * Math.PI * 2;
      const v = i * (segs + 1) + j;
      positions.set([Math.cos(a) * r, Math.sin(a) * r, 0], v * 3);
      normals[v * 3 + 2] = 1;
      if (i < rings && j < segs) {
        const n = v + segs + 1;
        indices.push(v, n, v + 1, v + 1, n, n + 1);
      }
    }
  }
  return geometry.define({ positions, normals, indices, bounds: { min: [-radius, -radius, -0.01], max: [radius, radius, 0.01] } });
}

const vertexFor = (radius: number): string => /* glsl */ `
out vec2 vP;
out float vT;
void main() {
  vP = position.xy / ${radius.toFixed(3)};
  vT = clock;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const vortexFragment = /* glsl */ `
in vec2 vP;
in float vT;
out vec4 outColor;
void main() {
  float r = clamp(length(vP), 0.0, 1.0);
  float a = atan(vP.y, vP.x);
  float t = vT;
  float pulse = 0.88 + 0.12 * sin(t * 1.3);
  // spiral arms twisting tighter toward the centre
  float twist = (1.0 - r) * (1.0 - r) * 7.0;
  float arms = 0.5 + 0.5 * sin(a * 3.0 + twist - t * 1.6);
  float fine = 0.5 + 0.5 * sin(a * 7.0 - r * 16.0 + twist * 1.4 - t * 2.6);
  float rings = 0.5 + 0.5 * sin(r * 26.0 - t * 3.2 + sin(a * 2.0 + t) * 1.5);
  float swirl = clamp(arms * 0.65 + fine * 0.3 + rings * 0.18, 0.0, 1.0);
  vec3 violet = vec3(0.42, 0.10, 0.95);
  vec3 deep = vec3(0.07, 0.02, 0.28);
  vec3 cyan = vec3(0.08, 0.85, 1.0);
  vec3 col = mix(deep, violet, smoothstep(0.0, 0.55, swirl));
  col = mix(col, cyan * 1.6, smoothstep(0.55, 1.0, swirl) * (0.4 + 0.6 * (1.0 - r)));
  // bright core and bright rim
  float core = exp(-r * r * 16.0);
  col += vec3(0.9, 0.95, 1.0) * core * 3.2;
  col += cyan * smoothstep(0.78, 1.0, r) * 1.8;
  col *= pulse;
  outColor = vec4(col, 1.0);
}`;

const haloFragment = (strength: number): string => /* glsl */ `
in vec2 vP;
in float vT;
out vec4 outColor;
void main() {
  float r = length(vP);
  float pulse = 0.82 + 0.18 * sin(vT * 1.3);
  float band = exp(-pow((r - 0.43) / 0.2, 2.0));
  float centre = exp(-r * r * 9.0);
  float edge = 1.0 - smoothstep(0.55, 1.0, r);
  float ang = atan(vP.y, vP.x);
  vec3 tint = mix(vec3(0.45, 0.18, 1.0), vec3(0.10, 0.80, 1.0), 0.5 + 0.5 * sin(ang * 2.0 + vT * 0.6));
  vec3 c = tint * (band * 0.9 + centre * 0.55) * edge * pulse * ${strength.toFixed(3)};
  outColor = vec4(c, 1.0);
}`;

const vortexMat = material.custom({
  glsl: { vertex: vertexFor(DISC_R), fragment: vortexFragment },
  uniforms: { clock: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});
const haloBack = material.custom({
  glsl: { vertex: vertexFor(5.4), fragment: haloFragment(1.25) },
  uniforms: { clock: { type: "f32", value: 0 } },
  transparent: true,
  blending: "additive",
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});
const haloFront = material.custom({
  glsl: { vertex: vertexFor(4.2), fragment: haloFragment(0.5) },
  uniforms: { clock: { type: "f32", value: 0 } },
  transparent: true,
  blending: "additive",
  depthWrite: false,
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------------------------------------------------------------- stone ring
const stoneBase = material.pbr({ color: "#ffffff", roughness: 0.93, metallic: 0.02 });
const ringBlocks: AuraTransformSpec[] = [];
const ringColors: string[] = [];
const stoneTones = ["#6d6a78", "#5d5a6a", "#777386", "#524f60", "#68667a"];
const BLOCKS = 36;
for (let i = 0; i < BLOCKS; i += 1) {
  const a = (i / BLOCKS) * Math.PI * 2;
  const r = RING_R + range(-0.03, 0.05);
  ringBlocks.push({
    position: [Math.cos(a) * r, CY + Math.sin(a) * r, range(-0.04, 0.04)],
    rotation: [0, 0, a + range(-0.03, 0.03)],
    scale: [range(0.54, 0.64), 0.47, range(0.6, 0.72)]
  });
  ringColors.push(stoneTones[i % stoneTones.length]!);
}
const runeCyan: AuraTransformSpec[] = [];
const runeViolet: AuraTransformSpec[] = [];
for (let i = 0; i < 24; i += 1) {
  const a = ((i + 0.5) / 24) * Math.PI * 2;
  const spec: AuraTransformSpec = {
    position: [Math.cos(a) * 2.03, CY + Math.sin(a) * 2.03, 0],
    rotation: [0, 0, a],
    scale: [0.06, 0.16, 0.5]
  };
  (i % 2 === 0 ? runeCyan : runeViolet).push(spec);
}
// front-face glyph marks on the ring
const glyphs: AuraTransformSpec[] = [];
for (let i = 0; i < 12; i += 1) {
  const a = ((i + 0.5) / 12) * Math.PI * 2 + 0.13;
  glyphs.push({
    position: [Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, 0.335],
    rotation: [0, 0, a + (i % 2 ? 0.0 : Math.PI / 2)],
    scale: [0.34, 0.07, 0.03]
  });
}

// ---------------------------------------------------------------- ruins
const platformStone = material.pbr({ color: "#4a4756", roughness: 0.95 });
const pillarStone = material.pbr({ color: "#625f70", roughness: 0.96 });
const groundStone = material.pbr({ color: "#2b2a35", roughness: 1 });

interface Pillar { x: number; z: number; h: number; broken: boolean; lean: number }
const pillars: Pillar[] = [
  { x: -5.4, z: -0.6, h: 5.6, broken: false, lean: 0 },
  { x: 5.2, z: -1.6, h: 3.1, broken: true, lean: 0.12 },
  { x: -3.9, z: -4.6, h: 4.3, broken: false, lean: 0.03 },
  { x: 4.7, z: -5.6, h: 6.2, broken: false, lean: -0.02 },
  { x: -7.3, z: 3.2, h: 2.2, broken: true, lean: -0.1 },
  { x: 7.4, z: 2.8, h: 4.0, broken: false, lean: 0.04 }
];

const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 42; i += 1) {
  const a = rand() * Math.PI * 2, d = range(3.2, 10);
  const s = range(0.18, 0.62);
  rubble.push({
    position: [Math.cos(a) * d, s * 0.3, Math.sin(a) * d - 1],
    rotation: [range(-0.4, 0.4), rand() * 3, range(-0.4, 0.4)],
    scale: [s * range(0.8, 1.6), s * 0.7, s * range(0.8, 1.4)]
  });
  rubbleColors.push(stoneTones[i % stoneTones.length]!);
}

const platformInlay: AuraTransformSpec[] = [];
for (let i = 0; i < 28; i += 1) {
  const a = (i / 28) * Math.PI * 2;
  platformInlay.push({
    position: [Math.cos(a) * 3.5, 0.605, Math.sin(a) * 3.5],
    rotation: [0, -a + Math.PI / 2, 0],
    scale: [0.5, 0.02, 0.07]
  });
}

// ---------------------------------------------------------------- scene
const stage = scene({ background: "#120c26" })
  .add(sky.gradient({ zenith: "#0d0a22", horizon: "#b4506a", ground: "#1a1024", exponent: 0.6, horizonGlow: 0.6, name: "dusk-sky" }))
  .add(environments.neutral({ intensity: 0.3, background: false }))
  .add(lights.hemisphere({ skyColor: "#5a4aa0", groundColor: "#1a1022", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk-sun", position: [-9, 4.5, -8], target: [0, 2, 0], intensity: 1.5, color: "#ff8f6b", shadow: true }))
  .add(lights.directional({ name: "cool-fill", position: [8, 9, 9], target: [0, 1, 0], intensity: 0.45, color: "#7084ff" }))
  .add(lights.point({ name: "portal-front", position: [0, CY - 0.4, 2.2], intensity: 46, color: "#3be2ff", distance: 16, decay: 2, shadow: false }).runtime({ id: "light-front", mutable: true }))
  .add(lights.point({ name: "portal-back", position: [0, CY, -2.2], intensity: 34, color: "#9a58ff", distance: 14, decay: 2, shadow: false }).runtime({ id: "light-back", mutable: true }))
  .add(lights.point({ name: "portal-floor", position: [0, 1.4, 1.6], intensity: 26, color: "#7a78ff", distance: 11, decay: 2, shadow: false }).runtime({ id: "light-floor", mutable: true }))
  // ground and platform
  .add(primitives.plane({ name: "ground", size: [70, 1, 70], material: groundStone }))
  .add(primitives.cylinder({ name: "step", size: [10.6, 0.3, 10.6], material: platformStone }).position(0, 0.15, 0))
  .add(primitives.cylinder({ name: "platform", size: [8.4, 0.6, 8.4], material: platformStone }).position(0, 0.3, 0))
  .add(instances.box({ name: "platform-inlay", transforms: platformInlay, material: material.emissive({ color: "#6a3cff", emissive: "#7a4cff", emissiveIntensity: 2.4 }) }))
  // ring
  .add(instances.box({ name: "ring-blocks", transforms: ringBlocks, colors: ringColors, material: stoneBase }))
  .add(instances.box({ name: "rune-cyan", transforms: runeCyan, material: material.emissive({ color: "#8ff0ff", emissive: "#2fd8ff", emissiveIntensity: 3.2 }) }))
  .add(instances.box({ name: "rune-violet", transforms: runeViolet, material: material.emissive({ color: "#c9a8ff", emissive: "#8a4cff", emissiveIntensity: 3.2 }) }))
  .add(instances.box({ name: "glyphs", transforms: glyphs, material: material.emissive({ color: "#8ff0ff", emissive: "#2fd8ff", emissiveIntensity: 2.2 }) }))
  .add(primitives.box({ name: "footing", size: [2.4, 0.5, 1.2], material: pillarStone }).position(0, 0.85, 0))
  .add(primitives.box({ name: "footing-l", size: [1.1, 0.35, 1.5], material: pillarStone }).position(-1.9, 0.78, 0).rotate(0, 0.08, 0))
  .add(primitives.box({ name: "footing-r", size: [1.1, 0.35, 1.5], material: pillarStone }).position(1.9, 0.78, 0).rotate(0, -0.06, 0))
  // energy
  .add(geometry.custom(discGeometry(DISC_R), { name: "vortex", material: vortexMat, castShadow: false, receiveShadow: false }).position(0, CY, 0).runtime({ id: "vortex", mutable: true }))
  .add(geometry.custom(discGeometry(5.4), { name: "halo-back", material: haloBack, castShadow: false, receiveShadow: false }).position(0, CY, -0.25).runtime({ id: "halo-back", mutable: true }))
  .add(geometry.custom(discGeometry(4.2), { name: "halo-front", material: haloFront, castShadow: false, receiveShadow: false }).position(0, CY, 0.55).runtime({ id: "halo-front", mutable: true }))
  // rubble
  .add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stoneBase }));

for (const [i, p] of pillars.entries()) {
  stage.add(primitives.cylinder({ name: `pillar-${i}`, size: [0.95, p.h, 0.95], material: pillarStone }).position(p.x, p.h / 2, p.z).rotate(0, 0, p.lean));
  stage.add(primitives.cylinder({ name: `pillar-base-${i}`, size: [1.3, 0.3, 1.3], material: platformStone }).position(p.x, 0.15, p.z));
  if (!p.broken) {
    stage.add(primitives.box({ name: `capital-${i}`, size: [1.35, 0.3, 1.35], material: platformStone }).position(p.x + Math.sin(-p.lean) * p.h * 0.5, p.h + 0.1, p.z).rotate(0, 0.2, p.lean));
  } else {
    stage.add(primitives.box({ name: `chunk-${i}`, size: [0.8, 0.5, 0.7], material: pillarStone }).position(p.x + 0.9, 0.25, p.z + 0.8).rotate(0.3, 0.6, 0.2));
  }
}
stage.add(primitives.cylinder({ name: "fallen-drum", size: [0.9, 1.7, 0.9], material: pillarStone }).position(2.6, 0.45, 5.4).rotate(0, 0.5, Math.PI / 2));
stage.add(primitives.cylinder({ name: "fallen-drum-2", size: [0.9, 1.2, 0.9], material: pillarStone }).position(-2.2, 0.45, 6.4).rotate(0.1, -0.4, Math.PI / 2));

stage
  .add(effects.fog({ color: "#2a1c40", density: 0.03 }))
  .add(effects.bloom({ intensity: 1.35, threshold: 0.55, radius: 0.8 }))
  .add(effects.colorGrade({ contrast: 1.15, saturation: 1.12 }))
  .add(effects.vignette({ intensity: 0.45 }))
  .camera(camera.perspective({ position: [0, 3.6, 12.5], target: [0, 3.0, 0], fov: 45, near: 0.3, far: 120 }));

// ---------------------------------------------------------------- particles
interface Particle { alive: boolean; age: number; life: number; a0: number; r0: number; spin: number; z0: number; size: number; phase: number; dir: number; x0: number; zz: number }
type Pose = (p: Particle, out: { x: number; y: number; z: number; s: number }) => void;

class Pool {
  readonly items: Particle[];
  readonly matrices: Float32Array;
  live = 0;
  private acc = 0;
  private cursor = 0;
  constructor(
    readonly id: string,
    readonly cap: number,
    readonly rate: number,
    private readonly spawn: (p: Particle) => void,
    private readonly pose: Pose
  ) {
    this.items = Array.from({ length: cap }, () => ({ alive: false, age: 0, life: 1, a0: 0, r0: 0, spin: 0, z0: 0, size: 1, phase: 0, dir: 1, x0: 0, zz: 0 }));
    this.matrices = new Float32Array(cap * 16);
  }
  step(dt: number): void {
    this.acc += this.rate * dt;
    while (this.acc >= 1) {
      this.acc -= 1;
      for (let k = 0; k < this.cap; k += 1) {
        const p = this.items[(this.cursor + k) % this.cap]!;
        if (!p.alive) {
          this.cursor = (this.cursor + k + 1) % this.cap;
          p.alive = true;
          p.age = 0;
          this.spawn(p);
          break;
        }
      }
    }
    const out = { x: 0, y: 0, z: 0, s: 0 };
    let n = 0;
    for (const p of this.items) {
      if (!p.alive) continue;
      p.age += dt;
      if (p.age >= p.life) { p.alive = false; continue; }
      this.pose(p, out);
      const m = this.matrices, o = n * 16, s = Math.max(out.s, 0.0001);
      m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
      m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
      m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
      m[o + 12] = out.x; m[o + 13] = out.y; m[o + 14] = out.z; m[o + 15] = 1;
      n += 1;
    }
    this.live = n;
  }
}

const spiralSpawn = (dirSign: number) => (p: Particle): void => {
  p.life = range(2.0, 3.3);
  p.a0 = rand() * Math.PI * 2;
  p.r0 = range(2.5, 3.1);
  p.spin = range(1.3, 2.2) * dirSign;
  p.z0 = range(-0.9, 0.9);
  p.size = range(0.6, 1.5);
  p.phase = rand() * 6.28;
};
const spiralPose: Pose = (p, out) => {
  const u = p.age / p.life;
  const r = p.r0 * Math.pow(1 - u, 1.4) + 0.12;
  const ang = p.a0 + p.spin * p.age * (1 + u * 1.8);
  out.x = Math.cos(ang) * r;
  out.y = CY + Math.sin(ang) * r;
  out.z = p.z0 * (r / p.r0) + Math.sin(p.phase + p.age * 3) * 0.12;
  out.s = p.size * Math.pow(Math.sin(Math.PI * Math.min(u, 1)), 0.6) * (0.55 + 0.45 * (r / p.r0));
};

const moteSpawn = (p: Particle): void => {
  p.life = range(4, 7);
  const a = rand() * Math.PI * 2, d = Math.sqrt(rand()) * 3.6;
  p.x0 = Math.cos(a) * d;
  p.zz = Math.sin(a) * d;
  p.a0 = range(0.35, 0.9); // rise speed
  p.phase = rand() * 6.28;
  p.size = range(0.6, 1.4);
};
const motePose: Pose = (p, out) => {
  const u = p.age / p.life;
  out.x = p.x0 + Math.sin(p.phase + p.age * 0.9) * 0.25;
  out.y = 0.7 + p.age * p.a0;
  out.z = p.zz + Math.cos(p.phase * 1.3 + p.age * 0.7) * 0.25;
  const fadeIn = Math.min(1, u * 8);
  const fadeOut = 1 - Math.pow(Math.max(0, (u - 0.45) / 0.55), 1.5);
  out.s = p.size * fadeIn * fadeOut;
};

const pools = [
  new Pool("spiral-cyan", 110, 38, spiralSpawn(1), spiralPose),
  new Pool("spiral-violet", 90, 30, spiralSpawn(-1), spiralPose),
  new Pool("motes", 70, 10, moteSpawn, motePose)
];

function poolNode(id: string, cap: number, size: number, mat: ReturnType<typeof material.emissive>) {
  const seedTransforms: AuraTransformSpec[] = Array.from({ length: cap }, (_, i) => ({
    position: [((i % 4) - 1.5) * 2.4, 0.5 + (i % 5) * 1.3, ((i % 3) - 1) * 1.6] as AuraVec3,
    scale: 0.001
  }));
  return instances.sphere({ name: id, size, transforms: seedTransforms, material: mat, castShadow: false, receiveShadow: false }).runtime({ id, mutable: true });
}

stage
  .add(poolNode("spiral-cyan", 110, 0.1, material.emissive({ color: "#9ff4ff", emissive: "#35e6ff", emissiveIntensity: 4 })))
  .add(poolNode("spiral-violet", 90, 0.1, material.emissive({ color: "#d2b5ff", emissive: "#9a5cff", emissiveIntensity: 4 })))
  .add(poolNode("motes", 70, 0.07, material.emissive({ color: "#e9fbff", emissive: "#aeeaff", emissiveIntensity: 3.5 })));

// prewarm so the first frame already has a steady population
for (let i = 0; i < 240; i += 1) for (const p of pools) p.step(1 / 30);

const app = createAuraApp("#app", { scene: stage });

const countLive = (): number => pools.reduce((sum, p) => sum + p.live, 0);
window.__TASK_STATE__ = { portalActive: true, particleCount: countLive(), time: 0 };

const t0 = performance.now();
let last = t0;
let ready = false;
let handles: ReturnType<typeof bind> | undefined;

function bind() {
  const n = app.nodes;
  const pool = pools.map((p) => {
    const h = n.require(p.id);
    h.frustumCulled = false;
    return h;
  });
  return {
    pool,
    vortex: n.require("vortex"),
    haloBack: n.require("halo-back"),
    haloFront: n.require("halo-front"),
    lf: n.require("light-front"),
    lb: n.require("light-back"),
    lfl: n.require("light-floor")
  };
}

app.onFrame(() => {
  const now = performance.now();
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const t = (now - t0) / 1000;

  handles ??= bind();
  const h = handles;

  // particles
  for (const [i, p] of pools.entries()) {
    p.step(dt);
    const node = h.pool[i]!;
    if (p.live > 0) {
      node.setVisible(true);
      node.setInstanceMatrices(p.matrices, p.live);
    } else {
      node.setVisible(false);
    }
  }

  // portal animation and pulsing coloured light
  h.vortex.setUniform?.("clock", t);
  h.haloBack.setUniform?.("clock", t);
  h.haloFront.setUniform?.("clock", t);
  const pulse = 1 + 0.28 * Math.sin(t * 1.3);
  const flick = 1 + 0.05 * Math.sin(t * 7.1) * Math.sin(t * 2.3);
  h.lf.setLight?.({ intensity: 46 * pulse * flick });
  h.lb.setLight?.({ intensity: 34 * (1 + 0.28 * Math.sin(t * 1.3 + 1.2)) });
  h.lfl.setLight?.({ intensity: 26 * pulse });

  // slow camera sway
  const a = 0.4 * Math.sin(t * 0.17);
  const dist = 12.5 + 0.6 * Math.sin(t * 0.11);
  app.camera?.setPose({
    position: [Math.sin(a) * dist, 3.6 + 0.35 * Math.sin(t * 0.23), Math.cos(a) * dist],
    target: [0, 3.0, 0]
  });

  window.__TASK_STATE__ = { portalActive: true, particleCount: countLive(), time: t };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
