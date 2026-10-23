import { describe, expect, it } from "vitest";
import * as shaders from "../../../examples/heatsink-port/shaders";

/** GLSL leaves smoothstep(e0, e1, x) undefined when e0 >= e1; SwiftShader returns NaN, which blanked the whole sky. */
describe("heatsink-port shaders avoid undefined GLSL", () => {
  for (const [name, source] of Object.entries(shaders)) {
    it(`${name}: no smoothstep with literal edges in descending order`, () => {
      for (const m of String(source).matchAll(/smoothstep\(\s*(-?[\d.]+)\s*,\s*(-?[\d.]+)\s*,/g)) {
        expect(Number(m[1]), `${name}: ${m[0]}`).toBeLessThan(Number(m[2]));
      }
    });
  }
});
