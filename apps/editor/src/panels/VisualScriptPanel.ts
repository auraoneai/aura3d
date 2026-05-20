import { createVisualNode, listVisualNodeDefinitions, VisualGraphExecutor, type VisualGraph } from "@galileo3d/scripting";
import type { EditorShell } from "../EditorShell";

export interface VisualScriptPanelSnapshot {
  readonly nodeCount: number;
  readonly edgeCount: number;
  readonly categoryCount: number;
  readonly nodeKinds: readonly string[];
  readonly catalogSize: number;
  readonly selectedOutput: string;
  readonly loopIndices: readonly number[];
  readonly blockedClaims: readonly string[];
  readonly evidence: {
    readonly oldCodebasePort: boolean;
    readonly editorVisibleGraph: boolean;
    readonly mathLogicFlowCatalog: boolean;
    readonly deterministicExecution: boolean;
    readonly blockedUnityUnrealVisualScriptingParity: boolean;
  };
}

export class VisualScriptPanel {
  readonly element = document.createElement("section");
  private readonly graph: VisualGraph = createStarterGraph();
  private readonly executor = new VisualGraphExecutor();
  private snapshotCache = this.execute();

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel visual-script-panel";
    this.element.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).dataset.action;
      if (action === "run-visual-graph") {
        this.snapshotCache = this.execute();
        this.shell.addConsoleMessage("info", "Visual script graph executed.");
        this.shell.refresh();
      }
    });
  }

  render(): void {
    const snapshot = this.snapshot();
    const definitions = listVisualNodeDefinitions();
    const categories = [...new Set(definitions.map((definition) => definition.category))].sort();
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Visual Script</span>
        <button data-action="run-visual-graph" title="Run visual graph">Run</button>
      </div>
      <div class="visual-script-summary" data-role="visual-script-summary">
        <span>${snapshot.nodeCount} nodes</span>
        <span>${snapshot.edgeCount} edges</span>
        <span>${snapshot.catalogSize} catalog nodes</span>
        <span>${categories.join(" / ")}</span>
      </div>
      <div class="visual-node-list">
        ${this.graph.nodes.map((node) => `
          <div class="visual-node-card" data-node-kind="${escapeHtml(node.kind)}">
            <strong>${escapeHtml(node.kind)}</strong>
            <span>${node.ports.filter((port) => port.direction === "input").length} in / ${node.ports.filter((port) => port.direction === "output").length} out</span>
          </div>
        `).join("")}
      </div>
      <dl class="visual-output-list" data-role="visual-output-list">
        <dt>Selected</dt><dd>${escapeHtml(snapshot.selectedOutput)}</dd>
        <dt>Loop</dt><dd>${snapshot.loopIndices.join(", ")}</dd>
        <dt>Claims</dt><dd>${snapshot.blockedClaims.length} blocked</dd>
      </dl>
    `;
  }

  snapshot(): VisualScriptPanelSnapshot {
    return this.snapshotCache;
  }

  private execute(): VisualScriptPanelSnapshot {
    const result = this.executor.execute(this.graph);
    const definitions = listVisualNodeDefinitions();
    return {
      nodeCount: this.graph.nodes.length,
      edgeCount: this.graph.edges.length,
      categoryCount: new Set(definitions.map((definition) => definition.category)).size,
      nodeKinds: result.nodeKinds,
      catalogSize: definitions.length,
      selectedOutput: String(result.values.get("label") ?? ""),
      loopIndices: asNumberArray(result.values.get("loop.indices")),
      blockedClaims: result.blockedClaims,
      evidence: {
        oldCodebasePort: definitions.some((definition) => definition.oldBranchSource.some((source) => source.includes("FlowNodes.ts"))),
        editorVisibleGraph: this.graph.nodes.length >= 6 && this.graph.edges.length >= 5,
        mathLogicFlowCatalog: definitions.some((definition) => definition.category === "math") &&
          definitions.some((definition) => definition.category === "logic") &&
          definitions.some((definition) => definition.category === "flow"),
        deterministicExecution: result.values.get("label") === "fast" && JSON.stringify(result.values.get("loop.indices")) === JSON.stringify([0, 1, 2]),
        blockedUnityUnrealVisualScriptingParity: result.blockedClaims.includes("Unity Visual Scripting parity") &&
          result.blockedClaims.includes("Unreal Blueprint parity")
      }
    };
  }
}

function createStarterGraph(): VisualGraph {
  return {
    nodes: [
      createVisualNode("const", "speed", { value: 42 }),
      createVisualNode("const", "scale", { value: 1.5 }),
      createVisualNode("multiply", "scaled-speed"),
      createVisualNode("greater", "is-fast", { b: 50 }),
      createVisualNode("const", "fast-label", { value: "fast" }),
      createVisualNode("const", "slow-label", { value: "slow" }),
      createVisualNode("select", "label"),
      createVisualNode("branch", "branch"),
      createVisualNode("forRange", "loop", { startIndex: 0, endIndex: 3 }),
      createVisualNode("gate", "gate", { startClosed: false })
    ],
    edges: [
      { fromNode: "speed", fromPort: "out", toNode: "scaled-speed", toPort: "a" },
      { fromNode: "scale", fromPort: "out", toNode: "scaled-speed", toPort: "b" },
      { fromNode: "scaled-speed", fromPort: "out", toNode: "is-fast", toPort: "a" },
      { fromNode: "is-fast", fromPort: "out", toNode: "label", toPort: "condition" },
      { fromNode: "fast-label", fromPort: "out", toNode: "label", toPort: "ifTrue" },
      { fromNode: "slow-label", fromPort: "out", toNode: "label", toPort: "ifFalse" },
      { fromNode: "is-fast", fromPort: "out", toNode: "branch", toPort: "condition" }
    ]
  };
}

function asNumberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((entry): entry is number => typeof entry === "number" && Number.isFinite(entry)) : [];
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}
