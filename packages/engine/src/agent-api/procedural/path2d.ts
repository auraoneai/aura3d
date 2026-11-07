import type { ProceduralVec2 } from "./types.js";

export interface Path2DPointsOptions {
  /** Samples per curved segment (quad, cubic or arc). Default 12. */
  readonly curveSegments?: number;
}

type Command =
  | { readonly kind: "line"; readonly to: ProceduralVec2 }
  | { readonly kind: "quad"; readonly c: ProceduralVec2; readonly to: ProceduralVec2 }
  | { readonly kind: "cubic"; readonly c1: ProceduralVec2; readonly c2: ProceduralVec2; readonly to: ProceduralVec2 }
  | { readonly kind: "arc"; readonly center: ProceduralVec2; readonly radius: number; readonly from: number; readonly to: number };

/**
 * Chainable 2D path: lines, quadratic and cubic Bezier curves and arcs, sampled into a point list that
 * feeds `latheGeometry({ profile })` or `sweepGeometry({ profile })`. Pure data, deterministic.
 */
export class Path2D {
  private start: ProceduralVec2 = [0, 0];
  private cursor: ProceduralVec2 = [0, 0];
  private readonly commands: Command[] = [];
  private isClosed = false;

  moveTo(x: number, y: number): this {
    if (this.commands.length > 0) throw new Error("procedural: path2d supports a single sub-path; call moveTo first");
    this.start = [x, y];
    this.cursor = [x, y];
    return this;
  }
  lineTo(x: number, y: number): this {
    this.commands.push({ kind: "line", to: [x, y] });
    this.cursor = [x, y];
    return this;
  }
  quadTo(cx: number, cy: number, x: number, y: number): this {
    this.commands.push({ kind: "quad", c: [cx, cy], to: [x, y] });
    this.cursor = [x, y];
    return this;
  }
  cubicTo(c1x: number, c1y: number, c2x: number, c2y: number, x: number, y: number): this {
    this.commands.push({ kind: "cubic", c1: [c1x, c1y], c2: [c2x, c2y], to: [x, y] });
    this.cursor = [x, y];
    return this;
  }
  /** Circular arc around (cx, cy) from angle `from` to `to` (radians, counter-clockwise when to > from). Starts at the arc start point. */
  arc(cx: number, cy: number, radius: number, from: number, to: number): this {
    const sx = cx + Math.cos(from) * radius, sy = cy + Math.sin(from) * radius;
    if (this.commands.length === 0 && this.cursor[0] === 0 && this.cursor[1] === 0 && this.start[0] === 0 && this.start[1] === 0) {
      this.start = [sx, sy];
    } else if (Math.hypot(this.cursor[0] - sx, this.cursor[1] - sy) > 1e-9) {
      this.commands.push({ kind: "line", to: [sx, sy] });
    }
    this.commands.push({ kind: "arc", center: [cx, cy], radius, from, to });
    this.cursor = [cx + Math.cos(to) * radius, cy + Math.sin(to) * radius];
    return this;
  }
  /** Mark the path as a closed polygon (the last point connects back to the first). */
  close(): this {
    this.isClosed = true;
    return this;
  }
  get closed(): boolean {
    return this.isClosed;
  }

  /** Sample the path. A closed path does not repeat its first point at the end. */
  points(options: Path2DPointsOptions = {}): ProceduralVec2[] {
    const n = options.curveSegments ?? 12;
    if (!Number.isInteger(n) || n < 1) throw new RangeError("procedural: curveSegments must be an integer >= 1");
    const out: Array<[number, number]> = [[this.start[0], this.start[1]]];
    let at: ProceduralVec2 = this.start;
    for (const c of this.commands) {
      if (c.kind === "line") out.push([c.to[0], c.to[1]]);
      else if (c.kind === "quad") {
        for (let i = 1; i <= n; i += 1) {
          const t = i / n, u = 1 - t;
          out.push([u * u * at[0] + 2 * u * t * c.c[0] + t * t * c.to[0], u * u * at[1] + 2 * u * t * c.c[1] + t * t * c.to[1]]);
        }
      } else if (c.kind === "cubic") {
        for (let i = 1; i <= n; i += 1) {
          const t = i / n, u = 1 - t;
          const a = u * u * u, b = 3 * u * u * t, d = 3 * u * t * t, e = t * t * t;
          out.push([a * at[0] + b * c.c1[0] + d * c.c2[0] + e * c.to[0], a * at[1] + b * c.c1[1] + d * c.c2[1] + e * c.to[1]]);
        }
      } else {
        const steps = Math.max(1, Math.ceil(n * Math.abs(c.to - c.from) / (Math.PI / 2)));
        for (let i = 1; i <= steps; i += 1) {
          const a = c.from + (c.to - c.from) * (i / steps);
          out.push([c.center[0] + Math.cos(a) * c.radius, c.center[1] + Math.sin(a) * c.radius]);
        }
      }
      const last = out[out.length - 1]!;
      at = [last[0], last[1]];
    }
    if (this.isClosed) {
      const f = out[0]!, l = out[out.length - 1]!;
      if (out.length > 1 && Math.hypot(f[0] - l[0], f[1] - l[1]) < 1e-9) out.pop();
    }
    return out;
  }
}

/** Start a 2D path at (0, 0), or call `.moveTo(x, y)` first. */
export function path2d(): Path2D {
  return new Path2D();
}
