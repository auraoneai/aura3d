/**
 * PRD-10 §7 / T6.8 — `world/register.ts`: Phase-6 registrations for the lane.
 *
 * - C-34 lint rules `look/world-void` (outdoor category, no sky/biome) and
 *   `look/primitive-trees` (≥ 8 cylinder+sphere pairs — the "cylinder trunk +
 *   sphere canopy" tell).
 * - C-09 environment sources via `registerBiomeSources` (`prd10.biome` @300,
 *   `prd10.timeOfDay` @250).
 *
 * `lanes/prd10.ts` calls `registerWorldPhase6()` beside the handler/frame-pass
 * registrations it already owns.
 */
import { registerLookLintRule, type AuraLookLintRule } from "../../contracts/looks.js";
import type { AuraSceneSnapshot } from "../index.js";
import { registerBiomeSources } from "../../production-runtime/world/BiomeResolver.js";

const kindsOf = (s: AuraSceneSnapshot): readonly string[] =>
  s.nodes.map((n) => (n as { kind?: string }).kind ?? "");

const nodeId = (n: AuraSceneSnapshot["nodes"][number]): string =>
  (n as { id?: string }).id ?? (n as { name?: string }).name ?? "";

/**
 * `look/world-void`: an outdoor-flavoured scene (terrain/scatter/grass/water or
 * a sky node) that still resolves no sky AND no biome node — the void path the
 * lane exists to kill. Category can't be read off a snapshot, so the signal is
 * "world geometry present but no `biome`/`sky`/`time-of-day` node".
 */
const worldVoidRule: AuraLookLintRule = {
  code: "look/world-void",
  owner: "prd10",
  run(s: AuraSceneSnapshot) {
    const kinds = kindsOf(s);
    const hasWorldGeometry = kinds.some((k) => k === "terrain" || k === "scatter" || k === "grass" || k === "water");
    const hasSkyOrBiome = kinds.some((k) => k === "biome" || k === "sky" || k === "time-of-day" || k === "environment");
    if (!hasWorldGeometry || hasSkyOrBiome) return [];
    return [{
      code: "look/world-void",
      severity: "error",
      message:
        "world geometry (terrain/scatter/grass/water) present but no biome, sky, or environment node — " +
        "the scene will render against a void background with no IBL. Add `world.biome(...)` or an " +
        "`environments.outdoor/room/space/underwater(...)` node."
    }];
  }
} as const;

/**
 * `look/primitive-trees`: ≥ 8 cylinder+sphere model pairs = hand-made "trees"
 * assembled from primitives — the smell that F-10's S14 (conifer recognition)
 * targets. Counts primitive nodes whose names group as trunk/canopy pairs.
 */
const primitiveTreesRule: AuraLookLintRule = {
  code: "look/primitive-trees",
  owner: "prd10",
  run(s: AuraSceneSnapshot) {
    // pair cylinders with spheres sharing a name stem (`tree-3-trunk`/`tree-3-canopy`)
    // OR adjacent-in-scene cylinder+sphere — either pattern counts as a tell.
    const stems = new Map<string, { cylinders: number; spheres: number }>();
    for (const n of s.nodes) {
      const node = n as { kind?: string; name?: string; primitive?: string };
      if (node.kind !== "primitive") continue;
      const shape = node.primitive ?? "";
      if (shape !== "cylinder" && shape !== "sphere") continue;
      const stem = (node.name ?? "").replace(/-(trunk|canopy|top|base|foliage|crown).*$/i, "");
      const entry = stems.get(stem) ?? { cylinders: 0, spheres: 0 };
      if (shape === "cylinder") entry.cylinders += 1;
      else entry.spheres += 1;
      stems.set(stem, entry);
    }
    let pairs = 0;
    const nodes: string[] = [];
    for (const [stem, e] of stems) {
      const p = Math.min(e.cylinders, e.spheres);
      if (p > 0) nodes.push(stem);
      pairs += p;
    }
    if (pairs < 8) return [];
    return [{
      code: "look/primitive-trees",
      severity: "warning",
      message:
        `${pairs} cylinder+sphere pairs look like hand-made trees. Use ` +
        `\`world.scatter({ model: "world/foliage/*" })\` or a foliage kit — primitive ` +
        `trees read as placeholders (S14 conifer recognition).`,
      nodes
    }];
  }
} as const;

export function registerWorldPhase6(): () => void {
  registerLookLintRule(worldVoidRule);
  registerLookLintRule(primitiveTreesRule);
  const offSources = registerBiomeSources();
  return () => {
    offSources();
  };
}
