import { camera, createAuraApp, effects, geometry, instances, material, primitives, scene, type AuraTransformSpec } from "@aura3d/engine";

type V3 = [number, number, number];

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: unknown;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

// ---------------------------------------------------------------- data
interface MoonDef { id: string; radius: number; orbitR: number; omega: number; phase: number; hex: string }
interface RingDef { inner: number; outer: number; tilt: V3 }
interface PlanetDef {
  name: string;
  radius: number;
  orbit: number; // scene units
  periodDays: number;
  distMkm: number;
  spin: number; // rad per sim second
  phase: number;
  focusDist: number;
  body: string; // GLSL snippet that assigns `col`
  atm: string;
  atmK: number;
  moon?: MoonDef;
  ring?: RingDef;
}

const f3 = (n: number): string => n.toFixed(3);
const lin = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.pow(v / 255, 2.2).toFixed(4));
  return `vec3(${c.join(",")})`;
};

const generic = (a: string, b: string, c: string, bands: number, sc: number, dist: number, cm: number): string =>
  `float n = fbm(p * ${f3(sc)});
  float s = ${bands > 0 ? `0.5 + 0.5 * sin(p.y * ${f3(bands)} + n * ${f3(dist)})` : "n"};
  col = mix(${lin(a)}, ${lin(b)}, s);
  col = mix(col, ${lin(c)}, smoothstep(0.55, 0.85, fbm(p * ${f3(sc * 1.8)} + vec3(3.0))) * ${f3(cm)});`;

const earthBody = `float n = fbm(p * 2.6);
  float land = smoothstep(0.50, 0.535, n);
  vec3 ocean = mix(${lin("#123a82")}, ${lin("#2a6bc4")}, fbm(p * 6.0));
  vec3 ground = mix(${lin("#3b7d3c")}, ${lin("#a6945a")}, smoothstep(0.55, 0.75, fbm(p * 5.0 + vec3(4.0))));
  col = mix(ocean, ground, land);
  float ice = smoothstep(0.82, 0.9, abs(p.y));
  float cloud = smoothstep(0.52, 0.8, fbm(p * 4.5 + vec3(9.0))) * 0.75;
  col = mix(col, vec3(0.85), max(ice, cloud));`;

const PLANETS: PlanetDef[] = [
  { name: "Mercury", radius: 1.0, orbit: 18, periodDays: 88, distMkm: 57.9, spin: 0.6, phase: 0.4, focusDist: 6,
    body: generic("#5f5a56", "#a69f95", "#3d3a38", 0, 6, 0, 0.6), atm: lin("#888888"), atmK: 0.05 },
  { name: "Venus", radius: 1.8, orbit: 25, periodDays: 225, distMkm: 108.2, spin: -0.4, phase: 2.1, focusDist: 9,
    body: generic("#c9a05a", "#f1dba5", "#a8793a", 6, 3, 3, 0.5), atm: lin("#ffd9a0"), atmK: 0.5 },
  { name: "Earth", radius: 2.0, orbit: 33, periodDays: 365, distMkm: 149.6, spin: 1.2, phase: 4.0, focusDist: 12,
    body: earthBody, atm: lin("#5aa0ff"), atmK: 0.9,
    moon: { id: "moon-earth", radius: 0.55, orbitR: 4.6, omega: 0.9, phase: 1.0, hex: "#9a9a9c" } },
  { name: "Mars", radius: 1.4, orbit: 42, periodDays: 687, distMkm: 227.9, spin: 1.1, phase: 5.2, focusDist: 8,
    body: generic("#8c3d22", "#d08050", "#5e2a18", 0, 4.5, 0, 0.7), atm: lin("#e0906a"), atmK: 0.2 },
  { name: "Jupiter", radius: 4.5, orbit: 56, periodDays: 4333, distMkm: 778.5, spin: 2.0, phase: 0.9, focusDist: 22,
    body: generic("#b98a5e", "#efdcc0", "#8a4a32", 15, 3, 2.5, 0.6), atm: lin("#e8c9a0"), atmK: 0.25,
    moon: { id: "moon-jupiter", radius: 0.7, orbitR: 8.5, omega: 0.55, phase: 3.0, hex: "#b8a58a" } },
  { name: "Saturn", radius: 3.8, orbit: 70, periodDays: 10759, distMkm: 1432, spin: 1.8, phase: 3.1, focusDist: 28,
    body: generic("#cdb27a", "#f2e4b4", "#a8895a", 11, 2.5, 1.2, 0.4), atm: lin("#f0dca8"), atmK: 0.25,
    ring: { inner: 5.0, outer: 8.8, tilt: [0.42, 0, 0.2] } },
  { name: "Uranus", radius: 2.8, orbit: 83, periodDays: 30687, distMkm: 2867, spin: -1.4, phase: 5.8, focusDist: 15,
    body: generic("#7fd3d8", "#b4f2f2", "#5ab4c0", 4, 2.5, 0.6, 0.3), atm: lin("#a0f0f4"), atmK: 0.6 },
  { name: "Neptune", radius: 2.7, orbit: 95, periodDays: 60190, distMkm: 4515, spin: 1.5, phase: 1.7, focusDist: 15,
    body: generic("#2c4cd0", "#5f8cff", "#1c2f94", 6, 3, 1.6, 0.5), atm: lin("#6a9aff"), atmK: 0.7 }
];

const SUN_RADIUS = 7;
const orbitOmega = (p: PlanetDef): number => (Math.PI * 2) / (12 * Math.sqrt(p.periodDays / 88));

// ---------------------------------------------------------------- shaders
const NOISE = `float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float vnoise(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 4; i++) { s += a * vnoise(p); p *= 2.07; a *= 0.5; } return s; }`;

const VERT = `out vec3 vLocal; out vec3 vWorld; out vec3 vN;
void main() {
  vLocal = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

const planetMaterial = (body: string, atm: string, atmK: number) =>
  material.custom({
    glsl: {
      vertex: VERT,
      fragment: `in vec3 vLocal; in vec3 vWorld; in vec3 vN; out vec4 outColor;
${NOISE}
void main() {
  vec3 p = normalize(vLocal);
  vec3 col;
  ${body}
  vec3 N = normalize(vN);
  vec3 L = normalize(-vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float d = clamp(dot(N, L) * 1.15 + 0.08, 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 3.0);
  vec3 c = col * (0.05 + 1.3 * d) + ${atm} * rim * ${f3(atmK)} * (0.15 + d);
  outColor = vec4(c, 1.0);
}`
    }
  });

const sunMaterial = material.custom({
  glsl: {
    vertex: VERT,
    fragment: `in vec3 vLocal; in vec3 vWorld; in vec3 vN; out vec4 outColor;
${NOISE}
void main() {
  vec3 p = normalize(vLocal);
  float n = fbm(p * 4.0) * 0.6 + fbm(p * 11.0) * 0.4;
  vec3 col = mix(vec3(1.0, 0.32, 0.04), vec3(1.0, 0.82, 0.38), smoothstep(0.25, 0.75, n));
  float facing = clamp(dot(normalize(vN), normalize(cameraPosition - vWorld)), 0.0, 1.0);
  col *= (0.65 + 0.35 * facing) * 2.0;
  outColor = vec4(col, 1.0);
}`
  }
});

const haloMaterial = material.custom({
  glsl: {
    vertex: VERT,
    fragment: `in vec3 vLocal; in vec3 vWorld; in vec3 vN; out vec4 outColor;
void main() {
  float facing = clamp(dot(normalize(vN), normalize(cameraPosition - vWorld)), 0.0, 1.0);
  float a = pow(facing, 2.6) * 0.5;
  outColor = vec4(vec3(1.0, 0.55, 0.15) * a, a);
}`
  },
  transparent: true,
  depthWrite: false,
  blending: "additive"
});

const ringMaterial = (inner: number, outer: number) =>
  material.custom({
    glsl: {
      vertex: VERT,
      fragment: `in vec3 vLocal; in vec3 vWorld; in vec3 vN; out vec4 outColor;
void main() {
  float r = length(vLocal.xz);
  float t = clamp((r - ${f3(inner)}) / ${f3(outer - inner)}, 0.0, 1.0);
  float bands = 0.5 + 0.5 * sin(t * 40.0 + sin(t * 9.0) * 2.0);
  float gap = smoothstep(0.50, 0.54, t) * (1.0 - smoothstep(0.58, 0.62, t));
  float alpha = (0.35 + 0.55 * bands) * (1.0 - gap * 0.92) * smoothstep(0.0, 0.06, t) * (1.0 - smoothstep(0.94, 1.0, t));
  vec3 col = mix(${lin("#a89472")}, ${lin("#e8d9b0")}, bands);
  vec3 L = normalize(-vWorld);
  float lit = 0.35 + 0.65 * abs(dot(normalize(vN), L));
  outColor = vec4(col * lit * 1.4, alpha);
}`
    },
    transparent: true,
    depthWrite: false,
    side: "double"
  });

const orbitMaterial = material.custom({
  glsl: { fragment: `out vec4 outColor;
void main() { outColor = vec4(0.22, 0.30, 0.46, 1.0); }` },
  side: "double"
});

const starMaterial = (v: number) =>
  material.custom({
    glsl: { fragment: `out vec4 outColor;
void main() { outColor = vec4(vec3(${f3(v)}), 1.0); }` }
  });

// ---------------------------------------------------------------- geometry
const SEG = 160;
const orbitGeometry = (r: number, w: number) => {
  const positions = new Float32Array(SEG * 4 * 3);
  const normals = new Float32Array(SEG * 4 * 3);
  const indices: number[] = [];
  for (let i = 0; i < SEG; i += 1) {
    const a = (i / SEG) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), b = i * 4;
    positions.set([(r - w / 2) * c, 0, (r - w / 2) * s], (b + 0) * 3);
    positions.set([(r + w / 2) * c, 0, (r + w / 2) * s], (b + 1) * 3);
    positions.set([r * c, -w / 2, r * s], (b + 2) * 3);
    positions.set([r * c, w / 2, r * s], (b + 3) * 3);
    normals.set([0, 1, 0], (b + 0) * 3);
    normals.set([0, 1, 0], (b + 1) * 3);
    normals.set([c, 0, s], (b + 2) * 3);
    normals.set([c, 0, s], (b + 3) * 3);
    const nb = ((i + 1) % SEG) * 4;
    indices.push(b, b + 1, nb, b + 1, nb + 1, nb, b + 2, b + 3, nb + 2, b + 3, nb + 3, nb + 2);
  }
  return geometry.define({
    positions, normals, indices,
    bounds: { min: [-r - w, -w, -r - w], max: [r + w, w, r + w] }
  });
};

const annulusGeometry = (inner: number, outer: number) => {
  const n = 96;
  const positions = new Float32Array(n * 2 * 3);
  const normals = new Float32Array(n * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a), b = i * 2;
    positions.set([inner * c, 0, inner * s], b * 3);
    positions.set([outer * c, 0, outer * s], (b + 1) * 3);
    normals.set([0, 1, 0], b * 3);
    normals.set([0, 1, 0], (b + 1) * 3);
    const nb = ((i + 1) % n) * 2;
    indices.push(b, b + 1, nb, b + 1, nb + 1, nb);
  }
  return geometry.define({
    positions, normals, indices,
    bounds: { min: [-outer, -0.1, -outer], max: [outer, 0.1, outer] }
  });
};

// ---------------------------------------------------------------- scene
let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const brightStars: AuraTransformSpec[] = [];
const dimStars: AuraTransformSpec[] = [];
for (let i = 0; i < 700; i += 1) {
  const u = rand() * 2 - 1, th = rand() * Math.PI * 2, rr = Math.sqrt(1 - u * u), d = 800 + rand() * 200;
  const bright = i < 140;
  const sz = bright ? 3 + rand() * 1.5 : 2 + rand();
  (bright ? brightStars : dimStars).push({ position: [rr * Math.cos(th) * d, u * d, rr * Math.sin(th) * d], scale: [sz, sz, sz] });
}

const OVERVIEW = { yaw: 0.35, pitch: 0.62, dist: 175 };
const MIN_DIST = 50, MAX_DIST = 320;
const overviewPose = (): { pos: V3; tgt: V3 } => {
  const cp = Math.cos(OVERVIEW.pitch);
  return {
    pos: [OVERVIEW.dist * cp * Math.sin(OVERVIEW.yaw), OVERVIEW.dist * Math.sin(OVERVIEW.pitch), OVERVIEW.dist * cp * Math.cos(OVERVIEW.yaw)],
    tgt: [0, 0, 0]
  };
};
const FOV = 45;
const START = overviewPose();

let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: START.pos, target: START.tgt, fov: FOV, near: 0.5, far: 2500 }))
  .add(instances.box({ name: "stars-bright", transforms: brightStars, material: starMaterial(1) }))
  .add(instances.box({ name: "stars-dim", transforms: dimStars, material: starMaterial(0.45) }))
  .add(primitives.sphere({ name: "sun", size: SUN_RADIUS * 2, material: sunMaterial, castShadow: false, receiveShadow: false, params: { widthSegments: 64, heightSegments: 40 } })
    .runtime({ id: "sun", mutable: true }))
  .add(primitives.sphere({ name: "sun-halo", size: SUN_RADIUS * 3.1, material: haloMaterial, castShadow: false, receiveShadow: false, params: { widthSegments: 48, heightSegments: 32 } }))
  .add(effects.bloom({ intensity: 0.55, threshold: 0.85, radius: 0.6 }));

for (const p of PLANETS) {
  const id = p.name.toLowerCase();
  sc = sc
    .add(geometry.custom(orbitGeometry(p.orbit, 0.3), { name: `orbit-${id}`, material: orbitMaterial, castShadow: false, receiveShadow: false }))
    .add(primitives.sphere({
      name: id, size: p.radius * 2, material: planetMaterial(p.body, p.atm, p.atmK),
      castShadow: false, receiveShadow: false, params: { widthSegments: 64, heightSegments: 40 }
    }).position(p.orbit * Math.cos(p.phase), 0, p.orbit * Math.sin(p.phase)).runtime({ id, mutable: true }));
  if (p.ring) {
    sc = sc.add(geometry.custom(annulusGeometry(p.ring.inner, p.ring.outer), {
      name: `ring-${id}`, material: ringMaterial(p.ring.inner, p.ring.outer), castShadow: false, receiveShadow: false
    }).position(p.orbit * Math.cos(p.phase), 0, p.orbit * Math.sin(p.phase)).runtime({ id: `ring-${id}`, mutable: true }));
  }
  if (p.moon) {
    sc = sc.add(primitives.sphere({
      name: p.moon.id, size: p.moon.radius * 2,
      material: planetMaterial(generic(p.moon.hex, "#d8d8da", "#5a5a5e", 0, 7, 0, 0.7), lin("#999999"), 0.05),
      castShadow: false, receiveShadow: false
    }).position(p.orbit * Math.cos(p.phase) + p.moon.orbitR, 0, p.orbit * Math.sin(p.phase)).runtime({ id: p.moon.id, mutable: true }));
  }
}

const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) throw new Error("canvas #app not found");
const app = createAuraApp("#app", { scene: sc });

// ---------------------------------------------------------------- state
let simT = 0;
let paused = false;
let focused: PlanetDef | null = null;
const positions = new Map<string, V3>();
const planetPos = (p: PlanetDef, t: number): V3 => {
  const a = p.phase + orbitOmega(p) * t;
  return [p.orbit * Math.cos(a), 0, p.orbit * Math.sin(a)];
};
for (const p of PLANETS) positions.set(p.name, planetPos(p, 0));
const posOf = (p: PlanetDef): V3 => positions.get(p.name) ?? [0, 0, 0];

let camPos: V3 = [...START.pos];
let camTgt: V3 = [...START.tgt];
let trans: { t0: number; fromPos: V3; fromTgt: V3 } | null = null;
const TRANS_MS = 1500;

const startTransition = (): void => {
  trans = { t0: performance.now(), fromPos: [...camPos], fromTgt: [...camTgt] };
};

// ---------------------------------------------------------------- DOM
const rect0 = canvas.getBoundingClientRect();
const mkStyle = (el: HTMLElement, css: string): void => { el.style.cssText = css; };

const pauseBtn = document.createElement("button");
pauseBtn.id = "pause-btn";
pauseBtn.type = "button";
pauseBtn.textContent = "Pause";
mkStyle(pauseBtn, `position:absolute;left:${rect0.left + 8}px;top:${rect0.top + 8}px;padding:4px 12px;font:600 12px system-ui,sans-serif;color:#e8f0ff;background:rgba(20,30,55,.85);border:1px solid #4a6aa8;border-radius:4px;cursor:pointer;z-index:10`);
document.body.appendChild(pauseBtn);

const panel = document.createElement("div");
panel.id = "info-panel";
mkStyle(panel, `position:absolute;left:${rect0.left + rect0.width - 218}px;top:${rect0.top + 8}px;width:200px;padding:8px 10px;font:12px/1.5 system-ui,sans-serif;color:#e8f0ff;background:rgba(10,16,34,.82);border:1px solid #4a6aa8;border-radius:6px;pointer-events:none;display:none;z-index:10`);
const panelName = document.createElement("div");
mkStyle(panelName, "font:700 16px system-ui,sans-serif;margin-bottom:2px");
const panelPeriod = document.createElement("div");
const panelDist = document.createElement("div");
panel.append(panelName, panelPeriod, panelDist);
document.body.appendChild(panel);

const hint = document.createElement("div");
hint.textContent = "Click a planet to focus · Esc / click empty space to return · drag to orbit · scroll to zoom";
mkStyle(hint, `position:absolute;left:${rect0.left + 8}px;top:${rect0.top + rect0.height - 22}px;font:11px system-ui,sans-serif;color:#8fa4d0;pointer-events:none;z-index:10`);
document.body.appendChild(hint);

const syncPause = (): void => { pauseBtn.textContent = paused ? "Play" : "Pause"; };
pauseBtn.addEventListener("click", () => {
  paused = !paused;
  syncPause();
  pauseBtn.blur();
});

// ---------------------------------------------------------------- focus API
const focusPlanet = (name: string): void => {
  const p = PLANETS.find((q) => q.name.toLowerCase() === String(name).toLowerCase());
  if (!p || p === focused) return;
  focused = p;
  startTransition();
  panelName.textContent = p.name;
  panelPeriod.textContent = `Orbital period: ${p.periodDays.toLocaleString("en-US")} Earth days`;
  panelDist.textContent = `Distance from star: ${p.distMkm.toLocaleString("en-US")} million km`;
  panel.style.display = "block";
};
const unfocus = (): void => {
  if (!focused) return;
  focused = null;
  startTransition();
  panel.style.display = "none";
};
window.__focusPlanet = focusPlanet;
window.__unfocus = unfocus;
window.addEventListener("keydown", (e) => { if (e.key === "Escape") unfocus(); });

// ---------------------------------------------------------------- picking
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

const pick = (cx: number, cy: number): PlanetDef | null => {
  const r = canvas.getBoundingClientRect();
  const nx = ((cx - r.left) / r.width) * 2 - 1;
  const ny = 1 - ((cy - r.top) / r.height) * 2;
  const aspect = r.width / r.height;
  const th = Math.tan((FOV * Math.PI) / 360);
  const fwd = norm(sub(camTgt, camPos));
  const right = norm(cross(fwd, [0, 1, 0]));
  const up = cross(right, fwd);
  const dir = norm([
    fwd[0] + right[0] * nx * th * aspect + up[0] * ny * th,
    fwd[1] + right[1] * nx * th * aspect + up[1] * ny * th,
    fwd[2] + right[2] * nx * th * aspect + up[2] * ny * th
  ]);
  let best: PlanetDef | null = null;
  let bestT = Infinity;
  for (const p of PLANETS) {
    const c = posOf(p);
    const oc = sub(c, camPos);
    const t = dot(oc, dir);
    if (t <= 0) continue;
    const perp2 = dot(oc, oc) - t * t;
    const pxWorld = (2 * t * th) / r.height;
    const pr = Math.max(p.radius * 1.2, pxWorld * 9);
    if (perp2 <= pr * pr && t < bestT) { best = p; bestT = t; }
  }
  return best;
};

// ---------------------------------------------------------------- input
let down: { x: number; y: number; lx: number; ly: number; moved: boolean; id: number } | null = null;
canvas.style.touchAction = "none";
canvas.addEventListener("pointerdown", (e) => {
  down = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY, moved: false, id: e.pointerId };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener("pointermove", (e) => {
  if (!down || e.pointerId !== down.id) return;
  if (Math.hypot(e.clientX - down.x, e.clientY - down.y) > 4) down.moved = true;
  if (down.moved && !focused && !trans) {
    OVERVIEW.yaw -= (e.clientX - down.lx) * 0.008;
    OVERVIEW.pitch = Math.min(1.45, Math.max(0.08, OVERVIEW.pitch + (e.clientY - down.ly) * 0.006));
  }
  down.lx = e.clientX;
  down.ly = e.clientY;
});
const endPointer = (e: PointerEvent, allowClick: boolean): void => {
  if (!down || e.pointerId !== down.id) return;
  const wasClick = !down.moved;
  down = null;
  if (allowClick && wasClick) {
    const hit = pick(e.clientX, e.clientY);
    if (hit) focusPlanet(hit.name);
    else unfocus();
  }
};
canvas.addEventListener("pointerup", (e) => endPointer(e, true));
canvas.addEventListener("pointercancel", (e) => endPointer(e, false));
canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  if (focused || trans) return;
  OVERVIEW.dist = Math.min(MAX_DIST, Math.max(MIN_DIST, OVERVIEW.dist * Math.exp(e.deltaY * 0.001)));
}, { passive: false });

// ---------------------------------------------------------------- read-only task state
const stateObj = {
  get ready(): boolean { return ready; },
  get focused(): string | null { return focused ? focused.name : null; },
  get paused(): boolean { return paused; },
  get planets(): { name: string; x: number; y: number; z: number }[] {
    return PLANETS.map((p) => { const v = posOf(p); return { name: p.name, x: v[0], y: v[1], z: v[2] }; });
  },
  get cameraDistanceToFocus(): number | null {
    if (!focused) return null;
    const v = sub(camPos, posOf(focused));
    return Math.hypot(v[0], v[1], v[2]);
  }
};
let ready = false;
Object.defineProperty(window, "__TASK_STATE__", { value: Object.freeze(stateObj), writable: false, enumerable: true, configurable: false });

// ---------------------------------------------------------------- frame loop
const ease = (u: number): number => (u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2);
const lerp3 = (a: V3, b: V3, t: number): V3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const focusPose = (p: PlanetDef): { pos: V3; tgt: V3 } => {
  const c = posOf(p);
  const rad = norm([c[0], 0, c[2]]);
  const tan: V3 = [-rad[2], 0, rad[0]];
  const dir = norm([-rad[0] * 0.55 + tan[0] * 0.65, 0.3, -rad[2] * 0.55 + tan[2] * 0.65]);
  return { pos: [c[0] + dir[0] * p.focusDist, c[1] + dir[1] * p.focusDist, c[2] + dir[2] * p.focusDist], tgt: c };
};

app.onFrame((f) => {
  const dt = Math.min(Math.max(f.dt, 0), 0.1);
  if (!paused) simT += dt;

  for (const p of PLANETS) {
    const id = p.name.toLowerCase();
    const v = planetPos(p, simT);
    positions.set(p.name, v);
    app.nodes.require(id).setPosition(v[0], v[1], v[2]);
    app.nodes.require(id).setRotation(0, p.spin * simT, 0);
    if (p.ring) {
      const rn = app.nodes.require(`ring-${id}`);
      rn.setPosition(v[0], v[1], v[2]);
      rn.setRotation(p.ring.tilt[0], p.ring.tilt[1], p.ring.tilt[2]);
    }
    if (p.moon) {
      const m = p.moon;
      const a = m.phase + m.omega * simT;
      app.nodes.require(m.id).setPosition(v[0] + Math.cos(a) * m.orbitR, Math.sin(a) * m.orbitR * 0.12, v[2] + Math.sin(a) * m.orbitR);
    }
  }
  app.nodes.require("sun").setRotation(0, simT * 0.1, 0);

  const desired = focused ? focusPose(focused) : overviewPose();
  if (trans) {
    const u = Math.min(1, (performance.now() - trans.t0) / TRANS_MS);
    const e = ease(u);
    camPos = lerp3(trans.fromPos, desired.pos, e);
    camTgt = lerp3(trans.fromTgt, desired.tgt, e);
    if (u >= 1) trans = null;
  } else {
    camPos = desired.pos;
    camTgt = desired.tgt;
  }
  app.camera?.setPose({ position: camPos, target: camTgt }, { cut: true });
});

await app.ready();
ready = true;
requestAnimationFrame(() => requestAnimationFrame(() => { window.__EVAL_READY__ = true; }));
