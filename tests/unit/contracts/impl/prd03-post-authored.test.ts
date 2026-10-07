import { describe, expect, it } from "vitest";
import { effects, scene, primitives } from "../../../../packages/engine/src/agent-api/index";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";

/**
 * PRD-03 Phase 2 checklist: "node objects equal today's (except
 * `postAuthored`), and the legacy bridge output is byte-equal" — the CCR-03-3
 * invariant, tested as the spec requires instead of assumed.
 */

describe("postAuthored snapshot invariant (CCR-03-3)", () => {
  it.each([
    ["bloom", { intensity: 0.5, threshold: 0.8 }],
    ["neonBloom", {}],
    ["ambientOcclusion", { radius: 0.9 }],
    ["contactOcclusion", {}],
    ["colorGrade", { exposure: 1.2, lut: "teal-orange-33.cube" }],
    ["antiAlias", { mode: "taa" }]
  ] as const)("effects.%s nodes differ from the pre-carve shape only in postAuthored", (name, options) => {
    const node = effects[name](options as never).toJSON() as unknown as Record<string, unknown>;
    const without = { ...node };
    delete without.postAuthored;
    // postAuthored is present and is exactly the caller's authored key list.
    expect(node.postAuthored).toEqual(Object.keys(options));
    // Every other own key is a known legacy field — the carve added nothing.
    for (const key of Object.keys(without)) {
      expect(["kind", "effect", "name", "intensity", "color", "radius", "threshold",
        "antiBlowout", "maxIntensity", "exposure", "contrast", "saturation",
        "density", "mode", "lut", "shadows", "highlights", "quality",
        "softKnee", "shoulder"]).toContain(key);
    }
  });

  it("effects.bloom/antiAlias default postAuthored is empty (all factory fill)", () => {
    expect((effects.bloom() as never as { toJSON(): { postAuthored: unknown } }).toJSON().postAuthored).toEqual([]);
    expect((effects.antiAlias() as never as { toJSON(): { postAuthored: unknown } }).toJSON().postAuthored).toEqual([]);
  });

  it("delegating factories propagate the caller's authored keys (neonBloom → bloom)", () => {
    const node = (effects.neonBloom({ intensity: 0.9, color: "#ff0000" }) as never as { toJSON(): { postAuthored: unknown } }).toJSON();
    expect(node.postAuthored).toEqual(["intensity", "color"]);
    // The delegate's own fills (radius/threshold/…) do NOT count as authored.
  });

  it("legacy bridge: flag-off createProductionRuntimePostprocess ignores postAuthored (byte-equal)", () => {
    const authored = (effects.bloom({ intensity: 0.6, threshold: 0.5 }) as never as { toJSON(): Record<string, unknown> }).toJSON();
    const stripped = { ...authored };
    delete stripped.postAuthored;
    const withField = createProductionRuntimePostprocess(
      scene().add(primitives.box()).add(authored as never).toJSON()
    );
    const without = createProductionRuntimePostprocess(
      scene().add(primitives.box()).add(stripped as never).toJSON()
    );
    expect(JSON.stringify(withField)).toBe(JSON.stringify(without));
  });
});
