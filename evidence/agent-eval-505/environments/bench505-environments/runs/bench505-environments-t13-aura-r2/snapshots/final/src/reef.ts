import { MeshBuilder, add, enc, makeRng, mul, norm, type V3 } from "./mesh";

export const SAND_SIZE = 64;
const TAU = Math.PI * 2;

const ripplePhase = (x: number, z: number): number => (x * 0.8 + z * 0.35 + 1.4 * Math.sin(z * 0.21 + x * 0.05)) * 4.4;

/** Seabed height: broad dunes plus parallel sand ripples. */
export const groundY = (x: number, z: number): number => {
  const dune = 0.32 * Math.sin(x * 0.11 + 0.7) * Math.cos(z * 0.09) + 0.2 * Math.sin((x + z) * 0.07 + 2);
  return dune + 0.05 * Math.sin(ripplePhase(x, z));
};

export const buildSand = () => {
  const b = new MeshBuilder();
  const cells = 220;
  b.surface(
    (u, v) => {
      const x = (u - 0.5) * SAND_SIZE;
      const z = (v - 0.5) * SAND_SIZE;
      return [x, groundY(x, z), z];
    },
    cells,
    cells,
    (_u, _v, p) => [enc(0.11, 0.3), 0.8 + 0.07 * Math.sin(ripplePhase(p[0], p[2])) + 0.03 * Math.sin(p[0] * 0.5 + p[2] * 0.3)],
    [0, -200, 0]
  );
  return b.build({ min: [-SAND_SIZE / 2, -2, -SAND_SIZE / 2], max: [SAND_SIZE / 2, 2, SAND_SIZE / 2] });
};

const rnd = (r: () => number, a: number, c: number): number => a + (c - a) * r();

/** Staghorn-style branching coral: a few stems that fork three times. */
const branching = (b: MeshBuilder, r: () => number, cx: number, cz: number, size: number, hue: number, sat: number): void => {
  const uvx = enc(hue, sat);
  const grow = (start: V3, dir: V3, length: number, rad: number, depth: number): void => {
    const pts: V3[] = [start];
    let p = start;
    let d = dir;
    for (let k = 0; k < 3; k += 1) {
      d = norm(add(d, [(r() - 0.5) * 0.3, 0.14, (r() - 0.5) * 0.3]));
      p = add(p, mul(d, length / 3));
      pts.push(p);
    }
    b.tube(pts, (t) => rad * (1 - 0.5 * t), 6, uvx, (t) => 0.6 + 0.4 * t + (depth === 0 ? 0.08 : 0));
    if (depth <= 0) return;
    const kids = depth >= 2 ? 3 : 2;
    for (let k = 0; k < kids; k += 1) {
      let nd = norm(add(d, [(r() - 0.5) * 1.5, r() * 0.3, (r() - 0.5) * 1.5]));
      if (nd[1] < 0.25) nd = norm([nd[0], 0.25, nd[2]]);
      grow(p, nd, length * 0.74, rad * 0.66, depth - 1);
    }
  };
  const base: V3 = [cx, groundY(cx, cz) - 0.08, cz];
  const stems = 4;
  for (let s = 0; s < stems; s += 1) {
    const a = (s / stems) * TAU + r();
    grow(base, norm([Math.cos(a) * 0.55, 1, Math.sin(a) * 0.55]), 0.55 * size, 0.1 * size, 3);
  }
};

/** Rounded brain coral: a dome with a labyrinth of grooves. */
const brain = (b: MeshBuilder, cx: number, cz: number, radius: number, hue: number, sat: number): void => {
  const cy = groundY(cx, cz) + radius * 0.05;
  const uvx = enc(hue, sat);
  const groove = (dx: number, dz: number): number => Math.sin(dx * 17 + 2.2 * Math.sin(dz * 11 + 1)) * Math.sin(dz * 17 + 2.2 * Math.sin(dx * 9));
  b.surface(
    (u, v) => {
      const th = u * TAU;
      const ph = v * (Math.PI / 2) * 1.15;
      const dx = Math.sin(ph) * Math.cos(th);
      const dz = Math.sin(ph) * Math.sin(th);
      const dy = Math.cos(ph);
      const g = groove(dx, dz);
      const rr = radius * (1.03 - 0.07 * Math.exp(-g * g * 18));
      return [cx + dx * rr, cy + dy * rr * 0.72, cz + dz * rr];
    },
    104,
    44,
    (u, v) => {
      const th = u * TAU;
      const ph = v * (Math.PI / 2) * 1.15;
      const g = groove(Math.sin(ph) * Math.cos(th), Math.sin(ph) * Math.sin(th));
      return [uvx, 0.4 + 0.55 * (1 - Math.exp(-g * g * 18))];
    },
    [cx, cy - 0.2, cz]
  );
};

/** Gorgonian sea fan: curved spokes joined by thin cross links, standing on a short stem. */
const seaFan = (b: MeshBuilder, cx: number, cz: number, height: number, yaw: number, hue: number, sat: number): void => {
  const uvx = enc(hue, sat);
  const base: V3 = [cx, groundY(cx, cz) - 0.05, cz];
  const side: V3 = [Math.cos(yaw), 0, -Math.sin(yaw)];
  const depthDir: V3 = [Math.sin(yaw), 0, Math.cos(yaw)];
  const stemTop = add(base, [0, height * 0.22, 0]);
  b.tube([base, add(base, [0, height * 0.12, 0]), stemTop], () => 0.045, 6, uvx, () => 0.55);
  const spokes = 15;
  const spokePoint = (k: number, s: number): V3 => {
    const phi = ((k / (spokes - 1)) - 0.5) * 2 * 1.0;
    const reach = height * 0.78 * s;
    const bend = 0.12 * Math.sin(s * 3 + k * 0.7) + 0.18 * s * s;
    return add(add(stemTop, mul(side, Math.sin(phi) * reach)), add([0, Math.cos(phi) * reach * 0.9, 0], mul(depthDir, bend)));
  };
  const steps = [0, 0.25, 0.5, 0.75, 1];
  for (let k = 0; k < spokes; k += 1) {
    b.tube(steps.map((s) => spokePoint(k, s)), (t) => 0.026 * (1 - 0.55 * t), 4, uvx, (t) => 0.62 + 0.35 * t);
  }
  for (const s of [0.4, 0.6, 0.8, 0.95]) {
    for (let k = 0; k < spokes - 1; k += 1) {
      b.tube([spokePoint(k, s), spokePoint(k + 1, s)], () => 0.011, 4, uvx, () => 0.85);
    }
  }
};

/** Organ-pipe tube coral: a cluster of open tubes. */
const tubes = (b: MeshBuilder, r: () => number, cx: number, cz: number, size: number, hue: number, sat: number): void => {
  const uvx = enc(hue, sat);
  const count = 8;
  for (let i = 0; i < count; i += 1) {
    const a = r() * TAU;
    const off = rnd(r, 0.05, 0.42) * size;
    const x = cx + Math.cos(a) * off;
    const z = cz + Math.sin(a) * off;
    const h = rnd(r, 0.5, 1.15) * size;
    const lean: V3 = [(r() - 0.5) * 0.25 * h, 0, (r() - 0.5) * 0.25 * h];
    const y0 = groundY(x, z) - 0.1;
    const rad = rnd(r, 0.085, 0.13) * size;
    const path: V3[] = [0, 1, 2, 3].map((k) => [x + lean[0] * (k / 3), y0 + (h * k) / 3, z + lean[2] * (k / 3)] as V3);
    b.tube(path, (t) => rad * (1 - 0.25 * t), 10, uvx, (t) => 0.55 + 0.4 * t);
    const top = path[3] as V3;
    b.disc([top[0], top[1] - 0.04, top[2]], rad * 0.72, 10, uvx, 0.12);
  }
};

/** Table coral: a wide, ridged plate on a stalk. */
const table = (b: MeshBuilder, cx: number, cz: number, radius: number, height: number, hue: number, sat: number): void => {
  const uvx = enc(hue, sat);
  const y0 = groundY(cx, cz) - 0.1;
  b.tube([[cx, y0, cz], [cx, y0 + height * 0.5, cz], [cx, y0 + height, cz]], (t) => 0.14 - 0.05 * t, 8, uvx, () => 0.5);
  b.surface(
    (u, v) => {
      const th = u * TAU;
      const rr = v * radius * (1 + 0.09 * Math.sin(7 * th + 1) + 0.05 * Math.sin(13 * th));
      const y = y0 + height + 0.06 * Math.sin(rr * 6) - 0.28 * v * v + 0.05 * Math.sin(th * 3) * v;
      return [cx + Math.cos(th) * rr, y, cz + Math.sin(th) * rr];
    },
    72,
    22,
    (_u, v) => [uvx, 0.6 + 0.3 * (0.5 + 0.5 * Math.sin(v * 30))]
  );
};

const rock = (b: MeshBuilder, r: () => number, cx: number, cz: number, radius: number): void => {
  const seed = r() * 10;
  const uvx = enc(0.09 + r() * 0.04, 0.2);
  const y0 = groundY(cx, cz);
  const shade = 0.35 + r() * 0.2;
  b.surface(
    (u, v) => {
      const th = u * TAU;
      const ph = v * Math.PI;
      const lump = 1 + 0.2 * Math.sin(3 * th + seed) * Math.sin(2 * ph + seed * 0.5) + 0.1 * Math.sin(7 * th + 4 * ph + seed);
      const rr = radius * lump;
      return [cx + Math.sin(ph) * Math.cos(th) * rr * 1.25, y0 + Math.cos(ph) * rr * 0.62, cz + Math.sin(ph) * Math.sin(th) * rr];
    },
    28,
    16,
    (_u, v) => [uvx, shade + 0.25 * (1 - v)],
    [cx, y0 - 0.1, cz]
  );
};

export const buildReef = () => {
  const b = new MeshBuilder();
  const r = makeRng(7331);
  // rocks first so the colonies sit on top of them
  for (let i = 0; i < 16; i += 1) {
    const a = r() * TAU;
    const d = rnd(r, 2.5, 11);
    rock(b, r, Math.cos(a) * d, Math.sin(a) * d, rnd(r, 0.25, 0.85));
  }
  rock(b, r, 0.0, 0.3, 1.1);
  rock(b, r, -3.3, -0.4, 0.8);
  rock(b, r, 3.8, 0.6, 0.9);

  branching(b, r, -1.9, 1.4, 1.35, 0.04, 0.75);
  branching(b, r, 2.9, -2.0, 1.1, 0.93, 0.55);
  branching(b, r, -4.0, -2.4, 1.3, 0.76, 0.5);
  branching(b, r, 1.0, 4.2, 1.0, 0.1, 0.8);
  brain(b, 1.3, 1.8, 0.95, 0.19, 0.6);
  brain(b, -2.9, 3.1, 0.65, 0.02, 0.5);
  brain(b, 4.6, 2.4, 0.55, 0.45, 0.45);
  seaFan(b, 3.6, 1.0, 1.7, 0.5, 0.82, 0.6);
  seaFan(b, -0.3, -3.3, 1.45, -0.4, 0.0, 0.8);
  seaFan(b, -4.6, 0.8, 1.3, 1.2, 0.07, 0.75);
  tubes(b, r, 0.3, -0.6, 1.0, 0.13, 0.85);
  tubes(b, r, 4.8, -0.9, 0.9, 0.6, 0.6);
  tubes(b, r, -3.2, 4.4, 1.0, 0.92, 0.55);
  table(b, 0.8, -2.0, 1.2, 0.75, 0.5, 0.55);
  table(b, -1.2, -5.0, 0.9, 0.55, 0.28, 0.5);
  return b.build({ min: [-30, -2, -30], max: [30, 6, 30] });
};

/** Swaying blades of seaweed. Brightness channel (uv.y) holds the height fraction the shader sways by. */
export const buildSeaweed = () => {
  const b = new MeshBuilder();
  const r = makeRng(99);
  const clumps: Array<[number, number]> = [];
  for (let i = 0; i < 22; i += 1) {
    const a = r() * TAU;
    const d = rnd(r, 2.2, 9.5);
    clumps.push([Math.cos(a) * d, Math.sin(a) * d]);
  }
  for (const [cx, cz] of clumps) {
    const kelp = r() < 0.4;
    const hue = kelp ? rnd(r, 0.09, 0.13) : rnd(r, 0.24, 0.36);
    const uvx = enc(hue, kelp ? 0.7 : 0.75);
    const blades = kelp ? 4 : 8;
    for (let k = 0; k < blades; k += 1) {
      const x = cx + (r() - 0.5) * 0.7;
      const z = cz + (r() - 0.5) * 0.7;
      const y0 = groundY(x, z) - 0.05;
      const h = kelp ? rnd(r, 1.6, 2.7) : rnd(r, 0.8, 1.7);
      const w = kelp ? rnd(r, 0.13, 0.2) : rnd(r, 0.045, 0.08);
      const ang = r() * TAU;
      const lean: V3 = [Math.cos(r() * TAU) * 0.25 * h, 0, Math.sin(r() * TAU) * 0.25 * h];
      const wph = r() * TAU;
      b.surface(
        (u, v) => {
          const wob = 0.05 * Math.sin(v * 5 + wph) * h;
          const cxp = x + lean[0] * v * v + Math.cos(ang) * wob;
          const czp = z + lean[2] * v * v + Math.sin(ang) * wob;
          const width = w * (1 - 0.65 * v) * (kelp ? 1 + 0.25 * Math.sin(v * 22 + wph) : 1);
          return [cxp + Math.cos(ang + 1.57) * (u - 0.5) * width, y0 + h * v, czp + Math.sin(ang + 1.57) * (u - 0.5) * width];
        },
        2,
        12,
        (_u, v) => [uvx, v]
      );
    }
  }
  return b.build({ min: [-30, -2, -30], max: [30, 6, 30] });
};

/** Anemones: a fat column crowned by waving tentacles. */
export const buildAnemones = () => {
  const b = new MeshBuilder();
  const r = makeRng(4242);
  const spots: Array<[number, number, number]> = [
    [0.6, 3.1, 0.93],
    [-1.2, -1.7, 0.06],
    [2.3, -0.2, 0.35],
    [-2.6, 1.2, 0.97],
    [4.1, 3.6, 0.08],
    [-0.2, 5.3, 0.55],
    [-5.2, -0.9, 0.9]
  ];
  for (const [cx, cz, hue] of spots) {
    const y0 = groundY(cx, cz) - 0.05;
    const colU = enc(hue, 0.45);
    b.tube([[cx, y0, cz], [cx, y0 + 0.12, cz], [cx, y0 + 0.24, cz]], (t) => 0.1 + 0.05 * Math.sin(t * 3), 10, colU, () => 0);
    const tentU = enc(hue, 0.6);
    const count = 46;
    for (let i = 0; i < count; i += 1) {
      const a = r() * TAU;
      const rr = Math.sqrt(r()) * 0.12;
      const start: V3 = [cx + Math.cos(a) * rr, y0 + 0.24, cz + Math.sin(a) * rr];
      const outward: V3 = norm([Math.cos(a) * 0.7 + (r() - 0.5) * 0.4, 1, Math.sin(a) * 0.7 + (r() - 0.5) * 0.4]);
      const length = rnd(r, 0.18, 0.32);
      const pts: V3[] = [start];
      let p = start;
      let d = outward;
      for (let k = 0; k < 3; k += 1) {
        d = norm(add(d, [Math.cos(a) * 0.25, 0.02, Math.sin(a) * 0.25]));
        p = add(p, mul(d, length / 3));
        pts.push(p);
      }
      b.tube(pts, (t) => 0.014 * (1 - 0.6 * t), 4, tentU, (t) => 0.3 + 0.7 * t);
    }
  }
  return b.build({ min: [-30, -2, -30], max: [30, 6, 30] });
};
