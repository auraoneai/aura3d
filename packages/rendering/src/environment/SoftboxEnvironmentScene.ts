/**
 * Aura3D's `softbox` studio environment: a structured product-photography
 * light set for metal and glass.
 *
 * A near-uniform probe leaves a mirror with nothing to mirror and glass with
 * nothing to refract, so chrome reads as flat grey and glass vanishes against a
 * pale backdrop. This one is authored the way a photographer lights a bottle or
 * a ball bearing: a large overhead softbox, a tall key softbox, two thin strip
 * lights, a windowed fill with mullions, and dark flags that give edges a dark
 * line to read against, over a gradient room. Radiances are linear; every
 * panel edge is soft so it prefilters cleanly. Pure functions, no randomness,
 * baked deterministically by `tools/environments/bake-softbox.ts`.
 */
type Vec3 = readonly [number, number, number];

const norm = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]);
  return [v[0] / l, v[1] / l, v[2] / l];
};
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const smooth = (edge0: number, edge1: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
};

interface Panel {
  readonly center: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  /** Half extents in tan(angle) units on the tangent plane. */
  readonly halfW: number;
  readonly halfH: number;
  /** Edge softness in tan units. */
  readonly feather: number;
  readonly radiance: Vec3;
  /** Dark mullion bars (window): number of vertical and horizontal dividers. */
  readonly mullions?: { readonly cols: number; readonly rows: number; readonly bar: number };
}

function panel(centerDir: Vec3, halfWDeg: number, halfHDeg: number, radiance: Vec3, feather = 0.06, mullions?: Panel["mullions"], roll = 0): Panel {
  const center = norm(centerDir);
  const worldUp: Vec3 = Math.abs(center[1]) > 0.97 ? [0, 0, -1] : [0, 1, 0];
  let right = norm(cross(worldUp, center));
  let up = norm(cross(center, right));
  if (roll !== 0) {
    const c = Math.cos(roll), s = Math.sin(roll);
    const r2: Vec3 = [right[0] * c + up[0] * s, right[1] * c + up[1] * s, right[2] * c + up[2] * s];
    up = [up[0] * c - right[0] * s, up[1] * c - right[1] * s, up[2] * c - right[2] * s];
    right = r2;
  }
  const rad = Math.PI / 180;
  return { center, right, up, halfW: Math.tan(halfWDeg * rad), halfH: Math.tan(halfHDeg * rad), feather, radiance, ...(mullions ? { mullions } : {}) };
}

const warm: Vec3 = [1, 0.96, 0.9];
const cool: Vec3 = [0.92, 0.97, 1];
const white: Vec3 = [1, 1, 1];
const scale = (c: Vec3, s: number): Vec3 => [c[0] * s, c[1] * s, c[2] * s];

/** Light panels (emissive) in draw order; later panels cover earlier ones where they overlap. */
export const SOFTBOX_PANELS: readonly Panel[] = [
  panel([0.1, 0.96, 0.26], 38, 26, scale(white, 7), 0.12),
  panel([-0.62, 0.5, 0.6], 17, 34, scale(warm, 16), 0.07),
  panel([0.97, 0.3, 0.12], 6, 38, scale(cool, 22), 0.05),
  panel([0.15, 0.4, -0.9], 8, 28, scale(white, 12), 0.05),
  panel([0.55, 0.28, 0.78], 22, 26, scale(cool, 9), 0.05, { cols: 2, rows: 2, bar: 0.045 })
];

/** Dark flags (negative fill): cards that read as a dark line at the edge of glass and polished metal. */
export const SOFTBOX_FLAGS: readonly Panel[] = [
  panel([0.02, 0.12, 1], 11, 36, [0.012, 0.012, 0.014], 0.05),
  panel([-1, 0.1, -0.15], 7, 40, [0.012, 0.012, 0.014], 0.05)
];

function paint(p: Panel, d: Vec3): number {
  const facing = dot(d, p.center);
  if (facing <= 0.05) return 0;
  const x = dot(d, p.right) / facing;
  const y = dot(d, p.up) / facing;
  const f = p.feather;
  let mask = (1 - smooth(p.halfW - f, p.halfW + f, Math.abs(x))) * (1 - smooth(p.halfH - f, p.halfH + f, Math.abs(y)));
  if (p.mullions && mask > 0) {
    const { cols, rows, bar } = p.mullions;
    const u = (x / p.halfW + 1) / 2, v = (y / p.halfH + 1) / 2;
    let barMask = 0;
    for (let i = 1; i < cols; i += 1) barMask = Math.max(barMask, 1 - smooth(bar * 0.5, bar, Math.abs(u - i / cols)));
    for (let j = 1; j < rows; j += 1) barMask = Math.max(barMask, 1 - smooth(bar * 0.5, bar, Math.abs(v - j / rows)));
    mask *= 1 - 0.92 * barMask;
  }
  return mask;
}

/** Unscaled linear radiance seen along `dir` (any length). */
export function sampleSoftboxEnvironment(dir: Vec3): Vec3 {
  const d = norm(dir);
  // Room gradient: darker warm floor, mid-grey wall band, slightly cool ceiling.
  const e = d[1];
  const ground = 1 - smooth(-0.35, 0.02, e);
  const sky = smooth(0.05, 0.9, e);
  const base = 0.1 + 0.22 * (1 - ground) + 0.2 * sky;
  const tintC: Vec3 = [1 + 0.05 * ground - 0.04 * sky, 1 + 0.01 * ground, 1 - 0.05 * ground + 0.05 * sky];
  let r = base * tintC[0], g = base * tintC[1], b = base * tintC[2];
  for (const p of SOFTBOX_PANELS) {
    const m = paint(p, d);
    if (m <= 0) continue;
    r = r * (1 - m) + p.radiance[0] * m;
    g = g * (1 - m) + p.radiance[1] * m;
    b = b * (1 - m) + p.radiance[2] * m;
  }
  for (const f of SOFTBOX_FLAGS) {
    const m = paint(f, d);
    if (m <= 0) continue;
    r = r * (1 - m) + f.radiance[0] * m;
    g = g * (1 - m) + f.radiance[1] * m;
    b = b * (1 - m) + f.radiance[2] * m;
  }
  return [r, g, b];
}
