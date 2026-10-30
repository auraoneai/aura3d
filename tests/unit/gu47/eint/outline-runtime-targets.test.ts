import { afterEach, describe, expect, test } from "vitest";
import { effects, model, primitives, scene, type AuraSceneSnapshot } from "@aura3d/engine";
import { resolveQrFlags } from "../../../../packages/engine/src/contracts/flags";
import { createProductionRuntimePostprocess } from "../../../../packages/engine/src/agent-api/compiler/postprocess";
import {
  Prd03PostSurface,
  POST_RUNTIME_EFFECTS,
  recordAuthoredPostContext,
  resetAuthoredPostContext,
  resetRuntimePostOverrides,
  resetSubmittedPostprocess
} from "../../../../packages/engine/src/agent-api/postBridge";

/**
 * GU47 eint, E-E handoff H4 (optional, to E-C): `app.post.setEffect("outline", { targets })` retargets the outline
 * at runtime (hover, the current rider) without rebuilding the scene; the next frame's compile carries the new
 * names through H1 to the renderer's match keys. Colour patches stay colour strings for the outline.
 */

const POST = resolveQrFlags({ options: ["post"] });

afterEach(() => {
  resetRuntimePostOverrides();
  resetAuthoredPostContext();
  resetSubmittedPostprocess();
});

function outlineScene(): AuraSceneSnapshot {
  return scene()
    .add(primitives.sphere({ name: "rider" }))
    .add(model({ id: "heroKnight", url: "/hero.glb", kind: "glb" } as never, { name: "hero" }))
    .add(effects.outline({ width: 2, targets: ["rider"] }))
    .toJSON() as AuraSceneSnapshot;
}

const compiledOutline = () =>
  createProductionRuntimePostprocess(outlineScene(), [], 64, 64).outline as { readonly targets?: readonly string[]; readonly color?: readonly number[] };

describe("GU47 eint EE-H4: runtime outline targets", () => {
  test("outline is a runtime post effect", () => {
    expect(POST_RUNTIME_EFFECTS.outline).toBe("outline");
  });

  test("setEffect retargets the compiled outline on the next derivation", () => {
    recordAuthoredPostContext({ flags: POST, options: {} });
    const surface = new Prd03PostSurface(POST);
    expect(compiledOutline().targets).toEqual(["rider"]);
    surface.setEffect("outline", { targets: ["hero"] });
    const retargeted = compiledOutline().targets;
    expect(retargeted?.[0]).toBe("hero");
    expect(retargeted).toContain("heroKnight");
    expect(retargeted).not.toContain("rider");
    surface.setEffect("outline", { targets: [] });
    expect(compiledOutline().targets).toEqual([]);
  });

  test("an outline colour patch stays a colour the compiled outline parses", () => {
    recordAuthoredPostContext({ flags: POST, options: {} });
    const surface = new Prd03PostSurface(POST);
    surface.setEffect("outline", { color: "#ffffff" });
    expect(compiledOutline().color).toEqual([255, 255, 255, 255]);
  });

  test("malformed targets throw POST_FIELD_UNSUPPORTED", () => {
    const surface = new Prd03PostSurface(POST);
    for (const bad of ["rider", [1], [""], [" "]]) {
      expect(() => surface.setEffect("outline", { targets: bad as never })).toThrowError(/targets/);
    }
  });
});
