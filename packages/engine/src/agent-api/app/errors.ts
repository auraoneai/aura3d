// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — moved from agent-api/index.ts; 5.0 (WP-21) bounds and redacts the message.

import type { AuraAssetRef } from "../nodes/types.js";
import { AuraRuntimeError } from "../compiler/errors.js";
import { formatDiagnosticError, sanitizeDiagnosticText } from "../sanitizeDiagnostics.js";

// Defined in compiler/errors.ts (compiler may not import app/); re-exported
// here so the app/errors.js import surface is unchanged.
export { AuraRuntimeError };

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  // Signed URLs, userinfo and credential-bearing reasons are redacted and bounded.
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${sanitizeDiagnosticText(String(asset.id)).slice(0, 256)}" from "${sanitizeDiagnosticText(String(asset.url))}": ${formatDiagnosticError(reason)}. Suggested fix: run aura3d assets validate and confirm the URL is served by your app.`
  );
}
