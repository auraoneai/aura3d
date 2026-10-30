/**
 * Thermal Drift HS-12 display LUT: the committed `.cube` is exactly what `foundryLutCube()` generates, passes the CLI
 * LUT admission rules, keeps coolant cyan cyan, and every circuit binds it in the colour grade.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { validateCubeLut } from "../../../packages/aura3d-cli/src/admission/cubeLut";
import { CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { CIRCUIT_LOOKS, PALETTE } from "../../../apps/showcase-heatsink/src/look";
import { FOUNDRY_LUT_SIZE, foundryGrade, foundryLutCube } from "../../../apps/showcase-heatsink/src/lut";
import { luts } from "../../../apps/showcase-heatsink/src/aura-assets";
import { buildThermalDriftScene } from "../../../apps/showcase-heatsink/src/scene";

const CUBE = join(__dirname, "../../../apps/showcase-heatsink/textures/luts/td-foundry.cube");

describe("heatsink HS-12 foundry LUT", () => {
  it("the committed file is the generator output and passes LUT admission", () => {
    const text = readFileSync(CUBE, "utf8");
    expect(text).toBe(foundryLutCube());
    expect((luts.heatsinkFoundryLut as unknown as { hash: string }).hash).toBe(`sha256-${createHash("sha256").update(text).digest("hex")}`);
    expect(validateCubeLut(text)).toMatchObject({ size: FOUNDRY_LUT_SIZE, rows: FOUNDRY_LUT_SIZE ** 3 });
  });
  it("keeps black and white near the ends and warms the highlights", () => {
    const [r0, g0, b0] = foundryGrade(0, 0, 0);
    expect(Math.max(r0, g0, b0)).toBeLessThan(0.03);
    const [r1, , b1] = foundryGrade(0.8, 0.8, 0.8);
    expect(r1).toBeGreaterThan(b1);
  });
  it("leaves coolant cyan cyan (blue and green stay above red)", () => {
    const n = Number.parseInt(PALETTE.coolantCyan.slice(1), 16);
    const [r, g, b] = foundryGrade(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
    expect(b).toBeGreaterThan(r + 0.5);
    expect(g).toBeGreaterThan(r + 0.4);
  });
  it("every circuit grade binds the LUT at its row strength", () => {
    for (const id of ["grand", "dustfall", "vesper"] as const) {
      const nodes = (buildThermalDriftScene({ circuit: CIRCUITS[id] }).toJSON() as unknown as { nodes: { kind: string; name?: string; lut?: unknown; lutIntensity?: number }[] }).nodes;
      const grade = nodes.find((n) => n.name === "td grade");
      expect(grade, id).toBeDefined();
      expect(JSON.stringify(grade!.lut), id).toContain("td-foundry");
      expect(grade!.lutIntensity).toBe(CIRCUIT_LOOKS[id].lutIntensity);
    }
  });
});
