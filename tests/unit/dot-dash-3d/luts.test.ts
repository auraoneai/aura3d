import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { BOARD_LOOKS } from "../../../apps/showcase-dot-dash-3d/src/game/look";
import { MAZE_ORDER } from "../../../apps/showcase-dot-dash-3d/src/game/mazes";
import { BOARD_LUTS, LUT_DIR, LUT_SIZE, boardLutCube, gradeColor } from "../../../apps/showcase-dot-dash-3d/scripts/write-board-luts.mjs";

const PUBLIC_DIR = path.resolve(__dirname, "../../../apps/showcase-dot-dash-3d/public");

describe("dot-dash-3d per-board LUTs (DD47-P3)", () => {
  it("has one committed, admissible .cube per board, byte-equal to the generator", () => {
    for (const id of MAZE_ORDER) {
      const served = BOARD_LOOKS[id].grade.lut;
      const file = path.join(PUBLIC_DIR, served);
      expect(path.dirname(file)).toBe(LUT_DIR);
      const text = readFileSync(file, "utf8");
      expect(text).toBe(boardLutCube(id));
      expect(validateCubeLut(text)).toMatchObject({ size: LUT_SIZE, rows: LUT_SIZE ** 3 });
    }
  });

  it("keeps black at black and white near white, and the six boards apart", () => {
    const greys: string[] = [];
    for (const id of MAZE_ORDER) {
      const terms = (BOARD_LUTS as Record<string, unknown>)[id];
      expect(gradeColor([0, 0, 0], terms)).toEqual([0, 0, 0]);
      for (const v of gradeColor([1, 1, 1], terms)) expect(v).toBeGreaterThan(0.9);
      const mid = gradeColor([0.25, 0.25, 0.25], terms) as number[];
      greys.push(mid.map((v) => v.toFixed(3)).join(","));
    }
    expect(new Set(greys).size).toBe(MAZE_ORDER.length);
  });
});
