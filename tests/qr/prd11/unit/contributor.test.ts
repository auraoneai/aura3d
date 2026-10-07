import { describe, expect, it } from "vitest";

import "../../../../packages/rendering/src/lanes/index"; // lane barrels self-register on import
import { frameContributors, type FrameContributorContext } from "../../../../packages/rendering/src/contracts/frameGraph";
import { frameStatsSlot } from "../../../../packages/rendering/src/contracts/device";
import type { QrFlags } from "../../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../../packages/rendering/src/RenderDevice";
import { prd11TelemetryForDevice } from "../../../../packages/rendering/src/lanes/prd11";

const FLAGS_ON: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };
const FLAGS_OFF: QrFlags = { values: {}, on: () => false };

function ctx(device: MockRenderDevice, flags: QrFlags): FrameContributorContext {
  return {
    device,
    width: 640,
    height: 360,
    frameIndex: 0,
    timeSeconds: 0,
    camera: null,
    source: {},
    items: [],
    tier: {} as never,
    flags,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard: new Map()
  };
}

describe("prd11.frameStats contributor (C-01)", () => {
  it("performs exactly one begin/end pair per render cycle", () => {
    const device = new MockRenderDevice();
    const contributor = frameContributors(FLAGS_ON).find((c) => c.id === "prd11.frameStats");
    expect(contributor).toBeDefined();
    const context = ctx(device, FLAGS_ON);

    for (let frame = 0; frame < 3; frame += 1) {
      contributor!.collect!([], context);
      const passes = contributor!.passes!("after-output", context);
      for (const pass of passes) {
        pass.execute({ device, width: 640, height: 360 });
      }
    }

    const telemetry = prd11TelemetryForDevice(device);
    expect(telemetry.stats.samples).toBe(3);
    expect(telemetry.lastSample?.cpuFrameMs).toBeTypeOf("number");
    expect(telemetry.counters?.liveBuffers).toBeTypeOf("number");
  });

  it("registers zero active contributors with the flag off", () => {
    expect(frameContributors(FLAGS_OFF).find((c) => c.id === "prd11.frameStats")).toBeUndefined();
    // frameStatsSlot.get returns the stub while the flag is off.
    const stubStats = frameStatsSlot.get(FLAGS_OFF)(8);
    stubStats.begin(0);
    const sample = stubStats.end();
    expect(sample.gpuMs).toBeNull();
    expect(stubStats.fps()).toBeNull();
  });

  it("slot.provide switched in the real impl behind the flag", () => {
    const stats = frameStatsSlot.get(FLAGS_ON)(240);
    // The real impl adds legacyFps(); the PR 0a stub in contracts/device.ts does not.
    expect("legacyFps" in stats).toBe(true);
    for (let i = 0; i < 31; i += 1) {
      stats.begin(i * 50);
      stats.end();
    }
    expect(stats.fps()).toBe(20);
  });
});
