import { describe, expect, it } from "vitest";
import { effects, renderer, scene } from "../../../../packages/engine/src";
import { SSR_GATE_END, SSR_GATE_START, ssrRoughnessGate } from "../../../../packages/engine/src/agent-api/rendererDiagnostics";
import { SSR_ROUGHNESS_CUTOFF, SSR_TRACE_GLSL } from "../../../../packages/rendering/src/post/shaders/ssr.glsl";

/**
 * GU47 e6 (g01 / g10 handoff): Aura Slam authored `screenSpaceReflections({ roughness: 0.5 })` reading it as a cutoff;
 * the S3 trace takes it as the frame-wide surface roughness, so the gate is 0 on every pixel and the stage adds nothing.
 * The diagnostic names that case instead of letting a game ship an inert SSR node.
 */
describe("SSR roughness gate diagnostic", () => {
  it("mirrors the S3 trace gate", () => {
    expect(SSR_TRACE_GLSL).toContain(`1.0 - smoothstep(${SSR_GATE_START}, ${SSR_GATE_END}, u_roughness)`);
    expect(SSR_GATE_END).toBe(SSR_ROUGHNESS_CUTOFF);
    expect(ssrRoughnessGate(undefined)).toBe(1);
    expect(ssrRoughnessGate(0.3)).toBe(1);
    expect(ssrRoughnessGate(0.35)).toBe(1);
    expect(ssrRoughnessGate(0.5)).toBe(0);
    expect(ssrRoughnessGate(0.9)).toBe(0);
    expect(ssrRoughnessGate(0.45)).toBeCloseTo(0.259, 3);
  });

  it("warns when the authored roughness zeroes every reflection", () => {
    const report = renderer.diagnostics(scene().add(effects.screenSpaceReflections({ intensity: 0.75, maxDistance: 28, roughness: 0.5, thickness: 0.3 })));
    const warning = report.warnings.find((w) => w.startsWith("SSR_ROUGHNESS_GATED"));
    expect(warning).toMatch(/zero on every pixel/);
  });

  it("warns about a partial gate and stays silent at full strength", () => {
    const partial = renderer.diagnostics(scene().add(effects.screenSpaceReflections({ intensity: 1, roughness: 0.45 })));
    expect(partial.warnings.find((w) => w.startsWith("SSR_ROUGHNESS_GATED"))).toMatch(/scales every reflection to 0\.26/);
    for (const roughness of [undefined, 0, 0.3]) {
      const full = renderer.diagnostics(scene().add(effects.screenSpaceReflections({ intensity: 1, ...(roughness === undefined ? {} : { roughness }) })));
      expect(full.warnings.some((w) => w.startsWith("SSR_ROUGHNESS_GATED"))).toBe(false);
    }
  });
});
