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
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

type P3 = [number, number, number];

// ---------------------------------------------------------------------------
// Small parametric-mesh toolkit (all geometry is generated in code).
// ---------------------------------------------------------------------------
interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
}

const spow = (a: number, e: number): number => Math.sign(a) * Math.pow(Math.abs(a), e);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

function buildGrid(
  nu: number,
  nv: number,
  fn: (u: number, v: number) => P3,
  centerOf: (u: number, v: number) => P3,
  clampV: boolean
): MeshData {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const e = 1e-3;
  for (let i = 0; i <= nu; i += 1) {
    for (let j = 0; j <= nv; j += 1) {
      const u = i / nu;
      const v = j / nv;
      const p = fn(u, v);
      const vv = clampV ? Math.min(1 - 0.01, Math.max(0.01, v)) : v;
      const a1 = fn(u + e, vv);
      const a0 = fn(u - e, vv);
      const b1 = fn(u, vv + e);
      const b0 = fn(u, vv - e);
      const du: P3 = [a1[0] - a0[0], a1[1] - a0[1], a1[2] - a0[2]];
      const dv: P3 = [b1[0] - b0[0], b1[1] - b0[1], b1[2] - b0[2]];
      let n: P3 = [
        du[1] * dv[2] - du[2] * dv[1],
        du[2] * dv[0] - du[0] * dv[2],
        du[0] * dv[1] - du[1] * dv[0]
      ];
      const c = centerOf(u, v);
      const out: P3 = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      let len = Math.hypot(n[0], n[1], n[2]);
      if (len < 1e-12) {
        n = out;
        len = Math.hypot(n[0], n[1], n[2]) || 1;
      }
      n = [n[0] / len, n[1] / len, n[2] / len];
      if (n[0] * out[0] + n[1] * out[1] + n[2] * out[2] < 0) n = [-n[0], -n[1], -n[2]];
      positions.push(p[0], p[1], p[2]);
      normals.push(n[0], n[1], n[2]);
      uvs.push(u, v);
    }
  }
  const stride = nv + 1;
  const tri = (a: number, b: number, c: number): void => {
    const pa = a * 3;
    const pb = b * 3;
    const pc = c * 3;
    const ab: P3 = [positions[pb]! - positions[pa]!, positions[pb + 1]! - positions[pa + 1]!, positions[pb + 2]! - positions[pa + 2]!];
    const ac: P3 = [positions[pc]! - positions[pa]!, positions[pc + 1]! - positions[pa + 1]!, positions[pc + 2]! - positions[pa + 2]!];
    const fx = ab[1] * ac[2] - ab[2] * ac[1];
    const fy = ab[2] * ac[0] - ab[0] * ac[2];
    const fz = ab[0] * ac[1] - ab[1] * ac[0];
    const sx = normals[pa]! + normals[pb]! + normals[pc]!;
    const sy = normals[pa + 1]! + normals[pb + 1]! + normals[pc + 1]!;
    const sz = normals[pa + 2]! + normals[pb + 2]! + normals[pc + 2]!;
    if (fx * sx + fy * sy + fz * sz >= 0) indices.push(a, b, c);
    else indices.push(a, c, b);
  };
  for (let i = 0; i < nu; i += 1) {
    for (let j = 0; j < nv; j += 1) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = b + 1;
      const d = a + 1;
      tri(a, b, d);
      tri(b, c, d);
    }
  }
  return { positions, normals, uvs, indices };
}

/** Superellipsoid along X: x is length, y is height, z is width. */
function superEllipsoid(
  L: number,
  W: number,
  H: number,
  e1: number,
  e2: number,
  shape: (p: P3) => P3
): MeshData {
  const fn = (u: number, v: number): P3 => {
    const phi = u * Math.PI * 2;
    const theta = v * Math.PI;
    const r = Math.pow(Math.max(0, Math.sin(theta)), e1);
    const raw: P3 = [
      L * spow(Math.cos(theta), e1),
      H * r * spow(Math.sin(phi), e2),
      W * r * spow(Math.cos(phi), e2)
    ];
    return shape(raw);
  };
  return buildGrid(112, 72, fn, () => [0, 0, 0], true);
}

/** Tube of radius `r` swept along a planar-in-XZ spine. */
function sweepTube(spine: (u: number) => P3, r: number, nu: number): MeshData {
  const fn = (u: number, v: number): P3 => {
    const s = spine(u);
    const s1 = spine(u + 1e-3);
    const s0 = spine(u - 1e-3);
    const tx = s1[0] - s0[0];
    const tz = s1[2] - s0[2];
    const tl = Math.hypot(tx, tz) || 1;
    const nx = tz / tl;
    const nz = -tx / tl;
    const a = v * Math.PI * 2;
    return [s[0] + r * Math.cos(a) * nx, s[1] + r * Math.sin(a), s[2] + r * Math.cos(a) * nz];
  };
  return buildGrid(nu, 14, fn, (u) => spine(u), false);
}

function toBounds(m: MeshData): { min: P3; max: P3 } {
  const min: P3 = [Infinity, Infinity, Infinity];
  const max: P3 = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < m.positions.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      const v = m.positions[i + k]!;
      if (v < min[k]!) min[k] = v;
      if (v > max[k]!) max[k] = v;
    }
  }
  return { min, max };
}

/** Reflect a mesh through y = 0 and restore outward winding. */
function mirrorY(m: MeshData): MeshData {
  const positions = m.positions.slice();
  const normals = m.normals.slice();
  for (let i = 1; i < positions.length; i += 3) {
    positions[i] = -positions[i]!;
    normals[i] = -normals[i]!;
  }
  const indices: number[] = [];
  for (let i = 0; i < m.indices.length; i += 3) {
    indices.push(m.indices[i]!, m.indices[i + 2]!, m.indices[i + 1]!);
  }
  return { positions, normals, uvs: m.uvs, indices };
}

const spec = (m: MeshData) =>
  geometry.define({
    positions: m.positions,
    normals: m.normals,
    uvs: m.uvs,
    indices: m.indices,
    bounds: toBounds(m)
  });

// ---------------------------------------------------------------------------
// Car-paint flake normal map: sparse, strongly tilted micro-facets.
// ---------------------------------------------------------------------------
function makeFlakeNormalMap() {
  const N = 256;
  const data = new Uint8Array(N * N * 4);
  let seed = 0x9e3779b9;
  const rnd = (): number => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  for (let i = 0; i < N * N; i += 1) {
    let nx = 0;
    let ny = 0;
    if (rnd() < 0.42) {
      nx = (rnd() * 2 - 1) * 0.95;
      ny = (rnd() * 2 - 1) * 0.95;
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
  tex.repeat = [3, 3];
  tex.minFilter = "linear-mipmap-linear";
  tex.magFilter = "linear";
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
const paint = material.physical({
  name: "candy red car paint",
  color: "#a2001a", // deep candy base coat
  metallic: 0.55, // metallic flake layer under the clear coat
  roughness: 0.3,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.6,
  normal: makeFlakeNormalMap(),
  normalScale: 0.55
});
const glass = material.physical({
  name: "black cabin glass",
  color: "#020306",
  metallic: 0.1,
  roughness: 0.04,
  clearcoat: 1,
  clearcoatRoughness: 0.01,
  envMapIntensity: 2.2
});
const chrome = material.chrome();
const rubber = material.blackRubber();

// Clear-coat reflection layer. It renders an analytic studio (long strip soft-boxes) reflected by the coat
// (Schlick Fresnel, IOR 1.5) and, for paint, glints from random metallic flakes in the base layer. Drawn additively
// on a shell 4 mm above the clear-coated PBR surface, in world space, so the strips slide over the panels as the
// platform turns.
function coatReflection(options: { flakes: boolean; gain: number; f0: number }) {
  const flakes = options.flakes
    ? `
  vec3 cell = floor(vLP * 70.0);
  float h0 = hash13(cell);
  float h1 = hash13(cell + 11.7);
  float h2 = hash13(cell + 23.1);
  float h3 = hash13(cell + 37.9);
  vec3 fn = normalize(n + (vec3(h0, h1, h2) - 0.5) * 1.2);
  vec3 fr = reflect(-v, fn);
  float flakeMask = step(0.5, h3);
  vec3 flakeCol = vec3(1.0, 0.32, 0.38);
  col += studio(fr) * flakeCol * flakeMask * 0.16;
  float glint = pow(max(dot(fr, normalize(vec3(-0.35, 0.75, 0.55))), 0.0), 40.0);
  col += flakeCol * glint * flakeMask * step(0.8, h0) * 1.1;`
    : "";
  return material.custom({
    glsl: {
      vertex: /* glsl */ `
out vec3 vWPos;
out vec3 vWN;
out vec3 vLP;
void main() {
  vec3 p = position + normal * 0.004;
  vLP = position;
  vWPos = (modelMatrix * vec4(p, 1.0)).xyz;
  vWN = normalize(mat3(modelMatrix) * normal);
  gl_Position = modelViewProjectionMatrix * vec4(p, 1.0);
}`,
      fragment: /* glsl */ `
in vec3 vWPos;
in vec3 vWN;
in vec3 vLP;
out vec4 outColor;

float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float band(float x, float hw, float soft) {
  return 1.0 - smoothstep(hw - soft, hw + soft, abs(x));
}
float wrapAng(float a) {
  return atan(sin(a), cos(a));
}
float vstrip(vec3 r, float azc, float hw, float e0, float e1) {
  float az = atan(r.x, r.z);
  float el = asin(clamp(r.y, -1.0, 1.0));
  float m = band(wrapAng(az - azc), hw, hw * 0.45);
  return m * smoothstep(e0 - 0.08, e0 + 0.08, el) * (1.0 - smoothstep(e1 - 0.08, e1 + 0.08, el));
}
vec3 studio(vec3 r) {
  vec3 col = mix(vec3(0.012, 0.014, 0.02), vec3(0.05, 0.06, 0.085), smoothstep(-0.1, 0.9, r.y));
  float topMask = smoothstep(0.15, 0.3, r.y);
  float u = r.x / max(r.y, 0.05);
  float w = r.z / max(r.y, 0.05);
  col += vec3(1.0) * band(u, 1.9, 0.5) * band(w - 0.1, 0.16, 0.1) * topMask * 14.0;
  col += vec3(1.0, 0.95, 0.88) * vstrip(r, -2.06, 0.11, -0.05, 0.7) * 12.0;
  col += vec3(0.9, 0.95, 1.0) * vstrip(r, 2.15, 0.11, -0.05, 0.7) * 12.0;
  col += vec3(1.0, 0.97, 0.92) * vstrip(r, -0.62, 0.17, 0.0, 0.9) * 6.0;
  col += vec3(0.85, 0.92, 1.0) * vstrip(r, 0.55, 0.17, 0.0, 0.9) * 4.0;
  return col;
}
void main() {
  vec3 n = normalize(vWN);
  vec3 v = normalize(cameraPosition - vWPos);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float fres = ${options.f0.toFixed(3)} + (1.0 - ${options.f0.toFixed(3)}) * pow(1.0 - ndv, 5.0);
  vec3 r = reflect(-v, n);
  vec3 col = studio(r) * fres * ${options.gain.toFixed(3)};${flakes}
  outColor = vec4(max(col, vec3(0.0)), 1.0);
}`
    },
    transparent: true,
    depthWrite: false,
    blending: "additive",
    side: "front",
    fog: false
  });
}
const paintCoat = coatReflection({ flakes: true, gain: 1.0, f0: 0.04 });
const glassCoat = coatReflection({ flakes: false, gain: 1.4, f0: 0.06 });

// ---------------------------------------------------------------------------
// Car (platform top is y = 0). `mirror` builds the faint reflection below it.
// ---------------------------------------------------------------------------
const BODY_Y = 0.62;
const CABIN_Y = 1.02;
const BODY = { L: 1.9, W: 0.82, H: 0.46, e1: 0.75, e2: 0.75 };
const CABIN = { L: 0.9, W: 0.52, H: 0.36, e1: 0.85, e2: 0.8, x: -0.2 };

const bodyMesh = superEllipsoid(BODY.L, BODY.W, BODY.H, BODY.e1, BODY.e2, ([x, y, z]) => {
  const xn = x / BODY.L;
  const ys = y / BODY.H;
  const compress = 0.775 + 0.225 * Math.tanh(ys * 6); // shallow underside, full-height roof
  const hood = 1 - 0.22 * smoothstep(0.1, 1, xn); // hood slopes down toward the nose
  const nose = 1 - 0.12 * smoothstep(0.3, 1, xn); // narrower nose
  return [x, y * compress * hood, z * nose];
});

const cabinMesh = superEllipsoid(CABIN.L, CABIN.W, CABIN.H, CABIN.e1, CABIN.e2, ([x, y, z]) => [
  x - 0.35 * Math.max(y, 0), // raked windshield and rear glass
  y,
  z
]);

const ringMesh = sweepTube(
  (u) => [
    CABIN.x + (CABIN.L + 0.005) * spow(Math.cos(u * Math.PI * 2), CABIN.e1),
    CABIN_Y,
    (CABIN.W + 0.005) * spow(Math.sin(u * Math.PI * 2), CABIN.e1)
  ],
  0.02,
  96
);

const bodySideZ = (x: number): number => {
  const xn = x / BODY.L;
  const r = Math.pow(Math.max(0, 1 - Math.pow(Math.abs(xn), 2 / BODY.e1)), BODY.e1 / 2);
  return BODY.W * r * (1 - 0.12 * smoothstep(0.3, 1, xn));
};
const stripMesh = (side: 1 | -1): MeshData =>
  sweepTube((u) => {
    const x = -1.3 + 2.6 * u;
    return [x, BODY_Y, side * (bodySideZ(x) + 0.004)];
  }, 0.016, 48);

const WHEELS: ReadonlyArray<readonly [number, number]> = [
  [1.18, 0.74],
  [1.18, -0.74],
  [-1.18, 0.74],
  [-1.18, -0.74]
];

function carNodes(mirror: boolean) {
  const sy = mirror ? -1 : 1;
  const tag = mirror ? "mirror-" : "";
  const geo = (m: MeshData) => spec(mirror ? mirrorY(m) : m);
  const bodySpec = geo(bodyMesh);
  const cabinSpec = geo(cabinMesh);
  const nodes = [
    geometry.custom(bodySpec, { name: `${tag}body`, material: paint, castShadow: false }).position(0, sy * BODY_Y, 0),
    geometry.custom(cabinSpec, { name: `${tag}cabin`, material: glass, castShadow: false }).position(CABIN.x, sy * CABIN_Y, 0),
    geometry.custom(geo(ringMesh), { name: `${tag}cabin-trim`, material: chrome, castShadow: false }),
    geometry.custom(geo(stripMesh(1)), { name: `${tag}trim-l`, material: chrome, castShadow: false }),
    geometry.custom(geo(stripMesh(-1)), { name: `${tag}trim-r`, material: chrome, castShadow: false })
  ];
  if (!mirror) {
    nodes.push(
      geometry.custom(bodySpec, { name: "body-coat", material: paintCoat, castShadow: false }).position(0, BODY_Y, 0),
      geometry.custom(cabinSpec, { name: "cabin-coat", material: glassCoat, castShadow: false }).position(CABIN.x, CABIN_Y, 0)
    );
  }
  // The cabin ring and side strips carry absolute heights in their spine, so mirrored copies use y = -y in mesh data.
  WHEELS.forEach(([x, z], i) => {
    nodes.push(
      primitives
        .cylinder({ name: `${tag}tire-${i}`, size: [0.72, 0.26, 0.72], material: rubber, castShadow: false })
        .rotate(Math.PI / 2, 0, 0)
        .position(x, sy * 0.36, z)
    );
    nodes.push(
      primitives
        .cylinder({ name: `${tag}hub-${i}`, size: [0.34, 0.26, 0.34], material: chrome, castShadow: false })
        .rotate(Math.PI / 2, 0, 0)
        .position(x, sy * 0.36, z + Math.sign(z) * 0.02)
    );
  });
  return nodes;
}

// ---------------------------------------------------------------------------
// Turntable: transparent glossy deck over a mirrored copy of the car.
// ---------------------------------------------------------------------------
const deckMaterial = material.physical({
  name: "turntable glass deck",
  color: "#05060a",
  metallic: 0.5,
  roughness: 0.1,
  opacity: 0.8,
  clearcoat: 0.6,
  clearcoatRoughness: 0.05,
  envMapIntensity: 1.1
});

const ringLightMaterial = material.emissive({ color: "#bcd8ff", emissive: "#9cc4ff", emissiveIntensity: 2.2, roughness: 0.4 });
const innerRing = sweepTube((u) => [2.95 * Math.cos(u * Math.PI * 2), 0.006, 2.95 * Math.sin(u * Math.PI * 2)], 0.018, 128);

const turntable = group(
  "turntable",
  [
    ...carNodes(false),
    ...carNodes(true),
    primitives.cylinder({ name: "deck", size: [6.7, 0.12, 6.7], material: deckMaterial, castShadow: false }).position(0, -0.06, 0),
    primitives.cylinder({ name: "ring-light", size: [6.8, 0.05, 6.8], material: ringLightMaterial, castShadow: false }).position(0, -0.09, 0),
    geometry.custom(spec(innerRing), { name: "inner-ring", material: ringLightMaterial, castShadow: false })
  ],
  {}
).runtime({ id: "turntable", mutable: true });

// Fixtures that are visible in frame: two tall strip softboxes behind the car.
const fixtureMaterial = material.emissive({ color: "#dfe9ff", emissive: "#e6efff", emissiveIntensity: 3, roughness: 0.6 });

const app = createAuraApp("#app", {
  scene: scene({ background: "#030409" })
    .add(environments.neutral({ intensity: 0.5, background: false }))
    // long soft-box strips (area lights): overhead, left, right
    .add(lights.rect({ name: "strip-top", position: [0, 4.4, 0.8], target: [0, 0.5, 0], intensity: 4, width: 6.5, height: 0.5, color: "#ffffff" }))
    .add(lights.rect({ name: "strip-left", position: [-4.9, 2, -2.6], target: [0, 0.6, 0], intensity: 3.5, width: 0.5, height: 4.4, color: "#fff4e8" }))
    .add(lights.rect({ name: "strip-right", position: [4.9, 2, -3.2], target: [0, 0.6, 0], intensity: 3.5, width: 0.5, height: 4.4, color: "#f2f6ff" }))
    .add(lights.rect({ name: "strip-front-left", position: [-3.5, 2.2, 5], target: [0, 0.6, 0], intensity: 2.5, width: 0.9, height: 3, color: "#fff8f0" }))
    // faint cool rim
    .add(lights.directional({ name: "rim", position: [-2.5, 3, -6], target: [0, 0.6, 0], intensity: 0.9, color: "#7fa6ff" }))
    .add(primitives.box({ name: "fixture-left", size: [0.3, 4.4, 0.06], material: fixtureMaterial, castShadow: false }).position(-4.9, 2, -2.6))
    .add(primitives.box({ name: "fixture-right", size: [0.3, 4.4, 0.06], material: fixtureMaterial, castShadow: false }).position(4.9, 2, -3.2))
    .add(primitives.cylinder({ name: "showroom-floor", size: [40, 0.1, 40], material: material.pbr({ color: "#07080c", roughness: 0.6 }), castShadow: false }).position(0, -1.9, 0))
    .add(turntable)
    .add(effects.bloom({ intensity: 0.4, threshold: 0.85, radius: 0.5 }))
    .camera(camera.perspective({ position: [3.9, 1.5, 6.4], target: [0, 0.4, 0], fov: 34 }))
});

// ---------------------------------------------------------------------------
// Turntable animation (20 deg/s) and task state.
// ---------------------------------------------------------------------------
const DEG_PER_SECOND = 20;
const startMs = performance.now();
window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

app.onFrame(() => {
  const deg = ((performance.now() - startMs) / 1000) * DEG_PER_SECOND;
  app.nodes.require("turntable").setRotation(0, (deg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: deg, paintFinish: "clearcoat" };
});

void app.ready().then(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
