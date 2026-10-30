import { describe, expect, it } from "vitest";
import { createAuraText3DGeometry } from "@aura3d/engine";
import { BOARD, boardPose, textOrigin, textWidth } from "../../../examples/drift-and-deliver-port/board";

describe("gridlock courier drop-off address board (GU47 WP-28 GC-V2)", () => {
  it("hides under the road with no open job", () => {
    expect(boardPose(null, [0, 5, 0]).y).toBeLessThan(0);
  });

  it("stands between the pillar and the eye, facing the eye", () => {
    const p = boardPose({ x: 100, z: 50 }, [100, 4, 10]);
    expect(p.y).toBe(BOARD.y);
    expect(p.z).toBeCloseTo(50 - BOARD.offset, 6);
    // the eye is due -z: yaw pi turns the +z face toward it
    expect(Math.abs(p.yaw)).toBeCloseTo(Math.PI, 6);
  });

  it("measures the block text like text3D and centres it on the panel", () => {
    const g = createAuraText3DGeometry(BOARD.text, { size: BOARD.size });
    const raw = (g.geometry as unknown as { positions: readonly (number | readonly number[])[] }).positions;
    const flat = raw.flatMap((v) => (typeof v === "number" ? [v] : [...v]));
    let max = -Infinity;
    for (let i = 0; i < flat.length; i += 3) max = Math.max(max, flat[i]!);
    expect(Number.isFinite(max)).toBe(true);
    // the last glyph column ends 0.08 cell short of its cell (cell * 0.92 boxes)
    expect(textWidth(BOARD.text, BOARD.size)).toBeGreaterThanOrEqual(max - 1e-6);
    expect(textWidth(BOARD.text, BOARD.size)).toBeLessThan(BOARD.panel[0]);
    const pose = { x: 0, y: 9, z: 0, yaw: 0 };
    const o = textOrigin(pose, 10, BOARD.size);
    expect(o[0]).toBeCloseTo(-5, 6);
    expect(o[2]).toBeGreaterThan(BOARD.panel[2] / 2);
  });
});
