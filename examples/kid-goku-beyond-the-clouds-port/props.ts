/** Props for Cumulus Dash: sandstone mesas, cumulus cloud banks, rocks and logs, rope bridges, gorge posts, sanctuary torii, and the home hut. */
import type { AuraTransformSpec } from "@aura3d/engine";
import { icosphereSmoothMesh } from "../../apps/showcase-port-shared/proceduralKernel";
import type { Chapter } from "./chapter";
import { at, frameAt, type V3 } from "./course";
import { Mesh, box, cylinder, hex, icosphere, mix3, mul3 } from "./mesh";
import { seeded, smooth, layoutObstacles } from "./sim";
import { CHUNK, ROAD_HALF, groundHeight, noise1 } from "./terrain";
import { buildSanctuaryToriiNode, buildSkyHermitCottageNode } from "./art/proceduralModels";

export { buildSanctuaryToriiNode, buildSkyHermitCottageNode };

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
export interface MesaPlacement { pos: V3; height: number; width: number; yaw: number }
const HERO_MESA_CAP = 46;
export function buildMesas(ch: Chapter): { meshes: Mesh[]; placements: MesaPlacement[]; distantPlacements: MesaPlacement[] } {
  const out: Mesh[] = [];
  const placements: MesaPlacement[] = [];
  const distantPlacements: MesaPlacement[] = [];
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
        const sz = sx * (0.85 + rnd() * 0.3), yaw = rnd() * 6.28;
        const entry: MesaPlacement = {
          pos: [p[0], topY - (120 + MESA_HEIGHT[idx]!) * 0.9, p[2]],
          height: (120 + MESA_HEIGHT[idx]!) * 0.9,
          width: (40 + (idx % 3) * 18) * sx,
          yaw
        };
        if (Math.abs(lat) < 170 && placements.length < HERO_MESA_CAP) placements.push(entry);
        else {
          distantPlacements.push(entry);
          chunk.append(proto, [p[0], topY - (-120 + MESA_HEIGHT[idx]!), p[2]], [sx, 1, sz], yaw);
        }
      }
    }
    if (chunk.indices.length) out.push(chunk);
  }
  return { meshes: out, placements, distantPlacements };
}

/* ---------------------------------------------------------------- cloud clumps (smooth upward-normal puffs + batched placements) */
function smoothCumulusPuffMesh(seed: number, top: V3, mid: V3, under: V3): Mesh {
  const raw = icosphereSmoothMesh(1, 2, 0.065, seed, 1.3);
  const m = new Mesh();
  const vc = raw.positions.length / 3;
  for (let i = 0; i < vc; i++) {
    const x = raw.positions[i * 3]!, y = raw.positions[i * 3 + 1]!, z = raw.positions[i * 3 + 2]!;
    const nx = raw.normals[i * 3]!, ny = raw.normals[i * 3 + 1]!, nz = raw.normals[i * 3 + 2]!;
    const u = raw.uvs[i * 2] ?? 0.5, v = raw.uvs[i * 2 + 1] ?? 0.5;
    const rim = Math.min(1, Math.hypot(x, z));
    const cBase = y < 0.05 ? mix3(under, mid, smooth(-0.4, 0.05, y)) : mix3(mid, top, smooth(0.05, 0.65, y));
    const c = mix3(cBase, top, rim * 0.25 * smooth(-0.15, 0.45, y));
    m.vertex([x, y, z], [nx, ny, nz], [u, v], c);
  }
  for (let i = 0; i < raw.indices.length; i += 3) {
    m.tri(raw.indices[i]!, raw.indices[i + 1]!, raw.indices[i + 2]!);
  }
  return m;
}

export function buildClouds(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(31337);
  const top = hex("#fffaf2"), mid = hex("#fff5e6"), under = hex("#f7ead8");
  const protos = [
    smoothCumulusPuffMesh(101, top, mid, under),
    smoothCumulusPuffMesh(211, top, mid, under),
    smoothCumulusPuffMesh(307, top, mid, under),
    smoothCumulusPuffMesh(419, top, mid, under)
  ];
  for (let c0 = -80; c0 < ch.length + 200; c0 += CHUNK * 2) {
    const chunk = new Mesh();
    for (let s = c0; s < c0 + CHUNK * 2; s += 26 + rnd() * 34) {
      const f = frameAt(s);
      const side = rnd() < 0.5 ? -1 : 1;
      const layer = rnd();
      const lat = side * (layer < 0.5 ? 48 + rnd() * 125 : layer < 0.78 ? 66 + rnd() * 210 : 88 + rnd() * 280);
      const y = f.point[1] + (layer < 0.5 ? -24 - rnd() * 34 : layer < 0.78 ? -6 + rnd() * 22 : 38 + rnd() * 62);
      const p = at(s, lat, 0);
      const size = (layer >= 0.78 ? 28 : layer < 0.5 ? 18 : 15) + rnd() * 24;
      const n = 4 + Math.floor(rnd() * 3);
      for (let k = 0; k < n; k++) {
        const t = (k / Math.max(1, n - 1) - 0.5) * 2;
        const px = p[0] + t * size * 1.05 + (rnd() - 0.5) * size * 0.3, pz = p[2] + (rnd() - 0.5) * size * 0.68;
        const pr = size * (0.58 + 0.42 * (1 - Math.abs(t))) * (0.76 + rnd() * 0.42);
        chunk.append(protos[Math.floor(rnd() * protos.length)]!, [px, y + (1 - Math.abs(t)) * pr * 0.32, pz], [pr * 1.06, pr * 0.62, pr * 1.02], rnd() * 6.28);
      }
    }
    if (chunk.indices.length) out.push(chunk);
  }
  return out;
}

export interface BatchedCloudPlacements {
  readonly heroFlankingA: AuraTransformSpec[];
  readonly heroFlankingB: AuraTransformSpec[];
  readonly seaBanks: AuraTransformSpec[];
}

export function buildCloudBankPlacements(ch: Chapter): BatchedCloudPlacements {
  const rnd = seeded(424242);
  const heroFlankingA: AuraTransformSpec[] = [];
  const heroFlankingB: AuraTransformSpec[] = [];
  const seaBanks: AuraTransformSpec[] = [];
  // Prominent high & flanking sunlit cumulus clusters (<=16 per batch -> fabric/physical sheen + warm #ffe8cc glow)
  for (let i = 0; i < 30; i += 1) {
    const s = -40 + (i / 29) * (ch.length + 180);
    const f = frameAt(s);
    const side = i % 2 === 0 ? 1 : -1;
    const lat = side * (95 + rnd() * 165);
    const p = at(s + (rnd() - 0.5) * 28, lat, 0);
    const y = f.point[1] + 24 + rnd() * 48;
    const sx = 24 + rnd() * 20;
    const spec: AuraTransformSpec = {
      position: [p[0], y, p[2]],
      rotation: [0, rnd() * 6.28, 0],
      scale: [sx, sx * (0.58 + rnd() * 0.14), sx * (0.9 + rnd() * 0.2)]
    };
    if (heroFlankingA.length < 15) heroFlankingA.push(spec);
    else if (heroFlankingB.length < 15) heroFlankingB.push(spec);
  }
  // Batched chasm & horizon cumulus sea banks (2 instanced draw calls across the entire chapter)
  for (let s = -80; s < ch.length + 200; s += 28 + rnd() * 34) {
    for (const side of [-1, 1] as const) {
      if (rnd() < 0.22) continue;
      const f = frameAt(s);
      const low = rnd() < 0.65;
      const lat = side * (low ? 52 + rnd() * 140 : 120 + rnd() * 220);
      const p = at(s + (rnd() - 0.5) * 24, lat, 0);
      const y = f.point[1] + (low ? -26 - rnd() * 30 : 4 + rnd() * 26);
      const sx = (low ? 20 : 26) + rnd() * 22;
      seaBanks.push({
        position: [p[0], y, p[2]],
        rotation: [0, rnd() * 6.28, 0],
        scale: [sx, sx * 0.56, sx * (0.92 + rnd() * 0.18)]
      });
    }
  }
  return { heroFlankingA, heroFlankingB, seaBanks };
}

/* ---------------------------------------------------------------- obstacles: rocks and logs from the verified layout */
function sculptedLogUnit(): Mesh {
  const m = new Mesh();
  const sides = 28, rings = 8;
  const darkBark = hex("#452b18"), midBark = hex("#6c472b"), warmBark = hex("#8f5f39"), mossBark = hex("#5b7236");
  const heartCore = hex("#966132"), goldRing = hex("#e5b05c"), amberRing = hex("#c28642"), sapwood = hex("#f2d8a2");
  const ringIdx: number[][] = [];
  for (let r = 0; r <= rings; r++) {
    const t = r / rings;
    const taper = 1 + (r === 0 || r === rings ? 0.042 : -0.026 * Math.sin(t * Math.PI));
    const row: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      const ridge = 0.048 * Math.sin(a * 7 + t * 3.8) + 0.026 * Math.cos(a * 13 - t * 2.9);
      const rad = 0.5 * taper * (1 + ridge);
      const c = Math.cos(a), sn = Math.sin(a);
      const furrow = 0.5 + 0.5 * Math.sin(a * 7 + t * 3.8);
      const moss = Math.max(0, -c) * 0.38 * (0.5 + 0.5 * Math.sin(t * 6.2));
      const baseBark = furrow > 0.52 ? mix3(midBark, warmBark, (furrow - 0.52) / 0.48) : mix3(darkBark, midBark, furrow / 0.52);
      const barkCol = mix3(baseBark, mossBark, moss);
      row.push(m.vertex([c * rad, t, sn * rad], [c, 0, sn], [i / sides * 2, t * 2], barkCol));
    }
    ringIdx.push(row);
  }
  for (let r = 0; r < rings; r++) {
    for (let i = 0; i < sides; i++) m.quad(ringIdx[r]![i]!, ringIdx[r + 1]![i]!, ringIdx[r + 1]![i + 1]!, ringIdx[r]![i + 1]!);
  }
  for (const [endY, ny, flip] of [[0, -1, true], [1, 1, false]] as const) {
    const center = m.vertex([0, endY, 0], [0, ny, 0], [0.5, 0.5], heartCore);
    const r1: number[] = [], r2: number[] = [], r3: number[] = [], r4: number[] = [];
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
      const wob = 1 + 0.022 * Math.sin(a * 7);
      r1.push(m.vertex([c * 0.16 * wob, endY, sn * 0.16 * wob], [0, ny, 0], [0.5 + c * 0.16, 0.5 + sn * 0.16], goldRing));
      r2.push(m.vertex([c * 0.28 * wob, endY, sn * 0.28 * wob], [0, ny, 0], [0.5 + c * 0.28, 0.5 + sn * 0.28], amberRing));
      r3.push(m.vertex([c * 0.39 * wob, endY, sn * 0.39 * wob], [0, ny, 0], [0.5 + c * 0.39, 0.5 + sn * 0.39], goldRing));
      r4.push(m.vertex([c * 0.485 * wob, endY, sn * 0.485 * wob], [0, ny, 0], [0.5 + c * 0.48, 0.5 + sn * 0.48], sapwood));
    }
    for (let i = 0; i < sides; i++) {
      if (flip) {
        m.tri(center, r1[i + 1]!, r1[i]!);
        m.quad(r1[i]!, r1[i + 1]!, r2[i + 1]!, r2[i]!);
        m.quad(r2[i]!, r2[i + 1]!, r3[i + 1]!, r3[i]!);
        m.quad(r3[i]!, r3[i + 1]!, r4[i + 1]!, r4[i]!);
      } else {
        m.tri(center, r1[i]!, r1[i + 1]!);
        m.quad(r1[i]!, r2[i]!, r2[i + 1]!, r1[i + 1]!);
        m.quad(r2[i]!, r3[i]!, r3[i + 1]!, r2[i + 1]!);
        m.quad(r3[i]!, r4[i]!, r4[i + 1]!, r3[i + 1]!);
      }
    }
  }
  m.computeNormals();
  // Weld cylinder seam normals across i=0 / i=sides so the 28-segment trunk shades seamlessly around 360 deg
  for (const row of ringIdx) {
    const a = row[0]! * 3, b = row[sides]! * 3;
    const nx = m.normals[a]! + m.normals[b]!, ny = m.normals[a + 1]! + m.normals[b + 1]!, nz = m.normals[a + 2]! + m.normals[b + 2]!;
    const nl = Math.hypot(nx, ny, nz) || 1;
    m.normals[a] = nx / nl; m.normals[a + 1] = ny / nl; m.normals[a + 2] = nz / nl;
    m.normals[b] = nx / nl; m.normals[b + 1] = ny / nl; m.normals[b + 2] = nz / nl;
  }
  return m;
}

export function buildObstacles(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(808);
  const rockProto = [0, 1, 2].map((i) => icosphere(1, mix3(hex("#b8a07a"), hex("#8a7658"), i / 2), 0.2, seeded(60 + i), true));
  const logProto = sculptedLogUnit();
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

export interface SanctuaryToriiPlacement { readonly name: string; readonly pos: V3; readonly yaw: number }

export function buildSanctuaryToriiPlacements(ch: Chapter): SanctuaryToriiPlacement[] {
  const out: SanctuaryToriiPlacement[] = [];
  const stations = [...ch.checkpoints.filter((c) => c > 0), ch.length - 4];
  stations.forEach((s, idx) => {
    const f = frameAt(s, 0);
    const gy = Math.min(groundHeight(ch, s, -ROAD_HALF - 1.05), groundHeight(ch, s, ROAD_HALF + 1.05));
    out.push({
      name: `sanctuary-torii-${idx}`,
      pos: [f.point[0], f.point[1] + Math.max(-0.3, gy), f.point[2]],
      yaw: yawOf(f.forward)
    });
  });
  return out;
}

export function buildHut(ch: Chapter, walls = true): Mesh | null {
  if (!ch.home) return null;
  const m = new Mesh();
  const s = ch.home.s, f = frameAt(s, 9.5);
  const wall = cylinder(18, 2.75, 2.65, 2.95, hex("#f1e2c0"), hex("#e9d7b0"));
  const roofLower = cylinder(20, 3.68, 2.25, 0.85, hex("#b83c28"), hex("#c94c34"));
  const roofMid = cylinder(20, 2.25, 0.95, 0.95, hex("#c94c34"), hex("#d76a3c"));
  const roofApex = cylinder(18, 0.95, 0.04, 0.78, hex("#d76a3c"), hex("#ecc058"));
  const door = box(1.2, 1.9, 0.2, hex("#6b4527"));
  const base: V3 = [f.point[0], f.point[1], f.point[2]];
  if (walls) {
    m.append(wall, base, 1, 0, 0);
    m.append(roofLower, [base[0], base[1] + 2.9, base[2]], 1, 0, 0);
    m.append(roofMid, [base[0], base[1] + 3.75, base[2]], 1, 0, 0);
    m.append(roofApex, [base[0], base[1] + 4.7, base[2]], 1, 0, 0);
    m.append(door, [base[0] - f.right[0] * 2.7, base[1] + 0.95, base[2] - f.right[2] * 2.7], 1, yawOf(f.right), 0);
  }
  const mount = icosphere(1, hex("#8a6a4a"), 0.2, seeded(9), true);
  m.append(mount, [base[0] + f.right[0] * 6, base[1] - 0.4, base[2] + f.right[2] * 6], [6, 2.2, 5], 0.4);
  m.computeNormals();
  return m;
}

export const dim = mul3;
void noise1;
