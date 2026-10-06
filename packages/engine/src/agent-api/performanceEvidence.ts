// PRD-15 Phase 3 carve-out (CONTRACTS.md §3.2) — verbatim move from agent-api/index.ts; 0 changed logic lines.

import type { AuraHelperBudgetId, AuraHelperPerformanceBudget, AuraSceneNode, AuraSceneSnapshot, AuraSceneKitId, AuraSceneKitBudgetDefaults, AuraSceneEvidence } from "./nodes/types.js";
import { AuraSceneBuilder } from "./nodes/scene.js";
import { flattenSceneSnapshot, normalizeSceneSnapshot } from "./sceneMath.js";
import { sceneKitPerformanceBudgets } from "./devtools/sceneKitBudgets.js";

const helperPerformanceBudgets: readonly AuraHelperPerformanceBudget[] = [
  { helper: "physicsPlayground", maxDrawCalls: 320, maxNodes: 520, targetFpsP50: 50, maxBundleBytes: 18_000, evidence: "50 dynamic cubes plus contact/debug nodes at benchmark capture resolution" },
  { helper: "particleFountain", maxDrawCalls: 64, maxNodes: 24, targetFpsP50: 55, maxBundleBytes: 10_000, evidence: "batched particle effects plus emitter/ground evidence" },
  { helper: "solarSystem", maxDrawCalls: 280, maxNodes: 260, targetFpsP50: 50, maxBundleBytes: 14_000, evidence: "six planet system with orbit rings, leaders, labels, and starfield" },
  { helper: "dataBars3D", maxDrawCalls: 260, maxNodes: 280, targetFpsP50: 50, maxBundleBytes: 16_000, evidence: "6x6 chart with bars, caps, grid, labels, legend, and hover readout" },
  { helper: "neonTunnel", maxDrawCalls: 380, maxNodes: 420, targetFpsP50: 50, maxBundleBytes: 14_000, evidence: "24-ring tunnel with tube rings, wall chords, speed streaks, reflections, bloom, and fog" },
  { helper: "miniGolfHole", maxDrawCalls: 90, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "physics ball, course, obstacle, cup sensor, score, aim, trail, and follow target" },
  { helper: "materialSwatches", maxDrawCalls: 96, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "five material classes with label plinths, reflection cards, bloom, and lab lighting" },
  { helper: "cityBlock", maxDrawCalls: 360, maxNodes: 360, targetFpsP50: 50, maxBundleBytes: 18_000, evidence: "20 buildings with windows, streets, cars, lamps, day/night state markers, and labels" },
  { helper: "lowPolyHumanoid", maxDrawCalls: 96, maxNodes: 42, targetFpsP50: 55, maxBundleBytes: 90_000, evidence: "connected procedural low-poly humanoid with hidden joint balls, contact grounding, and deterministic benchmark pose" },
  { helper: "primitiveHumanoid", maxDrawCalls: 80, maxNodes: 42, targetFpsP50: 55, maxBundleBytes: 12_000, evidence: "hierarchical primitive character with connected chains, joints, path, and contact cues" },
  { helper: "productStage", maxDrawCalls: 96, maxNodes: 48, targetFpsP50: 55, maxBundleBytes: 10_000, evidence: "product plinth, normalized bounds/contact cues, softboxes, and inspection ring" }
] as const;

export const performance = {
  helperBudgets: (): readonly AuraHelperPerformanceBudget[] => helperPerformanceBudgets,
  budgetFor: (helper: AuraHelperBudgetId): AuraHelperPerformanceBudget | undefined =>
    helperPerformanceBudgets.find((budget) => budget.helper === helper),
  sceneKitBudgets: (): Readonly<Record<AuraSceneKitId, AuraSceneKitBudgetDefaults>> => sceneKitPerformanceBudgets,
  budgetForSceneKit: (id: AuraSceneKitId): AuraSceneKitBudgetDefaults => sceneKitPerformanceBudgets[id],
  budgetsForScene: (sceneValue: AuraSceneBuilder | AuraSceneSnapshot): readonly AuraHelperPerformanceBudget[] =>
    createPerformanceEvidence(flattenSceneSnapshot(normalizeSceneSnapshot(sceneValue))).budgets
} as const;

export function createPerformanceEvidence(snapshot: AuraSceneSnapshot): AuraSceneEvidence["performance"] {
  const budgets = collectHelperPerformanceBudgets(snapshot.nodes);
  const nodeCount = snapshot.nodes.length;
  return {
    budgets,
    helperCount: budgets.length,
    nodeBudgetExceeded: budgets
      .filter((budget) => nodeCount > budget.maxNodes && helperNodeCount(snapshot.nodes, budget.helper) > budget.maxNodes)
      .map((budget) => budget.helper)
  };
}

function collectHelperPerformanceBudgets(nodes: readonly AuraSceneNode[]): readonly AuraHelperPerformanceBudget[] {
  const nodeNames = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const hasName = (needle: string) => nodeNames.some((name) => name.includes(needle));
  const helpers = new Set<AuraHelperBudgetId>();
  if (hasName("visible rigid body cube") || hasName("physics collider debug line")) helpers.add("physicsPlayground");
  if (
    hasName("particle collision ground plane") ||
    hasName("fountain collision ground plane") ||
    hasName("particle emission nozzle") ||
    hasName("fountain droplet plume") ||
    hasName("gravity fountain plume")
  ) helpers.add("particleFountain");
  if (hasName("smooth orbit ring") || hasName("readable planet label")) helpers.add("solarSystem");
  if (hasName("height-colored data bar") || hasName("selected metric hover readout")) helpers.add("dataBars3D");
  if (hasName("true circular neon tunnel tube ring") || hasName("neon tunnel")) helpers.add("neonTunnel");
  if (hasName("white physics golf ball") || hasName("score counter")) helpers.add("miniGolfHole");
  if (hasName("mirror chrome metal swatch") || hasName("transparent cyan glass swatch")) helpers.add("materialSwatches");
  if (hasName("city tower") || hasName("day night toggle")) helpers.add("cityBlock");
  if (hasName("authored skinned humanoid character model") || hasName("authored humanoid soft contact shadow") || hasName("low poly humanoid connected anatomical shell") || hasName("low poly shoulder socket cap")) helpers.add("lowPolyHumanoid");
  if (hasName("humanoid head") || hasName("hierarchical primitive humanoid rig")) helpers.add("primitiveHumanoid");
  if (hasName("low matte hero product plinth") || hasName("soft product contact shadow from footprint")) helpers.add("productStage");
  return helperPerformanceBudgets.filter((budget) => helpers.has(budget.helper));
}

function helperNodeCount(nodes: readonly AuraSceneNode[], helper: AuraHelperBudgetId): number {
  const names = nodes.map((node) => "name" in node ? node.name ?? "" : "");
  const count = (predicate: (name: string) => boolean) => names.filter(predicate).length;
  if (helper === "physicsPlayground") return count((name) => name.includes("rigid body cube") || name.includes("physics") || name.includes("collision"));
  if (helper === "particleFountain") return count((name) => name.includes("particle") || name.includes("fountain") || name.includes("emission"));
  if (helper === "solarSystem") return count((name) => name.includes("orbit") || name.includes("planet") || name.includes("star") || name.includes("solar") || name.includes("sun"));
  if (helper === "dataBars3D") return count((name) => name.includes("data bar") || name.includes("chart") || name.includes("axis") || name.includes("legend") || name.includes("hover"));
  if (helper === "neonTunnel") return count((name) => name.includes("neon tunnel") || name.includes("tube ring") || name.includes("speed streak") || name.includes("reflection"));
  if (helper === "miniGolfHole") return count((name) => name.includes("golf") || name.includes("score") || name.includes("cup") || name.includes("obstacle") || name.includes("ball"));
  if (helper === "materialSwatches") return count((name) => name.includes("swatch") || name.includes("material") || name.includes("reflection") || name.includes("clearcoat") || name.includes("glass") || name.includes("rubber"));
  if (helper === "cityBlock") return count((name) => name.includes("city") || name.includes("street") || name.includes("window") || name.includes("crosswalk") || name.includes("sidewalk") || name.includes("lamp") || name.includes("tower"));
  if (helper === "lowPolyHumanoid") return count((name) => name.includes("low poly") || name.includes("humanoid") || name.includes("walking") || name.includes("shoulder") || name.includes("hip") || name.includes("knee") || name.includes("foot") || name.includes("benchmark pose"));
  if (helper === "primitiveHumanoid") return count((name) => name.includes("humanoid") || name.includes("walking") || name.includes("shoulder") || name.includes("hip") || name.includes("knee") || name.includes("foot"));
  return count((name) => name.includes("product") || name.includes("plinth") || name.includes("turntable") || name.includes("softbox") || name.includes("contact shadow"));
}
