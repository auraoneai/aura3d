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
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Snowy mountain pass in a daytime blizzard. Everything is procedural: a heightfield valley with vertex colours,
// faceted instanced rocks, wooden poles, a log cabin from boxes, and a custom-shader snow field (streak quads).
// ---------------------------------------------------------------------------------------------------------------

const SKY = "#c4c9d1";

let seedState = 20261106;
const rand = (): number => ((seedState = (Math.imul(seedState, 1664525) + 1013904223) >>> 0) / 4294967296);
const between = (a: number, b: number): number => a + (b - a) * rand();
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smooth = (a: number, b: number, v: number): number => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: number, b: number, t: number): number => a + (b - a) * t;

// ----- terrain ---------------------------------------------------------------------------------------------------
// The valley runs along -z and climbs. The trail winds near the valley axis.
const trailX = (z: number): number => 5 * Math.sin(z * 0.06) + 1.8 * Math.sin(z * 0.17 + 1.3);
const axisX = (z: number): number => 0.35 * trailX(z);

const PEAKS = [
  { x: -70, z: -185, h: 55, r: 90 },
  { x: 50, z: -210, h: 70, r: 95 },
  { x: -5, z: -265, h: 60, r: 80 },
  { x: -115, z: -110, h: 40, r: 60 },
  { x: 105, z: -100, h: 45, r: 65 }
];

function baseHeight(x: number, z: number): number {
  const d = x - axisX(z);
  const ad = Math.abs(d);
  const rise = -0.17 * z + 0.0014 * Math.pow(Math.max(-z - 60, 0), 2);
  const v = 0.58 * Math.sqrt(d * d + 25) - 2.9 + 0.0035 * d * d;
  const big = 5 * Math.sin(x * 0.045 + 1) * Math.sin(z * 0.05 + 0.4) * smooth(15, 50, ad);
  const mid =
    (2.2 * Math.sin(x * 0.11 + z * 0.07) * Math.sin(z * 0.13 - x * 0.05) +
      1.1 * Math.sin(x * 0.31 + 1.7) * Math.sin(z * 0.27) +
      0.45 * Math.sin(x * 0.83 + z * 0.71)) *
    smooth(4, 20, ad);
  let peaks = 0;
  for (const p of PEAKS) {
    const r = Math.hypot(x - p.x, z - p.z) / p.r;
    if (r < 1) peaks += p.h * Math.pow(1 - r, 1.5) * (0.88 + 0.12 * Math.sin(x * 0.19 + z * 0.23));
  }
  return rise + v + big + mid + peaks;
}

const CABIN_Z = -55;
const CABIN = { x: trailX(CABIN_Z) + 8.5, z: CABIN_Z, h: 0 };
CABIN.h = baseHeight(CABIN.x, CABIN.z);

const trailMask = (x: number, z: number): number => 1 - smooth(0.9, 2.3, Math.abs(x - trailX(z)));

function height(x: number, z: number): number {
  const m = trailMask(x, z);
  let h = baseHeight(x, z);
  h += 0.06 * Math.sin(x * 1.9 + z * 0.7 + Math.sin(z * 0.4)) * Math.sin(z * 1.3 - x * 0.6) * (1 - m); // wind ripples
  h -= 0.14 * m; // trodden trail
  const r = Math.hypot((x - CABIN.x) * 0.9, (z - CABIN.z) * 0.8);
  const w = 1 - smooth(4.4, 7.0, r); // level pad under the cabin
  return h + (CABIN.h - h) * w;
}

const X_MAX = 110;
const NX = 160;
const Z_MAX = 40;
const Z_MIN = -300;
const DZ = 1.5;
const NZ = Math.round((Z_MAX - Z_MIN) / DZ);

const LIGHT_DIR: [number, number, number] = (() => {
  const v: [number, number, number] = [-0.4, 0.8, 0.45];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

function buildTerrain() {
  const count = (NX + 1) * (NZ + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices = new Uint32Array(NX * NZ * 6);
  const e = 0.35;
  let ii = 0;
  for (let j = 0; j <= NZ; j += 1) {
    const z = Z_MAX - j * DZ;
    for (let i = 0; i <= NX; i += 1) {
      const u = (i / NX) * 2 - 1;
      const x = X_MAX * (0.75 * u * Math.abs(u) + 0.25 * u);
      const v = j * (NX + 1) + i;
      const h = height(x, z);
      const gx = (height(x + e, z) - height(x - e, z)) / (2 * e);
      const gz = (height(x, z + e) - height(x, z - e)) / (2 * e);
      const nl = Math.hypot(gx, 1, gz);
      const nx = -gx / nl;
      const ny = 1 / nl;
      const nz = -gz / nl;
      positions.set([x, h, z], v * 3);
      normals.set([nx, ny, nz], v * 3);

      // colour: lit snow, blue-grey shaded snow, packed trail, dark rock on steep ground
      const ad = Math.abs(x - axisX(z));
      const slope = Math.hypot(gx, gz);
      const grain = 0.5 + 0.5 * Math.sin(x * 0.37 + z * 0.29) * Math.sin(z * 0.41 - x * 0.23);
      const fine = Math.sin(x * 2.3 + z * 1.7) * Math.sin(z * 2.9 - x * 1.1);
      const lit = clamp01(0.5 + 0.5 * (nx * LIGHT_DIR[0] + ny * LIGHT_DIR[1] + nz * LIGHT_DIR[2]));
      const t = Math.pow(lit, 0.8);
      let r = mix(0.58, 0.82, t);
      let g = mix(0.65, 0.86, t);
      let b = mix(0.77, 0.92, t);
      const blue = 0.35 * smooth(0.25, 0.9, slope) * (1 - t * 0.5) + 0.15 * grain;
      r -= blue * 0.12;
      g -= blue * 0.07;
      const rock = smooth(0.85, 1.3, slope + 0.28 * (grain - 0.5) + 0.12 * fine) * smooth(5, 10, ad);
      const rockShade = 0.17 + 0.07 * grain + 0.03 * fine;
      r = mix(r, rockShade, rock * 0.92);
      g = mix(g, rockShade + 0.01, rock * 0.92);
      b = mix(b, rockShade + 0.04, rock * 0.92);
      const tm = trailMask(x, z) * (1 - smooth(0.2, 0.6, rock));
      const tr = 0.6 + 0.05 * fine;
      r = mix(r, tr, tm * 0.75);
      g = mix(g, tr + 0.05, tm * 0.75);
      b = mix(b, tr + 0.14, tm * 0.75);
      colors.set([r, g, b, 1], v * 4);

      if (i < NX && j < NZ) {
        indices[ii++] = v;
        indices[ii++] = v + NX + 1;
        indices[ii++] = v + 1;
        indices[ii++] = v + 1;
        indices[ii++] = v + NX + 1;
        indices[ii++] = v + NX + 2;
      }
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices,
    bounds: { min: [-X_MAX - 5, -10, Z_MIN - 5], max: [X_MAX + 5, 220, Z_MAX + 5] }
  });
}

// ----- rocks: a faceted, displaced icosphere shared by every outcrop (unit diameter) ---------------------------------
type V3 = [number, number, number];
const norm3 = (v: V3): V3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};

function buildRock() {
  const t = (1 + Math.sqrt(5)) / 2;
  const raw: V3[] = [
    [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
    [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
    [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
  ];
  const base = raw.map(norm3);
  const faceIdx: Array<[number, number, number]> = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];
  let tris: Array<[V3, V3, V3]> = faceIdx.map(([a, b, c]) => [base[a], base[b], base[c]]);
  const midpoint = (a: V3, b: V3): V3 => norm3([a[0] + b[0], a[1] + b[1], a[2] + b[2]]);
  tris = tris.flatMap(([a, b, c]) => {
    const ab = midpoint(a, b);
    const bc = midpoint(b, c);
    const ca = midpoint(c, a);
    const out: Array<[V3, V3, V3]> = [[a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]];
    return out;
  });
  const displace = (v: V3): V3 => {
    const r =
      0.5 *
      (0.8 +
        0.16 * Math.sin(v[0] * 5.1 + 1.0) * Math.cos(v[1] * 4.3) +
        0.12 * Math.sin(v[2] * 7.7 + v[0] * 3) +
        0.08 * Math.sin(v[1] * 11 + v[2] * 5));
    return [v[0] * r, v[1] * r, v[2] * r];
  };
  const positions = new Float32Array(tris.length * 9);
  const normals = new Float32Array(tris.length * 9);
  const indices = new Uint32Array(tris.length * 3);
  tris.forEach(([a, b, c], k) => {
    const p0 = displace(a);
    const p1 = displace(b);
    const p2 = displace(c);
    const ux = p1[0] - p0[0], uy = p1[1] - p0[1], uz = p1[2] - p0[2];
    const wx = p2[0] - p0[0], wy = p2[1] - p0[1], wz = p2[2] - p0[2];
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    const cx = p0[0] + p1[0] + p2[0], cy = p0[1] + p1[1] + p2[1], cz = p0[2] + p1[2] + p2[2];
    const flip = nx * cx + ny * cy + nz * cz < 0;
    const order = flip ? [p0, p2, p1] : [p0, p1, p2];
    if (flip) { nx = -nx; ny = -ny; nz = -nz; }
    order.forEach((p, m) => {
      positions.set(p, k * 9 + m * 3);
      normals.set([nx, ny, nz], k * 9 + m * 3);
      indices[k * 3 + m] = k * 3 + m;
    });
  });
  return geometry.define({ positions, normals, indices, bounds: { min: [-0.6, -0.6, -0.6], max: [0.6, 0.6, 0.6] } });
}

const rockTransforms: AuraTransformSpec[] = [];
const rockColors: string[] = [];
const capTransforms: AuraTransformSpec[] = [];

function addRock(x: number, z: number, size: number): void {
  const sx = size * between(0.9, 1.4);
  const sy = size * between(0.6, 1.0);
  const sz = size * between(0.9, 1.4);
  const yaw = rand() * Math.PI * 2;
  const gy = height(x, z) - sy * 0.2;
  rockTransforms.push({ position: [x, gy + sy * 0.4, z], rotation: [0, yaw, 0], scale: [sx, sy, sz] });
  rockColors.push(`hsl(${Math.floor(between(205, 235))}, ${Math.floor(between(5, 11))}%, ${Math.floor(between(16, 30))}%)`);
  capTransforms.push({
    position: [x, gy + sy * 0.4 + sy * 0.33, z],
    rotation: [0, yaw, 0],
    scale: [sx * 0.78, sy * 0.42, sz * 0.78]
  });
}

function placeRocks(): void {
  const farFromCabin = (x: number, z: number): boolean => Math.hypot(x - CABIN.x, z - CABIN.z) > 10;
  let placed = 0;
  let guard = 0;
  while (placed < 150 && guard < 4000) {
    guard += 1;
    const z = between(30, -190);
    const x = between(-75, 75);
    const ad = Math.abs(x - axisX(z));
    if (ad < 8 || !farFromCabin(x, z)) continue;
    const slope = Math.hypot(height(x + 0.5, z) - height(x - 0.5, z), height(x, z + 0.5) - height(x, z - 0.5));
    if (slope < 0.5 && rand() < 0.75) continue;
    addRock(x, z, between(0.9, 2.6) * (1 + ad / 60));
    placed += 1;
  }
  for (let c = 0; c < 12; c += 1) {
    const z = between(15, -150);
    const side = rand() < 0.5 ? -1 : 1;
    const x = axisX(z) + side * between(11, 34);
    if (!farFromCabin(x, z)) continue;
    const n = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < n; k += 1) {
      addRock(x + between(-3, 3), z + between(-3, 3), between(2.2, 5.5));
    }
  }
  // a few outcrops close to the trail so they read from the walking camera
  for (const zz of [-18, -38, -78, -96]) {
    const side = zz % 2 === 0 ? 1 : -1;
    addRock(trailX(zz) + side * between(7, 9), zz + between(-2, 2), between(1.8, 2.8));
  }
}
placeRocks();

// ----- poles along the trail ---------------------------------------------------------------------------------------
const poleBodies: AuraTransformSpec[] = [];
const poleBars: AuraTransformSpec[] = [];
const poleCaps: AuraTransformSpec[] = [];
for (let k = 0, z = 4; z > -114; k += 1, z -= 6.5) {
  const x = trailX(z) + (k % 2 === 0 ? 1.7 : -1.7);
  const gy = height(x, z);
  poleBodies.push({ position: [x, gy + 1.3, z], scale: [0.15, 2.8, 0.15] });
  poleBars.push({ position: [x, gy + 2.15, z], scale: [0.8, 0.07, 0.07] });
  poleCaps.push({ position: [x, gy + 2.74, z], scale: [0.3, 0.14, 0.3] });
}

// ----- snow field: streak quads positioned in the vertex shader -------------------------------------------------------
const GUST = (t: number): number => {
  const w = 0.5 + 0.5 * Math.sin(t * 0.5 + 1.2 * Math.sin(t * 0.13));
  return w * w * w;
};

function buildFlakes(count: number, seed: number) {
  let s = seed;
  const r = (): number => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
  const positions = new Float32Array(count * 12);
  const normals = new Float32Array(count * 12);
  const uvs = new Float32Array(count * 8);
  const indices = new Uint32Array(count * 6);
  const corners = [0, -1, 1, -1, 1, 1, 0, 1];
  for (let i = 0; i < count; i += 1) {
    const sx = r();
    const sy = r();
    const sz = r();
    for (let k = 0; k < 4; k += 1) {
      const v = i * 4 + k;
      positions.set([sx, sy, sz], v * 3);
      normals.set([0, 0, 1], v * 3);
      uvs.set([corners[k * 2], corners[k * 2 + 1]], v * 2);
    }
    const b = i * 4;
    indices.set([b, b + 1, b + 2, b, b + 2, b + 3], i * 6);
  }
  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: { min: [-1000, -1000, -1000], max: [1000, 1000, 1000] }
  });
}

const FLAKE_VERTEX = /* glsl */ `
out vec2 vUv;
out float vAlpha;
float h1(float n) { return fract(sin(n) * 43758.5453123); }
void main() {
  vec3 seed = position;
  float id = seed.x * 157.31 + seed.y * 311.7 + seed.z * 74.7;
  float rA = h1(id + 1.7);
  float rB = h1(id + 9.3);
  vec3 box = vec3(40.0, 22.0, 52.0);
  vec3 baseVel = vec3(-8.5, -3.6, 2.2) * (0.75 + 0.5 * rA);
  vec3 center = cameraPosition + vec3(0.0, 1.0, -17.0);
  vec3 p = seed * box + baseVel * windPhase;
  p.x += sin(windPhase * 1.7 + id) * 0.5;
  p.y += sin(windPhase * 2.3 + id * 1.3) * 0.25;
  vec3 local = mod(p - center + 0.5 * box, box) - 0.5 * box;
  vec3 world = center + local;

  float density = 0.6 + 0.4 * gust;
  float vis = 1.0 - smoothstep(density - 0.05, density, rB);
  vec3 e = abs(local) / (0.5 * box);
  float edge = 1.0 - smoothstep(0.75, 1.0, max(e.x, max(e.y, e.z)));
  float dist = length(world - cameraPosition);
  float distFade = smoothstep(0.8, 2.5, dist) * (1.0 - smoothstep(30.0, 48.0, dist));
  vAlpha = vis * edge * distFade * (0.6 + 0.4 * rA);

  float streakTime = 0.05 + 0.035 * gust;
  vec3 vel = baseVel * (1.0 + 0.9 * gust);
  vec4 pH = modelViewProjectionMatrix * vec4(world, 1.0);
  vec4 pT = modelViewProjectionMatrix * vec4(world - vel * streakTime, 1.0);
  float aspect = projectionMatrix[1][1] / projectionMatrix[0][0];
  vec2 nH = pH.xy / max(pH.w, 0.1);
  vec2 nT = pT.xy / max(pT.w, 0.1);
  vec2 aH = vec2(nH.x * aspect, nH.y);
  vec2 aT = vec2(nT.x * aspect, nT.y);
  vec2 d = aH - aT;
  float dl = length(d);
  vec2 dir = dl > 0.00001 ? d / dl : vec2(1.0, 0.0);
  vec2 perp = vec2(-dir.y, dir.x);
  float wid = max(flakeSize * projectionMatrix[1][1] / max(pH.w, 0.1), 0.0035);
  vec2 a = mix(aT, aH, uv.x) + perp * uv.y * wid;
  vec2 ndc = vec2(a.x / aspect, a.y);
  vUv = uv;
  if (pH.w < 0.2 || pT.w < 0.2) {
    gl_Position = vec4(2.0, 2.0, 2.0, 1.0);
  } else {
    gl_Position = vec4(ndc * pH.w, pH.z, pH.w);
  }
}`;

const FLAKE_FRAGMENT = /* glsl */ `
in vec2 vUv;
in float vAlpha;
out vec4 outColor;
void main() {
  float across = 1.0 - abs(vUv.y);
  float a = smoothstep(0.0, 0.6, across) * mix(0.15, 1.0, vUv.x) * vAlpha;
  outColor = vec4(0.97, 0.985, 1.0, a);
}`;

const flakeMaterial = (size: number) =>
  material.custom({
    glsl: { vertex: FLAKE_VERTEX, fragment: FLAKE_FRAGMENT },
    uniforms: {
      flakeSize: { type: "f32", value: size },
      windPhase: { type: "f32", value: 0 },
      gust: { type: "f32", value: 0 }
    },
    transparent: true,
    depthWrite: false,
    side: "double",
    blending: "normal",
    fog: false
  });

// ----- scene ---------------------------------------------------------------------------------------------------------
const START_Z = 6;
const END_Z = -112;
const LOOP_SECONDS = 86;
const EYE = 1.7;

const eyeAt = (z: number): [number, number, number] => {
  const x = trailX(z);
  return [x, height(x, z) + EYE, z];
};

const startEye = eyeAt(START_Z);
const startLook = eyeAt(START_Z - 14);

const stage = scene({ background: SKY })
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#dfe6f2", groundColor: "#8593a8", intensity: 0.6 }))
  .add(lights.directional({ name: "overcast-key", position: [-30, 45, 35], target: [0, 0, 0], intensity: 1.5, color: "#f4f7ff" }))
  .add(
    geometry.custom(buildTerrain(), {
      name: "terrain",
      material: material.pbr({ color: "#ffffff", roughness: 1 }),
      castShadow: false,
      receiveShadow: false
    })
  )
  .add(
    instances.custom(buildRock(), {
      name: "rocks",
      transforms: rockTransforms,
      colors: rockColors,
      material: material.pbr({ color: "#ffffff", roughness: 0.95 }),
      castShadow: false
    })
  )
  .add(
    instances.custom(buildRock(), {
      name: "rock-snow",
      transforms: capTransforms,
      material: material.pbr({ color: "#e4ebf5", roughness: 1 }),
      castShadow: false
    })
  )
  .add(
    instances.cylinder({
      name: "poles",
      transforms: poleBodies,
      material: material.pbr({ color: "#5d3f27", roughness: 0.95 }),
      params: { radialSegments: 8 },
      castShadow: false
    })
  )
  .add(instances.box({ name: "pole-bars", transforms: poleBars, material: material.pbr({ color: "#6a4a2f", roughness: 0.95 }), castShadow: false }))
  .add(instances.sphere({ name: "pole-snow", transforms: poleCaps, material: material.pbr({ color: "#eef3fa", roughness: 1 }), castShadow: false }));

// cabin, halfway up the trail
{
  const wood = material.pbr({ color: "#6b4a2e", roughness: 0.95 });
  const logs = material.pbr({ color: "#553822", roughness: 0.95 });
  const roofWood = material.pbr({ color: "#47321f", roughness: 0.95 });
  const snow = material.pbr({ color: "#edf2f9", roughness: 1 });
  const stone = material.pbr({ color: "#585a60", roughness: 1 });
  const glass = material.emissive({ color: "#ffc070", emissive: "#ffa640", emissiveIntensity: 2.4 });
  const frame = material.pbr({ color: "#2e1e12", roughness: 0.9 });
  const { x: cx, z: cz, h: gy } = CABIN;

  const part = (
    name: string,
    size: [number, number, number],
    d: [number, number, number],
    mat: ReturnType<typeof material.pbr>,
    rotZ = 0
  ): void => {
    const b = primitives.box({ name, size, material: mat, castShadow: false }).position(cx + d[0], gy + d[1], cz + d[2]);
    stage.add(rotZ === 0 ? b : b.rotate(0, 0, rotZ));
  };

  part("cabin-walls", [3.6, 2.2, 4.4], [0, 1.0, 0], wood);
  for (let i = 0; i < 5; i += 1) {
    const y = 0.3 + 0.45 * i;
    part(`log-e-${i}`, [0.07, 0.14, 4.5], [1.8, y, 0], logs);
    part(`log-w-${i}`, [0.07, 0.14, 4.5], [-1.8, y, 0], logs);
    part(`log-n-${i}`, [3.7, 0.14, 0.07], [0, y, -2.2], logs);
    part(`log-s-${i}`, [3.7, 0.14, 0.07], [0, y, 2.2], logs);
  }
  // stepped gables under the roof, front and back
  const steps: Array<[number, number, number]> = [[3.3, 0.4, 2.4], [2.3, 0.4, 2.8], [1.3, 0.4, 3.2], [0.4, 0.3, 3.5]];
  for (const [w, h, y] of steps) {
    part(`gable-s-${y}`, [w, h, 0.2], [0, y - 0.1, 2.1], wood);
    part(`gable-n-${y}`, [w, h, 0.2], [0, y - 0.1, -2.1], wood);
  }
  // roof: two sloped slabs, snow on top
  const pitch = 0.52;
  part("roof-r", [2.48, 0.16, 4.9], [1.075, 2.72, 0], roofWood, -pitch);
  part("roof-l", [2.48, 0.16, 4.9], [-1.075, 2.72, 0], roofWood, pitch);
  part("roof-snow-r", [2.2, 0.28, 4.7], [1.055, 2.985, 0], snow, -pitch);
  part("roof-snow-l", [2.2, 0.28, 4.7], [-1.055, 2.985, 0], snow, pitch);
  part("ridge-snow", [0.7, 0.26, 4.8], [0, 3.42, 0], snow);
  // chimney
  part("chimney", [0.5, 1.4, 0.5], [1.0, 3.2, -1.2], stone);
  part("chimney-snow", [0.64, 0.14, 0.64], [1.0, 3.95, -1.2], snow);
  // door and lit windows
  part("door", [0.9, 1.7, 0.1], [0.9, 0.85, 2.22], frame);
  part("window-front-frame", [1.25, 0.95, 0.06], [-0.8, 1.35, 2.2], frame);
  part("window-front", [1.1, 0.8, 0.08], [-0.8, 1.35, 2.24], glass);
  part("window-front-v", [0.06, 0.8, 0.1], [-0.8, 1.35, 2.26], frame);
  part("window-front-h", [1.1, 0.06, 0.1], [-0.8, 1.35, 2.26], frame);
  part("window-side-frame", [0.06, 0.95, 1.25], [-1.8, 1.35, 0.2], frame);
  part("window-side", [0.08, 0.8, 1.1], [-1.84, 1.35, 0.2], glass);
  part("window-side-v", [0.1, 0.8, 0.06], [-1.86, 1.35, 0.2], frame);
  part("window-side-h", [0.1, 0.06, 1.1], [-1.86, 1.35, 0.2], frame);
  // step and drift at the door
  part("doorstep", [1.3, 0.2, 0.6], [0.9, 0.1, 2.6], snow);

  stage.add(lights.point({ name: "window-glow-front", position: [cx - 0.8, gy + 1.4, cz + 3.4], intensity: 14, color: "#ff9a40", distance: 10, decay: 2 }));
  stage.add(lights.point({ name: "window-glow-side", position: [cx - 3.0, gy + 1.4, cz + 0.2], intensity: 14, color: "#ff9a40", distance: 10, decay: 2 }));
}

stage
  .add(
    geometry
      .custom(buildFlakes(3000, 77), { name: "snow-small", material: flakeMaterial(0.016), castShadow: false, receiveShadow: false })
      .runtime({ id: "snow-small", mutable: true })
  )
  .add(
    geometry
      .custom(buildFlakes(1200, 4242), { name: "snow-large", material: flakeMaterial(0.045), castShadow: false, receiveShadow: false })
      .runtime({ id: "snow-large", mutable: true })
  )
  .add(effects.fog({ color: SKY, density: 0.0075 }))
  .camera(camera.perspective({ position: startEye, target: [startLook[0], startLook[1] - 0.15, startLook[2]], fov: 60, near: 0.1, far: 500 }));

const app = createAuraApp("#app", { scene: stage, resize: false });

let clock = 0;
let windPhase = 0;
app.onFrame((frame) => {
  const dt = Math.min(Math.max(frame.dt, 0), 0.1);
  clock += dt;

  // snow: wind phase advances faster during gusts
  const g = GUST(clock);
  windPhase += dt * (1 + 0.9 * g);
  for (const id of ["snow-small", "snow-large"]) {
    const node = app.nodes.require(id);
    node.setUniform?.("windPhase", windPhase);
    node.setUniform?.("gust", g);
  }

  // camera: walk up the trail, then start again from the bottom
  const u = (clock % LOOP_SECONDS) / LOOP_SECONDS;
  const z = START_Z + (END_Z - START_Z) * u;
  const eye = eyeAt(z);
  const ahead = eyeAt(z - 14);
  const sideX = Math.sin(clock * 5.65) * 0.03 + Math.sin(clock * 1.1) * 0.04;
  const bob = Math.sin(clock * 11.3) * 0.022;
  app.camera?.setPose({
    position: [eye[0] + sideX, eye[1] + bob, eye[2]],
    target: [mix(ahead[0], eye[0], 0.1) + Math.sin(clock * 0.45) * 0.9, ahead[1] - 0.1 + Math.sin(clock * 5.65) * 0.03, ahead[2]],
    fov: 60
  });
});

app.ready().then(() => {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  });
});
