import type { AuraSceneNode } from "./nodes/types.js";

/**
 * Lane-13 look-lowering slot (consumer: `lowerLookNode` in `sceneMath.ts`).
 *
 * Kept in a leaf module — no agent-api imports — because `lanes/prd13.ts`
 * installs the lowering at module scope and a cyclic import order can run
 * that lane body while `sceneMath.ts` is still mid-initialisation. Holding
 * the slot here keeps `setLookLowering` safe to call in any evaluation
 * order, as long as the caller imports this leaf directly (prd13 does).
 */
export type AuraLookLowering = (node: AuraSceneNode) => readonly AuraSceneNode[] | undefined;

let lookLowering: AuraLookLowering | undefined;

export function setLookLowering(lowering: AuraLookLowering | undefined): void {
  lookLowering = lowering;
}

export function getLookLowering(): AuraLookLowering | undefined {
  return lookLowering;
}
