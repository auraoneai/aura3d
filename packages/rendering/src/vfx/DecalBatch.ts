// PRD-07 P6-T1 — §6.9 DecalBatch: ring-allocated merged geometry per atlas
// page × blend mode. The engine upserts decal nodes; the pass rebuilds one
// dynamic vertex buffer per (page, blend) group and draws it once — decals
// are no longer one draw each (E46). Capacity is the C-27 tier cap
// (Low 64 / Medium 128 / High 256 / Ultra 512, replacing the hard-coded
// AURA_DECAL_MAX_DECALS=32 under A3D_QR_VFX_DECALS); the ring evicts
// oldest-first. Life/fade-out curves are evaluated on the CPU into the
// vertex alpha at merge time (≤ 512 decals — trivial).

import type { RibbonGeometry } from "./RibbonBatch";

export type AuraVec3 = readonly [number, number, number];
export type AuraVec4 = readonly [number, number, number, number];

export type DecalBlendMode = "alpha" | "multiply";

/** C-27 decal capacity per tier (§6.9 — was a hard 32). */
export const DECAL_TIER_CAP = { low: 64, medium: 128, high: 256, ultra: 512 } as const;

/** Decal vertex stride in floats: pos3 + normal3 + uv2 + color4 + fade4. */
export const DECAL_VERTEX_FLOATS = 16;

export interface DecalVertexData {
  /** Interleaved world-space vertices; `stride` floats per vertex. */
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  /**
   * Vertex stride: 8 (pos3+normal3+uv2 — color/fade stamped from the slot at
   * merge time) or 16 (full decal layout, fully baked — used by
   * surface-oriented ribbon trails that carry per-vertex colors). Default 8.
   */
  readonly stride?: 8 | 16;
}

export interface DecalSlotOptions {
  /** Stable key (node id / handle id). */
  readonly id: string;
  /** Page key — the atlas page or texture identity the decal samples. */
  readonly pageKey: string;
  /** Blend group: "alpha" marks or "multiply" grime (§6.9). */
  readonly blend?: DecalBlendMode;
  /** Projected world-space vertex data (from ProjectedDecalGeometry or a quad). */
  readonly geometry: DecalVertexData;
  readonly color?: AuraVec4;
  readonly roughness?: number;
  /** §6.9 fade envelope (degrees + metres). */
  readonly fade?: { readonly angleStart?: number; readonly angleEnd?: number; readonly near?: number; readonly far?: number };
  readonly polygonOffset?: { readonly factor: number; readonly units: number };
  /** Life curve (seconds): fadeIn → full → fadeOut → evict at `life`. */
  readonly life?: number;
  readonly fadeIn?: number;
  readonly fadeOut?: number;
}

export interface DecalGeometry {
  readonly vertices: Float32Array;
  readonly indices: Uint32Array;
  readonly vertexCount: number;
  readonly triangleCount: number;
  readonly pageKey: string;
  readonly blend: DecalBlendMode;
  readonly polygonOffset: { readonly factor: number; readonly units: number } | null;
}

interface DecalSlot extends Required<Pick<DecalSlotOptions, "id" | "pageKey" | "geometry">> {
  blend: DecalBlendMode;
  color: AuraVec4;
  roughness: number;
  fade: { angleStart: number; angleEnd: number; near: number; far: number };
  polygonOffset: { factor: number; units: number } | null;
  spawnTime: number;
  life: number;
  fadeIn: number;
  fadeOut: number;
}

/** α at age `t` for the fade-in/hold/fade-out life curve. */
export function decalLifeAlpha(slot: Pick<DecalSlot, "life" | "fadeIn" | "fadeOut" | "spawnTime">, now: number): number {
  const age = now - slot.spawnTime;
  if (!Number.isFinite(slot.life)) return 1;
  if (age < 0 || age >= slot.life) return 0;
  const fadeIn = slot.fadeIn > 0 ? Math.min(1, age / slot.fadeIn) : 1;
  const fadeOutStart = slot.life - slot.fadeOut;
  const fadeOut = slot.fadeOut > 0 && age > fadeOutStart ? Math.max(0, (slot.life - age) / slot.fadeOut) : 1;
  return fadeIn * fadeOut;
}

/**
 * The merged decal ring. `upsert` inserts or replaces; on overflow the
 * oldest-inserted slot evicts (oldest-first, §6.9). `buildAll` merges each
 * (pageKey, blend) group into one interleaved buffer for a single draw.
 */
export class DecalBatch {
  private readonly slots = new Map<string, DecalSlot>(); // insertion order = ring order
  private readonly spawns = new Map<string, number>();

  constructor(readonly capacity: number) {
    if (!Number.isInteger(capacity) || capacity <= 0) throw new Error("DecalBatch capacity must be a positive integer.");
  }

  get size(): number {
    return this.slots.size;
  }

  /** Live slot ids — lets producers drop slots whose nodes left the scene. */
  ids(): readonly string[] {
    return [...this.slots.keys()];
  }

  has(id: string): boolean {
    return this.slots.has(id);
  }

  /** True when the decal is present after upsert; evicted-oldest semantics. */
  upsert(options: DecalSlotOptions, now: number): boolean {
    if (!this.spawns.has(options.id)) this.spawns.set(options.id, now);
    if (!this.slots.has(options.id) && this.slots.size >= this.capacity) {
      const oldest = this.slots.keys().next().value!;
      this.slots.delete(oldest);
      this.spawns.delete(oldest);
    }
    const spawnTime = this.spawns.get(options.id) ?? now;
    // Ring order = first-insertion order (Map.set on an existing key keeps its
    // position), so a living decal's per-frame refresh never resets eviction.
    this.slots.set(options.id, {
      id: options.id,
      pageKey: options.pageKey,
      blend: options.blend ?? "alpha",
      geometry: options.geometry,
      color: options.color ?? [1, 1, 1, 1],
      roughness: options.roughness ?? 0.5,
      fade: {
        angleStart: options.fade?.angleStart ?? 55,
        angleEnd: options.fade?.angleEnd ?? 80,
        near: options.fade?.near ?? 0,
        far: options.fade?.far ?? Number.POSITIVE_INFINITY
      },
      polygonOffset: options.polygonOffset ?? { factor: -2, units: -2 },
      spawnTime,
      life: options.life ?? Number.POSITIVE_INFINITY,
      fadeIn: options.fadeIn ?? 0,
      fadeOut: options.fadeOut ?? 0
    });
    return true;
  }

  remove(id: string): void {
    this.slots.delete(id);
    this.spawns.delete(id);
  }

  clear(): void {
    this.slots.clear();
    this.spawns.clear();
  }

  /** Age out expired decals, then merge each (page, blend) group. */
  buildAll(now: number): DecalGeometry[] {
    for (const [id, slot] of this.slots) {
      if (Number.isFinite(slot.life) && now - slot.spawnTime >= slot.life) {
        this.slots.delete(id);
        this.spawns.delete(id);
      }
    }
    const groups = new Map<string, { blend: DecalBlendMode; polygonOffset: DecalSlot["polygonOffset"]; items: DecalSlot[] }>();
    for (const slot of this.slots.values()) {
      const key = `${slot.pageKey}|${slot.blend}`;
      let group = groups.get(key);
      if (!group) groups.set(key, (group = { blend: slot.blend, polygonOffset: slot.polygonOffset, items: [] }));
      group.items.push(slot);
    }
    const out: DecalGeometry[] = [];
    for (const [key, group] of groups) {
      const pageKey = key.slice(0, key.indexOf("|"));
      let totalVerts = 0;
      let totalIdx = 0;
      for (const slot of group.items) {
        totalVerts += slot.geometry.vertices.length / (slot.geometry.stride ?? 8);
        totalIdx += slot.geometry.indices.length;
      }
      const vertices = new Float32Array(totalVerts * DECAL_VERTEX_FLOATS);
      const indices = new Uint32Array(totalIdx);
      let vo = 0;
      let io = 0;
      let triangles = 0;
      for (const slot of group.items) {
        const alpha = decalLifeAlpha(slot, now) * slot.color[3];
        const src = slot.geometry.vertices;
        const stride = slot.geometry.stride ?? 8;
        const vc = src.length / stride;
        for (let v = 0; v < vc; v += 1) {
          const s = v * stride;
          const o = vo + v * DECAL_VERTEX_FLOATS;
          vertices[o + 0] = src[s + 0];
          vertices[o + 1] = src[s + 1];
          vertices[o + 2] = src[s + 2];
          vertices[o + 3] = src[s + 3];
          vertices[o + 4] = src[s + 4];
          vertices[o + 5] = src[s + 5];
          vertices[o + 6] = src[s + 6];
          vertices[o + 7] = src[s + 7];
          if (stride === 16) {
            // Fully baked vertices: keep color+fade, apply only the life alpha.
            vertices[o + 8] = src[s + 8];
            vertices[o + 9] = src[s + 9];
            vertices[o + 10] = src[s + 10];
            vertices[o + 11] = src[s + 11] * decalLifeAlpha(slot, now);
            vertices[o + 12] = src[s + 12];
            vertices[o + 13] = src[s + 13];
            vertices[o + 14] = src[s + 14];
            vertices[o + 15] = src[s + 15];
          } else {
            vertices[o + 8] = slot.color[0];
            vertices[o + 9] = slot.color[1];
            vertices[o + 10] = slot.color[2];
            vertices[o + 11] = alpha;
            vertices[o + 12] = slot.fade.angleStart;
            vertices[o + 13] = slot.fade.angleEnd;
            vertices[o + 14] = slot.fade.near;
            vertices[o + 15] = slot.fade.far;
          }
        }
        for (let i = 0; i < slot.geometry.indices.length; i += 1) {
          indices[io + i] = slot.geometry.indices[i] + vo / DECAL_VERTEX_FLOATS;
        }
        vo += vc * DECAL_VERTEX_FLOATS;
        io += slot.geometry.indices.length;
        triangles += slot.geometry.indices.length / 3;
      }
      out.push({
        vertices,
        indices,
        vertexCount: totalVerts,
        triangleCount: triangles,
        pageKey,
        blend: group.blend,
        polygonOffset: group.polygonOffset
      });
    }
    return out;
  }
}

/**
 * Flat-quad decal geometry for the common `decals.project` path: XZ ±0.5
 * plane (facing +Y) transformed by quaternion `q` + `position`, lifted along
 * the rotated +Y by `normalOffset`, UV [0,1]².
 */
export function decalQuadGeometry(
  q: readonly [number, number, number, number],
  position: AuraVec3,
  size: readonly [number, number],
  normalOffset: number
): DecalVertexData {
  const rot = (v: readonly [number, number, number]): [number, number, number] => {
    const [x, y, z] = v;
    const [qx, qy, qz, qw] = q;
    // t = 2·q.xyz × v
    const tx = 2 * (qy * z - qz * y);
    const ty = 2 * (qz * x - qx * z);
    const tz = 2 * (qx * y - qy * x);
    return [
      x + qw * tx + (qy * tz - qz * ty),
      y + qw * ty + (qz * tx - qx * tz),
      z + qw * tz + (qx * ty - qy * tx)
    ];
  };
  const hw = size[0] * 0.5;
  const hh = size[1] * 0.5;
  const normal = rot([0, 1, 0]);
  const verts: number[] = [];
  const corners: readonly [number, number][] = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
  const uvs: readonly [number, number][] = [[0, 1], [1, 1], [1, 0], [0, 0]];
  for (let i = 0; i < 4; i += 1) {
    const local = rot([corners[i][0], normalOffset, corners[i][1]]);
    verts.push(
      position[0] + local[0], position[1] + local[1], position[2] + local[2],
      normal[0], normal[1], normal[2],
      uvs[i][0], uvs[i][1]
    );
  }
  return {
    vertices: new Float32Array(verts),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3])
  };
}

/**
 * §6.9/P6-T3 — convert a built surface-orientation ribbon strip (12-float
 * layout: pos3+normal3+uv2+color4) into fully baked 16-float decal vertices:
 * per-vertex color preserved, fade baked to "no fade" (angleEnd<=angleStart,
 * far=+inf, disabled in the shader). Indices shared verbatim.
 */
export function ribbonStripToDecalGeometry(geometry: RibbonGeometry): DecalVertexData {
  const src = geometry.vertices;
  const vc = src.length / 12;
  const vertices = new Float32Array(vc * DECAL_VERTEX_FLOATS);
  for (let v = 0; v < vc; v += 1) {
    const s = v * 12;
    const o = v * DECAL_VERTEX_FLOATS;
    for (let k = 0; k < 12; k += 1) vertices[o + k] = src[s + k]!;
    vertices[o + 12] = 0;
    vertices[o + 13] = 0;
    vertices[o + 14] = 0;
    vertices[o + 15] = Number.POSITIVE_INFINITY;
  }
  return { vertices, indices: geometry.indices, stride: 16 };
}
