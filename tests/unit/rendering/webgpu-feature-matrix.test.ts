import { describe, expect, it } from "vitest";
import { createWebGPUFeatureMatrixReport } from "../../../tools/webgpu-feature-matrix";

describe("WebGPU feature matrix report", () => {
  it("contains required product rows and evidence states", () => {
    const report = createWebGPUFeatureMatrixReport();
    const rows = new Map(report.rows.map((row) => [row.id, row]));

    for (const id of ["geometry", "pbr", "render-targets", "readback", "instancing", "webgpu-compute"]) {
      expect(rows.get(id), `missing ${id}`).toBeTruthy();
      expect(rows.get(id)?.evidenceFiles.length).toBeGreaterThan(0);
    }
    expect(["supported", "partial", "blocked", "untested"]).toContain(rows.get("webgpu-compute")?.state);
  });
});
