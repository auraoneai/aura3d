// threejs-parity lane L6 (docs/workflows/threejs-parity-gaps.md §5.6, SG-06 /
// AD-08): `lines.line/loop/segments/fat` factories producing `AuraLineNode`s
// for the `AA/compiler/lines.ts` handler. Thin variants draw `"lines"`-topology
// geometry; `dashed` and `fat` route through `Geometry.screenSpaceLineSegments`
// + `ScreenSpaceLineMaterial` (pixel-space width + `a_lineDistance` dashes).

import { AuraNodeBuilder } from "./builder.js";
import type { AuraColor, AuraLineNode, AuraMaterialSpec, AuraRuntimeNodeSpec, AuraVec3 } from "./types.js";

/** `positions`/`points` input: a flat tuple array, flat number array, or packed Float32Array. */
export type AuraLinePositionsInput = readonly AuraVec3[] | readonly number[] | Float32Array;

export interface AuraLineOptions {
  /** Point list (three's `geometry.setFromPoints` input). */
  readonly points?: AuraLinePositionsInput;
  /** Alias for `points` (three's `position` attribute). `points` wins when both are set. */
  readonly positions?: AuraLinePositionsInput;
  /** Per-point colors — enables vertex coloring on thin lines (SG-06). */
  readonly colors?: readonly AuraColor[];
  readonly material?: AuraMaterialSpec;
  readonly name?: string;
  /** three's `LineDashedMaterial` — requires `gapSize > 0` (dashSize default 1). */
  readonly dashed?: boolean;
  readonly dashSize?: number;
  readonly gapSize?: number;
  readonly dashOffset?: number;
  readonly visible?: boolean;
  readonly runtime?: AuraRuntimeNodeSpec;
  readonly position?: AuraVec3;
  readonly rotation?: AuraVec3;
  readonly scale?: number | AuraVec3;
}

export interface AuraFatLineOptions extends AuraLineOptions {
  /** Stroke width — CSS pixels (`worldUnits:false`, default) or world units. */
  readonly width?: number;
  /**
   * three's `Line2` world-units mode: width is a world-space extent drawn as
   * camera-facing quads (`Geometry.wideLineSegments`). Unsupported together
   * with `dashed` — world-space quads carry no `a_lineDistance` attribute.
   */
  readonly worldUnits?: boolean;
}

/** Normalize any accepted positions input into a validated `AuraVec3[]`. */
export function normalizeLinePositions(input: AuraLinePositionsInput | undefined, minCount: number, label: string): AuraVec3[] {
  if (input === undefined) throw new Error(`${label} requires points or positions`);
  let out: AuraVec3[];
  if (input instanceof Float32Array || (Array.isArray(input) && typeof input[0] === "number")) {
    const flat = input as readonly number[] | Float32Array;
    if (flat.length % 3 !== 0) throw new Error(`${label} positions must be a multiple of 3 numbers`);
    out = [];
    for (let i = 0; i < flat.length; i += 3) {
      out.push([flat[i] as number, flat[i + 1] as number, flat[i + 2] as number]);
    }
  } else {
    out = (input as readonly AuraVec3[]).map((p, index) => {
      if (!Array.isArray(p) || p.length !== 3 || !p.every((v) => Number.isFinite(v))) {
        throw new Error(`${label} point ${index} must be a finite [x, y, z]`);
      }
      return [p[0], p[1], p[2]] as AuraVec3;
    });
  }
  if (out.length < minCount) throw new Error(`${label} requires at least ${minCount} points (got ${out.length})`);
  return out;
}

/**
 * three's `computeLineDistances` (SG-06/AD-08 — the dash `a_lineDistance`
 * basis): cumulative Euclidean arc length.
 *  - `"line"`/`"loop"`: `d[0] = 0`, `d[i] = d[i-1] + |pᵢ − pᵢ₋₁|` — for `"loop"`
 *    a final element carries the closing-segment length so the wrap edge
 *    dashes correctly (three's LINE_LOOP wrap edge inherits a 0 distance; the
 *    extra entry here is strictly more correct and only consumed by the fat
 *    path, which draws real segment pairs).
 *  - `"segments"`: pairs accumulate continuously — `d[i] = d[i-1]` at each
 *    segment start (matching three's LineSegments.computeLineDistances, where
 *    a segment's start picks up the previous segment's end distance).
 */
export function computeLineDistances(positions: readonly AuraVec3[], mode: "line" | "loop" | "segments"): readonly number[] {
  const distances: number[] = [0];
  if (mode === "segments") {
    if (positions.length % 2 !== 0) throw new Error("segments line distances require an even point count");
    for (let i = 0; i < positions.length; i += 2) {
      const start = positions[i]!;
      const end = positions[i + 1]!;
      distances[i] = i === 0 ? 0 : distances[i - 1]!;
      distances[i + 1] = distances[i]! + segmentLength(start, end);
    }
    return distances;
  }
  for (let i = 1; i < positions.length; i += 1) {
    distances[i] = distances[i - 1]! + segmentLength(positions[i - 1]!, positions[i]!);
  }
  if (mode === "loop" && positions.length > 0) {
    distances.push(distances[positions.length - 1]! + segmentLength(positions[positions.length - 1]!, positions[0]!));
  }
  return distances;
}

function segmentLength(a: AuraVec3, b: AuraVec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function validateDashOptions(options: AuraLineOptions, label: string): void {
  const dashSize = options.dashSize ?? (options.dashed ? 1 : 0);
  const gapSize = options.gapSize ?? 0;
  if (options.dashed || dashSize > 0) {
    if (gapSize <= 0) throw new Error(`${label} dashed lines require a positive gapSize (three's LineDashedMaterial)`);
    if (dashSize <= 0) throw new Error(`${label} dashSize must be positive when dashed`);
  }
  if (options.dashOffset !== undefined && !Number.isFinite(options.dashOffset)) {
    throw new Error(`${label} dashOffset must be finite`);
  }
}

function lineNode(kind: AuraLineNode["line"], options: AuraLineOptions, minCount: number, label: string): AuraLineNode {
  const positions = normalizeLinePositions(options.points ?? options.positions, minCount, label);
  if (kind === "segments" && positions.length % 2 !== 0) {
    throw new Error(`${label} requires an even number of points (segment pairs)`);
  }
  validateDashOptions(options, label);
  return {
    kind: "line",
    line: kind,
    name: options.name,
    positions,
    colors: options.colors,
    material: options.material,
    dashed: options.dashed,
    dashSize: options.dashSize,
    gapSize: options.gapSize,
    dashOffset: options.dashOffset,
    width: (options as AuraFatLineOptions).width,
    worldUnits: (options as AuraFatLineOptions).worldUnits,
    visible: options.visible,
    runtime: options.runtime,
    position: options.position,
    rotation: options.rotation,
    scale: options.scale
  };
}

/** `lines.line({ points|positions, colors?, material? })` — an open polyline (three's `Line`). */
export function line(options: AuraLineOptions): AuraNodeBuilder<AuraLineNode> {
  return new AuraNodeBuilder(lineNode("line", options, 2, "lines.line"));
}

/** `lines.loop({...})` — a closed polyline; the last point reconnects to the first (three's `LineLoop`). */
export function loop(options: AuraLineOptions): AuraNodeBuilder<AuraLineNode> {
  return new AuraNodeBuilder(lineNode("loop", options, 3, "lines.loop"));
}

/** `lines.segments({...})` — independent segment pairs (three's `LineSegments`). */
export function segments(options: AuraLineOptions): AuraNodeBuilder<AuraLineNode> {
  return new AuraNodeBuilder(lineNode("segments", options, 2, "lines.segments"));
}

/**
 * `lines.fat({ width, worldUnits, dashed, dashSize, gapSize, dashOffset })`
 * (AD-08): pixel-width strokes via `ScreenSpaceLineMaterial`; `worldUnits`
 * bakes world-space quad geometry instead.
 */
export function fat(options: AuraFatLineOptions): AuraNodeBuilder<AuraLineNode> {
  if (options.worldUnits === true && (options.dashed === true || (options.dashSize ?? 0) > 0)) {
    throw new Error("lines.fat worldUnits + dashed is unsupported: world-space quads carry no line distances (use worldUnits:false for dashes)");
  }
  const width = options.width ?? 1;
  if (!Number.isFinite(width) || width <= 0) throw new Error("lines.fat width must be a positive finite number");
  return new AuraNodeBuilder(lineNode("fat", options, 2, "lines.fat"));
}

/** `lines.*` namespace (SG-06/AD-08). */
export const lines = { line, loop, segments, fat } as const;
