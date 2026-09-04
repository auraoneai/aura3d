/**
 * D4 billboards, beams, flipbooks (muse3jsparity-PRD).
 *
 * Pure CPU-side math + builder descriptors for the effects games actually
 * use: size-attenuated + axis-locked billboards, flipbook UVs for
 * explosions/muzzle flashes, and thick screen-space beams/fences with
 * additive blending. Pairs with `createSpriteQuadGeometry` (quad),
 * `ScreenSpaceLineMaterial` (thick lines), and `Geometry.WideLineSegment`.
 * Root reachability (`primitives`/`effects` family) needs the engine-bridge
 * hunk reported alongside this change.
 */

export type BillboardMode = "spherical" | "axis-locked-y";

export interface BillboardOptions {
  readonly mode?: BillboardMode;
  /** World-space center of the sprite. */
  readonly center: readonly [number, number, number];
  /** World-space size (width, height) before distance attenuation. */
  readonly size: readonly [number, number];
  /** Camera world position. */
  readonly cameraPosition: readonly [number, number, number];
  /** Camera up vector (axis-locked mode keeps this axis fixed). */
  readonly cameraUp?: readonly [number, number, number];
  /** Perspective attenuation factor; 0 disables attenuation. */
  readonly attenuation?: number;
}

export interface BillboardCorners {
  readonly topLeft: readonly [number, number, number];
  readonly topRight: readonly [number, number, number];
  readonly bottomRight: readonly [number, number, number];
  readonly bottomLeft: readonly [number, number, number];
  readonly attenuatedSize: readonly [number, number];
}

/** Billboard corner computation: faces the camera (spherical) or rotates about Y only (axis-locked). */
export function resolveBillboardCorners(options: BillboardOptions): BillboardCorners {
  if (options.center.length !== 3 || options.center.some((c) => !Number.isFinite(c))) {
    throw new RangeError("Billboard center must contain three finite values.");
  }
  if (options.size.length !== 2 || options.size.some((c) => !Number.isFinite(c) || c <= 0)) {
    throw new RangeError("Billboard size must contain two finite positive values.");
  }
  if (options.cameraPosition.length !== 3 || options.cameraPosition.some((c) => !Number.isFinite(c))) {
    throw new RangeError("Billboard cameraPosition must contain three finite values.");
  }
  const mode = options.mode ?? "spherical";
  const attenuation = options.attenuation ?? 1;
  if (!Number.isFinite(attenuation) || attenuation < 0) throw new RangeError("Billboard attenuation must be finite and non-negative.");
  const toCamera: readonly [number, number, number] = [
    options.cameraPosition[0]! - options.center[0]!,
    options.cameraPosition[1]! - options.center[1]!,
    options.cameraPosition[2]! - options.center[2]!,
  ];
  const distance = Math.hypot(toCamera[0]!, toCamera[1]!, toCamera[2]!);
  if (distance <= 1e-9) throw new RangeError("Billboard camera must not coincide with the sprite center.");
  const scale = attenuation === 0 ? 1 : attenuation / distance;
  const halfW = (options.size[0]! * scale) / 2;
  const halfH = (options.size[1]! * scale) / 2;
  let right: readonly [number, number, number];
  let up: readonly [number, number, number];
  if (mode === "spherical") {
    const forward: readonly [number, number, number] = [toCamera[0]! / distance, toCamera[1]! / distance, toCamera[2]! / distance];
    const worldUp: readonly [number, number, number] = options.cameraUp ?? [0, 1, 0];
    right = normalize3(cross3(worldUp, forward));
    up = cross3(forward, right);
  } else if (mode === "axis-locked-y") {
    const flat = normalize3([toCamera[0]!, 0, toCamera[2]!] as const);
    right = [flat[2]!, 0, -flat[0]!];
    up = [0, 1, 0];
  } else {
    throw new RangeError(`Unsupported billboard mode: ${String(mode)}`);
  }
  const [cx, cy, cz] = options.center;
  const corner = (sx: number, sy: number): readonly [number, number, number] => [
    cx! + right[0]! * sx * halfW + up[0]! * sy * halfH,
    cy! + right[1]! * sx * halfW + up[1]! * sy * halfH,
    cz! + right[2]! * sx * halfW + up[2]! * sy * halfH,
  ];
  return {
    topLeft: corner(-1, 1),
    topRight: corner(1, 1),
    bottomRight: corner(1, -1),
    bottomLeft: corner(-1, -1),
    attenuatedSize: [halfW * 2, halfH * 2],
  };
}

export interface FlipbookFrame {
  readonly frame: number;
  readonly columns: number;
  readonly rows: number;
  /** UV rect [u0, v0, u1, v1] for this cell (v flipped for GL texture space). */
  readonly uvRect: readonly [number, number, number, number];
}

/** Flipbook UVs for explosion/muzzle-flash sprite sheets. */
export function resolveFlipbookUv(frame: number, columns: number, rows: number): FlipbookFrame {
  if (!Number.isInteger(frame) || frame < 0) throw new RangeError("Flipbook frame must be a non-negative integer.");
  if (!Number.isInteger(columns) || columns <= 0) throw new RangeError("Flipbook columns must be a positive integer.");
  if (!Number.isInteger(rows) || rows <= 0) throw new RangeError("Flipbook rows must be a positive integer.");
  const cellCount = columns * rows;
  if (frame >= cellCount) throw new RangeError(`Flipbook frame ${frame} exceeds sheet capacity ${cellCount}.`);
  const column = frame % columns;
  const row = Math.floor(frame / columns);
  const u0 = column / columns;
  const u1 = (column + 1) / columns;
  // GL texture space has v=0 at the bottom; sheet row 0 is the top row.
  const v1 = 1 - row / rows;
  const v0 = 1 - (row + 1) / rows;
  return { frame, columns, rows, uvRect: [u0, v0, u1, v1] };
}

export interface BeamDescriptor {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly widthWorld: number;
  readonly additive: true;
  readonly length: number;
  readonly segmentCount: number;
  readonly diagnostic: string;
}

/** Beam/fence builder: additive-blended quad strip between two points. */
export function createBeamDescriptor(options: {
  readonly from: readonly [number, number, number];
  readonly to: readonly [number, number, number];
  readonly widthWorld?: number;
  readonly segmentCount?: number;
}): BeamDescriptor {
  for (const [label, p] of [["from", options.from], ["to", options.to]] as const) {
    if (p.length !== 3 || p.some((c) => !Number.isFinite(c))) {
      throw new RangeError(`Beam ${label} must contain three finite values.`);
    }
  }
  const widthWorld = options.widthWorld ?? 0.15;
  const segmentCount = options.segmentCount ?? 8;
  if (!Number.isFinite(widthWorld) || widthWorld <= 0) throw new RangeError("Beam widthWorld must be finite and positive.");
  if (!Number.isInteger(segmentCount) || segmentCount < 1 || segmentCount > 64) {
    throw new RangeError("Beam segmentCount must be an integer in [1, 64].");
  }
  const length = Math.hypot(
    options.to[0]! - options.from[0]!,
    options.to[1]! - options.from[1]!,
    options.to[2]! - options.from[2]!
  );
  if (length <= 1e-9) throw new RangeError("Beam endpoints must not coincide.");
  return {
    from: options.from,
    to: options.to,
    widthWorld,
    additive: true,
    length: Number(length.toFixed(6)),
    segmentCount,
    diagnostic: "Additive beam strip; pairs with ScreenSpaceLineMaterial for thick screen-space strokes.",
  };
}

function cross3(a: readonly [number, number, number], b: readonly [number, number, number]): readonly [number, number, number] {
  return [
    a[1]! * b[2]! - a[2]! * b[1]!,
    a[2]! * b[0]! - a[0]! * b[2]!,
    a[0]! * b[1]! - a[1]! * b[0]!,
  ];
}

function normalize3(v: readonly [number, number, number]): readonly [number, number, number] {
  const length = Math.hypot(v[0]!, v[1]!, v[2]!);
  if (length <= 1e-9) throw new RangeError("Billboard basis vector is degenerate (camera looking straight down the lock axis).");
  return [v[0]! / length, v[1]! / length, v[2]! / length];
}
