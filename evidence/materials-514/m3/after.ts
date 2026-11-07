import {
  camera,
  createAuraApp,
  effects,
  environments,
  geometry,
  lights,
  material,
  primitives,
  scene,
  texture
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { materials: string[]; cameraAzimuthDeg: number };
  }
}

type P2 = [number, number];
type Geo = ReturnType<typeof geometry.define>;
const TAU = Math.PI * 2;

/* ------------------------------------------------------------------ */
/* Procedural Carrara marble texture (periodic noise, warped stripes)  */
/* ------------------------------------------------------------------ */
const lattices = new Map<number, Float32Array>();
let hashSeed = 7;
const hrand = (): number => ((hashSeed = (Math.imul(hashSeed, 1664525) + 1013904223) >>> 0) / 4294967296);
const lattice = (p: number): Float32Array => {
  let l = lattices.get(p);
  if (!l) {
    l = new Float32Array(p * p);
    for (let i = 0; i < l.length; i += 1) l[i] = hrand();
    lattices.set(p, l);
  }
  return l;
};
const vnoise = (u: number, v: number, p: number): number => {
  const l = lattice(p);
  const x = u * p, y = v * p;
  const ix = Math.floor(x), iy = Math.floor(y);
  let fx = x - ix, fy = y - iy;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const x0 = ((ix % p) + p) % p, x1 = (x0 + 1) % p;
  const y0 = ((iy % p) + p) % p, y1 = (y0 + 1) % p;
  const a = l[y0 * p + x0]!, b = l[y0 * p + x1]!, c = l[y1 * p + x0]!, d = l[y1 * p + x1]!;
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
};
const fbm = (u: number, v: number, base: number, oct: number): number => {
  let sum = 0, amp = 1, tot = 0;
  for (let o = 0; o < oct; o += 1) {
    sum += amp * vnoise(u, v, base << o);
    tot += amp;
    amp *= 0.5;
  }
  return sum / tot;
};
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

const makeMarbleTexture = (size: number) => {
  const data = new Uint8Array(size * size * 4);
  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const u = (px + 0.5) / size, v = (py + 0.5) / size;
      const w1 = fbm(u, v, 2, 5), w2 = fbm(u + 0.37, v + 0.61, 3, 4);
      const a = Math.sin(TAU * (u + 2 * v) + (w1 - 0.5) * 16);
      const b = Math.sin(TAU * (2 * u - v) + (w2 - 0.5) * 13 + 1.3);
      const vein1 = Math.pow(1 - Math.abs(a), 24);
      const vein2 = Math.pow(1 - Math.abs(b), 44) * 0.7;
      const t = fbm(u + 0.2, v + 0.8, 4, 5);
      const vein3 = Math.pow(1 - Math.abs(2 * t - 1), 16) * 0.55;
      const mask = smooth(0.3, 0.7, fbm(u + 0.5, v + 0.1, 2, 3));
      const vein = Math.min(1, (vein1 * 0.9 + vein2 + vein3) * (0.3 + 0.7 * mask));
      const halo = Math.pow(1 - Math.abs(a), 5) * 0.14 * mask;
      const cloud = fbm(u, v, 6, 4);
      const baseR = 0.945 - 0.05 * cloud, baseG = 0.94 - 0.05 * cloud, baseB = 0.925 - 0.045 * cloud;
      const k = Math.min(1, vein * 0.82 + halo);
      const r = baseR + (0.4 - baseR) * k, g = baseG + (0.41 - baseG) * k, bl = baseB + (0.45 - baseB) * k;
      const o = (py * size + px) * 4;
      data[o] = Math.round(Math.min(1, Math.max(0, r)) * 255);
      data[o + 1] = Math.round(Math.min(1, Math.max(0, g)) * 255);
      data[o + 2] = Math.round(Math.min(1, Math.max(0, bl)) * 255);
      data[o + 3] = 255;
    }
  }
  const handle = texture.data({ width: size, height: size, data, format: "rgba8", colorSpace: "srgb" });
  handle.wrapS = "repeat";
  handle.wrapT = "repeat";
  handle.minFilter = "linear";
  handle.magFilter = "linear";
  return handle;
};
const marbleTex = makeMarbleTexture(1024);

const marble = (sx: number, sy: number, ox: number, oy: number) =>
  material.pbr({
    color: "#ffffff",
    texture: marbleTex,
    texTransforms: { baseColor: { scale: [sx, sy], offset: [ox, oy] } },
    metallic: 0,
    roughness: 0.16,
    clearcoat: 0.6,
    clearcoatRoughness: 0.06,
    envMapIntensity: 0.9
  });

/* ------------------------------------------------------------------ */
/* Geometry helpers: lathe profiles, smooth curves, swept tubes        */
/* ------------------------------------------------------------------ */
const catmull = (pts: P2[], per: number): P2[] => {
  const out: P2[] = [];
  const alpha = 0.5;
  const lerp = (a: P2, b: P2, t: number): P2 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p1 = pts[i]!, p2 = pts[i + 1]!;
    const p0 = pts[i - 1] ?? [2 * p1[0] - p2[0], 2 * p1[1] - p2[1]] as P2;
    const p3 = pts[i + 2] ?? [2 * p2[0] - p1[0], 2 * p2[1] - p1[1]] as P2;
    const d = (a: P2, b: P2): number => Math.pow(Math.hypot(a[0] - b[0], a[1] - b[1]) || 1e-4, alpha);
    const t0 = 0, t1 = t0 + d(p0, p1), t2 = t1 + d(p1, p2), t3 = t2 + d(p2, p3);
    for (let s = 0; s < per; s += 1) {
      const t = t1 + ((t2 - t1) * s) / per;
      const a1 = lerp(p0, p1, (t - t0) / (t1 - t0));
      const a2 = lerp(p1, p2, (t - t1) / (t2 - t1));
      const a3 = lerp(p2, p3, (t - t2) / (t3 - t2));
      const b1 = lerp(a1, a2, (t - t0) / (t2 - t0));
      const b2 = lerp(a2, a3, (t - t1) / (t3 - t1));
      out.push(lerp(b1, b2, (t - t1) / (t2 - t1)));
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
};

const bounds = (pos: number[]) => {
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < pos.length; i += 3) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k]!, pos[i + k]!);
      max[k] = Math.max(max[k]!, pos[i + k]!);
    }
  }
  return { min, max };
};

// Each strip is a (radius, height) polyline; the surface normal is (dy, -dr),
// so strips run with the material on their right-hand side (outside = up the wall).
const lathe = (strips: P2[][], seg: number, yOff: number): Geo => {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
  for (const s of strips) {
    const n = s.length;
    const nrm: P2[] = s.map((_, i) => {
      const a = s[Math.max(0, i - 1)]!, b = s[Math.min(n - 1, i + 1)]!;
      const dr = b[0] - a[0], dy = b[1] - a[1];
      const l = Math.hypot(dr, dy) || 1;
      return [dy / l, -dr / l];
    });
    const arc: number[] = [0];
    for (let i = 1; i < n; i += 1) arc.push(arc[i - 1]! + Math.hypot(s[i]![0] - s[i - 1]![0], s[i]![1] - s[i - 1]![1]));
    const total = arc[n - 1] || 1;
    const base = pos.length / 3;
    for (let c = 0; c <= seg; c += 1) {
      const th = (c / seg) * TAU, sn = Math.sin(th), cs = Math.cos(th);
      for (let r = 0; r < n; r += 1) {
        const [rad, y] = s[r]!;
        const [nr, ny] = nrm[r]!;
        pos.push(rad * sn, y + yOff, rad * cs);
        nor.push(nr * sn, ny, nr * cs);
        uvs.push(c / seg, arc[r]! / total);
        if (c > 0 && r > 0) {
          const A = base + (c - 1) * n + (r - 1), B = base + c * n + (r - 1);
          const C = base + (c - 1) * n + r, D = base + c * n + r;
          idx.push(A, B, D, A, D, C);
        }
      }
    }
  }
  return geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uvs),
    indices: idx,
    bounds: bounds(pos)
  });
};

// Tube swept along a planar (x, y) path at z = 0.
const tube = (path: P2[], radiusAt: (t: number) => number, around: number, yOff: number): Geo => {
  const pos: number[] = [], nor: number[] = [], uvs: number[] = [], idx: number[] = [];
  const n = path.length;
  for (let i = 0; i < n; i += 1) {
    const a = path[Math.max(0, i - 1)]!, b = path[Math.min(n - 1, i + 1)]!;
    const tx = b[0] - a[0], ty = b[1] - a[1];
    const l = Math.hypot(tx, ty) || 1;
    const nx = -ty / l, ny = tx / l;
    const rad = radiusAt(i / (n - 1));
    for (let j = 0; j <= around; j += 1) {
      const ph = (j / around) * TAU, c = Math.cos(ph), s = Math.sin(ph);
      const dx = c * nx, dy = c * ny, dz = s;
      pos.push(path[i]![0] + rad * dx, path[i]![1] + yOff + rad * dy, rad * dz);
      nor.push(dx, dy, dz);
      uvs.push(i / (n - 1), j / around);
      if (i > 0 && j > 0) {
        const A = (i - 1) * (around + 1) + (j - 1), B = (i - 1) * (around + 1) + j;
        const C = i * (around + 1) + (j - 1), D = i * (around + 1) + j;
        idx.push(A, B, C, B, D, C);
      }
    }
  }
  return geometry.define({
    positions: new Float32Array(pos),
    normals: new Float32Array(nor),
    uvs: new Float32Array(uvs),
    indices: idx,
    bounds: bounds(pos)
  });
};

/* ------------------------------------------------------------------ */
/* Trophy shapes                                                       */
/* ------------------------------------------------------------------ */
const BASE_TOP = 1.62;

// Foot top -> stem -> knop -> cup outside -> rolled rim -> cup inside.
const bodyCtrl: P2[] = [
  [0.2, 0.035], [0.185, 0.058], [0.13, 0.085], [0.075, 0.11], [0.05, 0.145], [0.048, 0.185],
  [0.07, 0.215], [0.09, 0.245], [0.072, 0.275], [0.05, 0.305], [0.046, 0.35], [0.052, 0.4],
  [0.085, 0.445], [0.15, 0.5], [0.2, 0.57], [0.225, 0.65], [0.233, 0.74], [0.228, 0.82], [0.218, 0.88],
  [0.216, 0.894], [0.2135, 0.908], [0.209, 0.914], [0.2045, 0.908], [0.202, 0.894],
  [0.2005, 0.84], [0.205, 0.77], [0.2, 0.7], [0.18, 0.62], [0.135, 0.545], [0.075, 0.495], [0.02, 0.475], [0, 0.47]
];
const bodySamples = catmull(bodyCtrl, 8);
const rimIndex = bodySamples.findIndex((p, i) => i > 60 && p[1] >= 0.894);
const outerWall = bodySamples.slice(0, rimIndex + 1);
const rAt = (y: number): number => {
  for (let i = 1; i < outerWall.length; i += 1) {
    const a = outerWall[i - 1]!, b = outerWall[i]!;
    if (y >= a[1] && y <= b[1] && b[1] > a[1]) return a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]);
  }
  return 0.22;
};

const bodyGeo = lathe(
  [
    [[0, 0], [0.12, 0], [0.19, 0], [0.2, 0.004]],
    [[0.2, 0.004], [0.2, 0.02], [0.2, 0.035]],
    bodySamples
  ],
  72,
  BASE_TOP
);

const bandStrip = (y0: number, y1: number, off: number): P2[] => {
  const pts: P2[] = [[rAt(y0), y0], [rAt(y0) + off, y0 + off * 0.5]];
  const n = 10;
  for (let i = 0; i <= n; i += 1) {
    const y = y0 + off * 0.5 + ((y1 - y0 - off) * i) / n;
    pts.push([rAt(y) + off, y]);
  }
  pts.push([rAt(y1 - off * 0.5) + off, y1 - off * 0.5], [rAt(y1), y1]);
  return pts;
};
const bandGeo = lathe([bandStrip(0.6, 0.69, 0.007)], 72, BASE_TOP);
const filletGeo = lathe([bandStrip(0.583, 0.6, 0.011), bandStrip(0.69, 0.707, 0.011)], 72, BASE_TOP);
const stemRingGeo = lathe([[[0.0505, 0.31], [0.058, 0.318], [0.058, 0.33], [0.0505, 0.338]]], 48, BASE_TOP);

const handlePath = catmull(
  [[0.222, 0.8], [0.27, 0.835], [0.335, 0.845], [0.385, 0.8], [0.395, 0.73], [0.36, 0.665], [0.3, 0.615], [0.2, 0.585]],
  8
);
const handleRadius = (t: number): number => 0.02 + 0.006 * Math.sin(Math.PI * t);
const handleR = tube(handlePath, handleRadius, 14, BASE_TOP);
const handleL = tube(handlePath.map(([x, y]): P2 => [-x, y]), handleRadius, 14, BASE_TOP);

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
const gold = material.studioMetal({ color: "#ffdb85", roughness: 0.14 });
const darkGold = material.studioMetal({ color: "#a57c2c", roughness: 0.48 });
const darkstone = material.pbr({
  color: "#0b0b0d",
  metallic: 0.1,
  roughness: 0.1,
  clearcoat: 1,
  clearcoatRoughness: 0.03,
  envMapIntensity: 1.1
});
const floorMat = material.pbr({ color: "#1d1510", roughness: 0.38, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 0.5 });
const wallMat = material.pbr({ color: "#2a1d16", roughness: 0.92, envMapIntensity: 0.2 });
const windowGlow = material.emissive({ color: "#ffffff", emissive: "#ffdca0", emissiveIntensity: 3.2, roughness: 1 });
const windowCool = material.emissive({ color: "#ffffff", emissive: "#bcd4ff", emissiveIntensity: 2.4, roughness: 1 });
const frameMat = material.pbr({ color: "#0f0b09", roughness: 0.8 });

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */
const R = 5.8;
const CAM_Y = 1.95;
const TARGET: [number, number, number] = [0, 1.35, 0];
const poseAt = (deg: number): { position: [number, number, number]; target: [number, number, number] } => {
  const a = (deg * Math.PI) / 180;
  return { position: [R * Math.sin(a), CAM_Y, R * Math.cos(a)], target: TARGET };
};

const window3 = (name: string, x: number, mat: typeof windowGlow) => [
  primitives.plane({ name: `${name}-pane`, size: [1.5, 1, 3.2], material: mat, castShadow: false, receiveShadow: false })
    .rotate(Math.PI / 2, 0, 0).position(x, 3.3, -5.44),
  primitives.box({ name: `${name}-bar-h`, size: [1.6, 0.06, 0.05], material: frameMat, castShadow: false }).position(x, 3.3, -5.42),
  primitives.box({ name: `${name}-bar-v`, size: [0.06, 3.3, 0.05], material: frameMat, castShadow: false }).position(x, 3.3, -5.42),
  primitives.box({ name: `${name}-sill`, size: [1.8, 0.1, 0.16], material: frameMat, castShadow: false }).position(x, 1.62, -5.4)
];

let sc = scene({ background: "#060403" })
  .camera(camera.perspective({ position: poseAt(0).position, target: TARGET, fov: 38, near: 0.3, far: 60 }))
  // dark warm room fill, then a code-generated room probe with bright lamps/windows for reflections
  .add(environments.studio({ preset: "softbox", intensity: 0.5, diffuseIntensity: 0.12, specularIntensity: 0.95, color: "#ffe6c8", background: false }))
  .add(lights.hemisphere({ skyColor: "#3a2a20", groundColor: "#120c08", intensity: 0.35 }))
  // warm key spotlight, above and in front
  .add(
    lights.spot({
      name: "key",
      position: [1.0, 5.4, 3.4],
      target: [0, 1.1, 0],
      angle: 0.46,
      penumbra: 0.9,
      distance: 16,
      intensity: 60,
      color: "#ffd5a0",
      shadow: { mapSize: 2048, filter: "pcf", softness: 2, bias: -0.0004, normalBias: 0.02 }
    })
  )
  // faint cool fill from the left and a subtle rim from behind
  .add(lights.directional({ name: "fill", position: [-5, 2.6, 4], target: [0, 1.4, 0], intensity: 0.35, color: "#7f9cff" }))
  .add(lights.directional({ name: "rim", position: [-2.5, 3.6, -4.5], target: [0, 1.5, 0], intensity: 1.1, color: "#cfdcff" }))
  .add(effects.bloom({ intensity: 0.3, threshold: 0.9, radius: 0.5 }))
  // gallery room
  .add(primitives.plane({ name: "floor", size: [14, 1, 14], material: floorMat }).position(0, 0, 1))
  .add(primitives.plane({ name: "back-wall", size: [14, 1, 7], material: wallMat }).rotate(Math.PI / 2, 0, 0).position(0, 3.5, -5.5))
  .add(primitives.plane({ name: "wall-right", size: [7, 1, 13], material: wallMat }).rotate(0, 0, Math.PI / 2).position(6, 3.5, 1))
  .add(primitives.plane({ name: "wall-left", size: [7, 1, 13], material: wallMat }).rotate(0, 0, -Math.PI / 2).position(-6, 3.5, 1));
for (const n of [...window3("win-a", -3.6, windowGlow), ...window3("win-b", 3.6, windowCool)]) sc = sc.add(n);

// stepped marble pedestal
sc = sc
  .add(primitives.box({ name: "step-1", size: [2.4, 0.16, 2.4], material: marble(1, 1, 0, 0) }).position(0, 0.08, 0))
  .add(primitives.box({ name: "step-2", size: [1.9, 0.16, 1.9], material: marble(0.8, 0.8, 0.31, 0.12) }).position(0, 0.24, 0))
  .add(primitives.box({ name: "column", size: [1.4, 1.0, 1.4], material: marble(0.6, 0.7, 0.5, 0.2) }).position(0, 0.82, 0))
  .add(primitives.box({ name: "cap", size: [1.6, 0.12, 1.6], material: marble(0.9, 0.9, 0.7, 0.55) }).position(0, 1.38, 0))
  // black polished stone base with a thin gold plate
  .add(primitives.box({ name: "plinth-low", size: [0.78, 0.06, 0.78], material: darkstone }).position(0, 1.47, 0))
  .add(primitives.box({ name: "plinth-up", size: [0.62, 0.12, 0.62], material: darkstone }).position(0, 1.56, 0))
  .add(primitives.box({ name: "plate", size: [0.34, 0.065, 0.01], material: gold }).position(0, 1.555, 0.315))
  .add(primitives.box({ name: "plate-line-a", size: [0.26, 0.008, 0.004], material: darkGold }).position(0, 1.572, 0.322))
  .add(primitives.box({ name: "plate-line-b", size: [0.18, 0.008, 0.004], material: darkGold }).position(0, 1.552, 0.322))
  .add(primitives.box({ name: "plate-line-c", size: [0.22, 0.008, 0.004], material: darkGold }).position(0, 1.532, 0.322))
  // gold trophy
  .add(geometry.custom(bodyGeo, { name: "trophy-body", material: gold }))
  .add(geometry.custom(handleR, { name: "handle-right", material: gold }))
  .add(geometry.custom(handleL, { name: "handle-left", material: gold }))
  .add(geometry.custom(filletGeo, { name: "band-fillets", material: gold }))
  .add(geometry.custom(bandGeo, { name: "engraved-band", material: darkGold }))
  .add(geometry.custom(stemRingGeo, { name: "stem-ring", material: darkGold }));

const app = createAuraApp("#app", { scene: sc });

const AMPLITUDE_DEG = 15;
const PERIOD = 24;
let clock = 0;
let first = true;
const state = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: 0 };
window.__TASK_STATE__ = state;

const update = (): void => {
  const az = AMPLITUDE_DEG * Math.sin((clock / PERIOD) * TAU);
  state.cameraAzimuthDeg = az;
  window.__TASK_STATE__ = { materials: state.materials, cameraAzimuthDeg: az };
  app.camera?.setPose(poseAt(az));
};

app.onFrame((f) => {
  clock += f.dt;
  update();
  if (first) {
    first = false;
    window.__EVAL_READY__ = true;
  }
});

await app.ready();
update();
