import { camera, createAuraApp, effects, geometry, lines, material, primitives, points, scene } from "@aura3d/engine";

// ---------------------------------------------------------------- data
type Vec3 = [number, number, number];

interface PlanetDef {
  name: string;
  periodDays: number; // real orbital period (Earth days)
  distMkm: number; // real distance from the Sun (million km)
  orbitR: number; // scene units
  size: number; // diameter, scene units
  tilt: number; // axial tilt (rad)
  spin: number; // rad/s
  phase: number;
  colorA: string;
  colorB: string;
  bandFreq: number;
  bandMix: number;
  noiseScale: number;
  earth?: boolean;
  ring?: { inner: number; outer: number; color: string };
  moons?: { name: string; r: number; size: number; speed: number; phase: number }[];
}

const PLANETS: PlanetDef[] = [
  { name: "Mercury", periodDays: 88, distMkm: 57.9, orbitR: 7, size: 1.0, tilt: 0.03, spin: 0.5, phase: 0.6, colorA: "#9b948c", colorB: "#5c5753", bandFreq: 0, bandMix: 0, noiseScale: 5 },
  { name: "Venus", periodDays: 224.7, distMkm: 108.2, orbitR: 9.8, size: 1.8, tilt: 3.0, spin: -0.3, phase: 2.4, colorA: "#f0cf94", colorB: "#c48a4a", bandFreq: 6, bandMix: 0.55, noiseScale: 2.2 },
  {
    name: "Earth", periodDays: 365.2, distMkm: 149.6, orbitR: 12.8, size: 1.9, tilt: 0.41, spin: 1.2, phase: 4.1, colorA: "#1f5fb0", colorB: "#43914c", bandFreq: 0, bandMix: 0, noiseScale: 2.6, earth: true,
    moons: [{ name: "Moon", r: 1.9, size: 0.5, speed: 1.6, phase: 0.5 }]
  },
  { name: "Mars", periodDays: 687, distMkm: 227.9, orbitR: 16.2, size: 1.4, tilt: 0.44, spin: 1.1, phase: 5.5, colorA: "#cc6240", colorB: "#8c3b22", bandFreq: 0, bandMix: 0, noiseScale: 3.5 },
  {
    name: "Jupiter", periodDays: 4331, distMkm: 778.5, orbitR: 21.5, size: 4.4, tilt: 0.05, spin: 1.8, phase: 1.3, colorA: "#e3c29a", colorB: "#a76a43", bandFreq: 16, bandMix: 0.85, noiseScale: 2.2,
    moons: [{ name: "Io", r: 3.4, size: 0.5, speed: 1.1, phase: 2.0 }]
  },
  { name: "Saturn", periodDays: 10747, distMkm: 1434, orbitR: 27.5, size: 3.6, tilt: 0.47, spin: 1.6, phase: 3.3, colorA: "#ead9a8", colorB: "#c3a56c", bandFreq: 12, bandMix: 0.7, noiseScale: 2.0, ring: { inner: 2.3, outer: 4.3, color: "#d8c394" } },
  { name: "Uranus", periodDays: 30589, distMkm: 2871, orbitR: 32.5, size: 2.5, tilt: 1.4, spin: -1.0, phase: 0.2, colorA: "#9adfe4", colorB: "#6dbdca", bandFreq: 5, bandMix: 0.4, noiseScale: 1.6 },
  { name: "Neptune", periodDays: 59800, distMkm: 4495, orbitR: 37, size: 2.4, tilt: 0.49, spin: 1.0, phase: 5.0, colorA: "#4a6fe0", colorB: "#2a3fa0", bandFreq: 9, bandMix: 0.5, noiseScale: 2.0 }
];

const SUN_SIZE = 4.6;
const TRANSITION_S = 1.5;
const FOV = 45;

// Sim seconds for one orbit: compressed so inner planets are faster but outer ones still move.
const orbitSeconds = (p: PlanetDef): number => 12 * Math.pow(p.periodDays / 88, 0.6);

// ---------------------------------------------------------------- helpers
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

const glslColor = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): string => (v / 255).toFixed(4);
  return `vec3(${f((n >> 16) & 255)}, ${f((n >> 8) & 255)}, ${f(n & 255)})`;
};

const NOISE_GLSL = `
float hash31(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1.0, 0.0, 0.0)), f.x),
                 mix(hash31(i + vec3(0.0, 1.0, 0.0)), hash31(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0.0, 0.0, 1.0)), hash31(i + vec3(1.0, 0.0, 1.0)), f.x),
                 mix(hash31(i + vec3(0.0, 1.0, 1.0)), hash31(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; }
  return s;
}
`;

const SURFACE_VERTEX = `
out vec3 vLocal;
out vec3 vN;
out vec3 vW;
out vec3 vV;
void main() {
  vLocal = normalize(position);
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vV = normalize(cameraPosition - w.xyz);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

function planetMaterial(p: { colorA: string; colorB: string; bandFreq: number; bandMix: number; noiseScale: number; earth?: boolean }) {
  const surface = p.earth
    ? `
    float n = fbm(vLocal * ${p.noiseScale.toFixed(2)} + vec3(3.0));
    float land = smoothstep(0.50, 0.53, n);
    vec3 col = mix(CA, CB, land);
    col = mix(col, col * vec3(0.8, 0.75, 0.55), smoothstep(0.62, 0.78, n) * land);
    float cloud = smoothstep(0.55, 0.78, fbm(vLocal * 4.5 + vec3(11.0, 2.0, 5.0)));
    col = mix(col, vec3(0.95), cloud * 0.75);
    float cap = smoothstep(0.80, 0.88, abs(vLocal.y));
    col = mix(col, vec3(0.93, 0.96, 1.0), cap);
    float spec = (1.0 - land) * (1.0 - cloud);`
    : `
    float n = fbm(vLocal * ${p.noiseScale.toFixed(2)});
    float bnd = ${p.bandFreq > 0 ? `0.5 + 0.5 * sin(vLocal.y * ${p.bandFreq.toFixed(1)} + n * 4.0)` : "n"};
    float t = mix(n, bnd, ${p.bandMix.toFixed(2)});
    vec3 col = mix(CA, CB, clamp(t * 1.15, 0.0, 1.0));
    float spec = 0.0;`;
  return material.custom({
    glsl: {
      vertex: SURFACE_VERTEX,
      fragment: `
in vec3 vLocal; in vec3 vN; in vec3 vW; in vec3 vV;
out vec4 outColor;
const vec3 CA = ${glslColor(p.colorA)};
const vec3 CB = ${glslColor(p.colorB)};
${NOISE_GLSL}
void main() {
  ${surface}
  vec3 N = normalize(vN);
  vec3 L = normalize(-vW);
  float d = max(dot(N, L), 0.0);
  float soft = smoothstep(0.0, 0.35, d);
  vec3 H = normalize(L + normalize(vV));
  float sp = pow(max(dot(N, H), 0.0), 40.0) * spec * 0.5 * soft;
  float rim = pow(1.0 - max(dot(N, normalize(vV)), 0.0), 3.0) * (0.15 + 0.85 * soft);
  vec3 lit = col * (0.12 + 0.88 * d) + vec3(sp) + vec3(0.35, 0.5, 0.9) * rim * 0.25;
  outColor = vec4(lit, 1.0);
}`
    }
  });
}

const sunMaterial = material.custom({
  glsl: {
    vertex: SURFACE_VERTEX,
    fragment: `
in vec3 vLocal; in vec3 vN; in vec3 vW; in vec3 vV;
out vec4 outColor;
${NOISE_GLSL}
void main() {
  float n = fbm(vLocal * 3.0 + vec3(clk * 0.12, clk * 0.07, 0.0));
  float m = fbm(vLocal * 7.0 - vec3(clk * 0.2, 0.0, clk * 0.1));
  float heat = clamp(0.55 + 0.7 * n + 0.3 * m - 0.3, 0.0, 1.0);
  vec3 col = mix(vec3(1.0, 0.45, 0.08), vec3(1.0, 0.92, 0.55), heat);
  float limb = max(dot(normalize(vN), normalize(vV)), 0.0);
  col *= 0.75 + 0.5 * pow(limb, 0.6);
  outColor = vec4(col * 1.6, 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

const sunGlowMaterial = material.custom({
  glsl: {
    vertex: SURFACE_VERTEX,
    fragment: `
in vec3 vLocal; in vec3 vN; in vec3 vW; in vec3 vV;
out vec4 outColor;
void main() {
  float c = max(dot(normalize(vN), normalize(vV)), 0.0);
  float a = pow(c, 2.2) * 0.55;
  outColor = vec4(vec3(1.0, 0.6, 0.2) * a, a);
}`
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "front"
});

function ringMaterial(inner: number, outer: number, color: string) {
  return material.custom({
    glsl: {
      vertex: `
out vec3 vL;
void main() {
  vL = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
      fragment: `
in vec3 vL;
out vec4 outColor;
const vec3 RC = ${glslColor(color)};
void main() {
  float r = (length(vL.xz) - ${inner.toFixed(3)}) / (${outer.toFixed(3)} - ${inner.toFixed(3)});
  float bands = 0.55 + 0.25 * sin(r * 70.0) + 0.2 * sin(r * 23.0 + 1.0);
  float gap = smoothstep(0.50, 0.53, r) * (1.0 - smoothstep(0.58, 0.62, r));
  float edge = smoothstep(0.0, 0.06, r) * (1.0 - smoothstep(0.94, 1.0, r));
  float a = clamp(bands * (1.0 - 0.85 * gap) * edge, 0.0, 1.0) * 0.9;
  outColor = vec4(RC * (0.55 + 0.45 * bands), a);
}`
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  });
}

function ringGeometry(inner: number, outer: number) {
  const seg = 128;
  const pos = new Float32Array((seg + 1) * 2 * 3);
  const nor = new Float32Array((seg + 1) * 2 * 3);
  const idx: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    pos.set([c * inner, 0, s * inner], i * 6);
    pos.set([c * outer, 0, s * outer], i * 6 + 3);
    nor.set([0, 1, 0, 0, 1, 0], i * 6);
    if (i < seg) {
      const v = i * 2;
      idx.push(v, v + 2, v + 1, v + 1, v + 2, v + 3);
    }
  }
  return geometry.define({
    positions: pos,
    normals: nor,
    indices: idx,
    bounds: { min: [-outer, 0, -outer], max: [outer, 0, outer] }
  });
}

// ---------------------------------------------------------------- scene
const rand = mulberry32(20240611);
const STAR_COUNT = 1100;
const starPositions = new Float32Array(STAR_COUNT * 3);
const starColors: string[] = [];
const starPalette = ["#ffffff", "#cfe0ff", "#fff1cf", "#ffd9b0", "#b8ccff"];
for (let i = 0; i < STAR_COUNT; i += 1) {
  const u = rand() * 2 - 1;
  const th = rand() * Math.PI * 2;
  const r = Math.sqrt(1 - u * u);
  const R = 700;
  starPositions.set([R * r * Math.cos(th), R * u, R * r * Math.sin(th)], i * 3);
  starColors.push(starPalette[Math.floor(rand() * starPalette.length)] ?? "#ffffff");
}

const overview = { yaw: 0.5, pitch: 0.55, dist: 80 };
const DIST_MIN = 26;
const DIST_MAX = 140;

const overviewPosition = (): Vec3 => [
  overview.dist * Math.cos(overview.pitch) * Math.sin(overview.yaw),
  overview.dist * Math.sin(overview.pitch),
  overview.dist * Math.cos(overview.pitch) * Math.cos(overview.yaw)
];

let sceneBuilder = scene({ background: "#02030a" })
  .add(points({ name: "stars", positions: starPositions, colors: starColors, size: 1.6, sizeAttenuation: false }))
  .add(primitives.sphere({ name: "sun", size: SUN_SIZE, material: sunMaterial }).runtime({ id: "sun", mutable: true }))
  .add(primitives.sphere({ name: "sun-glow", size: SUN_SIZE * 1.7, material: sunGlowMaterial }))
  .add(effects.bloom({ intensity: 0.7, threshold: 0.85, radius: 0.6 }));

for (const p of PLANETS) {
  const pts: Vec3[] = [];
  for (let i = 0; i < 160; i += 1) {
    const a = (i / 160) * Math.PI * 2;
    pts.push([Math.cos(a) * p.orbitR, 0, Math.sin(a) * p.orbitR]);
  }
  sceneBuilder = sceneBuilder
    .add(lines.loop({ name: `orbit-${p.name}`, points: pts, colors: pts.map(() => "#4a5878") }))
    .add(primitives.sphere({ name: p.name, size: p.size, material: planetMaterial(p) }).runtime({ id: `planet-${p.name}`, mutable: true }));
  if (p.ring) {
    sceneBuilder = sceneBuilder.add(
      geometry.custom(ringGeometry(p.ring.inner, p.ring.outer), { name: `${p.name}-ring`, material: ringMaterial(p.ring.inner, p.ring.outer, p.ring.color) }).runtime({ id: `ring-${p.name}`, mutable: true })
    );
  }
  for (const m of p.moons ?? []) {
    sceneBuilder = sceneBuilder.add(
      primitives.sphere({
        name: m.name,
        size: m.size,
        material: planetMaterial({ colorA: "#bdb9b3", colorB: "#6f6c68", bandFreq: 0, bandMix: 0, noiseScale: 5 })
      }).runtime({ id: `moon-${m.name}`, mutable: true })
    );
  }
}

const startPos = overviewPosition();
const app = createAuraApp("#app", {
  scene: sceneBuilder.camera(camera.perspective({ position: startPos, target: [0, 0, 0], fov: FOV, near: 0.1, far: 3000 }))
});

// ---------------------------------------------------------------- state
interface Pose {
  position: Vec3;
  target: Vec3;
}

const planetPos: Vec3[] = PLANETS.map(() => [0, 0, 0]);
let simT = 0;
let paused = false;
let ready = false;
let focusIndex = -1;
let transition: { t: number; from: Pose } | null = null;
let current: Pose = { position: startPos, target: [0, 0, 0] };

const lerp3 = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const easeInOutCubic = (t: number): number => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function focusDistance(p: PlanetDef): number {
  return 3 * Math.max(p.size, p.ring ? p.ring.outer * 1.6 : 0) + 1.2;
}

function focusPose(i: number): Pose {
  const p = PLANETS[i]!;
  const P = planetPos[i]!;
  const len = Math.hypot(P[0], P[2]) || 1;
  const rx = P[0] / len;
  const rz = P[2] / len;
  const tx = -rz;
  const tz = rx;
  let dx = -rx * 0.8 + tx * 0.45;
  let dy = 0.3;
  let dz = -rz * 0.8 + tz * 0.45;
  const dl = Math.hypot(dx, dy, dz);
  dx /= dl;
  dy /= dl;
  dz /= dl;
  const d = focusDistance(p);
  return { position: [P[0] + dx * d, P[1] + dy * d, P[2] + dz * d], target: [P[0], P[1], P[2]] };
}

function overviewPose(): Pose {
  return { position: overviewPosition(), target: [0, 0, 0] };
}

function setFocus(i: number): void {
  if (i === focusIndex) return;
  transition = { t: 0, from: { position: [...current.position], target: [...current.target] } };
  focusIndex = i;
  updatePanel();
}

function focusPlanet(name: string): void {
  const i = PLANETS.findIndex((p) => p.name.toLowerCase() === String(name).toLowerCase());
  if (i >= 0) setFocus(i);
}

function unfocus(): void {
  setFocus(-1);
}

// ---------------------------------------------------------------- DOM
const canvas = document.getElementById("app") as HTMLCanvasElement;
const overlay = document.createElement("div");
overlay.style.cssText = "position:absolute;left:0;top:0;width:640px;height:360px;pointer-events:none;overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#e8ecff;";
document.body.appendChild(overlay);

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-toggle";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
pauseBtn.style.cssText =
  "position:absolute;left:10px;top:10px;pointer-events:auto;padding:5px 14px;border-radius:14px;border:1px solid rgba(160,180,255,.5);background:rgba(15,20,45,.75);color:#e8ecff;font:600 12px system-ui,sans-serif;cursor:pointer;";
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  pauseBtn.textContent = paused ? "Play" : "Pause";
});
overlay.appendChild(pauseBtn);

const panel = document.createElement("div");
panel.id = "info-panel";
panel.style.cssText =
  "position:absolute;right:10px;bottom:10px;min-width:190px;padding:10px 14px;border-radius:10px;border:1px solid rgba(160,180,255,.4);background:rgba(10,14,34,.82);display:none;pointer-events:none;";
overlay.appendChild(panel);

const hint = document.createElement("div");
hint.style.cssText = "position:absolute;left:10px;bottom:8px;font-size:11px;color:rgba(200,210,255,.6);pointer-events:none;";
overlay.appendChild(hint);

function updatePanel(): void {
  if (focusIndex < 0) {
    panel.style.display = "none";
    hint.textContent = "Click a planet \u00b7 drag to orbit \u00b7 scroll to zoom";
    return;
  }
  const p = PLANETS[focusIndex]!;
  panel.innerHTML =
    `<div id="info-name" style="font-size:16px;font-weight:700;margin-bottom:4px">${p.name}</div>` +
    `<div id="info-period">Orbital period: <b>${p.periodDays.toLocaleString("en-US")}</b> Earth days</div>` +
    `<div id="info-distance">Distance from star: <b>${p.distMkm.toLocaleString("en-US")}</b> million km</div>`;
  panel.style.display = "block";
  hint.textContent = "Click empty space or press Esc to return";
}
updatePanel();

// ---------------------------------------------------------------- input
function project(pos: Vec3, P: Vec3): { x: number; y: number; z: number; pxPerUnit: number } | null {
  const tgt = current.target;
  let fx = tgt[0] - pos[0];
  let fy = tgt[1] - pos[1];
  let fz = tgt[2] - pos[2];
  const fl = Math.hypot(fx, fy, fz) || 1;
  fx /= fl;
  fy /= fl;
  fz /= fl;
  // right = f x up(0,1,0)
  let rx = -fz;
  let rz = fx;
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const ry = 0;
  // u = r x f
  const ux = ry * fz - rz * fy;
  const uy = rz * fx - rx * fz;
  const uz = rx * fy - ry * fx;
  const vx = P[0] - pos[0];
  const vy = P[1] - pos[1];
  const vz = P[2] - pos[2];
  const z = vx * fx + vy * fy + vz * fz;
  if (z <= 0.01) return null;
  const x = vx * rx + vy * ry + vz * rz;
  const y = vx * ux + vy * uy + vz * uz;
  const th = Math.tan((FOV * Math.PI) / 360);
  const w = canvas.width;
  const h = canvas.height;
  const aspect = w / h;
  return {
    x: ((x / (z * th * aspect)) * 0.5 + 0.5) * w,
    y: (0.5 - (y / (z * th)) * 0.5) * h,
    z,
    pxPerUnit: h / 2 / (z * th)
  };
}

function pick(clientX: number, clientY: number): number {
  const rect = canvas.getBoundingClientRect();
  const sx = ((clientX - rect.left) / rect.width) * canvas.width;
  const sy = ((clientY - rect.top) / rect.height) * canvas.height;
  let best = -1;
  let bestZ = Infinity;
  PLANETS.forEach((p, i) => {
    const pr = project(current.position, planetPos[i]!);
    if (!pr) return;
    const radius = Math.max((p.size / 2) * pr.pxPerUnit * 1.15, 11);
    if (Math.hypot(pr.x - sx, pr.y - sy) <= radius && pr.z < bestZ) {
      best = i;
      bestZ = pr.z;
    }
  });
  return best;
}

let dragging = false;
let moved = 0;
let lastX = 0;
let lastY = 0;

canvas.addEventListener("pointerdown", (e) => {
  dragging = true;
  moved = 0;
  lastX = e.clientX;
  lastY = e.clientY;
  canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastX;
  const dy = e.clientY - lastY;
  lastX = e.clientX;
  lastY = e.clientY;
  moved += Math.abs(dx) + Math.abs(dy);
  if (focusIndex < 0 && moved > 4) {
    overview.yaw -= dx * 0.008;
    overview.pitch = Math.min(1.45, Math.max(0.05, overview.pitch + dy * 0.006));
  }
});
canvas.addEventListener("pointerup", (e) => {
  if (!dragging) return;
  dragging = false;
  canvas.releasePointerCapture?.(e.pointerId);
  if (moved <= 4) {
    const i = pick(e.clientX, e.clientY);
    if (i >= 0) setFocus(i);
    else unfocus();
  }
});
canvas.addEventListener("pointercancel", () => {
  dragging = false;
});
canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focusIndex >= 0) return;
    overview.dist = Math.min(DIST_MAX, Math.max(DIST_MIN, overview.dist * Math.exp(e.deltaY * 0.0012)));
  },
  { passive: false }
);
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------------------------------------------------------------- frame loop
function updateBodies(): void {
  PLANETS.forEach((p, i) => {
    const a = p.phase + (simT / orbitSeconds(p)) * Math.PI * 2;
    const x = Math.cos(a) * p.orbitR;
    const z = Math.sin(a) * p.orbitR;
    planetPos[i] = [x, 0, z];
    const node = app.nodes.require(`planet-${p.name}`);
    node.setPosition(x, 0, z);
    node.setRotation(p.tilt, simT * p.spin, 0);
    if (p.ring) app.nodes.require(`ring-${p.name}`).setPosition(x, 0, z).setRotation(p.tilt, 0, 0);
    for (const m of p.moons ?? []) {
      const ma = m.phase + simT * m.speed;
      app.nodes.require(`moon-${m.name}`).setPosition(x + Math.cos(ma) * m.r, 0, z + Math.sin(ma) * m.r);
    }
  });
}

let lastTime = -1;
app.onFrame((f) => {
  const realDt = lastTime < 0 ? 0 : Math.min(0.1, Math.max(0, f.time - lastTime));
  lastTime = f.time;
  if (!paused) simT += realDt;
  updateBodies();
  app.nodes.require("sun").setUniform?.("clk", simT);

  const desired = focusIndex >= 0 ? focusPose(focusIndex) : overviewPose();
  let pose = desired;
  if (transition) {
    transition.t += realDt;
    const k = Math.min(1, transition.t / TRANSITION_S);
    const e = easeInOutCubic(k);
    pose = { position: lerp3(transition.from.position, desired.position, e), target: lerp3(transition.from.target, desired.target, e) };
    if (k >= 1) transition = null;
  }
  current = pose;
  app.camera?.setPose({ position: pose.position, target: pose.target, up: [0, 1, 0], fov: FOV, near: 0.1, far: 3000 }, { cut: true });
});

// ---------------------------------------------------------------- exposed API
const w = window as unknown as Record<string, unknown>;
Object.defineProperty(window, "__TASK_STATE__", {
  configurable: false,
  enumerable: true,
  get: () => {
    const fp = focusIndex >= 0 ? planetPos[focusIndex]! : null;
    const cp = current.position;
    return Object.freeze({
      ready,
      focused: focusIndex >= 0 ? PLANETS[focusIndex]!.name : null,
      paused,
      planets: PLANETS.map((p, i) => ({ name: p.name, x: planetPos[i]![0], y: planetPos[i]![1], z: planetPos[i]![2] })),
      cameraDistanceToFocus: fp ? Math.hypot(cp[0] - fp[0], cp[1] - fp[1], cp[2] - fp[2]) : null
    });
  }
});
w["__focusPlanet"] = (name: string): void => focusPlanet(name);
w["__unfocus"] = (): void => unfocus();

updateBodies();
void app.ready().then(() => {
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      ready = true;
      w["__EVAL_READY__"] = true;
    })
  );
});
