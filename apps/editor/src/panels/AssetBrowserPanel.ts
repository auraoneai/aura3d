import { AssetManager, GLTFLoader } from "@galileo3d/assets";
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
      if (target.dataset.action === "place-asset" && target.dataset.assetId) {
        void this.shell.placeAsset(target.dataset.assetId);
      }
    });
  }

  render(): void {
    this.element.innerHTML = `
      <div class="panel-title">
        <span>Assets</span>
        <button data-action="import-sample-gltf">Import glTF</button>
      </div>
      <div class="asset-list">
        ${this.shell.project.assets.map((asset) => renderAsset(asset)).join("") || `<p class="muted">No imported assets.</p>`}
      </div>
    `;
  }

  private async importSampleGltf(): Promise<void> {
    const uri = createTriangleGltfDataUri();
    const handle = await this.assets.load(uri);
    const asset: EditorAssetRecord = {
      id: `asset-${Date.now().toString(36)}`,
      name: handle.value.meshes[0]?.name ?? "Imported glTF",
      type: "gltf",
      uri,
      importedAt: new Date().toISOString(),
      preview: `${handle.value.meshes.length} mesh, ${handle.value.materials.length} material`,
      diagnostics: [`Loaded with scale ${this.shell.project.importSettings.scale}`]
    };
    this.shell.addAsset(asset);
    await this.assets.release(handle);
  }
}

function renderAsset(asset: EditorAssetRecord): string {
  return `
    <article class="asset-card" data-asset-id="${asset.id}">
      <strong>${escapeHtml(asset.name)}</strong>
      <span>${escapeHtml(asset.type)} | ${escapeHtml(asset.preview)}</span>
      <small>${asset.diagnostics.map(escapeHtml).join(", ")}</small>
      <button data-action="place-asset" data-asset-id="${asset.id}">Place</button>
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
