// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef } from "../nodes/types.js";
import { AuraRuntimeError } from "../compiler/errors.js";

// Defined in compiler/errors.ts (compiler may not import app/); re-exported
// here so the app/errors.js import surface is unchanged.
export { AuraRuntimeError };

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${asset.id}" from "${asset.url}": ${reason}. Suggested fix: run aura3d assets validate and confirm the URL is served by your app.`
  );
}
