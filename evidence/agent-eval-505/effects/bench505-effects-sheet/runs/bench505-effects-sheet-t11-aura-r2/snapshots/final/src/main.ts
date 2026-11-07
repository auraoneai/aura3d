import {
  camera,
  createAuraApp,
  effects,
  environments,
  group,
  instances,
  lights,
  material,
  primitives,
  scene,
  sky,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

type Kids = Array<NonNullable<Parameters<typeof group>[1]>[number]>;

// ---------- helpers ----------
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const TAU = Math.PI * 2;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const hex2 = (v: number): string => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0");
const rgbHex = (r: number, g: number, b: number): string => `#${hex2(r)}${hex2(g)}${hex2(b)}`;

const CY = 4.2; // portal centre height
const DISC_R = 2.6;

// ---------- materials ----------
const stone = material.pbr({ color: "#6d6a75", roughness: 0.95, metallic: 0.05 });
const darkStone = material.pbr({ color: "#4a4853", roughness: 0.97, metallic: 0.04 });
const mossStone = material.pbr({ color: "#566055", roughness: 1 });
const ground = material.pbr({ color: "#1d1a27", roughness: 1 });
const white = material.pbr({ color: "#ffffff", roughness: 1 });
const runeGlow = material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 3 });
const innerRing = material.emissive({ color: "#bff6ff", emissive: "#3be6ff", emissiveIntensity: 3.5 });
const particleMat = material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 3.5 });

const GLSL_HEAD = `
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y); }
float fbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;
const GLOW_VERTEX = `out vec2 vP;
void main() {
  vP = position.xz * 2.0;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const discMat = material.custom({
  glsl: {
    vertex: GLOW_VERTEX,
    fragment: `in vec2 vP; out vec4 outColor;
${GLSL_HEAD}
void main() {
  vec2 p = vP;
  float r = length(p);
  float a = atan(p.y, p.x);
  float mask = 1.0 - smoothstep(0.9, 1.0, r);
  float ang = 3.2 * (1.0 - r) * (1.0 - r) + clk * 0.6;
  vec2 q = vec2(cos(ang) * p.x - sin(ang) * p.y, sin(ang) * p.x + cos(ang) * p.y);
  float n = fbm(q * 3.2 + vec2(0.0, clk * 0.15));
  float n2 = fbm(q * 6.0 - clk * 0.2 + 5.0);
  float arms = 0.5 + 0.5 * sin(a * 4.0 + log(r + 0.04) * 7.0 - clk * 2.2 + n * 2.5);
  arms = pow(arms, 1.5);
  float t = clamp(arms * 0.65 + n * 0.55 + (1.0 - r) * 0.2, 0.0, 1.0);
  vec3 violet = vec3(0.42, 0.08, 1.0);
  vec3 cyan = vec3(0.0, 0.85, 1.0);
  vec3 deep = vec3(0.06, 0.0, 0.25);
  vec3 col = mix(deep, violet, smoothstep(0.1, 0.5, t));
  col = mix(col, cyan, smoothstep(0.5, 0.95, t));
  col *= 0.7 + 1.6 * arms * (0.6 + 0.4 * n2);
  float core = exp(-r * r * 14.0);
  col += vec3(0.8, 0.95, 1.0) * core * (2.5 + pulse * 1.5);
  float rim = exp(-pow((r - 0.92) * 10.0, 2.0));
  col += vec3(0.2, 0.9, 1.0) * rim * (0.9 + 0.6 * pulse);
  col *= 0.85 + 0.3 * pulse;
  outColor = vec4(col * mask, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 0.5 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

const haloMat = (gain: number) =>
  material.custom({
    glsl: {
      vertex: GLOW_VERTEX,
      fragment: `in vec2 vP; out vec4 outColor;
void main() {
  vec2 p = vP;
  float r = length(p);
  float a = atan(p.y, p.x);
  float ringg = exp(-pow((r - 0.37) * 5.5, 2.0));
  float g = exp(-r * r * 14.0) * 0.55 + exp(-r * r * 45.0) * 0.5;
  float edge = 1.0 - smoothstep(0.55, 1.0, r);
  vec3 col = mix(vec3(0.38, 0.1, 1.0), vec3(0.1, 0.8, 1.0), 0.5 + 0.5 * sin(a + clk * 0.4));
  outColor = vec4(col * (ringg * 0.55 + g * 0.6) * (0.65 + 0.55 * pulse) * edge * ${gain.toFixed(3)}, 1.0);
}`
    },
    uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 0.5 } },
    transparent: true,
    depthWrite: false,
    side: "double",
    blending: "additive",
    fog: false,
    castShadow: false,
    receiveShadow: false
  });

const poolMat = material.custom({
  glsl: {
    vertex: GLOW_VERTEX,
    fragment: `in vec2 vP; out vec4 outColor;
void main() {
  vec2 p = vP;
  float r = length(p);
  float a = atan(p.y, p.x);
  float g = exp(-r * r * 9.0);
  float edge = 1.0 - smoothstep(0.6, 1.0, r);
  vec3 col = mix(vec3(0.4, 0.12, 1.0), vec3(0.1, 0.8, 1.0), 0.5 + 0.5 * sin(a * 2.0 + clk * 0.5));
  outColor = vec4(col * g * edge * (0.28 + 0.2 * pulse), 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 0.5 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive",
  fog: false,
  castShadow: false,
  receiveShadow: false
});

// ---------- world geometry ----------
const world: Kids = [];

// platform tiers + plinth
world.push(
  primitives.cylinder({ name: "platform-low", size: [17, 0.4, 17], material: darkStone, params: { radialSegments: 28 } }).position(0, 0.2, 0),
  primitives.cylinder({ name: "platform-up", size: [11.5, 0.75, 11.5], material: stone, params: { radialSegments: 28 } }).position(0, 0.375, 0),
  primitives.box({ name: "plinth", size: [2.8, 0.45, 1.6], material: darkStone }).position(0, 0.95, 0)
);

// ring (torus lies in the XY plane, facing +Z)
world.push(
  primitives.torus({ name: "ring", size: 7, params: { tube: 0.066 }, material: stone }).position(0, CY, 0),
  primitives.torus({ name: "ring-inner", size: 6.0, params: { tube: 0.012 }, material: innerRing, castShadow: false }).position(0, CY, 0),
  primitives.torus({ name: "ring-buttress", size: 7.6, params: { tube: 0.02, radialSegments: 24 }, material: darkStone }).position(0, CY, -0.15)
);

// runes
const runeT: AuraTransformSpec[] = [];
const runeC: string[] = [];
for (let i = 0; i < 24; i += 1) {
  const a = (i / 12) * Math.PI; // 12 around, front and back
  const front = i < 12;
  const ang = (i % 12) * (TAU / 12) + 0.26;
  void a;
  runeT.push({
    position: [Math.cos(ang) * 3.01, CY + Math.sin(ang) * 3.01, front ? 0.42 : -0.42],
    rotation: [0, 0, ang + Math.PI / 2],
    scale: [0.16, 0.38, 0.08]
  });
  runeC.push(i % 2 === 0 ? "#38e6ff" : "#a46bff");
}
world.push(
  instances.box({
    name: "runes",
    transforms: runeT,
    colors: runeC,
    material: runeGlow,
    instanceColorTarget: "both",
    castShadow: false
  })
);

// pillars
let pid = 0;
const pillar = (x: number, z: number, h: number, r: number, rot: number, broken: boolean, mat = stone): void => {
  const n = pid++;
  world.push(
    primitives.box({ name: `pl-base-${n}`, size: [r * 2.7, 0.35, r * 2.7], material: darkStone }).position(x, 0.175, z).rotate(0, rot, 0),
    primitives.cylinder({ name: `pl-shaft-${n}`, size: [r * 2, h, r * 2], material: mat, params: { radialSegments: 9 } }).position(x, 0.35 + h / 2, z).rotate(0, rot, 0)
  );
  if (!broken) {
    world.push(primitives.box({ name: `pl-cap-${n}`, size: [r * 2.6, 0.35, r * 2.6], material: darkStone }).position(x, 0.35 + h + 0.175, z).rotate(0, rot, 0));
  } else {
    world.push(
      primitives.box({ name: `pl-jag-${n}`, size: [r * 1.1, 0.5, r * 0.9], material: mat }).position(x + r * 0.35, 0.35 + h + 0.15, z).rotate(0.3, rot + 0.6, 0.25),
      primitives.cylinder({ name: `pl-drum-${n}`, size: [r * 2, 1.3, r * 2], material: mat, params: { radialSegments: 9 } })
        .position(x + Math.cos(rot) * r * 3.2, r, z + Math.sin(rot) * r * 3.2 + 0.5)
        .rotate(0.1, rot, Math.PI / 2)
    );
  }
};
pillar(-8.5, -2.5, 6.8, 0.65, 0.2, false);
pillar(8.8, -3.8, 4.4, 0.7, 0.9, true, mossStone);
pillar(-10.5, 5.5, 3.0, 0.62, 1.4, true);
pillar(10.5, 5.5, 5.8, 0.6, 0.4, false, mossStone);
pillar(-3.8, -9.5, 7.6, 0.7, 0.7, false);
pillar(5.2, -10.5, 3.6, 0.66, 1.9, true);
pillar(-13.5, -4.5, 2.2, 0.6, 0.3, true, mossStone);

// ground slabs and rubble
const slabT: AuraTransformSpec[] = [];
const slabC: string[] = [];
for (let i = 0; i < 16; i += 1) {
  const zz = 9 + i * 1.1;
  const xx = (rand() - 0.5) * 2.4;
  slabT.push({ position: [xx, 0.06, zz], rotation: [0, (rand() - 0.5) * 0.4, 0], scale: [1.5 + rand() * 0.6, 0.12, 0.9 + rand() * 0.5] });
  slabC.push(`hsl(260, 8%, ${22 + Math.floor(rand() * 12)}%)`);
}
world.push(instances.box({ name: "slabs", transforms: slabT, colors: slabC, material: white }));

const rubT: AuraTransformSpec[] = [];
const rubC: string[] = [];
for (let i = 0; i < 70; i += 1) {
  const a = rand() * TAU;
  const rr = 7.5 + rand() * 14;
  const s = 0.2 + rand() * 0.6;
  rubT.push({
    position: [Math.cos(a) * rr, s * 0.3, Math.sin(a) * rr - 2],
    rotation: [rand() * 3, rand() * 6, rand() * 3],
    scale: [s * (0.8 + rand()), s * (0.6 + rand() * 0.6), s * (0.8 + rand())]
  });
  rubC.push(`hsl(${250 + Math.floor(rand() * 30)}, 8%, ${18 + Math.floor(rand() * 18)}%)`);
}
world.push(instances.box({ name: "rubble", transforms: rubT, colors: rubC, material: white }));

// portal surfaces
world.push(
  primitives.plane({ name: "halo-back", size: [15, 1, 15], material: haloMat(1.0), castShadow: false, receiveShadow: false })
    .position(0, CY, -0.45).rotate(Math.PI / 2, 0, 0).runtime({ id: "halo-back", mutable: true }),
  primitives.plane({ name: "disc", size: [DISC_R * 2, 1, DISC_R * 2], material: discMat, castShadow: false, receiveShadow: false })
    .position(0, CY, 0).rotate(Math.PI / 2, 0, 0).runtime({ id: "disc", mutable: true }),
  primitives.plane({ name: "halo-front", size: [13, 1, 13], material: haloMat(0.45), castShadow: false, receiveShadow: false })
    .position(0, CY, 0.7).rotate(Math.PI / 2, 0, 0).runtime({ id: "halo-front", mutable: true }),
  primitives.plane({ name: "pool", size: [13, 1, 13], material: poolMat, castShadow: false, receiveShadow: false })
    .position(0, 0.78, 0.8).runtime({ id: "pool", mutable: true })
);

// portal lights (pulsing)
world.push(
  lights.point({ name: "light-front", position: [0, CY - 0.2, 3.2], intensity: 40, distance: 30, decay: 2, color: "#35dcff" }).runtime({ id: "light-front", mutable: true }),
  lights.point({ name: "light-back", position: [0, CY + 0.4, -3.4], intensity: 30, distance: 26, decay: 2, color: "#8a4dff" }).runtime({ id: "light-back", mutable: true }),
  lights.point({ name: "light-low", position: [0, 1.6, 2.2], intensity: 24, distance: 20, decay: 2, color: "#6a6dff" }).runtime({ id: "light-low", mutable: true })
);

// ---------- particles ----------
const SPIRAL_N = 170;
const MOTE_N = 80;

interface Spiral { th: number; rho: number; z0: number; sp: number; size: number; mixc: number; age: number }
interface Mote { x: number; z: number; y: number; vy: number; ph: number; life: number; age: number; size: number; mixc: number }

const newSpiral = (initial: boolean): Spiral => ({
  th: rand() * TAU,
  rho: initial ? 0.6 + rand() * 4.0 : 4.2 + rand() * 0.5,
  z0: (rand() - 0.5) * 6,
  sp: 0.35 + rand() * 0.45,
  size: 0.07 + rand() * 0.09,
  mixc: rand(),
  age: initial ? 5 : 0
});
const newMote = (initial: boolean): Mote => {
  const a = rand() * TAU, rr = 5.2 * Math.sqrt(rand());
  const life = 5 + rand() * 4;
  return {
    x: Math.cos(a) * rr, z: Math.sin(a) * rr, y: 0.8, vy: 0.35 + rand() * 0.55,
    ph: rand() * TAU, life, age: initial ? rand() * life : 0, size: 0.05 + rand() * 0.06, mixc: rand()
  };
};
const spirals: Spiral[] = Array.from({ length: SPIRAL_N }, () => newSpiral(true));
const motes: Mote[] = Array.from({ length: MOTE_N }, () => newMote(true));

const CYAN: [number, number, number] = [90, 235, 255];
const VIOLET: [number, number, number] = [170, 110, 255];
const tint = (m: number, f: number): string =>
  rgbHex((CYAN[0] + (VIOLET[0] - CYAN[0]) * m) * f, (CYAN[1] + (VIOLET[1] - CYAN[1]) * m) * f, (CYAN[2] + (VIOLET[2] - CYAN[2]) * m) * f);

const spiralT: AuraTransformSpec[] = spirals.map(() => ({ position: [0, CY, 0], scale: [0.001, 0.001, 0.001] }));
const moteT: AuraTransformSpec[] = motes.map(() => ({ position: [0, 1, 0], scale: [0.001, 0.001, 0.001] }));
const spiralC: string[] = spirals.map(() => "#000000");
const moteC: string[] = motes.map(() => "#000000");

world.push(
  instances.sphere({
    name: "spiral-particles", transforms: spiralT, colors: spiralC, material: particleMat, instanceColorTarget: "both",
    params: { widthSegments: 8, heightSegments: 6 }, castShadow: false, receiveShadow: false
  }).runtime({ id: "spiral-particles", mutable: true }),
  instances.sphere({
    name: "mote-particles", transforms: moteT, colors: moteC, material: particleMat, instanceColorTarget: "both",
    params: { widthSegments: 8, heightSegments: 6 }, castShadow: false, receiveShadow: false
  }).runtime({ id: "mote-particles", mutable: true })
);

// ---------- scene ----------
const sc = scene({ background: "#0a0714" })
  .camera(camera.perspective({ position: [0, 4.8, 17.5], target: [0, 3.7, 0], fov: 42, near: 0.5, far: 300 }))
  .add(sky.gradient({ zenith: "#06061a", horizon: "#4a2552", ground: "#120d1c" }))
  .add(environments.neutral({ intensity: 0.18, background: false }))
  .add(lights.hemisphere({ skyColor: "#4a4fa8", groundColor: "#1a1020", intensity: 0.55 }))
  .add(lights.directional({ name: "dusk", position: [-26, 9, -18], target: [0, 1, 0], intensity: 1.4, color: "#ff8a5c", shadow: true }))
  .add(lights.directional({ name: "fill", position: [18, 10, 20], target: [0, 2, 0], intensity: 0.35, color: "#5a6aff" }))
  .add(effects.fog({ color: "#241838", density: 0.016 }))
  .add(effects.bloom({ intensity: 1.0, threshold: 0.7, radius: 0.75 }))
  .add(effects.vignette({ name: "vignette", intensity: 0.5, smoothness: 2, roundness: 1 }))
  .add(primitives.plane({ name: "ground", size: [240, 1, 240], material: ground }))
  .add(group("world", world).runtime({ id: "world", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

let t = 0;
let live = SPIRAL_N + MOTE_N;
window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: 0 };

app.onFrame((f) => {
  const dt = Math.min(0.05, Math.max(0, f.dt));
  t += dt;
  const pulse = 0.5 + 0.5 * Math.sin(t * 0.9);

  // shader + lights
  for (const id of ["disc", "halo-back", "halo-front", "pool"]) {
    const n = app.nodes.require(id);
    n.setUniform?.("clk", t);
    n.setUniform?.("pulse", pulse);
  }
  app.nodes.require("light-front").setLight?.({ intensity: 30 + 22 * pulse });
  app.nodes.require("light-back").setLight?.({ intensity: 22 + 18 * (1 - pulse) });
  app.nodes.require("light-low").setLight?.({ intensity: 16 + 14 * pulse });

  // camera sway: the world turns slowly about the portal axis
  app.nodes.require("world").setRotation(0, 0.42 * Math.sin(t * 0.21), 0);

  // spiral particles
  let count = 0;
  for (let i = 0; i < SPIRAL_N; i += 1) {
    const p = spirals[i]!;
    p.age += dt;
    p.th -= (0.8 + 2.2 / (p.rho + 0.7)) * dt;
    p.rho -= p.sp * (0.55 + 1.2 / (p.rho + 1)) * dt;
    if (p.rho < 0.35) spirals[i] = newSpiral(false);
    const q = spirals[i]!;
    const k = clamp01(q.rho / 4.6);
    const f1 = clamp01(q.age * 1.5) * clamp01((q.rho - 0.35) / 1.2);
    const wob = Math.sin(t * 2 + i) * 0.05;
    const s = q.size * (0.35 + 0.65 * f1) * (0.7 + 0.5 * k);
    spiralT[i] = {
      position: [Math.cos(q.th) * q.rho, CY + Math.sin(q.th) * q.rho * 0.75, q.z0 * k * k + wob],
      scale: [s, s, s]
    };
    spiralC[i] = tint(q.mixc, 0.25 + 0.75 * f1);
    if (f1 > 0.01) count += 1;
  }
  app.nodes.require("spiral-particles").setInstances(spiralT, spiralC);

  // rising motes
  for (let i = 0; i < MOTE_N; i += 1) {
    motes[i]!.age += dt;
    if (motes[i]!.age >= motes[i]!.life) motes[i] = newMote(false);
    const m = motes[i]!;
    const u = m.age / m.life;
    const fade = clamp01(m.age / 0.6) * (1 - u) * (1 - u);
    const y = m.y + m.vy * m.age;
    const s = m.size * (0.2 + 0.8 * fade);
    moteT[i] = {
      position: [m.x + Math.sin(m.age * 0.9 + m.ph) * 0.35, y, m.z + Math.cos(m.age * 0.7 + m.ph) * 0.35],
      scale: [s, s, s]
    };
    moteC[i] = tint(m.mixc * 0.6, 0.15 + 0.85 * fade);
    if (fade > 0.01) count += 1;
  }
  app.nodes.require("mote-particles").setInstances(moteT, moteC);

  live = count;
  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
});

await app.ready();
window.__EVAL_READY__ = true;
