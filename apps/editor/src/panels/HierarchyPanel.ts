import { CreateNodeCommand, DeleteNodeCommand } from "@aura3d/editor-runtime";
import { SceneNode } from "@aura3d/scene";
import type { EditorShell } from "../EditorShell";
import { capturePanelFocus, restorePanelFocus } from "./PanelFocus";

export class HierarchyPanel {
  readonly element = document.createElement("section");
  private readonly status = document.createElement("div");
  private readonly error = document.createElement("div");
  private readonly empty = document.createElement("div");
  private readonly list = document.createElement("div");
  private displayedScene: EditorShell["scene"] | undefined;
  private filter = "";
  private parentChoice: { readonly nodeId: string; readonly parentId: string; readonly observedParentId: string } | null = null;
  private reparenting = false;

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel hierarchy-panel";
    this.element.setAttribute("aria-label", "Hierarchy");
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Hierarchy</span>
        <button data-action="create-node">Create</button>
      </div>
      <div class="hierarchy-search">
        <input data-action="filter-hierarchy" aria-label="Search hierarchy" placeholder="Search hierarchy">
      </div>
      <div class="hierarchy-parent">
        <label>Parent of selected node <select data-action="choose-parent"></select></label>
        <button data-action="apply-parent">Set parent</button>
      </div>
    `;
    this.status.className = "panel-feedback";
    this.status.setAttribute("role", "status");
    this.error.className = "panel-feedback";
    this.error.setAttribute("role", "alert");
    this.empty.className = "panel-feedback muted";
    this.empty.setAttribute("role", "status");
    this.list.className = "hierarchy-list";
    this.element.append(this.status, this.error, this.empty, this.list);
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
        void this.reparent(nodeId, null);
      }
      if (action === "apply-parent" && this.parentChoice) {
        void this.reparent(this.parentChoice.nodeId, this.parentChoice.parentId || null);
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
      if (target.dataset.action === "choose-parent") {
        const node = this.shell.selectedNode();
        if (node && node !== this.shell.scene.root) {
          const currentParent = node.parent && node.parent !== this.shell.scene.root ? node.parent.id : "";
          this.parentChoice = { nodeId: node.id, parentId: target.value, observedParentId: currentParent };
        }
      }
    });
    this.element.addEventListener("dragstart", (event) => {
      const row = (event.target as HTMLElement).closest<HTMLElement>(".hierarchy-row");
      const nodeId = row?.dataset.nodeId;
      if (!nodeId || nodeId === "root" || !event.dataTransfer) {
        return;
      }
      event.dataTransfer.setData("application/x-aura3d-node", nodeId);
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
      const draggedId = event.dataTransfer?.getData("application/x-aura3d-node");
      if (!parentId || !draggedId) {
        return;
      }
      event.preventDefault();
      void this.reparent(draggedId, parentId === "root" ? null : parentId);
    });
  }

  render(): void {
    const focused = capturePanelFocus(this.element);
    if (this.displayedScene !== this.shell.scene) {
      if (this.displayedScene && !this.reparenting) {
        this.status.textContent = "";
        this.error.textContent = "";
      }
      this.displayedScene = this.shell.scene;
      this.parentChoice = null;
    }
    const hierarchy = this.shell.runtime.flattenHierarchy(this.shell.scene.root);
    const descriptors = hierarchy
      .filter((node) => this.filter.length === 0 || node.name.toLowerCase().includes(this.filter.toLowerCase()) || String(node.id).toLowerCase().includes(this.filter.toLowerCase()));
    const selected = new Set(this.shell.runtime.currentSelection().map(String));
    const parentSelect = this.element.querySelector<HTMLSelectElement>('[data-action="choose-parent"]')!;
    const applyParent = this.element.querySelector<HTMLButtonElement>('[data-action="apply-parent"]')!;
    const selectedNode = this.shell.selectedNode();
    if (selectedNode && selectedNode !== this.shell.scene.root) {
      const parents = hierarchy.filter((descriptor) => {
        const candidate = this.shell.scene.getNodeById(String(descriptor.id));
        return candidate && candidate !== this.shell.scene.root && candidate !== selectedNode && !selectedNode.isAncestorOf(candidate);
      });
      const currentParent = selectedNode.parent && selectedNode.parent !== this.shell.scene.root ? selectedNode.parent.id : "";
      const choice = this.parentChoice;
      if (!choice || choice.nodeId !== selectedNode.id || choice.observedParentId !== currentParent
        || (choice.parentId !== "" && !parents.some((parent) => String(parent.id) === choice.parentId))) {
        this.parentChoice = { nodeId: selectedNode.id, parentId: currentParent, observedParentId: currentParent };
      }
      parentSelect.innerHTML = `<option value="">Scene root</option>${parents.map((parent) =>
        `<option value="${escapeHtml(parent.id)}">${"— ".repeat(Math.max(0, parent.depth - 1))}${escapeHtml(parent.name)} (${escapeHtml(parent.id)})</option>`
      ).join("")}`;
      parentSelect.value = this.parentChoice!.parentId;
      parentSelect.setAttribute("aria-label", `Parent of ${selectedNode.name}`);
      parentSelect.disabled = false;
      applyParent.disabled = false;
    } else {
      this.parentChoice = null;
      parentSelect.innerHTML = `<option value="">Select a node first</option>`;
      parentSelect.setAttribute("aria-label", "Parent of selected node");
      parentSelect.disabled = true;
      applyParent.disabled = true;
    }
    const emptyMessage = descriptors.length === 0 ? "No matching nodes. Clear the search to see the hierarchy." : "";
    if (this.empty.textContent !== emptyMessage) this.empty.textContent = emptyMessage;
    this.list.innerHTML = descriptors.map((node) => `
      <div class="hierarchy-row ${node.selected ? "is-selected" : ""}" data-node-id="${escapeHtml(node.id)}" draggable="${node.id === "root" ? "false" : "true"}" style="padding-left:${node.depth * 12}px">
        ${node.id === "root" ? "<span></span>" : `<input type="checkbox" data-action="toggle-select-node" data-node-id="${escapeHtml(node.id)}" aria-label="Multi-select ${escapeHtml(node.name)}" ${selected.has(String(node.id)) ? "checked" : ""}>`}
        <button data-action="select-node" data-node-id="${escapeHtml(node.id)}">${escapeHtml(node.name)}</button>
        ${node.id === "root" ? "" : `<input data-action="rename-node" data-node-id="${escapeHtml(node.id)}" value="${escapeHtml(node.name)}" aria-label="Rename ${escapeHtml(node.name)}">`}
        ${node.id === "root" ? "" : `<button data-action="move-node-up" data-node-id="${escapeHtml(node.id)}" aria-label="Move ${escapeHtml(node.name)} up">Up</button><button data-action="move-node-down" data-node-id="${escapeHtml(node.id)}" aria-label="Move ${escapeHtml(node.name)} down">Down</button><button data-action="duplicate-node" data-node-id="${escapeHtml(node.id)}" aria-label="Duplicate ${escapeHtml(node.name)}">Duplicate</button><button data-action="reparent-node" data-node-id="${escapeHtml(node.id)}" aria-label="Move ${escapeHtml(node.name)} to scene root">Root</button><button data-action="delete-node" data-node-id="${escapeHtml(node.id)}" aria-label="Delete ${escapeHtml(node.name)}">Delete</button>`}
      </div>
    `).join("");
    this.syncReparentingState();
    restorePanelFocus(this.element, focused, this.element.querySelector<HTMLElement>('[data-action="create-node"]'));
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

  private async reparent(nodeId: string, parentId: string | null): Promise<void> {
    if (this.reparenting) {
      this.status.textContent = "A hierarchy move is already in progress.";
      return;
    }
    this.error.textContent = "";
    const scene = this.shell.scene;
    const node = scene.getNodeById(nodeId);
    const parent = parentId ? scene.getNodeById(parentId) : scene.root;
    if (!node || node === scene.root || !parent) {
      this.status.textContent = "";
      this.error.textContent = "The node or target parent is no longer available.";
      return;
    }
    if (node === parent || node.isAncestorOf(parent)) {
      this.status.textContent = "";
      this.error.textContent = "A node cannot be moved under itself or one of its descendants.";
      return;
    }
    const parentName = parent === scene.root ? "scene root" : parent.name;
    if (node.parent === parent) {
      this.status.textContent = `${node.name} is already under ${parentName}.`;
      return;
    }
    this.reparenting = true;
    this.status.textContent = `Moving ${node.name}…`;
    this.syncReparentingState();
    try {
      await this.shell.reparentNode(nodeId, parentId);
      if (this.shell.scene !== scene || node.parent !== parent) throw new Error("The node or target parent changed.");
      this.status.textContent = `Moved ${node.name} under ${parentName}.`;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.status.textContent = "";
      const message = `Moving ${node.name} reported an error: ${reason}. Check the hierarchy before retrying.`;
      this.error.textContent = message;
      this.shell.addConsoleMessage("error", message);
    } finally {
      this.reparenting = false;
      if (this.element.isConnected) this.render();
    }
  }

  private syncReparentingState(): void {
    for (const button of this.element.querySelectorAll<HTMLButtonElement>('[data-action="apply-parent"], [data-action="reparent-node"]')) {
      button.setAttribute("aria-disabled", String(this.reparenting));
    }
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
