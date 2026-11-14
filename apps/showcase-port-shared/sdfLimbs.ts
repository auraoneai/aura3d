/**
 * Showcase compatibility shim: the G1 SDF limb chains now ship in the engine as part of the public
 * `@aura3d/engine/sculpt` subpath (packages/engine/src/sculpt/sdfLimbs.ts). Kept so existing
 * showcase/example import paths keep resolving; new code should import from "@aura3d/engine/sculpt".
 */
export {
  limbChainTagger,
  sculptPaintedLimbChain,
  sculptSdfLimbChainMesh,
  smoothVertexColors,
  splitMeshByTag,
  type SdfLimbCapsule,
  type SdfLimbChain,
  type SdfMittenHand
} from "@aura3d/engine/sculpt";
