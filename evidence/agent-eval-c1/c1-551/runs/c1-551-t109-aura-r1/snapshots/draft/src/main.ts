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

type V3 = [number, number, number];

declare global {
  interface Window {
    __TASK_STATE__?: { turntableAngleDeg: number; paintFinish: string };
    __EVAL_READY__?: boolean;
  }
}

const TURNTABLE_DEG_PER_SEC = 20;

// ---------------------------------------------------------------------------
// Procedural geometry
// ---------------------------------------------------------------------------

/** Rounded-box style signed power, used for the superellipse cross sections. */
const spow = (v: number, e: number): number => Math.sign(v) * Math.pow(Math.abs(v), e);

interface BodyShape {
  length: number;
  halfWidth: number;
  halfHeight: number;
  centerY: number;
  centerX: number;
  /** superellipse exponent of the cross section (2 = ellipse, higher = boxier) */
  squareness: number;
  /** taper exponents for front (+x) and rear (-x) */
  frontP: number;
  rearP: number;
  /** vertical shift along the length, positive raises the front */
  pitch: number;
  /** uv tiling along length / around the section */
  uvRepeat: [number, number];
}

const taper = (t: number, shape: BodyShape): number => {
  const p = t >= 0 ? shape.frontP : shape.rearP;
  return Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t), p)));
};

/** Point on a lofted superellipse body. t in [-1, 1] along x, phi around the x axis. */
const bodyPoint = (shape: BodyShape, t: number, phi: number): V3 => {
  const s = taper(t, shape);
  const c = Math.cos(phi);
  const sn = Math.sin(phi);
  const e = 2 / shape.squareness;
  const x = shape.centerX + t * shape.length * 0.5;
  // roof side is a little fuller than the floor side so the underside tucks up
  const hv = sn > 0 ? 1 : 0.7;
  const y = shape.centerY + shape.pitch * t + shape.halfHeight * Math.pow(s, 0.85) * spow(sn, e) * hv;
  const z = shape.halfWidth * s * spow(c, e);
  return [x, y, z];
};

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

const buildBody = (shape: BodyShape, nu = 96, nv = 64) => {
  const positions = new Float32Array((nu + 1) * (nv + 1) * 3);
  const normals = new Float32Array((nu + 1) * (nv + 1) * 3);
  const uvs = new Float32Array((nu + 1) * (nv + 1) * 2);
  const indices: number[] = [];
  const lo = 0.004;
  const hi = 0.996;
  const du = 0.004;
  const dv = 0.01;
  const min: V3 = [1e9, 1e9, 1e9];
  const max: V3 = [-1e9, -1e9, -1e9];
  for (let j = 0; j <= nu; j += 1) {
    // cosine spacing keeps the vertices dense near the rounded ends
    const uu = lo + (hi - lo) * (0.5 - 0.5 * Math.cos((j / nu) * Math.PI));
    const t = uu * 2 - 1;
    for (let i = 0; i <= nv; i += 1) {
      const phi = (i / nv) * Math.PI * 2;
      const p = bodyPoint(shape, t, phi);
      const tu = (t2: number) => bodyPoint(shape, Math.min(1 - lo * 2, Math.max(-1 + lo * 2, t2)), phi);
      const dT = sub(tu(t + du), tu(t - du));
      const dP = sub(bodyPoint(shape, t, phi + dv), bodyPoint(shape, t, phi - dv));
      // dP x dT points outward for this parameterisation
      const n = norm(cross(dP, dT));
      const k = j * (nv + 1) + i;
      positions.set(p, k * 3);
      normals.set(n, k * 3);
      uvs.set([uu * shape.uvRepeat[0], (i / nv) * shape.uvRepeat[1]], k * 2);
      for (let a = 0; a < 3; a += 1) {
        min[a] = Math.min(min[a]!, p[a]!);
        max[a] = Math.max(max[a]!, p[a]!);
      }
      if (i < nv && j < nu) {
        const v = k;
        indices.push(v, v + nv + 1, v + 1, v + 1, v + nv + 1, v + nv + 2);
      }
    }
  }
  return geometry.define({ positions, normals, indices, uvs, bounds: { min, max } });
};

/** Round tube swept along a path of points (open or closed). */
const buildTube = (path: V3[], radius: number, closed: boolean, sides = 10) => {
  const n = path.length;
  const positions = new Float32Array(n * (sides + 1) * 3);
  const normals = new Float32Array(n * (sides + 1) * 3);
  const indices: number[] = [];
  const min: V3 = [1e9, 1e9, 1e9];
  const max: V3 = [-1e9, -1e9, -1e9];
  for (let a = 0; a < n; a += 1) {
    const prev = path[closed ? (a + n - 1) % n : Math.max(0, a - 1)]!;
    const next = path[closed ? (a + 1) % n : Math.min(n - 1, a + 1)]!;
    const T = norm(sub(next, prev));
    const ref: V3 = Math.abs(T[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
    const N = norm(cross(T, ref));
    const B = cross(T, N);
    for (let s = 0; s <= sides; s += 1) {
      const ang = (s / sides) * Math.PI * 2;
      const nx = N[0] * Math.cos(ang) + B[0] * Math.sin(ang);
      const ny = N[1] * Math.cos(ang) + B[1] * Math.sin(ang);
      const nz = N[2] * Math.cos(ang) + B[2] * Math.sin(ang);
      const p: V3 = [path[a]![0] + nx * radius, path[a]![1] + ny * radius, path[a]![2] + nz * radius];
      const k = a * (sides + 1) + s;
      positions.set(p, k * 3);
      normals.set([nx, ny, nz], k * 3);
      for (let q = 0; q < 3; q += 1) {
        min[q] = Math.min(min[q]!, p[q]!);
        max[q] = Math.max(max[q]!, p[q]!);
      }
      const last = closed ? a < n : a < n - 1;
      if (s < sides && last) {
        const a2 = (a + 1) % n;
        const k2 = a2 * (sides + 1) + s;
        indices.push(k, k2, k + 1, k + 1, k2, k2 + 1);
      }
    }
  }
  return geometry.define({ positions, normals, indices, bounds: { min, max } });
};

// ---------------------------------------------------------------------------
// Metallic flake normal map (generated in code)
// ---------------------------------------------------------------------------

const makeFlakeNormalMap = () => {
  const size = 256;
  const data = new Uint8Array(size * size * 4);
  let seed = 1337;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  for (let i = 0; i < size * size; i += 1) {
    let nx = (rnd() - 0.5) * 0.06;
    let ny = (rnd() - 0.5) * 0.06;
    if (rnd() < 0.55) {
      // a metal flake: a randomly tilted facet
      const a = rnd() * Math.PI * 2;
      const tilt = 0.35 + rnd() * 0.65;
      nx = Math.cos(a) * tilt;
      ny = Math.sin(a) * tilt;
    }
    const nz = Math.sqrt(Math.max(0.0001, 1 - nx * nx - ny * ny));
    data[i * 4] = Math.round((nx * 0.5 + 0.5) * 255);
    data[i * 4 + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    data[i * 4 + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    data[i * 4 + 3] = 255;
  }
  const tex = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "linear" });
  tex.wrapS = "repeat";
  tex.wrapT = "repeat";
  tex.generateMipmaps = true;
  tex.minFilter = "linear-mipmap-linear";
  tex.magFilter = "linear";
  tex.needsUpdate = true;
  return tex;
};

// ---------------------------------------------------------------------------
// Object definition
// ---------------------------------------------------------------------------

const bodyShape: BodyShape = {
  length: 3.7,
  halfWidth: 0.8,
  halfHeight: 0.36,
  centerY: 0.64,
  centerX: 0,
  squareness: 2.6,
  frontP: 2.3,
  rearP: 3.0,
  pitch: -0.07,
  uvRepeat: [10, 5]
};

const cabinShape: BodyShape = {
  length: 1.75,
  halfWidth: 0.6,
  halfHeight: 0.3,
  centerY: 0.98,
  centerX: -0.22,
  squareness: 2.4,
  frontP: 2.0,
  rearP: 2.4,
  pitch: 0,
  uvRepeat: [4, 3]
};

const flakeMap = makeFlakeNormalMap();

const candyRed = material.physical({
  name: "candy red car paint",
  color: "#9c0716",
  metallic: 0.55,
  roughness: 0.32,
  clearcoat: 1,
  clearcoatRoughness: 0.025,
  envMapIntensity: 1.6,
  normal: flakeMap,
  normalScale: 0.22,
  ior: 1.5
});

const blackGlass = material.physical({
  name: "cabin glass",
  color: "#05070b",
  metallic: 0.2,
  roughness: 0.08,
  clearcoat: 1,
  clearcoatRoughness: 0.01,
  envMapIntensity: 1.8
});

const chrome = material.pbr({ name: "chrome", color: "#e8edf5", metallic: 1, roughness: 0.04, envMapIntensity: 1.8 });
const rubber = material.pbr({ name: "rubber", color: "#0b0b0d", metallic: 0, roughness: 0.85 });

const bodyGeo = buildBody(bodyShape);
const cabinGeo = buildBody(cabinShape, 72, 56);

// chrome belt-line strips along both flanks
const beltPath = (side: 1 | -1): V3[] => {
  const pts: V3[] = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = -0.86 + (1.72 * i) / 60;
    const p = bodyPoint(bodyShape, t, side > 0 ? 0 : Math.PI);
    pts.push([p[0], p[1] + 0.005, p[2] * 1.004]);
  }
  return pts;
};

const sectionLoop = (shape: BodyShape, t: number, grow: number, phiFrom = 0, phiTo = Math.PI * 2, n = 72): V3[] => {
  const pts: V3[] = [];
  for (let i = 0; i <= n; i += 1) {
    const phi = phiFrom + ((phiTo - phiFrom) * i) / n;
    const p = bodyPoint(shape, t, phi);
    const c: V3 = [shape.centerX + t * shape.length * 0.5, shape.centerY + shape.pitch * t, 0];
    pts.push([p[0], c[1] + (p[1] - c[1]) * grow, p[2] * grow]);
  }
  return pts;
};

const stripFront = buildTube(sectionLoop(bodyShape, 0.8, 1.004, 0, Math.PI * 2, 80).slice(0, 80), 0.017, true);
const stripRear = buildTube(sectionLoop(bodyShape, -0.8, 1.004, 0, Math.PI * 2, 80).slice(0, 80), 0.017, true);
const beltL = buildTube(beltPath(1), 0.014, false);
const beltR = buildTube(beltPath(-1), 0.014, false);
// window frame: thin chrome line around the cabin's lower edge where glass meets paint
const cabinFrame = buildTube(sectionLoop(cabinShape, 0.0, 1.003, 0, Math.PI, 60), 0.012, false);

const frontLampT = (z: number) => Math.pow(1 - Math.pow(z / bodyShape.halfWidth, 2), 1 / bodyShape.frontP);
const rearLampT = (z: number) => -Math.pow(1 - Math.pow(z / bodyShape.halfWidth, 2), 1 / bodyShape.rearP);

const WHEEL_X = 1.18;
const WHEEL_Z = 0.7;
const WHEEL_R = 0.36;

const wheelNodes = () => {
  const out = [];
  for (const sx of [1, -1]) {
    for (const sz of [1, -1]) {
      const px = sx * WHEEL_X;
      const pz = sz * WHEEL_Z;
      out.push(
        primitives
          .cylinder({ name: `tire-${sx}-${sz}`, size: [WHEEL_R * 2, 0.26, WHEEL_R * 2], material: rubber })
          .position(px, WHEEL_R, pz)
          .rotate(Math.PI / 2, 0, 0)
      );
      out.push(
        primitives
          .cylinder({ name: `rim-${sx}-${sz}`, size: [WHEEL_R * 1.25, 0.275, WHEEL_R * 1.25], material: chrome })
          .position(px, WHEEL_R, pz)
          .rotate(Math.PI / 2, 0, 0)
      );
      out.push(
        primitives
          .cylinder({ name: `hub-${sx}-${sz}`, size: [WHEEL_R * 0.5, 0.285, WHEEL_R * 0.5], material: rubber })
          .position(px, WHEEL_R, pz)
          .rotate(Math.PI / 2, 0, 0)
      );
    }
  }
  return out;
};

const lampMat = material.pbr({ name: "headlamp", color: "#ffffff", emissive: "#dfeaff", emissiveIntensity: 2.2, roughness: 0.2 });
const tailMat = material.pbr({ name: "taillamp", color: "#ff2030", emissive: "#ff1020", emissiveIntensity: 1.8, roughness: 0.2 });

const lamps = () => {
  const out = [];
  for (const sz of [1, -1]) {
    const z = 0.46;
    const tf = frontLampT(z);
    const fp = bodyPoint(bodyShape, tf, 0);
    out.push(
      primitives
        .sphere({ name: `head-${sz}`, size: [0.2, 0.1, 0.2], material: lampMat })
        .position(fp[0] - 0.03, fp[1] + 0.03, sz * z)
    );
    const tr = rearLampT(z);
    const rp = bodyPoint(bodyShape, tr, 0);
    out.push(
      primitives
        .sphere({ name: `tail-${sz}`, size: [0.16, 0.07, 0.24], material: tailMat })
        .position(rp[0] + 0.03, rp[1] + 0.06, sz * z)
    );
  }
  return out;
};

// platform marks so the rotation is readable on the turntable
const ticks = () => {
  const out = [];
  const n = 36;
  for (let i = 0; i < n; i += 1) {
    const a = (i / n) * Math.PI * 2;
    const major = i % 9 === 0;
    const r = 2.3;
    out.push(
      primitives
        .box({
          name: `tick-${i}`,
          size: [major ? 0.2 : 0.09, 0.012, 0.025],
          material: major
            ? material.pbr({ color: "#c8d6ee", metallic: 1, roughness: 0.15 })
            : material.pbr({ color: "#4a5262", metallic: 1, roughness: 0.25 })
        })
        .position(Math.cos(a) * r, 0.006, Math.sin(a) * r)
        .rotate(0, -a, 0)
    );
  }
  return out;
};

const carGroup = group(
  "turntable-top",
  [
    geometry.custom(bodyGeo, { name: "body", material: candyRed }),
    geometry.custom(cabinGeo, { name: "cabin", material: blackGlass }),
    geometry.custom(stripFront, { name: "chrome bumper front", material: chrome }),
    geometry.custom(stripRear, { name: "chrome bumper rear", material: chrome }),
    geometry.custom(beltL, { name: "chrome belt L", material: chrome }),
    geometry.custom(beltR, { name: "chrome belt R", material: chrome }),
    geometry.custom(cabinFrame, { name: "chrome cabin frame", material: chrome }),
    ...wheelNodes(),
    ...lamps(),
    ...ticks()
  ],
  { position: [0, 0, 0] }
).runtime({ id: "turntable-top", mutable: true });

// ---------------------------------------------------------------------------
// Scene
// ---------------------------------------------------------------------------

const stripMat = material.pbr({ color: "#ffffff", emissive: "#f4f8ff", emissiveIntensity: 3, roughness: 1, unlit: true });

const app = createAuraApp("#app", {
  scene: scene({ background: "#04050a" })
    .add(environments.studio({ preset: "softbox", intensity: 1.0, background: false, rotation: 0.6 }))
    // long strip lights: one overhead, two at the sides
    .add(lights.rect({ name: "strip top", position: [0, 4.2, 0], target: [0, 0.4, 0], width: 0.6, height: 6, intensity: 6, color: "#fff6ee" }))
    .add(lights.rect({ name: "strip left", position: [-4.6, 2.6, 1.5], target: [0, 0.5, 0], width: 0.5, height: 5, intensity: 5, color: "#ffffff" }))
    .add(lights.rect({ name: "strip right", position: [4.6, 2.4, -1.5], target: [0, 0.5, 0], width: 0.5, height: 5, intensity: 5, color: "#f2f6ff" }))
    // faint cool rim light from behind
    .add(lights.directional({ name: "rim", position: [-3, 2.5, -5], target: [0, 0.6, 0], intensity: 1.4, color: "#9cc4ff" }))
    .add(lights.directional({ name: "key", position: [3, 5, 4], target: [0, 0.4, 0], intensity: 1.0, color: "#fff4e8", shadow: true }))
    // showroom floor
    .add(
      primitives.plane({
        name: "showroom floor",
        size: [60, 1, 60],
        material: material.pbr({ color: "#0b0c10", metallic: 0.3, roughness: 0.35 }),
        receiveShadow: true
      }).position(0, -0.16, 0)
    )
    // ring light: glowing cool ring under the platform lip
    .add(
      primitives.cylinder({
        name: "ring light",
        size: [5.45, 0.05, 5.45],
        material: material.pbr({ color: "#bcd6ff", emissive: "#7fb2ff", emissiveIntensity: 2.4, roughness: 0.5 })
      }).position(0, -0.14, 0)
    )
    // platform base + glossy top
    .add(
      primitives.cylinder({
        name: "platform base",
        size: [5.3, 0.12, 5.3],
        material: material.pbr({ color: "#15171c", metallic: 0.6, roughness: 0.3 })
      }).position(0, -0.07, 0)
    )
    .add(
      primitives.cylinder({
        name: "platform top",
        size: [5.0, 0.02, 5.0],
        material: material.physical({ color: "#0b0c10", metallic: 0.5, roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.4 }),
        receiveShadow: true
      }).position(0, -0.011, 0)
    )
    .add(
      primitives.cylinder({
        name: "platform chrome edge",
        size: [5.1, 0.035, 5.1],
        material: chrome
      }).position(0, -0.02, 0)
    )
    .add(carGroup)
    .add(effects.screenSpaceReflections({ intensity: 0.5 } as never))
    .add(effects.bloom({ intensity: 0.35, threshold: 0.9, radius: 0.5 }))
    .camera(camera.perspective({ position: [4.6, 1.55, 5.0], target: [0, 0.55, 0], fov: 34 }))
});

void stripMat;

window.__TASK_STATE__ = { turntableAngleDeg: 0, paintFinish: "clearcoat" };

let flagged = false;
app.onFrame((f) => {
  const deg = f.time * TURNTABLE_DEG_PER_SEC;
  app.nodes.require("turntable-top").setRotation(0, (deg * Math.PI) / 180, 0);
  window.__TASK_STATE__ = { turntableAngleDeg: deg, paintFinish: "clearcoat" };
  if (!flagged) {
    flagged = true;
    requestAnimationFrame(() => {
      window.__EVAL_READY__ = true;
    });
  }
});

void app.ready();
