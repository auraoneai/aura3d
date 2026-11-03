import { AssetManager, GLTFLoader, type GLTFAsset } from "@aura3d/assets";
import type { EditorAssetRecord } from "../project/ProjectSerializer";
import type { EditorShell } from "../EditorShell";
import { capturePanelFocus, restorePanelFocus } from "./PanelFocus";

export class AssetBrowserPanel {
  readonly element = document.createElement("section");
  private readonly assets = new AssetManager();
  private readonly status = document.createElement("div");
  private readonly error = document.createElement("div");
  private readonly empty = document.createElement("div");
  private readonly tree = document.createElement("div");
  private readonly cards = document.createElement("div");
  private displayedScene: EditorShell["scene"] | undefined;
  private busy = false;

  constructor(private readonly shell: EditorShell) {
    this.assets.register(new GLTFLoader());
    this.element.className = "panel asset-browser-panel";
    this.element.setAttribute("aria-label", "Assets");
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Assets</span>
        <button data-action="import-sample-gltf">Import glTF</button>
        <button data-action="import-real-gltf">Import Fox GLB</button>
      </div>
    `;
    this.status.className = "panel-feedback";
    this.status.setAttribute("role", "status");
    this.error.className = "panel-feedback";
    this.error.setAttribute("role", "alert");
    this.empty.className = "muted";
    this.empty.setAttribute("role", "status");
    this.tree.className = "asset-tree";
    this.tree.setAttribute("aria-label", "Asset folders");
    const list = document.createElement("div");
    list.className = "asset-list";
    list.append(this.empty, this.cards);
    this.element.append(this.status, this.error, this.tree, list);
    this.element.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "import-sample-gltf") {
        void this.runAssetAction("Importing glTF", "Imported glTF.", () => this.importSampleGltf());
        return;
      }
      if (target.dataset.action === "import-real-gltf") {
        void this.runAssetAction("Importing Fox GLB", "Imported Fox GLB.", () => this.importRealGltf());
        return;
      }
      const assetId = target.dataset.assetId;
      if (!assetId || !["place-asset", "reimport-asset", "delete-asset", "move-asset"].includes(target.dataset.action ?? "")) return;
      const asset = this.shell.project.assets.find((candidate) => candidate.id === assetId);
      if (!asset) {
        this.reportError("The selected asset is no longer available.");
        return;
      }
      if (target.dataset.action === "place-asset") void this.runAssetAction(`Placing ${asset.name}`, `Placed ${asset.name}.`, () => this.shell.placeAsset(assetId));
      if (target.dataset.action === "reimport-asset") void this.runAssetAction(`Reimporting ${asset.name}`, `Reimported ${asset.name}.`, () => this.reimportAsset(assetId));
      if (target.dataset.action === "delete-asset") void this.runAssetAction(`Deleting ${asset.name}`, `Deleted ${asset.name}.`, () => this.shell.deleteAsset(assetId));
      if (target.dataset.action === "move-asset") void this.runAssetAction(`Moving ${asset.name}`, `Moved ${asset.name}.`, () => this.shell.moveAsset(assetId, "Imported/Moved"));
    });
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.action === "rename-asset" && input.dataset.assetId) {
        const assetId = input.dataset.assetId;
        const asset = this.shell.project.assets.find((candidate) => candidate.id === assetId);
        if (!asset) {
          this.reportError("The selected asset is no longer available.");
          return;
        }
        const name = input.value;
        void this.runAssetAction(`Renaming ${asset.name}`, `Renamed ${asset.name} to ${name}.`, () => this.shell.renameAsset(assetId, name));
      }
    });
    this.element.addEventListener("dragstart", (event) => {
      const target = event.target as HTMLElement;
      const assetId = target.dataset.assetId;
      if (assetId && event.dataTransfer) {
        event.dataTransfer.setData("application/x-aura3d-asset", assetId);
        event.dataTransfer.effectAllowed = "copy";
      }
    });
  }

  render(): void {
    const focused = capturePanelFocus(this.element);
    if (this.displayedScene !== this.shell.scene) {
      if (this.displayedScene && !this.busy) {
        this.status.textContent = "";
        this.error.textContent = "";
      }
      this.displayedScene = this.shell.scene;
    }
    const assets = this.shell.project.assets;
    this.tree.innerHTML = [...new Set(assets.map((asset) => asset.folder ?? "Imported"))].map((folder) => `<button>${escapeHtml(folder)}</button>`).join("") || `<span class="muted">Project Assets</span>`;
    const emptyMessage = assets.length === 0 ? "No imported assets." : "";
    if (this.empty.textContent !== emptyMessage) this.empty.textContent = emptyMessage;
    this.cards.innerHTML = assets.map((asset) => renderAsset(asset)).join("");
    this.syncBusyState();
    restorePanelFocus(this.element, focused, this.element.querySelector<HTMLElement>('[data-action="import-sample-gltf"]'));
  }

  private async runAssetAction(progress: string, success: string, action: () => Promise<void>): Promise<void> {
    if (this.busy) {
      this.status.textContent = "An asset operation is already in progress.";
      return;
    }
    this.busy = true;
    this.error.textContent = "";
    this.status.textContent = `${progress}…`;
    this.syncBusyState();
    try {
      await action();
      this.status.textContent = success;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.render();
      this.reportError(`${progress} reported an error: ${reason}. Check the project before retrying.`);
      this.shell.addConsoleMessage("error", this.error.textContent ?? reason);
    } finally {
      this.busy = false;
      this.syncBusyState();
    }
  }

  private reportError(message: string): void {
    this.status.textContent = "";
    this.error.textContent = message;
  }

  private syncBusyState(): void {
    this.cards.setAttribute("aria-busy", String(this.busy));
    for (const button of this.element.querySelectorAll<HTMLButtonElement>(".panel-title button, .asset-card button")) {
      button.setAttribute("aria-disabled", String(this.busy));
    }
    for (const input of this.cards.querySelectorAll<HTMLInputElement>('[data-action="rename-asset"]')) {
      input.readOnly = this.busy;
      input.setAttribute("aria-disabled", String(this.busy));
    }
  }

  private async importSampleGltf(): Promise<void> {
    const uri = createTriangleGltfDataUri();
    const scene = this.shell.scene;
    const handle = await this.assets.load<GLTFAsset>(uri, { type: "gltf" });
    try {
      if (this.shell.scene !== scene) throw new Error("The scene changed while loading. Import again in the current project.");
      const settings = this.shell.project.importSettings;
      const id = `asset-${Date.now().toString(36)}`;
      const asset: EditorAssetRecord = {
        id,
        name: handle.value.meshes[0]?.name ?? "Imported glTF",
        type: "gltf",
        uri,
        importedAt: new Date().toISOString(),
        preview: `${handle.value.meshes.length} mesh, ${handle.value.materials.length} material`,
        diagnostics: importDiagnostics(settings),
        folder: "Imported/glTF",
        status: "warning",
        thumbnailColor: "#38d99f",
        dependencies: importDependencies(settings, ["embedded-buffer.bin", "Imported Mint material"]),
        variants: settings.materialVariants ? ["Default", "Mint"] : [],
        animationClips: settings.importAnimations ? [] : [],
        revision: 1,
        cacheKey: `${uri}#rev-1`
      };
      await this.shell.addAsset(asset);
    } finally {
      await this.assets.release(handle);
    }
  }

  private async importRealGltf(): Promise<void> {
    const uri = "../../tests/assets/corpus/khronos/Fox/Fox.glb";
    const scene = this.shell.scene;
    const handle = await this.assets.load<GLTFAsset>(uri, { type: "gltf" });
    try {
      if (this.shell.scene !== scene) throw new Error("The scene changed while loading. Import again in the current project.");
      const settings = this.shell.project.importSettings;
      const materialName = handle.value.materials[0]?.name ?? "Fox Material";
      const id = `asset-real-${Date.now().toString(36)}`;
      const asset: EditorAssetRecord = {
        id,
        name: "Fox.glb",
        type: "gltf",
        uri,
        importedAt: new Date().toISOString(),
        preview: `${handle.value.meshes.length} mesh, ${handle.value.materials.length} material, ${handle.value.animations.length} clips`,
        diagnostics: [`Loaded real glTF`, ...importDiagnostics(settings)],
        folder: "Imported/glTF",
        status: "imported",
        thumbnailColor: "#ff8844",
        dependencies: importDependencies(settings, ["Fox.glb", materialName, handle.value.animations[0]?.name ?? "animation clip"]),
        variants: settings.materialVariants ? ["Default"] : [],
        animationClips: settings.importAnimations ? handle.value.animations.map((clip) => ({
          name: clip.name,
          duration: Number(clip.duration.toFixed(3))
        })) : [],
        revision: 1,
        cacheKey: `${uri}#rev-1`
      };
      await this.shell.addAsset(asset);
    } finally {
      await this.assets.release(handle);
    }
  }

  private async reimportAsset(assetId: string): Promise<void> {
    const asset = this.shell.project.assets.find((candidate) => candidate.id === assetId);
    if (!asset) {
      return;
    }
    const revision = (asset.revision ?? 1) + 1;
    await this.shell.updateAsset({
      ...asset,
      importedAt: new Date().toISOString(),
      revision,
      cacheKey: `${asset.uri}#rev-${revision}`,
      status: "warning",
      diagnostics: [
        `Reimported with ${this.shell.project.importSettings.orientation}`,
        `Scale: ${this.shell.project.importSettings.scale}`,
        `Materials: ${this.shell.project.importSettings.materialMode}`,
        `Textures: ${this.shell.project.importSettings.textureMode}`,
        `Compression: ${this.shell.project.importSettings.compression}`,
        `Animations: ${this.shell.project.importSettings.importAnimations ? "on" : "off"}`,
        `Collider generation: ${this.shell.project.importSettings.generateCollider ? "on" : "off"}`,
        `Cache invalidated ${revision}`
      ]
    });
  }
}

function importDiagnostics(settings: import("../project/ProjectSerializer").EditorImportSettings): string[] {
  return [
    `Scale: ${settings.scale}`,
    `Orientation: ${settings.orientation}`,
    `Color space: ${settings.colorSpace}`,
    `Textures: ${settings.textureMode}`,
    `Compression: ${settings.compression}`,
    `Mipmaps: ${settings.generateMipmaps ? "on" : "off"}`,
    `Animations: ${settings.importAnimations ? "on" : "off"}`,
    `Collider generation: ${settings.generateCollider ? "on" : "off"}`
  ];
}

function importDependencies(settings: import("../project/ProjectSerializer").EditorImportSettings, base: readonly string[]): string[] {
  const dependencies = [...base];
  if (settings.textureMode === "none") {
    return dependencies.filter((dependency) => !dependency.toLowerCase().includes("material"));
  }
  dependencies.push(settings.textureMode === "external" ? "external-texture-set" : "embedded-texture-set");
  if (settings.compression === "ktx2") {
    dependencies.push("compressed-textures.ktx2");
  }
  return dependencies;
}

function renderAsset(asset: EditorAssetRecord): string {
  return `
    <article class="asset-card" data-asset-id="${escapeHtml(asset.id)}" draggable="true">
      <div class="asset-thumbnail" style="background:${escapeHtml(asset.thumbnailColor ?? "#38d99f")}"></div>
      <strong>${escapeHtml(asset.name)}</strong>
      <label>Name <input data-action="rename-asset" data-asset-id="${escapeHtml(asset.id)}" value="${escapeHtml(asset.name)}" aria-label="Rename asset ${escapeHtml(asset.name)}"></label>
      <span>${escapeHtml(asset.type)} | ${escapeHtml(asset.preview)} | ${escapeHtml(asset.status ?? "imported")}</span>
      <span>rev ${asset.revision ?? 1} | ${escapeHtml(asset.cacheKey ?? `${asset.uri}#rev-${asset.revision ?? 1}`)}</span>
      <small>${asset.diagnostics.map(escapeHtml).join(", ")}</small>
      <details>
        <summary>Dependencies</summary>
        <ul>${(asset.dependencies ?? []).map((dependency) => `<li>${escapeHtml(dependency)}</li>`).join("") || "<li>None</li>"}</ul>
      </details>
      <button data-action="place-asset" data-asset-id="${escapeHtml(asset.id)}" aria-label="Place asset ${escapeHtml(asset.name)}">Place</button>
      <button data-action="reimport-asset" data-asset-id="${escapeHtml(asset.id)}" aria-label="Reimport asset ${escapeHtml(asset.name)}">Reimport</button>
      <button data-action="move-asset" data-asset-id="${escapeHtml(asset.id)}" aria-label="Move asset ${escapeHtml(asset.name)}">Move</button>
      <button data-action="delete-asset" data-asset-id="${escapeHtml(asset.id)}" aria-label="Delete asset ${escapeHtml(asset.name)}">Delete</button>
    </article>
  `;
}

function createTriangleGltfDataUri(): string {
  const positions = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
  const indices = new Uint16Array([0, 1, 2]);
  const bytes = new Uint8Array(positions.byteLength + indices.byteLength);
  bytes.set(new Uint8Array(positions.buffer), 0);
  bytes.set(new Uint8Array(indices.buffer), positions.byteLength);
  const binary = Array.from(bytes, (byte) => String.fromCharCode(byte)).join("");
  const bufferUri = `data:application/octet-stream;base64,${btoa(binary)}`;
  const gltf = {
    asset: { version: "2.0" },
    buffers: [{ uri: bufferUri, byteLength: bytes.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{ name: "Imported Mint", pbrMetallicRoughness: { baseColorFactor: [0.2, 0.9, 0.6, 1] } }],
    meshes: [{ name: "sample-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ mesh: 0 }],
    scenes: [{ nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
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
