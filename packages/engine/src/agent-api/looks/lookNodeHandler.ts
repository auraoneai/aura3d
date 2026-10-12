// PRD-13 T1.13 — the C-36 `"look"` NodeHandler (CONTRACTS §13.1). The look's
// env/light/fog/grade/bloom children reach pixels through the flatten-time
// lowering (`setLookLowering`, registered by the prd13 barrel): flatten keeps
// this node and splices `expandLookChildren` after it, so each child compiles
// through its own kind's handler and the legacy bridge draws it. This handler
// only tags `look.<id>`, records the applied look for diagnostics, and reports
// `capability-degraded` when v1 contracts are stubbed.
//
// QR-13 pixels fix: the handler used to re-dispatch the children to their
// lane handlers itself, but those handlers only record features (prd02's
// light handler defers to the authored-node light path), so a v1 look's key
// light, HDRI, fog and grade existed only as diagnostics.

import type { NodeHandler, SceneCompileContext } from "../../contracts/compiler.js";
import type { AuraLookNode } from "../../contracts/looks.js";
import type { AuraSceneNode } from "../nodes/types.js";
import { AuraNodeBuilder } from "../nodes/builder.js";
import { looks, resolveLookExpansion } from "./looks.js";

/** Flatten-time lowering of a v1 look node into the v0 `aura-look:<id>`
 *  group (children + horizon backdrop) the flag-off path authors. */
export function lowerLookNodeChildren(node: AuraSceneNode): readonly AuraSceneNode[] | undefined {
  const look = node as unknown as Partial<AuraLookNode>;
  if (look.kind !== "look" || typeof look.look !== "string") return undefined;
  try {
    const group = looks.preset(look.look, look.overrides, { expansion: "v0" });
    return [group instanceof AuraNodeBuilder ? group.toJSON() : (group as unknown as AuraSceneNode)];
  } catch {
    return undefined; // unknown id: leave the node for the compiler's degrade path
  }
}

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
    if (missingContracts.length > 0) {
      ctx.degrade({
        code: "capability-degraded",
        message: `look "${node.look}" lowered to v0 children; v1 contracts missing: ${missingContracts.join(", ")}`,
        ownerPrd: 13
      });
    }
  }
};
