import type { EditorImportSettings } from "../project/ProjectSerializer";
import type { EditorShell } from "../EditorShell";

export class ImportSettingsPanel {
  readonly element = document.createElement("section");

  constructor(private readonly shell: EditorShell) {
    this.element.className = "panel import-settings-panel";
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement | HTMLSelectElement;
      const key = input.dataset.setting as keyof EditorImportSettings | undefined;
      if (!key) {
        return;
      }
      const value = input.type === "checkbox" ? (input as HTMLInputElement).checked : input.type === "number" ? Number(input.value) : input.value;
      this.shell.updateImportSetting(key, value as never);
    });
  }

  render(): void {
    const settings = this.shell.project.importSettings;
    this.element.innerHTML = `
      <div class="panel-title"><span>Import Settings</span></div>
      <label>Color space <select data-setting="colorSpace">
        <option value="srgb" ${settings.colorSpace === "srgb" ? "selected" : ""}>sRGB</option>
        <option value="linear" ${settings.colorSpace === "linear" ? "selected" : ""}>Linear</option>
      </select></label>
      <label><input type="checkbox" data-setting="generateMipmaps" ${settings.generateMipmaps ? "checked" : ""}> Generate mipmaps</label>
      <label>Compression <select data-setting="compression">
        <option value="none" ${settings.compression === "none" ? "selected" : ""}>None</option>
        <option value="ktx2" ${settings.compression === "ktx2" ? "selected" : ""}>KTX2</option>
      </select></label>
      <label>Scale <input type="number" step="0.1" min="0.1" data-setting="scale" value="${settings.scale}"></label>
      <label><input type="checkbox" data-setting="importNormals" ${settings.importNormals ? "checked" : ""}> Normals</label>
      <label><input type="checkbox" data-setting="importTangents" ${settings.importTangents ? "checked" : ""}> Tangents</label>
      <label><input type="checkbox" data-setting="importAnimations" ${settings.importAnimations ? "checked" : ""}> Animations</label>
      <label><input type="checkbox" data-setting="materialVariants" ${settings.materialVariants ? "checked" : ""}> Material variants</label>
    `;
  }
}
