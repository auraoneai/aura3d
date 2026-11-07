import { describe, expect, it } from "vitest";
import { PAPER_INPUTS, PAPER_PASS_NAME, paperPass, paperScale } from "../../../examples/where-the-wind-wanders-port/paper-pass";

describe("gouache paper pass (5.0 custom-pass contract)", () => {
  it("declares exactly the colour input the display tail provides", () => {
    expect(PAPER_INPUTS).toEqual(["color"]);
    const pass = paperPass(960, 540) as unknown as { name: string; inputs?: readonly string[]; uniforms?: Record<string, unknown> };
    expect(pass.name).toBe(PAPER_PASS_NAME);
    expect(pass.inputs).toEqual(["color"]);
    expect(pass.uniforms?.u_paperScale).toEqual([320, 180]);
  });

  it("keeps the grain one cell per three drawing-buffer pixels at any canvas size", () => {
    expect(paperScale(960, 540)).toEqual([320, 180]);
    expect(paperScale(1200, 675)).toEqual([400, 225]);
    expect(paperScale(0, 0)).toEqual([1 / 3, 1 / 3]);
  });
});
