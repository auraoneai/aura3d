/**
 * Unit shapes for instanced scenery (boxes, gable/hip roofs, cylinders, cones, spheres, rocks, discs). Every shape stands on
 * y = 0 (spheres and rocks are centred) with outward counter-clockwise faces and hard or smooth normals as noted, so
 * `instances.mesh` can scale them per instance. Pure data; no engine imports.
 */
import { seededRandom } from "./sim";

export interface Shape { positions: number[]; normals: number[]; uvs: number[]; indices: number[] }
type V3 = readonly [number, number, number];

class ShapeBuilder {
  readonly shape: Shape = { positions: [], normals: [], uvs: [], indices: [] };

  private vertex(p: V3, n: V3, u: number, v: number): number {
    this.shape.positions.push(p[0], p[1], p[2]);
    this.shape.normals.push(n[0], n[1], n[2]);
    this.shape.uvs.push(u, v);
    return this.shape.positions.length / 3 - 1;
  }

  /** Flat quad a-b-c-d (counter-clockwise seen from outside). */
  quad(a: V3, b: V3, c: V3, d: V3): void {
    const n = cross(sub(b, a), sub(d, a));
    const base = this.vertex(a, n, 0, 0);
    this.vertex(b, n, 1, 0); this.vertex(c, n, 1, 1); this.vertex(d, n, 0, 1);
    this.shape.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /** Flat triangle; `outward` is a point inside the solid used to flip a wrongly wound face. */
  tri(a: V3, b: V3, c: V3, inside: V3): void {
    let n = cross(sub(b, a), sub(c, a));
    const centre: V3 = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    const flip = dot(n, sub(centre, inside)) < 0;
    if (flip) n = [-n[0], -n[1], -n[2]];
    const base = this.vertex(a, n, 0, 0);
    this.vertex(flip ? c : b, n, 1, 0); this.vertex(flip ? b : c, n, 0.5, 1);
    this.shape.indices.push(base, base + 1, base + 2);
  }

  smooth(p: V3, n: V3, u: number, v: number): number { return this.vertex(p, n, u, v); }
  index(a: number, b: number, c: number): void { this.shape.indices.push(a, b, c); }
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: V3, b: V3): V3 => {
  const x = a[1] * b[2] - a[2] * b[1], y = a[2] * b[0] - a[0] * b[2], z = a[0] * b[1] - a[1] * b[0];
  const l = Math.hypot(x, y, z) || 1;
  return [x / l, y / l, z / l];
};
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** 1 x 1 footprint, 1 high, base on y = 0; no underside. */
export function unitBox(): Shape {
  const b = new ShapeBuilder();
  b.quad([-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 1, 0.5], [-0.5, 1, 0.5]);
  b.quad([0.5, 0, -0.5], [-0.5, 0, -0.5], [-0.5, 1, -0.5], [0.5, 1, -0.5]);
  b.quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0.5, 1, -0.5], [0.5, 1, 0.5]);
  b.quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0.5], [-0.5, 1, -0.5]);
  b.quad([-0.5, 1, 0.5], [0.5, 1, 0.5], [0.5, 1, -0.5], [-0.5, 1, -0.5]);
  return b.shape;
}

/** Gable roof prism: eaves at x = +-0.5 on y = 0, ridge along z at x = 0, y = 1; flat gable ends. */
export function unitGable(): Shape {
  const b = new ShapeBuilder();
  b.quad([0.5, 0, 0.5], [0.5, 0, -0.5], [0, 1, -0.5], [0, 1, 0.5]);
  b.quad([-0.5, 0, -0.5], [-0.5, 0, 0.5], [0, 1, 0.5], [0, 1, -0.5]);
  const inside: V3 = [0, 0.3, 0];
  b.tri([-0.5, 0, 0.5], [0.5, 0, 0.5], [0, 1, 0.5], inside);
  b.tri([0.5, 0, -0.5], [-0.5, 0, -0.5], [0, 1, -0.5], inside);
  return b.shape;
}

/** Square pyramid (hip roof): base +-0.5 on y = 0, apex (0, 1, 0). */
export function unitHip(): Shape {
  const b = new ShapeBuilder();
  const apex: V3 = [0, 1, 0], inside: V3 = [0, 0.25, 0];
  const c: V3[] = [[-0.5, 0, 0.5], [0.5, 0, 0.5], [0.5, 0, -0.5], [-0.5, 0, -0.5]];
  for (let i = 0; i < 4; i++) b.tri(c[i]!, c[(i + 1) % 4]!, apex, inside);
  return b.shape;
}

/** Radius 1, height 1, smooth sides and a top cap, base on y = 0. */
export function unitCylinder(segments = 10): Shape {
  const b = new ShapeBuilder();
  const ring = (y: number, v: number): number[] => Array.from({ length: segments + 1 }, (_, i) => {
    const a = (i / segments) * Math.PI * 2;
    return b.smooth([Math.cos(a), y, Math.sin(a)], [Math.cos(a), 0, Math.sin(a)], i / segments, v);
  });
  const bottom = ring(0, 0), top = ring(1, 1);
  for (let i = 0; i < segments; i++) { b.index(bottom[i]!, top[i]!, bottom[i + 1]!); b.index(bottom[i + 1]!, top[i]!, top[i + 1]!); }
  const centre = b.smooth([0, 1, 0], [0, 1, 0], 0.5, 0.5);
  const cap = Array.from({ length: segments + 1 }, (_, i) => { const a = (i / segments) * Math.PI * 2; return b.smooth([Math.cos(a), 1, Math.sin(a)], [0, 1, 0], 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); });
  for (let i = 0; i < segments; i++) b.index(centre, cap[i + 1]!, cap[i]!);
  return b.shape;
}

/** Base radius 1, apex at y = 1, smooth sides. */
export function unitCone(segments = 9): Shape {
  const b = new ShapeBuilder();
  const slope = 1 / Math.SQRT2;
  const base = Array.from({ length: segments + 1 }, (_, i) => { const a = (i / segments) * Math.PI * 2; return b.smooth([Math.cos(a), 0, Math.sin(a)], [Math.cos(a) * slope, slope, Math.sin(a) * slope], i / segments, 0); });
  const apex = Array.from({ length: segments }, (_, i) => { const a = ((i + 0.5) / segments) * Math.PI * 2; return b.smooth([0, 1, 0], [Math.cos(a) * slope, slope, Math.sin(a) * slope], (i + 0.5) / segments, 1); });
  for (let i = 0; i < segments; i++) b.index(base[i]!, apex[i]!, base[i + 1]!);
  return b.shape;
}

/** Radius 1 centred on the origin, smooth normals. */
export function unitSphere(segments = 12, rings = 8): Shape {
  const b = new ShapeBuilder();
  const grid: number[][] = [];
  for (let r = 0; r <= rings; r++) {
    const phi = (r / rings) * Math.PI;
    grid.push(Array.from({ length: segments + 1 }, (_, i) => {
      const a = (i / segments) * Math.PI * 2;
      const p: V3 = [Math.sin(phi) * Math.cos(a), Math.cos(phi), Math.sin(phi) * Math.sin(a)];
      return b.smooth(p, p, i / segments, r / rings);
    }));
  }
  for (let r = 0; r < rings; r++) for (let i = 0; i < segments; i++) {
    const a = grid[r]![i]!, c = grid[r]![i + 1]!, d = grid[r + 1]![i]!, e = grid[r + 1]![i + 1]!;
    if (r > 0) b.index(a, c, d);
    if (r < rings - 1) b.index(c, e, d);
  }
  return b.shape;
}

/** Lumpy boulder: a deformed sphere (radius about 1) with a flattened underside and flat-shaded facets. */
export function unitRock(seed = 7, segments = 8, rings = 5, fine = false): Shape {
  const rand = seededRandom(seed);
  const noise = Array.from({ length: (rings + 1) * segments }, () => 0.72 + rand() * 0.5);
  /* `fine` adds a second, smaller noise octave so a large rock (a valley cliff scaled to 8 to 28 units) breaks into many small facets instead of a few huge flat planes */
  const detail = fine ? Array.from({ length: (rings + 1) * segments }, () => (rand() - 0.5) * 0.16) : null;
  const point = (r: number, i: number): V3 => {
    const phi = (r / rings) * Math.PI, a = ((i % segments) / segments) * Math.PI * 2;
    const base = r === 0 || r === rings ? 1 : noise[r * segments + (i % segments)]!;
    const k = detail && r !== 0 && r !== rings ? base + detail[r * segments + (i % segments)]! : base;
    const y = Math.cos(phi) * k;
    return [Math.sin(phi) * Math.cos(a) * k * 1.15, y < -0.3 ? -0.3 - (-0.3 - y) * 0.1 : y, Math.sin(phi) * Math.sin(a) * k * 1.05];
  };
  const b = new ShapeBuilder();
  const inside: V3 = [0, 0, 0];
  for (let r = 0; r < rings; r++) for (let i = 0; i < segments; i++) {
    const p00 = point(r, i), p01 = point(r, i + 1), p10 = point(r + 1, i), p11 = point(r + 1, i + 1);
    if (r > 0) b.tri(p00, p10, p01, inside);
    if (r < rings - 1) b.tri(p01, p10, p11, inside);
  }
  return b.shape;
}

/** Radius 1 disc facing up at y = 0 (blob shadows). */
export function unitDisc(segments = 20): Shape {
  const b = new ShapeBuilder();
  const centre = b.smooth([0, 0, 0], [0, 1, 0], 0.5, 0.5);
  const ring = Array.from({ length: segments + 1 }, (_, i) => { const a = (i / segments) * Math.PI * 2; return b.smooth([Math.cos(a), 0, Math.sin(a)], [0, 1, 0], 0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5); });
  for (let i = 0; i < segments; i++) b.index(centre, ring[i + 1]!, ring[i]!);
  return b.shape;
}

/** Curved forged katana oriented along local Z [-0.5..0.5] (compatible with `aim` scaling [1, 1, length]). */
export function unitKatana(segments = 6): Shape {
  const b = new ShapeBuilder();
  // Tsuba guard plate near grip (z = -0.34)
  const gz0 = -0.35, gz1 = -0.33, grx = 0.068, gry = 0.052;
  b.quad([-grx, -gry, gz1], [grx, -gry, gz1], [grx, gry, gz1], [-grx, gry, gz1]);
  b.quad([grx, -gry, gz0], [-grx, -gry, gz0], [-grx, gry, gz0], [grx, gry, gz0]);
  // Tsuka hilt [-0.50 .. -0.35]
  const hx = 0.022, hy = 0.028;
  b.quad([-hx, -hy, -0.35], [hx, -hy, -0.35], [hx, -hy, -0.5], [-hx, -hy, -0.5]);
  b.quad([-hx, hy, -0.5], [hx, hy, -0.5], [hx, hy, -0.35], [-hx, hy, -0.35]);
  b.quad([hx, -hy, -0.35], [hx, hy, -0.35], [hx, hy, -0.5], [hx, -hy, -0.5]);
  b.quad([-hx, hy, -0.35], [-hx, -hy, -0.35], [-hx, -hy, -0.5], [-hx, hy, -0.5]);
  // Sori curved shinogi-zukuri blade [-0.33 .. +0.50]
  for (let i = 0; i < segments; i++) {
    const t0 = i / segments, t1 = (i + 1) / segments;
    const z0 = -0.33 + t0 * 0.83, z1 = -0.33 + t1 * 0.83;
    const sori0 = t0 * t0 * 0.075, sori1 = t1 * t1 * 0.075;
    const taper0 = 1 - t0 * 0.55, taper1 = 1 - t1 * 0.55;
    const w0 = 0.014 * taper0, w1 = 0.014 * taper1;
    const hBack0 = sori0 + 0.022 * taper0, hBack1 = sori1 + 0.022 * taper1;
    const hEdge0 = sori0 - 0.018 * taper0, hEdge1 = sori1 - 0.018 * taper1;
    // Right cheek (spine to cutting edge)
    b.quad([w0, sori0, z0], [0, hEdge0, z0], [0, hEdge1, z1], [w1, sori1, z1]);
    b.quad([0, hBack0, z0], [w0, sori0, z0], [w1, sori1, z1], [0, hBack1, z1]);
    // Left cheek (spine to cutting edge)
    b.quad([0, hEdge0, z0], [-w0, sori0, z0], [-w1, sori1, z1], [0, hEdge1, z1]);
    b.quad([-w0, sori0, z0], [0, hBack0, z0], [0, hBack1, z1], [-w1, sori1, z1]);
  }
  return b.shape;
}

/** Octagonal iron-studded kanabo war club oriented along local Z [-0.5..0.5]. */
export function unitKanabo(sides = 8): Shape {
  const b = new ShapeBuilder();
  const ring = (z: number, r: number, v: number): number[] => Array.from({ length: sides + 1 }, (_, i) => {
    const a = (i / sides) * Math.PI * 2;
    return b.smooth([Math.cos(a) * r, Math.sin(a) * r, z], [Math.cos(a), Math.sin(a), 0], i / sides, v);
  });
  const sections: readonly [number, number, number][] = [[-0.5, 0.045, 0], [-0.22, 0.055, 0.25], [-0.16, 0.095, 0.35], [0.44, 0.145, 0.92], [0.5, 0.06, 1]];
  const rings = sections.map(([z, r, v]) => ring(z, r, v));
  for (let s = 0; s < rings.length - 1; s++) {
    const r0 = rings[s]!, r1 = rings[s + 1]!;
    for (let i = 0; i < sides; i++) {
      b.index(r0[i]!, r1[i]!, r0[i + 1]!);
      b.index(r0[i + 1]!, r1[i]!, r1[i + 1]!);
    }
  }
  // Iron studs along three bands of the club head
  for (const z of [-0.02, 0.16, 0.34]) {
    const r = 0.115 + (z + 0.02) * 0.07;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + z * 3;
      const cx = Math.cos(a) * r, cy = Math.sin(a) * r;
      const tip: V3 = [Math.cos(a) * (r + 0.048), Math.sin(a) * (r + 0.048), z];
      const inside: V3 = [0, 0, z];
      const tx = -Math.sin(a) * 0.024, ty = Math.cos(a) * 0.024, dz = 0.022;
      const p0: V3 = [cx - tx, cy - ty, z - dz], p1: V3 = [cx + tx, cy + ty, z - dz];
      const p2: V3 = [cx + tx, cy + ty, z + dz], p3: V3 = [cx - tx, cy - ty, z + dz];
      b.tri(p0, p1, tip, inside); b.tri(p1, p2, tip, inside); b.tri(p2, p3, tip, inside); b.tri(p3, p0, tip, inside);
    }
  }
  return b.shape;
}

/** Crescent katana slash ribbon in XZ (y = 0, radius 1, sweep 155 deg around -Z forward): u = sweep 0..1, v = inner..outer 0..1. */
export function unitCrescentArc(segments = 20): Shape {
  const b = new ShapeBuilder();
  const inner: number[] = [], outer: number[] = [];
  const span = 2.7; // ~155 deg
  for (let i = 0; i <= segments; i++) {
    const u = i / segments;
    const a = -span * 0.5 + u * span;
    const taper = Math.sin(u * Math.PI);
    const rOut = 1.0 + 0.12 * taper;
    const rIn = rOut - (0.12 + 0.52 * taper);
    const sx = Math.sin(a), cz = -Math.cos(a);
    inner.push(b.smooth([sx * rIn, -0.04 * (1 - u), cz * rIn], [0, 1, 0], u, 0));
    outer.push(b.smooth([sx * rOut, 0.06 * taper, cz * rOut], [0, 1, 0], u, 1));
  }
  for (let i = 0; i < segments; i++) {
    b.index(inner[i]!, outer[i]!, inner[i + 1]!);
    b.index(inner[i + 1]!, outer[i]!, outer[i + 1]!);
  }
  return b.shape;
}

/** Column-major model matrix: non-uniform scale, yaw about +Y (local +z faces `(sin yaw, cos yaw)`), translation. */
export function trs(x: number, y: number, z: number, yaw: number, sx: number, sy: number, sz: number): number[] {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  return [c * sx, 0, -s * sx, 0, 0, sy, 0, 0, s * sz, 0, c * sz, 0, x, y, z, 1];
}
