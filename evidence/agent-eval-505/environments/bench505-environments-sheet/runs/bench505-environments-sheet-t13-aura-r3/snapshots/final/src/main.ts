import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  group,
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

type V3 = [number, number, number];
type Kid = NonNullable<Parameters<typeof group>[1]>[number];

// ---------------------------------------------------------------- helpers
let seed = 20240607;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();

const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};
const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];

/** Write one column-major T*R*S matrix from pre-scaled basis vectors. */
const putMatrix = (m: Float32Array, i: number, ax: V3, ay: V3, az: V3, p: V3): void => {
  const o = i * 16;
  m[o] = ax[0]; m[o + 1] = ax[1]; m[o + 2] = ax[2]; m[o + 3] = 0;
  m[o + 4] = ay[0]; m[o + 5] = ay[1]; m[o + 6] = ay[2]; m[o + 7] = 0;
  m[o + 8] = az[0]; m[o + 9] = az[1]; m[o + 10] = az[2]; m[o + 11] = 0;
  m[o + 12] = p[0]; m[o + 13] = p[1]; m[o + 14] = p[2]; m[o + 15] = 1;
};

/** Right-handed (x, d, z) frame for a unit direction d. */
const basisFromY = (d: V3): [V3, V3] => {
  const h: V3 = Math.abs(d[0]) < 0.9 ? [1, 0, 0] : [0, 0, 1];
  const x = norm(cross(d, h));
  const z = cross(x, d);
  return [x, z];
};

// ---------------------------------------------------------------- seabed
const WATER_FOG = "#0c6275";
const sandHeight = (x: number, z: number): number => {
  const warp = Math.sin(x * 0.13 + z * 0.09) * 1.2 + Math.sin(x * 0.05 - z * 0.11) * 0.8;
  return (
    0.07 * Math.sin((x * 0.8 + z * 0.6) * 3.6 + warp) +
    0.035 * Math.sin((-x * 0.5 + z * 0.85) * 6.3 + warp * 1.7) +
    0.16 * Math.sin(x * 0.09) * Math.cos(z * 0.08)
  );
};

const SAND_N = 250;
const SAND_SIZE = 80;
const sandPositions = new Float32Array((SAND_N + 1) ** 2 * 3);
const sandNormals = new Float32Array(sandPositions.length);
const sandIndices: number[] = [];
for (let j = 0; j <= SAND_N; j += 1) {
  for (let i = 0; i <= SAND_N; i += 1) {
    const v = j * (SAND_N + 1) + i;
    const x = (i / SAND_N - 0.5) * SAND_SIZE;
    const z = (j / SAND_N - 0.5) * SAND_SIZE;
    sandPositions.set([x, sandHeight(x, z), z], v * 3);
    const e = 0.05;
    const dx = (sandHeight(x + e, z) - sandHeight(x - e, z)) / (2 * e);
    const dz = (sandHeight(x, z + e) - sandHeight(x, z - e)) / (2 * e);
    const n = norm([-dx, 1, -dz]);
    sandNormals.set(n, v * 3);
    if (i < SAND_N && j < SAND_N) sandIndices.push(v, v + SAND_N + 1, v + 1, v + 1, v + SAND_N + 1, v + SAND_N + 2);
  }
}

const sandMaterial = material.custom({
  glsl: {
    vertex: `out vec3 vPos; out vec3 vN;
void main() {
  vPos = position;
  vN = normal;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vPos; in vec3 vN; out vec4 outColor;
float caustic(vec2 uv, float t) {
  vec2 p = uv * 6.28318530718 - 250.0;
  vec2 i = p;
  float c = 1.0;
  float inten = 0.005;
  for (int n = 0; n < 5; n++) {
    float tt = t * (1.0 - (3.5 / float(n + 1)));
    i = p + vec2(cos(tt - i.x) + sin(tt + i.y), sin(tt - i.y) + cos(tt + i.x));
    c += 1.0 / length(vec2(p.x / (sin(i.x + tt) / inten), p.y / (cos(i.y + tt) / inten)));
  }
  c /= 5.0;
  c = 1.17 - pow(c, 1.4);
  return clamp(pow(abs(c), 8.0), 0.0, 1.5);
}
void main() {
  vec3 n = normalize(vN);
  vec3 L = normalize(vec3(0.25, 1.0, 0.15));
  float diff = max(dot(n, L), 0.0);
  float cs = caustic(vPos.xz * 0.075 + vec2(clk * 0.012, clk * 0.006), clk * 0.55) * 0.75
           + caustic(vPos.xz * 0.12 + vec2(7.3, 2.1), clk * 0.8 + 3.0) * 0.45;
  vec3 sand = vec3(0.62, 0.52, 0.32);
  vec3 ambient = vec3(0.10, 0.20, 0.22);
  vec3 sun = vec3(0.80, 1.0, 0.92) * diff * (0.45 + 1.3 * cs);
  vec3 lit = sand * (ambient + sun);
  float d = length(cameraPosition - vPos);
  lit *= exp(-d * vec3(0.055, 0.014, 0.010));
  float f = 1.0 - exp(-pow(d * 0.03, 2.0));
  vec3 fogC = vec3(0.004, 0.12, 0.18);
  outColor = vec4(mix(lit, fogC, f), 1.0);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 } }
});

// ---------------------------------------------------------------- scene base
let sc = scene({ background: WATER_FOG })
  .camera(camera.orbit({ position: [20, 5.5, 0], target: [0, 2, 0], fov: 52, near: 0.3, far: 160, autoRotate: 0.14 }))
  .add(environments.neutral({ intensity: 0.35, background: false }))
  .add(lights.hemisphere({ skyColor: "#6fe0e0", groundColor: "#1d6a70", intensity: 1.1 }))
  .add(
    lights
      .directional({ name: "sun", position: [10, 40, 6], target: [0, 0, 0], intensity: 3.2, color: "#d8fff0", shadow: true })
      .runtime({ id: "sun", mutable: true })
  )
  .add(effects.fog({ color: WATER_FOG, density: 0.03 }))
  .add(
    geometry
      .custom(
        geometry.define({
          positions: sandPositions,
          normals: sandNormals,
          indices: sandIndices,
          bounds: { min: [-SAND_SIZE / 2, -1, -SAND_SIZE / 2], max: [SAND_SIZE / 2, 1, SAND_SIZE / 2] }
        }),
        { name: "sand", material: sandMaterial, castShadow: false }
      )
      .runtime({ id: "sand", mutable: true })
  );

const world: Kid[] = [];

// ---------------------------------------------------------------- sun shafts
const shaftMat = material.pbr({ color: "#bff7e6", emissive: "#bff7e6", emissiveIntensity: 0.8, opacity: 0.05, roughness: 1 });
for (let i = 0; i < 6; i += 1) {
  const a = (i / 6) * Math.PI * 2 + 0.4;
  const r = 6 + (i % 3) * 5;
  world.push(
    primitives
      .cylinder({ name: `shaft${i}`, size: [range(2, 3.6), 36, range(2, 3.6)], material: shaftMat, castShadow: false })
      .position(Math.cos(a) * r, 16, Math.sin(a) * r)
      .rotate(0.15, 0, -0.24)
  );
}

// ---------------------------------------------------------------- corals
let uid = 0;
const branchNode = (len: number, r: number, depth: number, mat: ReturnType<typeof material.pbr>, tip: ReturnType<typeof material.pbr>): Kid => {
  const kids: Kid[] = [primitives.cylinder({ name: `bc${uid++}`, size: [r * 2, len, r * 2], material: mat }).position(0, len / 2, 0)];
  if (depth > 0) {
    const n = 2 + (rand() < 0.5 ? 1 : 0);
    for (let k = 0; k < n; k += 1) {
      const yaw = (k / n) * Math.PI * 2 + rand() * 0.8;
      const tilt = 0.45 + rand() * 0.4;
      kids.push(
        group(`bg${uid++}`, [branchNode(len * 0.74, r * 0.72, depth - 1, mat, tip)], {
          position: [0, len * 0.85, 0],
          rotation: [Math.sin(yaw) * tilt, 0, Math.cos(yaw) * tilt]
        })
      );
    }
  } else {
    kids.push(primitives.sphere({ name: `bt${uid++}`, size: r * 2.8, material: tip }).position(0, len, 0));
  }
  return group(`bn${uid++}`, kids);
};

const branching: Array<[number, number, string, string, number]> = [
  [-4, 2, "#ff7a45", "#ffc08a", 1.5],
  [5, -3, "#ff5fa2", "#ffd0e4", 1.4],
  [1, 6, "#9b5de5", "#d9b8ff", 1.3],
  [-7, -5, "#b6c93a", "#eef59a", 1.5],
  [8, 5, "#e63946", "#ff9aa2", 1.3]
];
for (const [x, z, c, tipC, len] of branching) {
  const mat = material.pbr({ color: c, roughness: 0.7 });
  const tip = material.pbr({ color: tipC, roughness: 0.5, emissive: tipC, emissiveIntensity: 0.15 });
  world.push(group(`branching${uid++}`, [branchNode(len, 0.2, 3, mat, tip)], { position: [x, sandHeight(x, z) - 0.05, z] }));
}

const brains: Array<[number, number, number, string, number]> = [
  [-1, -3, 1.6, "#8fb36b", 100],
  [3, 2, 1.15, "#c9a14a", 40],
  [-8, 3, 1.9, "#5f9fc0", 190]
];
for (const [cx, cz, R, c, hue] of brains) {
  const by = sandHeight(cx, cz);
  world.push(primitives.sphere({ name: `brain${uid++}`, size: [R * 2, R * 1.4, R * 2], material: material.pbr({ color: c, roughness: 0.85 }) }).position(cx, by + R * 0.15, cz));
  const ridges: AuraTransformSpec[] = [];
  const ridgeColors: string[] = [];
  for (let ring = 0; ring < 7; ring += 1) {
    const th = 0.12 + ring * 0.19;
    const count = Math.max(5, Math.round(30 * Math.sin(th)));
    for (let k = 0; k < count; k += 1) {
      const u = (k / count) * Math.PI * 2;
      const t2 = th + 0.07 * Math.sin(u * 5 + ring * 2);
      ridges.push({
        position: [cx + R * 1.0 * Math.sin(t2) * Math.cos(u), by + R * 0.15 + R * 0.7 * Math.cos(t2), cz + R * 1.0 * Math.sin(t2) * Math.sin(u)],
        scale: [R * 0.24, R * 0.2, R * 0.24]
      });
      ridgeColors.push(`hsl(${hue + Math.floor(rand() * 25)}, 45%, ${48 + Math.floor(rand() * 14)}%)`);
    }
  }
  world.push(instances.sphere({ name: `ridges${uid++}`, transforms: ridges, colors: ridgeColors, material: material.pbr({ color: "#ffffff", roughness: 0.8 }) }));
}

const tubeClusters: Array<[number, number, number]> = [
  [-3, -8, 45],
  [2, -1, 285],
  [9, -6, 20]
];
for (const [cx, cz, hue] of tubeClusters) {
  const tubes: AuraTransformSpec[] = [];
  const holes: AuraTransformSpec[] = [];
  const colors: string[] = [];
  for (let k = 0; k < 10; k += 1) {
    const a = rand() * Math.PI * 2;
    const rr = 0.9 * Math.sqrt(rand());
    const x = cx + Math.cos(a) * rr;
    const z = cz + Math.sin(a) * rr;
    const h = range(0.8, 2.3);
    const d = range(0.28, 0.46);
    const y0 = sandHeight(x, z) - 0.05;
    tubes.push({ position: [x, y0 + h / 2, z], scale: [d, h, d] });
    holes.push({ position: [x, y0 + h + 0.01, z], scale: [d * 0.72, 0.04, d * 0.72] });
    colors.push(`hsl(${hue + Math.floor(rand() * 16)}, 80%, ${52 + Math.floor(rand() * 10)}%)`);
  }
  world.push(instances.cylinder({ name: `tubes${uid++}`, transforms: tubes, colors, material: material.pbr({ color: "#ffffff", roughness: 0.6 }), params: { radialSegments: 12 } }));
  world.push(instances.cylinder({ name: `tubeholes${uid++}`, transforms: holes, material: material.pbr({ color: "#2b1208", roughness: 1 }), params: { radialSegments: 12 } }));
}

const fans: Array<[number, number, number, string]> = [
  [0, 1.5, 0.4, "#c04bd1"],
  [-5, 7, -0.6, "#e8505b"],
  [9, -1, 1.2, "#f0a030"]
];
for (const [x, z, rotY, c] of fans) {
  const rib = material.pbr({ color: c, roughness: 0.6, emissive: c, emissiveIntensity: 0.12 });
  const ribs: Kid[] = [];
  for (let k = 0; k < 11; k += 1) {
    const ang = -1.0 + (k / 10) * 2.0;
    ribs.push(group(`rib${uid++}`, [primitives.box({ name: `ribbox${uid++}`, size: [0.07, 2.3, 0.06], material: rib }).position(0, 1.15, 0)], { rotation: [0, 0, ang] }));
  }
  ribs.push(
    primitives
      .cylinder({ name: `membrane${uid++}`, size: [3.2, 0.03, 3.2], material: material.pbr({ color: c, roughness: 0.8, opacity: 0.45 }), castShadow: false })
      .position(0, 1.5, 0)
      .rotate(Math.PI / 2, 0, 0)
  );
  world.push(
    group(
      `fan${uid++}`,
      [primitives.cylinder({ name: `fanstem${uid++}`, size: [0.14, 0.9, 0.14], material: rib }).position(0, 0.45, 0), group(`fantop${uid++}`, ribs, { position: [0, 0.8, 0] })],
      { position: [x, sandHeight(x, z) - 0.05, z], rotation: [0, rotY, 0] }
    )
  );
}

// rocks
{
  const rocks: AuraTransformSpec[] = [];
  const colors: string[] = [];
  for (let i = 0; i < 40; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = range(3, 30);
    const x = Math.cos(a) * r;
    const z = Math.sin(a) * r;
    const s = range(0.5, 1.8) * (r > 15 ? 1.6 : 1);
    rocks.push({ position: [x, sandHeight(x, z) + s * 0.1, z], rotation: [0, rand() * 6, 0], scale: [s, s * 0.6, s * 0.85] });
    colors.push(`hsl(${180 + Math.floor(rand() * 30)}, 12%, ${28 + Math.floor(rand() * 18)}%)`);
  }
  world.push(instances.sphere({ name: "rocks", transforms: rocks, colors, material: material.pbr({ color: "#ffffff", roughness: 0.95 }) }));
}

for (const n of world) sc = sc.add(n);

// ---------------------------------------------------------------- swaying strands (seaweed + anemone tentacles)
interface Strand {
  x: number; y: number; z: number;
  h: number; r: number;
  dir: number; lean: number;
  amp: number; speed: number; ph: number;
}
interface StrandSystem {
  id: string;
  strands: Strand[];
  segs: number;
  matrices: Float32Array;
}

const makeSeedTransforms = (count: number, spread: number, size: number): AuraTransformSpec[] =>
  Array.from({ length: count }, () => ({ position: [range(-spread, spread), range(0.5, 4), range(-spread, spread)] as V3, scale: size }));

const strandSystems: StrandSystem[] = [];
const addStrandSystem = (id: string, strands: Strand[], segs: number, colors: (i: number) => string, mat: ReturnType<typeof material.pbr>): void => {
  const count = strands.length * segs;
  const cols: string[] = [];
  for (let i = 0; i < strands.length; i += 1) for (let j = 0; j < segs; j += 1) cols.push(colors(i));
  sc = sc.add(
    instances
      .cylinder({ name: id, transforms: makeSeedTransforms(count, 14, 0.4), colors: cols, material: mat, params: { radialSegments: 6 }, castShadow: false })
      .runtime({ id, mutable: true })
  );
  strandSystems.push({ id, strands, segs, matrices: new Float32Array(count * 16) });
};

const updateStrands = (sys: StrandSystem, t: number, app: { nodes: { require(id: string): { setInstanceMatrices(m: Float32Array, c: number): unknown } } }): void => {
  const { strands, segs, matrices } = sys;
  let k = 0;
  for (const s of strands) {
    const segLen = s.h / segs;
    let px = s.x, py = s.y, pz = s.z;
    for (let j = 0; j < segs; j += 1) {
      const f = (j + 1) / segs;
      const theta = s.lean * f + s.amp * Math.sin(t * s.speed + s.ph - j * 0.7) * f;
      const phi = s.dir + 0.5 * Math.sin(t * 0.3 + s.ph);
      const d: V3 = [Math.sin(theta) * Math.cos(phi), Math.cos(theta), Math.sin(theta) * Math.sin(phi)];
      const w = s.r * 2 * (1 - 0.55 * (j / segs));
      const [bx, bz] = basisFromY(d);
      const c: V3 = [px + d[0] * segLen * 0.5, py + d[1] * segLen * 0.5, pz + d[2] * segLen * 0.5];
      putMatrix(matrices, k, mul(bx, w), mul(d, segLen * 1.15), mul(bz, w), c);
      k += 1;
      px += d[0] * segLen; py += d[1] * segLen; pz += d[2] * segLen;
    }
  }
  app.nodes.require(sys.id).setInstanceMatrices(matrices, k);
};

{
  const weeds: Strand[] = [];
  for (let i = 0; i < 80; i += 1) {
    // clumps around the reef edge
    const a = rand() * Math.PI * 2;
    const r = range(7, 22);
    const x = Math.cos(a) * r + range(-0.6, 0.6);
    const z = Math.sin(a) * r + range(-0.6, 0.6);
    weeds.push({ x, y: sandHeight(x, z) - 0.05, z, h: range(2, 4.5), r: range(0.07, 0.12), dir: rand() * 6.28, lean: range(0.05, 0.2), amp: range(0.3, 0.55), speed: range(0.8, 1.4), ph: rand() * 6.28 });
  }
  addStrandSystem("seaweed", weeds, 5, (i) => `hsl(${85 + ((i * 7) % 50)}, 55%, ${28 + ((i * 5) % 14)}%)`, material.pbr({ color: "#ffffff", roughness: 0.7 }));

  const tentacles: Strand[] = [];
  const baseDisks: AuraTransformSpec[] = [];
  const baseColors: string[] = [];
  const anemones: Array<[number, number, number]> = [
    [-2.5, 4, 320], [3.5, -5, 20], [6, 1.5, 300], [-6, -1.5, 30], [0.5, -6, 340], [-10, 6, 15], [11, -3, 310]
  ];
  for (const [ax, az, hue] of anemones) {
    const ay = sandHeight(ax, az);
    baseDisks.push({ position: [ax, ay + 0.15, az], scale: [0.9, 0.3, 0.9] });
    baseColors.push(`hsl(${hue}, 40%, 30%)`);
    for (let k = 0; k < 18; k += 1) {
      const a = (k / 18) * Math.PI * 2 + rand() * 0.2;
      const rr = range(0.05, 0.35);
      tentacles.push({
        x: ax + Math.cos(a) * rr, y: ay + 0.2, z: az + Math.sin(a) * rr,
        h: range(0.8, 1.2), r: 0.035, dir: a, lean: range(0.3, 0.6),
        amp: range(0.35, 0.6), speed: range(1.6, 2.4), ph: rand() * 6.28
      });
    }
  }
  sc = sc.add(instances.cylinder({ name: "anemone-bases", transforms: baseDisks, colors: baseColors, material: material.pbr({ color: "#ffffff", roughness: 0.8 }), params: { radialSegments: 12 } }));
  addStrandSystem(
    "anemones",
    tentacles,
    3,
    (i) => {
      const hues = [320, 20, 300, 30, 340, 15, 310];
      return `hsl(${hues[Math.floor(i / 18) % hues.length] ?? 320}, 80%, ${58 + ((i * 3) % 14)}%)`;
    },
    material.pbr({ color: "#ffffff", roughness: 0.5, emissive: "#ff5fa0", emissiveIntensity: 0.12 })
  );
}

// ---------------------------------------------------------------- fish
interface FishClass {
  id: string;
  count: number;
  len: number;
  pos: (i: number, t: number) => V3;
  body: Float32Array;
  tail: Float32Array;
  fin: Float32Array;
  wag: number;
}

const fishClasses: FishClass[] = [];
const addFishClass = (id: string, count: number, len: number, bodyColor: string, finColor: string, wag: number, pos: (i: number, t: number) => V3): void => {
  const bodyMat = material.pbr({ color: bodyColor, roughness: 0.35, metallic: 0.25 });
  const finMat = material.pbr({ color: finColor, roughness: 0.5, emissive: finColor, emissiveIntensity: 0.1 });
  const seedT = makeSeedTransforms(count, 12, len);
  sc = sc
    .add(instances.sphere({ name: `${id}-body`, transforms: seedT, material: bodyMat }).runtime({ id: `${id}-body`, mutable: true }))
    .add(instances.cone({ name: `${id}-tail`, transforms: seedT, material: finMat, params: { radialSegments: 8 }, castShadow: false }).runtime({ id: `${id}-tail`, mutable: true }))
    .add(instances.cone({ name: `${id}-fin`, transforms: seedT, material: finMat, params: { radialSegments: 8 }, castShadow: false }).runtime({ id: `${id}-fin`, mutable: true }));
  fishClasses.push({ id, count, len, pos, wag, body: new Float32Array(count * 16), tail: new Float32Array(count * 16), fin: new Float32Array(count * 16) });
};

interface Offset { x: number; y: number; z: number; ph: number }
const makeOffsets = (n: number, rx: number, ry: number, rz: number): Offset[] =>
  Array.from({ length: n }, () => {
    const c = Math.cbrt(rand());
    const th = rand() * Math.PI * 2;
    const ph = Math.acos(range(-1, 1));
    return { x: c * rx * Math.sin(ph) * Math.cos(th), y: c * ry * Math.cos(ph), z: c * rz * Math.sin(ph) * Math.sin(th), ph: rand() * 6.28 };
  });

const school = (n: number, ax: number, az: number, w: number, p0: number, cy: number, rx: number, ry: number, rz: number): ((i: number, t: number) => V3) => {
  const offs = makeOffsets(n, rx, ry, rz);
  return (i, t) => {
    const o = offs[i] ?? { x: 0, y: 0, z: 0, ph: 0 };
    const cx = ax * Math.sin(w * t + p0);
    const cz = az * Math.cos(w * 0.73 * t + p0 * 1.3);
    const y = cy + 0.9 * Math.sin(w * 1.7 * t + p0);
    return [
      cx + o.x + 0.6 * Math.sin(t * 0.9 + o.ph),
      Math.max(2.4, y + o.y + 0.3 * Math.sin(t * 1.3 + o.ph * 2)),
      cz + o.z + 0.6 * Math.cos(t * 0.8 + o.ph * 1.5)
    ];
  };
};

const solo = (rx: number, rz: number, w: number, p0: number, cy: number, ay: number): ((i: number, t: number) => V3) => (_i, t) => [
  rx * Math.cos(w * t + p0),
  cy + ay * Math.sin(w * 1.4 * t + p0 * 2),
  rz * Math.sin(w * t + p0)
];

addFishClass("school-a", 22, 0.85, "#ffd23f", "#f29d0c", 9, school(22, 11, 9, 0.16, 0.5, 4.2, 3.2, 1.2, 2.4));
addFishClass("school-b", 18, 0.7, "#7fb8ff", "#d6ecff", 11, school(18, 9, 12, -0.13, 2.4, 5.4, 2.8, 1.1, 2.2));
addFishClass("grouper", 1, 3.2, "#d9552b", "#8f2d12", 3.2, solo(12, 9, 0.09, 0.3, 3.4, 0.5));
addFishClass("angel", 1, 2.5, "#4b73d6", "#f2c230", 4, solo(9, 13, -0.12, 2.0, 5.2, 0.8));
addFishClass("tang", 1, 2.0, "#f1e04a", "#2a2a2a", 5, solo(14, 7, 0.14, 4.1, 2.8, 0.4));

const UP: V3 = [0, 1, 0];
const updateFish = (fc: FishClass, t: number, app: { nodes: { require(id: string): { setInstanceMatrices(m: Float32Array, c: number): unknown } } }): void => {
  const L = fc.len;
  for (let i = 0; i < fc.count; i += 1) {
    const p0 = fc.pos(i, t);
    const p1 = fc.pos(i, t + 0.1);
    const f = norm([p1[0] - p0[0], (p1[1] - p0[1]) * 0.6, p1[2] - p0[2]]);
    const r = norm(cross(f, UP));
    const u = cross(r, f);
    putMatrix(fc.body, i, mul(f, L), mul(u, L * 0.38), mul(r, L * 0.22), p0);

    const alpha = 0.55 * Math.sin(t * fc.wag + i * 1.7);
    const f2 = norm([f[0] * Math.cos(alpha) + r[0] * Math.sin(alpha), f[1] * Math.cos(alpha) + r[1] * Math.sin(alpha), f[2] * Math.cos(alpha) + r[2] * Math.sin(alpha)]);
    const tl = L * 0.42;
    const tc: V3 = [p0[0] - f[0] * L * 0.46 - f2[0] * tl * 0.45, p0[1] - f[1] * L * 0.46 - f2[1] * tl * 0.45, p0[2] - f[2] * L * 0.46 - f2[2] * tl * 0.45];
    putMatrix(fc.tail, i, mul(u, L * 0.42), mul(f2, tl), mul(r, -L * 0.05), tc);

    const fc2: V3 = [p0[0] + u[0] * L * 0.2 - f[0] * L * 0.05, p0[1] + u[1] * L * 0.2 - f[1] * L * 0.05, p0[2] + u[2] * L * 0.2 - f[2] * L * 0.05];
    putMatrix(fc.fin, i, mul(f, L * 0.4), mul(u, L * 0.28), mul(r, L * 0.04), fc2);
  }
  app.nodes.require(`${fc.id}-body`).setInstanceMatrices(fc.body, fc.count);
  app.nodes.require(`${fc.id}-tail`).setInstanceMatrices(fc.tail, fc.count);
  app.nodes.require(`${fc.id}-fin`).setInstanceMatrices(fc.fin, fc.count);
};

// ---------------------------------------------------------------- bubbles
const BUBBLES = 84;
const vents: Array<[number, number]> = [[-2, 1], [4, -2], [-6, -4], [2, 5], [7, 3], [-4, 6]];
const bubbleData = Array.from({ length: BUBBLES }, (_, i) => ({
  vent: vents[i % vents.length] ?? [0, 0],
  speed: range(0.5, 1.1),
  ph: rand() * 20,
  size: range(0.1, 0.22),
  wob: range(0.2, 0.5)
}));
const bubbleMatrices = new Float32Array(BUBBLES * 16);
const BUBBLE_H = 12;
sc = sc.add(
  instances
    .sphere({
      name: "bubbles",
      transforms: makeSeedTransforms(BUBBLES, 8, 0.2),
      material: material.pbr({ color: "#e6fdff", roughness: 0.05, emissive: "#9fe8f0", emissiveIntensity: 0.5, opacity: 0.55 }),
      castShadow: false
    })
    .runtime({ id: "bubbles", mutable: true })
);

// ---------------------------------------------------------------- app
const app = createAuraApp("#app", { scene: sc });

let t = 0;
const ORBIT_RADIUS = 20;
const ORBIT_SPEED = 0.14;

app.onFrame((f) => {
  t += f.dt;

  (app.nodes.require("sand") as { setUniform?: (n: string, v: number) => void }).setUniform?.("clk", t);

  for (const sys of strandSystems) updateStrands(sys, t, app);
  for (const fc of fishClasses) updateFish(fc, t, app);

  for (let i = 0; i < BUBBLES; i += 1) {
    const b = bubbleData[i];
    if (!b) continue;
    const h = (t * b.speed + b.ph) % BUBBLE_H;
    const k = h / BUBBLE_H;
    const x = b.vent[0] + b.wob * (0.3 + k) * Math.sin(t * 1.7 + b.ph * 5);
    const z = b.vent[1] + b.wob * (0.3 + k) * Math.cos(t * 1.3 + b.ph * 3);
    const y = sandHeight(b.vent[0], b.vent[1]) + 0.2 + h;
    const s = b.size * (0.6 + 0.8 * k);
    putMatrix(bubbleMatrices, i, [s, 0, 0], [0, s, 0], [0, 0, s], [x, y, z]);
  }
  app.nodes.require("bubbles").setInstanceMatrices(bubbleMatrices, BUBBLES);

  app.nodes.require("sun").setLight?.({ intensity: 3.2 + 0.45 * Math.sin(t * 1.3) * Math.sin(t * 0.7 + 1) });

  // Slow orbit with a gentle bob. The orbit rig already orbits on its own; the pose override adds the bob.
  const ang = ORBIT_SPEED * t;
  app.camera?.setPose({
    position: [Math.cos(ang) * ORBIT_RADIUS, 5.2 + 0.7 * Math.sin(t * 0.55), Math.sin(ang) * ORBIT_RADIUS],
    target: [0, 2 + 0.25 * Math.sin(t * 0.4), 0]
  });
});

await app.ready();

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
