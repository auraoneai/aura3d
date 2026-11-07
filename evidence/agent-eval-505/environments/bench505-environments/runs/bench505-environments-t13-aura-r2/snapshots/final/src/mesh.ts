import { geometry } from "@aura3d/engine";

export type V3 = [number, number, number];

export const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const mul = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const norm = (a: V3): V3 => {
  const l = len(a);
  return l < 1e-9 ? [0, 1, 0] : [a[0] / l, a[1] / l, a[2] / l];
};

/** Seeded RNG so the reef is identical on every load. */
export const makeRng = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

/**
 * Colour is carried in the uv attribute and decoded by the reef shader:
 * uv.x = saturation step (integer part, 0..20) + hue * 0.99, uv.y = brightness (or height along a swaying blade).
 */
export const enc = (hue: number, sat: number): number => Math.round(Math.min(Math.max(sat, 0), 1) * 20) + (hue - Math.floor(hue)) * 0.99;

export class MeshBuilder {
  private positions: number[] = [];
  private normals: number[] = [];
  private uvs: number[] = [];
  private indices: number[] = [];

  get vertexCount(): number {
    return this.positions.length / 3;
  }

  vertex(p: V3, n: V3, u: number, v: number): number {
    this.positions.push(p[0], p[1], p[2]);
    this.normals.push(n[0], n[1], n[2]);
    this.uvs.push(u, v);
    return this.positions.length / 3 - 1;
  }

  private pos(i: number): V3 {
    return [this.positions[i * 3] ?? 0, this.positions[i * 3 + 1] ?? 0, this.positions[i * 3 + 2] ?? 0];
  }

  private nrm(i: number): V3 {
    return [this.normals[i * 3] ?? 0, this.normals[i * 3 + 1] ?? 0, this.normals[i * 3 + 2] ?? 0];
  }

  /** Adds a triangle wound so its geometric normal agrees with the vertex normals. */
  triangle(a: number, b: number, c: number): void {
    const pa = this.pos(a);
    const face = cross(sub(this.pos(b), pa), sub(this.pos(c), pa));
    if (len(face) < 1e-14) return;
    const n = add(add(this.nrm(a), this.nrm(b)), this.nrm(c));
    if (dot(face, n) >= 0) this.indices.push(a, b, c);
    else this.indices.push(a, c, b);
  }

  /** Parametric surface on a (nu x nv) grid. `center` makes normals point away from it. */
  surface(
    fn: (u: number, v: number) => V3,
    nu: number,
    nv: number,
    color: (u: number, v: number, p: V3) => [number, number],
    center?: V3
  ): void {
    const base = this.vertexCount;
    const e = 1e-3;
    for (let j = 0; j <= nv; j += 1) {
      for (let i = 0; i <= nu; i += 1) {
        const u = i / nu;
        const v = j / nv;
        const p = fn(u, v);
        const vc = Math.min(Math.max(v, 2 * e), 1 - 2 * e);
        const du = sub(fn(u + e, vc), fn(u - e, vc));
        const dv = sub(fn(u, vc + e), fn(u, vc - e));
        let n = cross(du, dv);
        const l = len(n);
        n = l > 1e-12 ? mul(n, 1 / l) : [0, 1, 0];
        if (center && dot(n, sub(p, center)) < 0) n = mul(n, -1);
        const c = color(u, v, p);
        this.vertex(p, n, c[0], c[1]);
      }
    }
    for (let j = 0; j < nv; j += 1) {
      for (let i = 0; i < nu; i += 1) {
        const a = base + j * (nu + 1) + i;
        const b = a + 1;
        const c = a + nu + 1;
        const d = c + 1;
        this.triangle(a, c, b);
        this.triangle(b, c, d);
      }
    }
  }

  /** Tapered tube swept along a polyline. `val(t)` gives brightness along the path (t in 0..1). */
  tube(path: V3[], radius: (t: number) => number, sides: number, uvx: number, val: (t: number) => number): void {
    const n = path.length;
    if (n < 2) return;
    const tang: V3[] = path.map((_, i) => norm(sub(path[Math.min(i + 1, n - 1)] as V3, path[Math.max(i - 1, 0)] as V3)));
    const t0 = tang[0] as V3;
    const ref: V3 = Math.abs(t0[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    let nrm = norm(sub(ref, mul(t0, dot(ref, t0))));
    const base = this.vertexCount;
    for (let i = 0; i < n; i += 1) {
      const t = tang[i] as V3;
      nrm = norm(sub(nrm, mul(t, dot(nrm, t))));
      const bin = cross(t, nrm);
      const f = i / (n - 1);
      const r = radius(f);
      const c = path[i] as V3;
      for (let s = 0; s <= sides; s += 1) {
        const a = (s / sides) * Math.PI * 2;
        const dir = add(mul(nrm, Math.cos(a)), mul(bin, Math.sin(a)));
        this.vertex(add(c, mul(dir, r)), dir, uvx, val(f));
      }
    }
    for (let i = 0; i < n - 1; i += 1) {
      for (let s = 0; s < sides; s += 1) {
        const a = base + i * (sides + 1) + s;
        const b = a + 1;
        const c = a + sides + 1;
        const d = c + 1;
        this.triangle(a, c, b);
        this.triangle(b, c, d);
      }
    }
  }

  /** Flat disc facing `up`. */
  disc(center: V3, radius: number, segments: number, uvx: number, value: number, up: V3 = [0, 1, 0]): void {
    const c = this.vertex(center, up, uvx, value);
    const ref: V3 = Math.abs(up[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tx = norm(cross(up, ref));
    const tz = cross(up, tx);
    const ring: number[] = [];
    for (let s = 0; s <= segments; s += 1) {
      const a = (s / segments) * Math.PI * 2;
      const p = add(center, add(mul(tx, Math.cos(a) * radius), mul(tz, Math.sin(a) * radius)));
      ring.push(this.vertex(p, up, uvx, value));
    }
    for (let s = 0; s < segments; s += 1) this.triangle(c, ring[s] as number, ring[s + 1] as number);
  }

  build(bounds: { min: V3; max: V3 }) {
    return geometry.define({
      positions: new Float32Array(this.positions),
      normals: new Float32Array(this.normals),
      uvs: new Float32Array(this.uvs),
      indices: this.indices,
      bounds
    });
  }
}
