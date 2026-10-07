import { describe, expect, it } from "vitest";

import "../../../../packages/engine/src/lanes/index"; // engine lane barrels self-register on import
import { diagnosticsSectionsAll } from "../../../../packages/engine/src/contracts/diagnostics";
import type { AuraApp } from "../../../../packages/engine/src/agent-api/index";

const PERCENTILE_FIELDS = ["p50", "p95", "p99", "max"] as const;

function percentiles(value: unknown): boolean {
  return typeof value === "object" && value !== null
    && PERCENTILE_FIELDS.every((field) => typeof (value as Record<string, unknown>)[field] === "number");
}

const DISPOSED_APP = { disposed: true } as unknown as AuraApp;

describe("C-31 diagnostics sections (prd11)", () => {
  it("registers frame, quality and renderer.batching", () => {
    const keys = diagnosticsSectionsAll().filter((section) => section.owner === "prd11").map((section) => section.key);
    expect(keys).toEqual(expect.arrayContaining(["frame", "quality", "renderer.batching"]));
  });

  it("frame is schema-valid on a disposed app with no GPU readback", () => {
    const section = diagnosticsSectionsAll().find((s) => s.key === "frame");
    expect(section).toBeDefined();
    const report = section!.collect(DISPOSED_APP) as Record<string, unknown>;
    expect(report).toBeTypeOf("object");
    expect(typeof report.frames).toBe("number");
    expect(report.fps === null || typeof report.fps === "number").toBe(true);
    for (const key of ["intervalMs", "cpuFrameMs", "cpuSubmitMs"]) {
      expect(percentiles(report[key]), key).toBe(true);
    }
    expect(report.gpuMs === null || percentiles(report.gpuMs)).toBe(true);
    for (const key of ["drawCalls", "readbacksThisFrame", "bufferCreatesThisFrame", "renderTargetsCreatedThisFrame", "liveBuffers", "liveVertexArrays", "textureBytes", "renderTargetBytes"]) {
      expect(typeof report[key] === "number", key).toBe(true);
    }
  });

  it("quality and renderer.batching are schema-valid with no telemetry", () => {
    const sections = Object.fromEntries(diagnosticsSectionsAll().map((section) => [section.key, section]));
    const quality = sections.quality!.collect(DISPOSED_APP) as Record<string, unknown>;
    expect(quality).toHaveProperty("decision");
    expect(quality).toHaveProperty("settings");
    expect(quality).toHaveProperty("governorSteps");
    expect(quality).toHaveProperty("locked");
    expect(quality).toHaveProperty("probe");

    const batching = sections["renderer.batching"]!.collect(DISPOSED_APP) as Record<string, unknown>;
    expect(batching).toMatchObject({
      inputItems: expect.any(Number),
      outputDraws: expect.any(Number),
      instancedBatches: expect.any(Number),
      multiDrawBatches: expect.any(Number),
      reasonsNotBatched: expect.any(Object),
      planBuildMs: expect.any(Number),
      planVersion: expect.any(Number)
    });
  });
});
