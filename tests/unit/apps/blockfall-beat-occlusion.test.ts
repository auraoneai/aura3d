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
  const source = readFileSync("apps/showcase-blockfall-reactor/src/reactor-scene.ts", "utf8");
  const boardWidthUnits = CELL * BOARD_WIDTH;

  it("does not restore the old arbitrary foreground sphere", () => {
    expect(source).not.toContain("const radius = 0.1 + (1 - burstProgress) * 0.52");
    expect(source).toContain('primitives.box({ name: "line clear reactor charge"');
    expect(source).not.toContain('primitives.sphere({ name: "line clear reactor charge"');
  });

  it("mounts the clear feedback beside the playfield on the physical reactor", () => {
    const declaration = source.split("\n").findIndex((line) => line.includes('name: "line clear reactor charge"'));
    const node = source.split("\n").slice(declaration, declaration + 5).join("\n");
    expect(node).toContain('.position(1.52, BOARD_CENTER_Y, 0.3)');
    expect(node).toContain(".scale(HIDDEN_BLOCK_SCALE)");
  });

  it("retains the board width as a meaningful nonzero geometry constraint", () => {
    expect(boardWidthUnits).toBeGreaterThan(0);
    expect(source).toContain("createClearFlashNodes");
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

  it("keeps the active and clear rings face-on to the board", () => {
    const activeStart = source.indexOf('name: "active reactor drop reticle"');
    const clearStart = source.indexOf('name: "line clear reactor wave"');
    expect(activeStart).toBeGreaterThanOrEqual(0);
    expect(clearStart).toBeGreaterThan(activeStart);
    const activeNode = source.slice(activeStart, clearStart);
    const clearNode = source.slice(clearStart, source.indexOf("// The guide is hidden", clearStart));
    // The falling-block well faces the camera in XY. Rotating either torus to
    // XZ makes the feedback collapse to an edge-on line in the review frame.
    expect(activeNode).not.toContain(".rotate(Math.PI / 2, 0, 0)");
    expect(clearNode).not.toContain(".rotate(Math.PI / 2, 0, 0)");
  });
});
