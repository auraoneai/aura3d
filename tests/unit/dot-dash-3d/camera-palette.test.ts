import { describe, expect, it } from "vitest";
import { boardFits, fitDistanceScale, projectNdc, scalePose, type CameraPose } from "../../../apps/showcase-dot-dash-3d/src/game/camera";
import { boardLook, luma, pylonLayout, REFERENCE_LOOK, withLuma } from "../../../apps/showcase-dot-dash-3d/src/game/palette";
import { MAZES, MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";

/** Glint Courier camera fit (DD-3) and per-board palette (DD-E1). */
const RIG: CameraPose = { position: [0, 17.2, 13.8], target: [0, 0, 0], fov: 48 };

describe("camera fit (DD-3)", () => {
  it("the base rig cuts the board on a 390x844 phone", () => {
    expect(boardFits(RIG, 390 / 844)).toBe(false);
    // the audit's figure: about +-4.5 world units visible across at the board centre
    const edge = projectNdc(RIG, 390 / 844, [9.5, 0, 0])!;
    expect(Math.abs(edge[0])).toBeGreaterThan(1.8);
  });

  it("pulls back until the whole board fits at phone and desktop aspects", () => {
    for (const aspect of [390 / 844, 0.75, 1, 1280 / 720, 21 / 9]) {
      const k = fitDistanceScale(RIG, aspect);
      expect(k).toBeGreaterThanOrEqual(1);
      expect(boardFits(scalePose(RIG, k), aspect)).toBe(true);
      // tight: 2% closer would cut the board again (unless the base already fits)
      if (k > 1) expect(boardFits(scalePose(RIG, k * 0.98), aspect)).toBe(false);
    }
  });

  it("changes desktop framing only a little and phones a lot", () => {
    expect(fitDistanceScale(RIG, 1280 / 720)).toBeLessThan(1.25);
    expect(fitDistanceScale(RIG, 390 / 844)).toBeGreaterThan(1.6);
  });

  it("keeps the view direction", () => {
    const p = scalePose(RIG, 2);
    expect(p.position[1] / p.position[2]).toBeCloseTo(17.2 / 13.8, 6);
    expect(p.target).toEqual(RIG.target);
  });
});

describe("board palette (DD-E1)", () => {
  it("board 1 keeps the authored look", () => {
    expect(boardLook(MAZES.classic)).toEqual({ ...REFERENCE_LOOK, wall: MAZES.classic.palette.wall });
    expect(MAZES.classic.palette.wall).toBe(REFERENCE_LOOK.wall);
  });

  it("every other board gets its own slab and wall glow at board 1's brightness", () => {
    const slabs = new Set<string>();
    for (const id of MAZE_ORDER) {
      const look = boardLook(MAZES[id]);
      slabs.add(look.slab);
      expect(Math.abs(luma(look.slab) - luma(REFERENCE_LOOK.slab)), id).toBeLessThan(2);
      expect(Math.abs(luma(look.wallEmissive) - luma(REFERENCE_LOOK.wallEmissive)), id).toBeLessThan(2);
      // walls stay lighter than the slab on every board, as on board 1 (dark walls on a lifted slab read as holes)
      expect(luma(look.wall), id).toBeGreaterThan(luma(look.slab));
    }
    expect(slabs.size).toBe(MAZE_ORDER.length);
  });

  it("withLuma keeps the hue", () => {
    const c = withLuma("#130b33", 60);
    expect(luma(c)).toBeCloseTo(60, 0);
    const [r, , b] = [parseInt(c.slice(1, 3), 16), 0, parseInt(c.slice(5, 7), 16)];
    expect(b).toBeGreaterThan(r);
  });

  it("pylon layouts differ per board and board 1 keeps its original layout", () => {
    const keys = MAZE_ORDER.map((id) => JSON.stringify(pylonLayout(id, MAZES[id].theme)));
    expect(new Set(keys).size).toBe(MAZE_ORDER.length);
    const first = pylonLayout("classic", "grid")[0]!;
    const r1 = Math.abs(Math.sin(19)) % 1;
    expect(first.x).toBeCloseTo(-(12.6 + r1 * 3.5), 6);
    expect(pylonLayout("spiral", "spiral")).toEqual(pylonLayout("spiral", "spiral"));
  });
});
