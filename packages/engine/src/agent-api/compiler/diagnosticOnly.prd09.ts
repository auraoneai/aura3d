/**
 * PRD-09 — C-36 diagnostic-only option fields, merge record.
 * Merged into DIAGNOSTIC_ONLY_FIELDS by lanes/prd09.ts.
 */
export const PRD09_DIAGNOSTIC_ONLY_FIELDS: Readonly<Record<string, { readonly reason: string; readonly ownerPrd: number }>> = {  "camera.up": { reason: "C-22/CCR-08-1 (#228): recorded on AuraCameraSpec; no runtime consumer until Q-15-1", ownerPrd: 9 },
  "camera.roll": { reason: "C-22/CCR-08-1 (#228): recorded on AuraCameraSpec; no runtime consumer until Q-15-1", ownerPrd: 9 }
};
