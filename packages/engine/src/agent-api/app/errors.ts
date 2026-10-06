// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraAssetRef } from "../nodes/types.js";
import { model } from "../nodes/model.js";

export class AuraRuntimeError extends Error {
  readonly code:
    | "missing-canvas"
    | "missing-asset"
    | "failed-glb-load"
    | "unsupported-texture"
    | "backend-fallback";

  constructor(code: AuraRuntimeError["code"], message: string) {
    super(message);
    this.name = "AuraRuntimeError";
    this.code = code;
  }
}

export function createAuraAssetLoadError(asset: AuraAssetRef<"model">, reason: string): AuraRuntimeError {
  return new AuraRuntimeError(
    "failed-glb-load",
    `Aura3D failed to load GLB asset "${asset.id}" from "${asset.url}": ${reason}. Suggested fix: run aura3d assets validate and confirm the URL is served by your app.`
  );
}
