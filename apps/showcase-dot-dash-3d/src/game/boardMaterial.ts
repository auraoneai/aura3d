// Glint Courier: the baked PCB (GU47 DD47-M1). Bakes the board's albedo, tangent-space normal, occlusion and trace
// mask from the maze rows, so the slab under the chips is a real circuit board: copper traces tented under the solder
// mask along every corridor, exposed pads under each gull-wing pin and under the perimeter components, plated vias in
// the component margin, a silkscreen frame and fiducials, an FR-4 weave and contact shadow at the chip feet.
//
// Pure and deterministic (no engine or DOM imports): world.ts paints the result into three live canvas textures that
// it repaints on a board change, and `scripts/bake-board-textures.mjs` writes the same maps as PNGs for review.
// Presentation only (PRD D8): it reads the parsed maze, never the sim.

import { idx, type ParsedMaze } from "./grid.js";
import { BENCH, hexRgb, type BoardLookRow } from "./look.js";

/** Bake size: the board is 34 x 26 world units, so 1024 x 784 is ~30 texels a unit (a tile is 30 texels wide). */
export const BOARD_BAKE = { width: 1024, height: 784 } as const;
/** Phones and the Low tier bake at half size (a quarter of the texture memory). */
export const BOARD_BAKE_LOW = { width: 512, height: 392 } as const;

/** World offset of tile (0, 0); matches world.ts OX / OZ. */
const OX = -9, OZ = -10;

/** Feature sizes in world units. */
export const BAKE_FEATURES = {
  /** Half-width of a copper trace (the instanced trace is 0.12 wide). */
  trace: 0.06,
  /** Half-width of the tented ridge the solder mask forms over a trace. */
  tent: 0.11,
  /** Pin pads: half-length along the pin, half-width across it, offset of the pad centre in from the tile edge. */
  pad: { half: 0.1, halfWidth: 0.07, inset: 0.04, lateral: 0.22 },
  /** Plated vias in the component margin: outer and hole radius, grid pitch and fill share. */
  via: { outer: 0.12, hole: 0.055, pitch: 1.1, share: 0.32 },
  /** Silkscreen line half-width. */
  silk: 0.035,
  /** Contact shadow reach at the foot of an epoxy chip. */
  ao: 0.16
} as const;

/** A component footprint on the board margin: square side `w` centred on (x, z) in world units. */
export interface BoardFootprint {
  readonly x: number;
  readonly z: number;
  readonly w: number;
}

export interface BoardBakeInput {
  readonly maze: ParsedMaze;
  readonly look: BoardLookRow;
  /** Bare copper pads under the perimeter component stubs. */
  readonly pads?: readonly BoardFootprint[];
  /** Silkscreen outlines around the pedestals. */
  readonly outlines?: readonly BoardFootprint[];
  readonly width?: number;
  readonly height?: number;
}

export interface BoardMaps {
  readonly width: number;
  readonly height: number;
  /** sRGB base colour, RGBA8, row 0 = far edge (-z) of the board, as a canvas with flipY maps it. */
  readonly albedo: Uint8ClampedArray<ArrayBuffer>;
  /** Tangent-space normal (OpenGL, +y = -z on the board top), RGBA8 linear. */
  readonly normal: Uint8ClampedArray<ArrayBuffer>;
  /** Occlusion in R (G, B repeat it), RGBA8 linear. */
  readonly occlusion: Uint8ClampedArray<ArrayBuffer>;
  /** 1 byte a texel: 255 on copper traces (the signature's lit paths), 0 elsewhere. */
  readonly traceMask: Uint8Array;
}

const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

/** Small integer hash in 0..1 (stable across platforms). */
function hash01(a: number, b: number, seed: number): number {
  let h = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + Math.imul(seed, 2246822519)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

function seedOf(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619);
  return h | 0;
}

type Layer = "mask" | "tent" | "copper" | "via-hole" | "silk";

/** One texel of the board: which layer shows and the surface height (world units, for the normal map). */
interface Texel {
  layer: Layer;
  height: number;
  trace: boolean;
  ao: number;
}

/**
 * Bakes one board. Cost is linear in texels (about 0.8 M on the full size); the result is a pure function of the
 * maze rows, the look row and the footprints, so equal inputs give byte-equal maps.
 */
export function bakeBoardMaps(input: BoardBakeInput): BoardMaps {
  const width = input.width ?? BOARD_BAKE.width;
  const height = input.height ?? BOARD_BAKE.height;
  const { maze: m, look } = input;
  const [sizeX, , sizeZ] = BENCH.board.size;
  const seed = seedOf(m.def.id);
  const F = BAKE_FEATURES;

  const open = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
    const i = idx(m.width, x, y);
    return !m.wall[i] && m.walkable[i] === true;
  };
  const wall = (x: number, y: number): boolean => x >= 0 && y >= 0 && x < m.width && y < m.height && m.wall[idx(m.width, x, y)] === true;

  const mazeMinX = OX - 0.5, mazeMaxX = OX + m.width - 0.5;
  const mazeMinZ = OZ - 0.5, mazeMaxZ = OZ + m.height - 0.5;
  const pads = input.pads ?? [];
  const outlines = input.outlines ?? [];
  // Silkscreen frame just inside the board edge and around the maze; fiducials in three corners.
  const frameInset = 0.45;
  const fiducials: readonly (readonly [number, number])[] = [
    [-sizeX / 2 + 1.1, -sizeZ / 2 + 1.1], [sizeX / 2 - 1.1, -sizeZ / 2 + 1.1], [-sizeX / 2 + 1.1, sizeZ / 2 - 1.1]
  ];

  const texel: Texel = { layer: "mask", height: 0, trace: false, ao: 1 };
  const sample = (x: number, z: number): Texel => {
    texel.layer = "mask";
    texel.height = 0;
    texel.trace = false;
    texel.ao = 1;
    const tx = Math.round(x - OX), ty = Math.round(z - OZ);
    const lx = x - (tx + OX), lz = z - (ty + OZ);
    const inMaze = x > mazeMinX && x < mazeMaxX && z > mazeMinZ && z < mazeMaxZ;
    if (inMaze) {
      if (wall(tx, ty)) {
        // Under a chip: the body hides it; keep a dark, occluded mask.
        texel.ao = 0.45;
      } else {
        // Contact shadow from the chip walls around this tile, and the pin pads along each chip face.
        let ao = 1;
        const sides = [[1, 0, lx], [-1, 0, -lx], [0, 1, lz], [0, -1, -lz]] as const;
        for (const [dx, dy, along] of sides) {
          if (!wall(tx + dx, ty + dy)) continue;
          const gap = 0.5 - along + 0.05;
          ao = Math.min(ao, 1 - 0.42 * (1 - smooth(0, F.ao, gap)));
          const lateral = dx !== 0 ? lz : lx;
          const padAlong = Math.abs(along - (0.5 - F.pad.inset - F.pad.half));
          for (const t of [-F.pad.lateral, F.pad.lateral]) {
            if (padAlong < F.pad.half && Math.abs(lateral - t) < F.pad.halfWidth) {
              texel.layer = "copper";
              texel.height = 0.018;
            }
          }
        }
        texel.ao = ao;
        if (texel.layer === "mask" && open(tx, ty)) {
          // Trace arms toward each open neighbour, plus the tile-centre node.
          let d = Math.max(Math.abs(lx), Math.abs(lz));
          if (open(tx + 1, ty) && lx >= 0) d = Math.min(d, Math.abs(lz));
          if (open(tx - 1, ty) && lx <= 0) d = Math.min(d, Math.abs(lz));
          if (open(tx, ty + 1) && lz >= 0) d = Math.min(d, Math.abs(lx));
          if (open(tx, ty - 1) && lz <= 0) d = Math.min(d, Math.abs(lx));
          if (d < F.trace) {
            texel.trace = true;
            texel.layer = "tent";
            texel.height = 0.012;
          } else if (d < F.tent) {
            texel.layer = "tent";
            texel.height = 0.012 * (1 - smooth(F.trace, F.tent, d));
          }
        }
      }
    } else {
      // Component margin: plated vias on a jittered grid, pads under the component stubs, outlines round pedestals.
      const gx = Math.floor(x / F.via.pitch), gz = Math.floor(z / F.via.pitch);
      if (hash01(gx, gz, seed) < F.via.share) {
        const cx = (gx + 0.3 + 0.4 * hash01(gz, gx, seed + 1)) * F.via.pitch;
        const cz = (gz + 0.3 + 0.4 * hash01(gx + 7, gz + 3, seed + 2)) * F.via.pitch;
        const r = Math.hypot(x - cx, z - cz);
        if (r < F.via.hole) { texel.layer = "via-hole"; texel.height = -0.02; texel.ao = 0.55; }
        else if (r < F.via.outer) { texel.layer = "copper"; texel.height = 0.016; }
      }
      for (const p of pads) {
        const h = p.w * 0.5 + 0.08;
        if (Math.abs(x - p.x) < h && Math.abs(z - p.z) < h) { texel.layer = "copper"; texel.height = 0.018; texel.ao = 0.7; }
      }
      for (const o of outlines) {
        const h = o.w * 0.5 + 0.12;
        const edge = Math.max(Math.abs(x - o.x), Math.abs(z - o.z));
        if (Math.abs(edge - h) < F.silk) { texel.layer = "silk"; texel.height = 0.006; }
      }
      // Silk frame 0.35 outside the maze (Chebyshev distance to the frame rectangle).
      const frame = Math.max(Math.abs(x - (mazeMinX + mazeMaxX) / 2) - ((mazeMaxX - mazeMinX) / 2 + 0.35), Math.abs(z - (mazeMinZ + mazeMaxZ) / 2) - ((mazeMaxZ - mazeMinZ) / 2 + 0.35));
      if (Math.abs(frame) < F.silk) { texel.layer = "silk"; texel.height = 0.006; }
    }
    // Board-edge silk frame and fiducials (bare copper dot in a mask-free ring).
    const edgeDist = Math.min(x + sizeX / 2, sizeX / 2 - x, z + sizeZ / 2, sizeZ / 2 - z);
    if (Math.abs(edgeDist - frameInset) < F.silk) { texel.layer = "silk"; texel.height = 0.006; }
    for (const [fx, fz] of fiducials) {
      const r = Math.hypot(x - fx, z - fz);
      if (r < 0.22) { texel.layer = "copper"; texel.height = 0.018; }
      else if (r < 0.42 && texel.layer !== "silk") { texel.layer = "via-hole"; texel.height = -0.004; texel.ao = 1; }
    }
    // The routed edge of the board reads a touch darker (FR-4 core showing through the mask).
    if (edgeDist < 0.12) texel.ao = Math.min(texel.ao, 0.7 + 2.5 * edgeDist);
    return texel;
  };

  const mask = hexRgb(look.mask), copper = hexRgb(look.copper), silk = hexRgb(look.silk);
  const tent = [0, 1, 2].map((c) => mask[c]! * 0.72 + copper[c]! * 0.28) as [number, number, number];
  const bare: readonly [number, number, number] = [0.06, 0.055, 0.05];
  const n = width * height;
  const albedo = new Uint8ClampedArray(n * 4);
  const normal = new Uint8ClampedArray(n * 4);
  const occlusion = new Uint8ClampedArray(n * 4);
  const traceMask = new Uint8Array(n);
  const heights = new Float32Array(n);
  const texelX = sizeX / width, texelZ = sizeZ / height;
  for (let r = 0; r < height; r++) {
    const z = (r + 0.5) * texelZ - sizeZ / 2;
    for (let c = 0; c < width; c++) {
      const x = (c + 0.5) * texelX - sizeX / 2;
      const t = sample(x, z);
      const i = r * width + c;
      heights[i] = t.height;
      // FR-4 glass weave under the mask: a faint plain-weave modulation (+-3%).
      const weave = 1 + 0.03 * Math.sin(x * 37.7) * Math.sin(z * 37.7);
      const base = t.layer === "copper" ? copper : t.layer === "silk" ? silk : t.layer === "via-hole" ? bare : t.layer === "tent" ? tent : mask;
      const k = t.layer === "copper" || t.layer === "silk" ? 1 : weave;
      albedo[i * 4] = Math.round(base[0] * k * 255);
      albedo[i * 4 + 1] = Math.round(base[1] * k * 255);
      albedo[i * 4 + 2] = Math.round(base[2] * k * 255);
      albedo[i * 4 + 3] = 255;
      const ao = Math.round(t.ao * 255);
      occlusion[i * 4] = ao;
      occlusion[i * 4 + 1] = ao;
      occlusion[i * 4 + 2] = ao;
      occlusion[i * 4 + 3] = 255;
      traceMask[i] = t.trace ? 255 : 0;
    }
  }
  // Normal from the height field (central differences in world units). u runs along +x; v runs toward -z (row 0 is
  // the far edge and the canvas is uploaded with flipY), so +green tilts toward -z.
  for (let r = 0; r < height; r++) {
    for (let c = 0; c < width; c++) {
      const i = r * width + c;
      const hl = heights[r * width + Math.max(0, c - 1)]!, hr = heights[r * width + Math.min(width - 1, c + 1)]!;
      const hn = heights[Math.max(0, r - 1) * width + c]!, hs = heights[Math.min(height - 1, r + 1) * width + c]!;
      const dhdx = (hr - hl) / (2 * texelX);
      const dhdv = (hn - hs) / (2 * texelZ);
      const len = Math.hypot(dhdx, dhdv, 1);
      normal[i * 4] = Math.round((0.5 - 0.5 * dhdx / len) * 255);
      normal[i * 4 + 1] = Math.round((0.5 - 0.5 * dhdv / len) * 255);
      normal[i * 4 + 2] = Math.round((0.5 + 0.5 / len) * 255);
      normal[i * 4 + 3] = 255;
    }
  }
  return { width, height, albedo, normal, occlusion, traceMask };
}

/** Texel (column, row) of a world point on the board top, for tests and QA probes. */
export function boardTexel(x: number, z: number, width: number = BOARD_BAKE.width, height: number = BOARD_BAKE.height): readonly [number, number] {
  const [sizeX, , sizeZ] = BENCH.board.size;
  return [
    Math.min(width - 1, Math.max(0, Math.floor((x + sizeX / 2) / sizeX * width))),
    Math.min(height - 1, Math.max(0, Math.floor((z + sizeZ / 2) / sizeZ * height)))
  ];
}
