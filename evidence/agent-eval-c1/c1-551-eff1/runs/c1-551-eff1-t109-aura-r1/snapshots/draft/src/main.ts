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
  surfaces,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

type V3 = [number, number, number];

// ---------------------------------------------------------------- geometry helpers
const sgnpow = (v: number, p: number): number => Math.sign(v) * Math.pow(Math.abs(v), p);

/** Superellipsoid along X: smooth rounded "bean" body with separate upper/lower heights. */
function superBody(A: number, W: number, Hu: number, Hl: number, n1: number, n2: number, R = 96, S = 72) {
  const count = (R + 1) * (S + 1);
  const positions = new Float32Array(count * 3);
  const uvs = new Float32Array(count * 2);
  const indices: number[] = [];
  for (let j = 0; j <= S; j += 1) {
    const th = (Math.PI * j) / S;
    const x = A * sgnpow(Math.cos(th), n1);
    const s = Math.pow(Math.max(Math.sin(th), 0), n1);
    for (let i = 0; i <= R; i += 1) {
      const ph = (2 * Math.PI * i) / R;
      const sy = Math.sin(ph);
      const y = (sy >= 0 ? Hu : Hl) * s * sgnpow(sy, n2);
      const z = W * s * sgnpow(Math.cos(ph), n2);
      const k = j * (R + 1) + i;
      positions.set([x, y, z], k * 3);
      uvs.set([i / R, j / S], k * 2);
      if (i < R && j < S) indices.push(k, k + 1, k + R + 1, k + 1, k + R + 2, k + R + 1);
    }
  }
  const normals = geometry.computeNormals({ positions, indices });
  // Weld the UV seam and the poles so shading is continuous.
  for (let j = 0; j <= S; j += 1) {
    const a = j * (R + 1);
    const b = a + R;
    if (j === 0 || j === S) {
      const nx = j === 0 ? 1 : -1;
      for (let i = 0; i <= R; i += 1) normals.set([nx, 0, 0], (a + i) * 3);
    } else {
      for (let c = 0; c < 3; c += 1) {
        const m = (normals[a * 3 + c]! + normals[b * 3 + c]!) * 0.5;
        normals[a * 3 + c] = m;
        normals[b * 3 + c] = m;
      }
    }
  }
  return geometry.define({ positions, normals, uvs, indices, bounds: geometry.computeBounds({ positions }) });
}

/** Tube swept along a path, analytic normals. */
function tube(path: V3[], radius: number, sides = 12, closed = false) {
  const n = path.length;
  const positions = new Float32Array(n * (sides + 1) * 3);
  const normals = new Float32Array(n * (sides + 1) * 3);
  const indices: number[] = [];
  const norm = (v: V3): V3 => {
    const l = Math.hypot(v[0], v[1], v[2]) || 1;
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let k = 0; k < n; k += 1) {
    const p0 = path[closed ? (k + n - 1) % n : Math.max(k - 1, 0)]!;
    const p1 = path[closed ? (k + 1) % n : Math.min(k + 1, n - 1)]!;
    const T = norm([p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]);
    const ref: V3 = Math.abs(T[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
    const N = norm(cross(ref, T));
    const B = cross(T, N);
    for (let a = 0; a <= sides; a += 1) {
      const ang = (a / sides) * Math.PI * 2;
      const c = Math.cos(ang);
      const s = Math.sin(ang);
      const nx = c * N[0] + s * B[0];
      const ny = c * N[1] + s * B[1];
      const nz = c * N[2] + s * B[2];
      const idx = (k * (sides + 1) + a) * 3;
      positions.set([path[k]![0] + radius * nx, path[k]![1] + radius * ny, path[k]![2] + radius * nz], idx);
      normals.set([nx, ny, nz], idx);
      if (a < sides && k < n - 1) {
        const v = k * (sides + 1) + a;
        indices.push(v, v + 1, v + sides + 1, v + 1, v + sides + 2, v + sides + 1);
      }
    }
  }
  if (closed) {
    const last = (n - 1) * (sides + 1);
    for (let a = 0; a < sides; a += 1) {
      const v = last + a;
      indices.push(v, v + 1, a, v + 1, a + 1, a);
    }
  }
  return geometry.define({ positions, normals, indices, bounds: geometry.computeBounds({ positions }) });
}

// ---------------------------------------------------------------- body dimensions
const BODY = { A: 2.0, W: 0.92, Hu: 0.46, Hl: 0.32, n1: 0.72, n2: 0.8 };
const BODY_Y = 0.52; // body centre above the platform
const CAB_Y = BODY_Y + 0.34;

const bodyGeo = superBody(BODY.A, BODY.W, BODY.Hu, BODY.Hl, BODY.n1, BODY.n2);
const glassGeo = superBody(1.02, 0.67, 0.44, 0.12, 0.78, 0.85, 80, 56);
const roofGeo = superBody(0.8, 0.52, 0.32, 0.1, 0.8, 0.85, 80, 56);

/** Chrome beltline strip following the body surface at height y0 above its centre. */
function beltPath(side: 1 | -1, y0: number): V3[] {
  const pts: V3[] = [];
  const steps = 120;
  for (let k = 0; k <= steps; k += 1) {
    const th = 0.02 + (Math.PI - 0.04) * (k / steps);
    const s = Math.pow(Math.sin(th), BODY.n1);
    if (BODY.Hu * s < y0 * 1.08) continue;
    // bisection on phi in [0, pi/2] for y = y0
    let lo = 0;
    let hi = Math.PI / 2;
    for (let it = 0; it < 40; it += 1) {
      const mid = (lo + hi) / 2;
      const y = BODY.Hu * s * sgnpow(Math.sin(mid), BODY.n2);
      if (y < y0) lo = mid;
      else hi = mid;
    }
    const x = BODY.A * sgnpow(Math.cos(th), BODY.n1);
    const z = BODY.W * s * sgnpow(Math.cos(lo), BODY.n2);
    pts.push([x, y0 + BODY_Y, side * (z + 0.006)]);
  }
  return pts;
}

// ---------------------------------------------------------------- materials
// Metal flake: a sparse, fine random normal map. The base layer scatters light on those facets.
function flakeTexture() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < N * N; i += 1) {
    let nx = 0;
    let ny = 0;
    if (rnd() < 0.55) {
      const a = rnd() * Math.PI * 2;
      const m = 0.25 + rnd() * 0.75;
      nx = Math.cos(a) * m;
      ny = Math.sin(a) * m;
    }
    const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = texture.data({ width: N, height: N, data, format: "rgba8", colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.repeat = [14, 8];
  tex.minFilter = "linear-mipmap-linear";
  tex.magFilter = "linear";
  return tex;
}

const paint = material.physical({
  color: "#b30818",
  metallic: 0.55,
  roughness: 0.34,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  normal: flakeTexture(),
  normalScale: 0.55,
  envMapIntensity: 1.6,
  ior: 1.5,
  specularIntensity: 1
});
const glass = material.physical({
  color: "#04060a",
  metallic: 0.1,
  roughness: 0.06,
  clearcoat: 1,
  clearcoatRoughness: 0.02,
  envMapIntensity: 1.4
});
const chrome = material.pbr({ color: "#f2f4f8", metallic: 1, roughness: 0.04, envMapIntensity: 1.8 });
const rubber = material.pbr({ color: "#0b0b0d", metallic: 0, roughness: 0.85 });
const platformMat = material.pbr({
  color: "#0c0d12",
  metallic: 0.3,
  roughness: 0.2,
  opacity: 0.55,
  alphaMode: "blend"
});
const ringLight = material.pbr({
  color: "#aee0ff",
  emissive: "#9fd6ff",
  emissiveIntensity: 2.2,
  roughness: 0.4
});
const stripFixture = material.pbr({
  color: "#ffffff",
  emissive: "#ffffff",
  emissiveIntensity: 3,
  roughness: 0.5
});

// ---------------------------------------------------------------- scene parts
const wheel = (x: number, z: number) => [
  primitives
    .cylinder({ name: `tyre-${x}-${z}`, size: [0.74, 0.27, 0.74], material: rubber })
    .rotation(Math.PI / 2, 0, 0)
    .position(x, 0.37, z),
  primitives
    .cylinder({ name: `hub-${x}-${z}`, size: [0.4, 0.285, 0.4], material: chrome })
    .rotation(Math.PI / 2, 0, 0)
    .position(x, 0.37, z)
];

const circlePath = (r: number, y: number, n = 160): V3[] =>
  Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return [Math.cos(a) * r, y, Math.sin(a) * r];
  });

const ticks = Array.from({ length: 12 }, (_, i) => {
  const a = (i / 12) * Math.PI * 2;
  return primitives
    .box({ name: `tick-${i}`, size: [0.05, 0.02, 0.22], material: chrome, castShadow: false })
    .rotation(0, -a, 0)
    .position(Math.cos(a) * 1.82, 0.055, Math.sin(a) * 1.82);
});

const turntable = group("turntable", [
  // platform (translucent dark glass-like top so the floor mirror shows the object faintly)
  primitives.cylinder({ name: "platform", size: [4.7, 0.05, 4.7], material: platformMat, castShadow: false }).position(0, 0.03, 0),
  geometry.custom(tube(circlePath(2.36, 0.05), 0.055, 16, true), { name: "platform-rim", material: chrome, castShadow: false }),
  geometry.custom(tube(circlePath(2.16, 0.065), 0.022, 10, true), { name: "ring-light", material: ringLight, castShadow: false }),
  ...ticks,
  // car
  geometry.custom(bodyGeo, { name: "body", material: paint }).position(0, BODY_Y, 0),
  geometry.custom(glassGeo, { name: "glass", material: glass }).position(-0.12, CAB_Y, 0),
  geometry.custom(roofGeo, { name: "roof", material: paint }).position(-0.12, CAB_Y + 0.22, 0),
  geometry.custom(tube(beltPath(1, 0.12), 0.02, 10), { name: "belt-r", material: chrome }),
  geometry.custom(tube(beltPath(-1, 0.12), 0.02, 10), { name: "belt-l", material: chrome }),
  ...wheel(1.18, 0.83),
  ...wheel(1.18, -0.83),
  ...wheel(-1.18, 0.83),
  ...wheel(-1.18, -0.83)
]).runtime({ id: "turntable", mutable: true });

// Long soft-box strip fixtures: visible emissive bars (kept above / beside the frame) plus rect lights.
const strip = (name: string, pos: V3, size: V3) =>
  primitives.box({ name, size, material: stripFixture, castShadow: false }).position(...pos);

const app = createAuraApp("#app", {
  scene: scene({ background: "#04050a" })
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false }))
    .add(lights.rect({ name: "strip-top-a", position: [0, 4.2, 1.8], target: [0, 0.5, 0], width: 7, height: 0.5, intensity: 14, color: "#ffffff" }))
    .add(lights.rect({ name: "strip-top-b", position: [0, 4.2, -1.8], target: [0, 0.5, 0], width: 7, height: 0.5, intensity: 14, color: "#fff2e6" }))
    .add(lights.rect({ name: "strip-side", position: [-4.5, 2.2, 0.5], target: [0, 0.5, 0], width: 0.5, height: 4.5, intensity: 12, color: "#ffffff" }))
    .add(lights.directional({ name: "rim", position: [-3, 2.5, -5], target: [0, 0.6, 0], intensity: 1.3, color: "#7fb4ff" }))
    .add(strip("fixture-top-a", [0, 4.2, 1.8], [7, 0.06, 0.4]))
    .add(strip("fixture-top-b", [0, 4.2, -1.8], [7, 0.06, 0.4]))
    .add(strip("fixture-side", [-4.5, 2.2, 0.5], [0.06, 4.5, 0.4]))
    .add(surfaces.mirror({ name: "floor-mirror", size: [30, 30], position: [0, 0, 0], tint: "#3a3d46", resolution: 512 }))
    .add(turntable)
    .add(effects.bloom({ intensity: 0.45, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [4.3, 1.15, 5.3], target: [0, 0.55, 0], fov: 36 }))
});

window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

let frames = 0;
app.onFrame((f) => {
  const deg = f.time * 20;
  app.nodes.require("turntable").setRotation(0, (deg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: deg, paintFinish: "clearcoat" };
  frames += 1;
  if (frames === 2) window.__EVAL_READY__ = true;
});

void app.ready();
