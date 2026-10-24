import { readFileSync } from "node:fs";

type Mat = number[];
interface Gltf { nodes: { name: string; children?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }[]; accessors: { bufferView: number; byteOffset?: number; count: number; type: string; min?: number[]; max?: number[] }[]; bufferViews: { byteOffset?: number }[]; animations: { name: string; channels: { sampler: number; target: { node: number; path: string } }[]; samplers: { input: number; output: number }[] }[]; meshes: { primitives: { attributes: { POSITION: number } }[] }[] }

const COMPONENTS: Record<string, number> = { SCALAR: 1, VEC3: 3, VEC4: 4 };
const mul = (a: Mat, b: Mat): Mat => { const r = new Array<number>(16).fill(0); for (let c = 0; c < 4; c++) for (let row = 0; row < 4; row++) for (let k = 0; k < 4; k++) r[c * 4 + row]! += a[k * 4 + row]! * b[c * 4 + k]!; return r; };
function compose(t: number[], q: number[], s: number[]): Mat {
  const [x, y, z, w] = q as [number, number, number, number];
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [(1 - 2 * (yy + zz)) * s[0]!, 2 * (xy + wz) * s[0]!, 2 * (xz - wy) * s[0]!, 0, 2 * (xy - wz) * s[1]!, (1 - 2 * (xx + zz)) * s[1]!, 2 * (yz + wx) * s[1]!, 0, 2 * (xz + wy) * s[2]!, 2 * (yz - wx) * s[2]!, (1 - 2 * (xx + yy)) * s[2]!, 0, t[0]!, t[1]!, t[2]!, 1];
}
function slerp(a: number[], b: number[], t: number): number[] {
  let d = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]! + a[3]! * b[3]!;
  let bb = b;
  if (d < 0) { d = -d; bb = b.map((v) => -v); }
  if (d > 0.9995) { const r = a.map((v, i) => v + (bb[i]! - v) * t); const l = Math.hypot(...r); return r.map((v) => v / l); }
  const th = Math.acos(d), s = Math.sin(th), wa = Math.sin((1 - t) * th) / s, wb = Math.sin(t * th) / s;
  return a.map((v, i) => v * wa + bb[i]! * wb);
}

export interface ClipStride { readonly duration: number; readonly stanceFootSpeed: number }

/** Planted-foot speed per clip (model units per second at rate 1) by forward kinematics of a GLB's own skeleton. */
export function glbStride(file: string): { clips: Record<string, ClipStride>; meshHeight: number } {
  const b = readFileSync(file);
  const jl = b.readUInt32LE(12);
  const j = JSON.parse(b.subarray(20, 20 + jl).toString()) as Gltf;
  const bin = b.subarray(20 + jl + 8);
  const acc = (i: number) => { const a = j.accessors[i]!; const bv = j.bufferViews[a.bufferView]!; const n = COMPONENTS[a.type]!; const off = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0); const o = new Float64Array(a.count * n); for (let k = 0; k < o.length; k++) o[k] = bin.readFloatLE(off + k * 4); return { o, n }; };
  const parent = new Array<number>(j.nodes.length).fill(-1);
  j.nodes.forEach((n, i) => (n.children ?? []).forEach((c) => { parent[c] = i; }));
  const inputs = new Map<number, Float64Array>();
  const outputs = new Map<number, { o: Float64Array; n: number }>();
  const cached = <T,>(m: Map<number, T>, i: number, f: (i: number) => T): T => { let v = m.get(i); if (!v) { v = f(i); m.set(i, v); } return v; };
  const sample = (an: Gltf["animations"][number], time: number): Mat[] => {
    const tr = j.nodes.map((n) => ({ t: n.translation ?? [0, 0, 0], q: n.rotation ?? [0, 0, 0, 1], s: n.scale ?? [1, 1, 1] }));
    for (const c of an.channels) {
      const s = an.samplers[c.sampler]!; const inp = cached(inputs, s.input, (i) => acc(i).o); const out = cached(outputs, s.output, acc);
      const T = inp[inp.length - 1]!; const tt = time % T; let i = 0; while (i < inp.length - 2 && inp[i + 1]! <= tt) i++;
      const f = (tt - inp[i]!) / Math.max(1e-9, inp[i + 1]! - inp[i]!); const n = out.n;
      const A = Array.from(out.o.slice(i * n, i * n + n)), B = Array.from(out.o.slice((i + 1) * n, (i + 1) * n + n));
      const node = tr[c.target.node]!;
      if (c.target.path === "rotation") node.q = slerp(A, B, f); else if (c.target.path === "translation") node.t = A.map((v, k) => v + (B[k]! - v) * f); else node.s = A.map((v, k) => v + (B[k]! - v) * f);
    }
    const g: (Mat | undefined)[] = new Array(j.nodes.length);
    const get = (i: number): Mat => g[i] ??= parent[i]! < 0 ? compose(tr[i]!.t, tr[i]!.q, tr[i]!.s) : mul(get(parent[i]!), compose(tr[i]!.t, tr[i]!.q, tr[i]!.s));
    j.nodes.forEach((_, i) => get(i));
    return g as Mat[];
  };
  const feet = ["LeftFoot", "RightFoot"].map((nm) => j.nodes.findIndex((n) => n.name === nm));
  const clips: Record<string, ClipStride> = {};
  for (const an of j.animations) {
    const duration = Math.max(...an.samplers.map((s) => cached(inputs, s.input, (i) => acc(i).o).at(-1)!));
    const N = 120, dt = duration / N;
    const pos = Array.from({ length: N + 1 }, (_, k) => { const g = sample(an, (k / N) * duration); return feet.map((f) => [g[f]![12]!, g[f]![13]!, g[f]![14]!]); });
    const rng = [0, 1, 2].map((ax) => { const v = pos.map((p) => p[0]![ax]!); return Math.max(...v) - Math.min(...v); });
    const ax = rng[0]! > rng[2]! ? 0 : 2;
    const speeds: number[] = [];
    for (let f = 0; f < 2; f++) {
      const ys = pos.map((p) => p[f]![1]!); const lo = Math.min(...ys), hi = Math.max(...ys), thr = lo + 0.25 * (hi - lo);
      for (let k = 0; k < N; k++) if (ys[k]! <= thr && ys[k + 1]! <= thr) speeds.push(Math.abs(pos[k + 1]![f]![ax]! - pos[k]![f]![ax]!) / dt);
    }
    speeds.sort((x, y) => x - y);
    clips[an.name] = { duration, stanceFootSpeed: speeds.length ? speeds[Math.floor(speeds.length / 2)]! : 0 };
  }
  const pa = j.accessors[j.meshes[0]!.primitives[0]!.attributes.POSITION]!;
  return { clips, meshHeight: pa.max![1]! - pa.min![1]! };
}
