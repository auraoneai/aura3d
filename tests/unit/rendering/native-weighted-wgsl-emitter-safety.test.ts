import { describe, expect, it, vi } from "vitest";
import type { GeneratedProgram } from "../../../packages/rendering/src/contracts/program";
import { normalizeProgramFeatures } from "../../../packages/rendering/src/program/ProgramFeatures";
import {
  generateProgramImpl, generateWeightedTransparencyWgslPreview, isBuiltinGeneratedWgsl, registerProgramWgslEmitter
} from "../../../packages/rendering/src/program/ProgramGenerator";

describe("weighted WGSL with an externally registered emitter", () => {
  it("rejects both phases before invoking the emitter, without changing ordinary emitter behavior", () => {
    const external: GeneratedProgram = { key: "external", vertex: "vertex", fragment: "fragment", defines: {} };
    const emit = vi.fn(() => external);
    registerProgramWgslEmitter(emit);

    for (const phase of ["accumulation", "revealage"] as const) {
      const f = normalizeProgramFeatures({ target: "wgsl", alphaMode: "blend", features: { "a3d.transparency": phase } });
      expect(() => generateWeightedTransparencyWgslPreview(f)).toThrow("WEIGHTED_TRANSPARENCY_WGSL_PREVIEW_REQUIRES_BUILTIN");
      expect(() => generateProgramImpl(f)).toThrow("WEIGHTED_TRANSPARENCY_UNSUPPORTED_WGSL");
    }
    expect(emit).not.toHaveBeenCalled();
    const ordinary = normalizeProgramFeatures({ target: "wgsl", alphaMode: "blend" });
    expect(generateProgramImpl(ordinary)).toBe(external);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(isBuiltinGeneratedWgsl(external)).toBe(false);
  });
});
