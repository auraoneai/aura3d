import {
  createAuraApp,
  effects,
  environments,
  lights,
  looks,
  material,
  primitives,
  scene,
  sky,
  camera,
  type AuraTransformSpec
} from "@aura3d/engine";
import { portalModel, portalOutput } from "./three-bridge/portal.bridge";

// ---------------------------------------------------------------- constants
const CY = 3.05; // portal centre height (matches recipes/portal.mjs: 0.6 + ringRadius + 0.15)
const DISC_R = 1.95; // inner radius of the stone ring
const PLATFORM_Y = 0.62;

const CYAN: [number, number, number] = [0.15, 0.9, 1.0];
const VIOLET: [number, number, number] = [0.6, 0.33, 1.0];
const WHITE: [number, number, number] = [0.85, 0.95, 1.0];

// ---------------------------------------------------------------- shaders
const vortex = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
void main() {
  vec2 p = vP * 2.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float t = clk;
  float twist = (1.0 - r) * 5.0 + 1.2 / (r + 0.35);
  float ang = a + twist - t * 0.85;
  float warp = sin(r * 9.0 - t * 2.0) * 0.7 + sin(a * 2.0 + t * 0.6) * 0.4;
  float arms = 0.5 + 0.5 * sin(ang * 3.0 + warp);
  float fine = 0.5 + 0.5 * sin(ang * 6.0 - r * 16.0 + t * 1.7);
  float swirl = clamp(arms * 0.75 + fine * 0.35, 0.0, 1.0);
  float hue = 0.5 + 0.5 * sin(ang * 1.5 + r * 3.0 - t * 0.5);
  vec3 cyan = vec3(0.05, 0.85, 1.0);
  vec3 violet = vec3(0.55, 0.15, 1.0);
  vec3 deep = vec3(0.02, 0.0, 0.10);
  vec3 col = mix(deep, mix(violet, cyan, hue), pow(swirl, 1.4));
  col *= 0.8 + 1.4 * pow(arms, 3.0);
  float core = exp(-r * r * 22.0);
  float halo = exp(-r * r * 4.5);
  col += vec3(0.7, 0.9, 1.0) * core * (2.6 + 0.5 * sin(t * 1.3));
  col += mix(violet, cyan, 0.5) * halo * 0.7;
  float rim = smoothstep(0.72, 1.0, r);
  col += cyan * rim * rim * (1.6 + 0.4 * sin(t * 2.0 + a * 4.0));
  float edge = 1.0 - smoothstep(0.985, 1.0, r);
  outColor = vec4(col * edge, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  side: "double"
});

const halo = material.custom({
  glsl: {
    vertex: `out vec2 vP;
void main() {
  vP = position.xy;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec2 vP; out vec4 outColor;
void main() {
  float r = length(vP) * 2.0;
  float a = atan(vP.y, vP.x);
  float f = exp(-r * 3.2) * (1.0 - smoothstep(0.7, 1.0, r));
  float g = exp(-r * 9.0);
  float m = 0.5 + 0.5 * sin(a * 2.0 + clk * 0.4);
  vec3 col = mix(vec3(0.45, 0.2, 1.0), vec3(0.1, 0.8, 1.0), m);
  float k = (0.55 + 0.25 * sin(clk * 0.9)) ;
  vec3 c = col * f * k * 1.1 + vec3(0.5, 0.8, 1.0) * g * 0.5;
  outColor = vec4(c, clamp(f * k + g * 0.4, 0.0, 1.0));
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "double"
});

// ---------------------------------------------------------------- particles
// Small deterministic PRNG so the dust layout is stable run to run.
let seed = 20240611;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};

interface Spiral { u0: number; period: number; theta0: number; turns: number; side: number; hue: number; size: number; r0: number; }
interface Mote { u0: number; period: number; x: number; z: number; sway: number; phase: number; rise: number; hue: number; size: number; }

const SPIRAL_N = 220;
const MOTE_N = 90;
const spirals: Spiral[] = Array.from({ length: SPIRAL_N }, () => ({
  u0: rnd(),
  period: 4.5 + rnd() * 3.5,
  theta0: rnd() * Math.PI * 2,
  turns: 1.1 + rnd() * 0.9,
  side: rnd() < 0.72 ? 1 : -1,
  hue: rnd(),
  size: 0.6 + rnd() * 0.9,
  r0: 2.1 + rnd() * 0.75
}));
const motes: Mote[] = Array.from({ length: MOTE_N }, () => {
  const a = rnd() * Math.PI * 2;
  const r = Math.sqrt(rnd()) * 3.7;
  return {
    u0: rnd(),
    period: 6 + rnd() * 5,
    x: Math.cos(a) * r,
    z: Math.sin(a) * r,
    sway: 0.15 + rnd() * 0.35,
    phase: rnd() * 6.28,
    rise: 3.2 + rnd() * 2.6,
    hue: rnd(),
    size: 0.5 + rnd() * 0.8
  };
});

const hex = (c: [number, number, number], k: number): string => {
  const f = (v: number): string => Math.max(0, Math.min(255, Math.round(v * k * 255))).toString(16).padStart(2, "0");
  return `#${f(c[0])}${f(c[1])}${f(c[2])}`;
};
const mix3 = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t
];
const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: 0.0001 };

let spiralTransforms: AuraTransformSpec[] = spirals.map(() => HIDDEN);
let spiralColors: string[] = spirals.map(() => "#000000");
let moteTransforms: AuraTransformSpec[] = motes.map(() => HIDDEN);
let moteColors: string[] = motes.map(() => "#000000");

const glowMat = (intensity: number) =>
  material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: intensity, roughness: 1, metallic: 0 });

function updateParticles(time: number): number {
  let live = 0;
  for (let i = 0; i < SPIRAL_N; i += 1) {
    const s = spirals[i]!;
    const u = (time / s.period + s.u0) % 1;
    const e = 1 - Math.pow(1 - u, 1.6); // fast at the start, converging
    const r = s.r0 * (1 - e) + 0.12;
    const theta = s.theta0 + s.turns * Math.PI * 2 * Math.pow(u, 0.8) + time * 0.3;
    const z = s.side * (3.0 * Math.pow(1 - u, 1.4) + 0.12);
    const fade = Math.sin(Math.PI * Math.min(1, u * 1.15)) * Math.min(1, (1 - u) * 4);
    const x = Math.cos(theta) * r * 1.15;
    const y = CY + Math.sin(theta) * r;
    const scale = 0.05 * s.size * (0.4 + fade);
    const alive = fade > 0.02;
    if (alive) live += 1;
    spiralTransforms[i] = alive ? { position: [x, Math.max(y, PLATFORM_Y + 0.15), z], scale } : HIDDEN;
    const c = mix3(s.hue < 0.5 ? CYAN : VIOLET, WHITE, Math.pow(u, 3) * 0.7);
    spiralColors[i] = hex(c, Math.min(1, fade * 1.1));
  }
  for (let i = 0; i < MOTE_N; i += 1) {
    const m = motes[i]!;
    const u = (time / m.period + m.u0) % 1;
    const y = PLATFORM_Y + 0.05 + m.rise * Math.pow(u, 0.9);
    const x = m.x * (1 - 0.25 * u) + Math.sin(time * 0.7 + m.phase) * m.sway;
    const z = m.z * (1 - 0.25 * u) + Math.cos(time * 0.5 + m.phase * 1.3) * m.sway;
    const fade = Math.min(1, u * 8) * Math.pow(1 - u, 1.3);
    const alive = fade > 0.02;
    if (alive) live += 1;
    moteTransforms[i] = alive ? { position: [x, y, z], scale: 0.04 * m.size * (0.5 + fade) } : HIDDEN;
    const c = m.hue < 0.45 ? CYAN : m.hue < 0.85 ? VIOLET : WHITE;
    moteColors[i] = hex(c, Math.min(1, fade * 1.2));
  }
  return live;
}
updateParticles(0);

// ---------------------------------------------------------------- scene
const app = createAuraApp("#app", {
  scene: scene({ background: "#0a0a1c" })
    .add(sky.gradient({ zenith: "#070818", horizon: "#4b2858", ground: "#0c0a16", exponent: 0.6, horizonGlow: 0.6, name: "dusk-sky" }))
    .add(environments.neutral({ intensity: 0.22, background: false }))
    .add(portalModel().runtime({ id: "ruin" }))
    // dusk lighting
    .add(lights.hemisphere({ name: "dusk-hemi", skyColor: "#4b4f9a", groundColor: "#1d1226", intensity: 0.45 }))
    .add(lights.key({ name: "moon", target: [0, 1.5, 0], position: [-7, 9, 6], color: "#8f8cff", intensity: 1.1, shadow: true }))
    .add(lights.directional({ name: "afterglow", position: [8, 3, -8], target: [0, 2, 0], color: "#ff8a60", intensity: 1.4 }))
    // portal lights (pulsed in onFrame)
    .add(lights.point({ name: "portal-cyan", position: [0, CY, 2.6], color: "#2fe0ff", intensity: 40, distance: 16, decay: 1.6 }).runtime({ id: "lightCyan", mutable: true }))
    .add(lights.point({ name: "portal-violet", position: [0, CY + 0.2, -2.6], color: "#9a5cff", intensity: 40, distance: 16, decay: 1.6 }).runtime({ id: "lightViolet", mutable: true }))
    .add(lights.point({ name: "portal-floor", position: [0, 1.2, 1.4], color: "#6a8cff", intensity: 18, distance: 9, decay: 1.6 }).runtime({ id: "lightFloor", mutable: true }))
    // the energy disc and its glow
    .add(primitives.circle({ name: "halo", size: [10, 10, 1], material: halo, position: [0, CY, -0.12] }).runtime({ id: "halo", mutable: true }))
    .add(primitives.circle({ name: "vortex", size: [DISC_R * 2, DISC_R * 2, 1], material: vortex, position: [0, CY, 0.02] }).runtime({ id: "vortex", mutable: true }))
    // particles
    .add(
      primitives.sphere({
        name: "spiral",
        size: 1,
        material: glowMat(4.5),
        instances: spiralTransforms,
        instanceColors: spiralColors,
        castShadow: false,
        receiveShadow: false,
        frustumCulled: false
      }).runtime({ id: "spiral", mutable: true })
    )
    .add(
      primitives.sphere({
        name: "motes",
        size: 1,
        material: glowMat(4),
        instances: moteTransforms,
        instanceColors: moteColors,
        castShadow: false,
        receiveShadow: false,
        frustumCulled: false
      }).runtime({ id: "motes", mutable: true })
    )
    // haze and post
    .add(looks.fogForExtent({ extent: 34, color: "#2b1d46", haze: 0.55 }))
    .add(effects.bloom({ intensity: 1.0, threshold: 0.75, scatter: 0.75, quality: "balanced" }))
    .add(effects.vignette({ intensity: 0.5 }))
    .camera(camera.perspective({ position: [0, 2.8, 12], target: [0, 2.9, 0], fov: 42 })),
  output: portalOutput
});

declare global {
  interface Window {
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
    __EVAL_READY__?: boolean;
  }
}

window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL_N + MOTE_N, time: 0 };

type LightHandle = { setLight?: (patch: { intensity?: number }) => unknown };

let readySet = false;
app.onFrame((f) => {
  const t = f.time;
  const live = updateParticles(t);

  const vtx = app.nodes.require("vortex");
  vtx.setUniform?.("clk", t);
  app.nodes.require("halo").setUniform?.("clk", t);

  app.nodes.require("spiral").setInstances(spiralTransforms, spiralColors);
  app.nodes.require("motes").setInstances(moteTransforms, moteColors);

  // slow pulse of the coloured light cast on the ruin
  const p = 0.5 + 0.5 * Math.sin(t * 0.9);
  const q = 0.5 + 0.5 * Math.sin(t * 0.9 + 2.1);
  (app.nodes.require("lightCyan") as unknown as LightHandle).setLight?.({ intensity: 26 + 30 * p });
  (app.nodes.require("lightViolet") as unknown as LightHandle).setLight?.({ intensity: 26 + 30 * q });
  (app.nodes.require("lightFloor") as unknown as LightHandle).setLight?.({ intensity: 10 + 14 * (0.5 * p + 0.5 * q) });

  // gentle orbit sway
  const az = 0.42 * Math.sin(t * 0.13);
  const dist = 12.2 + 0.6 * Math.sin(t * 0.09);
  const camY = 2.7 + 0.45 * Math.sin(t * 0.11 + 1);
  app.camera?.setPose({
    position: [Math.sin(az) * dist, camY, Math.cos(az) * dist],
    target: [0, 2.85, 0]
  });

  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
  if (!readySet) {
    readySet = true;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
