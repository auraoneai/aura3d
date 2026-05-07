import { AssetManager, GLTFLoader, createGLTFRenderResources, type GLTFAsset, type GLTFRenderResources } from "@galileo3d/assets";
import { Renderer, type RenderDeviceDiagnostics } from "@galileo3d/rendering";
import { installExampleStyles } from "../shared/exampleHarness.js";

const KHRONOS_BOX_GLB =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf/Models/Box/glTF-Binary/Box.glb";
const KHRONOS_DAMAGED_HELMET_GLTF =
  "https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/DamagedHelmet/glTF/DamagedHelmet.gltf";

interface AssetViewerResult {
  readonly status: "ready" | "error";
  readonly sourceKind?: "inline" | "external" | "custom";
  readonly url?: string;
  readonly meshCount?: number;
  readonly vertexCount?: number;
  readonly indexCount?: number;
  readonly materialCount?: number;
  readonly sceneCount?: number;
  readonly renderGeometryCount?: number;
  readonly renderMaterialCount?: number;
  readonly renderer?: "webgl2";
  readonly diagnostics?: RenderDeviceDiagnostics;
  readonly bounds?: {
    readonly min: readonly [number, number, number];
    readonly max: readonly [number, number, number];
  };
  readonly publicApis?: readonly string[];
  readonly error?: string;
}

declare global {
  interface Window {
    __GALILEO3D_ASSET_VIEWER__?: AssetViewerResult;
  }
}

if (typeof document !== "undefined") {
  installExampleStyles();
  void boot();
}

async function boot(): Promise<void> {
  const root = document.querySelector<HTMLElement>("#app") ?? document.body;
  root.replaceChildren();

  const shell = document.createElement("main");
  shell.className = "example-shell asset-viewer";

  const canvas = document.createElement("canvas");
  canvas.width = 960;
  canvas.height = 540;
  canvas.dataset.testid = "asset-viewer-canvas";

  const panel = document.createElement("section");
  panel.className = "example-panel asset-viewer-panel";

  const title = document.createElement("h1");
  title.textContent = "Asset Viewer";

  const controls = document.createElement("form");
  controls.dataset.testid = "asset-viewer-controls";
  controls.innerHTML = `
    <label>
      <span>Model</span>
      <select name="model" data-testid="asset-viewer-model">
        <option value="inline">Inline Triangle</option>
        <option value="external">Damaged Helmet glTF</option>
        <option value="custom">Custom URL</option>
      </select>
    </label>
    <label>
      <span>URL</span>
      <input name="url" data-testid="asset-viewer-url" />
    </label>
    <button type="submit">Load</button>
  `;

  const status = document.createElement("pre");
  status.dataset.testid = "asset-viewer-status";
  status.textContent = "booting";

  panel.append(title, controls, status);
  shell.append(canvas, panel);
  root.append(shell);
  installAssetViewerStyles();

  const select = controls.querySelector<HTMLSelectElement>("[data-testid='asset-viewer-model']");
  const input = controls.querySelector<HTMLInputElement>("[data-testid='asset-viewer-url']");
  if (!select || !input) throw new Error("Asset viewer controls failed to initialize.");

  const initial = resolveInitialModel();
  select.value = initial.kind;
  input.value = initial.url;

  const manager = new AssetManager({ retries: 1, retryDelayMs: 50 });
  manager.register(new GLTFLoader());
  let loaded: { readonly handle: Awaited<ReturnType<AssetManager["load"]>>; readonly resources: GLTFRenderResources } | undefined;
  const renderer = await Renderer.create({
    backend: "webgl2",
    canvas,
    width: canvas.width,
    height: canvas.height,
    clearColor: [0.016, 0.02, 0.026, 1],
    antialias: true,
    preserveDrawingBuffer: true
  });

  const load = async (kind: "inline" | "external" | "custom", url: string) => {
    try {
      loaded?.resources.dispose();
      if (loaded) await manager.release(loaded.handle);
      status.textContent = "loading";

      const handle = await manager.load<GLTFAsset>(url, { type: "gltf" });
      const resources = await createGLTFRenderResources(handle.value, { imageDecoder: decodePlaceholderImage });
      loaded = { handle, resources };
      const diagnostics = renderLoadedAsset(canvas, renderer, resources, handle.value);
      const result = summarize(kind, url, handle.value, resources, diagnostics);
      publish(result);
      status.textContent = JSON.stringify(result, null, 2);
    } catch (error) {
      const result: AssetViewerResult = {
        status: "error",
        sourceKind: kind,
        url,
        error: error instanceof Error ? error.message : String(error)
      };
      publish(result);
      status.textContent = JSON.stringify(result, null, 2);
    }
  };

  controls.addEventListener("submit", (event) => {
    event.preventDefault();
    const kind = select.value as "inline" | "external" | "custom";
    const url = kind === "inline" ? createInlineTriangleGltfUrl() : kind === "external" ? KHRONOS_DAMAGED_HELMET_GLTF : input.value.trim();
    input.value = url;
    void load(kind, url);
  });

  select.addEventListener("change", () => {
    input.value = select.value === "inline" ? createInlineTriangleGltfUrl() : select.value === "external" ? KHRONOS_DAMAGED_HELMET_GLTF : input.value;
  });

  window.addEventListener("beforeunload", () => {
    loaded?.resources.dispose();
    if (loaded) void manager.release(loaded.handle);
    renderer.dispose();
  });

  await load(initial.kind, initial.url);
}

function resolveInitialModel(): { readonly kind: "inline" | "external" | "custom"; readonly url: string } {
  const params = new URLSearchParams(window.location.search);
  const model = params.get("model");
  const url = params.get("url");
  if (model === "external") return { kind: "external", url: url ?? KHRONOS_DAMAGED_HELMET_GLTF };
  if (model === "custom" && url) return { kind: "custom", url };
  return { kind: "inline", url: createInlineTriangleGltfUrl() };
}

function summarize(
  kind: "inline" | "external" | "custom",
  url: string,
  asset: GLTFAsset,
  resources: GLTFRenderResources,
  diagnostics: RenderDeviceDiagnostics
): AssetViewerResult {
  const firstMesh = asset.meshes[0];
  return {
    status: "ready",
    sourceKind: kind,
    url,
    meshCount: asset.meshes.length,
    vertexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0),
    indexCount: asset.meshes.reduce((sum, mesh) => sum + mesh.geometry.indexCount, 0),
    materialCount: asset.materials.length,
    sceneCount: asset.scenes.length,
    renderGeometryCount: resources.geometryLibrary.size,
    renderMaterialCount: resources.materialLibrary.size,
    renderer: "webgl2",
    diagnostics,
    bounds: firstMesh?.geometry.bounds,
    publicApis: ["AssetManager", "GLTFLoader", "createGLTFRenderResources"]
  };
}

function publish(result: AssetViewerResult): void {
  window.__GALILEO3D_ASSET_VIEWER__ = result;
}

function renderLoadedAsset(
  canvas: HTMLCanvasElement,
  renderer: Renderer,
  resources: GLTFRenderResources,
  asset: GLTFAsset
): RenderDeviceDiagnostics {
  renderer.resize(canvas.width, canvas.height);
  const scene = resources.scene;
  const bounds = asset.meshes[0]?.geometry.bounds;
  const spanX = Math.max(0.1, (bounds?.max[0] ?? 0.5) - (bounds?.min[0] ?? -0.5));
  const spanY = Math.max(0.1, (bounds?.max[1] ?? 0.5) - (bounds?.min[1] ?? -0.5));
  const spanZ = Math.max(0.1, (bounds?.max[2] ?? 0.5) - (bounds?.min[2] ?? -0.5));
  const distance = Math.max(3.2, Math.max(spanX, spanY, spanZ) * 2.8);

  const camera = scene.createPerspectiveCamera({
    name: "asset-viewer-camera",
    fovYRadians: Math.PI / 4,
    aspect: canvas.width / canvas.height,
    near: 0.01,
    far: distance * 8
  });
  camera.transform.setPosition(0, 0, distance);
  scene.root.addChild(camera);

  const key = scene.createLight("directional", "asset-viewer-key");
  key.intensity = 2.4;
  key.color = [1, 0.94, 0.82];
  scene.root.addChild(key);

  const fill = scene.createLight("point", "asset-viewer-fill");
  fill.intensity = 1.4;
  fill.range = distance * 3;
  fill.color = [0.42, 0.72, 1];
  fill.transform.setPosition(-distance * 0.45, distance * 0.35, distance * 0.55);
  scene.root.addChild(fill);

  return renderer.render({
    scene,
    geometryLibrary: resources.geometryLibrary,
    materialLibrary: resources.materialLibrary
  });
}

function decodePlaceholderImage() {
  return {
    width: 1,
    height: 1,
    colorSpace: "srgb" as const,
    data: new Uint8Array([140, 190, 255, 255])
  };
}

function createInlineTriangleGltfUrl(): string {
  const positions = floatBytes([-0.7, -0.45, 0, 0.7, -0.45, 0, 0, 0.75, 0]);
  const colors = floatBytes([0.2, 0.45, 1, 1, 0.15, 0.8, 0.45, 1, 1, 0.72, 0.2, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, colors, indices);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D asset viewer fixture" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: colors.byteLength },
      { buffer: 0, byteOffset: positions.byteLength + colors.byteLength, byteLength: indices.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.45, 0], max: [0.7, 0.75, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC4" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" }
    ],
    materials: [{ name: "asset-viewer-inline-material", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "asset-viewer-inline-triangle", primitives: [{ attributes: { POSITION: 0, COLOR_0: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ name: "asset-viewer-inline-node", mesh: 0 }],
    scenes: [{ name: "asset-viewer-inline-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json,${encodeURIComponent(JSON.stringify(gltf))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 4);
  new Float32Array(bytes.buffer).set(values);
  return bytes;
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  const bytes = new Uint8Array(values.length * 2);
  new Uint16Array(bytes.buffer).set(values);
  return bytes;
}

function concatBytes(...chunks: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(chunks.reduce((total, chunk) => total + chunk.byteLength, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output;
}

function bytesDataUri(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `data:application/octet-stream;base64,${btoa(binary)}`;
}

function installAssetViewerStyles(): void {
  if (document.querySelector("#galileo3d-asset-viewer-styles")) return;
  const style = document.createElement("style");
  style.id = "galileo3d-asset-viewer-styles";
  style.textContent = `
    .asset-viewer-panel form { display: grid; grid-template-columns: minmax(9rem, 12rem) minmax(12rem, 1fr) auto; gap: 0.75rem; align-items: end; }
    .asset-viewer-panel label { display: grid; gap: 0.35rem; color: #c6d0da; font-size: 0.8125rem; }
    .asset-viewer-panel select,
    .asset-viewer-panel input,
    .asset-viewer-panel button { min-height: 2.25rem; border: 1px solid #34424d; background: #101820; color: #eef2f6; border-radius: 6px; padding: 0 0.65rem; font: inherit; }
    .asset-viewer-panel input { min-width: 0; }
    .asset-viewer-panel button { background: #2d6cdf; border-color: #5b91ff; cursor: pointer; }
    @media (max-width: 760px) { .asset-viewer-panel form { grid-template-columns: 1fr; } }
  `;
  document.head.append(style);
}
