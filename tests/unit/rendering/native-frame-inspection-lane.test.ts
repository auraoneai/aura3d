import { describe, expect, it } from "vitest";

import "../../../packages/rendering/src/lanes/prd11";
import { frameContributors, type FrameContributor, type FrameContributorContext } from "../../../packages/rendering/src/contracts/frameGraph";
import type { QrFlags } from "../../../packages/rendering/src/contracts/core";
import { MockRenderDevice } from "../../../packages/rendering/src/RenderDevice";
import { FrameStats } from "../../../packages/rendering/src/quality/FrameStats";
import { prd11TelemetryForDevice } from "../../../packages/rendering/src/lanes/prd11";
import {
  bindFrameInspectionView,
  closeFrameInspectionView,
  FrameInspectionTiming
} from "../../../packages/rendering/src/quality/FrameInspectionTiming";
import type {
  RendererGpuScopedResult,
  RendererGpuScopedTimingBackend,
  RendererGpuTimingToken
} from "../../../packages/rendering/src/RendererTiming";

const FLAGS: QrFlags = { values: { A3D_QR_TIERS: true }, on: (name) => name === "A3D_QR_TIERS" };

class QueryBackend implements RendererGpuScopedTimingBackend {
  readonly supported = true;
  readonly tokens: RendererGpuTimingToken[] = [];
  readonly ended: RendererGpuTimingToken[] = [];
  readonly ready: RendererGpuScopedResult[] = [];
  onEnd?: (token: RendererGpuTimingToken) => void;
  begin(label: string): RendererGpuTimingToken { return this.beginScope(label); }
  end(token: RendererGpuTimingToken): undefined { this.endScope(token); return undefined; }
  beginScope(label: string): RendererGpuTimingToken {
    const token = { label };
    this.tokens.push(token);
    return token;
  }
  endScope(token: RendererGpuTimingToken): void {
    this.ended.push(token);
    this.onEnd?.(token);
  }
  poll(): readonly RendererGpuScopedResult[] { return this.ready.splice(0); }
  pollWithoutAging(): readonly RendererGpuScopedResult[] { return this.poll(); }
  settle(index: number, durationMs: number | null): void {
    const token = this.tokens[index]!;
    this.ready.push({ token, label: token.label, durationMs });
  }
}

function context(device: MockRenderDevice, blackboard: Map<string, unknown>, owner: object, viewId: string): FrameContributorContext {
  return {
    device, width: 64, height: 64, frameIndex: 1, timeSeconds: 0, camera: null,
    source: {}, items: [], tier: {} as never, flags: FLAGS, postScopeId: owner, viewId,
    sceneDepth: { texture: null, linearize: { near: 0.1, far: 100, orthographic: false }, available: false },
    blackboard
  };
}

function setup(): { device: MockRenderDevice; backend: QueryBackend; stats: FrameStats; contributor: FrameContributor } {
  const device = new MockRenderDevice();
  const backend = new QueryBackend();
  const stats = new FrameStats(16, backend);
  const telemetry = prd11TelemetryForDevice(device);
  Object.assign(telemetry, { stats });
  const contributor = frameContributors(FLAGS).find((entry) => entry.id === "prd11.frameStats");
  if (!contributor) throw new Error("Frame statistics contributor is unavailable");
  return { device, backend, stats, contributor };
}

function collect(contributor: FrameContributor, ctx: FrameContributorContext) {
  contributor.collect!([], ctx);
  const passes = contributor.passes!("after-output", ctx);
  expect(passes).toHaveLength(1);
  return passes[0]!;
}

describe("per-view frame-statistics contributor ownership", () => {
  it("preserves sequential no-inspection contributor behavior with one blackboard per frame", () => {
    const { device, stats, contributor } = setup();
    const owner = {};
    for (let i = 0; i < 2; i += 1) {
      const ctx = context(device, new Map(), owner, "main");
      collect(contributor, ctx).execute({ device, width: 64, height: 64 });
    }
    expect(stats.samples).toBe(2);
    expect(prd11TelemetryForDevice(device).lastSample).not.toBeNull();
  });

  it("does not let an older view end or acquire the newer view's sample on a shared device", () => {
    const { device, backend, stats, contributor } = setup();
    const timing = new FrameInspectionTiming();
    const first = timing.begin(1), second = timing.begin(1);
    const firstBoard = new Map<string, unknown>(), secondBoard = new Map<string, unknown>();
    expect(bindFrameInspectionView(firstBoard, timing, first, "main")).toBe(true);
    expect(bindFrameInspectionView(secondBoard, timing, second, "main")).toBe(true);
    const firstCtx = context(device, firstBoard, {}, "main");
    const secondCtx = context(device, secondBoard, {}, "main");
    const firstPass = collect(contributor, firstCtx);
    const secondPass = collect(contributor, secondCtx);
    firstPass.execute({ device, width: 64, height: 64 });
    expect(stats.samples).toBe(0);
    expect(prd11TelemetryForDevice(device).lastSample).toBeNull();
    secondPass.execute({ device, width: 64, height: 64 });
    closeFrameInspectionView(firstBoard);
    timing.end(first); timing.end(second);
    backend.settle(1, 3.5);
    expect(timing.snapshot(first)?.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);
    expect(timing.snapshot(second)?.views).toEqual([{ viewId: "main", gpuTimeMs: 3.5 }]);
    expect(stats.samples).toBe(1);
    expect(backend.tokens).toHaveLength(2);
  });

  it("keeps a stale pass from consuming a newer ticket on a reused blackboard", () => {
    const { device, backend, stats, contributor } = setup();
    const timing = new FrameInspectionTiming();
    const first = timing.begin(2), second = timing.begin(2);
    const board = new Map<string, unknown>();
    const ctx = context(device, board, {}, "main");
    bindFrameInspectionView(board, timing, first, "main");
    const stale = collect(contributor, ctx);
    bindFrameInspectionView(board, timing, second, "main");
    const current = collect(contributor, ctx);
    stale.execute({ device, width: 64, height: 64 });
    expect(stats.samples).toBe(0);
    current.execute({ device, width: 64, height: 64 });
    timing.end(first); timing.end(second);
    backend.settle(1, 4);
    expect(timing.snapshot(first)?.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);
    expect(timing.snapshot(second)?.views).toEqual([{ viewId: "main", gpuTimeMs: 4 }]);
    expect(stats.samples).toBe(1);
  });

  it("does not attach a later unbound collection to an older view binding", () => {
    const { device, backend, stats, contributor } = setup();
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(2);
    const board = new Map<string, unknown>();
    const ctx = context(device, board, {}, "main");
    bindFrameInspectionView(board, timing, frame, "main");
    const stale = collect(contributor, ctx);
    // This separate collection deliberately does not bind a new inspection.
    const current = collect(contributor, ctx);
    stale.execute({ device, width: 64, height: 64 });
    current.execute({ device, width: 64, height: 64 });
    closeFrameInspectionView(board);
    timing.end(frame);
    backend.settle(1, 6);
    stats.pollGpuResults();
    expect(timing.snapshot(frame)?.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);
    expect(stats.samples).toBe(1);
  });

  it("cancels only the tracked view on cleanup and ignores its later pass", () => {
    const { device, backend, stats, contributor } = setup();
    const timing = new FrameInspectionTiming();
    const frame = timing.begin(3);
    const board = new Map<string, unknown>();
    bindFrameInspectionView(board, timing, frame, "main");
    const ctx = context(device, board, {}, "main");
    const pass = collect(contributor, ctx);
    closeFrameInspectionView(board);
    closeFrameInspectionView(board);
    pass.execute({ device, width: 64, height: 64 });
    timing.end(frame);
    expect(backend.ended).toEqual([backend.tokens[0]]);
    expect(stats.samples).toBe(0);
    expect(timing.snapshot(frame)?.views).toEqual([{ viewId: "main", gpuTimeMs: null }]);
  });

  it("does not overwrite a newer completed sample when query ending reenters another view", () => {
    const { device, backend, stats, contributor } = setup();
    const timing = new FrameInspectionTiming();
    const first = timing.begin(4), second = timing.begin(5);
    const firstBoard = new Map<string, unknown>(), secondBoard = new Map<string, unknown>();
    bindFrameInspectionView(firstBoard, timing, first, "main");
    bindFrameInspectionView(secondBoard, timing, second, "main");
    const firstCtx = context(device, firstBoard, {}, "main");
    const secondCtx = context(device, secondBoard, {}, "main");
    const firstPass = collect(contributor, firstCtx);
    let newerSample: object | null = null;
    backend.onEnd = (token) => {
      if (token !== backend.tokens[0]) return;
      backend.onEnd = undefined;
      const newer = collect(contributor, secondCtx);
      newer.execute({ device, width: 64, height: 64 });
      newerSample = prd11TelemetryForDevice(device).lastSample;
    };
    firstPass.execute({ device, width: 64, height: 64 });
    expect(newerSample).not.toBeNull();
    expect(prd11TelemetryForDevice(device).lastSample).toBe(newerSample);
    expect(stats.samples).toBe(2);
    timing.end(first); timing.end(second);
    backend.settle(0, 2); backend.settle(1, 5);
    expect(timing.snapshot(first)?.views).toEqual([{ viewId: "main", gpuTimeMs: 2 }]);
    expect(timing.snapshot(second)?.views).toEqual([{ viewId: "main", gpuTimeMs: 5 }]);
  });
});
