/**
 * Lane prd01 barrel (CONTRACTS.md §3.8, §4.1). Rendering core / color / HDR /
 * PBR. Phase 0 (PR A): register the C-31 diagnostics sections, the C-38
 * `output` app extension (stub surface), and merge this lane's
 * diagnostic-only fields into the custodian's DIAGNOSTIC_ONLY_FIELDS (the PR 0a
 * "PRD 15 index merges" hook does not exist yet — the merge happens here).
 */

// 01-HANG / #1140: rendering's lane providers (C-02 real ProgramCache, C-07,
// C-08, generator install) must be in createAuraApp's static import graph.
// Reached only through the side-effect-free `@aura3d/rendering` index, Rollup
// moved them into a lazy chunk (prd06's `import("@aura3d/rendering")`), so a
// production bundle mounted on the stub cache and compiled per draw per frame.
import "@aura3d/rendering/lanes";
import { registerDiagnosticsSection } from "../contracts/diagnostics.js";
import { registerAppExtension } from "../contracts/app.js";
import { DIAGNOSTIC_ONLY_FIELDS, registerOptionCoverage } from "../contracts/compiler.js";
import { PRD01_DIAGNOSTIC_ONLY_FIELDS } from "../agent-api/compiler/diagnosticOnly.prd01.js";
import { collectFrameAllocations, collectOutput, collectPrograms, collectResolution } from "./prd01/diagnostics.js";
import { createPrd01OutputSurface, disposePrd01OutputSurface } from "./prd01/outputSurface.js";

// C-05 URL reader (Phase 5, §14): `?aura3d-tonemap=aces|agx` (+ `aura3d-exp=<n>`),
// implemented beside the surface it feeds and re-exported here as spec'd.
export { readAura3dTonemapQuery } from "./prd01/outputSurface.js";

const diagnosticOnlyTarget = DIAGNOSTIC_ONLY_FIELDS as Record<string, { readonly reason: string; readonly ownerPrd: number }>;
for (const [key, entry] of Object.entries(PRD01_DIAGNOSTIC_ONLY_FIELDS)) {
  diagnosticOnlyTarget[key] ??= entry;
}

// 01-T1.5 (C-06): rotationOrder/quaternion are consumed by compiler/sceneGraph.ts
// under A3D_QR_CORE, so they leave the diagnostic-only table (including the
// PR 0a seed rows) and get option-coverage rows instead.
for (const key of ["transform.rotationOrder", "transform.quaternion"]) {
  delete diagnosticOnlyTarget[key];
}
registerOptionCoverage([
  { builder: "transform", field: "rotationOrder", probeValueA: "ZYX", probeValueB: "XYZ", ownerPrd: 1 },
  { builder: "transform", field: "quaternion", probeValueA: [0, 0, 0, 1], probeValueB: [0, Math.SQRT1_2, 0, Math.SQRT1_2], ownerPrd: 1 }
]);

registerDiagnosticsSection({ id: "prd01.output", owner: "prd01", flag: "A3D_QR_CORE", key: "output", collect: collectOutput });
registerDiagnosticsSection({ id: "prd01.resolution", owner: "prd01", flag: "A3D_QR_CORE", key: "resolution", collect: collectResolution });
registerDiagnosticsSection({ id: "prd01.programs", owner: "prd01", flag: "A3D_QR_CORE", key: "programs", collect: collectPrograms });
registerDiagnosticsSection({ id: "prd01.frameAllocations", owner: "prd01", flag: "A3D_QR_CORE", key: "frameAllocations", collect: collectFrameAllocations });

registerAppExtension({
  id: "prd01.output",
  owner: "prd01",
  flag: "A3D_QR_CORE",
  member: "output",
  create: (app, ctx) => createPrd01OutputSurface(app, ctx),
  dispose: (value) => disposePrd01OutputSurface(value)
});
