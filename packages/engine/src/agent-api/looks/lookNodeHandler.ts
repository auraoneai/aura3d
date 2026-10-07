// PRD-13 T1.13 — the C-36 `"look"` NodeHandler (CONTRACTS §13.1). With the
// required contracts real, a v1 look compiles through the C-09 environment,
// C-13 post and C-26 biome contributions the child nodes route to; with stubs
// it records `capability-degraded` and falls back to emitting the v0 children
// (`expandLookChildren` — the same list the `aura-look:<id>` group carries).
// Feature tag `look.<id>` always lands in `CompiledScene.features`.

import type { NodeHandler, SceneCompileContext } from "../../contracts/compiler.js";
import { nodeHandlerFor } from "../../contracts/compiler.js";
import type { AuraLookNode } from "../../contracts/looks.js";
import { expandLookChildren, resolveLookExpansion } from "./looks.js";

export const lookNodeHandler: NodeHandler<AuraLookNode> = {
  kind: "look",
  owner: "prd13",
  flag: "A3D_QR_LOOKS",

  compile(node: AuraLookNode, ctx: SceneCompileContext, out): void {
    const { expansion, missingContracts } = resolveLookExpansion({ flags: ctx.flags });
    out.feature(`look.${node.look}` as const);
    out.set("look", {
      id: node.look,
      expansion,
      missingContracts: [...missingContracts]
    });

    // The look lowers to scene children; each child routes through its own
    // kind's handler when one exists (environment → C-09 contributions, post →
    // C-13, biome-driven lighting → C-26). Child kinds without a registered
    // handler are skipped — the stub compiler keeps them in the source.
    const children = expandLookChildren(node.look, node.overrides);
    let dispatched = 0;
    for (const child of children) {
      const handler = nodeHandlerFor(child.kind);
      if (handler !== undefined) {
        void handler.compile(child as never, ctx, out);
        dispatched += 1;
      }
    }
    if (missingContracts.length > 0 || dispatched < children.length) {
      ctx.degrade({
        code: "capability-degraded",
        message:
          `look "${node.look}" compiled ${dispatched}/${children.length} children` +
          (missingContracts.length > 0 ? `; v1 contracts missing: ${missingContracts.join(", ")}` : " (v0 fallback)"),
        ownerPrd: 13
      });
    }
  }
};
