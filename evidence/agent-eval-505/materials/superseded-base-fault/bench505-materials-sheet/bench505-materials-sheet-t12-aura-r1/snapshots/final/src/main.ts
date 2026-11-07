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
  scene
} from "@aura3d/engine";

declare global {
  interface Window {
    __EVAL_READY__?: boolean;
    __TASK_STATE__?: { materials: string[]; cameraAzimuthDeg: number };
  }
}

type V3 = [number, number, number];
type P2 = [number, number];

/* ---------------------------------------------------------------- noise */

const hash3 = (x: number, y: number, z: number): number => {
  let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0;
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
};
const fade = (t: number): number => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const clamp01 = (v: number): number => Math.min(1, Math.max(0, v));
const smoothstep = (a: number, b: number, v: number): number => fade(clamp01((v - a) / (b - a)));

const vnoise = (x: number, y: number, z: number): number => {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const fx = fade(x - xi), fy = fade(y - yi), fz = fade(z - zi);
  const c = (dx: number, dy: number, dz: number): number => hash3(xi + dx, yi + dy, zi + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), fx), lerp(c(0, 1, 0), c(1, 1, 0), fx), fy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), fx), lerp(c(0, 1, 1), c(1, 1, 1), fx), fy),
    fz
  );
};
const fbm = (x: number, y: number, z: number, octaves: number): number => {
  let sum = 0, amp = 0.5, freq = 1, norm = 0;
  for (let o = 0; o < octaves; o += 1) {
    sum += amp * vnoise(x * freq + o * 17.3, y * freq - o * 9.1, z * freq + o * 5.7);
    norm += amp;
    amp *= 0.5;
    freq *= 2.03;
  }
  return sum / norm;
};

/** Carrara-style marble: warped stripes (thin and broad veins) over a cloudy white base. */
const marble = (x: number, y: number, z: number): [number, number, number] => {
  const cloud = fbm(x * 1.5 + 3, y * 1.5, z * 1.5, 4);
  const warp1 = (fbm(x * 2.2, y * 2.2 + 4, z * 2.2, 5) - 0.5) * 2 * 2.6;
  const warp2 = (fbm(x * 4.1 + 9, y * 4.1, z * 4.1 - 5, 4) - 0.5) * 2 * 3.2;
  const s1 = Math.sin((x * 1.1 + y * 0.7 + z * 0.9) * 3.2 + warp1 * 2.4);
  const s2 = Math.sin((-x * 0.6 + y * 1.4 + z * 0.5) * 6.5 + warp2 * 2.2);
  const s3 = Math.sin((x * 0.4 - y * 0.3 + z * 1.3) * 11 + warp2 * 3.0);
  const thin = Math.pow(1 - Math.abs(s1), 14);
  const broad = Math.pow(1 - Math.abs(s2), 30) * 0.65;
  const hair = Math.pow(1 - Math.abs(s3), 40) * 0.35;
  const mask = 0.3 + 0.7 * smoothstep(0.35, 0.65, fbm(x * 0.9 + 20, y * 0.9, z * 0.9 + 7, 3));
  const vein = clamp01((thin * 0.8 + broad + hair) * mask);
  const base = 0.92 - 0.07 * cloud;
  const grey = 0.4 + 0.14 * cloud;
  const c = lerp(base, grey, vein);
  return [clamp01(c + 0.012), clamp01(c + 0.004), clamp01(c - 0.014)];
};

/* ----------------------------------------------------------- mesh builder */

class MeshBuilder {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];
  idx: number[] = [];
  withColor = false;

  vert(p: V3, n: V3, c?: [number, number, number]): number {
    const i = this.pos.length / 3;
    this.pos.push(p[0], p[1], p[2]);
    this.nor.push(n[0], n[1], n[2]);
    if (c) {
      this.withColor = true;
      this.col.push(c[0], c[1], c[2], 1);
    }
    return i;
  }

  /** Adds a triangle, flipping its winding to agree with the vertex normals. */
  tri(a: number, b: number, c: number): void {
    const P = (i: number): V3 => [this.pos[i * 3]!, this.pos[i * 3 + 1]!, this.pos[i * 3 + 2]!];
    const N = (i: number): V3 => [this.nor[i * 3]!, this.nor[i * 3 + 1]!, this.nor[i * 3 + 2]!];
    const pa = P(a), pb = P(b), pc = P(c);
    const u: V3 = [pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]];
    const w: V3 = [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]];
    const cr: V3 = [u[1] * w[2] - u[2] * w[1], u[2] * w[0] - u[0] * w[2], u[0] * w[1] - u[1] * w[0]];
    if (Math.hypot(cr[0], cr[1], cr[2]) < 1e-12) return;
    const na = N(a), nb = N(b), nc = N(c);
    const d = cr[0] * (na[0] + nb[0] + nc[0]) + cr[1] * (na[1] + nb[1] + nc[1]) + cr[2] * (na[2] + nb[2] + nc[2]);
    if (d >= 0) this.idx.push(a, b, c);
    else this.idx.push(a, c, b);
  }

  toSpec() {
    let mnx = Infinity, mny = Infinity, mnz = Infinity, mxx = -Infinity, mxy = -Infinity, mxz = -Infinity;
    for (let i = 0; i < this.pos.length; i += 3) {
      mnx = Math.min(mnx, this.pos[i]!); mxx = Math.max(mxx, this.pos[i]!);
      mny = Math.min(mny, this.pos[i + 1]!); mxy = Math.max(mxy, this.pos[i + 1]!);
      mnz = Math.min(mnz, this.pos[i + 2]!); mxz = Math.max(mxz, this.pos[i + 2]!);
    }
    const bounds = { min: [mnx, mny, mnz] as V3, max: [mxx, mxy, mxz] as V3 };
    const positions = new Float32Array(this.pos);
    const normals = new Float32Array(this.nor);
    if (this.withColor) {
      return geometry.define({ positions, normals, colors: new Float32Array(this.col), indices: this.idx, bounds });
    }
    return geometry.define({ positions, normals, indices: this.idx, bounds });
  }
}

/* ------------------------------------------------------------ marble boxes */

const STEP = 0.025;

const addMarbleFace = (m: MeshBuilder, o: V3, U: V3, V: V3, n: V3): void => {
  const nu = Math.max(1, Math.ceil(Math.hypot(...U) / STEP));
  const nv = Math.max(1, Math.ceil(Math.hypot(...V) / STEP));
  const base = m.pos.length / 3;
  for (let j = 0; j <= nv; j += 1) {
    for (let i = 0; i <= nu; i += 1) {
      const s = i / nu, t = j / nv;
      const p: V3 = [o[0] + U[0] * s + V[0] * t, o[1] + U[1] * s + V[1] * t, o[2] + U[2] * s + V[2] * t];
      m.vert(p, n, marble(p[0], p[1], p[2]));
    }
  }
  for (let j = 0; j < nv; j += 1) {
    for (let i = 0; i < nu; i += 1) {
      const a = base + j * (nu + 1) + i, b = a + 1, c = a + nu + 1, d = c + 1;
      m.tri(a, c, b);
      m.tri(b, c, d);
    }
  }
};

/** Marble box without a bottom face. */
const addMarbleBox = (m: MeshBuilder, cx: number, cy: number, cz: number, sx: number, sy: number, sz: number): void => {
  const hx = sx / 2, hy = sy / 2, hz = sz / 2;
  addMarbleFace(m, [cx - hx, cy + hy, cz - hz], [sx, 0, 0], [0, 0, sz], [0, 1, 0]);
  addMarbleFace(m, [cx - hx, cy - hy, cz + hz], [sx, 0, 0], [0, sy, 0], [0, 0, 1]);
  addMarbleFace(m, [cx - hx, cy - hy, cz - hz], [sx, 0, 0], [0, sy, 0], [0, 0, -1]);
  addMarbleFace(m, [cx + hx, cy - hy, cz - hz], [0, 0, sz], [0, sy, 0], [1, 0, 0]);
  addMarbleFace(m, [cx - hx, cy - hy, cz - hz], [0, 0, sz], [0, sy, 0], [-1, 0, 0]);
};

/* ------------------------------------------------------------ lathe / tube */

const catmull = (pts: P2[], sub: number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < pts.length - 1; i += 1) {
    const p0 = pts[Math.max(0, i - 1)]!, p1 = pts[i]!, p2 = pts[i + 1]!, p3 = pts[Math.min(pts.length - 1, i + 2)]!;
    for (let k = 0; k < sub; k += 1) {
      const t = k / sub, t2 = t * t, t3 = t2 * t;
      const f = (a: number, b: number, c: number, d: number): number =>
        0.5 * (2 * b + (-a + c) * t + (2 * a - 5 * b + 4 * c - d) * t2 + (-a + 3 * b - 3 * c + d) * t3);
      out.push([f(p0[0], p1[0], p2[0], p3[0]), f(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  out.push(pts[pts.length - 1]!);
  return out;
};

/** Revolves a (radius, height) chain around Y with smooth normals. */
const addLathe = (m: MeshBuilder, chain: P2[], seg: number, scale: number, offset: V3): void => {
  const n = chain.length;
  const segN = (i: number): P2 => {
    const dr = chain[i + 1]![0] - chain[i]![0], dy = chain[i + 1]![1] - chain[i]![1];
    const l = Math.hypot(dr, dy) || 1;
    return [dy / l, -dr / l];
  };
  const base = m.pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    const a = i > 0 ? segN(i - 1) : undefined, b = i < n - 1 ? segN(i) : undefined;
    let nr = (a?.[0] ?? 0) + (b?.[0] ?? 0), ny = (a?.[1] ?? 0) + (b?.[1] ?? 0);
    const r = chain[i]![0], y = chain[i]![1];
    if (r < 1e-6) nr = 0;
    const l = Math.hypot(nr, ny) || 1;
    nr /= l; ny /= l;
    for (let j = 0; j <= seg; j += 1) {
      const th = (j / seg) * Math.PI * 2, c = Math.cos(th), s = Math.sin(th);
      m.vert([offset[0] + r * c * scale, offset[1] + y * scale, offset[2] + r * s * scale], [nr * c, ny, nr * s]);
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const a = base + i * (seg + 1) + j, b = a + 1, c = a + seg + 1, d = c + 1;
      m.tri(a, c, b);
      m.tri(b, c, d);
    }
  }
};

/** Sweeps a circle along a planar (XY) path; used for the handles. */
const addTube = (m: MeshBuilder, path: P2[], radii: number[], seg: number, mirror: boolean, scale: number, offset: V3): void => {
  const n = path.length;
  const sx = mirror ? -1 : 1;
  const base = m.pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    const p0 = path[Math.max(0, i - 1)]!, p1 = path[Math.min(n - 1, i + 1)]!;
    const tx = p1[0] - p0[0], ty = p1[1] - p0[1];
    const tl = Math.hypot(tx, ty) || 1;
    const nx = -ty / tl, ny = tx / tl;
    for (let k = 0; k <= seg; k += 1) {
      const phi = (k / seg) * Math.PI * 2, cp = Math.cos(phi), sp = Math.sin(phi);
      const dx = cp * nx, dy = cp * ny, dz = sp;
      const r = radii[i]!;
      m.vert(
        [offset[0] + sx * (path[i]![0] + r * dx) * scale, offset[1] + (path[i]![1] + r * dy) * scale, offset[2] + r * dz * scale],
        [sx * dx, dy, dz]
      );
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let k = 0; k < seg; k += 1) {
      const a = base + i * (seg + 1) + k, b = a + 1, c = a + seg + 1, d = c + 1;
      m.tri(a, c, b);
      m.tri(b, c, d);
    }
  }
};

const bezier = (p0: P2, p1: P2, p2: P2, p3: P2, count: number): P2[] => {
  const out: P2[] = [];
  for (let i = 0; i < count; i += 1) {
    const t = i / (count - 1), u = 1 - t;
    const w0 = u * u * u, w1 = 3 * u * u * t, w2 = 3 * u * t * t, w3 = t * t * t;
    out.push([w0 * p0[0] + w1 * p1[0] + w2 * p2[0] + w3 * p3[0], w0 * p0[1] + w1 * p1[1] + w2 * p2[1] + w3 * p3[1]]);
  }
  return out;
};

/* -------------------------------------------------------------- materials */

const marbleMat = material.physical({ color: "#ffffff", metallic: 0, roughness: 0.2, clearcoat: 0.7, clearcoatRoughness: 0.06 });
const goldMat = material.pbr({ color: "#f3bd55", metallic: 1, roughness: 0.1 });
const darkGoldMat = material.pbr({ color: "#8d6620", metallic: 1, roughness: 0.46 });
const darkstoneMat = material.physical({ color: "#0c0c0f", metallic: 0.15, roughness: 0.12, clearcoat: 0.8, clearcoatRoughness: 0.05 });
const wallMat = material.pbr({ color: "#2a1f18", metallic: 0, roughness: 0.85 });
const floorMat = material.physical({ color: "#1d1611", metallic: 0, roughness: 0.28, clearcoat: 0.3, clearcoatRoughness: 0.2 });
const frameMat = material.pbr({ color: "#0b0908", metallic: 0, roughness: 0.7 });
const windowCool = material.emissive({ color: "#cfe0ff", emissive: "#cfe0ff", emissiveIntensity: 3.2 });
const windowWarm = material.emissive({ color: "#ffd9a0", emissive: "#ffc27a", emissiveIntensity: 3.6 });

/* ----------------------------------------------------------------- pedestal */

const PED_TOP = 1.52;

const pedestal = new MeshBuilder();
addMarbleBox(pedestal, 0, 0.1, 0, 2.2, 0.2, 2.2);
addMarbleBox(pedestal, 0, 0.3, 0, 1.8, 0.2, 1.8);
addMarbleBox(pedestal, 0, 0.9, 0, 1.3, 1.0, 1.3);
addMarbleBox(pedestal, 0, 1.46, 0, 1.6, 0.12, 1.6);

/* ------------------------------------------------------------------ trophy */

const S = 0.8; // trophy scale
const TY = PED_TOP + 0.22; // top of the dark stone base
const cupControl: P2[] = [
  [0.3, 0.0], [0.3, 0.03], [0.27, 0.07], [0.2, 0.1], [0.11, 0.14], [0.075, 0.2], [0.065, 0.3],
  [0.08, 0.36], [0.125, 0.42], [0.13, 0.45], [0.115, 0.49], [0.075, 0.54], [0.062, 0.6],
  [0.08, 0.66], [0.17, 0.74], [0.29, 0.84], [0.37, 0.97], [0.4, 1.1], [0.405, 1.2], [0.4, 1.27],
  [0.385, 1.285], [0.37, 1.27], [0.365, 1.2], [0.355, 1.08], [0.33, 0.96], [0.25, 0.84], [0.13, 0.76], [0.0, 0.74]
];
const cupChain = catmull(cupControl, 6);
const topIdx = cupChain.reduce((best, p, i) => (p[1] > cupChain[best]![1] ? i : best), 0);
const outer = cupChain.slice(0, topIdx + 1);

const radiusAt = (y: number): number => {
  for (let i = 0; i < outer.length - 1; i += 1) {
    const a = outer[i]!, b = outer[i + 1]!;
    if (y >= a[1] && y <= b[1] && b[1] > a[1]) return lerp(a[0], b[0], (y - a[1]) / (b[1] - a[1]));
  }
  return outer[outer.length - 1]![0];
};

/** A raised band that follows the outer profile between y0 and y1. */
const bandChain = (y0: number, y1: number, lift: number): P2[] => {
  const pts: P2[] = [[radiusAt(y0) - 0.004, y0], [radiusAt(y0) + lift, y0 + 0.004]];
  const steps = 8;
  for (let i = 0; i <= steps; i += 1) {
    const y = lerp(y0 + 0.004, y1 - 0.004, i / steps);
    pts.push([radiusAt(y) + lift, y]);
  }
  pts.push([radiusAt(y1) - 0.004, y1]);
  return pts;
};

const cup = new MeshBuilder();
addLathe(cup, [[0, 0], [0.3, 0]], 4, S, [0, TY, 0]); // flat underside
addLathe(cup, cupChain, 96, S, [0, TY, 0]);
const handles = new MeshBuilder();
{
  const path = bezier([0.28, 0.84], [0.72, 0.76], [0.68, 1.26], [0.4, 1.14], 32);
  const radii = path.map((_, i) => {
    const t = i / (path.length - 1);
    return 0.026 + 0.012 * Math.pow(Math.abs(t - 0.5) * 2, 2) + 0.006 * Math.sin(t * Math.PI);
  });
  addTube(handles, path, radii, 20, false, S, [0, TY, 0]);
  addTube(handles, path, radii, 20, true, S, [0, TY, 0]);
}
const bands = new MeshBuilder();
addLathe(bands, bandChain(0.99, 1.08, 0.01), 96, S, [0, TY, 0]);
addLathe(bands, bandChain(0.035, 0.07, 0.008), 96, S, [0, TY, 0]);
addLathe(bands, bandChain(0.425, 0.455, 0.008), 64, S, [0, TY, 0]);

/* -------------------------------------------------------------------- room */

const ROOM_W = 20, ROOM_H = 9, ROOM_Z0 = -8, ROOM_Z1 = 9;
const roomDepth = ROOM_Z1 - ROOM_Z0, roomMidZ = (ROOM_Z0 + ROOM_Z1) / 2;

const windowWithFrame = (id: string, mat: typeof windowCool, x: number, y: number, z: number, w: number, h: number, axis: "z" | "x") => {
  const size: V3 = axis === "z" ? [w, h, 0.05] : [0.05, h, w];
  const bar = (bw: number, bh: number, dx: number, dy: number, n: string) => {
    const bs: V3 = axis === "z" ? [bw, bh, 0.08] : [0.08, bh, bw];
    const bp: V3 = axis === "z" ? [x + dx, y + dy, z + 0.01] : [x - 0.01, y + dy, z + dx];
    return primitives.box({ name: `${id}-${n}`, size: bs, material: frameMat, castShadow: false }).position(bp[0], bp[1], bp[2]);
  };
  return [
    primitives.box({ name: id, size, material: mat, castShadow: false }).position(x, y, z),
    bar(0.06, h, 0, 0, "mv"),
    bar(w, 0.06, 0, h * 0.18, "mh1"),
    bar(w, 0.06, 0, -h * 0.22, "mh2")
  ];
};

/* ------------------------------------------------------------------- scene */

const TARGET: V3 = [0, 1.45, 0];
const CAM_DIST = 6.1;
const CAM_Y = 2.0;

const stageKids: Parameters<typeof group>[1] = [
  geometry.custom(pedestal.toSpec(), { name: "pedestal-marble", material: marbleMat, castShadow: true, receiveShadow: true }),
  primitives.box({ name: "base-lower", size: [0.95, 0.12, 0.95], material: darkstoneMat }).position(0, PED_TOP + 0.06, 0),
  primitives.box({ name: "base-upper", size: [0.72, 0.1, 0.72], material: darkstoneMat }).position(0, PED_TOP + 0.17, 0),
  primitives.box({ name: "plate", size: [0.52, 0.075, 0.014], material: goldMat }).position(0, PED_TOP + 0.06, 0.4757),
  primitives.box({ name: "plate-line-1", size: [0.36, 0.01, 0.006], material: darkGoldMat }).position(0, PED_TOP + 0.075, 0.4835),
  primitives.box({ name: "plate-line-2", size: [0.26, 0.01, 0.006], material: darkGoldMat }).position(0, PED_TOP + 0.048, 0.4835),
  geometry.custom(cup.toSpec(), { name: "trophy-cup", material: goldMat }),
  geometry.custom(handles.toSpec(), { name: "trophy-handles", material: goldMat }),
  geometry.custom(bands.toSpec(), { name: "trophy-bands", material: darkGoldMat })
];

let sc = scene({ background: "#0a0706" })
  .camera(camera.perspective({ position: [0, CAM_Y, CAM_DIST], target: TARGET, fov: 38, near: 0.2, far: 60 }))
  // procedural environment: probe captured from the room geometry below (dark walls, bright windows and lamps)
  .add(environments.capture({ name: "gallery-env", position: [0, 3.3, 0.6], resolution: 256, update: "once", intensity: 1.1, background: false }))
  .add(lights.hemisphere({ skyColor: "#3b2e24", groundColor: "#120d0a", intensity: 0.3 }))
  // warm key spotlight from above and in front
  .add(
    lights.spot({
      name: "key-spot",
      position: [1.3, 5.6, 4.6],
      target: [0, 1.5, 0],
      angle: 0.4,
      penumbra: 0.85,
      distance: 26,
      decay: 2,
      intensity: 105,
      color: "#ffd9a6",
      shadow: true
    })
  )
  // faint cool fill and subtle rim
  .add(lights.directional({ name: "fill", position: [-6, 2.5, 5], target: [0, 1.5, 0], intensity: 0.35, color: "#7d9ad6" }))
  .add(lights.directional({ name: "rim", position: [-3.5, 4, -6], target: [0, 1.7, 0], intensity: 1.1, color: "#a9c3ff" }))
  .add(effects.bloom({ intensity: 0.3, threshold: 0.9, radius: 0.5 }))
  // room shell
  .add(primitives.plane({ name: "floor", size: [ROOM_W, 1, roomDepth], material: floorMat, castShadow: false }).position(0, 0, roomMidZ))
  .add(primitives.box({ name: "wall-back", size: [ROOM_W, ROOM_H, 0.4], material: wallMat }).position(0, ROOM_H / 2, ROOM_Z0 - 0.2))
  .add(primitives.box({ name: "wall-front", size: [ROOM_W, ROOM_H, 0.4], material: wallMat }).position(0, ROOM_H / 2, ROOM_Z1 + 0.2))
  .add(primitives.box({ name: "wall-left", size: [0.4, ROOM_H, roomDepth], material: wallMat }).position(-ROOM_W / 2 - 0.2, ROOM_H / 2, roomMidZ))
  .add(primitives.box({ name: "wall-right", size: [0.4, ROOM_H, roomDepth], material: wallMat }).position(ROOM_W / 2 + 0.2, ROOM_H / 2, roomMidZ))
  .add(primitives.box({ name: "ceiling", size: [ROOM_W, 0.4, roomDepth], material: wallMat, castShadow: false }).position(0, ROOM_H + 0.2, roomMidZ));

// bright windows and lamps (visible at the back, on the sides and behind the camera for gold reflections)
const windows = [
  ...windowWithFrame("win-back-l", windowCool, -4.6, 4.3, ROOM_Z0 + 0.03, 1.7, 4.6, "z"),
  ...windowWithFrame("win-back-r", windowCool, 4.6, 4.3, ROOM_Z0 + 0.03, 1.7, 4.6, "z"),
  ...windowWithFrame("win-left-1", windowCool, -ROOM_W / 2 + 0.03, 4.0, -2.5, 1.8, 4.2, "x"),
  ...windowWithFrame("win-left-2", windowCool, -ROOM_W / 2 + 0.03, 4.0, 3.5, 1.8, 4.2, "x"),
  ...windowWithFrame("win-right-1", windowWarm, ROOM_W / 2 - 0.03, 4.0, -1.5, 1.8, 4.2, "x"),
  ...windowWithFrame("win-front-big", windowCool, -2.5, 4.8, ROOM_Z1 - 0.03, 4.2, 3.2, "z"),
  ...windowWithFrame("win-front-warm", windowWarm, 5, 4.2, ROOM_Z1 - 0.03, 2.2, 3.4, "z")
];
for (const w of windows) sc = sc.add(w);
for (const [i, x] of [-6, 6].entries()) {
  sc = sc.add(primitives.sphere({ name: `lamp-${i}`, size: 0.5, material: windowWarm, castShadow: false }).position(x, 7.6, -1));
}

sc = sc.add(group("stage", stageKids).runtime({ id: "stage", mutable: true }));

const app = createAuraApp("#app", { scene: sc });

/* ------------------------------------------------------------- animation */

type PoseCamera = { setPose?: (pose: { position: V3; target: V3 }) => unknown };
const cam = app.camera as unknown as PoseCamera | undefined;
let cameraWorks = typeof cam?.setPose === "function";

const state = { materials: ["marble", "gold", "darkstone"], cameraAzimuthDeg: 0 };
window.__TASK_STATE__ = state;

let t = 0;
const AMPLITUDE_DEG = 15;

const apply = (azDeg: number): void => {
  const az = (azDeg * Math.PI) / 180;
  if (cameraWorks) {
    try {
      cam!.setPose!({ position: [TARGET[0] + Math.sin(az) * CAM_DIST, CAM_Y, TARGET[2] + Math.cos(az) * CAM_DIST], target: TARGET });
      return;
    } catch {
      cameraWorks = false;
    }
  }
  // fallback: turn the pedestal and trophy instead of the camera
  app.nodes.require("stage").setRotation(0, -az, 0);
};

app.onFrame((f: { dt: number }) => {
  t += f.dt;
  const az = AMPLITUDE_DEG * Math.sin(t * 0.32);
  apply(az);
  state.cameraAzimuthDeg = az;
  window.__TASK_STATE__ = state;
});

await app.ready();
requestAnimationFrame(() => {
  window.__EVAL_READY__ = true;
});
