import { afterEach, describe, expect, it } from "vitest";
import { StubPostSurface } from "../../../../packages/engine/src/contracts/post";
import {
  POST_RUNTIME_EFFECTS,
  Prd03PostSurface,
  applyRuntimePostOverrides,
  createRootPostPipeline,
  resetRuntimePostOverrides
} from "../../../../packages/engine/src/agent-api/postBridge";
import { effects } from "../../../../packages/engine/src/agent-api/nodes/effects.composite";
import { QUALITY_TIERS } from "../../../../packages/rendering/src/contracts/quality";
import type { AuraSceneNode } from "../../../../packages/engine/src/agent-api/index";

/** GU47 E-C WP-3 item 5: `app.post.setEffect` / `setEffectEnabled` without a scene rebuild. */

const FLAGS = { on: () => true } as never;
const canvas = (): HTMLCanvasElement => ({}) as HTMLCanvasElement;

function scene(...nodes: { toJSON(): unknown }[]) {
  return { nodes: nodes.map((node) => node.toJSON()) } as never;
}

const derive = (snapshot: never, target?: HTMLCanvasElement) =>
  createRootPostPipeline(snapshot, { near: 0.1, far: 100 }, undefined, QUALITY_TIERS.high, [], undefined, target).options;

afterEach(() => resetRuntimePostOverrides());

describe("app.post.setEffect (EC-5)", () => {
  it("covers the seven PRD effects by factory name", () => {
    expect(Object.keys(POST_RUNTIME_EFFECTS).sort()).toEqual(
      ["bloom", "chromaticAberration", "colorGrade", "depthOfField", "motionBlur", "vignette", "volumetricFog"]
    );
  });

  it("patches the next derivation of the same snapshot (no rebuild) and merges later calls", () => {
    const snapshot = scene(effects.bloom({ intensity: 0.3, threshold: 1.2 }));
    const post = new Prd03PostSurface(FLAGS, canvas());
    const before = derive(snapshot);
    post.setEffect("bloom", { intensity: 1.4 });
    const after = derive(snapshot);
    expect(before.bloom?.intensity).toBeCloseTo(0.3, 6);
    expect(after.bloom?.intensity).toBeCloseTo(1.4, 6);
    expect(after.bloom?.threshold).toBeCloseTo(1.2, 6);
    post.setEffect("bloom", { threshold: 2 });
    const merged = derive(snapshot);
    expect(merged.bloom?.intensity).toBeCloseTo(1.4, 6);
    expect(merged.bloom?.threshold).toBe(2);
  });

  it("drives colorGrade, depthOfField, motionBlur, chromaticAberration, volumetricFog and vignette fields", () => {
    const snapshot = scene(
      effects.colorGrade({ temperature: 0 }),
      effects.depthOfField({ focusDistance: 4 }),
      effects.motionBlur({ shutter: 0.5 }),
      effects.chromaticAberration({ intensity: 0.001 }),
      effects.volumetricFog({ density: 0.1 }),
      effects.vignette({ intensity: 0.2 })
    );
    const post = new Prd03PostSurface(FLAGS, canvas());
    post.setEffect("colorGrade", { temperature: 0.2, gain: [1.1, 1, 0.9] });
    post.setEffect("depthOfField", { focusDistance: 9, fStop: 1.4 });
    post.setEffect("motionBlur", { shutter: 0.25 });
    post.setEffect("chromaticAberration", { intensity: 0.004 });
    post.setEffect("volumetricFog", { godRayDensity: 0.3, color: "#ff8000" });
    post.setEffect("vignette", { intensity: 0.55 });
    const options = derive(snapshot);
    expect(options.grade?.temperature).toBeCloseTo(0.2, 6);
    expect(options.grade?.gain).toEqual({ r: 1.1, g: 1, b: 0.9 });
    expect(options.dof?.focusDistance).toBe(9);
    expect(options.dof?.fStop).toBe(1.4);
    expect(options.motionBlur?.shutter).toBeCloseTo(0.25, 6);
    expect(options.chromaticAberration?.intensity).toBe(0.004);
    expect(options.godRays?.density).toBeCloseTo(0.3, 6);
    expect(options.godRays?.color.r).toBeCloseTo(1, 6);
    expect(options.godRays?.color.b).toBeCloseTo(0, 6);
    expect(options.vignette?.intensity).toBe(0.55);
  });

  it("accepts the effect id as well as the factory name", () => {
    const post = new Prd03PostSurface(FLAGS, canvas());
    post.setEffect("color-grade", { tint: -0.3 });
    expect(derive(scene(effects.colorGrade({}))).grade?.tint).toBeCloseTo(-0.3, 6);
  });

  it("adds an effect the scene does not declare, over its defaults", () => {
    const post = new Prd03PostSurface(FLAGS, canvas());
    const snapshot = scene(effects.bloom({ intensity: 0.3 }));
    expect(derive(snapshot).vignette).toBeUndefined();
    post.setEffect("vignette", { intensity: 0.6 });
    expect(derive(snapshot).vignette).toEqual({ intensity: 0.6, smoothness: 1, roundness: 1, color: { r: 0, g: 0, b: 0 } });
  });

  it("setEffectEnabled drops an effect and restores it with its patches", () => {
    const snapshot = scene(effects.depthOfField({ focusDistance: 4 }), effects.bloom({ intensity: 0.3 }));
    const post = new Prd03PostSurface(FLAGS, canvas());
    post.setEffect("depthOfField", { focusDistance: 6 });
    post.setEffectEnabled("depthOfField", false);
    post.setEffectEnabled("bloom", false);
    const off = derive(snapshot);
    expect(off.dof).toBeUndefined();
    expect(off.bloom).toBeUndefined();
    // A patch while disabled is kept but does not re-enable.
    post.setEffect("depthOfField", { fStop: 2 });
    expect(derive(snapshot).dof).toBeUndefined();
    post.setEffectEnabled("depthOfField", true);
    const on = derive(snapshot);
    expect(on.dof?.focusDistance).toBe(6);
    expect(on.dof?.fStop).toBe(2);
    expect(on.bloom).toBeUndefined();
  });

  it("setEffectEnabled(true) on an undeclared effect adds it with the defaults", () => {
    const post = new Prd03PostSurface(FLAGS, canvas());
    post.setEffectEnabled("chromaticAberration", true);
    expect(derive(scene()).chromaticAberration).toEqual({ intensity: 0.0015 });
  });

  it("rejects unknown effects, unknown fields and invalid values with POST_FIELD_UNSUPPORTED", () => {
    const post = new Prd03PostSurface(FLAGS, canvas());
    const code = (fn: () => void) => {
      try {
        fn();
      } catch (error) {
        return (error as { code?: string }).code;
      }
      return "no-throw";
    };
    expect(code(() => post.setEffect("ambientOcclusion", { intensity: 1 }))).toBe("POST_FIELD_UNSUPPORTED");
    expect(code(() => post.setEffect("toString", { intensity: 1 }))).toBe("POST_FIELD_UNSUPPORTED");
    expect(code(() => post.setEffect("bloom", { sharpness: 1 }))).toBe("POST_FIELD_UNSUPPORTED");
    expect(code(() => post.setEffect("bloom", { intensity: Number.NaN }))).toBe("POST_FIELD_UNSUPPORTED");
    expect(code(() => post.setEffect("vignette", { color: [] }))).toBe("POST_FIELD_UNSUPPORTED");
    expect(code(() => post.setEffectEnabled("bloom", "yes" as never))).toBe("POST_FIELD_UNSUPPORTED");
    // A rejected call leaves no partial state behind.
    expect(derive(scene()).bloom).toBeUndefined();
  });

  it("scopes overrides per canvas when the canvas is passed", () => {
    const a = canvas();
    const b = canvas();
    const postA = new Prd03PostSurface(FLAGS, a);
    new Prd03PostSurface(FLAGS, b);
    postA.setEffect("vignette", { intensity: 0.7 });
    const snapshot = scene(effects.vignette({ intensity: 0.2 }));
    expect(derive(snapshot, a).vignette?.intensity).toBe(0.7);
    expect(derive(snapshot, b).vignette?.intensity).toBe(0.2);
  });

  it("a new app starts with no overrides", () => {
    new Prd03PostSurface(FLAGS, canvas()).setEffect("vignette", { intensity: 0.7 });
    new Prd03PostSurface(FLAGS, canvas());
    expect(derive(scene(effects.vignette({ intensity: 0.2 }))).vignette?.intensity).toBe(0.2);
  });

  it("applyRuntimePostOverrides is the identity with no overrides and idempotent with them", () => {
    const nodes = [effects.bloom({ intensity: 0.3 }).toJSON(), effects.vignette({}).toJSON()] as unknown as readonly AuraSceneNode[];
    expect(applyRuntimePostOverrides(nodes)).toBe(nodes);
    const post = new Prd03PostSurface(FLAGS, canvas());
    post.setEffect("bloom", { intensity: 2, scatter: 0.4 });
    post.setEffect("motionBlur", { shutter: 0.3 });
    const once = applyRuntimePostOverrides(nodes);
    expect(applyRuntimePostOverrides(once)).toEqual(once);
    const bloom = once.find((node) => node.kind === "effect" && node.effect === "bloom") as unknown as Record<string, unknown>;
    // The compiler's bloom bag reads the pre-cap intensity and the radius alias.
    expect(bloom.postIntensity).toBe(2);
    expect(bloom.radius).toBe(0.4);
    expect(once.filter((node) => node.kind === "effect" && node.effect === "motion-blur")).toHaveLength(1);
  });

  it("the stub surface accepts the calls as no-ops", () => {
    const stub = new StubPostSurface();
    expect(() => stub.setEffect("bloom", { intensity: 1 })).not.toThrow();
    expect(() => stub.setEffectEnabled("bloom", false)).not.toThrow();
  });
});
