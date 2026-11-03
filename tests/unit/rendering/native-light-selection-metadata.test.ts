import { describe, expect, it } from "vitest";
import { Scene } from "@aura3d/scene";
import { collectLight, type CollectedLight } from "../../../packages/rendering/src/LightCollector";
import { LightUniforms, MAX_DIRECT_LIGHTS, type LocalShadowedLight } from "../../../packages/rendering/src/LightUniforms";

function point(name: string, intensity: number): CollectedLight {
  const source = new Scene().createLight("point", name);
  return {
    ...collectLight(source),
    color: [1, 1, 1],
    intensity,
    position: [0, 0, 0],
    direction: [0, -1, 0],
    right: [1, 0, 0],
    up: [0, 1, 0],
    range: 5,
    spotAngle: 0,
    penumbra: 0,
    castsShadow: false,
    layerMask: 1
  };
}

function bytes(data: Float32Array): number[] {
  return Array.from(new Uint8Array(data.buffer, data.byteOffset, data.byteLength));
}

describe("direct-light selection metadata", () => {
  it("retains each input occurrence in input order and snapshots the arrays", () => {
    const first = point("first", 1);
    const brighter = point("brighter", 9);
    const replacement = point("replacement", 3);
    const input = [first, brighter, first];

    const result = LightUniforms.packWithSelection(input);

    expect(result.packed.lightCount).toBe(3);
    expect(result.packed.diagnostics.order).toBe("input");
    expect(result.selected.map((entry) => entry.inputIndex)).toEqual([0, 1, 2]);
    expect(result.selected[0]!.light).toBe(first);
    expect(result.selected[1]!.light).toBe(brighter);
    expect(result.selected[2]!.light).toBe(first);
    expect(result.inputLights[0]).toBe(first);
    expect(result.inputLights[1]).toBe(brighter);
    expect(result.inputLights[2]).toBe(first);
    expect(Object.isFrozen(result.selected)).toBe(true);
    expect(result.selected.every(Object.isFrozen)).toBe(true);
    expect(Object.isFrozen(result.inputLights)).toBe(true);
    expect(Object.isFrozen(first)).toBe(false);

    const originalBytes = bytes(result.packed.data);
    input.splice(0, input.length, replacement);
    expect(result.inputLights).toHaveLength(3);
    expect(result.inputLights[0]).toBe(first);
    expect(result.inputLights[1]).toBe(brighter);
    expect(result.inputLights[2]).toBe(first);
    expect(result.selected.map((entry) => entry.inputIndex)).toEqual([0, 1, 2]);
    expect(result.selected[0]!.light).toBe(first);
    expect(result.selected[1]!.light).toBe(brighter);
    expect(result.selected[2]!.light).toBe(first);
    expect(bytes(result.packed.data)).toEqual(originalBytes);
  });

  it("maps ranked slots to their original input indices after capacity clamping", () => {
    const input = Array.from({ length: MAX_DIRECT_LIGHTS + 2 }, (_unused, index) => point(`light-${index}`, index + 1));
    const requestedMax = MAX_DIRECT_LIGHTS + 4;
    const result = LightUniforms.packWithSelection(input, requestedMax);
    const original = LightUniforms.pack(input, requestedMax);
    const expectedIndices = Array.from({ length: MAX_DIRECT_LIGHTS }, (_unused, index) => input.length - 1 - index);

    expect(result.selected.map((entry) => entry.inputIndex)).toEqual(expectedIndices);
    expect(result.inputLights).toHaveLength(input.length);
    for (const [slot, inputIndex] of expectedIndices.entries()) {
      expect(result.selected[slot]!.light).toBe(input[inputIndex]);
      expect(result.inputLights[inputIndex]).toBe(input[inputIndex]);
      expect(result.packed.data[slot * LightUniforms.floatsPerLight + 3]).toBe(inputIndex + 1);
    }
    expect(result.packed.diagnostics).toMatchObject({
      order: "contribution-descending",
      requestedMaxLights: requestedMax,
      maxLights: MAX_DIRECT_LIGHTS,
      capacityClamped: true,
      requestedCount: MAX_DIRECT_LIGHTS + 2,
      selectedCount: MAX_DIRECT_LIGHTS,
      droppedCount: 2,
      degraded: true
    });
    expect(result.packed.diagnostics).toEqual(original.diagnostics);
    expect(bytes(result.packed.data)).toEqual(bytes(original.data));
  });

  it("captures input occurrences before evaluating a light that changes the caller's array", () => {
    const first = point("first", 1);
    const second = point("second", 2);
    const replacement = point("replacement", 8);
    const input = [first, second];
    Object.defineProperty(first, "intensity", {
      enumerable: true,
      get() {
        input[1] = replacement;
        return 1;
      }
    });

    const result = LightUniforms.packWithSelection(input);

    expect(input[1]).toBe(replacement);
    expect(result.inputLights[0]).toBe(first);
    expect(result.inputLights[1]).toBe(second);
    expect(result.selected.map((entry) => entry.inputIndex)).toEqual([0, 1]);
    expect(result.selected[0]!.light).toBe(first);
    expect(result.selected[1]!.light).toBe(second);
    expect(result.packed.data[LightUniforms.floatsPerLight + 3]).toBe(2);
    for (const entry of result.selected) {
      expect(result.inputLights[entry.inputIndex]).toBe(entry.light);
    }
  });

  it("keeps duplicate references as separate occurrences and resolves equal ties by input index", () => {
    const weak = point("weak", 1);
    const shared = point("shared", 2);
    const equalCopy: CollectedLight = { ...shared };
    const strong = point("strong", 4);
    const input = [weak, shared, equalCopy, shared, strong];

    const result = LightUniforms.packWithSelection(input, 4);
    expect(result.selected.map((entry) => entry.inputIndex)).toEqual([4, 1, 2, 3]);
    expect(result.selected[0]!.light).toBe(strong);
    expect(result.selected[1]!.light).toBe(shared);
    expect(result.selected[2]!.light).toBe(equalCopy);
    expect(result.selected[3]!.light).toBe(shared);
    expect(result.packed.diagnostics.droppedCount).toBe(1);

    const truncatedTie = LightUniforms.packWithSelection(input, 3);
    expect(truncatedTie.selected.map((entry) => entry.inputIndex)).toEqual([4, 1, 2]);
    expect(truncatedTie.selected[1]!.light).toBe(shared);
    expect(truncatedTie.selected[2]!.light).toBe(equalCopy);
    expect(truncatedTie.packed.diagnostics.droppedCount).toBe(2);
  });

  it("rejects sparse arrays and retains the existing maxLights validation", () => {
    const input = new Array<CollectedLight>(3);
    input[0] = point("first", 1);
    input[2] = point("last", 3);
    expect(() => LightUniforms.packWithSelection(input)).toThrowError(
      new TypeError("Light selection does not accept sparse input arrays")
    );

    for (const maxLights of [0, -1, 0.5, Number.POSITIVE_INFINITY, Number.NaN]) {
      expect(() => LightUniforms.packWithSelection([], maxLights)).toThrow(RangeError);
    }
    const empty = LightUniforms.packWithSelection([]);
    expect(empty.selected).toEqual([]);
    expect(empty.inputLights).toEqual([]);
    expect(Object.isFrozen(empty.selected)).toBe(true);
    expect(Object.isFrozen(empty.inputLights)).toBe(true);
  });

  it("preserves the complete packed bytes, diagnostics, and local shadow slot", () => {
    const light: LocalShadowedLight = {
      ...point("shadowed", 2),
      color: [1, 0.5, 0.25],
      position: [1, 2, 3],
      castsShadow: true,
      localShadowSlot: 3
    };
    const original = LightUniforms.pack([light]);
    const result = LightUniforms.packWithSelection([light]);
    const expected = new Float32Array(MAX_DIRECT_LIGHTS * 24);
    expected.set([
      1, 0.5, 0.25, 2,
      1, 2, 3, 5,
      0, -1, 0, 1,
      0, 0, 1, 1,
      1, 0, 0, 4,
      0, 1, 0, 0
    ]);

    expect(Object.keys(original)).toEqual(["lightCount", "data", "layout", "diagnostics"]);
    expect(result.packed.lightCount).toBe(1);
    expect(result.packed.layout).toBe(original.layout);
    expect(result.packed.diagnostics).toEqual(original.diagnostics);
    expect(result.selected[0]!.light).toBe(light);
    expect(result.selected[0]!.inputIndex).toBe(0);
    expect(bytes(original.data)).toEqual(bytes(expected));
    expect(bytes(result.packed.data)).toEqual(bytes(expected));
    expect(result.packed.data[19]).toBe(4);
  });
});
