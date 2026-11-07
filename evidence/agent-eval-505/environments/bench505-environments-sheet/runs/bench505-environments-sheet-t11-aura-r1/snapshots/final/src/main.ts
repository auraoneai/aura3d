import {
  camera,
  createAuraApp,
  effects,
  environments,
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

type Kid = NonNullable<Parameters<typeof group>[1]>[number];
type V3 = [number, number, number];

// ---------- helpers ----------
let seed = 90210;
const rand = (): number => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
const range = (a: number, b: number): number => a + (b - a) * rand();
const pick = <T,>(arr: readonly T[]): T => arr[Math.floor(rand() * arr.length) % arr.length]!;
let uid = 0;
const nm = (p: string): string => `${p}${uid++}`;
const f3 = (n: number): string => n.toFixed(3);
const vec = (c: readonly [number, number, number]): string => `vec3(${f3(c[0])}, ${f3(c[1])}, ${f3(c[2])})`;

// ---------- camera path (loops every PERIOD seconds) ----------
const PERIOD = 50;
const PIVOT: V3 = [0, 6, -55];
const RADIUS = 125;
const camPose = (t: number): { position: V3; target: V3 } => {
  const w = (Math.PI * 2) / PERIOD;
  const th = 0.5 * Math.sin(w * t);
  return {
    position: [PIVOT[0] + RADIUS * Math.sin(th), 15 + 4 * Math.sin(w * t + 0.9), PIVOT[2] + RADIUS * Math.cos(th)],
    target: [PIVOT[0], PIVOT[1] + 2 * Math.sin(2 * w * t), PIVOT[2]]
  };
};
const pose0 = camPose(0);

// ---------- sky dome with big low sun (unlit, linear output) ----------
const skyMat = material.custom({
  glsl: {
    vertex: `out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; out vec4 outColor;
void main() {
  vec3 d = normalize(vW - cameraPosition);
  float h = d.y;
  vec3 sunDir = normalize(vec3(0.12, 0.10, -1.0));
  vec3 horizon = vec3(1.0, 0.56, 0.26);
  vec3 pink = vec3(0.93, 0.38, 0.52);
  vec3 violet = vec3(0.47, 0.31, 0.64);
  vec3 zenith = vec3(0.17, 0.18, 0.44);
  vec3 low = vec3(0.88, 0.52, 0.60);
  vec3 c = mix(horizon, pink, smoothstep(0.0, 0.22, h));
  c = mix(c, violet, smoothstep(0.18, 0.55, h));
  c = mix(c, zenith, smoothstep(0.5, 1.0, h));
  c = mix(c, low, smoothstep(0.0, 0.45, -h));
  float sd = max(dot(d, sunDir), 0.0);
  c += vec3(1.0, 0.55, 0.2) * pow(sd, 6.0) * 0.38;
  vec3 lin = pow(c, vec3(2.2));
  float disc = smoothstep(cos(0.125), cos(0.105), dot(d, sunDir));
  float halo = pow(sd, 40.0) * 0.8 + pow(sd, 300.0) * 0.8;
  lin += vec3(1.0, 0.62, 0.3) * halo;
  lin = mix(lin, vec3(1.0, 0.72, 0.38) * 3.2, disc);
  outColor = vec4(lin, 1.0);
}`
  },
  depthWrite: false,
  side: "double",
  fog: false
});

// ---------- cloud banks (unlit soft ellipsoids, hazed by depth) ----------
const cloudMat = (haze: number, light: V3, shade: V3): ReturnType<typeof material.custom> =>
  material.custom({
    glsl: {
      vertex: `out vec3 vN; out vec3 vW;
void main() {
  vN = normalize(mat3(modelMatrix) * normal);
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
      fragment: `in vec3 vN; in vec3 vW; out vec4 outColor;
void main() {
  vec3 n = normalize(vN);
  vec3 v = normalize(cameraPosition - vW);
  float ndv = clamp(dot(n, v), 0.0, 1.0);
  float lit = clamp(dot(n, normalize(vec3(0.25, 0.7, -0.45))) * 0.5 + 0.5, 0.0, 1.0);
  vec3 col = mix(${vec(shade)}, ${vec(light)}, lit);
  float toSun = max(dot(-v, normalize(vec3(0.12, 0.10, -1.0))), 0.0);
  col += vec3(1.0, 0.78, 0.5) * pow(1.0 - ndv, 2.0) * pow(toSun, 3.0) * 0.9;
  col = mix(col, vec3(0.78, 0.72, 0.86), ${f3(haze)});
  col = pow(col, vec3(2.2));
  outColor = vec4(col, pow(ndv, 0.8) * 0.88);
}`
    },
    transparent: true,
    depthWrite: false,
    fog: false
  });

interface CloudSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  speed: number;
  lim: number;
}
const clouds: CloudSpec[] = [];
const cloudZ = [18, 8, -22, -45, -70, -90, -115, -135, -160, -185, -210, -235, -255, -100];

const buildCloud = (i: number, z: number): Kid => {
  const dist = 70 - z;
  const haze = Math.min(0.75, Math.pow(Math.max(0, dist) / 330, 0.8) * 0.8);
  const near = z > -40;
  const y = near ? (i % 2 === 0 ? range(-38, -26) : range(42, 50)) : range(-34, 46);
  const grow = 1 + dist / 160;
  const mat = cloudMat(haze, [1.0, 0.74, 0.58], [0.6, 0.43, 0.68]);
  const puffs: Kid[] = [];
  const width = range(28, 52) * grow;
  const count = 6 + Math.floor(rand() * 4);
  for (let k = 0; k < count; k += 1) {
    const u = k / (count - 1) - 0.5;
    const s = 1 - Math.abs(u) * 0.9;
    puffs.push(
      primitives.sphere({
        name: nm("puff"),
        size: [range(14, 24) * grow * s, range(4.5, 8) * grow * (0.6 + 0.4 * s), range(9, 15) * grow * s],
        position: [u * width, range(-1, 1.5) * grow + (k % 2) * 1.2 * grow, range(-3, 3) * grow],
        material: mat,
        castShadow: false,
        receiveShadow: false,
        params: { widthSegments: 12, heightSegments: 8 }
      })
    );
  }
  const id = `cloud${i}`;
  const x0 = range(-1, 1) * (120 + -z * 0.5);
  clouds.push({ id, x: x0, y, z, speed: range(1.0, 3.2), lim: 150 + -z * 0.75 + width });
  return group(nm("bank"), puffs, { position: [x0, y, z] }).runtime({ id, mutable: true });
};

// ---------- floating islands ----------
interface IslandSpec {
  id: string;
  x: number;
  y: number;
  z: number;
  r: number;
  amp: number;
  speed: number;
  phase: number;
  big?: boolean;
}

const grassMats = ["#79a63f", "#6a9a45", "#8aae48", "#5e9150"].map((c) => material.pbr({ color: c, roughness: 0.95 }));
const hillMat = material.pbr({ color: "#93bb55", roughness: 0.95 });
const soilMat = material.pbr({ color: "#6e4b38", roughness: 1 });
const rockMats = ["#7b6a68", "#6b5c5f", "#8a7870", "#5f5358"].map((c) => material.pbr({ color: c, roughness: 0.92 }));
const trunkMat = material.pbr({ color: "#5b3d29", roughness: 1 });
const leafMats = ["#2f7a45", "#3f8a3a", "#4f9a4a", "#2b6f58"].map((c) => material.pbr({ color: c, roughness: 0.9 }));
const blossomMat = material.pbr({ color: "#e98fb0", roughness: 0.85 });
const crystalMats = [
  material.emissive({ color: "#8ff4ff", emissive: "#2fd6ff", emissiveIntensity: 1.3 }),
  material.emissive({ color: "#ff9ae0", emissive: "#ff4fc0", emissiveIntensity: 1.3 }),
  material.emissive({ color: "#c4a6ff", emissive: "#8a5cff", emissiveIntensity: 1.3 })
];
const waterLipMat = material.pbr({ color: "#a8e4ff", roughness: 0.1 });

const buildIsland = (s: IslandSpec): Kid => {
  const r = s.r;
  const tg = Math.max(0.9, r * 0.07);
  const kids: Kid[] = [];
  kids.push(
    primitives.cylinder({
      name: nm("grass"),
      size: [2 * r, tg, 2 * r],
      position: [0, -tg / 2, 0],
      material: pick(grassMats),
      params: { radialSegments: 16, radiusTop: 0.5, radiusBottom: 0.47 }
    }),
    primitives.sphere({
      name: nm("hill"),
      size: [1.5 * r, tg * 2.4, 1.4 * r],
      position: [0.08 * r, -tg * 0.1, -0.05 * r],
      material: hillMat,
      params: { widthSegments: 14, heightSegments: 6 }
    }),
    primitives.cylinder({
      name: nm("soil"),
      size: [1.94 * r, tg * 0.9, 1.94 * r],
      position: [0, -tg - tg * 0.45, 0],
      material: soilMat,
      params: { radialSegments: 16, radiusTop: 0.5, radiusBottom: 0.44 }
    })
  );
  // chunky tapering rock underside
  const top = -tg * 1.9;
  const depth = r * 1.7 + 3;
  kids.push(
    primitives.cone({
      name: nm("rock"),
      size: [1.8 * r, depth, 1.8 * r],
      position: [0, top - depth / 2, 0],
      rotation: [Math.PI, 0, 0],
      material: rockMats[0]!,
      params: { radius: 0.5, height: 1, radialSegments: 9 }
    })
  );
  const d2 = depth * 1.2;
  kids.push(
    primitives.cone({
      name: nm("rock"),
      size: [1.15 * r, d2, 1.15 * r],
      position: [0.15 * r, top - d2 / 2, 0.06 * r],
      rotation: [Math.PI, 0.5, 0],
      material: rockMats[3]!,
      params: { radius: 0.5, height: 1, radialSegments: 7 }
    })
  );
  for (let k = 0; k < 5; k += 1) {
    const a = rand() * Math.PI * 2;
    const f = range(0.18, 0.65);
    const rad = 0.9 * r * (1 - f) * 0.85;
    const sz = r * range(0.28, 0.5);
    kids.push(
      primitives.sphere({
        name: nm("lump"),
        size: [sz * 1.2, sz, sz * 1.1],
        position: [Math.cos(a) * rad, top - f * depth, Math.sin(a) * rad],
        rotation: [rand(), rand() * 3, rand()],
        material: pick(rockMats),
        params: { widthSegments: 7, heightSegments: 5 }
      })
    );
  }
  // trees
  const nTrees = Math.max(2, Math.round(r / 3));
  for (let k = 0; k < nTrees; k += 1) {
    let x = 0;
    let z = 0;
    for (let tries = 0; tries < 8; tries += 1) {
      const a = rand() * Math.PI * 2;
      const rad = Math.sqrt(rand()) * 0.68 * r;
      x = Math.cos(a) * rad;
      z = Math.sin(a) * rad;
      if (!(s.big && x > 0.4 * r)) break;
    }
    const sc = (0.7 + r / 28) * range(0.8, 1.25);
    kids.push(
      primitives.cylinder({
        name: nm("trunk"),
        size: [0.35 * sc, 1.5 * sc, 0.35 * sc],
        position: [x, 0.55 * sc + tg * 0.4, z],
        material: trunkMat,
        params: { radialSegments: 6 }
      })
    );
    if (rand() < 0.28) {
      kids.push(
        primitives.sphere({
          name: nm("bloom"),
          size: 2.3 * sc,
          position: [x, 2.3 * sc + tg * 0.4, z],
          material: blossomMat,
          params: { widthSegments: 8, heightSegments: 6 }
        })
      );
    } else {
      const lm = pick(leafMats);
      kids.push(
        primitives.cone({
          name: nm("leaf"),
          size: [1.9 * sc, 2.6 * sc, 1.9 * sc],
          position: [x, 2.3 * sc + tg * 0.4, z],
          material: lm,
          params: { radius: 0.5, height: 1, radialSegments: 7 }
        }),
        primitives.cone({
          name: nm("leaf"),
          size: [1.4 * sc, 2.0 * sc, 1.4 * sc],
          position: [x, 3.3 * sc + tg * 0.4, z],
          material: lm,
          params: { radius: 0.5, height: 1, radialSegments: 7 }
        })
      );
    }
  }
  // crystals
  const nCl = 1 + Math.floor(r / 9);
  for (let k = 0; k < nCl; k += 1) {
    const a = Math.PI + range(-1.2, 1.2) + k * 1.7;
    const rad = range(0.35, 0.75) * r;
    const cx = Math.cos(a) * rad;
    const cz = Math.sin(a) * rad;
    const cm = pick(crystalMats);
    const c = (0.6 + r / 40) * range(0.8, 1.3);
    for (let q = 0; q < 3; q += 1) {
      const h = c * range(2.2, 3.6);
      const tx = range(-0.35, 0.35);
      const tz = range(-0.35, 0.35);
      kids.push(
        primitives.cone({
          name: nm("crystal"),
          size: [0.7 * c, h, 0.7 * c],
          position: [cx + (q - 1) * 0.55 * c, h / 2 + tg * 0.3, cz + (q % 2) * 0.4 * c],
          rotation: [tx, 0, tz],
          material: cm,
          params: { radius: 0.5, height: 1, radialSegments: 5 }
        })
      );
    }
  }
  if (s.big) {
    kids.push(
      primitives.box({
        name: nm("channel"),
        size: [0.32 * r, 0.14, 1.7],
        position: [0.86 * r, 0.06, 0],
        material: waterLipMat,
        castShadow: false
      })
    );
  }
  return group(nm("island"), kids, { position: [s.x, s.y, s.z] }).runtime({ id: s.id, mutable: true });
};

const specs: IslandSpec[] = [
  { id: "isl0", x: -10, y: 2, z: -35, r: 24, amp: 1.4, speed: 0.45, phase: 0.2, big: true },
  { id: "isl1", x: 50, y: 14, z: -10, r: 11, amp: 1.8, speed: 0.7, phase: 1.7 },
  { id: "isl2", x: -58, y: -2, z: -5, r: 9, amp: 1.5, speed: 0.85, phase: 3.1 },
  { id: "isl3", x: 24, y: -12, z: -82, r: 14, amp: 2.0, speed: 0.5, phase: 4.4 },
  { id: "isl4", x: -50, y: 24, z: -92, r: 12, amp: 1.7, speed: 0.62, phase: 5.5 },
  { id: "isl5", x: 72, y: 27, z: -112, r: 10, amp: 2.0, speed: 0.78, phase: 0.9 },
  { id: "isl6", x: -4, y: 31, z: -142, r: 16, amp: 2.2, speed: 0.38, phase: 2.6 },
  { id: "isl7", x: -88, y: 8, z: -152, r: 13, amp: 2.0, speed: 0.55, phase: 3.8 },
  { id: "isl8", x: 42, y: 2, z: -182, r: 18, amp: 2.4, speed: 0.42, phase: 1.1 },
  { id: "isl9", x: -32, y: -6, z: -222, r: 20, amp: 2.6, speed: 0.33, phase: 5.0 },
  { id: "isl10", x: 17, y: 30, z: -18, r: 4, amp: 1.1, speed: 0.95, phase: 2.2 }
];

// ---------- waterfall (falls from the largest island) ----------
const BIG = specs[0]!;
const FALL_X = BIG.x + BIG.r * 0.98;
const FALL_Z = BIG.z;
const FALL_LEN = 85;
const fallMat = material.custom({
  glsl: {
    vertex: `out vec3 vW;
void main() {
  vW = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position = modelViewProjectionMatrix * vec4(position, 1.0);
}`,
    fragment: `in vec3 vW; out vec4 outColor;
void main() {
  float u = clamp((topY - vW.y) / ${f3(FALL_LEN)}, 0.0, 1.0);
  float streak = 0.75 + 0.25 * sin(vW.y * 1.6 + clk * 9.0 + vW.x * 4.0);
  vec3 col = mix(vec3(0.88, 0.96, 1.0), vec3(1.0, 0.82, 0.88), u);
  float a = pow(1.0 - u, 1.4) * 0.62 * streak;
  outColor = vec4(pow(col, vec3(2.2)) * 1.4, a);
}`
  },
  uniforms: { clk: { type: "f32", value: 0 }, topY: { type: "f32", value: BIG.y } },
  transparent: true,
  depthWrite: false,
  fog: false,
  side: "double"
});

const DROPS = 90;
const jx = Array.from({ length: DROPS }, () => range(-1, 1));
const jz = Array.from({ length: DROPS }, () => range(-1, 1));
const js = Array.from({ length: DROPS }, () => range(0.5, 1));
const jv = Array.from({ length: DROPS }, () => range(0.8, 1.2));
const dropTransforms = (t: number, topY: number): AuraTransformSpec[] => {
  const out: AuraTransformSpec[] = [];
  for (let i = 0; i < DROPS; i += 1) {
    const u = (t * 0.5 * jv[i]! + i / DROPS) % 1;
    const fall = FALL_LEN * (0.4 * u + 0.6 * u * u);
    const s = js[i]! * 0.9 * (1 - 0.65 * u);
    out.push({
      position: [FALL_X + jx[i]! * (0.35 + u * 1.4) + u * 1.2, topY - fall, FALL_Z + jz[i]! * (0.3 + u * 1.0)],
      scale: [s, s * 1.5, s]
    });
  }
  return out;
};
const dropMat = material.emissive({ color: "#ffffff", emissive: "#d6efff", emissiveIntensity: 1.1 });

// ---------- scene ----------
let sc = scene({ background: "#e8906f" })
  .camera(camera.perspective({ position: pose0.position, target: pose0.target, fov: 55, near: 2, far: 1400 }))
  .add(environments.neutral({ intensity: 0.45, background: false }))
  .add(lights.hemisphere({ skyColor: "#ffc4a0", groundColor: "#8a6aa8", intensity: 0.95 }))
  .add(lights.directional({ position: [-40, 55, -80], target: [0, 0, -40], intensity: 3, color: "#ffb070" }))
  .add(lights.directional({ position: [60, 25, 90], target: [0, 0, -40], intensity: 1.3, color: "#ff9fc0" }))
  .add(effects.fog({ color: "#c6b6d8", density: 0.0042 }))
  .add(
    primitives.sphere({
      name: "sky",
      size: 1400,
      material: skyMat,
      castShadow: false,
      receiveShadow: false,
      frustumCulled: false,
      renderOrder: -100,
      params: { widthSegments: 32, heightSegments: 20 }
    })
  );

for (const sp of specs) sc = sc.add(buildIsland(sp));
cloudZ.forEach((z, i) => {
  sc = sc.add(buildCloud(i, z));
});

sc = sc
  .add(
    primitives
      .cylinder({
        name: "fall",
        size: [1.3, FALL_LEN, 1.3],
        position: [0, -FALL_LEN / 2, 0],
        material: fallMat,
        castShadow: false,
        receiveShadow: false,
        params: { radialSegments: 8 }
      })
      .position(FALL_X, BIG.y, FALL_Z)
      .runtime({ id: "fall", mutable: true })
  )
  .add(
    instances.sphere({
      name: "drops",
      transforms: dropTransforms(0, BIG.y),
      material: dropMat,
      castShadow: false,
      params: { widthSegments: 6, heightSegments: 4 }
    }).runtime({ id: "drops", mutable: true })
  );

const app = createAuraApp("#app", { scene: sc });
await app.ready();

let t = 0;
app.onFrame((f) => {
  t += Math.min(f.dt, 0.1);

  for (const sp of specs) {
    const n = app.nodes.require(sp.id);
    const a = sp.speed * t + sp.phase;
    n.setPosition(sp.x, sp.y + sp.amp * Math.sin(a), sp.z);
    if (!sp.big) n.setRotation(0.03 * Math.sin(a * 0.7 + 1), 0, 0.03 * Math.cos(a * 0.6));
  }

  for (const c of clouds) {
    c.x += c.speed * Math.min(f.dt, 0.1);
    if (c.x > c.lim) c.x = -c.lim;
    const edge = Math.max(0.02, Math.min(1, (c.lim - Math.abs(c.x)) / 40));
    const n = app.nodes.require(c.id);
    n.setPosition(c.x, c.y, c.z);
    n.setScale(edge);
  }

  const topY = BIG.y + BIG.amp * Math.sin(BIG.speed * t + BIG.phase);
  const fall = app.nodes.require("fall");
  fall.setPosition(FALL_X, topY, FALL_Z);
  fall.setUniform?.("clk", t);
  fall.setUniform?.("topY", topY);
  app.nodes.require("drops").setInstances(dropTransforms(t, topY));

  const p = camPose(t);
  app.camera?.setPose({ position: p.position, target: p.target });
});

requestAnimationFrame(() => {
  requestAnimationFrame(() => {
    window.__EVAL_READY__ = true;
  });
});
