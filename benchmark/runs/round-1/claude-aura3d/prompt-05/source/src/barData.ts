// Grid geometry + the data model for the 6x6 field of bars.
//
// Values are kept normalized in [0, 1]; the renderer maps them to a physical
// height and to a color from the shared palette. A seeded PRNG keeps the
// initial layout reproducible across reloads while still looking random.

export const GRID = 6; // 6 x 6 = 36 bars
export const SPACING = 1.15; // distance between bar centers
export const FOOTPRINT = 0.66; // bar width / depth
export const MIN_HEIGHT = 0.2; // height at value 0
export const MAX_HEIGHT = 3.6; // height at value 1
export const HALF_EXTENT = ((GRID - 1) * SPACING) / 2; // grid half-width

export interface BarDatum {
  readonly index: number;
  readonly row: number; // 0..GRID-1 (along Z)
  readonly col: number; // 0..GRID-1 (along X)
  readonly name: string; // node name, e.g. "bar-r2-c4"
  readonly x: number; // world X of bar center
  readonly z: number; // world Z of bar center
  /** Mutable animation state. */
  value: number; // current normalized height [0,1]
  target: number; // normalized height the bar is easing toward
}

// Small, fast seeded PRNG (mulberry32) so the scene is deterministic.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = mulberry32(0x5eed1234);

/** Build the 6x6 grid. Each bar starts at one random value and targets another, so it animates from a random value the moment the scene loads. */
export function createBars(): BarDatum[] {
  const bars: BarDatum[] = [];
  for (let row = 0; row < GRID; row += 1) {
    for (let col = 0; col < GRID; col += 1) {
      const index = row * GRID + col;
      bars.push({
        index,
        row,
        col,
        name: `bar-r${row + 1}-c${col + 1}`,
        x: col * SPACING - HALF_EXTENT,
        z: row * SPACING - HALF_EXTENT,
        value: 0.08 + rng() * 0.85,
        target: 0.08 + rng() * 0.85,
      });
    }
  }
  return bars;
}

/** Convert a normalized value into a world-space bar height. */
export const valueToHeight = (value: number): number =>
  MIN_HEIGHT + Math.max(0, Math.min(1, value)) * (MAX_HEIGHT - MIN_HEIGHT);
