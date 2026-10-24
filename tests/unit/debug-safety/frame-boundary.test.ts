import { describe, expect, it, vi } from "vitest";
import { createFrameErrorBoundary } from "../../../packages/debug/src/safety/frameBoundary";

describe("createFrameErrorBoundary", () => {
  it("returns the step result and keeps the failure count at zero", () => {
    const boundary = createFrameErrorBoundary();
    expect(boundary.run(() => 7)).toBe(7);
    expect(boundary.stats()).toEqual({ total: 0, consecutive: 0, fatal: false, lastMessage: null });
  });

  it("swallows a throw, reports it once per message and lets the next frame run", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const boundary = createFrameErrorBoundary();
    expect(boundary.run(() => { throw new Error("boom"); })).toBeUndefined();
    boundary.run(() => { throw new Error("boom"); });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(String(spy.mock.calls[0]![0])).toContain("FRAME_ERROR: boom");
    expect(boundary.run(() => "ok")).toBe("ok");
    expect(boundary.stats()).toMatchObject({ total: 2, consecutive: 0, fatal: false, lastMessage: "boom" });
    spy.mockRestore();
  });

  it("escalates to onFatal exactly once after maxConsecutive failures in a row", () => {
    const onFatal = vi.fn();
    const boundary = createFrameErrorBoundary({ maxConsecutive: 3, onError: () => {}, onFatal });
    for (let i = 0; i < 2; i += 1) boundary.run(() => { throw new Error("x"); });
    boundary.run(() => 1);
    for (let i = 0; i < 2; i += 1) boundary.run(() => { throw new Error("x"); });
    expect(onFatal).not.toHaveBeenCalled();
    for (let i = 0; i < 4; i += 1) boundary.run(() => { throw new Error("x"); });
    expect(onFatal).toHaveBeenCalledTimes(1);
    expect(onFatal.mock.calls[0]![1]).toMatchObject({ consecutive: 3 });
    expect(boundary.stats().fatal).toBe(true);
  });

  it("passes non-Error throws through as a message", () => {
    const seen: string[] = [];
    const boundary = createFrameErrorBoundary({ onError: (_e, info) => seen.push(String(info.firstOfKind)) });
    boundary.run(() => { throw "plain"; });
    expect(boundary.stats().lastMessage).toBe("plain");
    expect(seen).toEqual(["true"]);
  });
});
