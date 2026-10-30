import { describe, expect, it } from "vitest";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import { effects } from "../../../../packages/engine/src/agent-api/index";
import {
  expandPostPreset,
  prd03PostPresets,
  presetCapabilityDegraded
} from "../../../../packages/engine/src/agent-api/postPresets";
import { postPresets } from "../../../../packages/engine/src/contracts/post";
import { createRootPostPipeline } from "../../../../packages/engine/src/agent-api/postBridge";
import type { AuraEffectNode } from "../../../../packages/engine/src/agent-api/nodes/types";

/**
 * PRD-03 Phase 5 §6.8: the seven presets are real `AuraPostPreset` data;
 * `output.preset` expands in the bridge with authored fields winning
 * field-by-field; agx/neutral presets render their declared operator
 * (GU47 E-C EC-3 removed the aces stand-in).
 */

const C13_IDS = ["product-studio", "daylight-outdoor", "neon-night", "space", "underwater", "arena-fight", "cinematic-film"] as const;

describe("prd03 post presets (§6.8)", () => {
  it("id set equals the C-13 contract set", () => {
    expect(Object.keys(prd03PostPresets).sort()).toEqual([...C13_IDS].sort());
    // C-13's public name is the same table, not a copy.
    expect(postPresets).toBe(prd03PostPresets);
  });

  it("every preset is data: id + output + builder effects + emissive range", () => {
    for (const id of C13_IDS) {
      const preset = prd03PostPresets[id];
      expect(preset.id).toBe(id);
      expect(preset.output.toneMapping).toBeDefined();
      expect(Array.isArray(preset.effects)).toBe(true);
      expect(preset.emissiveStrengthRange[0]).toBeLessThan(preset.emissiveStrengthRange[1]);
      for (const builder of preset.effects) {
        const node = builder.toJSON();
        expect(node.kind).toBe("effect");
        expect(typeof node.effect).toBe("string");
      }
    }
  });

  it("§6.8 spot rows: neon-night + product-studio match the table", () => {
    const neon = prd03PostPresets["neon-night"];
    expect(neon.output).toMatchObject({ toneMapping: "aces", exposure: 1.1 });
    const neonEffects = Object.fromEntries(neon.effects.map((b) => { const n = b.toJSON(); return [n.effect, n]; }));
    expect(neonEffects["bloom"]).toMatchObject({ threshold: 1.0, knee: 0.25, intensity: 0.35 });
    expect(neonEffects["ambient-occlusion"]).toMatchObject({ radius: 0.5 });
    expect(neonEffects["film-grain"]).toMatchObject({ intensity: 0.03 });
    expect(neonEffects["chromatic-aberration"]).toMatchObject({ intensity: 0.0015 });
    expect(neon.emissiveStrengthRange).toEqual([3, 8]);

    const studio = prd03PostPresets["product-studio"];
    expect(studio.output).toMatchObject({ toneMapping: "neutral", exposure: 1.0 });
    expect(studio.effects.map((b) => b.toJSON().effect)).toEqual(["ambient-occlusion"]);
    // §6.8: no bloom and no grade on product-studio.
    expect(studio.effects.some((b) => b.toJSON().effect === "bloom")).toBe(false);
  });

  it("no preset → expansion is the identity", () => {
    const nodes = [effects.bloom({ intensity: 0.5 }).toJSON() as AuraEffectNode];
    const out = expandPostPreset({ exposure: 1.2 }, nodes);
    expect(out.preset).toBeUndefined();
    expect(out.output).toEqual({ exposure: 1.2 });
    expect(out.nodes).toEqual(nodes);
  });

  it("unknown preset id → identity (no throw at expand time)", () => {
    const out = expandPostPreset({ preset: "nope" as never, exposure: 1 }, []);
    expect(out.preset).toBeUndefined();
    expect(out.output?.preset).toBe("nope");
  });

  it("authored output fields win over the preset's, preset fills the rest", () => {
    const out = expandPostPreset({ preset: "neon-night", exposure: 2.0, dither: false }, []);
    expect(out.output).toMatchObject({ preset: "neon-night", exposure: 2.0, dither: false, toneMapping: "aces" });
  });

  it("authored effect node overrides preset same-effect node field by field", () => {
    const authored = effects.bloom({ intensity: 0.9 }).toJSON() as AuraEffectNode;
    const { nodes } = expandPostPreset({ preset: "neon-night" }, [authored]);
    const bloom = nodes.find((n) => n.effect === "bloom")!;
    const fields = bloom as unknown as Record<string, unknown>;
    // authored intensity wins; preset-declared threshold/knee are filled in.
    expect(fields.intensity).toBe(0.9);
    expect(fields.threshold).toBe(1.0);
    expect(fields.knee).toBe(0.25);
    // merged postAuthored = authored keys + preset-only keys (isAuthored treats
    // preset fields as authored bridge inputs downstream).
    expect(bloom.postAuthored).toEqual(expect.arrayContaining(["intensity", "threshold", "knee"]));
  });

  it("preset-only nodes append in preset order; authored order preserved", () => {
    const authored = effects.vignette({ intensity: 0.9 }).toJSON() as AuraEffectNode;
    const { nodes } = expandPostPreset({ preset: "neon-night" }, [authored]);
    expect(nodes[0].effect).toBe("vignette"); // authored stays first
    const appended = nodes.slice(1).map((n) => n.effect);
    expect(appended).toEqual(["bloom", "ambient-occlusion", "color-grade", "film-grain", "chromatic-aberration"]);
  });

  it("expansion is deterministic: same inputs produce identical output twice", () => {
    const authored = [effects.bloom({ intensity: 0.5 }).toJSON() as AuraEffectNode];
    const a = expandPostPreset({ preset: "space" }, authored);
    const b = expandPostPreset({ preset: "space" }, authored);
    expect(JSON.parse(JSON.stringify(a.nodes))).toEqual(JSON.parse(JSON.stringify(b.nodes)));
    expect(a.output).toEqual(b.output);
  });

  it("agx/neutral presets render their declared operator; an authored operator still wins (GU47 EC-3)", () => {
    const declared = expandPostPreset({ preset: "daylight-outdoor" }, []);
    expect(declared.output?.toneMapping).toBe("agx");
    expect(expandPostPreset({ preset: "product-studio" }, []).output?.toneMapping).toBe("neutral");
    expect(presetCapabilityDegraded(declared.preset!, undefined)).toBe(false);
    const authoredOp = expandPostPreset({ preset: "daylight-outdoor", toneMapping: "aces" }, []);
    expect(authoredOp.output?.toneMapping).toBe("aces");
  });
});

describe("bridge expansion (createRootPostPipeline)", () => {
  const snapshot = { nodes: [] } as never;
  const camera = { near: 0.1, far: 100, mode: "perspective" } as const;
  const tier = QUALITY_TIERS.high;

  it("output.preset expands: preset-only effects become option bags", () => {
    const { options } = createRootPostPipeline(snapshot, camera, { preset: "neon-night" }, tier);
    expect(options.bloom).toMatchObject({ threshold: 1.0, intensity: 0.35 });
    expect(options.ao).toMatchObject({ radius: 0.5 });
    expect(options.filmGrain).toMatchObject({ intensity: 0.03 });
    expect(options.chromaticAberration).toMatchObject({ intensity: 0.0015 });
    expect(options.exposure).toBeCloseTo(1.1);
    expect(options.toneMapping).toBe("aces");
  });

  it("an agx preset with no authored operator renders agx, with no degrade report (GU47 EC-3)", () => {
    const { diagnostics, options } = createRootPostPipeline(snapshot, camera, { preset: "cinematic-film" }, tier);
    expect(options.toneMapping).toBe("agx");
    expect(diagnostics.some((d) => d.code === "preset-capability-degraded")).toBe(false);
  });

  it("no capability-degraded report when the app authored the operator", () => {
    const { diagnostics, options } = createRootPostPipeline(snapshot, camera, { preset: "cinematic-film", toneMapping: "agx" }, tier);
    expect(options.toneMapping).toBe("agx");
    expect(diagnostics.some((d) => d.code === "preset-capability-degraded")).toBe(false);
  });

  it("authored exposure wins over preset exposure in the pipeline product", () => {
    const { options } = createRootPostPipeline(snapshot, camera, { preset: "space", exposure: 0.5 }, tier);
    expect(options.exposure).toBeCloseTo(0.5);
    expect(options.toneMapping).toBe("aces"); // space is aces anyway
  });
});
