// PRD-07 §6.2 (`flipbook-sprite`: "without `texture`, `fireball` sequence") —
// built-in procedural fireball sheet. Deterministic per (columns, rows, seed):
// `columns*rows` frames of nine seeded radial blobs that expand, rise and cool
// from a bright core into a dissipating puff. Rasterised on the CPU (no canvas)
// with source-over compositing of piecewise-linear radial gradients, so it
// runs in workers and tests. Output is RGBA8, sRGB-encoded, straight alpha,
// rows bottom-up (GL upload order: v = 0 is the last image row), frame 0 in
// the top-left cell — the particle program's `u_grid` lookup convention.

import { mulberry32 } from "./CpuEmitter";

export interface FlipbookSheet {
  readonly width: number;
  readonly height: number;
  readonly columns: number;
  readonly rows: number;
  readonly data: Uint8Array;
}

const CELL = 128;
const cache = new Map<string, FlipbookSheet>();

/** Built-in `fireball` sheet for a grid and seed (cached; same inputs → same bytes). */
export function proceduralFireballSheet(columns: number, rows: number, seed: number): FlipbookSheet {
  const cols = Math.max(1, Math.floor(columns));
  const rws = Math.max(1, Math.floor(rows));
  const key = `${cols}x${rws}:${seed >>> 0}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const width = cols * CELL;
  const height = rws * CELL;
  // Premultiplied float accumulation in image order (row 0 = top).
  const premul = new Float32Array(width * height * 4);
  const next = mulberry32(seed);
  const blobs = Array.from({ length: 9 }, () => ({ x: (next() - 0.5) * 0.5, y: (next() - 0.5) * 0.5, r: 0.35 + next() * 0.45, j: next() }));
  const frames = cols * rws;
  for (let frame = 0; frame < frames; frame += 1) {
    const t = frame / Math.max(1, frames - 1);
    const ox = (frame % cols) * CELL;
    const oy = Math.floor(frame / cols) * CELL;
    const heat = Math.max(0, 1 - t * 1.4);
    // sRGB-space blob colour (canvas semantics), normalised.
    const cr = 1;
    const cg = Math.round(140 + 80 * (1 - heat)) / 255;
    const cb = Math.round(50 + 130 * (1 - heat)) / 255;
    for (const blob of blobs) {
      const grow = 0.25 + t * 1.3;
      const bx = CELL * 0.5 + blob.x * CELL * (0.2 + t * 0.7);
      const by = CELL * 0.5 + blob.y * CELL * (0.2 + t * 0.7) - t * CELL * 0.12;
      const br = blob.r * CELL * grow * 0.5;
      const alpha0 = Math.max(0, (1 - t) * (0.85 + blob.j * 0.15));
      if (alpha0 <= 0 || br <= 0) continue;
      const x0 = Math.max(0, Math.floor(bx - br));
      const x1 = Math.min(CELL - 1, Math.ceil(bx + br));
      const y0 = Math.max(0, Math.floor(by - br));
      const y1 = Math.min(CELL - 1, Math.ceil(by + br));
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          const d = Math.hypot(x + 0.5 - bx, y + 0.5 - by) / br;
          if (d >= 1) continue;
          // Stops: 0 → α0, 0.6 → 0.45·α0, 1 → 0 (linear between stops).
          const a = d < 0.6 ? alpha0 * (1 - (0.55 * d) / 0.6) : alpha0 * 0.45 * ((1 - d) / 0.4);
          const o = ((oy + y) * width + ox + x) * 4;
          const k = 1 - a;
          premul[o] = cr * a + premul[o] * k;
          premul[o + 1] = cg * a + premul[o + 1] * k;
          premul[o + 2] = cb * a + premul[o + 2] * k;
          premul[o + 3] = a + premul[o + 3] * k;
        }
      }
    }
  }
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const src = y * width * 4;
    const dst = (height - 1 - y) * width * 4; // bottom-up for the GL upload
    for (let x = 0; x < width * 4; x += 4) {
      const a = premul[src + x + 3];
      const inv = a > 1e-6 ? 1 / a : 0;
      data[dst + x] = Math.round(Math.min(1, premul[src + x] * inv) * 255);
      data[dst + x + 1] = Math.round(Math.min(1, premul[src + x + 1] * inv) * 255);
      data[dst + x + 2] = Math.round(Math.min(1, premul[src + x + 2] * inv) * 255);
      data[dst + x + 3] = Math.round(Math.min(1, a) * 255);
    }
  }
  const sheet: FlipbookSheet = { width, height, columns: cols, rows: rws, data };
  cache.set(key, sheet);
  return sheet;
}
