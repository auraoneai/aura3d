import { AssetManager, GLTFLoader } from "@aura3d/assets";
import type { EditorAssetRecord } from "../project/ProjectSerializer";
import type { EditorShell } from "../EditorShell";

export class AssetBrowserPanel {
  readonly element = document.createElement("section");
  private readonly assets = new AssetManager();

  constructor(private readonly shell: EditorShell) {
    this.assets.register(new GLTFLoader());
    this.element.className = "panel asset-browser-panel";
    this.element.addEventListener("click", (event) => {
      const target = event.target as HTMLElement;
      if (target.dataset.action === "import-sample-gltf") {
        void this.importSampleGltf();
      }
      if (target.dataset.action === "import-real-gltf") {
        void this.importRealGltf();
      }
      if (target.dataset.action === "place-asset" && target.dataset.assetId) {
        void this.shell.placeAsset(target.dataset.assetId);
      }
      if (target.dataset.action === "reimport-asset" && target.dataset.assetId) {
        void this.reimportAsset(target.dataset.assetId);
      }
      if (target.dataset.action === "delete-asset" && target.dataset.assetId) {
        void this.shell.deleteAsset(target.dataset.assetId);
      }
      if (target.dataset.action === "move-asset" && target.dataset.assetId) {
        void this.shell.moveAsset(target.dataset.assetId, "Imported/Moved");
      }
    });
    this.element.addEventListener("change", (event) => {
      const input = event.target as HTMLInputElement;
      if (input.dataset.action === "rename-asset" && input.dataset.assetId) {
        void this.shell.renameAsset(input.dataset.assetId, input.value);
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
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Assets</span>
        <button data-action="import-sample-gltf">Import glTF</button>
        <button data-action="import-real-gltf">Import Fox GLB</button>
      </div>
      <div class="asset-tree" aria-label="Asset folders">
        ${[...new Set(this.shell.project.assets.map((asset) => asset.folder ?? "Imported"))].map((folder) => `<button>${escapeHtml(folder)}</button>`).join("") || `<span class="muted">Project Assets</span>`}
      </div>
      <div class="asset-list">
        ${this.shell.project.assets.map((asset) => renderAsset(asset)).join("") || `<p class="muted">No imported assets.</p>`}
      </div>
    `;
  }

  private async importSampleGltf(): Promise<void> {
    const uri = createTriangleGltfDataUri();
    const handle = await this.assets.load(uri);
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
    await this.assets.release(handle);
  }

  private async importRealGltf(): Promise<void> {
    const uri = "../../tests/assets/corpus/khronos/Fox/Fox.glb";
    const handle = await this.assets.load(uri);
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
    await this.assets.release(handle);
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
    <article class="asset-card" data-asset-id="${asset.id}" draggable="true">
      <div class="asset-thumbnail" style="background:${escapeHtml(asset.thumbnailColor ?? "#38d99f")}"></div>
      <strong>${escapeHtml(asset.name)}</strong>
      <label>Name <input data-action="rename-asset" data-asset-id="${asset.id}" value="${escapeHtml(asset.name)}" aria-label="Rename asset ${escapeHtml(asset.name)}"></label>
      <span>${escapeHtml(asset.type)} | ${escapeHtml(asset.preview)} | ${escapeHtml(asset.status ?? "imported")}</span>
      <span>rev ${asset.revision ?? 1} | ${escapeHtml(asset.cacheKey ?? `${asset.uri}#rev-${asset.revision ?? 1}`)}</span>
      <small>${asset.diagnostics.map(escapeHtml).join(", ")}</small>
      <details>
        <summary>Dependencies</summary>
        <ul>${(asset.dependencies ?? []).map((dependency) => `<li>${escapeHtml(dependency)}</li>`).join("") || "<li>None</li>"}</ul>
      </details>
      <button data-action="place-asset" data-asset-id="${asset.id}">Place</button>
      <button data-action="reimport-asset" data-asset-id="${asset.id}">Reimport</button>
      <button data-action="move-asset" data-asset-id="${asset.id}">Move</button>
      <button data-action="delete-asset" data-asset-id="${asset.id}">Delete</button>
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
