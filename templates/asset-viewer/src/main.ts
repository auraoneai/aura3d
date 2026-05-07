import { AssetManager, GLTFLoader, createGLTFRenderResources, type GLTFAsset } from "@galileo3d/assets";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing app root.");

root.innerHTML = `
  <main class="shell">
    <canvas width="960" height="540"></canvas>
    <section>
      <h1>Asset Viewer</h1>
      <form>
        <input name="url" aria-label="Model URL" />
        <button type="submit">Load</button>
      </form>
      <pre data-status>booting</pre>
    </section>
  </main>
`;

installStyles();

const canvas = root.querySelector<HTMLCanvasElement>("canvas");
const form = root.querySelector<HTMLFormElement>("form");
const input = root.querySelector<HTMLInputElement>("input");
const status = root.querySelector<HTMLElement>("[data-status]");
if (!canvas || !form || !input || !status) throw new Error("Template shell failed to initialize.");

const manager = new AssetManager({ retries: 1, retryDelayMs: 50 });
manager.register(new GLTFLoader());
input.value = createInlineTriangleGltfUrl();

form.addEventListener("submit", (event) => {
  event.preventDefault();
  void load(input.value.trim());
});

void load(input.value);

async function load(url: string): Promise<void> {
  status.textContent = "loading";
  const handle = await manager.load<GLTFAsset>(url, { type: "gltf" });
  const resources = await createGLTFRenderResources(handle.value, { imageDecoder: decodePlaceholderImage });
  const result = {
    template: "asset-viewer",
    meshCount: handle.value.meshes.length,
    vertexCount: handle.value.meshes.reduce((sum, mesh) => sum + mesh.geometry.vertexCount, 0),
    renderGeometryCount: resources.geometryLibrary.size,
    renderMaterialCount: resources.materialLibrary.size,
    publicRuntime: ["@galileo3d/assets", "AssetManager", "GLTFLoader", "createGLTFRenderResources"],
  };
  status.textContent = JSON.stringify(result, null, 2);
  drawSummary(canvas, result.meshCount, result.vertexCount);
  resources.dispose();
  await manager.release(handle);
}

function drawSummary(canvas: HTMLCanvasElement, meshCount: number, vertexCount: number): void {
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Asset viewer canvas 2D context is unavailable.");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#101820";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#8db6ff";
  context.fillRect(canvas.width * 0.36, canvas.height * 0.25, canvas.width * 0.28, canvas.height * 0.42);
  context.strokeStyle = "#eef2f6";
  context.lineWidth = 2;
  context.strokeRect(canvas.width * 0.36, canvas.height * 0.25, canvas.width * 0.28, canvas.height * 0.42);
  context.fillStyle = "#eef2f6";
  context.font = "20px ui-sans-serif, system-ui, sans-serif";
  context.fillText(`${meshCount} mesh / ${vertexCount} vertices`, 32, 48);
}

function decodePlaceholderImage() {
  return {
    width: 1,
    height: 1,
    colorSpace: "srgb" as const,
    data: new Uint8Array([140, 190, 255, 255]),
  };
}

function createInlineTriangleGltfUrl(): string {
  const positions = floatBytes([-0.7, -0.45, 0, 0.7, -0.45, 0, 0, 0.75, 0]);
  const indices = uint16Bytes([0, 1, 2]);
  const buffer = concatBytes(positions, indices);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D asset viewer template" },
    buffers: [{ uri: bytesDataUri(buffer), byteLength: buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.7, -0.45, 0], max: [0.7, 0.75, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
    ],
    materials: [{ name: "template-unlit", extensions: { KHR_materials_unlit: {} } }],
    meshes: [{ name: "template-triangle", primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ name: "template-node", mesh: 0 }],
    scenes: [{ name: "template-scene", nodes: [0] }],
    scene: 0,
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

function installStyles(): void {
  const style = document.createElement("style");
  style.textContent = `
    html, body, #app { margin: 0; min-height: 100%; background: #101820; color: #eef2f6; font-family: Inter, ui-sans-serif, system-ui, sans-serif; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 24rem; }
    canvas { width: 100%; height: 100vh; display: block; background: #0d141b; }
    section { border-left: 1px solid #30404c; background: #17222b; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1 { margin: 0; font-size: 1.3rem; }
    form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; }
    input, button { min-height: 2.25rem; border: 1px solid #34424d; background: #101820; color: #eef2f6; border-radius: 6px; padding: 0 0.65rem; font: inherit; }
    button { background: #2d6cdf; border-color: #5b91ff; cursor: pointer; }
    pre { margin: 0; white-space: pre-wrap; color: #b8e4b3; font-size: 0.78rem; line-height: 1.4; }
    @media (max-width: 780px) { .shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #30404c; } }
  `;
  document.head.append(style);
}
