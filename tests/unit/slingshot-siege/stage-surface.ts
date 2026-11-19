/**
 * Test helper: the walkable top surface of the Slingshot Siege stage, rebuilt from the authored stage nodes (island
 * turf, rim and far sand meshes, the launch knoll, the fortress pad, the limestone cliffs and their turf caps) plus the
 * sea plane, and sampled by a straight-down ray. Used by the Idol grounding test to measure every placed model against
 * the surface under its footprint.
 */
import { readFileSync } from "node:fs";
import { SEA_LEVEL } from "../../../apps/showcase-slingshot-siege/src/game/stage";

type V3 = [number, number, number];
type Node = {
  kind?: string; name?: string; position?: number[]; rotation?: number[]; scale?: number | number[];
  geometry?: { positions?: number[]; indices?: number[] }; instances?: { position?: number[]; rotation?: number[]; scale?: number | number[] }[];
  children?: Node[]; asset?: { url?: string }; scaleMode?: string; visible?: boolean;
};

/** Engine Euler (R = Rz * Ry * Rx). */
export function rotate(e: readonly number[] | undefined, v: readonly number[]): V3 {
  const [x, y, z] = [e?.[0] ?? 0, e?.[1] ?? 0, e?.[2] ?? 0];
  const cx = Math.cos(x), sx = Math.sin(x), cy = Math.cos(y), sy = Math.sin(y), cz = Math.cos(z), sz = Math.sin(z);
  // Rx
  let a: V3 = [v[0]!, cx * v[1]! - sx * v[2]!, sx * v[1]! + cx * v[2]!];
  // Ry (engine: x' = cy x + sy z, z' = -sy x + cy z)
  a = [cy * a[0] + sy * a[2], a[1], -sy * a[0] + cy * a[2]];
  // Rz
  return [cz * a[0] - sz * a[1], sz * a[0] + cz * a[1], a[2]];
}
const s3 = (s: number | number[] | undefined): V3 => (s === undefined ? [1, 1, 1] : typeof s === "number" ? [s, s, s] : [s[0]!, s[1]!, s[2]!]);
function xform(t: { position?: number[]; rotation?: number[]; scale?: number | number[] }, p: readonly number[]): V3 {
  const s = s3(t.scale);
  const r = rotate(t.rotation, [p[0]! * s[0], p[1]! * s[1], p[2]! * s[2]]);
  const o = t.position ?? [0, 0, 0];
  return [r[0] + o[0]!, r[1] + o[1]!, r[2] + o[2]!];
}

const SURFACE_NODES = /^(stage-ground|stage-ground-rim|stage-far-ground|launch-knoll-and-bridge|fortress-pad|coastal-limestone-cliffs|coastal-cliff-turf-caps)/;

export interface StageSurface {
  /** Highest surface (land, or the sea plane) under (x, z). */
  height(x: number, z: number): number;
}

export function stageSurface(nodes: readonly Node[]): StageSurface {
  const tris: number[] = [];
  const addMesh = (geo: Node["geometry"], chain: { position?: number[]; rotation?: number[]; scale?: number | number[] }[]) => {
    const P = geo?.positions, I = geo?.indices;
    if (!P || !I) return;
    const w: V3[] = [];
    for (let i = 0; i < P.length; i += 3) {
      let p: V3 = [P[i]!, P[i + 1]!, P[i + 2]!];
      for (let k = chain.length - 1; k >= 0; k -= 1) p = xform(chain[k]!, p);
      w.push(p);
    }
    for (let t = 0; t < I.length; t += 3) tris.push(...w[I[t]!]!, ...w[I[t + 1]!]!, ...w[I[t + 2]!]!);
  };
  const visit = (n: Node, chain: { position?: number[]; rotation?: number[]; scale?: number | number[] }[]) => {
    const own = [...chain, n];
    if (n.geometry) {
      if (n.instances?.length) for (const inst of n.instances) addMesh(n.geometry, [...chain, inst]);
      else addMesh(n.geometry, own);
    }
    for (const c of n.children ?? []) visit(c, own);
  };
  for (const n of nodes) if (SURFACE_NODES.test(String(n.name ?? ""))) visit(n, []);
  // Bin the triangles on a 0.5 m XZ grid.
  const cell = 0.5, bins = new Map<string, number[]>();
  for (let t = 0; t < tris.length; t += 9) {
    const xs = [tris[t]!, tris[t + 3]!, tris[t + 6]!], zs = [tris[t + 2]!, tris[t + 5]!, tris[t + 8]!];
    for (let gx = Math.floor(Math.min(...xs) / cell); gx <= Math.floor(Math.max(...xs) / cell); gx += 1)
      for (let gz = Math.floor(Math.min(...zs) / cell); gz <= Math.floor(Math.max(...zs) / cell); gz += 1) {
        const k = `${gx},${gz}`; (bins.get(k) ?? bins.set(k, []).get(k)!).push(t);
      }
  }
  return {
    height(x: number, z: number): number {
      let best = SEA_LEVEL;
      for (const t of bins.get(`${Math.floor(x / cell)},${Math.floor(z / cell)}`) ?? []) {
        const ax = tris[t]!, ay = tris[t + 1]!, az = tris[t + 2]!, bx = tris[t + 3]!, by = tris[t + 4]!, bz = tris[t + 5]!, cx = tris[t + 6]!, cy = tris[t + 7]!, cz = tris[t + 8]!;
        const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
        if (Math.abs(d) < 1e-12) continue;
        const u = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d, v = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d, w = 1 - u - v;
        if (u < -1e-9 || v < -1e-9 || w < -1e-9) continue;
        best = Math.max(best, u * ay + v * by + w * cy);
      }
      return best;
    }
  };
}

/** Grounded-GLB footprint (local x/z bounds) per asset key, from the shared manifest. */
const manifest = JSON.parse(readFileSync("aura.assets.json", "utf8")) as { assets: { id: string; url: string; boundsMetadata?: { min: number[]; max: number[] } }[] };
export function footprintOf(url: string): { key: string; min: number[]; max: number[] } {
  const a = manifest.assets.find((e) => e.url === url);
  if (!a?.boundsMetadata) throw new Error(`no bounds for ${url}`);
  return { key: a.id, min: a.boundsMetadata.min, max: a.boundsMetadata.max };
}

/** Sample points of a placed model's base: the centre, plus a ring at 25 / 50 / 70 % of its half extents. */
export function footprintSamples(t: { position?: number[]; rotation?: number[]; scale?: number | number[] }, min: number[], max: number[]): V3[] {
  const cx = (min[0]! + max[0]!) / 2, cz = (min[2]! + max[2]!) / 2, hx = (max[0]! - min[0]!) / 2, hz = (max[2]! - min[2]!) / 2;
  const pts: V3[] = [xform(t, [cx, min[1]!, cz])];
  for (const f of [0.25, 0.5, 0.7]) for (let k = 0; k < 8; k += 1) {
    const a = (k / 8) * Math.PI * 2;
    pts.push(xform(t, [cx + Math.cos(a) * hx * f, min[1]!, cz + Math.sin(a) * hz * f]));
  }
  return pts;
}
