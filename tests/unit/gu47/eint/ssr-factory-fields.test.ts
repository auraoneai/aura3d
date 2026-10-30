import { describe, expect, it } from "vitest";
import { effects, type AuraEffectNode, type AuraScreenSpaceReflectionsOptions, type AuraSceneSnapshot } from "@aura3d/engine";
import { QUALITY_TIERS } from "@aura3d/rendering/contracts";
import { createRootPostPipeline, validatePostEffectNode } from "../../../../packages/engine/src/agent-api/postBridge";

/**
 * GU47 eint EC-2 (E-C handoff 2): `effects.screenSpaceReflections({ maxDistance, roughness, thickness })` copies the
 * S3 fields onto the node (depthOfField `tiltShift` and volumetricFog `godRayDensity` already did), so the v2 bridge
 * that reads them gets the authored values. Unauthored fields stay off the node (snapshot unchanged).
 */
describe("GU47 eint EC-2: SSR factory fields", () => {
  const options: AuraScreenSpaceReflectionsOptions = { intensity: 0.7, maxDistance: 30, roughness: 0.35, thickness: 0.1 };

  it("the node carries the authored S3 fields and only those", () => {
    const node = effects.screenSpaceReflections(options).toJSON() as unknown as AuraEffectNode & Record<string, unknown>;
    expect(node).toMatchObject({ effect: "screen-space-reflections", intensity: 0.7, maxDistance: 30, roughness: 0.35, thickness: 0.1 });
    expect(validatePostEffectNode(node)?.filter((diagnostic) => diagnostic.code === "POST_FIELD_UNSUPPORTED")).toEqual([]);
    const plain = effects.screenSpaceReflections().toJSON() as unknown as Record<string, unknown>;
    expect(plain).toEqual({ kind: "effect", effect: "screen-space-reflections", name: "screen space reflections", intensity: 0.9 });
  });

  it("the v2 pipeline bag reads them", () => {
    const snapshot = { nodes: [effects.screenSpaceReflections(options).toJSON()] } as unknown as AuraSceneSnapshot;
    const ssr = createRootPostPipeline(snapshot, { near: 0.1, far: 100, mode: "perspective" } as never, undefined, QUALITY_TIERS.high).options.ssr as
      { readonly maxDistance?: number; readonly roughness?: number; readonly thickness?: number } | undefined;
    expect(ssr).toMatchObject({ maxDistance: 30, roughness: 0.35, thickness: 0.1 });
  });
});
