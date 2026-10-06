/**
 * PRD-01 Phase-2 C-04 impl tests (lane 01, §15): `resolveBlendMode` factor
 * tables (§6.8), `renderStateKey` u32 stability + distinctness for every
 * built-in mode and 20 random custom states, legacy `blend` mapping,
 * Material-level `blendMode`/`depthCompareV2`/`alphaToCoverage` fields and the
 * depthWrite default, queue classification (additive/multiply after alpha).
 */

import { describe, expect, it } from "vitest";

import {
  resolveBlendMode,
  renderStateKey,
  type BlendFactor,
  type BlendEquation,
  type BlendMode
} from "../../../../packages/rendering/src/contracts/blend";
import { blendQueueForState } from "../../../../packages/rendering/src/BlendModes";
import { Material } from "../../../../packages/rendering/src/Material";
import { UnlitMaterial } from "../../../../packages/rendering/src/UnlitMaterial";
import type { RenderCommandState } from "../../../../packages/rendering/src/RenderDevice";
import { sortRenderQueueItems } from "../../../../packages/rendering/src/performance/RenderItemSorting";

const BASE: RenderCommandState = {
  depthTest: true,
  depthWrite: false,
  cullMode: "back",
  blend: false,
  depthCompare: "less-equal"
};

const EQUATIONS: readonly BlendEquation[] = ["add", "subtract", "reverse-subtract", "min", "max"];
const FACTORS: readonly BlendFactor[] = [
  "zero", "one", "src-color", "one-minus-src-color", "src-alpha",
  "one-minus-src-alpha", "dst-color", "one-minus-dst-color", "dst-alpha", "one-minus-dst-alpha"
];

describe("prd01 C-04 resolveBlendMode", () => {
  it("legacy blend boolean maps true → alpha, false → opaque", () => {
    expect(resolveBlendMode({ ...BASE, blend: true })).toEqual({
      kind: "custom",
      color: { equation: "add", src: "src-alpha", dst: "one-minus-src-alpha" },
      alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" }
    });
    expect(resolveBlendMode({ ...BASE, blend: false })).toBe("opaque");
  });

  it("named modes resolve to the §6.8 factor table", () => {
    expect(resolveBlendMode({ ...BASE, blendMode: "premultiplied" })).toEqual({
      kind: "custom",
      color: { equation: "add", src: "one", dst: "one-minus-src-alpha" },
      alpha: { equation: "add", src: "one", dst: "one-minus-src-alpha" }
    });
    expect(resolveBlendMode({ ...BASE, blendMode: "additive" })).toEqual({
      kind: "custom",
      color: { equation: "add", src: "src-alpha", dst: "one" },
      alpha: { equation: "add", src: "zero", dst: "one" }
    });
    expect(resolveBlendMode({ ...BASE, blendMode: "multiply" })).toEqual({
      kind: "custom",
      color: { equation: "add", src: "dst-color", dst: "one-minus-src-alpha" },
      alpha: { equation: "add", src: "zero", dst: "one" }
    });
    expect(resolveBlendMode({ ...BASE, blendMode: "opaque", blend: true })).toBe("opaque");
  });

  it("custom mode passes components through", () => {
    const mode: BlendMode = {
      kind: "custom",
      color: { equation: "add", src: "src-color", dst: "one" },
      alpha: { equation: "add", src: "zero", dst: "one" }
    };
    expect(resolveBlendMode({ ...BASE, blendMode: mode })).toEqual({
      kind: "custom",
      color: { equation: "add", src: "src-color", dst: "one" },
      alpha: { equation: "add", src: "zero", dst: "one" }
    });
  });

  it("lane 03's indirect-fraction custom (srcRGB, dstRGB, ZERO, ONE) is a stable custom mode", () => {
    const indirectFraction: BlendMode = {
      kind: "custom",
      color: { equation: "add", src: "src-color", dst: "dst-color" },
      alpha: { equation: "add", src: "zero", dst: "one" }
    };
    const a = renderStateKey({ ...BASE, blendMode: indirectFraction });
    const b = renderStateKey({ ...BASE, blendMode: { ...indirectFraction } });
    expect(a).toBe(b);
    expect(a).not.toBe(renderStateKey({ ...BASE, blendMode: "additive" }));
  });
});

describe("prd01 C-04 renderStateKey", () => {
  it("gives distinct keys to every built-in mode", () => {
    const modes: readonly BlendMode[] = ["opaque", "alpha", "premultiplied", "additive", "multiply"];
    const keys = new Set(modes.map((m) => renderStateKey({ ...BASE, blendMode: m })));
    expect(keys.size).toBe(modes.length);
  });

  it("gives distinct keys to 20 random custom states (deterministic)", () => {
    let seed = 0x9e3779b9;
    const rand = () => (seed = (seed * 1103515245 + 12345) >>> 0) / 0xffffffff;
    const keys = new Set<number>();
    for (let i = 0; i < 20; i += 1) {
      const pickE = () => EQUATIONS[Math.floor(rand() * EQUATIONS.length)]!;
      const pickF = () => FACTORS[Math.floor(rand() * FACTORS.length)]!;
      const mode: BlendMode = {
        kind: "custom",
        color: { equation: pickE(), src: pickF(), dst: pickF() },
        alpha: { equation: pickE(), src: pickF(), dst: pickF() }
      };
      keys.add(renderStateKey({ ...BASE, blendMode: mode }));
    }
    expect(keys.size).toBe(20);
  });

  it("is stable across equal states and excludes scissor", () => {
    const a = renderStateKey({ ...BASE, blendMode: "additive", alphaToCoverage: true });
    const b = renderStateKey({ ...BASE, blendMode: "additive", alphaToCoverage: true, scissor: { x: 0, y: 0, width: 9, height: 9 } });
    expect(a).toBe(b);
    expect(a).not.toBe(renderStateKey({ ...BASE, blendMode: "additive" }));
    expect(renderStateKey({ ...BASE, blendMode: "alpha", depthCompareV2: "less" })).not.toBe(
      renderStateKey({ ...BASE, blendMode: "alpha", depthCompareV2: "always" })
    );
  });

  it("u32 packing stays within 32 bits", () => {
    const worst = renderStateKey({
      ...BASE,
      blendMode: {
        kind: "custom",
        color: { equation: "max", src: "one-minus-dst-alpha", dst: "one-minus-dst-alpha" },
        alpha: { equation: "max", src: "one-minus-dst-alpha", dst: "one-minus-dst-alpha" }
      },
      depthCompareV2: "always",
      cullMode: "front",
      alphaToCoverage: true
    });
    expect(Number.isInteger(worst)).toBe(true);
    expect(worst).toBeGreaterThanOrEqual(0);
    expect(worst).toBeLessThan(2 ** 32);
  });
});

describe("prd01 C-04 Material renderState", () => {
  it("accepts blendMode/depthCompareV2/alphaToCoverage and defaults depthWrite per §6.8", () => {
    const material = new UnlitMaterial({
      renderState: { blendMode: "additive", depthCompareV2: "less", alphaToCoverage: true }
    });
    expect(material.renderState.blendMode).toBe("additive");
    expect(material.renderState.depthCompareV2).toBe("less");
    expect(material.renderState.alphaToCoverage).toBe(true);
    expect(material.renderState.depthWrite).toBe(false); // table default
  });

  it("blendMode 'opaque' keeps the depthWrite default and rejects blending+depthWrite", () => {
    const opaque = new Material({ shaderKey: "unlit", renderState: { blendMode: "opaque" } });
    expect(opaque.renderState.depthWrite).toBe(true);
    expect(() => new Material({ shaderKey: "unlit", renderState: { blendMode: "alpha", depthWrite: true } })).toThrow(/depthWrite/);
    expect(() => new Material({ shaderKey: "unlit", renderState: { blendMode: { kind: "custom", color: { equation: "add", src: "one", dst: "one" }, alpha: { equation: "add", src: "one", dst: "one" } }, depthWrite: true } })).toThrow(/depthWrite/);
  });
});

describe("prd01 C-04 queue classification", () => {
  it("sorts additive and multiply after back-to-front alpha items (6 items)", () => {
    const items = [
      { item: "alpha-near", bucket: "transparent" as const, depth: 1, blendRank: 0 },
      { item: "additive-far", bucket: "transparent" as const, depth: 100, blendRank: 1 },
      { item: "alpha-far", bucket: "transparent" as const, depth: 90, blendRank: 0 },
      { item: "multiply-mid", bucket: "transparent" as const, depth: 50, blendRank: 1 },
      { item: "opaque", bucket: "opaque" as const, depth: 10, blendRank: 0 },
      { item: "alpha-mid", bucket: "transparent" as const, depth: 30, blendRank: 0 }
    ];
    const sorted = sortRenderQueueItems(items).items;
    expect(sorted).toEqual(["opaque", "alpha-far", "alpha-mid", "alpha-near", "additive-far", "multiply-mid"]);
  });

  it("blendQueueForState honors blendMode over blend", () => {
    expect(blendQueueForState({ blend: true })).toBe("transparent-sorted");
    expect(blendQueueForState({ blend: false })).toBe("opaque");
    expect(blendQueueForState({ blend: true, blendMode: "opaque" })).toBe("opaque");
    expect(blendQueueForState({ blend: false, blendMode: "additive" })).toBe("transparent-unordered");
    expect(blendQueueForState({ blend: false, blendMode: "multiply" })).toBe("transparent-unordered");
    expect(blendQueueForState({ blend: false, blendMode: { kind: "custom", color: { equation: "add", src: "one", dst: "one" }, alpha: { equation: "add", src: "zero", dst: "one" } } })).toBe("transparent-sorted");
  });
});
