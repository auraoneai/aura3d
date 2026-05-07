import { describe, expect, it } from "vitest";
import { DirectionalLight, Scene } from "@galileo3d/scene";
import { CascadedShadowMaps, LightCollector, LightingDebug } from "../../../packages/rendering/src";

describe("lighting debug and cascaded shadows", () => {
  it("computes deterministic cascades and validates invalid split inputs", () => {
    const splits = CascadedShadowMaps.computeSplits({ cascadeCount: 4, near: 0.25, far: 64, lambda: 0.55 });

    expect(splits).toHaveLength(4);
    expect(splits[0]).toEqual({ index: 0, near: 0.25, far: expect.closeTo(7.8344, 4) });
    expect(splits[3]?.far).toBe(64);
    for (let index = 1; index < splits.length; index += 1) {
      expect(splits[index]?.near).toBeCloseTo(splits[index - 1]!.far, 6);
      expect(splits[index]!.far).toBeGreaterThan(splits[index]!.near);
    }

    expect(() => CascadedShadowMaps.computeSplits({ cascadeCount: 0, near: 0.1, far: 10 })).toThrow(/count/);
    expect(() => CascadedShadowMaps.computeSplits({ cascadeCount: 3, near: 1, far: 1 })).toThrow(/near\/far/);
    expect(() => CascadedShadowMaps.computeSplits({ cascadeCount: 3, near: 0.1, far: 10, lambda: 2 })).toThrow(/lambda/);
  });

  it("generates light and cascade debug lines without mutating collected light data", () => {
    const light = new DirectionalLight("debug-sun");
    light.intensity = 2.5;
    light.color = [1, 0.8, 0.5];
    light.castsShadow = true;
    const scene = new Scene();
    scene.root.addChild(light);
    const collected = new LightCollector().collect(scene);
    const debug = new LightingDebug();
    const lightLines = debug.buildLightLines(collected, 3);
    const cascades = CascadedShadowMaps.computeSplits({ cascadeCount: 2, near: 0.5, far: 8, lambda: 0.5 });
    const cascadeLines = debug.buildCascadeLines(cascades, 4);

    expect(lightLines).toHaveLength(1);
    expect(lightLines[0]?.from).toEqual([0, 0, 0]);
    expect(lightLines[0]?.to[2]).toBeLessThan(0);
    expect(lightLines[0]?.color).toEqual([1, 0.8, 0.5, 1]);
    expect(debug.buildShadowMapLabel(collected[0]!)).toBe("directional:shadow:2.500");

    expect(cascadeLines).toHaveLength(24);
    expect(cascadeLines[0]?.from).toEqual([-2, -2, -0.5]);
    expect(cascadeLines[0]?.to).toEqual([2, -2, -0.5]);
    expect(cascadeLines[11]?.to[2]).toBeLessThan(cascadeLines[0]!.to[2]);
    expect(() => debug.buildLightLines(collected, 0)).toThrow(/length/);
    expect(() => debug.buildCascadeLines(cascades, 0)).toThrow(/width/);
  });
});
