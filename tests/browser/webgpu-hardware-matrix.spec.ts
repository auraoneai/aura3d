import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

test.describe("WebGPU hardware matrix", () => {
  test("records browser/device availability and distinguishes real hardware evidence", () => {
    const reportPath = "tests/reports/webgpu-hardware-matrix.json";
    test.skip(!existsSync(reportPath), "Run tests/browser/webgpu-real-device.spec.ts to generate hardware matrix evidence.");

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      status?: string;
      evidenceType?: string;
      results?: readonly {
        browserName?: string;
        userAgent?: string;
        hasNavigatorGpu?: boolean;
        adapterStatus?: string;
        deviceStatus?: string;
      }[];
    };

    expect(report.status).toBe("pass");
    expect(report.evidenceType).toBe("real-navigator-gpu-probe");
    expect(report.results?.length ?? 0).toBeGreaterThan(0);
    for (const result of report.results ?? []) {
      expect(result.browserName).toBeTruthy();
      expect(result.userAgent).toBeTruthy();
      expect(typeof result.hasNavigatorGpu).toBe("boolean");
      expect(result.adapterStatus).toBeTruthy();
      expect(result.deviceStatus).toBeTruthy();
    }
  });
});
