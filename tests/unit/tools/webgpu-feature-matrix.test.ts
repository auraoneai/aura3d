import { describe, expect, it } from "vitest";
import { createWebGPUFeatureMatrixReport } from "../../../tools/webgpu-feature-matrix";

describe("tools/webgpu-feature-matrix", () => {
  it("fails supported rows that point at missing evidence files", () => {
    const report = createWebGPUFeatureMatrixReport({
      rows: [{
        id: "missing-supported-row",
        label: "Missing supported row",
        state: "supported",
        evidenceFiles: ["does/not/exist.ts"],
        detail: "test"
      }]
    });

    expect(report.pass).toBe(false);
    expect(report.failures.join("\n")).toContain("missing-supported-row");
  });
});
