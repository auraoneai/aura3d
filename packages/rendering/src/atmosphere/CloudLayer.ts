// PRD-07 P3-T2 — cloud layer (r185 cloud block): a smoothstep mask over fbm
// noise projected onto a plane at `elevation`, drifting with `speed`. The CPU
// helpers mirror the shader math for tests and horizon-fade checks.

export type CloudVec3 = readonly [number, number, number];

/**
 * The `clouds` field of a sky spec. GU47 E-G (WP-7): the typed authoring form
 * is `{ coverage, speed?, color? }` on `sky.preetham` / `sky.gradient`.
 * `speed` is a drift multiplier (1 = the default drift, 0 = still clouds);
 * `color` tints the lit cloud colour (hex, default white).
 */
export interface CloudSpec {
  readonly scale?: number;
  readonly speed?: number;
  readonly coverage?: number;
  readonly density?: number;
  readonly elevation?: number;
  readonly color?: string | CloudVec3;
}

export interface CloudFrame {
  readonly scale: number;
  /** Drift in cloud-plane uv per second (`CLOUD_BASE_SPEED` × the authored multiplier). */
  readonly speed: number;
  readonly coverage: number;
  readonly density: number;
  readonly elevation: number;
  /** GU47 E-G: linear RGB tint the shader multiplies into the cloud colour. */
  readonly color: CloudVec3;
}

/** Default cloud drift in plane-uv per second (r185 block); `speed: 1` means this. */
export const CLOUD_BASE_SPEED = 0.0001;

const WHITE: CloudVec3 = [1, 1, 1];

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/** GU47 E-G: hex (`#rgb` / `#rrggbb`) or linear triple → linear RGB; anything else → white. */
export function cloudTintLinear(color: unknown): CloudVec3 {
  if (Array.isArray(color) && color.length >= 3) {
    return [Math.max(0, finiteOr(color[0], 1)), Math.max(0, finiteOr(color[1], 1)), Math.max(0, finiteOr(color[2], 1))];
  }
  if (typeof color !== "string") return WHITE;
  const hex = color.trim().replace(/^#/, "");
  const full = /^[0-9a-f]{3}$/i.test(hex) ? hex.split("").map((c) => c + c).join("") : hex;
  if (!/^[0-9a-f]{6}$/i.test(full)) return WHITE;
  const v = parseInt(full, 16);
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(((v >> 16) & 255) / 255), lin(((v >> 8) & 255) / 255), lin((v & 255) / 255)];
}

export function cloudFrame(raw: unknown): CloudFrame {
  const o = (raw ?? {}) as CloudSpec;
  return {
    scale: finiteOr(o.scale, 0.0002),
    speed: Math.max(0, finiteOr(o.speed, 1)) * CLOUD_BASE_SPEED,
    coverage: Math.min(1, Math.max(0, finiteOr(o.coverage, 0))),
    density: finiteOr(o.density, 0.4),
    elevation: finiteOr(o.elevation, 0.5),
    color: o.color === undefined ? WHITE : cloudTintLinear(o.color)
  };
}

/** Smoothstep edge the mask opens at (shader: `1 - coverage`). */
export function cloudMaskEdge(coverage: number): number {
  return 1 - coverage;
}

/** Smoothstep width of the mask edge (r185 block constant). */
export const CLOUD_MASK_SOFTNESS = 0.3;

/** Projection plane factor — `mix(1, 0.1, elevation)` in the shader. */
export function cloudElevationScale(elevation: number): number {
  return 1 - 0.9 * elevation;
}

/** Horizon fade the shader applies (`smoothstep(0, 0.1+0.2*e, dir.y)`). */
export function cloudHorizonFade(directionY: number, elevation: number): number {
  const hi = 0.1 + 0.2 * elevation;
  const t = Math.max(0, Math.min(1, directionY / hi));
  return t * t * (3 - 2 * t);
}
