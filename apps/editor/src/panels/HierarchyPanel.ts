import { CreateNodeCommand, DeleteNodeCommand, ReparentNodeCommand } from "@galileo3d/editor-runtime";
import { SceneNode } from "@galileo3d/scene";
import type { EditorShell } from "../EditorShell";

export class HierarchyPanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel hierarchy-panel";
    this.element.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      const nodeId = target.dataset.nodeId;
      if (action === "select-node" && nodeId) {
        this.shell.selectNode(nodeId);
      }
      if (action === "create-node") {
        void this.createNode();
      }
      if (action === "delete-node" && nodeId) {
        void this.deleteNode(nodeId);
      }
      if (action === "reparent-node" && nodeId) {
        void this.reparentToRoot(nodeId);
      }
    });
    this.element.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.dataset.action === "rename-node" && target.dataset.nodeId) {
        void this.shell.renameNode(target.dataset.nodeId, target.value);
      }
    });
  }

  render(): void {
    const descriptors = this.shell.runtime.flattenHierarchy(this.shell.scene.root);
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Hierarchy</span>
        <button data-action="create-node">Create</button>
      </div>
      <div class="hierarchy-list">
        ${descriptors.map((node) => `
          <div class="hierarchy-row ${node.selected ? "is-selected" : ""}" style="padding-left:${node.depth * 12}px">
            <button data-action="select-node" data-node-id="${node.id}">${escapeHtml(node.name)}</button>
            ${node.id === "root" ? "" : `<input data-action="rename-node" data-node-id="${node.id}" value="${escapeHtml(node.name)}" aria-label="Rename ${escapeHtml(node.name)}">`}
            ${node.id === "root" ? "" : `<button data-action="reparent-node" data-node-id="${node.id}">Root</button><button data-action="delete-node" data-node-id="${node.id}">Delete</button>`}
          </div>
        `).join("")}
      </div>
    `;
  }

  private async createNode(): Promise<void> {
    const parent = this.shell.selectedNode() ?? this.shell.scene.root;
    const node = new SceneNode({ id: `node-${Date.now().toString(36)}`, name: "New Node" });
    const container = {
      add: (value: SceneNode) => parent.addChild(value),
      remove: (value: SceneNode) => parent.removeChild(value)
    };
    await this.shell.runtime.executeCommand(new CreateNodeCommand(container, node));
    this.shell.scene.registerSubtree(node);
    this.shell.projectFromScene();
    this.shell.selectNode(node.id);
  }

  private async deleteNode(nodeId: string): Promise<void> {
    const node = this.shell.scene.getNodeById(nodeId);
    if (!node || node === this.shell.scene.root) {
      return;
    }
    const parent = node.parent ?? this.shell.scene.root;
    const container = {
      add: (value: SceneNode) => parent.addChild(value),
      remove: (value: SceneNode) => parent.removeChild(value)
    };
    await this.shell.runtime.executeCommand(new DeleteNodeCommand(container, node));
    this.shell.runtime.clearSelection();
    this.shell.projectFromScene();
    this.shell.refresh();
  }

  private async reparentToRoot(nodeId: string): Promise<void> {
    const node = this.shell.scene.getNodeById(nodeId);
    if (!node || node === this.shell.scene.root || node.parent === this.shell.scene.root) {
      return;
    }
    await this.shell.runtime.executeCommand(new ReparentNodeCommand(node, this.shell.scene.root));
    this.shell.projectFromScene();
    this.shell.refresh();
  }
}

function escapeHtml(value: string | number): string {
  return String(value).replace(/[&<>"']/g, (character) => {
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
