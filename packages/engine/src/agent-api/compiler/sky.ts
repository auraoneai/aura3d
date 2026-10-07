// PRD-07 P3-T5 — C-36 node handler for `kind:"sky"`. Validates the
// AuraSkySpec union, publishes it onto the render source's `atmosphere.sky`
// field (the `prd07.sky` contributor hands it to the C-21 slot each frame),
// records feature("vfx.sky"), and degrades invalid specs with option-ignored.

import type { NodeHandler, RenderSourceContributions, SceneCompileContext } from "../../contracts/compiler";
import type { AuraSkyNode, AuraSkySpec } from "../../contracts/atmosphere";

const SKY_MODELS = new Set(["preetham", "gradient", "hdri", "cubemap"]);

function validSkySpec(spec: AuraSkySpec | undefined): spec is AuraSkySpec {
  return Boolean(spec && typeof spec === "object" && "model" in spec && SKY_MODELS.has((spec as { model: string }).model));
}

export const skyNodeHandler: NodeHandler<{ readonly kind: "sky" }> = {
  kind: "sky",
  owner: "prd07",
  flag: "A3D_QR_VFX_SKY",
  compile(node: { readonly kind: "sky" }, ctx: SceneCompileContext, out: RenderSourceContributions) {
    const skyNode = node as unknown as AuraSkyNode;
    if (!validSkySpec(skyNode.spec)) {
      ctx.degrade({ code: "option-ignored", message: `sky node "${skyNode.name}" has an invalid AuraSkySpec (unknown model)` });
      return;
    }
    out.set("atmosphere", { sky: skyNode.spec });
    out.feature("vfx.sky" as never);
  },
  update(node: { readonly kind: "sky" }, _handle, ctx: SceneCompileContext, out: RenderSourceContributions) {
    const skyNode = node as unknown as AuraSkyNode;
    if (!validSkySpec(skyNode.spec)) {
      ctx.degrade({ code: "option-ignored", message: `sky node "${skyNode.name}" has an invalid AuraSkySpec (unknown model)` });
      return;
    }
    out.set("atmosphere", { sky: skyNode.spec });
  }
};
