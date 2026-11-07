import { camera, createAuraApp, geometry, group, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: "clearcoat" };
  }
}

type V3 = [number, number, number];

/* ------------------------------------------------------------------ */
/* Shader: one studio-reflection shader used for paint, glass, chrome, */
/* rubber, platform top and platform skirt.                            */
/* ------------------------------------------------------------------ */

const VERTEX = `
#define A3D_REQUIRES_VERTEX_NORMAL 1
out vec3 vW;
out vec3 vN;
out vec3 vO;
void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vW = world.xyz;
  vN = normalMatrix * normal;
  vO = position;
  vec4 wp = world;
  if (kMirror > 0.5) { wp.y = -wp.y; }
  gl_Position = projectionMatrix * viewMatrix * wp;
}`;

const FRAGMENT = `
in vec3 vW;
in vec3 vN;
in vec3 vO;
out vec4 outColor;

float hash13(vec3 p3) {
  p3 = fract(p3 * 0.1031);
  p3 += dot(p3, p3.zyx + 31.32);
  return fract((p3.x + p3.y) * p3.z);
}

float box2(vec2 d, vec2 hs, float soft) {
  vec2 q = hs - abs(d);
  return smoothstep(0.0, soft, min(q.x, q.y));
}

// Procedural studio: dark room with long soft-box strips (world space, so
// reflections slide and bend over the curved panels as the car turns).
vec3 studio(vec3 p, vec3 r, float rough) {
  float soft = 0.14 + rough * 2.5;
  vec3 c = mix(vec3(0.004, 0.005, 0.008), vec3(0.03, 0.038, 0.058), smoothstep(-0.1, 0.9, r.y));
  if (r.y > 0.02) {
    float t = (3.4 - p.y) / r.y;
    vec3 h = p + r * t;
    c += vec3(1.0, 0.97, 0.92) * 24.0 * box2(h.xz - vec2(0.0, -0.9), vec2(4.6, 0.34), soft);
    c += vec3(1.0, 0.97, 0.92) * 18.0 * box2(h.xz - vec2(0.0, 1.5), vec2(4.6, 0.26), soft);
  }
  if (r.x < -0.02) {
    float t = (-4.6 - p.x) / r.x;
    vec3 h = p + r * t;
    c += vec3(1.0, 0.95, 0.9) * 20.0 * box2(h.zy - vec2(0.4, 2.0), vec2(0.34, 2.4), soft);
  }
  if (r.x > 0.02) {
    float t = (4.6 - p.x) / r.x;
    vec3 h = p + r * t;
    c += vec3(0.94, 0.97, 1.0) * 16.0 * box2(h.zy - vec2(-0.4, 1.7), vec2(3.6, 0.3), soft);
  }
  if (r.z < -0.02) {
    float t = (-5.5 - p.z) / r.z;
    vec3 h = p + r * t;
    c += vec3(0.3, 0.52, 1.0) * 9.0 * box2(h.xy - vec2(0.0, 1.4), vec2(3.8, 0.3), soft);
  }
  if (r.z > 0.02) {
    float t = (7.5 - p.z) / r.z;
    vec3 h = p + r * t;
    c += vec3(1.0, 0.93, 0.85) * 3.0 * box2(h.xy - vec2(2.0, 1.8), vec2(2.8, 1.0), soft * 2.0);
  }
  if (r.y < -0.03) {
    float t = -p.y / r.y;
    vec3 h = p + r * t;
    float d = (length(h.xz) - 2.62) / 0.16;
    c += vec3(0.35, 0.7, 1.0) * 1.4 * exp(-d * d);
  }
  return c;
}

void main() {
  vec3 P = vW;
  vec3 cam = cameraPosition;
  if (kMirror > 0.5) { cam.y = -cam.y; }
  vec3 V = normalize(cam - P);
  vec3 N = normalize(vN);
  if (dot(N, V) < 0.0) { N = -N; }
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  float fres = pow(1.0 - ndv, 5.0);
  vec3 R = reflect(-V, N);

  vec3 col;
  if (kMetal > 0.5) {
    col = (studio(P, R, kRough) + vec3(0.02)) * kBase;
  } else {
    // candy base layer: deeper where the view grazes the surface
    vec3 baseCol = kBase * mix(0.5, 1.3, ndv);
    vec3 Lk = normalize(vec3(-0.4, 0.85, 0.45));
    float lam = max(dot(N, Lk), 0.0);
    float wrapL = max(dot(N, normalize(vec3(0.7, 0.3, -0.6))) * 0.5 + 0.5, 0.0);
    vec3 irr = studio(P, N, 0.9) * 0.05 + vec3(0.02) + vec3(0.05, 0.08, 0.14) * wrapL * 0.5;
    vec3 diff = baseCol * (0.55 * lam + irr);

    // metallic flake: tiny randomly tilted mirrors under the clear coat
    vec3 cell = floor(vO * 40.0);
    float h1 = hash13(cell);
    vec3 fn = vec3(hash13(cell + vec3(7.1, 1.3, 2.7)), hash13(cell + vec3(3.7, 9.1, 5.3)), hash13(cell + vec3(1.9, 4.4, 8.8))) * 2.0 - 1.0;
    vec3 Nf = normalize(N + fn * 0.6);
    vec3 fl = studio(P, reflect(-V, Nf), 0.3);
    diff *= 1.0 + (h1 - 0.5) * 0.35 * kFlake;
    vec3 flake = fl * vec3(1.0, 0.38, 0.3) * 0.12 * kFlake * (0.3 + h1);

    // clear coat: smooth dielectric mirror of the studio
    float F = kF0 + (1.0 - kF0) * fres;
    vec3 coat = studio(P, R, kRough) * F * kCoat;
    col = diff + flake + coat;
  }

  float a = clamp(kAlpha + kAlphaFres * fres, 0.0, 1.0);
  vec3 emit = vec3(0.0);
  if (kRing > 0.5) {
    float rr = length(vO.xz);
    float d1 = (rr - 2.62) / 0.045;
    float band = exp(-d1 * d1);
    float d2 = (rr - 2.62) / 0.4;
    float glow = exp(-d2 * d2);
    float d3 = (rr - 1.75) / 0.02;
    float inner = exp(-d3 * d3);
    emit += vec3(0.45, 0.8, 1.0) * (2.4 * band + 0.22 * glow + 0.35 * inner);
    a = max(a, clamp(band + inner * 0.4, 0.0, 1.0));
  }
  if (kRim > 0.5) {
    emit += vec3(0.45, 0.8, 1.0) * 3.0 * smoothstep(-0.05, 0.0, vO.y);
  }

  if (kMirror > 0.5) {
    col *= 0.9 * exp(-max(P.y, 0.0) * 0.9);
  }
  outColor = vec4(col + emit, a);
}`;

interface Look {
  base: V3;
  coat?: number;
  rough?: number;
  f0?: number;
  metal?: boolean;
  flake?: number;
  alpha?: number;
  alphaFres?: number;
  ring?: boolean;
  rim?: boolean;
  mirror?: boolean;
  transparent?: boolean;
}

const shade = (l: Look) =>
  material.custom({
    glsl: { vertex: VERTEX, fragment: FRAGMENT },
    uniforms: {
      kBase: { type: "vec3", value: l.base },
      kCoat: { type: "f32", value: l.coat ?? 0 },
      kRough: { type: "f32", value: l.rough ?? 0 },
      kF0: { type: "f32", value: l.f0 ?? 0.05 },
      kMetal: { type: "f32", value: l.metal ? 1 : 0 },
      kFlake: { type: "f32", value: l.flake ?? 0 },
      kAlpha: { type: "f32", value: l.alpha ?? 1 },
      kAlphaFres: { type: "f32", value: l.alphaFres ?? 0 },
      kRing: { type: "f32", value: l.ring ? 1 : 0 },
      kRim: { type: "f32", value: l.rim ? 1 : 0 },
      kMirror: { type: "f32", value: l.mirror ? 1 : 0 }
    },
    side: "double",
    transparent: l.transparent === true,
    depthWrite: l.transparent !== true
  });

/* ------------------------------------------------------------------ */
/* Procedural geometry                                                 */
/* ------------------------------------------------------------------ */

interface Loft {
  L: number;
  halfW: number;
  top: number;
  bot: number;
  cx: number;
  cy: number;
  n: number;
  wpow: number;
  hpow: number;
  tf: number;
  tr: number;
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v));

/** Smooth streamlined superellipse loft along X, with analytic-free numeric normals. */
function loft(o: Loft, nt = 96, np = 72) {
  const e = 2 / o.n;
  const P = (t: number, ph: number): V3 => {
    const u = 2 * t - 1;
    const s = Math.sqrt(Math.max(0, 1 - u * u));
    const q = clamp((t - 0.45) / 0.55, 0, 1);
    const r = clamp((0.3 - t) / 0.3, 0, 1);
    const k = 1 - o.tf * q * q - o.tr * r * r;
    const c = Math.cos(ph);
    const sn = Math.sin(ph);
    const zc = Math.sign(c) * Math.pow(Math.abs(c), e);
    const yc = Math.sign(sn) * Math.pow(Math.abs(sn), e);
    const hh = (sn >= 0 ? o.top * k : o.bot) * Math.pow(s, o.hpow);
    return [o.cx + o.L * (t - 0.5), o.cy + hh * yc, o.halfW * Math.pow(s, o.wpow) * zc];
  };
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const h = 1e-3;
  const min: V3 = [1e9, 1e9, 1e9];
  const max: V3 = [-1e9, -1e9, -1e9];
  for (let i = 0; i <= nt; i += 1) {
    const t = (1 - Math.cos((Math.PI * i) / nt)) / 2;
    for (let j = 0; j <= np; j += 1) {
      const ph = (j / np) * Math.PI * 2;
      const p = P(t, ph);
      const a = P(Math.min(t + h, 1), ph);
      const b = P(Math.max(t - h, 0), ph);
      const c = P(t, ph + h);
      const d = P(t, ph - h);
      const du: V3 = [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
      const dv: V3 = [c[0] - d[0], c[1] - d[1], c[2] - d[2]];
      let n: V3 = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-10) {
        n = [t < 0.5 ? -1 : 1, 0, 0];
      } else {
        n = [n[0] / len, n[1] / len, n[2] / len];
        const out = n[0] * (p[0] - (o.cx + o.L * (t - 0.5))) + n[1] * (p[1] - o.cy) + n[2] * p[2];
        if (out < 0) n = [-n[0], -n[1], -n[2]];
      }
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      for (let k = 0; k < 3; k += 1) {
        min[k] = Math.min(min[k]!, p[k]!);
        max[k] = Math.max(max[k]!, p[k]!);
      }
    }
  }
  for (let i = 0; i < nt; i += 1) {
    for (let j = 0; j < np; j += 1) {
      const v = i * (np + 1) + j;
      indices.push(v, v + np + 1, v + 1, v + 1, v + np + 1, v + np + 2);
    }
  }
  return geometry.define({ positions: new Float32Array(positions), normals: new Float32Array(normals), indices, bounds: { min, max } });
}

const SEG = 96;

function discGeometry(radius: number) {
  const positions: number[] = [0, 0, 0];
  const normals: number[] = [0, 1, 0];
  const indices: number[] = [];
  for (let i = 0; i < SEG; i += 1) {
    const a = (i / SEG) * Math.PI * 2;
    positions.push(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    normals.push(0, 1, 0);
    indices.push(0, 1 + ((i + 1) % SEG), 1 + i);
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-radius, 0, -radius], max: [radius, 0, radius] }
  });
}

function wallGeometry(radius: number, y0: number, y1: number) {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= SEG; i += 1) {
    const a = (i / SEG) * Math.PI * 2;
    const c = Math.cos(a);
    const s = Math.sin(a);
    positions.push(c * radius, y0, s * radius, c * radius, y1, s * radius);
    normals.push(c, 0, s, c, 0, s);
  }
  for (let i = 0; i < SEG; i += 1) {
    const v = i * 2;
    indices.push(v, v + 1, v + 2, v + 2, v + 1, v + 3);
  }
  return geometry.define({
    positions: new Float32Array(positions),
    normals: new Float32Array(normals),
    indices,
    bounds: { min: [-radius, y0, -radius], max: [radius, y1, radius] }
  });
}

const BODY: Loft = { L: 3.4, halfW: 0.85, top: 0.5, bot: 0.28, cx: 0, cy: 0.62, n: 2.6, wpow: 0.5, hpow: 0.55, tf: 0.3, tr: 0.1 };
const BELT: Loft = { L: 3.43, halfW: 0.87, top: 0.03, bot: 0.03, cx: 0, cy: 0.62, n: 3.5, wpow: 0.5, hpow: 0.3, tf: 0, tr: 0 };
const CABIN: Loft = { L: 1.75, halfW: 0.6, top: 0.42, bot: 0.2, cx: -0.15, cy: 1.0, n: 2.6, wpow: 0.55, hpow: 0.6, tf: 0.1, tr: 0.1 };
const ROOF: Loft = { L: 1.5, halfW: 0.55, top: 0.5, bot: 0.2, cx: -0.15, cy: 1.0, n: 2.6, wpow: 0.55, hpow: 0.6, tf: 0.1, tr: 0.1 };

const bodyGeo = loft(BODY);
const beltGeo = loft(BELT, 96, 72);
const cabinGeo = loft(CABIN);
const roofGeo = loft(ROOF);
const topGeo = discGeometry(2.8);
const skirtGeo = wallGeometry(2.8, -0.16, 0);

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

type Kids = Parameters<typeof group>[1];

function buildCar(mirror: boolean): Kids {
  const suffix = mirror ? "-m" : "";
  const paint = shade({ base: [0.5, 0.0, 0.016], coat: 1, rough: 0.02, f0: 0.05, flake: 1, mirror });
  const glass = shade({ base: [0.004, 0.005, 0.008], coat: 1.1, rough: 0.0, f0: 0.07, mirror });
  const chrome = shade({ base: [0.92, 0.93, 0.95], metal: true, rough: 0.04, mirror });
  const rubber = shade({ base: [0.012, 0.012, 0.014], coat: 0.5, rough: 0.5, f0: 0.04, mirror });

  const kids: Array<Kids[number]> = [
    geometry.custom(bodyGeo, { name: `body${suffix}`, material: paint, castShadow: false }),
    geometry.custom(beltGeo, { name: `belt${suffix}`, material: chrome, castShadow: false }),
    geometry.custom(cabinGeo, { name: `cabin${suffix}`, material: glass, castShadow: false }),
    geometry.custom(roofGeo, { name: `roof${suffix}`, material: paint, castShadow: false })
  ];
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      kids.push(
        primitives
          .cylinder({ name: `wheel${suffix}-${sx}${sz}`, size: [0.68, 0.24, 0.68], material: rubber, castShadow: false })
          .position(sx * 1.05, 0.342, sz * 0.78)
          .rotate(Math.PI / 2, 0, 0)
      );
      kids.push(
        primitives
          .cylinder({ name: `hub${suffix}-${sx}${sz}`, size: [0.38, 0.03, 0.38], material: chrome, castShadow: false })
          .position(sx * 1.05, 0.342, sz * 0.905)
          .rotate(Math.PI / 2, 0, 0)
      );
    }
  }
  return kids;
}

const platformTop = shade({ base: [0.006, 0.007, 0.01], coat: 1, rough: 0.07, f0: 0.04, alpha: 0.5, alphaFres: 0.4, ring: true, transparent: true });
const platformSkirt = shade({ base: [0.12, 0.13, 0.15], metal: true, rough: 0.15, rim: true });

const sc = scene({ background: "#030409" })
  .camera(camera.perspective({ position: [4.4, 1.35, 7.0], target: [0, 0.65, 0], fov: 32, near: 0.5, far: 60 }))
  .add(geometry.custom(skirtGeo, { name: "skirt", material: platformSkirt, castShadow: false }))
  .add(group("spin-mirror", buildCar(true)).runtime({ id: "spin-mirror", mutable: true }))
  .add(group("spin", buildCar(false)).runtime({ id: "spin", mutable: true }))
  .add(geometry.custom(topGeo, { name: "platform-top", material: platformTop, castShadow: false }));

window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

const app = createAuraApp("#app", { scene: sc });
let angle = 0;
const SPEED = 20;

app.onFrame((f) => {
  angle += SPEED * Math.min(f.dt, 0.1);
  const rad = (angle * Math.PI) / 180;
  app.nodes.require("spin").setRotation(0, rad, 0);
  app.nodes.require("spin-mirror").setRotation(0, rad, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angle, paintFinish: "clearcoat" };
});

await app.ready();
window.__EVAL_READY__ = true;
