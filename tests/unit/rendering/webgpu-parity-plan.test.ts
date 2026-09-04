import { describe, expect, it } from "vitest";
import {
  describeWebGPULostDevice,
  screenWebGPURenderBundlePrototype,
  WEBGPU_PARITY_PLAN
} from "../../../packages/rendering/src/production-runtime";

describe("J2 WebGPU parity plan honesty", () => {
  it("declares every feature row with its WGSL foundation and no unproven proof", () => {
    const ids = WEBGPU_PARITY_PLAN.map((row) => row.id);
    for (const required of ["bloom-pyramid", "color-grade", "fxaa-taa", "spot-shadows", "textured-pbr", "render-bundles", "compute-particles"] as const) {
      expect(ids, `${required} must have a plan row`).toContain(required);
    }
    // Nothing is proven without adapter/backend/dispatch/render/pixel evidence.
    // textured-pbr earned all five legs on Apple Metal 3 (2026-09-04); every
    // other row must stay unproven-or-measured until its own five legs land.
    for (const row of WEBGPU_PARITY_PLAN) {
      if (row.id !== "textured-pbr") {
        expect(row.status, `${row.id} must not flip without its own five legs`).not.toBe("proven");
      }
      expect(row.wgslFoundation.length).toBeGreaterThan(0);
      expect(row.evidence.length).toBeGreaterThan(0);
    }
    const texturedPbr = WEBGPU_PARITY_PLAN.find((row) => row.id === "textured-pbr");
    expect(texturedPbr?.status).toBe("proven");
    for (const leg of ["adapter", "backend", "dispatch", "render", "pixel"]) {
      expect(texturedPbr?.evidence.toLowerCase(), `proven textured-pbr evidence must cite the ${leg} leg`).toContain(leg);
    }
    const bundles = WEBGPU_PARITY_PLAN.find((row) => row.id === "render-bundles");
    expect(bundles?.status).toBe("prototype-measured");
    expect(bundles?.evidence.toLowerCase()).toContain("measured");
  });

  it("screens the render-bundle prototype without manufacturing proof", () => {
    // D1/P2-style static repeat workload qualifies structurally but still needs hardware numbers.
    const candidate = screenWebGPURenderBundlePrototype({ totalDraws: 4096, staticRepeatDraws: 4096 });
    expect(candidate.verdict).toBe("needs-hardware-proof");
    expect(candidate.eligibleDraws).toBe(4096);

    // Dynamic workload with no repeat draws is OUT with reasoning, not silently kept.
    const out = screenWebGPURenderBundlePrototype({ totalDraws: 12, staticRepeatDraws: 1 });
    expect(out.verdict).toBe("out");

    // Adoption requires measured numbers — structure alone never adopts.
    const measured = screenWebGPURenderBundlePrototype({
      totalDraws: 4096,
      staticRepeatDraws: 4096,
      measuredExecuteMs: 0.4,
      measuredDrawMs: 3.8
    });
    expect(measured.verdict).toBe("adopt-candidate");
    expect(measured.estimatedExecuteVsDrawRatio).toBeLessThan(1);
  });

  it("reports lost-device fail-closed with no silent WebGL substitution", () => {
    const report = describeWebGPULostDevice("destroyed");
    expect(report).toMatchObject({
      schema: "a3d-webgpu-lost-device",
      reason: "destroyed",
      fallbackAttempted: false,
      action: "fail-closed"
    });
    expect(report.message).toMatch(/No silent WebGL substitution/);
    expect(describeWebGPULostDevice("   ").reason).toBe("unknown");
  });
});
