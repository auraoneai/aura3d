/**
 * Seeded value-noise heightfield terrain for Aurora Lander.
 *
 * One generator produces every representation the route needs, from the same grid:
 *   - heights[]            row-major grid fed to the STATIC heightfield collider
 *   - custom geometry      visible terrain mesh (primitives.custom)
 *   - surface-query input  Float32 positions / Uint32 indices for createMeshSurfaceQuery
 *
 * Pad plateaus are flattened into the field itself so the visible mesh, the physics
 * heightfield and the query surface are one and the same data — no second source of
 * truth to drift.
 */
import { TERRAIN_CELLS_X, TERRAIN_CELLS_Z, TERRAIN_CELL_SIZE, TERRAIN_HEIGHT_SCALE, type LanderSite } from "./sites";

export interface TerrainFieldInput {
  readonly site: LanderSite;
}

export interface AuraVec3Tuple {
  readonly [key: number]: number;
}

/** Deterministic 32-bit hash — same seed and coordinates, same value, everywhere. */
function hash2(seed: number, x: number, y: number): number {
  let h = seed ^ 0x9e37_79b9;
  h = Math.imul(h ^ (x | 0), 0x85eb_ca6b);
  h ^= h >>> 13;
  h = Math.imul(h ^ (y | 0), 0xc2b2_ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 0xffff_ffff;
}

function smoothstep(t: number): number {
  const clamped = Math.min(1, Math.max(0, t));
  return clamped * clamped * (3 - 2 * clamped);
}

function valueNoise(seed: number, x: number, y: number): number {
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const tx = smoothstep(x - x0);
  const ty = smoothstep(y - y0);
  const v00 = hash2(seed, x0, y0);
  const v10 = hash2(seed, x0 + 1, y0);
  const v01 = hash2(seed, x0, y0 + 1);
  const v11 = hash2(seed, x0 + 1, y0 + 1);
  const a = v00 + (v10 - v00) * tx;
  const b = v01 + (v11 - v01) * tx;
  return a + (b - a) * ty;
}

/** Two-octave value noise in [-1, 1]. */
function noiseHeight(seed: number, x: number, z: number): number {
  const coarse = valueNoise(seed, x * 0.045, z * 0.045) * 2 - 1;
  const fine = valueNoise(seed ^ 0x51_ed, x * 0.14, z * 0.14) * 2 - 1;
  return coarse * 0.78 + fine * 0.22;
}

export interface TerrainField {
  readonly kind: "aurora-lander-heightfield";
  readonly rows: number;
  readonly columns: number;
  readonly cellSize: number;
  /** Row-major heights, index = row * columns + column. Row 0 sits at -Z edge. */
  readonly heights: readonly number[];
  /** World-space X of column centers. */
  readonly originX: number;
  readonly originZ: number;
  /** Visible mesh for primitives.custom (vec3 tuples). */
  readonly geometryPositions: ReadonlyArray<readonly [number, number, number]>;
  readonly geometryNormals: ReadonlyArray<readonly [number, number, number]>;
  readonly geometryIndices: readonly number[];
  /** Packed buffers for createMeshSurfaceQuery. */
  readonly queryPositions: Float32Array;
  readonly queryIndices: Uint32Array;
  /** Static-only heightfield collider shape (packages/physics Shape.heightfield layout). */
  readonly colliderShape: {
    readonly kind: "heightfield";
    readonly rows: number;
    readonly columns: number;
    readonly heights: readonly number[];
    readonly cellSize: number;
  };
  /** Height of each pad plateau after flattening. */
  readonly padHeights: readonly number[];
  readonly minHeight: number;
  readonly maxHeight: number;
}

/**
 * Grid sample with bilinear interpolation — used by gameplay for slope warnings
 * independent of the BVH query (the BVH remains the graded source of truth).
 */
export function sampleGridHeight(field: TerrainField, x: number, z: number): number {
  const fx = (x - field.originX) / field.cellSize;
  const fz = (z - field.originZ) / field.cellSize;
  const c0 = Math.min(field.columns - 1, Math.max(0, Math.floor(fx)));
  const r0 = Math.min(field.rows - 1, Math.max(0, Math.floor(fz)));
  const c1 = Math.min(field.columns - 1, c0 + 1);
  const r1 = Math.min(field.rows - 1, r0 + 1);
  const tx = fx - c0;
  const tz = fz - r0;
  const h00 = field.heights[r0 * field.columns + c0]!;
  const h10 = field.heights[r0 * field.columns + c1]!;
  const h01 = field.heights[r1 * field.columns + c0]!;
  const h11 = field.heights[r1 * field.columns + c1]!;
  const a = h00 + (h10 - h00) * tx;
  const b = h01 + (h11 - h01) * tx;
  return a + (b - a) * tz;
}

export function createTerrainField({ site }: TerrainFieldInput): TerrainField {
  const rows = TERRAIN_CELLS_Z;
  const columns = TERRAIN_CELLS_X;
  const cellSize = TERRAIN_CELL_SIZE;
  const width = (columns - 1) * cellSize;
  const depth = (rows - 1) * cellSize;
  const originX = -width / 2;
  const originZ = -depth / 2;

  // Site relief character: later sites read harsher via a steeper octave mix.
  const relief = 0.72 + site.id * 0.09;
  const raw: number[] = new Array(rows * columns).fill(0);
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < columns; c += 1) {
      const x = originX + c * cellSize;
      const z = originZ + r * cellSize;
      raw[r * columns + c] = noiseHeight(site.seed, x, z) * TERRAIN_HEIGHT_SCALE * relief;
    }
  }

  // Flatten pad plateaus into the field: full plateau inside 0.62*radius,
  // smooth blend out to the rim so the visible mesh has no shear cliff.
  const padHeights: number[] = [];
  for (const pad of site.pads) {
    const colF = (pad.x - originX) / cellSize;
    const rowF = (pad.z - originZ) / cellSize;
    const radiusCells = pad.radius / cellSize;
    // Plateau height sampled at the pad center pre-flattening, quantized lightly so
    // pads sit on plausible ground rather than floating slabs.
    const centerHeight = raw[Math.round(rowF) * columns + Math.round(colF)] ?? 0;
    const plateau = Math.round(centerHeight * 20) / 20;
    padHeights.push(plateau);
    // Flatten in WORLD space: every node within the core radius becomes exactly
    // plateau height, so bilinear samples inside the core read the plateau value
    // regardless of where the center falls between grid nodes.
    const reachCells = Math.ceil(radiusCells * 1.8) + 2;
    const rMin = Math.max(0, Math.floor(rowF - reachCells));
    const rMax = Math.min(rows - 1, Math.ceil(rowF + reachCells));
    const cMin = Math.max(0, Math.floor(colF - reachCells));
    const cMax = Math.min(columns - 1, Math.ceil(colF + reachCells));
    for (let rr = rMin; rr <= rMax; rr += 1) {
      for (let cc = cMin; cc <= cMax; cc += 1) {
        const nodeX = originX + cc * cellSize;
        const nodeZ = originZ + rr * cellSize;
        const dist = Math.hypot(nodeX - pad.x, nodeZ - pad.z) / cellSize;
        if (dist > radiusCells * 1.8) continue;
        const t = smoothstep((dist - radiusCells * 0.62) / (radiusCells * 1.18));
        const blended = plateau + ((raw[rr * columns + cc] ?? plateau) - plateau) * t;
        raw[rr * columns + cc] = blended;
      }
    }
  }

  // Build the shared representations.
  const heights = raw;
  const geometryPositions: Array<readonly [number, number, number]> = [];
  const geometryNormals: Array<readonly [number, number, number]> = [];
  const geometryIndices: number[] = [];
  const vertexIndexFor = new Map<string, number>();

  const normalAt = (r: number, c: number): readonly [number, number, number] => {
    // Central-difference terrain normal on the grid.
    const hl = heights[r * columns + Math.max(0, c - 1)]!;
    const hr = heights[r * columns + Math.min(columns - 1, c + 1)]!;
    const hd = heights[Math.max(0, r - 1) * columns + c]!;
    const hu = heights[Math.min(rows - 1, r + 1) * columns + c]!;
    const dx = (hr - hl) / (2 * cellSize);
    const dz = (hu - hd) / (2 * cellSize);
    const len = Math.hypot(dx, 1, dz);
    return [-dx / len, 1 / len, -dz / len];
  };

  const vertexAt = (r: number, c: number): number => {
    const key = r * columns + c;
    const existing = vertexIndexFor.get(String(key));
    if (existing !== undefined) return existing;
    const x = originX + c * cellSize;
    const z = originZ + r * cellSize;
    const y = heights[key]!;
    const normal = normalAt(r, c);
    const index = geometryPositions.length;
    geometryPositions.push([x, y, z]);
    geometryNormals.push([normal[0], normal[1], normal[2]]);
    vertexIndexFor.set(String(key), index);
    return index;
  };

  for (let r = 0; r + 1 < rows; r += 1) {
    for (let c = 0; c + 1 < columns; c += 1) {
      const i00 = vertexAt(r, c);
      const i10 = vertexAt(r, c + 1);
      const i01 = vertexAt(r + 1, c);
      const i11 = vertexAt(r + 1, c + 1);
      // CCW when viewed from above (+Y), matching upward normals.
      geometryIndices.push(i00, i01, i11, i00, i11, i10);
    }
  }

  const queryPositions = new Float32Array(geometryPositions.length * 3);
  geometryPositions.forEach(([x, y, z], index) => {
    queryPositions[index * 3] = x;
    queryPositions[index * 3 + 1] = y;
    queryPositions[index * 3 + 2] = z;
  });
  const queryIndices = new Uint32Array(geometryIndices);

  let minHeight = Infinity;
  let maxHeight = -Infinity;
  for (const h of heights) {
    if (h < minHeight) minHeight = h;
    if (h > maxHeight) maxHeight = h;
  }

  return {
    kind: "aurora-lander-heightfield",
    rows,
    columns,
    cellSize,
    heights,
    originX,
    originZ,
    geometryPositions,
    geometryNormals,
    geometryIndices,
    queryPositions,
    queryIndices,
    colliderShape: {
      kind: "heightfield",
      rows,
      columns,
      heights,
      cellSize
    },
    padHeights,
    minHeight,
    maxHeight
  };
}
