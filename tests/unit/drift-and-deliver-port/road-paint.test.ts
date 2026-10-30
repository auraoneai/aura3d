import { describe, expect, it } from "vitest";
import { BUS_LANE, LOADING_BOXES, PAINT_YELLOW, paintRoadMarkings } from "../../../examples/drift-and-deliver-port/roadPaint";
import { ASPHALT_HALF, TILE_M, type Ctx2D } from "../../../examples/drift-and-deliver-port/textures";

function stub() {
  const fills: { x: number; y: number; w: number; h: number; color: string }[] = [];
  const g = { fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1, fillRect(x: number, y: number, w: number, h: number) { fills.push({ x, y, w, h, color: String(this.fillStyle) }); } } as unknown as Ctx2D;
  return { g, fills };
}

describe("gridlock courier road paint (GU47 WP-28 GC-H2)", () => {
  it("keeps the bus lane on the asphalt of the top street, clear of the intersections", () => {
    expect(BUS_LANE.y0).toBeGreaterThanOrEqual(0);
    expect(BUS_LANE.y1).toBeLessThanOrEqual(ASPHALT_HALF);
    expect(BUS_LANE.from).toBeGreaterThan(ASPHALT_HALF);
    expect(BUS_LANE.to).toBeLessThan(TILE_M - ASPHALT_HALF);
  });

  it("keeps the loading boxes inside the crossing street's kerb lane", () => {
    for (const b of LOADING_BOXES) {
      expect(b.x0).toBeGreaterThan(TILE_M - ASPHALT_HALF);
      expect(b.x1).toBeLessThan(TILE_M);
    }
  });

  it("paints the lane, edge line, glyph bars and hatched boxes inside the tile, and restores alpha", () => {
    const { g, fills } = stub();
    const px = 600;
    const n = paintRoadMarkings(g, px);
    expect(n).toBe(fills.length);
    expect(fills.some((f) => f.color === BUS_LANE.color)).toBe(true);
    expect(fills.filter((f) => f.color === PAINT_YELLOW).length).toBeGreaterThanOrEqual(LOADING_BOXES.length * 8);
    for (const f of fills) {
      expect(f.x).toBeGreaterThanOrEqual(0);
      expect(f.y).toBeGreaterThanOrEqual(0);
      expect(f.x + f.w).toBeLessThanOrEqual(px);
      expect(f.y + f.h).toBeLessThanOrEqual(px);
    }
    expect(g.globalAlpha).toBe(1);
  });
});
