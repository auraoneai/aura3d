// PRD-07 P2-T4 — CPU ribbon trails (§6.2.9). Each trail keeps a ring of
// (position, time, width, color) points, appended only when the target moved
// farther than `minVertexDistance`. `buildGeometry` expands every trail into a
// camera-facing or surface-pinned triangle strip: 2 vertices per point, two
// triangles per segment, so an N-point trail draws 2·(N−1) triangles.
//
// The default alpha curve is the Resident renderer's ribbon alpha
// `0.45·(1 − segment/depth)` (ResidentGPUParticleRenderer.ts:512, E10).

export type AuraVec3 = readonly [number, number, number];
export type AuraVec4 = readonly [number, number, number, number];

export interface RibbonPoint {
  readonly position: AuraVec3;
  readonly time: number;
  readonly width: number;
  readonly color: AuraVec4;
}

export type RibbonOrientation = "camera" | "surface";

export interface RibbonTrailOptions {
  readonly id: string;
  /** Ring capacity; a full trail drops the oldest point (default 48). */
  readonly maxPoints?: number;
  /** Minimum world-space distance between appended points (default 0.05). */
  readonly minVertexDistance?: number;
  /** Default ribbon half-width multiplier (`point.width` wins when set). */
  readonly width?: number;
  readonly color?: AuraVec4;
  readonly orientation?: RibbonOrientation;
  /** `surface` orientation: strip is pinned to this normal (skid marks). */
  readonly surfaceNormal?: AuraVec3;
}

const MAX_POINTS = 48;
const MIN_VERTEX_DISTANCE = 0.05;
const RIBBON_ALPHA_PEAK = 0.45;

export class RibbonTrail {
  private readonly points: RibbonPoint[] = [];
  readonly options: Required<Omit<RibbonTrailOptions, "surfaceNormal">> & { readonly surfaceNormal?: AuraVec3 };

  constructor(options: RibbonTrailOptions) {
    this.options = {
      id: options.id,
      maxPoints: options.maxPoints ?? MAX_POINTS,
      minVertexDistance: options.minVertexDistance ?? MIN_VERTEX_DISTANCE,
      width: options.width ?? 0.3,
      color: options.color ?? [1, 1, 1, 1],
      orientation: options.orientation ?? "camera",
      surfaceNormal: options.surfaceNormal
    };
  }

  get pointCount(): number {
    return this.points.length;
  }

  getPoints(): readonly RibbonPoint[] {
    return this.points;
  }

  /** Appends a point when the trail moved farther than minVertexDistance. */
  push(position: AuraVec3, time: number, width?: number, color?: AuraVec4): boolean {
    const last = this.points[this.points.length - 1];
    if (last) {
      const dx = position[0] - last.position[0];
      const dy = position[1] - last.position[1];
      const dz = position[2] - last.position[2];
      if (Math.hypot(dx, dy, dz) < this.options.minVertexDistance) return false;
    }
    this.points.push({
      position,
      time,
      width: width ?? this.options.width,
      color: color ?? this.options.color
    });
    while (this.points.length > this.options.maxPoints) this.points.shift();
    return true;
  }

  clear(): void {
    this.points.length = 0;
  }
}

export interface RibbonGeometry {
  /** 12 floats per vertex: position(3) normal(3) uv(2) color(4). */
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  /** Which orientation group produced this geometry ("camera" | "surface"). */
  readonly orientation: RibbonOrientation;
}

/** Ribbon vertex stride in floats: pos3 + normal3 + uv2 + color4. */
export const RIBBON_VERTEX_FLOATS = 12;

const EPS = 1e-6;

/**
 * Owns every live trail and builds the per-orientation draw geometry. One
 * batch = one draw per orientation key (§6.2.9).
 */
export class RibbonBatch {
  private readonly trails = new Map<string, RibbonTrail>();

  /**
   * §6.9/P6-T3: producers that route `surface` trails through the decal pass
   * narrow this to ["camera"] under A3D_QR_VFX_DECALS so the ribbon pass does
   * not double-draw them. Default draws both groups (flag-off identical).
   */
  enabledOrientations: readonly RibbonOrientation[] = ["camera", "surface"];

  upsertTrail(options: RibbonTrailOptions): RibbonTrail {
    let trail = this.trails.get(options.id);
    if (!trail) {
      trail = new RibbonTrail(options);
      this.trails.set(options.id, trail);
    }
    return trail;
  }

  getTrail(id: string): RibbonTrail | undefined {
    return this.trails.get(id);
  }

  removeTrail(id: string): void {
    this.trails.delete(id);
  }

  get trailCount(): number {
    return this.trails.size;
  }

  clear(): void {
    this.trails.clear();
  }

  /**
   * Expand a trail's point ring into vertices/indices. `cameraPosition` is
   * required for `camera` orientation and ignored for `surface`.
   */
  buildGeometry(trail: RibbonTrail, cameraPosition: AuraVec3): RibbonGeometry | null {
    const pts = trail.getPoints();
    const n = pts.length;
    if (n < 2) return null;
    const orientation = trail.options.orientation;
    const vertexCount = n * 2;
    const vertices = new Float32Array(vertexCount * RIBBON_VERTEX_FLOATS);
    const segments = n - 1;
    const indices = new Uint32Array(segments * 6);

    for (let i = 0; i < n; i++) {
      const p = pts[i];
      // Central-difference tangent; endpoints reuse the neighbour edge.
      const prev = pts[Math.max(0, i - 1)].position;
      const next = pts[Math.min(n - 1, i + 1)].position;
      let tx = next[0] - prev[0];
      let ty = next[1] - prev[1];
      let tz = next[2] - prev[2];
      const tl = Math.hypot(tx, ty, tz);
      if (tl < EPS) {
        tx = 1; ty = 0; tz = 0;
      } else {
        tx /= tl; ty /= tl; tz /= tl;
      }

      let sx: number; let sy: number; let sz: number;
      let nx: number; let ny: number; let nz: number;
      if (orientation === "surface") {
        const sn = trail.options.surfaceNormal ?? [0, 1, 0];
        const nl = Math.hypot(sn[0], sn[1], sn[2]) || 1;
        nx = sn[0] / nl; ny = sn[1] / nl; nz = sn[2] / nl;
        // side = normalize(cross(tangent, normal))
        sx = ty * nz - tz * ny;
        sy = tz * nx - tx * nz;
        sz = tx * ny - ty * nx;
      } else {
        // side = normalize(cross(tangent, cameraPosition − point))
        const cx = cameraPosition[0] - p.position[0];
        const cy = cameraPosition[1] - p.position[1];
        const cz = cameraPosition[2] - p.position[2];
        sx = ty * cz - tz * cy;
        sy = tz * cx - tx * cz;
        sz = tx * cy - ty * cx;
        const cl = Math.hypot(cx, cy, cz) || 1;
        nx = cx / cl; ny = cy / cl; nz = cz / cl;
      }
      const sl = Math.hypot(sx, sy, sz);
      if (sl < EPS) {
        sx = nx; sy = ny; sz = nz;
      } else {
        sx /= sl; sy /= sl; sz /= sl;
      }

      const u = i / segments;
      // §6.2.9 / E10: default alpha curve 0.45·(1 − segment/maxPoints).
      const alpha = RIBBON_ALPHA_PEAK * (1 - i / trail.options.maxPoints) * p.color[3];
      const w = p.width * 0.5;
      for (let side = 0; side < 2; side++) {
        const sign = side === 0 ? -1 : 1;
        const o = (i * 2 + side) * RIBBON_VERTEX_FLOATS;
        vertices[o + 0] = p.position[0] + sx * w * sign;
        vertices[o + 1] = p.position[1] + sy * w * sign;
        vertices[o + 2] = p.position[2] + sz * w * sign;
        vertices[o + 3] = nx;
        vertices[o + 4] = ny;
        vertices[o + 5] = nz;
        vertices[o + 6] = u;
        vertices[o + 7] = side;
        vertices[o + 8] = p.color[0];
        vertices[o + 9] = p.color[1];
        vertices[o + 10] = p.color[2];
        vertices[o + 11] = alpha;
      }
      if (i > 0) {
        const base = (i - 1) * 6;
        const v0 = (i - 1) * 2;
        indices[base + 0] = v0;
        indices[base + 1] = v0 + 1;
        indices[base + 2] = v0 + 2;
        indices[base + 3] = v0 + 1;
        indices[base + 4] = v0 + 3;
        indices[base + 5] = v0 + 2;
      }
    }
    return { vertices, indices, vertexCount, triangleCount: segments * 2, orientation };
  }

  /** One merged geometry per enabled orientation group (the draw-key split). */
  buildAll(cameraPosition: AuraVec3): RibbonGeometry[] {
    const out: RibbonGeometry[] = [];
    for (const orientation of this.enabledOrientations) {
      const group = [...this.trails.values()].filter((t) => t.options.orientation === orientation);
      if (group.length === 0) continue;
      let totalVerts = 0;
      let totalIdx = 0;
      const built = group
        .map((t) => this.buildGeometry(t, cameraPosition))
        .filter((g): g is RibbonGeometry => g !== null);
      for (const g of built) {
        totalVerts += g.vertexCount;
        totalIdx += g.indices.length;
      }
      if (totalIdx === 0) continue;
      const vertices = new Float32Array(totalVerts * RIBBON_VERTEX_FLOATS);
      const indices = new Uint32Array(totalIdx);
      let vo = 0;
      let io = 0;
      let triangles = 0;
      for (const g of built) {
        vertices.set(g.vertices, vo);
        for (let i = 0; i < g.indices.length; i++) indices[io + i] = g.indices[i] + vo / RIBBON_VERTEX_FLOATS;
        vo += g.vertices.length;
        io += g.indices.length;
        triangles += g.triangleCount;
      }
      out.push({ vertices, indices, vertexCount: totalVerts, triangleCount: triangles, orientation });
    }
    return out;
  }
}
