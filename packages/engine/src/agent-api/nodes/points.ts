// threejs-parity lane L6 (§5.6, SG-07): the root `points({...})` factory —
// three's `THREE.Points` + `PointsMaterial` (size, sizeAttenuation, map,
// alphaTest, transparent, vertex colours).

import { AuraNodeBuilder } from "./builder.js";
import { normalizeLinePositions, type AuraLinePositionsInput } from "./lines.js";
import type { AuraColor, AuraMaterialSpec, AuraMaterialTextureInput, AuraPointsNode, AuraRuntimeNodeSpec, AuraVec3 } from "./types.js";

export interface AuraPointsOptions {
  readonly points?: AuraLinePositionsInput;
  readonly positions?: AuraLinePositionsInput;
  /** Per-point colors → vertex coloring (three's `vertexColors: true`). */
  readonly colors?: readonly AuraColor[];
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
  const positions = normalizeLinePositions(options.points ?? options.positions, 1, "points");
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
    colors: options.colors,
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
