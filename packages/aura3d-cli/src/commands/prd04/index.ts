/**
 * C-39 lane command registrations — prd04 registers its `aura3d` codemods
 * here via registerCodemod (CONTRACTS.md §C-39): `pin-emissive-defaults`
 * (rewrites emissive literals) and `prd04-model-tint-report` (report-only
 * tint-site census).
 */
import "./pinEmissiveDefaults";
import "./modelTintReport";

export {};
