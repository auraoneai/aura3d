import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { HOOP_MATERIALS, ORIGINAL_HOOP_MATERIALS, hoopMaterials } from "../../../apps/showcase-aura-hoops-3d/src/hoopMaterials";
import { HOOPS_PALETTE } from "../../../apps/showcase-aura-hoops-3d/src/courtRigs";

const MAIN = readFileSync(path.resolve(__dirname, "../../../apps/showcase-aura-hoops-3d/src/main.ts"), "utf8");

describe("Aura Hoops hoop materials (H47-M2 code part)", () => {
  it("?look=original keeps the 4.6 overrides", () => {
    expect(hoopMaterials(true)).toBe(ORIGINAL_HOOP_MATERIALS);
    expect(ORIGINAL_HOOP_MATERIALS.rig[0]).toMatchObject({ color: "#2f3439", metallic: 0.58 });
    expect(ORIGINAL_HOOP_MATERIALS.ball).toEqual([]);
  });

  it("galvanised poles replace the camo maps in the chain-link steel tone", () => {
    const rig = HOOP_MATERIALS.rig[0]!;
    expect(rig).toMatchObject({ color: HOOPS_PALETTE.chainLink, replaceTextures: true });
    expect(rig.metallic).toBeGreaterThanOrEqual(0.85);
  });

  it("glass backboard, powder-coat rim and rubber ball", () => {
    const board = HOOP_MATERIALS.backboard[0]!;
    expect(board.opacity).toBeLessThan(0.5);
    expect(board.roughness).toBeLessThan(0.1);
    expect(board.transmission).toBeGreaterThan(0.5);
    const rim = HOOP_MATERIALS.rim[0]!;
    expect(rim.metallic).toBeLessThan(0.2);
    expect(rim.roughness).toBeGreaterThan(0.4);
    const ball = HOOP_MATERIALS.ball[0]!;
    expect(ball.replaceTextures).toBeUndefined();
    expect(ball.metallic).toBe(0);
  });

  it("main.ts reads the set for every hoop model", () => {
    for (const part of ["rig", "backboard", "rim"]) expect(MAIN).toContain(`hoopMaterials(LOOK_ORIGINAL).${part}`);
    expect(MAIN).toContain("hoopMaterials(false).ball");
  });
});

describe("Aura Hoops backboard shake (H47-AN1 part)", () => {
  it("shakes only on the new look, without a cosmetic RNG draw, and holds still under reduced motion", () => {
    expect(MAIN).toMatch(/backboardNode = LOOK_ORIGINAL \? undefined : req\("backboard-assembly"\)/);
    const block = MAIN.slice(MAIN.indexOf("if (backboardNode) {"), MAIN.indexOf("if (backboardNode) {") + 260);
    expect(block).toContain("reducedMotion ? 0 : rimShake");
    expect(block).not.toContain("fxRng");
  });
});
