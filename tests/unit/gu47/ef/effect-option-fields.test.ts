import { describe, expect, test } from "vitest";
import { effects } from "@aura3d/engine";

/**
 * GU47 E-F hosts three option fields whose behaviour lives in other lanes
 * (PRD §3.1): depthOfField `tiltShift` (E-C), volumetricFog `godRayDensity`
 * (E-C) and outline `targets` (E-E). The builder records them on the node only
 * when authored, so existing scenes keep byte-identical node snapshots.
 */
describe("GU47 E-F effect option fields", () => {
  test("depthOfField records tiltShift as authored data", () => {
    const node = effects.depthOfField({ focus: 0.4, tiltShift: { bandCenter: 0.45, bandWidth: 0.2, angleDeg: 8 } }).toJSON() as unknown as Record<string, unknown>;
    expect(node.effect).toBe("depth-of-field");
    expect(node.tiltShift).toEqual({ bandCenter: 0.45, bandWidth: 0.2, angleDeg: 8 });
    expect(node.postAuthored).toEqual(["focus", "tiltShift"]);
    const noBand = effects.depthOfField({ focus: 0.4 }).toJSON() as unknown as Record<string, unknown>;
    expect("tiltShift" in noBand).toBe(false);
    expect(noBand.postAuthored).toEqual(["focus"]);
  });

  test("volumetricFog records godRayDensity apart from the fog density", () => {
    const node = effects.volumetricFog({ density: 0.18, godRayDensity: 0.6 }).toJSON() as unknown as Record<string, unknown>;
    expect(node.effect).toBe("volumetric-fog");
    expect(node.density).toBe(0.18);
    expect(node.godRayDensity).toBe(0.6);
    expect("godRayDensity" in (effects.volumetricFog().toJSON() as unknown as Record<string, unknown>)).toBe(false);
  });

  test("outline records a copy of targets", () => {
    const targets = ["hero", "rival"];
    const node = effects.outline({ width: 2, targets }).toJSON() as unknown as Record<string, unknown>;
    targets.push("late");
    expect(node.effect).toBe("outline");
    expect(node.targets).toEqual(["hero", "rival"]);
    expect("targets" in (effects.outline().toJSON() as unknown as Record<string, unknown>)).toBe(false);
  });
});
