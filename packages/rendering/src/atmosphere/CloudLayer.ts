// PRD-07 P3-T2 — cloud layer (r185 cloud block): a smoothstep mask over fbm
// noise projected onto a plane at `elevation`, drifting with `speed`. The CPU
// helpers mirror the shader math for tests and horizon-fade checks.

export interface CloudSpec {
  readonly scale?: number;
  readonly speed?: number;
  readonly coverage?: number;
  readonly density?: number;
  readonly elevation?: number;
}

export interface CloudFrame {
  readonly scale: number;
  readonly speed: number;
  readonly coverage: number;
  readonly density: number;
  readonly elevation: number;
}

export function cloudFrame(raw: unknown): CloudFrame {
  const o = (raw ?? {}) as CloudSpec;
  return {
    scale: o.scale ?? 0.0002,
    speed: o.speed ?? 0.0001,
    coverage: o.coverage ?? 0,
    density: o.density ?? 0.4,
    elevation: o.elevation ?? 0.5
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
