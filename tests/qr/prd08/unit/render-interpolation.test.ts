/**
 * L-4 FixedStepDriver + L-7 InterpolationStore (PRD-08 §6.4/§6.5).
 */
import { describe, expect, it } from "vitest";
import { resolveQrFlags } from "@aura3d/engine/contracts";
import {
  createFixedStepDriver,
  createInterpolationStore,
  type AuraInterpolableHandle
} from "@aura3d/engine/lanes";
import type { AuraVec3 } from "@aura3d/engine";

const interpFlags = resolveQrFlags({ options: ["camera.loop", "camera.interpolation"] });

function fakeApp() {
  const calls = { advance: [] as number[], step: [] as number[] };
  return {
    calls,
    advance(dt: number) {
      calls.advance.push(dt);
    },
    step(dt: number) {
      calls.step.push(dt);
    }
  };
}

describe("L-4 one render per tick", () => {
  it("calls app.step exactly once per tick, including 0-substep ticks", () => {
    const app = fakeApp();
    const driver = createFixedStepDriver(app, { useRaf: false, flags: interpFlags });
    driver.step(0);
    driver.step(1 / 60);
    driver.step(2 / 60);
    expect(app.calls.step).toHaveLength(3);
    expect(app.calls.advance.length).toBe(3);
    expect(driver.renderSubmissionsLastTick).toBe(1);
    driver.dispose();
  });

  it("renderPerSubstep reproduces one step per substep", () => {
    const app = fakeApp();
    const driver = createFixedStepDriver(app, {
      useRaf: false,
      flags: interpFlags,
      renderPerSubstep: true
    });
    driver.step(2 / 60);
    expect(app.calls.step).toHaveLength(2);
    expect(driver.renderSubmissionsLastTick).toBe(2);
    driver.dispose();
  });

  it("onRender emits alpha/realDt/simTime once per tick", () => {
    const app = fakeApp();
    const driver = createFixedStepDriver(app, { useRaf: false, flags: interpFlags });
    const frames: { alpha: number; realDt: number; simTime: number }[] = [];
    driver.onRender((f) => frames.push(f));
    driver.step(0.05);
    expect(frames).toHaveLength(1);
    expect(frames[0].realDt).toBeCloseTo(0.05, 6);
    expect(frames[0].alpha).toBeGreaterThanOrEqual(0);
    driver.dispose();
  });
});

function fakeInterpolable(id: string): AuraInterpolableHandle & {
  position: AuraVec3;
  rotation: AuraVec3;
  scale: AuraVec3;
} {
  return { id, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };
}

describe("L-7 InterpolationStore", () => {
  it("resolves the midpoint between prev and curr at alpha 0.5", () => {
    const store = createInterpolationStore();
    const handle = fakeInterpolable("n1");
    store.registerHandle(handle);
    store.capturePrevious();
    handle.position = [10, 0, 0];
    store.captureCurrent();
    const resolved = store.resolve(0.5).get("n1");
    expect(resolved?.position[0]).toBeCloseTo(5, 6);
  });

  it("teleport snaps the next resolve to the current state", () => {
    const store = createInterpolationStore();
    const handle = fakeInterpolable("n1");
    store.registerHandle(handle);
    store.capturePrevious();
    handle.position = [10, 0, 0];
    store.captureCurrent();
    store.teleport("n1");
    const resolved = store.resolve(0.5).get("n1");
    expect(resolved?.position[0]).toBeCloseTo(10, 6);
  });

  it("node timeScale 0 keeps the resolved pose at prev (scoped freeze)", () => {
    const store = createInterpolationStore();
    const handle = fakeInterpolable("n1");
    store.registerHandle(handle);
    store.capturePrevious();
    handle.position = [10, 0, 0];
    store.captureCurrent();
    store.setTimeScale("n1", 0);
    const resolved = store.resolve(0.9).get("n1");
    expect(resolved?.position[0]).toBeCloseTo(0, 6);
  });

  it("rotations blend through quaternions (slerp midpoint yaw)", () => {
    const store = createInterpolationStore();
    const handle = fakeInterpolable("n1");
    store.registerHandle(handle);
    store.capturePrevious();
    handle.rotation = [0, Math.PI / 2, 0];
    store.captureCurrent();
    const resolved = store.resolve(0.5).get("n1");
    expect(resolved?.rotation[1]).toBeCloseTo(Math.PI / 4, 4);
  });
});
