import { describe, expect, it } from "vitest";
import { sampleGestureHapticsFixture } from "../../../packages/input/src";

describe("gesture haptics fixtures", () => {
  it("samples deterministic old-branch swipe, rotate, and rumble pattern telemetry", () => {
    const fixture = sampleGestureHapticsFixture({
      seed: 0x9e57,
      pointerDeltaX: 84,
      pointerDeltaY: 18,
      pinchStartDistance: 42,
      pinchEndDistance: 76,
      rotateDegrees: 28,
      gamepadConnected: true
    });

    expect(fixture).toMatchObject({
      source: "origin-master-input-gesture-rumble-adapted",
      productionReadiness: {
        gestureTelemetry: true,
        swipeRotateTelemetry: true,
        hapticPatternTelemetry: true,
        hapticClaimBoundaryTelemetry: true
      }
    });
    expect(fixture.gestures.map((gesture) => gesture.type)).toEqual(["tap", "pan", "pinch", "swipe", "rotate"]);
    expect(fixture.gestureSummary.tapDetected).toBe(true);
    expect(fixture.gestureSummary.panDistance).toBeGreaterThan(0);
    expect(fixture.gestureSummary.pinchScale).toBeGreaterThan(1);
    expect(fixture.gestureSummary.swipeDirection).toBe("right");
    expect(fixture.gestureSummary.rotateDegrees).toBe(28);
    expect(fixture.haptics.gamepadConnected).toBe(true);
    expect(fixture.haptics.hapticsClaimed).toBe(false);
    expect(fixture.haptics.patterns.map((pattern) => pattern.name)).toEqual(["tap", "impact", "damage", "success", "engine"]);
    expect(fixture.haptics.patterns.some((pattern) => pattern.loop)).toBe(true);
    expect(fixture.haptics.totalDurationMs).toBeGreaterThan(0);
    expect(fixture.haptics.intensityMultiplier).toBeGreaterThan(0);
    expect(fixture.blockedClaims).toEqual(expect.arrayContaining([
      "gamepad haptic actuator delivery guarantee",
      "Unity Input System haptics parity",
      "Unreal Enhanced Input haptics parity"
    ]));
    expect(fixture.claimBoundary).toContain("does not vibrate hardware");
    expect(fixture.hash).toMatch(/^[0-9a-f]{8}$/);
    expect(sampleGestureHapticsFixture({
      seed: 0x9e57,
      pointerDeltaX: 84,
      pointerDeltaY: 18,
      pinchStartDistance: 42,
      pinchEndDistance: 76,
      rotateDegrees: 28,
      gamepadConnected: true
    }).hash).toBe(fixture.hash);
  });

  it("detects vertical swipe direction deterministically", () => {
    const fixture = sampleGestureHapticsFixture({ pointerDeltaX: 4, pointerDeltaY: -64 });
    expect(fixture.gestureSummary.swipeDirection).toBe("up");
  });

  it("rejects invalid gesture haptics inputs", () => {
    expect(() => sampleGestureHapticsFixture({ seed: -1 })).toThrow(/seed/);
    expect(() => sampleGestureHapticsFixture({ pointerDeltaX: Number.NaN })).toThrow(/pointerDeltaX/);
    expect(() => sampleGestureHapticsFixture({ pinchStartDistance: 0 })).toThrow(/pinchStartDistance/);
    expect(() => sampleGestureHapticsFixture({ pinchEndDistance: 0 })).toThrow(/pinchEndDistance/);
  });
});
