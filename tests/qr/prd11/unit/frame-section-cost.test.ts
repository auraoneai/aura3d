import { describe, expect, it, vi } from "vitest";

import "../../../../packages/rendering/src/lanes/index"; // lane barrels self-register on import
import "../../../../packages/engine/src/lanes/prd11";
import { diagnosticsSectionsAll } from "../../../../packages/engine/src/contracts/diagnostics";
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";

/**
 * Track 0 ready time: the `frame` diagnostics section walks
 * device.getDiagnostics() at most once per rendered frame, however often the
 * app polls app.diagnostics() (capture harnesses poll every few ms).
 */

const FLAGS_ON: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };

function ctx(device: MockRenderDevice): FrameContributorContext {
  return {
    device, width: 64, height: 64, frameIndex: 0, timeSeconds: 0, camera: null, source: {}, items: [],
    tier: {} as never, flags: FLAGS_ON,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  };
}

describe("prd11.frame diagnostics section cost", () => {
  it("one getDiagnostics walk per rendered frame, not per diagnostics() call", () => {
    const device = new MockRenderDevice();
    const contributor = frameContributors(FLAGS_ON).find((c) => c.id === "prd11.frameStats")!;
    const section = diagnosticsSectionsAll().find((s) => s.id === "prd11.frame")!;
    expect(section).toBeDefined();
    const renderFrame = (): void => {
      contributor.collect!([], ctx(device));
      for (const pass of contributor.passes!("after-output", ctx(device))) pass.execute({ device, width: 64, height: 64 });
    };
    renderFrame();
    const walk = vi.spyOn(device, "getDiagnostics");
    for (let poll = 0; poll < 50; poll += 1) section.collect({} as never);
    expect(walk).toHaveBeenCalledTimes(1);
    renderFrame();
    walk.mockClear(); // the mock device's own counters() also walks; count only the section's polls
    for (let poll = 0; poll < 50; poll += 1) section.collect({} as never);
    expect(walk).toHaveBeenCalledTimes(1);
  });
});
