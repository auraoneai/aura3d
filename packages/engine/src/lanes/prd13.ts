/**
 * Lane prd13 barrel — owned by lane 13 (CONTRACTS.md §3.8). `provide()` calls
 * for that lane's real implementations live here; empty in PR 0a.
 *
 * T1.1: v0 look preset data (`agent-api/looks/lookPresets.ts`). Pure frozen
 * data — no behaviour is gated here; `A3D_QR_LOOKS` gates consumers in
 * T1.6+ (generatedCodeWarnings) and T1.13 (the C-36 NodeHandler).
 */
export { lookPresets, lookPresetIds } from "../agent-api/looks/lookPresets.js";
export type { AuraLookPreset, AuraLookV0Expansion } from "../agent-api/looks/lookPresets.js";
