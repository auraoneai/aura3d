import { describe, expect, test } from "vitest";
import { effects, primitives, renderer, scene } from "@aura3d/engine";

/** muse3jsparity-PRD A3: new root effect nodes are constructible and honest. */
describe("root effects A3 nodes", () => {
  test("all six nodes construct from @aura3d/engine only", () => {
    const nodes = [
      effects.colorGrade({ exposure: 1.1, contrast: 1.2, saturation: 1.1 }).toJSON(),
      effects.antiAlias({ mode: "fxaa" }).toJSON(),
      effects.outline({ color: "#ff9822", width: 3 }).toJSON(),
      effects.screenSpaceReflections({ intensity: 0.9 }).toJSON(),
      effects.depthOfField({ focus: 0.42, aperture: 0.35, maxBlur: 4 }).toJSON(),
      effects.motionBlur({ intensity: 0.5 }).toJSON()
    ];
    expect(nodes.map((node) => (node as { effect: string }).effect)).toEqual([
      "color-grade", "anti-alias", "outline",
      "screen-space-reflections", "depth-of-field", "motion-blur"
    ]);
  });

  test("submittable passes appear in requestedPasses unmounted", () => {
    const diagnostics = renderer.diagnostics(
      scene()
        .add(primitives.box({ name: "a3 grade subject" }))
        .add(effects.colorGrade({ contrast: 1.2, saturation: 1.1 }))
        .add(effects.antiAlias({ mode: "fxaa" }))
        .add(effects.outline({ width: 3 }))
        .add(effects.screenSpaceReflections({ intensity: 0.9 }))
        .add(effects.depthOfField({ focus: 0.42, aperture: 0.35, maxBlur: 4 }))
    );
    expect(diagnostics.postprocess.requested).toBe(true);
    for (const pass of ["color-grade", "ssr", "depth-of-field", "outline", "fxaa"]) {
      expect(diagnostics.postprocess.requestedPasses).toContain(pass);
    }
    expect(diagnostics.postprocess.actualPasses).toEqual([]);
  });

  test("withheld intents stay visible and warned, never silently dropped", () => {
    const diagnostics = renderer.diagnostics(
      scene()
        .add(primitives.box({ name: "a3 withheld subject" }))
        .add(effects.motionBlur({ intensity: 0.5 }))
        .add(effects.antiAlias({ mode: "taa" }))
    );
    expect(diagnostics.postprocess.requestedPasses).toContain("motion-blur (withheld: no velocity binding)");
    expect(diagnostics.postprocess.requestedPasses).toContain("taa (withheld: no history binding)");
    const warnings = diagnostics.warnings.join(" ");
    expect(warnings).toContain("motion-blur is recorded but withheld");
    expect(warnings).toContain("taa\" is recorded but withheld");
  });

  test("anti-alias off submits nothing and warns nothing", () => {
    const diagnostics = renderer.diagnostics(
      scene()
        .add(primitives.box({ name: "a3 aa off subject" }))
        .add(effects.antiAlias({ mode: "off" }))
    );
    expect(diagnostics.postprocess.requestedPasses).not.toContain("fxaa");
    expect(diagnostics.warnings.join(" ")).not.toContain("withheld");
  });

  test("unmapped grade params are recorded and warned", () => {
    const diagnostics = renderer.diagnostics(
      scene()
        .add(primitives.box({ name: "a3 grade params subject" }))
        .add(effects.colorGrade({ exposure: 1.2, shadows: 0.1, highlights: 0.1, lut: "warm-table" }))
    );
    const warnings = diagnostics.warnings.join(" ");
    expect(warnings).toContain("color-grade exposure is recorded");
    expect(warnings).toContain("color-grade shadows/highlights are recorded");
    expect(warnings).toContain("color-grade lut is recorded");
  });
});
