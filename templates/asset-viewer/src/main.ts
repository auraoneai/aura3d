import { AssetManager, GLTFLoader, createGLTFRenderResources, type GLTFAsset } from "@aura3d/assets";
import { createAuraApp, looks } from "@aura3d/engine";
import { LOOK_ID, starterScene } from "./scene";

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

// createAuraApp owns the renderer and frame loop for the viewport; the
// product-studio look supplies its HDRI IBL, shadowed key, AO, grade, bloom.
const app = createAuraApp(canvas, { scene: starterScene, ...looks.appOptions(LOOK_ID) });
window.addEventListener("beforeunload", () => app.dispose());

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
    look: LOOK_ID,
    publicRuntime: ["@aura3d/assets", "AssetManager", "GLTFLoader", "createGLTFRenderResources", "@aura3d/engine", "createAuraApp", "looks.preset"],
  };
  status.textContent = JSON.stringify(result, null, 2);
  resources.dispose();
  await manager.release(handle);
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
    asset: { version: "2.0", generator: "Aura3D asset viewer template" },
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
    /* Licensed UI face, committed with the template (public/fonts/graphik). */
    @font-face { font-family: "Graphik"; src: url("/fonts/graphik/Graphik-Regular-Web.woff2") format("woff2"); font-weight: 400; font-style: normal; font-display: swap; }
    @font-face { font-family: "Graphik"; src: url("/fonts/graphik/Graphik-RegularItalic-Web.woff2") format("woff2"); font-weight: 400; font-style: italic; font-display: swap; }
    @font-face { font-family: "Graphik"; src: url("/fonts/graphik/Graphik-Medium-Web.woff2") format("woff2"); font-weight: 500; font-style: normal; font-display: swap; }
    :root { color-scheme: light; }
    html, body, #app { margin: 0; min-height: 100%; background: #f4f6f9; color: #1c2530; font-family: "Graphik", system-ui, -apple-system, sans-serif; font-synthesis: none; font-size: 13px; line-height: 1.45; }
    .shell { min-height: 100vh; display: grid; grid-template-columns: minmax(0, 1fr) 24rem; }
    /* Dark canvas backdrop is scene content; the side panel is light chrome. */
    canvas { width: 100%; height: 100vh; display: block; background: #0d141b; }
    section { border-left: 1px solid #d8dde5; background: #ffffff; padding: 1.25rem; display: grid; align-content: start; gap: 1rem; }
    h1 { margin: 0; font-size: 1.3rem; font-weight: 500; }
    form { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 0.5rem; }
    input, button { min-height: 2rem; border: 1px solid #c3cad4; background: #ffffff; color: #1c2530; border-radius: 6px; padding: 0 0.65rem; font: inherit; }
    button { background: #1f6feb; border-color: #1f6feb; color: #ffffff; font-weight: 500; cursor: pointer; }
    pre { margin: 0; white-space: pre-wrap; color: #0d5c3f; font-size: 12px; line-height: 1.4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; }
    @media (max-width: 780px) { .shell { grid-template-columns: 1fr; } canvas { height: 64vh; } section { border-left: 0; border-top: 1px solid #d8dde5; } }
  `;
  document.head.append(style);
}
