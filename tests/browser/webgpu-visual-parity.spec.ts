import { existsSync, readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { WEBGPU_ROOT_ROUTES } from "./webgpu-route-helpers";

test.describe("WebGPU visual parity report", () => {
  test("records WebGPU route screenshots and delta metrics when the report exists", () => {
    const reportPath = "tests/reports/webgpu-visual-parity.json";
    test.skip(!existsSync(reportPath), "Run pnpm webgpu:visual-parity after route capture to generate the report.");

    const report = JSON.parse(readFileSync(reportPath, "utf8")) as {
      pass?: boolean;
      routes?: readonly { path: string; screenshot?: string }[];
      comparisons?: readonly { meanDelta?: number; changedPixels?: number }[];
    };
    expect(report.pass).toBe(true);
    for (const route of WEBGPU_ROOT_ROUTES.filter((entry) => entry !== "/apps/wow-webgpu-compute-particles/")) {
      expect(report.routes?.map((entry) => entry.path)).toContain(route);
    }
    expect(report.comparisons?.some((entry) => typeof entry.meanDelta === "number" || typeof entry.changedPixels === "number")).toBe(true);
  });
});
