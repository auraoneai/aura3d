import { describe, expect, test } from "vitest";
import { createAuraAssetPanelRows, createAuraPerformancePanelSnapshot } from "../../../packages/engine/src";

describe("devtools helpers", () => {
  test("summarizes asset load state and performance diagnostics", () => {
    const diagnostics = {
      backend: "canvas2d" as const,
      fps: 60,
      drawCalls: 3,
      renderSize: [960, 540] as const,
      assets: [{ id: "robot", type: "model" as const, url: "/robot.glb", status: "ready" as const }],
      warnings: [],
      errors: []
    };
    expect(createAuraAssetPanelRows(diagnostics.assets)).toEqual([{ id: "robot", status: "ready", url: "/robot.glb", message: undefined }]);
    expect(createAuraPerformancePanelSnapshot(diagnostics)).toMatchObject({ fps: 60, drawCalls: 3, backend: "canvas2d" });
  });
});
