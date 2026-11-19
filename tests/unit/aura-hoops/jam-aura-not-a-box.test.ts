import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/** owner (placeholder look): the jam aura was a 1.9 m translucent orange column over the ball handler */
describe("Hoops jam aura is a floor glow, not a standing box", () => {
  const src = readFileSync(new URL("../../../apps/showcase-aura-hoops-3d/src/main.ts", import.meta.url), "utf8");
  it("the aura's drawn height is a few centimetres and it sits on the floor", () => {
    const m = src.match(/const JAM_AURA_SCALE[^=]*=\s*\[([\d.]+),\s*([\d.]+),\s*([\d.]+)\]/);
    expect(m).not.toBeNull();
    const height = 1.9 * Number(m![2]);
    expect(height).toBeLessThan(0.05);
    expect(Number(src.match(/const JAM_AURA_Y = ([\d.]+)/)![1])).toBeLessThan(0.1);
    expect(src).not.toMatch(/r\.aura\?\.setPosition\([^)]*\+ 0\.95/);
  });
});
