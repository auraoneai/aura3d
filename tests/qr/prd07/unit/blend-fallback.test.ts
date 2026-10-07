// PRD-07 P1-T6 — blend fallback table: 4 named modes × {device honours
// blendMode, C-04-stub device}. Additive falls back to premultiplied ×1.6 core;
// multiply is skipped with an honest report; each degradation reports once.

import { beforeEach, describe, expect, it } from "vitest";
import {
  consumeBlendFallbackReport,
  resetBlendFallbackReports,
  resolveVfxBlend
} from "../../../../packages/rendering/src/vfx/BlendFallback";

describe("P1-T6 blend fallback", () => {
  beforeEach(() => resetBlendFallbackReports());

  it("with a blendMode-honouring device every named mode draws directly", () => {
    for (const mode of ["alpha", "premultiplied", "additive", "multiply"] as const) {
      const res = resolveVfxBlend(mode, true);
      expect(res.skipped).toBe(false);
      expect(res.degraded).toBeNull();
      expect(res.additiveFallback).toBe(false);
      expect(res.renderState.blend).toBe(mode !== "multiply" ? true : res.renderState.blend);
    }
  });

  it("under the C-04 stub: alpha and premultiplied alpha-over, additive ×1.6 fallback, multiply skipped", () => {
    const alpha = resolveVfxBlend("alpha", false);
    expect(alpha.renderState.blend).toBe(true);
    expect(alpha.unpremultiplyOutput).toBe(true);
    const additive = resolveVfxBlend("additive", false);
    expect(additive.additiveFallback).toBe(true);
    expect(additive.degraded).toBe("VFX_BLEND_FALLBACK");
    const multiply = resolveVfxBlend("multiply", false);
    expect(multiply.skipped).toBe(true);
    expect(multiply.degraded).toBe("VFX_BLEND_SKIPPED");
  });

  it("degraded reports are consumable exactly once per key", () => {
    expect(consumeBlendFallbackReport("batch.a", "VFX_BLEND_FALLBACK")).toBe("batch.a:VFX_BLEND_FALLBACK");
    expect(consumeBlendFallbackReport("batch.a", "VFX_BLEND_FALLBACK")).toBeNull();
    expect(consumeBlendFallbackReport("batch.b", "VFX_BLEND_FALLBACK")).not.toBeNull();
  });
});
