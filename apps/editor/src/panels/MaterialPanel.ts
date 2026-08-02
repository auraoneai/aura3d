import type { EditorShell } from "../EditorShell";

export class MaterialPanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel material-panel";
    this.element.addEventListener("input", (event) => {
      const input = event.target as HTMLInputElement;
      const path = input.dataset.materialPath;
      if (!path) {
        return;
      }
      void this.shell.updateSelectedProjectNodeField(["material", ...path.split(".")], coerceMaterialValue(path, input.value));
    });
  }

  render(): void {
    const node = this.shell.selectedProjectNode();
    if (!node) {
      this.element.innerHTML = `<div class="panel-title"><span>Material</span></div><p class="muted">Select a node to edit material slots.</p>`;
      return;
    }
    this.element.innerHTML = `
      <div class="panel-title"><span>Material</span><strong>${escapeHtml(node.material.name)}</strong></div>
      <div class="material-editor">
        <label>Base <input data-material-path="baseColor" type="color" value="${escapeHtml(node.material.baseColor)}"></label>
        <label>Metallic <input data-material-path="metallic" type="range" min="0" max="1" step="0.01" value="${node.material.metallic}"></label>
        <label>Roughness <input data-material-path="roughness" type="range" min="0" max="1" step="0.01" value="${node.material.roughness}"></label>
        <label>Base texture <input data-material-path="textureSlots.baseColor" value="${escapeHtml(node.material.textureSlots.baseColor)}"></label>
        <label>Normal texture <input data-material-path="textureSlots.normal" value="${escapeHtml(node.material.textureSlots.normal)}"></label>
        <label>MR texture <input data-material-path="textureSlots.metallicRoughness" value="${escapeHtml(node.material.textureSlots.metallicRoughness)}"></label>
      </div>
    `;
  }
}

function coerceMaterialValue(path: string, value: string): string | number {
  if (path === "metallic" || path === "roughness") {
    return Number(value);
  }
  return value;
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
