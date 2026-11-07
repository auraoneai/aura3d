import { camera, createAuraApp, effects, environments, geometry, group, lights, material, primitives, scene } from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
  }
}

type V3 = [number, number, number];
type Kids = Parameters<typeof group>[1];
interface Mesh { pos: number[]; nor: number[]; idx: number[] }

// ---------- small vector helpers ----------
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3): V3 => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };

// ---------- procedural surfaces ----------
interface LoftSpec { x: number; y: number; z: number; a: number; b: number; c: number; p: number; q: number; r: number; lower: number; tilt: number }

const sp = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

const surface = (o: LoftSpec) => {
  const P = (s: number, th: number): V3 => {
    const k = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(s), o.q)), 1 / o.r);
    const ct = Math.cos(th), st = Math.sin(th), ex = 2 / o.p;
    const yy = st < 0 ? o.lower : 1;
    return [o.x + o.a * k * sp(ct, ex), o.y + o.tilt * s + o.b * k * sp(st, ex) * yy, o.z + o.c * s];
  };
  const N = (s: number, th: number): V3 => {
    const e = 1e-3;
    const ds = sub(P(Math.min(1, s + e), th), P(Math.max(-1, s - e), th));
    const dt = sub(P(s, th + e), P(s, th - e));
    const n = cross(dt, ds);
    if (Math.hypot(n[0], n[1], n[2]) < 1e-10) return [0, 0, s < 0 ? -1 : 1];
    const nn = norm(n);
    const c: V3 = [o.x, o.y + o.tilt * s, o.z + o.c * s];
    return dot(nn, sub(P(s, th), c)) < 0 ? [-nn[0], -nn[1], -nn[2]] : nn;
  };
  return { P, N };
};

const loftMesh = (o: LoftSpec, NS = 72, NT = 72): Mesh => {
  const { P, N } = surface(o);
  const m: Mesh = { pos: [], nor: [], idx: [] };
  for (let i = 0; i <= NS; i += 1) {
    const s = i === 0 ? -1 : i === NS ? 1 : -Math.cos((Math.PI * i) / NS);
    for (let j = 0; j <= NT; j += 1) {
      const th = (j / NT) * Math.PI * 2;
      m.pos.push(...P(s, th));
      m.nor.push(...N(s, th));
    }
  }
  for (let i = 0; i < NS; i += 1) for (let j = 0; j < NT; j += 1) {
    const v = i * (NT + 1) + j;
    m.idx.push(v, v + NT + 1, v + 1, v + 1, v + NT + 1, v + NT + 2);
  }
  return m;
};

const tubeMesh = (pts: V3[], outward: V3[], r: number, seg = 8): Mesh => {
  const m: Mesh = { pos: [], nor: [], idx: [] };
  const n = pts.length;
  for (let i = 0; i < n; i += 1) {
    const a = pts[Math.max(0, i - 1)]!, b = pts[Math.min(n - 1, i + 1)]!, c = pts[i]!;
    const T = norm(sub(b, a));
    const B = norm(cross(T, outward[i]!));
    const U = cross(B, T);
    for (let k = 0; k <= seg; k += 1) {
      const ph = (k / seg) * Math.PI * 2;
      const d: V3 = [Math.cos(ph) * U[0] + Math.sin(ph) * B[0], Math.cos(ph) * U[1] + Math.sin(ph) * B[1], Math.cos(ph) * U[2] + Math.sin(ph) * B[2]];
      m.pos.push(c[0] + d[0] * r, c[1] + d[1] * r, c[2] + d[2] * r);
      m.nor.push(...d);
    }
  }
  for (let i = 0; i < n - 1; i += 1) for (let k = 0; k < seg; k += 1) {
    const v = i * (seg + 1) + k;
    m.idx.push(v, v + seg + 1, v + 1, v + 1, v + seg + 1, v + seg + 2);
  }
  return m;
};

const toGeometry = (m: Mesh, mirror: boolean) => {
  const positions = new Float32Array(m.pos), normals = new Float32Array(m.nor);
  if (mirror) for (let i = 1; i < positions.length; i += 3) { positions[i] = -positions[i]!; normals[i] = -normals[i]!; }
  const min: V3 = [Infinity, Infinity, Infinity], max: V3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) for (let k = 0; k < 3; k += 1) {
    min[k] = Math.min(min[k]!, positions[i + k]!);
    max[k] = Math.max(max[k]!, positions[i + k]!);
  }
  return geometry.define({ positions, normals, indices: m.idx, bounds: { min, max } });
};

// ---------- studio-reflection car paint / chrome / glass shader ----------
const COMMON = `
float panel(vec3 r, vec3 c, vec3 U, vec3 W, vec2 h, float soft) {
  vec3 nr = normalize(c);
  float d = dot(r, nr);
  if (d < 0.02) return 0.0;
  vec3 p = r * (dot(c, nr) / d) - c;
  float u = dot(p, U), v = dot(p, W);
  float eu = 1.0 - smoothstep(h.x - soft, h.x + soft, abs(u));
  float ev = 1.0 - smoothstep(h.y - soft, h.y + soft, abs(v));
  return eu * ev * (0.8 + 0.2 * cos(u / h.x * 1.4));
}
vec3 envLight(vec3 r, float soft) {
  vec3 col = mix(vec3(0.006, 0.007, 0.010), vec3(0.05, 0.06, 0.08), smoothstep(-0.3, 0.9, r.y));
  col += vec3(1.0, 0.98, 0.94) * 14.0 * panel(r, vec3(0.0, 6.0, -0.5), vec3(0.0, 0.0, 1.0), vec3(1.0, 0.0, 0.0), vec2(5.5, 0.6), soft);
  col += vec3(1.0, 0.97, 0.92) * 11.0 * panel(r, vec3(-6.5, 3.2, 0.5), vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), vec2(5.5, 0.55), soft);
  col += vec3(0.96, 0.98, 1.0) * 9.0 * panel(r, vec3(6.5, 2.6, 0.0), vec3(0.0, 0.0, 1.0), vec3(0.0, 1.0, 0.0), vec2(5.5, 0.5), soft);
  col += vec3(0.45, 0.70, 1.0) * 8.0 * panel(r, vec3(0.0, 2.5, -7.0), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec2(5.0, 0.22), soft);
  col += vec3(0.8, 0.85, 1.0) * 0.8 * panel(r, vec3(0.0, 1.8, 8.0), vec3(1.0, 0.0, 0.0), vec3(0.0, 1.0, 0.0), vec2(4.0, 1.8), soft * 2.0 + 0.2);
  return col;
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}`;

interface ShadeSpec { base: V3; flake: number; f0: number; metal: boolean; soft: number; diffuse: number; mirror: boolean }

const studioMaterial = (c: ShadeSpec) => {
  const f = (x: number): string => x.toFixed(4);
  const vec = (v: V3): string => `vec3(${f(v[0])}, ${f(v[1])}, ${f(v[2])})`;
  const vertex = `out vec3 vWorld; out vec3 vN; out vec3 vObj;
void main() {
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
  vN = mat3(modelMatrix) * normal;
  vObj = position;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`;
  const fragment = `in vec3 vWorld; in vec3 vN; in vec3 vObj; out vec4 outColor;
${COMMON}
void main() {
  vec3 wp = vWorld;
  vec3 N = normalize(vN);
  vec3 camP = cameraPosition;
  ${c.mirror ? "wp.y = -wp.y; N.y = -N.y; camP.y = -camP.y;" : ""}
  vec3 V = normalize(camP - wp);
  if (dot(N, V) < 0.0) N = -N;
  float ndv = clamp(dot(N, V), 0.0, 1.0);
  vec3 R = reflect(-V, N);
  vec3 BASE = ${vec(c.base)};
  vec3 col;
  ${c.metal ? `col = envLight(R, ${f(c.soft)}) * BASE;` : `
  vec3 irr = envLight(N, 1.3);
  vec3 diffuse = BASE * (irr * ${f(c.diffuse)} + 0.02);
  vec3 baseSpec = BASE * envLight(R, 0.6) * 0.10;
  vec3 h = hash33(floor(vObj * 45.0));
  vec3 fn = normalize(N + (h - 0.5) * 1.3);
  vec3 Rf = reflect(-V, fn);
  vec3 flakeTint = mix(BASE * 2.0 + vec3(0.12, 0.04, 0.03), vec3(1.0, 0.7, 0.6), 0.25);
  vec3 fl = envLight(Rf, 0.5) * flakeTint * (0.35 + 0.65 * h.z) * ${f(c.flake)} * 0.07;
  vec3 under = (diffuse + baseSpec) * (1.0 + (h.z - 0.5) * 0.35 * ${f(c.flake)}) + fl;
  under *= mix(0.55, 1.0, ndv);
  float F = ${f(c.f0)} + (1.0 - ${f(c.f0)}) * pow(1.0 - ndv, 5.0);
  col = under * (1.0 - F) + envLight(R, ${f(c.soft)}) * F;`}
  outColor = vec4(col, 1.0);
}`;
  return material.custom({ glsl: { vertex, fragment }, side: "double" });
};

// ---------- the car ----------
const BODY: LoftSpec = { x: 0, y: 0.68, z: 0, a: 0.9, b: 0.42, c: 1.85, p: 2.6, q: 2.6, r: 2.2, lower: 0.55, tilt: 0.0 };
const GLASS: LoftSpec = { x: 0, y: 0.92, z: -0.15, a: 0.66, b: 0.36, c: 1.0, p: 2.2, q: 2.2, r: 2.0, lower: 1, tilt: 0 };
const ROOF: LoftSpec = { x: 0, y: 0.92, z: -0.15, a: 0.5, b: 0.4, c: 0.8, p: 2.2, q: 2.2, r: 2.0, lower: 1, tilt: 0 };

const sideTrim = (sign: 1 | -1) => {
  const { P, N } = surface(BODY);
  const th = sign > 0 ? -0.12 : Math.PI + 0.12;
  const pts: V3[] = [], out: V3[] = [];
  for (let i = 0; i <= 40; i += 1) {
    const s = -0.82 + (1.64 * i) / 40;
    const n = N(s, th), p = P(s, th);
    pts.push([p[0] + n[0] * 0.012, p[1] + n[1] * 0.012, p[2] + n[2] * 0.012]);
    out.push(n);
  }
  return tubeMesh(pts, out, 0.022);
};

const GEOS = (() => {
  const body = loftMesh(BODY), glass = loftMesh(GLASS, 48, 48), roof = loftMesh(ROOF, 48, 48);
  const trimR = sideTrim(1), trimL = sideTrim(-1);
  return { body, glass, roof, trimR, trimL };
})();

const paintSpec = (mirror: boolean): ShadeSpec => ({ base: [0.72, 0.008, 0.03], flake: 1, f0: 0.05, metal: false, soft: 0.2, diffuse: 0.05, mirror });
const glassSpec = (mirror: boolean): ShadeSpec => ({ base: [0.004, 0.005, 0.008], flake: 0, f0: 0.06, metal: false, soft: 0.14, diffuse: 0.02, mirror });
const chromeSpec = (mirror: boolean): ShadeSpec => ({ base: [0.9, 0.92, 0.96], flake: 0, f0: 1, metal: true, soft: 0.12, diffuse: 0, mirror });

const buildCar = (mirror: boolean): Kids => {
  const ySign = mirror ? -1 : 1;
  const tag = mirror ? "m-" : "";
  const paint = studioMaterial(paintSpec(mirror));
  const dark = studioMaterial(glassSpec(mirror));
  const chrome = studioMaterial(chromeSpec(mirror));
  const rubber = material.pbr({ color: "#101114", roughness: 0.8 });
  const hub = material.pbr({ color: "#dfe3ea", metallic: 1, roughness: 0.18 });
  const nodes: Kids = [
    geometry.custom(toGeometry(GEOS.body, mirror), { name: `${tag}body`, material: paint, castShadow: false }),
    geometry.custom(toGeometry(GEOS.glass, mirror), { name: `${tag}glass`, material: dark, castShadow: false }),
    geometry.custom(toGeometry(GEOS.roof, mirror), { name: `${tag}roof`, material: paint, castShadow: false }),
    geometry.custom(toGeometry(GEOS.trimR, mirror), { name: `${tag}trim-r`, material: chrome, castShadow: false }),
    geometry.custom(toGeometry(GEOS.trimL, mirror), { name: `${tag}trim-l`, material: chrome, castShadow: false })
  ];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    nodes.push(
      primitives.cylinder({ name: `${tag}wheel-${sx}-${sz}`, size: [0.76, 0.26, 0.76], material: rubber, castShadow: false })
        .position(sx * 0.84, ySign * 0.38, sz * 1.15).rotate(0, 0, Math.PI / 2),
      primitives.cylinder({ name: `${tag}hub-${sx}-${sz}`, size: [0.44, 0.27, 0.44], material: hub, castShadow: false })
        .position(sx * 0.845, ySign * 0.38, sz * 1.15).rotate(0, 0, Math.PI / 2)
    );
  }
  return nodes;
};

// ---------- ring light (torus around the platform) ----------
const ringMesh = (() => {
  const pts: V3[] = [], out: V3[] = [];
  const R = 3.06, n = 128;
  for (let i = 0; i <= n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    pts.push([Math.cos(a) * R, 0, Math.sin(a) * R]);
    out.push([0, 1, 0]);
  }
  return tubeMesh(pts, out, 0.045, 10);
})();

// ---------- scene ----------
const strip = (name: string, size: V3, pos: V3, color: string, intensity: number) =>
  primitives.box({ name, size, material: material.emissive({ color, emissive: color, emissiveIntensity: intensity }), castShadow: false }).position(...pos);

const sc = scene({ background: "#05070b" })
  .camera(camera.perspective({ position: [4.6, 1.4, 7.4], target: [0, 0.62, 0], fov: 34, near: 0.5, far: 80 }))
  .add(environments.neutral({ intensity: 0.22, background: false }))
  .add(lights.directional({ position: [-3, 5, 4], target: [0, 0.5, 0], intensity: 0.9, color: "#fff2e0" }))
  .add(lights.directional({ position: [-3.5, 2.6, -5], target: [0, 0.6, 0], intensity: 2.2, color: "#7fb0ff" }))
  .add(effects.bloom({ intensity: 0.35, threshold: 0.88, radius: 0.5 }))
  // visible soft-box strip fixtures (same positions the paint reflects)
  .add(strip("strip-top", [1.2, 0.1, 11], [0, 6, -0.5], "#fff6e8", 3))
  .add(strip("strip-left", [0.1, 1.1, 11], [-6.5, 3.2, 0.5], "#fff4e6", 3))
  .add(strip("strip-right", [0.1, 1.0, 11], [6.5, 2.6, 0], "#f2f6ff", 3))
  .add(strip("strip-rim", [10, 0.44, 0.1], [0, 2.5, -7], "#6fb2ff", 3))
  // turntable
  .add(primitives.cylinder({ name: "platform", size: [6, 0.02, 6], material: material.pbr({ color: "#07080b", metallic: 0.4, roughness: 0.12, opacity: 0.8 }), castShadow: false }))
  .add(geometry.custom(toGeometry(ringMesh, false), { name: "ring-light", material: material.emissive({ color: "#8fc4ff", emissive: "#8fc4ff", emissiveIntensity: 2.5 }), castShadow: false }))
  .add(group("turntable", [...buildCar(false), ...buildCar(true)], {}).runtime({ id: "turntable", mutable: true }));

window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

const app = createAuraApp("#app", { scene: sc });
let t = 0;
app.onFrame((f) => {
  t += Math.min(f.dt, 0.1);
  const deg = t * 20;
  app.nodes.require("turntable").setRotation(0, (deg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: deg, paintFinish: "clearcoat" };
});
await app.ready();
window.__EVAL_READY__ = true;
