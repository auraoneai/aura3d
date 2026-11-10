import {
  camera,
  createAuraApp,
  effects,
  environments,
  lights,
  looks,
  material,
  primitives,
  scene,
  sky,
  instances,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

// ---------- deterministic random ----------
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20240611);
const range = (a: number, b: number): number => a + (b - a) * rnd();

// ---------- layout ----------
const PORTAL_Y = 2.85;
const RING_R = 2.2;
const PLATFORM_TOP = 0.5;

// ---------- portal vortex shader ----------
const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vUv; out vec4 outColor;
void main() {
  vec2 p = (vUv - 0.5) * 2.0;
  float r = length(p);
  if (r > 1.0) discard;
  float a = atan(p.y, p.x + 0.00001);
  float lr = log(r + 0.07);
  float arms1 = 0.5 + 0.5 * sin(a * 3.0 + lr * 5.5 - clk * 1.6);
  float arms2 = 0.5 + 0.5 * sin(a * 5.0 - lr * 8.0 - clk * 2.3 + 1.7);
  float swirl = 0.5 + 0.5 * sin(a * 2.0 + r * 9.0 + clk * 0.9 + sin(lr * 4.0 - clk) * 1.4);
  float pat = clamp(arms1 * 0.6 + arms2 * 0.4, 0.0, 1.0);
  vec3 violet = vec3(0.34, 0.08, 0.95);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 col = mix(violet, cyan, pat);
  col *= 0.35 + 0.7 * swirl;
  col = mix(col * col * 1.6, col, pat);
  float core = exp(-r * 9.0);
  col += vec3(0.8, 0.95, 1.0) * core * (1.5 + 0.4 * pulse);
  col += vec3(0.3, 0.7, 1.0) * smoothstep(0.88, 1.0, r) * (0.5 + 0.3 * pulse);
  col *= 0.8 + 0.2 * pulse;
  outColor = vec4(col, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, pulse: { type: "f32", value: 0 } },
  side: "double",
  fog: false
});

// ---------- materials ----------
const stoneColors = ["#6f6a6e", "#5f5b63", "#7a7470", "#58545c", "#68646a"];
const stone = (i: number) => material.pbr({ color: stoneColors[i % stoneColors.length]!, roughness: 0.96, metallic: 0.02 });
const darkStone = material.pbr({ color: "#3d3a44", roughness: 0.97 });
const runeMat = material.pbr({ color: "#7be8ff", unlit: true });

// ---------- scene ----------
let sc = scene({ background: "#120c24" })
  .add(sky.gradient({
    zenith: "#0d0a22",
    horizon: "#6a3a78",
    ground: "#120c1c",
    horizonGlow: 0.6,
    name: "dusk-sky"
  }))
  .add(environments.neutral({ intensity: 0.12, background: false }))
  .add(lights.hemisphere({ skyColor: "#4a3a8a", intensity: 0.2 }))
  .add(lights.key({ position: [-9, 6, -7], target: [0, 1.5, 0], intensity: 3.2, color: "#ff9a74" }))
  .add(lights.point({ name: "glowFront", position: [0, PORTAL_Y, 3.2], intensity: 14 + 0, distance: 18, decay: 1.6, color: "#35d9ff" }).runtime({ id: "glowFront", mutable: true }))
  .add(lights.point({ name: "glowBack", position: [0, PORTAL_Y, -3.2], intensity: 30, distance: 16, decay: 1.6, color: "#8a4dff" }).runtime({ id: "glowBack", mutable: true }))
  .add(lights.point({ name: "glowLow", position: [0, 1.4, 0.8], intensity: 18, distance: 10, decay: 1.6, color: "#6a7dff" }).runtime({ id: "glowLow", mutable: true }))
  .add(looks.fogForExtent({ extent: 42, color: "#2a1a44", haze: 0.55 }))
  .add(primitives.plane({ name: "ground", size: [90, 1, 90], material: material.pbr({ color: "#1c1826", roughness: 1 }) }));

// platform: two stepped discs
sc = sc
  .add(primitives.cylinder({ name: "platformBase", size: [12.6, 0.3, 12.6], material: darkStone }).position(0, 0.15, 0))
  .add(primitives.cylinder({ name: "platform", size: [10, PLATFORM_TOP - 0.2, 10], material: material.pbr({ color: "#5a5660", roughness: 0.9 }) }).position(0, 0.2 + (PLATFORM_TOP - 0.2) / 2, 0));

// ring of weathered stone blocks
const BLOCKS = 22;
for (let i = 0; i < BLOCKS; i += 1) {
  const a = (i / BLOCKS) * Math.PI * 2;
  const chord = 2 * RING_R * Math.tan(Math.PI / BLOCKS) + 0.06;
  const thick = range(0.46, 0.56);
  const depth = range(0.62, 0.78);
  sc = sc.add(
    primitives.box({ name: `ringBlock${i}`, size: [chord, thick, depth], material: stone(i) })
      .position(Math.cos(a) * RING_R, PORTAL_Y + Math.sin(a) * RING_R, 0)
      .rotation(0, 0, a + Math.PI / 2 + range(-0.015, 0.015))
  );
  if (i % 2 === 0) {
    // glowing rune slab on the front and back faces
    for (const side of [1, -1]) {
      sc = sc.add(
        primitives.box({ name: `rune${i}_${side}`, size: [chord * 0.35, thick * 0.25, 0.04], material: runeMat })
          .position(Math.cos(a) * RING_R, PORTAL_Y + Math.sin(a) * RING_R, side * (depth / 2 + 0.01))
          .rotation(0, 0, a + Math.PI / 2)
      );
    }
  }
}
// keystone caps and base feet
sc = sc
  .add(primitives.box({ name: "footL", size: [1.3, 0.7, 1.1], material: darkStone }).position(-1.25, PLATFORM_TOP + 0.2, 0).rotation(0, 0, 0.05))
  .add(primitives.box({ name: "footR", size: [1.3, 0.7, 1.1], material: darkStone }).position(1.25, PLATFORM_TOP + 0.2, 0).rotation(0, 0, -0.05))
  .add(primitives.box({ name: "keystone", size: [0.8, 0.5, 0.95], material: darkStone }).position(0, PORTAL_Y + RING_R + 0.38, 0));

// vortex disc (plane rotated to face +Z)
sc = sc.add(
  primitives.plane({ name: "vortex", size: [4.2, 1, 4.2], material: vortex })
    .position(0, PORTAL_Y, 0)
    .rotation(Math.PI / 2, 0, 0)
    .runtime({ id: "vortex", mutable: true })
);

// ruined pillars
const pillars: ReadonlyArray<readonly [number, number, number, number, number]> = [
  // x, z, height, radius, tilt
  [-6.4, -2.2, 5.2, 0.62, 0],
  [6.6, -1.4, 3.4, 0.6, 0.0],
  [-5.2, 4.6, 2.4, 0.58, 0.0],
  [6.0, 5.0, 4.6, 0.64, 0],
  [-3.2, -6.8, 3.0, 0.56, 0],
  [3.6, -7.4, 5.8, 0.66, 0]
];
pillars.forEach(([x, z, h, rad], i) => {
  sc = sc
    .add(primitives.cylinder({ name: `pillar${i}`, size: [rad * 2, h, rad * 2], material: stone(i + 1) }).position(x, h / 2, z))
    .add(primitives.box({ name: `pillarBase${i}`, size: [rad * 2.5, 0.35, rad * 2.5], material: darkStone }).position(x, 0.17, z))
    .add(primitives.box({ name: `pillarCap${i}`, size: [rad * 2.3, 0.3, rad * 2.3], material: stone(i + 3) }).position(x, h + 0.1, z).rotation(range(-0.08, 0.08), range(0, 1), range(-0.1, 0.1)));
});
// fallen drum and rubble
sc = sc
  .add(primitives.cylinder({ name: "fallenDrum", size: [1.2, 2.8, 1.2], material: stone(2) }).position(-3.8, 0.6, 7.2).rotation(0.0, 0.5, Math.PI / 2))
  .add(primitives.cylinder({ name: "fallenDrum2", size: [1.1, 2.2, 1.1], material: stone(4) }).position(5.0, 0.55, -4.6).rotation(0.1, -0.6, Math.PI / 2 - 0.1));
for (let i = 0; i < 16; i += 1) {
  const ang = range(0, Math.PI * 2);
  const rad = range(4.2, 10);
  const s = range(0.25, 0.8);
  sc = sc.add(
    primitives.box({ name: `rubble${i}`, size: [s * range(0.8, 1.6), s * range(0.5, 1), s * range(0.8, 1.4)], material: stone(i) })
      .position(Math.cos(ang) * rad, rad < 5.3 ? PLATFORM_TOP + s * 0.2 : s * 0.3, Math.sin(ang) * rad)
      .rotation(range(-0.4, 0.4), range(0, 3), range(-0.4, 0.4))
  );
}

// ---------- particles (instanced emissive spheres) ----------
const SPIRAL_N = 260;
const MOTE_N = 70;
const unit = (): AuraTransformSpec => ({ position: [0, -50, 0], scale: 0.0001 });
const glowMat = material.pbr({ color: "#ffffff", unlit: true, fog: false });
sc = sc
  .add(instances.sphere({ name: "spiralParticles", transforms: Array.from({ length: SPIRAL_N }, unit), colors: Array.from({ length: SPIRAL_N }, () => "#ffffff"), material: glowMat, castShadow: false, receiveShadow: false }).runtime({ id: "spiral", mutable: true }))
  .add(instances.sphere({ name: "moteParticles", transforms: Array.from({ length: MOTE_N }, unit), colors: Array.from({ length: MOTE_N }, () => "#ffffff"), material: glowMat, castShadow: false, receiveShadow: false }).runtime({ id: "motes", mutable: true }));

sc = sc
  .add(effects.bloom({ intensity: 1.0, threshold: 0.7, radius: 0.85 }))
  .camera(camera.perspective({ position: [0, 3.6, 11.5], target: [0, 2.5, 0], fov: 42 }));

const app = createAuraApp("#app", { scene: sc });

// ---------- particle state ----------
interface Spiral { theta: number; r: number; r0: number; z0: number; speed: number; size: number; hue: number; }
const spirals: Spiral[] = [];
const spawnSpiral = (p: Spiral, initial: boolean): void => {
  p.r0 = range(3.0, 4.6);
  p.r = initial ? range(0.25, p.r0) : p.r0;
  p.theta = range(0, Math.PI * 2);
  p.z0 = range(-1.8, 1.8);
  p.speed = range(0.45, 0.95);
  p.size = range(0.045, 0.1);
  p.hue = rnd();
};
for (let i = 0; i < SPIRAL_N; i += 1) {
  const p: Spiral = { theta: 0, r: 0, r0: 1, z0: 0, speed: 0, size: 0, hue: 0 };
  spawnSpiral(p, true);
  spirals.push(p);
}
interface Mote { x: number; y: number; z: number; vy: number; life: number; age: number; size: number; sway: number; ph: number; hue: number; }
const motes: Mote[] = [];
const spawnMote = (m: Mote, initial: boolean): void => {
  const ang = range(0, Math.PI * 2);
  const rad = Math.sqrt(rnd()) * 4.6;
  m.x = Math.cos(ang) * rad;
  m.z = Math.sin(ang) * rad;
  m.y = PLATFORM_TOP + 0.05;
  m.vy = range(0.25, 0.7);
  m.life = range(4, 8);
  m.age = initial ? range(0, m.life) : 0;
  m.y += m.vy * m.age;
  m.size = range(0.03, 0.07);
  m.sway = range(0.1, 0.35);
  m.ph = range(0, 6.28);
  m.hue = rnd();
};
for (let i = 0; i < MOTE_N; i += 1) {
  const m: Mote = { x: 0, y: 0, z: 0, vy: 0, life: 1, age: 0, size: 0.05, sway: 0.2, ph: 0, hue: 0 };
  spawnMote(m, true);
  motes.push(m);
}

const spiralM = new Float32Array(SPIRAL_N * 16);
const spiralC = new Float32Array(SPIRAL_N * 4);
const moteM = new Float32Array(MOTE_N * 16);
const moteC = new Float32Array(MOTE_N * 4);

const writeInstance = (m: Float32Array, c: Float32Array, i: number, x: number, y: number, z: number, s: number, r: number, g: number, b: number): void => {
  const o = i * 16;
  m[o] = s; m[o + 1] = 0; m[o + 2] = 0; m[o + 3] = 0;
  m[o + 4] = 0; m[o + 5] = s; m[o + 6] = 0; m[o + 7] = 0;
  m[o + 8] = 0; m[o + 9] = 0; m[o + 10] = s; m[o + 11] = 0;
  m[o + 12] = x; m[o + 13] = y; m[o + 14] = z; m[o + 15] = 1;
  c[i * 4] = r; c[i * 4 + 1] = g; c[i * 4 + 2] = b; c[i * 4 + 3] = 1;
};

let ready = false;
app.onFrame((f) => {
  const t = f.time;
  const dt = Math.min(f.dt, 0.05);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.15);

  // vortex + lights
  const vh = app.nodes.require("vortex");
  vh.setUniform?.("clk", t);
  vh.setUniform?.("pulse", pulse);
  app.nodes.require("glowFront").setLight?.({ intensity: 12 + 18 * pulse });
  app.nodes.require("glowBack").setLight?.({ intensity: 8 + 12 * (1 - pulse) });
  app.nodes.require("glowLow").setLight?.({ intensity: 3 + 6 * pulse });

  // spiral particles flowing into the portal
  for (let i = 0; i < SPIRAL_N; i += 1) {
    const p = spirals[i]!;
    p.r -= p.speed * dt * (0.6 + 0.5 * (1 - p.r / 5));
    p.theta += dt * (0.9 + 2.6 / (p.r + 0.6));
    if (p.r < 0.18) spawnSpiral(p, false);
    const k = p.r / p.r0; // 1 at spawn -> 0 at core
    const x = Math.cos(p.theta) * p.r;
    const y = PORTAL_Y + Math.sin(p.theta) * p.r;
    const z = p.z0 * k * k;
    const fadeIn = Math.min(1, (1 - k) * 6);
    const fadeOut = Math.min(1, p.r / 0.5);
    const fade = fadeIn * fadeOut;
    const s = p.size * (0.4 + 0.8 * fade) * fade;
    const e = 0.9 + 0.7 * (1 - k);
    const cr = (0.1 + 0.65 * p.hue) * e;
    const cg = (0.9 - 0.7 * p.hue) * e;
    const cb = 1.0 * e;
    writeInstance(spiralM, spiralC, i, x, y, z, Math.max(s, 0.0001), cr, cg, cb);
  }
  // rising motes
  let live = SPIRAL_N;
  for (let i = 0; i < MOTE_N; i += 1) {
    const m = motes[i]!;
    m.age += dt;
    if (m.age >= m.life) spawnMote(m, false);
    m.y += m.vy * dt;
    const u = m.age / m.life;
    const fade = Math.min(1, u * 8) * (1 - u) * (1 - u * 0.3);
    const x = m.x + Math.sin(t * 0.7 + m.ph) * m.sway;
    const z = m.z + Math.cos(t * 0.6 + m.ph) * m.sway;
    const e = 1.1 * fade + 0.1;
    writeInstance(moteM, moteC, i, x, m.y, z, Math.max(m.size * fade, 0.0001), (0.5 + 0.4 * m.hue) * e, (0.7 - 0.3 * m.hue) * e, 1.0 * e);
  }
  app.nodes.require("spiral").setInstanceMatrices(spiralM, SPIRAL_N, spiralC);
  app.nodes.require("motes").setInstanceMatrices(moteM, MOTE_N, moteC);
  live += MOTE_N;

  // camera sway / slow orbit
  const az = 0.5 * Math.sin(t * 0.14);
  const dist = 11.5 + 0.6 * Math.sin(t * 0.09);
  const h = 3.4 + 0.5 * Math.sin(t * 0.11 + 1);
  app.camera?.setPose({
    position: [Math.sin(az) * dist * 0.95, h, Math.cos(az) * dist * 0.95],
    target: [0, 2.55, 0],
    fov: 42
  });

  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
  if (!ready) {
    ready = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
