import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { createWebGPUCompletionAuditReport } from "../../../tools/webgpu-completion-audit";

describe("tools/webgpu-completion-audit", () => {
  it("requires WebGPU reports and approved root routes", () => {
    const report = createWebGPUCompletionAuditReport();
    const source = readFileSync(resolve("tools/webgpu-completion-audit/index.ts"), "utf8");

    expect(report.schema).toBe("a3d-webgpu-completion-audit");
    expect(source).toContain("tests/reports/webgpu-feature-matrix.json");
    expect(source).toContain("tests/reports/webgpu-route-health.json");
    expect(source).toContain("tests/reports/webgpu-visual-parity.json");
    expect(source).toContain("tests/reports/webgpu-hardware-matrix.json");
    expect(source).toContain("/apps/wow-webgpu-compute-particles/");
  });
});
