/**
 * PRD-01 diagnostic-only fields (CONTRACTS.md C-36, §4.1). Every lane-declared
 * builder/renderer field that is pre-declared but not yet consumed by a real
 * code path. Lane 01 removes entries as it wires them; the custodian's option-
 * coverage gate treats listed fields as intentionally non-visual.
 *
 * The barrel (`lanes/prd01.ts`) merges these into DIAGNOSTIC_ONLY_FIELDS at
 * import until the PRD-15 index merge lands.
 */

export const PRD01_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {
  "renderer.output": {
    reason: "C-05 output options are carried for the Phase-4 output pass; until then they are recorded intent only.",
    ownerPrd: 1
  },
  "renderer.resolution": {
    reason: "C-11 render-scale policy is a Phase-2 deliverable; today the render size follows the canvas/pixelRatio path.",
    ownerPrd: 1
  },
  "renderer.msaa": {
    reason: "C-11 MSAA selection belongs to the Phase-2 framebuffer policy.",
    ownerPrd: 1
  },
  "renderer.compile": {
    reason: "C-02/C-27 shader precompile options are consumed by the Phase-3 program generator.",
    ownerPrd: 1
  },
  "renderer.strictMount": {
    reason: "Strict mount is declared on the create options; enforcement rides the Phase-3 renderer surface.",
    ownerPrd: 1
  },
  "renderer.debug": {
    reason: "Renderer debug view options are declared ahead of the Phase-3 frame graph debug wiring.",
    ownerPrd: 1
  },
  "primitive.tessellation": {
    reason: "C-07 tessellation fields land with the Phase-1 primitives rebuild (PR B).",
    ownerPrd: 1
  },
  "material.blend": {
    reason: "C-04 blend modes land in Phase 2; until then only normal alpha compositing is real.",
    ownerPrd: 1
  },
  "material.depthWrite": {
    reason: "Depth-write override rides the Phase-2 render-state surface; the current pipeline derives it from opacity.",
    ownerPrd: 1
  },
  "material.ior": {
    reason: "C-03 IOR feeds the Phase-3 BRDF inputs; declared now, consumed then.",
    ownerPrd: 1
  },
  "transform.rotationOrder": {
    reason: "C-06 Euler order is ZYX today (matches three.js default); XYZ wiring lands with the scene graph.",
    ownerPrd: 1
  },
  "transform.quaternion": {
    reason: "C-06 quaternion transform wins over `rotation` when wired; pre-declared for Phase 1.",
    ownerPrd: 1
  },
  "background.toneMapped": {
    reason: "C-09/C-05 background tone-map coverage flag rides the Phase-4 output pass.",
    ownerPrd: 1
  }
};
