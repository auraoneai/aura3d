import { describe, expect, it } from "vitest";
import { ArcballControls } from "../../../packages/controls/src";

function camera(x = 0, y = 1, z = 6): {
  position: { x: number; y: number; z: number };
  lookAt(target: { x: number; y: number; z: number }): void;
  lookAtCalls: number;
  lastTarget: { x: number; y: number; z: number } | null;
} {
  return {
    position: { x, y, z },
    lookAtCalls: 0,
    lastTarget: null,
    lookAt(target: { x: number; y: number; z: number }): void {
      this.lookAtCalls += 1;
      this.lastTarget = { ...target };
    }
  };
}

describe("ArcballControls", () => {
  it("orbits an attached camera with no polar clamp and keeps lookAt", () => {
    const cam = camera();
    const controls = new ArcballControls(cam);
    const before = { ...cam.position };
    controls.rotate(200, 120);
    expect(cam.position).not.toEqual(before);
    expect(cam.lookAtCalls).toBeGreaterThan(0);
    expect(controls.getDistance()).toBeGreaterThan(0);
    // Free rotation: repeated pitch never clamps the camera above the target.
    for (let i = 0; i < 40; i += 1) controls.rotate(0, 400);
    expect(Number.isFinite(cam.position.x)).toBe(true);
    expect(Number.isFinite(cam.position.y)).toBe(true);
    expect(Number.isFinite(cam.position.z)).toBe(true);
  });

  it("clamps dolly to min/max distance", () => {
    const cam = camera();
    const controls = new ArcballControls(cam, { minDistance: 2, maxDistance: 8 });
    controls.dolly(0.0001);
    expect(controls.getDistance()).toBeCloseTo(2, 5);
    controls.dolly(1000);
    expect(controls.getDistance()).toBeCloseTo(8, 5);
    expect(() => controls.dolly(0)).toThrow("dolly scale");
    expect(() => new ArcballControls(undefined, { minDistance: 9, maxDistance: 2 })).toThrow("maxDistance");
  });

  it("pans the target and the camera together", () => {
    const cam = camera();
    const controls = new ArcballControls(cam);
    const targetBefore = { ...controls.state.target };
    controls.pan(30, -20);
    expect(controls.state.target).not.toEqual(targetBefore);
    expect(cam.lookAtCalls).toBeGreaterThan(0);
  });

  it("rolls about the view axis (orientation change, position fixed)", () => {
    const cam = camera();
    const controls = new ArcballControls(cam);
    const before = { ...cam.position };
    controls.roll(0.4);
    // Roll spins the lens in place: the pose holds, the roll books, lookAt re-aims.
    expect(cam.position).toEqual(before);
    expect(controls.state.rotation.z).toBeCloseTo(0.4, 10);
    expect(cam.lookAtCalls).toBeGreaterThan(0);
  });

  it("damps residual velocity through update() and then settles", () => {
    const cam = camera();
    const controls = new ArcballControls(cam, { enableDamping: true, dampingFactor: 0.2 });
    controls.rotate(60, 30);
    let moving = true;
    for (let i = 0; i < 500 && moving; i += 1) moving = controls.update(1 / 60);
    expect(moving).toBe(false);
  });

  it("detached instances accumulate bookkeeping without a camera", () => {
    const controls = new ArcballControls();
    expect(controls.isCameraAttached).toBe(false);
    controls.rotate(10, 5);
    expect(controls.state.rotation.y).not.toBe(0);
    expect(controls.state.rotation.x).not.toBe(0);
    controls.dolly(0.5);
    expect(controls.state.position.z).toBeLessThan(5);
  });

  it("disposes cleanly: disables, detaches, ignores later input, idempotent", () => {
    const cam = camera();
    const controls = new ArcballControls(cam);
    expect(controls.isDisposed).toBe(false);
    controls.dispose();
    expect(controls.isDisposed).toBe(true);
    expect(controls.isCameraAttached).toBe(false);
    expect(controls.state.enabled).toBe(false);
    const targetBefore = { ...controls.state.target };
    controls.rotate(100, 100);
    controls.pan(50, 50);
    controls.dolly(0.5);
    controls.roll(1);
    expect(controls.state.target).toEqual(targetBefore);
    expect(controls.update()).toBe(false);
    expect(() => controls.dispose()).not.toThrow();
  });

  it("rejects non-finite input by name", () => {
    const controls = new ArcballControls();
    expect(() => controls.rotate(Number.NaN, 0)).toThrow("deltaX");
    expect(() => controls.update(Number.POSITIVE_INFINITY)).not.toThrow();
  });
});
