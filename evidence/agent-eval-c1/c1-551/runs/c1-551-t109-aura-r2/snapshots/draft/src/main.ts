import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  groups,
  lights,
  material,
  primitives,
  scene,
  surfaces,
  texture
} from "@aura3d/engine";

type V3 = [number, number, number];

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

/* ---------- procedural geometry ---------- */

interface LoftSpec {
  length: number; // half length along X
  halfWidth: number;
  halfTop: number;
  halfBottom: number;
  centerY: number;
  centerX?: number;
  lengthExp?: number; // end bluntness
  sectionExp?: number; // superellipse exponent of the cross-section
  theta0?: number;
  theta1?: number;
  grow?: number;
  uvScale?: [number, number];
  /** extra shaping: returns multipliers for (width, top height) at t in [-1,1] */
  shape?: (t: number) => [number, number];
  nu?: number;
  nv?: number;
}

function spow(x: number, p: number): number {
  return Math.sign(x) * Math.pow(Math.abs(x), p);
}

function loft(spec: LoftSpec) {
  const nu = spec.nu ?? 96;
  const nv = spec.nv ?? 64;
  const sectionExp = spec.sectionExp ?? 2.6;
  const lengthExp = spec.lengthExp ?? 2.4;
  const theta0 = spec.theta0 ?? 0;
  const theta1 = spec.theta1 ?? Math.PI * 2;
  const grow = spec.grow ?? 0;
  const uvScale = spec.uvScale ?? [6, 6];
  const cx = spec.centerX ?? 0;

  const surface = (u: number, th: number): V3 => {
    const t = 2 * u - 1;
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), lengthExp)), 1 / lengthExp);
    const [wm, hm] = spec.shape ? spec.shape(t) : [1, 1];
    const c = spow(Math.cos(th), 2 / sectionExp);
    const s = spow(Math.sin(th), 2 / sectionExp);
    const h = (s >= 0 ? spec.halfTop * hm : spec.halfBottom) * env;
    const w = spec.halfWidth * wm * env;
    return [cx + spec.length * t, spec.centerY + h * s, w * c];
  };

  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  const normals = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const indices: number[] = [];
  const eps = 1e-3;
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const uu = i / nu;
      const th = theta0 + (j / nv) * (theta1 - theta0);
      const uc = Math.min(1 - 0.004, Math.max(0.004, uu));
      const p = surface(uc, th);
      const pu = surface(Math.min(1, uc + eps), th);
      const pu0 = surface(Math.max(0, uc - eps), th);
      const pv = surface(uc, th + eps);
      const pv0 = surface(uc, th - eps);
      const du: V3 = [pu[0] - pu0[0], pu[1] - pu0[1], pu[2] - pu0[2]];
      const dv: V3 = [pv[0] - pv0[0], pv[1] - pv0[1], pv[2] - pv0[2]];
      let n: V3 = [du[1] * dv[2] - du[2] * dv[1], du[2] * dv[0] - du[0] * dv[2], du[0] * dv[1] - du[1] * dv[0]];
      const len = Math.hypot(n[0], n[1], n[2]) || 1;
      n = [n[0] / len, n[1] / len, n[2] / len];
      // orient outwards relative to the section centre
      const out: V3 = [p[0] - (cx + spec.length * (2 * uc - 1)), p[1] - spec.centerY, p[2]];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
      const q: V3 = [p[0] + n[0] * grow, p[1] + n[1] * grow, p[2] + n[2] * grow];
      const k = j * (nu + 1) + i;
      positions.set(q, k * 3);
      normals.set(n, k * 3);
      uvs.set([uu * uvScale[0], (j / nv) * uvScale[1]], k * 2);
      minX = Math.min(minX, q[0]); maxX = Math.max(maxX, q[0]);
      minY = Math.min(minY, q[1]); maxY = Math.max(maxY, q[1]);
      minZ = Math.min(minZ, q[2]); maxZ = Math.max(maxZ, q[2]);
    }
  }
  // winding: decided by comparing a face normal with the stored normal
  const a = 0, b = 1, c = nu + 1;
  const pa = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!];
  void pa;
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const v = j * (nu + 1) + i;
      indices.push(v, v + 1, v + nu + 1, v + 1, v + nu + 2, v + nu + 1);
    }
  }
  void b; void c;
  // verify winding with one sample triangle in the middle; flip all if inverted
  const mid = Math.floor(nv / 4) * (nu + 1) + Math.floor(nu / 2);
  const i0 = mid, i1 = mid + 1, i2 = mid + nu + 1;
  const e1: V3 = [positions[i1 * 3]! - positions[i0 * 3]!, positions[i1 * 3 + 1]! - positions[i0 * 3 + 1]!, positions[i1 * 3 + 2]! - positions[i0 * 3 + 2]!];
  const e2: V3 = [positions[i2 * 3]! - positions[i0 * 3]!, positions[i2 * 3 + 1]! - positions[i0 * 3 + 1]!, positions[i2 * 3 + 2]! - positions[i0 * 3 + 2]!];
  const fn: V3 = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
  const sn: V3 = [normals[i0 * 3]!, normals[i0 * 3 + 1]!, normals[i0 * 3 + 2]!];
  if (fn[0] * sn[0] + fn[1] * sn[1] + fn[2] * sn[2] < 0) {
    for (let k = 0; k < indices.length; k += 3) {
      const t1 = indices[k + 1]!;
      indices[k + 1] = indices[k + 2]!;
      indices[k + 2] = t1;
    }
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] }
  });
}

/** Tube along a polyline (closed loop) in the XZ plane at constant height. */
function loopTube(points: V3[], radius: number, sides = 8) {
  const n = points.length;
  const positions = new Float32Array(n * (sides + 1) * 3);
  const normals = new Float32Array(n * (sides + 1) * 3);
  const indices: number[] = [];
  for (let i = 0; i < n; i += 1) {
    const p = points[i]!;
    const nx = points[(i + 1) % n]!;
    const pv = points[(i + n - 1) % n]!;
    let tx = nx[0] - pv[0], tz = nx[2] - pv[2];
    const tl = Math.hypot(tx, tz) || 1;
    tx /= tl; tz /= tl;
    // side vector = horizontal perpendicular, up = Y
    const sx = -tz, sz = tx;
    for (let k = 0; k <= sides; k += 1) {
      const a = (k / sides) * Math.PI * 2;
      const ox = Math.cos(a) * sx, oy = Math.sin(a), oz = Math.cos(a) * sz;
      const idx = (i * (sides + 1) + k) * 3;
      positions.set([p[0] + ox * radius, p[1] + oy * radius, p[2] + oz * radius], idx);
      normals.set([ox, oy, oz], idx);
    }
  }
  for (let i = 0; i < n; i += 1) {
    const i2 = (i + 1) % n;
    for (let k = 0; k < sides; k += 1) {
      const a = i * (sides + 1) + k;
      const b = i2 * (sides + 1) + k;
      indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  }
  let minX = Infinity, minY = Infinity, minZ = Infinity, maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1]);
    minZ = Math.min(minZ, p[2]); maxZ = Math.max(maxZ, p[2]);
  }
  const spec = geometry.define({
    positions,
    normals,
    indices,
    bounds: { min: [minX - radius, minY - radius, minZ - radius], max: [maxX + radius, maxY + radius, maxZ + radius] }
  });
  return spec;
}

/* ---------- flake normal map ---------- */

function makeFlakeNormalMap() {
  const size = 128;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i += 1) {
    // each texel is a tiny mirror facet with a random tilt
    const ax = (rnd() * 2 - 1) * 0.85;
    const ay = (rnd() * 2 - 1) * 0.85;
    const az = Math.sqrt(Math.max(0.05, 1 - ax * ax * 0.5 - ay * ay * 0.5));
    const l = Math.hypot(ax, ay, az);
    data[i * 4] = Math.round(((ax / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round(((ay / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round(((az / l) * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.minFilter = "nearest";
  tex.magFilter = "nearest";
  tex.generateMipmaps = false;
  return tex;
}

/* ---------- materials ---------- */

const flakeMap = makeFlakeNormalMap();

const candyPaint = material.carPaint({
  color: "#b3030f",
  metallic: 0.55,
  roughness: 0.34,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  normal: flakeMap,
  normalScale: 0.55,
  envMapIntensity: 1.6,
  sheen: 0.0
});

const chrome = material.pbr({ color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 1.8 });
const glass = material.pbr({ color: "#05070a", metallic: 0.2, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.02, envMapIntensity: 1.6 });
const rubber = material.pbr({ color: "#0b0b0d", metallic: 0, roughness: 0.78 });

/* ---------- object ---------- */

const BODY_Y = 0.7;
const bodyGeo = loft({
  length: 2.15,
  halfWidth: 0.88,
  halfTop: 0.4,
  halfBottom: 0.36,
  centerY: BODY_Y,
  lengthExp: 2.5,
  sectionExp: 2.9,
  uvScale: [5, 5],
  shape: (t) => [1 - 0.08 * t, 1 - 0.18 * Math.max(0, t) - 0.04 * Math.max(0, -t)],
  nu: 120,
  nv: 72
});

const CABIN = { centerX: -0.22, length: 0.95, halfWidth: 0.6, halfTop: 0.46, centerY: BODY_Y + 0.22 };
const cabinGeo = loft({
  length: CABIN.length,
  centerX: CABIN.centerX,
  halfWidth: CABIN.halfWidth,
  halfTop: CABIN.halfTop,
  halfBottom: 0.25,
  centerY: CABIN.centerY,
  lengthExp: 2.1,
  sectionExp: 2.4,
  uvScale: [3, 3],
  shape: (t) => [1, 1 - 0.1 * t],
  nu: 80,
  nv: 56
});

const roofGeo = loft({
  length: CABIN.length,
  centerX: CABIN.centerX,
  halfWidth: CABIN.halfWidth,
  halfTop: CABIN.halfTop,
  halfBottom: 0.25,
  centerY: CABIN.centerY,
  lengthExp: 2.1,
  sectionExp: 2.4,
  uvScale: [3, 3],
  shape: (t) => [1, 1 - 0.1 * t],
  theta0: Math.PI * 0.5 - 0.62,
  theta1: Math.PI * 0.5 + 0.62,
  grow: 0.012,
  nu: 80,
  nv: 24
});

// chrome belt-line strip following the outline of the body, just proud of the paint
function beltPoints(): V3[] {
  const pts: V3[] = [];
  const N = 90;
  const y = BODY_Y - 0.02;
  const L = 2.15, W = 0.88;
  const half = (t: number, side: number): V3 => {
    const env = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(t), 2.5)), 1 / 2.5);
    const w = W * (1 - 0.08 * t) * env + 0.012;
    return [L * t, y, side * w];
  };
  for (let i = 0; i <= N; i += 1) pts.push(half(-0.985 + (1.97 * i) / N, 1));
  for (let i = N; i >= 0; i -= 1) pts.push(half(-0.985 + (1.97 * i) / N, -1));
  return pts;
}
const beltGeo = loopTube(beltPoints(), 0.016, 8);

/* ---------- wheels ---------- */

const WHEEL_R = 0.37;
const wheelNodes = [] as ReturnType<typeof primitives.cylinder>[];
for (const sx of [-1, 1]) {
  for (const sz of [-1, 1]) {
    const x = sx * 1.28;
    const z = sz * 0.8;
    wheelNodes.push(
      primitives.cylinder({ name: `tire ${sx}${sz}`, size: [WHEEL_R * 2, 0.3, WHEEL_R * 2], material: rubber, castShadow: true })
        .position(x, WHEEL_R, z).rotation(Math.PI / 2, 0, 0)
    );
    wheelNodes.push(
      primitives.cylinder({ name: `rim ${sx}${sz}`, size: [WHEEL_R * 1.25, 0.31, WHEEL_R * 1.25], material: chrome })
        .position(x, WHEEL_R, z + sz * 0.012).rotation(Math.PI / 2, 0, 0)
    );
    wheelNodes.push(
      primitives.cylinder({ name: `hub ${sx}${sz}`, size: [WHEEL_R * 0.55, 0.32, WHEEL_R * 0.55], material: rubber })
        .position(x, WHEEL_R, z + sz * 0.02).rotation(Math.PI / 2, 0, 0)
    );
  }
}

/* ---------- turntable ---------- */

const PLATFORM_R = 3.15;
const PLATFORM_TOP = 0.12;

const turntable = groups.create("turntable", [
  primitives.cylinder({
    name: "platform",
    size: [PLATFORM_R * 2, PLATFORM_TOP, PLATFORM_R * 2],
    material: material.pbr({ color: "#15171c", metallic: 0.6, roughness: 0.18, envMapIntensity: 1.0 }),
    receiveShadow: true
  }).position(0, PLATFORM_TOP / 2, 0),
  primitives.torus({
    name: "ring light",
    size: [PLATFORM_R * 2, 0.07, PLATFORM_R * 2],
    material: material.emissive({ color: "#cfe3ff", emissive: "#9cc4ff", emissiveIntensity: 2.2 })
  }).position(0, PLATFORM_TOP + 0.01, 0),
  primitives.cylinder({
    name: "plinth chrome rim",
    size: [PLATFORM_R * 2 + 0.2, 0.05, PLATFORM_R * 2 + 0.2],
    material: chrome
  }).position(0, 0.025, 0),
  geometry.custom(bodyGeo, { name: "body", material: candyPaint, castShadow: true }).position(0, PLATFORM_TOP + 0.02, 0),
  geometry.custom(cabinGeo, { name: "cabin glass", material: glass, castShadow: true }).position(0, PLATFORM_TOP + 0.02, 0),
  geometry.custom(roofGeo, { name: "roof", material: candyPaint }).position(0, PLATFORM_TOP + 0.02, 0),
  geometry.custom(beltGeo, { name: "chrome belt", material: chrome }).position(0, PLATFORM_TOP + 0.02, 0),
  groups.create("wheels", wheelNodes).position(0, PLATFORM_TOP + 0.02, 0)
]).runtime({ id: "turntable", mutable: true });

/* ---------- app ---------- */

const app = createAuraApp("#app", {
  scene: scene({ background: "#05060a" })
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
    .add(lights.ambient({ intensity: 0.05 }))
    // long strip lights: overhead, left and right
    .add(lights.softbox({ name: "strip top", position: [0, 5.2, 0.5], target: [0, 0.5, 0], width: 0.6, height: 7, intensity: 5, color: "#fff4e8" }))
    .add(lights.softbox({ name: "strip left", position: [-4.5, 3.2, 1.5], target: [0, 0.6, 0], width: 0.5, height: 6, intensity: 4, color: "#ffffff" }))
    .add(lights.softbox({ name: "strip right", position: [4.5, 3.2, -1.5], target: [0, 0.6, 0], width: 0.5, height: 6, intensity: 4, color: "#ffffff" }))
    // faint cool rim
    .add(lights.directional({ name: "rim", position: [-3, 2.2, -6], target: [0, 0.8, 0], intensity: 1.4, color: "#9cc2ff" }))
    .add(lights.key({ target: [0, 0.4, 0], position: [2, 6, 3], intensity: 1.2 }))
    .add(turntable)
    .add(
      surfaces.mirror({
        name: "platform mirror",
        size: [4.8, 4.8],
        position: [0, PLATFORM_TOP + 0.015, 0],
        tint: "#3a3d46",
        resolution: 512
      })
    )
    .add(effects.bloom({ intensity: 0.35, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [5.6, 1.7, 5.4], target: [0, 0.7, 0], fov: 36 }))
});

let angleDeg = 0;
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame((frame) => {
  angleDeg += frame.dt * 20;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
