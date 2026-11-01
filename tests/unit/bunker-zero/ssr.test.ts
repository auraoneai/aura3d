import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { effects, renderer, scene } from "../../../packages/engine/src";
import { ssrRoughnessGate } from "../../../packages/engine/src/agent-api/rendererDiagnostics";

/**
 * GU47 phase 7 (e6 section 1): Bunker Zero authored `roughness: 0.5` as a cutoff, which zeroed the S3 trace on every
 * pixel (SSR_ROUGHNESS_GATED). The shipped BZ_SSR must keep the gate fully open.
 */
const source = readFileSync(new URL("../../../apps/showcase-bunker-zero/src/main.ts", import.meta.url), "utf8");
const match = /const BZ_SSR = \{ intensity: ([\d.]+), maxDistance: ([\d.]+), roughness: ([\d.]+), thickness: ([\d.]+) \}/.exec(source);

describe("bunker-zero SSR", () => {
  it("authors a roughness the S3 gate passes at full strength", () => {
    expect(match).not.toBeNull();
    const [intensity, maxDistance, roughness, thickness] = match!.slice(1).map(Number);
    expect(ssrRoughnessGate(roughness)).toBe(1);
    const report = renderer.diagnostics(scene().add(effects.screenSpaceReflections({ intensity, maxDistance, roughness, thickness })));
    expect(report.warnings.filter((w) => w.startsWith("SSR_ROUGHNESS_GATED"))).toEqual([]);
  });
});
