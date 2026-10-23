import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CELLS, paintFacade, paintPark, paintPlaza, paintRoadTile, paintShopfront, paintSky, paintSkyline, rng, type Ctx2D } from "../../../examples/drift-and-deliver-port/textures";

function stub(): { ctx: Ctx2D; fills: number; strokes: number } {
  const state = { fills: 0, strokes: 0 };
  const gradient = { addColorStop() {} } as unknown as CanvasGradient;
  const ctx = {
    fillStyle: "", strokeStyle: "", lineWidth: 1, globalAlpha: 1,
    fillRect() { state.fills++; }, strokeRect() { state.strokes++; }, beginPath() {}, moveTo() {}, lineTo() {}, closePath() {},
    fill() { state.fills++; }, stroke() { state.strokes++; }, save() {}, restore() {}, translate() {}, rotate() {}, arc() {}, ellipse() {},
    createLinearGradient: () => gradient, createRadialGradient: () => gradient, setLineDash() {}
  } as unknown as Ctx2D;
  return { ctx, get fills() { return state.fills; }, get strokes() { return state.strokes; } } as never;
}

describe("procedural textures", () => {
  it("rng is deterministic and in [0, 1)", () => {
    const a = rng(7), b = rng(7);
    for (let i = 0; i < 50; i++) {
      const v = a();
      expect(v).toBe(b());
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("paints the road tile with a crosswalk on every arm and dashed centre lines", () => {
    const s = stub();
    const layout = paintRoadTile(s.ctx, 512);
    expect(layout.stripes).toBe(4 * 2 * 2 * 9);
    expect(layout.dashes).toBe(2 * 2 * 6);
    expect(s.fills).toBeGreaterThan(9000);
    expect(s.strokes).toBeGreaterThanOrEqual(8);
  });

  it("paints facades with some lit windows and a matching emissive tile", () => {
    for (const kind of ["tower", "apartment", "brick"] as const) {
      const a = stub(), e = stub();
      const layout = paintFacade(kind, a.ctx, e.ctx, 256, 1);
      expect(layout.total).toBe(CELLS * CELLS);
      expect(layout.lit).toBeGreaterThan(4);
      expect(layout.lit).toBeLessThan(layout.total * 1.5);
    }
  });

  it("paints parks, plazas, shopfronts, sky and skyline without throwing", () => {
    for (const f of [(c: Ctx2D) => paintPark(c, 256), (c: Ctx2D) => paintPlaza(c, 256), (c: Ctx2D) => paintShopfront(c, stub().ctx, 256, 64), (c: Ctx2D) => paintSky(c, 8, 64)]) f(stub().ctx);
    expect(paintSkyline(stub().ctx, 512, 128)).toBeGreaterThan(20);
  });
});

describe("the port's art layer stays on the public engine surface", () => {
  it("imports no engine internals and no original assets", () => {
    const dir = "examples/drift-and-deliver-port";
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".ts"))) {
      const src = readFileSync(`${dir}/${file}`, "utf8");
      expect(src, file).not.toMatch(/from "@aura3d\/(rendering|core|scene|ecs)/);
      expect(src, file).not.toMatch(/usecrayon|TODO\(a3d-migrate\)/);
    }
  });
});
