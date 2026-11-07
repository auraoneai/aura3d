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
const range = (a: number, b: number): number => a + rand() * (b - a);

const CY = 3.9; // portal centre height
const RING_R = 2.9; // radius of the centre-line of the ring stones
const DISC_R = 2.6;

// ---------- custom shaders ----------
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
float fbm(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
void main() {
  float r = length(vP);
  if (r > 1.0) discard;
  float ang = atan(vP.y, vP.x);
  float a2 = ang - clk * 0.7 + 3.2 * (1.0 - r) * (1.0 - r) * 2.0;
  float arms = 0.5 + 0.5 * sin(a2 * 3.0 + log(r + 0.04) * 4.0 - clk * 1.4);
  vec2 q = r * vec2(cos(a2), sin(a2));
  float n = fbm(q * 3.2 + vec2(clk * 0.15, -clk * 0.1));
  float n2 = fbm(q * 7.0 - vec2(clk * 0.3, 0.0));
  vec3 violet = vec3(0.42, 0.10, 1.0);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 col = mix(violet, cyan, clamp(arms * 0.8 + n * 0.5 - 0.2, 0.0, 1.0));
  col *= 0.35 + 1.5 * arms * (0.5 + n);
  col += cyan * pow(n2, 3.0) * 1.2;
  float core = exp(-r * 4.5);
  col += vec3(1.0, 0.92, 1.0) * core * 3.2;
  col += vec3(0.5, 0.9, 1.0) * smoothstep(0.78, 1.0, r) * 1.6;
  col *= 0.92 + 0.12 * sin(clk * 1.3);
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  side: "double",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const halo = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vPos = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
void main() {
  vec3 v = normalize(cameraPosition - vPos);
  float f = clamp(dot(normalize(vN), v), 0.0, 1.0);
  float g = pow(f, 3.0) * (0.5 + 0.08 * sin(clk * 1.3));
  vec3 col = mix(vec3(0.35, 0.12, 0.9), vec3(0.1, 0.8, 1.0), pow(f, 5.0)) * g * 0.7;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "front",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------- static geometry ----------
const stone = material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0.05 });
const stoneColor = (): string => `hsl(${240 + Math.floor(range(-30, 40))}, ${Math.floor(range(5, 14))}%, ${Math.floor(range(22, 38))}%)`;

// portal ring: stone blocks around a circle in the XY plane
const ringT: AuraTransformSpec[] = [];
const ringC: string[] = [];
const SEG = 28;
for (let i = 0; i < SEG; i += 1) {
  const a = (i / SEG) * Math.PI * 2;
  const rr = RING_R + range(-0.04, 0.05);
  ringT.push({
    position: [Math.cos(a) * rr, CY + Math.sin(a) * rr, range(-0.05, 0.05)],
    rotation: [range(-0.03, 0.03), range(-0.04, 0.04), a],
    scale: [range(0.74, 0.86), 0.72, range(0.62, 0.78)]
  });
  ringC.push(stoneColor());
}
// keystone and base feet
ringT.push({ position: [0, CY + RING_R + 0.42, 0], rotation: [0, 0, 0], scale: [1.0, 0.5, 0.9] });
ringC.push("hsl(250, 10%, 40%)");
for (const s of [-1, 1]) {
  ringT.push({ position: [s * 1.5, 0.85, 0], rotation: [0, 0, 0], scale: [1.5, 0.5, 1.2] });
  ringC.push("hsl(245, 8%, 28%)");
}

const runesCyan: AuraTransformSpec[] = [];
const runesViolet: AuraTransformSpec[] = [];
for (let i = 0; i < SEG; i += 1) {
  const a = ((i + 0.5) / SEG) * Math.PI * 2;
  for (const z of [-1, 1]) {
    const t: AuraTransformSpec = {
      position: [Math.cos(a) * RING_R, CY + Math.sin(a) * RING_R, z * 0.37],
      rotation: [0, 0, a],
      scale: [0.34, 0.07, 0.03]
    };
    (i % 2 === 0 ? runesCyan : runesViolet).push(t);
  }
}

// platform
const platT: AuraTransformSpec[] = [
  { position: [0, 0.25, 0], scale: [14, 0.5, 14] },
  { position: [0, 0.3, 0], scale: [10.4, 0.6, 10.4] }
];
const platC = ["hsl(255, 8%, 22%)", "hsl(250, 8%, 30%)"];
const platRunesC: AuraTransformSpec[] = [];
const platRunesV: AuraTransformSpec[] = [];
for (let i = 0; i < 36; i += 1) {
  const a = (i / 36) * Math.PI * 2;
  (i % 2 === 0 ? platRunesC : platRunesV).push({
    position: [Math.cos(a) * 4.3, 0.61, Math.sin(a) * 4.3],
    rotation: [0, -a, 0],
    scale: [0.34, 0.025, 0.1]
  });
}
// slabs on the platform edge to read as paving
const slabT: AuraTransformSpec[] = [];
const slabC: string[] = [];
for (let i = 0; i < 18; i += 1) {
  const a = (i / 18) * Math.PI * 2 + 0.1;
  slabT.push({ position: [Math.cos(a) * 4.95, 0.62, Math.sin(a) * 4.95], rotation: [0, -a, 0], scale: [0.9, 0.06, 1.6] });
  slabC.push(stoneColor());
}

// pillars (some broken), caps and rubble
const pillarT: AuraTransformSpec[] = [];
const pillarC: string[] = [];
const blockT: AuraTransformSpec[] = [];
const blockC: string[] = [];
const pillars: Array<[number, number, number]> = [
  [-8, -3, 6.2], [8.2, -4, 4.4], [-7, 5.5, 3.0], [7.6, 6, 5.6], [-11.5, -0.5, 2.0], [0.5, -10, 7.5], [11.5, 1.5, 2.6], [-4, -8, 3.6]
];
for (const [x, z, h] of pillars) {
  pillarT.push({ position: [x, 0.3 + h / 2, z], rotation: [range(-0.02, 0.02), 0, range(-0.02, 0.02)], scale: [1.0, h, 1.0] });
  pillarC.push(stoneColor());
  blockT.push({ position: [x, 0.2, z], scale: [1.6, 0.4, 1.6] });
  blockC.push(stoneColor());
  if (h > 5) {
    blockT.push({ position: [x, 0.3 + h + 0.15, z], scale: [1.5, 0.3, 1.5] });
    blockC.push(stoneColor());
  }
}
for (let i = 0; i < 45; i += 1) {
  const a = rand() * Math.PI * 2, r = range(7.5, 18);
  const s = range(0.2, 0.7);
  blockT.push({ position: [Math.cos(a) * r, s * 0.3, Math.sin(a) * r - 1], rotation: [range(-0.4, 0.4), rand() * 6.28, range(-0.4, 0.4)], scale: [s * range(0.8, 1.6), s * 0.7, s] });
  blockC.push(stoneColor());
}
// fallen column and paving path toward the camera
const fallenT: AuraTransformSpec[] = [
  { position: [-3.6, 0.5, 9], rotation: [0, 0.5, Math.PI / 2], scale: [0.9, 3.8, 0.9] },
  { position: [4.2, 0.45, 10.5], rotation: [0.1, -0.9, Math.PI / 2 - 0.12], scale: [0.8, 2.4, 0.8] }
];
const fallenC = ["hsl(250, 8%, 30%)", "hsl(250, 8%, 26%)"];
for (let i = 0; i < 12; i += 1) {
  blockT.push({ position: [range(-0.5, 0.5), 0.04, 7.5 + i * 1.3], rotation: [0, range(-0.1, 0.1), 0], scale: [range(1.5, 2.2), 0.08, 1.1] });
  blockC.push(stoneColor());
}

// ---------- particles ----------
interface Spiral { age: number; life: number; r0: number; a0: number; dir: number; turns: number; z0: number; size: number }
interface Mote { age: number; life: number; x: number; z: number; speed: number; ph: number; size: number; sway: number }
const newSpiral = (age: number): Spiral => ({
  age, life: range(3.2, 6.2), r0: range(2.8, 5.4), a0: rand() * Math.PI * 2, dir: rand() < 0.8 ? 1 : -1,
  turns: range(0.9, 2.2), z0: range(-4.5, 4.5), size: range(0.07, 0.16)
});
const newMote = (age: number): Mote => {
  const a = rand() * Math.PI * 2, r = Math.sqrt(rand()) * 5.4;
  return { age, life: range(4, 8), x: Math.cos(a) * r, z: Math.sin(a) * r, speed: range(0.35, 0.9), ph: rand() * 6.28, size: range(0.04, 0.1), sway: range(0.15, 0.45) };
};
const NS = 110;
const spiralsC: Spiral[] = Array.from({ length: NS }, () => newSpiral(rand() * 5));
const spiralsV: Spiral[] = Array.from({ length: NS }, () => newSpiral(rand() * 5));
const motes: Mote[] = Array.from({ length: 70 }, () => newMote(rand() * 6));

const spiralTransform = (p: Spiral): AuraTransformSpec => {
  const u = Math.min(p.age / p.life, 1);
  const r = 0.25 + p.r0 * Math.pow(1 - u, 1.3);
  const th = p.a0 + p.dir * p.turns * Math.PI * 2 * Math.pow(u, 0.8);
  const z = p.z0 * Math.pow(1 - u, 1.5);
  const x = Math.cos(th) * r;
  const y = Math.max(0.75, CY + Math.sin(th) * r);
  const s = p.size * Math.pow(Math.sin(Math.PI * u), 0.6) * (1.0 + 0.8 * u);
  return { position: [x, y, z], scale: [s, s, s] };
};
const moteTransform = (p: Mote, t: number): AuraTransformSpec => {
  const u = Math.min(p.age / p.life, 1);
  const x = p.x + Math.sin(t * 0.7 + p.ph) * p.sway * (0.4 + u);
  const z = p.z + Math.cos(t * 0.6 + p.ph * 1.7) * p.sway * (0.4 + u);
  const y = 0.7 + p.age * p.speed;
  const s = p.size * Math.sin(Math.PI * u);
  return { position: [x, y, z], scale: [s, s, s] };
};

const glowMat = (color: string, emissive: string, k: number) => material.emissive({ color, emissive, emissiveIntensity: k });

// ---------- scene ----------
const FOG = "#2a1d44";
const sc = scene({ background: FOG })
  .camera(camera.orbit({ position: [0, 5.2, 17], target: [0, 3.2, 0], fov: 42, near: 0.5, far: 160, autoRotate: 0.09 }))
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.hemisphere({ skyColor: "#4a4392", groundColor: "#1c1326", intensity: 0.7 }))
  .add(lights.directional({ name: "dusk", position: [-16, 7, -12], target: [0, 1, 0], intensity: 1.7, color: "#ff8a5c", shadow: true }))
  .add(lights.directional({ name: "rim", position: [14, 9, 10], target: [0, 2, 0], intensity: 0.5, color: "#6a6cff" }))
  .add(lights.point({ name: "pl-front", position: [0, CY, 2.4], intensity: 70, color: "#3fe6ff", distance: 24, decay: 2, shadow: false }).runtime({ id: "pl-front", mutable: true }))
  .add(lights.point({ name: "pl-back", position: [0, CY, -2.4], intensity: 60, color: "#8a4bff", distance: 24, decay: 2, shadow: false }).runtime({ id: "pl-back", mutable: true }))
  .add(lights.point({ name: "pl-low", position: [0, 1.4, 0], intensity: 30, color: "#a070ff", distance: 14, decay: 2, shadow: false }).runtime({ id: "pl-low", mutable: true }))
  .add(effects.fog({ color: FOG, density: 0.022 }))
  .add(effects.bloom({ intensity: 1.25, threshold: 0.55, radius: 0.75 }))
  .add(primitives.plane({ name: "ground", size: [160, 1, 160], material: material.pbr({ color: "#2b2535", roughness: 1 }) }))
  .add(instances.cylinder({ name: "platform", transforms: platT, colors: platC, material: stone, params: { radialSegments: 40 } }))
  .add(instances.box({ name: "slabs", transforms: slabT, colors: slabC, material: stone }))
  .add(instances.box({ name: "ring", transforms: ringT, colors: ringC, material: stone }))
  .add(instances.box({ name: "runes-c", transforms: runesCyan, material: glowMat("#9ff4ff", "#2fe0ff", 3) }))
  .add(instances.box({ name: "runes-v", transforms: runesViolet, material: glowMat("#c9a8ff", "#8a4bff", 3) }))
  .add(instances.box({ name: "plat-runes-c", transforms: platRunesC, material: glowMat("#9ff4ff", "#2fe0ff", 2.5) }))
  .add(instances.box({ name: "plat-runes-v", transforms: platRunesV, material: glowMat("#c9a8ff", "#8a4bff", 2.5) }))
  .add(instances.cylinder({ name: "pillars", transforms: pillarT, colors: pillarC, material: stone, params: { radialSegments: 10 } }))
  .add(instances.cylinder({ name: "fallen", transforms: fallenT, colors: fallenC, material: stone, params: { radialSegments: 10 } }))
  .add(instances.box({ name: "blocks", transforms: blockT, colors: blockC, material: stone }))
  .add(primitives.plane({ name: "vortex", size: [DISC_R * 2, 1, DISC_R * 2], material: vortex, castShadow: false }).position(0, CY, 0).rotate(Math.PI / 2, 0, 0).runtime({ id: "vortex", mutable: true }))
  .add(primitives.sphere({ name: "halo", size: 11, material: halo, castShadow: false }).position(0, CY, 0).runtime({ id: "halo", mutable: true }))
  .add(instances.sphere({ name: "sp-c", transforms: spiralsC.map(spiralTransform), material: glowMat("#9ff4ff", "#35e8ff", 3.5) }).runtime({ id: "sp-c", mutable: true }))
  .add(instances.sphere({ name: "sp-v", transforms: spiralsV.map(spiralTransform), material: glowMat("#d2b8ff", "#9a5bff", 3.5) }).runtime({ id: "sp-v", mutable: true }))
  .add(instances.sphere({ name: "motes", transforms: motes.map((m) => moteTransform(m, 0)), material: glowMat("#e6fbff", "#8feaff", 3) }).runtime({ id: "motes", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
const pool = <T extends { age: number; life: number }>(arr: T[], dt: number, respawn: () => T): number => {
  let live = 0;
  for (let i = 0; i < arr.length; i += 1) {
    const p = arr[i]!;
    p.age += dt;
    if (p.age >= p.life) arr[i] = respawn();
    live += 1;
  }
  return live;
};

app.onFrame((f: { dt: number }) => {
  const dt = Math.min(f.dt, 0.05);
  t += dt;

  const n1 = pool(spiralsC, dt, () => newSpiral(0));
  const n2 = pool(spiralsV, dt, () => newSpiral(0));
  const n3 = pool(motes, dt, () => newMote(0));
  app.nodes.require("sp-c").setInstances?.(spiralsC.map(spiralTransform));
  app.nodes.require("sp-v").setInstances?.(spiralsV.map(spiralTransform));
  app.nodes.require("motes").setInstances?.(motes.map((m) => moteTransform(m, t)));

  app.nodes.require("vortex").setUniform?.("clk", t);
  app.nodes.require("halo").setUniform?.("clk", t);

  const pulse = 1 + 0.28 * Math.sin(t * 1.15) + 0.08 * Math.sin(t * 2.9);
  app.nodes.require("pl-front").setLight?.({ intensity: 70 * pulse });
  app.nodes.require("pl-back").setLight?.({ intensity: 60 * (2 - pulse) });
  app.nodes.require("pl-low").setLight?.({ intensity: 30 * pulse });

  window.__TASK_STATE__ = { portalActive: true, particleCount: n1 + n2 + n3, time: t };
});

await app.ready();
window.__TASK_STATE__ = { portalActive: true, particleCount: NS * 2 + motes.length, time: t };
window.__EVAL_READY__ = true;
