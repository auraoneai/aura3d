import { CreateNodeCommand, DeleteNodeCommand } from "@galileo3d/editor-runtime";
import { SceneNode } from "@galileo3d/scene";
import type { EditorShell } from "../EditorShell";

export class HierarchyPanel {
  readonly element = document.createElement("section");
  private filter = "";

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel hierarchy-panel";
    this.element.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      const action = target.dataset.action;
      const nodeId = target.dataset.nodeId;
      if (action === "select-node" && nodeId) {
        this.shell.selectNode(nodeId);
      }
      if (action === "toggle-select-node" && nodeId) {
        this.shell.toggleNodeSelection(nodeId);
      }
      if (action === "create-node") {
        void this.createNode();
      }
      if (action === "duplicate-node" && nodeId) {
        this.shell.selectNode(nodeId);
        void this.shell.duplicateSelectedNode();
      }
      if (action === "delete-node" && nodeId) {
        void this.deleteNode(nodeId);
      }
      if (action === "reparent-node" && nodeId) {
        void this.reparentToRoot(nodeId);
      }
      if (action === "move-node-up" && nodeId) {
        this.shell.reorderNode(nodeId, -1);
      }
      if (action === "move-node-down" && nodeId) {
        this.shell.reorderNode(nodeId, 1);
      }
    });
    this.element.addEventListener("input", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.dataset.action === "filter-hierarchy") {
        this.filter = target.value;
        this.render();
      }
    });
    this.element.addEventListener("change", (event) => {
      const target = event.target as HTMLInputElement;
      if (target.dataset.action === "rename-node" && target.dataset.nodeId) {
        void this.shell.renameNode(target.dataset.nodeId, target.value);
      }
    });
    this.element.addEventListener("dragstart", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".hierarchy-row");
      const nodeId = row?.dataset.nodeId;
      if (!nodeId || nodeId === "root" || !event.dataTransfer) {
        return;
      }
      event.dataTransfer.setData("application/x-galileo3d-node", nodeId);
      event.dataTransfer.effectAllowed = "move";
    });
    this.element.addEventListener("dragover", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".hierarchy-row");
      if (row?.dataset.nodeId) {
        event.preventDefault();
        if (event.dataTransfer) {
          event.dataTransfer.dropEffect = "move";
        }
      }
    });
    this.element.addEventListener("drop", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".hierarchy-row");
      const parentId = row?.dataset.nodeId;
      const draggedId = event.dataTransfer?.getData("application/x-galileo3d-node");
      if (!parentId || !draggedId) {
        return;
      }
      event.preventDefault();
      void this.shell.reparentNode(draggedId, parentId === "root" ? null : parentId);
    });
  }

  render(): void {
    const descriptors = this.shell.runtime.flattenHierarchy(this.shell.scene.root)
      .filter((node) => this.filter.length === 0 || node.name.toLowerCase().includes(this.filter.toLowerCase()) || String(node.id).toLowerCase().includes(this.filter.toLowerCase()));
    const selected = new Set(this.shell.runtime.currentSelection().map(String));
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Hierarchy</span>
        <button data-action="create-node">Create</button>
      </div>
      <div class="hierarchy-search">
        <input data-action="filter-hierarchy" aria-label="Search hierarchy" placeholder="Search hierarchy" value="${escapeHtml(this.filter)}">
      </div>
      <div class="hierarchy-list">
        ${descriptors.map((node) => `
          <div class="hierarchy-row ${node.selected ? "is-selected" : ""}" data-node-id="${node.id}" draggable="${node.id === "root" ? "false" : "true"}" style="padding-left:${node.depth * 12}px">
            ${node.id === "root" ? "<span></span>" : `<input type="checkbox" data-action="toggle-select-node" data-node-id="${node.id}" aria-label="Multi-select ${escapeHtml(node.name)}" ${selected.has(String(node.id)) ? "checked" : ""}>`}
            <button data-action="select-node" data-node-id="${node.id}">${escapeHtml(node.name)}</button>
            ${node.id === "root" ? "" : `<input data-action="rename-node" data-node-id="${node.id}" value="${escapeHtml(node.name)}" aria-label="Rename ${escapeHtml(node.name)}">`}
            ${node.id === "root" ? "" : `<button data-action="move-node-up" data-node-id="${node.id}">Up</button><button data-action="move-node-down" data-node-id="${node.id}">Down</button><button data-action="duplicate-node" data-node-id="${node.id}">Duplicate</button><button data-action="reparent-node" data-node-id="${node.id}">Root</button><button data-action="delete-node" data-node-id="${node.id}">Delete</button>`}
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
    this.shell.addConsoleMessage("info", "Created hierarchy node.");
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
    this.shell.addConsoleMessage("info", "Deleted hierarchy node.");
    this.shell.refresh();
  }

  private async reparentToRoot(nodeId: string): Promise<void> {
    await this.shell.reparentNode(nodeId, null);
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
