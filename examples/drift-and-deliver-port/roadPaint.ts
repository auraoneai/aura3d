/**
 * Gridlock Courier (GU47 WP-28 GC-H2): road paint for the shift look, painted onto the road tile before the wet pass.
 * A terracotta bus lane on the kerb lane of the tile's top street (one axis only, so the city reads as having bus
 * routes rather than every lane painted) and two hatched sodium-yellow loading boxes on the opposite kerb of the
 * crossing street. Texture only: 0 extra draws. Layout in tile metres, same frame as `paintRoadTile`.
 */
import { ASPHALT_HALF, TILE_M, type Ctx2D } from "./textures";

export const BUS_LANE = { from: ASPHALT_HALF + 2, to: TILE_M - ASPHALT_HALF - 2, y0: ASPHALT_HALF - 3.1, y1: ASPHALT_HALF - 0.45, color: "#b5523f", alpha: 0.62 } as const;
export const LOADING_BOXES = [
  { x0: TILE_M - ASPHALT_HALF + 0.5, x1: TILE_M - ASPHALT_HALF + 2.9, z0: 16, z1: 24 },
  { x0: TILE_M - ASPHALT_HALF + 0.5, x1: TILE_M - ASPHALT_HALF + 2.9, z0: 36, z1: 44 }
] as const;
export const PAINT_YELLOW = "#e8b04a";

/** Returns the number of rectangles painted (the unit test reads it as the layout count). */
export function paintRoadMarkings(g: Ctx2D, px: number): number {
  const S = px / TILE_M;
  const m = (v: number): number => v * S;
  let rects = 0;
  const rect = (x: number, y: number, w: number, h: number, color: string, alpha: number): void => {
    g.globalAlpha = alpha;
    g.fillStyle = color;
    g.fillRect(m(x), m(y), m(w), m(h));
    rects++;
  };
  // bus lane: the coloured band, a solid edge line and "BUS" blocks every 15 m (three bars, a cheap glyph stand-in)
  rect(BUS_LANE.from, BUS_LANE.y0, BUS_LANE.to - BUS_LANE.from, BUS_LANE.y1 - BUS_LANE.y0, BUS_LANE.color, BUS_LANE.alpha);
  rect(BUS_LANE.from, BUS_LANE.y0 - 0.3, BUS_LANE.to - BUS_LANE.from, 0.22, "#efe3cf", 0.85);
  for (let x = BUS_LANE.from + 5; x < BUS_LANE.to - 4; x += 15) {
    for (let k = 0; k < 3; k++) rect(x + k * 0.9, BUS_LANE.y0 + 0.6, 0.45, BUS_LANE.y1 - BUS_LANE.y0 - 1.2, "#efe3cf", 0.8);
  }
  // loading boxes: outline plus diagonal-ish hatch (stepped bars, axis-aligned so the stub layout stays testable)
  for (const b of LOADING_BOXES) {
    const w = b.x1 - b.x0, h = b.z1 - b.z0, t = 0.18;
    rect(b.x0, b.z0, w, t, PAINT_YELLOW, 0.9);
    rect(b.x0, b.z1 - t, w, t, PAINT_YELLOW, 0.9);
    rect(b.x0, b.z0, t, h, PAINT_YELLOW, 0.9);
    rect(b.x1 - t, b.z0, t, h, PAINT_YELLOW, 0.9);
    for (let z = b.z0 + 1; z < b.z1 - 0.5; z += 1) rect(b.x0 + 0.3, z, w - 0.6, 0.16, PAINT_YELLOW, 0.7);
  }
  g.globalAlpha = 1;
  return rects;
}
