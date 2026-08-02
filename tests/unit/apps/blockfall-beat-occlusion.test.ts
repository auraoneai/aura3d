import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOARD_WIDTH } from "../../../apps/showcase-blockfall-reactor/src/rules";
import { CELL } from "../../../apps/showcase-blockfall-reactor/src/reactor-scene";

/**
 * Regression coverage for defect 41.
 *
 * FS-101 requires that no "giant foreground sphere/triangle/prop" occlude the board.
 * That was recorded as done, but the line-clear beat reintroduced exactly it: the burst
 * grew to radius 0.62, a 1.24-unit diameter against a 2.08-unit board, which rendered as
 * a 373x303 px flat grey disc covering **96% of the well's on-screen width** and hiding
 * the settled stack behind it.
 *
 * The beat must read as a flash across the cleared row. These checks assert that from the
 * route's own constants and source rather than from a screenshot, so the shape cannot
 * regress without failing here.
 */
describe("Blockfall line-clear beat does not occlude the board", () => {
  const source = readFileSync("apps/showcase-blockfall-reactor/src/main.ts", "utf8");
  const boardWidthUnits = CELL * BOARD_WIDTH;

  it("scales the burst from board geometry rather than an arbitrary radius", () => {
    // The previous form hardcoded `0.1 + (1 - burstProgress) * 0.52`, unrelated to the
    // board, which is how it grew past the well.
    expect(source).not.toContain("const radius = 0.1 + (1 - burstProgress) * 0.52");
    expect(source).toContain("const halfWidth = (CELL * BOARD_WIDTH) / 2");
  });

  it("keeps the burst within one cell vertically so the stack stays visible", () => {
    const match = source.match(/setScale\(\[halfWidth \* spread, CELL \* ([\d.]+), CELL \* ([\d.]+)\]\)/);
    expect(match, "burst scale should be expressed in cell units").not.toBeNull();
    const verticalCells = Number(match?.[1]);
    const depthCells = Number(match?.[2]);
    // A row flash occupies a fraction of one cell in height; anything approaching a
    // cell or more starts covering neighbouring rows.
    expect(verticalCells).toBeGreaterThan(0);
    expect(verticalCells).toBeLessThan(0.6);
    expect(depthCells).toBeLessThan(0.6);
  });

  it("never spans more than the board width at full spread", () => {
    const spreadMatch = source.match(/const spread = ([\d.]+) \+ \(1 - burstProgress\) \* ([\d.]+)/);
    expect(spreadMatch, "burst spread should be a declared ramp").not.toBeNull();
    const base = Number(spreadMatch?.[1]);
    const growth = Number(spreadMatch?.[2]);
    const maxSpread = base + growth;
    // `halfWidth * spread` is a half-extent, so the full width is 2 * halfWidth * spread.
    const maxWidthUnits = boardWidthUnits * maxSpread;
    expect(maxSpread).toBeLessThanOrEqual(1);
    expect(maxWidthUnits).toBeLessThanOrEqual(boardWidthUnits);
  });

  it("keeps every beat overlay translucent so the board reads through it", () => {
    const scene = readFileSync("apps/showcase-blockfall-reactor/src/reactor-scene.ts", "utf8");
    for (const name of ["level up charge band", "game over wash", "reset sweep"]) {
      const declaration = scene.split("\n").find((line) => line.includes(`name: "${name}`));
      expect(declaration, `${name} material should exist`).toBeDefined();
      const opacity = declaration?.match(/opacity:\s*([\d.]+)/)?.[1];
      expect(opacity, `${name} should declare an opacity so it does not fully hide the board`).toBeDefined();
      expect(Number(opacity)).toBeLessThan(1);
    }
  });
});
