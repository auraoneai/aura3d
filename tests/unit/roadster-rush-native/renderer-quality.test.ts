import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMountQuality } from "../../../packages/engine/src/agent-api/compiler/renderer";
import { StubQualityController } from "../../../packages/rendering/src/contracts/quality";

const mainSource = readFileSync(resolve(__dirname, "../../../apps/showcase-roadster-rush/src/main.ts"), "utf8");

describe("roadster-rush renderer quality (E1 handoff, RENDERER_QUALITY_STRING)", () => {
  it("asks for the auto tier, not a fixed tier string", () => {
    expect(mainSource).toContain('renderer: { quality: "auto" }');
    expect(mainSource).not.toMatch(/quality:\s*"(low|medium|high|ultra)"/);
  });

  it("mounts at the same tier as the old fixed \"high\" while the quality lane is off", () => {
    const before = resolveMountQuality({ quality: "high" });
    const after = resolveMountQuality({ quality: "auto" });
    expect(after.tier).toBe("high");
    expect(after).toEqual(before);
    // Lane off: prd11 builds the stub with the parsed request and no coarse-pointer hint.
    expect(new StubQualityController("auto").tier).toBe(new StubQualityController("high").tier);
  });
});
