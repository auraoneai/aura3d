/**
 * Lane prd02 barrel — owned by lane 02 (CONTRACTS.md §3.8). Re-exports the
 * flag-path lighting/shadow resolvers and registers the lane's C-34 look
 * lint rule `look/ambient-flattens`; engine composition (environment
 * resolution, lighting runtime) lands in later PR-B/C phases.
 */
import { registerLookLintRule } from "../contracts/looks.js";
import type { AuraLightNode, AuraSceneNode } from "../agent-api/index.js";
import { groups } from "../agent-api/index.js";

export {
  physicalLightDescriptor,
  selectShadowedLights,
  resolveLightingTier,
  type PhysicalLightDescriptor,
  type ShadowedLightSelection
} from "../agent-api/compiler/lights.js";
export {
  resolveShadowSystemConfig,
  sceneShadowRadius,
  type ShadowSystemConfig
} from "../agent-api/compiler/shadows.js";

/**
 * C-34 `look/ambient-flattens` (PRD-02): an ambient light stronger than 1
 * while an environment node supplies IBL flattens the scene — the ambient
 * term adds the same radiance everywhere and washes out the probe's
 * directionality. Fires only when BOTH are present.
 */
registerLookLintRule({
  code: "look/ambient-flattens",
  owner: "prd02",
  run(snapshot) {
    const nodes = groups.flatten(snapshot.nodes as readonly AuraSceneNode[]);
    const hasEnvironment = nodes.some((n) => n.kind === "environment");
    if (!hasEnvironment) return [];
    const offenders = nodes.filter(
      (n): n is AuraLightNode => n.kind === "light" && n.light === "ambient" && (n.intensity ?? 0) > 1
    );
    if (offenders.length === 0) return [];
    return [{
      code: "look/ambient-flattens",
      severity: "warning",
      message: "Ambient light intensity > 1 flattens the environment's IBL; prefer the environment for ambient fill.",
      nodes: offenders.map((n) => n.name ?? "ambient")
    }];
  }
});
