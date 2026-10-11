import { test, expect } from "@playwright/test";
import { nonFavicon, openTool } from "./specHelpers";

// PRD-01 §16.2 `frame-graph.spec.ts` / §17.1 S1 browser half (row 01-S1):
// on a real WebGL2 frame through `createAuraApp`, a C-01 contributor
// registered for `after-opaque` sees the scene-depth copy and the forward
// target on the blackboard, and the depth it samples from the copy is the
// opaque pass's depth (box in the center < far-plane corner). With the flag
// off the contributor is never called. The unit half is
// tests/unit/contracts/impl/prd01-frame-graph.test.ts (#943).

interface FrameGraphReport {
  readonly flags: string;
  readonly afterOpaqueCalls: number;
  readonly sceneDepthAvailable: boolean;
  readonly depthCopyPublished: boolean;
  readonly forwardTargetPublished: boolean;
  readonly centerDepth: number | null;
  readonly cornerDepth: number | null;
  readonly drawCalls: number;
  readonly errors: readonly string[];
}

test("after-opaque sees the scene depth copy (a3d-qr=core)", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<FrameGraphReport>(page, "tools=frame-graph&a3d-qr=core", pageErrors);
  test.info().annotations.push({ type: "metric", description: JSON.stringify(report) });
  expect(report.errors).toEqual([]);
  expect(report.drawCalls).toBeGreaterThan(0);
  expect(report.afterOpaqueCalls).toBeGreaterThan(0);
  expect(report.sceneDepthAvailable).toBe(true);
  expect(report.forwardTargetPublished).toBe(true);
  expect(report.depthCopyPublished).toBe(true);
  expect(report.centerDepth).not.toBeNull();
  expect(report.cornerDepth).not.toBeNull();
  // 128 is the probe's clear sentinel: the depth sample never landed.
  expect(report.cornerDepth).not.toBe(128);
  // Far plane clears to 1.0; the box in front of the camera is nearer.
  expect(report.cornerDepth!).toBeGreaterThanOrEqual(254);
  expect(report.centerDepth!).toBeLessThan(report.cornerDepth! - 2);
  expect(nonFavicon(pageErrors)).toEqual([]);
});

test("flags off: the after-opaque contributor is never called (a3d-qr=none)", async ({ page }) => {
  const pageErrors: string[] = [];
  const report = await openTool<FrameGraphReport>(page, "tools=frame-graph&a3d-qr=none", pageErrors);
  test.info().annotations.push({ type: "metric", description: JSON.stringify(report) });
  expect(report.errors).toEqual([]);
  expect(report.drawCalls).toBeGreaterThan(0);
  expect(report.afterOpaqueCalls).toBe(0);
  expect(nonFavicon(pageErrors)).toEqual([]);
});
