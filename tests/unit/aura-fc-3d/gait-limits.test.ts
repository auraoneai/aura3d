import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { readGlb } from "../../../tools/aura-fc/glb.mjs";
import { gaitLimits } from "../../../tools/aura-fc/gait-limits.mjs";

const manifest = readFileSync("apps/showcase-aura-fc-3d/src/aura-assets-v2.ts", "utf8");
const glbPath = (key: string) => `public${/url: "([^"]+)"/.exec(manifest.slice(manifest.indexOf(`${key}: {`)))![1]}`;

describe.each(["fcSoccerStrikerMeshy", "fcGoalkeeperMeshy"])("%s run cycles stay inside human joint ranges", (key) => {
  const limits = gaitLimits(readGlb(glbPath(key)), ["Walk_Loop", "Run", "Sprint_Loop", "KickTap", "KickPass", "KickShot"]);
  it.each([["Walk_Loop", 35, 45], ["Run", 45, 55], ["Sprint_Loop", 60, 60]] as const)("%s: hip swing, knee bend, twist", (clip, back, front) => {
    const c = limits[clip]!;
    expect(c.hipFlexMin).toBeGreaterThanOrEqual(-back);
    expect(c.hipFlexMax).toBeLessThanOrEqual(front);
    expect(c.kneeMax).toBeLessThanOrEqual(110);
    expect(c.kneeForwardFrames).toBe(0);
    expect(c.twistMax).toBeLessThanOrEqual(8);
    expect(c.abdMax).toBeLessThanOrEqual(10);
  });
  it("kick clips bend the knee backward only and stay under 110 degrees", () => {
    for (const clip of ["KickTap", "KickPass", "KickShot"]) {
      expect(limits[clip]!.kneeMax).toBeLessThanOrEqual(110);
      expect(limits[clip]!.kneeForwardFrames).toBe(0);
    }
  });
});
