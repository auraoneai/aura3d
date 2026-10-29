/**
 * Thermal Drift renderer quality (wave-2 handoff from E1): the app asks for `{ tier: "auto" }` instead of the fixed "high"
 * string, and that mounts at exactly the settings the old option produced.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMountQuality } from "../../../packages/engine/src/agent-api/compiler/renderer";

const mainSource = readFileSync(resolve(__dirname, "../../../apps/showcase-heatsink/src/main.ts"), "utf8");

describe("heatsink renderer quality", () => {
  it("passes renderer.quality as { tier: \"auto\" }, not a fixed tier string", () => {
    expect(mainSource).toContain('renderer: { quality: { tier: "auto" } }');
    expect(mainSource).not.toMatch(/renderer:\s*\{\s*quality:\s*"/);
  });

  it("mounts at the same tier and settings as the old \"high\" option", () => {
    const now = resolveMountQuality({ quality: { tier: "auto" } } as never);
    const before = resolveMountQuality({ quality: "high" } as never);
    expect(now.tier).toBe("high");
    expect(now).toEqual(before);
  });
});
