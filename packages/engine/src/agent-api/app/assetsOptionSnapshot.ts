// Internal (not exported from any public barrel): moved out of contracts/assets.ts
// on 2026-11-02 so the in-repo "." view (export * from contracts) matches the
// published union — the helper is @internal per docs/api/stability-policy.md.
import type { AuraAssetsOption } from "../../contracts/assets.js";

/** @internal Capture the app-owned generation before mounting or transferring. */
export function snapshotAuraAssetsOption(options: AuraAssetsOption | undefined): AuraAssetsOption | undefined {
  if (options === undefined) return undefined;
  const { securityContext, ...otherOptions } = options;
  if (securityContext !== undefined && (typeof securityContext !== "string" || !securityContext.trim())) {
    throw new TypeError("Asset securityContext must be a non-empty authentication generation");
  }
  return {
    ...otherOptions,
    ...(securityContext === undefined ? {} : { securityContext })
  };
}
