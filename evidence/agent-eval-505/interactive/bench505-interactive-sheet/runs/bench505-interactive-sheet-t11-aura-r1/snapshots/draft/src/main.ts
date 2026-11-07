import {
  camera,
  createAuraApp,
  effects,
  geometry,
  instances,
  material,
  primitives,
  scene,
  type AuraCustomGeometrySpec,
  type AuraTransformSpec
} from "@aura3d/engine";

type V3 = [number, number, number];

interface TaskState {
  readonly ready: boolean;
  readonly focused: string | null;
  readonly paused: boolean;
  readonly planets: ReadonlyArray<{ name: string; x: number; y: number; z: number }>;
  readonly cameraDistanceToFocus: number | null;
}

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: TaskState;
    __focusPlanet?: (name: string) => void;
    __unfocus?: () => void;
  }
}

// ---------------------------------------------------------------- helpers
const lin = (hex: string): string => {
  const n = parseInt(hex.slice(1), 16);
  const c = (v: number): string => ((v / 255) ** 2.2).toFixed(4);
  return `vec3(${c((n >> 16) & 255)}, ${c((n >> 8) & 255)}, ${c(n & 255)})`;
};
const fl = (n: number): string => n.toFixed(3);

const NOISE_GLSL = `
float h3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float n3(vec3 x) {
  vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(h3(i), h3(i + vec3(1.0, 0.0, 0.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 0.0)), h3(i + vec3(1.0, 1.0, 0.0)), f.x), f.y),
             mix(mix(h3(i + vec3(0.0, 0.0, 1.0)), h3(i + vec3(1.0, 0.0, 1.0)), f.x), mix(h3(i + vec3(0.0, 1.0, 1.0)), h3(i + vec3(1.0, 1.0, 1.0)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float a = 0.5; float s = 0.0; for (int i = 0; i < 4; i++) { s += a * n3(p); p = p * 2.03 + vec3(1.7, 9.2, 3.1); a *= 0.5; } return s; }
`;

const SPHERE_VERTEX = `out vec3 vDir; out vec3 vWorld; out vec3 vN;
void main() {
  vDir = normalize(position);
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = mat3(modelMatrix) * normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;

interface Look {
  c1: string;
  c2: string;
  c3: string;
  freq: number;
  bands: number;
  bandMix: number;
  sharp: number;
  spot: number;
  atm: number;
  atmCol: string;
}

const planetMaterial = (l: Look) =>
  material.custom({
    glsl: {
      vertex: SPHERE_VERTEX,
      fragment: `in vec3 vDir; in vec3 vWorld; in vec3 vN; out vec4 outColor;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float rock = fbm(d * ${fl(l.freq)});
  float band = 0.5 + 0.5 * sin(d.y * ${fl(l.bands)} + fbm(d * 2.5) * 3.2);
  float t = mix(rock, band, ${fl(l.bandMix)});
  vec3 col = mix(${lin(l.c1)}, ${lin(l.c2)}, smoothstep(${fl(0.5 - l.sharp)}, ${fl(0.5 + l.sharp)}, t));
  float spot = smoothstep(0.62, 0.85, fbm(d * 7.0 + vec3(3.0)));
  col = mix(col, ${lin(l.c3)}, spot * ${fl(l.spot)});
  vec3 n = normalize(vN);
  vec3 L = normalize(-vWorld);
  vec3 V = normalize(cameraPosition - vWorld);
  float diff = max(dot(n, L), 0.0);
  float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
  vec3 lit = col * (0.04 + 1.1 * diff) + ${lin(l.atmCol)} * fres * (0.12 + diff) * ${fl(l.atm)};
  outColor = vec4(lit, 1.0);
}`
    }
  });

const sunMaterial = material.custom({
  glsl: {
    vertex: SPHERE_VERTEX,
    fragment: `in vec3 vDir; in vec3 vWorld; in vec3 vN; out vec4 outColor;
${NOISE_GLSL}
void main() {
  vec3 d = normalize(vDir);
  float t = fbm(d * 3.0 + vec3(sunClock * 0.08, 0.0, sunClock * 0.05));
  float g = fbm(d * 9.0 - vec3(sunClock * 0.12));
  vec3 col = mix(vec3(1.0, 0.30, 0.02), vec3(1.0, 0.72, 0.22), smoothstep(0.25, 0.8, t));
  col = mix(col, vec3(1.0, 0.95, 0.7), smoothstep(0.55, 0.85, g) * 0.5);
  float mu = max(dot(normalize(vN), normalize(cameraPosition - vWorld)), 0.0);
  col *= 0.55 + 0.45 * pow(mu, 0.6);
  outColor = vec4(col * 1.35, 1.0);
}`
  },
  uniforms: { sunClock: { type: "f32", value: 0 } }
});

const haloMaterial = material.custom({
  glsl: {
    vertex: SPHERE_VERTEX,
    fragment: `in vec3 vDir; in vec3 vWorld; in vec3 vN; out vec4 outColor;
void main() {
  float d = max(dot(normalize(vN), normalize(cameraPosition - vWorld)), 0.0);
  float a = pow(d, 2.4);
  outColor = vec4(vec3(1.0, 0.48, 0.1) * a * 0.7, a * 0.7);
}`
  },
  transparent: true,
  depthWrite: false,
  blending: "additive",
  side: "front"
});

const orbitLineMaterial = material.custom({
  glsl: { fragment: `out vec4 outColor;\nvoid main() { outColor = vec4(0.3, 0.4, 0.7, 0.5); }` },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const RING_IN = 1.35;
const RING_OUT = 2.35;

const ringMaterial = material.custom({
  glsl: {
    vertex: `out vec3 vPos;
void main() {
  vPos = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vPos; out vec4 outColor;
void main() {
  float r = length(vPos.xz);
  float t = clamp((r - ${fl(3.2 * RING_IN)}) / ${fl(3.2 * (RING_OUT - RING_IN))}, 0.0, 1.0);
  float band = 0.5 + 0.5 * sin(t * 70.0) * sin(t * 23.0 + 1.0);
  float gap = smoothstep(0.58, 0.6, t) * (1.0 - smoothstep(0.64, 0.66, t));
  float edge = smoothstep(0.0, 0.05, t) * (1.0 - smoothstep(0.93, 1.0, t));
  float a = edge * (0.35 + 0.6 * band) * (1.0 - 0.9 * gap);
  vec3 col = mix(${lin("#8a7550")}, ${lin("#e6d3a3")}, band);
  outColor = vec4(col, a);
}`
  },
  transparent: true,
  depthWrite: false,
  side: "double"
});

const annulus = (inner: number, outer: number, seg: number): AuraCustomGeometrySpec => {
  const positions = new Float32Array((seg + 1) * 6);
  const normals = new Float32Array((seg + 1) * 6);
  const indices: number[] = [];
  for (let i = 0; i <= seg; i += 1) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.set([c * inner, 0, s * inner, c * outer, 0, s * outer], i * 6);
    normals[i * 6 + 1] = 1;
    normals[i * 6 + 4] = 1;
    if (i < seg) {
      const v = i * 2;
      indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
    }
  }
  return geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [-outer, -0.1, -outer], max: [outer, 0.1, outer] }
  });
};

// ---------------------------------------------------------------- data
interface PlanetDef {
  name: string;
  a: number;
  r: number;
  periodDays: number;
  distMkm: number;
  spin: number;
  phase: number;
  focusMul: number;
  look: Look;
}

const L = (p: Partial<Look> & Pick<Look, "c1" | "c2">): Look => ({
  c3: p.c2,
  freq: 4,
  bands: 8,
  bandMix: 0,
  sharp: 0.35,
  spot: 0,
  atm: 0,
  atmCol: "#ffffff",
  ...p
});

const DEFS: PlanetDef[] = [
  { name: "Mercury", a: 14, r: 0.9, periodDays: 88, distMkm: 57.9, spin: 0.6, phase: 0.5, focusMul: 5,
    look: L({ c1: "#5f5b57", c2: "#b6aea5", c3: "#413d3a", freq: 6, spot: 0.5 }) },
  { name: "Venus", a: 20, r: 1.5, periodDays: 225, distMkm: 108.2, spin: -0.3, phase: 2.4, focusMul: 5,
    look: L({ c1: "#c19a52", c2: "#f1dba6", bands: 6, bandMix: 0.55, atm: 0.5, atmCol: "#ffd9a0" }) },
  { name: "Earth", a: 27, r: 1.6, periodDays: 365, distMkm: 149.6, spin: 1.2, phase: 4.1, focusMul: 5.5,
    look: L({ c1: "#1b4a9a", c2: "#3f8a45", c3: "#ffffff", freq: 3.2, sharp: 0.03, spot: 0.85, atm: 1.2, atmCol: "#6aa6ff" }) },
  { name: "Mars", a: 34, r: 1.2, periodDays: 687, distMkm: 227.9, spin: 1.1, phase: 1.3, focusMul: 5,
    look: L({ c1: "#86371b", c2: "#cb6c3c", c3: "#e8d8c8", freq: 4.5, sharp: 0.25, spot: 0.3, atm: 0.2, atmCol: "#ff9966" }) },
  { name: "Jupiter", a: 46, r: 3.8, periodDays: 4333, distMkm: 778.5, spin: 2.0, phase: 5.2, focusMul: 5,
    look: L({ c1: "#a67c52", c2: "#ecd9b6", c3: "#9c4426", bands: 16, bandMix: 0.9, spot: 0.8 }) },
  { name: "Saturn", a: 60, r: 3.2, periodDays: 10759, distMkm: 1434, spin: 1.8, phase: 3.3, focusMul: 8,
    look: L({ c1: "#c2a56d", c2: "#f1e3b8", bands: 12, bandMix: 0.95, spot: 0.15 }) },
  { name: "Uranus", a: 72, r: 2.2, periodDays: 30687, distMkm: 2871, spin: -1.0, phase: 0.2, focusMul: 5,
    look: L({ c1: "#86d0d4", c2: "#bff0f0", bands: 4, bandMix: 0.5, atm: 0.7, atmCol: "#a0f0f0" }) },
  { name: "Neptune", a: 83, r: 2.1, periodDays: 60190, distMkm: 4495, spin: 1.0, phase: 2.9, focusMul: 5,
    look: L({ c1: "#2442c0", c2: "#5a82ff", c3: "#dde8ff", bands: 8, bandMix: 0.6, spot: 0.5, atm: 0.8, atmCol: "#6c8cff" }) }
];

const SUN_R = 6;
const orbitSeconds = (a: number): number => 12 * (a / 27) ** 1.5;
const MOON_HOST = "Earth";
const MOON_R = 0.42;
const MOON_ORBIT = 3.4;
const MOON_SECONDS = 5;
const SATURN = "Saturn";

// ---------------------------------------------------------------- scene
let seed = 987654;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);

const starT: AuraTransformSpec[] = [];
const starC: string[] = [];
for (let i = 0; i < 700; i += 1) {
  const u = rand() * 2 - 1;
  const phi = rand() * Math.PI * 2;
  const s = Math.sqrt(1 - u * u);
  const rad = 450 + rand() * 60;
  const size = 0.9 + rand() * 1.4;
  starT.push({
    position: [Math.cos(phi) * s * rad, u * rad, Math.sin(phi) * s * rad],
    rotation: [rand() * 3, rand() * 3, rand() * 3],
    scale: [size, size, size]
  });
  starC.push(`hsl(${rand() < 0.5 ? 215 : 40}, ${Math.floor(rand() * 40)}%, ${80 + Math.floor(rand() * 20)}%)`);
}

const OVERVIEW_FOV = 45;
let yaw = 0.35;
let pitch = 0.6;
let distTarget = 150;
let distCur = 150;
const MIN_DIST = 50;
const MAX_DIST = 260;

const overviewPose = (): { p: V3; t: V3 } => ({
  p: [distCur * Math.cos(pitch) * Math.sin(yaw), distCur * Math.sin(pitch), distCur * Math.cos(pitch) * Math.cos(yaw)],
  t: [0, 0, 0]
});

const startPose = overviewPose();

let sc = scene({ background: "#02030a" })
  .camera(camera.perspective({ position: startPose.p, target: startPose.t, fov: OVERVIEW_FOV, near: 0.3, far: 1600 }))
  .add(effects.bloom({ intensity: 0.55, threshold: 0.85, radius: 0.5 }))
  .add(
    instances.box({
      name: "stars",
      transforms: starT,
      colors: starC,
      material: material.emissive({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 2.5 }),
      castShadow: false,
      receiveShadow: false
    })
  )
  .add(
    primitives
      .sphere({ name: "sun", size: SUN_R * 2, material: sunMaterial, castShadow: false, receiveShadow: false, params: { widthSegments: 48, heightSegments: 32 } })
      .runtime({ id: "sun", mutable: true })
  )
  .add(primitives.sphere({ name: "sun-halo", size: SUN_R * 3.1, material: haloMaterial, castShadow: false, receiveShadow: false, params: { widthSegments: 40, heightSegments: 24 } }));

DEFS.forEach((d, i) => {
  sc = sc
    .add(geometry.custom(annulus(d.a - 0.11, d.a + 0.11, 192), { name: `orbit-${d.name}`, material: orbitLineMaterial, castShadow: false, receiveShadow: false }))
    .add(
      primitives
        .sphere({ name: d.name, size: d.r * 2, material: planetMaterial(d.look), castShadow: false, receiveShadow: false, params: { widthSegments: 48, heightSegments: 32 } })
        .position(d.a, 0, 0)
        .runtime({ id: `planet-${i}`, mutable: true })
    );
  if (d.name === SATURN) {
    sc = sc.add(
      geometry
        .custom(annulus(d.r * RING_IN, d.r * RING_OUT, 128), { name: "saturn-ring", material: ringMaterial, castShadow: false, receiveShadow: false })
        .rotate(0.42, 0, 0.12)
        .runtime({ id: "ring", mutable: true })
    );
  }
  if (d.name === MOON_HOST) {
    sc = sc.add(
      primitives
        .sphere({
          name: "Moon",
          size: MOON_R * 2,
          material: planetMaterial(L({ c1: "#555555", c2: "#b2b2b2", c3: "#3a3a3a", freq: 7, sharp: 0.25, spot: 0.6 })),
          castShadow: false,
          receiveShadow: false,
          params: { widthSegments: 24, heightSegments: 16 }
        })
        .runtime({ id: "moon", mutable: true })
    );
  }
});

const app = createAuraApp("#app", { scene: sc });
const canvas = document.querySelector<HTMLCanvasElement>("#app");
if (!canvas) throw new Error("canvas #app missing");

// ---------------------------------------------------------------- simulation state
interface Body {
  def: PlanetDef;
  id: string;
  pos: V3;
  omega: number;
}

const bodies: Body[] = DEFS.map((def, i) => ({
  def,
  id: `planet-${i}`,
  pos: [def.a * Math.cos(def.phase), 0, -def.a * Math.sin(def.phase)] as V3,
  omega: (Math.PI * 2) / orbitSeconds(def.a)
}));

let simTime = 0;
let paused = false;
let ready = false;
let focusIndex = -1;

// ---------------------------------------------------------------- camera
const FOCUS_SECONDS = 1.5;
interface Pose {
  p: V3;
  t: V3;
}
let cur: Pose = { p: [...startPose.p], t: [...startPose.t] };
let from: Pose = cur;
let anim = FOCUS_SECONDS;

const easeInOutCubic = (k: number): number => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);
const lerp3 = (a: V3, b: V3, k: number): V3 => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k];

const focusPose = (b: Body): Pose => {
  const [px, py, pz] = b.pos;
  const r = Math.hypot(px, pz) || 1;
  const rx = px / r;
  const rz = pz / r;
  let ox = -rx * 0.55 + -rz * 0.75;
  let oz = -rz * 0.55 + rx * 0.75;
  let oy = 0.35;
  const len = Math.hypot(ox, oy, oz) || 1;
  const dist = b.def.r * b.def.focusMul;
  ox = (ox / len) * dist;
  oy = (oy / len) * dist;
  oz = (oz / len) * dist;
  return { p: [px + ox, py + oy, pz + oz], t: [px, py, pz] };
};

const desiredPose = (): Pose => {
  const b = bodies[focusIndex];
  return b ? focusPose(b) : overviewPose();
};

const beginTransition = (): void => {
  from = { p: [...cur.p], t: [...cur.t] };
  anim = 0;
};

const focusPlanet = (name: string): void => {
  const idx = bodies.findIndex((b) => b.def.name.toLowerCase() === String(name).toLowerCase());
  if (idx < 0 || idx === focusIndex) return;
  focusIndex = idx;
  beginTransition();
  showPanel();
};

const unfocus = (): void => {
  if (focusIndex < 0) return;
  focusIndex = -1;
  beginTransition();
  showPanel();
};

// ---------------------------------------------------------------- DOM
const rect = canvas.getBoundingClientRect();
const overlay = document.createElement("div");
overlay.style.cssText = `position:absolute;left:${rect.left + window.scrollX}px;top:${rect.top + window.scrollY}px;width:${canvas.clientWidth}px;height:${canvas.clientHeight}px;pointer-events:none;overflow:hidden;font:13px/1.4 system-ui,sans-serif;color:#e8eefc`;
document.body.appendChild(overlay);

const panel = document.createElement("div");
panel.id = "info-panel";
panel.style.cssText = "position:absolute;right:10px;top:10px;min-width:170px;padding:8px 12px;background:rgba(10,16,34,0.78);border:1px solid rgba(120,150,255,0.45);border-radius:8px;display:none;pointer-events:none";
const panelName = document.createElement("div");
panelName.id = "info-name";
panelName.style.cssText = "font-size:16px;font-weight:600;margin-bottom:4px";
const panelPeriod = document.createElement("div");
panelPeriod.id = "info-period";
const panelDist = document.createElement("div");
panelDist.id = "info-distance";
panel.append(panelName, panelPeriod, panelDist);
overlay.appendChild(panel);

const button = document.createElement("button");
button.id = "pause-toggle";
button.type = "button";
button.textContent = "Pause";
button.style.cssText = "position:absolute;left:10px;bottom:10px;padding:5px 14px;font:13px system-ui,sans-serif;color:#e8eefc;background:rgba(20,30,60,0.85);border:1px solid rgba(120,150,255,0.55);border-radius:6px;cursor:pointer;pointer-events:auto";
button.addEventListener("click", () => {
  paused = !paused;
  button.textContent = paused ? "Play" : "Pause";
  button.blur();
});
overlay.appendChild(button);

function showPanel(): void {
  const b = bodies[focusIndex];
  if (!b) {
    panel.style.display = "none";
    return;
  }
  panelName.textContent = b.def.name;
  panelPeriod.textContent = `Orbital period: ${b.def.periodDays.toLocaleString("en-US")} Earth days`;
  panelDist.textContent = `Distance from star: ${b.def.distMkm.toLocaleString("en-US")} million km`;
  panel.style.display = "block";
}

// ---------------------------------------------------------------- input
const FOV_TAN = Math.tan((OVERVIEW_FOV * Math.PI) / 360);

const pick = (mx: number, my: number): number => {
  const w = canvas.width;
  const h = canvas.height;
  const nx = (mx / w) * 2 - 1;
  const ny = 1 - (my / h) * 2;
  const f: V3 = [cur.t[0] - cur.p[0], cur.t[1] - cur.p[1], cur.t[2] - cur.p[2]];
  const fl3 = Math.hypot(...f) || 1;
  f[0] /= fl3;
  f[1] /= fl3;
  f[2] /= fl3;
  // right = f x up(0,1,0)
  let rx = -f[2];
  let rz = f[0];
  const rl = Math.hypot(rx, rz) || 1;
  rx /= rl;
  rz /= rl;
  const right: V3 = [rx, 0, rz];
  const up: V3 = [right[1] * f[2] - right[2] * f[1], right[2] * f[0] - right[0] * f[2], right[0] * f[1] - right[1] * f[0]];
  const upv = up; // right x f is the camera-up vector
  const asp = w / h;
  const dir: V3 = [
    f[0] + right[0] * nx * FOV_TAN * asp + upv[0] * ny * FOV_TAN,
    f[1] + right[1] * nx * FOV_TAN * asp + upv[1] * ny * FOV_TAN,
    f[2] + right[2] * nx * FOV_TAN * asp + upv[2] * ny * FOV_TAN
  ];
  const dl = Math.hypot(...dir) || 1;
  dir[0] /= dl;
  dir[1] /= dl;
  dir[2] /= dl;
  let best = -1;
  let bestScore = Infinity;
  bodies.forEach((b, i) => {
    const oc: V3 = [b.pos[0] - cur.p[0], b.pos[1] - cur.p[1], b.pos[2] - cur.p[2]];
    const tca = oc[0] * dir[0] + oc[1] * dir[1] + oc[2] * dir[2];
    if (tca < 0) return;
    const oc2 = oc[0] * oc[0] + oc[1] * oc[1] + oc[2] * oc[2];
    const d = Math.sqrt(Math.max(0, oc2 - tca * tca));
    const pr = Math.max(b.def.r * 1.15, Math.sqrt(oc2) * 0.02);
    if (d < pr && d / pr < bestScore) {
      bestScore = d / pr;
      best = i;
    }
  });
  return best;
};

const handleClick = (mx: number, my: number): void => {
  const i = pick(mx, my);
  const b = bodies[i];
  if (b) focusPlanet(b.def.name);
  else unfocus();
};

let pressed = false;
let dragging = false;
let startX = 0;
let startY = 0;
let lastX = 0;
let lastY = 0;

const toCanvas = (e: MouseEvent): [number, number] => {
  const r = canvas.getBoundingClientRect();
  return [((e.clientX - r.left) * canvas.width) / (r.width || canvas.width), ((e.clientY - r.top) * canvas.height) / (r.height || canvas.height)];
};

canvas.addEventListener("pointerdown", (e) => {
  pressed = true;
  dragging = false;
  [startX, startY] = toCanvas(e);
  lastX = startX;
  lastY = startY;
  try {
    canvas.setPointerCapture(e.pointerId);
  } catch {
    /* synthetic pointer ids cannot be captured */
  }
});

canvas.addEventListener("pointermove", (e) => {
  if (!pressed) return;
  const [x, y] = toCanvas(e);
  if (!dragging && Math.hypot(x - startX, y - startY) > 4) dragging = true;
  if (dragging && focusIndex < 0) {
    yaw -= (x - lastX) * 0.008;
    pitch = Math.min(1.4, Math.max(0.08, pitch + (y - lastY) * 0.006));
  }
  lastX = x;
  lastY = y;
});

const endPress = (e: PointerEvent, click: boolean): void => {
  if (!pressed) return;
  pressed = false;
  if (click && !dragging) {
    const [x, y] = toCanvas(e);
    handleClick(x, y);
  }
  dragging = false;
};
canvas.addEventListener("pointerup", (e) => endPress(e, true));
canvas.addEventListener("pointercancel", (e) => endPress(e, false));

canvas.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    if (focusIndex >= 0) return;
    distTarget = Math.min(MAX_DIST, Math.max(MIN_DIST, distTarget * Math.exp(e.deltaY * 0.001)));
  },
  { passive: false }
);

window.addEventListener("keydown", (e) => {
  if (e.key === "Escape") unfocus();
});

// ---------------------------------------------------------------- exposed state
const state = {} as { -readonly [K in keyof TaskState]: TaskState[K] };
Object.defineProperties(state, {
  ready: { get: () => ready, enumerable: true },
  focused: { get: () => bodies[focusIndex]?.def.name ?? null, enumerable: true },
  paused: { get: () => paused, enumerable: true },
  planets: { get: () => bodies.map((b) => ({ name: b.def.name, x: b.pos[0], y: b.pos[1], z: b.pos[2] })), enumerable: true },
  cameraDistanceToFocus: {
    get: () => {
      const b = bodies[focusIndex];
      return b ? Math.hypot(cur.p[0] - b.pos[0], cur.p[1] - b.pos[1], cur.p[2] - b.pos[2]) : null;
    },
    enumerable: true
  }
});
Object.defineProperty(window, "__TASK_STATE__", { value: state, writable: false, configurable: false, enumerable: true });
Object.defineProperty(window, "__focusPlanet", { value: focusPlanet, writable: false, configurable: true });
Object.defineProperty(window, "__unfocus", { value: unfocus, writable: false, configurable: true });

// ---------------------------------------------------------------- frame loop
let sunClock = 0;
const placeBodies = (): void => {
  bodies.forEach((b) => {
    const ang = b.def.phase + b.omega * simTime;
    b.pos = [b.def.a * Math.cos(ang), 0, -b.def.a * Math.sin(ang)];
  });
};

app.onFrame((f) => {
  const dt = Math.min(Math.max(f.dt || 0, 0), 0.1);
  if (!paused) simTime += dt;
  sunClock += dt;
  placeBodies();

  bodies.forEach((b) => {
    const node = app.nodes.require(b.id);
    node.setPosition(b.pos[0], b.pos[1], b.pos[2]);
    node.setRotation(0, b.def.spin * simTime, 0);
    if (b.def.name === SATURN) app.nodes.require("ring").setPosition(b.pos[0], b.pos[1], b.pos[2]);
    if (b.def.name === MOON_HOST) {
      const m = (simTime / MOON_SECONDS) * Math.PI * 2;
      app.nodes.require("moon").setPosition(b.pos[0] + Math.cos(m) * MOON_ORBIT, b.pos[1] + Math.sin(m * 0.5) * 0.3, b.pos[2] - Math.sin(m) * MOON_ORBIT);
    }
  });
  app.nodes.require("sun").setUniform?.("sunClock", sunClock);
  app.nodes.require("sun").setRotation(0, sunClock * 0.05, 0);

  distCur += (distTarget - distCur) * (1 - Math.exp(-dt * 10));

  anim = Math.min(FOCUS_SECONDS, anim + Math.max(f.dt || 0, 0));
  const target = desiredPose();
  if (anim >= FOCUS_SECONDS) {
    cur = target;
  } else {
    const k = easeInOutCubic(anim / FOCUS_SECONDS);
    cur = { p: lerp3(from.p, target.p, k), t: lerp3(from.t, target.t, k) };
  }
  app.camera?.setPose({ position: cur.p, target: cur.t });
});

await app.ready();
ready = true;
requestAnimationFrame(() =>
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  })
);
