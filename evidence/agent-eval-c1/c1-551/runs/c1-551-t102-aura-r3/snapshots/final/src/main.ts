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
  type AuraTransformSpec
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { portalActive: boolean; particleCount: number; time: number };
  }
}

// ---------- deterministic rng ----------
let seed = 20240611;
const rnd = (): number => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 4294967296;
};
const range = (a: number, b: number): number => a + (b - a) * rnd();

// ---------- layout constants ----------
const PORTAL_Y = 3.05; // ring centre height
const RING_R = 2.4; // ring block centre radius
const DISC_R = 2.08;
const PLATFORM_TOP = 0.55;

// ---------- unit disc facing +Z (polar grid) ----------
function makeDisc(segments: number, rings: number) {
  const vertCount = 1 + segments * rings;
  const positions = new Float32Array(vertCount * 3);
  const indices: number[] = [];
  let v = 1; // vertex 0 = centre
  for (let r = 1; r <= rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      positions.set([Math.cos(a) * (r / rings), Math.sin(a) * (r / rings), 0], v * 3);
      v += 1;
    }
  }
  const idx = (r: number, s: number): number => 1 + (r - 1) * segments + (s % segments);
  for (let s = 0; s < segments; s += 1) indices.push(0, idx(1, s), idx(1, s + 1));
  for (let r = 1; r < rings; r += 1) {
    for (let s = 0; s < segments; s += 1) {
      indices.push(idx(r, s), idx(r + 1, s), idx(r + 1, s + 1), idx(r, s), idx(r + 1, s + 1), idx(r, s + 1));
    }
  }
  return geometry.define({
    positions,
    normals: geometry.computeNormals({ positions, indices }),
    indices,
    bounds: { min: [-1, -1, -0.01], max: [1, 1, 0.01] }
  });
}
const discGeo = makeDisc(72, 14);

const VERT = `out vec3 vP; void main() { vP = position; gl_Position = modelViewProjectionMatrix * vec4(position, 1.0); }`;

const vortexMat = material.custom({
  glsl: {
    vertex: VERT,
    fragment: `in vec3 vP; out vec4 outColor;
void main() {
  vec2 p = vP.xy;
  float r = length(p);
  float a = atan(p.y, p.x);
  float s1 = a * 3.0 + 5.5 * log(r + 0.07) - clk * 1.6;
  float arms = 0.5 + 0.5 * sin(s1);
  float s2 = a * 5.0 - 9.0 * r + clk * 0.9 + sin(a * 2.0 + clk * 0.7) * 1.3;
  float arms2 = 0.5 + 0.5 * sin(s2);
  float turb = 0.5 + 0.5 * sin(r * 22.0 - clk * 3.2 + sin(a * 4.0 + clk * 1.1) * 1.6);
  vec3 violet = vec3(0.50, 0.12, 1.00);
  vec3 cyan = vec3(0.05, 0.85, 1.00);
  vec3 col = mix(violet, cyan, smoothstep(0.15, 0.85, arms));
  col *= 0.35 + 0.9 * arms2 + 0.35 * turb;
  col += cyan * 0.9 * smoothstep(0.62, 1.0, r) * (0.5 + 0.5 * turb);
  col *= 0.3;
  col = pow(col, vec3(1.15));
  float core = exp(-r * r * 40.0) * 1.6 + exp(-r * 5.0) * 0.12;
  col += vec3(0.8, 0.92, 1.0) * core;
  float pulse = 1.0 + 0.14 * sin(clk * 1.25);
  float edge = 1.0 - smoothstep(0.93, 1.0, r);
  outColor = vec4(col * edge * pulse, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } },
  transparent: true,
  depthWrite: false,
  side: "double",
  blending: "additive",
  fog: false
});

function haloMaterial(color: string, power: number, strength: number) {
  return material.custom({
    glsl: {
      vertex: VERT,
      fragment: `in vec3 vP; out vec4 outColor;
void main() {
  float r = length(vP.xy);
  float g = pow(max(1.0 - r, 0.0), ${power.toFixed(2)});
  float pulse = 1.0 + 0.22 * sin(clk * 1.25);
  outColor = vec4(${color} * g * ${strength.toFixed(2)} * pulse, 1.0);
}`
    },
    uniforms: { clk: { type: "f32", value: 0 } },
    transparent: true,
    depthWrite: false,
    side: "double",
    blending: "additive",
    fog: false
  });
}
const haloMat = haloMaterial("vec3(0.30, 0.45, 1.0)", 2.6, 0.3);
const haloFrontMat = haloMaterial("vec3(0.25, 0.4, 1.0)", 3.0, 0.08);
const poolMat = haloMaterial("vec3(0.15, 0.5, 1.0)", 2.4, 0.3);
const hazeMat = haloMaterial("vec3(0.30, 0.16, 0.55)", 1.6, 0.25);

// ---------- stone ring ----------
const BLOCKS = 18;
const ringTransforms: AuraTransformSpec[] = [];
const ringColors: string[] = [];
for (let i = 0; i < BLOCKS; i += 1) {
  const th = (i / BLOCKS) * Math.PI * 2 + 0.1;
  const w = (2 * Math.PI * RING_R) / BLOCKS;
  const j = range(-0.05, 0.05);
  ringTransforms.push({
    position: [Math.cos(th) * RING_R, PORTAL_Y + Math.sin(th) * RING_R, range(-0.04, 0.04)],
    rotation: [0, 0, th + Math.PI / 2 + j],
    scale: [w * range(0.96, 1.02), range(0.62, 0.74), range(0.85, 1.0)]
  });
  const g = Math.round(range(82, 112));
  ringColors.push(`rgb(${g + 6}, ${g}, ${g + 12})`);
}

// rune slabs on the ring face
const runeTransforms: AuraTransformSpec[] = [];
for (let i = 0; i < BLOCKS; i += 1) {
  if (i % 2 === 1) continue;
  const th = (i / BLOCKS) * Math.PI * 2 + 0.1;
  runeTransforms.push({
    position: [Math.cos(th) * RING_R, PORTAL_Y + Math.sin(th) * RING_R, 0.5],
    rotation: [0, 0, th + Math.PI / 2],
    scale: [0.1, 0.34, 0.03]
  });
  runeTransforms.push({
    position: [Math.cos(th) * RING_R + Math.cos(th + 1.57) * 0.18, PORTAL_Y + Math.sin(th) * RING_R + Math.sin(th + 1.57) * 0.18, 0.5],
    rotation: [0, 0, th + Math.PI / 2 + 0.9],
    scale: [0.2, 0.06, 0.03]
  });
}
const runeColors = (pulse: number): string[] =>
  runeTransforms.map((_, i) => {
    const k = 0.55 + 0.45 * Math.sin(pulse * 1.25 + i * 0.5);
    return `rgb(${Math.round(30 + 40 * k)}, ${Math.round(150 + 105 * k)}, ${Math.round(210 + 45 * k)})`;
  });

// ---------- platform steps, rubble, pillars ----------
const pillarTransforms: AuraTransformSpec[] = [];
const pillarColors: string[] = [];
const capTransforms: AuraTransformSpec[] = [];
const capColors: string[] = [];
const pillarDefs: Array<[number, number, number, number]> = [
  [-6.2, -1.2, 5.2, 0],
  [6.0, -2.0, 3.6, 0.05],
  [-4.6, -5.4, 6.4, -0.03],
  [4.8, -5.6, 2.2, 0],
  [-7.6, 3.2, 2.8, 0.06],
  [7.4, 2.6, 4.4, -0.04]
];
for (const [x, z, h, tilt] of pillarDefs) {
  pillarTransforms.push({ position: [x, h / 2, z], rotation: [0, 0, tilt], scale: [1.0, h, 1.0] });
  pillarColors.push("#6a6672");
  // plinth and capital
  capTransforms.push({ position: [x, 0.25, z], scale: [1.45, 0.5, 1.45] });
  capColors.push("#5a5662");
  if (h > 4) {
    capTransforms.push({ position: [x + tilt * h * 0.5, h + 0.18, z], scale: [1.4, 0.36, 1.4] });
    capColors.push("#625e6c");
  } else {
    // broken top: jagged chunk
    capTransforms.push({ position: [x + 0.15, h + 0.12, z], rotation: [0.2, 0.7, 0.25], scale: [0.7, 0.4, 0.6] });
    capColors.push("#58545f");
  }
}
// fallen debris
for (let i = 0; i < 22; i += 1) {
  const a = range(0, Math.PI * 2);
  const d = range(4.3, 9.5);
  const s = range(0.25, 0.8);
  capTransforms.push({
    position: [Math.cos(a) * d, s * 0.35, Math.sin(a) * d - 1],
    rotation: [range(-0.5, 0.5), range(0, 3), range(-0.5, 0.5)],
    scale: [s * range(0.8, 1.6), s * 0.7, s * range(0.8, 1.4)]
  });
  const g = Math.round(range(50, 80));
  capColors.push(`rgb(${g + 4}, ${g}, ${g + 10})`);
}

// ---------- particles ----------
const SPIRAL = 150;
const MOTES = 45;
const TOTAL = SPIRAL + MOTES;
interface P {
  kind: 0 | 1;
  age: number;
  life: number;
  a0: number;
  r0: number;
  dir: number;
  h: number;
  size: number;
  tone: number;
  x0: number;
  z0: number;
}
const parts: P[] = [];
function spawn(p: P, kind: 0 | 1, warm: boolean): P {
  p.kind = kind;
  p.life = kind === 0 ? range(3.2, 5.5) : range(3.5, 6.5);
  p.age = warm ? rnd() * p.life : 0;
  p.a0 = range(0, Math.PI * 2);
  p.r0 = kind === 0 ? range(2.8, 4.6) : range(0.2, 3.4);
  p.dir = 1;
  p.h = range(-1.2, 1.2);
  p.size = kind === 0 ? range(0.05, 0.11) : range(0.04, 0.085);
  p.tone = rnd();
  p.x0 = range(-3.2, 3.2);
  p.z0 = range(-3.2, 3.2);
  return p;
}
for (let i = 0; i < TOTAL; i += 1) {
  parts.push(spawn({ kind: 0, age: 0, life: 1, a0: 0, r0: 0, dir: 1, h: 0, size: 0, tone: 0, x0: 0, z0: 0 }, i < SPIRAL ? 0 : 1, true));
}
const pTransforms: AuraTransformSpec[] = parts.map(() => ({ position: [0, -50, 0], scale: 0.0001 }));
const pColors: string[] = parts.map(() => "#000000");

function updateParticles(dt: number): number {
  let live = 0;
  for (let i = 0; i < TOTAL; i += 1) {
    const p = parts[i]!;
    p.age += dt;
    if (p.age >= p.life) spawn(p, p.kind, false);
    const u = p.age / p.life;
    let x: number, y: number, z: number, fade: number;
    if (p.kind === 0) {
      const e = u * u * 0.6 + u * 0.4;
      const r = p.r0 * (1 - e) + 0.12;
      const ang = p.a0 + u * 5.5 + (1 - r / 5) * 2.0 * u;
      x = Math.cos(ang) * r;
      y = PORTAL_Y + Math.sin(ang) * r;
      z = p.h * (1 - e) * 0.9 + 0.1;
      fade = Math.min(1, u * 6) * Math.min(1, (1 - u) * 4);
    } else {
      const rr = p.r0 + Math.sin(p.age * 0.8 + p.a0) * 0.2;
      x = Math.cos(p.a0 + p.age * 0.35) * rr + Math.sin(p.age * 1.3 + p.x0) * 0.25;
      z = Math.sin(p.a0 + p.age * 0.35) * rr * 0.9 + Math.cos(p.age * 1.1 + p.z0) * 0.25;
      y = PLATFORM_TOP + 0.1 + u * (3.8 + p.tone * 1.6);
      fade = Math.min(1, u * 8) * (1 - u) * (1 - u);
    }
    live += fade > 0.002 ? 1 : 0;
    const sc = p.size * (0.35 + 0.65 * fade) * (p.kind === 1 ? 1 + 0.25 * Math.sin(p.age * 6 + p.a0) : 1);
    pTransforms[i] = { position: [x, y, z], scale: Math.max(sc, 0.0001) };
    const t = p.tone;
    const k = 0.1 + 0.7 * fade;
    const rC = p.kind === 0 ? 0.1 + 0.55 * (1 - t) : 0.25 + 0.6 * t;
    const gC = p.kind === 0 ? 0.45 + 0.4 * t : 0.6 + 0.3 * t;
    const bC = 1.0;
    pColors[i] = `rgb(${Math.round(Math.min(1, rC * k) * 255)}, ${Math.round(Math.min(1, gC * k) * 255)}, ${Math.round(Math.min(1, bC * k) * 255)})`;
  }
  return live;
}
updateParticles(0.0);

// ---------- scene ----------
const stone = material.pbr({ color: "#ffffff", roughness: 0.92, metallic: 0.02 });

const sc = scene({ background: "#0c0a1c" })
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.hemisphere({ skyColor: "#4a3f8c", groundColor: "#120e1c", intensity: 0.55 }))
  // dusk key: low, warm-magenta from behind-left
  .add(lights.directional({ position: [-9, 5, -6], target: [0, 1.5, 0], intensity: 1.1, color: "#ff8a6a", shadow: true }))
  // portal lights
  .add(lights.point({ name: "portalCyan", position: [0.4, PORTAL_Y, 2.6], intensity: 26, distance: 20, decay: 1.6, color: "#33d6ff" }).runtime({ id: "portalCyan", mutable: true }))
  .add(lights.point({ name: "portalViolet", position: [-0.6, PORTAL_Y - 0.6, -1.4], intensity: 22, distance: 20, decay: 1.6, color: "#9a4dff" }).runtime({ id: "portalViolet", mutable: true }))
  .add(lights.point({ name: "portalLow", position: [0, 1.1, 1.8], intensity: 12, distance: 12, decay: 1.6, color: "#4aa8ff" }).runtime({ id: "portalLow", mutable: true }))
  // ground
  .add(primitives.plane({ name: "ground", size: [60, 1, 60], material: material.pbr({ color: "#1b1824", roughness: 1 }) }))
  // platform
  .add(primitives.cylinder({ name: "platformBase", size: [10.4, 0.28, 10.4], material: material.pbr({ color: "#4a4654", roughness: 0.95 }) }).position(0, 0.14, 0))
  .add(primitives.cylinder({ name: "platformMid", size: [8.6, 0.28, 8.6], material: material.pbr({ color: "#575262", roughness: 0.93 }) }).position(0, 0.34, 0))
  .add(primitives.cylinder({ name: "platformTop", size: [6.6, 0.2, 6.6], material: material.pbr({ color: "#625d6e", roughness: 0.85 }) }).position(0, PLATFORM_TOP - 0.1, 0))
  // inner rune circle on platform
  .add(primitives.torus({ name: "platformRune", size: [4.4, 4.4, 0.06], material: material.emissive({ color: "#2ec8ff" }) }).position(0, PLATFORM_TOP + 0.01, 0.2).rotation(Math.PI / 2, 0, 0))
  // portal base pedestal
  .add(primitives.box({ name: "pedestal", size: [3.4, 0.5, 1.3], material: material.pbr({ color: "#4e4a5a", roughness: 0.9 }) }).position(0, PLATFORM_TOP + 0.2, 0))
  // ring + runes
  .add(instances.box({ name: "ringStones", transforms: ringTransforms, colors: ringColors, material: stone }))
  .add(instances.box({ name: "runes", transforms: runeTransforms, colors: runeColors(0), material: material.emissive({ color: "#ffffff" }) }).runtime({ id: "runes", mutable: true }))
  // pillars + debris
  .add(instances.cylinder({ name: "pillars", transforms: pillarTransforms, colors: pillarColors, material: stone }))
  .add(instances.box({ name: "rubble", transforms: capTransforms, colors: capColors, material: stone }))
  // vortex disc and glows
  .add(geometry.custom(discGeo, { name: "vortex", material: vortexMat }).position(0, PORTAL_Y, 0.02).scale([DISC_R, DISC_R, 1]).runtime({ id: "vortex", mutable: true }))
  .add(geometry.custom(discGeo, { name: "halo", material: haloMat }).position(0, PORTAL_Y, -0.5).scale([6.2, 6.2, 1]).runtime({ id: "halo", mutable: true }))
  .add(geometry.custom(discGeo, { name: "haloFront", material: haloFrontMat }).position(0, PORTAL_Y, 0.9).scale([3.6, 3.6, 1]).runtime({ id: "haloFront", mutable: true }))
  .add(geometry.custom(discGeo, { name: "pool", material: poolMat }).position(0, PLATFORM_TOP + 0.03, 1.2).rotation(-Math.PI / 2, 0, 0).scale([4.4, 4.4, 1]).runtime({ id: "pool", mutable: true }))
  .add(geometry.custom(discGeo, { name: "hazeBack", material: hazeMat }).position(0, 2.2, -6).scale([14, 8, 1]).runtime({ id: "hazeBack", mutable: true }))
  // particles
  .add(instances.sphere({ name: "particles", transforms: pTransforms, colors: pColors, material: material.emissive({ color: "#ffffff" }) }).runtime({ id: "particles", mutable: true }))
  // post
  .add(effects.fog({ color: "#1a1233", density: 0.028, mode: "exp2" }))
  .add(effects.bloom({ intensity: 0.7, threshold: 0.8, radius: 0.7 }))
  .add(effects.vignette({ intensity: 0.5 }))
  .camera(camera.perspective({ position: [0, 3.2, 12], target: [0, 2.3, 0], fov: 42 }));

const app = createAuraApp("#app", { scene: sc });

window.__TASK_STATE__ = { portalActive: true, particleCount: 0, time: 0 };

// ---------- open / close control (DOM, outside the canvas) ----------
const PORTAL_NODES = ["vortex", "halo", "haloFront", "pool", "hazeBack", "particles", "portalCyan", "portalViolet", "portalLow"];
let portalOpen = true;
let appliedOpen = true;
const toggleBtn = document.createElement("button");
toggleBtn.id = "portal-toggle";
toggleBtn.type = "button";
toggleBtn.textContent = "Close portal";
toggleBtn.style.cssText = "display:block;margin:8px 0 0 8px;padding:6px 14px;font:inherit;cursor:pointer";
toggleBtn.addEventListener("click", () => {
  portalOpen = !portalOpen;
  toggleBtn.textContent = portalOpen ? "Close portal" : "Open portal";
  const s = window.__TASK_STATE__;
  if (s) {
    s.portalActive = portalOpen;
    if (!portalOpen) s.particleCount = 0;
  }
});
document.body.appendChild(toggleBtn);

let lastTime = 0;
let first = true;

app.onFrame((f) => {
  const t = f.time;
  const dt = Math.min(0.05, Math.max(0, t - lastTime));
  lastTime = t;

  if (portalOpen !== appliedOpen) {
    appliedOpen = portalOpen;
    for (const id of PORTAL_NODES) app.nodes.require(id).setVisible(portalOpen);
    if (portalOpen) {
      for (const p of parts) spawn(p, p.kind, true);
    }
  }

  let live = 0;
  if (portalOpen) {
    live = updateParticles(dt);
    app.nodes.require("particles").setInstances(pTransforms, pColors);
  }
  app.nodes.require("runes").setInstances(runeTransforms, runeColors(t));

  for (const id of ["vortex", "halo", "haloFront", "pool", "hazeBack"]) {
    app.nodes.require(id).setUniform?.("clk", t);
  }

  // slow light pulse
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.25);
  app.nodes.require("portalCyan").setIntensity?.(11 + 12 * pulse);
  app.nodes.require("portalViolet").setIntensity?.(14 + 16 * (1 - pulse));
  app.nodes.require("portalLow").setIntensity?.(4 + 5 * pulse);

  // gentle orbit sway
  const az = Math.sin(t * 0.13) * 0.55;
  const dist = 13.5 + Math.sin(t * 0.09) * 0.6;
  app.camera?.setPose({
    position: [Math.sin(az) * dist, 3.4 + Math.sin(t * 0.17) * 0.5, Math.cos(az) * dist],
    target: [0, 2.7, 0]
  });

  window.__TASK_STATE__ = { portalActive: portalOpen, particleCount: portalOpen ? live : 0, time: t };
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

void app.ready();
