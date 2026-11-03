import { describe, expect, it } from "vitest";
import { Geometry } from "../../../packages/rendering/src/Geometry";
import { UnlitMaterial } from "../../../packages/rendering/src/UnlitMaterial";
import { DrawDataTexture } from "../../../packages/rendering/src/batching/DrawDataTexture";
import { isActiveCombinedDrawCarrier, withCombinedDrawCarrier } from "../../../packages/rendering/src/batching/CombinedDrawCarrier";
import type { RenderItem } from "../../../packages/rendering/src/contracts/renderItem";

describe("scoped combined shader carrier", () => {
  it("uses temporary private identity and replaces the per-member bindings", () => {
    const geometry = Geometry.triangle(), material = new UnlitMaterial(), rows = new DrawDataTexture(2);
    const item: RenderItem = { geometry, material, modelMatrix: [2, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 3, 0, 0, 1],
      instanceTransforms: new Float32Array(16), instanceColors: [1, 0.5, 0.25, 1], modelViewProjectionMatrix: new Float32Array(16) };
    try {
      const texture = rows.upload();
      let escaped: RenderItem | undefined;
      withCombinedDrawCarrier(item, texture, (carrier) => {
        escaped = carrier;
        expect(isActiveCombinedDrawCarrier(carrier)).toBe(true);
        expect(isActiveCombinedDrawCarrier(item)).toBe(false);
        expect(isActiveCombinedDrawCarrier({ ...carrier })).toBe(false);
        const proxy = new Proxy(carrier, { get() { throw new Error("identity check inspected proxy"); } });
        expect(isActiveCombinedDrawCarrier(proxy)).toBe(false);
        expect(carrier.geometry).toBe(geometry);
        expect(carrier.material).toBe(material);
        expect(carrier.instanceTransforms).toBeUndefined();
        expect(carrier.instanceColors).toBeUndefined();
        expect(carrier.modelViewProjectionMatrix).toBeUndefined();
        expect(carrier.modelMatrix).toEqual([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]);
        expect(carrier.normalMatrix).toEqual(carrier.modelMatrix);
        expect((carrier as RenderItem & { multiDraw: { drawData: unknown } }).multiDraw.drawData).toBe(texture);
      });
      expect(isActiveCombinedDrawCarrier(escaped)).toBe(false);
      let failed: RenderItem | undefined;
      expect(() => withCombinedDrawCarrier(item, texture, (carrier) => { failed = carrier; throw new Error("abort"); })).toThrow("abort");
      expect(isActiveCombinedDrawCarrier(failed)).toBe(false);
    } finally { rows.dispose(); material.dispose(); geometry.dispose(); }
  });
});
