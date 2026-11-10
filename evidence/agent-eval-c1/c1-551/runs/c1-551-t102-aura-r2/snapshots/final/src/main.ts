import {
  camera,
  createAuraApp,
  effects,
  environments,
  instances,
  lights,
  material,
  primitives,
  scene,
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

// ---------- deterministic random ----------
let seed = 20240611;
const rand = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a: number, b: number): number => a + (b - a) * rand();

// ---------- layout ----------
const PORTAL_Y = 2.9; // centre height of ring
const RING_R = 2.3; // ring centre-line radius
const PLATFORM_TOP = 0.4;

// ---------- palette ----------
const CYAN = "#33e6ff";
const VIOLET = "#9a5cff";
const STONE = "#6a6676";
const STONE_DARK = "#4a4756";

// ---------- vortex disc shader ----------
const vortex = material.custom({
  glsl: {
    vertex: `out vec3 vP;
void main() {
  vP = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vP; out vec4 outColor;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  vec2 p = vec2(vP.x, abs(vP.y) > abs(vP.z) ? vP.y : vP.z) * 1.0;
  float r = length(p);
  float a = atan(p.y, p.x);
  float lr = log(r + 0.04);
  // logarithmic spiral arms drawn inward over time
  float arms = sin(a * 3.0 + lr * 5.0 - clk * 2.2);
  float arms2 = sin(a * 5.0 - lr * 7.0 + clk * 1.4 + 1.7);
  float n = vnoise(vec2(a * 2.0 + clk * 0.4, lr * 3.0 - clk * 1.1) * 1.6);
  float swirl = 0.5 + 0.5 * arms;
  float fine = 0.5 + 0.5 * arms2;
  float band = swirl * 0.65 + fine * 0.25 + n * 0.35;
  vec3 cyan = vec3(0.04, 0.7, 1.0);
  vec3 violet = vec3(0.5, 0.15, 1.0);
  band = pow(clamp(band, 0.0, 1.0), 1.5);
  vec3 col = mix(violet, cyan, smoothstep(0.2, 0.7, band + (1.0 - r) * 0.1));
  col *= 0.3 + 1.0 * band;
  // bright core
  float core = exp(-r * r * 45.0);
  float halo = exp(-r * 3.5) * 0.12;
  col += vec3(0.6, 0.85, 1.0) * core * 1.3 + vec3(0.3, 0.5, 1.0) * halo;
  // rim energy
  col += cyan * smoothstep(0.8, 1.0, r) * 0.35;
  float edge = 1.0 - smoothstep(0.93, 1.0, r);
  outColor = vec4(col * edge * 0.7, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  side: "double",
  transparent: false,
  depthWrite: true,
  fog: false
});

// ---------- scene ----------
const stoneMat = material.pbr({ color: STONE, roughness: 0.92, metallic: 0.02 });
const stoneDarkMat = material.pbr({ color: STONE_DARK, roughness: 0.95, metallic: 0.0 });
const runeMetal = material.pbr({ color: "#3b3a4a", roughness: 0.45, metallic: 0.85 });

const sc = scene({ background: "#1c1430" })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.hemisphere({ skyColor: "#5a4a9a", groundColor: "#1a1226", intensity: 0.55 }))
  // dim dusk sun: low, warm, from behind-left
  .add(lights.key({ target: [0, 1.5, 0], position: [-9, 5, -7], intensity: 1.3, color: "#ff9a62" }))
  // portal glows (pulsed in onFrame)
  .add(
    lights
      .point({ position: [0, PORTAL_Y, 2.2], intensity: 60, color: CYAN, distance: 16, decay: 1.6 })
      .runtime({ id: "glowFront", mutable: true })
  )
  .add(
    lights
      .point({ position: [0, PORTAL_Y, -2.2], intensity: 50, color: VIOLET, distance: 16, decay: 1.6 })
      .runtime({ id: "glowBack", mutable: true })
  )
  .add(
    lights
      .point({ position: [0, 0.9, 0.2], intensity: 25, color: "#6a7dff", distance: 9, decay: 1.8 })
      .runtime({ id: "glowLow", mutable: true })
  )
  // ground
  .add(
    primitives.plane({
      name: "ground",
      size: [80, 1, 80],
      material: material.pbr({ color: "#2a2433", roughness: 1 })
    })
  )
  // platform: stacked discs
  .add(
    primitives
      .cylinder({ name: "platform base", size: [9.4, 0.24, 9.4], material: stoneDarkMat })
      .position(0, 0.12, 0)
  )
  .add(
    primitives
      .cylinder({ name: "platform top", size: [7.6, 0.28, 7.6], material: stoneMat })
      .position(0, PLATFORM_TOP - 0.14, 0)
  )
  // glowing inlay ring on platform
  .add(
    primitives
      .cylinder({
        name: "inlay",
        size: [5.4, 0.02, 5.4],
        material: material.emissive({ color: "#2fd8f5", emissive: "#2fd8f5", emissiveIntensity: 1.4 })
      })
      .position(0, PLATFORM_TOP + 0.005, 0)
      .runtime({ id: "inlay", mutable: true })
  )
  .add(
    primitives
      .cylinder({ name: "inlay cover", size: [5.0, 0.02, 5.0], material: stoneMat })
      .position(0, PLATFORM_TOP + 0.012, 0)
  );

// ring portal frame
sc.add(
  primitives
    .torus({ name: "portal ring", size: [RING_R * 2, RING_R * 2, RING_R * 2], material: runeMetal })
    .position(0, PORTAL_Y, 0)
    .runtime({ id: "ring", mutable: true })
);
// stone pedestal blocks the ring stands in
sc.add(
  primitives
    .box({ name: "plinth left", size: [0.9, 0.5, 1.1], material: stoneMat })
    .position(-0.85, PLATFORM_TOP + 0.25, 0)
);
sc.add(
  primitives
    .box({ name: "plinth right", size: [0.9, 0.5, 1.1], material: stoneMat })
    .position(0.85, PLATFORM_TOP + 0.25, 0)
);
// vortex disc
sc.add(
  primitives
    .circle({ name: "vortex", size: [RING_R - 0.12, RING_R - 0.12, 1], material: vortex })
    .position(0, PORTAL_Y, 0)
    .runtime({ id: "vortex", mutable: true })
);

// runes around the ring (instanced, pulsing chase)
const RUNES = 16;
const runeTransform = (i: number): AuraTransformSpec => {
  const a = (i / RUNES) * Math.PI * 2;
  return {
    position: [Math.cos(a) * RING_R, PORTAL_Y + Math.sin(a) * RING_R, 0.0],
    rotation: [0, 0, a],
    scale: [0.26, 0.1, 0.3]
  };
};
const runeTransforms = Array.from({ length: RUNES }, (_, i) => runeTransform(i));
const runeXf = (t: number): AuraTransformSpec[] =>
  runeTransforms.map((x, i) => {
    const k = 0.5 + 0.5 * Math.sin(t * 2.2 - i * 0.7);
    const s = 0.55 + 0.9 * k;
    return { ...x, scale: [0.1, 0.12 + 0.22 * s, 0.3] };
  });
const runeColors = (_t: number): string[] => runeTransforms.map(() => "#ffffff");
sc.add(
  instances
    .box({
      name: "runes",
      transforms: runeTransforms,
      colors: runeColors(0),
      material: material.emissive({ color: "#7defff", emissive: "#4fe0ff", emissiveIntensity: 1.6 })
    })
    .runtime({ id: "runes", mutable: true })
);

// ruined pillars
type Pillar = { x: number; z: number; h: number; r: number; tilt: number; broken: boolean };
const pillars: Pillar[] = [
  { x: -5.2, z: -0.8, h: 5.2, r: 0.55, tilt: 0.0, broken: false },
  { x: 5.0, z: -1.6, h: 3.4, r: 0.58, tilt: 0.0, broken: true },
  { x: -4.4, z: 3.0, h: 2.0, r: 0.5, tilt: 0.0, broken: true },
  { x: 4.6, z: 2.4, h: 4.2, r: 0.5, tilt: 0.0, broken: false },
  { x: -1.8, z: -5.2, h: 3.0, r: 0.55, tilt: 0.0, broken: true },
  { x: 2.4, z: -5.6, h: 5.0, r: 0.55, tilt: 0.0, broken: false }
];
pillars.forEach((p, i) => {
  const base = p.x * p.x + p.z * p.z > 56 ? 0 : 0; // pillars stand on ground or platform edge
  const y0 = Math.hypot(p.x, p.z) < 4.6 ? PLATFORM_TOP : 0;
  void base;
  sc.add(
    primitives
      .box({ name: `pillar base ${i}`, size: [p.r * 2.5, 0.35, p.r * 2.5], material: stoneDarkMat })
      .position(p.x, y0 + 0.175, p.z)
  );
  sc.add(
    primitives
      .cylinder({ name: `pillar ${i}`, size: [p.r * 2, p.h, p.r * 2], material: stoneMat })
      .position(p.x, y0 + 0.35 + p.h / 2, p.z)
  );
  if (!p.broken) {
    sc.add(
      primitives
        .box({ name: `capital ${i}`, size: [p.r * 2.7, 0.35, p.r * 2.7], material: stoneDarkMat })
        .position(p.x, y0 + 0.35 + p.h + 0.17, p.z)
    );
  } else {
    sc.add(
      primitives
        .box({ name: `shard ${i}`, size: [p.r * 1.1, 0.5, p.r * 0.9], material: stoneMat })
        .position(p.x + p.r * 0.3, y0 + 0.35 + p.h + 0.2, p.z)
        .rotation(0.3, 0.5, 0.35)
    );
  }
});

// fallen pillar drum + rubble
sc.add(
  primitives
    .cylinder({ name: "fallen drum", size: [1.0, 2.2, 1.0], material: stoneMat })
    .position(-5.4, 0.5, 2.4)
    .rotation(0, 0.5, Math.PI / 2 - 0.1)
);
const rubble: AuraTransformSpec[] = [];
const rubbleColors: string[] = [];
for (let i = 0; i < 46; i += 1) {
  const a = rand() * Math.PI * 2;
  const d = range(3.4, 9.5);
  const s = range(0.18, 0.7);
  const onPlatform = d < 3.9;
  rubble.push({
    position: [Math.cos(a) * d, (onPlatform ? PLATFORM_TOP : 0) + s * 0.3, Math.sin(a) * d],
    rotation: [range(-0.4, 0.4), range(0, 6.28), range(-0.4, 0.4)],
    scale: [s * range(0.8, 1.6), s * range(0.5, 1), s * range(0.8, 1.4)]
  });
  const g = Math.round(range(150, 235));
  rubbleColors.push(`rgb(${g}, ${Math.round(g * 0.97)}, ${Math.round(g * 1.04 > 255 ? 255 : g * 1.04)})`);
}
sc.add(instances.box({ name: "rubble", transforms: rubble, colors: rubbleColors, material: stoneMat }));

// ---------- particles (own simulation, rendered as instanced emissive spheres) ----------
const SPIRAL_N = 150;
const MOTE_N = 46;
const HIDDEN: AuraTransformSpec = { position: [0, -50, 0], scale: [0.0001, 0.0001, 0.0001] };

interface Spiral {
  u: number; // life 0..1
  rate: number; // life per second
  theta: number;
  spin: number;
  r0: number;
  zSide: number;
  size: number;
  tint: number; // 0 cyan .. 1 violet
}
interface Mote {
  u: number;
  rate: number;
  x: number;
  z: number;
  phase: number;
  drift: number;
  size: number;
  tint: number;
}
const newSpiral = (u: number): Spiral => ({
  u,
  rate: range(0.1, 0.2),
  theta: range(0, Math.PI * 2),
  spin: range(2.2, 3.6) * (rand() < 0.15 ? -1 : 1),
  r0: range(2.6, 4.6),
  zSide: range(-1, 1),
  size: range(0.05, 0.13),
  tint: rand() < 0.55 ? 0 : 1
});
const newMote = (u: number): Mote => {
  const a = rand() * Math.PI * 2;
  const d = Math.sqrt(rand()) * 3.2;
  return {
    u,
    rate: range(0.1, 0.2),
    x: Math.cos(a) * d,
    z: Math.sin(a) * d,
    phase: range(0, 6.28),
    drift: range(0.15, 0.4),
    size: range(0.04, 0.1),
    tint: rand() < 0.5 ? 0 : 1
  };
};
const spirals = Array.from({ length: SPIRAL_N }, () => newSpiral(rand()));
const motes = Array.from({ length: MOTE_N }, () => newMote(rand()));

const spiralColors = spirals.map((s) => (s.tint === 0 ? "#7ff3ff" : "#c39bff"));
const moteColors = motes.map((m) => (m.tint === 0 ? "#8ff5ff" : "#d2b3ff"));

const spiralXf: AuraTransformSpec[] = spirals.map(() => HIDDEN);
const moteXf: AuraTransformSpec[] = motes.map(() => HIDDEN);

const glowMat = (c: string) => material.emissive({ color: c, emissive: c, emissiveIntensity: 2.4 });
const HALF_S = SPIRAL_N / 2;
const HALF_M = MOTE_N / 2;
const mkNode = (id: string, tr: AuraTransformSpec[], color: string) =>
  sc.add(
    instances
      .sphere({ name: id, transforms: tr, colors: tr.map(() => "#ffffff"), material: glowMat(color) })
      .runtime({ id, mutable: true })
  );
mkNode("spC", spiralXf.slice(0, HALF_S), "#2fdcff");
mkNode("spV", spiralXf.slice(HALF_S), "#9a5cff");
mkNode("moC", moteXf.slice(0, HALF_M), "#5fe8ff");
mkNode("moV", moteXf.slice(HALF_M), "#b58cff");
const white = (n: number): string[] => Array.from({ length: n }, () => "#ffffff");
void spiralColors;
void moteColors;

// haze + glow
sc.add(effects.fog({ color: "#1c1430", density: 0.04 }));
sc.add(effects.bloom({ intensity: 1.4, threshold: 0.5, radius: 0.9 }));
sc.add(effects.vignette({ intensity: 0.3 }));
sc.camera(camera.perspective({ position: [0, 3.4, 10.5], target: [0, 2.3, 0], fov: 42 }));

const app = createAuraApp("#app", { scene: sc });

// ---------- animation ----------
const smooth = (x: number): number => x * x * (3 - 2 * x);
let elapsed = 0;
let first = true;

const PARTICLE_IDS = ["spC", "spV", "moC", "moV"] as const;
const LIGHT_IDS = ["glowFront", "glowBack", "glowLow"] as const;
let portalActive = true;

const setPortalActive = (on: boolean): void => {
  portalActive = on;
  app.nodes.require("vortex").setVisible(on);
  for (const id of PARTICLE_IDS) app.nodes.require(id).setVisible(on);
  for (const id of LIGHT_IDS) app.nodes.require(id).setVisible(on);
  if (on) {
    // restart particles at fresh random life so they stream back in
    for (const s of spirals) Object.assign(s, newSpiral(rand() * 0.5));
    for (const m of motes) Object.assign(m, newMote(rand()));
  }
  button.textContent = on ? "Close portal" : "Open portal";
  window.__TASK_STATE__ = {
    portalActive: on,
    particleCount: on ? SPIRAL_N + MOTE_N : 0,
    time: elapsed
  };
};

const button = document.createElement("button");
button.id = "portal-toggle";
button.type = "button";
button.textContent = "Close portal";
button.style.cssText = "display:block;margin:8px;padding:6px 14px;font:inherit;cursor:pointer;";
button.addEventListener("click", () => setPortalActive(!portalActive));
document.body.appendChild(button);

app.onFrame((f) => {
  const dt = Math.min(f.dt, 0.05);
  elapsed += dt;
  const t = elapsed;

  // camera sway / slow orbit (runs whether or not the portal is open)
  const az = Math.sin(t * 0.16) * 0.38;
  const rad = 10.4 + Math.sin(t * 0.11) * 0.5;
  const cy = 3.1 + Math.sin(t * 0.21) * 0.4;
  app.camera?.setPose({
    position: [Math.sin(az) * rad, cy, Math.cos(az) * rad],
    target: [0, 2.6, 0],
    fov: 42
  });

  // runes chase
  app.nodes.require("runes").setInstances(runeXf(t), runeColors(t));

  if (!portalActive) {
    window.__TASK_STATE__ = { portalActive: false, particleCount: 0, time: t };
    if (first) {
      first = false;
      window.__EVAL_READY__ = true;
    }
    return;
  }

  // vortex time + light pulse
  app.nodes.require("vortex").setUniform?.("clk", t);
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.1);
  const pulse2 = 0.5 + 0.5 * Math.sin(t * 1.1 + 1.6);
  app.nodes.require("glowFront").setLight?.({ intensity: 5 + 9 * pulse });
  app.nodes.require("glowBack").setLight?.({ intensity: 24 + 28 * pulse2 });
  app.nodes.require("glowLow").setLight?.({ intensity: 2 + 5 * pulse });

  // spiral particles: swirl inward, front and back of the disc
  let live = 0;
  for (let i = 0; i < SPIRAL_N; i += 1) {
    const s = spirals[i]!;
    s.u += s.rate * dt;
    if (s.u >= 1) Object.assign(s, newSpiral(0));
    const u = s.u;
    const e = 1 - u;
    const r = 0.15 + s.r0 * e * e;
    const th = s.theta + s.spin * u * 2.2 + t * 0.35;
    const vis = Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.6;
    const z = s.zSide * (0.15 + r * 0.55);
    const sz = s.size * vis * (0.6 + 0.4 * e);
    spiralXf[i] = {
      position: [Math.cos(th) * r, PORTAL_Y + Math.sin(th) * r, z],
      scale: [sz, sz, sz]
    };
    live += 1;
  }

  // motes rise from platform and fade
  for (let i = 0; i < MOTE_N; i += 1) {
    const m = motes[i]!;
    m.u += m.rate * dt;
    if (m.u >= 1) Object.assign(m, newMote(0));
    const u = m.u;
    const fade = Math.sin(Math.PI * u) ** 0.8;
    const y = PLATFORM_TOP + 0.1 + u * 6.0;
    const sz = m.size * fade;
    moteXf[i] = {
      position: [
        m.x + Math.sin(t * 0.7 + m.phase) * m.drift * (0.5 + u),
        y,
        m.z + Math.cos(t * 0.6 + m.phase) * m.drift * (0.5 + u)
      ],
      scale: [sz, sz, sz]
    };
    live += 1;
  }
  app.nodes.require("spC").setInstances(spiralXf.slice(0, HALF_S), white(HALF_S));
  app.nodes.require("spV").setInstances(spiralXf.slice(HALF_S), white(SPIRAL_N - HALF_S));
  app.nodes.require("moC").setInstances(moteXf.slice(0, HALF_M), white(HALF_M));
  app.nodes.require("moV").setInstances(moteXf.slice(HALF_M), white(MOTE_N - HALF_M));

  // inlay pulse
  void t;

  window.__TASK_STATE__ = { portalActive: true, particleCount: live, time: t };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
  void smooth;
});

window.__TASK_STATE__ = { portalActive: true, particleCount: SPIRAL_N + MOTE_N, time: 0 };
void app.ready();
