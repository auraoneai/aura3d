import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: "clearcoat" };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------------------
// Procedural geometry: a superellipsoid shell (rounded, streamlined car body)
// ---------------------------------------------------------------------------
interface Shell {
  a: number; // half length (x)
  b: number; // half height (y)
  c: number; // half width (z)
  e1: number; // longitudinal squareness (1 = ellipse)
  e2: number; // cross-section squareness
  k: number; // top/bottom asymmetry
  taper: number; // lowers the +x end (hood) when positive
}

const sp = (t: number, e: number): number => Math.sign(t) * Math.abs(t) ** e;

const shellPoint = (p: Shell, u: number, v: number): V3 => {
  const cv = sp(Math.cos(v), p.e1);
  const q = sp(Math.sin(u), p.e2);
  return [
    p.a * sp(Math.sin(v), p.e1),
    p.b * cv * q * (1 + p.k * q) * (1 - p.taper * Math.sin(v)),
    p.c * cv * sp(Math.cos(u), p.e2)
  ];
};

const posKey = (x: number, y: number, z: number): string =>
  `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;

/** Area-weighted smooth normals; vertices sharing a position (seams, poles) share a normal. */
const smoothNormals = (positions: Float32Array, indices: number[]): Float32Array => {
  const acc = new Map<string, V3>();
  const keys: string[] = [];
  const count = positions.length / 3;
  for (let i = 0; i < count; i += 1) {
    const key = posKey(positions[i * 3], positions[i * 3 + 1], positions[i * 3 + 2]);
    keys.push(key);
    if (!acc.has(key)) acc.set(key, [0, 0, 0]);
  }
  for (let t = 0; t < indices.length; t += 3) {
    const ia = indices[t];
    const ib = indices[t + 1];
    const ic = indices[t + 2];
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const ux = positions[ib * 3] - ax;
    const uy = positions[ib * 3 + 1] - ay;
    const uz = positions[ib * 3 + 2] - az;
    const vx = positions[ic * 3] - ax;
    const vy = positions[ic * 3 + 1] - ay;
    const vz = positions[ic * 3 + 2] - az;
    const nx = uy * vz - uz * vy;
    const ny = uz * vx - ux * vz;
    const nz = ux * vy - uy * vx;
    for (const idx of [ia, ib, ic]) {
      const a = acc.get(keys[idx]);
      if (a) {
        a[0] += nx;
        a[1] += ny;
        a[2] += nz;
      }
    }
  }
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < count; i += 1) {
    const a = acc.get(keys[i]) ?? [0, 1, 0];
    const len = Math.hypot(a[0], a[1], a[2]);
    if (len > 1e-12) normals.set([a[0] / len, a[1] / len, a[2] / len], i * 3);
    else normals.set([0, 1, 0], i * 3);
  }
  return normals;
};

const shellGeometry = (p: Shell, nu = 96, nv = 72) => {
  const stride = nu + 1;
  const verts = stride * (nv + 1);
  const positions = new Float32Array(verts * 3);
  const uvs = new Float32Array(verts * 2);
  for (let j = 0; j <= nv; j += 1) {
    const v = -Math.PI / 2 + (Math.PI * j) / nv;
    for (let i = 0; i <= nu; i += 1) {
      const u = -Math.PI + (2 * Math.PI * i) / nu;
      const idx = j * stride + i;
      positions.set(shellPoint(p, u, v), idx * 3);
      uvs.set([i / nu, j / nv], idx * 2);
    }
  }
  let indices: number[] = [];
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }
  let normals = smoothNormals(positions, indices);
  // Top-of-roof vertex (u = pi/2, v = 0) must face +y; otherwise flip the winding.
  const top = (nv / 2) * stride + (nu * 3) / 4;
  if (normals[top * 3 + 1] < 0) {
    const flipped: number[] = [];
    for (let t = 0; t < indices.length; t += 3) flipped.push(indices[t], indices[t + 2], indices[t + 1]);
    indices = flipped;
    normals = smoothNormals(positions, indices);
  }
  return geometry.define({ positions, normals, uvs, indices, bounds: geometry.computeBounds({ positions }) });
};

/** Closed round tube that follows the widest outline (belt line) of a shell. */
const beltTube = (p: Shell, cx: number, cy: number, radius: number, n = 140, m = 10) => {
  const pts: V3[] = [];
  for (let i = 0; i < n; i += 1) {
    const v = -Math.PI / 2 + (Math.PI * (i + 0.5)) / n;
    pts.push(shellPoint(p, 0, v));
  }
  for (let i = n - 1; i >= 0; i -= 1) {
    const v = -Math.PI / 2 + (Math.PI * (i + 0.5)) / n;
    pts.push(shellPoint(p, Math.PI, v));
  }
  const total = pts.length;
  const positions = new Float32Array(total * m * 3);
  const normals = new Float32Array(total * m * 3);
  for (let k = 0; k < total; k += 1) {
    const prev = pts[(k + total - 1) % total];
    const next = pts[(k + 1) % total];
    let tx = next[0] - prev[0];
    let ty = next[1] - prev[1];
    let tz = next[2] - prev[2];
    const tl = Math.hypot(tx, ty, tz) || 1;
    tx /= tl;
    ty /= tl;
    tz /= tl;
    // side = tangent x up(0,1,0)
    let sx = -tz;
    let sz = tx;
    const sl = Math.hypot(sx, sz) || 1;
    sx /= sl;
    sz /= sl;
    for (let a = 0; a < m; a += 1) {
      const ang = (2 * Math.PI * a) / m;
      const dx = Math.cos(ang) * sx;
      const dy = Math.sin(ang);
      const dz = Math.cos(ang) * sz;
      const idx = (k * m + a) * 3;
      positions.set([pts[k][0] + cx + dx * radius, pts[k][1] + cy + dy * radius, pts[k][2] + dz * radius], idx);
      normals.set([dx, dy, dz], idx);
    }
  }
  let indices: number[] = [];
  for (let k = 0; k < total; k += 1) {
    const k1 = (k + 1) % total;
    for (let a = 0; a < m; a += 1) {
      const a1 = (a + 1) % m;
      const i00 = k * m + a;
      const i10 = k1 * m + a;
      const i01 = k * m + a1;
      const i11 = k1 * m + a1;
      indices.push(i00, i10, i01, i01, i10, i11);
    }
  }
  // Check the first triangle against the radial normal and flip when inverted.
  const [t0, t1, t2] = indices;
  const ux = positions[t1 * 3] - positions[t0 * 3];
  const uy = positions[t1 * 3 + 1] - positions[t0 * 3 + 1];
  const uz = positions[t1 * 3 + 2] - positions[t0 * 3 + 2];
  const vx = positions[t2 * 3] - positions[t0 * 3];
  const vy = positions[t2 * 3 + 1] - positions[t0 * 3 + 1];
  const vz = positions[t2 * 3 + 2] - positions[t0 * 3 + 2];
  const fx = uy * vz - uz * vy;
  const fy = uz * vx - ux * vz;
  const fz = ux * vy - uy * vx;
  const dot = fx * normals[t0 * 3] + fy * normals[t0 * 3 + 1] + fz * normals[t0 * 3 + 2];
  if (dot < 0) {
    const flipped: number[] = [];
    for (let t = 0; t < indices.length; t += 3) flipped.push(indices[t], indices[t + 2], indices[t + 1]);
    indices = flipped;
  }
  return geometry.define({ positions, normals, indices, bounds: geometry.computeBounds({ positions }) });
};

// ---------------------------------------------------------------------------
// Metallic flake normal map (generated in code): sparse randomly tilted facets
// ---------------------------------------------------------------------------
const mulberry32 = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

const makeFlakeTexture = () => {
  const size = 256;
  const rand = mulberry32(20240611);
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i += 1) {
    const flake = rand() < 0.09;
    const tilt = flake ? 0.25 + rand() * 0.55 : rand() * 0.04;
    const dir = rand() * Math.PI * 2;
    const nx = Math.cos(dir) * tilt;
    const ny = Math.sin(dir) * tilt;
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.repeat = [9, 6];
  tex.generateMipmaps = false;
  tex.minFilter = "linear";
  tex.magFilter = "nearest";
  return tex;
};

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const flake = makeFlakeTexture();

// Deep candy-red base coat with metallic flake normal, under a glossy clear coat.
const candyPaint = material.carPaint({
  name: "candy-red-paint",
  color: "#a3081c",
  metallic: 0.6,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.015,
  envMapIntensity: 1.7,
  normal: flake,
  normalScale: 0.55
});
const candyPaintMirror = material.carPaint({
  name: "candy-red-paint-mirror",
  color: "#4a040d",
  metallic: 0.5,
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.0
});
const glass = material.physical({
  name: "cabin-glass",
  color: "#020305",
  metallic: 0.1,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.01,
  envMapIntensity: 2.2
});
const glassMirror = material.physical({ color: "#010102", roughness: 0.1, envMapIntensity: 0.8 });
const chrome = material.chrome({ name: "chrome-trim" });
const chromeMirror = material.pbr({ color: "#4b5058", metallic: 1, roughness: 0.2, envMapIntensity: 0.8 });
const rubber = material.pbr({ name: "tyre", color: "#0a0b0d", roughness: 0.82, metallic: 0 });

// ---------------------------------------------------------------------------
// The car
// ---------------------------------------------------------------------------
const BODY_Y = 0.6;
const bodyShell: Shell = { a: 2.0, b: 0.42, c: 0.9, e1: 0.75, e2: 0.65, k: 0.2, taper: 0.12 };
const cabinShell: Shell = { a: 1.0, b: 0.3, c: 0.62, e1: 0.85, e2: 0.7, k: 0.15, taper: 0.1 };
const roofShell: Shell = { a: 0.66, b: 0.06, c: 0.46, e1: 0.8, e2: 0.5, k: 0, taper: 0 };
const CABIN_X = -0.25;
const CABIN_Y = 1.04;

const bodyGeo = shellGeometry(bodyShell);
const cabinGeo = shellGeometry(cabinShell, 72, 48);
const roofGeo = shellGeometry(roofShell, 64, 32);
const beltGeo = beltTube(bodyShell, 0, BODY_Y, 0.024);
const cabinRingGeo = beltTube(cabinShell, CABIN_X, CABIN_Y, 0.02, 100, 8);

const carParts = (prefix: string, mirror: boolean) => {
  const paint = mirror ? candyPaintMirror : candyPaint;
  const glassMat = mirror ? glassMirror : glass;
  const trim = mirror ? chromeMirror : chrome;
  const shadow = !mirror;
  const parts = [
    geometry.custom(bodyGeo, { name: `${prefix}-body`, material: paint, castShadow: shadow, receiveShadow: shadow }).position(0, BODY_Y, 0),
    geometry.custom(cabinGeo, { name: `${prefix}-cabin`, material: glassMat, castShadow: shadow }).position(CABIN_X, CABIN_Y, 0),
    geometry.custom(roofGeo, { name: `${prefix}-roof`, material: paint, castShadow: shadow }).position(CABIN_X - 0.05, 1.36, 0),
    geometry.custom(beltGeo, { name: `${prefix}-belt-trim`, material: trim, castShadow: false }),
    geometry.custom(cabinRingGeo, { name: `${prefix}-cabin-trim`, material: trim, castShadow: false })
  ];
  for (const [wx, side] of [[1.25, 1], [1.25, -1], [-1.25, 1], [-1.25, -1]] as const) {
    const tag = `${prefix}-wheel-${wx > 0 ? "f" : "r"}${side > 0 ? "l" : "r"}`;
    parts.push(
      primitives.cylinder({ name: tag, size: [0.8, 0.28, 0.8], material: rubber, castShadow: shadow }).position(wx, 0.4, side * 0.9).rotate(Math.PI / 2, 0, 0),
      primitives.cylinder({ name: `${tag}-rim`, size: [0.5, 0.03, 0.5], material: trim, castShadow: false }).position(wx, 0.4, side * 1.045).rotate(Math.PI / 2, 0, 0),
      primitives.cylinder({ name: `${tag}-cap`, size: [0.16, 0.05, 0.16], material: trim, castShadow: false }).position(wx, 0.4, side * 1.06).rotate(Math.PI / 2, 0, 0)
    );
  }
  return parts;
};

// ---------------------------------------------------------------------------
// Turntable: glossy dark glass disc, ring light, tick marks, car + faint mirror image
// ---------------------------------------------------------------------------
const plateMaterial = material.pbr({
  name: "turntable-glass",
  color: "#06070b",
  metallic: 0.2,
  roughness: 0.1,
  opacity: 0.8,
  clearcoat: 0.8,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.1
});
const ringLight = material.emissive({ color: "#bcdcff", emissive: "#8cc4ff", emissiveIntensity: 2.2 });
const tickMat = material.pbr({ color: "#aeb4bf", metallic: 1, roughness: 0.25, envMapIntensity: 1.2 });

const ticks = Array.from({ length: 24 }, (_, i) => {
  const ang = (i / 24) * Math.PI * 2;
  const r = 2.95;
  return primitives
    .box({ name: `tick-${i}`, size: i % 6 === 0 ? [0.07, 0.012, 0.3] : [0.04, 0.01, 0.16], material: tickMat, castShadow: false })
    .position(Math.cos(ang) * r, 0.006, Math.sin(ang) * r)
    .rotate(0, -ang, 0);
});

const turntable = group(
  "turntable",
  [
    primitives.cylinder({ name: "plate", size: [6.4, 0.05, 6.4], material: plateMaterial, castShadow: false }).position(0, -0.025, 0),
    primitives.cylinder({ name: "ring-light", size: [6.7, 0.03, 6.7], material: ringLight, castShadow: false }).position(0, -0.02, 0),
    ...ticks,
    group("car", carParts("car", false)),
    // Faint mirror image under the glass. The car is symmetric about the xz plane, so a half-turn about X
    // gives the same silhouette as a vertical mirror.
    group("car-reflection", carParts("refl", true), { rotation: [Math.PI, 0, 0] })
  ],
  {}
).runtime({ id: "turntable", mutable: true });

// ---------------------------------------------------------------------------
// Showroom
// ---------------------------------------------------------------------------
const stripEmitter = material.emissive({ color: "#ffffff", emissive: "#f2f6ff", emissiveIntensity: 3 });
const carCentre: V3 = [0, 0.7, 0];

const app = createAuraApp("#app", {
  scene: scene({ background: "#030409" })
    .add(environments.neutral({ intensity: 1.0, background: false }))
    // Long soft-box strips: overhead, left and right
    .add(lights.rect({ name: "strip-top", position: [0, 4.4, 0], target: carCentre, width: 0.7, height: 7, intensity: 4, color: "#ffffff" }))
    .add(lights.rect({ name: "strip-left", position: [-4.8, 2.6, 1.0], target: carCentre, width: 0.6, height: 6, intensity: 4, color: "#fff4e8" }))
    .add(lights.rect({ name: "strip-right", position: [4.6, 2.8, -2.4], target: carCentre, width: 0.6, height: 6, intensity: 3.5, color: "#f4f8ff" }))
    .add(lights.directional({ name: "key", position: [2.5, 6, 3.5], target: carCentre, intensity: 0.9, color: "#fff6ec" }))
    // Faint cool rim light from behind
    .add(lights.directional({ name: "rim", position: [-3.5, 2.5, -6], target: carCentre, intensity: 1.5, color: "#7fa6ff" }))
    // Visible strip fixtures above the set
    .add(primitives.box({ name: "fixture-top", size: [0.22, 0.06, 7], material: stripEmitter, castShadow: false }).position(0, 4.6, -1.5))
    .add(primitives.box({ name: "fixture-left", size: [0.22, 0.06, 6], material: stripEmitter, castShadow: false }).position(-5.2, 3.9, -1.5))
    .add(primitives.box({ name: "fixture-right", size: [0.22, 0.06, 6], material: stripEmitter, castShadow: false }).position(5.2, 3.9, -1.5))
    .add(turntable)
    .add(effects.bloom({ intensity: 0.4, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [5.9, 1.5, 4.6], target: [0, 0.5, 0], fov: 30 }))
});

// ---------------------------------------------------------------------------
// Animation + task state
// ---------------------------------------------------------------------------
const DEG_PER_SECOND = 20;
const t0 = performance.now();
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame(() => {
  const angleDeg = ((performance.now() - t0) / 1000) * DEG_PER_SECOND;
  app.nodes.require("turntable").setRotation(0, (angleDeg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: angleDeg, paintFinish: "clearcoat" };
});

void app.ready().then(
  () =>
    new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
).then(() => {
  window.__EVAL_READY__ = true;
});
