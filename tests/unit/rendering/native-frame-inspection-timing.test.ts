import { describe, expect, it } from "vitest";

import {
  FrameInspectionTiming,
  attachFrameInspectionCancel,
  bindFrameInspectionView,
  closeFrameInspectionView,
  commitFrameInspectionView,
  type InspectionGpuSamplePoller
} from "../../../packages/rendering/src/quality/FrameInspectionTiming";

class Poller implements InspectionGpuSamplePoller {
  calls = 0;
  readonly callbacks: (() => void)[] = [];
  pollGpuResults(): void {
    this.calls += 1;
    for (const callback of this.callbacks.splice(0)) callback();
  }
}

describe("per-view frame-inspection GPU timing", () => {
  it("keeps delayed samples tied to their exact render and view even when frame numbers repeat", () => {
    const timing = new FrameInspectionTiming();
    const poller = new Poller();
    const previous = timing.begin(8);
    const next = timing.begin(8);
    const previousView = timing.beginView(previous, "main")!;
    const nextView = timing.beginView(next, "main")!;
    const earlier = { gpuMs: null as number | null };
    const later = { gpuMs: null as number | null };
    expect(timing.finishView(previousView, earlier, poller)).toBe(true);
    expect(timing.finishView(nextView, later, poller)).toBe(true);
    timing.end(previous);
    timing.end(next);
    poller.callbacks.push(() => { earlier.gpuMs = 2.25; });
    expect(timing.snapshot(next)).toMatchObject({ frameNumber: 8, views: [{ viewId: "main", gpuTimeMs: null }] });
    expect(timing.snapshot(previous)).toMatchObject({ frameNumber: 8, views: [{ viewId: "main", gpuTimeMs: 2.25 }] });
    later.gpuMs = 4.5;
    expect(timing.snapshot(next)?.views).toEqual([{ viewId: "main", gpuTimeMs: 4.5 }]);
  });

  it("reports measured view intervals and explicitly leaves whole-frame time unavailable", () => {
    const timing = new FrameInspectionTiming();
    const capture = timing.begin(1);
    const left = timing.beginView(capture, "left")!;
    const right = timing.beginView(capture, "right")!;
    const missing = timing.beginView(capture, "failed")!;
    const poller = new Poller();
    expect(timing.finishView(left, { gpuMs: 1.1 }, poller)).toBe(true);
    expect(timing.finishView(right, { gpuMs: null }, poller)).toBe(true);
    timing.end(capture);
    expect(timing.finishView(missing, { gpuMs: 9 }, poller)).toBe(false);
    expect(timing.snapshot(capture)).toEqual({
      frameNumber: 1,
      coverage: "view-collect-through-after-output",
      wholeFrameGpuTimeMs: null,
      closed: true,
      truncated: false,
      views: [
        { viewId: "left", gpuTimeMs: 1.1 },
        { viewId: "right", gpuTimeMs: null },
        { viewId: "failed", gpuTimeMs: null }
      ]
    });
    expect(poller.calls).toBe(1);
  });

  it("does not confuse a foreign, repeated, closed, or reused sample with another view", () => {
    const first = new FrameInspectionTiming();
    const second = new FrameInspectionTiming();
    const firstCapture = first.begin(3);
    const secondCapture = first.begin(3);
    const firstView = first.beginView(firstCapture, 0)!;
    const secondView = first.beginView(secondCapture, 0)!;
    const foreignCapture = second.begin(3);
    expect(first.beginView(foreignCapture, 0)).toBeNull();
    expect(first.beginView(firstCapture, 0)).toBeNull();
    expect(first.beginView(firstCapture, "")).toBeNull();
    expect(first.beginView(firstCapture, Number.NaN)).toBeNull();
    const sample = { gpuMs: 3 };
    const poller = new Poller();
    expect(first.finishView(firstView, sample, poller)).toBe(true);
    expect(first.finishView(firstView, { gpuMs: 6 }, poller)).toBe(false);
    expect(first.finishView(secondView, sample, poller)).toBe(false);
    expect(second.finishView(secondView, { gpuMs: 1 }, poller)).toBe(false);
    first.end(secondCapture);
    expect(first.beginView(secondCapture, 1)).toBeNull();
    expect(first.finishView(secondView, { gpuMs: 4 }, poller)).toBe(false);
    expect(first.snapshot(secondCapture)?.views).toEqual([{ viewId: 0, gpuTimeMs: null }]);
  });

  it("keeps missing, invalid, and throwing GPU values null", () => {
    const timing = new FrameInspectionTiming();
    const capture = timing.begin(2);
    const views = ["negative", "nan", "infinite", "throws", "no-poller"].map((id) => timing.beginView(capture, id)!);
    const brokenPoller = { pollGpuResults(): void { throw new Error("device lost"); } };
    const throwingSample = { get gpuMs(): number | null { throw new Error("invalid sample"); } };
    expect(timing.finishView(views[0]!, { gpuMs: -1 }, brokenPoller)).toBe(true);
    expect(timing.finishView(views[1]!, { gpuMs: Number.NaN }, brokenPoller)).toBe(true);
    expect(timing.finishView(views[2]!, { gpuMs: Number.POSITIVE_INFINITY }, brokenPoller)).toBe(true);
    expect(timing.finishView(views[3]!, throwingSample, brokenPoller)).toBe(true);
    expect(timing.finishView(views[4]!, { gpuMs: 5 }, {} as InspectionGpuSamplePoller)).toBe(false);
    timing.end(capture);
    expect(() => timing.snapshot(capture)).not.toThrow();
    expect(timing.snapshot(capture)?.views.map((view) => view.gpuTimeMs)).toEqual([null, null, null, null, null]);
  });

  it("bounds retained captures and reports when view records are truncated", () => {
    const timing = new FrameInspectionTiming(2, 1);
    const first = timing.begin(1);
    const firstView = timing.beginView(first, "one")!;
    expect(timing.beginView(first, "two")).toBeNull();
    expect(timing.snapshot(first)).toMatchObject({ truncated: true, views: [{ viewId: "one", gpuTimeMs: null }] });
    const second = timing.begin(2);
    timing.begin(3);
    expect(timing.snapshot(first)).toBeNull();
    expect(timing.finishView(firstView, { gpuMs: 1 }, new Poller())).toBe(false);
    expect(timing.snapshot(second)).toMatchObject({ frameNumber: 2 });
    timing.dispose();
    expect(timing.snapshot(second)).toBeNull();
    expect(() => timing.begin(4)).toThrow(/disposed/);
  });

  it("returns independent snapshots without changing stored samples", () => {
    const timing = new FrameInspectionTiming();
    const capture = timing.begin(4);
    const view = timing.beginView(capture, "main")!;
    const sample = { gpuMs: 1 };
    timing.finishView(view, sample, new Poller());
    timing.end(capture);
    const first = timing.snapshot(capture)!;
    (first.views as { viewId: string; gpuTimeMs: number }[])[0]!.gpuTimeMs = 10;
    expect(timing.snapshot(capture)?.views[0]?.gpuTimeMs).toBe(1);
    expect(sample.gpuMs).toBe(1);
  });

  it("polls a shared query owner once when reading many captures", () => {
    const timing = new FrameInspectionTiming();
    const poller = new Poller();
    const first = timing.begin(1), second = timing.begin(2);
    timing.finishView(timing.beginView(first, "a")!, { gpuMs: 1 }, poller);
    timing.finishView(timing.beginView(second, "b")!, { gpuMs: 2 }, poller);
    timing.end(first); timing.end(second);
    const snapshots = timing.snapshots([first, second]);
    expect(poller.calls).toBe(1);
    expect(snapshots.map((snapshot) => snapshot?.views[0]?.gpuTimeMs)).toEqual([1, 2]);
  });

  it("binds each view to its own blackboard and cancels only the unfinished view", () => {
    const timing = new FrameInspectionTiming();
    const capture = timing.begin(1);
    const left = new Map(), right = new Map();
    const cancelled: string[] = [];
    expect(bindFrameInspectionView(left, timing, capture, "left")).toBe(true);
    expect(bindFrameInspectionView(right, timing, capture, "right")).toBe(true);
    const leftBinding = attachFrameInspectionCancel(left, () => cancelled.push("left"));
    const rightBinding = attachFrameInspectionCancel(right, () => cancelled.push("right"));
    expect(attachFrameInspectionCancel(left, () => cancelled.push("wrong"))).toBeUndefined();
    expect(commitFrameInspectionView(left, { gpuMs: 2 }, new Poller(), rightBinding)).toBe(false);
    expect(commitFrameInspectionView(left, { gpuMs: 2 }, new Poller(), leftBinding)).toBe(true);
    closeFrameInspectionView(left);
    closeFrameInspectionView(right);
    closeFrameInspectionView(right);
    timing.end(capture);
    expect(cancelled).toEqual(["right"]);
    expect(timing.snapshot(capture)?.views).toEqual([
      { viewId: "left", gpuTimeMs: 2 }, { viewId: "right", gpuTimeMs: null }
    ]);
  });

  it("replacing a blackboard binding cancels the old query before accepting the new one", () => {
    const timing = new FrameInspectionTiming();
    const first = timing.begin(1), second = timing.begin(2);
    const blackboard = new Map();
    let cancelled = 0;
    bindFrameInspectionView(blackboard, timing, first, "view");
    const oldBinding = attachFrameInspectionCancel(blackboard, () => { cancelled += 1; closeFrameInspectionView(blackboard); });
    expect(bindFrameInspectionView(blackboard, timing, second, "view")).toBe(true);
    expect(cancelled).toBe(1);
    const newBinding = attachFrameInspectionCancel(blackboard, () => {});
    expect(commitFrameInspectionView(blackboard, { gpuMs: 9 }, new Poller(), oldBinding)).toBe(false);
    expect(commitFrameInspectionView(blackboard, { gpuMs: 4 }, new Poller(), newBinding)).toBe(true);
    timing.end(first); timing.end(second);
    expect(timing.snapshot(first)?.views).toEqual([{ viewId: "view", gpuTimeMs: null }]);
    expect(timing.snapshot(second)?.views).toEqual([{ viewId: "view", gpuTimeMs: 4 }]);
  });
});
