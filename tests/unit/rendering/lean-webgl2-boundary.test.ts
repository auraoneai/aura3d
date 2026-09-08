import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string): string => readFileSync(path, "utf8");

describe("lean WebGL2 ownership boundary", () => {
  it("keeps the first-frame lean renderer on its bounded device", () => {
    const renderer = read("packages/rendering/src/lean/LeanProductionRenderer.ts");
    const device = read("packages/rendering/src/LeanWebGL2Device.ts");
    expect(renderer).toContain('from "../LeanWebGL2Device.js"');
    expect(renderer).not.toContain('from "../WebGL2Device.js"');
    expect(device).toContain("export class LeanWebGL2Device implements RenderDevice");
    expect(device).not.toContain("executeReflectionSurfaceSsr");
    expect(device).not.toContain("TemporalGpuBindings");
  });
});
