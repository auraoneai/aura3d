// threejs-parity lane L6 (§5.6, SG-07): the root `points({...})` factory —
// three's `THREE.Points` + `PointsMaterial` (size, sizeAttenuation, map,
// alphaTest, transparent, vertex colours).

import { AuraNodeBuilder } from "./builder.js";
import { pointStream } from "./pointStream.js";
import { normalizeLinePositions, type AuraLinePositionsInput } from "./lines.js";
import type { AuraColor, AuraMaterialSpec, AuraMaterialTextureInput, AuraPointsNode, AuraRuntimeNodeSpec, AuraVec3 } from "./types.js";

export interface AuraPointsOptions {
  readonly points?: AuraLinePositionsInput;
  readonly positions?: AuraLinePositionsInput;
  /**
   * Per-point colors → vertex coloring (three's `vertexColors: true`). CSS color strings (one per point), or typed linear
   * RGBA with no parsing: `Uint8Array`/`Uint8ClampedArray` (4 bytes per point), `Uint32Array` (one packed little-endian
   * RGBA word per point) or `Float32Array` (4 floats per point). Typed colors are used with a `Float32Array` `positions`.
   */
  readonly colors?: readonly AuraColor[] | Uint8Array | Uint8ClampedArray | Uint32Array | Float32Array;
  /** Point size in CSS pixels (three's `PointsMaterial.size`; default 1). */
  readonly size?: number;
  /** Scale point size with view depth (three's `sizeAttenuation`, default true). */
  readonly sizeAttenuation?: boolean;
  /** Point sprite texture sampled at `gl_PointCoord` (three's `map`). */
  readonly map?: AuraMaterialTextureInput;
  /** Alpha discard threshold in (0, 1] (three's `alphaTest`). */
  readonly alphaTest?: number;
  /** Enable alpha blending without depth writes (three's `transparent`). */
  readonly transparent?: boolean;
  readonly material?: AuraMaterialSpec;
  readonly name?: string;
  readonly visible?: boolean;
  readonly runtime?: AuraRuntimeNodeSpec;
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
}

/** `points({ positions, colors?, size, sizeAttenuation, map?, alphaTest, transparent })` (SG-07). */
export function points(options: AuraPointsOptions): AuraNodeBuilder<AuraPointsNode> {
  const rawPositions = options.points ?? options.positions;
  const typedColors = options.colors !== undefined && !Array.isArray(options.colors);
  // P-01: a Float32Array cloud (with typed or no colors) stays typed: validated once, copied once, no tuple objects.
  const typed = rawPositions instanceof Float32Array && (options.colors === undefined || typedColors);
  if (typedColors && !typed) throw new Error("points typed colors require positions as a Float32Array");
  let positions: ReturnType<typeof normalizeLinePositions> | Float32Array;
  let colors = options.colors;
  if (typed) {
    const source = rawPositions as Float32Array;
    if (source.length % 3 !== 0) throw new Error("points positions must be a multiple of 3 numbers");
    for (let i = 0; i < source.length; i += 1) {
      if (!Number.isFinite(source[i]!)) throw new Error(`points point ${Math.floor(i / 3)} must be a finite [x, y, z]`);
    }
    positions = source.slice();
    if (typedColors) {
      const perPoint = options.colors instanceof Uint32Array ? 1 : 4;
      if ((options.colors as ArrayLike<number>).length !== (source.length / 3) * perPoint) {
        throw new Error(`points colors must match positions length (${(options.colors as ArrayLike<number>).length} values, ${source.length / 3} points)`);
      }
      colors = (options.colors as Uint8Array).slice() as never;
    }
  } else {
    positions = normalizeLinePositions(rawPositions, 1, "points");
  }
  const size = options.size ?? 1;
  if (!Number.isFinite(size) || size <= 0) {
    throw new Error("points size must be a positive finite number (GL clamps oversize to ALIASED_POINT_SIZE_RANGE)");
  }
  if (options.alphaTest !== undefined && (!Number.isFinite(options.alphaTest) || options.alphaTest < 0 || options.alphaTest > 1)) {
    throw new Error("points alphaTest must be finite in [0, 1]");
  }
  return new AuraNodeBuilder({
    kind: "points",
    name: options.name,
    positions,
    colors,
    size,
    sizeAttenuation: options.sizeAttenuation,
    map: options.map,
    alphaTest: options.alphaTest,
    transparent: options.transparent,
    material: options.material,
    visible: options.visible,
    runtime: options.runtime,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale
  });
}

/** `points.stream({ capacity, colors?, size?, runtime: { id } })`: typed mutable point cloud, written through the runtime handle (E6-00 §4). */
points.stream = pointStream;
