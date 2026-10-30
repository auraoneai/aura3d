// Glint Courier — copper trace layer (signature effect, DD47-M1 / DD47-V1 trace pulse). The board's corridors carry
// copper traces between tile centres; the traces the courier passes light up and fade, and a surge cell sends a pulse
// rippling out along them. Pure (no engine imports) so it is unit-tested; world.ts draws the edges as two instanced
// pools (unlit copper, and the lit overlay that glows).
//
// Presentation only (PRD D8): it reads the courier's tile and the surge events, never writes the sim.

import { idx, type ParsedMaze } from "./grid.js";

/** One trace segment between two walkable tile centres (a and b are tile indices; b is right of or below a). */
export interface TraceEdge {
  readonly a: number;
  readonly b: number;
  /** Mid-point in tile space and whether the segment runs along x. */
  readonly x: number;
  readonly y: number;
  readonly horizontal: boolean;
}

/** Glow timing: full for HOLD seconds after the courier passes, then a linear fade over FADE seconds. */
export const TRACE_HOLD = 1.2;
export const TRACE_FADE = 4.5;
/** Surge pulse: a ring that travels SPEED tiles a second for LIFE seconds, WIDTH tiles thick. */
export const PULSE_SPEED = 9;
export const PULSE_LIFE = 1.6;
export const PULSE_WIDTH = 1.4;

/** Corridor edges of a board: every pair of 4-adjacent walkable or ghost-only tiles (no wrap edges). */
export function traceEdges(m: ParsedMaze): readonly TraceEdge[] {
  const open = (x: number, y: number): boolean => {
    if (x < 0 || y < 0 || x >= m.width || y >= m.height) return false;
    const i = idx(m.width, x, y);
    return !m.wall[i] && (m.walkable[i] === true);
  };
  const out: TraceEdge[] = [];
  for (let y = 0; y < m.height; y++) {
    for (let x = 0; x < m.width; x++) {
      if (!open(x, y)) continue;
      const a = idx(m.width, x, y);
      if (open(x + 1, y)) out.push({ a, b: idx(m.width, x + 1, y), x: x + 0.5, y, horizontal: true });
      if (open(x, y + 1)) out.push({ a, b: idx(m.width, x, y + 1), x, y: y + 0.5, horizontal: false });
    }
  }
  return out;
}

export interface TracePrefs {
  readonly reducedMotion: boolean;
  readonly reducedFlash: boolean;
}

/** Visit and pulse state for one board. */
export class TraceField {
  readonly edges: readonly TraceEdge[];
  private readonly visited: Float64Array;
  private readonly pulses: { x: number; y: number; t0: number }[] = [];

  constructor(readonly maze: ParsedMaze) {
    this.edges = traceEdges(maze);
    this.visited = new Float64Array(maze.width * maze.height).fill(-1e9);
  }

  /** Marks the courier's current tile (x, y in tile units, any fraction) as passed at time `now`. */
  visit(x: number, y: number, now: number): void {
    const tx = Math.round(x), ty = Math.round(y);
    if (tx < 0 || ty < 0 || tx >= this.maze.width || ty >= this.maze.height) return;
    this.visited[idx(this.maze.width, tx, ty)] = now;
  }

  /** Starts a surge pulse at a tile. At most four run at once (the oldest is dropped). */
  pulse(x: number, y: number, now: number): void {
    this.pulses.push({ x, y, t0: now });
    if (this.pulses.length > 4) this.pulses.shift();
  }

  /** Glow of a tile from the courier's path alone (0..1). */
  tileGlow(i: number, now: number): number {
    const age = now - (this.visited[i] ?? -1e9);
    if (age < 0) return 0;
    if (age <= TRACE_HOLD) return 1;
    return Math.max(0, 1 - (age - TRACE_HOLD) / TRACE_FADE);
  }

  /**
   * Glow of one edge (0..1): the brighter of its two tiles' path glow, plus the surge ripple. Reduced motion: the
   * ripple is replaced by a steady soft lift over the whole pulse life (no travelling ring); reduced flash caps the
   * ripple at 0.5.
   */
  edgeGlow(e: TraceEdge, now: number, prefs: TracePrefs): number {
    let g = Math.max(this.tileGlow(e.a, now), this.tileGlow(e.b, now));
    for (const p of this.pulses) {
      const t = now - p.t0;
      if (t < 0 || t > PULSE_LIFE) continue;
      const fade = 1 - t / PULSE_LIFE;
      if (prefs.reducedMotion) {
        g = Math.max(g, 0.35 * fade);
        continue;
      }
      const d = Math.hypot(e.x - p.x, e.y - p.y);
      const band = 1 - Math.abs(d - PULSE_SPEED * t) / PULSE_WIDTH;
      if (band > 0) g = Math.max(g, band * fade * (prefs.reducedFlash ? 0.5 : 1));
    }
    return Math.min(1, g);
  }

  /** Drops finished pulses. */
  prune(now: number): void {
    while (this.pulses.length > 0 && now - this.pulses[0]!.t0 > PULSE_LIFE) this.pulses.shift();
  }
}
