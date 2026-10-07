/**
 * C-35 — `auditArtDirection`: compares the mounted scene (a
 * `snapshotForAudit` result) with the art direction contract. Every rule maps
 * to a §7.1 validator rule; violations carry the offending node/asset keys in
 * `nodes` so `scripts/check-art-direction.mjs` can print actionable output.
 */

import type { ArtDirectionSnapshot } from "./snapshot";
import type { GameArtDirection } from "./define";

export type ArtDirectionRule =
  | "ambient-light" | "missing-environment" | "no-shadowed-key" | "too-many-practicals"
  | "asset-under-min-triangles" | "asset-unlit-card" | "asset-texture-override" | "asset-not-in-contract"
  | "draws-over-tier-budget" | "emissive-fill" | "capture-branch";

/** Structural subtype of the frozen C-35 `ArtDirectionViolation`
 * (`{ rule: string; message: string; nodes?: readonly string[] }`) with the
 * rule narrowed to the §7.1 union. */
export interface ArtDirectionViolation {
  readonly rule: ArtDirectionRule;
  readonly message: string;
  readonly nodes?: readonly string[];
}

export interface AuditArtDirectionOptions {
  /** Measured draw-call ceiling for the tier being audited (from
   *  `games.json` `budgets.drawCalls[tier]`). When provided, enables the
   *  `draws-over-tier-budget` rule. */
  readonly drawCallsBudget?: number;
}

const SHADOWED_SPOT_GENRES: readonly string[] = ["stealth", "underwater-salvage"];

/** Compares the art direction with the mounted-scene snapshot. */
export function auditArtDirection(
  direction: GameArtDirection,
  snapshot: ArtDirectionSnapshot,
  options: AuditArtDirectionOptions = {}
): readonly ArtDirectionViolation[] {
  const violations: ArtDirectionViolation[] = [];
  const fail = (rule: ArtDirectionRule, message: string, nodes?: readonly string[]): void => {
    violations.push({ rule, message, ...(nodes !== undefined ? { nodes } : {}) });
  };

  // Lighting rules.
  if (snapshot.hasAmbient) {
    fail("ambient-light", "scene mounts an ambient light; art direction requires IBL fill");
  }
  if (snapshot.environment.kind === "none") {
    fail("missing-environment", "scene mounts no environment node (hdri or preset required)");
  }
  const shadowed = snapshot.lights.filter((light) => light.shadow);
  const maxShadowed = SHADOWED_SPOT_GENRES.includes(direction.genre) && direction.lighting.key.type === "spot" ? 3 : 1;
  if (shadowed.length === 0) {
    fail("no-shadowed-key", "scene mounts no shadowed light; the art direction key light must cast");
  } else if (shadowed.length > maxShadowed) {
    fail(
      "too-many-practicals",
      `scene mounts ${shadowed.length} shadowed lights; at most ${maxShadowed} allowed for genre "${direction.genre}"`,
      shadowed.map((light) => light.type)
    );
  }
  const nonKey = snapshot.lights.length - 1;
  if (nonKey > direction.lighting.practicals) {
    fail(
      "too-many-practicals",
      `scene mounts ${nonKey} non-key lights; the art direction allows ${direction.lighting.practicals} practicals`,
      snapshot.lights.slice(1).map((light) => light.type)
    );
  }

  // Asset rules.
  const contracted = new Map(direction.assets.map((asset) => [asset.assetKey, asset]));
  const underMin: string[] = [];
  const unlitCards: string[] = [];
  const textureOverrides: string[] = [];
  const notInContract: string[] = [];
  for (const model of snapshot.models) {
    const contract = contracted.get(model.assetKey);
    if (contract === undefined) {
      notInContract.push(model.assetKey);
      continue;
    }
    if (contract.minTriangles !== undefined && model.triangles > 0 && model.triangles < contract.minTriangles) {
      underMin.push(`${model.assetKey} (${model.triangles} < ${contract.minTriangles})`);
    }
    if (model.unlit && model.triangles <= 4) unlitCards.push(model.assetKey);
    if (model.overridesTextures) textureOverrides.push(model.assetKey);
  }
  if (underMin.length > 0) fail("asset-under-min-triangles", `assets below their contracted triangle floor: ${underMin.join(", ")}`, underMin);
  if (unlitCards.length > 0) fail("asset-unlit-card", `unlit 4-triangle card assets mounted as visible roles: ${unlitCards.join(", ")}`, unlitCards);
  if (textureOverrides.length > 0) fail("asset-texture-override", `texture overrides wipe authored maps: ${textureOverrides.join(", ")}`, textureOverrides);
  if (notInContract.length > 0) fail("asset-not-in-contract", `mounted assets missing from the art direction: ${notInContract.join(", ")}`, notInContract);

  // Emissive-as-fill: non-practical materials glowing above the authored
  // threshold are fill light smuggled into materials.
  const emissiveFill = (snapshot.materials ?? [])
    .filter((material) => (material.emissiveIntensity ?? 0) > 0.1 && material.practical !== true && material.lightSource !== true)
    .map((material) => material.node ?? material.name ?? "unnamed");
  if (emissiveFill.length > 0) {
    fail("emissive-fill", `non-practical materials with emissiveIntensity > 0.1: ${emissiveFill.join(", ")}`, emissiveFill);
  }

  // Draw budget (when the caller supplies the tier's ceiling).
  if (options.drawCallsBudget !== undefined && snapshot.drawCalls > options.drawCallsBudget) {
    fail("draws-over-tier-budget", `drawCalls ${snapshot.drawCalls} exceeds the tier budget ${options.drawCallsBudget}`);
  }

  return violations;
}
