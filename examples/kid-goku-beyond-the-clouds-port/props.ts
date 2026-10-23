/** Props for the Cloud Runner: sandstone mesas, cloud clumps, rocks and logs, rope bridges, gorge posts, the home hut. */
import type { Chapter } from "./chapter";
import { at, frameAt, type V3 } from "./course";
import { Mesh, box, cylinder, hex, icosphere, mix3, mul3 } from "./mesh";
import { seeded, smooth, layoutObstacles } from "./sim";
import { CHUNK, ROAD_HALF, groundHeight, noise1 } from "./terrain";

export const yawOf = (forward: V3): number => Math.atan2(forward[0], forward[2]);

/* ---------------------------------------------------------------- mesas: banded sandstone buttes in the haze */
function mesa(rnd: () => number, radius: number, height: number, baseY: number): Mesh {
  const m = new Mesh();
  const sides = 11, rows = Math.max(6, Math.round(height / 5));
  const gold = hex("#d9ab62"), pale = hex("#efd5a2"), red = hex("#b8794d"), grass = hex("#76ab45"), shade = hex("#8c6a4b");
  const ringIdx: number[][] = [];
  const wob = Array.from({ length: sides }, () => 0.82 + rnd() * 0.36);
  for (let r = 0; r <= rows; r++) {
    const t = r / rows, y = baseY + height * t;
    const taper = 1.18 - 0.28 * t + (r > rows - 2 ? 0.02 : 0);
    const band = (Math.floor(r / 2) % 3);
    const base = band === 0 ? gold : band === 1 ? pale : red;
    const idx: number[] = [];
    for (let i = 0; i < sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const rad = radius * taper * wob[i]! * (r === rows ? 0.98 : 1) * (1 + 0.04 * Math.sin(r * 1.7 + i));
      const c = mix3(base, shade, 0.25 * (1 - t) + (i % 2 ? 0.08 : 0));
      idx.push(m.vertex([Math.cos(a) * rad, y, Math.sin(a) * rad], [Math.cos(a), 0.2, Math.sin(a)], [i / sides * 3, y / 14], c));
    }
    ringIdx.push(idx);
  }
  for (let r = 0; r < rows; r++) for (let i = 0; i < sides; i++) { const j = (i + 1) % sides; m.quad(ringIdx[r]![i]!, ringIdx[r]![j]!, ringIdx[r + 1]![j]!, ringIdx[r + 1]![i]!); }
  const top = ringIdx[rows]!;
  const cap = m.vertex([0, baseY + height + 0.4, 0], [0, 1, 0], [0.5, 0.5], grass);
  const capIdx = top.map((p, i) => m.vertex([m.positions[p * 3]!, m.positions[p * 3 + 1]! + 0.25, m.positions[p * 3 + 2]!], [0, 1, 0], [i / sides, 1], mix3(grass, hex("#4f8a35"), 0.4)));
  for (let i = 0; i < sides; i++) m.tri(cap, capIdx[i]!, capIdx[(i + 1) % sides]!);
  m.computeNormals();
  const crown = hex("#4a8f3c");
  for (let k = 0; k < Math.round(radius / 7); k++) {
    const a = rnd() * 6.28, d = rnd() * radius * 0.7;
    const blob = icosphere(1, mix3(crown, hex("#6fb243"), rnd()), 0.15, rnd, true);
    m.append(blob, [Math.cos(a) * d, baseY + height + 0.5 + 2, Math.sin(a) * d], [3 + rnd() * 3, 2.6 + rnd() * 2, 3 + rnd() * 3], rnd() * 6);
  }
  return m;
}

const MESA_HEIGHT = [100, 118, 136, 112, 126, 104];
export function buildMesas(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(555);
  const protos = Array.from({ length: 6 }, (_, i) => mesa(seeded(100 + i), 20 + (i % 3) * 9, MESA_HEIGHT[i]!, -120));
  for (let c0 = -60; c0 < ch.length + 160; c0 += CHUNK * 2) {
    const chunk = new Mesh();
    for (let s = c0; s < c0 + CHUNK * 2; s += 52 + rnd() * 70) {
      for (const side of [-1, 1] as const) {
        if (rnd() < 0.18) continue;
        const f = frameAt(s);
        const lat = side * (62 + rnd() * 230);
        const p = at(s + (rnd() - 0.5) * 40, lat, 0);
        const idx = Math.floor(rnd() * protos.length);
        const proto = protos[idx]!;
        const topY = f.point[1] + (rnd() * 54 - 18) + (Math.abs(lat) > 160 ? 14 : 0);
        const sx = 0.8 + rnd() * 0.9;
        chunk.append(proto, [p[0], topY - (-120 + MESA_HEIGHT[idx]!), p[2]], [sx, 1, sx * (0.85 + rnd() * 0.3)], rnd() * 6.28);
      }
    }
    if (chunk.indices.length) out.push(chunk);
  }
  return out;
}

/* ---------------------------------------------------------------- cloud clumps (lit puffs below, beside and above the ridge) */
export function buildClouds(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(31337);
  const top = hex("#fffaf0"), under = hex("#a9bad4");
  const puff = (): Mesh => {
    const m = icosphere(2, top, 0.1, rnd, true);
    for (let i = 0; i < m.vertexCount; i++) {
      const y = m.positions[i * 3 + 1]!;
      const c = mix3(under, top, smooth(-0.35, 0.55, y));
      m.colors[i * 4] = c[0]; m.colors[i * 4 + 1] = c[1]; m.colors[i * 4 + 2] = c[2];
    }
    return m;
  };
  const protos = [puff(), puff(), puff()];
  for (let c0 = -80; c0 < ch.length + 200; c0 += CHUNK * 2) {
    const chunk = new Mesh();
    for (let s = c0; s < c0 + CHUNK * 2; s += 22 + rnd() * 34) {
      const f = frameAt(s);
      const side = rnd() < 0.5 ? -1 : 1;
      const layer = rnd();
      // low banks of cloud under the ridge, some mid-height drifts, a few high ones
      const lat = side * (layer < 0.45 ? 58 + rnd() * 120 : 70 + rnd() * 290);
      const y = f.point[1] + (layer < 0.45 ? -26 - rnd() * 40 : layer < 0.7 ? -6 + rnd() * 20 : 40 + rnd() * 60);
      const p = at(s, lat, 0);
      const size = (layer >= 0.7 ? 26 : 14) + rnd() * 26;
      const n = 6 + Math.floor(rnd() * 6);
      for (let k = 0; k < n; k++) {
        const t = (k / (n - 1) - 0.5) * 2;
        const px = p[0] + t * size * 1.1 + (rnd() - 0.5) * size * 0.3, pz = p[2] + (rnd() - 0.5) * size * 0.7;
        const pr = size * (0.55 + 0.45 * (1 - Math.abs(t))) * (0.7 + rnd() * 0.5);
        chunk.append(protos[Math.floor(rnd() * 3)]!, [px, y + (1 - Math.abs(t)) * pr * 0.3, pz], [pr, pr * 0.62, pr], rnd() * 6.28);
      }
    }
    if (chunk.indices.length) out.push(chunk);
  }
  return out;
}

/* ---------------------------------------------------------------- obstacles: rocks and logs from the verified layout */
export function buildObstacles(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(808);
  const rockProto = [0, 1, 2].map((i) => icosphere(1, mix3(hex("#b8a07a"), hex("#8a7658"), i / 2), 0.2, seeded(60 + i), true));
  const logProto = (() => {
    const m = cylinder(10, 0.5, 0.5, 1, hex("#7a5232"), hex("#7a5232"));
    const ring = cylinder(10, 0.34, 0.34, 0.02, hex("#c79a64"), hex("#c79a64"));
    m.append(ring, [0, 1, 0], 1, 0, 0);
    m.append(ring, [0, -0.0, 0], 1, 0, 0);
    return m;
  })();
  const obstacles = layoutObstacles(ch, 0);
  const byChunk = new Map<number, Mesh>();
  for (const o of obstacles) {
    const key = Math.floor(o.s / (CHUNK * 2));
    let mesh = byChunk.get(key);
    if (!mesh) byChunk.set(key, (mesh = new Mesh()));
    const f = frameAt(o.s, o.lane);
    const base: V3 = [f.point[0], f.point[1], f.point[2]];
    if (o.type === "log") {
      const len = 4.4 + rnd() * 0.8, r = 0.62 * o.size;
      mesh.append(logProto, [base[0] - f.right[0] * len / 2, base[1] + r * 0.9, base[2] - f.right[2] * len / 2], [r * 2, len, r * 2], yawOf(f.right), Math.PI / 2);
    } else {
      mesh.append(rockProto[o.id % 3]!, [base[0], base[1] + 0.35 * o.size, base[2]], [1.15 * o.size, 0.95 * o.size, 1.1 * o.size], rnd() * 6.28);
    }
  }
  for (const m of byChunk.values()) out.push(m);
  return out;
}

/* ---------------------------------------------------------------- bridges, gorge posts, hut */
export function buildBridges(ch: Chapter): Mesh {
  const m = new Mesh();
  const plank = box(2.6, 0.12, 0.42, hex("#8b5a33"));
  const rope = box(0.06, 0.06, 1, hex("#d8c8a0"));
  const post = cylinder(6, 0.16, 0.16, 1.5, hex("#6a4528"), hex("#6a4528"));
  for (const g of ch.gaps) {
    if (!g.bridge) continue;
    for (let s = g.start - 0.4; s <= g.end + 0.4; s += 0.46) {
      const f = frameAt(s);
      const sag = Math.sin(((s - g.start) / (g.end - g.start)) * Math.PI) * -0.18;
      m.append(plank, [f.point[0], f.point[1] - 0.06 + sag, f.point[2]], 1, yawOf(f.forward), 0);
    }
    for (const side of [-1, 1] as const) {
      const a = at(g.start - 0.4, side * 1.4, 0), b = at(g.end + 0.4, side * 1.4, 0);
      m.append(post, [a[0], a[1] - 0.05, a[2]], 1, 0, 0);
      m.append(post, [b[0], b[1] - 0.05, b[2]], 1, 0, 0);
      const len = Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
      m.append(rope, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 1.35, (a[2] + b[2]) / 2], [1, 1, len], yawOf(frameAt((g.start + g.end) / 2).forward), 0);
    }
  }
  m.computeNormals();
  return m;
}

export function buildGorgePosts(ch: Chapter): Mesh {
  const m = new Mesh();
  const red = hex("#a83a2c"), gold = hex("#e2b23c");
  const shaft = cylinder(8, 0.32, 0.32, 5.2, red, red), cap = cylinder(8, 0.42, 0.42, 0.45, gold, gold);
  const banner = box(0.05, 1.7, 1.1, hex("#f3e0b0"));
  for (const p of ch.poles) {
    for (const edge of [p.start - 1.4, p.end + 1.4]) {
      for (const side of [-1, 1] as const) {
        const b = at(edge, side * (ROAD_HALF + 0.6), 0);
        const gy = groundHeight(ch, edge, side * (ROAD_HALF + 0.6));
        const base: V3 = [b[0], b[1] + gy, b[2]];
        m.append(shaft, base, 1, 0, 0);
        m.append(cap, [base[0], base[1] + 5.2, base[2]], 1, 0, 0);
        m.append(banner, [base[0] + side * -0.45, base[1] + 4.1, base[2]], 1, yawOf(frameAt(edge).forward), 0);
      }
    }
  }
  m.computeNormals();
  return m;
}

export function buildHut(ch: Chapter): Mesh | null {
  if (!ch.home) return null;
  const m = new Mesh();
  const s = ch.home.s, f = frameAt(s, 9.5);
  const wall = cylinder(14, 3.1, 3.0, 3.2, hex("#f1e2c0"), hex("#e9d7b0"));
  const roof = cylinder(14, 4.1, 0.05, 2.6, hex("#c0502f"), hex("#d76a3c"));
  const door = box(1.3, 2.0, 0.2, hex("#6b4527"));
  const base: V3 = [f.point[0], f.point[1], f.point[2]];
  m.append(wall, base, 1, 0, 0);
  m.append(roof, [base[0], base[1] + 3.1, base[2]], 1, 0, 0);
  m.append(door, [base[0] - f.right[0] * 3.0, base[1] + 1.0, base[2] - f.right[2] * 3.0], 1, yawOf(f.right), 0);
  const mount = icosphere(1, hex("#8a6a4a"), 0.2, seeded(9), true);
  m.append(mount, [base[0] + f.right[0] * 6, base[1] - 0.4, base[2] + f.right[2] * 6], [6, 2.2, 5], 0.4);
  m.computeNormals();
  return m;
}

export const dim = mul3;
void noise1;
