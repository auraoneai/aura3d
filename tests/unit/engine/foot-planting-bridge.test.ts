import { describe, expect, it, vi } from "vitest";
import { createAnimationController } from "../../../packages/engine/src/agent-api/AnimationController";
import {
  footPlanting,
  resolveFootPlanting,
  type AuraFootPlantingGroundLike
} from "../../../packages/engine/src/agent-api/FootPlanting";
import type { AuraRuntimeNodeAnimationBindingMetadata } from "../../../packages/engine/src/agent-api/RuntimeNodeHandle";

/**
 * E2 box 2 (root half): `footPlanting` ground specs resolve to live raycasters, and the
 * animation-controller binding carries the resolved config (legs + raycaster, in-memory)
 * into the runtime-node binding metadata the per-frame actor path consumes.
 */
const LEGS = [
  { side: "left" as const, hip: "Hip_L", knee: "Knee_L", ankle: "Ankle_L" },
  { side: "right" as const, hip: "Hip_R", knee: "Knee_R", ankle: "Ankle_R" }
];

describe("resolveFootPlanting", () => {
  it("builds a working heightfield raycaster from a heightAt spec", () => {
    const resolved = resolveFootPlanting({
      legs: LEGS,
      ground: { heightAt: (x) => ({ height: x > 0 ? 0.3 : 0 }) }
    });
    expect(resolved.legs).toHaveLength(2);
    expect(resolved.ground.raycastDown([0.5, 2, 0], 5)?.point[1]).toBeCloseTo(0.3, 10);
    expect(resolved.ground.raycastDown([-0.5, 2, 0], 5)?.point[1]).toBeCloseTo(0, 10);
  });

  it("builds a platform raycaster that prefers the platform top", () => {
    const resolved = resolveFootPlanting({
      legs: LEGS,
      ground: {
        base: { heightAt: () => ({ height: 0 }) },
        platformHeightAt: (x, z) => (Math.abs(x) < 1 && Math.abs(z) < 1 ? 2 : undefined)
      }
    });
    expect(resolved.ground.raycastDown([0, 3, 0], 5)?.point[1]).toBeCloseTo(2, 10);
    expect(resolved.ground.raycastDown([5, 3, 5], 5)?.point[1]).toBeCloseTo(0, 10);
  });

  it("passes an already-built raycaster through untouched", () => {
    const raycaster: AuraFootPlantingGroundLike = {
      raycastDown: (origin) => ({ point: [origin[0], 1, origin[2]], normal: [0, 1, 0], distance: 1 })
    };
    const resolved = resolveFootPlanting({ legs: LEGS, ground: raycaster });
    expect(resolved.ground).toBe(raycaster);
  });

  it("rejects empty leg lists and garbage grounds", () => {
    expect(() => resolveFootPlanting({ legs: [], ground: { heightAt: () => ({ height: 0 }) } })).toThrow(
      /at least one leg/
    );
    expect(() =>
      resolveFootPlanting({
        legs: LEGS,
        ground: {} as unknown as import("../../../packages/engine/src/agent-api/FootPlanting").AuraFootPlantingGround
      })
    ).toThrow(/must be a heightfield spec/);
  });

  it("exposes the same builders on the footPlanting const", () => {
    const heightfield = footPlanting.heightfieldGround(() => ({ height: 1 }));
    expect(heightfield.raycastDown([0, 2, 0], 5)?.point[1]).toBeCloseTo(1, 10);
    const platform = footPlanting.movingPlatformGround({ heightAt: () => ({ height: 0 }) }, () => 0.5);
    expect(platform.raycastDown([0, 2, 0], 5)?.point[1]).toBeCloseTo(0.5, 10);
  });
});

describe("animation-controller foot-planting binding", () => {
  it("carries the resolved config into the node binding metadata", () => {
    const controller = createAnimationController({ id: "feet-test" });
    let received: AuraRuntimeNodeAnimationBindingMetadata | undefined;
    const node = {
      id: "walker",
      setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined) {
        received = binding;
        return this;
      }
    };

    controller.bindRuntimeNode(node as never, {
      footPlanting: { legs: LEGS, ground: { heightAt: () => ({ height: 0 }) } }
    });

    expect(received?.footPlanting?.legs.map((leg) => leg.ankle)).toEqual(["Ankle_L", "Ankle_R"]);
    expect(received?.footPlanting?.ground.raycastDown([0, 1, 0], 3)?.point[1]).toBeCloseTo(0, 10);
  });

  it("leaves binding metadata without foot planting when unconfigured", () => {
    const controller = createAnimationController({ id: "feet-absent-test" });
    let received: AuraRuntimeNodeAnimationBindingMetadata | undefined;
    const node = {
      id: "walker",
      setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined) {
        received = binding;
        return this;
      }
    };

    controller.bindRuntimeNode(node as never, {});

    expect(received?.footPlanting).toBeUndefined();
  });

  it("resolves once per bind (stable reference, so actor locks survive frames)", () => {
    const controller = createAnimationController({ id: "feet-stable-test" });
    const seen: (AuraRuntimeNodeAnimationBindingMetadata | undefined)[] = [];
    const node = {
      id: "walker",
      setAnimationBinding(binding: AuraRuntimeNodeAnimationBindingMetadata | undefined) {
        seen.push(binding);
        return this;
      }
    };

    const binding = controller.bindRuntimeNode(node as never, {
      footPlanting: { legs: LEGS, ground: { heightAt: () => ({ height: 0 }) } }
    });
    binding.update();
    binding.update();

    const configs = seen.map((metadata) => metadata?.footPlanting).filter(Boolean);
    expect(configs.length).toBeGreaterThanOrEqual(2);
    for (const config of configs) {
      expect(config).toBe(configs[0]);
    }
  });

  it("dispose clears the spy", () => {
    const controller = createAnimationController({ id: "feet-dispose-test" });
    const setAnimationBinding = vi.fn();
    const node = { id: "walker", setAnimationBinding } as never;

    const binding = controller.bindRuntimeNode(node, {
      footPlanting: { legs: LEGS, ground: { heightAt: () => ({ height: 0 }) } }
    });
    binding.dispose();

    expect(setAnimationBinding).toHaveBeenLastCalledWith(undefined);
  });
});
