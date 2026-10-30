import { beforeEach, describe, expect, test } from "vitest";
import { effects, model, primitives, scene, type AuraEffectNode, type AuraSceneSnapshot } from "@aura3d/engine";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetSubmittedPostprocess,
  validatePostEffectNode
} from "../../../../packages/engine/src/agent-api/postBridge";

/**
 * GU47 eint, E-E handoffs H0 + H1 (blocking for G16/G20/G24): `effects.outline({ targets })` validates on the strict
 * v2 chain (A3D_QR_POST default-on) and its names reach the renderer's `postprocess.outline.targets` as label match
 * keys. An outline without `targets` compiles byte-identically (no `targets` key).
 */

beforeEach(() => {
  resetSubmittedPostprocess();
  resetAuthoredPostContext();
});

const outlineOf = (options: Parameters<typeof effects.outline>[0]) => effects.outline(options).toJSON() as unknown as AuraEffectNode;

function targetScene(outline: Parameters<typeof effects.outline>[0]): AuraSceneSnapshot {
  return scene()
    .add(primitives.sphere({ name: "rider" }))
    .add(model({ id: "heroKnight", url: "/hero.glb", kind: "glb" } as never, { name: "hero" } as never))
    .add(primitives.box({ name: "crate" }))
    .add(effects.outline(outline))
    .toJSON() as AuraSceneSnapshot;
}

describe("H0: the v2 field allowlist admits outline targets", () => {
  test("validatePostEffectNode reports no POST_FIELD_UNSUPPORTED for targets", () => {
    const diagnostics = validatePostEffectNode(outlineOf({ color: "#1b2236", width: 2, targets: ["rider"] })) ?? [];
    expect(diagnostics.filter((diagnostic) => diagnostic.code === "POST_FIELD_UNSUPPORTED")).toEqual([]);
  });

  test("a scene authoring outline targets compiles under the strict v2 chain (app.ready() no longer rejects)", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const options = createProductionRuntimePostprocess(targetScene({ width: 2, targets: ["rider"] }), [], 64, 64);
    expect(options.v2).toBe(true);
  });
});

describe("H1: the compiled outline carries the target match keys", () => {
  test("targets compile to node names plus model ids, flag-on and flag-off", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const v2 = createProductionRuntimePostprocess(targetScene({ width: 2, targets: ["rider", "hero"] }), [], 64, 64);
    const v2Outline = v2.outline as { readonly targets?: readonly string[]; readonly width?: number };
    expect(v2Outline.width).toBe(2);
    expect(v2Outline.targets?.slice(0, 2)).toEqual(["rider", "hero"]);
    expect(v2Outline.targets).not.toContain("crate");

    resetAuthoredPostContext();
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: { A3D_QR_POST: false } }), options: {} });
    const legacy = createProductionRuntimePostprocess(targetScene({ width: 2, targets: ["rider"] }), [], 64, 64);
    expect((legacy.outline as { readonly targets?: readonly string[] }).targets).toEqual(["rider"]);
  });

  test("an empty target list stays a targeted outline that inks nothing", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const options = createProductionRuntimePostprocess(targetScene({ targets: [] }), [], 64, 64);
    expect((options.outline as { readonly targets?: readonly string[] }).targets).toEqual([]);
  });

  test("an outline without targets compiles exactly as before (no targets key)", () => {
    recordAuthoredPostContext({ flags: resolveQrFlags({ options: ["post"] }), options: {} });
    const options = createProductionRuntimePostprocess(targetScene({ width: 3 }), [], 64, 64);
    expect(options.outline).toEqual({ color: [255, 152, 34, 255], width: 3, threshold: 0.12, opacity: 0.9 });
    expect("targets" in (options.outline as object)).toBe(false);
  });
});
