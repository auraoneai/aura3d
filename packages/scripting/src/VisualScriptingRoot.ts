/**
 * muse3jsparity-PRD O2 — root `visualScripting` builder proposal (package side).
 *
 * This module owns everything the root builder needs WITHOUT touching
 * `packages/engine/src/agent-api/index.ts`:
 *
 * - `createVisualScriptingGraph(nodes, edges)` — validate + retain a graph.
 * - `attachVisualScriptingGraph(graph, context)` — execute against a
 *   deterministic gameplay context (input must visibly change state: the
 *   caller folds `game.*` side effects into `VisualGameplayState`).
 * - `serialize`/`deserialize` round-trip with stability proof.
 * - `applyVisualGameplaySideEffects(state, result)` — the unit-testable
 *   "graph changes gameplay state" step (browser proof stays a K1 spec).
 * - `listVisualScriptingNodeCatalog()` — node catalog grouped by category
 *   with typed-backend evidence per node (O2 docs requirement, code side).
 *
 * Root wiring is a re-export hunk in agent-api (reported, not applied):
 * `export const visualScripting = { graph, attach, catalog, gameplay }`.
 */
import { VisualGraphExecutor, type VisualExecutionResult } from "./VisualGraphExecutor";
import {
  deserializeGraph,
  serializeGraph,
  validateGraph,
  type SerializedVisualGraph,
  type VisualEdge,
  type VisualGraph
} from "./VisualGraph";
import { createVisualNode, listVisualNodeDefinitions, type VisualNodeDefinition } from "./VisualNodeCatalog";
import type {
  VisualGraphExecutionContext,
  VisualObjectiveState
} from "./VisualGraphContext";
import type { VisualNode } from "./VisualNode";

export interface VisualScriptingGraphSpec {
  readonly nodes: readonly VisualNode[];
  readonly edges?: readonly VisualEdge[];
}

export interface VisualScriptingRoundTrip {
  readonly serialized: SerializedVisualGraph;
  readonly stable: boolean;
}

export interface VisualScriptingGraphHandle {
  readonly graph: VisualGraph;
  attach(context?: VisualGraphExecutionContext): VisualExecutionResult;
  roundTrip(): VisualScriptingRoundTrip;
}

export interface VisualGameplayTimer {
  elapsed: number;
  duration: number;
  running: boolean;
}

export interface VisualGameplayState {
  readonly scores: Record<string, number>;
  readonly objectives: Record<string, VisualObjectiveState["status"]>;
  readonly machines: Record<string, string>;
  readonly timers: Record<string, VisualGameplayTimer>;
  readonly events: string[];
}

export interface VisualScriptingCatalogGroup {
  readonly category: VisualNodeDefinition["category"];
  readonly kinds: readonly VisualNodeDefinition[];
}

export interface SerializedVisualNodeCatalogEntry {
  readonly kind: string;
  readonly category: VisualNodeDefinition["category"];
  readonly title: string;
  readonly description: string;
  readonly inputs: readonly { readonly id: string; readonly type: string; readonly optional?: boolean }[];
  readonly outputs: readonly { readonly id: string; readonly type: string; readonly optional?: boolean }[];
  /** Typed-backend evidence paths (O2 docs requirement: every node names its backend). */
  readonly evidence: readonly string[];
}

export interface SerializedVisualNodeCatalog {
  readonly generatedBy: string;
  readonly nodeKindCount: number;
  readonly categories: readonly {
    readonly category: VisualNodeDefinition["category"];
    readonly kinds: readonly SerializedVisualNodeCatalogEntry[];
  }[];
}

const GAMEPLAY_SIDE_EFFECT_PREFIXES = ["game.", "ai.", "combat.", "animation.", "camera.", "physics.", "runtime.", "evidence."] as const;

export function createVisualNodeForGraph(kind: string, id: string, data?: Readonly<Record<string, unknown>>): VisualNode {
  return createVisualNode(kind, id, data);
}

export function createVisualScriptingGraph(spec: VisualScriptingGraphSpec): VisualScriptingGraphHandle {
  const graph: VisualGraph = { nodes: [...spec.nodes], edges: [...(spec.edges ?? [])] };
  const errors = validateGraph(graph);
  if (errors.length > 0) throw new Error(`Invalid visual scripting graph: ${errors.join("; ")}`);
  return {
    graph,
    attach: (context: VisualGraphExecutionContext = {}) => attachVisualScriptingGraph(graph, context),
    roundTrip: () => roundTripVisualScriptingGraph(graph)
  };
}

export function attachVisualScriptingGraph(
  graph: VisualGraph,
  context: VisualGraphExecutionContext = {}
): VisualExecutionResult {
  return new VisualGraphExecutor(context).execute(graph, context);
}

export function roundTripVisualScriptingGraph(graph: VisualGraph): VisualScriptingRoundTrip {
  const serialized = serializeGraph(graph);
  const revived = deserializeGraph(JSON.parse(JSON.stringify(serialized)) as SerializedVisualGraph);
  const reserialized = serializeGraph(revived);
  return {
    serialized,
    stable: JSON.stringify(serialized) === JSON.stringify(reserialized)
  };
}

export function createVisualGameplayState(): VisualGameplayState {
  return { scores: {}, objectives: {}, machines: {}, timers: {}, events: [] };
}

export function applyVisualGameplaySideEffects(state: VisualGameplayState, result: VisualExecutionResult): number {
  let applied = 0;
  for (const effect of result.sideEffects) {
    const payload = (effect.payload ?? {}) as Readonly<Record<string, unknown>>;
    switch (effect.kind) {
      case "game.addScore": {
        const player = String(payload.playerId ?? "");
        const points = Number(payload.points ?? 0);
        if (player.length > 0 && Number.isFinite(points)) {
          state.scores[player] = (state.scores[player] ?? 0) + points;
          applied += 1;
        }
        break;
      }
      case "game.setObjective": {
        const id = String(payload.objectiveId ?? "");
        const status = String(payload.status ?? "");
        if (id.length > 0 && (status === "active" || status === "complete" || status === "failed")) {
          state.objectives[id] = status;
          applied += 1;
        }
        break;
      }
      case "game.setState": {
        const id = String(payload.machineId ?? "");
        const next = String(payload.state ?? "");
        if (id.length > 0 && next.length > 0) {
          state.machines[id] = next;
          applied += 1;
        }
        break;
      }
      case "game.startTimer": {
        const id = String(payload.timerId ?? "");
        const duration = Number(payload.duration ?? 0);
        if (id.length > 0 && Number.isFinite(duration) && duration >= 0) {
          state.timers[id] = { elapsed: 0, duration, running: true };
          applied += 1;
        }
        break;
      }
      default: {
        if (GAMEPLAY_SIDE_EFFECT_PREFIXES.some((prefix) => effect.kind.startsWith(prefix))) {
          state.events.push(`${effect.kind}:${String(effect.target ?? effect.nodeId)}`);
          applied += 1;
        }
        break;
      }
    }
  }
  return applied;
}

/**
 * Machine-readable node catalog with per-node evidence (O2 docs box, code side).
 *
 * Every entry carries its typed-backend evidence paths straight from
 * `VisualNodeDefinition.oldBranchSource` — a node with no backend path is a
 * catalog bug, not a silent omission. `docs/api/visual-scripting-catalog.json`
 * is generated from this function and must never be hand-edited.
 */
export function serializeVisualNodeCatalog(): SerializedVisualNodeCatalog {
  const groups = listVisualScriptingNodeCatalog();
  return {
    generatedBy: "packages/scripting/scripts/generate-visual-node-catalog.ts — do not hand-edit; regenerate with pnpm exec tsx packages/scripting/scripts/generate-visual-node-catalog.ts",
    nodeKindCount: groups.reduce((total, group) => total + group.kinds.length, 0),
    categories: groups.map((group) => ({
      category: group.category,
      kinds: group.kinds.map((definition) => ({
        kind: definition.kind,
        category: definition.category,
        title: definition.title,
        description: definition.description,
        inputs: definition.ports
          .filter((port) => port.direction === "input")
          .map((port) => ({ id: port.id, type: port.type, ...(port.optional === true ? { optional: true as const } : {}) })),
        outputs: definition.ports
          .filter((port) => port.direction === "output")
          .map((port) => ({ id: port.id, type: port.type, ...(port.optional === true ? { optional: true as const } : {}) })),
        evidence: [...definition.oldBranchSource]
      }))
    }))
  };
}

export function listVisualScriptingNodeCatalog(): readonly VisualScriptingCatalogGroup[] {
  const groups = new Map<VisualNodeDefinition["category"], VisualNodeDefinition[]>();
  for (const definition of listVisualNodeDefinitions()) {
    const group = groups.get(definition.category) ?? [];
    group.push(definition);
    groups.set(definition.category, group);
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, kinds]) => ({
      category,
      kinds: kinds.sort((a, b) => a.kind.localeCompare(b.kind))
    }));
}
