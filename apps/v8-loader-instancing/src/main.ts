import {
  GLTFLoader,
  LoadContext,
  createGLTFRenderResources,
  evaluateGLTFExtensionSupport,
  type GLTFRenderResources
} from "@galileo3d/assets";
import { G3DRenderer } from "@galileo3d/engine/v9";

declare global {
  interface Window {
    __g3dV8LoaderInstancing?: V8LoaderInstancingRuntime;
  }
}

interface V8LoaderInstancingRuntime {
  readonly appId: "v8-loader-instancing";
  readonly status: "loading" | "ready" | "running" | "error";
  readonly statusLabel: string;
  readonly frameCount: number;
  readonly drawCalls: number;
  readonly fps: number;
  readonly meshCount: number;
  readonly vertexCount: number;
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly instancedRenderableCount: number;
  readonly extensionsUsed: readonly string[];
  readonly unsupportedRequired: readonly string[];
  readonly elapsedMs: number;
  readonly renderer: "g3d-webgl2";
  readonly error?: string;
}

const APP_ID = "v8-loader-instancing" as const;
const WIDTH = 1280;
const HEIGHT = 720;

void run();

async function run(): Promise<void> {
  const root = document.getElementById("app");
  const canvas = document.getElementById("viewport");
  if (!(root instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
    throw new Error(`${APP_ID} requires #app and canvas#viewport.`);
  }
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  drawFallback(canvas);

  const startedAt = performance.now();
  let runtime = createRuntime("loading", "Loading instanced glTF fixture", startedAt);
  let frameCount = 0;
  let fps = 0;
  let fpsFrames = 0;
  let fpsFrom = 0;
  let lastNow = 0;
  let lastUi = 0;

  const publish = (): void => {
    window.__g3dV8LoaderInstancing = runtime;
    renderUi(root, runtime);
  };
  publish();

  try {
    const asset = await new GLTFLoader().load({ url: createInstancingFixtureDataUrl() }, new LoadContext());
    const resources = await createGLTFRenderResources(asset);
    const renderer = await G3DRenderer.create({
      canvas,
      width: WIDTH,
      height: HEIGHT,
      preserveDrawingBuffer: true,
      clearColor: [0.006, 0.008, 0.012, 1]
    });
    const extensionSupport = evaluateGLTFExtensionSupport(asset.loaderDiagnostics.extensionsUsed, asset.loaderDiagnostics.extensionsRequired);
    const instanceStats = countInstances(resources);
    runtime = createRuntime("ready", "Ready", startedAt, {
      meshCount: asset.loaderDiagnostics.meshCount,
      vertexCount: asset.loaderDiagnostics.vertexCount,
      indexCount: asset.loaderDiagnostics.indexCount,
      ...instanceStats,
      extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
      unsupportedRequired: extensionSupport.unsupportedRequired
    });
    publish();

    const render = (now: number): void => {
      try {
        if (lastNow === 0) lastNow = now;
        const delta = Math.max(0, (now - lastNow) / 1000);
        lastNow = now;
        frameCount += 1;
        fpsFrames += 1;
        if (fpsFrom === 0) fpsFrom = now;
        if (now - fpsFrom >= 500) {
          fps = fpsFrames * 1000 / (now - fpsFrom);
          fpsFrames = 0;
          fpsFrom = now;
        }
        const frame = createRendererInput(resources, now / 1000);
        const result = renderer.renderFrame(frame);
        runtime = createRuntime(frameCount === 1 ? "ready" : "running", frameCount === 1 ? "Ready" : "Running", startedAt, {
          frameCount,
          drawCalls: result.diagnostics.drawCalls,
          fps,
          meshCount: asset.loaderDiagnostics.meshCount,
          vertexCount: asset.loaderDiagnostics.vertexCount,
          indexCount: asset.loaderDiagnostics.indexCount,
          ...instanceStats,
          extensionsUsed: asset.loaderDiagnostics.extensionsUsed,
          unsupportedRequired: extensionSupport.unsupportedRequired
        });
        window.__g3dV8LoaderInstancing = runtime;
        if (frameCount === 1 || now - lastUi > 220 || delta === 0) {
          publish();
          lastUi = now;
        }
        requestAnimationFrame(render);
      } catch (error) {
        runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
        publish();
      }
    };
    requestAnimationFrame(render);
  } catch (error) {
    runtime = { ...runtime, status: "error", statusLabel: "Error", error: formatError(error), elapsedMs: Math.round(performance.now() - startedAt) };
    publish();
  }
}

function createRendererInput(resources: GLTFRenderResources, time: number): Parameters<G3DRenderer["renderFrame"]>[0] {
  const input = resources.toRendererInput({ width: WIDTH, height: HEIGHT }, {
    qualityPreset: "studio-preview",
    postprocess: false,
    frame: {
      yawRadians: -0.46 + Math.sin(time * 0.65) * 0.1,
      pitchRadians: -0.2,
      paddingRatio: 0.18,
      nearPadding: 0.2,
      farPadding: 2.4
    }
  });
  return {
    source: input.source,
    camera: input.camera,
    metadata: {
      assetId: APP_ID,
      assetName: "V8 Loader Instancing",
      assetUri: "/apps/v8-loader-instancing/",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 0,
      imageCount: 0,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: ["EXT_mesh_gpu_instancing", "KHR_materials_unlit"]
    }
  };
}

function countInstances(resources: GLTFRenderResources): { readonly instanceCount: number; readonly instancedRenderableCount: number } {
  let instanceCount = 0;
  let instancedRenderableCount = 0;
  for (const { renderable } of resources.scene.collectRenderables()) {
    if (!renderable.instanceTransforms) continue;
    instancedRenderableCount += 1;
    instanceCount += renderable.instanceTransforms.length / 16;
  }
  return { instanceCount, instancedRenderableCount };
}

function createRuntime(
  status: V8LoaderInstancingRuntime["status"],
  statusLabel: string,
  startedAt: number,
  patch: Partial<Omit<V8LoaderInstancingRuntime, "appId" | "status" | "statusLabel" | "elapsedMs" | "renderer">> = {}
): V8LoaderInstancingRuntime {
  return {
    appId: APP_ID,
    status,
    statusLabel,
    frameCount: patch.frameCount ?? 0,
    drawCalls: patch.drawCalls ?? 0,
    fps: patch.fps ?? 0,
    meshCount: patch.meshCount ?? 0,
    vertexCount: patch.vertexCount ?? 0,
    indexCount: patch.indexCount ?? 0,
    instanceCount: patch.instanceCount ?? 0,
    instancedRenderableCount: patch.instancedRenderableCount ?? 0,
    extensionsUsed: patch.extensionsUsed ?? [],
    unsupportedRequired: patch.unsupportedRequired ?? [],
    elapsedMs: Math.round(performance.now() - startedAt),
    renderer: "g3d-webgl2",
    ...(patch.error ? { error: patch.error } : {})
  };
}

function createInstancingFixtureDataUrl(): string {
  const positions = floatBytes([-0.32, -0.28, 0, 0.32, -0.28, 0, 0, 0.34, 0]);
  const normals = floatBytes([0, 0, 1, 0, 0, 1, 0, 0, 1]);
  const indices = uint16Bytes([0, 1, 2]);
  const translations = floatBytes([-0.9, 0, 0, -0.3, 0.22, 0, 0.3, -0.08, 0, 0.9, 0.18, 0]);
  const binary = concatAligned([positions, normals, indices, translations], 4);
  const gltf = {
    asset: { version: "2.0", generator: "Galileo3D V9 V8 loader instancing fixture" },
    extensionsUsed: ["EXT_mesh_gpu_instancing", "KHR_materials_unlit"],
    extensionsRequired: ["EXT_mesh_gpu_instancing"],
    buffers: [{ uri: `data:application/octet-stream;base64,${base64(binary.buffer)}`, byteLength: binary.buffer.byteLength }],
    bufferViews: [
      { buffer: 0, byteOffset: binary.offsets[0], byteLength: positions.byteLength },
      { buffer: 0, byteOffset: binary.offsets[1], byteLength: normals.byteLength },
      { buffer: 0, byteOffset: binary.offsets[2], byteLength: indices.byteLength },
      { buffer: 0, byteOffset: binary.offsets[3], byteLength: translations.byteLength }
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [-0.32, -0.28, 0], max: [0.32, 0.34, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC3" },
      { bufferView: 2, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 3, componentType: 5126, count: 4, type: "VEC3" }
    ],
    materials: [{
      name: "v8-loader-instancing-material",
      pbrMetallicRoughness: { baseColorFactor: [0.18, 0.72, 0.94, 1], roughnessFactor: 0.46, metallicFactor: 0.08 },
      extensions: { KHR_materials_unlit: {} }
    }],
    meshes: [{
      name: "v8-loader-instancing-triangle",
      primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }]
    }],
    nodes: [{
      name: "v8-loader-instancing-node",
      mesh: 0,
      extensions: { EXT_mesh_gpu_instancing: { attributes: { TRANSLATION: 3 } } }
    }],
    scenes: [{ name: "v8-loader-instancing-scene", nodes: [0] }],
    scene: 0
  };
  return `data:model/gltf+json;base64,${base64(new TextEncoder().encode(JSON.stringify(gltf)))}`;
}

function floatBytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Float32Array(values).buffer);
}

function uint16Bytes(values: readonly number[]): Uint8Array {
  return new Uint8Array(new Uint16Array(values).buffer);
}

function concatAligned(parts: readonly Uint8Array[], alignment: number): { readonly buffer: Uint8Array; readonly offsets: readonly number[] } {
  const offsets: number[] = [];
  let cursor = 0;
  for (const part of parts) {
    cursor = Math.ceil(cursor / alignment) * alignment;
    offsets.push(cursor);
    cursor += part.byteLength;
  }
  const buffer = new Uint8Array(cursor);
  parts.forEach((part, index) => buffer.set(part, offsets[index] ?? 0));
  return { buffer, offsets };
}

function base64(bytes: Uint8Array): string {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function renderUi(root: HTMLElement, runtime: V8LoaderInstancingRuntime): void {
  root.innerHTML = `
    <section class="panel">
      <div>
        <h1>V8 Loader Instancing</h1>
        <p>EXT_mesh_gpu_instancing imported as G3D instance transforms and rendered through WebGL2.</p>
      </div>
      <button id="runtime-state" class="is-${runtime.status}" type="button">${escapeHtml(runtime.statusLabel)}</button>
    </section>
    <section class="metrics">
      ${metric("Frames", runtime.frameCount)}
      ${metric("Draw calls", runtime.drawCalls)}
      ${metric("FPS", runtime.fps.toFixed(1))}
      ${metric("Meshes", runtime.meshCount)}
      ${metric("Vertices", runtime.vertexCount)}
      ${metric("Indices", runtime.indexCount)}
      ${metric("Instances", runtime.instanceCount)}
      ${metric("Instanced renderables", runtime.instancedRenderableCount)}
      ${metric("Extensions", runtime.extensionsUsed.join(", ") || "pending")}
      ${metric("Unsupported required", runtime.unsupportedRequired.length)}
    </section>
    ${runtime.error ? `<pre>${escapeHtml(runtime.error)}</pre>` : ""}
  `;
}

function metric(label: string, value: string | number): string {
  return `<span>${escapeHtml(label)}<br><strong>${escapeHtml(String(value))}</strong></span>`;
}

function drawFallback(canvas: HTMLCanvasElement): void {
  const gl = canvas.getContext("webgl2", { antialias: true, alpha: false, preserveDrawingBuffer: true });
  if (!gl) return;
  gl.viewport(0, 0, canvas.width, canvas.height);
  gl.clearColor(0.006, 0.008, 0.012, 1);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.stack ?? error.message : String(error);
}
