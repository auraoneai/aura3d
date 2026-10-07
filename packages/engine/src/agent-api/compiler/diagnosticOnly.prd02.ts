// PRD-02 diagnostic-only fields (C-36). The lane's seeded entries are removed
// from `DIAGNOSTIC_ONLY_FIELDS` (contracts/compiler.ts, owner prd15) as PRD 02
// wires them:
//
//   "light.power"  — WIRED. Consumed by `physicalLightDescriptor` (lumens →
//   candela: point `power / 4π`, spot `power / π`) in compiler/lights.ts.
//   The seed row in contracts/compiler.ts is stale; removal is qr-request
//   Q-15 (that file is a prd15 path).
//
// No remaining diagnostic-only fields owned by PRD 02 as of Phase 2.

export const PRD02_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: 2 }>> = {};
